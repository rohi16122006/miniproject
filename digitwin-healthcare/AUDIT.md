# DigiTwin Project Audit

**Audit date:** 2026-10-26  
**Scope:** Existing DigiTwin source, backend tests, frontend production build, checked-in model/data artifacts, notebooks, scripts, and local SQLite schema.  
**Report comparison limitation:** A complete submitted project report was not present in the workspace. Claims below are compared against the repository README and available project documentation, not an unavailable submission.

## Implementation Follow-up

The measured-vitals forecasting workflow identified in this audit has since been implemented. The dashboard now requires a complete timestamped observation window and explicitly measured drug-rate values, validates each row and the sampling interval, and presents measured observations separately from the forecast. It no longer creates a forecast automatically from repeated baseline values. See the [Measured-vitals forecast](./README.md#measured-vitals-forecast) instructions and [ForecastPanel.jsx](./frontend/src/components/ForecastPanel.jsx).

## Verified Working

### Simulation endpoint and 0D physiology

`POST /simulate` validates regimen drug names, calls the existing simulation service, stores the request and result, and returns the result with a run ID. The service:

1. Computes stroke volume as ejection fraction multiplied by end-diastolic volume.
2. Calibrates Windkessel resistance and compliance to supplied systolic and diastolic blood pressure, or uses demographic priors when both measurements are absent.
3. Evaluates drug concentrations and PK-PD effects across the requested horizon.
4. Calls the periodic 0D Windkessel beat solver for each time point.
5. Returns baseline and simulated SBP, DBP, MAP, HR, EF, cardiac output, concentrations, model parameters, and rule-based risk flags.

This is an implemented lumped-model simulation, not a full patient digital twin. The solver assumes a half-sine systolic inflow and a periodic steady-state beat. Documented limitations include no active baroreflex and fixed stroke volume.

Relevant files: [simulation_service.py](./backend/app/services/simulation_service.py), [windkessel.py](./backend/app/physics/windkessel.py), [drugs.py](./backend/app/physics/drugs.py), and [simulate.py](./backend/app/api/simulate.py).

### Forecast endpoint and trained model

`POST /forecast` uses three loaded XGBoost regressors for SBP, DBP, and HR. The model artifacts are present under `backend/app/ml/artifacts`; model metadata identifies the model as `xgb-0.1`. The API requires 30 samples per vital channel, sampled every 10 seconds, and forecasts 30 samples (300 seconds) ahead. The repository does not implement a GRU or LSTM forecaster.

The forecast request is validated, model availability is checked, and the loaded-artifact endpoint test returns the expected horizon and model version. The predictions are actual XGBoost inference, not a constant-filled response. At the time of the original audit, the dashboard supplied repeated baseline values; this has since been replaced by the timestamped measured-vitals workflow documented above.

Relevant files: [predict.py](./backend/app/api/predict.py), [features.py](./backend/app/ml/features.py), [xgb_model.py](./backend/app/ml/xgb_model.py), [train.py](./backend/app/ml/train.py), and [model artifacts](./backend/app/ml/artifacts).

### Drug catalog and evidence display

`GET /drugs` returns four catalog entries from the backend drug library. The frontend fetches those records and populates the medication selector. The dashboard also has a Drug Levels chart tab.

Drug evidence is not uniform:

- Amlodipine, metoprolol, and enalapril are explicitly marked `assumed`; their PK-PD values are illustrative and unfitted.
- Phenylephrine is marked as fitted to VitalDB Case 61, with fit claims documented in code and `docs/parameter_assumptions.md`.
- The fit script computes and prints fitted results but does not save a structured fit-results file for reproducibility.
- The runtime regimen models discrete doses. It does not accept the continuous infusion history used by the phenylephrine fitting workflow.

Relevant files: [drugs.py](./backend/app/physics/drugs.py), [simulate.py](./backend/app/api/simulate.py), [DrugSlider.jsx](./frontend/src/components/DrugSlider.jsx), [client.js](./frontend/src/api/client.js), and [fit_phenylephrine.py](./scripts/fit_phenylephrine.py).

The medication evidence badge has been corrected to use backend evidence metadata rather than labeling all non-phenylephrine entries as literature-based.

### Simulation persistence

The SQLite database has a `simulations` table containing a timestamp, risk label, request JSON, and result JSON. A simulation's patient fields and model outputs are therefore stored together in the same run record. `GET /history` lists runs and `GET /history/{run_id}` retrieves a complete record. Tests exercise simulation persistence and retrieval.

This is run-level storage only: there is no durable patient identity or patient-level longitudinal record. Forecast results are not linked to or stored alongside simulation history. The dashboard does not currently display the history API.

Relevant files: [database.py](./backend/app/db/database.py), [history.py](./backend/app/api/history.py), and [test_history_and_forecast.py](./backend/tests/test_history_and_forecast.py).

### Validation performed

- Backend suite: **12 passed**.
- Frontend production build: **passed**. Vite reports an existing non-blocking large-bundle warning.
- Direct live API checks during the audit confirmed that `/drugs` returned medication records.
- No new simulation model, database schema, or architecture was introduced for this audit.

## Partially Implemented

### AI evaluation and report consistency

Checked-in `meta.json` and `metrics.json` record a patient-level test split of 128 windows from one test case (Case 61), with five training cases and one validation case. The recorded metrics are:

| Target | XGBoost test MAE | Persistence test MAE | Recorded comparison |
|---|---:|---:|---|
| SBP | 14.58 mmHg | 16.97 mmHg | XGBoost lower |
| DBP | 7.44 mmHg | 8.55 mmHg | XGBoost lower |
| HR | 12.66 bpm | 12.16 bpm | Persistence lower |

These values are artifact-recorded results, not a reproduced evaluation in this audit. The processed train/validation/test `.npz` arrays are absent from the workspace. The artifact metadata also points to a raw-data path on another machine. The README's evaluation section reports a different held-out case and different metrics, so it must be reconciled before presenting one set as the final evaluation.

Relevant files: [metrics.json](./backend/app/ml/artifacts/metrics.json), [meta.json](./backend/app/ml/artifacts/meta.json), [split.json](./data/processed/split.json), and [README.md](./README.md).

### Phenylephrine fit traceability

The code and docs identify VitalDB Case 61 and report an empirical fit, but the fit outputs are not captured in a versioned machine-readable result artifact. The current fit implementation derives MAP from SBP/DBP and fits a PK-PD response before a separate Windkessel SBP/DBP simulation. These claims should be regenerated from the exact input data and script version before quantitative reuse.

Relevant files: [fit_phenylephrine.py](./scripts/fit_phenylephrine.py), [parameter_assumptions.md](./docs/parameter_assumptions.md), and [phenylephrine_fit.png](./docs/phenylephrine_fit.png).

### Demographic calibration

Age and sex affect fallback resistance/compliance priors, while the South Asian multipliers are explicitly placeholders. When measured BP is supplied, the solver instead calibrates resistance and compliance from the measured BP. The project documentation explicitly notes that VitalDB's East Asian surgical cohort does not validate South Asian calibration. These priors are assumptions, not population-validated calibration.

Relevant file: [demographics.py](./backend/app/seeding/demographics.py).

### Notebook and runtime coverage

The 0D sensitivity notebook contains executed solver checks, plots, and calibration examples. The VitalDB exploration notebook has no saved outputs. Backend API tests and a frontend build pass, but there is no automated browser test of the full frontend-to-backend workflow. The camera/OCR report scanner is also outside the backend test suite.

Relevant files: [notebooks](./notebooks), [backend tests](./backend/tests), and [frontend package manifest](./frontend/package.json).

## Missing

- **Interactive 3D heart:** No interactive 3D heart component or 3D rendering dependency was found in the frontend.
- **Forecast-to-run linkage:** Forecast results are neither persisted with a simulation record nor included in history responses.
- **Patient-level longitudinal records:** Database records are simulations, not identified patients with longitudinal clinical histories.
- **Reproducible evaluation from this checkout:** The processed model-training arrays are absent, preventing a local rerun of the artifact's original VitalDB evaluation.
- **Direct submitted-report verification:** The complete submitted report was not found in the workspace; this audit cannot certify every report requirement or reconcile against unavailable text.

## Next Three Highest-Priority Tasks

1. **Make model evaluation reproducible.** Restore/version the exact allowed source data and split or provide a reproducible download/build procedure; rerun and reconcile XGBoost metrics.
2. **Make drug-response fitting reproducible.** Save phenylephrine fit parameters, script/data provenance, and metrics as a structured artifact; distinguish the continuous-infusion fitting path from runtime dose simulations.
3. **Implement the requested 3D visualization.** Add an interactive heart view as an explicitly illustrative visualization, separate from the validated scope of the 0D hemodynamic model.

The forecast follow-up changed only the files listed in the implementation task; no retraining, model replacement, or unrelated feature work was undertaken.
