
import numpy as np
from pathlib import Path
from app.ml.xgb_model import load, predict

root = Path(__file__).resolve().parents[1]
artifact_dir = root / "backend" / "app" / "ml" / "artifacts"
test_path = root / "data" / "processed" / "test.npz"

models, meta = load(artifact_dir)

with np.load(test_path, allow_pickle=False) as data:
    X = data["X"]
    y = data["y"]

pred = predict(models, X)

print("Model version:", meta["version"])
print("Input shape:", X.shape)
print("Prediction shape:", pred.shape)
print("Finite predictions:", np.isfinite(pred).all())
print("First predictions:\n", pred[:3])
print("Reference values:\n", y[:3])

assert pred.shape == y.shape
assert np.isfinite(pred).all()
print("PASS: model loading and inference succeeded.")
