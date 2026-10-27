import { useState } from "react";
import { Num, field, label } from "./ui.jsx";
import VitalsCameraModal from "./VitalsCameraModal.jsx";

export default function PatientForm({ patient, setPatient, onAutoSimulate }) {
  const [scannerOpen, setScannerOpen] = useState(false);
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

  const handleApplyScannedVitals = (vitals) => {
    setPatient((prev) => {
      const updated = {
        ...prev,
        ...vitals,
      };
      if (onAutoSimulate) {
        setTimeout(() => onAutoSimulate(updated), 50);
      }
      return updated;
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">
            Patient Information
          </h2>
          <span className="text-xs text-gray-500 font-medium">Baseline</span>
        </div>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-semibold px-2.5 py-1 rounded transition flex items-center gap-1.5 shadow-sm"
        >
          <span>Scan Vitals (Camera)</span>
        </button>
      </div>

      <VitalsCameraModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onApplyVitals={handleApplyScannedVitals}
      />

      {/* Patient Identification Bar */}
      <div className="grid grid-cols-2 gap-3.5 bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
        <div>
          <span className="block font-medium text-gray-700 mb-1">Patient Name</span>
          <input
            type="text"
            className="w-full border border-gray-300 bg-white px-2.5 py-1.5 rounded text-xs font-medium text-gray-800 focus:border-teal-600 focus:outline-none"
            value={patient.name || ""}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="e.g. John Doe"
          />
        </div>
        <div>
          <span className="block font-medium text-gray-700 mb-1">Patient ID / MRN</span>
          <input
            type="text"
            className="w-full border border-gray-300 bg-white px-2.5 py-1.5 rounded text-xs font-medium text-gray-800 focus:border-teal-600 focus:outline-none"
            value={patient.patient_id || ""}
            onChange={(e) => set("patient_id")(e.target.value)}
            placeholder="e.g. PT-8291"
          />
        </div>
      </div>

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

      {/* Clinical Notes & Allergies (collapsible) */}
      <details className="text-xs border border-gray-200 rounded-md p-2.5 bg-gray-50/50">
        <summary className="font-semibold text-gray-700 cursor-pointer select-none flex items-center justify-between">
          <span>Clinical History, Allergies & Home Meds</span>
          <span className="text-[11px] text-teal-700 font-medium">Edit details &darr;</span>
        </summary>
        <div className="grid grid-cols-1 gap-2.5 pt-2.5 mt-2 border-t border-gray-200">
          <div>
            <span className="block font-semibold text-gray-600 mb-0.5">Medical History</span>
            <input
              type="text"
              className="w-full border border-gray-300 bg-white px-2.5 py-1.5 rounded text-xs text-gray-800 focus:border-teal-600 focus:outline-none"
              value={patient.medical_history || ""}
              onChange={(e) => set("medical_history")(e.target.value)}
              placeholder="e.g. Essential hypertension, prior CABG"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block font-semibold text-gray-600 mb-0.5">Known Allergies</span>
              <input
                type="text"
                className="w-full border border-gray-300 bg-white px-2.5 py-1.5 rounded text-xs text-gray-800 focus:border-teal-600 focus:outline-none"
                value={patient.allergies || ""}
                onChange={(e) => set("allergies")(e.target.value)}
                placeholder="e.g. Penicillin, NSAIDs"
              />
            </div>
            <div>
              <span className="block font-semibold text-gray-600 mb-0.5">Current Medications</span>
              <input
                type="text"
                className="w-full border border-gray-300 bg-white px-2.5 py-1.5 rounded text-xs text-gray-800 focus:border-teal-600 focus:outline-none"
                value={patient.current_medications || ""}
                onChange={(e) => set("current_medications")(e.target.value)}
                placeholder="e.g. Metformin 500mg, Aspirin 81mg"
              />
            </div>
          </div>
        </div>
      </details>

      {/* Calculated values */}
      <div className="bg-gray-50 border border-gray-200 rounded-md p-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <span className="text-xs text-gray-500 block">Mean Arterial (MAP)</span>
          <span className="text-base font-bold text-gray-800">{map}</span>
          <span className="text-xs text-gray-400 ml-1">mmHg</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Pulse Pressure</span>
          <span className="text-base font-bold text-gray-800">{pp}</span>
          <span className="text-xs text-gray-400 ml-1">mmHg</span>
        </div>
        <div>
          <span className="text-xs text-gray-500 block">Cardiac Output</span>
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
