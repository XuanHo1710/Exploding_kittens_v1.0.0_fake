"""Contact sheet of several 3D previews (tmp/<slug>-3d-v3-preview.png or tmp/3d-previews/) side by side.

  python3 tools/model3d/contact.py tmp/contact.png charizard venomoth pikachu
"""
import sys, os
from PIL import Image, ImageDraw
out, *names = sys.argv[1:]
PV = os.path.join(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../..")), "tmp")
rows = []
for n in names:
    p = f"{PV}/{n}-3d-v3-preview.png"
    if not os.path.isfile(p):
        p = f"{PV}/3d-previews/{n}-3d-v3-preview.png"
    if not os.path.isfile(p):
        continue
    im = Image.open(p).convert("RGB")
    r = Image.new("RGB", (im.width, 320)); r.paste(im.crop((0, 0, im.width, 160)), (0, 0)); r.paste(im.crop((0, im.height - 160, im.width, im.height)), (0, 160))
    r = r.resize((r.width // 2, 160)); ImageDraw.Draw(r).text((2, 2), n, fill=(255, 255, 0))
    rows.append(r)
o = Image.new("RGB", (640, 160 * len(rows)))
for i, r in enumerate(rows):
    o.paste(r, (0, 160 * i))
o.save(out)
