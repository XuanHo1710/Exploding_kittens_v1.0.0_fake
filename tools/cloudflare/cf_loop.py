"""Generate ONE movement loop (v3) with Cloudflare Workers AI FLUX.2 [dev], one call per direction.

Why per direction: asked for 4 directions in one image, FLUX.2 keeps the creature and the grid but mixes up the
views. Each call here draws a single view: 6 frames laid out 3 x 2 (3:2 image, ~512 px per cell), with the species
reference artwork (input_image_0) and that direction's 3D pose guide arranged in the same 3 x 2 grid (input_image_1).
The 4 results are cut into cells, stacked as the v3 raw grid (rows down, left, right, up) and normalized.

Credentials: .env in the repo root with Account_ID and TOKEN (never printed).
usage (repo root; a Python with Pillow + ssl, e.g. $MONS_PY3D — the snap/agy Python has no ssl):
  python3 tools/cloudflare/cf_loop.py --slug lugia --name Lugia --locomotion walk_fly --loop fly \
      --desc "white body, long neck, dark blue eye patches, blue-grey back spikes and belly, huge wing-arms" \
      --out tmp/lugia-cf-fly.png [--frames 6] [--keep-raw tmp/lugia-cf-raw]
"""
import argparse, base64, json, os, subprocess, sys, time, urllib.request, uuid

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
SKILL = os.path.join(ROOT, "tools/units")
try:
    from PIL import Image  # noqa: E402  (needs a Python with Pillow AND ssl, e.g. the vya venv)
except ImportError:
    sys.path.insert(0, os.path.join(SKILL, ".pydeps"))
    from PIL import Image  # noqa: E402
# the skill scripts load the skill's own Pillow build (.pydeps, CPython 3.14) -> run them with the agy Python
SKILL_PY = os.environ.get("MONS_AGY_PY") or ("/snap/antigravity-cli/24/usr/bin/python3.14" if os.path.exists("/snap/antigravity-cli/24/usr/bin/python3.14") else sys.executable)   # $MONS_AGY_PY: agy's Python

MODEL = "@cf/black-forest-labs/flux-2-dev"
VIEWS = [  # rows of the v3 sheet
    ("down", "from the FRONT, facing the viewer, its face and eyes visible"),
    ("left", "in LEFT side profile, moving to the LEFT, head pointing to the left edge of the image"),
    ("right", "in RIGHT side profile, moving to the RIGHT, head pointing to the right edge of the image"),
    ("up", "from BEHIND, moving away from the viewer, its back visible, face NOT visible"),
]
ACTION = {"walk": "WALKING on the ground, feet on a common baseline", "run": "RUNNING fast on the ground",
          "fly": "FLYING, airborne above a small dark shadow ellipse"}


def env():
    vals = {}
    for line in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            vals[k.strip()] = v.strip().strip('"')
    return vals["Account_ID"], vals["TOKEN"]


def multipart(fields, files):
    b = uuid.uuid4().hex
    out = []
    for k, v in fields.items():
        out += [f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n".encode(), str(v).encode(), b"\r\n"]
    for k, path in files.items():
        out += [f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{os.path.basename(path)}\"\r\n"
                f"Content-Type: image/png\r\n\r\n".encode(), open(path, "rb").read(), b"\r\n"]
    out.append(f"--{b}--\r\n".encode())
    return b"".join(out), f"multipart/form-data; boundary={b}"


def flux(acc, tok, prompt, images, w, h):
    body, ctype = multipart({"prompt": prompt, "width": w, "height": h},
                            {f"input_image_{i}": p for i, p in enumerate(images)})
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/{MODEL}", data=body,
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": ctype})
    d = json.load(urllib.request.urlopen(req, timeout=300))
    if not d.get("success"):
        raise RuntimeError(d.get("errors"))
    return base64.b64decode(d["result"]["image"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True); ap.add_argument("--name", required=True)
    ap.add_argument("--locomotion", required=True); ap.add_argument("--loop", required=True, choices=list(ACTION))
    ap.add_argument("--desc", default="", help="short anatomy / colour description of the species")
    ap.add_argument("--frames", type=int, default=6); ap.add_argument("--out", required=True)
    ap.add_argument("--keep-raw", default="")
    a = ap.parse_args()
    assert a.frames == 6, "3 x 2 layout: --frames 6"
    acc, tok = env()
    work = a.keep_raw or f"/tmp/mons-refs/{a.slug}-cf-{a.loop}"
    os.makedirs(work, exist_ok=True)
    ref = f"/tmp/mons-refs/{a.slug}-reference.jpg"
    if not os.path.isfile(ref):
        subprocess.run(["bash", os.path.join(SKILL, "fetch_reference.sh"), a.name], check=True, capture_output=True)
    guide = os.path.join(work, "guide.png")
    subprocess.run([SKILL_PY, os.path.join(SKILL, "pose_guide.py"), "--slug", a.slug, "--locomotion", a.locomotion,
                    "--mode", a.loop, "--frames", "6", "--out", guide], check=True, capture_output=True)
    g = Image.open(guide).convert("RGB"); gc = g.width // 6
    CELL = 512
    raw = Image.new("RGB", (6 * CELL, 4 * CELL), (255, 0, 255))
    for r, (view, words) in enumerate(VIEWS):
        # this view's 6 guide frames re-laid out 3 x 2
        g32 = Image.new("RGB", (3 * gc, 2 * gc), (255, 0, 255))
        for f in range(6):
            g32.paste(g.crop((f * gc, r * gc, (f + 1) * gc, (r + 1) * gc)), ((f % 3) * gc, (f // 3) * gc))
        gp = os.path.join(work, f"guide-{view}.png"); g32.resize((3 * CELL // 2, CELL), Image.NEAREST).save(gp)
        prompt = (f"Pixel art sprite sheet of {a.name.upper()}, the exact creature in input_image_0 ({a.desc}). Copy its anatomy "
                  f"and colours exactly; never draw any other creature. Layout: 3 columns x 2 rows of equal square cells, 6 frames "
                  f"of one smooth {a.loop} loop read left to right, top row then bottom row; frame 6 flows back into frame 1. "
                  f"In EVERY cell {a.name} is seen {words}, {ACTION[a.loop]}, in exactly the pose and position of the same cell "
                  f"in input_image_1 (a 3D pose guide); consecutive frames differ slightly, as in input_image_1. The same view in "
                  f"all 6 cells. Style: 16-bit RPG pixel art, crisp 1-pixel dark navy outline, 4-5 tone shading, light from the "
                  f"top-left, no blur, no anti-aliasing. Background: one flat solid pure magenta #FF00FF everywhere, "
                  f"no text, no grid lines, no borders.")
        t = time.time()
        png = flux(acc, tok, prompt, [ref, gp], 3 * CELL // 2 * 2, CELL * 2)  # 1536 x 1024
        rp = os.path.join(work, f"raw-{view}.png"); open(rp, "wb").write(png)
        im = Image.open(rp).convert("RGB"); cw, ch = im.width // 3, im.height // 2
        for f in range(6):
            cell = im.crop(((f % 3) * cw, (f // 3) * ch, (f % 3 + 1) * cw, (f // 3 + 1) * ch)).resize((CELL, CELL))
            raw.paste(cell, (f * CELL, r * CELL))
        print(f"{view}: {time.time() - t:.0f}s", flush=True)
    rawp = os.path.join(work, "raw-grid.png"); raw.save(rawp)
    norm = [SKILL_PY, os.path.join(SKILL, "normalize_sheet.py"), "--mode", "move4", "--layout", "loop", "--frames", "6",
            "--input", rawp, "--output", a.out] + (["--air"] if a.loop == "fly" else [])
    print(subprocess.run(norm, check=True, capture_output=True, text=True).stdout.strip().split("/")[-1])


if __name__ == "__main__":
    main()
