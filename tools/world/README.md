# tools/world

Shared code for the wild-encounter tables of `data/world/` (decisions.md §15). It writes no file itself: `game/tools/build_assets.py` and `game/tools/world_assets.py` import it to bake `game/public/assets/data/encounters.json`.

| File | Does |
|---|---|
| `encounters.py` | Mons' spawn tables (`data/world/pokemon-spawns.json`) → encounter rows with the rules of `data/world/encounter-rules.json`: `eligible()` (time phase × weather filter; each `Entry` gets its `tier` from `entry_tier()`: the entry's `pool`, an explicit `tier`, else `tier_of_weight()`), `rarity_table()` (option B, 2026-11-19, replaces Gen 3's fixed 12 / 5 slot rows: the buckets common 88.5 / uncommon 10 / rare 1.2 / ultra 0.3 % split by weight inside each bucket, empty buckets renormalised, integer odds out of 10000 by largest remainder → one row per entry with `percent` and `tiers`; deterministic), `rate_mult()` (`monsRateMult` ×100: tall grass 150, Surf / cave / sand 200, Rock Smash 100), `build_table()`, `terrain_area()`, `default_rate()`, `Entry`, `RarityTable`. Library: `python3 -c "import sys; sys.path.insert(0, 'tools/world'); import encounters as e; t = e.build_table('route-1', 'tall-grass', 'DAY', 'CLEAR')[0]; print(list(zip([x.name for x in t.slots], t.percent)))"`. |

Moved out of the local encounter simulator (`sim/EncounterSim/`) on 2026-11-19, when `sim/` left the repo: same function names, the same tables (the simulator has `rarity_table()` too and keeps Gen 3's `fill_slots()` for comparison). `sim/` stays on the developer's machine as the test oracle; `python3 game/tools/check_encounters.py` compares the game with it when it is there and skips with a message when it is not.

Needs only the Python standard library.
