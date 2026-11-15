# d40 — 10-Wave Co-op Director & Endless Hook (`ban_sung`)

## 1. Wave-2 Target Files & Ownership
- `shared/src/bansung.ts`: Export `BANSUNG_TOTAL_WAVES = 10`, `BansungWavePhase`, `BansungSiegeKind`, `BansungEliteAffix`, `BansungWaveHud` (quantized HUD struct embedded in `BansungFrame`).
- `server/src/game/bansung/director.ts`: Stateful `WaveDirector` class + `WAVE_TABLE` (waves 1–10) + `EndlessMutator` hook registry.
- `server/src/game/bansung/world.ts`: Calls `director.step(ctx)` at 30Hz (`dt = 1/30`), executes spawn/siege/crate directives, opens wave-clear Perk Draft (`d32`), triggers victory/endless transition.
- `server/test/bansung.test.cjs`: Unit tests for budget scaling, active mob cap backpressure, W4 mini-boss, W5–7 siege events, W10 boss victory, and W11+ endless cycle.

## 2. Shared Types & Constants (`shared/src/bansung.ts`)
```ts
export const BANSUNG_TOTAL_WAVES = 10;
export const BANSUNG_WARMUP_S = 5;
export const BANSUNG_INTERMISSION_S = 6;
export const BANSUNG_BOSS_INTERMISSION_S = 9;
export const BANSUNG_STRAGGLER_ENRAGE_S = 12;

export type BansungWavePhase = 'warmup' | 'intermission' | 'spawning' | 'cleanup' | 'victory' | 'defeat';
export type BansungSiegeKind = 'none' | 'portal_rush' | 'supply_beacon' | 'artillery_siege';
export type BansungEliteAffix = 'armored' | 'swift' | 'volatile';

export interface BansungWaveHud {
  wave: number;          // 1..10, or 11+ in endless
  maxWave: number;       // 10 (0 = endless active)
  phase: BansungWavePhase;
  phaseLeftMs: number;   // countdown for warmup/intermission/siege timer
  mobsLeft: number;      // remaining budget-equivalent + active mobs
  siege: BansungSiegeKind;
  siegeProg: number;     // 0..100 (portal HP % / beacon hold % / barrage time %)
  bossId?: string;       // active boss/mini-boss entity id for Boss Bar (d45)
}
```

## 3. Scaling Formulas (Co-op `N` Players & Difficulty `D`)
Let `N = clamp(activePlayers + coopBots, 1, 4)` and `D` map difficulty (`easy: {b:0.75, hp:0.75, dmg:0.75}`, `normal: {1.0, 1.0, 1.0}`, `hard: {1.35, 1.30, 1.25}`).
- **Wave Spawn Budget**: `B(w, N, D) = Math.round((24 + 10 * w + 1.8 * w * w) * (1 + 0.55 * (N - 1)) * D.b)`
- **Active Mob Cap (CPU/Net Guard)**: `cap(w, N) = Math.min(52, 18 + N * 6 + w * 2)` — pauses budget drain if `activeMobs >= cap`.
- **Mob HP / Damage Multipliers**:
  - `mobHpMult(w, N, D) = (1 + 0.14 * (w - 1)) * (1 + 0.35 * (N - 1)) * D.hp`
  - `bossHpMult(N, D) = (1 + 0.65 * (N - 1)) * D.hp` (Wave 4 Mini-Boss uses `0.48 * bossHpMult`)
  - `mobDmgMult(w, D) = Math.min(2.2, (1 + 0.06 * (w - 1)) * D.dmg)`
- **Enemy Budget Costs** (aligned with `d34`/`d35`): `scarab:1`, `skirmisher:2`, `bomb_goblin:3`, `cactus_spitter:3`, `pyro_shaman:5`, `cactus_brute:6`, `laser_sniper:6`, `thunder_mage:7`. Elite multiplier: `2.0x` cost, `+65%` HP, `1.2x` scale, golden/violet outline.

## 4. 10-Wave Pacing Blueprint (`WAVE_TABLE`)
| Wave | Arc | Budget Composition / Roster Weights | Boss / Siege Event | Wave-Clear Reward |
|---|---|---|---|---|
| **1** | Swarm Intro | `scarab` 55%, `skirmisher` 35%, `cactus_spitter` 10% | None (portal bursts q=3.2s) | 2 Crates (`d32`) |
| **2** | Rushers | `scarab` 35%, `skirmisher` 30%, `bomb_goblin` 20%, `cactus_spitter` 15% | None (burst q=3.0s) | **Perk Draft** (3 choices) |
| **3** | Heavy Mix | `skirmisher` 25%, `bomb_goblin` 20%, `cactus_spitter` 20%, `cactus_brute` 20%, `pyro_shaman` 15% | None (burst q=2.8s) | Weapon Pedestal + Crates |
| **4** | **Mini-Boss** | `mini_boss` (0.48x Biome Boss Phase-1 kit) + trickle adds (`scarab`/`skirmisher`, max 6 alive, q=14s) | **Mini-Boss** (`mini_sand_beholder` / `mini_dread_warden` / `mini_core_drone`) | **Perk Draft** + Revive/Heal Pulse |
| **5** | Siege I | `skirmisher` 25%, `cactus_spitter` 20%, `pyro_shaman` 20%, `laser_sniper` 15%, `cactus_brute` 20% | **`portal_rush`**: 2 destructible Summon Gates (`450*N` HP) spawning 2 mobs/5s | Bonus Coins + Crates |
| **6** | Siege II | `bomb_goblin` 20%, `cactus_brute` 20%, `laser_sniper` 20%, `thunder_mage` 20%, `scarab` 20% | **`supply_beacon`**: Hold center zone (`r=150px`, `20s` total) -> AoE stun shockwave | **Perk Draft** + Energy Refill |
| **7** | Siege III | `bomb_goblin` 25%, `cactus_brute` 25%, `pyro_shaman` 20%, `thunder_mage` 15%, `laser_sniper` 15% | **`artillery_siege`**: Mortar red-ring telegraphs (`1.4s` fuse) every `4.5s` across arena | Weapon Pedestal + Crates |
| **8** | Elites I | 35% Elite chance (`armored`/`swift`); full `d34`+`d35` mix in Miragine flank squads | Burst cadence `2.3s`, max 2 Elites/squad | **Perk Draft** |
| **9** | Elites II | 55% Elite chance (adds `volatile` death-nova); 1 mid-wave Summon Gate at 50% budget | Burst cadence `2.1s`, high pressure climax | **Full Restock Crate** + `9s` prep |
| **10** | **Final Boss** | **Biome Boss** (`desert: sand_beholder`, `crypt: dread_colossus`, `cyber: overlord_core`) + phase adds (max 8 alive) | 2–3 phase Boss fight (`d37`–`d39`) + Boss HP Bar | Victory Scoreboard or Endless Hook |

## 5. 30Hz Director Algorithm (`server/src/game/bansung/director.ts`)
```ts
export interface DirectorTickContext {
  dt: number;                         // 1/30 s
  activeMobs: number;
  bossAlive: boolean;
  siegeActive: boolean;               // true while portal_rush gates alive or supply_beacon < 100%
  players: { x: number; y: number; alive: boolean; downed: boolean }[];
  biome: 'desert' | 'crypt' | 'cyber';
  endlessEnabled: boolean;
}
export interface DirectorStepOutput {
  spawns: { kind: string; x: number; y: number; elite?: BansungEliteAffix }[];
  spawnBoss?: { id: string; mini: boolean; hpMult: number };
  siegeStart?: BansungSiegeKind;
  artilleryTarget?: { x: number; y: number }; // W7 mortar telegraph ring
  waveClear?: { wave: number; openPerkDraft: boolean; spawnPedestal: boolean; crates: number };
  finished?: 'victory' | 'defeat';
}
```
1. **Team Wipe Check**: If all players are `!alive` (bled out, none standing/reviving), immediately set `phase = 'defeat'` -> `world.finish(false)`.
2. **Warmup / Intermission**: Tick `phaseTimer -= dt`. At `3.0s` remaining, emit `spawnTelegraph` markers on perimeter portals (`r=48px` swirl). On `<= 0`, increment `wave`, compute `budget = B(wave, N, D)`, reset `siegeState`, and set `phase = 'spawning'`.
3. **Spawning (Miragine Squad Cadence)**:
   - While `budget > 0` and `activeMobs < cap(wave, N)`: decrement `burstTimer -= dt`.
   - When `burstTimer <= 0`, pick `2..4` portals (scoring candidates at `dist >= 360px` from nearest living player, avoiding wall overlap) and spawn a squad of `3..6` mobs (capped at `6 spawns/tick` to prevent CPU/net spikes), subtracting each mob's cost from `budget`.
   - When `budget <= 0`, set `phase = 'cleanup'`, `cleanupTimer = 0`.
4. **Cleanup & Anti-Stall**:
   - Tick `cleanupTimer += dt`. If `activeMobs <= 3 && cleanupTimer >= BANSUNG_STRAGGLER_ENRAGE_S`, flag stragglers `revealed = true` (shown on minimap `d45`) with `+25%` speed so waves never soft-lock.
   - When `activeMobs === 0 && !bossAlive && !ctx.siegeActive` (`portal_rush` gates destroyed, `supply_beacon` 100%, `artillery_siege` ends automatically on last mob death):
     - If `wave === BANSUNG_TOTAL_WAVES && !endlessEnabled`: set `phase = 'victory'` -> `world.finish(true)`.
     - Else: apply Wave-Clear hook (auto-revive downed allies at 50% HP, spawn crates/pedestal, open Perk Draft on even waves), set `phase = 'intermission'` (`BANSUNG_BOSS_INTERMISSION_S` if wave % 5 === 4 or 0, else `BANSUNG_INTERMISSION_S`).

## 6. Endless Extension Hook (`Wave 11+`) & Mutator Registry
- Lobby `BansungConfig.endless: boolean` (or post-W10 vote window `8s` if `endlessMode === 'vote'`) unlocks `wave >= 11` (`maxWave = 0`).
- **5-Wave Endless Cycle** (`cycle = Math.floor((w - 11) / 5)`, `step = (w - 11) % 5`):
  - `step 0, 1`: Elite Swarm (`eliteChance = min(0.85, 0.55 + 0.08 * cycle)`).
  - `step 2`: Double Siege (random pair from `portal_rush`, `supply_beacon`, `artillery_siege`).
  - `step 3`: Twin Mini-Boss Vanguard + Elite flankers.
  - `step 4` (Waves `15, 20, 25...`): **Boss Rotation** cycling `sand_beholder` -> `dread_colossus` -> `overlord_core` with `bossHpMult * (1 + 0.35 * cycle)`.
- **Modular Hook Interface**:
  ```ts
  export interface EndlessWaveMutator {
    id: string;
    onWaveStart?(dir: WaveDirector, spec: WaveSpec): void;
    onTick?(dir: WaveDirector, ctx: DirectorTickContext): void;
  }
  export const ENDLESS_MUTATOR_REGISTRY: Record<string, EndlessWaveMutator> = {};
  ```
  Future mutators (e.g. `speed_blitz`, `low_energy`, `double_crates`) register into `ENDLESS_MUTATOR_REGISTRY` with zero edits to `world.ts`.
