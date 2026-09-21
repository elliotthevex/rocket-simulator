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
 *   parts: [{ id, def, cls, sTop, sBot, sMid, L, R, index, stage }, ...],   // nose-first, stack order
 *   finOn: { id, def, sMid, R, index } | null,   // def = the FIN def (design.fin, default fin.d)
 *   stages: RSX.rocket.stagesOf(stack) (bottom-first),
 *   sTail, sMid (of the whole vehicle, for camera framing), maxR
 * }
 * Accepts either design form (legacy finOn: partId or v2 finAt: index --
 * see RSX.rocket.normalizeDesign). Never throws for a dangling fin
 * reference (returns finOn: null instead) -- this is display geometry,
 * not the flight-critical vehicle builder.
 */
RSX.rocket.assemblyLayout = function (design) {
  design = RSX.rocket.normalizeDesign(design);
  const laid = RSX.rocket.layoutStack(design.stack);
  const stages = RSX.rocket.stagesOf(design.stack);
  const parts = laid.map((p, i) => ({
    id: p.id, def: p.def, cls: p.def.cls, sTop: p.sTop, sBot: p.sBot, sMid: p.sMid,
    L: p.sBot - p.sTop, R: p.def.R, index: i,
    stage: stages.find((st) => i >= st.iStart && i <= st.iEnd).n,
  }));

  let finOn = null;
  if (design.finAt != null && parts[design.finAt] && RSX.PARTS.has(design.fin)) {
    const host = parts[design.finAt];
    finOn = { id: host.id, def: RSX.PARTS.get(design.fin), sMid: host.sMid, R: host.R, index: host.index };
  }

  const sTail = parts.length ? parts[parts.length - 1].sBot : 0;
  const maxR = parts.reduce((m, p) => Math.max(m, p.R), 0);
  return { parts, finOn, stages, sTail, sMid: sTail / 2, maxR };
};

if (typeof module !== "undefined") module.exports = RSX;
