#!/usr/bin/env python3
"""Check the repo conventions that a machine can check (docs/reference/conventions.md §9).

Every rule looks only at files tracked by git (plus staged new files), so local drafts in tmp/ never fail it.

  python3 tools/lint_repo.py              # run every rule; exit 1 on any error  (npm run lint)
  python3 tools/lint_repo.py --list       # print the rules
  python3 tools/lint_repo.py --only md-links,json

An exception goes into one of the ALLOW lists below, always with the reason on the same line.
"""
import argparse
import ast
import json
import os
import re
import subprocess
import sys
import urllib.parse

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

TOP_LEVEL = {
    # folders
    ".agents", ".github", "assets", "data", "docs", "game", "prompts", "server", "tools",
    # sim/ (the simulators) is local only since 2026-11-19: git-ignored, never tracked
    # files
    ".gitattributes", ".gitignore", "AGENTS.md", "CONTRIBUTING.md", "GLOSSARY.md", "README.md",
    "THIRD_PARTY_NOTICES.md", "LICENSES",   # the one place for third-party names + licence texts (decisions.md §20)
    "package.json", "package-lock.json", "pyproject.toml",
}
KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
CODE_EXT = (".py", ".sh", ".js", ".mjs", ".cjs", ".ts")
SPECIES_DIR = re.compile(r"^assets/pokemon/Gen\d+-[A-Za-z]+/\d{3,4}-[^/]+/")
SPECIES_FILE = re.compile(r"^(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)-(?:movement(?:-shiny)?\.png|battle(?:-shiny)?\.png|posses\.png|reference\.jpg"
                          r"|anchors\.json|shiny\.json)$")
BIG_BYTES = 50 * 1024 * 1024
MACHINE = re.compile(r"/home/|/snap/")

# Machine paths allowed on these files (reason after #). A line that names a MONS_* env var is always allowed:
# it is that variable's default (docs/reference/commands.md "Biến môi trường").
ALLOW_MACHINE_PATHS = {
    "docs/explanation/repo-structure.md",   # history: describes the machine paths that phase 0 removed
    "tools/agy/agy_queue.py",               # message pointing at agy's own log folder under ~/snap (agy installs there)
    "tools/lint_repo.py",                   # this rule's own pattern
}
# Scripts with a __main__ block written before the argparse rule (2026-11-19). This list may only shrink:
# when you touch one of them, give it an argparse CLI and remove it here.
LEGACY_NO_ARGPARSE = {
    "game/tools/build_assets.py", "game/tools/export_sounds.py",
    "tools/agy/agy_queue.py", "tools/agy/auto_fix.py", "tools/agy/clean_drafts.py", "tools/agy/compare_reference.py",
    "tools/battle-scenes/battle_scene.py", "tools/model3d/animate2d.py", "tools/model3d/animate2d_pool.py",
    "tools/model3d/build_fallback.py", "tools/model3d/pixel2d.py", "tools/data/animations.py",
    "tools/data/battle_status.py", "tools/data/species_notes.py", "tools/maps/mapgen.py", "tools/maps/review_kit.py",
    "tools/maps/scaffold.py", "tools/overworld/city_map.py", "tools/overworld/gen_overworld.py",
    "tools/overworld/town_map.py", "tools/units/check_battle.py", "tools/skills/anchor_check.py",
    "tools/skills/build_anchors.py", "tools/skills/build_moves.py", "tools/skills/start_move.py",
    "tools/structures/draw_civic.py", "tools/structures/draw_gym.py", "tools/structures/draw_gym_fire.py",
}
# Tracked markdown whose links are not checked (reason after #).
SKIP_LINKS = set()

RULES = {
    "top-level": "D1  file or folder at the repo root that is not in docs/reference/repo-tree.md",
    "kebab-roots": "D2  direct subfolder of assets/, data/ or tools/ that is not kebab-case",
    "skill-no-code": "D5  scripts/ folder or code file (.py .sh .js .ts) inside .agents/skills/",
    "species-files": "D6  file in a species folder that is not <slug>-{movement,battle,posses}.png, -reference.jpg, "
                     "-anchors.json, or a slug that does not match the folder name",
    "ignored-tracked": "G2  tracked file that .gitignore marks as generated / temporary",
    "json": "G4  JSON that does not parse in data/ or assets/maps (world.json, *.map.json)",
    "big-files": "G6  tracked file larger than 50 MB",
    "docstring": "S1  .py file in tools/ or game/tools/ without a module docstring",
    "argparse": "S2  script in tools/ or game/tools/ with a __main__ block but no argparse (outside the frozen list)",
    "machine-paths": "S3  /home/... or /snap/... in a tracked text file (MONS_* default lines and the allow list pass)",
    "md-links": "K5  relative link in a tracked .md file that points to a missing file",
    "names": "K6  upstream project / platform name in a tracked file or path (tools/check_names.py; decisions.md §20)",
}


def git(*args):
    out = subprocess.run(["git", *args], cwd=REPO, capture_output=True, check=True).stdout
    return [p.decode("utf-8") for p in out.split(b"\0") if p]


def files():
    """Tracked + staged files that still exist on disk."""
    return [f for f in git("ls-files", "-z", "--cached") if os.path.lexists(os.path.join(REPO, f))]


def species_slug(folder):
    """decisions.md §1: lowercase, ♀ -> -f, ♂ -> -m, apostrophes and dots removed, other runs -> '-'."""
    name = folder.split("-", 1)[1].lower().replace("♀", "-f").replace("♂", "-m")
    name = re.sub(r"['’.]", "", name)
    import unicodedata
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


def r_top_level(fs):
    return [(f.split("/")[0], "not an allowed root (docs/reference/repo-tree.md)")
            for f in sorted({f.split("/")[0] for f in fs}) if f not in TOP_LEVEL]


def r_kebab_roots(fs):
    roots = {"/".join(f.split("/")[:2]) for f in fs if f.split("/")[0] in ("assets", "data", "tools") and f.count("/") >= 2}
    return [(r, "domain folder must be kebab-case") for r in sorted(roots) if not KEBAB.match(r.split("/")[1])]


def r_skill_no_code(fs):
    return [(f, "skills hold only SKILL.md + references/; code goes in tools/<domain>/")
            for f in fs if f.startswith(".agents/skills/") and ("/scripts/" in f or f.endswith(CODE_EXT))]


def r_species_files(fs):
    errs = []
    for f in fs:
        m = SPECIES_DIR.match(f)
        if not m:
            continue
        rest = f[m.end():]
        folder = m.group(0).rstrip("/").split("/")[-1]
        fm = SPECIES_FILE.match(rest)
        if "/" in rest or not fm:
            errs.append((f, "not an allowed species file (conventions.md D6)"))
        elif fm.group("slug") != species_slug(folder):
            errs.append((f, f"slug '{fm.group('slug')}' does not match the folder (expected '{species_slug(folder)}')"))
    return errs


def r_ignored_tracked(fs):
    return [(f, "matched by .gitignore: remove it from git (git rm --cached)")
            for f in git("ls-files", "-z", "-ci", "--exclude-standard")]


def r_json(fs):
    errs = []
    for f in fs:
        if f.endswith(".json") and (f.startswith("data/") or (f.startswith("assets/maps/")
                                                             and (f.endswith(".map.json") or f.count("/") == 2))):
            try:
                json.load(open(os.path.join(REPO, f), encoding="utf-8"))
            except (ValueError, UnicodeDecodeError) as e:
                errs.append((f, f"does not parse: {e}"))
    return errs


def r_big_files(fs):
    return [(f, f"{os.path.getsize(os.path.join(REPO, f)) / 2**20:.0f} MB > 50 MB")
            for f in fs if os.path.isfile(os.path.join(REPO, f)) and os.path.getsize(os.path.join(REPO, f)) > BIG_BYTES]


def _py(fs):
    return [f for f in fs if f.endswith(".py") and f.startswith(("tools/", "game/tools/"))]


def r_docstring(fs):
    errs = []
    for f in _py(fs):
        if os.path.basename(f) == "__init__.py":
            continue
        try:
            tree = ast.parse(open(os.path.join(REPO, f), encoding="utf-8").read())
        except SyntaxError as e:
            errs.append((f, f"syntax error: {e}"))
            continue
        if not ast.get_docstring(tree):
            errs.append((f, "no module docstring (what it does + an example command)"))
    return errs


def r_argparse(fs):
    errs = []
    for f in _py(fs):
        if f in LEGACY_NO_ARGPARSE:
            continue
        src = open(os.path.join(REPO, f), encoding="utf-8").read()
        if re.search(r"__name__\s*==\s*['\"]__main__['\"]", src) and "argparse" not in src:
            errs.append((f, "script without argparse: give it an argparse CLI so --help works"))
    stale = sorted(f for f in LEGACY_NO_ARGPARSE if f in fs and "argparse" in open(os.path.join(REPO, f), encoding="utf-8").read())
    errs += [(f, "uses argparse now: remove it from LEGACY_NO_ARGPARSE in tools/lint_repo.py") for f in stale]
    return errs


def r_machine_paths(fs):
    out = subprocess.run(["git", "grep", "-I", "-n", "-z", "-E", MACHINE.pattern], cwd=REPO, capture_output=True).stdout
    errs = []
    for rec in out.decode("utf-8", "replace").split("\n"):
        parts = rec.split("\0")
        if len(parts) < 3:
            continue
        f, line, text = parts[0], parts[1], parts[2]
        if f in ALLOW_MACHINE_PATHS or "MONS_" in text:
            continue
        errs.append((f"{f}:{line}", "machine-specific path: use a repo-relative path or a MONS_* env var"))
    return errs


LINK = re.compile(r"\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")


def r_md_links(fs):
    errs = []
    present = set(fs)
    for f in fs:                                   # folders that hold tracked files are valid targets too
        parts = f.split("/")
        present.update("/".join(parts[:i]) for i in range(1, len(parts)))
    for f in fs:
        if not f.endswith(".md") or f in SKIP_LINKS:
            continue
        text = open(os.path.join(REPO, f), encoding="utf-8", errors="replace").read()
        text = re.sub(r"```.*?```", "", text, flags=re.S)
        text = re.sub(r"`[^`\n]*`", "", text)
        for m in LINK.finditer(text):
            t = m.group(1)
            if re.match(r"^[a-z][a-z0-9+.-]*:", t, re.I) or t.startswith("#"):
                continue
            path = urllib.parse.unquote(t.split("#")[0].split("?")[0])
            if not path:
                continue
            target = os.path.normpath(path.lstrip("/") if path.startswith("/") else os.path.join(os.path.dirname(f), path))
            if target in present or target == ".":
                continue
            errs.append((f, f"broken link: {t}"))
    return errs


def r_names(fs):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import check_names as cn
    errs = []
    for f in fs:
        if cn.exempt(f):
            continue
        if cn.NAME_BANNED.search(f):
            errs.append((f, "upstream name in the path: rename it (THIRD_PARTY_NOTICES.md is the only place for names)"))
        errs += [(f"{f}:{i}", "upstream name: use the neutral wording (AGENTS.md, decisions.md §20)") for i, _ in cn.scan(f)]
    return errs


CHECKS = {name: globals()["r_" + name.replace("-", "_")] for name in RULES}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--list", action="store_true", help="print the rules and exit")
    ap.add_argument("--only", help="comma-separated rule names")
    a = ap.parse_args()
    if a.list:
        for name, what in RULES.items():
            print(f"{name:16s} {what}")
        return 0
    names = a.only.split(",") if a.only else list(RULES)
    unknown = [n for n in names if n not in RULES]
    if unknown:
        ap.error(f"unknown rule(s): {', '.join(unknown)} (see --list)")
    fs = files()
    total = 0
    for name in names:
        errs = CHECKS[name](fs)
        total += len(errs)
        print(f"{'ok ' if not errs else 'ERR'} {name:16s} {len(errs)} error(s)")
        for where, msg in errs[:200]:
            print(f"      {where}: {msg}")
        if len(errs) > 200:
            print(f"      ... {len(errs) - 200} more")
    print(f"lint_repo: {total} error(s) in {len(fs)} files")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
