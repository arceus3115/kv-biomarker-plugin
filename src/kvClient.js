const { setTimeout: sleep } = require("node:timers/promises");
const { buildResultPath } = require("./config");

const DONE_STATUSES = new Set(["completed", "complete", "done", "success"]);
const WAIT_STATUSES = new Set([
  "queued",
  "pending",
  "processing",
  "in_progress",
  "running",
]);

function toUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

function makeHeaders(apiKey, extraHeaders) {
  const headers = { ...extraHeaders };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

async function assertOk(response, label) {
  if (response.ok) {
    return;
  }

  let body = "";
  try {
    body = await response.text();
  } catch (error) {
    body = "";
  }

  throw new Error(`${label} failed (${response.status}): ${body}`);
}

function createKvClient(kvConfig) {
  async function initiate({ userId }) {
    const form = new FormData();
    form.append("user_id", userId);
    form.append("is_initiated", "true");

    const response = await fetch(toUrl(kvConfig.baseUrl, kvConfig.initiatePath), {
      method: "POST",
      headers: makeHeaders(kvConfig.apiKey),
      body: form,
    });

    await assertOk(response, "KV initiate");
    const payload = await response.json();

    if (!payload.session_id) {
      throw new Error("KV initiate response missing session_id");
    }

    return payload.session_id;
  }

  async function predict({ sessionId, buffer, mimeType, filename }) {
    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });

    form.append("session_id", sessionId);
    form.append("file", blob, filename);

    const response = await fetch(toUrl(kvConfig.baseUrl, kvConfig.predictPath), {
      method: "POST",
      headers: makeHeaders(kvConfig.apiKey),
      body: form,
    });

    await assertOk(response, "KV predict");
    return response.json();
  }

  async function getResult(sessionId) {
    const resultPath = buildResultPath(kvConfig.resultPathTemplate, sessionId);
    const response = await fetch(toUrl(kvConfig.baseUrl, resultPath), {
      method: "GET",
      headers: makeHeaders(kvConfig.apiKey),
    });

    await assertOk(response, "KV get result");
    return response.json();
  }

  async function pollResult(sessionId) {
    const start = Date.now();

    while (Date.now() - start <= kvConfig.pollTimeoutMs) {
      const result = await getResult(sessionId);
      const status = String(result.status || "").toLowerCase();

      if (!status || DONE_STATUSES.has(status)) {
        return result;
      }

      if (!WAIT_STATUSES.has(status)) {
        return result;
      }

      await sleep(kvConfig.pollIntervalMs);
    }

    throw new Error("Timed out waiting for KV prediction result");
  }

  return {
    initiate,
    predict,
    getResult,
    pollResult,
  };
}

module.exports = {
  createKvClient,
};
