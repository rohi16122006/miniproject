"""Cardiovascular Drug Safety & Efficacy Recommendation Engine.

Evaluates each candidate drug in the library against the patient's
individual baseline hemodynamics (0D Windkessel + PK/PD) and ranks them
from safest/most indicated to contraindicated.

Dynamically evaluates whether the currently tested drug regimen is safe & optimal
for the patient. If the current drug is safe and effective, it confirms that the
same drug is okay for subsequent simulations. Otherwise, it identifies and
recommends the required safer drug based on clinical cardiology principles.
"""
from typing import Dict, List, Any, Optional
import numpy as np

from ..physics.drugs import DRUGS, effects_series
from ..physics.windkessel import calibrate, simulate_beat
from ..seeding.demographics import seed_priors


def evaluate_drug_safety(
    patient_input: Any,
    horizon_h: float = 24.0,
    current_regimen: Optional[List[Any]] = None,
    current_rows: Optional[List[Dict[str, Any]]] = None,
    current_risk: str = "low",
    current_flags: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Simulate each library drug at default dose for the patient and rank safety.
    
    Also evaluates the currently simulated regimen to determine if the same drug
    is safe to continue for the next simulation, or if a switch to a safer
    alternative drug is required.
    """
    p = patient_input
    sv0 = p.ef * p.edv_ml
    times = np.linspace(0, horizon_h, 30)

    # Calibrate baseline physics model
    if p.sbp is not None and p.dbp is not None:
        R0, C = calibrate(p.sbp, p.dbp, p.hr, sv0)
    else:
        R0, C = seed_priors(p.age, p.sex, p.south_asian_seeding)

    base = simulate_beat(R0, C, p.hr, sv0)
    base_sbp = round(base.sbp, 1)
    base_dbp = round(base.dbp, 1)
    base_map = round(base.map, 1)
    base_hr = round(float(p.hr), 1)

    evaluations = []

    # Evaluate each drug in library
    for drug_key, drug_meta in DRUGS.items():
        dose = drug_meta["default_dose"]
        interval = drug_meta["interval"]
        n_doses = max(1, min(4, int(horizon_h // interval) + 1))

        sim_regimen = [dict(drug=drug_key, dose_mg=dose, interval_h=interval, n_doses=n_doses)]
        r_f, hr_f, ef_add, _ = effects_series(sim_regimen, times)

        sim_points = []
        for i, t in enumerate(times):
            sim_hr = p.hr * hr_f[i]
            sim_ef = float(np.clip(p.ef + ef_add[i] * p.ef, 0.10, 0.80))
            b = simulate_beat(R0 * r_f[i], C, sim_hr, sim_ef * p.edv_ml)
            sim_points.append(dict(
                sbp=b.sbp, dbp=b.dbp, map=b.map, hr=sim_hr, ef=sim_ef * 100
            ))

        min_map = min(pt["map"] for pt in sim_points)
        min_sbp = min(pt["sbp"] for pt in sim_points)
        max_sbp = max(pt["sbp"] for pt in sim_points)
        min_hr = min(pt["hr"] for pt in sim_points)
        max_hr = max(pt["hr"] for pt in sim_points)
        final_sbp = sim_points[-1]["sbp"]
        final_dbp = sim_points[-1]["dbp"]
        final_map = sim_points[-1]["map"]
        final_hr = sim_points[-1]["hr"]
        final_ef = sim_points[-1]["ef"]

        # Calculate safety and efficacy score (0 - 100)
        score = 80.0
        reasons = []
        contraindicated = False
        warning = False

        # Clinical Condition 1: Hypotension / Shock
        if base_map < 65 or base_sbp < 90:
            if drug_key in ("phenylephrine", "norepinephrine"):
                score += 25.0 if drug_key == "phenylephrine" else 24.0
                reasons.append("Indicated vasopressor therapy: Restores vital organ perfusion (target MAP >= 65 mmHg).")
            else:
                score -= 60.0
                contraindicated = True
                reasons.append("CONTRAINDICATED: Vasodilator/antihypertensive drops arterial pressure in pre-existing hypotension.")

        # Clinical Condition 2: Hypertension (SBP >= 140 or DBP >= 90)
        elif base_sbp >= 140 or base_dbp >= 90:
            if drug_key in ("phenylephrine", "norepinephrine"):
                score -= 70.0
                contraindicated = True
                reasons.append("CONTRAINDICATED: Vasopressor agonist further elevates systemic afterload and hypertensive risk.")
            else:
                # Patient has resting tachycardia (HR >= 82)
                if base_hr >= 82:
                    if drug_key == "metoprolol":
                        score += 20.0
                        reasons.append("Highly recommended: Beta-blocker simultaneously addresses elevated heart rate and hypertension.")
                    elif drug_key == "carvedilol":
                        score += 19.0
                        reasons.append("Highly recommended: Combined alpha/beta blocker reduces heart rate and arteriolar afterload.")
                    elif drug_key == "diltiazem":
                        score += 18.0
                        reasons.append("Effective rate-control: Non-dihydropyridine CCB lowers nodal conduction and blood pressure.")
                    elif drug_key == "amlodipine":
                        score += 10.0
                        reasons.append("Effective BP reduction, but does not address elevated resting heart rate.")
                    elif drug_key in ("enalapril", "lisinopril"):
                        score += 10.0
                        reasons.append("Effective afterload reduction; renoprotective, neutral chronotropic effect.")
                    elif drug_key == "losartan":
                        score += 9.5
                        reasons.append("Angiotensin receptor blocker reduces peripheral resistance without reflex tachycardia.")
                    elif drug_key == "hydrochlorothiazide":
                        score += 8.0
                        reasons.append("Thiazide diuretic reduces volume and vascular stiffness.")
                # Patient has bradycardia or borderline low HR (HR <= 65)
                elif base_hr <= 65:
                    if drug_key == "metoprolol":
                        score -= 35.0
                        warning = True
                        reasons.append("CAUTION/UNSAFE: Risk of precipitating severe bradycardia (<50 bpm) with resting HR <= 65 bpm.")
                    elif drug_key == "diltiazem":
                        score -= 30.0
                        warning = True
                        reasons.append("CAUTION/UNSAFE: Non-DHP calcium channel blocker suppresses SA/AV node conduction in bradycardia.")
                    elif drug_key == "carvedilol":
                        score -= 25.0
                        warning = True
                        reasons.append("Caution: Beta-blocking component may depress borderline resting heart rate.")
                    elif drug_key == "amlodipine":
                        score += 18.0
                        reasons.append("Preferred agent: Lowers peripheral resistance without chronotropic suppression.")
                    elif drug_key == "losartan":
                        score += 17.0
                        reasons.append("Preferred ARB: Selective AT1 antagonism with zero chronotropic suppression.")
                    elif drug_key == "lisinopril":
                        score += 16.5
                        reasons.append("Safe long-acting ACE inhibitor: Well-tolerated arterial dilation without bradycardic liability.")
                    elif drug_key == "enalapril":
                        score += 16.0
                        reasons.append("Safe choice: Well-tolerated arterial dilation with zero bradycardic liability.")
                    elif drug_key == "hydrochlorothiazide":
                        score += 14.0
                        reasons.append("Safe diuretic: Modulates blood pressure with neutral chronotropic effect.")
                else:
                    # Balanced adult hypertension (HR between 65 and 82)
                    if p.ef < 0.50:
                        # Reduced ejection fraction
                        if drug_key == "enalapril":
                            score += 19.0
                            reasons.append("First-line ACE inhibitor: Renoprotective afterload reduction promotes reverse remodeling in reduced EF.")
                        elif drug_key == "lisinopril":
                            score += 18.5
                            reasons.append("First-line long-acting ACE inhibitor: Strong afterload reduction for heart failure remodeling.")
                        elif drug_key == "losartan":
                            score += 18.0
                            reasons.append("First-line ARB: Proven neurohormonal blockade for heart failure with reduced EF.")
                        elif drug_key == "carvedilol":
                            score += 17.0
                            reasons.append("Guideline-directed medical therapy: Proven mortality benefit and reverse remodeling in HFrEF.")
                        elif drug_key == "amlodipine":
                            score += 15.0
                            reasons.append("Safe alternative: Peripheral dilation without direct negative inotropy.")
                        elif drug_key == "hydrochlorothiazide":
                            score += 14.0
                            reasons.append("Adjunctive diuretic: Relieves circulatory congestion and reduces preload.")
                        elif drug_key == "metoprolol":
                            score += 5.0
                            reasons.append("Secondary agent: Rate control benefit, but monitor negative inotropic effect.")
                        elif drug_key == "diltiazem":
                            score -= 20.0
                            warning = True
                            reasons.append("AVOID in reduced EF: Non-DHP calcium channel blockers exhibit negative inotropy.")
                    else:
                        if drug_key == "amlodipine":
                            score += 18.0
                            reasons.append("First-line dihydropyridine CCB provides steady, predictable 24h pressure control.")
                        elif drug_key == "losartan":
                            score += 17.0
                            reasons.append("First-line ARB: Highly tolerated vascular resistance reduction without cough risk.")
                        elif drug_key == "lisinopril":
                            score += 16.5
                            reasons.append("First-line ACE inhibitor: Renoprotective 24-hour afterload reduction.")
                        elif drug_key == "enalapril":
                            score += 16.0
                            reasons.append("First-line ACE inhibitor reduces vascular resistance and cardiac afterload.")
                        elif drug_key == "hydrochlorothiazide":
                            score += 14.0
                            reasons.append("First-line thiazide: Effective volume and vascular stiffness reduction.")
                        elif drug_key == "carvedilol":
                            score += 10.0
                            reasons.append("Dual alpha/beta blockade lowers rate-pressure product and systemic resistance.")
                        elif drug_key in ("metoprolol", "diltiazem"):
                            score += 8.0
                            reasons.append("Secondary agent: Effectively lowers rate-pressure product.")

        # Clinical Condition 3: Normotensive (SBP 90-139, DBP 60-89, HR 60-80)
        else:
            if drug_key in ("phenylephrine", "norepinephrine"):
                score -= 50.0
                contraindicated = True
                reasons.append("Not indicated: Vasopressor unneeded in normotensive baseline.")
            elif drug_key in ("amlodipine", "enalapril", "lisinopril", "losartan", "hydrochlorothiazide"):
                if min_map < 65 or min_sbp < 90:
                    score -= 30.0
                    warning = True
                    reasons.append("Caution: Vasodilation may induce borderline low pressure in normotensive patient.")
                else:
                    score += 5.0
                    reasons.append("Well-tolerated if mild titration is desired; monitor for hypotension.")
            elif drug_key in ("metoprolol", "carvedilol", "diltiazem"):
                if min_hr < 52:
                    score -= 25.0
                    warning = True
                    reasons.append("Caution: Negative chronotrope may push resting heart rate near bradycardic floor.")
                else:
                    reasons.append("Acceptable chronotropic response if rate control is indicated.")

        # Penalties for simulated threshold breaches under default dose
        if min_map < 65:
            score -= 30.0
            contraindicated = True
            reasons.append(f"Safety breach: Predicted MAP dropped to {round(min_map, 1)} mmHg (<65 floor).")
        if min_sbp < 90:
            score -= 25.0
            warning = True
            reasons.append(f"Safety breach: Predicted SBP dropped to {round(min_sbp, 1)} mmHg (<90 floor).")
        if min_hr < 50:
            score -= 30.0
            contraindicated = True
            reasons.append(f"Safety breach: Predicted HR dropped to {round(min_hr, 1)} bpm (<50 floor).")
        if max_sbp >= 180:
            score -= 30.0
            contraindicated = True
            reasons.append(f"Hypertensive crisis: Predicted peak SBP reached {round(max_sbp, 1)} mmHg.")

        score = float(np.clip(score, 5.0, 99.0))

        if contraindicated or score < 40:
            status = "contraindicated"
            status_label = "Contraindicated / Unsafe"
        elif warning or score < 70:
            status = "caution"
            status_label = "Use With Caution"
        elif score >= 88:
            status = "safest"
            status_label = "Safest & Most Indicated"
        else:
            status = "safe"
            status_label = "Safe Alternative"

        evaluations.append({
            "drug": drug_key,
            "label": drug_meta["label"],
            "drug_class": drug_meta["drug_class"],
            "route": drug_meta["route"],
            "default_dose": dose,
            "interval_h": interval,
            "score": round(score, 1),
            "status": status,
            "status_label": status_label,
            "contraindicated": contraindicated,
            "predicted": {
                "sbp": round(final_sbp, 1),
                "dbp": round(final_dbp, 1),
                "map": round(final_map, 1),
                "hr": round(final_hr, 1),
                "ef": round(final_ef, 1),
                "delta_sbp": round(final_sbp - base_sbp, 1),
                "delta_hr": round(final_hr - base_hr, 1),
            },
            "rationale": " ".join(reasons) if reasons else "Hemodynamically stable under modeled PK/PD simulation.",
        })

    # Sort evaluations: highest score first
    evaluations.sort(key=lambda x: x["score"], reverse=True)
    top_choice = evaluations[0]
    if top_choice["status"] in ("safe", "caution"):
        top_choice["status"] = "safest"
        top_choice["status_label"] = "Safest Available Option"

    # =========================================================================
    # DYNAMIC EVALUATION OF CURRENT SIMULATION & CURRENT DRUG
    # =========================================================================
    tested_drugs = []
    if current_regimen:
        for r in current_regimen:
            d = r.get("drug") if isinstance(r, dict) else getattr(r, "drug", None)
            if d and d in DRUGS and d not in tested_drugs:
                tested_drugs.append(d)

    # Mark is_current in candidate evaluations
    for ev in evaluations:
        ev["is_current"] = ev["drug"] in tested_drugs

    # Extract simulation statistics if rows are provided
    has_rows = current_rows is not None and len(current_rows) > 0
    if has_rows:
        sim_min_map = min(r["map"] for r in current_rows)
        sim_min_sbp = min(r["sbp"] for r in current_rows)
        sim_max_sbp = max(r["sbp"] for r in current_rows)
        sim_max_dbp = max(r["dbp"] for r in current_rows)
        sim_min_hr = min(r["hr"] for r in current_rows)
        sim_max_hr = max(r["hr"] for r in current_rows)
        sim_final_sbp = current_rows[-1]["sbp"]
        sim_final_dbp = current_rows[-1]["dbp"]
        sim_final_map = current_rows[-1]["map"]
        sim_final_hr = current_rows[-1]["hr"]
        sim_delta_sbp = round(sim_final_sbp - base_sbp, 1)
    else:
        sim_min_map = base_map
        sim_min_sbp = base_sbp
        sim_max_sbp = base_sbp
        sim_max_dbp = base_dbp
        sim_min_hr = base_hr
        sim_max_hr = base_hr
        sim_final_sbp = base_sbp
        sim_final_dbp = base_dbp
        sim_final_map = base_map
        sim_final_hr = base_hr
        sim_delta_sbp = 0.0

    # Determine whether the current drug/regimen is OK
    is_current_safe = True
    contraindicated_flag = False
    reasons_unsafe = []

    if len(tested_drugs) > 0:
        # Check 1: Vital threshold breaches in the actual simulation
        if sim_min_map < 65:
            is_current_safe = False
            reasons_unsafe.append(f"Organ hypoperfusion breach: Minimum MAP dropped to {round(sim_min_map, 1)} mmHg (<65 mmHg safety floor).")
        if sim_min_sbp < 90:
            is_current_safe = False
            reasons_unsafe.append(f"Hypotensive breach: SBP dropped to {round(sim_min_sbp, 1)} mmHg (<90 mmHg floor).")
        if sim_min_hr < 50:
            is_current_safe = False
            reasons_unsafe.append(f"Bradycardia breach: Heart rate dipped to {round(sim_min_hr, 1)} bpm (<50 bpm safety floor).")
        if sim_max_sbp >= 180 or sim_max_dbp >= 120:
            is_current_safe = False
            reasons_unsafe.append(f"Severe hypertensive peak: BP reached {round(sim_max_sbp, 1)}/{round(sim_max_dbp, 1)} mmHg.")

        # Check 2: Specific drug contraindications for current patient condition
        if (base_sbp >= 140 or base_dbp >= 90) and "phenylephrine" in tested_drugs:
            is_current_safe = False
            contraindicated_flag = True
            reasons_unsafe.append("CONTRAINDICATED: Phenylephrine is an alpha-1 vasopressor that increases afterload in pre-existing hypertension.")

        if (base_map < 65 or base_sbp < 90) and any(d in tested_drugs for d in ("amlodipine", "enalapril", "metoprolol")):
            is_current_safe = False
            contraindicated_flag = True
            reasons_unsafe.append("CONTRAINDICATED: Antihypertensive vasodilators/beta-blockers precipitate circulatory collapse in pre-existing hypotension.")

        if base_hr <= 62 and "metoprolol" in tested_drugs:
            is_current_safe = False
            reasons_unsafe.append(f"UNSAFE: Metoprolol suppresses cardiac conduction in a patient with low baseline heart rate ({base_hr} bpm <= 62 bpm).")

        # Check 3: Check for high-level risk flags from rule-based assessment
        if current_flags and any(f.get("level") == "high" for f in current_flags):
            if is_current_safe:
                is_current_safe = False
                reasons_unsafe.append("High-priority clinical safety alert triggered in current simulation.")

        # Check 4: Ineffective pressure control in severe hypertension
        if (base_sbp >= 140 or base_dbp >= 90) and is_current_safe:
            if sim_final_sbp >= 145 and sim_delta_sbp > -5.0:
                is_current_safe = False
                reasons_unsafe.append(f"Suboptimal efficacy: Blood pressure remains elevated at {round(sim_final_sbp, 1)} mmHg (target <140 mmHg) without therapeutic reduction.")

        primary_drug_key = tested_drugs[0]
        primary_drug_meta = DRUGS[primary_drug_key]
        reg_item = current_regimen[0] if current_regimen else {}
        dose_val = reg_item.get("dose_mg", primary_drug_meta["default_dose"]) if isinstance(reg_item, dict) else getattr(reg_item, "dose_mg", primary_drug_meta["default_dose"])
        interval_val = reg_item.get("interval_h", primary_drug_meta["interval"]) if isinstance(reg_item, dict) else getattr(reg_item, "interval_h", primary_drug_meta["interval"])

        if is_current_safe:
            same_drug_is_okay = True
            suggested_action = "maintain"
            safest_drug_key = primary_drug_key
            safest_label = primary_drug_meta["label"]
            safest_dose = dose_val
            safest_interval = interval_val
            safest_score = next((e["score"] for e in evaluations if e["drug"] == primary_drug_key), 95.0)
            safest_rationale = (
                f"Current regimen ({primary_drug_meta['label']}, {dose_val} mg) is hemodynamically stable "
                f"and therapeutically indicated. Blood pressure ({round(sim_final_sbp, 1)}/{round(sim_final_dbp, 1)} mmHg) "
                f"and heart rate ({round(sim_final_hr, 1)} bpm) are well-managed. Continue current medication."
            )
            status_headline = f"Current Medication ({primary_drug_meta['label'].split('(')[0].strip()}) is Safe & Indicated"
            status_message = (
                f"Current medication ({primary_drug_meta['label'].split('(')[0].strip()}) is verified SAFE and therapeutic for this patient. "
                f"Simulated hemodynamics reached target BP {round(sim_final_sbp, 1)}/{round(sim_final_dbp, 1)} mmHg "
                f"(MAP {round(sim_final_map, 1)} mmHg, HR {round(sim_final_hr, 1)} bpm) with zero safety threshold breaches. "
                f"The same drug is verified safe for next simulation — maintain current medication."
            )
            switch_regimen = [dict(drug=safest_drug_key, dose_mg=safest_dose, interval_h=safest_interval, n_doses=1)]
        else:
            same_drug_is_okay = False
            suggested_action = "switch"
            # Choose best candidate drug that is NOT one of the unsafe tested drugs and not contraindicated
            safer_candidates = [e for e in evaluations if e["drug"] not in tested_drugs and not e.get("contraindicated", False)]
            if not safer_candidates:
                safer_candidates = [e for e in evaluations if e["drug"] not in tested_drugs]
            best_safer = safer_candidates[0] if safer_candidates else top_choice

            safest_drug_key = best_safer["drug"]
            safest_label = best_safer["label"]
            safest_dose = best_safer["default_dose"]
            safest_interval = best_safer["interval_h"]
            safest_score = best_safer["score"]
            safest_rationale = best_safer["rationale"]

            status_headline = f"Current Drug ({primary_drug_meta['label'].split('(')[0].strip()}) Unsafe / Contraindicated"
            status_message = (
                f"Current medication ({primary_drug_meta['label'].split('(')[0].strip()}) failed safety evaluation: "
                f"{' '.join(reasons_unsafe)} "
                f"Required safer drug for this patient: {safest_label} ({safest_dose} mg every {safest_interval}h)."
            )
            switch_regimen = [dict(drug=safest_drug_key, dose_mg=safest_dose, interval_h=safest_interval, n_doses=1)]

        current_drug_info = {
            "has_drug": True,
            "drug": primary_drug_key,
            "label": primary_drug_meta["label"],
            "dose_mg": dose_val,
            "interval_h": interval_val,
            "is_safe": same_drug_is_okay,
            "status": "safe_and_optimal" if same_drug_is_okay else ("contraindicated" if contraindicated_flag else "unsafe"),
            "status_label": "Safe & Indicated" if same_drug_is_okay else ("Contraindicated" if contraindicated_flag else "Unsafe / Ineffective"),
            "reasons": reasons_unsafe if not same_drug_is_okay else ["Hemodynamically stable and therapeutically effective."],
        }
    else:
        # No drugs tested in current simulation
        if base_sbp >= 140 or base_dbp >= 90:
            same_drug_is_okay = False
            suggested_action = "initiate"
            safest_drug_key = top_choice["drug"]
            safest_label = top_choice["label"]
            safest_dose = top_choice["default_dose"]
            safest_interval = top_choice["interval_h"]
            safest_score = top_choice["score"]
            safest_rationale = top_choice["rationale"]
            status_headline = "Hypertension Untreated — Antihypertensive Therapy Required"
            status_message = f"Patient has baseline hypertension ({base_sbp}/{base_dbp} mmHg) with no active medication. Initiation of safer drug ({safest_label}) is required."
            switch_regimen = [dict(drug=safest_drug_key, dose_mg=safest_dose, interval_h=safest_interval, n_doses=1)]
        elif base_map < 65 or base_sbp < 90:
            same_drug_is_okay = False
            suggested_action = "initiate"
            safest_drug_key = top_choice["drug"]
            safest_label = top_choice["label"]
            safest_dose = top_choice["default_dose"]
            safest_interval = top_choice["interval_h"]
            safest_score = top_choice["score"]
            safest_rationale = top_choice["rationale"]
            status_headline = "Hypotension / Perfusion Compromise — Vasopressor Required"
            status_message = f"Patient has baseline hypotension (MAP {base_map} mmHg < 65 mmHg floor). Initiation of vasopressor ({safest_label}) is required."
            switch_regimen = [dict(drug=safest_drug_key, dose_mg=safest_dose, interval_h=safest_interval, n_doses=1)]
        else:
            same_drug_is_okay = True
            suggested_action = "maintain"
            safest_drug_key = top_choice["drug"]
            safest_label = top_choice["label"]
            safest_dose = top_choice["default_dose"]
            safest_interval = top_choice["interval_h"]
            safest_score = top_choice["score"]
            safest_rationale = top_choice["rationale"]
            status_headline = "Hemodynamically Stable — No Medication Needed"
            status_message = "Patient is normotensive with stable hemodynamics. Safe to continue without medication for next simulation."
            switch_regimen = []

        current_drug_info = {
            "has_drug": False,
            "drug": None,
            "label": "None (No Medication)",
            "dose_mg": 0.0,
            "interval_h": 0.0,
            "is_safe": same_drug_is_okay,
            "status": "none",
            "status_label": "No Medication",
            "reasons": [] if same_drug_is_okay else [status_message],
        }

    return {
        "current_drug": current_drug_info,
        "same_drug_is_okay": same_drug_is_okay,
        "suggested_action": suggested_action,
        "status_headline": status_headline,
        "status_message": status_message,
        "safest_drug": safest_drug_key,
        "safest_label": safest_label,
        "safest_score": safest_score,
        "safest_dose": safest_dose,
        "safest_interval": safest_interval,
        "safest_rationale": safest_rationale,
        "switch_regimen": switch_regimen,
        "recommendations": evaluations,
    }
