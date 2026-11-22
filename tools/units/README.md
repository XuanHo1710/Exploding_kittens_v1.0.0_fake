# tools/units

Pokémon sprite sheets (movement v3) and battle poses → `assets/pokemon/<GenX-Region>/<NNN>-<Name>/`. Skills: `.agents/skills/expedition-sprite-generator/SKILL.md`, `.agents/skills/expedition-battle-poses/SKILL.md`; prompt packs: `tools/agy/`.

| File | Does |
|---|---|
| `fetch_reference.sh` | `tools/units/fetch_reference.sh "<Name>"`: species folder + official artwork in `/tmp/mons-refs/`. |
| `shiny_recolor.py` | Shiny sheets by recolour (decisions.md §30): `<slug>-movement-shiny.png` (+ `-battle-shiny.png`) + the hand-editable colour map `<slug>-shiny.json` (`map`, `auto`, `saturation`, `lightness`, `keep` / preset `flame`). `python3 -I tools/units/shiny_recolor.py --all --jobs 8 --report tmp/report/shiny` (batch images + `review.txt`); one species: `... 006 --compare out.png`; `--report-3d` reviews the 3D shiny renders. |
| `pose_guide.py` | 3D pose guide (THIRD reference image) from the `pokemon3d` sheets; `--plan` lists the loops. |
| `style_example.py` | Style / layout example (SECOND reference image). |
| `normalize_sheet.py` | Raw AI draft → 192×192 cells (`--mode move4 --layout loop`); background keyed with `magenta.py` (exit 3 when a slot would lose > 50 % of its drawing, `--allow-loss`; `--reference` = artwork whose colours are kept). |
| `magenta.py` | Shared magenta keyer (library): key / shades / panels / grid lines flooded from the background, pink fringe despilled, species colours (reference + Fall-back texture) kept. |
| `check_magenta.py` | Audit of every final sheet: magenta left per category, severity, `tmp/report/magenta/report.json` + `worst.png`; exit 1 when flagged (`--skip-busy` in `npm run check`). |
| `clean_magenta.py` | `clean_magenta.py <sheet.png> \| --all [--dry-run]`: removes magenta left on final sheets in place (no new colours, PNG text chunks kept); before / after in `tmp/report/magenta/`. |
| `assemble_loops.py` | Joins the normalized loops into `<slug>-movement.png`. |
| `loop_check.py` | Checks that a loop really moves. |
| `check_battle.py` | Required-content check of `<slug>-battle.png`. |

Pillow comes from the system (`python3-pil`); an optional `tools/units/.pydeps/` (git-ignored) takes precedence if present.
