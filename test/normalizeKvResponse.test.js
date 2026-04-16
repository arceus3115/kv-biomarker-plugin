const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFindings } = require("../src/normalizeKvResponse");

test("normalizeFindings maps vendor response fields to app contract", () => {
  const payload = normalizeFindings({
    depression: 2,
    anxiety: 3,
    quantized: true,
  });

  assert.deepEqual(payload, {
    status: "completed",
    findings: {
      depression: {
        score: 2,
        severity: "severe",
      },
      anxiety: {
        score: 3,
        severity: "severe",
      },
    },
    vendor: {
      provider: "local_dam",
      model: "KintsugiHealth/dam",
      quantized: true,
    },
    error: null,
  });
});
