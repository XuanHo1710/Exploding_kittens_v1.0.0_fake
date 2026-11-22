"""Keep the Sodier War Pokémon list in sync with the sprite folders.

Polls Pokemon every few seconds (stdlib only, no inotify needed). Whenever a `<slug>-movement.png` or
`<slug>-posses.png` is added, replaced or removed (or pokemon_sizes.json / pokemon-locomotion.json change), it waits
until the files stop changing (so half-written PNGs are not picked up) and re-runs compare_manifest.py.
The game re-reads /assets/compare/index.json when the search box is opened and image URLs carry ?v=<mtime>, so new
sheets show up without restarting the server.

usage (repo root):  python3 tools/game/watch_manifest.py [--interval 3]
"""
import glob, os, subprocess, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DEX = os.path.join(ROOT, "assets", "units")
MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "compare_manifest.py")
interval = float(sys.argv[sys.argv.index("--interval") + 1]) if "--interval" in sys.argv else 3.0


def snapshot():
    files = glob.glob(os.path.join(DEX, "Gen*", "[0-9]*-*", "*-movement.png")) + \
            glob.glob(os.path.join(DEX, "Gen*", "[0-9]*-*", "*-posses.png")) + \
            [os.path.join(ROOT, "data", "units", "pokemon_sizes.json"), os.path.join(ROOT, "data", "units", "pokemon-locomotion.json")]
    out = {}
    for f in files:
        try:
            st = os.stat(f)
            out[f] = (st.st_mtime_ns, st.st_size)
        except OSError:
            pass
    return out


def label(path):
    return os.path.relpath(path, DEX)


def rebuild(reason):
    r = subprocess.run([sys.executable, MANIFEST], capture_output=True, text=True)
    stamp = time.strftime("%H:%M:%S")
    if r.returncode == 0:
        print(f"{stamp} manifest updated ({reason}): {r.stdout.strip()}", flush=True)
    else:
        print(f"{stamp} manifest FAILED ({reason}): {r.stderr.strip()[-400:]}", flush=True)


print(f"watching {DEX} every {interval:g}s (Ctrl+C to stop)", flush=True)
prev = snapshot()
rebuild("start")
while True:
    time.sleep(interval)
    cur = snapshot()
    if cur == prev:
        continue
    # debounce: wait until nothing changes for one more interval (copies / saves in progress)
    while True:
        time.sleep(interval)
        again = snapshot()
        if again == cur:
            break
        cur = again
    added = sorted(set(cur) - set(prev))
    removed = sorted(set(prev) - set(cur))
    changed = sorted(f for f in set(cur) & set(prev) if cur[f] != prev[f])
    parts = [f"+{label(f)}" for f in added] + [f"~{label(f)}" for f in changed] + [f"-{label(f)}" for f in removed]
    rebuild(", ".join(parts[:8]) + (f" … (+{len(parts) - 8} more)" if len(parts) > 8 else ""))
    prev = cur
