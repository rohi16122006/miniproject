from pathlib import Path

import numpy as np

from . import features as F
from . import xgb_model

ARTIFACTS = Path(__file__).parent / "artifacts"
_cache = {}


def available(path: Path = ARTIFACTS) -> bool:
    return (path / "meta.json").exists()


def forecast(sbp, dbp, hr, drug_rate, path: Path = ARTIFACTS) -> dict:
    key = str(path)
    if key not in _cache:
        _cache[key] = xgb_model.load(path)
    models, meta = _cache[key]
    win = np.column_stack([sbp, dbp, hr, drug_rate]).astype(float)
    x = F.window_features(win).reshape(1, -1)
    p = xgb_model.predict(models, x)[0]
    return dict(horizon_s=meta["H"] * meta["step_s"], sbp=round(float(p[0]), 1),
                dbp=round(float(p[1]), 1), hr=round(float(p[2]), 1),
                persistence=dict(sbp=float(sbp[-1]), dbp=float(dbp[-1]), hr=float(hr[-1])),
                model_version=meta["version"])
