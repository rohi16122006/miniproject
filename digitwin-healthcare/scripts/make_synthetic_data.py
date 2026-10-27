"""Generate SYNTHETIC BP/HR cases so the pipeline can be tested before real data arrives.

!! Synthetic: not patient data. Never report results from it as real findings.
"""
import argparse
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "synthetic"


def make_case(rng, n=1500):
    sbp0, dbp0, hr0 = rng.normal(125, 12), rng.normal(72, 8), rng.normal(72, 8)
    drift = np.zeros(n)
    for i in range(1, n):
        drift[i] = 0.995 * drift[i - 1] + rng.normal(0, 0.9)
    rate = np.zeros(n)
    for _ in range(rng.integers(2, 6)):             # random infusion blocks
        s = rng.integers(60, n - 200); rate[s:s + rng.integers(30, 120)] = rng.uniform(5, 30)
    effect = np.zeros(n)                            # first-order lag: BP follows drug rate
    for i in range(1, n):
        effect[i] = effect[i - 1] + 0.12 * (rate[i - 1] * 0.8 - effect[i - 1])
    sbp = sbp0 + drift + effect + rng.normal(0, 1.2, n)
    dbp = dbp0 + 0.55 * drift + 0.5 * effect + rng.normal(0, 0.9, n)
    hr = hr0 - 0.12 * effect + 0.3 * drift + rng.normal(0, 0.8, n)
    return np.column_stack([sbp, dbp, hr, rate])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", type=int, default=40)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(a.seed)
    for i in range(a.cases):
        np.savez_compressed(out / f"case_{i + 1:04d}.npz", values=make_case(rng),
                            columns=np.array(["sbp", "dbp", "hr", "drug_rate"]))
    print(f"wrote {a.cases} SYNTHETIC cases to {out}")


if __name__ == "__main__":
    main()
