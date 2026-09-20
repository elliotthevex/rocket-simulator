# Rocket Simulator — Full Game Requirements (2026-09-20)

Source: the owner's development prompt. This is the spec the build is measured
against. Sections are numbered as in the prompt so they can be cited (R-12 etc).
Existing design docs in this folder (critique.md and friends) remain the
detailed implementation specs where they do not conflict; where they conflict
this file wins, and the conflict is recorded in "Known conflicts" at the end.

## Non-negotiable process rules (R-2, R-51, R-75)
- Build ON the existing project. Do not replace working systems; extend them.
- Inspect the whole project first; explain the architecture; identify what
  works; identify gaps; plan; then implement incrementally, testing after each
  major system.
- Never fake simulator values (R-53). Delta-v, TWR, fuel flow, acceleration,
  Ap/Pe, trajectory, heating, warnings all derive from the simulation.
- Priority order (R-75): 1 functional sim, 2 correct physics relationships,
  3 stable architecture, 4 rendering quality, 5 UI quality, 6 VFX, 7 polish.
- Graphics represent actual sim state (throttle→exhaust, density→exhaust
  shape, temperature→glow, stress→warning, staging→physical separation, etc).

## R-1 Core loop
Design rocket → attach parts → configure engines/tanks/fins/decouplers/payload →
build vertically → check mass/thrust/fuel/CoM/CoT/stability → launch →
control → stage → reach altitude/orbit → missions → recover → iterate.
Engineering sandbox, not arcade.

## R-3 Game modes / screens
Main menu (R-70), Rocket Builder, Flight, Map view, Missions, Sandbox,
Technology tree, Settings. Builder features: parts catalog; drag-and-drop or
click-to-place; snap points; vertical stacking; radial (horizontal) attach;
rotate; delete; duplicate; undo/redo; zoom; pan; grid; symmetry; selection;
part info panel; live rocket stats.

## R-4..R-8 Parts (data-driven, not hardcoded per part)
Common fields: name, type, mass, cost, size, height, width, attachment points,
fuel capacity, fuel type, thrust, Isp, engine type, gimbal range, drag,
temperature limit, strength, separation force.
- Command modules: mass, crew, battery, control authority, max temp,
  parachute compatibility.
- Fuel tanks: small/medium/large; fuel types (liquid fuel, oxidizer, methane,
  kerosene); tanks store resources.
- Engines (several): max thrust, min throttle, Isp, fuel consumption, mass,
  gimbal, ignition count, atmospheric vs vacuum efficiency (thrust/Isp vary
  with ambient pressure), heat production; throttleable where supported.
  Display thrust, consumption, Isp, TWR, throttle.
- Aerodynamic: nose cones, fins, control surfaces, wings, air brakes.
  Simplified aero from velocity, density, AoA, reference area, Cd, Cl.
  Stability must matter.
- Structural: adapters, decouplers, separators, struts, connectors,
  fairings, payload adapters; attachment points + connection graph.
Data layout suggestion: parts/{engines,tanks,command,structural,aerodynamic,utility}.

## R-9 Staging
Manual stage configuration; each stage lists actions (ignite engine,
decouple, deploy parachute, toggle engine, fairing, separator). Add/remove/
rearrange. SPACE = activate next stage. Stages displayed visually.

## R-10/R-11 Live rocket statistics in builder
Total/dry/fuel mass, total thrust, TWR, delta-v (per stage + total via
Tsiolkovsky Δv = Isp·g0·ln(m0/mf)), burn time, CoM, CoT, CoP, stability
margin (STABLE/MARGINAL/UNSTABLE from real numbers), stage count, estimated
max altitude and velocity. Update immediately on change.

## R-12..R-17 Flight physics
Fixed physics timestep decoupled from frame rate. Simulate gravity
(inverse-square, r = R+h), thrust, mass change, fuel consumption, exponential
atmosphere (density/pressure displayed), drag 0.5ρv²CdA, lift, 2-D rotation
(angle, ω, torque, inertia), gimbal, staging. Fnet = T − W − D; a = Fnet/m.
Controls: A/← D/→ rotate, W/↑ S/↓ throttle; configurable.

## R-18 SAS
Modes OFF / STABILITY / PROGRADE / RETROGRADE (radial/anti-radial later).
Applies control torque toward target orientation.

## R-19/R-20 Orbital mechanics + prediction
Reach/raise/lower/transfer/escape orbit. Display Ap, Pe, orbital velocity,
period, inclination, eccentricity. Draw predicted trajectory with Ap/Pe
markers, updated as velocity changes. Sufficient velocity → stays in orbit.

## R-21 Camera
Follow, zoom, pan, auto-track, high-altitude zoom, map view; smooth but not
laggy.

## R-22/R-23 Flight HUD + navball
Altitude, velocity, vertical/horizontal velocity, acceleration, throttle,
fuel (per resource), mass, TWR, heading, angle, Ap, Pe, atmospheric pressure;
stage indicator; engine status ACTIVE/OFF/EMPTY/DAMAGED. Navball-style
indicator: orientation, prograde, retrograde, up/down, horizon.

## R-24/R-25 Launch sequence + engine VFX
Pre-launch checklist (ROCKET READY / SYSTEMS CHECK / FUEL LOADED / GUIDANCE
READY) → 3-2-1-LAUNCH; smoke/fire on pad. Engine flame/exhaust/smoke/glow
scale with throttle and change with altitude.

## R-26..R-28 Failures, reentry, parachutes
Failure states from sim conditions only: structural (aero stress), engine,
fuel depletion, overheating, tumbling, impact. STRUCTURAL WARNING → FAILURE.
Reentry: heating from velocity + density; HEAT readout; THERMAL FAILURE over
limit; attitude matters. Parachutes: deploy altitude, speed limit, Cd, area,
mass; states STOWED/DEPLOYING/DEPLOYED/FAILED; only deploy safely in bounds.

## R-29..R-32 Missions, sandbox, progression, tech tree
Ten missions (launch; 1 km; 10 km; edge of space; orbit; one revolution;
target apoapsis; return safely; deliver payload; controlled reentry), each
with objective/requirements/reward/completion. Sandbox: unlimited money/
parts/fuel, free launches, tweakable sim settings. Career: missions unlock
parts. Tech tree categories: Propulsion, Structures, Aerodynamics, Avionics,
Flight Control, Thermal Protection, Payload Systems.

## R-33 Blueprints
Save/Load/Delete/Rename/Duplicate rockets, JSON, stored locally
({name, parts, stages}). No hardcoded designs in game logic.

## R-34..R-36 Builder UI + engineering tools
Parts | canvas | stats bar | SAVE LOAD TEST LAUNCH. Responsive. Part info
panel on click. CoM ●, CoT ◆, CoP ◇ markers; stability label from numbers.

## R-37 Debug mode
Toggle overlay: FPS, dt, position, velocity, acceleration, mass, g, ρ, drag,
thrust, fuel flow, torque, ω, Ap, Pe.

## R-38/R-39 Architecture
Modular: Rocket{Parts, Mass, Fuel, Engine, Aero, Guidance, Staging, Thermal,
FlightState}; Physics{Gravity, Thrust, Drag, Lift, Rotation, Orbital};
Game{Builder, Flight, Missions, Save, UI}. No single giant file. Data-driven
parts.

## R-40 Performance
Fixed timestep; no per-frame garbage; pooled effects; cheap trajectory
prediction; rendering separate from physics; no leaks.

## R-41/R-42 Errors + launch validation
Never fail silently; useful errors; no full-app crash. Launch check:
command module, engine, fuel, connected structure, valid staging, no orphan
parts, engine has usable fuel. Show ✓ list → READY FOR LAUNCH, or
LAUNCH CHECK FAILED + reason.

## R-43 Audio
Clicks, ignition, thrust loop, separation, alarms, explosion, chute, mission
complete. Non-intrusive.

## R-45/R-46 Coordinates + units
Document x/y, vx/vy conventions in-project; strict SI internally; friendly
units only in display.

## R-47 Time control
1×/2×/5×/10× (higher in orbit acceptable), auto-drop to 1× in danger; P = pause.

## R-48/R-49 Map view + planet system
Map: planet, atmosphere, rocket, orbit, prediction, Ap/Pe; zoom to full orbit.
Planet data: radius, mass, gravity, atmosphere, scale height, surface
pressure/temperature, rotation. Extensible to more bodies.

## R-50 Tests (automated)
Rocket equation, gravity, fuel consumption/mass, thrust→acceleration,
staging separation, stable orbit under proper ICs, blueprint save/load
round-trip.

## R-52 Build order
P1 foundation (state, render, input, rocket object, basic parts) →
P2 builder (placement, attach, select, stats, save/load) →
P3 physics (mass, gravity, thrust, fuel, accel, drag) →
P4 flight (launch, controls, staging, camera, HUD) →
P5 advanced physics (atmosphere, aero, orbit, prediction, reentry) →
P6 gameplay (missions, sandbox, progression, tech) →
P7 polish (VFX, audio, animation, UI, perf, errors).

## R-54 UX: explain failures (LOW TWR / UNSTABLE ROCKET / INSUFFICIENT
DELTA-V with plain-language reasons).

# VISUAL QUALITY ADDENDUM (R-44v..R-76)
The owner supplied a reference image (not received in this session; the
written description is the spec). Visual quality is a MAJOR priority.

## R-44v/R-45v Target
Professional futuristic aerospace simulation interface. NOT an educational
website, JS demo, generic 2D game, or plain canvas app. High-fidelity
spacecraft, realistic lighting/atmosphere/exhaust/particles, futuristic HUD,
dense-but-organized technical info, cinematic presentation. All assets
original; do not reproduce the reference.

## R-46v/R-47v HUD + colour language
HUD is the signature element: thin lines, circular reticles, arc indicators,
crosshairs, technical brackets, small numeric readouts, warnings, transparent
panels, glowing outlines, vector/flight-path indicators, status bars, data
labels. Avoid big rectangular boxes; layer information with hierarchy.
Primary colour amber/orange; secondary white, cool grey, subtle cyan, dark
metallic backgrounds. Status: NORMAL neutral/cool, ACTIVE bright amber,
WARNING yellow/orange, CRITICAL red, SUCCESS green. Glow is subtle and only
on important indicators/active controls/targeting/warnings/nav/engine info.

## R-48v Glass/holographic panels
Semi-transparent backgrounds, thin borders, soft glow, subtle blur, gradient
transparency, corner brackets, animated scan lines, decorative data. Not
rounded web-app UI; spacecraft instrumentation.

## R-49v Cockpit-style flight view
Rocket, planet, atmosphere, clouds, sunlight, stars, exhaust, particles, HUD,
nav — layered over the environment; optional subtle cockpit framing that
never obstructs the view.

## R-50v/R-51v Spacecraft rendering + materials
No plain coloured rectangles. Communicate metal, composite, TPS, insulation,
wiring, structure, plumbing, bolts, panels, rivets, fuel lines. Engines show
turbopump housing, nozzle, pipes, mounts, heat discolouration. Tanks show
metallic surface, bands, seams, connection points. Command modules show
windows, heat shield, antennas, sensors, RCS ports. Distinct materials
(metal, carbon, tiles, painted, polished, glass, insulation, rubber,
ceramic, titanium) that respond differently to light.

## R-52v Lighting
Directional sun, ambient, planet-shine, engine illumination on nearby
surfaces, atmospheric scattering, hard contrast in space.

## R-53v..R-55v Planet, atmosphere, clouds
Planet with surface texture, clouds, haze, terminator, sunlit gradient,
night side, optional city lights, cloud motion, scattering. Low altitude:
surface→clouds→atmosphere. High: curvature→atmospheric glow→space. Sky
darkens and stars appear with altitude. Reentry: glow/plasma around vehicle
driven by simulated heating. Clouds: soft edges, layers, motion, lighting.

## R-56v..R-60v Exhaust, particles, explosions, separation, reentry VFX
Exhaust is a flagship effect: wide/bright/dense/turbulent + smoke at sea
level; longer and directional in thin air; broad/expansive/luminous in
vacuum; responds to throttle. Pooled particles with velocity, lifetime,
opacity, scale, variation. Explosions: layered, physical debris on real
trajectories, camera reacts subtly, no cartoon sprite. Separation: engine
off → decoupler → impulse → parts drift apart → new stage lights → sparks/
smoke. Reentry glow LOW→SUBTLE→ORANGE→PLASMA→EXTREME driven by heating, not
altitude.

## R-61v..R-64v Space, camera, motion, live data
Deep star field with size/brightness variation, subtle nebulae, sun, planet
lighting. Subtle camera shake (launch, vibration, separation, impact,
reentry, explosion) without hurting control. Smooth interpolation/easing
everywhere; HUD elements animate in/out; rotating reticles, scanning
indicators, live graphs, pulsing warnings — a functioning spacecraft
computer.

## R-65v..R-67v Telemetry, warnings, targeting
Toggleable telemetry panel with live graphs (altitude, velocity, accel,
fuel, throttle, temperature, pressure). Warnings from real conditions only:
LOW FUEL, HIGH AOA, STRUCTURAL LOAD, THERMAL LIMIT, LOW TWR, ENGINE OUT,
TRAJECTORY DEVIATION, REENTRY VELOCITY. Targeting: reticle, direction
arrows, velocity vector, prograde/retrograde, target marker, distance,
relative velocity, approach path.

## R-68v/R-69v Builder visuals + engineering overlay
Dark technical grid background; rocket is the focus; selected part gets
holographic outline, attachment points, technical info. Overlay modes:
● COM, ◆ COT, ◇ COP, force arrows (lift, drag, thrust, gravity).

## R-70v Main menu
Mission-control style: ROCKET LAB — NEW VEHICLE / LOAD VEHICLE / MISSION /
SANDBOX / TECHNOLOGY / SETTINGS. Animated stars, distant planet, scan lines,
telemetry decorations. Professional, not flashy.

## R-71v/R-72v Quality settings + resolution
LOW/MEDIUM/HIGH/ULTRA controlling particles, shadows, atmosphere, clouds,
glow/bloom, star density, debris, reflections, post. Playable on normal
hardware. Works at 1280×720 → 3840×2160; UI scales; no hardcoded resolution.

## R-73v Visual hierarchy
1 rocket/environment, 2 flight-critical, 3 nav, 4 warnings, 5 telemetry,
6 secondary, 7 decoration. Do not fill the screen.

# Known conflicts with existing design docs (to be resolved in the plan)
- design/ux-layout.md specifies a warm light "engineering paper" palette
  (#EDECE6 bg, #D9601F accent, IBM Plex/Barlow). The addendum specifies a
  dark metallic holographic amber HUD. Resolution: flight and main-menu use
  the new dark holographic language; the existing token names and type
  stack are retained so existing CSS keeps working; a dark theme becomes
  the default.
- critique.md locks a scaled HOME planet (R = 600 km) with an optional REAL
  EARTH toggle. The prompt asks for one primary planet with extensible
  architecture; keep the scaled default and the toggle.
- The existing engine model is combustion-first (solid BATES grain + nozzle).
  The prompt's parts catalog is liquid-engine style (throttle, Isp, gimbal,
  ignition count). Both must coexist: the data-driven part schema carries
  either a "combustion" engine (existing model) or a "parametric" engine
  (thrust/Isp tables), and the flight physics consumes a common interface.
