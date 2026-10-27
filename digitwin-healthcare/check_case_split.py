
import numpy as np
from pathlib import Path

base = Path("data/processed")
splits = {}

for name in ("train", "val", "test"):
    file_path = base / f"{name}.npz"

    with np.load(file_path, allow_pickle=False) as data:
        case_ids = data["case_ids"]
        splits[name] = set(np.unique(case_ids).tolist())

        print(f"\n{name}:")
        print("  Windows:", len(case_ids))
        print("  Unique cases:", sorted(splits[name]))

print("\nCase overlap checks:")
print("Train vs validation:", splits["train"] & splits["val"])
print("Train vs test:", splits["train"] & splits["test"])
print("Validation vs test:", splits["val"] & splits["test"])
