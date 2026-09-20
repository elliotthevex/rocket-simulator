/* Closed-loop attitude hold through max-Q with the default vehicle.
   Before control.js gained aero feed-forward + bandwidth scheduling the
   vehicle flipped tail-first at ~17 s (design/architecture-analysis.md §7.1). */
"use strict";

function flyHold(planet, seconds, dt, opts) {
  var veh = RSX.testVehicle.build();
  veh.thrustNow = function (pa, thr) { return RSX.testVehicle.thrustNow(veh, pa, thr); };
  veh.mdotNow = function (pa, thr) { return RSX.testVehicle.mdotNow(veh, pa, thr); };
  veh.advanceBurn = function (A, d) { return RSX.testVehicle.advanceBurn(veh, A, d); };
  var S = { rx: 0, ry: planet.R, vx: -planet.wp * planet.R, vy: 0, th: Math.PI / 2, om: 0, t: 0 };
  var ctrl = { throttle: 1, gimbal: 0, tauRCS: 0, thetaCmd: Math.PI / 2 };
  var cache = { valid: false, tmpA: {}, tmpB: {} };
  var log = [], worst = { err: 0, t: 0 }, minSM = Infinity, maxQ = 0, maxWn = 0;
  for (var t = 0; t < seconds; t += dt) {
    var A = cache.valid ? cache.d : RSX.deriv(S, veh, ctrl, planet, cache.tmpA);
    var cmd = RSX.control.stepGimbal(S, veh, ctrl, A, dt, opts);
    RSX.stepVerlet(S, veh, ctrl, planet, dt, cache);
    var up = Math.atan2(S.ry, S.rx);
    var err = Math.abs(RSX.wrapPi(S.th - up));                  // pitch error from local vertical
    if (err > worst.err) worst = { err: err, t: t };
    if (A.q > maxQ) maxQ = A.q;
    if (A.q > 1000 && cmd.SM < minSM) minSM = cmd.SM;
    if (cmd.wn > maxWn) maxWn = cmd.wn;
    if (Math.round(t / dt) % Math.round(1 / dt) === 0) log.push({ t: +t.toFixed(1), errDeg: +(err * 180 / Math.PI).toFixed(2), q: Math.round(A.q), SM: +(cmd.SM || 0).toFixed(2) });
  }
  return { S: S, worst: worst, minSM: minSM, maxQ: maxQ, maxWn: maxWn, log: log, veh: veh };
}

test("default vehicle holds vertical within 2 deg through max-Q (SM goes negative supersonic)", function () {
  var r = flyHold(RSX.PLANETS.home, 45, 1 / 120);
  assert(r.maxQ > 50000, "test did not reach a max-Q regime (q max " + r.maxQ + ")");
  assert(r.minSM < 0, "expected the static margin to go negative supersonic (min SM " + r.minSM + ") -- if fins were resized, keep a separate unstable-vehicle case");
  assert(r.worst.err < 2 * Math.PI / 180, "pitch error reached " + (r.worst.err * 180 / Math.PI).toFixed(2) + " deg at t=" + r.worst.t.toFixed(1) + " s; log=" + JSON.stringify(r.log.slice(10, 26)));
});

test("scheduled bandwidth exceeds the aero divergence rate and stays under the discretisation limit", function () {
  var r = flyHold(RSX.PLANETS.home, 30, 1 / 120);
  assert(r.maxWn > RSX.control.DEFAULTS.wn * 1.5, "bandwidth never scheduled up (max wn " + r.maxWn + ")");
  assert(r.maxWn * (1 / 120) < 0.2, "wn*dt = " + (r.maxWn / 120) + " violates the wn*dt < 0.2 guard");
});

test("no gimbal authority without thrust: command is zero on the pad before ignition", function () {
  var veh = RSX.testVehicle.build();
  veh.thrustNow = function (pa, thr) { return RSX.testVehicle.thrustNow(veh, pa, thr); };
  veh.mdotNow = function (pa, thr) { return RSX.testVehicle.mdotNow(veh, pa, thr); };
  veh.advanceBurn = function () {};
  var planet = RSX.PLANETS.home;
  var S = { rx: 0, ry: planet.R, vx: -planet.wp * planet.R, vy: 0, th: Math.PI / 2 + 0.3, om: 0, t: 0 };
  var ctrl = { throttle: 0, gimbal: 0, tauRCS: 0, thetaCmd: Math.PI / 2 };
  var A = RSX.deriv(S, veh, ctrl, planet, {});
  var cmd = RSX.control.gimbalCommand(S, veh, ctrl, A);
  assert(cmd.dCmd === 0, "expected zero gimbal command with no thrust, got " + cmd.dCmd);
});
