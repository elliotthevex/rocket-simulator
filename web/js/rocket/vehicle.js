/* =====================================================================
   ROCKET / VEHICLE — turns an ordered list of catalog part ids into the
   exact vehicle object physics-core.js already knows how to fly (the
   same shape RSX.testVehicle.build() constructs by hand in
   flight-loop.js, which stays as the regression oracle:
   tests/js/test-rocket-vehicle.js proves buildVehicle(CADET_I) equals it
   to 1e-9).

   Stage-2 data model (design/stage-2-plan.md §3): a design is a free
   stack (nose-first) that may contain `decoupler` parts; every
   decoupler starts a new stage below it. buildVehicle builds the FULL
   stack as one flyable body whose motor is the BOTTOM stage's engine;
   web/js/rocket/flight.js separates stages in flight. Tanks are VOLUME
   based: a tank's catalog `massFull` is its capacity with the reference
   propellant, and the mass that actually fits is volume x the stage
   engine's propellant bulk density (so an LH2 engine under an RP-1-
   sized tank carries a third of the mass -- a real, modelled tradeoff).
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};

/**
 * A DESIGN is the order to stack parts in, nose first, plus which
 * part (if any) carries the fin set. This literal is the regression
 * oracle's design and must not change (legacy `finOn: partId` form;
 * normalizeDesign() below converts it to the v2 `finAt` index form).
 */
RSX.rocket.CADET_I = {
  stack: ["nose.s", "pod.probe", "tank.s", "engine.k1"],
  finOn: "engine.k1",
};

RSX.rocket.DESIGN_DEFAULTS = { fuelLoad: 1, autoStage: true, pitchOverAlt: 0, pitchTargetDeg: 90 };

/**
 * normalizeDesign(design) -> NEW { name, stack:[...], finAt, fin, config:{...} }
 * (design/stage-2-plan.md §3.1). Accepts the legacy `finOn: partId`
 * (converted to `finAt = stack.lastIndexOf(finOn)`, -1 -> null), fills
 * every config default, and clamps config values to their legal ranges.
 * Every RSX.rocket.* entry point calls this first, so callers may pass
 * either form.
 */
RSX.rocket.normalizeDesign = function (design) {
  design = design || {};
  const stack = Array.isArray(design.stack) ? design.stack.slice() : [];
  let finAt = null;
  if (Number.isInteger(design.finAt) && design.finAt >= 0 && design.finAt < stack.length) {
    finAt = design.finAt;
  } else if (typeof design.finOn === "string") {
    const i = stack.lastIndexOf(design.finOn);
    finAt = i >= 0 ? i : null;
  }
  const fin = typeof design.fin === "string" && design.fin ? design.fin : "fin.d";
  const c = design.config || {};
  const D = RSX.rocket.DESIGN_DEFAULTS;
  const num = (v, dflt) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);
  const config = {
    fuelLoad: RSX.clamp(num(c.fuelLoad, D.fuelLoad), 0.1, 1),
    autoStage: c.autoStage == null ? D.autoStage : !!c.autoStage,
    pitchOverAlt: Math.max(0, num(c.pitchOverAlt, D.pitchOverAlt)),
    pitchTargetDeg: RSX.clamp(num(c.pitchTargetDeg, D.pitchTargetDeg), 0, 90),
  };
  return { name: typeof design.name === "string" ? design.name : "", stack, finAt, fin, config };
};

/**
 * stagesOf(stack) -> [{ n, iStart, iEnd (inclusive), ids:[...] }, ...]
 * ordered BOTTOM-FIRST (stage 1 fires first). A `decoupler` part starts
 * the stage BELOW it (it is dropped with that stage). A stack with no
 * decoupler is one stage covering everything.
 */
RSX.rocket.stagesOf = function (stack) {
  const cuts = [0];
  stack.forEach((id, i) => { if (i > 0 && RSX.PARTS.get(id).cls === "decoupler") cuts.push(i); });
  const topFirst = cuts.map((iStart, k) => {
    const iEnd = (k + 1 < cuts.length ? cuts[k + 1] : stack.length) - 1;
    return { iStart, iEnd, ids: stack.slice(iStart, iEnd + 1) };
  });
  topFirst.reverse();
  topFirst.forEach((st, k) => { st.n = k + 1; });
  return topFirst;
};

/**
 * tankVolumeM3(def): a tank's fixed internal volume. `massFull` is the
 * catalog's reference capacity when filled with the tank's reference
 * propellant (RP-1 for every catalog tank), so volume = massFull /
 * that propellant's bulk density; what another propellant weighs in
 * the same volume follows from ITS bulk density.
 */
RSX.rocket.tankVolumeM3 = function (def) {
  const refKey = (def.tank && def.tank.propKey) || "rp1";
  return def.tank.massFull / RSX.FUEL_PRESETS[refKey].propellant.bulkDensity;
};

/**
 * layoutStack(stackIds) -> [{id, def, sTop, sBot, sMid}, ...]
 * Stations run nose-first, top to bottom, matching physics-core's
 * "s = metres from the nose tip, positive aft" convention. A fin
 * (L = 0, checked by RSX.PARTS.register) would sit at zero width if
 * ever placed in the stack, which is why fins are attached separately
 * (finAt), not stacked.
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

function motorFromEngineDef(eng) {
  const nozzle = { throatD: eng.throatD, exitD: eng.exitD, efficiency: eng.efficiency };
  const preset = RSX.FUEL_PRESETS[eng.propKey];
  const propellant = { cstar: preset.propellant.cstar, k: preset.propellant.k };
  return { ...RSX.makeMotor(propellant, null, nozzle), type: "liquid", pcDesign: eng.pcDesign };
}

// Bell length exactly as RSX.render.drawEngineBell draws it -- the art
// and hit regions must describe what is actually on screen.
function bellLength(motor) {
  if (!motor) return 0;
  const Rt = motor.nozzle.throatD / 2, Re = motor.nozzle.exitD / 2;
  return 1.4 * (Re - Rt) / Math.tan(15 * Math.PI / 180);
}

/**
 * artFor(veh) -> { noseLen, noseDia, bodyLen, bodyDia, finRootChord, finSpan,
 *   finS, bellRt, bellRe, hitRegions:[{ part, label, sTop, sBot, halfWidth }] }
 * Pure geometry for the 2D flight renderer, read from the CURRENT
 * veh.parts (so it is right for the remaining stack after a separation
 * and for a dropped stage alike). Stations are the vehicle's own (s = 0
 * at its top). `finS` is the station of the fin root's aft edge (null
 * when no fin host is aboard); `bellRt/bellRe` are null with no motor.
 */
RSX.rocket.artFor = function (veh) {
  const parts = veh.parts;
  const first = parts[0];
  const noseLen = first && first.cls === "nose" ? first.L : 0;
  const noseDia = first ? 2 * first.R : 0;
  const bodyDia = 2 * parts.reduce((m, p) => Math.max(m, p.R), 0);
  const sTail = parts.length ? parts[parts.length - 1].s + parts[parts.length - 1].L / 2 : 0;
  const host = parts.find((p) => p.hasFins);
  const fin = host && veh.fin ? veh.fin.fin : null;
  const finS = host ? host.s + host.L / 2 : null;
  const Ln = bellLength(veh.motor);
  const hitRegions = [];
  if (host && fin) {
    hitRegions.push({ part: "fins", label: "fins", sTop: finS - fin.rootChord, sBot: finS,
      halfWidth: host.R + fin.span, minHalfWidth: host.R });
  }
  parts.forEach((p, i) => {
    const isBottomEngine = p.cls === "engine" && i === parts.length - 1 && veh.motor;
    const Re = veh.motor ? veh.motor.nozzle.exitD / 2 : 0;
    hitRegions.push({
      part: p.cls, label: p.name, sTop: p.s - p.L / 2,
      sBot: p.s + p.L / 2 + (isBottomEngine ? Ln : 0),
      halfWidth: isBottomEngine ? Math.max(p.R, Re) : p.R,
    });
  });
  return {
    noseLen, noseDia, bodyLen: sTail - noseLen, bodyDia,
    finRootChord: fin ? fin.rootChord : 0, finSpan: fin ? fin.span : 0, finS,
    bellRt: veh.motor ? veh.motor.nozzle.throatD / 2 : null,
    bellRe: veh.motor ? veh.motor.nozzle.exitD / 2 : null,
    hitRegions,
  };
};

/**
 * refreshActive(veh): derives everything the kernel reads about the
 * CURRENT body (motor, geometry, aero contributors, art, mass props)
 * from veh.parts + veh.stages[veh.stageIndex]. One code path shared by
 * buildVehicle and flight.js's separate()/resetStages(), so the
 * post-separation vehicle is built by exactly the rules the launch
 * vehicle was.
 */
RSX.rocket.refreshActive = function (veh) {
  const parts = veh.parts;
  const stage = veh.stages[veh.stageIndex];
  const dia = 2 * parts.reduce((m, p) => Math.max(m, p.R), 0);
  const last = parts[parts.length - 1];
  const sTail = last.s + last.L / 2;

  veh.motor = stage.motor;
  veh.propKey = stage.propKey;
  veh.dia = dia; veh.Dmax = dia;
  veh.sTail = sTail;
  veh.sEngine = sTail; // thrust/gimbal plane at the base of the last stack part

  // Aero contributors: the top part acts as the nose (C_Na = 2.0, CP by
  // its shape); a body with no nose cone is blunt-fronted. Fins sit at
  // their host's aft edge.
  const first = parts[0];
  const shape = first.cls === "nose" && first.noseShape ? first.noseShape : "blunt";
  veh.bluntNose = shape === "blunt";
  const aeroContribs = [{ kind: "nose", CNa: 2.0, s: first.L * RSX.NOSE_CP_FACTOR[shape] }];
  const host = parts.find((p) => p.hasFins);
  let finPlan = 0;
  if (host && veh.fin) {
    aeroContribs.push({ kind: "fin", CNa: veh.fin.fin.CNa, s: host.s + host.L / 2 - 0.3 });
    finPlan = 2 * veh.fin.fin.rootChord * veh.fin.fin.span; // two fins' planform
  }
  veh.aeroContribs = aeroContribs;
  veh.Splan = dia * sTail + finPlan;
  veh.sCross = sTail * 0.55;
  veh.art = RSX.rocket.artFor(veh);
  veh.mp = RSX.massProps(parts);
  veh.s_cm = veh.mp.s_cm;
  return veh;
};

/**
 * buildVehicle(design) -> veh, in the exact shape RSX.deriv/RSX.stepVerlet/
 * RSX.control already consume (physics-core.js:434-437, :515-520;
 * flight-loop.js:16-63). Throws if `design` names an unknown part, or
 * if the BOTTOM stage has no engine or no tank -- there is nothing
 * sensible to fly. Everything else (a missing pod, an upper stage with
 * no engine, ...) is validate.js's job to report, not a crash here.
 *
 * Adds (design/stage-2-plan.md §3.5): veh.design (normalized), veh.fin,
 * veh.stages (bottom-first), veh.stageIndex, veh.fullParts, veh.art;
 * every part carries id/cls/stage on top of the kernel's fields.
 */
RSX.rocket.buildVehicle = function (design) {
  const d = RSX.rocket.normalizeDesign(design);
  const laid = RSX.rocket.layoutStack(d.stack);
  if (!laid.length) throw new Error("buildVehicle: the stack is empty (no engine part, no tank part)");
  const stagesRaw = RSX.rocket.stagesOf(d.stack);

  const bottom = stagesRaw[0];
  const bottomIds = laid.slice(bottom.iStart, bottom.iEnd + 1);
  if (!bottomIds.some((p) => p.def.engine)) throw new Error("buildVehicle: the bottom stage has no engine part");
  if (!bottomIds.some((p) => p.def.tank)) throw new Error("buildVehicle: the bottom stage has no tank part");

  const fin = d.finAt != null ? RSX.PARTS.get(d.fin) : null;

  const parts = laid.map((p, i) => ({
    name: p.def.name, dryMass: p.def.dryMass, s: p.sMid, L: p.def.L, R: p.def.R, propMass: 0,
    id: p.id, cls: p.def.cls,
  }));
  if (fin) parts[d.finAt].hasFins = true;
  laid.forEach((p, i) => { if (p.def.nose) parts[i].noseShape = p.def.nose.shape; });

  const stages = stagesRaw.map((st) => {
    const idx = [];
    for (let i = st.iStart; i <= st.iEnd; i++) idx.push(i);
    const engineIdx = idx.filter((i) => laid[i].def.engine).pop();
    const engineDef = engineIdx != null ? laid[engineIdx].def : null;
    const motor = engineDef ? motorFromEngineDef(engineDef.engine) : null;
    // A stage with no engine (allowed while building, flagged by
    // validate.js) keeps its tanks' reference propellant.
    const tankIdx = idx.filter((i) => laid[i].def.tank);
    const propKey = engineDef ? engineDef.engine.propKey : (tankIdx.length ? laid[tankIdx[0]].def.tank.propKey : "rp1");
    const prop = RSX.FUEL_PRESETS[propKey].propellant;
    let dryMass = 0, propMassFull = 0;
    idx.forEach((i) => {
      const def = laid[i].def, part = parts[i];
      part.stage = st.n;
      if (def.tank) {
        // Volume-based fill: the reference capacity is exact for the
        // reference propellant (no density round trip), otherwise
        // volume x this propellant's bulk density.
        const refKey = def.tank.propKey || "rp1";
        const full = propKey === refKey ? def.tank.massFull : RSX.rocket.tankVolumeM3(def) * prop.bulkDensity;
        part.dryMass = full * prop.tankDryFrac;
        part.propMassFull = full;
        part.propMass = full * d.config.fuelLoad;
        part.propTankLen = def.L;
        propMassFull += full;
      }
      dryMass += part.dryMass;
    });
    return {
      n: st.n, partIdx: idx, engineIdx: engineIdx == null ? null : engineIdx, tankIdx,
      motor, propKey,
      sTop: laid[st.iStart].sTop, sTail: laid[st.iEnd].sBot, sEngine: laid[st.iEnd].sBot,
      dryMass, propMassFull,
    };
  });

  const veh = {
    design: d, fin,
    stages, stageIndex: 0,
    fullParts: parts.slice(),
    parts,
    cd0Factor: 1,
    LfwdAft: null,
    gimbal: 0,
  };
  RSX.rocket.refreshActive(veh);
  return veh;
};

if (typeof module !== "undefined") module.exports = RSX;
