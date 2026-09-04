from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

from .atmosphere import GRAVITY_M_S2, air_density_kg_m3, ambient_pressure_pa
from .vehicle import Vehicle


@dataclass
class FlightPoint:
    time_s: float
    altitude_m: float
    velocity_m_s: float
    acceleration_m_s2: float
    thrust_n: float
    mass_kg: float
    phase: str


def _drag_force_n(velocity_m_s: float, altitude_m: float, cd: float, area_m2: float) -> float:
    rho = air_density_kg_m3(altitude_m)
    sign = 1.0 if velocity_m_s >= 0 else -1.0
    return sign * 0.5 * rho * velocity_m_s ** 2 * cd * area_m2


def _derivative(
    h: float, v: float, w: float, vehicle: Vehicle, apogee_reached: bool
) -> Tuple[float, float, float, float, float]:
    engine = vehicle.engine
    pa = ambient_pressure_pa(h)

    if not engine.is_burned_out(w):
        motor_state = engine.state_at_web(w, pa)
        thrust = vehicle.num_engines * motor_state.thrust_n
        dw = engine.propellant.burn_rate_m_s(motor_state.chamber_pressure_pa)
        propellant_mass = vehicle.num_engines * motor_state.propellant_mass_kg
    else:
        thrust, dw, propellant_mass = 0.0, 0.0, 0.0

    mass = vehicle.dry_mass_kg + propellant_mass

    if v < 0.0 and apogee_reached and vehicle.parachute is not None:
        cd, area = vehicle.parachute.drag_coefficient, vehicle.parachute.reference_area_m2
    else:
        cd, area = vehicle.drag_coefficient, vehicle.reference_area_m2

    drag = _drag_force_n(v, h, cd, area)
    accel = (thrust - drag - mass * GRAVITY_M_S2) / mass

    return v, accel, dw, thrust, mass


def simulate_flight(vehicle: Vehicle, dt_s: float = 0.01, max_time_s: float = 600.0) -> List[FlightPoint]:
    web_max = vehicle.engine.grain.web_max_m()
    t, h, v, w = 0.0, 0.0, 0.0, 0.0
    apogee_reached = False
    points: List[FlightPoint] = []

    while t <= max_time_s:
        dh, dv, dw, thrust, mass = _derivative(h, v, w, vehicle, apogee_reached)
        burned_out = vehicle.engine.is_burned_out(w)
        phase = "burn" if not burned_out else ("descent" if apogee_reached else "coast")
        points.append(FlightPoint(t, h, v, dv, thrust, mass, phase))

        if t > 0.0 and h <= 0.0 and v <= 0.0:
            break

        k1 = (dh, dv, dw)
        k2 = _derivative(h + k1[0] * dt_s / 2, v + k1[1] * dt_s / 2, w + k1[2] * dt_s / 2, vehicle, apogee_reached)[:3]
        k3 = _derivative(h + k2[0] * dt_s / 2, v + k2[1] * dt_s / 2, w + k2[2] * dt_s / 2, vehicle, apogee_reached)[:3]
        k4 = _derivative(h + k3[0] * dt_s, v + k3[1] * dt_s, w + k3[2] * dt_s, vehicle, apogee_reached)[:3]

        h_next = h + (dt_s / 6.0) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        v_next = v + (dt_s / 6.0) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
        w_next = w + (dt_s / 6.0) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])

        if not apogee_reached and v_next < 0.0 <= v:
            apogee_reached = True

        w = max(0.0, min(w_next, web_max))
        h = max(h_next, 0.0)
        v = v_next
        t += dt_s

    return points
