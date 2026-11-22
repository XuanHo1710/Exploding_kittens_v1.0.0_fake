#!/usr/bin/env python3
"""
Clipping detector for move strips (user rule 2026-11-19, decisions.md §12): an effect must stay INSIDE its frame cell
("box") or the cell must be made bigger; a drawing that runs past the cell edge is hard-clipped and shows a straight
cut on the battle screen. A frame is CUT when opaque pixels touch one of the 4 cell borders in a run of at least
`min_run` px (a single stray pixel does not count).

By design (not counted as cut):
  - beam travel frames (effect frames 1-4 of a `beam` move) may touch the LEFT and RIGHT borders (agy's normalizer
    stretches them edge to edge): vfx.py lays overlapping copies along the path and rounds the two outer ends
    (`beam_cap`). If such a frame also touches the top or bottom it is a cut blob (a spray), not a beam segment.
  - fall travel frames (effect frames 1-4 of a `fall` move) may touch the TOP border (it comes from the sky): vfx.py
    extends the touching column up to the top of the screen.

usage:
  python3 clip_check.py assets/skills/Gen1-Kanto/Thunder/thunder-effect.png      # one or more strips
  python3 clip_check.py --move flamethrower                               # agy + Fallback + procedural strips of a move
  python3 clip_check.py --all [--json out.json] [-v]                      # every strip in assets/skills/Gen*/ and assets/skills/Fallback/
                                                                          #   + the procedural strips of every move
  python3 clip_check.py --move take-down --edges                          # + advisory: straight edges INSIDE the cell
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfx  # noqa: E402
from vfx import Image  # noqa: E402

MIN_RUN = 4


def _runs(vals):
    """[(start, length)] of consecutive True values"""
    out, s = [], None
    for i, v in enumerate(list(vals) + [False]):
        if v and s is None:
            s = i
        elif not v and s is not None:
            out.append((s, i - s))
            s = None
    return out


def border_runs(frame, min_run=MIN_RUN):
    """{side: [(start, length), ...]} runs of opaque pixels (>= min_run) on each outer row / column of the frame"""
    a = frame.getchannel("A").load()
    W_, H_ = frame.size
    lines = {"left": [a[0, y] > 0 for y in range(H_)], "right": [a[W_ - 1, y] > 0 for y in range(H_)],
             "top": [a[x, 0] > 0 for x in range(W_)], "bottom": [a[x, H_ - 1] > 0 for x in range(W_)]}
    return {s: [r for r in _runs(v) if r[1] >= min_run] for s, v in lines.items()}


def frame_cuts(frame, i=0, arch=None, kind=None, min_run=MIN_RUN):
    """[(side, longest run px)] where the drawing is cut by the cell border; the by-design joins are left out"""
    br = border_runs(frame, min_run)
    travel = kind == "effect" and i < 4 and arch in ("beam", "fall")
    if travel and arch == "beam" and not (br["top"] or br["bottom"]):
        br["left"], br["right"] = [], []                # a beam segment: copies join along the path (ends rounded)
    if travel and arch == "fall":
        br["top"] = []                                  # comes from the sky
    return [(s, max(n for _, n in r)) for s, r in br.items() if r]


def strip_frames(path):
    """frames of a strip PNG (cell = image height, like vfx.load_strip)"""
    return vfx.load_strip(path)


def strip_cuts(frames, arch=None, kind=None, min_run=MIN_RUN):
    """{frame index (0-based): [(side, run)]} for the frames that are cut"""
    out = {}
    for i, f in enumerate(frames or []):
        c = frame_cuts(f, i, arch, kind, min_run)
        if c:
            out[i] = c
    return out


def straight_edges(frame, i=0, arch=None, kind=None, min_len=24, depth=4):
    """ADVISORY (not counted): long straight edges INSIDE the cell where a solid, light part of the drawing simply stops
    (>= min_len px in one row / column, >= depth px thick, no dark outline): typical of a draft that agy itself cut at
    its slot line before normalizing. Flat bases (a wave on the sea, flames on the ground) also show up, so look at
    them. Beam travel frames are skipped (straight by design). Returns [(side, line, length)]."""
    if kind == "effect" and i < 4 and arch == "beam":
        return []
    W_, H_ = frame.size
    px = frame.load()
    solid = lambda x, y: 0 <= x < W_ and 0 <= y < H_ and px[x, y][3] > 0  # noqa: E731
    light = lambda p: 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2] > 60  # noqa: E731
    out = []
    for vertical in (True, False):
        for d, side in ((1, "right" if vertical else "bottom"), (-1, "left" if vertical else "top")):
            for a in range(1, (W_ if vertical else H_) - 1):
                run = best = 0
                for b in range(H_ if vertical else W_):
                    x, y = (a, b) if vertical else (b, a)
                    nx, ny = (x + d, y) if vertical else (x, y + d)
                    ok = solid(x, y) and not solid(nx, ny) and light(px[x, y]) and all(
                        solid(x - d * k, y) if vertical else solid(x, y - d * k) for k in range(1, depth))
                    run = run + 1 if ok else 0
                    best = max(best, run)
                if best >= min_len:
                    out.append((side, a, best))
    return out


def describe(cuts):
    return ", ".join(f"f{i + 1} " + "/".join(f"{s}({n})" for s, n in c) for i, c in sorted(cuts.items()))


def moves():
    return {m["identifier"]: m for m in json.load(open(os.path.join(vfx.REPO, "data", "battle", "moves.json"), encoding="utf-8"))["moves"]}


def move_report(m, min_run=MIN_RUN):
    """[(origin, kind, path or None, cuts)] for the agy, Fallback and procedural strips of one move"""
    arch = m["vfx"]["archetype"]
    rows = []
    for origin in ("agy", "fallback"):
        for kind in vfx.KINDS:
            p = vfx.strip_path(m, kind, origin)
            if os.path.isfile(p):
                rows.append((origin, kind, p, strip_cuts(strip_frames(p), arch, kind, min_run)))
    for kind, fn in (("cast", vfx.proc_cast), ("effect", vfx.proc_effect)):
        rows.append(("procedural", kind, None, strip_cuts(fn(m), arch, kind, min_run)))
    return rows


def ident_of(path):
    b = os.path.basename(path)[:-4]
    for k in vfx.KINDS:
        if b.endswith("-" + k):
            return b[: -len(k) - 1], k
    return b, None


def scan_all(min_run=MIN_RUN, procedural=True):
    """every strip in assets/skills/Gen*/ (agy) and assets/skills/Fallback/ + the procedural strip of every move"""
    ms = moves()
    res = {"agy": [], "fallback": [], "procedural": []}
    pats = {"agy": os.path.join(vfx.REPO, "assets", "skills", "Gen*", "*", "*-*.png"),
            "fallback": os.path.join(vfx.FALLBACK_DIR, "Gen*", "*", "*-*.png")}
    for origin, pat in pats.items():
        for p in sorted(glob.glob(pat)):
            ident, kind = ident_of(p)
            if not kind:
                continue
            m = ms.get(ident)
            arch = m["vfx"]["archetype"] if m else None
            res[origin].append({"move": ident, "kind": kind, "path": os.path.relpath(p, vfx.REPO),
                                "cuts": strip_cuts(strip_frames(p), arch, kind, min_run)})
    if procedural:
        for ident, m in ms.items():
            for kind, fn in (("cast", vfx.proc_cast), ("effect", vfx.proc_effect)):
                res["procedural"].append({"move": ident, "kind": kind, "path": None,
                                          "cuts": strip_cuts(fn(m), m["vfx"]["archetype"], kind, min_run)})
    return res


def edge_report(frames, arch, kind):
    for i, f in enumerate(frames or []):
        e = straight_edges(f, i, arch, kind)
        if e:
            side, line, n = max(e, key=lambda t: t[2])
            print(f"   (look) f{i + 1}: straight {side} edge {n} px at {line}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("strips", nargs="*")
    ap.add_argument("--move", action="append", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--no-procedural", action="store_true", help="--all: skip the procedural strips")
    ap.add_argument("--min-run", type=int, default=MIN_RUN)
    ap.add_argument("--json", default="", help="--all: also write the full result here")
    ap.add_argument("-v", "--verbose", action="store_true", help="--all: list every cut strip")
    ap.add_argument("--edges", action="store_true", help="strips / --move: also list long straight edges inside the "
                    "cell (advisory: a draft cut before normalizing, or a flat base by design - look at them)")
    a = ap.parse_args()
    bad = 0
    if a.all:
        res = scan_all(a.min_run, not a.no_procedural)
        for origin, rows in res.items():
            cut = [r for r in rows if r["cuts"]]
            bad += len(cut)
            print(f"{origin:10} {len(cut):4} of {len(rows):4} strips cut at the cell edge"
                  f" ({sum(len(r['cuts']) for r in cut)} frames)")
            if a.verbose or origin != "procedural":
                for r in cut:
                    print(f"   {r['move']}-{r['kind']}: {describe(r['cuts'])}")
        if a.json:
            json.dump({o: [dict(r, cuts={str(k): v for k, v in r["cuts"].items()}) for r in rows] for o, rows in res.items()},
                      open(a.json, "w"), indent=1)
    ms = moves() if (a.move or a.strips) else {}
    for q in a.move:
        m = ms.get(q.lower().replace(" ", "-")) or sys.exit(f"move {q} not found")
        for origin, kind, p, cuts in move_report(m, a.min_run):
            bad += bool(cuts)
            print(f"{m['identifier']} {origin:10} {kind:6} {'CUT  ' + describe(cuts) if cuts else 'ok'}")
            if a.edges and p:
                edge_report(strip_frames(p), m["vfx"]["archetype"], kind)
    for p in a.strips:
        ident, kind = ident_of(p)
        m = ms.get(ident)
        arch = m and m["vfx"]["archetype"]
        frames = strip_frames(p)
        cuts = strip_cuts(frames, arch, kind, a.min_run)
        bad += bool(cuts)
        print(f"{p}: {'CUT  ' + describe(cuts) if cuts else 'ok'}")
        if a.edges:
            edge_report(frames, arch, kind)
    if not (a.all or a.move or a.strips):
        ap.error("strip paths, --move or --all")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
