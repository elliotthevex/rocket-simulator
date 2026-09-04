from __future__ import annotations

import argparse
import csv
import json
from dataclasses import asdict, fields
from pathlib import Path

from .atmosphere import GRAVITY_M_S2, SEA_LEVEL_PRESSURE_PA
from .engine import SolidMotor
from .flight_sim import simulate_flight
from .grain import BatesGrain
from .nozzle import Nozzle
from .propellant import Propellant
from .test_stand import run_test_stand, summarize
from .vehicle import Parachute, Vehicle


def load_engine(path: Path) -> SolidMotor:
    data = json.loads(path.read_text())
    return SolidMotor(
        name=data["name"],
        propellant=Propellant(**data["propellant"]),
        grain=BatesGrain(**data["grain"]),
        nozzle=Nozzle(**data["nozzle"]),
    )


def load_vehicle(path: Path) -> Vehicle:
    data = json.loads(path.read_text())
    engine = load_engine(path.parent / data["engine_config"])
    parachute = Parachute(**data["parachute"]) if data.get("parachute") else None
    return Vehicle(
        name=data["name"],
        dry_mass_kg=data["dry_mass_kg"],
        diameter_m=data["diameter_m"],
        drag_coefficient=data["drag_coefficient"],
        engine=engine,
        num_engines=data.get("num_engines", 1),
        parachute=parachute,
    )


def _write_csv(path: str, points) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[fld.name for fld in fields(points[0])])
        writer.writeheader()
        for p in points:
            writer.writerow(asdict(p))


def cmd_test_stand(args: argparse.Namespace) -> None:
    motor = load_engine(Path(args.engine))
    points = run_test_stand(motor, dt_s=args.dt)
    summary = summarize(points)

    print(f"Motor: {motor.name}")
    for key, value in summary.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.4g}")
        else:
            print(f"  {key}: {value}")

    if args.csv:
        _write_csv(args.csv, points)
        print(f"Wrote {len(points)} rows to {args.csv}")
    if args.plot:
        from .plotting import plot_test_stand

        plot_test_stand(points, save_path=None if args.plot == "show" else args.plot)


def cmd_launch(args: argparse.Namespace) -> None:
    vehicle = load_vehicle(Path(args.vehicle))

    state0 = vehicle.engine.state_at_web(0.0, SEA_LEVEL_PRESSURE_PA)
    liftoff_mass = vehicle.dry_mass_kg + vehicle.num_engines * state0.propellant_mass_kg
    liftoff_thrust = vehicle.num_engines * state0.thrust_n
    twr = liftoff_thrust / (liftoff_mass * GRAVITY_M_S2)

    print(f"Vehicle: {vehicle.name}")
    print(f"  Liftoff thrust-to-weight ratio: {twr:.2f}")
    if twr <= 1.0:
        print("  WARNING: thrust-to-weight <= 1.0 -- the rocket will not lift off.")

    points = simulate_flight(vehicle, dt_s=args.dt, max_time_s=args.max_time)

    burnout = next((p for p in points if p.phase != "burn"), points[-1])
    apogee = max(points, key=lambda p: p.altitude_m)
    max_v = max(p.velocity_m_s for p in points)
    max_accel_g = max(p.acceleration_m_s2 for p in points) / GRAVITY_M_S2

    print(f"  Burnout:  t={burnout.time_s:6.2f}s  alt={burnout.altitude_m:8.1f}m  v={burnout.velocity_m_s:7.1f}m/s")
    print(f"  Apogee:   t={apogee.time_s:6.2f}s  alt={apogee.altitude_m:8.1f}m")
    print(f"  Max velocity: {max_v:.1f} m/s   Max acceleration: {max_accel_g:.1f} g")
    print(f"  Landing:  t={points[-1].time_s:6.2f}s  v={points[-1].velocity_m_s:7.1f} m/s")

    if args.csv:
        _write_csv(args.csv, points)
        print(f"Wrote {len(points)} rows to {args.csv}")
    if args.plot:
        from .plotting import plot_flight

        plot_flight(points, save_path=None if args.plot == "show" else args.plot)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rocket-sim", description="Combustion-focused solid rocket motor and flight simulator."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    ts = sub.add_parser("test-stand", help="Fire the engine on a static test stand.")
    ts.add_argument("--engine", required=True, help="Path to an engine config JSON file.")
    ts.add_argument("--dt", type=float, default=0.001, help="Integration time step in seconds.")
    ts.add_argument("--csv", help="Write the time series to this CSV path.")
    ts.add_argument("--plot", nargs="?", const="show", help="Show a plot, or save it to the given path.")
    ts.set_defaults(func=cmd_test_stand)

    launch = sub.add_parser("launch", help="Simulate ascent, burnout, coast, and descent.")
    launch.add_argument("--vehicle", required=True, help="Path to a vehicle config JSON file.")
    launch.add_argument("--dt", type=float, default=0.01, help="Integration time step in seconds.")
    launch.add_argument("--max-time", type=float, default=600.0, dest="max_time", help="Max flight time in seconds.")
    launch.add_argument("--csv", help="Write the time series to this CSV path.")
    launch.add_argument("--plot", nargs="?", const="show", help="Show a plot, or save it to the given path.")
    launch.set_defaults(func=cmd_launch)

    return parser


def main(argv=None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
