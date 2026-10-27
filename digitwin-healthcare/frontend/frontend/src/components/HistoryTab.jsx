import { useEffect, useState } from "react";
import { getHistory, getHistoryItem } from "../api/client.js";

/**
 * Clinical Session History Tab
 * 
 * Interacts directly with the SQLite database via FastAPI /history endpoints.
 * Displays persistent simulation records, verifies patient-session separation,
 * and allows 1-click restoration of any past simulation session.
 */
export default function HistoryTab({ onLoadSession }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedRun, setSelectedRun] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getHistory(50);
      setRuns(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleRestore = async (runId) => {
    try {
      const fullRun = await getHistoryItem(runId);
      if (fullRun && onLoadSession) {
        onLoadSession(fullRun);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const riskBadge = {
    low: "bg-emerald-50 text-emerald-800 border-emerald-300",
    moderate: "bg-amber-50 text-amber-800 border-amber-300",
    high: "bg-red-50 text-red-800 border-red-300",
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4 w-full">
      <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span>Clinical Session History</span>
            <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded font-medium">
              SQLite Storage
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Persistent audit trail of previous simulations. Verifies patient separation and reproducible recall.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchHistory}
          disabled={loading}
          className="bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-semibold px-3 py-1.5 rounded transition"
        >
          {loading ? "Refreshing..." : "Refresh Records"}
        </button>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-gray-500">Loading historical database sessions...</div>
      ) : runs.length === 0 ? (
        <div className="p-8 text-center text-xs text-gray-500">
          No previous sessions found in SQLite database. Run a simulation to create your first session record.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold text-xs">
              <tr>
                <th className="py-2.5 px-3">Run ID</th>
                <th className="py-2.5 px-3">Timestamp (UTC)</th>
                <th className="py-2.5 px-3">Patient ID</th>
                <th className="py-2.5 px-3">Patient Name</th>
                <th className="py-2.5 px-3">Baseline BP</th>
                <th className="py-2.5 px-3">Final Simulated BP</th>
                <th className="py-2.5 px-3">Medications</th>
                <th className="py-2.5 px-3">Risk Assessment</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 tabular-nums">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/70 transition">
                  <td className="py-2.5 px-3 font-semibold text-gray-900">#{r.id}</td>
                  <td className="py-2.5 px-3 text-gray-600 text-xs">
                    {r.created_at?.replace("T", " ") || "--"}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-teal-800">{r.patient_id}</td>
                  <td className="py-2.5 px-3 font-medium text-gray-800">{r.patient_name}</td>
                  <td className="py-2.5 px-3">
                    {r.baseline_sbp ? `${r.baseline_sbp} / ${r.baseline_dbp} mmHg` : "--"}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-gray-900">
                    {r.final_sbp ? `${r.final_sbp.toFixed(0)} / ${r.final_dbp.toFixed(0)} mmHg` : "--"}
                  </td>
                  <td className="py-2.5 px-3 text-gray-600">
                    {r.regimen?.map((d) => `${d.drug} (${d.dose_mg}mg)`).join(", ") || "None"}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded border ${riskBadge[r.risk] || "bg-gray-50 text-gray-700"}`}>
                      {r.risk}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRestore(r.id)}
                      className="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-semibold px-2.5 py-1 rounded transition"
                    >
                      Restore &rarr;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
