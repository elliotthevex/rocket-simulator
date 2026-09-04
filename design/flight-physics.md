# flight-physics

## Summary
Use a planet-centered inertial 2D frame with state (r, v, θ, ω) plus per-stage propellant, and a three-mode propagator: velocity-Verlet with operator-split analytic drag (dt = 1/120 s under thrust or in atmosphere), plain Verlet in vacuum coast, and exact Kepler conic propagation "on rails" whenever thrust is zero and altitude is above the 140 km atmosphere top (which is what makes high time warp possible at all). Forces are inverse-square gravity, thrust along (θ + gimbal δ), and a wind-axis aerodynamic force built from a Mach-dependent axial coefficient table plus an Allen–Perkins normal-force model (C_N = C_Nα sinα cosα + η C_dc (S_plan/S_ref) sin α |sin α|) that stays valid through 360° of angle of attack. Torques are τ = −ℓ_e T sin δ (gimbal), x_cp,b · (−C_N q S_ref) (the flip mechanism: stable when CP is aft of CM), analytic linear pitch damping and quadratic tumble damping, plus jet damping −ṁ ℓ_e² ω. Atmosphere is the real US Standard 1976 layer model to 86 km with a log-linear density table to 140 km. The single most important structural decision is to apply drag and rotational damping in closed form inside each substep (v ← v_atm + w/(1 + k|w|dt)) rather than as explicit accelerations — that removes the entire class of "drag blows up at high dt" instabilities and lets substep budgets be driven only by mass-loss rate and rotation rate.

## Key Decisions
- Use a planet-centered inertial 2D frame with theta measured CCW from +x and kept unwrapped, and a station coordinate s measured from the nose tip positive aft, with x_b = s_cm - s as the single conversion between them. Every module (builder, physics, renderer, HUD) must use these two coordinates and nothing else.
- Apply drag and rotational damping in CLOSED FORM inside each substep rather than as explicit accelerations: v = v_atm + w/(1 + k*|w|*dt) and om *= exp(-Clin*dt/I), om = om/(1 + (Cquad/I)*|om|*dt). These are unconditionally stable at any dt and remove the entire drag-instability class, which is why the substep budget contains no drag term.
- Use velocity Verlet (kick-drift-kick) with operator-split analytic drag, not RK4. It is symplectic in the drag-free limit so parked orbits do not decay, it costs one force evaluation per step instead of four, and it does not straddle burnout/staging discontinuities across four inconsistent stages the way RK4 does.
- Implement three propagation modes with explicit switch rules: INTEGRATED (dt = 1/120 s, max 4x warp) whenever thrusting or below zAtm; RAILS (exact Kepler propagation, up to 100000x warp) when thrust is zero and z >= zAtm with no attitude input; LANDED (analytic reconstruction in the rotating frame) once contact settles. Rails is not an optimization, it is the only way to get high time warp.
- Cap every rails step below the next atmospheric-entry and impact time before taking it. Orbital elements remain perfectly valid after teleporting through the planet, so this failure is silent and corrupts the session with no error thrown.
- Model the normal force with Allen-Perkins (C_N = C_Nalpha*sin(a)*cos(a) + 0.7*1.2*(Splan/Sref)*sin(a)*|sin(a)|) so it stays valid through 360 degrees of angle of attack. A pure C_Nalpha*alpha model breaks exactly where a retropropulsive landing lives (alpha = 180 deg).
- Resolve the aerodynamic force into wind axes (C_D,wind = C_A*cos(a) + C_N*sin(a), C_L,wind = C_N*cos(a) - C_A*sin(a)) so the retarding component has the exact form v_dot proportional to -v^2 and can be integrated analytically.
- Apply the linear and crossflow normal-force components at DIFFERENT stations: tau = x_cp_b*(-C_N_lin*q*Sref) + x_cross_b*(-C_N_cross*q*Sref). One extra multiply, materially more correct at high alpha.
- Use the real US Standard Atmosphere 1976 layer model to 86 km (with the geopotential conversion h = Re*z/(Re+z)) plus a log-linear density table to 140 km. Tabulate density directly above 86 km because the mean molar mass drops there and rho = P/(Rs*T) stops holding.
- Use computed-torque control (tau_desired = I*(wn^2*e_theta + 2*zeta*wn*e_omega), then delta = asin(-tau_desired/(l_e*T))) rather than fixed PID gains. The plant gain varies by two orders of magnitude across a flight as T, I and l_e change; fixed gains are sluggish at liftoff and ring at burnout.
- Never use an integral term on attitude, and always slew-limit the gimbal to 20-60 deg/s. Reset all controller state on every staging event, where m, I, s_cm and l_e all jump at once.
- Use F = m*a with the instantaneous mass. Never write v = (m_old*v + F*dt)/m_new -- the thrust term already contains the momentum flux, and that form double-counts it with an error that grows with mass ratio.
- Recompute s_cm and I every substep, including propellant settling (s_prop = s_tank_center + (L/2)*(1-f)). This makes the CM march aft as tanks drain, which is the real reason static margin degrades through a first-stage burn.
- Default the campaign to a scaled Kerbin-like planet (R = 600 km, mu = 3.5316e12, zAtm = 70 km, 6-hour day) and offer Earth as hard mode. LKO costs ~2300 m/s instead of ~9400, so a player reaches orbit in their third session instead of their thirtieth; the physics code is byte-identical.
- Include planet rotation. It costs three lines (initial velocity, v_atm, LANDED reconstruction) and it buys free eastward launch dv, drifting ground tracks, a correct co-rotating atmosphere, and geostationary orbit as a named reachable target.
- Handle burnout, staging, parachute deploy and ground contact as discrete events by truncating the substep at the event time, applying the change, resetting controller and derivative caches, then continuing. Never let a substep straddle a discontinuity.
- Keep the max-Q flip. It emerges free from the CP/CM model with an e-folding time of sqrt(I/K), K = q*Sref*C_Nalpha*|s_cp - s_cm|, minimized exactly at max Q. It is the single best teaching moment available and must not be damped away.
- Subtract the camera origin in f64 before touching the canvas transform. Position magnitudes are ~6.4e6 m and f32 resolution there is ~0.5 m, so without this the rocket visibly quantizes while sitting on the pad.

## Pitfalls
- Variable-mass formulation error: writing v = (m_old*v + F*dt)/m_new instead of v += (F/m)*dt double-counts the exhaust momentum flux. It looks nearly correct at low mass ratio and is off by tens of percent at high mass ratio, so test it at 1000 kg -> 400 kg with Isp 300 s and check against Tsiolkovsky's 2696 m/s.
- Explicit drag is unstable when dt > 2m/(rho*V*Cd*A), which at max Q on a light upper stage can be under 1/60 s -- the velocity oscillates then diverges to NaN. Fix: the analytic substep v = v_atm + w/(1 + k*|w|*dt), which is bounded in (0,1] at every dt. If you keep an explicit path, clamp |a_drag*dt| <= 0.5*|w| and cap q at 5 MPa.
- Aerodynamic torque sign error makes a properly stable rocket flip. Assert directly: SM = +1.5 cal, alpha = +0.1 rad, q > 0, no other torques -> tau_aero must be POSITIVE (CCW, rotating b-hat toward w-hat). This one test catches most flip bugs.
- Missing wrapPi on the controller's angle error: theta_cmd - theta of -10 degrees computed as +350 degrees commands a full flip, and the rocket obediently flips. Every angle difference goes through atan2(sin x, cos x).
- Math.acos argument outside [-1,1] by ~2e-16 is routine and produces NaN that propagates silently through the entire orbital element set. Clamp at every call site.
- e -> 0 divides by zero in the eccentricity-vector true-anomaly branch, and the on-rails path produces exactly circular orbits. Branch at e < 1e-8 to argument of latitude. Separately, h -> 0 on a straight-up sounding flight gives p = 0 and the conic drawer returns 0/0.
- A rails step taken without capping against the next atmospheric-entry or impact time teleports the vehicle through the planet at high warp. The resulting elements are still valid so nothing throws -- it just silently corrupts the flight. Cap before stepping, always.
- RK4 evaluating its four stages across a burnout or staging event sees inconsistent thrust and mass and returns confident garbage. Truncate substeps at event times regardless of integrator; this is the specific reason Verlet is recommended over RK4 here.
- Carrying controller state across staging, where m, I, s_cm and l_e all jump at once, makes the loop slam the gimbal to the stop on a suddenly 5x lighter vehicle. Reset the integrator and invalidate the derivative cache on every discrete event.
- Fixed PID gains cannot cover the two-order-of-magnitude plant gain variation from liftoff to burnout -- they are sluggish early and ring late. Computed torque divides out I and l_e*T. Also enforce wn*dt < 0.2 and rate-limit the gimbal, or the controller chases numerical noise.
- Controller saturation from insufficient authority produces bang-bang oscillation that looks like a tuning bug but is not. Check l_e*T*sin(delta_max) > 1.5 * q_maxQ*Sref*C_Nalpha*|s_cp - s_cm|*alpha_design and surface it in the builder so the player learns at build time, not 40 seconds into flight.
- The penalty-spring landing contact needs dt < 2*sqrt(m/k); with k = 800*m*g0 that is 0.0226 s, so 1/120 has only 2.7x margin. Add dt <= 0.5*sqrt(m/k) to the substep budget while any contact is active, or a very light vehicle on stiff legs will explode on touchdown.
- Without a settle-to-LANDED transition the spring-damper leaves the vehicle micro-jittering on the pad forever -- it looks broken, burns CPU, and blocks time warp. Enter LANDED at |v| < 0.15 m/s and |omega| < 0.02 rad/s held for 0.5 s, then reconstruct position analytically in the rotating frame.
- Running predictNumeric every frame costs ~0.4 ms x 60 instead of x 4. Recompute at 4 Hz or on control change and interpolate the drawn line between updates.
- Sampling a trajectory uniformly in true anomaly crowds 90 percent of the points near periapsis on an eccentric orbit, so the apoapsis arc renders as a visible polygon. Switch to uniform eccentric anomaly for e > 0.5.
- Passing world coordinates (~6.4e6) straight into the canvas transform quantizes at ~0.5 m in f32, so the rocket visibly stutters while stationary. Subtract the camera origin in f64 first.
- An unclamped wallDt hands you a 30-second step after a tab switch, which at 4x warp is 120 s of simulation in one frame. Clamp to 0.25 s before multiplying by warp, and demote the warp level automatically if the substep loop hits its 400-iteration guard.
- Omitting the quadratic tumble damping term (Cquad = 0.5*rho*C_dc*2R*(L_fwd^4 + L_aft^4)/4) leaves a tumbling rocket spinning forever in thin air. Omitting jet damping (-mdot*l_e^2*omega) discards a free and meaningful stabilizer for the gimbal loop.
- A common misconception worth correcting in the UI text: nose MASS stabilizes (it moves CM forward, increasing static margin -- this is the classic model-rocket clay ballast fix). What destabilizes up front is nose AREA: wide fairings, capsules, canards and flares add C_Nalpha at a small station and pull the CP forward past the CM. Shipping the wrong version teaches players a false rule.
- Unwrapped theta reaching ~1e5 rad after a long tumble loses precision in Math.sin/cos. Re-wrap when |theta| > 1000 and carry the removed multiple in a separate spinCount for display. Separately, clamp |omega| <= 20 rad/s -- past that nothing is physical and it is the fastest route to NaN.
- Without NaN recovery a single bad state freezes the game permanently, which is a worse outcome than a lost rocket. Snapshot before each substep, restore and halve dt on non-finite state, and on a second failure destroy the vehicle with a structural-failure message.

## Full Spec

# Flight Physics Model — Implementation Spec

Target: 2D side-view rocket flight sim, single HTML file, Canvas 2D, vanilla JS, 60 fps.
Interfaces with the existing engine model unchanged: `stateAtWeb(motor, w, pa) → {ab, pc, mdot, thrust, propMass, kn}`.

Everything below is SI. JS `Number` is f64 — never put physics state in `Float32Array`.

---

## 0. Conventions (all modules must agree on these)

### 0.1 Frames

**PCI — planet-centered inertial.** Origin at planet center. `+x` right, `+y` up. Non-rotating. At `t = 0` the launch pad sits on the `+y` axis, so `r_pad(0) = (0, R_planet)`.

**Canvas.** Canvas `+y` is down. Render transform is `screenY = H/2 - (worldY - camY) * zoom`. Do the subtraction in f64 **before** handing anything to `ctx.transform` — `6.371e6 + 3.2` loses the 3.2 once it hits the canvas matrix, and that is exactly the jitter that makes a flight sim look like a toy.

**Body frame.** `x_b` points out the nose, `y_b` is 90° CCW from `x_b`.

```
b̂ = (cos θ, sin θ)        // nose direction, PCI
n̂ = (−sin θ, cos θ)       // body +y ("left"), PCI
```

**Station coordinate `s`.** Metres from the nose tip, **positive aft**. This is the rocketry convention and it is what Barrowman's formulas use. Every part carries `p.s` (its own centroid station).

Conversion between the two, used constantly:

```
x_b = s_cm − s            // positive = forward of CM
```

So a part aft of the CM has `x_b < 0`. A center of pressure aft of the CM has `x_cp,b < 0`. Memorize that sign; section 3 depends on it.

### 0.2 Angles

`θ` is measured **CCW from PCI +x**, and is kept **unwrapped** (it may run to ±40 rad after a tumble, so spin counts stay continuous). Wrap only differences:

```js
const wrapPi = x => Math.atan2(Math.sin(x), Math.cos(x));   // → (−π, π]
```

Derived display angles (compute, never store):

```js
const up   = {x: r.x/rmag, y: r.y/rmag};       // local vertical
const east = {x: -up.y,    y: up.x};           // +90° CCW from up = prograde for ω_p > 0

pitchFromHorizon = atan2(dot(b̂,up), dot(b̂,east));    // 90° = straight up, 0° = east
flightPathAngle  = atan2(dot(v̂,up), dot(v̂,east));    // γ
```

### 0.3 Angle of attack

Air-relative velocity `w = v − v_atm(r)`, `ŵ = w/|w|`.

```js
const sa = b̂.x*ŵ.y − b̂.y*ŵ.x;    // sin α  (2D scalar cross product)
const ca = b̂.x*ŵ.x + b̂.y*ŵ.y;    // cos α
const alpha = Math.atan2(sa, ca);  // ∈ (−π, π]
```

By construction, `ŵ` expressed in body coordinates is exactly `(cos α, sin α)`. `α = 0` is nose-first; `α = ±π` is tail-first (which is what a retropropulsive landing actually is, so the model must not break there — see 3.2).

### 0.4 State vector

```js
const S = {
  rx, ry,        // m,     PCI position
  vx, vy,        // m/s,   PCI velocity
  th,            // rad,   attitude, unwrapped
  om,            // rad/s, angular velocity (CCW +)
  t,             // s,     mission elapsed time
  stages: [ { web, propMass, ... } ],   // burn state per stage
  parts:  [ { T_K, shieldMass, hp } ],  // thermal + damage state
  mode,          // "INTEGRATED" | "RAILS" | "LANDED" | "DESTROYED"
  rails,         // orbital elements + epoch, valid only when mode === "RAILS"
  surf,          // {phi, z}, valid only when mode === "LANDED"
};
```

Mass is **derived**, never a primary state — `m = m_dry + Σ propellant`. Deriving it prevents the mass and the propellant bookkeeping from drifting apart across staging.

### 0.5 Vector helpers

```js
const V = {
  add:(a,b)=>({x:a.x+b.x, y:a.y+b.y}),
  sub:(a,b)=>({x:a.x-b.x, y:a.y-b.y}),
  mul:(a,s)=>({x:a.x*s,   y:a.y*s}),
  dot:(a,b)=> a.x*b.x + a.y*b.y,
  crs:(a,b)=> a.x*b.y - a.y*b.x,        // scalar z-component
  len:a => Math.hypot(a.x,a.y),
  perp:a => ({x:-a.y, y:a.x}),          // rotate +90° CCW
};
const clamp = (x,lo,hi) => x<lo?lo:(x>hi?hi:x);
```

---

## 1. Planet constants

Define the planet by radius and surface gravity, then derive μ. Deriving it this way makes surface gravity come out at exactly the number players expect, at the cost of 0.14 % in μ — take that trade.

```js
const PLANETS = {
  earth: {
    name:"Earth",
    R:   6371000,          // m, mean radius
    g0:  9.80665,          // m/s²  →  μ = g0·R²
    mu:  3.980448e14,      // m³/s²
    wp:  7.2921159e-5,     // rad/s  (sidereal)  → 464.6 m/s at equator
    zAtm: 140000,          // m, hard atmosphere top
    atmScale: 1.0,
    Tsurf: 288.15,
  },
  kerbin: {                // scaled planet — recommended default for the campaign
    name:"Kerbin",
    R:   600000,
    g0:  9.81,
    mu:  3.5316e12,
    wp:  2.9089e-4,        // 6-hour day → 174.5 m/s at equator
    zAtm: 70000,
    atmScale: 0.5,         // see 2.4
    Tsurf: 288.15,
  },
};
```

Sanity anchors the implementer can assert against:

| quantity | Earth | Kerbin |
|---|---|---|
| circular v at 200 km / 100 km | 7783 m/s | 2246 m/s |
| period at that altitude | 5305 s (88.4 min) | 1958 s (32.6 min) |
| escape v at surface | 11 180 m/s | 3431 m/s |
| geostationary radius | 42 164 km | 3468.6 km (alt 2868 km) |

Kerbin is strongly recommended as the default: LKO is ~2300 m/s of Δv instead of ~9400, so a player reaches orbit in their second or third session instead of their thirtieth. The physics code is byte-identical; only the constants change. Ship Earth as a "hard mode" planet.

---

## 2. Atmosphere

A single exponential is wrong by a factor of 3 at 40 km and a factor of 30 at 90 km, and it gets the speed of sound badly wrong everywhere above 11 km — which matters because the Mach-dependent drag curve is the whole point. Use the real layered model.

### 2.1 Constants

```js
const ATM = {
  g0:     9.80665,
  Rs:     287.0528,     // J/(kg·K) = R*/M for dry air
  gamma:  1.4,
  Re:     6356766,      // m, standard geopotential radius
};
```

### 2.2 Layers (US Standard Atmosphere 1976, valid to 86 km geometric)

Geopotential base altitude `h_b`, base temperature `T_b`, lapse rate `L`, base pressure `P_b`:

```js
// [ h_b (m), T_b (K), L (K/m), P_b (Pa) ]
const LAYERS = [
  [     0, 288.15, -0.0065, 101325.0    ],
  [ 11000, 216.65,  0.0,     22632.06   ],
  [ 20000, 216.65,  0.001,    5474.889  ],
  [ 32000, 228.65,  0.0028,    868.0187 ],
  [ 47000, 270.65,  0.0,       110.9063 ],
  [ 51000, 270.65, -0.0028,     66.93887],
  [ 71000, 214.65, -0.002,       3.956420],
  // upper bound of layer 6 is h = 84852 m  (z = 86000 m)
];
```

Within a layer:

```
T(h) = T_b + L·(h − h_b)

L ≠ 0:   P(h) = P_b · (T/T_b)^(−g0 / (Rs·L))
L = 0:   P(h) = P_b · exp(−g0·(h − h_b) / (Rs·T_b))

ρ = P / (Rs·T)
a = sqrt(γ·Rs·T)
```

Geometric altitude `z` → geopotential altitude `h`:

```
h = Re·z / (Re + z)
```

That conversion is one line and it is worth ~1 % at 80 km. Include it.

### 2.3 Above 86 km

Above 86 km the mean molar mass of air starts dropping, so `ρ = P/(Rs·T)` stops holding. Tabulate ρ directly and interpolate **log-linearly** (which is exactly piecewise-exponential with a fitted local scale height, and is C⁰ continuous):

```js
// [ z (m), rho (kg/m³), T (K), P (Pa) ]  — US Standard Atmosphere 1976
const UPPER = [
  [ 86000, 6.958e-6, 186.87, 0.37338   ],
  [ 90000, 3.416e-6, 186.87, 0.18359   ],
  [ 95000, 1.393e-6, 188.42, 0.075966  ],
  [100000, 5.604e-7, 195.08, 0.032011  ],
  [110000, 9.708e-8, 240.00, 0.0071042 ],
  [120000, 2.222e-8, 360.00, 0.0025382 ],
  [130000, 8.152e-9, 469.27, 0.0012505 ],
  [140000, 3.831e-9, 559.63, 0.00072028],
];
```

Above 86 km "speed of sound" is not physically meaningful (free-molecular flow), but the drag table needs *a* Mach number, so keep computing `a = sqrt(γ·Rs·T)` for continuity and clamp `M ≤ 25`.

At the 140 km top, drag on a 10 m², Cd = 0.3 vehicle at 7800 m/s is 0.35 N — six orders of magnitude below thrust. Cutting there is safe, and it gives a clean, honest boundary for the rails switch.

### 2.4 Implementation

```js
function atmosphere(z, planet){
  const top = planet.zAtm;
  if (z >= top) return {rho:0, P:0, T:559.6, a:600};
  if (z < 0) z = 0;

  // scaled planets: compress the altitude axis and shrink the effective gas
  // constant by the same factor, which keeps hydrostatic balance exact.
  const f  = planet.atmScale;         // 1.0 for Earth
  const ze = z / f;                   // "equivalent Earth altitude"

  let rho, P, T;
  const h = ATM.Re*ze/(ATM.Re + ze);

  if (h <= 84852){
    let i = 0;
    while (i < LAYERS.length-1 && h >= LAYERS[i+1][0]) i++;
    const [hb, Tb, L, Pb] = LAYERS[i];
    T = Tb + L*(h - hb);
    P = (Math.abs(L) > 1e-12)
      ? Pb * Math.pow(T/Tb, -ATM.g0/(ATM.Rs*L))
      : Pb * Math.exp(-ATM.g0*(h - hb)/(ATM.Rs*Tb));
    rho = P/(ATM.Rs*T);
  } else {
    let i = 0;
    while (i < UPPER.length-2 && ze >= UPPER[i+1][0]) i++;
    const [z0,r0,T0,P0] = UPPER[i], [z1,r1,T1,P1] = UPPER[i+1];
    const u = (ze - z0)/(z1 - z0);
    rho = r0*Math.pow(r1/r0, u);      // log-linear
    P   = P0*Math.pow(P1/P0, u);
    T   = T0 + (T1 - T0)*u;
  }

  // smootherstep taper to exactly zero over the top 10 km, so ρ and its
  // derivative are continuous at the rails boundary
  const band = 0.10*top;
  if (z > top - band){
    const s = (top - z)/band, wgt = s*s*(3 - 2*s);
    rho *= wgt; P *= wgt;
  }
  return {rho, P, T, a: Math.sqrt(ATM.gamma*ATM.Rs*T)};
}
```

**Why the `atmScale` trick is self-consistent, not a fudge.** Hydrostatics is `dP/dz = −ρg = −Pg/(R_s T)`. Compressing the altitude axis by `f` requires `R_s → f·R_s` to preserve `P(z)`. Physically that is "a heavier gas". Use `R_s,eff` for the pressure profile and real air (`γ = 1.4`, `R_s = 287.05`) for the speed of sound, and note the discrepancy in the tooltip — that is more honest than an arbitrary scale height. For Kerbin at `f = 0.5` this gives a surface scale height of 4215 m.

### 2.5 Values to assert against

| z (m) | ρ (kg/m³) | P (Pa) | T (K) | a (m/s) |
|---|---|---|---|---|
| 0 | 1.2250 | 101325 | 288.15 | 340.29 |
| 5 000 | 0.73643 | 54 048 | 255.68 | 320.55 |
| 11 000 | 0.36392 | 22 632 | 216.65 | 295.07 |
| 20 000 | 0.088035 | 5474.9 | 216.65 | 295.07 |
| 30 000 | 0.018410 | 1197.0 | 226.51 | 301.71 |
| 50 000 | 1.0269e-3 | 79.779 | 270.65 | 329.80 |
| 80 000 | 1.846e-5 | 0.8863 | 198.64 | 282.54 |
| 100 000 | 5.604e-7 | 0.032011 | 195.08 | 280.00 |

### 2.6 Co-rotating atmosphere

```js
const vAtm = {x: -planet.wp * r.y, y: planet.wp * r.x};   // ω_p ẑ × r
```

This matters: it is the reason an eastward launch is cheaper, and the reason a reentering capsule's ground track drifts.

---

## 3. Vehicle: mass properties and aerodynamic coefficients

### 3.1 Mass, CM, inertia

Recompute every substep. It is ~20 flops per part and it is what makes the flip mechanism dynamic instead of static.

```js
function massProps(veh){
  let m = 0, ms = 0;
  for (const p of veh.parts){
    const mp = partMass(p);            // dry + current propellant
    m += mp;  ms += mp * partStation(p);
  }
  const s_cm = ms / m;

  let I = 0;
  for (const p of veh.parts){
    const mp = partMass(p), d = partStation(p) - s_cm;
    I += mp*(p.L*p.L/12 + p.R*p.R/4) + mp*d*d;   // cylinder + parallel axis
  }
  return {m, s_cm, I};
}
```

**Propellant settling.** Under thrust, propellant sits at the aft end of its tank. With fill fraction `f = m_prop/m_prop_full`:

```
s_prop = s_tank_center + (L_tank/2)·(1 − f)
```

`f = 1` → tank center. `f → 0` → aft end. This makes the CM march aft as tanks drain, which is the real reason static margin degrades through a first-stage burn. It is three lines and it produces genuinely instructive behavior.

Tank part station is the mass-weighted blend of the dry shell (at tank center) and the settled propellant.

### 3.2 Aerodynamic coefficients

**Reference area** `S_ref = π/4 · D_max²` (largest body diameter). Everything is referenced to it.

**Axial force coefficient `C_A(M)`** — the transonic drag rise. Two profiles, log-linearly interpolated in M:

*Slender (fineness ratio 8–20, ogive or conical nose, boattail or plain base):*

| M | 0.0 | 0.20 | 0.40 | 0.60 | 0.80 | 0.90 | 0.95 | 1.00 | 1.05 | 1.10 | 1.20 | 1.50 | 2.00 | 2.50 | 3.00 | 4.00 | 5.00 | 8.00 | 25.0 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C_A | 0.300 | 0.300 | 0.310 | 0.325 | 0.355 | 0.420 | 0.580 | 0.750 | 0.800 | 0.780 | 0.720 | 0.600 | 0.480 | 0.420 | 0.380 | 0.320 | 0.300 | 0.280 | 0.270 |

*Blunt (capsule, heat shield forward):*

| M | 0.0 | 0.50 | 0.80 | 1.00 | 1.20 | 1.50 | 2.00 | 3.00 | 5.00 | 25.0 |
|---|---|---|---|---|---|---|---|---|---|---|
| C_A | 1.05 | 1.10 | 1.20 | 1.45 | 1.55 | 1.50 | 1.40 | 1.32 | 1.28 | 1.25 |

*Parachute (referenced to canopy area, not body area):* `C_D = 1.55` main, `0.60` drogue, ramped by an inflation factor over 1.2 s: `Cd_eff = Cd · smoothstep(t_since_deploy / 1.2)`.

```js
function tableLookup(tbl, x){
  if (x <= tbl[0][0]) return tbl[0][1];
  const n = tbl.length;
  if (x >= tbl[n-1][0]) return tbl[n-1][1];
  let i = 0; while (i < n-2 && x >= tbl[i+1][0]) i++;
  const [x0,y0] = tbl[i], [x1,y1] = tbl[i+1];
  return y0 + (y1-y0)*(x-x0)/(x1-x0);
}
```

Multiply by a builder-derived factor for fineness and base drag if you want more fidelity, but the table above is already a defensible slender-body drag rise.

**Normal-force slope `C_Nα` and CP station `s_cp` — Barrowman.** `C_Nα` is per radian, referenced to `S_ref`. Sum components; CP is the `C_Nα`-weighted mean station:

```
s_cp = Σ (C_Nα,i · s_i) / Σ C_Nα,i
C_Nα = Σ C_Nα,i
```

*Nose cone:* `C_Nα = 2` regardless of shape. CP station from the tip:

| shape | s_cp |
|---|---|
| cone | 0.666 · L_n |
| ogive | 0.466 · L_n |
| parabolic | 0.500 · L_n |
| blunt / hemispherical | 0.500 · L_n |

*Body tube:* `C_Nα = 0` (potential flow contributes nothing). The crossflow term in 3.3 handles the tube.

*Conical transition* from `d1` (fore) to `d2` (aft), length `L_t`, starting at station `s_t`:

```
C_Nα = 2·[(d2/D_ref)² − (d1/D_ref)²]
s_cp = s_t + (L_t/3)·[1 + (1 − d1/d2)/(1 − (d1/d2)²)]
```

A flare (`d2 > d1`) gives positive `C_Nα` aft → stabilizing. A boattail gives negative → destabilizing. Both are real.

*Fins*, `N` fins, semi-span `s_f`, root chord `C_r`, tip chord `C_t`, leading-edge sweep offset `X_t`, body radius `R_b` at the fin root, fin leading edge at station `s_LE`:

```
ℓ_m  = sqrt(s_f² + (X_t + C_t/2 − C_r/2)²)              // mid-chord line length

C_Nα_fins = 4·N·(s_f/D_ref)² / (1 + sqrt(1 + (2·ℓ_m/(C_r + C_t))²))

K_fb = 1 + R_b/(s_f + R_b)                              // body–fin interference
C_Nα_fins ← K_fb · C_Nα_fins

s_cp_fins = s_LE
          + X_t·(C_r + 2·C_t)/(3·(C_r + C_t))
          + (1/6)·[(C_r + C_t) − C_r·C_t/(C_r + C_t)]
```

*Compressibility correction* on `C_Nα` (Prandtl–Glauert, blended through the transonic):

```
M < 0.80:        k = 1/sqrt(1 − M²)
0.80 ≤ M ≤ 1.20: k = lerp(1/sqrt(1−0.64), 1/sqrt(1.44−1), (M−0.8)/0.4)   // 1.667 → 1.508
M > 1.20:        k = 1/sqrt(M² − 1)
k = clamp(k, 0.5, 3.0)
```

Apply `k` to fin `C_Nα` only (not the nose). This makes CP shift aft supersonically — which is real, and which is why a rocket that is marginal at Mach 0.9 is fine at Mach 3.

**Static margin** (report it in the builder UI, in calibers):

```
SM = (s_cp − s_cm) / D_ref          // positive = stable
x_cp,b = s_cm − s_cp = −SM·D_ref
```

Target 1.0–2.0 calibers. Below 0.5 the rocket is twitchy; below 0 it diverges.

**Planform area and crossflow centroid** (for the large-α model):

```
S_plan = Σ over body segments of (L_i · D_i)  +  Σ over fins of (N_exposed · fin planform)
s_cross = Σ (A_i · s_i) / Σ A_i        // planform-area-weighted centroid
x_cross,b = s_cm − s_cross
```

**Pitch damping sum** (section 3.4):

```
Σ_CNαx² = Σ_i C_Nα,i · (s_cm − s_i)²
```

Fins dominate this term, which is exactly why fins damp pitch oscillation as well as providing static stability.

### 3.3 The normal force at all angles of attack — Allen–Perkins

A pure `C_Nα · α` model is wrong above ~10° and catastrophically wrong at `α = 180°`, which is where a landing burn lives. Use slender-body plus crossflow:

```
C_N(α) = C_Nα · sin α · cos α  +  η · C_dc · (S_plan/S_ref) · sin α · |sin α|

η    = 0.7      // crossflow drag proportionality factor
C_dc = 1.2      // crossflow drag coefficient of a circular cylinder
```

Properties, all of which matter:
- Small α: reduces to `C_Nα · α`. Correct linear aerodynamics.
- `α = 90°`: reduces to pure crossflow drag on the planform. Correct broadside behavior.
- Odd in α, and it is **π-periodic in the restoring sense**, so a tail-first vehicle (`α = π`) is in an *unstable* equilibrium — it will flip nose-first if disturbed, unless you hold it with gimbal or RCS. That is exactly right, and it is the correct difficulty model for a propulsive landing.

### 3.4 The two damping torques

**Linear pitch damping.** A body rotating at ω sees a local incidence increment `Δα_i = ω·x_i/W` at each station. Integrating the resulting normal forces:

```
τ_damp,lin = −(1/2)·ρ·W·S_ref·Σ_CNαx² · ω        // W = |v_air|
C_lin      =  (1/2)·ρ·W·S_ref·Σ_CNαx²
```

**Quadratic tumble damping.** Derived by strip theory: a strip `dx` at body distance `x` sees crossflow `ω·x`, contributing drag `½ρ(ωx)²·C_dc·(2R)·dx` at moment arm `x`. Integrating forward and aft of the CM:

```
C_quad = (1/2)·ρ·C_dc·(2R̄)·(L_fwd⁴ + L_aft⁴)/4
τ_damp,quad = −C_quad · ω·|ω|
```

where `L_fwd = s_cm`, `L_aft = L_total − s_cm`, `R̄` = mean body radius. Without this term a tumbling rocket in thin air never settles.

Both are applied **analytically** in the integrator (section 5.3), not as explicit torques.

**Jet damping.** The exhaust carries angular momentum away:

```
τ_jet = −ṁ · ℓ_e² · ω
```

Real, free, and it is a meaningful contributor to gimbal-loop stability on a long vehicle. Include it.

---

## 4. Forces and torques — the derivative function

### 4.1 Gravity

```
a_grav = −(μ/r²)·r̂
```

No J2, no third body. In 2D with one planet, that is the complete gravitational model.

### 4.2 Thrust

Gimbal deflection `δ`, positive = thrust vector rotated CCW relative to the body axis. Engine at station `s_e`; moment arm

```
ℓ_e = s_e − s_cm          // positive when the engine is aft of the CM (normal case)
```

```
F_thrust = T · (cos(θ + δ), sin(θ + δ))
```

Using the rotated unit vector directly gives you the `T·cos δ` axial loss and the `T·sin δ` side force for free — do not hand-code them separately.

Ambient pressure for the engine model is `atmosphere(z).P`. Throttle scales `T` and `ṁ` together for liquids; solids ignore throttle.

**Gimbal torque.** Engine at body position `(−ℓ_e, 0)`, force `T·(cos δ, sin δ)` in body coords:

```
τ_gimbal = x_b·F_by − y_b·F_bx = (−ℓ_e)·(T sin δ) − 0

τ_gimbal = −ℓ_e · T · sin δ
```

Positive δ deflects the nozzle CCW → the tail swings CCW → the **nose swings CW** → negative torque. That minus sign is real and the controller in section 8 depends on it.

### 4.3 Aerodynamic force, split into wind axes

Body-frame aero force is `F_b = q·S_ref·(−C_A, −C_N)`. Since `ŵ` in body coords is `(cos α, sin α)`, resolving into wind axes gives:

```
C_D,wind = C_A·cos α + C_N·sin α         // along −ŵ  (pure retarding)
C_L,wind = C_N·cos α − C_A·sin α         // along −p̂, where p̂ = perp90ccw(ŵ)
```

Check: at α = 0, `C_D,wind = C_A` and `C_L,wind = 0`. Correct.

This split is the whole reason the integrator is stable — the retarding part now has the exact form `v̇ ∝ −v²`, which has a closed-form solution.

```js
kDrag = 0.5*rho*S_ref*Math.max(C_D_wind, 0) / m;    // 1/m, used analytically
a_lift = −C_L_wind * q * S_ref / m  applied along p̂
```

### 4.4 Aerodynamic torque — the flip mechanism, stated properly

The linear and crossflow parts of the normal force act at **different** stations. Apply them separately; it costs one extra multiply and it is materially more correct at high α.

```
C_N,lin   = C_Nα · sin α · cos α                          acts at x_cp,b
C_N,cross = η·C_dc·(S_plan/S_ref)·sin α·|sin α|           acts at x_cross,b

τ_aero = x_cp,b·(−C_N,lin·q·S_ref) + x_cross,b·(−C_N,cross·q·S_ref)
```

**Verify the sign before writing another line of code.** Take a stable rocket: CP aft of CM, so `x_cp,b < 0`. Perturb to `α = +0.1 rad`, so `C_N,lin > 0`. Then

```
τ_aero = (negative)·(negative) = POSITIVE  →  CCW torque
```

`α > 0` means `ŵ` is CCW from `b̂`. A CCW torque rotates `b̂` toward `ŵ`, reducing α. **Restoring.** That single assertion is the highest-value unit test in the whole physics module.

**What actually stabilizes and what actually destabilizes.**

The mechanism is entirely about the *sign and magnitude of* `x_cp,b = s_cm − s_cp`, i.e. of the static margin.

- **Fins at the back stabilize** because they add a large `C_Nα` at a large station, dragging the `C_Nα`-weighted mean station `s_cp` aft, past `s_cm`. Then `x_cp,b < 0` and the aero moment restores. Fins additionally dominate `Σ_CNαx²`, so they damp the oscillation as well as centering it — a rocket with fins converges rather than ringing.
- **Mass at the back destabilizes** — a heavy engine or a full aft tank pulls `s_cm` aft toward `s_cp`, shrinking or reversing the static margin. This is the actual cause of most SFS/KSP flips: a big engine at the base and no fins.
- **Nose *area* destabilizes** — a wide fairing, a capsule, canards, or a flared nose adds `C_Nα` at a *small* station, pulling `s_cp` **forward**, toward and past `s_cm`.

One correction worth making explicitly, because it is a common and consequential mix-up: **nose *mass* stabilizes, it does not destabilize.** Adding ballast at the nose moves `s_cm` forward, *increasing* `(s_cp − s_cm)`. This is the classic model-rocket fix — you add clay to the nose cone precisely to make an unstable rocket stable. The destabilizing thing up front is *cross-sectional area*, not weight. If the intended game mechanic is "putting stuff on the nose is dangerous", the honest implementation is that a wide payload fairing or a capsule pulls the CP forward — and that mechanic is more interesting anyway, because the player's fix is to add fins rather than to add dead mass.

**Divergence rate when SM < 0.** Linearize: `τ ≈ −q·S_ref·C_Nα·(s_cp − s_cm)·α`. With `s_cp < s_cm` the coefficient is positive, so `I·α̈ = +K·α` with

```
K = q·S_ref·C_Nα·|s_cp − s_cm|
τ_flip = sqrt(I/K)        // e-folding time of the divergence
```

At max Q, `q` is maximal, so `τ_flip` is minimal — the rocket flips *at max Q* rather than at some arbitrary moment. That is genuine physics, it emerges free from the model above, and it is the single best teaching moment in the game. Do not damp it away.

**Control authority check** (display this in the builder as a red/amber/green meter):

```
authority = ℓ_e·T·sin(δ_max)                                   // available
demand    = q_maxQ·S_ref·C_Nα·|s_cp − s_cm|·α_design           // required, α_design = 5° = 0.0873 rad
flyable   = authority > 1.5 · demand
```

### 4.5 Full derivative function

Returns the **non-drag** acceleration plus the analytic coefficients. This split is what section 5 consumes.

```js
function deriv(S, veh, ctrl, planet, out){
  const rx = S.rx, ry = S.ry;
  const rmag = Math.hypot(rx, ry);
  const upx = rx/rmag, upy = ry/rmag;
  const z   = rmag - planet.R;

  const MP = veh.mp;                       // {m, s_cm, I}, refreshed each substep
  const m = MP.m, I = MP.I;

  // ---- gravity ----
  const g = planet.mu/(rmag*rmag);
  let ax = -g*upx, ay = -g*upy;
  let tau = 0;

  // ---- attitude basis ----
  const bx = Math.cos(S.th), by = Math.sin(S.th);
  const nx = -by,            ny =  bx;

  // ---- atmosphere & relative wind ----
  const A  = atmosphere(z, planet);
  const wx = S.vx + planet.wp*ry;          // v − (ω_p ẑ × r)
  const wy = S.vy - planet.wp*rx;
  const W  = Math.hypot(wx, wy);
  const q  = 0.5*A.rho*W*W;
  const mach = clamp(W/A.a, 0, 25);

  // ---- thrust ----
  const T    = veh.thrustNow(A.P, ctrl.throttle);
  const mdot = veh.mdotNow(A.P, ctrl.throttle);
  const d    = ctrl.gimbal;
  ax += T*Math.cos(S.th + d)/m;
  ay += T*Math.sin(S.th + d)/m;

  const ell = veh.sEngine - MP.s_cm;
  tau += -ell * T * Math.sin(d);           // gimbal
  tau += -mdot * ell * ell * S.om;         // jet damping

  // ---- aerodynamics ----
  out.kDrag = 0; out.Clin = 0; out.Cquad = 0;
  out.q = q; out.mach = mach; out.alpha = 0; out.W = W; out.rho = A.rho;

  if (A.rho > 1e-12 && W > 0.05){
    const uwx = wx/W, uwy = wy/W;
    const sa = bx*uwy - by*uwx;
    const ca = bx*uwx + by*uwy;
    const alpha = Math.atan2(sa, ca);
    const AC = veh.aero(mach);   // {CA, CNa, xcp_b, xcross_b, Sref, SplanRatio, sumCNax2, Cquad0}

    const CNlin = AC.CNa*sa*ca;
    const CNcrs = 0.7*1.2*AC.SplanRatio*sa*Math.abs(sa);
    const CN    = CNlin + CNcrs;
    const CA    = AC.CA;

    const CDw = CA*ca + CN*sa;             // wind-axis drag
    const CLw = CN*ca - CA*sa;             // wind-axis lift

    out.kDrag = 0.5*A.rho*AC.Sref*Math.max(CDw, 0)/m;

    const px = -uwy, py = uwx;             // perp90ccw(ŵ)
    const aL = -CLw*q*AC.Sref/m;
    ax += aL*px;  ay += aL*py;

    tau += AC.xcp_b    * (-CNlin*q*AC.Sref);
    tau += AC.xcross_b * (-CNcrs*q*AC.Sref);

    out.Clin  = 0.5*A.rho*W*AC.Sref*AC.sumCNax2;
    out.Cquad = 0.5*A.rho*1.2*AC.Cquad0;   // Cquad0 = 2R̄·(L_fwd⁴+L_aft⁴)/4
    out.alpha = alpha;
  }

  // ---- RCS / reaction wheel ----
  tau += ctrl.tauRCS;

  out.ax = ax; out.ay = ay; out.tau = tau;
  out.mdot = mdot; out.T = T; out.I = I; out.m = m;
  return out;
}
```

---

## 5. Integrator

### 5.1 The three modes

| mode | when | method | max warp |
|---|---|---|---|
| INTEGRATED | thrusting, or `z < zAtm`, or landed-with-contact | velocity Verlet + analytic drag, `dt = 1/120` | 4× |
| RAILS | thrust = 0, `z ≥ zAtm`, no attitude input | exact Kepler propagation | 100 000× |
| LANDED | settled on the surface | frozen in the rotating frame | 100 000× |

The rails mode is not an optimization — it is the *only* way to get high time warp without either exploding or burning the whole frame budget. Every game in this genre does it.

### 5.2 Choice of method, and why not RK4

Use **velocity Verlet (kick–drift–kick) with operator-split analytic drag and analytic rotational damping**.

- 2nd-order accurate, and **symplectic in the drag-free limit** — a Verlet orbit has bounded energy error forever, where RK4 has a secular energy *loss* that will visibly decay a parked orbit over a long session. That property is worth more here than RK4's higher order.
- **One force evaluation per step** (the end-of-step evaluation is reused as the start of the next), versus four for RK4. That is a 4× budget saving, which is what pays for the substeps you actually need.
- RK4 has a specific failure mode here: it evaluates the derivative at four points, and if a **burnout or staging event falls between them**, the four stages see inconsistent thrust and mass and RK4 produces garbage with high confidence. Verlet has one evaluation point per half-step and degrades gracefully. (Handle events by truncation regardless — see 5.5.)
- The analytic drag substep removes the stiffest term from the explicit integration entirely, so 2nd order is plenty.

### 5.3 The step

```js
function stepVerlet(S, veh, ctrl, planet, dt, cache){
  const A1 = cache.valid ? cache.d : deriv(S, veh, ctrl, planet, cache.tmpA);
  const I1 = A1.I;

  // --- half kick (non-drag forces + non-damping torques) ---
  S.vx += A1.ax*dt*0.5;
  S.vy += A1.ay*dt*0.5;
  S.om += (A1.tau/I1)*dt*0.5;

  // --- analytic drag on the AIR-RELATIVE velocity ---
  // solves dv/dt = −k v² exactly:  v(t) = v0/(1 + k v0 t)
  if (A1.kDrag > 0){
    const vax = -planet.wp*S.ry, vay = planet.wp*S.rx;
    let wx = S.vx - vax, wy = S.vy - vay;
    const W = Math.hypot(wx, wy);
    if (W > 1e-9){
      const f = 1/(1 + A1.kDrag*W*dt);
      S.vx = vax + wx*f;
      S.vy = vay + wy*f;
    }
  }

  // --- analytic rotational damping ---
  if (A1.Clin  > 0) S.om *= Math.exp(-A1.Clin*dt/I1);
  if (A1.Cquad > 0) S.om  = S.om/(1 + (A1.Cquad/I1)*Math.abs(S.om)*dt);

  // --- drift ---
  S.rx += S.vx*dt;
  S.ry += S.vy*dt;
  S.th += S.om*dt;

  // --- propellant / mass update ---
  advanceBurn(veh, A1, dt);            // web += r_burn·dt, or m_prop −= ṁ·dt
  veh.mp = massProps(veh);             // CM, I both move — this is intentional

  // --- second half kick ---
  const A2 = deriv(S, veh, ctrl, planet, cache.tmpB);
  S.vx += A2.ax*dt*0.5;
  S.vy += A2.ay*dt*0.5;
  S.om += (A2.tau/A2.I)*dt*0.5;

  cache.d = A2; cache.valid = true;    // reuse next step
  S.t += dt;
  return A2;
}
```

**Both analytic updates are unconditionally stable.** `1/(1 + k W dt)` is in (0, 1] for any positive `dt` — drag can slow you to a crawl but can never reverse or amplify your velocity, at any timestep. `exp(−C dt/I)` likewise. This single design choice eliminates the entire class of "drag exploded at high dt" bugs, and it means the substep budget is driven only by mass loss and rotation rate.

**Invalidate `cache.valid`** whenever anything discontinuous happens: staging, burnout, throttle change, gimbal command change, parachute deploy, part destruction, mode switch.

### 5.4 Substep budget

```js
function chooseDt(S, veh, A, planet, dtRemaining){
  const dtNom = (A.T > 0 || A.rho > 1e-9) ? 1/120 : 1/60;
  let dt = Math.min(dtNom, dtRemaining);

  // never lose more than 2% of the mass in one substep
  if (A.mdot > 0) dt = Math.min(dt, 0.02*A.m/A.mdot);

  // never rotate more than ~3° in one substep
  const om = Math.abs(S.om);
  if (om > 1e-6) dt = Math.min(dt, 0.05/om);

  // stay well inside the local orbital timescale
  const rmag = Math.hypot(S.rx, S.ry);
  dt = Math.min(dt, 0.02*Math.sqrt(rmag*rmag*rmag/planet.mu));

  // control-loop resolution: ω_n·dt < 0.2
  dt = Math.min(dt, 0.2/Math.max(CTRL.wn, 1e-3));

  return Math.max(dt, 1e-4);
}
```

Note there is **no drag term** in this budget. That is the payoff from 5.3.

Frame driver:

```js
function advance(S, veh, ctrl, planet, wallDt, warp){
  let remaining = Math.min(wallDt, 0.25) * warp;    // clamp for tab-switch spikes
  let guard = 0;
  while (remaining > 1e-9 && guard++ < 400){
    const A  = peekDeriv(S, veh, ctrl, planet);
    const dt = chooseDt(S, veh, A, planet, remaining);
    const dtEvent = timeToNextEvent(S, veh, dt);    // burnout, staging, contact
    stepVerlet(S, veh, ctrl, planet, Math.min(dt, dtEvent), cache);
    if (dtEvent <= dt) applyEvent(S, veh, cache);
    remaining -= Math.min(dt, dtEvent);
  }
  if (guard >= 400) demoteWarp();   // tell the player the warp level is not sustainable
}
```

At `dt = 1/120`, one vehicle costs ~120 `deriv` calls/s. `deriv` is a few hundred flops plus 3–4 `Math.pow` calls in the engine model. Cache the chamber-pressure `pow` — it depends only on `web`, so recompute it only when `web` changes materially (every substep, but memoize across the two half-kicks). Total: well under 1 ms/frame. There is ample headroom for 4× warp integrated.

### 5.5 Discrete events

Burnout, staging, parachute deploy, ground contact, and part destruction are **discontinuities**. Never let a substep straddle one.

```js
function timeToNextEvent(S, veh, dtMax){
  let te = dtMax;
  // burnout: solid grain web reaching webMax
  const st = veh.activeStage;
  if (st && st.mdotWeb > 0){
    const tb = (st.webMax - st.web)/st.mdotWeb;
    if (tb > 0) te = Math.min(te, tb);
  }
  // propellant exhaustion (liquid)
  if (st && st.mdot > 0 && st.propMass > 0)
    te = Math.min(te, st.propMass/st.mdot);
  // ground contact: linear extrapolation of the lowest contact point
  const zc = contactAltitude(S, veh);
  const vz = radialSpeed(S);
  if (zc > 0 && vz < -0.1) te = Math.min(te, zc/(-vz));
  return Math.max(te, 1e-5);
}
```

On an event: apply the discrete change, recompute `massProps`, **reset the controller integrator and the derivative cache**, and continue. Staging in particular changes `m`, `I`, `s_cm`, and `ℓ_e` all at once — a controller carrying stale integrator state across that will ring violently.

### 5.6 On-rails conic propagation

**Enter rails when** all of: `thrust == 0`, `z > planet.zAtm`, no attitude command this frame, not landed, `e < 1` or (`e ≥ 1` and receding). Convert `(r, v)` → elements (section 6.1) and store the epoch.

**Propagate:**

```js
function railsAdvance(el, dt, mu){
  const n = Math.sqrt(mu/Math.abs(el.a*el.a*el.a));
  el.M += n*dt;
  el.t += dt;
  const {r, v} = elementsToState(el, mu);
  return {r, v};
}
```

**Leave rails when** any of: throttle > 0, RCS/SAS input, `z` about to drop below `zAtm`, an SOI change, or a maneuver node is imminent. State is continuous by construction — `elementsToState` returns exactly the `(r, v)` that generated the elements.

**Attitude on rails.** Attitude is decoupled from translation in vacuum, so integrate it trivially: `θ += ω·dt`. But at 10 000× that is a nonsense spin rate, so: if `warp ≥ 50`, force `ω = 0` and hold attitude. Show the player a "warp locks attitude" indicator; this is the same compromise KSP makes and players accept it immediately.

**Never step past an event.** This is the one way rails can genuinely break a save:

```js
function railsStepCap(el, dtWanted, planet){
  let dt = dtWanted;
  const tEntry = timeToRadius(el, planet.R + planet.zAtm, "descending", planet.mu);
  if (tEntry !== null) dt = Math.min(dt, Math.max(tEntry - 0.5, 0.01));
  const tImpact = timeToRadius(el, planet.R, "descending", planet.mu);
  if (tImpact !== null) dt = Math.min(dt, Math.max(tImpact - 0.5, 0.01));
  return dt;
}
```

Without this, a single 10 000× frame steps a vehicle from 300 km altitude straight through the planet and out the other side, and the elements are still perfectly valid so nothing errors — it just silently teleports. Cap first.

**LANDED mode.** Freeze in the rotating frame and reconstruct position analytically:

```js
// stored: S.surf = {phi, z}
const ang = planet.wp*S.t + S.surf.phi + Math.PI/2;
S.rx = (planet.R + S.surf.z)*Math.cos(ang);
S.ry = (planet.R + S.surf.z)*Math.sin(ang);
S.vx = -planet.wp*S.ry;
S.vy =  planet.wp*S.rx;
S.th = ang + S.surf.tilt;
```

Zero cost, zero jitter, unlimited warp on the pad. Enter LANDED when contact persists and `|v_rel_ground| < 0.15 m/s` and `|ω| < 0.02 rad/s` for 0.5 s. Exit on any thrust command.

### 5.7 Warp ladder

```
1×, 2×, 4×  → INTEGRATED anywhere (atmosphere, thrust, landed)
10×, 50×, 100×, 1000×, 10000×, 100000× → RAILS or LANDED only
```

If the player requests ≥10× while in atmosphere or thrusting, clamp to 4× and say why ("cannot warp under thrust"). If `advance()` hits its 400-substep guard, demote one rung automatically.

---

## 6. Orbital mechanics in 2D

### 6.1 State vector → elements

```js
function stateToElements(r, v, mu, t){
  const rm = Math.hypot(r.x, r.y);
  const v2 = v.x*v.x + v.y*v.y;
  const rv = r.x*v.x + r.y*v.y;

  const h  = r.x*v.y - r.y*v.x;            // scalar specific angular momentum
  const eps = v2/2 - mu/rm;                // specific orbital energy
  const a  = -mu/(2*eps);                  // < 0 for hyperbolic

  const k  = v2/mu - 1/rm;
  const ex = k*r.x - (rv/mu)*v.x;
  const ey = k*r.y - (rv/mu)*v.y;
  const e  = Math.hypot(ex, ey);

  const p  = h*h/mu;                        // semi-latus rectum
  const w  = Math.atan2(ey, ex);            // argument of periapsis
  const dir = Math.sign(h) || 1;            // +1 = CCW = prograde

  // true anomaly
  let nu;
  if (e > 1e-8){
    nu = Math.acos(clamp((ex*r.x + ey*r.y)/(e*rm), -1, 1));
    if (rv < 0) nu = 2*Math.PI - nu;
  } else {
    nu = Math.atan2(r.y, r.x) - w;          // circular: use argument of latitude
  }

  // mean anomaly
  let E, M;
  if (e < 1){
    E = 2*Math.atan2(Math.sqrt(1-e)*Math.sin(nu/2), Math.sqrt(1+e)*Math.cos(nu/2));
    M = E - e*Math.sin(E);
  } else {
    const H = 2*Math.atanh(clamp(Math.sqrt((e-1)/(e+1))*Math.tan(nu/2), -0.999999, 0.999999));
    M = e*Math.sinh(H) - H;
    E = H;
  }

  return {
    a, e, p, w, nu, E, M, h, dir, t, mu,
    rApo:  e < 1 ? a*(1+e) : Infinity,
    rPeri: a*(1-e),
    period: e < 1 ? 2*Math.PI*Math.sqrt(a*a*a/mu) : Infinity,
  };
}
```

Guards that matter: `Math.acos` argument must be clamped to `[−1, 1]` (float error puts it at 1.0000000000000002 routinely and you get NaN); `e < 1e-8` must fall through to the argument-of-latitude branch or `ex/e` divides by zero; `h ≈ 0` (a purely radial trajectory, which happens on a straight-up sounding flight) leaves `w` undefined — special-case it by treating the orbit as a degenerate ellipse with `e → 1`.

### 6.2 Elements → state (Kepler solver)

```js
function solveKepler(M, e){
  if (e < 1){
    M = M % (2*Math.PI); if (M < 0) M += 2*Math.PI;
    let E = (e < 0.8) ? M + e*Math.sin(M) : Math.PI;
    for (let i = 0; i < 12; i++){
      const f  = E - e*Math.sin(E) - M;
      const fp = 1 - e*Math.cos(E);
      const dE = f/fp;
      E -= dE;
      if (Math.abs(dE) < 1e-12) break;
    }
    return E;
  } else {
    let H = (Math.abs(M) < 6) ? M/(e-1) : Math.sign(M)*Math.log(2*Math.abs(M)/e + 1.8);
    for (let i = 0; i < 30; i++){
      const f  = e*Math.sinh(H) - H - M;
      const fp = e*Math.cosh(H) - 1;
      const dH = f/fp;
      H -= dH;
      if (Math.abs(dH) < 1e-12) break;
    }
    return H;
  }
}

function elementsToState(el, mu){
  const {a, e, p, w, dir} = el;
  let nu, rm;
  if (e < 1){
    const E = solveKepler(el.M, e);
    nu = 2*Math.atan2(Math.sqrt(1+e)*Math.sin(E/2), Math.sqrt(1-e)*Math.cos(E/2));
    rm = a*(1 - e*Math.cos(E));
  } else {
    const H = solveKepler(el.M, e);
    nu = 2*Math.atan2(Math.sqrt(e+1)*Math.sinh(H/2), Math.sqrt(e-1)*Math.cosh(H/2));
    rm = a*(1 - e*Math.cosh(H));
  }
  const c = Math.cos(w + nu), s = Math.sin(w + nu);
  const vs = Math.sqrt(mu/p);
  // perifocal velocity (−sin ν, e + cos ν)·sqrt(μ/p), rotated by w
  const vpx = -Math.sin(nu)*vs, vpy = (e + Math.cos(nu))*vs;
  const cw = Math.cos(w), sw = Math.sin(w);
  return {
    r: {x: rm*c, y: rm*s},
    v: {x: (vpx*cw - vpy*sw)*dir, y: (vpx*sw + vpy*cw)*dir},
    nu, rm,
  };
}
```

For retrograde orbits (`h < 0`) the cleanest handling is to store `dir` and mirror the y-axis on the way in and out, rather than trying to carry a signed inclination through 2D formulas.

### 6.3 Derived readouts for the HUD

```
altApo   = rApo  − R_planet
altPeri  = rPeri − R_planet
n        = sqrt(mu/|a|³)                      // mean motion
tToApo   = wrap2pi(π − M)/n
tToPeri  = wrap2pi(−M)/n
v_circ   = sqrt(mu/r)                          // at current radius
v_esc    = sqrt(2·mu/r)
dvToCirc = |v_circ_at_apo − v_at_apo|          // the number the player actually wants
```

`dvToCirc` at apoapsis, computed via the vis-viva equation, is the single most educational HUD number in the game:

```
v_at_apo   = sqrt(mu·(2/rApo − 1/a))
v_circ_apo = sqrt(mu/rApo)
dvToCirc   = v_circ_apo − v_at_apo
```

### 6.4 Orbit classification

```js
function classifyOrbit(el, planet){
  const altPeri = el.rPeri - planet.R;
  const altApo  = el.rApo  - planet.R;
  if (el.e >= 1.0)                 return {k:"ESCAPE",     msg:"Escape trajectory"};
  if (altPeri <= 0)                return {k:"SUBORBITAL", msg:"Impact — raise periapsis"};
  if (altPeri < planet.zAtm)       return {k:"DECAYING",   msg:`Periapsis ${(altPeri/1000).toFixed(0)} km — inside atmosphere, orbit will decay`};
  if (altApo/altPeri > 1.05)       return {k:"ELLIPTICAL", msg:"Stable elliptical orbit"};
  return {k:"CIRCULAR", msg:"Stable circular orbit"};
}
```

"Stable orbit" for achievement purposes = `e < 1` **and** `rPeri − R ≥ zAtm` **and** currently above the atmosphere. The `DECAYING` band (periapsis between 0 and `zAtm`) is worth surfacing explicitly — it is the state most beginners end up in and cannot diagnose.

### 6.5 Trajectory prediction and drawing

**Ballistic in vacuum — draw the conic analytically.** This is essentially free and gives the crisp, confident orbit line that reads as "real simulator" rather than "toy".

```js
function conicPath(el, planet, nPts){
  const pts = [];
  // if the conic intersects the planet, find where and truncate there
  let nuImpact = null;
  const cosNu = (el.p/planet.R - 1)/el.e;
  if (el.e > 1e-8 && cosNu >= -1 && cosNu <= 1)
    nuImpact = -Math.acos(cosNu);        // descending crossing

  const nuStart = el.nu;
  const nuEnd   = (nuImpact !== null) ? unwrapForward(nuStart, nuImpact)
                                      : nuStart + 2*Math.PI;
  for (let i = 0; i <= nPts; i++){
    const nu = nuStart + (nuEnd - nuStart)*i/nPts;
    const rm = el.p/(1 + el.e*Math.cos(nu));
    if (rm <= 0 || rm > 1e10) break;      // past the hyperbolic asymptote
    const ang = el.w + nu;
    pts.push({x: rm*Math.cos(ang), y: rm*Math.sin(ang)});
  }
  return {pts, impact: nuImpact !== null};
}
```

Sample **uniformly in true anomaly** for near-circular orbits, but for `e > 0.5` sample uniformly in **eccentric anomaly** instead — otherwise a long ellipse gets 90 % of its points crowded around periapsis and the apoapsis arc looks like a polygon. 240 points is plenty either way.

Mark and label: apoapsis (`ν = π`), periapsis (`ν = 0`), the atmosphere-entry crossing, and the impact point.

**Thrusting or in atmosphere — numeric ghost integration.** Copy the state, hold current throttle and attitude, integrate forward with a large step:

```js
function predictNumeric(S, veh, ctrl, planet, horizonS){
  const G = cloneStateLight(S);           // r, v, θ, ω, propellant only
  const pts = [];
  let t = 0;
  const dt = 0.5;                         // coarse — this is a hint, not a simulation
  while (t < horizonS && pts.length < 400){
    stepVerlet(G, veh, ctrl, planet, dt, ghostCache);
    if ((pts.length & 1) === 0) pts.push({x: G.rx, y: G.ry});
    if (Math.hypot(G.rx, G.ry) < planet.R) { pts.impact = true; break; }
    t += dt;
  }
  return pts;
}
```

Do **not** run this every frame. Recompute every 250 ms, or on any control change, and interpolate the drawn line in between. Budget it: 400 steps × ~1 µs = ~0.4 ms, which is fine at 4 Hz and not fine at 60 Hz.

Switch between the two automatically: numeric while `thrust > 0 || z < zAtm`, conic otherwise. Crossfade the line style (dotted → solid) so the player learns which regime they are in.

---

## 7. Reentry heating

### 7.1 Heat flux — Sutton–Graves

Stagnation-point convective heating:

```
q̇ = k · sqrt(ρ / R_n) · V³           [W/m²]

k   = 1.7415e-4        (SI, Earth air composition)
R_n = effective nose radius (m)
```

Sanity checks the implementer can verify:

| case | ρ (kg/m³) | V (m/s) | R_n (m) | q̇ |
|---|---|---|---|---|
| LEO capsule, 70 km | 8.28e-5 | 7500 | 1.0 | 6.7e5 W/m² = 67 W/cm² |
| Lunar return, 60 km | 3.1e-4 | 11 000 | 4.7 | 1.9e6 W/m² = 188 W/cm² |
| Slender booster, 40 km | 4.0e-3 | 2000 | 0.15 | 2.3e5 W/m² = 23 W/cm² |

Note the `R_n` dependence: a **blunt** body has a *lower* stagnation heat flux than a sharp one. This is why heat shields are blunt, it falls straight out of the formula, and it is a genuinely surprising and satisfying thing for a player to discover. Make the builder show it.

Radiative heating (`∝ ρ^1.22 V^8` roughly) only matters above ~9 km/s; skip it and note the omission.

### 7.2 Per-part thermal model — lumped capacitance

```
dT/dt = [ q̇ · f_expose · A_wet  −  ε·σ·(T⁴ − T_amb⁴)·A_rad ] / (m_part · c_p)

σ = 5.670374e-8,  ε = 0.85,  T_amb = 250 K
```

`f_expose` is the directional factor. In 2D:

```js
// part's outward normal in body coords → world → dot with the wind
const facing = Math.max(0, dot(partNormalWorld, negWindHat));
const fExpose = 0.15 + 0.85*facing;      // 0.15 floor = base/side heating
```

Only the frontmost part along `ŵ` gets `facing ≈ 1`. A capsule flying heat-shield-first heats the shield; the same capsule flying backwards cooks the parachute bay. That is the correct and instructive behavior.

Material table:

| material | c_p (J/kg·K) | T_max (K) | notes |
|---|---|---|---|
| aluminium tank / structure | 900 | 850 | softens → RUD |
| steel structure | 500 | 1500 | |
| engine bell | 500 | 1800 | designed hot |
| composite fairing | 1000 | 700 | fragile |
| ablative heat shield | 1500 | 2400 | ablates from 1900 K |
| solar panel | 800 | 400 | very fragile, genuinely so |
| parachute (stowed) | 1300 | 600 | |
| parachute (deployed) | 1300 | 500 | |

### 7.3 Ablation

Above `T_abl = 1900 K`, a heat shield **pins its temperature** and consumes mass instead:

```
ṁ_abl = q̇ · A_wet / H_abl,        H_abl ≈ 1.0e7 J/kg   (PICA-like effective heat of ablation)
T      = min(T, T_abl)  while shieldMass > 0
```

When `shieldMass` reaches zero the pinning stops, `T` climbs, and the part behind starts taking flux. A finite, visibly depleting heat shield is one of the best game mechanics available here — it makes reentry angle matter without any artificial rule.

### 7.4 Display mapping

Map `T` to a glow for the renderer:

```
heat01 = clamp((T − 500)/(T_max − 500), 0, 1)
glow color: 500 K → transparent, 1200 K → deep orange, 2000 K+ → white
plasma trail spawn rate ∝ q̇^0.5, aligned with −ŵ
```

### 7.5 What destroys parts

Check each per substep; destroy the part and propagate structurally (children detach):

| condition | threshold |
|---|---|
| overheat | `T > T_max` |
| dynamic pressure | `q > q_max_part` (50 kPa composite, 90 kPa metal) |
| aero bending | `q · |α| > 3000 Pa·rad` (warn from 1500) |
| structural g | `|a_total| > 20 g` |
| parachute deploy overspeed | main above `q = 12 kPa`, drogue above `q = 60 kPa` |
| impact | see section 8 |
| crew g-load | `> 12 g` for > 3 s, or `> 6 g` sustained (blackout warning first) |

The Q-α limit is worth calling out: at max Q (`q ≈ 35 kPa` for a typical ascent) an angle of attack of 5° gives `q·α = 3050 Pa·rad`, right at the limit. Real launch vehicles hold α under ~3° through max Q for exactly this reason, and a player who over-steers during the gravity turn will snap their rocket in half — correctly, and for the real reason.

---

## 8. Ground contact and landing

### 8.1 Surface and contact test

Surface radius `R_surf(φ)`. For v1 use constant `R` with an optional low-amplitude hash terrain for visual interest, and keep the pad region exactly flat.

Each part with `isContact` (landing legs, engine bell, capsule base) has a body-frame contact point `c_b`. Transform to world and test:

```js
function contactAltitude(S, veh, planet){
  let minAlt = Infinity;
  for (const cp of veh.contactPoints){
    const wx = S.rx + cp.x*Math.cos(S.th) - cp.y*Math.sin(S.th);
    const wy = S.ry + cp.x*Math.sin(S.th) + cp.y*Math.cos(S.th);
    const alt = Math.hypot(wx, wy) - surfaceRadius(Math.atan2(wy, wx), planet);
    if (alt < minAlt) minAlt = alt;
  }
  return minAlt;
}
```

### 8.2 Contact response — spring-damper

Do not do impulse resolution. A penalty spring-damper is simpler, is stable at `dt = 1/120` with the right gains, and gives tipping for free.

```
pen  = −min(0, alt_contact)                       // penetration depth, ≥ 0
k    = 40 · m · g0 / 0.05                          // ~5 cm static deflection under weight
ζ    = 0.7
c    = 2·ζ·sqrt(k·m)

F_n  = k·pen + c·max(0, −v_radial_at_contact)      // never sticky
F_t  = −μ_f·F_n·tanh(v_tangential/0.1)             // smoothed Coulomb friction
μ_f  = 0.6
```

Apply `F_n` along the local `up` at the contact point and `F_t` along the local tangent, and take the torque about the CM from each contact point. Tipping then emerges naturally: once the CM projects outside the leg footprint, the contact forces produce a net overturning moment and the rocket falls over on its own. No special-case code.

Check the stiff-spring substep condition: `dt < 2·sqrt(m/k)`. With `k = 800·m·g0` that gives `dt < 2/sqrt(800·9.81) = 0.0226 s`, so `1/120 = 0.0083` has 2.7× margin. If the player builds something absurdly light on huge legs, `chooseDt` should add `dt ≤ 0.5·sqrt(m/k)` while any contact is active.

### 8.3 Survivable landing criteria

Evaluate at first contact:

```js
const tilt = Math.abs(wrapPi(S.th - (Math.atan2(S.ry,S.rx) + Math.PI/2)));  // from local vertical
const vv   = Math.abs(radialSpeed(S));       // vertical speed
const vh   = Math.abs(tangentialSpeedRelGround(S, planet));
const om   = Math.abs(S.om);
```

| configuration | v_vert max | v_horiz max | tilt max | ω max |
|---|---|---|---|---|
| landing legs deployed | 6 m/s | 3 m/s | 15° | 0.35 rad/s |
| legs, damage band | 6–12 m/s | 3–6 m/s | 15–25° | — |
| bare engine bell | 3 m/s | 1.5 m/s | 5° | 0.20 rad/s |
| capsule + parachute | 8 m/s | 5 m/s | 40° | 0.50 rad/s |
| capsule + parachute + airbag | 14 m/s | 8 m/s | 60° | 0.80 rad/s |

Above the damage band, destroy. Within it, break the legs but preserve the crew capsule. Below all thresholds, land clean.

Impact energy for damage scaling:

```
E_impact = 0.5·m·(v_vert² + v_horiz²)
damage   = E_impact / (partToughness_J)
```

### 8.4 Settling to LANDED

Once contact persists, `|v| < 0.15 m/s`, `|ω| < 0.02 rad/s`, and `|tilt|` is stable for 0.5 s → switch to LANDED mode (section 5.6). Without this the spring-damper leaves the vehicle micro-jittering forever, which looks broken and burns CPU.

Store `surf.tilt` on entry so a rocket that landed at 8° stays at 8°.

### 8.5 Planet rotation — include it

**Yes, include planet rotation.** It costs almost nothing (`ω_p` appears in exactly three places: initial velocity, `v_atm`, and the LANDED reconstruction) and it buys a lot:

- Launching east is free Δv — 465 m/s on Earth, 175 m/s on Kerbin. That is a real and teachable effect, and it makes the choice of launch direction meaningful.
- Ground tracks drift, so a reentry that targets the launch site has to lead it.
- Geostationary orbit becomes a reachable, named target with a computable altitude.
- The atmosphere co-rotates, which is what makes low-altitude air-relative velocity correct.

Initial launch state:

```js
S.rx = 0;  S.ry = planet.R;
S.vx = -planet.wp*S.ry;   // eastward
S.vy = 0;
S.th = Math.PI/2;         // nose up
S.om = 0;
```

---

## 9. Attitude control

### 9.1 Cascade with computed torque

The plant is a double integrator with an *unstable* aerodynamic pole (when SM < 0) and a gain that varies by two orders of magnitude over the flight as `T`, `I`, and `ℓ_e` change. Fixed PID gains cannot cover that range — they will be sluggish at liftoff and will ring at burnout. Use computed torque, which divides the varying gain out:

```
τ_desired = I · ( ω_n²·e_θ  +  2·ζ·ω_n·e_ω )

e_θ = wrapPi(θ_cmd − θ)
e_ω = ω_cmd − ω        (ω_cmd = 0 for attitude hold)

ω_n = 1.2 rad/s,  ζ = 0.8
```

Then invert the gimbal torque relation `τ = −ℓ_e·T·sin δ`:

```js
function gimbalCommand(S, veh, ctrl){
  const MP = veh.mp;
  const ell = veh.sEngine - MP.s_cm;
  const T = ctrl.lastThrust;
  const eTh = wrapPi(ctrl.thetaCmd - S.th);
  if (Math.abs(eTh) < 0.0035) return 0;               // 0.2° deadband
  const tauDes = MP.I*(CTRL.wn*CTRL.wn*eTh - 2*CTRL.zeta*CTRL.wn*S.om);

  const auth = ell*T;
  if (auth < 1e-3) return 0;                          // no thrust → no gimbal authority
  const sinD = clamp(-tauDes/auth, -1, 1);
  let dCmd = Math.asin(sinD);
  return clamp(dCmd, -veh.gimbalMax, veh.gimbalMax);
}
```

Then **slew-limit** toward the command — real gimbals move at 20–60 °/s and the rate limit is a large part of what prevents ringing:

```js
const dMax = veh.gimbalRate*dt;                       // rad, e.g. 0.7 rad/s
ctrl.gimbal += clamp(dCmd - ctrl.gimbal, -dMax, dMax);
```

Also rate-limit the *command*: `ω_cmd = clamp(K_p·e_θ, ±0.25 rad/s)` before feeding the inner loop, so a 180° flip request produces a controlled slew rather than a full-authority slam.

**No integral term on attitude.** It is the classic source of the wind-up-then-ring failure. If you need to trim a persistent thrust misalignment, use a slow leaky integrator: gain ≤ `0.05·ω_n`, output clamped to ±20 % of `δ_max`, leaked at 1/(10 s), and **reset on every staging event**.

**Discretization guard:** `ω_n·dt < 0.2`. At `ω_n = 1.2` that requires `dt < 0.167 s`, easily met. It is enforced in `chooseDt` anyway.

### 9.2 RCS and reaction wheels

Gimbal authority goes to zero with thrust, so vacuum attitude needs another actuator:

```
τ_RCS  = F_thruster · ℓ_rcs · sign(demand),  bang-bang with a 0.02 rad/s rate deadband
τ_wheel = clamp(τ_desired, ±τ_wheel_max),  τ_wheel_max ≈ 0.02·m·L_total
```

RCS consumes propellant (`ṁ = F/(g0·Isp)`, `Isp ≈ 220 s` for cold gas / monoprop) — that constraint is what makes RCS a resource decision rather than free. Reaction wheels are torque-limited and should saturate; when saturated, the player must use RCS.

### 9.3 Flight modes worth shipping

- **Prograde / Retrograde hold** — `θ_cmd = atan2(v.y, v.x)` (+π for retrograde). Retrograde hold is what makes a landing burn possible.
- **Surface prograde** — same but relative to `v_air`, which is what you want low in the atmosphere.
- **AoA limiter** — `θ_cmd = clamp(θ_cmd, θ_prograde ± α_max)` with `α_max = 5°`. Prevents the Q-α snap without preventing the player from flying badly in other ways.
- **Gravity turn autopilot** (reference profile for the tutorial): hold vertical to 100 m/s, pitch over 5° east, then hold surface prograde until 40 km, then hold inertial prograde. That profile reaches orbit on Kerbin with a reasonable rocket and is worth shipping as a "watch it fly" demo.

---

## 10. Numerical pitfalls

### 10.1 Fast mass loss

**Use `F = m·a` with the instantaneous mass. Do not use `d(mv)/dt`.** The thrust term already contains the momentum flux `ṁ·v_e`; adding a `v·ṁ` term double-counts it and produces a Δv that is wrong by a factor that grows with mass ratio. The specific wrong code to never write:

```js
// WRONG — this is not conservation of momentum, it is a bug
S.vx = (m_old*S.vx + Fx*dt) / m_new;
```

Correct: `S.vx += (Fx/m_current)*dt`.

Additional guards:
- Cap `Δm ≤ 2 %` of `m` per substep (in `chooseDt`).
- `m = Math.max(m, m_dry)` and `m_dry ≥ 1 kg` — never divide by a mass that can reach zero.
- Recompute `s_cm`, `I`, and `ℓ_e` every substep. They move continuously so this causes no instability, but a stale `ℓ_e` in the controller absolutely will.
- At **staging**, `m`, `I`, `s_cm`, and `ℓ_e` all jump. Apply as a discrete event, then reset the controller integrator and invalidate the derivative cache. A controller carrying pre-staging state into a 5× lighter vehicle will slam the gimbal to the stop.

### 10.2 Drag blowing up

Explicit drag is unstable when `dt > 2m/(ρ·V·C_D·A)` — which at max Q on a light upper stage can be well under 1/60 s. **The analytic drag substep in 5.3 removes this failure mode entirely**, because `1/(1 + k·W·dt) ∈ (0,1]` for every positive `dt`. That is the recommended fix, and it is why there is no drag term in the substep budget.

If for any reason you keep an explicit drag path, guard it:

```js
const dvMax = 0.5*W;
if (Math.hypot(adx,ady)*dt > dvMax){ const s = dvMax/(Math.hypot(adx,ady)*dt); adx*=s; ady*=s; }
```

Also clamp `q` to a sane ceiling (say 5 MPa) so that one bad state — a teleport, a NaN, a `zAtm` off-by-one — produces a survivable glitch rather than an instant `Infinity` that poisons every downstream value.

### 10.3 "Rocket flips at max Q" — real, not a bug

It is real when `SM < 0`. The divergence e-folding time is `sqrt(I/K)` with `K = q·S_ref·C_Nα·|s_cp − s_cm|`, which is minimized exactly at max Q. **Keep it.** The player's correct responses are all real ones: add fins, throttle down through max Q, fly a shallower gravity turn to keep α small, or move mass forward.

Before blaming physics, rule out these four bugs, which produce a flip on a rocket that *should* be stable:

1. **Sign error in `τ_aero`.** Assert: `SM = +1.5 cal`, `α = +0.1 rad`, `q > 0`, all other torques zero → `τ_aero > 0`. This single test catches the majority of flip bugs.
2. **Cross-product sign in α.** Assert: `b̂ = (1,0)`, `ŵ = (cos 0.1, sin 0.1)` → `α = +0.1`.
3. **Missing angle wrap in the controller.** `θ_cmd − θ` without `wrapPi` will command a 350° turn instead of a −10° one, and the rocket will obediently flip. Every angle difference goes through `wrapPi`.
4. **Missing or wrong-signed damping.** Assert: in vacuum with zero torques, `ω` is constant to 1e-12 over 10 000 steps. If it grows, the damping term has the wrong sign.

Distinguishing test for the player-facing case: if the rocket flips with `SM > 1.0 cal` and `|α| < 3°`, it is a bug. If it flips with `SM < 0.3 cal` or `|α| > 10°`, it is physics.

### 10.4 Gimbal oscillation and PID ringing

Causes, in order of frequency:

- **Fixed gains across a varying plant.** Fixed by computed torque (9.1), which divides out `I` and `ℓ_e·T`.
- **No gimbal rate limit.** An instantaneous gimbal is an infinite-bandwidth actuator and will chase noise. Limit to 20–60 °/s.
- **Integral wind-up.** Do not use one on attitude; if you must, leak and clamp it hard.
- **`ω_n` too high relative to `dt`.** Enforce `ω_n·dt < 0.2`.
- **Insufficient authority.** If `ℓ_e·T·sin δ_max < q·S_ref·C_Nα·|s_cp − s_cm|·α`, the controller saturates and bang-bangs. Show the authority meter in the builder (4.4) so the player learns this at build time instead of at 40 seconds into flight.
- **Fighting the aero moment.** With `SM > 0` the aero moment is *helping*; the controller only needs to trim. With `SM < 0` it is fighting, and `ω_n` must exceed the aero divergence rate `1/sqrt(I/K)` or the loop simply loses. Compute both and display the margin.

Jet damping (`−ṁ ℓ_e² ω`) is a genuine, free stabilizer for the gimbal loop — do not omit it.

### 10.5 Everything else

- **`Math.acos` domain.** Clamp to `[−1, 1]` at every call site. Float error puts arguments outside by ~2e-16 routinely and `NaN` propagates silently through the entire orbital state.
- **`e → 0` singularity.** `ex/e` divides by zero on a perfectly circular orbit, which the on-rails path will produce exactly. Branch at `e < 1e-8`.
- **`h → 0`.** A straight-up sounding flight has zero angular momentum, so `p = 0` and the conic drawer produces `r = 0/0`. Special-case it: draw the radial trajectory as a line segment.
- **Unwrapped θ growth.** Keeping θ unbounded is correct, but after a long tumble it can reach 1e5 rad, at which point `Math.sin(θ)` loses precision. Re-wrap to `(−π, π]` whenever `|θ| > 1000` and add the removed multiple to a separate `spinCount` for display.
- **ω runaway.** Clamp `|ω| ≤ 20 rad/s`. Beyond that nothing is physical and it is the fastest route to NaN.
- **NaN recovery.** Snapshot the state before each substep. After the substep, `if (!Number.isFinite(S.rx + S.ry + S.vx + S.vy + S.th + S.om))` → restore the snapshot and halve `dt`. If it fails twice at the same time, destroy the vehicle with a "structural failure" message rather than freezing the game. A frozen game is a worse bug report than a lost rocket.
- **Rails skipping events.** Covered in 5.6, but restated because it is the one that silently corrupts a session: always cap the rails step below the next atmospheric-entry or impact time. The elements stay valid after teleporting through the planet, so nothing throws.
- **Render precision.** Subtract the camera origin in f64 before touching the canvas transform. `6.371e6` has ~0.5 m of f32 resolution, so without this the rocket visibly quantizes while sitting on the pad, and the "cinematic" goal dies at the first frame.
- **Prediction cost.** Do not run `predictNumeric` every frame. 4 Hz, or on control change.
- **`wallDt` spikes.** Clamp the frame delta to 0.25 s before multiplying by warp; a tab switch otherwise hands you a 30-second step.

---

## 11. Validation suite

Ship these as a hidden debug page. Each is a few lines and each catches a whole class of error.

| # | test | expected |
|---|---|---|
| 1 | Vacuum free fall from 1000 m, Earth | ground contact at t = 14.28 s, v = 140.0 m/s |
| 2 | Atmosphere at 0 / 11 / 20 / 50 / 100 km | table in 2.5, to 4 significant figures |
| 3 | Speed of sound at sea level, 11 km | 340.29, 295.07 m/s |
| 4 | Circular orbit, Earth, r = 6571 km, v = 7783 m/s | after 10 orbits, `|Δa|/a < 1e-3`, `|Δe| < 1e-4` |
| 5 | Same orbit, period | 5305 s ± 1 s |
| 6 | Hohmann 200 → 400 km, Earth | Δv₁ = 58.1, Δv₂ = 57.6, total 115.7 m/s |
| 7 | `stateToElements` → `elementsToState` round trip, 1000 random states | `|Δr|/r < 1e-10` |
| 8 | Kepler solver, e = 0.0 … 0.95, M = 0 … 2π | converges in < 12 iterations, residual < 1e-12 |
| 9 | Aero torque sign: SM = +1.5 cal, α = +0.1 rad | τ_aero > 0 |
| 10 | Aero torque sign: SM = −1.5 cal, α = +0.1 rad | τ_aero < 0 |
| 11 | Stable rocket, SM = 1.5, perturb 5° at q = 20 kPa | damped oscillation, period ≈ 2π·sqrt(I/K), settles < 10 s |
| 12 | Unstable rocket, SM = −0.5, perturb 1° at max Q | diverges with e-folding time sqrt(I/K) |
| 13 | Vacuum coast, zero torque, 10 000 steps | `ω` constant to 1e-12, `θ` linear |
| 14 | Terminal velocity, 1 kg sphere, Cd = 0.47, A = 0.01 m², sea level | 74.5 m/s |
| 15 | Drag stability: `dt = 1 s`, `v = 8000 m/s`, sea level | velocity decreases monotonically, never negative, never NaN |
| 16 | Sutton–Graves, ρ = 8.28e-5, V = 7500, R_n = 1 | 6.69e5 W/m² |
| 17 | Rails ↔ integrated round trip at the boundary | `|Δr| < 1e-6 m`, `|Δv| < 1e-9 m/s` |
| 18 | Geostationary radius, Earth | 42 164 km |
| 19 | Geostationary radius, Kerbin | 3468.6 km (alt 2868 km) |
| 20 | Ideal Δv check: 1000 kg → 400 kg, Isp = 300 s, vacuum, no gravity | 2696 m/s (Tsiolkovsky), integrator within 0.1 % |

Test 20 is the one that catches the variable-mass formulation error (10.1) — a `d(mv)/dt` implementation will be off by tens of percent at that mass ratio and by very little at a low one, so test it at a *high* mass ratio.

---

## 12. Module interface summary

So the modules genuinely agree, freeze these signatures:

```js
// atmosphere.js
atmosphere(z, planet) → {rho, P, T, a}

// vehicle.js
massProps(veh)              → {m, s_cm, I}
veh.aero(mach)              → {CA, CNa, xcp_b, xcross_b, Sref, SplanRatio,
                               sumCNax2, Cquad0, SM}
veh.thrustNow(pa, throttle) → N        // wraps existing stateAtWeb()
veh.mdotNow(pa, throttle)   → kg/s     // wraps existing stateAtWeb()
veh.contactPoints           → [{x, y}] // body frame

// physics.js
deriv(S, veh, ctrl, planet, out) → out {ax, ay, tau, kDrag, Clin, Cquad,
                                        q, mach, alpha, W, rho, T, mdot, m, I}
stepVerlet(S, veh, ctrl, planet, dt, cache) → derivAtEnd
chooseDt(S, veh, A, planet, dtRemaining)    → dt
advance(S, veh, ctrl, planet, wallDt, warp) → void

// orbit.js
stateToElements(r, v, mu, t) → el
elementsToState(el, mu)      → {r, v, nu, rm}
solveKepler(M, e)            → E or H
conicPath(el, planet, nPts)  → {pts, impact}
classifyOrbit(el, planet)    → {k, msg}

// control.js
gimbalCommand(S, veh, ctrl)  → δ (rad)
```

Sign conventions that every one of these depends on, restated once more:

- `θ` CCW from PCI +x, unwrapped; `b̂ = (cos θ, sin θ)`.
- `s` from nose tip, positive aft; `x_b = s_cm − s`.
- CP aft of CM ⇒ `x_cp,b < 0` ⇒ stable.
- `α > 0` means `ŵ` is CCW from `b̂`.
- `τ_gimbal = −ℓ_e·T·sin δ`, with `ℓ_e = s_engine − s_cm > 0`.
- `ω`, `τ` positive CCW.
