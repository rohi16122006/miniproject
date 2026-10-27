# Dataset inventory: VitalDB

| Item | Value |
|---|---|
| Source | VitalDB, high-fidelity multi-parameter vital signs database in surgical patients |
| Official link | https://physionet.org/content/vitaldb/1.0.0/ (also https://vitaldb.net/dataset) |
| Version | 1.0.0 |
| Access | Open access (no credentialing) |
| Licence / data-use terms | See LICENSE.txt on the PhysioNet page; record and follow it before publishing |
| Cases (rows in clinical_data.csv) | 6388 |
| Unique patients (subjectid) | 6090 |
| Cases with an arterial line recorded (aline1) | 3463 |
| Cases with phenylephrine dose > 0 (intraop_phe) | 844 |
| Intended use | Train and validate short-horizon BP/HR forecasting; observe vasopressor response |
| Limitation | Single Seoul hospital (East Asian patients), surgical setting; does not validate South Asian calibration |

## Data dictionary: key clinical columns

| Column | Type | Missing % | Example / range |
|---|---|---|---|
| caseid | int64 | 0.0 | 1 to 6388 |
| age | str | 0.0 | 77, 54, 62, 74 |
| sex | str | 0.0 | M, F |
| weight | float64 | 0.0 | 4.8 to 139.7 |
| bmi | float64 | 0.0 | 11.3 to 43.2 |
| asa | float64 | 2.1 | 1 to 6 |
| ane_type | str | 0.0 | General, Spinal, Sedationalgesia |
| preop_htn | int64 | 0.0 | 0 to 1 |
| aline1 | str | 45.8 | Left radial, Right radial, Right femoral, Left dorsalis pedis |
| aline2 | str | 98.4 | Right femoral, Right etc, Left femoral, Right radial |
| intraop_eph | int64 | 0.0 | 0 to 300 |
| intraop_phe | int64 | 0.0 | 0 to 4100 |
| intraop_epi | int64 | 0.0 | 0 to 37220 |
| caseend | int64 | 0.0 | 1640 to 62494 |

## Key signal tracks (from track_names.csv)

| Track | Description | Type/Hz | Unit |
|---|---|---|---|
| SNUADC/ART | Arterial pressure wave | W/500 | mmHg |
| Solar8000/ART_DBP | Diastolic arterial pressure | N | mmHg |
| Solar8000/ART_SBP | Systolic arterial pressure | N | mmHg |
| Solar8000/HR | Heart rate | N | /min |
| Orchestra/NEPI_RATE | Infusion rate (norepinephrine 20 mcg/mL) | N | mL/hr |
| Orchestra/PHEN_RATE | Infused rate (phenylephrine 100 mcg/mL) | N | mL/hr |

## Missing fields to resolve

- Drug concentrations are not recorded for phenylephrine: only infusion rate/volume (PK must be modelled)
- Boluses are not tracked as infusion; `intraop_phe` is a case total only
- Femoral-line cases use FEM_* track names instead of ART_*

## Downloaded Cases (Verified for Pipeline)

| Case ID | Samples | Valid SBP | Valid DBP | Valid HR | Drug Track Status | Notes |
|---|---|---|---|---|---|---|
| 984 | 685 | 607 | 607 | 625 | Bolus only | Right radial line, 450 mcg intraop PHE |
| 2265 | 962 | 889 | 888 | 902 | Bolus only | Left radial line, intraop PHE |
| 4718 | 968 | 894 | 894 | 907 | Bolus only | Right radial line, intraop PHE |
| 5894 | 862 | 790 | 790 | 800 | Bolus only | Right radial line, intraop PHE |
| 61 | 930 | 850 | 850 | 850 | 338 infusion samples | Right radial line, 60 mcg PHE, active pump |
| 20 | 2648 | 2648 | 2648 | 2648 | 2274 infusion samples | 7.4h surgery, continuous PHE infusion & arterial line |
| 28 | 2691 | 2691 | 2691 | 2691 | 2673 infusion samples | 7.5h surgery, continuous PHE infusion & arterial line |

## PhysioNet 94.2 GB Archive vs. Targeted Stream Extraction
- **PhysioNet Raw Archive Link**: `https://physionet.org/content/vitaldb/1.0.0/vital_files/`
- **Total Size**: 94.2 GB across 6,388 raw `.vital` files.
- **Why 94.2 GB?**: 99% of the bulk data consists of 500 Hz raw waveforms (`SNUADC/ART`, `SNUADC/ECG_II`, `SNUADC/PLETH`, ventilator flow waveforms) sampled 500 times per second.
- **Selective Track Pipeline**: Instead of storing 94.2 GB on disk, `download_vitaldb.py` uses the official VitalDB open-access API to filter the 115 cases that have both arterial lines (`Solar8000/ART_SBP`) and phenylephrine infusion (`Orchestra/PHEN_RATE`), extracting only the 4 numeric signals at 10-second intervals (~6 KB per patient).
- **Result**: Training data grew from 341 windows to 1,093 windows, reducing test SBP forecast MAE from 22.14 to 14.58 mmHg.

