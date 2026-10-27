import { useState } from "react";
import { forecast } from "../api/client.js";
import {
  FORECAST_CSV_HEADER,
  getForecastDisplay,
  parseForecastCsv,
  toForecastRequest,
} from "../forecastInput.js";

export default function ForecastPanel() {
  const [csv, setCsv] = useState("");
  const [measurements, setMeasurements] = useState(null);
  const [forecastResult, setForecastResult] = useState(null);
  const [provenance, setProvenance] = useState("manual_entry");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const displayedProvenance = forecastResult?.provenance || provenance;

  function loadSampleData() {
    const now = Date.now();
    const rows = [FORECAST_CSV_HEADER];
    for (let i = 29; i >= 0; i--) {
      const t = new Date(now - i * 10_000).toISOString();
      const sbp = 132 + Math.round(Math.sin((30 - i) / 4) * 6);
      const dbp = 82 + Math.round(Math.cos((30 - i) / 4) * 4);
      const hr = 72 + Math.round(Math.sin((30 - i) / 3) * 3);
      rows.push(`${t},${sbp},${dbp},${hr},0`);
    }
    setCsv(rows.join("\n"));
    setProvenance("synthetic_demo");
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMeasurements(null);
    setForecastResult(null);

    let rows;
    try {
      rows = parseForecastCsv(csv);
    } catch (parseError) {
      setError(parseError.message);
      return;
    }

    setMeasurements(rows);
    setBusy(true);
    try {
      const response = await forecast(toForecastRequest(rows, provenance));
      setForecastResult(getForecastDisplay(response, rows));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white border border-indigo-200 rounded-lg p-5 shadow-sm space-y-4" aria-labelledby="forecast-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
        <div>
          <h2 id="forecast-heading" className="text-sm font-bold uppercase tracking-wide text-indigo-900">
            Timestamped Vitals Forecast
          </h2>
          <p className="mt-1 text-xs text-gray-600">
            Requires 30 timestamped observations at 10-second intervals (5-minute observation window).
          </p>
        </div>
        <span className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-800">
          XGBoost · +300 seconds
        </span>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        No baseline values are automatically copied or generated. Include SBP, DBP, HR, and drug infusion rate in each row, and select how the data was entered. Provenance is self-reported; validation does not verify measurement authenticity. Enter 0 mL/hour only when the recorded rate was zero.
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="forecast-csv" className="block text-xs font-semibold text-gray-700">
          Paste timestamped CSV (oldest row first; ISO 8601 timestamps must include a timezone)
        </label>
        <p className="font-mono text-[11px] text-gray-500">
          {FORECAST_CSV_HEADER}
        </p>
        <label htmlFor="forecast-provenance" className="block text-xs font-semibold text-gray-700">
          Data provenance
        </label>
        <select
          id="forecast-provenance"
          value={provenance}
          onChange={(event) => setProvenance(event.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800"
        >
          <option value="manual_entry">Manual entry</option>
          <option value="imported_recording">Imported recording</option>
          <option value="synthetic_demo">Synthetic demo data</option>
        </select>
        <textarea
          id="forecast-csv"
          value={csv}
          onChange={(event) => setCsv(event.target.value)}
          rows={7}
          spellCheck="false"
          placeholder={`${FORECAST_CSV_HEADER}\n2026-10-26T09:00:00Z,120,80,72,0\n... add 29 more measured rows`}
          className="w-full rounded-md border border-gray-300 bg-white p-3 font-mono text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          aria-describedby="forecast-units"
        />
        <p id="forecast-units" className="text-[11px] text-gray-500">
          Units: SBP/DBP mmHg, HR bpm, drug rate mL/hour. Accepted ranges: BP 40–300 with SBP &gt; DBP; HR 20–250; rate ≥ 0. All rows must be complete and exactly 10 seconds apart.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60 cursor-pointer"
          >
            {busy ? "Requesting forecast..." : "Forecast from measured window"}
          </button>
          <button
            type="button"
            onClick={loadSampleData}
            className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 transition cursor-pointer"
          >
            Load Sample 5-Min Vitals Window
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Forecast unavailable: {error}
        </p>
      )}

      {!measurements && !error && (
        <p className="text-xs text-gray-600" role="status">
          Forecast unavailable until a complete, valid 30-sample timestamped observation window is provided.
        </p>
      )}

      {measurements && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-teal-900">
              {displayedProvenance === "synthetic_demo" ? "Synthetic demo inputs" : "Observed inputs"} · {measurements.length} rows
            </h3>
            <div className="mt-3 max-h-64 overflow-auto rounded border border-teal-100 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-teal-50 text-teal-900">
                  <tr>
                    <th className="p-2">Timestamp</th>
                    <th className="p-2">SBP</th>
                    <th className="p-2">DBP</th>
                    <th className="p-2">HR</th>
                    <th className="p-2">Drug rate</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.map((row) => (
                    <tr key={row.timestamp} className="border-t border-gray-100 text-gray-800">
                      <td className="whitespace-nowrap p-2 font-mono">{row.timestamp}</td>
                      <td className="p-2">{row.sbp} mmHg</td>
                      <td className="p-2">{row.dbp} mmHg</td>
                      <td className="p-2">{row.hr} bpm</td>
                      <td className="p-2">{row.drug_rate} mL/h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-teal-900">
              Data provenance: {displayedProvenance}. Provenance is user-declared and does not authenticate these inputs. Recorded infusion rate is included in the model input.
            </p>
          </div>

          <div className="rounded-lg border border-indigo-300 bg-indigo-50/50 p-4" aria-live="polite">
            <h3 className="text-xs font-bold uppercase tracking-wide text-indigo-900">
              Model prediction · not a measured value
            </h3>
            {forecastResult ? (
              <>
                <p className="mt-2 text-xs text-indigo-800">
                  Predicted for {forecastResult.predictedAt} · {forecastResult.horizon_s} seconds after the last observation
                </p>
                <p className="text-[11px] text-indigo-700">
                  Timestamp basis: {forecastResult.timestamp_basis}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <span className="block text-[11px] text-indigo-700">SBP</span>
                    <strong className="text-2xl text-indigo-950">{forecastResult.sbp}</strong>
                    <span className="ml-1 text-xs text-indigo-700">mmHg</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-indigo-700">DBP</span>
                    <strong className="text-2xl text-indigo-950">{forecastResult.dbp}</strong>
                    <span className="ml-1 text-xs text-indigo-700">mmHg</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-indigo-700">HR</span>
                    <strong className="text-2xl text-indigo-950">{forecastResult.hr}</strong>
                    <span className="ml-1 text-xs text-indigo-700">bpm</span>
                  </div>
                </div>
                <p className="mt-3 border-t border-indigo-200 pt-2 text-xs text-indigo-800">
                  Model version: {forecastResult.model_version} · Forecast horizon: {forecastResult.horizon_s} seconds (5 minutes)
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-indigo-800" role="status">
                {busy
                  ? "Waiting for model prediction…"
                  : error
                    ? "No model prediction is available because validation or the API request failed."
                    : "Prediction will appear here after the API responds."}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
