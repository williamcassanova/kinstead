import * as THREE from "three";

/**
 * Runtime GLB hierarchy inspector. Used to validate collections at load time
 * and to feed the visual asset atlas. The full offline report lives in
 * asset-inspection-report.json.
 */
export class AssetInspector {
  static inspect(root, { includeNodes = false } = {}) {
    const meshes = [];
    const materials = new Set();
    const animations = [];
    const skeletons = [];
    let nodes = 0;
    let vertices = 0;
    let triangles = 0;
    let skinnedMeshes = 0;

    root.traverse((node) => {
      nodes++;
      if (node.isMesh) {
        const geometry = node.geometry;
        const count = geometry?.getAttribute?.("position")?.count ?? 0;
        let tri = 0;
        if (geometry) {
          tri = geometry.index
            ? Math.floor(geometry.index.count / 3)
            : Math.floor(count / 3);
        }
        vertices += count;
        triangles += tri;
        if (node.isSkinnedMesh) skinnedMeshes++;
        const mats = Array.isArray(node.material)
          ? node.material
          : node.material
            ? [node.material]
            : [];
        meshes.push({
          name: node.name || "(mesh)",
          vertexCount: count,
          triangleCount: tri,
          materialNames: mats.map((m) => m.name || "(material)"),
          skinned: !!node.isSkinnedMesh,
          bounds: geometry?.boundingBox ? boundsOf(geometry.boundingBox) : null,
        });
        for (const material of mats) materials.add(material);
        if (node.skeleton) skeletons.push(node.skeleton);
      }
      if (node.animations) animations.push(...node.animations);
    });

    const box = new THREE.Box3().setFromObject(root);
    const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());

    return {
      nodes,
      meshes,
      meshCount: meshes.length,
      materialCount: materials.size,
      materialNames: [...materials].map((m) => m.name || "(material)"),
      vertexCount: vertices,
      triangleCount: triangles,
      skinnedMeshes,
      animationCount: animations.length,
      animationNames: animations.map((a) => a.name || "(clip)"),
      bounds: box.isEmpty() ? null : boundsOf(box),
      size: { x: size.x, y: size.y, z: size.z },
    };
  }

  static logSummary(label, root) {
    const info = AssetInspector.inspect(root);
    console.info(
      `[Kinstead] ${label}: ${info.nodes} nodes, ${info.meshCount} meshes, ` +
        `${info.vertexCount} verts, ${info.animationCount} animations, ` +
        `size ${info.size.x.toFixed(1)} x ${info.size.y.toFixed(1)} x ${info.size.z.toFixed(1)}`
    );
    return info;
  }

  static findSceneNode(root, name) {
    let found = null;
    root.traverse((node) => {
      if (!found && node.name === name) found = node;
    });
    return found;
  }

  static directChildrenWithMeshes(root) {
    const children = [];
    root.traverse((node) => {
      if (node !== root && node.parent && hasMesh(node)) children.push(node);
    });
    return children.filter((node, index, list) => {
      // Keep top-most mesh-bearing groups, not their mesh descendants.
      let parent = node.parent;
      while (parent && parent !== root) {
        if (hasMesh(parent)) return false;
        parent = parent.parent;
      }
      return list.indexOf(node) === index;
    });
  }
}

function hasMesh(node) {
  let found = false;
  node.traverse((child) => {
    if (child.isMesh) found = true;
  });
  return found;
}

function boundsOf(box) {
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size: [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z],
  };
}
