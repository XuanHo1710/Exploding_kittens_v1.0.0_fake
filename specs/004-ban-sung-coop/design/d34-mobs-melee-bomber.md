# d34 — Melee & Bomber Enemy Roster (`ban_sung`)

Defines the 4 frontline/rush enemy archetypes (`kindId: 0..3`, reserving `4..7` for `d35` ranged casters and `8+` for bosses `d37..d39`): **Desert Scarab**, **Bone Skirmisher**, **Bomb Goblin**, and **Heavy Cactus Brute**. Simulated at **30 Hz** (`TICK_MS = 33.33`, matching `database-miraginewar/mapping.json` `fps: 30`).

## 1. Wave-2 Target Files
- `shared/src/bansung.ts`: `BansungEnemyKind`, `BansungEnemyState`, `BansungEnemyStats`, `BANSUNG_ENEMIES` entries (`0..3`).
- `server/src/game/bansung/enemies-melee.ts`: 30 Hz AI state machines, fuse rush, lunge, thorny slam, stun-interrupt & friendly-fire blast.
- `client/src/bansung/sprites.ts`: `BANSUNG_ENEMY_ANIMS` (`[frames, cellW, cellH, offX, offY, fps, hitFrame]`) + deterministic procedural pixel-art fallback.
- `client/src/bansung/render.ts`: ground telegraph rings (fuse danger radius, slam AoE), lunge glint, fuse spark & white hit-flash.
- `database-ban-sung/sprites/enemies/{scarab,skirmisher,bomber,brute}.png` & `database-ban-sung/manifest.json`.

## 2. Shared Schema & Roster Stats (`shared/src/bansung.ts`)

```ts
export type BansungMeleeKind = 'scarab' | 'skirmisher' | 'bomber' | 'brute';
export type BansungEnemyState =
  | 'idle' | 'chase' | 'windup' | 'attack' | 'lunge' | 'fuse' | 'stunned' | 'dead';

export interface BansungEnemyStats {
  id: number;                    // 0..3 (melee), 4..7 (ranged d35)
  kind: BansungMeleeKind;
  name: string;
  hp: number;                    // 1P Wave-1 base HP
  armorTypeID: 0 | 1;            // 0 = light, 1 = armored (Miragine War parity)
  armor: number;                 // flat reduction per hit (min 1 dmg, per d33)
  speed: number;                 // px/s at 30 Hz
  radius: number;                // collision circle radius (px)
  mass: number;                  // boids/knockback weight (1.0 = standard)
  kbResist: number;              // 0..1 knockback reduction
  stunMult: number;              // stun duration multiplier (DR/resist)
  damage: number;                // primary melee / detonation damage
  attackRange: number;           // center-to-center trigger edge (px)
  windupTicks: number;           // telegraph before hitFrame (30 ticks = 1s)
  cooldownTicks: number;         // recovery between attacks
  score: number;                 // kill score & coin drop weight
  shadowScale: number;           // multiplier on Miragine shadow.png (38x16)
}
```

| `id` | `kind` | `hp` | `armorTypeID` / `armor` | `speed` (px/s) | `radius` / `mass` | `kbResist` / `stunMult` | `damage` | `attackRange` | `windup` / `cd` (ticks) | `score` |
|---:|---|---:|---|---:|---|---:|---:|---:|---:|---:|
| 0 | `scarab` | 28 | `0` (`light`) / `0` | 148 | 10 / 0.7 | 0.0 / 1.0 | 8 | 24 | 5 / 22 | 10 |
| 1 | `skirmisher` | 68 | `0` (`light`) / `1` | 118 | 12 / 1.0 | 0.15 / 1.0 | 11 (lunge 14) | 28 (lunge 95) | 8 / 27 | 22 |
| 2 | `bomber` | 52 | `0` (`light`) / `0` | 104 (fuse 162) | 12 / 0.9 | 0.1 / 1.15 | 34 (mob 14) | 180 (det 28) | 42 fuse / - | 30 |
| 3 | `brute` | 260 | `1` (`armored`) / `3` | 72 | 18 / 3.5 | 0.65 / 0.5 | 20 (slam 24) | 38 (slam 58) | 14 / 45 | 65 |

Co-op scaling (`world.ts` spawn helper, aligned with `d40`):
- `scaledHp = Math.round(base.hp * (1 + 0.35 * (aliveHumans - 1)) * (1 + 0.08 * (wave - 1)))`
- `scaledDmg = Math.round(base.damage * (1 + 0.04 * (wave - 1)))` (difficulty preset multiplier applied on top in `d03`/`d40`).

## 3. Miragine-Style Frame & Sprite Specs (`client/src/bansung/sprites.ts`)

All strips normalized per `d14`: canonical **right-facing** (`flipX = dirX < 0`), `1px` dark outline `#181425`, integer grid, bottom-center feet anchor `(offX, offY)` centered above Miragine `shadow.png` (`38x16`, `offX: -19, offY: -8`, drawn with `shadowScale`: `0.75` scarab, `0.95` skirmisher/bomber, `1.45` brute). Row order in single sheet or `{kind}_{state}.png`: `idle`, `run`, `windup_atk`, `special`, `dead`.

| Kind | Cell (`W×H`) | Pivot (`offX, offY`) | `idle` | `run` | `attack` (windup+hit) | `special` | `dead` | Palette & Silhouette |
|---|---|---|---:|---:|---:|---:|---:|---|
| `scarab` | `32×32` | `-16, -28` | 2f @4fps | 4f @12fps | 4f @16fps (hit f2) | — | 3f @10fps | Chitin gold `#e09f3e`, cyan gem `#4cc9f0`, 6 scuttling legs |
| `skirmisher` | `48×48` | `-24, -44` | 3f @5fps | 6f @12fps | 5f @15fps (hit f3) | `lunge` 3f @14fps | 4f @10fps | Ivory skull `#f4f1de`, desert cloth `#b56576`, curved scimitar |
| `bomber` | `48×48` | `-24, -44` | 3f @5fps | 6f @12fps | `fuse_run` 4f @16fps | `spark` 2f @18fps | 3f @10fps | Olive skin `#6a994e`, red bandana, giant iron bomb `#2b2d42` overhead |
| `brute` | `64×64` | `-32, -58` | 3f @4fps | 6f @8fps | 6f @12fps (hit f4) | `slam` 6f @12fps | 4f @8fps | Cactus green `#386641`, bone armor plates `#d8d4c8`, spiked club |

Procedural fallback (`sprites.ts`): if PNG strip fails/loads async, render crisp pixel-snapped silhouette primitives (body rect + eyes + weapon/overhead bomb + `1px` `#181425` stroke) cached on offscreen `HTMLCanvasElement` per `(kind, state, frame)` plus white `#ffffff` hit-flash mask (`d17`).

## 4. AI State Machines & Special Mechanics (`enemies-melee.ts`)

Shared target selection (`d36` integration): pick nearest alive, non-downed player (or decoy/turret `d30` if closer within `220px`); ignore downed players unless all humans downed. Apply boids separation (`r_sep = radius * 2.2`, reduced to `0.25x` when `state === 'fuse'` or `'lunge'` so rushers pierce crowds).

1. **Desert Scarab (`scarab`) — Swarm Zig-Zag**:
   - While `dist > 110px`, add perpendicular steering bias `Math.sin(tick * 0.22 + entity.id) * 0.45` so packs fan out instead of stacking in one bullet line.
   - At `dist <= 24px`, enter `windup` (`5` ticks) -> `attack` dealing `8` dmg if target remains within `34px`.
2. **Bone Skirmisher (`skirmisher`) — Telegraphed Lunge**:
   - Secondary cooldown `lungeCd = 78` ticks (`2.6s`). When `52 <= dist <= 95px`, `lungeCd === 0`, and `hasLOS(enemy, target)` (`d05`): lock `aimAngle`, enter `windup` (`8` ticks, weapon glint FX).
   - Transition to `lunge` (`10` ticks at `310 px/s` along `aimAngle`, circle-vs-AABB slide). First frame overlapping target within `radius + target.radius + 8` deals `14` dmg and ends lunge cleanly (no multi-hit per lunge).
   - Within `28px` while `lungeCd > 0`, perform standard `11` dmg swipe (`windup: 6`, `cd: 27`).
3. **Bomb Goblin (`bomber`) — Fuse Rush & Stun Counterplay**:
   - Trigger `fuse`: enters when `dist <= 180px && hasLOS` OR upon dropping below `35%` HP while `dist <= 260px`. Sets `fuseTicks = 42` (`1.40s`), `armTicks = 14` (`0.47s` minimum before contact blast so close spawns cannot instant-pop).
   - During `fuse`: speed rises `104 -> 162 px/s`, `separationWeight = 0.25`. Client renders pulsing red danger ring (`r = 88px`) + fuse progress fill (`fuseTicks / 42`).
   - **Detonation**: fires when `fuseTicks === 0` OR (`armTicks === 0 && dist <= 28px`). Deals AoE blast (`blastRadius = 88px`, LOS-checked via `d05` so walls/pillars block): `100%` dmg (`34`) inside `40px`, linear falloff to `50%` (`17`) at `88px`; impulse knockback `320 px/s`; **friendly fire `14` dmg** to enemy mobs in blast!
   - **Counterplay**:
     - **Stun / Freeze (`d23`)** cancels `fuse` immediately -> transitions to `stunned`, resets `fuseCooldown = 30` ticks (`1.0s`) upon recovery.
     - **Lethal kill** during `fuse`: bomb is **defused safely** (no explosion), rewarding focus fire.
4. **Heavy Cactus Brute (`brute`) — Thorny Slam & Armor**:
   - **Thorny Hide**: any player melee hit (`d29`) within `28px` reflects `4` dmg back (`0.5s` per-target ICD).
   - **Thorny Slam** (`slamCd = 135` ticks / `4.5s`): when `dist <= 58px` and `slamCd === 0`, enter `windup` (`20` ticks / `0.67s`, red `76px` ring). On hit frame: `24` dmg + `240 px/s` knockback + `10`-tick stun inside `76px`, plus spawn **6 radial cactus needles** (`speed: 170 px/s`, `dmg: 10`, `range: 190px`, `radius: 4px`) at `60°` intervals.
   - Otherwise standard cleave (`windup: 14`, `20` dmg in `110°` forward cone out to `44px`, `cd: 45`).

## 5. Wire Encoding & Cross-Module Hooks (`d02`, `d21`, `d23`, `d24`, `d41`, `d43`)
- **Quantized Enemy Tuple** (`d02`): `[id, kindId, qx, qy, hpPct, stateCode, flags, stateByte]` where `stateCode` (`0..7`) encodes `BansungEnemyState`, `flags` bits (`1: facingLeft`, `2: hitFlash`, `4: elite`), and `stateByte` packs `fuseTicks` (`0..42`) when `state === 'fuse'` or `windup` progress (`0..255`) for slam/lunge telegraphs.
- **Delta FX Events**:
  - `enemy_telegraph`: `{ kind: 'lunge' | 'slam', x, y, angle, r }` -> glint / ground warning ring (`d41`).
  - `bomb_explode`: `{ x, y, r: 88 }` -> layered pixel blast + crater decal (`d24`, `d42`) + `120ms` trauma shake (`d21`) + spatial boom (`d43`).
  - `enemy_stun`: `{ id, ticks }` -> orbiting stars + freeze-jitter (`d23`).
- **Wave Director (`d40`)**: `scarab` unlocks Wave 1 (pack 4-8), `skirmisher` Wave 1-2, `bomber` Wave 2+, `brute` Wave 3+ (max 2-4 concurrent per 4P wave to keep kite lanes readable).
