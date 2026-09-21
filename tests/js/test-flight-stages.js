/* design/stage-2-plan.md §3.6: the flight helpers are generic over the
   active stage. For a one-stage vehicle they must be NUMERICALLY the
   old RSX.testVehicle wrappers (game.html switched to them in this
   slice, and the flight must not change); for two stages, separation
   must drop exactly the dropped stage's mass, hand thrust to the upper
   engine, and leave a dropped body the same integrator can fly. */
"use strict";

const F = () => RSX.rocket.flight;
const home = RSX.PLANETS.home;

function flyFor(veh, seconds, throttle, S0) {
  const S = S0 || { rx: 0, ry: home.R, vx: -home.wp * home.R, vy: 0, th: Math.PI / 2, om: 0, t: 0 };
  const ctrl = { throttle, gimbal: 0, tauRCS: 0 };
  const cache = { valid: false, tmpA: {}, tmpB: {} };
  for (let t = 0; t < seconds; t += 1 / 120) RSX.stepVerlet(S, veh, ctrl, home, 1 / 120, cache);
  return S;
}

test("single stage: thrustNow/mdotNow/advanceBurn equal the testVehicle oracle wrappers exactly", function () {
  const a = F().attach(RSX.rocket.buildVehicle(RSX.rocket.CADET_I));
  const b = RSX.testVehicle.build();
  for (const pa of [101325, 30000, 0]) for (const thr of [0, 0.4, 1, 1.5]) {
    assertApprox(a.thrustNow(pa, thr), RSX.testVehicle.thrustNow(b, pa, thr), 1e-12, "thrust pa=" + pa + " thr=" + thr);
    assertApprox(a.mdotNow(pa, thr), RSX.testVehicle.mdotNow(b, pa, thr), 1e-12, "mdot pa=" + pa + " thr=" + thr);
  }
  assertApprox(F().propAvailable(a), RSX.testVehicle.propAvailable(b), 1e-12, "propAvailable");
  a.advanceBurn({ mdot: 90.5 }, 0.5); RSX.testVehicle.advanceBurn(b, { mdot: 90.5 }, 0.5);
  assertApprox(a.parts[2].propMass, b.parts[2].propMass, 1e-12, "propMass after a burn step");
  a.advanceBurn({ mdot: 1e9 }, 1); RSX.testVehicle.advanceBurn(b, { mdot: 1e9 }, 1);
  assert(a.parts[2].propMass === 0 && b.parts[2].propMass === 0, "clamps at empty");
  assert(a.thrustNow(0, 1) === 0 && a.mdotNow(0, 1) === 0, "flameout on an empty stage");
});

test("single stage: a 10 s full-throttle flight through RSX.stepVerlet matches the oracle to 1e-6", function () {
  const sA = flyFor(F().attach(RSX.rocket.buildVehicle(RSX.rocket.CADET_I)), 10, 1);
  const b = RSX.testVehicle.build();
  b.thrustNow = (pa, thr) => RSX.testVehicle.thrustNow(b, pa, thr);
  b.mdotNow = (pa, thr) => RSX.testVehicle.mdotNow(b, pa, thr);
  b.advanceBurn = (A, dt) => RSX.testVehicle.advanceBurn(b, A, dt);
  const sB = flyFor(b, 10, 1);
  assertApprox(Math.hypot(sA.rx, sA.ry) - home.R, Math.hypot(sB.rx, sB.ry) - home.R, 1e-6, "altitude after 10 s");
  assertApprox(Math.hypot(sA.vx, sA.vy), Math.hypot(sB.vx, sB.vy), 1e-6, "speed after 10 s");
  assert(Math.hypot(sA.rx, sA.ry) - home.R > 100, "it actually climbed");
});

test("canSeparate/separate: a one-stage vehicle has nothing to drop", function () {
  const veh = F().attach(RSX.rocket.buildVehicle(RSX.rocket.CADET_I));
  assert(F().canSeparate(veh) === false && F().separate(veh) === null, "no separation");
  assert(veh.parts.length === 4 && veh.stageIndex === 0, "untouched");
});

test("two stages: only the ACTIVE stage's tanks feed the engine; burnout of stage 1 means flameout even with a full upper tank", function () {
  const veh = F().attach(RSX.rocket.buildVehicle(RSX.rocket.CADET_II));
  assertApprox(F().propAvailable(veh), 9200, 1e-9, "stage-1 propellant only (tank.m), not the 4600 kg above");
  veh.advanceBurn({ mdot: 1e9 }, 1);
  assertApprox(F().propAvailable(veh), 0, 1e-9, "stage 1 empty");
  assertApprox(veh.parts[2].propMass, 4600, 1e-9, "upper tank untouched");
  assert(veh.thrustNow(0, 1) === 0, "flameout: stage 1 cannot burn the upper stage's fuel");
});

test("advanceBurn drains the bottom tank of the active stage first", function () {
  const veh = F().attach(RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.s", "tank.s", "engine.k1"] }));
  veh.advanceBurn({ mdot: 100 }, 1);
  assertApprox(veh.parts[3].propMass, 4500, 1e-9, "lower tank drained 100 kg");
  assertApprox(veh.parts[2].propMass, 4600, 1e-9, "upper tank untouched");
  veh.advanceBurn({ mdot: 4600 }, 1);
  assertApprox(veh.parts[3].propMass, 0, 1e-9, "lower tank empty");
  assertApprox(veh.parts[2].propMass, 4500, 1e-9, "spill-over drains the tank above");
});

test("two stages: separate() drops exactly the stage's mass, promotes the upper engine, and leaves a flyable dropped body", function () {
  const veh = F().attach(RSX.rocket.buildVehicle(RSX.rocket.CADET_II));
  const s0 = RSX.rocket.stats.compute(veh);
  veh.advanceBurn({ mdot: 9200 }, 1); // burn stage 1 to empty
  veh.mp = RSX.massProps(veh.parts);
  const mBefore = veh.mp.m;
  assert(F().canSeparate(veh), "can separate");
  const body = F().separate(veh);
  assert(body && body.isDroppedStage && body.stageN === 1, "dropped body returned");
  assert(body.parts.length === 3 && veh.parts.length === 4, "3 parts dropped, 4 kept");
  assertApprox(veh.mp.m + body.mp.m, mBefore, 1e-9, "mass is conserved across the split");
  assertApprox(body.mp.m, 45 + 460 + 630, 1e-9, "dropped mass = stage 1 dry (it was empty)");
  assert(veh.stageIndex === 1, "stage 2 active");
  assertApprox(veh.sTail, 7.3, 1e-9, "upper stack tail"); assertApprox(veh.sEngine, 7.3, 1e-9, "upper sEngine");
  assertApprox(veh.dia, 1.2, 1e-9, "dia");
  // Thrust/TWR switch to the upper engine (engine.kv) and its full tank.
  const kv = RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.s", "engine.kv"] });
  assertApprox(veh.thrustNow(0, 1), RSX.thrustN(kv.motor, kv.motor.pcDesign, 0), 1e-9, "upper engine thrust in vacuum");
  assertApprox(F().propAvailable(veh), 4600, 1e-9, "upper tank feeds now");
  const g0 = home.mu / (home.R * home.R);
  const twrVac = veh.thrustNow(0, 1) / (veh.mp.m * g0);
  assert(twrVac > 1 && twrVac !== s0.twrSL, "upper-stage TWR " + twrVac + " differs from launch TWR " + s0.twrSL);
  const s1 = RSX.rocket.stats.compute(veh);
  assertApprox(s1.deltaV, s0.stages[1].deltaV, 1e-9, "remaining delta-v = the pre-launch stage-2 figure");
  // Fins were on engine.k1 -> they left with the booster.
  assert(!veh.aeroContribs.some((c) => c.kind === "fin") && veh.art.finS === null, "no fins on the upper stack");
  assert(body.aeroContribs.length === 1 && body.aeroContribs[0].kind === "fin", "the booster keeps its fins");
  assertApprox(body.aeroContribs[0].s, 8.3 - 0.3, 1e-9, "fin station re-based (booster is 8.3 m long)");
  // Dropped body: stations re-based, blunt, no thrust, its own art.
  assertApprox(body.parts[0].s, 0.15, 1e-9, "decoupler centred at 0.15 m from the body's top");
  assertApprox(body.sTail, 8.3, 1e-9, "body length");
  assert(body.bluntNose === true && body.thrustNow(101325, 1) === 0 && body.mdotNow(0, 1) === 0, "blunt, no thrust");
  assert(body.art && body.art.noseLen === 0 && body.art.bellRe === 0.29 && body.art.hitRegions.length === 4, "dropped body art");
  assert(veh.art.noseLen === 1.6 && veh.art.bellRe === 0.55, "upper stack art uses engine.kv's bell");
});

test("the dropped body falls under gravity when stepped by RSX.stepVerlet (no NaN, altitude decreases)", function () {
  const veh = F().attach(RSX.rocket.buildVehicle(RSX.rocket.CADET_II));
  veh.advanceBurn({ mdot: 9200 }, 1);
  const body = F().separate(veh);
  // Released at rest (relative to the ground) at 5 km: with zero thrust it
  // can only fall. Throttle 1 is passed on purpose -- a dropped stage must
  // ignore it.
  const S = { rx: 0, ry: home.R + 5000, vx: -home.wp * (home.R + 5000), vy: 0, th: Math.PI / 2, om: 0, t: 0 };
  const alt0 = Math.hypot(S.rx, S.ry) - home.R;
  flyFor(body, 5, 1, S);
  const alt1 = Math.hypot(S.rx, S.ry) - home.R;
  assert(Number.isFinite(alt1) && Number.isFinite(S.th) && Number.isFinite(S.om), "finite state");
  assert(alt1 < alt0 - 50, "ballistic body must be falling after 5 s from rest: " + alt0 + " -> " + alt1);
  assert(S.vy < 0, "descending");
  assertApprox(body.mp.m, 45 + 460 + 630, 1e-9, "no propellant was burned by a thrustless body");
});

test("the upper stage keeps accelerating after separation when stepped", function () {
  const veh = F().attach(RSX.rocket.buildVehicle(RSX.rocket.CADET_II));
  veh.advanceBurn({ mdot: 9200 }, 1);
  F().separate(veh);
  const S = { rx: 0, ry: home.R + 60000, vx: -home.wp * (home.R + 60000), vy: 800, th: Math.PI / 2, om: 0, t: 0 };
  const v0 = Math.hypot(S.vx, S.vy);
  flyFor(veh, 5, 1, S);
  assert(Math.hypot(S.vx, S.vy) > v0, "upper engine lit: speed must rise");
  assert(veh.parts[2].propMass < 4600, "upper tank is being drained");
});

test("resetStages restores the full stack, refills every tank per the fuel load, and re-arms stage 1", function () {
  const veh = F().attach(RSX.rocket.buildVehicle({ stack: RSX.rocket.CADET_II.stack, finAt: 6, config: { fuelLoad: 0.8 } }));
  const m0 = veh.mp.m;
  veh.advanceBurn({ mdot: 9200 }, 1);
  F().separate(veh);
  F().resetStages(veh);
  assert(veh.parts.length === 7 && veh.stageIndex === 0, "full stack back");
  assertApprox(veh.parts[5].propMass, 9200 * 0.8, 1e-9, "booster tank refilled to the fuel load");
  assertApprox(veh.mp.m, m0, 1e-9, "launch mass restored");
  assertApprox(veh.thrustNow(101325, 1), RSX.thrustN(veh.stages[0].motor, veh.stages[0].motor.pcDesign, 101325), 1e-9, "engine.k1 back as the motor");
  assert(veh.aeroContribs.some((c) => c.kind === "fin") && veh.art.finS === 15.6, "fins back on");
});

test("a real countdown/throttle ramp from the pad never produces a NaN thrust, and the vehicle lifts off (regression: pre-slice kernel NaN at tiny pc)", function () {
  const veh = F().attach(RSX.rocket.buildVehicle(RSX.rocket.CADET_I));
  // Thrust must be finite and >= 0 at EVERY throttle, including the first
  // ramp frames (pc of a few kPa against 101 kPa ambient).
  for (const thr of [1e-5, 1e-4, 2e-4, 1e-3, 0.01, 0.03, 0.06, 0.1, 0.4, 1]) {
    const T = veh.thrustNow(101325, thr);
    assert(Number.isFinite(T) && T >= 0, "throttle " + thr + " -> thrust " + T);
  }
  // game.html's ignition sequence, replayed: T-6 countdown, then a 1.8 s
  // raised-cosine ramp; pad-pin until thrust beats weight; controller
  // + integrator every substep exactly as stepPhysics() does.
  const S = { rx: 0, ry: home.R, vx: -home.wp * home.R, vy: 0, th: Math.PI / 2, om: 0, t: 0 };
  const ctrl = { throttle: 0, gimbal: 0, tauRCS: 0, thetaCmd: Math.PI / 2 };
  const cache = { valid: false, tmpA: {}, tmpB: {} };
  let simTime = 0, nanSteps = 0;
  for (let f = 0; f < 60 * 14; f++) {
    simTime += 1 / 60;
    const tRel = simTime - 6.0;
    ctrl.throttle = tRel < 0 ? 0 : (0.5 - 0.5 * Math.cos(Math.PI * RSX.clamp(tRel / 1.8, 0, 1)));
    const altNow = Math.hypot(S.rx, S.ry) - home.R;
    if (altNow <= 0.5 && S.vy <= 0) {
      const thrustNow = ctrl.throttle > 0 ? veh.thrustNow(101325, ctrl.throttle) : 0;
      const weight = veh.mp.m * (home.mu / (home.R * home.R));
      if (thrustNow <= weight) { S.rx = 0; S.ry = home.R; S.vx = -home.wp * S.ry; S.vy = 0; S.om = 0; cache.valid = false; continue; }
    }
    let remaining = 1 / 60, guard = 0;
    while (remaining > 1e-9 && guard++ < 400) {
      const peek = cache.valid ? cache.d : RSX.deriv(S, veh, ctrl, home, cache.tmpA);
      const dt = RSX.chooseDt(S, veh, peek, home, remaining);
      RSX.control.stepGimbal(S, veh, ctrl, peek, dt);
      RSX.stepVerlet(S, veh, ctrl, home, dt, cache);
      if (![S.rx, S.ry, S.vx, S.vy, S.th, S.om, ctrl.gimbal].every(Number.isFinite)) nanSteps++;
      remaining -= dt;
    }
  }
  assert(nanSteps === 0, "NaN steps during the ramp: " + nanSteps);
  const alt = Math.hypot(S.rx, S.ry) - home.R;
  assert(alt > 100 && S.vy > 0, "expected to be climbing ~6 s after T-0, alt=" + alt + " vy=" + S.vy);
});
