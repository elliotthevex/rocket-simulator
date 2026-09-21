/* Locks in the catalog schema fields the component library and detail
   panel depend on (game.html's #screen-build), and that RSX.PARTS.register
   actually enforces them instead of silently accepting an incomplete def. */
"use strict";

const REQUIRED_CLASSES = ["nose", "pod", "tank", "engine", "fin"];

test("every registered part has the full descriptive schema", function () {
  const all = RSX.PARTS.all();
  assert(all.length >= 7, "expected at least 7 catalog parts, got " + all.length);
  all.forEach((def) => {
    assert(REQUIRED_CLASSES.indexOf(def.cls) >= 0, def.id + ": cls '" + def.cls + "' not one of " + REQUIRED_CLASSES.join("/"));
    assert(typeof def.material === "string" && def.material.length > 0, def.id + ": missing material");
    assert(typeof def.manufacturer === "string" && def.manufacturer.length > 0, def.id + ": missing manufacturer");
    assert(def.cost >= 0, def.id + ": missing/invalid cost");
    assert(typeof def.description === "string" && def.description.length >= 20, def.id + ": description too short/missing");
  });
});

test("RSX.PARTS.byClass groups correctly and matches RSX.PARTS.all's cls field", function () {
  REQUIRED_CLASSES.forEach((cls) => {
    const found = RSX.PARTS.byClass(cls);
    assert(found.length >= 1, "expected at least one part with cls=" + cls);
    found.forEach((def) => assert(def.cls === cls, def.id + " leaked into byClass(" + cls + ")"));
  });
  const totalByClass = REQUIRED_CLASSES.reduce((sum, c) => sum + RSX.PARTS.byClass(c).length, 0);
  assert(totalByClass === RSX.PARTS.all().length, "byClass totals (" + totalByClass + ") should cover every part (" + RSX.PARTS.all().length + ")");
});

test("register() rejects a def missing any descriptive field, without corrupting the catalog", function () {
  const before = RSX.PARTS.all().length;
  const base = { id: "fx.incomplete", cls: "nose", name: "x", dryMass: 1, L: 1, R: 0.5 };
  const cases = [
    Object.assign({}, base, { material: undefined }),
    Object.assign({}, base, { material: "steel", manufacturer: undefined }),
    Object.assign({}, base, { material: "steel", manufacturer: "Acme", cost: undefined }),
    Object.assign({}, base, { material: "steel", manufacturer: "Acme", cost: 1, description: undefined }),
    Object.assign({}, base, { cls: "not-a-real-class", material: "steel", manufacturer: "Acme", cost: 1, description: "d".repeat(20) }),
  ];
  cases.forEach((bad) => {
    let threw = false;
    try { RSX.PARTS.register(bad); } catch (e) { threw = true; }
    assert(threw, "expected register() to reject: " + JSON.stringify(bad));
  });
  assert(RSX.PARTS.all().length === before, "a rejected def must not be added to the catalog");
  assert(!RSX.PARTS.has("fx.incomplete"), "a rejected def's id must not resolve via has()");
});

test("validate.js's command-module check now reads def.cls, not an id prefix guess", function () {
  // A pod-class part under an id that would NOT match the old "pod." prefix
  // heuristic must still be recognised as a command module.
  RSX.PARTS.register({
    id: "fx.cmd-alt-prefix", cls: "pod", name: "capsule", dryMass: 50, L: 0.4, R: 0.6,
    material: "steel", manufacturer: "Acme", cost: 1, description: "d".repeat(20),
  });
  const design = { stack: ["nose.s", "fx.cmd-alt-prefix", "tank.s", "engine.k1"], finOn: "engine.k1" };
  const result = RSX.rocket.validate(design);
  const commandCheck = result.checks.find((c) => c.id === "command");
  assert(commandCheck && commandCheck.ok, "expected the command-module check to pass via def.cls, not id prefix");
});
