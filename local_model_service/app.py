import logging
import os
import subprocess
import tempfile
import threading
import time
import uuid
from contextlib import suppress

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

try:
    from pipeline import Pipeline
except ImportError as exc:
    raise RuntimeError(
        "Kintsugi DAM pipeline import failed. Ensure this service runs inside "
        "the DAM environment where `pipeline.py` is available."
    ) from exc

app = FastAPI(title="Local DAM Inference Service")
pipeline = Pipeline()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("local_model_service")
jobs_lock = threading.Lock()
jobs: dict[str, dict] = {}
inference_semaphore = threading.Semaphore(1)
MAX_AUDIO_DURATION_MS = int(os.getenv("MAX_AUDIO_DURATION_MS", "180000"))
MAX_INFERENCE_SECONDS = int(os.getenv("MAX_INFERENCE_SECONDS", "90"))


def convert_audio_to_wav(input_path: str, output_path: str, max_seconds: int | None = None) -> None:
    """Normalize uploaded audio to 16kHz mono PCM WAV for DAM inference."""
    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "16000",
    ]
    if max_seconds and max_seconds > 0:
        command.extend(["-t", str(max_seconds)])
    command.append(output_path)

    try:
        subprocess.run(
            command,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg is not installed in the model service image.") from exc
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        raise RuntimeError(f"ffmpeg conversion failed: {stderr}") from exc


def is_supported_mime(content_type: str | None) -> bool:
    return content_type in {
        "audio/webm",
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
    }


def update_job(job_id: str, **fields):
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(fields)


def process_audio(content: bytes, content_type: str, quantize: bool):
    suffix = ".wav" if "wav" in (content_type or "") else ".webm"
    temp_path = None
    converted_wav_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as wav_file:
            converted_wav_path = wav_file.name

        convert_audio_to_wav(
            temp_path, converted_wav_path, max_seconds=MAX_INFERENCE_SECONDS
        )
        return pipeline.run_on_file(converted_wav_path, quantize=quantize)
    finally:
        if temp_path:
            with suppress(FileNotFoundError):
                os.remove(temp_path)
        if converted_wav_path:
            with suppress(FileNotFoundError):
                os.remove(converted_wav_path)


def run_job(job_id: str, content: bytes, content_type: str, quantize: bool):
    started_at = time.time()

    try:
        update_job(
            job_id, status="running", phase="waiting_for_inference_slot", progress=10
        )

        with inference_semaphore:
            update_job(job_id, status="running", phase="converting_audio", progress=25)
            suffix = ".wav" if "wav" in (content_type or "") else ".webm"
            temp_path = None
            converted_wav_path = None

            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_file.write(content)
                temp_path = temp_file.name

            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as wav_file:
                converted_wav_path = wav_file.name

            convert_audio_to_wav(
                temp_path, converted_wav_path, max_seconds=MAX_INFERENCE_SECONDS
            )
            update_job(job_id, phase="running_inference", progress=70)
            result = pipeline.run_on_file(converted_wav_path, quantize=quantize)

        elapsed_ms = int((time.time() - started_at) * 1000)
        update_job(
            job_id,
            status="completed",
            phase="completed",
            progress=100,
            result={
                "depression": result.get("depression"),
                "anxiety": result.get("anxiety"),
                "quantized": bool(quantize),
            },
            elapsed_ms=elapsed_ms,
        )
    except Exception as exc:
        elapsed_ms = int((time.time() - started_at) * 1000)
        logger.exception("[job:%s] failed in %sms", job_id, elapsed_ms)
        update_job(
            job_id,
            status="failed",
            phase="failed",
            progress=100,
            error=str(exc),
            elapsed_ms=elapsed_ms,
        )
    finally:
        if "temp_path" in locals() and temp_path:
            with suppress(FileNotFoundError):
                os.remove(temp_path)
        if "converted_wav_path" in locals() and converted_wav_path:
            with suppress(FileNotFoundError):
                os.remove(converted_wav_path)


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": "KintsugiHealth/dam",
        "limits": {
            "max_audio_duration_ms": MAX_AUDIO_DURATION_MS,
            "max_inference_seconds": MAX_INFERENCE_SECONDS,
        },
    }


@app.post("/jobs")
async def create_job(
    audio: UploadFile = File(...),
    quantize: bool = Form(True),
    duration_ms: int = Form(0),
):
    if duration_ms < 30_000:
        raise HTTPException(
            status_code=400,
            detail="Audio must contain at least 30 seconds of speech.",
        )
    if not is_supported_mime(audio.content_type):
        raise HTTPException(status_code=415, detail="Unsupported audio type.")

    content = await audio.read()
    job_id = uuid.uuid4().hex
    created_at = int(time.time() * 1000)

    with jobs_lock:
        jobs[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "phase": "queued",
            "progress": 5,
            "created_at": created_at,
            "result": None,
            "error": None,
            "elapsed_ms": None,
        }

    thread = threading.Thread(
        target=run_job, args=(job_id, content, audio.content_type or "", quantize), daemon=True
    )
    thread.start()
    return jobs[job_id]


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.post("/infer")
async def infer(
    audio: UploadFile = File(...),
    quantize: bool = Form(True),
    duration_ms: int = Form(0),
):
    request_id = uuid.uuid4().hex[:8]
    started_at = time.time()
    if duration_ms < 30_000:
        raise HTTPException(
            status_code=400,
            detail="Audio must contain at least 30 seconds of speech.",
        )

    if not is_supported_mime(audio.content_type):
        raise HTTPException(status_code=415, detail="Unsupported audio type.")

    content = await audio.read()
    logger.info(
        "[infer:%s] request mime=%s bytes=%s duration_ms=%s quantize=%s",
        request_id,
        audio.content_type,
        len(content),
        duration_ms,
        quantize,
    )
    try:
        result = process_audio(content, audio.content_type or "", quantize)
    except Exception as exc:
        elapsed_ms = int((time.time() - started_at) * 1000)
        logger.exception("[infer:%s] failed in %sms", request_id, elapsed_ms)
        raise HTTPException(
            status_code=500, detail=f"Inference failed [{request_id}]: {exc}"
        ) from exc

    elapsed_ms = int((time.time() - started_at) * 1000)
    logger.info(
        "[infer:%s] completed in %sms depression=%s anxiety=%s",
        request_id,
        elapsed_ms,
        result.get("depression"),
        result.get("anxiety"),
    )

    return {
        "depression": result.get("depression"),
        "anxiety": result.get("anxiety"),
        "quantized": bool(quantize),
    }
