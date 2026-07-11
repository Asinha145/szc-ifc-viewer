/**
 * three.js scene, cameras, controls and per-element display state.
 *
 * - IFC is Z-up, so camera.up is +Z (except plan views, where the up vector
 *   must not be parallel to the view direction).
 * - Perspective and orthographic cameras coexist; toggling swaps which one
 *   the single OrbitControls instance drives, syncing position/target/size.
 * - Selection highlight = material swap to one shared "selected" material;
 *   hide = mesh.visible. Both are O(changed elements), no geometry rebuilds.
 */
import * as THREE from "three";
import { OrbitControls } from "../../lib/OrbitControls.js";

const ISO_DIR = new THREE.Vector3(1, -1, 1).normalize();

const VIEW_DIRS = {
  top: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  bottom: { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
  left: { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
  right: { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
  front: { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  back: { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
  iso: { dir: ISO_DIR, up: new THREE.Vector3(0, 0, 1) },
};

export class Viewer {
  constructor(container) {
    this.container = container;
    this.meshes = new Map(); // expressID -> THREE.Mesh
    this.modelCenter = new THREE.Vector3();
    this.modelRadius = 10;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e2126);

    this.materials = {
      baseOpaque: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      baseTransparent: new THREE.MeshLambertMaterial({
        vertexColors: true, side: THREE.DoubleSide,
        transparent: true, opacity: 0.45, depthWrite: false,
      }),
      selected: new THREE.MeshLambertMaterial({
        color: 0x2f8ef7, emissive: 0x2f8ef7, emissiveIntensity: 0.5, side: THREE.DoubleSide,
      }),
    };

    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    this.perspCamera = new THREE.PerspectiveCamera(50, w / h, 0.01, 10000);
    this.orthoCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, -10000, 10000);
    this.perspCamera.up.set(0, 0, 1);
    this.orthoCamera.up.set(0, 0, 1);
    this.camera = this.perspCamera;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.0));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dir1.position.set(1, -1, 2);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dir2.position.set(-1, 1, -0.5);
    this.scene.add(dir1, dir2);

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);

    this.raycaster = new THREE.Raycaster();

    new ResizeObserver(() => this.#onResize()).observe(container);

    const animate = () => {
      requestAnimationFrame(animate);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  get isOrthographic() { return this.camera === this.orthoCamera; }

  #onResize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.perspCamera.aspect = w / h;
    this.perspCamera.updateProjectionMatrix();
    this.#fitOrthoFrustum();
  }

  // ---------- model ----------

  setModel(meshes, bbox) {
    this.clearModel();
    this.meshes = meshes;
    for (const mesh of meshes.values()) this.modelGroup.add(mesh);
    bbox.getCenter(this.modelCenter);
    this.modelRadius = Math.max(bbox.getSize(new THREE.Vector3()).length() / 2, 0.1);
    this.setStandardView("iso");
  }

  clearModel() {
    for (const mesh of this.meshes.values()) {
      this.modelGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes = new Map();
  }

  // ---------- cameras / views ----------

  #fitDistance() {
    return (this.modelRadius / Math.tan(THREE.MathUtils.degToRad(this.perspCamera.fov / 2))) * 1.2;
  }

  #fitOrthoFrustum() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const aspect = w / h;
    const dist = this.camera.position.distanceTo(this.controls.target);
    const halfH = Math.max(dist * Math.tan(THREE.MathUtils.degToRad(this.perspCamera.fov / 2)), 0.01);
    this.orthoCamera.top = halfH;
    this.orthoCamera.bottom = -halfH;
    this.orthoCamera.left = -halfH * aspect;
    this.orthoCamera.right = halfH * aspect;
    this.orthoCamera.zoom = this.isOrthographic ? this.orthoCamera.zoom : 1;
    this.orthoCamera.updateProjectionMatrix();
  }

  setStandardView(name) {
    const view = VIEW_DIRS[name];
    if (!view) return;
    const dist = this.#fitDistance();
    const pos = this.modelCenter.clone().addScaledVector(view.dir, dist);
    for (const cam of [this.perspCamera, this.orthoCamera]) {
      cam.up.copy(view.up);
      cam.position.copy(pos);
      cam.lookAt(this.modelCenter);
    }
    this.controls.target.copy(this.modelCenter);
    this.orthoCamera.zoom = 1;
    this.#fitOrthoFrustum();
    this.controls.update();
  }

  /** Swaps perspective <-> orthographic, preserving position and target. */
  toggleProjection() {
    const from = this.camera;
    const to = this.isOrthographic ? this.perspCamera : this.orthoCamera;
    to.position.copy(from.position);
    to.up.copy(from.up);
    this.camera = to;
    if (this.isOrthographic) {
      this.orthoCamera.zoom = 1;
      this.#fitOrthoFrustum();
    } else {
      this.perspCamera.updateProjectionMatrix();
    }
    this.controls.object = to;
    this.controls.update();
    return this.isOrthographic ? "Orthographic" : "Perspective";
  }

  // ---------- display state ----------

  applySelection(selection) {
    for (const mesh of this.meshes.values()) {
      const wanted = selection.has(mesh.userData.expressID)
        ? this.materials.selected
        : mesh.userData.baseMaterial;
      if (mesh.material !== wanted) mesh.material = wanted;
    }
  }

  applyVisibility(hidden) {
    for (const mesh of this.meshes.values()) {
      mesh.visible = !hidden.has(mesh.userData.expressID);
    }
  }

  // ---------- queries used by picking ----------

  /** Raycast at client coords; returns expressID or null. Hidden meshes excluded. */
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const visible = [...this.meshes.values()].filter((m) => m.visible);
    const hits = this.raycaster.intersectObjects(visible, false);
    return hits.length ? hits[0].object.userData.expressID : null;
  }

  /**
   * Elements whose projected screen-space AABB intersects the marquee
   * rectangle (client coords). Hidden elements are excluded.
   */
  elementsInRect(x1, y1, x2, y2) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const [minX, maxX] = x1 < x2 ? [x1, x2] : [x2, x1];
    const [minY, maxY] = y1 < y2 ? [y1, y2] : [y2, y1];

    this.camera.updateMatrixWorld();
    const corners = new Array(8).fill().map(() => new THREE.Vector3());
    const result = [];

    for (const mesh of this.meshes.values()) {
      if (!mesh.visible) continue;
      const bb = mesh.geometry.boundingBox;
      if (!bb) continue;

      let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
      let behind = 0;
      let c = 0;
      for (const x of [bb.min.x, bb.max.x])
        for (const y of [bb.min.y, bb.max.y])
          for (const z of [bb.min.z, bb.max.z])
            corners[c++].set(x, y, z);

      for (const corner of corners) {
        const v = corner.clone().project(this.camera);
        if (v.z > 1) { behind++; continue; } // beyond far plane / behind camera
        const sx = rect.left + ((v.x + 1) / 2) * rect.width;
        const sy = rect.top + ((1 - v.y) / 2) * rect.height;
        sMinX = Math.min(sMinX, sx); sMaxX = Math.max(sMaxX, sx);
        sMinY = Math.min(sMinY, sy); sMaxY = Math.max(sMaxY, sy);
      }
      if (behind === 8) continue;

      const intersects = sMaxX >= minX && sMinX <= maxX && sMaxY >= minY && sMinY <= maxY;
      if (intersects) result.push(mesh.userData.expressID);
    }
    return result;
  }
}
