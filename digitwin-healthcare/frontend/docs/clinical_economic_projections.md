# DigiTwin: Clinical & Economic Projections Statement

*Clarification of Report Targets vs. Software-Demonstrated Outcomes*

---

## 1. Overview and Purpose
In the submitted V-semester mini project report, several numerical targets and clinical impact claims were proposed. As specified by the evaluators' checklist, this document explicitly distinguishes **tangible implemented software capabilities** from **long-term clinical and economic projections** that require future prospective trials.

---

## 2. Status of Reported Outcomes

### A. "Simulation runtime below 2 seconds"
- **Status:** **DEMONSTRATED & VALIDATED.**
- **Evidence:** Measured across 50 benchmark iterations on local development hardware (Intel Core i5/i7 x86_64, Windows 11).
- **Actual Result:**
  - Mean runtime: **105.87 ms** (0.106 seconds).
  - 95th Percentile: **168.38 ms** (0.168 seconds).
  - Maximum observed: **171.12 ms** (0.171 seconds).
- **Documentation:** See [`docs/benchmark_report.md`](benchmark_report.md).

---

### B. "30–40% Reduction in Adverse Drug Reactions (ADRs)"
- **Status:** **THEORETICAL REPORT PROJECTION (NOT CLINICALLY DEMONSTRATED).**
- **Evaluation Requirements:**
  - Demonstrating actual reduction in adverse drug events requires a multi-center randomized controlled trial (RCT) comparing clinical outcomes in patients whose titration was guided by digital twin simulation versus standard of care.
  - A software prototype or in-silico simulation chart alone cannot substantiate a clinical ADR reduction claim.
- **Implemented Mechanism:** DigiTwin implements physiological safety guardrails ([`backend/app/services/risk.py`](../backend/app/services/risk.py)) that trigger rule-based alerts for critical hypotension ($SBP < 90\text{ mmHg}$), hypertension ($SBP > 180\text{ mmHg}$), bradycardia ($HR < 50\text{ bpm}$), and tachycardia ($HR > 120\text{ bpm}$). These serve as decision-support alerts, not guaranteed outcome reductions.

---

### C. "South Asian / Indian Demographic Inclusiveness"
- **Status:** **PRELIMINARY SEEDING MODEL (CALIBRATION INCOMPLETE).**
- **Evidence & Provenance:**
  - The project implements an optional demographic seeding switch (`south_asian_seeding: bool`).
  - Resistance ($R$) is scaled by $+10\%$ and compliance ($C$) is reduced by $-15\%$, reflecting published epidemiological trends of earlier arterial stiffening and accelerated vascular aging in South Asian cohorts (Enas et al., JAPI; Joshi et al., Lancet).
  - **Limitation:** The model has **NOT** been calibrated against a prospective local Indian clinical trial dataset. Current PK-PD fitting was conducted on the open-access VitalDB surgical dataset (Seoul National University Hospital, Korean cohort).
  - **Honest Conclusion:** As required by the evaluation checklist, this capability is documented as an academic research prototype feature rather than a fully calibrated clinical population tool.

---

### D. "Zero License-Cost Software Stack"
- **Status:** **DEMONSTRATED & VERIFIED.**
- **Evidence:** 100% of codebase runs on permissive open-source licenses (Python PSF, FastAPI MIT, React MIT, Tailwind MIT, SciPy BSD, XGBoost Apache 2.0, SQLite Public Domain).
- **Documentation:** Complete audit table in [`docs/license_audit.md`](license_audit.md).

---

### E. "2 Hours/Week Workflow Savings & 7 Lakh Annual Savings per High-Risk Patient"
- **Status:** **ECONOMIC HYPOTHESIS / COST-BENEFIT PROJECTION.**
- **Basis of Estimate:**
  - Assumes an ICU or surgical patient with acute hemodynamics requires continuous manual manual charting and drug titration trials (~15–20 minutes per dose adjustment).
  - Assumes prevention of 1 major ICU readmission or prolonged ventilator stay due to acute drug-induced hypotension or renal hypoperfusion saves approx. ₹5,00,000 – ₹7,00,000 in tertiary hospital care.
- **Caveat:** These figures are health-economic modeling projections and must not be presented as empirically measured institutional cost savings.
