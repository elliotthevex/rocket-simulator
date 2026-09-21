/* design/stage-2-plan.md §3.8: presets plus saved designs, with an
   in-memory fallback when localStorage is missing (jsc) or throws. */
"use strict";

const D = () => RSX.rocket.designs;

test("presets: Cadet I (CADET_I, unchanged literal) and Cadet II (two stages, TWR > 1, validates)", function () {
  assert(D().PRESETS.length === 2 && D().PRESETS[0].name === "Cadet I" && D().PRESETS[1].name === "Cadet II", JSON.stringify(D().PRESETS.map((p) => p.name)));
  assert(D().PRESETS[0].stack === RSX.rocket.CADET_I.stack && D().PRESETS[0].finOn === "engine.k1", "Cadet I is the oracle's design");
  assert(!("name" in RSX.rocket.CADET_I), "the CADET_I literal itself gains no fields");
  const c2 = RSX.rocket.CADET_II;
  assert(JSON.stringify(c2.stack) === JSON.stringify(["nose.s", "pod.probe", "tank.s", "engine.kv", "decoupler.s", "tank.m", "engine.k1"]) && c2.finAt === 6, JSON.stringify(c2));
  assert(RSX.rocket.stagesOf(c2.stack).length === 2, "two stages");
  const veh = RSX.rocket.buildVehicle(c2);
  const stats = RSX.rocket.stats.compute(veh);
  assert(stats.twrSL > 1, "TWR " + stats.twrSL);
  const v = RSX.rocket.validate(c2, veh, stats);
  assert(v.ok, JSON.stringify(v.checks.filter((c) => !c.ok)));
});

test("list() puts the presets first, as normalized designs", function () {
  const l = D().list();
  assert(l.length >= 2 && l[0].preset && l[1].preset && l[0].name === "Cadet I" && l[1].name === "Cadet II", JSON.stringify(l.map((x) => x.name)));
  assert(l[0].design.finAt === 3 && l[0].design.config.fuelLoad === 1, "normalized");
});

test("save/load/remove round-trip (in-memory under jsc), by name, overwriting", function () {
  assert(typeof localStorage === "undefined", "this test expects jsc (no localStorage) to exercise the fallback");
  assert(D().isPersistent() === false, "no persistence without localStorage");
  const before = D().list().length;
  const saved = D().save({ name: "Test Bird", stack: ["nose.b", "pod.crew", "tank.s", "engine.k1"], finOn: "engine.k1", config: { fuelLoad: 0.7 } });
  assert(saved.finAt === 3 && saved.config.fuelLoad === 0.7, JSON.stringify(saved));
  assert(D().list().length === before + 1 && D().list().some((x) => x.name === "Test Bird" && !x.preset), "listed");
  const loaded = D().load("Test Bird");
  assert(loaded && loaded.stack[0] === "nose.b" && loaded.finAt === 3 && loaded.config.fuelLoad === 0.7, JSON.stringify(loaded));
  assert(loaded.stack !== saved.stack, "load returns a fresh copy");
  D().save({ name: "Test Bird", stack: ["nose.s", "pod.probe", "tank.m", "engine.k1"], finAt: 2 });
  assert(D().list().length === before + 1, "same name overwrites, no duplicate");
  assert(D().load("Test Bird").stack[2] === "tank.m" && D().load("Test Bird").finAt === 2, "overwritten");
  assert(D().remove("Test Bird") === true && D().load("Test Bird") === null && D().list().length === before, "removed");
  assert(D().remove("Test Bird") === false, "removing twice is a no-op");
});

test("load() serves presets by name; presets cannot be overwritten or removed; a nameless save throws", function () {
  const c1 = D().load("Cadet I");
  assert(c1 && c1.finAt === 3 && c1.name === "Cadet I", JSON.stringify(c1));
  assert(D().load("nope") === null, "unknown -> null");
  let threw = false;
  try { D().save({ name: "Cadet I", stack: ["nose.s"] }); } catch (e) { threw = true; }
  assert(threw, "saving over a preset must throw");
  threw = false;
  try { D().save({ stack: ["nose.s"] }); } catch (e) { threw = true; }
  assert(threw, "a nameless save must throw");
  assert(D().remove("Cadet II") === false && D().load("Cadet II"), "presets cannot be removed");
});
