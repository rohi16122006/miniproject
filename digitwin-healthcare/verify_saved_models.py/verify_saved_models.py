
import numpy as np
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

from app.ml.xgb_model import load, predict

artifact_dir = ROOT / "backend" / "app" / "ml" / "artifacts"
test_path = ROOT / "data" / "processed" / "test.npz"

models, meta = load(artifact_dir)

with np.load(test_path, allow_pickle=False) as data:
    X = data["X"]
    y = data["y"]

predictions = predict(models, X)

print("Model version:", meta["version"])
print("Test input shape:", X.shape)
print("Prediction shape:", predictions.shape)
print("All predictions finite:", bool(np.isfinite(predictions).all()))
print("First 3 predictions (SBP, DBP, HR):")
print(predictions[:3])
print("First 3 reference values:")
print(y[:3])

assert predictions.shape == y.shape
assert np.isfinite(predictions).all()

print("PASS: saved models loaded and generated valid-shaped predictions.")
