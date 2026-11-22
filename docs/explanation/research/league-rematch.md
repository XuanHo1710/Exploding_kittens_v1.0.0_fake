# League rematch: what the reference trainer data does

Research behind the Elite Four / Champion rematch, League loss and level-cap rules (decisions.md §21, answer 3 and
follow-up answers 1–4: "like the reference"). The game data is `data/battle/trainers.json` (`elite_four[].rematch`,
`champion.rematch_variants_by_rival_starter`, `league`) and `data/battle/level-caps.json`, both built by
`tools/data/build_trainers.py`. This page is evidence and comparison; the game does not read it.

**Sources (read as data only, 2026-11-19):** the reference trainer data pack (a zip of trainer, spawn, loot and dialog
JSON, version 21) and the trainer add-on it extends (jar 0.19.2-beta, its built-in trainer JSON and its server
config). Both are LGPL-3.0 (the two licence files shipped with them are the plain LGPL-3.0 text, no extra terms);
names, versions and licences are in [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md). Only facts and
numbers were taken; no file or text was copied, nothing was run. Paths below are inside those archives
(`<ns>` = the add-on's namespace).

## 1. Two kinds of file per trainer

| file | what it holds |
|---|---|
| `data/<ns>/trainers/<id>.json` | the team: species, level, moves, held item, ability, nature, IVs, EVs; the bag (`full_restore` × n) and `battleRules.maxItemUses`; the AI type with weights (`moveBias 1`, `switchBias 0.5`, `statMoveBias 1`, `itemBias 0.8`, `maxSelectMargin 0.15`); `battleFormat` (singles / doubles); optional `identity` |
| `data/<ns>/mobs/trainers/single/<id>.json` (else `groups/<id prefix>.json`) | when and how often: `series`, `requiredDefeats` (a list of OR-groups that must all be met), `type` (e4, champ, rival, leader …), `maxTrainerWins` (-1 = no limit), `maxTrainerDefeats`, `battleCooldownTicks`, `optional`, `signatureItem`, spawn weight and location tags |

Every one of the add-on's 1394 trainers without a `single/` file matches a `groups/` file named like its id prefix
(checked over all 1559 trainers), so `elite_four_lorelei_019a` takes `groups/elite_four.json`.

## 2. The Elite Four and Champion variants

| set | trainer ids (Kanto League) | levels | gated by | per-team limits |
|---|---|---|---|---|
| A. the pack's own Kanto series (the **default** series a new player starts) | `kanto_league_lorelei`, `_bruno`, `_agatha`, `_lance`, `kanto_champion_blue` | 75 / 80 / 85 / 90 / 100 (6 Pokémon each, full EVs, held items) | strict chain: last Gym Leader → Lorelei → Bruno → Agatha → Lance → Champion | `maxTrainerDefeats 1`, `maxTrainerWins -1`, cooldown 240 ticks (12 s); bag 4 Full Restores (Champion 6) |
| B. the add-on's hardest built-in Kanto series (difficulty 9 against 7 for A) | `elite_four_lorelei_004d` / `_004e`, `bruno_0050` / `_0051`, `agatha_0053` / `_0054`, `lance_0056` / `_0057`; `champion_terry_01b6` / `_01b7` / `_01b8` | 84–85 (Champion 85), legendaries, full EVs | each member needs one late trainer of that series; the Champion needs **one of the two teams of every member** (OR-groups); the pack narrows the Champion's requirement to Bruno only | same: one defeat per team, unlimited losses, 12 s; bag 2 Full Restores |
| C. the official FRLG teams inside the add-on | first League `elite_four_*_019a`–`019d`; post-game `elite_four_*_02df`–`02e2`; Champion rematch `champion_terry_02e3`–`02e5` | first 51–60, post-game 63–72, Champion rematch 72–75 (the FRLG numbers) | the E4 ones have no own spawn file → `groups/elite_four.json`: optional, no prerequisites, rare locations; the Champion rematch ones are optional "rival" trainers after a late trainer | one defeat each |

Notes:
- The ids of B and C are the FRLG trainer slots in hex (0x19A = 410 = `TRAINER_ELITE_FOUR_LORELEI`, 0x2DF = 735 =
  `TRAINER_ELITE_FOUR_LORELEI_2`, 0x1B6–0x1B8 = `TRAINER_CHAMPION_FIRST_*`, 0x2E3–0x2E5 = `TRAINER_CHAMPION_REMATCH_*`).
  The 02xx teams are exactly pret/pokefirered's `*_2` / `CHAMPION_REMATCH_*` parties (Lorelei Dewgong 64 … Lapras 66;
  Champion Heracross 72 … starter 75).
- C's E4 teams carry `identity` = the name of B's member ("Elite Four Lorelei"), so they count as the same person
  (only one entity with an identity exists at a time, the server config's `uniqueTrainerRadius`).
- The two teams of one member in B are **alternatives**, not first / rematch: either counts for the Champion's
  requirement and for the "defeat the Elite Four" achievement (`count 1` over both ids).
- No team in A, B or C is scaled to the player: all levels are fixed numbers in the team file.

## 3. How the stronger League unlocks

1. **Series order, not a flag on the same trainers.** The pack chains its series: Kanto (start) → Johto → Hoenn →
   Sinnoh, each with `requiredSeries` = the one before; the add-on's hard Kanto series (set B) comes later (the pack
   makes it require another completed series). A player meets the Kanto Elite Four again — stronger, Lv 84–85 — only
   after finishing earlier Leagues.
2. **Inside a series each League trainer is beaten once** (`maxTrainerDefeats 1`). Losing costs nothing but the 12 s
   cooldown: there is no run to restart, each member is its own step in the chain. The Hoenn Champion allows 5 wins,
   the optional post-game rival 10 (same team every time).
3. **Starting a series again** at the trainer association resets that player's progress in the current series; in
   return a completed series permanently raises the player's luck for trainer loot. "Freeroam" (level cap 100) is
   offered only after a completed series.
4. **Level cap instead of scaling** (server config): initial cap 20; then the strongest Pokémon of the player's next
   required trainer + 5; no EXP at or above the cap (`allowOverLeveling = false`); a trainer refuses a player whose
   party is over the cap. Trainers only spawn within a level gap of the player (`maxLevelDiff 10`, scaled by the
   player's level, at least 4; force-battle gap 12).

## 4. Rewards

- Badges and the League trophy drop **only on the first defeat** (loot condition `defeat_count == 1`); the Champion
  also gives one rare ball.
- E4 members (pack): 1–2 rolls from the rare / epic / legendary reward tables per defeat (so once, given one defeat).
- Dialog: per-situation line pools (battle start / won / lost, on cooldown, level cap too low / too high, missing
  required trainer, wrong series), random line per event.

## 5. What Mons takes (data in `trainers.json` and `level-caps.json`)

Decided 2026-11-19 (decisions.md §21 answer 3 and follow-up answers 1–4):

| reference | Mons |
|---|---|
| stronger Kanto League only after an earlier League is cleared | **rematch teams after becoming Champion** (`league.rematch.unlock = "champion"`, the flag set after the first Hall of Fame) |
| the stronger teams are a different, harder team set with fixed levels | the FRLG post-game teams the add-on itself carries (set C, = pret `TRAINER_ELITE_FOUR_<member>_2`, `TRAINER_CHAMPION_REMATCH_<starter>`) at their **official FRLG levels**: E4 63–72, Champion 72–75 (`level_ratio 1`, `level_scaling = "fixed"`); the first League keeps the Mons ratio 42/50 = 0.84 (43–50 / 48–53) |
| no scaling to the player | none |
| level cap = next required trainer's strongest Pokémon + 5 (own levels, initial cap 20), no EXP at the cap | **same rule with official-feeling levels:** next required trainer's ace in `trainers.json` + 5 (Leaders 18 … 47, League 50 … 58), no cap after becoming Champion; no EXP at the cap, EVs still gained; no refusal of over-cap players (`level-caps.json`, spec 11 §4.3) |
| one win per team, unlimited losses, 12 s cooldown, no run to restart | **losses keep progress:** no blackout, the party is healed on the spot, defeated members stay defeated (`league.on_loss`, `loss_resets_run false`); progress cleared only after the Champion is beaten; re-challenge without limit (`max_wins: null`); no cooldown |
| first-defeat-only trophy / rewards | each team pays its prize money once (`reward_once_per_team`); Hall of Fame record + `flags.champion` on the first win |
| two alternative teams per member | not used (FRLG has one rematch team per member) |

The rematch teams contain 7 Gen 2 species (Crobat, Misdreavus, Steelix, Heracross, Piloswine, Kingdra, Tyranitar;
`league.rematch.species_beyond_151`). They are allowed; until their own sprites are drawn they use sprites from the
3D-model fallback pipeline. `game/tools/build_assets.py` does not export them yet (task spec 11 §9 L1b), so nothing
breaks until the League is built (phase L).
