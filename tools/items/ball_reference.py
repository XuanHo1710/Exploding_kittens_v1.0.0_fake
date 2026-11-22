#!/usr/bin/env python3
"""
Put the official reference image of a ball next to its sheet: assets/items/PokeBalls/<Folder>/<id>-reference.png, and record
its source in <id>-ball.json ("reference": {"file", "source"}).
  - the web reference agy found and drew from (tmp/mons-refs/ball-<id>-reference.png), with the source it reported;
  - else the official item art downloaded here: Serebii itemdex (PGL art, then SV art), then PokeAPI item art.

  python3 ball_reference.py poke [--source "serebii.net …"]
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ballkit as K  # noqa: E402
from PIL import Image  # noqa: E402


def urls(bid):
    return [f"https://www.serebii.net/itemdex/sprites/pgl/{bid}ball.png",
            f"https://www.serebii.net/itemdex/sprites/sv/{bid}ball.png",
            f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/{bid}-ball.png",
            f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/{bid}-ball.png"]


def download(url, dst):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset fetch)"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read()
    except Exception:                       # some Pythons here have no CA bundle: curl instead
        data = subprocess.run(["curl", "-sfL", "--max-time", "20", "-A", "Mozilla/5.0", url],
                              capture_output=True, check=True).stdout
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    tmp = dst + ".part"
    open(tmp, "wb").write(data)
    Image.open(tmp).convert("RGBA").save(dst)
    os.remove(tmp)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ball")
    ap.add_argument("--source", default="")
    a = ap.parse_args()
    bid = a.ball
    dst = os.path.join(K.folder(bid), f"{bid}-reference.png")
    os.makedirs(K.folder(bid), exist_ok=True)
    web = os.path.join(K.RAW_DIR, f"ball-{bid}-reference.png")
    source = ""
    if os.path.isfile(web):
        Image.open(web).convert("RGBA").save(dst)
        source = a.source or "web search by agy"
    else:
        for u in urls(bid):
            try:
                download(u, dst)
                source = u
                break
            except Exception:
                continue
    if not source:
        sys.exit(f"{bid}: no reference found")
    meta_p = os.path.splitext(K.sheet_path(bid))[0] + ".json"
    if os.path.isfile(meta_p):
        meta = json.load(open(meta_p, encoding="utf-8"))
        meta["reference"] = {"file": os.path.basename(dst), "source": source}
        json.dump(meta, open(meta_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{bid}: {os.path.relpath(dst, K.REPO)} ({source})")


if __name__ == "__main__":
    main()
