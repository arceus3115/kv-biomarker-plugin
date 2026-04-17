const MIN_DURATION_MS = 30_000;

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const durationEl = document.getElementById("duration");
const statusEl = document.getElementById("status");
const findingsEl = document.getElementById("findings");
const volumeMeterEl = document.getElementById("volumeMeter");
const volumeLabelEl = document.getElementById("volumeLabel");
const analysisProgressWrapEl = document.getElementById("analysisProgressWrap");
const analysisProgressFillEl = document.getElementById("analysisProgressFill");
const analysisPhaseEl = document.getElementById("analysisPhase");
const analysisElapsedEl = document.getElementById("analysisElapsed");
const stageUploadFillEl = document.getElementById("stageUploadFill");
const stageUploadStateEl = document.getElementById("stageUploadState");
const stageConvertFillEl = document.getElementById("stageConvertFill");
const stageConvertStateEl = document.getElementById("stageConvertState");
const stageInferFillEl = document.getElementById("stageInferFill");
const stageInferStateEl = document.getElementById("stageInferState");
const resultsSummaryEl = document.getElementById("resultsSummary");
const depressionSeverityEl = document.getElementById("depressionSeverity");
const depressionScoreEl = document.getElementById("depressionScore");
const anxietySeverityEl = document.getElementById("anxietySeverity");
const anxietyScoreEl = document.getElementById("anxietyScore");
const modelMetaEl = document.getElementById("modelMeta");

let mediaRecorder = null;
let chunks = [];
let activeMimeType = "";
let recordingStartTs = 0;
let recordedDurationMs = 0;
let timer = null;
let currentStream = null;
let audioContext = null;
let analyserNode = null;
let volumeData = null;
let volumeRaf = null;
let analysisProgressTimer = null;
let analysisProgressStart = 0;

function setStatus(message) {
  statusEl.textContent = message;
}

function toTitleCase(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "Unknown";
  }
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resetFindingsSummary() {
  resultsSummaryEl.classList.add("hidden");
  depressionSeverityEl.textContent = "-";
  depressionScoreEl.textContent = "Score: -";
  anxietySeverityEl.textContent = "-";
  anxietyScoreEl.textContent = "Score: -";
  modelMetaEl.textContent = "";
}

function renderFindingsSummary(payload) {
  const depression = payload.findings?.depression || {};
  const anxiety = payload.findings?.anxiety || {};

  depressionSeverityEl.textContent = toTitleCase(depression.severity);
  depressionScoreEl.textContent = `Score: ${
    depression.score != null ? depression.score : "-"
  }`;
  anxietySeverityEl.textContent = toTitleCase(anxiety.severity);
  anxietyScoreEl.textContent = `Score: ${anxiety.score != null ? anxiety.score : "-"}`;

  const vendor = payload.vendor || {};
  const quantized = vendor.quantized ? "quantized" : "raw";
  modelMetaEl.textContent = `Model: ${vendor.model || "unknown"} (${quantized})`;
  resultsSummaryEl.classList.remove("hidden");
}

function setAnalysisProgress(value, phase) {
  const clamped = Math.max(0, Math.min(value, 100));
  analysisProgressFillEl.style.width = `${clamped}%`;
  analysisPhaseEl.textContent = phase;
}

function setStageVisual(fillEl, stateEl, value, state) {
  const clamped = Math.max(0, Math.min(value, 100));
  fillEl.style.width = `${clamped}%`;
  fillEl.classList.remove("running", "done", "failed");
  if (state === "running") {
    fillEl.classList.add("running");
  } else if (state === "done") {
    fillEl.classList.add("done");
  } else if (state === "failed") {
    fillEl.classList.add("failed");
  }

  const label =
    state === "done"
      ? "Done"
      : state === "running"
      ? "Running"
      : state === "failed"
      ? "Failed"
      : "Pending";
  stateEl.textContent = label;
}

function resetStageProgress() {
  setStageVisual(stageUploadFillEl, stageUploadStateEl, 0, "pending");
  setStageVisual(stageConvertFillEl, stageConvertStateEl, 0, "pending");
  setStageVisual(stageInferFillEl, stageInferStateEl, 0, "pending");
}

function updateStagesFromBackend(payload) {
  const phase = payload.phase;
  const status = payload.status;

  if (phase === "queued") {
    setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");
    setStageVisual(stageConvertFillEl, stageConvertStateEl, 0, "pending");
    setStageVisual(stageInferFillEl, stageInferStateEl, 0, "pending");
    return;
  }

  if (phase === "converting_audio") {
    setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");
    setStageVisual(stageConvertFillEl, stageConvertStateEl, 50, "running");
    setStageVisual(stageInferFillEl, stageInferStateEl, 0, "pending");
    return;
  }

  if (phase === "waiting_for_inference_slot") {
    setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");
    setStageVisual(stageConvertFillEl, stageConvertStateEl, 0, "pending");
    setStageVisual(stageInferFillEl, stageInferStateEl, 20, "running");
    return;
  }

  if (phase === "model_service_restarting") {
    setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");
    setStageVisual(stageConvertFillEl, stageConvertStateEl, 100, "done");
    setStageVisual(stageInferFillEl, stageInferStateEl, 70, "running");
    return;
  }

  if (phase === "running_inference") {
    setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");
    setStageVisual(stageConvertFillEl, stageConvertStateEl, 100, "done");
    setStageVisual(stageInferFillEl, stageInferStateEl, 60, "running");
    return;
  }

  if (status === "completed") {
    setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");
    setStageVisual(stageConvertFillEl, stageConvertStateEl, 100, "done");
    setStageVisual(stageInferFillEl, stageInferStateEl, 100, "done");
    return;
  }

  if (status === "failed") {
    if (phase === "converting_audio") {
      setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");
      setStageVisual(stageConvertFillEl, stageConvertStateEl, 100, "failed");
      setStageVisual(stageInferFillEl, stageInferStateEl, 0, "pending");
    } else if (phase === "running_inference") {
      setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");
      setStageVisual(stageConvertFillEl, stageConvertStateEl, 100, "done");
      setStageVisual(stageInferFillEl, stageInferStateEl, 100, "failed");
    } else {
      setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "failed");
    }
  }
}

function startAnalysisProgress() {
  if (analysisProgressTimer) {
    clearInterval(analysisProgressTimer);
  }
  analysisProgressWrapEl.classList.remove("hidden");
  analysisProgressStart = performance.now();
  setAnalysisProgress(3, "Uploading audio...");
  analysisElapsedEl.textContent = "0.0s";
  resetStageProgress();
  setStageVisual(stageUploadFillEl, stageUploadStateEl, 60, "running");

  analysisProgressTimer = setInterval(() => {
    const elapsedMs = performance.now() - analysisProgressStart;
    const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
    analysisElapsedEl.textContent = `${elapsedSeconds}s`;
  }, 200);
}

function finishAnalysisProgress(ok) {
  if (analysisProgressTimer) {
    clearInterval(analysisProgressTimer);
    analysisProgressTimer = null;
  }
  setAnalysisProgress(ok ? 100 : 100, ok ? "Completed" : "Failed");
  if (ok) {
    setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");
    setStageVisual(stageConvertFillEl, stageConvertStateEl, 100, "done");
    setStageVisual(stageInferFillEl, stageInferStateEl, 100, "done");
  } else if (stageInferStateEl.textContent === "Running") {
    setStageVisual(stageInferFillEl, stageInferStateEl, 100, "failed");
  }
}

function phaseLabel(phase) {
  switch (phase) {
    case "queued":
      return "Queued";
    case "waiting_for_inference_slot":
      return "Waiting for model slot";
    case "model_service_restarting":
      return "Model service restarting";
    case "converting_audio":
      return "Converting audio";
    case "running_inference":
      return "Running model inference";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Processing";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollAnalysisStatus(requestId) {
  while (true) {
    const response = await fetch(`/api/findings/${encodeURIComponent(requestId)}/status`);

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        `Status check failed (${response.status}): response was not JSON.`
      );
    }

    if (!response.ok) {
      throw new Error(payload.details || payload.message || "Status check failed.");
    }

    const progress =
      typeof payload.progress === "number" ? payload.progress : 0;
    setAnalysisProgress(progress, phaseLabel(payload.phase));
    updateStagesFromBackend(payload);

    if (payload.status === "completed") {
      return payload;
    }
    if (payload.status === "failed") {
      const error = payload.error || {};
      throw new Error(error.details || error.message || "Inference failed.");
    }

    await sleep(1000);
  }
}

function updateDurationLabel() {
  const ms = recordingStartTs ? Date.now() - recordingStartTs : recordedDurationMs;
  durationEl.textContent = `${(ms / 1000).toFixed(1)}s`;
}

function setVolumeLevel(level) {
  const normalized = Math.max(0, Math.min(level, 1));
  volumeMeterEl.style.width = `${Math.round(normalized * 100)}%`;
  if (normalized < 0.05) {
    volumeLabelEl.textContent = "silent";
  } else if (normalized < 0.2) {
    volumeLabelEl.textContent = "low";
  } else if (normalized < 0.5) {
    volumeLabelEl.textContent = "medium";
  } else {
    volumeLabelEl.textContent = "high";
  }
}

function stopVolumeMonitor() {
  if (volumeRaf) {
    cancelAnimationFrame(volumeRaf);
    volumeRaf = null;
  }
  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }
  volumeData = null;
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  setVolumeLevel(0);
}

function startVolumeMonitor(stream) {
  const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextImpl) {
    volumeLabelEl.textContent = "unsupported";
    return;
  }

  audioContext = new AudioContextImpl();
  const source = audioContext.createMediaStreamSource(stream);
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 1024;
  source.connect(analyserNode);
  volumeData = new Uint8Array(analyserNode.fftSize);

  const renderVolume = () => {
    if (!analyserNode || !volumeData) {
      return;
    }

    analyserNode.getByteTimeDomainData(volumeData);
    let sumSquares = 0;
    for (let i = 0; i < volumeData.length; i += 1) {
      const centered = (volumeData[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / volumeData.length);
    setVolumeLevel(Math.min(rms * 4, 1));
    volumeRaf = requestAnimationFrame(renderVolume);
  };

  renderVolume();
}

function bestMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/wav",
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

async function startRecording() {
  findingsEl.textContent = "No findings yet.";
  resetFindingsSummary();
  analysisProgressWrapEl.classList.add("hidden");
  resetStageProgress();
  chunks = [];
  recordedDurationMs = 0;
  activeMimeType = bestMimeType() || "";

  if (!activeMimeType) {
    setStatus("This browser does not support WEBM/WAV recording.");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  currentStream = stream;
  mediaRecorder = new MediaRecorder(stream, { mimeType: activeMimeType });
  startVolumeMonitor(stream);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
      currentStream = null;
    }
    stopVolumeMonitor();
    recordedDurationMs = Date.now() - recordingStartTs;
    recordingStartTs = 0;
    clearInterval(timer);
    timer = null;
    updateDurationLabel();

    if (recordedDurationMs >= MIN_DURATION_MS) {
      analyzeBtn.disabled = false;
      setStatus("Recording complete. Ready to analyze.");
    } else {
      analyzeBtn.disabled = true;
      setStatus("Recording is too short. Please record at least 30 seconds.");
    }
  };

  recordingStartTs = Date.now();
  timer = setInterval(updateDurationLabel, 100);
  mediaRecorder.start();
  startBtn.disabled = true;
  stopBtn.disabled = false;
  analyzeBtn.disabled = true;
  setStatus("Recording in progress...");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

async function analyzeRecording() {
  if (!chunks.length || recordedDurationMs < MIN_DURATION_MS) {
    setStatus("Cannot analyze: recording is missing or too short.");
    return;
  }

  analyzeBtn.disabled = true;
  setStatus("Sending recording to backend...");
  startAnalysisProgress();

  const audioBlob = new Blob(chunks, { type: activeMimeType || "audio/webm" });
  const extension = activeMimeType.includes("wav") ? "wav" : "webm";
  const file = new File([audioBlob], `recording.${extension}`, {
    type: audioBlob.type,
  });

  const formData = new FormData();
  formData.append("audio", file);
  formData.append("durationMs", String(recordedDurationMs));

  try {
    const startResponse = await fetch("/api/findings", {
      method: "POST",
      body: formData,
    });

    let startPayload;
    try {
      startPayload = await startResponse.json();
    } catch {
      throw new Error(
        `HTTP ${startResponse.status}: response was not JSON (check server logs).`
      );
    }

    if (!startResponse.ok) {
      finishAnalysisProgress(false);
      findingsEl.textContent = JSON.stringify(startPayload, null, 2);
      const detail =
        startPayload.details != null && String(startPayload.details).length > 0
          ? String(startPayload.details)
          : null;
      const summary =
        startPayload.message != null && String(startPayload.message).length > 0
          ? String(startPayload.message)
          : null;
      const elapsedMs = Math.round(performance.now() - analysisProgressStart);
      setStatus(
        `${detail || summary || `Request failed (${startResponse.status}).`} [${elapsedMs}ms]`
      );
      return;
    }
    setStageVisual(stageUploadFillEl, stageUploadStateEl, 100, "done");

    const requestId = startPayload.requestId;
    if (!requestId) {
      throw new Error("Backend did not return requestId for status polling.");
    }

    const payload = await pollAnalysisStatus(requestId);
    finishAnalysisProgress(true);
    findingsEl.textContent = JSON.stringify(payload.result, null, 2);
    renderFindingsSummary(payload.result);
    const elapsedMs = Math.round(performance.now() - analysisProgressStart);
    setStatus(`Analysis complete (${elapsedMs}ms).`);
  } catch (error) {
    finishAnalysisProgress(false);
    findingsEl.textContent = JSON.stringify(
      {
        error: "analysis_failed",
        message: error.message,
        hint: "If this repeats, reduce audio length or increase Docker memory limit.",
      },
      null,
      2
    );
    setStatus("Analysis failed.");
  } finally {
    analyzeBtn.disabled = false;
    // Ephemeral handling: clear in-memory chunks after submission.
    chunks = [];
  }
}

startBtn.addEventListener("click", () => {
  startRecording().catch((error) => {
    stopVolumeMonitor();
    setStatus(`Could not start recording: ${error.message}`);
    startBtn.disabled = false;
    stopBtn.disabled = true;
  });
});
stopBtn.addEventListener("click", stopRecording);
analyzeBtn.addEventListener("click", () => {
  analyzeRecording().catch((error) => {
    setStatus(`Could not analyze recording: ${error.message}`);
  });
});
