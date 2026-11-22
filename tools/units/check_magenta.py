#!/usr/bin/env python3
"""
Audit: magenta background left on the final Pokémon sheets (assets/pokemon/Gen*/<NNN>-<Name>/<slug>-movement.png,
-battle.png, -posses.png). Runs the shared cleaner (magenta.py) as a dry run and counts what it would change:
  key    near-#FF00FF / light panel pixels connected to the background
  shade  darker / greyed magenta shades connected to the background (painted shadows, slot tints)
  frame  thin magenta / dark lines of panel or grid borders
  fringe magenta-tinted 1-2 px ring on the drawing's edge (despilled by clean_magenta.py)
  speck  lone light pink pixels on the edge
Colours of the species' own art (its <slug>-reference.jpg and its Fall-back texture) are allowed, never counted.
A sheet is flagged when it has >= 20 such pixels. Severity: HIGH (key + shade + frame >= 5000: panels, painted
shadows), MED (>= 500, or fringe >= 5000), LOW (the rest).
Writes tmp/report/magenta/report.json and tmp/report/magenta/worst.png (the worst 40 sheets, their worst cell x3 on
grey: magenta left shows as pink / purple). Results are cached by file size + mtime (tmp/report/magenta/cache.json).
Exit code 1 when a sheet is flagged. --skip-busy (used by tools/check.sh): a species with a queued image request
(tmp/agy-requests/queue.json) is reported as BUSY and does not fail the check (its sheet is being redrawn).

  python3 tools/units/check_magenta.py                    # every sheet
  python3 tools/units/check_magenta.py assets/pokemon/Gen1-Kanto/042-Golbat/golbat-movement.png --no-preview
"""
import argparse
import json
import os
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import magenta as M  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

REPORT = os.path.join(M.REPO, "tmp", "report", "magenta")
FLAG_MIN = 20
CACHE_VERSION = 1


def severity(st):
    hard = st["key"] + st["shade"] + st["frame"]
    total = hard + st["fringe"] + st["speck"]
    if total < FLAG_MIN:
        return "OK"
    if hard >= 5000:
        return "HIGH"
    if hard >= 500 or st["fringe"] >= 5000:
        return "MED"
    return "LOW"


def audit(path):
    out, st, changed, im = M.clean_sheet(path)
    st = {k: v for k, v in st.items() if k != "cells"} | {"worst": M.worst_cell(st, *im.size)}
    st["reverted"] = [list(c) for c in st["reverted"]]
    st["severity"] = severity(st)
    return path, st


def rel(p):
    return os.path.relpath(p, M.REPO)


def contact(results, n=40, k=3, crop=96):
    """the worst n sheets: the densest crop of their worst cell, x k, on grey, with a label"""
    worst = sorted(results.items(), key=lambda kv: -(kv[1]["key"] + kv[1]["shade"] + kv[1]["frame"] + kv[1]["fringe"]
                                                     + kv[1]["speck"]))[:n]
    worst = [w for w in worst if w[1]["severity"] != "OK"]
    if not worst:
        return None
    cols = 8
    tw, th = crop * k, crop * k + 14
    sheet = Image.new("RGB", (cols * tw, ((len(worst) + cols - 1) // cols) * th), (40, 40, 48))
    d = ImageDraw.Draw(sheet)
    for i, (p, st) in enumerate(worst):
        x0, y0, x1, y1 = st["worst"]
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        im = M.grey_view(Image.open(p))
        box = (max(0, cx - crop // 2 - 0), max(0, cy - crop // 2 + 20), 0, 0)
        box = (box[0], min(box[1], im.height - crop), box[0] + crop, min(box[1], im.height - crop) + crop)
        tile = im.crop(box).resize((tw, tw), Image.Resampling.NEAREST)
        sx, sy = (i % cols) * tw, (i // cols) * th
        sheet.paste(tile, (sx, sy + 14))
        tot = st["key"] + st["shade"] + st["frame"] + st["fringe"] + st["speck"]
        d.text((sx + 3, sy + 1), f"{os.path.basename(p)[:-4][:30]} {st['severity']} {tot}", fill=(255, 255, 255))
    os.makedirs(REPORT, exist_ok=True)
    out = os.path.join(REPORT, "worst.png")
    sheet.save(out)
    return out


def main():
    ap = argparse.ArgumentParser(description="Audit magenta background left on the final Pokémon sheets.")
    ap.add_argument("sheets", nargs="*", help="sheet PNGs (default: every sheet under assets/pokemon)")
    ap.add_argument("--no-preview", action="store_true", help="skip tmp/report/magenta/worst.png")
    ap.add_argument("--no-cache", action="store_true", help="re-check every sheet")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) // 2), help="parallel workers")
    ap.add_argument("--quiet", action="store_true", help="print only flagged sheets and the summary")
    ap.add_argument("--skip-busy", action="store_true", help="do not fail on species with a queued image request")
    ns = ap.parse_args()
    sheets = [os.path.abspath(p) for p in ns.sheets] or M.all_sheets()
    os.makedirs(REPORT, exist_ok=True)
    cache_p = os.path.join(REPORT, "cache.json")
    try:
        cache = json.load(open(cache_p, encoding="utf-8"))
        if cache.get("version") != CACHE_VERSION:
            cache = {}
    except (OSError, ValueError):
        cache = {}
    files = cache.get("files", {})
    stamp = {p: f"{os.path.getsize(p)}:{os.path.getmtime(p):.3f}" for p in sheets}
    todo = [p for p in sheets if ns.no_cache or files.get(rel(p), {}).get("stamp") != stamp[p]]
    results = {p: files[rel(p)]["result"] for p in sheets if p not in todo}
    if todo:
        if ns.jobs > 1 and len(todo) > 1:
            with Pool(min(ns.jobs, len(todo))) as pool:
                got = pool.map(audit, todo, chunksize=1)
        else:
            got = [audit(p) for p in todo]
        for p, st in got:
            results[p] = st
            files[rel(p)] = {"stamp": stamp[p], "result": st}
        json.dump({"version": CACHE_VERSION, "files": files}, open(cache_p, "w", encoding="utf-8"))
    flagged = 0
    busy = M.busy_slugs() if ns.skip_busy else set()
    for p in sheets:
        st = results[p]
        bad = st["severity"] != "OK"
        tag = st["severity"]
        if bad and M.slug_of(p) in busy:
            bad, tag = False, "BUSY"
        flagged += bad
        if tag != "OK" or not ns.quiet:
            print(f"{tag:4} {rel(p)}: key {st['key']} shade {st['shade']} frame {st['frame']} "
                  f"fringe {st['fringe']} speck {st['speck']}" + (f" (guarded cells {st['reverted']})" if st["reverted"] else ""))
    json.dump({rel(p): results[p] for p in sheets}, open(os.path.join(REPORT, "report.json"), "w", encoding="utf-8"),
              indent=1)
    if not ns.no_preview:
        c = contact({p: results[p] for p in sheets})
        if c:
            print(f"worst sheets: {rel(c)}")
    print(f"magenta: {len(sheets)} sheet(s), {flagged} flagged")
    sys.exit(1 if flagged else 0)


if __name__ == "__main__":
    main()
