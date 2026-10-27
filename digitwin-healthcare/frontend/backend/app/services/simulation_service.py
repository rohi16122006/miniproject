import time

import numpy as np

from ..physics.drugs import effects_series
from ..physics.windkessel import calibrate, simulate_beat
from ..schemas import SimRequest
from ..seeding.demographics import seed_priors
from .risk import assess
from .drug_safety import evaluate_drug_safety


def run_simulation(req: SimRequest) -> dict:
    t0 = time.perf_counter()
    p = req.patient
    sv0 = p.ef * p.edv_ml

    if p.sbp is not None and p.dbp is not None:
        R0, C = calibrate(p.sbp, p.dbp, p.hr, sv0)
        source = "calibrated to measured BP"
    else:
        R0, C = seed_priors(p.age, p.sex, p.south_asian_seeding)
        source = "demographic seeding prior"

    times = np.linspace(0, req.horizon_h, req.n_points)
    regimen = [r.model_dump() for r in req.regimen]
    r_f, hr_f, ef_add, conc = effects_series(regimen, times)

    rows = []
    for i, t in enumerate(times):
        hr = p.hr * hr_f[i]
        ef = float(np.clip(p.ef + ef_add[i] * p.ef, 0.10, 0.80))
        b = simulate_beat(R0 * r_f[i], C, hr, ef * p.edv_ml)
        rows.append(dict(t_h=round(float(t), 3), sbp=round(b.sbp, 1), dbp=round(b.dbp, 1),
                         map=round(b.map, 1), hr=round(float(hr), 1), ef=round(ef * 100, 1),
                         co_lpm=round(b.co_lpm, 2)))

    base = simulate_beat(R0, C, p.hr, sv0)
    baseline = dict(sbp=round(base.sbp, 1), dbp=round(base.dbp, 1), map=round(base.map, 1),
                    hr=p.hr, ef=round(p.ef * 100, 1), co_lpm=round(base.co_lpm, 2))

    risk, flags = assess(rows, regimen)
    drug_safety = evaluate_drug_safety(
        patient_input=p,
        horizon_h=req.horizon_h,
        current_regimen=regimen,
        current_rows=rows,
        current_risk=risk,
        current_flags=flags,
    )

    patient_name = getattr(p, "name", None) or "Anonymous Patient"
    patient_id = getattr(p, "patient_id", None) or "PT-001"

    return dict(
        patient=dict(name=patient_name, patient_id=patient_id, age=p.age, sex=p.sex),
        baseline=baseline, series=rows, risk=risk, flags=flags,
        drug_safety=drug_safety,
        concentrations={k: [round(float(x) * 1000, 3) for x in v] for k, v in conc.items()},  # ug/L
        model=dict(R=round(R0, 3), C=round(C, 3), source=source),
        latency_ms=round((time.perf_counter() - t0) * 1000, 1),
    )
