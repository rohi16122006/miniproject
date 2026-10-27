"""Train XGBoost forecasters and compare with a last-value (persistence) baseline.

    python -m app.ml.train --processed ../data/processed --out app/ml/artifacts
"""
import argparse
import json
from pathlib import Path

import numpy as np

from . import features as F
from . import xgb_model


def metrics(y, p):
    err = p - y
    return {t: {"mae": float(np.abs(err[:, i]).mean()), "rmse": float(np.sqrt((err[:, i] ** 2).mean()))}
            for i, t in enumerate(xgb_model.TARGETS)}


def run(processed: Path, out: Path):
    d = {s: np.load(processed / f"{s}.npz") for s in ("train", "val", "test")}
    models = xgb_model.fit(d["train"]["X"], d["train"]["y"], d["val"]["X"], d["val"]["y"])
    te = d["test"]
    result = {
        "task": f"forecast SBP/DBP/HR {F.H * F.STEP_S} s ahead from the previous {F.L * F.STEP_S} s",
        "n_windows": {s: int(len(d[s]["y"])) for s in d},
        "n_cases": {s: int(len(np.unique(d[s]["case_ids"]))) for s in d},
        "test_persistence": metrics(te["y"], te["last"]),
        "test_xgboost": metrics(te["y"], xgb_model.predict(models, te["X"])),
    }
    meta = dict(version="xgb-0.1", feature_names=F.FEATURE_NAMES, L=F.L, H=F.H, step_s=F.STEP_S,
                data_source=str((processed / "SOURCE.txt").read_text()).strip() if (processed / "SOURCE.txt").exists() else "unknown",
                results=result)
    xgb_model.save(models, out, meta)
    (out / "metrics.json").write_text(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--processed", default="../data/processed")
    ap.add_argument("--out", default="app/ml/artifacts")
    a = ap.parse_args()
    print(json.dumps(run(Path(a.processed), Path(a.out)), indent=2))
