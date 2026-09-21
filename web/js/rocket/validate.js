/* =====================================================================
   LAUNCH VALIDATION — R-41/R-42/R-54. Every check reads the real,
   already-computed vehicle/stats; a check that isn't backed by a real
   number is not written (R-53). Never throws: a broken design gets a
   list of reasons, not a crash (R-41).
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};

/**
 * validate(design, veh, stats) -> { ok, checks: [{ id, ok, label, detail }] }
 * `veh`/`stats` are optional -- if omitted they are computed from
 * `design` (buildVehicle can throw for a stack with no engine/tank; that
 * is reported as a failed check here instead of propagating).
 */
RSX.rocket.validate = function (design, veh, stats) {
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail: detail || "" });

  // The catalog has no `cls`/category field yet (design/build-plan.md's
  // fuller schema is deferred until a real builder needs it) -- id prefix
  // is an honest stand-in for "is this a command module" while the only
  // command part is pod.probe, and is flagged here so it is not mistaken
  // for the real thing once more part categories exist.
  const hasCommandPart = design.stack.some((id) => id.startsWith("pod."));
  add("command", hasCommandPart, "Command module", hasCommandPart ? "present" : "no pod.* part in the stack");

  let engineOk = false, tankOk = false, feedOk = false;
  try {
    if (!veh) veh = RSX.rocket.buildVehicle(design);
    engineOk = true; tankOk = true;
    const tank = veh.parts.find((p) => p.propMassFull > 0);
    feedOk = !!tank && tank.propMass > 0;
  } catch (e) {
    const msg = String(e.message || e);
    engineOk = msg.indexOf("engine") === -1;
    tankOk = msg.indexOf("tank") === -1;
  }
  add("engine", engineOk, "Engine", engineOk ? "present" : "no engine part in the stack");
  add("fuel", tankOk && feedOk, "Fuel", !tankOk ? "no tank part in the stack" : (!feedOk ? "tank is empty" : "loaded"));

  if (veh) {
    if (!stats) stats = RSX.rocket.stats.compute(veh);
    const twrOk = stats.twrSL >= 1.0;
    add("twr", twrOk, "Thrust-to-weight",
      twrOk ? "TWR " + stats.twrSL.toFixed(2) : "LOW TWR: " + stats.twrSL.toFixed(2) + " -- needs > 1.0 to lift off (add an engine or drop fuel)");

    const stabilityOk = stats.mach03Margin >= 0.3;
    add("stability", stabilityOk, "Stability",
      stabilityOk ? stats.mach03Margin.toFixed(2) + " cal" :
        "UNSTABLE ROCKET: CP is " + Math.abs(stats.mach03Margin).toFixed(2) + " cal " + (stats.mach03Margin < 0 ? "ahead of" : "behind") + " the CM -- add fins or move mass forward");
  }

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
};

if (typeof module !== "undefined") module.exports = RSX;
