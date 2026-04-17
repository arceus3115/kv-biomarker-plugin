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
const TERMINAL_STATUSES = new Set(["completed", "failed"]);
const TRANSIENT_FAILURE_GRACE_MS = 30000;
const MAX_JOB_RESTART_ATTEMPTS = 1;

function isJobNotFoundError(error) {
  if (!error || typeof error.message !== "string") {
    return false;
  }
  return error.message.toLowerCase().includes("job not found");
}

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
  const jobs = new Map();

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

      const job = await localModelClient.startInferenceJob({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        filename: req.file.originalname || "recording.webm",
        durationMs,
      });
      jobs.set(requestId, {
        requestId,
        modelJobId: job.job_id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        transientFailureSince: null,
        restartAttempts: 0,
        input: {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          filename: req.file.originalname || "recording.webm",
          durationMs,
        },
        result: null,
        error: null,
      });

      const elapsedMs = Date.now() - startedAt;
      console.log(
        `[findings:${requestId}] job accepted modelJobId=${job.job_id} in ${elapsedMs}ms`
      );

      return res.status(202).json({
        requestId,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
      });
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

  app.get("/api/findings/:requestId/status", async (req, res) => {
    const { requestId } = req.params;
    const job = jobs.get(requestId);

    if (!job) {
      return res.status(404).json({
        error: "request_not_found",
        requestId,
        message: "No inference request found for this requestId.",
      });
    }

    if (TERMINAL_STATUSES.has(job.status)) {
      return res.status(200).json({
        requestId,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        result: job.result,
        error: job.error,
      });
    }

    try {
      const modelJob = await localModelClient.getInferenceJob(job.modelJobId);
      job.status = modelJob.status;
      job.phase = modelJob.phase;
      job.progress = modelJob.progress;
      job.updatedAt = Date.now();
      job.transientFailureSince = null;

      if (modelJob.status === "completed" && modelJob.result) {
        job.result = normalizeFindings(modelJob.result);
        job.input = null;
      } else if (modelJob.status === "failed") {
        job.error = {
          message: "Local model inference job failed.",
          details: modelJob.error || "Unknown inference error",
        };
        job.input = null;
      }

      return res.status(200).json({
        requestId,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        result: job.result,
        error: job.error,
      });
    } catch (error) {
      if (
        isJobNotFoundError(error) &&
        job.input &&
        job.restartAttempts < MAX_JOB_RESTART_ATTEMPTS
      ) {
        try {
          const restartedJob = await localModelClient.startInferenceJob(job.input);
          job.modelJobId = restartedJob.job_id;
          job.status = restartedJob.status;
          job.phase = "model_service_restarting";
          job.progress = Math.max(job.progress || 0, restartedJob.progress || 10);
          job.updatedAt = Date.now();
          job.restartAttempts += 1;
          job.transientFailureSince = Date.now();

          return res.status(200).json({
            requestId,
            status: job.status,
            phase: job.phase,
            progress: job.progress,
            result: job.result,
            error: null,
          });
        } catch (restartError) {
          // fall through to transient/final handling below
          error = restartError;
        }
      }

      const isTransient =
        error.message.includes("unreachable") || error.message.includes("timed out");

      if (isTransient) {
        const now = Date.now();
        if (!job.transientFailureSince) {
          job.transientFailureSince = now;
        }
        const elapsed = now - job.transientFailureSince;

        if (elapsed < TRANSIENT_FAILURE_GRACE_MS) {
          job.status = "running";
          job.phase = "model_service_restarting";
          job.progress = Math.max(job.progress || 0, 70);
          return res.status(200).json({
            requestId,
            status: job.status,
            phase: job.phase,
            progress: job.progress,
            result: job.result,
            error: null,
          });
        }
      }

      return res.status(502).json({
        error: "status_check_failed",
        requestId,
        message: "Unable to retrieve status from local DAM service.",
        details: error.message,
      });
    }
  });

  return app;
}

module.exports = {
  createApp,
};
