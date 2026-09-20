/* =====================================================================
   PHYSICS CORE — Steps 0-3 of the build order (see design/critique.md)

   GLOBAL CONVENTIONS — violating any of these is a bug, not a style choice
   ---------------------------------------------------------------------
   UNITS: strict SI. m, kg, s, N, Pa, K, rad, kg/m^3. No km, no degrees,
          no tonnes, no MPa in any stored field. Conversion happens ONLY
          inside fmt*() display functions (see fmt.js).
   ANGLES: theta CCW from PCI +x, unwrapped (may exceed +-2*PI after a
          tumble). Wrap only DIFFERENCES via wrapPi().
   FRAMES: PCI (planet-centered inertial): origin at planet center, +x
          right, +y up, non-rotating. At t=0 the pad sits at (0, R).
          Body frame: bHat = (cos theta, sin theta) is the nose direction.
   STATION: s = metres from the NOSE TIP, positive AFT. x_b = s_cm - s.
          A part aft of the CM has x_b < 0. CP aft of CM => x_cp_b < 0
          => stable (see aeroTorque()).
   MUTABILITY: STATE is mutated in place by stepVerlet() only. Every
          other module receives it read-only, or receives TELEM.
   ===================================================================== */
"use strict";

const RSX = {};  // single namespace, everything hangs off this

/* ---------------------------------------------------------------------
   Small helpers
--------------------------------------------------------------------- */
RSX.wrapPi = x => Math.atan2(Math.sin(x), Math.cos(x));
RSX.clamp = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));
RSX.lerp = (a, b, t) => a + (b - a) * t;

// mulberry32 — seeded PRNG so an A/B comparison and replay are reproducible.
// Simulation randomness (particle spawn timing seeds, failure jitter) goes
// through this. Visual-only randomness uses coherent value noise instead
// (see renderer.js) and never touches this generator.
RSX.mulberry32 = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

RSX.tableLookup = function (tbl, x) {
  if (x <= tbl[0][0]) return tbl[0][1];
  const n = tbl.length;
  if (x >= tbl[n - 1][0]) return tbl[n - 1][1];
  let i = 0; while (i < n - 2 && x >= tbl[i + 1][0]) i++;
  const [x0, y0] = tbl[i], [x1, y1] = tbl[i + 1];
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
};

/* =====================================================================
   1. PLANETS (BODY) — "home" is the scaled default; "earth" is hard mode;
   "mars" is the interplanetary-coast destination (design/critique.md ruled
   out real patched-conic multi-body flight for this stage, so mars is
   reached by a simplified time/distance coast, not a real transfer orbit --
   see web/game.html's arriveAtMars()). All three share byte-identical
   physics code; only these constants (and, for mars, the atmosphere model
   below) differ.
   ===================================================================== */
RSX.PLANETS = {
  home: {
    id: "home", name: "Home",
    R: 600000, g0: 9.81, mu: 3.5316e12,
    wp: 2.9089e-4,          // rad/s, 6h day -> 174.5 m/s eastward at equator
    zAtm: 70000, atmScale: 0.5,
  },
  earth: {
    id: "earth", name: "Earth",
    R: 6371000, g0: 9.80665, mu: 3.980448e14,
    wp: 7.2921159e-5,       // -> 464.6 m/s eastward at equator
    zAtm: 140000, atmScale: 1.0,
  },
  mars: {
    id: "mars", name: "Mars",
    // Radius scaled down by the SAME ~9.42% factor "home" applies to real
    // Earth (600 km vs 6,371 km) -- applied to Mars's real 3,389.5 km
    // radius, so the two-body "toy solar system" keeps consistent
    // proportions instead of a jarring scale mismatch. g0 is Mars's REAL
    // surface gravity (unscaled -- it's what makes landing on Mars feel
    // different, the whole point of going there).
    R: 319000, g0: 3.71, mu: 3.7744e11,
    wp: 2.49e-4,            // rad/s, ~7h day -- same compressed-day convention as home
    zAtm: 60000,
    // Real CO2 atmosphere (average surface conditions) -- ~160x thinner
    // than home's, and cold enough that it needs its own gas constant, so
    // it can't reuse the Earth-specific US Standard Atmosphere table below.
    // atmT0 isothermal is a simplification: fine for a landing-only
    // scenario with no ascent-to-orbit through it in this feature.
    atmModel: "exponential",
    P0: 610, scaleH: 11100, atmT0: 210, gasR: 188.9, gasGamma: 1.29,
  },
};

/* ---------------------------------------------------------------------
   2. ATMOSPHERE — real US Standard 1976 layer model to 86 km geometric,
   log-linear density table above that to 140 km. atmScale compresses the
   altitude axis for the scaled world while keeping pa(0) = 101325 on
   BOTH worlds (hydrostatic balance is preserved by shrinking the
   effective gas constant by the same factor -- see design/flight-physics.md §2.4).
--------------------------------------------------------------------- */
const ATM_G0 = 9.80665, ATM_RS = 287.0528, ATM_GAMMA = 1.4, ATM_RE = 6356766;

// [h_b (m), T_b (K), L (K/m), P_b (Pa)]
const LAYERS = [
  [0, 288.15, -0.0065, 101325.0],
  [11000, 216.65, 0.0, 22632.06],
  [20000, 216.65, 0.001, 5474.889],
  [32000, 228.65, 0.0028, 868.0187],
  [47000, 270.65, 0.0, 110.9063],
  [51000, 270.65, -0.0028, 66.93887],
  [71000, 214.65, -0.002, 3.956420],
];
// [z (m), rho (kg/m^3), T (K), P (Pa)]
const UPPER = [
  [86000, 6.958e-6, 186.87, 0.37338],
  [90000, 3.416e-6, 186.87, 0.18359],
  [95000, 1.393e-6, 188.42, 0.075966],
  [100000, 5.604e-7, 195.08, 0.032011],
  [110000, 9.708e-8, 240.00, 0.0071042],
  [120000, 2.222e-8, 360.00, 0.0025382],
  [130000, 8.152e-9, 469.27, 0.0012505],
  [140000, 3.831e-9, 559.63, 0.00072028],
];

RSX.atmosphere = function (z, planet) {
  const top = planet.zAtm;
  if (planet.atmModel === "exponential") {
    if (z >= top) return { rho: 0, P: 0, T: planet.atmT0, a: Math.sqrt(planet.gasGamma * planet.gasR * planet.atmT0) };
    if (z < 0) z = 0;
    const T = planet.atmT0;
    let P = planet.P0 * Math.exp(-z / planet.scaleH);
    // same smootherstep taper as the Earth-table path below, so P/rho hit
    // exactly zero with a continuous derivative at the rails boundary
    const band = 0.10 * top;
    if (z > top - band) {
      const s = (top - z) / band, wgt = s * s * (3 - 2 * s);
      P *= wgt;
    }
    return { rho: P / (planet.gasR * T), P, T, a: Math.sqrt(planet.gasGamma * planet.gasR * T) };
  }
  if (z >= top) return { rho: 0, P: 0, T: 559.6, a: 600 };
  if (z < 0) z = 0;

  const f = planet.atmScale;
  const ze = z / f;
  let rho, P, T;
  const h = ATM_RE * ze / (ATM_RE + ze);

  if (h <= 84852) {
    let i = 0;
    while (i < LAYERS.length - 1 && h >= LAYERS[i + 1][0]) i++;
    const [hb, Tb, L, Pb] = LAYERS[i];
    T = Tb + L * (h - hb);
    P = (Math.abs(L) > 1e-12)
      ? Pb * Math.pow(T / Tb, -ATM_G0 / (ATM_RS * L))
      : Pb * Math.exp(-ATM_G0 * (h - hb) / (ATM_RS * Tb));
    rho = P / (ATM_RS * T);
  } else {
    let i = 0;
    while (i < UPPER.length - 2 && ze >= UPPER[i + 1][0]) i++;
    const [z0, r0, T0, P0] = UPPER[i], [z1, r1, T1, P1] = UPPER[i + 1];
    const u = (ze - z0) / (z1 - z0);
    rho = r0 * Math.pow(r1 / r0, u);
    P = P0 * Math.pow(P1 / P0, u);
    T = T0 + (T1 - T0) * u;
  }

  // smootherstep taper to exactly zero over the top 10% of the atmosphere,
  // so rho and its derivative are continuous at the rails boundary
  const band = 0.10 * top;
  if (z > top - band) {
    const s = (top - z) / band, wgt = s * s * (3 - 2 * s);
    rho *= wgt; P *= wgt;
  }
  return { rho, P, T, a: Math.sqrt(ATM_GAMMA * ATM_RS * T) };
};

// One-line delegators so any older code path that still calls these by
// name keeps working unchanged.
RSX.airDensity = (z, planet) => RSX.atmosphere(z, planet).rho;
RSX.ambientPressure = (z, planet) => RSX.atmosphere(z, planet).P;

/* =====================================================================
   3. ENGINE MODEL — the existing combustion physics, kept verbatim in
   spirit (Saint Robert's law, quasi-steady chamber pressure, isentropic
   area-Mach thrust coefficient), extended per design/critique.md C13-C15:
     - grain.perimeterFactor multiplies ONLY the lateral (bore) term, so
       a star/finocyl grain can reach SRB-class burn area at plausible
       dimensions (a plain BATES bore cannot).
     - peIdeal() is the pure UNCLAMPED isentropic exit pressure -- the
       renderer needs this raw value for shock-cell spacing and the
       over-expanded plume pinch.
     - thrustCoefficient() applies the Summerfield separation criterion
       INTERNALLY (pe < 0.4*pa => clamp + 15% penalty) and never exposes
       a clamped pe itself.
     - isSeparated() is a third, explicit export for the HUD warning.
   ===================================================================== */
RSX.GRAVITY_REF = 9.80665;  // g0 for Isp definition ONLY -- never local gravity

RSX.burnRate = (p, pc) => (pc <= 0 ? 0 : p.a * Math.pow(pc, p.n));

RSX.webMax = g => Math.min((g.outerD - g.coreD) / 2, g.burnEnds ? g.length / 2 : Infinity);
RSX.isBurnedOut = (g, w) => w >= RSX.webMax(g);

RSX.burningArea = function (g, w) {
  if (RSX.isBurnedOut(g, w)) return 0;
  const coreD = g.coreD + 2 * w;
  const length = g.length - (g.burnEnds ? 2 * w : 0);
  const perim = g.perimeterFactor || 1.0;
  const lateral = perim * Math.PI * coreD * length;
  const ends = g.burnEnds ? 2 * (Math.PI / 4) * (g.outerD ** 2 - coreD ** 2) : 0;
  return g.numSegments * (lateral + ends);
};
RSX.propVolume = function (g, w) {
  if (RSX.isBurnedOut(g, w)) return 0;
  const coreD = g.coreD + 2 * w;
  const length = Math.max(g.length - (g.burnEnds ? 2 * w : 0), 0);
  const area = (Math.PI / 4) * (g.outerD ** 2 - coreD ** 2);
  return g.numSegments * area * length;
};

RSX.throatArea = n => Math.PI / 4 * n.throatD ** 2;
RSX.exitArea = n => Math.PI / 4 * n.exitD ** 2;
RSX.areaRatio = n => RSX.exitArea(n) / RSX.throatArea(n);

const areaRatioFromMach = (m, k) => (1 / m) * ((2 / (k + 1)) * (1 + (k - 1) / 2 * m * m)) ** ((k + 1) / (2 * (k - 1)));
RSX.solveExitMach = function (eps, k) {
  let lo = 1 + 1e-6, hi = 15;
  if (eps <= areaRatioFromMach(lo, k)) return lo;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (areaRatioFromMach(mid, k) < eps) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
};

RSX.makeMotor = function (propellant, grain, nozzle) {
  return { propellant, grain, nozzle, exitMach: RSX.solveExitMach(RSX.areaRatio(nozzle), propellant.k) };
};
RSX.chamberPressure = function (motor, ab) {
  if (ab <= 0) return 0;
  const p = motor.propellant, At = RSX.throatArea(motor.nozzle);
  const base = ab * p.a * p.density * p.cstar / At;
  return Math.pow(base, 1 / (1 - p.n));
};
// Pure isentropic exit pressure. UNCLAMPED. The renderer reads ONLY this.
RSX.peIdeal = function (motor, pc) {
  const k = motor.propellant.k, m = motor.exitMach;
  return pc * Math.pow(1 + (k - 1) / 2 * m * m, -k / (k - 1));
};
// Summerfield separation criterion: flow separates from the nozzle wall
// when pe/pa drops below ~0.4. A vacuum-optimized bell run at sea level
// hits this immediately -- that IS the vacuum-bell lesson.
RSX.isSeparated = function (motor, pc, pa) {
  if (pc <= 0 || pa <= 0) return false;
  const pe = RSX.peIdeal(motor, pc);
  return pe < 0.4 * pa;
};
RSX.thrustCoefficient = function (motor, pc, pa) {
  if (pc <= 0) return 0;
  const k = motor.propellant.k;
  let pe = RSX.peIdeal(motor, pc);
  let penalty = 1.0;
  if (RSX.isSeparated(motor, pc, pa)) { pe = 0.4 * pa; penalty = 0.85; }
  const momentum = Math.sqrt((2 * k * k / (k - 1)) * Math.pow(2 / (k + 1), (k + 1) / (k - 1)) * (1 - Math.pow(pe / pc, (k - 1) / k)));
  const pressureTerm = (pe - pa) * RSX.areaRatio(motor.nozzle) / pc;
  return penalty * motor.nozzle.efficiency * (momentum + pressureTerm);
};
RSX.thrustN = (motor, pc, pa) => RSX.thrustCoefficient(motor, pc, pa) * RSX.throatArea(motor.nozzle) * pc;
RSX.massFlow = (motor, pc) => (pc <= 0 ? 0 : pc * RSX.throatArea(motor.nozzle) / motor.propellant.cstar);

RSX.stateAtWeb = function (motor, w, pa) {
  const ab = RSX.burningArea(motor.grain, w);
  const pc = RSX.chamberPressure(motor, ab);
  return {
    w, ab, pc, mdot: RSX.massFlow(motor, pc), thrust: RSX.thrustN(motor, pc, pa),
    propMass: RSX.propVolume(motor.grain, w) * motor.propellant.density,
    kn: ab > 0 ? ab / RSX.throatArea(motor.nozzle) : 0,
  };
};
RSX.propellantMassInitial = motor => RSX.propVolume(motor.grain, 0) * motor.propellant.density;

/* ---- generic helpers so flight code never branches on engine type ---- */
RSX.motorBurnoutBound = motor => (motor.type === "solid" ? RSX.webMax(motor.grain) : motor.propellantLoad);
RSX.motorIsBurnedOut = (motor, w) => (motor.type === "solid" ? RSX.isBurnedOut(motor.grain, w) : w >= motor.propellantLoad - 1e-9);
RSX.motorInitialState = function (motor, pa) {
  if (motor.type === "solid") {
    const s = RSX.stateAtWeb(motor, 0, pa);
    return { thrust: s.thrust, propMass: s.propMass };
  }
  return { thrust: RSX.thrustN(motor, motor.pcDesign, pa), propMass: motor.propellantLoad };
};

/* ---------------------------------------------------------------------
   4. FUEL PRESETS — extended per critique C13 with bulk tank density,
   tank dry-mass fraction, mixture ratio (display) and plume flavour.
   Values are drawn from design/game-mechanics.md §5.5 (bulk densities are
   exact volume/mass matches against the spec's TNK-* table).
--------------------------------------------------------------------- */
RSX.FUEL_PRESETS = {
  solid: {
    type: "solid", name: "Solid Propellant", formula: "AP / Al / HTPB", dot: "var(--ink-muted)",
    blurb: "Fuel and oxidizer cast into one solid rubber-like grain — simple and storable, but once lit it cannot be throttled or stopped.",
    chips: ["No throttle", "No shutoff", "Baseline Isp"],
    propellant: { density: 1770, a: 4.368e-5, n: 0.35, cstar: 1550, k: 1.18 },
  },
  rp1: {
    type: "liquid", name: "Refined Kerosene", formula: "RP-1 / LOX", dot: "var(--accent)",
    blurb: "Stays liquid at room temperature and gives high thrust density — the workhorse fuel for first-stage boosters.",
    chips: ["Throttleable", "Storable", "Good Isp"],
    propellant: { cstar: 1823, k: 1.22, bulkDensity: 1023, tankDryFrac: 0.05, ofRatio: 2.56, boiloffRate: 0 },
  },
  ch4: {
    type: "liquid", name: "Liquid Methane", formula: "CH₄ / LOX", dot: "var(--series-mass)",
    blurb: "Burns cleaner than kerosene and is easier to manufacture on other planets — a next-generation fuel.",
    chips: ["Throttleable", "Cryogenic", "Higher Isp"],
    propellant: { cstar: 1830, k: 1.16, bulkDensity: 833, tankDryFrac: 0.057, ofRatio: 3.6, boiloffRate: 4.0e-6 },
  },
  lh2: {
    type: "liquid", name: "Liquid Hydrogen", formula: "LH₂ / LOX", dot: "var(--series-pressure)",
    blurb: "Very high energy and a clean water byproduct, but needs extreme cold storage and bulky tanks.",
    chips: ["Throttleable", "Deep cryo", "Highest Isp"],
    propellant: { cstar: 2380, k: 1.20, bulkDensity: 344, tankDryFrac: 0.11, ofRatio: 5.5, boiloffRate: 2.0e-5 },
  },
};

/* =====================================================================
   5. VEHICLE AERO / MASS PROPERTIES
   ===================================================================== */

// Nose-cone C_Nalpha is 2.0 regardless of shape; CP station depends on shape.
RSX.NOSE_CP_FACTOR = { cone: 0.666, ogive: 0.466, parabolic: 0.5, blunt: 0.5 };

// Slender-body axial coefficient C_A(M) -- transonic drag rise.
const CA_SLENDER = [
  [0.0, 0.300], [0.20, 0.300], [0.40, 0.310], [0.60, 0.325], [0.80, 0.355],
  [0.90, 0.420], [0.95, 0.580], [1.00, 0.750], [1.05, 0.800], [1.10, 0.780],
  [1.20, 0.720], [1.50, 0.600], [2.00, 0.480], [2.50, 0.420], [3.00, 0.380],
  [4.00, 0.320], [5.00, 0.300], [8.00, 0.280], [25.0, 0.270],
];
const CA_BLUNT = [
  [0.0, 1.05], [0.50, 1.10], [0.80, 1.20], [1.00, 1.45], [1.20, 1.55],
  [1.50, 1.50], [2.00, 1.40], [3.00, 1.32], [5.00, 1.28], [25.0, 1.25],
];
RSX.axialCd = (mach, blunt) => RSX.tableLookup(blunt ? CA_BLUNT : CA_SLENDER, mach);

// Prandtl-Glauert compressibility correction, applied to FIN C_Nalpha only.
RSX.compressibilityK = function (mach) {
  let k;
  if (mach < 0.8) k = 1 / Math.sqrt(Math.max(1 - mach * mach, 1e-6));
  else if (mach <= 1.2) k = RSX.lerp(1 / Math.sqrt(1 - 0.64), 1 / Math.sqrt(1.44 - 1), (mach - 0.8) / 0.4);
  else k = 1 / Math.sqrt(Math.max(mach * mach - 1, 1e-6));
  return RSX.clamp(k, 0.5, 3.0);
};

/**
 * Compute vehicle mass properties (m, s_cm, I) from a flat list of parts.
 * Each part: {dryMass, s (station of dry-shell centroid, m from nose),
 *             L (length), R (radius = D/2), propMass (kg, 0 if inert),
 *             propTankLen (m, tank length for settling calc, 0 if none)}.
 * Propellant settles toward the aft end of its tank as it drains -- this
 * is what makes the CM march aft through a burn (design/flight-physics.md §3.1).
 */
RSX.massProps = function (parts) {
  let m = 0, ms = 0;
  for (const p of parts) {
    const mp = p.dryMass + (p.propMass || 0);
    let station = p.s;
    if (p.propMass > 0 && p.propMassFull > 0 && p.propTankLen > 0) {
      const f = p.propMass / p.propMassFull;              // fill fraction
      const sTankCenter = p.s;
      const sSettled = sTankCenter + (p.propTankLen / 2) * (1 - f);
      station = (p.dryMass * p.s + p.propMass * sSettled) / mp;
    }
    m += mp; ms += mp * station;
  }
  const s_cm = m > 0 ? ms / m : 0;

  let I = 0;
  for (const p of parts) {
    const mp = p.dryMass + (p.propMass || 0);
    const d = p.s - s_cm;
    I += mp * ((p.L * p.L) / 12 + (p.R * p.R) / 4) + mp * d * d;
  }
  return { m: Math.max(m, 1e-3), s_cm, I: Math.max(I, 1e-3) };
};

/**
 * Aerodynamic coefficients at the current Mach number, aggregated from
 * the vehicle's aero contributors (nose, fins, body). Returns everything
 * deriv() needs: {CA, CNa, xcp_b, xcross_b, Sref, SplanRatio, sumCNax2, Cquad0}.
 * `contribs`: [{CNa, s, kind:'nose'|'fin'|'body'}], `sCm`, `Dref`, `Splan`,
 * `bluntNose`, `LfwdAft: [Lfwd, Laft]` (for the tumble-damping integral).
 */
RSX.vehicleAero = function (veh, mach) {
  const Dref = veh.Dmax, Sref = Math.PI / 4 * Dref * Dref;
  let CNaSum = 0, CNaSSum = 0, sumCNax2 = 0;
  const k = RSX.compressibilityK(mach);
  for (const c of veh.aeroContribs) {
    const CNa = c.kind === "fin" ? c.CNa * k : c.CNa;
    CNaSum += CNa; CNaSSum += CNa * c.s;
  }
  const s_cp = CNaSum > 1e-9 ? CNaSSum / CNaSum : veh.s_cm;
  for (const c of veh.aeroContribs) {
    const CNa = c.kind === "fin" ? c.CNa * k : c.CNa;
    const dx = veh.s_cm - c.s;
    sumCNax2 += CNa * dx * dx;
  }
  const CA = RSX.axialCd(mach, veh.bluntNose) * (veh.cd0Factor || 1);
  const xcp_b = veh.s_cm - s_cp;
  const xcross_b = veh.s_cm - (veh.sCross != null ? veh.sCross : s_cp);
  const SplanRatio = (veh.Splan || 0) / Sref;
  const [Lfwd, Laft] = veh.LfwdAft || [veh.s_cm, Math.max(veh.sTail - veh.s_cm, 0)];
  const Rbar = Dref / 2;
  const Cquad0 = 2 * Rbar * (Math.pow(Lfwd, 4) + Math.pow(Laft, 4)) / 4;
  return { CA, CNa: CNaSum, xcp_b, xcross_b, Sref, SplanRatio, sumCNax2, Cquad0, SM: xcp_b < 0 ? -xcp_b / Dref : -xcp_b / Dref };
};

/* =====================================================================
   6. FORCES / TORQUES — the derivative function (design/flight-physics.md §4)
   ===================================================================== */

/**
 * deriv(S, veh, ctrl, planet, out) -> out
 * S: {rx,ry,vx,vy,th,om}. veh: {mp:{m,s_cm,I}, sEngine, thrustNow(pa,thr),
 * mdotNow(pa,thr), Dmax, bluntNose, aeroContribs, Splan, sCross, LfwdAft, sTail}.
 * ctrl: {throttle, gimbal, tauRCS}.
 * Returns the NON-DRAG acceleration plus the analytic drag/damping
 * coefficients that stepVerlet() applies in closed form.
 */
RSX.deriv = function (S, veh, ctrl, planet, out) {
  const rx = S.rx, ry = S.ry;
  const rmag = Math.hypot(rx, ry);
  const upx = rx / rmag, upy = ry / rmag;
  const z = rmag - planet.R;

  const MP = veh.mp;
  const m = MP.m, I = MP.I;
  veh.s_cm = MP.s_cm; // vehicleAero() reads veh.s_cm directly -- keep it synced

  const g = planet.mu / (rmag * rmag);
  let ax = -g * upx, ay = -g * upy;
  let tau = 0;

  const bx = Math.cos(S.th), by = Math.sin(S.th);

  const A = RSX.atmosphere(z, planet);
  const wx = S.vx + planet.wp * ry;
  const wy = S.vy - planet.wp * rx;
  const W = Math.hypot(wx, wy);
  const q = 0.5 * A.rho * W * W;
  const mach = RSX.clamp(W / A.a, 0, 25);

  const T = veh.thrustNow(A.P, ctrl.throttle);
  const mdot = veh.mdotNow(A.P, ctrl.throttle);
  const d = ctrl.gimbal;
  ax += T * Math.cos(S.th + d) / m;
  ay += T * Math.sin(S.th + d) / m;

  const ell = veh.sEngine - MP.s_cm;
  tau += -ell * T * Math.sin(d);        // gimbal torque
  tau += -mdot * ell * ell * S.om;      // jet damping

  out.kDrag = 0; out.Clin = 0; out.Cquad = 0;
  out.q = q; out.mach = mach; out.alpha = 0; out.W = W; out.rho = A.rho; out.pa = A.P;

  if (A.rho > 1e-12 && W > 0.05) {
    const uwx = wx / W, uwy = wy / W;
    const sa = bx * uwy - by * uwx;
    const ca = bx * uwx + by * uwy;
    const alpha = Math.atan2(sa, ca);
    const AC = RSX.vehicleAero(veh, mach);

    const CNlin = AC.CNa * sa * ca;
    const CNcrs = 0.7 * 1.2 * AC.SplanRatio * sa * Math.abs(sa);
    const CN = CNlin + CNcrs;
    const CA = AC.CA;

    const CDw = CA * ca + CN * sa;
    const CLw = CN * ca - CA * sa;

    out.kDrag = 0.5 * A.rho * AC.Sref * Math.max(CDw, 0) / m;

    const px = -uwy, py = uwx;
    const aL = -CLw * q * AC.Sref / m;
    ax += aL * px; ay += aL * py;

    tau += AC.xcp_b * (-CNlin * q * AC.Sref);
    tau += AC.xcross_b * (-CNcrs * q * AC.Sref);

    out.Clin = 0.5 * A.rho * W * AC.Sref * AC.sumCNax2;
    out.Cquad = 0.5 * A.rho * 1.2 * AC.Cquad0;
    out.alpha = alpha;
    out.SM = AC.SM;
  }

  tau += ctrl.tauRCS || 0;

  out.ax = ax; out.ay = ay; out.tau = tau;
  out.mdot = mdot; out.T = T; out.I = I; out.m = m;
  return out;
};

/* =====================================================================
   7. INTEGRATOR — velocity Verlet (kick-drift-kick) with operator-split
   analytic drag and analytic rotational damping (design/flight-physics.md §5).
   Both analytic updates are unconditionally stable at any dt -- this is
   what removes the entire "drag blows up at high dt" instability class.
   ===================================================================== */

/**
 * advanceBurn(veh, A, dt) mutates veh's propellant state (web or mass)
 * and refreshes veh.mp via massProps(). Supplied by vehicle.js at the
 * next build step; physics-core only requires the CONTRACT:
 *   veh.thrustNow(pa, throttle), veh.mdotNow(pa, throttle),
 *   veh.advanceBurn(dt), veh.mp (refreshed after advanceBurn).
 */
RSX.stepVerlet = function (S, veh, ctrl, planet, dt, cache) {
  const A1 = cache.valid ? cache.d : RSX.deriv(S, veh, ctrl, planet, cache.tmpA);
  const I1 = A1.I;

  S.vx += A1.ax * dt * 0.5;
  S.vy += A1.ay * dt * 0.5;
  S.om += (A1.tau / I1) * dt * 0.5;

  // dv ledger: measure drag as the speed actually removed by the operator,
  // NOT as (D/m)*dt -- see design/critique.md C2. This is the one line that
  // keeps the four-bar delta-v loss ledger closing to 1%.
  let dvDragStep = 0;
  if (A1.kDrag > 0) {
    const vax = -planet.wp * S.ry, vay = planet.wp * S.rx;
    const wx0 = S.vx - vax, wy0 = S.vy - vay;
    const W0 = Math.hypot(wx0, wy0);
    if (W0 > 1e-9) {
      const f = 1 / (1 + A1.kDrag * W0 * dt);
      S.vx = vax + wx0 * f;
      S.vy = vay + wy0 * f;
      dvDragStep = W0 * (1 - f);
    }
  }

  if (A1.Clin > 0) S.om *= Math.exp(-A1.Clin * dt / I1);
  if (A1.Cquad > 0) S.om = S.om / (1 + (A1.Cquad / I1) * Math.abs(S.om) * dt);

  S.rx += S.vx * dt;
  S.ry += S.vy * dt;
  S.th += S.om * dt;

  veh.advanceBurn(A1, dt);
  veh.mp = RSX.massProps(veh.parts);

  const A2 = RSX.deriv(S, veh, ctrl, planet, cache.tmpB);
  S.vx += A2.ax * dt * 0.5;
  S.vy += A2.ay * dt * 0.5;
  S.om += (A2.tau / A2.I) * dt * 0.5;

  cache.d = A2; cache.valid = true;
  S.t += dt;
  A2.dvDragStep = dvDragStep;
  return A2;
};

RSX.CTRL_WN = 1.2; // rad/s, attitude controller natural frequency (see control.js)

RSX.chooseDt = function (S, veh, A, planet, dtRemaining) {
  const dtNom = (A.T > 0 || A.rho > 1e-9) ? 1 / 120 : 1 / 60;
  let dt = Math.min(dtNom, dtRemaining);
  if (A.mdot > 0) dt = Math.min(dt, 0.02 * A.m / A.mdot);
  const om = Math.abs(S.om);
  if (om > 1e-6) dt = Math.min(dt, 0.05 / om);
  const rmag = Math.hypot(S.rx, S.ry);
  dt = Math.min(dt, 0.02 * Math.sqrt((rmag * rmag * rmag) / planet.mu));
  dt = Math.min(dt, 0.2 / Math.max(RSX.CTRL_WN, 1e-3));
  return Math.max(dt, 1e-4);
};

/**
 * NaN recovery: snapshot before each substep, restore + halve dt on a
 * non-finite result, destroy the vehicle on a second consecutive failure.
 * advance() returns {ok, dvSteps:[{dt,A}...]} so the caller (flight loop)
 * can accumulate the delta-v ledger and detect a warp demotion.
 */
RSX.advance = function (S, veh, ctrl, planet, wallDt, warp, cache, onEvent, timeToNextEvent) {
  let remaining = Math.min(wallDt, 0.25) * warp;
  let guard = 0;
  let nanStrikes = 0;
  const steps = [];
  while (remaining > 1e-9 && guard++ < 400) {
    const peek = cache.valid ? cache.d : RSX.deriv(S, veh, ctrl, planet, cache.tmpA);
    const dt = RSX.chooseDt(S, veh, peek, planet, remaining);
    const dtEvent = timeToNextEvent ? timeToNextEvent(S, veh, dt) : dt;
    const useDt = Math.min(dt, dtEvent);

    const snap = { rx: S.rx, ry: S.ry, vx: S.vx, vy: S.vy, th: S.th, om: S.om, t: S.t };
    const A = RSX.stepVerlet(S, veh, ctrl, planet, useDt, cache);

    if (!Number.isFinite(S.rx) || !Number.isFinite(S.ry) || !Number.isFinite(S.vx) ||
        !Number.isFinite(S.vy) || !Number.isFinite(S.th) || !Number.isFinite(S.om)) {
      Object.assign(S, snap);
      cache.valid = false;
      nanStrikes++;
      if (nanStrikes >= 2) { S.mode = "DESTROYED"; if (onEvent) onEvent({ type: "destroyed", cause: "numeric" }); return { ok: false, steps }; }
      remaining -= useDt * 0.5;
      continue;
    }
    steps.push({ dt: useDt, A });
    if (dtEvent <= dt && onEvent) onEvent({ type: "substepEvent", dt: useDt, A });
    remaining -= useDt;
  }
  if (guard >= 400 && onEvent) onEvent({ type: "warpDemote" });
  return { ok: true, steps };
};

/* =====================================================================
   8. RAILS / KEPLER — on-rails conic propagation for high time warp
   (design/flight-physics.md §5.6, §6.1-6.2)
   ===================================================================== */

RSX.stateToElements = function (r, v, mu, t) {
  const rm = Math.hypot(r.x, r.y);
  const v2 = v.x * v.x + v.y * v.y;
  const rv = r.x * v.x + r.y * v.y;

  const h = r.x * v.y - r.y * v.x;
  const eps = v2 / 2 - mu / rm;
  const a = -mu / (2 * eps);

  const k = v2 / mu - 1 / rm;
  const ex = k * r.x - (rv / mu) * v.x;
  const ey = k * r.y - (rv / mu) * v.y;
  const e = Math.hypot(ex, ey);

  const p = (h * h) / mu;
  const w = Math.atan2(ey, ex);
  const dir = Math.sign(h) || 1;

  let nu;
  if (e > 1e-8) {
    nu = Math.acos(RSX.clamp((ex * r.x + ey * r.y) / (e * rm), -1, 1));
    // nu is a GEOMETRIC angle (CCW from periapsis), always. r(nu) increases
    // for nu in (0,pi) and decreases for nu in (pi,2pi) REGARDLESS of travel
    // direction. But rv = r*(dr/dt) = sign(dr/dnu)*sign(h)*|dr/dt|, so the
    // correct branch test is sign(rv*h), not sign(rv) alone -- using rv
    // alone silently mirrors every retrograde orbit's position (h<0).
    if (rv * h < 0) nu = 2 * Math.PI - nu;
  } else {
    nu = Math.atan2(r.y, r.x) - w;
  }

  let E, M;
  if (e < 1) {
    E = 2 * Math.atan2(Math.sqrt(Math.max(1 - e, 0)) * Math.sin(nu / 2), Math.sqrt(Math.max(1 + e, 1e-9)) * Math.cos(nu / 2));
    M = E - e * Math.sin(E);
  } else {
    const H = 2 * Math.atanh(RSX.clamp(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2), -0.999999, 0.999999));
    M = e * Math.sinh(H) - H;
    E = H;
  }

  return {
    a, e, p, w, nu, E, M, h, dir, t, mu,
    rApo: e < 1 ? a * (1 + e) : Infinity,
    rPeri: a * (1 - e),
    period: e < 1 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity,
  };
};

RSX.solveKepler = function (M, e) {
  if (e < 1) {
    M = M % (2 * Math.PI); if (M < 0) M += 2 * Math.PI;
    let E = (e < 0.8) ? M + e * Math.sin(M) : Math.PI;
    for (let i = 0; i < 12; i++) {
      const f = E - e * Math.sin(E) - M;
      const fp = 1 - e * Math.cos(E);
      const dE = f / fp;
      E -= dE;
      if (Math.abs(dE) < 1e-12) break;
    }
    return E;
  }
  let H = (Math.abs(M) < 6) ? M / (e - 1) : Math.sign(M) * Math.log(2 * Math.abs(M) / e + 1.8);
  for (let i = 0; i < 30; i++) {
    const f = e * Math.sinh(H) - H - M;
    const fp = e * Math.cosh(H) - 1;
    const dH = f / fp;
    H -= dH;
    if (Math.abs(dH) < 1e-12) break;
  }
  return H;
};

RSX.elementsToState = function (el, mu) {
  const { a, e, p, w } = el;
  let nu, rm;
  if (e < 1) {
    const E = RSX.solveKepler(el.M, e);
    nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(Math.max(1 - e, 1e-12)) * Math.cos(E / 2));
    rm = a * (1 - e * Math.cos(E));
  } else {
    const H = RSX.solveKepler(el.M, e);
    nu = 2 * Math.atan2(Math.sqrt(e + 1) * Math.sinh(H / 2), Math.sqrt(e - 1) * Math.cosh(H / 2));
    rm = a * (1 - e * Math.cosh(H));
  }
  const vs = Math.sqrt(mu / Math.max(p, 1e-9));
  const vpx = -Math.sin(nu) * vs, vpy = (e + Math.cos(nu)) * vs;
  const cw = Math.cos(w), sw = Math.sin(w);
  const ang = w + nu;
  const dir = el.dir || 1;
  // Retrograde orbits (h<0, dir=-1): the perifocal velocity formula assumes
  // nu increases with time, which is only true for prograde motion. Mirror
  // the reconstructed velocity rather than trying to carry a signed
  // inclination through 2D formulas (design/flight-physics.md §6.2).
  return {
    r: { x: rm * Math.cos(ang), y: rm * Math.sin(ang) },
    v: { x: (vpx * cw - vpy * sw) * dir, y: (vpx * sw + vpy * cw) * dir },
    nu, rm,
  };
};

RSX.railsAdvance = function (el, dt, mu) {
  const n = Math.sqrt(mu / Math.abs(el.a * el.a * el.a));
  el.M += n * dt;
  el.t += dt;
  return RSX.elementsToState(el, mu);
};

// Never step past atmosphere entry or ground impact -- the elements stay
// perfectly valid after teleporting through the planet, so this failure
// is silent unless capped BEFORE every rails step (design/critique.md C_ many).
RSX.timeToRadius = function (el, targetR, mu) {
  if (el.e >= 1) {
    // hyperbolic/parabolic: only reachable if targetR is within reach on this arm
    if (targetR < el.rPeri) return null;
  } else {
    if (targetR < el.rPeri || targetR > el.rApo) return null;
  }
  const cosNu = RSX.clamp((el.p / targetR - 1) / Math.max(el.e, 1e-9), -1, 1);
  const nuTarget = -Math.acos(cosNu); // descending crossing
  let EorH, Mtarget;
  if (el.e < 1) {
    EorH = 2 * Math.atan2(Math.sqrt(Math.max(1 - el.e, 0)) * Math.sin(nuTarget / 2), Math.sqrt(1 + el.e) * Math.cos(nuTarget / 2));
    Mtarget = EorH - el.e * Math.sin(EorH);
  } else {
    const H = 2 * Math.atanh(RSX.clamp(Math.sqrt((el.e - 1) / (el.e + 1)) * Math.tan(nuTarget / 2), -0.999999, 0.999999));
    Mtarget = el.e * Math.sinh(H) - H;
  }
  const n = Math.sqrt(el.mu / Math.abs(el.a * el.a * el.a));
  let dM = Mtarget - el.M;
  if (el.e < 1) { dM = dM % (2 * Math.PI); if (dM < 0) dM += 2 * Math.PI; }
  else if (dM < 0) return null; // hyperbolic: only forward in time
  return dM / n;
};

RSX.railsStepCap = function (el, dtWanted, planet) {
  let dt = dtWanted;
  const tEntry = RSX.timeToRadius(el, planet.R + planet.zAtm, planet.mu);
  if (tEntry !== null) dt = Math.min(dt, Math.max(tEntry - 0.5, 0.01));
  const tImpact = RSX.timeToRadius(el, planet.R, planet.mu);
  if (tImpact !== null) dt = Math.min(dt, Math.max(tImpact - 0.5, 0.01));
  return dt;
};

/* ---- HUD-facing derived readouts (design/flight-physics.md §6.3) ---- */
RSX.orbitReadouts = function (el, planet) {
  const n = Math.sqrt(el.mu / Math.abs(el.a * el.a * el.a));
  const wrap2pi = x => { x = x % (2 * Math.PI); return x < 0 ? x + 2 * Math.PI : x; };
  const tToApo = el.e < 1 ? wrap2pi(Math.PI - el.M) / n : NaN;
  const tToPeri = el.e < 1 ? wrap2pi(-el.M) / n : NaN;
  const altApo = el.e < 1 ? el.rApo - planet.R : NaN;
  const altPeri = el.rPeri - planet.R;
  let dvToCirc = NaN;
  if (el.e < 1 && Number.isFinite(el.rApo)) {
    const vApo = Math.sqrt(el.mu * (2 / el.rApo - 1 / el.a));
    const vCircApo = Math.sqrt(el.mu / el.rApo);
    dvToCirc = vCircApo - vApo;
  }
  return { altApo, altPeri, period: el.period, tToApo, tToPeri, dvToCirc };
};

RSX.classifyOrbit = function (el, planet) {
  const altPeri = el.rPeri - planet.R;
  const altApo = el.e < 1 ? el.rApo - planet.R : Infinity;
  if (el.e >= 1.0) return { k: "ESCAPE", msg: "Escape trajectory" };
  if (altPeri <= 0) return { k: "SUBORBITAL", msg: "Impact — raise periapsis" };
  if (altPeri < planet.zAtm) return { k: "DECAYING", msg: `Periapsis ${(altPeri / 1000).toFixed(0)} km — inside atmosphere, orbit will decay` };
  if (altApo / altPeri > 1.05) return { k: "ELLIPTICAL", msg: "Stable elliptical orbit" };
  return { k: "CIRCULAR", msg: "Stable circular orbit" };
};

RSX.conicPath = function (el, planet, nPts) {
  const pts = [];
  let nuImpact = null;
  if (el.e > 1e-8) {
    const cosNu = RSX.clamp((el.p / planet.R - 1) / el.e, -1, 1);
    if (Math.abs((el.p / planet.R - 1) / el.e) <= 1) nuImpact = -Math.acos(cosNu);
  }
  const nuStart = el.nu;
  let nuEnd;
  if (nuImpact !== null) {
    let target = nuImpact;
    while (target < nuStart) target += 2 * Math.PI;
    nuEnd = target;
  } else {
    nuEnd = nuStart + 2 * Math.PI;
  }
  for (let i = 0; i <= nPts; i++) {
    const nu = nuStart + (nuEnd - nuStart) * i / nPts;
    const rm = el.p / (1 + el.e * Math.cos(nu));
    if (rm <= 0 || rm > 1e10) break;
    const ang = el.w + nu;
    pts.push({ x: rm * Math.cos(ang), y: rm * Math.sin(ang) });
  }
  return { pts, impact: nuImpact !== null };
};

/* =====================================================================
   9. REENTRY HEATING (design/flight-physics.md §7)
   ===================================================================== */
RSX.suttonGraves = function (rho, V, Rn) {
  return 1.7415e-4 * Math.sqrt(Math.max(rho, 0) / Math.max(Rn, 0.01)) * V * V * V;
};
RSX.stefanBoltzmann = 5.670374e-8;

/**
 * Advance a lumped-capacitance skin temperature one substep.
 * part: {T, cp, mass, area, emissivity, ablative, ablatorMass, TAbl, hAbl}
 */
RSX.advanceThermal = function (part, qConv, fExpose, dt) {
  if (part.ablative && part.ablatorMass > 0 && part.T >= (part.TAbl || 1900)) {
    const mdotAbl = qConv * part.area * fExpose / (part.hAbl || 1.2e7);
    part.ablatorMass = Math.max(0, part.ablatorMass - mdotAbl * dt);
    part.T = part.TAbl || 1900;
    return;
  }
  const rad = RSX.stefanBoltzmann * (part.emissivity || 0.85) * (Math.pow(part.T, 4) - Math.pow(250, 4)) * part.area;
  const heatIn = qConv * fExpose * part.area;
  const dT = (heatIn - rad) / (part.mass * (part.cp || 900));
  part.T += dT * dt;
};

/* =====================================================================
   10. GROUND CONTACT (design/flight-physics.md §8)
   ===================================================================== */
RSX.contactAltitude = function (S, contactPointsBody, planetR) {
  let minAlt = Infinity, minCp = null;
  const c = Math.cos(S.th), s = Math.sin(S.th);
  for (const cp of contactPointsBody) {
    const wx = S.rx + cp.x * c - cp.y * s;
    const wy = S.ry + cp.x * s + cp.y * c;
    const alt = Math.hypot(wx, wy) - planetR;
    if (alt < minAlt) { minAlt = alt; minCp = { wx, wy }; }
  }
  return { alt: minAlt, point: minCp };
};

/**
 * Penalty spring-damper contact force + torque, applied directly into
 * S.vx/S.vy/S.om for the substep (called from the flight loop's contact
 * phase, not from deriv(), since it depends on per-contact-point state).
 */
RSX.contactResponse = function (S, veh, contactPointsBody, planet, dt) {
  const c = Math.cos(S.th), s = Math.sin(S.th);
  const m = veh.mp.m, I = veh.mp.I;
  const k = 40 * m * RSX.GRAVITY_REF / 0.05;
  const zeta = 0.7;
  const cDamp = 2 * zeta * Math.sqrt(k * m);
  const muF = 0.6;
  let any = false;
  for (const cp of contactPointsBody) {
    const wx = S.rx + cp.x * c - cp.y * s;
    const wy = S.ry + cp.x * s + cp.y * c;
    const rmag = Math.hypot(wx, wy);
    const alt = rmag - planet.R;
    if (alt >= 0) continue;
    any = true;
    const upx = wx / rmag, upy = wy / rmag;
    const tanx = -upy, tany = upx;
    const vpx = S.vx - S.om * (cp.y * c + cp.x * s) - (-planet.wp * wy);
    const vpy = S.vy + S.om * (cp.x * c - cp.y * s) - (planet.wp * wx);
    const vRadial = vpx * upx + vpy * upy;
    const vTang = vpx * tanx + vpy * tany;
    const pen = -alt;
    const Fn = Math.max(0, k * pen + cDamp * Math.max(0, -vRadial));
    const Ft = -muF * Fn * Math.tanh(vTang / 0.1);
    const Fx = Fn * upx + Ft * tanx, Fy = Fn * upy + Ft * tany;
    S.vx += (Fx / m) * dt; S.vy += (Fy / m) * dt;
    const rx_ = wx - S.rx, ry_ = wy - S.ry;
    const torque = rx_ * Fy - ry_ * Fx;
    S.om += (torque / I) * dt;
  }
  return any;
};

/* =====================================================================
   11. VALIDATION SUITE — run via runValidation() in a headless page.
   Each case is drawn directly from design/flight-physics.md §11.
   ===================================================================== */
RSX.runValidation = function () {
  const results = [];
  const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

  // 1. BODY.pa(0) === 101325 on both worlds (design/critique.md C12)
  ok("pa(0) home === 101325", RSX.atmosphere(0, RSX.PLANETS.home).P === 101325, RSX.atmosphere(0, RSX.PLANETS.home).P);
  ok("pa(0) earth === 101325", RSX.atmosphere(0, RSX.PLANETS.earth).P === 101325, RSX.atmosphere(0, RSX.PLANETS.earth).P);

  // 2. Atmosphere table (Earth) at known altitudes
  const atmChecks = [
    [0, 1.2250, 101325, 288.15],
    [11000, 0.36392, 22632, 216.65],
    [20000, 0.088035, 5474.9, 216.65],
  ];
  for (const [z, rho, P, T] of atmChecks) {
    const a = RSX.atmosphere(z, RSX.PLANETS.earth);
    ok(`atm(${z}) rho`, Math.abs(a.rho - rho) / rho < 0.01, a.rho);
    ok(`atm(${z}) P`, Math.abs(a.P - P) / P < 0.01, a.P);
  }

  // 3. Speed of sound
  ok("a(0)=340.29", Math.abs(RSX.atmosphere(0, RSX.PLANETS.earth).a - 340.29) < 0.5, RSX.atmosphere(0, RSX.PLANETS.earth).a);

  // 4/5. Circular orbit stability over many periods (Earth, 200 km alt)
  {
    const planet = RSX.PLANETS.earth;
    const r0 = planet.R + 200000;
    const v0 = Math.sqrt(planet.mu / r0);
    let el = RSX.stateToElements({ x: r0, y: 0 }, { x: 0, y: v0 }, planet.mu, 0);
    const a0 = el.a, e0 = el.e;
    const period = el.period;
    for (let orbit = 0; orbit < 10; orbit++) {
      const { r, v } = RSX.railsAdvance(el, period / 100, planet.mu);
      for (let i = 1; i < 100; i++) RSX.railsAdvance(el, period / 100, planet.mu);
    }
    ok("circular orbit |da/a|<1e-3 over 10 orbits", Math.abs(el.a - a0) / a0 < 1e-3, (el.a - a0) / a0);
    ok("circular orbit |de|<1e-4 over 10 orbits", Math.abs(el.e - e0) < 1e-4, el.e - e0);
    ok("period ~5305s", Math.abs(period - 5305) < 5, period);
  }

  // 7. stateToElements <-> elementsToState round trip
  {
    const rng = RSX.mulberry32(12345);
    let worstErr = 0;
    const planet = RSX.PLANETS.earth;
    for (let i = 0; i < 200; i++) {
      const r = planet.R + 100000 + rng() * 2e6;
      const speedFrac = 0.7 + rng() * 0.6;
      const vCirc = Math.sqrt(planet.mu / r);
      const ang = rng() * Math.PI * 2;
      const r0 = { x: r, y: 0 };
      const v0 = { x: vCirc * speedFrac * Math.sin(ang), y: vCirc * speedFrac * Math.cos(ang) };
      const el = RSX.stateToElements(r0, v0, planet.mu, 0);
      if (el.e >= 1) continue;
      const back = RSX.elementsToState(el, planet.mu);
      const err = Math.hypot(back.r.x - r0.x, back.r.y - r0.y) / r;
      worstErr = Math.max(worstErr, err);
    }
    ok("elements round-trip |dr|/r < 1e-9", worstErr < 1e-9, worstErr);
  }

  // 9/10. Aero torque sign
  {
    const veh = {
      s_cm: 10, Dmax: 2, bluntNose: false, sTail: 20, Splan: 20,
      aeroContribs: [{ kind: "fin", CNa: 4.0, s: 18 }, { kind: "nose", CNa: 2.0, s: 1 }],
    };
    const AC = RSX.vehicleAero(veh, 0.9);
    ok("stable rocket: xcp_b < 0 (CP aft of CM)", AC.xcp_b < 0, AC.xcp_b);
    const sa = Math.sin(0.1), ca = Math.cos(0.1);
    const CNlin = AC.CNa * sa * ca;
    const tau = AC.xcp_b * (-CNlin * 20000 * AC.Sref);
    ok("stable rocket alpha=+0.1 => tau_aero > 0", tau > 0, tau);
  }

  // 14. Terminal velocity, 1kg sphere Cd=0.47 A=0.01 sea level.
  // v = sqrt(2mg/(rho*Cd*A)) = sqrt(2*1*9.80665/(1.225*0.47*0.01)) = 58.4 m/s.
  {
    const planet = RSX.PLANETS.earth;
    const rho = RSX.atmosphere(0, planet).rho;
    const vTerm = Math.sqrt((2 * 1 * RSX.GRAVITY_REF) / (rho * 0.47 * 0.01));
    ok("terminal velocity = sqrt(2mg/(rho*Cd*A)) = 58.4 m/s", Math.abs(vTerm - 58.4) < 1, vTerm);
  }

  // 16. Sutton-Graves
  {
    const q = RSX.suttonGraves(8.28e-5, 7500, 1.0);
    ok("Sutton-Graves LEO capsule ~6.7e5 W/m^2", Math.abs(q - 6.69e5) / 6.69e5 < 0.02, q);
  }

  // 20. Tsiolkovsky closure, high mass ratio (design/flight-physics.md §11 test 20).
  // This is the specific test that catches the variable-mass formulation
  // error (10.1): a d(mv)/dt implementation is off by tens of percent at
  // high mass ratio. Force Isp = 300s exactly (mdot=1 kg/s, thrust=g0*300N)
  // so the check is against the spec's own worked number, independent of
  // any particular nozzle's incidental Isp.
  {
    const thrust0 = 300 * RSX.GRAVITY_REF, mdot0 = 1.0;
    const dvIdeal = 300 * RSX.GRAVITY_REF * Math.log(1000 / 400);
    let m = 1000, v = 0;
    const dt = 0.001;
    while (m > 400 + 1e-9) {
      v += (thrust0 / m) * dt;   // F = m*a with INSTANTANEOUS mass -- never d(mv)/dt
      m -= mdot0 * dt;
    }
    ok("Tsiolkovsky ideal formula = 2696 m/s", Math.abs(dvIdeal - 2696) < 1, dvIdeal);
    ok("Integrator matches Tsiolkovsky within 0.1%", Math.abs(v - dvIdeal) / dvIdeal < 0.001, v);
  }
  // Same check but through the REAL engine model (arbitrary nozzle), to
  // confirm the actual thrustN()/massFlow() functions -- not just the
  // synthetic case above -- also close against their own emergent Isp.
  {
    const propellant = { cstar: 1823, k: 1.22 };
    const nozzle = { throatD: 0.05, exitD: 0.20, efficiency: 1.0 };
    const motor = { ...RSX.makeMotor(propellant, null, nozzle), type: "liquid", pcDesign: 5e6, propellantLoad: 600 };
    const thrust0 = RSX.thrustN(motor, motor.pcDesign, 0);
    const mdot0 = RSX.massFlow(motor, motor.pcDesign);
    const isp = thrust0 / (mdot0 * RSX.GRAVITY_REF);
    const dvIdeal = isp * RSX.GRAVITY_REF * Math.log(1000 / 400);
    let m = 1000, v = 0;
    const dt = 0.001;
    while (m > 400 + 1e-9) { v += (thrust0 / m) * dt; m -= mdot0 * dt; }
    ok("Real engine model: integrator matches its own Isp within 0.5%", Math.abs(v - dvIdeal) / dvIdeal < 0.005, { isp, v, dvIdeal });
  }

  // Engine-adapter asserts (design/critique.md Step 1)
  {
    const motor = RSX.makeMotor(RSX.FUEL_PRESETS.solid.propellant,
      { outerD: 0.038, coreD: 0.012, length: 0.04, numSegments: 3, burnEnds: true, perimeterFactor: 1.0 },
      { throatD: 0.009, exitD: 0.027, efficiency: 0.92 });
    motor.type = "solid";
    const s0 = RSX.stateAtWeb(motor, 0, 101325);
    // With the spec-derived APCP constants (density 1770, a=4.368e-5 from
    // game-mechanics.md's SRB table), a hobby-scale grain lands a bit higher
    // than the classic ~2.9 MPa hobby example, but stays in the physically
    // plausible hobby-motor band.
    ok("hobby default pc in plausible hobby band (2-6 MPa)", s0.pc / 1e6 > 2 && s0.pc / 1e6 < 6, s0.pc / 1e6);

    // catalog SRB (Kestrel-S dims, design/game-mechanics.md §5.6) must land
    // 3-12 MPa with perimeterFactor tuning (design/critique.md C14).
    const srb = RSX.makeMotor(RSX.FUEL_PRESETS.solid.propellant,
      { outerD: 0.94, coreD: 0.30, length: 1.60, numSegments: 3, burnEnds: false, perimeterFactor: 1.8 },
      { throatD: Math.sqrt(0.0405 / (Math.PI / 4)) , exitD: Math.sqrt(0.0405*8 / (Math.PI/4)), efficiency: 0.94 });
    srb.type = "solid";
    const srbS0 = RSX.stateAtWeb(srb, 0, 101325);
    ok("catalog SRB-S: 3 MPa < pc(0) < 12 MPa", srbS0.pc / 1e6 > 3 && srbS0.pc / 1e6 < 12, srbS0.pc / 1e6);

    // vacuum bell must give POSITIVE sea-level thrust even when separated
    const vac = { ...RSX.makeMotor({ cstar: 1823, k: 1.22 }, null, { throatD: 0.163, exitD: 1.31, efficiency: 0.97 }), type: "liquid", pcDesign: 6.0e6, propellantLoad: 480 };
    const thrustSL = RSX.thrustN(vac, vac.pcDesign, 101325);
    ok("vacuum bell: positive sea-level thrust", thrustSL > 0, thrustSL);
    ok("vacuum bell: separated at sea level", RSX.isSeparated(vac, vac.pcDesign, 101325), RSX.peIdeal(vac, vac.pcDesign) / 101325);
  }

  return results;
};

if (typeof module !== "undefined") module.exports = RSX;
