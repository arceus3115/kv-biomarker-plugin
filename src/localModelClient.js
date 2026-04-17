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
  async function infer({ buffer, mimeType, filename, durationMs }) {
    const form = new FormData();
    const blob = new Blob([buffer], { type: mimeType });

    form.append("audio", blob, filename);
    form.append("duration_ms", String(durationMs));
    form.append("quantize", String(localModelConfig.quantize));

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, localModelConfig.timeoutMs);

    try {
      const response = await fetch(
        toUrl(localModelConfig.serviceUrl, localModelConfig.inferPath),
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
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    infer,
  };
}

module.exports = {
  createLocalModelClient,
};
