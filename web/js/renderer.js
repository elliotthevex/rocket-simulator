/* =====================================================================
   RENDERER — Steps 4-5 of the build order: full-bleed world canvas,
   metres-based log-zoom camera, sky/stars/curvature, cached rocket
   sprite, pressure-derived plume, particles, pad cloud, shake/flash.
   This is "the video" -- see design/visual-realism.md for every formula.
   Requires physics-core.js (RSX namespace) to already be loaded.
   ===================================================================== */
"use strict";

RSX.render = {};
const RR = RSX.render;

/* ---------------------------------------------------------------------
   Coherent value noise -- NEVER Math.random() for flicker/shake/turbulence.
   Per-frame independent randomness reads as broken rendering; 1-D value
   noise reads as combustion instability / airframe vibration.
--------------------------------------------------------------------- */
RR.vnoise = function (x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const h = n => { n = (n << 13) ^ n; return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824; };
  return h(i) * (1 - u) + h(i + 1) * u;
};
RR.flicker = t => 1 + 0.06 * RR.vnoise(t * 41) + 0.04 * RR.vnoise(t * 19 + 7.3) + 0.03 * RR.vnoise(t * 8 + 2.1);

/* ---------------------------------------------------------------------
   Fuel visual palettes (design/visual-realism.md §3.3)
--------------------------------------------------------------------- */
RR.FUEL_VIS = {
  solid: { baseOpacity: 0.95, diamondStrength: 0.25, smokeRate: 3.0,
    core: ["#FFFFFF", "#FFF7D6", "#FFE08A"], mid: ["#FFC246", "#FF9A25"],
    outer: ["#E8641A", "rgba(120,40,10,0)"], glow: "255,196,90",
    smokeCol: ["#E6E3DC", "#8E8A83"] },
  rp1: { baseOpacity: 0.85, diamondStrength: 0.70, smokeRate: 1.4,
    core: ["#FFF3D0", "#FFD27A"], mid: ["#FF9A32", "#F4691B"],
    outer: ["#B23A0C", "rgba(90,28,8,0)"], glow: "255,140,50",
    smokeCol: ["#6B5F52", "#2F2A25"] },
  ch4: { baseOpacity: 0.55, diamondStrength: 1.00, smokeRate: 0.25,
    core: ["#FFFFFF", "#EAF4FF"], mid: ["#9FC8FF", "#5F9BF0"],
    outer: ["#2B62C4", "rgba(20,50,120,0)"], glow: "150,200,255",
    smokeCol: ["#F4F8FB", "#C3CDD6"], hotLip: "#FFD9A0" },
  lh2: { baseOpacity: 0.22, diamondStrength: 1.20, smokeRate: 0.0,
    core: ["rgba(230,245,255,1)", "rgba(200,228,255,1)"], mid: ["rgba(170,205,255,1)", "rgba(130,175,245,1)"],
    outer: ["rgba(110,150,230,0.5)", "rgba(60,100,200,0)"], glow: "180,215,255",
    smokeCol: ["#FFFFFF", "#DCE6EE"], diamondCol: "#DCE9FF" },
};

/* ---------------------------------------------------------------------
   Sky gradient by altitude -- 6 keyframes, interpolated in LINEAR light
   (sRGB lerp produces muddy purples). Cached by round(h/250).
--------------------------------------------------------------------- */
const SKY_KEYFRAMES = [
  [0, "#3C74C8", "#5A94DD", "#9EC4EA", "#D7E6F2"],
  [4000, "#2A5CB8", "#4A82D4", "#8FB9E6", "#CBDFEF"],
  [12000, "#14357E", "#2A57A8", "#6C9AD4", "#B9D3EA"],
  [25000, "#06103A", "#0E2160", "#2B4E9C", "#7FA7D8"],
  [50000, "#01041A", "#040A2C", "#0B1C58", "#3E6BB0"],
  [80000, "#000006", "#01021A", "#04113C", "#24509A"],
  [120000, "#000000", "#000005", "#01030F", "#0A2A66"],
];
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const LIN = c => Math.pow(c / 255, 2.2);
const SRGB = c => Math.round(255 * Math.pow(RSX.clamp(c, 0, 1), 1 / 2.2));
function lerpColorLinear(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[i] = SRGB(LIN(a[i]) + (LIN(b[i]) - LIN(a[i])) * t);
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}
// Mars's thin CO2 atmosphere barely Rayleigh-scatters at all -- its real
// sky colour comes from suspended dust instead, giving the famous dusty
// butterscotch/salmon tone photographed by every Mars lander, never Earth's
// blue. Same keyframe shape as SKY_KEYFRAMES (compressed to mars.zAtm=60km),
// warm/dusty at the surface fading to black at the edge of its atmosphere.
RR.MARS_SKY_KEYFRAMES = [
  [0, "#8A6248", "#B98A5E", "#D9AE84", "#E8C9A0"],
  [10000, "#5C4438", "#8A6048", "#B08560", "#CBA478"],
  [25000, "#2E2230", "#4A3438", "#6E5048", "#8E6858"],
  [40000, "#0F0C18", "#1C1620", "#302430", "#463838"],
  [60000, "#000000", "#050408", "#0C0A10", "#181418"],
];
RR.skyColorsAt = function (h, keyframes) {
  const KF = keyframes || SKY_KEYFRAMES;
  let i = 0;
  while (i < KF.length - 2 && h >= KF[i + 1][0]) i++;
  const A = KF[i], B = KF[i + 1];
  const t = RSX.clamp((h - A[0]) / (B[0] - A[0]), 0, 1);
  return { zenith: lerpColorLinear(A[1], B[1], t), upper: lerpColorLinear(A[2], B[2], t),
    mid: lerpColorLinear(A[3], B[3], t), horizon: lerpColorLinear(A[4], B[4], t) };
};

/* ---------------------------------------------------------------------
   Star field -- built once into an offscreen canvas.
--------------------------------------------------------------------- */
RR.buildStarField = function (size, seed) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  const rng = RSX.mulberry32(seed);
  for (let i = 0; i < 1400; i++) {
    const x = rng() * size, y = rng() * size;
    const pick = rng();
    let r, a;
    if (pick < 0.70) { r = 0.5 + rng() * 0.3; a = 0.35 + rng() * 0.25; }
    else if (pick < 0.95) { r = 0.9 + rng() * 0.4; a = 0.70; }
    else { r = 1.6 + rng() * 0.8; a = 0.95; }
    let col = "255,255,255";
    if (rng() < 0.15) col = rng() < 0.5 ? "255,217,176" : "207,224,255";
    ctx.fillStyle = `rgba(${col},${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (pick >= 0.95) {
      ctx.strokeStyle = `rgba(${col},${a * 0.4})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y);
      ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
    }
  }
  // milky way band
  ctx.save();
  ctx.translate(size * 0.5, size * 0.5); ctx.rotate(0.5);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = "rgba(143,168,216,0.05)";
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.6, size * 0.09 * (i + 1), 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  for (let i = 0; i < 1200; i++) {
    const x = rng() * size, y = size * 0.5 + (rng() - 0.5) * size * 0.25;
    ctx.fillStyle = "rgba(200,210,230,0.18)";
    ctx.beginPath(); ctx.arc(x, y, 0.4, 0, Math.PI * 2); ctx.fill();
  }
  return c;
};

/* ---------------------------------------------------------------------
   Camera. World: metres, +y up, origin at the pad (planet centre is at
   (0,-R)). Screen: px, +y down. (design/visual-realism.md §1.2, §7)
--------------------------------------------------------------------- */
// logPpm's initial 28.0 must match PPM_ANCHORS[0] just below, AND game.html's
// iconPpmSmoothed seed -- keeping all three in sync means the icon-mode zoom
// clamp (game.html §7.2) starts at iconScale=1 (no boost, no pop) while
// sitting on the pad, instead of a discontinuity on the very first frame.
RR.makeCamera = () => ({
  x: 0, y: 30, logPpm: Math.log(28.0), rot: 0,
  shakeX: 0, shakeY: 0, shakeRot: 0,
  framingY: 0.62, targetFramingY: 0.62,
});

// [0]'s 28 must match makeCamera()'s initial logPpm above -- see the comment there.
const PPM_ANCHORS = [[0, 28], [200, 5], [1e3, 2.2], [5e3, 0.55], [2e4, 0.10], [6e4, 0.02], [1.5e5, 0.0035], [4e5, 0.0012], [2e6, 1.8e-4]];
RR.targetPpmFor = function (h) {
  h = Math.max(h, 0);
  let i = 0;
  while (i < PPM_ANCHORS.length - 2 && h >= PPM_ANCHORS[i + 1][0]) i++;
  const [h0, p0] = PPM_ANCHORS[i], [h1, p1] = PPM_ANCHORS[i + 1];
  const lh0 = Math.log(Math.max(h0, 1)), lh1 = Math.log(Math.max(h1, 1));
  const lp0 = Math.log(p0), lp1 = Math.log(p1);
  const lh = Math.log(Math.max(h, 1));
  const t = h0 === 0 ? RSX.clamp(h / h1, 0, 1) : RSX.clamp((lh - lh0) / (lh1 - lh0), 0, 1);
  return Math.exp(lp0 + (lp1 - lp0) * t);
};

// Fixed camera zoom, per request: hold a constant ON-SCREEN size for the
// rocket always, instead of pulling back with altitude/speed (design/
// visual-realism.md §7.2's own approach). This must be a FRACTION OF
// SCREEN HEIGHT, not a fixed px/m constant -- a fixed px/m value looks
// "zoomed out" on a wide desktop window even though it's the exact same
// absolute size that read fine on a narrow one (reported directly: fine on
// a narrow pane, invisible on a wide desktop browser at the same ppm).
// RR.targetPpmFor() is left intact/unused above in case zoom-with-altitude
// is ever wanted back.
const VEHICLE_SCREEN_FRACTION = 0.28; // rocket occupies ~28% of screen height

RR.updateCamera = function (cam, target, dt, t) {
  const k = l => 1 - Math.exp(-l * dt);
  const h = target.alt;
  const vehicleLenM = target.vehicleLengthM || 8.6;
  const cssH = target.cssH || 600;
  let targetPpm = (VEHICLE_SCREEN_FRACTION * cssH) / vehicleLenM;
  cam.x += (target.x - cam.x) * k(6.0);
  cam.y += (target.y - cam.y) * k(6.0);
  cam.logPpm += (Math.log(targetPpm) - cam.logPpm) * k(2.5);

  if (h < 3000) cam.targetFramingY = 0.62;
  else if (h < 3000 * 1.5) cam.targetFramingY = 0.62 + (0.50 - 0.62) * RSX.clamp((h - 3000) / 1500, 0, 1);
  else cam.targetFramingY = 0.50;
  if (target.descending) cam.targetFramingY = 0.35;
  cam.framingY += (cam.targetFramingY - cam.framingY) * k(1.5);

  // Shake disabled per request -- camera stays put regardless of thrust/Q.
  cam.shakeX = 0;
  cam.shakeY = 0;
  cam.shakeRot = 0;
};

RR.applyCamera = function (ctx, cam, cssW, cssH, dpr) {
  const p = Math.exp(cam.logPpm);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(cssW * 0.5 + cam.shakeX, cssH * cam.framingY + cam.shakeY);
  ctx.rotate(cam.rot + cam.shakeRot);
  ctx.scale(p, -p);
  ctx.translate(-cam.x, -cam.y);
  return p;
};

/* ---------------------------------------------------------------------
   Planet curvature (design/visual-realism.md §6.6) -- derived, not faked.
--------------------------------------------------------------------- */
RR.groundGeometry = function (ppm, planetR, cssW, cssH) {
  const Rs = planetR * ppm;
  const sag = (cssW * cssW) / (8 * Rs);
  if (sag < 1.5) return { mode: "flat" };
  if (Rs > 2.5 * cssH) return { mode: "bezier", sag };
  return { mode: "disc", Rs };
};

/* ---------------------------------------------------------------------
   Rocket vector art: skin gradients, ogive nose, ribbed body, fins,
   engine bell w/ gimbal. All drawn in BODY frame: origin at nose tip
   (matches the physics station convention), +y AFT, metres.
   veh: {parts:[{kind,len,dia,skin,sTop}], nozzle:{throatD,exitD}, gimbal,
         sootLevel (0..1), sEngineTip (m from nose)}
--------------------------------------------------------------------- */
const SKINS = {
  white: [[0.00, "#4A4F57"], [0.08, "#7C838C"], [0.22, "#C9CFD6"], [0.38, "#F2F5F8"],
    [0.46, "#FFFFFF"], [0.52, "#F0F3F6"], [0.70, "#C3C9D1"], [0.86, "#868D96"], [1.00, "#3E434A"]],
  steel: [[0.00, "#2E3338"], [0.10, "#565E66"], [0.26, "#9AA4AE"], [0.40, "#D6DEE6"],
    [0.47, "#F6FAFF"], [0.55, "#C8D2DC"], [0.72, "#8B959F"], [0.88, "#4E555C"], [1.00, "#262A2E"]],
  black: [[0.00, "#0A0C0E"], [0.15, "#1A1E22"], [0.42, "#33393F"], [0.50, "#3E454C"], [0.65, "#262B30"], [1.00, "#08090B"]],
};

RR.ogivePath = function (L, R, n) {
  n = n || 24;
  const rho = (R * R + L * L) / (2 * R);
  const p = new Path2D(); p.moveTo(0, L); // start at the BASE centre, not the tip
  for (let i = n; i >= 0; i--) { const x = L * i / n; const y = Math.sqrt(Math.max(rho * rho - (L - x) * (L - x), 0)) - (rho - R); p.lineTo(y, x); }
  for (let i = 0; i <= n; i++) { const x = L * i / n; const y = Math.sqrt(Math.max(rho * rho - (L - x) * (L - x), 0)) - (rho - R); p.lineTo(-y, x); }
  p.closePath(); return p;
};

RR.bellPath = function (Rt, Re, Ln, n) {
  n = n || 18;
  const p = new Path2D(); p.moveTo(-Rt, 0);
  for (let i = 0; i <= n; i++) { const u = i / n, r = Rt + (Re - Rt) * Math.pow(u, 0.6); p.lineTo(-r, u * Ln); }
  for (let i = n; i >= 0; i--) { const u = i / n, r = Rt + (Re - Rt) * Math.pow(u, 0.6); p.lineTo(r, u * Ln); }
  p.closePath(); return p;
};

function skinGradient(ctx, w, skinKey, sootLevel) {
  const stops = SKINS[skinKey] || SKINS.white;
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  for (const [s, hex] of stops) g.addColorStop(s, hex);
  return g;
}

/**
 * Draw one cylindrical body segment [0,len] (local +y = aft), width `dia`.
 */
RR.drawBodySegment = function (ctx, len, dia, skinKey, ppm, sootLevel) {
  const w = dia;
  ctx.save();
  ctx.fillStyle = skinGradient(ctx, w, skinKey);
  ctx.fillRect(-w / 2, 0, w, len);

  const lw = m => Math.max(0.6 / ppm, m);
  // stringer ribs every 1.5m, paired dark/light lines
  if (1.5 * ppm >= 4) {
    for (let y = 1.5; y < len; y += 1.5) {
      ctx.strokeStyle = "rgba(0,0,0,0.30)"; ctx.lineWidth = lw(0.02);
      ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.beginPath(); ctx.moveTo(-w / 2, y + 0.025); ctx.lineTo(w / 2, y + 0.025); ctx.stroke();
    }
  }
  // longitudinal seams (asymmetric so it doesn't read as a wireframe)
  if (w * ppm >= 24) {
    ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = lw(0.012);
    for (const f of [-0.34, 0.05, 0.36]) { ctx.beginPath(); ctx.moveTo(f * w, 0); ctx.lineTo(f * w, len); ctx.stroke(); }
  }
  // joint AO at bottom edge, rim light at top
  let g = ctx.createLinearGradient(0, len - 0.18, 0, len);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.fillStyle = g; ctx.fillRect(-w / 2, len - 0.18, w, 0.18);
  g = ctx.createLinearGradient(0, 0, 0, len * 0.12);
  g.addColorStop(0, "rgba(255,255,255,0.06)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(-w / 2, 0, w, len * 0.12);
  // soot near the aft end
  if (sootLevel > 0) {
    ctx.fillStyle = `rgba(24,18,14,${0.45 * sootLevel})`;
    ctx.fillRect(-w / 2, Math.max(len - 1.5, 0), w, Math.min(1.5, len));
  }
  ctx.restore();
};

RR.drawNoseCone = function (ctx, len, dia, skinKey, ppm) {
  ctx.save();
  const path = RR.ogivePath(len, dia / 2);
  ctx.fillStyle = skinGradient(ctx, dia, skinKey);
  ctx.fill(path);
  const g = ctx.createRadialGradient(-0.15 * dia, len * 0.35, 0, -0.15 * dia, len * 0.35, 0.5 * dia);
  g.addColorStop(0, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.fill(path);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#22262A"; ctx.beginPath(); ctx.arc(0, 0.02, Math.max(0.08, 0.6 / ppm), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

RR.drawFins = function (ctx, dia, rootChord, span, sweepFrac, len, ppm) {
  const R = dia / 2;
  const Cr = rootChord, Ct = 0.40 * Cr, S = span != null ? span : 0.85 * R, sweep = sweepFrac != null ? sweepFrac : 0.55 * Cr;
  const drawOne = (mirror, scale, dark) => {
    ctx.save();
    ctx.scale(mirror, 1);
    if (scale !== 1) ctx.scale(scale, scale);
    const p = new Path2D();
    p.moveTo(R, len - Cr); p.lineTo(R + S, len - Cr - sweep - Ct); p.lineTo(R + S, len - Cr - sweep); p.lineTo(R, len); p.closePath();
    const g = ctx.createLinearGradient(R, 0, R + S, 0);
    g.addColorStop(0, dark ? "#5A6167" : "#8C949C"); g.addColorStop(1, dark ? "#33383D" : "#545B62");
    ctx.fillStyle = g; ctx.fill(p);
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = Math.max(0.4 / ppm, 0.03); ctx.stroke(p);
    ctx.restore();
  };
  drawOne(1, 1, false);
  drawOne(-1, 1, false);
  drawOne(1, 0.22, true); // foreshortened third fin implying depth
};

RR.drawEngineBell = function (ctx, Rt, Re, gimbalRad, throttle, sootLevel) {
  const Ln = 1.4 * (Re - Rt) / Math.tan(15 * Math.PI / 180);
  ctx.save();
  ctx.rotate(gimbalRad);
  const path = RR.bellPath(Rt, Re, Ln);
  const g = ctx.createLinearGradient(-Re, 0, Re, 0);
  [[0.00, "#1B1F23"], [0.18, "#3B4248"], [0.34, "#6E7880"], [0.46, "#9AA6B0"], [0.50, "#B4C0C9"], [0.56, "#8E99A2"], [0.75, "#4A5157"], [1.00, "#171A1D"]]
    .forEach(([s, c]) => g.addColorStop(s, c));
  ctx.fillStyle = g; ctx.fill(path);
  if (sootLevel > 0) { ctx.fillStyle = `rgba(20,14,10,${0.45 * sootLevel})`; ctx.fill(path); }
  // exit glow
  ctx.save(); ctx.clip(path);
  const eg = ctx.createRadialGradient(0, Ln, 0, 0, Ln, Re);
  if (throttle > 0.02) {
    eg.addColorStop(0, `rgba(255,246,224,${throttle})`); eg.addColorStop(0.5, `rgba(255,180,80,${0.3 * throttle})`); eg.addColorStop(1, "rgba(255,180,80,0)");
    ctx.globalCompositeOperation = "lighter";
  } else {
    eg.addColorStop(0, "#0B0D0F"); eg.addColorStop(1, "#23282C");
  }
  ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(0, Ln, Re, Re * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
  return Ln;
};

/* ---------------------------------------------------------------------
   The plume -- pressure-derived, per design/visual-realism.md §3.
   motor: real engine object from physics-core (has .nozzle, .exitMach,
   .propellant). pc: current chamber pressure (Pa). pa: ambient (Pa).
   throttle: 0..1. fuelKey: 'solid'|'rp1'|'ch4'|'lh2'. t: sim time (s).
   Drawn in the SAME body frame as the engine bell, +y aft, nozzle exit
   at local y = nozzleExitY (i.e. plume extends toward +y = aft = "down"
   in body frame, matching physics station convention).
--------------------------------------------------------------------- */
RR.drawPlume = function (ctx, motor, pc, pa, throttle, fuelKey, t, nozzleExitY, ppm) {
  if (pc <= 0 || throttle <= 0.001) return;
  const FUEL = RR.FUEL_VIS[fuelKey] || RR.FUEL_VIS.rp1;
  const De = motor.nozzle.exitD;
  const pe = RSX.peIdeal(motor, pc);
  const paSafe = Math.max(pa, 20);
  const pRatio = pe / paSafe;
  const atm = Math.min(pa / 101325, 1);

  const halfAngleDeg = RSX.clamp(2.5 + 52 * Math.pow(1 - atm, 1.25) * Math.pow(RSX.clamp(pRatio, 0.25, 6), 0.28), 2, 60);
  const flare = RSX.clamp(Math.pow(pRatio, 0.33), 0.55, 3.2);
  const We = 0.5 * De * flare;
  const flick = RR.flicker(t);
  const Lcore = De * (3.0 + 4.0 * throttle) * (0.70 + 0.60 * (1 - atm)) * flick;
  const Louter = Lcore * (2.4 + 5.0 * (1 - atm));
  let op = FUEL.baseOpacity * (0.35 + 0.65 * throttle) * (0.30 + 0.70 * Math.pow(atm, 0.45)) * flick;
  if (fuelKey === "lh2" && atm > 0.5) op *= 0.70;
  op = RSX.clamp(op, 0, 1);

  const cell0 = 1.306 * De * Math.sqrt(Math.max(motor.exitMach * motor.exitMach - 1, 0.2));
  const wobble = 0.05 * We * RR.vnoise(t * 13 + 31);

  ctx.save();
  ctx.translate(0, nozzleExitY);
  // plume points AFT (+y in body frame); build path with s measured downward (+y)
  function plumePath(Louter_) {
    const tan = Math.tan(halfAngleDeg * Math.PI / 180), P = new Path2D(), N = 22;
    const w = s => We * (1 + tan * s / We * 0.55) * (1 + 0.22 * Math.pow(0.85, s / cell0) * Math.cos(2 * Math.PI * s / cell0)) * (1 - 0.35 * Math.pow(s / Louter_, 3));
    P.moveTo(-We, 0);
    for (let i = 1; i <= N; i++) { const s = Louter_ * i / N; P.lineTo(-w(s) + wobble * (i / N), s); }
    for (let i = N; i >= 1; i--) { const s = Louter_ * i / N; P.lineTo(w(s) + wobble * (i / N), s); }
    P.lineTo(We, 0); P.closePath(); return P;
  }

  ctx.globalCompositeOperation = "lighter";

  // L0 ambient glow halo
  if (pa > 5000) {
    const g = ctx.createRadialGradient(0, -0.15 * De, 0, 0, -0.15 * De, 3.5 * We);
    g.addColorStop(0, `rgba(${FUEL.glow},${0.55 * op})`); g.addColorStop(0.35, `rgba(${FUEL.glow},${0.22 * op})`); g.addColorStop(1, `rgba(${FUEL.glow},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -0.15 * De, 3.5 * We, 0, Math.PI * 2); ctx.fill();
  }

  // L1 outer diffuse envelope, 3x fake-blur passes
  const outerPath = plumePath(Louter);
  const og = ctx.createLinearGradient(0, 0, 0, Louter);
  og.addColorStop(0.00, hexToRgba(FUEL.mid[0], 0.30 * op));
  og.addColorStop(0.30, hexToRgba(FUEL.mid[1], 0.20 * op));
  og.addColorStop(0.70, hexToRgba(FUEL.outer[0], 0.10 * op));
  og.addColorStop(1.00, FUEL.outer[1].startsWith("rgba") ? FUEL.outer[1] : hexToRgba(FUEL.outer[1], 0));
  for (const scale of [1.0, 1.25, 1.6]) {
    ctx.save(); ctx.scale(scale, scale); ctx.globalAlpha = 0.34; ctx.fillStyle = og; ctx.fill(outerPath); ctx.restore();
  }

  // L2 shock diamonds
  if (pa > 2000 && Math.abs(pRatio - 1) > 0.08) {
    let cell = cell0, s = 1.15 * De;
    const n = RSX.clamp(Math.round(4 + 6 * Math.abs(Math.log(pRatio))), 2, 9);
    for (let i = 0; i < n && s < Louter; i++) {
      const decay = Math.pow(0.85, i) * FUEL.diamondStrength * op;
      const rx = 0.30 * We, ry = 0.42 * cell;
      const g = ctx.createRadialGradient(0, s, 0, 0, s, Math.max(rx, ry));
      const dcol = FUEL.diamondCol || FUEL.core[0];
      g.addColorStop(0, hexToRgba(dcol, 0.90 * decay)); g.addColorStop(0.5, hexToRgba(FUEL.mid[0], 0.35 * decay)); g.addColorStop(1, hexToRgba(FUEL.mid[0], 0));
      ctx.save(); ctx.translate(0, s); ctx.scale(1, ry / Math.max(rx, 1e-6));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      s += cell; cell *= 0.88;
    }
  }

  // L4 inner core
  const coreLen = Math.min(Lcore, Louter);
  const ig = ctx.createLinearGradient(0, 0, 0, coreLen);
  ig.addColorStop(0.00, hexToRgba(FUEL.core[0], 0.95 * op));
  ig.addColorStop(0.35, hexToRgba(FUEL.core[1], 0.75 * op));
  ig.addColorStop(0.70, hexToRgba(FUEL.mid[0], 0.35 * op));
  ig.addColorStop(1.00, hexToRgba(FUEL.mid[0], 0));
  const innerPath = new Path2D();
  const wIn = s => 0.45 * We * Math.max(0, 1 - s / (0.35 * coreLen || 1));
  innerPath.moveTo(-0.45 * We, 0);
  for (let i = 1; i <= 12; i++) { const s = coreLen * i / 12; innerPath.lineTo(-wIn(s), s); }
  for (let i = 12; i >= 1; i--) { const s = coreLen * i / 12; innerPath.lineTo(wIn(s), s); }
  innerPath.closePath();
  ctx.fillStyle = ig; ctx.fill(innerPath);
  if (FUEL.hotLip) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = FUEL.hotLip; ctx.fillRect(-0.2 * We, 0, 0.4 * We, 0.15 * coreLen);
    ctx.globalAlpha = 1;
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
  return { halfAngleDeg, Louter, op, We };
};

function hexToRgba(hex, alpha) {
  if (hex.startsWith("rgba")) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ---------------------------------------------------------------------
   Auto-iris exposure + ignition flash (screen-space, design §3.9, §4.1)
--------------------------------------------------------------------- */
RR.drawExposure = function (ctx, cssW, cssH, op, throttle, tSinceIgnition, dpr) {
  const flashE = tSinceIgnition != null ? Math.exp(-tSinceIgnition / 0.30) : 0;
  const exposure = 0.18 * RSX.clamp(op * throttle, 0, 1) * Math.max(flashE, 0.15);
  if (exposure <= 0.001) return;
  ctx.setTransform(dpr || 1, 0, 0, dpr || 1, 0, 0);
  ctx.fillStyle = `rgba(0,0,0,${exposure})`; ctx.fillRect(0, 0, cssW, cssH);
};
RR.drawIgnitionFlash = function (ctx, cssW, cssH, nx, ny, De, ppm, dt, dpr) {
  if (dt > 0.4) return;
  const a = 0.90 * Math.exp(-dt / 0.12);
  ctx.setTransform(dpr || 1, 0, 0, dpr || 1, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, 6 * De * ppm);
  g.addColorStop(0, `rgba(255,245,220,${a})`); g.addColorStop(0.4, `rgba(255,200,120,${a * 0.4})`); g.addColorStop(1, "rgba(255,180,80,0)");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(nx, ny, 6 * De * ppm, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(255,240,215,${0.35 * Math.exp(-dt / 0.09)})`; ctx.fillRect(0, 0, cssW, cssH);
  ctx.globalCompositeOperation = "source-over";
};

/* ---------------------------------------------------------------------
   Particle system -- struct-of-arrays, pre-allocated, swap-with-last.
   type: 0=smoke 1=spark
--------------------------------------------------------------------- */
RR.makeParticles = function (max) {
  max = max || 1800;
  return {
    max, n: 0,
    x: new Float32Array(max), y: new Float32Array(max),
    vx: new Float32Array(max), vy: new Float32Array(max),
    age: new Float32Array(max), life: new Float32Array(max),
    r: new Float32Array(max), r0: new Float32Array(max),
    rot: new Float32Array(max), rotv: new Float32Array(max),
    seed: new Float32Array(max), type: new Uint8Array(max),
  };
};
RR.spawnParticle = function (P, x, y, vx, vy, r0, life, type, seed) {
  let i;
  if (P.n < P.max) { i = P.n++; }
  else { i = 0; } // overflow: overwrite the oldest slot (index 0 is fine for a soft cap)
  P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy;
  P.age[i] = 0; P.life[i] = life; P.r[i] = r0; P.r0[i] = r0;
  P.rot[i] = seed * Math.PI * 2; P.rotv[i] = (seed - 0.5) * 0.5;
  P.type[i] = type; P.seed[i] = seed;
};
RR.updateParticles = function (P, dt) {
  let w = 0;
  for (let i = 0; i < P.n; i++) {
    P.age[i] += dt;
    if (P.age[i] >= P.life[i]) continue; // drop (compact below)
    const drag = Math.exp(-0.55 * dt);
    P.vx[i] *= drag; P.vy[i] *= drag;
    // sparks (type 1) fall under real gravity per design doc §5.7; smoke
    // (type 0) instead gets a delayed upward buoyancy once it's had time to
    // billow -- the two types never share a fall/rise behavior.
    if (P.type[i] === 1) P.vy[i] -= 9.8 * dt;
    else if (P.age[i] > 1.2) P.vy[i] += 3.5 * dt;
    P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
    P.r[i] = P.r0[i] * (1 + 7 * Math.min(P.age[i], 2.5) * Math.exp(-P.age[i] / 2.5) / P.r0[i] * 0.15);
    P.rot[i] += P.rotv[i] * dt;
    if (w !== i) {
      P.x[w] = P.x[i]; P.y[w] = P.y[i]; P.vx[w] = P.vx[i]; P.vy[w] = P.vy[i];
      P.age[w] = P.age[i]; P.life[w] = P.life[i]; P.r[w] = P.r[i]; P.r0[w] = P.r0[i];
      P.rot[w] = P.rot[i]; P.rotv[w] = P.rotv[i]; P.type[w] = P.type[i]; P.seed[w] = P.seed[i];
    }
    w++;
  }
  P.n = w;
};
RR.buildPuffSprite = function (size) {
  const c = document.createElement("canvas"); c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.6, "rgba(255,255,255,0.4)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
};
const _tintedPuffCache = {};
function tintedPuffSprite(colorHex, size) {
  size = size || 128;
  const key = colorHex + ":" + size;
  if (_tintedPuffCache[key]) return _tintedPuffCache[key];
  const c = document.createElement("canvas"); c.width = size; c.height = size;
  const tctx = c.getContext("2d");
  const [r, g, b] = hexToRgb(colorHex);
  const grad = tctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`); grad.addColorStop(0.6, `rgba(${r},${g},${b},0.4)`); grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  tctx.fillStyle = grad; tctx.fillRect(0, 0, size, size);
  return _tintedPuffCache[key] = c;
}
RR.drawSmokeParticles = function (ctx, P, puffSprite, tintCol, ppm) {
  // Exhaust smoke now actually uses its propellant's real colour (FUEL_VIS's
  // smokeCol, defined from the start but never wired up here) -- sooty
  // beige-grey for kerosene, near-white for methane, pure white steam for
  // hydrogen -- instead of always drawing the same plain white puff.
  const fuel = tintCol && RR.FUEL_VIS[tintCol];
  const sprite = fuel ? tintedPuffSprite(fuel.smokeCol[0]) : puffSprite;
  for (let i = 0; i < P.n; i++) {
    if (P.type[i] !== 0) continue;
    const lifeF = 1 - P.age[i] / P.life[i];
    const alpha = 0.55 * Math.pow(Math.max(lifeF, 0), 1.6);
    if (alpha <= 0.01) continue;
    const R = P.r[i];
    ctx.save();
    ctx.translate(P.x[i], P.y[i]); ctx.rotate(P.rot[i]);
    ctx.globalAlpha = alpha;
    const sizePx = R;
    ctx.drawImage(sprite, -sizePx, -sizePx, sizePx * 2, sizePx * 2);
    const subR = sizePx * 0.62;
    for (let k = 0; k < 3; k++) {
      const ang = P.seed[i] * 6.283 + k * 2.094;
      const dx = Math.cos(ang) * sizePx * 0.45, dy = Math.sin(ang) * sizePx * 0.45;
      ctx.drawImage(sprite, dx - subR, dy - subR, subR * 2, subR * 2);
    }
    ctx.restore();
  }
};

/* ---------------------------------------------------------------------
   Warm ground glow -- real launch-photography exhaust clouds read as
   sunlit/flame-lit from below, not flat white. Floodlights (design doc
   §6.8) were cut for this vertical slice, but the plume itself is a much
   bigger always-on light source right at the pad -- this is a cheap
   stand-in that gets most of that look for two gradient stops. Drawn
   BEHIND the smoke puffs so they read as lit from within/below.
--------------------------------------------------------------------- */
RR.drawGroundGlow = function (ctx, throttle, alt) {
  if (throttle <= 0.01 || alt > 300) return;
  const fade = RSX.clamp(1 - alt / 300, 0, 1) * RSX.clamp(throttle, 0, 1);
  if (fade <= 0.01) return;
  const R = 16;
  const g = ctx.createRadialGradient(0, 1, 0, 0, 1, R);
  g.addColorStop(0.00, `rgba(255,175,90,${0.40 * fade})`);
  g.addColorStop(0.35, `rgba(255,140,60,${0.22 * fade})`);
  g.addColorStop(1.00, "rgba(255,120,50,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 1, R, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

/* ---------------------------------------------------------------------
   Spark particles (type 1, design/visual-realism.md §5.7) -- the type this
   struct-of-arrays reserved from the start but never had a drawer for.
   Drawn as short bright streaks along each particle's own velocity vector,
   additive so overlapping sparks blow out to white the way real ones do.
--------------------------------------------------------------------- */
RR.drawSparkParticles = function (ctx, P, ppm) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 0; i < P.n; i++) {
    if (P.type[i] !== 1) continue;
    const lifeF = 1 - P.age[i] / P.life[i];
    const alpha = Math.max(lifeF, 0);
    if (alpha <= 0.01) continue;
    const speed = Math.hypot(P.vx[i], P.vy[i]);
    const len = Math.min(0.4, 0.02 * speed); // short streak, world metres -- scales with how fast it's moving
    const ux = speed > 1e-6 ? P.vx[i] / speed : 0, uy = speed > 1e-6 ? P.vy[i] / speed : 0;
    ctx.strokeStyle = `rgba(255,${230 + 20 * lifeF | 0},${140 + 80 * lifeF | 0},${alpha})`;
    ctx.lineWidth = Math.max(0.3 / ppm, 0.015);
    ctx.beginPath();
    ctx.moveTo(P.x[i], P.y[i]);
    ctx.lineTo(P.x[i] - ux * len, P.y[i] - uy * len);
    ctx.stroke();
  }
  ctx.restore();
};

/* ---------------------------------------------------------------------
   Launch tower -- static gantry next to the pad (design/visual-realism.md
   §6.8, trimmed for this vertical slice: no flame trench, no floodlights).
   Drawn in the SAME pad-local frame as the ground/pad marking -- ctx is
   already at true world scale via RR.applyCamera, so this only needs its
   own fixed pad-relative offset, never the vehicle's rotating/translating
   transform. vehAttach: {x,y} world/pad-local point for the umbilical's
   vehicle-side end, or null/undefined to skip the umbilical entirely (it
   "whips away" at T-0 by simply not being drawn any more).
--------------------------------------------------------------------- */
const TOWER_X = 6.5, TOWER_H = 13.0, TOWER_RAIL_GAP = 2.0, TOWER_DEPTH = 0.45;
// vehAttach: null (nothing drawn, arms retracted) or {lower:{x,y}, upper:{x,y}}
// -- two pad-local world points on the vehicle's CURRENT body, for a lower
// service arm (~tank height, doubles as the umbilical's root) and an upper
// capture-style arm (~probe height), matching a real orbital launch mount's
// twin quick-disconnect/capture arms rather than one bare cable.
RR.drawLaunchTower = function (ctx, ppm, t, vehAttach) {
  const railX = TOWER_RAIL_GAP / 2;
  ctx.save();
  ctx.translate(TOWER_X, 0);

  // "Back" rails + depth struts, drawn first/darker/thinner: a cheap 2D
  // trick so this reads as a box truss instead of a flat ladder -- a real
  // lattice tower is 4-legged, not 2, and full 3D isn't worth it here.
  const backX = TOWER_DEPTH * 0.55;
  ctx.strokeStyle = "#33383D";
  for (const sign of [-1, 1]) {
    ctx.lineWidth = Math.max(0.5 / ppm, 0.20);
    ctx.beginPath(); ctx.moveTo(sign * railX + backX, 0); ctx.lineTo(sign * railX + backX, TOWER_H); ctx.stroke();
  }
  ctx.lineWidth = Math.max(0.25 / ppm, 0.09);
  for (const f of [0.12, 0.36, 0.60, 0.84]) {
    const y = TOWER_H * f;
    ctx.beginPath(); ctx.moveTo(-railX, y); ctx.lineTo(-railX + backX, y - 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(railX, y); ctx.lineTo(railX + backX, y - 0.3); ctx.stroke();
  }

  // Splayed base legs -- a real tower's foundation is wider than its shaft.
  ctx.strokeStyle = "#3D4247"; ctx.lineWidth = Math.max(0.6 / ppm, 0.22);
  for (const sign of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sign * railX, 0); ctx.lineTo(sign * (railX + 1.1), -1.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sign * railX, 1.4); ctx.lineTo(sign * (railX + 1.1), -1.6); ctx.stroke();
  }

  // 2 front vertical rails, each with a thinner lit-edge highlight on the +x face
  for (const sign of [-1, 1]) {
    ctx.strokeStyle = "#4A5058"; ctx.lineWidth = Math.max(0.7 / ppm, 0.28);
    ctx.beginPath(); ctx.moveTo(sign * railX, 0); ctx.lineTo(sign * railX, TOWER_H); ctx.stroke();
    ctx.strokeStyle = "#9AA4AE"; ctx.lineWidth = Math.max(0.2 / ppm, 0.08);
    ctx.beginPath(); ctx.moveTo(sign * railX + 0.06, 0); ctx.lineTo(sign * railX + 0.06, TOWER_H); ctx.stroke();
  }

  // ~12 evenly-spaced X-braces between the front rails
  const nBrace = 12;
  ctx.strokeStyle = "#4A5058"; ctx.lineWidth = Math.max(0.3 / ppm, 0.12);
  for (let i = 0; i < nBrace; i++) {
    const y0 = TOWER_H * i / nBrace, y1 = TOWER_H * (i + 1) / nBrace;
    ctx.beginPath(); ctx.moveTo(-railX, y0); ctx.lineTo(railX, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(railX, y0); ctx.lineTo(-railX, y1); ctx.stroke();
  }

  // 5 platform decks, each with a thin railing line
  ctx.fillStyle = "#5B6167";
  for (const f of [0.20, 0.42, 0.64, 0.86, 0.97]) {
    const y = TOWER_H * f;
    ctx.fillRect(-railX - 0.3, y - 0.08, TOWER_RAIL_GAP + 0.6, 0.16);
    ctx.strokeStyle = "#787E84"; ctx.lineWidth = Math.max(0.15 / ppm, 0.03);
    ctx.beginPath(); ctx.moveTo(-railX - 0.3, y - 0.35); ctx.lineTo(railX + 0.3, y - 0.35); ctx.stroke();
  }

  // Mast + red aviation light blinking at 1 Hz -- costs nothing, reads as
  // "real facility" instantly (design doc §6.8's own words for this detail)
  const mastTopY = TOWER_H + 1.6;
  ctx.strokeStyle = "#8B8F94"; ctx.lineWidth = Math.max(0.2 / ppm, 0.04);
  ctx.beginPath(); ctx.moveTo(0, TOWER_H); ctx.lineTo(0, mastTopY); ctx.stroke();

  if (Math.sin(t * 2 * Math.PI * 1.0) > 0) {
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(0, mastTopY, 0, 0, mastTopY, 1.3);
    g.addColorStop(0, "rgba(255,59,48,0.9)"); g.addColorStop(1, "rgba(255,59,48,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, mastTopY, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#FF3B30";
    ctx.beginPath(); ctx.arc(0, mastTopY, Math.max(0.4 / ppm, 0.07), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore(); // end tower-local frame

  // Service arms + umbilical -- OUTER pad-local frame (span to the vehicle's
  // own current position), only while it hasn't lit yet: they retract at
  // T-0 exactly like a real quick-disconnect/capture arm would, by simply
  // not being drawn any more (an animated swing-away is a nice-to-have).
  if (vehAttach) {
    const drawArm = (towerY, tip, thick) => {
      const towerPt = { x: TOWER_X - railX, y: towerY };
      const dx = tip.x - towerPt.x, dy = tip.y - towerPt.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-3) return;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux, half = thick / 2;
      ctx.strokeStyle = "#565C62"; ctx.lineWidth = Math.max(0.25 / ppm, 0.09);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(towerPt.x + px * half * s, towerPt.y + py * half * s);
        ctx.lineTo(tip.x + px * half * s, tip.y + py * half * s);
        ctx.stroke();
      }
      const nStrut = Math.max(2, Math.round(len / 0.6));
      for (let i = 1; i < nStrut; i++) {
        const f = i / nStrut, cx = towerPt.x + dx * f, cy = towerPt.y + dy * f;
        ctx.beginPath();
        ctx.moveTo(cx + px * half, cy + py * half); ctx.lineTo(cx - px * half, cy - py * half);
        ctx.stroke();
      }
    };
    if (vehAttach.upper) drawArm(TOWER_H * 0.86, vehAttach.upper, 0.35);
    if (vehAttach.lower) drawArm(TOWER_H * 0.42, vehAttach.lower, 0.45);

    // Umbilical cable sags from the lower arm's own tower-side root.
    if (vehAttach.lower) {
      const towerSideX = TOWER_X - railX, towerSideY = TOWER_H * 0.42;
      const midX = (towerSideX + vehAttach.lower.x) / 2, midY = (towerSideY + vehAttach.lower.y) / 2 - 0.8;
      ctx.strokeStyle = "#3A4046"; ctx.lineWidth = Math.max(0.2 / ppm, 0.06);
      ctx.beginPath();
      ctx.moveTo(towerSideX, towerSideY);
      ctx.quadraticCurveTo(midX, midY, vehAttach.lower.x, vehAttach.lower.y);
      ctx.stroke();
    }
  }
};

if (typeof module !== "undefined") module.exports = RSX;
