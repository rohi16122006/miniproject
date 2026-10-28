import assert from "node:assert/strict";
import test from "node:test";
import { parseReportVitals, reportFields } from "./components/reportParser.js";

test("reportFields defines labels for patient name and ID", () => {
  assert.equal(reportFields.name.label, "Patient Name");
  assert.equal(reportFields.patient_id.label, "Patient ID / MRN");
});

test("parses patient name, patient ID, and vitals from structured report", () => {
  const reportText = `
METROPOLITAN CARDIOLOGY CLINICAL CENTER
PATIENT DEMOGRAPHICS
Patient Name: Rajesh Sharma              MRN / ID: PT-04829
Age: 56                                  Sex: Male
Blood Pressure: BP: 145/92 mmHg
Heart Rate: 76 bpm
Ejection Fraction: 55%
End-Diastolic Volume: 120 ml
  `;

  const parsed = parseReportVitals(reportText);

  assert.equal(parsed.name, "Rajesh Sharma");
  assert.equal(parsed.patient_id, "PT-04829");
  assert.equal(parsed.age, 56);
  assert.equal(parsed.sex, "male");
  assert.equal(parsed.sbp, 145);
  assert.equal(parsed.dbp, 92);
  assert.equal(parsed.hr, 76);
  assert.equal(parsed.ef, 55);
  assert.equal(parsed.edv_ml, 120);
});

test("parses alternative labels like PT Name and PT ID", () => {
  const text = `
PT Name: Alice Wonder
PT-ID: AW-2026-X
BP: 130/85
Pulse: 72 bpm
  `;

  const parsed = parseReportVitals(text);
  assert.equal(parsed.name, "Alice Wonder");
  assert.equal(parsed.patient_id, "AW-2026-X");
  assert.equal(parsed.sbp, 130);
  assert.equal(parsed.dbp, 85);
  assert.equal(parsed.hr, 72);
});

test("does not mistakenly treat doctor name as patient name", () => {
  const text = `
Facility: Cardio Clinic
Doctor Name: Dr. Evelyn Vance
Patient Name: John Doe
Chart #: 88201
BP: 120/80
  `;

  const parsed = parseReportVitals(text);
  assert.equal(parsed.name, "John Doe");
  assert.equal(parsed.patient_id, "88201");
});

test("does not treat ECG lead ID as patient ID", () => {
  const text = `
Patient Name: Jane Doe
Lead ID: II
Ref: JD-994
BP: 118/78
  `;

  const parsed = parseReportVitals(text);
  assert.equal(parsed.name, "Jane Doe");
  assert.equal(parsed.patient_id, "JD-994");
});
