# d26 — Kinetic Firearms (Stats, Ballistics, Feel & Sprite Specs)

## 1. Wave-2 Target Files
- `shared/src/bansung.ts` (or `shared/src/bansung/weapons.ts` re-exported by `shared/src/bansung.ts`): `KineticWeaponId`, `WeaponSpec`, `KINETIC_WEAPONS` registry (`Record<KineticWeaponId, KineticWeaponSpec>`).
- `server/src/game/bansung/weapons.ts` (invoked by `world.ts` 30Hz tick): burst scheduler, bloom decay, pellet fan dispersion, energy/mag consumption, swept bullet spawn.
- `client/src/bansung/sprites.ts` & `database-ban-sung/manifest.json`: Miragine-style `AnimMeta` strips (`gun_*`, `fx_muzzle_kinetic`, `bullet_kinetic_*`).
- `client/src/bansung/render.ts`, `particles.ts`, `sound.ts`: tracer ribbons, shell casing bounce, recoil kick, gunshot & pump-rack SFX triggers.

## 2. Shared Schema (`shared/src/bansung.ts`)
```ts
export type KineticWeaponId = 'pistol' | 'rifle' | 'smg' | 'shotgun';
export type KineticFireMode = 'semi' | 'auto' | 'burst' | 'pump';

export interface KineticWeaponSpec {
  id: KineticWeaponId;
  name: string;
  vnName: string;
  rarity: 'common' | 'uncommon' | 'rare';
  slotHint: number; // default hotbar preference (0..4)
  fireMode: KineticFireMode;
  damage: number;                 // per projectile/pellet
  armorMult: [light: number, armored: number]; // Miragine Light/Armored affinity (d33)
  critChance: number;             // 0..1 rolled per projectile
  critMult: number;               // e.g. 1.5
  knockback: number;              // px/s impulse on hit
  cooldownTicks: number;          // 30Hz ticks between triggers (or after burst end)
  burstCount: number;             // 1 normally; 3 for Burst SMG
  burstStepTicks: number;         // ticks between burst shots (2 = 67ms)
  pellets: number;                // 1 normally; 6 for Pump Shotgun
  energyCost: number;             // shared blue Energy spent per trigger pull (0 on pistol)
  magSize: number;
  reloadTicks: number;            // 30Hz ticks (33.33ms each)
  sweetSpot: [number, number];    // active-reload normalized window [start, end] (d31)
  projSpeed: number;              // px/s
  projRadius: number;             // hitbox radius px
  range: number;                  // max travel px
  falloff?: { startPx: number; minMult: number };
  baseSpreadDeg: number;
  fanArcDeg?: number;             // deterministic cone width for multi-pellet
  bloomPerShotDeg: number;
  maxBloomDeg: number;
  bloomDecayDegPerSec: number;
  moveSpreadMult: number;
  recoilKickPx: number;           // visual gun spring kickback (d21)
  camImpulsePx: number;           // directional camera punch
  muzzleSnapDeg: number;
  tracer: { color: string; core: string; lenPx: number; widthPx: number; fadeMs: number };
  casing: { color: string; size: [number, number]; ejectDelayTicks: number };
  sfx: { fire: string; reload: string; extra?: string };
}
```

## 3. Kinetic Firearm Roster & Balance Constants (`30Hz` = `33.33ms/tick`)

| Field | `pistol` (Sidearm Pistol) | `rifle` (Assault Rifle, Ref) | `smg` (Burst SMG) | `shotgun` (Pump Shotgun) |
|---|---|---|---|---|
| **vnName** | Súng Lục Phụ | Súng Trường Tấn Công | Tiểu Liên Loạt 3 | Shotgun Bơm |
| **Role / Feel** | Infinite 0-Energy backup | Screenshot workhorse AR | Mobile 3-rd Light shredder | CQC room-breacher & stagger |
| **Fire Mode** | `semi` (7t / 233ms, 4.3 RPS) | `auto` (3t / 100ms, 10 RPS) | `burst` (3x @ 2t + 6t = 10t cycle) | `pump` (20t / 667ms, 1.5 RPS) |
| **Damage x Pellets** | `14` x 1 (`60 DPS`) | `12` x 1 (`120 DPS`) | `10` x 3 (`90 DPS` / 3 bursts/s) | `11` x 6 (`66` burst, `99 DPS`) |
| **Armor `[L, A]`** | `[1.0, 0.8]` | `[1.0, 1.0]` | `[1.2, 0.7]` | `[1.1, 0.8]` |
| **Crit / Knockback** | `15%` x1.5 / `70` | `12%` x1.5 / `55` | `18%` x1.5 / `30` | `10%` x1.5 / `28`/pellet (`168`) |
| **Energy / Mag** | `0` E / `12` rds | `1` E/shot / `28` rds | `2` E/burst / `30` rds (10 bursts) | `3` E/shell / `6` shells |
| **Reload (`30Hz`)** | `29t` (`967ms`) `[0.45,0.68]` | `36t` (`1200ms`) `[0.50,0.70]` | `33t` (`1100ms`) `[0.45,0.65]` | `44t` (`1467ms`) `[0.55,0.75]` |
| **Speed / Radius / Range** | `780 px/s` / `4` / `680` | `920 px/s` / `4` / `760` | `860 px/s` / `3.5` / `620` | `740±5%` / `4` / `380` (falloff `240->0.55x`) |
| **Spread / Bloom** | `2.0°` `+1.4°` max `7.5°` (-16°/s) | `2.5°` `+1.1°` max `9.5°` (-18°/s) | `1.8°` `+1.8°` max `12.0°` (-24°/s) | `fan 22°` ± `1.8°` `+2.5°` max `5°` (-10°/s) |
| **Move Mult** | `1.15` | `1.25` | `1.10` | `1.15` |
| **Recoil / Cam / Snap** | `3.5px` / `2.0px` / `6°` | `4.5px` / `3.0px` / `4°` | `3.0px` / `1.8px` / `3.5°` | `8.5px` / `7.5px` / `11°` |
| **Tracer** | `#ffe066`/`#fff7cc` `34x2` `75ms` | `#ffae34`/`#ffffff` `48x2.5` `85ms` | `#ffd166`/`#ffffff` `38x2` `65ms` | `#ff7b29`/`#fff1a8` `28x3` `90ms` |
| **Casing** | Brass `3x2` `@+0t` | Brass `4x2` `@+0t` | Brass `3x2` `@+0t` | Red hull `5x3` `@+8t` (`267ms`) |

## 4. Server Firing, Burst & Spread Algorithms (`server/src/game/bansung/weapons.ts`)
Per-player weapon runtime state: `{ cdTicks, burstLeft, burstWaitTicks, bloomDeg, mag, reloadTicks }`.
1. **Tick Update (every 30Hz step)**:
   - Decrement `cdTicks`, `burstWaitTicks`, `reloadTicks` (`> 0`).
   - If `reloadTicks` hits `0`: refill `mag = spec.magSize`.
   - If `burstLeft > 0 && burstWaitTicks === 0`: fire next queued burst shot via step 3 (independent of trigger hold).
   - When `burstLeft === 0`: `bloomDeg = Math.max(0, bloomDeg - spec.bloomDecayDegPerSec / 30)`.
2. **Trigger Validation** (when `fireHeld` and `burstLeft === 0`):
   - Reject fire if `downed || stunned || reloadTicks > 0 || cdTicks > 0`.
   - If `mag <= 0`: auto-start reload (`reloadTicks = spec.reloadTicks`), emit `sfx_dry_fire` once, return.
   - If `player.energy < spec.energyCost`: emit `sfx_dry_fire` (throttled `300ms`) and block trigger (`pistol` always passes with `0`).
   - Deduct `player.energy -= spec.energyCost`; set `burstLeft = spec.burstCount`; immediately execute step 3 for round #1.
3. **Shot Execution (`smg` burst & single-trigger)**:
   - Decrement `mag -= 1`, spawn projectile(s), add `bloomDeg = Math.min(spec.maxBloomDeg, bloomDeg + spec.bloomPerShotDeg)`, decrement `burstLeft -= 1`.
   - If `burstLeft > 0 && mag > 0`: set `burstWaitTicks = spec.burstStepTicks` (`smg` fires at `t+0, +2, +4`); else force `burstLeft = 0` and set `cdTicks = spec.cooldownTicks` (`6t` post-burst recovery for `smg` -> `10t` total cycle).
4. **Dispersion & Shotgun Falloff**:
   ```ts
   const moveMult = moving ? spec.moveSpreadMult : 1;
   const spreadDeg = Math.min(spec.baseSpreadDeg + p.bloomDeg, spec.baseSpreadDeg + spec.maxBloomDeg) * moveMult;
   if (spec.pellets === 1) {
     // Triangular avg of 2 uniforms keeps hits centered while honoring max cone
     const r = (rng() - rng()) * degToRad(spreadDeg);
     spawnBullet(aimAngle + r, spec.projSpeed);
   } else {
     const fan = degToRad(spec.fanArcDeg ?? 22);
     const jitterDeg = (spec.baseSpreadDeg + p.bloomDeg * 0.4) * moveMult;
     for (let i = 0; i < spec.pellets; i++) {
       const base = (i / (spec.pellets - 1) - 0.5) * fan;
       const jitter = (rng() * 2 - 1) * degToRad(jitterDeg);
       const spd = spec.projSpeed * (0.95 + rng() * 0.1);
       spawnBullet(aimAngle + base + jitter, spd);
     }
   }
   ```
   - On hit at travel distance `d`: if `spec.falloff && d > spec.falloff.startPx`, scale damage linearly down to `spec.falloff.minMult` at `spec.range`.
   - Swept ray-step collision (`d05`) caps step <= `8px` (`920 px/s` = `30.7 px/tick` -> max 4 substeps/tick).

## 5. Miragine-Style Frame Specs, Tracers & Audio Feel
Using `AnimMeta = [frames, cellW, cellH, offX, offY]` (`client/src/bansung/sprites.ts`, 1px `#141013` dark outline per `d14`):
- `gun_pistol`: `[3, 24, 16, -6, -8]`, muzzle `[17, -2]` (f0 idle, f1 slide recoil, f2 reload-tilt)
- `gun_rifle`: `[3, 40, 18, -10, -9]`, muzzle `[28, -2]` (olive-tan/gunmetal AR matching ref screenshot; f0 idle, f1 bolt-kick, f2 mag-swap)
- `gun_smg`: `[3, 34, 18, -9, -9]`, muzzle `[23, -2]` (f0 idle, f1 muzzle kick, f2 reload)
- `gun_shotgun`: `[4, 42, 18, -10, -9]`, muzzle `[30, -2]` (f0 idle, f1 kick, f2 pump-back @ `+8t`, f3 pump-forward @ `+12t`)
- `fx_muzzle_kinetic`: `[3, 20, 16, -2, -8]` (additive flash at `muzzleOffset`, 1 tick/frame)
- `bullet_kinetic_sm` / `bullet_kinetic_md` / `bullet_shotgun_pellet`: `[2, 12, 8, -6, -4]`
- **Tracers & Casings (`d22`/`d42`)**: Render bullet sprite over an additive (`lighter`) tapered ribbon from `pos - dir * min(traveled, lenPx)` to `pos` (`fadeMs` tail). Eject brass/hull perpendicular to aim (`±18°`, `z0=14px`, `vz=90px/s`, `g=380px/s²`, 1 bounce) into the ground decal pool; Pump Shotgun delays hull + `sfx_shotgun_pump` to `+8t` (`267ms`) after firing.
- **Audio IDs (`d10`/`d43`)**: `sfx_pistol_fire`, `sfx_rifle_fire`, `sfx_smg_fire`, `sfx_shotgun_fire`, `sfx_shotgun_pump`, `sfx_reload_kinetic`, `sfx_dry_fire` (pitch jitter `±6%`, stereo pan by `dx`).
