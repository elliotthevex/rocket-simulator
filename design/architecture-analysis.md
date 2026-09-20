# Rocket Simulator — Existing Architecture Analysis

Date: 2026-09-21. Branch `game-build`, HEAD `945c2a0` ("Cut engine thrust when the
tank runs dry; fix bench page charset"). Synthesised from eight subsystem reader
maps (physics, renderer, game, bench, critique, flightspec, uxvis, pyedu) plus a
direct check of the working tree. Every claim below carries a `file:line`
citation from those maps; line numbers are as of HEAD unless noted.

Companion document: `design/build-plan.md` (the phased plan that acts on this
analysis). Spec of record: `design/requirements.md` (R-n sections); detailed
specs: `design/critique.md` (rulings C1-C15, gaps G1-G14, locked data model,
18-step build order) and the five per-topic specs it governs.

---

## 1. Existing Architecture

### 1.1 Entry points

| Entry point | What it is | Loads | Status |
|---|---|---|---|
| `web/game.html` (1342 lines, `<title>Vertical Slice</title>`) | The playable game: one hardcoded RP-1 rocket on a scaled home planet, countdown, straight-up flight, click-to-inspect, engine picker, abstract Mars coast | `js/physics-core.js`, `js/renderer.js`, `js/flight-loop.js` in that order (game.html:218-220), then a 1120-line inline script (game.html:221-1340) | Live development target |
| `web/index.html` (1332 lines, `<title>Static Fire Bench</title>`) | The original hotfire test stand + 1-D launch console | Nothing external: no `<script src>` at all; carries its own inline physics (index.html:383-585) | Legacy, untouched since commit 9a128a8 except a `<meta charset>` fix in 945c2a0; critique G12 (critique.md:60) says it must survive as a builder HOTFIRE sub-mode |
| `tests/js/run.sh` | Headless JS test runner on macOS JavaScriptCore (`jsc`); no Node on this machine | `physics-core.js`, `flight-loop.js`, `tests/js/harness.js`, each `tests/js/test-*.js` | Added in 02e955b; 6/6 tests pass (`test-smoke.js` 4, `test-propulsion.js` 2) |
| `rocket_sim/` + `rocket-sim` CLI (Python) | Solid-motor internal ballistics + 1-D RK4 flight, the original project | matplotlib | Legacy numeric oracle only; `6 passed` under pytest; nothing in `web/` imports it |
| `.claude/launch.json` | `python3 -m http.server 8765 --directory web` | — | Dev server; `index.html` is served as the default page, not the game |

### 1.2 Module map (what each file owns)

**`web/js/physics-core.js` (1058 lines)** — single global `const RSX = {}`
(physics-core.js:22), `module.exports = RSX` at :1058. Strict-SI, planar 3-DOF
(x, y, theta) planet-centred-inertial physics kernel in eleven numbered
sections:

| Lines | Owns | Live in game? |
|---|---|---|
| :4-19 | Conventions header (units, angles, station, mutability) | Contract |
| :27-52 | `wrapPi`, `clamp`, `lerp`, `mulberry32` (seeded PRNG), `tableLookup` | Yes |
| :63-93 | `PLANETS.{home, earth, mars}` — home R 600 km, mu 3.5316e12, wp 2.9089e-4, zAtm 70 km, atmScale 0.5; mars is an exponential CO2 body | Yes (game.html:228, :337, :392) |
| :98-184 | `atmosphere(z, planet) -> {rho, P, T, a}`: US Standard 1976 seven-layer table to 86 km + log-linear table to 140 km, `atmScale` axis compression, smootherstep taper to exactly 0 at zAtm; exponential branch for Mars; `airDensity`/`ambientPressure` delegators | Yes (deriv :452; game.html:499, :518, :633, :1172) |
| :201-296 | Engine model: Saint Robert `burnRate`, BATES `burningArea` with `perimeterFactor` on the lateral term only (:212), `chamberPressure`, `solveExitMach`, `makeMotor`, `peIdeal` (unclamped), `isSeparated` (Summerfield pe < 0.4 pa), `thrustCoefficient` (internal clamp + 0.85 penalty), `thrustN`, `massFlow`, `stateAtWeb`, liquid helpers `motorBurnoutBound`/`motorIsBurnedOut`/`motorInitialState` | `thrustN`, `massFlow`, `peIdeal` (renderer.js:367), `isSeparated` (game.html:1115), `makeMotor` live; the whole solid-grain flight path is dormant |
| :303-333 | `FUEL_PRESETS.{solid, rp1, ch4, lh2}` — physics constants plus UI strings (`name`, `formula`, `dot` holding CSS `var(--series-*)`, `blurb`, `chips`) | Yes (flight-loop.js:18, game.html:975-1123); `ofRatio`, `boiloffRate` have zero readers |
| :335-420 | Aero: `NOSE_CP_FACTOR`, `CA_SLENDER`/`CA_BLUNT` tables, `axialCd`, `compressibilityK`, `massProps(parts) -> {m, s_cm, I}` with aft propellant settling (:371-376), `vehicleAero(veh, mach)` aggregating `veh.aeroContribs` into CNa, CP, static margin, tumble-damping integrals | Yes via `deriv` |
| :434-509 | `deriv(S, veh, ctrl, planet, out)`: inverse-square gravity, co-rotating wind, thrust along body axis rotated by `ctrl.gimbal` at station `veh.sEngine`, gimbal torque, jet damping, Allen-Perkins normal force, wind-axis drag exported as `kDrag` for closed-form application, lift, two-station aero torque, `ctrl.tauRCS` passthrough. Mutates `veh.s_cm` (:442) | Yes (game.html:515, stepVerlet) |
| :521-578 | `stepVerlet` (kick-drift-kick, analytic drag `f = 1/(1+kDrag W dt)` recording `dvDragStep`, analytic rotational damping, `veh.advanceBurn(A1, dt)` then `veh.mp = massProps(veh.parts)` every substep :553-554) and `chooseDt` (adaptive: 1/120 s thrusting/in-atmosphere else 1/60, caps on mass change, rotation, orbital time, `CTRL_WN`) | Yes (game.html:516, :520) |
| :586-613 | `advance()` frame driver: wallDt clamp 0.25 s, 400-substep guard, NaN snapshot/restore, two-strike DESTROYED, `onEvent` hooks (`substepEvent`, `warpDemote`, `destroyed`) | **Dormant** — game.html:506-556 re-implements it inline |
| :622-819 | Kepler block: `stateToElements` (retrograde via `dir`, hyperbolic), `solveKepler`, `elementsToState`, `railsAdvance`, `timeToRadius`, `railsStepCap`, `orbitReadouts`, `classifyOrbit`, `conicPath` | **Dormant** (validated; never called by game.html) |
| :822-844 | `suttonGraves`, `stefanBoltzmann`, `advanceThermal` (lumped capacitance + ablator) | **Dormant** |
| :847-895 | `contactAltitude`, `contactResponse` (penalty spring-damper, Coulomb friction, ground co-rotation, torque about CM) | **Dormant** — game.html:490-492 acknowledges it is not wired |
| :901-1056 | `runValidation()` — 24 checks, 24/24 pass under jsc | Not wired into `tests/js` yet |

**`web/js/renderer.js` (765 lines)** — `RSX.render` (alias `RR`), a stateless
Canvas-2D primitive library with no draw loop. Owns: coherent value noise +
flicker (:13-23); `FUEL_VIS` per-propellant plume/smoke palette (:28-45); Earth
sky keyframes (private, :51-59) and exported `MARS_SKY_KEYFRAMES` (:73-84);
`skyColorsAt` in linear light (:85-93); `buildStarField` (:98-134); camera
`makeCamera`/`targetPpmFor`/`updateCamera`/`applyCamera` (:144-205) — world
frame "+y up, origin at the pad, planet centre at (0,-R)" (:137-138);
`groundGeometry` flat/bezier/disc decision (:210-216); rocket vector art in body
frame origin at nose tip +y aft (`ogivePath`, `bellPath`, `drawBodySegment`,
`drawNoseCone`, `drawFins`, `drawEngineBell`, :225-352); pressure-derived
`drawPlume` reading `RSX.peIdeal` (:363-456); `drawExposure`, `drawIgnitionFlash`
(:467-484); SoA particle pool `makeParticles`/`spawnParticle`/`updateParticles`
(:486-534); puff sprite + tinted cache (:535-555); `drawSmokeParticles`,
`drawGroundGlow`, `drawSparkParticles` (:556-634); `drawLaunchTower` with
retractable arms (:646-763).

**`web/js/flight-loop.js` (118 lines)** — misnamed: contains no loop. Owns
`RSX.testVehicle`: `build()` (one hardcoded nose/probe/tank/mount RP-1 vehicle
with ENG-K1-class nozzle, :16-63), `propAvailable` (new in 945c2a0),
`thrustNow`/`mdotNow` (pc = pcDesign * throttle, gated to 0 on an empty tank),
`advanceBurn` (drains the part named `"tank"`), and a headless fixed-dt
`simulate(planet, throttle, duration, dt)` harness (:86-116) used by the tests.
This file is the **only implementation of the vehicle contract** the kernel
consumes.

**`web/game.html` inline script (game.html:221-1340)** — owns all game state
and orchestration: `planet` binding (:228), `veh` (:244-247), `S`/`ctrl`/`cache`
(:249-251), ignition countdown state machine (:268-271, :472-486), gimbal
attitude-hold controller (:317-334), `resetToPad` (:336-353), Mars
escape/coast/arrival scaffolding (:361-412), particle spawners (:414-466),
`stepPhysics` substep loop with pad pin, NaN guard and stop-at-surface crash rule
(:488-556), pad-local transforms (:572-598), `draw()` layer composition
(:627-806), rAF `frame()` (:814-832), keyboard handler (:835-870), `ENGINE_CATALOG`
(4 engines, :893-898), part copy (:901-969), `previewEngine`/`applyEngine`
(:974-1016), click hit-testing (:1020-1046), part panel + engine drawer
(:1054-1239), QA hooks `RSXTick`/`RSXSetState`/`RSXCommitToMars`/`RSXDEBUG`
(:297-310, :1245-1280), propellant comparison panel (:1290-1340). CSS tokens
(:15-33) are the warm-paper palette with `--stat-*`/`--prop-*` already adopted.

**`web/index.html`** — self-contained IIFE (index.html:377-1330): its own copy
of the engine model (:383-509, diverged: no `perimeterFactor`, no Summerfield
clamp), its own `FUEL_PRESETS` with different constants (:587-606), `FIELD_DEFS`
declarative sliders (:609-702), `runTestStand`/`summarizeTestStand`/`classifyMotor`
(:460-495), 1-D RK4 `simulateFlight` (:542-585), `TraceChart` (:876-983),
replay engine (:1168-1229), live liquid hotfire loop (:1232-1288). Its CSS token
system (:4-42, three blocks: light, media-dark, `[data-theme="dark"]`) is the
canonical pattern the design docs say to keep.

**`tests/js/`** — `harness.js` (`test`, `assert`, `assertApprox`,
`assertBetween`, `runAllTests`), `run.sh` (jsc, loads physics-core + flight-loop
+ harness + each test file; `FAILED` summary -> non-zero exit),
`test-smoke.js`, `test-propulsion.js`.

### 1.3 Load order and namespace

There is no module system. `physics-core.js` creates the script-global `RSX`;
`renderer.js:10` and `flight-loop.js:8` attach to it; game.html's inline script
reads all three. Script order in game.html:218-220 is load-bearing.
`module.exports` at physics-core.js:1058 and renderer.js:765 only works if files
are `require`d in the same order. `tests/js/run.sh` reproduces the order by
listing files explicitly. Any new module must (a) attach to `RSX.<ns>` and (b)
be added to both game.html and `run.sh` in dependency order.

### 1.4 Data flow: physics -> telemetry -> render

One rAF callback per frame (`frame(ts)`, game.html:814-832):

1. `dtWall = min(ts - last, 0.05)`; `simTime += dtWall` (wall-accumulated;
   there is no separate sim clock and `warp = 1` is hardcoded at game.html:511).
2. If `missionPhase === 'coast'`: `updateCoast(dtWall)` (abstract distance
   countdown), else `updateMarsEscapeCheck()`, `updateIgnitionSequence()` (the
   ONLY writer of `ctrl.throttle` during a real ignition; raised-cosine 1.8 s
   ramp after a 6 s countdown), then `stepPhysics(dtWall)`.
3. `stepPhysics` (game.html:488-556): returns if `crashed`; pad-pin while
   thrust <= weight (:497-509); otherwise loops `remaining = min(dtWall, 0.25)`
   in up to 400 substeps: `peek = cache.d || RSX.deriv(...)`,
   `dt = RSX.chooseDt(...)`, `gimbalControl(dt, pa)`, snapshot,
   `RSX.stepVerlet(S, veh, ctrl, planet, dt, cache)`, NaN guard (restore +
   `running = false`, which nothing reads), impact test at alt <= -0.05 m
   (snap to surface, zero velocities, `crashed = true`, message with the
   literal "legs rated ~6 m/s").
4. `spawnPadSmoke(dtWall)`; `RSX.render.updateParticles(particles, dtWall)`
   (particles integrate on wall dt, physics on sim sub-dt).
5. `draw(t, dtWall)` (game.html:627-806): computes alt/speed/pad-local XY,
   `pa`, `q`, `twr` **directly from `S` and `veh`** (there is no TELEM frame);
   `updateCamera` (constant 28 % on-screen vehicle fraction); sky gradient from
   `skyColorsAt`; stars faded by zenith luminance; fixed-screen sun; `applyCamera`;
   flat ground rectangle regardless of `groundGeometry` mode (:686); tower with
   arm attach until T-0; ground glow, smoke, sparks in pad-local frame; icon-mode
   scale clamp (min 36 px); vehicle transform `translate(nose) rotate(th + pi/2)
   scale(iconScale)`; nose/body/fins/bell from `veh.art` literals; plume in a
   gimbal-rotated frame at `sTail + Ln`; ignition flash; exposure; finally
   `#hud.textContent` (three monospace lines).

Consumers of physics output therefore read `S`, `veh`, `ctrl`, `cache.d`
directly. The critique's TELEM/EVENT/SNAPSHOT layer (critique.md:274-343) does
not exist.

### 1.5 State ownership

| State | Owner / shape | Mutated by |
|---|---|---|
| `S = {rx, ry, vx, vy, th, om, t, mode}` | game.html:249; PCI metres, inertial m/s, unwrapped theta CCW from +x, rad/s, s | `RSX.stepVerlet` (in place); also directly by `resetToPad` :338-340, `arriveAtMars` :393-394, pad pin :502-505, crash stop :543-547, `RSXSetState` :1268-1271; every out-of-band write sets `cache.valid = false` |
| `ctrl = {throttle, gimbal, tauRCS, thetaCmd}` | game.html:250 | `updateIgnitionSequence`, `gimbalControl`, keys; `tauRCS` always 0; `thetaCmd` pinned to pi/2 |
| `veh` | `RSX.testVehicle.build()` + bound closures (game.html:244-247); shape in flight-loop.js:34-60 | `stepVerlet` (`veh.mp`), `deriv` (`veh.s_cm`), `applyEngine` (tank/mount/motor/propKey) |
| `cache = {valid, d, tmpA, tmpB}` | game.html:251 | `stepVerlet`; invalidated by callers |
| `planet` | `let planet = RSX.PLANETS.home` (game.html:228) | `arriveAtMars` / `resetToPad` |
| `missionPhase 'home'|'coast'|'mars'`, `crashed`, `running`, countdown fields | game.html:258-290 | inline script |
| `cam`, `particles`, `iconState` | `RR.makeCamera()`, `RR.makeParticles(3200)`, game.html:252-253, :731-748 | `draw()` |
| UI state `openPart`, `currentEngineId`, `selectedEngineId` | game.html:1054-1063 | panel handlers |

### 1.6 Conventions in force

From physics-core.js:4-19 and flight-loop.js:13-14 (and restated in
`build-plan.md` "Coordinate & Unit Conventions"):

- Strict SI in every stored field (m, kg, s, N, Pa, K, rad).
- World frame: planet-centred inertial (PCI), origin at planet centre, pad at
  (0, R) at t = 0, non-rotating; planet rotation enters only through `wp` in
  the wind velocity (deriv :453-454) and the initial `vx = -wp * R`
  (flight-loop.js:93, game.html:249). Note the sign: the tree uses **-174.5 m/s**
  where critique.md:248 writes +174.5; the tree is internally consistent.
- Body frame: `bHat = (cos th, sin th)` is the nose direction; theta is never
  wrapped, only differences via `wrapPi`.
- Station `s` = metres from the nose tip, positive aft; body-x of a station is
  `x_b = s_cm - s`; CP aft of CM => `xcp_b < 0` => stable.
- Renderer body frame = physics station frame (origin at nose tip, +y aft,
  metres; renderer.js:220-223). Renderer world frame = pad-local (+y up,
  origin at the pad surface, planet centre at (0, -R)); game.html:572-598
  rotates PCI into it by `padAngle = pi/2 + wp * t`.
- Drag is never applied as an acceleration: `deriv` exports `kDrag` and
  `stepVerlet` applies it in closed form (:532-543). Any "drag-like" force
  must follow that pattern.

---

## 2. What Works Today (verified by readers or by running it)

1. **Physics kernel** (physics-core.js): US76 atmosphere on three planets with
   `pa(0) === 101325` on home and earth; engine model with separation clamp,
   `peIdeal`/`isSeparated`, `perimeterFactor`; `massProps` with settling;
   Mach-dependent aero with restoring torque of the correct sign (validated
   checks 14-15); velocity-Verlet with closed-form drag/damping; adaptive
   `chooseDt`; Kepler round-trip to 4.8e-13; Sutton-Graves; contact model.
   `runValidation()` reports 24/24 under jsc (physics reader; flightspec reader
   re-ran it).
2. **Headless test runner** `tests/js/run.sh`: 6/6 pass at HEAD (verified this
   session). Thrust and mass flow drop to exactly 0 on an empty tank and
   specific orbital energy never rises after burnout (test-propulsion.js).
3. **Vertical slice flight** (game.html): countdown with vents/sparks,
   raised-cosine ramp, emergent liftoff from the pad-pin thrust > weight test,
   substepped Verlet flight, computed-torque gimbal hold within 0.14 deg over
   330 s (commit 30231ff), impact detection with R reset.
4. **Renderer** (renderer.js): linear-light sky, seeded star field,
   metres-based camera with log-space zoom smoothing, vector rocket with
   gimballed bell, pressure-derived plume with shock diamonds spaced from exit
   Mach, allocation-free SoA particles, tinted puff sprites, launch tower with
   retracting arms. The critique's STEP 5 go/no-go visual gate is recorded as
   passed in commit 9a128a8.
5. **Engine picker** (game.html:893-1217): four catalog engines with live
   vac/SL thrust, Isp, prop-mass and TWR outcome previews computed from the
   real nozzle model, separation tag at the live ambient pressure, fill-fraction-
   preserving apply.
6. **Static Fire Bench** (index.html): solid replay, liquid live hotfire with
   throttle and cutoff, 1-D launch with parachute, TraceChart, token system with
   light/dark/`data-theme`; defaults numerically match `configs/*.json`.
7. **Python oracle** (`rocket_sim/`): 6/6 pytest; formula-identical to the JS
   engine model for un-separated solids at fixed ambient pressure.

## 3. Partial

- **Ground contact**: pad pin + snap-and-freeze (game.html:497-509, :538-556);
  `RSX.contactResponse` (:864-895) is unused; no contact points on the vehicle;
  soft landing sets `crashed = true` so a successful landing is a dead end.
- **Time warp**: complete rails machinery, but `const warp = 1` (game.html:511);
  a bespoke `coastWarp` exists only for the Mars coast (:286, :841-842).
- **Attitude control**: gimbal computed-torque layer only (game.html:317-334),
  driven by `thetaCmd` pinned to vertical; no rate command, no RCS torque, no
  reaction wheels (critique C4/G1), zero authority at T = 0.
- **dv ledger**: only `dvDragStep` (physics-core.js:562); no gravity/steering/ideal
  bars; nothing accumulates even the drag bar.
- **Solid motors in flight**: full grain model exists but every motor is built
  `type: 'liquid'` with `grain: null`; no `advanceBurn` integrates web.
- **Reentry heating / thermal**: primitives exist, nothing computes `qConv`, no
  skin temperature on the vehicle, no failure consequence, no plasma render.
- **Frame driver**: `RSX.advance` dormant; the inline copy has a weaker NaN
  policy (`running` never read, so a NaN state re-NaNs every frame).
- **HUD**: raw monospace `#hud` (game.html:12, :802-805); tokens exist for the
  status triad but no instrument HUD.
- **Ground rendering**: `groundGeometry` mode computed but all modes draw the
  same flat rectangle (game.html:686).
- **Camera**: `targetPpmFor`/`PPM_ANCHORS` fully written but unused
  (renderer.js:151-172); shake zeroed at the source (:191-194).
- **LH2 plume**: `hexToRgba` passes `rgba()` strings through unchanged
  (renderer.js:459) so LH2 layers ignore computed opacity.
- **Ignition flash**: called with `nx = 0, ny = 0` (game.html:782) so the burst
  renders at the top-left corner; only the wash reads correctly.
- **Theme**: light-default with a `prefers-color-scheme` block only
  (game.html:22-32); no `[data-theme]` override in game.html (index.html has it).
- **Validation coverage**: checks 10-11 cannot fail (railsAdvance never touches
  a/e), 18-19 use a hand-rolled Euler loop, and no check exercises `deriv`,
  `stepVerlet`, `chooseDt`, `massProps`, `contactResponse` or `advanceThermal`.
  `runValidation` is not called by `tests/js`.
- **Mars scenario**: a third body and an abstract coast exist (physics-core.js:76-93,
  game.html:272-412) against the critique's single-body cut (critique.md:381);
  it owns the M, [ and ] keys.
- **Test Stand as sub-mode** (G12): index.html survives, but as a separate page.

## 4. Missing

- Staging / multi-body: no stage or separation concept; `stepVerlet` hardcodes
  one flat `veh.parts` and one `sEngine`; no debris.
- Multiple engines per vehicle, per-engine positions/cant, engine-out asymmetry.
- Data-driven parts catalog, part schema, `layoutRocket`, builder, snap nodes,
  CoM/CoT/CoP markers, per-stage dv/TWR, pre-flight check, blueprints/localStorage.
- State machine (menu / build / flight / map / outcome), main menu, missions,
  sandbox settings, tech tree, progression.
- CTL intent object, A/D rate command, throttle keys, SAS modes, RCS, reaction
  wheels, monoprop.
- TELEM frame, EVENT bus, SNAPSHOT ring, checkpoints, rewind/replay.
- Failure layer (structural, thermal, tumbling, engine, depletion) with named
  cause/actual/needed; debrief.
- Parachutes (no force path anywhere in `deriv`).
- Barrowman component formulas from geometry (nose/transition/fin CNa, CP,
  planform, crossflow centroid); flight-loop.js:47-48 hardcodes 0.466 and 6.0.
- Map view, conic drawing, Ap/Pe markers, prediction.
- Instrument HUD (attitude ring/navball, tapes, gauges, warnings, telemetry graphs).
- Audio (no `AudioContext` anywhere).
- Adaptive quality, quality presets, reduced-motion handling, touch controls.
- `fmt` module (physics-core.js:8 references a `fmt.js` that does not exist;
  likewise `vehicle.js` :516 and `control.js` :566).
- Explosions/debris, separation VFX, reentry plasma, clouds, textured planet.
- Pause key, debug overlay (R-37) beyond the text HUD.

## 5. Concerns (bugs, hardcoding, duplication)

**Duplication**
- Three copies of the combustion model: `rocket_sim/*.py`, index.html:383-509,
  physics-core.js:196-296. index.html lacks `perimeterFactor` and the Summerfield
  clamp, so the bench can report negative sea-level thrust for a vacuum bell that
  the game explicitly tests against (physics-core.js:1046-1049).
- Two `FUEL_PRESETS` with different constants (index.html:587-606 vs
  physics-core.js:303-333: solid density 1750/1770, a 3.63e-5/4.368e-5, cstar
  1500/1550, k 1.20/1.18; rp1 cstar 1770/1823; ch4 1870/1830; lh2 2350/2380).
  The same "Refined Kerosene" card gives different thrust in the bench and the game.
- `RSX.advance` (physics-core.js:586-613) vs the inline loop game.html:506-556.
- `hexToRgb`/`hexToRgba` implemented three times (index.html:864, renderer.js:60/:459,
  game.html:807-812).
- Vehicle identity duplicated: `currentEngineId = 'ENG-K1'` must "match
  RSX.testVehicle.build()'s hardcoded engine" (game.html:1063).

**Hardcoding**
- Nozzle efficiency 0.94 literal at flight-loop.js:20 and game.html:977, :1013, :1114.
- Hit-test regions hardcoded to the test vehicle's stations (game.html:1038-1046).
- `GIMBAL_MAX = 0.35 rad`, `CTRL_*` constants; catalog `gimbalDeg`/`minThrottlePct`/
  `hasSL` are display-only (game.html:317, :893-898).
- `parts.find(p => p.name === 'tank' | 'mount')` in five places (flight-loop.js:68,
  :76; game.html:349, :983-984, :1001-1002) — breaks with two tanks.
- Renderer physics constants: spark gravity 9.8 and smoke buoyancy 3.5 ignore
  the planet (renderer.js:521-522); tower fixed at 13 m / 6.5 m (:646).
- `MIN_VEHICLE_PX`, particle cap 3200 (spec ladder starts at 1800), sun at a fixed
  screen position (game.html:661).
- `FUEL_PRESETS.dot` embeds CSS strings `var(--series-mass)` that game.html does
  not define (physics-core.js:317, :323).

**Kernel defects (confirmed numerically by the flightspec reader)**
- `railsAdvance` ignores `el.dir`, so retrograde orbits propagate CCW on rails
  while `elementsToState` mirrors velocity CW (physics-core.js:723-728);
  `orbitReadouts` tTo* and `timeToRadius` inherit it.
- Ablation branch returns before the radiative term, so an ablative part pinned
  at `TAbl` never cools (physics-core.js:832-837); `hAbl` default 1.2e7 vs spec 1.0e7.
- Inertia parallel-axis term uses the unsettled `p.s` while the CM uses the
  settled station (physics-core.js:385 vs :371-376).
- NaN "halve dt" retry only subtracts `useDt * 0.5` from `remaining`; the next
  `chooseDt` returns the same dt (physics-core.js:604).
- `advance()` emits `substepEvent` without invalidating `cache.valid` (:611).
- `chooseDt` lacks the contact-stiffness term `dt <= 0.5 sqrt(m/k)`; margin is
  only 2.7x at 1/120 s (:568-577, :869).
- `contactResponse` stiffness uses `GRAVITY_REF` instead of `planet.g0` (:867).
- `xcross_b` silently falls back to `s_cp` and `Splan` to 0 when the caller omits
  planform data, deleting the high-alpha model (:411-412).
- `SM` ternary has identical branches (:419); comment at :100-102 claims a scaled
  gas constant that :160 does not apply; `T=559.6, a=600` above zAtm hardcoded (:145).
- Doc drift: `advanceBurn(dt)` in the contract comment vs `advanceBurn(A1, dt)`
  at :553; `CTRL_WN` "see control.js"; `mu` param of `timeToRadius` unused.

**Game-loop defects**
- `running = false` on NaN is never read (game.html:258, :526): a NaN state
  spams `console.error` every frame.
- Wall dt clamp 0.25 s with 400 substeps allowed (game.html:512-514) — a
  background-tab return can burn a long physics burst (spec: 50 ms / 48).
- Two `keydown` listeners; Space is not `preventDefault`ed (game.html:835, :1237).
- `setInterval(renderPropPanel, 400)` rewrites two `innerHTML` charts forever,
  even while hidden (game.html:1340).
- Engine drawer (z 50) covers the propellant panel (z 40) (game.html:54-61, :174-176).
- Key-binding collisions with game-mechanics §2.1: R = reset (spec RCS), M = Mars
  (spec map), Space = countdown (spec stage).
- Catalog drift from game-mechanics §5.6: ENG-KV pc 11.5e6 (spec 6.0 MPa), ENG-H1
  6.0e6 (spec 4.4 MPa), ENG-M1 exitD 1.30 (spec eps 40 -> 1.216).

**Renderer**
- ~25 `CanvasGradient` + ~7 `Path2D` objects allocated per frame for one vehicle
  (renderer.js:260-352, :363-456); `skyColorsAt` allocates per call despite the
  "cached by round(h/250)" comment (:49, :85-93); no sprite cache despite the
  header (:3-4). Up to 12,800 `drawImage` calls at the smoke cap (:569-580).
- Particle overflow always overwrites slot 0 (:503-505); radius growth is absolute
  not proportional (:524).
- Module-private tunables (`SKY_KEYFRAMES`, `PPM_ANCHORS`, `VEHICLE_SCREEN_FRACTION`,
  `SKINS`, `TOWER_*`) cannot be adjusted by a game layer.

**Process**
- `index.html` is the default page any static host serves; no doc names the
  entry point; README is Python-only.
- No CI; Node absent; `tests/js` exists but does not yet run `runValidation`.

---

## 6. Requirement Coverage Matrix

Status: DONE (verified working), PARTIAL (some code exists), MISSING (nothing).
"Existing code" cites what already covers the row; "Needed" is what the build
plan must add (phase in `build-plan.md` in brackets).

### 6.1 Functional requirements (R-1 .. R-54, R-75)

| Req | Topic | Status | Existing code | Needed |
|---|---|---|---|---|
| R-1 | Core loop design->build->launch->control->stage->orbit->missions->recover->iterate | PARTIAL | Launch, control (vertical only), impact, reset exist in game.html; engine swap is the only "design" action (:974-1016) | Builder [P2], staging [P4], orbit/map [P5], missions/recovery [P6] |
| R-2 | Build on the existing project; extend, never replace | DONE (process rule) | physics-core.js untouched since 9a128a8 except Mars; game.html grows additively | Plan enforces: kernel/renderer extended, game.html carved into modules verbatim [all phases] |
| R-3 | Screens: menu, builder, flight, map, missions, sandbox, tech tree, settings; builder feature list | PARTIAL | Flight screen only (game.html); part info panel on click (:1054-1107) | State machine + screens [P1 skeleton, P2 builder, P5 map, P6 missions/sandbox/tech, P7 settings] |
| R-4..R-8 | Data-driven parts with common fields; command, tanks, engines, aero, structural | PARTIAL | `ENGINE_CATALOG` (game.html:893-898) + `FUEL_PRESETS` (physics-core.js:303-333) + `makeMotor`; part record for mass props (flight-loop.js:34-40) | `PART_DEF` schema, `parts/*.js` data files, loader, tank resources, aero fields, structural parts [P1 data + P2 use] |
| R-9 | Manual staging config, per-stage actions, SPACE activates, visual stages | MISSING | — (flight-loop.js:4 "No staging") | Stage records in DESIGN, stage list UI [P2]; runtime separation + SPACE [P4] |
| R-10/R-11 | Live builder stats: masses, thrust, TWR, per-stage/total dv, burn time, CoM/CoT/CoP, stability, est. altitude/velocity | PARTIAL | `massProps` (physics-core.js:367), `vehicleAero` SM (:419), `previewEngine` thrust/Isp/TWR (game.html:974-999), `updatePreview` TWR (index.html:746-796) | `rocket/stats.js` with the formulas in build-plan §P2 [P2] |
| R-12..R-17 | Fixed timestep decoupled from frame; gravity r=R+h, thrust, mass change, fuel, exponential atmosphere shown, drag 0.5 rho v^2 Cd A, lift, 2-D rotation, gimbal, staging; A/D rotate, W/S throttle, configurable | PARTIAL | All physics terms in `deriv`/`stepVerlet` (physics-core.js:434-563) and exceed the spec (US76 not exponential — displayed rho/P satisfy "displayed"); adaptive substep (chooseDt); gimbal | Fixed-h accumulator via `RSX.advance` with warp [P3]; A/D, W/S input + CTL [P4]; staging [P4]; keymap config [P7] |
| R-18 | SAS OFF / STABILITY / PROGRADE / RETROGRADE | PARTIAL | `gimbalControl` attitude hold (game.html:317-334) is STABILITY on `thetaCmd` | Rate-command outer layer, SAS modes writing `omegaCmd`, RW/RCS torque [P4] |
| R-19/R-20 | Orbit reach/raise/lower/transfer/escape; display Ap, Pe, v, period, inclination, e; predicted trajectory with markers | PARTIAL | `stateToElements`, `orbitReadouts`, `classifyOrbit`, `conicPath` (physics-core.js:622-819) all dormant; energy>0 check (game.html:361-368) | Wire elements into TELEM, HUD readouts, map conic + markers, rails mode [P5]; inclination is identically 0 in 2-D (display as 0.0 deg, documented) |
| R-21 | Camera follow/zoom/pan/auto-track/high-altitude zoom/map; smooth | PARTIAL | `updateCamera` follow + framing (renderer.js:173-195); `targetPpmFor` altitude zoom written but unused (:151-172) | Re-enable anchor zoom, wheel zoom, pan, map mode blend, shake [P4 camera, P5 map] |
| R-22/R-23 | Flight HUD fields; stage indicator; engine status; navball-style indicator | PARTIAL | Text `#hud` with t/alt/v/throttle/pa/q/TWR/prop (game.html:802-805) | DOM/SVG holographic HUD, attitude ring with prograde/retrograde/horizon, tank gauges per resource, engine status [P4] |
| R-24/R-25 | Pre-launch checklist -> 3-2-1-LAUNCH; pad smoke/fire; exhaust scales with throttle and altitude | PARTIAL | T-6 countdown with vents/sparks/ramp (game.html:439-486); pad smoke, ground glow (:414-431, :711); pressure-derived plume (renderer.js:363-456) | Checklist card (READY / SYSTEMS / FUEL / GUIDANCE) driven by the launch check [P4]; exhaust already correct |
| R-26..R-28 | Failures from sim only; STRUCTURAL WARNING -> FAILURE; reentry heating + THERMAL FAILURE; parachutes with states | PARTIAL | Impact only (game.html:539-556); heating primitives (physics-core.js:822-844) unused; `q`, `alpha`, `SM` exposed by `deriv` | Failure evaluator with named cause/actual/needed (structural, engine, depletion, thermal, tumbling, impact), skin temperature integration, parachute part + force path + state machine [P5] |
| R-29..R-32 | Ten missions; sandbox; career unlocks; tech tree with seven categories | MISSING | `missionPhase` is a Mars-coast phase, not a mission board (game.html:284) | Mission definitions as predicates on TELEM, sandbox settings, tech-tree data + unlock flags gating the palette [P6] |
| R-33 | Blueprints save/load/delete/rename/duplicate, JSON `{name, parts, stages}`, local; no hardcoded designs in game logic | MISSING | `RSX.testVehicle.build()` is the hardcoded design (flight-loop.js:16-63) | `game/blueprints.js` with versioned JSON + localStorage (try/catch), presets shipped as blueprint files not code [P2] |
| R-34..R-36 | Builder UI layout, responsive, part info panel, CoM/CoT/CoP markers, stability label | PARTIAL | Part panel CSS/JS pattern (game.html:38-165, :1054-1239) | Builder screen [P2] |
| R-37 | Debug overlay (FPS, dt, pos, vel, accel, mass, g, rho, drag, thrust, mdot, torque, omega, Ap, Pe) | PARTIAL | `RSXDEBUG` object (game.html:297-310); text HUD | Toggleable overlay reading TELEM + `cache.d` [P4] |
| R-38/R-39 | Modular architecture, no giant file, data-driven parts | PARTIAL | Kernel/renderer/test-vehicle are separate files; game.html inline script is 1120 lines | Module layout under `web/js/{parts,rocket,physics,game,ui,render}` [P1 onward]; game.html shrinks to a loader |
| R-40 | Fixed timestep; no per-frame garbage; pooled effects; cheap prediction; render separate; no leaks | PARTIAL | SoA particle pool (renderer.js:486-534); `cache.tmpA/tmpB` reuse; analytic conic is cheap | Sprite cache + gradient caching, `skyColorsAt` memo, TELEM object reuse, remove `setInterval` innerHTML churn [P7], predictNumeric throttled [P5] |
| R-41/R-42 | Never fail silently; launch validation checklist with reasons | MISSING | NaN guard logs to console only (game.html:521-528) | Error surface (toast + log), `rocket/validate.js` launch check [P2 check, P4 card, P7 errors] |
| R-43 | Audio: clicks, ignition, thrust loop, separation, alarms, explosion, chute, mission complete | MISSING | — | WebAudio synthesis module `game/audio.js` [P4 minimal roar, P7 full set] |
| R-45/R-46 | Document coordinates; strict SI internally; friendly units only in display | PARTIAL | Conventions header (physics-core.js:4-19); SI in state; display formatting ad hoc (`fmtT`, game.html:558) | `build-plan.md` conventions section committed to `design/`; `ui/fmt.js` as the only unit converter (critique G14) [P1] |
| R-47 | Time control 1x/2x/5x/10x (+ higher in orbit), auto-drop in danger, P pause | MISSING | `warp = 1` (game.html:511); rails primitives | Warp ladder over `RSX.advance` + rails, gates, auto-drop, pause [P4 phys warp, P5 rails] |
| R-48/R-49 | Map view; planet data (radius, mass, gravity, atmosphere, scale height, surface P/T, rotation); extensible | PARTIAL | `PLANETS` records with R, mu, g0, wp, zAtm, atmosphere params (physics-core.js:63-93); three bodies | Map camera mode [P5]; add `pa0`, `T0`, `name`, `skyKeyframes`, `groundColor` to planet records so game/renderer stop switching on `planet.id` [P1] |
| R-50 | Automated tests: rocket equation, gravity, fuel/mass, thrust->accel, staging separation, stable orbit, blueprint round-trip | PARTIAL | `tests/js/run.sh` + 6 tests (gravity, fuel/mass, thrust cutoff); `runValidation` has Tsiolkovsky + orbit checks but is not run by the runner | Wrap `runValidation` in a test file; add per-phase test files listed in `build-plan.md` [every phase] |
| R-51 | Inspect first, explain, identify gaps, plan, implement incrementally with tests | DONE | This document + `build-plan.md` | Keep the "tests after each major system" rule in every phase exit criterion |
| R-52 | Build order P1..P7 | DONE (plan) | — | `build-plan.md` |
| R-53 | Never fake simulator values | DONE (so far) | Every HUD number in game.html is computed from `S`/`veh`/`deriv` | TELEM must remain the only HUD source; no "estimated" numbers outside the builder's clearly-labelled estimates [all] |
| R-54 | Explain failures: LOW TWR / UNSTABLE ROCKET / INSUFFICIENT DELTA-V in plain language | PARTIAL | "CANNOT LIFT OFF" TWR<1 flag (game.html:1197), "SEP x0.85" tag | Pre-flight check card and failure debrief copy [P2 builder, P5 debrief] |
| R-75 | Priority order sim > physics relationships > architecture > rendering > UI > VFX > polish | DONE (process rule) | — | Plan orders phases accordingly; visuals sit on top of a working sim in each phase |

### 6.2 Visual addendum (R-44v .. R-73v)

| Req | Topic | Status | Existing code | Needed |
|---|---|---|---|---|
| R-44v/R-45v | Professional futuristic aerospace sim look; original assets | PARTIAL | Renderer world/plume/tower are already "real", not toy (visual-realism gate passed); UI chrome is paper-light | Dark holographic HUD/menu language on the existing token names [P4 HUD, P7] |
| R-46v/R-47v | HUD signature elements; amber primary, cool secondaries, dark metallic; status colour semantics; subtle glow | PARTIAL | `--stat-*`, `--prop-*`, `--accent` tokens exist (game.html:15-33); ux-layout geometry for ring/G-meter/warp (ux-layout.md:279-359) | Retune token values for dark default, add `--hud-line`, `--glow`, cyan info; SVG ring/arcs/brackets [P4] |
| R-48v | Glass/holographic panels: translucent, thin borders, soft glow, blur, brackets, scan lines | MISSING | `--hud-panel` 93 % opaque tokens | New panel component CSS; blur gated by quality tier [P4, P7] |
| R-49v | Cockpit-style layered flight view; optional framing never obstructing | PARTIAL | Layered canvas + DOM overlay skeleton; clear stage rectangle rule in ux-layout.md:247-249 | Stage-rectangle assert, optional frame overlay [P4] |
| R-50v/R-51v | Spacecraft materials: metal, composite, TPS, plumbing, bolts; engines with turbopump/pipes; tanks with bands/seams; pods with windows/shield/RCS ports | PARTIAL | Skins white/steel/black, ribs, seams, AO, rim light, soot, ogive specular, bell gradient (renderer.js:225-352) | `drawPartVector` dispatch per part class with material passes + sprite cache [P2 thumbnails, P7 detail passes] |
| R-52v | Lighting: sun, ambient, planet-shine, engine light on surfaces, scattering, hard contrast in space | PARTIAL | Rim/AO gradients; ground glow; exposure | Sun-direction-aware skin flip, vacuum hardening, engine-light pass [P7] |
| R-53v..R-55v | Planet texture/clouds/terminator/night; altitude transitions; reentry glow from heating; cloud layers | PARTIAL | Sky keyframes in linear light, star fade by luminance, curvature gate (renderer.js:47-93, :207-216) | Disc/bezier ground drawing, limb glow, cloud deck sprites, map-planet texture, plasma sheath from `qConv` [P5 plasma, P7 rest] |
| R-56v..R-60v | Exhaust flagship; pooled particles; layered explosions with debris; separation sequence; reentry glow tiers | PARTIAL | Plume driven by pe/pa/throttle/fuel with diamonds (renderer.js:363-456); SoA pool; sparks | Debris/vapor/plasma particle types, explosion layers, separation choreography reading real impulse, glow tiers from `qConv` [P4 separation, P5 reentry, P7 explosions] |
| R-61v..R-64v | Star field with nebulae; camera shake; easing everywhere; animated HUD, reticles, live graphs, pulsing warnings | PARTIAL | Star field with Milky Way band (renderer.js:98-134); shake plumbing exists but zeroed (:191-194) | Re-enable shake with vacuum cut-off, HUD transitions, telemetry graph component (port `TraceChart`) [P4, P7] |
| R-65v..R-67v | Telemetry panel with graphs; warnings from real conditions; targeting reticle/prograde/retrograde/target | PARTIAL | `TraceChart` in index.html:876-983 (portable); `q`, `alpha`, `SM`, `isSeparated` available | Telemetry panel [P4], warning evaluator on TELEM [P5], target marker for missions [P6] |
| R-68v/R-69v | Builder dark grid; holographic selection; overlay modes COM/COT/COP + force arrows | MISSING | `massProps`/`vehicleAero` supply CM/CP numbers | Builder canvas [P2]; force arrows from `deriv` output in flight [P5] |
| R-70v | ROCKET LAB main menu with six items over animated stars/planet/scan lines | MISSING | `buildStarField` reusable backdrop | `ui/menu.js` [P1 skeleton, P7 dressing] |
| R-71v/R-72v | LOW/MEDIUM/HIGH/ULTRA quality; 1280x720 -> 4K, UI scales | MISSING | DPR-aware canvas resize (game.html:230-242) | Quality object consumed by particle caps, bloom, blur, star density; CSS `--ui-scale` [P7] |
| R-73v | Visual hierarchy, do not fill the screen | PARTIAL | Clear-stage-rectangle rule documented (ux-layout.md:247-249) | `[data-hud]` intersection assert, HUD tiers [P4] |

### 6.3 Known conflicts (requirements.md:267-281)

| Conflict | Status | Decision (detailed in `build-plan.md` §0.2) |
|---|---|---|
| Paper-light palette vs dark holographic amber | Open | Dark holographic is the default theme; token NAMES and type stack kept; light palette retained under `[data-theme="light"]` for the bench |
| Scaled HOME (600 km) vs "one primary planet, extensible" | Resolved in tree | Keep HOME default + REAL EARTH toggle; `PLANETS` is the extension table; Mars body stays as data, the Mars coast becomes a sandbox scenario |
| Combustion engine model vs parametric catalog engines | Open | `engine.model: "combustion" | "parametric"` in the part schema; both implement one `EngineInstance` interface (`thrustAt`, `mdotAt`, `ispAt`, `peIdeal`, `isSeparated`) consumed by the vehicle |

---

## 7. In-session findings (observed by running game.html, 2026-09-21)

These were found by flying the vertical slice in the browser at 1024x768 and
by driving it headlessly through `RSXTick`; they qualify §2.3 above.

1. **Attitude loss at max-Q (contradicts §2.3's "0.14 deg over 330 s").** With
   the default vehicle at throttle 1 from the pad, pitch holds within 0.5 deg
   until t ~ 16 s (4.7 km, Mach 2.0, q ~ 80 kPa), then flips to ~180 deg by
   t = 17.5 s and rides tail-first. Root cause (headless trace sampled at 0.5 s):
   `RSX.vehicleAero` scales fin CNa by `compressibilityK(mach)`
   (physics-core.js:351-357, ~1/sqrt(M^2-1) supersonic) but not the nose, so the
   CP walks forward and the static margin goes from +0.29 at M1.5 to -0.40 at
   M2.2. The aero torque gradient reaches ~88 kN*m/rad at 16.0 s and ~313 kN*m/rad
   at 17.0 s; with I ~ 10.6e3 kg*m^2 the open-loop divergence rate is 2.9-5.4
   rad/s, while `gimbalControl` (game.html:317-334) runs a fixed CTRL_WN = 1.2
   rad/s, GIMBAL_RATE = 0.9 rad/s and has no feed-forward of the aero torque
   (`tauDes = I*(wn^2*e - 2*zeta*wn*om)` only). Gimbal authority
   `ell*T*sin(0.35)` ~ 514 kN*m would have sufficed. flight-physics.md §10.4
   already states the rule: with SM < 0, wn must exceed `sqrt(K/I)`. Fix in the
   flight-control work: feed-forward `-tau_aero` into the commanded torque,
   schedule wn from the live aero stiffness, expose SM/authority margin as an
   UNSTABLE warning (R-54), and size default fins so SM > 0 through max-Q.
2. **Camera never follows horizontally.** `draw()` passes `x: 0` to
   `updateCamera` (game.html:637) while the vehicle drifts (rx = -15.7 km at
   138 km altitude), so the rocket leaves the frame shortly after liftoff. A
   1-D-vertical-slice assumption that the 2-D flight camera must drop.
3. **Thrust after burnout** — fixed in 945c2a0 (`propAvailable` gate); verified
   live: thrust 0 N after cutoff, specific energy never rises.
4. **HUD "v" is inertial speed**: 174.5 m/s while at rest on the pad (planet
   rotation). Flight HUD must show surface-relative speed below orbital regime.
5. **NaN guard fires silently and repeatedly.** Two "NaN state detected" console
   errors were seen from the pre-fix build; not reproducible on HEAD across fresh
   load, reset+tick, 70 s flight, live frame loop, and reset-after-flight. Keep
   the §5 "running never read" concern: a NaN state currently re-logs every frame.
6. **Test-vehicle fins are declared** (flight-loop.js:47-50, CNa 6 at the tail),
   so the flip is not "no fins"; it is the supersonic CP shift plus controller
   bandwidth. Any parts-catalog fin must carry a Mach-aware CNa the same way.
7. **Tooling**: `python3 -m http.server` + Chrome cached edited JS; the
   `Static Fire Bench` needed `<meta charset>` (fixed in 945c2a0).
