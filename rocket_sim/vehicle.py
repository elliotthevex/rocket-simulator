from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from .engine import SolidMotor


@dataclass(frozen=True)
class Parachute:
    diameter_m: float
    drag_coefficient: float = 1.5

    @property
    def reference_area_m2(self) -> float:
        return math.pi / 4 * self.diameter_m ** 2


@dataclass
class Vehicle:
    name: str
    dry_mass_kg: float
    diameter_m: float
    drag_coefficient: float
    engine: SolidMotor
    num_engines: int = 1
    parachute: Optional[Parachute] = None

    @property
    def reference_area_m2(self) -> float:
        return math.pi / 4 * self.diameter_m ** 2

    def propellant_mass_initial_kg(self) -> float:
        return self.num_engines * self.engine.propellant_mass_initial_kg()
