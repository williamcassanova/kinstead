#!/usr/bin/env python3
"""Inspect every GLB in the Kinstead Asset Library.

Reads the glTF JSON chunk of each binary .glb, walks the complete scene
hierarchy, resolves world matrices, computes per-node and per-collection
bounds from POSITION accessors, and records materials, vertex attributes,
skins and animations.

Outputs:
  asset-inspection-report.json  (full hierarchy + mesh/material detail)
  asset-catalog.json            (flat catalogue of individually reusable units)

Never writes to the asset library. Pure standard library.
"""
from __future__ import annotations

import json
import math
import os
import re
import struct
import sys
import time
from datetime import datetime, timezone

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBRARY = os.path.join(os.path.dirname(PROJECT), "KINSTEAD-ASSET-LIBRARY")

IGNORED_DIRS = {"browser", "materials"}
ICON = {
    "buildings": "building",
    "nature": "nature",
    "animals": "animal",
    "villagers": "villager",
    "decorations": "decoration",
    "terrain": "terrain",
}


# --------------------------------------------------------------------------
# glb reading
# --------------------------------------------------------------------------
def read_glb(path):
    with open(path, "rb") as fh:
        header = fh.read(12)
        if len(header) != 12:
            raise ValueError("truncated GLB header")
        magic, version, length = struct.unpack("<4sII", header)
        if magic != b"glTF":
            raise ValueError("not a GLB file")
        if version != 2:
            raise ValueError("unsupported GLB version %d" % version)
        gltf = None
        binary = b""
        while fh.tell() < length:
            chunk_header = fh.read(8)
            if len(chunk_header) < 8:
                break
            chunk_length, chunk_type = struct.unpack("<II", chunk_header)
            payload = fh.read(chunk_length)
            if chunk_type == 0x4E4F534A:  # JSON
                gltf = json.loads(payload.decode("utf-8"))
            elif chunk_type == 0x004E4942:  # BIN
                binary = payload
        if gltf is None:
            raise ValueError("missing JSON chunk")
        return gltf, binary


# --------------------------------------------------------------------------
# matrix helpers (row-major 4x4)
# --------------------------------------------------------------------------
IDENTITY = [
    [1.0, 0.0, 0.0, 0.0],
    [0.0, 1.0, 0.0, 0.0],
    [0.0, 0.0, 1.0, 0.0],
    [0.0, 0.0, 0.0, 1.0],
]


def mat_mul(a, b):
    out = [[0.0] * 4 for _ in range(4)]
    for r in range(4):
        for c in range(4):
            out[r][c] = (
                a[r][0] * b[0][c]
                + a[r][1] * b[1][c]
                + a[r][2] * b[2][c]
                + a[r][3] * b[3][c]
            )
    return out


def mat_from_gltf_matrix(values):
    # glTF matrix is column-major
    return [[float(values[c * 4 + r]) for c in range(4)] for r in range(4)]


def mat_trs(node):
    if "matrix" in node:
        return mat_from_gltf_matrix(node["matrix"])
    t = node.get("translation", [0.0, 0.0, 0.0])
    r = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
    s = node.get("scale", [1.0, 1.0, 1.0])
    x, y, z, w = r
    rot = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0.0],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0.0],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
    return [
        [rot[0][0] * s[0], rot[0][1] * s[1], rot[0][2] * s[2], t[0]],
        [rot[1][0] * s[0], rot[1][1] * s[1], rot[1][2] * s[2], t[1]],
        [rot[2][0] * s[0], rot[2][1] * s[1], rot[2][2] * s[2], t[2]],
        [0.0, 0.0, 0.0, 1.0],
    ]


def transform_point(m, p):
    x, y, z = p
    return (
        m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
        m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
        m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3],
    )


def bounds_union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return {
        "min": [min(a["min"][i], b["min"][i]) for i in range(3)],
        "max": [max(a["max"][i], b["max"][i]) for i in range(3)],
    }


def bounds_world(local, matrix):
    mn, mx = local["min"], local["max"]
    corners = [
        (mn[0], mn[1], mn[2]),
        (mn[0], mn[1], mx[2]),
        (mn[0], mx[1], mn[2]),
        (mn[0], mx[1], mx[2]),
        (mx[0], mn[1], mn[2]),
        (mx[0], mn[1], mx[2]),
        (mx[0], mx[1], mn[2]),
        (mx[0], mx[1], mx[2]),
    ]
    pts = [transform_point(matrix, c) for c in corners]
    return {
        "min": [min(p[i] for p in pts) for i in range(3)],
        "max": [max(p[i] for p in pts) for i in range(3)],
    }


def bounds_size(b):
    if b is None:
        return [0.0, 0.0, 0.0]
    return [round(b["max"][i] - b["min"][i], 5) for i in range(3)]


def rounded_bounds(b, digits=5):
    if b is None:
        return None
    return {
        "min": [round(v, digits) for v in b["min"]],
        "max": [round(v, digits) for v in b["max"]],
        "size": bounds_size(b),
    }


# --------------------------------------------------------------------------
# inspection
# --------------------------------------------------------------------------
def accessor_bounds(gltf, index):
    acc = gltf["accessors"][index]
    mn = acc.get("min")
    mx = acc.get("max")
    if mn is None or mx is None:
        mn = [0.0, 0.0, 0.0]
        mx = [0.0, 0.0, 0.0]
    return {"min": [float(v) for v in mn], "max": [float(v) for v in mx]}


def mesh_info(gltf, mesh_index):
    mesh = gltf["meshes"][mesh_index]
    primitives = []
    local = None
    vertex_count = 0
    triangle_count = 0
    attributes = set()
    material_indices = []
    for prim in mesh.get("primitives", []):
        pos_acc = prim.get("attributes", {}).get("POSITION")
        p_bounds = accessor_bounds(gltf, pos_acc) if pos_acc is not None else None
        if p_bounds:
            local = bounds_union(local, p_bounds)
        count = gltf["accessors"][pos_acc]["count"] if pos_acc is not None else 0
        vertex_count += count
        mode = prim.get("mode", 4)
        if "indices" in prim:
            idx_count = gltf["accessors"][prim["indices"]]["count"]
        else:
            idx_count = count
        if mode == 4:
            triangle_count += idx_count // 3
        attrs = sorted(prim.get("attributes", {}).keys())
        attributes.update(attrs)
        mat_index = prim.get("material")
        if mat_index is not None and mat_index not in material_indices:
            material_indices.append(mat_index)
        primitives.append(
            {
                "mode": mode,
                "attributes": prim.get("attributes", {}),
                "attributeNames": attrs,
                "materialIndex": mat_index,
                "materialName": material_name(gltf, mat_index),
                "vertexCount": count,
                "indexCount": idx_count,
                "bounds": rounded_bounds(p_bounds),
            }
        )
    return {
        "index": mesh_index,
        "name": mesh.get("name"),
        "primitiveCount": len(primitives),
        "vertexCount": vertex_count,
        "triangleCount": triangle_count,
        "attributes": sorted(attributes),
        "materialIndices": material_indices,
        "materialNames": [material_name(gltf, i) for i in material_indices],
        "bounds": rounded_bounds(local),
        "primitives": primitives,
    }


def material_name(gltf, index):
    if index is None:
        return None
    mat = gltf.get("materials", [])[index]
    return mat.get("name") or "material_%d" % index


def mesh_kind(primitive):
    attrs = primitive.get("attributes", {})
    if "JOINTS_0" in attrs and "WEIGHTS_0" in attrs:
        return "SkinnedMesh"
    return "Mesh"


def node_label(node, index):
    return node.get("name") or "node_%d" % index


def inspect_glb(path, category, include_hierarchy=True):
    gltf, binary = read_glb(path)
    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    materials = gltf.get("materials", [])
    animations = gltf.get("animations", [])
    skins = gltf.get("skins", [])
    scenes = gltf.get("scenes", [])
    scene_roots = []
    if scenes:
        scene_roots = scenes[gltf.get("scene", 0)].get("nodes", [])

    node_entries = []
    scene_bounds = None
    meshes_used = set()
    materials_used = set()
    total_vertices = 0
    total_triangles = 0
    skinned_mesh_count = 0

    def walk(index, parent_matrix, parent_path, depth):
        nonlocal scene_bounds, total_vertices, total_triangles, skinned_mesh_count
        node = nodes[index]
        world = mat_mul(parent_matrix, mat_trs(node))
        label = node_label(node, index)
        path_str = (parent_path + "/" + label) if parent_path else label
        entry = {
            "index": index,
            "name": node.get("name"),
            "path": path_str,
            "depth": depth,
            "type": "Group",
            "children": node.get("children", []),
            "meshIndex": node.get("mesh"),
            "meshName": None,
            "materialNames": [],
            "vertexCount": 0,
            "triangleCount": 0,
            "bounds": None,
            "worldBounds": None,
            "skinIndex": node.get("skin"),
        }
        if "mesh" in node:
            info = mesh_info(gltf, node["mesh"])
            meshes_used.add(node["mesh"])
            entry["meshName"] = info["name"]
            entry["materialNames"] = info["materialNames"]
            entry["vertexCount"] = info["vertexCount"]
            entry["triangleCount"] = info["triangleCount"]
            entry["bounds"] = info["bounds"]
            entry["worldBounds"] = rounded_bounds(
                bounds_world(info["bounds"], world) if info["bounds"] else None
            )
            kind = "Mesh"
            for prim in meshes[node["mesh"]].get("primitives", []):
                if mesh_kind(prim) == "SkinnedMesh":
                    kind = "SkinnedMesh"
                    skinned_mesh_count += 1
                    break
            if kind == "SkinnedMesh":
                entry["type"] = "SkinnedMesh"
            else:
                entry["type"] = "Mesh"
            total_vertices += info["vertexCount"]
            total_triangles += info["triangleCount"]
            if info["bounds"]:
                scene_bounds = bounds_union(
                    scene_bounds, bounds_world(info["bounds"], world)
                )
            for mi in info["materialIndices"]:
                materials_used.add(mi)
        if include_hierarchy:
            node_entries.append(entry)
        for child in node.get("children", []):
            walk(child, world, path_str, depth + 1)

    for root in scene_roots:
        walk(root, IDENTITY, "", 0)

    mesh_reports = [mesh_info(gltf, i) for i in sorted(meshes_used)]
    material_reports = []
    for i in sorted(materials_used):
        mat = materials[i]
        pbr = mat.get("pbrMetallicRoughness", {})
        material_reports.append(
            {
                "index": i,
                "name": material_name(gltf, i),
                "baseColorFactor": pbr.get("baseColorFactor"),
                "baseColorTexture": pbr.get("baseColorTexture"),
                "metallicFactor": pbr.get("metallicFactor"),
                "roughnessFactor": pbr.get("roughnessFactor"),
                "alphaMode": mat.get("alphaMode", "OPAQUE"),
                "doubleSided": mat.get("doubleSided", False),
                "emissiveFactor": mat.get("emissiveFactor"),
                "extensions": mat.get("extensions"),
            }
        )

    animation_reports = []
    for i, anim in enumerate(animations):
        samplers = anim.get("samplers", [])
        duration = 0.0
        for sampler in samplers:
            inp = sampler.get("input")
            if inp is not None:
                duration = max(duration, accessor_bounds(gltf, inp)["max"][0])
        animation_reports.append(
            {
                "index": i,
                "name": anim.get("name") or "animation_%d" % i,
                "channels": len(anim.get("channels", [])),
                "samplers": len(samplers),
                "durationSeconds": round(duration, 4),
                "targetNodes": sorted(
                    {
                        ch.get("target", {}).get("node")
                        for ch in anim.get("channels", [])
                        if ch.get("target", {}).get("node") is not None
                    }
                ),
            }
        )

    skin_reports = []
    for i, skin in enumerate(skins):
        skin_reports.append(
            {
                "index": i,
                "name": skin.get("name") or "skin_%d" % i,
                "jointCount": len(skin.get("joints", [])),
                "skeleton": skin.get("skeleton"),
            }
        )

    return {
        "file": os.path.relpath(path, LIBRARY).replace(os.sep, "/"),
        "category": category,
        "sizeBytes": os.path.getsize(path),
        "glbVersion": 2,
        "generator": gltf.get("asset", {}).get("generator"),
        "counts": {
            "nodes": len(nodes),
            "meshes": len(meshes_used),
            "meshesInFile": len(meshes),
            "materials": len(materials_used),
            "materialsInFile": len(materials),
            "vertices": total_vertices,
            "triangles": total_triangles,
            "animations": len(animations),
            "skins": len(skins),
            "textures": len(gltf.get("textures", [])),
            "images": len(gltf.get("images", [])),
            "skinnedMeshes": skinned_mesh_count,
            "sceneRoots": len(scene_roots),
        },
        "sceneRoots": [
            {"index": i, "name": nodes[i].get("name"), "children": len(nodes[i].get("children", []))}
            for i in scene_roots
        ],
        "bounds": rounded_bounds(scene_bounds),
        "boundsSize": bounds_size(scene_bounds),
        "hierarchy": node_entries,
        "meshes": mesh_reports,
        "materials": material_reports,
        "animations": animation_reports,
        "skins": skin_reports,
        "hasAnimations": bool(animations),
        "hasSkeleton": bool(skins),
        "hasTextures": bool(gltf.get("textures")),
        "extensionsUsed": gltf.get("extensionsUsed", []),
        "_gltf": gltf,
        "_binary": binary,
    }


# --------------------------------------------------------------------------
# extraction units
# --------------------------------------------------------------------------
def subtree_nodes(gltf, root_index):
    out = []
    stack = [root_index]
    while stack:
        idx = stack.pop()
        if idx in out:
            continue
        out.append(idx)
        for child in gltf["nodes"][idx].get("children", []):
            stack.append(child)
    return out


def unit_bounds(gltf, root_index, report_lookup):
    total = None
    vertex_count = 0
    mesh_count = 0
    attrs = set()
    material_names = []

    def rec(idx, matrix):
        nonlocal total, vertex_count, mesh_count
        node = gltf["nodes"][idx]
        world = mat_mul(matrix, mat_trs(node))
        if "mesh" in node:
            info = mesh_info(gltf, node["mesh"])
            total = bounds_union(total, bounds_world(info["bounds"], world) if info["bounds"] else None)
            vertex_count += info["vertexCount"]
            mesh_count += 1
            attrs.update(info["attributes"])
            for mn in info["materialNames"]:
                if mn not in material_names:
                    material_names.append(mn)
        for child in node.get("children", []):
            rec(child, world)

    rec(root_index, IDENTITY)
    return total, vertex_count, mesh_count, sorted(attrs), material_names


def slugify(value):
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "asset"


def labelize(name):
    name = name.replace("_", " ")
    name = re.sub(r"\s+", " ", name).strip()
    return " ".join(w[:1].upper() + w[1:] for w in name.split(" "))


def villager_meta(name):
    # Villager_farmer_1000
    parts = re.split(r"[_\s]+", name)
    role = parts[1] if len(parts) > 2 else "villager"
    number = parts[-1]
    return {
        "role": role,
        "variant": number,
        "label": "%s %s" % (role.capitalize(), number),
    }


def find_units(report):
    gltf = report["_gltf"]
    nodes = gltf["nodes"]
    roots = [r["index"] for r in report["sceneRoots"]]
    category = report["category"]

    # Unwrap collection roots: a root with no mesh and several children that
    # themselves contain meshes.
    def has_mesh(idx):
        return any("mesh" in nodes[i] for i in subtree_nodes(gltf, idx))

    def is_collection_wrapper(node):
        name = (node.get("name") or "").lower()
        return (
            not name
            or name in ("auxscene", "scene")
            or "library" in name
            or "showroom" in name
        )

    units = []
    for root in roots:
        node = nodes[root]
        children = node.get("children", [])
        if (
            is_collection_wrapper(node)
            and "mesh" not in node
            and len(children) > 1
            and all(has_mesh(c) for c in children)
        ):
            units.extend(children)
        else:
            units.append(root)

    # De-duplicate while keeping order
    seen = set()
    ordered = []
    for unit in units:
        if unit not in seen:
            seen.add(unit)
            ordered.append(unit)
    return ordered


def extract_units(report):
    gltf = report["_gltf"]
    nodes = gltf["nodes"]
    units = []
    for root_index in find_units(report):
        name = nodes[root_index].get("name") or "node_%d" % root_index
        bounds, verts, meshes, attrs, mats = unit_bounds(gltf, root_index, None)
        if bounds is None:
            continue
        size = bounds_size(bounds)
        unit = {
            "id": slugify(name),
            "name": name,
            "label": labelize(name),
            "category": report["category"],
            "kind": ICON.get(report["category"], "asset"),
            "sourceFile": report["file"],
            "sourceNodeIndex": root_index,
            "sourceNodePath": next(
                (e["path"] for e in report["hierarchy"] if e["index"] == root_index),
                name,
            ),
            "bounds": rounded_bounds(bounds),
            "size": [round(v, 4) for v in size],
            "footprint": [round(size[0], 4), round(size[2], 4)],
            "height": round(size[1], 4),
            "vertexCount": verts,
            "meshCount": meshes,
            "attributes": attrs,
            "materialNames": mats,
            "hasVertexColors": any("COLOR_0" in a for a in attrs),
            "hasAnimations": report["hasAnimations"],
            "hasSkeleton": report["hasSkeleton"],
            "animations": [a["name"] for a in report["animations"]],
        }
        if report["category"] == "villagers":
            unit.update(villager_meta(name))
            unit["kind"] = "villager"
            unit["id"] = slugify(name)
        if report["category"] == "buildings":
            unit["kind"] = "building"
        if report["category"] == "nature":
            unit["kind"] = "plant"
        if report["category"] == "decorations":
            unit["kind"] = "decoration"
        if report["category"] == "animals":
            unit["kind"] = "animal"
        if report["category"] == "terrain":
            unit["kind"] = "terrain"
        units.append(unit)
    return units


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def discover():
    found = []
    for name in sorted(os.listdir(LIBRARY)):
        folder = os.path.join(LIBRARY, name)
        if not os.path.isdir(folder) or name in IGNORED_DIRS:
            continue
        for filename in sorted(os.listdir(folder)):
            if filename.lower().endswith(".glb"):
                found.append((os.path.join(folder, filename), name))
    return found


def main():
    started = time.time()
    files = discover()
    if not files:
        print("No GLB files found in", LIBRARY, file=sys.stderr)
        return 1
    print("Kinstead GLB inspection - %d files" % len(files))
    reports = []
    catalog = []
    for n, (path, category) in enumerate(files, 1):
        print("  [%d/%d] %s" % (n, len(files), os.path.relpath(path, LIBRARY)))
        report = inspect_glb(path, category)
        units = extract_units(report)
        report.pop("_gltf", None)
        report.pop("_binary", None)
        report["extractableUnits"] = units
        report["collection"] = len(units) > 1
        reports.append(report)
        for unit in units:
            unit["sourceGlb"] = report["file"]
            unit["generatedFrom"] = "asset-library"
            catalog.append(unit)
        print(
            "        %d nodes, %d meshes, %d materials, %d animations, %d extractable units"
            % (
                report["counts"]["nodes"],
                report["counts"]["meshesInFile"],
                report["counts"]["materialsInFile"],
                report["counts"]["animations"],
                len(units),
            )
        )

    totals = {
        "glbFilesInspected": len(reports),
        "nodes": sum(r["counts"]["nodes"] for r in reports),
        "meshes": sum(r["counts"]["meshesInFile"] for r in reports),
        "materials": sum(r["counts"]["materialsInFile"] for r in reports),
        "vertices": sum(r["counts"]["vertices"] for r in reports),
        "triangles": sum(r["counts"]["triangles"] for r in reports),
        "animations": sum(r["counts"]["animations"] for r in reports),
        "skins": sum(r["counts"]["skins"] for r in reports),
        "textures": sum(r["counts"]["textures"] for r in reports),
        "extractableUnits": len(catalog),
    }

    # duplicate detection by geometry signature (mesh vertex counts + bounds)
    signatures = {}
    for report in reports:
        sig = []
        for mesh in report["meshes"]:
            sig.append((mesh["vertexCount"], tuple(mesh["bounds"]["size"]) if mesh["bounds"] else None))
        key = json.dumps(sorted(sig))
        signatures.setdefault(key, []).append(report["file"])
    duplicates = [
        {"files": group, "reason": "identical mesh vertex counts and bounds"}
        for group in signatures.values()
        if len(group) > 1
    ]

    report = {
        "library": "Kinstead Asset Library",
        "libraryPath": LIBRARY,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "tool": "tools/inspect_assets.py",
        "totals": totals,
        "duplicateCandidates": duplicates,
        "files": reports,
        "characterCandidates": [
            unit
            for unit in catalog
            if unit["kind"] == "villager"
        ],
        "assetsWithAnimations": [
            r["file"] for r in reports if r["hasAnimations"]
        ],
        "assetsWithSkeletons": [
            r["file"] for r in reports if r["hasSkeleton"]
        ],
    }

    catalog_doc = {
        "library": "Kinstead Asset Library",
        "generatedAt": report["generatedAt"],
        "note": (
            "Every entry is an independently reusable subtree of a GLB collection. "
            "bounds are in the source GLB's local space (1 unit = one Kinstead tile)."
        ),
        "counts": {
            "total": len(catalog),
            "byCategory": {
                c: sum(1 for u in catalog if u["category"] == c)
                for c in sorted({u["category"] for u in catalog})
            },
        },
        "assets": catalog,
    }

    out_report = os.path.join(PROJECT, "asset-inspection-report.json")
    out_catalog = os.path.join(PROJECT, "asset-catalog.json")
    with open(out_report, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    with open(out_catalog, "w", encoding="utf-8") as fh:
        json.dump(catalog_doc, fh, indent=2)

    print("\nDone in %.2fs" % (time.time() - started))
    print("  %s" % out_report)
    print("  %s" % out_catalog)
    print("  totals: %s" % json.dumps(totals))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
