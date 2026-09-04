# education

## Summary
Build the educational layer as one self-contained `EDU` module sitting beside the physics core (the same place `summarizeFlight()` lives in `/Users/elliot_jeong/rocket-sim/web/index.html`), driven entirely by a per-frame telemetry frame `s` and a per-flight ledger — never by hard-coded tutorial scripting. It has five surfaces: (1) a 16-step **concept ladder** where each idea is unlocked by the physical moment that proves it, not by a lesson menu; (2) a **CAPCOM callout** system of ~40 trigger→copy rules, one card at a time, bottom-left of the canvas, each firing at most once ever and then downgrading to a silent log chip; (3) a **10-mission ladder** from "get off the pad" to "orbit and return", each with a code-checkable goal and progressive hints; (4) **builder-time truth** — live per-stage Δv (Tsiolkovsky) and TWR, a Barrowman-lite CoP marker against a fuel-animated CoM marker with static margin in calibers, plus blocking-free warnings for rockets that will flip or won't lift; and (5) a **post-flight debrief** whose centerpiece is the Δv loss ledger — the exact identity `dV/dt = (T/m)cosα − D/m − g·sinγ` integrated into four bars (ideal Δv, gravity loss, drag loss, steering loss) so the player literally sees where their fuel went, next to a rule-matched diagnosis with a one-click fix. Non-patronizing comes from three things: every number the tutor would say is always visible in the HUD anyway (the tutor is redundant, not required), every concept fires exactly once in a lifetime, and a Guided/Hints/Off switch plus an auto-demotion rule that silently raises the skip level whenever a player clears a mission without needing a hint.

## Key Decisions
- Route ALL education through one read-only telemetry frame `s` built once per physics tick (fields listed in §0.1). No education code may read or mutate simulation state directly, and no trigger may be written against anything not in that frame — this is what keeps the physics core authoritative and the education layer deletable.
- Use a scaled home world (R = 600 km, mu = 3.5316e12, atmosphere top 70 km, ~3,400 m/s to orbit) as the default, with real Earth as an explicit 'Realism' toggle. All mission thresholds and the builder's Δv needle are written against the scaled numbers; a real-Earth default makes the first orbit take 9,400 m/s and kills the learning loop before it starts.
- Make the Δv loss ledger the centrepiece of the debrief, and compute it from the exact integrator identity dV/dt = (T/m)cosα − D/m − g·sinγ. Accumulate ideal/steering/drag/gravity every RK4 step. The four bars must sum back to the achieved speed within ~1% — assert this in dev; if it doesn't close, the physics and the ledger have diverged.
- Derive Isp in the builder from the EXISTING nozzle model at two ambient pressures (sea level and vacuum) rather than from a lookup table. The engine realism already built is the differentiator; showing the same nozzle producing different Isp at different altitudes, and flagging over-expansion when pe < 0.4·pa, is the payoff.
- Every teaching callout fires at most once per lifetime (`localStorage['rsx.edu.v1'].seen[id]`), then permanently downgrades to a one-line grey chip in the flight log. Coaching/safety callouts (AoA, low fuel, chute-too-fast) are once-per-flight instead. Wrap all storage access in try/catch and render correctly with an empty ledger.
- Enforce the redundancy rule: no callout may state a number the HUD doesn't already show. If a card needs a number the player can't otherwise see, add it to the HUD instead. This is the property that makes 'turn the tutor off' a real choice rather than self-sabotage.
- One callout card on screen at a time, bottom-left, never modal, never pausing the sim, auto-dismissing, Esc-dismissible, mirrored into an aria-live="polite" region. Suppress everything below priority 85 whenever q > 20 kPa — do not interrupt the player during the hard part of the ascent.
- Unlock all ten missions after M1 clears, and keep Free Flight and Sandbox on the main menu from the first second. The ladder is an ordering suggestion, not a gate; gating is what makes an educational game feel like homework.
- Show CoM and CoP as live markers with static margin in calibers, and compute the margin at three conditions — full tanks, empty tanks, and Mach 1.2 with an 8% forward CoP shift — warning on the WORST of the three. The 'stable now, unstable at burnout' case is the most common real flip and the least obvious to a builder.
- Never block a launch. Doomed rockets get a red BLOCKING warning and a button that reads 'Launch anyway'; the flight is the lesson, and the matching diagnosis is pre-written for the debrief.
- Ask one honest question on first run ('Have you flown one of these before?') with three answers mapping to guided/hints/expert, and auto-demote guided → hints after two missions cleared with no high-priority callouts and no hints requested. Never auto-promote in the other direction.
- Make every HUD number hoverable with a one-line explanation plus its formula in mono. This is the highest-value feature for expert players because it costs nothing until they reach for it, and it makes the tutor levels genuinely optional.
- Ship the staging comparison with the exact numbers (100 t / 2 t payload / Isp 300 s: one stage = 4,736 m/s, two stages = 2,696 + 3,686 = 6,382 m/s, +35%). Concrete arithmetic is the argument; a paraphrase of 'staging is efficient' teaches nothing.
- Give every concept card a 'Try this' one-click A/B sandbox that flies two rockets with a ghost overlay. Reading a card is not learning; watching two identical rockets diverge because of one changed parameter is.

## Pitfalls
- Δv ledger that doesn't close. If gravity/drag/steering losses are computed with a different g, different α convention, or on a coarser grid than the RK4 integrator, the four bars won't sum to the achieved velocity and the player will spot it. Accumulate inside the same derivative evaluation, use signed gravity loss (negative while descending), and assert closure within 1% in a dev check.
- Callout spam on the first flight. Six triggers can fire in the first 20 seconds (twr, liftoff, mach1, q_rising, max_q, accel_2g). Enforce the global 6 s floor, the per-flight budget, and the priority-preemption rule (p_new ≥ p_showing + 20) or the ascent becomes unreadable and the player mutes the tutor forever.
- Max-Q detection firing on integrator noise. Requiring only `q < prevQ` will trigger on any tiny dip. Require two consecutive decreasing ticks AND `prevQ > 5 kPa` AND altitude > 3 km, and report the peak value from the stored maximum, not the current tick.
- Barrowman used outside its validity. It is a subsonic, small-angle-of-attack method; a rocket showing 1.2 calibers in the builder can still flip transonically. Compute at Mach 1.2 with a forward CoP shift, warn on the worst case, and say the limitation in the tooltip rather than presenting the margin as a guarantee.
- Forgetting that CoM moves as tanks drain. A builder that only shows the full-tank CoM will call unstable rockets stable, then the debrief will blame the player for a flip the builder promised wouldn't happen. Ship the fuel slider and the marginAtEmpty warning together with the markers.
- Angle-of-attack noise at low speed. `aoa` is meaningless when the velocity vector is tiny, so it will spike wildly on the pad and at apogee. Gate every AoA trigger on `s.V > 30` (already in the frame builder) AND on `s.q > 5 kPa`, or the tumble warning fires while the rocket is sitting still.
- Orbital elements computed while on the ground or on a hyperbolic path. `sma` goes negative and `apR` goes infinite when energy ≥ 0, and periapsis is deeply negative on the pad. Guard every Ap/Pe trigger with `!s.onGround && s.alt > 1000`, and render Ap as '—' rather than a number when `en >= 0`.
- Praise inflation and mascot voice creeping in during copy review. The moment a line reads 'Great job! You did it!' the whole thing reads as a children's product and expert players leave. Apply the flight-engineer test to every string, and keep exclamation marks to at most three in the entire game.
- Mission goals evaluated on a single tick. `peAlt >= 75000` can be satisfied for one frame by integrator jitter mid-burn. Every orbital goal must be held for a stated duration (3 s for M7, 5 s for M8) before it counts, and the HUD should show the hold timer so the player understands why the mission hasn't ticked yet.
- Hard-coding mission thresholds against the scaled world and then shipping the Realism toggle. Every threshold in §3 (70 km, 120 km, 1,200 m/s, 3,400 m/s) must come from `BODY.*` and `ORBIT_DV` constants, or switching to Earth silently makes M4 impossible and M1 trivial.
- Blocking the launch button on a bad design. It feels protective and is actually the most patronizing thing in the whole spec — it takes away the failure that teaches. Warn hard, then let them fly, then diagnose.
- Heat model with an arbitrary limit. Sutton–Graves gives a heat *flux*, not a temperature; integrate it into a skin temperature with a plausible thermal mass and radiative cooling term, or the reentry lesson becomes a coin flip against a magic number and players learn superstition instead of physics.
- localStorage assumed to work. Thumbnail capture, private windows and blocked site data all throw on access. An unguarded read at module init will break the entire game, not just the tutor. Wrap every read and write, and make the default state a fully playable one.
- Callouts interrupting during high-Q steering. A card appearing over the canvas at the exact moment the player is fighting an angle-of-attack excursion causes the crash it was trying to prevent. Suppress p < 85 whenever q > 20 kPa, and never place a card where it can overlap the attitude indicator.
- Writing the debrief diagnosis rules unordered. Several conditions co-occur (out of fuel AND suborbital AND high gravity loss). Evaluate in the stated order, first match wins, and show exactly one diagnosis — three simultaneous explanations teach nothing.

## Full Spec

# The Educational Layer — Implementation Spec

## 0. Ground rules and where this plugs in

The existing file `/Users/elliot_jeong/rocket-sim/web/index.html` already has the physics core (`chamberPressure`, `thrustCoefficient`, `thrustN`, `massFlow`, `stateAtWeb`, RK4 `simulateFlight`, `summarizeFlight`) and a design token system (`--card`, `--accent`, `--ink-secondary`, Barlow Condensed / IBM Plex Sans / IBM Plex Mono). The education layer is **one new IIFE-scoped object, `EDU`**, added after the physics core and before the render loop. It touches physics through a read-only telemetry frame. It never modifies state.

```
PHYSICS (unchanged, authoritative)
   └─> buildFrame(state) ──> s   ── per tick ──>  EDU.tick(s)
                                                    ├─ EDU.callouts  (trigger rules)
                                                    ├─ EDU.mission   (goal + fail checks)
                                                    ├─ EDU.ledger    (Δv loss integration)
                                                    └─ EDU.concepts  (unlock ledger)
BUILDER  ── on any part change ──> EDU.analyze(design) ──> Δv/TWR/CoM/CoP/warnings
FLIGHT END ─────────────────────> EDU.debrief(flight)
```

### 0.1 The telemetry frame `s` (the single contract)

Every trigger in this document is written against this object. Build it once per physics tick; nothing else in the education layer is allowed to reach into physics.

```js
function buildFrame(st, prev, dt){
  const r   = Math.hypot(st.x, st.y);
  const R   = BODY.radius;
  const rh  = [st.x/r, st.y/r];                       // local "up" unit vector
  const V   = Math.hypot(st.vx, st.vy);
  const vUp = st.vx*rh[0] + st.vy*rh[1];              // radial (vertical) speed
  const vT  = Math.sqrt(Math.max(V*V - vUp*vUp, 0));  // tangential (horizontal) speed
  const g   = BODY.mu / (r*r);
  const rho = airDensity(r - R);
  const q   = 0.5*rho*V*V;                            // dynamic pressure, Pa
  // --- orbit solve, 2D, from r and v ---
  const h   = st.x*st.vy - st.y*st.vx;                // specific angular momentum (scalar)
  const en  = V*V/2 - BODY.mu/r;                      // specific orbital energy
  const sma = -BODY.mu/(2*en);
  const ecc = Math.sqrt(Math.max(0, 1 + 2*en*h*h/(BODY.mu*BODY.mu)));
  const apR = en < 0 ? sma*(1+ecc) : Infinity;
  const peR = sma*(1-ecc);
  return {
    t: st.t, dt,
    alt:   r - R,
    r, V, vUp, vT, g, rho, q,
    mach:  V / speedOfSound(r - R),
    pitch: angleBetween(st.bodyAxis, rh),             // 0° = nose straight up
    aoa:   V > 30 ? angleBetween(st.bodyAxis, [st.vx/V, st.vy/V]) : 0,
    gamma: Math.asin(clamp(vUp/Math.max(V,1e-6),-1,1)) * 180/Math.PI, // flight path angle
    omega: st.angularRate,                            // deg/s
    thrust: st.thrust, mass: st.mass, drag: st.drag,
    accelG: (st.thrust - st.drag)/st.mass/9.80665,
    twr:   st.thrust / (st.mass * g),
    throttle: st.throttle,
    stageIdx: st.stageIdx, stagesLeft: st.stages.length - st.stageIdx - 1,
    dvStage:  stageDeltaV(st),                        // m/s left in current stage
    dvTotal:  totalDeltaV(st),                        // m/s left in whole vehicle
    apAlt: apR - R, peAlt: peR - R, ecc, sma,
    tToAp: timeToApoapsis(st),                        // seconds, Infinity if descending past ap
    heatFlux: 1.83e-4 * Math.sqrt(rho/st.noseRadius) * V*V*V, // Sutton–Graves-ish, W/m²
    skinTempC: st.skinTempC,
    onGround: st.onGround, engineLit: st.thrust > 1,
    ev: st.eventsThisTick                             // ['stage','ignite','chute','touchdown',…]
  };
}
```

### 0.2 Home world constants (so all the numbers below are real)

Reaching orbit around a real Earth takes ~9,400 m/s and 8 minutes — too long for a first session. Use a **scaled home world** as the default and offer real Earth as a "Realism" toggle. All the mission numbers in this spec assume the scaled world.

| | Home (default) | Earth (Realism mode) |
|---|---|---|
| Radius `R` | 600 km | 6,371 km |
| Surface `g₀` | 9.81 m/s² | 9.81 m/s² |
| `mu = g₀R²` | 3.5316e12 | 3.986e14 |
| Atmosphere top | 70 km | 100 km |
| Scale height | 5,600 m | 8,500 m (reuse existing `SCALE_HEIGHT`) |
| Surface circular speed | 2,426 m/s | 7,905 m/s |
| Circular speed @ 80 km | 2,279 m/s | 7,858 m/s |
| **Realistic Δv to orbit** | **≈ 3,400 m/s** | ≈ 9,400 m/s |
| Typical gravity loss | 900–1,100 m/s | 1,500–2,000 m/s |
| Typical drag loss | 80–200 m/s | 100–300 m/s |

The 3,400 m/s figure is the "needle" on the builder's Δv bar. Hard-code `ORBIT_DV = 3400` for Home, `9400` for Earth.

---

## 1. The concept ladder

Ordered by **when the game can prove it**, not by textbook order. Each concept is a card in the *Flight Notes* drawer. A card is `locked` (grey, title visible, body hidden) until its `unlockWhen` fires, at which point it flips open with a 300 ms reveal and a `+1` on the drawer icon. The card body is the copy below, verbatim.

| # | Concept | The insight (player-facing, verbatim) | The moment it's taught | `unlockWhen(s, f)` |
|---|---|---|---|---|
| 1 | **Thrust vs. weight** | "A rocket only moves when its engines push harder than the planet pulls. Not 'a lot of thrust' — *more thrust than weight*." | First ignition, whether or not it leaves the pad. M1. | `s.ev.includes('ignite')` |
| 2 | **TWR** | "Thrust-to-weight ratio is thrust ÷ weight. Below 1 you sit there. At 1.0 you hover. Around 1.4–1.8 is the sweet spot — enough to climb without wasting fuel fighting the air." | Builder readout, then confirmed at liftoff. M1. | `s.ev.includes('liftoff')` |
| 3 | **Drag** | "Air pushes back with force proportional to *speed squared*. Double your speed and drag quadruples. This is why rockets don't just floor it." | First flight past 200 m/s inside the atmosphere. M2. | `s.V > 200 && s.rho > 0.3` |
| 4 | **Terminal velocity** | "Falling, you speed up until drag equals weight — then you stop speeding up. That's terminal velocity, and it's why a parachute works at all." | The unpowered fall back down in M1/M2. | `s.vUp < 0 && Math.abs(s.drag - s.mass*s.g) < 0.05*s.mass*s.g` for 2 s |
| 5 | **Max Q** | "Speed goes up, air gets thinner. Somewhere in the middle, the product peaks — that's max Q, the hardest the air ever pushes. After it, everything gets easier." | The `q` peak on any flight past ~15 km. M2. | max-Q detector fires |
| 6 | **Specific impulse** | "Isp is how many seconds one kilogram of propellant can make one kilogram of thrust. It's fuel efficiency. Hydrogen beats kerosene at it — but needs tanks four times bigger." | Comparing two propellants in the builder, or the first non-solid flight. M4. | second distinct `propellantId` flown |
| 7 | **The rocket equation** | "Δv = Isp × 9.81 × ln(wet mass ÷ dry mass). It's a logarithm, which is the cruel part: to double your Δv you must *square* your mass ratio." | Builder Δv bar, first time the player adds fuel and sees diminishing returns. M4. | player adds fuel ≥3× to one stage and watches Δv/kg fall |
| 8 | **Gravity losses** | "Every second you spend pointing straight up, gravity takes 9.8 m/s away from you. Hovering is the most expensive thing a rocket can do." | Post-flight ledger on the first steep flight. M4. | debrief where `gravityLoss > 0.25 * dvIdeal` |
| 9 | **Staging** | "Empty tanks are dead weight you're still paying to lift. Drop them and the equation restarts with a much better mass ratio — same launch mass, ~35% more Δv." | The first separation event. M5. | `s.ev.includes('stage')` |
| 10 | **Aerodynamic stability** | "The air pushes on your rocket at one point (centre of pressure) and gravity acts at another (centre of mass). If pressure is *ahead* of mass, the rocket swaps ends. Fins move pressure back." | Builder markers; proven by the first flip. M3. | builder opened with fins, or `s.omega > 90` in atmosphere |
| 11 | **Gravity turn** | "Tip over early and let gravity do the steering. A rocket that starts leaning at 1–2 km arrives at the top of the atmosphere already flying sideways — for free." | The pitch prompt at 1.5 km. M6. | pitch program used, `s.pitch > 20 && s.alt < 10000` |
| 12 | **Why you burn sideways** | "Orbit isn't about being high. It's about going sideways so fast that as you fall, the ground curves away underneath you at the same rate. Up buys you a view; sideways buys you an orbit." | The moment vertical speed goes negative on a straight-up flight. M6. | `s.vUp < 0 && s.apAlt < ATMO_TOP && !s.engineLit` |
| 13 | **Apoapsis & periapsis** | "Every unpowered path is an ellipse. The high point is apoapsis, the low point is periapsis. If periapsis is underground, that's not an orbit — that's a very long jump." | The map view lighting up above 70 km. M6/M7. | `s.apAlt > ATMO_TOP` |
| 14 | **Circularization** | "Raise the *other* side of your orbit by burning at the side you're on now. So to lift a periapsis that's underground, you burn at apoapsis — sideways, not up." | The apoapsis burn prompt in M7. | `s.peAlt > 0` first time |
| 15 | **Orbital velocity** | "Every altitude has exactly one circular speed: v = √(μ/r). Higher orbits are *slower* — but getting there costs energy. Climbing makes you slower and richer at the same time." | The Hohmann transfer in M9, when speed drops as altitude rises. | M9 first transfer burn completes |
| 16 | **Reentry heating** | "Coming home, your speed has to go somewhere, and it goes into heating the air in front of you — heat rises with velocity *cubed*. A blunt, light vehicle sheds it high up where the air is thin; a dense, pointy one carries it down to where the air is thick." | The M10 entry. | `s.heatFlux > 5e4` |

**Bonus cards** (unlocked, never prompted; for players who go looking): *Oberth effect*, *ballistic coefficient*, *inclination and launch site latitude*, *hydrolox tank volume penalty*, *throttling and combustion stability*, *why solids can't be shut off* (this one links to the existing footer copy — reuse it).

### 1.1 Micro-experiments ("Try this")

Every concept card gets a **Try this** button that loads a pre-built one-click sandbox. This is what turns a card from reading into learning. The sandbox opens in *Compare* mode: two rockets, ghost trajectory of the first, both flown at once.

| Concept | Try this (button copy) | What loads |
|---|---|---|
| TWR | "Fly the same rocket at TWR 1.05, 1.5 and 3.0" | 3 identical vehicles, throttle-limited to hit those ratios; overlay altitude-vs-time |
| Drag / max Q | "Fly it once with the nose cone, once without" | Cd 0.5 vs Cd 0.9, same everything else |
| Isp | "Same tank, four different fuels" | Solid / RP-1 / CH₄ / LH₂ at identical propellant *mass*, Δv side by side |
| Rocket equation | "Keep adding fuel and watch Δv stall" | Live slider: propellant 0→10× with the Δv curve drawn as you drag |
| Staging | "One stage vs. two, same 100 tonnes" | The exact table in §4.2 |
| Stability | "Move the fins up one metre" | CoP marker slides forward past CoM; flight flips at T+9 s |
| Gravity turn | "Straight up vs. tilt at 1.5 km" | Identical vehicles, two pitch programs, apoapsis + horizontal speed compared |
| Orbital velocity | "Two circular orbits: 100 km and 400 km" | Both drawn, speeds labelled, periods compared |
| Reentry | "Come in at −5° and at −30°" | Same entry speed, peak heat flux and peak g labelled |

---

## 2. Contextual callouts

### 2.1 The delivery rules (non-negotiable)

- **One card at a time.** A single slot, bottom-left of the flight canvas, 320 px wide, `--card` background, 3 px `--accent` left border, Barlow Condensed 11 px uppercase title, IBM Plex Sans 13 px body, all numbers in IBM Plex Mono. Fades in 180 ms, auto-dismisses after `4 + words/3` seconds (min 5 s, max 11 s).
- **Never modal, never pauses the sim.** Esc dismisses; clicking the pin holds it until dismissed.
- **`once: 'ever'`** for teaching callouts — persisted in `localStorage`. On a repeat trigger, write a one-line grey chip into the scrolling flight log instead (`MAX Q · 34.2 kPa · 11.4 km`) and do not open a card.
- **`once: 'flight'`** for safety/coaching callouts that stay useful (AoA, low fuel, chute-too-fast).
- **Cooldown** `cd`: minimum seconds since *any* card. Global floor 6 s.
- **Priority** `p` 0–100. A higher-priority trigger preempts a showing card only if `p_new ≥ p_showing + 20`.
- **Budget:** at level `guided` max 6 cards/flight; `hints` max 3; `off` = 0 cards (log chips still written).
- **aria-live="polite"** region mirrors every card for screen readers.
- Placeholders `{x}` are formatted by `fmt.*` helpers: `fmt.kPa(q)`, `fmt.km(alt)`, `fmt.ms(v)`, `fmt.deg(a)`, `fmt.kg(m)`, `fmt.n(F)`. All rounded to the precision shown in the copy below.

### 2.2 Pad and ignition

| ID | Fires when | Title | Body copy | Budget |
|---|---|---|---|---|
| `twr_below_one` | `s.ev.includes('ignite') && s.twr < 1.0` | NOT ENOUGH PUSH | "Your engines make {fmt.n(s.thrust)} of thrust. The rocket weighs {fmt.n(s.mass*s.g)}. Until thrust wins, nothing happens." · *[Open builder]* | flight · p95 · cd 0 |
| `twr_marginal` | `s.ev.includes('liftoff') && s.twr < 1.15` | BARELY FLYING | "TWR {s.twr.toFixed(2)}. You'll get off the pad, but so slowly that gravity eats most of the fuel. Aim for 1.4 to 1.8." | ever · p70 · cd 6 |
| `liftoff` | `s.ev.includes('liftoff')` (first ever) | LIFTOFF | "Thrust {fmt.n(s.thrust)} beat weight {fmt.n(s.mass*s.g)}. Everything from here is a race between fuel and gravity." | ever · p60 · cd 0 |
| `twr_high` | `s.ev.includes('liftoff') && s.twr > 2.5` | EAGER | "TWR {s.twr.toFixed(1)} — that's a hard launch. Above about 2 you're mostly paying to shove air out of the way, and max Q will be brutal." | ever · p55 · cd 6 |
| `solid_no_throttle` | throttle input while `engine.type==='solid'` | NO THROTTLE HERE | "Solid motors have no valve. Once the grain is lit, its own geometry decides the thrust curve — that's the price of their simplicity." | flight · p40 · cd 8 |

### 2.3 Atmospheric ascent

| ID | Fires when | Title | Body copy | Budget |
|---|---|---|---|---|
| `accel_2g` | `s.accelG > 2 && s.engineLit` | GETTING LIGHTER | "2 g and climbing on its own. Same thrust, less mass every second — a rocket accelerates hardest right before it runs dry." | ever · p45 · cd 8 |
| `mach1` | `prev.mach < 1 && s.mach >= 1` | MACH 1 | "{fmt.ms(s.V)} — you're outrunning your own pressure waves. Drag spikes here, then eases off on the other side." | ever · p55 · cd 6 |
| `q_rising` | `s.q > 20000 && s.q > prev.q && s.alt < 20000` | AIR PUSHING BACK | "Dynamic pressure {fmt.kPa(s.q)} and rising. If it gets rough, ease the throttle — you'll lose less to drag than you think." | flight · p50 · cd 10 |
| `max_q` | `prev.q > s.q && prev.q > 5000 && !fired` (2-tick confirm) | MAX Q | "{fmt.kPa(prev.q)} at {fmt.km(s.alt)}. That's the hardest the air will ever push on you. You're still speeding up — the air is just thinning faster." | ever · p75 · cd 4 |
| `aoa_high` | `s.aoa > 15 && s.q > 5000` for 0.7 s | TOO SIDEWAYS | "You're flying {fmt.deg(s.aoa)} off your nose at {fmt.kPa(s.q)}. The air is trying to grab the nose and swap ends. Steer gently." | flight · p85 · cd 8 |
| `aoa_critical` | `s.aoa > 35 && s.q > 10000` | LET GO OF THE STICK | "At this speed the air always wins. Stop steering, let the rocket point back along its flight path, then steer again." | flight · p95 · cd 5 |
| `tumbling` | `Math.abs(s.omega) > 45 && s.q > 5000` | TUMBLING | "Cut the throttle. With no thrust and less speed, drag on the fins can pull you straight again — thrust is what's driving the spin." | flight · p95 · cd 5 |
| `gravity_turn_window` | `s.alt > 1500 && s.alt < 3000 && s.pitch < 5 && s.V > 80 && s.engineLit` | TIME TO TILT | "Start leaning east now — 5 to 10 degrees is plenty. Straight up only buys altitude, and orbit is made of sideways speed." | ever · p80 · cd 6 |
| `turn_too_early` | `s.pitch > 35 && s.alt < 1200 && s.q > 10000` | TOO SOON | "That's a big lean in thick air. Down here the atmosphere punishes angles — come back toward vertical until you're above 2 km." | flight · p75 · cd 8 |
| `too_steep_high` | `s.alt > 40000 && s.pitch < 30 && s.engineLit && s.apAlt > 60000` | STILL POINTING UP | "You're above most of the air, so altitude is cheap now and speed is what you're short of. Pitch toward the horizon." | flight · p80 · cd 8 |
| `atmo_exit` | `prev.alt < ATMO_TOP && s.alt >= ATMO_TOP` | OUT OF THE AIR | "{fmt.km(s.alt)}. No more drag, no more heating, no more steering with fins. From here it's pure orbital mechanics." | ever · p70 · cd 6 |
| `max_g` | `s.accelG > 6` for 1.5 s | SIX G | "{s.accelG.toFixed(1)} g. Structures and crew have limits — if you don't need this acceleration, throttle back and save the airframe." | flight · p65 · cd 10 |

### 2.4 Space, orbit, and the shape of the path

| ID | Fires when | Title | Body copy | Budget |
|---|---|---|---|---|
| `ap_above_atmo` | `prev.apAlt < ATMO_TOP && s.apAlt >= ATMO_TOP` | APOAPSIS IS CLEAR | "Your high point is now {fmt.km(s.apAlt)} — above the air. Height is solved. Now you need *speed* when you get there." | ever · p80 · cd 6 |
| `apogee_straight_up` | `prev.vUp > 0 && s.vUp <= 0 && s.apAlt < ATMO_TOP && !s.engineLit` | THAT'S THE TOP | "{fmt.km(s.alt)}, and now you're falling. Straight up always comes straight back down. Orbit is sideways." | ever · p85 · cd 4 |
| `burn_at_ap_prompt` | `!s.engineLit && s.apAlt > ATMO_TOP && s.peAlt < 0 && s.tToAp < 25 && s.dvTotal > 50` | BURN COMING UP | "Apoapsis in {s.tToAp.toFixed(0)} s. Point at the horizon and burn there — that's what lifts the *other* side of your orbit off the ground." | flight · p85 · cd 10 |
| `burn_wrong_place` | `s.engineLit && s.peAlt < 0 && s.apAlt > ATMO_TOP && Math.abs(trueAnomalyDeg(s)) < 120` | WRONG SIDE | "Burning here mostly raises the far side of your path. To lift your low point, burn when you're *at* your high point." | flight · p70 · cd 12 |
| `pe_still_in_air` | `s.apAlt > ATMO_TOP && s.peAlt > 0 && s.peAlt < ATMO_TOP` | ALMOST | "{fmt.km(s.apAlt)} × {fmt.km(s.peAlt)}. Your low point is still inside the atmosphere, so drag will pull you down over a few laps. A little more speed at apoapsis fixes it." | flight · p80 · cd 10 |
| `orbit_achieved` | `prev.peAlt < ATMO_TOP && s.peAlt >= ATMO_TOP` | YOU'RE IN ORBIT | "{fmt.km(s.apAlt)} × {fmt.km(s.peAlt)}. You are now falling *around* the planet instead of into it. You can stop burning." | ever · p100 · cd 0 |
| `orbit_circular` | `s.ecc < 0.02 && s.peAlt > ATMO_TOP` | CIRCULAR | "Eccentricity {s.ecc.toFixed(3)} — near enough to a circle. Same altitude, same speed, all the way around, forever." | ever · p85 · cd 6 |
| `higher_is_slower` | after a transfer: `s.alt > markAlt+50000 && s.V < markV` | HIGHER, SLOWER | "You climbed {fmt.km(s.alt-markAlt)} and *lost* {fmt.ms(markV-s.V)}. Every altitude has one circular speed, and higher ones are slower." | ever · p75 · cd 8 |
| `oberth` | expert level only; burn with `s.alt < s.peAlt+5000 && s.V > 0.9*vAtPe` | FAST AND CHEAP | "Burning where you're already moving fastest adds the most orbital energy per kilogram of fuel. That's why escape burns happen at the low point." | ever · p50 · cd 12 |

### 2.5 Staging and fuel

| ID | Fires when | Title | Body copy | Budget |
|---|---|---|---|---|
| `stage_ready` | `s.dvStage < 1 && s.stagesLeft > 0` for 2 s | DROP IT | "This stage is empty. Right now it's just mass you're carrying uphill. Press SPACE to let it go." | flight · p90 · cd 4 |
| `staged_first` | `s.ev.includes('stage')` (first ever) | LIGHTER ALREADY | "You just threw away {fmt.kg(droppedMass)} of empty tank. The rocket equation only counts the mass you still have to push." | ever · p70 · cd 6 |
| `staged_early` | `s.ev.includes('stage') && droppedStage.dvLeft > 100` | STILL HAD FUEL | "That stage had about {fmt.ms(droppedStage.dvLeft)} of Δv left in it. Burn a stage dry before you drop it." | flight · p75 · cd 8 |
| `low_dv` | `s.dvTotal < 250 && s.peAlt < 0 && s.alt > 20000` | RUNNING LOW | "About {fmt.ms(s.dvTotal)} left. Circularizing from here needs roughly {fmt.ms(dvToCircularize(s))}. Spend it where it counts: at apoapsis, pointed at the horizon." | flight · p85 · cd 10 |
| `out_of_fuel` | `s.dvTotal < 1 && s.peAlt < 0 && !s.onGround` | TANKS DRY | "{fmt.km(s.apAlt)} × {fmt.km(s.peAlt)}. You're on your way back down. Next time: turn sideways earlier, or carry more Δv." | flight · p85 · cd 6 |
| `new_propellant` | first flight with a propellant id | {FUEL NAME} | "{isp} s of specific impulse — {comparison}. Isp is the exchange rate between propellant mass and Δv." (`comparison` e.g. "about 25% better than kerosene, but the tanks have to be much bigger") | ever · p55 · cd 8 |

### 2.6 Reentry, descent, landing

| ID | Fires when | Title | Body copy | Budget |
|---|---|---|---|---|
| `reentry_begin` | `s.vUp < 0 && s.alt < ATMO_TOP && s.q > 1000 && s.V > 1800` | REENTRY | "{fmt.ms(s.V)} into thickening air. All that speed has to turn into heat somewhere — better in front of you than inside you." | flight · p85 · cd 6 |
| `heat_warning` | `s.skinTempC > 0.75*HEAT_LIMIT` | GETTING HOT | "Skin at {s.skinTempC.toFixed(0)} °C. Heating rises with the *cube* of speed, so it will ease off fast as you slow down. Hold the shield forward." | flight · p90 · cd 6 |
| `entry_too_steep` | `s.gamma < -30 && s.alt > 50000 && s.V > 2500` | STEEP ENTRY | "Coming in at {fmt.deg(-s.gamma)} below horizontal. Steep means a short, violent heat pulse and high g. Shallower spreads it out." | flight · p80 · cd 10 |
| `terminal_velocity` | `s.vUp < 0 && Math.abs(s.drag - s.mass*s.g) < 0.05*s.mass*s.g` for 2 s | TERMINAL VELOCITY | "{fmt.ms(-s.vUp)} and holding. Drag now exactly balances weight, so you can't fall any faster. This number is set by your mass, area and shape — nothing else." | ever · p70 · cd 8 |
| `chute_too_fast` | chute input while `s.q > 30000` | TOO FAST FOR THE CHUTE | "{fmt.ms(s.V)} at {fmt.kPa(s.q)} would tear the canopy off. Wait until you're under about 250 m/s." | flight · p95 · cd 4 |
| `chute_open` | `s.ev.includes('chute')` (first ever) | CANOPY OUT | "Descent rate falling to {fmt.ms(predictedTerminal(s))}. Drag scales with area — a canopy twice as wide slows you down about 40% more." | ever · p60 · cd 6 |
| `landing_burn_now` | `stopDistance(s) > s.alt*0.9 && s.vUp < -20 && s.dvTotal > 0 && !s.engineLit` | BURN NOW | "At {fmt.ms(-s.vUp)} you need {fmt.km(stopDistance(s))} to stop and you have {fmt.km(s.alt)}. Waiting costs more fuel, not less." | flight · p95 · cd 3 |
| `touchdown_soft` | `s.ev.includes('touchdown') && s.V < 6` | TOUCHDOWN | "{s.V.toFixed(1)} m/s. Under 6 is a landing. Over 12 is a crater. You landed." | flight · p90 · cd 0 |

Helper: `stopDistance(s) = s.vUp*s.vUp / (2 * Math.max(s.thrustMax/s.mass - s.g, 0.1))`.

---

## 3. The mission ladder

Ten missions. Each is a plain object; the runner evaluates `goal(s, f)` every tick against live state `s` and the accumulating flight record `f`, and `fail(s, f)` for hard aborts. **Missions never block the sandbox** — Free Flight and Sandbox are on the main menu from the first second, and clearing M1 unlocks *all* missions (the ordering is a suggestion, not a gate).

Hints are progressive: `hint[0]` is shown in the briefing; `hint[1]` appears in the debrief after the first failure; `hint[2]` after the third, and includes a "Load a working design" escape hatch that puts a known-good rocket in the builder for the player to inspect and modify (never auto-flies it).

### M1 — "First Light"
- **Brief:** "Light the engine and get one kilometre off the ground. That's it. The hard part is making sure it can lift itself at all."
- **Goal:** `f.maxAlt >= 1000 && f.outcome !== 'destroyed'`
- **Hints:** [0] "Check the TWR number in the builder before you launch. It has to be over 1." [1] "TWR is thrust ÷ weight. Either add thrust (bigger throat, higher chamber pressure, more engines) or take away weight (less dry mass)." [2] "Aim for TWR between 1.4 and 1.8 — try dropping dry mass to 2 kg first."
- **Teaches:** thrust vs. weight, TWR, ignition, the flame and the noise.
- **Par:** any single stage.

### M2 — "Above the Weather"
- **Brief:** "Twenty kilometres. High enough that the air starts giving up. Watch the dynamic pressure gauge on the way."
- **Goal:** `f.maxAlt >= 20000 && f.outcome !== 'destroyed'`
- **Hints:** [0] "Watch the Q gauge. Somewhere around 8–12 km it will peak and then fall — that's max Q." [1] "More thrust isn't always more altitude down low: past about TWR 2 you're paying drag for it. Try a longer burn at lower thrust." [2] "A nose cone (Cd 0.4 instead of 0.75) is worth more altitude than an extra 20% of fuel here."
- **Teaches:** drag, max Q, terminal velocity on the way down, why Cd matters.

### M3 — "Arrow, Not a Dart"
- **Brief:** "Same 20 km, but this time keep the nose pointed where you're going. Maximum angle of attack under 12° the whole way up."
- **Goal:** `f.maxAlt >= 20000 && f.maxAoaInAtmo <= 12 && !f.tumbled`
- **Fail:** `f.tumbled === true` → immediate abort with the flip diagnosis.
- **Hints:** [0] "Open the stability panel in the builder. The blue marker (pressure) must sit *behind* the orange marker (mass)." [1] "Fins at the very bottom pull the centre of pressure back. Bigger fins pull it back further. Nose weight pulls the centre of mass forward." [2] "Aim for a static margin of 1.0–2.0 calibers — the builder shows it in body-diameters."
- **Teaches:** CoM vs. CoP, static margin, fins, why long rockets need help.

### M4 — "Out of the Air"
- **Brief:** "Get your apoapsis above 70 km — the top of the atmosphere. Straight up is allowed. It's also the most expensive way to do it, and the debrief will show you exactly how much it cost."
- **Goal:** `f.maxApAlt >= 70000`
- **Hints:** [0] "This needs roughly 1,600 m/s of Δv straight up. Check the Δv bar in the builder." [1] "Fuel choice matters now. Compare the Δv the builder shows for the same tank mass with kerosene vs. methane vs. hydrogen." [2] "Adding fuel has diminishing returns — Δv only grows with the *logarithm* of mass ratio. Losing dry mass is usually cheaper."
- **Teaches:** rocket equation, Isp, gravity losses (the debrief will show ~40% of Δv eaten by gravity).

### M5 — "Drop the Dead Weight"
- **Brief:** "120 km apoapsis, with a rocket that has at least two stages. Same idea as before, but stop carrying the empties."
- **Goal:** `f.maxApAlt >= 120000 && f.stageEvents >= 1`
- **Hints:** [0] "Build a big first stage and a small second one. Separate as soon as the first runs dry." [1] "A stage that still has fuel in it is a stage you separated too early — burn it to zero first." [2] "Try: stage 1 with 60% of your propellant and the heavy engine, stage 2 with 25% and a small high-Isp engine."
- **Teaches:** staging, mass ratio compounding, the exact 4,736 → 6,382 m/s comparison from §4.2.

### M6 — "Turn East"
- **Brief:** "Now go sideways. Get your apoapsis over 70 km *and* your horizontal speed over 1,200 m/s. Start tilting around 1.5 km and never fight the airflow."
- **Goal:** `f.maxApAlt >= 70000 && f.maxHorizSpeed >= 1200`
- **Hints:** [0] "Pitch over about 5° at 1.5 km, then keep pitching gradually so the nose follows your velocity vector. That's a gravity turn." [1] "If you see the angle-of-attack warning, you're steering harder than the air allows. Smaller, earlier inputs." [2] "By 40 km you should already be pitched 45° or more. If you're still near vertical up there, you turned too late."
- **Teaches:** gravity turn, why sideways, steering losses, AoA discipline.

### M7 — "One Lap"
- **Brief:** "Orbit. Get the apoapsis above the atmosphere, coast up to it, then burn sideways at the top until the *low* point of your path also clears the ground."
- **Goal:** `s.peAlt >= 75000 && s.apAlt >= 75000` held for 3 s
- **Hints:** [0] "Two burns. First one gets your apoapsis up. Then engines off, coast, and burn again *at* apoapsis, pointed at the horizon." [1] "Watch the periapsis number climb during the second burn. That's the number that decides whether you're in orbit." [2] "You need about 3,400 m/s total. If the builder shows less than that, you can't reach orbit no matter how well you fly."
- **Teaches:** apoapsis/periapsis, circularization, the two-burn ascent, orbital velocity.

### M8 — "Round Numbers"
- **Brief:** "A tidy circular orbit: both apoapsis and periapsis between 95 and 105 km. Small burns, patient hands."
- **Goal:** `s.apAlt>=95000 && s.apAlt<=105000 && s.peAlt>=95000 && s.peAlt<=105000 && s.ecc < 0.02` held 5 s
- **Hints:** [0] "Burning prograde raises the *opposite* side. Burning retrograde lowers it. Nothing you do changes the side you're on." [1] "Use 10% throttle for the last adjustments. Big engines make precision hard." [2] "If apoapsis is right and periapsis is low, go to apoapsis and burn prograde a little. Then check again."
- **Teaches:** orbit shaping intuition, prograde/retrograde, the "opposite side" rule.

### M9 — "Go Higher, Go Slower"
- **Brief:** "From your 100 km orbit, get to a circular 300 km orbit using exactly two burns. Watch your speedometer while you climb."
- **Goal:** `f.burnCount === 2 && s.apAlt>=290000 && s.peAlt>=290000 && s.ecc<0.03`
- **Hints:** [0] "Burn prograde once to raise apoapsis to 300 km. Coast all the way up. Burn prograde again at apoapsis to raise periapsis to match." [1] "That's a Hohmann transfer — the cheapest way between two circular orbits." [2] "Compare your speed at 100 km and at 300 km. Higher orbits are slower, even though getting there cost you fuel."
- **Teaches:** Hohmann transfer, orbital velocity vs. radius, Oberth (bonus card).

### M10 — "Coming Home"
- **Brief:** "Deorbit, survive the entry, and touch down under 12 m/s within 25 km of the pad. Everything you've learned, backwards."
- **Goal:** `f.outcome === 'landed' && f.touchdownSpeed <= 12 && f.downrangeFromPad <= 25000`
- **Fail:** `f.skinTempMax > HEAT_LIMIT` → burn-up diagnosis; `f.touchdownSpeed > 12` → crash diagnosis.
- **Hints:** [0] "Burn retrograde until your periapsis is around 20 km, then turn the heat shield forward and stop steering." [1] "A shallow entry (periapsis 25–35 km) spreads the heat over more time. A steep one (periapsis below 0) is quick and hot." [2] "Deploy the chute below 250 m/s, or keep 300 m/s of Δv for a landing burn. Not both — you can't afford both."
- **Teaches:** deorbit burn, reentry heating, ballistic coefficient, terminal velocity, landing.

### Post-ladder (open-ended, no hand-holding)
"Satellite Delivery" (release payload in a specified orbit), "Rendezvous" (match orbits with a target), "Moon Shot" (escape and free return). These appear as a separate *Contracts* board and deliberately ship with no hints — the ladder is over, the sandbox has begun.

---

## 4. Builder-time education

The builder is where most of the learning actually happens, because it's the only place the player can be wrong *before* it costs them a rocket. Everything below updates live on every slider drag (reuse the existing `updatePreview()` hook — it already runs on `input`).

### 4.1 The stage inspector

A vertical strip beside the rocket, one row per stage, top stage at the top:

```
┌─ STAGE 2 ─────────────────────────────────┐
│ Δv  2,140 m/s   ████████░░░░  vac         │
│ TWR 0.68 → 1.92        (vacuum)           │
│ 480 kg wet · 140 kg dry · ratio 3.43      │
└───────────────────────────────────────────┘
┌─ STAGE 1 ─────────────────────────────────┐
│ Δv  1,690 m/s   ██████░░░░░░  sea level   │
│ TWR 1.52 → 3.41        (sea level)        │
│ 2,400 kg wet · 620 kg dry · ratio 3.87    │
└───────────────────────────────────────────┘
  TOTAL Δv  3,830 m/s
  ├──────────────────────────┬──────┤
  0                       3,400   4,000
                        ORBIT ▲
```

**Maths, exactly:**

```js
// Stage i carries itself plus everything above it.
function stageMasses(stages, i){
  const above = stages.slice(0, i).reduce((m,st)=> m + st.dryMass + st.propMass, payloadMass);
  const m0 = above + stages[i].dryMass + stages[i].propMass;   // wet
  const mf = above + stages[i].dryMass;                        // dry
  return {m0, mf};
}
function stageDeltaV(stages, i, ambientPa){
  const {m0, mf} = stageMasses(stages, i);
  const e = stages[i].engine;
  const pc = e.type === 'solid' ? peakChamberPressure(e) : e.pcDesign;
  const F  = e.count * thrustN(e, pc, ambientPa);
  const md = e.count * massFlow(e, pc);
  const isp = F / (md * GRAVITY);              // seconds — the EXISTING physics, not a table
  return isp * GRAVITY * Math.log(m0/mf);
}
```

Critical detail: **compute Isp from the existing nozzle model, at two ambient pressures** — `SEA_LEVEL_PRESSURE` and `0` — and label which one each stage's Δv uses (first stage: sea level, upper stages: vacuum). This is where the engine realism you already built pays its educational dividend: the same nozzle shows a different Isp in vacuum and the player can *see* it, and can watch a big expansion ratio help in vacuum and hurt at sea level (over-expansion, `pe < pa`, negative pressure term in `thrustCoefficient`). Flag it:

> **OVER-EXPANDED AT SEA LEVEL** — "This nozzle's exit pressure is {fmt.kPa(pe)} against {fmt.kPa(101.3)} of air. It'll be pushed back on until you're higher. Great in vacuum, wasteful on the pad."

**TWR row** shows ignition → burnout: `TWR = F / (m0 * g_local)` and `F / (mf * g_local)`, with `g_local = mu/r²` at the altitude the stage lights (surface for stage 1). Colour bands: `< 1.0` critical red (`--status-critical`); `1.0–1.2` amber; `1.2–2.2` good (`--status-good`); `> 2.2` amber with the drag note. Upper stages use a different band: `> 0.4` is fine in vacuum, below 0.3 is flagged as "very slow" (long burns near apoapsis cause big steering losses).

**The Δv needle** is the single most valuable number in the builder. Draw the ORBIT marker at `ORBIT_DV` and put a tooltip on it: *"About 3,400 m/s gets you to orbit around this world: 2,280 for orbital speed, roughly 1,000 lost to gravity, 120 to drag. The losses are the part you can fly better."*

### 4.2 The staging lesson, with real numbers

Ship this as a fixed comparison card in the builder (the "Try this" for concept #9). Do not paraphrase — these numbers are the argument:

| Same 100 t launch mass, same 2 t payload, Isp 300 s | Wet | Dry | Ratio | Δv |
|---|---|---|---|---|
| **One stage** — 80 t propellant, 18 t structure | 100 t | 20 t | 5.00 | **4,736 m/s** |
| **Two stages** — S1: 60 t prop / 12 t dry | 100 t | 40 t | 2.50 | 2,696 m/s |
| — S2: 20 t prop / 6 t dry | 28 t | 8 t | 3.50 | 3,686 m/s |
| | | | | **6,382 m/s** |

Caption copy: *"Same mass on the pad, same payload, same engines — and 1,646 m/s more Δv, a 35% gain, purely from not carrying empty tanks to space. That's why every orbital rocket ever built has stages."*

### 4.3 Stability: CoM and CoP markers

Two markers on the rocket silhouette, always visible:
- **CoM** — filled orange circle with a cross (`--accent`), labelled `CoM`.
- **CoP** — hollow blue circle with a cross (`--series-pressure`), labelled `CoP`.
- Between them, a shaded bar with the margin in calibers: `STATIC MARGIN 1.4 cal`.
- A **fuel slider** ("Propellant remaining: 100% → 0%") that animates CoM as tanks drain. This is the insight most builders miss and the reason rockets flip late in the burn.

**CoM:** straightforward mass-weighted mean of every part's `mass * xCentroid`, with propellant treated as a separate item whose centroid sits at the tank's geometric centre and whose mass scales with the fuel slider.

**CoP — Barrowman-lite** (subsonic, small angle of attack; state that limitation in the tooltip):

```js
// Reference diameter d = max body diameter. Body tubes contribute ~0 normal force.
// Nose cone (ogive): CNa = 2, at X = 0.466*L  (cone: 0.666*L)
// Conical transition length L, from d1 to d2, starting at Xt:
//   CNa = 2*((d2/d)**2 - (d1/d)**2)
//   X   = Xt + (L/3)*(1 + (1 - d1/d2)/(1 - (d1/d2)**2))
// Fin set of N fins, root chord Cr, tip chord Ct, semispan s, sweep-adjusted
// midchord length Lf, body radius at fins rb, fin leading edge at Xf:
//   Kfb = 1 + rb/(s + rb)                       // body interference
//   CNa = Kfb * (4*N*(s/d)**2) / (1 + Math.sqrt(1 + (2*Lf/(Cr+Ct))**2))
//   X   = Xf + (Xr/3)*(Cr + 2*Ct)/(Cr + Ct)
//           + (1/6)*(Cr + Ct - Cr*Ct/(Cr + Ct))
// Then:
Xcp = Σ(CNa_i * X_i) / Σ(CNa_i);
staticMargin = (Xcp - Xcm) / d;                 // in calibers, positive = stable
```

Tooltip on the margin readout: *"Barrowman's method — accurate below Mach 1 and small angles. Above Mach 1 the centre of pressure moves forward, so a rocket that's barely stable subsonic can go unstable when it goes fast. That's why the game also checks it at your peak Mach."*

Recompute the margin at `Mach 1.2` with a +8% forward CoP shift and use the **worse** of the two for warnings. Also recompute at 0% fuel.

### 4.4 Builder warnings — exact copy

Warnings appear in a stack under the stage inspector. Three severities: **BLOCKING** (red, launch button says "Launch anyway"), **WARNING** (amber), **NOTE** (grey). Nothing is ever truly blocked — a player is allowed to launch a doomed rocket, because launching it is the lesson. But the diagnosis is pre-written and the debrief will say "we told you".

| Severity | Condition | Copy |
|---|---|---|
| BLOCKING | `stage[0].twrIgnition < 1.0` | **WON'T LEAVE THE PAD** — "TWR {twr}. Thrust {F} vs. weight {W}. Add thrust or remove mass — nothing else matters until this is over 1." |
| BLOCKING | `staticMargin < 0` (at any fuel level or Mach 1.2) | **THIS WILL FLIP** — "The air pushes ahead of the balance point, so the rocket will swap ends the moment it gets fast. Add fins at the bottom, or weight at the top." |
| BLOCKING | `webMax(grain) <= 0` (existing check) | **NO PROPELLANT** — "The core is as wide as the grain. There's nothing left to burn." |
| WARNING | `0 <= staticMargin < 0.75` | **BARELY STABLE** — "Margin {m} calibers. It'll fly, but any gust or steering input will get away from you. 1.0 to 2.0 is the comfortable range." |
| WARNING | `staticMargin > 3.5` | **OVER-STABLE** — "Margin {m} calibers. It'll weathercock hard into the wind and fight every turn you ask for. Big fins cost drag as well as control." |
| WARNING | `marginAtEmpty < 0.75 && marginAtFull >= 1.0` | **STABLE NOW, NOT LATER** — "As the tanks empty, the balance point moves to {x}. By burnout the margin is only {m} calibers. Most flips happen late in the burn." |
| WARNING | `stage[0].twrIgnition > 2.5` | **VERY EAGER** — "TWR {twr}. You'll hit max Q hard and spend a lot of fuel pushing air. Between 1.4 and 1.8 usually gets higher on the same propellant." |
| WARNING | `totalDv < ORBIT_DV && missionRequiresOrbit` | **NOT ENOUGH Δv** — "{dv} m/s aboard, about {ORBIT_DV} needed for orbit here. No amount of good flying closes a {gap} m/s gap." |
| WARNING | `upperStage.twrVac < 0.3` | **VERY SLOW UPPER STAGE** — "TWR {twr} in vacuum. The burn will take {t} s, which is long enough that you'll drift well past apoapsis while you're still pushing." |
| WARNING | `pe_exit < 0.4 * SEA_LEVEL_PRESSURE` on stage 1 | **OVER-EXPANDED AT SEA LEVEL** — "This nozzle's exit pressure is {pe} against {pa} of outside air, so the atmosphere pushes back into the bell. Great in vacuum, wasteful on the pad." |
| WARNING | `hasChute === false && missionRequiresLanding` | **NO WAY DOWN** — "No parachute and no landing engine. Whatever goes up is going to arrive at about {vTerm} m/s." |
| NOTE | `fins on any stage that only burns above 60 km` | **FINS IN VACUUM** — "There's no air up there for these to work on. They're {kg} kg of pure Δv penalty." |
| NOTE | `stage[0].dv > 0.65 * totalDv` | **BOTTOM-HEAVY** — "Your first stage carries {pct}% of the Δv. A more even split usually gets more payload up — try moving propellant to stage 2." |
| NOTE | `droppedDvIfStagedNow > 100` (live, during flight only) | see `staged_early` callout |
| NOTE | `chuteDiameter` gives touchdown > 8 m/s | **HARD LANDING EXPECTED** — "This canopy brings you down at about {v} m/s. Survivable, barely. A canopy 40% wider halves the impact energy." |

---

## 5. Post-flight debrief

Fires on `outcome ∈ {landed, crashed, destroyed, stranded, orbit, mission_complete}`. Replaces the existing `renderSummaryLaunch()`. It is a single scrollable panel, not a modal, and the "Fly again" button is focused so a player who wants nothing to do with it presses Enter and leaves.

### 5.1 Structure, top to bottom

**1. Verdict line.** One phrase + one sentence of diagnosis. Never "Great job!". Examples below in §5.3.

**2. The Δv ledger — the centrepiece.**

This is the whole educational thesis of the game in one graphic, and it is *exactly* correct rather than a heuristic, because it comes from the same identity the integrator uses:

```
dV/dt = (T/m)·cos α  −  D/m  −  g·sin γ
```

Integrate four accumulators every RK4 step (add to `derivative()` as a side channel or recompute in a post-pass over `points`):

```js
led.ideal    += (T/m) * dt;                       // what the engines could have given you
led.steering += (T/m) * (1 - Math.cos(aoaRad)) * dt;
led.drag     += (D/m) * dt;
led.gravity  += g * Math.sin(gammaRad) * dt;      // signed: negative while descending
// closure check (should be within ~1% of the RK4 result):
// led.ideal - led.steering - led.drag - led.gravity  ≈  V_final - V_initial
```

Render as a horizontal stacked bar:

```
YOUR ENGINES MADE 3,912 m/s OF Δv. HERE'S WHERE IT WENT.

████████████████████░░░░░░░░░░░░░░░░░░████░░░░░░░░
speed you kept 2,281  gravity 1,384   drag 187  steering 60

  Gravity took 35% of your fuel. That's what pointing up costs.
  Tilting over 20 seconds earlier would have kept about 300 of it.
```

The one-line coaching sentence under the bar is rule-selected:
- `gravity > 0.32*ideal` → "Gravity took {pct}% of your fuel. That's the price of pointing up. Start your turn earlier and lower."
- `drag > 0.08*ideal` → "Drag took {pct}%. That's high — you were going fast while the air was still thick. A gentler first stage (TWR ~1.5) or a better nose cone gets most of it back."
- `steering > 0.04*ideal` → "Steering waste: {dv} m/s. Every degree you fly off your velocity vector, part of the thrust pushes sideways instead of forward. Smaller, earlier inputs."
- all within budget → "That's an efficient ascent. Gravity {pct}%, drag {pct}%, steering {pct}% — close to what a real launch vehicle achieves."

**3. The numbers.** Reuse the existing `.spec-grid` component: Apoapsis · Periapsis · Max speed · Max Q (and altitude of it) · Max g · Max AoA · Peak skin temp · Δv used / Δv carried · Burn time · Downrange · Touchdown speed.

**4. Trajectory replay.** A small 2-panel widget: (a) the map view with the flown path and the final orbit ellipse; (b) a time-strip with event pips (ignition, max Q, staging, burnout, apoapsis, entry interface, peak heating, chute, touchdown). Hovering a pip scrubs both panels and shows the frame's numbers. Reuse the existing `TraceChart` hover machinery (`findIdxByTime`).

**5. Diagnosis card.** §5.2.

**6. Compare to your best.** Ghost overlay of the player's best previous attempt at this mission, with the three biggest deltas called out: *"vs. your best: +18 km apoapsis, −4% gravity loss, turn started 1.9 km lower."*

**7. Concept unlocked.** If this flight unlocked a card, show it here, once, with its Try this button.

### 5.2 Failure diagnosis rules

Ordered; first match wins. Each has a title, a cause sentence, a fix sentence, and a **one-click fix** that applies a concrete change in the builder and says exactly what it changed.

| # | Match | Copy |
|---|---|---|
| 1 | `f.maxAlt < 5 && f.thrust > 0` | **IT NEVER LEFT** — "Thrust {F} against a weight of {W}. TWR {twr}, and anything under 1.0 just sits there making noise." · *Fix: raise chamber pressure to {x} MPa (TWR 1.5)* |
| 2 | `f.tumbled && f.maxQAtTumble > 5000` | **IT SWAPPED ENDS** — "At {t} s the air was pushing ahead of the balance point, so the rocket weathercocked backwards. Static margin was {m} calibers at that moment." · *Fix: enlarge fins to {x} cm span (margin 1.4 cal)* |
| 3 | `f.tumbled && f.maxAoa > 30` | **YOU STEERED TOO HARD** — "{deg}° off the airflow at {kPa} of dynamic pressure. Past about 15° the air takes over and the rocket decides where it's pointing." · *Fix: enable the gravity-turn autopilot for one flight so you can watch the shape of it* |
| 4 | `f.structuralFailure && f.maxQ > Q_LIMIT` | **TORN APART** — "Max Q hit {kPa} at {km}. The airframe is rated for {limit}. You were going too fast, too low." · *Fix: cap first-stage TWR at 1.6* |
| 5 | `f.outcome==='stranded' && f.peAlt < 0 && f.apAlt > ATMO_TOP` | **ALL UP, NO SIDEWAYS** — "Apoapsis {km}, periapsis {km}. You reached space, but space isn't orbit — you never built up horizontal speed, so you fell straight back." · *Fix: load the pitch program that starts at 1.5 km* |
| 6 | `f.outcome==='stranded' && f.dvCarried < ORBIT_DV` | **NOT ENOUGH IN THE TANKS** — "You carried {dv} m/s and orbit here needs about {need}. Even a perfect ascent doesn't close a {gap} m/s gap." · *Fix: add a second stage (+{dv} m/s for +{kg} kg)* |
| 7 | `f.outcome==='stranded' && f.gravityLoss > 0.4*f.dvIdeal` | **BURNED IT ALL GOING UP** — "You had enough Δv on paper — {dv} m/s — but {pct}% of it went into fighting gravity while pointing near-vertical." · *Fix: start the turn at 1.5 km instead of {x} km* |
| 8 | `f.stagedWithFuelLeft > 200` | **DROPPED A FULL TANK** — "You separated stage {n} with {dv} m/s still in it. That fuel went in the ocean." · *(no auto-fix; the fix is the flying)* |
| 9 | `f.skinTempMax > HEAT_LIMIT` | **BURNED UP** — "Peak heating {MW} MW/m² at {km}, entering at {ms} and {deg}° below horizontal. Heating goes with the cube of speed — a steeper entry doesn't just get hotter, it gets *much* hotter." · *Fix: set the deorbit target periapsis to 30 km* |
| 10 | `f.outcome==='crashed' && f.chuteDeployed && f.touchdownSpeed > 12` | **CHUTE TOO SMALL** — "Down at {ms}. That canopy can only slow {kg} kg to about {ms}. Drag scales with area, so you need a wider one, not a stronger one." · *Fix: canopy {x} m (touchdown 5.5 m/s)* |
| 11 | `f.outcome==='crashed' && f.chuteRipped` | **CHUTE TORE OFF** — "Deployed at {ms} and {kPa}. Canopies survive up to about {kPa}. Fall a bit longer, let drag take the edge off, then pull." · *Fix: set auto-deploy at 250 m/s* |
| 12 | `f.outcome==='crashed' && f.dvAtImpact < 20 && f.hadLandingEngine` | **RAN OUT ON THE WAY DOWN** — "You needed about {dv} m/s to stop and had {dv}. The burn also started {m} m too late — waiting costs fuel, it never saves it." · *Fix: enable the landing-burn cue* |
| 13 | `f.outcome==='landed' && f.missionFailed && f.downrange > limit` | **RIGHT SPEED, WRONG PLACE** — "Down safely at {ms}, but {km} from the pad. Deorbiting {deg}° earlier in the orbit moves the landing point about {km} back." |
| 14 | success | see §5.3 |

### 5.3 Success copy (verdict lines)

Stated as facts about what happened, never as praise about the player:

- M1 — **OFF THE PAD.** "Peak {km} at {ms}. Thrust beat weight for {t} seconds, which is the entire trick."
- M2 — **THROUGH THE THICK PART.** "Max Q was {kPa} at {km}. Everything above that is easier air."
- M3 — **IT FLEW STRAIGHT.** "Maximum {deg}° off the airflow, and the fins put it back every time. Static margin held at {m} calibers."
- M4 — **ABOVE THE ATMOSPHERE.** "Apoapsis {km}. Gravity took {pct}% of your Δv getting there — that's the bill for going straight up."
- M5 — **TWO STAGES, {km}.** "You dropped {kg} of empty tank at {t} s and the second stage's mass ratio did the rest."
- M6 — **{ms} SIDEWAYS.** "Apoapsis {km} with {ms} of horizontal speed. That's most of an orbit — you're short about {ms}."
- M7 — **ORBIT.** "{km} × {km}. You are falling around the planet and missing it. That's all an orbit has ever been."
- M8 — **CIRCULAR.** "{km} × {km}, eccentricity {e}. Same speed all the way around."
- M9 — **300 KM.** "Two burns, {dv} m/s. You spent fuel to climb and you came out {ms} *slower*. Higher orbits are slower orbits."
- M10 — **HOME.** "Peak heating {MW} MW/m², touchdown {ms}, {km} from the pad. That's the whole loop, both directions."

---

## 6. Keeping it non-patronizing and skippable

Six mechanisms, in order of importance:

**6.1 The tutor is redundant by design.** Every number a callout mentions is *already on the HUD*: TWR, Δv remaining, q, Mach, AoA, apoapsis, periapsis, skin temp. The callout only says the sentence that connects them. Turning the tutor off therefore removes no information at all, which is what makes turning it off a real option instead of a self-sabotage. Verify this property for every callout you add: **if the card would tell the player a number they cannot otherwise see, add the number to the HUD instead of relying on the card.**

**6.2 Three levels, plus an honest first-run question.** On first launch, one screen, three buttons, no quiz:

> **Have you flown one of these before?**
> · **First time** — "Explain what's happening as it happens." → level `guided`
> · **I've played KSP or Spaceflight Simulator** — "Just the warnings and the numbers." → level `hints`
> · **I do this for a living** — "Nothing but telemetry." → level `expert`
> *(You can change this any time. Settings › Flight Notes.)*

| Level | Callout budget | Concept cards | Mission hints | HUD |
|---|---|---|---|---|
| `guided` | 6/flight, all rules | auto-open on unlock | hint[0] in briefing | labelled units, plain-language readouts |
| `hints` | 3/flight, `p >= 75` only | collect silently, badge on drawer | hints on request only | standard |
| `expert` | 0 cards; log chips only | all unlocked from the start | none shown | raw: `q`, `α`, `γ`, `Ap/Pe`, `e`, `Δv`, `T/W`, orbital elements panel, no unit words |

**6.3 Everything fires once in a lifetime.** `localStorage['rsx.edu.v1'].seen[id] = true`, checked before any `once:'ever'` card. After that the same trigger writes a grey one-line chip in the flight log. A player on their fortieth launch sees essentially nothing, without ever having touched a setting. Wrap all storage access in try/catch and render correctly with an empty ledger (private windows, cleared data):

```js
const EDU_KEY = 'rsx.edu.v1';
function loadEdu(){
  try { return JSON.parse(localStorage.getItem(EDU_KEY)) || defaults(); }
  catch(e){ return defaults(); }
}
function saveEdu(d){ try { localStorage.setItem(EDU_KEY, JSON.stringify(d)); } catch(e){} }
```

**6.4 Auto-demotion.** If a player clears any mission with **zero** callouts fired above priority 70 and no hints requested, increment `edu.competence`. At `competence >= 2`, silently drop `guided` → `hints` and show one small, dismissible toast: *"You clearly don't need the running commentary. Switched to warnings only — Settings › Flight Notes to change it back."* Never auto-promote in the other direction; if someone is struggling, offer hints in the debrief rather than turning the tutor back up on them.

**6.5 Copy rules — enforce these in review.**

- **Do:** state the physical fact, then the number, then (only if it's actionable) the fix. Second person. One or two sentences, ≤ 220 characters. Units always. Every claim traceable to something the simulation actually computed.
- **Don't:** "Remember", "As you learned", "Don't forget", "Great job!", "Oops!", "Uh oh", "Let's", exclamation marks (except the three genuine milestones: liftoff, orbit, touchdown — and even there, prefer a period), emoji anywhere in the flight HUD or callouts, rhetorical questions, mascots, anthropomorphised rockets, and any sentence that would survive being deleted.
- **The test for every line:** would a flight engineer say this to another flight engineer? If it would embarrass them, rewrite it. "Gravity took 35% of your fuel" passes. "Oops, looks like gravity got the better of you there!" does not.
- **Failure copy never blames.** Describe the physics, not the player. "The air was pushing ahead of the balance point" — not "you built it wrong".

**6.6 Learning on demand, always available.** For the player who skipped everything and then hits a wall:

- **Every HUD number is hoverable/tappable** and shows a one-line explanation plus the formula in mono. This is the single highest-value educational feature for expert-mode players because it costs them nothing until they want it. Copy for the main ones:
  - `TWR 1.52` → "Thrust ÷ weight. Above 1 it climbs. `T / (m·g)`"
  - `Δv 3,830 m/s` → "Speed change you can still make. `Isp·g₀·ln(m₀/m_f)`"
  - `Q 34.2 kPa` → "How hard the air is pushing. `½ρv²`"
  - `α 4.2°` → "Angle between your nose and where you're actually going. Keep it small when Q is high."
  - `Ap 118.4 km` → "The high point of your current path. Burning now raises it."
  - `Pe −340 km` → "The low point. Negative means it's underground — you're on a very long jump, not an orbit."
  - `e 0.041` → "How squashed the orbit is. 0 is a circle, 1 is a parabola."
  - `Isp 312 s` → "Seconds of thrust one kilogram of propellant can make. `F / (ṁ·g₀)`"
  - `γ −12.4°` → "Flight path angle: how far below horizontal you're travelling."
- **The Flight Notes drawer** holds every concept card, locked and unlocked, searchable, plus the existing "How this is modeled" footer copy promoted into it as *Under the hood* (it's already good; keep it verbatim and extend it with the orbital section).
- **A "Why did that happen?" button** on every failure debrief, which expands the diagnosis into the full concept card plus the Try this experiment. Opt-in, never expanded by default.

**6.7 What's never allowed:** modal tutorials, forced first-flight rails, a rocket you can't edit, "click here" arrows, XP bars, streaks, sound effects on callouts, a tutorial that fails you for deviating, or any card that appears while the player is actively steering at `q > 20 kPa` and `p < 85` — during the hard part of the ascent, only safety-critical callouts may interrupt.