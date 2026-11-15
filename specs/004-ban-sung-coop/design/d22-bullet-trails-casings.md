# d22 — Bullet Trails, Multi-Frame Strips, Muzzle Flashes & Bouncing Casings

## 1. Scope & Wave-2 Target Files
Visual projectile & firearm-discharge pipeline for `ban_sung` (60 FPS client-side rendering + zero-server-bandwidth cosmetic shell casings, matching Soul Knight readability over desert sand `#e8c488` and `client/src/thap/sprites.ts` strip metadata):
- `client/src/bansung/vfx/bulletTrails.ts`: tracer ribbons, multi-frame bullet strip drawer, muzzle flash cones, hit sparks.
- `client/src/bansung/vfx/casings.ts`: fixed-capacity `CasingPool` (2.5D Z-bounce kinematics + settled ground decal ring).
- `client/src/bansung/sprites.ts`: projectile/casing `AnimMeta` registry (`[frames, cellW, cellH, offX, offY]`) & offscreen procedural fallbacks.
- `client/src/bansung/render.ts`: integrates `renderSettledCasings` (ground pass), airborne casings & bullets (Y-sorted pass), and additive muzzle/tracer glow pass.
- `database-ban-sung/sprites/projectiles/`: normalized horizontal PNG strips (`nativeFacing: 'right'` so `ctx.rotate(ang)` aligns directly).

## 2. Miragine-Style Frame Specs (`AnimMeta`)
All new strips follow `client/src/thap/sprites.ts` tuple `[frames, cellW, cellH, offX, offY]` with integer pixel coordinates and a `1px` dark outline (`#1b1410` or `#2b0909`) for high contrast on bright desert tiles (`terrain` / desert sand). Existing Miragine strips (`fireball`, `thunderball`) are reused directly for magic/heavy shots.

```ts
export type AnimMeta = readonly [frames: number, cellW: number, cellH: number, offX: number, offY: number];

export const BANSUNG_PROJ_ANIMS: Record<string, { meta: AnimMeta; frameMs: number; loop: boolean }> = {
  bullet_kinetic:   { meta: [2, 16, 12, -8, -6],   frameMs: 75,  loop: true },  // brass/amber slug
  bullet_shotgun:   { meta: [2, 12, 10, -6, -5],   frameMs: 70,  loop: true },  // compact hot pellet
  bullet_plasma:    { meta: [4, 24, 14, -12, -7],  frameMs: 55,  loop: true },  // cyan energy bolt
  bullet_rocket:    { meta: [3, 28, 16, -14, -8],  frameMs: 55,  loop: true },  // flickering exhaust
  bullet_enemy_orb: { meta: [4, 16, 16, -8, -8],   frameMs: 80,  loop: true },  // pulsing crimson orb (#ff4d4f + #fff0f0 core)
  muzzle_flash:     { meta: [3, 32, 24, -4, -12],  frameMs: 35,  loop: false }, // pivot at barrel tip (offX=-4), 105ms total
  casing_brass:     { meta: [4, 8, 8, -4, -4],     frameMs: 0,   loop: true },  // 0°, 45°, 90°, 135° baked pixel angles
  casing_shell:     { meta: [4, 8, 8, -4, -4],     frameMs: 0,   loop: true },  // red shotgun hull + brass base
  impact_spark:     { meta: [4, 24, 24, -12, -12], frameMs: 40,  loop: false }, // armor/wall ricochet burst
  // Reused from /database-miraginewar/projectiles/:
  // fireball:    [3, 32, 32, -16, -16], thunderball: [16, 128, 128, -64, -64]
};
```

## 3. High-Speed Tracer Ribbons
At 30Hz snapshots + 60 FPS render, fast slugs (`>550 px/s`) visually skip without ribbons. Each projectile stores `sx, sy` (spawn muzzle) and draws a velocity-clamped tail:
```ts
export interface TracerStyle {
  outer: string;      // e.g. 'rgba(255, 196, 61, 0.55)'
  core: string;       // e.g. '#fff9db'
  width: number;      // 2..5 px outer width
  minLen: number;     // 12..24 px
  maxLen: number;     // 36..96 px
  additive: boolean;  // true for plasma/laser/railgun
}

export const TRACER_PRESETS: Record<string, TracerStyle> = {
  pistol:    { outer: 'rgba(255,180,60,0.50)',  core: '#fff9db', width: 2.5, minLen: 14, maxLen: 38, additive: false },
  rifle:     { outer: 'rgba(255,146,43,0.65)',  core: '#ffffff', width: 3.0, minLen: 22, maxLen: 64, additive: false },
  shotgun:   { outer: 'rgba(255,107,53,0.55)',  core: '#ffe8cc', width: 2.2, minLen: 12, maxLen: 34, additive: false },
  plasma:    { outer: 'rgba(51,154,240,0.70)',  core: '#e7f5ff', width: 4.0, minLen: 20, maxLen: 56, additive: true },
  sniper:    { outer: 'rgba(255,77,79,0.75)',   core: '#fff5f5', width: 4.5, minLen: 48, maxLen: 110, additive: true },
  enemy_orb: { outer: 'rgba(224,49,49,0.45)',   core: '#ffc9c9', width: 3.0, minLen: 10, maxLen: 26, additive: false },
};
```
**Tail Clamp Algorithm (prevents trail poking behind barrel on frame 0):**
1. Compute `speed = Math.hypot(vx, vy)`, unit vector `(ux, uy) = (vx / speed, vy / speed)`.
2. Travel distance since spawn `traveled = Math.hypot(x - sx, y - sy)`.
3. `len = Math.min(traveled, clamp(speed * 0.048, style.minLen, style.maxLen))`.
4. `tailX = x - ux * len; tailY = y - uy * len`.
5. Draw linear gradient `(tailX, tailY) -> (x, y)` (`alpha 0.05 -> 0.85`, `lineCap = 'round'`, `lineWidth = style.width`) then inner `1.2px` core pass (`0.5 * len` to head) before drawing rotated `BANSUNG_PROJ_ANIMS` frame at `(x, y)`.
6. **Railgun / Hitscan Beams:** spawn transient `BeamTrail` (`ttlMs = 150`, width decays `w * (1 - p)^2`, plus `3` diamond pixel spark chevrons interpolated along segment).

## 4. Muzzle Flash Cones
Triggered by local fire prediction & server shot events (`MuzzleFlashEvent`, fixed pool `MAX_FLASHES = 48`):
```ts
export interface MuzzleFlash {
  active: boolean;
  x: number; y: number; ang: number;
  t0: number; dur: number;   // default 105ms (3 frames * 35ms)
  scale: number;             // 0.85..1.25 random per shot
  tint: 'kinetic' | 'plasma' | 'explosive';
}
```
- **Render order per active flash (`age = now - t0 < dur`):**
  1. **Additive Floor/Bloom Pass (`lighter`):** radial gradient at `(x + cos(ang)*6, y + sin(ang)*6)`, `R = 26 * scale * (1 - age/dur * 0.4)`, alpha `0.45 * (1 - age/dur)` (`#ffd43b` kinetic, `#74c0fc` plasma, `#ff8787` explosive).
  2. **Pixel Cone Pass (`source-over`):** draw `muzzle_flash` frame `Math.min(2, Math.floor(age / 35))` at `(x, y)` rotated by `ang + jitter(-0.1, 0.1)` with `scale` (`offX = -4` anchors flash base flush with gun barrel).
  3. **Muzzle Embers:** on frame `0` only, emit `2` tiny `2x2px` hot sparks (`speed 90..160 px/s`, `ttl 110ms`) within `ang ± 0.35 rad`.

## 5. Spinning Brass Shell Casings (2.5D Pseudo-Z Physics & Decal Ring)
Zero network cost: client spawns casings locally from gun ejection port (`muzzle - 10px` back along barrel) when a kinetic weapon fires. Uses fixed preallocated arrays (no per-frame allocations):
- `MAX_ACTIVE_CASINGS = 96` (airborne bouncing shells)
- `MAX_SETTLED_CASINGS = 256` (ring buffer of resting desert decals; oldest overwritten on wrap)
```ts
export interface ShellCasing {
  active: boolean;
  kind: 'brass' | 'shell'; // rifle/pistol vs red shotgun hull
  x: number; y: number; z: number;      // ground (x,y), height z >= 0
  vx: number; vy: number; vz: number;
  spinPhase: number; spinVel: number;   // rad/s mapped to 4-frame strip (spinPhase & 3)
  bounces: number;
  settledAt: number;                    // 0 while bouncing; timestamp once resting
}
```
**Constants & Ejection Step:**
- `GRAVITY_Z = 580` px/s², `RESTITUTION_Z = 0.46`, `GROUND_FRICTION = 0.58`, `MAX_BOUNCES = 2`, `SETTLED_TTL_MS = 12_000`, `FADE_MS = 1_500`.
- Ejection direction perpendicular to aim: `ejectSide = Math.cos(aimAng) >= 0 ? -1 : 1` (flips cleanly with L/R hero facing), `ejAng = aimAng + ejectSide * (Math.PI * 0.52 + rand(-0.22, 0.22))`.
- Initial state: `z = 15`, `vx = cos(ejAng) * rand(75, 130) + shooterVx * 0.35`, `vy = sin(ejAng) * rand(55, 100) + shooterVy * 0.35`, `vz = rand(110, 160)`, `spinVel = rand(14, 26) * ejectSide`.
- Per-frame step (`dt <= 0.05`):
  - `x += vx * dt; y += vy * dt; z += vz * dt; vz -= GRAVITY_Z * dt; spinPhase += spinVel * dt;`
  - If `z <= 0`: `z = 0; bounces++;`
    - If `bounces <= MAX_BOUNCES && Math.abs(vz) > 32`:
      - `vz = Math.abs(vz) * RESTITUTION_Z; vx *= GROUND_FRICTION; vy *= GROUND_FRICTION; spinVel *= 0.55;`
      - Emit `1` tiny `#d9b57e` sand dust speck at `(x, y)` and trigger rate-limited `playCasingClink(x, y)` (min `90ms` cooldown between clinks).
    - Else: copy to `settledRing[writeIdx++ % 256]` with `settledAt = now`, `active = false`.
- **2.5D Render:**
  - **Ground decal pass (`renderSettledCasings`):** draw `(x, y)` at `alpha = age > 10_500 ? (12_000 - age) / 1500 : 1` using static frame `Math.floor(spinPhase) & 3` (`8x8` pixel strip, `imageSmoothingEnabled = false`).
  - **Airborne Y-sorted pass (`renderAirborneCasings`):** draw elliptical ground shadow at `(x, y)` (`rx=3, ry=1.5, alpha=clamp(0.32 - z*0.008, 0.08, 0.32)`), then draw casing sprite at `(x, y - z)` using `Math.floor(spinPhase) & 3`.

## 6. Procedural Fallback (Guaranteed Render Before/Without PNGs)
If `sprites.ts` PNGs fail or are loading, `buildProceduralProjSheets()` generates offscreen `<canvas>` strips matching `BANSUNG_PROJ_ANIMS` dimensions (`2x16x12`, `4x8x8`, etc.) using crisp `fillRect` pixel art (`#1b1410` 1px outline + `#ffd43b`/`#fff9db` core), ensuring zero missing-bullet invisible frames.
