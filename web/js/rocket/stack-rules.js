/* =====================================================================
   STACK RULES — what makes a part order structurally legal
   (design/stage-2-plan.md §3.3). Pure and DOM-free so the Design
   screen's stack editor, the 3D drag-and-drop connection nodes and the
   launch checklist all ask ONE oracle instead of three drifting copies.

   HARD rules are structural: an edit that would create one is refused
   and the reason shown to the player. SOFT rules are completeness:
   allowed while building, reported by validate.js. Every reason is
   plain language a beginner can act on.
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};
RSX.rocket.rules = {};
const RULES = RSX.rocket.rules;

const clsOf = (id) => RSX.PARTS.get(id).cls;

/**
 * check(stack, finAt) -> { ok, hard:[{index, id, reason}], soft:[{reason, stage?}] }
 * `ok` is true when there is no HARD violation.
 */
RULES.check = function (stack, finAt) {
  const hard = [], soft = [];
  const n = stack.length;
  const cls = stack.map(clsOf);
  const stages = RSX.rocket.stagesOf(stack);
  const topStage = stages[stages.length - 1];

  // H1 -- one nose, and only at the very top.
  let noseSeen = false;
  cls.forEach((c, i) => {
    if (c !== "nose") return;
    if (noseSeen) hard.push({ index: i, id: stack[i], reason: "Only one nose cone fits on a rocket." });
    else if (i !== 0) hard.push({ index: i, id: stack[i], reason: "The nose cone has to be the very top part -- nothing can sit above it." });
    noseSeen = true;
  });

  // H2 -- pods only in the top stage (they are the payload being lifted).
  cls.forEach((c, i) => {
    if (c === "pod" && (i < topStage.iStart || i > topStage.iEnd)) {
      hard.push({ index: i, id: stack[i], reason: "A pod belongs in the top stage -- it is the payload every lower stage is lifting." });
    }
  });

  // H3 -- one engine per stage, at the bottom of its stage.
  stages.forEach((st) => {
    const engines = [];
    for (let i = st.iStart; i <= st.iEnd; i++) if (cls[i] === "engine") engines.push(i);
    engines.forEach((i, k) => {
      if (k > 0) hard.push({ index: i, id: stack[i], reason: "Each stage can carry only one engine." });
      else if (i !== st.iEnd) hard.push({ index: i, id: stack[i], reason: "An engine has to be the bottom of its stage -- nothing can hang below it except a decoupler." });
    });
  });

  // H4 -- decouplers: not first, not adjacent, always right under an
  // engine. A decoupler at the very BOTTOM is deliberately not a hard
  // error: it starts a stage that is still empty, which is how a player
  // builds a second stage one part at a time (decoupler, then tank, then
  // engine) -- the empty stage is reported by the soft S3 rule below and
  // the launch checklist, not refused at the click.
  cls.forEach((c, i) => {
    if (c !== "decoupler") return;
    if (i === 0) hard.push({ index: i, id: stack[i], reason: "A decoupler needs a stage above it to separate from." });
    else if (cls[i - 1] === "decoupler") hard.push({ index: i, id: stack[i], reason: "Two decouplers in a row separate nothing -- put a stage between them." });
    else if (cls[i - 1] !== "engine") hard.push({ index: i, id: stack[i], reason: "A decoupler has to sit right under an engine -- it drops the stage that engine finishes." });
  });

  // H5 -- fins mount on a tank or an engine.
  if (finAt != null) {
    if (!(finAt >= 0 && finAt < n) || (cls[finAt] !== "tank" && cls[finAt] !== "engine")) {
      hard.push({ index: finAt, id: stack[finAt] == null ? null : stack[finAt], reason: "Fins can only be mounted on a tank or an engine." });
    }
  }

  // Soft (completeness) rules.
  if (cls[0] !== "nose") soft.push({ reason: "Start with a nose cone on top -- it is what cuts through the air." });
  if (cls.indexOf("pod") === -1) soft.push({ reason: "Add a pod (probe or crew) -- it is the payload the rocket is carrying." });
  stages.forEach((st) => {
    let tanks = 0, engines = 0;
    for (let i = st.iStart; i <= st.iEnd; i++) { if (cls[i] === "tank") tanks++; if (cls[i] === "engine") engines++; }
    if (tanks === 0) soft.push({ stage: st.n, reason: "Stage " + st.n + " needs at least one propellant tank." });
    if (engines === 0) soft.push({ stage: st.n, reason: "Stage " + st.n + " needs an engine at its bottom." });
  });
  if (finAt == null) soft.push({ reason: "No fins: the rocket relies on its shape alone to fly straight (the stability check is the real judge)." });

  return { ok: hard.length === 0, hard, soft };
};

/** finHostCandidates(stack) -> stack indices a fin set may be mounted on. */
RULES.finHostCandidates = function (stack) {
  const out = [];
  stack.forEach((id, i) => { const c = clsOf(id); if (c === "tank" || c === "engine") out.push(i); });
  return out;
};

// The reason to show for a refused edit: the violation AT the edited
// index if there is one, else the first violation the edit created.
function refusal(result, index) {
  const at = result.hard.find((h) => h.index === index);
  return { ok: false, reason: (at || result.hard[0]).reason };
}

/**
 * canInsert(stack, finAt, id, index) -> {ok, reason}. `index` is where the
 * new part lands (0..stack.length). A fin id is never stacked.
 */
RULES.canInsert = function (stack, finAt, id, index) {
  if (!RSX.PARTS.has(id)) return { ok: false, reason: "Unknown part: " + id };
  if (clsOf(id) === "fin") return { ok: false, reason: "Fins are not stacked -- mount them on a tank or an engine instead." };
  if (!Number.isInteger(index) || index < 0 || index > stack.length) return { ok: false, reason: "That is not a place in the stack." };
  const next = RULES.insert(stack, finAt, id, index, true);
  const r = RULES.check(next.stack, next.finAt);
  return r.ok ? { ok: true, reason: "" } : refusal(r, index);
};

/** canRemove(stack, finAt, index) -> {ok, reason}. Fins leave with their host. */
RULES.canRemove = function (stack, finAt, index) {
  if (!Number.isInteger(index) || index < 0 || index >= stack.length) return { ok: false, reason: "That is not a part in the stack." };
  const next = RULES.remove(stack, finAt, index, true);
  const r = RULES.check(next.stack, next.finAt);
  return r.ok ? { ok: true, reason: "" } : refusal(r, Math.min(index, next.stack.length - 1));
};

/** canMove(stack, finAt, index, delta) -> {ok, reason}. delta -1 = up, +1 = down. */
RULES.canMove = function (stack, finAt, index, delta) {
  if (!Number.isInteger(index) || index < 0 || index >= stack.length) return { ok: false, reason: "That is not a part in the stack." };
  const target = index + delta;
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, reason: "Nothing to move." };
  if (target < 0) return { ok: false, reason: "It is already the top part." };
  if (target >= stack.length) return { ok: false, reason: "It is already the bottom part." };
  const next = RULES.move(stack, finAt, index, delta, true);
  const r = RULES.check(next.stack, next.finAt);
  return r.ok ? { ok: true, reason: "" } : refusal(r, target);
};

/* insert/remove/move return a NEW {ok, reason, stack, finAt}: on a
   refused edit `ok` is false and stack/finAt are unchanged copies, so a
   UI can apply the result blindly and nothing changes. The trailing
   `unchecked` flag is internal (the can* helpers build the candidate
   stack through these same functions, then check it). */
RULES.insert = function (stack, finAt, id, index, unchecked) {
  if (!unchecked) {
    const can = RULES.canInsert(stack, finAt, id, index);
    if (!can.ok) return { ok: false, reason: can.reason, stack: stack.slice(), finAt };
  }
  const next = stack.slice();
  next.splice(index, 0, id);
  const nextFinAt = finAt == null ? null : (finAt >= index ? finAt + 1 : finAt);
  return { ok: true, reason: "", stack: next, finAt: nextFinAt };
};

RULES.remove = function (stack, finAt, index, unchecked) {
  if (!unchecked) {
    const can = RULES.canRemove(stack, finAt, index);
    if (!can.ok) return { ok: false, reason: can.reason, stack: stack.slice(), finAt };
  }
  const next = stack.slice();
  next.splice(index, 1);
  let nextFinAt = finAt;
  if (finAt != null) {
    if (finAt === index) nextFinAt = null;       // the fins' host is gone -- they go with it
    else if (finAt > index) nextFinAt = finAt - 1;
  }
  return { ok: true, reason: "", stack: next, finAt: nextFinAt };
};

RULES.move = function (stack, finAt, index, delta, unchecked) {
  if (!unchecked) {
    const can = RULES.canMove(stack, finAt, index, delta);
    if (!can.ok) return { ok: false, reason: can.reason, stack: stack.slice(), finAt };
  }
  const target = index + delta;
  const next = stack.slice();
  const [id] = next.splice(index, 1);
  next.splice(target, 0, id);
  let nextFinAt = finAt;
  if (finAt != null) {
    if (finAt === index) nextFinAt = target;                                   // fins ride along with their host
    else if (delta > 0 && finAt > index && finAt <= target) nextFinAt = finAt - 1; // host moved down past the fins' part
    else if (delta < 0 && finAt >= target && finAt < index) nextFinAt = finAt + 1; // host moved up past it
  }
  return { ok: true, reason: "", stack: next, finAt: nextFinAt };
};

/** canReplace(stack, finAt, index, id) -> {ok, reason}: swap the part at
 *  `index` for `id` in ONE step (a remove followed by an insert would be
 *  refused half-way whenever the part is load-bearing, e.g. the engine
 *  right above a decoupler). Fins stay on the host if the new part can
 *  carry them, otherwise they come off. */
RULES.canReplace = function (stack, finAt, index, id) {
  if (!Number.isInteger(index) || index < 0 || index >= stack.length) return { ok: false, reason: "That is not a part in the stack." };
  if (!RSX.PARTS.has(id)) return { ok: false, reason: "Unknown part: " + id };
  if (clsOf(id) === "fin") return { ok: false, reason: "Fins are not stacked -- mount them on a tank or an engine instead." };
  const next = RULES.replace(stack, finAt, index, id, true);
  const r = RULES.check(next.stack, next.finAt);
  return r.ok ? { ok: true, reason: "" } : refusal(r, index);
};

RULES.replace = function (stack, finAt, index, id, unchecked) {
  if (!unchecked) {
    const can = RULES.canReplace(stack, finAt, index, id);
    if (!can.ok) return { ok: false, reason: can.reason, stack: stack.slice(), finAt };
  }
  const next = stack.slice();
  next[index] = id;
  let nextFinAt = finAt;
  if (finAt === index) {
    const c = clsOf(id);
    if (c !== "tank" && c !== "engine") nextFinAt = null; // the new part cannot carry fins
  }
  return { ok: true, reason: "", stack: next, finAt: nextFinAt };
};

/**
 * connectionNodes(stack, finAt, id) -> what drag-and-drop paints:
 *  - for a stackable part: every insert index 0..stack.length as
 *    {index, ok, reason};
 *  - for a fin id: every stack index as {index, ok, reason, host:true}
 *    (ok = that part can carry the fin set).
 */
RULES.connectionNodes = function (stack, finAt, id) {
  if (RSX.PARTS.has(id) && clsOf(id) === "fin") {
    return stack.map((pid, i) => {
      const c = clsOf(pid);
      const ok = c === "tank" || c === "engine";
      return { index: i, ok, reason: ok ? "" : "Fins can only be mounted on a tank or an engine.", host: true };
    });
  }
  const nodes = [];
  for (let i = 0; i <= stack.length; i++) {
    const can = RULES.canInsert(stack, finAt, id, i);
    nodes.push({ index: i, ok: can.ok, reason: can.reason });
  }
  return nodes;
};

if (typeof module !== "undefined") module.exports = RSX;
