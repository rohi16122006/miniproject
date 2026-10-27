export default function RiskPanel({ flags = [] }) {
  const hasHighRisk = flags.some((f) => f.level === "high");

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
        <h3 className="text-sm font-semibold text-gray-800">
          Safety Alerts &amp; Warnings
        </h3>
        <span className="text-xs text-gray-500 font-medium">
          Rule-based checks
        </span>
      </div>

      {flags.length === 0 ? (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-sm">
          <span className="font-semibold">No warnings:</span> All projected blood pressure and heart rate values remain within safe limits for this regimen.
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map((f, i) => {
            const isHigh = f.level === "high";
            return (
              <div
                key={i}
                className={`p-3.5 rounded-lg text-sm border ${
                  isHigh
                    ? "bg-red-50 border-red-200 text-red-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-xs">
                    {isHigh ? "High Alert" : "Caution"}
                  </span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-white/80 border border-gray-200 capitalize">
                    {f.level}
                  </span>
                </div>
                <p className="font-medium text-sm leading-relaxed">{f.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
