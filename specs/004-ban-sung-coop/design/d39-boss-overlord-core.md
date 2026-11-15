# d39 — Boss 3: Overlord Gunship Core (`overlord_core`)

Wave 10 Final Boss (all biomes) & Cyber Lab Apex Boss; scales seamlessly into Endless waves. Armored hovering gunship (`armorType: 'armored'`, `hoverZ: 18px`) pairing rotating bullet-hell spirals, destructible EMP stun pylons, cover-clipped lane laser grids, and a co-op weak-point break loop.

---

## 1. Wave-2 Target Files

| File | Responsibility |
| :--- | :--- |
| `shared/src/bansung.ts` | `OVERLORD_STATS`, `OverlordState`, `BansungBossView`, `BansungWeakPointView`, `BansungLaserLane`, `BansungEmpPylon` |
| `server/src/game/bansung/bosses/overlordCore.ts` | Authoritative 30Hz boss brain, spiral emitter, EMP pylon lifecycle, laser LOS ray-clipping, weak-point break |
| `server/src/game/bansung/waves.ts` | Spawn hook at Wave 10 (`kind: 'overlord_core'`) + Endless tier scaling |
| `client/src/bansung/render.ts` | Hovering shadow/bob, weak-point node rendering, dashed-to-beam laser grid, EMP ring FX |
| `client/src/bansung/sprites.ts` & `database-ban-sung/manifest.json` | `OVERLORD_ANIMS` `[frames, cellW, cellH, offX, offY, fps]`, Miragine reuse, procedural vector-pixel fallback |
| `client/src/bansung/sound.ts` | Spatial SFX keys (`boss_overlord_spawn`, `emp_charge`, `emp_pulse`, `laser_charge`, `laser_beam`, `weakpoint_break`) |

---

## 2. Shared Schema & Balance Constants (`shared/src/bansung.ts`)

```ts
export type OverlordState =
  | 'enter' | 'patrol_spiral' | 'emp_deploy'
  | 'laser_telegraph' | 'laser_fire'
  | 'weakpoint_matrix' | 'breach_stun' | 'phase_shift' | 'dead';

export const OVERLORD_STATS = {
  baseHp: 4800,
  coOpHpPerExtraPlayer: 0.55,
  endlessHpScale: 0.35,        // per endlessTier
  radius: 44,                  // ground collision circle (px)
  hoverZ: 18,                  // visual Y lift above ground shadow
  armorType: 'armored' as const,
  baseArmor: 4,
  matrixArmor: 8,              // active during weakpoint_matrix
  speedP1: 95,                 // px/s
  speedP2: 120,
  phase2Ratio: 0.60,           // <= 60% HP triggers Phase 2
  stunEffectiveness: 0.45,     // d33 player stun DR; weak-point break bypasses DR
  weakPointOrbitR: 54,
  weakPointRadius: 16,
  weakPointBaseHp: 280,
  weakPointWindowTicks: 420,   // 14.0s @ 30Hz
  breachStunTicks: 120,        // 4.0s @ 30Hz
  breachBurstPct: 0.08,        // 8% maxHp instant shatter on full break
  breachDamageMul: 1.65,
  maxActiveProjectiles: 160,   // cap in world.ts for net/perf budget
} as const;

export interface BansungWeakPointView {
  idx: number;                 // 0..3
  angQ: number;                // quantized angle 0..255 -> 0..2PI
  hp: number;
  maxHp: number;
}

export interface BansungEmpPylon {
  id: number;
  x: number; y: number;
  hp: number; maxHp: number;
  chargeQ: number;             // 0..100 (fires EMP pulse at 100)
}

export interface BansungLaserLane {
  id: number;
  x1: number; y1: number;      // already clipped against solid pillars (d05 LOS)
  x2: number; y2: number;
  halfW: number;               // 22px (total beam width 44px)
  phase: 'telegraph' | 'lock' | 'active';
  ticksLeft: number;
}
```

Scaling formula at spawn (`nPlayers` = active humans + AI bots, `diffMul` = `0.85 | 1.0 | 1.35`):
- `maxHp = Math.round(4800 * (1 + 0.55 * (nPlayers - 1)) * diffMul * (1 + 0.35 * endlessTier))`
- `wpCount = Math.min(4, 1 + nPlayers)` (2 in Solo+Bot / Duo, 3 in Trio, 4 in Quad).
- `wpHp = Math.round(280 * diffMul * (1 + 0.25 * endlessTier))`

---

## 3. Authoritative 30Hz Combat Algorithms (`server/src/game/bansung/bosses/overlordCore.ts`)

All timers run on integer 30Hz ticks (`DT = 1 / 30`). Hover movement interpolates toward an orbit point `220..300px` from top-threat target (threat decays `15%/s`, `+40%` priority toward players actively reviving), clamped `80px` inside arena bounds and ignoring low ground props.

### 3.1 Rotating Bullet-Hell Spirals (`patrol_spiral`)
- **Pattern**:
  - **Phase 1**: 1 emitter, `arms = 4`, `omega = +1.65 rad/s`, `fireEvery = 4 ticks` (`7.5 Hz`), `speed = 230 px/s`, `dmg = 14`, burst `108 ticks` (`3.6s`).
  - **Phase 2**: Counter-rotating dual helix: outer ring (`arms = 6`, `omega = +1.85 rad/s`, `speed = 265 px/s`) + inner ring (`arms = 3`, `omega = -1.45 rad/s`, `speed = 195 px/s`, `fireEvery = 6 ticks`).
- **Fairness Guard**: Spawn bullets at `bossPos + dir * 38` (never inside hero center); skip emission if `bossProjectiles >= OVERLORD_STATS.maxActiveProjectiles`. Every 4th arm fires armored heavy bolts (`radius: 9`, `dmg: 18`); others fire plasma orbs (`radius: 7`, `dmg: 14`).

### 3.2 EMP Stun Pylons (`emp_deploy`)
- Cooldown `16s` (`480 ticks`); max alive `2` (P1) / `3` (P2).
- Drops via `30-tick` (`1.0s`) ground landing ring `180..360px` from boss, validated with `d05` spatial hash so pylons never overlap walls/pillars (`pylon.hp = Math.round(160 * diffMul)`, `radius = 18`, `armor = 2`).
- **Cycle**: Charges over `90 ticks` (`3.0s`), then emits **EMP Pulse** (`radius = 135px`): `16` dmg + drains `20` Energy + **`42 ticks` (`1.4s`) stun** (`d23` stun state, cancels dash/reload).
- **Co-op Counterplay**: Destroying a pylon before discharge triggers **Short-Circuit Backlash** (`radius = 150px`): deals `90` shock dmg to nearby mobs and adds `+25` Boss `stunGauge` (plus `120` bonus dmg if Boss is within `220px`).

### 3.3 Lane Laser Grid Telegraph (`laser_telegraph` -> `laser_fire`)
1. **`laser_telegraph` (`40 ticks` / `1.33s`)**: Boss selects orientation toward highest-density player cluster and builds lanes:
   - **P1**: 4 parallel lanes spaced `140px` apart (`halfW = 22px`, leaving `96px` safe lanes).
   - **P2**: Cross-hatch grid (3 horizontal + 3 vertical lanes rotated by `baseAngle`, spaced `150px`).
   - Each lane raycasts against tall `blocksLos: true` arena pillars (`d05`) to compute exact clipped `(x1, y1, x2, y2)` endpoints—standing behind pillars creates real cover shadows.
2. **Lock (`8 ticks` / `0.27s`)**: Angle & endpoints freeze; lane flashes white (`phase = 'lock'`), emits `sfx:laser_charge`.
3. **`laser_fire` (`27 ticks` / `0.90s`)**: Spiral pauses during P1 firing (runs at `50%` cadence in P2). Every `3 ticks` (`0.1s`), check `distPointToSegment(hero, x1, y1, x2, y2) <= 22 + hero.radius` -> `12` dmg + `1.0s` burn DOT (skip heroes with dash `i-frames`).

### 3.4 Co-op Weak-Point Break (`weakpoint_matrix` -> `breach_stun`)
- Triggered immediately on Phase 2 transition (`hp <= 60% maxHp`) and every `18s` (`540 ticks`) thereafter.
- Boss activates Shield Matrix (`armor = 8`, `40%` hull dmg reduction) and spawns `wpCount` destructible nodes orbiting at `r = 54px`, rotating at `0.45 rad/s`.
- Weak-point nodes ignore hull `armor`, take `1.5x` crit multiplier, and let co-op teammates split angles around the boss to burst different quadrants.
- **Full Break** (all nodes `hp <= 0` within `420 ticks`): Immediately cancels any pending laser/spiral, deals `8% maxHp` shatter burst, drops 2 Energy Orbs (`+25` energy each), and enters **`breach_stun`** (`120 ticks` / `4.0s`, `armor = 0`, `damageTakenMul = 1.65`).
- **Timeout Failure**: Emits **Overload Shockwave** (`radius = 220px`, `28` dmg + `0.8s` slow) and returns to `patrol_spiral`.

---

## 4. Miragine-Style Frame Specs & Asset Reuse (`d13`/`d14`/`d17`)

Normalized grid anchored at ground shadow `(0, 0)` with `hoverZ = 18` baked into negative `offY`:

| Key | Format `[frames, cellW, cellH, offX, offY, fps]` | Visual Notes |
| :--- | :--- | :--- |
| `overlord_hull_idle` | `[4, 128, 128, -64, -84, 8]` | Octagonal gunship, pulsing cyan vents, 1px `#141013` outline |
| `overlord_hull_charge` | `[4, 128, 128, -64, -84, 12]` | Iris aperture opens magenta/amber before laser or matrix |
| `overlord_hull_stun` | `[2, 128, 128, -64, -84, 10]` | Sparks + `±2px` Miragine freeze-jitter + `d23` stun stars |
| `overlord_hull_dead` | `[6, 128, 128, -64, -84, 10]` | Hull fracture + expanding pixel blasts |
| `overlord_weakpoint` | `[3, 32, 32, -16, -16, 8]` | Orbiting rotor pod; white offscreen tint cache flash on hit (`d17`) |
| `emp_pylon` | `[4, 48, 64, -24, -56, 8]` | Tesla coil pylon anchored above ground shadow |

**Miragine War Reuse (`database-miraginewar/mapping.json`)**:
- `/database-miraginewar/structures/shadow.png` (`38x16`, scaled `2.8x` under Gunship, `1.2x` under EMP Pylon).
- `/database-miraginewar/projectiles/thunderball.png` (`[16, 128, 128, -64, -64]`) for EMP Pylon discharge arc.
- `/database-miraginewar/projectiles/fireball.png` (`[3, 32, 32, -16, -16]`) recolored/additive-blended for spiral orbs.
- `/database-miraginewar/frames/storm_0..8.png` (`[9, 153, 261, -76, -240]`) on Phase 2 transition shockwave.

**Procedural Fallback (`client/src/bansung/sprites.ts`)**: If sheet PNG fails to load, synthesize cached offscreen pixel-art gunship silhouette + rotating rotor quads + pylon coil so gameplay never stalls on missing textures.

---

## 5. Renderer & Audio Hooks (`d41` / `d43` / `d45`)

- **Y-Sort & Hover (`render.ts`)**: Draw scaled ground shadow at `(x, y)`, then hull sprite at `(x, y + Math.sin(t * 4) * 3)` sorted by ground `y`; draw weak-points at `(x + cos(ang) * 54, y - 18 + sin(ang) * 54 * 0.72)` for 2.5D perspective ellipse.
- **Laser Grid**: `telegraph` = dashed `#ff3366` bounds + pulsing fill `alpha 0.16..0.40`; `lock` = solid `#ffffff` flash; `active` = `44px` outer additive glow `#ff2e63` + `16px` white hot core.
- **HUD (`BansungBoard.tsx`)**: Boss bar shows HP, `SHIELD MATRIX` shield badge + weak-point counter (`3/4`), and `BREACH STUNNED (1.65x DMG)` banner during `breach_stun`.
- **SFX (`sound.ts`)**: `sfx_boss_overlord_spawn`, `sfx_boss_spiral_tick` (throttled `150ms`), `sfx_emp_charge`, `sfx_emp_pulse`, `sfx_laser_telegraph`, `sfx_laser_beam`, `sfx_weakpoint_break` (uses `d43` 8-voice cap + stereo pan).
