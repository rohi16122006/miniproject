
import numpy as np
from pathlib import Path

path = Path("data/processed/test.npz")
targets = ["SBP", "DBP", "HR"]

with np.load(path, allow_pickle=False) as data:
    y = data["y"]
    last = data["last"]
    case_ids = data["case_ids"]

for cid in sorted(np.unique(case_ids)):
    mask = case_ids == cid

    print(f"\n{'=' * 45}")
    print(f"CASE {cid} — {mask.sum()} windows")

    for i, name in enumerate(targets):
        actual = y[mask, i]
        previous = last[mask, i]

        print(f"\n{name}")
        print(
            f"  Future target: min={actual.min():.2f}, "
            f"median={np.median(actual):.2f}, "
            f"max={actual.max():.2f}"
        )
        print(
            f"  Previous value: min={previous.min():.2f}, "
            f"median={np.median(previous):.2f}, "
            f"max={previous.max():.2f}"
        )
        print(
            f"  Mean absolute change: "
            f"{np.mean(np.abs(actual - previous)):.2f}"
        )
