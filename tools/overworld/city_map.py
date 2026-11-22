#!/usr/bin/env python3
"""
City showcase: ONE continuous Pokémon-style city built from the split Overworld pieces, with the
eight gyms placed in their own quarters (no framed districts). Review only ->
assets/overworld/_preview/city-map.png (+ city-map-night.png with --night).

  python3 city_map.py

Layout follows references/research.md §7 / §7.1:
  * tree wall 2-4 thick, 4-wide exits north / west / east, harbour + sea to the south
  * paved main avenues (4 wide) crossing at a central plaza; promenade along the harbour
  * each gym sits off the axis in its quarter; its themed ground blends organically into the
    city lawn (blob-edged patch, no wall), a forecourt + lane of the gym's own paving joins the
    nearest avenue, and its own pools / props dress the quarter
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen_overworld as GO  # noqa: E402
import overworld_kit as K  # noqa: E402

TS = K.CELL
W, H = 112, 80
AV_X = (52, 55)          # vertical avenue
AV_Y = (30, 33)          # horizontal avenue
PROM_Y = (64, 66)        # harbour promenade
# gym type -> top-left cell of its 12x12 quarter frame (layout: quarter, forecourt, lane).
# The Gen 3 structure canvas is 8x8 metatiles and sits at frame + STRUCT_OFF, so its 2-tile door
# stays on frame cols 5-6 with its bottom on frame row 10, right above the forecourt (row 11).
STRUCT_OFF = (2, 4)
GYM_AT = {
    "grass": (4, 6), "psychic": (26, 4), "fire": (66, 4), "ground": (90, 6),
    "rock": (4, 40), "poison": (27, 42), "electric": (66, 40), "water": (90, 42),
}


class City:
    def __init__(self):
        self.slug = [[None] * W for _ in range(H)]
        self.patch = [[None] * W for _ in range(H)]      # themed fill blended onto the lawn
        self.props, self.fences, self.gyms = [], [], []
        self.quarters = []                               # (fill, x0, y0, x1, y1) in cells, drawn per pixel
        self.busy = set()

    def rect(self, slug, x0, y0, x1, y1, force=True):
        for y in range(max(0, y0), min(H, y1 + 1)):
            for x in range(max(0, x0), min(W, x1 + 1)):
                if force or (self.slug[y][x] is None and (x, y) not in self.busy):
                    self.slug[y][x] = slug

    def quarter(self, fill, x0, y0, x1, y1, r=3):
        """Themed ground for a gym quarter: a rounded rectangle hugging the gym, with a couple of
        soft lobes so it reads as ground wearing into the lawn, not a stamped shape."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                dx = max(x0 + r - x, 0, x - (x1 - r))
                dy = max(y0 + r - y, 0, y - (y1 - r))
                if dx * dx + dy * dy <= r * r and 0 <= x < W and 0 <= y < H:
                    self.patch[y][x] = fill
        for (lx, ly, lr) in ((x0 + 2, y1, 2), (x1 - 1, (y0 + y1) // 2, 2)):
            self.blob_patch(fill, lx, ly, lr, lr)

    def blob_patch(self, fill, cx, cy, rx, ry):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if 0 <= x < W and 0 <= y < H:
                    wob = 0.18 * (K.h16(x, y, 33) / 255 - 0.5)
                    if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 + wob:
                        self.patch[y][x] = fill

    def prop(self, slug, x, y):
        w, h = GO.PROPS[slug]["cells"]
        cells = {(x + i, y - j) for i in range(w) for j in range(h)}
        if any(c in self.busy for c in cells):
            return False
        if any(not (0 <= cx < W and 0 <= cy < H) or self.slug[cy][cx] not in (None, "tall-grass") for cx, cy in cells):
            return False
        self.busy |= cells
        self.props.append((slug, x, y))
        return True


def gym_kit(t):
    """Pick a gym module's pieces by role."""
    info = GO.GYMS[t]
    terr = [s for s in info["terrain"] if not s.endswith("-ground") and not s.endswith("-border")]
    floors = [s for s in terr if GO.group_of(s) == "floor"]
    others = [s for s in terr if s not in floors and GO.TERRAIN[s]["kind"] == "blob"]
    props = [s for s in info["props"] if GO.PROPS[s].get("kind") != "cross"]
    lamps = [s for s in props if GO.PROPS[s].get("lamp")]
    big = [s for s in props if GO.PROPS[s]["cells"][0] >= 2 and s not in lamps]
    small = [s for s in props if s not in lamps and s not in big]
    rails = [s for s in info["props"] if GO.PROPS[s].get("kind") == "cross"]
    ground = (GO.GYMS[t]["scene"] or {}).get("ground")
    return dict(floor=(floors[0] if floors else "paved-path"), others=others, lamps=lamps, big=big,
                small=small, rails=rails, ground=ground)


def build():
    c = City()
    # ---------------- tree wall + exits + harbour
    c.rect("forest", 0, 0, W - 1, H - 1)
    c.rect(None, 3, 3, W - 4, PROM_Y[1])
    for (x0, y0, x1, y1) in ((0, 0, 9, 5), (W - 10, 0, W - 1, 5), (0, 22, 5, 27), (W - 6, 22, W - 1, 27),
                             (0, 36, 4, 39), (W - 5, 36, W - 1, 39), (20, 0, 23, 4), (86, 0, 89, 4)):
        c.rect("forest", x0, y0, x1, y1)            # thicker clumps break the straight wall
    c.rect(None, AV_X[0], 0, AV_X[1], 3)              # north exit
    c.rect(None, 0, AV_Y[0], 3, AV_Y[1])              # west exit
    c.rect(None, W - 4, AV_Y[0], W - 1, AV_Y[1])      # east exit
    for x in range(W):
        for y in range(PROM_Y[1] + 1, H):
            c.slug[y][x] = "sand" if y < PROM_Y[1] + 4 else "shore"
    # ---------------- avenues, plaza, promenade
    c.rect("paved-path", AV_X[0], 0, AV_X[1], PROM_Y[1])
    c.rect("paved-path", 0, AV_Y[0], W - 1, AV_Y[1])
    c.rect("paved-path", AV_X[0] - 7, AV_Y[0] - 5, AV_X[1] + 7, AV_Y[1] + 5)     # central plaza 18x14
    # plaza: fountain + flower corners (fountain prop from the water gym set)
    c.rect("paved-path", 3, PROM_Y[0], W - 4, PROM_Y[1])
    # ---------------- gyms
    for t, (sx, sy) in GYM_AT.items():
        kit = gym_kit(t)
        if kit["ground"]:
            c.quarters.append((kit["ground"], sx - 3, sy, sx + 14, sy + 15))
        c.gyms.append((t, sx + STRUCT_OFF[0], sy + STRUCT_OFF[1]))
        for y in range(sy + 1, sy + 11):
            for x in range(sx + 1, sx + 11):
                c.busy.add((x, y))
        # forecourt + lane of the gym's own paving down to the nearest road
        fy = sy + 11
        c.rect(kit["floor"], sx + 2, fy, sx + 9, fy + 1)
        target = AV_Y[0] if sy < AV_Y[0] else PROM_Y[0]
        c.rect(kit["floor"], sx + 5, fy, sx + 6, target - 1)
        # the gym's own features beside the forecourt
        if kit["others"]:
            c.rect(kit["others"][0], sx - 2, sy + 6, sx, sy + 8, force=False)
            c.rect(kit["others"][-1], sx + 11, sy + 6, sx + 13, sy + 8, force=False)
        for i, lamp in enumerate(kit["lamps"][:1] * 2):
            c.prop(lamp, sx + (3 if i == 0 else 8), fy + 3)
        slots = [(sx - 2, sy + 4), (sx + 12, sy + 4), (sx - 2, sy + 11), (sx + 12, sy + 11), (sx + 1, sy + 14),
                 (sx + 9, sy + 14), (sx - 1, sy + 14), (sx + 11, sy + 14), (sx + 3, sy + 16), (sx + 8, sy + 16)]
        pool = kit["big"] + kit["small"] + kit["small"]
        for (x, y), slug in zip(slots, pool):
            c.prop(slug, x, y)
        c.prop("sign", sx + 7, target - 1)
        fy2 = sy + 17
        for x in range(sx - 3, sx + 15):
            if x in (sx + 5, sx + 6) or not (0 <= fy2 < H) or c.slug[fy2][x] is not None:
                continue
            c.fences.append(("fence", x, fy2))
            c.busy.add((x, fy2))
        for x in (sx - 2, sx, sx + 9, sx + 12):
            c.prop("flowers", x, fy2 - 1)
        for i, rail in enumerate(kit["rails"][:1]):
            for x in range(sx - 1, sx + 3):
                c.fences.append((rail, x, sy + 13))
    # ---------------- secondary lanes linking neighbouring quarters
    c.rect("dirt-path", 9, 24, 32, 25, force=False)        # grass <-> psychic
    c.rect("dirt-path", 71, 24, 96, 25, force=False)       # fire <-> ground
    c.rect("dirt-path", 9, 60, 33, 61, force=False)        # rock <-> poison
    c.rect("dirt-path", 71, 60, 96, 61, force=False)       # electric <-> water
    # ---------------- parks and green pockets
    c.rect("forest", 41, 9, 46, 13, force=False)            # copse north-west of the avenue
    c.rect("forest", 60, 10, 63, 14, force=False)
    c.rect("water", 42, 44, 47, 48, force=False)            # park pond south-west of the plaza
    c.rect("tall-grass", 42, 50, 48, 53, force=False)
    c.rect("hedge", 41, 42, 41, 53, force=False)
    c.rect("water", 59, 52, 62, 55, force=False)
    c.rect("hedge", 58, 42, 62, 42, force=False)
    for (s_, x, y) in (("tree", 43, 57), ("tree", 46, 57), ("bush", 48, 43), ("flowers", 44, 49), ("flowers", 46, 49),
                       ("tree", 59, 48), ("bush", 61, 50), ("rock", 63, 57), ("tree", 20, 21), ("tree", 83, 21),
                       ("tree", 20, 57), ("tree", 85, 57), ("bush", 22, 22), ("bush", 85, 22)):
        c.prop(s_, x, y)
    # ---------------- avenue dressing: trees + lamps alternate, avoiding lanes
    for x in range(6, W - 6, 6):
        for y in (AV_Y[0] - 2, AV_Y[1] + 2):
            if AV_X[0] - 9 <= x <= AV_X[1] + 9:
                continue
            c.prop("street-lamp" if (x // 6) % 2 else "tree", x, y)
    for y in range(8, PROM_Y[0] - 2, 6):
        for x in (AV_X[0] - 2, AV_X[1] + 1):
            if AV_Y[0] - 7 <= y <= AV_Y[1] + 7:
                continue
            c.prop("street-lamp" if (y // 6) % 2 else "bush", x, y)
    # plaza dressing
    for (x, y) in ((AV_X[0] - 6, AV_Y[0] - 4), (AV_X[1] + 6, AV_Y[0] - 4), (AV_X[0] - 6, AV_Y[1] + 4),
                   (AV_X[1] + 6, AV_Y[1] + 4)):
        c.prop("street-lamp", x, y)
    plaza_fountain = "water-fountain" if "water-fountain" in GO.PROPS else "rock-big"
    c.slug_free = True
    c.props.append((plaza_fountain, AV_X[0] + 1, AV_Y[0] - 2))
    for x in range(AV_X[0] - 5, AV_X[1] + 6, 3):
        c.prop("flowers", x, AV_Y[1] + 6)
    c.prop("sign", AV_X[0] - 1, 4)
    c.prop("sign", 4, AV_Y[0] - 1)
    c.prop("sign", W - 5, AV_Y[0] - 1)
    # outskirts: tall grass near the exits, a few trees and rocks
    for (x0, y0, x1, y1) in ((40, 4, 46, 8), (60, 4, 64, 8), (5, 26, 12, 28), (100, 26, 107, 28), (44, 44, 49, 48)):
        c.rect("tall-grass", x0, y0, x1, y1, force=False)
    for (s, x, y) in (("tree", 46, 22), ("tree", 60, 22), ("rock", 47, 54), ("tree", 58, 50), ("item-ball", 45, 46),
                      ("tree", 22, 60), ("tree", 84, 60), ("bush", 50, 58), ("bush", 59, 58), ("rock-big", 82, 72),
                      ("rock", 20, 70), ("item-ball", 60, 70), ("mailbox", 49, 37), ("mailbox", 58, 37)):
        c.prop(s, x, y)
    return c


def mask_of(grid, x, y, same):
    m = 0
    for name, (dx, dy) in (("N", (0, -1)), ("NE", (1, -1)), ("E", (1, 0)), ("SE", (1, 1)),
                           ("S", (0, 1)), ("SW", (-1, 1)), ("W", (-1, 0)), ("NW", (-1, -1))):
        nx, ny = x + dx, y + dy
        if not (0 <= nx < W and 0 <= ny < H) or same(grid[ny][nx]):
            m |= K.BITS[name]
    return m


def render(c, night=False):
    sheets = {s: GO.build_terrain(s)[0] for s in GO.TERRAIN}
    sheets.update({s: GO.prop_frames(s)[0] for s in GO.PROPS})
    if night:
        sheets = {k: GO.night_of(k, v) for k, v in sheets.items()}
    ov = GO.overlay_sheets(night)
    img = Image.new("RGBA", (W * TS, H * TS))
    grass = sheets["grass"]
    for y in range(H):
        for x in range(W):
            v = K.h16(x, y, 9) % (grass.width // TS)
            img.paste(grass.crop((v * TS, 0, v * TS + TS, TS)), (x * TS, y * TS))
    # themed ground of each gym quarter: a pixel-space rounded rectangle with a softly wobbling
    # edge, a darker worn rim and a speckled transition, so it melts into the lawn
    import math
    p = img.load()
    for fill, x0, y0, x1, y1 in c.quarters:
        sh = sheets[fill]
        sp = sh.load()
        nvar = sh.width // TS
        X0, Y0, X1, Y1 = x0 * TS, y0 * TS, (x1 + 1) * TS, (y1 + 1) * TS
        R = 3 * TS
        for py in range(Y0 - 8, Y1 + 8):
            for px in range(X0 - 8, X1 + 8):
                if not (0 <= px < W * TS and 0 <= py < H * TS):
                    continue
                qx = max(X0 + R - px, 0, px - (X1 - R))
                qy = max(Y0 + R - py, 0, py - (Y1 - R))
                outside = math.hypot(qx, qy) - R          # >0 outside the rounded rect
                edge = min(px - X0, X1 - px, py - Y0, Y1 - py) if qx == 0 or qy == 0 else -outside
                wob = 2.2 * math.sin(px * 0.21 + py * 0.05) + 1.4 * math.sin(py * 0.31 - px * 0.07)
                d = (edge if (qx == 0 or qy == 0) else -outside) + wob
                if d < 0:
                    if d > -2.5 and K.h16(px, py, 77) > 200:     # stray specks into the lawn
                        cx, cy = px // TS, py // TS
                        v = K.h16(cx, cy, 9) % nvar
                        col = sp[v * TS + px % TS, py % TS]
                        p[px, py] = tuple(int(ch * 0.85) for ch in col[:3]) + (255,)
                    continue
                cx, cy = px // TS, py // TS
                v = K.h16(cx, cy, 9) % nvar
                col = sp[v * TS + px % TS, py % TS]
                if d < 1.2:
                    col = tuple(int(ch * 0.76) for ch in col[:3]) + (255,)
                elif d < 3 and (px + py) % 3 == 0:
                    col = tuple(int(ch * 0.9) for ch in col[:3]) + (255,)
                p[px, py] = col
    for t, sx, sy in c.gyms:
        under, _ = GO.gym_layers(dict(GO.GYMS[t]["scene"], type=t, structure_at=(0, 0)), night)
        for im, ox, oy in under:
            img.alpha_composite(im, (sx * TS + ox, sy * TS + oy))
    gmask = [[getattr(c, "under", {}).get((x, y), c.slug[y][x]) for x in range(W)] for y in range(H)]
    for y in range(H):
        for x in range(W):
            s = c.slug[y][x]
            if not s:
                continue
            spec = GO.TERRAIN[s]
            u = getattr(c, "under", {}).get((x, y))      # a floor under this cell (pond in a plaza)
            if u:
                img.alpha_composite(K.blob_tile(ov[u], 255), (x * TS, y * TS))
            if s == "forest":                        # Emerald 2x2 trees wherever an even block is all forest
                bx, by = x - x % 2, y - y % 2
                if all(by + j < H and bx + i < W and c.slug[by + j][bx + i] == "forest" for i in (0, 1) for j in (0, 1)):
                    q = (x % 2) * TS, (y % 2) * TS
                    img.paste(sheets["tree-wall"].crop((q[0], q[1], q[0] + TS, q[1] + TS)), (x * TS, y * TS))
                    continue
            if spec["kind"] == "blob":
                g = GO.group_of(s)
                under = getattr(c, "under", {})
                # cells that sit ON a floor count as that floor for their neighbours' edges (no lawn
                # ring between a plaza and the pond set into it); the cell itself keeps its own mask
                grid = c.slug if (x, y) in under or not under else gmask
                m = mask_of(grid, x, y, lambda q, s=s, g=g: q == s or (q is not None and GO.group_of(q) == g))
                img.alpha_composite(K.blob_tile(ov[s], m), (x * TS, y * TS))
    if night:
        for s, x, y in c.props:
            spec = GO.PROPS[s]
            if spec.get("lamp"):
                cw, ch = spec["cells"]
                tint = spec["lamp"] if isinstance(spec["lamp"], tuple) else (255, 210, 120)
                gl = K.glow_sprite(tint)
                img.alpha_composite(gl, (max(0, x * TS + cw * 8 - gl.width // 2), max(0, (y - ch + 1) * TS + 6 - gl.height // 2)))
    items = [((y + 1) * TS, x * TS, "p", s, x, y) for s, x, y in c.props]
    fset = {(x, y): s for s, x, y in c.fences}
    items += [((y + 1) * TS, x * TS, "f", s, x, y) for s, x, y in c.fences]
    over_imgs = []
    for t, sx, sy in c.gyms:
        _, over = GO.gym_layers(dict(GO.GYMS[t]["scene"], type=t, structure_at=(0, 0)), night)
        for im, ox, oy in over:
            over_imgs.append((im, sx * TS + ox, sy * TS + oy))
            items.append((sy * TS + oy + im.height, sx * TS + ox, "o", len(over_imgs) - 1, 0, 0))
    for _, _, kind, key, x, y in sorted(items, key=lambda t: (t[0], t[1])):
        if kind == "p":
            cw, ch = GO.PROPS[key]["cells"]
            img.alpha_composite(sheets[key], (x * TS, (y - ch + 1) * TS))
        elif kind == "f":
            m = sum(bit for bit, (dx, dy) in ((1, (0, -1)), (2, (1, 0)), (4, (0, 1)), (8, (-1, 0)))
                    if fset.get((x + dx, y + dy)) == key)
            img.alpha_composite(sheets[key].crop((m * TS, 0, m * TS + TS, TS)), (x * TS, y * TS))
        else:
            im, ox, oy = over_imgs[key]
            img.alpha_composite(im, (ox, oy))
    return img


def main():
    GO.NIGHT = "--night" in sys.argv
    os.makedirs(GO.PREVIEW, exist_ok=True)
    c = build()
    for night, name in ((False, "city-map.png"), (True, "city-map-night.png"))[:2 if GO.NIGHT else 1]:
        K.up(render(c, night)).save(os.path.join(GO.PREVIEW, name))
    print("wrote", os.path.join(GO.PREVIEW, "city-map.png"), f"{W}x{H} cells")


if __name__ == "__main__":
    main()
