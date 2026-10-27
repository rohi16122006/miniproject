"""Rule-based adverse-reaction and hemodynamic threshold checks."""


def assess(rows, regimen, sbp_target=140):
    flags = []
    if not rows:
        return "low", flags

    min_map = min(r["map"] for r in rows)
    max_map = max(r["map"] for r in rows)
    min_sbp = min(r["sbp"] for r in rows)
    max_sbp = max(r["sbp"] for r in rows)
    min_dbp = min(r["dbp"] for r in rows)
    max_dbp = max(r["dbp"] for r in rows)
    min_hr = min(r["hr"] for r in rows)
    max_hr = max(r["hr"] for r in rows)
    
    start_sbp = rows[0]["sbp"]
    end_sbp = rows[-1]["sbp"]
    end_dbp = rows[-1]["dbp"]
    end_map = rows[-1]["map"]
    end_hr = rows[-1]["hr"]
    delta_sbp = round(end_sbp - start_sbp, 1)
    delta_map = round(end_map - rows[0]["map"], 1)

    # 1. Critical safety threshold checks
    if min_map < 65 or min_sbp < 90:
        flags.append(dict(level="high", category="Hypotension Risk", text=f"Hypotension risk: MAP down to {min_map} mmHg, SBP down to {min_sbp} mmHg (Safety floor: MAP 65 / SBP 90)"))
    if min_hr < 50:
        flags.append(dict(level="high", category="Bradycardia Risk", text=f"Bradycardia risk: HR down to {min_hr} bpm (Safety floor: 50 bpm)"))
    if max_sbp >= 180 or max_dbp >= 120:
        flags.append(dict(level="high", category="Severe Hypertension", text=f"Hypertensive peak: SBP reached {max_sbp} mmHg, DBP {max_dbp} mmHg"))
    elif max_sbp >= 160 or max_dbp >= 100:
        flags.append(dict(level="moderate", category="Stage 2 Hypertension", text=f"Stage 2 hypertension: SBP {max_sbp} mmHg, DBP {max_dbp} mmHg"))

    # 2. Chronotropic safety checks
    if max_hr > 115:
        flags.append(dict(level="moderate", category="Tachycardia Alert", text=f"Tachycardia observed: HR reached {max_hr} bpm (Safety threshold: >100 bpm)"))

    # 3. Regimen & therapeutic response evaluation
    if regimen and end_sbp > sbp_target:
        flags.append(dict(level="info", category="Target SBP", text=f"SBP still {end_sbp} mmHg at end of horizon (target <{sbp_target} mmHg)"))
    elif regimen and delta_sbp <= -8:
        flags.append(dict(level="optimal", category="Therapeutic Response", text=f"Therapeutic blood pressure reduction achieved: ΔSBP {delta_sbp} mmHg (final: {end_sbp}/{end_dbp} mmHg)"))
    elif regimen and delta_map >= 8:
        flags.append(dict(level="optimal", category="Vasopressor Support", text=f"Perfusion support response observed: ΔMAP +{delta_map} mmHg (final MAP: {end_map} mmHg)"))
    elif not any(f["level"] in ("high", "moderate") for f in flags):
        flags.append(dict(level="optimal", category="Hemodynamic Stability", text=f"Normotensive stability maintained throughout simulation: MAP {end_map} mmHg, HR {end_hr} bpm"))

    risk = "high" if any(f["level"] == "high" for f in flags) else ("moderate" if any(f["level"] == "moderate" for f in flags) else "low")
    return risk, flags
