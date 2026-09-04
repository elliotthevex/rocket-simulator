from __future__ import annotations

import math
from dataclasses import dataclass

from .grain import BatesGrain
from .nozzle import Nozzle, solve_exit_mach
from .propellant import Propellant


@dataclass
class MotorState:
    web_burned_m: float
    burning_area_m2: float
    chamber_pressure_pa: float
    mass_flow_kg_s: float
    thrust_n: float
    propellant_mass_kg: float
    klemmung: float


@dataclass
class SolidMotor:
    name: str
    propellant: Propellant
    grain: BatesGrain
    nozzle: Nozzle

    def __post_init__(self) -> None:
        self._exit_mach = solve_exit_mach(self.nozzle.area_ratio, self.propellant.specific_heat_ratio_k)

    def chamber_pressure_pa(self, burning_area_m2: float) -> float:
        """Quasi-steady equilibrium pressure.

        Assumes mass generated at the burning surface equals mass leaving
        through the throat at every instant (valid once the initial
        pressurization transient has passed, which we don't model). Derived
        from rho*Ab*r = Pc*At/c* with r = a*Pc**n:

            Pc = (Ab * a * rho_p * c*) / At) ** (1 / (1 - n))
        """
        if burning_area_m2 <= 0.0:
            return 0.0
        p = self.propellant
        base = (
            burning_area_m2
            * p.burn_rate_coeff_a
            * p.density_kg_m3
            * p.c_star_m_s
            / self.nozzle.throat_area_m2
        )
        return base ** (1.0 / (1.0 - p.burn_rate_exponent_n))

    def exit_pressure_pa(self, chamber_pressure_pa: float) -> float:
        k = self.propellant.specific_heat_ratio_k
        m = self._exit_mach
        return chamber_pressure_pa * (1.0 + (k - 1.0) / 2.0 * m ** 2) ** (-k / (k - 1.0))

    def thrust_coefficient(self, chamber_pressure_pa: float, ambient_pressure_pa: float) -> float:
        if chamber_pressure_pa <= 0.0:
            return 0.0
        k = self.propellant.specific_heat_ratio_k
        pe = self.exit_pressure_pa(chamber_pressure_pa)
        momentum_term = math.sqrt(
            (2 * k ** 2 / (k - 1.0))
            * (2.0 / (k + 1.0)) ** ((k + 1.0) / (k - 1.0))
            * (1.0 - (pe / chamber_pressure_pa) ** ((k - 1.0) / k))
        )
        pressure_term = (pe - ambient_pressure_pa) * self.nozzle.area_ratio / chamber_pressure_pa
        return self.nozzle.efficiency * (momentum_term + pressure_term)

    def thrust_n(self, chamber_pressure_pa: float, ambient_pressure_pa: float) -> float:
        cf = self.thrust_coefficient(chamber_pressure_pa, ambient_pressure_pa)
        return cf * self.nozzle.throat_area_m2 * chamber_pressure_pa

    def mass_flow_kg_s(self, chamber_pressure_pa: float) -> float:
        if chamber_pressure_pa <= 0.0:
            return 0.0
        return chamber_pressure_pa * self.nozzle.throat_area_m2 / self.propellant.c_star_m_s

    def state_at_web(self, web_burned_m: float, ambient_pressure_pa: float) -> MotorState:
        ab = self.grain.burning_area_m2(web_burned_m)
        pc = self.chamber_pressure_pa(ab)
        return MotorState(
            web_burned_m=web_burned_m,
            burning_area_m2=ab,
            chamber_pressure_pa=pc,
            mass_flow_kg_s=self.mass_flow_kg_s(pc),
            thrust_n=self.thrust_n(pc, ambient_pressure_pa),
            propellant_mass_kg=self.grain.propellant_volume_m3(web_burned_m) * self.propellant.density_kg_m3,
            klemmung=(ab / self.nozzle.throat_area_m2) if ab > 0 else 0.0,
        )

    def propellant_mass_initial_kg(self) -> float:
        return self.grain.propellant_volume_m3(0.0) * self.propellant.density_kg_m3

    def is_burned_out(self, web_burned_m: float) -> bool:
        return self.grain.is_burned_out(web_burned_m)
