"""Write sodier-war-next/client/assets/compare/index.json: every Pokémon with a 3D model in
assets/pokemon/Fall-back/<Gen>/<NNN-Name>/ (+ any with only hand-drawn sheets), ascending dex number.
movement2d/posses2d: hand-drawn sheets in assets/pokemon/<Gen>/<NNN-Name>/ (served via the client/assets/mons2d
symlink -> Pokemon) or null; model3d: built 3D sheet json in client/assets/pokemon3d/<slug>.json or null."""
import os, re, json, time, glob
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
DEX = os.path.join(ROOT, "assets", "units")
CLIENT = os.path.join(os.environ.get("MONS_SODIER_WAR") or "/home/huy/Main/sodier-war-next", "client")   # $MONS_SODIER_WAR
def slug(name):
    s = name.lower().replace("♀", "-f").replace("♂", "-m")
    s = re.sub(r"['’.]+", "", s); s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")
entries = {}
for root in (os.path.join(DEX, "Fall-back"), DEX):
    for d in glob.glob(os.path.join(root, "Gen*", "[0-9]*-*")):
        gen, folder = d.split(os.sep)[-2:]
        no = int(folder.split("-", 1)[0])
        entries.setdefault(no, (gen, folder))
def _sizes():
    """data/pokemon/pokemon_sizes.json (user-maintained, upstream species data keyed by name):
    height dm, weight hg, baseScale, hitbox {width, height} in blocks (= metres) before baseScale."""
    out = {}
    for name, v in json.load(open(os.path.join(ROOT, "data", "units", "pokemon_sizes.json"), encoding="utf-8")).items():
        hb, bs = v.get("hitbox") or {}, v.get("baseScale") or 1
        out[int(v["nationalPokedexNumber"])] = {
            "height_m": v["height"] / 10 if v.get("height") is not None else None,
            "weight_kg": v["weight"] / 10 if v.get("weight") is not None else None,
            "base_scale": bs,
            "game_h": round(hb["height"] * bs, 3) if hb.get("height") else None,  # in-game (3D model) height
            "game_w": round(hb["width"] * bs, 3) if hb.get("width") else None}
    return out
SIZES = _sizes()
LOCO = {p["no"]: p for p in json.load(open(os.path.join(ROOT, "data", "units", "pokemon-locomotion.json"), encoding="utf-8"))["units"]}
def png_loops(path):
    """the "mons-loops" tEXt chunk (JSON loop layout) of a movement sheet, or None (stdlib only)"""
    import struct
    try:
        with open(path, "rb") as f:
            if f.read(8) != b"\x89PNG\r\n\x1a\n":
                return None
            while True:
                head = f.read(8)
                if len(head) < 8:
                    return None
                n, typ = struct.unpack(">I4s", head)
                data = f.read(n); f.read(4)
                if typ == b"tEXt" and data.startswith(b"mons-loops\x00"):
                    return json.loads(data.split(b"\x00", 1)[1].decode("latin-1"))
                if typ == b"IDAT":
                    return None
    except (OSError, ValueError):
        return None


out = []
for no, (gen, folder) in sorted(entries.items()):
    name = folder.split("-", 1)[1]; sl = slug(name)
    def f2d(kind):
        p = os.path.join(DEX, gen, folder, f"{sl}-{kind}.png")
        return f"/assets/mons2d/{gen}/{folder}/{sl}-{kind}.png?v={int(os.path.getmtime(p))}" if os.path.isfile(p) else None
    loops2d = png_loops(os.path.join(DEX, gen, folder, f"{sl}-movement.png"))
    j = os.path.join(CLIENT, "assets/pokemon3d", f"{sl}.json")
    out.append({"no": no, "name": name, "slug": sl, "gen": gen, "movement2d": f2d("movement"), "posses2d": f2d("posses"),
                "model3d": f"/assets/pokemon3d/{sl}.json?v={int(os.path.getmtime(j))}" if os.path.isfile(j) else None,
                "fallback": os.path.isdir(os.path.join(DEX, "Fall-back", gen, folder)),
                "height_m": SIZES.get(no, {}).get("height_m"), "weight_kg": SIZES.get(no, {}).get("weight_kg"),
                "base_scale": SIZES.get(no, {}).get("base_scale"), "game_h": SIZES.get(no, {}).get("game_h"),
                "game_w": SIZES.get(no, {}).get("game_w"),
                "locomotion": LOCO.get(no, {}).get("locomotion", "walk"), "movement2d_loops": loops2d, "aquatic": LOCO.get(no, {}).get("aquatic", False)})
os.makedirs(os.path.join(CLIENT, "assets/compare"), exist_ok=True)
tmp = os.path.join(CLIENT, "assets/compare/index.json.tmp")
json.dump({"generated": int(time.time()), "mons": out}, open(tmp, "w"), ensure_ascii=False, indent=0)
os.replace(tmp, os.path.join(CLIENT, "assets/compare/index.json"))
NAMES = {m["no"]: m["name"] for m in out}
json.dump({"source": "data/pokemon/pokemon_sizes.json (upstream species data)", "units": [
    {"no": no, "name": NAMES.get(no, ""), **v} for no, v in sorted(SIZES.items())]},
    open(os.path.join(CLIENT, "assets/compare/sizes.json"), "w", encoding="utf-8"), ensure_ascii=False)  # atomic: the UI may fetch it any time
print(len(out), "mons,", sum(1 for x in out if x["movement2d"] or x["posses2d"]), "with 2D,", sum(1 for x in out if x["model3d"]), "with 3D")
