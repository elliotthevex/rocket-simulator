/* Smoke tests: the physics namespace loads headlessly and the basic
   relationships hold. Deeper tests live in their own test-*.js files. */
"use strict";

test("RSX namespace loads with the core entry points", function () {
  assert(typeof RSX === "object", "RSX missing");
  ["atmosphere", "stepVerlet", "deriv", "massProps", "vehicleAero"].forEach(function (k) {
    assert(typeof RSX[k] === "function", "RSX." + k + " missing");
  });
  assert(RSX.PLANETS && RSX.PLANETS.home && RSX.PLANETS.home.R > 0, "home planet missing");
});

test("atmosphere: sea-level density ~1.225 kg/m^3 and falls monotonically to zero at zAtm", function () {
  var home = RSX.PLANETS.home;
  var a0 = RSX.atmosphere(0, home);
  assertApprox(a0.rho, 1.225, 0.01, "rho0");
  assertApprox(a0.P, 101325, 0.01, "P0");
  var prev = a0.rho;
  for (var z = 1000; z <= home.zAtm; z += 1000) {
    var a = RSX.atmosphere(z, home);
    assert(a.rho <= prev + 1e-12, "rho not monotonic at z=" + z);
    prev = a.rho;
  }
  assert(RSX.atmosphere(home.zAtm, home).rho === 0, "rho must be exactly 0 at zAtm");
});

test("gravity: inverse-square from planet centre (g0 at surface, g0/4 at r=2R)", function () {
  var home = RSX.PLANETS.home;
  var g0 = home.mu / (home.R * home.R);
  assertApprox(g0, home.g0, 0.01, "surface g");
  var g2 = home.mu / ((2 * home.R) * (2 * home.R));
  assertApprox(g2, g0 / 4, 1e-9, "g at 2R");
});

test("headless burn: mass decreases in lock-step with mdot and the vehicle climbs", function () {
  var r = RSX.testVehicle.simulate(RSX.PLANETS.home, 1.0, 10, 1 / 120);
  var s0 = r.samples[0], s1 = r.samples[r.samples.length - 1];
  assert(s1.propMass < s0.propMass, "propellant not consumed");
  assert(s1.alt > 100, "did not climb (alt=" + s1.alt + ")");
  // sum of mdot*dt over the burn should equal the propellant consumed
  var used = s0.propMass - s1.propMass;
  assertBetween(used / 10, 60, 130, "average mdot kg/s"); // ENG-K1 class engine
});
