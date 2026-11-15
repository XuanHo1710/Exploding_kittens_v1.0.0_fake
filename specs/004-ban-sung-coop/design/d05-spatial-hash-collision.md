# d05 — Spatial Hash Grid, Sliding Movement, Anti-Tunneling & AoE LOS

## Wave-2 Target Files
- **Primary module**: `server/src/game/bansung/spatial.ts` (`ActorGrid`, `ObstacleGrid`, movement/ray/AoE solvers)
- **Consumers**:
  - `server/src/game/bansung/world.ts` (30Hz tick: grid rebuild, hero/mob movement, projectile ray-step, AoE blasts)
  - `server/src/game/bansung/bot.ts` (co-op companion LOS & nearby threat/cover queries)
- **Shared types** (referenced from `shared/src/bansung.ts`): `BansungObstacleKind` (`'wall' | 'pillar' | 'cactus' | 'rock' | 'crate' | 'barrel' | 'pit'`)
- **Verification**: `server/test/bansung.test.cjs` (unit tests for sliding, tunneling, LOS occlusion)

---

## Constants & Schemas
```ts
export const GRID_CELL = 64;             // px; aligns with 48px tiles & tight 64px bullet queries
export const MAX_MOVE_SUBSTEP_PX = 8;    // prevents dash/knockback tunneling through thin walls
export const MAX_MOVE_SUBSTEPS = 8;
export const MAX_BOUNCES_PER_TICK = 3;
export const AOE_MIN_FALLOFF = 0.35;

export const LAYER_PLAYER = 1 << 0;      // heroes + co-op AI bots
export const LAYER_ENEMY  = 1 << 1;      // mobs + bosses
export const LAYER_PET    = 1 << 2;      // turrets / targetable deployables

export interface SpatialActor {
  id: number;
  x: number;
  y: number;
  radius: number;                        // hero ~14, mob 14..24, boss 36..52
  team: number;                          // 0 = co-op players, 1 = enemies
  layer: number;                         // LAYER_*
  alive: boolean;
}

export interface ArenaObstacle {
  id: number;
  x: number; y: number; w: number; h: number; // top-left AABB in world px
  kind: 'wall' | 'pillar' | 'cactus' | 'rock' | 'crate' | 'barrel' | 'pit';
  blocksMove: boolean;                   // true for all kinds ('pit' blocks walk, not bullets)
  blocksBullet: boolean;                 // false for 'pit'; true for all solid/destructible cover
  blocksLos: boolean;                    // true for 'wall'|'pillar'|'rock'; false for 'pit'|'crate'|'barrel'|'cactus'
  destructible: boolean;
  hp: number;
  alive: boolean;                        // toggled in-place on break (zero ObstacleGrid rebuild)
}

export interface RayObstacleHit {
  t: number;                             // [0, 1] normalized fraction along segment
  x: number; y: number;
  nx: number; ny: number;                // unit outward normal
  obstacle: ArenaObstacle;
}

export interface AoeTarget {
  actor: SpatialActor;
  edgeDist: number;
  falloff: number;                       // [AOE_MIN_FALLOFF, 1]
}
```

---

## 1. 2D Spatial Hash Grids (`spatial.ts`)

### `ActorGrid` (Zero-GC Flat Linked List, Rebuilt Per Tick)
- `cols = Math.max(1, Math.ceil(mapW / GRID_CELL))`, `rows = Math.max(1, Math.ceil(mapH / GRID_CELL))`.
- Buffers: `head = new Int32Array(cols * rows)` (reset via `head.fill(-1)`), `next = new Int32Array(512)` (doubled on overflow), `items: SpatialActor[] = []`, `maxRadius = 16`.
- `rebuild(actors)`: reset `head.fill(-1)`, `items.length = 0`, `maxRadius = 16`. For each `a` with `a.alive`: compute clamped cell `cx = clamp(floor(a.x / 64), 0, cols - 1)`, `cy = clamp(floor(a.y / 64), 0, rows - 1)`, `idx = items.push(a) - 1`, `next[idx] = head[cy * cols + cx]`, `head[cy * cols + cx] = idx`, `maxRadius = Math.max(maxRadius, a.radius)`.
- `queryCircle(x, y, r, layerMask, out)`: clear `out.length = 0`; scan cells `[floor((x - r - maxRadius)/64) .. floor((x + r + maxRadius)/64)]` clamped to grid bounds. For each chain item matching `(a.layer & layerMask) !== 0`, test `(a.x - x)^2 + (a.y - y)^2 <= (r + a.radius)^2`. Zero heap allocations.

### `ObstacleGrid` (Built Once at Arena Load)
- At map init, merge contiguous collinear static `'wall'` tiles into maximal AABBs to eliminate internal seam snagging.
- Store `cells: number[][]` (length `cols * rows`, storing indices into `obstacles: ArenaObstacle[]`).
- Deduplication across multi-cell AABBs via `seenEpoch = new Int32Array(obstacles.length)` and `epoch++` (if `epoch === 0x7fffffff`, `seenEpoch.fill(0); epoch = 1`).
- `queryAabb(x0, y0, x1, y1, out)` returns unique alive obstacles overlapping the clamped cell span.

---

## 2. Circle-vs-AABB Sliding Movement
`moveCircleWithSlide(body, dx, dy, obsGrid, mapW, mapH, margin)`:
1. Compute `dist = Math.hypot(dx, dy)`. If `dist === 0`, still run 1 pass of `resolveObstacles(body, obsGrid)` + clamp.
2. Sub-step count: `steps = Math.min(MAX_MOVE_SUBSTEPS, Math.max(1, Math.ceil(dist / Math.min(MAX_MOVE_SUBSTEP_PX, body.radius * 0.5))))`.
3. Per sub-step `(sx = dx / steps, sy = dy / steps)`:
   - Advance `body.x += sx; body.y += sy;`.
   - Query `obsGrid.queryAabb(body.x - r, body.y - r, body.x + r, body.y + r, tmpObs)` keeping `o.alive && o.blocksMove`.
   - Run **2 resolution passes** (sorted by deepest overlap on pass 1 to avoid corner oscillation):
     - Closest point on AABB `[o.x, o.x+o.w] × [o.y, o.y+o.h]`: `qx = clamp(body.x, o.x, o.x + o.w)`, `qy = clamp(body.y, o.y, o.y + o.h)`.
     - `vx = body.x - qx`, `vy = body.y - qy`, `d2 = vx*vx + vy*vy`.
     - If `d2 > 0 && d2 < r*r`: `d = sqrt(d2)`, push `body.x += (vx/d)*(r - d)`, `body.y += (vy/d)*(r - d)`.
     - **Inside-AABB escape (`d2 === 0`)**: compute face depths `dl = body.x - o.x`, `dr = o.x + o.w - body.x`, `dt = body.y - o.y`, `db = o.y + o.h - body.y`; push `body` completely outside the minimum-depth face by `r + minDepth`.
   - Clamp `body.x` to `[margin + r, mapW - margin - r]` and `body.y` to `[margin + r, mapH - margin - r]`.
4. **Tick order**: Run `moveCircleWithSlide` -> actor separation (`d36` boids/hard overlap) -> final `resolveObstacles(body, obsGrid)` so separation never pushes an actor inside a wall.

---

## 3. Bullet Ray-Step Tunneling Prevention
Unified swept collision for standard bullets (`1200..2400 px/s`), shotgun pellets, bouncing bullets, piercing railguns, and hitscan beams:
1. **Wall-hug muzzle guard**: Before advancing a newly spawned projectile from actor center `(ax, ay)` to muzzle `(mx, my)`, run `raycastObstacles(obsGrid, ax, ay, mx, my, br, 'bullet')`. If obstructed, spawn/impact at the wall contact point instead of tunneling through thin cover.
2. **Swept Segment vs Obstacles (`raycastObstacles`)**:
   - Slab intersection against Minkowski-expanded AABB `[o.x - br, o.y - br, o.w + 2*br, o.h + 2*br]` for each alive `o.blocksBullet` obstacle along the ray.
   - Returns earliest `tWall ∈ [0, 1]` and outward face normal `(nx, ny)` (if starting inside expanded box, `t = 0` with normal opposing ray direction).
   - Truncate projectile segment end to `tWall`: `ex = x0 + (x1 - x0)*tWall`, `ey = y0 + (y1 - y0)*tWall`.
3. **Swept Segment vs `ActorGrid`**:
   - If segment length `<= 128`, query `ActorGrid` over padded bbox `[minX - br, minY - br, maxX + br, maxY + br]`; if `> 128` (railgun/sniper), walk DDA cells padded by `ceil((br + actorGrid.maxRadius) / 64)`.
   - Skip actors matching projectile's `team` (unless friendly-heal) or already in `bullet.hitSet` (pierce).
   - Exact circle-sweep entry time `tEntry ∈ [0, 1]` for `D = (ex - x0, ey - y0)`, `F = (x0 - a.x, y0 - a.y)`, `R = br + a.radius`:
     - `c = F·F - R*R`. If `c <= 0` -> `tEntry = 0`.
     - Else `a2 = D·D`, `b = 2*(F·D)`, `disc = b*b - 4*a2*c`. Hit iff `a2 > 1e-6 && disc >= 0` and `tEntry = (-b - sqrt(disc)) / (2*a2)` lies in `[0, 1]`.
   - Convert back to original tick fraction `tActor = tEntry * tWall`.
4. **Resolution & Ricochet**:
   - Process actor hits ordered by ascending `tActor` (for `pierce === 0`, track single min `tActor` without sorting!).
   - If `tWall < 1` and no actor stopped the bullet earlier: damage `obstacle` if `destructible`; if `bounces > 0`, reflect velocity across `(nx, ny)`, reposition to `P(tWall) + (nx, ny) * 0.5`, decrement `bounces`, and step remaining `(1 - tWall)` fraction (max `MAX_BOUNCES_PER_TICK = 3`).

---

## 4. AoE Line-of-Sight (LOS) & Amanatides-Woo DDA
- **`raycastObstacles(obsGrid, x0, y0, x1, y1, radius = 0, mode = 'bullet' | 'los' | 'move')`**:
  - If `radius === 0`, step cells along `(x0, y0) -> (x1, y1)` using Amanatides-Woo 2D DDA (`tMaxX, tMaxY, tDeltaX, tDeltaY`; guard `dx === 0` / `dy === 0` with `Infinity`). If `radius > 0`, scan `obsGrid.queryAabb(minX - radius, ...)` when segment length `<= 128`, or visit DDA cells with `±Math.ceil(radius / GRID_CELL)` neighbor pad so grazing edges are never missed.
  - Deduplicate multi-cell obstacles with `seenEpoch`. Track closest `bestHit` via Kay-Kajiya slab test on AABB expanded by `radius`.
  - **Safe early exit (when `radius === 0`)**: stop traversing cells once `bestHit !== null && Math.min(tMaxX, tMaxY, 1) >= bestHit.t`.
- **`hasLineOfSight(obsGrid, x0, y0, x1, y1, mode = 'los')`**: returns `raycastObstacles(obsGrid, x0, y0, x1, y1, 0, mode) === null` (immediately returns `false` on first hit).
- **`queryAoeTargets(actorGrid, obsGrid, cx, cy, radius, losMode, layerMask, out)`**:
  1. `actorGrid.queryCircle(cx, cy, radius, layerMask, candidates)`.
  2. For each actor `a`: if `losMode !== 'none'`, test `hasLineOfSight(obsGrid, cx, cy, a.x, a.y, losMode)`. If blocked and `a.radius >= 28` (boss/heavy), probe 2 lateral offsets `±0.6 * a.radius` perpendicular to `(cx, cy)->(a.x, a.y)` so tiny cover corners do not cheese-block boss hits.
  3. Compute `edgeDist = Math.max(0, hypot(a.x - cx, a.y - cy) - a.radius)` and `falloff = clamp(1 - edgeDist / radius, AOE_MIN_FALLOFF, 1)`.
  4. Destructibles (`crate` / `barrel`): query `obsGrid` over `[cx - radius, cy - radius, cx + radius, cy + radius]`, apply damage if circle-vs-AABB distance `<= radius` and LOS passes; queue explosive barrel chain-detonations for next sub-tick (`pendingExplosions`) with a `detonated` flag to prevent stack overflow.
