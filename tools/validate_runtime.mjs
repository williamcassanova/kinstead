import fs from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AssetManager } from "../src/game/AssetManager.js";
import { HeightField } from "../src/game/HeightField.js";
import { sculptVillageTerrain } from "../src/game/TerrainSculptor.js";
import { CollisionSystem } from "../src/game/CollisionSystem.js";
import { CharacterAnimation } from "../src/game/CharacterAnimation.js";
import { CharacterController } from "../src/game/CharacterController.js";
import { CameraController } from "../src/game/CameraController.js";
import {
  WORLD_SCALE,
  WATER_LEVEL,
  FLATTEN,
  SPAWN_SOURCE,
  sourceToWorld,
  USED_BUILDING_IDS,
  BUILDING_LAYOUT,
  NPC_LAYOUT,
  ANIMAL_LAYOUT,
  PATH_LAYOUT,
} from "../src/game/WorldLayout.js";

const root = path.resolve(import.meta.dirname, "..");
const loader = new GLTFLoader();
let checks = 0;
const failures = [];

function ok(condition, message) {
  checks++;
  if (!condition) {
    failures.push(message);
    console.error("  FAIL:", message);
  }
}

function close(a, b, tolerance, message) {
  ok(Math.abs(a - b) <= tolerance, `${message} (${a} vs ${b})`);
}

function finiteVector(v, label) {
  ok(
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z),
    `${label} is finite`
  );
}

async function parseGLB(relative) {
  const file = path.join(root, relative);
  const buffer = await fs.readFile(file);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, "", resolve, reject);
  });
}

function findNode(scene, name) {
  let found = null;
  scene.traverse((node) => {
    if (!found && node.name === name) found = node;
  });
  return found;
}

function countMeshes(scene) {
  let count = 0;
  scene.traverse((node) => {
    if (node.isMesh) count++;
  });
  return count;
}

function checkBounds(scene, label) {
  const box = new THREE.Box3().setFromObject(scene);
  ok(!box.isEmpty(), `${label} has bounds`);
  const size = box.getSize(new THREE.Vector3());
  finiteVector(size, `${label} size`);
  ok(size.x > 0 && size.y > 0 && size.z > 0, `${label} has volume`);
  return size;
}

async function main() {
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "assets/world/manifest.json"), "utf8")
  );

  console.log("1. Parsing terrain and testing height field");
  const terrain = await parseGLB(manifest.categories.terrain.items[0].file);
  const surface = findNode(terrain.scene, "Terrain_Surface");
  ok(!!surface, "Terrain_Surface exists");
  ok(!!findNode(terrain.scene, "Water_Surface"), "Water_Surface exists");
  ok(countMeshes(terrain.scene) >= 4, "terrain has surface, sides and water");

  const offsetX = -24 * WORLD_SCALE;
  const offsetZ = -24 * WORLD_SCALE;
  let heightfield = HeightField.fromMesh(surface, {
    scale: WORLD_SCALE,
    offsetX,
    offsetZ,
  });
  ok(heightfield.n === 241, "height grid is 241 x 241");
  const spawnWorld = sourceToWorld(SPAWN_SOURCE.x, SPAWN_SOURCE.z);
  const spawnBefore = heightfield.sample(spawnWorld.x, spawnWorld.z);
  ok(Number.isFinite(spawnBefore), "spawn height is finite");

  const centerWorld = sourceToWorld(FLATTEN.center.x, FLATTEN.center.z);
  const centerBefore = heightfield.sample(centerWorld.x, centerWorld.z);
  const target = sculptVillageTerrain(surface, heightfield, manifest, {
    scale: WORLD_SCALE,
    offsetX,
    offsetZ,
  });
  heightfield = HeightField.fromMesh(surface, {
    scale: WORLD_SCALE,
    offsetX,
    offsetZ,
  });
  const centerAfter = heightfield.sample(centerWorld.x, centerWorld.z);
  close(centerAfter, target, 0.05, "village centre is levelled to the target");
  let nan = 0;
  let waterSamples = 0;
  let waterChanged = 0;
  for (let i = 0; i < heightfield.heights.length; i += 97) {
    if (Number.isNaN(heightfield.heights[i])) nan++;
  }
  for (let x = heightfield.originX; x < heightfield.maxX; x += 8) {
    for (let z = heightfield.originZ; z < heightfield.maxZ; z += 8) {
      const h = heightfield.sample(x, z);
      if (h === null) continue;
      if (h < WATER_LEVEL - 0.2) waterSamples++;
      if (h < WATER_LEVEL - 1.0) {
        const before = heightfield.sample(x, z);
        if (Math.abs(before - h) > 1) waterChanged++;
      }
    }
  }
  ok(nan === 0, "height field has no NaN samples");
  ok(waterSamples > 0, "river bed remains below water level");

  const sizeById = new Map(
    manifest.categories.buildings.items.map((item) => [item.id, item.size])
  );
  let steep = 0;
  let submerged = 0;
  for (const entry of BUILDING_LAYOUT) {
    const point = sourceToWorld(entry.x, entry.z);
    const height = heightfield.sample(point.x, point.z);
    if (height === null || height < WATER_LEVEL + 0.5) {
      submerged++;
      continue;
    }
    const size = sizeById.get(entry.id);
    if (!size) continue;
    const halfX = (size[0] * WORLD_SCALE) / 2;
    const halfZ = (size[2] * WORLD_SCALE) / 2;
    const cos = Math.cos(entry.rot);
    const sin = Math.sin(entry.rot);
    const heights = [];
    for (const [lx, lz] of [
      [0, 0],
      [halfX, halfZ],
      [-halfX, halfZ],
      [halfX, -halfZ],
      [-halfX, -halfZ],
    ]) {
      const wx = point.x + lx * cos + lz * sin;
      const wz = point.z - lx * sin + lz * cos;
      heights.push(heightfield.sample(wx, wz));
    }
    if (Math.max(...heights) - Math.min(...heights) > 0.7) steep++;
  }
  ok(submerged === 0, "no building sits in water");
  ok(steep === 0, "every building footprint is level enough to stand on");

  const buildingOBBs = BUILDING_LAYOUT.map((entry) => {
    const size = sizeById.get(entry.id);
    const point = sourceToWorld(entry.x, entry.z);
    return {
      id: entry.id,
      x: point.x,
      z: point.z,
      halfX: size ? (size[0] * WORLD_SCALE) / 2 : 0,
      halfZ: size ? (size[2] * WORLD_SCALE) / 2 : 0,
      cos: Math.cos(entry.rot),
      sin: Math.sin(entry.rot),
    };
  });
  const pointInOBB = (x, z, box, margin = 0) => {
    const dx = x - box.x;
    const dz = z - box.z;
    const lx = dx * box.cos + dz * box.sin;
    const lz = -dx * box.sin + dz * box.cos;
    return (
      Math.abs(lx) <= box.halfX + margin &&
      Math.abs(lz) <= box.halfZ + margin
    );
  };
  const obbAxes = (box) => [
    { x: box.cos, y: box.sin },
    { x: -box.sin, y: box.cos },
  ];
  const obbCorners = (box) => {
    const corners = [];
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const lx = box.halfX * sx;
      const lz = box.halfZ * sz;
      corners.push({
        x: box.x + lx * box.cos - lz * box.sin,
        y: box.z + lx * box.sin + lz * box.cos,
      });
    }
    return corners;
  };
  const overlap2D = (a, b) => {
    for (const axis of [...obbAxes(a), ...obbAxes(b)]) {
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const point of obbCorners(a)) {
        const d = point.x * axis.x + point.y * axis.y;
        aMin = Math.min(aMin, d);
        aMax = Math.max(aMax, d);
      }
      for (const point of obbCorners(b)) {
        const d = point.x * axis.x + point.y * axis.y;
        bMin = Math.min(bMin, d);
        bMax = Math.max(bMax, d);
      }
      if (aMax <= bMin || bMax <= aMin) return false;
    }
    return true;
  };
  let buildingOverlaps = 0;
  for (let i = 0; i < buildingOBBs.length; i++) {
    for (let j = i + 1; j < buildingOBBs.length; j++) {
      if (overlap2D(buildingOBBs[i], buildingOBBs[j])) {
        console.error(
          "  overlap:",
          buildingOBBs[i].id,
          "<->",
          buildingOBBs[j].id
        );
        buildingOverlaps++;
      }
    }
  }
  ok(buildingOverlaps === 0, "no two building footprints overlap");

  const blockedAt = (x, z, margin = 0.2) =>
    buildingOBBs.some((box) => pointInOBB(x, z, box, margin));
  const spawnGround = heightfield.sample(spawnWorld.x, spawnWorld.z);
  ok(
    spawnGround !== null && spawnGround > WATER_LEVEL + 0.5,
    "spawn point is on dry land"
  );
  ok(!blockedAt(spawnWorld.x, spawnWorld.z, 0.5), "spawn point is not inside a building");

  let badNPCs = 0;
  const npcWalkable = (x, z) =>
    !blockedAt(x, z, 0.25) &&
    (() => {
      const ground = heightfield.sample(x, z);
      return ground !== null && ground >= WATER_LEVEL + 0.3;
    })();
  for (const npc of NPC_LAYOUT) {
    const route = [[npc.x, npc.z], ...npc.wander].map(([x, z]) =>
      sourceToWorld(x, z)
    );
    for (let i = 0; i < route.length; i++) {
      const a = route[i];
      const b = route[(i + 1) % route.length];
      const segments = Math.ceil(
        Math.hypot(b.x - a.x, b.z - a.z) / 4
      );
      for (let step = 0; step <= segments; step++) {
        const t = segments === 0 ? 0 : step / segments;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (!npcWalkable(x, z)) {
          console.error(
            "  bad npc path:",
            npc.id,
            i,
            step,
            (x / WORLD_SCALE + 24).toFixed(2),
            (z / WORLD_SCALE + 24).toFixed(2)
          );
          badNPCs++;
          break;
        }
      }
    }
  }
  ok(badNPCs === 0, "NPC routes stay on walkable ground");

  let badAnimals = 0;
  for (const animal of ANIMAL_LAYOUT) {
    const point = sourceToWorld(animal.x, animal.z);
    const ground = heightfield.sample(point.x, point.z);
    const duck = animal.id === "duck";
    if (
      ground === null ||
      (!duck && ground < WATER_LEVEL + 0.25) ||
      blockedAt(point.x, point.z, 0.2)
    ) {
      console.error("  bad animal point:", animal.id, animal.x, animal.z);
      badAnimals++;
    }
  }
  ok(badAnimals === 0, "animals spawn on walkable or intended water ground");

  let badPath = 0;
  for (const path of PATH_LAYOUT) {
    const curve = new THREE.CatmullRomCurve3(
      path.points.map((p) => new THREE.Vector3(p.x, 0, p.z)),
      false,
      "catmullrom",
      0.2
    );
    const divisions = Math.max(16, Math.ceil(curve.getLength() / 2));
    for (const point of curve.getSpacedPoints(divisions)) {
      const ground = heightfield.sample(point.x, point.z);
      const blocked = buildingOBBs.some((box) =>
        pointInOBB(point.x, point.z, box, 0.2)
      );
      if (ground === null || ground < WATER_LEVEL + 0.15 || blocked) {
        console.error(
          "  bad path point:",
          path.id,
          (point.x / WORLD_SCALE + 24).toFixed(2),
          (point.z / WORLD_SCALE + 24).toFixed(2),
          ground === null ? "null" : ground.toFixed(2)
        );
        badPath++;
        break;
      }
    }
  }
  ok(badPath === 0, "paths stay on dry, unblocked ground");

  console.log("2. Parsing all building GLBs");
  const buildingItems = manifest.categories.buildings.items;
  const buildingMeshes = [];
  for (const item of buildingItems) {
    const gltf = await parseGLB(item.file);
    const meshes = countMeshes(gltf.scene);
    ok(meshes > 0, `${item.id} has meshes`);
    const size = checkBounds(gltf.scene, item.id);
    ok(size.y > 0.05, `${item.id} has height`);
    buildingMeshes.push(gltf.scene);
  }
  ok(
    buildingMeshes.length === buildingItems.length,
    `parsed all ${buildingItems.length} building files`
  );
  const manifestBuildingIds = new Set(buildingItems.map((item) => item.id));
  ok(
    USED_BUILDING_IDS.every((id) => manifestBuildingIds.has(id)),
    "every building used by the layout exists in the manifest"
  );
  ok(USED_BUILDING_IDS.length === 36, "layout uses 36 unique buildings");

  console.log("3. Parsing collections and testing id aliases");
  const manager = new AssetManager();
  manager.manifest = manifest;
  for (const category of ["nature", "animals", "decorations", "villagers"]) {
    const entry = manifest.categories[category];
    const gltf = await parseGLB(entry.collection);
    const index = manager._indexCollection(gltf.scene, category);
    manager.collections.set(category, index);
    const expected = category === "villagers" ? manifest.characters.length : entry.items.length;
    ok(index.canonical.size === expected, `${category} has ${expected} nodes`);
  }

  ok(
    manager.getCollectionNode("decorations", "street-lamp")?.name === "Street_Lamp",
    "decoration alias street-lamp resolves"
  );
  ok(
    manager.getCollectionNode("decorations", "wood-fence")?.name === "Wood_Fence",
    "decoration alias wood-fence resolves"
  );
  ok(
    manager.getCollectionNode("decorations", "Street Lamp")?.name === "Street_Lamp",
    "decoration label alias resolves"
  );
  ok(
    manager.getCollectionNode("villagers", "villager-farmer-1007")?.name ===
      "Villager_farmer_1007",
    "villager alias resolves"
  );
  ok(
    manager.getCollectionNode("animals", "deer")?.name === "DEER",
    "animal alias resolves"
  );
  ok(
    manager.getCollectionNode("nature", "round-tree")?.name === "round_tree",
    "nature alias resolves"
  );
  ok(
    manager.getCollectionEntries("villagers").length === 30,
    "30 villagers are available for the character picker"
  );
  ok(
    manager.getCollectionEntries("decorations").length === 14,
    "all 14 decoration assets are exposed to the atlas"
  );
  ok(
    manager.getCollectionEntries("nature").length === 10,
    "all 10 nature assets are exposed to the atlas"
  );
  ok(
    manager.getCollectionEntries("animals").length === 7,
    "all 7 animal species are exposed to the atlas"
  );

  console.log("4. Building and animating a character prototype");
  const villagerNode = manager.getCollectionNode("villagers", "villager-farmer-1007");
  ok(!!villagerNode, "farmer 1007 exists");
  const prototype = manager.makePrototype(villagerNode, {
    mode: "character",
    targetHeight: 1.72,
  });
  finiteVector(prototype.size, "character size");
  close(prototype.size.y, 1.72, 0.02, "character normalised to 1.72 m");
  const box = new THREE.Box3().setFromObject(prototype.root);
  close(box.min.y, 0, 0.02, "character feet sit on Y=0");
  ok(!!prototype.root.userData.model, "prototype exposes its model");

  const animation = new CharacterAnimation(prototype.root);
  const animationResult = animation.inspect ? animation.inspect() : null;
  animation.update(0.016, { speed: 0, running: false, grounded: true });
  let leftLeg = null;
  prototype.root.traverse((node) => {
    if (!leftLeg && /^Leg[._-]?\d*$/.test(node.name)) leftLeg = node;
  });
  ok(!!leftLeg, "villager has a Leg node");
  const legBefore = leftLeg.quaternion.clone();
  for (let i = 0; i < 90; i++) {
    animation.update(1 / 60, { speed: 5, running: false, grounded: true });
  }
  ok(!legBefore.equals(leftLeg.quaternion), "procedural animation rotates the legs");
  ok(
    Number.isFinite(leftLeg.quaternion.x) &&
      Number.isFinite(leftLeg.quaternion.w),
    "animated quaternion is finite"
  );

  console.log("5. Testing collision, camera and character motor");
  const collision = new CollisionSystem({
    heightAt: () => 0,
    waterLevel: WATER_LEVEL,
    bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  });
  collision.addBox({
    x: 0,
    z: 0,
    halfX: 2,
    halfZ: 2,
    rotation: 0,
    topY: 4,
    name: "test-box",
  });
  const pushed = new THREE.Vector3(1, 0, 0);
  collision.resolveCircle(pushed, 0.5);
  ok(pushed.x > 2.4, "circle is pushed out of a box");
  ok(
    collision.isBlockedXZ(1.5, 1.5, 0.1),
    "box blocks points inside its footprint"
  );
  const from = new THREE.Vector3(0, 2, 0);
  const to = new THREE.Vector3(10, 2, 0);
  const clearance = collision.cameraClearance(from, to, 0.3);
  ok(clearance < 1, "camera clearance stops at an obstacle");
  ok(clearance > 0, "camera clearance keeps a minimum distance");

  const motor = new CharacterController({
    model: prototype.root,
    animation,
    collision,
    spawn: { x: 0, y: 0, z: 0, heading: 0 },
    walkSpeed: 5,
    runSpeed: 9,
  });
  motor.input.x = 0;
  motor.input.y = 1;
  for (let i = 0; i < 180; i++) motor.update(1 / 60, 0);
  ok(motor.position.z < -3, "character moves forward relative to camera");
  ok(motor.grounded, "character stays grounded on flat terrain");
  finiteVector(motor.position, "character position");

  motor.requestJump();
  motor.update(1 / 60, 0);
  ok(!motor.grounded, "jump lifts the character off the ground");
  for (let i = 0; i < 200; i++) motor.update(1 / 60, 0);
  ok(motor.grounded, "character lands again");

  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 500);
  const cameraController = new CameraController({
    camera,
    collision,
    settings: { sensitivity: 1, invertY: false },
  });
  cameraController.snapTo(motor.position);
  for (let i = 0; i < 30; i++) cameraController.update(1 / 60, motor.position);
  finiteVector(camera.position, "camera position");
  ok(camera.position.distanceTo(motor.position) > 1, "camera follows the player");

  console.log("6. Smoke-testing animal / decoration prototypes");
  for (const entry of manager.getCollectionEntries("animals")) {
    const proto = manager.makePrototype(entry.node, { scale: WORLD_SCALE });
    checkBounds(proto.root, "animal " + entry.id);
  }
  for (const entry of manager.getCollectionEntries("decorations")) {
    const proto = manager.makePrototype(entry.node, { scale: WORLD_SCALE });
    checkBounds(proto.root, "decoration " + entry.id);
  }

  console.log(
    `\n${checks - failures.length}/${checks} checks passed` +
      (failures.length ? `, ${failures.length} failed` : "")
  );
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Validation crashed:", error);
  process.exitCode = 1;
});
