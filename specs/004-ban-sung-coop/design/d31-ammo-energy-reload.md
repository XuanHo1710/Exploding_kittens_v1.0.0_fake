# d31 — Shared Blue Energy, Magazine Reload, Active Sweet-Spot & Energy Orbs

## 1. Design Goals
Combine **Soul Knight's shared blue Energy pool** across all carried weapons with a snappy **tactical magazine + active reload sweet-spot** loop at the server's 30Hz tick (`BANSUNG_TICK_MS = 33`):
- **Shared Energy (`energy / maxEnergy`)**: Fuels ranged/magic firearms per shot; melee & starter Sidearm cost `0` energy so players are never soft-locked.
- **Per-Weapon Magazine (`ammoInMag / magSize`)**: Independent of Energy; drives burst pacing, dash-compatible reloads, and skill-based **Active Reload** (`R` / reload button).
- **Co-op Energy Orbs**: Dropped by mobs, crates, and boss HP thresholds; magnetize only when needed and share `40%` resonance to nearby allies to prevent orb-stealing friction.

## 2. Constants & Reference Weapon Budgets (`shared/src/bansung.ts`)
```ts
export const BANSUNG_TICK_HZ = 30;
export const BANSUNG_ENERGY_BASE: Record<BansungHeroClass, number> = {
  mascot_gunner: 200, // Mascot Gunner (balanced)
  cyber_ranger: 220,  // Cyber Ranger
  pyromancer: 260,    // Pyromancer (caster pool)
  knight: 180,        // Knight (higher armor/HP)
};
export const BANSUNG_ENERGY_REGEN_PER_S = 2.0;      // +1 energy every 15 ticks
export const BANSUNG_ENERGY_REGEN_DELAY_TICKS = 36; // 1.2s after last energy spend
export const BANSUNG_WAVE_ENERGY_RESTORE = 0.25;    // +25% maxEnergy on wave clear
export const BANSUNG_REVIVE_ENERGY_FLOOR = 0.40;    // >=40% maxEnergy on revive

export const BANSUNG_RELOAD_LOCKOUT_U = 0.28;       // Ignore R <28% (anti-double-tap)
export const BANSUNG_RELOAD_SWEET_MIN = 0.48;       // Sweet-spot start (48%)
export const BANSUNG_RELOAD_SWEET_MAX = 0.64;       // Sweet-spot end (64%, ~190ms)
export const BANSUNG_RELOAD_JAM_PENALTY_MULT = 0.45;// +45% duration freeze on miss
export const BANSUNG_ACTIVE_EMPOWER_DMG_MULT = 1.15;// +15% dmg for reloaded clip
export const BANSUNG_ACTIVE_ENERGY_BONUS = 12;      // +12 energy on perfect reload

export const BANSUNG_ORB_VALUES = { energy_s: 8, energy_m: 20, energy_l: 50 } as const;
export const BANSUNG_ORB_COOP_SHARE = 0.40;         // 40% to allies within 450px
export const BANSUNG_ORB_COOP_RADIUS = 450;
export const BANSUNG_ORB_MAGNET_RADIUS = 110;       // 140px w/ Pet (d25); 180px w/ Perk
export const BANSUNG_ORB_PICKUP_RADIUS = 18;
export const BANSUNG_ORB_TTL_TICKS = 660;           // 22s (blinks last 120 ticks)
export const BANSUNG_ORB_SPAWN_LOCK_TICKS = 10;     // 0.33s scatter bounce
export const BANSUNG_ORB_PICKUP_CAP = 96;           // aligns with d32 96-pickup merge cap
```

| Weapon Archetype | `magSize` | `energyCost` | `reloadTicks` (30Hz) | Notes |
| --- | ---: | ---: | ---: | --- |
| Sidearm Pistol (Slot 1, `d26`) | 12 | 0 | 27 (0.90s) | Never out of energy; supports active reload |
| Assault Rifle (`d26`) | 30 | 1 | 36 (1.20s) | 1 energy + 1 ammo per round |
| Burst SMG (`d26`) | 27 | 2 | 36 (1.20s) | 2 energy per 3-round burst (or 1/round on cap) |
| Pump Shotgun (`d26`) | 6 | 3 | 45 (1.50s) | 1 shell + 3 energy per 6-pellet trigger pull |
| Plasma Rifle / Staff (`d28`) | 20–24 | 3–4 | 42 (1.40s) | High energy burn; benefits most from `+12` perfect bonus |
| Railgun / Bazooka (`d27`/`d28`) | 3–4 | 10–12 | 54 (1.80s) | Slow reload; active reload doubles effective DPS |
| Melee (`d29` Crescent/Scythe/Baton) | 0 | 0 | 0 | `magSize === 0` (`∞`); Scythe deflect refunds via `grantHeroEnergy` |

## 3. Data Schemas & Network Quantization (`shared/src/bansung.ts`)
```ts
export interface BansungWeaponRuntime {
  weaponId: string;
  ammoInMag: number;       // 0..magSize (-1 if magSize === 0)
  empowered: boolean;      // true after perfect active reload until mag empty/swap
}
export interface BansungReloadRuntime {
  slot: number;
  progressTicks: number;   // advances only while !stunned && !downed && jamTicksLeft===0
  durationTicks: number;
  jamTicksLeft: number;    // >0 freezes needle red & jitters bar
  attempted: boolean;      // max 1 active-reload attempt per reload cycle
  sweetMinU: number;       // default 0.48 (Quick Hands perk: 0.44)
  sweetMaxU: number;       // default 0.64 (Quick Hands perk: 0.68)
}
// Added to BansungFrame.me (private HUD payload):
export interface BansungAmmoPrivate {
  en: number;              // integer 0..maxEn
  maxEn: number;
  slot: number;            // 0..4
  mags: number[];          // length 5 (-1 = melee/empty slot)
  maxMags: number[];       // length 5 (0 = melee/empty slot)
  empMask: number;         // 5-bit mask of empowered magazines
  /** Present ONLY while reloading: [pct 0..100, sweetMinPct, sweetMaxPct, stateFlag] */
  rel?: [number, number, number, 0 | 1]; // stateFlag: 0=active, 1=jammed
}
// Command (client -> server):
// { t: 'reload' } -> starts reload if idle, OR triggers active check if reloading
// { t: 'slot', slot: number } -> cancels in-flight reload cleanly (ammo unchanged)
```
- **Public Hero Flags** in `BansungFrame.p` (11-int player stride, `d02`): `HFLAG_RELOAD = 1 << 4` (draws mini bar above hero), `HFLAG_EMPOWER = 1 << 5` (gold muzzle/tracer tint).
- **Pickup Stride** in `BansungFrame.pk` (5-int stride, `d02`/`d32`): `[id, kindCode, Math.round(x), Math.round(y), meta]` (`energy_s`, `energy_m`, `energy_l` codes per `d32`).
- **Delta FX IDs** in `BansungFrame.fx` (6-int tuple, `d02`): `FX_RELOAD_START`, `FX_RELOAD_OK`, `FX_RELOAD_JAM`, `FX_RELOAD_DONE`, `FX_ENERGY_PICK`, `FX_DRY_FIRE`.

## 4. Server Algorithms (30Hz Authoritative in `server/src/game/bansung/energy.ts`)
1. **Fire Cost Validation (`tryConsumeFireCost`)**:
   - If `w.magSize > 0 && slotRuntime.ammoInMag <= 0`: auto-start reload (`startReload`) and abort shot (if `energy < effEnergyCost`, also emit rate-limited `FX_DRY_FIRE`).
   - If `energy < effEnergyCost` (`Math.ceil(w.energyCost * hero.energySaveMult)`): abort shot; if `tick - hero.lastDryFireTick >= 12` (400ms cap), emit `FX_DRY_FIRE` + HUD prompt (`"Hết Năng Lượng!"`).
   - On valid fire: `energy -= effEnergyCost`, `lastSpendTick = tick`; if `w.magSize > 0`, decrement `ammoInMag` and when it reaches `0`, clear `empowered` and auto-start `startReload` immediately.
2. **Reload & Active Sweet-Spot (`handleReloadCmd`, `tickHeroReload`)**:
   - **Important**: Holding LMB `fire` NEVER triggers active reload (prevents accidental jams when clip empties); only `{ t: 'reload' }` (`R` / mobile reload button) does.
   - If `!hero.reload`: require `magSize > 0 && ammoInMag < magSize && !downed && !stunned`; apply Quick Hands perk (`0.75x` duration, `[0.44, 0.68]` sweet-spot) and emit `FX_RELOAD_START`.
   - If `hero.reload` & `!attempted`: compute `u = progressTicks / durationTicks`.
     - `u < 0.28`: ignore (lockout).
     - `sweetMinU <= u <= sweetMaxU`: **Perfect!** Complete immediately (`ammoInMag = magSize`, `empowered = true`), `grantHeroEnergy(hero, 12)`, `hero.reload = null`, emit `FX_RELOAD_OK`.
     - Otherwise: **Jammed!** `attempted = true`, `jamTicksLeft = round(durationTicks * 0.45)`, emit `FX_RELOAD_JAM`.
   - Per tick: if `downed || stunned`, pause; else if `jamTicksLeft > 0`, `jamTicksLeft--`; else `progressTicks++`. When `progressTicks >= durationTicks`, set `ammoInMag = magSize`, `empowered = false`, `hero.reload = null`, emit `FX_RELOAD_DONE`.
   - Dashing (`d20`) does **not** interrupt reload; switching slots (`{ t: 'slot' }`) cancels `hero.reload` with no ammo change.
3. **Passive Energy Regen & Grants (`tickEnergyRegen`, `grantHeroEnergy`)**:
   - Each tick, if `!downed && tick - lastSpendTick >= 36 && energy < maxEn`, add `2.0 / 30` to `hero.energyFrac`; carry integer part into `energy`. `grantHeroEnergy(hero, amt)` clamps to `maxEn` (reused by `d29` Scythe deflect & `d32` pickups).
4. **Energy Orb Drops & Co-op Pickup (`spawnEnergyOrb`, `tickEnergyOrbs`)**:
   - **Drop rates**: Trash mob `45%` `energy_s` (+`15%` adaptive boost if team avg energy `< 40%`); Elite `100%` `energy_m` + `50%` `energy_s`; Crate `35%` `1–2x energy_s`; Boss 75%/50%/25% HP phases burst `4x energy_m`.
   - **Scatter & Magnet**: Spawn with radial speed `60–130 px/s` + Z-arc hop (`zVel=90, g=380`) during `10` lock ticks. After lock, find closest alive hero with `energy < maxEn` within `magnetRadius` (`110px` base, `140px` w/ Pet `d25`, `180px` w/ Magnet perk `d32`) and pull at `280 -> 460 px/s`.
   - **Pickup & Co-op Resonance**: When `dist <= 18px` to an eligible hero (`energy < maxEn`), grant `100%` orb value to picker and `ceil(val * 0.40)` to every other alive hero within `450px`, emit `FX_ENERGY_PICK`, remove orb. Never consumed by full-energy heroes. Enforce `96` pickup cap (`d32`) by merging oldest `energy_s` into `energy_m` or nearest low-energy hero.

## 5. Visual, Miragine Frame & Audio Specs
- **Overhead Reload Bar (`render.ts`)**: `34x5px` pixel bar `24px` above hero (`#10121c` border, `#0f172a` track), `#38bdf8` progress fill, `#fde047` sweet-spot bracket `[sweetMinPct..sweetMaxPct]`, `2px` white sliding needle. Jammed state turns track `#ef4444` with `±2px` horizontal jitter; Perfect spawns rising gold `"NẠP CHUẨN!"` micro-text.
- **Miragine-style Weapon & Orb Frames**:
  - Reloading weapon pose: 2-frame sprite offset (`frame 0`: `-18deg` tilted mag-eject during `u < 0.5`; `frame 1`: `0deg` + `+2px` slide-rack snap on completion).
  - Energy Orbs: 4-frame bobbing/pulsing pixel strip (`12x12` / `16x16` / `20x20`, `120ms/frame`) + additive `#38bdf8` radial glow sprite over `shadow.png` (scaling with Z-hop height).
- **Audio Events (`sound.ts`)**: `sfx_reload_start` (mag eject click), `sfx_reload_perfect` (crisp bell+rack chime), `sfx_reload_jam` (metallic clack), `sfx_reload_done` (bolt snap), `sfx_energy_orb` (rising chime + pitch scale by orb tier), `sfx_dry_fire` (hollow pin click).

## 6. Exact Wave-2 Target Files
- `shared/src/bansung.ts`: `BANSUNG_ENERGY_*`, `BANSUNG_RELOAD_*`, `BANSUNG_ORB_*`, `BansungAmmoPrivate`, `BansungCommand` (`reload`, `slot`), `HFLAG_RELOAD`, `HFLAG_EMPOWER`, `FX_*` codes.
- `server/src/game/bansung/energy.ts`: `tryConsumeFireCost`, `handleReloadCmd`, `tickHeroReload`, `tickEnergyRegen`, `grantHeroEnergy`, `spawnEnergyOrb`, `tickEnergyOrbs`.
- `server/src/game/bansung/world.ts`: Integrate energy/reload/orb ticks into 30Hz loop & wire `BansungAmmoPrivate` into `BansungFrame.me`.
- `client/src/bansung/render.ts`: Render overhead active-reload bar, empowered gold tracers, Z-arc energy orbs with shadows & glow.
- `client/src/bansung/BansungBoard.tsx` & `client/src/bansung/bansung.css`: Top-left blue Energy bar, hotbar `ammoInMag/magSize` badges, low-energy warning pulse.
- `client/src/bansung/sound.ts`: Map `FX_RELOAD_*`, `FX_ENERGY_PICK`, `FX_DRY_FIRE` to WebAudio / SFX assets.
