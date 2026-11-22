#!/usr/bin/env python3
"""
Required-content check of a battle pose sheet <slug>-battle.png (Pillow only). PASS only when it has:
  - both views: FRONT (opponent, top-right, facing the lower-left) and BACK (player, bottom-left, facing the upper-right)
  - ATTACK: real motion, and the strike goes toward the foe (front view: the body moves LEFT; back view: RIGHT)
  - HURT:   real motion
  - DODGE:  the body moves clearly sideways
  - FAINT:  the last frames lie on the ground (much wider than tall compared with the standing pose)
usage: python3 tools/units/check_battle.py <slug | path to <slug>-battle.png> [--json]
prints PASS, or FAIL + one line per problem + which image (front / back) to redraw. Exit code 1 on FAIL.
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../.."))
try:
    from PIL import Image
except ImportError:
    sys.path.insert(0, os.path.join(REPO, "tools", "units", ".pydeps"))
    from PIL import Image

C, N = 192, 6
ROWS = ["attack", "hurt", "dodge", "faint"]


def frame_info(cell):
    """(bbox, centre x, opaque mask 48x48) of the drawing in one cell (magenta background)"""
    rgb = cell.convert("RGB")
    b = rgb.tobytes()
    W = cell.width
    xs, ysum, n = 0, 0, 0
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for i in range(0, len(b), 3):
        r, g, bl = b[i], b[i + 1], b[i + 2]
        if r - g > 70 and bl - g > 70 and r > 120 and bl > 120:
            continue
        p = i // 3
        x, y = p % W, p // W
        xs += x; ysum += y; n += 1
        x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
    if not n:
        return None
    small = rgb.resize((48, 48), Image.NEAREST).tobytes()
    mask = [0 if (small[i] - small[i + 1] > 70 and small[i + 2] - small[i + 1] > 70 and small[i] > 120 and small[i + 2] > 120) else 1
            for i in range(0, len(small), 3)]
    return {"box": (x0, y0, x1 + 1, y1 + 1), "cx": xs / n, "cy": ysum / n, "mask": mask, "n": n}


def glitch(cell, stand_n):
    """broken cells the image model sometimes produces: grid / frame lines, a mini sheet, a black silhouette, a
    cropped half drawing. Returns a short reason or None."""
    rgb = cell.convert("RGB")
    W, H = rgb.size
    px = rgb.load()
    mag = lambda p: p[0] - p[1] > 70 and p[2] - p[1] > 70 and p[0] > 120 and p[2] > 120
    # long straight runs of drawn pixels = a border / grid line
    for y in range(H):
        run = best = 0
        for x in range(W):
            run = run + 1 if not mag(px[x, y]) else 0
            best = max(best, run)
        if best >= 0.6 * W and all(mag(px[x, y - 2]) or mag(px[x, y + 2]) for x in range(0, W, 7) if 2 <= y < H - 2):
            return "a frame / grid line across the cell"
    for x in range(W):
        run = best = 0
        for y in range(H):
            run = run + 1 if not mag(px[x, y]) else 0
            best = max(best, run)
        if best >= 0.6 * H and all(mag(px[x - 2, y]) or mag(px[x + 2, y]) for y in range(0, H, 7) if 2 <= x < W - 2):
            return "a frame / grid line across the cell"
    b = rgb.tobytes()
    opaque = dark = 0
    for i in range(0, len(b), 3):
        r, g, bl = b[i], b[i + 1], b[i + 2]
        if r - g > 70 and bl - g > 70 and r > 120 and bl > 120:
            continue
        opaque += 1
        if r + g + bl < 110:
            dark += 1
    if opaque and dark / opaque > 0.6:
        return "a black silhouette instead of the creature"
    if stand_n and opaque < 0.3 * stand_n:
        return "almost empty / a tiny or cropped drawing"
    return None


def sil(cell, n=48):
    """silhouette of the drawing, cropped and scaled to n x n (to compare poses)"""
    rgb = cell.convert("RGB")
    b = rgb.tobytes(); W = rgb.width
    m = Image.new("L", rgb.size, 0); mp = m.load()
    for i in range(0, len(b), 3):
        if not (b[i] - b[i + 1] > 70 and b[i + 2] - b[i + 1] > 70 and b[i] > 120 and b[i + 2] > 120):
            p = i // 3; mp[p % W, p // W] = 255
    bb = m.getbbox()
    m = (m.crop(bb) if bb else m).resize((n, n))
    return [1 if v > 127 else 0 for v in m.tobytes()]


def colour_hist(cell):
    """coarse colour histogram (4 x 4 x 4 bins, opaque pixels only, normalised): tells which side of the body shows"""
    b = cell.convert("RGB").resize((64, 64), Image.NEAREST).tobytes()
    h = [0] * 64
    n = 0
    for i in range(0, len(b), 3):
        r, g, bl = b[i], b[i + 1], b[i + 2]
        if r - g > 70 and bl - g > 70 and r > 120 and bl > 120:
            continue
        h[(r // 64) * 16 + (g // 64) * 4 + bl // 64] += 1
        n += 1
    return [x / max(1, n) for x in h]


def hdist(a, b):
    return sum(abs(x - y) for x, y in zip(a, b))


def change(a, b):
    return 100 * sum(x != y for x, y in zip(a["mask"], b["mask"])) / max(1, sum(a["mask"]))


def check(path):
    im = Image.open(path)
    meta = json.loads(im.text.get("mons-battle", "{}") or "{}")
    im = im.convert("RGB")
    probs = {"front": [], "back": []}
    if im.size != (2 * N * C, len(ROWS) * C):
        return {"front": [f"wrong sheet size {im.size} (expected {2 * N * C}x{len(ROWS) * C})"], "back": []}
    # battle stance vs idle: the standing frame must not be the movement sheet's idle pose copied as is
    idle_like = {}
    try:
        sys.path.insert(0, os.path.join(REPO, "tools", "agy"))
        from battle_pack import look_strip
        slug = os.path.basename(path).rsplit("-battle.png", 1)[0]
        mv = os.path.join(os.path.dirname(path), f"{slug}-movement.png")
        if os.path.isfile(mv):
            import tempfile
            for vi, v in enumerate(("front", "back")):
                t = os.path.join(tempfile.gettempdir(), f"_look_{slug}_{v}.png")
                look_strip(mv, v, t)
                a_ = sil(im.crop((vi * N * C, 0, vi * N * C + C, C)))
                b_ = sil(Image.open(t).convert("RGB").crop((0, 0, C, C)))
                inter = sum(1 for x, y in zip(a_, b_) if x and y); union = sum(1 for x, y in zip(a_, b_) if x or y)
                idle_like[v] = inter / max(1, union)
    except Exception:  # noqa: BLE001 - the stance check is advisory when the movement sheet is unusual
        pass
    # reference colours of each side: the standing frame (attack row, frame 1) of each view
    ref = {v: colour_hist(im.crop((vi * N * C, 0, vi * N * C + C, C))) for vi, v in enumerate(("front", "back"))}
    sides_differ = hdist(ref["front"], ref["back"]) > 0.25    # e.g. Armaldo: blue back, yellow belly
    heights = {}
    for vi, view in enumerate(("front", "back")):
        other = "back" if view == "front" else "front"
        if sides_differ:
            wrong = []
            for r, row in enumerate(ROWS):
                for i in range(N if row != "faint" else 4):          # lying faint frames may show any side
                    h = colour_hist(im.crop(((vi * N + i) * C, r * C, (vi * N + i + 1) * C, (r + 1) * C)))
                    if hdist(h, ref[other]) < hdist(h, ref[view]) * 0.9:   # clearly the other side (a face profile is fine)
                        wrong.append(f"{row} {i + 1}")
            if wrong:
                probs[view].append(f"frames turned to the wrong side (they show the {other.upper()} of the body, the "
                                   f"{view.upper()} view must keep its angle): " + ", ".join(wrong))
        fr = {row: [frame_info(im.crop(((vi * N + i) * C, r * C, (vi * N + i + 1) * C, (r + 1) * C))) for i in range(N)]
              for r, row in enumerate(ROWS)}
        if view not in meta.get("views", ["front", "back"]) or all(f is None for row in fr.values() for f in row):
            probs[view].append(f"{view.upper()} view missing")
            continue
        for row, fs in fr.items():
            if sum(f is None for f in fs) > 1:
                probs[view].append(f"{row}: {sum(f is None for f in fs)} empty frames")
        stand0 = next((f for f in fr["attack"] if f), None)
        broken = []
        for r, row in enumerate(ROWS):
            for i in range(N):
                why = glitch(im.crop(((vi * N + i) * C, r * C, (vi * N + i + 1) * C, (r + 1) * C)), stand0["n"] if stand0 else 0)
                if why and not (row == "faint" and i >= 4 and why.startswith("almost empty")):
                    broken.append(f"{row} {i + 1} ({why})")
        if broken:
            probs[view].append("broken frames: " + "; ".join(broken))
        stand = next((f for f in fr["attack"] if f), None)
        if not stand:
            continue
        sh = stand["box"][3] - stand["box"][1]
        sw = stand["box"][2] - stand["box"][0]
        heights[view] = sh
        if idle_like.get(view, 0) > 0.9:
            probs[view].append(f"STANCE: the standing frame is the idle pose of the movement sheet copied as is "
                               f"({idle_like[view]:.0%} the same) — frames 1 and 6 must be a battle stance (tense, leaning "
                               f"toward the foe, claws / wings up)")
        if max(sh, sw) < 0.4 * C:      # normalized sprites fill most of their 192 px cell
            probs[view].append(f"{view.upper()} sprites are tiny ({sw}x{sh}px in a {C}px cell, need >= {int(0.4 * C)}): "
                               f"a stray line / mark in the drawing probably shrank them — redraw without grid lines")

        def motion(fs):
            v = [f for f in fs if f]
            return sum(change(v[i], v[i + 1]) for i in range(len(v) - 1)) / max(1, len(v) - 1)

        # ATTACK: moves, and the strike goes toward the foe
        m = motion(fr["attack"])
        if m < 8:
            probs[view].append(f"ATTACK barely moves ({m:.0f}% change, need >= 8)")
        mid = [f for f in fr["attack"][2:5] if f]
        if mid and stand:
            # the strike must REACH further toward the foe than the standing pose: the left edge for the opponent
            # (foe at the lower-left), the right edge for the player (foe at the upper-right)
            if view == "front":
                reach = max(stand["box"][0] - f["box"][0] for f in mid)
            else:
                reach = max(f["box"][2] - stand["box"][2] for f in mid)
            if reach < 0.03 * C:
                probs[view].append(f"ATTACK does not reach toward the foe ({'LEFT / lower-left' if view == 'front' else 'RIGHT / upper-right'}): "
                                   f"the strike reaches only {reach:+.0f}px past the standing pose (need >= {0.03 * C:.0f})")
        # HURT
        m = motion(fr["hurt"])
        if m < 5:
            probs[view].append(f"HURT barely moves ({m:.0f}% change, need >= 5)")
        # DODGE: sideways
        dv = [f for f in fr["dodge"] if f]
        if dv:
            # sideways = the body's edges move, not only its centre (a smoke cloud or a tail can shift the centre)
            side = max(min(abs(f["box"][0] - dv[0]["box"][0]), abs(f["box"][2] - dv[0]["box"][2])) for f in dv)
            if side < 0.05 * C:
                probs[view].append(f"DODGE does not move sideways (the body shifts at most {side:.0f}px, need >= {0.05 * C:.0f})")
        # FAINT: lying at the end
        fv = [f for f in fr["faint"][4:] if f]
        if fv:
            asp_stand = sw / max(1, sh)
            asp_end = max((f["box"][2] - f["box"][0]) / max(1, f["box"][3] - f["box"][1]) for f in fv)
            low = max(f["box"][3] - f["box"][1] for f in fv) < 0.8 * sh
            # smoke / flames on the back can keep the box tall: a body that went down moves its mass lower
            sunk = max(f["cy"] for f in fv) - stand["cy"] >= 0.07 * C
            if not (asp_end > asp_stand * 1.3 or low or sunk):
                probs[view].append("FAINT does not end lying on the ground (frames 5-6 still standing)")
        else:
            probs[view].append("FAINT frames 5-6 missing")
    if len(heights) == 2 and min(heights.values()) < 0.6 * max(heights.values()):
        small = min(heights, key=heights.get)
        probs[small].append(f"{small.upper()} is much smaller than the other view ({heights['front']} vs {heights['back']}px tall): "
                            f"both views must show the creature at the same size")
    return probs


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    q = args[0]
    path = q if os.path.isfile(q) else (glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{q.lower()}-battle.png")) or [None])[0]
    if not path:
        print(f"FAIL {q}: no battle sheet (<slug>-battle.png) — draw it with the expedition-battle-poses skill")
        sys.exit(1)
    probs = check(path)
    bad = {v: p for v, p in probs.items() if p}
    if "--json" in sys.argv:
        print(json.dumps({"path": os.path.relpath(path, REPO), "pass": not bad, "problems": probs}))
    elif not bad:
        print(f"PASS {os.path.relpath(path, REPO)}: front + back views, attack toward the foe, hurt, dodge sideways, faint lying")
    else:
        print(f"FAIL {os.path.relpath(path, REPO)}")
        for v, ps in bad.items():
            for p in ps:
                print(f"  [{v}] {p}")
        print("  redraw: " + " + ".join(f"{v.upper()} image" for v in bad))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
