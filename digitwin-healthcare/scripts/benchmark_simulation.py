"""Measure the simulation service without database or HTTP overhead."""
import argparse
import json
import platform
import statistics
import sys
import time
from pathlib import Path

import fastapi
import numpy
import scipy
import xgboost

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.schemas.simulation import SimRequest  # noqa: E402
from app.services.simulation_service import run_simulation  # noqa: E402


def benchmark(repeats: int, horizon_h: float, n_points: int) -> dict:
    request = SimRequest.model_validate(
        {
            "patient": {
                "age": 58,
                "sex": "male",
                "hr": 72,
                "ef": 0.55,
                "sbp": 145,
                "dbp": 92,
                "edv_ml": 120,
                "south_asian_seeding": False,
            },
            "regimen": [
                {"drug": "amlodipine", "dose_mg": 5, "interval_h": 24, "n_doses": 3},
                {"drug": "phenylephrine", "dose_mg": 0.1, "interval_h": 1, "n_doses": 1},
            ],
            "horizon_h": horizon_h,
            "n_points": n_points,
        }
    )

    for _ in range(3):
        run_simulation(request)

    durations_ms = []
    for _ in range(repeats):
        started = time.perf_counter()
        run_simulation(request)
        durations_ms.append((time.perf_counter() - started) * 1000)

    return {
        "measurement_scope": "run_simulation service call; excludes HTTP, JSON serialization, and SQLite persistence",
        "scenario": {
            "horizon_h": horizon_h,
            "sample_points": n_points,
            "medications": ["amlodipine", "phenylephrine"],
        },
        "warmup_runs": 3,
        "measured_runs": repeats,
        "runtime_ms": {
            "minimum": round(min(durations_ms), 3),
            "median": round(statistics.median(durations_ms), 3),
            "mean": round(statistics.mean(durations_ms), 3),
            "maximum": round(max(durations_ms), 3),
        },
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "processor": platform.processor() or "unspecified",
            "logical_cpu_count": __import__("os").cpu_count(),
            "numpy": numpy.__version__,
            "scipy": scipy.__version__,
            "fastapi": fastapi.__version__,
            "xgboost": xgboost.__version__,
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repeats", type=int, default=15)
    parser.add_argument("--horizon-h", type=float, default=72)
    parser.add_argument("--n-points", type=int, default=100)
    parser.add_argument("--output", type=Path, default=ROOT / "docs" / "simulation_benchmark.json")
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be at least 1")

    report = benchmark(args.repeats, args.horizon_h, args.n_points)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
