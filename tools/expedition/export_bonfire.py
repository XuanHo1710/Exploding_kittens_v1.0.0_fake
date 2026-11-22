"""Draw and export the animated rest bonfire with twin fire pillars.

From the repository root: py tools/expedition/export_bonfire.py
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

from build_bundle import sha256_file
from visual_kit import load_structure_cutout, native_to_asset, remove_key_fringe

BUNDLE = Path(__file__).resolve().parents[2] / "database-astral-expedition"
SOURCE = BUNDLE / "art-source" / "structures" / "rest-bonfire-v2-source.png"


def flame(draw, x, y, height, width, shift):
    tip = x + shift
    draw.polygon([(x-width,y-2),(x-width+1,y-6),(x-width+1,y-height//2),(x-2,y-8),
                  (tip,y-height),(tip+2,y-height+5),(x+3,y-height//2),(x+width-1,y-9),
                  (x+width,y-4),(x+width-1,y),(x,y+1)], fill=(143,53,37))
    draw.polygon([(x-width+2,y-2),(x-width+2,y-6),(x-2,y-5),(tip,y-height+4),
                  (x+3,y-7),(x+width-2,y-6),(x+width-1,y-3),(x+width-3,y),(x-2,y)],
                 fill=(226,112,49))
    draw.polygon([(x-width//2,y-2),(x-1,y-6),(x+min(shift, 1),y-height//2),
                  (x+2,y-6),(x+width//2,y-3),(x+2,y),(x-2,y)], fill=(255,181,80))
    draw.polygon([(x-2,y-2),(x+1,y-height//3),(x+2,y-3),(x+1,y)], fill=(255,237,173))


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    base = load_structure_cutout(SOURCE)
    bounds = base.getbbox()
    if not bounds:
        raise ValueError("Missing drawn rest shrine")
    shrine = ImageOps.contain(base.crop(bounds), (60, 40), Image.Resampling.NEAREST)
    shrine = remove_key_fringe(shrine)
    strip = Image.new("RGBA", (8*64,64))
    for frame in range(8):
        tile = Image.new("RGBA",(64,64))
        tile.paste(shrine, ((64-shrine.width)//2, 60-shrine.height))
        d = ImageDraw.Draw(tile)
        heights = (11, 13, 12, 10, 12, 13, 11, 12)
        sway = (0, 1, 2, 1, -1, -2, -1, 0)
        flame(d,12,24,heights[frame],4,sway[frame])
        flame(d,52,24,heights[(frame+3)%8],4,sway[(frame+3)%8])
        flame(d,32,32,heights[frame]+10,9,sway[frame])
        for x, birth in ((11,3),(14,7),(28,0),(34,3),(37,5),(52,1),(55,6)):
            age = (frame-birth)%8
            y = (22 if x in (28,34,37) else 17) - age*2
            if 0 < y and age < 7:
                d.point((x+age//3,y),fill=(255,192,90) if age < 3 else (191,93,49))
        strip.alpha_composite(tile, (64*frame,0))
    output = BUNDLE / "structures" / "rest-bonfire" / "rest-bonfire.png"
    output.parent.mkdir(parents=True,exist_ok=True)
    image = native_to_asset(strip)
    image.save(output)
    manifest_path = BUNDLE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["files"][output.relative_to(BUNDLE).as_posix()] = {
        "sha256":sha256_file(output), "bytes":output.stat().st_size,"width":image.width,"height":image.height,
    }
    manifest["totalFiles"] = len(manifest["files"])
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


if __name__ == "__main__":
    main()
