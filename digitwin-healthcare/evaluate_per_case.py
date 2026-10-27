
import json
import sys
from pathlib import Path

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

from app.ml.xgb_model import load, predict

ARTIFACTS = ROOT / "backend" / "app" / "ml" / "artifacts"
TEST_FILE = ROOT / "data" / "processed" / "test.npz"
OUTPUT_FILE = ROOT / "docs" / "per_case_evaluation.json"

targets = ["sbp", "dbp", "hr"]
models, metadata = load(ARTIFACTS)

with np.load(TEST_FILE, allow_pickle=False) as data:
    X = data["X"]
    y = data["y"]
    last = data["last"]
    case_ids = data["case_ids"]

predictions = predict(models, X)
report = {
    "task": metadata["results"]["task"],
    "test_cases": sorted(map(int, np.unique(case_ids))),
    "results_by_case": {},
}

for case_id in sorted(np.unique(case_ids)):
    mask = case_ids == case_id
    actual = y[mask]
    xgb_pred = predictions[mask]
    persistence_pred = last[mask]

    report["results_by_case"][str(int(case_id))] = {}

    for i, target in enumerate(targets):
        report["results_by_case"][str(int(case_id))][target] = {
            "windows": int(mask.sum()),
            "xgboost": {
                "mae": float(mean_absolute_error(actual[:, i], xgb_pred[:, i])),
                "rmse": float(np.sqrt(mean_squared_error(actual[:, i], xgb_pred[:, i]))),
            },
            "persistence": {
                "mae": float(mean_absolute_error(actual[:, i], persistence_pred[:, i])),
                "rmse": float(np.sqrt(mean_squared_error(actual[:, i], persistence_pred[:, i]))),
            },
        }

OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
OUTPUT_FILE.write_text(json.dumps(report, indent=2))

print(json.dumps(report, indent=2))
print(f"\nSaved report to: {OUTPUT_FILE}")
