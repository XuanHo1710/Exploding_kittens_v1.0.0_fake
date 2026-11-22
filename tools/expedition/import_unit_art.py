"""Import reviewed creature sprite sheets without changing shipped asset paths.

From the repository root:
    py tools/expedition/import_unit_art.py boreal_chevalier battle path/to/raw.png
"""

import argparse
import re
import shutil
from pathlib import Path

from PIL import Image

from agy_units import layout, normalize_raw
from art_source import normalize, normalize_jung_portrait, update_manifest
from build_units import ART, _publish, edge_hits, write_catalog, write_readme, write_review_page
from roster import UNITS_BY_ID


def prepare_sheet(source, cell, cols, rows, label):
    if (cols, rows) == (1, 1):
        with Image.open(source) as original:
            image = original.convert("RGBA").resize((cell, cell), Image.Resampling.NEAREST)
    else:
        image = normalize_raw(source, cell, cols, rows, align_rows=cell == 64, clean_fragments=True)
    indexed = image.quantize(colors=30, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert("RGBA")
    indexed.putalpha(image.getchannel("A"))
    image = normalize(indexed, image.size)
    if (cols, rows) == (1, 1):
        return image
    for y in range(rows):
        for x in range(cols):
            tile = image.crop((x*cell,y*cell,(x+1)*cell,(y+1)*cell))
            alpha = tile.getchannel("A").histogram()[255]
            if not .024*cell*cell < alpha < .73*cell*cell:
                raise ValueError(f"{label}: frame {y+1},{x+1} has invalid subject coverage ({alpha} px)")
    if edge_hits(image, cell):
        raise ValueError(f"{label}: silhouette reached the edge of a cell")
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("unit", choices=sorted(UNITS_BY_ID))
    parser.add_argument("sheet", choices=("battle","movement","portrait"))
    parser.add_argument("source", type=Path)
    parser.add_argument("--variant", help="Publish a costume atlas alongside the base hero")
    parser.add_argument("--cast-source", type=Path, help="Replace the hero cast row from a reviewed 3x2 strip")
    parser.add_argument("--metadata", action="store_true", help="Refresh the manifest and review page after a batch")
    args = parser.parse_args()
    unit = UNITS_BY_ID[args.unit]
    if args.sheet == "movement" and unit["category"] == "bosses":
        parser.error("Bosses have no movement path in the bundle")
    if (args.variant or args.sheet == "portrait") and unit["category"] != "heroes":
        parser.error("Portraits and costume variants apply only to heroes")
    if args.variant and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.variant):
        parser.error("Costume variant must be lowercase kebab-case")
    if args.cast_source and (unit["category"] != "heroes" or args.sheet != "battle"):
        parser.error("--cast-source applies only to hero battle sheets")
    cell, cols, rows = (128, 1, 1) if args.sheet == "portrait" else layout(unit, args.sheet)
    if args.unit == "jung_afterglow" and args.sheet == "portrait" and not args.variant:
        with Image.open(args.source) as portrait:
            image = normalize_jung_portrait(portrait)
    else:
        image = prepare_sheet(args.source, cell, cols, rows, args.unit)
    if args.cast_source:
        cast = prepare_sheet(args.cast_source, cell, 3, 2, f"{args.unit} cast")
        for index in range(6):
            left, top = index % 3 * cell, index // 3 * cell
            frame = cast.crop((left, top, left+cell, top+cell))
            image.paste(frame, (index*cell, 2*cell))
        image = normalize(image, image.size)

    destination = Path(ART) / "redraw"
    stem = f"{args.unit}-{args.sheet}"
    relative = f"units/{unit['category']}/{stem}.png"
    if args.variant:
        destination /= "variants"
        stem = f"{args.unit}-{args.variant}-{args.sheet}"
        relative = f"units/heroes/variants/{stem}.png"
    destination.mkdir(parents=True, exist_ok=True)
    raw_target = destination / f"{stem}-source.png"
    if raw_target.resolve() != args.source.resolve():
        shutil.copyfile(args.source,raw_target)
    image.save(destination / f"{stem}.png")
    _publish(relative,image,image.size)
    if args.metadata:
        update_manifest([relative])
        write_catalog()
        write_review_page()
        write_readme("units")
    print(relative)


if __name__ == "__main__":
    main()
