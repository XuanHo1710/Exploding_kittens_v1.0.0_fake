# d24 — Bomb Trajectory, Danger Telegraph, Layered Pixel Blast & Crater Decal FX

## 1. Scope & Wave-2 Target Files
- **Primary Client FX Module**: `client/src/bansung/fx-bomb.ts` (pure update/draw helpers; zero shared-file edits).
- **Integration Callers**:
  - `client/src/bansung/render.ts` (`d41`): invokes ground craters, telegraph rings, bomb shadows, Z-projected bombs, and upper blast flashes in Y-sorted passes.
  - `client/src/bansung/particles.ts` (`d42`): owns pre-allocated `CraterDecal` ring buffer (`MAX_CRATERS = 64`) and spark/shrapnel/smoke particle pools.
  - `client/src/bansung/sound.ts` (`d43`): triggered via events `sfx:bomb_throw`, `sfx:bomb_bounce`, `sfx:bomb_beep`, `sfx:explosion_he`, `sfx:explosion_stun`, `sfx:explosion_barrel`.
- **Normalized Assets (`database-ban-sung/normalized/fx/`)**: `bomb_frag.png`, `bomb_stun.png`, `bomb_mortar.png`, `explosion_he.png`, `explosion_stun.png`, `crater_decals.png` (fallback: `database-miraginewar/structures/shadow.png` & `projectiles/fireball.png`).

## 2. Schemas & Constants
```ts
export type BombKind = 'frag' | 'stun' | 'cluster' | 'mortar' | 'goblin_bomb' | 'mine';
export type ExplosionVariant = 'he' | 'stun' | 'fire' | 'barrel';

export interface BombFxState {
  id: number;
  kind: BombKind;
  ownerTeam: 0 | 1; // 0 = friendly (amber/cyan), 1 = hostile (crimson)
  x0: number; y0: number; x1: number; y1: number;
  tSpawnMs: number;
  flightMs: number; // ground travel time
  fuseMs: number;   // total time until detonation (>= flightMs)
  zPeak: number;    // max parabolic height in px
  bounces: 0 | 1 | 2;
  radius: number;   // authoritative server AoE radius (px)
  spinDir: 1 | -1;
  lastBounceIdx: number;
  beepPlayed: boolean;
}

export interface BombExplosionEvent {
  x: number; y: number; radius: number;
  variant: ExplosionVariant; seed: number; // uint8 0..255
}

export interface CraterDecal {
  active: boolean;
  x: number; y: number; rx: number; ry: number;
  variant: ExplosionVariant; seed: number;
  ageMs: number; lifeMs: number; // 14000ms total
}
```
```ts
export const BOMB_FX = {
  Z_PROJ: 0.85,             // 2.5D vertical lift scale (screenY = gy - z * Z_PROJ)
  SHADOW_MIN_SCALE: 0.42,   // shadow scale at z >= SHADOW_REF_Z
  SHADOW_REF_Z: 140,
  SHADOW_BASE_ALPHA: 0.55,
  SHADOW_MIN_ALPHA: 0.25,
  WARN_FLASH_MS: 350,       // final rapid white/red flash window
  WARN_TOGGLE_MS: 70,
  BLAST_CORE_MS: 70,        // white flash disc duration
  SHOCKWAVE_MS: 220,
  HE_SHEET_MS: 440,         // 8 frames * 55ms
  STUN_SHEET_MS: 385,       // 7 frames * 55ms
  CRATER_SOLID_MS: 9000,
  CRATER_FADE_MS: 5000,
  MAX_CRATERS: 64,
} as const;

export const BOMB_RADII: Record<BombKind, number> = {
  frag: 96, stun: 120, cluster: 56, mortar: 110, goblin_bomb: 88, mine: 92,
};
```

## 3. Parabolic Z-Arc & Scaling Ground Shadow Algorithm
Let `dist = Math.hypot(x1 - x0, y1 - y0)` and `zPeak = clamp(dist * 0.38, 42, 160)`. At elapsed `t = clamp(now - tSpawnMs, 0, fuseMs)`:
1. **Ground Progress (`gx, gy`)**: `ug = clamp(t / flightMs, 0, 1)`; `gx = x0 + (x1 - x0) * ug`, `gy = y0 + (y1 - y0) * ug`.
2. **Piecewise Bounce Z-Height (`z`)**:
   - `bounces === 0` (mortar / impact): `z = 4 * zPeak * ug * (1 - ug)`.
   - `bounces === 1` (standard thrown grenade):
     - Primary arc `ug < 0.75`: `u = ug / 0.75`, `z = 4 * zPeak * u * (1 - u)`.
     - Hop 1 `0.75 <= ug < 0.95`: `u = (ug - 0.75) / 0.20`, `z = 4 * (0.28 * zPeak) * u * (1 - u)`.
     - Settle `ug >= 0.95`: `z = 0`.
   - `bounces === 2`: segments `[0..0.68]` (`1.0*zPeak`), `[0.68..0.86]` (`0.30*zPeak`), `[0.86..0.96]` (`0.10*zPeak`), `[0.96..1]` (`z = 0`).
   - On entering a new bounce segment (`segIdx > lastBounceIdx`), spawn 4 dust pixels (`2x2`) at `(gx, gy)` and trigger `sfx:bomb_bounce` with volume `0.45 * 0.6 ** segIdx`.
3. **2.5D Screen Coordinate & Pixel Snap**:
   - `drawX = Math.round(gx)`, `drawY = Math.round(gy - z * BOMB_FX.Z_PROJ)`.
   - Spin angle: `ang = z > 0 ? spinDir * (t * 0.0105) : 0`, snapped to `Math.PI / 4` steps for crisp pixel rotation.
4. **Ground Shadow (drawn in Shadow Pass at `(gx, gy)`)**:
   - `hNorm = clamp(z / BOMB_FX.SHADOW_REF_Z, 0, 1)`
   - `s = 1 - (1 - BOMB_FX.SHADOW_MIN_SCALE) * hNorm` (`1.0 -> 0.42`)
   - `alpha = BOMB_FX.SHADOW_BASE_ALPHA - (BOMB_FX.SHADOW_BASE_ALPHA - BOMB_FX.SHADOW_MIN_ALPHA) * hNorm` (`0.55 -> 0.25`)
   - Base shadow radii `baseRx = kind === 'mortar' ? 13 : 9`, `baseRy = baseRx * 0.48`. Draw `shadow.png` (or filled `#000000` ellipse) at `(gx, gy)` with `(baseRx * s, baseRy * s)`.

## 4. Pulsing Danger Radius Telegraph Ring
Drawn in **Ground Telegraph Pass** (above craters, below shadows/actors) centered at `(x1, y1)` with **exact** server collision radius `R = b.radius` so visual bounds match AoE hitboxes 1:1:
- **Palette**: Hostile `#ff3b30` (`rgb(255,59,48)`), Friendly HE `#ffb020`, Friendly Stun `#38bdf8`.
- **Countdown Ratio**: `p = clamp(t / fuseMs, 0, 1)`; `rem = fuseMs - t`.
- **Pulse Frequency**: `freqHz = 2 + 6 * p * p` (2 Hz → 8 Hz); `pulse = 0.5 + 0.5 * Math.sin((t / 1000) * freqHz * Math.PI * 2)`.
- **3 Synchronized Telegraph Sub-Layers**:
  1. **Expanding Inner Fill**: `arc(x1, y1, R * (0.15 + 0.85 * p), 0, 2π)` filled with `rgba(color, 0.12 + 0.16 * p)`.
  2. **Outer Boundary Ring**: 2px crisp dashed/solid `arc(x1, y1, R, 0, 2π)` at `alpha = 0.55 + 0.35 * pulse`, plus 4 cardinal inward 6px tick marks so the true circle reads cleanly in 2.5D.
  3. **Final 350ms Urgency Flash**: When `rem <= BOMB_FX.WARN_FLASH_MS`, alternate ring/fill to `#ffffff` every `70ms` (`Math.floor(t / 70) % 2 === 0`), apply white tint flash to the bomb sprite, and play `sfx:bomb_beep` once on entry.

## 5. Miragine-Style Frame Specs (`AnimMeta`: `[frames, cellW, cellH, offX, offY]`)
| Sheet Key | `AnimMeta` | Frame Rate / Duration | Visual Content |
|---|---|---|---|
| `fx_bomb_frag` | `[4, 16, 16, -8, -8]` | `80ms` loop | Olive grenade + animated 2px fuse spark |
| `fx_bomb_stun` | `[4, 16, 16, -8, -8]` | `80ms` loop | Steel-cyan flashbang canister |
| `fx_bomb_mortar` | `[4, 24, 24, -12, -12]` | `75ms` loop | Heavy iron/crimson boss mortar shell |
| `fx_explosion_he` | `[8, 96, 96, -48, -56]` | `55ms` (`440ms` once) | F0 white core → F1-2 fireball → F3-5 ring+smoke → F6-7 embers |
| `fx_explosion_stun` | `[7, 96, 96, -48, -52]` | `55ms` (`385ms` once) | Cyan-white EMP/plasma burst + electric tendrils |
| `fx_crater_decals` | `[3, 64, 40, -32, -20]` | Static (`seed % 3`) | 0: desert blast pit, 1: charcoal crack, 2: cyan EMP scorch |

## 6. Layered Pixel Blast Sequence & Crater Decals
On `BombExplosionEvent(x, y, radius, variant, seed)`:
1. **Impact Flash Core (`0..70ms`)**: Draw integer-snapped white circle (`#ffffff`, `r = lerp(0.45*R, 1.0*R, t/70)`) + additive radial bloom (`globalCompositeOperation = 'lighter'`, `rgba(255,190,60,0.45)` for HE / `rgba(116,192,252,0.45)` for stun). Trigger camera shake `clamp(R * 0.09, 4, 14)` px (`d21`) and `30ms` hitstop on crits/barrels.
2. **Main Pixel Blast Sheet (`0..440ms`)**: Render `fx_explosion_he` (or `_stun`) with `ctx.imageSmoothingEnabled = false`, `scale = R / 44`, centered at `(Math.round(x), Math.round(y))` in the upper FX layer.
3. **Shockwave Ring (`0..220ms`)**: Expand 2px→1px stepped pixel ring from `0.25*R` to `1.15*R` using ease-out `1 - (1 - p)^2`, alpha `0.9 -> 0`.
4. **Pooled Sparks, Shrapnel & Smoke (`d42` particle pool — 0 GC)**:
   - `12` sparks (`2x2`/`3x3` `#fff3bf`→`#ff922b`, radial `140..280 px/s`, `life 240..420ms`).
   - `8` shrapnel bits (`3x3` `#212529` with parabolic `zVel 90..170 px/s`, `g = 520 px/s²`, 1 bounce).
   - `6` rising pixel smoke puffs (`6x6`→`10x10` `#495057`/`#868e96`, `vy -28..-50 px/s`, `life 450..750ms`).
5. **Ground Crater Decal (`0..14,000ms`)**:
   - Push `CraterDecal` into `d42` fixed ring buffer (`MAX_CRATERS = 64`, overwrite oldest on wrap).
   - Size `rx = Math.round(R * 0.58)`, `ry = Math.round(R * 0.36)`, drawn from `fx_crater_decals` (or procedural 2-tone scorched ellipse fallback `#2b2118` + `#181425` rim).
   - Alpha: `0.88` for `0..9000ms`, then linear fade to `0` across `9000..14000ms`.
