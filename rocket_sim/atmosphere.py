from __future__ import annotations

import math

SEA_LEVEL_DENSITY_KG_M3 = 1.225
SEA_LEVEL_PRESSURE_PA = 101325.0
SCALE_HEIGHT_M = 8500.0
GRAVITY_M_S2 = 9.80665


def air_density_kg_m3(altitude_m: float) -> float:
    return SEA_LEVEL_DENSITY_KG_M3 * math.exp(-max(altitude_m, 0.0) / SCALE_HEIGHT_M)


def ambient_pressure_pa(altitude_m: float) -> float:
    return SEA_LEVEL_PRESSURE_PA * math.exp(-max(altitude_m, 0.0) / SCALE_HEIGHT_M)
