"""2D hand-drawn vs 3D-model-rendered sprite walking side by side on the Sodier War map -> webp + png"""
import sys, json, math
import numpy as np
from PIL import Image, ImageDraw
SHEET2D, SHEET3D, META3D, MAPDIR, OUT = sys.argv[1:6]
W, H, FPS, K = 960, 540, 12, 2.0           # K: zoom vs. in-game demo scale (2D cell = 48px * K)
bg = Image.new('RGB', (1024, 1024))
for dx in range(2):
    for dy in range(2):
        bg.paste(Image.open(f'{MAPDIR}/c_{10+dx}_{9+dy}.png').convert('RGB'), (dx * 512, dy * 512))
bg = bg.crop((32, 240, 32 + W, 240 + H)).convert('RGBA')
a = np.asarray(Image.open(SHEET2D).convert('RGBA')).copy()
mk = ((a[..., 0].astype(int) - a[..., 1]) > 80) & ((a[..., 2].astype(int) - a[..., 1]) > 80) & (a[..., 0] > 120) & (a[..., 2] > 120)
a[mk, 3] = 0; s2 = Image.fromarray(a); s3 = Image.open(SHEET3D).convert('RGBA'); meta = json.load(open(META3D))
w2, w3, c3 = int(48 * K), int(48 * K * 0.85), meta['cell']
def cell2(r, c): return s2.crop((c * 192, r * 192, (c + 1) * 192, (r + 1) * 192)).resize((w2, w2), Image.NEAREST)
def cell3(r, c): return s3.crop((c * c3, r * c3, (c + 1) * c3, (r + 1) * c3)).resize((w3, w3), Image.NEAREST)
DIRS = {(0, 1): 0, (1, 1): 1, (1, 0): 2, (1, -1): 3, (0, -1): 4, (-1, -1): 5, (-1, 0): 6, (-1, 1): 7}
# octagon walk so all 8 directions show up; 2D on the left loop, 3D on the right loop
R = 110
pts = [(math.cos(math.radians(a)) * R, math.sin(math.radians(a)) * R * 0.75) for a in range(0, 360, 45)]
frames, spd = [], 1.6 * K
segs = list(zip(pts, pts[1:] + pts[:1]))
t = 0
for (x0, y0), (x1, y1) in segs:
    d = math.hypot(x1 - x0, y1 - y0); n = int(d / spd)
    dx, dy = (x1 - x0) / d, (y1 - y0) / d
    col = DIRS[(round(dx * 1.2) and (1 if dx > 0 else -1), round(dy * 1.2) and (1 if dy > 0 else -1))]
    for i in range(n):
        x, y = x0 + dx * spd * i, y0 + dy * spd * i
        f = bg.copy(); dr = ImageDraw.Draw(f)
        for cx, kind in ((250, '2d'), (700, '3d')):
            fx, fy = cx + x, 290 + y
            sh = Image.new('RGBA', f.size); ImageDraw.Draw(sh).ellipse((fx - 9 * K, fy - 3 * K, fx + 9 * K, fy + 3 * K), fill=(0, 0, 0, 80)); f.alpha_composite(sh)
            if kind == '2d':
                sp = cell2((t // 6) % 2, col); f.alpha_composite(sp, (int(fx - w2 / 2), int(fy - w2 * 0.86)))
            else:
                m = meta['modes']['walk']; fr = int(t / FPS / (m['cycle'] / meta['frames'])) % meta['frames']
                sp = cell3(m['row'] + fr, col); f.alpha_composite(sp, (int(fx - w3 / 2), int(fy - w3 * meta['foot'])))
        for cx, label in ((250, '2D - sheet ve tay (2 khung/che do)'), (700, '3D - model render (12 khung/che do)')):
            dr.rectangle((cx - 150, 14, cx + 150, 40), fill=(27, 23, 38, 210)); dr.text((cx - 140, 21), label, fill=(255, 255, 255))
        dr.text((10, H - 18), '3D model: CC BY-NC 3.0, see THIRD_PARTY_NOTICES.md (re-rendered)', fill=(255, 255, 255))
        frames.append(f.convert('RGB')); t += 1
frames[0].save(OUT + '.png')
frames[0].save(OUT + '.webp', save_all=True, append_images=frames[1:], duration=int(1000 / FPS), loop=0, lossless=True, method=3)
print(len(frames), 'frames', OUT)
