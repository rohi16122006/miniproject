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

  const map = hasBP ? (dbp + (sbp - dbp) / 3).toFixed(1) : "--";
  const pp = hasBP ? (sbp - dbp).toFixed(0) : "--";
  const co = ((hr * ef * edv) / 1000).toFixed(2);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
          Patient Information
        </h2>
        <span className="text-xs text-gray-500 font-medium">Workspace inputs</span>
      </div>

      {/* Patient Identification */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
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

      {/* Calculated values */}
      <div className="bg-gray-50 border border-gray-200 rounded-md p-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <span className="text-xs text-gray-500 block">{APPROXIMATE_MAP_LABEL}</span>
          <span className="text-base font-bold text-gray-800">{map}</span>
          <span className="text-xs text-gray-400 ml-1">mmHg</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Pulse Pressure</span>
          <span className="text-base font-bold text-gray-800">{pp}</span>
          <span className="text-xs text-gray-400 ml-1">mmHg</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Estimated Cardiac Output</span>
          <span className="text-base font-bold text-gray-800">{co}</span>
          <span className="text-xs text-gray-400 ml-1">L/min</span>
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
