import * as THREE from "three";

/**
 * Offscreen renderer used for the character cards and the visual asset atlas.
 * Uses the already-loaded Kinstead models, so thumbnails are real renders of
 * the actual GLB assets rather than placeholders.
 */
export class ThumbnailRenderer {
  constructor(assets) {
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    });
    this.renderer.setPixelRatio(1.5);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 500);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x60705a, 2.1));
    const key = new THREE.DirectionalLight(0xfff1d8, 2.6);
    key.position.set(2.5, 4.5, 3.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd6ff, 1.1);
    rim.position.set(-3, 2, -2.5);
    this.scene.add(rim);

    this.cache = new Map();
  }

  _render(width, height) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  character(node, key = null, { width = 240, height = 300 } = {}) {
    if (key && this.cache.has(key)) return this.cache.get(key);

    const prototype = this.assets.makePrototype(node, {
      mode: "character",
      targetHeight: 1.75,
      castShadow: false,
      receiveShadow: false,
    });
    this.scene.add(prototype.root);

    this.camera.fov = 30;
    this.camera.position.set(0.6, 1.05, 3.5);
    this.camera.lookAt(0, 0.88, 0);
    const data = this._render(width, height);

    this.scene.remove(prototype.root);
    if (key) this.cache.set(key, data);
    return data;
  }

  asset(node, key = null, { width = 240, height = 240 } = {}) {
    if (key && this.cache.has(key)) return this.cache.get(key);

    const prototype = this.assets.makePrototype(node, {
      mode: "world",
      castShadow: false,
      receiveShadow: false,
    });
    const object = prototype.root;
    this.scene.add(object);
    object.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.5, 0.4);

    this.camera.fov = 30;
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (radius / Math.sin(fov / 2)) * 1.06;
    const dir = new THREE.Vector3(0.9, 0.65, 1.25).normalize();
    this.camera.position.copy(center).addScaledVector(dir, distance);
    this.camera.lookAt(center);

    const data = this._render(width, height);
    this.scene.remove(object);
    if (key) this.cache.set(key, data);
    return data;
  }

  dispose() {
    this.renderer.dispose();
  }
}
