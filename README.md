# rocket-sim

> **Browser game (in progress):** open `web/game.html` over a static server
> (`python3 -m http.server 8765 --directory web`, then http://localhost:8765/game.html).
> The spec is `design/requirements.md`; the current state of the code is in
> `design/architecture-analysis.md`; the phased plan is `design/build-plan.md`.
> Browser physics tests run headlessly on macOS JavaScriptCore with
> `sh tests/js/run.sh` (no Node needed). `web/index.html` is the original
> Static Fire Bench (engine test stand).


A rocket simulator that prioritizes the **engine**: a solid rocket motor's
internal combustion and nozzle physics are modeled in detail, and the flight
dynamics around it are kept intentionally simple.

Two modes, both driven by the same engine model:

- **test-stand** — fires the motor in place (no flight) and reports its
  thrust curve, chamber pressure, mass flow, total impulse, and Isp.
- **launch** — takes an engine that passed the test stand, bolts it to a
  vehicle, and simulates the whole flight: ascent, burnout, coast to apogee,
  parachute descent, and landing.

## Install

```bash
cd rocket-sim
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Usage

```bash
# Test-fire the example motor and see its thrust/pressure curves
rocket-sim test-stand --engine configs/engine_example.json --plot

# Once you're happy with the motor, fly it
rocket-sim launch --vehicle configs/vehicle_example.json --plot
```

Both commands accept `--csv out.csv` to dump the full time series, and
`--plot path.png` to save a plot instead of opening a window. Run
`rocket-sim test-stand --help` / `launch --help` for all options.

Run the tests with:

```bash
pytest
```

## The engine model

The motor is a BATES-style solid propellant grain (one or more cylindrical
segments, burning radially outward from a central core and axially inward
from both ends) feeding a convergent-divergent nozzle. See
[rocket_sim/grain.py](rocket_sim/grain.py), [rocket_sim/engine.py](rocket_sim/engine.py),
and [rocket_sim/nozzle.py](rocket_sim/nozzle.py).

1. **Burn rate** follows Saint Robert's law, `r = a * Pc^n` (propellant
   regresses faster at higher chamber pressure).
2. **Chamber pressure** is solved from the quasi-steady mass balance between
   propellant burning off the grain surface and gas leaving through the
   throat: `Pc = (Ab * a * rho_p * c*) / At) ^ (1 / (1 - n))`. This assumes
   the ignition transient is instantaneous, which is the model's main
   simplification.
3. **Thrust** comes from the nozzle's thrust coefficient `Cf`, computed from
   the isentropic area-Mach relation (solved by bisection for the exit Mach
   number) plus the pressure-thrust term `(Pe - Pa) * Ae/At`. Because `Pa`
   (ambient pressure) is evaluated at the rocket's *current altitude* during
   flight, thrust increases slightly as the rocket climbs — a real effect of
   nozzle expansion, not just an artifact.
4. Every other engine quantity (mass flow, propellant mass remaining,
   Klemmung `Ab/At`, total impulse, Isp, NAR motor class) is derived from the
   above.

The example propellant/motor numbers in `configs/engine_example.json` are
illustrative (chosen to give a plausible ~2.9 MPa chamber pressure and ~mid-power
hobby-motor thrust), not a real certified motor — don't use them for actual
motor design.

## The flight model

Deliberately simple 1-D vertical trajectory (no pitch, no orbital mechanics),
integrated with 4th-order Runge-Kutta in [rocket_sim/flight_sim.py](rocket_sim/flight_sim.py):

- Constant gravity (`g = 9.80665 m/s^2`).
- Exponential atmosphere for air density and ambient pressure
  (`rho(h) = rho0 * exp(-h / 8500m)`), same for pressure.
- Quadratic drag, `F = 1/2 * rho * v^2 * Cd * A`, using the vehicle's
  reference area while under thrust/coasting and the parachute's reference
  area after apogee.
- Vehicle mass decreases in lock-step with the engine's mass flow during the
  burn, then stays constant.

`rocket-sim launch` also prints the liftoff thrust-to-weight ratio before
simulating, since a motor that can't clear TWR > 1 will just sit on the pad.

## Config files

`configs/engine_example.json` defines a motor: `propellant`, `grain`
(BATES geometry), and `nozzle`. `configs/vehicle_example.json` references an
engine config by relative path and adds `dry_mass_kg`, `diameter_m` (for drag
reference area), `drag_coefficient`, `num_engines`, and an optional
`parachute`. Copy either file and tweak the numbers to design your own
motor/rocket.
