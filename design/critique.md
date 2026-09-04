# Integration Critique

## Contradictions (resolved)

- C1 — HOME PLANET: real Earth (game-mechanics) vs scaled 600 km world (flight-physics AND education). This is load-bearing: it sets mission thresholds, the rails-warp altitude gate (140 km vs 70 km), and visual-realism's camera zoom anchor table (written in absolute km: 20 km / 150 km / 2000 km). RULING: scaled world is DEFAULT. R = 600,000 m, mu = 3.5316e12, zAtm = 70,000 m, day = 21,600 s. Real Earth ships as an explicit 'REAL EARTH — hard' toggle. Rationale: engine realism is NOT planet realism — the combustion/nozzle code is byte-identical on both worlds and sea-level pressure is 101,325 Pa on both, so the user's stated top priority is untouched; 3,400 m/s to orbit vs 9,400 m/s is the difference between reaching orbit in session 3 and session 30, and this is now a game. Do NOT name it Kerbin (trademark-adjacent and it reads as derivative) — name it HOME / 'Terra Minor'. Integration fix required: visual-realism's ppm anchor table must be re-expressed as fractions of BODY.zAtm and BODY.R, not absolute kilometres, or the camera framing is wrong on one of the two worlds. Every threshold in every module reads BODY.* — no literal 70000 or 140000 anywhere.

- C2 — INTEGRATOR: the existing file uses RK4; flight-physics mandates velocity Verlet and explicitly rejects RK4; game-mechanics says semi-implicit Euler; education says 'accumulate losses every RK4 step'. Four specs, three integrators. RULING: velocity Verlet (kick-drift-kick) with operator-split analytic drag at fixed h = 1/120 s. flight-physics owns this and its argument is the strongest (symplectic so parked orbits don't decay, one force eval, doesn't straddle staging/burnout discontinuities). Semi-implicit Euler is the same family but first-order — Verlet supersedes it at the same cost and game-mechanics loses nothing since its real requirement was 'not explicit Euler'. DELETE the word RK4 from the education spec. CRITICAL COROLLARY: because drag is operator-split (applied analytically OUTSIDE the force accumulation), the dv ledger's drag bar MUST be measured as the speed the drag operator actually removed — dvDrag += |v_before_drag_operator| - |v_after_drag_operator| — and NOT computed as (D/m)*dt. If anyone writes the D/m*dt form the four bars will not close to 1% and education's own headline feature silently breaks. This is the single most important line in this document.

- C3 — TIME WARP MECHANISM: ux-layout says cap warp by altitude at x10 below 70 km and x100 below 200 km, implemented as N fixed substeps; game-mechanics and flight-physics both say integrated warp is capped at 4x with everything above it on analytic Kepler rails. RULING: game-mechanics/flight-physics win; ux-layout's x10/x100 numbers are DELETED. x10 below 70 km means 10 x 120 = 1200 substeps per frame, which is 10+ ms of physics and blows visual-realism's entire 9 ms render budget on its own. PHYS warp is exactly {1,2,3,4} (max 8 substeps per 60 Hz frame, hard cap 48). RAILS is {5,10,50,100,1000,10000,100000}, analytic Kepler only. What survives from ux-layout is the UX rule, which is correct and mandatory: a refused warp must always display its reason ('RAILS BLOCKED — SRB BURNING'), never silently refuse. Adopt game-mechanics' one universal auto-drop rule (step down while dt_step > t_to_event/6).

- C4 — ATTITUDE CONTROL: flight-physics flies attitude through the GIMBAL via computed torque (delta = asin(-tau/(l_e*T))); ux-layout commands an angular RATE with counter-torque on release; game-mechanics just says A/D rotate. These are different systems and they break each other — computed-torque-via-gimbal has ZERO authority when the engine is off (T=0 makes the asin argument infinite), yet free rotation while coasting is the defining control feel of the reference game. RULING: two layers, one command variable. A/D always sets ctl.omegaCmd (rad/s, clamped +/-0.6) — ux-layout's rate model, which is correct and is the single biggest reason keyboard flight sims get abandoned. One inner controller then realizes that rate through whatever authority exists, in fixed priority: (1) gimbal via flight-physics' computed torque when T > 1000 N, slew-limited 40 deg/s; (2) RCS torque when R is toggled, consuming monoprop; (3) reaction-wheel torque tauRW, always available. SAS (T) is an OUTER loop that only writes omegaCmd from an attitude error — there is never a second controller. flight-physics' builder authority check still runs, extended to check RW+RCS for the coast case.

- C5 — ANGLE CONVENTION: flight-physics stores theta CCW from +x, inertial, unwrapped; ux-layout's Attitude Ring reads 0 deg = local vertical, 90 deg = local horizontal. Both are right in their own domain, and if the renderer or HUD picks the wrong one the rocket points sideways on screen. RULING: state.theta is the ONLY stored angle — inertial, radians, CCW from +x, unwrapped. Every display angle is derived by a named pure function in one place: pitchFromVertical(st) = wrapPi(st.theta - Math.atan2(st.ry, st.rx)), plus flightPathAngle(st), aoa(st), headingRate(st). NO module outside that block may call Math.atan2 on a state vector — grep for it in review. Dev assert: on the pad at t=0, pitchFromVertical must be 0.000 and theta must equal atan2(ry,rx) to 1e-12.

- C6 — GEOMETRY COORDINATES: flight-physics mandates station s from the nose tip positive aft with x_b = s_cm - s; ux-layout's builder places parts on snap nodes in a screen-y-down canvas; visual-realism draws the sprite in an unspecified body frame with the nozzle somewhere. Three coordinate systems for one rocket, none reconciled — this WILL produce a rocket whose centre of pressure marker disagrees with where the fins are drawn. RULING: the builder is authoritative and emits s directly. layoutRocket(design) runs after every build edit and assigns every part sTop and sBot in metres from the nose tip, positive aft. The build canvas draws at screenY = padTop + s*pxPerM (s grows downward, matching how people build). The sprite renderer draws in body frame with ORIGIN AT THE NOSE TIP, +Y AFT, metres. Physics converts exactly once, via x_b = s_cm - s. No other conversion exists anywhere in the file.

- C7 — ROCKET ART PATH: visual-realism caches the rocket as an offscreen sprite rebuilt on bucketed state change (one drawImage per frame); ux-layout requires palette thumbnails to use the same vector draw function as the world canvas. Not strictly contradictory but they will be built as two divergent code paths and the builder will end up looking like a menu of abstractions. RULING: one function drawPartVector(ctx, part, opts) in body coordinates, metres, +Y aft, origin at the part's sTop. The palette thumbnail calls it directly into a 56x56 canvas with a fitted transform; the world renderer calls it into the offscreen sprite atlas at rebuild time. The sprite cache WRAPS the vector draw, it does not replace it.

- C8 — SCREEN REAL ESTATE: ux-layout reserves a permanently clear 60%w x 55%h 'stage rectangle' centred at (50%, 46%); education places the CAPCOM callout card bottom-left OF THE CANVAS; game-mechanics places a 96 px STAGE button bottom-centre. On a 360x640 portrait phone the rectangle spans y = 118..470, and a two-line callout card at bottom-left overflows into it. RULING: the clear rectangle is a hard invariant WITH a documented mobile relaxation — under 700 px viewport height it shrinks to 60% x 40% centred at (50%, 40%). The bottom-left CAPCOM card is DESKTOP ONLY; on mobile it degrades to a one-line ticker in the top bar that expands to a bottom sheet on tap (the sim never pauses). Ship ux-layout's requested dev assert: iterate document.querySelectorAll('[data-hud]') each layout and throw if any bounding box intersects the rectangle.

- C9 — FAILURE PHILOSOPHY: ux-layout wants 'a 120-second rewind buffer so the first flight literally cannot end in failure'; education insists 'never block a launch, the flight is the lesson' and 'blocking takes away the failure that teaches'; game-mechanics wants named causes plus revert. The first is in direct tension with the other two — if the first flight auto-rewinds, the lesson is deleted. RULING: the rocket always dies, and nothing ever rewinds automatically. What ux-layout actually needs, and gets, is that the DEBRIEF is never a dead end: the crash plays in slow-mo (start the slow-mo 0.15 s BEFORE contact by predicting one frame ahead, per game-mechanics), the debrief names the cause, the number that caused it and the number it needed, and REWIND 20s / BACK TO PAD / WATCH REPLAY are each one click. 'FLY IT FOR ME' autopilot stays as the permanent escape hatch. Also: Ctrl+Z (game-mechanics) and REWIND 20 s (ux-layout) are THE SAME BUTTON on THE SAME ring buffer that also feeds replay — three names, one system, per ux-layout's own pitfall about building replay twice.

- C10 — REWIND BUFFER RATE: ux-layout says 2 Hz x 240 snapshots = 120 s; game-mechanics says 5 Hz with delta-compressed part state and a 20-minute cap. RULING: one ring at 4 Hz x 1800 slots = 7.5 minutes. 2 Hz replay stutters visibly; 5 Hz buys nothing over 4. game-mechanics' delta compression and 20-minute cap become unnecessary once part state is OUT of the snapshot entirely — parts are fully reconstructible from design + stageIndex + propMass[], so a snapshot is ~120 bytes and 1800 of them is ~216 KB. Separately: full deep-clone CHECKPOINTS (F5/F9, auto at staging / orbit insertion / SOI / entry interface) capped at 8.

- C11 — PARTICLES DURING WARP: visual-realism says 'disable all particle emission whenever timewarp > 1', but game-mechanics permits PHYS warp 1-4x UNDER THRUST and the warped ascent is the single most cinematic moment the renderer exists to produce. Killing the exhaust trail at 2x deletes the payoff exactly when players use warp. RULING: emission SCALES, it does not switch off. During PHYS warp 1-4x: emitRate *= 1/warp with lifetime unchanged, which preserves world-space trail density and never approaches the 1800 cap. Emission is fully OFF only in RAILS warp (>=5x), where by precondition there is no thrust and no atmosphere anyway. visual-realism's rule was written assuming warp meant 100x; this is what it actually wanted.

- C12 — ATMOSPHERE MODEL: the existing file has one exponential (SCALE_HEIGHT = 8500, line 386); game-mechanics wants a three-segment US Standard fit; flight-physics wants full US Std 1976 layers to 86 km plus a log-linear table to 140 km; visual-realism consumes pa and a normalized atm term. RULING: flight-physics' model wins, exposed as exactly two functions on the world object — BODY.rho(alt) and BODY.pa(alt), both taking GEOMETRIC altitude in metres. The existing globals airDensity/ambientPressure become one-line delegating wrappers so the untouched engine code keeps working with zero edits. Hard constraint: BODY.pa(0) === 101325 on BOTH worlds, so the engine model's sea-level Isp stays physically real and visual-realism's atm = clamp(pa/101325, 0, 1) works unchanged everywhere. The scaled world compresses the same profile to zAtm = 70 km via a single altitude scale factor, not a different table.

- C13 — PROPELLANT DATA IS INCOMPLETE IN THE CODE (spec vs file, not spec vs spec): FUEL_PRESETS liquids at lines 592-603 carry ONLY cstar and k. game-mechanics' central educational trade — 'hydrolox holds 15.5 t where kerolox holds 37 t in the same tank but gets Isp 459 vs 348' — requires bulk propellant density (kerolox ~1030, methalox ~830, hydrolox ~360 kg/m3 at stoichiometric-ish O/F) and a per-propellant tank dry-mass fraction (LH2 ~0.11 for insulation, others ~0.05, exactly as game-mechanics warns). Neither field exists. RULING: extend FUEL_PRESETS with bulkDensity (kg/m3), tankDryFrac (dimensionless), ofRatio (display only), and boiloffRate (frac/s, 0 for RP-1, nonzero for CH4/LH2 — this is free teaching and makes the hydrolox trade bite in a third dimension). This must land BEFORE the builder is written or the tank-volume lesson is uncomputable.

- C14 — SCALE MISMATCH, AND A SHIP-BLOCKING GRAIN-GEOMETRY BUG NOBODY NAMED: the existing model is dimensioned for hobby motors (FIELD_DEFS lines 610-630: grain 20-80 mm, throat 4-20 mm, prop load 0.1-8 kg, dry mass 0.5-10 kg) while every game spec assumes orbital vehicles. I checked whether the physics survives the scale-up and the answer is a qualified yes with one specific failure. The chamber-pressure solve pc = (Kn*a*rho_p*cstar)^(1/(1-n)) is scale-free and the coefficients are good: the default hobby motor computes Kn = 167 -> pc = 2.9 MPa (correct for an APCP hobby motor), and a Kn of 300 gives 7.1 MPa (Shuttle SRB is 6.3 MPa). The equations are fine. What is NOT fine: burningArea() implements a plain BATES cylindrical bore, and a cylindrical bore CANNOT REACH SRB-class burn area at plausible dimensions. A 3.7 m x 25 m grain with a 1.4 m bore gives ab = 110 m2 against a real SRB throat of 1.45 m2 -> Kn = 76 -> pc = 0.86 MPa and a pathetically weak, absurdly long-burning motor. Real SRBs use an 11-point star / finocyl grain with roughly 3x the bore perimeter (real ab ~ 300 m2 -> Kn 207 -> pc ~ 4 MPa). RULING: add grain.perimeterFactor (1.0 = BATES bore, 2.0 = finocyl, 3.5 = 11-point star) multiplying ONLY the lateral term in burningArea(). One line of code, it makes catalog SRBs physically correct, and it becomes a genuinely teachable part stat ('star grain: high thrust, short burn; BATES: low thrust, long burn'). Also: FIELD_DEFS global sliders are replaced by per-part-class ranges in the catalog, and classifyMotor() (amateur A-P impulse letters) is retired from the game path and kept only on the Test Stand. Ship a dev assert that every catalog solid produces 3 MPa < pc(t=0) < 12 MPa.

- C15 — FLOW SEPARATION vs PLUME RENDERING: game-mechanics requires a separation clamp (pe < 0.4*pa clamps the exit-pressure term with a 15% penalty) which the file does not have (line 443 computes pressureTerm unclamped, so the vacuum bell produces nonsense at sea level); flight-physics never mentions it; visual-realism needs the RAW, UNCLAMPED pe/pa to compute shock-cell spacing and the over-expanded plume pinch. If the renderer reads the clamped value, the pinched sea-level plume — the whole point of the vacuum-bell lesson — disappears exactly when it should be most visible. RULING: two values, two names, both exported. peIdeal(motor, pc) is the pure isentropic exit pressure and is the ONLY thing the renderer reads. thrustCoefficient() applies the Summerfield separation criterion internally and never exposes a clamped pe. Add a third exported boolean isSeparated(motor, pc, pa) for the HUD warning and the education callout.


## Gaps

- G1 — NO TORQUE SOURCE EXISTS IN VACUUM COAST. This is the most serious gap: not one of six specs provides any way to rotate the vehicle with the engine off. flight-physics' entire attitude chain runs through the gimbal, which has zero authority at T=0. As specified, the game becomes uncontrollable the instant MECO occurs — i.e. at exactly the moment orbital mechanics begins. FIX: reaction wheels as a free, always-on torque source, tauRW = min(0.04 * m * g0 * L_total, 2.5e5) N*m, plus RCS on the R key. Non-negotiable; the game does not function without it.

- G2 — NO RESOURCE MODEL BEYOND PROPELLANT. R toggles RCS but nothing defines a monoprop tank, its mass, its Isp, or the behaviour at zero. RULING (a deliberate scope cut, not an oversight to fill): ship exactly ONE extra resource — monoprop, kg, Isp 220 s, RCS only, drawn from an explicit RCS tank part. Ship NO electricity, NO batteries, NO solar. Reaction wheels are free and always on. A power economy is a second resource system that teaches nothing this game is about and would consume a week.

- G3 — AUDIO: ZERO MENTIONS ACROSS ALL SIX SPECS. The user's brief is 'make the video and game realistic' and a silent launch is the largest single credibility gap in the whole plan — larger than any plume detail. Must be WebAudio synthesis (a self-contained HTML file cannot ship audio assets): filtered brown noise for the plume with gain proportional to thrust and low-pass cutoff proportional to sqrt(ambient density), so the roar physically FADES TO SILENCE as you leave the atmosphere. That single behaviour is the best free 'we are in space now' cue available and it pairs exactly with visual-realism's 'sudden stillness above the atmosphere'. Plus: staging thump (filtered impulse), RCS ticks, a warp tone that pitches with warp level, and a click layer for UI. Roughly 120 lines. Must start silent until first user gesture (autoplay policy) with a persistent mute toggle. MUST-HAVE.

- G4 — LANDING HAS NO RULES. 'Land' is one of the three stated win conditions, yet nothing defines contact GEOMETRY. flight-physics specifies a penalty spring and a settle-to-LANDED transition but there are no contact points, no tip-over condition, and no impact tolerance. FIX: every part carries contactPoints[] in body coordinates (legs get two, the engine bell gets one, the nose gets one for the crash case), a per-part impactTolerance in m/s (legs 6.0, bell 2.0, tank 3.5), and a tipAngle check — if |pitchFromVertical| > 20 deg at the moment the lowest contact point settles, the vehicle tips and falls. Without this, landing is undefined and the reentry mission has no terminal condition.

- G5 — REENTRY HEATING IS ABSENT FROM THE PHYSICS CORE AND FROM THE RENDERER. education correctly warns against a magic temperature limit but no spec actually puts heating in the simulation, and 'orbit and return' is education's capstone mission M10. Separately, visual-realism never mentions reentry plasma — so the most visually spectacular event in the entire game has no renderer specification at all. FIX: Sutton-Graves q_conv = 1.83e-4 * sqrt(rho/Rn) * V^3 integrated into a per-vehicle skin temperature with thermal mass and a sigma*eps*T^4 radiative cooling term; per-part maxSkinTemp with a named burn-through failure. Renderer: a plasma sheath drawn as a stagnation-point bow cap whose colour ramps orange -> white by temperature and whose length scales with q_conv, plus an ablation particle trail. This is the single highest visual-payoff feature in the game and it is currently unowned.

- G6 — NOTHING TEACHES THE PLAYER TO PITCH OVER. Not knowing to start a gravity turn at all is the number-one first-hour wall in this genre, and no spec addresses it. education's callouts fire AFTER things happen; nothing tells the player what to do next during the three minutes of ascent — which is the only period where the player would otherwise be doing nothing. FIX: a ghost 'pitch guide' arc on the Attitude Ring during ascent, drawn from a simple target profile (pitch = 90*(1 - (v/vTarget)^0.7) deg from vertical), plus a live deviation number. About 20 lines. It converts the ascent from baffling to teachable and gives the player a task.

- G7 — NO VERSIONED DESIGN SCHEMA. game-mechanics correctly rules that designs share as copyable JSON text (the artifact sandbox makes downloads inert), but nobody specified what happens when a saved design references a part id that changed or vanished. An unguarded JSON.parse into the builder will throw and take down the whole page. FIX: design.v integer, and a loadDesign() that drops unknown part ids with a named, visible warning ('3 parts from a newer version were removed') and never throws.

- G8 — NO SEEDED RNG. game-mechanics calls for a 'deterministic state machine'; visual-realism bans Math.random() for VISUALS but says nothing about simulation randomness; education's headline pedagogy is 'watch two identical rockets diverge because of one changed parameter'. That A/B demo is impossible to run honestly without reproducible randomness in particle spawn, failure jitter and initial conditions. FIX: one mulberry32(seed) instance, seeded per flight, seed stored in the snapshot and the checkpoint. Visual noise stays on value noise per visual-realism; simulation randomness goes through the seeded PRNG.

- G9 — NO FRAME-BUDGET OWNER. visual-realism claims under 9 ms for render; physics at 4x warp runs 8 substeps; education evaluates ~40 triggers; ux-layout throttles the HUD to 10 Hz. Four modules each assume the other three are cheap and nobody owns the 16.7 ms total. FIX: a declared budget (physics <= 4 ms, render <= 9 ms, everything else <= 2 ms) and ONE adaptive-quality controller keyed on a 30-frame rolling median, degrading in a fixed published order: particle cap 1800 -> 900 -> 400, then bloom off, then star twinkle off, then smoke sub-lobes 4 -> 1, then sprite rebuild throttled to 4 Hz. It must also be manually settable, because an auto-degrader with no manual override reads as a broken game.

- G10 — TOUCH ROTATION IS UNDERSPECIFIED. game-mechanics gives seven buttons, ux-layout gives rotate pads, neither says touch rotation must write the SAME ctl.omegaCmd as the keyboard, nor what happens when both pads are held, nor that pointercancel (a notification sliding down mid-burn) must null the rate rather than leaving it latched. A latched rotation from a lost pointer event is an unattributable flip and players will report it as physics being broken.

- G11 — THE BUILDER HAS NO KEYBOARD PATH. Drag-and-drop only makes the entire build screen unusable by keyboard and screen-reader users, and the same fallback is needed anyway for reliable touch placement. FIX: click-part -> click-node -> Enter places; arrow keys cycle nodes; Delete removes. About 30 lines, and it doubles as the touch path.

- G12 — THE SPECS SILENTLY DELETE THE TEST STAND. The existing product IS a hotfire test stand and it is the purest expression of the engine realism the user named as their top priority from the start. Six specs describe a flight game and not one preserves it. FIX: keep it as a build-screen sub-mode — select any engine part, press HOTFIRE, get the existing thrust/pressure/Kn curves against the real nozzle. It is already written, it costs almost nothing to retain, and cutting the feature that embodies the user's stated priority would be the worst call in this plan.

- G13 — NO 'WHAT DO I DO NOW' STATE AFTER ORBIT. Every spec ends at orbit insertion. Once circular, there is no objective, no rendezvous, no target, and no reason to keep playing — the game's own success condition is its dead end. FIX (cheap version, not a new subsystem): a set of orbital CONTRACTS reading purely off the conic — 'circularise within 5% e', 'reach a 300 km circular', 'match this drawn target orbit within 2 km / 0.01 e', 'return and land within 10 km of the pad'. The target orbit is a second drawn conic on the map and the whole feature is arithmetic on elements already computed.

- G14 — NOBODY OWNS NUMBER FORMATTING. Four modules independently display altitude, speed, mass and dv. Without one format layer you get 7.3 km in the HUD, 7300 m in the debrief and 7.34e3 in a callout, in the same session. FIX: one fmt module (fmtAlt, fmtVel, fmtMass, fmtDv, fmtPressure, fmtTime as T+MM:SS) used everywhere; it is the ONLY place unit conversion from SI is permitted, which also enforces the SI-everywhere-in-state rule.


## Shared State Shapes

```js
/* =====================================================================
   GLOBAL CONVENTIONS — violating any of these is a bug, not a style choice
   ---------------------------------------------------------------------
   UNITS: strict SI in all state. m, kg, s, N, Pa, K, rad, kg/m^3.
          No km, no degrees, no tonnes, no MPa in any stored field.
          Conversion happens ONLY inside fmt*() display functions.
   ANGLES: radians, CCW positive. Inertial angles measured from +x.
   STATION: `s` = metres from NOSE TIP, positive AFT. Body coord x_b = s_cm - s.
   WORLD:  planet-centred inertial. Origin = planet centre.
           +y passes through the launch site at t=0. Surface at |r| = BODY.R.
   MUTABILITY: STATE is mutated in place by physics only. Every other module
           receives it read-only, or receives the derived TELEMETRY frame.
   ===================================================================== */

/* ---------- 1. BODY — the world. One object; nothing reads a literal. ---- */
const BODY = {
  id:        'home',        // 'home' | 'earth'
  name:      'Home',
  R:         600000,        // m, mean surface radius
  mu:        3.5316e12,     // m^3/s^2, GM
  g0:        9.80665,       // m/s^2, standard gravity (Isp reference ONLY —
                            //   never used as local gravity; local g = mu/r^2)
  omega:     2.9089e-4,     // rad/s, sidereal rotation (2*pi / 21600 s)
  zAtm:      70000,         // m, atmosphere top. Rails-warp gate. Drag cutoff.
  pa0:       101325,        // Pa, sea level. MUST be 101325 on every world so
                            //   the engine model's Isp stays physically real.
  rho0:      1.225,         // kg/m^3, sea level
  atmScale:  70000/140000,  // altitude multiplier into the US76 table
  soiR:      Infinity,      // m, sphere of influence (single-body v1)
  padLat:    0,             // rad, launch site latitude (0 = equator)
  // Functions, not data. Every module calls these; nobody re-derives them.
  pa:   (alt) => 0,         // Pa,      geometric altitude m -> pressure
  rho:  (alt) => 0,         // kg/m^3,  geometric altitude m -> density
  temp: (alt) => 0,         // K
  sos:  (alt) => 0,         // m/s, speed of sound = sqrt(1.4*287*T)
  gAt:  (r)   => 0,         // m/s^2, mu/r^2, r = radius from centre (NOT alt)
};

/* ---------- 2. PROPELLANT — extends the file's existing FUEL_PRESETS ----- */
const PROPELLANT = {
  key:          'lh2',      // 'solid' | 'rp1' | 'ch4' | 'lh2'
  name:         'Liquid Hydrogen',
  formula:      'LH2 / LOX',
  // --- EXISTING FIELDS, unchanged, consumed by the untouched engine model ---
  cstar:        2350,       // m/s, characteristic velocity
  k:            1.13,       // dimensionless, ratio of specific heats
  density:      null,       // kg/m^3, SOLID GRAIN ONLY (null for liquids)
  a:            null,       // Saint Robert coefficient, SOLIDS ONLY (SI)
  n:            null,       // Saint Robert exponent, SOLIDS ONLY
  // --- NEW, REQUIRED (see contradiction C13) — none of these exist today ---
  bulkDensity:  360,        // kg/m^3, mixed prop at flight O/F. rp1 1030,
                            //   ch4 830, lh2 360. Drives tank capacity —
                            //   this is the 37 t vs 15.5 t lesson.
  tankDryFrac:  0.11,       // dimensionless, tank dry mass / prop mass.
                            //   lh2 0.11 (insulation), others 0.05.
                            //   At 0.05 the LH2 trade is strictly superior
                            //   and the central lesson collapses.
  ofRatio:      5.5,        // display only
  boiloffRate:  2.0e-5,     // fraction of load per second on the pad.
                            //   rp1 0, ch4 4e-6, lh2 2e-5. Free teaching.
  plumeOpacity: 0.22,       // visual-realism base: solid .95 rp1 .85
                            //   ch4 .55 lh2 .22
  plumeColor:   ['#9fd4ff','#d8ecff'],  // [core, tip]
  sootFactor:   0.0,        // 0..1, drives soot accumulation + smoke darkness
};

/* ---------- 3. PART — one catalog entry (immutable template) ------------- */
const PART_DEF = {
  id:          'engine.vac.mid',   // stable string key. NEVER renumber:
                                   //   saved designs reference it.
  cls:         'engine',   // 'pod'|'tank'|'engine'|'srb'|'decoupler'|
                           //   'fairing'|'fin'|'leg'|'chute'|'rcs'|'struct'
  name:        'Vacuum Bell (Mid)',
  L:           3.10,       // m, length along the station axis
  D:           1.80,       // m, outer diameter (max, for area/silhouette)
  dryMass:     620,        // kg
  // Attachment nodes in station-local coords: 0 = this part's own top face.
  nodesTop:    [{ ds: 0.00, dx: 0.00, size: 1.8 }],  // ds,dx in m; size = D match
  nodesBot:    [{ ds: 3.10, dx: 0.00, size: 1.8 }],
  nodesRadial: [],         // for strap-on boosters: [{ds, dx, size}]
  // --- aero, all in SI ---
  cdBase:      0.30,       // axial Cd contribution at M=0
  cnAlpha:     2.0,        // per rad, normal force slope (Barrowman term)
  sPlan:       5.58,       // m^2, planform area for the crossflow term
  // --- engine-only (null otherwise) ---
  engine: {
    propKey:      'lh2',
    pcDesign:     10.5e6,  // Pa, design chamber pressure
    throatD:      0.240,   // m   -> feeds the EXISTING makeMotor()
    exitD:        1.740,   // m   -> areaRatio 52.6, a real vacuum bell
    efficiency:   0.96,    // dimensionless nozzle efficiency
    throttleMin:  0.40,    // dimensionless, 0 = cannot throttle down
    canShutdown:  true,    // false for solids — blocks rails warp while lit
    gimbalMax:    0.105,   // rad (6 deg), 0 = fixed nozzle
    gimbalRate:   0.70,    // rad/s slew limit
    ignitions:    3,       // -1 = unlimited
    ullageDelay:  0.15,    // s from stage command to full pc (solids 0.05)
  },
  // --- solid-only (null otherwise) ---
  grain: {
    outerD: 3.70, coreD: 1.40, length: 25.0, numSegments: 4, burnEnds: false,
    perimeterFactor: 3.5,  // NEW, REQUIRED — see C14. 1.0 BATES bore,
                           //   2.0 finocyl, 3.5 eleven-point star.
                           //   Multiplies ONLY the lateral term in
                           //   burningArea(). Without it a catalog SRB
                           //   produces ~0.9 MPa instead of ~6 MPa.
  },
  // --- tank-only ---
  tank: { volume: 42.0 },  // m^3. capacity_kg = volume * prop.bulkDensity
  // --- structural / thermal ---
  contactPoints: [],       // [{s, x}] m, body coords — see gap G4
  impactTol:     3.5,      // m/s, closing speed that destroys this part
  maxSkinTemp:   1200,     // K, burn-through threshold (gap G5)
  crashTol:      12,       // m/s, generic structural
  // --- authoring ---
  draw:  'engineBell',     // key into drawPartVector()'s dispatch
  teaches: 'areaRatio',    // concept id unlocked when this part first flies
};

/* ---------- 4. DESIGN — what the builder produces and localStorage holds - */
const DESIGN = {
  v:        3,             // schema version. loadDesign() migrates or drops.
  name:     'Kestrel II',
  parts: [{
    uid:     7,            // unique within design, monotonic, never reused
    defId:   'engine.vac.mid',
    parentUid: 4,          // -1 for root
    attach:  'bot',        // 'top'|'bot'|'radial'
    nodeIdx: 0,
    mirror:  false,        // radial pairs place two, mirrored in x
    // --- BAKED BY layoutRocket(design), never hand-authored (see C6) ---
    sTop:    18.40,        // m from nose tip, positive aft
    sBot:    21.50,        // m
    x:       0.00,         // m, lateral offset from the centreline
    // --- per-instance mutable loadout ---
    propKey: 'lh2',        // tanks: which propellant is loaded
    propMass0: 15120,      // kg at t=0 (tank.volume * bulkDensity)
  }],
  stages: [                // TOP OF LIST = NEXT TO FIRE (game-mechanics)
    { idx: 0, ignite: [12, 13], jettison: [], chute: [] },
    { idx: 1, ignite: [], jettison: [4], chute: [] },
  ],
  stagesLocked: false,     // set true on first manual edit; blocks auto-stager
  seed: 0,                 // mulberry32 seed for the A/B sandbox (gap G8)
};

/* ---------- 5. VEHICLE — derived, rebuilt on staging. Never serialised. -- */
const VEHICLE = {
  design:      DESIGN,
  liveUids:    [4, 7, 12], // parts still attached to THIS body
  stageIndex:  0,          // index into design.stages
  m:           41230,      // kg, CURRENT total mass (recomputed every substep)
  mDry:        4110,       // kg
  I:           2.84e6,     // kg*m^2 about the CURRENT centre of mass
  sCm:         11.62,      // m from nose tip — MARCHES AFT as tanks drain
  sCp:         14.05,      // m from nose tip, current Mach/alpha
  sNose:       0.0,        // always 0 by definition
  sTail:       21.50,      // m, total length
  lE:          9.88,       // m, sCm -> engine gimbal plane (moment arm)
  Sref:        2.545,      // m^2, pi/4 * Dmax^2
  Dmax:        1.80,       // m
  sPlanTot:    38.6,       // m^2, summed planform for the crossflow term
  props: { lh2: 15120, rp1: 0, ch4: 0, monoprop: 84 },  // kg remaining, by key
  propsMax: { lh2: 15120, rp1: 0, ch4: 0, monoprop: 84 },
  motors: [],              // live output of the EXISTING makeMotor(), one per
                           //   burning engine. Untouched engine model.
  tauRW:       1.6e5,      // N*m, reaction-wheel authority (gap G1)
  thrust:      0,          // N, this frame's total (for HUD/render/audio)
  mdot:        0,          // kg/s
  skinTemp:    288,        // K (gap G5)
  soot:        0,          // 0..1, drives sprite bucket + smoke colour
};

/* ---------- 6. STATE — the ONLY mutable simulation truth ----------------- */
const STATE = {
  t:        0,             // s, mission elapsed (T+)
  rx:       0,             // m, planet-centred inertial
  ry:       600000,        // m
  vx:       174.5,         // m/s, inertial (INCLUDES planet rotation at t=0)
  vy:       0,             // m/s
  theta:    Math.PI/2,     // rad, INERTIAL, CCW from +x, UNWRAPPED.
                           //   The ONLY stored angle (see C5).
  omega:    0,             // rad/s, clamped |omega| <= 20
  spinCount: 0,            // int, whole turns removed when |theta| > 1000
  mode:     'INTEGRATED',  // 'INTEGRATED' | 'RAILS' | 'LANDED'
  phase:    'PAD',         // 'PAD'|'ASCENT'|'COAST'|'ORBIT'|'ENTRY'|
                           //   'DESCENT'|'LANDED'|'DESTROYED'
  gimbal:   0,             // rad, actual deflection this frame (rendered)
  throttle: 1.0,           // 0..1, commanded
  warp:     1,             // 1|2|3|4 phys, or 5..100000 rails
  contact:  false,
  seed:     0x9E3779B9,    // mulberry32 (gap G8)
};

/* ---------- 7. CTL — player/autopilot intent. Written by input ONLY. ----- */
const CTL = {
  omegaCmd:   0,           // rad/s TARGET rate, clamped +/-0.6. A/D, pads
                           //   and SAS ALL write only this (see C4).
  throttleCmd: 1.0,        // 0..1
  sasMode:    'off',       // 'off'|'hold'|'pro'|'retro'|'radial'|'guide'
  rcsOn:      false,
  suppressThrottleUntil: 0, // ms, the Ctrl+Z / Ctrl+Z collision guard
};

/* ---------- 8. SNAPSHOT — rewind + replay ring. ONE ring at 4 Hz x 1800. - */
const SNAPSHOT = {           // ~120 bytes. Parts are RECONSTRUCTIBLE, so
  t: 0, rx: 0, ry: 0,        //   NO part state is stored (see C10).
  vx: 0, vy: 0, theta: 0, omega: 0,
  stageIndex: 0,
  props: { lh2: 0, monoprop: 0 },   // kg by key
  throttle: 0, gimbal: 0, skinTemp: 288, phase: 'ASCENT', seed: 0,
};

/* ---------- 9. CAM — world -> screen. Camera is in METRES. -------------- */
const CAM = {
  x:       0, y: 600000,   // m, look-at point in world coords (f64)
  logPpm:  Math.log(8.0),  // ALWAYS interpolate in log space (visual-realism)
  ppm:     8.0,            // px per metre, = Math.exp(logPpm)
  rot:     0,              // rad, screen rotation (0 = world +y is up)
  shake:   0,              // 0..1, forced to 0 when BODY.pa(alt) < 100 Pa
  mode:    'FLIGHT',       // 'FLIGHT'|'MAP' — MAP is a CO-STATE, physics runs
  blend:   0,              // 0..1 flight->map transition, animated over 1.1 s
  // Anchors as FRACTIONS OF BODY, not absolute km — required for C1 to work
  // on both worlds: [alt/zAtm, ppm] log-log interpolated.
  anchors: [[0, 8.0], [0.02, 1.2], [0.29, 0.10], [2.14, 0.0035], [28.6, 1.8e-4]],
  stageRect: { cx: 0.50, cy: 0.46, w: 0.60, h: 0.55 },  // fractions; on
                           //   viewport height < 700 px -> cy .40, h .40
};

/* ---------- 10. TELEM — read-only frame. The ONLY thing education sees. -- */
/* Built once per physics tick. No education/HUD/audio code may read STATE or
   VEHICLE directly. This is what keeps the education layer deletable.      */
const TELEM = {
  t: 0, met: 0,            // s
  alt: 0,                  // m, geometric above surface (|r| - BODY.R)
  altAgl: 0,               // m, above local terrain
  V: 0,                    // m/s, INERTIAL speed
  Vsurf: 0,                // m/s, relative to the rotating atmosphere
  vVert: 0, vHoriz: 0,     // m/s, local frame
  mach: 0, q: 0,           // dimensionless; Pa
  aoa: 0,                  // rad, NaN when Vsurf < 30 (education pitfall)
  pitch: 0,                // rad from LOCAL VERTICAL — the derived display
                           //   angle, from pitchFromVertical(). NOT theta.
  fpa: 0,                  // rad, flight path angle
  thrust: 0, mass: 0, twr: 0,   // N; kg; dimensionless
  accel: 0, gLoad: 0,      // m/s^2; g
  pc: 0, pe: 0, pa: 0,     // Pa. pe is peIdeal() — UNCLAMPED (see C15)
  separated: false,        // isSeparated(), for the HUD warning
  ispNow: 0,               // s, live from the nozzle model at current pa
  dvRemain: [0, 0],        // m/s per remaining stage (Tsiolkovsky)
  sma: NaN, ecc: NaN, apR: NaN, peR: NaN,   // m, dimensionless, m, m.
                           //   NaN (never Infinity) when energy >= 0 or
                           //   onGround — HUD renders NaN as an em dash.
  tToAp: NaN, tToPe: NaN,  // s
  onGround: true, stageIndex: 0, warp: 1, mode: 'INTEGRATED',
  skinTemp: 288, qConv: 0, // K; W/m^2
  staticMargin: 1.4,       // calibers, (sCp - sCm)/Dmax
  // dv ledger — accumulated INSIDE the single Verlet force eval + the drag
  // operator. MUST close: |ideal - (grav+drag+steer) - V| / V < 0.01 (C2).
  dvIdeal: 0, dvGrav: 0, dvDrag: 0, dvSteer: 0,   // all m/s
};

/* ---------- 11. EVENT — the one bus. Everything downstream subscribes. -- */
const EVENT = {
  type: 'staging',   // 'liftoff'|'staging'|'meco'|'burnout'|'maxq'|'apoapsis'|
                     // 'orbit'|'entry'|'chute'|'touchdown'|'destroyed'|
                     // 'warpBlocked'|'checkpoint'
  t: 142.6,          // s
  cause: 'impact',   // machine-readable
  // Failure events MUST carry all three (game-mechanics, non-negotiable):
  actual: 41.2, needed: 6.0, unit: 'm/s',
  msg: 'Touchdown at 41.2 m/s. Landing legs rated 6.0 m/s.',
  fix:  'Deploy the chute above 2 km, or land under power below 6 m/s.',
};
```


## Scope Ruling

ONE HTML FILE, REALISTICALLY ~9,000-12,000 LINES. The six specs together describe roughly 25,000 lines. Cutting is the job, and the cut principle is: KEEP EVERYTHING THE PHYSICAL ENGINE MODEL CAN TEACH; CUT EVERYTHING THAT IS CONTENT VOLUME.

MUST-HAVE CORE (the game is not the game without these):
1. Verlet physics core with operator-split analytic drag, US76 atmosphere, rotating scaled home world, Kepler rails. (C2, C12, C1)
2. The existing engine model, untouched, PLUS: the flow-separation clamp, peIdeal/isSeparated split, and grain.perimeterFactor. (C14, C15)
3. Full-bleed Canvas world renderer: metres-based log-zoom camera, sky/star field, cached rocket sprite, pressure-derived plume, particles, pad cloud, shake/flash/exposure. visual-realism's steps 1-6 verbatim — this IS "the video."
4. Two-layer attitude control: rate command + gimbal/RCS/reaction wheels. (C4, G1)
5. Staging with real graph-split, off-CoM separation impulse, inertia recompute, ignition delay.
6. PHYS warp 1-4x + RAILS with hard gates + warp-to-Ap/Pe buttons. (C3)
7. Attitude Ring + pitch tape (NO navball), SIMPLE HUD tier, seven touch controls, clear stage rectangle.
8. Failure layer: named cause + actual + needed + fix, slow-mo impact, debrief with the dv loss ledger, 4 Hz ring buffer serving rewind AND replay AND Ctrl+Z. (C9, C10)
9. Builder: 14 parts, snap nodes, live CoM/CoP, per-stage dv/TWR, auto-stager, never-disabled LAUNCH.
10. Reentry heating with a real skin temperature + plasma sheath render. (G5)
11. Landing geometry: contact points, impact tolerance, tip-over. (G4)
12. WebAudio: plume roar that fades with ambient density. (G3)
13. Adaptive quality controller with manual override. (G9)
14. The existing Test Stand, retained as a builder sub-mode. (G12)

NICE-TO-HAVE (build only if the core is genuinely done and stable):
- HUD density tiers STANDARD/FULL and hoverable formula tooltips.
- A/B ghost sandbox on concept cards.
- Orbital contracts beyond "reach orbit". (G13)
- Cloud decks you punch through; heat shimmer; city lights.
- Design sharing as copyable JSON.
- Boiloff; monoprop RCS as a consumable rather than free.
- Keyboard builder path (promote to must-have if accessibility is a stated requirement).

CUT, DECISIVELY, AND DO NOT NEGOTIATE:
- 25-part catalog -> 14. Two pods, three tanks (S/M/L), three engines (sea-level, vacuum, upper), one SRB, decoupler, fairing, fin, leg, chute. Every remaining part must teach something the engine model computes; the other eleven are duplicates at different sizes.
- 10 missions -> 5. Get off the pad / reach 20 km / go supersonic without flipping / reach orbit / return and land. Ten missions is content volume, not learning.
- ~40 CAPCOM callouts -> 18. The 16-concept ladder -> 9.
- MANEUVER NODE PLANNER: cut entirely. This is the single largest complexity sink in the plan (node state, dv vectors on a conic, drag-to-edit on a projected orbit, predicted post-burn conic, warp-to-node). The Hohmann lesson is fully teachable with "burn prograde at apoapsis" callouts plus the live Ap/Pe readout. Ship warp-to-Ap/Pe; ship no node editor.
- THE MOON, other bodies, SOI transitions, patched conics. Single-body only. BODY.soiR stays Infinity in v1. This deletes an entire second physics regime.
- Docking, rendezvous, EVA, science, career, funds, part unlocks.
- Electricity/battery/solar. Reaction wheels are free. (G2)
- classifyMotor()'s amateur A-P impulse letters on the game path.
- Replay export, screenshot capture, any file download (the sandbox makes them inert anyway).
- Terrain beyond a flat rotating surface with a launch pad and one visual landmark. No mountains, no biomes.
- The 1-D RK4 simulateFlight() ascent path: it is superseded and keeping two integrators guarantees they diverge. Delete it when step 4 lands.

THE HARD RULE: if a feature does not either (a) make the launch look real, (b) make a number in the HUD mean something physical, or (c) produce a named failure the player can fix, it does not ship in v1.


## Build Order

1. STEP 0 — CONVENTIONS BLOCK + fmt LAYER. Paste the shared shapes above as a literal comment header at the top of the script, then write BODY (both worlds), the US76 pa/rho/temp/sos functions with the atmScale factor, mulberry32, wrapPi, clamp, and the entire fmt* module. Assert BODY.pa(0) === 101325 on both worlds. Nothing else may be written until this exists — every later module reads it, and retrofitting units is the most expensive possible mistake in a single-file build.
2. STEP 1 — ENGINE ADAPTER (do not rewrite the engine). Keep lines 383-509 of the existing file verbatim. Add ONLY: (a) airDensity/ambientPressure become one-line delegators to BODY.rho/BODY.pa; (b) grain.perimeterFactor multiplying the lateral term in burningArea(); (c) peIdeal() exported unclamped, the Summerfield separation clamp applied inside thrustCoefficient(), and isSeparated() exported; (d) FUEL_PRESETS extended with bulkDensity/tankDryFrac/ofRatio/boiloffRate/plumeOpacity/plumeColor/sootFactor. DEV ASSERTS HERE, NOT LATER: hobby default still gives pc = 2.9 MPa; every catalog solid gives 3 < pc(0) < 12 MPa; the vacuum bell gives positive sea-level thrust; Tsiolkovsky closes at 1000 kg -> 400 kg, Isp 300 s, = 2696 m/s.
3. STEP 2 — PHYSICS CORE, HEADLESS, NO RENDERER. Verlet kick-drift-kick at h=1/120, analytic drag operator, analytic rotational damping, gravity, thrust, Allen-Perkins normal force, aero torque, jet damping. Event truncation at burnout/staging/contact. NaN snapshot-and-halve recovery. The dv ledger accumulates in the SAME force eval, with dvDrag measured across the drag operator (C2). Validate in the console against three closed-form cases before drawing a single pixel: vacuum Tsiolkovsky, terminal velocity, and a circular orbit that does not decay over 20 simulated orbits.
4. STEP 3 — RAILS + KEPLER. Elements from the state vector with the e<1e-8 and h->0 branches and every acos clamped, conic back to r,v in the SAME frame rails is exited, and the entry/impact time cap taken BEFORE every rails step. Round-trip assert: r,v -> elements -> r,v must close to 1e-9 relative. Do this now, while the physics is still headless and testable — retrofitting rails after the renderer exists is how the silent teleport-through-planet bug ships.
5. STEP 4 — WORLD RENDERER FOUNDATION. Full-bleed canvas, the metres camera with log-space zoom and the fraction-of-BODY anchor table, f64 camera-origin subtraction before the transform, sky gradient in linear light, star field with computed starAlpha, flat ground with the sag>1.5px curvature gate. Feed it STATE from step 2 with a hardcoded rocket. DELETE the old rocketIcon div and the 170x170 flame-canvas in this step — do not let them coexist, or half the code will keep targeting them.
6. STEP 5 — VERTICAL SLICE: ONE HARDCODED ROCKET FLIES AND LOOKS REAL. drawPartVector() with the tangent ogive, swept fins, curved bell; the offscreen sprite cache; the pressure-derived plume (half-angle, outer length, opacity, shock cells from peIdeal/pa); particle system in typed SoA with the 1800 cap and pre-rendered puff sprites; pad split-plume and pad cloud; shake, flash, auto-iris. THIS IS THE PROJECT'S GO/NO-GO GATE. If the launch does not look convincing here, stop and fix it — every later feature is attached to this and the most common failure mode in this genre is building breadth on top of a flight that does not feel good.
7. STEP 6 — CONTROL. CTL as the single intent object, the rate-command outer layer, and the gimbal/RCS/reaction-wheel priority chain. event.code everywhere (never event.key), preventDefault on Space/Tab/arrows/F-keys, the Ctrl+Z vs Ctrl+Z throttle-collision guard with suppressThrottleUntil, pointercancel nulling touch rate. Now the slice is PLAYABLE and every subsequent feature can be evaluated by feel rather than by reading code.
8. STEP 7 — AUDIO. Do it here, immediately after control, not at the end. The plume roar with density-driven low-pass is 40 lines and it changes how every later feature is judged — you cannot evaluate whether staging feels good in silence. Gesture-gated, mute toggle, staging thump, warp tone.
9. STEP 8 — STAGING + VEHICLE REBUILD. Graph split, mass/inertia/sCm/lE recompute, separation impulse applied AT THE DECOUPLER STATION, ullage ignition delay, controller state fully reset on the event, debris vessels capped at 6. Assert after every separation that the upper stage's I dropped and that sCm moved.
10. STEP 9 — WARP. PHYS 1-4x substepping, RAILS with all five gate conditions (zero thrust AND no burning solid checked by CHAMBER PRESSURE not throttle AND alt > BODY.zAtm AND no chute AND not clamped), the universal dt_step > tToEvent/6 auto-drop, warp-to-Ap/Pe, the forced 1x below 500 m AGL with negative vSpeed, the visible blocked-reason chip, and emitRate *= 1/warp (C11).
11. STEP 10 — HUD + ATTITUDE RING. The derived-angle module (pitchFromVertical etc.) is written HERE and is the only place atan2 touches a state vector. Attitude Ring, pitch tape, throttle bar, tank gauges ordered stage-1-at-the-bottom, teal/amber/red status triad replacing the file's #0ca30c/#d03b3b, glyph+word doubling, 10 Hz string-diffed DOM writes, tabular-nums mono numerals, and the stage-rectangle intersection assert.
12. STEP 11 — TELEM + EVENT BUS + THE 4 Hz RING. Build the read-only TELEM frame once per tick, the single event bus, the 1800-slot snapshot ring, and the 8 full checkpoints. Everything downstream (education, audio cues, HUD, debrief, replay) subscribes here and NOTHING downstream reads STATE directly. Doing this before education rather than after is what keeps the education layer deletable.
13. STEP 12 — FAILURE + DEBRIEF + REWIND. Named causes with actual/needed/fix on every terminal event, predicted-contact slow-mo starting 0.15 s early, the debrief card, the four-bar dv loss ledger with the <1% closure assert wired to a visible dev warning, REWIND 20s / BACK TO PAD / REPLAY off the one ring buffer. The game is now COMPLETE AND SHIPPABLE with one hardcoded rocket. Everything after this is breadth, and if time runs out this is a defensible product.
14. STEP 13 — HEATING + LANDING GEOMETRY. Sutton-Graves into a skin temperature with radiative cooling, per-part maxSkinTemp burn-through, contact points, impact tolerance, tip-over, the settle-to-LANDED transition with the dt <= 0.5*sqrt(m/k) contact substep budget, and the plasma sheath render. Placed here because both close terminal conditions the failure layer already knows how to report.
15. STEP 14 — PART CATALOG (14 parts) + BUILDER. layoutRocket() assigning sTop/sBot is the first function written. Snap nodes, drawPartVector reused for palette thumbnails, live CoM/CoP with static margin evaluated at full/empty/M1.2, per-stage dv and TWR, auto-stager with stagesLocked, the pre-flight check card with FIX IT FOR ME and LAUNCH ANYWAY, the never-disabled LAUNCH button, and the keyboard placement path. Deliberately late, per game-mechanics: a builder attached to a rocket that flies badly is this genre's classic failure.
16. STEP 15 — MAP AS A CAMERA MODE. Not a state. Same canvas, animate ppm/overlay/conic-fade/sprite-to-icon over 1.1 s, analytic conic drawn from the current state vector (never an integrated point cloud), uniform eccentric anomaly sampling when e > 0.5, Ap/Pe markers as outline vs filled triangles, PiP of the flight view, four independent ways back. Physics keeps running and throttle/steering stay live.
17. STEP 16 — EDUCATION LAYER. The EDU module reading ONLY TELEM: 9 concepts, 18 callouts with the 6 s floor and the q>20 kPa suppression and the once-per-lifetime localStorage ledger (every access try/catch'd), 5 missions with held-for-duration goals reading BODY.* constants, the ascent pitch guide (gap G6), and the debrief diagnosis rules evaluated in a fixed order with exactly one match shown. Last because it is the only module that is genuinely deletable, and because writing it against a finished TELEM frame takes a third of the time of writing it against a moving one.
18. STEP 17 — POLISH PASS. Adaptive quality controller, reduced-motion handling that removes shake/flash/parallax but never freezes the sim, safe-area insets and touch-action:none, portrait layout, design JSON share with versioned migration, HUD tiers, the Test Stand sub-mode reconnected, and a final grep for: Math.random in visual code, event.key, atan2 outside the frames module, literal 70000/140000/6371000, createRadialGradient inside a loop, ctx.shadowBlur, and unguarded localStorage.
