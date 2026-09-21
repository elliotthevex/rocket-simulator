/* =====================================================================
   ROCKET STATS — R-10/R-11: mass, thrust, TWR, delta-v, stability, all
   computed from the SAME functions the flight kernel uses
   (RSX.massProps, RSX.thrustN, RSX.massFlow, RSX.vehicleAero). Nothing
   here is a display-only estimate; every number is read back from a real
   `veh` object built by RSX.rocket.buildVehicle (R-53: never fake a
   simulator value).

   DOM-free by design, so it can be tested headlessly (jsc) as well as
   called from the builder UI.
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};

/**
 * compute(veh, planet) -> {
 *   massTotal, massDry, massFuel (kg),
 *   thrustSL, thrustVac (N), twrSL (thrust at pa0 / weight at the surface),
 *   ispSL, ispVac (s), mdot (kg/s), burnTime (s),
 *   deltaV (m/s, Tsiolkovsky using ispVac -- the number a stage can
 *     actually spend once clear of the atmosphere),
 *   com (m, station), mach03Margin (calibers, Mach 0.3 static margin),
 *   isSeparatedAtPa0 (bool)
 * }
 * `planet` supplies pa0 (surface pressure) and g0 (surface gravity) for
 * the TWR and thrust readouts; defaults to RSX.PLANETS.home if omitted.
 */
RSX.rocket.stats = {};
RSX.rocket.stats.compute = function (veh, planet) {
  planet = planet || RSX.PLANETS.home;
  const pa0 = RSX.atmosphere(0, planet).P;
  const g0 = planet.mu / (planet.R * planet.R);

  const massTotal = veh.mp.m;
  const massFuel = veh.parts.reduce((sum, p) => sum + (p.propMass || 0), 0);
  const massDry = massTotal - massFuel;

  const thrustSL = RSX.thrustN(veh.motor, veh.motor.pcDesign, pa0);
  const thrustVac = RSX.thrustN(veh.motor, veh.motor.pcDesign, 0);
  const mdot = RSX.massFlow(veh.motor, veh.motor.pcDesign);
  const ispSL = mdot > 0 ? thrustSL / (mdot * RSX.GRAVITY_REF) : 0;
  const ispVac = mdot > 0 ? thrustVac / (mdot * RSX.GRAVITY_REF) : 0;
  const burnTime = mdot > 0 ? massFuel / mdot : 0;

  const twrSL = massTotal > 0 ? thrustSL / (massTotal * g0) : 0;

  // Tsiolkovsky using the DRY mass this engine leaves behind, not the
  // vehicle's dry mass in general -- with one tank/one engine they're the
  // same thing today, but the formula is written the way it must be once
  // a vehicle can carry more than one propellant load (R-11).
  const mf = massTotal - massFuel;
  const deltaV = (mf > 0 && massTotal > mf) ? ispVac * RSX.GRAVITY_REF * Math.log(massTotal / mf) : 0;

  // Static margin at a representative low-speed condition (Mach 0.3):
  // the same RSX.vehicleAero the flight kernel evaluates every substep,
  // not a separate estimate. vehicleAero reads veh.s_cm directly
  // (physics-core.js:436, normally set as a side effect inside deriv()
  // during flight) rather than veh.mp.s_cm -- sync it here since the
  // builder calls this with no flight loop running yet.
  veh.s_cm = veh.mp.s_cm;
  const AC = RSX.vehicleAero(veh, 0.3);
  const mach03Margin = AC.SM;

  return {
    massTotal, massDry, massFuel,
    thrustSL, thrustVac, twrSL, ispSL, ispVac, mdot, burnTime, deltaV,
    com: veh.mp.s_cm, mach03Margin,
    isSeparatedAtPa0: RSX.isSeparated(veh.motor, veh.motor.pcDesign, pa0),
  };
};

/** STABLE / MARGINAL / UNSTABLE from the real static margin, not a guess (R-36). */
RSX.rocket.stats.stabilityLabel = function (margin) {
  if (margin >= 1.0) return "STABLE";
  if (margin >= 0.3) return "MARGINAL";
  return "UNSTABLE";
};

if (typeof module !== "undefined") module.exports = RSX;
