#!/usr/bin/env python3
"""
Contact sheet of every finished Poké Ball sheet (all rows, x2 export as is) with the ball name and its check result:
  python3 contact_sheet.py [--out tmp/report/pokeballs.png] [--cols 4]
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ballkit as K  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

BG = (112, 120, 136, 255)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(K.REPO, "tmp", "report", "pokeballs.png"))
    ap.add_argument("--cols", type=int, default=4)
    a = ap.parse_args()
    try:
        checks = json.load(open(os.path.join(K.REPO, "tmp", "report", "pokeballs", "checks.json"), encoding="utf-8"))
    except (OSError, ValueError):
        checks = {}
    done = [b for b in K.BALLS if os.path.isfile(K.sheet_path(b[0]))]
    if not done:
        sys.exit("no finished ball sheet yet")
    ims = {b[0]: Image.open(K.sheet_path(b[0])).convert("RGBA") for b in done}
    W, H, LAB = max(i.width for i in ims.values()), max(i.height for i in ims.values()), 18
    cols = min(a.cols, len(done))
    rows = (len(done) + cols - 1) // cols
    out = Image.new("RGBA", (cols * (W + 8) + 8, rows * (H + LAB + 8) + 8), (40, 44, 56, 255))
    d = ImageDraw.Draw(out)
    for i, (bid, name, _) in enumerate(done):
        x, y = 8 + (i % cols) * (W + 8), 8 + (i // cols) * (H + LAB + 8)
        res = checks.get(bid, "").split(" ")[0] or "?"
        d.text((x + 2, y + 2), f"{name} ({bid}) - {res}", fill=(240, 240, 240, 255))
        tile = Image.new("RGBA", (W, H), BG)
        tile.alpha_composite(ims[bid])
        out.alpha_composite(tile, (x, y + LAB))
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    out.convert("RGB").save(a.out)
    print(f"{os.path.relpath(a.out, K.REPO)}: {len(done)} balls")


if __name__ == "__main__":
    main()
