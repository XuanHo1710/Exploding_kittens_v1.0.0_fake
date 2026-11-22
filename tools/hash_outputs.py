#!/usr/bin/env python3
"""Hash manifest of the repo's files, to prove that a refactor (or a regenerate) changed nothing.

  python3 tools/hash_outputs.py [--out tmp/hashes/<name>.json] [--public]
  python3 tools/hash_outputs.py --compare tmp/hashes/before.json tmp/hashes/after.json
  python3 tools/hash_outputs.py --git-pixels [--restore]

--pixels hashes a PNG by its decoded RGBA pixels + size instead of its bytes (needs Pillow), so two zlib /
Pillow builds that compress the same image differently still match.
--git-pixels checks every PNG that `git diff` lists as modified against the index (= HEAD unless staged) by pixels: "bytes-only" files
(same pixels, other compression) and "PIXELS" files (a real change); --restore checks the bytes-only ones
out again (`git checkout --`), so `git status` is left with real changes only.

Write mode: sha256 of every tracked file (`git ls-files`), plus game/public/assets/** with --public
(that folder is untracked: `npm run assets` output). Default out: tmp/hashes/<short HEAD>.json.
Compare mode: lists files added / removed / changed by path, and also matches removed+added pairs with
the same content as "moved" (so a `git mv` phase shows up as moves, not as changes). Exit 1 on any change.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def pixel_sha(path_or_file):
    from PIL import Image
    im = Image.open(path_or_file)
    h = hashlib.sha256(f"{im.size[0]}x{im.size[1]}".encode())
    h.update(im.convert("RGBA").tobytes())
    return h.hexdigest()


def git_pixels(restore):
    import io
    names = subprocess.run(["git", "diff", "--name-only", "-z"], cwd=REPO, check=True,
                           capture_output=True).stdout.decode("utf-8").split("\0")
    same, real = [], []
    for p in (n for n in names if n.lower().endswith(".png")):
        full = os.path.join(REPO, p)
        if not os.path.isfile(full):
            continue
        old = subprocess.run(["git", "show", f":{p}"], cwd=REPO, capture_output=True).stdout   # index: `git diff` is work tree vs index (works after a staged `git mv` too)
        (same if old and pixel_sha(io.BytesIO(old)) == pixel_sha(full) else real).append(p)
    for p in real:
        print(f"PIXELS     {p}")
    print(f"{len(same)} PNG bytes-only (same pixels), {len(real)} PNG with changed pixels")
    if restore and same:
        for i in range(0, len(same), 200):
            subprocess.run(["git", "checkout", "--"] + same[i:i + 200], cwd=REPO, check=True)
        print(f"restored {len(same)} bytes-only PNG")
    return 1 if real else 0


def tracked():
    out = subprocess.run(["git", "ls-files", "-z"], cwd=REPO, check=True, capture_output=True).stdout
    return [p for p in out.decode("utf-8").split("\0") if p]


def write(out, public, pixels=False):
    paths = tracked()
    if public:
        pub = os.path.join(REPO, "game", "public", "assets")
        for d, _, files in os.walk(pub):
            paths += [os.path.relpath(os.path.join(d, f), REPO) for f in files]
    files = {}
    for p in sorted(set(paths)):
        full = os.path.join(REPO, p)
        if os.path.isfile(full):                 # a tracked file deleted in the work tree is skipped
            png = pixels and p.lower().endswith(".png")
            files[p.replace(os.sep, "/")] = pixel_sha(full) if png else sha(full)
    head = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    out = out or os.path.join(REPO, "tmp", "hashes", f"{head or 'work'}.json")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w") as f:
        json.dump({"head": head, "public": public, "pixels": pixels, "files": files}, f, indent=0, sort_keys=True)
        f.write("\n")
    print(f"{len(files)} files hashed -> {os.path.relpath(out, REPO)}")


def compare(a_path, b_path):
    a = json.load(open(a_path))["files"]
    b = json.load(open(b_path))["files"]
    removed = sorted(set(a) - set(b))
    added = sorted(set(b) - set(a))
    changed = sorted(p for p in set(a) & set(b) if a[p] != b[p])
    by_hash = {}
    for p in added:
        by_hash.setdefault(b[p], []).append(p)
    moved = []
    for p in list(removed):
        dest = by_hash.get(a[p])
        if dest:
            q = dest.pop(0)
            moved.append((p, q))
            removed.remove(p)
            added.remove(q)
    for title, rows in (("changed", changed), ("removed", removed), ("added", added)):
        for p in rows:
            print(f"{title:8s} {p}")
    for p, q in moved:
        print(f"moved    {p} -> {q}")
    print(f"summary: {len(changed)} changed, {len(removed)} removed, {len(added)} added, {len(moved)} moved")
    return 1 if (changed or removed or added or moved) else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", help="manifest path (default tmp/hashes/<short HEAD>.json)")
    ap.add_argument("--public", action="store_true", help="also hash game/public/assets (untracked)")
    ap.add_argument("--pixels", action="store_true", help="hash PNGs by decoded pixels, not bytes")
    ap.add_argument("--git-pixels", action="store_true", help="check git-modified PNGs against the index by pixels")
    ap.add_argument("--restore", action="store_true", help="with --git-pixels: git checkout the bytes-only PNGs")
    ap.add_argument("--compare", nargs=2, metavar=("BEFORE", "AFTER"), help="compare two manifests")
    a = ap.parse_args()
    if a.compare:
        sys.exit(compare(*a.compare))
    if a.git_pixels:
        sys.exit(git_pixels(a.restore))
    write(a.out, a.public, a.pixels)


if __name__ == "__main__":
    main()
