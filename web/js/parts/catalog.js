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
     nose:   {shape: "ogive" | "blunt" | "cone"}  -- picks RSX.NOSE_CP_FACTOR
     tank:   {propKey, massFull (kg)}  -- massFull is the REFERENCE capacity
             (filled with propKey); the tank is really a fixed VOLUME
             (RSX.rocket.tankVolumeM3) that the stage engine's propellant
             fills at its own bulk density
     engine: {propKey, pcDesign (Pa), throatD, exitD (m), efficiency}
     fin:    {CNa, rootChord, span (m)}      -- radial, contributes no length
   A `decoupler` (class, no sub-object) is a short structural ring that
   starts a new stage below it (design/stage-2-plan.md §3.2).
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
const _CLASSES = ["nose", "pod", "tank", "engine", "fin", "decoupler"];

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
  nose: { shape: "ogive" },
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

/* ---------------------------------------------------------------------
   Stage-2 additions (design/stage-2-plan.md §3.4): a decoupler so
   rockets can stage, and a real alternative in every class. Every
   engine figure below was read from the SAME nozzle model the flight
   uses (RSX.thrustN/RSX.massFlow at pcDesign; tests/js/test-stages.js
   pins them), not typed in:
     engine.m1 (Prometheus, CH4/LOX): 1195/1322 kN SL/vac, Isp 308/341 s,
       mdot 396 kg/s, attached flow at sea level (eps 46).
     engine.h1 (Aquila, LH2/LOX):     47/146 kN SL/vac, Isp 143/444 s,
       mdot 33 kg/s, flow-SEPARATED at sea level (eps 94) -- an upper
       stage engine, honestly weak in air.
   Tank capacities are RP-1 reference figures; under a CH4 engine the
   same 4.5 m3 tank.s holds 3,746 kg, under LH2 1,547 kg (bulk density).
--------------------------------------------------------------------- */
RSX.PARTS.register({
  id: "decoupler.s", cls: "decoupler", name: "decoupler", dryMass: 45, L: 0.30, R: 0.6,
  material: "Aluminum ring frame, frangible joint", manufacturer: "Ridgeline Aerostructures", cost: 2600,
  description: "A 0.30 m separation ring that marks a stage boundary: everything below it is the lower stage, which falls away when the ring's frangible joint fires. It must sit directly under the engine of the stage above (that engine only lights once the lower stage is gone) and is dropped with the lower stage. 45 kg of pure structure -- dead weight until it earns its keep at separation.",
});
RSX.PARTS.register({
  id: "nose.b", cls: "nose", name: "nose", dryMass: 45, L: 1.0, R: 0.6,
  material: "Carbon-composite laminate, ablative cap", manufacturer: "Ridgeline Aerostructures", cost: 3600,
  nose: { shape: "blunt" },
  description: "A short blunt nose cap: 15 kg lighter and 0.6 m shorter than the ogive, but its rounded front raises the axial drag coefficient (the flight model's blunt-nose C_A table) and its aerodynamic centre sits at half its length -- so the vehicle pays for the mass saving in drag, especially through max-Q.",
});
RSX.PARTS.register({
  id: "pod.crew", cls: "pod", name: "crew pod", dryMass: 420, L: 1.1, R: 0.6,
  material: "Aluminum-lithium pressure hull, composite fairing", manufacturer: "Continuum Avionics", cost: 24000,
  description: "A pressurised two-seat crew capsule with life support and its own guidance. At 420 kg it is more than four times the probe's mass, all of it above the tanks -- which pulls the centre of mass forward (good for stability) while every stage below has to lift it (bad for delta-v).",
});
RSX.PARTS.register({
  id: "fin.l", cls: "fin", name: "large fin", dryMass: 0, fin: { CNa: 9.0, rootChord: 1.3, span: 1.3 },
  material: "Machined aluminum, welded root", manufacturer: "Ridgeline Aerostructures", cost: 2900,
  description: "A large tail fin set, 1.3 m root chord by 1.3 m span. Half again the restoring lift of the standard fin (C_Na = 9.0 vs 6.0), pulling the centre of pressure further aft for a bigger stability margin on a longer or heavier-nosed vehicle -- at the cost of more fin planform in the airstream.",
});
RSX.PARTS.register({
  id: "engine.m1", cls: "engine", name: "mount", dryMass: 1700, L: 1.6, R: 0.6,
  material: "Copper-alloy chamber, Inconel manifolds, titanium mount", manufacturer: "Kestrel Propulsion Works", cost: 96000,
  engine: { propKey: "ch4", pcDesign: 25.0e6, throatD: 0.1920, exitD: 1.3000, efficiency: 0.94 },
  description: "Prometheus: a high-pressure methane/LOX engine with by far the most thrust in this catalog (about 1.2 MN at sea level from a 25 MPa chamber) and a better Isp than either kerosene engine at both ends. The price is 1,700 kg of dry mass and a mass flow that empties a small tank in seconds -- and the tank above it fills with less-dense methane, so the same volume holds less mass.",
});
RSX.PARTS.register({
  id: "engine.h1", cls: "engine", name: "mount", dryMass: 320, L: 1.4, R: 0.6,
  material: "Stainless chamber, aluminum mount", manufacturer: "Kestrel Propulsion Works", cost: 71000,
  engine: { propKey: "lh2", pcDesign: 6.0e6, throatD: 0.1300, exitD: 1.2600, efficiency: 0.94 },
  description: "Aquila: a hydrogen/LOX upper-stage engine with the highest vacuum Isp in the catalog (about 444 s) and the lightest mount, but only about 146 kN in vacuum and a wide bell that flow-separates in sea-level air -- a real modelled loss, not a penalty. Hydrogen's low bulk density also means the tank above it carries about a third of the mass it would hold in kerosene.",
});
RSX.PARTS.register({
  id: "tank.l", cls: "tank", name: "tank", dryMass: 13000 * 0.05, L: 10.0, R: 0.6,
  material: "Welded aluminum skin, common bulkhead", manufacturer: "Ridgeline Aerostructures", cost: 23500,
  tank: { propKey: "rp1", massFull: 13000 },
  description: "A 10.0 m booster tank holding up to 13,000 kg of RP-1 (about 12.7 m3), nearly three times the standard tank in the same 1.2 m diameter. Meant for a first stage under a big engine: a long, heavy tank on a small engine simply will not lift off.",
});

if (typeof module !== "undefined") module.exports = RSX;
