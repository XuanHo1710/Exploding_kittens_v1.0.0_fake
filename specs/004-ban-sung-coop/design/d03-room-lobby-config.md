# d03 — Room Lobby Config, Server Handlers & Bet/Payout Integration

## 1. Wave-2 Target Files
- `shared/src/bansung.ts` — config/hero types, constants, `normalizeBansungConfig`, `normalizeBansungHero` (co-owned with `d02`).
- `server/src/game/game.ts` — `GameHooks.bansungFrame`, lobby handlers, `validateStart`, `startBansung`, `syncBansung`, `bansungView`, `eliminate`, `restart`, `dispose`.
- `server/src/game/rooms.service.ts` — `hooks.bansungFrame`, `setBansungConfig`, `setBansungHero`, `'bansung'` in `create()`.
- `server/src/game/game.gateway.ts` — socket handlers `bansung:config`, `bansung:hero`, `bansung:cmd`.
- `client/src/components/BansungLobbyConfig.tsx` — dedicated co-op lobby settings + hero picker component (mounted by `client/src/components/Lobby.tsx`).

---

## 2. Config Schema, Constants & Normalization (`shared/src/bansung.ts`)

```ts
export const BANSUNG_MAX_SQUAD = 4; // minPlayers=1, maxPlayers=4 in GAME_MODES.bansung (d01)

export type BansungBiome = 'desert_ruins' | 'crimson_crypt' | 'cyber_lab';
export type BansungDifficulty = 'normal' | 'hard' | 'nightmare';
export type BansungBotLevel = 'easy' | 'normal' | 'hard';
export type BansungReviveRule = 'circle' | 'wave_only' | 'hardcore';
export type BansungHeroId = 'mascot_gunner' | 'cyber_ranger' | 'pyromancer' | 'knight';

export interface BansungConfig {
  biome: BansungBiome;
  difficulty: BansungDifficulty;
  bots: number;               // 0 .. Math.max(0, BANSUNG_MAX_SQUAD - humanCount)
  botLevel: BansungBotLevel;
  reviveRule: BansungReviveRule;
  endless: boolean;           // false = 10 waves; true = endless after Wave 10 (d40)
}

export const DEFAULT_BANSUNG_CONFIG: BansungConfig = {
  biome: 'desert_ruins',
  difficulty: 'normal',
  bots: 1,
  botLevel: 'normal',
  reviveRule: 'circle',
  endless: false,
};
```

### Label & Scaling Constants
- `BANSUNG_BIOME_INFO`:
  - `desert_ruins`: `{ name: 'Tàn Tích Sa Mạc', desc: 'Cát vàng, xương rồng nổ & Sand Beholder' }`
  - `crimson_crypt`: `{ name: 'Hầm Mộ Đỏ', desc: 'Bẫy gai, cột đá & Dread Colossus' }`
  - `cyber_lab`: `{ name: 'Phòng Thí Nghiệm', desc: 'Tường laser, bệ pin & Overlord Core' }`
- `BANSUNG_DIFFICULTY_MULT`:
  - `normal`: `{ label: 'Thường', hp: 1.0, dmg: 1.0, spawn: 1.0 }`
  - `hard`: `{ label: 'Khó', hp: 1.35, dmg: 1.25, spawn: 1.25 }`
  - `nightmare`: `{ label: 'Ác Mộng', hp: 1.8, dmg: 1.6, spawn: 1.5 }`
- `BANSUNG_REVIVE_INFO`:
  - `circle`: `'Đồng đội cứu (Vòng 72px)'` — bleedout pause while channeling (`2.6s` solo, up to `2x` multi-rescue, `50%` HP); expiry -> dead until match end (`d07`).
  - `wave_only`: `'Hồi sau mỗi đợt'` — teammate revive circle + dead teammates auto-revive (`50%` HP) on wave clear.
  - `hardcore`: `'Khắc nghiệt (Không cứu)'` — `0 HP` = immediate match permadeath.
- `BANSUNG_BOT_LABEL`: `{ easy: 'Dễ', normal: 'Thường', hard: 'Khó' }` (matches `thap`/`ants` convention).
- `BANSUNG_HERO_IDS`: `['mascot_gunner', 'cyber_ranger', 'pyromancer', 'knight']` (matches `d18`).

### Validation / Normalization Algorithm
- `normalizeBansungConfig(raw: unknown, humanCount = 1): BansungConfig`:
  - Coerce object; fallback each field to `DEFAULT_BANSUNG_CONFIG` if invalid enum/type.
  - `maxBots = Math.max(0, BANSUNG_MAX_SQUAD - Math.max(1, humanCount))`.
  - `bots = Math.max(0, Math.min(maxBots, Math.trunc(Number(r.bots ?? DEFAULT_BANSUNG_CONFIG.bots)) || 0))`.
  - `endless = Boolean(r.endless)`.
- `normalizeBansungHero(raw: unknown, fallbackIdx = 0): BansungHeroId`:
  - Return `raw` if in `BANSUNG_HERO_IDS`, else `BANSUNG_HERO_IDS[fallbackIdx % BANSUNG_HERO_IDS.length]`.

---

## 3. Server Handlers & Match Lifecycle (`game.ts`, `rooms.service.ts`, `game.gateway.ts`)

### `server/src/game/game.ts`
- **`GameHooks`**: add `bansungFrame(game: Game, playerId: string, frame: BansungFrame): void;`.
- **State fields** on `Game`:
  - `bansungConfig: BansungConfig = { ...DEFAULT_BANSUNG_CONFIG };`
  - `private bansung?: BansungWorld;`
  - `private bansungHeroes = new Map<string, BansungHeroId>();`
- **Existing hook points**:
  - `setGameMode`: include `'bansung'` in `roomRules.maxPlayers` sizing (`4`), clamp `this.bansungConfig = normalizeBansungConfig(this.bansungConfig, this.players.length)`.
  - `validateStart`: if `this.gameMode === 'bansung'`, normalize `this.bansungConfig = normalizeBansungConfig(this.bansungConfig, players.length)`; require `players.length + cfg.bots >= 1` and all non-host `p.readyVersion === this.rulesVersion`.
  - `start` / `restart` / `dispose`: branch `startBansung()`, call `this.bansung?.stop(); this.bansung = undefined;` in `restart()` & `dispose()`.
  - `viewFor(id)`: exclude `'bansung'` from `currentPlayerId` (like `'thap_hung'`); set `bansung: this.gameMode === 'bansung' ? this.bansungView(id) : undefined`.
  - `eliminate(p)`: if `this.gameMode === 'bansung'`, call `this.bansung?.resign(p.id)` (marks hero left/dead; triggers `syncBansung()` if all remaining humans are down/gone).
- **New methods** (mirror `setThapConfig` / `setThapTeam` pattern):
  - `setBansungConfig(byId: string, raw: unknown)`: `requireLobbyHost(byId)`, assert `gameMode === 'bansung'`, normalize via `normalizeBansungConfig(raw, this.players.length)`. If JSON unchanged, return. Inside `this.run()`: update `this.bansungConfig`, call `this.invalidateReady()` (bumps `rulesVersion` so guests must re-ready), `addLog(...)`.
  - `setBansungHero(playerId: string, raw: unknown)`: require `gameMode === 'bansung'`, `phase === 'lobby'`, seated `this.player(playerId)` (not spectator). Set `this.bansungHeroes.set(playerId, normalizeBansungHero(raw))` inside `this.run()` (does NOT invalidate ready).
  - `bansungCommand(playerId: string, cmd: BansungCommand)`: verify `phase === 'playing' && this.bansung`; reject spectators; forward to `this.bansung.command(playerId, cmd)`.
  - `startBansung()`: normalize `cfg`, reset `p.alive = true; p.hand = []`, build `inits` (`humans` with `bansungHeroOf(p.id)` + `cfg.bots` AI bots `bot:bs0..`), instantiate `new BansungWorld(inits, cfg, callbacks)`, set `phase = 'playing'`, `this.bansung.start()`.
  - `bansungView(id)`: in `'lobby'` return `{ config: this.bansungConfig, heroes }` (per-player `bansungHeroOf(p.id)` map); in `'playing'/'ended'` return full `BansungRoomView` (`config`, `mapW`, `mapH`, `obstacles`, `players`, `wave`, `startedAt`, `result`).

### `server/src/game/rooms.service.ts` & `game.gateway.ts`
- `rooms.service.ts`:
  - `hooks.bansungFrame`: if `this.playerRoom.get(playerId) === game.code`, emit `'bansung:frame'` volatile to room `p:${playerId}` (same pattern as `thapFrame`).
  - `setBansungConfig(playerId, raw)` & `setBansungHero(playerId, raw)`: `roomOf(playerId)` -> `assertReady(game)` -> delegate to `game`.
  - `create()`: add `'bansung'` to mode whitelist (`normalize 'ban_sung' -> 'bansung'` before whitelist check if external caller passes snake_case).
- `game.gateway.ts`:
  - `@SubscribeMessage('bansung:config')` -> `this.rooms.setBansungConfig(playerId, data)`
  - `@SubscribeMessage('bansung:hero')` -> `this.rooms.setBansungHero(playerId, data)`
  - `@SubscribeMessage('bansung:cmd')` -> forward to `this.rooms.roomOf(playerId)?.bansungCommand(playerId, data)` (per-player input rate guard in `d48`).

---

## 4. Bet / Pot & Payout Integration (`game.ts` + `rooms.service.ts`)

1. **Pre-match charging (`rooms.service.ts:startGame`)**:
   - Reuses existing `BET_OPTIONS` (`setBet`) and `game.stakeOf(p.id)` (`this.bet`).
   - Verified PIN + sufficient coins checked for all connected human players; `chargeGame` deducts `this.bet` per human -> `game.pot = connectedHumans.length * this.bet`.
   - Start log in `startGame`: when `gameMode === 'bansung' && bet > 0`, log `💰 Mỗi người góp ${bet} xu – hũ thưởng Co-op ${game.pot} xu cho người sống sót cuối trận!`.
2. **Match-end settlement (`game.ts:syncBansung` -> `rooms.service.ts:payout`)**:
   - Drain logs & sync `p.alive = hero.alive` (`hero.state !== 'dead'`) on each tick/change.
   - When `w.result` is set and `this.phase === 'playing'`:
     - Set `this.phase = 'ended'`.
     - `finishers = this.players.filter((p) => !p.left)` sorted by `(p.alive ? 1 : 0)` desc, then MVP `score` desc.
     - **Co-op Victory (`w.result.win === true`)**:
       - `this.winnerIds = finishers.map((p) => p.id)`, `this.winnerId = finishers[0]?.id` (MVP).
       - If `this.pot > 0 && finishers.length > 0`:
         - If `finishers.length === 1`: `this.payouts[finishers[0].id] = this.pot`.
         - Else (`70/30` Co-op + MVP split aligned with `d46`): `basePool = Math.floor(this.pot * 0.70)`, `mvpPool = this.pot - basePool`. `survivors = finishers.filter((p) => p.alive)`; `potPool = survivors.length ? survivors : finishers` split `basePool` equally (`share = Math.floor(basePool / potPool.length)`), `finishers[0]` (MVP) gets `+mvpPool` plus any remainder `basePool - share * potPool.length`.
         - Zero coin inflation (`sum(payouts) === pot`); disconnected/early-left (`p.left`) or permanently dead teammates forfeit base share to active survivors.
     - **Team Wipe / Defeat (`w.result.win === false`)**:
       - `this.winnerId = undefined; this.winnerIds = [];`.
       - If `this.pot > 0`: refund `this.payouts[p.id] = this.bet` for each `!p.left` player (identical to `syncThap`/`syncAnts`/`syncLink`), preserving zero-sum safety while still penalizing early leavers (`p.left` gets `0`).
   - `rooms.service.ts:payout(game)` runs `accounts.rewardPayouts(game.payouts, game.winners(), opId)` automatically on `broadcast(game)` (with existing idempotency `opId` & 20s retry on failure).

---

## 5. Lobby Settings UI (`BansungLobbyConfig.tsx` + `Lobby.tsx`)

- **Component**: `client/src/components/BansungLobbyConfig.tsx` rendered inside `Lobby.tsx` when `room.gameMode === 'bansung' && room.phase === 'lobby'`.
- **Host Controls** (`isHost` emits `socket.emit('bansung:config', next)`):
  - **Bản đồ (Biome)**: 3 pill/card buttons (`desert_ruins`, `crimson_crypt`, `cyber_lab`) with short hazard/boss subtitle.
  - **Độ khó (Difficulty)**: segmented 3-way selector (`normal` / `hard` / `nightmare`) showing HP/spawn multiplier badge.
  - **Luật Hồi Sinh (Revive Rule)**: 3-way selector (`circle` / `wave_only` / `hardcore`) with tooltip explaining bleedout & pot risk.
  - **Đồng đội AI (Co-op Bots)**: stepper `0 .. Math.max(0, 4 - connectedCount)` + `botLevel` select (`easy` / `normal` / `hard`, disabled if `bots === 0`).
  - **Endless toggle**: checkbox `"Chế độ Vô Tận sau Wave 10"`.
- **All Seated Players (Host & Guest)**:
  - **Chọn Nhân Vật (Hero Class)** row (`mascot_gunner`, `cyber_ranger`, `pyromancer`, `knight`) emitting `socket.emit('bansung:hero', heroId)` — updates player card badge in real time without resetting `readyVersion`.
  - **Squad & Pot Banner**: shows `Đội hình: ${humans + bots}/4 (${humans} người + ${bots} bot)` and, if `room.bet > 0`, displays `Hũ Co-op dự kiến: ${room.bet * humans} xu (chia cho người sống sót khi thắng; hoàn cược nếu thua hết)`.
- **Non-Host Read-Only & Ready Sync**: displays active settings cleanly; whenever `config` or `bet` changes, server invalidates `readyVersion` and Lobby shows the standard `"Xác nhận luật & mức cược"` button before host can click Start.
