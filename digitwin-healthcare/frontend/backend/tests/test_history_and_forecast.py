import subprocess
import sys
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.ml import predict as ml_predict
from app.ml import train

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]


def test_simulation_is_logged_and_retrievable():
    r = client.post("/simulate", json={"regimen": [{"drug": "amlodipine", "dose_mg": 5}], "horizon_h": 24}).json()
    assert isinstance(r["run_id"], int)
    hist = client.get("/history").json()
    assert hist[0]["id"] == r["run_id"]
    assert client.get(f"/history/{r['run_id']}").json()["result"]["risk"] == r["risk"]
    assert client.get("/history/9999").status_code == 404


def test_patient_profile_persisted_and_isolated():
    # Simulate for Patient A
    pA = {
        "patient_id": "PT-A101",
        "name": "Alice Medical",
        "age": 52,
        "sex": "female",
        "hr": 74,
        "ef": 0.58,
        "sbp": 130,
        "dbp": 82,
        "medical_history": "Mild hypertension",
        "allergies": "Penicillin",
        "current_medications": "Aspirin 81mg",
    }
    rA = client.post("/simulate", json={"patient": pA, "regimen": [{"drug": "amlodipine", "dose_mg": 5}]}).json()
    
    # Simulate for Patient B
    pB = {
        "patient_id": "PT-B202",
        "name": "Bob Surgical",
        "age": 68,
        "sex": "male",
        "hr": 62,
        "ef": 0.50,
        "sbp": 90,
        "dbp": 55,
        "medical_history": "Post-op hypotension",
        "allergies": "None",
        "current_medications": "None",
    }
    rB = client.post("/simulate", json={"patient": pB, "regimen": [{"drug": "phenylephrine", "dose_mg": 0.1}]}).json()

    # Query history and verify independent session records
    histA = client.get(f"/history/{rA['run_id']}").json()
    histB = client.get(f"/history/{rB['run_id']}").json()

    assert histA["request"]["patient"]["patient_id"] == "PT-A101"
    assert histA["request"]["patient"]["name"] == "Alice Medical"
    assert histA["request"]["patient"]["allergies"] == "Penicillin"

    assert histB["request"]["patient"]["patient_id"] == "PT-B202"
    assert histB["request"]["patient"]["name"] == "Bob Surgical"
    assert histB["request"]["patient"]["allergies"] == "None"


def test_phenylephrine_raises_bp():
    r = client.post("/simulate", json={"regimen": [{"drug": "phenylephrine", "dose_mg": 0.1, "interval_h": 1, "n_doses": 1}],
                                       "horizon_h": 1, "n_points": 25}).json()
    assert max(x["map"] for x in r["series"]) > r["baseline"]["map"] + 3


def test_forecast_requires_model_and_validates_input():
    body = {"sbp": [120.0] * 30, "dbp": [70.0] * 30, "hr": [70.0] * 30}
    if not ml_predict.available():
        assert client.post("/forecast", json=body).status_code == 503
    bad = dict(body, sbp=[500.0] * 30)
    assert client.post("/forecast", json=bad).status_code == 422


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
