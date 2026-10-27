# ECG analysis and training

## Scope and safety

The ECG feature is a research-data inspection workflow. It is not a diagnostic device, does not recommend medication, and does not establish that uploaded data are authentic. Extracted report text is unverified; OCR and report interpretations are not accepted as confirmed diagnoses. Use synthetic or de-identified files and do not include names or other identifiers.

The existing PK-PD medication simulator remains separate. No ECG-to-drug selection or drug-response model is implemented. An improved blood-pressure or heart-rate curve is not evidence that a treatment is appropriate.

## Supported upload formats

The Dashboard's **ECG Analysis** tab sends uploads to `POST /ecg/analyze`:

| Input | Processing | Limitations |
|---|---|---|
| CSV waveform | Numeric columns named `Lead I`, `Lead II`, `Lead III`, `aVR`, `aVL`, `aVF`, `V1`-`V6`, or `ECG`; one sample per row. Supply amplitude units (`mV`, `uV`, `V`) and sampling frequency, or provide a regular `time_s` column. | Missing or non-numeric samples, irregular time steps, unsupported units, and unsupported sample rates are rejected; no values are imputed. |
| WFDB ZIP | One `.hea` header and its `.dat` signal files; sampling rate and units are read from the header. Archive paths and size are checked before parsing. | Exactly one record; mixed signal units are rejected. Upload a ZIP rather than a standalone header. |
| Text PDF | Extracts text from up to 20 pages with `pypdf`. | Scanned/image-only PDF pages are not OCR processed. |
| PNG, JPG/JPEG, WEBP | English OCR runs in the browser with Tesseract.js; recognized text is sent with the image for measurement parsing. | OCR may omit or misread content. A valid report image does not establish a valid measurement or diagnosis. |
| TXT | Parses UTF-8 report text. | Text is treated as unverified source content. |

Raw waveform checks accept 100-2,000 Hz and 2 seconds-10 minutes, normalize amplitude to mV, and display a downsampled preview after a 4th-order, zero-phase 0.5 Hz to at-most-40 Hz Butterworth bandpass. Missing samples are rejected rather than filled. Basic flat-line and range indicators are engineering checks only; they are not clinical signal-quality validation.

Text parsing extracts values when recognizable labels are present: heart rate, PR, QRS, QT, QTc, and a one-line reported interpretation. Missing fields are returned as `null`/“Not found.” It does not calculate interval measurements from a waveform. The extracted source text is returned for immediate traceability in the response and UI.

Uploads are limited to 10 MiB; WFDB archives are limited to 20 files and 50 MiB uncompressed. PDF reports are limited to 20 pages. The backend does not save uploaded documents, raw waveform previews, original filenames, or extracted report text. SQLite stores a derived analysis summary and optional simulation-run ID. A retrieved analysis therefore does not include the original filename, source text, or waveform. The application has no authentication or user/patient identity boundary; local SQLite records are not isolated between users. Linking an analysis to a simulation is optional, and the API verifies that the run exists.

## API

- `POST /ecg/analyze`: validate a waveform/report and return signal or extracted-report information. Form fields: `file`, optional `sampling_rate_hz`, `units`, `run_id`, and `ocr_text` (image OCR supplied by the browser).
- `GET /ecg/analyses?run_id=<id>&limit=20`: list derived analysis records, optionally for one simulation run.
- `GET /ecg/analyses/{analysis_id}`: retrieve a persisted derived summary.
- `GET /ecg/model`: report whether a compatible trained abnormality artifact is available.
- `POST /ecg/predict`: run PTB-XL classification when the compatible artifact exists. It requires a 10-second, standard-order, 12-lead waveform. It returns per-label model scores, not calibrated confidence. Without an artifact the endpoint returns HTTP 503, not a placeholder prediction.

The existing `/simulate`, `/drugs`, `/history`, and `/forecast` routes are unchanged. ECG analysis IDs are distinct from simulation run IDs; `associated_run_id` is only set when a valid `run_id` is supplied.

## Dataset and task choice

### PTB-XL abnormality task

The implemented training task is multi-label classification of PTB-XL diagnostic superclasses from a 10-second, 12-lead ECG. PTB-XL v1.0.3 documents 21,799 ECGs from 18,869 patients, with cardiologist-assigned SCP-ECG statements, patient IDs, recommended folds, and 100/500 Hz signals.

Official source and terms:

- [PhysioNet PTB-XL v1.0.3](https://physionet.org/content/ptb-xl/1.0.3/)
- [PTB-XL license (CC BY 4.0)](https://physionet.org/content/ptb-xl/1.0.3/LICENSE.txt)
- Dataset citation/DOI: Wagner et al. (2022), [10.13026/kfzx-aw45](https://doi.org/10.13026/kfzx-aw45); also cite the original 2020 *Scientific Data* publication at [10.1038/s41597-020-0495-6](https://doi.org/10.1038/s41597-020-0495-6).

Download the official version through PhysioNet, comply with its displayed access and CC BY 4.0 attribution terms, and cite the dataset. Keep the downloaded data out of source control. This checkout contains no PTB-XL waveform records or metadata. The current VitalDB `clinical_data.csv` and track dictionary are not ECG signal or PTB-XL training data.

PTB-XL diagnostic statements do not encode a medication exposure or treatment response. Consequently, PTB-XL is not used to train a drug-response model. The named dofetilide/moxifloxacin and ranolazine/dofetilide/verapamil/quinidine candidate datasets are not present locally, and their exact source landing pages, access conditions, treatment timing/exposure fields, and response-label definitions could not be verified during this change. They are not used and no medication-effect result is claimed.

### Reproducible baseline

The baseline is `StandardScaler` plus class-balanced one-vs-rest logistic regression. It is a conventional, interpretable starting point for a multi-label task, not a claim of state-of-the-art performance.

Preprocessing and features:

1. Read the 100 Hz `filename_lr` WFDB records and require the standard lead order `I, II, III, aVR, aVL, aVF, V1`-`V6`.
2. Resample to 100 Hz if an inference waveform uses a different supported rate; require an approximately 10-second recording. Missing and non-finite values fail validation; the pipeline does not impute them.
3. Extract 13 features per lead (156 total): mean, standard deviation, RMS, peak-to-peak amplitude, five quantiles, median absolute first difference, and relative power in 0.5-5, 5-15, and 15-40 Hz bands.
4. Map diagnostic SCP codes to diagnostic superclass labels using the dataset's `scp_statements.csv`. No drug names or treatment responses are labels.

Splits use the PTB-XL recommended `strat_fold`: folds 1-8 training, fold 9 validation, fold 10 held-out test. The script verifies each `patient_id` occurs in only one fold before signal windowing/features. Seed defaults to 42. Validation metrics are reported separately and do not tune this baseline. Test output includes per-class precision, recall, F1, confusion matrix, AUROC and average precision where defined, macro summaries, and an all-negative comparison. This classical baseline has no epoch-based training curves; they are not applicable.

Train from the repository root after obtaining PTB-XL v1.0.3 and extracting it so the directory contains `ptbxl_database.csv`, `scp_statements.csv`, and `records100/`:

```powershell
py -3.10 -m pip install -r backend\requirements.txt
Set-Location backend
py -3.10 -m app.ml.train_ecg --dataset-root ..\data\raw\ptb-xl --out app\ml\ecg_artifacts --seed 42
```

The command writes `ptbxl_logistic.joblib`, `metrics.json`, and `training_config.json`. Keep the model artifacts under `backend/app/ml/ecg_artifacts/` for API discovery. The file is generated output and should not be committed unless the project explicitly elects to distribute it under the applicable dataset/model terms.

## Drug-response data and simulator boundary

No drug-response model is implemented. The existing simulation continues to produce hypothetical 0D Windkessel/PK-PD outputs from its own inputs. ECG measurements do not provide a validated mapping to blood pressure, ejection fraction, stroke volume, or patient-specific mechanics. The ECG abnormality model, if trained, must not be used to choose or rank medications. The app offers no automatic prescription.

## Verification status for this checkout

- Code, parsing, API, split validation, model artifact loading, and inference are covered by backend tests.
- A tiny synthetic WFDB fixture exercises the training command and artifact-writing path in tests only; those synthetic test results are not PTB-XL evaluation metrics and are not included as model results.
- Frontend upload/API behavior is covered by frontend tests; the production build should be run after changes.
- PTB-XL is not downloaded here, so training has not been executed, no model artifact was produced, and there are no held-out metrics to report.
- No drug-related labels or treatment-response dataset have been verified. Drug-response training remains unsupported.
- There is no login, patient identity, or per-user record isolation. A linked `run_id` is an association inside the local database, not an access-control boundary.
