const test = require("node:test");
const assert = require("node:assert/strict");
const { createLocalModelClient } = require("../src/localModelClient");

test("infer surfaces FastAPI string detail on non-OK response", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ detail: "Inference failed: torchboom" }),
  });

  const client = createLocalModelClient({
    serviceUrl: "http://127.0.0.1:8001",
    inferPath: "/infer",
    timeoutMs: 5000,
    quantize: true,
  });

  try {
    await client.infer({
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

test("infer surfaces FastAPI validation detail array on non-OK response", async () => {
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
    inferPath: "/infer",
    timeoutMs: 5000,
    quantize: true,
  });

  try {
    await client.infer({
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

test("infer falls back to message when detail is absent", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ message: "legacy body" }),
  });

  const client = createLocalModelClient({
    serviceUrl: "http://127.0.0.1:8001",
    inferPath: "/infer",
    timeoutMs: 5000,
    quantize: true,
  });

  try {
    await client.infer({
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

test("infer throws when response body is not JSON", async () => {
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
    inferPath: "/infer",
    timeoutMs: 5000,
    quantize: true,
  });

  try {
    await client.infer({
      buffer: Buffer.from("x"),
      mimeType: "audio/webm",
      filename: "a.webm",
      durationMs: 30000,
    });
    assert.fail("expected throw");
  } catch (error) {
    assert.match(error.message, /Local model service returned 502/);
  } finally {
    global.fetch = originalFetch;
  }
});
