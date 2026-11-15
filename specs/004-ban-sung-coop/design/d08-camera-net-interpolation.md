# d08 — Client Snapshot Ring-Buffer, Entity Interpolation, Local Aim & Spectator Camera

## 1. Wave-2 Target Files & Boundaries
- **Primary implementation**: `client/src/bansung/store.ts` (`BansungStore` singleton `bansungStore`, snapshot ring-buffer, prediction/reconciliation, camera controller).
- **Contract dependencies**: `shared/src/bansung.ts` (`BANSUNG_TICK_MS`, `BansungFrame`, `BansungCommand`, `BansungRoomView`).
- **Consumers (read-only on store)**:
  - `client/src/bansung/render.ts`: calls `bansungStore.step(now)` once per `rAF`, reads interpolated entities, `localAimRad`, and snapped `cam`.
  - `client/src/bansung/sound.ts`: consumes queued positional audio triggers emitted at `renderTick >= snap.tick`.
  - `client/src/components/BansungBoard.tsx`: pushes `BansungFrame` via `bansungStore.push(frame)`, feeds pointer/stick inputs, renders spectator banner from `spectatingInfo`.

---

## 2. Core Constants
```ts
export const BANSUNG_TICK_HZ = 30;
export const BANSUNG_TICK_MS = 1000 / BANSUNG_TICK_HZ; // 33.333ms
export const SNAP_BUF_CAP = 16;          // ~533ms history at 30Hz
export const BASE_INTERP_MS = 66;        // 2 ticks baseline delay
export const MIN_INTERP_MS = 50;
export const MAX_INTERP_MS = 180;
export const MAX_EXTRAP_MS = 100;        // 3 ticks max dead-reckoning on packet loss
export const TELEPORT_SNAP_DIST = 160;   // px/tick jump => snap instead of lerp
export const INPUT_RING_CAP = 32;        // ~1s unacked movement history
export const RECONCILE_SNAP_ERR = 96;    // px error => hard snap
export const RECONCILE_IGNORE_ERR = 2;   // px deadband
export const MAX_LOOK_AHEAD_PX = 96;     // world px toward aim
export const CAM_MARGIN_PX = 64;         // soft arena edge margin
export const AUTO_SPECTATE_DELAY_MS = 1200;
```

---

## 3. Data Schemas (`client/src/bansung/store.ts`)
Upgrade the 2-frame `px/py -> x/y` pattern in `client/src/thap/store.ts` to a circular snapshot ring-buffer with monotonic render clock:

```ts
export interface SnapPlayer { id: number; x: number; y: number; aim: number; hp: number; armor: number; flags: number; weapon: number; }
export interface SnapEnemy  { id: number; kind: number; x: number; y: number; hp: number; flags: number; }
export interface SnapBullet { id: number; owner: number; kind: number; x: number; y: number; vx: number; vy: number; }

export interface ParsedSnapshot {
  tick: number;
  recvAt: number;
  players: Map<number, SnapPlayer>;
  enemies: Map<number, SnapEnemy>;
  bullets: Map<number, SnapBullet>;
  fxRaw: number[];       // packed one-shot FX (shots, hits, explosions, deaths)
  fxConsumed: boolean;   // triggered once when renderTick >= tick
}

export interface PendingInput { seq: number; dtSec: number; mx: number; my: number; speed: number; }

export interface BansungCamera {
  x: number; y: number; zoom: number;
  lookX: number; lookY: number;
  shakeMag: number; shakeX: number; shakeY: number;
  mode: 'self' | 'spectate' | 'free';
  followIdx: number | null;
  deadSinceAt: number;
}
```
- **Ring-buffer**: fixed `ring = new Array<ParsedSnapshot | null>(SNAP_BUF_CAP)`, `head`, `count`.
- **Match reset / tick-wrap guard** (modeled on `thapStore.push`): if `frame.tick <= latestTick`, drop if `latestTick - frame.tick < 60` (stale/dup); if `>= 60`, clear ring + entity phases + `pendingInputs` (new match started before `reset()`).

---

## 4. Clock Sync & Entity Interpolation (`step(now)`)
1. **Adaptive Interp Delay & Minimum-Filter Clock Sync** (on `push(frame)`):
   - `expectedGap = (frame.tick - prevTick) * BANSUNG_TICK_MS`
   - `err = Math.abs((now - prevRecvAt) - expectedGap)`
   - `jitterMs = jitterMs * 0.875 + Math.min(err, 120) * 0.125`
   - `targetDelayMs = clamp(BASE_INTERP_MS + jitterMs * 1.5, MIN_INTERP_MS, MAX_INTERP_MS)`
   - `sampleOffset = now - frame.tick * BANSUNG_TICK_MS`
   - Pull `clockOffsetMs` toward `sampleOffset` faster when lower (`alpha = sampleOffset < clockOffsetMs ? 0.15 : 0.02`) to lock onto minimum latency floor.
2. **Monotonic `renderTick`** (every `rAF`, `dtMs = clamp(now - lastRafAt, 0, 50)`):
   - Slew `interpDelayMs` toward `targetDelayMs` by at most `2ms/frame`.
   - `targetRenderMs = (now - clockOffsetMs) - interpDelayMs`
   - If `Math.abs(targetRenderMs - renderMs) > 180`, snap `renderMs = targetRenderMs` (tab resume); else `renderMs += dtMs + (targetRenderMs - renderMs) * 0.1`.
   - `renderTick = renderMs / BANSUNG_TICK_MS`.
3. **Bracketing & Sampling**:
   - Find oldest `B` with `B.tick >= renderTick` and predecessor `A` (`A.tick <= renderTick <= B.tick`), then `t = (renderTick - A.tick) / Math.max(1, B.tick - A.tick)`.
   - **Players & Enemies**:
     - Both `A` & `B`: if `hypot(B.x - A.x, B.y - A.y) > TELEPORT_SNAP_DIST`, snap to `B`; else `lerp(A, B, t)`.
     - Angle: shortest-arc `lerpAngle(A.aim, B.aim, t)` (skipped for local player).
     - `B` only (spawn / entered viewport cull): spawn at `B` with `spawnAlpha` ramp over `100ms`.
     - Underrun (`renderTick > newest.tick`): extrapolate velocity from last two snapshots (`v * 0.7` damping) capped at `MAX_EXTRAP_MS`, then freeze.
   - **Projectiles**: interpolate `A -> B` when present in both; newly spawned bullet in `B` extrapolates backward/forward using `(B.vx, B.vy)` over `(renderTick - B.tick) * BANSUNG_TICK_MS` so fast bullets never visibly stutter on spawn.
   - **Delta FX Sync**: iterate unconsumed snapshots with `snap.tick <= renderTick`, mark `fxConsumed = true`, push particles/decals/audio events so explosions align visually with interpolated positions.

---

## 5. Local Aim Responsiveness & Lightweight Prediction
- **Zero-Latency Local Aim**:
  - Store `pointerScreen: { x, y }`, `stickAim: { active, rad, mag }`, `localAimRad`.
  - Every `rAF` (even if mouse is stationary while camera moves):
    - Desktop: `world = screenToWorld(pointerScreen, cam, viewW, viewH)`; `localAimRad = Math.atan2(world.y - localDrawY, world.x - localDrawX)`.
    - Mobile: if `stickAim.mag > 0.18`, `localAimRad = stickAim.rad`.
  - Renderer always draws local player gun, laser sight, and facing flip (`cos(localAimRad) < 0`) from `localAimRad`, never waiting for server echo.
  - Upstream `BansungCommand` (`input`) throttled to `30Hz`, except `shoot` / `dash` / `skill` edges send immediately.
- **Local Movement Prediction + Smooth Reconciliation**:
  - `localPred` integrates `(mx, my) * speed * dtSec` clamped to arena bounds + static cover AABBs from `BansungRoomView`.
  - Push `{ seq, dtSec, mx, my, speed }` into 32-slot `pendingInputs`; drop `seq <= frame.me.ackSeq` on snapshot arrival.
  - Re-simulate unacked inputs from authoritative `(me.x, me.y)` -> `reconciledPos`; compute `err = reconciledPos - localPred`.
  - If `|err| > RECONCILE_SNAP_ERR` (dash/knockback/respawn): snap `localPred = reconciledPos`, `corrOffset = {0, 0}`.
  - Else if `|err| > RECONCILE_IGNORE_ERR`: set `localPred = reconciledPos` and fold `err` into `corrOffset`, decaying `corrOffset *= Math.exp(-14 * dtSec)` each `rAF` (`localDrawPos = localPred + corrOffset`).

---

## 6. Follow Camera, Screen Shake & Spectator Mode
- **Zoom & Pixel Snapping**: default zoom `clamp(Math.min(viewW / 960, viewH / 540), 1.0, 2.5)`, wheel/pinch clamped `[0.75, 2.5]`; expose `snapCam(cam, dpr)` rounding `x, y` to `1 / dpr` grid to eliminate 1px pixel-art outline shimmer.
- **Spring-Damped Follow + Look-Ahead**:
  - Alive/Downed self (`mode === 'self'`): target `= localDrawPos`; look-ahead `= dir(localAimRad) * clamp(dist * 0.22, 0, MAX_LOOK_AHEAD_PX)` (zeroed when downed or mobile idle).
  - Exponential damping: `cam.x += (tx + lookX - cam.x) * (1 - exp(-10 * dtSec))`; `lookX` eases at rate `7`.
  - Clamp `cam.x` within `[halfW - CAM_MARGIN_PX, mapW - halfW + CAM_MARGIN_PX]` (centered if `mapW <= halfW * 2`); same for `y`.
- **Trauma Shake**: `addShake(trauma, dirRad?)` clamps `shakeMag <= 24`; decays `shakeMag *= exp(-12 * dtSec)`; high-freq sample `(sin(now*0.053)*0.6 + cos(now*0.097)*0.4) * shakeMag` scaled by user reduce-motion setting.
- **Spectator Follow (`mode: 'spectate' | 'free'`)**:
  - Enters `'spectate'` when `myIdx === undefined` or local player is dead (`!alive && !downed`). Downed state keeps `'self'` so player can crawl/watch revive ring, with optional peek toggle.
  - On followed target death, wait `AUTO_SPECTATE_DELAY_MS` (`1200ms`), then `pickNextTarget()` in priority: `(1) alive human teammate -> (2) alive co-op bot -> (3) arena center / boss`.
  - Controls: `Tab` / `ArrowLeft` / `ArrowRight` / HUD teammate click (`spectateCycle(±1)`, `spectatePlayer(idx)`); pointer-drag switches to `'free'`, `Space` re-locks `'spectate'`.
  - Expose `spectatingInfo: { active, mode, targetIdx, targetName, canCycle }` for `BansungBoard.tsx`.
