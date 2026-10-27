"""Cleaning, windowing and feature extraction for BP/HR forecasting.

Raw case array columns (10 s grid): sbp, dbp, hr, drug_rate  -> shape (n, 4)
Task: from the previous L samples, predict SBP/DBP/HR H samples ahead.
Only past values are used as inputs (no future leakage).
"""
import numpy as np

CHANNELS = ["sbp", "dbp", "hr", "drug_rate"]
STEP_S = 10          # seconds per sample
L = 30               # input window: 30 samples = 5 min
H = 30               # forecast horizon: 30 samples = 5 min
MAX_GAP = 6          # interpolate gaps up to 60 s
LIMITS = {"sbp": (40, 300), "dbp": (20, 200), "hr": (20, 250)}


def clean_case(arr: np.ndarray) -> np.ndarray:
    """Flag implausible values as NaN (not silently altered), fill short gaps, zero-fill drug rate."""
    a = np.array(arr, dtype=float, copy=True)
    for i, ch in enumerate(CHANNELS[:3]):
        lo, hi = LIMITS[ch]
        a[(a[:, i] < lo) | (a[:, i] > hi), i] = np.nan
        a[:, i] = _fill_short_gaps(a[:, i])
    a[:, 3] = np.nan_to_num(a[:, 3], nan=0.0)
    return a


def _fill_short_gaps(x: np.ndarray) -> np.ndarray:
    x = x.copy()
    isn = np.isnan(x)
    if not isn.any() or isn.all():
        return x
    idx = np.arange(len(x))
    filled = np.interp(idx, idx[~isn], x[~isn])
    # keep NaN where the gap is longer than MAX_GAP
    run = 0
    for i in range(len(x)):
        if isn[i]:
            run += 1
        else:
            if run:
                if run <= MAX_GAP:
                    x[i - run:i] = filled[i - run:i]
                run = 0
    if run and run <= MAX_GAP:
        pass  # trailing gap: leave as NaN
    return x


FEATURE_NAMES = (
    [f"{c}_{s}" for c in CHANNELS[:3] for s in ("last", "mean", "std", "min", "max", "slope")]
    + ["drug_last", "drug_mean", "drug_max"]
)


def window_features(win: np.ndarray) -> np.ndarray:
    """win: (L, 4) -> feature vector aligned with FEATURE_NAMES."""
    f = []
    for i in range(3):
        v = win[:, i]
        f += [v[-1], v.mean(), v.std(), v.min(), v.max(), (v[-1] - v[0]) / len(v)]
    d = win[:, 3]
    f += [d[-1], d.mean(), d.max()]
    return np.array(f, dtype=float)


def make_windows(arr: np.ndarray, stride: int = 6):
    """Return X (m, n_features), y (m, 3) targets at t+H, last (m, 3) persistence baseline."""
    a = clean_case(arr)
    X, y, last = [], [], []
    for s in range(0, len(a) - L - H + 1, stride):
        win = a[s:s + L]
        tgt = a[s + L + H - 1, :3]
        if np.isnan(win[:, :3]).any() or np.isnan(tgt).any():
            continue
        X.append(window_features(win)); y.append(tgt); last.append(win[-1, :3])
    if not X:
        return np.empty((0, len(FEATURE_NAMES))), np.empty((0, 3)), np.empty((0, 3))
    return np.array(X), np.array(y), np.array(last)
