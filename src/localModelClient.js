function toUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

function messageFromErrorPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (typeof payload.detail === "string") {
    return payload.detail;
  }

  if (Array.isArray(payload.detail)) {
    const parts = payload.detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item.msg === "string") {
          return item.msg;
        }
        return null;
      })
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join("; ");
    }
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return null;
}

function createLocalModelClient(localModelConfig) {
  function isTemporaryUnreachableError(error) {
    if (!error || typeof error.message !== "string") {
      return false;
    }
    const msg = error.message.toLowerCase();
    return msg.includes("unreachable") || msg.includes("timed out");
  }

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function withRetries(work, { maxAttempts = 3, retryDelayMs = 1000 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        lastError = error;
        if (!isTemporaryUnreachableError(error) || attempt === maxAttempts) {
          throw error;
        }
        await sleep(retryDelayMs);
      }
    }
    throw lastError;
  }

  async function withTimeout(work) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, localModelConfig.timeoutMs);

    try {
      return await work(controller);
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error(
          `Local model service timed out after ${localModelConfig.timeoutMs}ms`
        );
      }
      if (error && error.message === "fetch failed") {
        throw new Error(
          "Local model service is unreachable (it may have crashed or restarted due to memory pressure)."
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function startInferenceJob({ buffer, mimeType, filename, durationMs }) {
    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });

    form.append("audio", blob, filename);
    form.append("duration_ms", String(durationMs));
    form.append("quantize", String(localModelConfig.quantize));

    return withRetries(() =>
      withTimeout(async (controller) => {
      const response = await fetch(
        toUrl(localModelConfig.serviceUrl, "/jobs"),
        {
          method: "POST",
          body: form,
          signal: controller.signal,
        }
      );

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(
          `Local model service returned ${response.status} (non-JSON body)`
        );
      }

      if (!response.ok) {
        throw new Error(
          messageFromErrorPayload(payload) || "Local model service error"
        );
      }

        return payload;
      })
    );
  }

  async function getInferenceJob(jobId) {
    return withRetries(
      () =>
        withTimeout(async (controller) => {
      const response = await fetch(
        toUrl(localModelConfig.serviceUrl, `/jobs/${encodeURIComponent(jobId)}`),
        {
          method: "GET",
          signal: controller.signal,
        }
      );

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(
          `Local model service returned ${response.status} (non-JSON body)`
        );
      }

      if (!response.ok) {
        throw new Error(
          messageFromErrorPayload(payload) || "Local model service error"
        );
      }

          return payload;
        }),
      { maxAttempts: 4, retryDelayMs: 1000 }
    );
  }

  return {
    startInferenceJob,
    getInferenceJob,
  };
}

module.exports = {
  createLocalModelClient,
};
