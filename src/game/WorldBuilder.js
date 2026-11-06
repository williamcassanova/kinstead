import * as THREE from "three";
import {
  WORLD_SCALE,
  WATER_LEVEL,
  SPAWN_SOURCE,
  BUILDING_LAYOUT,
  PATH_LAYOUT,
  PLAZA_WORLD,
  PLAZA_RADIUS_WORLD,
  FARM_FIELD,
  PADDOCK,
  NPC_LAYOUT,
  ANIMAL_LAYOUT,
  ROT,
  sourceToWorld,
} from "./WorldLayout.js";
import { HeightField } from "./HeightField.js";
import { sculptVillageTerrain } from "./TerrainSculptor.js";
import { CollisionSystem } from "./CollisionSystem.js";
import { CharacterAnimation } from "./CharacterAnimation.js";
import { RegionWorld, WORLD_HALF_EXTENT } from "./WorldRegions.js";

const clamp = THREE.MathUtils.clamp;

export class WorldBuilder {
  constructor({ scene, assets, renderer, settings = {} }) {
    this.scene = scene;
    this.assets = assets;
    this.renderer = renderer;
    this.settings = settings;

    this.groups = {};
    this.heightfield = null;
    this.collision = null;
    this.regionWorld = null;
    this.water = null;
    this.waterBaseY = 0;
    this.sun = null;
    this.hemi = null;
    this.ambient = null;
    this.sky = null;
    this.stars = null;
    this.cloudGroup = null;
    this.camera = null;
    this.onAreaChange = null;

    this.npcs = [];
    this.animals = [];
    this.trees = [];
    this.pollen = null;
    this.pollenBase = null;

    this.pathSegments = [];
    this.buildingBoxes = [];
    this.spawn = new THREE.Vector3();

    this.rng = mulberry32(0x4b1d5eed);
    this.quality = settings.quality || "high";
    this.time = 0;
    this.dayTime = 0.29;
    this.dayLength = 520;
    this.weather = { fog: 1, rain: 0 };
    this._weatherTarget = { fog: 1, rain: 0 };
    this._sunDirection = new THREE.Vector3();
    this._sunFocus = new THREE.Vector3();
  }

  async build() {
    this._buildAtmosphere();
    this._buildTerrain();
    this._buildPaths();
    this._buildBuildings();
    this._buildDecorations();
    this._buildFarmField();
    this._buildNature();
    this._buildAnimals();
    this._buildNPCs();
    this._buildRegions();
    this._buildPollen();
    this._applyQuality(this.quality);

    return {
      heightfield: this.heightfield,
      collision: this.collision,
      spawn: this.spawn,
      npcs: this.npcs,
      animals: this.animals,
      water: this.water,
      regions: this.regionWorld,
      groups: this.groups,
    };
  }

  // ---------------------------------------------------------------- atmosphere
  _buildAtmosphere() {
    const group = new THREE.Group();
    group.name = "Atmosphere";
    this.scene.add(group);
    this.groups.atmosphere = group;

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x4f88c6) },
          horizonColor: { value: new THREE.Color(0xd6e7ec) },
          bottomColor: { value: new THREE.Color(0x8a9a82) },
          sunColor: { value: new THREE.Color(0xfff0c4) },
          sunDirection: { value: new THREE.Vector3(0.42, 0.62, 0.36).normalize() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDirection;
          void main() {
            vDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 topColor;
          uniform vec3 horizonColor;
          uniform vec3 bottomColor;
          uniform vec3 sunColor;
          uniform vec3 sunDirection;
          varying vec3 vDirection;
          void main() {
            vec3 dir = normalize(vDirection);
            float h = dir.y;
            vec3 col = mix(horizonColor, topColor, smoothstep(0.0, 0.62, h));
            col = mix(bottomColor, col, smoothstep(-0.28, 0.02, h));
            float sun = pow(max(dot(dir, sunDirection), 0.0), 850.0);
            float glow = pow(max(dot(dir, sunDirection), 0.0), 10.0) * 0.18;
            col += sunColor * (sun * 2.4 + glow);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    sky.name = "Sky";
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    group.add(sky);
    this.sky = sky;

    this.cloudGroup = new THREE.Group();
    this.cloudGroup.name = "Clouds";
    group.add(this.cloudGroup);
    const cloudTexture = createCloudTexture();
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + this.rng() * 0.5;
      const radius = 260 + this.rng() * 150;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: cloudTexture,
          transparent: true,
          opacity: 0.32 + this.rng() * 0.18,
          depthWrite: false,
          fog: false,
        })
      );
      sprite.position.set(
        Math.cos(angle) * radius,
        110 + this.rng() * 60,
        Math.sin(angle) * radius
      );
      const s = 55 + this.rng() * 65;
      sprite.scale.set(s, s * 0.45, 1);
      sprite.userData.baseOpacity = sprite.material.opacity;
      this.clouds.push(sprite);
      this.cloudGroup.add(sprite);
    }

    // A quiet star field for the night half of the cycle.
    const starCount = 520;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = this.rng() * Math.PI * 2;
      const phi = Math.acos(0.05 + this.rng() * 0.95);
      const radius = 1000;
      starPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      starPositions[i * 3 + 1] = Math.cos(phi) * radius;
      starPositions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3)
    );
    const starMaterial = new THREE.PointsMaterial({
      color: 0xdfe8ff,
      size: 1.5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      sizeAttenuation: true,
    });
    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.stars.name = "Stars";
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -900;
    group.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0xcfe2ff, 0x556b3a, 1.55);
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.28);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffe7bd, 2.75);
    this.sun.position.set(120, 170, 90);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -175;
    this.sun.shadow.camera.right = 175;
    this.sun.shadow.camera.top = 175;
    this.sun.shadow.camera.bottom = -175;
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 520;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.sun.target.position.set(PLAZA_WORLD.x, 0, PLAZA_WORLD.z);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.scene.fog = new THREE.Fog(0xc8dde4, 150, 900);

    this._skyColors = {
      dayTop: new THREE.Color(0x4f88c6),
      dayHorizon: new THREE.Color(0xd6e7ec),
      dayBottom: new THREE.Color(0x8a9a82),
      nightTop: new THREE.Color(0x07101f),
      nightHorizon: new THREE.Color(0x18243a),
      nightBottom: new THREE.Color(0x0b1312),
      dayFog: new THREE.Color(0xc8dde4),
      nightFog: new THREE.Color(0x101b26),
      daySun: new THREE.Color(0xfff0c4),
      nightSun: new THREE.Color(0x9fb8e4),
    };
  }

  // ------------------------------------------------------------------- terrain
  _buildTerrain() {
    const group = new THREE.Group();
    group.name = "Terrain";
    this.scene.add(group);
    this.groups.terrain = group;

    const gltf = this.assets.terrain;
    if (!gltf) throw new Error("Terrain GLB was not loaded");

    const root = gltf.scene;
    group.add(root);
    group.position.set(-24 * WORLD_SCALE, 0, -24 * WORLD_SCALE);
    group.scale.setScalar(WORLD_SCALE);

    let surface = null;
    let water = null;
    const meshes = [];
    root.traverse((node) => {
      if (!node.isMesh) return;
      meshes.push(node);
      node.castShadow = false;
      node.receiveShadow = true;
      if (node.name === "Terrain_Surface") surface = node;
      if (node.name === "Water_Surface") water = node;
    });

    if (!surface) {
      surface =
        meshes
          .filter((mesh) => mesh.name.toLowerCase().includes("surface"))
          .sort((a, b) => {
            const ac = a.geometry.getAttribute("position")?.count ?? 0;
            const bc = b.geometry.getAttribute("position")?.count ?? 0;
            return bc - ac;
          })[0] || meshes[0];
    }
    if (!surface) throw new Error("Could not find terrain surface mesh");

    const offsetX = group.position.x;
    const offsetZ = group.position.z;

    let hf = HeightField.fromMesh(surface, { scale: WORLD_SCALE, offsetX, offsetZ });
    const targetHeight = sculptVillageTerrain(surface, hf, this.assets.manifest, {
      scale: WORLD_SCALE,
      offsetX,
      offsetZ,
    });
    hf = HeightField.fromMesh(surface, { scale: WORLD_SCALE, offsetX, offsetZ });
    this.heightfield = hf;

    const spawnWorld = sourceToWorld(SPAWN_SOURCE.x, SPAWN_SOURCE.z);
    let spawnY = hf.sample(spawnWorld.x, spawnWorld.z);
    if (spawnY === null) spawnY = targetHeight;
    this.spawn.set(spawnWorld.x, spawnY, spawnWorld.z);

    this.collision = new CollisionSystem({
      heightAt: (x, z) => this._collisionHeightAt(x, z),
      waterLevel: WATER_LEVEL,
      bounds: {
        minX: hf.originX + 8,
        maxX: hf.maxX - 8,
        minZ: hf.originZ + 8,
        maxZ: hf.maxZ - 8,
      },
    });

    if (water) {
      water.material = water.material.clone();
      water.material.transparent = true;
      water.material.opacity = 0.88;
      water.material.roughness = 0.16;
      water.material.metalness = 0.02;
      water.material.depthWrite = true;
      water.renderOrder = 2;
      water.receiveShadow = false;
      water.castShadow = false;
      this.water = water;
      this.waterBaseY = water.position.y;
    }

    this.terrainInfo = {
      targetHeight,
      spawnY,
      meshCount: meshes.length,
      min: [hf.originX, hf.originZ],
      max: [hf.maxX, hf.maxZ],
    };
  }

  // --------------------------------------------------------------------- paths
  _buildPaths() {
    const group = new THREE.Group();
    group.name = "Paths";
    this.scene.add(group);
    this.groups.paths = group;

    const texture = createPathTexture();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(
      4,
      this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4
    );

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.96,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    for (const path of PATH_LAYOUT) {
      const points = path.points.map((p) => new THREE.Vector3(p.x, 0, p.z));
      const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.2);
      const length = curve.getLength();
      const divisions = Math.max(16, Math.ceil(length / 2));
      const samples = curve.getSpacedPoints(divisions);
      const width = path.width * WORLD_SCALE;
      const half = width * 0.5;

      const positions = [];
      const uvs = [];
      const indices = [];
      let distance = 0;

      for (let i = 0; i < samples.length; i++) {
        const point = samples[i];
        if (i > 0) distance += point.distanceTo(samples[i - 1]);
        const tangent = curve.getTangentAt(i / divisions).setY(0).normalize();
        const sideX = -tangent.z;
        const sideZ = tangent.x;

        for (let s = -1; s <= 1; s += 2) {
          const x = point.x + sideX * half * s;
          const z = point.z + sideZ * half * s;
          const y = this._ground(x, z, 0.07);
          positions.push(x, y, z);
          uvs.push(s < 0 ? 0 : 1, distance / 5);
        }

        if (i > 0) {
          const a = (i - 1) * 2;
          const b = a + 1;
          const c = i * 2;
          const d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "path_" + path.id;
      mesh.receiveShadow = true;
      group.add(mesh);

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        this.pathSegments.push({
          ax: a.x,
          az: a.z,
          bx: b.x,
          bz: b.z,
          halfWidth: half,
        });
      }
    }

    // Plaza disc.
    const plazaGeo = new THREE.CircleGeometry(PLAZA_RADIUS_WORLD, 72);
    plazaGeo.rotateX(-Math.PI / 2);
    const uv = plazaGeo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        uv.getX(i) * (PLAZA_RADIUS_WORLD * 2) / 5,
        uv.getY(i) * (PLAZA_RADIUS_WORLD * 2) / 5
      );
    }
    const plaza = new THREE.Mesh(plazaGeo, material);
    plaza.name = "Plaza";
    plaza.position.set(
      PLAZA_WORLD.x,
      this._ground(PLAZA_WORLD.x, PLAZA_WORLD.z, 0.08),
      PLAZA_WORLD.z
    );
    plaza.receiveShadow = true;
    group.add(plaza);
    this.plaza = plaza;

    const ringGeo = new THREE.RingGeometry(
      PLAZA_RADIUS_WORLD - 0.35,
      PLAZA_RADIUS_WORLD + 0.15,
      72
    );
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshStandardMaterial({ color: 0x9b9284, roughness: 1 })
    );
    ring.position.copy(plaza.position);
    ring.position.y += 0.02;
    ring.receiveShadow = true;
    group.add(ring);
  }

  // ----------------------------------------------------------------- buildings
  _buildBuildings() {
    const group = new THREE.Group();
    group.name = "Buildings";
    this.scene.add(group);
    this.groups.buildings = group;

    for (const entry of BUILDING_LAYOUT) {
      const source = this.assets.getBuilding(entry.id);
      if (!source) {
        console.warn("[Kinstead] missing building", entry.id);
        continue;
      }
      const prototype = this.assets.makePrototype(source, {
        scale: WORLD_SCALE,
        castShadow: true,
        receiveShadow: true,
      });
      const { x, z } = sourceToWorld(entry.x, entry.z);
      const ground = this._ground(x, z, 0);
      prototype.root.position.set(x, ground, z);
      prototype.root.rotation.y = entry.rot;
      prototype.root.name = "building_" + entry.id;
      group.add(prototype.root);

      const halfX = Math.max(0.25, prototype.size.x * 0.47);
      const halfZ = Math.max(0.25, prototype.size.z * 0.47);
      this.collision.addBox({
        x,
        z,
        halfX,
        halfZ,
        rotation: entry.rot,
        topY: ground + prototype.size.y,
        name: entry.id,
      });
      this.buildingBoxes.push({
        x,
        z,
        halfX,
        halfZ,
        rot: entry.rot,
        cos: Math.cos(entry.rot),
        sin: Math.sin(entry.rot),
        height: prototype.size.y,
      });
    }
  }

  // --------------------------------------------------------------- decorations
  _buildDecorations() {
    const group = new THREE.Group();
    group.name = "Decorations";
    this.scene.add(group);
    this.groups.decorations = group;

    const place = (id, x, z, rot = 0, scale = 1, options = {}) => {
      const node = this.assets.getCollectionNode("decorations", id);
      if (!node) return null;
      const proto = this.assets.makePrototype(node, {
        scale: WORLD_SCALE * scale,
        castShadow: options.castShadow !== false,
        receiveShadow: true,
      });
      const world = sourceToWorld(x, z);
      const ground = this._ground(world.x, world.z, 0.02);
      proto.root.position.set(world.x, ground, world.z);
      proto.root.rotation.y = rot;
      proto.root.name = "deco_" + id;
      group.add(proto.root);

      if (options.collide) {
        this.collision.addBox({
          x: world.x,
          z: world.z,
          halfX: proto.size.x * 0.5,
          halfZ: proto.size.z * 0.5,
          rotation: rot,
          topY: ground + proto.size.y,
          name: id,
        });
        this.buildingBoxes.push({
          x: world.x,
          z: world.z,
          halfX: proto.size.x * 0.5,
          halfZ: proto.size.z * 0.5,
          rot,
          cos: Math.cos(rot),
          sin: Math.sin(rot),
          height: proto.size.y,
        });
      }
      return { proto, ground, world };
    };

    // Street lighting along the high street.
    const lampZ = [15.4, 18.7, 22.0, 29.2, 32.5, 35.8, 39.0, 41.6];
    for (let i = 0; i < lampZ.length; i++) {
      const west = i % 2 === 0;
      place("street-lamp", west ? 26.78 : 27.62, lampZ[i], west ? ROT.EAST : ROT.WEST);
    }

    // Benches ringing the square.
    place("bench", 27.1, 28.7, ROT.NORTH);
    place("bench", 29.0, 28.5, ROT.NORTH);
    place("bench", 26.1, 23.0, ROT.SOUTH);
    place("bench", 28.5, 26.0, ROT.WEST);
    place("bench", 30.9, 42.0, ROT.WEST);

    place("sign", 27.95, 42.0, ROT.SOUTH);
    place("barrel", 28.9, 15.0, 0.4);
    place("barrel", 29.2, 14.65, 1.1);
    place("crate", 29.05, 40.1, -0.3);
    place("crate", 28.75, 40.35, 0.6);
    place("logs", 34.45, 16.95, 0.5);
    place("handcart", 32.1, 35.15, 1.1);
    place("vegetable-patch", 34.2, 21.75, 0.2);
    place("vegetable-patch", 35.15, 42.0, -0.4);
    place("hedge", 24.2, 31.1, ROT.NORTH);
    place("hedge", 29.35, 41.1, ROT.WEST);
    place("flowers", 24.85, 28.9, 0);
    place("flowers", 29.65, 27.4, 0);
    place("flowers", 33.2, 37.0, 0);
    place("flowers", 36.0, 26.6, 0);
    place("washing-line", 24.2, 37.2, ROT.NORTH);
    place("beehives", 36.55, 30.55, 0.2);

    // Small enclosed pens / garden borders.
    place("wood-fence", 32.45, 37.0, Math.PI / 2);
    place("wood-fence", 36.25, 37.0, Math.PI / 2);
    place("stone-fence", 37.35, 27.1, 0.12, 0.55);
  }

  // --------------------------------------------------------------- farm crops
  _buildFarmField() {
    const group = new THREE.Group();
    group.name = "Crops";
    this.scene.add(group);
    this.groups.crops = group;

    const node = this.assets.getCollectionNode("nature", "crop");
    if (!node) return;
    const { parts } = this.assets.makeInstancedParts(node, { scale: WORLD_SCALE });

    const placements = [];
    const min = sourceToWorld(FARM_FIELD.minX, FARM_FIELD.minZ);
    const max = sourceToWorld(FARM_FIELD.maxX, FARM_FIELD.maxZ);
    const step = 2.1;
    for (let x = min.x + 1.1; x < max.x; x += step) {
      for (let z = min.z + 1.1; z < max.z; z += step) {
        placements.push({
          x: x + (this.rng() - 0.5) * 0.4,
          y: this._ground(x, z, 0),
          z: z + (this.rng() - 0.5) * 0.4,
          rot: this.rng() * Math.PI * 2,
          scale: 1.0 + this.rng() * 0.35,
        });
      }
    }

    this.assets.createInstanced(parts, placements, {
      scene: group,
      name: "crop",
      castShadow: false,
      receiveShadow: true,
    });
  }

  // -------------------------------------------------------------------- nature
  _buildNature() {
    const group = new THREE.Group();
    group.name = "Nature";
    this.scene.add(group);
    this.groups.nature = group;

    const types = [
      { id: "pine", count: 34, scale: [0.85, 1.3], margin: 2.2, collide: 0.5, cast: true },
      { id: "round_tree", count: 36, scale: [0.9, 1.35], margin: 2.0, collide: 0.62, cast: true },
      { id: "birch_tree", count: 22, scale: [0.9, 1.2], margin: 2.0, collide: 0.45, cast: true },
      { id: "bush", count: 46, scale: [0.8, 1.5], margin: 1.2, collide: 0, cast: true },
      { id: "rock", count: 22, scale: [0.8, 1.7], margin: 1.0, collide: 0.65, cast: true },
      {
        id: "grass_tuft",
        count: 340,
        scale: [0.7, 1.5],
        margin: 0.25,
        collide: 0,
        cast: false,
        small: true,
      },
      {
        id: "wildflower",
        count: 150,
        scale: [0.7, 1.3],
        margin: 0.3,
        collide: 0,
        cast: false,
        small: true,
      },
    ];

    for (const type of types) {
      const node = this.assets.getCollectionNode("nature", type.id);
      if (!node) continue;
      const { parts } = this.assets.makeInstancedParts(node, {
        scale: WORLD_SCALE,
      });
      const placements = [];
      let attempts = 0;
      const maxAttempts = type.count * 40;
      let placed = 0;

      while (placed < type.count && attempts < maxAttempts) {
        attempts++;
        const sourceX = 4 + this.rng() * 40;
        const sourceZ = 4 + this.rng() * 40;
        const world = sourceToWorld(sourceX, sourceZ);
        if (!this._canPlaceNature(world.x, world.z, type)) continue;
        if (type.collide === 0 && this._inFarm(world.x, world.z, 1.0)) continue;

        const scale = lerp(type.scale[0], type.scale[1], this.rng());
        const y = this._ground(world.x, world.z, 0);
        placements.push({
          x: world.x,
          y,
          z: world.z,
          rot: this.rng() * Math.PI * 2,
          scale,
        });
        if (type.collide > 0) {
          this.collision.addCircle({
            x: world.x,
            z: world.z,
            radius: type.collide * scale,
            topY: y + type.collide * 3 * scale,
            name: type.id,
          });
          this.trees.push({ x: world.x, z: world.z, radius: type.collide * scale });
        }
        placed++;
      }

      this.assets.createInstanced(parts, placements, {
        scene: group,
        name: type.id,
        castShadow: type.cast && !type.small,
        receiveShadow: true,
      });
    }

    this._scatterRocksNearWater(group);
  }

  _scatterRocksNearWater(group) {
    // A handful of rocks hugging the river banks.
    const nodes = ["rock"];
    for (const id of nodes) {
      const node = this.assets.getCollectionNode("nature", id);
      if (!node) continue;
      const { parts } = this.assets.makeInstancedParts(node, { scale: WORLD_SCALE });
      const placements = [];
      for (let i = 0; i < 260 && placements.length < 18; i++) {
        const world = sourceToWorld(6 + this.rng() * 36, 8 + this.rng() * 32);
        const y = this._ground(world.x, world.z, 0);
        if (y === null) continue;
        if (y > WATER_LEVEL + 2.4 || y < WATER_LEVEL + 0.1) continue;
        if (this._pathEdgeDistance(world.x, world.z) < 1.1) continue;
        if (
          this.buildingBoxes.some((box) => {
            const dx = world.x - box.x;
            const dz = world.z - box.z;
            const lx = dx * box.cos + dz * box.sin;
            const lz = -dx * box.sin + dz * box.cos;
            return (
              Math.abs(lx) <= box.halfX + 0.8 &&
              Math.abs(lz) <= box.halfZ + 0.8
            );
          })
        ) {
          continue;
        }
        const scale = 0.8 + this.rng() * 1.1;
        placements.push({
          x: world.x,
          y,
          z: world.z,
          rot: this.rng() * Math.PI * 2,
          scale,
        });
      }
      this.assets.createInstanced(parts, placements, {
        scene: group,
        name: id + "_river",
        castShadow: true,
        receiveShadow: true,
      });
    }
  }

  _canPlaceNature(x, z, type) {
    const margin = type.margin;
    if (x < -200 || x > 200 || z < -200 || z > 200) return false;

    const ground = this.heightfield.sample(x, z);
    if (ground === null) return false;
    if (ground < WATER_LEVEL + (type.small ? 0.35 : 0.5)) return false;

    // Keep the spawn area clear.
    const spawnDx = x - this.spawn.x;
    const spawnDz = z - this.spawn.z;
    if (spawnDx * spawnDx + spawnDz * spawnDz < (type.small ? 5 : 8) ** 2) {
      return false;
    }

    for (const box of this.buildingBoxes) {
      const dx = x - box.x;
      const dz = z - box.z;
      const lx = dx * box.cos + dz * box.sin;
      const lz = -dx * box.sin + dz * box.cos;
      if (
        Math.abs(lx) <= box.halfX + margin &&
        Math.abs(lz) <= box.halfZ + margin
      ) {
        return false;
      }
    }

    const plazaDx = x - PLAZA_WORLD.x;
    const plazaDz = z - PLAZA_WORLD.z;
    if (
      plazaDx * plazaDx + plazaDz * plazaDz <
      (PLAZA_RADIUS_WORLD + margin) ** 2
    ) {
      return false;
    }

    if (this._pathEdgeDistance(x, z) < margin) return false;
    if (this._inFarm(x, z, margin)) return false;

    const padDx = x - sourceToWorld(PADDOCK.x, PADDOCK.z).x;
    const padDz = z - sourceToWorld(PADDOCK.x, PADDOCK.z).z;
    const padR = PADDOCK.radius * WORLD_SCALE + margin;
    if (padDx * padDx + padDz * padDz < padR * padR) return false;

    return true;
  }

  _pathEdgeDistance(x, z) {
    let min = Infinity;
    for (const seg of this.pathSegments) {
      const d = pointSegmentDistance(x, z, seg.ax, seg.az, seg.bx, seg.bz);
      const edge = d - seg.halfWidth;
      if (edge < min) min = edge;
    }
    return min;
  }

  _inFarm(x, z, margin = 0) {
    const min = sourceToWorld(FARM_FIELD.minX, FARM_FIELD.minZ);
    const max = sourceToWorld(FARM_FIELD.maxX, FARM_FIELD.maxZ);
    return (
      x > min.x - margin &&
      x < max.x + margin &&
      z > min.z - margin &&
      z < max.z + margin
    );
  }

  // ------------------------------------------------------------------- animals
  _buildAnimals() {
    const group = new THREE.Group();
    group.name = "Animals";
    this.scene.add(group);
    this.groups.animals = group;

    for (const entry of ANIMAL_LAYOUT) {
      const node = this.assets.getCollectionNode("animals", entry.id.toUpperCase());
      if (!node) {
        console.warn("[Kinstead] missing animal", entry.id);
        continue;
      }
      const proto = this.assets.makePrototype(node, {
        scale: WORLD_SCALE,
        castShadow: true,
        receiveShadow: true,
      });
      const world = sourceToWorld(entry.x, entry.z);
      const y = this._ground(world.x, world.z, 0);
      proto.root.position.set(world.x, y, world.z);
      proto.root.rotation.y = entry.rot;
      proto.root.name = "animal_" + entry.id;
      group.add(proto.root);

      this.animals.push({
        root: proto.root,
        type: entry.id,
        home: new THREE.Vector3(world.x, y, world.z),
        target: new THREE.Vector3(world.x, y, world.z),
        speed: entry.id === "chicken" || entry.id === "rabbit" ? 0.8 : 0.35,
        range: entry.id === "deer" || entry.id === "fox" ? 5 : 2.5,
        wait: this.rng() * 3,
        phase: this.rng() * Math.PI * 2,
        heading: entry.rot,
        duck: entry.id === "duck",
      });
    }
  }

  // ---------------------------------------------------------------------- NPCs
  _buildNPCs() {
    const group = new THREE.Group();
    group.name = "NPCs";
    this.scene.add(group);
    this.groups.npcs = group;

    for (const entry of NPC_LAYOUT) {
      const node = this.assets.getCollectionNode("villagers", entry.id);
      if (!node) {
        console.warn("[Kinstead] missing villager", entry.id);
        continue;
      }
      const proto = this.assets.makePrototype(node, {
        mode: "character",
        targetHeight: 1.72,
        castShadow: true,
        receiveShadow: true,
      });
      const world = sourceToWorld(entry.x, entry.z);
      const y = this._ground(world.x, world.z, 0);
      proto.root.position.set(world.x, y, world.z);
      proto.root.name = "npc_" + entry.id;
      group.add(proto.root);

      const animation = new CharacterAnimation(proto.root);
      const waypoints = entry.wander.map(([x, z]) => {
        const w = sourceToWorld(x, z);
        return new THREE.Vector3(w.x, this._ground(w.x, w.z, 0), w.z);
      });

      this.npcs.push({
        id: entry.id,
        label: entry.label,
        role: entry.role,
        root: proto.root,
        animation,
        waypoints,
        waypointIndex: 1 % waypoints.length,
        wait: this.rng() * 2,
        heading: 0,
        speed: 1.05 + this.rng() * 0.2,
        phase: this.rng() * Math.PI * 2,
      });
    }
  }

  // ------------------------------------------------------------------- regions
  _buildRegions() {
    this.regionWorld = new RegionWorld({
      scene: this.scene,
      assets: this.assets,
      collision: this.collision,
      heightfield: this.heightfield,
      waterLevel: WATER_LEVEL,
      quality: this.quality,
    });
    this.regionWorld.onAreaChange = (name) => {
      this.onAreaChange?.(name);
    };
    this.regionWorld.warmup(this.spawn.x, this.spawn.z, 1);
    this.groups.regions = this.regionWorld.root;
    this.terrainInfo.worldHalfExtent = WORLD_HALF_EXTENT;
    this.terrainInfo.regionSize = 240;
  }

  // -------------------------------------------------------------------- pollen
  _buildPollen() {
    const count = 260;
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const angle = this.rng() * Math.PI * 2;
      const radius = 12 + this.rng() * 95;
      const x = PLAZA_WORLD.x + Math.cos(angle) * radius;
      const z = PLAZA_WORLD.z + Math.sin(angle) * radius;
      const ground = this._ground(x, z, 0) ?? 0;
      const y = ground + 1.5 + this.rng() * 16;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
      phases[i] = this.rng() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      size: 0.16,
      map: createDotTexture(),
      color: 0xfff4d0,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const points = new THREE.Points(geometry, material);
    points.name = "Pollen";
    points.frustumCulled = false;
    this.scene.add(points);
    this.pollen = points;
    this.pollenBase = base;
    this.pollenPhases = phases;
  }

  // ------------------------------------------------------------------- update
  update(dt, time, playerPosition) {
    this.time = time;
    dt = Math.min(dt, 0.05);

    if (this.water) {
      this.water.position.y = this.waterBaseY + Math.sin(time * 0.7) * 0.006;
    }

    this._updateAtmosphere(dt, time, playerPosition);
    this.regionWorld?.update(dt, playerPosition);
    this._updateAnimals(dt, time);
    this._updateNPCs(dt, time, playerPosition);
    this._updatePollen(dt, time);
  }

  setCamera(camera) {
    this.camera = camera;
  }

  getClockText() {
    const hours = Math.floor(this.dayTime * 24);
    const minutes = Math.floor((this.dayTime * 24 - hours) * 60);
    return `Hari 1 · ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  getRegionName() {
    return this.regionWorld?.currentArea || "Kinstead";
  }

  setWeather(weather = {}) {
    this._weatherTarget = { ...this._weatherTarget, ...weather };
  }

  _updateAtmosphere(dt, time, playerPosition) {
    this.dayTime = (this.dayTime + dt / this.dayLength) % 1;
    const angle = (this.dayTime - 0.25) * Math.PI * 2;
    const direction = this._sunDirection.set(
      Math.cos(angle) * 0.82,
      Math.sin(angle),
      Math.cos(angle) * 0.34
    ).normalize();
    const daylight = smoothstep(-0.08, 0.3, direction.y);

    this.weather.fog +=
      (this._weatherTarget.fog - this.weather.fog) * (1 - Math.exp(-2 * dt));
    this.weather.rain +=
      (this._weatherTarget.rain - this.weather.rain) * (1 - Math.exp(-2 * dt));

    const focus = playerPosition || PLAZA_WORLD;
    const focusGround =
      (this.regionWorld ? this.regionWorld.heightAt(focus.x, focus.z) : null) ??
      this._ground(focus.x, focus.z, 0);
    this._sunFocus.set(focus.x, focusGround, focus.z);
    this.sun.target.position.copy(this._sunFocus);

    const lightDirection = this._sunDirection;
    if (lightDirection.y < 0.06) {
      lightDirection.set(
        -direction.x,
        Math.max(0.28, -direction.y),
        -direction.z
      ).normalize();
    }
    this.sun.position
      .copy(this._sunFocus)
      .addScaledVector(lightDirection, 260);

    const colors = this._skyColors;
    if (this.sky) {
      const uniforms = this.sky.material.uniforms;
      uniforms.topColor.value.copy(colors.nightTop).lerp(colors.dayTop, daylight);
      uniforms.horizonColor.value
        .copy(colors.nightHorizon)
        .lerp(colors.dayHorizon, daylight);
      uniforms.bottomColor.value
        .copy(colors.nightBottom)
        .lerp(colors.dayBottom, daylight);
      uniforms.sunColor.value.copy(colors.nightSun).lerp(colors.daySun, daylight);
      uniforms.sunDirection.value.copy(direction);
    }

    this.sun.color.copy(colors.nightSun).lerp(colors.daySun, daylight);
    this.sun.intensity = 0.32 + 2.5 * daylight;
    this.sun.castShadow = this.quality !== "low" && daylight > 0.1;
    this.hemi.intensity = 0.34 + 1.25 * daylight;
    this.ambient.intensity = 0.1 + 0.2 * daylight;
    this.scene.fog.color
      .copy(colors.nightFog)
      .lerp(colors.dayFog, daylight);
    const fogScale = 0.8 + this.weather.fog * 0.2;
    this.scene.fog.near = 150 * fogScale;
    this.scene.fog.far =
      (this.quality === "low" ? 520 : this.quality === "medium" ? 720 : 900) *
      fogScale;

    if (this.camera) {
      this.sky.position.copy(this.camera.position);
      this.stars.position.copy(this.camera.position);
      this.cloudGroup.position.set(this.camera.position.x, 0, this.camera.position.z);
    }
    if (this.stars) {
      this.stars.material.opacity = (1 - daylight) * 0.9;
    }
    for (const cloud of this.clouds || []) {
      cloud.material.opacity =
        cloud.userData.baseOpacity * (0.35 + daylight * 0.65);
      cloud.position.x += Math.sin(time * 0.01 + cloud.position.z) * dt * 0.6;
    }
  }

  _updateAnimals(dt, time) {
    for (const animal of this.animals) {
      const root = animal.root;
      const ground = this._ground(root.position.x, root.position.z, 0);

      animal.wait -= dt;
      if (animal.wait <= 0) {
        const angle = this.rng() * Math.PI * 2;
        const radius = animal.range * (0.35 + this.rng() * 0.65);
        animal.target.set(
          animal.home.x + Math.cos(angle) * radius,
          0,
          animal.home.z + Math.sin(angle) * radius
        );
        const targetGround = this._ground(animal.target.x, animal.target.z, 0);
        if (targetGround !== null) {
          if (
            (!animal.duck && targetGround < WATER_LEVEL + 0.25) ||
            this.collision.isBlockedXZ(animal.target.x, animal.target.z, 0.2, false)
          ) {
            animal.target.set(animal.home.x, 0, animal.home.z);
          }
          animal.target.y = targetGround;
          animal.wait = 2.5 + this.rng() * 5;
        }
      }

      const dx = animal.target.x - root.position.x;
      const dz = animal.target.z - root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.15) {
        const step = Math.min(dist, animal.speed * dt);
        const nx = root.position.x + (dx / dist) * step;
        const nz = root.position.z + (dz / dist) * step;
        const nextGround = this._ground(nx, nz, 0);
        if (
          nextGround !== null &&
          (animal.duck || nextGround > WATER_LEVEL + 0.2) &&
          !this.collision.isBlockedXZ(nx, nz, 0.12, false)
        ) {
          root.position.x = nx;
          root.position.z = nz;
          animal.heading = Math.atan2(dx, dz);
        } else {
          animal.wait = 0;
        }
      }

      const turn = angleLerp(animal.heading, root.rotation.y, 1 - Math.exp(-6 * dt));
      root.rotation.y = turn;

      let baseY = ground ?? animal.home.y;
      if (animal.duck) baseY = Math.max(baseY, WATER_LEVEL + 0.02);
      root.position.y = baseY + Math.sin(time * 2.1 + animal.phase) * 0.025;
    }
  }

  _updateNPCs(dt, time, playerPosition) {
    for (const npc of this.npcs) {
      const root = npc.root;
      let speed = 0;

      if (npc.wait > 0) {
        npc.wait -= dt;
        if (playerPosition) {
          const dx = playerPosition.x - root.position.x;
          const dz = playerPosition.z - root.position.z;
          if (dx * dx + dz * dz < 25) {
            npc.heading = Math.atan2(dx, dz);
          }
        }
      } else {
        const target = npc.waypoints[npc.waypointIndex];
        const dx = target.x - root.position.x;
        const dz = target.z - root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.4) {
          npc.waypointIndex = (npc.waypointIndex + 1) % npc.waypoints.length;
          npc.wait = 1.5 + this.rng() * 4;
        } else {
          const step = Math.min(dist, npc.speed * dt);
          const nx = root.position.x + (dx / dist) * step;
          const nz = root.position.z + (dz / dist) * step;
          const ground = this._ground(nx, nz, 0);
          if (ground !== null && !this.collision.isBlockedXZ(nx, nz, 0.25, false)) {
            root.position.x = nx;
            root.position.z = nz;
          } else {
            npc.wait = 1;
          }
          npc.heading = Math.atan2(dx, dz);
          speed = npc.speed;
        }
      }

      const ground = this._ground(root.position.x, root.position.z, 0);
      if (ground !== null) {
        root.position.y += (ground - root.position.y) * (1 - Math.exp(-14 * dt));
      }

      root.rotation.y = angleLerp(npc.heading, root.rotation.y, 1 - Math.exp(-8 * dt));
      npc.animation.update(dt, {
        speed,
        running: false,
        grounded: true,
        idleTime: time + npc.phase,
      });
    }
  }

  _updatePollen(dt, time) {
    if (!this.pollen) return;
    const position = this.pollen.geometry.getAttribute("position");
    const base = this.pollenBase;
    const phases = this.pollenPhases;
    for (let i = 0; i < position.count; i++) {
      const p = phases[i];
      position.setXYZ(
        i,
        base[i * 3] + Math.sin(time * 0.28 + p) * 3.2,
        base[i * 3 + 1] + Math.sin(time * 0.55 + p * 1.7) * 1.8,
        base[i * 3 + 2] + Math.cos(time * 0.23 + p) * 3.2
      );
    }
    position.needsUpdate = true;
  }

  // ------------------------------------------------------------------ quality
  _applyQuality(quality) {
    this.quality = quality;
    if (!this.sun) return;
    const shadows = quality !== "low";
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    this.regionWorld?.setQuality(quality);

    const span = quality === "high" ? 150 : quality === "medium" ? 110 : 80;
    this.sun.shadow.camera.left = -span;
    this.sun.shadow.camera.right = span;
    this.sun.shadow.camera.top = span;
    this.sun.shadow.camera.bottom = -span;
    this.sun.shadow.camera.far = 620;
    this.sun.shadow.camera.updateProjectionMatrix();

    const size = quality === "high" ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  setQuality(quality) {
    this._applyQuality(quality);
  }

  // ------------------------------------------------------------------ helpers
  _collisionHeightAt(x, z) {
    if (this.regionWorld) return this.regionWorld.heightAt(x, z);
    return this.heightfield ? this.heightfield.sample(x, z) : null;
  }

  _ground(x, z, offset = 0) {
    const h = this.heightfield ? this.heightfield.sample(x, z) : null;
    if (h === null) return 0;
    return h + offset;
  }

  getHeight(x, z) {
    if (this.regionWorld) return this.regionWorld.heightAt(x, z);
    return this.heightfield ? this.heightfield.sample(x, z) : null;
  }
}

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------
function createPathTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#b08a5c";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2800; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 0.5 + Math.random() * 1.8;
    const alpha = 0.03 + Math.random() * 0.12;
    ctx.fillStyle =
      Math.random() > 0.5
        ? `rgba(84, 60, 36, ${alpha})`
        : `rgba(226, 201, 158, ${alpha * 0.9})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 1 + Math.random() * 2.6;
    ctx.fillStyle = `rgba(96, 92, 84, ${0.08 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#5c4327";
  ctx.fillRect(62, 0, 16, 256);
  ctx.fillRect(178, 0, 16, 256);
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createCloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 14; i++) {
    const x = 24 + Math.random() * 80;
    const y = 40 + Math.random() * 46;
    const r = 10 + Math.random() * 24;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, "rgba(255,255,255,0.75)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.32)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDotTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.5, "rgba(255,255,255,0.65)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(canvas);
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function angleLerp(target, current, t) {
  let delta = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * t;
}

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lengthSq;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
