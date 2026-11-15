# d02: Shared Types & Realtime Protocol (`shared/src/bansung.ts`)

## 1. Wave-2 Target Files & Socket Events
- **Create** `shared/src/bansung.ts`: constants, ID tables, config normalizer, room view, quantized frame, delta FX, command types.
- **Edit** `shared/src/index.ts`: add `export * from './bansung';`.
- **Integrate (`d01`)** `shared/src/protocol.ts`: add `'bansung'` to `GameMode`, `bansung?: BansungRoomView` to `RoomView`.
- **Socket events** (matching `thap:frame` / `thap:cmd`): `'bansung:frame'` (Server->Client `BansungFrame`), `'bansung:cmd'` (Client->Server `BansungCommand`), `'bansung:hero'` (Client->Server lobby `{ hero: BansungHeroId }`).

## 2. Core Constants & ID Tables
```ts
export const BANSUNG_TICK_HZ = 30;
export const BANSUNG_TICK_MS = Math.round(1000 / BANSUNG_TICK_HZ); // 33ms
export const BANSUNG_MAX_PLAYERS = 10;
export const BANSUNG_MAX_BOTS = 4;
export const BANSUNG_ARENA_W = 2400;
export const BANSUNG_ARENA_H = 1600;
export const BANSUNG_AIM_STEPS = 4096; // 12-bit (~0.088 deg; ~1px error at 700px)
export const BANSUNG_CMD_BURST = 45;
export const BANSUNG_CMD_REFILL = 35;

export const BANSUNG_HERO_IDS = ['mascot', 'ranger', 'pyro', 'knight'] as const;
export type BansungHeroId = (typeof BANSUNG_HERO_IDS)[number];
export const BANSUNG_BIOMES = ['desert', 'crypt', 'cyber'] as const;
export type BansungBiome = (typeof BANSUNG_BIOMES)[number];
export type BansungDifficulty = 'normal' | 'hard' | 'hell';
export type BansungReviveMode = 'coop' | 'hardcore';
export const BANSUNG_WEAPON_IDS = [
  'pistol', 'rifle', 'smg', 'shotgun',
  'grenade_launcher', 'stun_launcher', 'bazooka', 'mine_gun',
  'plasma_rifle', 'railgun', 'lightning_staff', 'arcane_book',
  'crescent_blade', 'reaper_scythe', 'shock_baton',
] as const;
export type BansungWeaponId = (typeof BANSUNG_WEAPON_IDS)[number];
export const BANSUNG_GADGET_IDS = ['stun_bomb', 'cluster_bomb', 'auto_turret', 'heal_drone'] as const;
export type BansungGadgetId = (typeof BANSUNG_GADGET_IDS)[number];
export const BANSUNG_ENEMY_IDS = [
  'scarab', 'skirmisher', 'bomb_goblin', 'cactus_brute',
  'cactus_spitter', 'laser_sniper', 'pyro_shaman', 'thunder_mage',
  'boss_beholder', 'boss_colossus', 'boss_overlord',
] as const;
export type BansungEnemyId = (typeof BANSUNG_ENEMY_IDS)[number];
export const BANSUNG_PROP_IDS = ['crate', 'pot', 'barrel', 'pillar', 'cactus', 'rock', 'turret', 'drone', 'mine'] as const;
export type BansungPropKind = (typeof BANSUNG_PROP_IDS)[number];
export const BANSUNG_PICKUP_IDS = ['hp', 'energy', 'armor', 'coin', 'weapon', 'ammo'] as const;
export type BansungPickupKind = (typeof BANSUNG_PICKUP_IDS)[number];
export type BansungPerkId = string; // extensible registry key (d32/d46)
export type BansungUnitState = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0:idle 1:run 2:atk 3:dash 4:stun 5:downed 6:dead
```

## 3. Lobby Config & RoomView (`BansungConfig`, `BansungRoomView`)
```ts
export interface BansungConfig {
  biome: BansungBiome;
  difficulty: BansungDifficulty;
  bots: number; // 0..min(BANSUNG_MAX_BOTS, BANSUNG_MAX_PLAYERS - humans)
  botLevel: 'easy' | 'normal' | 'hard';
  reviveMode: BansungReviveMode;
}
export const DEFAULT_BANSUNG_CONFIG: BansungConfig = {
  biome: 'desert', difficulty: 'normal', bots: 1, botLevel: 'normal', reviveMode: 'coop',
};
// normalizeBansungConfig(raw, humans): validates enums, clamps bots to [0, min(4, 10 - humans)]

export interface BansungPlayerInfo {
  idx: number; id: string; name: string; avatar?: string;
  hero: BansungHeroId; color: string; bot: boolean; alive: boolean;
}
export interface BansungPlayerResult {
  idx: number; id: string; kills: number; damage: number; stuns: number; revives: number; coinPayout: number;
}
export interface BansungRoomView {
  config: BansungConfig;
  heroes?: Record<string, BansungHeroId>; // lobby picks per playerId
  mapW?: number; mapH?: number; arenaSeed?: number;
  /** Static obstacles sent once on start: stride 5 [x, y, w, h, propKindIdx] */
  obstacles?: number[];
  players?: BansungPlayerInfo[];
  myIdx?: number; // undefined for spectators
  startedAt?: number;
  result?: { victory: boolean; wave: number; reason: string; durationMs: number; mvpId?: string; stats: BansungPlayerResult[] };
}
```

## 4. Quantization & Packed Snapshot (`BansungFrame`)
- **Quantization helpers**: `quantizeAim(rad) = Math.round((((rad % TAU) + TAU) % TAU) * (4096 / TAU)) & 4095`; `dequantizeAim(q) = (q & 4095) * (TAU / 4096)`.
- World `x, y, hp, shield, radius` rounded to ints; empty optional arrays omitted to stay well under `12 KB/s`.
```ts
export const BANSUNG_OBSTACLE_FIELDS = 5; // [x, y, w, h, propKindIdx]
export const BANSUNG_PLAYER_FIELDS = 11;  // [idx, x, y, aimQ, hp, shield, state, flags, heroIdx, weaponIdx, revivePct]
export const BANSUNG_ENEMY_FIELDS = 8;    // [id, enemyIdx, x, y, hpPct, aimQ, state, flags]
export const BANSUNG_BULLET_FIELDS = 6;   // [id, shotKind, x, y, aimQ, flags]
export const BANSUNG_PROP_FIELDS = 5;     // [id, propKindIdx, x, y, hpPct]
export const BANSUNG_PICKUP_FIELDS = 5;   // [id, pickupKindIdx, x, y, subId]
export const BANSUNG_FX_FIELDS = 6;       // [fxType, a, b, c, d, e]

// Player flags (p[+7]): 1:left 2:firing 4:dashing 8:hitFlash 16:invuln 32:bot 64:reloading
// Enemy flags (e[+7]):  1:left 2:elite 4:armored 8:stunned 16:burning 32:hitFlash 64:telegraph 128:shielded
// Bullet flags (b[+5]): 1:fromEnemy 2:pierce 4:explosive 8:crit 16:energy 32:homing
export type BansungWavePhase = 'combat' | 'intermission' | 'perk_pick' | 'boss';
export interface BansungBossFrame {
  id: number; kind: BansungEnemyId; x: number; y: number;
  hp: number; maxHp: number; phase: number; state: BansungUnitState; aimQ: number; telegraph?: number;
}
export interface BansungWeaponSlot { id: BansungWeaponId; clip: number; maxClip: number; }
export interface BansungPrivate {
  maxHp: number; maxShield: number; energy: number; maxEnergy: number;
  slots: BansungWeaponSlot[]; slotIdx: number;
  gadget: { id: BansungGadgetId; cdMs: number; cdMaxMs: number; charges: number };
  dashCdMs: number; dashMaxMs: number;
  reloadMs: number; reloadTotalMs: number; sweetSpot?: [number, number];
  perkChoices?: BansungPerkId[]; perks: BansungPerkId[];
  kills: number; damage: number; stuns: number; revives: number; coins: number; lastAckSeq: number;
}
export interface BansungFrame {
  t: number; ms: number; w: number; wp: BansungWavePhase; rem: number;
  p: number[];   // all players, stride 11
  e?: number[];  // viewport-culled enemies, stride 8
  b?: number[];  // viewport-culled projectiles, stride 6
  pr?: number[]; // breakable/deployed props, stride 5 (omitted if unchanged unless full=true)
  pk?: number[]; // pickups, stride 5 (omitted if unchanged unless full=true)
  fx?: number[]; // one-shot delta FX since last tick, stride 6
  bs?: BansungBossFrame;
  me?: BansungPrivate;
  full?: boolean;
}
```

## 5. Uniform 6-Int Delta FX (`fx: number[]`, `BANSUNG_FX_FIELDS = 6`)
| Const | Val | Layout `[type, a, b, c, d, e]` | Purpose |
|---|---:|---|---|
| `FX_MUZZLE` | 0 | `[0, ownerId, weaponIdx, x, y, aimQ]` | Muzzle flash, tracer start, brass casing, gunshot SFX |
| `FX_DMG` | 1 | `[1, x, y, amount, dmgFlags, targetId]` | Floating dmg/heal (`dmgFlags`: crit/armor/heal/stun/burn/shock) |
| `FX_BLAST` | 2 | `[2, blastKind, x, y, radius, ownerIdx]` | Explosion/flashbang shockwave & ground scorch decal |
| `FX_IMPACT` | 3 | `[3, impactKind, x, y, aimQ, mat]` | Wall spark, flesh hit, melee slash arc, bullet deflect |
| `FX_DEATH` | 4 | `[4, kindIdx, x, y, tier, killerIdx]` | Death pop, dust/gore burst, kill-feed credit |
| `FX_STATUS` | 5 | `[5, playerIdx, statusKind, val, x, y]` | 0:dash 1:reloadStart 2:reloadPerfect 3:downed 4:revived 5:perk 6:crate |
| `FX_PING` | 6 | `[6, playerIdx, pingKind, x, y, 0]` | Co-op minimap/world ping (`0:help 1:enemy 2:loot 3:revive`) |
| `FX_BEAM` | 7 | `[7, x1, y1, x2, y2, beamKind]` | Railgun pierce, sniper laser telegraph/shot, chain lightning |

## 6. Client -> Server Commands (`BansungCommand` on `'bansung:cmd'`)
```ts
export type BansungCommand =
  | { t: 'in'; seq: number; mx: number; my: number; aim: number; fire: 0 | 1 } // mx,my [-100..100], aim [0..4095]
  | { t: 'dash'; dx?: number; dy?: number }
  | { t: 'slot'; idx: number }       // hotbar 0..4
  | { t: 'reload' }                  // start reload or trigger active-reload sweet-spot
  | { t: 'gadget'; x?: number; y?: number }
  | { t: 'use' }                     // pick up weapon pedestal / interact
  | { t: 'perk'; id: BansungPerkId } // choose wave-clear perk
  | { t: 'ping'; kind: 0 | 1 | 2 | 3; x: number; y: number }
  | { t: 'spec'; targetIdx: number }; // spectator follow & viewport-cull target
```
