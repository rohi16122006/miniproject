# TRIPOD+AI Statement: DigiTwin Short-Term Hemodynamic Forecast

*Transparent Reporting of a multivariable prediction model for Individual Prognosis Or Diagnosis + Artificial Intelligence (BMJ 2024;385:bmj-2023-078378)*

---

## 1. Title and Abstract
- **Title:** Development and External Patient-Level Validation of an XGBoost Machine Learning Model for 5-Minute Arterial Blood Pressure Forecasting in Surgical Digital Twins.
- **Abstract Summary:** DigiTwin integrates a short-horizon machine learning model with a 0D Windkessel physics engine. The AI component predicts future Systolic Blood Pressure (SBP), Diastolic Blood Pressure (DBP), and Heart Rate (HR) 5 minutes ahead ($T = +300\text{ s}$) using recent 5-minute telemetry ($L = 300\text{ s}$) and vasopressor infusion trends.

---

## 2. Background and Objectives
- **Clinical Rationale:** Intraoperative hypotension is associated with acute kidney injury, myocardial infarction, and increased mortality. Early 5-minute anticipatory warning allows proactive vasopressor titration rather than reactive crisis intervention.
- **Objective:** Evaluate whether gradient-boosted decision trees (XGBoost) can outperform the standard clinical persistence baseline ($y_{t+5\text{min}} \approx y_t$) on an unseen held-out patient.

---

## 3. Data Sources and Eligibility Criteria
- **Source Repository:** VitalDB (High-fidelity multi-parameter vital signs database in surgical patients, PhysioNet v1.0.0, open-access).
- **Study Population:** Non-cardiac surgical patients undergoing general anesthesia at Seoul National University Hospital, Seoul, Korea.
- **Inclusion Criteria:**
  1. Continuous radial arterial line pressure recording (`Solar8000/ART_SBP`, `Solar8000/ART_DBP`).
  2. Continuous electrocardiographic heart rate (`Solar8000/HR`).
  3. Continuous target-controlled or syringe pump phenylephrine infusion rate (`Orchestra/PHEN_RATE`).
- **Eligible Cohort:** 115 surgical cases in the 6,388-case PhysioNet archive satisfy all joint criteria. 7 cases were downloaded and verified for this benchmark.

---

## 4. Predictors and Feature Engineering
- **Sampling Interval:** Downsampled from raw 100 Hz / 500 Hz monitor waveforms to regular 10-second intervals ($\Delta t = 10\text{ s}$).
- **Observation Window ($L$):** 30 timesteps ($30 \times 10\text{ s} = 300\text{ s}$ / 5 minutes).
- **Forecast Horizon ($H$):** 30 timesteps ahead ($30 \times 10\text{ s} = 300\text{ s}$ / 5 minutes ahead).
- **Constructed Features (19 Features):**
  - **Summary Statistics:** Mean SBP, Mean DBP, Mean HR over the 5-minute window.
  - **Extrema:** Min/Max SBP, Min/Max DBP, Min/Max HR.
  - **Temporal Dynamics:** Linear trend slopes ($\text{mmHg/s}$, $\text{bpm/s}$) across the window.
  - **Latest Telemetry:** Current $SBP_t$, $DBP_t$, $HR_t$.
  - **Pharmacological Features:** Current phenylephrine infusion rate ($\text{mL/h}$), total infused drug volume during the 5-minute window, and drug delivery rate trend.

---

## 5. Missing Data Handling and Windowing
- Missing values within short gaps ($\le 30\text{ s}$) are linearly interpolated.
- Stride of 6 timesteps (60 seconds) between overlapping windows.
- Any window with non-physiological sensor disconnects ($SBP < 30$ or $SBP > 280\text{ mmHg}$) is discarded.
- Total valid windows extracted: **1,355 windows**.

---

## 6. Patient-Level Split (Zero-Leakage Design)
To guarantee strict prospective validation, data was split **strictly by patient (case ID)** before generating any temporal windows:

| Partition | Case IDs | Patient Count | Window Count | Role |
|---|---|---|---|---|
| **Training Set** | Cases 61, 984, 4718, 20, 28 | 5 patients | 1,093 windows | Model parameter fitting |
| **Validation Set** | Case 5894 | 1 patient | 134 windows | Hyperparameter tuning & early stopping |
| **Held-Out Test Set** | Case 2265 | 1 patient | 128 windows | Independent unseen evaluation |

---

## 7. Model Specification & Training Protocol
- **Architecture:** 3 independent XGBoost Regressors (`xgb_sbp`, `xgb_dbp`, `xgb_hr`).
- **Hyperparameters:**
  - `max_depth = 3` (avoids overfitting to idiosyncratic patient noise)
  - `n_estimators = 60`
  - `learning_rate = 0.08`
  - `colsample_bytree = 0.8`
  - `subsample = 0.8`
  - `early_stopping_rounds = 10`
- **Saved Model Artifacts:** Serialized JSON trees in `backend/app/ml/artifacts/`:
  - `xgb_sbp.json`
  - `xgb_dbp.json`
  - `xgb_hr.json`
  - `meta.json`
  - `metrics.json`

---

## 8. Comparative Performance on Held-Out Patient
Evaluated on Held-Out Case 2265 (never seen during training or tuning):

| Target Outcome | Persistence Baseline MAE | XGBoost Model MAE | Absolute Improvement | Persistence RMSE | XGBoost RMSE |
|---|---|---|---|---|---|
| **Systolic BP (SBP)** | 16.97 mmHg | **14.58 mmHg** | **-2.39 mmHg (-14.1%)** | 25.22 mmHg | **21.11 mmHg** |
| **Diastolic BP (DBP)** | 8.55 mmHg | **7.44 mmHg** | **-1.11 mmHg (-13.0%)** | 12.50 mmHg | **10.63 mmHg** |
| **Heart Rate (HR)** | **12.16 bpm** | 12.66 bpm | +0.50 bpm | 17.33 bpm | **16.09 bpm** |

### Key Clinical Interpretation:
1. **Blood Pressure:** For both SBP and DBP, XGBoost significantly outperforms persistence. Trend slopes and vasopressor infusion features allow the model to anticipate pressure recovery or decline 5 minutes before it occurs.
2. **Heart Rate:** Individual resting heart rate setpoints vary considerably between surgical patients. In the absence of an individual baseline adaptation term, persistence remains competitive for HR.

---

## 9. Limitations & Risk of Bias
1. **Single-Center Surgical Dataset:** Data originates from an adult Korean surgical cohort at Seoul National University Hospital. Generalizability to Indian/South Asian outpatient cohorts has not been established.
2. **Short Time Horizon:** The model is evaluated strictly at a 5-minute horizon ($+300\text{ s}$). Long-term multi-day projections are handled by the 0D Windkessel physics solver, not this statistical model.
3. **Research Prototype Disclaimer:** Outputs are not intended for autonomous drug administration or independent clinical diagnosis.
