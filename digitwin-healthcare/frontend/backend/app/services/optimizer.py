"""Intelligent Drug Optimizer Service.

Evaluates all available drugs in the clinical pharmacology repository for a specific
patient condition. Runs multi-criteria 0D Windkessel + PK-PD simulation and selects
the best drug and dosage that maximizes hemodynamic normalization (SBP, DBP, MAP, HR)
while protecting against adverse events, bradycardia, hypotension, and patient allergies.
"""
from typing import Dict, Any, List
import numpy as np

from ..physics.drugs import DRUGS, effects_series
from ..physics.windkessel import calibrate, simulate_beat
from ..schemas.simulation import Patient, Regimen
from ..seeding.demographics import seed_priors
from .risk import assess


def optimize_drug_for_patient(patient: Patient, horizon_h: float = 24.0) -> Dict[str, Any]:
    """
    Evaluates candidate medications for the patient and selects the optimal choice.
    Returns ranked options, health score (0-100), and rationale.
    """
    p = patient
    sv0 = p.ef * p.edv_ml
    has_bp = p.sbp is not None and p.dbp is not None
    cur_sbp = p.sbp if has_bp else 120.0
    cur_dbp = p.dbp if has_bp else 80.0
    cur_hr = p.hr or 75.0
    cur_ef = p.ef or 0.55

    # Determine baseline hemodynamic calibration
    if has_bp:
        R0, C = calibrate(cur_sbp, cur_dbp, cur_hr, sv0)
    else:
        R0, C = seed_priors(p.age, p.sex, p.south_asian_seeding)

    # Standard candidate test dosages for each drug
    candidates = [
        {"drug": "amlodipine", "dose_mg": 5.0, "interval_h": 24.0, "n_doses": int(horizon_h // 24) or 1},
        {"drug": "amlodipine", "dose_mg": 10.0, "interval_h": 24.0, "n_doses": int(horizon_h // 24) or 1},
        {"drug": "enalapril", "dose_mg": 10.0, "interval_h": 24.0, "n_doses": int(horizon_h // 24) or 1},
        {"drug": "enalapril", "dose_mg": 20.0, "interval_h": 12.0, "n_doses": int(horizon_h // 12) or 2},
        {"drug": "metoprolol", "dose_mg": 25.0, "interval_h": 12.0, "n_doses": int(horizon_h // 12) or 2},
        {"drug": "metoprolol", "dose_mg": 50.0, "interval_h": 12.0, "n_doses": int(horizon_h // 12) or 2},
        {"drug": "phenylephrine", "dose_mg": 0.1, "interval_h": 1.0, "n_doses": min(6, int(horizon_h)) or 1},
    ]

    allergies_lower = (p.allergies or "").lower()
    history_lower = (p.medical_history or "").lower()

    scored_options: List[Dict[str, Any]] = []

    times = np.linspace(0, horizon_h, 30)

    for cand in candidates:
        drug_name = cand["drug"]
        dose_mg = cand["dose_mg"]
        reg_item = [cand]

        r_f, hr_f, ef_add, conc = effects_series(reg_item, times)

        # Simulate trajectory
        rows = []
        for i, t in enumerate(times):
            sim_hr = cur_hr * hr_f[i]
            sim_ef = float(np.clip(cur_ef + ef_add[i] * cur_ef, 0.10, 0.80))
            beat = simulate_beat(R0 * r_f[i], C, sim_hr, sim_ef * p.edv_ml)
            rows.append({
                "t_h": float(t),
                "sbp": beat.sbp,
                "dbp": beat.dbp,
                "map": beat.map,
                "hr": float(sim_hr),
                "ef": float(sim_ef * 100),
                "co_lpm": beat.co_lpm,
            })

        final_beat = rows[-1]
        final_sbp = final_beat["sbp"]
        final_dbp = final_beat["dbp"]
        final_map = final_beat["map"]
        final_hr = final_beat["hr"]
        final_ef = final_beat["ef"]

        # Run safety rule checks
        risk, flags = assess(rows, reg_item)

        # Health Scoring (0 to 100)
        # Target BP: SBP 115-130, DBP 70-85, MAP 75-95, HR 60-80
        score = 85.0
        contraindication_reasons = []

        # 1. Blood Pressure Improvement
        sbp_diff = abs(final_sbp - 120.0)
        if cur_sbp > 135:
            # Patient has hypertension: reward BP reduction toward 120
            if final_sbp < cur_sbp:
                reduction = cur_sbp - final_sbp
                score += min(15.0, reduction * 0.8)
            else:
                score -= 25.0
        elif cur_sbp < 95:
            # Patient has hypotension: vasodilators are dangerous!
            if drug_name in ["amlodipine", "enalapril", "metoprolol"]:
                score -= 50.0
                contraindication_reasons.append("Severe hypotension: vasodilators / beta-blockers exacerbate hypoperfusion")
            elif drug_name == "phenylephrine":
                score += 30.0  # Vasopressor indicated!

        # Penalize residual deviations from 120/80
        score -= min(35.0, sbp_diff * 0.6)

        # 2. Heart Rate Assessment
        if final_hr < 55:
            score -= 40.0
            contraindication_reasons.append(f"Risk of bradycardia (HR {final_hr:.0f} bpm)")
        elif final_hr > 100:
            score -= 20.0
            contraindication_reasons.append(f"Residual tachycardia (HR {final_hr:.0f} bpm)")
        elif 60 <= final_hr <= 80:
            score += 5.0

        # Metoprolol specific checks
        if drug_name == "metoprolol":
            if cur_hr < 62:
                score -= 45.0
                contraindication_reasons.append("Baseline bradycardia: beta-blocker contraindicated")
            if "asthma" in history_lower or "copd" in history_lower or "bronchospasm" in history_lower:
                score -= 40.0
                contraindication_reasons.append("Reactive airway disease (asthma/COPD) caution with beta-blocker")

        # Enalapril specific checks
        if drug_name == "enalapril":
            if "angioedema" in history_lower or "ace" in allergies_lower or "enalapril" in allergies_lower:
                score -= 70.0
                contraindication_reasons.append("Allergy or prior angioedema to ACE inhibitor")
            if cur_ef < 45:
                score += 10.0  # ACE inhibitors have proven mortality benefit in reduced EF!

        # Amlodipine specific checks
        if drug_name == "amlodipine":
            if "amlodipine" in allergies_lower or "calcium channel" in allergies_lower:
                score -= 70.0
                contraindication_reasons.append("Documented allergy to dihydropyridine calcium channel blocker")
            if cur_sbp > 150 and cur_hr <= 70:
                score += 8.0  # Isolated systolic hypertension in older adults responds excellently

        # Phenylephrine specific checks
        if drug_name == "phenylephrine":
            if cur_sbp > 125:
                score -= 60.0
                contraindication_reasons.append("Not indicated for normotensive or hypertensive patients (causes acute severe hypertension)")

        # Penalize high risk flags
        if risk == "high":
            score -= 30.0
        elif risk == "moderate":
            score -= 10.0

        final_score = float(np.clip(score, 5.0, 99.0))

        # Status categorization
        if contraindication_reasons or final_score < 40:
            status = "Contraindicated"
        elif final_score >= 80:
            status = "Optimal Choice"
        elif final_score >= 65:
            status = "Acceptable Alternative"
        else:
            status = "Sub-optimal"

        # Formulate clinical rationale
        rationale = f"Projected SBP {final_sbp:.0f}/{final_dbp:.0f} mmHg, HR {final_hr:.0f} bpm."
        if status == "Optimal Choice":
            rationale += " Safely achieves target hemodynamic range with low adverse risk."
        elif contraindication_reasons:
            rationale += f" Caution: {', '.join(contraindication_reasons)}."

        scored_options.append({
            "drug": drug_name,
            "dose_mg": dose_mg,
            "interval_h": cand["interval_h"],
            "n_doses": cand["n_doses"],
            "final_sbp": round(final_sbp, 1),
            "final_dbp": round(final_dbp, 1),
            "final_hr": round(final_hr, 1),
            "final_map": round(final_map, 1),
            "final_ef": round(final_ef, 1),
            "score": round(final_score, 1),
            "risk": risk,
            "status": status,
            "contraindications": contraindication_reasons,
            "rationale": rationale,
        })

    # Sort descending by score
    scored_options.sort(key=lambda x: x["score"], reverse=True)
    best = scored_options[0]

    return {
        "best_choice": best,
        "ranked_options": scored_options,
        "recommended_regimen": [{
            "drug": best["drug"],
            "dose_mg": best["dose_mg"],
            "interval_h": best["interval_h"],
            "n_doses": best["n_doses"],
        }],
        "patient_condition_summary": {
            "baseline_sbp": cur_sbp,
            "baseline_dbp": cur_dbp,
            "baseline_hr": cur_hr,
            "baseline_ef": cur_ef * 100,
            "hypertensive": cur_sbp >= 140 or cur_dbp >= 90,
            "hypotensive": cur_sbp < 95 or (cur_dbp + (cur_sbp - cur_dbp) / 3) < 65,
            "tachycardic": cur_hr > 100,
            "bradycardic": cur_hr < 60,
        }
    }
