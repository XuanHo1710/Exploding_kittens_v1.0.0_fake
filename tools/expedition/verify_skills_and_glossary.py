"""Verify that all 11 expedition-* skills, prompts/, and GLOSSARY.md match the Astral Expedition Pixel domain.

Example (run from repo root):
    py tools/expedition/verify_skills_and_glossary.py
"""

import argparse
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

EXPECTED_SKILLS = [
    "expedition-sprite-generator",
    "expedition-battle-poses",
    "expedition-battle-scene",
    "expedition-npc-generator",
    "expedition-skill-vfx",
    "expedition-skill-review",
    "expedition-ui-generator",
    "expedition-overworld-generator",
    "expedition-structure-generator",
    "expedition-map-generator",
    "expedition-summon-orb-generator",
]

REQUIRED_GLOSSARY_TERMS = [
    "Overworld",
    "RealmMap",
    "RestAnchor",
    "Gatekeeper",
    "Hero",
    "Boss",
    "BattleScene",
    "VerticalSkillMenu",
    "ActionPoints",
    "TimedHit",
    "Dodge",
    "ParryCounter",
    "BreakGauge",
    "SummonOrb",
    "PityLedger",
]

BANNED_LEGACY_PATTERN = re.compile(
    r"\b(Pok[eé]mon|Pok[eé]dex|Pok[eé]\s*Ball|Pok[eé]API|Bulbapedia|Serebii|pokeemerald|pokefirered|Mondex|Pok[eé]Nav|Gym\s+Leader|Pok[eé]\s*Mart)\b",
    re.IGNORECASE,
)

LINK_RE = re.compile(r"\]\(([^)]+)\)")


def check_frontmatter(skill_dir: str, skill_md_path: str) -> list[str]:
    errs: list[str] = []
    with open(skill_md_path, "r", encoding="utf-8") as f:
        text = f.read()
    if not text.startswith("---"):
        return [f"{skill_dir}: missing YAML frontmatter"]
    parts = text.split("---", 2)
    if len(parts) < 3:
        return [f"{skill_dir}: malformed YAML frontmatter"]
    fm = parts[1]
    name_match = re.search(r"^name:\s*['\"]?([a-z0-9\-]+)['\"]?\s*$", fm, re.MULTILINE)
    if not name_match:
        errs.append(f"{skill_dir}: missing frontmatter 'name'")
    elif name_match.group(1) != skill_dir:
        errs.append(f"{skill_dir}: frontmatter name '{name_match.group(1)}' != folder '{skill_dir}'")
    if "description:" not in fm:
        errs.append(f"{skill_dir}: missing frontmatter 'description'")
    return errs


def verify_links_and_terms(md_files: list[str]) -> tuple[list[str], list[str]]:
    broken_links: list[str] = []
    banned_hits: list[str] = []
    for path in md_files:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        rel_file = os.path.relpath(path, REPO)
        for idx, line in enumerate(text.splitlines(), start=1):
            m = BANNED_LEGACY_PATTERN.search(line)
            if m:
                banned_hits.append(f"{rel_file}:{idx}: legacy term '{m.group(0)}'")
        for match in LINK_RE.finditer(text):
            raw_target = match.group(1).strip().split("#", 1)[0].strip()
            if not raw_target or re.match(r"^(https?|mailto|file|conversation)://", raw_target):
                continue
            resolved = os.path.normpath(os.path.join(os.path.dirname(path), raw_target))
            if not os.path.exists(resolved):
                broken_links.append(f"{rel_file} -> {raw_target} (missing: {os.path.relpath(resolved, REPO)})")
    return broken_links, banned_hits


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit expedition-* skills, prompts/, and GLOSSARY.md.")
    parser.add_argument("--quiet", action="store_true", help="Print summary only when passing.")
    args = parser.parse_args()

    errors: list[str] = []
    skills_root = os.path.join(REPO, ".agents", "skills")
    if not os.path.isdir(skills_root):
        print("FAIL: .agents/skills directory missing", file=sys.stderr)
        return 1

    existing_dirs = sorted(d for d in os.listdir(skills_root) if os.path.isdir(os.path.join(skills_root, d)))
    legacy_dirs = [d for d in existing_dirs if d.startswith("pokemon-") or d.startswith("pokeball-")]
    if legacy_dirs:
        errors.append(f"Legacy skill directories still present: {', '.join(legacy_dirs)}")

    md_to_scan: list[str] = []
    for skill in EXPECTED_SKILLS:
        sdir = os.path.join(skills_root, skill)
        smd = os.path.join(sdir, "SKILL.md")
        if not os.path.isfile(smd):
            errors.append(f"Missing required skill file: .agents/skills/{skill}/SKILL.md")
            continue
        errors.extend(check_frontmatter(skill, smd))
        for root, _, files in os.walk(sdir):
            for fn in files:
                if fn.endswith(".md"):
                    md_to_scan.append(os.path.join(root, fn))

    prompts_root = os.path.join(REPO, "prompts")
    if os.path.isdir(prompts_root):
        for root, _, files in os.walk(prompts_root):
            for fn in files:
                if fn.endswith(".md"):
                    md_to_scan.append(os.path.join(root, fn))
    else:
        errors.append("Missing prompts/ directory")

    glossary_path = os.path.join(REPO, "GLOSSARY.md")
    if not os.path.isfile(glossary_path):
        errors.append("Missing GLOSSARY.md")
    else:
        md_to_scan.append(glossary_path)
        with open(glossary_path, "r", encoding="utf-8") as f:
            gtext = f.read()
        for term in REQUIRED_GLOSSARY_TERMS:
            if term not in gtext:
                errors.append(f"GLOSSARY.md missing canonical term: {term}")

    broken_links, banned_hits = verify_links_and_terms(md_to_scan)
    errors.extend(broken_links)
    errors.extend(banned_hits)

    if errors:
        print(f"FAIL ({len(errors)} issue(s)):")
        for e in errors:
            print(f"  - {e}")
        return 1

    if not args.quiet:
        print(
            f"OK: {len(EXPECTED_SKILLS)}/11 expedition-* skills verified, "
            f"{len(md_to_scan)} markdown files scanned, 0 broken links, 0 legacy terms."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
