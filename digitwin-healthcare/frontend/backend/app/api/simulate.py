from fastapi import APIRouter, HTTPException

from ..db.database import save_run
from ..physics.drugs import DRUGS
from ..schemas import Patient, SimRequest
from ..services import run_simulation
from ..services.optimizer import optimize_drug_for_patient
from ..services.prognosis import compute_future_prognosis

router = APIRouter()


@router.get("/drugs")
def drugs():
    return {k: dict(label=v["label"], default_dose=v["default_dose"], interval_h=v["interval"],
                    evidence=v.get("evidence", "assumed")) for k, v in DRUGS.items()}


@router.post("/simulate")
def simulate(req: SimRequest):
    for r in req.regimen:
        if r.drug not in DRUGS:
            raise HTTPException(422, f"Unknown drug '{r.drug}'. Available: {list(DRUGS)}")
    result = run_simulation(req)
    result["run_id"] = save_run(req.model_dump(), result)
    return result


@router.post("/optimize_drug")
def optimize_drug(patient: Patient, horizon_h: float = 24.0):
    """Recommends the best medication and dosage tailored to the patient condition."""
    return optimize_drug_for_patient(patient, horizon_h=horizon_h)


@router.post("/future_prognosis")
def future_prognosis(req: SimRequest):
    """Computes multi-horizon trajectory, organ perfusion workload, and clearance kinetics."""
    return compute_future_prognosis(req)
