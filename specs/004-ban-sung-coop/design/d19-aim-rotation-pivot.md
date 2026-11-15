# d19 — Dual-Layer Facing Flip, 360° Shoulder-Pivoted Gun & Muzzle Offset Solver

## 1. Scope & Exact Wave-2 Target Files
- **`shared/src/bansungRig.ts`** *(new)*: Pure TypeScript rig schemas, constants, `solveFacing()`, `solveAimRig()`, and `solveMuzzleWorld()` shared by client and server (zero DOM deps).
- **`client/src/bansung/renderAim.ts`** *(new)*: Canvas 2D dual-layer `drawHeroWithWeapon()` (depth-sorted body/gun/hand, pixel-clean rotation, shell-eject & muzzle anchors), invoked by `client/src/bansung/render.ts`.
- **`client/src/bansung/input.ts`** *(call site)*: Screen-to-world cursor projection & mobile stick target projection feeding `solveAimRig()`.
- **`server/src/game/bansung/world.ts`** *(call site)*: Calls `solveMuzzleWorld()` + shoulder-to-muzzle segment ray clamp on `fire` command.

---

## 2. Canonical Coordinates & Sprite Orientation
- **World space**: `+X` right, `+Y` down. Entity `(x, y)` is the **ground feet anchor** (above shadow ellipse, matching `client/src/thap/render.ts`).
- **Normalized weapon sprites (`database-ban-sung/sprites/weapons/`)**: Always authored/normalized facing **RIGHT (`+X`, `0 rad`)**, top/sights toward `-Y`, grip pivot at `(gripX, gripY)`.
- **Hero body sprites**: Canonical normalized heroes have `nativeFacing = 1` (Right). Any Miragine-derived unit (`database-miraginewar/mapping.json`, `nativeFacingDirection: "left"`) sets `nativeFacing = -1`, so body flip is `bodyScaleX = (facingRight ? 1 : -1) * nativeFacing * scale`.

---

## 3. Schemas & Constants (`shared/src/bansungRig.ts`)
```ts
export const AIM_CONSTANTS = {
  FACING_HYST_COS: 0.08,   // ~4.6 deg deadband around +/-90 deg prevents flip flutter
  BEHIND_SIN_THRESH: -0.15,// sin(theta) < -0.15 -> draw gun behind hero head/shoulders
  MIN_PARALLAX_DIST: 22,   // clamp denominator so cursor near chest never spins gun
  DEADZONE_AIM_R: 12,      // fallback to baseAngle inside shoulder center
  AIM_WIRE_SCALE: 1000,    // int16 wire quantization: Math.round(theta * 1000)
} as const;

export interface HeroRigSpec {
  nativeFacing: 1 | -1;    // +1 right (normalized), -1 left (Miragine raw)
  shoulderOffsetX: number; // +X forward shift in facing dir (e.g. 2 world px)
  shoulderLiftY: number;   // height above feet (x, y) (e.g. 13 world px)
  bobY: readonly number[]; // per-frame vertical bounce (e.g. [0, -1, -2, -1, 0, -1])
  scale: number;           // uniform world render scale (e.g. 1.0)
}

export interface WeaponRigSpec {
  id: string;
  holdType: 'pistol' | 'rifle' | 'heavy' | 'staff' | 'melee';
  cellW: number;           // e.g. 32
  cellH: number;           // e.g. 16
  gripX: number;           // px from sprite left to trigger/hand pivot
  gripY: number;           // px from sprite top to trigger/hand pivot
  muzzleX: number;         // px from sprite left to barrel tip
  muzzleY: number;         // px from sprite top to barrel centerline (often != gripY)
  ejectX: number;          // px from sprite left to shell port
  ejectY: number;          // px from sprite top to shell port
  shoulderR: number;       // orbit radius from shoulder center to grip (6..11 px)
  recoilKick: number;      // max backward translation along -barrel (2..7 px)
  restTiltRad?: number;    // optional tilt for staves/blades (default 0)
  scale: number;           // uniform weapon scale (e.g. 1.0)
}

export interface AimRigResult {
  facingRight: boolean;
  gunFlipY: 1 | -1;        // +1 upright right-hemisphere, -1 vertically mirrored left
  zOrder: 'behind' | 'front';
  aimTheta: number;        // shot/muzzle ray angle rad in [-pi, pi]
  drawTheta: number;       // visual sprite angle (= aimTheta for firearms; +tilt/swing for staff/melee)
  shoulderX: number;
  shoulderY: number;
  gripX: number;
  gripY: number;
  muzzleX: number;
  muzzleY: number;
  ejectX: number;
  ejectY: number;
}
```

---

## 4. Dual-Layer Body Flip & Depth Ordering
1. **Facing Hysteresis (`solveFacing(prevRight, rawDx, rawDy)`)**:
   - Compute `rawDx = targetX - entX`, `rawDy = targetY - (entY - hero.shoulderLiftY + bob)`, `rawDist = Math.hypot(rawDx, rawDy)` *before* applying `shoulderOffsetX` (prevents `±2px` flip-flop oscillation when cursor sits near `entX`).
   - If `rawDist < 1e-4`, keep `prevRight`; else `c = rawDx / rawDist` -> `true` if `c > FACING_HYST_COS`, `false` if `c < -FACING_HYST_COS`, else `prevRight`.
2. **Body Layer (Layer 1)**:
   - Drawn at `(entX, entY)` using `[frames, cellW, cellH, offX, offY]` with `ctx.scale(bodyScaleX, hero.scale)` — **body never rotates 360°**.
   - Body animation frame `f` drives `bob = hero.bobY[f % hero.bobY.length] ?? 0`.
3. **2.5D Gun Z-Order Switching**:
   - When aiming upward (`Math.sin(aimTheta) < BEHIND_SIN_THRESH`), render **Gun -> Body** (`zOrder = 'behind'`) so hero's head/hat partially occludes the weapon.
   - Otherwise render **Body -> Gun -> Front Hand Dot/Glove** (`zOrder = 'front'`).
   - Tie `gunFlipY = facingRight ? 1 : -1` directly to hysteresis-filtered `facingRight` so body facing and weapon top-edge orientation never desync by a frame near `±90°`.

---

## 5. 360° Shoulder-Pivoted Gun & Parallax-Free Muzzle Solver
### Screen-to-World Crosshair Projection
```ts
// Desktop cursor (sx, sy) in CSS px around camera (cam.x, cam.y, cam.zoom):
const targetX = cam.x + (sx - viewW * 0.5) / cam.zoom;
const targetY = cam.y + (sy - viewH * 0.5) / cam.zoom;
// Mobile twin-stick (stickX, stickY): project virtual target at +240 world px from shoulder.
```

### Exact Angle & Offset Equations (`solveAimRig`)
1. **Shoulder pivot** (after resolving `facingRight` & `gunFlipY`):
   `shoulderX = entX + (facingRight ? 1 : -1) * hero.shoulderOffsetX`
   `shoulderY = entY - hero.shoulderLiftY + bob`
2. **Base ray & barrel-axis parallax compensation** (fixes bullets missing close targets when `muzzleY !== gripY`):
   - `dx = targetX - shoulderX`, `dy = targetY - shoulderY`, `dist = Math.hypot(dx, dy)`.
   - `baseAngle = dist > 1e-4 ? Math.atan2(dy, dx) : (facingRight ? 0 : Math.PI)`.
   - Signed perpendicular barrel offset in rotated local `+Y`:
     `perp = (weapon.muzzleY - weapon.gripY) * weapon.scale * gunFlipY`.
   - Because `orbit` and `muzzleX - gripX` lie along `(cos(aimTheta), sin(aimTheta))`, the ray from `(muzzleX, muzzleY)` at angle `aimTheta` passes directly through `(targetX, targetY)` iff `dist * sin(baseAngle - aimTheta) = perp`:
     ```ts
     const safeDist = Math.max(dist, Math.abs(perp) * 2.5, AIM_CONSTANTS.MIN_PARALLAX_DIST);
     const corr = dist < AIM_CONSTANTS.DEADZONE_AIM_R ? 0 : Math.asin(perp / safeDist);
     const aimTheta = wrapPi(baseAngle - corr);
     const drawTheta = wrapPi(aimTheta + ((weapon.restTiltRad ?? 0) + swingRad) * gunFlipY);
     ```
3. **Grip, Muzzle & Ejection World Transforms** (exact match to Canvas `translate -> rotate -> scale`):
   ```ts
   const cos = Math.cos(drawTheta), sin = Math.sin(drawTheta);
   const orbit = weapon.shoulderR - Math.min(recoilPx, weapon.recoilKick);
   const gripX = shoulderX + cos * orbit;
   const gripY = shoulderY + sin * orbit;

   const toWorld = (lx: number, ly: number) => {
     const mx = (lx - weapon.gripX) * weapon.scale;
     const my = (ly - weapon.gripY) * weapon.scale * gunFlipY;
     return [gripX + mx * cos - my * sin, gripY + mx * sin + my * cos] as const;
   };
   const [muzzleX, muzzleY] = toWorld(weapon.muzzleX, weapon.muzzleY);
   const [ejectX, ejectY]   = toWorld(weapon.ejectX, weapon.ejectY);
   ```

---

## 6. Pixel-Art Non-Distortion Rules (`client/src/bansung/renderAim.ts`)
1. **Disable bilinear blur**: Always set `ctx.imageSmoothingEnabled = false` inside `drawHeroWithWeapon` (unlike Miragine terrain in `thap/render.ts` which uses `true`).
2. **Uniform scale only**: Never apply non-uniform `(sx !== sy)` or recoil squash scaling to a rotated weapon; apply recoil purely by reducing `orbit` along the barrel axis before `rotate(drawTheta)`.
3. **Continuous `drawTheta`, integer local source/dest rects**: Keep `drawTheta` continuous (no 15° snapping) so cursor tracking stays 1:1 responsive; draw weapon sprites authored at crisp `2×` pixel density (e.g., `32x16` at `scale = 0.75..1.0`) to eliminate single-texel drop-out at `22.5°/45°`.
4. **Canvas draw sequence**:
   ```ts
   ctx.save();
   ctx.imageSmoothingEnabled = false;
   ctx.translate(rig.gripX, rig.gripY);
   ctx.rotate(rig.drawTheta);
   ctx.scale(weapon.scale, weapon.scale * rig.gunFlipY);
   ctx.drawImage(img, frame * weapon.cellW, 0, weapon.cellW, weapon.cellH,
     -weapon.gripX, -weapon.gripY, weapon.cellW, weapon.cellH);
   ctx.restore();
   ```
5. **Shell ejection vector**: Eject casings upward-back relative to world orientation:
   `ejectAng = rig.drawTheta + rig.gunFlipY * (-Math.PI * 0.62) + rand(-0.2, 0.2)` so shells always arc upward away from the receiver.

---

## 7. Client-Server Muzzle Parity & Wall-Clip Guard
- Client transmits quantized `aim = Math.round(rig.aimTheta * 1000)` (`int16`).
- Server reconstructs `facingRight = Math.cos(aimTheta) >= 0`, `gunFlipY = facingRight ? 1 : -1`, and calls `solveMuzzleWorld(ent.x, ent.y, aimTheta, heroRig, weaponRig)` (with `bob = 0, recoil = 0, swingRad = 0`).
- **Anti-tunnel barrel check (`server/src/game/bansung/world.ts`)**: Before advancing a newly fired projectile along `aimTheta`, sweep segment `(shoulderX, shoulderY) -> (muzzleX, muzzleY)` against spatial-hash wall AABBs and enemy hitboxes; if blocked before the muzzle tip, spawn impact / apply hit at the first intersection `t_hit` so pressed-up walls cannot be shot through and point-blank enemies are never skipped.
