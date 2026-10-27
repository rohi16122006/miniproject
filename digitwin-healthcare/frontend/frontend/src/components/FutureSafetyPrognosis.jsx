import { useState, useEffect } from "react";
import { getFuturePrognosis } from "../api/client.js";

export default function FutureSafetyPrognosis({ patient, regimen, horizon = 24 }) {
  const [prognosisData, setPrognosisData] = useState(null);
  const [selectedHorizon, setSelectedHorizon] = useState("24h");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!regimen || regimen.length === 0) {
      setPrognosisData(null);
      return;
    }

    setLoading(true);
    setError("");

    getFuturePrognosis({
      patient: {
        ...patient,
        ef: (patient.ef || 55) / 100,
      },
      regimen,
      horizon_h: horizon,
      n_points: 30,
    })
      .then((data) => {
        setPrognosisData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.warn("Future prognosis calculation error:", err);
        setError("Unable to calculate longitudinal safety prognosis.");
        setLoading(false);
      });
  }, [patient, regimen, horizon]);

  if (!regimen || regimen.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-2">
        <h3 className="text-sm font-semibold text-gray-800">Future Outcomes &amp; Drug Safety Prognosis</h3>
        <p className="text-xs text-gray-500">
          Add at least one medication to evaluate multi-horizon therapeutic trajectories and organ clearance.
        </p>
      </div>
    );
  }

  const currentHorizonData = prognosisData?.timeline?.find((t) => t.key === selectedHorizon) || prognosisData?.timeline?.[2];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span>Future Outcomes &amp; Drug Safety Prognosis</span>
            <span className="text-xs bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-medium">
              Multi-Horizon Forecast
            </span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Projected hemodynamic stabilization, myocardial oxygen demand, and therapeutic clearance kinetics.
          </p>
        </div>

        {prognosisData && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Safety Assessment:</span>
            <span
              className={`text-xs font-semibold capitalize px-2.5 py-0.5 rounded border ${
                prognosisData.overall_risk === "high"
                  ? "bg-red-50 text-red-800 border-red-200"
                  : prognosisData.overall_risk === "moderate"
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
              }`}
            >
              {prognosisData.overall_risk} Risk Profile
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center space-y-2">
          <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-500 font-medium">Calculating longitudinal organ perfusion &amp; clearance...</p>
        </div>
      ) : error ? (
        <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded text-xs">{error}</div>
      ) : prognosisData ? (
        <div className="space-y-4">
          {/* Horizon Selection Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
            {prognosisData.timeline.map((h) => (
              <button
                key={h.key}
                type="button"
                onClick={() => setSelectedHorizon(h.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  selectedHorizon === h.key
                    ? "bg-white text-gray-900 shadow-sm font-semibold border border-gray-200"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          {/* Selected Horizon Metrics Card */}
          {currentHorizonData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Metric 1: Blood Pressure */}
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-1">
                <span className="text-[11px] text-gray-500 block">Projected BP</span>
                <div className="text-xl font-bold text-gray-900 tabular-nums">
                  {currentHorizonData.sbp} / {currentHorizonData.dbp}
                  <span className="text-xs font-normal text-gray-500 ml-1">mmHg</span>
                </div>
                <span className="text-[11px] text-gray-600 block">
                  MAP: {currentHorizonData.map} mmHg &bull; {currentHorizonData.perfusion_status}
                </span>
              </div>

              {/* Metric 2: Heart Rate */}
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-1">
                <span className="text-[11px] text-gray-500 block">Projected Heart Rate</span>
                <div className="text-xl font-bold text-gray-900 tabular-nums">
                  {currentHorizonData.hr}
                  <span className="text-xs font-normal text-gray-500 ml-1">bpm</span>
                </div>
                <span className="text-[11px] text-gray-600 block">
                  Ejection Fraction: {currentHorizonData.ef}%
                </span>
              </div>

              {/* Metric 3: Myocardial Oxygen Demand (RPP) */}
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-1">
                <span className="text-[11px] text-gray-500 block">Cardiac Workload (RPP)</span>
                <div className="text-xl font-bold text-gray-900 tabular-nums">
                  {currentHorizonData.rpp.toLocaleString()}
                </div>
                <span
                  className={`text-[11px] font-medium block ${
                    currentHorizonData.rpp > 12000 ? "text-amber-700" : "text-emerald-700"
                  }`}
                >
                  {currentHorizonData.rpp_status}
                </span>
              </div>

              {/* Metric 4: Cardiac Index */}
              <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-1">
                <span className="text-[11px] text-gray-500 block">Cardiac Index (CI)</span>
                <div className="text-xl font-bold text-gray-900 tabular-nums">
                  {currentHorizonData.ci}
                  <span className="text-xs font-normal text-gray-500 ml-1">L/min/m&sup2;</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium block">
                  {currentHorizonData.ci_status} perfusion
                </span>
              </div>
            </div>
          )}

          {/* Drug Clearance & Monitoring Guidance Table */}
          {prognosisData.kinetics && prognosisData.kinetics.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-semibold text-gray-800 block">
                Pharmacokinetic Clearance &amp; Clinical Safety Monitoring
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Medication</th>
                      <th className="py-2 px-3">Dose &amp; Schedule</th>
                      <th className="py-2 px-3">Half-Life (t&frac12;)</th>
                      <th className="py-2 px-3">95% Washout Time</th>
                      <th className="py-2 px-3">Elimination Pathway</th>
                      <th className="py-2 px-3">Clinical Monitoring Advice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 tabular-nums">
                    {prognosisData.kinetics.map((k, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="py-2.5 px-3 font-semibold text-gray-900 capitalize">{k.drug}</td>
                        <td className="py-2.5 px-3 text-gray-700">{k.dose_mg} mg q{k.interval_h}h</td>
                        <td className="py-2.5 px-3 text-gray-700">{k.half_life_h} hours</td>
                        <td className="py-2.5 px-3 text-teal-800 font-medium">{k.washout_time_h} hours</td>
                        <td className="py-2.5 px-3 text-gray-600">{k.elimination_route}</td>
                        <td className="py-2.5 px-3 text-gray-700 font-sans">{k.monitoring_advice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
