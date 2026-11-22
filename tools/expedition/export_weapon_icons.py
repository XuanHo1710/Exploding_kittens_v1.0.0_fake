"""Split the reviewed 3×2 weapon panels into the game's 128 px inventory sprites."""

import json
import re
from pathlib import Path

from PIL import Image, ImageOps

from build_bundle import sha256_file
from visual_kit import load_structure_cutout, native_to_asset
from normalize_sheet import find_row_bounds

REPO = Path(__file__).resolve().parents[2]
BUNDLE = REPO / "database-astral-expedition"
SOURCE = BUNDLE / "art-source/ui/weapons"
OUTPUT = BUNDLE / "ui/weapons"


def publish():
    catalog = (REPO / "shared/src/expedition/weapons.ts").read_text(encoding="utf-8")
    ids = re.findall(r"^\s*\{ heroId: '([^']+)'", catalog, re.MULTILINE)
    panels = {
        "guards": ids[:6], "legends": ids[6:], "field": [f"field-{n}" for n in range(1, 7)],
        "families": ["field-bow", "field-staff", "field-daggers", "field-axe", "field-scythe", "field-spear"],
    }
    path = BUNDLE / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    artwork = set()
    rendered = {}
    for name, items in panels.items():
        if len(items) != 6:
            raise ValueError(f"Expected six weapons in panel {name}")
        keyed = SOURCE / f"{name}-keyed-source.png"
        raw = keyed if keyed.is_file() else SOURCE / f"{name}-source.png"
        source = load_structure_cutout(raw, alpha_cut=200 if name == "guards" else 128)
        ys = find_row_bounds(source, 2)
        for row in range(2):
            band = source.crop((0, ys[row], source.width, ys[row + 1]))
            xs = find_row_bounds(band.transpose(Image.Transpose.TRANSPOSE), 3)
            for col in range(3):
                item = items[row*3 + col]
                cell = band.crop((xs[col], 0, xs[col + 1], band.height))
                box = cell.getbbox()
                coverage = cell.getchannel("A").histogram()[255] / (cell.width * cell.height)
                if not box or not .035 <= coverage <= .48:
                    raise ValueError(f"Missing or incomplete weapon {item}")
                sprite = ImageOps.contain(cell.crop(box), (58, 58), Image.Resampling.NEAREST)
                tile = Image.new("RGBA", (64, 64))
                tile.paste(sprite, ((64 - sprite.width)//2, (64 - sprite.height)//2))
                atlas = native_to_asset(tile)
                if atlas.tobytes() in artwork:
                    raise ValueError(f"Repeated art for weapon {item}")
                artwork.add(atlas.tobytes())
                rendered[item] = atlas
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for item, atlas in rendered.items():
        output = OUTPUT / f"{item}.png"
        atlas.save(output)
        manifest["files"][output.relative_to(BUNDLE).as_posix()] = {
            "sha256": sha256_file(output), "bytes": output.stat().st_size, "width": 128, "height": 128,
        }
    manifest["totalFiles"] = len(manifest["files"])
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Published {len(artwork)} unique weapon images")


if __name__ == "__main__":
    publish()
