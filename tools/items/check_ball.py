#!/usr/bin/env python3
"""
Automatic check of a normalized Poké Ball sheet, then the previews for the user:
  - layout: 512x384 (x2 of 8 x 6 cells of 32 px), every row has its frame count, the rest of the row is empty
  - Gen 3: binary alpha, BGR555, <= 15 colours
  - never cut: no frame within 2 native px of its cell border ("cut at the cell edge" = FAIL); a drawing agy itself
    cut at the edge of its image is only recorded ("cut in the draft")
  - magenta left: opaque near-magenta pixels that are not the ball's own colours (FAIL)
  - ball present: every throw / shake / icon frame and the first open / success / break frame holds the ball
    (largest piece >= 50 % of the expected ball area), else "ball missing" (FAIL)
  - centred: the ball (largest piece) centred in its cell (shake row: on the baseline), +-2 native px
  - the throw frames are not all the same drawing
  - notes from the normalizer (drawing cut by the draft edge, frames shrunk to fit)
Writes tmp/report/pokeballs/<id>.png (the sheet on a neutral
background; written LAST: it is what the watcher sends), and records the result in tmp/report/pokeballs/checks.json.
Result line: PASS / WARN … / FAIL … (the drawing is accepted as drawn either way: user rule 2026-11-19).

  python3 check_ball.py poke [master …] [--no-preview]
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ballkit as K  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
import gen3  # noqa: E402
import normalize_ball as NB  # noqa: E402

REPORT = os.path.join(K.REPO, "tmp", "report", "pokeballs")
BG = (112, 120, 136, 255)


BALL_AREA = 3.1416 * (K.BALL_PX / 2) ** 2
CC = K.CELL          # cell of the sheet being checked (from its .json: a sheet with a big flash has a bigger cell)
BASE = K.BASELINE


def native(bid):
    im = Image.open(K.sheet_path(bid)).convert("RGBA")
    return im, im.resize((im.width // K.SCALE, im.height // K.SCALE), Image.NEAREST)


def cell(nat, r, c):
    return nat.crop((c * CC, r * CC, (c + 1) * CC, (r + 1) * CC))


def biggest(cl):
    a = cl.getchannel("A").load()
    W, H = cl.size
    seen, best = set(), []
    for y in range(H):
        for x in range(W):
            if a[x, y] and (x, y) not in seen:
                todo, pix = [(x, y)], []
                seen.add((x, y))
                while todo:
                    p = todo.pop()
                    pix.append(p)
                    for nx in (p[0] - 1, p[0], p[0] + 1):
                        for ny in (p[1] - 1, p[1], p[1] + 1):
                            if 0 <= nx < W and 0 <= ny < H and a[nx, ny] and (nx, ny) not in seen:
                                seen.add((nx, ny))
                                todo.append((nx, ny))
                if len(pix) > len(best):
                    best = pix
    if not best:
        return None
    xs, ys = [p[0] for p in best], [p[1] for p in best]
    return len(best), (min(xs), min(ys), max(xs) + 1, max(ys) + 1)


def panel(cl):
    """a square block in the frame: agy painted a background panel behind the flash, or drew the burst past its
    slot so it was cut square. The bbox is >= 40 % of the cell both ways and all four bbox corners are filled
    (a ball, a disc or a star burst has empty corners)"""
    b = biggest(cl)                        # the largest piece only: stray sparks would widen the frame bbox
    if not b:
        return False
    bb = b[1]
    area = (bb[2] - bb[0]) * (bb[3] - bb[1])
    if b[0] >= 0.9 * area and area >= 1.5 * BALL_AREA:   # a solid rectangle bigger than the ball (a disc fills 78 %)
        return True
    if bb[2] - bb[0] < 0.4 * CC or bb[3] - bb[1] < 0.4 * CC:
        return False
    a = cl.getchannel("A").load()
    # a corner counts as filled when most of its 3x3 block is opaque (the panel edge may be a little ragged)
    corner = lambda x, y, dx, dy: sum(1 for i in range(3) for j in range(3) if a[x + i * dx, y + j * dy]) >= 6  # noqa: E731
    return all((corner(bb[0], bb[1], 1, 1), corner(bb[2] - 1, bb[1], -1, 1),
                corner(bb[0], bb[3] - 1, 1, -1), corner(bb[2] - 1, bb[3] - 1, -1, -1)))


def check(bid):
    global CC, BASE, BALL_AREA
    fails, warns = [], []
    if not os.path.isfile(K.sheet_path(bid)):
        return "FAIL", ["no sheet"], None
    meta_p = os.path.splitext(K.sheet_path(bid))[0] + ".json"
    meta = json.load(open(meta_p, encoding="utf-8")) if os.path.isfile(meta_p) else {}
    CC, BASE = meta.get("cell", K.CELL), meta.get("baseline_y", K.BASELINE)
    BALL_AREA = 3.1416 * (meta.get("ball_px", K.BALL_PX) / 2) ** 2
    big, nat = native(bid)
    if big.size != (CC * K.COLS * K.SCALE, CC * len(K.ROWS) * K.SCALE):
        fails.append(f"size {big.size}")
    if gen3.native_scale(big) != K.SCALE:
        fails.append("not an exact x2 upscale")
    rep = gen3.report(big)
    if rep["colours"] > 15:
        fails.append(f"{rep['colours']} colours")
    if rep["semi_alpha_px"] or rep["non_bgr555_px"]:
        fails.append("semi-alpha / off-BGR555 pixels")
    for r, (name, cnt, _) in enumerate(K.ROWS):
        have = [c for c in range(K.COLS) if cell(nat, r, c).getbbox()]
        miss = [c + 1 for c in range(cnt) if c not in have]
        if miss:
            (fails if len(miss) > cnt // 2 else warns).append(f"{name}: missing frame(s) {miss}")
        if any(c >= cnt for c in have):
            fails.append(f"{name}: drawing past frame {cnt}")
        for c in range(cnt):
            cl = cell(nat, r, c)
            if not cl.getbbox():
                continue
            a = cl.getchannel("A").load()
            border = [a[x, y] for x in range(CC) for y in (0, 1, CC - 2, CC - 1)] + \
                     [a[x, y] for y in range(CC) for x in (0, 1, CC - 2, CC - 1)]
            if sum(1 for v in border if v) >= 2:
                fails.append(f"{name} f{c + 1} cut at the cell edge")
            if panel(cl):
                fails.append(f"{name} f{c + 1} square panel (effect cut into a box / background painted)")
            if (name, c) in (("open", 2), ("open", 3), ("break", 2), ("break", 3)):
                continue                        # flash / spark frames: the burst hides the ball
            b = biggest(cl)
            must = name in ("throw", "shake", "icon") or (name, c) in (("open", 0), ("success", 0), ("break", 0))
            if must and (not b or b[0] < 0.5 * 3.1416 * (meta.get("ball_px", K.BALL_PX) / 2) ** 2):
                fails.append(f"ball missing in {name} f{c + 1}")
            if b:
                bx = (b[1][0] + b[1][2]) / 2
                by = b[1][3] if name == "shake" else (b[1][1] + b[1][3]) / 2
                ty = BASE if name == "shake" else CC / 2
                if abs(bx - CC / 2) > 3 or abs(by - ty) > 3:
                    warns.append(f"{name} f{c + 1} off-centre ({bx - CC / 2:+.0f}, {by - ty:+.0f})")
    throws = {cell(nat, 0, c).tobytes() for c in range(8)}
    if len(throws) < 4:
        warns.append(f"throw: only {len(throws)} different frames")
    for n in meta.get("notes", []):
        if n.startswith("cut in the draft"):
            warns.append(n)
    NB.KEY = meta.get("key", "magenta")
    if meta.get("draft_background"):
        NB.BG[:] = [(255, 0, 255), tuple(meta["draft_background"])]
    allowed = NB.allowed_magenta(bid)
    raw = nat.tobytes()
    mag = sum(1 for j in range(0, len(raw), 4) if raw[j + 3] and (NB.near_magenta(raw[j:j + 3]) or NB.bgdist(raw[j:j + 3]) < 40)
              and not NB.is_allowed(raw[j:j + 3], allowed))
    if mag:
        fails.append(f"{'green' if NB.KEY == 'green' else 'magenta'} left: {mag} px")
    # foreign-colour specks: edge pixels of a magenta / pink hue that the ball's own item art does not have
    # (background bleed on purple balls); the official pink bumps etc. are in the item art
    # only the frames that show just the ball (flash / star / spark frames are tinted with the ball's colours)
    own = NB.ball_colours(bid)
    ref_p = os.path.join(K.folder(bid), f"{bid}-reference.png")
    if os.path.isfile(ref_p):                      # + the official artwork's own colours (pink bumps, hearts …)
        rq = Image.open(ref_p).convert("RGBA")
        own += [c[:3] for _, c in rq.getcolors(1 << 20) if c[3] > 127] if rq.getcolors(1 << 20) else []
    specks = 0
    for r, (name, cnt, _) in enumerate(K.ROWS):
        for c in range(cnt):
            if not (name in ("throw", "shake", "icon") or (name, c) in (("open", 0), ("open", 1), ("success", 0),
                                                                        ("break", 0), ("break", 1))):
                continue
            cl = cell(nat, r, c)
            a = cl.load()
            for y in range(CC):
                for x in range(CC):
                    p = a[x, y]
                    if not p[3] or not (p[0] - p[1] > 50 and p[2] - p[1] > 50):
                        continue
                    if any(not (0 <= nx < CC and 0 <= ny < CC) or not a[nx, ny][3]
                           for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))) and not NB.is_allowed(p, own, 60):
                        specks += 1
    if specks > 20:
        fails.append(f"foreign-colour specks: {specks} px")
    elif specks:
        warns.append(f"foreign-colour specks: {specks} px")
    tag, det = ref_match(bid, nat, meta)
    if tag == "MISMATCH":
        fails.append(f"reference MISMATCH ({det})")
    elif tag == "NO-REF":
        warns.append("reference not compared (no reference image or no icon frame)")
    return ("FAIL" if fails else "WARN" if warns else "PASS"), fails + warns + ([f"reference MATCH"] if tag == "MATCH" else []), nat


def halves(im):
    """dominant colour of the top and bottom halves of the ball in an RGBA image (outline ignored)"""
    im = im.convert("RGBA")
    a = im.getchannel("A")
    if a.getextrema()[0] == 255:                    # no transparency: flood the white / flat border away
        bgc = im.getpixel((0, 0))
        ImageDraw.floodfill(im, (0, 0), (0, 0, 0, 0), thresh=40)
        a = im.getchannel("A")
    bb = a.getbbox()
    if not bb:
        return None
    cy, r = (bb[1] + bb[3]) / 2, (bb[3] - bb[1]) / 2
    px = im.load()
    out = []
    for lo, hi in ((bb[1], cy - 0.2 * r), (cy + 0.2 * r, bb[3])):
        cols = [px[x, y][:3] for y in range(int(lo), int(hi)) for x in range(bb[0], bb[2]) if px[x, y][3] > 127]
        cols = [c for c in cols if 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] >= 45]
        if not cols:
            return None
        strip = Image.frombytes("RGB", (len(cols), 1), b"".join(bytes(c) for c in cols))
        q = strip.quantize(colors=4, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = q.getpalette()
        cs = sorted(q.getcolors(), reverse=True)
        out.append([tuple(pal[3 * i:3 * i + 3]) for n, i in cs if n >= 0.2 * len(cols)])   # the main colours
    return out


def ref_match(bid, nat, meta):
    """MATCH / MISMATCH of the drawn ball's top / bottom colours against the official reference in the folder"""
    ref = os.path.join(K.folder(bid), (meta.get("reference") or {}).get("file", f"{bid}-reference.png"))
    if not os.path.isfile(ref):
        return "NO-REF", ""
    want = halves(Image.open(ref))
    got = halves(cell(nat, K.ROW_INDEX["icon"], 0))
    if not want or not got:
        return "NO-REF", ""
    dist = lambda u, v: sum((a - b) ** 2 for a, b in zip(u, v)) ** 0.5  # noqa: E731
    # the reference's main colour of each half must be one of the drawing's main colours of that half
    d = [min(dist(w[0], g) for g in gs) for w, gs in zip(want, got)]
    tag = "MATCH" if max(d) < 100 else "MISMATCH"
    return tag, f"top {got[0][0]} vs {want[0][0]}, bottom {got[1][0]} vs {want[1][0]}"


SEQ = ([("throw", i) for i in range(8)] * 2 + [("open", i) for i in range(4)] + [("shake", 0)] * 4 +
       ([("shake", i) for i in (1, 2, 1, 0, 3, 4, 3)] + [("shake", 0)] * 6) * 3 +
       [("success", 0)] * 2 + [("success", i) for i in (1, 2, 3)] + [("success", 3)] * 2 + [("shake", 0)] * 8 +
       ([("shake", i) for i in (1, 2, 1, 0, 3, 4, 3)] + [("shake", 0)] * 4) +
       [("break", i) for i in range(4)] + [None] * 4)


def previews(bid, nat):
    os.makedirs(REPORT, exist_ok=True)
    k = 3 if CC <= 64 else 2
    webp = None                                # animated previews stopped (user 2026-11-19: no webp / gif)
    sheet = Image.open(K.sheet_path(bid)).convert("RGBA")
    bg = Image.new("RGBA", sheet.size, BG)
    bg.alpha_composite(sheet)
    png = os.path.join(REPORT, f"{bid}.png")
    bg.convert("RGB").save(png + ".part.png")
    os.replace(png + ".part.png", png)         # the .png last and atomically (a watcher sends it)
    return webp, png


def main():
    ap = argparse.ArgumentParser(description="Check normalized Poké Ball sheets: PASS / WARN / FAIL.")
    ap.add_argument("ids", nargs="+", help="ball ids (poke, master, …)")
    ap.add_argument("--no-preview", action="store_true", help="skip the preview PNG")
    ns = ap.parse_args()
    ids = ns.ids
    log = os.path.join(REPORT, "checks.json")
    os.makedirs(REPORT, exist_ok=True)
    try:
        allres = json.load(open(log, encoding="utf-8"))
    except (OSError, ValueError):
        allres = {}
    for bid in ids:
        res, msgs, nat = check(bid)
        line = f"{res} {bid}" + (": " + "; ".join(msgs) if msgs else "")
        print(line)
        allres[bid] = line
        json.dump(allres, open(log, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        if nat is not None and not ns.no_preview:
            w, p = previews(bid, nat)
            print(f"  preview: {os.path.relpath(p, K.REPO)}")


if __name__ == "__main__":
    main()
