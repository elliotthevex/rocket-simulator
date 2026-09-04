from rocket_sim.flight_sim import simulate_flight


def test_flight_reaches_apogee_above_burnout_altitude(vehicle):
    points = simulate_flight(vehicle, dt_s=0.005, max_time_s=120.0)

    burnout = next(p for p in points if p.phase != "burn")
    apogee = max(points, key=lambda p: p.altitude_m)

    assert apogee.altitude_m > burnout.altitude_m > 0


def test_flight_lands_back_near_the_ground(vehicle):
    points = simulate_flight(vehicle, dt_s=0.005, max_time_s=120.0)

    assert points[-1].altitude_m < 1.0
    assert points[-1].time_s < 120.0
    assert any(p.phase == "descent" for p in points)


def test_parachute_slows_descent_compared_to_freefall(vehicle):
    points = simulate_flight(vehicle, dt_s=0.005, max_time_s=120.0)
    landing_speed = abs(points[-1].velocity_m_s)

    assert landing_speed < 30.0
