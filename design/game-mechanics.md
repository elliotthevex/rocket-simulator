# game-mechanics

## Summary
Build the game as a single deterministic state machine (MENU → BUILD → PAD → FLIGHT⇄MAP → OUTCOME) wrapped around the existing physical engine model, with KSP's key bindings as the desktop standard (Shift/Ctrl throttle, Z/X full/cut, Space stage, T SAS, R RCS, M map, , / . warp) collapsed to SFS's single-rotational-DOF 2D scheme (A/D rotate), and a thumb-reachable on-screen mirror of exactly seven controls for phones. Staging is an ordered queue of part-groups that the auto-stager generates and the player edits; separation does a real graph-split with mass/inertia recomputation and a separation impulse applied off-CoM so boosters visibly tip away. Time warp is two distinct mechanisms — physics warp 1–4× (substepping, legal under thrust, so ascent takes ~2.5 min of wall clock on a real-scale Earth) and on-rails Kepler warp 5×–100,000× gated by altitude and a hard "no thrust, no atmosphere, no chutes" precondition — plus warp-to-apoapsis/periapsis/node buttons that carry the whole quality-of-life load. The 25-part catalog is built so that every part teaches something the physical engine model already computes (hydrolox holds 15.5 t where kerolox holds 37 t in the same tank but gets Isp 459 vs 348; vacuum bells suffer flow separation at sea level; solids cannot be shut down and therefore block rails warp). Failures are instructive rather than punishing: every crash, flip, burn-through and flameout produces a named cause, the number that caused it, the number it needed to be, and a one-key revert.

## Key Decisions
- Model MAP as a co-state of FLIGHT, not a separate state — physics keeps running and the player can throttle and steer from the map, which is required for long orbital burns.
- Adopt KSP's bindings verbatim wherever they still apply (Shift/Ctrl throttle, Z/X full/cut, Space stage, T SAS, R RCS, M map, comma/period warp, F5/F9, Backspace abort, V camera, G gear) and collapse KSP's pitch/yaw/roll to SFS's single rotate axis on A/D + arrow keys, because 2D side view has exactly one rotational degree of freedom.
- Bind stage to BOTH Space and Enter — KSP players expect Space, SFS Steam players expect Enter, and supporting both costs nothing.
- Ship two distinct warp mechanisms and label them separately in the HUD: PHYS 1-4x (integrator substepping, legal under thrust and in atmosphere, makes a real-scale Earth ascent ~2.5 min of wall clock) and RAILS 5x-100000x (analytic Kepler, hard-gated).
- Gate rails warp on: zero thrust AND no burning solid AND above 140 km (or landed at rest) AND no chute deployed AND not clamped. A burning SRB must block rails warp — that restriction is itself the lesson that solids cannot be shut down.
- Implement warp auto-drop with one universal rule — step down while dt_step > t_to_event/6 — instead of a dozen special cases; it guarantees at least six frames of warning before any event.
- Build the warp-to-Apoapsis/Periapsis/Node/SOI buttons in the first warp pass, not later. Nobody should ever hold the period key for thirty seconds.
- At separation, apply the decoupler impulse AT THE DECOUPLER POSITION, not at either centre of mass, so the resulting angular impulse tips radial boosters outward exactly like real strap-ons.
- Delay ignition of the new stage's engines by 0.15 s (liquid) / 0.05 s (solid) after separation. The visible gap between jettison and plume ignition is the most satisfying frame in the genre and it is physically real (ullage settling).
- Order the stage list TOP = next to fire, inverted from KSP's bottom-up list. KSP's ordering is its most-complained-about UI element and new browser players read top-down.
- Default to real Earth constants (6,371 km, mu 3.986e14) because engine realism is the stated priority; offer 0.4x-radius Training Earth as an off-by-default setting for phones.
- Implement nozzle flow separation (pe < 0.4*pa clamps the exit-pressure term and applies a 15% penalty). Without it the vacuum engine at sea level produces nonsense and the vacuum-bell lesson disappears.
- Every terminal event must print the number that caused it AND the number it needed to be, then offer Ctrl+Z revert in under 200 ms. A failure the player cannot diagnose is a bug.
- Auto-checkpoint at stage separation, orbit insertion, SOI change and entry interface, restorable with F9. This is the highest-leverage retention feature in the spec.
- Share designs as copyable JSON text, never as a file download — the artifact sandbox makes <a download> and script-driven saves silently inert for viewers.
- Use semi-implicit (symplectic) Euler at a fixed h = 1/120 s. Explicit Euler makes orbits spiral and will look like a bug.
- Ship the flight loop with one hard-coded rocket through the failure layer (steps 1-8) before building the part editor.

## Pitfalls
- Ctrl+Z collides with Ctrl (throttle down) + Z (full throttle). Guard it: when KeyZ fires with ctrlKey true, run revert only, roll back any throttle change applied this frame, and set suppressThrottleUntil = now + 250 ms.
- Using event.key instead of event.code breaks rotation while Shift is held for throttle. Always read event.code.
- Forgetting preventDefault on Space, Tab, arrows and F-keys lets the browser scroll the page, move focus, or open its own menus mid-flight.
- A single exponential atmosphere puts Max-Q at the wrong altitude and makes the transonic drag rise invisible. Use the three-segment US Standard fit given in the spec.
- Recomputing thrust without the flow-separation clamp makes the vacuum engine produce negative or absurd sea-level thrust, silently breaking the whole engine-choice lesson.
- Not recomputing moment of inertia after separation leaves the upper stage rotating with the full stack's inertia — it will feel like steering a barge and players will report it as broken controls.
- Applying the separation impulse at the centre of mass produces boosters that slide straight back instead of tipping away; the separation looks fake and nobody can tell what happened.
- Letting rails warp run while a solid motor burns silently discards thrust and teleports the rocket. Check chamber pressure, not just the throttle value.
- Physics warp above 1x during terminal descent tunnels the vessel through the ground. Force 1x below 500 m AGL with negative vertical speed, and predict contact one frame ahead so the slow-mo can start 0.15 s BEFORE impact.
- Clamping frameDt is mandatory — a background tab or a GC pause produces a multi-second dt that will fling the rocket into deep space. Cap at 50 ms and cap substeps at 48 per frame.
- The 5 Hz replay ring buffer will silently grow past a few MB if partStates are stored uncompressed per frame. Store only deltas for part state and cap the buffer at 20 minutes.
- Debris vessels accumulate without a cap and tank the frame rate on a multi-booster launch. Cap live debris at 6 bodies and retire the oldest.
- localStorage reads and writes throw in private windows, in thumbnail capture, and when site data is blocked. Wrap every access in try/catch and render correctly with no stored value.
- Auto-staging that reruns after the player has hand-edited stages destroys their work. Set stagesLocked on the first manual edit and only clear it via an explicit Re-auto-stage button.
- Putting a gesture on a single tap in the flight area guarantees mis-taps that kill runs. Reserve single tap for the seven declared buttons only.
- Placing the STAGE button where a thumb rests during rotation causes accidental separations. Keep it bottom-centre, 96 px, hazard-striped, and offer hold-to-confirm in settings.
- Building the part editor before the flight model is fun produces a builder attached to a rocket that flies badly — the most common failure mode for this genre.
- Hydrolox tank dry mass at the usual 5% makes the LH2 trade look strictly superior. It must be ~11% (insulation) or the central educational trade in the catalog collapses.
- Rails warp that hands back an inconsistent state vector on exit produces a visible jump. Convert conic elements back to r,v in the same frame you leave rails, before any force is applied.

## Full Spec

# Core Game Mechanics Specification

Scope: the moment-to-moment loop, controls, staging, time warp, part catalog, outcomes, and retention features. The existing combustion model (BATES regression, Saint Robert's law, quasi-steady chamber pressure, area-Mach thrust coefficient, per-propellant c\* and γ) is the authority for all thrust and mass-flow numbers. Nothing here overrides it; the part table below supplies its inputs.

---

## 0. World constants (needed by everything below)

| Symbol | Value | Notes |
|---|---|---|
| `EARTH.R` | 6,371,000 m | real scale, default |
| `EARTH.mu` | 3.986004418e14 m³/s² | |
| `EARTH.rot` | 7.2921159e-5 rad/s | pad starts with 465 m/s eastward velocity |
| `EARTH.atmTop` | 140,000 m | drag and heating are exactly zero above |
| `EARTH.karman` | 100,000 m | "reached space" line |
| `EARTH.soi` | 9.24e8 m | |
| `LUNA.R` | 1,737,400 m | |
| `LUNA.mu` | 4.9048e12 m³/s² | |
| `LUNA.a` | 3.844e8 m | circular orbit, 2D coplanar |
| `LUNA.soi` | 6.61e7 m | |
| `g0` | 9.80665 m/s² | Isp definition only |

Atmosphere — piecewise US Standard, not a single exponential (players will notice the difference at Max-Q):

```
h < 11000:   T = 288.15 - 0.0065h;      p = 101325*(T/288.15)^5.2559
h < 25000:   T = 216.65;                p = 22632*exp(-(h-11000)/6341.6)
h < 140000:  T = 216.65 + 0.0028*(h-25000); p = 2488*(T/216.65)^-11.388
h >= 140000: p = 0, rho = 0
rho = p / (287.053*T);  a_sound = sqrt(1.4*287.053*T)
```

**Difficulty / scale toggle** (settings, persisted): `REAL` (default, table above) or `TRAINING` — Earth radius ×0.4 (2,548,400 m) with `mu` scaled so surface gravity stays 9.81 m/s². Orbital velocity drops from 7.79 km/s to 5.00 km/s and orbit becomes a 3-minute affair. Default OFF because engine realism is the stated priority; expose it as "Training Earth (faster orbits)" for phones and kids.

---

## 1. Core gameplay loop as a state machine

### 1.1 States

```
BOOT → MENU
MENU ⇄ BUILD ⇄ PAD → FLIGHT ⇄ MAP → OUTCOME → {PAD | BUILD | MENU | REPLAY}
PAUSE and TUTORIAL are modal overlays that can sit on top of PAD/FLIGHT/MAP.
```

`gameState` is a single string; `viewMode` (`ROCKET` | `MAP`) is a separate field, because MAP does **not** stop physics. Model MAP as a co-state of FLIGHT with its own camera, renderer and input map.

### 1.2 What the player does in each state

**BOOT** (≤400 ms) — build the part atlas, warm the canvas, read `localStorage`. No UI beyond a logo and a progress bar. Auto-advance.

**MENU** — three columns, no submenus deeper than one level:
- *Fly Now*: the five quick-launch presets (§7.1) as cards showing a rocket silhouette, stage count, total Δv, liftoff TWR, and the one lesson it teaches. One click → PAD.
- *Build*: opens BUILD with either a blank stack or a saved design.
- *Missions*: the 12-mission board (§7.6). Selecting a mission sets `activeMission` and its success predicate, then goes to BUILD or straight to PAD if the mission ships a reference rocket.
- Footer: Settings, Controls card, Achievements, Flight Log archive.

**BUILD** (the VAB) — a side-view grid. Left rail = part catalog in 6 collapsible groups (Command, Structure, Aero, Recovery, Tanks, Engines). Center = the rocket on a vertical centerline with attach nodes drawn as small circles. Right rail = the live stack analysis, recomputed on every change:

- Total mass, dry mass, propellant mass, height, max diameter
- **Per-stage** Δv (vac and sea level), burn time, start/end TWR, and a stacked bar chart of the Δv budget
- Total Δv vs. a horizontal reference line at "orbit needs ≈9,400 m/s"
- Liftoff TWR with a red zone below 1.15 and a yellow zone above 2.2 (gravity-loss / drag-loss coaching)
- CoM and CoP markers with a stability caption: green if CoP is at least 0.5 calibers below CoM, red otherwise, with the text "add fins or move mass forward"
- A validity checklist: has command part, has engine, has a way to come home

Actions: drag to place, right-click to delete, mirror-symmetry toggle (x2 across the centerline, essential for radial boosters), subassembly copy (Ctrl+drag), auto-stage button, manual stage editor (§3.4), Save / Save As / Load, and **Launch**.

**PAD** — the rocket sits on the pad with launch clamps, the camera framed on it, HUD live but frozen at T-0. Physics runs at 1× but the vessel is pinned. The player can: rotate the camera/zoom to admire it, review the stage list, hit **Launch** (or Space, which fires stage 1) to release the clamps and ignite. Optional 10-second countdown with a skip. This state exists so *revert to launch* has an exact, cheap restore point: snapshot the full vessel + world at PAD entry into `padSnapshot`.

**FLIGHT** (`viewMode = ROCKET`) — the core. The player throttles, steers, stages, watches the HUD, and reacts. Camera follows the vessel with the modes in §2.6. Physics fixed-step 1/120 s. This is where 90% of session time is spent.

**MAP** (`viewMode = MAP`) — top-down-equivalent orbital plot (in 2D side view this is literally the same plane, which is a gift: the map view is a zoomed-out, schematic version of the same coordinates, so there is no mental translation cost). Player: reads Ap/Pe/period/eccentricity, sets a target body, places and drags a maneuver node, uses warp-to buttons. Physics continues; the player can still throttle and steer from map view (KSP allows this; it is essential for long burns).

**PAUSE** — overlay, `dt = 0`. Resume, Revert to Launch, Revert to Build, Restart Mission, Settings, Controls, Quit to Menu.

**OUTCOME** — the mission report card (§6.5). Reached on any terminal event. Offers: Revert to Launch, Back to Build, Watch Replay, Next Mission, Share Design (copy JSON text).

**REPLAY** — plays the recorded snapshot ring buffer through the normal flight renderer with a cinematic camera and a scrub bar. Read-only.

### 1.3 Transition table

| From | Trigger | Guard | Action | To |
|---|---|---|---|---|
| BOOT | assets ready | — | — | MENU |
| MENU | click preset card | — | load preset JSON, `spawnOnPad()` | PAD |
| MENU | click Build / Load | — | load design or blank | BUILD |
| MENU | click mission | — | set `activeMission` | BUILD or PAD |
| BUILD | click Launch | design valid (command + engine) | `padSnapshot = serialize(world)` | PAD |
| BUILD | Esc | — | prompt if unsaved | MENU |
| PAD | Launch / Space | stage 1 exists | release clamps, fire stage 1, `t0 = now` | FLIGHT |
| PAD | Ctrl+Shift+Z | — | — | BUILD |
| FLIGHT | M / Tab | — | swap camera + input map, keep physics | MAP |
| MAP | M / Tab / Esc | — | — | FLIGHT |
| FLIGHT/MAP | terminal event (§6) | — | freeze inputs, 1.2 s slow-mo, stop recording | OUTCOME |
| FLIGHT/MAP | Esc / P | — | `dt = 0` | PAUSE |
| PAUSE | Esc / Resume | — | — | previous |
| PAUSE/OUTCOME | Ctrl+Z / Revert | `padSnapshot` exists | `deserialize(padSnapshot)` | PAD |
| PAUSE/OUTCOME | Ctrl+Shift+Z | — | restore the design | BUILD |
| OUTCOME | Watch Replay | buffer non-empty | — | REPLAY |
| REPLAY | Esc / end | — | — | OUTCOME |
| any | F9 | checkpoint exists | restore last auto-checkpoint | FLIGHT |

### 1.4 The intended session shape

A first-time player: MENU → *Fly Now* → "Sounding Rocket" → PAD → hold Z, watch it go, chute at 3 km, OUTCOME "Reached 84 km — 16 km short of space" in about 90 seconds. That first loop must complete in under two minutes with zero reading. Every subsequent loop adds one concept: gravity turn, staging, circularisation, reentry, landing, Luna.

Terminal states must always leave a **one-key path back into flight**. `Ctrl+Z` from any OUTCOME re-arms the pad in under 200 ms. This single property is the difference between a toy and a game people replay.

---

## 2. Control scheme

Design rule: **2D side view has exactly one rotational degree of freedom.** KSP's pitch/yaw/roll triple collapses to a single rotate axis, which is precisely what SFS does with its two on-screen arrows. So take KSP's bindings wholesale for everything that still applies (throttle, staging, SAS, RCS, warp, map, camera, quicksave) and take SFS's rotate-left/rotate-right idiom for the one axis that survives. Players from either game find their hands already in the right place.

Implement with `event.code`, not `event.key`, so Shift-held rotate still works. `preventDefault()` on Space, arrows, Tab, and the function keys.

### 2.1 Keyboard — flight

| Action | Primary | Alternate | Behaviour | Justification |
|---|---|---|---|---|
| Throttle up | `ShiftLeft` (hold) | `KeyW` | +50 %/s, ease-in over 120 ms | KSP Shift; W is the universal "forward" |
| Throttle down | `ControlLeft` (hold) | `KeyS` | −50 %/s | KSP Ctrl |
| Full throttle | `KeyZ` | — | snap to 100 % | KSP Z |
| Cut throttle | `KeyX` | — | snap to 0 % | KSP X |
| Rotate CCW (left) | `KeyA` | `ArrowLeft` | command torque −1 | SFS left arrow; KSP yaw-left |
| Rotate CW (right) | `KeyD` | `ArrowRight` | command torque +1 | same |
| Fine control | `KeyF` (hold) | — | scales rotate + throttle rate to 0.25 | KSP uses CapsLock, which browsers cannot read reliably |
| **Stage** | `Space` | `Enter` | fire next stage (§3) | KSP Space + SFS Steam Enter — bind both, cost is zero |
| SAS toggle | `KeyT` | — | on/off, remembers last mode | KSP T |
| SAS: kill rotation | `Digit1` | — | drive ω→0 | see note |
| SAS: prograde | `Digit2` | — | hold velocity vector | |
| SAS: retrograde | `Digit3` | — | hold anti-velocity | |
| SAS: radial out ("up") | `Digit4` | — | hold local vertical | |
| SAS: surface retrograde | `Digit5` | — | landing / reentry attitude | |
| RCS toggle | `KeyR` | — | | KSP R |
| RCS translate fore/aft | `KeyH` / `KeyN` | — | along body axis | KSP H/N |
| RCS translate lateral | `KeyJ` / `KeyL` | — | perpendicular | KSP J/L; I/K are dropped because the third axis does not exist |
| Warp up | `Period` | — | one rung (§4) | KSP `.` |
| Warp down | `Comma` | — | one rung | KSP `,` |
| Warp to next event | `Backslash` | — | Ap / Pe / node / SOI, whichever is soonest | new; carries the QoL load |
| Map toggle | `KeyM` | `Tab` | | KSP M |
| Camera cycle | `KeyV` | — | 5 modes (§2.6) | KSP V |
| Camera reset | `Backquote` | — | | KSP ` |
| Zoom | wheel | `Equal` / `Minus` | log-scale, 1 m/px … 5000 km/px | |
| Pause | `Escape` | `KeyP` | | KSP Esc |
| **Revert to launch** | `Ctrl+Z` | — | see conflict guard below | undo idiom; universally understood |
| Revert to build | `Ctrl+Shift+Z` | — | | |
| Quicksave | `F5` | — | named checkpoint | KSP F5 |
| Quickload | `F9` | — | last checkpoint | KSP F9 |
| Abort | `Backspace` | — | cut throttle, fire abort group, deploy chutes | KSP Backspace |
| Landing legs / grid fins | `KeyG` | — | toggle deploy | KSP G (gear) |
| Deploy all chutes | `KeyC` | — | arm/deploy outside the stage sequence | SFS gives chutes a dedicated button; new players cannot find them in the stage list |
| Flight log | `KeyL` | — | slide-out event list | new |
| Hide UI (screenshot) | `F2` | — | | KSP F2 |
| Controls card | `F1` or `Slash` | — | overlay cheat sheet | |

**Ctrl+Z conflict guard.** Ctrl-held is throttle-down and Z is full-throttle, so `Ctrl+Z` would fire both. Resolve deterministically: when `KeyZ` goes down with `ctrlKey` true, run *revert only*, set `suppressThrottleUntil = now + 250 ms`, and roll back any throttle change applied in the current frame. Document this in the controls card.

Number keys 1–5 for SAS modes deviate from KSP (where they are action groups). Justified: this game has no action-group complexity, and SAS *modes* are the thing a new player reaches for constantly — "point retrograde so I do not burn up" is a core lesson. Give them a persistent on-screen chip so the binding is discoverable.

### 2.2 Keyboard — build

`Delete` remove selected; `Ctrl+D` duplicate; `Ctrl+Z`/`Ctrl+Y` undo/redo the build; `X` toggle mirror symmetry; `Ctrl+S` save; `Space` or `Ctrl+Enter` launch; arrows nudge the selected part; `Home` re-centre the view.

### 2.3 Mouse

**Flight:** wheel = zoom about the cursor; LMB-drag on empty space = free-pan the camera (snaps back to follow after 2 s idle or on `V`); LMB on the throttle bar = drag to set; LMB on a stage-list row = expand it; hover any HUD number = tooltip with the formula and the current inputs (this is where most of the education lands — e.g. hovering TWR shows `F_total / (m·g_local) = 4808 kN / (351 t × 9.79) = 1.40`).

**Build:** LMB-drag a catalog icon onto the stack — the nearest compatible attach node within 40 px highlights and snaps; RMB a placed part = delete; MMB-drag or Space-drag = pan; wheel = zoom; Alt+click = pick up the part and everything above it as a subassembly; Shift+click = multi-select for stage assignment.

**Map:** LMB-drag pan; wheel zoom; click a body = set target; click on your own orbit track = create a maneuver node there; drag the node's prograde/retrograde handle (a ±Δv slider along the velocity vector) and its radial handle; drag the node along the track to retime it; RMB the node = delete.

### 2.4 Touch / on-screen fallback

Phones must be able to complete the whole loop. Show a "rotate your device" hint in portrait; the game targets landscape. Set `touch-action: none` on the canvas and cancel the double-tap zoom.

Exactly seven persistent on-screen controls, all inside the thumb arcs:

1. **Rotate ◀ / ▶** — bottom-left pair, 88×88 px, 16 px gap, hold to rotate. Pressing both simultaneously = kill rotation. Long-press either = fine control while held.
2. **Throttle slider** — bottom-right, vertical, 64 px wide × 45 % of screen height, with detents that snap within 4 % of 0 and 100. Tap the top cap = full, tap the bottom cap = cut. Show the % numerically inside the track.
3. **STAGE** — bottom-centre, 96 px circle, hazard-striped, labelled with the next stage's action ("IGNITE S2", "SEP + CHUTE"). Single tap fires it; a settings option adds hold-350 ms-to-confirm for players who keep fat-fingering it. A 2-second "STAGED" toast names what just happened.
4. **SAS chip** — top-left. Tap = toggle on/off. Long-press = radial mode wheel with the five modes as icons around the thumb.
5. **Warp ladder** — top-right, a vertical stack of pill buttons showing the rungs; illegal rungs are greyed with the reason on tap ("needs 140 km"). Also holds the three warp-to buttons.
6. **MAP** — top-right corner, toggles view.
7. **☰** — top-right, opens pause.

Gestures: pinch = zoom (both views), two-finger drag = pan, single-finger drag on empty space = pan, double-tap = reset camera. Never put a gesture on a single tap in the flight area — that is where mis-taps kill runs.

Build editor on touch: tap a catalog part to select it, then tap an attach node to place (drag-and-drop is unreliable on small screens). Long-press a placed part = context ring (delete / duplicate / assign stage / symmetry).

### 2.5 Gamepad (optional, cheap)

Left stick X = rotate, right trigger = throttle up, left trigger = throttle down, A = stage, B = SAS, X = RCS, Y = map, bumpers = warp, right stick = camera. Wire it through the same virtual-axis layer as touch and keyboard; ~30 lines.

### 2.6 Camera modes (cycled with `V`)

1. **Chase** (default): follows the vessel, up = local vertical, smooth-damped, auto-zooms so the vessel occupies ~18 % of screen height.
2. **Locked**: rotates with the vessel body — sells the tumble when things go wrong.
3. **Ground/Pad**: fixed at the launch site, tracks the vessel like a range camera with a telephoto zoom that widens as it climbs. This is the shot that makes the launch look like a launch.
4. **Orbital**: up = velocity vector.
5. **Free**: drag and zoom manually.

Camera events (not modes) that fire automatically and return control after: stage separation (0.6 s wide shot), fairing jettison, parachute full-deploy, touchdown, destruction (slow-mo 0.25× for 1.2 s).

---

## 3. Staging system

### 3.1 Data model

```js
part = { id, typeId, x, y, rot, mirrored, stageIndex, state:{...}, links:[partId,...] }
stage = { index, label, actions:[ {partId, verb} ], fired:false }
// verb ∈ IGNITE | SEPARATE | DEPLOY_CHUTE | JETTISON_FAIRING | DEPLOY_LEGS | ACTIVATE_RCS | SHUTDOWN
vessel = { parts[], stages[], nextStage:0, rootPartId, ... }
```

Stages are an **ordered queue**, not a tree. `nextStage` starts at 0 and increments on every activation. Every part may belong to at most one stage; parts in no stage are inert structure or always-on (probe cores, fins, tanks).

### 3.2 Auto-stager

Runs on every build change unless the player has manually edited stages (`stagesLocked` flag, cleared by a "Re-auto-stage" button):

1. Walk the stack from the bottom up.
2. Every contiguous group of engines that share the lowest attach level and are not separated from each other by a decoupler forms one `IGNITE` action set.
3. Each decoupler creates a `SEPARATE` action, placed in the stage *after* the engines below it — so a stage reads "separate the spent booster, then ignite the next engine". Both go in the same stage entry with SEPARATE ordered first.
4. Radial boosters get their own earlier stage (they burn out first).
5. Fairings get a stage placed after the last stage whose burn ends below 70 km (heuristic; the player will move it).
6. Chutes get the last stage; drogue and main become two separate stages if both are present.
7. Legs are never staged (they are on `G`).

### 3.3 Separation physics — exact procedure

On `SEPARATE` for decoupler `d`:

1. Remove `d`'s joint from the part graph. Flood-fill twice. The component containing the active command part is `KEEP`; the other is `JETT`. If the fill produces more than two components (a mid-stack radial decoupler), the largest non-command component is `JETT` and the rest are additional debris bodies.
2. For each new body compute mass `m`, centre of mass `r_cm`, and 2D scalar inertia `I = Σ (I_i + m_i·|r_i − r_cm|²)`.
3. Inherit motion: `v_i = v_parent + ω_parent × (r_cm_i − r_cm_parent)`, `ω_i = ω_parent`. This alone makes a rotating rocket throw its stages sideways correctly.
4. Apply the separation impulse `J` (N·s, from the decoupler's spec) along the unit vector `n` pointing from JETT toward KEEP, applied **at the decoupler's position**, not at either CoM:
   - `Δv_keep = +(J/m_keep)·n`, `Δv_jett = −(J/m_jett)·n`
   - `Δω_i = ((r_d − r_cm_i) × (±J·n)) / I_i`
   The off-CoM application is what makes radially-mounted boosters visibly tip outward and away, exactly like real strap-ons. Do not skip it.
5. The decoupler part itself stays with `JETT` (spec flag `staysWithLower`, default true).
6. Recompute for `KEEP`: total mass, CoM, inertia, frontal area, drag reference, CoP, engine list, propellant crossfeed graph, Δv budget.
7. `JETT` becomes a `DebrisVessel`: full physics (gravity + drag + heating, no control), destroyed on ground contact above 12 m/s, on burn-through, or after `45 s` / `30 km` separation from the active vessel, whichever comes first. Cap live debris at 6 bodies; retire the oldest.
8. Presentation: pyrotechnic flash sprite at each severed joint, 8–12 spark particles with 0.4 s lifetimes, a 40 ms camera kick, low-frequency "thunk", and a `STAGE n SEPARATED` log entry with altitude, velocity and remaining Δv.
9. **Ignition delay**: liquid engines in the same stage light `0.15 s` after the separation; solids `0.05 s`. The visible gap between "the old stage floats away" and "the new plume lights" is the single most satisfying frame in the genre. It is also real (ullage settling).

### 3.4 Ullage (realism setting, on at Normal and Realistic)

If a liquid engine is commanded to ignite while the vessel's net non-gravitational acceleration has been below `0.05 m/s²` for more than 2.0 s, the start is rough: chamber pressure is clamped to 60 % for 1.5 s, the plume flickers, and a `PROPELLANT NOT SETTLED` caption appears. Firing RCS fore for ≥1 s beforehand clears it. Teaches ullage in one failed burn.

### 3.5 Stage list UI

Left edge of the flight HUD, a vertical column of rows, **top row = next to fire** (deliberately inverted from KSP's bottom-up list; new players read top-down and KSP's ordering is its single most-complained-about UI element).

Each row shows: the stage number, icons for each action, and a one-line summary. The next row is highlighted, enlarged 15 %, and outlined in the accent colour, with a pulsing edge when the current stage's engines have flamed out. Rows below are dimmed; fired rows collapse to a thin struck-through line and scroll off after 3 s.

Each unfired row shows its computed **Δv** and **burn time**; the active row shows a horizontal propellant bar draining live plus `T+` burn elapsed. Hovering a row highlights the affected parts on the rocket in the same accent colour — the single best "what does this button do" affordance available.

In BUILD, the same column is editable: drag rows to reorder, drag parts between rows, `+` inserts an empty stage, `×` deletes.

---

## 4. Time warp

Two genuinely different mechanisms. Do not blur them; the distinction is itself educational and the HUD should name which one is active (`PHYS 4×` vs `RAILS 1000×`).

### 4.1 Physics warp — 1×, 2×, 3×, 4×

Integrator substepping. Fixed step `h = 1/120 s`. Per rendered frame, advance `n = round(warp · frameDt / h)` steps, clamped to `n ≤ 48`. If the clamp bites, drop the effective factor and display `WARP LIMITED (CPU)`.

Legal **always** — under thrust, in atmosphere, on the pad, during reentry, while landing. This is what makes a real-scale Earth playable: a 9-minute ascent becomes ~2.5 minutes of wall clock at 4×, which matches SFS's decision to allow 3× warp during burns and reentry.

Everything stays live: drag, heating, collisions, structural loads, control input. Because collision detection degrades at large steps, force back to 1× when altitude AGL < 500 m and vertical speed < 0 (landing), and cap at 2× when any part temperature exceeds 60 % of its limit.

### 4.2 On-rails warp — 5×, 10×, 25×, 100×, 1,000×, 10,000×, 100,000×

Position comes from the analytic conic, not from integration:

```
n_mean = sqrt(mu / |a|^3)
M += n_mean * dt            // dt = warpFactor * frameDt
solve Kepler for E (Newton, 5 iters, tol 1e-10; hyperbolic form when e > 1)
r, v = conic_to_state(a, e, E, argPe, mu)
```

No drag, no thrust, no per-part heating, no rigid-body rotation dynamics. Attitude is either frozen or slewed kinematically toward the SAS target at 30 °/s. Collision reduces to an analytic check: if periapsis radius < body radius, compute the impact epoch and force the warp to unwind before it.

Ladder positions are fixed rungs; `.` and `,` step one rung and never skip.

### 4.3 Preconditions for rails warp (ALL must hold)

- Throttle is 0 **and** no engine is producing thrust (chamber pressure below 1 % of nominal). A burning solid motor therefore blocks rails warp entirely — it cannot be shut down. Surface this as a tooltip: "Solid motors cannot be throttled or shut down. Wait for burnout." That single sentence teaches more than a paragraph would.
- No RCS translation input this frame.
- Altitude > `atmTop` (140 km at Earth) **or** the vessel is landed and at rest (`|v_surface| < 0.5 m/s` and ≥2 contact points touching).
- Not clamped to the pad; not in the countdown.
- No parachute in the deploying or deployed state.
- Not within 0.5 s of a destruction event.

### 4.4 Altitude gates per rung

Rungs whose gate is unmet render greyed with the required altitude printed.

| Rung | Factor | Min altitude above Earth | Min altitude above Luna |
|---|---|---|---|
| P1–P4 | 1×, 2×, 3×, 4× | any (physics warp) | any |
| R1 | 5× | 140 km (or landed at rest) | 0 (or landed) |
| R2 | 10× | 140 km | 0 |
| R3 | 25× | 140 km | 5 km |
| R4 | 100× | 200 km | 15 km |
| R5 | 1,000× | 500 km | 60 km |
| R6 | 10,000× | 5,000 km | 300 km |
| R7 | 100,000× | 60,000 km | — (use Earth's gate in Earth SOI) |

### 4.5 Auto-drop

Step down one rung every 0.25 s until legal. Triggers:

- **Any control input** (throttle, stage, RCS) → immediately 1×. Rotation input is allowed at physics warp and drops rails warp to P1.
- **Event proximity**: drop while `dt_step > (t_to_event / 6)`, where `t_to_event` is the time to the soonest of: atmosphere entry, periapsis, apoapsis, SOI change, maneuver node minus 10 s, or predicted terrain impact. This single rule replaces a dozen special cases and guarantees at least six frames of warning before anything happens.
- Electric charge exhaustion, part destruction, or leaving the current conic's validity.

### 4.6 Warp-to buttons

`Warp to Apoapsis`, `Warp to Periapsis`, `Warp to Maneuver Node`, `Warp to SOI Change`, `Warp +1 Orbit`, and `Backslash` = whichever is soonest. Implementation: compute the target epoch, then each frame pick the highest legal rung such that the remaining time still spans ≥ 60 rendered frames, stepping down automatically as it closes and landing exactly at 1× with 3 s to spare. These buttons do more for retention than any other single feature — nobody should ever hold `.` for thirty seconds.

---

## 5. Part catalog (25 parts)

Shared fields on every part: `id`, `type`, `name`, `d` (diameter, m), `L` (length, m), `dryMass` (kg), `cd` (axial drag coefficient contribution), `cnAlpha` (normal-force slope, per rad, drives CoP), `maxAeroLoad` (Pa·rad; `q·|α|` above this snaps the part off), `maxTemp` (K), `impactTol` (m/s), `cost` (flavour only). Engines additionally carry the inputs the existing combustion model needs: `pc`, `At`, `eps`, `prop` (preset key giving c\* and γ), and for solids the BATES geometry and Saint Robert coefficients.

### 5.1 Command & control

| ID | Type | Name | Size d×L (m) | Dry (kg) | Type-specific |
|---|---|---|---|---|---|
| `PROBE-1` | capsule (probe) | Pathfinder Probe Core | 1.2 × 0.5 | 90 | crew 0; torque 2.5 kN·m; battery 900 Wh; body solar 40 W; cd 0.50; maxTemp 900 K; impactTol 8 |
| `CAP-1` | capsule | Mk1 Crew Capsule | 2.4 × 2.2 | 1,200 | crew 1; torque 12 kN·m; battery 1,200 Wh; integrated ablator 180 kg; cd 1.35 blunt-forward / 0.55 nose-forward; maxTemp 1,900 K; impactTol 12 |
| `CAP-3` | capsule | Mk3 Crew Module | 3.6 × 3.2 | 3,900 | crew 3; torque 30 kN·m; battery 3,000 Wh; ablator 420 kg; cd 1.35/0.55; maxTemp 1,900 K; impactTol 10 |
| `RCS-BLK` | rcs | RCS Thruster Quad | 0.4 × 0.5 | 45 | 4 nozzles; 400 N each; storable N₂O₄/MMH, Isp 285 s; 60 kg internal propellant; 60 W while firing; provides torque **and** translation |

### 5.2 Structure & staging

| ID | Type | Name | Size (m) | Dry (kg) | Type-specific |
|---|---|---|---|---|---|
| `DEC-S` | decoupler | Separator 1.2 m | 1.2 × 0.25 | 55 | separation impulse 2,600 N·s; stack **or** radial mount; `staysWithLower = true` |
| `DEC-M` | decoupler | Separator 2.4 m | 2.4 × 0.35 | 190 | impulse 9,500 N·s; stack or radial; supports propellant crossfeed toggle (radial mode only) |

Diameter mismatches auto-generate a conical adapter with mass `120 kg × |Δd|` — no separate part needed, no player confusion.

### 5.3 Aerodynamics & thermal

| ID | Type | Name | Size (m) | Dry (kg) | Type-specific |
|---|---|---|---|---|---|
| `NC-M` | nosecone | Aerocone 2.4 m | 2.4 × 3.2 | 240 | sets stack `cd0 = 0.26` (vs 0.85 for a flat top); nose radius 0.35 m (drives Sutton-Graves heating); cnAlpha 1.4 |
| `FRG-M` | fairing | Payload Fairing 2.4 m | 2.4 × 6.0 | 520 | two halves; jettison impulse 1,800 N·s each, outward; while attached, enclosed parts get **zero** drag and **zero** heating; `cd0 = 0.22`; jettison is a stage action |
| `FIN-D` | fin | Delta Fin | span 1.6, area 1.9 m² | 120 | passive; cnAlpha 2.4/rad; mount 4× symmetric; moves CoP aft — this is the anti-flip part |
| `FIN-G` | fin | Grid Fin | span 1.2, area 1.1 m² | 140 | **active**: deflects ±20° from the rotate keys; effective only at q > 1 kPa; adds cd 0.15 when deployed; stows with `G`; the booster-return part |
| `HS-M` | heatshield | Ablative Heat Shield 2.4 m | 2.4 × 0.4 | 340 + 240 ablator | ablation enthalpy 1.2e7 J/kg; backface limit 800 K; cd 1.40 leading; consumed ablator is gone for good |

### 5.4 Recovery

| ID | Type | Name | Size (m) | Dry (kg) | Type-specific |
|---|---|---|---|---|---|
| `CHU-D` | parachute | Drogue Chute | 1.2 × 0.8 | 80 | canopy 40 m²; Cd 1.0; safe deploy q < 25 kPa; opens over 2.5 s; rips above the q limit |
| `CHU-M` | parachute | Main Parachute | 1.2 × 1.0 | 180 | canopy 320 m²; Cd 1.5; semi-deploy any altitude, full deploy below 1,500 m; safe q < 6 kPa; opens over 4.0 s; ≈7 m/s terminal for a 1.5 t capsule |
| `LEG-4` | leg | Landing Legs (×4) | span 4.2 deployed | 260 | stroke 0.45 m; max touchdown 6.0 m/s vertical, 2.0 m/s lateral; max tip 12°; deploy 2.5 s; +cd 0.06 deployed; toggled with `G` |

### 5.5 Tanks

Bulk densities: kerolox 1,023 kg/m³ (MR 2.56), methalox 833 (MR 3.6), hydrolox 344 (MR 5.5). These numbers, not a hand-wave, are what make the hydrolox lesson land.

| ID | Type | Name | Size d×L (m) | Dry (kg) | Propellant |
|---|---|---|---|---|---|
| `TNK-S1` | tank | Kerolox Tank S | 1.2 × 4.0 | 260 | RP-1/LOX, 4,600 kg (4.52 m³); cd 0.05; maxAeroLoad 12,000 |
| `TNK-M1` | tank | Kerolox Tank M | 2.4 × 8.0 | 1,900 | RP-1/LOX, 37,000 kg (36.2 m³) |
| `TNK-L1` | tank | Kerolox Core Tank L | 4.8 × 16.0 | 13,000 | RP-1/LOX, 296,000 kg (289.5 m³); accepts engine clusters of 1/3/5/7 |
| `TNK-M2` | tank | Methalox Tank M | 2.4 × 8.0 | 1,700 | CH₄/LOX, 30,000 kg (36.2 m³) |
| `TNK-M3` | tank | Hydrolox Tank M | 2.4 × 10.0 | 1,800 | LH₂/LOX, **15,500 kg** (45.2 m³); boil-off 0.08 %/hr of remaining (realism toggle); insulation is why dry mass is 11 % not 5 % |

The `TNK-M1` vs `TNK-M3` pair is the catalog's centrepiece: the same-diameter hydrolox tank is 25 % longer, holds 58 % less propellant by mass, and its engine has 32 % higher Isp. The build screen's Δv chart resolves that trade live. Nothing else in the catalog teaches as much per byte.

### 5.6 Engines

All values below are **design targets**: the implementation computes thrust from the existing model as `F = Cf · pc · At`, with `Cf` from the isentropic area-Mach relation and the exit-pressure term `(pe − pa)/pc · ε`. If the computed numbers drift from these targets by more than ~3 %, tune `At`, not the model.

| ID | Name | Prop | d×L (m) | Dry (kg) | pc (MPa) | At (m²) | ε | c\* (m/s) | γ | Targets |
|---|---|---|---|---|---|---|---|---|---|---|
| `SRB-S` | Kestrel-S Booster | APCP solid | 0.94 × 5.6 | 480 (+5,000 prop) | ~5.6 (solved) | 0.0405 | 8 | 1,550 | 1.18 | F_sl ≈ 335 kN, Isp_sl ≈ 234 s, burn ≈ 29 s |
| `SRB-L` | Castor-L Booster | APCP solid | 2.5 × 17.5 | 9,500 (+110,100 prop) | ~6.3 (solved) | 0.34 | 11 | 1,550 | 1.18 | F_sl ≈ 3,200 kN, Isp_sl ≈ 238 s, burn ≈ 74 s |
| `ENG-K1` | Vulcan-1 (sea level) | RP-1/LOX | 1.1 × 2.4 | 630 | 10.0 | 0.0165 | 16 | 1,823 | 1.22 | F_sl 257 kN / F_vac 284 kN; Isp 289/320 s; ṁ 90.5 kg/s; gimbal ±8°; throttle 40–100 % |
| `ENG-KV` | Vulcan-V (vacuum) | RP-1/LOX | 1.6 × 3.0 | 480 | 6.0 | 0.0210 | 60 | 1,823 | 1.22 | F_vac 236 kN; Isp_vac 348 s; ṁ 69.1 kg/s; gimbal ±6°; throttle 55–100 %; **flow separation below ~11 km** |
| `ENG-M1` | Prometheus (full-flow) | CH₄/LOX | 1.5 × 3.4 | 1,700 | 25.0 | 0.0290 | 40 | 1,830 | 1.16 | F_sl 1,200 kN / F_vac 1,320 kN; Isp 309/340 s; ṁ 396 kg/s; gimbal ±15°; **throttle 25–100 %**; relightable — the landing-burn engine |
| `ENG-H1` | Aquila (vacuum) | LH₂/LOX | 2.2 × 4.1 | 320 | 4.4 | 0.0180 | 84 | 2,380 | 1.20 | F_vac 150 kN; Isp_vac 459 s; ṁ 33.3 kg/s; gimbal ±4°; throttle 20–100 %; relightable ×8 |

**SRB BATES geometry.** `SRB-S`: 3 segments, grain OD 0.90 m, core ID 0.30 m, segment length 1.60 m. `SRB-L`: 4 segments, OD 2.40 m, core ID 0.90 m, segment length 4.00 m. Both: ρ = 1,770 kg/m³, `a = 0.0055` m/s (pc in MPa), `n = 0.35`. Solids cannot be throttled, shut down, or restarted — enforce it and say so in the tooltip.

**Nozzle flow separation.** Compute `pe` for the nozzle by bisecting the area-ratio relation. If `pe < 0.4·pa`, the flow separates: clamp the exit-pressure term, add a 15 % thrust penalty, shake the plume visual, and show `OVER-EXPANDED — FLOW SEPARATION`. Without this, `ENG-KV` at sea level produces nonsense and the whole vacuum-engine lesson evaporates.

**Optional stretch pair** (do not count against the 25; add once the core loop ships): `ENG-ION` gridded ion thruster, 0.5 N, Isp 3,200 s, 5 kW, and `TNK-XE` xenon tank, 1.2 × 1.5 m, 40 kg dry / 220 kg xenon. Only meaningful once 100,000× warp exists — which is exactly why it makes a good "you have graduated" unlock.

### 5.7 Aerodynamic and thermal model the catalog feeds

```
q      = 0.5 * rho * v^2
Cd(M)  = cd0 * f(M),  f = 1.00 (M<0.8), rises to 1.90 at M=1.05, 1.10 at M=3, 0.95 above M=5
Drag   = q * Cd(M) * A_frontal            // A_frontal from max stack diameter
N_i    = q * cnAlpha_i * A_lat_i * sin(alpha) * cos(alpha)   // per part, gives CoP for free
torque = Σ (r_i - r_cm) × N_i
q_heat = 1.7415e-4 * sqrt(rho / R_nose) * v^3   [W/m²]   // Sutton-Graves
dT/dt  = (q_heat*A_exposed - sigma*emis*A*T^4 - mdot_abl*h_abl) / (m*c_p)
mdot_abl = q_heat * A / 1.2e7            // while ablator remains
```

CoM and CoP are recomputed every frame and drawn as two small markers on the rocket whenever `|alpha| > 3°` — the visual that turns "why did I flip" into "oh, my centre of pressure is above my centre of mass".

---

## 6. Failure and success states

Design principle: **every terminal event names its cause, prints the number that caused it, prints the number it needed to be, and is one key away from a retry.** A failure the player cannot diagnose is a bug, not a challenge.

### 6.1 Failures

| Failure | Exact trigger | Feedback |
|---|---|---|
| **Structural aero failure** | `q · |α| > part.maxAeroLoad` for >0.3 s | Rising metal groan starting at 70 % of the limit; the stressed part flashes amber on the rocket; at failure the part snaps off with a debris trail and the vessel tumbles. Card: "Structural failure at 11.2 km. Max-Q 34 kPa at 14° angle of attack. Tank rated to 12,000 Pa·rad; you were at 8,300 → limit exceeded. Keep α under 5° through Max-Q." |
| **Aerodynamic flip / loss of control** | CoP forward of CoM **and** `|α| > 90°` for >1.5 s in atmosphere | At 45° a yellow `UNSTABLE` chip appears and the CoM/CoP markers turn on automatically. On flip: camera switches to Locked so the tumble reads, control authority drops to fin-only. Card names the CoP/CoM offset and recommends `FIN-D`. |
| **Propellant depletion** | tank empty | Chamber pressure decays over 0.4 s (real tail-off, not a hard cut), plume shrinks and gutters out, `PROPELLANT DEPLETED — STAGE 2` caption, stage Δv reads 0. Not itself terminal — it becomes a suborbital or stranded outcome. |
| **Stranded in space** | no propellant, no path to a periapsis below 100 km, crew aboard | Slow zoom-out to map, quiet music cue, card: "Stranded. Periapsis 210 km — you needed 1,140 m/s more to come home." Offers revert and a checkpoint list. |
| **Crash / hard landing** | ground contact above `part.impactTol`, or on legs above 6.0 m/s vertical / 2.0 m/s lateral, or tipped past 12° | Flash → expanding shockwave ring → debris → dust. 0.25× slow-mo for 1.2 s from 0.15 s before contact. Card: "Impact at 21.4 m/s. Legs rated 6.0 m/s. You needed 15.4 m/s more braking — start the landing burn ~340 m higher." |
| **Reentry burn-through** | part temperature > `maxTemp`, front-to-back | Plasma sheath builds from ~2 km/s below 80 km; ablator gauge drains visibly; parts glow orange → white; when the shield is spent the next part heats and fails, then the stack unzips forward. Card: "Heat shield ablator exhausted at 48 km. Peak heat flux 1.9 MW/m². Entry interface speed 8,100 m/s — try raising periapsis to 55 km for a shallower entry." |
| **Chute rip** | deployed above the part's q limit | Loud tearing sound, the canopy shreds visually and the part goes inert. Card: "Main chute deployed at 24 kPa; rated 6 kPa. Deploy the drogue first, or wait until below 4 km." |
| **Crew G-load** | > 12 g sustained for 3 s (Realistic: 9 g / 5 s) | HUD vignette darkens progressively above 6 g, audio muffles. Card gives peak g and duration. |
| **Power loss** | electric charge = 0 | SAS and reaction wheels stop, HUD flickers, RCS still works if it has propellant. Recoverable if solar-lit. |
| **Ullage rough start** | see §3.4 | Not terminal — a 1.5 s underperforming burn plus a caption. Pure teaching moment. |

### 6.2 Successes

| Success | Trigger | Feedback |
|---|---|---|
| **Max-Q passed** | q peaks then falls below 0.8× peak | Small "MAX-Q 34 kPa" ticker entry. A milestone, not an outcome. |
| **Reached space** | altitude > 100 km | Full-width banner "KÁRMÁN LINE — 100 km", the sky finishes fading to black, stars sharpen, the badge pops. |
| **Orbit achieved** | periapsis > `atmTop` and eccentricity < 1 | Map auto-opens for 2 s and draws the closed ellipse with a sweeping trace; big "ORBIT ACHIEVED"; readout of Ap / Pe / period / eccentricity; achievement. This is the game's biggest single moment — spend the animation budget here. |
| **Soft landing** | vertical < leg rating, lateral < 2 m/s, tilt < 12°, at rest 3 s | Legs compress and rebound, dust plume, engine plume dies, "TOUCHDOWN" with the touchdown velocity, remaining propellant, and landing-accuracy distance from the target marker. |
| **Splashdown / chute recovery** | descent under chutes to rest | Water plume or dust, "RECOVERED", crew survival confirmed. |
| **Lunar orbit / lunar landing / return** | corresponding conditions | Escalating banners; the Luna landing gets a dedicated camera move and a slow music cue. |
| **Full mission** | reentry survived + recovery + crew alive | Report card with medals (§6.5). |

### 6.3 Milestone ticker

Non-terminal events print to a right-aligned, fading ticker and to the flight log: liftoff, tower cleared, Max-Q, booster separation, staging, fairing jettison, MECO, SECO, apoapsis, orbit insertion, SOI change, entry interface, peak heating, chute deploy, touchdown. Free pacing, near-zero cost, and it gives every flight a narrative.

### 6.4 Slow-motion rule

Any destruction or touchdown event sets `timeScale = 0.25` from 0.15 s before the contact (possible because collisions are predicted a frame ahead) for 1.2 s, then eases back. This one rule is most of what makes crashes feel good instead of abrupt.

### 6.5 Outcome card

A single panel with: outcome title and cause; a mission profile strip (altitude vs. time sparkline with staging events marked); and the numbers — max altitude, max speed, Max-Q, peak g, peak heat flux, Δv spent vs. the theoretical minimum for what was achieved (efficiency %), propellant remaining, flight duration, crew status. Then medals: **Efficient** (>75 % Δv efficiency), **Gentle** (peak g < 4), **Precise** (landed within 500 m of the target), **Reusable** (booster recovered intact). Buttons: Revert to Launch (`Ctrl+Z`), Back to Build, Watch Replay, Next Mission, Copy Design.

---

## 7. Quality-of-life and retention

### 7.1 Quick-launch presets (five, each teaching one thing)

| Preset | Build | Teaches |
|---|---|---|
| **Sounding Rocket** | `NC-M` + `CAP-1` + `CHU-M` + `TNK-S1` + `ENG-K1` + 4×`FIN-D` | Throttle, chutes, why you don't reach space by accident |
| **Orbiter-1** | 2 stages: `TNK-M1`+`ENG-K1`; `TNK-S1`+`ENG-KV`; `CAP-1`+`HS-M`+`CHU-D`+`CHU-M` | The gravity turn and circularisation |
| **Heavy Lifter** | `TNK-L1` + 4×`ENG-M1` core, 2×`SRB-L` radial, `TNK-M3`+`ENG-H1` upper, `FRG-M` payload | Boosters, clusters, and the hydrolox trade |
| **Moonshot** | 3 stages ending in `TNK-M3`+`ENG-H1`, `CAP-1`+`HS-M`+legs | Trans-lunar injection, SOI changes, high warp |
| **Reusable Booster** | Falcon-style: `TNK-M1`+9×`ENG-M1` (relight-capable), `FIN-G`×4, `LEG-4`; expendable upper | Boostback, grid fins, deep throttling, the suicide burn |

Each card shows the silhouette, stage count, total Δv, liftoff TWR, and its one-line lesson. Clicking flies it immediately — no build step.

### 7.2 Save / load / share

Designs serialise to compact JSON (`{v, name, parts:[{t,x,y,r,m,s}], stages}`); persist to `localStorage` under `rocketsim.designs.<name>`, cap 50 designs with an LRU warning. Share via a **copyable text box** with a "Copy to clipboard" button and a paste-to-import field — do **not** offer a file download, because the artifact sandbox makes `<a download>` and script-driven saves silently inert for viewers. Sharing a design as text also means players can post them anywhere.

Autosave the current design every 20 s and on every launch.

### 7.3 Revert and checkpoints

- `padSnapshot` is captured on every PAD entry; `Ctrl+Z` restores it in <200 ms from anywhere.
- **Auto-checkpoints** are captured at each stage separation, at orbit insertion, at SOI change, and at entry interface — the four moments after which a run is expensive to redo. `F9` restores the most recent; a checkpoint list in the pause menu lets the player pick. This is the single highest-leverage retention feature in the spec: it turns a 12-minute lunar attempt from a run you abandon into a run you keep refining.
- `F5` makes a manual named checkpoint.

### 7.4 Flight log and replay

The log is a timestamped event stream (`T+00:02:14.3 · STAGE 2 SEPARATED · 62.4 km · 2,410 m/s · Δv remaining 4,980 m/s`), toggled with `L`, scrollable, and copyable as text from the outcome screen. It doubles as the mission debrief.

Replay records a 5 Hz ring buffer of `{t, pos, vel, angle, throttle, stageIndex, activePlumes, partStates}` for the last 20 minutes (~6,000 frames, a few MB). Playback runs the flight renderer with interpolation, a scrub bar, 0.25×/1×/4× speeds, and a cinematic camera that automatically cuts to the pad camera for liftoff, wide for separations, and locked for the tumble. Replays are how people show other people the game.

### 7.5 Achievements (20)

Karman Line · First Orbit · Circular (e < 0.01) · Efficient Ascent (>80 %) · Booster Recovered · Grid Fin Landing · Soft Touchdown (<2 m/s) · Pinpoint (<100 m) · Reentry Survivor · Hot Reentry (peak flux > 1.5 MW/m²) · Lunar Flyby · Lunar Orbit · Eagle Has Landed · Return Ticket (Luna → Earth recovery) · Hydrogen Economy (orbit on hydrolox only) · Solid Start (orbit using an SRB first stage) · Deep Space (apoapsis > 500,000 km) · Rapid Unscheduled Disassembly (first crash — celebrate it) · Ullage Understood (recover from a rough start) · Rocket Scientist (all of the above).

Store in `localStorage`; show a corner toast on unlock and a grid in the menu. Lock nothing behind them — they are a checklist, not a gate.

### 7.6 Mission board (12, in order)

Reach 10 km · Break the sound barrier · Reach the Kármán line · Reach orbit · Circularise below e = 0.02 · Deploy a satellite from a fairing · Survive reentry and recover the crew · Land a booster on the pad · Reach a 500 km orbit with ≥1,000 m/s left · Fly by Luna · Orbit Luna · Land on Luna and return.

Each mission carries: a one-paragraph brief, a success predicate evaluated every frame, up to three optional bonus objectives (efficiency / no-revert / propellant remaining), and a hint that unlocks after two failures. Missions are an overlay on free flight, never a separate mode.

### 7.7 Onboarding

First launch only: a five-step contextual overlay that appears on the pad — "Hold Z for full throttle" → (after liftoff) "At 1 km, tap D to tilt 10° east — this is a gravity turn" → "Press Space when the plume dies" → "Press M to see your orbit" → "Burn at apoapsis to raise your periapsis above the atmosphere". Each step is a single sentence anchored to the control it names, dismissed by performing the action. No modal walls of text, ever.

### 7.8 Settings

Realism (Casual / Normal / Realistic — scales structural tolerance ×3/×1/×0.8, G limits, ullage on/off, boil-off on/off), World Scale (Real / Training), Auto-SAS on stage, Confirm-before-stage on touch, Slow-mo on crash, UI scale, reduced-motion, colourblind-safe palette, sound and music volume.

---

## 8. Main loop pseudocode

```js
function frame(now) {
  const frameDt = Math.min((now - last)/1000, 0.05);   // never simulate more than 50 ms of gap
  last = now;

  if (state === PAUSE || state === MENU || state === BUILD) { render(); return raf(frame); }

  input.poll();                       // keyboard + touch + gamepad -> virtual axes
  warp.update(vessel, world);         // may auto-drop; returns mode + factor

  if (warp.mode === RAILS) {
    const dt = warp.factor * frameDt;
    propagateOnRails(vessel, dt);     // Kepler solve, no forces
    world.t += dt;
    checkRailsEvents(vessel);         // Ap/Pe/SOI/impact -> may force unwind
  } else {
    const h = 1/120;
    let n = Math.min(48, Math.round(warp.factor * frameDt / h));
    if (n < warp.factor * frameDt / h) hud.warn('WARP LIMITED (CPU)');
    for (let i = 0; i < n; i++) {
      applyGravity(vessel, world);            // + patched-conic SOI selection
      applyAtmosphere(vessel, world);         // drag, normal force, CoP torque, heating
      applyEngines(vessel, dt=h);             // EXISTING combustion model, authoritative
      applyControl(vessel);                   // reaction wheels, gimbal, RCS, grid fins
      integrate(vessel, h);                   // semi-implicit Euler on r,v; explicit on theta,omega
      resolveContacts(vessel, world);         // ground, legs, destruction
      updateThermal(vessel, h);               // ablation, part temps
      world.t += h;
    }
  }

  updateDebris(frameDt);
  evaluateEvents();                   // milestones, mission predicate, terminal states
  recordReplayFrame(world.t);
  render();                           // ROCKET or MAP renderer
  raf(frame);
}
```

Integrator: semi-implicit (symplectic) Euler at `h = 1/120` is stable enough for LEO over a 20-minute flight and is what keeps orbits from spiralling. Do not use plain explicit Euler for position/velocity. Rails warp exists precisely so long coasts never depend on the integrator at all.

---

## 9. Implementation order

1. World constants, atmosphere, gravity, semi-implicit integrator, ground collision. Fly a point mass.
2. Part model, mass properties, CoM/inertia. Hook the existing engine model to a single hard-coded rocket. Fly it with `Z`/`A`/`D`.
3. Flight HUD: attitude indicator, throttle bar, altitude, speed, TWR, g. Chase camera.
4. Stage queue + separation graph split + debris. Stage list UI.
5. Physics warp 1–4×, then rails warp with the full precondition set, then the warp-to buttons.
6. Map view, conic drawing, Ap/Pe markers, SOI patching, maneuver node.
7. Aero normal force / CoP, structural loads, heating and ablation — the failure layer.
8. Outcome cards, milestone ticker, flight log, slow-mo.
9. Build editor, the full 25-part catalog, per-stage Δv analysis, save/load.
10. Presets, missions, achievements, checkpoints, replay, touch layer, onboarding.

Ship steps 1–8 with a single hard-coded rocket before building the editor. A game where one rocket flies beautifully beats a builder attached to a rocket that flies badly.
