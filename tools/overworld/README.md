# tools/overworld

Overworld pieces (tiles, 47-tile blob autotiles, connector and standalone props) → `assets/overworld/` (+ Tiled `.tsj`). Skill: `.agents/skills/expedition-overworld-generator/SKILL.md` (catalog and research in its `references/`).

| File | Does |
|---|---|
| `gen_overworld.py` | CLI: `python3 tools/overworld/gen_overworld.py <slug ...>|all` (`--night`, `--gym <type>`, `--cave`). |
| `overworld_kit.py` | Engine: ramps, blob autotile maker, Gen 3 pass (via `tools/gen3/`). |
| `pieces/` | Piece definitions: `terrain.py`, `props.py`, `naturekit.py`, `biome.py`, `gym_<type>.py`, `cave.py` (the two cave styles → `assets/overworld/Caves/`). |
| `town_map.py`, `city_map.py` | Review-only showcase maps (never assets). |
| `prototype_route1.py` | The pre-Gen 3 reference look, kept for its layout. |

Also imported by `tools/maps/` and `tools/battle-scenes/`.
