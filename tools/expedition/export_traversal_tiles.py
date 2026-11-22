"""Build seven themed traversal tilesets and Tiled traversal test courses.

From the repository root: py tools/expedition/export_traversal_tiles.py
"""

import argparse
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw

from build_bundle import REALMS_LAYOUT, sha256_file
from pixel_worlds import THEME_PALETTES, gen3, terrain_color

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "database-astral-expedition"
OUTPUT = BUNDLE / "overworld" / "traversal"
KINDS = ("ramp-up", "ramp-down", "stairs", "takeoff", "grip", "landing", "dash-start", "dash-target")
FACINGS = ("north", "east", "south", "west")
MATERIALS = {
    "meadow": ((123, 109, 79), (141, 187, 86)),
    "snow": ((111, 150, 178), (207, 242, 251)),
    "desert": ((188, 127, 72), (247, 211, 124)),
    "underwater": ((63, 118, 130), (111, 214, 201)),
    "volcano": ((81, 64, 68), (233, 140, 69)),
    "night": ((83, 78, 118), (172, 139, 229)),
    "aurora": ((122, 109, 180), (122, 237, 220)),
}


def paint_tile(theme, kind):
    """Paint a north-facing surface with a readable footprint and a material rim."""
    material, accent = MATERIALS[theme]
    sky = THEME_PALETTES[theme]["wall"]
    deep, shade, mid, rim = (terrain_color(material, n) for n in (-42, -20, 0, 38))
    rng = random.Random(theme)
    tile = Image.new("RGBA", (16, 16), terrain_color(sky, -10) + (255,))
    draw = ImageDraw.Draw(tile)
    draw.polygon([(1, 0), (14, 0), (15, 11), (13, 15), (2, 15), (0, 11)], fill=deep)
    draw.polygon([(2, 0), (13, 0), (15, 10), (12, 13), (3, 13), (0, 10)], fill=mid)
    for _ in range(18):
        x, y = rng.randint(3, 12), rng.randint(1, 11)
        draw.point((x, y), fill=terrain_color(material, rng.choice((-12, 12, 20))))
    # Rim details use the same materials as the neighboring overworld tiles.
    if theme == "meadow":
        draw.line([(1,8),(3,10),(2,13),(4,13)], fill=(96,137,55))
        draw.point([(3,8),(1,7),(4,11),(12,12)], fill=accent)
    elif theme == "snow":
        draw.polygon([(1,0),(5,0),(4,2),(2,4),(1,3)], fill=accent)
        draw.line([(11,11),(12,10),(14,9)], fill=(152,213,235))
    elif theme == "desert":
        draw.line([(1,9),(3,8),(5,8)], fill=(228,172,100))
        draw.line([(8,12),(10,11),(13,11)], fill=accent)
    elif theme == "underwater":
        draw.line([(2,12),(2,10),(3,9)], fill=(118,208,185))
        draw.point([(1,9),(3,9),(12,11)], fill=(211,139,178))
    elif theme == "volcano":
        draw.line([(1,12),(3,10),(3,7)], fill=deep)
        draw.point([(2,11),(3,9),(12,13)], fill=accent)
    elif theme == "night":
        draw.point([(2,3),(3,9),(12,12),(13,10)], fill=accent)
        draw.line((2,12,5,12), fill=(62,79,139))
    else:
        draw.line([(2,9),(4,12),(7,13)], fill=(188,158,235))
        draw.point([(2,8),(7,12),(12,11)], fill=accent)
    if kind in ("ramp-up", "ramp-down"):
        reverse = kind == "ramp-down"
        for x in (2, 13):
            draw.line((x, 0, x + (-1 if x == 2 else 1), 12), fill=rim)
        for y in (2, 5, 8, 11):
            draw.line((4, y, 11, y + (1 if reverse else -1)), fill=shade)
        head = 10 if reverse else 3
        draw.line([(5,head + (2 if not reverse else -2)), (8,head), (11,head + (2 if not reverse else -2))], fill=accent)
    elif kind == "stairs":
        for y in (1, 5, 9, 13):
            draw.line((2, y, 13, y), fill=rim)
            draw.line((2, y+1, 13, y+1), fill=shade)
            draw.point((6+(y%3),y+2), fill=deep)
    elif kind in ("takeoff", "grip", "landing"):
        draw.line((2, 2, 13, 2), fill=rim)
        if kind == "takeoff":
            draw.line([(5,7),(8,4),(11,7)], fill=accent, width=2)
        elif kind == "grip":
            for x in (4, 8, 12):
                draw.rectangle((x-1,4,x+1,6), fill=deep)
                draw.line((x-1,4,x+1,4), fill=accent)
        else:
            draw.rectangle((4,4,11,10), outline=accent)
            draw.point((8,7), fill=rim)
    else:
        draw.polygon([(8,2),(13,7),(8,12),(3,7)], fill=deep, outline=accent)
        if kind == "dash-start":
            draw.line([(6,7),(8,4),(10,7)], fill=accent, width=2)
        else:
            draw.ellipse((6,5,10,9), outline=rim)
            draw.point((8,7), fill=accent)
    return tile


def make_atlas(theme):
    atlas = Image.new("RGBA", (128, 64))
    rotations = (None, Image.Transpose.ROTATE_270, Image.Transpose.ROTATE_180, Image.Transpose.ROTATE_90)
    for x, kind in enumerate(KINDS):
        tile = paint_tile(theme, kind)
        for y, rotation in enumerate(rotations):
            atlas.paste(tile if rotation is None else tile.transpose(rotation), (x*16, y*16))
    return gen3.to_gen3(atlas, max_palettes=13).resize((256,128), Image.Resampling.NEAREST)


def tileset(theme):
    return {
        "type": "tileset", "version": "1.10", "tiledversion": "1.10.2",
        "name": f"{theme}-traversal", "image": f"{theme}-traversal.png",
        "tilewidth": 32, "tileheight": 32, "imagewidth": 256, "imageheight": 128,
        "tilecount": 32, "columns": 8, "margin": 0, "spacing": 0,
        "tiles": [
            {"id": row*len(KINDS)+col, "type": kind,
             "properties": [{"name": "direction", "type": "string", "value": facing}]}
            for row,facing in enumerate(FACINGS) for col,kind in enumerate(KINDS)
        ],
    }


def course(theme):
    width, height = 16, 9
    terrain = []
    for y in range(height):
        for x in range(width):
            gap = x in (6,10,11)
            edge = y in (0,8) or x in (0,15)
            terrain.append(4 if edge else 5 if gap else 3 if y in (4,5,6) else 1+(x*y%5==1))
    tile_ids = {(3,5):0, (4,5):2, (5,5):3, (7,5):4, (8,5):5, (9,5):6, (12,5):7, (13,5):1, (14,5):5}
    decoration = [17+8+tile_ids[(x,y)] if (x,y) in tile_ids else 0 for y in range(height) for x in range(width)]
    def layer(id_, name, cells):
        return {"id":id_, "name":name, "type":"tilelayer", "x":0, "y":0, "width":width, "height":height,
                "opacity":1, "visible":True, "data":cells}
    def point(id_, name, xy):
        return {"id":id_, "name":name, "type":"traversalEndpoint", "point":True,
                "x":xy[0]*32+16, "y":xy[1]*32+16, "visible":True}
    markers = [
        point(i, name, xy) for i,(name,xy) in enumerate(
            (("jumpStart",(5,5)),("grip",(7,5)),("mantleTarget",(8,5)),("dashStart",(9,5)),("dashTarget",(12,5))),1)
    ]
    links = {1: (2, "jump", 360), 2: (3, "mantle", 260), 4: (5, "dash", 240), 5: (4, "dash", 240)}
    for source, (target, action, duration) in links.items():
        markers[source-1]["properties"] = [
            {"name":"target", "type":"object", "value":target},
            {"name":"action", "type":"string", "value":action},
            {"name":"durationMs", "type":"int", "value":duration},
        ]
    return {
        "type":"map", "version":"1.10", "tiledversion":"1.10.2", "orientation":"orthogonal", "renderorder":"right-down",
        "infinite":False, "width":width, "height":height, "tilewidth":32, "tileheight":32, "nextlayerid":4, "nextobjectid":6,
        "tilesets":[
            {"firstgid":1,"name":theme,"image":f"../{theme}-tileset.png","imagewidth":512,"imageheight":32,
             "tilewidth":32,"tileheight":32,"tilecount":16,"columns":16},
            {"firstgid":17,"source":f"{theme}-traversal.tsj"},
        ],
        "layers":[layer(1,"ground",terrain),layer(2,"traversal",decoration),
                  {"id":3,"name":"endpoints","type":"objectgroup","visible":True,"opacity":1,"objects":markers}],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = BUNDLE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for realm in REALMS_LAYOUT:
        theme = realm["theme"]
        atlas = make_atlas(theme)
        image_path = OUTPUT / f"{theme}-traversal.png"
        atlas.save(image_path)
        files = [(image_path, {"width":atlas.width,"height":atlas.height})]
        for filename, obj in ((f"{theme}-traversal.tsj",tileset(theme)),(f"{theme}-course.tmj",course(theme))):
            path = OUTPUT / filename
            path.write_text(json.dumps(obj, indent=2), encoding="utf-8")
            files.append((path, {}))
        for path, dimensions in files:
            manifest["files"][path.relative_to(BUNDLE).as_posix()] = {
                "sha256":sha256_file(path), "bytes":path.stat().st_size, **dimensions,
            }
    manifest["totalFiles"] = len(manifest["files"])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    design = ROOT / "specs" / "006-astral-expedition-pixel" / "design"
    design.mkdir(parents=True, exist_ok=True)
    example = course("meadow")
    demo = {"width": example["width"], "height": example["height"],
            "ground": example["layers"][0]["data"], "decor": example["layers"][1]["data"]}
    (design / "traversal-course-data.js").write_text(
        "const traversalCourse = " + json.dumps(demo) + ";\n", encoding="utf-8",
    )
    print("Exported 7 traversal atlases and 7 Tiled courses.")


if __name__ == "__main__":
    main()
