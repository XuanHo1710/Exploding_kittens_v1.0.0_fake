# d46: Post-Game Scoreboard, Coin Payout & Modular Registries (`ban_sung`)

## 1. Post-Game Scoreboard & MVP Schema (`shared/src/bansung.ts`)
Mirror `ThapRoomView.result` (`shared/src/thap.ts`) and `RoomView.payouts` (`shared/src/protocol.ts`):

```ts
export type BansungBadgeId = 'mvp' | 'slayer' | 'medic' | 'stunner' | 'boss_breaker';

export interface BansungPlayerStats {
  id: string;              // playerId or "bot:bs<n>"
  name: string;
  heroId: string;          // HERO_REGISTRY key
  bot: boolean;
  left?: boolean;
  kills: number;           // total enemy kills
  elitesKilled: number;    // elite + mini-boss kills
  damageDealt: number;     // clamped integer total damage
  bossDamage: number;      // damage dealt to boss entities
  damageTaken: number;
  stunsInflicted: number;  // flashbang / stun procs landed
  revives: number;         // downed teammates successfully revived
  deaths: number;          // bleedout/full death count
  score: number;           // computed MVP score
  badges: BansungBadgeId[];
  coinDelta: number;       // net xu delta (payout - bet) when bet > 0
}

export interface BansungResult {
  victory: boolean;
  reason: string;          // e.g. "Đã quét sạch 10 đợt và hạ Trùm Cuối!" | "Cả đội đã gục tại Đợt 7"
  wavesCleared: number;
  totalWaves: number;
  durationMs: number;
  mvpId?: string;          // highest-scoring non-left human (fallback: top scorer)
  players: BansungPlayerStats[]; // sorted by score desc
}
```

### MVP & Badge Algorithm (`server/src/game/bansung/postgame.ts`)
- **Constants**: `W_KILL = 10`, `W_ELITE = 35`, `W_DMG = 0.15`, `W_BOSS = 0.10`, `W_STUN = 25`, `W_REVIVE = 120`, `W_DEATH = -40`.
- **Formula**:
  `score = Math.max(0, Math.round(kills * 10 + elitesKilled * 35 + damageDealt * 0.15 + bossDamage * 0.10 + stunsInflicted * 25 + revives * 120 - deaths * 40))`
- **Tie-breaker** (strict total order): `score` desc -> `revives` desc -> `damageDealt` desc -> `kills` desc -> `deaths` asc -> seat index asc.
- **MVP Selection**: Top entry among `!bot && !left` players (if none, top entry overall) gets badge `'mvp'`.
- **Secondary Badges** (awarded when value `> 0`, unique holder per badge via same tie-breaker):
  - `'slayer'`: max `kills` | `'medic'`: max `revives` | `'stunner'`: max `stunsInflicted` | `'boss_breaker'`: max `bossDamage`.

## 2. Coin Payout & `Game` Integration (`server/src/game/game.ts`)
Follows existing `Game.payouts` / `pot` / `bet` contract (`syncThap` / `syncLink` in `server/src/game/game.ts`):

- **Victory (`result.victory === true`)**:
  - `activeHumans = players.filter(p => !p.left)` -> `this.winnerIds = activeHumans.map(p => p.id)`, `this.winnerId = result.mvpId ?? activeHumans[0]?.id`.
  - If `this.pot > 0 && activeHumans.length > 0`:
    - `basePool = Math.floor(this.pot * 0.70)` -> equal base `Math.floor(basePool / N)` per active human.
    - `perfPool = this.pot - Math.floor(basePool / N) * N` -> distributed proportionally to `Math.max(1, s.score)` (`Math.floor(perfPool * w / totalW)`).
    - **Conservation invariant**: Any integer rounding remainder (`pot - sum`) is added to `mvpId` (or `activeHumans[0]`), guaranteeing `sum(payouts) === pot`.
    - `s.coinDelta = (this.payouts[s.id] ?? 0) - this.bet`.
- **Defeat (`result.victory === false`)**:
  - `this.winnerId = undefined`, `this.winnerIds = []`.
  - If `this.pot > 0`, mirror `syncThap` / `syncLink` / `syncAnts` (`game.ts`): refund `this.payouts[p.id] = this.bet` for each `!p.left` human (`coinDelta = 0`) so wagered xu is never orphaned without a winner.
- **Free Play (`this.bet === 0`)**: `this.payouts = {}` (no unbacked coin minting); `coinDelta = 0`.

## 3. Post-Game Scoreboard UI (`client/src/bansung/PostGameModal.tsx`)
- Displayed overlay when `room.phase === 'ended' && room.bansung?.result`.
- **Header**: Victory/Defeat pixel banner, `Đợt {wavesCleared}/{totalWaves}`, duration `mm:ss`, MVP spotlight card (animated hero idle frame + badges).
- **Table Columns**: `#` | `Chiến Binh (Hero)` | `Hạ` | `Sát Thương` | `Choáng` | `Cứu` | `Gục` | `Điểm` | `Xu` (if `bet > 0`).
- **Actions**: Host clicks **"Về phòng chờ"** (triggers `Game.restart(byId)` via existing room restart handler); non-hosts see waiting badge; spectators see read-only summary.

## 4. Modular Registries (`shared/src/bansung-registry.ts`)
Zero hardcoded `switch(id)` tables across gameplay/HUD/rendering. Every entity reads immutable defs by string `id` or compact network `numId` (`0..255`).

```ts
export interface RegistryEntry { readonly id: string; readonly numId: number; }

export class BansungRegistry<T extends RegistryEntry> {
  private byId = new Map<string, T>();
  private byNumMap = new Map<number, T>();
  private frozen = false;
  constructor(readonly kind: string, initial: readonly T[] = []) { initial.forEach(e => this.register(e)); }
  register(entry: T): T {
    if (this.frozen) throw new Error(`[${this.kind}] Registry is frozen`);
    if (this.byId.has(entry.id) || this.byNumMap.has(entry.numId)) {
      throw new Error(`[${this.kind}] Duplicate id=${entry.id} or numId=${entry.numId}`);
    }
    this.byId.set(entry.id, Object.freeze(entry));
    this.byNumMap.set(entry.numId, this.byId.get(entry.id)!);
    return entry;
  }
  get(id: string): T | undefined { return this.byId.get(id); }
  must(id: string): T { const v = this.byId.get(id); if (!v) throw new Error(`[${this.kind}] Unknown ${id}`); return v; }
  byNum(numId: number): T | undefined { return this.byNumMap.get(numId); }
  list(): readonly T[] { return [...this.byId.values()]; }
  freeze() { this.frozen = true; }
}
```

### Core Registry Schemas & Singletons
- **`WEAPON_REGISTRY` (`WeaponDef`)**: `id, numId, name, vnName, category ('pistol'|'smg'|'shotgun'|'rifle'|'laser'|'launcher'|'turret'|'drone'), tier (1..4), damage, energyCost, magSize, reloadMs, fireRateMs, pellets, spreadDeg, projSpeed, range, pierce, splashRadius, stunMs, knockback, spriteKey, sfxKey, unlockWave?`.
- **`HERO_REGISTRY` (`HeroDef`)**: `id, numId, name, vnName, maxHp, maxArmor, maxEnergy, moveSpeed, starterWeaponId, skillId, skillCdMs, passivePerkId?, spritePrefix, accentColor`.
- **`PERK_REGISTRY` (`PerkDef`)**: `id, numId, name, vnName, desc, rarity ('common'|'rare'|'epic'), maxStack, tags, modifiers: Partial<Record<'dmgPct'|'fireRatePct'|'maxHp'|'maxArmor'|'moveSpeedPct'|'stunMs'|'energyRegen'|'reviveSpeedPct', number>>, onEventHook?: 'onKill'|'onHit'|'onStun'|'onRevive'|'onWaveStart'`.
- **`BIOME_REGISTRY` (`BiomeDef`)**: `id, numId, name, vnName, arenaW, arenaH, groundTileKey, wallTileKey, ambientColor, bgmKey, hazardType?, enemyPoolIds: string[], bossId, propTable: string[]`.

## 5. Future Extension Hooks
- **Content Pack Loader (`registerBansungPack`)**: Accepts `{ weapons?, heroes?, perks?, biomes? }`, validates cross-references (`hero.starterWeaponId` in `WEAPON_REGISTRY`, `biome.enemyPoolIds`), registers before `freezeAllRegistries()` at boot—no edits needed in `world.ts`, `render.ts`, or `BansungBoard.tsx`.
- **Endless Wave Hook (`EndlessScaler`)**: Optional callback interface `(wave: number) => { hpMult: number; dmgMult: number; countMult: number; eliteChance: number }` invoked by Wave Director when `wave > 10` (`config.endless = true`).
- **Match Telemetry Hook (`GameHooks.bansungEnded?`)**: Emits `BansungResult` + `roomCode` to allow future DB leaderboard/achievement persistence without coupling `BansungWorld` to storage.
- **Asset Fallback Resolution**: Client resolves `def.spriteKey` / `def.sfxKey` against `database-ban-sung/manifest.json` with fallback to procedural canvas/WebAudio primitives if an expansion key lacks media yet.

## 6. Exact Wave-2 Target Files
- `shared/src/bansung-registry.ts` (new): `BansungRegistry<T>`, schemas, 4 singletons, `registerBansungPack`, `freezeAllRegistries`.
- `shared/src/bansung.ts` (align with d02): `BansungBadgeId`, `BansungPlayerStats`, `BansungResult` fields on `BansungRoomView`.
- `server/src/game/bansung/postgame.ts` (new): `StatsTracker`, `computeMvpScore`, `buildBansungResult`, `computeBansungPayouts`.
- `server/src/game/game.ts` (align with d03): `syncBansung()` calls `computeBansungPayouts` to set `winnerId`, `winnerIds`, `payouts`.
- `client/src/bansung/PostGameModal.tsx` (new) + `client/src/bansung/bansung.css` (append modal styles) + `client/src/bansung/BansungBoard.tsx` (render modal when `phase === 'ended'`).
