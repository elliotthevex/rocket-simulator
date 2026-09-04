from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Propellant:
    """Solid propellant properties for Saint Robert's burn-rate law: r = a * Pc**n.

    burn_rate_coeff_a is in SI units (m/s per Pa**n) so that chamber_pressure_pa
    can be passed in directly in Pascals -- this differs from most published
    hobby-rocketry burn-rate tables, which quote 'a' for Pc in MPa or psi.
    """

    name: str
    density_kg_m3: float
    burn_rate_coeff_a: float
    burn_rate_exponent_n: float
    c_star_m_s: float
    specific_heat_ratio_k: float

    def burn_rate_m_s(self, chamber_pressure_pa: float) -> float:
        if chamber_pressure_pa <= 0.0:
            return 0.0
        return self.burn_rate_coeff_a * chamber_pressure_pa ** self.burn_rate_exponent_n
