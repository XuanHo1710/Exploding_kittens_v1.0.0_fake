# d14 — Sprite Normalization Standard (`ban_sung`)

## Wave-2 Target Files
- `database-ban-sung/palette-48.json` — Canonical 48-color master palette & semantic ramp indices.
- `database-ban-sung/norm-rules.json` — Per-pack `preScale`, `flipX`, `pivotMode`, `outline`, `lutStrength` overrides.
- `scripts/bansung-assets/normalize.mjs` — Offline normalizer emitting PNG horizontal strips + metadata.
- `client/src/bansung/sprites.ts` — `BANSUNG_ANIMS` Miragine-style frame table & weapon socket offsets.
- `client/src/bansung/render.ts` — Y-sorted shadow + right-native integer-snapped sprite draw calls.

## 1. Integer Grid Tiers & Mixel Prevention
Every normalized sprite strip packs `N` frames left-to-right at uniform cell dimensions `cellW x cellH`:
- **Tier 32 (`32x32`)**: Heroes, small/medium mobs (Scarab, Goblin, Skeleton, Spitter), detached guns, pickups, crates, standard projectiles (`fireball` `32x32`).
- **Tier 48 (`48x48`)**: Elite/heavy mobs (Cactus Brute, Miragine Knights/Mages `A0..A15`), wide melee sweeps, medium blast decals/VFX.
- **Tier 96 (`96x96`)**: Bosses (Sand Beholder, Dread Colossus, Overlord Core), mega projectiles/beams (`thunderball` `96x96`, `storm` slice), landmark structures.

```ts
export type SpriteTier = 32 | 48 | 96;
export type PivotMode = 'feet' | 'center' | 'grip';
export const NATIVE_FACING = 'right' as const; // +X; Miragine ('left') & left-facing OSS packs flip at build time
export const NORM_CONSTANTS = {
  ALPHA_CUTOFF: 128,        // Hard alpha threshold (de-fringes Flash/AA edges)
  OUTLINE_HEX: '#181425',   // rgb(24, 20, 37) 1px 4-connected dark outline
  FOOT_PAD_BOTTOM: 2,       // Opaque feet sit at cellH - 3, outline at cellH - 2, cellH - 1 kept transparent
  SAFE_PRE_SCALES: [0.5, 1, 2] as const, // Nearest-neighbor ONLY; never 1.25x/1.5x fractional resizes
} as const;
```
**Mixel Rule**: Apply `preScale` (`1` default; `2` only for `<=18px` raw packs; `0.5` only for `>=128px` raw cells like Miragine `thunderball`) **before** the `1px` outline pass (`reoutline: true`), so every tier shares an identical `1px` texel outline width at runtime `DRAW_SCALE = 2`.

## 2. Feet `offX` / `offY` Pivots & Ground Shadow Alignment
Extends `AnimMeta` from `client/src/thap/sprites.ts` with explicit `fps`:
```ts
// [frames, cellW, cellH, offX, offY, fps] — negative offX/offY map entity anchor (x,y) to cell top-left
export type BansungAnimMeta = readonly [frames: number, cellW: number, cellH: number, offX: number, offY: number, fps: number];
export interface WeaponNormMeta { anim: BansungAnimMeta; gripX: number; gripY: number; muzzleX: number; muzzleY: number; }
```
Shadow ellipses render **before** entity sprites centered at `(x, y)` (matching `shadow.png` `38x16`, `offX=-19, offY=-8` from `database-miraginewar/mapping.json`):
- **Tier 32**: shadow `20x8` (`rx=10, ry=4`), default `feet` pivot `offX = -16, offY = -30` (`-(cellH - FOOT_PAD_BOTTOM)`).
- **Tier 48**: shadow `30x12` (`rx=15, ry=6`), default `feet` pivot `offX = -24, offY = -46`.
- **Tier 96**: shadow `64x24` (`rx=32, ry=12`), default `feet` pivot `offX = -48, offY = -94`.
- **`center` mode** (projectiles/orbs/explosions): `offX = -(cellW / 2)`, `offY = -(cellH / 2)` (`-16,-16` / `-24,-24` / `-48,-48`).
- **`grip` mode** (detached guns in `32x32`): `offX = -gripX`, `offY = -gripY`; barrel points `+X` (`0 rad`), `muzzleX/Y` stored relative to grip for projectile spawn & flash.

**Foot-Anchor Placement Algorithm**:
1. Trim frame to opaque bbox `(minX, minY, maxX, maxY)` where `alpha >= 128`.
2. Compute `footCenterX` over bottom 25% of opaque rows (`y >= maxY - floor((maxY - minY) * 0.25)`); for `attack` frames, reuse `idle.footCenterX` so feet stay locked over the shadow during lunges.
3. Paste trimmed bitmap into `tier x tier` cell at `dstX = (tier / 2) - footCenterX`, `dstY = (tier - 1 - FOOT_PAD_BOTTOM) - maxY` (leaving `1px` top/side clearance and `2px` bottom clearance for outline + atlas bleed guard).
4. If sprite exceeds `(tier - 2) x (tier - 3)`, promote asset to next tier (`32 -> 48 -> 96`) or use `preScale: 0.5`.

## 3. Alpha Hardening & `1px` Dark Outline Pass
Run on `outlineMode: '4conn'` (`hero`, `mob`, `boss`, `weapon`, `prop`, `pickup`; skip `'none'` on `vfx`, `tile`, `shadow`, `decal`):
1. **Binary Alpha**: For every pixel `(px, py)`, if `a < 128` set `(0,0,0,0)`; else set `a = 255`.
2. **Optional Erode (`stripExistingOutline`)**: If source was pre-scaled `2x` with a baked dark border, clear boundary pixels (`luma < 45`) adjacent to `a === 0` before step 3.
3. **4-Connected Outline**: For each transparent pixel `(px, py)` (`a === 0`) inside `[0..tier-1]`, if any 4-neighbor `(px±1, py)` or `(px, py±1)` has original `a === 255`, write `#181425` (`rgba(24, 20, 37, 255)`). Note: bottom outline pixel lands at `y = tier - 2`, matching `offY = -(tier - 2)` so boots touch ground `y = 0` with shadow visible behind/below.

## 4. Shared 48-Color Master Palette LUT (`BANSUNG_PALETTE_48`)
Unified Soul-Knight-style 8×6 ramp palette eliminates cross-pack hue clash (`#181425` outline at idx `0`, `#e43b44` telegraph red at `21`, `#2ce8f5` energy cyan at `33`, `#ffffff` flash white at `35`):
```json
{
  "R0_MONO":    ["#181425","#262b44","#3a4466","#5a6988","#8b9bb4","#e6eef8"],
  "R1_SAND":    ["#733e39","#9e5b47","#c9885b","#e8b878","#f5d89e","#fff0c2"],
  "R2_EARTH":   ["#2e1d1b","#4d312c","#6e4b3f","#916b57","#b39078","#d6baa2"],
  "R3_CRIMSON": ["#4c1424","#8a1c31","#c72936","#e43b44","#ff7a3d","#fee761"],
  "R4_GREEN":   ["#193c3e","#265c42","#3e8948","#63c74d","#a7f070","#e0ff9e"],
  "R5_ENERGY":  ["#143464","#124e89","#0095e9","#2ce8f5","#9cf9ff","#ffffff"],
  "R6_ARCANE":  ["#381d4a","#622c73","#96419c","#cf61b8","#ff9ee2","#ffdbf5"],
  "R7_COPPER":  ["#45242e","#783e3b","#ab5a47","#d9845c","#f0ae81","#ffd8b8"]
}
```
**Fast RGB555 LUT Quantizer (`O(1)` per pixel)**:
- Build `Uint8Array(32768)` at tool init: for each RGB555 `(r5, g5, b5)` expanded to `(r, g, b) = (c << 3) | (c >> 2)`, pick `idx` (`1..47`; reserve `0` for outline) minimizing redmean perceptual squared distance:
  `rm = (r + pr) >> 1; d = (2 + rm / 256) * dr*dr + 4 * dg*dg + (2 + (255 - rm) / 256) * db*db`.
- Pixel remap: `out = lerp(srcRGB, PALETTE[lut[rgb555]], lutStrength)` (`lutStrength = 1.0` sprites/props, `0.75` terrain tiles, `0.0` additive VFX).

## 5. `norm-rules.json` Schema & Miragine Mapping Examples
```ts
export interface PackNormRule {
  id: string;                 // e.g. "oss_0x72_knight" | "miragine_A0" | "oss_kenney_gun"
  tier: SpriteTier;           // 32 | 48 | 96
  preScale: 0.5 | 1 | 2;
  flipX: boolean;             // true for Miragine (native 'left' -> 'right')
  pivotMode: PivotMode;       // 'feet' | 'center' | 'grip'
  outlineMode: '4conn' | 'none';
  stripExistingOutline?: boolean;
  lutStrength: number;        // 0..1
  fpsByAction: Partial<Record<'idle' | 'run' | 'attack' | 'dead' | 'fx', number>>;
}
```
| Source Asset | Raw Cell / Facing | Rule (`tier`, `preScale`, `flipX`, `pivot`, `outline`, `lut`) | Normalized `BansungAnimMeta` |
|---|---|---|---|
| OSS 16px Hero (`0x72` / Kenney) | `16x24` / right | `32`, `1` (or `2`+`strip`), `false`, `feet`, `4conn`, `1.0` | `[4, 32, 32, -16, -30, 10]` |
| OSS Top-Down Gun | `20x12` / right | `32`, `1`, `false`, `grip`, `4conn`, `1.0` | `[1, 32, 32, -10, -17, 1]` (`grip 10,17`) |
| Miragine `A0` (`idle/run/dead`) | `62x53..99x74` / left | `48`, `1` (trimmed), `true`, `feet`, `4conn`, `1.0` | `idle:[3,48,48,-24,-46,8]`, `run:[6,48,48,-24,-46,12]` |
| Miragine `fireball` / `thunderball` | `32x32` / `128x128` | `32`/`96`, `1`/`0.5`, `false`, `center`, `none`, `0.0` | `fb:[3,32,32,-16,-16,12]`, `tb:[16,96,96,-48,-48,18]` |
| OSS Boss (`Sand Beholder`) | `64x64..80x80` | `96`, `1`, `false`, `feet`, `4conn`, `1.0` | `idle:[4,96,96,-48,-94,8]` |

## 6. Deterministic Normalization Pipeline (`scripts/bansung-assets/normalize.mjs`)
1. Decode source frame(s) -> RGBA buffer; apply `flipX` if `nativeFacing === 'left'`.
2. Nearest-neighbor scale by `preScale` (`0.5 | 1 | 2`); threshold alpha at `128`.
3. Trim opaque bbox, anchor `footCenterX`/`maxY` (or center/grip) into `tier x tier` cell (`offX`, `offY` locked).
4. Run optional `stripExistingOutline`, then `4conn` `#181425` `1px` outline pass.
5. Quantize non-outline opaque pixels via RGB555 Palette LUT (`lutStrength`).
6. Pack frames into horizontal strip PNG (`(frames * tier) x tier`), emit `BansungAnimMeta` to `database-ban-sung/manifest.json`.
7. Runtime draw (`client/src/bansung/render.ts`): draw tier shadow at `Math.round(x), Math.round(y)` -> `ctx.imageSmoothingEnabled = false` -> `ctx.scale(facingLeft ? -1 : 1, 1)` -> `ctx.drawImage(sheet, f*cellW, 0, cellW, cellH, offX, offY, cellW, cellH)`.
