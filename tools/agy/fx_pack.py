#!/usr/bin/env python3
"""
Battle-system effects drawn by agy (docs/explanation/spec/11-battle-and-save-systems.md §6): weather overlays, status loops, stat
arrows, Substitute, two-turn charge / vanish, held-item activations, recharge / flinch / ability flash. These are not
move images (those stay in assets/skills/<GenX-Region>/<Move>/, decisions.md §12); they go to assets/ui/Battle/ with a manifest.

  python3 tools/agy/fx_pack.py prompt <key|all>        # tmp/prompts/fx/<key>.md + tmp/agy-requests/fx-<key>.txt
  python3 tools/agy/fx_pack.py normalize <key> --input tmp/mons-refs/fx-<key>-raw.png
  python3 tools/agy/fx_pack.py check <key|all>         # PASS / FAIL per strip (automatic, no visual review)
  python3 tools/agy/fx_pack.py list

ONE generate_image per sheet, accepted as drawn (agy one-shot rule). The raw image is a grid (`cols` x `rows`) on flat
#FF00FF; every row is one effect of `cols` frames (`rows` names them). normalize keys the magenta by colour distance,
cuts the grid, keeps each frame where it is in its slot, scales all frames of a row with ONE scale (no pulsing) so the
biggest fits `fill` of the cell (tileable overlays: the whole slot is resized, so the tile still repeats), limits each
strip to 15 colours + transparency and writes assets/ui/Battle/<effect>.png (one row of frames) + assets/ui/Battle/battle-fx.json.
Pillow is needed only for normalize / check (agy's python3 has it).
"""
import argparse
import json
import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
OUT = os.environ.get("MONS_FX_OUT") or os.path.join(REPO, "assets", "ui", "Battle")      # MONS_FX_OUT: tests only
MANIFEST = os.path.join(OUT, "battle-fx.json")
PROMPTS = os.path.join(REPO, "tmp", "prompts", "fx")
REQS = os.path.join(REPO, "tmp", "agy-requests")
RAW = os.path.join(REPO, "tmp", "mons-refs")
SCREEN_REF = "assets/skills/image.png"      # the Gen 3 battle screen reference

# key: grid, cell (native px of one frame), fill (share of the cell the biggest frame may use), tile (seamless overlay),
# rows (effect name per row) and what each row shows
SHEETS = {
    "weather-rain": dict(cols=4, rows=["weather-rain"], grid_rows=2, cell=(128, 128), tile=True, ratio="16:9",
        despill=dict(ramp=["#a8d8f8", "#d0ecfc", "#f4fcff"], drop_below=70, all=True),
        what=["rain: thin slanted white-blue streaks (#a8d8f8, #e8f8ff, outline-free) falling down-left at ~70°, a few "
              "small splash ticks; the 8 frames are one fall cycle (each frame the streaks move ~1/8 of the tile down); "
              "every frame is a SEAMLESS square tile (what leaves the bottom comes back at the top, left / right edges "
              "match) and covers the whole square evenly (~25 % covered, the rest empty magenta)"]),
    "weather-sun": dict(cols=4, rows=["weather-sun"], grid_rows=2, cell=(240, 112), whole=True, ratio="16:9",
        despill=dict(ramp=["#ffe070", "#fff0a0", "#fff8d8"], drop_below=70, rule="b>g"),
        what=["harsh sunlight over the battle screen: 3-5 broad pale-yellow light rays (#fff8b0, #ffe070, white) fanning "
              "from the TOP-LEFT corner of the frame toward the lower right, 2-3 small round lens glints along a ray; "
              "frames 1-8 the rays slowly pulse wider / narrower and the glints twinkle; loops; leave the lower-right "
              "half mostly empty magenta"]),
    "weather-sand": dict(cols=4, rows=["weather-sand"], grid_rows=2, cell=(128, 128), tile=True, ratio="16:9",
        what=["sandstorm: tan / ochre sand grains and short curved wind streaks (#d8b878, #f0d8a0, #a88848) blowing from "
              "left to right with a slight downward drift; 8 frames = one cycle; every frame is a SEAMLESS square tile "
              "(left / right and top / bottom edges match) covering the square evenly (~35 %)"]),
    "weather-hail": dict(cols=4, rows=["weather-hail"], grid_rows=2, cell=(128, 128), tile=True, ratio="16:9",
        despill=dict(ramp=["#78b8e0", "#c8f0ff", "#ffffff"], dark="#284878", drop_below=0, rule="r>g"),
        what=["hail: small white-cyan ice pellets (#ffffff, #c8f0ff, #78b8e0, 1 px dark-blue #284878 outline) 3-5 px big "
              "falling steeply down-left, a few tiny white sparkles; 8 frames = one fall cycle; every frame is a SEAMLESS "
              "square tile covering the square evenly (~15 %)"]),
    "status-mind": dict(cols=6, rows=["status-confusion", "status-sleep", "status-infatuation"], cell=(64, 64), fill=0.7,
                        ratio="16:9",
        what=["confusion: 3 small yellow stars and a tiny bird circling in a flat ellipse ABOVE where a head would be "
              "(top third of the frame), 6-frame loop going round",
              "sleep: a white-blue 'Z' bubble shape (a zig-zag glyph drawn as a shape, not a letter) floats up and grows "
              "from the upper right, then a second smaller one; 6-frame loop",
              "infatuation: 2-3 pink-red hearts (#f06090, #ffb0c8) pop up and float upward with a wobble; 6-frame loop"]),
    "status-body": dict(cols=6, rows=["status-poison", "status-burn", "status-paralysis", "status-freeze"], cell=(64, 64),
                        fill=0.7, ratio="16:9",
        what=["poison: purple bubbles (#a040a0, #d880d8) rise from the bottom and pop; 6-frame loop",
              "burn: small orange-red flame tongues (#f05828, #f8b030, #fff0a0) flicker up around the lower half; 6-frame loop",
              "paralysis: yellow electric zig-zag sparks (#f8d030, #fff8a0) flash on and off around the body area; 6-frame loop",
              "freeze: pale-cyan ice crystals and a frosty shimmer (#c8f0ff, #78c8f0, white) glint around the body; 6-frame loop"]),
    "stat-change": dict(cols=6, rows=["stat-up", "stat-down"], cell=(64, 64), fill=0.8, ratio="16:9",
        despill=dict(dark="#18182a", drop_below=0),
        what=["stat up: 3 columns of bright red-orange chevron arrows (#f05838, #f8a060, white rim) rising from the bottom "
              "to the top of the frame, fading out at the top; 6-frame loop",
              "stat down: 3 columns of blue chevron arrows pointing down (#3868d0, #88b0f0, white rim) sinking from the top "
              "to the bottom; 6-frame loop"]),
    "substitute": dict(cols=6, rows=["substitute-front", "substitute-back", "substitute-puff"], cell=(64, 64), fill=0.7,
                       ratio="16:9",
        what=["a small plush DOLL decoy (cream-green felt body #c8e0a0 / #f0f8d8, button eyes, stitched seams, simple "
              "round body with two stubby ears) seen from the FRONT, turned 3/4 toward the lower-left like a Gen 3 "
              "opponent; idle bob: frames 1-6 it squashes and stretches slightly",
              "the same doll seen from the BACK, turned 3/4 toward the upper-right like a Gen 3 player Pokémon; same idle bob",
              "a white-grey smoke puff (#f0f0f0, #b8b8c8) that bursts out then fades: the doll appears / disappears"]),
    "charge-vanish": dict(cols=6, rows=["charge-glow", "vanish-up", "vanish-down"], cell=(96, 96), fill=0.7, ratio="16:9",
        what=["two-turn charge: white-gold light specks (#fff8c0, #f8e070, white) are pulled in from the edges toward the "
              "centre and a ring of light tightens; keep the middle half empty (the Pokémon shows through); 6 frames building up",
              "fly up / bounce vanish: a white whoosh streak and wind lines shooting straight UP out of the top of the "
              "frame, dust kicked at the bottom; 6 frames",
              "dig / dive vanish: a burst of brown dirt clods and dust (#a07040, #d8b080) splashing outward at the "
              "bottom of the frame as something burrows down; 6 frames"]),
    "held-items": dict(cols=6, rows=["item-berry", "item-heal", "item-glint", "item-restore"], cell=(48, 48), fill=0.7,
                       ratio="16:9",
        what=["a small round berry (red-pink with a green leaf, 12-16 px) pops up, gets two bites taken, crumbs fall; 6 frames",
              "healing: small green-white plus-sparkles and leaf flecks (#78d878, #d8f8c8, white) rise and twinkle "
              "(Leftovers / HP restored); 6-frame loop",
              "item activation: a white four-point star glint flashes and spins once with tiny gold sparks (#f8e070) "
              "(Quick Claw, Focus Band, King's Rock …); 6 frames",
              "stat restore: a soft white-silver shimmer ring wipes upward with small sparkles (White Herb); 6 frames"]),
    "battle-misc": dict(cols=6, rows=["recharge", "flinch", "ability-flash"], cell=(64, 64), fill=0.7, ratio="16:9",
        what=["recharge (worn out after Hyper Beam): two light-blue sweat drops slide down from the top and small grey "
              "puffs of breath appear at the sides; 6 frames",
              "flinch: 3-4 short yellow-white shock marks (spiky lines) pop out around the top and quiver; 6 frames",
              "ability activation: a radial burst of light rays (white core, pale cyan #a8e8f0 rays) behind the Pokémon "
              "flares and fades; keep the middle third empty; 6 frames"]),
}
COMMON = (
    "Pixel art battle effect sprites for a Game Boy Advance Pokémon game (Gen 3 Ruby / Sapphire / Emerald battle screen; "
    "the attached screenshot shows that screen: copy only its pixel style and scale, never draw its Pokémon, HP boxes, "
    "text or background). {grid}. GBA look: crisp square pixels, at most 15 colours, flat colours with 2-3 tones, "
    "bright highlights, a 1-pixel dark outline (#18182a) on solid shapes, no anti-aliasing, no blur, no soft glow, no "
    "gradients, no 3D render. Every frame stays whole inside its own slot (the effect fills at most 70 % of the slot, "
    "nothing touches or crosses the slot edges){tile}. Consecutive frames change in small smooth steps (15 fps). "
    "Background: ONE flat solid pure magenta #FF00FF everywhere: no grid lines, no borders, no frame boxes, no "
    "checkerboard, no text, no numbers, no letters, no Pokémon, no ground, no scenery. Never use #FF00FF inside the "
    "effect (use pinks like #e060b0).")


def grid_text(s):
    rows = len(s["rows"]) if not s.get("grid_rows") else s["grid_rows"]
    if s.get("grid_rows"):
        return (f"{s['cols'] * rows} animation frames of ONE effect, laid out as a {s['cols']} x {rows} grid (frames 1-"
                f"{s['cols']} in the top row left to right, then the next row), every slot the same size, the frames at "
                f"the same scale")
    return (f"{len(s['rows'])} effects, one per row, each a {s['cols']}-frame loop: a {s['cols']} x {len(s['rows'])} grid "
            f"(columns = frames 1-{s['cols']} left to right), every slot the same size, all frames of a row at the same scale")


def prompt(key):
    s = SHEETS[key]
    tile = (" — exception for this seamless tile: the pattern runs edge to edge of its square slot and wraps"
            if s.get("tile") else " — exception: the light rays start right at the top-left corner of each slot"
            if s.get("whole") else "")
    lines = [COMMON.format(grid=grid_text(s), tile=tile), ""]
    for i, w in enumerate(s["what"], 1):
        lines.append(f"ROW {i}: {w}." if len(s["what"]) > 1 else f"FRAMES: {w}.")
    return "\n".join(lines)


def request_vi(key):
    s = SHEETS[key]
    raw = os.path.join(RAW, f"fx-{key}-raw.png")
    names = ", ".join(s["rows"])
    return (f"Vẽ hiệu ứng trận đấu `{key}` ({names}) cho màn hình trận đấu Gen 3 của game Mons. Mở "
            f"`tmp/prompts/fx/{key}.md` và làm đúng thứ tự: (1) Đúng MỘT lần `generate_image` (tỉ lệ {s['ratio']}) với "
            f"prompt trong file, đính kèm `{SCREEN_REF}` (ảnh màn hình trận đấu Gen 3, chỉ để lấy phong cách và tỉ lệ "
            f"pixel). Nền một màu phẳng #FF00FF, không kẻ ô, không bàn cờ, không chữ, hiệu ứng nằm gọn trong 70 % ô"
            f"{' (riêng ảnh này: mỗi ô là một mảng lát liền mạch, phủ kín ô)' if s.get('tile') else ''}. Lưu ảnh gốc đúng "
            f"tên `{raw}`. 1 generate_image, không lặp lại, không thử lần hai, không sửa ảnh. (2) Chạy lần lượt (mỗi lệnh "
            f"một lần): `python3 tools/agy/fx_pack.py normalize {key} --input {raw}` và "
            f"`python3 tools/agy/fx_pack.py check {key}`; chỉ ghi lại kết quả check. Trả lời cuối ghi rõ: CHECK: <các dòng "
            f"kết quả>. Chỉ ghi vào `tmp/mons-refs/`, `assets/ui/Battle/` (các file `{'`, `'.join(r + '.png' for r in s['rows'])}` "
            f"và `battle-fx.json`); KHÔNG đụng file nào khác.")


def write_prompts(keys):
    os.makedirs(PROMPTS, exist_ok=True)
    os.makedirs(REQS, exist_ok=True)
    for k in keys:
        s = SHEETS[k]
        md = (f"# Battle effect `{k}` — {', '.join(s['rows'])}\n\nONE `generate_image` (ratio {s['ratio']}), attach "
              f"`{SCREEN_REF}`. Save the raw image as `tmp/mons-refs/fx-{k}-raw.png`.\n\n```\n{prompt(k)}\n```\n\n"
              f"After generating:\n\n```bash\npython3 tools/agy/fx_pack.py normalize {k} --input tmp/mons-refs/fx-{k}-raw.png\n"
              f"python3 tools/agy/fx_pack.py check {k}\n```\n")
        open(os.path.join(PROMPTS, f"{k}.md"), "w", encoding="utf-8").write(md)
        open(os.path.join(REQS, f"fx-{k}.txt"), "w", encoding="utf-8").write(request_vi(k))
        print(f"tmp/prompts/fx/{k}.md, tmp/agy-requests/fx-{k}.txt")


# ---------------------------------------------------------------- normalize / check (Pillow)
def is_mag(p):
    r, g, b = p[:3]
    return (r - 255) ** 2 + g ** 2 + (b - 255) ** 2 < 110 ** 2 or (r > 150 and b > 150 and g < 90 and abs(r - b) < 70)


def key_out(im):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if is_mag(px[x, y]):
                px[x, y] = (0, 0, 0, 0)
            elif px[x, y][3] < 128:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = px[x, y][:3] + (255,)
    return im


def spilled(r, g, b):
    """an opaque pixel that took on the #FF00FF key's hue (agy blends light / thin strokes into the background)"""
    return r - g > 60 and b - g > 60 and abs(r - b) < 90


def despill(im, ramp=None, dark=None, drop_below=0, all=False, rule="magenta"):
    """magenta spill → the sheet's own colours: by the green channel (the key has none, so green ≈ how much of the
    drawing is in the pixel) a spilled pixel becomes the dark colour (g < 40), one of the ramp tones (dark → light),
    or transparent (g < drop_below, mostly key). `all`: every opaque pixel is remapped (one-colour overlays like rain).
    `rule` for one-hue sheets: "r>g" = a blue / cyan sheet (any red over green is spill), "b>g" = a yellow sheet;
    those pixels are placed by brightness instead (dark < 100, then the ramp)."""
    hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
    tones = [hexrgb(c) for c in ramp or []]
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            hit = all or (r > g + 8 if rule == "r>g" else b > g + 8 if rule == "b>g" else spilled(r, g, b))
            if not a or not hit:
                continue
            if rule != "magenta":
                lum = (r + g + b) / 3
                if g < drop_below or (lum < 100 and not dark):
                    px[x, y] = (0, 0, 0, 0)
                elif lum < 100:
                    px[x, y] = hexrgb(dark) + (255,)
                else:
                    px[x, y] = tones[min(len(tones) - 1, int((lum - 100) * len(tones) / 156))] + (255,)
                continue
            if g < drop_below:
                px[x, y] = (0, 0, 0, 0)
            elif dark and g < 40:
                px[x, y] = hexrgb(dark) + (255,)
            elif tones:
                lo = max(drop_below, 40 if dark else 0)
                i = min(len(tones) - 1, int((g - lo) * len(tones) / max(1, 256 - lo)))
                px[x, y] = tones[i] + (255,)
            elif dark:
                px[x, y] = hexrgb(dark) + (255,)
    return im


def limit_colours(im, n=15):
    from PIL import Image
    alpha = im.getchannel("A")
    q = im.convert("RGB").quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    flat = q.getpalette()       # Gen 3: every palette colour on the BGR555 grid (floor(c5 * 255 / 31), like pret)
    q.putpalette([min(31, (v * 31 + 127) // 255) * 255 // 31 for v in flat])
    rgb = q.convert("RGB")
    out = rgb.convert("RGBA")
    out.putalpha(alpha.point(lambda a: 255 if a >= 128 else 0))
    return out


def normalize(key, src):
    from PIL import Image
    s = SHEETS[key]
    im = key_out(Image.open(src))
    rows = s.get("grid_rows") or len(s["rows"])
    cols = s["cols"]
    sw, sh = im.width / cols, im.height / rows
    slots = [[im.crop((round(c * sw), round(r * sh), round((c + 1) * sw), round((r + 1) * sh))) for c in range(cols)]
             for r in range(rows)]
    if s.get("grid_rows"):          # one effect spread over the whole grid
        slots = [[x for row in slots for x in row]]
    cw, ch = s["cell"]
    os.makedirs(OUT, exist_ok=True)
    for name, frames in zip(s["rows"], slots):
        if s.get("tile") or s.get("whole"):       # overlays: the whole slot, so the tile / corner anchor stays
            outs = [f.resize((cw, ch), Image.Resampling.BOX) for f in frames]
        else:
            boxes = [f.getbbox() for f in frames]
            big = max(max((b[2] - b[0]) / (cw * s.get("fill", 0.7)), (b[3] - b[1]) / (ch * s.get("fill", 0.7)))
                      for b in boxes if b) if any(boxes) else 1
            scale = 1 / max(big, 1e-6)
            outs = []
            for f, b in zip(frames, boxes):
                cell = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
                if b:
                    part = f.crop(b)
                    w, h = max(1, round(part.width * scale)), max(1, round(part.height * scale))
                    part = part.resize((w, h), Image.Resampling.NEAREST if scale >= 1 else Image.Resampling.BOX)
                    # keep the frame's place in its slot (slot centre -> cell centre), clamped inside the cell
                    cx = (b[0] + b[2]) / 2 / f.width * cw
                    cy = (b[1] + b[3]) / 2 / f.height * ch
                    x = min(max(2, round(cx - w / 2)), cw - w - 2)
                    y = min(max(2, round(cy - h / 2)), ch - h - 2)
                    cell.alpha_composite(part, (max(0, x), max(0, y)))
                outs.append(cell)
        strip = Image.new("RGBA", (cw * len(outs), ch), (0, 0, 0, 0))
        for i, o in enumerate(outs):
            strip.alpha_composite(o, (i * cw, 0))
        if s.get("despill"):
            strip = despill(strip, **s["despill"])
        strip = limit_colours(strip)
        strip.save(os.path.join(OUT, f"{name}.png"))
        print(f"{os.path.relpath(os.path.join(OUT, name + '.png'), REPO)}: {len(outs)} frames of {cw}x{ch}")
    write_manifest()


def write_manifest():
    """rebuilt from the strips on disk every time (two agy runs may normalize at once)"""
    from PIL import Image
    eff = {}
    for key, s in SHEETS.items():
        for name in s["rows"]:
            p = os.path.join(OUT, f"{name}.png")
            if os.path.isfile(p):
                cw, ch = s["cell"]
                eff[name] = {"file": f"{name}.png", "frames": Image.open(p).width // cw, "cell": [cw, ch],
                             "tile": bool(s.get("tile")), "anchor": "top-left" if s.get("whole") else "centre", "sheet": key}
    json.dump({"about": "Battle-system effect strips (tools/agy/fx_pack.py; docs/explanation/spec/11-battle-and-save-systems.md §6): "
                        "one row of frames per file, cell = native px of a frame.", "effects": dict(sorted(eff.items()))},
              open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def pixels(im):
    return im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()


def check(key):
    from PIL import Image
    s = SHEETS[key]
    ok = True
    for name in s["rows"]:
        p = os.path.join(OUT, f"{name}.png")
        if not os.path.isfile(p):
            print(f"CHECK {name}: FAIL missing (run normalize)"); ok = False; continue
        im = Image.open(p).convert("RGBA")
        cw, ch = s["cell"]
        n = im.width // cw
        bad = []
        frames = [im.crop((i * cw, 0, (i + 1) * cw, ch)) for i in range(n)]
        px_mag = sum(1 for f in frames for p_ in pixels(f) if p_[3] and is_mag(p_))
        if px_mag:
            bad.append(f"magenta left ({px_mag} px)")
        empty = [i + 1 for i, f in enumerate(frames) if not f.getbbox()]
        if empty:
            bad.append(f"empty frames {empty}")
        if not (s.get("tile") or s.get("whole")):
            cut = [i + 1 for i, f in enumerate(frames) if f.getbbox() and (lambda b: b[0] < 1 or b[1] < 1 or b[2] > cw - 1 or b[3] > ch - 1)(f.getbbox())]
            if cut:
                bad.append(f"touches the cell edge in frames {cut}")
        same = [i + 1 for i in range(n - 1) if frames[i].tobytes() == frames[i + 1].tobytes()]
        if same:
            bad.append(f"frames {same} equal to the next one")
        colours = len({p_[:3] for p_ in pixels(im) if p_[3]})
        if colours > 15:
            bad.append(f"{colours} colours > 15")
        ok &= not bad
        print(f"CHECK {name}: {'PASS' if not bad else 'FAIL ' + '; '.join(bad)}")
    return ok


def main():
    ap = argparse.ArgumentParser(description="Battle-system effects for agy: prompts, normalize, check.",
                                 usage="fx_pack.py {prompt,normalize,check,list} [<key>|all] [--input <raw png>]")
    ap.add_argument("cmd", choices=("prompt", "normalize", "check", "list"))
    ap.add_argument("key", nargs="?", help="effect key or `all`")
    ap.add_argument("--input", help="raw agy image (normalize)")
    ns = ap.parse_args()
    a = [ns.cmd] + ([ns.key] if ns.key else []) + (["--input", ns.input] if ns.input else [])
    keys = list(SHEETS) if len(a) > 1 and a[1] == "all" else a[1:2]
    if a[0] == "list":
        for k, s in SHEETS.items():
            print(f"{k}: {', '.join(s['rows'])} ({s['cols']} frames, cell {s['cell'][0]}x{s['cell'][1]})")
    elif a[0] == "prompt":
        write_prompts(keys)
    elif a[0] == "normalize":
        if "--input" not in a:
            sys.exit("normalize <key> --input <raw png>")
        normalize(a[1], a[a.index("--input") + 1])
    else:
        sys.exit(0 if all([check(k) for k in keys]) else 1)


if __name__ == "__main__":
    main()
