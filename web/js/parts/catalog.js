/* =====================================================================
   PARTS CATALOG — the first, deliberately small step toward R-4's
   "modular part system... data-driven rather than hardcoded", since
   extended with the descriptive fields a real component library needs
   (cls/material/manufacturer/cost/description) once the builder UI
   actually consumed them (see web/js/render/part-portrait.js and the
   #screen-build component detail panel in game.html).

   Every def has, at minimum: {id, cls, name, dryMass (kg), L (m, along
   the stack axis), R (m, body radius), material, manufacturer, cost
   (SIMULATOR currency, not a real-world price -- see cost's note below),
   description}, plus one optional role sub-object:
     tank:   {propKey, massFull (kg)}
     engine: {propKey, pcDesign (Pa), throatD, exitD (m), efficiency}
     fin:    {CNa, rootChord, span (m)}      -- radial, contributes no length
   `cls` is the authoritative category (was previously guessed from the id
   string prefix in builder.html/validate.js by matching "pod." -- both now
   read def.cls instead).

   `manufacturer` names are fictitious in-universe designations, not real
   companies (the owner's own instruction: draw inspiration from real
   aerospace organisations' engineering culture without using their
   names/logos/proprietary designs).

   Station convention matches physics-core.js: s = metres from the nose
   tip, positive aft (physics-core.js:4-19).
   ===================================================================== */
"use strict";

RSX.PARTS = {};
const _defs = Object.create(null);
const _CLASSES = ["nose", "pod", "tank", "engine", "fin"];

RSX.PARTS.register = function (def) {
  if (!def || typeof def.id !== "string" || !def.id) throw new Error("part def needs a string id");
  if (_CLASSES.indexOf(def.cls) === -1) throw new Error(def.id + ": cls must be one of " + _CLASSES.join("/"));
  if (!(def.dryMass >= 0)) throw new Error(def.id + ": dryMass must be >= 0");
  if (def.fin == null && !(def.L > 0)) throw new Error(def.id + ": L must be > 0 (fins are the only zero-length part)");
  if (typeof def.material !== "string" || !def.material) throw new Error(def.id + ": material must be a non-empty string");
  if (typeof def.manufacturer !== "string" || !def.manufacturer) throw new Error(def.id + ": manufacturer must be a non-empty string");
  if (!(def.cost >= 0)) throw new Error(def.id + ": cost must be >= 0");
  if (typeof def.description !== "string" || !def.description) throw new Error(def.id + ": description must be a non-empty string");
  _defs[def.id] = def;
};

RSX.PARTS.get = function (id) {
  const def = _defs[id];
  if (!def) throw new Error("unknown part id: " + id);
  return def;
};

RSX.PARTS.has = (id) => id in _defs;
RSX.PARTS.all = () => Object.values(_defs);
RSX.PARTS.byClass = (cls) => RSX.PARTS.all().filter((d) => d.cls === cls);

/* ---------------------------------------------------------------------
   The five parts that reproduce RSX.testVehicle.build() (flight-loop.js
   :16-63). Structural numbers copied verbatim from there; descriptive
   fields are new.
--------------------------------------------------------------------- */
RSX.PARTS.register({
  id: "nose.s", cls: "nose", name: "nose", dryMass: 60, L: 1.6, R: 0.6,
  material: "Carbon-composite laminate", manufacturer: "Ridgeline Aerostructures", cost: 4200,
  description: "An ogive nose cone: no propellant, no moving parts, pure aerodynamic shaping and dead weight the engine carries the whole flight. Its shape fixes the forward normal-force slope (C_Na = 2.0) and puts its aerodynamic centre about 0.47 of the way back from the tip -- the forward-most term in the vehicle's stability margin.",
});
RSX.PARTS.register({
  id: "pod.probe", cls: "pod", name: "probe", dryMass: 90, L: 0.5, R: 0.6,
  material: "Aluminum-lithium alloy shell", manufacturer: "Continuum Avionics", cost: 6800,
  description: "A small avionics bay carrying guidance and instrumentation and passing bending loads down the stack. No propellant and no aerodynamic contribution of its own -- everything it does is electrical, not structural or propulsive.",
});
RSX.PARTS.register({
  id: "tank.s", cls: "tank", name: "tank", dryMass: 4600 * 0.05, L: 4.0, R: 0.6,
  material: "Welded aluminum skin, common bulkhead", manufacturer: "Ridgeline Aerostructures", cost: 9500,
  tank: { propKey: "rp1", massFull: 4600 },
  description: "A 4.0 m propellant tank holding up to 4,600 kg in about 4.5 m3 of volume. Capacity is fixed by that volume, so the fuel it is loaded with (see FUEL_PRESETS bulk density) decides how much mass actually fits. Propellant settles aft as it drains, walking the vehicle's centre of mass back through the burn.",
});
RSX.PARTS.register({
  id: "engine.k1", cls: "engine", name: "mount", dryMass: 630, L: 1.0, R: 0.6,
  material: "Inconel combustion chamber, titanium mount", manufacturer: "Kestrel Propulsion Works", cost: 41000,
  engine: { propKey: "rp1", pcDesign: 10.0e6, throatD: 0.1450, exitD: 0.5800, efficiency: 0.94 },
  description: "Vulcan-1: a balanced RP-1/LOX engine tuned for sea-level liftoff, rated for atmospheric flight from the pad all the way to vacuum. The mount and nozzle bell act as one part; every thrust/Isp number shown for it comes from the real nozzle model (RSX.thrustN/RSX.massFlow), not a lookup table.",
});
RSX.PARTS.register({
  id: "fin.d", cls: "fin", name: "fin", dryMass: 0, fin: { CNa: 6.0, rootChord: 1.0, span: 0.9 },
  material: "Machined aluminum, welded root", manufacturer: "Ridgeline Aerostructures", cost: 1800,
  description: "A tail fin set, 1.0 m root chord by 0.9 m span. Mounted well aft, it adds restoring lift (C_Na = 6.0) that pulls the centre of pressure behind the centre of mass -- the passive force that keeps the vehicle flying nose-first instead of tumbling.",
});

/* ---------------------------------------------------------------------
   Second choices, so a player picking parts actually changes the rocket.
   Every physics number below was checked against the REAL nozzle model
   (see scratchpad engine_probe.js run during development), not invented:
     engine.k1  (Vulcan-1, sea-level):   251/277 kN SL/vac, Isp 283/311 s
     engine.kv  (Vulcan-V, vacuum-opt.): 77/163 kN SL/vac, Isp 158/335 s,
       flow-SEPARATED at sea level (RSX.isSeparated) -- a real Summerfield
       effect from the larger expansion ratio (eps 84 vs 16), not a fake
       penalty. Higher vacuum Isp, much weaker (and flagged-unsafe) at
       sea level: an honest tradeoff, matching R-6 "performance changes
       with atmospheric pressure".
--------------------------------------------------------------------- */
RSX.PARTS.register({
  id: "tank.m", cls: "tank", name: "tank", dryMass: 9200 * 0.05, L: 7.0, R: 0.6,
  material: "Welded aluminum skin, common bulkhead", manufacturer: "Ridgeline Aerostructures", cost: 16800,
  tank: { propKey: "rp1", massFull: 9200 },
  description: "A stretched 7.0 m version of the standard propellant tank, holding up to 9,200 kg -- roughly double the capacity of tank.s in the same 1.2 m diameter, at the cost of extra dry mass and a lower thrust-to-weight ratio for a given engine.",
});
RSX.PARTS.register({
  id: "engine.kv", cls: "engine", name: "mount", dryMass: 420, L: 1.2, R: 0.6,
  material: "Inconel combustion chamber, titanium mount", manufacturer: "Kestrel Propulsion Works", cost: 52000,
  engine: { propKey: "rp1", pcDesign: 8.0e6, throatD: 0.1200, exitD: 1.1000, efficiency: 0.94 },
  description: "Vulcan-V: a vacuum-stretched RP-1/LOX bell with the best vacuum Isp on kerosene in this catalog. The wide 1.1 m exit over-expands in dense air and flow-separates below altitude (a real, modelled loss, not a penalty applied for game balance) -- a vacuum/upper-stage choice, not a launch engine.",
});

if (typeof module !== "undefined") module.exports = RSX;
