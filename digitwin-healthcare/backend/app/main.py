from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import ecg, history, predict, simulate

app = FastAPI(title="DigiTwin API", version="0.2")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(simulate.router)
app.include_router(history.router)
app.include_router(predict.router)
app.include_router(ecg.router)


@app.get("/health")
def health():
    from .ml.predict import available
    return {"status": "ok", "version": app.version, "ml_model_loaded": available()}


# Single unified deployment: serve built React frontend if dist exists
dist_candidates = [
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
    Path(__file__).resolve().parent.parent / "frontend" / "dist",
    Path("frontend/dist"),
    Path("dist"),
]
dist_dir = next((p for p in dist_candidates if p.is_dir() and (p / "index.html").is_file()), None)

if dist_dir:
    assets_dir = dist_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    models_dir = dist_dir / "models"
    if models_dir.is_dir():
        app.mount("/models", StaticFiles(directory=str(models_dir)), name="models")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        target = dist_dir / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(dist_dir / "index.html")

