import { Num, field } from "./ui.jsx";

const drugDescriptions = {
  phenylephrine: "Raises blood pressure (IV vasopressor)",
  norepinephrine: "Raises blood pressure & inotropy (IV vasopressor)",
  amlodipine: "Lowers blood pressure (calcium channel blocker)",
  diltiazem: "Lowers heart rate & blood pressure (non-DHP calcium channel blocker)",
  metoprolol: "Lowers heart rate & blood pressure (beta-blocker)",
  carvedilol: "Lowers heart rate & arterial resistance (alpha/beta blocker)",
  enalapril: "Lowers blood pressure (ACE inhibitor)",
  lisinopril: "Lowers blood pressure (long-acting ACE inhibitor)",
  losartan: "Lowers blood pressure (angiotensin II receptor blocker)",
  hydrochlorothiazide: "Lowers blood pressure & fluid volume (thiazide diuretic)",
};

export default function DrugSlider({ item, drugs, onChange, onPick, onRemove }) {
  const info = drugs[item.drug];
  const desc = drugDescriptions[item.drug] || "Blood pressure medication";
  const evidence = info?.evidence || "Evidence not provided";
  const isHistoricalFit = evidence.toLowerCase().startsWith("historical_fit:");

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
        {isHistoricalFit ? (
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-medium text-[11px]">
            Historical fit · not reproduced
          </span>
        ) : (
          <span className="bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded text-[11px]">
            {evidence === "assumed" ? "Assumed / illustrative" : evidence}
          </span>
        )}
      </div>

      {info && (
        <details className="rounded border border-gray-100 bg-gray-50 p-2 text-[11px] text-gray-600">
          <summary className="cursor-pointer font-semibold text-gray-700">
            {[info.drug_class, info.route].filter(Boolean).join(" · ") || "Drug details"}
          </summary>
          <div className="mt-2 space-y-1 leading-relaxed">
            {info.modeling_role && <p><strong>Modeling role:</strong> {info.modeling_role}</p>}
            {info.mechanism && <p>{info.mechanism}</p>}
            {info.administration && <p><strong>Modeled administration:</strong> {info.administration}</p>}
            {info.pk && (
              <p>
                <strong>PK:</strong> ka {info.pk.ka_per_h} h⁻¹; half-life {info.pk.half_life_h} h;
                {" "}Vd {info.pk.volume_distribution_l} L; F {info.pk.bioavailability_fraction}.
              </p>
            )}
            {info.pd && (
              <div>
                <strong>PD parameters:</strong>
                {Object.entries(info.pd).map(([effect, values]) => (
                  <div key={effect} className="ml-2">
                    {effect}: Emax {values.emax} (fractional model effect); EC50 {values.ec50} mg/L
                  </div>
                ))}
              </div>
            )}
            {info.source
              ? <p><strong>Parameter provenance:</strong> {info.source}</p>
              : <p role="status">Detailed parameter provenance is unavailable from this backend version.</p>}
            {info.limitations && <p><strong>Limitations:</strong> {info.limitations}</p>}
          </div>
        </details>
      )}

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
