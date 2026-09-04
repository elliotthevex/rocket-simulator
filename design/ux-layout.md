# ux-layout

## Summary
Keep and extend the design language that already exists in /Users/elliot_jeong/rocket-sim/web/index.html — warm paper/graphite ground, one orange accent, Barlow Condensed labels + IBM Plex Mono numerals — and grow it into a two-screen game shell (BUILD and FLY, with MAP as a mode of FLY). The build screen is a fixed three-column console: 264px part palette left, elastic build canvas center with typed snap nodes and live CoM/CoP markers, 300px stats+stage rail right ending in a never-disabled LAUNCH button; below 1180px the right rail becomes a bottom sheet whose collapsed header still shows Δv/TWR/mass and LAUNCH. The flight screen is a full-bleed world canvas with corner-anchored instrument panels that reserve a permanently clear 60%×55% "stage rectangle" so the cinematic never gets covered. Reject the navball: a 2D side-view rocket has exactly one rotational degree of freedom, so a projected sphere costs occlusion, projection math, and beginner confusion for zero extra information — replace it with a flat 176px Attitude Ring (angle drawn as an angle, all markers always visible, KSP prograde/retrograde iconography preserved) plus a ±30° pitch tape for fine control. Approachability comes from three HUD density tiers (SIMPLE default) and a first-launch path that skips the builder entirely: one button, a scripted Flight Director coach, a permanent FLY IT FOR ME autopilot escape hatch, and a 120-second rewind buffer so the first flight literally cannot end in failure. Status colour is teal/amber/red (never red/green) and is always doubled by glyph and text.

## Key Decisions
- Do not use a navball. A 2D side-view rocket has one rotational degree of freedom; a projected sphere encodes three, hides half its markers behind the ball, costs projection math, and is the genre's best-documented beginner wall. Build a flat 176px Attitude Ring where 0 degrees is local vertical and 90 degrees is local horizontal, keep KSP's prograde spoked-circle and retrograde X iconography for transfer, and add a 176x22 pitch tape underneath for the 1-degree precision a small circle cannot give.
- Reserve a permanently clear 'stage rectangle' of 60% viewport width by 55% height centred at (50%, 46%). No HUD element may ever enter it and the camera keeps the vehicle inside it. This single constraint is what makes the flight read as a cinematic rather than a diagram with an overlay.
- Keep the existing design tokens from /Users/elliot_jeong/rocket-sim/web/index.html verbatim — warm paper and graphite ground, single burnt-orange accent, Barlow Condensed labels over IBM Plex Mono numerals, 1px borders instead of shadows, 10/8/6 radius ladder. Extend, never restyle.
- Replace the existing red/green --status-good/--status-critical pair with a teal/amber/red triad (light #0F7A6C / #A85E00 / #BE2F27, dark #35BFAC / #E9A33A / #FF6B5E). Red/green is invisible to roughly 1 in 12 men and this is a status-critical instrument panel.
- Never encode meaning by colour alone. Status carries a glyph (dot / triangle / square) and a word; propellants carry a 3-letter code (RP1/CH4/LH2/SOL); trajectory types carry a dash pattern (solid / dashed 6-4 / dotted 2-4); AP and PE markers use outline vs filled triangles.
- Ship three HUD density tiers (SIMPLE / STANDARD / FULL) on a single data-hud attribute, default SIMPLE for new players. Cycle with H. Never auto-change tier mid-flight; offer the upgrade once, as a dismissible toast, after the first successful orbit.
- The LAUNCH button is never disabled. A broken design opens a PRE-FLIGHT CHECK card listing each issue with a fix button, plus 'FIX IT FOR ME' and 'LAUNCH ANYWAY'. The only hard block is a design with zero parts.
- The first click skips the builder entirely and launches a preset. A new player must never meet a form, a name field, a difficulty picker, or a modal with more than two buttons before they see a rocket move.
- There is no game over. Every terminating event produces a debrief card with real numbers, a generated one-line diagnosis of what went wrong, and REWIND 20 s / BACK TO THE PAD / WATCH THE REPLAY. Back the rewind with a 2 Hz ring buffer of 240 state snapshots, which doubles as the replay source.
- Provide a permanent 'FLY IT FOR ME' autopilot escape hatch in the coach chip, and animate the on-screen controls as the autopilot moves them — the throttle bar slides, the ring rotates, STAGE flashes. Watching the controls work is how a beginner learns what the controls are.
- Order propellant gauges and the Δv ladder to match the physical vehicle: stage 1 at the bottom of the ladder, stage 1 at the left of the tank stack. Never invert to 'next stage first'.
- Map view is a camera mode of the same canvas, entered with a 250 ms zoom-out that keeps the vehicle fixed on screen, with a 176x132 live picture-in-picture of the flight view and four independent ways back (MAP/FLIGHT segmented control, M, Esc, double-tap) plus auto-return on any event.
- Bind rotation keys to an angular RATE target with counter-torque on release, not raw torque on keydown. Binary keyboard input applied as torque produces uncontrollable tumbling and is the single biggest reason people abandon a keyboard flight sim.
- The world canvas is theme-independent: sea level is bright and space is black in both light and dark themes. Only the chrome flips. HUD panels follow the theme and get a 1px --hud-stroke plus --hud-shadow so they read against any sky.
- Draw the plume from the real model — length from live thrust, and shape switching between over-expanded (pinched, Mach diamonds) and under-expanded (bell-flared) by comparing exitPressure(motor, pc) against ambientPressure(h). The physics already exists in the file and it is the cheapest convincing detail available.
- Render palette part thumbnails with the same vector draw function the world canvas uses. If palette art and flight art differ, the builder reads as a menu of abstractions.
- Update HUD text at 10 Hz and only when the formatted string changes; keep aria-live regions at 1 Hz. Never write to the DOM per frame.

## Pitfalls
- Shipping a navball because the reference games have one. In 2D it is strictly worse than a flat ring: fewer visible markers, more code, and the exact instrument that makes beginners quit KSP. If someone insists, the ring plus pitch tape already carries every marker a navball does.
- Letting the HUD creep into the centre of the screen. Every added readout will want to go somewhere and the middle is empty. Enforce the clear stage rectangle as a hard layout invariant in code (assert during development that no HUD child's bounding box intersects it), and shrink the rectangle on short viewports rather than moving a control into it.
- Disabling the LAUNCH button when a design is invalid. A greyed-out button with no explanation is the most common way a builder loses a beginner — they cannot tell whether the game is broken or they are. Always open the pre-flight card instead.
- Making the first-run experience a settings screen. Any name field, difficulty picker, or tutorial-yes/no modal before the rocket moves loses a large share of first-time players. The first click launches.
- Ending a first flight in a failure screen. 'Mission Failed' with a single RESTART button teaches nothing and reads as punishment. The debrief card with real numbers, a diagnosis, and a rewind is the same event turned into the game's best lesson.
- Red/green status colours. Roughly 1 in 12 men cannot separate them, and this is an instrument panel where status is the whole point. The existing file's #0ca30c / #d03b3b pair must be replaced, not just supplemented with icons.
- Applying raw torque on keydown for rotation. Binary input plus raw torque equals tumbling, and the player will conclude the game is broken rather than that they are. Command an angular rate with authority limits and null the rate on release.
- Increasing dt for time warp. It will destabilise the integrator exactly when the player is doing a delicate circularisation burn. Run N fixed substeps per frame instead, and cap warp by altitude (x10 below 70 km, x100 below 200 km) with a visible reason rather than a silent refusal.
- Writing HUD values to the DOM every frame. Sixty layout-triggering text writes per second per readout will cost more frame time than the physics, and a value flickering at 60 Hz is unreadable anyway. Throttle to 10 Hz and diff the formatted string.
- Setting live numbers in Barlow Condensed or any proportional face. Condensed digits are misread at a glance, and proportional digits jitter as values change, which reads as instability. Monospace with tabular-nums, always, plus an explicit ch-based min-width so nothing reflows if the webfont fails.
- Rounding everything to 16px and padding everything to 24px. That combination is the single strongest generic-AI-design tell. Hold the 10/8/6/2/0 radius ladder and keep data panels at 10-14px padding; density is the aesthetic here.
- Adding a second accent colour 'for variety'. Every non-ink colour in this product must mean something — status, propellant identity, or trajectory type. A decorative colour makes the meaningful ones ambiguous.
- Reaching for gradients, blur, or glow to make the HUD look 'techy'. It will land as a mobile game skin and undercut the credibility the engine model earns. Gradients belong to the sky and the plume only.
- Blocking portrait phones with a rotate-your-device gate. Support a stacked portrait layout with the LAUNCH button in the top bar and show a dismissible toast instead — a hard gate loses the player before they ever see the game.
- Forgetting safe-area insets and touch-action. Without viewport-fit=cover plus env(safe-area-inset-*) padding the STAGE button lands under the home indicator, and without touch-action:none and overscroll-behavior:none the rotate pads trigger pull-to-refresh and double-tap zoom.
- Treating reduced-motion as 'turn off all animation'. That would freeze the rocket and the plume, which are the content. Remove only involuntary motion — shake, flash, parallax, pulse, auto-dim, warp streaks — and keep the simulation moving. Also ship the toggle independently of the OS setting, and ship a separate performance mode so nobody has to trade comfort for framerate.
- Building replay as a second system after the rewind buffer already exists. One 2 Hz ring of 240 state snapshots serves both; two systems will drift out of sync and double the state-serialisation surface.
- Drawing map trajectories as an integrated point cloud. Use the analytic conic from the current state vector — it is faster, exact, and it is the only way apoapsis and periapsis markers land in the right place at high time warp.

## Full Spec

## 0. Continuity with the existing file

The current `/Users/elliot_jeong/rocket-sim/web/index.html` already has a strong, non-generic identity: warm paper `#EDECE6` / graphite `#15191B`, a single burnt-orange accent `#D9601F`, Barlow Condensed uppercase micro-labels, IBM Plex Mono tabular numerals, 1px borders doing the structural work instead of shadows, and a 10/8/6 radius ladder. **Do not restyle any of this.** Everything below is an extension of that token set. The only deliberate changes to existing tokens are documented in §5.2 (status colours become colourblind-safe; propellant series colours are re-mapped to physical flame colours).

Screen model — three top-level states, one document, no routing:

| State | Purpose | Entered by |
|---|---|---|
| `TITLE` | Live pad scene + one primary action | page load (first visit) |
| `BUILD` | Assemble / pick a vehicle | "OPEN THE BUILDER", `B`, or post-flight "BACK TO THE PAD" |
| `FLY` | Flight sim. Has two sub-views: `FLIGHT` (chase cam) and `MAP` (orbital) | LAUNCH |

`TITLE` is not a separate layout — it is `FLY` with the sim paused on the pad and a corner slate over it (§4.1). This is deliberate: the first pixel the player sees is the actual game, not a menu.

---

## 1. Build screen

### 1.1 Desktop layout (reference viewport 1440 × 900)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ORBITER · BUILD          [ LOAD A DESIGN ▾ ]     [ UNDO ][ REDO ]   [ ? ] [ ◐ ]  │ 56
├──────────────┬───────────────────────────────────────────────┬───────────────────┤
│ PARTS    264 │                    canvas  ~780               │ VEHICLE       300 │
│ ┌──────────┐ │                                               │ ┌───────────────┐ │
│ │ search   │ │   30 m ┤                                      │ │ MASS   42.6 t │ │
│ └──────────┘ │        │              ◭                       │ │ Δv  9,240 m/s │ │
│ CMD TANK ENG │   20 m ┤             ▐█▌                      │ │ TWR      1.62 │ │
│ AERO STR UTL │        │             ▐█▌ ○ ← snap node        │ │ MAX Q  32 kPa │ │
│ ┌────┐┌────┐ │   10 m ┤            ▟▐█▌▙                     │ └───────────────┘ │
│ │ ◭  ││ █  │ │        │             ▐█▌                      │ Δv BY STAGE       │
│ │Pod ││Tank│ │    0 m ┴────────▂▂▂▂▂▂▂▂▂▂▂▂▂────────         │ ▓▓▓▓▓ S2   2,900  │
│ └────┘└────┘ │              ⊕ CoM 12.4 m                     │ ▓▓▓▓▓▓▓▓ S1 6,340 │
│ ┌────┐┌────┐ │              ⊗ CoP  9.9 m                     │ ┄┄┄ ORBIT 9,400 ┄ │
│ │ ▼  ││ ⌇  │ │                                               │ STAGES            │
│ │Eng ││Fin │ │  [1×|2×]   [⟲][⟳]   [ − ][ 100% ][ + ]  [⌂]  │ ⠿ 2 · Kestrel-V   │
│ └────┘└────┘ │                                               │ ⠿ 1 · 2× Kestrel-R│
│              │                                               ├───────────────────┤
│              │                                               │ [    LAUNCH    ]  │ 72
└──────────────┴───────────────────────────────────────────────┴───────────────────┘
```

Grid: `grid-template-columns: 264px minmax(520px, 1fr) 300px;` `gap: 16px;` outer padding `16px`. Top bar `height: 56px`, fixed. Everything below it is `height: calc(100vh - 56px)` with each column independently scrollable (`overflow-y: auto; overscroll-behavior: contain`).

At 1280px: palette 232, rail 280, canvas ≥ 700. At 1920px the canvas absorbs all extra width; the two rails never grow — data rails that stretch look unresolved, and the canvas is where the value is.

### 1.2 Part palette (left, 264px)

- **Header row (40px):** search input, full width, placeholder `Search parts`. Filters live on keystroke across part name, category, and tag ("throttleable", "cryogenic", "heat shield").
- **Category tabs (32px):** six segmented buttons, Barlow Condensed 600 / 11px / `0.08em` / uppercase: `CMD` `TANK` `ENG` `AERO` `STR` `UTIL`. Active tab gets `background: var(--accent); color: var(--accent-ink)`. Multi-select is not supported; keep it one-at-a-time.
- **Part grid:** `repeat(2, 1fr)`, gap 8px, card 116 × 104.
  - Card top: 116 × 52 silhouette thumbnail, **rendered by the same vector part-draw function the world canvas uses**, at a fixed 0.6 scale. This is a hard requirement: what the player sees in the palette must be exactly what flies, or the builder reads as a menu of abstractions.
  - Card body: name, Barlow Condensed 700 / 13px / uppercase, single line, ellipsised.
  - Card footer: two stats in Plex Mono 10.5px, `--ink-muted`, e.g. `2.4 t` `·` `RP-1`, or for engines `380 kN` `·` `Isp 311 s`.
  - Left edge of every part card carries a 3px propellant/category colour rule (`--prop-rp1` etc.) so the grid is scannable by colour band.
  - Hover: `border-color: var(--border-strong)`. Dragging: card dims to 40% and a full-size ghost follows the cursor.
- **"LOAD A DESIGN" is in the top bar, not the palette** — it is the escape hatch from building, and it must not look like a part. Its menu lists five presets with a 1-line description and their key number:

  | Name | Description | Stat chip |
  |---|---|---|
  | Cadet I | Two stages, kerosene. Forgiving. Reaches orbit. | Δv 9,600 m/s |
  | Sounding Dart | One solid motor. Straight up, fast, no orbit. | apogee ~90 km |
  | Hauler B | Three stages, methane upper. Heavy payload. | Δv 11,200 m/s |
  | Cryo Needle | Hydrogen upper stage. Efficient, fragile, slow. | Isp 428 s |
  | The Brick | Deliberately bad. TWR 0.9. Won't leave the pad. | TWR 0.94 |

  "The Brick" is not a joke entry — it is the fastest way to teach TWR, and the pre-flight card (§1.6) explains exactly why it fails.

### 1.3 Build canvas (centre)

- **Backdrop:** `--build-grid` — a 1px dot grid at 1 m spacing (`rgba(ink,0.07)`) with a heavier line every 5 m (`rgba(ink,0.13)`). A 1px dashed `--accent` vertical **centerline** through the middle. A solid 2px `--ink-secondary` **ground line** at the bottom with 12px of pad concrete hatching under it.
- **Height ruler** pinned to the canvas left edge, 40px wide: ticks every 1 m, labelled every 5 m in Plex Mono 10px. This is the single cheapest thing that makes the builder feel like engineering software rather than a toy — the player immediately reads their rocket as *tall*.
- **Snap nodes.** Every part declares typed attach nodes:
  - `stack-top`, `stack-bottom` — connect only to each other, aligned on the centerline, with a diameter-compatibility check.
  - `surface` — a radial node; accepts any part whose `radialMount` flag is true (boosters, fins, chutes).
  - Rendering: 8px hollow circle, 1.5px stroke `--border-strong`, drawn only while a part is being dragged (never clutter a static design).
  - **Snap radius: 24 screen px**, scaled by zoom and clamped to [16, 40].
  - Valid target: node fills `--accent`, grows to 11px, a 1px `--accent` guide line runs to the centerline, and a 55%-opacity ghost of the part renders at its final snapped position and rotation.
  - Invalid target: node ring switches to 1.5px dashed `--stat-critical`, ghost drops to 30% opacity, and a 20px `×` chip appears at the cursor with a one-line reason on hover: `Tank can't attach to a tank bottom — put an engine or a decoupler here.`
  - **Drop with no valid node: the part animates back to the palette over 120 ms.** Never leave a part floating unattached; never silently delete it.
- **Symmetry control** `[1× | 2×]`. At 2×, any part dropped on a `surface` node is mirrored across the centerline as a linked pair; selecting either selects both; the mirrored copy is drawn with a 1px `--stat-info` tie-line between the pair.
- **Zoom/pan:** `[−] 100% [+]` plus a `⌂` fit-to-vehicle button. Scroll wheel zooms about the cursor; space-drag or middle-drag pans; `Ctrl+0` fits.
- **Rotation:** `[⟲][⟳]` rotate the selected part in 90° steps (relevant only for fins and radial parts).
- **CoM / CoP markers** (§1.4) are drawn on the canvas at the correct height, with their numeric height labelled to the right.
- Selected part: 1.5px `--accent` outline + 4 corner handles; `Delete`/`Backspace` removes it and everything attached above it, with an undo toast: `Removed Tank T-200 and 2 parts above it.  [UNDO]`.
- Undo/redo: 50 steps, `Ctrl+Z` / `Ctrl+Shift+Z`.

### 1.4 CoM / CoP markers — the stability lesson

Use the real aerospace convention, not invented icons:

- **CoM** — a circle quartered black/`--ink-primary` and yellow `#E8B93C`, 16px, with a 1px black rim. Label right of it: `CoM  12.4 m`.
- **CoP** — a circle quartered white and blue `--stat-info`, 16px. Label: `CoP  9.9 m`.
- A vertical 1px line between them with the caliper measurement: `2.5 m`.
- Both recompute on every part change (CoM from part masses at current propellant load; CoP from a Barrowman-style area-weighted sum over nose/fins/body).
- **Verdict chip** rendered directly under the pair, never buried in a panel:
  - CoP behind CoM by ≥ 1.0 calibre → `● STABLE — CoP is 2.5 m behind CoM.` in `--stat-nominal`.
  - 0–1.0 calibre → `▲ MARGINAL — the rocket will wobble in thin air.` in `--stat-caution`.
  - CoP ahead of CoM → `■ UNSTABLE — it will flip over as soon as it picks up speed. Add fins at the bottom, or put heavier parts on top.` in `--stat-critical`.
- Add a `[SHOW ME WHY]` link on the chip that runs a 3-second inline animation on the canvas: an airflow arrow hits the rocket at 5° angle of attack, and an arrow at CoP shows the restoring (or diverging) torque about CoM. Two seconds of animation replaces two paragraphs of text.
- **Also render CoM at burnout**, as a hollow ghost marker, with a hairline connecting the two positions. Label: `CoM at burnout`. This teaches the single most common real failure — a rocket that is stable full and unstable empty.

### 1.5 Stats + stages rail (right, 300px)

Four blocks, top to bottom, each a `.card` with 12px padding and 10px radius:

**A. VEHICLE (4 rows, label left / value right, dashed hairline separators — reuse `.field-row`)**

| Label | Format | Notes |
|---|---|---|
| `TOTAL MASS` | `42.6 t` | wet |
| `DRY MASS` | `11.9 t` | |
| `Δv TOTAL` | `9,240 m/s` | vacuum, summed over stages |
| `TWR (LIFTOFF)` | `1.62` | sea-level thrust / (wet mass · g₀) |
| `EST. MAX Q` | `32 kPa @ 11 km` | from a cached 1-DOF pre-integration using the existing `derivative()` |

Each label has a hover/focus `?` affordance opening a 2-sentence popover with the formula in mono. Example for Δv: *"Δv is your speed budget. Δv = Isp · g₀ · ln(m_wet / m_dry). Spend it all and you stop accelerating, wherever you are."*

**B. Δv BY STAGE — the "ladder"**

A vertical stacked bar, 32px wide, total height 140px, drawn bottom-up in flight order (stage 1 at the bottom, matching the physical rocket and the tank gauges in flight — never invert this). Each segment's height is proportional to that stage's Δv, filled with its `--prop-*` colour, labelled to the right: `S1  6,340 m/s`.

Overlaid on the ladder: a **1.5px dashed `--ink-primary` reference line at 9,400 m/s**, labelled `ORBIT`, with a second at 3,200 m/s labelled `SPACE (100 km)`. This one graphic does more educational work than any tutorial text: the player *sees* that getting to space is a third of the job and getting to orbit is all of it.

**C. STAGES (reorderable list)**

Row height 52px, drag handle `⠿` on the left, drag to reorder (reordering rewrites the staging sequence, not the physical stack). Row content:

```
⠿  2   ▐ Kestrel-V ×1            Δv 2,900   burn 214 s   TWR 0.71
⠿  1   ▐ Kestrel-R ×2            Δv 6,340   burn 148 s   TWR 1.62
```

The 3px left rule is the stage's propellant colour. TWR values below 1.0 are shown in `--stat-caution` with a `▲` glyph — except for vacuum-only upper stages, where a TWR under 1 is fine and the row instead shows `TWR 0.71 (vac)` in `--ink-secondary`. Do not scare people with a warning that is not a problem.

**D. Sticky footer (72px)**

`[ LAUNCH ]` — full width, 48px tall, `--accent` fill, Barlow Condensed 700 / 20px / `0.1em` / uppercase, the `.fire-btn` treatment already in the file. Directly under it in 11px `--ink-muted`: `Cadet I · 2 stages · 42.6 t`.

### 1.6 Pre-flight check — the LAUNCH button is never disabled

A greyed-out button with no explanation is the single most common way a builder loses a beginner. `LAUNCH` is always clickable. If the design has problems, it opens a **PRE-FLIGHT CHECK** card (420px wide, centred, `--card`, 1px border, no scrim blur) listing each issue as a row:

```
PRE-FLIGHT CHECK

■  No command pod. Nobody is flying this.              [ ADD ONE ]
▲  TWR is 0.94. It will not lift off the pad.          [ ADD AN ENGINE ]
▲  Stage 2 has no engine — it is just a tank.          [ SHOW ME ]
●  Everything else looks fine.

           [ FIX IT FOR ME ]        [ LAUNCH ANYWAY ]
```

`LAUNCH ANYWAY` is always available, including for The Brick — watching a rocket sit on the pad shuddering at 94% of its own weight is a better TWR lesson than a modal. `FIX IT FOR ME` applies every suggested fix and re-runs the check. Only hard-blocking case: zero parts.

### 1.7 Narrow-screen reflow

| Breakpoint | Layout |
|---|---|
| **≥ 1180px** | Three columns as above. |
| **860–1179px** | Two columns: palette 232px + canvas. The stats/stage rail becomes a **bottom sheet**: collapsed header 64px, always visible, showing `Δv 9,240` · `TWR 1.62` · `42.6 t` and a 40% width `LAUNCH` button on the right. Drag the handle or tap the header to expand to `60vh` over the canvas at 96% opacity. |
| **560–859px** | One column. Canvas fills. A single bottom sheet with segmented tabs `[ PARTS │ STAGES │ STATS ]`, collapsed height 64px (same three numbers + LAUNCH), expanded `65vh`. Parts grid goes to 3-up at 96px cards. |
| **< 560px (portrait phone)** | Canvas gets top `52vh`, sheet is permanently expanded to `48vh` with the same tabs. `LAUNCH` moves into the top bar as a 40px pill so it is never behind a sheet. Drag-and-drop is replaced by **tap-to-select-part, then tap-a-snap-node**, with valid nodes drawn at 14px and pulsing at 0.4 Hz (suppressed under reduced motion, where they instead get a 2px `--accent` ring). |

Rule for every breakpoint: **Δv, TWR, mass, and LAUNCH are never more than zero taps away.** Everything else can hide.

---

## 2. Flight screen

### 2.1 Zone map (reference 1440 × 900)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ T+ 00:01:24  ● ASCENT  Cadet I     ▲ MAX Q      ▸▸ ×5  │ FLIGHT  MAP │  ⚙   ⤢    │ 44
├──┬───────────────────────────────────────────────────────────────────────────────┤
│▲ │                                                                               │
│40│      ╭─────────────── CLEAR STAGE RECTANGLE ───────────────╮                  │
│30│      │            (60% w × 55% h, centred at 50%, 46%)     │                  │
│▶ │      │                          ◭                          │                  │
│24│      │                         ▐█▌                         │                  │
│20│      │                          ╱▓╲                        │                  │
│10│      ╰──────────────────────────────────────────────────────╯                 │
│ 0│                                                                               │
├──┴───────────────────────────────────────────────────────────────────────────────┤
│ ┌THR─┬─TANKS──┐          ┌── FLIGHT STRIP ──────────┐        ┌── ATTITUDE ──┐     │
│ │▓▓▓▓│ 2 ▓▓▓▓ │          │ ALT     SPD      V/S     │        │      ↑  ⊙    │     │
│ │▓▓▓▓│ 1 ▓░░░ │          │ 24.1 km 782 m/s +310 m/s │        │   ╲  ▲  ╱    │     │
│ │▓▓▓▓│CH4 RP1 │          │ AP      PE       TWR     │        │ ─────┼─────  │     │
│ │100%│  42 s  │          │ 96 km   −38 km   1.94    │        │  PITCH 62°   │     │
│ └────┴────────┘          └──────────────────────────┘        │ [2.4 G] ◔    │     │
│                                                              └──────────────┘     │
│                                                              [  STAGE    space ]  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Implementation: one `<canvas id="world">` at `position: fixed; inset: 0` sized to `devicePixelRatio`. On top, `<div id="hud" style="position:fixed;inset:0;pointer-events:none">` with real DOM children (`pointer-events:auto`). **The HUD is DOM, not canvas** — that is what makes keyboard focus, screen readers, and text selection work for free. The four instruments that need custom geometry (attitude ring, altitude tape, G arc, tank columns) are **inline SVG**, so they inherit CSS custom properties and can carry `<title>`/`aria-label`.

### 2.2 The clear stage rectangle

Reserve a rectangle 60% of viewport width × 55% of viewport height, centred at (50%, 46%). No HUD element may enter it, ever. The camera controller keeps the vehicle inside it (anchor at (50%, 62%) during powered ascent, drifting to (50%, 50%) in coast). This one constraint is what separates "cinematic flight video with instruments around it" from "a diagram with a rocket in it." On viewports under 700px tall, the rectangle shrinks to 50% height and the flight strip moves from bottom-centre to bottom-left, stacked under the tanks.

### 2.3 Element inventory

Density tier: `S` = Simple (default for new players), `T` = Standard, `F` = Full. A tier includes everything from tiers before it.

| Element | Anchor | Size | Tier | Always visible |
|---|---|---|---|---|
| Mission slate (`T+`, phase chip, vehicle name) | top-left, 12px inset | auto × 28 | S | yes |
| Warning strip | top-centre | auto × 28 | S | only when a warning is live |
| Time-warp control | top-right | 116 × 28 | S | yes |
| `FLIGHT / MAP` segmented | top-right | 132 × 28 | S | yes |
| Settings `⚙` / Hide-HUD `⤢` | top-right | 28 × 28 each | S | yes |
| Throttle column | bottom-left, 16px inset | 56 × 176 | S | yes |
| Tank stack | bottom-left, right of throttle | 24px per stage × 176 | S | yes |
| Flight strip | bottom-centre | 320/480/560 × 76 | S | yes |
| Attitude ring | bottom-right, above STAGE | 176 × 176 | S | yes |
| Pitch tape | under ring | 176 × 22 | T | yes |
| G-meter arc | inside ring panel, bottom-left corner | 56 × 40 | T | yes |
| STAGE button | bottom-right, 16px inset | 200 × 68 | S | yes |
| Altitude tape | left edge, vertically centred | 48 × 60vh | T | yes |
| Speed tape | right edge, vertically centred | 48 × 60vh | F | yes |
| Attitude-hold mode row | under pitch tape | 176 × 26 | T | yes |
| Engine readout (Pc, ṁ, Isp, Cf) | above tanks, collapsible | 200 × 92 | F | no — toggle `E` |
| Aero readout (q, Mach, drag, AoA) | above flight strip | 320 × 40 | F | yes |
| Event log | bottom-left, above throttle | 260 × 84 | F | last 4 lines, 6 s fade |
| Flight Director coach chip | top-centre, under warning strip | 420 × auto | — | tutorial only |

Tier is a single `data-hud` attribute on `#hud`; CSS does the rest (`[data-hud="simple"] .tier-t, [data-hud="simple"] .tier-f { display:none }`). Cycle with `H`. Never auto-change the tier mid-flight — but **do** offer it once: after the first successful orbit, a one-time toast `You're flying well. Want the full instrument panel?  [ SHOW ME ]  [ NOT YET ]`.

### 2.4 Attitude indicator — ring, not navball (decision + justification)

**Decision: no navball. Use a flat 176px Attitude Ring plus a pitch tape.**

Reasoning:

1. **Degrees of freedom.** A 2D side-view rocket rotates in exactly one plane. A navball encodes three rotational DOF by projecting a textured sphere; two of the three axes are permanently zero here. You would be paying full price for one-third of the instrument.
2. **Occlusion.** Half a navball's markers are behind the sphere at any moment. In a 2D game every marker (prograde, retrograde, radial-in, radial-out, target, manoeuvre) can be drawn on one circle with none hidden — strictly more information, always.
3. **Beginner cost.** The navball is the single most-cited stumbling block in KSP. Its difficulty is entirely the sphere projection: "why did the marker move the other way?" A flat ring has no projection, so an angle is drawn as an angle. The whole skill reduces to *"put the orange arrow on the green circle."*
4. **Cost to build.** Ring = one `<circle>`, tick marks, and `rotate()` transforms. Navball = a projected sphere with latitude/longitude texture, backface culling, and marker depth sorting — a meaningful chunk of a single-file budget spent on something that is worse here.

**Ring specification** (inline SVG, viewBox `0 0 176 176`, centre 88,88, radius 76):

- **Frame of reference: 0° at the top = local vertical (straight up, away from the planet).** 90° right = local horizontal in the direction of orbital motion. This is the frame beginners already have ("up" and "sideways"), and it is the frame the gravity turn is taught in.
- **Ticks:** 1px every 5°, 2px every 15°, 3px + label every 45° (`0` `45` `90` `135` `180`), Plex Mono 9px `--ink-muted`, inset 12px.
- **Horizon band:** a horizontal 1px `--ink-secondary` chord through the centre, with a 30%-opacity fill below it in `--stat-inert`. This band always represents the local horizon, so it does not move relative to the ring — it is the reference, and the *rocket* moves. Do not rotate the horizon; that is the navball habit that confuses people.
- **Nose vector:** a solid `--accent` isoceles triangle, 14px base × 20px tall, apex outward, riding the ring at the current attitude, with a 2px `--accent` radius line from centre to it. Unmistakably "this is me."
- **Prograde:** KSP-identical — an 11px circle, 1.5px stroke, with three 5px spokes at 12/4/8 o'clock and a 2.5px centre dot. Colour `--stat-nominal`.
- **Retrograde:** same circle, spokes replaced by an inscribed `×`. Colour `--stat-nominal`, 1.5px stroke, no fill.
- **Radial-out / radial-in:** 10px circles with an outward / inward chevron. Colour `--stat-info`.
- **Manoeuvre node:** a 12px circle with a filled centre wedge, colour `--accent`, only present when a node exists.
- **Target pitch guide (tutorial + autopilot):** a 6px-wide arc segment in `--accent-soft` spanning the acceptable pitch corridor, drawn *under* all markers.
- **Centre readout:** `62°` in Plex Mono 26px `--ink-primary`, with `PITCH` in Barlow Condensed 9.5px `--ink-muted` above it and, in Standard+, `AoA 2.4°` in 10px below (turning `--stat-caution` above 8°, `--stat-critical` above 15° with the ring border flashing at 1 Hz).

**Pitch tape** (176 × 22, directly under the ring, Standard tier and up): a horizontal strip showing ±30° around current pitch, 1px ticks every 5°, labelled every 10°, a fixed 2px `--accent` caret at the centre, and the whole scale translating under it. The ring gives instant orientation; the tape gives the 1° precision you need for a circularisation burn. Together they cost 198px of a 176px-wide column.

**Attitude-hold row** (Standard+): six 26px buttons under the tape, Barlow Condensed 10px: `PRO` `RET` `R+` `R−` `UP` `HOLD`, mapped to `1`–`6`. Active mode gets `--accent` fill. This is the SAS equivalent and it is the difference between "I can't keep it pointed" and "I can do a burn."

### 2.5 Throttle

56 × 176 vertical column, bottom-left. Track: `--panel` with 1px `--border`. Fill from the bottom in `--accent`, square-ended, 2px radius. Overlays:

- A **1px `--ink-primary` commanded-throttle rule** and a separate translucent **actual-thrust fill** at 55% opacity behind it. When the two diverge (throttle spool-up, pressure-fed droop, atmospheric thrust loss) the player sees it. This is the layout hook for the engine model that the whole project is built around.
- Tick marks at 0 / 25 / 50 / 75 / 100 with 8px 1px rules on the right edge.
- Numeric `100%` in Plex Mono 17px under the column; `THR` label in Barlow Condensed 9.5px above.
- **Solid-motor state:** when the active stage is a solid, the track fills with a 45° 2px hatch in `--stat-inert`, the slider is `aria-disabled`, and a rotated 9px label reads `SOLID — NO THROTTLE`. Tooltip: `A solid motor burns until the grain is gone. There is no valve.` This turns a limitation into a lesson.
- Below the column: `[ CUT ENGINE ]` — 56 × 26, outline button in `--stat-critical` (the existing `.cutoff-btn` treatment), disabled and hatched for solids.

### 2.6 Tank stack (per-stage fuel gauges)

Immediately right of the throttle. One 24px-wide column per stage, 176px tall, `gap: 6px`, **drawn in physical stack order with stage 1 at the left** so the gauge reads like the rocket. (It also matches the Δv ladder in the builder, which reads bottom-up — same ordering logic, different axis, and both match the vehicle.)

Each column:
- Track `--panel`, 1px `--border`, 2px radius.
- Fill from the bottom, colour = `--prop-<type>`, height = remaining propellant fraction.
- A 1px `--stat-caution` hairline across the track at the 10% mark.
- Stage number above in Barlow Condensed 11px; propellant code below in Plex Mono 9px (`RP1` `CH4` `LH2` `SOL`) — colour is never the only cue.
- The **active** stage's column: 2px `--accent` left rule, number in `--accent`, and a burn-time-remaining readout under the whole stack: `S1 · 42 s`. Below 10 s it turns `--stat-caution`; below 3 s it turns `--stat-critical` and the number pulses (static under reduced motion).
- Jettisoned stages remain in the stack at 25% opacity with a strikethrough number for ~4 s, then collapse out with a 200 ms width transition. Beginners need to see that the thing they dropped is gone.

### 2.7 Flight strip (bottom-centre)

Six cells in two rows of three, each cell = Barlow Condensed 10px uppercase label + Plex Mono value with unit in `--ink-muted` at 0.6× size. Panel 560 × 76 at Full, 480 × 76 at Standard, 320 × 76 at Simple (four cells: ALT, SPD, AP, PE).

| Cell | Format | Behaviour |
|---|---|---|
| `ALT` | `24.1 km` | m below 1 km, km with 1 decimal to 1000 km, then km integer |
| `SPD` | `782 m/s` | surface-relative below 40 km, orbital above; the label itself switches to `SPD (ORB)` and flashes `--stat-info` once at the handover |
| `V/S` | `+310 m/s` | signed, always; `--stat-info` positive, `--stat-caution` negative below 5 km |
| `AP` | `96 km` | apoapsis; `—` when sub-orbital ballistic with no defined AP is impossible, so instead show the ballistic apex; add time-to in Standard+: `96 km · T−1:12` |
| `PE` | `−38 km` | negative periapsis is shown as a negative number, in `--stat-caution`, with the tooltip `Your periapsis is below the ground. You are on a ballistic arc, not in orbit.` This is far more instructive than blanking the field. |
| `TWR` | `1.94` | live; `--stat-caution` below 1.0 while in atmosphere |

**Promotion rule:** during the tutorial, and any time a coach step references a value, that cell's value doubles to 30px and gains a 1px `--accent` outline for the duration of the step. One glance connects the instruction to the instrument.

### 2.8 G-meter

56 × 40 arc gauge, lower-left of the attitude panel. 180° arc from 0 to 6 g, 1.5px `--panel` track, 3px `--accent` needle, plus a **1.5px `--stat-caution` peak-hold tick** that only ever moves outward (reset at stage separation). Numeric `2.4 G` in Plex Mono 13px. Arc turns `--stat-caution` above 4 g and `--stat-critical` above 6 g, at which point the strip shows `▲ HIGH G — CREW AT LIMIT`. Under reduced motion the needle interpolates over 200 ms instead of tracking per-frame.

### 2.9 Time warp

`▸▸ ×5` — a chevron stack (0–4 chevrons) plus the multiplier in Plex Mono 13px, with `[` `]` hit targets. Levels: `×1 ×2 ×5 ×10 ×50 ×100 ×1000 ×10000`. Keys `.` up, `,` down, `/` to ×1.

Critically, warp has a **blocked state that explains itself** rather than silently refusing:

```
▸ ×1   WARP LOCKED — you're in the atmosphere
▸ ×1   WARP LOCKED — engine is running
```

in `--stat-caution`, 10px. Max warp is also capped by altitude (physics-integration stability): ×10 below 70 km, ×100 below 200 km, uncapped above. When the cap bites, show `MAX ×100 HERE` rather than a dead button.

### 2.10 STAGE button

The most important control on the screen, so it gets the corner your hand is already in: bottom-right, 200 × 68, 16px inset.

```
┌──────────────────────────┐
│  STAGE            SPACE  │   Barlow Condensed 700 / 22px, keycap chip right
│  ▸ drop empty S1         │   11px --ink-secondary, what happens next
└──────────────────────────┘
```

States:
- **Ready** — `--accent` fill, `--accent-ink` text, and when the active stage is out of propellant it gains a 2px `--accent` outer ring pulsing at 0.5 Hz (static 2px ring under reduced motion) plus the sub-label `▸ fuel gone — drop S1`.
- **Armed but early** — outline only, sub-label `▸ S1 still has 42 s`. Still clickable; staging early is a legitimate (bad) choice and the debrief will say so.
- **No stages left** — becomes `[ DEPLOY CHUTE   SPACE ]` if a chute exists, else disabled with sub-label `nothing left to stage`.

Confirmation: none. A confirm dialog on the staging button would be worse than any misclick. Instead, `Ctrl+Z` within 2 seconds of a stage event **rewinds the separation** (only that window, only that event), with a toast `Undid staging.`

### 2.11 Warning strip

Top-centre, appears only when something is true, one line at a time, highest severity first, 28px tall, 12px Barlow Condensed uppercase + a glyph:

`▲ MAX Q` · `▲ LOW FUEL — S1` · `■ OVERHEATING` · `■ STRUCTURAL LOAD` · `▲ HIGH ANGLE OF ATTACK` · `● STAGE SEPARATION` · `● ORBIT ACHIEVED`

`●` nominal/positive events hold for 3 s then fade. `▲`/`■` persist while true. Under reduced motion, no fade — instant swap.

### 2.12 HUD auto-dim (cinematic protection)

After 6 s with no input **and** no active warning **and** the vehicle is coasting, all HUD panels transition to `opacity: 0.35` over 400 ms. Any keypress, pointer move, or event restores instantly. Disabled entirely under `prefers-reduced-motion` and under the "Reduce effects" setting. Plus a manual full-hide: `⤢` in the top bar, or hold `H`, which fades everything except the mission slate — for screenshots and for the moment when the player just wants to watch.

---

## 3. Map view

### 3.1 Transition

Map is not a separate screen; it is a camera mode of the same canvas. Switching runs a **250 ms zoom-out** that keeps the vehicle fixed on screen while the world scale animates from metres-per-pixel to kilometres-per-pixel and the planet resolves into a disc. Under reduced motion this becomes an 80 ms crossfade. The point of the animation is a single idea: *this is the same place, seen from further away.* A hard cut loses that, and beginners then treat the map as an abstract menu.

### 3.2 Rendering

- **Planet:** filled disc `--map-body #35543A` (light) / `#2A4230` (dark), 1px rim `--map-rim #6E8F5F`. A terminator: a 40%-opacity `#0A0E14` half-disc on the anti-sun side with a 6px soft edge. Sun direction is real and drives the world-canvas lighting too.
- **Atmosphere:** an annulus from surface to 70 km, radial gradient `rgba(90,150,220,0.30)` → `rgba(90,150,220,0)`.
- **Kármán line:** 1px dashed `--stat-info` circle at 100 km, labelled once at the 2 o'clock position: `100 km — SPACE`.
- **Range rings:** 1px `rgba(ink, 0.07)` circles every 100 km to 1000 km, then every 1000 km. Labelled once each at 3 o'clock in Plex Mono 9px.
- **Current trajectory:** the analytic conic from the current state vector, not an integrated point cloud. `e < 1` → full ellipse, 2px solid `--accent`. `e ≥ 1` → hyperbolic arc, 2px solid `--stat-critical`, with an asymptote hairline and the label `ESCAPE TRAJECTORY`.
- **Atmosphere-intersecting segment:** where the conic passes below 70 km, switch the stroke to 2px **dotted (2-4)** `--stat-caution` and place a mid-segment label `REENTRY`. Dash pattern carries the meaning, so it survives every colour-vision condition and every screenshot.
- **Projected orbit after a manoeuvre node:** 1.5px **dashed (6-4)** `--stat-info`.
- **Circularisation ghost** (the best educational object in the game): a 1px dotted circle at the current apoapsis radius, with a chip on it: `Circular orbit here needs 1,240 m/s more.  [ MAKE A NODE ]`. Shown whenever AP is above the atmosphere and PE is below it — i.e. exactly when the player is about to learn what circularising means.
- **Vessel:** a 10px `--accent` chevron pointing along the velocity vector, with a 1px 30-second breadcrumb tail at 50% opacity.
- **Markers:** `AP` = an outline triangle pointing away from the body, `PE` = a filled triangle pointing toward it — shape-coded, not colour-coded. Labels in Plex Mono 11px with time-to: `AP 96 km · T−1:12`, `PE −38 km · T−04:31`. Marker labels flip to the outside of the conic automatically so they never overlap the arc.
- **Node handles** (if manoeuvre nodes ship): six 14px drag handles around the node in prograde/retrograde/normal-equivalent/radial pairs — in 2D, only prograde/retro and radial in/out are real, so draw four, not six. A Δv readout follows the node: `Δv 1,240 m/s · burn 51 s · start T−00:26`.

### 3.3 Map chrome and getting back

- Top bar is unchanged and still shows `│ FLIGHT  MAP │` with `MAP` active. This continuity is the whole answer to "how do I get back."
- **Four ways back, all of which work:** click `FLIGHT`; press `M`; press `Esc`; or double-tap/double-click empty space.
- **Auto-return on event:** if a stage burns out, a warning fires, or reentry heating begins while in map view, the game returns to flight with the 250 ms zoom and a toast naming the reason (`Back to flight — stage 1 burned out.`). Setting: `Return to flight when something happens` (default on).
- **Picture-in-picture:** a 176 × 132 live flight-view inset, bottom-left, 1px `--border-strong`, showing the vehicle. Click it to return. This is a small cost that removes the "where did my rocket go" anxiety completely.
- Map-only controls, bottom-right: `[ − ] [ FIT ] [ + ]`, plus `[ FOCUS: SHIP ▾ ]` (ship / planet). Scroll to zoom, drag to pan, `F` re-centres on the ship.
- Time-warp control stays in the top bar and is the same widget — most warping happens in map view and it must not move.

---

## 4. Onboarding: the first 60 seconds

Design constraint: **the first click must not lead to a form, a name field, a difficulty picker, or a modal with more than two buttons.** And the first flight must be unfailable.

### 4.1 t = 0 s — the title

Not a hero section. The page opens on the **live world canvas**, sim paused, camera slowly craning around the pad at 2°/s (static under reduced motion), the Cadet I standing there with vapour venting. Over it, anchored bottom-left with 40px inset, a **slate**:

```
ORBITER
A rocket flight simulator with real engines.

[ LAUNCH MY FIRST ROCKET ]        ← 260 × 52, --accent

Open the builder    ·    Load a design    ·    Settings
                                          ← 13px text links, --ink-secondary
```

`ORBITER` in Barlow Condensed 700 / 54px / uppercase / `0.02em`. One paragraph, one primary button, three quiet links. No centred layout, no gradient, no card. The rocket is the hero; the type is a plate bolted to the corner of the frame.

Returning players (localStorage flag) get the same slate with `[ CONTINUE ]` first and their last vehicle named underneath.

### 4.2 The unfailable path, second by second

Clicking `LAUNCH MY FIRST ROCKET` **skips the builder entirely** and loads the Cadet I preset (2 stages, RP-1/LOX, liftoff TWR 1.62, total Δv 9,600 m/s — comfortably more than the 9,400 needed, so sloppy flying still reaches orbit). HUD tier is forced to `SIMPLE`. Cadet rules are on: no engine failures, no structural damage, no heat damage, infinite ignitions.

The **Flight Director** is a single 420px chip at top-centre, one instruction at a time, with three parts: the instruction, a control glyph, and a `[ WHY? ]` link. Only ever one chip on screen.

| # | Trigger | Copy | Highlight |
|---|---|---|---|
| 1 | scene ready | **Hold SPACE to light the engines.** | STAGE button, 2px `--accent` ring |
| 2 | liftoff | **Straight up for now. The air down here is thick.** | — |
| 3 | alt > 1 km | **Now tilt right. Tap D and hold it.** | `D` keycap glyph; attitude ring gets an `--accent-soft` target arc at 80° |
| 4 | pitch < 82° | **Follow the dotted line. That curve is how you get sideways instead of just up.** | the gravity-turn guide ribbon drawn in-world |
| 5 | S1 propellant < 2% | **Fuel gone. Press SPACE to drop the empty stage.** | STAGE button pulsing; S1 tank column flashing |
| 6 | S2 ignition | **Watch AP climb. That's how high you'll coast to.** | `AP` cell promoted to 30px with `--accent` outline |
| 7 | AP > 100 km | **You're going to space. Cut the throttle — press X.** | throttle column + `X` keycap |
| 8 | coast, AP T− > 40 s | **Now speed up time. Press the `.` key.** | time-warp widget |
| 9 | T− to AP < 20 s | **Point at the green circle and burn until PE goes positive.** | prograde marker; `PE` cell promoted |
| 10 | PE > 70 km | **You're in orbit. Nothing is slowing you down now.** | full-screen event card (§4.4) |

At the 60-second mark on a nominal run the player is around 70 km, has staged once, and AP is above 100 km. Step 6 has just fired. That is the hook: they have already done the thing the genre is famous for being hard.

### 4.3 Three escape hatches, always present

1. **`[ FLY IT FOR ME ]`** — persistent 11px link in the corner of the coach chip. Hands control to a scripted gravity-turn autopilot. Crucially, **the on-screen controls animate as the autopilot moves them**: the throttle bar slides, the attitude ring rotates, the STAGE button flashes when it fires. Watching the controls work is how a beginner learns what the controls are. A `[ I'LL TAKE IT ]` button replaces it while autopilot is on, and any manual input hands control straight back.
2. **`[ SKIP THE TUTORIAL ]`** — dismisses the coach permanently (recoverable in Settings). Never nag.
3. **Rewind.** A ring buffer of full sim state at 2 Hz over the last 120 s (~240 snapshots; each is ~30 floats, so this is trivial). Available always via `[ REWIND ]` in the pause menu, and offered automatically on any bad outcome.

### 4.4 There is no game over

Any terminating event — crash, out of fuel, breakup, stranded orbit — produces a **debrief card**, never a failure screen. 480 × auto, centred, `--card`, 1px `--border-strong`, no blur:

```
FLIGHT ENDED — 2 min 14 s

You reached 42 km. That's four times higher than an airliner
flies, but you needed about 8,000 m/s more speed to stay up.

  APOGEE     42.1 km        Δv SPENT   3,240 m/s
  MAX SPEED  1,140 m/s      Δv LEFT        0 m/s
  MAX G          3.4        MAX Q     34 kPa

What happened: you burned stage 2 straight up. Going up gets you
altitude; going sideways is what keeps you from falling back.

[ REWIND 20 s ]   [ BACK TO THE PAD ]   [ WATCH THE REPLAY ]
```

The "What happened" line is generated from a small rule table matched against the flight record — pitch profile, staging timing, TWR, Δv margin — with ~12 diagnoses. It is the highest-leverage educational surface in the game because it fires exactly when the player wants to know.

First flight only: if the vehicle is destroyed, the debrief appears **without** the destruction being permanent — `REWIND 20 s` restores and continues. Cadet rules never make a run unrecoverable.

### 4.5 Success card

```
● ORBIT ACHIEVED

  PERIAPSIS   102 km      PERIOD     1 h 28 m
  APOAPSIS    118 km      ORBITS         0.02

You are now falling around the planet instead of into it.
That is the whole trick.

[ KEEP FLYING ]   [ SHOW THE ORBIT ]   [ BUILD SOMETHING BIGGER ]
```

`SHOW THE ORBIT` switches to map view. `BUILD SOMETHING BIGGER` is the first time the builder is ever mentioned as a destination — after the player has a reason to care about Δv.

---

## 5. Visual design language

### 5.1 Principle

Aerospace ground-support software, built by someone who also cares that it looks good: **1px borders instead of shadows, tight padding instead of airy cards, condensed uppercase labels above monospaced numerals, exactly one accent colour, and gradients only where physics puts them** (sky, plume, atmosphere annulus). The mood reference is a range-safety console and an OpenRocket printout, not a SaaS dashboard.

### 5.2 Tokens

Existing tokens are unchanged unless marked ▲.

```css
:root{
  /* ground */
  --bg:#EDECE6; --panel:#E2E0D6; --card:#F8F7F3; --card-2:#FBFAF7;
  --ink-primary:#1A1815; --ink-secondary:#5B564C; --ink-muted:#8B8579;
  --border:rgba(26,24,21,0.12); --border-strong:rgba(26,24,21,0.22);
  --accent:#D9601F; --accent-ink:#241000; --accent-soft:rgba(217,96,31,0.14);
  --focus:#2a78d6;

  /* ▲ status — teal/amber/red, never red/green */
  --stat-nominal:#0F7A6C;   /* 4.9:1 on --card */
  --stat-caution:#A85E00;   /* 4.6:1 */
  --stat-critical:#BE2F27;  /* 5.4:1 */
  --stat-info:#1D5FBF;
  --stat-inert:#8B8579;

  /* ▲ propellant identity — flame-derived, lightness-separated */
  --prop-solid:#8A7C68; --prop-rp1:#D9601F; --prop-ch4:#2A6FB0; --prop-lh2:#6E8796;

  /* HUD over canvas */
  --hud-panel:rgba(248,247,243,0.93);
  --hud-stroke:rgba(26,24,21,0.28);
  --hud-shadow:0 2px 10px rgba(26,24,21,0.22);

  /* builder */
  --build-grid:rgba(26,24,21,0.07); --build-grid-major:rgba(26,24,21,0.13);
  --com:#E8B93C; --cop:#1D5FBF;

  /* map */
  --map-body:#35543A; --map-rim:#6E8F5F; --map-ring:rgba(26,24,21,0.07);
  color-scheme:light;
}
:root[data-theme="dark"], :root:not([data-theme="light"]) /* under prefers-color-scheme: dark */ {
  --bg:#15191B; --panel:#0F1315; --card:#1D2225; --card-2:#20262A;
  --ink-primary:#F2EFE9; --ink-secondary:#B7B2A6; --ink-muted:#726E64;
  --border:rgba(242,239,233,0.12); --border-strong:rgba(242,239,233,0.24);
  --accent:#E67337; --accent-ink:#1B0C00; --accent-soft:rgba(230,115,55,0.16);
  --focus:#6BA8F5;

  --stat-nominal:#35BFAC;   /* 7.1:1 on --card */
  --stat-caution:#E9A33A;   /* 7.5:1 */
  --stat-critical:#FF6B5E;  /* 5.8:1 */
  --stat-info:#6BA8F5;
  --stat-inert:#726E64;

  --prop-solid:#B3A692; --prop-rp1:#E67337; --prop-ch4:#5B9EE0; --prop-lh2:#C3D2DB;

  --hud-panel:rgba(29,34,37,0.93);
  --hud-stroke:rgba(242,239,233,0.30);
  --hud-shadow:0 2px 10px rgba(0,0,0,0.45);

  --build-grid:rgba(242,239,233,0.07); --build-grid-major:rgba(242,239,233,0.13);
  --com:#E8B93C; --cop:#6BA8F5;
  --map-body:#2A4230; --map-rim:#5E7F4F; --map-ring:rgba(242,239,233,0.07);
  color-scheme:dark;
}
```

**Why the status colours changed.** The existing `--status-good:#0ca30c` / `--status-critical:#d03b3b` pair is a red/green opposition, which is invisible to roughly 1 in 12 men. Teal `#0F7A6C` is separated from both amber and red by enough hue *and* lightness to survive deuteranopia, protanopia, and tritanopia. Verified contrast: all three status colours clear 4.5:1 on `--card` in light and 5.7:1 in dark.

**Why the propellant colours changed.** Tying the UI colour to the actual flame colour (kerosene = sooty orange, methane = blue, hydrogen = near-colourless pale steel, solid = smoky tan) means the tank gauge, the stage row, the Δv ladder and the plume in the world canvas all agree. That coherence is what makes the propellant choice feel like a real decision rather than a dropdown. `--prop-lh2` is a mid-steel in light theme (contrast against `--panel`) and a pale steel in dark; the *flame* is separately defined below and is always pale.

### 5.3 World-canvas palette (theme-independent — the sky is the sky)

The world canvas does **not** follow the light/dark theme. Sea level is bright, space is black, in both themes. Only the chrome flips.

| Altitude | Zenith | Horizon |
|---|---|---|
| 0 km | `#7FA8CC` | `#C6D6E4` |
| 12 km | `#3F6FA8` | `#7FA0C0` |
| 30 km | `#1B3A63` | `#2E4E75` |
| 60 km | `#0A1730` | `#101E38` |
| 100 km+ | `#05070F` | `#05070F` |

Interpolate in linear RGB between stops. Stars fade in from 40 km (opacity `clamp((h-40000)/40000, 0, 1)`), two parallax layers. Terrain `#6E7A5E` lit / `#414A38` shade; pad concrete `#B9B3A6`; launch clamps `#8A8272`.

Plumes, per propellant (core → mid → edge, plus smoke):

| Propellant | Core | Mid | Edge | Smoke |
|---|---|---|---|---|
| Solid | `#FFF0C4` | `#FFC24A` | `#C97D2A` | `#A79D8E` @ 0.55 |
| RP-1 | `#FFF6DC` | `#FFB347` | `#E2673C` | `#6B6257` @ 0.40 |
| CH₄ | `#E9F4FF` | `#7FC4FF` | `#2A6FB0` | `#8E96A0` @ 0.18 |
| LH₂ | `#FFFFFF` @ 0.55 | `#CFE0F5` | `#8FB2D8` | none |

Plume length scales with the real thrust from the existing model, and its shape switches from over-expanded (pinched, visible Mach diamonds) to under-expanded (bell-flared) based on `exitPressure(motor, pc)` vs `ambientPressure(h)` — the single most convincing visual detail available, and the physics for it already exists in the file.

### 5.4 Typography roles

| Role | Family | Weight / size | Rules |
|---|---|---|---|
| Screen title | Barlow Condensed | 700 / 54px / uppercase / `0.02em` | title slate only |
| Panel heading | Barlow Condensed | 600 / 13–15px / uppercase / `0.10em` | keep the existing `::before` 6px accent dot |
| Instrument micro-label | Barlow Condensed | 600 / 9.5–11px / uppercase / `0.10em` | `--ink-muted`, always above its value |
| Primary numeric | IBM Plex Mono | 500 / 26–34px | `font-variant-numeric: tabular-nums` |
| Secondary numeric | IBM Plex Mono | 500 / 13–19px | tabular |
| Unit suffix | IBM Plex Mono | 400 / 0.6× the value | `--ink-muted`, 3px left margin |
| Body / explanation | IBM Plex Sans | 400 / 13–14px / 1.55 | max 62ch |
| Button | Barlow Condensed | 700 / 13–22px / uppercase / `0.08–0.10em` | |
| Keycap chip | IBM Plex Mono | 500 / 10px | 1px border, 4px radius, `--panel` |

Hard rules: **never set a live-updating number in a proportional face** (digit-width jitter reads as instability), and **never set a number in Barlow Condensed** (condensed digits are misread at a glance, which is the only glance you get at 3 g). Reserve every glyph of Barlow Condensed for labels and buttons.

Font loading: keep the existing Google Fonts `<link>` but give every stack a real fallback — `"Barlow Condensed","Oswald","Arial Narrow",system-ui,sans-serif` and `"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace` — and set explicit `min-width` in `ch` on every numeric field so nothing reflows if the webfont never arrives.

### 5.5 Component styling rules

**Radius ladder — memorise it, do not deviate:** top-level panel `10px`, inner tile `8px`, control/button `6px`, bar/track `2px`, tick/tape/ruler `0`. The variation is what stops it looking like a generated component library.

**Borders over shadows.** Every panel gets `1px solid var(--border)`. Shadow is used in exactly one place: HUD panels floating over the world canvas get `var(--hud-shadow)`, because there they genuinely need separation from unpredictable content.

**Gauges.** Every bar: 6px thick, square-ended (2px radius max), track `--panel` + 1px `--border`, fill flat (no gradient), plus optional 1px target/redline rules in `--ink-primary`. Every arc gauge: 1.5px track, 3px needle, peak-hold tick. No bezels, no glass, no gloss, no glow, no inner shadow.

**Readout grammar** is identical everywhere in the app: micro-label above, mono value below, unit at 0.6× in `--ink-muted`. Learn it once, read it everywhere.

**Icons.** A fixed set of ~20 inline SVG line glyphs, 16 × 16, `1.5px` stroke, `currentColor`, square caps, no fills. Drawn on a 16px grid so they align optically. **Zero emoji anywhere in the product.**

**Buttons.** Primary = `--accent` fill, `--accent-ink` text, 1px `--border-strong`, and the existing two-part shadow (`0 1px 0 rgba(0,0,0,.15), inset 0 1px 0 rgba(255,255,255,.25)`) which gives one honest millimetre of physical depth. Secondary = transparent + 1px border. Destructive = transparent + 1px `--stat-critical`, filling on hover. Nothing else.

### 5.6 Explicit anti-generic rules

1. No purple/blue/violet gradient anywhere. The only gradients in the product are the sky, the plume, and the atmosphere annulus — all of them physical.
2. No emoji as icons, bullets, or section markers.
3. Not everything is a rounded card. Tapes, rulers, ticks, and the Δv ladder have zero radius and butt directly against their neighbours.
4. Padding is tight — 10–14px in data panels, not 24px. Density is the aesthetic; a range console is dense.
5. No centred hero block with a big headline and two pill buttons. The title is a corner slate over a live scene.
6. One accent colour. Orange. Everything else in the UI is either ink, status, or propellant identity — all of which carry meaning. No decorative colour.
7. No blur/glassmorphism. HUD panels are opaque at 93% with a real border. (If a scrim is ever needed, `backdrop-filter: blur(2px)` maximum, with a solid-alpha fallback.)
8. No pill-shaped everything. Pills are reserved for the phase chip and status chips, where the shape means "this is a state, not an action."
9. Every animation has a physical justification (thrust, rotation, camera). No decorative easing, no entrance animations on panels, no staggered fade-ins.

---

## 6. Accessibility and input

### 6.1 Keyboard map (complete — every action is keyboard-reachable)

| Key | Action |
|---|---|
| `Space` | Stage / ignite / deploy chute (context-labelled on the button) |
| `A` / `←` | Rotate left (full torque) |
| `D` / `→` | Rotate right (full torque) |
| `Q` / `E` | Fine rotate, 0.25× rate |
| `W` / `S` | Throttle ± (60%/s while held) |
| `Z` | Throttle 100% |
| `X` | Throttle 0% |
| `T` | Attitude hold on/off |
| `1`–`6` | Hold prograde / retrograde / radial-out / radial-in / local-up / current heading |
| `.` / `,` | Time warp up / down |
| `/` | Time warp ×1 |
| `M` | Toggle map |
| `F` | Cycle camera (chase / free / ground / on-board) |
| `+` / `−` | Zoom |
| `H` | Cycle HUD density (hold to hide HUD) |
| `E` | Toggle engine readout panel |
| `Ctrl+Z` | Undo staging (2 s window) / undo build step |
| `Esc` | Map → flight; flight → pause menu |
| `Tab` | Cycle focusable HUD regions |
| `?` | Keybinding cheat sheet overlay |
| `B` | Builder (from pause menu) |

Every HUD control is a real `<button>` or `<input type="range">` with a visible `:focus-visible` ring (`2px solid var(--focus); outline-offset:2px` — already in the file). **DOM order matches visual reading order**: slate → warnings → warp → view switch → settings → throttle → tanks → flight strip → attitude → stage. Rebinding lives in Settings and persists to `localStorage`.

The rotation model needs a keyboard-friendly control law: `A`/`D` command an angular *rate* target with an authority limit, and releasing both applies counter-torque to null the rate. Do not apply raw torque on keydown — with binary input that produces uncontrollable tumbling, which is the number one reason people quit a keyboard flight sim.

### 6.2 Screen reader

- `#world` gets `role="img"` and an `aria-label` rewritten at **1 Hz** (never per frame): `Rocket at 24 kilometres, climbing, pitched 62 degrees, engine running.`
- A visually-hidden `<div aria-live="polite" aria-atomic="true">` updated at 1 Hz with the flight sentence: `T plus 1 minute 24. Altitude 24.1 kilometres. Speed 782 metres per second. Apoapsis 96 kilometres. Stage 1, 34 percent fuel remaining.` Numbers are formatted as words-friendly text, not `24.1km`.
- A second `aria-live="assertive"` region for discrete events only: staging, ignition, burnout, max Q, orbit achieved, flight ended.
- The attitude ring SVG has `role="img"` + `aria-label="Attitude 62 degrees from vertical. Prograde marker 8 degrees to the right."`
- Tank gauges are `role="meter"` with `aria-valuenow/min/max/valuetext="Stage 1, 34 percent"`.
- The build canvas gets a parallel accessible tree: a visually-hidden `<ol>` of parts in stack order, each an `<li>` with the part name, height, and its attachment, plus keyboard build mode (`Tab` to a part, `Enter` to pick it up, arrow keys to move between valid nodes, `Enter` to place).

### 6.3 Reduced motion

Under `prefers-reduced-motion: reduce` **or** the independent Settings toggle `Reduce effects`:

| Effect | Normal | Reduced |
|---|---|---|
| Camera shake | ±6px at max thrust, ±14px at staging | 0 |
| Screen flash on ignition/explosion | 120 ms white/orange flash | static 8% tint, no transition |
| Particle count | 100% | 25% |
| Plume flicker | ±18% length @ 12 Hz | ±4% @ 3 Hz |
| Warp star streaks | on | off, static stars |
| Starfield parallax | on | fixed |
| View transitions | 250 ms zoom | 80 ms crossfade |
| Panel transitions | 150–400 ms | 0 |
| HUD auto-dim | on | off |
| Pulsing STAGE ring | 0.5 Hz pulse | static 2px ring |
| Snap-node pulse | 0.4 Hz | static ring |

The rocket, plume, and world still animate — that is the content, not decoration. Reduced motion removes *involuntary* motion (shake, flash, parallax, pulse), not the simulation. Provide a separate `Performance mode` that caps particles and pixel ratio for weak hardware, so a player is never forced to choose between comfort and framerate.

### 6.4 Colour vision

- **Nothing is encoded by colour alone.** Status always carries a glyph (`●` nominal, `▲` caution, `■` critical) *and* a word. Propellants always carry a 3-letter code. Trajectory types carry a dash pattern (solid / dashed 6-4 / dotted 2-4). AP and PE markers carry different shapes (outline vs filled triangle).
- The teal/amber/red status triad (§5.2) is deliberately chosen for CVD separation; verify with a simulator during build.
- Settings offers `Colour vision: Standard / Deuteranopia / Protanopia / Tritanopia / High contrast`, which remaps only `--stat-*` and `--prop-*`. High contrast additionally forces `--border` to `--border-strong` and raises HUD panel opacity to 100%.
- Contrast floors: body text ≥ 4.5:1 on its own surface; HUD numerals ≥ 7:1; gauge fill vs track ≥ 3:1; every focus ring ≥ 3:1 against both the control and its background.
- Theme: follow `prefers-color-scheme` by default with a three-state manual override (`Auto / Light / Dark`) via the `◐` control, persisted, using the `[data-theme]` mechanism already in the file.

### 6.5 Touch

Landscape is the recommended orientation. Portrait is **supported, not blocked** — show a dismissible toast `Rotate your phone for the full view`, never a blocking gate.

Landscape control layout:

- **Left edge:** throttle track, 44 × 180, 12px from the edge, vertically centred. Drag anywhere on it; tap a position to jump. Double-tap = cut throttle.
- **Bottom-left:** two 64px round rotate pads `◀` `▶`, 20px apart, 16px from the corner. Press-and-hold for rate; both together = null rate. A third 44px pad above them toggles attitude hold (`T`), showing the current mode as a 3-letter code.
- **Bottom-right:** `STAGE`, 200 × 68 (do not shrink this on mobile — it is the button people need under stress).
- **Above STAGE:** attitude ring at 140px, pitch tape at 140 × 20.
- **Bottom-centre:** flight strip drops to four cells in one row, 300 × 44.
- **Tank stack** moves to the top-left under the mission slate as a horizontal row of 20 × 44 bars.
- Gestures: pinch = zoom; one-finger drag on empty space = look around (flight) / pan (map); double-tap empty space = toggle map; two-finger tap = time warp up.
- `touch-action: none` on the canvas and all control pads; `overscroll-behavior: none` on `body`; `user-select: none` on the HUD; `viewport-fit=cover` plus `env(safe-area-inset-*)` padding on all four HUD edges so nothing lands under a notch or home indicator.
- Minimum touch target 44 × 44 CSS px; primary actions ≥ 56. Controls that overlap the clear stage rectangle are forbidden — on short viewports shrink the rectangle rather than moving a control into it.
- Every control pad gets a 30 ms `navigator.vibrate(8)` on press where supported, gated by a `Haptics` setting.

---

## 7. Copy deck

**Buttons and controls**

`LAUNCH MY FIRST ROCKET` · `OPEN THE BUILDER` · `LOAD A DESIGN` · `CONTINUE` · `LAUNCH` · `LAUNCH ANYWAY` · `FIX IT FOR ME` · `SHOW ME` · `SHOW ME WHY` · `WHY?` · `STAGE` · `DEPLOY CHUTE` · `CUT ENGINE` · `FLIGHT` · `MAP` · `FIT` · `FOCUS: SHIP` · `MAKE A NODE` · `FLY IT FOR ME` · `I'LL TAKE IT` · `SKIP THE TUTORIAL` · `NEXT STEP` · `REWIND 20 s` · `BACK TO THE PAD` · `WATCH THE REPLAY` · `KEEP FLYING` · `SHOW THE ORBIT` · `BUILD SOMETHING BIGGER` · `UNDO` · `REDO` · `NOT YET`

**Instrument labels** (Barlow Condensed uppercase): `MET` `ALT` `SPD` `SPD (ORB)` `V/S` `AP` `PE` `TWR` `THR` `PITCH` `AoA` `Q` `MACH` `Δv` `MASS` `DRY MASS` `PROPELLANT` `EST. MAX Q` `CoM` `CoP` `PARTS` `STAGES` `VEHICLE` `PRE-FLIGHT CHECK` `ATTITUDE` `TANKS` `WARP`

**Phase chips**: `STANDBY` `IGNITION` `ASCENT` `STAGING` `COAST` `BURN` `REENTRY` `DESCENT` `LANDED` `IN ORBIT` `ENDED`

**Attitude hold modes**: `PRO` `RET` `R+` `R−` `UP` `HOLD`

**Warnings**: `▲ MAX Q` · `▲ LOW FUEL — S1` · `▲ HIGH ANGLE OF ATTACK` · `▲ HIGH G — CREW AT LIMIT` · `■ OVERHEATING` · `■ STRUCTURAL LOAD` · `● STAGE SEPARATION` · `● ENGINE CUTOFF` · `● ORBIT ACHIEVED`

**Warp states**: `WARP LOCKED — you're in the atmosphere` · `WARP LOCKED — engine is running` · `MAX ×100 HERE`

**Stability chips**: `● STABLE — CoP is 2.5 m behind CoM.` · `▲ MARGINAL — the rocket will wobble in thin air.` · `■ UNSTABLE — it will flip over as soon as it picks up speed. Add fins at the bottom, or put heavier parts on top.`

**Pre-flight issues**: `No command pod. Nobody is flying this.` · `TWR is 0.94. It will not lift off the pad.` · `Stage 2 has no engine — it is just a tank.` · `No parachute. Whatever comes down will hit hard.` · `Everything else looks fine.`

**"Why?" popovers** (2 sentences, formula in mono):
- Δv — `Your speed budget. Δv = Isp · g₀ · ln(m_wet / m_dry) — spend it all and you stop accelerating, wherever you happen to be.`
- TWR — `Thrust divided by weight. Below 1.0 you don't move; around 1.5 is comfortable; above 2.5 you waste fuel fighting the air.`
- Isp — `How many seconds one kilogram of propellant can produce one kilogram of thrust. Higher means you go further on the same mass.`
- Apoapsis — `The highest point of the path you're currently on. Getting apoapsis high is easy; the hard part is going fast enough sideways to still be there when you arrive.`
- Periapsis — `The lowest point of your path. If it's below the ground, you're on an arc, not an orbit.`
- Max Q — `The moment the air pushes hardest. It's not the fastest moment or the highest — it's where speed and air density multiply out to the biggest load.`
- Chamber pressure — `How hard the burning propellant is pushing inside the engine. It sets your thrust, and pushing it higher needs a stronger, heavier chamber.`
- Solid motors — `Fuel and oxidiser are cast into one solid grain. Once it's lit there is no valve and no off switch.`

**Debrief diagnoses** (rule-matched, one shown): `you burned stage 2 straight up` · `you tipped over too early and lost altitude` · `you ran out of Δv — this rocket needed a bigger first stage` · `you staged with fuel still in the tank` · `you came in too steep and too fast to survive reentry` · `you got to orbit, but with nothing left to come home on`

---

## 8. Build notes for the implementer

- One `<canvas>`, one `#hud` DOM overlay, one `#build` DOM/canvas hybrid. No framework. Total new CSS should be ~700 lines on top of the existing 240.
- Size the canvas by `devicePixelRatio` and re-size on `resize` + `orientationchange` with a 100 ms debounce; never scale the canvas with CSS.
- Update HUD text at **10 Hz**, not 60 — write to DOM only when the *formatted string* changes. A 60 Hz DOM write loop is both a performance problem and an unreadable display.
- Physics integration runs on a fixed `dt` (1/120 s) with an accumulator, decoupled from render, so time warp is "run N substeps per frame" rather than "increase dt" — the existing `derivative()` and RK integration stay valid.
- Persist to `localStorage` under one key `orbiter.v1`: theme, HUD density, keybindings, accessibility settings, saved vehicles, tutorial-completed flag. Wrap every read and write in `try/catch` and render correctly with no stored value.
- The rewind buffer is a plain ring array of 240 state objects at 2 Hz. It is also the replay source; do not build a second system for replay.
