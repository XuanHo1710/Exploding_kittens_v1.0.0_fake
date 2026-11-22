#!/usr/bin/env python3
"""
Fast Sprite Sheet Post-Processor for Mons-Models (< 2 seconds).
Converts raw AI-generated movement sheets (v2 "move4": 4 directions x 4-frame loops, layouts walk 4x4 /
walk_fly 8x4 / fly 4x4; legacy "movement": 8x6) or 8x5 (posses) .jpg/.png sheets into
strict pixel-grid PNGs on pure #FF00FF magenta:

Default (--cell-size 128, --safe-box 104, margin 12 px):
  - movement: 1024x768 (8 cols x 6 rows of 128x128 px, biggest pose fills 104x104 safe box -> ~85-104 px tall)
  - posses:   1024x640 (8 cols x 5 rows of 128x128 px, biggest pose fills 104x104 safe box -> ~85-104 px tall)

HD Mode (--cell-size 192, auto --safe-box 160, margin 16 px):
  - movement: 1536x1152 (8 cols x 6 rows of 192x192 px, biggest pose fills 160x160 safe box)
  - posses:   1536x960  (8 cols x 5 rows of 192x192 px, biggest pose fills 160x160 safe box)

Usage:
  python3 normalize_sheet.py \
    --mode move4|movement|posses [--layout walk|walk_fly|fly] [--row-order 1,2,3,4] \
    --input /path/to/raw_generated.jpg \
    --output assets/pokemon/<GenX-Region>/<Mon>/<mon>-movement.png \
    [--cell-size 128|192] \
    [--safe-box 104] \
    [--col-order 1,2,3,4,5,6,7,8] \
    [--row-col-order "1:1,8,7,6,5,4,3,2;2:1,8,7,6,5,4,3,2"] \
    [--reference <slug>-reference.jpg] [--allow-loss]

Background keying (magenta.py, shared with clean_magenta.py / check_magenta.py): slots painted their own background
(panels, checkerboards) are flattened first; then the key, its darker / greyed shades and JPEG noise are flooded
from the background (enclosed pixels of the drawing are never keyed), panel / grid border lines dropped, and the
1-2 px pink fringe despilled to the body / outline colour. Colours of the species' own art (its reference artwork,
found from the output name, and its Fall-back texture) are never keyed. Guard: the run stops (exit 3) when a slot
would lose more than half of the pixels the previous keying kept (`--allow-loss` to accept). The finished sheet gets
the same clean as clean_magenta.py, so check_magenta.py passes on it.
"""
import argparse
import os
import sys
from collections import deque

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PYDEPS = os.path.join(SCRIPT_DIR, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)

from PIL import Image, ImageDraw  # noqa: E402

sys.path.insert(0, SCRIPT_DIR)
import magenta as M  # noqa: E402


def is_magenta_bg(r, g, b):
    return g < 115 and r > 180 and b > 180 and (r - g) > 100 and (b - g) > 100


def _mask(cond):
    """ImageMath result (mode I, 0/1) -> L mask 0/255"""
    return cond.convert("L").point(lambda v: 255 if v else 0)


def near_key_mask(im, shades=(), dist=100, shade_dist=40):
    """L mask (255 = background) of the pixels the old keying removed (is_magenta_bg), the pixels within `dist` of
    #FF00FF (JPEG noise of the key) and the pixels within `shade_dist` of one of the draft's own background shades"""
    from PIL import ImageMath, ImageChops
    if not hasattr(ImageMath, "lambda_eval"):                  # Pillow < 10.3: plain Python
        rgb = im.convert("RGB")
        raw = rgb.tobytes()
        out = bytearray(rgb.width * rgb.height)
        for i in range(len(out)):
            r, g, b = raw[3 * i], raw[3 * i + 1], raw[3 * i + 2]
            if is_magenta_bg(r, g, b) or (255 - r) ** 2 + g * g + (255 - b) ** 2 < dist * dist or \
                    any((r - s[0]) ** 2 + (g - s[1]) ** 2 + (b - s[2]) ** 2 < shade_dist ** 2 for s in shades):
                out[i] = 255
        return Image.frombytes("L", rgb.size, bytes(out))
    r, g, b = (band.convert("I") for band in im.convert("RGB").split())
    ev = ImageMath.lambda_eval
    m = _mask(ev(lambda a: (a["g"] < 115) & (a["r"] > 180) & (a["b"] > 180) & ((a["r"] - a["g"]) > 100)
                 & ((a["b"] - a["g"]) > 100), r=r, g=g, b=b))
    m = ImageChops.lighter(m, _mask(ev(lambda a: ((255 - a["r"]) * (255 - a["r"]) + a["g"] * a["g"] +
                                                  (255 - a["b"]) * (255 - a["b"])) < dist * dist, r=r, g=g, b=b)))
    for s in shades:
        m = ImageChops.lighter(m, _mask(ev(lambda a, s=s: ((a["r"] - s[0]) * (a["r"] - s[0]) + (a["g"] - s[1]) * (a["g"] - s[1]) +
                                                         (a["b"] - s[2]) * (a["b"] - s[2])) < shade_dist * shade_dist,
                                           r=r, g=g, b=b)))
    return m


def flatten_slots(im, cols, rows, thresh=36):
    """the image model sometimes paints every slot its own background (pink / grey panel, checkerboard). Per slot:
    the most common colour of a ring just inside the slot border is its background when it covers >= half of the
    ring; flood it from the ring (only through pixels within `thresh`, so the outline stops the fill) and paint it
    #FF00FF. Runs only when the slots' backgrounds differ from the key"""
    out = im.convert("RGB").copy()
    W, H = out.size
    sw, sh = W / cols, H / rows
    from collections import Counter
    n = 0
    for r in range(rows):
        for c in range(cols):
            x0, y0, x1, y1 = int(c * sw) + 2, int(r * sh) + 2, int((c + 1) * sw) - 3, int((r + 1) * sh) - 3
            if x1 - x0 < 16 or y1 - y0 < 16:
                continue
            ring = [out.getpixel((x, y)) for x in range(x0, x1, 3) for y in (y0, y1)] + \
                   [out.getpixel((x, y)) for y in range(y0, y1, 3) for x in (x0, x1)]
            (mk, cnt), = Counter((v[0] // 8, v[1] // 8, v[2] // 8) for v in ring).most_common(1)
            mc = tuple(v * 8 + 4 for v in mk)
            if cnt < 0.5 * len(ring) or M.kdist2(mc) < 100 * 100:
                continue                                  # no flat slot background, or it is the key already
            cell = out.crop((x0 - 2, y0 - 2, x1 + 3, y1 + 3))
            for x, y in [(x, y) for x in range(x0, x1, 6) for y in (y0, y1)] + [(x, y) for y in range(y0, y1, 6) for x in (x0, x1)]:
                v = cell.getpixel((x - x0 + 2, y - y0 + 2))
                if v != M.KEY and max(abs(a - b) for a, b in zip(v, mc)) <= thresh:
                    ImageDraw.floodfill(cell, (x - x0 + 2, y - y0 + 2), M.KEY, thresh=thresh)
            out.paste(cell, (x0 - 2, y0 - 2))
            n += 1
    return out, n


def draft_shades(im, share=0.02):
    """key-hued colours covering >= share of the draft (the model's own background shades)"""
    small = im.convert("RGB").resize((max(1, im.width // 4), max(1, im.height // 4)), Image.Resampling.NEAREST)
    from collections import Counter
    raw = small.tobytes()
    px = (tuple(raw[i:i + 3]) for i in range(0, len(raw), 3))
    c = Counter((p[0] // 16, p[1] // 16, p[2] // 16) for p in px if M.is_tinted(p) and max(p[0], p[2]) > 150
                and p[1] < 0.5 * min(p[0], p[2]))
    n = small.width * small.height
    return [tuple(v * 16 + 8 for v in k) for k, k_n in c.items() if k_n >= share * n]


def find_allowed(args):
    """the species' own magenta-ish colours: --reference, else <slug>-reference.jpg found from the output / input
    name (output folder, input folder, the species folder), plus its Fall-back texture"""
    slug = M.slug_of(args.output) or M.slug_of(args.input)
    cols = []
    if args.reference:
        cols += M.palette_of(args.reference)
    if slug:
        cols += M.allowed_colours(slug, None, extra_dirs=(os.path.dirname(os.path.abspath(args.output)),
                                                          os.path.dirname(os.path.abspath(args.input))))
    return M.Allowed(cols)


def key_draft(im, cols, rows, args, allowed):
    """raw draft -> RGBA with the background transparent (see the module docstring); stops on the loss guard"""
    flat, nflat = flatten_slots(im, cols, rows)
    W, H = flat.size
    px = bytearray(flat.tobytes())
    shades = draft_shades(flat)
    bg = bytearray(near_key_mask(flat, shades).tobytes().translate(M._TO1))
    kinds = {}
    stats, _ = M.clean(px, bg, W, H, allowed, cell=(max(1, W // cols), max(1, H // rows)), guard=0, kinds=kinds)
    # loss guard against the previous keying of the same (flattened) draft: per slot, the pixels it kept that are
    # now background, not counting near-key pixels and key / panel / frame removals (background, not drawing)
    kept_m = near_key_mask(flat, dist=0).point(lambda v: 0 if v else 255)       # old keying: opaque = 255
    bgkind = bytearray(W * H)
    for i, k in kinds.items():
        if k in ("key", "panel", "frame"):
            bgkind[i] = 255
    from PIL import ImageChops
    gone = ImageChops.subtract(ImageChops.multiply(kept_m, M.mask_of(bg, W, H)),
                               ImageChops.lighter(Image.frombytes("L", (W, H), bytes(bgkind)), near_key_mask(flat)))
    sw, sh = W / cols, H / rows
    kept, lost = {}, {}
    for r in range(rows):
        for c in range(cols):
            box = (int(c * sw), int(r * sh), int((c + 1) * sw), int((r + 1) * sh))
            kept[(c, r)] = kept_m.crop(box).histogram()[255]
            lost[(c, r)] = gone.crop(box).histogram()[255]
    bad = sorted(c for c, n in lost.items() if kept.get(c, 0) >= 200 and n > 0.5 * kept[c])
    if bad:
        msg = ("slot(s) (row,col, 1-based) " + ", ".join(f"{r + 1},{c + 1}" for c, r in bad) +
               " would lose more than half of their drawing to the background key")
        if not getattr(args, "allow_loss", False):
            print("ERROR: " + msg + " - check the draft (a pink / purple Pokemon whose colours are not in its "
                  "reference?) or pass --allow-loss to accept.")
            sys.exit(3)
        print("WARNING: " + msg + " (--allow-loss)")
    if nflat or stats["key"] + stats["shade"] + stats["frame"] > 2000:
        print(f"NOTE: background cleaned: {nflat} slot background(s) flattened, key {stats['key']} shade "
              f"{stats['shade']} frame {stats['frame']} fringe {stats['fringe']} px")
    rgba = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    a = Image.frombytes("L", (W, H), bytes(bg).translate(bytes([255] + [0] * 255)))
    rgba.paste(Image.frombytes("RGB", (W, H), bytes(px)), (0, 0), a)
    return rgba


def final_pass(sheet, allowed):
    """the finished sheet gets the clean_magenta.py pass (until nothing changes), so check_magenta.py passes"""
    for _ in range(3):
        out, st, _ = M.clean_image(sheet, allowed)
        if st["reverted"]:
            print("WARNING: magenta clean left cell(s) (col,row, 0-based) " + ", ".join(map(str, st["reverted"])) +
                  " as drawn: cleaning would remove more than half of the drawing")
        if not (st["key"] + st["shade"] + st["frame"] + st["fringe"] + st["speck"]):
            break
        sheet = out
    return sheet


def find_row_bounds(rgba, rows):
    w, h = rgba.size
    px = rgba.load()
    row_cnts = [sum(1 for x in range(w) if px[x, y][3] > 0) for y in range(h)]
    approx_ch = h / rows
    cuts = [0]
    for r in range(1, rows):
        expected_y = r * approx_ch
        lo = max(1, int(expected_y - approx_ch * 0.38))
        hi = min(h - 1, int(expected_y + approx_ch * 0.38))
        best_y = min(range(lo, hi + 1), key=lambda y: (row_cnts[y], abs(y - expected_y)))
        cuts.append(best_y)
    cuts.append(h)
    return cuts


def strip_attached_ground_shadow(sprite_rgba):
    im = sprite_rgba.copy()
    w, h = im.size
    px = im.load()
    cut_y = h
    while cut_y > int(h * 0.75):
        y = cut_y - 1
        colored_or_bright = 0
        non_transparent = 0
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:
                non_transparent += 1
                # Preserve any colored/shaded sprite pixels (including dark purple/grey/brown)
                # and only treat very dark (< 65) neutral/shadow pixels as potential shadow.
                if max(r, g, b) >= 65:
                    colored_or_bright += 1
        if non_transparent == 0 or colored_or_bright == 0:
            cut_y = y
        else:
            break
    # Do not strip thin 1-3 px bottom outlines (only strip genuine >=4 px thick attached shadows).
    if h - cut_y < 4:
        return im
    if cut_y < h:
        crop = im.crop((0, 0, w, cut_y))
        bbox = crop.getbbox()
        return crop.crop(bbox) if bbox else crop
    return im


def find_components(rgba):
    w, h = rgba.size
    px = rgba.load()
    vis = [[False] * w for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if not vis[y][x] and px[x, y][3] > 0:
                q = deque([(x, y)])
                vis[y][x] = True
                pts = []
                minx = maxx = x
                miny = maxy = y
                while q:
                    cx, cy = q.popleft()
                    pts.append((cx, cy))
                    if cx < minx:
                        minx = cx
                    if cx > maxx:
                        maxx = cx
                    if cy < miny:
                        miny = cy
                    if cy > maxy:
                        maxy = cy
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            if dx == 0 and dy == 0:
                                continue
                            nx, ny = cx + dx, cy + dy
                            if 0 <= nx < w and 0 <= ny < h and not vis[ny][nx] and px[nx, ny][3] > 0:
                                vis[ny][nx] = True
                                q.append((nx, ny))
                bw, bh = maxx + 1 - minx, maxy + 1 - miny
                # drop stray lines the image model sometimes draws (grid / frame borders): long and only a few px thick
                # (they would otherwise set the shared scale and shrink every sprite)
                if (min(bw, bh) <= 4 and max(bw, bh) >= 40) or (len(pts) < 0.12 * bw * bh and max(bw, bh) >= 120 and min(bw, bh) <= 8):
                    continue
                comps.append({
                    "pts": pts,
                    "bbox": (minx, miny, maxx + 1, maxy + 1),
                    "cx": (minx + maxx) / 2.0,
                    "cy": (miny + maxy) / 2.0,
                    "area": len(pts),
                })
    return comps


def extract_cell_sprite(rgba, comps, row_cuts, cols, row1, col1, include_sparks=False, strip_shadow=False):
    w, _ = rgba.size
    cw = w / cols
    target_cx = (col1 - 0.5) * cw
    ry0, ry1 = row_cuts[row1 - 1], row_cuts[row1]

    candidates = [
        c for c in comps
        if c["area"] >= 150
        and ry0 <= c["cy"] <= ry1
        and abs(c["cx"] - target_cx) < cw * 0.50
    ]
    if not candidates:
        x0, x1 = max(0, int((col1 - 1) * cw)), min(w, int(col1 * cw))
        sub = rgba.crop((x0, ry0, x1, ry1))
        bbox = sub.getbbox()
        crop = sub.crop(bbox) if bbox else Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        return strip_attached_ground_shadow(crop) if strip_shadow else crop

    main = max(candidates, key=lambda c: c["area"])
    selected = [main]

    min_extra_area = 6 if include_sparks else 45
    mx0, my0, mx1, my1 = main["bbox"]
    for c in comps:
        if c is main:
            continue
        if min_extra_area <= c["area"] <= 950 and ry0 <= c["cy"] <= ry1 and abs(c["cx"] - target_cx) < cw * 0.56:
            bx0, by0, bx1, by1 = c["bbox"]
            # Skip detached ground shadow ellipses below the main sprite in Fly rows
            if strip_shadow and by0 >= my1 - 2 and (bx1 - bx0) > (by1 - by0) * 2.2:
                continue
            hgap = max(0, max(mx0 - bx1, bx0 - mx1))
            vgap = max(0, max(my0 - by1, by0 - my1))
            if hgap <= 45 and vgap <= 24:
                selected.append(c)

    px = rgba.load()
    minx = min(c["bbox"][0] for c in selected)
    miny = min(c["bbox"][1] for c in selected)
    maxx = max(c["bbox"][2] for c in selected)
    maxy = max(c["bbox"][3] for c in selected)

    crop = Image.new("RGBA", (maxx - minx, maxy - miny), (0, 0, 0, 0))
    cpx = crop.load()
    for c in selected:
        for x, y in c["pts"]:
            cpx[x - minx, y - miny] = px[x, y]

    if strip_shadow:
        crop = strip_attached_ground_shadow(crop)
    crop.info["dx"] = (minx + maxx) / 2 - target_cx   # sideways offset of the drawing from its slot centre (source px)
    return crop


def scale_rgba(im, factor):
    nw = max(1, int(round(im.width * factor)))
    nh = max(1, int(round(im.height * factor)))
    try:
        return im.resize((nw, nh), Image.Resampling.NEAREST)
    except SystemError:
        ow, oh = im.size
        src = memoryview(im.tobytes())
        x_map = [min(ow - 1, int((x + 0.5) * ow / nw)) * 4 for x in range(nw)]
        out = bytearray(nw * nh * 4)
        row_stride = ow * 4
        dst_idx = 0
        for y in range(nh):
            sy_off = min(oh - 1, int((y + 0.5) * oh / nh)) * row_stride
            for sx_off in x_map:
                off = sy_off + sx_off
                out[dst_idx:dst_idx + 4] = src[off:off + 4]
                dst_idx += 4
        return Image.frombytes("RGBA", (nw, nh), bytes(out))


def make_shadow_ellipse(width=44, height=7):
    sh = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    d.ellipse([0, 0, width - 1, height - 1], fill=(42, 16, 58, 255), outline=(27, 23, 38, 255))
    return sh


def parse_orders(default_order_str, row_overrides_str, num_rows):
    base = [int(x.strip()) for x in default_order_str.split(",")]
    assert len(base) == 8, "--col-order must have 8 comma-separated integers (1..8, negative to flip)"
    orders = {r: list(base) for r in range(1, num_rows + 1)}
    if row_overrides_str:
        for part in row_overrides_str.split(";"):
            part = part.strip()
            if not part:
                continue
            r_str, cols_str = part.split(":")
            r = int(r_str.strip())
            c_list = [int(x.strip()) for x in cols_str.split(",")]
            assert len(c_list) == 8
            orders[r] = c_list
    return orders


def normalize_move4(args, cell_sz, safe_sz, margin):
    """v2 movement sheet: rows = 4 directions (down, left, right, up), columns = frame loops.
    layout walk (4x4: Walk), walk_fly (8x4: Walk 1-4 + Fly 5-8), fly (4x4: Fly/hover);
    layout loop (v3, one movement loop per generated image): --frames N columns, --air = lifted over a shadow."""
    if args.layout == "loop":
        cols, rows = args.frames, 4
        is_fly = lambda c: args.air
    else:
        cols, rows = (8 if args.layout == "walk_fly" else 4), 4
        is_fly = lambda c: args.layout == "fly" or (args.layout == "walk_fly" and c >= 4)
    order = [int(x) for x in args.row_order.split(",")]
    assert len(order) == 4, "--row-order needs 4 entries (down,left,right,up); negative = mirror that source row"
    allowed = find_allowed(args)
    rgba = key_draft(Image.open(args.input), cols, rows, args, allowed)
    row_cuts = find_row_bounds(rgba, rows)
    comps = find_components(rgba)
    grid = []
    for r in range(rows):
        src = order[r]
        row = []
        for c in range(cols):
            s = extract_cell_sprite(rgba, comps, row_cuts, cols, abs(src), c + 1, strip_shadow=is_fly(c))
            row.append(s.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if src < 0 else s)
        grid.append(row)
    target_box = safe_sz * args.scale_factor
    lift = int(round(0.12 * cell_sz))
    # outlier cells: the image model sometimes draws a whole mini sheet / an extra drawing inside one cell; such a
    # cell must not set the shared scale (it would shrink every frame to a few px) - it is fitted on its own and reported
    dims = sorted(max(s.width, s.height) for row in grid for s in row)
    med = dims[len(dims) // 2] if dims else 1
    outliers = {(r, c) for r, row in enumerate(grid) for c, s in enumerate(row) if max(s.width, s.height) > 1.8 * med}
    ok_cells = [(r, c, s) for r, row in enumerate(grid) for c, s in enumerate(row) if (r, c) not in outliers]
    ground = [s for r, c, s in ok_cells if not is_fly(c)]
    fly = [s for r, c, s in ok_cells if is_fly(c)]
    limits = []
    if ground:
        limits.append(target_box / max(max(s.width, s.height) for s in ground))
    if fly:
        limits += [target_box / max(s.width for s in fly), (target_box - lift) / max(s.height for s in fly)]
    k = min(limits) if limits else 1.0
    if outliers:
        print("WARNING: outlier cell(s) (row,col, 1-based) " + ", ".join(f"{r + 1},{c + 1}" for r, c in sorted(outliers)) +
              " are much bigger than the others - probably a glitch (a mini sheet / an extra drawing inside one cell). "
              "They were shrunk to fit; look at them and redraw the image if they are wrong.")
    out_w, out_h = cols * cell_sz, rows * cell_sz
    sheet = Image.new("RGB", (out_w, out_h), (255, 0, 255))
    baseline_y = margin + safe_sz - 1
    sh_scale = cell_sz / 128.0
    shadow = make_shadow_ellipse(width=int(round(40 * sh_scale)), height=max(6, int(round(7 * sh_scale))))
    heights = []
    for r, row in enumerate(grid):
        for c, s in enumerate(row):
            kk = k if (r, c) not in outliers else target_box / max(s.width, s.height)
            ss = scale_rgba(s, kk)
            heights.append(ss.height)
            cx, cy = c * cell_sz, r * cell_sz
            px_x = cx + (cell_sz - ss.width) // 2
            if getattr(args, "keep_x", False):            # battle poses: keep the frame's own sideways move (dodge, lunge)
                px_x += int(round(s.info.get("dx", 0) * kk))
            px_y = cy + baseline_y - ss.height + 1
            if is_fly(c):
                sheet.paste(shadow, (cx + (cell_sz - shadow.width) // 2, cy + baseline_y - shadow.height + 1), shadow)
                px_y -= lift
            px_x = max(cx + margin, min(px_x, cx + cell_sz - margin - ss.width))
            px_y = max(cy + margin, min(px_y, cy + cell_sz - margin - ss.height))
            sheet.paste(ss, (px_x, px_y), ss)
    sheet = final_pass(sheet, allowed)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    sheet.save(args.output, "PNG")
    print(f"OK: {args.output} ({out_w}x{out_h}, move4 layout={args.layout}{' %d frames%s' % (cols, ' air' if args.air else '') if args.layout == 'loop' else ''}, cell={cell_sz}, safe_box={safe_sz}, "
          f"margin={margin}, sprite_h={min(heights)}..{max(heights)} px)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["movement", "posses", "move4"], required=True,
                    help="move4 = v2 movement sheet (4 directions x 4-frame loops, see prompts/movement/README.md)")
    ap.add_argument("--layout", choices=["walk", "walk_fly", "fly", "loop"], default="walk",
                    help="move4 only: walk/walk_fly/fly (v2 4-key sheets) or loop (v3: one movement loop, see --frames/--air)")
    ap.add_argument("--frames", type=int, default=6, help="move4 --layout loop: frames (columns) in the loop")
    ap.add_argument("--air", action="store_true", help="move4 --layout loop: airborne loop (lifted over a shadow ellipse)")
    ap.add_argument("--keep-x", action="store_true",
                    help="move4 --layout loop: keep each frame's sideways offset inside its slot instead of centring it "
                         "(battle poses: dodge side-steps, lunges)")
    ap.add_argument("--row-order", default="1,2,3,4",
                    help="move4 only: source row for down,left,right,up; negative mirrors it (e.g. 1,2,-2,4 = right from left)")
    ap.add_argument("--input", required=True, help="Raw generated sprite sheet (.jpg or .png)")
    ap.add_argument("--output", required=True, help="Target clean .png path")
    ap.add_argument("--cell-size", type=int, default=192, help="Cell size in px: 192 (default) or 128")
    ap.add_argument("--safe-box", type=int, default=0, help="Safe box size in px (default: 104 for 128, 160 for 192)")
    ap.add_argument("--scale-factor", type=float, default=1.0, help="Optional multiplier (e.g. 0.75 for small creatures)")
    ap.add_argument("--col-order", default="1,2,3,4,5,6,7,8", help="8-col mapping; negative flips horizontally")
    ap.add_argument("--row-col-order", default="", help="Per-row override, e.g. '1:1,8,7,-6,5,6,3,2'")
    ap.add_argument("--reference", default="", help="official artwork whose pink / purple colours are never keyed "
                    "(default: <slug>-reference.jpg found from the output name)")
    ap.add_argument("--allow-loss", action="store_true", help="accept a slot losing more than half of its drawing "
                    "to the background key (the run stops otherwise)")
    args = ap.parse_args()

    cell_sz = args.cell_size
    safe_sz = args.safe_box if args.safe_box > 0 else (160 if cell_sz >= 192 else 104)
    margin = (cell_sz - safe_sz) // 2

    if args.mode == "move4":
        normalize_move4(args, cell_sz, safe_sz, margin)
        return

    cols = 8
    rows = 6 if args.mode == "movement" else 5
    out_w, out_h = cols * cell_sz, rows * cell_sz
    orders = parse_orders(args.col_order, args.row_col_order, rows)

    im = Image.open(args.input)
    allowed = find_allowed(args)
    rgba = key_draft(im, cols, rows, args, allowed)
    row_cuts = find_row_bounds(rgba, rows)
    comps = find_components(rgba)

    grid = []
    for r in range(1, rows + 1):
        row_sprites = []
        for out_c_idx in range(8):
            src_c = orders[r][out_c_idx]
            flip = src_c < 0
            src_c = abs(src_c)
            sparks = (args.mode == "posses" and r == 3)
            strip_sh = (args.mode == "movement" and r in (5, 6))
            s = extract_cell_sprite(rgba, comps, row_cuts, cols, r, src_c, include_sparks=sparks, strip_shadow=strip_sh)
            if flip:
                s = s.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            row_sprites.append(s)
        grid.append(row_sprites)

    target_box = safe_sz * args.scale_factor
    fly_lift = int(round(15 * (cell_sz / 128.0)))
    run_b_lift = int(round(5 * (cell_sz / 128.0)))

    if args.mode == "movement":
        max_ground = max(max(s.width, s.height) for row in grid[:4] for s in row)
        max_fly_w = max(s.width for row in grid[4:] for s in row)
        max_fly_h = max(s.height for row in grid[4:] for s in row)
        uniform_scale = min(target_box / max_ground, target_box / max_fly_w, (target_box - fly_lift) / max_fly_h)
    else:
        max_dim = max(max(s.width, s.height) for row in grid for s in row)
        uniform_scale = target_box / max_dim

    sheet = Image.new("RGB", (out_w, out_h), (255, 0, 255))
    baseline_y = margin + safe_sz - 1
    sh_scale = cell_sz / 128.0
    shadow = make_shadow_ellipse(width=int(round(44 * sh_scale)), height=max(6, int(round(7 * sh_scale))))
    shadow_front = make_shadow_ellipse(width=int(round(32 * sh_scale)), height=max(6, int(round(7 * sh_scale))))

    heights = []
    for r_idx, row in enumerate(grid):
        for c_idx, s in enumerate(row):
            ss = scale_rgba(s, uniform_scale)
            heights.append(ss.height)
            cell_x = c_idx * cell_sz
            cell_y = r_idx * cell_sz
            px_x = cell_x + (cell_sz - ss.width) // 2

            if args.mode == "movement":
                if r_idx < 3:
                    px_y = cell_y + baseline_y - ss.height + 1
                elif r_idx == 3:
                    px_y = cell_y + baseline_y - ss.height + 1 - run_b_lift
                elif r_idx == 4:
                    sh = shadow_front if c_idx in (0, 4) else shadow
                    sheet.paste(sh, (cell_x + (cell_sz - sh.width) // 2, cell_y + baseline_y - sh.height + 1), sh)
                    px_y = cell_y + baseline_y - ss.height + 1 - fly_lift
                else:
                    sh = shadow_front if c_idx in (0, 4) else shadow
                    sheet.paste(sh, (cell_x + (cell_sz - sh.width) // 2, cell_y + baseline_y - sh.height + 1), sh)
                    px_y = cell_y + baseline_y - ss.height + 1 - max(10, fly_lift - 3)
            else:
                px_y = cell_y + baseline_y - ss.height + 1

            px_x = max(cell_x + margin, min(px_x, cell_x + cell_sz - margin - ss.width))
            px_y = max(cell_y + margin, min(px_y, cell_y + cell_sz - margin - ss.height))
            sheet.paste(ss, (px_x, px_y), ss)

    sheet = final_pass(sheet, allowed)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    sheet.save(args.output, "PNG")
    print(
        f"OK: {args.output} ({out_w}x{out_h}, cell={cell_sz}, safe_box={safe_sz}, "
        f"margin={margin}, sprite_h={min(heights)}..{max(heights)} px)"
    )


if __name__ == "__main__":
    main()
