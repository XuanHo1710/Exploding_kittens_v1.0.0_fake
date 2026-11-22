#!/usr/bin/env python3
"""
Put a species' reference artwork next to its drawings, at the same height, to check that the movement and battle
sheets look like the official Pokémon (proportions, head size, wings / limbs, markings, colours).

usage: python3 tools/agy/compare_reference.py <slug> [...]
writes tmp/compare/<slug>.png:
  row 1  reference | movement: down, left, right, up of the first loop | the fly loop (left) when there is one
  row 2  reference | battle FRONT: stand, strike, hurt, faint end | battle BACK: stand, strike, faint end
and prints a colour check: the reference's main colours and whether each sheet uses them (colours missing in the
drawings, or colours the drawings add, often show a wrong part or a wrong palette).
"""
import glob
import json
import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
sys.path.insert(0, os.path.join(REPO, "tools/skills"))
from vfx import Image, ImageDraw  # noqa: E402

C, H = 192, 200


def is_bg(p, white=False):
    r, g, b = p[:3]
    if r - g > 70 and b - g > 70 and r > 120 and b > 120:
        return True
    return white and r > 235 and g > 235 and b > 235


def crop_drawing(im, white=False):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if is_bg(px[x, y], white):
                px[x, y] = (0, 0, 0, 0)
    bb = im.getbbox()
    return im.crop(bb) if bb else im


def fit(im, h=H, w=None):
    k = h / im.height
    if w and im.width * k > w:
        k = w / im.width
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS if k < 1 else Image.NEAREST)


def palette(im, n=8):
    """main colours (opaque pixels) as [(rgb, share)]"""
    small = im.convert("RGBA").resize((96, 96))
    b = small.tobytes(); pix = [tuple(b[i:i + 3]) for i in range(0, len(b), 4) if b[i + 3] > 128]
    if not pix:
        return []
    q = Image.new("RGB", (len(pix), 1)); q.putdata(pix)
    q = q.quantize(n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:3 * n]
    counts = sorted(q.getcolors(), reverse=True)
    tot = sum(c for c, _ in counts)
    return [((pal[3 * i], pal[3 * i + 1], pal[3 * i + 2]), c / tot) for c, i in counts]


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def cells(sheet, cols_rows):
    return [sheet.crop((c * C, r * C, (c + 1) * C, (r + 1) * C)) for c, r in cols_rows]


def main():
    slugs = [a.lower() for a in sys.argv[1:]]
    if not slugs:
        sys.exit(__doc__)
    os.makedirs(os.path.join(REPO, "tmp", "compare"), exist_ok=True)
    for slug in slugs:
        hits = glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{slug}-reference.jpg")) + \
               glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{slug}-movement.png"))
        if not hits:
            print(f"{slug}: no folder"); continue
        d = os.path.dirname(hits[0])
        ref_p = os.path.join(d, f"{slug}-reference.jpg")
        if not os.path.isfile(ref_p):
            print(f"{slug}: no {slug}-reference.jpg (run fetch_reference.sh)"); continue
        ref = crop_drawing(Image.open(ref_p), white=True)
        rows = []
        mv_p, bt_p = os.path.join(d, f"{slug}-movement.png"), os.path.join(d, f"{slug}-battle.png")
        mv_cells, bt_cells = [], []
        if os.path.isfile(mv_p):
            mv = Image.open(mv_p)
            loops = json.loads(mv.text.get("mons-loops", "[]") or "[]")
            mvr = mv.convert("RGB")
            if mvr.size == (1536, 1152):                       # legacy 8 directions: columns, row 0
                mv_cells = cells(mvr, [(0, 0), (6, 0), (2, 0), (4, 0)])
            else:
                mv_cells = cells(mvr, [(0, 0), (0, 1), (0, 2), (0, 3)])
                x = 0
                for l in loops:
                    if l["mode"] == "fly":
                        mv_cells.append(mvr.crop((x * C, C, (x + 1) * C, 2 * C)))
                    x += l["frames"]
        if os.path.isfile(bt_p):
            bt = Image.open(bt_p).convert("RGB")
            bt_cells = cells(bt, [(0, 0), (3, 0), (2, 1), (5, 3), (6, 0), (9, 0), (11, 3)])
        ref_t = fit(ref, H, 2 * H)
        lab = ["movement: down / left / right / up" + (" / fly" if len(mv_cells) > 4 else ""),
               "battle FRONT: stand / strike / hurt / faint  |  BACK: stand / strike / faint"]
        for i, group in enumerate((mv_cells, bt_cells)):
            if not group:
                continue
            tiles = [fit(crop_drawing(c), H, int(1.6 * H)) for c in group]
            w = ref_t.width + 20 + sum(t.width + 12 for t in tiles)
            row = Image.new("RGBA", (w, H + 26), (240, 240, 236, 255))
            row.alpha_composite(ref_t, (0, 24 + H - ref_t.height))
            x = ref_t.width + 20
            for t in tiles:
                row.alpha_composite(t, (x, 24 + H - t.height)); x += t.width + 12
            ImageDraw.Draw(row).text((4, 4), f"{slug}: reference  |  {lab[i]}", fill=(0, 0, 0, 255))
            rows.append(row)
        if not rows:
            print(f"{slug}: no sheets"); continue
        out = Image.new("RGBA", (max(r.width for r in rows), sum(r.height for r in rows)), (255, 255, 255, 255))
        y = 0
        for r in rows:
            out.alpha_composite(r, (0, y)); y += r.height
        p = os.path.join(REPO, "tmp", "compare", f"{slug}.png")
        out.save(p)
        # colour check
        rp = palette(ref)
        report = []
        for name, group in (("movement", mv_cells), ("battle", bt_cells)):
            if not group:
                continue
            sp = palette(Image.merge("RGBA", crop_drawing(group[0]).split()) if len(group) == 1 else
                         _strip([crop_drawing(c) for c in group]))
            missing = [rgb for rgb, share in rp if share > 0.06 and min(dist(rgb, s) for s, _ in sp) > 60]
            extra = [rgb for rgb, share in sp if share > 0.08 and min(dist(rgb, r) for r, _ in rp) > 70]
            report.append(f"{name}: " + ("colours OK" if not missing and not extra else
                          (f"missing reference colours {missing}" if missing else "") +
                          (f" extra colours {extra}" if extra else "")))
        print(f"{slug}: {os.path.relpath(p, REPO)} | " + " | ".join(report))


def _strip(ims):
    w = sum(i.width for i in ims); h = max(i.height for i in ims)
    s = Image.new("RGBA", (w, h), (0, 0, 0, 0)); x = 0
    for i in ims:
        s.alpha_composite(i, (x, 0)); x += i.width
    return s


if __name__ == "__main__":
    main()
