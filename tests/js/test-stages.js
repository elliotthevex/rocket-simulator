/* design/stage-2-plan.md §3.1/3.2/3.4/3.5/3.7: the v2 design model,
   stages, volume-based tanks, nose shapes, the new parts (numbers
   pinned against the REAL nozzle model, not typed in), artFor, and the
   per-stage stats -- all while CADET_I stays bit-for-bit the oracle. */
"use strict";

const C2 = RSX.rocket.CADET_II;

test("normalizeDesign: legacy finOn becomes finAt, dangling finOn becomes null, config gets defaults and clamps", function () {
  const d = RSX.rocket.normalizeDesign(RSX.rocket.CADET_I);
  assert(d.finAt === 3 && d.fin === "fin.d", JSON.stringify(d));
  assert(d.stack !== RSX.rocket.CADET_I.stack, "stack must be a copy");
  assert(d.config.fuelLoad === 1 && d.config.autoStage === true && d.config.pitchOverAlt === 0 && d.config.pitchTargetDeg === 90, JSON.stringify(d.config));
  assert(RSX.rocket.CADET_I.finAt === undefined && RSX.rocket.CADET_I.finOn === "engine.k1", "the CADET_I literal must stay untouched");
  const dangling = RSX.rocket.normalizeDesign({ stack: ["nose.s"], finOn: "engine.k1" });
  assert(dangling.finAt === null, "dangling finOn -> null");
  const clamped = RSX.rocket.normalizeDesign({ stack: [], finAt: 5, config: { fuelLoad: 0.01, pitchTargetDeg: 400, autoStage: 0 } });
  assert(clamped.finAt === null && clamped.config.fuelLoad === 0.1 && clamped.config.pitchTargetDeg === 90 && clamped.config.autoStage === false, JSON.stringify(clamped));
  const dup = RSX.rocket.normalizeDesign({ stack: ["nose.s", "tank.s", "tank.s", "engine.k1"], finOn: "tank.s" });
  assert(dup.finAt === 2, "finOn resolves to the LAST matching part, got " + dup.finAt);
});

test("stagesOf: the decoupler starts the stage below it; stages come bottom-first; one stage without a decoupler", function () {
  const st = RSX.rocket.stagesOf(C2.stack);
  assert(st.length === 2, "expected 2 stages, got " + st.length);
  assert(st[0].n === 1 && st[0].iStart === 4 && st[0].iEnd === 6 && JSON.stringify(st[0].ids) === JSON.stringify(["decoupler.s", "tank.m", "engine.k1"]), JSON.stringify(st[0]));
  assert(st[1].n === 2 && st[1].iStart === 0 && st[1].iEnd === 3, JSON.stringify(st[1]));
  const one = RSX.rocket.stagesOf(RSX.rocket.CADET_I.stack);
  assert(one.length === 1 && one[0].n === 1 && one[0].iStart === 0 && one[0].iEnd === 3, JSON.stringify(one));
});

test("buildVehicle(CADET_II): one flyable body of 7 parts, bottom engine as the motor, stages bottom-first, fins at the host's aft edge", function () {
  const veh = RSX.rocket.buildVehicle(C2);
  assert(veh.parts.length === 7 && veh.stages.length === 2 && veh.stageIndex === 0, "shape");
  assertApprox(veh.sTail, 1.6 + 0.5 + 4.0 + 1.2 + 0.3 + 7.0 + 1.0, 1e-9, "sTail");
  assertApprox(veh.sEngine, veh.sTail, 1e-9, "sEngine");
  const k1 = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  assertApprox(RSX.thrustN(veh.motor, veh.motor.pcDesign, 0), RSX.thrustN(k1.motor, k1.motor.pcDesign, 0), 1e-9, "motor is engine.k1's");
  assert(veh.stages[0].propKey === "rp1" && veh.stages[1].propKey === "rp1", "propKeys");
  assert(veh.stages[0].engineIdx === 6 && JSON.stringify(veh.stages[0].tankIdx) === JSON.stringify([5]), JSON.stringify(veh.stages[0]));
  assert(veh.stages[1].engineIdx === 3 && JSON.stringify(veh.stages[1].partIdx) === JSON.stringify([0, 1, 2, 3]), JSON.stringify(veh.stages[1]));
  assertApprox(veh.stages[0].sTop, 7.3, 1e-9, "stage 1 top"); assertApprox(veh.stages[0].sTail, 15.6, 1e-9, "stage 1 tail");
  assertApprox(veh.stages[0].propMassFull, 9200, 1e-9, "stage 1 prop");
  assertApprox(veh.stages[0].dryMass, 45 + 460 + 630, 1e-9, "stage 1 dry");
  assert(veh.parts[4].id === "decoupler.s" && veh.parts[4].cls === "decoupler" && veh.parts[4].stage === 1 && veh.parts[3].stage === 2, "part id/cls/stage");
  assert(veh.parts[6].hasFins === true && veh.fin.id === "fin.d", "fin host flagged");
  const fin = veh.aeroContribs.find((c) => c.kind === "fin");
  assertApprox(fin.s, 15.6 - 0.3, 1e-9, "fin station = host aft edge - 0.3");
  assertApprox(veh.aeroContribs[0].s, 1.6 * RSX.NOSE_CP_FACTOR.ogive, 1e-9, "nose CP");
  assert(veh.design.finAt === 6 && veh.design.name === "Cadet II", "normalized design carried");
  assert(veh.fullParts.length === 7 && veh.fullParts !== veh.parts, "fullParts is a separate array");
});

test("buildVehicle throws only when the BOTTOM stage lacks an engine or a tank; an engineless UPPER stage builds", function () {
  let msg = "";
  try { RSX.rocket.buildVehicle({ stack: ["nose.s", "tank.s", "engine.kv", "decoupler.s", "tank.m"] }); } catch (e) { msg = String(e.message); }
  assert(/engine/.test(msg) && !/tank/.test(msg), "bottom stage without engine: " + msg);
  msg = "";
  try { RSX.rocket.buildVehicle({ stack: ["nose.s", "tank.s", "engine.kv", "decoupler.s", "engine.k1"] }); } catch (e) { msg = String(e.message); }
  assert(/tank/.test(msg) && !/engine/.test(msg), "bottom stage without tank: " + msg);
  const veh = RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.s", "decoupler.s", "tank.m", "engine.k1"] });
  assert(veh.stages[1].motor === null && veh.stages[1].engineIdx === null, "upper stage without engine has no motor");
  assertApprox(veh.parts[2].propMassFull, 4600, 1e-9, "engineless stage keeps the reference propellant fill");
});

test("volume-based tanks: the same tank holds 4600 kg RP-1, less CH4, a third as much LH2 -- and dry mass follows the propellant", function () {
  const vol = RSX.rocket.tankVolumeM3(RSX.PARTS.get("tank.s"));
  assertApprox(vol, 4600 / 1023, 1e-9, "tank.s volume");
  const rp1 = RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.s", "engine.k1"] }).parts[2];
  assert(rp1.propMassFull === 4600 && rp1.dryMass === 230, "rp1 fill must be EXACT (oracle): " + rp1.propMassFull + "/" + rp1.dryMass);
  const ch4 = RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.s", "engine.m1"] }).parts[2];
  assertApprox(ch4.propMassFull, vol * 833, 1e-9, "ch4 fill");
  assertApprox(ch4.dryMass, vol * 833 * 0.057, 1e-9, "ch4 tank dry mass");
  const lh2 = RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.s", "engine.h1"] }).parts[2];
  assertApprox(lh2.propMassFull, vol * 344, 1e-9, "lh2 fill");
  assertBetween(lh2.propMassFull / rp1.propMassFull, 0.33, 0.34, "lh2 holds about a third of rp1's mass");
  // Per stage: an LH2 upper engine fills ITS tank with LH2 while the RP-1 booster tank below stays RP-1.
  const mixed = RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.s", "engine.h1", "decoupler.s", "tank.m", "engine.k1"] });
  assertApprox(mixed.parts[2].propMassFull, vol * 344, 1e-9, "upper tank lh2");
  assertApprox(mixed.parts[5].propMassFull, 9200, 1e-9, "booster tank rp1");
  assert(mixed.stages[1].propKey === "lh2" && mixed.stages[0].propKey === "rp1", "stage propKeys");
});

test("config.fuelLoad scales the initial propMass, never the capacity", function () {
  const half = RSX.rocket.buildVehicle({ stack: RSX.rocket.CADET_I.stack, finAt: 3, config: { fuelLoad: 0.5 } });
  assertApprox(half.parts[2].propMass, 2300, 1e-9, "half load");
  assertApprox(half.parts[2].propMassFull, 4600, 1e-9, "capacity unchanged");
  assertApprox(half.mp.m, 5610 - 2300, 1e-9, "total mass");
  const s = RSX.rocket.stats.compute(half);
  assertApprox(s.massFuel, 2300, 1e-9, "stats fuel");
});

test("nose shapes: nose.b is blunt (CP at half length, bluntNose flag), nose.s is the ogive", function () {
  const b = RSX.rocket.buildVehicle({ stack: ["nose.b", "pod.probe", "tank.s", "engine.k1"], finAt: 3 });
  assert(b.bluntNose === true, "blunt flag");
  assertApprox(b.aeroContribs[0].s, 1.0 * RSX.NOSE_CP_FACTOR.blunt, 1e-9, "blunt CP station");
  const o = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  assert(o.bluntNose === false, "ogive is not blunt");
  assertApprox(o.aeroContribs[0].s, 1.6 * 0.466, 1e-9, "ogive CP station");
  assert(RSX.PARTS.get("nose.s").nose.shape === "ogive" && RSX.PARTS.get("nose.b").nose.shape === "blunt", "catalog shapes");
  // A stack with no nose cone at all is blunt-fronted (its top part acts as the nose).
  const none = RSX.rocket.buildVehicle({ stack: ["pod.probe", "tank.s", "engine.k1"] });
  assert(none.bluntNose === true, "no nose -> blunt");
});

test("new parts: every class has an alternative, and the engine figures come from the real nozzle model", function () {
  ["nose", "pod", "tank", "engine", "fin", "decoupler"].forEach((cls) => {
    assert(RSX.PARTS.byClass(cls).length >= (cls === "decoupler" ? 1 : 2), cls + " needs alternatives");
  });
  const pa0 = RSX.atmosphere(0, RSX.PLANETS.home).P;
  const build = (id) => RSX.rocket.buildVehicle({ stack: ["nose.s", "pod.probe", "tank.s", id] });
  const m1 = build("engine.m1"), h1 = build("engine.h1");
  const isp = (veh, pa) => RSX.thrustN(veh.motor, veh.motor.pcDesign, pa) / (RSX.massFlow(veh.motor, veh.motor.pcDesign) * RSX.GRAVITY_REF);
  // Pinned to what the model printed during development (scratch probe): a
  // 0.5% band, so a nozzle-model change is caught here, not in a description.
  assertApprox(RSX.thrustN(m1.motor, m1.motor.pcDesign, pa0), 1195.3e3, 0.005, "Prometheus SL thrust");
  assertApprox(RSX.thrustN(m1.motor, m1.motor.pcDesign, 0), 1321.7e3, 0.005, "Prometheus vac thrust");
  assertApprox(isp(m1, 0), 340.7, 0.005, "Prometheus vac Isp");
  assert(!RSX.isSeparated(m1.motor, m1.motor.pcDesign, pa0), "Prometheus attached at SL");
  assertApprox(RSX.thrustN(h1.motor, h1.motor.pcDesign, 0), 145.8e3, 0.005, "Aquila vac thrust");
  assertApprox(isp(h1, 0), 444.4, 0.005, "Aquila vac Isp");
  assert(RSX.isSeparated(h1.motor, h1.motor.pcDesign, pa0), "Aquila flow-separated at SL");
  assert(RSX.PARTS.get("fin.l").fin.CNa === 9.0 && RSX.PARTS.get("tank.l").tank.massFull === 13000 && RSX.PARTS.get("pod.crew").dryMass === 420, "catalog literals");
  assert(RSX.PARTS.get("decoupler.s").L === 0.3 && RSX.PARTS.get("decoupler.s").dryMass === 45, "decoupler literal");
  RSX.PARTS.all().forEach((d) => assert(!/SpaceX|NASA|Boeing|Blue Origin|Rocket Lab|ULA|Lockheed|Northrop|Aerojet/i.test(d.manufacturer + " " + d.description), d.id + " must not name a real company"));
});

test("artFor(CADET_I) describes exactly what the 2D renderer draws, with hit regions per part", function () {
  const veh = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  const art = veh.art;
  assertApprox(art.noseLen, 1.6, 1e-9, "noseLen"); assertApprox(art.noseDia, 1.2, 1e-9, "noseDia");
  assertApprox(art.bodyLen, 5.5, 1e-9, "bodyLen"); assertApprox(art.bodyDia, 1.2, 1e-9, "bodyDia");
  assertApprox(art.finRootChord, 1.0, 1e-9, "finRootChord"); assertApprox(art.finSpan, 0.9, 1e-9, "finSpan");
  assertApprox(art.finS, 7.1, 1e-9, "finS = host aft edge");
  assertApprox(art.bellRt, 0.0725, 1e-9, "bellRt"); assertApprox(art.bellRe, 0.29, 1e-9, "bellRe");
  const parts = art.hitRegions.map((r) => r.part);
  assert(JSON.stringify(parts) === JSON.stringify(["fins", "nose", "pod", "tank", "engine"]), JSON.stringify(parts));
  const fins = art.hitRegions[0];
  assertApprox(fins.sTop, 6.1, 1e-9, "fins sTop"); assertApprox(fins.sBot, 7.1, 1e-9, "fins sBot");
  assertApprox(fins.halfWidth, 1.5, 1e-9, "fins halfWidth"); assertApprox(fins.minHalfWidth, 0.6, 1e-9, "fins minHalfWidth");
  const eng = art.hitRegions[4];
  const Ln = 1.4 * (0.29 - 0.0725) / Math.tan(15 * Math.PI / 180);
  assertApprox(eng.sTop, 6.1, 1e-9, "engine sTop"); assertApprox(eng.sBot, 7.1 + Ln, 1e-9, "engine sBot includes the bell");
  assertApprox(eng.halfWidth, 0.6, 1e-9, "engine halfWidth (R > Re)");
  const noFins = RSX.rocket.buildVehicle({ stack: RSX.rocket.CADET_I.stack, finAt: null }).art;
  assert(noFins.finS === null && noFins.finSpan === 0 && noFins.hitRegions[0].part === "nose", "no fins -> no fin art/region");
  const c2 = RSX.rocket.buildVehicle(C2).art;
  assert(c2.hitRegions.some((r) => r.part === "decoupler"), "decoupler region present");
});

test("stats: cop is the Mach 0.3 CP station; single-stage per-stage table equals the classic numbers; CADET_II sums two stages", function () {
  const veh = RSX.rocket.buildVehicle(RSX.rocket.CADET_I);
  const s = RSX.rocket.stats.compute(veh, RSX.PLANETS.home);
  assertApprox(s.cop - s.com, s.mach03Margin * veh.Dmax, 1e-9, "cop - com = margin * diameter");
  assert(s.stages.length === 1 && s.deltaVTotal === s.deltaV && s.stages[0].deltaV === s.deltaV, "single stage table");
  assertApprox(s.stages[0].twrStart, s.twrSL, 1e-9, "stage 1 TWR at ignition = sea-level TWR");
  assertApprox(s.stages[0].burnTime, s.burnTime, 1e-9, "burn time");
  assertApprox(s.stages[0].massStart, 5610, 1e-9, "massStart"); assertApprox(s.stages[0].massEnd, 1010, 1e-9, "massEnd");

  const veh2 = RSX.rocket.buildVehicle(C2);
  const s2 = RSX.rocket.stats.compute(veh2, RSX.PLANETS.home);
  assert(s2.stages.length === 2, "two stages");
  assertApprox(s2.deltaVTotal, s2.stages[0].deltaV + s2.stages[1].deltaV, 1e-9, "total is the sum");
  assertApprox(s2.deltaV, s2.deltaVTotal, 1e-9, "deltaV is the total");
  assertApprox(s2.stages[0].massStart, veh2.mp.m, 1e-9, "stage 1 starts with everything");
  assertApprox(s2.stages[0].massEnd, veh2.mp.m - 9200, 1e-9, "stage 1 ends dry");
  assertApprox(s2.stages[1].massStart, veh2.mp.m - 9200 - (45 + 460 + 630), 1e-9, "stage 2 starts after dropping stage 1");
  const g0 = RSX.PLANETS.home.mu / (RSX.PLANETS.home.R * RSX.PLANETS.home.R);
  assertApprox(s2.stages[1].twrStart, s2.stages[1].thrustVac / (s2.stages[1].massStart * g0), 1e-9, "upper stage ignites in vacuum");
  assert(s2.stages[0].twrStart > 1, "CADET_II lifts off: TWR " + s2.stages[0].twrStart);
  assert(s2.deltaVTotal > s.deltaV, "two stages beat one: " + s2.deltaVTotal + " vs " + s.deltaV);
  assert(s2.stages[1].ispVac > s2.stages[0].ispVac, "the vacuum engine has the better Isp");
  // The top-level rows still describe the active (bottom) engine.
  assertApprox(s2.thrustSL, s2.stages[0].thrustSL, 1e-9, "thrustSL row = stage 1");
  assertApprox(s2.burnTime, 9200 / s2.mdot, 1e-9, "burn time = active stage's propellant / mdot");
});

test("validate: CADET_II passes; an engineless upper stage fails the stages check without throwing; a hard-rule design fails structure", function () {
  const ok = RSX.rocket.validate(C2);
  assert(ok.ok, JSON.stringify(ok.checks.filter((c) => !c.ok)));
  assert(ok.checks.find((c) => c.id === "stages").detail.indexOf("2 stages") === 0, "stages detail");
  const noUpper = RSX.rocket.validate({ stack: ["nose.s", "pod.probe", "tank.s", "decoupler.s", "tank.m", "engine.k1"], finAt: 5 });
  assert(!noUpper.ok && noUpper.checks.find((c) => c.id === "stages").ok === false, JSON.stringify(noUpper.checks));
  const bad = RSX.rocket.validate({ stack: ["nose.s", "pod.probe", "engine.k1", "tank.s"], finAt: null });
  const structure = bad.checks.find((c) => c.id === "structure");
  assert(!bad.ok && structure.ok === false && /bottom of its stage/.test(structure.detail), JSON.stringify(structure));
});

test("assemblyLayout accepts finAt, reports stages, and does not break on a decoupler", function () {
  const asm = RSX.rocket.assemblyLayout(C2);
  assert(asm.parts.length === 7 && asm.finOn && asm.finOn.index === 6 && asm.finOn.id === "engine.k1", JSON.stringify(asm.finOn));
  assert(asm.stages.length === 2 && asm.parts[4].stage === 1 && asm.parts[3].stage === 2, "stages on layout parts");
  assert(asm.parts[4].cls === "decoupler", "decoupler laid out"); assertApprox(asm.parts[4].L, 0.3, 1e-9, "decoupler L");
  const big = RSX.rocket.assemblyLayout({ stack: C2.stack, finAt: 6, fin: "fin.l" });
  assert(big.finOn.def.id === "fin.l", "fin def follows design.fin");
});
