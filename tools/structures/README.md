# tools/structures

Buildings: exteriors, doors, interiors → `assets/structures/`. Skill: `.agents/skills/expedition-structure-generator/SKILL.md` (catalog and research in its `references/`).

| File | Does |
|---|---|
| `draw_civic.py` | Civic buildings (Center, Mart, houses, shops …): `python3 tools/structures/draw_civic.py <slug|all>`; one spec module per group in `civic/`. |
| `draw_gym.py` | Gyms: `python3 tools/structures/draw_gym.py <type|all>`; one fully separate design per type in `gyms/<type>.py` (`gyms/fire.py` is the reference). |
| `civickit.py`, `gymkit.py`, `boxkit.py` | Engines (civic, gym, pixel voxel renderer). |
| `normalize_structure.py` | AI path: raw draft → Gen 3 sheet (`--door-strip` for doors). |
| `new_structure.sh` | Resolves a catalog entry and prints the paths the prompt needs. |
| `draw_gym_fire.py` | Old wrapper around `draw_gym.py`. |

The Gen 3 pass and checker are shared: `tools/gen3/`.
