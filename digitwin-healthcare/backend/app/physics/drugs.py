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
    "losartan": dict(label="Losartan (ARB)", ka=1.2, t_half=2.0, vd_l=34.0, f=0.33,
                     effects={"svr": dict(emax=0.22, ec50=0.05)}, default_dose=50.0, interval=24.0,
                     evidence="assumed", drug_class="Angiotensin II receptor blocker (ARB)", route="oral",
                     modeling_role="First-line antihypertensive selectively blocking AT1 receptors.",
                     mechanism="Selective AT1 receptor antagonist reducing systemic arterial resistance.",
                     administration="Once-daily oral tablet.",
                     source="Standard clinical pharmacology references.",
                     limitations="Active metabolite E-3174 represented as a combined clearance curve."),
    "lisinopril": dict(label="Lisinopril (ACE inhibitor)", ka=0.8, t_half=12.0, vd_l=124.0, f=0.25,
                       effects={"svr": dict(emax=0.26, ec50=0.015)}, default_dose=10.0, interval=24.0,
                       evidence="assumed", drug_class="Angiotensin-converting enzyme (ACE) inhibitor", route="oral",
                       modeling_role="Long-acting once-daily ACE inhibitor with renal protective profile.",
                       mechanism="Inhibits angiotensin-converting enzyme, decreasing systemic vascular resistance.",
                       administration="Once-daily oral administration.",
                       source="FDA approved labeling and clinical pharmacology.",
                       limitations="Renin feedback kinetics and tissue ACE dynamics are simplified."),
    "hydrochlorothiazide": dict(label="Hydrochlorothiazide (thiazide diuretic)", ka=1.4, t_half=9.5, vd_l=240.0, f=0.70,
                                effects={"svr": dict(emax=0.18, ec50=0.04)}, default_dose=25.0, interval=24.0,
                                evidence="assumed", drug_class="Thiazide diuretic", route="oral",
                                modeling_role="First-line diuretic lowering arterial tone and volume overload.",
                                mechanism="Inhibits Na+/Cl- cotransporter in distal convoluted tubule.",
                                administration="Daily oral dose.",
                                source="AHA/ACC hypertension guidelines and pharmacokinetics literature.",
                                limitations="Renal electrolyte exchange and RAAS activation are modeled phenomenologically."),
    "carvedilol": dict(label="Carvedilol (alpha/beta blocker)", ka=1.8, t_half=6.0, vd_l=115.0, f=0.30,
                       effects={"hr": dict(emax=0.22, ec50=0.02),
                                "svr": dict(emax=0.16, ec50=0.02),
                                "inotropy": dict(emax=-0.04, ec50=0.02)},
                       default_dose=12.5, interval=12.0, evidence="assumed",
                       drug_class="Combined alpha-1 and beta-adrenergic antagonist", route="oral",
                       modeling_role="Indicated in heart failure with reduced EF and hypertensive ischemic heart disease.",
                       mechanism="Simultaneous beta-blockade and alpha-1 arteriolar vasodilation.",
                       administration="Twice-daily oral administration with food.",
                       source="US Pharmacopeia and clinical heart failure guidelines.",
                       limitations="Stereoselective enantiomer clearance modeled as racemic mixture."),
    "diltiazem": dict(label="Diltiazem (non-DHP calcium channel blocker)", ka=1.2, t_half=4.5, vd_l=305.0, f=0.40,
                      effects={"hr": dict(emax=0.20, ec50=0.03),
                               "svr": dict(emax=0.18, ec50=0.03)},
                      default_dose=120.0, interval=24.0, evidence="assumed",
                      drug_class="Non-dihydropyridine calcium channel blocker", route="oral",
                      modeling_role="Concurrent rate control and blood pressure reduction.",
                      mechanism="Inhibits L-type calcium channels in sinoatrial/AV nodal cells and vascular smooth muscle.",
                      administration="Extended-release once-daily oral capsule.",
                      source="Goodman & Gilman's Pharmacological Basis of Therapeutics.",
                      limitations="First-pass hepatic metabolism and active desacetyl metabolite are simplified."),
    "norepinephrine": dict(label="Norepinephrine (IV vasopressor)", ka=60.0, t_half=0.05, vd_l=16.0, f=1.0,
                           effects={"svr": dict(emax=-0.52, ec50=0.005),
                                    "inotropy": dict(emax=0.06, ec50=0.005)},
                           default_dose=0.04, interval=0.5, evidence="assumed",
                           drug_class="Potent alpha-1 and beta-1 adrenergic agonist", route="intravenous",
                           modeling_role="First-line intensive care vasopressor for acute shock resuscitation.",
                           mechanism="Potent vasoconstriction elevating systemic arterial pressure with mild positive inotropy.",
                           administration="Continuous intravenous infusion approximated with discrete micro-dosing.",
                           source="Surviving Sepsis Campaign guidelines and ICU pharmacology.",
                           limitations="Continuous infusion approximated via rapid first-order distribution."),
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
