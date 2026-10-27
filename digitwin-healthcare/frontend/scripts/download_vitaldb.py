"""Download selected VitalDB cases from PhysioNet 1.0.0 (only the tracks we need) and save as .npz.

    pip install vitaldb
    python scripts/download_vitaldb.py                # default 5 cases
    python scripts/download_vitaldb.py --cases 984 2265 --interval 10
    python scripts/download_vitaldb.py --auto-find --limit 20  # download 20 cases from PhysioNet

Data source: PhysioNet VitalDB (https://physionet.org/content/vitaldb/1.0.0/vital_files/)
Contains 6,388 surgical cases (94.2 GB raw waveform archive).
Rather than downloading the entire 94.2 GB of 500 Hz raw waveforms (ECG, EEG, AWP),
this script queries PhysioNet for cases with continuous radial arterial lines and
phenylephrine infusion (115 qualifying cases), extracting only the vital signals.

Resumable: cases already saved are skipped (useful on a slow connection).
Output columns: sbp, dbp, hr, drug_rate (phenylephrine infusion, mL/hr; NaN if none).
"""
import argparse
from pathlib import Path

import numpy as np

TRACKS = ["Solar8000/ART_SBP", "Solar8000/ART_DBP", "Solar8000/HR", "Orchestra/PHEN_RATE"]
DEFAULT_CASES = [984, 2265, 4718, 5894, 61]
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "vitaldb"


def main():
    ap = argparse.ArgumentParser(description="Download surgical cases from PhysioNet VitalDB 1.0.0")
    ap.add_argument("--cases", type=int, nargs="+", default=DEFAULT_CASES, help="Specific case IDs to download")
    ap.add_argument("--auto-find", action="store_true", help="Find all cases on PhysioNet with arterial line + phenylephrine infusion")
    ap.add_argument("--limit", type=int, default=None, help="Maximum number of cases to download when using --auto-find")
    ap.add_argument("--interval", type=int, default=10, help="Seconds per sample (default: 10s)")
    a = ap.parse_args()
    import vitaldb

    cases_to_fetch = a.cases
    if a.auto_find:
        print("Querying PhysioNet VitalDB dataset for cases with ART_SBP and PHEN_RATE...")
        found = vitaldb.find_cases(["Solar8000/ART_SBP", "Orchestra/PHEN_RATE"])
        print(f"Found {len(found)} matching cases in the PhysioNet dataset.")
        if a.limit:
            found = found[:a.limit]
            print(f"Limiting to first {a.limit} cases.")
        cases_to_fetch = found

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {len(cases_to_fetch)} cases at {a.interval}s interval to {OUT}...")
    for cid in cases_to_fetch:
        path = OUT / f"case_{cid:04d}.npz"
        if path.exists():
            print(f"Case {cid}: already saved, skipping")
            continue
        try:
            vals = vitaldb.load_case(cid, TRACKS, a.interval)
        except Exception as e:
            print(f"Case {cid}: failed ({e})")
            continue
        if vals is None or np.isnan(vals[:, 0]).all():
            print(f"Case {cid}: no valid ART_SBP track; skipped")
            continue
        np.savez_compressed(path, values=vals, columns=np.array(["sbp", "dbp", "hr", "drug_rate"]))
        print(f"Case {cid}: saved {vals.shape[0]} samples (~{round(vals.shape[0] * a.interval / 3600, 1)} hrs)")


if __name__ == "__main__":
    main()
