import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))

from app.ml.features import clean_case, make_windows

case_ids = [61, 513, 5142]

for cid in case_ids:
    path = ROOT / "data" / "raw" / "vitaldb" / f"case_{cid:04d}.npz"
    print(f"\n{'=' * 50}\nCASE {cid}")

    with np.load(path, allow_pickle=False) as data:
        raw = data["values"]

    cleaned = clean_case(raw)

    for i, name in enumerate(["SBP", "DBP", "HR", "drug_rate"]):
        before = raw[:, i]
        after = cleaned[:, i]

        print(f"\n{name}")
        print("  Raw non-finite:", int((~np.isfinite(before)).sum()))
        print("  Cleaned non-finite:", int((~np.isfinite(after)).sum()))

        if i < 3:
            print("  Raw negative values:", int((before < 0).sum()))

    X, y, last = make_windows(raw)
    print("\nValid windows after cleaning:", len(X))
    print("X finite:", bool(np.isfinite(X).all()))
    print("y finite:", bool(np.isfinite(y).all()))

print("\nCleaning diagnostic complete. No files modified.")
