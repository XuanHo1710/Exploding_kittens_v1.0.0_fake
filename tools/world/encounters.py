"""Wild-encounter tables for the game build (decisions.md §15, §23): Mons' spawn tables -> rarity-tier rows.

The part of the local wild-encounter simulator that game/tools/build_assets.py and world_assets.py need, kept here
so the build does not depend on sim/ (sim/ left the repo on 2026-11-19; it stays local as the test oracle that
game/tools/check_encounters.py compares with). Same function names and the same output as the simulator.

Data:
  data/world/encounter-rules.json   Gen 3 per-step rules (pret/pokeemerald src/wild_encounter.c) + Mons' layer
                                    (monsRateMult, monsRarity) + Mons' default rates
  data/world/pokemon-spawns.json    Mons' spawn tables: map_spawns, species_behaviors, time_phases, weather
  data/pokemon/pokemon-species.json species names and latest-generation types (tools/data/build_species.py)

1. eligible(): keep the entries whose own `time_of_day` / `weather` (the reference spawn's, build_spawn_pools.py),
   else whose species_behaviors, allow the current time phase and weather ("ANY" matches everything; a species with
   neither is always allowed); an entry's `weather_mult` scales its weight in that weather (the reference's weight
   multipliers under rain / thunder). Gen 3 Emerald itself has no day / night tables. Each entry gets its rarity tier
   (entry_tier: the pool entry's `pool`, an explicit `tier`, else from its weight).
2. rarity_table() (user, option B, 2026-11-19; replaces Gen 3's fixed 12 / 5 slot rows): the buckets common 88.5 /
   uncommon 10 / rare 1.2 / ultra 0.3 % (encounter-rules.json monsRarity) are split over their entries by weight,
   empty buckets renormalised away, then rounded to integer odds out of 10000 (largest remainder, exact fractions):
   one row per entry, `percent` = odds / 100. Deterministic: same list, same table.
3. rate_mult(): Mons' per-terrain multiplier of the per-step rate (monsRateMult, x100: tall grass 150, Surf / cave /
   sand 200), applied by game/src/encounter.ts stepRate() after Gen 3's x16.

Library, no CLI. Example (from the repo root):
  python3 -c "import sys; sys.path.insert(0, 'tools/world'); import encounters as e; \\
t = e.build_table('route-1', 'tall-grass', 'DAY', 'CLEAR')[0]; print([(x.name, p) for x, p in zip(t.slots, t.percent)])"
"""
import json
import os
import re
from dataclasses import dataclass, field
from fractions import Fraction
from functools import lru_cache

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
RULES_PATH = os.path.join(REPO, "data", "world", "encounter-rules.json")
SPAWNS_PATH = os.path.join(REPO, "data", "world", "pokemon-spawns.json")
SPECIES_PATH = os.path.join(REPO, "data", "units", "pokemon-species.json")


# ---------------------------------------------------------------- data
def _json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def rules():
    return _json(RULES_PATH)


@lru_cache(maxsize=1)
def spawns():
    return _json(SPAWNS_PATH)


@lru_cache(maxsize=1)
def _species_list():
    return _json(SPECIES_PATH)["species"]


@lru_cache(maxsize=1)
def _types_by_id():
    return {s["dex"]: s["types"] for s in _species_list()}


def _key(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def species(name_or_id):
    """species record of data/pokemon/pokemon-species.json (name, types, abilities, genderRatio ...) by dex number or
    name"""
    data = _species_list()
    if isinstance(name_or_id, int) or str(name_or_id).isdigit():
        return next(s for s in data if s["dex"] == int(name_or_id))
    k = _key(name_or_id)
    for s in data:
        if _key(s["name"]) == k:
            return s
    raise KeyError(f"unknown species {name_or_id!r}")


def species_name(species_id):
    try:
        return species(species_id)["name"]
    except (KeyError, IndexError, StopIteration):
        return f"#{species_id}"


def species_types(species_id):
    return _types_by_id().get(species_id, [])


def terrain_area(terrain):
    """'land' or 'water' (encounter-rules.json terrainArea)."""
    area = rules()["terrainArea"].get(terrain)
    if area not in ("land", "water"):
        raise KeyError(f"terrain {terrain!r} has no Gen 3 area in encounter-rules.json terrainArea")
    return area


TIERS = ("common", "uncommon", "rare", "ultra")


def rate_mult(terrain):
    """Mons' per-step rate multiplier of a terrain, x100 (encounter-rules.json monsRateMult; 100 when absent)."""
    return int(rules().get("monsRateMult", {}).get(terrain, 100))


def tier_of_weight(weight):
    """The tier of an entry with no `pool` / `tier`: the first tier whose monsRarity.tierOfWeight it reaches."""
    th = rules()["monsRarity"]["tierOfWeight"]
    return next((t for t in TIERS if weight >= th[t]), "ultra")


def entry_tier(raw):
    """A pokemon-spawns entry's tier: `pool` (build_spawn_pools.py entries), else `tier`, else from the weight."""
    t = raw.get("pool") or raw.get("tier") or tier_of_weight(raw["weight"])
    if t not in TIERS:
        raise ValueError(f"unknown tier {t!r} in {raw}")
    return t


def default_rate(map_id, terrain):
    """(encounterRate, where it came from): mapOverrides first, then defaultEncounterRate per terrain."""
    r = rules()
    over = r.get("mapOverrides", {}).get(map_id, {})
    if terrain in over:
        return over[terrain], f"mapOverrides[{map_id}]"
    return r["defaultEncounterRate"][terrain]["rate"], f"mac dinh {terrain}"


def terrain_entries(map_id, terrain):
    maps = spawns()["map_spawns"]
    if map_id not in maps:
        raise KeyError(f"unknown map {map_id!r}")
    terrains = maps[map_id]["terrains"]
    if terrain not in terrains:
        raise KeyError(f"map {map_id!r} has no terrain {terrain!r} (has: {', '.join(sorted(terrains))})")
    return terrains[terrain]


def behavior(species_id):
    return spawns()["species_behaviors"].get(str(species_id))


# ---------------------------------------------------------------- tables
@dataclass
class Entry:
    species_id: int
    name: str
    min_level: int
    max_level: int
    weight: float
    types: list = field(default_factory=list)
    tier: str = None              # common / uncommon / rare / ultra (None = from the weight)


@dataclass
class RarityTable:
    area: str                     # "land" / "water" (Static works on both, Magnet Pull on land)
    slots: list                   # Entry per row: tier order, heaviest first, authored order on ties
    odds: list                    # integer odds of each row out of monsRarity.oddsTotal (10000)
    percent: list                 # odds / 100: the row's share in % (2 decimals, sum 100)
    tiers: list                   # tier of each row
    entries: list                 # = slots (the eligible entries), kept for the simulator's API

    def share(self, entry):
        """the entry's chance in %"""
        return sum(p for p, e in zip(self.percent, self.slots) if e is entry)


def _allows(values, wanted):
    return "ANY" in values or wanted in values


def eligible(map_id, terrain, phase, weather):
    """(eligible entries, entries filtered out by time / weather) in authored order."""
    keep, out = [], []
    for raw in terrain_entries(map_id, terrain):
        sid = raw["species_id"]
        weight = raw["weight"] * raw.get("weather_mult", {}).get(weather, 1)
        e = Entry(sid, species_name(sid), raw["min_level"], raw["max_level"], weight, species_types(sid),
                  entry_tier(raw))
        b = behavior(sid) if "time_of_day" not in raw and "weather" not in raw else \
            {"time_of_day": raw.get("time_of_day", ["ANY"]), "weather": raw.get("weather", ["ANY"])}
        if b is None or (_allows(b["time_of_day"], phase) and _allows(b["weather"], weather)):
            keep.append(e)
        else:
            out.append(e)
    return keep, out


def rarity_table(entries, area="land"):
    """One row per entry with its share (monsRarity, option B). Returns a RarityTable.

    a. tier of each entry (its own, else tier_of_weight); order: tier, weight (heaviest first), authored order;
    b. share of entry e in bucket b = P_b / (sum of P over the non-empty buckets) * w_e / (sum of w in b), exact
       fractions, times oddsTotal;
    c. odds = floor (at least 1), the rest of oddsTotal one by one to the largest remainders (ties: the earlier row).
    """
    r = rules()["monsRarity"]
    total = int(r["oddsTotal"])
    tiers = [e.tier or tier_of_weight(e.weight) for e in entries]
    order = sorted(range(len(entries)), key=lambda i: (TIERS.index(tiers[i]), -entries[i].weight, i))
    rows = [entries[i] for i in order]
    rtiers = [tiers[i] for i in order]
    if not rows:
        return RarityTable(area, [], [], [], [], [])
    bucket = {t: Fraction(str(r["buckets"][t])) for t in TIERS}
    wsum = {t: sum(Fraction(str(e.weight)) for e, et in zip(rows, rtiers) if et == t) for t in TIERS}
    norm = sum(bucket[t] for t in TIERS if wsum[t] > 0)
    exact = [total * bucket[t] / norm * Fraction(str(e.weight)) / wsum[t] for e, t in zip(rows, rtiers)]
    odds = [max(1, int(x)) for x in exact]
    left = total - sum(odds)
    rank = sorted(range(len(rows)), key=lambda i: (-(exact[i] - int(exact[i])), i))
    k = 0
    while left > 0:
        odds[rank[k % len(rows)]] += 1
        left -= 1
        k += 1
    while left < 0:                                   # only when many rows were lifted to 1: take from the largest
        j = max(range(len(rows)), key=lambda i: (odds[i], -i))
        odds[j] -= 1
        left += 1
    return RarityTable(area, rows, odds, [o / 100 for o in odds], rtiers, rows)


def build_table(map_id, terrain, phase, weather):
    """(RarityTable, entries filtered out by time / weather) for one map / terrain / phase / weather."""
    area = terrain_area(terrain)
    keep, out = eligible(map_id, terrain, phase, weather)
    return rarity_table(keep, area), out
