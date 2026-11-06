import {
  WORLD_SCALE,
  WATER_LEVEL,
  FLATTEN,
  BUILDING_LAYOUT,
  PLAZA,
} from "./WorldLayout.js";
import { HeightField, flattenTerrain } from "./HeightField.js";

const LOCAL_TARGET_BUILDINGS = new Set(["watermill", "fishery", "windgen"]);

/**
 * Sculpt the village into the hilly Kinstead terrain:
 *  1. gently flatten the central village bowl,
 *  2. cut a level terrace under every building,
 *  3. do a final tight pass so no footprint corner overhangs a pond.
 * Water vertices are never raised; the river and ponds keep their shape.
 */
export function sculptVillageTerrain(
  surface,
  heightfield,
  manifest,
  { scale = WORLD_SCALE, offsetX = -24 * WORLD_SCALE, offsetZ = -24 * WORLD_SCALE } = {}
) {
  const center = FLATTEN.center;
  const centerWorld = {
    x: (center.x - 24) * scale,
    z: (center.z - 24) * scale,
  };
  let targetHeight = heightfield.sample(centerWorld.x, centerWorld.z);
  if (targetHeight === null) targetHeight = 1.5;
  targetHeight = Math.max(targetHeight, WATER_LEVEL + 1.2);

  flattenTerrain(surface, {
    center,
    innerRadius: FLATTEN.innerRadius,
    outerRadius: FLATTEN.outerRadius,
    targetHeight: targetHeight / scale,
    waterLevel: WATER_LEVEL / scale,
    strength: FLATTEN.strength,
  });

  const sizes = new Map(
    (manifest.categories.buildings?.items || []).map((item) => [item.id, item.size])
  );
  const footRadius = (entry) => {
    const size = sizes.get(entry.id);
    if (!size) return 0;
    return Math.hypot(size[0], size[2]) * 0.5;
  };

  for (const entry of BUILDING_LAYOUT) {
    const radius = footRadius(entry);
    if (!radius) continue;
    const point = {
      x: (entry.x - 24) * scale,
      z: (entry.z - 24) * scale,
    };
    const local = heightfield.sample(point.x, point.z);
    if (local === null) continue;
    const inner = radius + 0.7;
    const target = LOCAL_TARGET_BUILDINGS.has(entry.id)
      ? Math.max(local, WATER_LEVEL + 1.0)
      : targetHeight;
    flattenTerrain(surface, {
      center: { x: entry.x, z: entry.z },
      innerRadius: inner,
      outerRadius: inner + 2.0,
      targetHeight: target / scale,
      waterLevel: WATER_LEVEL / scale,
      strength: 1.0,
    });
  }

  // Flatten the market square as one piece so the plaza disc sits flush.
  flattenTerrain(surface, {
    center: PLAZA,
    innerRadius: PLAZA.radius + 0.6,
    outerRadius: PLAZA.radius + 2.2,
    targetHeight: targetHeight / scale,
    waterLevel: WATER_LEVEL / scale,
    strength: 1.0,
  });

  const mid = HeightField.fromMesh(surface, { scale, offsetX, offsetZ });
  for (const entry of BUILDING_LAYOUT) {
    const radius = footRadius(entry);
    if (!radius) continue;
    const point = {
      x: (entry.x - 24) * scale,
      z: (entry.z - 24) * scale,
    };
    const local = mid.sample(point.x, point.z);
    if (local === null) continue;
    const inner = radius + 0.6;
    flattenTerrain(surface, {
      center: { x: entry.x, z: entry.z },
      innerRadius: inner,
      outerRadius: inner + 0.4,
      targetHeight: Math.max(local, WATER_LEVEL + 0.8) / scale,
      waterLevel: WATER_LEVEL / scale,
      strength: 1.0,
    });
  }

  return targetHeight;
}
