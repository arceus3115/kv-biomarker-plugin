function normalizeFindings(result) {
  const status = result.status || "unknown";
  const findings = {
    depression: result.predicted_score_depression || result.predicted_score || null,
    anxiety: result.predicted_score_anxiety || null,
  };

  return {
    sessionId: result.session_id || null,
    status,
    findings,
    vendor: {
      modelCategory: result.model_category || null,
      modelGranularity: result.model_granularity || null,
      isCalibrated:
        typeof result.is_calibrated === "boolean" ? result.is_calibrated : null,
    },
    error: result.predict_error || null,
    rawStatus: result.status || null,
  };
}

module.exports = {
  normalizeFindings,
};
