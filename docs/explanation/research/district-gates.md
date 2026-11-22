# District gates: police checkpoints, District level caps and wild level bands

The user asked (translated from Vietnamese): "Research and propose a mechanic built into the maps. At the end of each
District there is a ticket-check gatehouse (cổng soát vé) staffed by police. The Player must finish the District's
quests, beat its gym, finish its story beats and so on before being let through to the next District. Each District
also has a level cap for the Player's Pokémon and a level range for wild Pokémon."

This page has three parts:
- §1: how the Gen 3 games gate progress, read from the decompiled source.
- §2: what Mons already has.
- §3: a concrete proposal.

**§3 is a proposal, not a decision.** Nothing in `decisions.md` changes until the user answers §3.12.

**Tags:**
- **[PRET]**: read directly from the decompiled source or data.
- **[MEASURED]**: counted by a script on the repo's data (method in §2.0).
- **[INFERRED]**: reasoning on top of hard numbers.
- **unverified**: not checked in this round.

**Sources (read 2026-11-19):**
- `pret/pokeemerald` commit [`9103e52`](https://github.com/pret/pokeemerald/tree/9103e529c2fbdd7add4a1ff3350c6c1f92112c42) (EM) and `pret/pokefirered` commit [`ce6406d`](https://github.com/pret/pokefirered/tree/ce6406d8c2eaf46d543c8a2606de0c3cb1951982) (FR). These are the same commits as [gen3-world-connections.md](./gen3-world-connections.md).
- Single files were fetched from `raw.githubusercontent.com` at those commits. Links point to the pinned blob with line anchors.
- pokeruby was not read: Emerald contains every Hoenn check used here.
- No community sources.
- Repo facts are given as `path:line` on branch `research/district-gates`.

---

## 1. Precedents in the Gen 3 games

### 1.1 How Gen 3 blocks a way

Gen 3 has no general "gate" object. Every block is a combination of five script tools.

| Tool | How it works | Example |
|---|---|---|
| **A. NPC moved into the path** | On map load, `OnTransition` moves an NPC onto the path while a flag is unset (`setobjectxyperm`). | Oldale footprints man, Cerulean policeman |
| **B. Trigger row** | A full-width row of trigger cells (coord events, active while a var holds a value) runs a script that talks and walks the Player one step back. | FRLG Saffron gates, Pewter gym guide, Route 111 sandstorm |
| **C. Hidden object** | An object stays on the map until a `FLAG_HIDE_*` flag set by a later event removes it. | Route 112 Magma grunts |
| **D. Metatile swap** | The map swaps a metatile: a closed door, or a bridge blocked by a Kecleon. | Sootopolis gym door, Route 120 bridge |
| **E. Leader state counter** | A var counts the Player's progress, and the Leader answers by its value. | Petalburg Gym (Norman) |

The table below lists the blocks found in the source. "Opens when" is the exact flag, var or item the script checks.

| Game · place | Who / what blocks | Tool | Opens when [PRET] | Source |
|---|---|---|---|---|
| EM Oldale Town, west exit | footprints man | A + B, Player steps back | `FLAG_ADVENTURE_STARTED` set | [OldaleTown 8, 18-21, 190-209][em-oldale] |
| EM Rusturf Tunnel | Aqua grunt with the stolen Devon Goods | A + B | `VAR_RUSTURF_TUNNEL_STATE` 4/5; `FLAG_RECOVERED_DEVON_GOODS` | [RusturfTunnel 7-8, 246-256, 321-322][em-rusturf] |
| EM Petalburg Gym | Norman refuses: "challenge me when … you can show me four GYM BADGES" | E: `VAR_PETALBURG_GYM_STATE` 2…6 | var reaches 6 | [PetalburgCity_Gym 101-109, 1210-1218][em-norman] |
| EM Route 111 desert | sandstorm text, Player pushed back | B + item check | `checkitem ITEM_GO_GOGGLES` | [Route111 190-197][em-r111] |
| EM Route 112, Mt. Chimney cable car | two Magma grunts: "we're not to let anyone pass" | C | `FLAG_HIDE_ROUTE_112_TEAM_MAGMA`, set by the Meteor Falls scene | [Route112 10-33, 113-115][em-r112], [map.json 45, 111][em-r112map], [MeteorFalls_1F_1R 78][em-meteor] |
| EM Route 120 bridge | invisible Kecleon | D + wild battle | `FLAG_RECEIVED_DEVON_SCOPE` (Steven gives the Devon Scope) | [Route120 36-37, 190, 215-216][em-r120] |
| EM Fortree City gym | invisible Kecleon | A + item | Devon Scope in the bag, then `FLAG_KECLEON_FLED_FORTREE` | [FortreeCity 21, 58, 80][em-fortree] |
| EM Sootopolis gym | gym door metatile closed | D | `FLAG_SOOTOPOLIS_ARCHIE_MAXIE_LEAVE` | [SootopolisCity 10, 30-31][em-sooto] |
| EM Lilycove | not a block: two NPCs change their lines once the Aqua cove is cleared | dialogue branch | `FLAG_BADGE07_GET` | [LilycoveCity 60, 115][em-lily] |
| EM Mauville, Route 110, Route 119 (checked) | no progress blocker in `scripts.inc`: the Wally battle in Mauville is an optional request (`FLAG_DECLINED_WALLY_BATTLE_MAUVILLE`); Route 110 is the Cycling Road challenge (`VAR_CYCLING_CHALLENGE_STATE`); Route 119 holds the Weather Institute scene (`VAR_WEATHER_INSTITUTE_STATE`) and the rival battle that gives HM02 (`FLAG_RECEIVED_HM_FLY`) | none | none | [MauvilleCity 67-96][em-mauville], [Route110 140-147][em-r110], [Route119 19-26, 130-131][em-r119]; map objects not checked |
| EM Pokémon League 1F | two door guards | trigger + guards step aside | **only `FLAG_BADGE06_GET`**, then `FLAG_ENTERED_ELITE_FOUR` | [EverGrandeCity_PokemonLeague_1F 46-86, 118-128][em-league] |
| FR Viridian City | old man lying on the road north | A | `VAR_MAP_SCENE_VIRIDIAN_CITY_OLD_MAN` ≥ 1 (after Oak's Parcel) | [ViridianCity 7-9, 23][fr-viridian] |
| FR Viridian Gym | gym locked | D | `FLAG_BADGE02_GET` … `FLAG_BADGE07_GET` all set | [ViridianCity 30-36][fr-viridian] |
| FR Pewter City, east exit | gym guide leads the Player to the gym | B, active while `VAR_MAP_SCENE_PEWTER_CITY` = 0 | var changes after Brock | [PewterCity 256-284][fr-pewter], [map.json 188-217][fr-pewtermap] |
| FR Cerulean City | **policeman** in front of the robbed house; Slowbro and a lass block the other exits | A | `FLAG_GOT_SS_TICKET` | [CeruleanCity 7, 10-15, 226-229][fr-cerulean] |
| FR Saffron gates (Route 5/6/7/8) | guard: "thirsty on guard duty" | B across the whole gate (Left / Mid / Right) + step back | `FLAG_GOT_TEA`; then `VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES` = 1 opens **all four** gates | [Route5_SouthEntrance 8-35, 50, 82][fr-saffron] |
| FR Route 22 gate, Route 23 | one guard per badge (Boulder … Earth) | talk + trigger per guard | `FLAG_BADGE01_GET` … `08`; `VAR_MAP_SCENE_ROUTE23` remembers how many guards already let you pass | [Route22_NorthEntrance 4-17][fr-r22], [route23.inc 46-115][fr-r23] |
| FR Route 12 / 16 | sleeping Snorlax | object + wild battle | `FLAG_GOT_POKE_FLUTE` → `FLAG_HIDE_ROUTE_12_SNORLAX` | [Route12 16-29][fr-r12] |
| EM / FR Cut, Rock Smash, Strength obstacles | tree, rock, boulder | field-move script | badge flag (§1.3) | [EM field_move_scripts 4, 62, 124][em-fms], [FR field_moves 4, 62, 122][fr-fms] |

Patterns the proposal reuses:
1. **The check is a flag or var test, and the Player is walked one step back.** Nobody is ever stuck. Every blocker is a dialogue followed by a step back, not a wall that can trap the Player.
2. **A trigger row covers the whole passable width.** The FR Saffron gate has three trigger cells for its three-cell opening, so the Player cannot slip past the guard.
3. **The game remembers that you passed.** Three examples:
   - `VAR_MAP_SCENE_ROUTE5_ROUTE6_ROUTE7_ROUTE8_GATES` opens all four Saffron gates at once.
   - `VAR_MAP_SCENE_ROUTE23` counts the badge guards already passed.
   - `FLAG_ENTERED_ELITE_FOUR` makes the League guards wave the Player through for good.
4. **Checks are minimal and say why.** The League guards test one badge only. The source comment says: "The door guards only check for FLAG_BADGE06_GET because Winonas badge is the only one that can be skipped. Its assumed the player has the remaining badges" ([EM 46-47][em-league]). Gen 3 checks what the map layout cannot guarantee, nothing more.
5. **A police officer as the blocker has a direct precedent: the FR Cerulean policeman.** He is moved into the exit until `FLAG_GOT_SS_TICKET` is set ([FR 7, 10-15][fr-cerulean]). The FR gate staff are guards.
6. **Hoenn has no gatehouse between two outdoor maps on the main road.** Emerald gates progress with story NPCs, caves and HMs instead. FRLG uses real gatehouses (Saffron, Route 22) [MEASURED, [gen3-world-connections.md §2.4](./gen3-world-connections.md)].
7. Route 128 in Emerald is the Kyogre story scene (`VAR_ROUTE128_STATE`, [Route128 11][em-r128]), not a check. It is listed here only because the brief named it.

### 1.2 Obedience by badge count

Gen 3 checks obedience in `IsMonDisobedient` ([EM battle_util.c 3909-3947][em-obey], [FR 3143-3171][fr-obey]). Both games use the same thresholds [PRET]:

| Badges | A traded Pokémon (other OT) obeys up to |
|---|---|
| fewer than 2 (no `FLAG_BADGE02_GET`) | Lv 10 |
| `FLAG_BADGE02_GET` | Lv 30 |
| `FLAG_BADGE04_GET` | Lv 50 |
| `FLAG_BADGE06_GET` | Lv 70 |
| `FLAG_BADGE08_GET` | every level |

- Above the threshold the game rolls `(level + obedienceLevel) * rnd >> 8` against the threshold.
- Link battles, the opponent's side, Frontier and recorded battles always obey. A Pokémon with the Player's own OT always obeys.
- Emerald adds a fateful-encounter check for Mew and Deoxys.
- Gen 3 has **no level cap** on the Player's own Pokémon. Obedience is its only level gate, and it applies only to traded Pokémon.

**Mons:** traded Pokémon always obey (`docs/agents/decisions.md:500`, §21 answer 7). This table is precedent only.

### 1.3 Field moves need badges in Gen 3

The party menu allows field move `n` only with `FLAG_BADGE01_GET + n` ([EM party_menu.c 120-127, 3724-3725][em-pm], [FR party_menu.c 3926][fr-pm]). The FR move order is in [FR include/constants/party_menu.h 34-40][fr-pmh]. Surf and Waterfall are also checked on the field ([EM field_control_avatar.c 450-455][em-fca], [FR 605-610][fr-fca]).

| Badge | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| EM | Cut | Flash | Rock Smash | Strength | Surf | Fly | Dive | Waterfall |
| FR | Flash | Cut | Fly | Strength | Surf | Rock Smash | Waterfall | none |

**Mons:** HMs have no badge check (`decisions.md:820`). The one badge-gated field move is Surf, which needs 4 badges (`game/src/scenes/World.ts:157, 1278`). This table is precedent only.

### 1.4 The Emerald level curve

The table compares wild levels with Gym Leader ace levels, by the number of badges held.
- Wild ranges come from [`src/data/wild_encounters.json`][em-wild] (land and cave tables, min–max over all slots) [PRET].
- Aces come from `sParty_<Leader>1` in [`src/data/trainer_parties.h` 3367-3577][em-parties] [PRET].
- Which areas the Player reaches with each badge count is [INFERRED] from the story order. Example: the Route 111 desert table needs the Go-Goggles, which come after Flannery.

| Badges held | Main new wild areas (story order) | Wild Lv | Next Leader, ace | Gap (ace − wild max) |
|---|---|---|---|---|
| 0 | Route 101–104, Petalburg Woods, Route 116 | 2–8 | Roxanne, Nosepass 15 | 7 |
| 1 | Granite Cave 1F–B2F, Rusturf Tunnel | 5–12 | Brawly, Makuhita 19 | 7 |
| 2 | Route 110, 117 | 12–14 | Wattson, Manectric 24 | 10 |
| 3 | Route 112–114, Fiery Path, Meteor Falls 1F, Jagged Pass | 14–22 | Flannery, Torkoal 29 | 7 |
| 4 | Route 111 desert, Mirage Tower | 19–24 | Norman, Slaking 31 | 7 |
| 5 | Route 118–120 | 24–27 | Winona, Altaria 33 | 6 |
| 6 | Route 121–123, Mt. Pyre, Magma Hideout, Safari Zone (S, SW, N, NW) | 22–33 | Tate & Liza, Lunatone / Solrock 42 | 9 |
| 7 | Seafloor Cavern, Cave of Origin | 28–36 | Juan, Kingdra 46 | 10 |
| 8 | Victory Road 1F–B2F | 36–44 | Sidney, Absol 49 (… Champion Wallace, Milotic 58) | 5 |

Readings [INFERRED]:
- The best wild Pokémon in a stretch sit **about 7 levels below the next Leader's ace**. The median gap is 7, the range 5–10.
- A single land table is narrow: 2–4 levels, for example Route 110 12–13 and Route 118 24–27.
- **Surf and fishing do not follow the curve.** Almost every water table in Hoenn is 5–35 (Surf) and 5–45 (all rods), from Route 102 to Ever Grande. Only underwater (20–35) and a few Safari tables differ [PRET, [wild_encounters.json][em-wild]]. In Gen 3 the curve lives only in land and cave tables.
- The Elite Four aces are 49, 51, 53, 55 and Champion 58 [PRET, [trainer_parties.h 3215-3329, 4414][em-parties]].

### 1.5 Later generations

The brief mentions Scarlet / Violet obedience by badge count. No first-party text (game data or official site) was read in this round, so the claim is **unverified** and is not used here.

---

## 2. Mons today

### 2.0 Method [MEASURED]

1. The script reads three things:
   - `assets/maps/world.json` (30 maps);
   - the game's exported maps, `game/public/assets/maps/<slug>/map.json` (collision, behaviour, connections, warps, cave `stairs`). These are built from the committed maps by `npm run assets`;
   - `game/public/assets/data/encounters.json` (the same build, from `data/world/pokemon-spawns.json` `map_spawns`, line 3120).
2. It flood-fills the passable cells of every outdoor map. Passable means `OPEN` = `.,fDMSc` + `io` (`World.ts:71`), ledges one way only (`World.ts:69`), and water only when surfing.
3. It joins regions across connection cells and joins every cave group to all of its outdoor mouths. It assumes each cave is walkable from mouth to mouth.
4. It runs a BFS from start-town.
5. The script lives in this session's scratchpad (`reach.py`) and is not in the repo.

### 2.1 Districts and the world graph

A **District** is "the part of the world around one gym city whose Maps share that gym's Theme"; the start area is neutral (`GLOSSARY.md:21-23`). The theme decides the District for art, Trainer classes and battle scenes (`game/tools/build_assets.py:229` `THEME_DISTRICT`). Gyms open in order grass → psychic → electric → water → rock → ground → poison → fire. A gym needs as many badges as there are gyms before it (`decisions.md:345`, `World.ts:155, 1205-1215`).

| Gym (order) | Gym city | Leader ace (`trainers.json`) | Other maps with that theme |
|---|---|---|---|
| 1 grass | city-a | Liễu 13 | bloom-town (garden), route-3 (woods → garden) |
| 2 psychic | city-b | Tâm An 18 | route-15, route-15b, starfall-town (mystic) |
| 3 electric | hub-city | Quang Huy 22 | none |
| 4 water | port-city | Hải Yến 26 | route-8, route-9a, route-9b, isle-town; route-7, route-10, route-16 (coast → lagoon) |
| 5 rock | flint-city | Thạch Sơn 30 | route-5 (quarry) |
| 6 ground | dune-city | Cát Tường 34 | route-6, route-14 (canyon) |
| 7 poison | fen-city | Mộc Lan 38 | route-11, route-12 (marsh) |
| 8 fire | cinder-city | Hồng Liên 42 | route-4, route-4b (volcano) |
| neutral | start-town | none | route-1, route-2 (meadow) |

Aces: `data/battle/level-caps.json` rows `badges-0` … `badges-7` (`next_ace`), and `build_assets.py:237` `GYMS`.

**The world is a ring around a hub, not a line** (`assets/maps/world-report.md:5-37`). hub-city joins:
- route-2: south, to city-a;
- route-3: north, to city-b;
- route-7: east, to port-city;
- route-4: west, to cinder-city.

Side roads lead out of the ring:
- bloom-town → route-11 → fen-city (gym 7) leaves route-2.
- city-b → route-5 → flint-city (gym 5).
- city-b → route-15b → starfall-town → route-15 → route-4b → cinder-city (gym 8).
- port-city → route-6 → route-14 → dune-city → route-16 → route-8 → port-city is a loop.
- The sea loop port-city → route-9a → isle-town → route-9b → route-10 → start-town, with route-10 → route-12 → fen-city, is all Surf.

Cave passages join two outdoor maps [MEASURED, cave `stairs` of kind `exit`]:

| Cave | Mouths on |
|---|---|
| root-cave | route-2, bloom-town |
| moonstone-cave | route-6 (1F), route-7 (B1F) |
| magma-cave | route-4, route-4b |
| power-tunnel | hub-city (1F), route-7 (B1F) |
| old-mine | route-5, flint-city |
| frost-cave | route-15 only |
| rosestone-cave | route-12 only |
| tide-cave | route-8 only |

**Three seams are one-way in the game today** [MEASURED]:
- `world-report.md:15-16` lists `port-city right → route-8`, `port-city down → route-9a` and `start-town right → route-10`.
- The exported `port-city` and `start-town` have no matching exit (their only connections are route-7 / route-6 and route-1).
- The game exports the exit objects of each map's Tiled file (`build_assets.py:808-810`), not the Gen 3 connection list.
- The result: route-8 can be entered only from route-16, and route-10 only from the sea.

### 2.2 What already gates progress

| Check | Where | What it tests |
|---|---|---|
| Lab aide on the edge of start-town | `World.ts:590-598` (`step()`, before `changeMap`) | Party is not empty. Blocks **every** connection crossing with a line. **This is the hook a District gate would use.** |
| Gym doors | `World.ts:606, 1205-1215` | Badge count = the gym's index in `GYM_ORDER`. A sign line, then `stepBack`. |
| Surf | `World.ts:157, 1278` | 4 badges + a water type in the party (prototype rule, `decisions.md:344`). |
| `badge-guard` (League road) | `World.ts:130-131, 301-302, 1361-1366`; sprite `guard` (`build_assets.py:64-65`) | 8 badges. The guard NPC moves one cell aside once the Player has them. Planned for route-17 (spec 11 §4.1, `docs/explanation/spec/11-battle-and-save-systems.md:307`), which is **not built**: no `assets/maps/route-17`, not in `world.json`. |
| Rival battles 2–4 | `game/src/trainers.ts:55-59`, `World.ts:1132-1145` | A trigger row on route-3 (1 badge), route-6 (4) and route-4 (7). Re-fires until `rival-<n>` is in `GAME.defeated`. |
| Gym Leader refuses over the cap | `World.ts:1427-1428, 1618-1633`, `game/src/caps.ts:10-25`, `decisions.md:684-687` | Any party Pokémon above the cap. Other Trainers never refuse. |
| EXP stops at the cap | `game/src/battle/exp.ts:15-32`, `game/src/scenes/Battle.ts:701-741` | `levelCap()`; EVs still count. |
| "Tính năng đang phát triển" notice | `decisions.md:704` | Dead ends such as a road that is not open. |

**The decided baseline is an open world.** v0.4 says "the whole world is open: all 30 `assets/maps/world.json` maps" (`decisions.md:344`). Gates would partly reverse that, so this needs the user's OK (§3.12).

### 2.3 Level caps (decided)

`decisions.md:509-519` and `data/battle/level-caps.json:4-12` (rule), built by `tools/data/build_trainers.py`. The cap is the next required Trainer's ace + 5. At or above the cap a Pokémon gains no EXP; EVs still count. Over-cap Pokémon keep their level and obey. A Gym Leader refuses while anyone in the party is over the cap. There is no cap after becoming Champion.

| Badges | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 (League, per member) | Champion |
|---|---|---|---|---|---|---|---|---|---|---|
| Next ace | 13 | 18 | 22 | 26 | 30 | 34 | 38 | 42 | 45 / 47 / 49 / 50 / 53 | none |
| Cap | 18 | 23 | 27 | 31 | 35 | 39 | 43 | 47 | 50 / 52 / 54 / 55 / 58 | none |

THẺ already shows the cap: "Giới hạn cấp nhà thi đấu: Lv N" (`World.ts:1840-1845`, `decisions.md:602`).

### 2.4 Wild levels and what is reachable today [MEASURED]

With a party and **0 badges** the Player can walk to 33 of the 38 places (outdoor maps plus cave groups). Only the sea loop (route-9a, isle-town, route-9b, route-10) and tide-cave need Surf. The reachable set includes:

| Place (0 badges, cap 18) | Wild Lv |
|---|---|
| route-14 grass | 34–41 |
| route-4b grass | 32–42 |
| route-15 grass | 28–38 |
| magma-cave | 37–44 (B2F 40–44) |
| rosestone-cave | 24–32 |
| old-mine | 22–29 |

The worst gap is magma-cave B2F: Lv 44 wild at cap 18, 26 levels over.
- Over-level wild Pokémon cannot be trained past the cap.
- But **a caught one keeps its level and obeys** (`level-caps.json:11`, `decisions.md:500`). So an early detour gives the Player a Lv 40 Pokémon for route Trainers and the rival. Only Gym Leaders refuse it.
- This is the strongest gameplay reason for gates. A second reason is story order.

Current wild ranges per map (grass, else the main terrain). These are `data/world/pokemon-spawns.json` `map_spawns`, as built into `encounters.json`:

| Map | Lv | Map | Lv | Map | Lv |
|---|---|---|---|---|---|
| route-1 | 2–5 | route-7 | 14–19 | route-14 | 34–41 |
| route-2 | 3–6 | route-6 | 16–24 | route-16 | 19–22 (sand 30–38) |
| root-cave | 10–18 | moonstone-cave | 14–21 | route-11 | 22–29 |
| route-3 | 7–12 | route-5 | 7–12 | fen-city | 24–30 |
| power-tunnel | 19–26 | old-mine | 22–29 | route-12 | 7–10 (Surf 24–34) |
| port-city Surf | 15–19 | route-8 | 14–17 (Surf 22–38) | rosestone-cave | 24–32 |
| route-9a / 9b | 11–14 / 8–11 | tide-cave | 28–36 | route-4 / 4b | 28–35 / 32–42 |
| route-10 | 22–30 | route-15 / 15b | 28–38 / 26–36 | magma-cave | 35–44 |
| frost-cave | 15–21 | city-b Surf | 16–20 | hub-city Surf | 12–16 |

Two rules limit how these levels can be changed:
- The authored entries in `map_spawns` are "the core and never change". Pool entries take their band from them (`decisions.md:629-633`, §23).
- Maps with no table fall back to `lo = 2 + distance // 60` (`build_assets.py:508-509`); caves to `CAVE_LEVEL` plus 2 per floor (`build_assets.py:83, 914`).

### 2.5 Story and quest state

`GAME` (`game/src/state.ts`) holds:
- `story` `"lab" | "done"` (17-18);
- `defeated` (22), with Trainer ids, `rival-<n>`, `e4-<n>`, `champion…`;
- `badges` (26);
- `flags` (41-42), for example `gift:hiker-flash`.

**There is no quest system.** "Quests" in the brief would be new content. Saves are online-only (`decisions.md:499`, §21 answer 6), and the payload is `GAME` (spec 11 §6.3).

### 2.6 Buildings and map tools

- **A `route-gate` building exists** in all 9 District palettes (`assets/structures/Infrastructure/route-gate*`, spec `tools/structures/civic/mid.py:58-77, 257-259`). Its interior is 12×7 with exit mats on the **north and south rims only** (`assets/structures/Infrastructure/route-gate/route-gate-interior.json`). It does not fit the many east-west seams.
- **The game cannot run a walk-through gatehouse yet.** An interior is always left by its south mat, back to the door the Player came in by (`World.ts:1243-1264` `leaveInterior` / `doorOutside`). A pass-through gate needs one exit target per mat.
- [gen3-world-connections.md §4.2](./gen3-world-connections.md) already lists "a checkpoint (badges, item, bike, event)" as the second reason to use a gate instead of an open seam.
- `tools/maps/mapgen.py` writes `world-report.md` and lints seams (`mapgen.py:979`). It has no notion of gates or of a District order.

---

## 3. Proposal (not a decision)

### 3.1 In one paragraph

Each **gate** stands on a seam where the world crosses into a District that is still locked.
- A police officer (**CẢNH SÁT**, sprite `guard`) stands beside the seam.
- Phase 1 needs no new building or engine work. The check runs in `World.ts` `step()` at the same place as the lab aide's check. It covers the whole seam, including the 48-cell water seams where no single NPC can stand.
- When the Player is blocked, the officer reads out a checklist and walks the Player one step back.
- The checklist is cumulative (badges, the rival battle, later quests). The first pass is stamped in `GAME.flags`.
- The gate only ever blocks **entering** a higher-ranked District. Leaving one is always allowed.
- The level cap stays exactly as decided (§2.3): EXP stops and Gym Leaders refuse, with no obedience rule. Each District just names the cap row it starts at.
- Wild levels get one band per District, anchored to the Emerald gap: wild max = next ace − 7 = cap − 12.

### 3.2 District order and the gates

**Stage** = the number of badges needed to enter a map. The table follows the gym order and the maps between gyms. Where a map's theme District and its place in the order disagree, the stage wins for gating and the theme still drives the art (see §3.12, Q6).

| Stage | Opens with | Maps | New gym | Cap |
|---|---|---|---|---|
| 0 | start | start-town, route-1, city-a, route-2, bloom-town, root-cave | grass (city-a) | 18 |
| 1 | Huy hiệu Lá | hub-city, route-3, city-b | psychic (city-b), electric (hub-city, door at 2 badges) | 23 |
| 3 | Huy hiệu Sấm | route-7, port-city, power-tunnel | water | 31 |
| 4 | Huy hiệu Sóng (+ Surf) | route-6, flint-city, route-5, old-mine, moonstone-cave, route-8, tide-cave; Surf: route-9a, isle-town, route-9b, route-10 | rock | 35 |
| 5 | Huy hiệu Đá | route-14, dune-city, route-16 | ground | 39 |
| 6 | Huy hiệu Cát | route-11, fen-city, route-12, rosestone-cave | poison | 43 |
| 7 | Huy hiệu Độc | route-4, cinder-city, route-4b, magma-cave, route-15, starfall-town, route-15b, frost-cave | fire | 47 |
| 8 | Huy hiệu Lửa | route-17 → Victory Road → League (not built) | League | 50 … 58 |

Stage 2 adds no map. The second badge only opens the hub-city gym door.

**The 14 crossings that need a gate, plus the planned League guard** [MEASURED]. This is the full set of cross-stage edges with every seam two-way. With the three one-way seams of §2.1 as they are today, only 10 of them can be reached (G5, G8, G10 and G12 cannot).

| # | Seam (from → into) | Kind | Into stage | Requires (cumulative) |
|---|---|---|---|---|
| G1 | route-2 north → hub-city | land seam, 8 cells | 1 | badges ≥ 1 |
| G2 | hub-city east → route-7 | land, 8 | 3 | badges ≥ 3, `rival-2` |
| G3 | hub-city → power-tunnel mouth | cave warp | 3 | as G2 |
| G4 | port-city north → route-6 | land, 8 | 4 | badges ≥ 4 |
| G5 | port-city east → route-8 (exit missing today) | land, 8 | 4 | as G4 |
| G6 | route-7 → moonstone-cave B1F mouth | cave warp | 4 | as G4 |
| G7 | city-b east → route-5 | land, 8 | 4 | as G4 |
| G8 | start-town east → route-10 (exit missing today) | land 8 + water 24 | 4 | as G4 |
| G9 | route-6 east → route-14 | land, 6 | 5 | badges ≥ 5, `rival-3` |
| G10 | route-8 north → route-16 | land, 6 | 5 | as G9 |
| G11 | bloom-town east → route-11 | land, 6 | 6 | badges ≥ 6 |
| G12 | route-10 north → route-12 | **water, 48 cells** | 6 | as G11 |
| G13 | city-b west → route-15b | land, 8 | 7 | badges ≥ 7 |
| G14 | hub-city west → route-4 | land, 8 | 7 | as G13 |
| (G15) | route-17 badge check (existing `badge-guard`) | land | 8 | badges = 8 (+ `rival-4`, optional) |

- port-city south → route-9a needs no gate while the Surf rule is "4 badges". Both sides are stage 3 and 4, and Surf opens at 4.
- Checks of the gate set, re-run with these ranks [MEASURED]. **They assume Q8 = yes**: the three missing exits are added and every seam is two-way.
  - For every badge count 0–8, the reachable places are exactly the planned stages: no bypass through any cave, nothing missing.
  - With the exits as they are today, nothing outside the plan is reachable either. But at 4 badges route-8, tide-cave, route-9a, isle-town, route-9b and route-10 stay unreachable. route-8 opens at 5 (from route-16) and the sea loop at 6 (from route-12).
  - every gym is in a stage the Player reaches before needing its badge;
  - every stage that adds maps has a Pokémon Center: city-a, bloom-town, hub-city, city-b, port-city, flint-city, isle-town, dune-city, fen-city, cinder-city, starfall-town;
  - all 8 gyms are reachable without Surf.

### 3.3 The gate on the map

**Phase 1: a seam check plus an officer (recommended first).**
1. `World.ts` `step()` already intercepts the connection crossing for the lab aide (`World.ts:590-598`). Add a second test there: `gateAt(this.meta.slug, conn.to)`.
   - If the gate is closed, open the officer's lines, then `stepBack`.
   - Cave mouths get the same test in `enterInterior` (`World.ts:1210`), before the fade.
2. The officer is an ordinary NPC (sprite `guard`) placed in the map's `npcs` 1–2 cells beside the seam, facing the road. He never stands on the path.
   - Talking to him shows the same checklist.
   - The 48-cell water seam G12 gets an officer on a patrol boat: an NPC on a water cell next to the seam (there are already NPCs on water cells in Gen 3, the swimmers).
3. The test is **directional**: block only when `stage(to) > stage(from)` and the checklist is not met. Walking from a higher stage into a lower one never asks anything. This also covers online saves that are already past a gate.
4. Once passed, the gate stays open for that player: the flag `pass:stage-<n>`, for the stage entered (FR `VAR_MAP_SCENE_ROUTE23` / EM `FLAG_ENTERED_ELITE_FOUR`). Adding a requirement in a later update then never re-blocks a player who already passed.
5. The existing `badge-guard` becomes gate G15. Same data, and his one-cell step aside stays.

**Phase 2: real gatehouses (later, optional).** Use the `route-gate` building at 2–3 showcase seams, for example G4 port-city → route-6 and G14 hub-city → route-4. This needs:
1. A pass-through interior: one exit target per mat. The `leaveInterior` / `doorOutside` model in `World.ts:1243-1264` sends the Player back where they came from.
2. An east-west variant of the 12×7 interior.
3. A mapgen op that cuts the seam closed and places the two doors.

The check itself is the same code as phase 1. Hoenn manages without gatehouses (§1.1 item 6), so phase 1 is already Gen-3-faithful.

### 3.4 What the officer checks

Requirement vocabulary over state that already exists. Each item has a Vietnamese label for the checklist.

| Kind | Test | Example label |
|---|---|---|
| `badges` | `GAME.badges.length >= n` | "Có 3 huy hiệu" |
| `badge` | that badge is in `GAME.badges` | "Huy hiệu Sóng" |
| `defeated` | id in `GAME.defeated` | "Thắng đối thủ DUY ở Đường số 6" |
| `flag` | id in `GAME.flags` | "Giúp Giáo sư Lâm" *(placeholder)* |
| `item` | `GAME.bag[id] > 0` | only if the user wants a literal ticket (Q2) |

- Each gate's list is the union of the lists of the stages below it. A Gen-3-style check is minimal: test the newest badge plus that stage's story items. Earlier items are implied by the earlier gates.
- Quests do not exist yet. The data leaves `quests: []` per District, and each quest is later one `flag` item.
- **Every required item must be re-tryable, so the gate can never lock a player out:**
  - A Gym Leader can always be challenged again.
  - Rival events re-fire until won (`World.ts:1133-1134`).
  - A required quest must not be missable.
  - A party over the cap is solved at any Center's PC, and the District's wild band is always below the cap (§3.8).

### 3.5 What the officer says (Vietnamese)

**Blocked** (dialogue box, speaker "CẢNH SÁT"; the Player then steps back):
1. "Dừng lại! Đây là trạm soát vé giữa {KHU HIỆN TẠI} và {KHU KẾ TIẾP}."
2. "Muốn qua trạm, bạn cần hoàn thành mấy việc sau:"
3. One line per item: "- Huy hiệu Sóng: CHƯA CÓ" / "- Thắng đối thủ DUY: ĐÃ XONG"
4. "Xong hết thì quay lại đây, tôi đóng dấu cho qua."

**First pass** (fanfare, as the EM League guard plays `MUS_OBTAIN_BADGE`):
1. "Giấy tờ hợp lệ! Tôi đóng dấu vào thẻ của bạn."
2. "{TÊN} được đóng dấu thông hành {KHU KẾ TIẾP}!"
3. "Pokémon hoang dã phía trước khoảng Lv {lo}-{hi}. Giới hạn cấp hiện tại: Lv {cap}."

**Afterwards** (talking to him): "Chúc bạn lên đường bình an!"

**Water seam** (speaker "TÀU TUẦN TRA"): "Vùng biển phía trước chưa mở cho bạn. {checklist} Quay lại khi đủ điều kiện nhé!"

District display names are needed for `{KHU …}`. The repo has none yet; the proposal is to add a `name_vi` per District (placeholders, user to name).

### 3.6 How the Player sees the checklist

1. **The officer's lines** (above), every time the Player is stopped or talks to him.
2. **THẺ** gets one more line under the cap line (`World.ts:1840-1845`): "Trạm kế tiếp: {KHU} - cần: Huy hiệu Sóng, thắng DUY". It shows the lowest closed gate's open items, or "Đã mở mọi khu" when there are none.
3. Optional later: a PokéNav map marker on gate seams (PokéNav is spec'd in [pokenav.md](./pokenav.md)).

### 3.7 Why it never soft-locks

1. **The check is directional** (§3.3 step 3). A player in a higher-stage map can always walk back. Old saves past a gate are never stranded or teleported.
2. **Every stage holds a way to finish its own checklist.** Measured in §3.2: its gym, a Pokémon Center with a PC, and wild Pokémon below the cap.
3. **Blocked means one step back**, like every Gen 3 blocker (§1.1 item 1). The gate cell never becomes a wall the Player can be pushed into. Talking happens before the map change, so the Player is never left on a seam cell.
4. **Required items are re-tryable** (§3.4).
5. **A build check enforces all of this.** The `reach.py` logic becomes `game/tools/check_gates.py`, which runs in CI next to `check_encounters.py`. For every badge count it checks that the reachable set equals the planned stages: no bypass through a cave or a new seam. Until the three missing exits are added (Q8), it checks against the plain run of §3.2. It fails when a new map or cave mouth crosses stages without a gate.

### 3.8 Data shape

Proposed new file `data/world/districts.json`, beside `encounter-rules.json`.
- It references the cap by its `level-caps.json` stage id and never copies the number.
- It lists the gate seams as (map, side, into).
- It is exported by `build_assets.py` as `assets/data/districts.json`.

```json
{
  "version": "1.0.0",
  "about": "Story order, gates and wild bands per District (docs/explanation/research/district-gates.md). Maps keep their theme District for art; `stage` is the badges needed to enter.",
  "wild_rule": { "max": "next_ace - 7", "min": "max - 5", "cave_floor_step": 1, "source": "pokeemerald wild_encounters.json vs trainer_parties.h, median gap 7" },
  "districts": [
    {
      "id": "lagoon", "name_vi": "Khu Đầm Phá", "gym": "water", "stage": 3, "cap_stage": "badges-3",
      "maps": ["route-7", "port-city", "power-tunnel"],
      "wild": { "min": 14, "max": 19 },
      "quests": []
    }
  ],
  "stages": {
    "4": { "requires": [ { "badges": 4, "label": "Có 4 huy hiệu" } ] }
  },
  "gates": [
    { "id": "G4", "map": "port-city", "side": "N", "into": "route-6", "into_stage": 4, "officer": [46, 1] },
    { "id": "G5", "map": "port-city", "side": "E", "into": "route-8", "into_stage": 4, "officer": [94, 40] },
    { "id": "G7", "map": "city-b", "side": "E", "into": "route-5", "into_stage": 4, "officer": [94, 34] }
  ]
}
```

- `officer` coordinates are illustrative. The officer stands beside the seam cells, never on them.
- The checklist belongs to the **stage entered** (`stages.<n>.requires`). Every gate into that stage shares it, like the four Saffron gates sharing one var.
- The stamp is per stage too: `pass:stage-4`. Passing G4 also opens G5–G8, which start in three different Districts but all lead into stage 4.

### 3.9 The level cap rule

**Keep the decided rule unchanged** (`decisions.md:509-519`). The rule is:
- cap = next required Trainer's ace + 5;
- no EXP at or above it, EVs still count, Rare Candy blocked;
- Gym Leaders refuse an over-cap party;
- traded and over-cap Pokémon obey;
- no cap after Champion.

Each District names its `cap_stage` (`badges-<stage>`). The District's cap is the cap the Player has when entering it, and it rises by one row with each badge, inside the District as well (stage 1 holds gyms 2 and 3: 23 → 27).

Not proposed:
- **Gen 3 obedience** (§1.2). It conflicts with `decisions.md:500`, and EXP stop plus the Leader refusal already do the job.
- **The gate refusing an over-cap party.** This is redundant: the Leader in the next District refuses anyway, and it would add a second place to send the player to the PC.

### 3.10 Wild levels per District

Band: wild max = next ace − 7 (= cap − 12; Emerald median, §1.4), and min = max − 5. Base forms sit low in the band and evolved forms high, which is the existing pool rule (`decisions.md:629-631`). Cave floors step +1 per floor down inside the band; the current code uses +2 (`build_assets.py:914`). Surf uses the same band. This is the Mons choice; Gen 3's flat 5–35 is listed only as precedent (§1.4).

| Stage | Next ace | Cap | Proposed wild band | Current (measured, §2.4) | Out of band by > 3 |
|---|---|---|---|---|---|
| 0 | 13 | 18 | 2–6 | route-1 2–5, route-2 3–6, root-cave 10–18 | root-cave (+12) |
| 1 | 18 | 23 | 6–11 | route-3 7–12; hub-city Surf 12–16, city-b Surf 16–20 | city-b Surf (+9) |
| 3 | 26 | 31 | 14–19 | route-7 14–19, port-city Surf 15–19, power-tunnel 19–26 | power-tunnel (+7) |
| 4 | 30 | 35 | 18–23 | route-6 16–24, moonstone 14–21, route-5 7–12, old-mine 22–29, route-8 14–17 (Surf 22–38), tide-cave 28–36, route-9a 11–14, route-9b 8–11, route-10 22–30 | old-mine (+6), route-8 Surf (+15), tide-cave (+13), route-10 (+7) |
| 5 | 34 | 39 | 22–27 | route-14 34–41, route-16 19–22 (sand 30–38, Surf 34–42) | route-14 (+14), route-16 sand/Surf (+11/+15) |
| 6 | 38 | 43 | 26–31 | route-11 22–29, fen-city 24–30, rosestone 24–32, route-12 7–10 (Surf 24–34) | none |
| 7 | 42 | 47 | 30–35 | route-4 28–35, route-4b 32–42, magma 35–44, route-15 28–38, route-15b 26–36, frost-cave 15–21 | route-4b (+7), magma (+9) |
| 8 | 45 (Lorelei) | 50 | 33–38 | Victory Road not built; spec 11 §4.1 plans 40–45 | spec (+7) |

Maps below their band are harmless and are kept: route-5, route-9a, route-9b, route-12 grass, frost-cave. Gen 3 also leaves early tables on late roads. Moving the authored entries of the out-of-band maps into their bands is a data change that §23 currently forbids (Q7).

### 3.11 Code touch points

| File | Change |
|---|---|
| `data/world/districts.json` (new) + `tools/world/build_districts.py` (validator) | the data in §3.8. The validator checks that every world map has exactly one stage, every gate seam exists in `world-report.md`, and every `cap_stage` exists in `level-caps.json` |
| `game/tools/build_assets.py` | export `assets/data/districts.json`; place each gate's officer as an NPC (`guard`); optionally fill pool levels from `wild` (only with Q7) |
| `game/src/gates.ts` (new, pure, no Phaser) | `gateFor(from, to)`, `checklist(gate, GAME)`, `isOpen()`, `stageOf(map)`; `pass:stage-<n>` in `GAME.flags` (no save-schema change: `flags` already exists, `state.ts:41-42`) |
| `game/src/scenes/World.ts` | `step()` beside the aide check (590-598); `enterInterior()` for cave mouths (1210); an officer branch in `interactAt()`, generalising `badge-guard` (1361-1366, 301-302); a THẺ line (1840-1845) |
| `game/tools/check_gates.py` (new, CI) | the reachability proof of §3.7 item 5 |
| `tools/maps/mapgen.py` | lint: a seam or cave mouth that crosses stages without a gate entry; a gate column in `world-report.md` |
| Tiled maps of port-city, start-town | add the missing exits to route-8, route-9a and route-10 (if Q8 = yes) |
| `GLOSSARY.md`, `docs/agents/decisions.md` | the new terms and the decision, once answered |

### 3.12 Open questions (recommended answer first)

1. **Gate form.** *Recommended:* phase 1 seam check + officer NPC now; real gatehouses at 2–3 seams later. Phase 2 needs pass-through interiors (§3.3).
2. **Is the "ticket" a literal item?** *Recommended:* no. The precedents use real items (FR Tea, SS Ticket). Here the checklist itself is the ticket, and a passed gate stamps `pass:stage-<n>`. A literal item is easy to add as an `item` requirement if wanted.
3. **What is on each checklist beyond the badge?** *Recommended:* the newest badge plus the rival battle of that stretch (G2 `rival-2`, G9/G10 `rival-3`, G15 `rival-4` optional). Quests come later as `flag` items, never missable, never added to a gate a player already passed.
4. **Level cap.** *Recommended:* keep `decisions.md:509-519` exactly: EXP stop plus the Gym Leader refusal, no Gen 3 obedience (`decisions.md:500`). The cap is shown at the gate and on THẺ.
5. **Should the gate also refuse an over-cap party?** *Recommended:* no (§3.9).
6. **The meaning of "District" when theme and order disagree.** Examples: hub-city (electric) is entered at 1 badge; route-5 (quarry) at 4; the mystic loop (route-15, route-15b, starfall-town, frost-cave; psychic theme) behind 7 badges, because it joins route-4b; route-7 and route-16 have the coast theme. *Recommended:* keep `GLOSSARY.md` District = theme, and add the term **Stage** ("the badges needed to enter a Map") plus **Gate** ("a checkpoint on a seam into a higher Stage") to the glossary. Districts in `districts.json` list their maps by stage, not by theme.
7. **Wild levels:** move the out-of-band authored entries into the District bands (§3.10), or keep the levels and rely on the gates? *Recommended:* move them. One band per District is the point of the request, and gates alone still leave route-14 at 34–41 against cap 39. This changes the §23 rule that authored entries never change (`decisions.md:633`), so it needs the user's explicit OK.
8. **The three one-way seams** (port-city → route-8, port-city → route-9a, start-town → route-10). *Recommended:* add the missing exits. `world-report.md` lists them, so they look like an export gap, not a design choice. Gates G5 and G8 then cover them.
9. **power-tunnel at stage 3?** It joins hub-city and route-7, and its levels are 19–26. *Recommended:* yes, gate G3 at the hub mouth ("Đường hầm đang bảo trì" by the same officer).
10. **The mystic loop at stage 7 or stage 6?** *Recommended:* 7. Its levels (26–38) fit 7, and it needs one gate (G13) instead of two.
11. **Victory Road band.** *Recommended:* 33–38 by the rule, or 36–40 with Emerald's smaller League gap (5). Spec 11's 40–45 puts the wild max at Lorelei's ace (45), a gap of 0. Decide when the League maps are built.

### 3.13 Risks and conflicts with settled decisions

| Decision | Conflict | Handling |
|---|---|---|
| `decisions.md:344` v0.4, "the whole world is open" | gates close 14 crossings | needs the user's OK; record as a new decision |
| `decisions.md:345`, gym doors by badge count | two badge checks (door and gate) | keep both. The door check stays the single source for gyms; gates read badges through the same `GAME.badges` |
| `decisions.md:344-345`, Surf = 4 badges (prototype rule; code `World.ts:157, 1278`) | port-city → route-9a has no gate because Surf opens at 4 | if the Surf rule changes, `check_gates.py` fails and a gate is added there |
| `decisions.md:500` (traded Pokémon obey), `509-519` (caps) | none, if Q4 is accepted | Gen 3 obedience is precedent only |
| `decisions.md:633` (§23 authored spawn entries never change) | the wild bands of §3.10 | Q7 |
| `decisions.md:820` (HMs have no badge check) | none | Gen 3 HM badges are precedent only |
| `GLOSSARY.md:21-23` District = theme | stage ≠ theme for some maps | Q6 (new terms, no redefinition) |
| §24 online, players on the same map | the officer is shared, but the check is per player | the officer NPC is a map NPC like the nurse; the state is in each player's `GAME.flags` |
| spec 11 §4.1, route-17 badge guards | G15 is that guard | the gate data replaces the hard-coded `LEAGUE_BADGES` branch when route-17 is built |
| rival-3 as a G10 requirement | a player who reached route-8 by another road must walk to route-6 | the officer says where: "DUY đang đợi bạn ở Đường số 6"; make it optional if this feels forced |

[em-oldale]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/OldaleTown/scripts.inc#L8-L21
[em-rusturf]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/RusturfTunnel/scripts.inc#L246-L256
[em-norman]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/PetalburgCity_Gym/scripts.inc#L101-L109
[em-r111]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/Route111/scripts.inc#L189-L197
[em-r112]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/Route112/scripts.inc#L10-L33
[em-r112map]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/Route112/map.json#L45
[em-meteor]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/MeteorFalls_1F_1R/scripts.inc#L78
[em-r120]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/Route120/scripts.inc#L34-L37
[em-fortree]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/FortreeCity/scripts.inc#L18-L80
[em-sooto]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/SootopolisCity/scripts.inc#L10-L31
[em-lily]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/LilycoveCity/scripts.inc#L60
[em-league]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/EverGrandeCity_PokemonLeague_1F/scripts.inc#L46-L86
[em-mauville]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/MauvilleCity/scripts.inc#L67-L96
[em-r110]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/Route110/scripts.inc#L140-L147
[em-r119]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/Route119/scripts.inc#L19-L131
[em-r128]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/maps/Route128/scripts.inc#L11
[em-fms]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/data/scripts/field_move_scripts.inc#L4
[em-obey]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/src/battle_util.c#L3909-L3947
[em-pm]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/src/party_menu.c#L120-L127
[em-fca]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/src/field_control_avatar.c#L450-L476
[em-wild]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/src/data/wild_encounters.json
[em-parties]: https://github.com/pret/pokeemerald/blob/9103e529c2fbdd7add4a1ff3350c6c1f92112c42/src/data/trainer_parties.h#L3367-L3600
[fr-viridian]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/ViridianCity/scripts.inc#L7-L36
[fr-pewter]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/PewterCity/scripts.inc#L256-L284
[fr-pewtermap]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/PewterCity/map.json#L188-L217
[fr-cerulean]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/CeruleanCity/scripts.inc#L7-L15
[fr-saffron]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/Route5_SouthEntrance/scripts.inc#L8-L50
[fr-r22]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/Route22_NorthEntrance/scripts.inc#L4-L17
[fr-r23]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/scripts/route23.inc#L46-L115
[fr-r12]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/maps/Route12/scripts.inc#L16-L29
[fr-fms]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/data/scripts/field_moves.inc#L4
[fr-obey]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/battle_util.c#L3143-L3171
[fr-pm]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/party_menu.c#L3926
[fr-pmh]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/include/constants/party_menu.h#L34-L40
[fr-fca]: https://github.com/pret/pokefirered/blob/ce6406d8c2eaf46d543c8a2606de0c3cb1951982/src/field_control_avatar.c#L605-L610
