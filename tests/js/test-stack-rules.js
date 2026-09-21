/* design/stage-2-plan.md §3.3: the stack rules are the one oracle the
   Design editor, the 3D drag-and-drop nodes and the launch checklist all
   consult. Every reason must be plain language; every refused edit must
   leave the stack untouched. */
"use strict";

const R = () => RSX.rocket.rules;
const C1 = ["nose.s", "pod.probe", "tank.s", "engine.k1"];
const C2 = ["nose.s", "pod.probe", "tank.s", "engine.kv", "decoupler.s", "tank.m", "engine.k1"];

test("check: CADET_I and CADET_II are structurally legal with no soft warnings", function () {
  const a = R().check(C1, 3);
  assert(a.ok && a.hard.length === 0, "CADET_I hard: " + JSON.stringify(a.hard));
  assert(a.soft.length === 0, "CADET_I soft: " + JSON.stringify(a.soft));
  const b = R().check(C2, 6);
  assert(b.ok && b.hard.length === 0, "CADET_II hard: " + JSON.stringify(b.hard));
  assert(b.soft.length === 0, "CADET_II soft: " + JSON.stringify(b.soft));
});

test("H1: one nose, only at the top", function () {
  const r1 = R().check(["pod.probe", "nose.s", "tank.s", "engine.k1"], null);
  assert(!r1.ok && r1.hard[0].index === 1 && /top part/.test(r1.hard[0].reason), JSON.stringify(r1.hard));
  const r2 = R().check(["nose.s", "nose.b", "tank.s", "engine.k1"], null);
  assert(!r2.ok && r2.hard.some((h) => h.index === 1 && /Only one nose/.test(h.reason)), JSON.stringify(r2.hard));
});

test("H2: pods only in the top stage", function () {
  const r = R().check(["nose.s", "tank.s", "engine.kv", "decoupler.s", "pod.probe", "tank.m", "engine.k1"], null);
  assert(!r.ok && r.hard.some((h) => h.index === 4 && /top stage/.test(h.reason)), JSON.stringify(r.hard));
});

test("H3: one engine per stage, and it is the bottom of its stage", function () {
  const below = R().check(["nose.s", "pod.probe", "engine.k1", "tank.s"], null);
  assert(!below.ok && below.hard.some((h) => h.index === 2 && /bottom of its stage/.test(h.reason)), JSON.stringify(below.hard));
  const two = R().check(["nose.s", "pod.probe", "tank.s", "engine.kv", "engine.k1"], null);
  assert(!two.ok && two.hard.some((h) => /only one engine/.test(h.reason)), JSON.stringify(two.hard));
  // An engine right above a decoupler IS the bottom of its stage.
  assert(R().check(C2, null).ok, "engine above a decoupler is legal");
});

test("H4: a decoupler is never first, never adjacent to another, always right under an engine; a trailing one is only incomplete", function () {
  const first = R().check(["decoupler.s", "tank.s", "engine.k1"], null);
  assert(!first.ok && first.hard.some((h) => h.index === 0), "first: " + JSON.stringify(first.hard));
  const adjacent = R().check(["nose.s", "tank.s", "engine.kv", "decoupler.s", "decoupler.s", "tank.m", "engine.k1"], null);
  assert(!adjacent.ok && adjacent.hard.some((h) => h.index === 4 && /in a row/.test(h.reason)), JSON.stringify(adjacent.hard));
  const underTank = R().check(["nose.s", "pod.probe", "tank.s", "decoupler.s", "tank.m", "engine.k1"], null);
  assert(!underTank.ok && underTank.hard.some((h) => h.index === 3 && /under an engine/.test(h.reason)), JSON.stringify(underTank.hard));
  // Trailing decoupler: the stage below it is empty -- soft, so a player
  // can add the decoupler first and fill the stage after it.
  const trailing = R().check(["nose.s", "pod.probe", "tank.s", "engine.k1", "decoupler.s"], 3);
  assert(trailing.ok, "a trailing decoupler must not be a hard error: " + JSON.stringify(trailing.hard));
  assert(trailing.soft.some((s) => s.stage === 1 && /tank/.test(s.reason)) && trailing.soft.some((s) => s.stage === 1 && /engine/.test(s.reason)),
    "expected stage-1 completeness warnings: " + JSON.stringify(trailing.soft));
});

test("H5: fins mount only on a tank or an engine", function () {
  const onPod = R().check(C1, 1);
  assert(!onPod.ok && /tank or an engine/.test(onPod.hard[0].reason), JSON.stringify(onPod.hard));
  assert(R().check(C1, 2).ok, "fins on the tank are legal");
  const outOfRange = R().check(C1, 9);
  assert(!outOfRange.ok, "an out-of-range finAt is a hard error");
});

test("soft rules: missing nose / pod / stage tank / stage engine / fins are reported, not refused", function () {
  const r = R().check(["pod.probe", "tank.s", "engine.kv", "decoupler.s", "tank.m"], null);
  assert(r.ok, "soft-only stack must be ok: " + JSON.stringify(r.hard));
  assert(r.soft.some((s) => /nose cone/.test(s.reason)), "no-nose warning");
  assert(r.soft.some((s) => s.stage === 1 && /engine/.test(s.reason)), "stage-1 engine warning");
  assert(r.soft.some((s) => /fins/i.test(s.reason)), "no-fins advisory");
  const noPod = R().check(["nose.s", "tank.s", "engine.k1"], 2);
  assert(noPod.ok && noPod.soft.some((s) => /pod/.test(s.reason)), "no-pod warning");
  const noTank = R().check(["nose.s", "pod.probe", "engine.k1"], null);
  assert(noTank.ok && noTank.soft.some((s) => s.stage === 1 && /tank/.test(s.reason)), "stage-1 tank warning");
});

test("canInsert: refuses a tank below the engine with the engine rule's reason; allows it above", function () {
  const bad = R().canInsert(C1, 3, "tank.m", 4);
  assert(!bad.ok && /bottom of its stage/.test(bad.reason), JSON.stringify(bad));
  const good = R().canInsert(C1, 3, "tank.m", 3);
  assert(good.ok, JSON.stringify(good));
  const fin = R().canInsert(C1, 3, "fin.d", 2);
  assert(!fin.ok && /not stacked/.test(fin.reason), JSON.stringify(fin));
  const range = R().canInsert(C1, 3, "tank.m", 5);
  assert(!range.ok, "index past the end is refused");
  const unknown = R().canInsert(C1, 3, "no.such", 0);
  assert(!unknown.ok, "unknown ids are refused");
});

test("the CADET_II build path works click by click: decoupler under the engine, then tank.m, then engine.k1, then move the fins", function () {
  let s = { stack: C1.slice(), finAt: 3 };
  let r = R().insert(s.stack, s.finAt, "decoupler.s", 4);
  assert(r.ok, "decoupler: " + r.reason);
  r = R().insert(r.stack, r.finAt, "tank.m", 5);
  assert(r.ok, "tank.m: " + r.reason);
  r = R().insert(r.stack, r.finAt, "engine.k1", 6);
  assert(r.ok, "engine.k1: " + r.reason);
  assert(JSON.stringify(r.stack) === JSON.stringify(["nose.s", "pod.probe", "tank.s", "engine.k1", "decoupler.s", "tank.m", "engine.k1"]), "got " + JSON.stringify(r.stack));
  assert(r.finAt === 3, "fins still on the upper engine (index 3), got " + r.finAt);
  // "Replace" (detail panel) swaps the upper engine for the vacuum engine in one step --
  // a remove would be refused (the decoupler would sit under a tank), so it must be atomic.
  assert(!R().canRemove(r.stack, r.finAt, 3).ok, "removing the upper engine outright is refused");
  r = R().replace(r.stack, r.finAt, 3, "engine.kv");
  assert(r.ok, "replace: " + r.reason);
  assert(JSON.stringify(r.stack) === JSON.stringify(C2), "expected CADET_II's stack, got " + JSON.stringify(r.stack));
  assert(r.finAt === 3, "fins stay on the replaced engine");
  assert(R().finHostCandidates(r.stack).indexOf(6) >= 0, "engine.k1 is a fin host");
  const final = R().check(r.stack, 6);
  assert(final.ok && final.soft.length === 0, "CADET_II complete: " + JSON.stringify(final.soft));
  // Replace refusals and fin bookkeeping.
  const bad = R().replace(C2, 6, 3, "tank.m");
  assert(!bad.ok && JSON.stringify(bad.stack) === JSON.stringify(C2) && /under an engine/.test(bad.reason), JSON.stringify(bad));
  const finOff = R().replace(["nose.s", "pod.probe", "tank.s", "engine.k1"], 2, 2, "pod.probe");
  assert(finOff.ok && finOff.finAt === null, "fins come off when the host becomes a pod: " + JSON.stringify(finOff));
});

test("canRemove / remove: fins leave with their host; removing the engine above a decoupler is refused", function () {
  const rm = R().remove(C2, 6, 6);
  assert(rm.ok && rm.finAt === null && rm.stack.length === 6, JSON.stringify(rm));
  const refused = R().canRemove(C2, 6, 3);
  assert(!refused.ok && /under an engine/.test(refused.reason), JSON.stringify(refused));
  const kept = R().remove(C2, 6, 3);
  assert(!kept.ok && JSON.stringify(kept.stack) === JSON.stringify(C2) && kept.finAt === 6, "a refused remove changes nothing");
  const shifted = R().remove(C2, 6, 1);
  assert(shifted.ok && shifted.finAt === 5, "finAt shifts up when a part above it is removed");
});

test("canMove / move: refused moves change nothing; fins ride with their host", function () {
  const up = R().canMove(C1, 3, 3, -1);
  assert(!up.ok && /bottom of its stage/.test(up.reason), JSON.stringify(up));
  const top = R().canMove(C1, 3, 0, -1);
  assert(!top.ok && /already the top/.test(top.reason), JSON.stringify(top));
  const bottom = R().canMove(C1, 3, 3, 1);
  assert(!bottom.ok && /already the bottom/.test(bottom.reason), JSON.stringify(bottom));
  // pod below tank stays legal (one stage) -- and finAt on the engine is untouched
  const mv = R().move(C1, 3, 1, 1);
  assert(mv.ok && JSON.stringify(mv.stack) === JSON.stringify(["nose.s", "tank.s", "pod.probe", "engine.k1"]) && mv.finAt === 3, JSON.stringify(mv));
  // fins on the tank (index 2); tank moves up over the pod -> finAt follows to 1, pod shifts to 2
  const host = R().move(C1, 2, 2, -1);
  assert(host.ok && host.finAt === 1 && host.stack[1] === "tank.s", JSON.stringify(host));
  // pod moves down past the fin-carrying tank -> fins' index shifts up by one
  const past = R().move(C1, 2, 1, 1);
  assert(past.ok && past.finAt === 1 && past.stack[1] === "tank.s", JSON.stringify(past));
  const refused = R().move(C1, 3, 3, -1);
  assert(!refused.ok && JSON.stringify(refused.stack) === JSON.stringify(C1) && refused.finAt === 3, "a refused move changes nothing");
});

test("insert re-points finAt when a part lands above the host", function () {
  const r = R().insert(C1, 3, "tank.m", 2);
  assert(r.ok && r.finAt === 4 && r.stack[4] === "engine.k1", JSON.stringify(r));
  const below = R().insert(C1, 2, "tank.m", 3);
  assert(below.ok && below.finAt === 2, "inserting below the host leaves finAt alone");
});

test("finHostCandidates / connectionNodes paint the right nodes green and red", function () {
  assert(JSON.stringify(R().finHostCandidates(C2)) === JSON.stringify([2, 3, 5, 6]), JSON.stringify(R().finHostCandidates(C2)));
  const nodes = R().connectionNodes(C1, 3, "tank.m");
  assert(nodes.length === 5, "one node per insert index (0..4), got " + nodes.length);
  assert(nodes[3].ok && !nodes[4].ok && /bottom of its stage/.test(nodes[4].reason), JSON.stringify(nodes));
  assert(!nodes[0].ok, "a tank above the nose is refused");
  const finNodes = R().connectionNodes(C1, 3, "fin.l");
  assert(finNodes.length === 4 && finNodes.every((n) => n.host === true), "fin nodes are host nodes");
  assert(!finNodes[0].ok && !finNodes[1].ok && finNodes[2].ok && finNodes[3].ok, JSON.stringify(finNodes));
});
