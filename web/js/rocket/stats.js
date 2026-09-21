/* =====================================================================
   ROCKET STATS — R-10/R-11: mass, thrust, TWR, delta-v, stability, all
   computed from the SAME functions the flight kernel uses
   (RSX.massProps, RSX.thrustN, RSX.massFlow, RSX.vehicleAero). Nothing
   here is a display-only estimate; every number is read back from a real
   `veh` object built by RSX.rocket.buildVehicle (R-53: never fake a
   simulator value).

   DOM-free by design, so it can be tested headlessly (jsc) as well as
   called from the builder UI.
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};

/**
 * compute(veh, planet) -> {
 *   massTotal, massDry, massFuel (kg),
 *   thrustSL, thrustVac (N), twrSL (thrust at pa0 / weight at the surface),
 *   ispSL, ispVac (s), mdot (kg/s), burnTime (s),
 *   deltaV (m/s, Tsiolkovsky using ispVac -- the number a stage can
 *     actually spend once clear of the atmosphere),
 *   com (m, station), cop (m, Mach 0.3 centre-of-pressure station),
 *   mach03Margin (calibers, Mach 0.3 static margin), isSeparatedAtPa0 (bool),
 *   stages: bottom-first [{ n, massStart, massEnd, propMass, thrustVac, thrustSL,
 *     ispVac, ispSL, twrStart, burnTime, deltaV }], deltaVTotal (m/s)
 * }
 * The top-level thrust/Isp/mdot/burnTime/TWR rows describe the ACTIVE
 * (bottom) stage's engine, as they always did; `deltaV` is the multi-stage
 * total (identical to the single-stage Tsiolkovsky figure when there is
 * one stage). `twrStart` per stage is thrust at that stage's ignition
 * pressure -- pa0 for stage 1, vacuum for every later stage -- over its
 * ignition mass.
 * `planet` supplies pa0 (surface pressure) and g0 (surface gravity) for
 * the TWR and thrust readouts; defaults to RSX.PLANETS.home if omitted.
 */
RSX.rocket.stats = {};
RSX.rocket.stats.compute = function (veh, planet) {
  planet = planet || RSX.PLANETS.home;
  const pa0 = RSX.atmosphere(0, planet).P;
  const g0 = planet.mu / (planet.R * planet.R);

  const massTotal = veh.mp.m;
  const massFuel = veh.parts.reduce((sum, p) => sum + (p.propMass || 0), 0);
  const massDry = massTotal - massFuel;

  const thrustSL = RSX.thrustN(veh.motor, veh.motor.pcDesign, pa0);
  const thrustVac = RSX.thrustN(veh.motor, veh.motor.pcDesign, 0);
  const mdot = RSX.massFlow(veh.motor, veh.motor.pcDesign);
  const ispSL = mdot > 0 ? thrustSL / (mdot * RSX.GRAVITY_REF) : 0;
  const ispVac = mdot > 0 ? thrustVac / (mdot * RSX.GRAVITY_REF) : 0;
  const twrSL = massTotal > 0 ? thrustSL / (massTotal * g0) : 0;

  // Per-stage ledger, bottom-first: each stage ignites with everything
  // above it still aboard (massStart), burns its own propellant
  // (massEnd), and is dropped -- dry structure and any residual -- before
  // the next ignites. Tsiolkovsky per stage on the stage's own vacuum
  // Isp; with one stage this is exactly the old massTotal/massDry figure.
  const stageOf = (p) => (p.stage == null ? 1 : p.stage);
  const stageList = veh.stages && veh.stages.length ? veh.stages : [{ n: 1, motor: veh.motor }];
  const stages = [];
  let massStart = massTotal;
  stageList.forEach((st, k) => {
    const parts = veh.parts.filter((p) => stageOf(p) === st.n);
    const propMass = parts.reduce((sum, p) => sum + (p.propMass || 0), 0);
    const stageMass = parts.reduce((sum, p) => sum + p.dryMass + (p.propMass || 0), 0);
    const m = st.motor;
    const tSL = m ? RSX.thrustN(m, m.pcDesign, pa0) : 0;
    const tVac = m ? RSX.thrustN(m, m.pcDesign, 0) : 0;
    const md = m ? RSX.massFlow(m, m.pcDesign) : 0;
    const iSL = md > 0 ? tSL / (md * RSX.GRAVITY_REF) : 0;
    const iVac = md > 0 ? tVac / (md * RSX.GRAVITY_REF) : 0;
    const massEnd = massStart - propMass;
    const tIgnite = k === 0 ? tSL : tVac;
    stages.push({
      n: st.n, massStart, massEnd, propMass,
      thrustVac: tVac, thrustSL: tSL, ispVac: iVac, ispSL: iSL,
      twrStart: massStart > 0 ? tIgnite / (massStart * g0) : 0,
      burnTime: md > 0 ? propMass / md : 0,
      deltaV: (massEnd > 0 && massStart > massEnd) ? iVac * RSX.GRAVITY_REF * Math.log(massStart / massEnd) : 0,
    });
    massStart -= stageMass; // the whole stage leaves at separation
  });
  const deltaVTotal = stages.reduce((sum, st) => sum + st.deltaV, 0);
  const deltaV = deltaVTotal;
  const burnTime = stages.length && stages[veh.stageIndex || 0] ? stages[veh.stageIndex || 0].burnTime : (mdot > 0 ? massFuel / mdot : 0);

  // Static margin at a representative low-speed condition (Mach 0.3):
  // the same RSX.vehicleAero the flight kernel evaluates every substep,
  // not a separate estimate. vehicleAero reads veh.s_cm directly
  // (physics-core.js:436, normally set as a side effect inside deriv()
  // during flight) rather than veh.mp.s_cm -- sync it here since the
  // builder calls this with no flight loop running yet.
  veh.s_cm = veh.mp.s_cm;
  const AC = RSX.vehicleAero(veh, 0.3);
  const mach03Margin = AC.SM;
  const cop = veh.mp.s_cm - AC.xcp_b; // xcp_b = s_cm - s_cp, so this is the CP station itself

  return {
    massTotal, massDry, massFuel,
    thrustSL, thrustVac, twrSL, ispSL, ispVac, mdot, burnTime, deltaV,
    com: veh.mp.s_cm, cop, mach03Margin,
    isSeparatedAtPa0: RSX.isSeparated(veh.motor, veh.motor.pcDesign, pa0),
    stages, deltaVTotal,
  };
};

/** STABLE / MARGINAL / UNSTABLE from the real static margin, not a guess (R-36). */
RSX.rocket.stats.stabilityLabel = function (margin) {
  if (margin >= 1.0) return "STABLE";
  if (margin >= 0.3) return "MARGINAL";
  return "UNSTABLE";
};

if (typeof module !== "undefined") module.exports = RSX;
