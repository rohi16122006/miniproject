"""Lumped 0D arterial model: 3-element Windkessel (R-C-Rc) with half-sine aortic inflow.

Citations:
- Westerhof N, Elzinga G, Sipkema P. An artificial arterial system for pumping hearts.
  J Appl Physiol. 1971;31(5):776-781. (3-element Windkessel formulation)
- Stergiopulos N, Meister JJ, Westerhof N. Evaluation of methods for estimation of
  total arterial compliance. Am J Physiol. 1995;268(4):H1540-8. (aortic inflow waveform)
- Weissler AM, Harris WS, Schoenfeld CD. Systolic time intervals in heart failure in man.
  Circulation. 1968;37(2):149-159. (ejection duration relation ts = 0.35 * sqrt(60/HR))

Units: pressure mmHg, volume ml, time s, R in mmHg*s/ml, C in ml/mmHg, flow ml/s.

State variable: Pc(t), pressure across arterial compliance C.
    dPc/dt = (Q(t) - Pc/R) / C
Aortic root pressure:
    Pa(t) = Pc(t) + Rc * Q(t)

Periodic steady state is solved in closed form from one ODE integration over systole
(linear superposition) coupled with exponential diastolic runoff.
"""
from dataclasses import dataclass

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import least_squares

RC_DEFAULT = 0.05  # characteristic impedance, mmHg*s/ml


@dataclass
class BeatResult:
    sbp: float
    dbp: float
    map: float
    co_lpm: float


def ejection_time(hr: float) -> float:
    """Systolic ejection duration (s); shortens as heart rate rises."""
    return 0.35 * (60.0 / hr) ** 0.5


def _systole(R, C, qmax, ts, x0):
    a = 1.0 / (R * C)
    w = np.pi / ts
    rhs = lambda t, x: -a * x + qmax * np.sin(w * t) / C
    return solve_ivp(rhs, (0, ts), [x0], method="RK45", rtol=1e-6, atol=1e-8,
                     dense_output=True)


def simulate_beat(R, C, hr, sv, Rc=RC_DEFAULT) -> BeatResult:
    """Periodic steady-state SBP/DBP/MAP for one set of parameters."""
    T = 60.0 / hr
    ts = ejection_time(hr)
    qmax = np.pi * sv / (2.0 * ts)  # half-sine with area = stroke volume
    a = 1.0 / (R * C)

    k_s = _systole(R, C, qmax, ts, 0.0).y[0, -1]
    x0 = k_s * np.exp(-a * (T - ts)) / (1.0 - np.exp(-a * T))  # diastolic pressure

    sol = _systole(R, C, qmax, ts, x0)
    t = np.linspace(0, ts, 60)
    pa = sol.sol(t)[0] + Rc * qmax * np.sin(np.pi * t / ts)
    sbp, dbp = float(pa.max()), float(x0)
    mean_p = (hr * sv / 60.0) * (R + Rc)  # exact mean pressure from flow conservation
    return BeatResult(sbp, dbp, float(mean_p), hr * sv / 1000.0)


def calibrate(sbp, dbp, hr, sv, Rc=RC_DEFAULT):
    """Personalise R and C so the model reproduces the patient's measured SBP/DBP.

    Initial guess from mean-flow conservation (MAP = CO * (R + Rc)), then a
    2-parameter least-squares fit on (SBP, DBP).
    """
    map_t = dbp + (sbp - dbp) / 3.0
    R_guess = max(map_t / (hr * sv / 60.0) - Rc, 0.3)

    def resid(x):
        b = simulate_beat(np.exp(x[0]), np.exp(x[1]), hr, sv, Rc)
        return [b.sbp - sbp, b.dbp - dbp]

    fit = least_squares(resid, np.log([R_guess, 1.5]),
                        bounds=(np.log([0.2, 0.05]), np.log([5.0, 20.0])), xtol=1e-8)
    return float(np.exp(fit.x[0])), float(np.exp(fit.x[1]))
