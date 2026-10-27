"""Drug library: one-compartment oral PK + Emax PD.

!! Parameters are ILLUSTRATIVE order-of-magnitude values so the demo behaves
!! plausibly. Replace with values from drug labels / DrugBank / papers (and cite
!! them in the report) before reporting any quantitative result.

PK:  Cp [mg/L] from a one-compartment model with first-order absorption.
PD:  E = Emax * Cp / (EC50 + Cp)   (fractional effect)
Effects: svr (reduces R), hr (reduces HR), inotropy (changes EF).
"""
import numpy as np

DRUGS = {
    "amlodipine": dict(label="Amlodipine (calcium channel blocker)", ka=0.3, t_half=40.0,
                       vd_l=1470.0, f=0.64, effects={"svr": dict(emax=0.25, ec50=0.003)},
                       default_dose=5.0, interval=24.0, evidence="assumed",
                       drug_class="Dihydropyridine calcium-channel blocker", route="oral",
                       modeling_role="Illustrative antihypertensive scenario affecting systemic vascular resistance.",
                       mechanism="Illustrative reduction in systemic vascular resistance.",
                       administration="Repeated oral dose with first-order absorption.",
                       source="PK/PD values are assumed demonstration parameters; not fitted or clinically validated.",
                       limitations="No tissue distribution or patient-specific pharmacodynamic response is modeled."),
    "metoprolol": dict(label="Metoprolol (beta-blocker)", ka=1.5, t_half=3.5, vd_l=294.0,
                       f=0.5, effects={"hr": dict(emax=0.30, ec50=0.02),
                                       "inotropy": dict(emax=-0.08, ec50=0.02)},
                       default_dose=50.0, interval=12.0, evidence="assumed",
                       drug_class="Beta-1 adrenergic blocker", route="oral",
                       modeling_role="Illustrative scenario affecting heart rate and modeled inotropy.",
                       mechanism="Illustrative reduction in heart rate and modeled inotropy.",
                       administration="Repeated oral dose with first-order absorption.",
                       source="PK/PD values are assumed demonstration parameters; active-metabolite kinetics are not represented.",
                       limitations="No active metabolites, selectivity changes, or patient-specific response are modeled."),
    "enalapril": dict(label="Enalapril (ACE inhibitor)", ka=1.0, t_half=11.0, vd_l=150.0,
                      f=0.4, effects={"svr": dict(emax=0.25, ec50=0.02)},
                      default_dose=10.0, interval=24.0, evidence="assumed",
                      drug_class="Angiotensin-converting enzyme inhibitor", route="oral",
                      modeling_role="Illustrative antihypertensive scenario affecting systemic vascular resistance.",
                      mechanism="Illustrative reduction in systemic vascular resistance.",
                      administration="Repeated oral dose with first-order absorption.",
                      source="PK/PD values are assumed demonstration parameters; conversion to enalaprilat is not represented.",
                      limitations="No enalaprilat conversion or renin-angiotensin feedback is modeled."),
    # IV vasopressor. Evidence-backed scenario fitted to VitalDB Case 61 continuous infusion
    # and radial arterial line BP response (MAP MAE: 6.69 mmHg, DBP MAE: 7.16 mmHg).
    "phenylephrine": dict(label="Phenylephrine (IV vasopressor; discrete-dose approximation)", ka=60.0, t_half=0.32, vd_l=34.4, f=1.0,
                          effects={"svr": dict(emax=-0.46, ec50=0.012)}, default_dose=0.1,
                          interval=1.0, evidence="historical_fit: VitalDB case 61 (MAP MAE 6.69 mmHg)",
                          drug_class="Selective alpha-1 adrenergic agonist", route="intravenous",
                          modeling_role="Historical-fit-attributed pressor scenario affecting systemic vascular resistance.",
                          mechanism="Modeled increase in systemic vascular resistance.",
                          administration="Repeated discrete dose with a rapid-absorption approximation; continuous infusion is not supported.",
                          source="Historical fit reported from VitalDB Case 61; raw case signals are absent from this checkout, so the fit is not reproducible here.",
                          limitations="Single-case historical attribution; no continuous infusion, baroreflex response, or independent validation."),
}


def concentration_series(drug, doses, times):
    """Cp(t) for a list of (time_h, dose_mg). Linear PK -> superposition of doses."""
    d = DRUGS[drug]
    ka, ke = d["ka"], np.log(2) / d["t_half"]
    cp = np.zeros_like(times, dtype=float)
    for t_d, dose in doses:
        dt = np.clip(times - t_d, 0, None)
        amt = dose * d["f"]
        c = amt * ka / (d["vd_l"] * (ka - ke)) * (np.exp(-ke * dt) - np.exp(-ka * dt))
        cp += np.where(times >= t_d, c, 0.0)
    return cp


def effects_series(regimen, times):
    """Combine drugs: multiplicative on R and HR, additive on EF."""
    r_f = np.ones_like(times, dtype=float)
    hr_f = np.ones_like(times, dtype=float)
    ef_add = np.zeros_like(times, dtype=float)
    conc = {}
    for item in regimen:
        name = item["drug"]
        doses = [(i * item["interval_h"], item["dose_mg"]) for i in range(item["n_doses"])]
        cp = concentration_series(name, doses, times)
        conc[name] = cp
        for eff, p in DRUGS[name]["effects"].items():
            e = p["emax"] * cp / (p["ec50"] + cp)
            if eff == "svr":
                r_f *= (1.0 - e)
            elif eff == "hr":
                hr_f *= (1.0 - e)
            elif eff == "inotropy":
                ef_add += e
    return r_f, hr_f, ef_add, conc
