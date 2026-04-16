const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/appFactory");

function makeKvClient() {
  return {
    async initiate() {
      return "session-abc";
    },
    async predict() {
      return {};
    },
    async pollResult() {
      return {
        status: "completed",
        predicted_score_depression: "mild_to_moderate",
        predicted_score_anxiety: "moderate",
        model_category: "depression, anxiety",
        model_granularity: "severity",
        is_calibrated: true,
      };
    },
  };
}

test("POST /api/findings returns normalized findings on success", async () => {
  const app = createApp({
    kvClient: makeKvClient(),
    uploadConfig: { maxBytes: 10 * 1024 * 1024, minDurationMs: 30000 },
  });

  const response = await request(app)
    .post("/api/findings")
    .field("durationMs", "30000")
    .attach("audio", Buffer.from("fake-audio"), {
      filename: "sample.webm",
      contentType: "audio/webm",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.sessionId, "session-abc");
  assert.equal(response.body.findings.depression, "mild_to_moderate");
  assert.equal(response.body.findings.anxiety, "moderate");
});

test("POST /api/findings rejects short recordings", async () => {
  const app = createApp({
    kvClient: makeKvClient(),
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
    kvClient: makeKvClient(),
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
