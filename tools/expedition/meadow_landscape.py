"""Tiled scenery for Dawn Meadow, positioned on the existing walk and water grid."""

ASSETS = (
    "stone-bridge", "wooden-landing", "tall-grass",
    "reeds", "river-stones", "ruin-wall",
    "lily-pads", "fallen-log", "cascade",
)

# Coordinates are tile centers. Bridges mark the three existing guarded crossings.
PLACEMENTS = {
    "stone-bridge": [(29, 12), (62, 12), (94, 12)],
    "wooden-landing": [(26, 17), (45, 34), (79, 41), (107, 20)],
    "tall-grass": [(5, 10), (6, 13), (10, 11), (11, 13), (14, 9), (20, 13), (22, 31), (18, 44),
                   (31, 15), (38, 22), (49, 20), (51, 26), (48, 46), (52, 64), (64, 25), (70, 30),
                   (72, 38), (73, 53), (80, 55), (86, 63), (100, 11), (106, 44), (109, 46), (106, 70)],
    "reeds": [(7, 8), (12, 6), (10, 29), (16, 40), (20, 48), (36, 28), (45, 36), (42, 38),
              (53, 55), (69, 33), (77, 45), (83, 48), (82, 55), (102, 14), (106, 20), (111, 61)],
    "river-stones": [(7, 7), (8, 8), (11, 8), (27, 8), (35, 27), (42, 37), (68, 32), (77, 54),
                     (104, 16), (106, 19), (110, 60)],
    "ruin-wall": [(16, 26), (39, 38), (72, 46), (91, 39), (107, 25), (117, 63)],
    "lily-pads": [(8, 5), (10, 6), (9, 35), (14, 41), (39, 30), (40, 35), (70, 35), (84, 48),
                  (82, 49), (105, 17), (102, 19)],
    "fallen-log": [(5, 8), (12, 7), (16, 16), (9, 49), (35, 26), (45, 25), (76, 28), (87, 42), (109, 30)],
    "cascade": [(28, 8), (62, 24), (104, 13)],
}


def position_for(kind, x, y, width, height, grid, reserved):
    if kind == "stone-bridge":
        if grid[y * width + x] != 7:
            raise ValueError(f"Missing guarded crossing at {x},{y}")
        return x, y

    allowed = {"lily-pads": {5}, "cascade": {5}, "ruin-wall": {4},
               "reeds": {1, 2, 3, 5}, "river-stones": {1, 2, 4, 5}}.get(kind, {1, 2, 3})
    shore = kind in {"wooden-landing", "reeds"}
    candidates = []
    for py in range(max(2, y - 14), min(height - 2, y + 15)):
        for px in range(max(2, x - 14), min(width - 2, x + 15)):
            index = py * width + px
            if (px, py) in reserved or grid[index] not in allowed:
                continue
            if shore and all(grid[index + delta] != 5 for delta in (-width, -1, 1, width)):
                continue
            candidates.append(((px - x)**2 + (py - y)**2, py, px))
    if not candidates:
        return None
    _, py, px = min(candidates)
    return px, py


def add_meadow_landscape(tiled):
    # Replace our layer in a re-export while respecting IDs belonging to other Tiled layers.
    layers = tiled["layers"]
    existing = next((layer for layer in layers if layer["name"] == "landscape"), None)
    if existing is None:
        existing = {"id": tiled["nextlayerid"], "name": "landscape", "type": "objectgroup",
                    "visible": True, "opacity": 1, "objects": []}
        layers.append(existing)
        tiled["nextlayerid"] += 1

    old_ids = {obj["name"]: obj["id"] for obj in existing["objects"]}
    width, height = tiled["width"], tiled["height"]
    grid = layers[0]["data"]
    tile_w, tile_h = tiled["tilewidth"], tiled["tileheight"]
    reserved = {(int(obj["x"] // tile_w), int(obj["y"] // tile_h))
                for layer in layers if layer["name"] in {"landmarks", "traversal"}
                for obj in layer["objects"]}
    objects = []
    for kind, points in PLACEMENTS.items():
        for x, y in points:
            name = f"{kind}-{x}-{y}"
            position = position_for(kind, x, y, width, height, grid, reserved)
            if position is None:
                continue
            reserved.add(position)
            px, py = position
            object_id = old_ids.get(name)
            if object_id is None:
                object_id = tiled["nextobjectid"]
                tiled["nextobjectid"] += 1
            objects.append({"id": object_id, "name": name, "type": kind, "point": True,
                            "x": px * tile_w + tile_w // 2, "y": py * tile_h + tile_h // 2, "visible": True})
    existing["objects"] = objects
