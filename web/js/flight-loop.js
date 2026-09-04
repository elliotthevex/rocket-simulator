/* =====================================================================
   FLIGHT LOOP — wires physics-core.js to one hardcoded vehicle for the
   Step 5 vertical-slice gate: "one hardcoded rocket flies and looks real."
   No staging, no builder, no HUD yet -- those are later build steps.
   ===================================================================== */
"use strict";

RSX.testVehicle = {};

/**
 * Build a single-stage test vehicle: nose + probe + a small RP-1 tank +
 * a sea-level engine (dims matched to design/game-mechanics.md ENG-K1),
 * with two fins for pitch stability. Station s = metres from nose tip,
 * positive aft (matches physics-core convention).
 */
RSX.testVehicle.build = function () {
  const propKey = "rp1";
  const preset = RSX.FUEL_PRESETS[propKey];
  const propellant = { cstar: preset.propellant.cstar, k: preset.propellant.k };
  const nozzle = { throatD: 0.1450, exitD: 0.5800, efficiency: 0.94 }; // ENG-K1-class, eps=16
  const motor = { ...RSX.makeMotor(propellant, null, nozzle), type: "liquid", pcDesign: 10.0e6 };

  const dia = 1.2;
  const noseLen = 1.6, probeLen = 0.5, tankLen = 4.0, engineMountLen = 1.0;
  const propMassFull = 4600; // kg, TNK-S1-class capacity at bulkDensity 1023

  const sNoseTop = 0, sNoseBot = noseLen;
  const sProbeTop = sNoseBot, sProbeBot = sProbeTop + probeLen;
  const sTankTop = sProbeBot, sTankBot = sTankTop + tankLen;
  const sMountTop = sTankBot, sMountBot = sMountTop + engineMountLen;
  const sTail = sMountBot;
  const sEngine = sMountBot; // thrust application point / gimbal plane

  const parts = [
    { name: "nose", dryMass: 60, s: (sNoseTop + sNoseBot) / 2, L: noseLen, R: dia / 2, propMass: 0 },
    { name: "probe", dryMass: 90, s: (sProbeTop + sProbeBot) / 2, L: probeLen, R: dia / 2, propMass: 0 },
    { name: "tank", dryMass: propMassFull * 0.05, s: (sTankTop + sTankBot) / 2, L: tankLen, R: dia / 2,
      propMass: propMassFull, propMassFull, propTankLen: tankLen },
    { name: "mount", dryMass: 630, s: (sMountTop + sMountBot) / 2, L: engineMountLen, R: dia / 2, propMass: 0 },
  ];

  const veh = {
    motor, propKey, dia, sTail, sEngine, Dmax: dia,
    bluntNose: false, cd0Factor: 1,
    parts,
    // aero contributors: nose (fixed CNa=2) + 2 fins near the tail
    aeroContribs: [
      { kind: "nose", CNa: 2.0, s: noseLen * 0.466 },
      { kind: "fin", CNa: 6.0, s: sTail - 0.3 },
    ],
    Splan: dia * (sTail) + 2 * 0.9, // rough: body planform + fin planform
    sCross: sTail * 0.55,
    LfwdAft: null, // computed from s_cm each frame
    gimbal: 0,
    // vector-art geometry (for the renderer)
    art: {
      noseLen, noseDia: dia, bodyLen: probeLen + tankLen + engineMountLen, bodyDia: dia,
      finRootChord: 1.0, finSpan: 0.9,
    },
  };
  veh.mp = RSX.massProps(veh.parts);
  return veh;
};

RSX.testVehicle.thrustNow = function (veh, pa, throttle) {
  const t = RSX.clamp(throttle, 0, 1);
  const pc = veh.motor.pcDesign * t;
  return pc > 0 ? RSX.thrustN(veh.motor, pc, pa) : 0;
};
RSX.testVehicle.mdotNow = function (veh, pa, throttle) {
  const t = RSX.clamp(throttle, 0, 1);
  const pc = veh.motor.pcDesign * t;
  return pc > 0 ? RSX.massFlow(veh.motor, pc) : 0;
};
RSX.testVehicle.advanceBurn = function (veh, A, dt) {
  const tankPart = veh.parts.find(p => p.name === "tank");
  tankPart.propMass = Math.max(0, tankPart.propMass - A.mdot * dt);
};

/**
 * Runs a headless (no-render) flight for `duration` seconds at fixed
 * throttle, returning a sampled trajectory -- used both for the
 * validation console and for screenshot-testing the renderer at chosen
 * altitudes without depending on requestAnimationFrame.
 */
RSX.testVehicle.simulate = function (planet, throttle, duration, dt) {
  dt = dt || 1 / 120;
  const veh = RSX.testVehicle.build();
  veh.thrustNow = (pa, thr) => RSX.testVehicle.thrustNow(veh, pa, thr);
  veh.mdotNow = (pa, thr) => RSX.testVehicle.mdotNow(veh, pa, thr);
  veh.advanceBurn = (A, dt_) => RSX.testVehicle.advanceBurn(veh, A, dt_);

  const S = { rx: 0, ry: planet.R, vx: -planet.wp * planet.R, vy: 0, th: Math.PI / 2, om: 0, t: 0 };
  const ctrl = { throttle, gimbal: 0, tauRCS: 0 };
  const cache = { valid: false, tmpA: {}, tmpB: {} };
  const samples = [];
  let t = 0;
  while (t < duration) {
    const alt = Math.hypot(S.rx, S.ry) - planet.R;
    samples.push({ t, alt, vx: S.vx, vy: S.vy, th: S.th, propMass: veh.parts.find(p => p.name === "tank").propMass, m: veh.mp.m });
    RSX.stepVerlet(S, veh, ctrl, planet, dt, cache);
    t += dt;
  }
  return { samples, veh };
};

if (typeof module !== "undefined") module.exports = RSX;
