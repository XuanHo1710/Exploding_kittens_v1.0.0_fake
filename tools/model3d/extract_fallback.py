"""Copy every Pokémon model (geo + animations + poser + resolver + textures + license) of the upstream 3D model jar
(see THIRD_PARTY_NOTICES.md) into assets/pokemon/Fall-back/<GenX-Region>/<NNN>-<Name>/ using the same naming as the sprite
folders. JSON files are rewritten to the repo's neutral ids on the way (tools/check_names.py must stay clean):
  - the jar's own namespace ("<ns>:textures/...", "<ns>:<species>") -> "mons:..."
  - other namespaced ids inside Molang strings ('<ns>:sand') -> 'world:sand'
  - the "<ns>:geometry" key of .geo.json -> "geometry"
  - Molang math functions that render3d only knows with an "f" prefix -> math.f<name>
  - every --rename OLD=NEW (case-insensitive) in file names and contents, for any other upstream word check_names.py
    flags (e.g. a texture variant named after the base game -> "blocky")

  - --only-missing: add only species (dex numbers) that have no Fall-back folder yet; existing folders are not touched
    (used to add the species a newer jar has on top of the 1.7.3 library, THIRD_PARTY_NOTICES.md section 1)
  - --base-only: skip the files of regional / Mega / Gigantamax forms (alolan, galarian, hisuian, paldean, mega, gmax)
  - a species without its own `license` file gets the jar's shared models-folder `license` (the same CC BY-NC 3.0
    text) when --only-missing is given

usage: python3 -I tools/model3d/extract_fallback.py <jar> <repo root> [--rename OLD=NEW ...] [--only-missing]
       [--base-only]
  e.g. python3 -I tools/model3d/extract_fallback.py <1.8.4 jar> . --rename <word>=blocky --only-missing --base-only
"""
import zipfile, json, re, os, sys, glob, collections
args = sys.argv[1:]
RENAME = []
while "--rename" in args:
    i = args.index("--rename"); old, _, new = args[i + 1].partition("="); RENAME.append((re.compile(re.escape(old), re.I), new))
    del args[i:i + 2]
ONLY_MISSING = "--only-missing" in args
BASE_ONLY = "--base-only" in args
args = [a for a in args if a not in ("--only-missing", "--base-only")]
FORM = re.compile(r"(^|_)(alola|alolan|galar|galarian|hisui|hisuian|paldea|paldean|mega|megax|megay|mega_x|mega_y|gmax)"
                  r"(_|\.|$)", re.I)
JAR, ROOT = args[:2]
DEX = os.path.join(ROOT, "assets", "units")
OUT = os.path.join(DEX, "Fall-back")
GENS = [(151, "Gen1-Kanto"), (251, "Gen2-Johto"), (386, "Gen3-Hoenn"), (493, "Gen4-Sinnoh"), (649, "Gen5-Unova"),
        (721, "Gen6-Kalos"), (809, "Gen7-Alola"), (905, "Gen8-Galar"), (10**6, "Gen9-Paldea")]
gen_of = lambda n: next(g for top, g in GENS if n <= top)
ROW = re.compile(r"^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|")
MOLANG_FN = {"sin", "cos", "abs", "sqrt", "floor", "ceil", "round", "min", "max", "pow", "exp", "pi", "fmod", "clamp",
             "lerp", "random", "atan2", "asin", "acos", "atan"}   # = render3d.ENV (kept here: no numpy needed)
names = {}
for md in glob.glob(os.path.join(DEX, "Gen*", "gen[0-9]*.md")):
    for line in open(md, encoding="utf-8"):
        m = ROW.match(line)
        if m: names[int(m.group(1))] = m.group(2)
z = zipfile.ZipFile(JAR)
NS = next(m.group(1) for n in z.namelist() for m in [re.match(r"assets/([^/]+)/bedrock/pokemon/models/", n)] if m)


def renamed(text):
    for rx, new in RENAME:
        text = rx.sub(new, text)
    return text


def neutral(text):
    text = text.replace(f'"{NS}:geometry"', '"geometry"').replace(f"{NS}:", "mons:")
    text = re.sub(r"'([a-z_]+):([a-z0-9_./]+)'", lambda m: m.group(0) if m.group(1) == "mons" else f"'world:{m.group(2)}'", text)
    text = re.sub(r'"([a-z_]+):geometry"', '"geometry"', text)
    text = re.sub(r"\bmath\.(\w+)\(", lambda m: m.group(0) if m.group(1) in MOLANG_FN or "f" + m.group(1) not in MOLANG_FN
                  else f"math.f{m.group(1)}(", text)
    return renamed(text)


have = {int(m.group(1)) for d in glob.glob(os.path.join(OUT, "Gen*", "*"))
        for m in [re.match(r"(\d+)-", os.path.basename(d))] if m} if ONLY_MISSING else set()
added, licensed = set(), set()
species = {}
for n in z.namelist():
    if re.match(rf"data/{re.escape(NS)}/species/generation[^/]+/[^/]+\.json$", n):
        try:
            d = json.loads(z.read(n)); species.setdefault(int(d["nationalPokedexNumber"]), d["name"])
        except Exception:
            pass
CATS = {f"assets/{NS}/bedrock/pokemon/models/": "models", f"assets/{NS}/bedrock/pokemon/animations/": "animations",
        f"assets/{NS}/bedrock/pokemon/posers/": "posers", f"assets/{NS}/bedrock/pokemon/resolvers/": "resolvers",
        f"assets/{NS}/textures/pokemon/": "textures"}
count, files, missing_name = collections.Counter(), 0, set()
for n in z.namelist():
    if n.endswith("/"):
        continue
    for pre, cat in CATS.items():
        if n.startswith(pre):
            folder, _, fname = n[len(pre):].partition("/")
            m = re.match(r"(\d+)_", folder)
            if not m or "/" in fname:
                break
            no = int(m.group(1))
            if no in have or (BASE_ONLY and FORM.search(fname)):
                break
            name = names.get(no) or species.get(no)
            if not name:
                missing_name.add(folder); name = folder.split("_", 1)[1].title()
            name = re.sub(r'[/:<>"|?*\\]+', "-", name).strip().rstrip(". ")   # Windows-safe: no trailing dot / space
            d = os.path.join(OUT, gen_of(no), f"{no:03d}-{name}")
            fname = renamed(fname)
            dest = os.path.join(d, fname) if fname == "license" else os.path.join(d, cat, fname)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            data = z.read(n)
            if fname.endswith(".json"):
                data = neutral(data.decode("utf-8")).encode("utf-8")
            with open(dest, "wb") as f:
                f.write(data)
            count[gen_of(no)] += fname == "license"; files += 1
            added.add(d)
            if fname == "license":
                licensed.add(d)
            break
SHARED = f"assets/{NS}/bedrock/pokemon/models/license"
if ONLY_MISSING and SHARED in z.namelist():
    for d in sorted(added - licensed):
        with open(os.path.join(d, "license"), "wb") as f:
            f.write(z.read(SHARED))
if ONLY_MISSING:
    print("added", len(added), "species:", ", ".join(sorted(os.path.basename(d) for d in added)))
print("files", files, "missing names", sorted(missing_name)[:10])
for g in sorted(set(gen_of(n) for n in range(1, 1026))):
    p = os.path.join(OUT, g)
    print(g, len(os.listdir(p)) if os.path.isdir(p) else 0, "folders")
