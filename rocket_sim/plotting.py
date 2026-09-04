from __future__ import annotations

from typing import List, Optional

import matplotlib.pyplot as plt

from .flight_sim import FlightPoint
from .test_stand import StandFirePoint


def plot_test_stand(points: List[StandFirePoint], save_path: Optional[str] = None) -> None:
    times = [p.time_s for p in points]
    fig, axes = plt.subplots(3, 1, sharex=True, figsize=(8, 9))

    axes[0].plot(times, [p.thrust_n for p in points], color="tab:red")
    axes[0].set_ylabel("Thrust (N)")
    axes[0].set_title("Engine Test Stand")

    axes[1].plot(times, [p.chamber_pressure_pa / 1e6 for p in points], color="tab:blue")
    axes[1].set_ylabel("Chamber Pressure (MPa)")

    axes[2].plot(times, [p.propellant_mass_kg for p in points], color="tab:green")
    axes[2].set_ylabel("Propellant Mass (kg)")
    axes[2].set_xlabel("Time (s)")

    fig.tight_layout()
    _finish(fig, save_path)


def plot_flight(points: List[FlightPoint], save_path: Optional[str] = None) -> None:
    times = [p.time_s for p in points]
    fig, axes = plt.subplots(3, 1, sharex=True, figsize=(8, 9))

    axes[0].plot(times, [p.altitude_m for p in points], color="tab:purple")
    axes[0].set_ylabel("Altitude (m)")
    axes[0].set_title("Flight Profile")

    axes[1].plot(times, [p.velocity_m_s for p in points], color="tab:orange")
    axes[1].set_ylabel("Velocity (m/s)")

    axes[2].plot(times, [p.thrust_n for p in points], color="tab:red")
    axes[2].set_ylabel("Thrust (N)")
    axes[2].set_xlabel("Time (s)")

    fig.tight_layout()
    _finish(fig, save_path)


def _finish(fig, save_path: Optional[str]) -> None:
    if save_path:
        fig.savefig(save_path, dpi=150)
        plt.close(fig)
    else:
        plt.show()
