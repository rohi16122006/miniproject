import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.physics.windkessel import RC_DEFAULT, calibrate, simulate_beat

client = TestClient(app)


def test_calibration_reproduces_bp():
    sv = 0.55 * 120
    R, C = calibrate(150, 95, 75, sv)
    b = simulate_beat(R, C, 75, sv)
    assert abs(b.sbp - 150) < 1.0 and abs(b.dbp - 95) < 1.0


def test_map_uses_flow_conservation_equation():
    hr, sv, resistance = 70.0, 72.0, 1.25
    beat = simulate_beat(resistance, 1.4, hr, sv)
    cardiac_output_ml_s = hr * sv / 60.0

    assert beat.map == pytest.approx(cardiac_output_ml_s * (resistance + RC_DEFAULT))
    assert beat.co_lpm == pytest.approx(hr * sv / 1000.0)


def test_amlodipine_lowers_bp_and_is_fast():
    body = {"regimen": [{"drug": "amlodipine", "dose_mg": 5, "interval_h": 24, "n_doses": 3}],
            "horizon_h": 72}
    t0 = time.perf_counter()
    r = client.post("/simulate", json=body).json()
    assert time.perf_counter() - t0 < 2.0
    assert r["series"][-1]["map"] < r["baseline"]["map"] - 3


def test_metoprolol_lowers_hr():
    body = {"regimen": [{"drug": "metoprolol", "dose_mg": 50, "n_doses": 1}], "horizon_h": 12}
    r = client.post("/simulate", json=body).json()
    assert min(x["hr"] for x in r["series"]) < r["baseline"]["hr"] - 5


def test_overdose_flags_hypotension():
    body = {"patient": {"sbp": 122, "dbp": 76},  # normotensive patient, stacked antihypertensives
            "regimen": [{"drug": "enalapril", "dose_mg": 80, "n_doses": 1},
                        {"drug": "amlodipine", "dose_mg": 40, "n_doses": 1}], "horizon_h": 24}
    assert client.post("/simulate", json=body).json()["risk"] == "high"


def test_seeding_when_no_bp():
    body = {"patient": {"age": 60, "sex": "female", "hr": 72, "ef": 0.55, "sbp": None, "dbp": None}}
    r = client.post("/simulate", json=body).json()
    assert r["model"]["source"] == "demographic seeding prior"


def test_unknown_drug_rejected():
    assert client.post("/simulate", json={"regimen": [{"drug": "x", "dose_mg": 1}]}).status_code == 422


def test_simulation_suggests_safer_drug_when_current_contraindicated():
    # Hypertensive patient simulated with phenylephrine (vasopressor)
    body = {
        "patient": {"sbp": 160, "dbp": 100, "hr": 75},
        "regimen": [{"drug": "phenylephrine", "dose_mg": 0.1, "interval_h": 1, "n_doses": 1}],
        "horizon_h": 24,
    }
    r = client.post("/simulate", json=body).json()
    assert "drug_safety" in r
    ds = r["drug_safety"]
    assert ds["same_drug_is_okay"] is False
    assert ds["suggested_action"] == "switch"
    assert ds["safest_drug"] in ("amlodipine", "enalapril")
    assert ds["switch_regimen"][0]["drug"] in ("amlodipine", "enalapril")


def test_simulation_confirms_same_drug_when_current_is_safe():
    # Hypertensive patient simulated with amlodipine (indicated CCB)
    body = {
        "patient": {"sbp": 150, "dbp": 95, "hr": 75},
        "regimen": [{"drug": "amlodipine", "dose_mg": 5, "interval_h": 24, "n_doses": 1}],
        "horizon_h": 24,
    }
    r = client.post("/simulate", json=body).json()
    ds = r["drug_safety"]
    assert ds["same_drug_is_okay"] is True
    assert ds["suggested_action"] == "maintain"
    assert ds["safest_drug"] == "amlodipine"


def test_simulation_flags_bradycardia_and_suggests_safer_alternative():
    # Patient with baseline low HR (55 bpm) given metoprolol
    body = {
        "patient": {"sbp": 150, "dbp": 95, "hr": 55},
        "regimen": [{"drug": "metoprolol", "dose_mg": 50, "interval_h": 12, "n_doses": 2}],
        "horizon_h": 24,
    }
    r = client.post("/simulate", json=body).json()
    ds = r["drug_safety"]
    assert ds["same_drug_is_okay"] is False
    assert ds["safest_drug"] in ("amlodipine", "enalapril")


def test_simulation_hypotension_suggests_phenylephrine():
    # Hypotensive shock patient simulated with amlodipine
    body = {
        "patient": {"sbp": 85, "dbp": 55, "hr": 70},
        "regimen": [{"drug": "amlodipine", "dose_mg": 5, "interval_h": 24, "n_doses": 1}],
        "horizon_h": 12,
    }
    r = client.post("/simulate", json=body).json()
    ds = r["drug_safety"]
    assert ds["same_drug_is_okay"] is False
    assert ds["safest_drug"] == "phenylephrine"
