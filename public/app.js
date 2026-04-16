const MIN_DURATION_MS = 30_000;

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const durationEl = document.getElementById("duration");
const statusEl = document.getElementById("status");
const findingsEl = document.getElementById("findings");

let mediaRecorder = null;
let chunks = [];
let activeMimeType = "";
let recordingStartTs = 0;
let recordedDurationMs = 0;
let timer = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function updateDurationLabel() {
  const ms = recordingStartTs ? Date.now() - recordingStartTs : recordedDurationMs;
  durationEl.textContent = `${(ms / 1000).toFixed(1)}s`;
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
  mediaRecorder = new MediaRecorder(stream, { mimeType: activeMimeType });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
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
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || "Unknown backend error");
    }

    findingsEl.textContent = JSON.stringify(payload, null, 2);
    setStatus("Analysis complete.");
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
