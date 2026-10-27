import { useEffect, useState } from "react";
import { getDrugs, getHealth, simulate, forecast } from "../api/client.js";
import BPChart from "../components/BPChart.jsx";
import DrugSlider from "../components/DrugSlider.jsx";
import EFChart from "../components/EFChart.jsx";
import HRChart from "../components/HRChart.jsx";
import PatientForm from "../components/PatientForm.jsx";
import RiskPanel from "../components/RiskPanel.jsx";
import Trend from "../components/Trend.jsx";
import Heart3D from "../components/Heart3D.jsx";
import DrugsTab from "../components/DrugsTab.jsx";
import HistoryTab from "../components/HistoryTab.jsx";
import DrugOptimizer from "../components/DrugOptimizer.jsx";
import FutureSafetyPrognosis from "../components/FutureSafetyPrognosis.jsx";
import { Num } from "../components/ui.jsx";

const riskBadge = {
  low: "bg-emerald-50 text-emerald-800 border-emerald-300",
  moderate: "bg-amber-50 text-amber-800 border-amber-300",
  high: "bg-red-50 text-red-800 border-red-300",
};

export default function Dashboard() {
  const [drugs, setDrugs] = useState({});
  const [health, setHealth] = useState({ version: "0.2", ml_model_loaded: true });
  const [mainView, setMainView] = useState("workstation"); // "workstation" | "heart3d" | "drugs" | "prognosis" | "history"
  const [activeTab, setActiveTab] = useState("bp");
  const [patient, setPatient] = useState({
    name: "Demo Patient",
    patient_id: "PT-8291",
    age: 58,
    sex: "male",
    hr: 72,
    ef: 55,
    sbp: 145,
    dbp: 92,
    edv_ml: 120,
    medical_history: "Essential hypertension (Stage 1)",
    allergies: "No known drug allergies",
    current_medications: "None",
    south_asian_seeding: true,
  });
  const [regimen, setRegimen] = useState([
    { drug: "phenylephrine", dose_mg: 0.1, interval_h: 1, n_doses: 1 },
  ]);
  const [horizon, setHorizon] = useState(24);
  const [result, setResult] = useState(null);
  const [aiForecast, setAiForecast] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDocs, setShowDocs] = useState(false);

  // Helper function to execute simulation and forecast
  async function executeSimulation(currentPatient, currentRegimen, currentHorizon) {
    setBusy(true);
    setError("");
    try {
      const hasBP = currentPatient.sbp != null && currentPatient.dbp != null;
      const curSbp = hasBP ? Number(currentPatient.sbp) : 120;
      const curDbp = hasBP ? Number(currentPatient.dbp) : 80;
      const curHr = Number(currentPatient.hr) || 75;

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

      try {
        const fcRes = await forecast({
          sbp: Array(30).fill(curSbp),
          dbp: Array(30).fill(curDbp),
          hr: Array(30).fill(curHr),
          drug_rate: Array(30).fill(0.0),
        });
        setAiForecast(fcRes);
      } catch (fcErr) {
        console.warn("AI forecast endpoint unavailable:", fcErr);
        setAiForecast(null);
      }
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
      newPatient = {
        name: "Case 61 (VitalDB)",
        patient_id: "SNU-0061",
        age: 58,
        sex: "male",
        hr: 65,
        ef: 55,
        sbp: 91,
        dbp: 56,
        edv_ml: 120,
        medical_history: "Intraoperative hypotension during laparotomy",
        allergies: "No known drug allergies",
        current_medications: "Sevoflurane inhalation, Rocuronium",
        south_asian_seeding: false,
      };
      newRegimen = [{ drug: "phenylephrine", dose_mg: 0.1, interval_h: 0.5, n_doses: 2 }];
      newHorizon = 2;
    } else if (type === "hypertension") {
      newPatient = {
        name: "Robert Chen",
        patient_id: "PT-4820",
        age: 62,
        sex: "male",
        hr: 82,
        ef: 52,
        sbp: 168,
        dbp: 102,
        edv_ml: 125,
        medical_history: "Essential hypertension (Stage 2), Hyperlipidemia",
        allergies: "Penicillin (rash)",
        current_medications: "Atorvastatin 20mg",
        south_asian_seeding: true,
      };
      newRegimen = [
        { drug: "amlodipine", dose_mg: 10, interval_h: 24, n_doses: 2 },
        { drug: "enalapril", dose_mg: 20, interval_h: 12, n_doses: 4 },
      ];
      newHorizon = 48;
    } else if (type === "normotensive") {
      newPatient = {
        name: "Sarah Miller",
        patient_id: "PT-1943",
        age: 45,
        sex: "female",
        hr: 70,
        ef: 60,
        sbp: 120,
        dbp: 80,
        edv_ml: 120,
        medical_history: "None (Annual wellness check)",
        allergies: "No known drug allergies",
        current_medications: "Multivitamin",
        south_asian_seeding: false,
      };
      newRegimen = [{ drug: "amlodipine", dose_mg: 5, interval_h: 24, n_doses: 1 }];
      newHorizon = 24;
    } else if (type === "stiff_aorta") {
      newPatient = {
        name: "Eleanor Vance",
        patient_id: "PT-7731",
        age: 78,
        sex: "female",
        hr: 68,
        ef: 50,
        sbp: 172,
        dbp: 68,
        edv_ml: 115,
        medical_history: "Isolated systolic hypertension, vascular calcification",
        allergies: "Sulfa antibiotics",
        current_medications: "Calcium + Vitamin D",
        south_asian_seeding: true,
      };
      newRegimen = [{ drug: "metoprolol", dose_mg: 50, interval_h: 12, n_doses: 2 }];
      newHorizon = 24;
    } else if (type === "overdose") {
      newPatient = {
        name: "James Wilson",
        patient_id: "PT-9012",
        age: 50,
        sex: "male",
        hr: 75,
        ef: 55,
        sbp: 118,
        dbp: 74,
        edv_ml: 120,
        medical_history: "Depression, Mild hypertension",
        allergies: "Codeine",
        current_medications: "Sertraline 50mg",
        south_asian_seeding: false,
      };
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

  const handleRestoreSession = (run) => {
    if (run.request?.patient) {
      setPatient(run.request.patient);
    }
    if (run.request?.regimen) {
      setRegimen(run.request.regimen);
    }
    if (run.request?.horizon_h) {
      setHorizon(run.request.horizon_h);
    }
    if (run.result) {
      setResult(run.result);
    }
    setMainView("workstation");
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

  const data = result?.series.map((s, idx) => {
    const concItems = {};
    if (result.concentrations) {
      Object.entries(result.concentrations).forEach(([drugKey, arr]) => {
        concItems[`conc_${drugKey}`] = arr[idx] ?? 0;
      });
    }
    return {
      ...s,
      ...concItems,
      base_sbp: result.baseline.sbp,
      base_dbp: result.baseline.dbp,
      base_hr: result.baseline.hr,
      base_ef: result.baseline.ef,
    };
  });
  const last = result?.series.at(-1);

  const concLines = Object.keys(result?.concentrations || {}).map((drugName, idx) => {
    const palette = ["#7C3AED", "#0D9488", "#DC2626", "#2563EB", "#D97706"];
    return {
      key: `conc_${drugName}`,
      name: `${drugName.toUpperCase()} Level`,
      color: palette[idx % palette.length],
      w: 2.5,
    };
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col w-full">
      {/* 1. Header Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 w-full shadow-sm">
        <div className="w-full px-6 lg:px-10 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-base">
              DT
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight text-white">
                DigiTwin
              </div>
              <p className="text-xs text-gray-400">
                Cardiovascular Simulation Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300 bg-slate-800 px-3 py-1.5 rounded border border-slate-700">
              System Ready
            </span>
            <button
              type="button"
              onClick={() => setShowDocs(!showDocs)}
              className="text-xs font-medium bg-slate-800 hover:bg-slate-700 text-gray-200 px-3.5 py-1.5 rounded border border-slate-700 transition"
            >
              {showDocs ? "Hide Model Details" : "Model Details"}
            </button>
          </div>
        </div>

        {/* Primary View Navigation Bar */}
        <div className="bg-slate-800 border-t border-slate-700/60 px-6 lg:px-10 py-2 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMainView("workstation")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                mainView === "workstation"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              <span>Simulation Workstation</span>
            </button>
            <button
              type="button"
              onClick={() => setMainView("heart3d")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                mainView === "heart3d"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              <span>3D Cardiac View</span>
            </button>
            <button
              type="button"
              onClick={() => setMainView("drugs")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                mainView === "drugs"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              <span>Virtual Drug Trial</span>
            </button>
            <button
              type="button"
              onClick={() => setMainView("prognosis")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                mainView === "prognosis"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              <span>Future Outcomes &amp; Safety</span>
            </button>
            <button
              type="button"
              onClick={() => setMainView("history")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
                mainView === "history"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700"
              }`}
            >
              <span>Session History</span>
            </button>
          </nav>

          <div className="text-xs text-slate-300 hidden md:flex items-center gap-2">
            <span className="text-slate-400">Current Session:</span>
            <span className="bg-slate-900 px-2.5 py-0.5 rounded border border-slate-700 text-teal-400 font-medium">
              {patient.name} ({patient.patient_id})
            </span>
          </div>
        </div>
      </header>

      {/* Model Details Drawer */}
      {showDocs && (
        <div className="bg-white border-b border-gray-200 p-6 text-gray-700 text-sm w-full shadow-sm">
          <div className="w-full px-6 lg:px-10 grid md:grid-cols-3 gap-6">
            <div className="space-y-1.5 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <span className="font-semibold text-gray-900 text-xs block">
                0D Windkessel Model
              </span>
              <p className="text-gray-600 text-xs leading-relaxed">
                Uses a 3-element Windkessel circuit (peripheral resistance R and compliance C) to model continuous arterial pressure and afterload.
              </p>
            </div>

            <div className="space-y-1.5 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <span className="font-semibold text-gray-900 text-xs block">
                Short-Term AI Forecast
              </span>
              <p className="text-gray-600 text-xs leading-relaxed">
                Trained XGBoost model predicting blood pressure and heart rate 5 minutes ahead based on previous measurement trends.
              </p>
            </div>

            <div className="space-y-1.5 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <span className="font-semibold text-gray-900 text-xs block">
                Drug Response Engine
              </span>
              <p className="text-gray-600 text-xs leading-relaxed">
                Phenylephrine response is fitted directly to clinical arterial line data from VitalDB Case 61. Other oral medications use standard literature parameters.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. MAIN APPLICATION CONTENT */}
      <main className="flex-1 w-full px-6 lg:px-10 py-6 space-y-6">
        {/* 3D Heart View */}
        {mainView === "heart3d" && (
          <div className="space-y-6 w-full">
            <Heart3D
              sbp={result ? (result.series.at(-1)?.sbp || result.baseline.sbp) : (patient.sbp || 120)}
              dbp={result ? (result.series.at(-1)?.dbp || result.baseline.dbp) : (patient.dbp || 80)}
              hr={result ? (result.series.at(-1)?.hr || result.baseline.hr) : (patient.hr || 72)}
              ef={patient.ef || 55}
              edv={patient.edv_ml || 120}
            />
          </div>
        )}

        {/* Virtual Drug Trial Tab */}
        {mainView === "drugs" && (
          <DrugsTab
            drugs={drugs}
            patient={patient}
            onSelectScenario={(scId) => {
              applyPreset(scId);
              setMainView("workstation");
            }}
            onApplyOptimalRegimen={(optReg) => {
              setRegimen(optReg);
              executeSimulation(patient, optReg, horizon);
              setMainView("workstation");
            }}
            result={result}
          />
        )}

        {/* Future Outcomes & Safety Tab */}
        {mainView === "prognosis" && (
          <div className="space-y-6 w-full">
            <FutureSafetyPrognosis patient={patient} regimen={regimen} horizon={horizon} />
          </div>
        )}

        {/* Clinical Session History Tab (SQLite) */}
        {mainView === "history" && (
          <HistoryTab onLoadSession={handleRestoreSession} />
        )}

        {/* Primary Simulation Workstation View */}
        {mainView === "workstation" && (
          <>
            {/* Quick Clinical Scenarios Bar */}
            <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 mr-1">
                  Patient Scenarios:
                </span>
            <button
              type="button"
              onClick={() => applyPreset("vasopressor")}
              className="bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 px-3 py-1.5 rounded text-xs font-medium transition"
            >
              Case 61 (Vasopressor)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("hypertension")}
              className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 px-3 py-1.5 rounded text-xs font-medium transition"
            >
              High Blood Pressure
            </button>
            <button
              type="button"
              onClick={() => applyPreset("normotensive")}
              className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 px-3 py-1.5 rounded text-xs font-medium transition"
            >
              Normal Adult
            </button>
            <button
              type="button"
              onClick={() => applyPreset("stiff_aorta")}
              className="bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200 px-3 py-1.5 rounded text-xs font-medium transition"
            >
              Elderly Patient
            </button>
            <button
              type="button"
              onClick={() => applyPreset("overdose")}
              className="bg-red-50 hover:bg-red-100 text-red-900 border border-red-200 px-3 py-1.5 rounded text-xs font-medium transition"
            >
              Overdose Test
            </button>
          </div>
          <span className="text-xs text-gray-500 font-medium">
            Select a preset scenario to populate vitals & medications
          </span>
        </div>

        {/* TOP ROW: Patient & Regimen Controls Laid Out Horizontally Across Desktop */}
        <section className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Box 1: Patient Information (5 columns) */}
          <div className="lg:col-span-5 h-full">
            <PatientForm
              patient={patient}
              setPatient={setPatient}
              onAutoSimulate={(p) => executeSimulation(p, regimen, horizon)}
            />
          </div>

          {/* Box 2: Medications (4 columns) */}
          <div className="lg:col-span-4 bg-white border border-gray-200 rounded-lg p-5 space-y-4 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3.5">
                <h2 className="text-sm font-semibold text-gray-800">
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
                <h2 className="text-sm font-semibold text-gray-800">
                  Simulation Duration
                </h2>
                <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded border border-teal-200">
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

              <div className="bg-gray-50 p-3 rounded border border-gray-200 text-xs text-gray-600 space-y-1">
                <span className="font-semibold text-gray-800 block">Simulation Engine:</span>
                <p>3-Element Windkessel (R-C-Rc) coupled with PK-PD arterial pharmacodynamics.</p>
              </div>
            </div>

            <button
              onClick={() => executeSimulation(patient, regimen, horizon)}
              disabled={busy}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-3.5 px-4 text-sm font-semibold rounded-lg shadow-sm transition disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {busy ? "Running simulation..." : "Run Simulation"}
            </button>
          </div>
        </section>

        {/* Intelligent Medication Selection / Best Drug Optimizer */}
        <DrugOptimizer
          patient={patient}
          onApplyOptimalRegimen={(optReg) => {
            setRegimen(optReg);
            executeSimulation(patient, optReg, horizon);
          }}
        />

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

        {/* MIDDLE ROW: 3 Large Telemetry Vitals Cards (Baseline, AI Forecast, Simulation) */}
        {result && last && (
          <section className="space-y-6 w-full">
            {/* Parameters Bar */}
            <div className="bg-white border border-gray-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm w-full">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-gray-800 text-sm">Model Parameters:</span>
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded border border-gray-200 font-medium tabular-nums">
                  Resistance (R): {result.model.R} mmHg&middot;s/ml
                </span>
                <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded border border-gray-200 font-medium tabular-nums">
                  Compliance (C): {result.model.C} ml/mmHg
                </span>
                <span className="text-gray-500">
                  &bull; {result.model.source}
                </span>
              </div>
              <div className="text-gray-500 font-medium">
                Duration: {horizon} hours &bull; Latency: {result.latency_ms} ms
              </div>
            </div>

            {/* 3 Result Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              {/* 1. Baseline */}
              <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <span className="text-xs font-semibold text-gray-700">
                    Baseline Vitals
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                    Initial
                  </span>
                </div>

                <div>
                  <div className="text-3xl font-bold text-gray-900 tracking-tight tabular-nums">
                    {result.baseline.sbp}/{result.baseline.dbp}
                    <span className="text-xs font-normal text-gray-500 ml-1.5">mmHg</span>
                  </div>
                  <span className="text-xs text-gray-500 block mt-1">
                    MAP: {result.baseline.map} mmHg &bull; Pulse Pressure: {result.baseline.sbp - result.baseline.dbp} mmHg
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 text-sm">
                  <div>
                    <span className="text-xs text-gray-500 block">Heart Rate</span>
                    <span className="font-semibold text-gray-800 text-base">{result.baseline.hr} bpm</span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Ejection Fraction</span>
                    <span className="font-semibold text-gray-800 text-base">{result.baseline.ef}%</span>
                  </div>
                </div>
              </div>

              {/* 2. AI Forecast */}
              <div className="bg-white border border-indigo-200 rounded-lg p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-indigo-50 pb-2">
                  <span className="text-xs font-semibold text-indigo-900">
                    5-Minute Forecast (AI)
                  </span>
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium border border-indigo-200">
                    XGBoost
                  </span>
                </div>

                {aiForecast ? (
                  <div>
                    <div className="text-3xl font-bold text-indigo-950 tracking-tight tabular-nums">
                      {aiForecast.sbp}/{aiForecast.dbp}
                      <span className="text-xs font-normal text-indigo-600 ml-1.5">mmHg</span>
                    </div>
                    <div className="text-xs text-indigo-700 font-medium mt-1">
                      <span>Change: SBP {(aiForecast.sbp - aiForecast.persistence.sbp) >= 0 ? "+" : ""}{(aiForecast.sbp - aiForecast.persistence.sbp).toFixed(1)}</span>
                      <span className="mx-1">&bull;</span>
                      <span>DBP {(aiForecast.dbp - aiForecast.persistence.dbp) >= 0 ? "+" : ""}{(aiForecast.dbp - aiForecast.persistence.dbp).toFixed(1)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-2 text-xs text-indigo-700">Forecast ready</div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-indigo-50 text-sm">
                  <div>
                    <span className="text-xs text-indigo-600 block">Predicted HR</span>
                    <span className="font-semibold text-indigo-950 text-base">{aiForecast?.hr ?? "--"} bpm</span>
                  </div>
                  <div>
                    <span className="text-xs text-indigo-600 block">Lead Time</span>
                    <span className="font-semibold text-indigo-950 text-base">+5 minutes</span>
                  </div>
                </div>
              </div>

              {/* 3. Physics Simulation */}
              <div className="bg-white border border-teal-300 rounded-lg p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-teal-50 pb-2">
                  <span className="text-xs font-semibold text-teal-900">
                    Simulated Outcome
                  </span>
                  <span className="text-xs bg-teal-50 text-teal-800 px-2 py-0.5 rounded font-medium border border-teal-200">
                    After {horizon}h
                  </span>
                </div>

                <div>
                  <div className="text-3xl font-bold text-teal-950 tracking-tight tabular-nums">
                    {last.sbp}/{last.dbp}
                    <span className="text-xs font-normal text-teal-700 ml-1.5">mmHg</span>
                  </div>
                  <span className="text-xs text-teal-800 block mt-1">
                    Final MAP: {last.map} mmHg &bull; Delta: {(last.map - result.baseline.map) >= 0 ? "+" : ""}{(last.map - result.baseline.map).toFixed(1)} mmHg
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-teal-50 text-sm">
                  <div>
                    <span className="text-xs text-teal-700 block">Final Heart Rate</span>
                    <span className="font-semibold text-teal-950 text-base">{last.hr} bpm</span>
                  </div>
                  <div>
                    <span className="text-xs text-teal-700 block">Safety Status</span>
                    <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded border ${riskBadge[result.risk]}`}>
                      {result.risk}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTOM SECTION: Full-Width Chart Workspace */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-4 w-full">
              {/* Tab Navigation */}
              <div className="flex flex-wrap items-center justify-between border-b border-gray-200 pb-3.5 gap-3">
                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-md">
                  <button
                    type="button"
                    onClick={() => setActiveTab("bp")}
                    className={`px-4 py-2 rounded text-xs font-medium transition ${
                      activeTab === "bp"
                        ? "bg-white text-gray-900 shadow-sm font-semibold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Blood Pressure
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("hr")}
                    className={`px-4 py-2 rounded text-xs font-medium transition ${
                      activeTab === "hr"
                        ? "bg-white text-gray-900 shadow-sm font-semibold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Heart Rate
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("ef")}
                    className={`px-4 py-2 rounded text-xs font-medium transition ${
                      activeTab === "ef"
                        ? "bg-white text-gray-900 shadow-sm font-semibold"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Ejection Fraction
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("pk")}
                    className={`px-4 py-2 rounded text-xs font-medium transition ${
                      activeTab === "pk"
                        ? "bg-white text-gray-900 shadow-sm font-semibold"
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

            {/* Navigation banner to dedicated Future Outcomes & Safety view */}
            <div className="bg-slate-900 text-white rounded-lg p-4 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
              <div className="space-y-0.5 text-left">
                <span className="text-xs font-semibold text-teal-400 block">Future Outcomes &amp; Safety Prognosis</span>
                <p className="text-xs text-slate-300">
                  Inspect multi-horizon (1h, 6h, 24h, 72h) timeline trajectories, clearance kinetics, and cardiac organ workload indices.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMainView("prognosis")}
                className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold px-4 py-2 rounded-md transition whitespace-nowrap shadow-sm"
              >
                Open Future Outcomes &amp; Safety &rarr;
              </button>
            </div>

            {/* Safety Alerts */}
            <RiskPanel flags={result.flags} />

            {/* Footer */}
            <div className="text-xs text-gray-500 border-t border-gray-200 pt-4 flex flex-wrap items-center justify-between gap-3 w-full">
              <span>
                Model: 0D Windkessel + XGBoost Forecaster (v0.2)
              </span>
              <span>
                For simulation testing only. Not for clinical diagnosis or prescription.
              </span>
            </div>
          </section>
        )}
          </>
        )}
      </main>
    </div>
  );
}
