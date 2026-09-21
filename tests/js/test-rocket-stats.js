/* R-50: "verify delta-v calculations", "verify gravitational acceleration
   [feeds TWR]" -- checked against the Tsiolkovsky formula computed by
   hand in this file, not against another line of code that could share
   the same bug. */
"use strict";

test("stats.compute: delta-v matches the Tsiolkovsky formula computed independently", function () {
  const veh = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  const s = RSX.rocket.stats.compute(veh, RSX.PLANETS.home);

  const g0 = RSX.GRAVITY_REF;
  const mdot = RSX.massFlow(veh.motor, veh.motor.pcDesign);
  const thrustVac = RSX.thrustN(veh.motor, veh.motor.pcDesign, 0);
  const ispVacByHand = thrustVac / (mdot * g0);
  const m0 = veh.mp.m;
  const massFuel = veh.parts.reduce((sum, p) => sum + (p.propMass || 0), 0);
  const mf = m0 - massFuel;
  const dvByHand = ispVacByHand * g0 * Math.log(m0 / mf);

  assertApprox(s.deltaV, dvByHand, 1e-9, "delta-v");
  // m0=5610 kg, mf=1010 kg (matches the burnout mass observed in the
  // browser trace), Isp_vac ~311 s => 311*9.80665*ln(5610/1010) ~5230 m/s.
  assert(s.deltaV > 5000 && s.deltaV < 5500, "sanity: CADET_I delta-v should be roughly 5000-5500 m/s (m0/mf ~5.6, Isp_vac ~311s), got " + s.deltaV);
});

test("stats.compute: TWR matches thrust/weight computed independently, and a bigger tank lowers it", function () {
  const home = RSX.PLANETS.home;
  const g0 = home.mu / (home.R * home.R);

  const small = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  const sSmall = RSX.rocket.stats.compute(small, home);
  const thrustSL = RSX.thrustN(small.motor, small.motor.pcDesign, RSX.atmosphere(0, home).P);
  assertApprox(sSmall.twrSL, thrustSL / (small.mp.m * g0), 1e-9, "TWR formula");

  const big = RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.m", "engine.k1"], finOn: "engine.k1" });
  const sBig = RSX.rocket.stats.compute(big, home);
  assert(sBig.twrSL < sSmall.twrSL, "a heavier tank on the same engine must lower TWR (" + sBig.twrSL + " vs " + sSmall.twrSL + ")");
});

test("stats.compute: the vacuum-optimized engine trades sea-level TWR for vacuum Isp, honestly (not a made-up bonus)", function () {
  const small = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  const vacOpt = RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.s", "engine.kv"], finOn: "engine.kv" });
  const sSmall = RSX.rocket.stats.compute(small);
  const sVacOpt = RSX.rocket.stats.compute(vacOpt);

  assert(sVacOpt.ispVac > sSmall.ispVac, "engine.kv should have higher vacuum Isp: " + sVacOpt.ispVac + " vs " + sSmall.ispVac);
  assert(sVacOpt.thrustSL < sSmall.thrustSL, "engine.kv should have lower sea-level thrust: " + sVacOpt.thrustSL + " vs " + sSmall.thrustSL);
  assert(sVacOpt.isSeparatedAtPa0 === true, "engine.kv's larger expansion ratio should be flow-separated at sea level");
});

test("stats.stabilityLabel: matches the numeric bands, not a random label (R-36)", function () {
  assert(RSX.rocket.stats.stabilityLabel(1.5) === "STABLE", "1.5 cal should be STABLE");
  assert(RSX.rocket.stats.stabilityLabel(0.5) === "MARGINAL", "0.5 cal should be MARGINAL");
  assert(RSX.rocket.stats.stabilityLabel(-0.2) === "UNSTABLE", "-0.2 cal should be UNSTABLE");

  // CADET_I's real static margin at Mach 0.3 is ~0.86 calibers -- close to
  // stable but under the 1.0 cal STABLE threshold, so MARGINAL is the
  // correct label, not a rounding choice. (It still flies and holds
  // attitude through max-Q under the real controller, per test-attitude.js
  // -- MARGINAL is not "broken", it's "less margin than STABLE".)
  const veh = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  const s = RSX.rocket.stats.compute(veh);
  assertBetween(s.mach03Margin, 0.3, 1.0, "CADET_I's Mach 0.3 static margin");
  assert(RSX.rocket.stats.stabilityLabel(s.mach03Margin) === "MARGINAL", "expected MARGINAL for margin=" + s.mach03Margin);
});
