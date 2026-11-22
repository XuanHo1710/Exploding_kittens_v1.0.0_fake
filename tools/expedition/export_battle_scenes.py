"""Export the seven battle arenas and refresh their bundle hashes.

From the repository root: py tools/expedition/export_battle_scenes.py
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

from build_bundle import REALMS_LAYOUT, sha256_file
from pixel_worlds import render_battle_scene_layers

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "database-astral-expedition"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", type=Path, help="Destination for the overview PNG")
    args = parser.parse_args()
    manifest_path = BUNDLE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    preview = Image.new("RGB", (812, 848), "#171923")
    draw = ImageDraw.Draw(preview)
    for i, realm in enumerate(REALMS_LAYOUT):
        map_id = realm["mapId"]
        folder = BUNDLE / "battle-scenes" / map_id
        backdrop, ambient = render_battle_scene_layers(realm["theme"])
        for name, image in (("backdrop", backdrop), ("ambient-anim", ambient)):
            path = folder / f"{name}.png"
            image.save(path)
            manifest["files"][path.relative_to(BUNDLE).as_posix()] = {
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
                "width": image.width,
                "height": image.height,
            }
        x, y = 8 + (i % 2) * 402, 8 + (i // 2) * 210
        draw.text((x, y), map_id, fill="#f4e2cd")
        composed = Image.alpha_composite(backdrop, ambient.crop((0, 0, 780, 360)))
        preview.paste(composed.resize((390, 180), Image.Resampling.NEAREST), (x, y + 18))
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.preview:
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        preview.save(args.preview)
    print(f"Exported {len(REALMS_LAYOUT)} battle arenas.")


if __name__ == "__main__":
    main()
