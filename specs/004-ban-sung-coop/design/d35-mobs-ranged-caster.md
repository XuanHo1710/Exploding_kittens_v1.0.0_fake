# d35 — Ranged & Caster Mob Roster, Projectiles & Laser Telegraphs

> **Slice**: `d35-mobs-ranged-caster` | **Tick Rate**: `30 Hz` (`33.33 ms/tick`) | **Mode**: `ban_sung` (`bansung`)

## 1. Roster Stats & Armor Affinity

Follows Miragine War `light` / `armored` typing (`shared/src/thap.ts`) and Soul Knight telegraph readability:

| kindId | ID | Name | Wave | HP | Armor Type / Val | Radius | Speed (`px/s`) | Preferred Range (`px`) | Backoff `<px` | CD (`ticks` / `s`) |
|---|---|---|---|---|---|---|---|---|---|---|
| `4` | `cactus_spitter` | Cactus Spitter | W1+ | 75 | `light` / `0` | 13 | 78 | `210..320` | 140 | `54` (`1.8s`) |
| `5` | `laser_sniper` | Red-Laser Sniper | W2+ | 65 | `light` / `0` | 12 | 84 | `360..560` | 220 | `78` (`2.6s`) |
| `6` | `pyro_shaman` | Pyro Shaman | W3+ | 115 | `armored` / `1` | 13 | 74 | `240..380` | 160 | `72` (`2.4s`) |
| `7` | `thunder_mage` | Thunder Mage | W4+ | 105 | `light` / `1` | 12 | 80 | `280..440` | 175 | `81` (`2.7s`) |

- **Kind IDs `4..7`** continue directly after `d34` melee/bomber IDs `0..3` (`scarab/skirmisher/bomber/brute`).
- **Elite Modifier** (W5+ director flag `elite: true`): `HP * 1.8`, `CD * 0.82`, plus pattern upgrades noted in Section 3.

## 2. Miragine-Style Frame Specs & Asset Sources

Foot pivot `(0, 0)` sits above `shadow.png` (`38x16`, `offX: -19, offY: -8`). Normalized sheets (`d14`) use `48x48` integer grid, `nativeFacing: 'right'`, `#181425` 1px outline & `offY: -46`; direct Miragine reuse (`A4`/`B7`) uses `nativeFacing: 'left'` (flip via `ctx.scale(-1, 1)` when `facing !== nativeFacing`):

```ts
export const RANGED_MOB_ANIMS: Record<string, readonly [frames: number, w: number, h: number, offX: number, offY: number]> = {
  // Normalized sheets (database-ban-sung/normalized/mobs/*, nativeFacing: 'right', 48x48 tier per d14)
  cactus_spitter_idle:   [3, 48, 48, -24, -46], cactus_spitter_run:    [6, 48, 48, -24, -46],
  cactus_spitter_attack: [5, 48, 48, -24, -46], cactus_spitter_dead:   [4, 48, 48, -24, -46],
  laser_sniper_idle:     [3, 48, 48, -24, -46], laser_sniper_run:      [6, 48, 48, -24, -46],
  laser_sniper_attack:   [6, 48, 48, -24, -46], laser_sniper_dead:     [4, 48, 48, -24, -46],
  // Direct Miragine War reuse (client/src/thap/sprites.ts MIRAGINE_ANIMS A4=Mage, B7=Novice, nativeFacing: 'left')
  pyro_shaman_idle:      [3, 42, 58, -26, -60], pyro_shaman_run:       [6, 63, 56, -33, -57],
  pyro_shaman_attack:    [6, 65, 59, -45, -61], pyro_shaman_dead:      [3, 92, 55, -29, -56],
  thunder_mage_idle:     [3, 29, 56, -17, -55], thunder_mage_run:      [6, 52, 52, -27, -52],
  thunder_mage_attack:   [6, 41, 56, -27, -56], thunder_mage_dead:     [3, 71, 61, -25, -52],
};

export const RANGED_PROJ_ANIMS = {
  needle_orb:  [2, 16, 16, -8, -8],     // custom Soul-Knight orange/red orb + dark border
  sniper_slug: [2, 24, 10, -12, -5],    // white-hot core + crimson trail
  fireball:    [3, 32, 32, -16, -16],   // Miragine /database-miraginewar/projectiles/fireball.png
  thunderball: [16, 128, 128, -64, -64],// Miragine thunderball.png (render scale 0.45x -> ~58px glow, r=9px hitbox)
  storm:       [9, 153, 261, -76, -240],// Miragine storm.png ground-anchored pillar (render scale 0.65x)
} as const;
```

- **Verified local reuse**: `A4_*`, `B7_*`, `shadow.png`, `fireball.png`, `thunderball.png`, `storm.png` from `database-miraginewar/`.
- **Custom pixel packs (for `d12`/`d15`)**: `cactus_spitter` & `laser_sniper` built/adapted from CC0 top-down shooter assets (e.g., Kenney Topdown Shooter / 0x72 DungeonTileset cactus/cultist bases, verified by `d12`).

## 3. Attack Patterns, Telegraph Timings & Projectile Specs

### 3.1 Cactus Spitter (`cactus_spitter`) — Fan Spread
- **Telegraph** (`8 ticks / 267ms`): Halts movement (`speed = 0`), inflates + flashes crown flower `#ffab40`.
- **Fire** (`tick 8`, recover `4 ticks`): Spawns **3 `needle_orb` projectiles** at `aimAngle + [-14°, 0°, +14°]` (`5` shots at `[-24°,-12°,0°,+12°,+24°]` if `elite`).
- **Projectile**: `speed: 300 px/s`, `r: 5px`, `ttl: 54 ticks (1.8s)`, `dmg: 10`, non-homing, wall-blocked.

### 3.2 Red-Laser Sniper (`laser_sniper`) — Two-Phase Laser Sight
Requires clear LOS raycast (`d05`) to initiate:
1. **Tracking Phase (`ticks 0..22` / `0..733ms`)**: Shooter roots (`speed = 0`). `aimAngle` slews toward target capped at `omegaMax = 1.6 rad/s` (`0.053 rad/tick`), allowing close circle-strafing to out-turn the aim. Server emits `telegraph` (`kind: 0`, `phase: 0`, `prog: 0..255`) clipped to `(hitX, hitY)` via wall ray-AABB intersection. Client draws `1px` dashed red laser (`#ff2e4c`, `alpha: 0.45..0.80`).
2. **Lock-On Phase (`ticks 23..33` / `733..1100ms`)**: **`aimAngle` freezes** (`lockedAngle`). Server sets `phase: 1`. Client thickens beam to `2px` bright crimson-white pulse (`alpha: 0.92`, strobe on ticks `29..33`) + barrel spark + `sniper_lock` cue (`367ms` fair dodge window).
3. **Fire (`tick 33`)**: Spawns `sniper_slug` along `lockedAngle`: `speed: 960 px/s` (`32px/tick` -> `4` ray sub-steps in `d05`), `r: 4px`, `ttl: 27 ticks (0.9s)`, `dmg: 28`, `knockback: 180 px/s`, `armorPierce: 0.25`. Elite fires a `2`-round staggered burst (`+5 ticks`).

### 3.3 Pyro Shaman (`pyro_shaman`) — Explosive Fireball & Scorch Pool
- **Telegraph** (`14 ticks / 467ms`): Raises staff (`pyro_shaman_attack` frames `0..3`); emits target ground marker (`kind: 1`, `color: 1`, `r: 48px`) at lead-predicted point `targetPos + targetVel * 0.35` (lead clamped `<= 110px`).
- **Fire (`tick 14`)**: Launches Miragine `fireball` (`speed: 250 px/s`, `r: 8px`, `ttl: 48 ticks`, `maxDist: 380px`). Every 3rd cast (or `elite`): dual split `[-12°, +12°]` (`rSplash: 38px`, `dmg: 14`, no pool).
- **Detonation**: On player/wall hit OR reaching `maxDist`, deals LOS-checked AoE (`rSplash: 48px`, `dmg: 18` center -> `11` edge) + applies `Burn` (`3 dmg/s` for `3s`), and spawns a `fire_pool` hazard (`r: 40px`, `ttl: 90 ticks / 3.0s`, ticks `4 dmg` every `15 ticks`; max `2` active pools per shaman).

### 3.4 Thunder Mage (`thunder_mage`) — Shock Orbs & Storm Strike
Alternates **Thunderball (60%)** and **Storm Pillar (40%, prioritized if target is behind low cover)**:
- **Pattern A — Thunderball Volley**: `12-tick (400ms)` cyan spark telegraph -> fires `2` Miragine `thunderball` orbs at `[-10°, +10°]`, `speed: 205 px/s`, sinusoidal lateral wobble (`amp: 18px, freq: 6 rad/s`), `r: 9px`, `ttl: 66 ticks`, `dmg: 14`, applies `shock_slow` (`-35%` move speed `0.45s`) + `0.15s` micro-stun (gated by `d33` stun DR).
- **Pattern B — Delayed Storm Strike**: `27-tick (900ms)` ground telegraph (`kind: 1`, `color: 2`, `r: 46px`) locked at target's ground `(x, y)` (Elite/W7+: adds `2` flanking rings at `75px` offset). On `tick 27`, triggers 9-frame Miragine `storm` strike (`300ms` @ 30fps) dealing `24` AoE dmg + `0.4s` stun (`d33` DR) + `shocked` (`+15% dmg taken` for `2.0s`), bypassing wall cover to punish static camping.

## 4. Network Schemas & AI State Machine

```ts
// Added to shared/src/bansung.ts (quantized for <12 KB/s 30Hz snapshot budget)
export type BansungRangedKind = 'cactus_spitter' | 'laser_sniper' | 'pyro_shaman' | 'thunder_mage';

export interface BansungTelegraph {
  id: number;       // uint16 (matches caster entity id)
  kind: 0 | 1;      // 0 = laser line (x0,y0 -> x1,y1), 1 = ground circle (x1,y1, r)
  phase: 0 | 1;     // 0 = tracking/charging, 1 = locked/imminent
  color: 0 | 1 | 2; // 0 = crimson, 1 = pyro orange, 2 = thunder cyan
  prog: number;     // uint8 0..255
  x0: number; y0: number; // int16 world px (shooter muzzle)
  x1: number; y1: number; // int16 world px (wall-clipped ray end or ground center)
  r: number;        // uint8 AoE radius (0 for laser)
}

export interface BansungHazard {
  id: number; kind: 'fire_pool'; x: number; y: number; r: number; ttlTicks: number;
}
```

- **AI Loop (`server/src/game/bansung/enemyRanged.ts`)**:
  1. Target nearest alive (non-downed) player with threat tie-breaker (`dist - 60` if currently damaging caster).
  2. `IDLE -> CHASE` if `dist > rMax || !hasLOS` (blended with `d36` separation vector + obstacle slide).
  3. `REPOSITION` if `dist < backoffDist`: move `-dir + strafeSign * perp * 0.65` (`strafeSign` flips every `1.5s` or wall bounce).
  4. `TELEGRAPH`: entered when `dist <= rMax && hasLOS && cdTicks <= 0`.
  5. **Stun Interrupt**: Any player-inflicted stun (`stunTicks > 0`) cancels `TELEGRAPH`, deletes the caster's active `BansungTelegraph`, and sets `cdTicks = Math.round(baseCd * 0.4)`.

## 5. Wave-2 Target Files (Zero-Collision Ownership)

- `shared/src/bansung.ts`: `BansungRangedKind`, `BansungTelegraph`, `BansungHazard`, `RANGED_MOB_DEFS` constants.
- `server/src/game/bansung/enemyRanged.ts`: Ranged AI state machine, 2-phase laser slew/clipping, projectile & `fire_pool` hazard emitters, stun interrupt hook.
- `client/src/bansung/renderTelegraphs.ts`: Canvas 2.5D laser beam glow/pulse, ground AoE radial fill indicator, `fire_pool` ember layer, Miragine `fireball`/`thunderball`/`storm` frame renderers + pixel silhouette fallbacks when sheets are unready.
- `database-ban-sung/normalized/mobs/`: Normalized `48x48` `cactus_spitter.png` & `laser_sniper.png` sheets + Miragine `A4`/`B7` & projectile links in `manifest.json`.
