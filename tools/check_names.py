#!/usr/bin/env python3
"""
Fail when an upstream project / platform name appears in the repository (user rule, AGENTS.md "Names and third-party
notices"): in text file contents (code, configs, data, docs, comments, field names) and in file / folder names.
The names are only allowed in THIRD_PARTY_NOTICES.md, the licence texts in LICENSES/ and the byte-for-byte copies of
third-party code that THIRD_PARTY_NOTICES.md lists (EXEMPT below).

  python3 tools/check_names.py            # tracked + untracked (not ignored) files; exit 1 on any hit
  python3 tools/check_names.py --list     # only the files with hits, with their hit count
  python3 tools/check_names.py PATH ...   # only these files / folders

Binary files are skipped (git grep -I rule: a NUL byte in the first 8000 bytes).
"""
import argparse
import os
import re
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
# the words, written so that this file does not match itself
_W = ["cobble" + "mon", "cobble" + "verse", "mo" + "dpack", "mine" + "craft"]
BANNED = re.compile(r"(?i)" + "|".join(_W) + r"|\b" + "mo" + r"ds?\b")
# a standalone word in a file / folder name: split on anything that is not a letter
NAME_BANNED = re.compile(r"(?i)" + "|".join(_W) + r"|(?<![a-z])" + "mo" + r"ds?(?![a-z])")
EXEMPT = (
    "THIRD_PARTY_NOTICES.md",
    "LICENSES/",
)
# sim/ (the simulators + the byte-for-byte Showdown copy) is local only and git-ignored since 2026-11-19
SKIP = ("tmp/", "game/public/", "game/node_modules/", "node_modules/", "game/dist/", "sim/")


def files(paths):
    cmd = ["git", "-C", REPO, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--"] + list(paths)
    out = subprocess.run(cmd, capture_output=True, check=True).stdout.decode("utf-8", "surrogateescape")
    return sorted({f for f in out.split("\0") if f and os.path.isfile(os.path.join(REPO, f))})


def exempt(f):
    return f.startswith(SKIP) or any(f == e or (e.endswith("/") and f.startswith(e)) for e in EXEMPT)


def scan(f):
    """[(line number, line)] hits in one text file (empty for binaries)"""
    try:
        b = open(os.path.join(REPO, f), "rb").read()
    except OSError:
        return []
    if b"\0" in b[:8000]:
        return []
    text = b.decode("utf-8", "replace")
    return [(i, line) for i, line in enumerate(text.splitlines(), 1) if BANNED.search(line)]


def main():
    ap = argparse.ArgumentParser(description="Fail when an upstream project / platform name appears in the repo.")
    ap.add_argument("paths", nargs="*", help="only these files / folders")
    ap.add_argument("--list", action="store_true", help="only the files with hits, with their hit count")
    ns = ap.parse_args()
    args, only_list = ns.paths, ns.list
    bad_names, bad_lines = [], {}
    for f in files(args):
        if exempt(f):
            continue
        if NAME_BANNED.search(f):
            bad_names.append(f)
        hits = scan(f)
        if hits:
            bad_lines[f] = hits
    for f in bad_names:
        print(f"name: {f}")
    for f, hits in bad_lines.items():
        if only_list:
            print(f"{len(hits):6d}  {f}")
            continue
        for i, line in hits[:20]:
            print(f"{f}:{i}: {line.strip()[:160]}")
        if len(hits) > 20:
            print(f"{f}: ... {len(hits) - 20} more")
    n = len(bad_names) + sum(len(h) for h in bad_lines.values())
    if n:
        print(f"\n{n} hits ({len(bad_names)} names, {len(bad_lines)} files): the upstream names are only allowed in "
              "THIRD_PARTY_NOTICES.md (see AGENTS.md)", file=sys.stderr)
        sys.exit(1)
    print("check_names: clean")


if __name__ == "__main__":
    main()
