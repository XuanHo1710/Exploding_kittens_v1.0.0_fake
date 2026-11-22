# tools/characters

Overworld people (Player, NPCs, Trainers, Gym Leaders, League: Elite Four + Champion) as hand-shaded paper dolls → `assets/characters/`; drawn Players and the League are imported from the user's drawings (`import_drawn.py`). Skill: `.agents/skills/expedition-npc-generator/SKILL.md`; decisions: `docs/agents/decisions.md` §9.

| File | Does |
|---|---|
| `draw_chars.py` | CLI: `python3 tools/characters/draw_chars.py <group|slug ...|all>`; one spec module per group in `chars/` (exports `SPECS`). |
| `draw_extras.py` | Jump shadow and emotes. |
| `import_drawn.py` | CLI: `python3 tools/characters/import_drawn.py [slug ...] [--group Player\|League] [--add-from DIR] [--report PNG]`: imports the user's drawings (`<Group>/<slug>/<slug>-drawn.jpg` + the group index `Player/players-drawn.json` / `League/league-drawn.json`) as Gen 3 sheets: Player 32×32 frames, 26 px (children 22), eyes kept, picker fields; League 16×32. `--add-from tmp/characters-in` takes in new Player drawings (+ `order.txt`). |
| `charkit.py` | Engine (4×4 sheet of 16×32 frames, one 15-colour palette, Gen 3 pass via `tools/gen3/`). |
| `parts.py` | Shared paper-doll layers. |

Check: `python3 tools/gen3/check_gen3.py --grid 8 --max-palettes 1 assets/characters`.
