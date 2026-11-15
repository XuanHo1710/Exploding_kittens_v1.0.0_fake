# d32 — Breakable Crates/Pots, Pickup Drops, Weapon Pedestals & Modular Perks

## 1. Wave-2 Target Files & Ownership
- `shared/src/bansung.ts`: Export `CrateKind`, `PickupKind`, `PerkId`, `PerkMods`, `PerkDef`, `BANSUNG_CRATES`, `BANSUNG_PICKUPS`, `BANSUNG_PERKS`, `BANSUNG_CRATE_FIELDS = 5`, `BANSUNG_PICKUP_FIELDS = 5`, plus `BansungCommand` variants `{ t: 'interact' }` and `{ t: 'pick_perk'; perk: PerkId }`.
- `server/src/game/bansung/loot.ts` (new): Crate spawn/damage/respawn, weighted loot rolls, pickup physics/magnet/merge/collection, weapon pedestal swap, perk draft & `recomputeHeroStats()`.
- `server/src/game/bansung/world.ts`: Call `loot.tick(dt)`, expose `cr` / `pk` arrays on `BansungFrame`, trigger `perk_draft` phase on wave clears, route `interact` & `pick_perk` commands.
- `client/src/bansung/render.ts` & `BansungBoard.tsx`: Y-sorted sprite draw, bobbing orbs, `[E]` pedestal prompt, 3-card Wave-Clear Perk Modal + 12s countdown.
- `database-ban-sung/manifest.json`: Normalized prop/pickup sprite strips (`normalized/props/`, `normalized/pickups/`) + SFX keys (`sfx_crate_hit`, `sfx_crate_break`, `sfx_pickup_*`, `sfx_pedestal_swap`, `sfx_perk_pick`).

---

## 2. Shared Schemas & Constants (`shared/src/bansung.ts`)
```ts
export type CrateKind = 'wood_crate' | 'clay_pot' | 'iron_crate';
export type PickupKind =
  | 'hp_orb' | 'hp_pack' | 'energy_orb' | 'energy_cell'
  | 'armor_plate' | 'coin' | 'gem_coin' | 'weapon_pedestal';

export const BANSUNG_CRATE_FIELDS = 5;   // [id, kindIdx, x, y, hpPct(0..100)]
export const BANSUNG_PICKUP_FIELDS = 5;  // [id, kindIdx, x, y, subVal]
// subVal: weaponId for weapon_pedestal; stack count (bits 0..11) | (expiringFlag << 12) for orbs/coins

export interface CrateDef {
  kind: CrateKind; hp: number; armorType: 'light' | 'armored';
  halfW: number; halfH: number; minDrops: number; maxDrops: number; table: 'pot' | 'common' | 'rare';
}
export const BANSUNG_CRATES: Record<CrateKind, CrateDef> = {
  clay_pot:   { kind: 'clay_pot',   hp: 15, armorType: 'light',   halfW: 11, halfH: 10, minDrops: 1, maxDrops: 1, table: 'pot' },
  wood_crate: { kind: 'wood_crate', hp: 30, armorType: 'light',   halfW: 16, halfH: 14, minDrops: 1, maxDrops: 2, table: 'common' },
  iron_crate: { kind: 'iron_crate', hp: 75, armorType: 'armored', halfW: 18, halfH: 15, minDrops: 2, maxDrops: 3, table: 'rare' },
};

export const BANSUNG_PICKUP_CONSTS = {
  R_COLLECT: 18, R_MAGNET: 76, PET_MAGNET_BONUS: 40, R_INTERACT: 44,
  MAGNET_ACCEL: 950, MAGNET_MAX_SPEED: 420,
  TTL_ORB_S: 22, TTL_BLINK_S: 4, TTL_PEDESTAL_S: 45,
  MAX_PICKUPS: 96, PEDESTAL_SWAP_CD_S: 0.4, PERK_DRAFT_S: 12,
} as const;
```
Biome visual mapping (`desert | crypt | cyber` from d06) reuses the 3 `CrateKind` physics definitions with themed sprite prefixes (`desert_pot` / `crypt_urn` / `cyber_canister`).

---

## 3. Breakable Crates & Loot Table Algorithms (`server/src/game/bansung/loot.ts`)
1. **Placement & Spatial Hash**: Arena template provides 14–22 anchor slots snapped to 32px grid (`>= 96px` from hero/boss spawns). Live crates register as `solidAABB` in d05 spatial hash (blocking movement & bullets, taking damage via d33 `light`/`armored` formula; dash/explosions deal 2x prop damage).
2. **Destruction & Ejection**: When `hp <= 0`: remove from spatial hash, emit `fx` event `crate_break(kindIdx, x, y)`, roll `minDrops..maxDrops` entries, spawn pickups with radial burst `vx, vy` (`70..130 px/s`, `friction = 6.5/s`) and client fake-Z hop (`z = |sin(pi * t / 0.35)| * 18px`).
3. **Wave Replenishment**: On start of odd waves `3, 5, 7, 9` (and every 2 waves in endless), respawn up to `6` broken crates at unoccupied anchors (`dist > 120px` from all living heroes).
4. **Weighted Drop Tables** (weights sum to 100):
   - `pot`: `none:35, energy_orb:32, coin:23, hp_orb:6, armor_plate:4`
   - `common` (`wood_crate`): `none:20, coin:30, energy_orb:25, hp_orb:12, armor_plate:8, weapon_pedestal:5`
   - `rare` (`iron_crate`): `coin:20, energy_cell:20, hp_pack:18, armor_plate:18, weapon_pedestal:24`
   - `mob_kill` hook: normal `18%` roll (`energy_orb:50, coin:35, hp_orb:10, armor_plate:5`); elite `65%` roll (`coin/gem_coin/energy_cell/hp_orb`); boss `100%` burst of 8 orbs + 1 guaranteed Rare/Epic `weapon_pedestal` on waves 4 & 7.

---

## 4. Pickup Magnet, Co-op Fairness & Weapon Pedestals
- **Amounts**: `hp_orb: +2 HP`, `hp_pack: +4 HP`, `energy_orb: +10 Energy`, `energy_cell: +30 Energy`, `armor_plate: +2 Armor`, `coin: +1 Gold`, `gem_coin: +5 Gold`.
- **Needs-Based Magnet Filter**: At 30Hz, each pickup evaluates eligible heroes (`alive && !downed`):
  - `hp_orb`/`hp_pack`: only heroes with `hp < maxHp`
  - `energy_orb`/`energy_cell`: only heroes with `energy < maxEnergy`
  - `armor_plate`: only heroes with `armor < maxArmor`
  - `coin`/`gem_coin`: any hero (grants `+value` to collector + `Math.ceil(value * 0.5)` shared co-op gold to living teammates so kills never starve support players)
  - `weapon_pedestal`: **never magnetized**; requires `{ t: 'interact' }`.
- **Magnet Velocity**: Effective radius `R = (R_MAGNET + (hero.hasPet ? PET_MAGNET_BONUS : 0)) * hero.mods.magnetMul`. Pickups inside `R` accelerate along unit vector toward nearest eligible hero (`v = min(420, v + 950 * dt)`). Collection triggers inside `R_COLLECT = 18px`, scaled by `(1 + hero.mods.pickupValueMul)`.
- **Cap & Merge (`MAX_PICKUPS = 96`)**: Before spawning beyond 96, merge into an existing pickup of matching `kind` within `48px` (up to `5x` stack in `subVal`), or despawn the oldest `coin`/`energy_orb` (never despawn `weapon_pedestal`).
- **Weapon Pedestal Swap**: Rolls weapon tier by wave (`1..3: Common 75%/Rare 25%`, `4..7: Common 30%/Rare 50%/Epic 20%`, `8+: Rare 35%/Epic 45%/Legendary 20%`), excluding weapons already held by nearby heroes when possible. On `[E]` (`interact` within `44px` & `swapCd <= 0`): swap pedestal `weaponId` with hero's active slot (if starter sidearm, consume pedestal without leaving starter behind; else put hero's old `weaponId` onto pedestal and reset TTL to `45s`, `swapCd = 0.4s`).

---

## 5. Modular Wave-Clear Perks / Buffs Registry
- **Trigger & Draft Loop**: On clearing waves `2, 4, 6, 8` (and `wave % 2 === 0` in endless), `world.ts` pauses next-wave countdown in `phase = 'perk_draft'` (`12s` max). Each human gets 3 unique `PerkId` choices rolled by rarity weight (`common:60, rare:30, epic:10`) excluding perks at `maxStacks`. Bots (d07) auto-pick within `1.0s`. When all humans pick or timer hits `0`, unpicked players receive `choices[0]` and wave advances.
- **Modular Registry Pattern** (aligns with d46):
```ts
export interface PerkMods {
  maxHpAdd?: number; maxArmorAdd?: number; maxEnergyAdd?: number;
  dmgMul?: number; fireRateMul?: number; reloadSpeedMul?: number; moveSpeedMul?: number;
  critChanceAdd?: number; dashCdMul?: number; extraPierce?: number; extraBounce?: number;
  blastRadiusMul?: number; energyCostMul?: number; magnetMul?: number; pickupValueMul?: number;
  reviveSpeedMul?: number; coopAuraDmg?: number; killHealEvery?: number; staticShield?: boolean;
}
export interface PerkDef {
  id: PerkId; name: string; vnName: string; rarity: 'common' | 'rare' | 'epic';
  maxStacks: number; icon: string; desc: string; mods: PerkMods;
}
```
- **12 Starter Perks (`BANSUNG_PERKS`)**:
  1. `vitality_boost` (common, x3): `maxHpAdd: 4` (+4 instant heal)
  2. `iron_bastion` (common, x3): `maxArmorAdd: 3`, armor regen `+30%`
  3. `energy_overflow` (common, x2): `maxEnergyAdd: 60, energyCostMul: -0.20`
  4. `quick_hands` (common, x3): `fireRateMul: 0.20, reloadSpeedMul: 0.25`
  5. `swift_boots` (common, x2): `moveSpeedMul: 0.15, dashCdMul: -0.20`
  6. `magnet_aura` (common, x2): `magnetMul: 0.50, pickupValueMul: 0.25`
  7. `piercing_rounds` (rare, x2): `extraPierce: 1, critChanceAdd: 0.15`
  8. `blast_master` (rare, x2): `blastRadiusMul: 0.25, dmgMul: 0.12`
  9. `vampiric_fang` (rare, x2): `killHealEvery: 8` (+1 HP every 8 kills)
  10. `coop_med_aura` (rare, x1): `reviveSpeedMul: 0.40, coopAuraDmg: 0.10` (140px aura)
  11. `ricochet_shot` (epic, x1): `extraBounce: 1` (shots bounce once off walls/crates)
  12. `static_shield` (epic, x1): `staticShield: true` (90px `1.2s` stun shockwave on armor break, 10s CD)
- **Stat Aggregation**: `recomputeHeroStats(hero)` sums additive modifiers (`1 + sum(mul)`) into `hero.mods` on pick/respawn so d26-d33 formulas read `hero.mods` in O(1) without per-shot perk loops.

---

## 6. Miragine-Style Frame Specs & Asset Sources
Anchor convention follows `MIRAGINE_ANIMS` (`[frames, cellW, cellH, offX, offY]`) centered over reused Miragine `shadow.png` (`38x16, offX:-19, offY:-8`; scale `0.65` for 16px orbs, `1.0` for crates/pedestals):
| Sprite ID | `[frames, w, h, offX, offY]` | Notes / Fallback |
|---|---|---|
| `prop_clay_pot` | `[3, 24, 28, -12, -24]` | f0 intact, f1 chipped (`<60%`), f2 cracked (`<25%`) |
| `prop_wood_crate` | `[3, 32, 36, -16, -32]` | 3 damage states; 1px `#1a1618` outline |
| `prop_iron_crate` | `[3, 36, 40, -18, -36]` | 3 damage states + metallic corner rivets |
| `prop_pedestal` | `[2, 32, 36, -16, -30]` | f0 idle altar, f1 glowing rune; gun floats `+sin(t*3)*3px` |
| `pk_hp_orb` / `pk_energy_orb` | `[4, 16, 16, -8, -14]` | 4-frame glow pulse @ 8 FPS + bob `sin(t*5)*2.5px` |
| `pk_armor_plate` / `pk_coin` | `[4..6, 16, 16, -8, -14]` | 4f shield glint / 6f coin spin @ 10 FPS |

Assets sourced via `d09`/`d12`/`d15` CC0/MIT normalized pipeline + deterministic procedural pixel sprite & WebAudio synth fallbacks (`sfx_crate_hit`, `sfx_crate_break`, `sfx_pickup_hp`, `sfx_pickup_energy`, `sfx_pickup_armor`, `sfx_pickup_coin`, `sfx_pedestal_swap`, `sfx_perk_pick`) so Wave-2 runs cleanly offline.
