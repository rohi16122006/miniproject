import { Num, field } from "./ui.jsx";

const drugDescriptions = {
  phenylephrine: "Raises blood pressure (IV vasopressor)",
  amlodipine: "Lowers blood pressure (calcium channel blocker)",
  metoprolol: "Lowers heart rate and blood pressure (beta blocker)",
  enalapril: "Lowers blood pressure (ACE inhibitor)",
};

export default function DrugSlider({ item, drugs, onChange, onPick, onRemove }) {
  const info = drugs[item.drug];
  const desc = drugDescriptions[item.drug] || "Blood pressure medication";
  const isFitted = item.drug === "phenylephrine";

  return (
    <div className="border border-gray-200 bg-white p-4 rounded-lg space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <select
          className={`${field} font-semibold text-gray-800 text-sm py-2`}
          value={item.drug}
          onChange={(e) => onPick(e.target.value)}
        >
          {Object.entries(drugs).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1.5 rounded border border-red-200 transition shrink-0"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">{desc}</span>
        {isFitted ? (
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-medium text-[11px]">
            VitalDB Case 61 fit
          </span>
        ) : (
          <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded text-[11px]">
            Literature values
          </span>
        )}
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-gray-700">Dose amount</span>
          <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 text-sm">
            {item.dose_mg} mg
          </span>
        </div>
        <input
          type="range"
          className="w-full accent-teal-600 cursor-pointer h-2 bg-gray-200 rounded"
          min={0.01}
          max={Math.max(80, (info?.default_dose || 10) * 3)}
          step={item.drug === "phenylephrine" ? 0.01 : 0.5}
          value={item.dose_mg}
          onChange={(e) => onChange("dose_mg")(Number(e.target.value))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Num
          name="Every"
          unit="hours"
          value={item.interval_h}
          onChange={onChange("interval_h")}
          min={0.25}
          step={0.25}
        />
        <Num
          name="Number of doses"
          unit="doses"
          value={item.n_doses}
          onChange={onChange("n_doses")}
          min={1}
          max={30}
        />
      </div>
    </div>
  );
}
