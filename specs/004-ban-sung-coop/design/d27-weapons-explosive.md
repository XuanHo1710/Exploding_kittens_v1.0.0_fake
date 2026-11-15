# d27 — Explosive Weapons (Frag, Stun Concussion, Triple Bazooka, Proximity Mine Gun)

## 1. Scope & Wave-2 Target Files
- **Shared constants & falloff math:** `shared/src/bansung_explosives.ts` (re-exported by `shared/src/bansung.ts`)
- **Server simulation (30 Hz):** `server/src/game/bansung/explosives.ts` (invoked by `server/src/game/bansung/world.ts`)
- **Client rendering & telegraphs:** `client/src/bansung/render_explosives.ts` (invoked by `client/src/bansung/render.ts`)
- **Assets & SFX IDs:** `database-ban-sung/manifest.json` (`sprites/weapons/*`, `sprites/projectiles/*`, `sprites/fx/*`, `audio/sfx/*`)

## 2. Weapon Roster & Balance Table
All weapons consume shared blue Energy (`energyCost`), track magazine ammo (`magSize`), and obey co-op rules: `friendlyFire = false`, `selfDamagePct = 0`, `selfKnockbackPct = 0.35` (tactile rocket/grenade push without griefing). Armor affinity follows Miragine `[Light, Armored]` multipliers (`d33`).

| Field | `frag_launcher` | `stun_launcher` | `triple_bazooka` | `mine_gun` |
|---|---|---|---|---|
| Display Name | Frag Grenade Launcher | Stun Concussion Launcher | Triple Bazooka | Proximity Mine Gun |
| Tier / Archetype | Uncommon / Arc Lob | Rare / CC Shockwave | Epic / Heavy Ripple | Rare / Area Trap |
| Fire Mode | `lob` (1 bounce) | `lob` (1 bounce) | `ripple_rocket` (3x) | `mine` (ground stick) |
| Base Damage | `58` + `6x9` shrapnel | `26` | `44` x 3 rockets | `72` |
| Armor `[Light, Armored]` | `[1.15, 0.85]` | `[0.85, 1.00]` | `[0.95, 1.35]` | `[1.10, 1.20]` |
| Energy / Mag / Reload | `4` / `6` / `1650ms` | `5` / `4` / `1750ms` | `8` / `3 bursts` / `2200ms` | `5` / `5` / `1800ms` |
| Fire Cooldown / Spread | `480ms` / `3.5°` | `620ms` / `2.5°` | `950ms` / `±6°` fan (`50ms` ripple) | `520ms` / `2.0°` |
| Speed / GravityZ / InitVZ | `460 px/s` / `680` / `210` | `500 px/s` / `680` / `195` | `340→640 px/s` (`900/s²`) / `0` / `0` | `380 px/s` / `720` / `130` |
| Fuse / Contact | `1100ms` / direct hit | `850ms` / direct hit | `1600ms` / impact wall/mob | `arm 450ms`, `ttl 25s`, `trig 46px` |
| Blast / Core Radius | `92 px` / `34 px` | `128 px` / `56 px` | `76 px` / `28 px` | `108 px` / `42 px` |
| Outer Falloff Min | `0.40` | `0.50` (dmg), `0.65` (stun) | `0.45` | `0.45` |
| Knockback / Stun | `340 px/s` / `0ms` | `410 px/s` / `1800ms` | `280 px/s` / `0ms` | `460 px/s` / `350ms` |
| Recoil Push / Cam Shake | `30 px/s` / `4 px` | `35 px/s` / `5 px` | `95 px/s` / `7 px` | `25 px/s` / `3 px` |

## 3. Shared TypeScript Schema (`shared/src/bansung_explosives.ts`)
```ts
export type ExplosiveWeaponId = 'frag_launcher' | 'stun_launcher' | 'triple_bazooka' | 'mine_gun';
export type ExplosiveFireMode = 'lob' | 'ripple_rocket' | 'mine';

export interface ExplosiveWeaponDef {
  id: ExplosiveWeaponId;
  name: string;
  vnName: string;
  tier: 'uncommon' | 'rare' | 'epic';
  fireMode: ExplosiveFireMode;
  damage: number;
  armorAffinity: readonly [number, number]; // [light, armored]
  energyCost: number;
  magSize: number;
  reloadMs: number;
  fireCooldownMs: number;
  spreadDeg: number;
  burstCount: number;       // 1 except triple_bazooka = 3
  burstIntervalMs: number;  // 0 except triple_bazooka = 50
  fanDeg: number;           // 0 except triple_bazooka = 6 ([-6, 0, +6])
  projSpeed: number;
  projAccel: number;
  projMaxSpeed: number;
  projRadius: number;
  gravityZ: number;
  initVZ: number;
  bouncesMax: number;
  restitution: number;      // horizontal wall bounce factor (0.55)
  contactDetonate: boolean; // detonate on mob hit before fuse ends
  fuseMs: number;
  blastRadius: number;
  coreRadius: number;
  outerFalloffMin: number;
  knockbackSpeed: number;
  stunMs: number;
  shrapnelCount: number;    // 6 for frag_launcher, 0 otherwise
  armDelayMs: number;       // mine_gun = 450
  triggerRadius: number;    // mine_gun = 46
  detonateDelayMs: number;  // mine_gun = 180 (telegraph beep before boom)
  maxActivePerOwner: number;// mine_gun = 8 (world global cap = 24)
  mineTtlMs: number;        // mine_gun = 25000
  recoilPush: number;
  camShakePx: number;
  sfxFire: string;
  sfxExplode: string;
}

export function computeBlastFalloff(distEdge: number, coreR: number, blastR: number, minF: number): number {
  if (distEdge <= coreR) return 1;
  if (distEdge >= blastR) return 0;
  const t = (distEdge - coreR) / Math.max(1, blastR - coreR);
  return 1 - t * (1 - minF);
}
```

## 4. Authoritative Server Simulation (`server/src/game/bansung/explosives.ts`)
Tick step runs at 30 Hz (`dt = 1 / 30`).
1. **Spawn (`lob` & `mine`):** Aim distance `dAim = clamp(hypot(aimX - mx, aimY - my), 80, 400)`. Scale initial `(vx, vy)` so lob reaches cursor near `z=0` without overshooting small arenas; start at `z = 14`.
2. **Ripple Rocket (`triple_bazooka`):** Enqueue 3 pending sub-shots (`t = 0, 50ms, 100ms`) at offsets `[-fanDeg, 0, +fanDeg]`; each sub-shot checks player alive/not-stunned and applies rocket speed ramp `v = min(projMaxSpeed, v + projAccel * dt)` at fixed `z = 16`.
3. **Trajectory & Wall Bounce:**
   - Advance `(x, y)` via `d05` ray-step against wall AABBs. On wall hit: if `bouncesLeft > 0` reflect `(vx, vy) *= restitution`, `bouncesLeft--`; else if `fireMode === 'mine'` clamp `(vx, vy) = 0` and settle, else `detonateBlast()`.
   - Advance `z += vz * dt; vz -= gravityZ * dt`. When `z <= 0`: `z = 0`; if `fireMode === 'lob' && bouncesLeft > 0`, `vz = Math.abs(vz) * 0.45`, `vx *= 0.72`, `vy *= 0.72`, `bouncesLeft--`; else `vz = 0` (if `mine`, start `armDelayMs`).
4. **Proximity Mine Lifecycle:**
   - State `0 (arming)` -> `1 (armed)` after `450ms`.
   - When `owner` has `> 8` mines (or world `> 24`), pop oldest mine with `0.5x` mini-blast (`sfx_mine_beep` skipped).
   - Armed mines query `spatialHash.queryCircle(x, y, triggerRadius)` (`d05`) for live enemies. First contact transitions state `1 -> 2 (triggered)` for `180ms`, then calls `detonateBlast()`.
5. **Blast Resolution (`detonateBlast`):**
   - Query `spatialHash.queryCircle(bx, by, def.blastRadius)` for enemies, crates (`d32`), and explosive barrels (`d06`).
   - Filter each target via `d05` wall-tile LOS raycast `(bx, by) -> (tx, ty)` (destructible crates do not block AoE; solid walls block 100%).
   - Compute `falloff = computeBlastFalloff(max(0, dist - t.radius), def.coreRadius, def.blastRadius, def.outerFalloffMin)`.
   - Apply `dmg = round(def.damage * def.armorAffinity[t.armorTypeID] * falloff * sameTickMultiHitDecay)` (`triple_bazooka` decays `1.0 / 0.85 / 0.70` when multiple rockets hit the same target within `150ms`).
   - Apply radial knockback: `kbResist = boss ? 0.25 : heavy ? 0.55 : 1.0`; add `(nx, ny) * def.knockbackSpeed * falloff * kbResist` to `t.knockVx/Vy` (exponentially damped `exp(-10 * dt)` in `d05` sliding movement).
   - If `def.stunMs > 0`: call `d33` `applyStun(t, round(def.stunMs * stunFalloff))`; stun immediately cancels `Bomb Goblin` lit fuse and enemy laser sniper locks.
   - If `def.shrapnelCount > 0`: emit 6 mini-pellets (`speed: 520`, `dmg: 9`, `ttl: 180ms`) at `60° * i + jitter(±12°)`.
   - Explosive barrels brought to `hp <= 0` schedule chain detonation `+60ms` (max chain depth `4`).

## 5. Miragine-Style Frame Specs, Net Quantization & Audio
- **Net Payload (`shared/src/bansung.ts`):**
  - Projectiles `pr`: `[id, kindU8, xI16, yI16, zU8, angleU8]` (`6` ints/proj; `angleU8 = round((atan2(vy, vx)+PI)/(2*PI)*255)`).
  - Mines `mn`: `[id, ownerU8, xI16, yI16, stateU8]` (`5` ints/mine; `0=arming, 1=armed, 2=triggered`).
  - One-shot Blast FX `fx`: `[fxKindU8, xI16, yI16, radiusU8]` -> client triggers sprite blast, scorch decal (`d42`), `30ms` hitstop on crits/multi-kills (`d21`), and spatial SFX (`d43`).

| Asset ID | Source / Norm Grid (`d13`/`d14`) | Frames & Cadence (30fps base) | Pivot (`offX, offY`) | Visual Notes |
|---|---|---|---|---|
| `w_frag_launcher` | Custom normalized `32x24` | `2f` (`0=idle`, `1=kick 90ms`) | `-8, -12` | Olive rotary drum, dark 1px outline |
| `w_stun_launcher` | Custom normalized `32x24` | `2f` (`0=idle`, `1=flash 90ms`) | `-8, -12` | Cyan coil barrel + white guard |
| `w_triple_bazooka` | Custom normalized `40x24` | `2f` (`0=idle`, `1=vent 120ms`) | `-12, -12` | Tri-tube steel rack, shoulder mount |
| `w_mine_gun` | Custom normalized `32x24` | `2f` (`0=idle`, `1=eject 90ms`) | `-8, -12` | Wide amber disc chute |
| `p_frag_grenade` | `16x16` over Miragine `shadow.png` | `4f` spin @ `66ms/f` | `-8, -8` | Shadow scales `max(0.45, 1 - z/140)` |
| `p_stun_canister` | `16x16` over `shadow.png` | `4f` spin @ `66ms/f` | `-8, -8` | Pulsing cyan ring halo |
| `p_rocket` | `24x16` + Miragine `fireball.png` tail | `2f` thruster @ `50ms/f` | `-12, -8` | Rotated to velocity + smoke pool |
| `p_prox_mine` | `16x16` ground disc | `4f` (`arm/dim/blink 1Hz/red 6Hz`) | `-8, -8` | Dashed `46px` faint trigger ring |
| `fx_blast_he` | CC0 pixel strip `64x64` (`d12`) | `8f` @ `40ms/f` (`320ms`) | `-32, -32` | Scaled to `blastRadius * 2` + crater |
| `fx_blast_stun` | Reuse Miragine `thunderball.png` (`128x128`) | `12f` (`f0..11`) @ `33ms/f` | `-64, -64` | Additive cyan ring + stun stars (`d23`) |

- **Audio Event IDs (`d11`/`d16`/`d43`):** `sfx_gl_fire`, `sfx_stun_fire`, `sfx_bazooka_fire`, `sfx_mine_deploy`, `sfx_mine_beep`, `sfx_boom_heavy`, `sfx_stun_burst`.
