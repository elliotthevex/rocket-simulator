/* =====================================================================
   SAVED DESIGNS — presets plus the player's own named designs
   (design/stage-2-plan.md §3.8). Storage is localStorage under one
   key; when localStorage is missing (jsc tests) or throws (private
   mode, quota) the store silently becomes an in-memory map so the app
   keeps working -- saving still works for the session, it just does not
   survive a reload, and list() says nothing false about it.
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};
RSX.rocket.designs = {};
const DESIGNS = RSX.rocket.designs;

DESIGNS.STORAGE_KEY = "rsx.designs.v1";

/** The two-stage preset: CADET_I's upper stack on a Vulcan-V, riding a
 *  second Vulcan-1 + stretched tank under a decoupler. Fins on the
 *  bottom engine (index 6). */
RSX.rocket.CADET_II = {
  name: "Cadet II",
  stack: ["nose.s", "pod.probe", "tank.s", "engine.kv", "decoupler.s", "tank.m", "engine.k1"],
  finAt: 6,
};

// CADET_I's literal is the regression oracle's design and stays as it
// is (no name field); the preset list carries a named copy of it.
DESIGNS.PRESETS = [
  Object.assign({ name: "Cadet I" }, RSX.rocket.CADET_I),
  RSX.rocket.CADET_II,
];

DESIGNS.isPreset = (name) => DESIGNS.PRESETS.some((p) => p.name === name);

// ---- storage -----------------------------------------------------------
let memoryStore = null; // fallback map, name -> normalized design

function readAll() {
  if (memoryStore) return memoryStore;
  try {
    if (typeof localStorage === "undefined") throw new Error("no localStorage");
    const raw = localStorage.getItem(DESIGNS.STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    memoryStore = memoryStore || {};
    return memoryStore;
  }
}

function writeAll(map) {
  if (memoryStore) { memoryStore = map; return; }
  try {
    if (typeof localStorage === "undefined") throw new Error("no localStorage");
    localStorage.setItem(DESIGNS.STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    memoryStore = map; // from here on this session lives in memory
  }
}

/** True when designs are persisting to localStorage (false = in-memory fallback). */
DESIGNS.isPersistent = () => {
  if (memoryStore) return false;
  try { return typeof localStorage !== "undefined" && localStorage !== null; } catch (e) { return false; }
};

// ---- API ---------------------------------------------------------------

/** list() -> [{ name, preset: bool, design }] -- presets first, then saved designs by name. */
DESIGNS.list = function () {
  const out = DESIGNS.PRESETS.map((p) => ({ name: p.name, preset: true, design: RSX.rocket.normalizeDesign(p) }));
  const saved = readAll();
  Object.keys(saved).sort().forEach((name) => {
    out.push({ name, preset: false, design: RSX.rocket.normalizeDesign(saved[name]) });
  });
  return out;
};

/** save(design): stores a normalized copy under design.name (overwrites
 *  an earlier save of that name). Throws for a missing name, or for a
 *  preset's name -- presets are fixed reference designs. Returns the copy. */
DESIGNS.save = function (design) {
  const d = RSX.rocket.normalizeDesign(design);
  if (!d.name.trim()) throw new Error("A design needs a name before it can be saved.");
  if (DESIGNS.isPreset(d.name)) throw new Error('"' + d.name + '" is a built-in preset -- save under a different name.');
  const map = readAll();
  map[d.name] = d;
  writeAll(map);
  return RSX.rocket.normalizeDesign(d);
};

/** load(name) -> a normalized copy of the preset or saved design, or null. */
DESIGNS.load = function (name) {
  const preset = DESIGNS.PRESETS.find((p) => p.name === name);
  if (preset) return RSX.rocket.normalizeDesign(preset);
  const map = readAll();
  return map[name] ? RSX.rocket.normalizeDesign(map[name]) : null;
};

/** remove(name) -> true if a saved design was deleted (presets cannot be). */
DESIGNS.remove = function (name) {
  if (DESIGNS.isPreset(name)) return false;
  const map = readAll();
  if (!(name in map)) return false;
  delete map[name];
  writeAll(map);
  return true;
};

if (typeof module !== "undefined") module.exports = RSX;
