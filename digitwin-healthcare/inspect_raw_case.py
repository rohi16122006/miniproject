import numpy as np
from pathlib import Path

path = Path("data/raw/vitaldb/case_5142.npz")

if not path.exists():
    raise FileNotFoundError(f"Raw case file not found: {path.resolve()}")

with np.load(path, allow_pickle=False) as data:
    values = data["values"]
    columns = data["columns"].tolist()

print("Raw file:", path.resolve())
print("Shape:", values.shape)
print("Columns:", columns)

for i, name in enumerate(columns):
    x = values[:, i]
    finite = np.isfinite(x)
    valid = x[finite]

    print(f"\n{name}:")
    print("  Total samples:", len(x))
    print("  Missing/non-finite:", int((~finite).sum()))

    if len(valid):
        print(f"  Min: {valid.min():.3f}")
        print(f"  Median: {np.median(valid):.3f}")
        print(f"  Max: {valid.max():.3f}")
        print(f"  Unique values: {len(np.unique(valid))}")

