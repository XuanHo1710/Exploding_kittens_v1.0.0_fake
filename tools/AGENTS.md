# tools/: area rules

All pipeline Python, one folder per `assets/<domain>/`. These rules add to the root [`AGENTS.md`](../AGENTS.md). Script index: [`README.md`](README.md); each domain folder has its own `README.md`. Rules with codes: [`docs/reference/conventions.md`](../docs/reference/conventions.md) §4.

- **Placement:** a new script goes in the `tools/<domain>/` of the assets it writes. Code shared by several domains goes in `tools/gen3/`; a script that writes `data/*.json` goes in `tools/data/`. Never put a script in `.agents/skills/` or at the repo root (lint `skill-no-code`, `top-level`).
- **Every `.py` file starts with a module docstring** that says what it does and gives one example command run from the repo root (lint `docstring`).
- **CLI with `argparse`**, so that `--help` works (lint `argparse`). The `LEGACY_NO_ARGPARSE` list in `lint_repo.py` may only shrink.
- **Repo-relative paths only:** `REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))`, then `os.path.join(REPO, "assets", …)`.
  - No absolute paths of one machine, such as a home folder or a snap install (lint `machine-paths`).
  - Anything outside the repo comes from a `MONS_*` env var with a working default; add the variable to `docs/reference/commands.md`.
- **Imports:** there is no package. A script adds its own folder to `sys.path`; shared code is reached with `os.path.join(HERE, "..", "gen3")`, other domains with `os.path.join(REPO, "tools", "<domain>")`.
- **Dependencies:** Pillow only; numpy / OpenCV only under the `[3d]` extra (`pyproject.toml`). Do not install packages unless `import PIL` fails.
- **Deterministic output:** fixed seeds, the same pixels on every run. After changing a generator, prove what changed with `docs/how-to/regression-check.md` (`npm run regen` + `hash_outputs.py --compare`).
- **Gen 3 output:** every PNG a generator writes passes `tools/gen3/check_gen3.py`. Reuse `tools/gen3/gen3.py` for the pass; do not write a second one.
- **Updating:** when you add or change a command, update this folder's `README.md`, the matching `SKILL.md`, and `docs/reference/commands.md` for repo-wide commands, all in the same change.
