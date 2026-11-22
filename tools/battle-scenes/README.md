# tools/battle-scenes

Battle backgrounds (one per District × terrain × wild/trainer, plus one per gym) → `assets/battle-scenes/`. Skill: `.agents/skills/expedition-battle-scene/SKILL.md`; ADR `docs/adr/0001-gen3-battle-screen.md`.

| File | Does |
|---|---|
| `battle_scene.py` | `python3 tools/battle-scenes/battle_scene.py` (GBA 240×160) and `--frame=wide` (390×180 `*-wide`). Uses the overworld ramps from `tools/overworld/` and the Gen 3 pass from `tools/gen3/`. Cave Districts `moon-cave` / `granite-cave` make only the cave scenes, from the cave pieces (`python3 tools/battle-scenes/battle_scene.py --frame=wide moon-cave granite-cave`). |
