import pytest

from rocket_sim.engine import SolidMotor
from rocket_sim.grain import BatesGrain
from rocket_sim.nozzle import Nozzle
from rocket_sim.propellant import Propellant
from rocket_sim.vehicle import Parachute, Vehicle


@pytest.fixture
def motor() -> SolidMotor:
    propellant = Propellant(
        name="test",
        density_kg_m3=1750,
        burn_rate_coeff_a=3.63e-5,
        burn_rate_exponent_n=0.35,
        c_star_m_s=1500,
        specific_heat_ratio_k=1.2,
    )
    grain = BatesGrain(outer_diameter_m=0.038, core_diameter_m=0.012, segment_length_m=0.04, num_segments=3)
    nozzle = Nozzle(throat_diameter_m=0.009, exit_diameter_m=0.027, efficiency=0.92)
    return SolidMotor(name="test-motor", propellant=propellant, grain=grain, nozzle=nozzle)


@pytest.fixture
def vehicle(motor) -> Vehicle:
    return Vehicle(
        name="test-vehicle",
        dry_mass_kg=2.5,
        diameter_m=0.041,
        drag_coefficient=0.5,
        engine=motor,
        num_engines=1,
        parachute=Parachute(diameter_m=0.6, drag_coefficient=1.5),
    )
