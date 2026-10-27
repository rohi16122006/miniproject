# Dataset inventory and reproducibility

## Verified contents of this checkout

The repository contains VitalDB v1.0.0 metadata and 16 per-case signal arrays, plus processed train/validation/test arrays used with the checked-in model artifacts.

| File | Verified contents | Use and limitation |
|---|---|---|
| `data/raw/vitaldb/clinical_data.csv` | 6,388 rows, 74 columns, 2,199,588 bytes | De-identified case-level clinical metadata. It does not contain the 10-second SBP/DBP/HR/infusion time series used by the training pipeline. |
| `data/raw/vitaldb/track_names.csv` | 196 rows, 4 columns, 10,440 bytes | Track names, descriptions, sampling types, and units. It is a track dictionary, not the track values. |
| `data/raw/vitaldb/case_*.npz` | 16 arrays with 25,366 total 10-second samples across four channels | Contains SBP, DBP, HR, and drug-rate values downloaded by the project script; 12,748 drug-rate samples are missing (50.26%). |
| `data/processed/{train,val,test}.npz` | 2,333 / 716 / 487 windows, respectively | Processed split arrays; case-level split is 10 / 3 / 3 cases. |
| `data/processed/features.json` | Model feature-name list | Describes the 21 input features; arrays are stored separately in the NPZ files. |
| `data/processed/split.json` | Train/validation/test case IDs | Split metadata for the locally available arrays. |
| `data/processed/SOURCE.txt` | Relative path `data\\raw\\vitaldb` | Identifies the local raw data folder. |
| `backend/app/ml/artifacts/{xgb_sbp,xgb_dbp,xgb_hr}.json` | Three XGBoost regressor artifacts | Loadable and exercised by API tests; current metrics were recomputed from the local test arrays. |
| `backend/app/ml/artifacts/{meta,metrics}.json` | Feature/horizon metadata and saved metrics | Current metrics were recomputed from the local test arrays and match the metadata; see `model_evaluation_status.json`. |

The original submitted project report was not found in the repository.

## ECG dataset status

No PTB-XL waveform records or PTB-XL metadata files are present in this checkout. The new ECG abnormality training code targets PTB-XL v1.0.3 only; it does not treat the VitalDB case metadata or the existing cardiovascular forecast arrays as ECG labels. PTB-XL is published under CC BY 4.0 at [PhysioNet](https://physionet.org/content/ptb-xl/1.0.3/), with a required dataset citation; see [ECG_ANALYSIS_AND_TRAINING.md](./ECG_ANALYSIS_AND_TRAINING.md) for the task, access instructions, and pipeline.

The candidate ECG medication-effect datasets named in the project request are not included locally. Their access terms, treatment exposures, and response labels have not been verified in this checkout; no drug-response model or evaluation is claimed.

## Available clinical metadata dictionary

The values below are row-level completeness checks over the checked-in 6,388-row `clinical_data.csv`; they describe metadata only, not the measured time series.

| Field | Meaning / unit | Missing in local file | Used as model feature/target? |
|---|---|---:|---|
| `caseid` | De-identified VitalDB case identifier | 0.00% | Split/group identifier |
| `subjectid` | De-identified subject identifier | 0.00% | Not used by feature extractor; could be used to check patient-level grouping |
| `age` | Years (stored as CSV text) | 0.00% | Not currently used by XGBoost |
| `sex` | Recorded category | 0.00% | Not currently used by XGBoost |
| `weight`, `bmi` | kg, kg/m² | 0.00% | Not currently used by XGBoost |
| `asa` | ASA class | 2.08% | Not currently used by XGBoost |
| `aline1` | Arterial-line site/category | 45.79% | Eligibility/context only; not a model feature |
| `intraop_phe` | Case total phenylephrine metadata; source catalog unit must be checked before analysis | 0.00% | Not used as the infusion-rate feature |
| `caseend` | Case-end time field; catalog-specific time unit | 0.00% | Not used by the model |

Model input feature names and targets are defined by code: per-channel SBP/DBP/HR last, mean, standard deviation, min, max and slope, plus drug-rate last, mean and max. Targets are SBP, DBP and HR, not demographics or drug response. Clinical metadata is not used to train those checked-in models.

## Source, access, and limitations

- Source identified by repository scripts: VitalDB v1.0.0, [PhysioNet VitalDB](https://physionet.org/content/vitaldb/1.0.0/) / [VitalDB](https://vitaldb.net/dataset).
- Access and license: follow the current data-use terms and license shown by PhysioNet before downloading, redistributing, or publishing results. The repository does not embed a copy of the license.
- Intended signals: `Solar8000/ART_SBP` (mmHg), `Solar8000/ART_DBP` (mmHg), `Solar8000/HR` (per minute/bpm), and `Orchestra/PHEN_RATE` (mL/hour), downloaded by `scripts/download_vitaldb.py`.
- The cohort is intraoperative and from one South Korean hospital. It does not validate general-population use, South Asian demographic calibration, or clinical treatment decisions.
- Case IDs are de-identified study identifiers. Do not attempt re-identification.

## Training task and transformations in code

`backend/app/ml/features.py` defines four channels on a 10-second grid: SBP, DBP, HR, and phenylephrine infusion rate. It forms 30-sample (300-second) input windows and predicts SBP, DBP, and HR at the end of a further 30-sample horizon (300 seconds). Windows advance with a default stride of 6 samples. The target unit is mmHg for SBP/DBP and bpm for HR.

The code flags BP/HR values outside its configured bounds as missing, linearly interpolates gaps up to six samples in each measured vital channel, and drops windows with remaining missing vitals or targets. Missing drug-rate values are converted to zero without a missingness indicator. The local raw data contain 12,748 missing drug-rate samples out of 25,366 (50.26%). This can misrepresent unknown infusion records as no infusion; the existing model artifacts were trained using this assumption. Missingness does not establish that no infusion occurred.

`scripts/build_training_set.py` assigns whole case IDs to splits before windowing, which prevents windows from the same case crossing splits. The current `split.json` and arrays contain 10 training cases, 3 validation cases, and 3 test cases, with 2,333/716/487 windows respectively.

## Acquisition and preprocessing

After confirming current VitalDB access terms, the repository scripts provide the intended acquisition and preparation commands:

```powershell
py -3.10 scripts/download_vitaldb.py --cases 984 5894 4718 20 28 2265 61
py -3.10 scripts/build_training_set.py --raw data/raw/vitaldb --out data/processed
Set-Location backend
py -3.10 -m app.ml.train --processed ..\data\processed --out app\ml\artifacts
```

The download script uses VitalDB's Python package/API to request selected 10-second tracks. The currently available local arrays were used for the checks in this verification; no download or retraining was performed. Re-running training writes model files, so do not run it against the existing artifact directory unless intentionally reproducing and comparing in a separate output directory.

## Evaluation status

The current XGBoost and persistence metrics were recomputed from the saved model artifacts and `data/processed/test.npz`; both match the saved metadata. They are based on 487 windows from only 3 held-out cases and are exploratory, not clinical validation. See [model_evaluation_status.json](./model_evaluation_status.json) and [PROJECT_COMPLETION_REPORT.md](./PROJECT_COMPLETION_REPORT.md).
