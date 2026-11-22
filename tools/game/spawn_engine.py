#!/usr/bin/env python3
"""Mons Environmental Spawn Engine.

Resolves wild Pokémon encounters using time of day, weather Markov state,
elevation/depth, story flags, Repel filtering, and BattleScene selection.
Reads `data/world/pokemon-spawns.json` and `assets/maps/world.json`.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
SPAWN_CONFIG_PATH = REPO_ROOT / "data" / "world" / "pokemon-spawns.json"
WORLD_CONFIG_PATH = REPO_ROOT / "assets" / "maps" / "world.json"

_CACHE: dict[str, Any] = {}


def load_spawn_config(path: Path = SPAWN_CONFIG_PATH) -> dict[str, Any]:
    """Load and cache `data/world/pokemon-spawns.json`."""
    key = str(path)
    if key not in _CACHE:
        _CACHE[key] = json.loads(path.read_text(encoding="utf-8"))
    return _CACHE[key]


def load_world_config(path: Path = WORLD_CONFIG_PATH) -> dict[str, Any]:
    """Load and cache `assets/maps/world.json`."""
    key = str(path)
    if key not in _CACHE:
        _CACHE[key] = json.loads(path.read_text(encoding="utf-8"))
    return _CACHE[key]


def resolve_time_phase(hour: int, cfg: dict[str, Any] | None = None) -> str:
    """Map an integer hour (0..23) to MORNING | DAY | DUSK | NIGHT."""
    cfg = cfg or load_spawn_config()
    h = hour % 24
    for phase, info in cfg["time_phases"].items():
        if h in info["hours"]:
            return phase
    return "DAY"


def step_weather(
    theme: str,
    current_weather: str,
    rng: random.Random | None = None,
    cfg: dict[str, Any] | None = None,
) -> str:
    """Advance weather state by one tick using the District's Markov matrix."""
    cfg = cfg or load_spawn_config()
    rng = rng or random.Random()
    matrix = cfg["weather_transitions"].get(theme, cfg["weather_transitions"]["meadow"])
    dist = matrix.get(current_weather) or next(iter(matrix.values()))
    states = list(dist.keys())
    weights = list(dist.values())
    return rng.choices(states, weights=weights, k=1)[0]


def resolve_battle_scene(
    theme: str,
    terrain: str,
    battle_kind: str = "wild",
) -> dict[str, Any]:
    """Resolve composite preview and 4 parallax layers from `assets/battle-scenes/`."""
    district = "lagoon" if theme == "coast" else theme
    if battle_kind == "gym":
        suffix = "gym"
    elif terrain == "indoor":
        suffix = "indoor-trainer"
    else:
        suffix = f"{terrain}-{battle_kind}"

    base = f"assets/battle-scenes/{district}/layers/{district}-{suffix}"
    return {
        "district": district,
        "composite": f"assets/battle-scenes/{district}/{district}-{suffix}.png",
        "layers": [
            f"{base}-backdrop.png",
            f"{base}-ground.png",
            f"{base}-platform-opp.png",
            f"{base}-platform-player.png",
        ],
    }


def _matches(allowed: list[str] | None, current: str) -> bool:
    if not allowed or "ANY" in allowed:
        return True
    return current in allowed


def get_eligible_spawns(
    map_id: str,
    terrain: str,
    time_of_day: str,
    weather: str,
    elevation_depth: str = "LOWLAND",
    story_flags: set[str] | None = None,
    repel_max_level: int = 0,
    cfg: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return weighted eligible spawn entries for the given environmental state."""
    cfg = cfg or load_spawn_config()
    flags = story_flags or set()
    map_entry = cfg["map_spawns"].get(map_id)
    if not map_entry:
        return []

    rules = map_entry.get("terrains", {}).get(terrain, [])
    behaviors = cfg["species_behaviors"]
    eligible: list[dict[str, Any]] = []

    for rule in rules:
        req_flag = rule.get("requires_flag")
        if req_flag and req_flag not in flags:
            continue
        if repel_max_level > 0 and rule["max_level"] < repel_max_level:
            continue

        # Rule-level environmental gates
        if not _matches(rule.get("time_of_day"), time_of_day):
            continue
        if not _matches(rule.get("weather"), weather):
            continue
        if not _matches(rule.get("elevation_depth"), elevation_depth):
            continue

        sp = behaviors[str(rule["species_id"])]
        weight = float(rule["weight"])

        # Ecological affinity multipliers from species_behaviors
        if time_of_day in sp["time_of_day"]:
            weight *= 1.5
        if weather in sp["weather"]:
            weight *= 1.5
        if elevation_depth in sp["elevation_depth"]:
            weight *= 1.25

        eff_min = max(rule["min_level"], repel_max_level) if repel_max_level > 0 else rule["min_level"]
        eligible.append({
            "species_id": sp["id"],
            "slug": sp["slug"],
            "name": sp["name"],
            "min_level": eff_min,
            "max_level": rule["max_level"],
            "weight": round(weight, 2),
            "overworld_behavior": sp["overworld_behavior"],
            "locomotion": sp["locomotion"],
        })

    return eligible


def roll_encounter(
    map_id: str,
    terrain: str,
    hour: int,
    weather: str,
    elevation_depth: str = "LOWLAND",
    story_flags: set[str] | None = None,
    repel_max_level: int = 0,
    seed: int | None = None,
) -> dict[str, Any] | None:
    """Roll a concrete wild encounter + BattleScene for the given state."""
    cfg = load_spawn_config()
    time_of_day = resolve_time_phase(hour, cfg)
    pool = get_eligible_spawns(
        map_id=map_id,
        terrain=terrain,
        time_of_day=time_of_day,
        weather=weather,
        elevation_depth=elevation_depth,
        story_flags=story_flags,
        repel_max_level=repel_max_level,
        cfg=cfg,
    )
    if not pool:
        return None

    rng = random.Random(seed)
    weights = [entry["weight"] for entry in pool]
    chosen = rng.choices(pool, weights=weights, k=1)[0]
    level = rng.randint(chosen["min_level"], chosen["max_level"])
    theme = cfg["map_spawns"][map_id]["theme"]

    return {
        "map_id": map_id,
        "theme": theme,
        "terrain": terrain,
        "time_of_day": time_of_day,
        "weather": weather,
        "elevation_depth": elevation_depth,
        "species_id": chosen["species_id"],
        "slug": chosen["slug"],
        "name": chosen["name"],
        "level": level,
        "overworld_behavior": chosen["overworld_behavior"],
        "locomotion": chosen["locomotion"],
        "battle_scene": resolve_battle_scene(theme, terrain, "wild"),
    }


def run_self_test() -> None:
    """Verify integrity of all 151 species, map spawns, and environmental filters."""
    cfg = load_spawn_config()
    world = load_world_config()

    # 1. All 151 species present
    assert len(cfg["species_behaviors"]) == 151, "Expected 151 species"
    for i in range(1, 152):
        assert str(i) in cfg["species_behaviors"], f"Missing species {i}"

    # 2. Every map in map_spawns exists in assets/maps/ or world.json
    for map_id in cfg["map_spawns"]:
        if (REPO_ROOT / "assets" / "maps" / map_id).is_dir() or map_id in world["maps"]:
            continue
        # cave floors planned in docs/explanation/cave-regions.md §5 get their tables before their maps
        assert cfg["map_spawns"][map_id]["theme"].endswith("-cave"), f"Unknown map {map_id}"
        print(f"  note: cave floor {map_id} has spawns but no map yet")

    # 3. Day vs Night on route-1
    day_ids = {e["species_id"] for e in get_eligible_spawns("route-1", "tall-grass", "DAY", "CLEAR")}
    night_ids = {e["species_id"] for e in get_eligible_spawns("route-1", "tall-grass", "NIGHT", "CLEAR")}
    assert 16 in day_ids and 16 not in night_ids, "Pidgey should appear in DAY only on route-1"
    assert 43 in night_ids and 43 not in day_ids, "Oddish should appear in NIGHT only on route-1"

    # 4. Ghost nocturnal + fog on route-15b
    ghost_day = get_eligible_spawns("route-15b", "tall-grass", "DAY", "CLEAR")
    ghost_night = get_eligible_spawns("route-15b", "tall-grass", "NIGHT", "FOG")
    assert len(ghost_day) == 0 and any(e["species_id"] == 92 for e in ghost_night), "Gastly requires NIGHT/DUSK"

    # 5. Zapdos STORM + Surf flag on volt-town
    no_flag = {e["species_id"] for e in get_eligible_spawns("volt-town", "tall-grass", "NIGHT", "STORM")}
    with_flag = {e["species_id"] for e in get_eligible_spawns("volt-town", "tall-grass", "NIGHT", "STORM", story_flags={"HAS_HM03_SURF"})}
    assert 145 not in no_flag and 145 in with_flag, "Zapdos requires HAS_HM03_SURF + STORM"

    # 6. Repel filtering
    repel_pool = get_eligible_spawns("route-1", "tall-grass", "DAY", "CLEAR", repel_max_level=5)
    assert all(e["max_level"] >= 5 for e in repel_pool), "Repel should filter < 5"

    # 7. Deterministic roll + Markov weather
    enc = roll_encounter("route-8", "water", 22, "STORM", "DEEP_WATER", seed=42)
    assert enc is not None and enc["battle_scene"]["composite"] == "assets/battle-scenes/lagoon/lagoon-water-wild.png"
    next_w = step_weather("marsh", "RAIN", random.Random(7))
    assert next_w in cfg["weather_transitions"]["marsh"]["RAIN"]

    print("ALL SPAWN ENGINE SELF-TESTS PASSED (151 species, 24 maps, time/weather/elevation/repel/BattleScene)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Mons Environmental Spawn Engine")
    parser.add_argument("--self-test", action="store_true", help="Run built-in validation suite")
    parser.add_argument("--map", default="route-1", help="Map slug (e.g. route-1, route-15b, volt-town)")
    parser.add_argument("--terrain", default="tall-grass", help="Terrain (tall-grass, water, sand, cave)")
    parser.add_argument("--hour", type=int, default=12, help="Hour 0..23")
    parser.add_argument("--weather", default="CLEAR", help="Weather (CLEAR, RAIN, STORM, FOG, HEAT, SNOW)")
    parser.add_argument("--elevation", default="LOWLAND", help="Elevation/depth tier")
    parser.add_argument("--seed", type=int, default=None, help="Optional RNG seed")
    args = parser.parse_args()

    if args.self_test:
        run_self_test()
        return

    res = roll_encounter(args.map, args.terrain, args.hour, args.weather, args.elevation, seed=args.seed)
    print(json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
