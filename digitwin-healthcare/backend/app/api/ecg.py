from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from ..db.database import (
    get_ecg_analysis,
    get_run,
    list_ecg_analyses,
    save_ecg_analysis,
)
from ..ml.ecg_model import MODEL_PATH, load_artifact, predict_from_features
from ..services.ecg_analysis import (
    MAX_UPLOAD_BYTES,
    ECGInputError,
    analyze_file,
)

router = APIRouter(prefix="/ecg", tags=["ECG analysis"])


async def _read_upload(file: UploadFile) -> tuple[str, bytes]:
    filename = Path(file.filename or "upload").name
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "The uploaded file exceeds the 10 MiB limit.")
    return filename, content


def _validate_run_id(run_id: int | None):
    if run_id is not None and get_run(run_id) is None:
        raise HTTPException(404, "Simulation run not found; ECG analysis was not linked.")


@router.get("/model")
def ecg_model_status():
    if not MODEL_PATH.is_file():
        return {
            "available": False,
            "task": "PTB-XL diagnostic-superclass multi-label classification",
            "dataset": "PTB-XL 1.0.3",
            "message": "No trained ECG model artifact is installed.",
        }
    try:
        artifact = load_artifact(MODEL_PATH)
    except (OSError, ValueError, KeyError) as error:
        return {
            "available": False,
            "task": "PTB-XL diagnostic-superclass multi-label classification",
            "dataset": "PTB-XL 1.0.3",
            "message": f"The ECG model artifact could not be loaded: {error}",
        }
    return {
        "available": True,
        "task": "PTB-XL diagnostic-superclass multi-label classification",
        "dataset": artifact["dataset"],
        "model_version": artifact["model_version"],
        "message": "Research model artifact loaded; predictions are not clinical diagnoses.",
    }


@router.post("/analyze")
async def analyze_ecg(
    file: UploadFile = File(...),
    sampling_rate_hz: float | None = Form(None),
    units: str | None = Form(None),
    run_id: int | None = Form(None),
    ocr_text: str | None = Form(None),
):
    _validate_run_id(run_id)
    filename, content = await _read_upload(file)
    try:
        result = analyze_file(filename, content, sampling_rate_hz, units, ocr_text)
    except ECGInputError as error:
        raise HTTPException(422, str(error)) from error
    model_input_compatible = result.pop("model_features") is not None
    analysis_id = save_ecg_analysis(run_id, result["detected_format"], result)
    return {
        **result,
        "model_input_compatible": model_input_compatible,
        "analysis_id": analysis_id,
        "associated_run_id": run_id,
        "source_document_retained": False,
        "extracted_text_retained": False,
    }


@router.post("/predict")
async def predict_ecg(
    file: UploadFile = File(...),
    sampling_rate_hz: float | None = Form(None),
    units: str | None = Form(None),
):
    if not MODEL_PATH.is_file():
        raise HTTPException(
            503,
            "No trained ECG abnormality model is installed. Obtain PTB-XL under its access terms and run the documented training pipeline first.",
        )
    filename, content = await _read_upload(file)
    try:
        result = analyze_file(filename, content, sampling_rate_hz, units)
    except ECGInputError as error:
        raise HTTPException(422, str(error)) from error
    if result["analysis_type"] != "waveform" or result["model_features"] is None:
        raise HTTPException(
            422,
            "The trained model requires a 10-second, 100- or 500-Hz, 12-lead waveform in standard lead order.",
        )
    try:
        prediction = predict_from_features(result["model_features"], MODEL_PATH)
    except (ValueError, OSError, KeyError) as error:
        raise HTTPException(503, f"The ECG model artifact could not be loaded: {error}") from error
    return {
        "task": "PTB-XL diagnostic-superclass multi-label classification",
        "model_version": prediction["model_version"],
        "dataset": prediction["dataset"],
        "predictions": prediction["predictions"],
        "uncertainty": "Probabilities are model scores and are not calibrated clinical confidence.",
        "limitations": [
            "Research-only output; not a diagnosis or treatment recommendation.",
            "This model has not been trained in the current checkout unless an artifact is present.",
        ],
    }


@router.get("/analyses")
def ecg_analyses(run_id: int | None = Query(None), limit: int = Query(20, ge=1, le=200)):
    _validate_run_id(run_id)
    return list_ecg_analyses(run_id=run_id, limit=limit)


@router.get("/analyses/{analysis_id}")
def ecg_analysis(analysis_id: int):
    analysis = get_ecg_analysis(analysis_id)
    if analysis is None:
        raise HTTPException(404, "ECG analysis not found.")
    return analysis
