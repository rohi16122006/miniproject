import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.ml import features as ml_features
from app.ml import predict as ml_predict
from app.ml import train
from app.ml import xgb_model
from app.schemas.predict import ForecastRequest

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]


def valid_forecast_payload():
    start = datetime(2026, 10, 26, 9, 0, tzinfo=timezone.utc)
    return {
        "timestamps": [
            (start + timedelta(seconds=10 * index)).isoformat().replace("+00:00", "Z")
            for index in range(30)
        ],
        "sbp": [120.0 + index * 0.2 for index in range(30)],
        "dbp": [70.0 + index * 0.1 for index in range(30)],
        "hr": [72.0 + index * 0.1 for index in range(30)],
        "drug_rate": [0.0 if index < 15 else 0.1 for index in range(30)],
        "provenance": "imported_recording",
    }


def test_simulation_is_logged_and_retrievable():
    r = client.post("/simulate", json={"regimen": [{"drug": "amlodipine", "dose_mg": 5}], "horizon_h": 24}).json()
    assert isinstance(r["run_id"], int)
    hist = client.get("/history").json()
    assert hist[0]["id"] == r["run_id"]
    assert client.get(f"/history/{r['run_id']}").json()["result"]["risk"] == r["risk"]
    assert client.get("/history/9999").status_code == 404


def test_simulation_history_keeps_patient_snapshots_with_their_own_runs():
    first = client.post(
        "/simulate",
        json={"patient": {"age": 41, "sex": "female", "sbp": 118, "dbp": 76}, "horizon_h": 2},
    ).json()
    second = client.post(
        "/simulate",
        json={"patient": {"age": 79, "sex": "male", "sbp": 164, "dbp": 88}, "horizon_h": 2},
    ).json()

    first_history = client.get(f"/history/{first['run_id']}").json()
    second_history = client.get(f"/history/{second['run_id']}").json()
    assert first_history["request"]["patient"]["age"] == 41
    assert second_history["request"]["patient"]["age"] == 79
    assert first_history["id"] != second_history["id"]


def test_phenylephrine_raises_bp():
    r = client.post("/simulate", json={"regimen": [{"drug": "phenylephrine", "dose_mg": 0.1, "interval_h": 1, "n_doses": 1}],
                                       "horizon_h": 1, "n_points": 25}).json()
    assert max(x["map"] for x in r["series"]) > r["baseline"]["map"] + 3


def test_forecast_requires_model_and_validates_input():
    body = valid_forecast_payload()
    if not ml_predict.available():
        assert client.post("/forecast", json=body).status_code == 503
    bad = dict(body, sbp=[500.0] * 30)
    assert client.post("/forecast", json=bad).status_code == 422


def test_forecast_rejects_missing_samples():
    body = valid_forecast_payload()
    body["hr"] = body["hr"][:-1]
    assert client.post("/forecast", json=body).status_code == 422


def test_forecast_rejects_missing_timestamps():
    body = valid_forecast_payload()
    del body["timestamps"]
    assert client.post("/forecast", json=body).status_code == 422


def test_forecast_rejects_mismatched_timestamp_array_length():
    body = valid_forecast_payload()
    body["timestamps"] = body["timestamps"][:-1]
    assert client.post("/forecast", json=body).status_code == 422


def test_forecast_rejects_missing_drug_rate():
    body = valid_forecast_payload()
    del body["drug_rate"]
    assert client.post("/forecast", json=body).status_code == 422


@pytest.mark.parametrize("timestamp_change", ["reverse", "irregular", "invalid", "missing_timezone"])
def test_forecast_rejects_invalid_timestamp_windows(timestamp_change):
    body = valid_forecast_payload()
    if timestamp_change == "reverse":
        body["timestamps"].reverse()
    elif timestamp_change == "irregular":
        body["timestamps"][10] = (
            datetime.fromisoformat(body["timestamps"][10].replace("Z", "+00:00"))
            + timedelta(seconds=1)
        ).isoformat().replace("+00:00", "Z")
    elif timestamp_change == "invalid":
        body["timestamps"][5] = "2026-02-30T09:00:50Z"
    else:
        body["timestamps"][5] = body["timestamps"][5].replace("Z", "")
    assert client.post("/forecast", json=body).status_code == 422


def test_forecast_rejects_invalid_provenance():
    body = valid_forecast_payload()
    body["provenance"] = "verified_clinical"
    assert client.post("/forecast", json=body).status_code == 422


@pytest.mark.parametrize(
    "field,values",
    [
        ("drug_rate", [-0.1] * 30),
        ("dbp", [130.0] * 30),
    ],
)
def test_forecast_rejects_nonfinite_or_inconsistent_measurements(field, values):
    body = {"sbp": [120.0] * 30, "dbp": [70.0] * 30, "hr": [70.0] * 30}
    body[field] = values
    response = client.post(
        "/forecast",
        content=json.dumps(body, allow_nan=True),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


def test_forecast_schema_rejects_nonfinite_measurements():
    body = valid_forecast_payload()
    body["hr"] = [float("nan")] * 30
    with pytest.raises(ValidationError, match="finite numbers"):
        ForecastRequest.model_validate(body)


def test_drug_catalog_exposes_parameter_evidence():
    response = client.get("/drugs")
    assert response.status_code == 200
    drugs = response.json()
    assert drugs["amlodipine"]["evidence"] == "assumed"
    assert "VitalDB case 61" in drugs["phenylephrine"]["evidence"]
    assert drugs["phenylephrine"]["route"] == "intravenous"
    assert "continuous infusion is not supported" in drugs["phenylephrine"]["administration"]
    assert drugs["phenylephrine"]["modeling_role"].startswith("Historical-fit-attributed")
    assert drugs["amlodipine"]["pk"]["half_life_h"] == 40.0
    assert "assumed" in drugs["amlodipine"]["source"]


def test_simulation_rejects_unsupported_administration_fields():
    response = client.post(
        "/simulate",
        json={"regimen": [{"drug": "phenylephrine", "dose_mg": 0.1, "administration_mode": "continuous_infusion"}]},
    )
    assert response.status_code == 422


def test_xgboost_artifacts_match_feature_schema_and_predict_deterministically():
    if not ml_predict.available():
        pytest.skip("Trained XGBoost artifacts are not installed")

    models, meta = xgb_model.load(ml_predict.ARTIFACTS)
    assert meta["feature_names"] == ml_features.FEATURE_NAMES
    sample = np.zeros((2, len(ml_features.FEATURE_NAMES)), dtype=float)
    predictions = xgb_model.predict(models, sample)
    assert predictions.shape == (2, 3)
    assert np.isfinite(predictions).all()
    np.testing.assert_array_equal(predictions, xgb_model.predict(models, sample))
    assert all(model.n_features_in_ == len(ml_features.FEATURE_NAMES) for model in models.values())


def test_forecast_endpoint_uses_loaded_xgboost_artifacts():
    if not ml_predict.available():
        pytest.skip("Trained XGBoost artifacts are not installed")

    body = valid_forecast_payload()
    response = client.post("/forecast", json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["horizon_s"] == 300
    assert result["model_version"] == "xgb-0.1"
    assert result["persistence"] == {"sbp": 125.8, "dbp": 72.9, "hr": 74.9}
    assert result["timestamps"] == [
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        .astimezone(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
        for timestamp in body["timestamps"]
    ]
    assert result["provenance"] == "imported_recording"
    assert result["timestamp_basis"].startswith("UTC-normalized")
    assert result["predicted_at"] == "2026-10-26T09:09:50.000Z"
    assert np.isfinite([result["sbp"], result["dbp"], result["hr"]]).all()


def test_pipeline_runs_and_splits_by_patient(tmp_path):
    raw, proc, art = tmp_path / "raw", tmp_path / "proc", tmp_path / "art"
    py = sys.executable
    subprocess.run([py, str(ROOT / "scripts/make_synthetic_data.py"), "--cases", "15", "--out", str(raw)], check=True, capture_output=True)
    subprocess.run([py, str(ROOT / "scripts/build_training_set.py"), "--raw", str(raw), "--out", str(proc)], check=True, capture_output=True)
    ids = {s: set(np.load(proc / f"{s}.npz")["case_ids"].tolist()) for s in ("train", "val", "test")}
    assert not (ids["train"] & ids["val"]) and not (ids["train"] & ids["test"]) and not (ids["val"] & ids["test"])
    res = train.run(proc, art)
    assert set(res["test_xgboost"]) == {"sbp", "dbp", "hr"} and "mae" in res["test_persistence"]["sbp"]
    out = ml_predict.forecast([120.0] * 30, [70.0] * 30, [70.0] * 30, [0.0] * 30, path=art)
    assert out["horizon_s"] == 300 and 40 < out["sbp"] < 250
