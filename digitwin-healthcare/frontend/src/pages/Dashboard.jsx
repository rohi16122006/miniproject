import { lazy, Suspense, useEffect, useState } from "react";
import { getDrugs, getHealth, simulate } from "../api/client.js";
import BPChart from "../components/BPChart.jsx";
import DrugSlider from "../components/DrugSlider.jsx";
import ECGAnalysisPanel from "../components/ECGAnalysisPanel.jsx";
import ForecastPanel from "../components/ForecastPanel.jsx";
import EFChart from "../components/EFChart.jsx";
import HRChart from "../components/HRChart.jsx";
import PatientForm from "../components/PatientForm.jsx";
import RiskPanel from "../components/RiskPanel.jsx";
import Trend from "../components/Trend.jsx";
import { Num } from "../components/ui.jsx";
import { buildSimulationDisplay, MODEL_DERIVED_MAP_LABEL } from "../simulationDisplay.js";

const Heart3DPanel = lazy(() => import("../components/Heart3DPanel.jsx"));

const riskBadge = {
  low: "bg-emerald-50 text-emerald-800 border-emerald-300",
  moderate: "bg-amber-50 text-amber-800 border-amber-300",
  high: "bg-red-50 text-red-800 border-red-300",
};

const defaultDrugs = {
  amlodipine: {
    label: "Amlodipine (calcium channel blocker)",
    default_dose: 5,
    interval_h: 24,
  },
  losartan: {
    label: "Losartan (ARB)",
    default_dose: 50,
    interval_h: 24,
  },
  lisinopril: {
    label: "Lisinopril (ACE inhibitor)",
    default_dose: 10,
    interval_h: 24,
  },
  enalapril: {
    label: "Enalapril (ACE inhibitor)",
    default_dose: 10,
    interval_h: 24,
  },
  hydrochlorothiazide: {
    label: "Hydrochlorothiazide (thiazide diuretic)",
    default_dose: 25,
    interval_h: 24,
  },
  metoprolol: {
    label: "Metoprolol (beta-blocker)",
    default_dose: 50,
    interval_h: 12,
  },
  carvedilol: {
    label: "Carvedilol (alpha/beta blocker)",
    default_dose: 12.5,
    interval_h: 12,
  },
  diltiazem: {
    label: "Diltiazem (non-DHP calcium channel blocker)",
    default_dose: 120,
    interval_h: 24,
  },
  phenylephrine: {
    label: "Phenylephrine (IV vasopressor)",
    default_dose: 0.1,
    interval_h: 1,
  },
  norepinephrine: {
    label: "Norepinephrine (IV vasopressor)",
    default_dose: 0.04,
    interval_h: 0.5,
  },
};

export default function Dashboard() {
  const [drugs, setDrugs] = useState(defaultDrugs);
  const [health, setHealth] = useState({ status: "offline", version: "unknown", ml_model_loaded: false });
  const [activeTab, setActiveTab] = useState("bp");
  const [workspaceTab, setWorkspaceTab] = useState("simulation");
  const [patient, setPatient] = useState({
    name: "John Doe",
    patient_id: "PT-2026-081",
    age: 58,
    sex: "male",
    hr: 72,
    ef: 55,
    sbp: 145,
    dbp: 92,
    edv_ml: 120,
    south_asian_seeding: true,
  });
  const [ecgReportFile, setECGReportFile] = useState(null);
  const [regimen, setRegimen] = useState([
    { drug: "phenylephrine", dose_mg: 0.1, interval_h: 1, n_doses: 1 },
  ]);
  const [horizon, setHorizon] = useState(24);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [drugSearch, setDrugSearch] = useState("");
  const [showHeartViewer, setShowHeartViewer] = useState(false);

  // Helper function to execute the simulation
  async function executeSimulation(currentPatient, currentRegimen, currentHorizon) {
    setBusy(true);
    setError("");
    try {
      const hasBP = currentPatient.sbp != null && currentPatient.dbp != null;
      const simRes = await simulate({
        patient: {
          ...currentPatient,
          ef: currentPatient.ef / 100,
          sbp: hasBP ? currentPatient.sbp : null,
          dbp: hasBP ? currentPatient.dbp : null,
        },
        regimen: currentRegimen,
        horizon_h: currentHorizon,
        n_points: Math.min(100, Math.max(25, Math.round(currentHorizon * 2))),
      });
      setResult(simRes);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Load drugs and immediately run simulation on mount so desktop view is populated right away
  useEffect(() => {
    getDrugs()
      .then((d) => {
        setDrugs(d);
        executeSimulation(patient, regimen, horizon);
      })
      .catch((e) => setError(e.message));
    getHealth().then(setHealth).catch(() => {});
  }, []);

  const applyPreset = (type) => {
    let newPatient = { ...patient };
    let newRegimen = [...regimen];
    let newHorizon = horizon;

    if (type === "vasopressor") {
      newPatient = { name: "Case 61 Patient", patient_id: "VITAL-061", age: 58, sex: "male", hr: 65, ef: 55, sbp: 91, dbp: 56, edv_ml: 120, south_asian_seeding: false };
      newRegimen = [{ drug: "phenylephrine", dose_mg: 0.1, interval_h: 0.5, n_doses: 2 }];
      newHorizon = 2;
    } else if (type === "hypertension") {
      newPatient = { name: "Robert Chen", patient_id: "PT-2026-118", age: 62, sex: "male", hr: 82, ef: 52, sbp: 168, dbp: 102, edv_ml: 125, south_asian_seeding: true };
      newRegimen = [
        { drug: "amlodipine", dose_mg: 10, interval_h: 24, n_doses: 2 },
        { drug: "enalapril", dose_mg: 20, interval_h: 12, n_doses: 4 },
      ];
      newHorizon = 48;
    } else if (type === "normotensive") {
      newPatient = { name: "Sarah Johnson", patient_id: "PT-2026-042", age: 45, sex: "female", hr: 70, ef: 60, sbp: 120, dbp: 80, edv_ml: 120, south_asian_seeding: false };
      newRegimen = [{ drug: "amlodipine", dose_mg: 5, interval_h: 24, n_doses: 1 }];
      newHorizon = 24;
    } else if (type === "stiff_aorta") {
      newPatient = { name: "Eleanor Vance", patient_id: "PT-2026-093", age: 78, sex: "female", hr: 68, ef: 50, sbp: 172, dbp: 68, edv_ml: 115, south_asian_seeding: true };
      newRegimen = [{ drug: "metoprolol", dose_mg: 50, interval_h: 12, n_doses: 2 }];
      newHorizon = 24;
    } else if (type === "overdose") {
      newPatient = { name: "Test Subject Alpha", patient_id: "PT-TEST-999", age: 50, sex: "male", hr: 75, ef: 55, sbp: 118, dbp: 74, edv_ml: 120, south_asian_seeding: false };
      newRegimen = [
        { drug: "amlodipine", dose_mg: 40, interval_h: 24, n_doses: 1 },
        { drug: "enalapril", dose_mg: 80, interval_h: 24, n_doses: 1 },
      ];
      newHorizon = 24;
    }

    setPatient(newPatient);
    setRegimen(newRegimen);
    setHorizon(newHorizon);
    executeSimulation(newPatient, newRegimen, newHorizon);
  };

  const setR = (i) => (k) => (v) => setRegimen((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const pickDrug = (i) => (name) =>
    setRegimen((r) =>
      r.map((x, j) =>
        j === i
          ? {
              ...x,
              drug: name,
              dose_mg: drugs[name].default_dose,
              interval_h: drugs[name].interval_h,
            }
          : x
      )
    );

  const addDrug = () => {
    const n = Object.keys(drugs).find((d) => !regimen.some((r) => r.drug === d)) || Object.keys(drugs)[0];
    setRegimen((r) => [
      ...r,
      { drug: n, dose_mg: drugs[n].default_dose, interval_h: drugs[n].interval_h, n_doses: 1 },
    ]);
  };

  const { chartData: data, finalPoint: last } = buildSimulationDisplay(result);

  const concLines = Object.keys(result?.concentrations || {}).map((drugName, idx) => {
    const palette = ["#7C3AED", "#0D9488", "#DC2626", "#2563EB", "#D97706"];
    return {
      key: `conc_${drugName}`,
      name: `${drugName.toUpperCase()} Level`,
      color: palette[idx % palette.length],
      w: 2.5,
    };
  });
  const matchingDrugs = Object.entries(drugs).filter(([key, drug]) =>
    `${key} ${drug.label} ${drug.drug_class} ${drug.route} ${drug.modeling_role} ${drug.mechanism} ${drug.evidence}`
      .toLowerCase()
      .includes(drugSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col w-full">
      {/* 1. Header Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 w-full shadow-sm">
        <div className="w-full px-6 lg:px-10 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/assets/digitwin-logo.svg"
              alt="DigiTwin — Cardiovascular Simulation Platform"
              className="h-10 w-auto"
              width="228"
              height="48"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowDocs(!showDocs)}
              className="text-xs font-medium bg-slate-800 hover:bg-slate-700 text-gray-200 px-3.5 py-1.5 rounded border border-slate-700 transition"
            >
              {showDocs ? "Hide Model Details" : "Model Details"}
            </button>
          </div>
        </div>
      </header>

      {/* Model Details Drawer */}
      {showDocs && (
        <div className="bg-white border-b border-gray-200 p-6 text-gray-700 text-sm w-full shadow-sm">
          <div className="w-full px-6 lg:px-10 grid md:grid-cols-2 gap-6">
            <div className="space-y-1.5 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <span className="font-bold text-gray-900 text-xs uppercase tracking-wide block">
                0D Windkessel Model
              </span>
              <p className="text-gray-600 text-xs leading-relaxed">
                Uses a 3-element Windkessel circuit (peripheral resistance R and compliance C) to model continuous arterial pressure and afterload.
              </p>
            </div>

            <div className="space-y-1.5 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <span className="font-bold text-gray-900 text-xs uppercase tracking-wide block">
                Drug Response
              </span>
              <p className="text-gray-600 text-xs leading-relaxed">
                Phenylephrine parameters have a historical fit attribution to VitalDB Case 61, but the source signals are not present in this checkout and the fit is not reproducible here. Other medications use assumed illustrative parameters.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. FULL-WIDTH DESKTOP WORKSPACE */}
      <main className="flex-1 w-full px-6 lg:px-10 py-6 space-y-6">
        <div role="tablist" aria-label="DigiTwin workspace" className="flex gap-2 border-b border-gray-200">
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === "simulation"}
            aria-controls="simulation-workspace"
            onClick={() => setWorkspaceTab("simulation")}
            className={`border-b-2 px-4 py-2 text-xs font-bold ${
              workspaceTab === "simulation"
                ? "border-teal-700 text-teal-900"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Simulation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === "ecg"}
            aria-controls="ecg-analysis-workspace"
            onClick={() => setWorkspaceTab("ecg")}
            className={`border-b-2 px-4 py-2 text-xs font-bold ${
              workspaceTab === "ecg"
                ? "border-teal-700 text-teal-900"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            ECG Analysis
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === "forecast"}
            aria-controls="forecast-workspace"
            onClick={() => setWorkspaceTab("forecast")}
            className={`border-b-2 px-4 py-2 text-xs font-bold ${
              workspaceTab === "forecast"
                ? "border-teal-700 text-teal-900"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Time-Series Vitals Forecast
          </button>
        </div>

        {workspaceTab === "ecg" ? (
          <section
            id="ecg-analysis-workspace"
            role="tabpanel"
            aria-label="ECG Analysis"
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <ECGAnalysisPanel
              runId={result?.run_id}
              initialFile={ecgReportFile}
              onFileSelected={setECGReportFile}
              onApplyToPatient={(vals) => setPatient((p) => ({ ...p, ...vals }))}
              onApplyECGRecommendation={(drugRec, vitalsOrHr) => {
                const vitals = typeof vitalsOrHr === "object" && vitalsOrHr !== null
                  ? vitalsOrHr
                  : vitalsOrHr != null ? { hr: vitalsOrHr } : {};
                const updatedPatient = {
                  ...patient,
                  ...vitals,
                };
                setPatient(updatedPatient);
                const newReg = drugRec?.regimen || regimen;
                if (drugRec?.regimen) {
                  setRegimen(drugRec.regimen);
                }
                executeSimulation(updatedPatient, newReg, horizon);
                setWorkspaceTab("simulation");
                window.scrollTo({ top: 350, behavior: "smooth" });
              }}
            />
          </section>
        ) : workspaceTab === "forecast" ? (
          <section
            id="forecast-workspace"
            role="tabpanel"
            aria-label="Time-Series Vitals Forecast"
          >
            <ForecastPanel />
          </section>
        ) : (
          <div id="simulation-workspace" role="tabpanel" aria-label="Simulation">
        {/* Quick Clinical Scenarios Bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mr-1">
              Clinical Scenarios:
            </span>
            <button
              type="button"
              onClick={() => applyPreset("hypertension")}
              className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 px-3 py-1.5 rounded text-xs font-semibold transition cursor-pointer"
            >
              High Blood Pressure
            </button>
            <button
              type="button"
              onClick={() => applyPreset("normotensive")}
              className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 px-3 py-1.5 rounded text-xs font-semibold transition cursor-pointer"
            >
              Normal Adult
            </button>
            <button
              type="button"
              onClick={() => applyPreset("stiff_aorta")}
              className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 px-3 py-1.5 rounded text-xs font-semibold transition cursor-pointer"
            >
              Elderly Patient
            </button>
            <button
              type="button"
              onClick={() => applyPreset("overdose")}
              className="bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 px-3 py-1.5 rounded text-xs font-semibold transition cursor-pointer"
            >
              High-Dose Scenario
            </button>
          </div>
        </div>

        {/* TOP ROW: Patient & Regimen Controls Laid Out Horizontally Across Desktop */}
        <section className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Box 1: Patient Information (5 columns) */}
          <div className="lg:col-span-5 h-full">
            <PatientForm
              patient={patient}
              setPatient={setPatient}
              onECGReportSelected={setECGReportFile}
            />
          </div>

          {/* Box 2: Medications (4 columns) */}
          <div className="lg:col-span-4 bg-white border border-gray-200 rounded-lg p-5 space-y-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3.5">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Medications
                </h2>
                <span className="text-xs text-gray-500 font-medium">Treatment Plan</span>
              </div>

              <div className="space-y-3.5">
                {regimen.map((r, i) => (
                  <DrugSlider
                    key={i}
                    item={r}
                    drugs={drugs}
                    onChange={setR(i)}
                    onPick={pickDrug(i)}
                    onRemove={() => setRegimen((x) => x.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            </div>

            <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-gray-700">
                Search medication information
              </summary>
              <div className="mt-3 space-y-2">
                <label htmlFor="drug-search" className="sr-only">Search medication information</label>
                <input
                  id="drug-search"
                  type="search"
                  value={drugSearch}
                  onChange={(event) => setDrugSearch(event.target.value)}
                  placeholder="Search name, route, class, or evidence"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-xs"
                />
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {matchingDrugs.map(([key, drug]) => (
                    <li key={key} className="rounded border border-gray-200 bg-white p-2 text-[11px]">
                      <strong className="text-gray-800">{drug.label}</strong>
                      <p className="mt-0.5 text-gray-600">{drug.drug_class} · {drug.route} · {drug.evidence}</p>
                      <p className="mt-0.5 text-gray-600">{drug.modeling_role}</p>
                      <p className="mt-0.5 text-gray-600">{drug.source}</p>
                    </li>
                  ))}
                  {matchingDrugs.length === 0 && (
                    <li className="text-xs text-gray-500">No medication information matches that search.</li>
                  )}
                </ul>
              </div>
            </details>

            <button
              type="button"
              className="w-full py-2.5 border border-dashed border-gray-300 hover:border-teal-600 text-gray-700 hover:text-teal-700 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 mt-2"
              onClick={addDrug}
              disabled={!Object.keys(drugs).length}
            >
              <span>+ Add medication</span>
            </button>
          </div>

          {/* Box 3: Simulation Time & Run Action (3 columns) */}
          <div className="lg:col-span-3 bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                  Simulation Time
                </h2>
                <span className="text-sm font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
                  {horizon} hours
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-xs">
                {[2, 12, 24, 72].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHorizon(h)}
                    className={`py-2 rounded font-medium border transition ${
                      horizon === h
                        ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>

              <Num name="Custom Duration" unit="hours" value={horizon} onChange={(v) => setHorizon(v || 24)} min={1} max={240} />
            </div>

            <button
              onClick={() => executeSimulation(patient, regimen, horizon)}
              disabled={busy}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3.5 px-4 text-sm font-bold rounded-lg shadow-sm transition disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {busy ? "Running simulation..." : "Run Simulation"}
            </button>
          </div>
        </section>

        {error && (
          <div role="alert" className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 font-medium">
            {error}
          </div>
        )}

        {busy && !result && (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center shadow-sm space-y-3 w-full">
            <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-gray-700">Computing hemodynamic simulation response...</p>
          </div>
        )}

        {/* Simulation result cards */}
        {result && last && (
          <section className="space-y-6 w-full">
            {/* Parameters & Patient Info Bar */}
            <div className="bg-white border border-gray-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm w-full">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold text-gray-900 text-sm flex items-center gap-1.5 bg-teal-50 text-teal-900 px-3 py-1 rounded border border-teal-200">
                  <span className="w-2 h-2 rounded-full bg-teal-600 inline-block animate-pulse"></span>
                  <span>{patient.name || "Anonymous Patient"}</span>
                  <span className="text-teal-700 font-mono text-xs">({patient.patient_id || "PT-001"})</span>
                </span>
                <span className="text-gray-300">|</span>
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded border border-gray-200 font-mono">
                  Resistance (R): {result.model.R} mmHg&middot;s/ml
                </span>
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded border border-gray-200 font-mono">
                  Compliance (C): {result.model.C} ml/mmHg
                </span>
                <span className="text-gray-500">
                  &bull; {result.model.source}
                </span>
              </div>
              <div className="text-gray-500 font-medium">
                Session: {result.run_id} &bull; Duration: {horizon} hours &bull; Latency: {result.latency_ms} ms
              </div>
            </div>

            {/* 3 Result Cards: Baseline, Simulated Outcome, Suggested Drug */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
              {/* 1. Baseline */}
              <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">
                    Baseline Vitals
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                    Start
                  </span>
                </div>

                <div>
                  <div className="text-4xl font-bold text-gray-900 font-mono">
                    {result.baseline.sbp}/{result.baseline.dbp}
                    <span className="text-xs font-normal text-gray-500 ml-1 font-sans">mmHg</span>
                  </div>
                  <span className="text-xs text-gray-500 block mt-1">
                    {MODEL_DERIVED_MAP_LABEL}: {result.baseline.map} mmHg &bull; Pulse Pressure: {result.baseline.sbp - result.baseline.dbp} mmHg
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 text-sm">
                  <div>
                    <span className="text-xs text-gray-500 block">Heart Rate</span>
                    <span className="font-bold text-gray-800 text-base">{result.baseline.hr} bpm</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Ejection Fraction</span>
                    <span className="font-bold text-gray-800 text-base">{result.baseline.ef}%</span>
                  </div>
                </div>
              </div>

              {/* 2. Physics Simulation */}
              <div className="bg-white border border-teal-300 rounded-lg p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-teal-50 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-teal-900">
                    Hypothetical Simulated Outcome
                  </span>
                  <span className="text-xs bg-teal-50 text-teal-800 px-2 py-0.5 rounded font-medium border border-teal-200">
                    After {horizon}h
                  </span>
                </div>

                <div>
                  <div className="text-4xl font-bold text-teal-950 font-mono">
                    {last.sbp}/{last.dbp}
                    <span className="text-xs font-normal text-teal-700 ml-1 font-sans">mmHg</span>
                  </div>
                  <span className="text-xs text-teal-800 block mt-1">
                    {MODEL_DERIVED_MAP_LABEL}: {last.map} mmHg &bull; Change: {(last.map - result.baseline.map) >= 0 ? "+" : ""}{(last.map - result.baseline.map).toFixed(1)} mmHg
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-teal-50 text-sm">
                  <div>
                    <span className="text-xs text-teal-700 block">Final Heart Rate</span>
                    <span className="font-bold text-teal-950 text-base">{last.hr} bpm</span>
                  </div>
                  <div>
                    <span className="text-xs text-teal-700 block">Model Flags</span>
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded border ${riskBadge[result.risk]}`}>
                      {result.risk}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Suggested Drug for Patient */}
              {result?.drug_safety && (
                <div
                  className={`bg-white rounded-lg p-5 shadow-sm space-y-3 flex flex-col justify-between border ${
                    result.drug_safety.same_drug_is_okay
                      ? "border-emerald-300"
                      : "border-amber-300"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-gray-600">
                        Suggested Drug
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium border ${
                          result.drug_safety.same_drug_is_okay
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        {result.drug_safety.same_drug_is_okay
                          ? "Current Drug Approved"
                          : "Safer Drug Required"}
                      </span>
                    </div>

                    <div>
                      <div className="text-3xl font-bold text-gray-900 font-sans tracking-tight">
                        {result.drug_safety.safest_label.split(" (")[0]}
                        <span className="text-xs font-normal text-gray-500 ml-1.5 font-sans">
                          {result.drug_safety.safest_dose} mg
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 block mt-1">
                        Interval: q{result.drug_safety.safest_interval}h &bull; Safety Score: {result.drug_safety.safest_score}/100
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 text-sm">
                      <div>
                        <span className="text-xs text-gray-500 block">Next Simulation</span>
                        <span
                          className={`font-bold text-sm ${
                            result.drug_safety.same_drug_is_okay
                              ? "text-emerald-800"
                              : "text-amber-800"
                          }`}
                        >
                          {result.drug_safety.same_drug_is_okay
                            ? "Maintain Same Drug"
                            : "Switch Recommended"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Action</span>
                        {result.drug_safety.same_drug_is_okay ? (
                          <span className="text-xs text-gray-600 font-medium">
                            Approved to continue
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (result.drug_safety.switch_regimen) {
                                setRegimen(result.drug_safety.switch_regimen);
                                executeSimulation(patient, result.drug_safety.switch_regimen, horizon);
                              }
                            }}
                            className="bg-teal-700 hover:bg-teal-800 text-white font-bold px-2.5 py-1 rounded text-xs transition cursor-pointer"
                          >
                            Apply &amp; Simulate
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="pt-2 border-t border-gray-100 text-xs text-gray-600 leading-relaxed">
                    {result.drug_safety.status_message}
                  </p>
                </div>
              )}
            </div>

            {/* BOTTOM SECTION: Full-Width Chart Workspace */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-4 w-full">
              {/* Tab Navigation */}
              <div className="flex flex-wrap items-center justify-between border-b border-gray-200 pb-3.5 gap-3">
                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-md">
                  <button
                    type="button"
                    onClick={() => setActiveTab("bp")}
                    className={`px-4 py-2 rounded text-xs font-bold transition ${
                      activeTab === "bp"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Blood Pressure
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("hr")}
                    className={`px-4 py-2 rounded text-xs font-bold transition ${
                      activeTab === "hr"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Heart Rate
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("ef")}
                    className={`px-4 py-2 rounded text-xs font-bold transition ${
                      activeTab === "ef"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Ejection Fraction
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("pk")}
                    className={`px-4 py-2 rounded text-xs font-bold transition ${
                      activeTab === "pk"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Drug Levels
                  </button>
                </div>

                <span className="text-xs text-gray-500 font-medium">
                  Sample points: {data?.length || 0}
                </span>
              </div>

              {activeTab === "bp" && (
                <div className="space-y-2">
                  <BPChart data={data} />
                </div>
              )}

              {activeTab === "hr" && (
                <div className="space-y-2">
                  <HRChart data={data} />
                </div>
              )}

              {activeTab === "ef" && (
                <div className="space-y-2">
                  <EFChart data={data} />
                </div>
              )}

              {activeTab === "pk" && (
                <div className="space-y-2">
                  <Trend
                    title="Drug Concentration"
                    unit="ug/L"
                    data={data}
                    height={320}
                    lines={concLines}
                  />
                </div>
              )}

            </div>

            {/* Safety Alerts & Threshold Evaluation */}
            <RiskPanel
              flags={result.flags}
              result={result}
              patient={patient}
              regimen={regimen}
              horizon={horizon}
              onApplyRegimen={(newRegimen) => {
                setRegimen(newRegimen);
                executeSimulation(patient, newRegimen, horizon);
              }}
            />

            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setShowHeartViewer((visible) => !visible)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50"
                aria-expanded={showHeartViewer}
                aria-controls="heart-3d-panel"
              >
                {showHeartViewer ? "Hide 3D Heart Simulation" : "Open 3D Heart Simulation"}
              </button>
              {showHeartViewer && (
                <Suspense fallback={<p role="status" className="text-sm text-gray-600">Loading 3D viewer…</p>}>
                  <Heart3DPanel patient={patient} result={result} />
                </Suspense>
              )}
            </section>

            {/* Footer */}
            <div className="text-xs text-gray-500 border-t border-gray-200 pt-4 flex flex-wrap items-center justify-between gap-3 w-full">
              <span>
                Model: 0D Windkessel + illustrative PK-PD simulation
              </span>
              <span>
                For simulation testing only. Not for clinical diagnosis or prescription.
              </span>
            </div>
          </section>
        )}
          </div>
        )}
      </main>
    </div>
  );
}
