"""Demographic seeding: prior R and C from age / sex / ancestry.

Used when no measured BP is supplied. When SBP/DBP are given, the solver
calibrates R and C directly instead (measured data beats priors).

!! SOUTH_ASIAN_* factors are PLACEHOLDERS. Derive real offsets from NFHS-5 /
!! NCD-RisC / literature and cite them.
"""
SOUTH_ASIAN_C_FACTOR = 0.95   # lower arterial compliance (placeholder)
SOUTH_ASIAN_R_FACTOR = 1.04   # higher vascular resistance (placeholder)


def seed_priors(age: float, sex: str, south_asian: bool = True):
    C = max(0.6, 1.8 - 0.012 * (age - 30))
    R = 1.05 + 0.004 * max(age - 30, 0)
    if sex.lower().startswith("f"):
        C *= 0.92
    if south_asian:
        C *= SOUTH_ASIAN_C_FACTOR
        R *= SOUTH_ASIAN_R_FACTOR
    return R, C
