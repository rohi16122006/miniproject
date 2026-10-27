import json
from pathlib import Path

import numpy as np
from xgboost import XGBRegressor

TARGETS = ["sbp", "dbp", "hr"]


def fit(Xtr, ytr, Xva, yva, seed=0):
    models = {}
    for i, t in enumerate(TARGETS):
        m = XGBRegressor(n_estimators=400, learning_rate=0.05, max_depth=4, subsample=0.8,
                         colsample_bytree=0.8, early_stopping_rounds=30, random_state=seed,
                         n_jobs=2)
        m.fit(Xtr, ytr[:, i], eval_set=[(Xva, yva[:, i])], verbose=False)
        models[t] = m
    return models


def predict(models, X):
    return np.column_stack([models[t].predict(X) for t in TARGETS])


def save(models, out: Path, meta: dict):
    out.mkdir(parents=True, exist_ok=True)
    for t, m in models.items():
        m.save_model(out / f"xgb_{t}.json")
    (out / "meta.json").write_text(json.dumps(meta, indent=2))


def load(path: Path):
    models = {}
    for t in TARGETS:
        m = XGBRegressor()
        m.load_model(path / f"xgb_{t}.json")
        models[t] = m
    return models, json.loads((path / "meta.json").read_text())
