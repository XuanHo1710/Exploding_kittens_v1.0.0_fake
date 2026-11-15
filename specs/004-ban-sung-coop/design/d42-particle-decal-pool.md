# d42: Fixed-Size Object-Pooled Particle & Decal Manager

## 1. Wave-2 Target Files & Ownership
- **Primary module**: `client/src/bansung/fxPool.ts` (exports `FxPool`, singleton `bansungFx`, enums/constants).
- **Callers (no pool internals duplicated)**:
  - `client/src/bansung/store.ts`: maps decoded `BansungFrame` FX deltas (`muzzle`, `hit`, `boom`, `stun`, `dash`, `death`) into `bansungFx.spawn*()` calls; calls `bansungFx.reset(mapW, mapH)` on match/room change.
  - `client/src/bansung/render.ts`: calls `bansungFx.step(dtMs)` once per RAF tick, then renders `drawDecals(...)` -> `drawLayer(GROUND_RING)` -> Y-sorted world pass (`drawLayer(WORLD_YSORT)` interleaved or post-ground) -> `drawLayer(ADDITIVE)` -> `drawTexts(...)`.

## 2. Capacities, Memory Budget & Zero-GC Layout
Unlike `client/src/thap/store.ts` (`st.effects.filter(...)` + per-boom `createRadialGradient`), `fxPool.ts` allocates **zero objects, zero closures, and zero CSS color strings** during gameplay:

| Pool | Capacity | Storage | Footprint | Lifecycle |
|---|---|---|---|---|
| **Particles** | `PARTICLE_CAP = 1024` | SoA `Float32Array` / `Uint16Array` / `Uint8Array` | ~56 KB | Swap-and-pop `activeIds` on expire |
| **Active Decals** | `DECAL_CAP = 384` | SoA TypedArrays (`CASING`/`CRATER`/`SCORCH`/`SPLAT`) | ~20 KB | Settles & bakes into tile chunks (or rings) |
| **Damage/Status Text** | `TEXT_CAP = 128` | Pre-allocated fixed `TextSlot[]` + interned `-0..-999` table | ~8 KB | Fixed ring overwrite; zero GC strings |
| **Decal Tile Chunks** | `max 16` tiles (`512x512`) | Reusable offscreen `<canvas>` map (`2048x2048` arena = 4x4) | ~16 MB VRAM | `clearRect` on reset; never reallocated |
| **Procedural FX Atlas** | `256x128` single canvas | Pre-baked pixel stamps + radial glow disc at `init()` | ~128 KB VRAM | Eliminates runtime `createRadialGradient` |

### Particle SoA Buffers (`N = 1024`)
- `kind: Uint8Array(N)`, `layer: Uint8Array(N)` (`0=GROUND_RING`, `1=WORLD_YSORT`, `2=ADDITIVE`), `prio: Uint8Array(N)` (`0..3`), `colorIdx: Uint8Array(N)` (indexes static `FX_PALETTE[32]` hex tuple).
- `x, y, z, vx, vy, vz, size, sizeEnd, rot, vrot, gravity, drag: Float32Array(N)` (2.5D height `z >= 0` rendered at `screenY = y - z`, ground shadow at `y`).
- `ageMs, lifeMs, paramA, paramB: Float32Array(N)` (`paramA/B` store `x2/y2` for tracers/arcs, `entityId` for orbiting `stun_star`, or frame index for `ghost` afterimages).
- `activeIds: Uint16Array(N)`, `freeStack: Uint16Array(N)`, `activeCount`, `freeTop`.

## 3. Public API (`client/src/bansung/fxPool.ts`)
```ts
export const enum FxLayer { GroundRing = 0, World = 1, Additive = 2 }
export const enum FxPrio { Low = 0, Med = 1, High = 2, Critical = 3 }
export const enum FxKind {
  Dust = 0, Smoke = 1, Spark = 2, Muzzle = 3, Tracer = 4, Glow = 5,
  Ember = 6, Ring = 7, Arc = 8, StunStar = 9, Chip = 10, Ghost = 11,
  FirePuff = 12,
}
export const enum DecalKind {
  CasingBrass = 0, CasingRed = 1, CraterSm = 2, CraterLg = 3,
  Scorch = 4, SplatSlime = 5, SplatOil = 6, Rubble = 7,
}

export interface SpawnFxOpts {
  layer?: FxLayer; prio?: FxPrio; colorIdx?: number;
  vx?: number; vy?: number; z?: number; vz?: number;
  size?: number; sizeEnd?: number; lifeMs?: number;
  rot?: number; vrot?: number; gravity?: number; drag?: number;
  paramA?: number; paramB?: number;
}
export interface TextSlot { active: number; x: number; y: number; vy: number; ageMs: number; lifeMs: number; colorIdx: number; scale: number; text: string; }

export const FX_PALETTE = [
  '#ffffff', '#fff3bf', '#ffd43b', '#ff922b', '#fa5252', '#c92a2a', // 0..5: flash/gold/fire
  '#74c0fc', '#339af0', '#b197fc', '#69db7c', '#f5e6c8', '#a68b6b', // 6..11: plasma/arc/heal/dust/sand
  '#3a3642', '#140c1c', '#d8b467', '#e03131', // 12..15: smoke/outline/brass/shotgun-hull
] as const;

export interface FxPool {
  init(): void; // builds 256x128 FX atlas + pre-interns "-1".."-999" strings
  reset(mapW: number, mapH: number): void; // resets cursors & clearRects chunk canvases
  step(rawDtMs: number): void; // clamps dt <= 50ms, integrates physics, bakes settled decals
  spawnParticle(kind: FxKind, x: number, y: number, opts?: SpawnFxOpts): number;
  spawnBurst(preset: 'muzzle'|'impact'|'explosion'|'stun'|'dash'|'crate', x: number, y: number, ang?: number, scale?: number): void;
  spawnDecal(kind: DecalKind, x: number, y: number, angle?: number, z?: number): void;
  spawnText(text: string, x: number, y: number, colorIdx: number, scale?: number): void;
  drawDecals(ctx: CanvasRenderingContext2D, vx0: number, vy0: number, vx1: number, vy1: number): void;
  drawLayer(ctx: CanvasRenderingContext2D, layer: FxLayer, vx0: number, vy0: number, vx1: number, vy1: number, now: number): void;
  drawTexts(ctx: CanvasRenderingContext2D, vx0: number, vy0: number, vx1: number, vy1: number): void;
  stats(): { activeParticles: number; activeDecals: number; activeTexts: number; dropped: number };
}
```

### Burst Presets (`spawnBurst` Exact Counts & Budgets)
| Preset | Particles Spawned | Decal | Priority / Life |
|---|---|---|---|
| `muzzle` | 1 `Muzzle` cone + 3 `Spark` (`vx/vy` +-0.45 rad) | 1 `CasingBrass`/`CasingRed` | `High` (`65ms` muzzle, `160ms` spark) |
| `impact` | 4 `Spark` + 2 `Dust` (angle reflected +-0.8 rad) | `Splat*` on kill only | `Med` (`140..220ms`) |
| `explosion` | 1 `Ring` (`Critical`) + 6 `FirePuff` + 8 `Smoke` + 10 `Ember` | `CraterLg`/`CraterSm` + `Scorch` | `Critical`/`High` (`280..520ms`) |
| `stun` | 1 `Ring` (`#74c0fc`, `Critical`) + 4 `Arc` + 3 `StunStar` | — | `Critical` (`320ms` ring, `1800ms` stars) |
| `dash` | 5 `Dust` puff ring + 1 `Ghost` (caller passes frame ref) | — | `Low`/`Med` (`240ms` dust, `180ms` ghost) |
| `crate` | 6 `Chip` (`z=12..24`, bounce) + 4 `Dust` | `Rubble` baked | `Low` (`320..480ms`) |

## 4. O(1) Allocation, Priority Eviction & Density Throttle
1. **Free-Slot Acquisition**:
   - Fast path (`freeTop >= 0`): pop `id = freeStack[freeTop--]`, push onto `activeIds[activeCount++]`. Zero scanning.
   - Full path (`freeTop < 0`): scan up to `16` slots from rotating `evictCursor` in `activeIds` for first slot with `prio <= reqPrio` (tie-breaking on highest `ageMs / lifeMs`). Overwrite slot in place without changing `activeCount`. If all 16 probed slots have higher priority and `reqPrio === FxPrio.Low`, increment `dropped` and return `-1` (never starves `Critical` bomb/stun telegraphs).
2. **Expiration (Swap-and-Pop)**:
   - Iterate `i` backward `activeCount - 1 .. 0`. When `ageMs[id] >= lifeMs[id]`, swap `activeIds[i] = activeIds[--activeCount]` and push `id` onto `freeStack[++freeTop]`. Loop inspects only live particles (`O(activeCount)`).
3. **Auto-Throttle & Frame-Time Guard**:
   - **High density** (`activeCount > 768`): `spawnBurst()` halves `Low`/`Med` counts and scales `lifeMs` by `0.7`.
   - **Frame drop guard**: if `rawDtMs > 24` for 3 consecutive frames, `drawLayer(Additive)` skips `'lighter'` composite switch (uses standard `source-over`) and suppresses `Dust`/`Chip` spawns for `1000ms`.
   - Fast inline `xorshift32` PRNG replaces `Math.random()` inside burst loops.

## 5. 2.5D Physics & Chunk-Baked Decal Pipeline
- **Coordinate Projection**: World `(x, y)` is ground plane; height `z >= 0` lifts sprite vertically (`drawY = y - z`). Rings/craters/scorches draw at `0.72` Y-foreshortening (`ellipse(x, y, r, r * 0.72, ...)`).
- **Shell Casings & Debris (`CasingBrass`, `CasingRed`, `Chip`)**:
  - Ejected perpendicular to aim angle `+- 1.3 rad` at `z = 14`, `vx/vy = 75..135 px/s`, `vz = 110..170 px/s`, `gravity = 980 px/s^2`, `vrot = +-18 rad/s`.
  - On `z <= 0`: `z = 0`, `vz = -vz * 0.42`, `vx *= 0.55`, `vy *= 0.55`, `bounces++`.
  - When `bounces >= 2` (or `ageMs > 600ms`), casing **settles**: stamped once into overlapping `512x512` `DecalChunk` canvas (`4x2` brass rect + `1x1` `#fff3bf` highlight) and freed from the active `384`-slot decal array.
- **Static Decals (`CraterSm`, `CraterLg`, `Scorch`, `Splat*`, `Rubble`)**:
  - Immediately baked into overlapping `512x512` chunk tiles (handles tile-border overlap across up to 4 adjacent chunks).
  - **Render cost**: `drawDecals()` loops over visible tile coordinates `[Math.floor(vx0/512)..Math.floor(vx1/512)]` x `[Math.floor(vy0/512)..Math.floor(vy1/512)]` — at most `4..9` `drawImage` calls per frame even after 10 waves of explosions.
  - **Chunk Cap Fallback**: If `chunks.size >= 16` (huge custom map), fallback keeps `384`-slot circular buffer overwriting oldest decal instead of allocating a 17th canvas.

## 6. Pre-Baked FX Atlas & Miragine-Style Frame Cadence
- **FX Atlas (`256x128`, `imageSmoothingEnabled = false`)** generated procedurally at `init()`:
  - Row `y=0` (`32x32` cells): `Dust` 4 frames (stepped cream circles `#f5e6c8`), `Smoke` 4 frames (dithered charcoal `#3a3642`).
  - Row `y=32` (`32x32` cells): `FirePuff` 4 frames (Miragine crisp pixel fire `#fff3bf -> #ff922b -> #c92a2a`), `Muzzle` 3 stepped cones, `StunStar` (`12x12` `#ffd43b` with `#140c1c` 1px outline).
  - Row `y=64` (`64x64` cells): `CraterSm` (`28x20`), `CraterLg` (`52x36`), `Scorch` (`48x34` Bayer-dithered soot), `GlowDisc` (`64x64` pre-baked radial alpha disc tinted/scaled at draw time).
- **Stepped Frame Timing**: `Dust`, `Smoke`, `FirePuff`, and `Ghost` compute `frame = Math.min(3, (ageMs / lifeMs * 4) | 0)` for snappy pixel-art animation matching Miragine War's `~80-110ms` frame cadence rather than smooth fades.
- **Layer Rendering Rules**:
  - Viewport cull: skip any item outside `[vx0 - 64, vx1 + 64] x [vy0 - 64, vy1 + 64]`.
  - Alpha quantization: round `alpha` to `0.05` steps; skip if `< 0.04`.
  - `Arc`: 3-segment jittered polyline updated every `45ms` (`(ageMs / 45) | 0` seed) between `(x,y)` and `(paramA, paramB)`.
  - `Tracer`: single `lineWidth = size`, `lineCap = 'butt'` segment from `(x,y)` toward `(x - vx*0.032, y - vy*0.032)`.
  - `drawTexts`: 1px `#140c1c` outline via 4-offset pixel stroke or `strokeText` (`lineWidth = 3`) with `font = 'bold 12px monospace'` set **once** outside the loop.

## 7. Verification & Acceptance Criteria
- **Zero-GC Soak**: Spawning `500` particles/s + `60` casings/s for `10s` causes `0` `activeParticles > 1024`, `0` runtime `createRadialGradient` calls, and `<= 9` chunk `drawImage` calls per frame in `drawDecals`.
- **Clean Reset**: Calling `bansungFx.reset(w, h)` drops `activeParticles === 0`, `activeDecals === 0`, `activeTexts === 0`, and clears all chunk canvases with zero new canvas allocations.
