# tools/items

Poké Ball battle sheets → `assets/items/PokeBalls/<Name-Ball>/`. Skill: `.agents/skills/expedition-summon-orb-generator/SKILL.md`; decisions: `docs/agents/decisions.md` §18 (Poké Ball sprites) and §17 (capture rules). The agy prompt pack is `tools/agy/ball_pack.py`; the facts JSON is `data/battle/pokeball-animation.json` (`tools/data/pokeball_anim.py`).

| File | Does |
|---|---|
| `ballkit.py` | Shared constants: the 28 balls (`BALLS`), ids → folders, sheet layout, green-key balls (`GREEN_BG`), `MONS_REF_ASSETS`. Library. |
| `normalize_ball.py` | Raw agy draft → Gen 3 sheet + `.json` (mechanical keying, frames by row bands, one shared scale, palette from the drawing): `python3 tools/items/normalize_ball.py --ball <id> --input tmp/mons-refs/<id>-ball-raw.png`. |
| `check_ball.py` | PASS / WARN / FAIL per sheet (layout, colours, cuts, magenta, missing ball, reference colours) + `tmp/report/pokeballs/<id>.png`: `python3 tools/items/check_ball.py <id> [--no-preview]`. |
| `ball_reference.py` | Puts the official artwork next to the sheet as `<id>-reference.png`: `python3 tools/items/ball_reference.py <id> [--source "<site>"]`. |
| `contact_sheet.py` | Every sheet on one page → `tmp/report/pokeballs.png`. |
| `catch_anim.py` | The Gen 3 capture sequence on the battle screen from a sheet (also the move viewer page `/catch`): `python3 tools/items/catch_anim.py --ball <id> --target <slug> [--success \| --shakes 0-3]`. |

Pillow comes from the system (`python3-pil`); `tools/units/.pydeps/` (git-ignored) is used when present.
