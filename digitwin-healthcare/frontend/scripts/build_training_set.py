"""Raw cases -> cleaned windows, split BY PATIENT (case) into train/val/test.

    python scripts/build_training_set.py --raw data/raw/vitaldb
    python scripts/build_training_set.py --raw data/raw/synthetic   # pipeline test only
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.ml.features import FEATURE_NAMES, make_windows  # noqa: E402


def build(raw: Path, out: Path, seed=0, stride=6):
    files = sorted(raw.glob("case_*.npz"))
    if len(files) < 5:
        sys.exit(f"Need at least 5 cases in {raw} (found {len(files)}).")
    ids = [int(f.stem.split("_")[1]) for f in files]
    rng = np.random.default_rng(seed)
    order = rng.permutation(len(ids))
    n_te, n_va = max(1, round(0.2 * len(ids))), max(1, round(0.2 * len(ids)))
    split = {"test": [ids[i] for i in order[:n_te]], "val": [ids[i] for i in order[n_te:n_te + n_va]],
             "train": [ids[i] for i in order[n_te + n_va:]]}   # patient-level split BEFORE windowing

    out.mkdir(parents=True, exist_ok=True)
    for name, cids in split.items():
        X, y, last, owner = [], [], [], []
        for f, cid in zip(files, ids):
            if cid not in cids:
                continue
            x, t, l = make_windows(np.load(f)["values"], stride=stride)
            X.append(x); y.append(t); last.append(l); owner += [cid] * len(x)
        np.savez_compressed(out / f"{name}.npz", X=np.vstack(X), y=np.vstack(y), last=np.vstack(last),
                            case_ids=np.array(owner))
        print(f"{name}: {len(cids)} cases, {len(owner)} windows")
    (out / "split.json").write_text(json.dumps(split, indent=2))
    (out / "features.json").write_text(json.dumps(FEATURE_NAMES, indent=2))
    (out / "SOURCE.txt").write_text(str(raw))
    return split


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=str(ROOT / "data/raw/vitaldb"))
    ap.add_argument("--out", default=str(ROOT / "data/processed"))
    a = ap.parse_args()
    build(Path(a.raw), Path(a.out))
