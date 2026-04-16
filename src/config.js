function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildResultPath(template, sessionId) {
  return template.replace("{session_id}", encodeURIComponent(sessionId));
}

const config = {
  port: parseNumber(process.env.PORT, 3000),
  kv: {
    baseUrl: process.env.KV_API_BASE_URL || "https://api.kintsugihealth.com",
    apiKey: process.env.KV_API_KEY || "",
    initiatePath: process.env.KV_INITIATE_PATH || "/v1/initiate",
    predictPath: process.env.KV_PREDICT_PATH || "/v2/prediction/",
    resultPathTemplate:
      process.env.KV_RESULT_PATH_TEMPLATE || "/v2/predict/sessions/{session_id}",
    pollIntervalMs: parseNumber(process.env.KV_POLL_INTERVAL_MS, 1000),
    pollTimeoutMs: parseNumber(process.env.KV_POLL_TIMEOUT_MS, 30000),
  },
  upload: {
    maxBytes: parseNumber(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
    minDurationMs: parseNumber(process.env.MIN_AUDIO_DURATION_MS, 30000),
  },
};

module.exports = {
  config,
  buildResultPath,
};
