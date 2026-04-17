const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");
const { normalizeFindings } = require("./normalizeFindings");

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

function createApp({ localModelClient, uploadConfig }) {
  const app = express();
  const uploader = createUploader(uploadConfig.maxBytes);

  app.use(express.static(path.join(process.cwd(), "public")));
  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/findings", uploader.single("audio"), async (req, res) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "audio_file_required",
          requestId,
          message: "Attach an audio file under the 'audio' form field.",
        });
      }

      if (!ACCEPTED_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(415).json({
          error: "unsupported_audio_type",
          requestId,
          message: "Only WEBM or WAV uploads are supported.",
        });
      }

      const durationMs = Number.parseInt(req.body.durationMs, 10);
      if (!Number.isFinite(durationMs) || durationMs < uploadConfig.minDurationMs) {
        return res.status(400).json({
          error: "audio_too_short",
          requestId,
          message: `Audio must contain at least ${Math.round(
            uploadConfig.minDurationMs / 1000
          )} seconds of speech for this POC.`,
        });
      }

      console.log(
        `[findings:${requestId}] received upload mime=${req.file.mimetype} bytes=${req.file.size} durationMs=${durationMs}`
      );

      const localResult = await localModelClient.infer({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        filename: req.file.originalname || "recording.webm",
        durationMs,
      });
      const normalized = normalizeFindings(localResult);
      const elapsedMs = Date.now() - startedAt;
      console.log(`[findings:${requestId}] completed in ${elapsedMs}ms`);

      return res.status(200).json(normalized);
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      console.error(
        `[findings:${requestId}] failed in ${elapsedMs}ms: ${error.message}`
      );
      return res.status(502).json({
        error: "local_inference_failed",
        requestId,
        message: "Unable to retrieve findings from local DAM service.",
        details: error.message,
      });
    }
  });

  return app;
}

module.exports = {
  createApp,
};
