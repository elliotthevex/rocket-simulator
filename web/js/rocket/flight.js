/* =====================================================================
   FLIGHT HELPERS — the propellant/thrust/staging closures a built
   vehicle needs to fly under RSX.stepVerlet (design/stage-2-plan.md
   §3.6). Generic over the ACTIVE stage: these replace the
   RSX.testVehicle.* wrappers game.html used to install (those stay as
   the single-stage regression oracle -- for a one-stage vehicle every
   function here is numerically identical to its testVehicle twin,
   which tests/js/test-flight-stages.js checks).

   Staging: separate(veh) removes the active stage's parts, promotes the
   next stage's engine, and returns the dropped stage as its OWN
   veh-shaped body (zero thrust, blunt-fronted, stations re-based) that
   the same integrator can fly to the ground. DOM-free.
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};
RSX.rocket.flight = {};
const FLIGHT = RSX.rocket.flight;

/** The active stage record, or null for a body with no stage list. */
FLIGHT.activeStage = (veh) => (veh.stages ? veh.stages[veh.stageIndex] || null : null);

/** Tanks of the active stage, in stack order (top to bottom). */
FLIGHT.activeTanks = function (veh) {
  const st = FLIGHT.activeStage(veh);
  return veh.parts.filter((p) => p.propMassFull > 0 && (!st || p.stage === st.n));
};

/** Propellant remaining to the active engine: the sum over its stage's tanks. */
FLIGHT.propAvailable = function (veh) {
  return FLIGHT.activeTanks(veh).reduce((sum, p) => sum + Math.max(0, p.propMass), 0);
};

// Thrust and mass flow are gated on propellant: an empty stage means
// flameout (design/requirements.md R-75), and a stage with no engine
// (allowed while building) simply cannot push.
FLIGHT.thrustNow = function (veh, pa, throttle) {
  if (!veh.motor || FLIGHT.propAvailable(veh) <= 0) return 0;
  const pc = veh.motor.pcDesign * RSX.clamp(throttle, 0, 1);
  return pc > 0 ? RSX.thrustN(veh.motor, pc, pa) : 0;
};
FLIGHT.mdotNow = function (veh, pa, throttle) {
  if (!veh.motor || FLIGHT.propAvailable(veh) <= 0) return 0;
  const pc = veh.motor.pcDesign * RSX.clamp(throttle, 0, 1);
  return pc > 0 ? RSX.massFlow(veh.motor, pc) : 0;
};

/** Drains A.mdot * dt from the active stage's tanks, BOTTOM tank first
 *  (the one feeding the engine empties first; the one above it follows). */
FLIGHT.advanceBurn = function (veh, A, dt) {
  let drain = A.mdot * dt;
  if (!(drain > 0)) return;
  const tanks = FLIGHT.activeTanks(veh);
  for (let i = tanks.length - 1; i >= 0 && drain > 0; i--) {
    const take = Math.min(tanks[i].propMass, drain);
    tanks[i].propMass = Math.max(0, tanks[i].propMass - drain);
    drain -= take;
  }
};

FLIGHT.canSeparate = (veh) => !!veh.stages && veh.stageIndex < veh.stages.length - 1;

/**
 * separate(veh) -> droppedBody | null. Mutates `veh` into the remaining
 * upper stack (next engine promoted, geometry/aero/art/mass refreshed by
 * RSX.rocket.refreshActive -- the same code path buildVehicle used) and
 * returns the dropped stage as a flyable body: stations re-based so its
 * top is s = 0, bluntNose, its own fins as the only aero contributors,
 * zero thrust, its residual propellant still aboard.
 */
FLIGHT.separate = function (veh) {
  if (!FLIGHT.canSeparate(veh)) return null;
  const st = veh.stages[veh.stageIndex];
  const dropped = veh.parts.filter((p) => p.stage === st.n);
  const kept = veh.parts.filter((p) => p.stage !== st.n);
  if (!dropped.length || !kept.length) return null;

  const sTop = dropped[0].s - dropped[0].L / 2;
  const body = {
    isDroppedStage: true, stageN: st.n,
    parts: dropped.map((p) => Object.assign({}, p, { s: p.s - sTop })),
    fin: veh.fin, motor: st.motor, propKey: st.propKey,
    cd0Factor: 1, LfwdAft: null, gimbal: 0,
  };
  const last = body.parts[body.parts.length - 1];
  body.sTail = last.s + last.L / 2;
  body.sEngine = body.sTail;
  body.dia = 2 * body.parts.reduce((m, p) => Math.max(m, p.R), 0);
  body.Dmax = body.dia;
  body.bluntNose = true;
  body.aeroContribs = [];
  const host = body.parts.find((p) => p.hasFins);
  let finPlan = 0;
  if (host && veh.fin) {
    body.aeroContribs.push({ kind: "fin", CNa: veh.fin.fin.CNa, s: host.s + host.L / 2 - 0.3 });
    finPlan = 2 * veh.fin.fin.rootChord * veh.fin.fin.span;
  }
  body.Splan = body.dia * body.sTail + finPlan;
  body.sCross = body.sTail * 0.55;
  body.art = RSX.rocket.artFor(body);
  body.mp = RSX.massProps(body.parts);
  body.s_cm = body.mp.s_cm;
  body.thrustNow = () => 0;
  body.mdotNow = () => 0;
  body.advanceBurn = () => {};

  veh.parts = kept;
  veh.stageIndex += 1;
  RSX.rocket.refreshActive(veh);
  return body;
};

/** resetStages(veh): the full stack back on, every tank refilled per the
 *  design's fuel load, stage 1 active -- what "R" on the pad should do. */
FLIGHT.resetStages = function (veh) {
  veh.parts = veh.fullParts.slice();
  const load = veh.design ? veh.design.config.fuelLoad : 1;
  veh.parts.forEach((p) => { if (p.propMassFull > 0) p.propMass = p.propMassFull * load; });
  veh.stageIndex = 0;
  RSX.rocket.refreshActive(veh);
  return veh;
};

/** attach(veh): installs the thrustNow/mdotNow/advanceBurn closures the
 *  kernel's vehicle contract requires (physics-core.js:515-520). */
FLIGHT.attach = function (veh) {
  veh.thrustNow = (pa, thr) => FLIGHT.thrustNow(veh, pa, thr);
  veh.mdotNow = (pa, thr) => FLIGHT.mdotNow(veh, pa, thr);
  veh.advanceBurn = (A, dt) => FLIGHT.advanceBurn(veh, A, dt);
  return veh;
};

if (typeof module !== "undefined") module.exports = RSX;
