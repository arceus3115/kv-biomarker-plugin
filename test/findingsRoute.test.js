const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../src/appFactory");

function makeKvClient() {
  return {
    async infer() {
      return {
        depression: 1,
        anxiety: 2,
        quantized: true,
      };
    },
  };
}

test("POST /api/findings returns normalized findings on success", async () => {
  const app = createApp({
    localModelClient: makeKvClient(),
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
  assert.equal(response.body.findings.depression.score, 1);
  assert.equal(response.body.findings.depression.severity, "mild_to_moderate");
  assert.equal(response.body.findings.anxiety.score, 2);
  assert.equal(response.body.findings.anxiety.severity, "moderate");
  assert.equal(response.body.vendor.provider, "local_dam");
});

test("POST /api/findings rejects short recordings", async () => {
  const app = createApp({
    localModelClient: makeKvClient(),
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
    localModelClient: makeKvClient(),
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
