from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class BatesGrain:
    """A BATES-style cylindrical propellant grain.

    Each segment burns radially outward from a central core and, unless
    inhibited, axially inward from both end faces. Multiple segments are
    treated as identical and burning independently (their web thickness is
    the same at every instant), which holds as long as they are all cast
    from the same propellant and geometry.
    """

    outer_diameter_m: float
    core_diameter_m: float
    segment_length_m: float
    num_segments: int = 1
    burn_ends: bool = True

    def web_max_m(self) -> float:
        radial = (self.outer_diameter_m - self.core_diameter_m) / 2.0
        axial = (self.segment_length_m / 2.0) if self.burn_ends else float("inf")
        return min(radial, axial)

    def is_burned_out(self, web_burned_m: float) -> bool:
        return web_burned_m >= self.web_max_m()

    def burning_area_m2(self, web_burned_m: float) -> float:
        if self.is_burned_out(web_burned_m):
            return 0.0
        core_d = self.core_diameter_m + 2 * web_burned_m
        length = self.segment_length_m - (2 * web_burned_m if self.burn_ends else 0.0)
        lateral = math.pi * core_d * length
        ends = 0.0
        if self.burn_ends:
            ends = 2 * (math.pi / 4) * (self.outer_diameter_m ** 2 - core_d ** 2)
        return self.num_segments * (lateral + ends)

    def propellant_volume_m3(self, web_burned_m: float) -> float:
        if self.is_burned_out(web_burned_m):
            return 0.0
        core_d = self.core_diameter_m + 2 * web_burned_m
        length = max(self.segment_length_m - (2 * web_burned_m if self.burn_ends else 0.0), 0.0)
        area = (math.pi / 4) * (self.outer_diameter_m ** 2 - core_d ** 2)
        return self.num_segments * area * length
