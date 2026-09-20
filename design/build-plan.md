# Rocket Simulator — Phased Build Plan

Date: 2026-09-21. Applies to branch `game-build` at `945c2a0`. Read
`design/architecture-analysis.md` first: it is the inventory this plan acts on.
Spec of record: `design/requirements.md` (cited as R-n). Where this plan cites
`critique.md` it means the rulings C1-C15, gaps G1-G14, the locked data model
(critique.md:67-344) and the 18-step build order (critique.md:392-411).

Process rules that bind every phase (R-2, R-51, R-75, and the owner's
auto-commit rule):

1. **Extend, never rewrite.** `physics-core.js`, `renderer.js` and the
   `flight-loop.js` vehicle contract are kept; new behaviour is added as new
   functions, new optional fields, or new modules. game.html is carved into
   modules by moving blocks *verbatim* into files, never by re-implementing them.
2. **Sim first, visuals on top.** Every phase lands its simulation/data change,
   its headless tests, and only then its rendering/UI. No HUD or builder number
   may be computed anywhere except from the simulation (R-53).
3. **Tests after each major system** (R-50). `tests/js/run.sh` must be green
   before a phase is declared done; each phase adds its own `test-*.js` file.
4. **Commit + push each increment** to `elliotthevex/rocket-simulator` on
   `game-build` (owner's standing rule).
5. **No new literals for world constants**: every threshold reads
   `planet.*` (critique C1).

---

## 0. Decisions

### 0.1 Reconciling R-52's P1..P7 with critique.md's 18 steps

Steps 0-5 are recorded as done in commit 9a128a8 and verified by the readers
(`architecture-analysis.md` §2), with two leftovers from STEP 0 (the `fmt`
module) and STEP 1 (plume fields on `FUEL_PRESETS`). The remaining steps map
into R-52's phases as follows. Where the two orders disagree, R-52 wins
(requirements.md:5-7) and the critique's *reason* for its order is honoured by a
mitigation.

| critique step | Content | Lands in | Note |
|---|---|---|---|
| STEP 0 leftover | `fmt*` module; conventions header committed to `design/` | **P1** | G14: the only place SI is converted for display |
| STEP 1 leftover | `plumeOpacity`/`plumeColor`/`sootFactor` | **P1** | Data lives in `parts/propellants.js`; `RR.FUEL_VIS` keeps rendering it |
| STEP 2/3 defects | `railsAdvance` dir, ablation cooling, inertia station, NaN halve, cache invalidation on events, contact dt term, `planet.g0` in contact | **P3** | Kernel bug fixes with tests, all inside existing functions |
| STEP 4/5 leftovers | `drawPartVector` dispatch, sprite cache, `targetPpmFor` re-enable, shake | **P2** (drawPartVector for palette thumbnails), **P4** (camera), **P7** (sprite cache, material passes) | |
| STEP 6 CONTROL | CTL intent object, A/D rate command, gimbal/RCS/RW chain, `event.code`, `preventDefault` | **P4** | |
| STEP 7 AUDIO | plume roar, thump, ticks, warp tone | **P4** (roar + staging thump, ~60 lines) and **P7** (full set, R-43) | The critique's argument — you cannot judge staging in silence — is honoured by shipping the roar with staging |
| STEP 8 STAGING | graph split, recompute, impulse at decoupler, ullage delay, debris cap | **P2** (stage records in DESIGN + stage list UI), **P4** (runtime separation) | |
| STEP 9 WARP | PHYS substepping, RAILS gates, auto-drop, warp-to | **P4** (PHYS warp, pause) and **P5** (RAILS, warp-to-Ap/Pe) | |
| STEP 10 HUD | derived-angle module, attitude ring, tapes, gauges, status triad | **P4** | Dark holographic language per §0.2 |
| STEP 11 TELEM + EVENT + ring | read-only frame, event bus, 4 Hz snapshot ring, checkpoints | **P4** (TELEM + EVENT, required by the HUD) and **P5** (ring, rewind, checkpoints) | |
| STEP 12 FAILURE + DEBRIEF + REWIND | named causes, slow-mo, debrief, dv ledger closure | **P5** | |
| STEP 13 HEATING + LANDING | skin temperature, burn-through, contact points, tip-over, LANDED, plasma | **P3** (contact wiring + LANDED mode, because it is core physics) and **P5** (heating, tip-over, plasma) | |
| STEP 14 CATALOG + BUILDER | `layoutRocket`, snap nodes, CoM/CoP, per-stage dv/TWR, auto-stager, pre-flight check | **P1** (catalog data + `layoutRocket` + vehicle build) and **P2** (builder UI) | The critique deliberately placed the builder late so that it is never "attached to a rocket that flies badly". Mitigation: the hardcoded test vehicle keeps flying and stays under headless regression throughout P1-P3; the builder is validated by round-tripping that exact vehicle through the catalog (P1 exit criterion) |
| STEP 15 MAP | camera mode, analytic conic, markers, PiP | **P5** | |
| STEP 16 EDUCATION | callouts, missions, pitch guide, debrief rules | **P6** (missions, sandbox, tech tree; callouts as nice-to-have) | |
| STEP 17 POLISH | adaptive quality, reduced motion, touch, JSON share, HUD tiers, Test Stand sub-mode, final grep | **P7** | |

### 0.2 The three Known Conflicts (requirements.md:267-281) — decisions

**Conflict 1 — palette.** *Decision:* the dark metallic holographic language
is the default for every screen of the game (`web/game.html` and everything
carved from it). Implementation: keep every existing token NAME (`--bg`,
`--panel`, `--card`, `--ink-*`, `--accent`, `--stat-*`, `--prop-*`, `--hud-*`)
and the Barlow Condensed / IBM Plex type stack; move the dark values into `:root`
as the default, retune them toward cool steel (`--bg #0B0F12`, `--panel #10161B`,
`--card rgba(16,22,27,.72)`, `--ink-secondary` cool grey `#9FB0BC`), add the
addendum's semantics additively (`--hud-line`, `--hud-glow`, `--info-cyan`,
`--stat-success`, `--panel-blur`), and keep the warm-paper values under
`:root[data-theme="light"]` so `index.html`'s bench still renders as designed.
Status colours follow R-47v (NORMAL cool grey, ACTIVE amber = `--accent`,
WARNING `--stat-caution`, CRITICAL `--stat-critical`, SUCCESS `--stat-success`
green) and every status is doubled with a glyph and a word (ux-layout.md:721) so
the green/red pair stays colour-vision safe. `--stat-info` becomes the subtle
cyan. ux-layout.md's anti-glow / opaque-panel / radius-ladder rules are
superseded for the game chrome; its geometry (attitude ring, G-meter, warp
widget, clear stage rectangle, tiers) is kept.

**Conflict 2 — planet scale.** *Decision:* keep the scaled HOME planet (R =
600 km, critique C1) as the default and REAL EARTH as a settings toggle; both
already exist in `RSX.PLANETS`. `RSX.PLANETS` is the extension table R-49 asks
for; each record gains `pa0`, `T0`, `skyKeyframes`, `groundColor`, `hasPad` so
no module switches on `planet.id`. The Mars body stays in the table as data;
the abstract Mars coast in game.html (M, [, ] keys) is moved out of the default
flight loop into a **sandbox scenario** in P6 and its keys are released to the
standard map (R-12..17, game-mechanics §2.1).

**Conflict 3 — combustion vs parametric engines.** *Decision:* the part schema
carries `engine.model: "combustion" | "parametric"`. Combustion engines supply
`{propKey, pcDesign, throatD, exitD, efficiency, grain?}` and are built with the
*existing* `RSX.makeMotor`/`thrustN`/`massFlow`/`peIdeal`/`isSeparated`.
Parametric engines supply `{propKey, thrustVac, thrustSL, ispVac, ispSL, exitD}`
and are interpolated linearly in `pa/planet.pa0`. Both are wrapped by one
`EngineInstance` interface in `rocket/engine.js` (`thrustAt(pa, thr)`,
`mdotAt(pa, thr)`, `ispAt(pa)`, `pcAt(thr)`, `peIdeal(pa)`, `isSeparated(pa)`,
`motor` for the plume renderer). The vehicle sums instances into the
`thrustNow`/`mdotNow` contract the kernel already consumes, so `deriv` and
`stepVerlet` need no change for this. All first-pass catalog engines are
authored as combustion (the more real model); parametric exists so imported or
placeholder parts still fly and so the parametric adapter is tested.

### 0.3 Further decisions the plan needs

- **Key map** (R-12..R-17, R-9, R-47, game-mechanics §2.1): A/Left, D/Right
  rotate (rate command); W/Up, S/Down throttle; Z full, X cut; Space = next
  stage; T = SAS toggle, 1-4 SAS modes; R = RCS; M = map; P = pause; `.` `,`
  warp up/down; F5/F9 checkpoint; Backquote = back to pad; H = HUD tier; E =
  engine panel; Escape = close/pause. `event.code` only, `preventDefault` on
  Space/arrows/Tab. Bindings live in one table in `game/input.js` (R-17
  "configurable").
- **Warp ladder** (R-47 vs critique C3): displayed rungs 1, 2, 5, 10, 50, 100,
  1000, 10 000. Rungs 1-10 are PHYS substepping through `RSX.advance` (10x at
  60 Hz with h = 1/120 is 20 substeps, inside the critique's 48 cap). Rungs
  >= 50 are RAILS and require all five critique gates. Auto-drop rule: step
  down while `dt_step > tToEvent/6`; forced 1x below 500 m AGL descending.
- **Missions**: ten (R-29 wins over the critique's five) but each is a pure
  predicate on TELEM with progressive hints, i.e. content not code.
- **Career / tech tree** (R-31/R-32 win over the critique's cut): data-only
  unlock flags on part defs; sandbox ignores them. No funds economy (part
  `cost` is displayed and summed, never spent).
- **State field names**: existing names stay (`S.th`, `S.om`, `planet.wp`,
  `ctrl.throttle/gimbal/tauRCS`). The critique's spec names appear only in the
  new TELEM frame (`pitch`, `omega`, ...) and the new CTL intent object.
- **Particle cap**: base 1800 (`RR.makeParticles(1800)`) scaled by the quality
  tier (P7); game.html's 3200 is reduced when the cap becomes data.
- **Blueprints store no derived fields** (R-33 `{name, parts, stages}`):
  `sTop/sBot/x` are recomputed by `layoutRocket` on load, so catalog geometry
  edits never invalidate saved designs. This is a deliberate deviation from
  critique.md:200-203.

---

## 1. Coordinate & Unit Conventions (R-45/R-46)

Committed here so it can be cited; identical to physics-core.js:4-19 and the
renderer header, with the additions marked NEW.

- **Units**: strict SI in every stored field — m, kg, s, N, Pa, K, rad, kg/m^3,
  W/m^2. No km, deg, t, MPa in state or in part data files. Conversion to
  friendly units happens only in `ui/fmt.js` (`fmtAlt`, `fmtVel`, `fmtMass`,
  `fmtDv`, `fmtPressure`, `fmtTemp`, `fmtTime` as `T+MM:SS`, `fmtPct`,
  `fmtAngle`). Part data files are validated at load: any key ending in `Deg`,
  `Km`, `MPa`, `Tonnes` is rejected.
- **World / PCI frame**: planet-centred inertial, non-rotating. Origin at the
  planet centre; `+y` passes through the launch pad at `t = 0`; surface at
  `|r| = planet.R`. `S.rx, S.ry` in m; `S.vx, S.vy` inertial m/s. Planet
  rotation enters only through `planet.wp` in the atmosphere's velocity
  (`v_atm = (-wp*ry, wp*rx)`) and the pad's initial inertial velocity
  `vx = -wp * R` (tree convention, negative; critique.md:248 shows +174.5 —
  the tree is authoritative).
- **Angles**: `S.th` is the body-axis angle, CCW positive, measured from PCI
  `+x`, **unwrapped**; only differences are wrapped, via `RSX.wrapPi`.
  `S.om` in rad/s, CCW positive. Torque `tau` CCW positive. On the pad
  `th = pi/2`. Display angles (pitch from local vertical, flight-path angle,
  heading rate) are derived in one module, `physics/frames.js` (NEW, P4); no
  other module may call `Math.atan2` on a state vector.
- **Body frame**: `bHat = (cos th, sin th)` is the nose direction (+x_b);
  `+y_b` is 90 deg CCW from it (port side). **Station** `s` = metres from the
  nose tip, positive aft; `x_b = s_cm - s`. Lateral offset `x` in metres,
  positive to `+y_b`. Aft-of-CM stations have negative `x_b`; CP aft of CM
  gives `xcp_b < 0` and a restoring torque.
- **Gimbal**: `ctrl.gimbal` in rad, positive rotates the thrust vector CCW;
  torque `-ell * T * sin(gimbal)` with `ell = sEngine - s_cm`.
- **Angle of attack**: `alpha = atan2(bHat x wHat, bHat . wHat)` on
  air-relative velocity; NaN in TELEM when `Vsurf < 30 m/s`.
- **Pad-local render frame** (renderer.js:137-138): `+y` up, origin at the pad
  surface, planet centre at `(0, -R)`; PCI is rotated into it by
  `padAngle = pi/2 + wp * t` (game.html:572-598). Camera in metres; zoom
  interpolated in log space; `applyCamera` returns px/m.
- **Renderer body frame** (renderer.js:220-223): origin at the nose tip,
  `+y` **aft** (i.e. `+y_render = s`), metres. Builder canvas draws each part at
  `screenY = padTop + s * pxPerM` (critique C6). One frame for physics
  stations, builder and sprite art.
- **Time**: `S.t` mission-elapsed sim seconds; physics steps at fixed
  `h = 1/120 s` nominal via `RSX.chooseDt`; wall clock only drives the frame.
- **Mutability**: `S` is written in place by `RSX.stepVerlet`, `RSX.advance`,
  `RSX.contactResponse`, and the mode switches (rails/LANDED reconstruction);
  every out-of-band write sets `cache.valid = false`. Everything else reads
  `TELEM` (P4 onward).
- **Orbital elements**: `dir = +1` prograde (CCW), `-1` retrograde; `nu`
  geometric from periapsis; `apR/peR` NaN (never Infinity) when energy >= 0.
  Inclination is identically 0 in the planar model and is displayed as `0.0`.

---

## 2. Proposed module layout (`web/js/`)

Existing files stay where they are and keep their `RSX` namespaces. New files
attach sub-namespaces. All modules under `parts/`, `rocket/`, `physics/`,
`game/` must load in `jsc` with no DOM (that is how the tests run); `ui/` and
`render/` may touch the DOM.

```
web/
  game.html                 becomes a loader + shell: <script> tags in order,
                            markup for screens; inline script shrinks each phase
  index.html                Static Fire Bench, untouched until P7 (Test Stand sub-mode)
  css/
    tokens.css              (P1) tokens: dark default, [data-theme="light"], type stack
    hud.css   builder.css   menu.css  panels.css   (P2/P4/P7)
  js/
    physics-core.js         RSX.*            kernel (extend only)
    renderer.js             RSX.render       primitives (extend only)
    flight-loop.js          RSX.testVehicle  hardcoded regression vehicle (kept)
    parts/                  RSX.PARTS        data files — JSON objects inside a
      registry.js             register()/get()/validate()  (P1)
      propellants.js          FUEL_PRESETS extension: plume/soot fields (P1)
      engines.js tanks.js command.js structural.js aerodynamic.js utility.js  (P1)
    rocket/                 RSX.rocket
      layout.js               layoutRocket(design) -> sTop/sBot/x, attach graph (P1)
      engine.js               EngineInstance: combustion | parametric adapters (P1)
      vehicle.js              buildVehicle(design, stageIndex) -> veh (kernel contract) (P1)
      aero.js                 Barrowman contributors from geometry (P1 minimal, P5 full)
      stats.js                builder stats: masses, dv, TWR, burn, CoM/CoT/CoP, SM (P2)
      staging.js              stage actions, auto-stager, validate staging (P2 data, P4 runtime)
      validate.js             launch check (R-42) (P2)
      simulate.js             headless flight for tests + builder estimates (P1)
    physics/                RSX.phys
      loop.js                stepFlight(): RSX.advance + contact + events + warp (P3/P4)
      frames.js               pitchFromVertical, fpa, aoa, headingRate (P4)
      control.js              CTL intent, rate controller, gimbal/RCS/RW chain, SAS (P4)
      telem.js                buildTelem(), dv ledger (P4)
      failures.js             failure/warning evaluators (P5)
      thermal.js              skin-temperature wiring over RSX.advanceThermal (P5)
      orbit.js                rails mode machine, warp-to, prediction (P5)
    game/                   RSX.game
      state.js                screen state machine + event bus (P1)
      input.js                key table, pointer, touch (P1 skeleton, P4 flight keys)
      blueprints.js           localStorage save/load/migrate (P2)
      flight.js               flight screen orchestration (carved from game.html) (P3/P4)
      missions.js sandbox.js tech.js  (P6)
      audio.js                (P4 roar, P7 full)
      settings.js quality.js  (P7)
    ui/                     RSX.ui
      fmt.js                  the only SI->display converter (P1)
      menu.js builder.js partpanel.js stagelist.js checklist.js  (P1/P2/P4)
      hud.js  attitude-ring.js  tapes.js  telemetry-graph.js  warnings.js  (P4)
      debrief.js  map-overlay.js  (P5)
    render/                 RSX.render (same namespace, new files)
      scene.js                draw() carved from game.html; layer order (P3)
      vehicle-art.js          drawPartVector dispatch + sprite cache (P2 thumbnails, P7 cache)
      map.js                  planet disc, conic, markers (P5)
      effects.js              separation, explosions, plasma, clouds (P4-P7)
tests/js/
  harness.js run.sh           existing; run.sh extended to load the game.html script list
  test-smoke.js test-propulsion.js   existing
  test-validation.js          wraps RSX.runValidation (P1)
  test-parts.js test-layout.js test-vehicle.js test-blueprints.js test-stats.js
  test-kernel-fixes.js test-contact.js test-staging.js test-control.js
  test-telem.js test-warp.js test-orbit.js test-failures.js test-missions.js
```

**Why data files are `.js`, not `.json`:** game.html is opened over
`file://` and `http.server` alike and the tests run in `jsc`; neither has a
synchronous JSON fetch. Each data file is a JSON object literal wrapped in
`RSX.PARTS.register([ ... ])`, so the content *is* JSON (a test asserts
`JSON.parse(JSON.stringify(def))` round-trips and that no functions appear).

---

## 3. Test mechanism (R-50)

`tests/js/run.sh` already runs every `tests/js/test-*.js` under macOS's bundled
JavaScriptCore against `physics-core.js` + `flight-loop.js` (commit 02e955b).
Extend it, in P1:

1. **Load list from the page.** `run.sh` extracts `src="js/..."` from
   `web/game.html` in document order and loads those files before `harness.js`.
   One source of truth for module order; a test (`test-smoke.js`) asserts every
   `RSX.*` namespace the page declares is present.
2. **Shims in `harness.js`:** an in-memory `localStorage` (`Map`-backed,
   throws on demand to test the try/catch paths), `performance.now`, a `console`
   guard. No DOM shim: modules that touch `document` at load time fail the
   suite, which enforces the `ui/`/`render/` boundary.
3. **`test-validation.js`** registers each `RSX.runValidation()` result as a
   test, so the 24 kernel checks run on every `run.sh`.
4. **Golden numbers** live next to the test that uses them with a one-line
   derivation (e.g. Tsiolkovsky 1000->400 kg at Isp 300 s = 2696 m/s).
5. **Optional Node path**: `tests/js/run-node.js` evaluating the same load list
   in a `vm` context, for CI machines without `jsc`. Not required locally.
6. **Browser smoke**: `RSXTick`/`RSXSetState` (game.html:1245-1280) are kept
   with stable signatures; a manual `web/qa.html` page is not built until P7.

Run: `sh tests/js/run.sh` (all) or `sh tests/js/run.sh staging` (filter).
Exit code non-zero on any failure.

---

## 4. Phases

Each phase lists: goals, new/changed files, what existing code is extended,
tests, exit criterion.

### P1 — Foundation (state, render shell, input, rocket object, basic parts)

**Goals.** Turn the vertical slice into a modular shell without changing what
it does: screen state machine, formatting layer, dark-default tokens, input
table, the data-driven parts catalog, `layoutRocket`, `buildVehicle` that emits
the exact `veh` shape the kernel already flies, and the test runner extension.
The hardcoded test vehicle must be reproducible from the catalog.

**New files.** `css/tokens.css`; `js/ui/fmt.js`; `js/game/state.js`;
`js/game/input.js` (skeleton: key table + `RSX.game.input.bind(screen)`);
`js/parts/registry.js`, `propellants.js`, `engines.js`, `tanks.js`,
`command.js`, `structural.js`, `aerodynamic.js`, `utility.js`;
`js/rocket/layout.js`, `engine.js`, `vehicle.js`, `aero.js` (minimal: nose,
transition, fin CNa/CP from geometry), `simulate.js`; `js/ui/menu.js`
(ROCKET LAB skeleton: six items, star-field backdrop from `RR.buildStarField`,
no dressing yet); `tests/js/test-validation.js`, `test-parts.js`,
`test-layout.js`, `test-vehicle.js`.

**Existing code extended.**
- `physics-core.js`: add `pa0`, `T0`, `skyKeyframes`, `groundColor`, `hasPad`
  fields to each `PLANETS` record (data only); `FUEL_PRESETS` gets
  `plumeOpacity`, `plumeColor`, `sootFactor` (critique C13) via
  `parts/propellants.js` writing into the existing objects; the `dot` CSS
  strings move to `ui/`. No function changes.
- `game.html`: the CSS tokens block (:15-33) is replaced by a `<link>` to
  `css/tokens.css` with the same names; the script tag list grows; the
  inline script keeps flying the test vehicle **unchanged**.
- `renderer.js`: `SKY_KEYFRAMES` is exported as `RR.EARTH_SKY_KEYFRAMES`
  (one line) so planet records can reference it.
- `flight-loop.js`: untouched; it is the regression oracle for `buildVehicle`.
- `tests/js/run.sh`: load list from game.html; shims.

**Part schema (JSON).** One object per part; `null` sub-objects are omitted.

```json
{
  "id": "engine.k1",
  "cls": "engine",
  "name": "Vulcan-1",
  "cat": "engines",
  "tech": "propulsion.1",
  "cost": 1200,
  "desc": "Sea-level kerolox engine. Gimbals 8 deg; throttles to 40 %.",

  "geom": { "L": 2.4, "Dtop": 1.2, "Dbot": 1.1, "Dmax": 1.2 },
  "dryMass": 630,
  "nodes": {
    "top":    [ { "ds": 0.0, "dx": 0.0, "size": 1.2 } ],
    "bot":    [ { "ds": 2.4, "dx": 0.0, "size": 1.2 } ],
    "radial": [ ]
  },

  "aero":   { "cdBase": 0.05, "cnAlpha": null, "sPlan": null, "shape": "cylinder" },
  "struct": { "maxQ": 90000, "maxAeroLoad": 3000, "maxSkinTemp": 1200,
              "impactTol": 2.0, "crashTol": 12,
              "contactPoints": [ { "s": 2.4, "x": 0.0 } ] },
  "thermal": { "cp": 900, "area": null, "emissivity": 0.85, "ablatorMass": 0 },

  "engine": {
    "model": "combustion",
    "propKey": "rp1",
    "pcDesign": 10.0e6, "throatD": 0.145, "exitD": 0.580, "efficiency": 0.94,
    "throttleMin": 0.40, "canShutdown": true, "ignitions": 2,
    "gimbalMax": 0.140, "gimbalRate": 0.70, "ullageDelay": 0.15,
    "heatFrac": 0.004, "sGimbal": 2.4
  },
  "grain": null,
  "tank": null,
  "pod": null,
  "decoupler": null,
  "fin": null,
  "chute": null,
  "leg": null,
  "rcs": null,

  "draw": { "kind": "engineBell", "skin": "steel", "bellLen": 1.4 },
  "teaches": "areaRatio"
}
```

Field notes (all SI): `geom.L` along the station axis; `Dtop/Dbot` for
conical adapters and the transition CNa term; `nodes.*.ds` from the part's own
top face, `dx` lateral, `size` must match the mating node within 5 % or the
snap is refused; `aero.cnAlpha: null` means "derive from geometry in
`rocket/aero.js`" (nose: 2.0 at `NOSE_CP_FACTOR[shape]*L`; transition:
`2[(Dbot/Dref)^2 - (Dtop/Dref)^2]`; fins: Barrowman), a number overrides;
`struct.contactPoints` in body coords (`s`, `x`); `engine.heatFrac` is the
fraction of thrust power deposited as skin heating for R-6 "heat production";
`engine.sGimbal` is the gimbal-plane station from the part top. Sub-objects:

| cls | sub-object | fields |
|---|---|---|
| engine (combustion) | `engine` | as above |
| engine (parametric) | `engine` | `model:"parametric", propKey, thrustVac, thrustSL, ispVac, ispSL, exitD, throttleMin, canShutdown, ignitions, gimbalMax, gimbalRate, ullageDelay` |
| srb | `engine` (combustion, `canShutdown:false, throttleMin:1, ignitions:1, ullageDelay:0.05`) + `grain {outerD, coreD, length, numSegments, burnEnds, perimeterFactor}`; `propMass` derived = `numSegments * propVolume(grain,0) * propellant.density` | |
| tank | `tank {volume, propKey, allowed:[...], tankLen}`; capacity = `volume * bulkDensity(propKey)` | |
| pod | `pod {crew, tauRW, chuteOk, bluntNose, noseRadius}` | |
| decoupler | `decoupler {impulse, staysWith:"lower"|"upper"}` | |
| fairing | `decoupler {impulse, halves:2}` + `geom` encloses payload; `aero.shape:"ogive"` | |
| fin | `fin {count, rootChord, tipChord, span, sweep, thickness, deployable:false}` | |
| chute | `chute {area, cd, qMax, inflateTime, semiAlt, semiArea}` | |
| leg | `leg {tolVert, tolLat, tipAngle, cdDeployed}` + `contactPoints` | |
| rcs | `rcs {thrust, isp, count}` + `tank {volume, propKey:"monoprop"}` | |

**First-pass catalog (numbers from game-mechanics §5 converted to the schema;
thrust/Isp are *not* stored, they come from the nozzle model).**

| id | cls | L x D (m) | dryMass | key numbers |
|---|---|---|---|---|
| `pod.probe` Pathfinder | pod | 0.5 x 1.2 | 90 | crew 0, tauRW 2.5e3, maxSkinTemp 1200, impactTol 12 |
| `pod.mk1` Mk1 Capsule | pod | 2.2 x 2.4 | 1200 | crew 1, tauRW 1.2e4, bluntNose, noseRadius 1.1, ablatorMass 180, maxSkinTemp 1900, impactTol 12 |
| `tank.s` Kerolox S | tank | 4.0 x 1.2 | 260 | volume 4.50 (=> 4600 kg rp1), allowed rp1/ch4, maxQ 12000 |
| `tank.m` Kerolox M | tank | 8.0 x 2.4 | 1900 | volume 36.2 (=> 37 000 kg rp1) |
| `tank.l` Core L | tank | 16.0 x 4.8 | 13000 | volume 289 (=> 296 000 kg rp1); radial nodes x4 |
| `tank.m.ch4` Methalox M | tank | 8.0 x 2.4 | 1700 | volume 36.0 (=> 30 000 kg ch4) |
| `tank.m.lh2` Hydrolox M | tank | 10.0 x 2.4 | 1800 | volume 45.1 (=> 15 500 kg lh2), boiloff from preset |
| `engine.k1` Vulcan-1 | engine | 2.4 x 1.2 | 630 | rp1, pc 10.0e6, throatD 0.145, exitD 0.580 (eps 16), eff 0.94, gimbal 0.140, throttleMin 0.40, ignitions 2 -> model gives 251/277 kN, Isp 283/311 s (SL/vac) |
| `engine.kv` Vulcan-V | engine | 3.0 x 1.6 | 480 | rp1, pc 6.0e6, throatD 0.1635, exitD 1.267 (eps 60), gimbal 0.105, throttleMin 0.55, ignitions 3 -> model gives 224 kN vac, Isp 331 s; separated at sea level (x0.85 clamp) |
| `engine.m1` Prometheus | engine | 3.4 x 1.5 | 1700 | ch4, pc 25.0e6, throatD 0.192, exitD 1.216 (eps 40), gimbal 0.262, throttleMin 0.25, ignitions -1 -> model gives 1 202/1 313 kN, Isp 310/338 s |
| `engine.h1` Aquila | engine | 4.1 x 2.2 | 320 | lh2, pc 4.4e6, throatD 0.151, exitD 1.388 (eps 84), gimbal 0.070, throttleMin 0.20, ignitions 8 -> model gives 144 kN vac, Isp 443 s; separated at sea level |
| `srb.s` Kestrel-S | srb | 5.6 x 0.94 | 480 | grain OD 0.90 / ID 0.30 / L 1.60 x3, burnEnds, perimeterFactor 1.0 (plain BATES bore), throatD 0.227, exitD 0.642 (eps 8); prop 4 804 kg -> model gives pc(0) 5.29 MPa, 316 kN SL, 28.4 s burn (spec ~335 kN / 29 s). The validation suite's OD 0.94 / pf 1.8 variant stays as a test fixture only |
| `decoupler.s` | decoupler | 0.25 x 1.2 | 55 | impulse 2600 |
| `decoupler.m` | decoupler | 0.35 x 2.4 | 190 | impulse 9500 |
| `adapter.m-s` | struct | 1.2 x 2.4->1.2 | 144 | transition CNa derived |
| `fairing.m` | fairing | 4.0 x 2.4 | 520 | impulse 1800 per half, ogive |
| `nose.s` Aerocone S | struct | 1.6 x 1.2 | 60 | ogive, cdBase 0.26 |
| `nose.m` Aerocone M | struct | 3.2 x 2.4 | 240 | ogive, noseRadius 0.35 |
| `fin.d` Delta set | fin | root 1.0 / tip 0.4 / span 0.9 / sweep 0.55 | 120 (set of 4) | CNa via Barrowman (~2.4 per fin pair at D 1.2) |
| `chute.drogue` | chute | 0.6 x 0.6 | 80 | area 40, cd 1.0, qMax 25000, inflate 2.5 |
| `chute.main` | chute | 0.8 x 0.8 | 180 | area 320, cd 1.5, qMax 6000, inflate 4.0, semi below 1500 m |
| `leg.4` | leg | 1.2 x 1.4 | 260 | tolVert 6.0, tolLat 2.0, tipAngle 0.21, cdDeployed 0.06 |
| `rcs.quad` | rcs | 0.5 x 0.4 | 45 | 4 x 400 N, Isp 285, monoprop 60 kg |

The first-pass vehicle **Cadet I** (nose.s + pod.probe + tank.s + engine.k1 +
fin.d) is the test vehicle: `buildVehicle(cadetI)` must produce the same
`parts[]`, `mp`, `aeroContribs` station values and `sTail` as
`RSX.testVehicle.build()` within 1 % (P1 exit test).

**DESIGN record** (what `layoutRocket` consumes; identical to the blueprint
minus baked fields):

```js
design = {
  v: 1, name: 'Cadet I', seed: 0,
  parts: [
    { uid: 1, defId: 'nose.s',     parentUid: -1, attach: 'root',   nodeIdx: 0, mirror: false, propKey: null,  propFill: 1 },
    { uid: 2, defId: 'pod.probe',  parentUid: 1,  attach: 'bot',    nodeIdx: 0, mirror: false, propKey: null,  propFill: 1 },
    { uid: 3, defId: 'tank.s',     parentUid: 2,  attach: 'bot',    nodeIdx: 0, mirror: false, propKey: 'rp1', propFill: 1 },
    { uid: 4, defId: 'engine.k1',  parentUid: 3,  attach: 'bot',    nodeIdx: 0, mirror: false, propKey: null,  propFill: 1 },
    { uid: 5, defId: 'fin.d',      parentUid: 3,  attach: 'radial', nodeIdx: 0, mirror: true,  propKey: null,  propFill: 1 },
  ],
  stages: [ { actions: [ { uid: 4, verb: 'IGNITE' } ] } ],
  stagesLocked: false,
}
```

`layoutRocket(design)` walks the attach tree from the root (the part with
`parentUid -1`; exactly one), assigns `sTop` (parent's node station + node
`ds`), `sBot = sTop + L`, `x` (parent `x` + node `dx`, mirrored for
`mirror:true` pairs), rejects cycles, orphans and size mismatches with a
result `{ok, errors:[{uid, msg}]}` (never throws — R-41), and returns
`{parts:[{uid, def, sTop, sBot, x, parentUid, children[]}], sTail, Dmax}`.

**VEHICLE record** (`rocket/vehicle.js` `buildVehicle(design, stageIndex,
liveUids)`), a superset of the kernel contract:

```js
veh = {
  design, stageIndex, liveUids,
  // ---- kernel contract (physics-core.js:434-437, :515-520) ----
  parts:        [{ uid, name, dryMass, s, L, R, propMass, propMassFull, propTankLen, propKey }],
  mp:           RSX.massProps(parts),  s_cm,
  sEngine,      // thrust-weighted gimbal-plane station of LIT engines (single-engine: that engine's)
  sTail, Dmax, Sref, bluntNose, cd0Factor, aeroContribs, Splan, sCross, LfwdAft,
  thrustNow(pa, thr), mdotNow(pa, thr), advanceBurn(A, dt),
  tauExtra,     // N*m, engine lateral-offset torque (P3 kernel extension, one line in deriv)
  // ---- new ----
  engines:  [{ uid, def, inst: EngineInstance, x, sGimbal, lit, ignitionsLeft, ullageUntil, feed:[tankUid...] }],
  tanks:    [{ uid, propKey, mass, massFull, s, L }],
  props: { rp1, ch4, lh2, solid, monoprop }, propsMax: {...},
  chutes: [], legs: [], contactPoints: [{x, y}],   // body coords (renderer/contact frame)
  tauRW, skinTemp: 288, soot: 0,
  motor,        // largest lit engine's motor (renderer plume + HUD pc/pe)
  art: [{ uid, kind, sTop, L, D, x, skin }],       // for render/vehicle-art.js
};
```

Feed rule: an engine draws from tanks whose `propKey` matches, found by walking
up the attach tree until a decoupler; multiple tanks drain proportionally to
their remaining mass. `advanceBurn(A, dt)` subtracts `inst.mdotAt(...) * dt`
per engine from its feed tanks and, for `srb`, advances grain web
`w += burnRate(pc) * dt` and refreshes `propMass` from `propVolume`; it then
sets `veh.motor.pcNow`. `thrustNow` sums `inst.thrustAt(pa, thrEff)` over lit
engines with `thrEff = max(throttleMin, thr)` when lit and 0 when
`ignitionsLeft == 0` or feed empty (extends the tank-dry gate from 945c2a0).

**Tests (P1).** `test-validation.js` (24 kernel checks); `test-parts.js`
(every def validates; SI-suffix rule; JSON round-trip; every engine's
`pc(0)` for `srb` in 3-12 MPa; every combustion engine gives positive
sea-level thrust; capacities = volume x bulkDensity); `test-layout.js`
(Cadet I stations; cycle/orphan/size-mismatch errors returned not thrown;
mirror pairs symmetric); `test-vehicle.js` (buildVehicle(Cadet I) matches
`RSX.testVehicle.build()` in `mp.m`, `mp.s_cm`, `mp.I`, `sTail`, `sEngine`,
thrust at SL/vac within 1 %; `RSX.rocket.simulate` on it reproduces
`RSX.testVehicle.simulate` apogee within 1 %; parametric engine with
thrustVac/ispVac equal to the combustion engine's vacuum values gives the same
`mdotAt(0,1)`).

**Exit criterion.** `run.sh` green (>= 34 tests); game.html still flies the
vertical slice identically (manual: countdown, liftoff, R reset); the main
menu skeleton shows and can enter FLIGHT; the catalog round-trips Cadet I;
dark theme is the default with the light theme selectable; committed and
pushed.

### P2 — Builder (placement, attach, select, stats, save/load)

**Goals.** The Rocket Builder screen (R-3, R-34..R-36, R-68v/R-69v): parts
palette by category, click-to-place and drag with typed snap nodes, selection,
rotate/mirror, delete-with-subtree, duplicate, undo/redo, zoom/pan, grid,
symmetry, part info panel, live stats rail, stage list editing (R-9 data side),
launch validation (R-42), blueprints (R-33). Output is a DESIGN that P1's
`buildVehicle` turns into the flying `veh`; LAUNCH hands that `veh` to the
existing flight loop.

**New files.** `css/builder.css`, `css/panels.css`; `js/ui/builder.js`
(canvas + interaction), `js/ui/partpanel.js` (carved from game.html's
`#partPanel` code, :1054-1239), `js/ui/stagelist.js`, `js/ui/checklist.js`
(pre-flight card, R-42/R-54); `js/rocket/stats.js`, `staging.js` (data side:
`normalizeStages`, `autoStage`, `validateStages`), `validate.js`;
`js/game/blueprints.js`; `js/render/vehicle-art.js` (`drawPartVector(ctx,
part, opts)` dispatch over `def.draw.kind` calling the existing
`RR.drawNoseCone/drawBodySegment/drawFins/drawEngineBell` plus new
`drawCapsule`, `drawDecoupler`, `drawFairing`, `drawChute`, `drawLeg`,
`drawRcs`); `web/blueprints/*.json` presets (Cadet I, Sounding Dart, Orbiter-1,
Hauler B, Cryo Needle) loaded as data, never as code (R-33);
`tests/js/test-stats.js`, `test-blueprints.js`, `test-staging.js` (data side).

**Existing code extended.**
- game.html: the part panel and engine-drawer CSS/JS move verbatim to
  `ui/partpanel.js`/`panels.css` and become the builder's part-info panel;
  `previewEngine`/`applyEngine` become `stats.engineOutcome(def, pa)`
  (same arithmetic, catalog-driven). Click hit-testing (game.html:1020-1046)
  is generalised to walk `veh.art` rectangles instead of the literal table.
- renderer.js: `SKINS` gains `foam`, `black` stays; `drawBodySegment` gains an
  optional `opts` for band/seam count; nothing is removed.
- `ui/fmt.js` used for every number in the rail.

**Builder canvas interaction model.**

- *Frame*: the canvas draws the stack in the renderer body frame — origin at
  the nose tip, `+y` down the screen = station `s`, `x` lateral; `pxPerM` from
  a log-space zoom (wheel / pinch, 4..120 px/m), pan by middle-drag/space-drag;
  1 m dot grid, 5 m major lines, dashed centreline, ground line at
  `sTail` + leg length, 40 px height ruler on the left (ux-layout.md:116-133).
- *Palette*: six tabs (`cat`: command, tanks, engines, structural,
  aerodynamic, utility); cards drawn by `drawPartVector` into a 56 x 56
  thumbnail at 0.6 scale; search box; locked parts (tech tree, career) shown
  dimmed with the unlock name.
- *Place*: **click-to-place** is primary: click a card -> the part follows the
  pointer as a ghost -> valid snap nodes of compatible size light up -> click
  on a node places (Enter places at the nearest node, arrows cycle nodes, Esc
  cancels). Drag-and-drop does the same with pointer capture. Snap radius 24
  px clamped [16, 40]. A drop with no valid node animates back (120 ms) and
  shows the reason ("node size 2.4 m, part 1.2 m — add an adapter").
- *Attach types*: `top`/`bot` stack nodes; `radial` nodes on tanks accept
  boosters/fins/legs/RCS; `mirror` places a symmetric pair (symmetry 1x/2x
  toggle). Radial children get `x = parent.x + node.dx` and their own stack.
- *Select*: click selects (holographic outline + corner handles + node dots +
  info panel); Shift-click adds; drag moves the part **and its subtree**;
  Delete removes the subtree with an undo toast; Ctrl+D duplicates the subtree
  onto the nearest free node; R rotates (flips a radial part to the other
  side; rotates a fin set's phase); Ctrl+Z/Ctrl+Shift+Z over a 50-step
  history of DESIGN snapshots.
- *Overlay modes* (R-36/R-69v): `●` CoM (full and hollow ghost at burnout),
  `◆` CoT, `◇` CoP, caliper line and STABLE/MARGINAL/UNSTABLE chip; toggle
  buttons in the canvas corner.
- *After every edit*: `layoutRocket` -> `buildVehicle(design, 0)` ->
  `stats.compute` -> rail redraw (all synchronous, < 2 ms for 40 parts); the
  estimated altitude/velocity row runs `rocket/simulate.js` in a debounced
  250 ms idle task and is labelled EST.
- *Stage list* (R-9): rail card listing stages with next-to-fire at the top,
  drag to reorder, per-stage action chips (IGNITE / SHUTDOWN / DECOUPLE /
  DEPLOY_CHUTE / JETTISON_FAIRING / DEPLOY_LEGS / TOGGLE_RCS), add/remove,
  AUTO button (auto-stager: bottom-up, one stage per decoupler, engines ignite
  in the stage after their decoupler fires, chutes last; sets
  `stagesLocked = true` on first manual edit).
- *Footer*: SAVE / LOAD / TEST (headless `simulate` summary) / LAUNCH.
  LAUNCH is never disabled (ux-layout.md:187-202); with problems it opens the
  pre-flight card listing each `validate.js` result with a fix button, FIX IT
  FOR ME (applies the auto-fixes) and LAUNCH ANYWAY; only zero parts / no root
  hard-blocks.
- *Responsive*: >= 1180 px three columns (264 / 1fr / 300); 860-1179 palette +
  canvas with a collapsed bottom sheet; < 860 single column with PARTS /
  STAGES / STATS tabs; touch: tap-to-place, 44 px targets.
- *Keyboard path* (critique G11): Tab into palette, Enter picks, arrows cycle
  nodes, Enter places, Delete removes; the same code path as click-to-place.

**Blueprint JSON format** (`game/blueprints.js`, localStorage key
`rsx.blueprints.v1`, one entry per name, LRU cap 50, every access try/catch,
plus export/import as copyable text — no file download in v1):

```json
{
  "v": 1,
  "name": "Cadet I",
  "saved": "2026-09-21T09:12:00Z",
  "seed": 0,
  "parts": [
    { "uid": 1, "defId": "nose.s",    "parentUid": -1, "attach": "root",   "nodeIdx": 0, "mirror": false },
    { "uid": 2, "defId": "pod.probe", "parentUid": 1,  "attach": "bot",    "nodeIdx": 0, "mirror": false },
    { "uid": 3, "defId": "tank.s",    "parentUid": 2,  "attach": "bot",    "nodeIdx": 0, "mirror": false, "propKey": "rp1", "propFill": 1.0 },
    { "uid": 4, "defId": "engine.k1", "parentUid": 3,  "attach": "bot",    "nodeIdx": 0, "mirror": false },
    { "uid": 5, "defId": "fin.d",     "parentUid": 3,  "attach": "radial", "nodeIdx": 0, "mirror": true }
  ],
  "stages": [
    { "actions": [ { "uid": 4, "verb": "IGNITE" } ] }
  ],
  "stagesLocked": false
}
```

`loadBlueprint(json)` migrates by `v`, drops parts whose `defId` is unknown
(and their subtrees) with a visible warning "N parts from another version were
removed", never throws, and re-runs `layoutRocket`. Presets in
`web/blueprints/` use the same format and are the only shipped designs.

**Stats functions (`rocket/stats.js`), all derived from the sim modules.**
Let `g0 = RSX.GRAVITY_REF`, `gSurf = planet.mu / planet.R^2`,
`pa0 = planet.pa0` (= `RSX.atmosphere(0, planet).P`).

- `massAt(design, fill)`: `RSX.massProps(partsWithFill)` -> total mass, CoM
  station `s_cm`, inertia. `total = massAt(1).m`, `dry = massAt(0).m`,
  `fuel = total - dry` (also per `propKey` from `veh.props`).
- `stageSets(design)`: for stage `i`, `live_i` = parts still attached when
  stage `i` fires (everything minus the subtrees jettisoned by stages `< i`);
  `burn_i` = engines ignited by stages `<= i` still lit; `m0_i` = mass of
  `live_i` at that moment; `mp_i` = propellant those engines can drain from
  their feed tanks before the next stage (or until the tanks are empty);
  `mf_i = m0_i - mp_i`.
- `thrustAt(engines, pa, thr=1)` = `sum inst.thrustAt(pa, thr)`;
  `mdotAt(engines, thr=1)` = `sum inst.mdotAt(pa, thr)` (combustion:
  `RSX.thrustN(motor, pcDesign*thr, pa)` and `RSX.massFlow(motor, pcDesign*thr)`,
  exactly `previewEngine` game.html:976-981).
- `ispAt(engines, pa)` = `thrustAt / (g0 * mdotAt)`.
- `stageDeltaV_i(pa)` = `ispAt(burn_i, pa) * g0 * ln(m0_i / mf_i)` (R-10
  Tsiolkovsky); the rail shows `dv_vac` and `dv_SL`; `dvTotal = sum dv_vac_i`.
- `twr_i` = `thrustAt(burn_i, pa0) / (m0_i * gSurf)` for the first stage and
  `thrustAt(burn_i, 0) / (m0_i * gSurf)` for upper stages (labelled VAC).
- `burnTime_i` = `mp_i / mdotAt(burn_i)`; solids use `motorBurnoutBound` web
  march (existing `stateAtWeb` loop, index.html:460-473 pattern).
- `CoM` = `massAt(1).s_cm` and ghost `massAt(0).s_cm`; `CoT` =
  `sum(T_e * sGimbal_e) / sum T_e` over stage-0 engines (lateral
  `sum(T_e * x_e)/sum T_e` shown when non-zero, which is R-11's CoT);
  `CoP(mach, fill)` = `RSX.vehicleAero(vehAt(fill), mach).s_cp` with
  `aeroContribs` from `rocket/aero.js`.
- `staticMargin(mach, fill)` = `(s_cp - s_cm) / Dmax` calibers, evaluated at
  the four corners `{full, empty} x {M 0.3, M 1.2}`; label from the worst:
  `>= 1.0` STABLE, `0.5..1.0` MARGINAL, `< 0.5` UNSTABLE (R-10/R-36).
- `estimate(design)`: `rocket/simulate.js` vertical ascent with the
  auto-stager, dt 1/30, cap 600 s, returns `maxAlt`, `maxV`, `maxQ`, `tBurnout`
  — a real sim run, labelled EST.
- `engineOutcome(def, pa)`: thrust, mdot, Isp, separated flag
  (`RSX.isSeparated`) — the existing engine-drawer numbers.

**Launch check (`rocket/validate.js`, R-42, R-54)**, each item
`{id, ok, severity:'BLOCK'|'WARN'|'NOTE', msg, fix?}`: root exists and is a pod
(command module); >= 1 engine in stage 0; every engine has a feed tank with
`propKey` match and mass > 0; graph connected (no orphans); staging valid
(every engine ignited exactly once before any decoupler above it, chutes not in
stage 0); `twr_0 > 1` else "LOW TWR: 0.87 — needs > 1.0 (add engine / drop
fuel)"; `staticMargin` worst case with "UNSTABLE ROCKET: CP 0.3 cal ahead of CM
— add fins or move mass forward"; `dvTotal` vs the mission's requirement
"INSUFFICIENT DELTA-V: 2 950 m/s, orbit needs ~3 400" (reads
`planet.orbitDv`, a planet-record number derived once from `sqrt(mu/(R+150 km))`
plus a 25 % loss allowance and stored as data); any engine separated at
sea level in stage 0 (NOTE, x0.85). Result card renders `✓` lines then READY
FOR LAUNCH, or LAUNCH CHECK FAILED + reasons.

**Tests (P2).** `test-stats.js`: Cadet I `dvTotal_vac` equals
`ispVac * g0 * ln(m0/mf)` computed by hand from catalog numbers within 0.1 %;
two-stage design `dv_total` > single-stage of the same propellant mass;
`twr_0` for Cadet I in 4.2..4.8 (verified with the real model: 251 kN SL /
5 730 kg on `home`, TWR 4.47; `dv_vac` ~4 960 m/s); SM label
flips to UNSTABLE when `fin.d` is removed; burn time = mp/mdot.
`test-blueprints.js`: save -> load round-trip is deep-equal after
normalisation; unknown `defId` dropped with a warning and no throw; `v:0`
migrates; localStorage throwing is survived. `test-staging.js`: auto-stager on
Orbiter-1 yields 3 stages in the expected order; `validateStages` flags an
engine never ignited and a chute in stage 0; `layoutRocket` after
delete-subtree has no orphans.

**Exit criterion.** A design built from the palette launches into the existing
flight loop and flies (Cadet I from the palette reproduces the vertical slice);
save/load/delete/rename/duplicate work and survive reload; the stats rail
matches the headless numbers; pre-flight card shows the three R-54 messages on
purpose-built bad designs; `run.sh` green; committed and pushed.

### P3 — Physics (mass, gravity, thrust, fuel, accel, drag) as one loop

**Goals.** Move the game onto `RSX.advance` with events; support multi-engine /
multi-tank / solid vehicles from P1; wire ground contact and the LANDED mode;
fix the confirmed kernel defects; establish the four-bar dv ledger. No new
visuals except the carved-out `render/scene.js`.

**New files.** `js/physics/loop.js` (`stepFlight(sim, wallDt)`: uses
`RSX.advance` with `timeToNextEvent` from burnout / tank depletion / contact
extrapolation, `onEvent` publishing to the bus, `cache.valid = false` on every
applied event, contact substep budget, LANDED settle detector and
reconstruction), `js/game/flight.js` (orchestration carved from game.html:
countdown, resets, QA hooks), `js/render/scene.js` (`draw()` carved verbatim,
consuming `veh.art` via `drawPartVector`), `tests/js/test-kernel-fixes.js`,
`test-contact.js`, `test-multiengine.js`, `test-ledger.js`.

**Existing code extended (all inside existing functions, backwards compatible).**
- `physics-core.js`: `deriv` adds `tau += veh.tauExtra || 0` (engine lateral
  offsets, engine-out asymmetry) and exports `out.aDragMag = kDrag*W*W` for the
  g-meter; `stepVerlet` additionally records `dvGravStep` (`|g . vHat| dt`),
  `dvSteerStep` (`(T/m)(1 - cos alpha_thrust) dt`) and `dvIdealStep` (`(T/m)
  dt`) on `A2` beside the existing `dvDragStep` (critique C2: ledger inside the
  same force eval); `railsAdvance` uses `el.dir` (`M += dir*n*dt`) with matching
  fixes in `timeToRadius`/`orbitReadouts`; `advanceThermal` applies the
  radiative term before the `T = min(T, TAbl)` pin; `massProps` parallel-axis
  uses the settled station; `advance` halves the substep on a NaN retry and
  invalidates the cache after `substepEvent`; `chooseDt` takes an optional
  `contactK` for `dt <= 0.5 sqrt(m/k)`; `contactResponse` uses `planet.g0`;
  the dead `SM` ternary is simplified. Each fix has a test.
- `flight-loop.js`: untouched (regression oracle); `RSX.testVehicle.simulate`
  is compared against `RSX.rocket.simulate` in a test.
- `game.html`: `stepPhysics` (:488-556) is replaced by a call to
  `RSX.phys.stepFlight`; the pad pin becomes the LANDED mode (contact + thrust
  <= weight); the stop-at-surface rule becomes `contactResponse` + the
  `impactTol` check reported as an event (P5 turns it into the debrief). The
  Mars coast code moves to `game/scenarios/mars.js` unchanged and is only
  reachable from the sandbox (P6).
- `renderer.js`: no change.

**Tests (P3).** Rocket equation through the real loop: vacuum burn of Cadet I
(`planet` with `zAtm` 0) gives `dV = Isp_vac g0 ln(m0/mf)` within 0.5 %
(R-50); gravity: free fall from 1 000 m on `home` lands at
`sqrt(2 g h)` within 0.5 %; fuel/mass: `sum mdot dt == m0 - m(t)` to 1e-6 and
per-tank proportional drain with two tanks; thrust -> accel: at t=0 on the
pad `a = T/m - g` within 1 % for full throttle; retrograde rails orbit
advances CW (position angle -90 deg after T/4); ablator cools at zero flux;
contact: Cadet I dropped from 2 m onto legs settles to LANDED with `|v| <
0.15` and `|om| < 0.02` within 3 s and reports `contact` events; a two-engine
design with one engine cut yields `tauExtra != 0` and the vehicle starts
rotating; solid `srb.s` burns for 25..33 s with `pc` between 3 and 12 MPa
throughout; ledger closes `|dvIdeal - (dvGrav + dvDrag + dvSteer) - dV|/dV <
0.01` on a straight-up burn.

**Exit criterion.** game.html flies through `RSX.phys.stepFlight` with no
visible change; the vertical slice lands (soft) and can relight from LANDED;
`run.sh` green including the kernel-fix tests; committed and pushed.

### P4 — Flight (launch sequence, controls, staging, camera, HUD)

**Goals.** Make the slice playable per R-12..R-18, R-9, R-21..R-25, R-37,
R-47 (PHYS warp + pause), R-46v..R-49v, R-61v..R-65v (the holographic HUD,
telemetry panel, camera shake, transitions). This is critique STEPs 6, 7
(partial), 8, 9 (partial), 10, 11 (partial).

**New files.** `js/physics/frames.js`, `control.js` (CTL intent
`{omegaCmd, throttleCmd, sasMode, rcsOn, suppressThrottleUntil}`; rate
controller `tauDes = I (wn (omegaCmd - om))` with the existing computed-torque
gimbal inversion carved from game.html:317-334 as layer 1, RCS bang-bang as
layer 2 consuming monoprop, reaction wheels `tauRW` as layer 3; SAS modes
write `omegaCmd` from `thetaCmd` targets prograde/retrograde/hold),
`telem.js` (`buildTelem(S, veh, ctrl, planet, A)` once per tick, the fields of
critique.md:302-330, ledger sums), `js/rocket/staging.js` runtime half
(`fireStage`: engine shutdown in the jettisoned set, `contactResponse`-free
graph split, `buildVehicle` for KEEP and up to 6 debris bodies each with
their own `S/veh/cache`, impulse at the decoupler station `dv = J/m` with
`dw = ((r_d - r_cm) x J)/I`, ullage delay per engine, controller reset), `js/game/input.js` flight bindings, `js/game/audio.js` (gesture-gated
`AudioContext`, brown-noise roar with gain ∝ thrust and low-pass ∝
`sqrt(rho/rho0)`, staging thump, UI click, mute toggle), `js/ui/hud.js`,
`attitude-ring.js` (inline SVG ring with prograde/retrograde/radial/horizon,
navball-style per R-23), `tapes.js` (altitude/speed/pitch), `telemetry-graph.js`
(port of `TraceChart`, index.html:876-983), `warnings.js`,
`js/ui/checklist.js` flight half (ROCKET READY / SYSTEMS CHECK / FUEL LOADED /
GUIDANCE READY from `validate.js` then 3-2-1-LAUNCH driving the existing
countdown), `js/render/effects.js` (separation flash/sparks/kick, engine
ignition glow), `css/hud.css`; `tests/js/test-control.js`, `test-staging.js`
(runtime), `test-telem.js`, `test-warp.js`.

**Existing code extended.**
- `renderer.js`: `updateCamera` gains `opts.zoomMode:'anchors'|'fixed'` using
  the already-written `targetPpmFor` (anchors as fractions of `planet.zAtm`);
  shake block re-enabled behind `opts.shake` with the vacuum cut-off
  (`pa < 100 Pa`); `drawIgnitionFlash` callers pass the real nozzle screen
  point; `hexToRgba` handles `rgba()` input (LH2 bug); particle gravity /
  buoyancy read `opts.g`.
- `RSX.advance` used with `warp` 1..10 from the ladder; `emitRate *= 1/warp`.
- game.html: the inline `#hud` block, keydown handlers and `draw()` HUD lines
  are removed as their replacements land; `RSXTick`/`RSXSetState` are kept.
- `ui/fmt.js` and TELEM are the only sources for HUD numbers; the HUD writes
  the DOM at 10 Hz by string diff (ux-layout.md:780-787).

**HUD design (R-22/R-23/R-46v..R-49v):** dark holographic layer over the
canvas: top bar (mission slate, warning strip, warp widget with WARP LOCKED
reason, FLIGHT/MAP, HUD tier H), bottom-left throttle column + tank gauges per
resource with stage-1 at the bottom, bottom-centre flight strip (ALT, SPD,
V/S, H/S, AP, PE, TWR, ACC, P_a), bottom-right attitude ring (176 px, ticks,
horizon chord, nose triangle, prograde/retrograde/radial markers, target-pitch
arc), pitch tape, G-meter arc, STAGE button with next-action label, engine
status chips (ACTIVE/OFF/EMPTY/DAMAGED per engine), telemetry panel toggle
with live graphs (alt, v, accel, fuel, throttle, temp, pressure), debug overlay
(R-37) on F3. Clear stage rectangle 60 % x 55 % with a `[data-hud]` intersection
assert in dev builds; panels use `--card` translucency, 1 px `--hud-line`
borders, corner brackets, `--hud-glow` only on active/warning elements; scan
lines and blur gated by the quality tier (P7).

**Tests (P4).** Control: from a 0.2 rad pitch error in vacuum with T = 0 the RW
layer converges `omegaCmd` within 2 s and settles (`|e| < 0.005`); with T > 0
the gimbal layer alone holds the same and `gimbal` never exceeds `gimbalMax`
or slews faster than `gimbalRate`; SAS PROGRADE aligns `th` with `atan2(vy,vx)`
within 0.02 rad after 10 s. Staging: after `fireStage` on Orbiter-1 the upper
stage's `I` dropped and `s_cm` moved (critique STEP 8 assert), momentum is
conserved across the split (`sum m v` before == after within 1e-6), the debris
body's `S` inherits `v + om x r`, engines ignite after `ullageDelay`, debris
count <= 6. TELEM: `pitch` on the pad at t=0 is 0.000; `aoa` is NaN below 30
m/s; `apR/peR` NaN when energy >= 0; ledger closure < 1 % over a 60 s gravity
turn from `simulate`. Warp: at 10x the substep count per 1/60 s frame is <=
48 and the trajectory matches 1x within 1e-4 relative after 30 s; auto-drop
triggers when `tToEvent < 6 dt`; pause halts `S.t`.

**Exit criterion.** A player can build Orbiter-1, pass the checklist, launch,
pitch over with A/D under SAS, stage with Space, throttle with W/S, warp to
10x, read every R-22 field on the HUD, and hear the plume fade with altitude;
`run.sh` green; frame time < 12 ms on the dev machine at 1440 x 900; committed
and pushed.

### P5 — Advanced physics (atmosphere, aero, orbit, prediction, reentry) + failures

**Goals.** Orbit as a real mode (RAILS, warp-to-Ap/Pe, map view with analytic
conic and Ap/Pe markers, prediction), full Barrowman aero from geometry with
control-authority check, reentry heating with skin temperature and plasma,
parachutes with states, failures with named cause/actual/needed/fix, slow-mo,
debrief with the dv ledger, snapshot ring for rewind/replay, landing tolerance
and tip-over (R-19/R-20, R-26..R-28, R-48, R-47 rails, R-53v..R-60v reentry
tiers, R-66v warnings, R-54 debrief copy). Critique STEPs 9 (rest), 11 (ring),
12, 13, 15.

**New files.** `js/physics/orbit.js` (mode machine INTEGRATED <-> RAILS with
the five gates checked by chamber pressure, `railsStepCap` before every step,
warp-to-Ap/Pe, `predict()` choosing analytic conic or throttled
`predictNumeric` at 4 Hz), `failures.js` (rules: structural `q*|alpha| >
maxAeroLoad` for 0.3 s, `q > maxQ`, aerodynamic flip (CP forward and |alpha| >
90 deg 1.5 s), engine out, depletion (non-terminal), thermal `skinTemp >
maxSkinTemp`, tumbling `|om| > 3 rad/s` in atmosphere, impact vs
`impactTol`/leg tolerances/tip angle, chute rip above `qMax`, g-load; each
emits EVENT with `cause/actual/needed/unit/msg/fix`), `thermal.js`
(`qConv = RSX.suttonGraves(rho, W, Rn)` with `fExpose` from the nose
direction, per-part `advanceThermal`, vehicle `skinTemp`, HEAT tier
LOW/SUBTLE/ORANGE/PLASMA/EXTREME from `qConv`), `js/rocket/aero.js` full
(transition and fin Barrowman with `K_fb`, planform area, crossflow centroid,
Mach 1.2 shift, control-authority check `ell T sin(gimbalMax) > 1.5 x demand`),
parachute force path (`rocket/chute.js`: `Cd_eff = Cd smoothstep(t/inflate)`,
drag-like via `kDrag` contribution, states STOWED/DEPLOYING/DEPLOYED/FAILED),
`js/game/snapshots.js` (4 Hz x 1800 ring, 8 checkpoints, REWIND 20 s, replay
scrub), `js/ui/debrief.js`, `map-overlay.js`, `js/render/map.js`
(planet disc with terminator, atmosphere annulus, conic dashed by class, Ap/Pe
triangles, PiP, 1.1 s blend), plasma sheath + ablation trail in `effects.js`;
`tests/js/test-orbit.js`, `test-failures.js`, `test-aero.js`, `test-chute.js`,
`test-thermal.js`, `test-snapshots.js`.

**Existing code extended.** `deriv` gains a `veh.kDragExtra` term (chutes,
deployed legs, air brakes) applied through the same closed-form drag operator;
`vehicleAero` receives contributors from `rocket/aero.js` (no change to the
function); `RSX.conicPath` gains eccentric-anomaly sampling for `e > 0.5` and
apo/peri/entry markers; `orbitReadouts` returns `vCirc`/`vEsc`; `advanceThermal`
callers supply `fExpose`; `contactResponse` is fed `veh.contactPoints`;
`RSX.PLANETS[*]` gets `orbitDv` and `karman` data.

**Tests (P5).** Stable orbit under proper ICs: Cadet-class state at 150 km with
`v = sqrt(mu/r)` on `home` stays within 1 % of `a` and `e < 1e-3` over 20
orbits in RAILS and over 10 orbits INTEGRATED (R-50); RAILS <-> INTEGRATED
hand-off `|dr| < 1e-6 m`; rails refuses with `warpBlocked` while an SRB has
`pc > 1 %` of design even at throttle 0; warp-to-Ap lands within 3 s of
apoapsis at 1x; a decaying orbit re-enters INTEGRATED before `zAtm`. Aero:
Barrowman fin CNa for `fin.d` matches the closed form within 1e-9; SM sign
flips when fins move forward of the CM; the unstable design tumbles in
`simulate` and the stable one does not. Heating: a 7 km/s entry produces
`qConv` in 0.5..3 MW/m^2 and the Mk1 ablator loses mass; a probe core without
a shield burns through (THERMAL FAILURE event with `actual/needed`). Chute:
deploy above `qMax` -> FAILED with the q numbers; below -> DEPLOYED and
terminal velocity ~7 m/s for 1.5 t on the main. Failures: impact at 12 m/s on
legs rated 6 -> event `{cause:'impact', actual:12.0, needed:6.0, unit:'m/s'}`;
tip-over at 25 deg. Snapshots: ring holds 1800 entries, REWIND 20 s restores
`S` and rebuilds `veh` from `design + stageIndex + props`, replay is
deterministic (same `seed`).

**Exit criterion.** Orbiter-1 reaches orbit, the map shows the conic with
Ap/Pe that change with velocity, warp-to-Ap works, a retrograde burn brings it
home under a chute or plasma failure with a named debrief and REWIND;
`run.sh` green; committed and pushed.

### P6 — Gameplay (missions, sandbox, progression, tech tree)

**Goals.** R-29..R-32, R-67v target markers, R-54 mission-specific dv hints,
the education callouts as a nice-to-have (critique STEP 16 subset).

**New files.** `js/game/missions.js` (ten missions as data: id, brief,
`goal(telem, ledger)`, optional `fail`, reward = tech unlock, three hints;
objective panel + target marker on the map/HUD for target-apoapsis and
payload missions), `sandbox.js` (unlimited parts/fuel, sim toggles: planet,
realism scale, failures on/off, structural multiplier, scenarios incl. the
relocated Mars coast), `tech.js` (seven categories, nodes with `unlocks:[defId]`,
`requires:[mission]`; sandbox ignores), `js/ui/missions.js`, `tech.js`,
`js/game/edu.js` (optional: 18 callouts on TELEM with the 6 s floor and once-
per-lifetime ledger under `rsx.edu.v1`), `tests/js/test-missions.js`.

**Existing code extended.** `validate.js` reads the active mission's dv
requirement; `debrief.js` shows mission outcome; `blueprints.js` unaffected.

**Tests (P6).** Each mission predicate passes on a recorded TELEM trace that
should satisfy it and fails on one that should not (ten fixtures generated by
`simulate`); tech unlock flags gate the palette list; sandbox flag bypasses
gating; progress persists through the localStorage shim.

**Exit criterion.** The ten missions can be completed in order with the
shipped presets; the tech tree unlocks parts; sandbox exposes the sim
settings; committed and pushed.

### P7 — Polish (VFX, audio, animation, UI, perf, errors)

**Goals.** R-40, R-41, R-43 full audio, R-50v/R-51v material passes and sprite
cache, R-52v lighting, R-53v..R-55v clouds/limb/textured map planet,
R-57v explosions with physical debris, R-62v..R-64v easing and animated HUD,
R-71v/R-72v quality tiers and resolution scaling, R-73v tiers, critique STEP
17 including the Test Stand as a builder sub-mode (G12), reduced-motion,
touch, JSON share, the final grep.

**New files.** `js/game/quality.js` (LOW/MEDIUM/HIGH/ULTRA presets +
adaptive controller on a 30-frame rolling median: particle cap 1800 -> 900 ->
400, bloom/blur off, star twinkle off, smoke sub-lobes 4 -> 1, sprite rebuild
throttled), `settings.js` (keymap editor, theme, planet, volumes, UI scale,
reduced motion), `js/ui/hotfire.js` (Test Stand sub-mode: the index.html
`runTestStand`/`summarizeTestStand`/`TraceChart`/replay code moved into a
module that calls `RSX.*` so the bench and the game share one engine model;
`index.html` then loads it too, removing its duplicate physics), `js/render/
vehicle-art.js` sprite cache (offscreen atlas keyed by parts hash / size bucket
/ soot bucket), material passes (bands, rivets, plumbing, cooling tubes,
heat discolouration, frost), explosion layers and debris on real trajectories
(new particle types DEBRIS/VAPOR/PLASMA with per-type caps), cloud decks,
limb glow, bezier/disc ground, textured map planet, error surface (toast +
in-game log; `window.onerror` never kills the loop), `web/qa.html`.

**Existing code extended.** `renderer.js` memoises `skyColorsAt`, caches
gradients per (skin, ppm bucket), fixes overflow policy and proportional puff
growth; `game.html` becomes a pure loader; `index.html` keeps its markup and
CSS but its `<script>` is replaced by the shared modules; the `setInterval`
prop panel becomes event-driven.

**Tests (P7).** Quality tier changes the particle cap and nothing else in
`simulate` output (visual settings never affect physics); error surface
catches a thrown error in a HUD writer without stopping `S.t`; hotfire module
reproduces the Python oracle's example motor (`pc0` 4.16 MPa with the JS
preset, 398 N s impulse with the Python preset) within 1 %; the final grep
(`Math.random` in `render/`, `event.key`, `atan2` outside `frames.js`,
literal `70000|140000|6371000`, `createRadialGradient` inside loops,
`shadowBlur`, unguarded `localStorage`) returns nothing.

**Exit criterion.** 60 fps at HIGH on the dev machine and >= 30 fps at LOW on a
1280 x 720 integrated-GPU laptop; works at 3840 x 2160 with scaled UI; audio
complete and mutable; Test Stand reachable from the builder; `run.sh` green;
README documents the entry point (`web/game.html`), the test runner and the
module map; committed and pushed.

---

## 5. Risk register (what to watch in every phase)

1. **Builder before the flight feels right** (critique's stated reason for a
   late builder). Mitigation: P1-P3 keep `flight-loop.js` as the regression
   vehicle and every builder change is checked against it headlessly.
2. **Two divergent loops / three engine copies** until P3 and P7 land. Do not
   add features to game.html's inline `stepPhysics` or index.html's physics in
   the meantime.
3. **Kernel contract creep**: `stepVerlet` owns `veh.parts` and one
   `sEngine`. Multi-engine is expressed through `thrustNow`/`mdotNow`/
   `tauExtra`, never by editing the integrator.
4. **Palette conflict regressions**: `index.html` must keep rendering under
   `[data-theme="light"]`; a screenshot check in P1 and P7.
5. **Unit leaks**: the SI-suffix validator on part files and the `fmt`-only
   rule are the guard; the final grep in P7 enforces it.
6. **Performance debt** (25 gradients/frame per vehicle) grows linearly with
   part count; the sprite cache is scheduled in P7 but if P2 thumbnails or P4
   multi-stage drawing drop below 60 fps, pull the cache forward.
7. **jsc-only tests**: fine locally; add the Node `vm` runner before any CI.
