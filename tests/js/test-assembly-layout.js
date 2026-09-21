/* RSX.rocket.assemblyLayout must be pure geometry, renderer-agnostic, and
   never throw for a bad finOn -- this is the data the 3D scene builder
   (web/js/render/assembly-3d.js, not jsc-testable) consumes. */
"use strict";

test("assemblyLayout(CADET_I) matches layoutStack's own stations exactly", function () {
  const design = RSX.rocket.CADET_I;
  const laid = RSX.rocket.layoutStack(design.stack);
  const asm = RSX.rocket.assemblyLayout(design);

  assert(asm.parts.length === laid.length, "part count mismatch");
  asm.parts.forEach((p, i) => {
    assertApprox(p.sTop, laid[i].sTop, 1e-9, p.id + " sTop");
    assertApprox(p.sBot, laid[i].sBot, 1e-9, p.id + " sBot");
    assertApprox(p.L, laid[i].sBot - laid[i].sTop, 1e-9, p.id + " L");
    assert(p.cls === laid[i].def.cls, p.id + " cls should come from the catalog def");
    assertApprox(p.R, laid[i].def.R, 1e-9, p.id + " R");
  });
  assertApprox(asm.sTail, laid[laid.length - 1].sBot, 1e-9, "sTail");
  assertApprox(asm.maxR, Math.max(...laid.map((p) => p.def.R)), 1e-9, "maxR");
});

test("assemblyLayout resolves finOn to the correct host part's station and radius", function () {
  const asm = RSX.rocket.assemblyLayout(RSX.rocket.CADET_I);
  assert(asm.finOn, "expected a fin (CADET_I has finOn: engine.k1)");
  assert(asm.finOn.id === "engine.k1", "fin should attach to engine.k1");
  const enginePart = asm.parts.find((p) => p.id === "engine.k1");
  assertApprox(asm.finOn.sMid, enginePart.sMid, 1e-9, "fin sMid should match its host part's sMid");
  assertApprox(asm.finOn.R, enginePart.R, 1e-9, "fin R should match its host part's R");
});

test("assemblyLayout(finOn: null) reports no fin, without throwing", function () {
  const design = { stack: ["nose.s", "pod.probe", "tank.s", "engine.k1"], finOn: null };
  const asm = RSX.rocket.assemblyLayout(design);
  assert(asm.finOn === null, "expected finOn to be null");
});

test("assemblyLayout never throws for a finOn id not present in the stack", function () {
  const design = { stack: ["nose.s", "pod.probe", "tank.s", "engine.k1"], finOn: "not-in-the-stack" };
  let threw = false, asm;
  try { asm = RSX.rocket.assemblyLayout(design); } catch (e) { threw = true; }
  assert(!threw, "assemblyLayout must not throw for a dangling finOn reference");
  assert(asm.finOn === null, "a dangling finOn reference should resolve to null, not a half-built object");
});
