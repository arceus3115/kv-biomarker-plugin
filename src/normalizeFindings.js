const DEPRESSION_MAP = {
  0: "no_depression",
  1: "mild_to_moderate",
  2: "severe",
};

const ANXIETY_MAP = {
  0: "no_anxiety",
  1: "mild",
  2: "moderate",
  3: "severe",
};

function toSeverityLabel(value, mapping) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return mapping[value] || null;
}

function normalizeFindings(localResult) {
  return {
    status: "completed",
    findings: {
      depression: {
        score: localResult.depression,
        severity: toSeverityLabel(localResult.depression, DEPRESSION_MAP),
      },
      anxiety: {
        score: localResult.anxiety,
        severity: toSeverityLabel(localResult.anxiety, ANXIETY_MAP),
      },
    },
    vendor: {
      provider: "local_dam",
      model: "KintsugiHealth/dam",
      quantized: Boolean(localResult.quantized),
    },
    error: null,
  };
}

module.exports = {
  normalizeFindings,
};
