# d41 — 2.5D Y-Sorted Canvas Render Engine

**Wave-2 Target File:** `client/src/bansung/render.ts`
**Read-Only Contract Dependencies:** `shared/src/bansung.ts` (entity/biome/weapon enums), `client/src/bansung/store.ts` (interpolated state + camera), `client/src/bansung/sprites.ts` (frame slicer, `offX`/`offY` pivots, white flash cache), `client/src/bansung/particles.ts` (pooled decals & particles).

---

## 1. Constants & Pre-Baked Offscreen Buffers

```ts
export const RENDER_CFG = {
  DPR_CAP: 2,
  WORLD_ZOOM_BASE: 1.35,      // 2.5D pixel camera baseline (~32px sprite -> ~43 screen px)
  CULL_PAD_PX: 160,           // Viewport cull margin (accounts for tall bosses/beams)
  MAX_SORT_ITEMS: 512,        // Pre-allocated Y-sort slot pool (zero per-frame GC)
  MAX_DMG_NUMBERS: 96,        // Fixed ring-buffer for floating damage numbers
  GLOW_STAMP_PX: 64,          // Pre-baked radial glow stamp size
  SCRATCH_PX: 160,            // Reusable offscreen tint buffer for fallback hit-flash
  MAX_FLASH_ALPHA: 0.65,      // Accessibility cap for stun/flashbang screen whiteout
} as const;

export type GlowColor = 'fire' | 'cyan' | 'emerald' | 'violet' | 'crimson' | 'white';
```

At module init (lazy on browser `document`), build:
1. **Glow Stamps (`Map<GlowColor, HTMLCanvasElement>`)**: 64x64 offscreen radial gradient stamps (`0 -> 0.85`, `0.45 -> 0.35`, `1 -> 0`) so Pass 5 never calls `ctx.createRadialGradient()` per frame.
2. **Floor Pattern Cache (`Map<BiomeId, CanvasPattern>`)**: 256x256 seamless tiled floor chunk per biome (`desert`, `crypt`, `cyber`) rendered once from biome tiles so Pass 0 draws the arena floor in one `fillRect`.
3. **Hit-Flash Scratch (`scratchCanvas` 160x160)**: Fallback when `sprites.ts` white silhouette isn't cached yet (`drawImage` frame -> `source-atop` `#ffffff` -> blit to main canvas).

---

## 2. Public Types & Pool Schemas

```ts
export interface CameraState {
  x: number; y: number; zoom: number;
  shakeX: number; shakeY: number;     // Impulse from d21 recoil/hitstop
  flashAlpha: number; flashColor: string;
}

export interface RenderOpts {
  w: number; h: number; dpr: number;
  cam: CameraState;
  myPlayerId: number;
  aimWorldX: number; aimWorldY: number;
  dark: boolean;
}

// Tagged union slot in pre-allocated RenderItem[] (zero per-frame closures)
export const enum SortKind { Prop = 0, Pickup = 1, Ghost = 2, Hero = 3, Pet = 4, Mob = 5, Boss = 6, ArcBomb = 7 }
export interface RenderItem {
  kind: SortKind;
  idx: number;       // Index into store array / map lookup key
  sortY: number;     // Ground contact Y (pixels)
  sub: number;       // Tie-breaker (-1 ghost, 0 prop/entity, +1 airborne)
}

export interface DamageNumber {
  active: boolean;
  x: number; y: number; vx: number; vy: number;
  text: string; color: string;
  ageMs: number; lifeMs: number;
  crit: boolean;
}
```

---

## 3. Eight-Pass 2.5D Render Pipeline (`renderBansungScene`)

Every frame (`requestAnimationFrame`), `ctx.imageSmoothingEnabled = false` is re-applied immediately after each `ctx.setTransform(...)` call to preserve crisp nearest-neighbor pixels.

1. **Pass 0 — Transform & Biome Floor**:
   - Clear viewport in screen DPR space with biome abyss color (`#1e140e` desert, `#12080d` crypt, `#080e16` cyber).
   - Apply camera transform: `setTransform(dpr * z, 0, 0, dpr * z, dpr * (w/2 - (cam.x + cam.shakeX)*z), dpr * (h/2 - (cam.y + cam.shakeY)*z))`.
   - Compute viewport AABB (`vx0..vy1`) with `CULL_PAD_PX / z` for `onScreen(x, y, r)`.
   - Fill arena bounds `[0, 0, mapW, mapH]` with cached biome `CanvasPattern` + 3px pixel-beveled perimeter border.
2. **Pass 1 — Ground Decals & Floor Telegraphs**:
   - Draw pooled ground decals from `particles.ts` (scorch craters, spent brass casings, bullet holes, slime/splatter).
   - Draw floor telegraphs *under* feet: downed teammate revive rings (pulsing arc `% = reviveProg`), bomb danger zones (pulsing `#ff4d4f` fill + dashed border), boss slam/mortar circles, healing/turret aura rings, and sniper red laser-sight lines (`rgba(255,50,50,0.45)`).
3. **Pass 2 — Ground Contact Shadows (Pre-Y-Sort)**:
   - Draw all entity shadows (`shadow.png` from Miragine or crisp `rgba(0,0,0,0.34)` pixel ellipse) **before** Pass 3 so shadows never darken an adjacent sprite's head.
   - Airborne entities (`zHeight > 0`: parabolic bombs, jumping mobs, boss leaps) keep shadow at `(x, groundY)` with scale `clamp(1 - zHeight / 140, 0.35, 1)` and alpha `0.34 * scale`.
4. **Pass 3 — Y-Sorted 2.5D Depth Pass**:
   - Reset `sortCount = 0; activeSort.length = 0`; for each visible item push `slot = sortPool[sortCount++]` (reusing pre-allocated objects, zero closures/allocs) into `activeSort`.
   - Sort `activeSort` by `(a.sortY - b.sortY) || (a.sub - b.sub) || (a.idx - b.idx)` (deterministic tie-break prevents Z-fighting flicker).
   - **Props/Cover** (`sortY = bottomY`): Draw 2.5D top face + front vertical wall (`wallH` px) for desert rocks, cacti, crates, explosive barrels, ruin pillars—allowing heroes to duck behind walls.
   - **Pickups** (`sortY = groundY`): Draw at `Math.round(x)`, `Math.round(y - 2 - Math.sin(now / 220 + idx) * 2)`.
   - **Heroes** (`sortY = footY`):
     - Dash afterimages pushed at `SortKind.Ghost` (`sortY = ghost.y`, `sub = -1`, `alpha = 0.45 * (1 - t)`).
     - Miragine-style anim frame (`idle` 4f @ 180ms, `run` 6f driven by `phase += moved * 0.08`, `shoot`/`dash`/`stun`/`downed`/`dead`) anchored via `[cellW, cellH, offX, offY]` at integer-snapped `(Math.round(x), Math.round(y))` with L/R flip `cos(aimAngle) < 0`.
     - **Dual-Layer Shoulder Gun Pivot**: Pivot `(x + cos(aim)*6, y - 12 + sin(aim)*4)`, flip vertically when `cos(aim) < 0`, kickback offset `-recoilPx * cos/sin(aim)`. Draw gun **before** hero body when `sin(aim) < -0.25` (aiming north/up-screen), **after** hero body otherwise.
   - **Pets / Turrets / Mobs / Bosses** (`sortY = footY`): Draw frame, apply cached white hit-flash overlay if `hitFlashMs > 0`, draw orbiting stun stars above head if `stunMs > 0`, and pulsing red/white tint on primed Bomb Goblins.
5. **Pass 4 — Projectiles, Melee Arcs & World Micro-HUD**:
   - Draw crisp pixel bullets, sweeping melee slash crescents (`arc` + pixel smear), opaque dust/smoke particles, wounded mob HP bars (hidden at full HP), downed revive countdown bars, and player aim reticle line.
6. **Pass 5 — Additive Glow Batch (`globalCompositeOperation = 'lighter'`)**:
   - Single `ctx.save()` block with `globalCompositeOperation = 'lighter'`: stamp pre-baked glow circles under energy orbs (`fireball`, `thunderball`, `storm`), muzzle flash cones, laser/railgun beam cores, explosion fireballs, electric stun arcs, and pickup sparkles. Always `ctx.restore()` immediately after.
7. **Pass 6 — Screen-Space Vignette & Stun/Damage Flash**:
   - `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`.
   - Draw radial crimson pulse border when local HP <= 30%, plus flashbang overlay `rgba(..., min(cam.flashAlpha, MAX_FLASH_ALPHA))`.
8. **Pass 7 — Crisp Outline Floating Damage Numbers**:
   - `spawnDamageNumber(x, y, text, kind)` writes into the 96-slot ring buffer (`vx = (Math.random() - 0.5) * 40`, `vy = -115`, `lifeMs = 680`).
   - Update & draw active slots (`vy += 420 * dt`, `popScale = ageMs < 90 ? 1.45 : 1.0`) with `font = '900 13px monospace'`, `lineJoin = 'round'`, `lineWidth = 3.5`, `strokeStyle = '#140c1c'` before `fillStyle` (`#ffffff` normal, `#ffd43b` crit, `#ff6b6b` player hit, `#4dabf7` shield, `#69db7c` heal, `#74c0fc` stun).

---

## 4. Radar Minimap (`renderBansungRadar`) & Verification

- **Radar (`client/src/bansung/render.ts`)**: `renderBansungRadar(ctx, size, dpr, cam, viewW, viewH)` draws static obstacle blocks (`#5c4a38`), teammates (`#4dabf7`), downed allies (blinking `#fcc419`), alive enemies (`#ff6b6b`), active boss diamond (`#ff2a6d`), crates/pedestals (`#ffd43b`), and current camera rect (`#ffffff`).
- **Wave-2 Checks**: Confirm 0 per-frame `createRadialGradient` calls in `render.ts`, verify `imageSmoothingEnabled === false` in pixel passes, and verify Y-sort occlusion behind desert pillars & gun behind/front layer switch at `aimAngle = -PI/2` vs `+PI/2`.
