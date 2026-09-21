/* =====================================================================
   ROCKET / VEHICLE — turns a small ordered list of catalog part ids into
   the exact vehicle object physics-core.js already knows how to fly
   (the same shape RSX.testVehicle.build() constructs by hand in
   flight-loop.js). This is the first slice of R-4/R-38: parts are now
   data (web/js/parts/catalog.js), but nothing about the flight loop
   changes yet -- this file is additive and unused by game.html until a
   later increment switches it over, once this one is reviewed and green.

   Scope, deliberately: one straight stack (no radial branching except a
   single pair of fins on the last stack part, no staging, one engine).
   That is exactly what the current game flies, so this increment can be
   verified against it exactly rather than against a guess.
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};

/**
 * A DESIGN is just the order to stack parts in, nose first, plus which
 * part (if any) carries the fin pair:
 *   { stack: [partId, ...], finOn: partId | null }
 */
RSX.rocket.CADET_I = {
  stack: ["nose.s", "pod.probe", "tank.s", "engine.k1"],
  finOn: "engine.k1",
};

/**
 * layoutStack(stackIds) -> [{id, def, sTop, sBot, sMid}, ...]
 * Stations run nose-first, top to bottom, matching physics-core's
 * "s = metres from the nose tip, positive aft" convention. A fin
 * (L = 0, checked by RSX.PARTS.register) would sit at zero width if
 * ever placed in the stack, which is why fins are attached separately
 * (finOn), not stacked.
 */
RSX.rocket.layoutStack = function (stackIds) {
  let sTop = 0;
  const laid = [];
  for (const id of stackIds) {
    const def = RSX.PARTS.get(id);
    const sBot = sTop + def.L;
    laid.push({ id, def, sTop, sBot, sMid: (sTop + sBot) / 2 });
    sTop = sBot;
  }
  return laid;
};

/**
 * buildVehicle(design) -> veh, in the exact shape RSX.deriv/RSX.stepVerlet/
 * RSX.control already consume (physics-core.js:434-437, :515-520;
 * flight-loop.js:16-63). Throws if `design` names an unknown part, or a
 * stack with no engine or no tank -- there is nothing sensible to fly.
 */
RSX.rocket.buildVehicle = function (design) {
  const laid = RSX.rocket.layoutStack(design.stack);

  const enginePart = laid.find((p) => p.def.engine);
  const tankPart = laid.find((p) => p.def.tank);
  if (!enginePart) throw new Error("buildVehicle: stack has no engine part");
  if (!tankPart) throw new Error("buildVehicle: stack has no tank part");

  const eng = enginePart.def.engine;
  const nozzle = { throatD: eng.throatD, exitD: eng.exitD, efficiency: eng.efficiency };
  const preset = RSX.FUEL_PRESETS[eng.propKey];
  const propellant = { cstar: preset.propellant.cstar, k: preset.propellant.k };
  const motor = { ...RSX.makeMotor(propellant, null, nozzle), type: "liquid", pcDesign: eng.pcDesign };

  const dia = 2 * Math.max(...laid.map((p) => p.def.R));
  const sTail = laid[laid.length - 1].sBot;
  const sEngine = sTail; // thrust/gimbal plane at the base of the last stack part, as today

  const parts = laid.map((p) => {
    const base = { name: p.def.name, dryMass: p.def.dryMass, s: p.sMid, L: p.def.L, R: p.def.R, propMass: 0 };
    if (p.def.tank) {
      base.propMass = p.def.tank.massFull;
      base.propMassFull = p.def.tank.massFull;
      base.propTankLen = p.def.L;
    }
    return base;
  });

  const noseLen = laid[0].def.L; // nose is always stack[0], matching testVehicle's convention
  const aeroContribs = [{ kind: "nose", CNa: 2.0, s: noseLen * 0.466 }];
  if (design.finOn) {
    const finHost = laid.find((p) => p.id === design.finOn);
    if (!finHost) throw new Error("buildVehicle: finOn names a part not in the stack: " + design.finOn);
    aeroContribs.push({ kind: "fin", CNa: RSX.PARTS.get("fin.d").fin.CNa, s: sTail - 0.3 });
  }

  const veh = {
    motor, propKey: eng.propKey, dia, sTail, sEngine, Dmax: dia,
    bluntNose: false, cd0Factor: 1,
    parts,
    aeroContribs,
    Splan: dia * sTail + 2 * 0.9,
    sCross: sTail * 0.55,
    LfwdAft: null,
    gimbal: 0,
    art: {
      noseLen, noseDia: dia,
      bodyLen: sTail - noseLen, bodyDia: dia,
      finRootChord: 1.0, finSpan: 0.9,
    },
  };
  veh.mp = RSX.massProps(veh.parts);
  return veh;
};

if (typeof module !== "undefined") module.exports = RSX;
