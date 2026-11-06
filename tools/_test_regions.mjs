import fs from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AssetManager } from "../src/game/AssetManager.js";
import { HeightField } from "../src/game/HeightField.js";
import { sculptVillageTerrain } from "../src/game/TerrainSculptor.js";
import { CollisionSystem } from "../src/game/CollisionSystem.js";
import { RegionWorld, SETTLEMENTS, ROADS, RIVER_CURVES, LAKES, REGION_SIZE, isCoreRegion } from "../src/game/WorldRegions.js";
import { WORLD_SCALE, WATER_LEVEL, sourceToWorld } from "../src/game/WorldLayout.js";

const root = path.resolve(import.meta.dirname, "..");
const loader = new GLTFLoader();
const manifest = JSON.parse(await fs.readFile(path.join(root, "assets/world/manifest.json"), "utf8"));

async function parseGLB(relative) {
  const file = path.join(root, relative);
  const buffer = await fs.readFile(file);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Promise((resolve, reject) => loader.parse(arrayBuffer, "", resolve, reject));
}

console.log("parse terrain");
const terrain = await parseGLB(manifest.categories.terrain.items[0].file);
let surface = null;
terrain.scene.traverse(n => { if (n.name === "Terrain_Surface") surface = n; });
const hf = HeightField.fromMesh(surface, { scale: WORLD_SCALE, offsetX: -240, offsetZ: -240 });
sculptVillageTerrain(surface, hf, manifest, { scale: WORLD_SCALE, offsetX: -240, offsetZ: -240 });
const heightfield = HeightField.fromMesh(surface, { scale: WORLD_SCALE, offsetX: -240, offsetZ: -240 });

console.log("parse assets");
const manager = new AssetManager();
manager.manifest = manifest;
for (const category of ["nature", "animals", "decorations", "villagers"]) {
  const entry = manifest.categories[category];
  const gltf = await parseGLB(entry.collection);
  manager.collections.set(category, manager._indexCollection(gltf.scene, category));
}
for (const item of manifest.categories.buildings.items) {
  const gltf = await parseGLB(item.file);
  manager.buildings.set(item.id, gltf.scene);
}

const scene = new THREE.Scene();
const collision = new CollisionSystem({
  heightAt: (x, z) => region.heightAt(x, z),
  waterLevel: WATER_LEVEL,
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
});
let region;
region = new RegionWorld({ scene, assets: manager, collision, heightfield, quality: "medium" });
console.log("stats pre", region.getStats());

// Height samples
let nan = 0, min = Infinity, max = -Infinity;
for (let x = -2600; x <= 2600; x += 130) {
  for (let z = -2600; z <= 2600; z += 130) {
    const h = region.heightAt(x, z);
    if (!Number.isFinite(h)) nan++;
    min = Math.min(min, h); max = Math.max(max, h);
  }
}
console.log("height", { nan, min, max });

// border continuity with core
let worst = 0;
for (let t = -240; t <= 240; t += 40) {
  for (const [x, z] of [[240, t], [-240, t], [t, 240], [t, -240]]) {
    const hfH = heightfield.sampleClamped(x, z);
    const regionH = region.heightAt(x, z);
    worst = Math.max(worst, Math.abs(hfH - regionH));
  }
}
console.log("border worst", worst);

// settlements flat
for (const s of SETTLEMENTS) {
  const heights = [];
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    for (const r of [0, s.radius * 0.5, s.radius * 0.85]) {
      heights.push(region.groundHeightAt(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r));
    }
  }
  const spread = Math.max(...heights) - Math.min(...heights);
  if (spread > 1.6) console.log("settlement not flat", s.id, spread);
}
console.log("bridges", region.bridges.length, "plazas", region.plazas.length, "buildings", region.buildings.length);

// build around spawn
const spawn = sourceToWorld(27.2, 42.4);
region.warmup(spawn.x, spawn.z, 1);
console.log("stats after warmup", region.getStats(), "colliders", collision.boxes.length, collision.circles.length);

// walk into outer regions
for (let step = 0; step < 12; step++) {
  const px = 200 + step * 120;
  const pz = 200 + step * 60;
  region.update(1 / 60, { x: px, z: pz });
  region._processQueue(99);
}
console.log("stats after travel", region.getStats(), "area", region.areaAt(1400, 900), "colliders", collision.boxes.length, collision.circles.length);

// Check road/water meshes exist in one region
const sampleKeys = [...region.loaded.keys()].slice(0, 5);
for (const key of sampleKeys) {
  const g = region.loaded.get(key).group;
  const names = [];
  g.traverse(n => { if (n.isMesh) names.push(n.name); });
  console.log("region", key, "meshes", names.length, names.slice(0, 8));
}

region.setQuality("low");
console.log("stats low", region.getStats());
region.dispose();
console.log("done");
