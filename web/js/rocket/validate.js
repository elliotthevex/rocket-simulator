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
  design = RSX.rocket.normalizeDesign(design);
  const checks = [];
  const add = (id, ok, label, detail) => checks.push({ id, ok, label, detail: detail || "" });

  // Structure (design/stage-2-plan.md §3.3): the hard stack rules the
  // editor already refuses, re-checked here because a loaded/saved design
  // bypasses the editor; then the per-stage completeness rule (S3).
  const rules = RSX.rocket.rules ? RSX.rocket.rules.check(design.stack, design.finAt) : { ok: true, hard: [], soft: [] };
  add("structure", rules.ok, "Structure", rules.ok ? "every part is where it can go" : rules.hard[0].reason);
  const stageSoft = rules.soft.filter((r) => r.stage != null);
  const nStages = RSX.rocket.stagesOf(design.stack).length;
  add("stages", stageSoft.length === 0, "Stages",
    stageSoft.length === 0 ? nStages + (nStages === 1 ? " stage" : " stages") + ", each with a tank and an engine" : stageSoft[0].reason);

  const hasCommandPart = design.stack.some((id) => RSX.PARTS.get(id).cls === "pod");
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
