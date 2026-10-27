"""Rule-based adverse-reaction flags (simple thresholds, NOT a validated classifier)."""


def assess(rows, regimen, sbp_target=140):
    flags = []
    min_map = min(r["map"] for r in rows)
    min_sbp = min(r["sbp"] for r in rows)
    min_hr = min(r["hr"] for r in rows)
    if min_map < 65 or min_sbp < 90:
        flags.append(dict(level="high", text=f"Hypotension risk: MAP down to {min_map} mmHg, SBP down to {min_sbp} mmHg"))
    if min_hr < 50:
        flags.append(dict(level="high", text=f"Bradycardia risk: HR down to {min_hr} bpm"))
    if regimen and rows[-1]["sbp"] > sbp_target:
        flags.append(dict(level="info", text=f"SBP still {rows[-1]['sbp']} mmHg at end of horizon (target <{sbp_target})"))
    risk = "high" if any(f["level"] == "high" for f in flags) else ("moderate" if flags else "low")
    return risk, flags
