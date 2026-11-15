# d47 — Performance & Netcode Budgets (`ban_sung`)

## 1. Hard Budgets & Acceptance Targets
| Domain | Metric | Hard Budget | Target (`p95`) | Guardrail / Fail-Safe |
|---|---|---|---|---|
| **Server Tick** | 30Hz loop (`33.33 ms` slot) | `<= 5.0 ms` | `<= 3.5 ms` | 2-tier overload shedding when EMA `> 4.5 ms` |
| **Network Down** | Per-client `bansung:frame` | `< 12 KB/s` (`<= 400 B/f`) | `<= 8.5 KB/s` | Viewport cull + staggered keyframes + spawn-once shots |
| **Network Up** | Per-client `bansung:cmd` | `<= 1.5 KB/s` | `<= 0.6 KB/s` | Token bucket (`60` burst, `45/s` refill) + dirty emit |
| **Client 60 FPS** | JS + Canvas 2D frame | `<= 16.67 ms` | `<= 8.0 ms` | Offscreen terrain/flip/flash caches + 15Hz React HUD |
| **Client VRAM** | Offscreen caches + chunks | `<= 48 MB` | `<= 28 MB` | LRU variant cap (`128`), DPR clamped `<= 2` |

## 2. Shared Budget Constants (`shared/src/bansung.ts`)
```ts
export const BANSUNG_TICK_HZ = 30;
export const BANSUNG_TICK_MS = 1000 / BANSUNG_TICK_HZ; // 33.333ms fixed step
export const BANSUNG_DT = 1 / BANSUNG_TICK_HZ;
export const BANSUNG_CMD_BURST = 60;       // mirrors THAP_CMD_BURST pattern in thap.ts
export const BANSUNG_CMD_REFILL = 45;      // commands/sec
export const BANSUNG_NET_BUDGET_BPS = 12 * 1024;
export const BANSUNG_FRAME_WARN_BYTES = 400;
export const BANSUNG_FRAME_MAX_BYTES = 1536;
export const BANSUNG_VIEW_CULL_MARGIN = 192; // px outside 1280x720 ref view
export const BANSUNG_KEYFRAME_STRIDE = 30;   // staggered 1.0s refresh: slot % 30 === tick % 30
export const BANSUNG_CHUNK_SIZE = 512;
export const BANSUNG_MAX_DPR = 2;
export const BANSUNG_HUD_PUSH_HZ = 15;
export const BANSUNG_CAPS = {
  players: 4, bots: 2, enemies: 90, projectiles: 220, pickups: 48, turrets: 16,
} as const;
```

## 3. Server 30Hz Tick Budget (`<= 5.0 ms` in `server/src/game/bansung/world.ts`)
- **Drift-Compensated Loop**: `setInterval(..., 16)` accumulator advancing `BANSUNG_DT` (clamp catch-up `<= 2` steps/wake).
- **Per-Tick Slice Allocation (peak: 4 heroes, 2 bots, 90 mobs, 1 boss, 220 shots)**:
  1. `0.15 ms` **Command drain**: Bounded queue (`<= 8` cmds/tick/player); coalesce `move`/`aim` (last-write-wins), execute discrete `shoot`/`dash`/`reload`/`revive` FIFO.
  2. `0.45 ms` **Zero-GC Spatial Hash**: `64 px` cells using pre-allocated `Int32Array` (`cellHead.fill(-1)` + `nextNode[slot]`)—zero `Map`/`Array` allocations per tick.
  3. `1.20 ms` **AI & Boids**: 3x3 neighbor query capped at `6` neighbors; stagger target/path rebuild (`slot % 3 === tick % 3`, 10Hz).
  4. `1.30 ms` **Swept Physics**: Scalar `(dx, dy)` math without `{x, y}` temporaries; single-pass analytic ray-circle/AABB for projectiles moving `> 12 px/tick`.
  5. `0.40 ms` **Combat & Pool Free-List**: Reuse pooled integer slots (no `Array.splice`).
  6. `1.00 ms` **Quantize & Per-Client Cull**: Quantize active slots once; emit culled binary `Uint8Array` slices from a reused `2048 B` scratch buffer.
  - **Total = `4.50 ms`** (`0.50 ms` headroom under `5.0 ms`).
- **Overload Tiering**: Rolling EMA `tickEma = tickEma * 0.9 + dtMs * 0.1`.
  - `tickEma > 4.5 ms` (10 ticks): halve separation queries (`tick & 1`), pause non-critical pickup shimmer.
  - `tickEma > 6.0 ms`: cap wave spawns at `60` enemies, drop non-critical damage-number FX.

## 4. Quantized Binary Frame Protocol (`< 12 KB/s` vs `thap` JSON)
`ThapFrame` (`shared/src/thap.ts`) sends JSON `number[]` at `10 Hz`. At `30 Hz`, JSON arrays of 80+ mobs exceed `60 KB/s`. `bansung` uses a zero-dependency `DataView` binary codec (`encodeBansungFrame` / `decodeBansungFrame` in `shared/src/bansung.ts`) on `bansung:frame`:
- **Quantization**: Positions `(x, y)` -> `uint16` (`1 px`, `0..65535`); aim -> `uint8` (`2π/256 ≈ 1.4°`); HP/armor/energy -> `uint8` (`0..100%`); shot velocity `(vx, vy)` -> `int16` (`px/s`).
- **Spawn-Once Projectiles**: Emit once on spawn (`id:u16, kindOwner:u8, x:u16, y:u16, vx:i16, vy:i16` = **11 B**) and `id:u16` (**2 B**) only on early impact before `ttl`. Client integrates `x + vx*t` at 60 FPS (**~30x smaller** than polling positions).
- **Staggered Keyframes + `int8` Deltas**: Enemies moving `<= 127 px/tick` send **4 B** delta (`slot:u8, dx:i8, dy:i8, state:u8` where `state = anim:3b | flip:1b | hpTier:4b`). Full **8 B** keyframe (`slot:u8, kind:u8, x:u16, y:u16, hpPct:u8, state:u8`) sends only on spawn, `|Δhp| >= 5%`, teleport, or staggered `slot % 30 === tick % 30` (prevents keyframe spikes).
- **Exact Wire Budget (30Hz, 4 players, viewport culled)**:
  - **Header (`14 B`)**: `ver:u8(1), flags:u8, tick:u16, elapsedDs:u16, wave:u8, nP:u8, nEKey:u8, nEDel:u8, nSNew:u8, nSKill:u8, nFx:u8, meMask:u8`
  - **Players (`4 × 9 B = 36 B`)**: `slot:u8, x:u16, y:u16, aim:u8, hpPct:u8, shPct:u8, flags:u8`
  - **Steady Combat (35 visible mobs: `2` key + `33` delta, `1` shot new, `1` shot kill, `3` FX, `5 B` me)**:
    `14 + 36 + 16 + 132 + 11 + 2 + 21 + 5 = 237 B/frame` (`7.11 KB/s`)
  - **Heavy Boss Burst (50 visible mobs: `3` key + `47` delta, `4` shots, `3` kills, `5` FX, `8 B` me)**:
    `14 + 36 + 24 + 188 + 44 + 6 + 35 + 8 = 355 B/frame` (`10.65 KB/s < 12 KB/s`)
- **Upstream (`bansung:cmd`)**: Client packs movement/aim/buttons (`5 B` binary or compact delta), rate-capped `<= 30 Hz` (emit on change or `100 ms` heartbeat).

## 5. Client 60 FPS Offscreen Sprite Caching (`client/src/bansung/sprites.ts`, `render.ts`)
Unlike `client/src/thap/sprites.ts` (`drawMiragineSheetFrame` calls `ctx.save()/ctx.scale(-1,1)/ctx.restore()` per actor), `ban_sung` pre-bakes all variants at load time so hot-loop drawing is flat `drawImage` blits:
```ts
// Miragine-compatible AnimMeta + precomputed flip offset
export type BansungAnimMeta = readonly [
  frames: number, cellW: number, cellH: number, offX: number, offY: number, flipOffX: number
];
export interface CachedSheet {
  meta: BansungAnimMeta;
  normal: HTMLCanvasElement;   // clean pixel canvas
  flipped: HTMLCanvasElement;  // mirrored horizontally once on load (scale(-1, 1) never called in loop)
  flash: HTMLCanvasElement;    // solid #ffffff silhouette via offscreen 'source-in'
  flashFlipped: HTMLCanvasElement;
}
```
1. **Static Terrain Chunk Cache (`512×512` canvases)**: Bake floor tiles, walls, and static rock shadows once per biome (`~15` chunks for `2400×1600`). Viewport blits only `<= 6` visible chunks (`< 0.3 ms` vs 2,000 tile draws). Stamp permanent scorch/blood marks onto a separate `decalChunks` canvas on event.
2. **Pre-Baked Flipped & Hit-Flash Sheets**: `bakeSheetVariants(img, meta)` runs once on `onload`: draws `normal`, mirrors each cell into `flipped` (`flipOffX = -(cellW + offX)`), and generates `flash`/`flashFlipped` via `source-in` fill. Runtime draws with integer-snapped `ctx.drawImage(canvas, f * cellW, 0, cellW, cellH, (x + ox) | 0, (y + oy) | 0, cellW, cellH)` — **0 `save/restore` for sprites**.
3. **Glow, Shadow & Damage-Number Cache**: Pre-bake `shadow_32` and radial glows (`glow_orange_64`, `glow_cyan_64`) once at init (`ctx.shadowBlur` & `createRadialGradient` banned in 60fps loop). Cache formatted damage labels (`"42"`, `"128!"`) in an LRU `Map<string, HTMLCanvasElement>` (`max 256`).
4. **Render Loop Discipline (`<= 8.0 ms` budget)**:
   - Clamp `dpr = Math.min(window.devicePixelRatio || 1, BANSUNG_MAX_DPR)`; set `ctx.imageSmoothingEnabled = false` on resize.
   - Batch by Canvas state: (a) terrain/decal chunks, (b) shadows (`globalAlpha = 0.35` once), (c) Y-sorted actors/props/bullets (`globalAlpha = 1`), (d) additive FX (`globalCompositeOperation = 'lighter'` once), (e) cached damage numbers.
   - **React HUD Decoupling (`store.ts`)**: Canvas reads mutable snapshot refs at `60 Hz`; React HUD state pushes at `<= 15 Hz` (or instant on HP/weapon/wave change).

## 6. Telemetry & Wave-2 Ownership Targets
- **Built-in `F3` Counters**: `tickMs (p50/p95/max)`, `txBps`, `rxBps`, `fps`, `drawCalls`, `pooledActive` (server logs warning if `tickMs > 5.0` or `frameBytes > 400`).
- **Wave-2 Target Files**:
  - `shared/src/bansung.ts` — `BANSUNG_*` constants, `BANSUNG_CAPS`, `encodeBansungFrame` / `decodeBansungFrame`.
  - `server/src/game/bansung/world.ts` — 30Hz accumulator, `Int32Array` spatial hash, overload tiers, culled binary encode.
  - `server/src/game/game.gateway.ts` — `bansung:cmd` burst/rate guard (`60`/`45s`) & binary `bansung:frame` emit.
  - `client/src/bansung/sprites.ts` — `bakeSheetVariants`, `512×512` terrain/decal chunk baker, LRU bitmap caches.
  - `client/src/bansung/render.ts` — batched 60 FPS Y-sorted renderer (no actor `save/restore` or `shadowBlur`).
  - `client/src/bansung/store.ts` — binary decode, 60Hz interpolation buffer, 15Hz React HUD throttle, `F3` metrics.
