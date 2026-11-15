# d29 — Melee Weapons & Bullet Destruction (`ban_sung`)

## 1. Wave-2 Target Files
| Target File | Responsibility |
| :--- | :--- |
| `shared/src/bansung.ts` | `BansungMeleeId`, `BansungMeleeSpec`, `BANSUNG_MELEE_WEAPONS`, FX codes (`FX_MELEE_SLASH`, `FX_BULLET_SLICE`, `FX_SHOCK_CHAIN`) |
| `server/src/game/bansung/melee.ts` | Authoritative 30Hz swing state machine, swept-sector enemy/crate hits, anti-tunneling bullet destruction, Shock Baton stun + chain |
| `server/src/game/bansung/world.ts` | Invoke `stepMeleeSwings(world)` after movement & bullet step; process `cmd.t === 'fire'` for melee slots |
| `client/src/bansung/sprites.ts` | Load normalized melee weapon & slash FX strips from `/database-ban-sung/manifest.json` using Miragine `offX`/`offY` pivots |
| `client/src/bansung/render.ts` | Shoulder-pivoted melee swing interpolation (`easeOutCubic`), crescent slash ribbons, bullet-slice sparks, procedural fallback |
| `client/src/bansung/sound.ts` | Event IDs: `sfx_melee_crescent`, `sfx_melee_scythe`, `sfx_melee_baton`, `sfx_bullet_slice`, `sfx_shock_zap` |
| `database-ban-sung/manifest.json` | Frame metadata (`cellW`, `cellH`, `frames`, `offX`, `offY`, `fps: 30`) for 3 melee weapons + 3 slash FX strips |

## 2. Shared Schema & Weapon Constants (`shared/src/bansung.ts`)
Tick rate is `30 Hz` (`BANSUNG_TICK_MS = 1000 / 30`, matching Miragine `engine.fps = 30`). All melee weapons ignore reload/magazines and remain usable at `0` Energy (dry-swing fallback so players never softlock).

```ts
export type BansungMeleeId = 'crescent_blade' | 'reaper_scythe' | 'shock_baton';

export interface BansungMeleeSpec {
  id: BansungMeleeId;
  name: string;
  hotbarIcon: string;        // manifest sprite key for 5-slot pixel hotbar
  damage: number;            // base HP damage before armor affinity & crit
  affinity: [number, number];// Miragine-style [vsLight, vsArmored] multiplier
  critChance: number;        // 0..1
  critMult: number;
  energyCost: number;        // consumed on swing start if available
  dryDamageMult: number;     // damage mult when energy < energyCost (0 energy fallback)
  cdTicks: number;           // total cooldown between swings (30Hz)
  windupTicks: number;       // Miragine delayAttack anticipation ticks
  activeTicks: number;       // sweeping hit + bullet-destroy ticks
  recoveryTicks: number;     // post-swing lock before next weapon swap/fire
  reach: number;             // px from hero center (shoulder pivot)
  arcDeg: number;            // total sweep angle in degrees
  knockback: number;         // px/s impulse applied away from attacker
  lungePx: number;           // small forward dash during active tick 0
  canDestroyBullets: boolean;
  bulletEnergyGain: number;  // +energy per destroyed enemy bullet (0..maxBulletEnergy)
  maxBulletEnergy: number;
  stunTicks: number;         // 0 = none; subject to d33 stun DR & 0.35x boss scale
  chainRange: number;        // px bounce to 1 secondary target (Shock Baton)
  chainDmg: number;
  chainStunTicks: number;
}
```

| Stat | `crescent_blade` (Crescent Blade) | `reaper_scythe` (Reaper Scythe) | `shock_baton` (Shock Baton) |
| :--- | :--- | :--- | :--- |
| Role | Fast duelist slash & quick parry | Wide sweeping arc; premier bullet-curtain eraser | Anti-elite stunner; cancels enemy telegraphs |
| `damage` / `affinity` | `28` / `[1.25, 0.85]` (anti-Light) | `52` / `[1.15, 1.10]` (`1.5x` vs crates) | `22` / `[0.95, 1.35]` (anti-Armored) |
| `critChance` / `critMult` | `0.15` / `1.60` | `0.12` / `1.75` | `0.10` / `1.50` |
| `energyCost` / `dryDamageMult` | `0` / `1.0` | `2` / `0.60` (still destroys bullets at 0 EN) | `2` / `0.65` (no stun/chain when uncharged) |
| `cd` / `windup` / `active` / `rec` | `9` / `1` / `3` / `2` ticks (`0.30s` cd) | `18` / `3` / `5` / `4` ticks (`0.60s` cd) | `12` / `1` / `3` / `2` ticks (`0.40s` cd) |
| `reach` / `arcDeg` / `lungePx` | `68 px` / `130°` / `6 px` | `112 px` / `220°` / `4 px` | `60 px` / `100°` / `14 px` |
| `knockback` | `140 px/s` | `220 px/s` | `90 px/s` |
| `canDestroyBullets` | `true` (all non-beam bullets) | `true` (`+1` EN/bullet, max `+4`/swing) | `true` (zaps bullets in `100°` arc) |
| Stun & Chain | `0` | `0` (`30ms` client hitstop on 3+ kills/slices) | `36` ticks (`1.20s`), chain `55px` `10` dmg + `15t` stun |

## 3. Sweeping Arc & Bullet-Destruction Algorithm (`server/src/game/bansung/melee.ts`)
To prevent fast enemy bullets (`<= 700 px/s`, ~`23 px/tick`) or sweeping swings (`44°/tick` on Scythe) from tunneling past one another at 30Hz:

1. **Swing Initialization** (on valid fire cmd while not stunned/downed and `tick >= player.nextAttackTick`):
   - Deduct `charged = player.energy >= spec.energyCost`; if `charged`, `player.energy -= spec.energyCost`.
   - Toggle `dir = (player.swingCombo & 1) === 0 ? 1 : -1`; `player.swingCombo++`.
   - `halfArc = (spec.arcDeg * Math.PI / 180) * 0.5`; `startAng = aimRad - dir * halfArc`; `endAng = aimRad + dir * halfArc`.
   - Set `player.activeSwing = { weaponId, startTick: tick + spec.windupTicks, activeTicks: spec.activeTicks, dir, startAng, endAng, charged, hitIds: new Set(), bulletEnergy: 0 }` and `player.nextAttackTick = tick + spec.cdTicks`.
   - Emit `FX_MELEE_SLASH` immediately at windup/active start (with `windupTicks` encoded or emitted at `startTick` for exact hit sync).
2. **Per-Tick Sub-Arc Sweep** (`k = tick - swing.startTick`, for `0 <= k < swing.activeTicks`):
   - Origin `(ox, oy) = (player.x, player.y)` (hero may move/dash mid-swing). On `k === 0`, apply `spec.lungePx` along `aimRad` via `moveWithSlide()` (`d05`).
   - Compute tick sub-arc `[a0, a1]` where `t0 = k / activeTicks`, `t1 = (k + 1) / activeTicks`, `a0 = lerp(startAng, endAng, t0)`, `a1 = lerp(startAng, endAng, t1)`. Pad both ends by `PAD_RAD = 0.14` (`~8°`). Let `mid = (a0 + a1) * 0.5`, `half = Math.abs(a1 - a0) * 0.5 + PAD_RAD`.
   - **Enemies & Crates** (deduped via `swing.hitIds`):
     - Query spatial hash within `spec.reach + 36`.
     - Angle tolerance expands with target radius: `angTol = half + Math.asin(Math.min(1, e.radius / Math.max(8, dist)))`.
     - Hit if `dist <= spec.reach + e.radius` AND `Math.abs(wrapAngle(atan2(e.y - oy, e.x - ox) - mid)) <= angTol` AND LOS clear (`!rayHitsSolidWall(ox, oy, e.x, e.y)`; Scythe hits crates inside reach before walls).
     - Apply Miragine affinity damage (`damage * (charged ? 1 : dryDamageMult) * affinity[e.armorTypeID]`), knockback away from `(ox, oy)`, and for `shock_baton` (when `charged`): call `applyStun(e, spec.stunTicks)` (cancels mob sniper laser-lock / bomber fuse sprint) + find nearest non-hit enemy within `spec.chainRange` (`55 px`) for `chainDmg` + `chainStunTicks` and emit `FX_SHOCK_CHAIN`.
   - **Enemy Bullet Destruction** (runs every active tick; no `hitIds` needed since destroyed bullets deactivate immediately):
     - Filter enemy projectiles where `b.destructible === true` (excludes persistent beam lasers & mid-air lobbed mortars with `b.z > 18`).
     - Test bullet motion segment `[(b.prevX, b.prevY), (b.x, b.y)]`: find closest point `(cx, cy)` on segment to `(ox, oy)`.
     - Destroy bullet if `hypot(cx - ox, cy - oy) <= spec.reach + b.radius + 4` AND `Math.abs(wrapAngle(atan2(cy - oy, cx - ox) - mid)) <= half + 0.12`.
     - Set `b.alive = false`, spawn `FX_BULLET_SLICE` at `(cx, cy)` (capped at 6 FX events/player/tick for bandwidth), and if `swing.bulletEnergy < spec.maxBulletEnergy`, increment `player.energy` by `spec.bulletEnergyGain` (capped at `maxEnergy`).

## 4. Miragine-Style Frame & Pivot Specs (`database-ban-sung/manifest.json`)
Follows `database-miraginewar/mapping.json` convention: integer pixel grid, `fps: 30`, `offX`/`offY` anchor relative to hero shoulder pivot `(0, -14)` above foot shadow, native facing right (`+X`) flipped cleanly via `dir`.

| Asset Key | Path (`database-ban-sung/...`) | Grid (`cellW x cellH`) | Frames | `offX, offY` | Frame Cadence (30fps) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `wpn_crescent_blade` | `sprites/weapons/crescent_blade.png` | `48x48` | `4` | `-10, -24` | `0`: ready, `1`: pull, `2`: blur, `3`: recover |
| `wpn_reaper_scythe` | `sprites/weapons/reaper_scythe.png` | `64x64` | `4` | `-14, -32` | `0`: ready, `1`: windup, `2`: smear, `3`: settle |
| `wpn_shock_baton` | `sprites/weapons/shock_baton.png` | `48x48` | `4` | `-10, -24` | `0-1`: idle arc loop, `2`: zap thrust, `3`: cooldown |
| `fx_slash_crescent` | `sprites/fx/slash_crescent.png` | `96x96` | `4` | `-48, -48` | `1` frame/tick (`100ms` total), silver-cyan smear |
| `fx_slash_scythe` | `sprites/fx/slash_scythe.png` | `160x160` | `6` | `-80, -80` | `1` frame/tick (`167ms` + fade), crimson-violet crescent |
| `fx_slash_shock` | `sprites/fx/slash_shock.png` | `96x96` | `4` | `-48, -48` | `1` frame/tick (`100ms`), jagged cyan electric arc |

## 5. Client Rendering, Procedural Fallback & Net FX (`client/src/bansung/render.ts`)
- **Net Quantization**: `FX_MELEE_SLASH = [FX_ID, x, y, quantAngle8(aimRad), (weaponIdx << 1) | (dir > 0 ? 1 : 0)]` (`5` ints); `FX_BULLET_SLICE = [FX_ID, x, y, weaponIdx]` (`4` ints); `FX_SHOCK_CHAIN = [FX_ID, x1, y1, x2, y2]` (`5` ints).
- **Weapon Arm Sweep**: During `[startTick, startTick + activeTicks]`, interpolate weapon rotation `theta = lerp(startAng, endAng, easeOutCubic(progress))` around shoulder pivot `(px, py - 14)`, flipping weapon Y-scale when `cos(theta) < 0` so edge/scythe blade always faces outward along swing direction.
- **Procedural Fallback (when spritesheet not yet loaded)**: Draw pixel-stepped crescent ribbon between two offset `ctx.arc` curves (`outerR = spec.reach`, `innerR = spec.reach * 0.56`, tapered horns) with additive core (`#fff`) + weapon tint (`#74c0fc` Crescent, `#e64980`/`#9c36b5` Scythe, `#3bc9db` Shock + 3 jagged polyline bolts). On `FX_BULLET_SLICE`, emit 4 radial white-cyan spark pixels + `sfx_bullet_slice` metallic parry ping.
