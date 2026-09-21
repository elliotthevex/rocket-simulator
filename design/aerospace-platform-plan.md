# Aerospace Engineering Platform — master plan (supersedes stage-2-plan.md's F3-F7)

Binding brief for the "Transform into a Futuristic Aerospace Engineering
Platform" request. Every implementer/verifier agent reads this file
completely before touching code.

## 0. Relationship to design/stage-2-plan.md

- Stage-2 F1 (stack rules, decoupler, stages, per-stage stats, saved
  designs, telemetry -- commit 4f4e9f9) is MERGED and its data model
  stands: RSX.rocket.{normalizeDesign, stagesOf, rules, flight, designs,
  telemetry}, the extended catalog, per-stage stats/CoP. Build on it,
  do not redo it.
- Stage-2 F2 (free stack editing, DESIGNS menu, alternatives/Replace,
  per-stage stats UI) may still be landing when this plan starts. It is
  NOT superseded -- it is exactly the editing surface the new Rocket
  Library's "BUILD" button hands off into. Do not touch web/game.html's
  Design-screen internals until F2's result is in hand (avoid two agents
  editing the same 2000-line file at once -- the lesson from every prior
  slice in this project).
- Stage-2 F3 (3D exploded/stages/balance/labels toggles), F4
  (drag-and-drop assembly), F5 (multi-stage flight), F6 (CONFIGURE/
  SIMULATE/TELEMETRY screens) are SUPERSEDED by L3/L4/L9 below -- same
  goals, folded into this priority order and this document's richer
  spec. Do not implement stage-2-plan.md's F3/F4/F5/F6 text separately;
  follow L3/L4/L9 here instead. F7 (tutorial/detail levels/help mode) is
  superseded by L10.
- Ground truth, gotchas, and the physics/vehicle contract in
  stage-2-plan.md sections 1-2 still apply verbatim and are not repeated
  here in full -- read that file's sections 1-2 first.
- Attribution: commit messages end with
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (not Fable --
  the project switched models mid-build; every NEW commit uses this line).

## 1. What "educational representation" means here (binding constraint)

- Real vehicle NAMES, manufacturers, and approximate public specs (height,
  stage count, engine count, propellant, approximate liftoff mass, era,
  crewed/reusable/heavy-lift tags) are fine to use -- they are public facts,
  not proprietary assets. Every library entry's numeric fields carry
  `dataConfidence: "approximate/educational"` and the UI must show that
  label near the specs, not present them as exact engineering data.
- No proprietary CAD geometry, textures, logos, or confidential data. Every
  3D model is built from this project's own primitive-based part system
  (cones/cylinders/boxes/rings), scaled to the vehicle's real public outer
  dimensions -- a recognizable silhouette (Starship's flare, Falcon 9's
  narrow body, Saturn V's stage tapers), not a precise recreation.
- Interior systems (feed lines, turbopumps, avionics boxes, wiring) are
  ORIGINAL conceptual geometry illustrating real engineering PRINCIPLES
  (§6 of the original spec), not real hardware layouts.
- AERIS is an original persona (name/backronym only: "Aerospace Engineering
  Research & Interactive Support") -- no character, voice, or design
  copied from any existing fictional AI.
- Aerodynamics/turbine/wing simulations use named, cited textbook formulas
  (thin-airfoil theory, flat-plate parasitic drag, Betz limit) and say so
  in the UI. Never a fabricated "realistic" number with no derivation.
- Nothing here is a real-world manufacturing or test procedure (§15) --
  everything is conceptual/simulated, exactly as the existing engine
  system already is.

## 2. Data schema

### 2.1 Rocket Library -- `web/js/data/rocket-library.js`, `RSX.library`

```
RSX.library.VEHICLES = [{
  id, name, company, category: ["NASA"|"SPACEX", ...tags],
    // tags drawn from: HISTORICAL, CURRENT, HEAVY-LIFT, CREWED, REUSABLE
  era: "1960s-70s" | "1980s-2011" | "2020s" | "2020s (in development)" | "cancelled 2010",
  description: string (2-3 sentences, plain language),
  specs: { heightM, diameterM, stages, engineCount, engineName, propellant,
           liftoffMassKgApprox, payloadKgApprox, notes },
  dataConfidence: "approximate/educational -- public sources",
  design: <a normalized RSX design: {stack, finAt, fin, config}>,
    // stack entries may be a bare partId string OR {id, scale} (see 2.2);
    // this is what "BUILD" hands to the Design screen and what the 3D
    // library card actually renders -- one real object, not a separate
    // decorative model.
}, ...]
RSX.library.byCategory(tag) -> filtered array (tag === "ALL" -> everything)
RSX.library.get(id)
```

### 2.2 Scaled stack entries (extends `RSX.rocket.layoutStack`/`buildVehicle`)

A stack entry becomes `partId | { id: partId, scale: number }` (default
scale 1; fully backward compatible with every existing plain-string
stack). `scale` multiplies `L` and `R` for every part; for a `tank`,
`massFull` scales with `scale^3` (volume); for an `engine`, `throatD`/
`exitD` scale with `scale` (so thrust/Isp are STILL computed by the real
`RSX.thrustN`/`massFlow` at the scaled nozzle geometry -- never a
hand-typed thrust number). This is how a Saturn-V-scale first stage is
represented honestly: real nozzle physics at an approximated scale, not
invented figures. Document the exact scaling formulas as code comments
where implemented; add `tests/js/test-scaled-parts.js` proving a
scale-2 tank has 8x the propellant mass and a scale-2 engine's thrust
comes from `RSX.thrustN` at the doubled throat/exit area (not a linear
guess).

### 2.3 Component metadata for the tree / detail panel / AERIS

Catalog defs gain (additive, optional): `thumbnailDraw` (defaults to the
existing `RSX.render.drawPartPortrait` dispatch -- already correct per
class), `aeris: { beginner, engineering, advanced }` (3-tier text,
falls back to `description` at all tiers if absent so nothing ever
renders blank), `subsystems` (engine only, for the tree/breakdown --
see section 9).

## 3. The ten initial library vehicles

All figures rounded, public, approximate; every entry's `notes` states
the biggest simplification.

| id | name | co. | height | stages | engines | propellant | mass (kg) | tags |
|---|---|---|---|---|---|---|---|---|
| saturn-v | Saturn V | NASA | 111 m | 3 | 5 F-1 + 5 J-2 + 1 J-2 | RP-1/LOX, LH2/LOX | 2,970,000 | HISTORICAL, HEAVY-LIFT, CREWED |
| shuttle | Space Shuttle | NASA | 56 m | 2 (SRB+orbiter/ET) | 3 SSME + 2 SRB | LH2/LOX, solid | 2,030,000 | HISTORICAL, CREWED, REUSABLE |
| sls-b1 | SLS Block 1 | NASA | 98 m | 2 + 2 SRB | 4 RS-25 + 2 SRB | LH2/LOX, solid | 2,600,000 | CURRENT, HEAVY-LIFT, CREWED |
| sls-b1b | SLS Block 1B | NASA | 111 m | 2 + 2 SRB | 4 RS-25 + 2 SRB + 4 RL10 (EUS) | LH2/LOX, solid | 2,600,000 | CURRENT, HEAVY-LIFT, CREWED |
| ares-1 | Ares I | NASA | 94 m | 2 | 1 five-seg SRB + 1 J-2X | solid, LH2/LOX | 900,000 | CANCELLED (historical), CREWED |
| falcon-1 | Falcon 1 | SpaceX | 21 m | 2 | 1 Merlin 1C + 1 Kestrel | RP-1/LOX | 27,700 | HISTORICAL |
| falcon-9 | Falcon 9 (Block 5) | SpaceX | 70 m | 2 | 9 Merlin 1D + 1 Merlin 1D Vac | RP-1/LOX | 549,000 | CURRENT, REUSABLE, CREWED |
| falcon-heavy | Falcon Heavy | SpaceX | 70 m | 2 (+2 boosters) | 27 Merlin 1D + 1 Merlin 1D Vac | RP-1/LOX | 1,420,000 | CURRENT, HEAVY-LIFT, REUSABLE |
| starship | Starship + Super Heavy | SpaceX | 121 m | 2 | 33 Raptor + 6 Raptor | CH4/LOX | ~5,000,000 | CURRENT (in development), HEAVY-LIFT, CREWED, REUSABLE |
| starship-hls | Starship HLS | SpaceX | ~50 m | 1 (lunar stage) | 6 Raptor Vacuum | CH4/LOX | ~1,300,000 | CURRENT (in development), CREWED |

("CANCELLED" is an additional tag value beyond the filter chips in the
original prompt; add it to Ares I's tags and to the filter bar as a
5th chip alongside ALL/NASA/SPACEX/HISTORICAL/CURRENT/HEAVY-LIFT/
CREWED/REUSABLE so the cancelled program is honestly labeled, not hidden
under HISTORICAL.)

Each `design.stack` is built from EXISTING catalog parts (nose/pod/tank/
engine/fin/decoupler) plus `scale` per 2.2, chosen so the resulting
`buildVehicle` height (sum of `L*scale`) lands within ~10% of the real
`heightM`, and engine COUNT in `aeroContribs`/thrust is represented by
multiplying a single scaled engine's thrust by `engineCount` (documented
as a simplification: real multi-engine clustering/gimbal geometry is not
modeled). If a family needs an engine/propellant this project's kernel
doesn't have a preset for (Raptor/CH4, RS-25/LH2, solid SRB), add ONE new
catalog engine def per family (reusing `FUEL_PRESETS.ch4`/`lh2`/`solid`,
already present), not one per vehicle.

## 4. Visualization modes (extends `web/js/render/assembly-3d.js`)

A mode bar (button = name + one-line purpose, matching the existing
camera-bar pattern): EXTERIOR (default, current rendering) . ENGINEERING
(non-selected structural meshes -> opacity 0.35, systems/engine stay
opaque) . X-RAY (every body mesh -> opacity 0.15 + wireframe overlay,
reveals the internal "systems" group added in section 9) . CUTAWAY (a
`THREE.Plane` clip on body meshes sliced through the vehicle's local X=0
plane, revealing simple internal schematic geometry: a propellant-colored
cylinder inside each tank, domes at each end, a thin feed-line tube along
the wall to the engine) . EXPLODED (parts translate outward along the
stack axis by a fraction of their length, eased, with floating name
labels -- reuses Stage-2 F3's spec) . ISOLATE (selecting a part fades
every mesh that is not it or a fin/decoupler directly attached to it).
Modes are independent of camera presets and of selection; changing design
or selection while a mode is active must re-apply it after `rebuild()`.
Keyboard shortcuts per the original spec: E exploded, X x-ray, R reset
camera, matching section 31/32 (also add them to the CONTROLS overlay).

## 5. Screen / navigation model

`LIBRARY -> DESIGN -> ASSEMBLY -> LABS -> SIMULATE -> MISSION -> LAUNCH ->
TELEMETRY`. LABS is one screen with an internal sub-tab strip
(Aerodynamics . Wing . Wind Turbine . Propulsion . Structures . Avionics)
rather than 6 top-level nav items -- keeps the header usable at 800px
width (a real, hit constraint verified this session). LIBRARY is the new
DEFAULT landing screen (replaces Assembly in that role); each card's
INSPECT/BUILD/SIMULATE buttons: INSPECT -> opens that vehicle in the
Assembly 3D view (read-only camera tour, mode bar available); BUILD ->
loads its `design` into the Design screen's editable state (Stage-2 F2's
`design`/`selectedIndex`) and switches to DESIGN; SIMULATE -> loads it and
jumps straight to the SIMULATE screen once that screen exists (L9), or to
Assembly until then. AERIS is a persistent dockable panel (collapsed tab
on the right edge, matching the existing dark panel language) available
from every screen except LIBRARY's full-bleed card view, not its own nav
item.

## 6. AERIS assistant -- `web/js/aeris.js`, `RSX.aeris`

`RSX.aeris.explain(topicId, tier)` -> `{title, body}` reading a content
map keyed by topic id (component catalog ids, subsystem ids from 2.3, and
a handful of concept topics: "twr", "static-margin", "delta-v",
"flow-separation", "staging", "lift", "drag", "betz-limit"...); tiers
`beginner|engineering|advanced`, always returns something (falls back
through tiers, then to the catalog `description`, never blank). A docked
panel UI: `[BEGINNER] [ENGINEERING] [ADVANCED]` tier switch (persisted
choice, matches the DETAIL LEVEL control from Stage-2 F7/§24) + the four
action buttons from the spec (WHAT DOES THIS DO? / WHY IS IT IMPORTANT? /
SHOW ME HOW IT CONNECTS / EXPLAIN THE PHYSICS) mapped to specific content
sub-keys per topic, + a running short log of what's been shown this
session (scrollback, not a chat you type into -- there is no live model
to converse with; this is stated plainly in the panel's own subtitle:
"A guided reference, not a live conversation"). Context-awareness (§14)
is event-driven, not inferred: every screen fires
`RSX.aeris.onContext(event)` (e.g. `{screen:"propulsion", step:"nozzle"}`,
or `{type:"incompatible", partId, reason}` from a refused stack edit) and
AERIS's docked panel updates its suggested topic + shows the refusal
reason verbatim when that's the event. Build the content map incrementally
per lab as each lab ships (L2 seeds it for existing parts/stats concepts;
L5-L7 add their own topics) -- track coverage in a jsc test that asserts
every catalog part id and every subsystem id in 2.3 has at least a
`beginner` entry (or a passing fallback) so nothing renders empty.

## 7. Component tree

A collapsible left rail (Design and Assembly screens): `ROCKET > NOSE,
PAYLOAD/POD, STAGE N > TANK, ENGINE > (subsystems, informational only --
see 9), FINS`. Built from `RSX.rocket.stagesOf` + `assemblyLayout`, not a
new data source. Clicking a physical node sets `selectedIndex` (syncs with
3D selection and the Design stack view, both directions -- one selection
state, already partly true after the original 3D-centering slice). Clicking
a subsystem node opens AERIS on that subsystem's topic and highlights the
corresponding region of the engine mesh (a named `Object3D` sub-group, not
a separate physical part) rather than selecting a different catalog part.

## 8. Aerodynamics / Wing / Wind Turbine labs (real, working mini-simulators)

Pure-JS, DOM-free, jsc-tested engines; each lab screen is a 2D canvas
(streamline/particle animation, matching the ASCII sketches in the
original prompt) + sliders + a live numeric readout, all driven by the
SAME computed numbers the canvas draws (no separate "looks right" fudge).

- `web/js/labs/aero-lab.js`, `RSX.labs.aero.compute({span, chord, sweepDeg,
  aoaDeg, velocity, airfoil})` -> `{CL, CD, lift, drag, streamlineCurvature}`
  using thin-airfoil theory (`CL = 2*pi*sin(aoa)` for a symmetric section,
  a camber offset for cambered presets) plus flat-plate parasitic drag +
  an induced-drag term (`CD = CD0 + CL^2/(pi*AR*e)`); explicitly labeled
  "simplified 2D thin-airfoil model, not CFD" in the UI.
- `web/js/labs/wing-lab.js`, `RSX.labs.wing.compute({span, chord, sweepDeg,
  thickness, airfoil, aoaDeg, winglets, material})` -> the same
  lift/drag core plus an aspect-ratio (`AR = span^2/planformArea`)
  efficiency factor and a simple mass estimate from span/chord/thickness/
  material density (for the "geometry -> performance" chain in §9).
- `web/js/labs/turbine-lab.js`, `RSX.labs.turbine.compute({bladeCount,
  bladeShape, pitchDeg, rotorDiameter, bladeLength, windSpeed,
  generatorEfficiency})` -> `{powerCoefficient (capped at the Betz limit
  0.593), rotorPower, electricalPower, tipSpeedRatio, rpm, torque}` via
  the standard `P = 0.5 * rho * A * v^3 * Cp * genEff` wind-power formula,
  `Cp` modeled as a smooth function of tip-speed-ratio and blade count
  peaking near (but never exceeding) Betz.
Each has a canvas renderer (`web/js/labs/*-canvas.js` or a shared draw
helper) showing streamlines/rotor animation whose curvature/speed is
driven by the compute() output, and a one-line "what just changed"
callout (AERIS-backed) whenever a slider moves, per the original spec's
"if the user changes something, visually explain what changed" (§9).
Structures/Avionics/Thermal (§6's remaining sub-bullets) ship as AERIS-
backed concept panels with static illustrative diagrams (stress
color-map on a beam under a slider load using a textbook
`sigma = M*c/I` beam-bending formula -- real formula, toy geometry,
labeled as such) rather than a full FEA/thermal solver, which is out of
scope for a static site; state this limitation in the panel itself.

## 9. Propulsion Lab (engine breakdown, crafting walkthrough, test stand)

Reuses the REAL engine machinery already in game.html's flight screen
(`ENGINE_CATALOG`, `previewEngine`, the pros/cons compare panel) instead
of building a second engine system -- promote that machinery into a
standalone `#screen-propulsion` lab, generalized to work pre-flight (it
currently assumes a live `veh`; factor its pure math into
`RSX.rocket.engineCompare(engineDef, throttle, pa)` so both the lab and
the in-flight panel call the same function).

Engine 3D model gains named sub-groups (informational subsystems, not new
physical parts, per 2.3's `subsystems`): combustion chamber, injector
(schematic ring), turbopump block (schematic cylinder pair), 3-4 cooling
channel lines (thin tubes along the chamber), nozzle throat/diverging
sections (already geometrically distinct via `drawEngineBell`'s math --
extend to 3D with a real throat-to-exit profile instead of a straight
cone), actuator arms (small boxes near the gimbal plane), thrust-structure
ring at the mount. Clicking a sub-group opens AERIS on that subsystem's
topic (purpose + "connected systems" list, per the spec's COMPONENT
card).

A guided WALKTHROUGH mode (10 steps per §12, Next/Back/Skip) highlights
each sub-group in turn with an AERIS card; completion is cosmetic
(no separate "crafted" engine object -- the REAL engine the user is
already flying/comparing IS the thing being explained, keeping this
connected to the rest of the app per §28, not a disconnected mini-game).

ENGINE TEST STAND: the existing live thrust/Isp preview, generalized into
a dedicated screen with animated gauges (chamber pressure, thrust,
mass flow, computed Isp, thermal-load placeholder derived from `q` at the
throat) driven by a throttle slider and START/PAUSE/RESET, using the same
`engineCompare` function -- genuinely live numbers, not a canned
animation. Engine COMPARISON (§17) reuses the existing pros/cons cards,
adding small bar-chart graphs (thrust/Isp/mass) alongside the numbers.

## 10. Slice order (implement -> adversarial verify -> fix, per stage-2-plan.md sections 6-7's protocol; each slice is its own Workflow run)

Do not start a slice before the previous one's verifier passes. Every
slice: keep all existing tests passing and never reduce the count; CADET_I
numbers unchanged; explicit-file commits ending with the Sonnet 5
attribution line; push to origin/game-build; real-browser verification
with real clicks, fresh tab, zero console errors.

- **L1 -- Rocket Library data + selection screen.** `rocket-library.js`
  (10 vehicles, scaled-stack support in `layoutStack`/`buildVehicle`,
  `test-scaled-parts.js`, `test-rocket-library.js`), `#screen-library` as
  the new default landing screen: filterable card grid (ALL/NASA/SPACEX/
  HISTORICAL/CURRENT/CANCELLED/HEAVY-LIFT/CREWED/REUSABLE chips), each
  card a live small 3D preview (reuses assembly-3d's renderer in an
  isolated canvas or a shared instance re-targeted per hover -- pick
  whichever avoids duplicating the Three.js scene setup) + specs table +
  dataConfidence label + INSPECT/BUILD/SIMULATE. Wait for Stage-2 F2 to
  have landed before starting (shared file: game.html). Acceptance: all
  10 vehicles render distinguishable silhouettes (a Starship-scale ship
  visibly different from a Falcon-1-scale one), filters narrow the grid
  correctly, BUILD on Falcon Heavy loads its design into the Design
  screen and its stats compute (no NaN, no throw), a scaled engine's
  thrust is provably `RSX.thrustN` at the scaled geometry (not linear
  guess) via a jsc test and a live JS-state check.

- **L2 -- 3D visual upgrade to the current buildable rocket + component
  tree + richer detail panel.** Directly answers the "looks like a
  pencil" complaint: nose gets a shoulder ring + tip cap, tanks get dome
  caps + 2-3 structural rings + a longitudinal feed-line, engines get a
  distinct throat/skirt profile instead of one cylinder, decoupler gets a
  visible separation band (already partly done in F1) plus bolts/ring
  detail, fins get thickness + a root fillet. Materials: metal
  (roughness/metalness tuned per class), a carbon-fiber-look
  normal/roughness variation for fairings, distinct nose/tank/engine
  palettes (not one flat color per class). Lighting: a 3-point rig
  (key/fill/rim) + a subtle engineering-floor grid plane + soft shadows.
  Component tree (section 7) added to Design + Assembly. AERIS stub
  (section 6, minimal content map covering existing catalog parts + TWR/
  static-margin/delta-v concepts) docked on both screens. Acceptance:
  screenshot comparison shows visibly more mechanical detail than the
  pre-L2 rocket at the same camera angle; tree selection and 3D selection
  stay in sync both directions; AERIS returns non-empty beginner/
  engineering/advanced text for every existing catalog part id (test +
  live check); zero console errors; CADET_I numbers unchanged.

- **L3 -- Visualization mode bar** (section 4): Exterior/Engineering/
  X-Ray/Cutaway/Exploded/Isolate, keyboard shortcuts E/X/R, added to the
  CONTROLS overlay. Acceptance: each mode visibly changes the scene
  (before/after screenshots), survives a design change while active,
  Cutaway reveals internal tank/feed-line geometry, zero console errors.

- **L4 -- Assembly interaction upgrade**: connection-point nodes,
  drag-preview snapping, incompatible-placement feedback (reusing
  `RSX.rocket.rules.connectionNodes`), undo/redo (a simple design-history
  stack in game.html), orbit/pan/focus/isolate already exist -- wire
  Focus/Isolate to the tree and mode bar from L2/L3 rather than
  duplicating. Acceptance: dragging a tank onto an invalid location
  (above an engine) shows red + the plain-language reason and refuses;
  a valid drop snaps and updates the design; Ctrl+Z undoes the last
  structural edit.

- **L5 -- Aerodynamics Lab + Wing Lab** (section 8, first two labs).
  Acceptance: moving AoA/span/sweep sliders changes CL/CD/streamline
  curvature live and matches a hand-computed thin-airfoil value in a jsc
  test; the "what changed" callout fires on every slider move.

- **L6 -- Wind Turbine Lab + Structures/Avionics/Thermal concept panels**
  (section 8, remainder). Acceptance: turbine power never exceeds the
  Betz limit at any slider combination (test); RPM/torque/power update
  live; the beam-bending demo's stress color map responds to the load
  slider.

- **L7 -- Propulsion Lab** (section 9): engine sub-group breakdown,
  10-step AERIS-guided walkthrough, generalized engine test stand,
  engine comparison with bar charts. Acceptance: every sub-group is
  clickable and opens the right AERIS topic; the test stand's thrust/Isp
  readouts match `engineCompare` exactly at the current throttle (live
  JS check); walkthrough Next/Back/Skip all work.

- **L8 -- AERIS coverage + Beginner/Engineering/Advanced global toggle**
  (folds in remaining pieces of section 6, and Stage-2 F7/§24's detail
  level control) across every screen built so far. Acceptance: the jsc
  coverage test (section 6) passes for every part/subsystem/concept
  topic introduced by L1-L7; switching the global tier changes AERIS,
  the stats panel, and the propulsion lab's detail depth consistently.

- **L9 -- Mission Simulator + Simulate/Telemetry screens** (folds in
  Stage-2 F5/F6): a headless predictor (reusing F1's `flight.js` kernel,
  not a new physics model) for the SIMULATE screen's pre-flight
  prediction, real multi-stage flight in the LAUNCH screen (auto/manual
  staging, dropped stages fly as real bodies), a MISSION screen for
  launch-site/target-altitude/payload selection feeding the predictor,
  and a TELEMETRY screen/overlay charting `RSX.rocket.telemetry`
  (reusing F1's recorder). Acceptance: predicted apogee from SIMULATE is
  within a sensible band of the LAUNCH screen's actual flown apogee for
  the same design; a two-stage design separates for real in flight;
  telemetry shows the flight just flown after reload.

- **L10 -- Guided tutorial + Learning/Engineering mode + polish pass**
  (section 23-24, plus a final whole-app QA pass against the original
  prompt's closing checklist: no broken buttons, no dead nav, no missing
  images, no overlapping UI, no unreadable text, no leftover
  placeholders). Acceptance: fresh-profile tutorial completes and can be
  skipped; Learning vs Engineering mode visibly changes control density
  across Library/Design/Assembly/Labs; a full click-through of every
  screen and every mode/toggle introduced by L1-L9 shows zero console
  errors and zero visibly broken states.

## 11. Protocol

Identical to stage-2-plan.md sections 6-7 (read/implement-only-your-slice/
test/browser-verify/commit-explicit-files/push for implementers; assume-
broken-until-proven, real input, regression-check, PASS/FAIL report for
verifiers), with the attribution line updated to
`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` and the CADET_I
baseline restated: Design-screen stats 5.61 t / 1.01 t / 4.60 t / 251.5 kN
/ 276.7 kN / TWR 4.57 / 283/311 s / 50.8 s / 5237 m/s / CoM 4.31 m / 0.86
cal MARGINAL.
