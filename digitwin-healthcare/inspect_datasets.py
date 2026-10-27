
import numpy as np
from pathlib import Path

files = [
    Path("data/processed/train.npz"),
    Path("data/processed/val.npz"),
    Path("data/processed/test.npz"),
]

for file_path in files:
    print(f"\n--- {file_path} ---")

    if not file_path.exists():
        print("MISSING FILE")
        continue

    with np.load(file_path, allow_pickle=False) as data:
        for key in data.files:
            array = data[key]

            finite = (
                bool(np.isfinite(array).all())
                if np.issubdtype(array.dtype, np.number)
                else "not numeric"
            )

            print(
                f"{key}: shape={array.shape}, "
                f"dtype={array.dtype}, finite={finite}"
            )