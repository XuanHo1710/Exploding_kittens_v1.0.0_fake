# tools/gen3

The Gen 3 (GBA) hardware pass shared by every pixel-art domain: BGR555 colours, alpha 0/255, ≤ 15 colours per 8×8 tile, palette budgets.

| File | Does |
|---|---|
| `gen3.py` | Library: `to_gen3()` (the pass), `snap()`, `report()` (the checks). Imported by `tools/{structures,overworld,characters,ui,battle-scenes}`. |
| `check_gen3.py` | CLI check of PNGs / folders; exit 1 on any failure. `python3 tools/gen3/check_gen3.py --quiet assets/overworld` (`--grid 8 --max-palettes 1` for characters, `--fix`). `npm run check` runs it on every asset folder. |

A script elsewhere in `tools/<domain>/` gets it with `sys.path.insert(0, os.path.join(HERE, "..", "gen3"))`.
Documented in `.agents/skills/expedition-structure-generator/SKILL.md` ("Gen 3 hardware rules"); facts in `docs/explanation/research/gen3-visual-style.md`.
