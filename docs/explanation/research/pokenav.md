# PokéNav: how the reference navigator works, and what Mons takes

Research for the Mons PokéNav (2026-11-19). Source: the reference navigator add-on of the upstream project (version
2.4.2, MPL-2.0; its name is not written in the repo, decisions.md §20, and since nothing of it is copied it needs no
entry in [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md)). Read from its archive as data only: language file, config defaults, texture names, class / method names and
string constants (`javap -p -c`). **No code, text or art was copied**: the Mons screen is drawn in code from the UI kit,
with the game's own 2D Pokémon sprites. Code: [`game/src/pokenav.ts`](../../../game/src/pokenav.ts),
[`game/src/scenes/PokeNav.ts`](../../../game/src/scenes/PokeNav.ts).

## 1. The reference

### Items and screens
- **PokéNav item** (many colour variants): right-click opens a handheld with a radial menu of apps. Two matter here:
  - **Location screen**: every Pokémon that can spawn around the player now, as a grid of cards (the Pokémon standing
    on a small platform of the area's kind, its chance under it), split by **rarity bucket** (common, uncommon,
    rare, ultra-rare; a ◀ ▶ selector at the top), a sort button (ascending / descending chance), a refresh button,
    the area name and a day / night and weather symbol at the top right, a help button, a checkbox at the bottom and
    a status bar (signal, battery, clock). Hovering a card shows its details: species, level, bucket, chance,
    weight, and the conditions that matter (area, time range, weather, moon phase, sky / light, height, nearby tile
    kinds, fishing rod / bait). A **"track"** button on the details.
  - **Finder screen**: the best Pokémon of one species already spawned around the player, ranked by perfect IVs
    (weights 1–6 for 1–6 perfect IVs), shiny (10), hidden ability (1) and egg move (1) (server config
    `pokemonFeatureWeights`); "Let's track it down!" turns the device into an arrow that points at that individual.
    Re-opening the device ends the tracking.
- **PokéFinder item**: a HUD radar of nearby Pokémon matching filters (name, properties, labels, EV yield,
  uncaught, shiny).
- **FishingNav item**: the same chance list for the fishing spot the bobber is in (rod, lure level, bait).

### How the list is computed (server side)
1. The player's spawner builds the same **spawning zone** the real spawner uses around the player
   (zone diameter × height from the spawning config) and resolves its spawnable positions.
2. For the selected bucket it asks the spawn selector for the **probabilities** of every spawn detail on those
   positions, keeps the details that are satisfied by at least one position (`isSatisfiedBy`), and collects their
   conditions for display.
3. **Bucket weights** are adjusted by the active influences (bait, player-level range ...) and normalised; the
   checkbox "apply bucket chance" multiplies the in-bucket chance by the bucket's own chance, so the shown % is the
   real chance per spawn (unchecked: the chance *if* that bucket is rolled). Values below 0.01 show as `<0.01%`.
4. Fishing: the same with the fishing spawner and the rod's lure / luck levels, the bobber's chance to hook a
   Pokémon (base 0.85 when no rod data) and the fishing bucket weights.

### Knowledge (unknown species)
- A spawn becomes **catalogued** for the player when they encounter (dex scan, battle, catch) or see it spawn
  (`catalogueDetailId`). Default config: unknown Pokémon are still listed (`hideUnknownPokemon: false`) but shown
  as **"???"** with their conditions hidden ("Not Enough Knowledge", `hideConditionsOfUnknownSpawns: true`); natural
  tile conditions are hidden too.

### Tracking
- Tracking **never changes the odds**: the finder searches Pokémon that already exist in a 128 × 128 area and
  points an arrow at the chosen one. There is no chain, no guarantee and no spawn boost.

## 2. What Mons takes (Gen 3 rules, decisions.md §15)

| Reference | Mons PokéNav |
|---|---|
| Spawner zone + selector probabilities | The exact tables the step roll uses: `encounters.json` per map + terrain through `encounter.ts` `tableFor(phase, weather)` |
| Rarity buckets (rolled first) | Gen 3 has no bucket roll. The bucket is a **label** from the species' share of the slots: 20 %+ thường, 10 %+ ít gặp, 5 %+ hiếm, below 5 % rất hiếm |
| Chance in bucket / "apply bucket chance" | % of the encounters on that terrain (sum of its Gen 3 slot odds); the bottom checkbox **"Tỉ lệ mỗi bước"** switches to the real chance per step (`stepRate` / 2880 × share, with the phase bonus and the lead's ability) |
| Area kind on the platform | Platform colour = terrain: tall grass, sand, cave, surf (fishing when the game has it) |
| Day / night + weather symbols | The VN clock phase (Sáng / Trưa / Chiều / Tối) and the map's weather; tapping them shows another phase / weather, the round button returns to now |
| Conditions in the tooltip | "chỉ ban đêm", "khi mưa", ... derived from which phase × weather tables hold the species |
| "???" for uncatalogued spawns | Never seen in the Mondex: dark silhouette, "???", conditions hidden ("chưa đủ dữ liệu"); caught: a Poké Ball mark |
| Track (arrow to a spawned individual) | Encounters are hidden per-step rolls, so there is nothing to point at: **THEO DÕI** shows a small overworld card "Đang tìm X · N bước · có ở đây / ở <terrain> / không ở đây"; meeting X resets the step count. No odds change, as in the reference |
| Finder (IV / shiny ranking), radar, fishing app | Not taken (no visible spawns; fishing does not exist yet) |
