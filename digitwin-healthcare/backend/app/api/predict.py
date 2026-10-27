from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from ..ml import predict as ml_predict
from ..schemas import ForecastRequest, ForecastResponse

router = APIRouter()


@router.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest):
    """AI forecast of SBP/DBP/HR from the last 5 minutes of vitals (needs a trained model)."""
    if not ml_predict.available():
        raise HTTPException(503, "No trained model found. Run scripts/build_training_set.py then app.ml.train.")
    result = ml_predict.forecast(req.sbp, req.dbp, req.hr, req.drug_rate)
    normalized_timestamps = [
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        .astimezone(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
        for timestamp in req.timestamps
    ]
    last_timestamp = datetime.fromisoformat(req.timestamps[-1].replace("Z", "+00:00"))
    predicted_at = (
        last_timestamp.astimezone(timezone.utc)
        + timedelta(seconds=result["horizon_s"])
    ).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {
        **result,
        "timestamps": normalized_timestamps,
        "provenance": req.provenance,
        "timestamp_basis": "UTC-normalized observation timestamps; prediction time is last observation plus horizon_s",
        "predicted_at": predicted_at,
    }
