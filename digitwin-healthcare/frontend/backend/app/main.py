from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import history, predict, simulate

app = FastAPI(title="DigiTwin API", version="0.2")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(simulate.router)
app.include_router(history.router)
app.include_router(predict.router)


@app.get("/health")
def health():
    from .ml.predict import available
    return {"status": "ok", "version": app.version, "ml_model_loaded": available()}
