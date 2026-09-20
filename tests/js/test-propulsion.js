/* Propulsion: thrust and mass flow must stop when the propellant runs out,
   and the vehicle must not gain energy from an engine with an empty tank. */
"use strict";

function buildTestVehicle() {
  var veh = RSX.testVehicle.build();
  veh.thrustNow = function (pa, thr) { return RSX.testVehicle.thrustNow(veh, pa, thr); };
  veh.mdotNow = function (pa, thr) { return RSX.testVehicle.mdotNow(veh, pa, thr); };
  veh.advanceBurn = function (A, dt) { return RSX.testVehicle.advanceBurn(veh, A, dt); };
  return veh;
}

test("engine produces thrust with propellant and none once the tank is empty", function () {
  var veh = buildTestVehicle();
  var pa = RSX.atmosphere(0, RSX.PLANETS.home).P;
  assert(veh.thrustNow(pa, 1) > 1e5, "expected >100 kN at full throttle on a full tank");
  assert(veh.mdotNow(pa, 1) > 10, "expected mass flow >10 kg/s on a full tank");
  var tank = veh.parts.find(function (p) { return p.name === "tank"; });
  tank.propMass = 0;
  assert(veh.thrustNow(pa, 1) === 0, "thrust must be exactly 0 with an empty tank");
  assert(veh.mdotNow(pa, 1) === 0, "mass flow must be exactly 0 with an empty tank");
});

test("after burnout the dry vehicle stops accelerating and its mass stays constant", function () {
  var home = RSX.PLANETS.home;
  var r = RSX.testVehicle.simulate(home, 1.0, 120, 1 / 60);
  var burnoutIdx = -1;
  for (var i = 0; i < r.samples.length; i++) { if (r.samples[i].propMass <= 0) { burnoutIdx = i; break; } }
  assert(burnoutIdx > 0, "vehicle never reached burnout in 120 s");
  var tb = r.samples[burnoutIdx].t;
  assertBetween(tb, 30, 90, "burnout time (s)");
  // mass constant after burnout
  var mDry = r.samples[burnoutIdx].m;
  for (var j = burnoutIdx; j < r.samples.length; j++) assertApprox(r.samples[j].m, mDry, 1e-9, "dry mass drift at t=" + r.samples[j].t);
  // no thrust means speed cannot rise faster than gravity could ever add: kinetic energy per
  // unit mass must not increase between two samples once out of the dense atmosphere
  // (drag only removes energy, gravity is conservative -> specific orbital energy is non-increasing)
  var prevE = null;
  for (var k = burnoutIdx + 1; k < r.samples.length; k++) {
    var s = r.samples[k];
    var v2 = s.vx * s.vx + s.vy * s.vy;
    var rmag = home.R + s.alt;
    var E = 0.5 * v2 - home.mu / rmag; // specific orbital energy
    if (prevE !== null) assert(E <= prevE + 1e-6 * Math.abs(prevE) + 1, "specific energy rose after burnout at t=" + s.t + " (" + prevE + " -> " + E + ")");
    prevE = E;
  }
});
