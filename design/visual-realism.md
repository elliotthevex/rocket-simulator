# visual-realism

## Summary
The current build's "video" is a 170×170 flame glyph plus an SVG rocket sliding up a CSS `<div>` track — it is a diagram, which is exactly why it reads as unreal. The fix is not more flame layers; it is to replace the whole visualization with a single full-bleed Canvas 2D world renderer built on three foundations: (a) a real world→screen camera in meters with continuous logarithmic zoom, so the rocket stays nearly fixed on screen while the world, smoke and pad slide past it with correct parallax; (b) a physically-driven plume whose length, flare half-angle, opacity, shock-cell spacing and color are computed from values the existing engine model already produces (`pc`, `exitPressure()`, `motor.exitMach`, `areaRatio()`, `pa`, throttle, fuel key) — so a sea-level RP-1 plume is a pinched sooty orange column with 5 tight diamonds and a vacuum LH2 plume is a 55°, 22%-opacity pale-blue bloom, and the difference is *derived*, not art-directed; and (c) a layered, sprite-cached particle and world stack (star field, cloud decks you punch through, limb arc, city lights, pad cloud with internal orange lighting, heat shimmer, auto-iris exposure) that is aggressively LOD'd by altitude so the frame stays under 9 ms. Everything below is specified to the gradient stop, stroke width, particle count and lifetime.

## Key Decisions
- Pin the rocket near screen centre and move the WORLD past it. The current build's `positionRocket()` sets `rocketIcon.style.bottom` on a div, translating a fixed-size sprite against a static background — that alone guarantees a toy look. Replace with a metres-based camera (`ctx.translate(cssW/2, cssH*framing.y); ctx.rotate(rot); ctx.scale(ppm, -ppm); ctx.translate(-cam.x,-cam.y)`) and let smoke, tower and ground slide down past a nearly-stationary vehicle.
- Smooth camera zoom in LOG space, never linear: `cam.logPpm += (Math.log(targetPpm) - cam.logPpm) * (1 - Math.exp(-2.5*dt))`. Follow the anchor table (ppm 8.0 at 0 m → 0.10 at 20 km → 0.0035 at 150 km → 1.8e-4 at 2000 km) with log-log interpolation. Linear zoom smoothing is immediately visible as wrong.
- Derive every plume dimension from the engine model already in the file — `exitPressure(motor,pc)`, `motor.exitMach`, `areaRatio()`, `pa`, `throttle`. Specifically: `halfAngle = clamp(2.5 + 52*(1-atm)^1.25 * clamp(pe/pa,0.25,6)^0.28, 2, 60)` degrees, `Louter = Lcore*(2.4 + 5.0*(1-atm))`, and `op = baseOpacity*(0.35+0.65*thr)*(0.30+0.70*atm^0.45)`. Sea-level RP-1 = pinched 2.9° sooty column; vacuum LH2 = 60°, 6.6%-opacity cone you can see stars through. The altitude story must be computed, not art-directed.
- Give each fuel a distinct baseOpacity and let it dominate: solid 0.95, rp1 0.85, ch4 0.55, lh2 0.22 — and cut LH2 by a further 0.70 in daylight while raising heat-shimmer amplitude 1.8x. A nearly invisible hydrolox flame with visible air distortion is the physically correct signature and is far more impressive than a blue cone.
- Shock diamonds only when `pa > 2 kPa` and `|pe/pa - 1| > 0.08`. Spacing from the Prandtl relation `cell = 1.306*De*sqrt(Me^2-1)`, then `cell *= 0.88` per node, node brightness `0.85^i`, count `clamp(round(4+6*|ln(pRatio)|),2,9)`. The plume silhouette half-width must oscillate in phase with the same wavelength, or the diamonds look pasted on.
- Render smoke puffs as four sprite blits (one base lobe + three seeded sub-lobes at 0.45R offset, 0.62R radius), never a single disc — and add an additive orange rim-light `rgba(255,150,60, 0.25*prox)` on any puff within 25 m of the plume. Cauliflower shape plus internal flame lighting is the whole difference between 'smoke' and 'gray circles'.
- Split the plume at the pad. When the nozzle is within 12 m of the deck, clip the vertical plume and spawn two horizontal cones at 25° below horizontal, 3x length, 0.55x opacity. Those become the pad-smoke emitters. This is why real launches throw smoke sideways and it is the highest-value 20 lines in the whole spec.
- Add auto-iris exposure: a full-screen `rgba(0,0,0, 0.18*op*thr*exp(-(t-ignT)/0.30))` fill for ~0.5 s after ignition. Two lines of code, and it is one of the strongest 'this is real camera footage' cues available.
- Drive all flicker, shake and turbulence from 1-D value noise (`vnoise(t*41)`, `vnoise(t*26)`), never `Math.random()`. Per-frame independent randomness reads as TV static; coherent noise reads as combustion instability and airframe vibration.
- Draw curvature only when the derived chord sag exceeds 1.5 px: `sag = cssW^2/(8*R*ppm)`. At 10 km that is 0.2 px, so the ground must be dead flat — drawing a curved horizon at low altitude is the classic amateur tell. Switch to a full planet circle only when `R*ppm < 2.5*cssH`.
- Fade stars from computed sky luminance (`starAlpha = clamp(1 - skyLum/0.020, 0, 1)`), not a hardcoded altitude ramp, and twinkle only below 40 km and only for the brightest 5%. Twinkling stars in vacuum is a physics error players will catch.
- Cache the rocket as an offscreen sprite rebuilt only on part-list change, ±12% size change, or a bucketed state change (soot 5 levels, gimbal 5 steps, legs, fins); render it at 1.35x needed size, cap 1024 px. Per frame it becomes one drawImage.
- Run physics at a fixed 120 Hz with an accumulator and interpolate the render between the last two states. This is a visual fix as much as a physics one — variable-dt integration produces sub-pixel jitter that reads as synthetic motion.
- Enforce a hard particle cap of 1800 in struct-of-arrays typed arrays with swap-with-last removal, and NEVER call `createRadialGradient` inside a per-particle loop — pre-render one puff sprite per palette color and blit. Also ban `ctx.shadowBlur` entirely and keep `ctx.filter` off the hot path.
- Implement in the order 1-6 first (camera → sky → rocket sprite → plume v1 → particles/pad cloud → shake+flash+exposure). Those six steps alone move the visualization from diagram to convincing launch; everything after is polish.

## Pitfalls
- Keeping the DOM/CSS approach. `rocketIcon.style.bottom = pct + '%'` and the 170x170 `flame-canvas` cannot be incrementally improved into something cinematic — the fixed sprite size and static background are the defect. Delete both and build the single full-bleed world canvas.
- Making the plume prettier without making it pressure-dependent. If the sea-level and vacuum plumes have the same silhouette, the whole flight looks like one static effect scrolling by. The bloom at altitude is the payoff moment; it must be visibly, dramatically different.
- Using `Math.random()` per frame for flicker, shake or turbulence. It produces incoherent white noise that reads as broken rendering. Use 3-octave 1-D value noise sampled at different rates (t*8, t*19, t*41).
- Calling `createLinearGradient` / `createRadialGradient` inside the particle or plume loop. This is the single biggest frame-time killer in Canvas 2D — one 400-particle smoke pass with per-particle gradients will cost 8-12 ms on its own. Cache gradients in a Map keyed by quantized signature; blit pre-rendered sprites for particles.
- Using `ctx.shadowBlur` for the glow or `ctx.filter='blur()'` for the plume envelope. Both force off-screen surface allocation and will drop you to 25 fps. Use the 3-draw scale trick (1.00/1.25/1.60 at alpha 0.34) or the quarter-res `cBloom` upscale instead.
- Smoothing zoom linearly instead of in log space. `ppm += (target - ppm)*k` makes the zoom rate feel wrong at every scale — it crawls at high altitude and snaps at low. Always interpolate `Math.log(ppm)`.
- Drawing planet curvature too early. A curved horizon at 2-10 km altitude is the most common giveaway of an amateur space sim — the true sag at 10 km is about 0.2 px. Gate on `sag > 1.5 px` from `cssW^2/(8*R*ppm)`.
- Parenting the exhaust trail to the rocket. If the trail follows the vehicle it looks like a comet tail on a sprite. Release each smoke particle into world space with `v = -0.15*vehicleVelocity + exhaustDir*(40..90)` and let the vehicle's own acceleration produce the shear.
- Drawing smoke as single soft discs. Even with perfect physics, disc puffs read as fog decals. Four lobes per puff (base + three seeded sub-lobes) plus a lighter offset highlight lobe is the minimum for volumetric-looking billow.
- Forgetting to kill the shockwave ring, the atmospheric smoke persistence, and the camera shake in vacuum. An expanding blast ring in space, or a rocket that still vibrates at 200 km, destroys credibility instantly — and the sudden stillness above the atmosphere is one of the most powerful moments you can give the player.
- Drawing fin triangles and a cone-shaped nose. Use a tangent ogive (`rho = (R^2+L^2)/(2R)`), swept trapezoidal fins with a visible thickness bevel and a third foreshortened fin, and a curved engine bell with 16 cooling-tube strokes. Silhouette geometry is read before shading.
- Omitting the double-line engraved ribs. A single dark line per rib looks like a scratch; the paired `rgba(0,0,0,0.30)` at y plus `rgba(255,255,255,0.14)` at y+0.025 m is what the eye reads as machined metal. Same trick on the bell tubes and interstage bolts.
- Interpolating sky keyframes in sRGB. Lerping hex values directly through the blue-to-black ramp produces muddy purple mid-tones. Convert to linear with `pow(c/255, 2.2)`, lerp, convert back.
- Rebuilding the rocket sprite every frame because the gimbal angle or soot level changed by a fraction. Bucket continuous state (soot to 5 levels, gimbal to 5 steps) and use a ±12% size hysteresis, or the cache never hits.
- Cutting to map view instead of animating into it. A hard cut breaks the spatial continuity the whole camera design exists to build. Animate ppm, the black overlay, the conic fade-in and the sprite-to-icon cross-fade over 1.1 s.
- Letting the rocket shrink below a few pixels at high altitude and 'losing' the player. Decouple `spriteScale` from world `ppm` below 14 px, blended over 1 s so there is no pop, then cross-fade to a labelled icon.
- Allocating a 2048x2048 star field (16 MB) plus a full set of other offscreen canvases and blowing the memory budget on low-end machines. Use 1536x1536 or two 1024x1024 layers and keep total offscreen surface under ~40 MB.
- Running physics at variable dt tied to rAF. Even with correct forces, the render will jitter at the sub-pixel level and the motion will read as fake. Fixed 120 Hz accumulator plus render interpolation between the last two states.
- Spawning particles during timewarp. At 100x you will hit the 1800 cap in a single frame and stall. Disable all particle emission whenever timewarp > 1.

## Full Spec

> **Scope note.** This spec covers rendering only. All numbers are for a reference viewport of **1600 × 900 CSS px**; scale amplitudes by `min(cssW/1600, cssH/900)` where noted. `ppm` = pixels per meter (the camera zoom). Colors are given as hex or `rgba()` literals ready to paste.

---

# §0. Diagnosis — why the current version reads as fake

Read `/Users/elliot_jeong/rocket-sim/web/index.html`:

- `drawFlame()` (line 1021) draws 3 quadratic-curve blobs into a **170 × 170** canvas — a logo, not a plume.
- `positionRocket()` (line 1064) sets `rocketIcon.style.bottom = pct + "%"` on a `<div>` — the rocket **translates at constant size against a static background**. This alone guarantees a toy look, no matter how good the flame is.
- There is no world, no camera, no parallax, no particles, no scale change.

The five levers, in order of impact:

1. **The rocket must be nearly stationary on screen; the world moves past it.** Real launch footage from a tracking camera has the vehicle pinned near frame center while smoke, tower and ground rip downward. This is worth more than every other item combined.
2. **Continuous logarithmic zoom-out with altitude.** Scale change is the primary depth cue.
3. **A plume whose shape is a function of ambient pressure.** Underexpanded bloom in vacuum vs. pinched column at sea level is the thing that makes viewers say "that's a real rocket."
4. **Volumetric, internally-lit smoke** (cauliflower lobes, orange rim-light from the flame) instead of gray circles.
5. **Auto-iris / exposure response** — the scene darkens for ~0.5 s when the engine lights. Two lines of code, enormous payoff.

Keep the physics module untouched. The renderer consumes it read-only.

---

# §1. Architecture

## 1.1 Canvases

| Canvas | Size | When redrawn |
|---|---|---|
| `cMain` | full viewport × `dpr` | every frame |
| `cBloom` | `cMain/4` | every frame the plume is bright |
| `cShimmer` | 512 × 512 scratch | every frame heat shimmer is on |
| `cStars` | 1536 × 1536 (two layers of 1024² if memory tight) | once at init |
| `cCity` | 1024 × 512 | once at init |
| `cTerrain` | 512 × 512 tile | once at init |
| `cContinent` | 1024 × 512 | once at init |
| `cClouds[6]` | 256 × 128 each | once at init |
| `cPuff[3]` | 128 × 128 (soft, med, wispy) | once at init |
| `cRocket` | ≤ 1024 on long side | on part-list / size / state change only |

```js
const dpr = Math.min(devicePixelRatio || 1, 2) * quality.renderScale; // renderScale 1.0 → 0.75
// on resize only:
cMain.width  = Math.round(cssW * dpr);
cMain.height = Math.round(cssH * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // NEVER per-frame
```

Use a seeded PRNG so the world is deterministic and every cached canvas is reproducible:

```js
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rngWorld = mulberry32(0xC0FFEE);
```

## 1.2 Camera and transform

```js
const cam = { x:0, y:0, logPpm:Math.log(8), rot:0, shakeX:0, shakeY:0, shakeRot:0 };
const ppm = () => Math.exp(cam.logPpm);

// world (metres, +y = up, origin at pad, planet centre at (0, -R)) → screen px (+y = down)
function applyCamera(ctx){
  const p = ppm();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.translate(cssW*0.5 + cam.shakeX, cssH*framing.y + cam.shakeY);
  ctx.rotate(cam.rot + cam.shakeRot);
  ctx.scale(p, -p);                 // flip y so world +y is up
  ctx.translate(-cam.x, -cam.y);
}
```

`framing.y` is where the vehicle sits vertically on screen (§7.3). Everything world-space is drawn inside `applyCamera`. Everything screen-space (sun, star field, vignette, HUD) is drawn with the identity transform.

**Never draw the rocket in world scale below 14 px.** Above that threshold the rocket has its own `spriteScale` decoupled from `ppm` (§7.2) — a deliberate, honest cheat that Spaceflight Simulator also makes.

## 1.3 Draw order (painter's algorithm, one pass, per frame)

```
 1  sky gradient                          screen-space, cached
 2  star field                            screen-space, drawImage
 3  milky way band                        screen-space
 4  sun + aureole + lens ghosts           screen-space
 5  planet body / limb arc / city lights  world-space
 6  far terrain (continent map)           world-space, parallax 1.0
 7  cloud layer B (cirrus, above)         world-space
 8  ground detail tile + ocean + shadows  world-space
 9  launch complex: pad, trench, tower    world-space
10  BACKGROUND particles (smoke behind)   world-space
11  plume glow underlay (lighter)         world-space
12  spent stages / debris / fairings      world-space
13  ROCKET sprite                         world-space
14  plume core + diamonds (lighter)       world-space  → also into cBloom
15  FOREGROUND particles (sparks, plasma) world-space
16  cloud layer A (cumulus, in front)     world-space + whiteout overlay
17  bloom composite (cBloom upscaled, lighter)
18  heat shimmer slice-displacement
19  exposure / auto-iris multiply
20  atmospheric tint, vignette, grain, letterbox
21  HUD                                   screen-space (separate DOM overlay preferred)
```

---

# §2. The rocket — making it read as metal hardware

## 2.1 Part model

A stage is an ordered list of parts stacked along local `+y`. Each part carries `{type, len, dia, skin, detail}`. All part drawing happens in **part-local space**: origin at the part's bottom-centre, `+y` up, units = metres. The caller has already applied the camera and the vehicle rotation.

```js
function drawVehicle(ctx, veh){
  ctx.save();
  ctx.translate(veh.x, veh.y);
  ctx.rotate(veh.pitch);                 // radians, 0 = nose up
  let y = 0;
  for (const part of veh.parts){ ctx.save(); ctx.translate(0,y); PART[part.type](ctx,part,veh); ctx.restore(); y += part.len; }
  ctx.restore();
}
```

## 2.2 Skin gradients (the core of the metal look)

Every cylindrical body is filled with a **cross-body** linear gradient — `createLinearGradient(-w/2, 0, +w/2, 0)` where `w = part.dia`. This fakes the cylinder's terminator and specular band. Cache the gradient object per `(skin, w quantized to 2%)`.

**`white` — painted tank (Falcon / Atlas)**
```
0.00 #4A4F57   0.08 #7C838C   0.22 #C9CFD6   0.38 #F2F5F8
0.46 #FFFFFF   0.52 #F0F3F6   0.70 #C3C9D1   0.86 #868D96   1.00 #3E434A
```

**`steel` — bare stainless (Starship)**
```
0.00 #2E3338   0.10 #565E66   0.26 #9AA4AE   0.40 #D6DEE6
0.47 #F6FAFF   0.55 #C8D2DC   0.72 #8B959F   0.88 #4E555C   1.00 #262A2E
```
Then a second pass for mirror streaks: 8 vertical bands at seeded x-fractions, each `w*0.03` wide, alternating `rgba(255,255,255,0.10)` / `rgba(0,0,0,0.08)`, `globalCompositeOperation='source-over'`.

**`foam` — sprayed orange insulation (SLS / Shuttle ET)**
```
0.00 #5A2B10   0.12 #8A4417   0.30 #C6691F   0.45 #E08A34
0.50 #EDA04C   0.62 #CE7526   0.80 #92491A   1.00 #4E2510
```

**`black` — interstage / soot / composite**
```
0.00 #0A0C0E   0.15 #1A1E22   0.42 #33393F   0.50 #3E454C   0.65 #262B30   1.00 #08090B
```

**Sun-direction flip.** Compute `sunDot = cos(sunAzimuth − vehicleWorldAngle)`. If `sunDot < 0`, mirror the gradient (swap stop offsets `s → 1-s`). In vacuum, harden it: push stop 0.00 to `#0A0C0E` and narrow the specular band from 0.08 to 0.04 of the width. Hard terminator = space.

## 2.3 Body detail passes (in order, clipped to the body rect)

All stroke widths below are given in **world metres** and must be converted: `ctx.lineWidth = Math.max(0.6/ppm, W_metres)` so lines never vanish or blow out. Set `ctx.lineCap='butt'`.

1. **Joint AO.** At the part's bottom edge, a 0.18 m tall band: linear gradient `rgba(0,0,0,0.30) → rgba(0,0,0,0)` upward. At the top edge, a 0.10 m band `rgba(255,255,255,0.12) → transparent` downward. Stacked hardware = visible joints.
2. **Longitudinal seams.** 3 lines at x-fractions **−0.34, +0.05, +0.36** of `w` (asymmetric — symmetric seams look like a wireframe). `strokeStyle='rgba(0,0,0,0.22)'`, `lineWidth = 0.012 m`. Skip if `w*ppm < 24 px`.
3. **Stringer rings (ribs).** Every **1.5 m** of length. Each rib is a *pair* of horizontal lines — this engraved double-line is what sells machined metal:
   ```
   dark : rgba(0,0,0,0.30),      lineWidth 0.02 m, at y
   light: rgba(255,255,255,0.14), lineWidth 0.02 m, at y + 0.025 m
   ```
   Skip the whole pass if `1.5*ppm < 4 px`.
4. **Corrugation (optional, `detail.corrugated`).** Vertical stripes period 0.35 m, alternating `rgba(255,255,255,0.06)` / `rgba(0,0,0,0.06)`.
5. **Rim light.** Fill the upper 12% of the body height with `rgba(255,255,255,0.06)`.
6. **Soot.** After `burnTime > 5 s`, fill the aft 1.5 m with `rgba(24,18,14, a)` where `a = 0.45 * clamp((burnTime-5)/60, 0, 1)`. Bucket `a` to 5 levels so the sprite cache is not invalidated every frame.
7. **Cryo frost** (`fuel === 'lh2' || 'ch4'`). Draw a pre-rendered 64×64 white-speckle tile as a `createPattern` fill at `globalAlpha = 0.25`, plus a 0.06 m `rgba(255,255,255,0.35)` edge stroke. Pre-launch, vent wisps (§5.5).
8. **Markings.** A flag rect and a 2-glyph text label at 0.6 m cap height, `fillStyle='#1A1E22'`, only when `0.6*ppm > 7 px`. Markings are a strong scale cue — they tell the eye how big the vehicle is.

## 2.4 Nose cone — a tangent ogive, never a triangle

```js
function ogivePath(L, R, n=24){                    // L = length, R = base radius
  const rho = (R*R + L*L)/(2*R);
  const p = new Path2D(); p.moveTo(0, L);          // tip
  for(let i=n;i>=0;i--){ const x=L*i/n; const y=Math.sqrt(rho*rho-(L-x)*(L-x))-(rho-R); p.lineTo(y,x); }
  for(let i=0;i<=n;i++){ const x=L*i/n; const y=Math.sqrt(rho*rho-(L-x)*(L-x))-(rho-R); p.lineTo(-y,x); }
  p.closePath(); return p;
}
```
Fill with the skin gradient sized to `2R`. Then:
- **Specular arc:** radial gradient centred at `(-0.15w, 0.35L)`, radius `0.5w`, `rgba(255,255,255,0.35) → transparent`, `globalCompositeOperation='lighter'`.
- **Tip:** a 0.08 m dark cap `#22262A`, then a 0.03 m `#FFFFFF` dot offset `(-0.02, +0.02)` m.
- **Ablative tip** (re-entry vehicles): swap the cap for `#3A2A22`.

## 2.5 Fins

Trapezoidal with sweep — root chord `Cr`, tip chord `Ct = 0.40·Cr`, span `S = 0.85·R`, sweep `Λ = 0.55·Cr`.

```
(w/2, 0) → (w/2 + S, Λ) → (w/2 + S, Λ + Ct) → (w/2, Cr) → close
```
- Fill: linear gradient **perpendicular to the span** (from root to tip), `#8C949C → #545B62` (or skin-derived).
- Leading edge: stroke `rgba(255,255,255,0.35)`, `lineWidth 0.03 m`.
- Trailing edge: stroke `rgba(0,0,0,0.40)`, `lineWidth 0.045 m`.
- **Thickness bevel:** a second quad inset 0.06 m on the near side, filled `rgba(255,255,255,0.10)`. Without this the fin looks like paper.
- Mirror for the other side; add a **third, foreshortened fin** at `x = 0` scaled to 0.22 width and darkened 35% — implying the fin pointing at the camera. Three fins beats two every time.

**Grid fins:** outer rect + 4×6 inner lattice, `lineWidth 0.025 m`, `rgba(30,34,38,0.90)`, plus `rgba(200,210,220,0.30)` on the up-facing edge of each cell. Animate stow→deploy 0→90° over 0.8 s with a 6% overshoot.

## 2.6 Interstage rings and bolts

At each part boundary, a collar: rect of height **0.35 m**, width `w·1.03` (proud of the body), filled with the skin gradient darkened 30% (`globalAlpha=0.8` over a `#1A1E22` base). Then two bolt rows at y = 0.09 m and 0.26 m:
- bolt every **0.25 m**, radius `max(0.5/ppm, 0.012·w)`, fill `rgba(0,0,0,0.35)`
- highlight dot offset `(-0.006, +0.006)` m, `rgba(255,255,255,0.25)`
- Skip bolts if `0.25*ppm < 3 px`.

## 2.7 Engine bells — the single highest-value detail

```js
function bellPath(Rt, Re, Ln, n=18){
  const p = new Path2D(); p.moveTo(-Rt, 0);
  for(let i=0;i<=n;i++){ const u=i/n, r=Rt+(Re-Rt)*Math.pow(u,0.6); p.lineTo(-r, -u*Ln); }
  for(let i=n;i>=0;i--){ const u=i/n, r=Rt+(Re-Rt)*Math.pow(u,0.6); p.lineTo( r, -u*Ln); }
  p.closePath(); return p;
}
// Re = motor.nozzle.exitD/2 ; Rt = motor.nozzle.throatD/2 ; Ln = 1.4*(Re-Rt)/Math.tan(15*Math.PI/180)
```

**Fill** — cross gradient over `2Re`:
```
0.00 #1B1F23  0.18 #3B4248  0.34 #6E7880  0.46 #9AA6B0
0.50 #B4C0C9  0.56 #8E99A2  0.75 #4A5157  1.00 #171A1D
```
**Regenerative cooling tubes** — the detail that makes it read as an F-1/RS-25 instantly. 16 lines following the contour:
```js
for(let j=0;j<16;j++){
  const f = -1 + 2*(j+0.5)/16;
  ctx.beginPath();
  for(let i=0;i<=12;i++){ const u=i/12, r=Rt+(Re-Rt)*Math.pow(u,0.6); ctx.lineTo(f*r, -u*Ln); }
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = (j%2) ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.22)';
  ctx.stroke();
}
```
Skip tubes if `2*Re*ppm < 30 px`; skip the whole bell body detail below 12 px.

**Exit ellipse** (we see slightly into the bell): `ctx.ellipse(0, -Ln, Re, Re*0.18, ...)`.
- Engine off: radial gradient `#0B0D0F → #23282C`.
- Engine on: radial gradient `rgba(255,246,224,throttle) → rgba(255,180,80,0.3·throttle) → transparent`, `'lighter'`.

**Plumbing head** above the throat: a 0.5·Ln cylinder plus 3 bezier pipe runs — stroke `#7A828A` at 0.05 m, then re-stroke `#C6CED6` at 0.018 m offset `(-0.02,-0.02)` m.

**Gimbal:** rotate the entire bell about its throat point by `veh.gimbal` (±5°, driven by the control loop). Visible engine steering is a top-tier realism cue and costs one `ctx.rotate`.

**Soot:** darken the bell by `rgba(20,14,10, 0.45·sootLevel)` with the same 5-level bucketing.

## 2.8 Sprite caching

```js
const needRebuild = (partsHash !== cache.hash)
  || (Math.abs(Math.log(neededPx/cache.px)) > 0.115)   // ±12%
  || (stateKey !== cache.stateKey);                    // legs|fins|soot bucket|gimbal bucket(5)
```
Render into `cRocket` at **1.35 ×** the needed pixel size (so small zoom drifts don't rebuild), long side capped at 1024. Then per frame it is one `drawImage`.

---

# §3. The plume — the hero effect

## 3.1 Inputs, all already available

```js
const At   = throatArea(motor.nozzle);
const Ae   = exitArea(motor.nozzle);
const eps  = areaRatio(motor.nozzle);
const De   = motor.nozzle.exitD;
const Me   = motor.exitMach;                 // solveExitMach(eps, k)
const pe   = exitPressure(motor, pc);        // Pa
const pa   = ambientPressure(altitude);      // Pa
const thr  = throttle;                       // 0..1
const fuel = FUEL_KEY;                       // 'solid' | 'rp1' | 'ch4' | 'lh2'
```

## 3.2 Derived visual drivers — the whole altitude story in five formulas

```js
const paSafe   = Math.max(pa, 20);                          // floor so vacuum doesn't divide by ~0
const pRatio   = pe / paSafe;                               // >1 underexpanded, <1 overexpanded
const atm      = Math.min(pa / 101325, 1);                  // 1 at sea level, 0 in vacuum

// half-angle of the plume cone, degrees
const halfAngle = clamp(2.5 + 52*Math.pow(1-atm, 1.25) * Math.pow(clamp(pRatio,0.25,6), 0.28), 2, 60);

// exit half-width multiplier
const flare  = clamp(Math.pow(pRatio, 0.33), 0.55, 3.2);
const We     = 0.5 * De * flare;

// lengths, in metres
const Lcore  = De * (3.0 + 4.0*thr) * (0.70 + 0.60*(1-atm));
const Louter = Lcore * (2.4 + 5.0*(1-atm));

// opacity
const op = FUEL[fuel].baseOpacity * (0.35 + 0.65*thr) * (0.30 + 0.70*Math.pow(atm, 0.45));
```

Sanity check the behaviour this produces:

| Condition | `atm` | `pRatio` | halfAngle | `Louter/De` | `op` (rp1) |
|---|---|---|---|---|---|
| RP-1, sea level, 100% | 1.00 | ~0.69 | ~2.9° | ~16 | 0.85 |
| RP-1, 20 km, 100% | 0.055 | ~12 → clamp 6 | ~55° | ~52 | 0.31 |
| LH2, sea level, 100% | 1.00 | ~0.7 | ~2.9° | ~16 | 0.22 |
| LH2, vacuum, 100% | 0.00 | clamp 6 | ~60° | ~52 | 0.066 |

That LH2 vacuum plume at 6.6% opacity — a vast, barely-there cone through which you can see stars — is the correct and spectacular look.

## 3.3 Fuel palettes

```js
const FUEL = {
 solid:{ baseOpacity:0.95, diamondStrength:0.25, smokeRate:3.0, sparkRate:1.0,
   core:['#FFFFFF','#FFF7D6','#FFE08A'], mid:['#FFC246','#FF9A25'],
   outer:['#E8641A','rgba(120,40,10,0)'], glow:'255,196,90',
   smokeCol:['#E6E3DC','#8E8A83'] },
 rp1:{ baseOpacity:0.85, diamondStrength:0.70, smokeRate:1.4, sparkRate:0.4,
   core:['#FFF3D0','#FFD27A'], mid:['#FF9A32','#F4691B'],
   outer:['#B23A0C','rgba(90,28,8,0)'], glow:'255,140,50',
   smokeCol:['#6B5F52','#2F2A25'] },
 ch4:{ baseOpacity:0.55, diamondStrength:1.00, smokeRate:0.25, sparkRate:0.15,
   core:['#FFFFFF','#EAF4FF'], mid:['#9FC8FF','#5F9BF0'],
   outer:['#2B62C4','rgba(20,50,120,0)'], glow:'150,200,255',
   smokeCol:['#F4F8FB','#C3CDD6'], hotLip:'#FFD9A0' },
 lh2:{ baseOpacity:0.22, diamondStrength:1.20, smokeRate:0.00, sparkRate:0.05,
   core:['rgba(230,245,255,1)','rgba(200,228,255,1)'], mid:['rgba(170,205,255,1)','rgba(130,175,245,1)'],
   outer:['rgba(110,150,230,0.5)','rgba(60,100,200,0)'], glow:'180,215,255',
   smokeCol:['#FFFFFF','#DCE6EE'], diamondCol:'#DCE9FF' }
};
```
Two fuel-specific rules that matter enormously:

- **LH2 in daylight is nearly invisible.** When `atm > 0.5`, multiply `op` by a further **0.70** and *increase* the heat-shimmer amplitude by 1.8×. You show the distortion, not the flame. That is the real signature and it looks stunning.
- **CH4 has a hot recirculation lip.** Paint the first 15% of `Lcore` with `hotLip` (`#FFD9A0`) blended into the blue core.

## 3.4 The seven plume layers

Draw in this exact order. Everything except the smoke is `globalCompositeOperation = 'lighter'`.

**L0 — Ambient glow halo** (only if `pa > 5000`)
Radial gradient at `(0, -0.15·De)` from the exit, radius `3.5·We`:
```
0.00 rgba(GLOW, 0.55*op)   0.35 rgba(GLOW, 0.22*op)   1.00 rgba(GLOW, 0)
```

**L1 — Outer diffuse envelope**
Build the silhouette path (§3.5), fill with a gradient along the plume axis from exit `(0,0)` to `(0,-Louter)`:
```
0.00 rgba(mid[0], 0.30*op)
0.30 rgba(mid[1], 0.20*op)
0.70 rgba(outer[0], 0.10*op)
1.00 outer[1]                        // fully transparent
```
Draw it **three times** at scales 1.00 / 1.25 / 1.60 about the exit point, each at `globalAlpha = 0.34` — a cheap fake blur that avoids `ctx.filter`.

**L2 — Shock diamonds** (only if `pa > 2000` and `|pRatio − 1| > 0.08`)
Shock-cell wavelength from the classic Prandtl relation:
```js
let cell = 1.306 * De * Math.sqrt(Math.max(Me*Me - 1, 0.2));
const n = clamp(Math.round(4 + 6*Math.abs(Math.log(pRatio))), 2, 9);
let s = 1.15*De;                        // first node distance from exit
for(let i=0;i<n;i++){
  const decay = Math.pow(0.85, i) * FUEL[fuel].diamondStrength * op;
  drawNode(s, cell, decay);
  s += cell; cell *= 0.88;               // cells shorten as the jet dissipates
}
```
`drawNode(s, cell, a)`:
- an ellipse at `(0, -s)`, `rx = 0.30·We`, `ry = 0.42·cell`, filled with a radial gradient `rgba(diamondCol||core[0], 0.90·a) → rgba(mid[0], 0.35·a) → transparent`;
- two crossing strokes at ±35° through the node, length `1.1·We`, `lineWidth = 0.02·De` (world m), `strokeStyle = rgba(255,255,255, 0.35·a)`.

The silhouette half-width must also oscillate in phase:
```js
hw(s) = base(s) * (1 + 0.22 * Math.pow(0.85, s/cell0) * Math.cos(2*Math.PI*s/cell0));
```

**L3 — Mach disk** (only if `pRatio > 2.5`)
One bright flattened ellipse at `s = 0.67·De·Math.sqrt(pRatio)`: `rx = 0.40·We`, `ry = 0.05·We`, radial gradient `rgba(255,255,255,0.70·op) → rgba(mid[0],0.3·op) → transparent`.

**L4 — Inner core**
Half-width `0.45·We` at the exit, tapering to 0 at `0.35·Lcore`. Fill with a gradient along the axis:
```
0.00 rgba(core[0], 0.95*op)   0.35 rgba(core[1], 0.75*op)
0.70 rgba(mid[0],  0.35*op)   1.00 transparent
```

**L5 — Flicker & turbulence** (a multiplier on everything above, not a layer)
Combustion instability is high-frequency and *coherent*, not per-frame noise. Use 3-octave 1-D value noise:
```js
function vnoise(x){ const i=Math.floor(x), f=x-i, u=f*f*(3-2*f);
  const h=n=>{n=(n<<13)^n; return 1-((n*(n*n*15731+789221)+1376312589)&0x7fffffff)/1073741824;};
  return h(i)*(1-u)+h(i+1)*u; }
const flick = 1 + 0.06*vnoise(t*41) + 0.04*vnoise(t*19+7.3) + 0.03*vnoise(t*8+2.1);
```
Apply `flick` to `Lcore`, `Louter` and `op`. Lateral tip jitter: `dx = 0.05*We*vnoise(t*13+31)`. **Do not use `Math.random()` here** — independent per-frame randomness reads as TV static.

**L6 — Bloom.** Render L0–L4 a second time into `cBloom` (quarter resolution), then:
```js
ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=0.50;
ctx.drawImage(cBloom, 0,0, cssW, cssH);     // bilinear upscale IS the blur
```
Fallback for quality level ≥ 2: skip `cBloom`, instead redraw L4 twice more with `globalAlpha` 0.35 at scale 1.8 and 0.15 at scale 3.2 about the exit.

**L7 — Anamorphic streak** (cinematic, when `op·thr > 0.5` and `pa > 20 kPa`)
A horizontal additive bar across the plume: width `8·We`, height `0.06·De`, linear gradient `transparent → rgba(GLOW,0.25·op) → transparent`, centred at the brightest node.

## 3.5 Silhouette path construction

```js
function plumePath(We, Louter, halfAngleDeg, cell0, wobble){
  const tan = Math.tan(halfAngleDeg*Math.PI/180), P=new Path2D(), N=22;
  const w = s => We*(1 + tan*s/We*0.55) * (1 + 0.22*Math.pow(0.85,s/cell0)*Math.cos(2*Math.PI*s/cell0))
                    * (1 - 0.35*Math.pow(s/Louter,3));     // necks down at the very tip
  P.moveTo(-We, 0);
  for(let i=1;i<=N;i++){ const s=Louter*i/N; P.lineTo(-w(s)+wobble*(i/N), -s); }
  for(let i=N;i>=1;i--){ const s=Louter*i/N; P.lineTo( w(s)+wobble*(i/N), -s); }
  P.lineTo(We,0); P.closePath(); return P;
}
```

## 3.6 Ground deflection — the reason launches look the way they do

When the nozzle exit is within **12 m** of the pad deck:
1. Clip the vertical plume at the deck plane (`ctx.rect` clip above deck).
2. Spawn **two horizontal plume cones** from the deck at the vehicle centreline, directed ±x at **25° below horizontal**, length `3 × Lcore`, half-angle 18°, using the same layer stack at **0.55 × opacity**.
3. Those two jets are the emitters for the pad smoke cloud (§4.3) — which is why the smoke shoots sideways, not down.

Fade the deflection linearly from full at 0 m to zero at 12 m altitude.

## 3.7 RCS thrusters

Tiny cones, 0.15–0.4 m long, `#EAF4FF → transparent`, `'lighter'`, 80 ms lifetime, spawned wherever an attitude thruster fires. Almost free, and they make the vehicle feel *controlled*.

## 3.8 Heat shimmer (no shaders required)

After the world is drawn but before the rocket:
```js
const bb = plumeScreenBBox(1.3);
sctx.drawImage(cMain, bb.x*dpr, bb.y*dpr, bb.w*dpr, bb.h*dpr, 0,0, bb.w, bb.h);
const SL = 16, sh = bb.h/SL;
for(let i=0;i<SL;i++){
  const y = i*sh;
  const dx = amp * vnoise(y*0.09 + t*7 + i*1.7);      // amp = 1.5..4 px * intensity
  ctx.drawImage(cShimmer, 0, y, bb.w, sh, bb.x+dx, bb.y+y, bb.w, sh);
}
```
16–20 `drawImage` calls of small rects — cheap. Gate off at quality level ≥ 1.

## 3.9 Auto-iris / exposure

Real launch cameras stop down when the engine lights. Simulate:
```js
const flashE = Math.exp(-(t - ignT)/0.30);
const exposure = 0.18 * clamp(op*thr,0,1) * flashE;
ctx.globalCompositeOperation='multiply';   // or source-over with black
ctx.fillStyle = `rgba(0,0,0,${exposure})`; ctx.fillRect(0,0,cssW,cssH);
```
Two lines. Enormous realism payoff.

---

# §4. Launch effects

Timeline relative to ignition command `T-0`:

| Time | Event |
|---|---|
| T−6.0 s | Water deluge: white steam sheets from the trench, rise 4 m/s, alpha 0.5 |
| T−3.0 s | ROFI sparklers: 50/frame bright sparks from two pad points, life 0.5–1.0 s, gravity, one bounce |
| T−0.0 s | Ignition flash + exposure drop + overpressure ring |
| T+0.0 s | Hold-down release; umbilicals whip away over 0.40 s with 15% overshoot; swing arms rotate 12° over 1.5 s |
| T+0→+6 s | Pad smoke cloud at full emission |
| T+0→+4 s | Ice/frost shedding (cryo vehicles) |
| T+120 m alt | Pad emission begins decaying |
| T+200 m alt | Pad emission = 0; cloud persists ~20 s |

## 4.1 Ignition flash

```js
// screen-space, 'lighter'
const a = 0.90*Math.exp(-dt/0.12);
g = ctx.createRadialGradient(nx,ny,0, nx,ny, 6*De*ppm);
g.addColorStop(0,`rgba(255,245,220,${a})`); g.addColorStop(0.4,`rgba(255,200,120,${a*0.4})`);
g.addColorStop(1,'rgba(255,180,80,0)');
// plus a whole-screen lift:
ctx.fillStyle = `rgba(255,240,215,${0.35*Math.exp(-dt/0.09)})`; ctx.fillRect(0,0,cssW,cssH);
```
Total duration ~0.35 s.

## 4.2 Overpressure shockwave

Use the **real speed of sound** — it is both correct and teachable:
```js
const r = 340 * dt;                                       // metres
ctx.lineWidth   = Math.max(1/ppm, 14*Math.exp(-dt/0.25)/ppm);
ctx.strokeStyle = `rgba(255,255,255,${0.35*Math.exp(-dt/0.22)})`;
ctx.ellipse(padX, 2, r, r*0.35, 0, 0, Math.PI*2); ctx.stroke();   // 0.35 = seen edge-on
// second ring 6px inside at rgba(0,0,0,0.10) → refraction hint
```
Cut off at `dt > 0.6 s`. **Never draw this in vacuum.**

## 4.3 Pad smoke cloud — the money shot

Two emitters at `(padX ± 4 m, 0)`, aimed along the deflected jets.

| Property | Value |
|---|---|
| Emission rate | 90 puffs/s while lit and `alt < 120 m`; linear decay to 0 at 200 m |
| Initial radius | 3–6 m |
| Growth | `dR/dt = 7 m/s`, decaying as `exp(-age/2.5)` |
| Velocity | horizontal ±18–34 m/s, vertical +2–9 m/s |
| Drag | `v *= exp(-0.55·dt)` |
| Buoyancy | `+3.5 m/s²` upward, starting at age 1.2 s |
| Lifetime | 9–16 s |
| Alpha | `0.55 · (1-age/life)^1.6 · (R0/R)` |

**Rendering — cauliflower, not discs.** Each puff draws the cached `cPuff` sprite **four times**: once at full `R` (the base lobe), then three sub-lobes at seeded angles `θ_k` with offset `0.45R` and radius `0.62R`. Each puff carries a fixed seeded rotation and a slow `rotv` of ±0.25 rad/s. This one change is the entire difference between "smoke" and "gray circles."

**Internal lighting — the other half of it.** For any puff whose centre is within **25 m** of the plume axis, draw an extra additive pass:
```js
const prox = clamp(1 - dist/25, 0, 1);
ctx.globalCompositeOperation='lighter';
ctx.globalAlpha = 0.25*prox*plumeIntensity;
ctx.drawImage(cPuff[0], ...);   // tinted with FUEL[fuel].glow
```
Smoke lit from within by the flame is the single most convincing detail in launch footage.

**Two-tone shading:** draw the dark lobe first (`smokeCol[1]`), then a 0.75 R lobe offset `(-0.25R, +0.30R)` in `smokeCol[0]` at alpha 0.35 — sunlight on the top-left of each billow.

## 4.4 Dust ring

Separate, flat, fast, ground-hugging: 120 particles, radius 0.5–2 m, radial velocity 25–60 m/s, life 2–4 s, alpha 0.4, `y` clamped to < 3 m. Color follows the terrain preset (`#B99C78` desert, `#7E8A7A` coastal grass).

## 4.5 Ice shedding

Cryo vehicles only. 30–60 flakes over T−0 → T+4, size 0.15–0.5 m, `#EAF2F8`, tumbling at up to 6 rad/s, falling 3–8 m/s plus relative wind. Each drawn as a 5-vertex irregular polygon with a `rgba(255,255,255,0.5)` top edge.

---

# §5. Particle systems

## 5.1 Storage

Struct-of-arrays, pre-allocated typed arrays, swap-with-last removal. No per-particle objects, no GC.

```js
const MAX = 1800;
const P = { x:new Float32Array(MAX), y:new Float32Array(MAX),
  vx:new Float32Array(MAX), vy:new Float32Array(MAX),
  age:new Float32Array(MAX), life:new Float32Array(MAX),
  r:new Float32Array(MAX), r0:new Float32Array(MAX),
  rot:new Float32Array(MAX), rotv:new Float32Array(MAX),
  seed:new Float32Array(MAX), type:new Uint8Array(MAX), pal:new Uint8Array(MAX), n:0 };
```

## 5.2 Budgets (hard caps; enforce before spawn, kill oldest of the same type on overflow)

| Type | Max live | Typical | Life | Draw cost |
|---|---|---|---|---|
| SMOKE (pad + trail) | 900 | 250–450 | 2–20 s | 4 sprite blits each |
| SPARK | 400 | 0–150 | 0.4–1.2 s | 1 stroke each |
| DEBRIS | 120 | 0–90 | 3–20 s | 1 poly + trail |
| VAPOR / condensation | 250 | 0–120 | 0.3–2 s | 1 blit |
| PLASMA streak | 300 | 0–250 | 0.25–0.8 s | 2 strokes each |

Total 1800. Update budget 1.2 ms; draw budget 1.8 ms.

## 5.3 The non-negotiable performance rule

**Never call `createRadialGradient` inside a per-particle loop.** Pre-render three 128×128 white puff sprites once (`cPuff[0]` soft, `[1]` medium, `[2]` wispy) and tint them at draw time by drawing the sprite then compositing a color rect with `'source-atop'` into a small tinted-sprite cache — or simpler, pre-render **one sprite per palette color** (there are only ~10). `drawImage` of a cached sprite is 10–30× cheaper than gradient+arc+fill.

Also: **never use `ctx.shadowBlur`.** It is the #1 cause of canvas jank.

## 5.4 Exhaust trail in flight

```js
rate     = 60 * thr * Math.min(1, 3*rho/1.225) * FUEL[fuel].smokeRate;  // per second
pos      = nozzleExitWorld + jitter(0.4*De)
v        = -0.15*vehicleVelocity + exhaustDir*(40 + 50*Math.random())
life     = alt < 20000 ? 8 + 12*Math.random() : 2 + 2*Math.random()
```
The trail is **released into world space** and never parented to the rocket. Because the vehicle accelerates, the trail naturally forms a long tapering column with the correct shear — this is a free, physically-correct effect that scripted trails can never reproduce.

**Wind field** (also drives clouds and the smoke column's characteristic bend):
```js
function wind(h){ return 4 + 12*smoothstep(0,12000,h) + 25*Math.exp(-Math.pow((h-11000)/2500,2)); }
// jet-stream bump at 11 km ↑
v.x += (wind(y) - v.x) * (1 - Math.exp(-0.5*dt));
```
**Buoyancy:** `v.y += 6.0*Math.exp(-age/3) * dt`.
**Turbulence:** `v += curl(vnoise(x*0.01+t*0.2), vnoise(y*0.01-t*0.17)) * 2.5 * dt`.

Above 35 km the trail is essentially zero — correct, and it makes the transition to "space" feel earned.

## 5.5 Vapor cone / transonic condensation

**Trigger:** `0.92 < M < 1.15` **and** `alt < 14000` **and** `q > 15 kPa`.

Render a translucent white shroud around the vehicle, centred at **0.62 × body length** from the nose:
```js
ctx.save(); ctx.translate(0, 0.62*L); ctx.scale(1, 0.55);
g = ctx.createRadialGradient(0,0,0.35*w, 0,0, 1.6*w);
g.addColorStop(0,'rgba(255,255,255,0)');
g.addColorStop(0.55,`rgba(255,255,255,${0.45*coneA})`);
g.addColorStop(1,'rgba(255,255,255,0)');
```
`coneA = sin(π · (M − 0.92)/0.23)` — peaks at M ≈ 1.03, gone by 1.15. Modulate with `vnoise(t*6)*0.25` so it puffs and clears.

Plus **Mach lines** off the nose tip and each fin leading edge at the Mach angle `μ = asin(1/M)`: 2 px strokes, `rgba(255,255,255,0.25)`, length `3·w`.

Add airframe buffet at max-Q: camera shake `+5·q/qmax` px and a ±0.4 px sprite vibration.

## 5.6 Re-entry plasma

**Trigger:** `v > 2000 m/s` and `rho > 1e-5`. Drive intensity with Sutton–Graves (and display the number in the HUD — it is genuinely educational):
```js
const qdot = 1.7415e-4 * Math.sqrt(rho/Rn) * Math.pow(v,3);   // W/cm², Rn = nose radius (m)
const I = clamp(qdot/500, 0, 1);
```
**Bow shock cap:** an arc offset `0.15·w` ahead of the leading surface; fill between body and arc with an additive gradient:
```
0.00 rgba(255,255,255, 0.95*I)   0.25 rgba(255,210,128, 0.80*I)
0.55 rgba(255,107,43,  0.55*I)   0.80 rgba(180,35,122,  0.30*I)   1.00 transparent
```
The violet-pink `#B4237A` band at the outer edge is the signature of hot air plasma and nobody expects it — include it.

**Streaks:** 120–300 particles from the leading edge, velocity `-v̂ · (150..400 m/s)` in the vehicle frame, life 0.25–0.8 s. Draw as **streaks, not dots**: `moveTo(prevX,prevY); lineTo(x,y)`, `lineWidth 1–3 px`, additive, color ramp by age `#FFF3D0 → #FF9A32 → #7A1A10 → transparent`. Draw each twice, the second at 0.5 alpha and 1.5× length, for motion blur.

**Ablation:** 20/s dark specks from the heat shield, trailing and fading.
**Plasma blackout:** while `qdot > 300`, add noise/dropout to the HUD telemetry. Cheap, memorable, correct.

## 5.7 Sparks

3–8 px streaks, life 0.4–1.2 s, gravity on, drag `exp(-0.8·dt)`, drawn additively with an age color ramp `#FFFFE8 → #FFC24A → #FF6B1E → #7A2A0A`. Spawn 60–150 per event (ignition, staging pyro, structural failure, landing-leg contact).

---

# §6. The world

## 6.1 Sky as a function of altitude

Six 4-stop keyframes. **Interpolate in linear light**, not sRGB — sRGB lerping produces muddy purples:

```js
const lin = c => Math.pow(c/255, 2.2), srgb = c => Math.round(255*Math.pow(c, 1/2.2));
```

| h (m) | zenith | upper | mid | horizon |
|---|---|---|---|---|
| 0 | `#3C74C8` | `#5A94DD` | `#9EC4EA` | `#D7E6F2` |
| 4 000 | `#2A5CB8` | `#4A82D4` | `#8FB9E6` | `#CBDFEF` |
| 12 000 | `#14357E` | `#2A57A8` | `#6C9AD4` | `#B9D3EA` |
| 25 000 | `#06103A` | `#0E2160` | `#2B4E9C` | `#7FA7D8` |
| 50 000 | `#01041A` | `#040A2C` | `#0B1C58` | `#3E6BB0` |
| 80 000 | `#000006` | `#01021A` | `#04113C` | `#24509A` |
| ≥120 000 | `#000000` | `#000005` | `#01030F` | `#0A2A66` |

Gradient stops at y = 0.00 / 0.35 / 0.70 / 1.00 of the screen (or of the horizon position once curvature appears). **Cache the gradient object keyed by `round(h/250)`** — never rebuild per frame.

Above ~100 km the sky is pure black and the only color anywhere is the limb arc. That contrast is *the* "I am in space now" moment.

At dawn/dusk, blend the horizon stop toward `#FF8A4A` (sun side) and `#2A3E6E` (anti-sun side) by `clamp(-sunElev/12°, 0, 1)`.

## 6.2 Stars

**Fade timing driven by sky luminance, not a raw altitude ramp** — this makes it automatically correct:
```js
const skyLum = 0.2126*lin(zR)+0.7152*lin(zG)+0.0722*lin(zB);   // zenith
starAlpha = clamp(1 - skyLum/0.020, 0, 1) * (1 - sunGlareFactor);
```
Practically: faint at ~22 km, clear at ~40 km, full by ~70 km.

**`cStars` build (once, 1536²):** 1400 stars from `rngWorld`.
- 70%: radius 0.5–0.8 px, alpha 0.35–0.60
- 25%: radius 0.9–1.3 px, alpha 0.70
- 5%: radius 1.6–2.4 px, alpha 0.95, **plus a 4-point diffraction cross** (two 1 px lines, length 7 px, alpha 0.4)
- 15% get a color tint: `#FFD9B0` (warm) or `#CFE0FF` (cool)
- **Milky Way band:** a broad diagonal swath — 1200 dots at radius 0.4 px alpha 0.18, over a 3-pass soft band (three overlapping ellipses at alpha 0.05, `#8FA8D8`)

Draw with `drawImage`, tiled and offset. **Rotate the star field by the negative of the vehicle's angular position around the planet** so it feels inertial — the stars must NOT be locked to the screen once you are in orbit.

**Twinkle only below 40 km, and only for the brightest 5%.** Twinkling stars in vacuum is a physics error and an alert player will notice.

## 6.3 The sun

Screen-space, fixed angular size.
- Core: `#FFFFFF` disc, radius 16 px.
- Corona: radial gradient to `rgba(255,240,200,0)` at 6 × radius, `'lighter'`.
- **In atmosphere:** a large soft aureole (22 × radius, alpha 0.12) plus 3–4 lens ghosts along the line from the sun through screen centre — small discs, radii 6–20 px, alpha 0.05–0.12, colors `#77FFDD`, `#FFDDAA`, `#AADDFF`.
- **In vacuum:** kill the aureole entirely (no scattering medium), sharpen the disc, add a 6-spike diffraction star (6 lines, length 90 px, `rgba(255,250,235,0.18)`). Simultaneously harden the rocket's terminator (§2.2). The lighting model *changing* at the Kármán line is a beautiful, correct touch.

## 6.4 Cloud decks you fly through

| Layer | Altitude | Thickness | Sprites |
|---|---|---|---|
| C — stratus | 400–700 m | 300 m | 3 wispy |
| A — cumulus | 1 800–2 600 m | 800 m | 6 lumpy |
| B — cirrus | 8 000–11 000 m | 3 000 m | 3 streaky |

**Sprite build (`cClouds[i]`, 256×128, once):** 25–40 overlapping soft radial-gradient blobs, flat base / lumpy top, lit from the upper-left: top-left blobs `#FFFFFF` alpha 0.9, bottom-right blobs `#9BA6B4` alpha 0.55.

**Placement:** infinite horizontal lattice with hash-jittered positions so it tiles without visible repetition. Advect with `wind(h)`.

**Four rendering regimes** by `dy = camY − layerY`:
- `dy < −4·thickness` (far below): a thin bright band near the horizon, 6–14 px tall, `rgba(255,255,255,0.5)`.
- approaching: sprites grow and separate; scale `= 1/(1 + |dy|/4000)`.
- `|dy| < thickness` — **WHITEOUT.** Fill the screen with `rgba(245,248,252, 1 − |dy|/thickness)` and add 20–30 wisp sprites streaking past at `2.5 ×` the true vertical speed with heavy motion-blur stretching. Lasts ~0.8 s for a real rocket. It is spectacular and it is the moment the player believes the altitude number.
- above: draw the deck as a textured floor in perspective — squash sprites vertically by `1/(1 + dy/4000)`, fade the far edge into the haze color.

**Cloud shadows:** darken the ground under each cloud by 8% (`rgba(20,30,45,0.08)` ellipse).

## 6.5 Atmospheric haze and the limb

**Aerial perspective:** anything at world distance `d` blends toward the horizon color by `f = 1 − exp(−d/D)`, with `D = 8000 m` at sea level, `40 000 m` at 12 km, `∞` above 30 km. Implement per-layer: after drawing a far group, fill its bbox with the haze color at alpha `f`.

**Horizon glow band (below 30 km):** 60–140 px tall gradient from the horizon color at alpha 0.9 to transparent.

**The limb (above 30 km)** — this is the space-photo look. Three stacked arcs following the planet circle, drawn on black:
```
inner   6 px  rgba(255,255,255,0.55)
mid    18 px  rgba(120,190,255,0.50)
outer  60 px  rgba(30,90,200,0.28) → transparent
```
On the sun side at terminator crossings, insert an orange band `rgba(255,150,70,0.45)` between inner and mid.

## 6.6 Planet curvature — derived, not faked

```js
const R = 6.371e6;
const horizonDist = Math.sqrt(2*R*h + h*h);        // metres
const Rs  = R * ppm();                              // planet radius in px
const sag = (cssW*cssW)/(8*Rs);                     // chord sag in px
```
Rules:
- `sag < 1.5 px` → **draw the ground as a straight horizontal line.** Drawing curvature at 2 km altitude is the classic amateur tell; at 10 km the true sag is ~0.2 px.
- `1.5 px ≤ sag`, `Rs > 2.5·cssH` → draw the ground edge as a **quadratic Bézier** with control point at `(cssW/2, horizonY + 2·sag)`.
- `Rs ≤ 2.5·cssH` → switch to a **full circle** (`ctx.arc`), plus terminator and city lights.

Sanity table (1600 px wide viewport, zoom from §7.2):

| h | ppm | sag | look |
|---|---|---|---|
| 10 km | 0.234 | 0.2 px | flat (correct) |
| 60 km | 0.020 | 2.5 px | just perceptible |
| 150 km | 0.0035 | 14 px | clearly curved |
| 400 km | 0.0012 | 42 px | strong arc |
| ~1 200 km | 3.5e-4 | — | full disc |

**Planet disc fill:** radial gradient offset 25% toward the sun — `#4A7FC4` (ocean) core, `#3A6099` rim; overlay the `cContinent` map at alpha 0.85; then a terminator: a linear gradient perpendicular to the sun vector, `transparent → rgba(0,0,10,0.92)` with a 3% soft edge.

## 6.7 Terrain and city lights

**Near field (< 3 km):** `cTerrain` 512² tile of mottled ground — seeded blobs `#6E7A5E`/`#7A8563`/`#5F6B52`, field rectangles, roads as 1–2 px `#8C8478` lines. Drawn via `createPattern`, repeated. Plus:
- **Ocean band:** `#274C6B`, with 3 rows of specular glints (2 px `rgba(255,255,255,0.15)` dashes drifting at 3 px/s).
- **Buildings:** 6–10 rects (VAB, hangars, tank farm) with a lighter top face and — critically — **long cast shadows**: for each object a parallelogram of `rgba(20,25,35,0.35)` offset along the sun vector by `height·tan(sunElev)`. Shadows are what make a flat 2D ground read as 3D.
- Switch off the tile when it renders below 3 px/tile.

**Mid field (3–60 km):** `cContinent` (1024×512) generated once from seeded noise — land polys `#5C6B4F` / `#7A6E52` / `#8E8163`, rivers as 2 px `#3E5A72` polylines, coastline, cloud shadows.

**Night side — `cCity` (1024×512, once):** 40 cities, each a radial-gradient blob `rgba(255,196,120,0.55)` radius 8–40 px, filled with 60–300 individual 1 px `#FFE0A8` dots; highway strings of dots connecting the 12 largest. Draw with `'lighter'`, alpha ramping in as local sun elevation drops below 0°. The first night pass over a lit coastline is one of the biggest wow moments available, and it costs one `drawImage`.

**Aurora (optional, high latitude, night):** 5–8 vertical `#6BFFB0` ribbons, alpha 0.12, sine-animated, `'lighter'`.

## 6.8 Launch complex

- **Flame trench:** a dark trapezoid `#1E2226` below the vehicle with a 35° deflector wedge. Drives the plume split (§3.6).
- **Tower:** 2 vertical rails, `lineWidth 0.25 m`, `#4A5058`, each with a 0.08 m `#9AA4AE` highlight stroke on the sun side; 18–30 X-braces at `lineWidth 0.12 m`. Four platform decks as rects. A crew access arm. A white lightning mast with a **red aviation light blinking at 1 Hz** — a 3 px `#FF3B30` dot with a `'lighter'` halo. That blinking light reads as "real facility" instantly and costs nothing.
- **Umbilicals:** 2–3 catenary cables (`quadraticCurveTo`, `lineWidth 0.06 m`, `#3A4046`). At T−0 animate the vehicle-side attach point to the tower over 0.40 s with 15% overshoot.
- **Pre-launch venting:** white vapor jets from 2 points, puffing every 1.5–3 s.
- **Floodlights (night):** cones of `rgba(255,240,200,0.06)`, `'lighter'`, aimed at the vehicle.
- **LOD:** full detail below 500 m; a 6-line sketch from 500 m–3 km; gone above 3 km.

---

# §7. Camera

## 7.1 Frame-rate-independent damping

```js
const k = l => 1 - Math.exp(-l*dt);
cam.x += (tx - cam.x)*k(6.0);
cam.y += (ty - cam.y)*k(6.0);
cam.logPpm += (Math.log(targetPpm) - cam.logPpm)*k(2.5);   // ALWAYS smooth zoom in log space
cam.rot += angleDelta(targetRot, cam.rot)*k(3.0);
```
Linear zoom smoothing looks visibly wrong. Log space is mandatory.

## 7.2 Zoom vs altitude

Log-log linear interpolation between these anchors (1600×900, 40 m vehicle):

| h (m) | ppm | vehicle height on screen |
|---|---|---|
| 0 | 8.0 | 320 px |
| 200 | 5.0 | 200 px |
| 1 000 | 2.2 | 88 px |
| 5 000 | 0.55 | 22 px |
| 20 000 | 0.10 | 4 px → icon mode |
| 60 000 | 0.020 | — |
| 150 000 | 0.0035 | — |
| 400 000 | 0.0012 | — |
| 2 000 000 | 0.00018 | — |

```js
function targetPpmFor(h){
  const A=[[0,8],[200,5],[1e3,2.2],[5e3,.55],[2e4,.10],[6e4,.02],[1.5e5,.0035],[4e5,.0012],[2e6,1.8e-4]];
  // ... log-log lerp, clamp to ends
}
targetPpm = targetPpmFor(h) / (1 + 0.00045*speed);       // extra ~0.22× at orbital velocity
```

**Icon mode.** Once the vehicle would render below **14 px**, decouple the sprite: `spriteScale = max(ppm, 14/vehicleLength)`, blended in over 1 s so there is no pop. Above `ppm < 0.002`, cross-fade the sprite to a 10 px triangle + label.

**Clamps:** vehicle never below 14 px, never above 55% of screen height.

## 7.3 Framing and lead

- Launch: vehicle at **62%** down the screen (sky above it).
- Above 3 km: ease to **50%** (λ = 1.5).
- Descent/re-entry: **35%** (you see the ground you are falling toward).
- **Velocity lead:** offset the camera centre along `v̂` by `min(0.28·cssH, speed·0.35)` px. You should see where you are going.

## 7.4 Rotation modes

- `screen-up` (default, h < 30 km): `rot = 0`.
- `vehicle-up`: `rot = −veh.pitch`.
- `local-horizontal` (h > 100 km): `rot` aligns the planet's local up with screen up.

Blend with `smoothstep(30000, 90000, h)` for the first transition; slerp over 3 s for the second.

## 7.5 Shake

```js
let amp = A0 * (thrust/weight) * thr * Math.exp(-h/450) + 5*(q/qmax);   // A0 ≈ 9 px
if (h > 40000) amp *= 0.15;
if (pa < 100)  amp  = 0;                                                 // silence in vacuum
cam.shakeX  = amp * vnoise(t*26);
cam.shakeY  = amp * vnoise(t*31 + 17);
cam.shakeRot= amp * 0.00006 * vnoise(t*19 + 43);       // ±0.35° at amp 9
cam.zoomPulse = 1 + amp*0.00045*vnoise(t*23);          // ±0.4%
// plus a 4 Hz low-frequency sway at 0.3× amplitude
```
**Use value noise, never `Math.random()`.** And the *sudden stillness* the moment you leave the atmosphere is one of the most powerful moments in the whole experience — do not skip the vacuum cut-off.

**Ignition punch:** `±22 px` for 2 frames, decaying `exp(-t/0.15)`.

## 7.6 Staging punch

On separation: 0.22 s impulse at amp 16 px; a 60 ms full-screen `'lighter'` white fill at alpha 0.10; `targetPpm *= 0.82` for 0.6 s (so both bodies are in frame) then recover. Over the next 2 s the camera chooses a follow target — default the upper stage. **Bind a hotkey to follow the spent booster instead.** It is one of the most-loved features in SFS-likes and it is nearly free.

## 7.7 Map view transition — animate, never cut

Over 1.1 s, ease-in-out:
1. `ppm` continues shrinking to map scale;
2. a black overlay ramps to alpha 0.85;
3. orbital conic lines fade in with a 0.3 s delay;
4. the rocket sprite cross-fades to its icon;
5. the HUD swaps.

Draw the orbit as a **real ellipse from the orbital elements** — `ctx.ellipse(cx, cy, a·ppm, b·ppm, argPeriapsis, 0, 2π)` translated so a focus sits at the planet centre. Mark apoapsis/periapsis with labelled ticks. Dash the portion below the surface.

## 7.8 Cinematic idle

Even when nothing is happening, add a handheld drift: `±2 px` at ~0.15 Hz from `vnoise(t*0.9)`. A perfectly still camera is the sound of a diagram.

**Motion blur:** when `|screen velocity| > 25 px/frame`, draw the rocket sprite 3 times at `globalAlpha 0.25` along last frame's displacement.

---

# §8. Staging and destruction

## 8.1 Separation sequence (~1.2 s, physically driven)

| t | Event |
|---|---|
| 0.00 | **MECO.** Plume opacity → 0 over 0.25 s with 2–3 dimming *pulses* (engines do not stop instantly), then a 0.4 s pale residual cone at 25% length |
| 0.15 | **Pyro ring.** 30–60 sparks in a ring at the interstage plane; a white ellipse stroke `lineWidth 3 px, alpha 0.8` expanding to 1.4× over 0.12 s |
| 0.20 | **Sep motors.** 4 small solids at 30° outward: white-yellow cones 1.5 m long, 0.8 s burn, dense white smoke. Plus a symmetric cold-gas puff ring |
| 0.20→1.20 | Bodies separate at 2–4 m/s from a **real impulse** applied to both rigid bodies — never a scripted lerp |
| 0.35 | **Upper-stage ignition.** A bright glow *inside the interstage gap* before the plume forms, then a 0.4 s throttle ramp |

**Tumbling spent stage:** `ω = 0.3–1.4 rad/s` seeded from the sep-motor asymmetry, plus slight precession; aerodynamic torque then destabilises it. **Add the sunlight glint:** when the body normal aligns with the sun, flash a white specular:
```js
const glint = Math.pow(Math.max(0, Math.cos(bodyAngle - sunAngle)), 32);
ctx.globalCompositeOperation='lighter';
ctx.fillStyle = `rgba(255,252,240,${0.55*glint})`;   // over the body silhouette
```
Every piece of real staging footage has that rotating glint. It is the detail that makes a tumbling stage read as a metal object rather than a sprite.

**Fairing jettison:** two halves rotate outward about hinge points at 40°/s while translating 2 m/s. When `|angle| > 90°` you are seeing the **inside** — flip to a darker interior gradient (`#2A2E33 → #4A5158`) and add ring stiffeners. Half-shells that never show their inside look like cardboard.

**Interstage retention:** keep the ring attached to whichever stage owns it. Small detail, disproportionate authenticity.

## 8.2 RUD / explosion (1.5–4 s, layered)

| t | Layer |
|---|---|
| 0.00 | **Flash.** Radial gradient, radius 3 × vehicle length, `rgba(255,255,255,0.95) → rgba(255,220,150,0)`, additive, decay `exp(-t/0.06)`. Full-screen white at alpha 0.35 |
| 0.02–0.35 | **Fireball.** 8–14 billow lobes, `R(t) = Rmax·(1 − exp(-t/0.28))`, `R0 = 0.6·L`, `Rmax = 3.5·L`. Each lobe: `white core → #FFD24A → #FF6A1E → #8E2A08 → transparent`. Additive early; cross-fade to `source-over` at t = 0.35 by drawing both at complementary alpha. Buoyancy 12 m/s² → it mushrooms |
| 0.10 | **Blast ring** (atmosphere only). `r = 300·t^0.6` m, `rgba(255,240,220, 0.5·exp(-t/0.35))`, decaying `lineWidth`; plus a refraction pass using the §3.8 slice displacement |
| 0.15–3.0 | **Debris.** 40–90 chunks, each a 5–8 vertex irregular poly 0.3–3 m, inheriting vehicle velocity + radial impulse 30–160 m/s, `ω` up to 8 rad/s, real gravity and drag. Each trails smoke at 8/s. 25% glow (additive orange cooling to dark over 1.5 s); a few carry a small flame sprite |
| 0.20–4.0 | **Smoke ball.** 60–120 dark puffs, expanding, buoyant, with an additive orange internal rim that decays as the fireball dies |
| 0.4 / 0.9 / 1.6 | **Secondary deflagrations** at random offsets, 40% scale |

Camera: shake 26 px, then a slow zoom-out over 3 s.

**Vacuum contrast (educational and visually striking):** no blast ring, no lingering smoke, no buoyancy. The fireball is brief and perfectly spherical, and the debris expands ballistically forever in a clean radial starburst. Showing the player that the *same event* looks completely different without air is one of the best teaching moments in the game.

## 8.3 Structural failure short of RUD

If `q > qLimit` or `AoA > 20°` at high q: split the part list into two rigid bodies at the weakest joint, with a hinge that visibly **bends over 0.3 s** before letting go. Spawn sparks plus a 20 m white venting-propellant jet from the break — which then thrusts the pieces apart. Far more instructive than an instant explosion.

## 8.4 Landing

Ground-deflected plume again (§3.6) plus the dust ring (§4.4); legs animate stowed → 145° over 1.2 s with an overshoot bounce; touchdown puff; a permanent scorch decal on the pad.

---

# §9. Performance budget

Target **60 fps = 16.6 ms**. Aim for **≤ 9 ms** of JS + draw to leave headroom for GC and browser compositing.

| Stage | Budget |
|---|---|
| physics (fixed-step) | 1.0 ms |
| particle update | 1.2 ms |
| sky + stars + sun | 1.5 ms |
| clouds | 1.0 ms |
| rocket (1 drawImage + occasional rebuild) | 1.2 ms |
| plume | 2.0 ms |
| particle draw | 1.8 ms |
| post (bloom, shimmer, vignette) | 0.8 ms |
| HUD | 0.5 ms |

## 9.1 The fourteen rules

1. **Cache every static thing in an offscreen canvas.** See §1.1. In particular the rocket sprite — rebuild only on part-list change, ±12% size change, or a bucketed state change (legs / fins / soot 5 levels / gimbal 5 steps). Render at 1.35× needed size, cap 1024 px.
2. **Never build gradients in a loop.** `Map`-cache keyed by a quantized signature: sky by `round(h/250)`; plume by `(fuel, round(thr*10), round(log(pa)*4))`; body skins by `(skin, round(w*50))`.
3. **Batch by composite state.** Collect all additive draws into one `'lighter'` block. Keep total `save()/restore()` under 60 per frame.
4. **Cull with a 64 px margin.** Skip any particle or object whose screen bbox is off-canvas. Skip terrain detail below 3 px/tile. Skip clouds when `|dy| > 4·thickness` and above.
5. **Altitude LOD:**
   - `< 500 m` — everything: pad cloud, tower detail, ground texture, deflected plume, all particles.
   - `500 m – 3 km` — pad emission off, tower as 6 lines, ground texture at half res.
   - `3 – 25 km` — no tower; ground = 3-band gradient + continent map; clouds active; trail particles at 60%.
   - `25 – 100 km` — no clouds (unless below), no ground texture; limb + planet arc; plume in vacuum mode; trail at 10%.
   - `> 100 km` — planet circle + city lights + limb + stars; particles only for RCS and events. This should be a **< 4 ms** frame — exactly when timewarp needs the headroom.
6. **Adaptive quality.** Rolling 30-frame average. If > 19 ms for 20 consecutive frames, step down: (1) disable heat shimmer → (2) halve particle caps → (3) drop `cBloom`, use the 2-extra-draws fallback → (4) `renderScale = 0.8` → (5) disable cloud whiteout wisps. Step back up after 120 frames under 12 ms. Show the level in a debug HUD.
7. **Set the DPR transform once per resize**, never per frame.
8. **Fixed-step physics with render interpolation.** 120 Hz accumulator; render lerps between the last two states by `alpha`. This eliminates the sub-pixel jitter that makes motion look synthetic — it is a *visual* fix as much as a physics one. At timewarp > 1, switch to a bigger dt with a symplectic integrator and stop spawning particles entirely.
9. **No `ctx.filter` in the hot path.** It forces a separate surface. Allowed only on the ≤ ¼-res bloom buffer, and only at quality level 0.
10. **No `ctx.shadowBlur`, ever.** Use pre-blurred sprites or radial gradients.
11. **`Path2D` for static geometry** — rocket outline, tower lattice, terrain silhouette, bell contour. Build once, `ctx.fill(path)` under a transform.
12. **Text:** set `ctx.font` once per group; cache `measureText` widths per string for 1 s. Prefer a DOM HUD overlay to canvas text entirely.
13. **Typed arrays for particles** (§5.1), swap-with-last removal, zero allocation per frame.
14. **Memory ceiling ~40 MB** of offscreen canvases. A 2048² RGBA canvas is 16 MB — use 1536² for the star field, or split into two 1024² layers.

## 9.2 Cinematic post (all cached, all cheap)

- **Vignette:** one cached radial gradient, `transparent → rgba(0,0,8,0.35)`, `source-over`.
- **Film grain:** a 128² noise tile at `globalAlpha 0.02`, offset randomly each frame. Toggleable.
- **Contrast S-curve:** a cached full-screen `'overlay'` fill at very low alpha.
- **Letterbox:** two black bars easing in to 8% height over 0.4 s during launch, staging and re-entry, out after 2 s.
- **Photo mode:** pause, free pan/zoom, hide HUD, export via `canvas.toBlob`.

## 9.3 Educational overlays that do not break the look

Toggleable vector arrows with numeric labels — thrust `#37C46A`, drag `#E5484D`, gravity `#4C8DF6`, velocity `#FFFFFF` — drawn in screen space with a 2 px stroke and a 6 px arrowhead. A Mach readout that highlights the instant the vapor cone appears. A tooltip when `pe/pa` crosses 1.0: *"Your nozzle is now perfectly expanded — watch the plume."* Then, a moment later, the plume blooms. That is the lesson and the spectacle in the same frame.

---

# §10. Implementation order

Ship it in this sequence; each step is independently visible and each one buys real perceived realism.

1. Full-bleed canvas + camera + world transform + log zoom + damping. **(Biggest single win — the diagram becomes a scene.)**
2. Sky ramp + horizon + flat ground + pad.
3. Rocket sprite pipeline (skins, ribs, bells, sprite cache).
4. Plume v1: silhouette + core + glow + flicker, driven by `pa`, `pe`, `throttle`, fuel.
5. Particle system + pad smoke cloud with internal orange lighting.
6. Camera shake, ignition flash, exposure drop, shockwave.
7. Star field, sun, limb, curvature, planet disc, city lights.
8. Cloud decks + whiteout.
9. Shock diamonds, Mach disk, bloom, heat shimmer, anamorphic streak.
10. Staging sequence, tumbling glint, fairings.
11. Re-entry plasma, vapor cone, explosions and debris.
12. Map-view transition, photo mode, adaptive quality, cinematic post.

Steps 1–6 alone will take the visualization from "toy diagram" to "that looks like a real launch."