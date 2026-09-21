/* =====================================================================
   PART PORTRAIT — a dedicated, isolated illustration of ONE part
   definition, reusing the existing 2D vector-art primitives in
   renderer.js (drawNoseCone/drawBodySegment/drawFins/drawEngineBell)
   instead of a separate asset pipeline. This is the "clean temporary
   procedural representation" the owner's spec explicitly asks for
   (§19) when real component photography/renders aren't available --
   structured so real PNG/WebP/GLB assets could later be swapped in per
   part by keying off `def.cls` (and, longer term, `def.draw?.kind` for
   finer-grained art per id), without changing any caller.

   Every drawing call below is EXACTLY the function the flight view
   itself uses to render this same part type in the vehicle (renderer.js;
   see game.html's draw()) -- a nose cone's portrait and its in-flight
   appearance are the same geometry, not two different assets that could
   drift apart. This is what makes "click the nose cone, see the nose
   cone" (the spec's own "MOST IMPORTANT VISUAL REQUIREMENT") true rather
   than merely styled to look true.
   ===================================================================== */
"use strict";

RSX.render = RSX.render || {};
const RR2 = RSX.render;

// Fit a part of size (partW x partH), in metres, centred in a (w x h)
// pixel box with a fractional margin. Returns {ppm, ox, oy}: ox/oy are
// the pixel offsets to translate to before ctx.scale(ppm, ppm).
function fitPpm(w, h, partW, partH, marginFrac) {
  const mx = w * marginFrac, my = h * marginFrac;
  const ppm = Math.min((w - 2 * mx) / Math.max(partW, 1e-6), (h - 2 * my) / Math.max(partH, 1e-6));
  const ox = w / 2; // horizontally centred around x=0 in part-local space
  const oy = (h - partH * ppm) / 2; // vertically centred
  return { ppm, ox, oy };
}

const PORTRAIT_BG = "rgba(255,255,255,0.03)";

/**
 * drawPartPortrait(ctx, def, w, h, opts?)
 * Draws `def` alone, isolated and scaled to fill a (w x h) pixel canvas.
 * `opts.skin` overrides the default "white" skin key; `opts.throttle`
 * (engines only) previews the exit glow at that throttle, default 0
 * (idle -- a catalog portrait should not look like it's firing).
 */
RR2.drawPartPortrait = function (ctx, def, w, h, opts) {
  opts = opts || {};
  const skin = opts.skin || "white";
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.fillStyle = PORTRAIT_BG;
  ctx.fillRect(0, 0, w, h);

  const dispatch = RR2._partPortraitDrawers[def.cls];
  if (dispatch) dispatch(ctx, def, w, h, skin, opts);
  else RR2._partPortraitDrawers._unknown(ctx, def, w, h, skin, opts);

  ctx.restore();
};

RR2._partPortraitDrawers = {
  nose(ctx, def, w, h, skin) {
    const L = def.L, D = 2 * def.R;
    const { ppm, ox, oy } = fitPpm(w, h, D, L, 0.14);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(ppm, ppm);
    RR2.drawNoseCone(ctx, L, D, skin, ppm);
    ctx.restore();
  },

  pod(ctx, def, w, h, skin) {
    const L = def.L, D = 2 * def.R;
    const { ppm, ox, oy } = fitPpm(w, h, D, L, 0.14);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(ppm, ppm);
    RR2.drawBodySegment(ctx, L, D, skin, ppm, 0);
    // Two portholes/sensor lenses -- the one visual cue that distinguishes
    // an avionics bay from a plain structural/tank segment at a glance.
    ctx.fillStyle = "#1B2A33";
    ctx.beginPath(); ctx.arc(-D * 0.18, L * 0.4, D * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(D * 0.18, L * 0.6, D * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = Math.max(0.4 / ppm, 0.01);
    ctx.beginPath(); ctx.arc(-D * 0.18, L * 0.4, D * 0.09, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(D * 0.18, L * 0.6, D * 0.07, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  },

  tank(ctx, def, w, h, skin) {
    const L = def.L, D = 2 * def.R;
    const { ppm, ox, oy } = fitPpm(w, h, D, L, 0.14);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(ppm, ppm);
    RR2.drawBodySegment(ctx, L, D, skin, ppm, 0);
    // A propellant-coloured band identifies what this tank actually
    // carries -- the same colour family the in-flight plume/smoke tint
    // uses for that fuel (RR.FUEL_VIS), not an arbitrary decoration.
    const propKey = def.tank && def.tank.propKey;
    const vis = RR2.FUEL_VIS[propKey];
    if (vis) {
      const bandY = L * 0.42, bandH = Math.max(L * 0.08, 0.12);
      const g = ctx.createLinearGradient(-D / 2, 0, D / 2, 0);
      vis.mid.forEach((c, i) => g.addColorStop(i / Math.max(vis.mid.length - 1, 1), c));
      ctx.fillStyle = g;
      ctx.fillRect(-D / 2, bandY, D, bandH);
    }
    ctx.restore();
  },

  engine(ctx, def, w, h, skin, opts) {
    const eng = def.engine;
    const Rt = eng.throatD / 2, Re = eng.exitD / 2;
    const Ln = 1.4 * (Re - Rt) / Math.tan(15 * Math.PI / 180); // matches RR.drawEngineBell's own formula
    const mountL = Math.max(def.L - Ln, 0.4); // whatever isn't bell is drawn as the mount block
    const totalH = mountL + Ln, totalW = Math.max(2 * def.R, 2 * Re);
    const { ppm, ox, oy } = fitPpm(w, h, totalW, totalH, 0.10);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(ppm, ppm);
    RR2.drawBodySegment(ctx, mountL, 2 * def.R, skin, ppm, 0);
    ctx.save();
    ctx.translate(0, mountL);
    RR2.drawEngineBell(ctx, Rt, Re, 0, opts.throttle || 0, 0);
    ctx.restore();
    ctx.restore();
  },

  fin(ctx, def, w, h) {
    const fin = def.fin;
    const dia = 1.2; // reference body diameter for scale context -- fins carry no diameter of their own
    const rootChord = fin.rootChord || 1.0, span = fin.span || 0.9;
    const bodyLen = rootChord * 1.15;
    const totalW = dia + 2 * span, totalH = bodyLen;
    const { ppm, ox, oy } = fitPpm(w, h, totalW, totalH, 0.10);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(ppm, ppm);
    // Faint reference body so the fin's attachment/scale reads clearly,
    // without implying this part includes a body segment of its own.
    ctx.save();
    ctx.globalAlpha = 0.25;
    RR2.drawBodySegment(ctx, bodyLen, dia, "white", ppm, 0);
    ctx.restore();
    RR2.drawFins(ctx, dia, rootChord, span, null, bodyLen, ppm);
    ctx.restore();
  },

  decoupler(ctx, def, w, h, skin) {
    const L = def.L, D = 2 * def.R;
    const { ppm, ox, oy } = fitPpm(w, h, D, L, 0.14);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(ppm, ppm);
    RR2.drawBodySegment(ctx, L, D, skin, ppm, 0);
    // The separation plane: a dark band across the ring with a notch at
    // each edge, the one cue that says "this joint comes apart" rather
    // than "another plain body segment".
    const bandY = L * 0.42, bandH = L * 0.16;
    ctx.fillStyle = "#1B2A33";
    ctx.fillRect(-D / 2, bandY, D, bandH);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    const notch = D * 0.05;
    ctx.fillRect(-D / 2, bandY, notch, bandH);
    ctx.fillRect(D / 2 - notch, bandY, notch, bandH);
    // Frangible-joint bolts along the band
    ctx.fillStyle = "#E0973A";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.arc(i * D * 0.16, bandY + bandH / 2, Math.min(bandH * 0.22, D * 0.03), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // Fallback so a future part class with no dedicated drawer degrades to a
  // clearly-labelled placeholder rather than a blank canvas or an error
  // (§19: never a broken image, but never pretend a real asset either).
  _unknown(ctx, def, w, h) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
    ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1;
    ctx.strokeRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
  },
};

if (typeof module !== "undefined") module.exports = RSX;
