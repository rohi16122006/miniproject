"""PTB-XL abnormality model artifact loading and shared signal features."""
from pathlib import Path

import joblib
import numpy as np
from scipy.signal import resample_poly, welch

MODEL_PATH = Path(__file__).resolve().parent / "ecg_artifacts" / "ptbxl_logistic.joblib"
MODEL_VERSION = "ptbxl-logistic-v1"
FEATURE_VERSION = "ptbxl-time-frequency-v1"
EXPECTED_LEADS = ("I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6")
TARGET_SAMPLE_RATE_HZ = 100
TARGET_DURATION_SECONDS = 10
FEATURES_PER_LEAD = 13
FEATURE_COUNT = len(EXPECTED_LEADS) * FEATURES_PER_LEAD


def extract_ptbxl_features(signal, sample_rate_hz: float, leads: list[str]) -> np.ndarray:
    values = np.asarray(signal, dtype=float)
    if tuple(leads) != EXPECTED_LEADS or values.ndim != 2 or values.shape[1] != len(EXPECTED_LEADS):
        raise ValueError("Expected a 12-lead ECG in PTB-XL lead order.")
    if not np.isfinite(values).all():
        raise ValueError("ECG contains missing or non-finite samples.")
    if sample_rate_hz <= 0:
        raise ValueError("Sampling rate must be positive.")
    duration = values.shape[0] / sample_rate_hz
    if abs(duration - TARGET_DURATION_SECONDS) > 0.2:
        raise ValueError("PTB-XL model inference requires a 10-second ECG recording.")
    if not np.isclose(sample_rate_hz, TARGET_SAMPLE_RATE_HZ):
        from fractions import Fraction

        ratio = Fraction(TARGET_SAMPLE_RATE_HZ / sample_rate_hz).limit_denominator(1000)
        values = resample_poly(values, ratio.numerator, ratio.denominator, axis=0)
    expected_samples = TARGET_SAMPLE_RATE_HZ * TARGET_DURATION_SECONDS
    if abs(len(values) - expected_samples) > 1:
        raise ValueError("ECG could not be resampled to the model's 10-second, 100-Hz input.")
    values = values[:expected_samples]

    features = []
    for channel in values.T:
        centered = channel - np.mean(channel)
        frequencies, power = welch(centered, fs=TARGET_SAMPLE_RATE_HZ, nperseg=256)
        total_power = float(np.sum(power[(frequencies >= 0.5) & (frequencies < 40)]))
        band_power = []
        for lower, upper in ((0.5, 5), (5, 15), (15, 40)):
            selected = (frequencies >= lower) & (frequencies < upper)
            band_power.append(
                float(np.sum(power[selected]) / total_power) if total_power > 0 else 0.0
            )
        features.extend(
            [
                float(np.mean(channel)),
                float(np.std(channel)),
                float(np.sqrt(np.mean(centered**2))),
                float(np.ptp(channel)),
                *[float(np.percentile(channel, percentile)) for percentile in (5, 25, 50, 75, 95)],
                float(np.median(np.abs(np.diff(channel)))),
                *band_power,
            ]
        )
    feature_array = np.asarray(features, dtype=float)
    if feature_array.shape != (FEATURE_COUNT,) or not np.isfinite(feature_array).all():
        raise ValueError("ECG feature extraction produced invalid data.")
    return feature_array


def load_artifact(path: Path = MODEL_PATH):
    artifact = joblib.load(path)
    if artifact.get("feature_version") != FEATURE_VERSION:
        raise ValueError("Unsupported ECG feature schema in the saved artifact.")
    if len(artifact.get("labels", [])) < 2:
        raise ValueError("ECG model artifact has an invalid label mapping.")
    return artifact


def predict_from_features(features, path: Path = MODEL_PATH):
    artifact = load_artifact(path)
    values = np.asarray(features, dtype=float)
    if values.shape != (FEATURE_COUNT,) or not np.isfinite(values).all():
        raise ValueError("Invalid ECG feature vector for model inference.")
    scores = artifact["pipeline"].predict_proba(values.reshape(1, -1))[0]
    labels = artifact["labels"]
    return {
        "model_version": artifact["model_version"],
        "dataset": artifact["dataset"],
        "predictions": [
            {"label": label, "score": float(score), "predicted": bool(score >= 0.5)}
            for label, score in zip(labels, scores, strict=True)
        ],
    }
