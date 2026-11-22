#!/usr/bin/env python3
"""
Remove magenta background left on final Pokémon sheets, in place (mechanical post-pass, no redraw). Works on the
final PNG (RGB on exact #FF00FF), with the shared cleaner of magenta.py:
  - key / panel / shade pixels connected to the background (flood from the background through magenta-ish pixels)
    become exact #FF00FF; pixels enclosed by the drawing are never keyed;
  - panel / grid border lines are removed;
  - the 1-2 px magenta-tinted fringe is despilled to the body / outline colour it is a blend of;
  - colours of the species' own art (<slug>-reference.jpg + Fall-back texture) are never touched;
  - a cell that would lose more than half of its drawing is left as it was (reported);
  - no new colours: a pixel only becomes #FF00FF or a colour already next to it (or the drawing's outline colour);
  - the PNG text chunks (the loop layout of assemble_loops.py) are kept.
Repeats until the audit (check_magenta.py) finds nothing. Writes before / after pairs of the worst cell to
tmp/report/magenta/before-after/<slug>-<kind>.png and a summary contact sheet tmp/report/magenta/before-after-NN.png.
Sheets of species with a queued image request (tmp/agy-requests/queue.json) are skipped unless --include-busy.

  python3 tools/units/clean_magenta.py assets/pokemon/Gen1-Kanto/042-Golbat/golbat-movement.png
  python3 tools/units/clean_magenta.py --all --dry-run
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
PAIRS = os.path.join(REPORT, "before-after")


def total(st):
    return st["key"] + st["shade"] + st["frame"] + st["fringe"] + st["speck"]


def clean_file(args):
    path, dry, rounds = args
    src = Image.open(path)
    src.load()
    allowed = M.Allowed(M.allowed_for_sheet(path))
    first, cur, sums = None, src, {"key": 0, "shade": 0, "frame": 0, "fringe": 0, "speck": 0}
    out, reverted = None, []
    for _ in range(rounds):
        o, st, changed = M.clean_image(cur, allowed)
        if first is None:
            first = st
        reverted += [list(c) for c in st["reverted"] if list(c) not in reverted]
        if not total(st):
            break
        out = cur = o
        for k in sums:
            sums[k] += st[k]
    res = {"path": path, "stats": sums, "reverted": reverted, "changed": out is not None}
    if out is not None:
        W, H = out.size
        x0, y0, x1, y1 = M.worst_cell(first, W, H)
        a = M.grey_view(src).crop((x0, y0, x1, y1))
        b = M.grey_view(out).crop((x0, y0, x1, y1))
        pair = Image.new("RGB", (a.width * 2 + 4, a.height), (0, 0, 0))
        pair.paste(a, (0, 0))
        pair.paste(b, (a.width + 4, 0))
        os.makedirs(PAIRS, exist_ok=True)
        pp = os.path.join(PAIRS, os.path.basename(path))
        pair.save(pp)
        res["pair"] = pp
        if not dry:
            M.save_like(out, src, path)
    return res


def contact_pages(results, limit, per_page=18, cols=3, k=2):
    """before | after of the worst cell, x k, 3 pairs a row (<= 2400 px wide), worst sheets first"""
    rs = sorted((r for r in results if r.get("pair")), key=lambda r: -total(r["stats"]))
    pages = []
    for n in range(0, min(len(rs), limit * per_page), per_page):
        chunk = rs[n:n + per_page]
        tiles = [Image.open(r["pair"]) for r in chunk]
        tw = max(t.width for t in tiles) * k // 2 * 2
        th = max(t.height for t in tiles) * k
        tw = min(tw, (2400 - (cols - 1) * 8) // cols)
        rows = (len(tiles) + cols - 1) // cols
        page = Image.new("RGB", (cols * tw + (cols - 1) * 8, rows * (th + 16)), (40, 40, 48))
        d = ImageDraw.Draw(page)
        for i, (t, r) in enumerate(zip(tiles, chunk)):
            t = t.resize((t.width * k, t.height * k), Image.Resampling.NEAREST)
            if t.width > tw:
                t = t.resize((tw, t.height * tw // t.width), Image.Resampling.NEAREST)
            x, y = (i % cols) * (tw + 8), (i // cols) * (th + 16)
            page.paste(t, (x, y + 16))
            d.text((x + 2, y + 2), f"{os.path.basename(r['path'])[:-4]}  before | after  ({total(r['stats'])} px)",
                   fill=(255, 255, 255))
        p = os.path.join(REPORT, f"before-after-{n // per_page + 1:02d}.png")
        page.save(p)
        pages.append(p)
    return pages


def main():
    ap = argparse.ArgumentParser(description="Remove magenta background left on final Pokémon sheets (in place).")
    ap.add_argument("sheets", nargs="*", help="sheet PNGs")
    ap.add_argument("--all", action="store_true", help="every sheet under assets/pokemon")
    ap.add_argument("--dry-run", action="store_true", help="report and write the before / after previews only")
    ap.add_argument("--include-busy", action="store_true", help="also clean species with a queued image request")
    ap.add_argument("--rounds", type=int, default=3, help="max passes per sheet (stops when nothing changes)")
    ap.add_argument("--pages", type=int, default=2, help="before / after contact pages to write (worst first)")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) // 2), help="parallel workers")
    ns = ap.parse_args()
    sheets = [os.path.abspath(p) for p in ns.sheets]
    if ns.all:
        sheets += M.all_sheets()
    if not sheets:
        ap.error("give sheet paths or --all")
    busy = set() if ns.include_busy else M.busy_slugs()
    skip = [p for p in sheets if M.slug_of(p) in busy]
    sheets = [p for p in sheets if p not in skip]
    for p in skip:
        print(f"SKIP {os.path.relpath(p, M.REPO)}: image request queued for '{M.slug_of(p)}'")
    work = [(p, ns.dry_run, ns.rounds) for p in sheets]
    if ns.jobs > 1 and len(work) > 1:
        with Pool(min(ns.jobs, len(work))) as pool:
            results = pool.map(clean_file, work, chunksize=1)
    else:
        results = [clean_file(w) for w in work]
    n = 0
    for r in results:
        if r["changed"]:
            n += 1
            st = r["stats"]
            print(f"{'WOULD FIX' if ns.dry_run else 'FIXED'} {os.path.relpath(r['path'], M.REPO)}: key {st['key']} "
                  f"shade {st['shade']} frame {st['frame']} fringe {st['fringe']} speck {st['speck']}"
                  + (f"  (guarded cells left as drawn: {r['reverted']})" if r["reverted"] else ""))
    os.makedirs(REPORT, exist_ok=True)
    json.dump([{k: v for k, v in r.items()} | {"path": os.path.relpath(r["path"], M.REPO)} for r in results],
              open(os.path.join(REPORT, "clean.json"), "w", encoding="utf-8"), indent=1)
    pages = contact_pages(results, ns.pages) if ns.pages else []
    for p in pages:
        print(f"before / after: {os.path.relpath(p, M.REPO)}")
    print(f"magenta clean: {len(sheets)} sheet(s), {n} {'would change' if ns.dry_run else 'changed'}, {len(skip)} skipped")


if __name__ == "__main__":
    main()
