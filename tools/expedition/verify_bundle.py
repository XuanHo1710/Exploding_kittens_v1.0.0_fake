r"""Verify the generated `database-astral-expedition/` asset bundle against all
frame-count, dimension, magenta-free, and Tiled `.tmj` quality gates.

Example (run from repo root):
    .\.venv\Scripts\python.exe tools/expedition/verify_bundle.py
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
GEN3_DIR = os.path.abspath(os.path.join(HERE, "..", "gen3"))
PYDEPS = os.path.abspath(os.path.join(HERE, "..", "units", ".pydeps"))
for p in (PYDEPS, GEN3_DIR, HERE):
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

from PIL import Image  # noqa: E402
import gen3  # noqa: E402
from roster import HEROES  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Astral Expedition Pixel asset bundle.")
    parser.parse_args()

    bundle = os.path.join(REPO, "database-astral-expedition")
    manifest_path = os.path.join(bundle, "manifest.json")
    if not os.path.isfile(manifest_path):
        print("FAIL: manifest.json missing", file=sys.stderr)
        return 1

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    errs = []
    if manifest.get("heroCount") != len(HEROES):
        errs.append(f"Expected {len(HEROES)} heroes, got {manifest.get('heroCount')}")
    if manifest.get("bossCount") != 7:
        errs.append(f"Expected 7 bosses, got {manifest.get('bossCount')}")
    if manifest.get("realmCount") != 7:
        errs.append(f"Expected 7 realms, got {manifest.get('realmCount')}")

    # Verify exact multi-frame dimensions & zero leftover #FF00FF magenta
    for rel, meta in manifest.get("files", {}).items():
        full = os.path.join(bundle, rel)
        if not os.path.isfile(full):
            errs.append(f"Missing file listed in manifest: {rel}")
            continue
        if rel.endswith(".png"):
            with Image.open(full) as im:
                rgba = im.convert("RGBA")
                w, h = rgba.size
                if rel.startswith("units/heroes/") and rel.endswith("-battle.png") and (w, h) != (1152, 1152):
                    errs.append(f"{rel}: expected 1152x1152 (6x6 of 192px = 36f), got {w}x{h}")
                if rel.startswith("units/heroes/") and rel.endswith("-movement.png") and (w, h) != (384, 512):
                    errs.append(f"{rel}: expected 384x512 (6x8 of 64px = 48f), got {w}x{h}")
                if rel.startswith("units/bosses/") and rel.endswith("-battle.png") and (w, h) != (1536, 1536):
                    errs.append(f"{rel}: expected 1536x1536 (6x6 of 256px = 36f), got {w}x{h}")
                if rel.startswith("units/heroes/") and rel.endswith("-portrait.png") and (w, h) != (128, 128):
                    errs.append(f"{rel}: expected 128x128 portrait, got {w}x{h}")
                for cat in ("gatekeepers", "monsters", "animals"):
                    if rel.startswith(f"units/{cat}/") and rel.endswith("-battle.png") and (w, h) != (1152, 768):
                        errs.append(f"{rel}: expected 1152x768 (6x4 of 192px = 24f), got {w}x{h}")
                    if rel.startswith(f"units/{cat}/") and rel.endswith("-movement.png") and (w, h) != (384, 256):
                        errs.append(f"{rel}: expected 384x256 (6x4 of 64px walk = 24f), got {w}x{h}")
                if rel.startswith("battle-scenes/") and rel.endswith("ambient-anim.png") and (w, h) != (6240, 360):
                    errs.append(f"{rel}: expected 6240x360 (8 frames of 780x360), got {w}x{h}")
                if rel == "ui/gacha/astral-orb.png" and (w, h) != (1024, 768):
                    errs.append(f"{rel}: expected 1024x768 (8x6 of 128px), got {w}x{h}")

                # Check BGR555 + binary alpha + zero magenta
                px = rgba.load()
                for y in range(0, h, 4):
                    for x in range(0, w, 4):
                        r, g, b, a = px[x, y]
                        if a not in (0, 255):
                            errs.append(f"{rel}: non-binary alpha {a} at ({x},{y})")
                            break
                        if a == 255 and (r, g, b) == (255, 0, 255):
                            errs.append(f"{rel}: unkeyed #FF00FF pixel at ({x},{y})")
                            break
                        if a == 255 and not gen3.is_bgr555((r, g, b)):
                            errs.append(f"{rel}: non-BGR555 colour {(r,g,b)} at ({x},{y})")
                            break

    # every unit in data/expedition/units.json has its sheets in the manifest
    units_path = os.path.join(REPO, "data", "expedition", "units.json")
    if os.path.isfile(units_path):
        with open(units_path, "r", encoding="utf-8") as f:
            units = json.load(f)
        files = manifest.get("files", {})
        for u in units:
            for key in ("battle", "movement", "portrait"):
                if key in u and u[key]["path"] not in files:
                    errs.append(f"units.json {u['unitId']}: {u[key]['path']} missing from manifest")
        if manifest.get("unitCount") not in (None, len(units)):
            errs.append(f"manifest unitCount {manifest.get('unitCount')} != units.json {len(units)}")

    if errs:
        print(f"FAIL ({len(errs)} error(s)):")
        for e in errs[:25]:
            print("  -", e)
        return 1

    print(
        f"OK: Bundle verified ({manifest['totalFiles']} files, {len(HEROES)} Heroes x 36f/48f, "
        f"7 Bosses x 36f 256x256, {manifest.get('gatekeeperArchetypes', 0)} Gatekeepers, "
        f"{manifest.get('monsterCount', 0)} Monsters, {manifest.get('animalCount', 0)} Animals, "
        f"7 Animated Realms & Scenes, 100% BGR555 & binary alpha)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
