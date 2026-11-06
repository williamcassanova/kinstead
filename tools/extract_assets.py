#!/usr/bin/env python3
"""Extract individual reusable assets out of the Kinstead GLB collections.

The original asset library is only ever read. New GLBs are written under
this project's assets/ tree:

  assets/extracted/<category>/<id>.glb   one asset per file
  assets/world/collections/*.glb         byte-identical copies of the small
                                         collections used by the game
  assets/world/buildings/<id>.glb        curated buildings used by the world
  assets/world/terrain/gentle-spring.glb terrain used by the world
  assets/world/manifest.json             runtime catalogue

It also annotates asset-catalog.json with the extracted file paths.
"""
from __future__ import annotations

import copy
import json
import os
import shutil
import struct
import sys
from datetime import datetime, timezone

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIBRARY = os.path.join(os.path.dirname(PROJECT), "KINSTEAD-ASSET-LIBRARY")
EXTRACTED = os.path.join(PROJECT, "assets", "extracted")
WORLD = os.path.join(PROJECT, "assets", "world")

BUILDING_SELECTION = [
    "house", "villa", "flats", "terrace", "market", "bakery", "tavern",
    "grocer", "coffeehouse", "inn", "stationer", "library", "watchhouse",
    "vicarage", "farm", "windgen", "well", "fountaingarden", "park",
    "station", "school", "chapel", "townhall", "watermill", "garden",
    "statue", "pond", "playground", "allotment", "bandstand", "rosegarden",
    "lumber", "workshop", "fishery", "clinic", "mansion", "apartments",
    "musichall", "firestation", "builder", "orchard", "foundry",
]

COLLECTION_COPIES = {
    "nature": "kinstead-nature-library.glb",
    "animals": "kinstead-animals-library.glb",
    "decorations": "kinstead-decorations-library.glb",
    "villagers": "kinstead-villagers-library.glb",
}


# --------------------------------------------------------------------------
# glb io
# --------------------------------------------------------------------------
def read_glb(path):
    with open(path, "rb") as fh:
        magic, version, length = struct.unpack("<4sII", fh.read(12))
        if magic != b"glTF" or version != 2:
            raise ValueError("not a GLB v2: " + path)
        gltf = None
        binary = b""
        while fh.tell() < length:
            chunk_length, chunk_type = struct.unpack("<II", fh.read(8))
            payload = fh.read(chunk_length)
            if chunk_type == 0x4E4F534A:
                gltf = json.loads(payload.decode("utf-8"))
            elif chunk_type == 0x004E4942:
                binary = payload
        return gltf, binary


def write_glb(path, gltf, binary):
    json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    while len(json_bytes) % 4:
        json_bytes += b" "
    while len(binary) % 4:
        binary += b"\x00"
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, total))
        fh.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        fh.write(json_bytes)
        fh.write(struct.pack("<II", len(binary), 0x004E4942))
        fh.write(binary)


def zero_translation(node):
    node = copy.deepcopy(node)
    if "matrix" in node:
        matrix = list(node["matrix"])
        matrix[12] = 0.0
        matrix[13] = 0.0
        matrix[14] = 0.0
        node["matrix"] = matrix
    if "translation" in node:
        node["translation"] = [0.0, 0.0, 0.0]
    return node


def extract_unit(gltf, binary, root_index, label):
    nodes = gltf.get("nodes", [])
    meshes = gltf.get("meshes", [])
    materials = gltf.get("materials", [])

    if gltf.get("skins") or gltf.get("animations") or gltf.get("images") or gltf.get("textures"):
        raise NotImplementedError(
            "extraction of skinned/animated/textured GLBs is not implemented"
        )

    order = []
    parent_of = {}

    def collect(index, parent=None):
        if index in parent_of:
            return
        parent_of[index] = parent
        order.append(index)
        for child in nodes[index].get("children", []):
            collect(child, index)

    collect(root_index)
    old_to_new_node = {old: new for new, old in enumerate(order)}

    new_nodes = []
    new_meshes = []
    new_materials = []
    new_accessors = []
    new_views = []
    view_map = {}
    accessor_map = {}
    mesh_map = {}
    material_map = {}
    binary_parts = []
    binary_size = 0

    def add_view(old_view_index):
        if old_view_index in view_map:
            return view_map[old_view_index]
        view = gltf["bufferViews"][old_view_index]
        nonlocal binary_size
        while binary_size % 4:
            binary_parts.append(b"\x00")
            binary_size += 1
        start = view.get("byteOffset", 0)
        length = view["byteLength"]
        data = binary[start:start + length]
        out = {k: v for k, v in view.items() if k not in ("buffer", "byteOffset", "byteLength")}
        out["buffer"] = 0
        out["byteOffset"] = binary_size
        out["byteLength"] = length
        binary_parts.append(data)
        binary_size += length
        new_views.append(out)
        view_map[old_view_index] = len(new_views) - 1
        return view_map[old_view_index]

    def add_accessor(old_accessor_index):
        if old_accessor_index in accessor_map:
            return accessor_map[old_accessor_index]
        accessor = copy.deepcopy(gltf["accessors"][old_accessor_index])
        if "bufferView" in accessor:
            accessor["bufferView"] = add_view(accessor["bufferView"])
        sparse = accessor.get("sparse")
        if sparse:
            sparse["indices"]["bufferView"] = add_view(sparse["indices"]["bufferView"])
            sparse["values"]["bufferView"] = add_view(sparse["values"]["bufferView"])
        new_accessors.append(accessor)
        accessor_map[old_accessor_index] = len(new_accessors) - 1
        return accessor_map[old_accessor_index]

    def add_material(old_index):
        if old_index is None:
            return None
        if old_index in material_map:
            return material_map[old_index]
        material = copy.deepcopy(materials[old_index])
        new_materials.append(material)
        material_map[old_index] = len(new_materials) - 1
        return material_map[old_index]

    def add_mesh(old_mesh_index, mesh_name):
        if old_mesh_index in mesh_map:
            return mesh_map[old_mesh_index]
        mesh = copy.deepcopy(meshes[old_mesh_index])
        mesh["name"] = mesh.get("name") or mesh_name
        for prim in mesh.get("primitives", []):
            attrs = {}
            for key, accessor_index in prim.get("attributes", {}).items():
                attrs[key] = add_accessor(accessor_index)
            prim["attributes"] = attrs
            if "indices" in prim:
                prim["indices"] = add_accessor(prim["indices"])
            if "material" in prim:
                prim["material"] = add_material(prim["material"])
        new_meshes.append(mesh)
        mesh_map[old_mesh_index] = len(new_meshes) - 1
        return mesh_map[old_mesh_index]

    for old_index in order:
        node = zero_translation(nodes[old_index]) if old_index == root_index else copy.deepcopy(nodes[old_index])
        if "mesh" in node:
            node["mesh"] = add_mesh(node["mesh"], node.get("name") or label)
        if "children" in node:
            node["children"] = [old_to_new_node[c] for c in node["children"] if c in old_to_new_node]
            if not node["children"]:
                del node["children"]
        node.pop("skin", None)
        new_nodes.append(node)

    new_binary = b"".join(binary_parts)
    root_name = nodes[root_index].get("name") or label
    out = {
        "asset": {
            "version": "2.0",
            "generator": "Kinstead World Builder extractor (from %s)" % root_name,
        },
        "scene": 0,
        "scenes": [{"name": label, "nodes": [0]}],
        "nodes": new_nodes,
        "meshes": new_meshes,
        "materials": new_materials,
        "accessors": new_accessors,
        "bufferViews": new_views,
        "buffers": [{"byteLength": len(new_binary)}],
    }
    if not out["materials"]:
        del out["materials"]
    return out, new_binary


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def load_catalog():
    with open(os.path.join(PROJECT, "asset-catalog.json"), encoding="utf-8") as fh:
        return json.load(fh)


def units_by_source(catalog):
    by_key = {}
    for unit in catalog["assets"]:
        by_key[(unit["sourceFile"], unit["sourceNodeIndex"])] = unit
    return by_key


def safe_rmtree(path):
    if os.path.isdir(path):
        shutil.rmtree(path)


def main():
    catalog = load_catalog()
    by_key = units_by_source(catalog)

    source_files = {}
    for unit in catalog["assets"]:
        source_files.setdefault(unit["sourceFile"], None)

    source_gltfs = {}
    for rel in source_files:
        source_gltfs[rel] = read_glb(os.path.join(LIBRARY, rel))

    # clean generated directories only
    for category in ("buildings", "nature", "animals", "decorations", "villagers", "terrain"):
        safe_rmtree(os.path.join(EXTRACTED, category))
    safe_rmtree(os.path.join(WORLD, "collections"))
    safe_rmtree(os.path.join(WORLD, "buildings"))
    safe_rmtree(os.path.join(WORLD, "terrain"))

    extracted = []
    world_manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "worldScale": 10,
        "note": (
            "Source GLB units are Kinstead tiles. The game multiplies every asset "
            "by worldScale so a villager is roughly 1.4-1.7 m tall."
        ),
        "categories": {},
    }

    # --- extract every catalogue unit to assets/extracted -----------------
    print("Extracting individual assets...")
    for unit in catalog["assets"]:
        if unit["category"] == "buildings":
            if unit["sourceFile"] != "buildings/kinstead-buildings-library.glb":
                continue
            if unit["id"] not in BUILDING_SELECTION:
                continue
        if unit["category"] == "terrain" and unit["id"] != "gentle-spring":
            continue
        gltf, binary = source_gltfs[unit["sourceFile"]]
        try:
            out, out_binary = extract_unit(
                gltf, binary, unit["sourceNodeIndex"], unit["label"]
            )
        except Exception as exc:  # noqa: BLE001 - reported, not hidden
            print("  !! %s/%s: %s" % (unit["category"], unit["id"], exc))
            continue
        path = os.path.join(EXTRACTED, unit["category"], unit["id"] + ".glb")
        write_glb(path, out, out_binary)
        unit["extractedPath"] = os.path.relpath(path, PROJECT).replace(os.sep, "/")
        unit["extractedSizeBytes"] = os.path.getsize(path)
        extracted.append(unit)

    # --- curated world copies --------------------------------------------
    print("Building game world asset set...")
    collections_dir = os.path.join(WORLD, "collections")
    os.makedirs(collections_dir, exist_ok=True)
    for category, filename in COLLECTION_COPIES.items():
        src = os.path.join(LIBRARY, category, filename)
        dst = os.path.join(collections_dir, filename)
        shutil.copy2(src, dst)
        world_manifest["categories"].setdefault(category, {"collection": os.path.relpath(dst, PROJECT).replace(os.sep, "/"), "items": []})

    # fill all collection items (game extracts nodes at runtime)
    for unit in catalog["assets"]:
        cat = unit["category"]
        if cat in COLLECTION_COPIES:
            world_manifest["categories"].setdefault(cat, {"items": []})
            world_manifest["categories"][cat]["items"].append(
                {
                    "id": unit["id"],
                    "label": unit["label"],
                    "role": unit.get("role"),
                    "sourceNode": unit["name"],
                    "size": unit["size"],
                    "meshCount": unit["meshCount"],
                    "file": unit.get("extractedPath"),
                }
            )

    # --- buildings used by the world ------------------------------------
    buildings_dir = os.path.join(WORLD, "buildings")
    os.makedirs(buildings_dir, exist_ok=True)
    building_units = [u for u in extracted if u["category"] == "buildings"]
    found = {u["id"]: u for u in building_units}
    chosen = []
    for name in BUILDING_SELECTION:
        unit = found.get(name)
        if unit is None:
            print("  !! building not found:", name)
            continue
        dst = os.path.join(buildings_dir, unit["id"] + ".glb")
        shutil.copy2(os.path.join(PROJECT, unit["extractedPath"]), dst)
        rel = os.path.relpath(dst, PROJECT).replace(os.sep, "/")
        unit["worldPath"] = rel
        chosen.append(
            {
                "id": unit["id"],
                "label": unit["label"],
                "file": rel,
                "size": unit["size"],
                "footprint": unit["footprint"],
                "height": unit["height"],
            }
        )
    world_manifest["categories"]["buildings"] = {"items": chosen}

    # --- terrain ---------------------------------------------------------
    terrain_units = [u for u in extracted if u["category"] == "terrain"]
    terrain_dir = os.path.join(WORLD, "terrain")
    os.makedirs(terrain_dir, exist_ok=True)
    terrain_items = []
    for unit in terrain_units:
        if unit["id"] not in ("gentle-spring",):
            continue
        dst = os.path.join(terrain_dir, unit["id"] + ".glb")
        shutil.copy2(os.path.join(PROJECT, unit["extractedPath"]), dst)
        rel = os.path.relpath(dst, PROJECT).replace(os.sep, "/")
        unit["worldPath"] = rel
        terrain_items.append(
            {
                "id": unit["id"],
                "label": unit["label"],
                "file": rel,
                "size": unit["size"],
            }
        )
    world_manifest["categories"]["terrain"] = {"items": terrain_items}

    # --- character manifest ---------------------------------------------
    villagers = [
        u for u in catalog["assets"] if u["category"] == "villagers"
    ]
    world_manifest["characters"] = [
        {
            "id": u["id"],
            "label": u["label"],
            "role": u["role"],
            "sourceNode": u["name"],
            "height": u["height"],
            "sourceFile": "assets/world/collections/kinstead-villagers-library.glb",
        }
        for u in villagers
    ]
    world_manifest["recommendedCharacters"] = [
        "villager-farmer-1007",
        "villager-builder-1031",
        "villager-fisher-1093",
        "villager-shop-1138",
        "villager-clerk-1155",
        "villager-teacher-1186",
        "villager-nurse-1248",
        "villager-watch-1279",
    ]

    with open(os.path.join(WORLD, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(world_manifest, fh, indent=2)

    # annotate original catalogue with extraction status
    extracted_keys = {
        (u["sourceFile"], u["sourceNodeIndex"]): u for u in extracted
    }
    for unit in catalog["assets"]:
        found_unit = extracted_keys.get((unit["sourceFile"], unit["sourceNodeIndex"]))
        if found_unit:
            unit["extracted"] = True
            unit["extractedPath"] = found_unit.get("extractedPath")
            if found_unit.get("worldPath"):
                unit["worldPath"] = found_unit["worldPath"]
        else:
            unit["extracted"] = False

    catalog["extraction"] = {
        "generatedAt": world_manifest["generatedAt"],
        "extractedCount": len(extracted),
        "extractedRoot": "assets/extracted",
        "worldRoot": "assets/world",
        "worldScale": 10,
    }
    with open(os.path.join(PROJECT, "asset-catalog.json"), "w", encoding="utf-8") as fh:
        json.dump(catalog, fh, indent=2)

    print("\nExtracted %d individual GLBs" % len(extracted))
    print("World buildings: %d" % len(chosen))
    print("Characters: %d" % len(world_manifest["characters"]))
    print("Manifest: assets/world/manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
