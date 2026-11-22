# Capture: how a thrown ball catches

Research behind the game's capture data (decisions.md §17). The game data is
`data/pokemon/pokemon-catch-rates.json` and `data/pokemon/pokemon-capture-rules.json`, read by
`game/src/capture.ts`. This page and `capture-reference.json` next to it are the evidence and the comparison. They are
not read by the game.

Why here and not in `sim/CaptureSim/`: the only model worth running is the game's own `capture.ts`, and
`game/tools/check_capture.ts` already replays the worked examples against it. A Python copy would be a second port to
keep in sync. What is left is evidence and comparison, which belongs with the other `docs/explanation/research/` notes.

Rebuild: `python3 -I tools/data/catch_rates.py --reference-src <dir> [--source-pack <dir> --pack-dirs <a,b>] [--extra-archives <dir>]`.
The paths can also come from the environment (`MONS_REFERENCE_SRC`, …) and are never written into the repo. Every
number is checked against a verbatim snippet of its source: 92 snippets, listed in `capture-reference.json` under
`engine.*.evidence`, `engine.numbers` and `gen3`. Reference engine code is quoted under MPL-2.0
(`LICENSES/MPL-2.0.txt`, `THIRD_PARTY_NOTICES.md`).

## The rule the game uses (the reference engine's default calculator)

| # | Step | Value |
|---|---|---|
| 1 | Master / Origin Ball | caught, no roll |
| 2 | Catch rate | the form's rate, else the species' (default 45) |
| 3 | HP and ball | `a = (3·maxHP − 2·HP) × rate × ball / (3·maxHP)`, floats; ×0.5 for a throw outside a battle; a ball whose condition fails counts ×1 |
| 4 | Status | sleep / freeze ×2.5, poison / burn / paralysis ×1.5 |
| 5 | Low level | `max(trunc((36 − 2L) / 10), 1)` below Lv 13: ×3 at Lv 1–3, ×2 at Lv 4–8 |
| 6 | Level-gap penalty | written upstream (−2% per level, max −90%) but never applies: the lookup cannot find a wild target and the division is integer-only. Not ported |
| 7 | Critical capture | multiplier by species caught: ≤ 30 ×0, ≤ 150 ×0.5, ≤ 300 ×1, ≤ 450 ×1.5, ≤ 600 ×2, more ×2.5; critical if `roll(256) < round(a × mult / 6)`; then one check decides |
| 8 | Shakes | `s = round(65536 / (255/a)^0.1875)`; 4 checks `roll(65537) < s`, all 4 = caught. P ≈ (a/255)^0.75 |
| 9 | Display | 4 passed checks show 3 wobbles; a critical capture shows a critical wiggle and 1 wobble; a success on an already caught species is shown as a 1-wobble critical |

Before any roll the reference engine drops the ball in these cases: the target is not wild, it is marked
uncatchable, it is in someone else's battle, the battle is not singles, or it is not the thrower's turn. In the game,
Trainer battles refuse the ball.

Balls: 48 entries in the rules file. Besides the flat ones (Poké 1, Great 1.5, Ultra 2, Sport 1.5, Master always),
the conditional balls are:

- Safari ×1.5 outside a battle.
- Fast ×4 at base Speed ≥ 100.
- Level ×2 / ×3 / ×4.
- Lure ×4 when hooked.
- Heavy ×1.5 / ×2.5 / ×4 by weight.
- Love ×8 / ×2.5.
- Moon by moon phase at night.
- Net ×3 on Bug / Water.
- Dive ×3.5 under water.
- Nest (41 − L)/10 below Lv 30.
- Repeat ×3.5 when the species is already caught.
- Timer 1 + 0.3 × turn (max 4).
- Dusk ×3.5 / ×3 in the dark.
- Quick ×5 on turn 1.
- Park ×2.5 in temperate areas.
- Dream ×4 if asleep.
- Beast ×5 on Ultra Beasts, ×0.1 on everything else.

## The official Gen 3 rule (pret/pokeemerald `Cmd_handleballthrow`)

- Trainer battles refuse the ball.
- `a = (rate × ball10 / 10) × (3·maxHP − 2·HP) / (3·maxHP)` in unsigned integers, truncated at every `/`.
- Status: sleep / freeze ×2, poison / burn / paralysis ×1.5.
- `a > 254` is a sure catch. Otherwise `b = 1048560 / Sqrt(Sqrt(16711680 / a))`, using the integer BIOS square root,
  and 4 checks `Random() < b` on 0..65535. P ≈ a/255.
- Balls: Poké 1, Great 1.5, Ultra 2, Master always, Net 3, Dive 3.5 (underwater maps), Nest (40 − L)/10 below
  Lv 40 (min 1), Repeat 3, Timer (turn + 10)/10 (max 4), Luxury / Premier 1.
- Safari: ×1.5, with the rate taken from the catch factor. The factor is rate × 100 / 1275, and Go Near adds
  +4 / +3 / +2 / +1 (max 20).
- No critical capture, no level bonus, no throws outside a battle.

## Differences

| | Game | Gen 3 |
|---|---|---|
| shake rule | P ≈ (a/255)^0.75 | P ≈ a/255 |
| math | floats | integers, truncated |
| sleep / freeze | ×2.5 | ×2 |
| low level | ×3 / ×2 | — |
| critical capture | from 31 species caught | — |
| Repeat / Timer / Nest | ×3.5 / +0.3 a turn / below Lv 30 | ×3 / +0.1 a turn / below Lv 40 |

## Catch-rate data

The game rates (`pokemon-catch-rates.json`) are the reference engine's species values. For #001–151 they equal both
Emerald and Mons' Gen 3 table (`data/stats/species.json`).

- **Game differs from the current official value (PokeAPI), 14 species:**
  - Rayquaza 3 (official 45).
  - Basculin 190 (25).
  - Minior 255 (30; its Meteor form 30).
  - Cosmog, Cosmoem, Solgaleo and Lunala 3 (45).
  - Necrozma 3 (255).
  - Hisui evolutions, which use Legends: Arceus values: Wyrdeer 45, Kleavor 15, Ursaluna 20, Basculegion 45,
    Sneasler 20, Overqwil 45 (official 135 / 115 / 75 / 135 / 135 / 135).
- **Emerald differs from the current official value, 3 species:** Kyogre and Groudon 5 (now 3), Rayquaza 3 (now 45).
- **Forms with their own rate:** Mega Rayquaza 45, Minior Meteor 30, Ultra Necrozma 255, Bloodmoon Ursaluna 5.

## The source pack

The source pack is the bundle the reference data was taken from. Its catch rules:

- It keeps the default calculator. Throws outside a battle are allowed (the bypass list is Safari and Master Ball).
- Its data archive changes two species rates: Ultra Necrozma to 5 and Terapagos to 3. An archive outside the pack would
  also set Eternatus and Terapagos to 3.
- Its add-ons:
  - From the second Quick Ball thrown at the same Pokémon, the catch rate is divided by the Quick Ball multiplier.
  - Catch-boost meals multiply the catch rate.
  - Aggressive Pokémon cannot be caught, and a failed throw counts as provocation.
  - Raid bosses keep a catch-rate multiplier of 1.0.

None of these are in the game. Full list: `capture-reference.json` → `sourcePack`.

## Worked examples (chance that one throw catches)

maxHP comes from the Gen 3 HP formula (IV 15, EV 0). "Game" assumes the throw is in battle and that no species has
been caught yet, unless the case says otherwise.

| Case | Game | Gen 3 |
|---|---|---|
| Pidgey Lv 3, full HP, Poké Ball | 99.99% | 33.69% |
| Pidgey Lv 3, same, thrown outside a battle | 59.46% | 33.69% |
| Pidgey Lv 15, full HP, Poké Ball | 43.87% | 33.69% |
| Bulbasaur Lv 5, full HP, Poké Ball | 20.09% | 6.25% |
| Bulbasaur Lv 5, half HP, Great Ball, paralysed | 62.06% | 27.97% |
| same, 151 species caught | 64.36% | 27.97% |
| Mewtwo Lv 70, 1 HP, asleep, Ultra Ball | 11.92% | 4.37% |
| Mewtwo Lv 70, full HP, Ultra Ball | 2.64% | 0.83% |

`node game/tools/check_capture.ts` throws each case 200,000 times with `capture.ts` and checks that the result is
within 1 point of the "Game" column.
