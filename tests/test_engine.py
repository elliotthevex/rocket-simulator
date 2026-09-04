import math

from rocket_sim.nozzle import Nozzle, solve_exit_mach
from rocket_sim.test_stand import run_test_stand, summarize


def test_exit_mach_is_supersonic_and_satisfies_area_mach_relation():
    nozzle = Nozzle(throat_diameter_m=0.009, exit_diameter_m=0.027)
    k = 1.2
    mach = solve_exit_mach(nozzle.area_ratio, k)
    assert mach > 1.0

    area_ratio_check = (1.0 / mach) * (
        (2.0 / (k + 1.0)) * (1.0 + (k - 1.0) / 2.0 * mach ** 2)
    ) ** ((k + 1.0) / (2.0 * (k - 1.0)))
    assert math.isclose(area_ratio_check, nozzle.area_ratio, rel_tol=1e-3)


def test_chamber_pressure_increases_with_burning_area(motor):
    pc_small = motor.chamber_pressure_pa(0.005)
    pc_large = motor.chamber_pressure_pa(0.02)
    assert pc_large > pc_small > 0


def test_motor_burns_out_and_conserves_propellant_mass(motor):
    points = run_test_stand(motor, dt_s=0.0005)

    assert math.isclose(points[0].propellant_mass_kg, motor.propellant_mass_initial_kg(), rel_tol=1e-6)
    assert points[-1].propellant_mass_kg == 0.0
    assert points[-1].thrust_n == 0.0

    summary = summarize(points)
    assert summary["total_impulse_ns"] > 0
    assert summary["isp_s"] > 0
    assert summary["burn_time_s"] > 0
    assert summary["motor_class"] != "N/A"
