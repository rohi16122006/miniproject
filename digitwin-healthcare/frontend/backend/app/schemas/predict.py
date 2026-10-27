from typing import List
from pydantic import BaseModel, Field, model_validator


class ForecastRequest(BaseModel):
    """Most recent vitals sampled every 10 s, oldest first (30 samples = 5 min)."""
    sbp: List[float] = Field(..., min_length=30, max_length=30)
    dbp: List[float] = Field(..., min_length=30, max_length=30)
    hr: List[float] = Field(..., min_length=30, max_length=30)
    drug_rate: List[float] = Field(default_factory=lambda: [0.0] * 30, min_length=30, max_length=30)

    @model_validator(mode="after")
    def plausible(self):
        if not all(40 <= v <= 300 for v in self.sbp + self.dbp):
            raise ValueError("BP values must be between 40 and 300 mmHg")
        if not all(20 <= v <= 250 for v in self.hr):
            raise ValueError("HR values must be between 20 and 250 bpm")
        return self


class ForecastResponse(BaseModel):
    horizon_s: int
    sbp: float
    dbp: float
    hr: float
    persistence: dict
    model_version: str
