/* Proves the new data-driven vehicle (parts/catalog.js + rocket/vehicle.js)
   reproduces the hardcoded RSX.testVehicle.build() exactly -- the bar for
   "data-driven" here is not "close enough", it is "the physics cannot
   tell the difference". Nothing in game.html uses the new path yet; this
   is what earns it the right to. */
"use strict";

test("buildVehicle(CADET_I) matches RSX.testVehicle.build() exactly (mass, geometry, aero)", function () {
  const a = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  const b = RSX.testVehicle.build();

  assertApprox(a.mp.m, b.mp.m, 1e-9, "total mass");
  assertApprox(a.mp.s_cm, b.mp.s_cm, 1e-9, "centre of mass station");
  assertApprox(a.mp.I, b.mp.I, 1e-9, "moment of inertia");
  assertApprox(a.sTail, b.sTail, 1e-9, "tail station");
  assertApprox(a.sEngine, b.sEngine, 1e-9, "engine/gimbal station");
  assertApprox(a.dia, b.dia, 1e-9, "diameter");
  assert(a.parts.length === b.parts.length, "part count: " + a.parts.length + " vs " + b.parts.length);
  assert(a.aeroContribs.length === b.aeroContribs.length, "aero contributor count");
  a.aeroContribs.forEach((c, i) => {
    assertApprox(c.CNa, b.aeroContribs[i].CNa, 1e-9, "aeroContribs[" + i + "].CNa");
    assertApprox(c.s, b.aeroContribs[i].s, 1e-9, "aeroContribs[" + i + "].s");
  });
});

test("buildVehicle(CADET_I) matches the oracle's thrust and mass flow at sea level and in vacuum", function () {
  const a = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  const b = RSX.testVehicle.build();
  b.thrustNow = (pa, thr) => RSX.testVehicle.thrustNow(b, pa, thr);
  b.mdotNow = (pa, thr) => RSX.testVehicle.mdotNow(b, pa, thr);

  for (const pa of [101325, 0]) {
    const label = pa === 0 ? "vacuum" : "sea level";
    assertApprox(RSX.thrustN(a.motor, a.motor.pcDesign, pa), RSX.thrustN(b.motor, b.motor.pcDesign, pa), 1e-9, label + " thrust");
    assertApprox(RSX.massFlow(a.motor, a.motor.pcDesign), RSX.massFlow(b.motor, b.motor.pcDesign), 1e-9, label + " mass flow");
  }
});

test("buildVehicle flies identically to the oracle under RSX.stepVerlet (10 s, full throttle)", function () {
  const home = RSX.PLANETS.home;
  function fly(veh) {
    veh.thrustNow = (pa, thr) => RSX.testVehicle.thrustNow(veh, pa, thr);
    veh.mdotNow = (pa, thr) => RSX.testVehicle.mdotNow(veh, pa, thr);
    veh.advanceBurn = (A, dt) => RSX.testVehicle.advanceBurn(veh, A, dt);
    const S = { rx: 0, ry: home.R, vx: -home.wp * home.R, vy: 0, th: Math.PI / 2, om: 0, t: 0 };
    const ctrl = { throttle: 1, gimbal: 0, tauRCS: 0 };
    const cache = { valid: false, tmpA: {}, tmpB: {} };
    for (let t = 0; t < 10; t += 1 / 120) RSX.stepVerlet(S, veh, ctrl, home, 1 / 120, cache);
    return S;
  }
  const sA = fly(RSX.rocket.buildVehicle(RSX.rocket.CADET_I));
  const sB = fly(RSX.testVehicle.build());
  assertApprox(Math.hypot(sA.rx, sA.ry) - home.R, Math.hypot(sB.rx, sB.ry) - home.R, 1e-6, "altitude after 10 s");
  assertApprox(Math.hypot(sA.vx, sA.vy), Math.hypot(sB.vx, sB.vy), 1e-6, "speed after 10 s");
});

test("buildVehicle rejects a stack with no engine or no tank instead of flying something nonsensical", function () {
  assertThrows_ish(() => RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe"], finOn: null }), "no engine");
  assertThrows_ish(() => RSX.rocket.buildVehicle({ stack: ["engine.k1"], finOn: null }), "no tank");
});

// harness.js has no assertThrows yet; a tiny local helper instead of adding
// one for a single call site.
function assertThrows_ish(fn, mustContain) {
  let threw = false, msg = "";
  try { fn(); } catch (e) { threw = true; msg = String(e.message || e); }
  assert(threw, "expected a throw");
  assert(msg.indexOf(mustContain) >= 0, "expected error to mention '" + mustContain + "', got: " + msg);
}
