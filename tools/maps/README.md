# tools/maps

Map assembly: a theme + a spec → one Gen 3 map (`assets/maps/<slug>/`). Skill: `.agents/skills/expedition-map-generator/SKILL.md` (spec format: its `references/spec.md`).

| File | Does |
|---|---|
| `mapgen.py` | The engine and CLI: `inventory <theme>`, `build <spec.map.json> [--debug]`, `world assets/maps/world.json` (all maps + seam check; `npm run maps`), `cave <group>` (all floors of one cave checked together). |
| `cavekit.py` | Cave maps (`kind: "cave"`): `carve`, `ladder`, `hole`, `cave_exit`, `cave_decorate`, `wall_props`, rock faces, single-floor lint and the whole-cave check, used by `mapgen.py`; the mechanics (`boulder`, `switch`, `barrier`, `smash_rock`, `cut_tree`, `lever`, `gate`, `lamp`, `crystal`, `lava`, `ice`, `rail`, `tide`) and the solver that plays them (`mapgen.py cave <group>`). Caves: `moonstone-cave-*`, `rosestone-cave-*`. |
| `test_mechanics.py` | Builds the mechanics test caves (`fixtures/*.map.json`) into `tmp/mech-maps/` and checks collision, tide variants, the cave check and the solver: `python3 tools/maps/test_mechanics.py`. The game side: `MONS_EXTRA_MAPS=tmp/mech-maps npm run assets`, then `node game/tools/mech_test.mjs` against a dev server on port 5202. |
| `nature.py` | Organic passes (`vary`, `forest_edge`, `decorate`, `plateau`, `stream`), used by `mapgen.py`. |
| `scaffold.py` | Writes map specs from the world table: `python3 tools/maps/scaffold.py assets/maps/world.json [slug ...] [--force]`. `--force` keeps the old spec's `cave_entrance` ops and every op marked `"hand": true`. |
| `review_kit.py` | Review sheet of a theme's nature kit → `assets/overworld/_preview/review-kit-<theme>.png`. |
| `themes.json` | Theme definitions (pieces, nature kit). |
| `cave_mock.py` | Multi-floor cave schematics + checks (ladders, holes, boulders, reachability): `python3 tools/maps/cave_mock.py` → `tmp/cave-mocks/`. Research: `docs/explanation/research/gen3-caves.md`. |
| `cave_variants.py` | The cave designs `cave_mock.py` draws (A Mt. Moon, B Granite, C Victory Road style; D–I one per District: lava, minecart, ice, tide, gates, root ledges — `docs/explanation/cave-regions.md`). |

Imports the overworld engine from `tools/overworld/` (+ `pieces/`).
