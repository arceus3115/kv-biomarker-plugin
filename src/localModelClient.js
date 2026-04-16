function toUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
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

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message || "Local model service error");
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
