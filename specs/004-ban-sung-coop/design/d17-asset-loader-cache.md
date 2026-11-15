# d17 — Asset Loader, Frame Slicer, Hit-Flash Cache & Procedural Fallback

## 1. Wave-2 Target Files & Scope
- **Primary implementation**: `client/src/bansung/sprites.ts`
- **Primary consumers**:
  - `client/src/bansung/render.ts` (`drawBansungSprite`, `getClipMeta`, `getSpriteImage`)
  - `client/src/bansung/BansungBoard.tsx` (`initBansungAssets`, `preloadBiomeAssets`, `onBansungAssetLoad`, `getAssetLoadProgress`)
- **Static asset roots** (served by `client/vite.config.ts` & `server/src/app.module.ts`):
  - `BANSUNG_ASSET_BASE = '/database-ban-sung'` (primary `manifest.json` + normalized sheets/tiles/UI)
  - `MIRAGINE_ASSET_BASE = '/database-miraginewar'` (reused `shadow.png`, `terrain*.jpg`, `fireball`, `thunderball`, `storm`, fallback units)

---

## 2. Manifest Schema, Normalization & 2-Tier Preloader
Fetch `/database-ban-sung/manifest.json` once via deduplicated `initBansungAssets(): Promise<void>` (safe in SSR/headless when `typeof Image === 'undefined'`). Normalize both flat `clips` maps and sectioned manifests (`sprites`, `projectiles`, `structures`, `tiles`, `ui`) into `Map<string, SpriteClipMeta>`:

```ts
export type SpriteCategory = 'hero' | 'enemy' | 'boss' | 'weapon' | 'bullet' | 'prop' | 'tile' | 'pickup' | 'fx' | 'ui';
export type TintMode = 'white' | 'whiteSoft' | 'red' | 'cyan' | 'gold';

export interface SpriteClipMeta {
  url: string;                          // Resolved URL under /database-ban-sung or /database-miraginewar
  frames: number;                       // >= 1
  cellW: number;                        // Integer pixel cell width
  cellH: number;                        // Integer pixel cell height
  offX: number;                         // Anchor offset X (e.g. -cellW/2 or Miragine foot pivot)
  offY: number;                         // Anchor offset Y (negative places sprite above foot Y)
  fps: number;                          // Default by state: idle=6, run=12, dash=16, attack=15, dead=10, fx=18
  loop: boolean;                        // false for dead / burst fx
  nativeFacing: 'left' | 'right';       // Miragine sheets = 'left'; normalized OSS sheets = 'right'
  category: SpriteCategory;
  tier?: 1 | 2;                         // 1 = eager preload, 2 = lazy/idle preload
  atlasRect?: { x: number; y: number; w: number; h: number }; // Optional packed atlas sub-region
}
```

### Constants & Preload Policy
- `MAX_CONCURRENT_IMG_LOADS = 6`: bounded loader queue; sets `img.decoding = 'async'`.
- **Retry & Negative Cache**: on `onerror`, retry once with cache-bust `?r=1`; on second failure, add URL to `failedUrls: Set<string>` so `getSpriteImage(url)` stops retrying at 60 FPS and immediately routes to procedural fallback.
- **Tier 1 (Eager on room join)**: `prop_shadow`, local/coop hero clips (`idle`/`run`/`dash`/`dead`), starter weapons/bullets, `prop_crate`, `prop_barrel`, active biome floor tiles, HUD icons.
- **Tier 2 (Deferred via `requestIdleCallback` / `setTimeout(..., 50)` or on-demand)**: bosses, elite mobs, extra biomes (`preloadBiomeAssets(biomeId)`).
- **Builtin Fallback Clip Table**: pre-seed `shadow`, `fx_fireball` (`[3,32,32,-16,-16]`), `fx_thunderball` (`[16,128,128,-64,-64]`), `fx_storm` (`[9,153,261,-76,-240]`) from `MIRAGINE_ASSET_BASE` if `manifest.json` fails or omits them.

---

## 3. Miragine-Style Frame Slicer (`offX` / `offY` Anchor)
Compatible with `client/src/thap/sprites.ts` (`[frames, cellW, cellH, offX, offY]`) plus `atlasRect` and `nativeFacing`:

1. **Frame index (`resolveFrameIndex`)**:
   - `raw = Math.floor(Math.max(0, animTimeSec) * meta.fps)`
   - `f = meta.loop ? ((raw % meta.frames) + meta.frames) % meta.frames : Math.min(meta.frames - 1, raw)`
2. **Source rectangle (`resolveFrameRect`)** — supports both 1-row strips and multi-row atlases:
   - `baseX = meta.atlasRect?.x ?? 0`, `baseY = meta.atlasRect?.y ?? 0`
   - `regionW = meta.atlasRect?.w ?? img.naturalWidth`
   - `cols = Math.max(1, Math.floor(regionW / meta.cellW))`
   - `sx = baseX + (f % cols) * meta.cellW`, `sy = baseY + Math.floor(f / cols) * meta.cellH`
   - **Bounds guard**: if `sx + meta.cellW > img.naturalWidth || sy + meta.cellH > img.naturalHeight`, return `null` and fall back to procedural sprite (prevents `IndexSizeError`).
3. **Transform & Draw at foot-pivot `(x, y)`**:
   - Snap screen coords `Math.round(x)`, `Math.round(y)`; set `ctx.imageSmoothingEnabled = false`.
   - `ctx.save(); ctx.translate(Math.round(x), Math.round(y));`
   - **Aimed rotation vs Character horizontal flip** (prevents upside-down/backward guns):
     - If `rotationRad != null`: `ctx.rotate(rotationRad);` then `const flipY = flipAimY && Math.cos(rotationRad) < 0; ctx.scale(scale, flipY ? -scale : scale);` (keeps weapon top upright when aiming left).
     - Else (characters/mobs/props): `const flipX = meta.nativeFacing === 'left' ? facingRight : !facingRight; ctx.scale(flipX ? -scale : scale, scale);`
   - `ctx.drawImage(source, sx, sy, meta.cellW, meta.cellH, meta.offX, meta.offY, meta.cellW, meta.cellH);`
   - `ctx.restore();`

---

## 4. White Hit-Flash & Tinted Offscreen Cache
Never allocate temp canvases per frame or composite `source-atop` directly on the main scene canvas.

- **Palette (`TINT_COLORS`)**:
  - `white: '#FFFFFF'` (hit flash, crisp Soul Knight silhouette)
  - `whiteSoft: 'rgba(255,255,255,0.82)'` (preserves dark inner detail)
  - `red: '#FF3B30'` (burn / enrage telegraph)
  - `cyan: '#38BDF8'` (stun / EMP / shield impact)
  - `gold: '#FACC15'` (crit / invulnerable / boss phase)
- **Lazy Per-Sheet Tint Generator (`getTintedSheet(clipKey, img, tint)`)**:
  - Cache key: `${clipKey}::${tint}` in an insertion-ordered `Map<string, HTMLCanvasElement>` capped at `MAX_TINT_CACHE_ENTRIES = 128` (LRU: on hit, `delete` + `set` to refresh; on overflow, evict oldest key and zero `canvas.width = canvas.height = 0`).
  - Returns `null` safely if `typeof document === 'undefined'` (headless Node tests).
  - Generation algorithm (runs once per `clipKey + tint` on first hit):
    1. Allocate `document.createElement('canvas')` sized `(w, h)` from source image/canvas.
    2. `tctx.imageSmoothingEnabled = false`.
    3. `tctx.globalCompositeOperation = 'copy'; tctx.drawImage(img, 0, 0);`
    4. `tctx.globalCompositeOperation = 'source-atop'; tctx.fillStyle = TINT_COLORS[tint]; tctx.fillRect(0, 0, w, h);`
    5. Wrap in `try/catch` to guard against tainted-canvas `SecurityError`; on error, record URL in `tintBlockedUrls` and skip tint.
- **Render usage**: When `hitFlashAlpha >= 0.95` and `tint === 'white'`, draw tinted frame directly (`1` draw call); for fade-out (`0 < hitFlashAlpha < 0.95`) or status tints, draw base sprite then overlay tinted frame with `ctx.globalAlpha = hitFlashAlpha`.

---

## 5. Safe Procedural Sprite Fallback
When `manifest.json` is pending, an image is still loading, or `failedUrls.has(url)`, `getProceduralFallback(clipKey, category, frameIdx)` synthesizes and caches a crisp 1px-dark-outlined (`#111827`) pixel canvas (`MAX_FALLBACK_CACHE_ENTRIES = 256` LRU) so entities, tiles, and hit-flashes always remain playable:

| Category | Cell Size & Pivot (`offX, offY`) | Deterministic Procedural Silhouette (`hash(clipKey)` hue) |
|---|---|---|
| `hero` | `32x32`, `(-16, -29)` | Chibi helmet + glowing visor + cloak + 1px dark outline + 2px walk bob |
| `enemy` | `32x32`, `(-16, -28)` | Slime/stalker/cactus body + red eyes + 2-frame bounce |
| `boss` | `64x64`, `(-32, -56)` | Armored boss frame + crown/horns + glowing core eye |
| `weapon` | `24x12`, `(-6, -6)` | Pixel barrel + receiver + grip facing `'right'` |
| `bullet` | `12x12`, `(-6, -6)` | Bright core capsule + colored outer pixel rim |
| `prop` | `32x32`, `(-16, -28)` | `barrel`: red drum + hazard band; `crate`: cross-braced wood box; `shadow`: `38x16` soft ellipse |
| `tile` | `32x32`, `(0, 0)` | Seeded pixel pebbles/cracks over biome base color (sand `#D6A86E` / crypt `#2E2538` / cyber `#1E293B`) |
| `pickup`/`fx`/`ui` | `20x20`..`32x32` centered | Glowing potion/orb/coin icon, starburst ring for `fx`, badge square for `ui` |

Fallback canvases share the exact `getTintedSheet` pipeline, so even missing-asset enemies flash white on hit.

---

## 6. Exported Contract (`client/src/bansung/sprites.ts`)
```ts
export interface AssetLoadProgress {
  loaded: number; total: number; ready: boolean; manifestFailed: boolean;
}
export interface DrawSpriteOpts {
  clipKey: string;
  category: SpriteCategory;
  x: number; y: number;                   // Ground foot-pivot (or center for weapons/bullets)
  animTimeSec: number;
  facingRight?: boolean;                // Default true (used when rotationRad is omitted)
  rotationRad?: number;                 // Aimed weapons / rotating bullets
  flipAimY?: boolean;                   // True for handheld guns so barrel never flips upside down
  scale?: number;                       // Default 1
  alpha?: number;                       // Default 1
  tint?: TintMode;                      // Default 'white' when hitFlashAlpha > 0
  hitFlashAlpha?: number;               // 0..1; >=0.95 & 'white' draws tinted frame alone
}
```
- `initBansungAssets(): Promise<void>` · `preloadBiomeAssets(biomeId: string): void`
- `onBansungAssetLoad(fn: () => void): () => void` · `getAssetLoadProgress(): AssetLoadProgress`
- `getClipMeta(clipKey: string): SpriteClipMeta | null` · `getSpriteImage(url: string): HTMLImageElement | null`
- `getTintedSheet(clipKey: string, img: HTMLImageElement | HTMLCanvasElement, tint: TintMode): HTMLCanvasElement | null`
- `getProceduralFallback(clipKey: string, category: SpriteCategory, frameIdx: number): { canvas: HTMLCanvasElement; meta: SpriteClipMeta }`
- `drawBansungSprite(ctx: CanvasRenderingContext2D, opts: DrawSpriteOpts): boolean` (`true` = real sprite drawn, `false` = procedural fallback drawn)
- `clearBansungSpriteCaches(): void` (resets image, tint, and fallback caches for cleanup/tests)
