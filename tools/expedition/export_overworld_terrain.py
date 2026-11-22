"""Bake seven pixel terrain images from the authored atlas and Tiled collision.

From the repository root: py tools/expedition/export_overworld_terrain.py
"""

import argparse
import json
import math
from functools import lru_cache
from pathlib import Path

from PIL import Image

from build_bundle import REALMS_LAYOUT, sha256_file
from pixel_worlds import gen3, terrain_color

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "database-astral-expedition"
SOURCE = BUNDLE / "art-source" / "overworld" / "material-atlas-source.png"
TILE = 16


def surface(gid):
    if gid == 4:
        return 2
    if gid == 5:
        return 3
    if gid in (3, 6, 7, 8):
        return 1
    return 0


def atlas_row(atlas, row):
    materials = []
    for col in range(4):
        bounds = (round(col*atlas.width/4)+3, round(row*atlas.height/7)+3,
                  round((col+1)*atlas.width/4)-3, round((row+1)*atlas.height/7)-3)
        materials.append(atlas.crop(bounds).resize((116,116), Image.Resampling.NEAREST))
    return materials


def mirror_at(n, size):
    value = n % (size*2)
    return value if value < size else size*2-1-value


def bake(tmj, materials, theme):
    width, height = tmj["width"], tmj["height"]
    grid = tmj["layers"][0]["data"]
    def terrain_at(x, y):
        col = max(0, min(width-1, x//TILE))
        row = max(0, min(height-1, y//TILE))
        return surface(grid[row*width+col])

    result = Image.new("RGB",(width*TILE,height*TILE))
    target = result.load()
    samples = [material.load() for material in materials]
    color = lru_cache(maxsize=32768)(terrain_color)
    for y in range(result.height):
        for x in range(result.width):
            # Sub-tile offsets break up straight seams while preserving the center of each collision cell.
            gx = x+round(1.7*math.sin(y*.22)+1.3*math.cos(x*.1+y*.07))
            gy = y+round(1.8*math.sin(x*.20)+1.2*math.cos(y*.09-x*.08))
            material = terrain_at(gx,gy)
            px = mirror_at(x+31*material+round(4*math.sin(y*.022)),116)
            py = mirror_at(y+17*material,116)
            rgb = samples[material][px,py]
            shade = -5 + round(4*math.sin(x*.021+y*.029))
            if material == 3:
                if any(terrain_at(gx+dx,gy+dy) != 3 for dx,dy in ((3,0),(-3,0),(0,3),(0,-3))):
                    shade -= 19
            elif material in (0,1):
                if terrain_at(gx,gy-4) == 2 or terrain_at(gx-4,gy) == 2:
                    shade -= 22
                if terrain_at(gx,gy+2) == 3 or terrain_at(gx+2,gy) == 3:
                    shade += 12
            elif theme not in ("snow","desert"):
                shade -= 8
            target[x,y] = color(rgb,shade)
    # One shared 15-color palette also bounds the largest zone's export time and tile palette count.
    indexed = result.quantize(colors=15, dither=Image.Dither.NONE)
    palette = indexed.getpalette() or []
    indexed.putpalette([component for i in range(0,len(palette),3) for component in gen3.snap(palette[i:i+3])])
    return indexed.resize((result.width*2,result.height*2),Image.Resampling.NEAREST).convert("RGBA")


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--only", choices=[realm["mapId"] for realm in REALMS_LAYOUT])
    args = cli.parse_args()
    manifest_path = BUNDLE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    with Image.open(SOURCE) as raw:
        atlas = raw.convert("RGB")
    for row, realm in enumerate(REALMS_LAYOUT):
        realm_id = realm["mapId"]
        if args.only and args.only != realm_id:
            continue
        folder = BUNDLE / "maps" / realm_id
        tiled = json.loads((folder / f"{realm_id}.tmj").read_text(encoding="utf-8"))
        image = bake(tiled, atlas_row(atlas,row), realm["theme"])
        path = folder / "terrain.png"
        image.save(path)
        manifest["files"][path.relative_to(BUNDLE).as_posix()] = {
            "sha256": sha256_file(path), "bytes": path.stat().st_size, "width": image.width, "height": image.height,
        }
        print(f"{realm_id}: {image.width}×{image.height}", flush=True)
    manifest["totalFiles"] = len(manifest["files"])
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n", encoding="utf-8")


if __name__ == "__main__":
    main()
