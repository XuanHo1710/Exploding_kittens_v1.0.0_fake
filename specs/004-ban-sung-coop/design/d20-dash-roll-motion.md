# d20 — Dodge Dash / Roll Animation & Server Physics

## 1. Exact Wave-2 Target Files
- `shared/src/bansung.ts`: `BANSUNG_DASH_*` constants, `BANSUNG_HERO_FLAG_DASH` / `BANSUNG_HERO_FLAG_IFRAME`, dash fields on `BansungCommand` (aligns with `d02`).
- `server/src/game/bansung/dash.ts`: Pure 30Hz dash state machine, burst velocity curve, i-frame gate, input buffer, and sub-stepped collision solver (called from `server/src/game/bansung/world.ts` per `d04`, `d05`).
- `client/src/bansung/dashFx.ts`: Client dash tracker, Miragine foot-pivot squash-stretch solver, 4-ghost afterimage ring buffer, and 2.5D dust ring emitter (invoked by `client/src/bansung/render.ts` `d41` & `d42`).
- `client/src/bansung/sound.ts`: Trigger `sfx:dash` positional audio on dash onset (`d43`).

## 2. Shared Constants & Network Contract (`shared/src/bansung.ts`)
```ts
export const BANSUNG_DASH = {
  DURATION_S: 0.28,       // 280ms burst (~9 ticks at 30Hz; final tick sub-clamped)
  DISTANCE_PX: 140,       // Exact open-ground travel (~3.5 hero widths)
  IFRAME_S: 0.24,         // First 85.7% of burst is invulnerable (0..240ms)
  COOLDOWN_S: 1.15,       // 1150ms from dash onset (0.87s post-dash recovery)
  BUFFER_S: 0.10,         // 100ms (3-tick) pre-buffer before cooldown ends
  ENERGY_COST: 0,         // Free of Energy so dodging never soft-locks
  HERO_RADIUS: 13,        // Reference hero collider radius (px)
  MAX_SUBSTEP_PX: 11.5,   // <= 0.9 * HERO_RADIUS to prevent corner tunneling
} as const;

export const BANSUNG_HERO_FLAG_DASH = 1 << 2;
export const BANSUNG_HERO_FLAG_IFRAME = 1 << 3;
```
- **Input (`BansungCommand`)**: Client sends `dash?: 1` (or edge-triggered button bit) alongside move vector `(mx, my)` and `aim` angle (`rad`).
- **Frame Sync (`BansungFrame`)**: Hero state carries `flags` (`BANSUNG_HERO_FLAG_DASH`, `BANSUNG_HERO_FLAG_IFRAME`) plus `dashSeq: number` (`0..255` wrapping uint8 incremented on every accepted dash start). All clients detect `hero.dashSeq !== prevDashSeq` to spawn the takeoff dust ring and sync the `0.28s` animation cleanly even if a packet jitters.

## 3. Authoritative Server Physics (`server/src/game/bansung/dash.ts`)
Per-hero runtime fields on server:
```ts
export interface HeroDashState {
  dashLeft: number;      // seconds remaining in active dash (0..0.28)
  invulnLeft: number;    // seconds remaining in i-frames (0..0.24)
  cdLeft: number;        // seconds remaining on dash cooldown (0..1.15)
  bufferLeft: number;    // queued dash press window (0..0.10)
  dirX: number;          // locked unit direction X
  dirY: number;          // locked unit direction Y
  seq: number;           // uint8 dash counter synced to clients
}
```
### Trigger & Direction Rules
1. Pressing dash sets `dash.bufferLeft = BANSUNG_DASH.BUFFER_S` (ignored if `dead`, `downed`, or `stunLeft > 0`).
2. Each `30Hz` tick (`dt = 1 / 30`), decrement `cdLeft = max(0, cdLeft - dt)` and `bufferLeft = max(0, bufferLeft - dt)`.
3. Start dash when `bufferLeft > 0 && dashLeft <= 0 && cdLeft <= 0 && !dead && !downed && stunLeft <= 0`:
   - Direction = normalized `(mx, my)` if `hypot(mx, my) > 0.1`, else `(cos(aim), sin(aim))` (locked for full `0.28s`).
   - Set `dashLeft = 0.28`, `invulnLeft = 0.24`, `cdLeft = 1.15`, `bufferLeft = 0`, `seq = (seq + 1) & 255`.
   - Interrupts active gun fire windup / melee swing recovery for responsive dodge cancels; pauses (does not reset) active reload timer during the `0.28s` burst.

### Velocity Envelope & Collision Sliding
Use an analytical front-loaded ease-out curve `v_norm(u) = 1.4 - 0.8 * u` (`u ∈ [0, 1]`, integral = `1.0`), peaking at `700 px/s` on takeoff and settling to `300 px/s` at finish:
```ts
const stepDt = Math.min(dt, d.dashLeft);
const u0 = 1 - d.dashLeft / BANSUNG_DASH.DURATION_S;
const u1 = 1 - (d.dashLeft - stepDt) / BANSUNG_DASH.DURATION_S;
const dist = BANSUNG_DASH.DISTANCE_PX * ((1.4 * u1 - 0.4 * u1 * u1) - (1.4 * u0 - 0.4 * u0 * u0));
d.dashLeft = Math.max(0, d.dashLeft - stepDt);
d.invulnLeft = Math.max(0, d.invulnLeft - dt);
// Apply normal walk movement over any leftover `dt - stepDt` on the final tick to avoid a 20ms hitch.
```
- **Sub-stepped Wall Slide (`d05`)**: Split `dist` into `steps = Math.ceil(dist / BANSUNG_DASH.MAX_SUBSTEP_PX)` equal steps (max 2 steps/tick) using `moveCircleSlide(x, y, HERO_RADIUS, dx, dy)` against arena AABBs (`wall`, `pillar`, `rock`).
- **Enemy Pass-Through & I-Frames**: While `invulnLeft > 0`, skip enemy-vs-hero body separation push (allows dodging cleanly *through* enemy swarms) and ignore projectile, melee, shockwave (`d23`), and blast (`d24`) hits (projectiles do not consume/detonate on an i-framed hero). On dash end (`dashLeft === 0`), standard crowd separation (`d05`/`d36`) gently resolves any residual overlap.

## 4. Miragine-Style Frame & Squash-Stretch Spec (`client/src/bansung/dashFx.ts`)
Anchors around Miragine foot pivot `(x, footY)` (identical to `drawMiragineSheetFrame` in `client/src/thap/sprites.ts`, where `offX, offY` place feet at `(0, 0)` above `shadow.png`).
- **Frame Cadence (3-frame `dash` strip, or fallback to Miragine `run` 6-frame strip)**:
  - `u ∈ [0.00, 0.20)`: Frame `0` (launch crouch) — fallback `run[0]`
  - `u ∈ [0.20, 0.78)`: Frame `1` (tucked streak / roll peak) — fallback `run[1]` (extended stride)
  - `u ∈ [0.78, 1.00]`: Frame `2` (landing brace) — fallback `run[4]`
- **Piecewise Squash-Stretch & Hop (`u = clamp(elapsed / 0.28, 0, 1)`)**:
  | Phase | `u` range | `sx` | `sy` | `hopY` (px) | `lean` (rad) | Shadow Scale |
  |---|---|---|---|---|---|---|
  | 1. Launch Squash | `0.00 -> 0.14` | `1.00 -> 1.24` | `1.00 -> 0.76` | `0` | `0 -> +0.16 * sgn` | `1.00` |
  | 2. Burst Stretch | `0.14 -> 0.55` | `1.24 -> 1.30 -> 1.16` | `0.76 -> 0.84` | `-7 * sin(πu)` | `+0.28 * sgn` | `1 - 0.18 * sin(πu)` |
  | 3. Airborne Glide | `0.55 -> 0.82` | `1.16 -> 1.04` | `0.84 -> 0.96` | `-7 * sin(πu)` | `+0.24 -> +0.10 * sgn` | `1 - 0.18 * sin(πu)` |
  | 4. Land Rebound | `0.82 -> 1.00` | `1.04 -> 1.16 -> 1.00` | `0.96 -> 0.85 -> 1.00` | `0` | `+0.10 -> 0` | `1.00` |
  *(Where `sgn = dirX >= 0 ? 1 : -1`; for `roll`-style heroes, optionally step `rotate` by `Math.round(u * 4) * (π / 2) * sgn` around body mid-height `(0, -18)` with `imageSmoothingEnabled = false` to keep pixels crisp.)*
- **I-Frame Rim & Weapon Tuck**: While `HERO_FLAG_IFRAME` is active, apply subtle shimmer `globalAlpha = 0.82 + 0.12 * sin(u * 28)` and pull rendered gun offset (`d19`) inward by `4px` along aim axis so the weapon stays tucked cleanly during the roll.

## 5. Four Ghost Afterimages (Pooled Ring Buffer)
- **Spawn Schedule**: Emit **exactly 4** ghosts per dash at `GHOST_U = [0.08, 0.28, 0.48, 0.68]` (`22ms, 78ms, 134ms, 190ms` after takeoff).
- **Fixed Pool**: Pre-allocated array of `64` `DashGhost` structs (`0` per-frame heap allocations):
  `{ active, x, footY, hopY, left, sheetKey, frameIdx, sx, sy, lean, tint, age, life: 0.18 }`.
- **Rendering & Tint Cache**:
  - Each ghost lives `0.18s` (`180ms`), decaying via `alpha = 0.58 * Math.pow(1 - age / 0.18, 1.5)`.
  - Draw ghosts in the Y-sorted pass (`d41`) at sort key `y = ghost.footY - 0.5` so ghosts stay behind the active hero.
  - Reuse a cached solid silhouette tint (`source-atop` fill on an offscreen sprite scratch canvas keyed by `sheetKey + frameIdx + tint`, matching `d17` cache): Mascot Gunner `#ffd43b`, Cyber Ranger `#4dabf7`, Pyromancer `#ff922b`, Knight `#a5d8ff`.

## 6. 2.5D Dust Ring & Burst Puffs (`d41` / `d42`)
- **Takeoff Ground Ring (`u = 0`)**: Fixed-pool ring drawn in the ground decal pass (under actors, above terrain) at `(startX, startFootY)`:
  - Duration `0.26s`, expanding ellipse `rx: 8 -> 34 px`, `ry = rx * 0.45` (matching `shadow.png` 2.5D perspective).
  - Crisp `2px` pixel-ring stroke (`#f1e4c3` Desert / `#c9b8a8` Crypt / `#99e9f2` Cyber) + inner fill fading `alpha: 0.28 * (1 - p)` to `0`.
- **Takeoff & Landing Dust Puffs (`d42` particle pool)**:
  - At `u = 0`: spawn `7` radial dust puffs distributed around `-dashDir` cone (`±110°`), speed `50..95 px/s`, drag `6.0 /s`, upward float `-18 px/s`, radius `5 -> 1.5 px`, life `0.22..0.30s`.
  - At `u = 0.88`: spawn `2` micro side puffs (`speed = 32 px/s`, `life = 0.16s`) on foot landing.
- **Local Feel (`d08` / `d21` / `d43`)**: Local client predicts dash start immediately on keypress (reconciled if server does not raise `BANSUNG_HERO_FLAG_DASH` within `120ms`), fires `sound.play('dash')`, and adds a `1.5 px` directional camera kickoff impulse (`d21`).
