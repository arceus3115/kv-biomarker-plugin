const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFindings } = require("../src/normalizeKvResponse");

test("normalizeFindings maps vendor response fields to app contract", () => {
  const payload = normalizeFindings({
    session_id: "session-123",
    status: "completed",
    predicted_score_depression: "mild_to_moderate",
    predicted_score_anxiety: "moderate",
    model_category: "depression, anxiety",
    model_granularity: "severity",
    is_calibrated: true,
  });

  assert.deepEqual(payload, {
    sessionId: "session-123",
    status: "completed",
    findings: {
      depression: "mild_to_moderate",
      anxiety: "moderate",
    },
    vendor: {
      modelCategory: "depression, anxiety",
      modelGranularity: "severity",
      isCalibrated: true,
    },
    error: null,
    rawStatus: "completed",
  });
});
