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
let meshToDef = new Map();
let currentLayout = null;
let initialized = false;

const CLASS_COLOR = {
  nose: 0xe7edf2, pod: 0x8fa3b0, tank: 0xc9d2d8, engine: 0x3b4248, fin: 0x6e7880,
};

function disposeGroup() {
  if (!group) return;
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
  });
  scene.remove(group);
  meshToDef = new Map();
}

function meshForPart(part) {
  const color = CLASS_COLOR[part.cls] != null ? CLASS_COLOR[part.cls] : 0x888888;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: part.cls === "engine" ? 0.7 : 0.25 });
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
  const material = new THREE.MeshStandardMaterial({ color: CLASS_COLOR.fin, roughness: 0.5, metalness: 0.3 });
  const meshes = [];
  [1, -1].forEach((side) => {
    const geo = new THREE.BoxGeometry(thickness, rootChord, span);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(0, -finOn.sMid, side * (finOn.R + span / 2));
    meshes.push(mesh);
  });
  return meshes;
}

/** rebuild(design): clears and redraws the scene for the given design. */
function rebuild(design) {
  disposeGroup();
  currentLayout = RSX.rocket.assemblyLayout(design);
  group = new THREE.Group();
  currentLayout.parts.forEach((part) => {
    const mesh = meshForPart(part);
    meshToDef.set(mesh.id, part.def);
    group.add(mesh);
  });
  if (currentLayout.finOn) {
    finMeshes(currentLayout.finOn).forEach((mesh) => {
      meshToDef.set(mesh.id, currentLayout.finOn.def);
      group.add(mesh);
    });
  }
  scene.add(group);
  frameCamera("iso");
}

/** frameCamera(preset): TOP/SIDE/FRONT/ISOMETRIC/RESET (spec §16). */
function frameCamera(preset) {
  if (!currentLayout) return;
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
  camera.position.copy(pos);
  controls.target.copy(target);
  controls.update();
}

function resize() {
  if (!initialized) return;
  const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
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
  if (hits.length && typeof window.showPartDetail === "function") {
    const def = meshToDef.get(hits[0].object.id);
    if (def) window.showPartDetail(def);
  }
}

function animate() {
  requestAnimationFrame(animate);
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

window.RSX = window.RSX || {};
window.RSX.assembly3d = {
  init,
  rebuild,
  frameCamera,
  resize,
  isInitialized: () => initialized,
};
