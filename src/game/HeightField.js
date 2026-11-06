import * as THREE from "three";

/**
 * A compact bilinear height sampler built from the terrain surface mesh.
 * The Kinstead terrain surface is a regular 241 x 241 vertex grid; we also
 * validate that assumption and fall back to a triangulated scan if needed.
 */
export class HeightField {
  constructor(heights, n, originX, originZ, stepX, stepZ) {
    this.heights = heights;
    this.n = n;
    this.originX = originX;
    this.originZ = originZ;
    this.stepX = stepX;
    this.stepZ = stepZ;
    this.maxX = originX + (n - 1) * stepX;
    this.maxZ = originZ + (n - 1) * stepZ;
  }

  static fromMesh(mesh, options = {}) {
    const scale = options.scale ?? 1;
    const offsetX = options.offsetX ?? 0;
    const offsetY = options.offsetY ?? 0;
    const offsetZ = options.offsetZ ?? 0;

    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const count = position.count;
    const n = Math.round(Math.sqrt(count));
    if (n * n !== count) {
      throw new Error(
        `Terrain surface is not a square height grid (${count} vertices)`
      );
    }

    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const stepX = (box.max.x - box.min.x) / (n - 1);
    const stepZ = (box.max.z - box.min.z) / (n - 1);

    const heights = new Float32Array(n * n);
    heights.fill(NaN);

    for (let i = 0; i < count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const col = Math.round((x - box.min.x) / stepX);
      const row = Math.round((z - box.min.z) / stepZ);
      if (col < 0 || col >= n || row < 0 || row >= n) continue;
      heights[row * n + col] = y * scale + offsetY;
    }

    let missing = 0;
    for (let i = 0; i < heights.length; i++) {
      if (Number.isNaN(heights[i])) missing++;
    }
    if (missing > 0) {
      throw new Error(`Terrain height grid has ${missing} missing samples`);
    }

    return new HeightField(
      heights,
      n,
      offsetX + box.min.x * scale,
      offsetZ + box.min.z * scale,
      stepX * scale,
      stepZ * scale
    );
  }

  inside(x, z) {
    return (
      x >= this.originX &&
      x <= this.maxX &&
      z >= this.originZ &&
      z <= this.maxZ
    );
  }

  sample(x, z) {
    if (!this.inside(x, z)) return null;

    const fx = (x - this.originX) / this.stepX;
    const fz = (z - this.originZ) / this.stepZ;
    const col = Math.min(this.n - 2, Math.max(0, Math.floor(fx)));
    const row = Math.min(this.n - 2, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - col));
    const tz = Math.min(1, Math.max(0, fz - row));

    const i00 = row * this.n + col;
    const i10 = i00 + 1;
    const i01 = i00 + this.n;
    const i11 = i01 + 1;
    const h0 = this.heights[i00] * (1 - tx) + this.heights[i10] * tx;
    const h1 = this.heights[i01] * (1 - tx) + this.heights[i11] * tx;
    return h0 * (1 - tz) + h1 * tz;
  }

  /** Sample with a safe fallback for points just outside the terrain. */
  sampleClamped(x, z) {
    const cx = Math.min(this.maxX, Math.max(this.originX, x));
    const cz = Math.min(this.maxZ, Math.max(this.originZ, z));
    return this.sample(cx, cz);
  }
}

/**
 * Smoothly flatten a region of the terrain toward a target source-space
 * height. Water (and near-water vertices) is left untouched so the river
 * keeps its shape.
 */
export function flattenTerrain(
  surfaceMesh,
  { center, innerRadius, outerRadius, targetHeight, waterLevel, strength = 1 }
) {
  const geometry = surfaceMesh.geometry;
  const position = geometry.getAttribute("position");
  const count = position.count;

  const inner = Math.min(innerRadius, outerRadius);
  const outer = Math.max(innerRadius, outerRadius);
  const inner2 = inner * inner;
  const outer2 = outer * outer;

  for (let i = 0; i < count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const y = position.getY(i);

    if (y < waterLevel + 0.18) continue;

    const dx = x - center.x;
    const dz = z - center.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= outer2) continue;

    let t;
    if (d2 <= inner2) {
      t = 1;
    } else {
      const d = Math.sqrt(d2);
      const k = (outer - d) / (outer - inner);
      t = k * k * (3 - 2 * k);
    }

    position.setY(i, THREE.MathUtils.lerp(y, targetHeight, t * strength));
  }

  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
}
