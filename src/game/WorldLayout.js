// Layout data for the Kinstead village. Coordinates are in the source GLB
// tile space (0..48) and converted to world metres by WorldBuilder.

export const WORLD_SCALE = 10;
export const TERRAIN_SOURCE_SIZE = 48;
export const TERRAIN_SOURCE_CENTER = 24;
export const WATER_LEVEL = -0.02 * WORLD_SCALE;

export const FLATTEN = {
  center: { x: 27.2, z: 27.0 },
  innerRadius: 14.0,
  outerRadius: 19.0,
  strength: 0.94,
};

export const SPAWN_SOURCE = { x: 27.2, z: 42.4 };

export const ROT = {
  SOUTH: 0,
  WEST: -Math.PI / 2,
  EAST: Math.PI / 2,
  NORTH: Math.PI,
};

export function sourceToWorld(x, z) {
  return {
    x: (x - TERRAIN_SOURCE_CENTER) * WORLD_SCALE,
    z: (z - TERRAIN_SOURCE_CENTER) * WORLD_SCALE,
  };
}

export function worldToSource(x, z) {
  return {
    x: x / WORLD_SCALE + TERRAIN_SOURCE_CENTER,
    z: z / WORLD_SCALE + TERRAIN_SOURCE_CENTER,
  };
}

// Buildings face local +Z (door/front). Rotation turns that front toward the
// street. x/z are the centre of the footprint in source tile space.
export const BUILDING_LAYOUT = [
  // west side of the high street
  { id: "stationer", x: 26.25, z: 40.8, rot: ROT.EAST },
  { id: "house", x: 26.25, z: 39.0, rot: ROT.EAST },
  { id: "vicarage", x: 25.6, z: 36.8, rot: ROT.EAST },
  { id: "watchhouse", x: 25.6, z: 33.6, rot: ROT.EAST },
  { id: "library", x: 25.6, z: 30.4, rot: ROT.EAST },
  { id: "flats", x: 26.25, z: 22.3, rot: ROT.EAST },
  { id: "grocer", x: 26.25, z: 19.8, rot: ROT.EAST },
  { id: "bakery", x: 26.25, z: 17.3, rot: ROT.EAST },
  { id: "inn", x: 25.6, z: 14.4, rot: ROT.EAST },

  // east side of the high street
  { id: "market", x: 28.15, z: 40.9, rot: ROT.WEST },
  { id: "clinic", x: 28.15, z: 38.6, rot: ROT.WEST },
  { id: "chapel", x: 28.15, z: 35.8, rot: ROT.WEST },
  { id: "school", x: 28.15, z: 33.0, rot: ROT.WEST },
  { id: "villa", x: 28.15, z: 30.4, rot: ROT.WEST },
  { id: "townhall", x: 28.8, z: 22.8, rot: ROT.WEST },
  { id: "terrace", x: 28.8, z: 19.5, rot: ROT.WEST },
  { id: "coffeehouse", x: 28.15, z: 16.5, rot: ROT.WEST },
  { id: "tavern", x: 28.15, z: 14.0, rot: ROT.WEST },

  // the square
  { id: "fountaingarden", x: 27.2, z: 26.0, rot: ROT.SOUTH },
  { id: "statue", x: 25.8, z: 27.9, rot: ROT.SOUTH },
  { id: "well", x: 25.9, z: 24.3, rot: ROT.SOUTH },
  { id: "bandstand", x: 28.7, z: 24.3, rot: ROT.SOUTH },

  // southern approach
  { id: "station", x: 30.8, z: 41.0, rot: ROT.WEST },
  { id: "garden", x: 33.5, z: 39.2, rot: ROT.SOUTH },
  { id: "playground", x: 36.5, z: 39.5, rot: ROT.SOUTH },

  // eastern farm belt
  { id: "farm", x: 33.8, z: 33.5, rot: ROT.SOUTH },
  { id: "orchard", x: 39.5, z: 18.0, rot: ROT.SOUTH },
  { id: "rosegarden", x: 33.0, z: 43.5, rot: ROT.SOUTH },
  { id: "allotment", x: 35.0, z: 21.0, rot: ROT.SOUTH },
  { id: "lumber", x: 35.6, z: 16.2, rot: ROT.SOUTH },
  { id: "windgen", x: 42.0, z: 10.5, rot: ROT.SOUTH },
  { id: "workshop", x: 31.9, z: 25.0, rot: ROT.SOUTH },

  // riverside
  { id: "watermill", x: 17.0, z: 28.5, rot: ROT.EAST },
  { id: "fishery", x: 15.4, z: 23.0, rot: ROT.EAST },

  // northern edge
  { id: "mansion", x: 34.2, z: 13.6, rot: ROT.SOUTH },
  { id: "apartments", x: 31.2, z: 14.0, rot: ROT.SOUTH },
];

export const USED_BUILDING_IDS = [...new Set(BUILDING_LAYOUT.map((b) => b.id))];

export const PLAZA = { x: 27.2, z: 26.0, radius: 2.45 };
export const PLAZA_WORLD = sourceToWorld(PLAZA.x, PLAZA.z);
export const PLAZA_RADIUS_WORLD = PLAZA.radius * WORLD_SCALE;

function pathPoints(points) {
  return points.map(([x, z]) => sourceToWorld(x, z));
}

export const PATH_LAYOUT = [
  {
    id: "high-street-south",
    width: 0.72,
    points: pathPoints([
      [27.2, 46.0],
      [27.2, 42.5],
      [27.2, 39.5],
      [27.2, 35.5],
      [27.2, 31.5],
      [27.2, 28.9],
    ]),
  },
  {
    id: "high-street-north",
    width: 0.72,
    points: pathPoints([
      [27.2, 23.1],
      [27.2, 20.5],
      [27.2, 17.5],
      [27.2, 14.0],
      [27.2, 11.2],
    ]),
  },
  {
    id: "riverside-lane",
    width: 0.58,
    points: pathPoints([
      [25.0, 26.0],
      [22.5, 26.1],
      [20.0, 26.2],
      [17.2, 26.0],
      [16.0, 25.6],
      [15.4, 24.0],
    ]),
  },
  {
    id: "farm-lane",
    width: 0.55,
    points: pathPoints([
      [27.2, 34.8],
      [29.4, 34.9],
      [31.4, 34.7],
      [32.4, 34.8],
      [33.8, 35.0],
    ]),
  },
  {
    id: "orchard-lane",
    width: 0.55,
    points: pathPoints([
      [27.2, 18.4],
      [29.2, 17.5],
      [31.2, 17.2],
      [33.5, 17.1],
      [35.0, 17.2],
      [36.6, 17.2],
      [38.0, 17.8],
      [38.0, 19.2],
      [39.5, 19.3],
    ]),
  },
  {
    id: "wind-lane",
    width: 0.5,
    points: pathPoints([
      [27.2, 11.2],
      [30.5, 11.8],
      [34.0, 11.4],
      [37.6, 10.8],
      [40.0, 10.4],
      [42.0, 11.2],
    ]),
  },
  {
    id: "mill-lane",
    width: 0.45,
    points: pathPoints([
      [15.4, 24.0],
      [15.8, 25.2],
      [16.2, 26.2],
      [16.8, 27.2],
      [17.0, 28.0],
    ]),
  },
  {
    id: "south-lane",
    width: 0.55,
    points: pathPoints([
      [27.2, 37.1],
      [29.8, 37.3],
      [31.5, 38.0],
      [31.8, 39.8],
      [32.1, 41.5],
      [33.0, 42.7],
    ]),
  },
];

export const FARM_FIELD = {
  minX: 32.8,
  maxX: 35.9,
  minZ: 35.4,
  maxZ: 38.8,
};

export const PADDOCK = {
  x: 38.7,
  z: 36.7,
  radius: 1.85,
};

export const NPC_LAYOUT = [
  {
    id: "villager-shop-1131",
    label: "Maribel",
    role: "Baker",
    x: 27.05,
    z: 18.5,
    wander: [[27.05, 18.5], [27.3, 21.0], [26.95, 22.3]],
  },
  {
    id: "villager-shop-1138",
    label: "Tomas",
    role: "Grocer",
    x: 27.2,
    z: 20.9,
    wander: [[27.2, 20.9], [27.35, 23.2], [27.1, 24.4]],
  },
  {
    id: "villager-clerk-1155",
    label: "Edwin",
    role: "Town Clerk",
    x: 27.2,
    z: 23.6,
    wander: [[27.2, 23.6], [27.5, 23.3], [27.2, 22.8]],
  },
  {
    id: "villager-fisher-1093",
    label: "Nell",
    role: "Fisher",
    x: 15.4,
    z: 24.0,
    wander: [[15.4, 24.0], [16.0, 25.6], [16.2, 24.6]],
  },
  {
    id: "villager-teacher-1186",
    label: "Ada",
    role: "Teacher",
    x: 29.3,
    z: 32.2,
    wander: [[29.3, 32.2], [29.4, 33.8], [29.1, 35.4], [28.9, 33.8]],
  },
  {
    id: "villager-nurse-1248",
    label: "Rose",
    role: "Nurse",
    x: 28.0,
    z: 37.5,
    wander: [[28.0, 37.5], [29.4, 38.2], [30.0, 39.2]],
  },
  {
    id: "villager-watch-1279",
    label: "Hal",
    role: "Watchman",
    x: 27.2,
    z: 34.0,
    wander: [[27.2, 34.0], [27.4, 36.2], [27.2, 37.5]],
  },
  {
    id: "villager-farmer-1007",
    label: "Bram",
    role: "Farmer",
    x: 33.8,
    z: 35.1,
    wander: [[33.8, 35.1], [35.2, 35.0], [35.8, 36.2]],
  },
  {
    id: "villager-builder-1031",
    label: "Cato",
    role: "Builder",
    x: 32.2,
    z: 25.6,
    wander: [[32.2, 25.6], [33.4, 24.8], [33.8, 23.4]],
  },
  {
    id: "villager-clergy-1217",
    label: "Father Pike",
    role: "Clergy",
    x: 27.4,
    z: 35.0,
    wander: [[27.4, 35.0], [26.8, 33.4], [27.6, 32.4]],
  },
];

export const ANIMAL_LAYOUT = [
  { id: "cow", x: 37.9, z: 36.2, rot: 1.2 },
  { id: "cow", x: 39.6, z: 37.4, rot: 2.4 },
  { id: "sheep", x: 38.2, z: 35.4, rot: 0.4 },
  { id: "sheep", x: 39.1, z: 36.4, rot: 3.1 },
  { id: "sheep", x: 38.8, z: 38.0, rot: 5.0 },
  { id: "sheep", x: 37.5, z: 37.2, rot: 2.0 },
  { id: "chicken", x: 36.8, z: 35.3, rot: 0.2 },
  { id: "chicken", x: 37.1, z: 36.0, rot: 1.4 },
  { id: "chicken", x: 36.5, z: 36.4, rot: 2.8 },
  { id: "duck", x: 13.1, z: 24.4, rot: 0.4 },
  { id: "duck", x: 13.5, z: 25.2, rot: 1.8 },
  { id: "duck", x: 12.9, z: 25.7, rot: 3.2 },
  { id: "deer", x: 42.0, z: 20.0, rot: 2.3 },
  { id: "deer", x: 43.2, z: 34.0, rot: 4.1 },
  { id: "fox", x: 40.5, z: 20.5, rot: 1.1 },
  { id: "rabbit", x: 32.0, z: 37.6, rot: 0.6 },
  { id: "rabbit", x: 20.2, z: 38.5, rot: 2.2 },
];
