# Repository layout: one root per kind of thing

Status: accepted (2026-11-19). Details and history: [`docs/explanation/repo-structure.md`](../explanation/repo-structure.md); settled facts: [`docs/agents/decisions.md`](../agents/decisions.md) §22.

## Context

By November 2026 the repo had grown to about 22 000 tracked files with no shared layout. Content sat in ten top-level folders with mixed naming (`Pokemon/`, `BattleScenes/`, `UI/`, `configs/`). Python lived in four places (`tools/`, `game/tools/`, `.agents/skills/*/scripts/`, `Simulation/`), and the shared engines (`mapgen.py`, `gen3.py`, `check_gen3.py`…) were hidden inside AI skill folders. Source files and generated files were mixed, and look-only previews were committed. The root README was empty, and docs pointed at machine paths. Devs and AI agents each had to guess where a new file went.

## Decision

- **One root per kind of thing:**
  - `game/`: the client;
  - `assets/<domain>/`: all finished content;
  - `data/<domain>/`: game data JSON;
  - `tools/<domain>/`: every pipeline script, one folder per asset domain, named like it, plus `tools/gen3/` for code several domains share;
  - `sim/`: the simulators;
  - `prompts/`;
  - `.agents/skills/`: workflows only, `SKILL.md` + `references/`;
  - `docs/`: split by Diátaxis (`tutorials/ how-to/ reference/ explanation/`) plus `adr/` and `agents/`.
- **Top-level and domain folders are kebab-case.** Inner id folders (`<GenX-Region>/<NNN>-<Name>/`, `<English Move Name>/`, `Base/`, `Gyms/`…) keep their names, because data and map specs reference them.
- **Generated look-only output stays out of git** (`_preview/`, `-debug.png`, `-report.md`, `tmp/`). Generated files the game reads stay in git and are marked `linguist-generated` in `.gitattributes`.
- **There is no Python package.** Scripts keep `sys.path` + flat imports and repo-relative paths. Paths outside the repo come from `MONS_*` environment variables.
- **One task runner at the root:** `package.json` (npm workspaces `["game"]`) with `assets / dev / build / typecheck / maps / regen / check / lint / hash`.
- **Conventions are written down and checked by machine.** They are listed in [`docs/reference/conventions.md`](../reference/conventions.md). `tools/lint_repo.py` (`npm run lint`) enforces the mechanical ones, and CI (`.github/workflows/check.yml`) runs lint, typecheck and the Gen 3 checks on every PR.

## Consequences

- To find something, a dev or agent looks at the root that matches what it is (asset, data, code, doc), then at the domain folder. New files have exactly one right place, and the lint rejects new top-level roots and code inside skills.
- The file moves (phases 0–3: hygiene, task runner, code move, asset move) were checked to leave every generated output unchanged (`tools/regen.sh` + `hash_outputs.py`: 0 PNGs changed pixels). Phases 4–5 (docs, CI) changed only docs, path strings and checks.
- Branches started before 2026-11-19 must move new files from old roots into `assets/`, `data/` or `tools/<domain>/` when they rebase.
- A future move of a top-level root needs a new ADR that supersedes this one. Inner id folders cannot be renamed without migrating the data that references them.
- `docs/agents/decisions.md` remains the log of user-settled format and pipeline choices. New architectural decisions go to `docs/adr/`.
