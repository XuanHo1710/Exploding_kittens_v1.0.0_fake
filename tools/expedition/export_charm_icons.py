"""Publish the illustrated Expedition charm and supply atlas from reviewed 3×3 panels."""

import argparse
import json
from math import ceil
from pathlib import Path
import re

from PIL import Image, ImageChops, ImageOps

from build_bundle import sha256_file
from pixel_worlds import gen3
from visual_kit import near_key_mask, remove_key_fringe
from normalize_sheet import find_row_bounds

REPO = Path(__file__).resolve().parents[2]
BUNDLE = REPO / "database-astral-expedition"
SOURCE = BUNDLE / "art-source" / "ui" / "charm-icons"
CELL = 32
COLUMNS = 8


def catalog_ids():
    charms = (REPO / "shared/src/expedition/charms.ts").read_text(encoding="utf-8")
    types = (REPO / "shared/src/expedition/types.ts").read_text(encoding="utf-8")
    supplies = re.search(r"^export type BattleSupply = (.*);$", types, re.MULTILINE)
    if not supplies:
        raise ValueError("BattleSupply declaration is missing")
    return set(re.findall(r"^\s+C\('([^']+)'", charms, re.MULTILINE)) | set(re.findall(r"'([^']+)'", supplies[1]))


def export_tile(panel, bounds, icon_id):
    entry = panel.crop(bounds)
    box = entry.getbbox()
    if not box or entry.getchannel("A").histogram()[255] < .015 * entry.width * entry.height:
        raise ValueError(f"Missing icon: {icon_id}")
    sprite = ImageOps.contain(entry.crop(box), (CELL - 4, CELL - 4), Image.Resampling.NEAREST)
    sprite = remove_key_fringe(sprite)
    # Give each item its own palette. Reducing the whole sheet together merges accent colors.
    indexed = sprite.convert("RGB").quantize(colors=15, dither=Image.Dither.NONE).convert("RGBA")
    indexed.putalpha(sprite.getchannel("A"))
    clean = gen3.to_gen3(indexed)
    tile = Image.new("RGBA", (CELL, CELL))
    tile.paste(clean, ((CELL - clean.width) // 2, (CELL - clean.height) // 2))
    return tile


def read_panel(group):
    path = SOURCE / f"panel-{group['name']}-source.png"
    with Image.open(path) as source:
        panel = source.convert("RGBA")
    alpha = panel.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    panel.putalpha(ImageChops.multiply(alpha, ImageChops.invert(near_key_mask(panel))))
    cut_y = find_row_bounds(panel, 3)
    for row in range(3):
        band = panel.crop((0, cut_y[row], panel.width, cut_y[row + 1]))
        cut_x = find_row_bounds(band.transpose(Image.Transpose.TRANSPOSE), 3)
        for column in range(3):
            icon_id = group["icons"][row * 3 + column]["id"]
            bounds = (cut_x[column], 0, cut_x[column + 1], band.height)
            yield icon_id, export_tile(band, bounds, icon_id)


def render():
    layout = json.loads((SOURCE / "layout.json").read_text(encoding="utf-8"))
    ids = [icon["id"] for group in layout for icon in group["icons"]]
    expected = catalog_ids()
    if any(len(group["icons"]) != 9 for group in layout) or len(ids) != len(set(ids)) or set(ids) != expected:
        raise ValueError(f"Atlas layout does not match the catalog. Missing: {sorted(expected - set(ids))}; extra: {sorted(set(ids) - expected)}")
    rows = ceil(len(ids) / COLUMNS)
    atlas = Image.new("RGBA", (COLUMNS * CELL, rows * CELL))
    positions = {}
    artwork = set()
    for group in layout:
        for icon_id, tile in read_panel(group):
            if tile.tobytes() in artwork:
                raise ValueError(f"Duplicate artwork: {icon_id}")
            artwork.add(tile.tobytes())
            row, column = divmod(len(positions), COLUMNS)
            positions[icon_id] = [column, row]
            atlas.paste(tile, (column * CELL, row * CELL))
    return atlas.resize((atlas.width * 2, atlas.height * 2), Image.Resampling.NEAREST), {
        "columns": COLUMNS, "rows": rows, "cell": CELL * 2, "positions": positions,
    }


def publish():
    atlas, metadata = render()
    png = BUNDLE / "ui" / "charm-icons.png"
    mapping = BUNDLE / "ui" / "charm-icons.json"
    atlas.save(png)
    mapping.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    path = BUNDLE / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for asset in (png, mapping):
        manifest["files"][asset.relative_to(BUNDLE).as_posix()] = {
            "sha256": sha256_file(asset), "bytes": asset.stat().st_size,
            **({"width": atlas.width, "height": atlas.height} if asset == png else {}),
        }
    manifest["totalFiles"] = len(manifest["files"])
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Published {len(metadata['positions'])} unique charm and supply icons")


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    publish()
