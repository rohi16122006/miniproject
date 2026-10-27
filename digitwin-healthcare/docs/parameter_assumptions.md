# Parameter and Assumption Table (Steps 4 and 5)

Academic research prototype (DigiTwin). Research prototype only; **not a clinical tool**.
Every parameter is explicitly categorized as **measured**, **literature**, **estimated**, or **assumed**.

---

## 1. 0D Arterial Physics Model (`backend/app/physics/windkessel.py`)

Formulation: 3-Element Windkessel ($R-C-R_c$) with periodic systolic half-sine ejection into an elastic compliance chamber and peripheral systemic vascular resistance.

### State Equations
$$\frac{dP_c}{dt} = \frac{Q(t) - P_c / R}{C}$$
$$P_a(t) = P_c(t) + R_c \cdot Q(t)$$

Where:
* $P_c(t)$ is the pressure across arterial compliance $C$ ($\text{mmHg}$).
* $P_a(t)$ is aortic root pressure ($\text{mmHg}$).
* $Q(t)$ is cardiac inflow ($\text{ml/s}$):
  $$Q(t) = \begin{cases} \frac{\pi \cdot SV}{2 t_s} \sin\left(\frac{\pi t}{t_s}\right) & 0 \le t \le t_s \\ 0 & t_s < t < T \end{cases}$$
* $T = 60 / HR$ (cardiac cycle period in seconds).
* $t_s = 0.35 \sqrt{60 / HR}$ (systolic ejection duration in seconds).

### Parameter Inventory & Citations

| Parameter | Units | Value / Range | Label | Source & Formal Citation |
|---|---|---|---|---|
| **$R$ (Peripheral resistance)** | $\text{mmHg}\cdot\text{s/ml}$ | $0.6 - 1.8$ (patient-specific) | **Estimated** | Calibrated per patient from measured SBP and DBP using least-squares matching over periodic steady state. |
| **$C$ (Total arterial compliance)** | $\text{ml/mmHg}$ | $0.8 - 2.2$ (patient-specific) | **Estimated** | Calibrated simultaneously with $R$. |
| **$R_c$ (Aortic characteristic impedance)** | $\text{mmHg}\cdot\text{s/ml}$ | $0.05$ | **Literature** | Westerhof N, Elzinga G, Sipkema P. *An artificial arterial system for pumping hearts.* J Appl Physiol. 1971;31(5):776-781. |
| **Aortic inflow waveform $Q(t)$** | $\text{ml/s}$ | Half-sine, $\int_0^{t_s} Q(t)dt = SV$ | **Literature** | Stergiopulos N, Meister JJ, Westerhof N. *Evaluation of methods for estimation of total arterial compliance.* Am J Physiol. 1995;268(4):H1540-8. |
| **Ejection time $t_s$** | $\text{s}$ | $0.35 \sqrt{60 / HR}$ | **Literature** | Weissler AM, Harris WS, Schoenfeld CD. *Systolic time intervals in heart failure in man.* Circulation. 1968;37(2):149-159. |
| **Stroke volume ($SV$)** | $\text{ml}$ | $EF \times EDV$ ($66\ \text{ml}$ baseline) | **Measured / Assumed** | $EF$ measured if echocardiography available; baseline $EDV = 120\ \text{ml}$ assumed standard adult norm. |

---

## 2. Historical Phenylephrine Fit Attribution (`backend/app/physics/drugs.py`)

The repository records a historical fit attribution to VitalDB Case 61 and includes a fit script and plot. The Case 61 signal array is present in this checkout, but 63.7% of its drug-rate samples are missing and the fit script converts missing rates to zero. The fitting procedure was **not** rerun for this verification; the reported numbers remain historical project metadata, not newly measured or independently validated results.

### Pharmacokinetic / Pharmacodynamic Formulation
* **1-Compartment PK:**
  $$\frac{dC_p}{dt} = \frac{R_{in}(t)}{V_d} - k_e C_p(t), \quad k_e = \frac{\ln(2)}{t_{1/2}}$$
* **Sigmoidal $E_{max}$ PD on Vascular Resistance:**
  $$r_f(t) = \frac{R(t)}{R_0} = 1.0 + \frac{E_{max} \cdot C_p(t)}{EC_{50} + C_p(t)}$$

### Fitted Parameters & Empirical Validation

| Parameter | Fitted Value | Literature Baseline | Label | Empirical Fit & Evidence |
|---|---|---|---|---|
| **$t_{1/2}$ (Effective hemodynamic half-life)** | **$0.32\ \text{h}$ ($19.0\ \text{min}$)** | $5 - 20\ \text{min}$ (historically cited range) | **Historical fit value; not reproduced** | Hengstmann JH, Goronzy J. *Pharmacokinetics of 3H-phenylephrine in man.* Eur J Clin Pharmacol. 1982;21(4):335-341. |
| **$V_d$ (Distribution volume)** | **$34.4\ \text{L}$ ($0.6\ \text{L/kg}$)** | $0.5 - 0.9\ \text{L/kg}$ | **Literature-derived in prior project work** | Schier R, et al. *Cardiovascular hemodynamics of phenylephrine.* Br J Anaesth. 2012. |
| **$E_{max}$ (Max SVR increase)** | **$-0.46$ in code's sign convention** | Historical project value: $0.462$ increase | **Historical fit value; not reproduced** | The code uses `r_f = 1 - E`, so a negative `emax` increases resistance. |
| **$EC_{50}$ (Potency)** | **$0.0120\ \text{mg/L}$ ($12.0\ \mu\text{g/L}$)** | Historical project range: $10 - 25\ \mu\text{g/L}$ | **Historical fit value; not reproduced** | Historical notes attribute the fit to bounded L-BFGS-B on observed MAP. |
| **Goodness-of-Fit Error** | **Historical MAP MAE: $6.69\ \text{mmHg}$** | Historical MAP RMSE: $10.11\ \text{mmHg}$ | **Historical report only** | Historical DBP MAE: $7.16\ \text{mmHg}$; SBP MAE: $19.24\ \text{mmHg}$. See `docs/phenylephrine_fit.png`; source values have not been independently reproduced. |

The current regimen API does not model a continuous infusion. It represents repeated discrete doses with rapid absorption (`ka = 60 h⁻¹`) and does not accept an infusion-rate schedule. The historical fitting script processes an infusion-rate recording, which is not identical to the current regimen interface. These values are research assumptions, not a validated dosing model.

---

## 3. Illustrative Oral Drug Parameters (Assumed / Unfitted)

The other oral agents in `drugs.py` are illustrative order-of-magnitude estimates for interface testing and must **not** be presented as clinically validated:

| Drug | $t_{1/2}$ ($\text{h}$) | $V_d$ ($\text{L}$) | $F$ | Target Effect | $E_{max}$ | $EC_{50}$ ($\text{mg/L}$) | Label |
|---|---|---|---|---|---|---|---|
| Amlodipine | 40.0 | 1470 | 0.64 | SVR reduction | 0.25 | 0.003 | **Assumed** |
| Metoprolol | 3.5 | 294 | 0.50 | HR & Inotropy reduction | 0.30 / -0.08 | 0.020 | **Assumed** |
| Enalapril | 11.0 | 150 | 0.40 | SVR reduction | 0.25 | 0.020 | **Assumed** |

---

## 4. Demographic Seeding Priors (`backend/app/seeding/demographics.py`)

Used only when measured baseline blood pressure is unavailable:

| Factor | Formula / Offset | Label | Methodological Note |
|---|---|---|---|
| Age effect on Compliance | $C = 1.8 - 0.012 \cdot (\text{age} - 30)$ | **Assumed** | Directionally aligns with aortic stiffening (Avolio et al., 1983), but absolute values are uncalibrated. |
| Age effect on Resistance | $R = 1.05 + 0.004 \cdot (\text{age} - 30)$ | **Assumed** | Directional vascular resistance rise. |
| South Asian Seeding Factor | $C \times 0.95$, $R \times 1.04$ | **Assumed** | **CRITICAL: Assumed offset only. NOT validated on Indian population data.** VitalDB consists of East Asian surgical patients and does not validate South Asian cardiovascular physiology. |

---

## 5. Explicit Model Limitations

1. **No active baroreflex feedback:** Baroreceptor-mediated reflex bradycardia during phenylephrine vasoconstriction is not dynamically coupled.
2. **Instantaneous concentration-effect coupling:** Does not include an biophase effect-compartment ($k_{e0}$) delay.
3. **Rigid stroke volume:** Stroke volume $SV$ does not vary with afterload (Frank-Starling law is omitted in the 0D lumped model).
4. **Research prototype only:** strictly for academic treatment simulation exploration and education.
