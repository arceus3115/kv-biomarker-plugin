function parseNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  port: parseNumber(process.env.PORT, 3000),
  localModel: {
    serviceUrl: process.env.LOCAL_MODEL_SERVICE_URL || "http://127.0.0.1:8001",
    inferPath: process.env.LOCAL_MODEL_INFER_PATH || "/infer",
    timeoutMs: parseNumber(process.env.LOCAL_MODEL_TIMEOUT_MS, 120000),
    quantize: process.env.LOCAL_MODEL_QUANTIZE !== "false",
  },
  upload: {
    maxBytes: parseNumber(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
    minDurationMs: parseNumber(process.env.MIN_AUDIO_DURATION_MS, 30000),
  },
};

module.exports = {
  config,
};
