from fastapi import APIRouter, HTTPException

from ..db.database import save_run
from ..physics.drugs import DRUGS
from ..schemas import SimRequest
from ..services import run_simulation

router = APIRouter()


@router.get("/drugs")
def drugs():
    return {
        key: {
            "label": drug["label"],
            "default_dose": drug["default_dose"],
            "interval_h": drug["interval"],
            "evidence": drug.get("evidence", "assumed"),
            "drug_class": drug["drug_class"],
            "route": drug["route"],
            "modeling_role": drug["modeling_role"],
            "mechanism": drug["mechanism"],
            "administration": drug["administration"],
            "source": drug["source"],
            "limitations": drug["limitations"],
            "pk": {
                "ka_per_h": drug["ka"],
                "half_life_h": drug["t_half"],
                "volume_distribution_l": drug["vd_l"],
                "bioavailability_fraction": drug["f"],
            },
            "pd": drug["effects"],
        }
        for key, drug in DRUGS.items()
    }


@router.post("/simulate")
def simulate(req: SimRequest):
    for r in req.regimen:
        if r.drug not in DRUGS:
            raise HTTPException(422, f"Unknown drug '{r.drug}'. Available: {list(DRUGS)}")
    result = run_simulation(req)
    result["run_id"] = save_run(req.model_dump(), result)
    return result
