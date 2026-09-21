/* =====================================================================
   ASSEMBLY LAYOUT — pure, rendering-library-agnostic geometry for the 3D
   Assembly view (owner's spec §16/§21: "3D ROCKET" panel, camera
   controls). Deliberately has ZERO dependency on Three.js (or any
   renderer): it reuses RSX.rocket.layoutStack's station math and adds
   only the extra fields a 3D scene builder needs (radius, class, fin
   attachment), so this file stays testable under jsc while the actual
   WebGL code (web/js/render/assembly-3d.js) is not.
   ===================================================================== */
"use strict";

RSX.rocket = RSX.rocket || {};

/**
 * assemblyLayout(design) -> {
 *   parts: [{ id, def, cls, sTop, sBot, sMid, L, R }, ...],   // nose-first, stack order
 *   finOn: { id, def, sMid, R } | null,
 *   sTail, sMid (of the whole vehicle, for camera framing), maxR
 * }
 * Never throws for an unknown finOn id (returns finOn: null instead) --
 * this is display geometry, not the flight-critical vehicle builder.
 */
RSX.rocket.assemblyLayout = function (design) {
  const laid = RSX.rocket.layoutStack(design.stack);
  const parts = laid.map((p) => ({
    id: p.id, def: p.def, cls: p.def.cls, sTop: p.sTop, sBot: p.sBot, sMid: p.sMid,
    L: p.sBot - p.sTop, R: p.def.R,
  }));

  let finOn = null;
  if (design.finOn) {
    const host = parts.find((p) => p.id === design.finOn);
    if (host) finOn = { id: host.id, def: RSX.PARTS.get("fin.d"), sMid: host.sMid, R: host.R };
  }

  const sTail = parts.length ? parts[parts.length - 1].sBot : 0;
  const maxR = parts.reduce((m, p) => Math.max(m, p.R), 0);
  return { parts, finOn, sTail, sMid: sTail / 2, maxR };
};

if (typeof module !== "undefined") module.exports = RSX;
