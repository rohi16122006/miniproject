import { useState, useEffect } from "react";
import { optimizeDrug } from "../api/client.js";

export default function DrugOptimizer({ patient, onApplyOptimalRegimen }) {
  const [optimizerResult, setOptimizerResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAllOptions, setShowAllOptions] = useState(false);

  const fetchOptimization = () => {
    setLoading(true);
    setError("");
    optimizeDrug(
      {
        ...patient,
        ef: (patient.ef || 55) / 100,
      },
      24
    )
      .then((res) => {
        setOptimizerResult(res);
        setLoading(false);
      })
      .catch((err) => {
        console.warn("Drug optimization error:", err);
        setError("Unable to run drug optimization.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOptimization();
  }, [patient.sbp, patient.dbp, patient.hr, patient.ef, patient.allergies, patient.medical_history]);

  if (!optimizerResult && !loading && !error) return null;

  const best = optimizerResult?.best_choice;

  return (
    <div className="bg-white border border-teal-200 rounded-lg p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span>Intelligent Medication Selection</span>
            <span className="text-xs bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-medium">
              Multi-Criteria Optimization
            </span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Analyzes baseline vitals, contraindications, and organ protection to identify the medication that upgrades cardiovascular health.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchOptimization}
          disabled={loading}
          className="text-xs text-teal-700 hover:text-teal-900 font-medium px-2 py-1 rounded hover:bg-teal-50 transition"
        >
          {loading ? "Evaluating..." : "Re-evaluate &crarr;"}
        </button>
      </div>

      {loading && !optimizerResult ? (
        <div className="p-6 text-center space-y-2">
          <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-500 font-medium">Simulating hemodynamic response across all candidate drugs...</p>
        </div>
      ) : error ? (
        <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded text-xs">{error}</div>
      ) : best ? (
        <div className="space-y-4">
          {/* Top Recommendation Highlight Card */}
          <div className="bg-gradient-to-r from-teal-50/80 to-white border border-teal-300 rounded-lg p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xs bg-teal-700 text-white px-2.5 py-0.5 rounded font-semibold">
                  Top Recommended Choice
                </span>
                <span className="text-base font-bold text-gray-900 capitalize">
                  {best.drug} ({best.dose_mg} mg)
                </span>
                <span className="text-xs text-gray-500">Every {best.interval_h} hours</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">Clinical Match Score:</span>
                <span className="text-base font-bold text-teal-800 bg-white px-2.5 py-0.5 rounded border border-teal-200 tabular-nums">
                  {best.score} / 100
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed font-medium">
              {best.rationale}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-teal-200/60">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-gray-500">Target SBP:</span>{" "}
                  <strong className="text-gray-900 tabular-nums">{best.final_sbp} mmHg</strong>
                </div>
                <div>
                  <span className="text-gray-500">Target DBP:</span>{" "}
                  <strong className="text-gray-900 tabular-nums">{best.final_dbp} mmHg</strong>
                </div>
                <div>
                  <span className="text-gray-500">Target HR:</span>{" "}
                  <strong className="text-gray-900 tabular-nums">{best.final_hr} bpm</strong>
                </div>
                <div>
                  <span className="text-gray-500">Adverse Risk:</span>{" "}
                  <strong className="text-emerald-700 font-semibold capitalize">{best.risk}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onApplyOptimalRegimen(optimizerResult.recommended_regimen)}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-md shadow-sm transition flex items-center gap-1.5"
              >
                <span>Apply Optimal Drug to Patient Plan &rarr;</span>
              </button>
            </div>
          </div>

          {/* Toggle Button for Full Comparison Table */}
          <div className="flex justify-between items-center text-xs">
            <button
              type="button"
              onClick={() => setShowAllOptions(!showAllOptions)}
              className="text-teal-700 hover:text-teal-900 font-medium hover:underline flex items-center gap-1"
            >
              <span>{showAllOptions ? "Hide other candidates" : "Compare all candidate medications & contraindications"}</span>
              <span>{showAllOptions ? "&uarr;" : "&darr;"}</span>
            </button>
            <span className="text-gray-500">
              {optimizerResult.ranked_options.length} regimens evaluated against patient condition
            </span>
          </div>

          {/* Full Comparison Table */}
          {showAllOptions && (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Medication</th>
                    <th className="py-2.5 px-3">Dose &amp; Interval</th>
                    <th className="py-2.5 px-3">Projected BP</th>
                    <th className="py-2.5 px-3">Projected HR</th>
                    <th className="py-2.5 px-3">Match Score</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Contraindications / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 tabular-nums">
                  {optimizerResult.ranked_options.map((opt, idx) => (
                    <tr
                      key={idx}
                      className={opt.status === "Optimal Choice" ? "bg-teal-50/40" : "hover:bg-gray-50/50"}
                    >
                      <td className="py-2.5 px-3 font-semibold text-gray-900 capitalize">{opt.drug}</td>
                      <td className="py-2.5 px-3 text-gray-700">{opt.dose_mg} mg q{opt.interval_h}h</td>
                      <td className="py-2.5 px-3 font-medium text-gray-800">
                        {opt.final_sbp} / {opt.final_dbp} mmHg
                      </td>
                      <td className="py-2.5 px-3 text-gray-700">{opt.final_hr} bpm</td>
                      <td className="py-2.5 px-3 font-semibold text-teal-800">{opt.score}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                            opt.status === "Optimal Choice"
                              ? "bg-teal-100 text-teal-800 border-teal-300"
                              : opt.status === "Contraindicated"
                              ? "bg-red-50 text-red-800 border-red-200"
                              : "bg-gray-100 text-gray-700 border-gray-200"
                          }`}
                        >
                          {opt.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 font-sans text-[11px]">
                        {opt.contraindications?.length > 0 ? (
                          <span className="text-red-700">{opt.contraindications.join("; ")}</span>
                        ) : (
                          <span className="text-gray-500">No contraindications detected</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
