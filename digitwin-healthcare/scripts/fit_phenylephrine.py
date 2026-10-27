"""Fit phenylephrine PK-PD parameters to real VitalDB arterial line + infusion data.

Fits effective pharmacodynamic half-life (t_half), maximum vasoconstriction (Emax),
and potency (EC50) to observed continuous arterial line blood pressure during
intraoperative phenylephrine infusion.

Outputs:
- Fitted parameters and error metrics (MAE, RMSE)
- Comparison plot: docs/phenylephrine_fit.png (observed vs simulated SBP, DBP, MAP)
"""
import argparse
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from scipy.optimize import minimize

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.physics.windkessel import calibrate, simulate_beat  # noqa: E402


def fit_case(case_id: int = 61, raw_dir: Path = ROOT / "data" / "raw" / "vitaldb", out_plot: Path = ROOT / "docs" / "phenylephrine_fit.png"):
    file_path = raw_dir / f"case_{case_id:04d}.npz"
    if not file_path.exists():
        sys.exit(f"Case file {file_path} not found. Run download_vitaldb.py first.")

    data = np.load(file_path)
    vals = data["values"]  # columns: sbp, dbp, hr, drug_rate (mL/hr, 100 mcg/mL solution)
    dt_s = 10.0
    dt_h = dt_s / 3600.0

    sbp = vals[:, 0]
    dbp = vals[:, 1]
    hr = vals[:, 2]
    drug_rate = np.nan_to_num(vals[:, 3], nan=0.0)  # mL/hr
    infusion_mg_h = drug_rate * 0.1  # 100 mcg/mL = 0.1 mg/mL -> mg/hr

    obs_map = dbp + (sbp - dbp) / 3.0

    # Locate infusion active window
    active_idx = np.where(drug_rate > 0)[0]
    if len(active_idx) == 0:
        sys.exit(f"Case {case_id} has no active phenylephrine infusion recorded.")

    start_idx = max(0, active_idx[0] - 60)  # include 10 min pre-infusion baseline
    end_idx = min(len(vals), active_idx[-1] + 60)  # include post-infusion washout

    idx = np.arange(start_idx, end_idx)
    sub_sbp = sbp[idx]
    sub_dbp = dbp[idx]
    sub_hr = hr[idx]
    sub_map = obs_map[idx]
    sub_drug = infusion_mg_h[idx]

    # Pre-infusion baseline (10 mins before infusion starts)
    base_slice = np.arange(start_idx, active_idx[0])
    base_sbp = float(np.nanmedian(sbp[base_slice]))
    base_dbp = float(np.nanmedian(dbp[base_slice]))
    base_hr = float(np.nanmedian(hr[base_slice]))
    base_map = float(np.nanmedian(obs_map[base_slice]))

    # Literature standard adult Vd for phenylephrine: ~0.6 L/kg -> 34.4 L for 57.3kg
    vd_l = 34.4

    valid_mask = ~np.isnan(sub_map)

    def simulate_pk_pd(t_half_h, emax, ec50_mg_l):
        ke = np.log(2.0) / t_half_h
        cp = np.zeros(len(idx))
        c = 0.0
        for i in range(len(idx)):
            rin = sub_drug[i]
            c = c * np.exp(-ke * dt_h) + (rin / (ke * vd_l)) * (1.0 - np.exp(-ke * dt_h))
            cp[i] = c
        # Emax model: fractional resistance increase
        rf = 1.0 + (emax * cp) / (ec50_mg_l + cp)
        sim_map = base_map * rf
        return sim_map, cp, rf

    def loss(params):
        t_half_h, emax, ec50 = params
        sim_map, _, _ = simulate_pk_pd(t_half_h, emax, ec50)
        diff = sim_map[valid_mask] - sub_map[valid_mask]
        return np.mean(diff ** 2)

    # Initial guess & bounds: t_half (0.05 to 1.0 h), Emax (0.1 to 0.8), EC50 (0.001 to 0.05 mg/L)
    res = minimize(loss, [0.25, 0.40, 0.01], bounds=[(0.05, 1.0), (0.10, 0.80), (0.001, 0.05)], method="L-BFGS-B")
    t_half_fit, emax_fit, ec50_fit = res.x

    sim_map_fit, cp_fit, rf_fit = simulate_pk_pd(t_half_fit, emax_fit, ec50_fit)
    map_mae = float(np.mean(np.abs(sim_map_fit[valid_mask] - sub_map[valid_mask])))
    map_rmse = float(np.sqrt(np.mean((sim_map_fit[valid_mask] - sub_map[valid_mask]) ** 2)))

    # Windkessel beat simulation for SBP and DBP
    sv0 = 0.55 * 120.0  # 66 mL default stroke volume
    R0, C = calibrate(base_sbp, base_dbp, base_hr, sv0)

    sim_sbp = []
    sim_dbp = []
    for i in range(len(idx)):
        cur_hr = sub_hr[i] if not np.isnan(sub_hr[i]) else base_hr
        b = simulate_beat(R0 * rf_fit[i], C, cur_hr, sv0)
        sim_sbp.append(b.sbp)
        sim_dbp.append(b.dbp)

    sim_sbp = np.array(sim_sbp)
    sim_dbp = np.array(sim_dbp)

    val_sbp = ~np.isnan(sub_sbp)
    val_dbp = ~np.isnan(sub_dbp)
    sbp_mae = float(np.mean(np.abs(sim_sbp[val_sbp] - sub_sbp[val_sbp])))
    dbp_mae = float(np.mean(np.abs(sim_dbp[val_dbp] - sub_dbp[val_dbp])))

    # Generate comparison figure
    time_min = (idx - idx[0]) * dt_s / 60.0
    fig, axes = plt.subplots(3, 1, figsize=(11, 8), sharex=True)

    # Subplot 1: Blood Pressure (Observed vs Simulated)
    ax1 = axes[0]
    ax1.plot(time_min, sub_sbp, color="#f87171", alpha=0.45, label="Observed SBP (Radial Art)")
    ax1.plot(time_min, sim_sbp, color="#b91c1c", lw=2, label="Simulated 0D SBP")
    ax1.plot(time_min, sub_dbp, color="#60a5fa", alpha=0.45, label="Observed DBP")
    ax1.plot(time_min, sim_dbp, color="#1d4ed8", lw=2, label="Simulated 0D DBP")
    ax1.plot(time_min, sim_map_fit, color="#047857", lw=2.5, ls="--", label="Simulated MAP")
    ax1.plot(time_min, sub_map, color="#10b981", alpha=0.4, label="Observed MAP")
    ax1.set_ylabel("Pressure (mmHg)")
    ax1.set_title(f"VitalDB Case {case_id}: Phenylephrine PK-PD Fit (MAP MAE: {map_mae:.2f} mmHg, DBP MAE: {dbp_mae:.2f} mmHg)")
    ax1.legend(loc="upper right", ncol=3, fontsize=8)
    ax1.grid(True, alpha=0.3)

    # Subplot 2: PK Concentration & PD Resistance Factor
    ax2 = axes[1]
    color_cp = "#8b5cf6"
    ax2.plot(time_min, cp_fit * 1000.0, color=color_cp, lw=2, label="Plasma Conc Cp (ug/L)")
    ax2.set_ylabel("Cp (ug/L)", color=color_cp)
    ax2.tick_params(axis="y", labelcolor=color_cp)
    ax2.grid(True, alpha=0.3)

    ax2_r = ax2.twinx()
    color_rf = "#d97706"
    ax2_r.plot(time_min, rf_fit, color=color_rf, lw=2, ls=":", label="Resistance Factor R(t)/R0")
    ax2_r.set_ylabel("R multiplier (r_f)", color=color_rf)
    ax2_r.tick_params(axis="y", labelcolor=color_rf)

    # Subplot 3: Infusion rate
    ax3 = axes[2]
    ax3.fill_between(time_min, sub_drug * 10.0, color="#6366f1", alpha=0.4, step="post", label="Infusion Rate (mL/hr)")
    ax3.plot(time_min, sub_drug * 10.0, color="#4338ca", lw=1.5, drawstyle="steps-post")
    ax3.set_xlabel("Time from analysis start (minutes)")
    ax3.set_ylabel("Infusion (mL/hr)")
    ax3.legend(loc="upper right", fontsize=8)
    ax3.grid(True, alpha=0.3)

    plt.tight_layout()
    out_plot.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_plot, dpi=160)
    plt.close()
    print(f"Saved fit plot to {out_plot}")

    results = {
        "case_id": case_id,
        "fitted_params": {
            "t_half_h": round(float(t_half_fit), 4),
            "t_half_min": round(float(t_half_fit * 60.0), 2),
            "emax": round(float(emax_fit), 4),
            "ec50_mg_l": round(float(ec50_fit), 6),
            "ec50_ug_l": round(float(ec50_fit * 1000.0), 3),
            "vd_l": vd_l,
        },
        "baseline": {
            "sbp": base_sbp,
            "dbp": base_dbp,
            "hr": base_hr,
            "map": base_map,
            "calibrated_R0": round(R0, 4),
            "calibrated_C": round(C, 4),
        },
        "metrics": {
            "map_mae_mmHg": round(map_mae, 2),
            "map_rmse_mmHg": round(map_rmse, 2),
            "sbp_mae_mmHg": round(sbp_mae, 2),
            "dbp_mae_mmHg": round(dbp_mae, 2),
        },
    }
    return results


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", type=int, default=61)
    ap.add_argument("--out", default=str(ROOT / "docs" / "phenylephrine_fit.png"))
    a = ap.parse_args()
    res = fit_case(a.case, out_plot=Path(a.out))
    import json
    print("\n--- Fit Results ---")
    print(json.dumps(res, indent=2))
