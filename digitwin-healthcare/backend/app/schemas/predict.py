import math
import re
from datetime import datetime, timedelta, timezone
from typing import List, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ForecastRequest(BaseModel):
    """Thirty aligned, timestamped observations sampled every 10 seconds."""
    timestamps: List[str] = Field(..., min_length=30, max_length=30)
    sbp: List[float] = Field(..., min_length=30, max_length=30)
    dbp: List[float] = Field(..., min_length=30, max_length=30)
    hr: List[float] = Field(..., min_length=30, max_length=30)
    drug_rate: List[float] = Field(..., min_length=30, max_length=30)
    provenance: Literal["manual_entry", "imported_recording", "synthetic_demo"]

    @field_validator("timestamps")
    @classmethod
    def timestamps_are_iso8601_with_timezone(cls, values):
        pattern = re.compile(
            r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$"
        )
        for timestamp in values:
            if not pattern.fullmatch(timestamp):
                raise ValueError("Timestamps must be ISO 8601 and include a timezone")
            try:
                parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError(f"Invalid timestamp: {timestamp}") from error
            if parsed.utcoffset() is None:
                raise ValueError("Timestamps must include a timezone")
        return values

    @model_validator(mode="after")
    def plausible(self):
        if len({len(self.timestamps), len(self.sbp), len(self.dbp), len(self.hr), len(self.drug_rate)}) != 1:
            raise ValueError("Timestamps and all measurement arrays must have matching lengths")
        parsed_timestamps = [
            datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            for timestamp in self.timestamps
        ]
        for previous, current in zip(parsed_timestamps, parsed_timestamps[1:]):
            if current - previous != timedelta(seconds=10):
                raise ValueError("Timestamps must be chronological and exactly 10 seconds apart")
        if not all(math.isfinite(v) for v in self.sbp + self.dbp + self.hr + self.drug_rate):
            raise ValueError("Forecast measurements must be finite numbers")
        if not all(40 <= v <= 300 for v in self.sbp + self.dbp):
            raise ValueError("BP values must be between 40 and 300 mmHg")
        if not all(systolic > diastolic for systolic, diastolic in zip(self.sbp, self.dbp)):
            raise ValueError("SBP must be greater than DBP for every sample")
        if not all(20 <= v <= 250 for v in self.hr):
            raise ValueError("HR values must be between 20 and 250 bpm")
        if not all(v >= 0 for v in self.drug_rate):
            raise ValueError("Drug infusion rates must be zero or greater")
        return self


class ForecastResponse(BaseModel):
    horizon_s: int
    sbp: float
    dbp: float
    hr: float
    persistence: dict
    model_version: str
    timestamps: List[str]
    provenance: Literal["manual_entry", "imported_recording", "synthetic_demo"]
    timestamp_basis: str
    predicted_at: str
