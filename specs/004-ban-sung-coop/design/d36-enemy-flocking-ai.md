# d36 — Enemy Flocking, Crowd Steering & Flanking AI

## 1. Goal & Design Context
Keep **40–80+ simultaneous enemies** marching in cohesive Miragine War platoons, fanning into crescent flanking surrounds on engagement, routing smoothly around rectangular cover, and maintaining clean separation at **30 Hz** (`DT = 1/30 s`) in **< 0.5 ms/tick** without single-pixel stacking or corner oscillation.

References in existing codebase:
- `server/src/game/thap/world.ts` (`moveToward` tangent avoidance + grid `separate()`), upgraded here for 30 Hz bullet-hell co-op, rectangular AABBs, multi-player target distribution, role spacing, and zero-allocation inner loops.

## 2. Wave-2 Target Files & Ownership
- **Create**: `server/src/game/bansung/flocking.ts` — pure steering, flanking slot assignment, boids forces, and multi-pass weighted separation solver.
- **Integrate**: `server/src/game/bansung/world.ts` — calls `stepEnemyFlocking(...)` once per tick after stun/knockback decay and before attack/projectile emission.
- **Consumes**:
  - `server/src/game/bansung/spatial.ts` (`d05`): `queryEnemies(x, y, r, outIds, maxCount)` and `resolveCircleObstacles(x, y, r, aabbs)`.
  - `shared/src/bansung.ts` (`d02`, `d34`, `d35`): enemy `role`, `radius`, `moveSpeed`, `preferredRange`, `minRange`, `mass`.

## 3. Enemy AI State & Tuned Constants
Server-internal steering fields stored on each `BansungEnemy` (not serialized directly; only quantized `x, y, flags` enter `BansungFrame`):

```ts
export type EnemyFlockRole = 'melee' | 'bomber' | 'brute' | 'ranged' | 'caster' | 'boss';

export interface EnemyFlockState {
  vx: number;
  vy: number;
  targetId: number;          // living, non-downed player/turret id (-1 = none)
  flankSeed: number;         // deterministic hash: ((id * 2654435761) >>> 0)
  wallSlideSign: -1 | 1;     // latched side (+1/-1) to break AABB corner symmetry
  stuckTicks: number;        // increments if moved < 6px over 15 ticks while unblocked
  detourTicks: number;       // >0 forces tangential wall-follow burst
  anchorX: number;           // position sampled every 15 ticks for stuck check
  anchorY: number;
}
```

| Constant | Value | Purpose |
|---|---:|---|
| `FLOCK_DT` | `1 / 30` | Authoritative 30 Hz step (`33.33 ms`) |
| `RETARGET_INTERVAL` | `6` ticks | Staggered `200 ms` target/slot refresh (`id % 6 === tick % 6`) |
| `NEIGHBOR_RADIUS` | `56` px | Boids query radius (`r_i + r_j + 24` max span) |
| `COHESION_RADIUS` | `110` px | Platoon cohesion/alignment when `dist > 180` px |
| `MAX_NEIGHBORS` | `10` | Per-agent neighbor cap (guarantees `O(N)` worst case) |
| `W_SEEK` / `W_FLANK` | `1.00` / `0.55` | Goal seek + angular pincer spread |
| `W_SEPARATION` | `1.85` | Soft repulsion before contact |
| `W_COHESION` / `W_ALIGN` | `0.25` / `0.20` | Far-field platoon march (0 inside `180` px) |
| `W_WALL_AVOID` | `1.60` | Forward AABB whisker tangent steer |
| `VEL_BLEND` | `0.28` | Exponential velocity smoothing (`alpha`) |
| `SEP_SOLVER_ITERS` | `2` | Post-step mass-weighted hard circle projection passes |
| `RING_SLOTS` | `10` | Angular slots around each player (`36°` step) |

Mass weights (`invMass = 1 / mass`) for separation & ring priority:
- `bomber`: `0.8`, `melee`/`ranged`/`caster`: `1.0`, `brute`: `2.6`, `boss`: `Infinity` (`invMass = 0`, immovable by mobs).

## 4. Core Algorithms

### 4.1 Multi-Player Co-op Target & Flanking Ring Assignment
Every `RETARGET_INTERVAL` ticks (`(e.id % 6) === (tickNo % 6)`):
1. Maintain `targetLoad[playerIdx]` = count of alive enemies targeting that player.
2. Score each living, non-downed player `p` (plus active decoy/turret if `d30` spawns one):
   `score = dist(e, p) + targetLoad[p] * 48` (bombers halve penalty to `* 20`).
3. Choose lowest `score` as `e.targetId` (hysteresis: keep current target unless new `score < currentScore - 60`).
4. **Crescent Flanking Vector** (when `70 <= dist <= 240` px for `melee`/`brute`):
   - Compute base angle `baseAng = atan2(e.y - p.y, e.x - p.x)`.
   - Slot index `slot = e.flankSeed % RING_SLOTS`; signed offset `side = (e.flankSeed & 1) ? 1 : -1`.
   - When nearby allies crowd the direct line (`frontDot > 0.75` from ≥2 neighbors within `44` px), bias desired heading by `side * (35°..95°)` around `p` so trailing enemies peel wide into an encircling arc instead of queueing in a conga line.

### 4.2 Role-Based Range Bands
- **`melee` / `brute`**: seek ring point at `r_target + e.r + 4` px along unit's assigned slot angle (`(slot / RING_SLOTS) * 2π`).
- **`bomber`**: tight rush (`W_FLANK = 0.25`, `W_SEPARATION = 0.90` when `dist < 90` px) straight into fuse trigger range.
- **`ranged` / `caster`**: maintain annulus `[preferredRange * 0.85, preferredRange * 1.05]` (`180–280` px):
  - `dist > maxBand`: seek inward toward annulus edge.
  - `dist < minRange` (`110` px): radial retreat + tangential strafe (`side * tangent`) so casters stay behind frontline brutes.
  - Inside band with clear LOS: `seek = 0`, apply gentle orbit + separation only.
- **`boss`**: bypasses flank slot bending; uses direct seek + `invMass = 0` so mobs part around it.

### 4.3 Bounded Spatial-Hash Boids Pass
For each alive, non-stunned enemy `e`:
1. Fill preallocated `neighborBuf: Int32Array(10)` via `spatial.queryEnemies(e.x, e.y, NEIGHBOR_RADIUS, neighborBuf, MAX_NEIGHBORS)`.
2. **Soft Separation** (`desired = e.r + o.r + 10`):
   - If `0.05 <= d < desired`: `mag = ((desired - d) / desired)^2`, accumulate `sep += normalize(e - o) * mag`.
   - If `d < 0.05` (exact spawn overlap): deterministic golden-angle split `ang = ((e.id ^ o.id) * 2.399963) % (2π)` — never `Math.random()`.
3. **Far-Field Platoon March** (`distToTarget > 180` px, `e.role !== 'boss'`):
   - Over neighbors within `COHESION_RADIUS` sharing similar speed (`|speed_o - speed_e| <= 35`): accumulate `align += v_o`, `cohCenter += pos_o`.
   - Normalize and weight by `W_ALIGNMENT` and `W_COHESION` so freshly spawned waves advance as coherent Miragine lines before breaking into flanking arcs.

### 4.4 AABB Whisker Avoidance & Stuck Recovery
1. Cast a swept circle probe (`look = e.r + 28` px) along desired direction `dir` against nearby arena AABBs (`d05` obstacle grid).
2. If blocked by AABB normal `(nx, ny)`:
   - Choose tangent `t = e.wallSlideSign > 0 ? (-ny, nx) : (ny, -nx)`.
   - Blend `avoid = t * W_WALL_AVOID` (preserves `wallSlideSign` until forward ray clears, eliminating left/right corner jitter).
3. **Stuck Detector**: every `15` ticks (`0.5 s`), if `e.attackCooldown <= 0` and not stunned/stationary-casting and `hypot(e.x - anchorX, e.y - anchorY) < 6`:
   - Flip `e.wallSlideSign *= -1` and set `e.detourTicks = 12` (`0.4 s` forced tangent slide at `0.85 * moveSpeed`).

### 4.5 Velocity Integration & 2-Pass Hard Separation
1. Combine steering: `steer = seek * W_SEEK + flank * W_FLANK + sep * W_SEPARATION + coh + align + avoid`.
2. Normalize `steer` (or `0` if inside ranged stand-off deadzone), scale to `e.moveSpeed`, blend:
   `e.vx += (targetVx - e.vx) * VEL_BLEND; e.vy += (targetVy - e.vy) * VEL_BLEND`.
3. Add decaying knockback (`knockVx, knockVy`), move `e.x += totalVx * FLOCK_DT`, `e.y += totalVy * FLOCK_DT`.
4. **Hard Projection (`SEP_SOLVER_ITERS = 2`)**:
   - Refresh enemy spatial hash after integration (or query radius `e.r + 32` px into `neighborBuf` per enemy).
   - For each pair `(e, o)` in `neighborBuf` with `o.id > e.id` and `d < (min = e.r + o.r + 2)`:
     `overlap = (min - d) * 0.85` (softened relaxation prevents rigid explosion).
     `invSum = invMass_e + invMass_o`; split ratio `w_e = invSum > 0 ? invMass_e / invSum : 0.5`, `w_o = 1 - w_e` along pair normal (or golden angle if `d < 0.05`).
5. **Final Obstacle Clamp**: run `spatial.resolveCircleObstacles(e.x, e.y, e.r)` (`d05` circle-vs-AABB slide + arena bounds) after pass 2 so crowd pressure never pushes enemies into walls or rocks.

## 5. Miragine-Style Animation & Facing Coupling
- **Facing Hysteresis**: update `facingLeft = vx < 0` only when `|vx| > 18` px/s (prevents sprite flicker from lateral boid nudges); during attack windup/fire, override `facingLeft = target.x < e.x`.
- **Walk-Speed Sync**: drive client walk frame advance from resolved net displacement `actualSpeed = hypot(e.x - prevX, e.y - prevY) / FLOCK_DT` so blocked or stationary casters cleanly drop to Miragine idle stance rather than moonwalking.

## 6. Performance Budget & Wave-2 Verification
- **Zero GC Allocations**: reuse module-scoped `Int32Array(10)` neighbor scratch buffer and flat `Float32Array` target load counter (`<= 8` co-op entities).
- **Complexity**: `80` enemies × `10` neighbors × `2` passes `< 2,000` float ops/tick (`< 0.45 ms` in Node.js, leaving `> 4.5 ms` inside the `5 ms` server tick budget from `d47`).
- **Tests (`server/test/bansung.test.cjs`)**:
  1. Spawn 60 enemies at identical `(x, y)` -> within 12 ticks, `minPairDist >= 0.9 * (r_i + r_j)` and zero `NaN`.
  2. 40 melee enemies vs player behind an AABB pillar -> `>= 95%` reach melee ring within `2.5 s` without getting stuck.
  3. 4 co-op players -> crowd load penalty distributes aggro across players and forms encircling rings rather than 1-px conga lines.
  4. Mixed `melee` + `ranged` + `boss` -> ranged maintain `>= minRange`, mobs flow around immovable boss (`invMass = 0`).
