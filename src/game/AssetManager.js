import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AssetInspector } from "./AssetInspector.js";
import { WORLD_SCALE } from "./WorldLayout.js";

const COLLECTION_CATEGORIES = ["nature", "animals", "decorations", "villagers"];

/**
 * Loads the extracted Kinstead GLBs, caches them, and turns collection nodes
 * into reusable prototypes / instanced geometry.
 */
export class AssetManager {
  constructor({ baseUrl = "./assets/world/" } = {}) {
    this.baseUrl = baseUrl;
    this.loader = new GLTFLoader();
    this.manifest = null;
    this.glTFs = new Map();
    this.collections = new Map();
    this.buildings = new Map();
    this.terrain = null;
    this.failures = [];
    this._dummy = new THREE.Object3D();
    this._matrix = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._box = new THREE.Box3();
  }

  async load(onProgress = () => {}, { buildingIds = null } = {}) {
    this.manifest = await this._fetchJson(this.baseUrl + "manifest.json");
    const categories = this.manifest.categories || {};

    const jobs = [];

    const terrainItem = categories.terrain?.items?.[0];
    if (terrainItem) {
      jobs.push({
        key: "terrain",
        label: "Terrain",
        file: terrainItem.file,
      });
    }

    for (const category of COLLECTION_CATEGORIES) {
      const entry = categories[category];
      if (entry?.collection) {
        jobs.push({
          key: category,
          label: category,
          file: entry.collection,
        });
      }
    }

    const wanted = buildingIds ? new Set(buildingIds) : null;
    for (const item of categories.buildings?.items || []) {
      if (wanted && !wanted.has(item.id)) continue;
      jobs.push({
        key: "building:" + item.id,
        label: item.label,
        file: item.file,
      });
    }

    let done = 0;
    const total = jobs.length;
    onProgress(0, total, "Loading Kinstead assets");

    const CONCURRENCY = 4;
    let index = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () =>
      (async () => {
        while (index < jobs.length) {
          const currentIndex = index++;
          const job = jobs[currentIndex];
          try {
            const gltf = await this.loader.loadAsync(this._url(job.file));
            this.glTFs.set(job.key, gltf);
            if (job.key === "terrain") {
              this.terrain = gltf;
            } else if (job.key.startsWith("building:")) {
              this.buildings.set(job.key.slice("building:".length), gltf.scene);
            } else {
              this.collections.set(
                job.key,
                this._indexCollection(gltf.scene, job.key)
              );
            }
          } catch (error) {
            console.error("[Kinstead] gagal memuat", job.file, error);
            this.failures.push({ file: job.file, error: String(error) });
          } finally {
            done++;
            try {
              onProgress(done, total, job.label);
            } catch (e) {
              /* ignore */
            }
          }
        }
      })()
    );

    await Promise.allSettled(workers);

    this._verifyCollections();
    return this;
  }

  _url(relative) {
    return new URL(relative, document.baseURI).href;
  }

  async _fetchJson(relative) {
    const response = await fetch(this._url(relative));
    if (!response.ok) {
      throw new Error(`Could not fetch ${relative}: ${response.status}`);
    }
    return response.json();
  }

  _indexCollection(scene, category) {
    // Every collection has one wrapper node whose children are the assets.
    let wrapper = scene;
    if (scene.children.length === 1) wrapper = scene.children[0];

    let candidates = wrapper.children;
    if (candidates.length <= 1 && candidates[0]?.children?.length > 1) {
      candidates = candidates[0].children;
    }

    const canonical = new Map();
    const map = new Map();
    for (const child of candidates) {
      canonical.set(child.name, child);
      map.set(child.name, child);
      map.set(normalizeKey(child.name), child);
    }

    // The manifest uses friendly ids ("street-lamp"), labels ("Street Lamp")
    // and source node names ("Street_Lamp"). Register all spellings so callers
    // can use whichever is handy.
    for (const item of this._manifestEntries(category)) {
      const node =
        canonical.get(item.sourceNode) ||
        map.get(normalizeKey(item.sourceNode));
      if (!node) continue;
      map.set(item.id, node);
      map.set(normalizeKey(item.id), node);
      if (item.label) {
        map.set(item.label, node);
        map.set(normalizeKey(item.label), node);
      }
    }

    return { scene, wrapper, map, canonical };
  }

  _manifestEntries(category) {
    if (!this.manifest) return [];
    if (category === "villagers") return this.manifest.characters || [];
    return this.manifest.categories?.[category]?.items || [];
  }

  getCollectionEntries(category) {
    const collection = this.collections.get(category);
    if (!collection) return [];
    return this._manifestEntries(category)
      .map((item) => ({
        id: item.id,
        label: item.label,
        role: item.role ?? null,
        height: item.height ?? null,
        node:
          collection.map.get(item.sourceNode) ||
          collection.map.get(normalizeKey(item.sourceNode)) ||
          collection.map.get(item.id) ||
          collection.map.get(normalizeKey(item.id)) ||
          collection.canonical.get(item.sourceNode) ||
          null,
      }))
      .filter((entry) => entry.node);
  }

  _verifyCollections() {
    for (const [category, entry] of this.collections) {
      AssetInspector.logSummary(category, entry.wrapper);
    }
    console.info(
      `[Kinstead] loaded ${this.buildings.size} buildings, terrain: ${!!this.terrain}, failures: ${this.failures.length}`
    );
  }

  getCollectionNode(category, sourceNodeName) {
    const collection = this.collections.get(category);
    if (!collection) return null;
    return (
      collection.map.get(sourceNodeName) ||
      collection.map.get(normalizeKey(sourceNodeName)) ||
      null
    );
  }

  getCollectionNodes(category) {
    const collection = this.collections.get(category);
    if (!collection) return [];
    return [...collection.canonical.entries()].map(([name, node]) => ({
      name,
      node,
    }));
  }

  getBuilding(id) {
    return this.buildings.get(id) || null;
  }

  getBuildingIds() {
    return [...this.buildings.keys()];
  }

  /**
   * Clone a source node, centre it on X/Z, put its feet on Y=0 and scale it.
   * mode 'character' normalises the height instead of using the world scale.
   */
  makePrototype(source, options = {}) {
    const {
      mode = "world",
      scale = WORLD_SCALE,
      targetHeight = 1.72,
      castShadow = true,
      receiveShadow = true,
      clone = true,
    } = options;

    const model = clone ? source.clone(true) : source;
    model.position.set(0, 0, 0);

    const wrapper = new THREE.Group();
    wrapper.name = (source.name || "asset") + "_prototype";
    wrapper.add(model);
    wrapper.updateMatrixWorld(true);

    this._box.setFromObject(model);
    if (this._box.isEmpty()) {
      return { root: wrapper, size: new THREE.Vector3(), sourceSize: new THREE.Vector3() };
    }
    const size = this._box.getSize(new THREE.Vector3());
    const center = this._box.getCenter(new THREE.Vector3());

    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= this._box.min.y;
    wrapper.updateMatrixWorld(true);

    if (mode === "character") {
      const h = Math.max(size.y, 0.0001);
      wrapper.scale.setScalar(targetHeight / h);
    } else {
      wrapper.scale.setScalar(scale);
    }

    wrapper.userData.model = model;
    wrapper.userData.sourceSize = size.clone();
    wrapper.updateMatrixWorld(true);

    wrapper.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = castShadow;
      node.receiveShadow = receiveShadow;
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      for (const material of materials) {
        if (!material) continue;
        if (material.map) material.map.anisotropy = 4;
      }
    });

    const scaledBox = new THREE.Box3().setFromObject(wrapper);
    const scaledSize = scaledBox.getSize(new THREE.Vector3());

    return {
      root: wrapper,
      size: scaledSize,
      sourceSize: size,
    };
  }

  /**
   * Bake a prototype into instanced parts. The prototype sits at the origin,
   * so each mesh's matrixWorld is its local offset inside the asset.
   */
  makeInstancedParts(source, options = {}) {
    const prototype = this.makePrototype(source, {
      ...options,
      castShadow: false,
      receiveShadow: false,
    });
    prototype.root.updateMatrixWorld(true);

    const parts = [];
    prototype.root.traverse((node) => {
      if (!node.isMesh) return;
      parts.push({
        geometry: node.geometry,
        material: node.material,
        matrix: node.matrixWorld.clone(),
      });
    });
    return { parts, size: prototype.size };
  }

  /**
   * placements: [{x, y, z, rot, scale, castShadow?, receiveShadow?}]
   */
  createInstanced(parts, placements, options = {}) {
    const {
      scene,
      castShadow = true,
      receiveShadow = true,
      name = "instances",
      frustumCulled = false,
    } = options;
    if (!placements.length) return [];
    const meshes = [];

    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      const mesh = new THREE.InstancedMesh(
        part.geometry,
        part.material,
        placements.length
      );
      mesh.name = `${name}_part${p}`;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.frustumCulled = frustumCulled;

      for (let i = 0; i < placements.length; i++) {
        const placement = placements[i];
        this._dummy.position.set(placement.x, placement.y, placement.z);
        this._dummy.rotation.set(0, placement.rot ?? 0, 0);
        this._dummy.scale.setScalar(placement.scale ?? 1);
        this._dummy.updateMatrix();
        this._matrix.multiplyMatrices(this._dummy.matrix, part.matrix);
        mesh.setMatrixAt(i, this._matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  /** Load the catalogue metadata (used by the visual asset atlas). */
  async loadCatalog() {
    try {
      const response = await fetch(
        new URL("./asset-catalog.json", document.baseURI).href
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
