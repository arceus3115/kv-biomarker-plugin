const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/appFactory");

function makeLocalModelClient() {
  return {
    async startInferenceJob() {
      return {
        job_id: "model-job-1",
        status: "queued",
        phase: "queued",
        progress: 5,
      };
    },
    async getInferenceJob() {
      return {
        job_id: "model-job-1",
        status: "completed",
        phase: "completed",
        progress: 100,
        result: {
          depression: 1,
          anxiety: 2,
          quantized: true,
        },
      };
    },
  };
}

test("POST /api/findings creates async job and returns requestId", async () => {
  const app = createApp({
    localModelClient: makeLocalModelClient(),
    uploadConfig: { maxBytes: 10 * 1024 * 1024, minDurationMs: 30000 },
  });

  const response = await request(app)
    .post("/api/findings")
    .field("durationMs", "30000")
    .attach("audio", Buffer.from("fake-audio"), {
      filename: "sample.webm",
      contentType: "audio/webm",
    });

  assert.equal(response.status, 202);
  assert.equal(typeof response.body.requestId, "string");
  assert.equal(response.body.status, "queued");
});

test("POST /api/findings rejects short recordings", async () => {
  const app = createApp({
    localModelClient: makeLocalModelClient(),
    uploadConfig: { maxBytes: 10 * 1024 * 1024, minDurationMs: 30000 },
  });

  const response = await request(app)
    .post("/api/findings")
    .field("durationMs", "5000")
    .attach("audio", Buffer.from("fake-audio"), {
      filename: "sample.webm",
      contentType: "audio/webm",
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "audio_too_short");
});

test("POST /api/findings rejects unsupported MIME type", async () => {
  const app = createApp({
    localModelClient: makeLocalModelClient(),
    uploadConfig: { maxBytes: 10 * 1024 * 1024, minDurationMs: 30000 },
  });

  const response = await request(app)
    .post("/api/findings")
    .field("durationMs", "45000")
    .attach("audio", Buffer.from("fake-audio"), {
      filename: "sample.mp3",
      contentType: "audio/mpeg",
    });

  assert.equal(response.status, 415);
  assert.equal(response.body.error, "unsupported_audio_type");
});

test("GET /api/findings/:requestId/status returns normalized completed result", async () => {
  const app = createApp({
    localModelClient: makeLocalModelClient(),
    uploadConfig: { maxBytes: 10 * 1024 * 1024, minDurationMs: 30000 },
  });

  const createResponse = await request(app)
    .post("/api/findings")
    .field("durationMs", "30000")
    .attach("audio", Buffer.from("fake-audio"), {
      filename: "sample.webm",
      contentType: "audio/webm",
    });

  const requestId = createResponse.body.requestId;
  const statusResponse = await request(app).get(
    `/api/findings/${encodeURIComponent(requestId)}/status`
  );

  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.body.status, "completed");
  assert.equal(statusResponse.body.result.findings.depression.score, 1);
  assert.equal(
    statusResponse.body.result.findings.depression.severity,
    "mild_to_moderate"
  );
  assert.equal(statusResponse.body.result.findings.anxiety.score, 2);
  assert.equal(statusResponse.body.result.findings.anxiety.severity, "moderate");
});

test("GET /api/findings/:requestId/status resubmits once when model job is missing", async () => {
  let startCalls = 0;
  let statusCalls = 0;
  const localModelClient = {
    async startInferenceJob() {
      startCalls += 1;
      return {
        job_id: startCalls === 1 ? "model-job-1" : "model-job-2",
        status: "queued",
        phase: "queued",
        progress: 5,
      };
    },
    async getInferenceJob() {
      statusCalls += 1;
      if (statusCalls === 1) {
        throw new Error("Job not found.");
      }
      return {
        job_id: "model-job-2",
        status: "completed",
        phase: "completed",
        progress: 100,
        result: {
          depression: 1,
          anxiety: 2,
          quantized: true,
        },
      };
    },
  };

  const app = createApp({
    localModelClient,
    uploadConfig: { maxBytes: 10 * 1024 * 1024, minDurationMs: 30000 },
  });

  const createResponse = await request(app)
    .post("/api/findings")
    .field("durationMs", "30000")
    .attach("audio", Buffer.from("fake-audio"), {
      filename: "sample.webm",
      contentType: "audio/webm",
    });
  const requestId = createResponse.body.requestId;

  const firstPoll = await request(app).get(
    `/api/findings/${encodeURIComponent(requestId)}/status`
  );
  assert.equal(firstPoll.status, 200);
  assert.equal(firstPoll.body.phase, "model_service_restarting");

  const secondPoll = await request(app).get(
    `/api/findings/${encodeURIComponent(requestId)}/status`
  );
  assert.equal(secondPoll.status, 200);
  assert.equal(secondPoll.body.status, "completed");
  assert.equal(secondPoll.body.result.findings.depression.score, 1);
  assert.equal(startCalls, 2);
});
