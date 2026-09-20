/* Integrator, Kepler and drag checks ported from design/flight-physics.md
   §11 (rows 1, 8, 13, 15, 18/19) that RSX.runValidation does not cover. */
"use strict";

function vehicleForTests() {
  var veh = RSX.testVehicle.build();
  veh.thrustNow = function (pa, thr) { return RSX.testVehicle.thrustNow(veh, pa, thr); };
  veh.mdotNow = function (pa, thr) { return RSX.testVehicle.mdotNow(veh, pa, thr); };
  veh.advanceBurn = function (A, dt) { return RSX.testVehicle.advanceBurn(veh, A, dt); };
  return veh;
}
function vacuumClone(planet) { var p = {}; for (var k in planet) p[k] = planet[k]; p.zAtm = 0; return p; }
function freshCache() { return { valid: false, tmpA: {}, tmpB: {} }; }

test("§11.1 vacuum free fall from 1000 m on Earth: impact at t=14.28 s, v=140.0 m/s", function () {
  var planet = vacuumClone(RSX.PLANETS.earth), veh = vehicleForTests();
  var S = { rx: 0, ry: planet.R + 1000, vx: 0, vy: 0, th: Math.PI / 2, om: 0, t: 0 };
  var ctrl = { throttle: 0, gimbal: 0, tauRCS: 0 }, cache = freshCache(), dt = 0.005;
  var altPrev = 1000, tPrev = 0, tImpact = null, vImpact = null;
  for (var i = 0; i < 20000; i++) {
    RSX.stepVerlet(S, veh, ctrl, planet, dt, cache);
    var alt = Math.hypot(S.rx, S.ry) - planet.R;
    if (alt <= 0) {
      var f = altPrev / (altPrev - alt);                 // linear interpolation to the surface
      tImpact = tPrev + f * dt;
      vImpact = Math.hypot(S.vx, S.vy) - (1 - f) * 9.81 * dt;
      break;
    }
    altPrev = alt; tPrev += dt;
  }
  assert(tImpact !== null, "never reached the surface");
  assertApprox(tImpact, 14.28, 0.002, "impact time");
  assertApprox(vImpact, 140.0, 0.003, "impact speed");
});

test("§11.8 Kepler solver converges for e in [0, 0.95], M in [0, 2pi): residual < 1e-10", function () {
  var worst = 0;
  for (var e = 0; e <= 0.95 + 1e-9; e += 0.05) {
    for (var M = 0; M < 2 * Math.PI; M += Math.PI / 16) {
      var E = RSX.solveKepler(M, e);
      var res = Math.abs(E - e * Math.sin(E) - M);
      if (res > worst) worst = res;
    }
  }
  assert(worst < 1e-10, "worst residual " + worst);
});

test("§11.13 vacuum coast with zero torque: omega constant to 1e-12, theta linear (10,000 steps)", function () {
  var planet = vacuumClone(RSX.PLANETS.home), veh = vehicleForTests();
  var r0 = planet.R + 300000, v0 = Math.sqrt(planet.mu / r0);
  var S = { rx: r0, ry: 0, vx: 0, vy: v0, th: 0.3, om: 0.25, t: 0 };
  var ctrl = { throttle: 0, gimbal: 0, tauRCS: 0 }, cache = freshCache(), dt = 0.01;
  for (var i = 0; i < 10000; i++) RSX.stepVerlet(S, veh, ctrl, planet, dt, cache);
  assert(Math.abs(S.om - 0.25) < 1e-12, "omega drifted to " + S.om);
  assertApprox(S.th, 0.3 + 0.25 * 100, 1e-9, "theta after 100 s");
});

test("§11.15 drag stability: a single 1 s step at 8 km/s, sea level matches the analytic drag solution and never reverses", function () {
  var planet = RSX.PLANETS.earth, veh = vehicleForTests();
  var S = { rx: 0, ry: planet.R + 50, vx: 8000, vy: 0, th: 0, om: 0, t: 0 };
  var ctrl = { throttle: 0, gimbal: 0, tauRCS: 0 }, cache = freshCache();
  var d0 = RSX.deriv(S, veh, ctrl, planet, {});
  var W0 = d0.W, k = d0.kDrag;                       // airspeed includes the surface rotation
  assert(k > 0, "no drag at sea level?");
  var expectedW1 = W0 / (1 + k * W0 * 1.0);          // exact solution of dW/dt = -k W^2 for one second
  RSX.stepVerlet(S, veh, ctrl, planet, 1.0, cache);
  var W1 = RSX.deriv(S, veh, ctrl, planet, {}).W;
  assertApprox(W1, expectedW1, 0.005, "airspeed after one 1 s step");
  for (var i = 0; i < 3; i++) {
    RSX.stepVerlet(S, veh, ctrl, planet, 1.0, cache);
    assert([S.rx, S.ry, S.vx, S.vy, S.th, S.om].every(Number.isFinite), "NaN/Inf after step " + (i + 2));
    assert(S.vx >= -1e-9, "drag reversed the velocity on step " + (i + 2) + " (vx=" + S.vx + ")");
  }
});

test("§11.18/19 geostationary radius from planet constants", function () {
  var earth = RSX.PLANETS.earth, home = RSX.PLANETS.home;
  var rGeoEarth = Math.cbrt(earth.mu / (earth.wp * earth.wp));
  assertApprox(rGeoEarth, 42164e3, 0.001, "Earth geostationary radius");
  var rGeoHome = Math.cbrt(home.mu / (home.wp * home.wp));
  assert(rGeoHome > home.R + home.zAtm, "home synchronous orbit must be above the atmosphere (" + rGeoHome + ")");
  if (Math.abs(2 * Math.PI / home.wp - 21600) < 1) assertApprox(rGeoHome, 3468.6e3, 0.002, "home (6 h day) synchronous radius");
});
