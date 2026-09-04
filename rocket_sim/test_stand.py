from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List

from .atmosphere import SEA_LEVEL_PRESSURE_PA
from .engine import SolidMotor

_MOTOR_CLASS_LETTERS = "ABCDEFGHIJKLMNOP"


@dataclass
class StandFirePoint:
    time_s: float
    web_burned_m: float
    burning_area_m2: float
    chamber_pressure_pa: float
    thrust_n: float
    mass_flow_kg_s: float
    propellant_mass_kg: float
    klemmung: float


def run_test_stand(
    motor: SolidMotor, dt_s: float = 0.001, ambient_pressure_pa: float = SEA_LEVEL_PRESSURE_PA
) -> List[StandFirePoint]:
    """Fire the motor on a static stand at fixed (sea-level) ambient pressure."""
    t = 0.0
    w = 0.0
    web_max = motor.grain.web_max_m()
    points: List[StandFirePoint] = []

    while w < web_max:
        state = motor.state_at_web(w, ambient_pressure_pa)
        points.append(
            StandFirePoint(
                t, w, state.burning_area_m2, state.chamber_pressure_pa,
                state.thrust_n, state.mass_flow_kg_s, state.propellant_mass_kg, state.klemmung,
            )
        )
        if state.chamber_pressure_pa <= 0.0:
            break
        r = motor.propellant.burn_rate_m_s(state.chamber_pressure_pa)
        w += r * dt_s
        t += dt_s

    points.append(StandFirePoint(t, web_max, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0))
    return points


def classify_motor(total_impulse_ns: float) -> str:
    """NAR-style motor letter class: 'A' covers 1.25-2.5 Ns, doubling per letter."""
    if total_impulse_ns <= 0:
        return "N/A"
    index = max(0, min(math.floor(math.log2(total_impulse_ns / 1.25)), len(_MOTOR_CLASS_LETTERS) - 1))
    return _MOTOR_CLASS_LETTERS[index]


def summarize(points: List[StandFirePoint]) -> Dict[str, object]:
    if len(points) < 2:
        return {}
    dt = points[1].time_s - points[0].time_s
    total_impulse = sum(p.thrust_n for p in points[:-1]) * dt
    burn_time = points[-1].time_s
    propellant_mass_initial = points[0].propellant_mass_kg

    return {
        "total_impulse_ns": total_impulse,
        "burn_time_s": burn_time,
        "avg_thrust_n": total_impulse / burn_time if burn_time > 0 else 0.0,
        "peak_thrust_n": max(p.thrust_n for p in points),
        "peak_chamber_pressure_pa": max(p.chamber_pressure_pa for p in points),
        "peak_klemmung": max(p.klemmung for p in points),
        "propellant_mass_initial_kg": propellant_mass_initial,
        "isp_s": total_impulse / (propellant_mass_initial * 9.80665) if propellant_mass_initial > 0 else 0.0,
        "motor_class": classify_motor(total_impulse),
    }
