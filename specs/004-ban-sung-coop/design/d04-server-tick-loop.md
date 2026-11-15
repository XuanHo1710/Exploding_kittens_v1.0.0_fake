# d04: Server 30Hz Tick Loop, Command Queue, Frame Emit & Viewport Culling

**Reference Pattern:** `server/src/game/thap/world.ts` (`ThapWorld`), `server/src/game/game.ts` (`GameHooks`, `startThap`, `syncThap`, `sendThapFrames`), `server/src/game/game.gateway.ts` (`thap:cmd`).

## 1. Wave-2 Target Files
- **Primary Owner (`w04`):** `server/src/game/bansung/world.ts` (`BansungWorld`, `BansungWorldHooks`, tick loop, command queue, `frameFor()` culling).
- **Integration Hooks (owned by `d01`/`d03` Wave-2 slices):**
  - `server/src/game/game.ts`: add `bansung?: BansungWorld`, `GameHooks.bansungFrame(game, playerId, frame)`, `bansungCommand()`, `startBansung()`, `syncBansung()`, `sendBansungFrames()`, `restart()`/`leave()` `stop()` cleanup.
  - `server/src/game/game.gateway.ts`: `@SubscribeMessage('bansung:cmd')` -> `this.game(me).bansungCommand(me.playerId, body)`.
  - `server/src/game/rooms.service.ts`: emit `bansung:frame` to `p:${playerId}` inside `bansungFrame` hook.

## 2. Core Contracts (`server/src/game/bansung/world.ts`)
```ts
export interface BansungWorldHooks {
  tick(): void;    // triggers Game.sendBansungFrames() then world.clearPendingFx()
  changed(): void; // triggers Game.syncBansung() on logs, downs/revives, wave clear, or end
}
export interface BansungInit { id: string; name: string; color: string; bot: boolean; heroClass: BansungHeroClass }
export interface BansungResult { victory: boolean; reason: string; wave: number; scores: BansungPlayerStats[] }

export class BansungWorld {
  tickNo = 0; elapsedMs = 0; readonly startedAt = Date.now(); result?: BansungResult;
  constructor(inits: BansungInit[], readonly config: BansungConfig, private hooks: BansungWorldHooks) {}
  start(): void; stop(): void; get running(): boolean;
  enqueueCommand(playerId: string, cmd: BansungCommand): string | undefined; // error string or undefined
  resign(playerId: string): void; // marks left -> bleedout/autopilot handled cleanly on next step()
  drainLogs(): string[];
  step(): void;                   // exposed for deterministic unit tests (server/test/bansung.test.cjs)
  frameFor(viewerId?: string): BansungFrame;
  clearPendingFx(): void;         // called once after all viewers receive frameFor()
}
```
- **Exception & Lifecycle Guard:** Wrap `pump()` step execution in `try/catch` (logging `[BansungWorld]` error without crashing the Node process, matching `ThapWorld.start()`). `stop()` clears `setInterval` cleanly on `checkEnd()`, `Game.restart()`, and empty room teardown.
- **Reconnect Safety:** `Game.sendBansungFrames()` skips `!p.connected || p.left`; when a disconnected human returns mid-match, `Game.connected` triggers `syncState` (`BansungRoomView` static map/biome/players) and the next 30Hz tick resumes sending `frameFor(p.id)` seamlessly.

## 3. Constants & Tick Timing (`30Hz` Fixed-Step Accumulator)
```ts
export const BANSUNG_TICK_HZ = 30;
export const BANSUNG_TICK_MS = 1000 / BANSUNG_TICK_HZ; // 33.333ms
export const BANSUNG_DT = 1 / BANSUNG_TICK_HZ;        // 0.033333s
const PUMP_POLL_MS = 15;                              // avoids Windows 15.6ms setInterval drift
const MAX_FRAME_GAP_MS = 100;                         // clamps GC/OS stalls (max 3 catch-up steps)
const INPUT_STALE_TICKS = 6;                          // zero movement after 200ms silent client
const CMD_BURST = 30;
const CMD_REFILL_PER_S = 45;                          // supports 30Hz input + discrete actions
const MAX_DISCRETE_QUEUE = 12;
const MAX_DISCRETE_PER_TICK = 4;
const CULL_HALF_W = 860;                              // 1920/2 + margin; covers aim lead + zoom
const CULL_HALF_H = 540;                              // 1080/2 + margin
const FX_CULL_PAD = 120;
const CAP_ENEMIES = 64;
const CAP_BULLETS = 96;
const CAP_PICKUPS = 48;
```
**Accumulator Loop (`start()` / `pump()`):**
- On `start()`, record `lastWallMs = performance.now()`, `accMs = 0`, and run `setInterval(pump, PUMP_POLL_MS)`.
- In `pump()`: `now = performance.now(); accMs += Math.min(now - lastWallMs, MAX_FRAME_GAP_MS); lastWallMs = now;`
- `while (accMs >= BANSUNG_TICK_MS && !this.result) { accMs -= BANSUNG_TICK_MS; this.step(); }`
- Only emit frames **once per `pump()` batch** (if >=1 `step()` ran) rather than mid-catchup, while keeping all delta FX generated across catchup steps in a pending emit buffer cleared only after `hooks.tick()`.

## 4. Command Queue & Input Coalescing
Unlike `ThapWorld.command()` (which mutates immediately), `BansungWorld.enqueueCommand(playerId, cmd)` buffers inputs deterministically for the next `step()`:
```ts
interface PlayerCmdSlot {
  latestMove?: { mx: number; my: number; aimQ: number; firing: boolean; seq: number; recvTick: number };
  discrete: QueuedAction[]; // FIFO capped at MAX_DISCRETE_QUEUE
}
```
1. **Immediate Gate:** Reject with error string if `!p || this.result`; check token bucket (`p.tokens >= 1`, else silently drop continuous `move` or return rate-limit toast for discrete abuse).
2. **Sanitize on Enqueue:**
   - Continuous input (`mx`, `my`, `aim`, `firing`, `seq`): reject non-finite numbers; clamp `mx, my` to `[-1, 1]` and normalize vector if `hypot(mx, my) > 1`; wrap `aim` to `[-PI, PI]`; **overwrite** `slot.latestMove` (latest wins, zero input-buffer bloat).
   - Discrete actions (`dash`, `reload`, `slot`, `gadget`, `interact`, `perk`, `ping`): validate enum/bounds, push to `slot.discrete` (coalescing consecutive `slot` switches if `length > 4`).
3. **Drain at `step()` Start:**
   - Apply `slot.latestMove` to `p.input`; update `p.lastAckSeq = latestMove.seq`. If `tickNo - p.lastInputTick > INPUT_STALE_TICKS`, zero `p.input.mx = p.input.my = 0; p.input.firing = false`.
   - Execute up to `MAX_DISCRETE_PER_TICK` items from `slot.discrete` (dead/downed players may only trigger `ping` or `spectate_next`).

## 5. Authoritative `step()` Order (`< 5ms` budget)
1. **Begin Tick:** `tickNo++; elapsedMs = Math.round(tickNo * BANSUNG_TICK_MS);` clear `sharedHeaderCache` and `cullBucketCache`, refill `p.tokens` by `CMD_REFILL_PER_S * BANSUNG_DT`. (Accumulate transient FX in `outFx` until `clearPendingFx()`.)
2. **Drain Queues & Bot Brain (`bot.ts`):** Apply human commands; run co-op companion AI for bots/disconnected teammates on autopilot (`d07`).
3. **Wave Director (`director.ts`):** Advance wave state (`prep -> combat -> wave_clear -> boss -> victory`), spawn enemies/crates, tick perk-selection countdown.
4. **Heroes & Pets:** Advance dash timers (`0.28s`), stun/bleedout timers, shield/energy regen, active reload sweet-spot, weapon fire/spread/recoil; integrate velocity & slide against obstacle AABBs (`spatial.ts`); step pet spring-follow & magnet (`d25`).
5. **Spatial Grid Rebuild & Enemy AI (`spatial.ts`, `d34-d39`):** Rebuild `96px` cell spatial hash once; step enemy/boss state machines & telegraphs; stagger heavy target/boids pathing across 3 ticks (`tickNo % 3 === e.id % 3`); move & separate enemies.
6. **Turrets, Gadgets & Projectiles:** Step auto-turrets/heal drones (`d30`); advance thrown bombs/grenades (Z-arc fuse) and melee cleave bullet-deflection (`d29`); ray-step bullets vs AABBs/entities (`d05`) to prevent tunneling.
7. **Combat, Barrels & Crates (`combat.ts`, `d33`):** Resolve armor/HP damage, crits, knockback, stun DR, DOTs, explosive barrel chain blasts (`d06`), crate drops (`d32`).
8. **Pickups & Revive Circles:** Step magnet pull & item collection; step teammate revive channel progress (`d07`).
9. **Reap & Scoreboard:** Delete dead mobs/bullets, spawn drops, push death FX, attribute `kills`/`damage`/`stuns`/`revives`.
10. **End Check & Room Sync:** If all humans dead/unrevivable (`defeat`) or final boss/wave cleared (`victory`), set `this.result`, `this.stop()`, `dirty = true`. Every 15 ticks (0.5s) or on `dirty`/`logs.length > 0`, call `hooks.changed()`.

## 6. Snapshot Emit & Per-Viewer Viewport Culling
```ts
// Game.sendBansungFrames() calls world.frameFor(viewerId) per connected player & spectator
frameFor(viewerId?: string): BansungFrame
```
1. **Shared Tick Header (`buildSharedHeader()` cached once per tick):**
   - Quantized **all heroes** (max 6: `id, cls, x, y, hp, armor, energy, aimQ, flags, weaponId, state`), **active bosses** (never culled; needed for boss bar & radar), wave state, and timer (`aimQ = Math.round((aim / Math.PI) * 127)` in `[-127..127]`, positions rounded to integer px).
2. **Camera Anchor `(cx, cy)` per Viewer:**
   - Alive player: own `(p.x, p.y)`.
   - Downed/dead player or spectator: follows `p.spectateTargetId` (auto-picks nearest alive hero, cycles via `interact`/`spectate_next`, falls back to active boss or arena center).
   - Quantize `(cx, cy)` to `64px` buckets (`key = ((cx >> 6) << 16) ^ (cy >> 6)`) in `cullBucketCache` so spectators/co-located viewers share one culled payload.
3. **Bounding-Box Culling + Distance Cap:**
   - Query spatial grid / iterate pools for `[cx - CULL_HALF_W, cx + CULL_HALF_W] x [cy - CULL_HALF_H, cy + CULL_HALF_H]`.
   - If count exceeds `CAP_ENEMIES` / `CAP_BULLETS` / `CAP_PICKUPS`, sort by `dist2(entity, cx, cy)` ascending and truncate (boss projectiles keep priority).
   - Filter transient `outFx` (muzzle flashes, tracers, craters, stun rings, floating dmg) within `CULL_HALF_W + FX_CULL_PAD` / `CULL_HALF_H + FX_CULL_PAD`; keep boss/wave global FX unculled.
4. **Private `me` Slice & Emit Hygiene:**
   - Attach `me` only for active player (`ackSeq`, exact `clip`/`maxClip`, `reloadProg`, `dashCd`, `gadgetCd`, `slots`, `perkChoices`, `reviveProg`, `stats`).
   - After `hooks.tick()` finishes broadcasting to all connected sockets, `world.clearPendingFx()` empties `outFx` so catchup steps never duplicate or drop FX.
