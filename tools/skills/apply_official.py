#!/usr/bin/env python3
"""
Write the official move images into assets/skills/<GenX-Region>/<English Name>/ (decisions.md §12, 2026-11-19).

  python3 tools/skills/apply_official.py              # every game move + every chosen move
  python3 tools/skills/apply_official.py --move tackle --move ember
  python3 tools/skills/apply_official.py --dry-run    # only print the plan

assets/skills/<Gen>/<Name>/ is the ONE main source of move effects (user 2026-11-19: "chỉ giữ 1 nguồn chính trong thư mục
Skills ... ignore thư mục fallback", "không cần agy nữa"). Per move (vfx.official_plan):
- the user's explicit choice in data/battle/move-vfx-official.json ("fallback", "agy", "code") wins at the move
  level, except that a usable Fallback version of the move's own beats a choice of agy (user 2026-11-20: every upstream
  move effect is official; the generic move effect does not beat an explicit agy choice, e.g. Dig; a damaging move with no upstream effect of its own gets the upstream generic type impact, recorded as
  "fallback-generic"); with no choice the default rule picks: a code beam (beams.py) -> the Fallback version when it is usable ->
  agy's old drawing -> procedural;
- per image (cast / effect separately) nothing is ever empty: an image the chosen source does not have (missing,
  blank, or marked false in assets/skills/Fallback/approved.json) is taken from the next source, fallback -> agy -> procedural
  (choice agy: agy -> fallback -> procedural).
What is written: <id>-cast.png, <id>-effect.png (copied from assets/skills/Fallback/ or agy's drawing, or the procedural strip
rendered to PNG; a travelling move's Fallback effect whose 4 travel frames are empty gets agy's old travel frames
or the procedural ones, recorded as "effect_travel": "agy" / "procedural") and a merged <id>-vfx.json ({"cast": tuning of the cast's source, "effect": ...}); for a code beam an
<id>-code.json marker and no strips. <id>-prompt.md and other files stay. Before an agy drawing (or agy's -vfx.json) is
overwritten or removed it is copied to tmp/history/skills-agy-<date>/<Gen>/<Name>/ (agy's images are also in git
history). Where each image came from is recorded in data/battle/move-vfx-sources.json, and the official images
derived from the upstream particle effects (MPL-2.0, THIRD_PARTY_NOTICES.md) are listed in assets/skills/LICENSE-Fallback.md.
Moves applied: every move the game uses (game/public/assets/data/moves.json, built by `npm run assets` in game/) plus
every move with an explicit choice; the folders of other moves are left as they are.
"""
import argparse
import datetime
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfx  # noqa: E402
from vfx import Image  # noqa: E402

REPO = vfx.REPO
MOVES = os.path.join(REPO, "data", "battle", "moves.json")
GAME_MOVES = os.path.join(REPO, "game", "public", "assets", "data", "moves.json")
LICENSE = os.path.join(REPO, "assets", "skills", "LICENSE-Fallback.md")
NAMES = {"fallback": "Fallback", "agy": "agy", "procedural": "procedural", "code": "code"}


def all_moves():
    return {m["identifier"]: m for m in json.load(open(MOVES, encoding="utf-8"))["moves"]}


def game_moves():
    """identifiers of the moves the game uses (game/tools/build_assets.py output)"""
    if not os.path.isfile(GAME_MOVES):
        raise SystemExit(f"{os.path.relpath(GAME_MOVES, REPO)} is missing: run `npm run assets` in game/ first")
    return set(json.load(open(GAME_MOVES, encoding="utf-8")))


def targets(allm):
    return sorted(i for i in game_moves() | set(vfx.official_choices()) if i in allm)


def join(frames):
    c = frames[0].height
    im = Image.new("RGBA", (c * len(frames), c), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        im.alpha_composite(f, (i * c, 0))
    return im


def _write_png(im, path):
    tmp = path + ".tmp.png"
    im.save(tmp, optimize=True)
    os.replace(tmp, path)


def _copy(src, dst):
    if os.path.realpath(src) == os.path.realpath(dst):
        return
    tmp = dst + ".tmp"
    shutil.copyfile(src, tmp)
    os.replace(tmp, dst)


def _write_json(obj, path):
    tmp = path + ".tmp"
    json.dump(obj, open(tmp, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    open(tmp, "a", encoding="utf-8").write("\n")
    os.replace(tmp, path)


def backup_dir(today):
    return os.path.join(vfx.HISTORY, f"skills-agy-{today}")


def backup_agy(m, today, log):
    """copy agy's drawings / tuning of the move that are still in assets/skills/<Gen>/ to tmp/history/skills-agy-<date>/
    (once: a file that already has a backup is not copied again)"""
    rec = vfx.applied_sources().get(m["identifier"])
    d = vfx.move_dir(m)
    rel = os.path.join(m["gen"], vfx.move_folder(m))
    for name in (f"{m['identifier']}-cast.png", f"{m['identifier']}-effect.png", f"{m['identifier']}-vfx.json"):
        p = os.path.join(d, name)
        if not os.path.isfile(p):
            continue
        kind = next((k for k in vfx.KINDS if name.endswith(f"-{k}.png")), None)
        agy = rec is None or (kind is not None and rec.get(kind) == "agy")
        if not agy or vfx.agy_original(m, name) != p:      # not agy's, or already backed up
            continue
        dst = os.path.join(backup_dir(today), rel, name)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(p, dst)
        log.append(os.path.relpath(dst, REPO))


def tuning(m, lib):
    """the -vfx.json of an image's source: the Fallback library's, or agy's (also for procedural images)"""
    p = (os.path.join(vfx.fallback_dir(m), f"{m['identifier']}-vfx.json") if lib == "fallback"
         else vfx.agy_original(m, f"{m['identifier']}-vfx.json"))
    if not p or not os.path.isfile(p):
        return {}
    try:
        return json.load(open(p, encoding="utf-8"))
    except ValueError as e:
        raise SystemExit(f"bad JSON in {p}: {e}")


def apply_move(m, today, backups, dry=False):
    """write one move's official folder; returns its record for move-vfx-sources.json"""
    mid = m["identifier"]
    plan = vfx.official_plan(m)
    d = vfx.move_dir(m)
    rel = os.path.join(m["gen"], vfx.move_folder(m)).replace(os.sep, "/")
    rec = {"name": m["name"], "folder": f"assets/skills/{rel}", "source": plan["source"], "explicit": plan["explicit"],
           "default": plan["default"], "cast": plan["cast"], "effect": plan["effect"]}
    if plan["why"]:
        rec["filled"] = plan["why"]
    if dry:
        return label_generic(m, rec)
    os.makedirs(d, exist_ok=True)
    # tuning per image: the current official one while the image keeps its source (keeps review_move.py --apply
    # tweaks), else the -vfx.json of the image's new source; read before anything is replaced
    old_rec = vfx.applied_sources().get(mid) or {}
    cur = {}
    if old_rec and os.path.isfile(os.path.join(d, f"{mid}-vfx.json")):
        cur = json.load(open(os.path.join(d, f"{mid}-vfx.json"), encoding="utf-8"))
    tune = {k: (cur if old_rec.get(k) == plan[k] and isinstance(cur.get(k), dict) else tuning(m, plan[k]))
            for k in vfx.KINDS if plan[k] != "code"}
    srcs = {k: vfx.lib_path(m, k, plan[k]) for k in vfx.KINDS if plan[k] in ("fallback", "agy")}
    backup_agy(m, today, backups)
    srcs = {k: vfx.lib_path(m, k, plan[k]) for k in srcs}                     # agy: now the backup copy
    files = []
    strips = {k: os.path.join(d, f"{mid}-{k}.png") for k in vfx.KINDS}
    vj, marker = os.path.join(d, f"{mid}-vfx.json"), vfx.code_marker(m)
    if plan["source"] == "code":
        st = vfx._beams().STYLES.get(mid, {})
        _write_json({"move": mid, "source": "code", "renderer": "tools/skills/beams.py",
                     "style": {k: v for k, v in st.items() if k in ("detail", "charge", "half", "twin", "rainbow")},
                     "note": "drawn by code on the battle screen (charge orb at the mouth, one continuous beam to the "
                             "target's body anchor, burst); no strips"}, marker)
        files.append(os.path.basename(marker))
        for p in list(strips.values()) + [vj]:
            if os.path.isfile(p):
                os.remove(p)
    else:
        for k in vfx.KINDS:
            if plan[k] == "procedural":
                _write_png(join((vfx.proc_cast if k == "cast" else vfx.proc_effect)(m)), strips[k])
            elif k == "effect" and plan[k] == "fallback" and travel_blank(m, srcs[k]):
                sc = (tune.get(k, {}).get(k) or {}).get("scale", 1.0)
                strip, by = fill_travel(m, srcs[k], sc)
                _write_png(strip, strips[k])
                rec["effect_travel"] = by
            else:
                _copy(srcs[k], strips[k])
            files.append(os.path.basename(strips[k]))
        merged = {k: tune[k][k] for k in vfx.KINDS if isinstance(tune.get(k, {}).get(k), dict)}
        if merged:
            _write_json(merged, vj)
            files.append(os.path.basename(vj))
        elif os.path.isfile(vj):
            os.remove(vj)
        if os.path.isfile(marker):
            os.remove(marker)
    rec["files"] = files
    return label_generic(m, rec)


def label_generic(m, rec):
    """a Fallback version converted from the upstream generic_move (type impact + hit; every damaging move without an
    effect of its own, user 2026-11-20) is recorded as "fallback-generic" """
    if vfx.is_generic(m):
        for f in ("source", "default", "cast", "effect"):
            if rec.get(f) == "fallback":
                rec[f] = vfx.GENERIC_LABEL
    return rec


def travel_blank(m, path):
    """a travelling move's (vfx.SPLIT) Fallback effect strip whose 4 travel frames are (almost) empty while its impact
    is not: the upstream effect shows nothing between the two Pokémon (Hidden Power, Pyro Ball, the generic impact)"""
    if m["vfx"]["archetype"] not in vfx.SPLIT:
        return False
    im = Image.open(path).convert("RGBA")
    c = im.height
    if im.width // c < 8:
        return False
    px = [sum(1 for v in im.crop((i * c, 0, (i + 1) * c, c)).getchannel("A").tobytes() if v) for i in range(8)]
    lim = 64 if vfx.is_generic(m) else 1                # the generic impact: a few stray specks count as empty
    return max(px[:4]) < lim and max(px[4:]) >= lim


def fill_travel(m, path, scale):
    """(that strip with its empty travel frames filled, where they came from): agy's old drawing of the move's travel
    when there is one, else the procedural strip (nothing on screen is ever blank); shrunk by the strip's -vfx.json
    scale so they keep their own size, centred in the strip's cell"""
    im = Image.open(path).convert("RGBA")
    c = im.height
    agy = vfx.lib_path(m, "effect", "agy")              # agy's old drawing of the travel (Surf's wave) when there is one
    src = vfx.load_strip(agy) if agy and os.path.isfile(agy) and not vfx.is_blank(agy) else None
    proc = src if src and len(src) >= 8 else vfx.proc_effect(m)
    for i in range(4):
        f = proc[i]
        k = min(1.0, c / f.height) / max(0.1, scale)
        if k != 1.0:
            f = f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.NEAREST)
        cell = Image.new("RGBA", (c, c), (0, 0, 0, 0))
        cell.alpha_composite(f, ((c - f.width) // 2, (c - f.height) // 2))
        im.paste(cell, (i * c, 0))
    return im, "agy" if proc is src else "procedural"


def counts(recs):
    by_move, by_image, filled = {}, {}, 0
    for r in recs.values():
        key = r["source"] if r["explicit"] else f"default→{r['source']}"
        by_move[key] = by_move.get(key, 0) + 1
        for k in vfx.KINDS:
            by_image[r[k]] = by_image.get(r[k], 0) + 1
        filled += len(r.get("filled", {}))
    return {"moves": len(recs), "by_move": dict(sorted(by_move.items())), "by_image": dict(sorted(by_image.items())),
            "filled_images": filled}


def write_license(recs):
    rows = [(r["folder"], mid, [k for k in vfx.KINDS if r[k] in ("fallback", vfx.GENERIC_LABEL)])
            for mid, r in sorted(recs.items())]
    rows = [x for x in rows if x[2]]
    lines = ["# Official move images derived from upstream particle effects (MPL-2.0)", "",
             "Written by `tools/skills/apply_official.py` (decisions.md §12, 2026-11-19).",
             "The images below were converted from the upstream project's move particle effects by `fallback_vfx.py`",
             "(`tools/skills/`; our own re-implementation of its Bedrock particle files, Gen 3",
             "camera and palette) and copied into the official move folders; the moves without an effect of their own use",
             "its generic move effect (the type impact + hit on the target, \"fallback-generic\" in the record). The upstream assets are licensed under the",
             "Mozilla Public License 2.0: project, commit and copyright notice in",
             "[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md), licence text in",
             "[`LICENSES/MPL-2.0.txt`](../../LICENSES/MPL-2.0.txt). Every other official image is our own",
             "(agy's drawings, procedural strips, code-drawn beams). The full record per image is",
             "`data/battle/move-vfx-sources.json`.", "",
             f"{len(rows)} moves, {sum(len(x[2]) for x in rows)} images:", "", "| Folder | Images |", "|---|---|"]
    lines += [f"| `{f}/` | " + ", ".join(f"`{mid}-{k}.png`" for k in ks) + " |" for f, mid, ks in rows]
    open(LICENSE, "w", encoding="utf-8").write("\n".join(lines) + "\n")


def apply(ids=None, dry=False):
    """apply the given moves (default: every game move + every chosen move); returns the summary"""
    allm = all_moves()
    ids = targets(allm) if ids is None else [i for i in ids if i in allm]
    today = datetime.date.today().isoformat()
    backups = []
    new = {i: apply_move(allm[i], today, backups, dry) for i in ids}
    data = json.load(open(vfx.OFFICIAL_SOURCES, encoding="utf-8")) if os.path.isfile(vfx.OFFICIAL_SOURCES) else {}
    recs = dict(data.get("moves") or {})
    recs.update(new)
    summary = counts(new)
    if not dry:
        when = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
        out = {"_about": "where each official move image in assets/skills/<GenX-Region>/<Name>/ came from (apply_official.py, "
                         "decisions.md §12 2026-11-19); cast / effect = fallback | agy | procedural | code; filled = "
                         "images taken from the next source because the chosen one has none (missing / blank / denied)",
               "_updated": when, "_counts": counts(recs), "moves": dict(sorted(recs.items()))}
        _write_json(out, vfx.OFFICIAL_SOURCES)
        write_license(recs)
        summary["updated"] = when
    summary["backups"] = len(backups)
    summary["backup_dir"] = os.path.relpath(backup_dir(today), REPO)
    summary["applied"] = new
    return summary


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--move", action="append", help="apply only these move identifiers (repeatable)")
    ap.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    a = ap.parse_args()
    s = apply(a.move, a.dry_run)
    for mid, r in s["applied"].items():
        fill = "".join(f"  {k}: {r[k]} ({NAMES.get(r['source'], r['source'])} {why})" for k, why in r.get("filled", {}).items())
        print(f"{mid:22s} {'' if r['explicit'] else 'default→'}{r['source']:10s} cast={r['cast']:10s} effect={r['effect']:10s}{fill}")
    print(json.dumps({k: v for k, v in s.items() if k != "applied"}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
