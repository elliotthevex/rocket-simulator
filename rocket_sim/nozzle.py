from __future__ import annotations

import math
from dataclasses import dataclass


def _area_ratio_from_mach(mach: float, k: float) -> float:
    return (1.0 / mach) * (
        (2.0 / (k + 1.0)) * (1.0 + (k - 1.0) / 2.0 * mach ** 2)
    ) ** ((k + 1.0) / (2.0 * (k - 1.0)))


def solve_exit_mach(area_ratio: float, k: float) -> float:
    """Supersonic root of the isentropic area-Mach relation, via bisection.

    area_ratio(Mach) is monotonically increasing on the supersonic branch
    (Mach > 1), so a plain bisection is robust without needing a solver
    dependency.
    """
    lo, hi = 1.0 + 1e-6, 15.0
    if area_ratio <= _area_ratio_from_mach(lo, k):
        return lo
    for _ in range(100):
        mid = (lo + hi) / 2.0
        if _area_ratio_from_mach(mid, k) < area_ratio:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


@dataclass(frozen=True)
class Nozzle:
    throat_diameter_m: float
    exit_diameter_m: float
    efficiency: float = 0.95

    @property
    def throat_area_m2(self) -> float:
        return math.pi / 4 * self.throat_diameter_m ** 2

    @property
    def exit_area_m2(self) -> float:
        return math.pi / 4 * self.exit_diameter_m ** 2

    @property
    def area_ratio(self) -> float:
        return self.exit_area_m2 / self.throat_area_m2
