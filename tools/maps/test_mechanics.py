"""Build the mechanics test caves (tools/maps/fixtures/*.map.json) into tmp/mech-maps/ and check them.

Each fixture is copied to tmp/mech-maps/<slug>/ (the build writes its outputs next to the spec), built with
mapgen.py, and then checked: collision chars of every mechanic, the tide variant, the cave check and the solver
(mechtest and mechtide solve with 0 errors; mechbad has an item behind lava with no boulder, which the solver
must report). The game test (game/tools/mech_test.mjs) plays the same maps after
`MONS_EXTRA_MAPS=tmp/mech-maps npm run assets`.

    python3 tools/maps/test_mechanics.py
"""
import argparse
import glob
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
OUT = os.path.join(REPO, "tmp", "mech-maps")


def main():
    argparse.ArgumentParser(description=__doc__.split("\n")[0]).parse_args()
    import cavekit
    import mapgen as MG
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    built = {}
    for spec in sorted(glob.glob(os.path.join(HERE, "fixtures", "*.map.json"))):
        slug = os.path.basename(spec)[: -len(".map.json")]
        d = os.path.join(OUT, slug)
        os.makedirs(d)
        shutil.copy(spec, os.path.join(d, f"{slug}.map.json"))
    for spec in sorted(glob.glob(os.path.join(OUT, "*", "*.map.json"))):
        m = MG.build(spec, debug=True, quiet=True)
        assert not m.errors, m.errors
        built[m.slug] = m
    fails = []

    def expect(name, got, want):
        ok = got == want
        print(("OK   " if ok else "FAIL ") + f"{name}: {got!r}" + ("" if ok else f" (want {want!r})"))
        if not ok:
            fails.append(name)
    C = built["mechtest-1f"].C
    for name, (x, y), ch in [("boulder", (40, 4), "B"), ("lava", (41, 4), "L"), ("barrier", (3, 6), "X"),
                             ("switch", (12, 10), "o"), ("hole", (20, 4), "S"), ("smash rock", (26, 10), "H"),
                             ("cut tree", (28, 10), "H"), ("ice", (5, 17), "i"), ("crystal", (12, 18), "#"),
                             ("cart", (17, 24), "S"), ("rail", (17, 22), "r"), ("rail corner", (17, 20), "r"),
                             ("lever", (36, 24), "l"), ("gate", (40, 24), "G"), ("ledge N", (31, 20), "^"),
                             ("ledge E", (38, 15), ">"), ("ledge W", (42, 15), "<"), ("ledge S", (31, 23), "v")]:
        expect(f"mechtest-1f {name} at {x},{y}", C[y][x], ch)
    tmj = json.load(open(os.path.join(OUT, "mechtest-1f", "mechtest-1f.tmj")))
    ev = [o for la in tmj["layers"] if la["name"] == "events" for o in la["objects"]]
    cart = [o for o in ev if o["type"] == "cart"][0]
    props = {p["name"]: p["value"] for p in cart["properties"]}
    expect("cart land", props["land"], "25,20")
    expect("cart path length", len(props["path"].split(";")), 12)
    expect("mech events", sorted({o["type"] for o in ev} & set(cavekit.MECH_CHAR)),
           sorted(["boulder", "barrier", "switch", "smash", "cut", "crystal", "lever", "gate"]))
    low = [line.rstrip("\n") for line in open(os.path.join(OUT, "mechtide-1f", "mechtide-1f-collision.txt"))]
    high = [line.rstrip("\n") for line in open(os.path.join(OUT, "mechtide-1f", "mechtide-1f-collision-high.txt"))]
    expect("tide low flood cell", low[9][20], ".")
    expect("tide high flood cell", high[9][20], "~")
    expect("tide low tunnel", low[17][7], ".")
    expect("tide high tunnel", high[17][7], "#")
    tl = json.load(open(os.path.join(OUT, "mechtide-1f", "mechtide-1f.tmj")))
    expect("tide layer", [la["name"] for la in tl["layers"] if la["name"] == "terrain-high"], ["terrain-high"])
    for group, want in (("mechtest", 0), ("mechtide", 0), ("mechbad", 1)):
        errs = MG.cmd_cave(group, exit=False, maps_dir=OUT)
        expect(f"cave {group} errors", len(errs), want)
    # solver details: the lava pocket item needs the boulder; the b1f gate pocket needs the 1F lever
    E, N = cavekit.solve_cave(OUT, ["mechtest-1f", "mechtest-b1f"])
    expect("mechtest solved", E, [])
    print(f"{len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
