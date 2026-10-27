# DigiTwin: AI-Powered Personalized Cardiovascular Digital Twin

*An academic research prototype for personalized hemodynamic modeling and virtual drug-trial simulation.*

> **Important Clinical Disclaimer:** This software is an academic research prototype developed for educational and experimental simulation purposes. It is **NOT** a clinically validated medical device, diagnostic system, or prescribing tool. Never use outputs to administer or modify real medications.

---

## 1. System Architecture & Project Deliverables Checklist

DigiTwin implements all 8 core software deliverables defined in the submitted project report (`report_mini.pdf`):

| Deliverable | Description | Completion Evidence & Source Files |
|---|---|---|
| **1. Clinician Input & Patient Profile** | Patient name, ID (MRN), age, sex, resting SBP, DBP, HR, EF, medical history, allergies, and home medications with client/server validation. | [`frontend/src/components/PatientForm.jsx`](frontend/src/components/PatientForm.jsx), [`backend/app/schemas/simulation.py`](backend/app/schemas/simulation.py) |
| **2. Hybrid Physics–AI Engine** | 0D 3-element Windkessel ($R-C-R_c$) ODE solver via SciPy `solve_ivp`, phenylephrine PK-PD model fitted on clinical arterial data, and XGBoost ML forecaster. | [`backend/app/physics/windkessel.py`](backend/app/physics/windkessel.py), [`backend/app/physics/drugs.py`](backend/app/physics/drugs.py), [`backend/app/ml/xgb_model.py`](backend/app/ml/xgb_model.py) |
| **3. Prediction Outputs** | 5-minute anticipatory forecast of SBP, DBP, and HR with persistence baseline comparison on held-out patient data. | [`backend/app/ml/predict.py`](backend/app/ml/predict.py), [`docs/tripod_ai_report.md`](docs/tripod_ai_report.md), [`backend/app/ml/artifacts/`](backend/app/ml/artifacts/) |
| **4. Virtual Drug-Trial Tab** | Dedicated tab with traceable drug monographs, PK-PD constants table ($t_{1/2}, V_d, E_{max}, EC_{50}$), literature citations, 5 candidate clinical scenarios, and comparative baseline-vs-treatment output table. | [`frontend/src/components/DrugsTab.jsx`](frontend/src/components/DrugsTab.jsx), [`docs/parameter_assumptions.md`](docs/parameter_assumptions.md) |
| **5. Demographic Seeding Pipeline** | Local parameter seeding for South Asian vascular compliance and arterial resistance; transparently documented as research priors. | [`backend/app/seeding/demographics.py`](backend/app/seeding/demographics.py), [`docs/clinical_economic_projections.md`](docs/clinical_economic_projections.md) |
| **6. Interactive Dashboard & 3D Heart** | Full-width desktop telemetry dashboard, Recharts interactive waveforms, and real-time **3D Cardiac Digital Twin** beating synchronously to simulated Heart Rate ($HR$), Ejection Fraction ($EF$), and aortic $MAP$ pulse dilation. | [`frontend/src/components/Heart3D.jsx`](frontend/src/components/Heart3D.jsx), [`frontend/src/pages/Dashboard.jsx`](frontend/src/pages/Dashboard.jsx) |
| **7. Architecture & SQLite Storage** | FastAPI REST API validating sessions; persistent SQLite database (`digitwin.db`) storing simulation sessions with zero cross-patient leakage and 1-click restore. | [`backend/app/db/database.py`](backend/app/db/database.py), [`backend/app/api/history.py`](backend/app/api/history.py), [`frontend/src/components/HistoryTab.jsx`](frontend/src/components/HistoryTab.jsx) |
| **8. Performance & Benchmarking** | End-to-end simulation runtime benchmarks across 50 runs proving **< 2.0s report target** (mean: **105.87 ms**, P95: **168.38 ms**), 100% numerical stability, and 11 unit tests. | [`scripts/benchmark_simulation.py`](scripts/benchmark_simulation.py), [`docs/benchmark_report.md`](docs/benchmark_report.md), [`backend/tests/`](backend/tests/) |

---

## 2. Directory Layout
```
digitwin/
├── backend/
│   ├── app/
│   │   ├── api/             # simulate.py (/simulate, /drugs), history.py (/history), predict.py (/forecast)
│   │   ├── db/              # database.py (SQLite run history & session isolation)
│   │   ├── ml/              # features.py, xgb_model.py, train.py, predict.py, artifacts/ (xgb_*.json, metrics.json)
│   │   ├── physics/         # windkessel.py (0D ODE solver), drugs.py (fitted PK-PD library)
│   │   ├── schemas/         # Pydantic models (Patient profile, Regimen, SimRequest)
│   │   ├── seeding/         # demographics.py (South Asian vascular scaling priors)
│   │   ├── services/        # simulation_service.py, risk.py (rule-based safety limits)
│   │   └── main.py          # FastAPI application entrypoint
│   ├── tests/               # 11 unit tests (all green)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/             # client.js (simulate, forecast, drugs, history, health)
│   │   ├── components/      # PatientForm, DrugSlider, Heart3D, DrugsTab, HistoryTab, BPChart, HRChart, EFChart, RiskPanel
│   │   ├── pages/           # Dashboard.jsx (primary workstation and view router)
│   │   └── index.css        # Clean clinical CSS tokens
│   ├── index.html
│   └── package.json
├── data/
│   ├── raw/vitaldb/         # Verified surgical cases (.npz) & PhysioNet clinical_data.csv
│   └── processed/           # Patient-split train/val/test windows
├── docs/
│   ├── benchmark_report.md  # 50-run runtime benchmark log & stability tests (< 2.0s target)
│   ├── tripod_ai_report.md  # BMJ TRIPOD+AI machine learning reporting standard
│   ├── license_audit.md     # 100% zero-licence open-source verification
│   ├── clinical_economic_projections.md # Explicit audit of report claims vs demonstrated software
│   ├── dataset_inventory.md # PhysioNet VitalDB 1.0.0 inventory & track dictionary
│   └── parameter_assumptions.md # PK-PD and 0D Windkessel literature citations
├── notebooks/
│   ├── 01_explore_vitaldb.ipynb
│   ├── 02_windkessel_check.ipynb
│   └── 03_windkessel_sensitivity.ipynb
└── scripts/
    ├── download_vitaldb.py          # Streams cases from PhysioNet VitalDB (supports --auto-find --limit)
    ├── build_training_set.py        # Patient-level windowing (zero data leakage)
    ├── fit_phenylephrine.py         # Fits PK-PD constants on VitalDB Case 61
    ├── benchmark_simulation.py      # Automated runtime & stability validation
    └── make_dataset_inventory.py    # Generates dataset metadata documentation
```

---

## 3. Quick Start Instructions

### Terminal 1: Backend (FastAPI + Python 3.10+)
```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
- Swagger API Docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/health`
- Run test suite (11 passing tests):
  ```powershell
  python -m pytest -q
  ```

### Terminal 2: Frontend (React + Tailwind + Vite)
```powershell
cd frontend
npm install
npm run dev
```
- Interactive Web Platform: `http://localhost:5173`

---

## 4. End-to-End Demonstration Walkthrough

1. **Select Patient Profile & Scenario:**
   - On the top horizontal scenario bar, click **`Case 61 (Vasopressor)`** or **`High Blood Pressure`**.
   - Review patient demographics (Name, ID, Age, Sex, resting SBP/DBP, HR, EF) and click *"Clinical History, Allergies & Home Meds"* to inspect clinical metadata.
2. **Execute Simulation:**
   - Click **`Run Simulation`**.
   - Latency completes in **~100 ms**, immediately updating:
     - **Baseline Vitals** (Start values)
     - **AI Forecast (5 min)** (XGBoost `xgb-0.1` prediction and $\Delta$ change)
     - **Simulated Outcome** (0D Windkessel after $X$ hours)
     - **Waveforms** (Blood Pressure, Heart Rate, Ejection Fraction, Drug Levels)
3. **Inspect 3D Cardiac Digital Twin:**
   - Click the **`3D Cardiac Digital Twin`** tab on the navigation bar.
   - Observe the real-time beating cardiac model:
     - Beat period is mathematically synchronized to simulated $HR$ ($60 / HR$ seconds).
     - Left ventricular stroke contraction amplitude is driven by simulated Ejection Fraction ($EF$).
     - Aortic arch systolic pulse dilation reflects arterial pressure ($MAP$ / $SBP$).
     - Drag with mouse to orbit/rotate; toggle *"LV Cross-Section"* or *"Show Anatomy"*.
4. **Evaluate Clinical Pharmacology in Virtual Drug-Trial Tab:**
   - Click **`Virtual Drug Trial`**.
   - Browse drug monographs and traceable PK-PD parameters ($t_{1/2}, V_d, E_{max}, EC_{50}$) for Phenylephrine, Amlodipine, Metoprolol, and Enalapril.
   - Click *"Run Trial"* on any candidate scenario to evaluate baseline-versus-hypothetical comparative metrics.
5. **Inspect Persistent Audit Trail:**
   - Click **`Session History (SQLite)`**.
   - View previously executed sessions with unique run IDs, timestamps, patient IDs, baseline vs. final pressures, and risk flags.
   - Click *"Restore"* on any session to instantly reload that patient's exact state without record mixing.

---

## 5. Machine Learning Evaluation (TRIPOD+AI)
Trained on patient-split surgical cases from PhysioNet VitalDB; evaluated on held-out unseen patient (Case 2265):
- **Systolic BP (SBP):** Persistence Baseline MAE 16.97 mmHg vs. **XGBoost MAE 14.58 mmHg** (-14.1% error reduction).
- **Diastolic BP (DBP):** Persistence Baseline MAE 8.55 mmHg vs. **XGBoost MAE 7.44 mmHg** (-13.0% error reduction).
- **Heart Rate (HR):** Persistence Baseline RMSE 17.33 bpm vs. **XGBoost RMSE 16.09 bpm**.
- Full report following BMJ guidelines: [`docs/tripod_ai_report.md`](docs/tripod_ai_report.md).

---

## 6. Benchmarking & License Verification
- **Runtime Target (< 2.0s):** Mean runtime **105.87 ms**, P95 **168.38 ms**, Max **171.12 ms**. 100% numerical stability. (See [`docs/benchmark_report.md`](docs/benchmark_report.md)).
- **Zero License-Cost:** 100% open-source permissive stack (MIT, BSD, Apache 2.0, Public Domain). (See [`docs/license_audit.md`](docs/license_audit.md)).
- **Report Projections Statement:** Theoretical projections (e.g. 30-40% ADR reduction, workflow savings) transparently documented in [`docs/clinical_economic_projections.md`](docs/clinical_economic_projections.md).
