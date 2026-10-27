from fastapi import APIRouter, HTTPException

from ..db.database import get_run, list_runs

router = APIRouter(prefix="/history")


@router.get("")
def history(limit: int = 20):
    return list_runs(min(max(limit, 1), 200))


@router.get("/{run_id}")
def history_item(run_id: int):
    run = get_run(run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    return run
