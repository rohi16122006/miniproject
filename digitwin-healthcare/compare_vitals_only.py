import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

from app.ml.xgb_model import fit, predict

PROCESSED = ROOT / "data" / "processed"
OUT = ROOT / "docs" / "vitals_only_experiment.json"

def extract_features(windows):
    # windows shape: (samples, 30, 3)
    features = []
    for win in windows:
        row = []
        for i in range(3):
            v = win[:, i]
            row.extend([
                v[-1], v.mean(), v.std(), v.min(), v.max(),
                (v[-1] - v[0]) / len(v)
            ])
        features.append(row)
    return np.asarray(features, dtype=float)

# Rebuild windows from the raw files using existing cleaning rules.
# This experiment excludes drug-rate features entirely.
from app.ml.features import clean_case, L, H

def make_vitals_windows(raw):
    a = clean_case(raw)[:, :3]
    X, y, last = [], [], []
    for s in range(0, len(a) - L - H + 1, 6):
        win = a[s:s + L]
        target = a[s + L + H - 1]
        if not np.isfinite(win).all() or not np.isfinite(target).all():
            continue
        X.append(win)
        y.append(target)
        last.append(win[-1])
    if not X:
        return np.empty((0, 18)), np.empty((0, 3)), np.empty((0, 3))
    return extract_features(np.array(X)), np.array(y), np.array(last)

split = json.loads((PROCESSED / "split.json").read_text())
raw_dir = ROOT / "data" / "raw" / "vitaldb"
data = {}

for name in ("train", "val", "test"):
    xs, ys, lasts = [], [], []
    for cid in split[name]:
        path = raw_dir / f"case_{cid:04d}.npz"
        with np.load(path, allow_pickle=False) as f:
            raw = f["values"]
        x, y, last = make_vitals_windows(raw)
        if len(x):
            xs.append(x)
            ys.append(y)
            lasts.append(last)
    if not xs:
        raise RuntimeError(f"No valid windows for split {name}")
    data[name] = (
        np.vstack(xs), np.vstack(ys), np.vstack(lasts)
    )
    print(f"{name}: {len(data[name][1])} windows")

Xtr, ytr, _ = data["train"]
Xva, yva, _ = data["val"]
Xte, yte, last = data["test"]

models = fit(Xtr, ytr, Xva, yva)
pred = predict(models, Xte)

def score(actual, predicted):
    return {
        target: {
            "mae": float(mean_absolute_error(actual[:, i], predicted[:, i])),
            "rmse": float(np.sqrt(mean_squared_error(actual[:, i], predicted[:, i])))
        }
        for i, target in enumerate(["sbp", "dbp", "hr"])
    }

result = {
    "description": "18 vital-sign-only features; drug-rate features excluded",
    "window_counts": {k: len(v[1]) for k, v in data.items()},
    "persistence": score(yte, last),
    "xgboost_vitals_only": score(yte, pred),
    "warning": "Exploratory evaluation only; not clinically validated."
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
print("Saved:", OUT)
