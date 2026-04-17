import logging
import os
import tempfile
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


@app.get("/health")
def health():
    return {"ok": True, "model": "KintsugiHealth/dam"}


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

    if audio.content_type not in {
        "audio/webm",
        "audio/wav",
        "audio/x-wav",
        "audio/wave",
    }:
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
    suffix = ".wav" if "wav" in (audio.content_type or "") else ".webm"
    temp_path = None

    try:
        # The published DAM pipeline exposes run_on_file(path), so we use
        # short-lived temp files and remove them immediately after inference.
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(content)
            temp_path = temp_file.name

        result = pipeline.run_on_file(temp_path, quantize=quantize)
    except Exception as exc:
        elapsed_ms = int((time.time() - started_at) * 1000)
        logger.exception("[infer:%s] failed in %sms", request_id, elapsed_ms)
        raise HTTPException(
            status_code=500, detail=f"Inference failed [{request_id}]: {exc}"
        ) from exc
    finally:
        if temp_path:
            with suppress(FileNotFoundError):
                os.remove(temp_path)

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
