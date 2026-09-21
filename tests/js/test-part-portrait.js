/* Headless regression test for web/js/render/part-portrait.js. jsc has no
   real <canvas>, so this provides the minimal Canvas2D + Path2D surface
   the existing renderer.js primitives (drawNoseCone/drawBodySegment/
   drawFins/drawEngineBell, and RR.ogivePath/RR.bellPath which they call
   internally) actually use. It cannot check pixels, but it proves every
   catalog part portrait-dispatches to its real drawing primitive without
   throwing -- the class of bug this guards against is "the fin/engine/pod
   branch is wired to the wrong primitive" or "a new catalog part crashes
   the portrait renderer", not "the artwork looks right" (that is a
   browser-visual check, done separately). */
"use strict";

if (typeof Path2D === "undefined") {
  const Path2DShim = function () { this.ops = []; };
  Path2DShim.prototype.moveTo = function () { this.ops.push("moveTo"); };
  Path2DShim.prototype.lineTo = function () { this.ops.push("lineTo"); };
  Path2DShim.prototype.closePath = function () { this.ops.push("closePath"); };
  globalThis.Path2D = Path2DShim; // renderer.js's ogivePath/bellPath call `new Path2D()` at CALL time, not
  // load time, so defining it here (before any test calls the drawing functions) is sufficient --
  // "use strict" forbids assigning a bare undeclared identifier, hence globalThis here.
}

function makeStubGradient() {
  return { addColorStop: function () {} };
}

function makeStubCtx() {
  const calls = [];
  const ctx = {
    calls,
    save() { calls.push("save"); },
    restore() { calls.push("restore"); },
    translate() { calls.push("translate"); },
    scale() { calls.push("scale"); },
    rotate() { calls.push("rotate"); },
    clip() { calls.push("clip"); },
    beginPath() { calls.push("beginPath"); },
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() { calls.push("arc"); },
    ellipse() { calls.push("ellipse"); },
    fill(pathOrNothing) { calls.push("fill"); },
    stroke() { calls.push("stroke"); },
    fillRect() { calls.push("fillRect"); },
    strokeRect() { calls.push("strokeRect"); },
    clearRect() { calls.push("clearRect"); },
    createLinearGradient() { calls.push("createLinearGradient"); return makeStubGradient(); },
    createRadialGradient() { calls.push("createRadialGradient"); return makeStubGradient(); },
  };
  // fillStyle/strokeStyle/lineWidth/globalAlpha/globalCompositeOperation are
  // plain assignable properties on a stub -- no getter/setter needed, the
  // renderer only ever writes them.
  ["fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "globalCompositeOperation", "font"].forEach((p) => { ctx[p] = null; });
  return ctx;
}

test("drawPartPortrait renders every current catalog part without throwing", function () {
  RSX.PARTS.all().forEach((def) => {
    const ctx = makeStubCtx();
    let threw = null;
    try { RSX.render.drawPartPortrait(ctx, def, 200, 200); } catch (e) { threw = e; }
    assert(!threw, def.id + " (" + def.cls + ") threw: " + (threw && threw.message));
    assert(ctx.calls.indexOf("clearRect") === 0, def.id + " must clear the canvas first");
    assert(ctx.calls.length > 3, def.id + " drew almost nothing (" + ctx.calls.length + " canvas calls)");
  });
});

test("each cls dispatches to a visibly different drawing routine (not one generic image for every part)", function () {
  // Proxy for "does this actually call the part-specific primitive": wrap
  // the real RR functions to record which ones fired, restore afterwards.
  const seen = new Set();
  const wrap = (name) => {
    const orig = RSX.render[name];
    RSX.render[name] = function (...args) { seen.add(name); return orig.apply(this, args); };
    return () => { RSX.render[name] = orig; };
  };
  const unwraps = ["drawNoseCone", "drawBodySegment", "drawFins", "drawEngineBell"].map(wrap);
  try {
    RSX.PARTS.all().forEach((def) => {
      seen.clear();
      RSX.render.drawPartPortrait(makeStubCtx(), def, 200, 200);
      if (def.cls === "nose") assert(seen.has("drawNoseCone"), def.id + " should call drawNoseCone");
      if (def.cls === "pod" || def.cls === "tank" || def.cls === "decoupler") assert(seen.has("drawBodySegment"), def.id + " should call drawBodySegment");
      if (def.cls === "engine") assert(seen.has("drawEngineBell"), def.id + " should call drawEngineBell");
      if (def.cls === "fin") assert(seen.has("drawFins"), def.id + " should call drawFins");
    });
  } finally {
    unwraps.forEach((u) => u());
  }
});

test("the decoupler has a dedicated drawer (never the _unknown placeholder)", function () {
  assert(typeof RSX.render._partPortraitDrawers.decoupler === "function", "expected a decoupler drawer");
  const ctx = makeStubCtx();
  RSX.render.drawPartPortrait(ctx, RSX.PARTS.get("decoupler.s"), 200, 200);
  assert(ctx.calls.indexOf("strokeRect") === -1, "decoupler.s must not draw the placeholder rect");
  assert(ctx.calls.filter((c) => c === "arc").length >= 3, "expected the separation-band bolt marks to be drawn");
});

test("an unrecognised cls falls back to the labelled placeholder instead of throwing or drawing nothing", function () {
  const ctx = makeStubCtx();
  RSX.render.drawPartPortrait(ctx, { id: "fx.future-part", cls: "not-yet-supported" }, 200, 200);
  assert(ctx.calls.indexOf("strokeRect") >= 0, "fallback should draw a placeholder rect");
});
