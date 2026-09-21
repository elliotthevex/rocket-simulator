/* R-41/R-42/R-54: launch validation never throws, and its reasons are
   backed by real numbers, not guessed. */
"use strict";

test("validate: CADET_I passes every check", function () {
  const design = RSX.rocket.CADET_I;
  const veh = RSX.rocket.buildVehicle(design);
  const stats = RSX.rocket.stats.compute(veh);
  const result = RSX.rocket.validate(design, veh, stats);
  assert(result.ok, "expected CADET_I to pass: " + JSON.stringify(result.checks.filter((c) => !c.ok)));
});

test("validate: a stack with no engine fails cleanly (no throw) and names the reason", function () {
  const design = { stack: ["nose.s", "pod.probe", "tank.s"], finOn: null };
  const result = RSX.rocket.validate(design); // buildVehicle would throw; validate must not propagate it
  assert(result.ok === false, "expected the missing-engine design to fail");
  const engineCheck = result.checks.find((c) => c.id === "engine");
  assert(engineCheck && engineCheck.ok === false, "expected the engine check to fail");
});

test("validate: a stack with no tank fails cleanly and names the reason", function () {
  const design = { stack: ["nose.s", "pod.probe", "engine.k1"], finOn: null };
  const result = RSX.rocket.validate(design);
  assert(result.ok === false, "expected the missing-tank design to fail");
  const fuelCheck = result.checks.find((c) => c.id === "fuel");
  assert(fuelCheck && fuelCheck.ok === false, "expected the fuel check to fail");
});

test("validate: an unstable design (no fins) fails the stability check with a real margin number", function () {
  const design = { stack: ["nose.s", "pod.probe", "tank.s", "engine.k1"], finOn: null };
  const veh = RSX.rocket.buildVehicle(design);
  const stats = RSX.rocket.stats.compute(veh);
  const result = RSX.rocket.validate(design, veh, stats);
  const stabilityCheck = result.checks.find((c) => c.id === "stability");
  assert(stabilityCheck, "expected a stability check to exist");
  assert(stabilityCheck.ok === false, "a finless CADET_I-class stack should fail stability, margin=" + stats.mach03Margin);
  assert(stabilityCheck.detail.indexOf("UNSTABLE") >= 0, "detail should say UNSTABLE, got: " + stabilityCheck.detail);
});
