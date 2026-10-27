import { useEffect, useMemo, useState } from "react";
import {
  analyzeECG,
  getECGModelStatus,
  predictECG,
} from "../api/client.js";

const acceptedFiles = ".csv,.zip,.pdf,.png,.jpg,.jpeg,.webp,.txt";
const measurementLabels = [
  ["heart_rate_bpm", "Heart rate", "bpm"],
  ["pr_interval_ms", "PR interval", "ms"],
  ["qrs_duration_ms", "QRS duration", "ms"],
  ["qt_interval_ms", "QT interval", "ms"],
  ["qtc_interval_ms", "QTc interval", "ms"],
  ["reported_interpretation", "Reported interpretation", ""],
];

export default function ECGAnalysisPanel({ runId, initialFile, onFileSelected, onApplyToPatient }) {
  const [file, setFile] = useState(initialFile || null);
  const [samplingRate, setSamplingRate] = useState("");
  const [units, setUnits] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [modelStatus, setModelStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [selectedLead, setSelectedLead] = useState("");

  useEffect(() => {
    if (initialFile) setFile(initialFile);
  }, [initialFile]);

  useEffect(() => {
    let mounted = true;
    getECGModelStatus()
      .then((value) => {
        if (mounted) setModelStatus(value);
      })
      .catch((requestError) => {
        if (mounted) setError(requestError.message);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const availableLeads = analysis?.waveform_preview
    ? Object.keys(analysis.waveform_preview.leads_mV)
    : [];
  const activeLead = availableLeads.includes(selectedLead)
    ? selectedLead
    : availableLeads[0];
  const plotPoints = useMemo(() => {
    if (!analysis?.waveform_preview || !activeLead) return "";
    const values = analysis.waveform_preview.leads_mV[activeLead];
    if (values.length < 2) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * 1000;
        const y = 180 - ((value - min) / span) * 160 - 10;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [analysis, activeLead]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setAnalysis(null);
    setPrediction(null);
    if (!file) {
      setError("Choose an ECG waveform or report file first.");
      return;
    }

    setBusy(true);
    let worker;
    let ocrText;
    try {
      const extension = file.name.split(".").at(-1)?.toLowerCase();
      if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension)) {
        setStatus("Reading report image in this browser...");
        const { createWorker } = await import("tesseract.js");
        worker = await createWorker("eng");
        const { data } = await worker.recognize(file);
        ocrText = data.text;
        if (!ocrText.trim()) {
          throw new Error("No text was recognized. Try a clearer image or a text-based PDF.");
        }
      }
      setStatus("Validating file and extracting available ECG information...");
      const response = await analyzeECG({
        file,
        samplingRateHz: samplingRate,
        units,
        runId,
        ocrText,
      });
      setAnalysis(response);
      setSelectedLead(response.available_leads?.[0] || "");
      setStatus("");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("");
    } finally {
      await worker?.terminate();
      setBusy(false);
    }
  }

  async function handlePrediction() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setPrediction(
        await predictECG({ file, samplingRateHz: samplingRate, units })
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="ecg-analysis-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ecg-analysis-heading" className="text-lg font-bold text-gray-900">ECG Analysis</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-600">
            Inspect a supported waveform or extract measurements from a text-based report. Results are unverified input, not a diagnosis. Files are processed for this request and the source document is not retained by the backend.
          </p>
        </div>
        <span className={`rounded border px-2.5 py-1 text-xs font-semibold ${
          modelStatus?.available
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}>
          {modelStatus?.available ? `Model ${modelStatus.model_version} loaded` : "ECG model not trained/installed"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-700">ECG waveform or report file</span>
          <input
            type="file"
            accept={acceptedFiles}
            onChange={(event) => {
              const selected = event.target.files?.[0] || null;
              setFile(selected);
              onFileSelected?.(selected);
              setAnalysis(null);
              setPrediction(null);
              setError("");
            }}
            className="block w-full rounded border border-gray-300 bg-white px-3 py-2 text-xs"
            aria-label="Choose ECG waveform or report file"
          />
        </label>

        <p className="text-xs leading-relaxed text-gray-600">
          Supported: CSV waveform with a header row using Lead I/II/III, aVR/aVL/aVF, V1–V6, or ECG columns; WFDB records packaged as one ZIP containing one .hea and its .dat files; text-based PDF; image; or TXT report. Scanned PDFs are not OCR-processed. Image OCR runs in this browser.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Sampling rate (Hz; CSV only if not in time_s column)</span>
            <input
              type="number"
              min="100"
              max="2000"
              step="any"
              value={samplingRate}
              onChange={(event) => setSamplingRate(event.target.value)}
              placeholder="e.g. 500"
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-xs"
              aria-label="Sampling rate in Hz"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Signal amplitude units (CSV only)</span>
            <select
              value={units}
              onChange={(event) => setUnits(event.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-xs"
              aria-label="Signal amplitude units"
            >
              <option value="">Select units</option>
              <option value="mV">mV</option>
              <option value="uV">uV</option>
              <option value="V">V</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Analyzing…" : "Analyze ECG"}
          </button>
          {file && <span className="max-w-full truncate text-xs text-gray-600">{file.name}</span>}
          {runId == null && (
            <span className="text-xs text-gray-500">No simulation run selected; this analysis will not be linked to a run.</span>
          )}
        </div>
      </form>

      {status && <p className="text-xs text-teal-800" role="status">{status}</p>}
      {error && <p className="rounded border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800" role="alert">{error}</p>}

      {analysis && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Analysis #{analysis.analysis_id}: {analysis.filename}</h3>
              <p className="mt-1 text-xs text-gray-600">
                Format: {analysis.detected_format} · Provenance: {analysis.provenance}
                {analysis.associated_run_id != null ? ` · Linked simulation: ${analysis.associated_run_id}` : ""}
              </p>
            </div>
            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
              {analysis.source_document_retained ? "Source retained" : "Source file not retained"}
            </span>
          </div>

          {analysis.analysis_type === "waveform" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Summary title="Sampling rate" value={`${analysis.sampling_rate_hz} Hz`} />
                <Summary title="Duration" value={`${analysis.duration_seconds} s`} />
                <Summary title="Samples / leads" value={`${analysis.sample_count} / ${analysis.available_leads.join(", ")}`} />
              </div>
              {availableLeads.length > 0 && (
                <div className="rounded-md border border-gray-200 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-gray-800">Filtered waveform preview</h4>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      Lead
                      <select
                        value={activeLead}
                        onChange={(event) => setSelectedLead(event.target.value)}
                        className="rounded border border-gray-300 bg-white px-2 py-1"
                        aria-label="Select ECG lead"
                      >
                        {availableLeads.map((lead) => <option key={lead}>{lead}</option>)}
                      </select>
                    </label>
                  </div>
                  <svg viewBox="0 0 1000 200" role="img" aria-label={`${activeLead} ECG waveform preview in millivolts`} className="h-44 w-full rounded bg-slate-50">
                    <line x1="0" y1="100" x2="1000" y2="100" stroke="#cbd5e1" strokeDasharray="4 4" />
                    <polyline points={plotPoints} fill="none" stroke="#0f766e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Time axis: 0–{analysis.duration_seconds} s · amplitude: mV · {analysis.preprocessing.method}
                  </p>
                </div>
              )}
              <div className="rounded-md border border-gray-200 p-3">
                <h4 className="text-xs font-bold text-gray-800">Signal-quality checks</h4>
                <p className="mt-1 text-xs text-gray-700">Status: {analysis.signal_quality.status} — {analysis.signal_quality.scope}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">
                  {analysis.signal_quality.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h4 className="text-xs font-bold text-gray-800">Measurements extracted from report text</h4>
                  {analysis.measurements?.heart_rate_bpm != null && onApplyToPatient && (
                    <button
                      type="button"
                      onClick={() => {
                        onApplyToPatient({
                          hr: Number(analysis.measurements.heart_rate_bpm),
                        });
                      }}
                      className="rounded bg-teal-700 hover:bg-teal-800 text-white px-2.5 py-1 text-xs font-bold transition cursor-pointer"
                    >
                      Sync Heart Rate ({analysis.measurements.heart_rate_bpm} bpm) to Patient Profile
                    </button>
                  )}
                </div>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {measurementLabels.map(([key, label, unit]) => (
                    <div key={key} className="rounded bg-gray-50 p-2">
                      <dt className="text-[11px] text-gray-500">{label}</dt>
                      <dd className="mt-0.5 break-words text-xs font-semibold text-gray-800">
                        {analysis.measurements[key] == null ? "Not found" : `${analysis.measurements[key]}${unit ? ` ${unit}` : ""}`}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <details className="rounded border border-gray-200 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-gray-700">Show extracted source text (unverified)</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-600">
                  {analysis.extracted_text || "No extractable text was returned."}
                </pre>
              </details>
            </>
          )}

          {analysis.analysis_type === "report" && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900">
              {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          {analysis.analysis_type === "waveform" && (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3">
              <h4 className="text-xs font-bold text-indigo-900">Research model output</h4>
              {!modelStatus?.available ? (
                <p className="mt-1 text-xs text-indigo-800">
                  {modelStatus?.message || "No trained ECG model is installed. No prediction is available."}
                </p>
              ) : (
                <>
                  {analysis.model_input_compatible ? (
                    <button
                      type="button"
                      onClick={handlePrediction}
                      disabled={busy}
                      className="mt-2 rounded bg-indigo-700 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                    >
                      Run research classification
                    </button>
                  ) : (
                    <p className="mt-1 text-xs text-indigo-800">
                      This upload is not a supported 10-second, standard-order 12-lead waveform for the model.
                    </p>
                  )}
                </>
              )}
              {prediction && (
                <div className="mt-3 space-y-1 text-xs text-indigo-950">
                  <p>Model {prediction.model_version} · {prediction.dataset}</p>
                  {prediction.predictions.map((item) => (
                    <p key={item.label}>{item.label}: score {item.score.toFixed(3)} · {item.predicted ? "above 0.5 threshold" : "below 0.5 threshold"}</p>
                  ))}
                  <p className="font-semibold">{prediction.uncertainty}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Summary({ title, value }) {
  return (
    <div className="rounded bg-gray-50 p-3">
      <p className="text-[11px] text-gray-500">{title}</p>
      <p className="mt-1 break-words text-xs font-semibold text-gray-800">{value}</p>
    </div>
  );
}
