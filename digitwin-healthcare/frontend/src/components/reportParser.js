export const reportFields = {
  name: { label: "Patient Name" },
  patient_id: { label: "Patient ID / MRN" },
  age: { label: "Age", min: 18, max: 100 },
  sex: { label: "Sex" },
  sbp: { label: "Systolic BP", min: 70, max: 260, unit: "mmHg" },
  dbp: { label: "Diastolic BP", min: 40, max: 160, unit: "mmHg" },
  hr: { label: "Heart rate", min: 40, max: 160, unit: "bpm" },
  ef: { label: "Ejection fraction", min: 15, max: 80, unit: "%" },
  edv_ml: { label: "End-diastolic volume", min: 60, max: 250, unit: "ml" },
};

function isValidName(val) {
  if (!val || typeof val !== "string") return false;
  const trimmed = val.replace(/[,;:]+$/, "").trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  const disallowed = new Set([
    "male", "female", "unknown", "none", "na", "n/a", "null", "undefined",
    "patient", "demographics", "information", "report", "clinical", "evaluation", "normal"
  ]);
  return !disallowed.has(trimmed.toLowerCase());
}

function extractPatientName(text) {
  // 1. Explicit Patient Name / PT Name / Patient:
  const specific = text.match(
    /\b(?:patient(?:\s+name)?|pt\s+name)\s*[:=-]\s*([A-Za-z][A-Za-z.'-]*(?:[ \t][A-Za-z][A-Za-z.'-]*){0,3})(?=[ \t]{2,}|\s*[,;\r\n]|\s*(?:MRN|ID|Age|Sex|DOB|Date|$))/i
  );
  if (specific) {
    const val = specific[1].replace(/[,;:]+$/, "").trim();
    if (isValidName(val)) return val;
  }

  // 2. Generic Name (not preceded by doctor/physician/technician/facility)
  const generic = text.match(
    /(?<!\b(?:doctor|dr|physician|provider|cardiologist|nurse|technician|hospital|facility|clinic|center|test|study)\s+)\bname\s*[:=-]\s*([A-Za-z][A-Za-z.'-]*(?:[ \t][A-Za-z][A-Za-z.'-]*){0,3})(?=[ \t]{2,}|\s*[,;\r\n]|\s*(?:MRN|ID|Age|Sex|DOB|Date|$))/i
  );
  if (generic) {
    const val = generic[1].replace(/[,;:]+$/, "").trim();
    if (isValidName(val)) return val;
  }

  return null;
}

function extractPatientId(text) {
  // 1. Specific MRN / Patient ID / PT-ID
  const specific = text.match(
    /\b(?:MRN(?:\s*[\/|]\s*ID)?|patient\s*(?:id|mrn|identifier|#)|pt\s*(?:id|mrn|#)|chart\s*(?:id|#)|record\s*(?:id|#)|subject\s*(?:id|#))\s*[:=-]\s*([A-Za-z0-9\-_]{2,25})\b/i
  );
  if (specific) return specific[1].trim();

  // 2. Generic ID or Ref not preceded by lead/trace/device/channel/sensor
  const fallback = text.match(
    /(?<!\b(?:lead|trace|device|channel|sensor|probe|test)\s+)\b(?:ID|Ref(?:\s*#)?)\s*[:=-]\s*([A-Za-z0-9\-_]{2,25})\b/i
  );
  if (fallback) {
    const val = fallback[1].trim();
    const disallowed = new Set([
      "ii", "iii", "avr", "avl", "avf", "v1", "v2", "v3", "v4", "v5", "v6", "none", "null", "normal"
    ]);
    if (!disallowed.has(val.toLowerCase())) return val;
  }

  return null;
}

function addIfInRange(result, key, value) {
  const { min, max } = reportFields[key];
  if (Number.isFinite(value) && value >= min && value <= max) {
    result[key] = value;
  }
}

export function parseReportVitals(text) {
  const result = {};

  const name = extractPatientName(text);
  if (name) result.name = name;

  const patientId = extractPatientId(text);
  if (patientId) result.patient_id = patientId;

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
