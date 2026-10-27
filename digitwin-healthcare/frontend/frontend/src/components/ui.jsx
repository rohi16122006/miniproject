export const field =
  "w-full border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium rounded-lg shadow-sm transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 focus:outline-none text-slate-800 placeholder-slate-400";

export const label = "block text-xs font-semibold text-slate-700 mb-1.5";

export function Num({ name, value, onChange, step = 1, min, max, unit }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className={label}>{name}</span>
        {unit && <span className="text-xs font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{unit}</span>}
      </div>
      <div className="relative">
        <input
          className={field}
          type="number"
          value={value ?? ""}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      </div>
    </label>
  );
}

export function ClinicalBadge({ variant = "default", children, className = "" }) {
  const styles = {
    default: "bg-slate-100 text-slate-700 border-slate-300",
    teal: "bg-teal-50 text-teal-800 border-teal-200",
    indigo: "bg-indigo-50 text-indigo-800 border-indigo-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
        styles[variant] || styles.default
      } ${className}`}
    >
      {children}
    </span>
  );
}
