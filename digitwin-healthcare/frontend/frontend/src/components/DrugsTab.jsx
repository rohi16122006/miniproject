import { useState } from "react";
import DrugOptimizer from "./DrugOptimizer.jsx";

/**
 * Virtual Drug-Trial / Drugs Tab
 * 
 * Traceable clinical pharmacology repository and hypothetical scenario evaluator.
 * Documents PK-PD parameters, literature sources, calibration provenance,
 * and comparative baseline-vs-treatment outcomes.
 */
export default function DrugsTab({ drugs, onSelectScenario, result, patient, onApplyOptimalRegimen }) {
  const [selectedDrug, setSelectedDrug] = useState("phenylephrine");

  const drugMonographs = {
    phenylephrine: {
      name: "Phenylephrine",
      class: "Alpha-1 Adrenergic Receptor Agonist (Vasopressor)",
      indication: "Acute intraoperative hypotension, septic shock vascular collapse",
      route: "Intravenous (IV) Bolus or Infusion",
      provenance: "Calibrated directly to clinical arterial line data (VitalDB Case 61)",
      citation: "VitalDB Case 61 (58M, radial arterial line) & Goodman & Gilman's Pharmacological Basis",
      halfLife: "0.32 hours (19.0 minutes)",
      vd: "34.4 L (0.60 L/kg)",
      emax: "+46.2% systemic resistance increase",
      ec50: "12.04 ug/L (0.012 mg/L)",
      clearance: "75.3 L/h",
      hemodynamicTarget: "Arterial systemic vascular resistance (R)",
      contraindications: "Severe hypertension, ventricular tachycardia, narrow-angle glaucoma",
      interactions: "MAO inhibitors (hypertensive crisis), Oxytocic drugs (severe persistent hypertension)",
      clinicalAdvice: "Monitor continuous arterial line pressure closely to avoid excessive afterload spikes.",
    },
    amlodipine: {
      name: "Amlodipine",
      class: "Dihydropyridine Calcium Channel Blocker (CCB)",
      indication: "Essential hypertension, chronic stable angina",
      route: "Oral (PO)",
      provenance: "Literature PK-PD synthesis (FDA Package Insert & Meredith et al. 1992)",
      citation: "Meredith PA, Elliott HL. Clinical pharmacokinetics of amlodipine. Clin Pharmacokinet. 1992",
      halfLife: "35.0 hours",
      vd: "1,470 L (21 L/kg)",
      emax: "-40.0% systemic resistance reduction",
      ec50: "4.0 ug/L",
      clearance: "29.1 L/h",
      hemodynamicTarget: "Arterial systemic vascular resistance (R)",
      contraindications: "Severe hypotension, cardiogenic shock, severe aortic stenosis",
      interactions: "Simvastatin (elevates simvastatin AUC), CYP3A4 inhibitors (ketoconazole, diltiazem)",
      clinicalAdvice: "Long elimination half-life requires 7-10 days to reach steady-state plasma concentrations.",
    },
    metoprolol: {
      name: "Metoprolol",
      class: "Selective Beta-1 Adrenergic Receptor Blocker",
      indication: "Hypertension, angina pectoris, post-myocardial infarction, sinus tachycardia",
      route: "Oral (PO) / IV",
      provenance: "Literature PK-PD synthesis (Regardh & Johnsson 1980)",
      citation: "Regardh CG, Johnsson G. Clinical pharmacokinetics of metoprolol. Clin Pharmacokinet. 1980",
      halfLife: "3.5 hours (extensive metabolizers)",
      vd: "294 L (4.2 L/kg)",
      emax: "-30.0% heart rate reduction & contractility modulation",
      ec50: "25.0 ug/L",
      clearance: "58.2 L/h",
      hemodynamicTarget: "Resting Heart Rate (HR) & Myocardial Inotropy",
      contraindications: "Sinus bradycardia (HR < 45 bpm), 2nd/3rd degree AV block, cardiogenic shock",
      interactions: "Non-dihydropyridine CCBs (verapamil, diltiazem - profound bradycardia & AV block)",
      clinicalAdvice: "Avoid abrupt cessation to prevent rebound sympathetic hyperactivity and ischemia.",
    },
    enalapril: {
      name: "Enalapril",
      class: "Angiotensin-Converting Enzyme (ACE) Inhibitor",
      indication: "Hypertension, symptomatic heart failure, asymptomatic left ventricular dysfunction",
      route: "Oral (PO) - prodrug activated to enalaprilat",
      provenance: "Literature PK-PD synthesis (Todd & Goa 1992)",
      citation: "Todd PA, Goa KL. Enalapril. An updated review of its pharmacological properties. Drugs. 1992",
      halfLife: "11.0 hours (enalaprilat elimination)",
      vd: "120 L",
      emax: "-30.0% systemic vascular resistance reduction",
      ec50: "15.0 ug/L",
      clearance: "7.6 L/h",
      hemodynamicTarget: "Arterial systemic vascular resistance (R)",
      contraindications: "History of ACE-inhibitor angioedema, bilateral renal artery stenosis, pregnancy",
      interactions: "Potassium-sparing diuretics (hyperkalemia risk), NSAIDs (attenuated BP response)",
      clinicalAdvice: "Monitor serum creatinine and potassium within 1-2 weeks of initiation.",
    },
  };

  const candidateScenarios = [
    {
      id: "vasopressor",
      title: "Scenario 1: Acute Hypotension Rescue (Vasopressor Titration)",
      drug: "phenylephrine",
      dose: "0.1 mg every 0.5h (2 doses)",
      horizon: 2,
      patientType: "Hypotensive Surgical Patient (SBP 91, DBP 56, HR 65)",
      rationale: "Rapidly elevates mean arterial pressure (MAP) to restore coronary and cerebral perfusion.",
      expectedOutcome: "+20 to +30 mmHg SBP increase within 15-30 minutes, minimal reflex bradycardia.",
    },
    {
      id: "hypertension",
      title: "Scenario 2: Dual Antihypertensive Regimen (Stage 2 Hypertension)",
      drug: "amlodipine + enalapril",
      dose: "Amlodipine 10mg q24h + Enalapril 20mg q12h",
      horizon: 48,
      patientType: "Hypertensive Adult (SBP 168, DBP 102, HR 82)",
      rationale: "Synergistic vasodilation: calcium blockade plus renin-angiotensin-aldosterone suppression.",
      expectedOutcome: "Sustained -30 to -40 mmHg MAP reduction across 48h without reflex tachycardia.",
    },
    {
      id: "normotensive",
      title: "Scenario 3: Standard Maintenance Therapy",
      drug: "amlodipine",
      dose: "Amlodipine 5mg q24h",
      horizon: 24,
      patientType: "Normotensive Baseline (SBP 120, DBP 80, HR 70)",
      rationale: "Evaluates baseline drug tolerance in stable hemodynamics.",
      expectedOutcome: "Mild SBP drop (5-10 mmHg), preserves normal ventricular contractility.",
    },
    {
      id: "stiff_aorta",
      title: "Scenario 4: Isolated Systolic Hypertension Rate Control",
      drug: "metoprolol",
      dose: "Metoprolol 50mg q12h",
      horizon: 24,
      patientType: "Elderly Patient with Stiff Aorta (SBP 172, DBP 68, HR 68)",
      rationale: "Reduces pulsatile workload on inelastic arterial tree and slows rate.",
      expectedOutcome: "Moderate HR and pulse pressure moderation.",
    },
    {
      id: "overdose",
      title: "Scenario 5: Toxicological Stress Test (Overdose Hypotension)",
      drug: "amlodipine + enalapril",
      dose: "Amlodipine 40mg + Enalapril 80mg",
      horizon: 24,
      patientType: "Accidental Massive Ingestion (SBP 118, DBP 74, HR 75)",
      rationale: "Verifies physiological safety alerts and extreme vascular collapse detection.",
      expectedOutcome: "Critical hypotension (SBP < 80 mmHg); triggers HIGH ALERT safety warnings.",
    },
  ];

  const current = drugMonographs[selectedDrug];

  return (
    <div className="space-y-6 w-full">
      {/* 1. Header & Quick Switcher */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <span>Virtual Drug-Trial Repository</span>
              <span className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded font-medium">
                PK-PD v0.2
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Traceable pharmacokinetic/pharmacodynamic parameters, evidence provenance, and candidate simulation trials.
            </p>
          </div>

          {/* Drug Selection Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(drugMonographs).map(([k, d]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedDrug(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition ${
                  selectedDrug === k
                    ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Drug Monograph */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Clinical Summary */}
          <div className="lg:col-span-7 space-y-3.5">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-bold text-gray-900">{current.name}</span>
                <span className="text-xs bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-medium">
                  {current.class}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                <strong>Indication:</strong> {current.indication} &bull; <strong>Route:</strong> {current.route}
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-1.5">
              <span className="font-semibold text-slate-800 text-xs block">
                Evidence Provenance &amp; Literature Citation
              </span>
              <p className="text-slate-700 leading-relaxed text-xs">
                {current.provenance}
              </p>
              <p className="text-slate-500 italic text-[11px]">
                Source: {current.citation}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-900 space-y-1">
                <span className="font-semibold text-xs block">Contraindications</span>
                <p className="text-xs leading-relaxed">{current.contraindications}</p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 space-y-1">
                <span className="font-semibold text-xs block">Key Interactions</span>
                <p className="text-xs leading-relaxed">{current.interactions}</p>
              </div>
            </div>
          </div>

          {/* Right Column: PK-PD Parameter Grid */}
          <div className="lg:col-span-5 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <span className="text-xs font-semibold text-gray-700 block border-b border-gray-200 pb-1.5">
              Kinetic &amp; Dynamic Constants (0D ODE)
            </span>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded border border-gray-200">
                <span className="text-gray-500 block text-[11px]">Elimination Half-Life (t1/2)</span>
                <span className="font-semibold text-gray-800 text-sm tabular-nums">{current.halfLife}</span>
              </div>
              <div className="bg-white p-2.5 rounded border border-gray-200">
                <span className="text-gray-500 block text-[11px]">Volume of Distribution (Vd)</span>
                <span className="font-semibold text-gray-800 text-sm tabular-nums">{current.vd}</span>
              </div>
              <div className="bg-white p-2.5 rounded border border-gray-200">
                <span className="text-gray-500 block text-[11px]">Emax (Max Efficacy)</span>
                <span className="font-semibold text-teal-800 text-sm tabular-nums">{current.emax}</span>
              </div>
              <div className="bg-white p-2.5 rounded border border-gray-200">
                <span className="text-gray-500 block text-[11px]">EC50 (Sensitivity)</span>
                <span className="font-semibold text-teal-800 text-sm tabular-nums">{current.ec50}</span>
              </div>
            </div>

            <div className="p-2.5 bg-white rounded border border-gray-200 text-xs">
              <span className="text-gray-500 block text-[11px]">Target Hemodynamic Receptor/Parameter</span>
              <span className="font-semibold text-gray-800">{current.hemodynamicTarget}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Condition Best Medication Optimizer */}
      {patient && onApplyOptimalRegimen && (
        <DrugOptimizer
          patient={patient}
          onApplyOptimalRegimen={onApplyOptimalRegimen}
        />
      )}

      {/* 2. Candidate Scenarios List */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">
              Candidate Clinical Trial Scenarios
            </h3>
            <p className="text-xs text-gray-500">
              Pre-configured clinical regimens for comparative baseline-vs-treatment evaluation.
            </p>
          </div>
          <span className="text-xs text-gray-500 font-medium">5 Scenarios Available</span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {candidateScenarios.map((sc) => (
            <div
              key={sc.id}
              className="border border-gray-200 hover:border-teal-500 rounded-lg p-4 bg-gray-50/50 hover:bg-white transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900">{sc.title}</span>
                  <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                    {sc.dose}
                  </span>
                  <span className="text-xs bg-teal-50 text-teal-800 px-2 py-0.5 rounded font-medium border border-teal-200">
                    {sc.horizon}h duration
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  <strong className="text-gray-800 font-semibold">Patient Cohort:</strong> {sc.patientType}
                </p>
                <p className="text-xs text-gray-500">
                  <strong className="text-gray-700 font-medium">Rationale:</strong> {sc.rationale} &bull; <strong className="text-gray-700 font-medium">Expected:</strong> {sc.expectedOutcome}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onSelectScenario(sc.id)}
                className="self-start md:self-center shrink-0 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold py-2.5 px-4 rounded-md shadow-sm transition flex items-center gap-1.5"
              >
                <span>Run Trial &rarr;</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Baseline vs. Simulated Outcome Comparison Table */}
      {result && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <h3 className="text-sm font-semibold text-gray-800">
              Trial Evaluation: Baseline vs. Simulated Outcome
            </h3>
            <span className="text-xs text-gray-500 font-medium">
              Run #{result.run_id || "Active"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold text-xs">
                <tr>
                  <th className="py-2.5 px-3">Hemodynamic Metric</th>
                  <th className="py-2.5 px-3">Baseline</th>
                  <th className="py-2.5 px-3">Simulated Outcome</th>
                  <th className="py-2.5 px-3">Change (Delta)</th>
                  <th className="py-2.5 px-3">Normal Range</th>
                  <th className="py-2.5 px-3">Safety Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 tabular-nums">
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-800">Systolic Blood Pressure (SBP)</td>
                  <td className="py-2.5 px-3">{result.baseline.sbp} mmHg</td>
                  <td className="py-2.5 px-3 font-semibold text-gray-900">{result.series.at(-1)?.sbp} mmHg</td>
                  <td className="py-2.5 px-3 font-semibold text-teal-700">
                    {(result.series.at(-1)?.sbp - result.baseline.sbp).toFixed(1)} mmHg
                  </td>
                  <td className="py-2.5 px-3 text-gray-500">90 - 140 mmHg</td>
                  <td className="py-2.5 px-3 font-semibold text-emerald-700">Controlled</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-800">Diastolic Blood Pressure (DBP)</td>
                  <td className="py-2.5 px-3">{result.baseline.dbp} mmHg</td>
                  <td className="py-2.5 px-3 font-semibold text-gray-900">{result.series.at(-1)?.dbp} mmHg</td>
                  <td className="py-2.5 px-3 font-semibold text-teal-700">
                    {(result.series.at(-1)?.dbp - result.baseline.dbp).toFixed(1)} mmHg
                  </td>
                  <td className="py-2.5 px-3 text-gray-500">60 - 90 mmHg</td>
                  <td className="py-2.5 px-3 font-semibold text-emerald-700">Controlled</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-800">Mean Arterial Pressure (MAP)</td>
                  <td className="py-2.5 px-3">{result.baseline.map} mmHg</td>
                  <td className="py-2.5 px-3 font-semibold text-gray-900">{result.series.at(-1)?.map} mmHg</td>
                  <td className="py-2.5 px-3 font-semibold text-teal-700">
                    {(result.series.at(-1)?.map - result.baseline.map).toFixed(1)} mmHg
                  </td>
                  <td className="py-2.5 px-3 text-gray-500">65 - 105 mmHg</td>
                  <td className="py-2.5 px-3 font-semibold text-emerald-700">Optimal Perfusion</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-gray-800">Heart Rate (HR)</td>
                  <td className="py-2.5 px-3">{result.baseline.hr} bpm</td>
                  <td className="py-2.5 px-3 font-semibold text-gray-900">{result.series.at(-1)?.hr} bpm</td>
                  <td className="py-2.5 px-3 font-semibold text-teal-700">
                    {(result.series.at(-1)?.hr - result.baseline.hr).toFixed(1)} bpm
                  </td>
                  <td className="py-2.5 px-3 text-gray-500">50 - 100 bpm</td>
                  <td className="py-2.5 px-3 font-semibold text-emerald-700">Normal Sinus</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
