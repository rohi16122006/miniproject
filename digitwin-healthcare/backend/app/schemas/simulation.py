from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class Patient(BaseModel):
    name: Optional[str] = Field("Anonymous Patient", description="patient name")
    patient_id: Optional[str] = Field("PT-001", description="patient identifier / MRN")
    age: float = Field(55, ge=18, le=100)
    sex: str = Field("male", pattern="^(male|female)$")
    hr: float = Field(75, ge=40, le=160, description="resting heart rate, bpm")
    ef: float = Field(0.55, ge=0.15, le=0.80, description="ejection fraction, 0-1")
    sbp: Optional[float] = Field(150, ge=70, le=260)
    dbp: Optional[float] = Field(95, ge=40, le=160)
    edv_ml: float = Field(120, ge=60, le=250)
    south_asian_seeding: bool = True


class Regimen(BaseModel):
    model_config = ConfigDict(extra="forbid")

    drug: str
    dose_mg: float = Field(..., gt=0, le=1000)
    interval_h: float = Field(24, gt=0, le=168)
    n_doses: int = Field(1, ge=1, le=30)


class SimRequest(BaseModel):
    patient: Patient = Patient()
    regimen: List[Regimen] = []
    horizon_h: float = Field(24, gt=0, le=240)
    n_points: int = Field(25, ge=5, le=100)
