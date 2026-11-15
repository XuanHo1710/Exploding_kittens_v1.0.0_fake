# d25 — Pet Companion Animation, Spring Physics & Support

## 1. Concept & Art Direction
Pixel-art **Tiger Cub** (`tiger`, default) and **Calico Cat** (`cat`, palette swap) inspired by *Soul Knight*'s starter pet and *Miragine War*'s crisp 6-frame run cadence.
- **Visual footprint**: Compact `32x32` normalized cell (`22x18` sprite body), `1px` dark outline `#1b1412`, crisp integer scaling (`imageSmoothingEnabled = false`), anchored at feet above `/database-miraginewar/structures/shadow.png`.
- **Role**: Purely supportive companion (~4.5 DPS max) that trails the hero via spring-damper physics, magnetizes nearby pickups, and assists with light pounces + mini fire embers without obscuring bullets or stealing player kills.
- **Scope**: 1 pet per human player (AI bots from `d07` omit pets by default to limit screen clutter).

## 2. Wave-2 Target Files & Ownership
| File | Owner | Responsibility |
| --- | --- | --- |
| `server/src/game/bansung/pet.ts` | **w25 (New)** | Server 30Hz spring-follow, pickup magnet, pounce bite & mini-fire support (`stepPets`). |
| `client/src/bansung/petAnim.ts` | **w25 (New)** | `PET_ANIMS` metadata, procedural `32x32` pixel fallback sheet builder, squash-stretch, Z-arc & `drawPetCompanion`. |
| `shared/src/bansung.ts` | d02 hook | Export `PetKind`, `PetStateId`, `PetNetTuple`, `PET_TUNING`. |
| `server/src/game/bansung/world.ts` | d04 hook | Call `stepPets(world, dt)` after player move & pickup spawn; include `player.pet` in `BansungFrame`. |
| `client/src/bansung/render.ts` | d41 hook | Insert each pet into Y-sorted pass at `sortY = pet.y` and call `drawPetCompanion`. |
| `client/src/bansung/sprites.ts` | d17 hook | Load `/database-ban-sung/normalized/pets/pet_{kind}_{action}.png`; fallback to `buildFallbackPetSheet`. |

## 3. Shared Types & Tuning Constants (`shared/src/bansung.ts`)
```ts
export type PetKind = 'tiger' | 'cat';
export type PetStateId = 0 | 1 | 2 | 3; // 0=idle, 1=trot, 2=pounce, 3=fire
/** Quantized per-player pet state in BansungFrame (~10 bytes/player/tick). */
export type PetNetTuple = readonly [x: number, y: number, state: PetStateId, left: 0 | 1];

export const PET_TUNING = {
  FOLLOW_X: 26,         // trailing offset behind hero facing (px)
  FOLLOW_Y: 14,         // slight lower Y offset for clean 2.5D layering
  SPRING_K: 42.0,       // spring stiffness (s^-2)
  DAMPING: 10.5,        // damping factor (zeta ~ 0.81, slight organic overshoot)
  MAX_SPEED: 340,       // catch-up cap (px/s)
  LEASH_MAX: 220,       // max combat distance from owner (px)
  TELEPORT_DIST: 360,   // hard snap to owner anchor if hero dashes/teleports
  MAGNET_RADIUS: 140,   // pickup attraction radius around living owner (px)
  MAGNET_PULL: 280,     // pickup pull speed toward owner (px/s)
  POUNCE_RANGE: 115,    // melee lunge trigger distance from pet (px)
  POUNCE_SPEED: 420,    // lunge burst speed (px/s)
  POUNCE_DUR: 0.36,     // seconds
  POUNCE_DMG: 9,        // Light affinity physical damage (d33)
  POUNCE_KNOCK: 90,     // mini knockback impulse (px/s)
  POUNCE_CD: 1.8,       // cooldown (s)
  FIRE_RANGE: 195,      // mini firebolt trigger distance from owner (px)
  FIRE_DUR: 0.24,       // cast pause (s)
  FIRE_DMG: 6,          // Fire/Light mini damage
  FIRE_SPEED: 380,      // projectile speed (px/s)
  FIRE_TTL: 0.65,       // projectile lifetime (s)
  FIRE_CD: 2.6,         // cooldown (s)
} as const;
```

## 4. Miragine-Style Frame Specs & Pixel Fallback (`client/src/bansung/petAnim.ts`)
Matches `MIRAGINE_ANIMS` tuple `[frames, cellW, cellH, offX, offY]` from `client/src/thap/sprites.ts`: native orientation faces **LEFT** (`left = true` at `scaleX = 1`), flipped via `ctx.scale(-scale, scale)` when facing right.

| Sheet Key | AnimMeta `[f, w, h, ox, oy]` | FPS | Frame Choreography |
| --- | --- | --- | --- |
| `pet_tiger_idle` | `[4, 32, 32, -16, -28]` | 5 | `f0`: neutral sit/stand; `f1`: ears twitch + chest `-1px`; `f2`: tail tip curls up; `f3`: blink (`#1b1412` slit) + settle |
| `pet_tiger_trot` | `[6, 32, 32, -16, -28]` | 12 | Miragine 6f cadence: `f0` front-paw plant, `f1` push-off, `f2` mid-bound (`-2px` Y), `f3` full stretch, `f4` rear tuck, `f5` soft land |
| `pet_tiger_pounce` | `[4, 32, 32, -16, -28]` | 14 | `f0` crouched coil; `f1` outstretched air lunge; `f2` claw-swipe flash (`#fff3bf` arc); `f3` landing recovery |
| `pet_tiger_fire` | `[3, 32, 32, -16, -28]` | 12 | `f0` cheeks puff (`+1px` orange glow); `f1` open-mouth ember spit; `f2` tiny head recoil |
| `pet_cat_{action}` | `[same, 32, 32, -16, -28]` | same | Identical strip geometry via palette LUT swap |

### Guaranteed Procedural Pixel Strip Fallback (Zero-Asset-Failure)
If `/database-ban-sung/normalized/pets/*.png` is absent or still loading, `buildFallbackPetSheet(kind, action)` generates an offscreen `HTMLCanvasElement` (`frames * 32` x `32`) once and caches it:
- **Tiger Palette**: `outline: '#1b1412'`, `coat: '#f59f00'`, `shade: '#d9480f'`, `stripe: '#3b2214'`, `belly: '#fff3bf'`, `nose: '#ff8787'`, `eye: '#1b1412'`.
- **Cat Palette**: `outline: '#1b1412'`, `coat: '#f8f9fa'`, `shade: '#dee2e6'`, `stripe: '#e8590c'` (calico patches), `belly: '#ffffff'`, `nose: '#ffa8a8'`, `eye: '#2b8a3e'`.
- Draws `1px` crisp pixel blocks (`fillRect`) for pointed ears, striped torso, `3px` animated tail curve, 4 articulated paws, and `2px` cheek/eye highlight so pets render cleanly offline or in headless tests.

## 5. Server Simulation Algorithms (`server/src/game/bansung/pet.ts`)
Per-pet server struct: `{ x, y, vx, vy, state, stateTimer, pounceCd, fireCd, left, targetId, hitDone }`.

1. **Downed Owner Override (`d07`)**:
   - If `owner.hp <= 0`, skip magnet and attacks; set `target = (owner.x + 22, owner.y + 10)`, run spring step, force `state = 0` (`idle`) once `speed < 20`.
2. **Pickup Magnet (`runPetMagnet`)**:
   - Scan pickups (`coin`, `energy_orb`, `hp_orb`, `armor_orb`; exclude `weapon_pedestal`) within `MAGNET_RADIUS` (`140px`) of `(owner.x, owner.y)`.
   - Skip `hp_orb` if `owner.hp >= owner.maxHp`, `armor_orb` if `owner.armor >= owner.maxArmor`, `energy_orb` if `owner.energy >= owner.maxEnergy`. Always attract `coin`.
   - Pull valid pickups toward `(owner.x, owner.y)` at `MAGNET_PULL` (`280 * dt`); capture when `dist <= 22px`. Track nearest pulled orb to bias pet target.
3. **Spring-Damper Follow**:
   - `facingX = owner.aimCos >= 0 ? 1 : -1` -> `anchor = (owner.x - facingX * FOLLOW_X, owner.y + FOLLOW_Y)`.
   - If attracting a pickup and not attacking, `target = lerp(anchor, nearestPickup, 0.35)`.
   - If `dist(pet, owner) > TELEPORT_DIST` (`360px`), snap `pet.(x, y) = anchor`, zero velocity, return.
   - Semi-implicit Euler (`dt = 1/30`):
     `ax = (target.x - x) * SPRING_K - vx * DAMPING`; `vx = clampLen(vx + ax * dt, MAX_SPEED)`; `x += vx * dt` (same for `y`).
   - Facing hysteresis: update `left = vx < 0` only when `|vx| > 14` (or face target during attack) to prevent sprite flip chatter.
4. **Mini Fire Support (`tryPetSupportAttack`)**:
   - **Priority 1 — Pounce (`POUNCE_CD = 1.8s`)**: Find nearest living enemy within `POUNCE_RANGE` (`115px`) of pet AND `LEASH_MAX` (`220px`) of owner. Enter `state = 2` (`0.36s`); for `t < 0.22s` steer velocity at `420 px/s` toward enemy. On first `dist <= 22px`, deal `9` Light dmg (`d33`) + `90 px/s` knockback + spawn `bite_spark` FX.
   - **Priority 2 — Mini Fire (`FIRE_CD = 2.6s`)**: If no pounce, find nearest enemy within `85..195px` of owner with clear LOS (`d05`). Enter `state = 3` (`0.24s`), face enemy, spawn `pet_ember` projectile (`6` dmg, `380 px/s`, `r = 5px`, `ttl = 0.65s`, 15% chance 1.5s burn `2 dmg/s`).

## 6. Client Visual Smoothing & 2.5D Rendering (`client/src/bansung/petAnim.ts`)
- **Interpolation & Motion**: Smooth `PetNetTuple` using the shared snapshot `alpha` (`d08`). Detect `state` transitions on client to trigger squash/stretch impulses (`sx, sy` decaying via `exp(-14 * dt)`):
  - Enter `pounce`: impulse `(0.80, 1.25)` at `t=0`, parabolic air arc `zArc = Math.sin(clamp(p / 0.72, 0, 1) * Math.PI) * 18` px, landing squash `(1.26, 0.76)` + spawn 2 tiny sand dust particles (`d42`).
  - Enter `fire`: impulse `(1.18, 0.85)`; projectile draws scaled Miragine `fireball.png` (`32x32` @ `0.5x`, `3f @ 16fps`) or glowing `#ff922b` pixel ember.
- **Trot Dust**: While `state === 1` (`trot`), emit `1` micro-dust pixel (`2x2` `#d9c39e`) every `160ms` at foot `(x, y)`.
- **Draw Order (Y-Sorted at `sortY = pet.y`)**:
  1. Ground shadow (`shadow.png` or `rgba(0,0,0,0.32)` ellipse `20x8` at `(pet.x, pet.y)`), shrunk by `1 - 0.35 * (zArc / 18)` during pounce.
  2. Faint dashed magnet sparkle tether (`2px` golden/cyan pixel dots) when a pickup is actively pulled within `140px`.
  3. Sprite frame drawn at `(pet.x, pet.y - zArc)` with `ctx.scale(left ? sx : -sx, sy)` and `offX = -16, offY = -28`.
  4. If owner is downed (`hp <= 0`), draw small pulsing `!` / heart pixel icon `32px` above pet.
