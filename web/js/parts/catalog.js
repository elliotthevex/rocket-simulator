/* =====================================================================
   PARTS CATALOG — the first, deliberately small step toward R-4's
   "modular part system... data-driven rather than hardcoded".

   This does NOT yet carry the full schema a builder will eventually need
   (attachment nodes, cost, tech tier, structural limits, ...). Growing the
   schema is deferred until a later increment actually consumes those
   fields, so every field added here is one this step's test proves is
   used. What IS here is exactly enough to describe the vehicle
   RSX.testVehicle.build() (flight-loop.js) already hardcodes, as data.

   Station convention matches physics-core.js: s = metres from the nose
   tip, positive aft (physics-core.js:4-19).
   ===================================================================== */
"use strict";

RSX.PARTS = {};
const _defs = Object.create(null);

/**
 * A part definition: {id, name, dryMass (kg), L (m, along the stack axis),
 * R (m, body radius)}, plus one optional role sub-object:
 *   tank:   {propKey, massFull (kg)}       -- a fuel tank
 *   engine: {propKey, pcDesign (Pa), throatD, exitD (m), efficiency}
 *   fin:    {CNa}                          -- radial, contributes no length
 * A part has at most one of tank/engine/fin; plain structural parts
 * (nose, pod) have none.
 */
RSX.PARTS.register = function (def) {
  if (!def || typeof def.id !== "string" || !def.id) throw new Error("part def needs a string id");
  if (!(def.dryMass >= 0)) throw new Error(def.id + ": dryMass must be >= 0");
  if (def.fin == null && !(def.L > 0)) throw new Error(def.id + ": L must be > 0 (fins are the only zero-length part)");
  _defs[def.id] = def;
};

RSX.PARTS.get = function (id) {
  const def = _defs[id];
  if (!def) throw new Error("unknown part id: " + id);
  return def;
};

RSX.PARTS.has = (id) => id in _defs;
RSX.PARTS.all = () => Object.values(_defs);

/* ---------------------------------------------------------------------
   The five parts that reproduce RSX.testVehicle.build() (flight-loop.js
   :16-63). Numbers copied verbatim from there.
--------------------------------------------------------------------- */
RSX.PARTS.register({ id: "nose.s", name: "nose", dryMass: 60, L: 1.6, R: 0.6 });
RSX.PARTS.register({ id: "pod.probe", name: "probe", dryMass: 90, L: 0.5, R: 0.6 });
RSX.PARTS.register({
  id: "tank.s", name: "tank", dryMass: 4600 * 0.05, L: 4.0, R: 0.6,
  tank: { propKey: "rp1", massFull: 4600 },
});
RSX.PARTS.register({
  id: "engine.k1", name: "mount", dryMass: 630, L: 1.0, R: 0.6,
  engine: { propKey: "rp1", pcDesign: 10.0e6, throatD: 0.1450, exitD: 0.5800, efficiency: 0.94 },
});
RSX.PARTS.register({ id: "fin.d", name: "fin", dryMass: 0, fin: { CNa: 6.0 } });

if (typeof module !== "undefined") module.exports = RSX;
