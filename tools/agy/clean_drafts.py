#!/usr/bin/env python3
"""
Delete the draft files of a species once its agy session is finished (the final sheets live in assets/pokemon/...):
  tmp/prompts/<slug>-*      prompt packs, pose guides, style examples, design-lock / keep images
  tmp/raw/<slug>-*          raw generated images kept for review
  tmp/anchors/<slug>.png    anchor check image
  /tmp/mons-refs/<slug>-*   raw drafts and normalized loops (agy's own /tmp; works when agy runs it)
Kept: assets/pokemon/... (movement, battle and <slug>-reference.jpg), tmp/agy-requests/ (small logs of fix requests).
Before deleting, the reference artwork is copied into the species folder when it is not there yet.
Refuses while an agy run for that species is still going (it may still need its drafts).

usage: python3 tools/agy/clean_drafts.py <slug> [<slug> ...] [--dry-run]
"""
import glob
import os
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))


def busy(slug):
    try:
        out = subprocess.run(["pgrep", "-af", "agy"], capture_output=True, text=True).stdout
    except OSError:
        return False
    name = slug.replace("-", "")
    return any(("agy -p" in l or "agy_pack" in l or "battle_pack" in l) and name in l.lower().replace("-", "")
               for l in out.splitlines() if "pgrep" not in l and "clean_drafts" not in l)


def main():
    slugs = [a.lower() for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not slugs:
        sys.exit(__doc__)
    for slug in slugs:
        if busy(slug):
            print(f"SKIP {slug}: an agy run for it is still going")
            continue
        # keep the reference artwork next to the sheets before removing the temp copies
        folders = glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{slug}-movement.png"))
        if folders:
            keep = os.path.join(os.path.dirname(folders[0]), f"{slug}-reference.jpg")
            tmp_ref = os.path.join("/tmp", "mons-refs", f"{slug}-reference.jpg")
            if not os.path.isfile(keep) and os.path.isfile(tmp_ref) and not dry:
                import shutil
                shutil.copy(tmp_ref, keep)
        files = (glob.glob(os.path.join(REPO, "tmp", "prompts", f"{slug}-*")) +
                 glob.glob(os.path.join(REPO, "tmp", "raw", f"{slug}-*")) +
                 glob.glob(os.path.join(REPO, "tmp", "anchors", f"{slug}.png")) +
                 glob.glob(os.path.join("/tmp", "mons-refs", f"{slug}-*")))
        size = 0
        for f in files:
            try:
                size += os.path.getsize(f)
                if not dry:
                    os.remove(f)
            except OSError:
                pass
        print(f"{'WOULD DELETE' if dry else 'CLEANED'} {slug}: {len(files)} draft files, {size // 1024} KB")


if __name__ == "__main__":
    main()
