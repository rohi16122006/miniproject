"""Tests for the intelligent drug optimization and future outcomes prognosis services."""
import pytest
from app.schemas.simulation import Patient, Regimen, SimRequest
from app.services.optimizer import optimize_drug_for_patient
from app.services.prognosis import compute_future_prognosis


def test_optimize_hypertensive_patient():
    p = Patient(
        name="Hypertensive Patient",
        age=60,
        sex="male",
        sbp=165,
        dbp=100,
        hr=75,
        ef=0.55,
        medical_history="Stage 2 Hypertension",
        allergies="No known drug allergies",
    )
    result = optimize_drug_for_patient(p, horizon_h=24.0)

    assert "best_choice" in result
    assert "ranked_options" in result
    assert len(result["ranked_options"]) >= 4

    best = result["best_choice"]
    # Phenylephrine must NOT be selected for a hypertensive patient
    assert best["drug"] != "phenylephrine"
    # The best choice should be a vasodilator (amlodipine or enalapril) or beta-blocker
    assert best["drug"] in ["amlodipine", "enalapril", "metoprolol"]
    assert best["score"] >= 75.0
    assert best["final_sbp"] < 165  # BP was reduced


def test_optimize_hypotensive_patient():
    p = Patient(
        name="Hypotensive Case",
        age=58,
        sex="male",
        sbp=85,
        dbp=50,
        hr=65,
        ef=0.55,
        medical_history="Septic vasodilation",
    )
    result = optimize_drug_for_patient(p, horizon_h=2.0)
    best = result["best_choice"]

    # In acute hypotension, vasopressor (phenylephrine) must be the top choice
    assert best["drug"] == "phenylephrine"


def test_future_prognosis():
    req = SimRequest(
        patient=Patient(sbp=140, dbp=90, hr=80, ef=0.55),
        regimen=[Regimen(drug="amlodipine", dose_mg=5, interval_h=24, n_doses=1)],
        horizon_h=24.0,
    )
    res = compute_future_prognosis(req)

    assert "timeline" in res
    assert len(res["timeline"]) == 5
    assert "kinetics" in res
    assert len(res["kinetics"]) == 1
    assert res["kinetics"][0]["drug"] == "amlodipine"
    assert "rpp" in res["timeline"][0]
    assert "ci" in res["timeline"][0]
