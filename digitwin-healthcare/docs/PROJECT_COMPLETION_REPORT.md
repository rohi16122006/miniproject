# DigiTwin project completion report

**Review scope:** the repository and the implementation objectives in the supplied master prompt.  
**Project report:** no submitted report document was found in the repository, so the report-specific requirements cannot be verified against that source.  
**Safety:** this is an academic research prototype, not a clinically validated medical device or prescribing system.

## 1. Requirements and implementation status

| Area | Status | Evidence and remaining work |
|---|---|---|
| A. Reproducible model evaluation | **Partially implemented** | The three XGBoost models load, use the 21 named features in `features.py`, and return finite deterministic outputs. Current metrics were recomputed from 487 test windows across three held-out cases and match the saved metadata. This is exploratory only, not clinical validation. The preprocessing maps missing drug-rate samples to zero; 50.26% of local drug-rate samples are missing, so this unverified assumption affects the artifacts. |
| B. Drug-response and PK-PD simulation | **Partially implemented** | The existing PK-PD layer feeds the 0D solver and returns baseline, scenario curves, and modeled concentration series. The catalog and UI now expose route, modeled administration, PK/PD parameters, and evidence status. Unsupported regimen fields are rejected. Oral agents remain assumptions; phenylephrine's historical fit has not been rerun, and the Case 61 input contains 63.7% missing drug-rate samples that the fit script zero-fills. Continuous infusion is not implemented. |
| C. Interactive 3D heart | **Viewer and licensed model installed** | A React Three Fiber/Three.js viewer loads the locally bundled anatomical heart GLB, supports orbit/zoom/reset, heart-rate-driven pulse timing, baseline/treatment switching, playback, selected output values, and a run ID. The mesh was obtained from a Wikimedia Commons source explicitly licensed CC BY 4.0, and attribution/conversion details are documented. |
| D. Patient records and simulation history | **Partially implemented** | SQLite persists each simulation request and result under a unique run ID; history endpoints retrieve these records. Tests verify separate runs retain separate patient-input snapshots. There is no durable patient ID, patient profile, allergy/history record, patient-filtered history UI, or authentication/access control. Do not enter identifying patient information. |
| E. Demographic calibration | **Incomplete objective** | Measured SBP/DBP calibrate R/C. When BP is absent, age/sex/South Asian priors are assumptions. The South Asian multipliers are explicitly placeholders and have not been evaluated on an appropriate population dataset. |
| F. Dashboard integration | **Partially implemented** | The existing patient, medication, simulation, chart, and risk-flag flow remains connected. Drug information is searchable and model/session values are labelled. The optional 3D panel receives the active patient inputs and simulation outputs. No patient identity linkage or historical-session selection is implemented. The forecast API remains unchanged and the forecast panel is not displayed on the Dashboard. |
| G. Runtime and validation | **Partially implemented** | Current verification passed 46 backend tests and 26 frontend tests, and the production build succeeds. Browser checks confirmed the backend-connected Dashboard, successful simulation, and the loaded heart GLB. The service-only 72-hour/100-point benchmark excludes HTTP, serialization, and SQLite persistence, so it does not certify total API runtime. |

## 2. Project and data inspection

The repository contains a FastAPI backend, React 18/Vite dashboard, SQLite simulation history, a 0D R-C-Rc Windkessel implementation, PK-PD scenarios, XGBoost artifacts, VitalDB metadata, scripts, notebooks, and tests. The available source code confirms that `/simulate` calls the Windkessel solver and `effects_series`; the forecast endpoint is separate and was not modified by this implementation.

The current checkout has:

- `data/raw/vitaldb/clinical_data.csv`: 6,388 clinical metadata rows and 74 columns.
- `data/raw/vitaldb/track_names.csv`: 196 track dictionary rows.
- 16 `data/raw/vitaldb/case_*.npz` signal arrays and processed train/validation/test arrays containing 2,333/716/487 windows from 10/3/3 cases.
- Three XGBoost JSON artifacts; current metrics were independently recomputed against the saved test array without retraining.
- No original submitted project report.

The current split and processed arrays were checked directly. There are 10 training cases, 3 validation cases, and 3 test cases. The saved test metrics match a recomputation over 487 test windows; three independent cases remain a small exploratory evaluation set.

Reproduced test metrics at a 300-second horizon:

| Target | Persistence MAE / RMSE | XGBoost MAE / RMSE | Unit |
|---|---:|---:|---|
| SBP | 10.9358 / 16.5915 | 9.8543 / 14.3463 | mmHg |
| DBP | 5.1667 / 8.7201 | 8.9645 / 11.2085 | mmHg |
| HR | 4.8953 / 9.6421 | 5.8603 / 8.9999 | bpm |

These values were recomputed from the current `test.npz` and saved XGBoost artifacts without retraining; both XGBoost and persistence values match `meta.json`. The set contains only three independent cases and does not support clinical validation or broad generalization claims.

Feature processing uses SBP/DBP/HR/drug rate on a 10-second grid, 30 observations as input, and a further 30-sample (300-second) target horizon. BP/HR bounds are checked, gaps up to six samples are interpolated, larger gaps disqualify windows, and missing drug-rate values are zero-filled by the existing pipeline. A local diagnostic found 12,748 of 25,366 drug-rate samples missing (50.26%). That zero-fill can conflate an unknown rate with no infusion; no missingness indicator is present.

## 3. Model and drug methodology

### XGBoost artifacts

The existing model files were loaded in the backend tests. The tests check that `meta.json` feature names equal the current feature extractor's 21 names, all three regressors expect 21 features, predictions have shape `(n, 3)`, values are finite, and repeated inference on the same input is deterministic. Current MAE/RMSE values were recalculated from the available test array and match metadata. Evaluation is based on only three test cases and on features built with the unverified missing-rate-to-zero assumption; no clinical or external validation is established.

### Drug-response simulation

The simulator combines single-compartment concentration estimates with simplified Emax effects and passes resistance/HR/EF changes into the Windkessel solver. Baseline and hypothetical treatment outputs include BP/HR/EF curves and modeled drug concentration where available.

- Amlodipine, metoprolol, and enalapril parameters are assumed illustrative values. Enalapril active-metabolite kinetics are not represented.
- Phenylephrine parameters have a historical VitalDB Case 61 fit attribution. The case array exists, but 63.7% of the drug-rate samples are missing and the fit script zero-fills them; fitting and the historical MAP/SBP/DBP errors were not rerun.
- The current treatment schema represents repeated discrete doses with a rapid-absorption approximation. It does not implement continuous infusion; infusion-rate data used by the historical fitting script are not equivalent to the current regimen interface.
- Drug effects, rule flags, and output curves are simulated research outputs, not clinical outcomes, safety determinations, or prescribing recommendations.

## 4. 3D heart viewer and asset license

The dashboard includes a lazy-loaded viewer based on React 18.3.1, React Three Fiber 8.18.0, Drei 9.122.0, and Three.js 0.186.1. If a model exists at `frontend/public/models/heart.glb`, it is loaded with interactive orbit/zoom/reset controls. The selected baseline or treatment sample supplies displayed SBP/DBP/HR; playback follows actual `series` entries; the pulse animation timing uses the selected heart-rate output. The solver does not supply 3D flow, valve mechanics, deformation, or patient-specific anatomy.

The file [frontend/public/models/heart.glb](../frontend/public/models/heart.glb) was converted from [“3D model of a human heart” on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:3D_model_of_a_human_heart.stl), attributed there to **“Realistic Human Heart” by neshallads** (original [Sketchfab source](https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089)). The Commons file page identifies the license as [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), which allows sharing and adaptation with attribution, license link, and notice of changes. This copy was converted from STL to GLB, centered, uniformly scaled, and assigned a solid display material; no anatomical parts or data were added. The source STL SHA-256 was `DCC3E6063F243F00F13B838455428134F96FFFF8D9EC466ED0D5F6A6B33EEFEF`; installed GLB SHA-256 is `BC458DF794BB2FFFECDD47634989C35092269D46749F63693CEB1B8C0EDDD7A4` (407,484 bytes).

The GLB is packaged at the Vite public path and served as `/models/heart.glb`. The mesh was validated as a binary STL, watertight and winding-consistent, with 22,562 faces, then loaded from the GLB after export. The viewer links to the original source/license and shows this attribution. Its values still come only from the 0D solver; the solver does not provide 3D flow, valve mechanics, deformation, or patient-specific anatomy.

The requested local DigiTwin vector wordmark and favicon are custom SVGs created for this project, with no external logo asset or third-party logo license. The persistent dashboard safety notice was removed at the user's later request; other simulation-specific non-clinical labels remain.

## 5. API, database, and patient linkage

- `/drugs` now exposes class, route, modeled administration, mechanism, source/status, and PK/PD parameter values. The medication UI supports searching that information and viewing parameters.
- `Regimen` rejects extra fields, so unsupported fields such as a continuous-infusion administration mode do not get silently ignored. The API still only accepts the existing discrete dose/interval/count schema.
- No SQLite schema migration was required. Existing `simulations` rows remain intact. Each simulation request and result remains linked by its run ID. A focused test verifies two different patient input snapshots remain attached to their respective run IDs.
- Stable patient identifiers, names, allergies, longitudinal measurements, patient-specific history retrieval, and access controls are not implemented. The dashboard exposes the simulation run ID but does not offer a patient-history browser. Avoid storing direct identifiers in this prototype.
- The forecast request/response contract, forecast model, and API implementation were not changed in this implementation. The Dashboard forecast panel remains removed as requested earlier.

## 6. Demographic calibration

When measured BP is present, R/C are calibrated from the patient's SBP, DBP, HR, and modeled stroke volume. Without BP, age/sex priors are used; South Asian factors multiply the assumed compliance/resistance values. There are no suitable validation data or subgroup metrics in this checkout. These factors remain clearly labelled assumptions and must not be described as population calibration.

## 7. Runtime benchmark

Command:

```powershell
py -3.10 scripts\benchmark_simulation.py --repeats 15 --horizon-h 72 --n-points 100
```

The script warmed up three runs and measured 15 calls to `run_simulation` directly, using one 72-hour, 100-point scenario with amlodipine and phenylephrine. Results are stored in `simulation_benchmark.json`.

| Measurement | Result |
|---|---:|
| Minimum | 102.117 ms |
| Median | 122.136 ms |
| Mean | 123.841 ms |
| Maximum | 156.882 ms |

Environment reported by the script: Windows 10 build 26300, Python 3.10.11, Intel64 Family 6 Model 183 CPU identifier, 20 logical CPUs, NumPy 2.2.6, SciPy 1.15.3, FastAPI 0.162.0, and XGBoost 3.2.0. This benchmark excludes HTTP routing, JSON serialization, and SQLite writes; it supports only the narrower service-call timing claim.

## 8. Files created or modified for this implementation

- Backend: `backend/app/api/simulate.py`, `backend/app/physics/drugs.py`, `backend/app/schemas/simulation.py`, `backend/tests/test_history_and_forecast.py`.
- Frontend: `frontend/src/components/DrugSlider.jsx`, `frontend/src/components/PatientForm.jsx`, `frontend/src/components/RiskPanel.jsx`, `frontend/src/components/Heart3DPanel.jsx`, `frontend/src/heartAsset.js`, `frontend/src/heartAsset.test.js`, `frontend/src/branding.test.js`, `frontend/src/pages/Dashboard.jsx`, `frontend/index.html`, `frontend/public/assets/digitwin-logo.svg`, `frontend/public/favicon.svg`, `frontend/vite.config.js`, `frontend/package.json`, `frontend/package-lock.json`.
- Documentation and measurement: `README.md`, `docs/dataset_inventory.md`, `docs/parameter_assumptions.md`, `docs/model_evaluation_status.json`, `docs/simulation_benchmark.json`, `scripts/benchmark_simulation.py`, and this report.

Previously modified forecast/OCR/audit files were retained and were not part of this implementation; no forecast request schema or prediction logic was changed here.

## 9. Tests and build actually run

From `backend`:

```powershell
py -3.10 -m pytest -q
```

Result: **46 passed** in the current verification.

From the repository root:

```powershell
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
git --no-pager diff --check
```

Results in the current verification: **26 frontend tests passed** and the production build succeeded. Vite reports the Three.js chunk (746.41 kB minified) above its default 500 kB warning threshold; the build succeeds. No dependency upgrades were made for this verification.

A browser smoke test confirmed `/health`, `/drugs`, and `/simulate` responses; the dashboard showed Backend Connected. The model URL returned HTTP 200 with `model/gltf-binary` content and 407,484 bytes, and the anatomical heart rendered in the viewer. No browser console errors or failed requests were observed; Three.js emitted a `THREE.Clock` deprecation warning.

## 10. End-to-end demonstration

1. Follow the setup commands in [README.md](../README.md) to start FastAPI and Vite.
2. Select a scenario, verify the backend connection and loaded medication details, and run a simulation.
3. Compare baseline with the hypothetical simulation values and BP/HR/EF/concentration plots; inspect threshold flags as research checks, not medical safety advice.
4. Note the simulation run ID. The same ID is used by `/history/{run_id}`.
5. Select **Open 3D Heart Simulation**. Confirm the locally bundled attributed heart model, rotation/zoom/reset controls, and solver-derived numeric outputs. The model does not represent patient-specific 3D physiology.

## 11. Final checklist

### Completed and verified

- Existing model artifacts load and conform to the current feature schema.
- Drug information includes route, mechanism, administration, PK/PD values, and evidence status.
- Unsupported regimen fields are rejected instead of ignored.
- Existing simulation/session persistence and history retrieval are covered by tests.
- Dashboard separates hypothetical simulation outputs from baseline and avoids calling rule flags a clinical safety determination.
- 3D viewer integration, licensed model loading, scenario outputs, playback, and support limitations are implemented.
- Simulation service benchmark was executed and saved.
- Backend tests, frontend tests, and production build passed.

### Partially completed

- XGBoost evaluation is reproducible from current artifacts/arrays, but is based on only three independent test cases and the unverified drug-rate zero-fill assumption.
- Phenylephrine fit reproduction remains unverified; Case 61 has substantial missing drug-rate data and the historical fit script replaces missing rates with zero.
- 3D anatomy and controls: the locally installed CC BY 4.0 heart mesh and viewer load are implemented. Clinical/anatomical accuracy is not established, and the solver does not calculate patient-specific 3D physiology.
- Patient records: run snapshots are linked to run IDs, but there is no durable patient identity or user-facing longitudinal history.
- Dashboard integration: current simulation outputs work; patient/session identity linkage remains incomplete.
- Runtime target: service-only measurements are under two seconds; full API/runtime target has not been measured.

### Missing

- Original submitted report for a direct requirements comparison.
- A larger independent test set and external validation for XGBoost.
- Validated population calibration or subgroup analysis.
- Durable patient profiles, patient-specific history UI, and privacy/access-control assessment.
- End-to-end benchmark including API, serialization, and SQLite persistence.
