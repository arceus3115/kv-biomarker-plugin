const MIN_DURATION_MS = 30_000;

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const durationEl = document.getElementById("duration");
const statusEl = document.getElementById("status");
const findingsEl = document.getElementById("findings");
const volumeMeterEl = document.getElementById("volumeMeter");
const volumeLabelEl = document.getElementById("volumeLabel");

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

function setStatus(message) {
  statusEl.textContent = message;
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
  const analyzeStartedAt = performance.now();

  const audioBlob = new Blob(chunks, { type: activeMimeType || "audio/webm" });
  const extension = activeMimeType.includes("wav") ? "wav" : "webm";
  const file = new File([audioBlob], `recording.${extension}`, {
    type: audioBlob.type,
  });

  const formData = new FormData();
  formData.append("audio", file);
  formData.append("durationMs", String(recordedDurationMs));

  try {
    const response = await fetch("/api/findings", {
      method: "POST",
      body: formData,
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        `HTTP ${response.status}: response was not JSON (check server logs).`
      );
    }

    if (!response.ok) {
      findingsEl.textContent = JSON.stringify(payload, null, 2);
      const detail =
        payload.details != null && String(payload.details).length > 0
          ? String(payload.details)
          : null;
      const summary =
        payload.message != null && String(payload.message).length > 0
          ? String(payload.message)
          : null;
      const elapsedMs = Math.round(performance.now() - analyzeStartedAt);
      setStatus(
        `${detail || summary || `Request failed (${response.status}).`} [${elapsedMs}ms]`
      );
      return;
    }

    findingsEl.textContent = JSON.stringify(payload, null, 2);
    const elapsedMs = Math.round(performance.now() - analyzeStartedAt);
    setStatus(`Analysis complete (${elapsedMs}ms).`);
  } catch (error) {
    findingsEl.textContent = JSON.stringify(
      {
        error: "analysis_failed",
        message: error.message,
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
