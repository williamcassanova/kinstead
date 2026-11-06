import * as THREE from "three";
import { WORLD_SCALE, WATER_LEVEL } from "./WorldLayout.js";

/**
 * KINSTEAD large-world layer.
 *
 * The hand-built GLB village is the permanent heart of the world (a 480 m
 * square). Everything around it is generated on a deterministic 240 m region
 * grid. Regions are streamed around the player, their terrain is sampled from
 * the same continuous height function used by collision, and their contents
 * are cached as plain data so unloading never changes the world.
 *
 * The grid is intentionally independent from the Kinstead tile grid: a future
 * historical whole-Earth map can replace SETTLEMENTS, RIVER_CURVES and
 * biomeAt() with real geography while keeping the streaming code intact.
 */

export const REGION_SIZE = 240;
export const WORLD_REGION_LIMIT = 12;
export const WORLD_HALF_EXTENT = WORLD_REGION_LIMIT * REGION_SIZE;
export const CORE_HALF = 240;

export const STREAM_RADIUS = { high: 3, medium: 2, low: 1 };
const LOD_NEAR = 1;
const LOD_MID = 2;

const CORE_MIN_INDEX = -CORE_HALF / REGION_SIZE;
const CORE_MAX_INDEX = CORE_HALF / REGION_SIZE - 1;

const SEED = 0x1914c0de;

// ---------------------------------------------------------------------------
// Historical settlements around Kinstead. Distances are metres in world space.
// Every building list is limited to the 1900s rural / market-town vocabulary
// of the existing GLB library.
// ---------------------------------------------------------------------------
export const SETTLEMENTS = [
  {
    id: "maribel",
    name: "Desa Maribel",
    x: 660,
    z: -300,
    radius: 80,
    pool: ["house", "villa", "bakery", "chapel", "grocer", "well", "garden", "orchard"],
  },
  {
    id: "bram",
    name: "Dusun Bram",
    x: -720,
    z: 520,
    radius: 84,
    pool: ["farm", "house", "inn", "allotment", "well", "workshop", "orchard"],
  },
  {
    id: "edwin",
    name: "Kota Edwin",
    x: 1150,
    z: 650,
    radius: 105,
    pool: ["townhall", "market", "terrace", "stationer", "coffeehouse", "school", "clinic", "well", "house"],
  },
  {
    id: "nell",
    name: "Desa Nell",
    x: -1180,
    z: -700,
    radius: 82,
    pool: ["fishery", "house", "inn", "watermill", "vicarage", "well", "garden"],
  },
  {
    id: "cato",
    name: "Pos Cato",
    x: 380,
    z: -1180,
    radius: 74,
    pool: ["lumber", "workshop", "house", "builder", "farm", "well"],
  },
  {
    id: "rose",
    name: "Desa Rose",
    x: -420,
    z: 1250,
    radius: 78,
    pool: ["rosegarden", "house", "chapel", "garden", "bakery", "well", "orchard"],
  },
  {
    id: "hal",
    name: "Kota Hal",
    x: 1450,
    z: 150,
    radius: 96,
    pool: ["market", "house", "flats", "tavern", "bakery", "watchhouse", "library", "well", "statue"],
  },
  {
    id: "ada",
    name: "Dusun Ada",
    x: -1450,
    z: 120,
    radius: 72,
    pool: ["house", "farm", "allotment", "well", "grocer", "garden"],
  },
  {
    id: "tomas",
    name: "Desa Tomas",
    x: 600,
    z: 1650,
    radius: 80,
    pool: ["farm", "house", "orchard", "fishery", "well", "inn", "allotment"],
  },
  {
    id: "pike",
    name: "Kota Pike",
    x: -1500,
    z: 1750,
    radius: 88,
    pool: ["chapel", "school", "house", "market", "garden", "vicarage", "well"],
  },
];

// Roads connect the old village to the surrounding 1914 settlements. The
// first point of each route sits on the Kinstead terrain border so the dirt
// tracks meet the existing village lanes without cutting through buildings.
export const ROADS = [
  { id: "jalan-maribel", width: 5.4, points: [[240, -150], [380, -225], [520, -275], [660, -300]] },
  { id: "jalan-bram", width: 5.2, points: [[-240, 190], [-390, 310], [-560, 420], [-720, 520]] },
  { id: "jalan-cato", width: 5.0, points: [[175, -240], [250, -500], [315, -850], [380, -1180]] },
  { id: "jalan-nell", width: 5.0, points: [[-145, -240], [-440, -420], [-840, -610], [-1180, -700]] },
  { id: "jalan-edwin", width: 5.8, points: [[240, 140], [520, 300], [860, 480], [1150, 650]] },
  { id: "jalan-rose", width: 5.0, points: [[-150, 240], [-260, 600], [-380, 950], [-420, 1250]] },
  { id: "jalan-hal", width: 6.2, points: [[240, 20], [610, 60], [1010, 100], [1450, 150]] },
  { id: "jalan-ada", width: 5.2, points: [[-240, 5], [-650, 40], [-1050, 80], [-1450, 120]] },
  { id: "jalan-tomas", width: 5.3, points: [[130, 240], [270, 700], [440, 1200], [600, 1650]] },
  { id: "jalan-pike", width: 5.3, points: [[-155, 240], [-600, 800], [-1100, 1320], [-1500, 1750]] },
  { id: "jalan-utara", width: 4.6, points: [[660, -300], [560, -720], [430, -980], [380, -1180]] },
  { id: "jalan-timur", width: 5.2, points: [[660, -300], [980, -120], [1250, 40], [1450, 150]] },
  { id: "jalan-selatan", width: 5.0, points: [[1150, 650], [900, 1080], [680, 1400], [600, 1650]] },
  { id: "jalan-barat", width: 4.8, points: [[-1450, 120], [-1100, 325], [-880, 430], [-720, 520]] },
  { id: "jalan-pesisir", width: 4.8, points: [[-420, 1250], [-920, 1500], [-1220, 1660], [-1500, 1750]] },
  { id: "jalan-lembah", width: 4.7, points: [[1150, 650], [760, 420], [380, 250], [240, 20]] },
];

// Broad, slow rivers. Their banks are carved by groundHeightAt(), so bridges
// and roads always know exactly where the water is.
export const RIVER_CURVES = [
  {
    id: "sungai-utara",
    width: 9,
    points: [
      [-2400, -1200], [-1800, -900], [-1350, -1000], [-900, -720],
      [-450, -780], [0, -520], [600, -650], [1200, -450],
      [1800, -650], [2400, -500],
    ],
  },
  {
    id: "sungai-selatan",
    width: 8,
    points: [
      [-2300, 1300], [-1850, 1050], [-1400, 1150], [-950, 900],
      [-450, 1000], [100, 800], [650, 1050], [1200, 900],
      [1700, 1150], [2300, 950],
    ],
  },
  {
    id: "sungai-timur",
    width: 7,
    points: [
      [2100, -1800], [1900, -1100], [2000, -400], [1700, 150],
      [1900, 700], [1750, 1400], [1950, 2200],
    ],
  },
  {
    id: "sungai-barat",
    width: 7,
    points: [
      [-2200, -2000], [-1950, -1300], [-2100, -600], [-1800, -50],
      [-1950, 500], [-1750, 1100], [-1950, 1800],
    ],
  },
];

export const LAKES = [
  { id: "danau-biru", x: -930, z: -1420, radius: 150 },
  { id: "danau-hijau", x: 1080, z: 310, radius: 110 },
  { id: "danau-perak", x: -1260, z: 900, radius: 95 },
];

const BIOME_LABELS = {
  padang: "Padang Rumput",
  hutan: "Hutan",
  ladang: "Ladang Pertanian",
  perbukitan: "Perbukitan",
  pegunungan: "Pegunungan",
};

const DIRECTION_LABELS = [
  "Utara", "Timur Laut", "Timur", "Tenggara",
  "Selatan", "Barat Daya", "Barat", "Barat Laut",
];

const NATURE_TYPES = [
  { id: "pine", near: 34, mid: 16, far: 7, scale: [0.85, 1.45], clear: 3.4, slope: 0.9, cast: true },
  { id: "round-tree", near: 30, mid: 14, far: 6, scale: [0.9, 1.45], clear: 3.2, slope: 0.8, cast: true },
  { id: "birch-tree", near: 20, mid: 10, far: 4, scale: [0.9, 1.3], clear: 3.0, slope: 0.8, cast: true },
  { id: "bush", near: 26, mid: 12, far: 0, scale: [0.8, 1.5], clear: 1.6, slope: 1.2, cast: true },
  { id: "rock", near: 14, mid: 8, far: 3, scale: [0.8, 1.8], clear: 1.4, slope: 1.6, cast: true },
  { id: "grass-tuft", near: 110, mid: 35, far: 0, scale: [0.7, 1.5], clear: 0.4, slope: 1.5, cast: false },
  { id: "wildflower", near: 50, mid: 16, far: 0, scale: [0.7, 1.3], clear: 0.5, slope: 1.4, cast: false },
];

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2(ix, iz, seed = SEED) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z, seed = SEED) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const tx = x - xi;
  const tz = z - zi;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sz;
}

function fbm(x, z, seed = SEED, octaves = 3) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, z * frequency, seed + i * 101) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / total;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function regionKey(ix, iz) {
  return `r_${ix}_${iz}`;
}

export function regionCoordinates(x, z) {
  return {
    ix: Math.floor(x / REGION_SIZE),
    iz: Math.floor(z / REGION_SIZE),
  };
}

export function isCoreRegion(ix, iz) {
  return (
    ix >= CORE_MIN_INDEX &&
    ix <= CORE_MAX_INDEX &&
    iz >= CORE_MIN_INDEX &&
    iz <= CORE_MAX_INDEX
  );
}

function segmentDistanceSq(px, pz, segment) {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) {
    const ex = px - segment.ax;
    const ez = pz - segment.az;
    return ex * ex + ez * ez;
  }
  let t = ((px - segment.ax) * dx + (pz - segment.az) * dz) / lengthSq;
  t = clamp(t, 0, 1);
  const ex = px - (segment.ax + dx * t);
  const ez = pz - (segment.az + dz * t);
  return ex * ex + ez * ez;
}

// ---------------------------------------------------------------------------
// RegionWorld
// ---------------------------------------------------------------------------
export class RegionWorld {
  constructor({
    scene,
    assets,
    collision,
    heightfield,
    waterLevel = WATER_LEVEL,
    quality = "medium",
    onAreaChange = null,
  }) {
    this.scene = scene;
    this.assets = assets;
    this.collision = collision;
    this.coreHeightfield = heightfield;
    this.waterLevel = waterLevel;
    this.quality = quality;
    this.onAreaChange = onAreaChange;

    this.root = new THREE.Group();
    this.root.name = "Wilayah Dinamis";
    this.scene.add(this.root);

    this.loaded = new Map();
    this.queue = new Map();
    this.definitions = new Map();
    this.bridges = [];
    this.roadSegments = [];
    this.riverSegments = [];
    this.riverGrid = new Map();
    this.riverGeometryByRegion = new Map();
    this.roadGeometryByRegion = new Map();
    this.buildings = [];
    this.plazas = [];
    this.settlementTargets = [];

    this.focus = { x: 0, z: 0 };
    this.currentArea = null;
    this._streamTimer = 0;
    this._clock = 0;

    this._prepareMaterials();
    this._prepareNature();
    this._prepareSettlements();
    this._buildRivers();
    this._buildRoadNetwork();
    this._buildBridges();
    this._buildRoadGeometry();
    this._buildLakeGeometry();

    if (this.collision) {
      this.collision.bounds = {
        minX: -WORLD_HALF_EXTENT + 20,
        maxX: WORLD_HALF_EXTENT - 20,
        minZ: -WORLD_HALF_EXTENT + 20,
        maxZ: WORLD_HALF_EXTENT - 20,
      };
    }
  }

  // ------------------------------------------------------------------ setup
  _prepareMaterials() {
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
    this.terrainMaterialFlat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f747d,
      transparent: true,
      opacity: 0.84,
      roughness: 0.18,
      metalness: 0.06,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    this.roadMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
    });
    this.stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x9b9587,
      roughness: 0.94,
      metalness: 0.02,
    });
    this.cobbleMaterial = new THREE.MeshStandardMaterial({
      color: 0x8f887a,
      roughness: 1,
      metalness: 0,
    });
  }

  _prepareNature() {
    this.nature = new Map();
    for (const type of NATURE_TYPES) {
      const node = this.assets.getCollectionNode("nature", type.id);
      if (!node) continue;
      const { parts, size } = this.assets.makeInstancedParts(node, {
        scale: WORLD_SCALE,
      });
      this.nature.set(type.id, {
        ...type,
        parts,
        size,
        radius: Math.max(0.24, Math.min(1.1, Math.max(size.x, size.z) * 0.28)),
        height: size.y,
      });
    }

    const cropNode = this.assets.getCollectionNode("nature", "crop");
    if (cropNode) {
      this.cropParts = this.assets.makeInstancedParts(cropNode, {
        scale: WORLD_SCALE,
      }).parts;
    }

    this.decorationParts = new Map();
    for (const id of ["bench", "flowers", "street-lamp"]) {
      const node = this.assets.getCollectionNode("decorations", id);
      if (!node) continue;
      this.decorationParts.set(
        id,
        this.assets.makeInstancedParts(node, { scale: WORLD_SCALE }).parts
      );
    }
  }

  _buildingSize(id) {
    const items = this.assets.manifest?.categories?.buildings?.items || [];
    const item = items.find((entry) => entry.id === id);
    const size = item?.size || [4, 4, 4];
    return new THREE.Vector3(
      size[0] * WORLD_SCALE,
      size[1] * WORLD_SCALE,
      size[2] * WORLD_SCALE
    );
  }

  _prepareSettlements() {
    for (const settlement of SETTLEMENTS) {
      const target = this._baseHeightAt(settlement.x, settlement.z) + 0.45;
      this.settlementTargets.push({ ...settlement, target });

      const rng = mulberry32(hashSeed(settlement.id));
      const count = settlement.radius >= 95 ? 8 : 6;
      const offset = rng() * Math.PI * 2;
      const placed = [];
      const plazaRadius = Math.min(17, settlement.radius * 0.22);
      const plazaCoords = regionCoordinates(settlement.x, settlement.z);
      this.plazas.push({
        id: settlement.id + "-plaza",
        name: settlement.name,
        x: settlement.x,
        z: settlement.z,
        radius: plazaRadius,
        regionKey: regionKey(plazaCoords.ix, plazaCoords.iz),
      });

      for (let i = 0; i < count; i++) {
        const buildingId = settlement.pool[i % settlement.pool.length];
        const size = this._buildingSize(buildingId);
        const halfX = size.x * 0.5;
        const halfZ = size.z * 0.5;
        const footprint = Math.hypot(halfX, halfZ);
        let placedOne = null;

        for (let attempt = 0; attempt < 24 && !placedOne; attempt++) {
          const angle =
            offset +
            (i / count) * Math.PI * 2 +
            (attempt % 4) * 0.22 +
            (rng() - 0.5) * 0.12;
          const ring = settlement.radius * (0.44 + rng() * 0.2);
          const x = settlement.x + Math.cos(angle) * ring;
          const z = settlement.z + Math.sin(angle) * ring;
          const distance = Math.hypot(x - settlement.x, z - settlement.z);
          if (distance + footprint > settlement.radius * 0.92) continue;
          if (distance < plazaRadius + footprint + 3.5) continue;

          const rot = Math.atan2(-Math.cos(angle), -Math.sin(angle));
          const circle = footprint + 2.4;
          if (
            placed.some(
              (other) =>
                Math.hypot(x - other.x, z - other.z) < circle + other.radius
            )
          ) {
            continue;
          }

          placedOne = {
            id: settlement.id + "-" + i,
            settlement: settlement.id,
            settlementName: settlement.name,
            buildingId,
            x,
            z,
            rot,
            halfX,
            halfZ,
            radius: circle,
            regionKey: regionKey(
              regionCoordinates(x, z).ix,
              regionCoordinates(x, z).iz
            ),
          };
        }

        if (placedOne) {
          placed.push(placedOne);
          this.buildings.push(placedOne);
        }
      }
    }
  }

  _buildRivers() {
    const cellSize = 64;
    this.riverCellSize = cellSize;

    for (const river of RIVER_CURVES) {
      const curve = new THREE.CatmullRomCurve3(
        river.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
        false,
        "catmullrom",
        0.2
      );
      const divisions = Math.max(24, Math.ceil(curve.getLength() / 10));
      const samples = curve.getSpacedPoints(divisions);
      const halfWidth = river.width;

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        const segment = {
          ax: a.x,
          az: a.z,
          bx: b.x,
          bz: b.z,
          halfWidth,
          river: river.id,
        };
        this.riverSegments.push(segment);
        const index = this.riverSegments.length - 1;
        const cells = this._cellsForBounds(
          Math.min(a.x, b.x) - halfWidth - 30,
          Math.max(a.x, b.x) + halfWidth + 30,
          Math.min(a.z, b.z) - halfWidth - 30,
          Math.max(a.z, b.z) + halfWidth + 30,
          cellSize
        );
        for (const key of cells) {
          let bucket = this.riverGrid.get(key);
          if (!bucket) {
            bucket = [];
            this.riverGrid.set(key, bucket);
          }
          bucket.push(index);
        }
      }

      const tangent = new THREE.Vector3();
      const side = new THREE.Vector3();
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        tangent.subVectors(b, a).setY(0).normalize();
        side.set(-tangent.z, 0, tangent.x);
        const width = halfWidth * 0.84;
        const aL = { x: a.x + side.x * width, z: a.z + side.z * width };
        const aR = { x: a.x - side.x * width, z: a.z - side.z * width };
        const bL = { x: b.x + side.x * width, z: b.z + side.z * width };
        const bR = { x: b.x - side.x * width, z: b.z - side.z * width };
        this._pushQuad(
          this.riverGeometryByRegion,
          aL,
          aR,
          bL,
          bR,
          this.waterLevel + 0.035
        );
      }
    }
  }

  _buildRoadNetwork() {
    for (const road of ROADS) {
      const curve = new THREE.CatmullRomCurve3(
        road.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
        false,
        "catmullrom",
        0.2
      );
      const divisions = Math.max(18, Math.ceil(curve.getLength() / 6));
      const samples = curve.getSpacedPoints(divisions);
      const halfWidth = road.width * 0.5;

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        this.roadSegments.push({
          ax: a.x,
          az: a.z,
          bx: b.x,
          bz: b.z,
          halfWidth,
          road: road.id,
        });
      }

      this.roads ||= [];
      this.roads.push({ ...road, halfWidth, samples });
    }
  }

  _buildBridges() {
    for (const road of this.roads || []) {
      const samples = road.samples;
      const wet = samples.map((sample) => this._isWet(sample.x, sample.z));
      let index = 0;
      while (index < samples.length) {
        if (!wet[index]) {
          index++;
          continue;
        }
        const firstWet = index;
        while (index < samples.length && wet[index]) index++;
        const lastWet = index - 1;
        const startIndex = Math.max(0, firstWet - 1);
        const endIndex = Math.min(samples.length - 1, lastWet + 1);
        const start = samples[startIndex];
        const end = samples[endIndex];
        const length = Math.hypot(end.x - start.x, end.z - start.z);
        if (length < 4) continue;
        if (length > 190) continue;

        const midX = (start.x + end.x) * 0.5;
        const midZ = (start.z + end.z) * 0.5;
        if (
          this.bridges.some(
            (bridge) =>
              Math.hypot(bridge.x - midX, bridge.z - midZ) <
              bridge.length * 0.45
          )
        ) {
          continue;
        }

        const startGround = this.groundHeightAt(start.x, start.z);
        const endGround = this.groundHeightAt(end.x, end.z);
        const deckY =
          Math.max(startGround, endGround, this.waterLevel + 1.6) + 0.28;
        const ux = (end.x - start.x) / length;
        const uz = (end.z - start.z) / length;

        this.bridges.push({
          id: "jembatan-" + road.id + "-" + firstWet,
          road: road.id,
          x: midX,
          z: midZ,
          ux,
          uz,
          length: length + 7,
          width: road.width + 3.2,
          deckY,
          angle: Math.atan2(ux, uz),
          regionKey: regionKey(
            ...Object.values(regionCoordinates(midX, midZ))
          ),
        });
      }
    }
  }

  _buildRoadGeometry() {
    const tangent = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (const road of this.roads || []) {
      const samples = road.samples;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        tangent.subVectors(b, a).setY(0).normalize();
        side.set(-tangent.z, 0, tangent.x);
        const width = road.halfWidth;
        const aL = {
          x: a.x + side.x * width,
          z: a.z + side.z * width,
          y: this.heightAt(a.x + side.x * width, a.z + side.z * width) + 0.055,
        };
        const aR = {
          x: a.x - side.x * width,
          z: a.z - side.z * width,
          y: this.heightAt(a.x - side.x * width, a.z - side.z * width) + 0.055,
        };
        const bL = {
          x: b.x + side.x * width,
          z: b.z + side.z * width,
          y: this.heightAt(b.x + side.x * width, b.z + side.z * width) + 0.055,
        };
        const bR = {
          x: b.x - side.x * width,
          z: b.z - side.z * width,
          y: this.heightAt(b.x - side.x * width, b.z - side.z * width) + 0.055,
        };
        const shade = 0.38 + hash2(i, road.id.length, SEED) * 0.15;
        this._pushQuad(
          this.roadGeometryByRegion,
          aL,
          aR,
          bL,
          bR,
          null,
          [shade * 1.12, shade * 0.9, shade * 0.62]
        );
      }
    }
  }

  _buildLakeGeometry() {
    const step = 12;
    for (const lake of LAKES) {
      const radius = lake.radius * 0.92;
      for (let gx = -radius; gx <= radius; gx += step) {
        for (let gz = -radius; gz <= radius; gz += step) {
          const cx = gx + step * 0.5;
          const cz = gz + step * 0.5;
          if (Math.hypot(cx, cz) > radius) continue;
          const ax = lake.x + gx;
          const az = lake.z + gz;
          const bx = ax + step;
          const bz = az;
          const dx = ax;
          const dz = az + step;
          const ex = ax + step;
          const ez = az + step;
          this._pushQuad(
            this.riverGeometryByRegion,
            { x: ax, z: az },
            { x: bx, z: bz },
            { x: dx, z: dz },
            { x: ex, z: ez },
            this.waterLevel + 0.03
          );
        }
      }
    }
  }

  // ----------------------------------------------------------- height sampling
  _rawHeight(x, z) {
    const continental = fbm(x / 1050, z / 1050, SEED + 3, 3);
    const hills = fbm(x / 300, z / 300, SEED + 17, 3);
    const detail = fbm(x / 75, z / 75, SEED + 29, 2);
    const mountain = smoothstep(
      0.54,
      0.82,
      fbm(x / 850, z / 850, SEED + 41, 2)
    );
    return (
      2.5 +
      continental * 20 +
      hills * 14 +
      detail * 4 +
      mountain * (26 + hills * 30)
    );
  }

  _baseHeightAt(x, z) {
    if (
      Math.abs(x) <= CORE_HALF &&
      Math.abs(z) <= CORE_HALF &&
      this.coreHeightfield
    ) {
      const height = this.coreHeightfield.sample(x, z);
      return height === null ? this._rawHeight(x, z) : height;
    }

    const cx = clamp(x, -CORE_HALF, CORE_HALF);
    const cz = clamp(z, -CORE_HALF, CORE_HALF);
    const edge =
      this.coreHeightfield?.sample(cx, cz) ?? this._rawHeight(x, z);
    const dx = Math.max(0, Math.abs(x) - CORE_HALF);
    const dz = Math.max(0, Math.abs(z) - CORE_HALF);
    const t = smoothstep(0, 80, Math.hypot(dx, dz));
    return lerp(edge, this._rawHeight(x, z), t);
  }

  _flattenedHeightAt(x, z) {
    let height = this._baseHeightAt(x, z);
    for (const settlement of this.settlementTargets) {
      const distance = Math.hypot(x - settlement.x, z - settlement.z);
      const outer = settlement.radius + 34;
      if (distance >= outer) continue;
      const t = 1 - smoothstep(settlement.radius * 0.92, outer, distance);
      height = lerp(height, settlement.target, t * 0.985);
    }
    return height;
  }

  _settlementProtection(x, z) {
    let protection = 1;
    for (const settlement of this.settlementTargets) {
      const distance = Math.hypot(x - settlement.x, z - settlement.z);
      if (distance >= settlement.radius + 34) continue;
      protection = Math.min(
        protection,
        smoothstep(settlement.radius * 0.92, settlement.radius + 30, distance)
      );
    }
    return protection;
  }

  _nearestRiver(x, z) {
    if (!this.riverGrid.size) return null;
    const cellSize = this.riverCellSize || 64;
    const cellX = Math.floor(x / cellSize);
    const cellZ = Math.floor(z / cellSize);
    let best = null;
    let bestDistanceSq = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.riverGrid.get(`${cellX + dx}|${cellZ + dz}`);
        if (!bucket) continue;
        for (const index of bucket) {
          const segment = this.riverSegments[index];
          const distanceSq = segmentDistanceSq(x, z, segment);
          if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            best = segment;
          }
        }
      }
    }
    if (!best) return null;
    return {
      distance: Math.sqrt(bestDistanceSq),
      halfWidth: best.halfWidth,
      river: best.river,
    };
  }

  _lakeInfluence(x, z) {
    let strongest = 0;
    let lake = null;
    for (const candidate of LAKES) {
      const distance = Math.hypot(x - candidate.x, z - candidate.z);
      if (distance >= candidate.radius + 38) continue;
      const strength = 1 - smoothstep(candidate.radius * 0.7, candidate.radius + 30, distance);
      if (strength > strongest) {
        strongest = strength;
        lake = candidate;
      }
    }
    return { strength: strongest, lake };
  }

  groundHeightAt(x, z) {
    let height = this._flattenedHeightAt(x, z);
    const river = this._nearestRiver(x, z);
    if (river) {
      const protection = this._settlementProtection(x, z);
      if (protection > 0 && river.distance < river.halfWidth + 26) {
        const bank =
          1 - smoothstep(river.halfWidth * 0.55, river.halfWidth + 22, river.distance);
        height = lerp(
          height,
          Math.min(height, this.waterLevel - 2.5),
          bank * protection
        );
      }
    }

    const lake = this._lakeInfluence(x, z);
    if (lake.strength > 0) {
      const protection = this._settlementProtection(x, z);
      height = lerp(
        height,
        Math.min(height, this.waterLevel - 2.2),
        lake.strength * protection
      );
    }
    return height;
  }

  _bridgeHeight(x, z) {
    let best = null;
    for (const bridge of this.bridges) {
      const dx = x - bridge.x;
      const dz = z - bridge.z;
      const along = dx * bridge.ux + dz * bridge.uz;
      const cross = dx * -bridge.uz + dz * bridge.ux;
      if (Math.abs(cross) > bridge.width * 0.5 + 0.35) continue;
      const halfLength = bridge.length * 0.5;
      const ramp = 5;
      if (Math.abs(along) <= halfLength) {
        best = best === null ? bridge.deckY : Math.max(best, bridge.deckY);
      } else if (Math.abs(along) <= halfLength + ramp) {
        const t = 1 - (Math.abs(along) - halfLength) / ramp;
        const target = lerp(
          this.groundHeightAt(x, z),
          bridge.deckY,
          smoothstep(0, 1, t)
        );
        best = best === null ? target : Math.max(best, target);
      }
    }
    return best;
  }

  heightAt(x, z) {
    const ground = this.groundHeightAt(x, z);
    const bridge = this._bridgeHeight(x, z);
    return bridge === null ? ground : Math.max(ground, bridge);
  }

  _slopeAt(x, z) {
    const sample = 2.5;
    const left = this.groundHeightAt(x - sample, z);
    const right = this.groundHeightAt(x + sample, z);
    const back = this.groundHeightAt(x, z - sample);
    const front = this.groundHeightAt(x, z + sample);
    return Math.max(
      Math.abs(right - left),
      Math.abs(front - back)
    ) / (sample * 2);
  }

  biomeAt(x, z) {
    const height = this._flattenedHeightAt(x, z);
    if (height > 59) return "pegunungan";
    if (height > 35) return "perbukitan";
    const forest = fbm(x / 380, z / 380, SEED + 71, 2);
    const farm = fbm(x / 260, z / 260, SEED + 97, 2);
    const moisture = fbm(x / 620, z / 620, SEED + 53, 2);
    if (forest > 0.59 || moisture > 0.68) return "hutan";
    if (farm > 0.56) return "ladang";
    return "padang";
  }

  areaAt(x, z) {
    if (Math.abs(x) <= CORE_HALF && Math.abs(z) <= CORE_HALF) {
      return "Kinstead";
    }
    let nearest = null;
    let nearestDistance = Infinity;
    for (const settlement of SETTLEMENTS) {
      const distance = Math.hypot(x - settlement.x, z - settlement.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = settlement;
      }
    }
    if (nearest && nearestDistance < nearest.radius + 90) {
      return nearest.name;
    }
    const coords = regionCoordinates(x, z);
    const centerX = (coords.ix + 0.5) * REGION_SIZE;
    const centerZ = (coords.iz + 0.5) * REGION_SIZE;
    const biome = BIOME_LABELS[this.biomeAt(centerX, centerZ)] || "Alam";
    const angle = Math.atan2(x, -z);
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    const direction =
      DIRECTION_LABELS[Math.round(normalized / (Math.PI / 4)) % 8];
    return `${biome} ${direction}`;
  }

  // -------------------------------------------------------------- streaming
  warmup(x, z, rings = 1) {
    this.focus = { x, z };
    this._refreshStreaming(rings);
    this._processQueue(Infinity);
    this._updateArea(x, z);
  }

  update(dt, focus) {
    this._clock += dt;
    if (focus) this.focus = { x: focus.x, z: focus.z };
    this._streamTimer -= dt;
    if (this._streamTimer <= 0) {
      this._streamTimer = 0.45;
      this._refreshStreaming();
    }
    this._processQueue(this.quality === "high" ? 2 : 1);
    if (focus) this._updateArea(focus.x, focus.z);
  }

  _refreshStreaming(radiusOverride = null) {
    const radius =
      radiusOverride ?? STREAM_RADIUS[this.quality] ?? STREAM_RADIUS.medium;
    const coords = regionCoordinates(this.focus.x, this.focus.z);
    const desired = new Map();

    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const ix = coords.ix + dx;
        const iz = coords.iz + dz;
        if (ix < -WORLD_REGION_LIMIT || ix >= WORLD_REGION_LIMIT) continue;
        if (iz < -WORLD_REGION_LIMIT || iz >= WORLD_REGION_LIMIT) continue;
        if (isCoreRegion(ix, iz)) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dz));
        const lod = distance <= LOD_NEAR ? 0 : distance <= LOD_MID ? 1 : 2;
        desired.set(regionKey(ix, iz), { ix, iz, lod });
      }
    }

    for (const [key, region] of [...this.loaded]) {
      if (!desired.has(key)) {
        this._unloadRegion(key);
      } else if (desired.get(key).lod !== region.lod) {
        this._unloadRegion(key);
      }
    }

    for (const [key, target] of desired) {
      if (!this.loaded.has(key) && !this.queue.has(key)) {
        this.queue.set(key, target);
      }
    }

    for (const key of [...this.queue.keys()]) {
      const target = desired.get(key);
      if (!target) this.queue.delete(key);
    }
  }

  _processQueue(max) {
    if (!this.queue.size) return;
    let processed = 0;
    const ordered = [...this.queue.entries()].sort((a, b) => {
      const ad = Math.max(
        Math.abs(a[1].ix - Math.floor(this.focus.x / REGION_SIZE)),
        Math.abs(a[1].iz - Math.floor(this.focus.z / REGION_SIZE))
      );
      const bd = Math.max(
        Math.abs(b[1].ix - Math.floor(this.focus.x / REGION_SIZE)),
        Math.abs(b[1].iz - Math.floor(this.focus.z / REGION_SIZE))
      );
      return ad - bd;
    });
    for (const [key, target] of ordered) {
      if (processed >= max) break;
      this.queue.delete(key);
      if (this.loaded.has(key)) continue;
      try {
        this._buildRegion(target.ix, target.iz, target.lod);
        processed++;
      } catch (error) {
        console.warn("[Kinstead] region build failed", key, error);
      }
    }
  }

  setQuality(quality) {
    if (quality === this.quality) return;
    this.quality = quality;
    for (const key of [...this.loaded.keys()]) this._unloadRegion(key);
    this.queue.clear();
    this._refreshStreaming();
    this._processQueue(4);
  }

  getStats() {
    return {
      loadedRegions: this.loaded.size,
      queuedRegions: this.queue.size,
      bridges: this.bridges.length,
      roads: this.roads?.length || 0,
      settlements: SETTLEMENTS.length,
      pendingDefinitions: this.definitions.size,
    };
  }

  // ------------------------------------------------------------ region build
  _buildRegion(ix, iz, lod) {
    const key = regionKey(ix, iz);
    if (this.loaded.has(key) || isCoreRegion(ix, iz)) return;
    const group = new THREE.Group();
    group.name = key;
    this.root.add(group);

    const minX = ix * REGION_SIZE;
    const minZ = iz * REGION_SIZE;

    this._addTerrain(group, key, ix, iz, lod, minX, minZ);
    this._addWater(group, key);
    this._addRoads(group, key);
    this._addBridges(group, key);
    this._addBuildings(group, key, lod);
    this._addPlaza(group, key, lod);
    this._addNature(group, key, ix, iz, lod, minX, minZ);
    this._addCrops(group, key, ix, iz, lod, minX, minZ);

    this.loaded.set(key, { ix, iz, lod, group });
  }

  _addTerrain(group, key, ix, iz, lod, minX, minZ) {
    const base =
      this.quality === "high" ? 32 : this.quality === "medium" ? 22 : 14;
    const factor = lod === 0 ? 1 : lod === 1 ? 0.72 : 0.48;
    const segments = Math.max(8, Math.round(base * factor));
    const cells = segments + 1;
    const positions = new Float32Array(cells * cells * 3);
    const colors = new Float32Array(cells * cells * 3);
    const indices = [];
    const color = new THREE.Color();

    for (let gz = 0; gz < cells; gz++) {
      for (let gx = 0; gx < cells; gx++) {
        const u = gx / segments;
        const v = gz / segments;
        const worldX = minX + u * REGION_SIZE;
        const worldZ = minZ + v * REGION_SIZE;
        const height = this.groundHeightAt(worldX, worldZ);
        const index = (gz * cells + gx) * 3;
        positions[index] = u * REGION_SIZE;
        positions[index + 1] = height;
        positions[index + 2] = v * REGION_SIZE;

        const slope = this._slopeAt(worldX, worldZ);
        const biome = this.biomeAt(worldX, worldZ);
        const tint = hash2(gx + ix * 97, gz + iz * 89, SEED + 7);
        if (height < this.waterLevel + 0.25) {
          color.setRGB(0.34, 0.34, 0.28);
        } else if (height < this.waterLevel + 1.4) {
          color.setRGB(0.55, 0.5, 0.36);
        } else if (slope > 0.85 || height > 62) {
          color.setRGB(0.46, 0.44, 0.4);
        } else if (biome === "hutan") {
          color.setRGB(0.2 + tint * 0.05, 0.34 + tint * 0.06, 0.17 + tint * 0.03);
        } else if (biome === "ladang") {
          color.setRGB(0.5 + tint * 0.06, 0.44 + tint * 0.06, 0.23 + tint * 0.03);
        } else if (biome === "perbukitan") {
          color.setRGB(0.36 + tint * 0.05, 0.44 + tint * 0.05, 0.24 + tint * 0.04);
        } else {
          color.setRGB(0.33 + tint * 0.06, 0.48 + tint * 0.07, 0.24 + tint * 0.04);
        }
        colors[index] = color.r;
        colors[index + 1] = color.g;
        colors[index + 2] = color.b;
      }
    }

    for (let gz = 0; gz < segments; gz++) {
      for (let gx = 0; gx < segments; gx++) {
        const a = gz * cells + gx;
        const b = a + 1;
        const c = a + cells;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.userData.owned = true;

    const mesh = new THREE.Mesh(
      geometry,
      this.quality === "low" ? this.terrainMaterialFlat : this.terrainMaterial
    );
    mesh.name = "terrain_" + key;
    mesh.position.set(minX, 0, minZ);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
  }

  _addWater(group, key) {
    const data = this.riverGeometryByRegion.get(key);
    if (!data || !data.positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(data.positions, 3)
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.userData.owned = true;
    const mesh = new THREE.Mesh(geometry, this.waterMaterial);
    mesh.name = "water_" + key;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  _addRoads(group, key) {
    const data = this.roadGeometryByRegion.get(key);
    if (!data || !data.positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(data.positions, 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(data.colors, 3)
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.userData.owned = true;
    const mesh = new THREE.Mesh(geometry, this.roadMaterial);
    mesh.name = "road_" + key;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
  }

  _addBridges(group, key) {
    for (const bridge of this.bridges) {
      if (bridge.regionKey !== key) continue;
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(bridge.x, 0, bridge.z);
      bridgeGroup.rotation.y = bridge.angle;
      bridgeGroup.name = bridge.id;

      const deckGeometry = new THREE.BoxGeometry(
        bridge.width,
        0.5,
        bridge.length + 1
      );
      deckGeometry.userData.owned = true;
      const deck = new THREE.Mesh(deckGeometry, this.stoneMaterial);
      deck.position.y = bridge.deckY - 0.25;
      deck.castShadow = true;
      deck.receiveShadow = true;
      bridgeGroup.add(deck);

      for (const side of [-1, 1]) {
        const railGeometry = new THREE.BoxGeometry(
          0.45,
          1.0,
          bridge.length + 1
        );
        railGeometry.userData.owned = true;
        const rail = new THREE.Mesh(railGeometry, this.stoneMaterial);
        rail.position.set(side * (bridge.width * 0.5 - 0.22), bridge.deckY + 0.5, 0);
        rail.castShadow = true;
        rail.receiveShadow = true;
        bridgeGroup.add(rail);
      }

      for (const z of [-bridge.length * 0.28, bridge.length * 0.28]) {
        const pierGeometry = new THREE.BoxGeometry(
          bridge.width * 0.8,
          Math.max(2, bridge.deckY - this.waterLevel + 1),
          1.3
        );
        pierGeometry.userData.owned = true;
        const pier = new THREE.Mesh(pierGeometry, this.stoneMaterial);
        pier.position.set(0, bridge.deckY - pierGeometry.parameters.height * 0.5, z);
        pier.castShadow = true;
        pier.receiveShadow = true;
        bridgeGroup.add(pier);
      }

      group.add(bridgeGroup);
      this._addBridgeColliders(bridge, key);
    }
  }

  _addBridgeColliders(bridge, key) {
    if (!this.collision) return;
    for (const side of [-1, 1]) {
      const offset = side * (bridge.width * 0.5 - 0.22);
      const x = bridge.x + offset * Math.cos(bridge.angle);
      const z = bridge.z + offset * Math.sin(bridge.angle);
      this.collision.addBox({
        x,
        z,
        halfX: 0.26,
        halfZ: bridge.length * 0.5,
        rotation: bridge.angle,
        topY: bridge.deckY + 1.1,
        name: bridge.id,
        region: key,
      });
    }
  }

  _addBuildings(group, key, lod) {
    for (const building of this.buildings) {
      if (building.regionKey !== key) continue;
      const source = this.assets.getBuilding(building.buildingId);
      if (!source) continue;
      const prototype = this.assets.makePrototype(source, {
        scale: WORLD_SCALE,
        castShadow: true,
        receiveShadow: true,
      });
      const ground = this.groundHeightAt(building.x, building.z);
      prototype.root.position.set(building.x, ground, building.z);
      prototype.root.rotation.y = building.rot;
      prototype.root.name = "wilayah_" + building.id;
      group.add(prototype.root);

      if (this.collision) {
        this.collision.addBox({
          x: building.x,
          z: building.z,
          halfX: Math.max(0.4, building.halfX * 0.92),
          halfZ: Math.max(0.4, building.halfZ * 0.92),
          rotation: building.rot,
          topY: ground + Math.max(2, prototype.size.y),
          name: building.buildingId,
          region: key,
        });
      }
    }
  }

  _addPlaza(group, key, lod) {
    for (const plaza of this.plazas) {
      if (plaza.regionKey !== key) continue;
      const ground = this.groundHeightAt(plaza.x, plaza.z);
      const geometry = new THREE.CircleGeometry(plaza.radius, 32);
      geometry.rotateX(-Math.PI / 2);
      geometry.userData.owned = true;
      const mesh = new THREE.Mesh(geometry, this.cobbleMaterial);
      mesh.position.set(plaza.x, ground + 0.09, plaza.z);
      mesh.receiveShadow = true;
      mesh.name = plaza.id;
      group.add(mesh);

      if (lod > 1) continue;
      const rng = mulberry32(hashSeed(plaza.id));
      const placements = new Map();
      const add = (id, placement) => {
        if (!this.decorationParts.has(id)) return;
        let list = placements.get(id);
        if (!list) {
          list = [];
          placements.set(id, list);
        }
        list.push(placement);
      };

      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + rng() * 0.2;
        const radius = plaza.radius * 0.7;
        add("bench", {
          x: plaza.x + Math.cos(angle) * radius,
          y: ground + 0.06,
          z: plaza.z + Math.sin(angle) * radius,
          rot: -angle,
          scale: 1,
        });
      }
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + 0.4;
        const radius = plaza.radius * 0.92;
        add("street-lamp", {
          x: plaza.x + Math.cos(angle) * radius,
          y: ground + 0.06,
          z: plaza.z + Math.sin(angle) * radius,
          rot: -angle,
          scale: 1,
        });
      }
      for (let i = 0; i < 10; i++) {
        const angle = rng() * Math.PI * 2;
        const radius = plaza.radius * (0.2 + rng() * 0.55);
        add("flowers", {
          x: plaza.x + Math.cos(angle) * radius,
          y: ground + 0.05,
          z: plaza.z + Math.sin(angle) * radius,
          rot: rng() * Math.PI * 2,
          scale: 0.8 + rng() * 0.5,
        });
      }

      for (const [id, list] of placements) {
        this.assets.createInstanced(this.decorationParts.get(id), list, {
          scene: group,
          name: "plaza_" + id,
          castShadow: id === "street-lamp",
          receiveShadow: true,
          frustumCulled: true,
        });
      }
    }
  }

  _addNature(group, key, ix, iz, lod, minX, minZ) {
    const def = this._regionDefinition(key, ix, iz, lod);
    for (const [id, entry] of this.nature) {
      const placements = def.nature.get(id);
      if (!placements || !placements.length) continue;
      this.assets.createInstanced(entry.parts, placements, {
        scene: group,
        name: "alam_" + id,
        castShadow: entry.cast && lod < 2,
        receiveShadow: true,
        frustumCulled: true,
      });

      if (lod === 0 && entry.clear >= 3) {
        for (const placement of placements) {
          if (!this.collision) continue;
          const radius = entry.radius * placement.scale;
          this.collision.addCircle({
            x: placement.x,
            z: placement.z,
            radius,
            topY: placement.y + entry.height * placement.scale,
            name: id,
            region: key,
          });
        }
      }
    }
  }

  _addCrops(group, key, ix, iz, lod, minX, minZ) {
    if (!this.cropParts || lod > 1) return;
    const def = this._regionDefinition(key, ix, iz, lod);
    if (!def.crops.length) return;
    this.assets.createInstanced(this.cropParts, def.crops, {
      scene: group,
      name: "ladang_" + key,
      castShadow: false,
      receiveShadow: true,
      frustumCulled: true,
    });
  }

  _regionDefinition(key, ix, iz, lod) {
    const cacheKey = `${key}:${lod}`;
    const cached = this.definitions.get(cacheKey);
    if (cached) return cached;

    const rng = mulberry32(hashSeed(cacheKey));
    const minX = ix * REGION_SIZE;
    const minZ = iz * REGION_SIZE;
    const roadSegments = this._segmentsInRegion(this.roadSegments, ix, iz, 24);
    const riverSegments = this._segmentsInRegion(this.riverSegments, ix, iz, 30);
    const buildings = this.buildings.filter((building) => {
      return (
        building.x >= minX - 45 &&
        building.x <= minX + REGION_SIZE + 45 &&
        building.z >= minZ - 45 &&
        building.z <= minZ + REGION_SIZE + 45
      );
    });
    const plazas = this.plazas.filter(
      (plaza) =>
        plaza.x >= minX - 30 &&
        plaza.x <= minX + REGION_SIZE + 30 &&
        plaza.z >= minZ - 30 &&
        plaza.z <= minZ + REGION_SIZE + 30
    );

    const placed = [];
    const nature = new Map();

    for (const [id, entry] of this.nature) {
      const count = lod === 0 ? entry.near : lod === 1 ? entry.mid : entry.far;
      const placements = [];
      let attempts = 0;
      const maxAttempts = count * 34;
      while (placements.length < count && attempts < maxAttempts) {
        attempts++;
        const x = minX + 8 + rng() * (REGION_SIZE - 16);
        const z = minZ + 8 + rng() * (REGION_SIZE - 16);
        const height = this.groundHeightAt(x, z);
        if (height < this.waterLevel + 0.8) continue;
        if (height > 76 && id !== "rock" && id !== "pine") continue;
        const slope = this._slopeAt(x, z);
        if (slope > entry.slope) continue;
        if (!this._clearOfStructures(x, z, entry.clear, {
          roadSegments,
          riverSegments,
          buildings,
          plazas,
        })) {
          continue;
        }
        if (entry.clear >= 3) {
          const radius = entry.radius * 1.1;
          if (
            placed.some(
              (other) =>
                Math.hypot(x - other.x, z - other.z) <
                radius + other.radius
            )
          ) {
            continue;
          }
        }
        const scale = lerp(entry.scale[0], entry.scale[1], rng());
        const placement = { x, y: height, z, rot: rng() * Math.PI * 2, scale };
        placements.push(placement);
        if (entry.clear >= 3) {
          placed.push({ x, z, radius: entry.radius * scale });
        }
      }
      nature.set(id, placements);
    }

    const crops = this._cropDefinition(
      rng,
      minX,
      minZ,
      roadSegments,
      riverSegments,
      buildings,
      plazas
    );
    const definition = { nature, crops };
    this.definitions.set(cacheKey, definition);
    return definition;
  }

  _cropDefinition(rng, minX, minZ, roadSegments, riverSegments, buildings, plazas) {
    const crops = [];
    const biome = this.biomeAt(minX + REGION_SIZE * 0.5, minZ + REGION_SIZE * 0.5);
    if (biome !== "ladang") return crops;
    let field = null;
    for (let attempt = 0; attempt < 12 && !field; attempt++) {
      const centerX = minX + 32 + rng() * (REGION_SIZE - 64);
      const centerZ = minZ + 32 + rng() * (REGION_SIZE - 64);
      if (
        !this._clearOfStructures(centerX, centerZ, 12, {
          roadSegments,
          riverSegments,
          buildings,
          plazas,
        })
      ) {
        continue;
      }
      field = {
        x: centerX,
        z: centerZ,
        width: 22 + rng() * 12,
        depth: 14 + rng() * 8,
        angle: rng() * Math.PI,
      };
    }
    if (!field) return crops;
    const cos = Math.cos(field.angle);
    const sin = Math.sin(field.angle);
    for (let gz = -field.depth * 0.5; gz <= field.depth * 0.5; gz += 1.35) {
      for (let gx = -field.width * 0.5; gx <= field.width * 0.5; gx += 1.2) {
        const x = field.x + gx * cos - gz * sin + (rng() - 0.5) * 0.25;
        const z = field.z + gx * sin + gz * cos + (rng() - 0.5) * 0.25;
        if (
          x < minX + 4 ||
          x > minX + REGION_SIZE - 4 ||
          z < minZ + 4 ||
          z > minZ + REGION_SIZE - 4
        ) {
          continue;
        }
        const height = this.groundHeightAt(x, z);
        if (height < this.waterLevel + 0.7) continue;
        if (
          !this._clearOfStructures(x, z, 0.2, {
            roadSegments,
            riverSegments,
            buildings,
            plazas,
          })
        ) {
          continue;
        }
        crops.push({
          x,
          y: height,
          z,
          rot: field.angle + rng() * 0.4,
          scale: 0.8 + rng() * 0.45,
        });
      }
    }
    return crops;
  }

  _clearOfStructures(x, z, margin, { roadSegments, riverSegments, buildings, plazas }) {
    for (const segment of roadSegments) {
      const distance = Math.sqrt(segmentDistanceSq(x, z, segment));
      if (distance < segment.halfWidth + margin + 0.6) return false;
    }
    for (const segment of riverSegments) {
      const distance = Math.sqrt(segmentDistanceSq(x, z, segment));
      if (distance < segment.halfWidth + margin + 3.5) return false;
    }
    const lake = this._lakeInfluence(x, z);
    if (lake.strength > 0.02 && lake.lake) {
      const distance = Math.hypot(x - lake.lake.x, z - lake.lake.z);
      if (distance < lake.lake.radius + margin + 2) return false;
    }
    for (const building of buildings) {
      if (Math.hypot(x - building.x, z - building.z) < building.radius + margin) {
        return false;
      }
    }
    for (const plaza of plazas) {
      if (Math.hypot(x - plaza.x, z - plaza.z) < plaza.radius + margin + 1) {
        return false;
      }
    }
    for (const bridge of this.bridges) {
      const dx = x - bridge.x;
      const dz = z - bridge.z;
      const along = dx * bridge.ux + dz * bridge.uz;
      const cross = dx * -bridge.uz + dz * bridge.ux;
      if (
        Math.abs(along) < bridge.length * 0.5 + margin + 2 &&
        Math.abs(cross) < bridge.width * 0.5 + margin + 2
      ) {
        return false;
      }
    }
    return true;
  }

  _segmentsInRegion(segments, ix, iz, margin) {
    const minX = ix * REGION_SIZE - margin;
    const maxX = minX + REGION_SIZE + margin * 2;
    const minZ = iz * REGION_SIZE - margin;
    const maxZ = minZ + REGION_SIZE + margin * 2;
    return segments.filter(
      (segment) =>
        Math.min(segment.ax, segment.bx) <= maxX &&
        Math.max(segment.ax, segment.bx) >= minX &&
        Math.min(segment.az, segment.bz) <= maxZ &&
        Math.max(segment.az, segment.bz) >= minZ
    );
  }

  _isWet(x, z) {
    if (this.groundHeightAt(x, z) < this.waterLevel + 0.6) return true;
    const river = this._nearestRiver(x, z);
    if (river && river.distance < river.halfWidth * 0.95) return true;
    for (const lake of LAKES) {
      if (Math.hypot(x - lake.x, z - lake.z) < lake.radius * 0.92) return true;
    }
    return false;
  }

  _pushQuad(
    target,
    a,
    b,
    c,
    d,
    height = null,
    color = null
  ) {
    const centerX = (a.x + b.x + c.x + d.x) * 0.25;
    const centerZ = (a.z + b.z + c.z + d.z) * 0.25;
    const coords = regionCoordinates(centerX, centerZ);
    if (isCoreRegion(coords.ix, coords.iz)) return;
    const key = regionKey(coords.ix, coords.iz);
    let bucket = target.get(key);
    if (!bucket) {
      bucket = { positions: [], colors: [] };
      target.set(key, bucket);
    }
    const yA = height ?? a.y;
    const yB = height ?? b.y;
    const yC = height ?? c.y;
    const yD = height ?? d.y;
    const p = bucket.positions;
    p.push(
      a.x, yA, a.z,
      c.x, yC, c.z,
      b.x, yB, b.z,
      b.x, yB, b.z,
      c.x, yC, c.z,
      d.x, yD, d.z
    );
    if (color) {
      const colors = bucket.colors;
      for (let i = 0; i < 6; i++) {
        colors.push(color[0], color[1], color[2]);
      }
    }
  }

  _cellsForBounds(minX, maxX, minZ, maxZ, cellSize) {
    const keys = [];
    const minCellX = Math.floor(minX / cellSize);
    const maxCellX = Math.floor(maxX / cellSize);
    const minCellZ = Math.floor(minZ / cellSize);
    const maxCellZ = Math.floor(maxZ / cellSize);
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        keys.push(`${cx}|${cz}`);
      }
    }
    return keys;
  }

  _unloadRegion(key) {
    const region = this.loaded.get(key);
    if (!region) return;
    this.root.remove(region.group);
    if (this.collision) this.collision.removeRegion(key);
    region.group.traverse((node) => {
      if (node.isMesh && node.geometry?.userData?.owned) {
        node.geometry.dispose();
      }
    });
    this.loaded.delete(key);
  }

  _updateArea(x, z) {
    const area = this.areaAt(x, z);
    if (area === this.currentArea) return;
    this.currentArea = area;
    this.onAreaChange?.(area);
  }

  dispose() {
    for (const key of [...this.loaded.keys()]) this._unloadRegion(key);
    this.queue.clear();
  }
}
