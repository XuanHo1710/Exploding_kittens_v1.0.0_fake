"""Compose a movement-sheet preview on top of a Sodier War map region -> animated WebP (+ PNG frames)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../pokemon/.pydeps"))
from PIL import Image, ImageDraw

SHEET, MAPDIR, OUT, FRAMES_DIR = sys.argv[1:5]
CELL, COLS, ROWS = 192, 8, 6
W, H, FPS, SCALE = 960, 540, 12, 0.25

# --- background: 2x2 map tiles (512px each) from a grassy area with a road
bg = Image.new("RGB", (1024, 1024))
for dx in range(2):
    for dy in range(2):
        bg.paste(Image.open(f"{MAPDIR}/c_{10+dx}_{9+dy}.png").convert("RGB"), (dx * 512, dy * 512))
bg = bg.crop((32, 240, 32 + W, 240 + H))

# --- slice sheet, key out magenta
sheet = Image.open(SHEET).convert("RGBA")
def keyed(img):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if (r - g) > 80 and (b - g) > 80 and r > 120 and b > 120:
                px[x, y] = (0, 0, 0, 0)
    return img
cells = {}
for r in range(ROWS):
    for c in range(COLS):
        im = keyed(sheet.crop((c * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL)))
        s = int(CELL * SCALE)
        cells[(r, c)] = im.resize((s, s), Image.NEAREST)

# direction index (column) for a movement vector
DIRS = {(0, 1): 0, (1, 1): 1, (1, 0): 2, (1, -1): 3, (0, -1): 4, (-1, -1): 5, (-1, 0): 6, (-1, 1): 7}
def col_for(dx, dy):
    sx = (dx > 0) - (dx < 0); sy = (dy > 0) - (dy < 0)
    return DIRS[(sx, sy)]

# path: (target x, target y, mode, speed px/frame); mode rows: walk=0, run=2, fly=4
path = [
    (620, 200, "walk", 2), (620, 360, "walk", 2), (340, 360, "run", 4.5),
    (340, 200, "walk", 2), (480, 290, "fly", 3), (620, 200, "run", 4.5),
]
MODE_ROW = {"walk": 0, "run": 2, "fly": 4}
MODE_LABEL = {"walk": "Walk (rows 1-2)", "run": "Run (rows 3-4)", "fly": "Fly (rows 5-6)"}
FLIP_EVERY = {"walk": 6, "run": 4, "fly": 6}

frames, x, y, t = [], 340.0, 200.0, 0
for tx, ty, mode, spd in path:
    while True:
        dx, dy = tx - x, ty - y
        dist = (dx * dx + dy * dy) ** 0.5
        if dist < spd:
            x, y = tx, ty
            break
        x += dx / dist * spd; y += dy / dist * spd
        col = col_for(round(dx / dist * 2), round(dy / dist * 2))
        row = MODE_ROW[mode] + (t // FLIP_EVERY[mode]) % 2
        sp = cells[(row, col)]
        f = bg.copy().convert("RGBA")
        f.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height * 0.85)))
        d = ImageDraw.Draw(f)
        d.rectangle((8, 8, 250, 34), fill=(27, 23, 38, 200))
        d.text((16, 14), f"{os.path.basename(SHEET)} | {MODE_LABEL[mode]}", fill=(255, 255, 255, 255))
        frames.append(f.convert("RGB"))
        t += 1

os.makedirs(FRAMES_DIR, exist_ok=True)
for i, f in enumerate(frames):
    f.save(f"{FRAMES_DIR}/f{i:04d}.png")
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=int(1000 / FPS), loop=0, quality=75, method=4)
print(len(frames), "frames", f"{len(frames)/FPS:.1f}s ->", OUT)
