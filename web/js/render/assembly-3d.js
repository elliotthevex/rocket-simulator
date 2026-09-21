/* =====================================================================
   ASSEMBLY 3D — the owner's Assembly Mode viewer (spec §16/§21: a real
   "3D ROCKET" panel with rotate/pan/zoom/top/side/front/isometric/free
   camera). This is a genuinely new subsystem: an ES module (loaded via
   <script type="module">, unlike every other file in this project,
   which are plain classic scripts attaching to the global RSX
   namespace) built on Three.js, loaded from a CDN (jsdelivr) since this
   project has no bundler/package manager -- see design/requirements.md's
   own "if 3D models are supported" framing and the owner's explicit
   choice of a real 3D engine over a 2D approximation for this screen.

   Scope of THIS increment, stated plainly: a real, interactive 3D
   rendering of the CURRENT design (RSX.rocket.assemblyLayout, no
   Three.js dependency of its own), with orbit controls, camera presets,
   and click-to-inspect (reusing showPartDetail -- the same panel the
   2D builder uses, not a second one). Free-placement drag-and-drop,
   connection-point validation, exploded view, and multi-stage/booster
   support are NOT here yet; they are separate, larger pieces of the
   spec queued as their own increments.

   Geometry convention: nose tip at local Y=0, +Y is "toward the nose"
   (so the rocket sits nose-up, matching how one actually looks at a
   rocket), station s (metres aft of the nose, matching physics-core's
   own convention) maps to Y = -s. Every part is a simple primitive
   (cone/cylinder/box) sized from its REAL catalog dimensions -- not
   decorative, matching the same "click the nose cone, see the nose
   cone" requirement the 2D portraits already satisfy, just in 3D.

   --- design/aerospace-platform-plan.md L2 addendum -----------------
   Every part below used to be ONE primitive with ONE flat
   MeshStandardMaterial per class (a cone for the nose, a cylinder for
   everything else) under flat ambient+2-directional lighting on a
   pure-black scene -- "a cone-and-cylinder toy", per the owner. This
   slice replaces the per-part MESH with a per-part GROUP of primitives
   (still built only from the part's REAL catalog dimensions -- R/L off
   `assemblyLayout`, throatD/exitD off the catalog engine def, nothing
   invented) plus a 3-point light rig, shadows, and an engineering-floor
   plane. It is a rendering upgrade ONLY: `assemblyLayout`'s data shape,
   camera presets, click-to-select, and focus behaviour are unchanged.
   Because a part is now a Group of several meshes instead of one mesh,
   raycasting and sibling-highlight lookups below walk the WHOLE
   subtree (`group.traverse`, recursive raycast) instead of just
   `group`'s direct children -- the one structural change every other
   function had to make to keep working with multi-mesh parts.
   ===================================================================== */
// The bare "three" specifier (resolved by game.html's <script
// type="importmap">) is used here deliberately, not the CDN URL
// directly: OrbitControls.js below imports "three" internally too, and
// using the SAME specifier string in both places guarantees they
// resolve to one shared module instance rather than two separate
// copies of the library (which would make cross-module `instanceof`
// checks and shared prototypes silently fail).
import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

let scene, camera, renderer, controls, canvas, group;
let raycaster, mouseNDC;
let meshInfo = new Map(); // mesh.id -> { def, part: {sMid, R, L} } -- part carries enough geometry for camera framing
let currentLayout = null;
let initialized = false;
let selectedMeshes = []; // the 1+ meshes for the currently selected part (every part is now multi-mesh; a fin set is 2 groups' worth)
let camAnim = null; // {t0, dur, fromPos, toPos, fromTarget, toTarget} or null when idle -- see animate()

// Environment objects created once in init() and repositioned per
// rebuild() to fit whatever design is loaded (see the "3-point rig"
// comment on init() and the sizing comment in rebuild()).
let hemiLight, keyLight, fillLight, rimLight, floorMesh, gridHelper;

// Every class gets its own hue AND its own roughness/metalness (set in
// each buildXxx() below) so no two classes share a color+finish combo
// -- the L2 "visually distinguishable at a glance" requirement. Colors
// alone were already distinct; the finish (matte composite nose vs.
// shiny aluminum tank vs. near-black engine vs. brushed-metal fin vs.
// warm-grey decoupler) is what actually reads as "different material"
// once real lighting/shadows are in the scene.
const CLASS_COLOR = {
  nose: 0xede7da, pod: 0x8fa3b0, tank: 0xc7d0d6, engine: 0x2b2f33, fin: 0x5b636b, decoupler: 0x726a5e,
};
const HIGHLIGHT_EMISSIVE = 0xe0973a; // matches --accent in game.html's dark token set, not a hardcoded coincidence
const HIGHLIGHT_INTENSITY = 1.15; // bumped from the pre-L2 0.6 -- the new materials are darker/glossier on average, so the highlight needs more punch to still read clearly (spec's explicit "tune HIGHLIGHT_EMISSIVE... so it still reads clearly")
const BASE_EMISSIVE_INTENSITY = 0.9; // inert until a mesh's emissive color is set non-zero by setSelected()

function disposeGroup() {
  if (!group) return;
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
  });
  scene.remove(group);
  meshInfo = new Map();
  selectedMeshes = [];
}

/** standardMat(color, roughness, metalness, extra?): the one place every
 *  part material is constructed, so every material consistently starts
 *  un-highlighted (emissive black) with the SAME emissive intensity --
 *  setSelected() only ever has to flip the emissive COLOR. */
function standardMat(color, roughness, metalness, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({
    color, roughness, metalness, emissive: 0x000000, emissiveIntensity: BASE_EMISSIVE_INTENSITY,
  }, extra || {}));
}

/* ---------------------------------------------------------------------
   Per-class part geometry. Each builds a THREE.Group of primitives in
   the part's OWN local frame (Y in [-L/2, +L/2], matching the pre-L2
   convention that a bare CylinderGeometry(R,R,L) already used) so the
   caller can keep doing exactly what it did before: create the group,
   then set `grp.position.y = -part.sMid`. Every dimension comes from
   `part` (R, L, off assemblyLayout) or `part.def` (the real catalog
   def, e.g. throatD/exitD, nose.shape) -- nothing here is an arbitrary
   number independent of the actual part being drawn.
--------------------------------------------------------------------- */

/** NOSE: an ogive/blunt cone plus a short cylindrical shoulder/collar
 *  at its base (real nose-cone-to-body transitions are not one bare
 *  edge -- there is always a short straight skirt where the cone meets
 *  the body). `nose.shape` (from the F1 catalog) picks a pointed cone
 *  for ogive/cone noses and a flat-tipped taper for blunt ones. */
function buildNose(part) {
  const R = part.R, L = part.L;
  const shape = (part.def.nose && part.def.nose.shape) || "ogive";
  const collarH = Math.min(L * 0.14, R * 0.6, 0.3);
  const coneLen = Math.max(L - collarH, L * 0.6);
  const grp = new THREE.Group();

  const coneMat = standardMat(CLASS_COLOR.nose, 0.58, 0.16); // composite-look: low metalness, moderate roughness
  const coneGeo = shape === "blunt"
    ? new THREE.CylinderGeometry(R * 0.34, R, coneLen, 28) // flat-ish cap instead of a point
    : new THREE.ConeGeometry(R, coneLen, 28);
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = L / 2 - coneLen / 2;
  cone.castShadow = true; cone.receiveShadow = true;
  grp.add(cone);

  const collarMat = standardMat(CLASS_COLOR.nose, 0.4, 0.42); // a touch more metallic -- reads as a structural ring, not more composite skin
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.02, collarH, 28), collarMat);
  collar.position.y = -L / 2 + collarH / 2;
  collar.castShadow = true; collar.receiveShadow = true;
  grp.add(collar);
  return grp;
}

/** TANK: a pressure-vessel silhouette -- a dome cap carved out of the
 *  cylinder's own length (never adds length beyond `part.L`, so station
 *  math / neighbouring parts are untouched), 2-3 raised structural
 *  rings, and one offset longitudinal feed-line tube running most of
 *  the body toward the engine below. Aluminum-look material distinct in
 *  tone AND finish from the nose (shinier, less rough) and the engine
 *  (much lighter, less metallic). */
function buildTank(part) {
  const R = part.R, L = part.L;
  const domeH = Math.min(R * 0.55, L * 0.22);
  const cylinderLen = Math.max(L - domeH, L * 0.6);
  const usedDomeH = L - cylinderLen;
  const cylTop = L / 2 - usedDomeH; // Y where the dome's flat base / cylinder's top meet
  const grp = new THREE.Group();

  const tankMat = standardMat(CLASS_COLOR.tank, 0.32, 0.72); // aluminum: moderate-high metalness, low-moderate roughness
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, cylinderLen, 28), tankMat);
  cyl.position.y = cylTop - cylinderLen / 2;
  cyl.castShadow = true; cyl.receiveShadow = true;
  grp.add(cyl);

  if (usedDomeH > 0.02) {
    // A hemisphere (theta 0..PI/2) scaled down in Y into a shallow dome
    // -- real propellant tank heads are ellipsoidal caps, not full
    // hemispheres. Shares the tank material so it reads as one vessel.
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), tankMat);
    dome.scale.y = usedDomeH / R;
    dome.position.y = cylTop;
    dome.castShadow = true; dome.receiveShadow = true;
    grp.add(dome);
  }

  const ringMat = standardMat(0x6d7680, 0.5, 0.55); // a visibly different grey/finish from the skin, like a welded stringer band
  const ringCount = cylinderLen > 2.2 ? 3 : 2;
  for (let i = 1; i <= ringCount; i++) {
    const f = i / (ringCount + 1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, Math.max(R * 0.045, 0.015), 8, 24), ringMat);
    ring.rotation.x = Math.PI / 2; // lie flat around the body axis (local Y)
    ring.position.y = cylTop - f * cylinderLen;
    ring.castShadow = true; ring.receiveShadow = true;
    grp.add(ring);
  }

  const feedMat = standardMat(0x2b2f33, 0.4, 0.7); // dark metal feed line, distinct from the bright tank skin
  const feedR = Math.max(R * 0.045, 0.012);
  const feedLen = cylinderLen * 0.9;
  const feedAngle = 0.62; // a fixed radian offset -- every tank's feed line lands at the same clock position, so stacked tanks read as one continuous line running to the engine
  // Offset is the tank's OWN radius plus a bit less than the tube's own
  // radius -- i.e. the tube's centre sits just outside the skin, so it
  // reads as a pipe strapped to the OUTSIDE of the tank (half-embedded
  // in the surface, half exposed) instead of (a prior bug) sitting
  // entirely inside R, where the opaque tank shell would fully occlude
  // it from every camera angle.
  const feedOffset = R + feedR * 0.55;
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(feedR, feedR, feedLen, 10), feedMat);
  feed.position.set(feedOffset * Math.cos(feedAngle), cylTop - cylinderLen / 2, feedOffset * Math.sin(feedAngle));
  feed.castShadow = true;
  grp.add(feed);

  return grp;
}

/** ENGINE: chamber -> throat -> bell as one THREE.LatheGeometry profile
 *  revolved around the body axis, using the SAME throatD/exitD numbers
 *  the 2D renderer's RR.drawEngineBell reads off the catalog engine def
 *  (and the same `Rt + (Re-Rt)*u^0.6` divergent-section curve it draws
 *  with, just revolved in 3D instead of filled as a 2D path) -- not
 *  arbitrary geometry. A recessed dark disc near the exit keeps the
 *  bell from reading as a solid plug. */
function buildEngine(part) {
  const R = part.R, L = part.L;
  const eng = part.def.engine || {};
  // Clamp to the part's own envelope (R, L) purely for geometry safety
  // (some hypothetical future catalog entry could have a wider throat
  // than mount radius) -- every existing catalog engine's throatD/exitD
  // already fits comfortably inside R.
  let Rt = Math.max(0.025, Math.min((eng.throatD || 0.15) / 2, R * 0.85));
  let Re = Math.max(Rt * 1.15, Math.min((eng.exitD || 0.5) / 2, R * 1.35));

  const mountFrac = 0.30, neckFrac = 0.16; // fractions of L: mount 0..0.30, neck 0.30..0.46, bell 0.46..1.0
  const yTop = L / 2;
  const yMountBot = L / 2 - mountFrac * L;
  const yThroat = yMountBot - neckFrac * L;
  const yExit = -L / 2;

  // Profile points, bottom (exit) to top (mount), revolved around local Y.
  const pts = [new THREE.Vector2(Re, yExit)];
  const bellSegs = 10;
  for (let i = 1; i < bellSegs; i++) {
    const u = 1 - i / bellSegs; // 1 at the exit, 0 at the throat
    const r = Rt + (Re - Rt) * Math.pow(u, 0.6); // RR.drawEngineBell's own divergent-section curve
    pts.push(new THREE.Vector2(r, yThroat + (yExit - yThroat) * u));
  }
  pts.push(new THREE.Vector2(Rt, yThroat));
  const neckSegs = 4;
  for (let i = 1; i < neckSegs; i++) {
    const t = i / neckSegs;
    const s = t * t * (3 - 2 * t); // smoothstep -- an eased converging section, not a sharp cone-in-cylinder step
    pts.push(new THREE.Vector2(Rt + (R - Rt) * s, yThroat + (yMountBot - yThroat) * t));
  }
  pts.push(new THREE.Vector2(R, yMountBot));
  pts.push(new THREE.Vector2(R, yTop));

  const grp = new THREE.Group();
  const engineMat = standardMat(CLASS_COLOR.engine, 0.55, 0.82); // dark metallic: higher metalness+roughness than the tank
  const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), engineMat);
  bell.castShadow = true; bell.receiveShadow = true;
  grp.add(bell);

  // Recessed interior: a near-black disc set slightly inside the exit
  // plane, facing up into the bell, so the open mouth reads as a
  // combustion chamber recess instead of a flat plug.
  const insetMat = standardMat(0x0b0c0d, 0.8, 0.3, { side: THREE.DoubleSide });
  const inset = new THREE.Mesh(new THREE.CircleGeometry(Re * 0.8, 20), insetMat);
  inset.rotation.x = -Math.PI / 2;
  inset.position.y = yExit + Math.max(R, Re) * 0.16;
  grp.add(inset);

  return grp;
}

/** DECOUPLER: a separation band (a distinct darker ring) plus a row of
 *  small bolt-like bumps around the circumference, so it reads as a
 *  real stage-separation joint instead of an anonymous grey slice. */
function buildDecoupler(part) {
  const R = part.R, L = part.L;
  const grp = new THREE.Group();

  const bodyMat = standardMat(CLASS_COLOR.decoupler, 0.5, 0.5);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 28), bodyMat);
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);

  const bandMat = standardMat(0x121316, 0.65, 0.35); // dark separation joint
  const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.03, R * 1.03, Math.max(L * 0.28, 0.03), 28), bandMat);
  band.castShadow = true; band.receiveShadow = true;
  grp.add(band);

  const boltMat = standardMat(0x8a8f96, 0.35, 0.75); // brushed-steel bolts
  const boltCount = 10;
  const boltSize = Math.max(R * 0.09, 0.02);
  for (let i = 0; i < boltCount; i++) {
    const a = (i / boltCount) * Math.PI * 2;
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(boltSize, boltSize, boltSize), boltMat);
    bolt.position.set(Math.cos(a) * R * 1.06, 0, Math.sin(a) * R * 1.06);
    bolt.castShadow = true;
    grp.add(bolt);
  }
  return grp;
}

/** Fallback for classes with no dedicated builder yet (pod today) --
 *  the same plain cylinder every class used pre-L2, just still wrapped
 *  in a Group so it fits the same traverse/meshInfo contract below. */
function buildGeneric(part) {
  const R = part.R, L = part.L;
  const color = CLASS_COLOR[part.cls] != null ? CLASS_COLOR[part.cls] : 0x888888;
  const mat = standardMat(color, 0.5, part.cls === "pod" ? 0.4 : 0.3);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 28), mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const grp = new THREE.Group();
  grp.add(mesh);
  return grp;
}

function buildPartGroup(part) {
  switch (part.cls) {
    case "nose": return buildNose(part);
    case "tank": return buildTank(part);
    case "engine": return buildEngine(part);
    case "decoupler": return buildDecoupler(part);
    default: return buildGeneric(part);
  }
}

/** taperedFinGeometry: a thin frustum-shaped box -- full rootChord at
 *  the root (Z=0), narrower tipChord at the tip (Z=span) -- instead of
 *  a uniform flat plate. Built as an explicit 8-vertex BufferGeometry
 *  (not ExtrudeGeometry) so the local axes land exactly where the
 *  caller already expects them (X=thickness, Y=chord, Z=root->tip
 *  span), matching the pre-L2 BoxGeometry(thickness, rootChord, span)
 *  convention finMeshes() below builds on. Every triangle's winding is
 *  hand-verified to face outward (see the two fin meshes' `scale.z =
 *  side` mirroring in finMeshes -- three.js flips the winding test for
 *  negative-determinant transforms automatically, so one shared
 *  geometry lights correctly on both the left and right fin). */
function taperedFinGeometry(thickness, rootChord, tipChord, span) {
  const t = thickness / 2, rc = rootChord / 2, tc = tipChord / 2;
  const positions = new Float32Array([
    -t, -rc, 0, t, -rc, 0, t, rc, 0, -t, rc, 0, // 0-3: root face (Z=0)
    -t, -tc, span, t, -tc, span, t, tc, span, -t, tc, span, // 4-7: tip face (Z=span)
  ]);
  const indices = [
    0, 2, 1, 0, 3, 2, // root cap, outward normal -Z
    4, 5, 6, 4, 6, 7, // tip cap, outward normal +Z
    0, 1, 5, 0, 5, 4, // -Y side
    1, 2, 6, 1, 6, 5, // +X side
    2, 3, 7, 2, 7, 6, // +Y side
    3, 0, 4, 3, 4, 7, // -X side
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function finMeshes(finOn) {
  // A pair of thin, tapered fins flaring outward from the body surface
  // at the host part's station, mirrored left/right -- the same 2-fin
  // convention the 2D renderer/vehicle model already use.
  const rootChord = (finOn.def.fin && finOn.def.fin.rootChord) || 1.0;
  const span = (finOn.def.fin && finOn.def.fin.span) || 0.9;
  const thickness = 0.05;
  const tipChord = rootChord * 0.42; // tapers to less than half the root chord -- reads as a swept fin, not a flat plate
  const geo = taperedFinGeometry(thickness, rootChord, tipChord, span);
  // ONE shared geometry AND material for both meshes: they are one
  // logical part (the fin SET), so selecting/highlighting either must
  // highlight both, which a shared material does for free (mutating it
  // affects both meshes).
  const material = standardMat(CLASS_COLOR.fin, 0.42, 0.58, { flatShading: true }); // flat-shaded: a machined metal fin should look faceted, not smoothed
  const meshes = [];
  [1, -1].forEach((side) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.scale.z = side; // mirrors the root(Z=0)->tip(Z=span) geometry onto the -Z side without a second geometry
    mesh.position.set(0, -finOn.sMid, side * finOn.R);
    mesh.castShadow = true; mesh.receiveShadow = true;
    meshes.push(mesh);
  });
  return meshes;
}

/** setSelected(meshes): highlights `meshes` (1+ meshes, one logical part)
 *  and un-highlights whatever was selected before. `meshes` may be []
 *  to clear the selection with nothing new selected. */
function setSelected(meshes) {
  selectedMeshes.forEach((m) => { m.material.emissive.setHex(0x000000); m.material.emissiveIntensity = BASE_EMISSIVE_INTENSITY; });
  selectedMeshes = meshes || [];
  selectedMeshes.forEach((m) => { m.material.emissive.setHex(HIGHLIGHT_EMISSIVE); m.material.emissiveIntensity = HIGHLIGHT_INTENSITY; });
}

/** rebuild(design): clears and redraws the scene for the given design. */
function rebuild(design) {
  disposeGroup();
  currentLayout = RSX.rocket.assemblyLayout(design);
  group = new THREE.Group();
  currentLayout.parts.forEach((part) => {
    const grp = buildPartGroup(part);
    grp.position.y = -part.sMid;
    // Every part is now a Group of several meshes (body, dome, rings,
    // bolts, ...) instead of one mesh -- register EVERY leaf mesh
    // against the SAME {def, part} pair so raycasting (below, recursive
    // now) and sibling-highlight lookups treat the whole group as one
    // logical, selectable component.
    grp.traverse((obj) => { if (obj.isMesh) meshInfo.set(obj.id, { def: part.def, part }); });
    group.add(grp);
  });
  if (currentLayout.finOn) {
    const finPart = { cls: "fin", sMid: currentLayout.finOn.sMid, R: currentLayout.finOn.R, L: 0.9 };
    finMeshes(currentLayout.finOn).forEach((mesh) => {
      meshInfo.set(mesh.id, { def: currentLayout.finOn.def, part: finPart });
      group.add(mesh);
    });
  }
  scene.add(group);

  // Re-fit the light rig's shadow frustum, the light/target positions,
  // and the floor plane to THIS design's size -- a Falcon-1-scale
  // rocket and a Saturn-V-scale one both need the ground under their
  // tail and shadows that actually cover them, not a rig sized once at
  // init() for whatever the first design happened to be.
  const sMid = currentLayout.sMid;
  const rigScale = Math.max(currentLayout.sTail, currentLayout.maxR * 5, 4);
  [keyLight, fillLight, rimLight].forEach((l) => { l.target.position.set(0, -sMid, 0); l.target.updateMatrixWorld(); });
  keyLight.position.set(rigScale * 0.75, -sMid + rigScale * 1.3, rigScale * 0.85);
  fillLight.position.set(-rigScale * 0.95, -sMid + rigScale * 0.25, -rigScale * 0.7);
  rimLight.position.set(-rigScale * 0.55, -sMid + rigScale * 1.05, -rigScale * 1.3);
  keyLight.shadow.camera.left = -rigScale * 1.3; keyLight.shadow.camera.right = rigScale * 1.3;
  keyLight.shadow.camera.top = rigScale * 1.3; keyLight.shadow.camera.bottom = -rigScale * 1.3;
  keyLight.shadow.camera.far = rigScale * 4 + 20;
  keyLight.shadow.camera.updateProjectionMatrix();
  floorMesh.position.y = -currentLayout.sTail - Math.max(rigScale * 0.01, 0.02);
  gridHelper.position.y = floorMesh.position.y + 0.01; // just above the floor so its shadow still shows through the grid lines

  frameCamera("iso", { instant: true });
}

/** frameCamera(preset): TOP/SIDE/FRONT/ISOMETRIC/RESET (spec §16). Glides
 *  (spec §7 "smooth camera movement") rather than snapping, except on the
 *  very first call per rebuild() (nothing to glide FROM yet meaningfully
 *  -- an instant cut on load reads as normal, not jarring). */
function frameCamera(preset, opts) {
  if (!currentLayout) return;
  const instant = opts && opts.instant;
  const sMid = currentLayout.sMid;
  const dist = Math.max(currentLayout.sTail, currentLayout.maxR * 5) * 1.7 || 8;
  const target = new THREE.Vector3(0, -sMid, 0);
  let pos;
  switch (preset) {
    case "top": pos = new THREE.Vector3(0.0001, -sMid + dist, 0.0001); break; // tiny XZ offset avoids OrbitControls' up-vector singularity looking straight down
    case "side": pos = new THREE.Vector3(dist, -sMid, 0); break;
    case "front": pos = new THREE.Vector3(0, -sMid, dist); break;
    case "reset":
    case "iso":
    default: pos = new THREE.Vector3(dist * 0.62, -sMid + dist * 0.5, dist * 0.62); break;
  }
  if (instant) {
    camAnim = null;
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
  } else {
    animateCameraTo(target, pos, 700);
  }
}

/** Smoothly moves the camera+orbit-target from wherever they are now to
 *  (toTarget, toPos) over `dur` ms (ease-out cubic). Used by both the
 *  camera preset buttons and focusOnMesh() below, so "snap instantly"
 *  vs "glide" is one code path, not two. */
function animateCameraTo(toTarget, toPos, dur) {
  camAnim = {
    t0: performance.now(), dur: dur == null ? 700 : dur,
    fromPos: camera.position.clone(), toPos,
    fromTarget: controls.target.clone(), toTarget,
  };
}

/** focusOnMesh(part): glides the camera to frame `part` closely -- the
 *  spec's "FOCUS" behaviour (§17): select a component, camera moves to
 *  it. Keeps the camera's current VIEWING DIRECTION (so focusing doesn't
 *  disorient the user by also spinning the view), just changes target +
 *  distance to frame the part. */
function focusOnMesh(part) {
  const target = new THREE.Vector3(0, -part.sMid, 0);
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (!isFinite(dir.x) || dir.lengthSq() < 1e-6) dir.set(0.62, 0.5, 0.62).normalize(); // degenerate only if camera sat exactly on the old target
  const dist = Math.max(part.L, part.R * 4, 1.2) * 2.4;
  animateCameraTo(target, target.clone().add(dir.multiplyScalar(dist)), 700);
}

function resize() {
  if (!initialized) return;
  // Read the PARENT's size (.assembly-body), not the canvas's own
  // clientWidth/clientHeight: renderer.setSize(w, h, false) below writes
  // w/h back onto the canvas's width/height ATTRIBUTES (scaled by
  // devicePixelRatio) without touching its CSS size. If the canvas is
  // ever the thing measured, that write becomes the NEXT call's input --
  // a runaway feedback loop that doubled the canvas's effective size on
  // every resize() call (300 -> 600 -> 1200 -> 2400px) before game.html
  // gave #assembly3d an explicit CSS width/height:100%. That CSS fix
  // already breaks the loop; measuring the parent here is defence in
  // depth against the same bug returning if that rule is ever removed.
  const parent = canvas.parentElement;
  const w = (parent ? parent.clientWidth : canvas.clientWidth) || 1;
  const h = (parent ? parent.clientHeight : canvas.clientHeight) || 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function onClick(event) {
  const rect = canvas.getBoundingClientRect();
  mouseNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseNDC, camera);
  // recursive: true -- every part is a Group of several meshes now
  // (see rebuild()'s comment), so the actual hit is a grandchild of
  // `group`, not a direct child.
  const hits = raycaster.intersectObjects(group ? group.children : [], true);
  if (!hits.length) { setSelected([]); return; } // clicked empty space: deselect, matching a real CAD viewport
  const info = meshInfo.get(hits[0].object.id);
  if (!info) return;
  // Gather every mesh belonging to the SAME logical part (compared by
  // `.def`, the one object every one of that part's leaf meshes' info
  // literals actually share) so the whole component highlights, not
  // just the one sub-mesh the ray happened to hit (spec §1 "select a
  // component and have it highlighted", not "one bolt of it"). Walks
  // the whole subtree, not just direct children, for the same reason.
  const siblingMeshes = [];
  group.traverse((child) => {
    if (!child.isMesh) return;
    const childInfo = meshInfo.get(child.id);
    if (childInfo && childInfo.def === info.def) siblingMeshes.push(child);
  });
  setSelected(siblingMeshes);
  focusOnMesh(info.part);
  if (typeof window.showPartDetail === "function") window.showPartDetail(info.def);
}

function animate(now) {
  requestAnimationFrame(animate);
  if (camAnim) {
    const t = Math.min((now - camAnim.t0) / camAnim.dur, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic -- fast start, gentle settle
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, eased);
    controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, eased);
    if (t >= 1) camAnim = null;
  }
  controls.update(); // required every frame for OrbitControls' damping
  renderer.render(scene, camera);
}

/** A small vertical-gradient CanvasTexture for the scene background --
 *  a "subtly graded technical-lab" backdrop (spec) instead of one flat
 *  color: a touch of lighter navy/charcoal near the top fading to
 *  near-black at the bottom, restrained rather than a bright gradient. */
function makeBackgroundTexture() {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#121826");
  g.addColorStop(0.55, "#080b12");
  g.addColorStop(1, "#050708");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** init(canvasEl): creates the WebGL context once. Safe to call multiple
 *  times -- a second call is a no-op, since the Assembly screen may be
 *  shown more than once per page load. */
function init(canvasEl) {
  if (initialized) return;
  canvas = canvasEl;
  scene = new THREE.Scene();
  scene.background = makeBackgroundTexture();
  scene.fog = new THREE.Fog(0x080b12, 25, 240); // subtle depth cue; matches the background's darkest tone so it fades rather than announces itself

  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 3-point rig: a warm key light (casts the real shadow), a cool fill
  // that keeps shadow sides from going pure black, and a rim/back light
  // for an edge highlight -- replacing the old flat ambient+2-directional
  // setup that left every part flat-shaded. A low hemisphere light
  // stands in for "ambient" so there is still a soft sky/ground gradient
  // instead of zero fill at all. All four are repositioned per rebuild()
  // to fit whatever design is loaded (see that function).
  hemiLight = new THREE.HemisphereLight(0x2b3f57, 0x0a0908, 0.45);
  scene.add(hemiLight);

  keyLight = new THREE.DirectionalLight(0xfff1dd, 1.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.bias = -0.0015;
  scene.add(keyLight);
  scene.add(keyLight.target);

  fillLight = new THREE.DirectionalLight(0x8fb0ff, 0.4);
  scene.add(fillLight);
  scene.add(fillLight.target);

  rimLight = new THREE.DirectionalLight(0xbfe3ff, 0.65);
  scene.add(rimLight);
  scene.add(rimLight.target);

  // Engineering floor: a large dark plane (receives the key light's
  // shadow) plus a subtle grid overlay, so the rocket has spatial
  // context instead of floating in a void. Repositioned under the
  // rocket's tail per rebuild().
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.95, metalness: 0.05 });
  floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  gridHelper = new THREE.GridHelper(400, 160, 0x3f6a8c, 0x223547); // 2.5m cells -- fine enough to read as an engineering floor next to a ~1m-radius rocket, not a sparse grid a Falcon-scale ship dwarfs
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.6;
  scene.add(gridHelper);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.5;
  controls.maxDistance = 200;

  raycaster = new THREE.Raycaster();
  mouseNDC = new THREE.Vector2();
  canvas.addEventListener("click", onClick);
  window.addEventListener("resize", resize);

  initialized = true;
  requestAnimationFrame(animate);
}

/** focusOnPartId(id): selects + glides the camera to the part with this
 *  catalog id, if it is currently in the scene. Lets the 2D detail panel
 *  (game.html) offer its own FOCUS button (spec §17) without duplicating
 *  any camera math -- one implementation, callable from either screen. */
function focusOnPartId(id) {
  let match = null;
  meshInfo.forEach((info, meshId) => { if (info.def.id === id) match = info; });
  if (!match) return;
  const siblingMeshes = [];
  group.traverse((child) => {
    if (!child.isMesh) return;
    const childInfo = meshInfo.get(child.id);
    if (childInfo && childInfo.def === match.def) siblingMeshes.push(child);
  });
  setSelected(siblingMeshes);
  focusOnMesh(match.part);
}

window.RSX = window.RSX || {};
window.RSX.assembly3d = {
  init,
  rebuild,
  frameCamera,
  focusOnPartId,
  resize,
  isInitialized: () => initialized,
};
