#!/usr/bin/env python3
"""
Home-Screen / web-app icons and the favicon for the game (decisions.md §10), nearest-scaled to whole multiples like
every other UI asset.

Source art: assets/ui/Icons/app/app-icon.png (64x64, the emblem drawn by agy, tools/agy/ui_pack.py normalize icon).
Until it exists: the kit's drawn Poké Ball bag icon (items.py, 24x24) on the ink background.

Usage:  app_icons.py [--out game/public/icons]
Writes: icon-180.png (apple-touch-icon), icon-192.png, icon-512.png: opaque, the art on the ink background, inside the
        80 % safe zone of a maskable icon (64 px art x2 / x2 / x6; fallback ball 30 px x6, 32 px x6, 32 px x16);
        favicon-32.png and favicon.ico (16, 32, 48): transparent, the art box-reduced and snapped back to its own
        colours (only with the agy art).
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image, ImageDraw  # noqa: E402

import items as IT  # noqa: E402
import uikit as U  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
ART = os.path.join(REPO, "assets", "ui", "Icons", "app", "app-icon.png")


def base(n):
    """n x n native icon: ink square, a lighter inner ring, the ball centred."""
    img = Image.new("RGBA", (n, n), U.INK + (255,))
    ImageDraw.Draw(img).rectangle([1, 1, n - 2, n - 2], outline=U.INK2)
    ball = IT.item("ball")
    o = (n - ball.width) // 2
    img.alpha_composite(ball, (o, o))
    return U.finish(img).convert("RGB")             # opaque: iOS fills transparent icon pixels with black


def on_ink(art, size, k):
    """the art scaled x k, centred on a size x size ink square (opaque)"""
    img = Image.new("RGBA", (size, size), U.INK + (255,))
    big = art.resize((art.width * k, art.height * k), Image.NEAREST)
    img.alpha_composite(big, ((size - big.width) // 2, (size - big.height) // 2))
    return img.convert("RGB")


def reduced(art, n):
    """the art shrunk to n x n: box average, alpha 0/255, every pixel snapped to the nearest colour of the art"""
    pal = sorted({art.getpixel((x, y))[:3] for y in range(art.height) for x in range(art.width) if art.getpixel((x, y))[3]})
    sm = art.resize((n, n), Image.BOX)
    px = sm.load()
    for y in range(n):
        for x in range(n):
            r, g, b, a = px[x, y]
            if a < 128:
                px[x, y] = (0, 0, 0, 0)
            else:
                c = min(pal, key=lambda q: (q[0] - r) ** 2 + (q[1] - g) ** 2 + (q[2] - b) ** 2)
                px[x, y] = c + (255,)
    return sm


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(REPO, "game", "public", "icons"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    out = []
    if os.path.isfile(ART):
        art = Image.open(ART).convert("RGBA")
        for size, k in ((180, 2), (192, 2), (512, 6)):
            on_ink(art, size, k).save(os.path.join(a.out, f"icon-{size}.png"))
            out.append(f"icon-{size}.png")
        small = {n: reduced(art, n) for n in (16, 32, 48)}
        small[32].save(os.path.join(a.out, "favicon-32.png"))
        small[48].save(os.path.join(a.out, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)],
                       append_images=[small[16], small[32]])
        out += ["favicon-32.png", "favicon.ico"]
    else:
        for size, native in ((180, 30), (192, 32), (512, 32)):
            base(native).resize((size, size), Image.NEAREST).save(os.path.join(a.out, f"icon-{size}.png"))
            out.append(f"icon-{size}.png")
    for f in out:
        print(os.path.join(a.out, f))


if __name__ == "__main__":
    main()
