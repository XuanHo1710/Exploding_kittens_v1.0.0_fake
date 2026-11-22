"""Export the painted scenery atlas and its Tiled placements for Dawn Meadow."""

import json
from pathlib import Path

from PIL import Image, ImageOps

from build_bundle import sha256_file
from meadow_landscape import ASSETS, add_meadow_landscape
from visual_kit import load_structure_cutout, native_to_asset, remove_key_fringe
from normalize_sheet import find_row_bounds

BUNDLE = Path(__file__).resolve().parents[2] / "database-astral-expedition"
SOURCE = BUNDLE / "art-source" / "structures" / "meadow-waterworks-source.png"
OUTPUT = BUNDLE / "structures" / "meadow" / "waterworks.png"
MEADOW = "01-dawn-meadow"


def export_atlas():
    source = load_structure_cutout(SOURCE)
    atlas = Image.new("RGBA", (192, 192))
    cuts_y = find_row_bounds(source, 3)
    for row in range(3):
        band = source.crop((0, cuts_y[row], source.width, cuts_y[row + 1]))
        cuts_x = find_row_bounds(band.transpose(Image.Transpose.TRANSPOSE), 3)
        for col in range(3):
            panel = band.crop((cuts_x[col], 0, cuts_x[col + 1], band.height))
            bounds = panel.getbbox()
            kind = ASSETS[3 * row + col]
            if not bounds or panel.getchannel("A").histogram()[255] < panel.width * panel.height * .02:
                raise ValueError(f"Missing or incomplete scenery cell: {kind}")
            sprite = ImageOps.contain(panel.crop(bounds), (60, 60), Image.Resampling.NEAREST)
            sprite = remove_key_fringe(sprite)
            x = col * 64 + (64 - sprite.width) // 2
            y = row * 64 + ((64 - sprite.height) // 2 if kind in {
                "stone-bridge", "wooden-landing", "river-stones", "lily-pads", "cascade"
            } else 62 - sprite.height)
            atlas.paste(sprite, (x, y))
    image = native_to_asset(atlas)
    image.save(OUTPUT)
    return image


def main():
    map_path = BUNDLE / "maps" / MEADOW / f"{MEADOW}.tmj"
    tiled = json.loads(map_path.read_text(encoding="utf-8"))
    add_meadow_landscape(tiled)

    atlas = export_atlas()
    map_path.write_text(json.dumps(tiled, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path = BUNDLE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for output in (OUTPUT, map_path):
        entry = {"sha256": sha256_file(output), "bytes": output.stat().st_size}
        if output == OUTPUT:
            entry.update(width=atlas.width, height=atlas.height)
        manifest["files"][output.relative_to(BUNDLE).as_posix()] = entry
    manifest["totalFiles"] = len(manifest["files"])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    layer = next(layer for layer in tiled["layers"] if layer["name"] == "landscape")
    print(f"{len(ASSETS)} scenery sprites, {len(layer['objects'])} Tiled placements")


if __name__ == "__main__":
    main()
