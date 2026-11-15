# d23 — Stun / Flashbang VFX & State Animation

## 1. Scope & Wave-2 Target Files
Visual feedback for concussion stuns, flashbangs, EMP shockwaves, Shock Baton strikes, and Boss slam stuns (`ban_sung`).
- `shared/src/bansung.ts` — Add stun entity bitmask flag (`BS_FLAG_STUNNED`) and delta FX event kinds (`BS_FX_STUN_RING`, `BS_FX_FLASHBANG`, `BS_FX_EMP_ARC`).
- `client/src/bansung/stunFx.ts` — Dedicated pooled VFX & stun-pose resolver (expanding ring, screen flash attenuation, orbiting stars, jagged electric arcs, Miragine freeze-jitter).
- `client/src/bansung/render.ts` — Hook ground shockwaves (pre-entity), freeze-jitter + silhouette flash (entity pass), overhead stars/arcs (post-entity Y-pass), and screen flash overlay (post-world).
- `client/src/bansung/sprites.ts` — Cache 16×16 2-frame pixel star sprite (`fx_stun_star`), white/cyan silhouette tint cache (`drawTintedFrame`), and Miragine `thunderball` / `storm` strips.
- `client/src/bansung/particles.ts` — Emit pooled spark/star flecks on stun detonation (`MAX_STUN_BURST = 16`).

---

## 2. Shared Schema & Delta FX Contract (`shared/src/bansung.ts`)
- **Entity state flag**: `export const BS_FLAG_STUNNED = 1 << 3;` (packed into hero/mob quantized `flags`). Client records `stunEnteredAt = now` on `0 -> 1` transition so 60 FPS jitter/flash timers need no per-tick network fields.
- **Delta FX stride (`BS_FX_FIELDS = 6`)**: `[kind, x, y, radiusOrX2, durOrY2, variantSeed]`
  - `BS_FX_STUN_RING = 3` — `[3, x, y, radiusPx, durMs, variant]` (`variant`: `0`=Cyan EMP, `1`=Amber Boss Slam, `2`=White-Gold Concussion).
  - `BS_FX_FLASHBANG = 4` — `[4, x, y, radiusPx, durMs, intensityPct]` (triggers `variant=2` shockwave ring + distance-attenuated screen flash; EMP blasts emit `BS_FX_STUN_RING` `variant=0` for `thunderball` overlay).
  - `BS_FX_EMP_ARC = 5` — `[5, x1, y1, x2, y2, seedColor]` (chain-lightning/Shock Baton bolt between endpoints; `durMs = 220`).

---

## 3. Constants & Timing Tuning (`STUN_FX_CONST`)
```ts
export const STUN_FX_CONST = {
  RING_DUR_MS: 380,          // Boss slam: 480ms
  RING_Y_ASPECT: 0.70,       // 2.5D top-down ground perspective (like thap/render.ts ellipses)
  FLASH_DUR_MS: 650,         // Total flashbang overlay decay
  FLASH_ATTACK_MS: 35,       // Ramp to peak alpha
  FLASH_MAX_ALPHA: 0.62,     // Playability cap (reducedFlash option: 0.28)
  FLASH_FALLOFF_MULT: 2.2,   // Screen flash reaches 0 beyond radius * 2.2
  STAR_COUNT: 3,             // Elites/Bosses: 4
  STAR_ORBIT_SPEED: 5.2,     // rad/s (~0.83 rev/s)
  STAR_ORBIT_Y_RATIO: 0.36,  // Tilted 2.5D halo ellipse
  ARC_STEP_MS: 45,           // Stepped ~22Hz lightning re-seed for crisp pixel crackle
  JITTER_STEP_MS: 33,        // ~30Hz Miragine freeze-jitter snap
  ENTRY_FLASH_MS: 90,        // Initial solid white silhouette flash on stun onset
  BODY_TINT_PERIOD_MS: 270,  // 200ms normal + 70ms cyan static pulse
  MAX_SHOCKWAVES: 24,
  MAX_ARCS: 32,
} as const;
```

### `client/src/bansung/stunFx.ts` API & Pool Structs
```ts
export interface StunRing { active: boolean; x: number; y: number; maxR: number; t0: number; dur: number; variant: 0 | 1 | 2; }
export interface StunArc { active: boolean; x1: number; y1: number; x2: number; y2: number; t0: number; dur: number; seed: number; }
export interface StunPose { jx: number; jy: number; freezeFrame: number; whiteAlpha: number; cyanAlpha: number; }

export function pushStunFx(kind: number, x: number, y: number, a: number, b: number, c: number, camX: number, camY: number, reducedFlash: boolean, now: number): void;
export function resolveStunPose(unitId: number, lastFrame: number, stunEnteredAt: number, isBoss: boolean, now: number): StunPose;
export function drawGroundShockwaves(ctx: CanvasRenderingContext2D, now: number): void;
export function drawOverheadStunStars(ctx: CanvasRenderingContext2D, x: number, footY: number, spriteH: number, unitRadius: number, unitId: number, count: number, frontPass: boolean, now: number): void;
export function drawElectricArc(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, seed: number, jitterPx: number, fade: number, now: number): void;
export function drawScreenFlashOverlay(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, now: number): void;
```

---

## 4. Algorithms & Rendering Passes

### A. Expanding Shockwave Ring (`drawGroundShockwaves`)
Pooled ring buffer (`RingPool[24]`, zero GC). For active ring at `p = clamp((now - t0) / durMs, 0, 1)`:
1. Ease-out cubic radius: `r = maxR * (0.15 + 0.85 * (1 - (1 - p) ** 3))`, `ry = r * RING_Y_ASPECT`.
2. **Ground tint wash**: radial ellipse fill (`alpha = 0.22 * (1 - p)`).
3. **Outer pixel-stepped ring**: `ellipse(x, y, r, ry)`, `lineWidth = Math.max(1.5, 4 * (1 - p))`, color by variant (`#74c0fc` EMP / `#ffd43b` Slam / `#fff9db` Flash).
4. **Inner trailing ring**: radius `0.78 * r`, `lineWidth = 1.5`, `alpha = 0.75 * (1 - p)`, `globalCompositeOperation = 'lighter'`.
5. **EMP core burst**: if `variant === 0`, overlay `/database-miraginewar/projectiles/thunderball.png` (`[16, 128, 128, -64, -64]` from `thap/sprites.ts`) scaled by `maxR / 96` over `0..420ms`.

### B. Screen Flash Attenuation (`updateScreenFlash` / `drawScreenFlashOverlay`)
When `BS_FX_FLASHBANG` arrives at `(fx, fy)` with `radius`:
1. Distance from local camera/hero `(cx, cy)`: `d = Math.hypot(fx - cx, fy - cy)`.
2. Distance attenuation: `atten = clamp(1 - d / (radius * FLASH_FALLOFF_MULT), 0, 1) ** 1.4`.
3. `peak = min(FLASH_MAX_ALPHA, (intensityPct / 100) * atten * (reducedFlash ? 0.45 : 1))`. If two flashes overlap, take `max(currentAlpha, peak)` instead of stacking past cap.
4. Per-frame curve (`age = now - flashT0`):
   - `age < 35ms`: `alpha = peak * (age / 35)`
   - `age >= 35ms`: `t = (age - 35) / (FLASH_DUR_MS - 35)`; `alpha = peak * Math.exp(-4.2 * t) * (1 - t)`
5. Render in screen space (above world, **below HUD** so HP/hotbar remain legible): fill `#e7f5ff` (EMP) or `#fff9db` (Flashbang) at `alpha`, plus subtle radial dark-cyan edge ring at `alpha * 0.35`.

### C. Miragine-Style Freeze-Jitter State (`resolveStunPose`)
Miragine sprites (`A0..B15`) have 4 strips (`idle`, `run`, `attack`, `dead`) and no dedicated `stun` sheet:
1. **Frame freeze**: While `BS_FLAG_STUNNED` is set, lock `animPhase` and hold the **last active frame index** (or `idle` frame `0` if idle); suppress recoil/run bob.
2. **Anchored shadow**: Draw `shadow.png` at un-jittered `(x, footY)` so the entity shudders independently above its shadow.
3. **Stepped pixel jitter**: `k = Math.floor(now / JITTER_STEP_MS)`; compute integer offsets `jx = ((k & 1) ? 1 : -1) * ((k % 4 < 2) ? 2 : 1)` (`±1..2px`; `±1px` for bosses) and `jy = (k % 3 === 0) ? -1 : 0`. Draw sprite at `(Math.round(x) + jx, Math.round(footY) + jy)`.
4. **Silhouette flash & static pulse**: During `now - stunEnteredAt < ENTRY_FLASH_MS`, draw offscreen white silhouette mask (`alpha = 0.85`). Afterward, whenever `(now - stunEnteredAt) % BODY_TINT_PERIOD_MS < 70`, composite `#74c0fc` silhouette tint at `0.38` alpha + emit 1 short torso arc (`8..14px`).

### D. Orbiting Overhead Stun Stars (`drawOverheadStunStars`)
1. Anchor `headY = footY - spriteH * 0.92`, `rx = Math.max(12, unitRadius * 0.85)`, `ry = rx * STAR_ORBIT_Y_RATIO`.
2. For `i = 0..count - 1`: `theta = now * 0.001 * STAR_ORBIT_SPEED + (i * Math.PI * 2) / count + (unitId * 0.7)`.
3. `sx = Math.round(x + Math.cos(theta) * rx)`, `sy = Math.round(headY + Math.sin(theta) * ry)`.
4. Depth split: draw stars with `Math.sin(theta) < 0` *before* head accessory/top pass (`scale = 0.78`, `alpha = 0.75`), and `Math.sin(theta) >= 0` *after* (`scale = 1.08`, `alpha = 1.0`). Stamp cached 16×16 pixel star sprite (`#2b1d10` 1px outline, `#ffe066` body, `#fff9db` specular toggle every `140ms`).

### E. Jagged Electric Arcs (`drawElectricArc`)
1. Re-seed every `ARC_STEP_MS` (`seed = baseSeed + Math.floor(now / 45)`), using deterministic LCG (`s = (s * 1664525 + 1013904223) >>> 0`) so arcs snap crisply without 60Hz smear.
2. Subdivide segment `(x1,y1)->(x2,y2)` into `N = clamp(Math.floor(dist / 16), 4, 12)` segments; displace interior points along perpendicular normal by `(rand() - 0.5) * 2 * jitterPx` (`jitterPx = 9` for bolts, `4` for body static).
3. Draw twice under `globalCompositeOperation = 'lighter'`: outer `#4dabf7` (`lineWidth = 4`, `alpha = 0.45 * fade`), inner `#e7f5ff` (`lineWidth = 1.5`, `alpha = 0.95 * fade`).

---

## 5. Assets & Performance Guardrails
- **Reused Miragine Assets** (`database-miraginewar/projectiles/`): `thunderball.png` (`[16, 128, 128, -64, -64]`), `storm.png` (`[9, 153, 261, -76, -240]`), `shadow.png` (`structures/shadow.png`).
- **Procedural / CC0 Pixel Fallback**: `fx_stun_star` (16×16 2-frame offscreen canvas sprite generated at boot in `sprites.ts`, zero external dependency).
- **Crowd LOD**: If `> 16` stunned enemies are visible, draw body crackle arcs only for the 10 closest to camera and drop `STAR_COUNT` from 3 to 2 beyond 24 units; integer-round (`| 0`) all star/ring coordinates with `imageSmoothingEnabled = false`.
- **Cross-Slice Hooks**: Consumes stun events from `d27`/`d29`/`d30`/`d37`/`d39`, respects `d33` stun DR durations, renders via `d41` Y-sort + `d42` particle pool, and pairs with `d43` SFX IDs (`sfx_flashbang`, `sfx_stun_zap`).
