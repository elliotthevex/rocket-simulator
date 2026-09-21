# Stage-2 build brief — remaining features, data model, and protocol

Shared brief for the Stage-2 build: the features still outstanding from the
owner's three requests (the 76-section game prompt, the 26-section Assembly
spec, the 20-section UI/UX revision). Every implementer and verifier reads
this first. It fixes the data model and the build order so the slices
compose instead of colliding.

## 1. Ground truth about the codebase (read before touching anything)

- Static site: no bundler, no npm, no Node. `web/game.html` is the single-page
  app (~2100 lines: CSS + HTML + one classic `<script>`). Everything else is a
  classic script under `web/js/**` attaching to ONE global namespace `RSX`
  (declared `const RSX = {}` in `web/js/physics-core.js`). The one exception is
  `web/js/render/assembly-3d.js`: an ES module (Three.js r160 from jsdelivr,
  resolved through the `<script type="importmap">` in game.html). Bridges:
  game.html does `window.RSX = RSX;` and `window.showPartDetail = showPartDetail;`;
  the module attaches `window.RSX.assembly3d = { init, rebuild, frameCamera,
  focusOnPartId, resize, isInitialized }`.
- Script load order (game.html and `tests/js/run.sh` MUST stay in sync):
  physics-core, renderer, render/part-portrait, flight-loop, physics/control,
  parts/catalog, rocket/vehicle, rocket/stats, rocket/validate,
  rocket/assembly-layout, then any NEW classic file, then the module. A new
  classic file must be added to BOTH game.html's `<script>` list AND the jsc
  argument list in tests/js/run.sh.
- Tests: `sh tests/js/run.sh` runs every `tests/js/test-*.js` under macOS
  JavaScriptCore (jsc). No DOM, no Path2D (test-part-portrait.js stubs it), no
  localStorage -- pure modules must never touch the DOM at load time and must
  guard `typeof localStorage`. Every pure module you add gets a test file. The
  suite must print PASSED for every file before any commit.
- Preview: `.claude/launch.json` config `web-static` serves `web/` at
  http://127.0.0.1:8765 (python http.server). The app is
  http://127.0.0.1:8765/game.html.
- Physics conventions: station s = metres from the nose tip, positive aft.
  Vehicle contract consumed by `RSX.deriv` / `RSX.stepVerlet`:
  `{ mp:{m,s_cm,I}, parts:[{name,dryMass,s,L,R,propMass,propMassFull,propTankLen}],
  motor, propKey, sEngine, sTail, Dmax, dia, bluntNose, cd0Factor,
  aeroContribs:[{kind,CNa,s}], Splan, sCross, LfwdAft, gimbal,
  thrustNow(pa,thr), mdotNow(pa,thr), advanceBurn(A,dt) }`.
  `RSX.massProps(parts)` recomputes `mp`; `RSX.vehicleAero(veh, mach)` reads
  `veh.s_cm` directly (sync it from `veh.mp.s_cm` first).
- Existing modules: catalog (`RSX.PARTS.register/get/has/all/byClass`; classes
  nose/pod/tank/engine/fin), vehicle (`RSX.rocket.layoutStack`, `buildVehicle`,
  `CADET_I`), stats (`RSX.rocket.stats.compute/stabilityLabel`), validate
  (`RSX.rocket.validate`), assembly-layout (`RSX.rocket.assemblyLayout`),
  part-portrait (`RSX.render.drawPartPortrait`, `_partPortraitDrawers[cls]`),
  assembly-3d (see above), flight-loop (`RSX.testVehicle.*` -- the REGRESSION
  ORACLE: tests/js/test-rocket-vehicle.js proves `buildVehicle(CADET_I)` equals
  `testVehicle.build()` to 1e-9; never break that).
- game.html facts: screens are body-level siblings `#screen-build` (Design),
  `#screen-assembly` (3D -- the landing screen), `#screen-flight`. Modals
  `#checklistModal`, `#partDetailModal`, `#controlsModal` and `#toastStack` are
  ALSO body-level siblings (never nest a modal inside a screen). Key functions:
  `showScreen(name)`, `launchInto(design)` (hides every design-family screen;
  flight can only start once per page load -- "back to builder" reloads),
  `renderAll()`, `showToast(msg, kind)` (success | warning | info),
  `showPartDetail(def)`, `currentDesign()`. `initFlight(design)` wraps the
  whole flight loop (`stepPhysics`, `draw`, `frame`, key handling, the
  in-flight engine-compare panel, `RSXTick`/`RSXSetState`/`RSXDEBUG` hooks).

## 2. Gotchas that already bit us (do not repeat them)

1. CSS: an ID selector that sets `display` beats the UA `[hidden]{display:none}`
   rule. Every new modal/overlay/screen with `#id { display:flex|grid|block }`
   MUST also have `#id[hidden] { display:none; }`.
2. CSS custom properties: `--card/--border/--accent/--accent-ink` are defined
   twice (the flight palette on `:root`, the dark design palette scoped to
   `#screen-build, #screen-assembly, #checklistModal, #partDetailModal,
   #controlsModal, #toastStack`). Any NEW screen/modal/overlay that should use
   the dark design palette must be ADDED to that scoped selector list. Never
   add those names to `:root`.
3. `canvas { position:absolute; top:0; left:0 }` is global (written for
   `#cMain`). Every new canvas (thumbnails, charts) needs `position: static`
   or its own explicit positioning.
4. A `<canvas>` with no CSS size uses its own width/height attributes for
   layout, which turns Three's `renderer.setSize(w,h,false)` into a runaway
   resize loop. Give every canvas explicit CSS width/height and measure its
   PARENT, not the canvas.
5. `<script type="module">` always runs after the classic scripts, even when
   it appears earlier. Anything needing `RSX.assembly3d` at load time waits
   for DOMContentLoaded (see the bottom of game.html's classic script).
6. Verify with REAL mouse clicks at screenshot coordinates, never
   `element.click()` -- the `[hidden]` bug was invisible to `.click()`. Read
   the console on a FRESH tab (old tabs carry stale errors).
7. `const`/`let` at the top level of a classic script are NOT window
   properties; modules only see `window.*`.
8. No real aerospace company names, logos or branding anywhere -- fictitious
   manufacturers only (Ridgeline Aerostructures, Continuum Avionics, Kestrel
   Propulsion Works, ...). No fake numbers: every displayed figure must come
   from the real kernel or the catalog.
9. Never `git add -A` (a `.venv`, egg-info and other junk live in the tree).
   Add files explicitly. Never force-push.

## 3. Data model v2 (binding for every slice)

### 3.1 Design

```
design = {
  name?: string,
  stack: [partId, ...],   // nose-first (top -> bottom). Duplicate ids allowed.
  finAt: number | null,   // stack index of the part carrying the fin set. Legacy `finOn: partId` still accepted.
  fin?: partId,           // which fin def (default "fin.d")
  config?: { fuelLoad: 0.1..1 (default 1), autoStage: bool (default true),
             pitchOverAlt: metres (default 0 = fly vertical), pitchTargetDeg: 0..90 (default 90) }
}
```

`RSX.rocket.normalizeDesign(design)` returns a NEW object
`{ name, stack:[...], finAt, fin, config:{...defaults} }`; a string `finOn`
converts to `finAt = stack.lastIndexOf(finOn)` (-1 -> null). Every
`RSX.rocket.*` entry point calls this first. `RSX.rocket.CADET_I` keeps its
current literal (`finOn: "engine.k1"`) so the oracle test stays untouched.

### 3.2 Stages

A stage boundary is a part of class `decoupler`. `RSX.rocket.stagesOf(stack)`
returns stages ordered BOTTOM-FIRST (stage 1 fires first):

```
[{ n: 1, iStart, iEnd (inclusive stack indices), ids: [...] }, { n: 2, ... }]
```

The decoupler belongs to the stage BELOW it (it is dropped with that stage).
For `[nose.s, pod.probe, tank.s, engine.kv, decoupler.s, tank.m, engine.k1]`:
stage 1 = indices 4..6 (`decoupler.s, tank.m, engine.k1`), stage 2 = 0..3.
A stack with no decoupler is one stage (n = 1) covering everything.

### 3.3 Stack rules -- `web/js/rocket/stack-rules.js`, `RSX.rocket.rules`

`check(stack, finAt)` -> `{ ok, hard: [{index, id, reason}], soft: [{reason, stage?}] }`.

HARD (structural -- an edit that would create one is refused and the reason
is shown to the player):
- H1 at most one `nose`; if present it is index 0; nothing may sit above it.
- H2 `pod` parts only in the top stage.
- H3 within a stage: at most one `engine`, and it is the LAST part of its
  stage (nothing below an engine except the decoupler that starts the next
  stage).
- H4 `decoupler`: never index 0, never last, never adjacent to another
  decoupler, and the part directly ABOVE it must be an `engine`.
- H5 `finAt` (when not null) must index a `tank` or an `engine`.

SOFT (completeness -- allowed while building, reported by validate.js and the
assembly status strip):
- S1 the stack starts with a nose; S2 a pod exists; S3 every stage has >= 1
  tank and exactly one engine; S4 fins exist (advisory; the stability check
  is the real judge).

Helpers (all pure, all jsc-tested): `canInsert(stack, finAt, id, index)` ->
`{ok, reason}` (index 0..stack.length = where the new part lands),
`canRemove(stack, finAt, index)`, `canMove(stack, finAt, index, delta)`,
`insert/remove/move(...)` returning a NEW `{stack, finAt}` with `finAt`
re-pointed or cleared correctly, `finHostCandidates(stack)` -> indices,
`connectionNodes(stack, finAt, id)` -> every insert index as
`{index, ok, reason}` (what drag-and-drop paints green/red; for a fin id it
returns host candidates instead, with `{index, ok, reason, host:true}`).
Reasons are plain language a beginner understands ("An engine has to be the
bottom of its stage -- nothing can hang below it except a decoupler.").

### 3.4 Catalog additions -- `web/js/parts/catalog.js`

- New class `decoupler` (add to `_CLASSES`; `fin` stays the only zero-length
  class). `decoupler.s`: L 0.30, R 0.6, dryMass 45, cost 2600, manufacturer
  "Ridgeline Aerostructures", description explaining stage separation.
- Tanks are VOLUME based. Keep `tank.massFull` as the RP-1 reference
  capacity; `RSX.rocket.tankVolumeM3(def) = massFull / FUEL_PRESETS.rp1.propellant.bulkDensity`.
  `buildVehicle` fills a tank with its STAGE ENGINE's propellant:
  `propMassFull = volume * bulkDensity(engine.propKey)`,
  `dryMass = propMassFull * tankDryFrac(engine.propKey)`. For rp1 this
  reproduces today's numbers exactly (4600 kg / 230 kg dry); the oracle test
  proves it.
- Nose defs carry `nose: { shape: "ogive" | "blunt" | "cone" }` (existing
  `nose.s` = ogive). `buildVehicle` uses `RSX.NOSE_CP_FACTOR[shape]` for the
  nose CP station and sets `bluntNose: true` for the blunt shape.
- New parts so every class has real alternatives (every performance number
  must come from the real nozzle model -- check them in a test; nothing
  invented): `nose.b` (blunt, L 1.0, dryMass 45), `pod.crew` (L 1.1,
  dryMass 420), `fin.l` (CNa 9.0, rootChord 1.3, span 1.3), `engine.m1`
  "Prometheus" (propKey ch4, throatD 0.192, exitD 1.30, pcDesign 25e6,
  dryMass 1700, L 1.6), `engine.h1` "Aquila" (propKey lh2, throatD 0.13,
  exitD 1.26, pcDesign 6e6, dryMass 320, L 1.4), `tank.l` (L 10.0,
  massFull 13000). Descriptions >= 20 chars, fictitious manufacturers.
- part-portrait: add a `decoupler` drawer (a short body segment with a
  visible separation band/notch) so it never falls through to `_unknown`.

### 3.5 Vehicle -- `web/js/rocket/vehicle.js`

`buildVehicle(design)` builds the FULL stack (all stages) as one flyable
body: `veh.motor` = the bottom stage's engine, `sEngine = sTail`,
`aeroContribs` = nose (`CNa 2.0, s = L * NOSE_CP_FACTOR[shape]`) + fins at the
fin host's station (`s = host.sBot - 0.3`, CNa from the fin def). Throws only
when the BOTTOM stage lacks an engine or a tank (everything else is
validate.js's job). Adds:

```
veh.design   (normalized copy)      veh.fin (fin def or null)
veh.stages   bottom-first: [{ n, partIdx:[indices into veh.parts], engineIdx, tankIdx:[...],
                              motor, propKey, sTop, sTail, sEngine, dryMass, propMassFull }]
veh.stageIndex  0 = the bottom stage is active
veh.art      from RSX.rocket.artFor(veh): { noseLen, noseDia, bodyLen, bodyDia, finRootChord,
             finSpan, finS (station of the fin root's aft edge, or null), bellRt, bellRe,
             hitRegions:[{ part:"nose"|"pod"|"tank"|"engine"|"decoupler"|"fins", label, sTop, sBot, halfWidth }] }
```

`config.fuelLoad` scales every tank's initial `propMass` (`propMassFull`
unchanged). `veh.parts[i].name` stays the catalog `name` (nose/probe/tank/
mount...) for the oracle; add `veh.parts[i].id` (catalog id) and
`veh.parts[i].cls`.

### 3.6 Flight helpers -- `web/js/rocket/flight.js`, `RSX.rocket.flight`

Generic over the ACTIVE stage (these replace the `RSX.testVehicle.*`
wrappers game.html uses today; testVehicle stays as the oracle):
`propAvailable(veh)` (sum over active-stage tanks), `thrustNow(veh, pa, thr)`,
`mdotNow(veh, pa, thr)`, `advanceBurn(veh, A, dt)` (drain active-stage tanks
BOTTOM tank first), `canSeparate(veh)`, `separate(veh) -> droppedBody | null`
(removes the active stage's parts from `veh.parts`, advances `stageIndex`,
swaps `motor/propKey/sTail/sEngine/Dmax/dia/Splan/sCross/aeroContribs/art`,
drops the fin contribution when its host left, recomputes `mp`; the returned
body is itself a `veh`-shaped object flyable by `RSX.stepVerlet` with zero
thrust: stations re-based so s = 0 is its top, `bluntNose: true`,
`aeroContribs` = its fins if any, `thrustNow/mdotNow -> 0`, `advanceBurn`
no-op, plus its own `art`), `resetStages(veh)` (restores the full stack, fuel
per config, stageIndex 0), `attach(veh)` (installs the `thrustNow/mdotNow/
advanceBurn` closures on `veh`). jsc-tested: a two-stage vehicle separates,
its mass drops by exactly the dropped stage's mass, thrust/TWR switch to the
upper engine, and the dropped body falls under gravity when stepped.

### 3.7 Stats -- `web/js/rocket/stats.js`

`compute(veh, planet)` keeps every existing field and adds `cop` (Mach 0.3
centre-of-pressure station = `s_cm - AC.xcp_b`), `stages` (bottom-first:
`[{ n, massStart, massEnd, propMass, thrustVac, thrustSL, ispVac, ispSL,
twrStart (thrust at the stage's ignition pressure -- pa0 for stage 1, 0 for
the others -- over massStart * g0), burnTime, deltaV }]`) and `deltaVTotal`.
`deltaV` becomes the multi-stage total -- identical to today's value for a
single stage, so the existing Tsiolkovsky test keeps passing unchanged.

### 3.8 Saved designs -- `web/js/rocket/designs.js`, `RSX.rocket.designs`

`PRESETS = [CADET_I (name "Cadet I"), CADET_II]` with
`CADET_II = { name: "Cadet II", stack: ["nose.s","pod.probe","tank.s","engine.kv","decoupler.s","tank.m","engine.k1"], finAt: 6 }`
(test: 2 stages, TWR > 1, validate ok). `list()`, `save(design)` (by name,
overwrites), `load(name)`, `remove(name)`; storage key `rsx.designs.v1`;
falls back to an in-memory map when `localStorage` is undefined (jsc) or
throws (private mode).

### 3.9 Telemetry -- `web/js/rocket/telemetry.js`, `RSX.rocket.telemetry`

A recorder with samples `{ t, alt, speed, vx, vy, accelG, q, mach, throttle,
mass, prop, stage, twr, pitchDeg, SM }` taken at >= 0.1 s sim-time spacing
(cap 20 000 samples) and `events: [{ t, type: ignition|liftoff|maxq|separation|
burnout|apogee|impact|landed, label }]`. `snapshotToSession()` writes JSON to
sessionStorage key `rsx.telemetry.last` (throttled to <= 1 write/s);
`loadLast()` reads it back -- this is how the TELEMETRY tab shows the previous
flight after "back to builder" reloads the page. DOM-free; guard
`typeof sessionStorage`.

## 4. UI / screen model (binding)

The header nav (every screen's `<nav class="mode-tabs">`) becomes six items,
each a name + one-line description in the existing tab markup:
DESIGN (Pick your parts) . ASSEMBLY (Build it in 3D) . CONFIGURE (Fuel, staging,
pitch) . SIMULATE (Predict the flight) . LAUNCH (Fly it for real) . TELEMETRY
(Read the flight data). LAUNCH is an action tab: it runs the launch checklist
and then `launchInto(currentDesign())`. Screens are body-level siblings toggled
by `showScreen(name)`: `#screen-build`, `#screen-assembly`, `#screen-configure`,
`#screen-simulate`, `#screen-telemetry` (flight stays `#screen-flight`).

The single source of truth for the rocket is a module-level `design` object
in game.html (replacing the fixed-slot `selection` object) plus
`selectedIndex` (a stack index or null) shared by the Design stack view and
the 3D selection. `currentDesign()` returns the normalized design.

## 5. Feature slices, in order (do not start a slice before the previous one is verified)

### F1 Foundations (sections 3.1-3.9; no new screens)
Rules module, catalog additions, volume-based tanks, stages in
`buildVehicle`, `artFor`, flight helpers, stats per stage + `cop`, designs,
telemetry -- each with tests. game.html: `initFlight` switches to
`RSX.rocket.flight.attach(veh)` and the flight helpers (single-stage behaviour
must be visually identical); everything else untouched. `assemblyLayout` and
the 3D scene must not break on a decoupler (a plain cylinder is fine for now).
Acceptance: every test file PASSED (new: test-stack-rules, test-stages,
test-flight-stages, test-designs, test-telemetry; updated catalog/portrait
tests); the app loads with zero console errors; the CADET_I stats panel shows
the SAME numbers as before this slice (record them first, e.g. total mass
5.61 t, TWR, Isp, delta-v, CoM, margin); a launch still lifts off and flies.

### F2 Design screen v2 (free stack editing, saved designs, alternatives)
On `#screen-build`: stack-view rows are selectable (click -> `selectedIndex`,
highlighted) with up/down/remove controls (rules-checked; a refused edit
shows a warning toast with the rule's reason and changes nothing). Palette
cards ADD parts: nose -> replaces/places the nose; pod -> replaces the pod or
inserts below the nose; tank/engine/decoupler -> inserts below the selected
part, else at the bottom of the bottom stage -- always through
`rules.canInsert`. The fin control becomes Fins on/off + a host picker
(`finHostCandidates`) + fin type (fin.d / fin.l). A DESIGNS menu in the
header: presets, saved designs, Save as..., Delete (toasts on each). The
detail panel gets an ALTERNATIVES section (other parts of the same class,
compact numeric comparison vs this one; "Replace" swaps the selected /
matching stack part through the rules) and the stats panel gets per-stage
rows (STAGE n: delta-v, TWR at ignition, burn time) plus total delta-v. Every
button has a `title` tooltip. Acceptance: build CADET_II from CADET_I with
clicks (decoupler under the engine, then tank.m, then engine.k1, move the
fins), see two stages in stats, save it, reload, load it back; a refused edit
(e.g. a tank below an engine) shows the reason and changes nothing; the
detail panel's Replace swaps the right part.

### F3 3D scene v2 (assembly-3d.js + the assembly overlay)
Decoupler mesh; hover highlight + floating name tooltip; EXPLODED toggle
(parts slide apart along the axis with ease-out; "Exploded / See every
part"); STAGES toggle (stages separate with a gap and STAGE 1 / STAGE 2 tags;
"Stages / See what separates"; with one stage, a toast explains there is
nothing to separate); BALANCE toggle: CoM (amber sphere + ring) and CoP
(blue diamond) markers at their real stations, projected HTML labels
("CENTER OF MASS -- where it balances", "CENTER OF PRESSURE -- where the air
pushes") and a one-line verdict ("CoP is 0.86 body-widths behind CoM ->
MARGINAL: it wants to fly straight, barely"); LABELS toggle: leader-line
labels for every part (name + one key number). A 3D HUD strip inside the
viewport (not a side panel): stages, total mass, TWR, delta-v, stability
chip, live. A selection toolbar near the selected part: name . Focus .
Remove . Replace... (opens the detail panel's alternatives) . up/down.
Selecting in 3D sets `selectedIndex` (the Design stack row highlights, and
vice versa). All toggles are name + description buttons with a pressed
state. Acceptance: each toggle visibly changes the scene (screenshot
before/after), markers sit at the stats' `com`/`cop` stations (check via
JS), labels track the camera while orbiting, CADET_II (loaded from the
DESIGNS menu) separates in STAGES view, zero console errors.

### F4 Drag-and-drop assembly (assembly screen)
A collapsible PARTS drawer on the left of the 3D viewport (categories,
thumbnails via `drawPartPortrait`, name, one-line stat, `i` button).
Pointer-drag a card over the viewport: connection nodes appear at every
insert index (a ring at each part boundary along the axis; green = ok per
`rules.connectionNodes`, red = not, the reason shown as a floating tag on the
nearest node); a translucent ghost of the dragged part snaps to the nearest
node; on release: valid -> insert, rebuild, snap animation (ghost -> solid
with a short scale pop), toast "<name> added to stage N"; invalid -> toast
with the reason, ghost fades. Fin cards target host parts (tank/engine)
instead of boundaries. Delete/Backspace removes the selected part
(rules-checked). Acceptance: build a two-stage rocket entirely by dragging in
3D; an engine dragged above a tank is refused with the reason visible; fins
drag onto a tank; the stats strip updates live; zero console errors.

### F5 Multi-stage flight + telemetry recording (`initFlight` in game.html)
Staging key `S` and an on-screen STAGE button -> `flight.separate(veh)`;
auto-stage on burnout when `config.autoStage`; the dropped stage becomes a
real second body integrated by `RSX.stepVerlet` with zero thrust, drawn
tumbling in the same pad-local frame (body + engine bell + its fins), removed
on ground impact; the active vehicle's drawing uses `veh.art` (data-driven
nose, body, fin station, bell) and the click hit-test uses
`veh.art.hitRegions` (no more hard-coded stations); the in-flight
engine-compare panel acts on the ACTIVE stage; the HUD shows `STAGE n/N` and
the active stage's propellant; the pitch program from `config` (`thetaCmd`
ramps from 90 deg to `pitchTargetDeg` above `pitchOverAlt` over ~20 s, pitching
toward the prograde / planet-rotation direction); telemetry samples + events
recorded each frame (throttled) and snapshotted to sessionStorage.
`RSXTick`/`RSXSetState`/`RSXDEBUG` keep working. Acceptance (real key presses
plus the debug hooks): CADET_II lifts off, stage 1 burns out, auto-separates
(toast + HUD change + a visibly falling stage), stage 2 ignites on Space and
keeps accelerating; CADET_I behaves exactly as before; no NaN, zero console
errors.

### F6 CONFIGURE . SIMULATE . TELEMETRY screens + six-item nav
CONFIGURE: fuel load slider, auto-stage toggle, pitch-over altitude + target
pitch, each with plain-language help, live effect on the stats. SIMULATE: a
pure `web/js/rocket/predict.js` (`RSX.rocket.predict.makeRun(design, planet,
opts)` with `step(dtSim)` so the UI can chunk it; jsc-tested) runs the real
kernel headlessly on the current design + config (pitch program, full
throttle, auto-stage, up to 600 s) behind a PREDICT button with a progress
bar; shows predicted apogee, max speed, max-Q + its altitude,
burnout/separation times, "reaches space (100 km)?", and an altitude /
speed vs time chart on a 2D canvas, each with a one-line plain-language
note. TELEMETRY: charts of the current/last flight from
`RSX.rocket.telemetry` (altitude, speed, acceleration, q, mass) with event
markers; a TELEMETRY button on the flight HUD opens the same panel as a
non-modal overlay during flight. Nav tabs on every screen become the six-item
model of section 4. Acceptance: predict CADET_I, fly it, compare apogee
within a sensible band; after "back to builder" the TELEMETRY tab shows the
flight just flown; zero console errors.

### F7 Onboarding, progressive complexity, help
A skippable first-run TUTORIAL (localStorage flag `rsx.tutorial.done`;
spotlight overlay, 6 steps: rotate the rocket -> click a part -> open PARTS
and drag a tank -> read the status strip -> CONFIGURE -> LAUNCH; Next / Back /
Skip; "Replay tutorial" inside the CONTROLS overlay). A DETAIL LEVEL control
in the header (Basic / Technical / Advanced, persisted) filtering the stats
panel, the 3D HUD strip and the detail panel (Basic: plain words + four
numbers; Technical: + TWR / Isp / delta-v / margin; Advanced: everything
including chamber pressure, mdot, CoP, per-stage table, flow separation). A
"?" WHAT IS THIS mode: toggled on, the next click on any control shows an
explanation card instead of acting (every interactive control gets a
`data-help` text). Hover `title` tooltips on every control that lacks one.
Acceptance: a fresh profile shows the tutorial, which can be completed and
skipped; the detail level visibly changes the panels; what-is-this explains
at least the nav tabs, the camera bar, every toggle, the PARTS drawer and
LAUNCH; zero console errors.

## 6. Protocol for every implementer agent

1. Read this file, then every file you will touch, fully (game.html is 2000+
   lines: read all of it in chunks; never guess at its contents). Make
   targeted edits, not rewrites, and keep the existing comment style
   (comments explain WHY).
2. Implement ONLY your slice. If a lower slice is missing something you need,
   add the minimum and say so in your report.
3. Tests: add/extend jsc tests for every pure module; `sh tests/js/run.sh`
   must print PASSED for every file (and never fewer tests than before).
4. Browser verification is mandatory and must observe REAL behaviour. Load
   the built-in browser tools with one ToolSearch call:
   `select:mcp__Claude_Browser__preview_start,mcp__Claude_Browser__navigate,mcp__Claude_Browser__computer,mcp__Claude_Browser__find,mcp__Claude_Browser__read_page,mcp__Claude_Browser__get_page_text,mcp__Claude_Browser__read_console_messages,mcp__Claude_Browser__javascript_tool,mcp__Claude_Browser__tabs_create,mcp__Claude_Browser__tabs_close,mcp__Claude_Browser__tabs_context,mcp__Claude_Browser__browser_batch,mcp__Claude_Browser__resize_window`
   (if a Skill tool is available, invoke `anthropic-skills:built-in-browser`
   first). Start the server with `preview_start` and `name: "web-static"`,
   open a FRESH tab at `http://127.0.0.1:8765/game.html`, screenshot, and
   exercise every acceptance item with real clicks/keys at screenshot
   coordinates. Read the console -- zero errors required. Use
   `javascript_tool` to read DOM/JS state when a screenshot cannot prove
   something. Close the tabs you opened.
5. Commit + push after the slice is verified: `git add <explicit files>`, a
   descriptive message (what / why / how it was verified, with the numbers
   observed), ending with the line
   `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, then
   `git push origin game-build`.
6. Report (your final output is data, not a chat message): files touched,
   commit hashes, what was verified and how (actual numbers/observations),
   anything deferred or discovered.

## 7. Protocol for every verifier agent

Be adversarial: assume the slice is broken until you see it work. Run the
test suite. Open a fresh tab, exercise every acceptance item of the slice
with real input, screenshot each state, read the console, read JS state.
Regression-check too: CADET_I stats unchanged, Design <-> Assembly
switching, the launch flow, no console errors. Report PASS/FAIL with a
concrete failure list `{ item, expected, observed, evidence }`; a failure you
cannot reproduce twice is still reported, marked flaky. Never fix anything
yourself.
