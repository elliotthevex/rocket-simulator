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
let selectedMeshes = []; // the 1+ meshes for the currently selected part (a fin set is 2 meshes, one logical part)
let camAnim = null; // {t0, dur, fromPos, toPos, fromTarget, toTarget} or null when idle -- see animate()

const CLASS_COLOR = {
  nose: 0xe7edf2, pod: 0x8fa3b0, tank: 0xc9d2d8, engine: 0x3b4248, fin: 0x6e7880,
};
const HIGHLIGHT_EMISSIVE = 0xe0973a; // matches --accent in game.html's dark token set, not a hardcoded coincidence

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

function meshForPart(part) {
  const color = CLASS_COLOR[part.cls] != null ? CLASS_COLOR[part.cls] : 0x888888;
  const material = new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: part.cls === "engine" ? 0.7 : 0.25,
    emissive: 0x000000, emissiveIntensity: 0.6, // toggled by setSelected() below; 0 = no highlight
  });
  let geo;
  if (part.cls === "nose") {
    geo = new THREE.ConeGeometry(part.R, part.L, 28);
  } else {
    geo = new THREE.CylinderGeometry(part.R, part.R, part.L, 28);
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = -part.sMid;
  return mesh;
}

function finMeshes(finOn) {
  // A pair of thin, flat boxes flaring outward from the body surface at
  // the host part's station, mirrored left/right -- the same 2-fin
  // convention the 2D renderer/vehicle model already use.
  const rootChord = (finOn.def.fin && finOn.def.fin.rootChord) || 1.0;
  const span = (finOn.def.fin && finOn.def.fin.span) || 0.9;
  const thickness = 0.03;
  // ONE shared material for both meshes: they are one logical part (the
  // fin SET), so selecting/highlighting either must highlight both, which
  // a shared material does for free (mutating it affects both meshes).
  const material = new THREE.MeshStandardMaterial({
    color: CLASS_COLOR.fin, roughness: 0.5, metalness: 0.3, emissive: 0x000000, emissiveIntensity: 0.6,
  });
  const meshes = [];
  [1, -1].forEach((side) => {
    const geo = new THREE.BoxGeometry(thickness, rootChord, span);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(0, -finOn.sMid, side * (finOn.R + span / 2));
    meshes.push(mesh);
  });
  return meshes;
}

/** setSelected(meshes): highlights `meshes` (1+ meshes, one logical part)
 *  and un-highlights whatever was selected before. `meshes` may be []
 *  to clear the selection with nothing new selected. */
function setSelected(meshes) {
  selectedMeshes.forEach((m) => m.material.emissive.setHex(0x000000));
  selectedMeshes = meshes || [];
  selectedMeshes.forEach((m) => m.material.emissive.setHex(HIGHLIGHT_EMISSIVE));
}

/** rebuild(design): clears and redraws the scene for the given design. */
function rebuild(design) {
  disposeGroup();
  currentLayout = RSX.rocket.assemblyLayout(design);
  group = new THREE.Group();
  currentLayout.parts.forEach((part) => {
    const mesh = meshForPart(part);
    meshInfo.set(mesh.id, { def: part.def, part });
    group.add(mesh);
  });
  if (currentLayout.finOn) {
    const finPart = { cls: "fin", sMid: currentLayout.finOn.sMid, R: currentLayout.finOn.R, L: 0.9 };
    finMeshes(currentLayout.finOn).forEach((mesh) => {
      meshInfo.set(mesh.id, { def: currentLayout.finOn.def, part: finPart });
      group.add(mesh);
    });
  }
  scene.add(group);
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
  const hits = raycaster.intersectObjects(group ? group.children : [], false);
  if (!hits.length) { setSelected([]); return; } // clicked empty space: deselect, matching a real CAD viewport
  const info = meshInfo.get(hits[0].object.id);
  if (!info) return;
  // A fin set is TWO meshes sharing one material (see finMeshes above) --
  // highlight both, not just the one the ray happened to hit, so the
  // whole logical component reads as selected (spec §1 "select a
  // component and have it highlighted", not "half of it"). Compared by
  // `.def` (the one object BOTH fin meshes' info literals actually
  // share), not by the info wrapper itself -- each mesh gets its OWN
  // {def, part} literal in meshInfo.set(), even when def/part are equal.
  const siblingMeshes = [];
  group.children.forEach((child) => {
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

/** init(canvasEl): creates the WebGL context once. Safe to call multiple
 *  times -- a second call is a no-op, since the Assembly screen may be
 *  shown more than once per page load. */
function init(canvasEl) {
  if (initialized) return;
  canvas = canvasEl;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);

  camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(4, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
  fill.position.set(-5, -2, -4);
  scene.add(fill);

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
  group.children.forEach((child) => {
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
