export const reportFields = {
  age: { label: "Age", min: 18, max: 100 },
  sex: { label: "Sex" },
  sbp: { label: "Systolic BP", min: 70, max: 260, unit: "mmHg" },
  dbp: { label: "Diastolic BP", min: 40, max: 160, unit: "mmHg" },
  hr: { label: "Heart rate", min: 40, max: 160, unit: "bpm" },
  ef: { label: "Ejection fraction", min: 15, max: 80, unit: "%" },
  edv_ml: { label: "End-diastolic volume", min: 60, max: 250, unit: "ml" },
};

function addIfInRange(result, key, value) {
  const { min, max } = reportFields[key];
  if (Number.isFinite(value) && value >= min && value <= max) {
    result[key] = value;
  }
}

export function parseReportVitals(text) {
  const result = {};
  const bp = text.match(/\b(?:BP|blood\s+pressure)\s*[:=-]?\s*(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})\b/i);
  if (bp) {
    addIfInRange(result, "sbp", Number(bp[1]));
    addIfInRange(result, "dbp", Number(bp[2]));
  } else {
    const systolic = text.match(/\b(?:systolic(?:\s+BP)?)\s*[:=-]?\s*(\d{2,3})\b/i);
    const diastolic = text.match(/\b(?:diastolic(?:\s+BP)?)\s*[:=-]?\s*(\d{2,3})\b/i);
    if (systolic) addIfInRange(result, "sbp", Number(systolic[1]));
    if (diastolic) addIfInRange(result, "dbp", Number(diastolic[1]));
  }

  const labels = {
    age: /\bage\s*[:=-]?\s*(\d{1,3})\b/i,
    hr: /\b(?:HR|heart\s+rate|pulse)\s*[:=-]?\s*(\d{2,3})\b/i,
    ef: /\b(?:EF|ejection\s+fraction)\s*[:=-]?\s*(\d{1,3}(?:\.\d+)?)\s*%?/i,
    edv_ml: /\b(?:EDV|end[-\s]?diastolic\s+volume)\s*[:=-]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:ml|mL)?\b/i,
  };
  Object.entries(labels).forEach(([key, pattern]) => {
    const match = text.match(pattern);
    if (match) addIfInRange(result, key, Number(match[1]));
  });

  const sex = text.match(/\b(?:sex|gender)\s*[:=-]?\s*(male|female|m|f)\b/i);
  if (sex) {
    result.sex = sex[1].toLowerCase().startsWith("m") ? "male" : "female";
  }

  return result;
}
