import { Num, field, label } from "./ui.jsx";
import ECGReportCapture from "./ECGReportCapture.jsx";
import ReportScanner from "./ReportScanner.jsx";
import { APPROXIMATE_MAP_LABEL } from "../simulationDisplay.js";

export default function PatientForm({ patient, setPatient, onECGReportSelected }) {
  const set = (k) => (v) => setPatient((p) => ({ ...p, [k]: v }));

  const sbp = Number(patient.sbp) || 0;
  const dbp = Number(patient.dbp) || 0;
  const hr = Number(patient.hr) || 75;
  const ef = (Number(patient.ef) || 55) / 100;
  const edv = Number(patient.edv_ml) || 120;
  const hasBP = patient.sbp != null && patient.dbp != null;

  const mapNum = hasBP ? (dbp + (sbp - dbp) / 3) : null;
  const map = mapNum != null ? mapNum.toFixed(1) : "--";
  const ppNum = hasBP ? (sbp - dbp) : null;
  const pp = ppNum != null ? ppNum.toFixed(0) : "--";
  const coNum = (hr * ef * edv) / 1000;
  const co = coNum.toFixed(2);

  // Clinical hemodynamic status badges
  const mapStatus = mapNum == null ? null : mapNum >= 70 && mapNum <= 100
    ? { label: "Normal Perfusion", color: "text-emerald-700 bg-emerald-50 border-emerald-200" }
    : mapNum > 100
    ? { label: "Elevated Afterload", color: "text-amber-800 bg-amber-50 border-amber-200" }
    : { label: "Hypoperfusion Risk", color: "text-rose-800 bg-rose-50 border-rose-200" };

  const ppStatus = ppNum == null ? null : ppNum >= 30 && ppNum <= 50
    ? { label: "Normal (30-50)", color: "text-emerald-700 bg-emerald-50 border-emerald-200" }
    : ppNum > 50
    ? { label: "Widened Pulse Pressure", color: "text-amber-800 bg-amber-50 border-amber-200" }
    : { label: "Narrow Pulse Pressure", color: "text-slate-700 bg-slate-100 border-slate-200" };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4 shadow-sm hover:border-gray-300 transition-all">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
            Patient Information
          </h2>
          {patient.name && (
            <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
              Live Patient Profile
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setPatient({
              name: "John Doe",
              patient_id: "PT-2026-081",
              age: 58,
              sex: "male",
              hr: 72,
              ef: 55,
              sbp: 145,
              dbp: 92,
              edv_ml: 120,
              south_asian_seeding: false,
            });
          }}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
        >
          Reset to default
        </button>
      </div>

      {/* Patient Identification */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/80 p-3.5 rounded-lg border border-slate-200/80">
        <label className="block">
          <span className={label}>Patient Name</span>
          <input
            id="patient-name-input"
            type="text"
            className={field}
            value={patient.name ?? ""}
            placeholder="e.g. John Doe"
            onChange={(e) => set("name")(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={label}>Patient ID / MRN</span>
          <input
            id="patient-id-input"
            type="text"
            className={field}
            value={patient.patient_id ?? ""}
            placeholder="e.g. PT-2026-081"
            onChange={(e) => set("patient_id")(e.target.value)}
          />
        </label>
      </div>

      <ReportScanner onApply={(values) => setPatient((current) => ({ ...current, ...values }))} />
      <ECGReportCapture
        onImageSelected={onECGReportSelected}
        onApplyVitals={(values) => setPatient((current) => ({ ...current, ...values }))}
      />

      <div className="grid grid-cols-2 gap-3.5">
        <Num name="Age" unit="years" value={patient.age} onChange={set("age")} min={18} max={100} />
        <label className="block">
          <span className={label}>Sex</span>
          <select
            className={field}
            value={patient.sex}
            onChange={(e) => set("sex")(e.target.value)}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>

        <Num name="Systolic BP" unit="mmHg" value={patient.sbp} onChange={set("sbp")} min={40} max={260} />
        <Num name="Diastolic BP" unit="mmHg" value={patient.dbp} onChange={set("dbp")} min={20} max={180} />
        <Num name="Heart Rate" unit="bpm" value={patient.hr} onChange={set("hr")} min={30} max={220} />
        <Num name="Ejection Fraction" unit="%" value={patient.ef} onChange={set("ef")} min={15} max={85} />
      </div>

      {/* Calculated Hemodynamics Interactive Cards */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-3 gap-2.5 text-center">
        <div
          className="bg-white rounded border border-slate-200/80 p-2 shadow-xs transition hover:border-slate-300"
          title="Mean Arterial Pressure calculated as DBP + 1/3 (SBP - DBP)"
        >
          <span className="text-[11px] text-gray-500 block truncate">{APPROXIMATE_MAP_LABEL}</span>
          <div className="flex items-baseline justify-center gap-1 mt-0.5">
            <span className="text-base font-bold text-gray-900 font-mono">{map}</span>
            <span className="text-[11px] text-gray-400 font-sans">mmHg</span>
          </div>
          {mapStatus && (
            <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.2 rounded border font-medium ${mapStatus.color}`}>
              {mapStatus.label}
            </span>
          )}
        </div>

        <div
          className="bg-white rounded border border-slate-200/80 p-2 shadow-xs transition hover:border-slate-300"
          title="Pulse Pressure = SBP - DBP; indicator of large artery stiffness"
        >
          <span className="text-[11px] text-gray-500 block truncate">Pulse Pressure</span>
          <div className="flex items-baseline justify-center gap-1 mt-0.5">
            <span className="text-base font-bold text-gray-900 font-mono">{pp}</span>
            <span className="text-[11px] text-gray-400 font-sans">mmHg</span>
          </div>
          {ppStatus && (
            <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.2 rounded border font-medium ${ppStatus.color}`}>
              {ppStatus.label}
            </span>
          )}
        </div>

        <div
          className="bg-white rounded border border-slate-200/80 p-2 shadow-xs transition hover:border-slate-300"
          title="Estimated Cardiac Output = (HR × EF × EDV) / 1000"
        >
          <span className="text-[11px] text-gray-500 block truncate">Est. Cardiac Output</span>
          <div className="flex items-baseline justify-center gap-1 mt-0.5">
            <span className="text-base font-bold text-gray-900 font-mono">{co}</span>
            <span className="text-[11px] text-gray-400 font-sans">L/min</span>
          </div>
          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.2 rounded border font-medium text-emerald-700 bg-emerald-50 border-emerald-200">
            Stroke Vol: {(ef * edv).toFixed(0)} mL
          </span>
        </div>
      </div>

      <div className="pt-1">
        <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 accent-teal-600 rounded"
            checked={patient.south_asian_seeding}
            onChange={(e) => set("south_asian_seeding")(e.target.checked)}
          />
          <span>Use demographic average values if blood pressure is left empty</span>
        </label>
      </div>
    </div>
  );
}
