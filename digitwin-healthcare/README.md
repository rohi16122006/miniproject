# DigiTwin cardiovascular simulation prototype

DigiTwin is an academic research prototype for exploring a 0D Windkessel cardiovascular model with simplified PK-PD medication scenarios. It is not a medical device, diagnostic system, or prescribing tool. Simulated responses are hypotheses, not observed patient outcomes.

## Setup and run

Requirements: Python 3.10+, Node.js/npm, and Windows PowerShell (commands below use `py` and `npm.cmd`; adapt the executable names for other platforms).

Install backend dependencies:

```powershell
py -3.10 -m pip install -r backend\requirements.txt
```

Start the backend from the repository root:

```powershell
Set-Location backend
py -3.10 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a separate terminal, install and start the frontend:

```powershell
npm.cmd --prefix frontend install
npm.cmd --prefix frontend run dev
```

Open `http://localhost:5173/`. The API documentation is at `http://127.0.0.1:8000/docs`.

## Architecture and behavior

- `POST /simulate` runs the existing 0D Windkessel solver and simplified PK-PD dose scenarios; it writes the simulation request and result to SQLite and returns a `run_id`.
- `GET /drugs` returns the drug catalog, implementation parameters, route/administration notes, and evidence status.
- `GET /history` and `GET /history/{run_id}` retrieve saved simulation sessions. A durable patient identity or longitudinal patient record is not implemented; the request snapshot is stored with each run.
- The Dashboard displays baseline and hypothetical-simulation outputs, BP/HR/EF and modeled concentration curves, and rule-based threshold flags. Threshold flags are not clinical safety assessments.
- The **ECG Analysis** workspace tab validates supported ECG CSV/WFDB ZIP waveforms, extracts text from text-based PDF reports, and OCRs report images in the browser. Images captured or selected in Patient Information can be carried to the tab for explicit analysis. It displays extracted measurements as unverified input; it does not diagnose or select medication. Analysis summaries are stored locally without the source file, original filename, waveform preview, or extracted report text. The PTB-XL training pipeline is documented in [ECG analysis and training](docs/ECG_ANALYSIS_AND_TRAINING.md); no ECG model is trained or installed in this checkout.
- The optional 3D viewer loads the included anatomical model at `frontend/public/models/heart.glb`. The mesh is “Realistic Human Heart” by neshallads, via Wikimedia Commons, CC BY 4.0; it was converted from STL to GLB, centered, scaled, and assigned a display material. Attribution and conversion details are in the [project completion report](docs/PROJECT_COMPLETION_REPORT.md).
- The forecast implementation and API remain present, but the forecast workflow is not displayed on the Dashboard. The frontend does not manufacture observations for it.

## Drug parameters and limitations

The three oral-drug parameterizations (amlodipine, metoprolol, and enalapril) are assumed illustrative values. Phenylephrine has a historical fit attribution to VitalDB Case 61; the local Case 61 array has 63.7% missing drug-rate samples, and the historical fit has not been rerun or independently verified. The simulation interface models discrete doses with a rapid-absorption approximation; it does not implement a continuous infusion schedule. Mechanism detail and provenance are documented in [parameter_assumptions.md](docs/parameter_assumptions.md).

Measured BP calibrates the Windkessel R/C parameters. If BP is omitted, the model uses explicitly assumed demographic priors. The South Asian multipliers are placeholders, not validated population calibration.

## Dataset and model reproducibility

This checkout contains 16 VitalDB case arrays and processed train/validation/test arrays (10/3/3 cases; 2,333/716/487 windows). The saved XGBoost and persistence metrics were recomputed from the current test split and match the artifact metadata. The test set contains only three independent cases, so this exploratory evaluation is not clinical validation. The current preprocessing replaces missing drug-rate samples with zero: 12,748 of 25,366 downloaded samples (50.26%) are missing. This is an unverified modeling assumption, not evidence that no infusion occurred. See [dataset_inventory.md](docs/dataset_inventory.md) and [model_evaluation_status.json](docs/model_evaluation_status.json).

After reviewing VitalDB license and data-use requirements, the existing acquisition and preprocessing scripts can be used:

```powershell
py -3.10 scripts\download_vitaldb.py --cases 984 5894 4718 20 28 2265 61
py -3.10 scripts\build_training_set.py --raw data\raw\vitaldb --out data\processed
Set-Location backend
py -3.10 -m app.ml.train --processed ..\data\processed --out ..\evaluation-artifacts
```

Training writes new model files. It is directed to a separate output folder above to avoid overwriting checked-in artifacts.

## Validation and benchmark

From the repository root:

```powershell
Set-Location backend
py -3.10 -m pytest -q
Set-Location ..
npm.cmd --prefix frontend test
npm.cmd --prefix frontend run build
py -3.10 scripts\benchmark_simulation.py --repeats 15 --horizon-h 72 --n-points 100
```

The benchmark reports service-call runtime and environment details to `docs/simulation_benchmark.json`. It excludes HTTP, JSON serialization, and SQLite persistence, and should not be interpreted as a whole-request measurement.

The current production build succeeds, but Vite warns that the minified Three.js chunk (746.41 kB) exceeds its default 500 kB size threshold.

## Demonstration

1. Start the backend and frontend using the commands above.
2. Confirm **Backend Connected** in the Dashboard.
3. Choose a built-in synthetic scenario or enter the clearly labelled patient inputs.
4. Inspect the selected medication's evidence and administration details; assumed and historical parameters are not clinically validated.
5. Run the hypothetical simulation and compare its output curves with the baseline.
6. Inspect the current run ID and the 3D viewer. The viewer loads the locally bundled, attributed anatomical mesh and displays only the numeric outputs supported by the solver; it does not show patient-specific 3D physiology.

## Reports and scope

- [Project completion report](docs/PROJECT_COMPLETION_REPORT.md)
- [Dataset inventory](docs/dataset_inventory.md)
- [Parameter assumptions](docs/parameter_assumptions.md)
- [Model evaluation status](docs/model_evaluation_status.json)
- [ECG analysis and training](docs/ECG_ANALYSIS_AND_TRAINING.md)

The submitted project report was not present in the repository and could not be audited directly. No claims of demographic calibration, patient-specific anatomy, detailed 3D hemodynamics, validated drug response, or clinical safety are made.
