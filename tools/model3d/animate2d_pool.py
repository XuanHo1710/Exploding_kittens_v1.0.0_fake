"""Hand-drawn movement with the 3D motion, using a POOL of hand-drawn poses per direction (more distinct drawings than
the 4 keys of a v2 sheet), e.g. all 6 rows (Walk A/B, Run A/B, Fly A/B) of a legacy 8x6 movement sheet.

For every output frame (default 12 per loop) and direction (down, left, right, up), the 3D loop of the same direction
gives a phase (normalised silhouette height: wings up / legs apart = high) and a body bob; the pool drawing whose
normalised height is closest is shown (never the same drawing twice in a row when another one is almost as close),
shifted by the 3D bob. Hovering creatures (--hover) are all lifted to the same height above one shared shadow.
Eyes: `--fix-eyes ROW:SRC` replaces odd eyes of pool row ROW with the eyes of pool row SRC (same direction).

usage: python tools/model3d/animate2d_pool.py <legacy 8x6 movement.png> <3d sheets dir> <slug> <3d mode> <out.png>
          [--frames 12] [--hover] [--fix-eyes 5:2] [--exclude "0:4,6"]
          [--loop "walk:1,2,3,4" --loop "fly:5,6,1:hover"]   (several loops -> walk_fly sheet, mode arg ignored)
"""
import json, os, sys
import numpy as np
import cv2
from PIL import Image
from animate2d import split_cell, metrics, norm, save_with_loops

C = 192
LEGACY_COL = [0, 6, 2, 4]          # legacy 8-direction columns for down, left, right, up
DIR3D = [0, 6, 2, 4]               # 3D sheet columns (same order)
LEGACY_LIFT = [0, 0, 0, 0, 22, 19]  # normalize_sheet.py lifts of the legacy rows (192 px cells)
EYE_BAND = (90, 160)                # y range (cell px) where eyes can be
SHADOW_Y = 160                      # legacy fly rows: everything at/below this y is the painted ground shadow


def eye_clusters(cell):
    r, g, b = [cell[..., i].astype(int) for i in range(3)]
    white = (np.minimum(np.minimum(r, g), b) > 236) & ((np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)) < 14)
    merged = cv2.dilate(white.astype(np.uint8), np.ones((5, 5), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(merged, 8)
    # eyes sit in the head band of the cell (not on wing tips) and are roughly round
    cl = [(cen[i], max(st[i, 2], st[i, 3]) / 2, st[i, 4]) for i in range(1, n)
          if st[i, 4] >= 60 and max(st[i, 2], st[i, 3]) <= 34 and 0.55 <= st[i, 2] / max(1, st[i, 3]) <= 1.8
          and EYE_BAND[0] <= cen[i][1] <= EYE_BAND[1]]
    cl = sorted(cl, key=lambda e: -e[2])[:2]
    return sorted(cl, key=lambda e: e[0][0])


def fix_eyes(tgt, src):
    te, se = eye_clusters(tgt), eye_clusters(src)
    k = min(len(te), len(se))
    if not k:
        return 0
    if len(te) != len(se):  # keep the k largest of each, left-to-right
        te = sorted(sorted(te, key=lambda e: -e[2])[:k], key=lambda e: e[0][0])
        se = sorted(sorted(se, key=lambda e: -e[2])[:k], key=lambda e: e[0][0])
    for (tc, tr, _), (sc, sr, _) in zip(te, se):
        R = int(round(max(tr, sr))) - 1
        for dy in range(-R, R + 1):
            for dx in range(-R, R + 1):
                if dx * dx + dy * dy > R * R:
                    continue
                ty, tx = int(round(tc[1])) + dy, int(round(tc[0])) + dx
                sy, sx = int(round(sc[1])) + dy, int(round(sc[0])) + dx
                if 0 <= ty < C and 0 <= tx < C and 0 <= sy < C and 0 <= sx < C:
                    p = src[sy, sx]
                    if not (p[0] > 200 and p[1] < 60 and p[2] > 200):
                        tgt[ty, tx] = p
    return k


def parse_loops(argv, mode, hover):
    """--loop "MODE3D:ROWS[:hover][:seq]" (repeatable, rows 1-based) -> [(mode, rows0, flags)]; default: one loop, all rows.
    hover: lift every drawing to the fly height over one shadow. seq: play ROWS in the given order once per step pair
    (walk cycles: contact L, passing, contact R, passing), the number of steps taken from the 3D body bob."""
    loops = [argv[i + 1] for i, x in enumerate(argv) if x == "--loop"]
    if not loops:
        return [(mode, list(range(6)), {"hover"} if hover else set())]
    out = []
    for spec in loops:
        parts = spec.split(":")
        flags = set(parts[2:])
        out.append((parts[0], [int(x) - 1 for x in parts[1].split(",")], flags))
    return out


def main():
    legacy, sheets, slug, mode, out = sys.argv[1:6]
    N = int(sys.argv[sys.argv.index("--frames") + 1]) if "--frames" in sys.argv else 12
    loops = parse_loops(sys.argv, mode, "--hover" in sys.argv)
    fixes = [tuple(map(int, sys.argv[sys.argv.index("--fix-eyes") + 1].split(":")))] if "--fix-eyes" in sys.argv else []
    # --exclude "0:4,6;1:2"  -> per direction (0 down, 1 left, 2 right, 3 up) pool rows (1-based) never to show
    exclude = {}
    if "--exclude" in sys.argv:
        for part in sys.argv[sys.argv.index("--exclude") + 1].split(";"):
            dr, rows = part.split(":")
            exclude[int(dr)] = {int(x) - 1 for x in rows.split(",")}
    a = np.asarray(Image.open(legacy).convert("RGB")).copy()
    meta = json.load(open(os.path.join(sheets, f"{slug}.json")))
    sheet = Image.new("RGB", (N * len(loops) * C, 4 * C), (255, 0, 255))
    log = []
    for r, lc in enumerate(LEGACY_COL):
        cells = [a[row * C:(row + 1) * C, lc * C:(lc + 1) * C].copy() for row in range(6)]
        shadow_cell = cells[4].copy()  # Fly A cell carries the ground shadow ellipse (kept before cleaning)
        for row in (4, 5):             # drop the painted shadows from the fly drawings themselves
            cells[row][SHADOW_Y:] = (255, 0, 255)
        for row, srow in fixes:
            n = fix_eyes(cells[row], cells[srow])
            log.append(f"dir{r} row{row}: {n} eye(s) fixed")
        pool = [split_cell(Image.fromarray(c)) for c in cells]
        ph = norm([metrics(np.asarray(p[0])[..., 3] > 0)["h"] for p in pool])
        sc = shadow_cell.copy(); sc[:SHADOW_Y] = (255, 0, 255)
        shadow = ~((sc[..., 0].astype(int) - sc[..., 1] > 80) & (sc[..., 2].astype(int) - sc[..., 1] > 80))
        for li, (mode3d, rows, flags) in enumerate(loops):
            hover, seqmode = "hover" in flags, "seq" in flags
            md = meta["modes"].get(mode3d) or meta["modes"].get("walk")
            im3 = np.asarray(Image.open(os.path.join(sheets, md["file"])).convert("RGBA"))
            c3, F3 = md["cell"], meta["frames"]
            idx = [round(i * F3 / N) % F3 for i in range(N)]
            m3 = [metrics(im3[f * c3:(f + 1) * c3, DIR3D[r] * c3:(DIR3D[r] + 1) * c3, 3] > 0) for f in idx]
            h3 = norm([x["h"] for x in m3])
            allowed = [j for j in rows if j not in exclude.get(r, ())]
            k = np.mean([metrics(np.asarray(pool[j][0])[..., 3] > 0)["h"] for j in allowed]) / max(1e-6, np.mean([x["h"] for x in m3]))
            bot0 = np.mean([x["bot"] for x in m3])
            # rank mapping: the allowed drawings are spread evenly over 0..1 in order of height, so every pose gets a
            # fair share of the loop (raw heights let one extreme pose swallow half the loop)
            order_h = sorted(allowed, key=lambda j: ph[j])
            rank = np.full(len(pool), 9.0)
            for q, j in enumerate(order_h):
                rank[j] = q / max(1, len(order_h) - 1)
            # steps per loop = number of bob dips of the 3D body (lowest point = foot planted); a stride is 2 steps
            # count on the front view (cleanest vertical bob) so every direction gets the same step count
            bots = [metrics(im3[f * c3:(f + 1) * c3, DIR3D[0] * c3:(DIR3D[0] + 1) * c3, 3] > 0)["bot"] for f in idx]
            steps = sum(1 for i in range(N) if bots[i] > bots[i - 1] and bots[i] >= bots[(i + 1) % N]) or 2
            strides = max(1, round(steps / 2))
            prev, seq = None, []
            for i in range(N):
                if seqmode:  # fixed walk order, `strides` times per loop
                    best = rows[int(((i / N) * strides % 1) * len(rows))]
                    prev = best
                    seq.append(int(best) + 1)
                    spr, _ = pool[best]
                    dy = int(round((m3[i]["bot"] - bot0) * k))
                    cell = np.full((C, C, 3), (255, 0, 255), np.uint8)
                    cim = Image.fromarray(cell)
                    cim.paste(spr.convert("RGB"), (0, dy), spr)
                    sheet.paste(cim, ((li * N + i) * C, r * C))
                    continue
                d = np.abs(rank - h3[i])
                order = list(np.argsort(d))
                best = order[0]
                if best == prev and len(order) > 1 and d[order[1]] - d[best] < 0.12:
                    best = order[1]
                prev = best
                seq.append(int(best) + 1)
                spr, _ = pool[best]
                dy = int(round((m3[i]["bot"] - bot0) * k))
                lift = (LEGACY_LIFT[4] - LEGACY_LIFT[best]) if hover else 0
                cell = np.full((C, C, 3), (255, 0, 255), np.uint8)
                if hover:
                    cell[shadow] = shadow_cell[shadow]
                cim = Image.fromarray(cell)
                cim.paste(spr.convert("RGB"), (0, dy - lift), spr)
                sheet.paste(cim, ((li * N + i) * C, r * C))
            log.append(f"dir{r} {mode3d}{' (seq, %d stride(s))' % strides if seqmode else ''}: pool rows {seq}")
    save_with_loops(sheet, out, [{"mode": m3 if m3 in ("walk", "run", "fly") else "walk", "frames": N,
                                  "cycle": round((meta["modes"].get(m3) or meta["modes"]["walk"])["cycle"], 3),
                                  "keys": m3} for m3, _, _ in loops])
    print(f"{slug}: {sheet.size[0]}x{sheet.size[1]} ({len(loops)} loop(s) x {N} frames)")
    print("\n".join("  " + x for x in log))


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    main()
