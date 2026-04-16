const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { normalizeFindings } = require("./normalizeKvResponse");

const ACCEPTED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
]);

function createUploader(maxBytes) {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxBytes,
      files: 1,
    },
  });
}

function createApp({ kvClient, uploadConfig }) {
  const app = express();
  const uploader = createUploader(uploadConfig.maxBytes);

  app.use(express.static(path.join(process.cwd(), "public")));
  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/findings", uploader.single("audio"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "audio_file_required",
          message: "Attach an audio file under the 'audio' form field.",
        });
      }

      if (!ACCEPTED_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(415).json({
          error: "unsupported_audio_type",
          message: "Only WEBM or WAV uploads are supported.",
        });
      }

      const durationMs = Number.parseInt(req.body.durationMs, 10);
      if (!Number.isFinite(durationMs) || durationMs < uploadConfig.minDurationMs) {
        return res.status(400).json({
          error: "audio_too_short",
          message: `Audio must contain at least ${Math.round(
            uploadConfig.minDurationMs / 1000
          )} seconds of speech for this POC.`,
        });
      }

      const userId = req.body.userId || crypto.randomUUID();
      const sessionId = await kvClient.initiate({ userId });

      await kvClient.predict({
        sessionId,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        filename: req.file.originalname || "recording.webm",
      });

      const kvResult = await kvClient.pollResult(sessionId);
      const normalized = normalizeFindings({ ...kvResult, session_id: sessionId });

      return res.status(200).json(normalized);
    } catch (error) {
      return res.status(502).json({
        error: "kv_inference_failed",
        message: "Unable to retrieve findings from KV.",
        details: error.message,
      });
    }
  });

  return app;
}

module.exports = {
  createApp,
};
