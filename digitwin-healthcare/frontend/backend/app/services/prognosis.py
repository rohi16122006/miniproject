"""Future Outcomes and Drug Safety Prognosis Service.

Calculates multi-horizon clinical trajectory (1h, 6h, 24h, 72h, Steady-State),
organ workload (Rate Pressure Product, Cardiac Index, Renal/Cerebral perfusion),
and drug accumulation/clearance safety kinetics.
"""
from typing import Dict, Any, List
import numpy as np

from ..physics.drugs import DRUGS, concentration_series, effects_series
from ..physics.windkessel import calibrate, simulate_beat
from ..schemas.simulation import SimRequest
from ..seeding.demographics import seed_priors
from .risk import assess


def compute_future_prognosis(req: SimRequest) -> Dict[str, Any]:
    p = req.patient
    sv0 = p.ef * p.edv_ml
    has_bp = p.sbp is not None and p.dbp is not None
    cur_sbp = p.sbp if has_bp else 120.0
    cur_dbp = p.dbp if has_bp else 80.0
    cur_hr = p.hr or 75.0
    cur_ef = p.ef or 0.55

    # Mosteller Body Surface Area (BSA in m^2) approx for typical adult (wt=70kg, ht=170cm)
    bsa = 1.82

    if has_bp:
        R0, C = calibrate(cur_sbp, cur_dbp, cur_hr, sv0)
    else:
        R0, C = seed_priors(p.age, p.sex, p.south_asian_seeding)

    regimen = [r.model_dump() for r in req.regimen]

    # Evaluate multiple clinical time horizons
    horizons = [
        {"key": "1h", "label": "1 Hour (Acute Onset)", "hours": 1.0},
        {"key": "6h", "label": "6 Hours (Peak Cmax)", "hours": 6.0},
        {"key": "24h", "label": "24 Hours (Daily Trough)", "hours": 24.0},
        {"key": "72h", "label": "72 Hours (Multi-Dose)", "hours": 72.0},
        {"key": "steady_state", "label": "Steady-State (~5-7 Days)", "hours": 168.0},
    ]

    prognosis_timeline = []

    for h in horizons:
        t_target = h["hours"]
        times = np.linspace(0, t_target, max(15, min(60, int(t_target * 2))))
        r_f, hr_f, ef_add, conc = effects_series(regimen, times)

        # Evaluate at horizon endpoint
        end_idx = -1
        sim_hr = cur_hr * hr_f[end_idx]
        sim_ef = float(np.clip(cur_ef + ef_add[end_idx] * cur_ef, 0.10, 0.80))
        beat = simulate_beat(R0 * r_f[end_idx], C, sim_hr, sim_ef * p.edv_ml)

        # Rate Pressure Product (RPP = SBP * HR)
        rpp = int(beat.sbp * sim_hr)
        rpp_status = "Healthy / Low" if rpp < 10000 else ("Normal" if rpp <= 12000 else "Elevated Myocardial Stress")

        # Cardiac Index (CI = CO / BSA)
        ci = round(beat.co_lpm / bsa, 2)
        ci_status = "Optimal" if 2.5 <= ci <= 4.0 else ("Low Perfusion" if ci < 2.5 else "Hyperdynamic")

        # Mean Perfusion Pressure
        map_val = round(beat.map, 1)
        perfusion_status = "Adequate" if 70 <= map_val <= 100 else ("Hypoperfusion Risk" if map_val < 65 else "Hypertensive Strain")

        prognosis_timeline.append({
            "key": h["key"],
            "label": h["label"],
            "hours": t_target,
            "sbp": round(beat.sbp, 1),
            "dbp": round(beat.dbp, 1),
            "map": map_val,
            "hr": round(float(sim_hr), 1),
            "ef": round(sim_ef * 100, 1),
            "co_lpm": round(beat.co_lpm, 2),
            "ci": ci,
            "ci_status": ci_status,
            "rpp": rpp,
            "rpp_status": rpp_status,
            "perfusion_status": perfusion_status,
        })

    # Drug Clearance & Accumulation Kinetics
    drug_safety_kinetics = []
    for item in regimen:
        d_name = item["drug"]
        meta = DRUGS.get(d_name, {})
        t_half = meta.get("t_half", 24.0)
        washout_h = round(5 * t_half, 1)

        # Primary elimination route
        route = "Hepatic (CYP3A4)" if d_name == "amlodipine" else (
            "Hepatic (CYP2D6)" if d_name == "metoprolol" else (
                "Renal (unchanged enalaprilat)" if d_name == "enalapril" else "Hepatic (MAO/sulfotransferase)"
            )
        )

        drug_safety_kinetics.append({
            "drug": d_name,
            "dose_mg": item["dose_mg"],
            "interval_h": item["interval_h"],
            "half_life_h": t_half,
            "washout_time_h": washout_h,
            "elimination_route": route,
            "accumulation_risk": "High (long t1/2: 40h)" if t_half > 24 else "Low to Moderate",
            "monitoring_advice": (
                "Monitor for peripheral pedal edema and headache." if d_name == "amlodipine" else (
                    "Assess baseline ECG and monitor resting HR for bradycardia." if d_name == "metoprolol" else (
                        "Check serum creatinine and potassium at 1-2 weeks." if d_name == "enalapril" else (
                            "Continuous radial arterial line monitoring required during infusion."
                        )
                    )
                )
            )
        })

    # Overall Safety Verdict
    risk, flags = assess([{"map": pt["map"], "sbp": pt["sbp"], "hr": pt["hr"]} for pt in prognosis_timeline], regimen)

    return {
        "timeline": prognosis_timeline,
        "kinetics": drug_safety_kinetics,
        "overall_risk": risk,
        "safety_flags": flags,
        "baseline_summary": {
            "sbp": cur_sbp,
            "dbp": cur_dbp,
            "hr": cur_hr,
            "ef": cur_ef * 100,
            "initial_rpp": int(cur_sbp * cur_hr),
        }
    }
