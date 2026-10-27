from fastapi import APIRouter, HTTPException

from ..ml import predict as ml_predict
from ..schemas import ForecastRequest, ForecastResponse

router = APIRouter()


@router.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    """AI forecast of SBP/DBP/HR from the last 5 minutes of vitals (needs a trained model)."""
    if not ml_predict.available():
        raise HTTPException(503, "No trained model found. Run scripts/build_training_set.py then app.ml.train.")
    return ml_predict.forecast(req.sbp, req.dbp, req.hr, req.drug_rate)
