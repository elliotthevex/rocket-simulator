/* =====================================================================
   PHYSICS/CONTROL — attitude control laws (design/flight-physics.md §9.1, §10.4).
   Requires physics-core.js (RSX namespace). Pure functions of the state;
   the only thing mutated is ctrl.gimbal (by stepGimbal).

   Computed-torque attitude hold with two additions the spec's §10.4 calls
   for but §9.1's listing omits:
     1. Feed-forward of the modelled aerodynamic torque. Computed torque
        exists to cancel the known plant; the aero moment IS known (deriv()
        computes it every substep), so it is subtracted from the commanded
        torque instead of being left for the feedback loop to discover.
     2. Bandwidth scheduling. With a negative static margin the plant has
        an unstable pole at sigma = sqrt(K/I) (K = destabilising aero
        stiffness); §10.4: "wn must exceed the aero divergence rate or the
        loop simply loses". wn = max(wnBase, wnScale * sigma), capped so
        wn*dt stays well under 0.2 at the physics substep.
   Without these the default vehicle flips tail-first at max-Q (see
   design/architecture-analysis.md §7.1).
   ===================================================================== */
"use strict";

RSX.control = {};

RSX.control.DEFAULTS = {
  wn: 1.2,           // rad/s, base natural frequency (spec §9.1)
  zeta: 0.8,         // damping ratio
  wnScale: 2.5,      // multiple of the divergence rate to schedule to
  wnMax: 20.0,       // rad/s cap (wn*dt < 0.2 at dt = 1/120 -> 24 rad/s)
  deadband: 0.0035,  // rad, 0.2 deg
  gimbalMax: 0.35,   // rad
  gimbalRate: 0.9,   // rad/s actuator slew limit
};

/**
 * Destabilising aerodynamic stiffness of the current state.
 * K > 0 means the CP is ahead of the CM (SM < 0) and the aero moment grows
 * with angle of attack; sigma is the open-loop divergence rate.
 * `A` is a deriv() output for the state (needs A.q, A.mach, A.I).
 */
RSX.control.aeroStiffness = function (veh, A) {
  if (!(A.q > 0)) return { K: 0, sigma: 0, SM: NaN };
  const AC = RSX.vehicleAero(veh, A.mach);
  // tau_aero = xcp_b * (-CNa*alpha*q*Sref)  =>  dtau/dalpha = -xcp_b*CNa*q*Sref.
  // xcp_b < 0 (CP aft) gives a restoring (positive) slope; K is the
  // destabilising part, so K = max(0, xcp_b*CNa*q*Sref).
  const K = Math.max(0, AC.xcp_b * AC.CNa * A.q * AC.Sref);
  return { K, sigma: Math.sqrt(K / Math.max(A.I, 1e-3)), SM: AC.SM };
};

/**
 * The aerodynamic (plus RCS-free, gimbal-free) torque acting right now,
 * recovered from deriv()'s total by removing the gimbal and jet-damping
 * terms it also contains. This is what the feed-forward cancels.
 */
RSX.control.aeroTorqueEstimate = function (S, veh, ctrl, A) {
  const ell = veh.sEngine - veh.mp.s_cm;
  const tauGimbal = -ell * A.T * Math.sin(ctrl.gimbal || 0);
  const tauJet = -A.mdot * ell * ell * S.om;
  return A.tau - tauGimbal - tauJet - (ctrl.tauRCS || 0);
};

/**
 * Gimbal deflection command (rad) that drives theta toward ctrl.thetaCmd.
 * Returns {dCmd, wn, tauDes, tauAero, sigma, SM, saturated}.
 */
RSX.control.gimbalCommand = function (S, veh, ctrl, A, opts) {
  const o = opts || RSX.control.DEFAULTS;
  const MP = veh.mp;
  const ell = veh.sEngine - MP.s_cm;
  const T = A.T;
  const eTh = RSX.wrapPi(ctrl.thetaCmd - S.th);
  const omCmd = ctrl.omegaCmd || 0;
  const eOm = omCmd - S.om;

  const stiff = RSX.control.aeroStiffness(veh, A);
  const wn = RSX.clamp(Math.max(o.wn, o.wnScale * stiff.sigma), o.wn, o.wnMax);
  const tauAero = A.q > 0 ? RSX.control.aeroTorqueEstimate(S, veh, ctrl, A) : 0;

  const out = { dCmd: 0, wn, tauDes: 0, tauAero, sigma: stiff.sigma, SM: stiff.SM, saturated: false };
  const auth = ell * T;
  if (auth <= 1e-3) return out;                                  // no thrust -> no gimbal authority
  const inDeadband = Math.abs(eTh) < o.deadband && Math.abs(eOm) < 1e-4;
  const tauFb = inDeadband ? 0 : MP.I * (wn * wn * eTh + 2 * o.zeta * wn * eOm);
  const tauDes = tauFb - tauAero;                                // feed-forward cancels the aero moment
  const sinD = -tauDes / auth;
  out.saturated = Math.abs(sinD) > Math.sin(o.gimbalMax);
  out.tauDes = tauDes;
  out.dCmd = RSX.clamp(Math.asin(RSX.clamp(sinD, -1, 1)), -o.gimbalMax, o.gimbalMax);
  return out;
};

/** Slew-limit ctrl.gimbal toward the command for one substep; returns the command info. */
RSX.control.stepGimbal = function (S, veh, ctrl, A, dt, opts) {
  const o = opts || RSX.control.DEFAULTS;
  const cmd = RSX.control.gimbalCommand(S, veh, ctrl, A, o);
  const dMax = o.gimbalRate * dt;
  ctrl.gimbal += RSX.clamp(cmd.dCmd - ctrl.gimbal, -dMax, dMax);
  return cmd;
};

if (typeof module !== "undefined") module.exports = RSX;
