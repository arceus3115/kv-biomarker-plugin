const test = require("node:test");
const assert = require("node:assert/strict");
const { createLocalModelClient } = require("../src/localModelClient");

test("startInferenceJob surfaces FastAPI string detail on non-OK response", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ detail: "Inference failed: torchboom" }),
  });

  const client = createLocalModelClient({
    serviceUrl: "http://127.0.0.1:8001",
    timeoutMs: 5000,
    quantize: true,
  });

  try {
    await client.startInferenceJob({
      buffer: Buffer.from("x"),
      mimeType: "audio/webm",
      filename: "a.webm",
      durationMs: 30000,
    });
    assert.fail("expected throw");
  } catch (error) {
    assert.equal(error.message, "Inference failed: torchboom");
  } finally {
    global.fetch = originalFetch;
  }
});

test("startInferenceJob surfaces FastAPI validation detail array on non-OK response", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 422,
    json: async () => ({
      detail: [{ msg: "field required" }, { msg: "invalid" }],
    }),
  });

  const client = createLocalModelClient({
    serviceUrl: "http://127.0.0.1:8001",
    timeoutMs: 5000,
    quantize: true,
  });

  try {
    await client.startInferenceJob({
      buffer: Buffer.from("x"),
      mimeType: "audio/webm",
      filename: "a.webm",
      durationMs: 30000,
    });
    assert.fail("expected throw");
  } catch (error) {
    assert.equal(error.message, "field required; invalid");
  } finally {
    global.fetch = originalFetch;
  }
});

test("startInferenceJob falls back to message when detail is absent", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ message: "legacy body" }),
  });

  const client = createLocalModelClient({
    serviceUrl: "http://127.0.0.1:8001",
    timeoutMs: 5000,
    quantize: true,
  });

  try {
    await client.startInferenceJob({
      buffer: Buffer.from("x"),
      mimeType: "audio/webm",
      filename: "a.webm",
      durationMs: 30000,
    });
    assert.fail("expected throw");
  } catch (error) {
    assert.equal(error.message, "legacy body");
  } finally {
    global.fetch = originalFetch;
  }
});

test("getInferenceJob throws when response body is not JSON", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 502,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  });

  const client = createLocalModelClient({
    serviceUrl: "http://127.0.0.1:8001",
    timeoutMs: 5000,
    quantize: true,
  });

  try {
    await client.getInferenceJob("abc123");
    assert.fail("expected throw");
  } catch (error) {
    assert.match(error.message, /Local model service returned 502/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("startInferenceJob surfaces a readable timeout error", async () => {
  const originalFetch = global.fetch;
  global.fetch = (_, options) =>
    new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => {
        const abortError = new Error("aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    });

  const client = createLocalModelClient({
    serviceUrl: "http://127.0.0.1:8001",
    timeoutMs: 5,
    quantize: true,
  });

  try {
    await client.startInferenceJob({
      buffer: Buffer.from("x"),
      mimeType: "audio/webm",
      filename: "a.webm",
      durationMs: 30000,
    });
    assert.fail("expected timeout throw");
  } catch (error) {
    assert.match(error.message, /timed out after 5ms/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("getInferenceJob returns parsed payload on success", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      job_id: "job-1",
      status: "running",
      phase: "running_inference",
      progress: 70,
    }),
  });

  const client = createLocalModelClient({
    serviceUrl: "http://127.0.0.1:8001",
    timeoutMs: 5000,
    quantize: true,
  });

  try {
    const payload = await client.getInferenceJob("job-1");
    assert.equal(payload.status, "running");
    assert.equal(payload.progress, 70);
  } finally {
    global.fetch = originalFetch;
  }
});
