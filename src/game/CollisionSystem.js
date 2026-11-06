import * as THREE from "three";

const EPS = 1e-6;

/**
 * Lightweight collision world:
 *  - height-field ground sampling
 *  - rotated box colliders for buildings
 *  - circle colliders for trunks / posts
 *  - deep-water blocking and world bounds
 *  - camera line-of-sight clearance
 *
 * Everything works in the XZ plane; the character is a vertical circle.
 */
export class CollisionSystem {
  constructor({ heightAt, waterLevel, bounds, platforms = [] }) {
    this.heightAt = heightAt;
    this.waterLevel = waterLevel;
    this.bounds = bounds;
    this.platforms = platforms;
    this.boxes = [];
    this.circles = [];
    this.deepWaterMargin = 0.32;
  }

  addBox({ x, z, halfX, halfZ, rotation = 0, topY = 100, name = "box", region = null }) {
    const collider = {
      type: "box",
      x,
      z,
      halfX,
      halfZ,
      rotation,
      cos: Math.cos(rotation),
      sin: Math.sin(rotation),
      topY,
      name,
      region,
    };
    this.boxes.push(collider);
    return collider;
  }

  addCircle({ x, z, radius, topY = 100, name = "circle", region = null }) {
    const collider = { type: "circle", x, z, radius, topY, name, region };
    this.circles.push(collider);
    return collider;
  }

  addPlatform(platform) {
    this.platforms.push(platform);
    return platform;
  }

  /** Remove every collider owned by a streamed region. Core colliders are kept. */
  removeRegion(regionId) {
    this.boxes = this.boxes.filter((box) => box.region !== regionId);
    this.circles = this.circles.filter((circle) => circle.region !== regionId);
    this.platforms = this.platforms.filter(
      (platform) => platform.region !== regionId
    );
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  terrainHeight(x, z) {
    return this.heightAt(x, z);
  }

  groundHeight(x, z) {
    let height = this.heightAt(x, z);
    if (height === null || height === undefined) return null;
    for (const platform of this.platforms) {
      if (
        x >= platform.minX &&
        x <= platform.maxX &&
        z >= platform.minZ &&
        z <= platform.maxZ &&
        platform.topY > height
      ) {
        height = platform.topY;
      }
    }
    return height;
  }

  onPlatform(x, z) {
    for (const platform of this.platforms) {
      if (
        x >= platform.minX &&
        x <= platform.maxX &&
        z >= platform.minZ &&
        z <= platform.maxZ
      ) {
        return platform;
      }
    }
    return null;
  }

  isDeepWater(x, z) {
    if (this.onPlatform(x, z)) return false;
    const height = this.heightAt(x, z);
    if (height === null || height === undefined) return true;
    return height < this.waterLevel - this.deepWaterMargin;
  }

  isInsideWorld(x, z, margin = 0) {
    return (
      x >= this.bounds.minX + margin &&
      x <= this.bounds.maxX - margin &&
      z >= this.bounds.minZ + margin &&
      z <= this.bounds.maxZ - margin
    );
  }

  /** Is the XZ point inside a solid (with optional extra margin)? */
  isBlockedXZ(x, z, margin = 0, includeCircles = true) {
    for (const box of this.boxes) {
      const dx = x - box.x;
      const dz = z - box.z;
      const lx = dx * box.cos + dz * box.sin;
      const lz = -dx * box.sin + dz * box.cos;
      if (
        Math.abs(lx) <= box.halfX + margin &&
        Math.abs(lz) <= box.halfZ + margin
      ) {
        return true;
      }
    }
    if (includeCircles) {
      for (const circle of this.circles) {
        const dx = x - circle.x;
        const dz = z - circle.z;
        const r = circle.radius + margin;
        if (dx * dx + dz * dz <= r * r) return true;
      }
    }
    return false;
  }

  /**
   * Push a circle out of static geometry. Mutates the supplied position.
   * Returns true when a correction was applied.
   */
  resolveCircle(position, radius) {
    let corrected = false;

    for (let pass = 0; pass < 2; pass++) {
      for (const box of this.boxes) {
        if (this._resolveBox(position, radius, box)) corrected = true;
      }
      for (const circle of this.circles) {
        if (this._resolveCircle(position, radius, circle)) corrected = true;
      }
    }
    return corrected;
  }

  _resolveBox(position, radius, box) {
    const dx = position.x - box.x;
    const dz = position.z - box.z;
    const cos = box.cos;
    const sin = box.sin;

    // world -> collider local
    const lx = dx * cos + dz * sin;
    const lz = -dx * sin + dz * cos;

    const qx = Math.max(-box.halfX, Math.min(box.halfX, lx));
    const qz = Math.max(-box.halfZ, Math.min(box.halfZ, lz));
    let ex = lx - qx;
    let ez = lz - qz;
    let d2 = ex * ex + ez * ez;

    if (d2 >= radius * radius) return false;

    let pushX;
    let pushZ;

    if (d2 > EPS) {
      const d = Math.sqrt(d2);
      const push = radius - d;
      pushX = (ex / d) * push;
      pushZ = (ez / d) * push;
    } else {
      // Centre is inside the rectangle: escape along the shallowest axis.
      const penX = box.halfX - Math.abs(lx) + radius;
      const penZ = box.halfZ - Math.abs(lz) + radius;
      if (penX < penZ) {
        pushX = (lx >= 0 ? 1 : -1) * penX;
        pushZ = 0;
      } else {
        pushX = 0;
        pushZ = (lz >= 0 ? 1 : -1) * penZ;
      }
    }

    // local -> world
    position.x += pushX * cos - pushZ * sin;
    position.z += pushX * sin + pushZ * cos;
    return true;
  }

  _resolveCircle(position, radius, circle) {
    const dx = position.x - circle.x;
    const dz = position.z - circle.z;
    const r = radius + circle.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;

    if (d2 < EPS) {
      position.x += r;
      return true;
    }
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    position.x += dx * push;
    position.z += dz * push;
    return true;
  }

  /**
   * Axis-separated horizontal movement. Position is mutated in place.
   * Returns { moved, blocked }.
   */
  move(position, dx, dz, radius) {
    if (dx === 0 && dz === 0) return { moved: false, blocked: false };

    let blocked = false;
    const startX = position.x;
    const startZ = position.z;
    const startWater = this.isDeepWater(startX, startZ);

    const tryAxis = (ax, az) => {
      if (ax === 0 && az === 0) return;
      const nx = position.x + ax;
      const nz = position.z + az;
      if (!this.isInsideWorld(nx, nz, 1.0)) {
        blocked = true;
        return;
      }
      if (!startWater && this.isDeepWater(nx, nz)) {
        blocked = true;
        return;
      }
      const savedX = position.x;
      const savedZ = position.z;
      position.x = nx;
      position.z = nz;
      this.resolveCircle(position, radius);
      if (!startWater && this.isDeepWater(position.x, position.z)) {
        position.x = savedX;
        position.z = savedZ;
        blocked = true;
      }
    };

    tryAxis(dx, 0);
    tryAxis(0, dz);
    this.resolveCircle(position, radius);

    if (!startWater && this.isDeepWater(position.x, position.z)) {
      position.x = startX;
      position.z = startZ;
      blocked = true;
    }

    if (!this.isInsideWorld(position.x, position.z, 0.5)) {
      position.x = THREE.MathUtils.clamp(
        position.x,
        this.bounds.minX + 0.5,
        this.bounds.maxX - 0.5
      );
      position.z = THREE.MathUtils.clamp(
        position.z,
        this.bounds.minZ + 0.5,
        this.bounds.maxZ - 0.5
      );
      blocked = true;
    }

    const moved =
      Math.abs(position.x - startX) > 1e-5 ||
      Math.abs(position.z - startZ) > 1e-5;

    return { moved, blocked };
  }

  /**
   * Returns a fraction 0..1 of the segment from -> to that is clear.
   * Used by the third-person camera to avoid buildings and terrain.
   */
  cameraClearance(from, to, margin = 0.4) {
    const steps = 18;
    const point = new THREE.Vector3();

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      point.lerpVectors(from, to, t);

      const ground = this.heightAt(point.x, point.z);
      if (ground !== null && point.y < ground + 0.45) {
        return Math.max(0.02, (i - 1) / steps);
      }

      for (const box of this.boxes) {
        if (point.y > box.topY + margin) continue;
        const dx = point.x - box.x;
        const dz = point.z - box.z;
        const lx = dx * box.cos + dz * box.sin;
        const lz = -dx * box.sin + dz * box.cos;
        if (
          Math.abs(lx) < box.halfX + margin &&
          Math.abs(lz) < box.halfZ + margin
        ) {
          return Math.max(0.02, (i - 1) / steps);
        }
      }
      for (const circle of this.circles) {
        if (point.y > circle.topY + margin) continue;
        const dx = point.x - circle.x;
        const dz = point.z - circle.z;
        const r = circle.radius + margin;
        if (dx * dx + dz * dz < r * r) {
          return Math.max(0.02, (i - 1) / steps);
        }
      }
    }
    return 1;
  }
}
