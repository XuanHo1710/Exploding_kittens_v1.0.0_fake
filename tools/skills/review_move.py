#!/usr/bin/env python3
"""
Review a move effect on the Gen-3 battle screen: apply it to Pokémon on BOTH sides (player attacks / opponent
attacks) with a big and a small Pokémon, measure every drawn layer and judge size, position and hit effect.

usage:
  python3 tools/skills/review_move.py "Eruption"
  python3 tools/skills/review_move.py earthquake --pairs typhlosion:bulbasaur,pikachu:charizard
  python3 tools/skills/review_move.py eruption --apply     # write the suggested -vfx.json
  python3 tools/skills/review_move.py hyper-beam --source code   # the beam drawn by code
output: tmp/moves/review/<identifier>/report.md, report.json, sheet.png (key frames, every scenario),
        sheet-boxes.png (same with measured boxes: green user, blue target, red cast, orange travel, yellow impact)
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # vfx.py, move_prompt.py, clip_check.py sit beside this script
import vfx  # noqa: E402
import move_prompt  # noqa: E402
import clip_check  # noqa: E402
from vfx import Image, ImageDraw  # noqa: E402

DEFAULT_PAIRS = "typhlosion:bulbasaur,pikachu:charizard"   # big -> small and small -> big
# acceptable ranges (ratio to the Pokémon the layer belongs to); mid = the value suggestions aim for
RANGES = {
    "cast_h_body": (0.8, 1.8, 1.25), "cast_h_back": (0.6, 2.4, 1.4), "cast_w_ground": (0.8, 2.4, 1.4),
    "impact_w": (0.6, 2.4, 1.3), "impact_h": (0.4, 2.2, 1.1),
}


def fit(r, lo, hi):
    """multiplier that brings ratio r just inside [lo, hi] (gentle: aims 10% inside the edge, not the middle)"""
    return round((lo * 1.1) / r if r < lo else (hi * 0.9) / r if r > hi else 1.0, 2)


def area(b):
    return max(0, b[2] - b[0]) * max(0, b[3] - b[1])


def union(boxes):
    boxes = [b for b in boxes if b]
    if not boxes:
        return None
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def coverage(sprite, layers):
    """fraction of the sprite's opaque pixels covered by the given (front) layers"""
    if not sprite or not layers:
        return 0.0
    W, H = vfx.W, vfx.H
    sm = Image.new("L", (W, H), 0); sm.paste(sprite["mask"], (sprite["x"], sprite["y"]))
    lm = Image.new("L", (W, H), 0)
    for l in layers:
        lm.paste(255, (l["x"], l["y"]), l["mask"].point(lambda v: 255 if v > 40 else 0))
    sp = sm.point(lambda v: 255 if v > 40 else 0)
    tot = sum(1 for v in sp.tobytes() if v)
    if not tot:
        return 0.0
    both = Image.composite(lm, Image.new("L", (W, H), 0), sp)
    return sum(1 for v in both.tobytes() if v) / tot


def scenario(move, attacker, target, enemy):
    log = []
    frames = vfx.animate(move, attacker, target, enemy_attacks=enemy, log=log)
    meta = log[0]["meta"]
    steps = {}
    for e in log[1:]:
        steps.setdefault(e["step"], []).append(e)
    return frames, meta, steps


def judge(move, attacker, target, enemy):
    frames, meta, steps = scenario(move, attacker, target, enemy)
    C, T0, HT, hit0 = meta["cast_steps"], meta["travel_steps"], meta["hit_steps"], meta["hit0"]
    place, arch = meta["cast_place"], meta["archetype"]
    W, H, text_top = vfx.W, vfx.H, meta["text_top"]
    res = {"attacker": attacker, "target": target, "side": "opponent attacks" if enemy else "player attacks",
           "checks": [], "metrics": {}, "suggest": {}}

    def check(name, ok, detail, level="WARN"):
        res["checks"].append({"check": name, "status": "PASS" if ok else level, "detail": detail})

    def first(step, layer):
        return next((e for e in steps.get(step, []) if e["layer"] == layer), None)

    user = first(0, "user") or next((first(s, "user") for s in steps if first(s, "user")), None)
    tgt = next((first(s, "target") for s in sorted(steps) if first(s, "target")), None)
    uh = user["box"][3] - user["box"][1]; uw = user["box"][2] - user["box"][0]
    th = tgt["box"][3] - tgt["box"][1]; tw = tgt["box"][2] - tgt["box"][0]
    res["metrics"]["user_px"] = [uw, uh]; res["metrics"]["target_px"] = [tw, th]
    check("sprite sizes", 26 <= uh <= 78 and 26 <= th <= 78, f"user {uw}x{uh}px, target {tw}x{th}px (Gen 3 box: 28-74)")

    # --- 1. CAST (image 1) on the user
    cast = [e for s in range(C) for e in steps.get(s, []) if e["layer"] == "cast"]
    if C and cast:
        peak = max(cast, key=lambda e: area(e["box"]))["box"]
        ub = user["box"]
        ch, cw = peak[3] - peak[1], peak[2] - peak[0]
        res["metrics"]["cast_peak_box"] = peak
        if place == "ground":
            lo, hi, mid = RANGES["cast_w_ground"]; r = cw / uw
            check("cast size (ground: width / user width)", lo <= r <= hi, f"{r:.2f} (ok {lo}-{hi})")
            if not lo <= r <= hi:
                res["suggest"].setdefault("cast", {})["scale"] = fit(r, lo, hi)
            bot = max(e["box"][3] for e in cast); d = bot - ub[3]
            check("cast position (ground: drawing's base at the feet)", abs(d) <= max(5, 0.12 * uh),
                  f"base {d:+d}px from the feet (ok ±{max(5, int(0.12 * uh))})")
            if abs(d) > max(5, 0.12 * uh):
                res["suggest"].setdefault("cast", {})["y"] = -d / uh
            check("cast stays low", peak[1] >= ub[1] - 0.2 * uh, f"top {peak[1] - ub[1]:+d}px vs the head")
        else:
            key = "cast_h_back" if place == "back" else "cast_h_body"
            lo, hi, mid = RANGES[key]; r = ch / uh
            screen_limited = place == "back" and peak[1] <= 3     # shrunk to fit (min 60%) / running off the top
            if screen_limited:
                check(f"cast size ({place}: height / user height)", True,
                      f"{r:.2f} - limited by the top of the screen (only {ub[1]}px above the head), shrunk to fit", "INFO")
                res["checks"][-1]["status"] = "INFO"
            else:
                check(f"cast size ({place}: height / user height)", lo <= r <= hi, f"{r:.2f} (ok {lo}-{hi})")
                if not lo <= r <= hi:
                    res["suggest"].setdefault("cast", {})["scale"] = fit(r, lo, hi)
            if place == "back":
                check("cast rises above the head", screen_limited or peak[1] <= ub[1] - 0.1 * uh,
                      f"top {peak[1] - ub[1]:+d}px vs the head (want <= {-int(0.1 * uh)})" + (" - screen top" if screen_limited else ""))
                bot = max(e["box"][3] for e in cast)
                view = "front" if enemy else "back"
                em = vfx.anchor_xy(attacker, view, vfx.move_from(move), vfx.battle_sprite(attacker, view), meta["user_feet"])
                if em:   # the drawing's base must sit on the body part it comes out of (vent / back anchor)
                    d = bot - em[1]
                    tol = max(4, 0.12 * uh)
                    check(f"cast comes out of its {vfx.move_from(move)} anchor", abs(d) <= tol,
                          f"base {d:+.0f}px from the anchor (ok ±{tol:.0f}), drawn {'in front' if em[2] else 'behind'}")
                    if abs(d) > tol:
                        res["suggest"].setdefault("cast", {})["y"] = -d / uh
                else:
                    ok = ub[1] + 0.2 * uh <= bot <= ub[3] + 2
                    check("cast base hidden behind the body (no anchor)", ok, f"base at {(ub[3] - bot) / uh:.0%} of the body above the feet")
                    if not ok:
                        want = ub[3] - vfx.BACK_BASE * uh
                        res["suggest"].setdefault("cast", {})["y"] = (want - bot) / uh
            elif arch in vfx.LINE_ARCHS:   # a beam's charge sits in front of the mouth, outside the user (checked below)
                pass
            else:
                cx, cy = (peak[0] + peak[2]) / 2, (peak[1] + peak[3]) / 2
                ux, uy = (ub[0] + ub[2]) / 2, (ub[1] + ub[3]) / 2
                d = ((cx - ux) ** 2 + (cy - uy) ** 2) ** 0.5
                check("cast centred on the body", d <= 0.35 * uh, f"{d:.0f}px off the body centre (ok <= {0.35 * uh:.0f})")
                if d > 0.35 * uh:
                    res["suggest"].setdefault("cast", {}).update({"x": (ux - cx) / uh, "y": (uy - cy) / uh})
        front = [e for e in cast if not e["behind"]]
        if place == "back":   # an eruption out of a visible vent may cover the body: only warn when it is nearly hidden
            front = []
        cov = max((coverage(first(s, "user"), [e for e in front if e["step"] == s]) for s in range(C)), default=0)
        res["metrics"]["user_covered_max"] = round(cov, 2)
        check("user stays visible during the cast", cov <= 0.6, f"at most {cov:.0%} of the user covered (ok <= 60%)")
    elif C:
        check("cast image present", False, "no cast layer drawn", "FAIL")

    # --- 2. TRAVEL
    if arch in vfx.SPLIT and HT:
        tr = [e for s in range(C, hit0) for e in steps.get(s, []) if e["layer"] == "effect"]
        if tr:
            s0, s1 = min(e["step"] for e in tr), max(e["step"] for e in tr)
            b0 = union([e["box"] for e in tr if e["step"] == s0]); b1 = union([e["box"] for e in tr if e["step"] == s1])
            tb = tgt["box"]
            end_ok = b1[0] - 8 <= (tb[0] + tb[2]) / 2 <= b1[2] + 8 or b1[1] - 8 <= (tb[1] + tb[3]) / 2 <= b1[3] + 8
            check("travel ends on the target", end_ok, f"last travel box {b1}, target {tb}")
            peak = max((e["box"] for e in tr), key=area)
            r = (peak[3] - peak[1]) / ((uh + th) / 2)
            check("travel size", 0.15 <= r <= 2.2, f"{r:.2f} x the Pokémon height (ok 0.15-2.2)")
            if not 0.15 <= r <= 2.2:
                res["suggest"].setdefault("effect", {})["scale"] = fit(r, 0.15, 2.2)

    # --- 2b. straight-line moves start IN FRONT of the mouth: the charge and the beam never cover the user
    # (decisions.md §12, user rule 2026-11-19; the flare / charge may touch the user's edge)
    if arch in vfx.LINE_ARCHS and HT:
        cov, at_ = 0.0, None
        for s in range(0, hit0 + 22):
            u = first(s, "user")
            c_ = coverage(u, [e for e in steps.get(s, []) if e["layer"] in ("cast", "effect") and not e["behind"]])
            if c_ > cov:
                cov, at_ = c_, s
        res["metrics"]["user_covered_by_beam"] = round(cov, 3)
        check("beam starts in front of the user (does not cover it)", cov <= 0.08,
              f"at most {cov:.1%} of the user covered by the charge / beam" + (f" (step {at_})" if at_ is not None else "")
              + " (ok <= 8%: the flare may touch the edge)")

    # --- 3. IMPACT on the target
    imp = [e for s in range(hit0, hit0 + HT) for e in steps.get(s, []) if e["layer"] == "impact"]
    if HT and imp:
        peak = max(imp, key=lambda e: area(e["box"]))["box"]; tb = tgt["box"]
        rw, rh = (peak[2] - peak[0]) / tw, (peak[3] - peak[1]) / th
        res["metrics"]["impact_peak_box"] = peak
        lo, hi, mid = RANGES["impact_w"]
        check("impact width / target width", lo <= rw <= hi, f"{rw:.2f} (ok {lo}-{hi})")
        lo2, hi2, mid2 = RANGES["impact_h"]
        check("impact height / target height", lo2 <= rh <= hi2, f"{rh:.2f} (ok {lo2}-{hi2})")
        if not (lo <= rw <= hi and lo2 <= rh <= hi2):
            res["suggest"].setdefault("effect", {}).update({"w": fit(rw, lo, hi), "h": fit(rh, lo2, hi2)})
        cx = (peak[0] + peak[2]) / 2
        check("impact centred on the target (x)", abs(cx - (tb[0] + tb[2]) / 2) <= 0.3 * tw,
              f"{cx - (tb[0] + tb[2]) / 2:+.0f}px")
        if arch in ("quake", "fall"):
            bot = max(e["box"][3] for e in imp); d = bot - tb[3]
            check("impact on the ground (base at the target's feet)", abs(d) <= max(6, 0.15 * th), f"base {d:+d}px from the feet")
            if abs(d) > max(6, 0.15 * th):
                res["suggest"].setdefault("effect", {})["y"] = -d / th
        else:
            cy = (peak[1] + peak[3]) / 2
            check("impact on the body (y)", tb[1] - 0.2 * th <= cy <= tb[3], f"centre {cy - (tb[1] + tb[3]) / 2:+.0f}px from the body centre")
        hidden = 0
        for s in range(hit0, hit0 + HT):
            t = first(s, "target")
            if t and coverage(t, [e for e in steps.get(s, []) if e["layer"] == "impact" and not e["behind"]]) > 0.85:
                hidden += 1
        check("target not hidden by the impact", hidden <= 6, f"{hidden} steps with > 85% of the target covered (ok <= 6, 0.2 s)")
    elif HT:
        check("impact present", False, "no impact layer drawn", "FAIL")

    # --- 4. screen bounds
    out = []
    info_top = False
    for s, es in steps.items():
        for e in es:
            if e["layer"] in ("user", "target", "field"):
                continue
            b = e["box"]
            if e["layer"] == "effect" and arch == "fall":
                continue                                  # falling from the sky: entering from the top is intended
            if b[1] < -4 and e["layer"] == "cast" and place == "back" and b[0] >= -6 and b[2] <= W + 6:
                info_top = True                           # an eruption running off the top: allowed (INFO)
            elif b[1] < -4 or b[0] < -6 or b[2] > W + 6:
                out.append(f"{e['layer']}@{s} off screen {b}")
            elif b[3] > text_top + 6 and e["layer"] in ("cast", "impact"):
                out.append(f"{e['layer']}@{s} under the text box (bottom {b[3]} > {text_top})")
    check("stays on screen", not out, "; ".join(sorted(set(out))[:4]) or "ok")
    if info_top:
        res["checks"].append({"check": "cast runs off the top of the screen", "status": "INFO",
                              "detail": "the opponent stands high; the eruption is shrunk to 60% and its top is cut"})
    res["frames"], res["meta"], res["steps"] = frames, meta, steps
    return res


def key_steps(meta):
    C, T, HT, h0 = meta["cast_steps"], meta["travel_steps"], meta["hit_steps"], meta["hit0"]
    if not HT:
        return [("aura 1/4", T // 4), ("aura 1/2", T // 2), ("aura 3/4", 3 * T // 4), ("end", T - 1)]
    return [("cast", C // 2), ("cast end", C - 2), ("travel", C + T // 2), ("hit", h0 + 2), ("hit peak", h0 + 6), ("after", h0 + HT - 2)]


def frame_of(step, meta):
    return step if step <= meta["hit0"] or not meta["hit_steps"] else step + 3   # 3 hit-stop copies after hit0


def sheets(results, out_dir):
    S = 2
    cols = max(len(key_steps(r["meta"])) for r in results)
    cw, chh = vfx.W * S, vfx.H * S
    for boxes in (False, True):
        sheet = Image.new("RGB", (cols * cw, len(results) * (chh + 18)), (32, 32, 40))
        d = ImageDraw.Draw(sheet)
        for r_i, r in enumerate(results):
            y0 = r_i * (chh + 18)
            d.text((4, y0 + 3), f"{r['attacker']} -> {r['target']} ({r['side']})", fill=(255, 255, 255))
            for c_i, (lab, st) in enumerate(key_steps(r["meta"])):
                fr = r["frames"][min(len(r["frames"]) - 1, frame_of(st, r["meta"]))].convert("RGB")
                if boxes:
                    dd = ImageDraw.Draw(fr)
                    colours = {"user": (0, 200, 0), "target": (40, 90, 255), "cast": (230, 30, 30),
                               "effect": (255, 140, 0), "impact": (240, 220, 0), "aura": (230, 30, 30)}
                    for e in r["steps"].get(st, []):
                        if e["layer"] in colours:
                            dd.rectangle(e["box"], outline=colours[e["layer"]])
                big = fr.resize((cw, chh), Image.NEAREST)
                ImageDraw.Draw(big).text((4, 4), f"{lab} (step {st})", fill=(200, 0, 0))
                sheet.paste(big, (c_i * cw, y0 + 18))
        p = os.path.join(out_dir, "sheet-boxes.png" if boxes else "sheet.png")
        sheet.save(p)


def merge_suggestions(results, current):
    """average the per-scenario suggestions, multiply onto the current tweak values"""
    out = json.loads(json.dumps(current))
    for part in ("cast", "effect"):
        for k in ("scale", "w", "h"):
            vals = [r["suggest"].get(part, {}).get(k) for r in results if r["suggest"].get(part, {}).get(k)]
            if vals:
                out[part][k] = round(current[part][k] * sum(vals) / len(vals), 2)
        for k in ("x", "y"):
            vals = [r["suggest"].get(part, {}).get(k) for r in results if r["suggest"].get(part, {}).get(k) is not None]
            if vals:
                out[part][k] = round(current[part][k] + sum(vals) / len(vals), 2)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("move", nargs="+")
    ap.add_argument("--pairs", default=DEFAULT_PAIRS, help="attacker:target,... each played from both sides")
    ap.add_argument("--apply", action="store_true", help="write the suggested <identifier>-vfx.json")
    ap.add_argument("--source", choices=vfx.SOURCES, default=None,
                    help="effect source: default (the official images in assets/skills/<Gen>/), fallback (every image of the Fallback library) or code (beams.py beams)")
    a = ap.parse_args()
    if a.source:                      # every vfx call below reads it (vfx.vfx_source falls back to the env)
        os.environ["MONS_VFX_SOURCE"] = a.source
    m = move_prompt.find(" ".join(a.move))
    if not m:
        sys.exit(f"move '{' '.join(a.move)}' not found")
    out_dir = os.path.join(vfx.REPO, "tmp", "moves", "review", m["identifier"])
    os.makedirs(out_dir, exist_ok=True)
    results = []
    for pair in a.pairs.split(","):
        att, tgt = pair.split(":")
        results.append(judge(m, att, tgt, False))     # attacker bottom-left (seen from behind)
        results.append(judge(m, att, tgt, True))      # attacker top-right (seen from the front)
    sheets(results, out_dir)
    cur = vfx.move_tweaks(m)
    sug = merge_suggestions(results, cur)
    org = vfx.strip_origins(m)     # the official image in assets/skills/<Gen>/ (or a code beam) -> procedural
    label = {"official": "OFFICIAL", "fallback": "FALLBACK (comparison)", "procedural": "PROCEDURAL", "code": "CODE (beams.py)"}
    # the 2 images themselves: never cut at the cell edge (decisions.md §12, 2026-11-19: inside the box, or a bigger box)
    strip_checks = []
    for kind, frames in zip(vfx.KINDS, vfx.move_strips(m)):
        cuts = clip_check.strip_cuts(frames, m["vfx"]["archetype"], kind)
        where = f"{label[org[kind]]} {kind}, {frames[0].height} px cells"
        strip_checks.append({"check": f"{kind} image not cut at the cell edge", "status": "FAIL" if cuts else "PASS",
                             "detail": f"{where}: " + (clip_check.describe(cuts) + " -> fit it in the cell or grow the cell"
                                                       " (official: fix the source and re-run apply_official.py, or re-normalize; Fallback: re-run fallback_vfx.py)" if cuts else "ok")})
        edges = [(i, max(e, key=lambda t: t[2])) for i, f in enumerate(frames)
                 for e in [clip_check.straight_edges(f, i, m["vfx"]["archetype"], kind)] if e]
        if edges:
            strip_checks.append({"check": f"{kind} image: straight edges inside the cell (look)", "status": "INFO",
                                 "detail": ", ".join(f"f{i + 1} {sd} {n}px" for i, (sd, _, n) in edges[:6]) +
                                 " - a draft cut before normalizing, or a flat base by design"})
    n_warn = sum(1 for r in results for c in r["checks"] if c["status"] in ("WARN", "FAIL")) + \
        sum(1 for c in strip_checks if c["status"] == "FAIL")
    lines = [f"# Review: {m['name']} ({m['type']} {m['class']}, archetype `{m['vfx']['archetype']}`, cast `{m['vfx'].get('cast', 'body')}`)", "",
             f"Images: cast {label[org['cast']]}, effect {label[org['effect']]} · "
             f"verdict: **{'PASS' if not n_warn else f'{n_warn} warning(s)'}**", "",
             "Sheets: `sheet.png` (key frames), `sheet-boxes.png` (green user, blue target, red cast, orange travel, yellow impact).", ""]
    lines += ["## The 2 images", "", "| check | status | detail |", "|---|---|---|"]
    lines += [f"| {c['check']} | {c['status']} | {c['detail']} |" for c in strip_checks]
    lines.append("")
    for r in results:
        lines += [f"## {r['attacker']} → {r['target']} ({r['side']})", "", "| check | status | detail |", "|---|---|---|"]
        lines += [f"| {c['check']} | {c['status']} | {c['detail']} |" for c in r["checks"]]
        lines.append("")
    lines += ["## Tuning", "", f"current `{m['identifier']}-vfx.json`: `{json.dumps(cur)}`", "",
              f"suggested: `{json.dumps(sug)}`" if sug != cur else "no change suggested", ""]
    lines += ["## Visual checklist (look at sheet.png, answer each)", "",
              "1. Does it look like the move (shape, colour, motion) on both sides?",
              "2. Image 1 starts from the right place (body / back / ground) and does not hide the user's face?",
              "3. The travel goes from the user to the target, the right way round when the opponent attacks?",
              "4. The impact is readable, sized to the target, not hiding it for long?",
              "5. Big and small Pokémon both look right (no tiny effect on a huge Pokémon, no huge one on a tiny one)?",
              "6. Gen-3 look: pixel art, outline, no blur, no stray lines or magenta edges?", ""]
    open(os.path.join(out_dir, "report.md"), "w", encoding="utf-8").write("\n".join(lines))
    json.dump({"move": m["identifier"], "warnings": n_warn, "current": cur, "suggested": sug, "strips": strip_checks,
               "scenarios": [{k: v for k, v in r.items() if k not in ("frames", "meta", "steps")} for r in results]},
              open(os.path.join(out_dir, "report.json"), "w"), indent=1, default=str)
    if a.apply and sug != cur:
        # each image's tuning lives next to its strip: the official one in assets/skills/<Gen>/ (apply_official.py keeps it while
        # the image's source stays the same), a Fallback image's (comparison view) in assets/skills/Fallback/
        for folder, kinds in ((vfx.move_dir(m), [k for k in sug if org.get(k) not in ("fallback", "code")]),
                              (vfx.fallback_dir(m), [k for k in sug if org.get(k) == "fallback"])):
            if not kinds or all(sug[k] == cur[k] for k in kinds):
                continue
            p = os.path.join(folder, f"{m['identifier']}-vfx.json")
            old = json.load(open(p, encoding="utf-8")) if os.path.isfile(p) else {}
            old.update({k: sug[k] for k in kinds})
            json.dump(old, open(p, "w"), indent=2)
            print("applied ->", os.path.relpath(p, vfx.REPO))
    print("\n".join(l for l in lines if l.startswith(("#", "|", "Images", "current", "suggested", "no change"))))
    print("\nfiles:", os.path.relpath(out_dir, vfx.REPO) + "/{report.md, sheet.png, sheet-boxes.png}")


if __name__ == "__main__":
    main()
