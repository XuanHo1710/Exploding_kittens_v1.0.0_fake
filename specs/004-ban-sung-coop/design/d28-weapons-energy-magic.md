# d28 — Energy & Magic Weapons (`ban_sung`)

## 1. Scope & Wave-2 Target Files
Defines the 4 Energy/Magic weapons matching the Soul Knight-inspired hotbar, reusing Miragine War projectile FX (`fireball.png`, `thunderball.png`, `storm.png` from `database-miraginewar/mapping.json`) alongside normalized pixel weapon sheets.

| Layer | Target File(s) | Responsibility |
| --- | --- | --- |
| Shared types & table | `shared/src/bansung-weapons.ts` (re-exported by `shared/src/bansung.ts`) | `EnergyMagicWeaponId`, `BansungWeaponSpec`, `ENERGY_MAGIC_WEAPONS`, FX/projectile enums |
| Server combat | `server/src/game/bansung/weapons-energy.ts` | Charge-release state, swept plasma step, railgun pierce raycast, homing + chain lightning, fireball split + burn |
| Client FX & render | `client/src/bansung/fx-energy.ts`, `client/src/bansung/render.ts`, `client/src/bansung/sprites.ts` | Miragine sprite sheet slicer (`fb`/`tb`/`storm`), additive railgun/arc shaders, orbiting tome rig |
| Assets & audio | `database-ban-sung/manifest.json`, `client/src/bansung/sound.ts` | Normalized weapon strips (`32x16`..`38x16`), hotbar `48x48` icons, `wpn_*` / `fx_*` SFX IDs |

## 2. Shared Schema & Weapon Roster
Extends the base weapon spec (`d26`/`d31`) and preserves Miragine's `[vsLight, vsArmored]` damage tuple (`shared/src/thap.ts`):

```ts
export type EnergyMagicWeaponId = 'plasma_rifle' | 'railgun_piercer' | 'lightning_staff' | 'arcane_book';
export type EnergyProjKind = 'plasma_bolt' | 'thunder_orb' | 'arcane_fireball' | 'arcane_ember';

export interface EnergyMagicWeaponSpec {
  id: EnergyMagicWeaponId;
  name: string;
  category: 'energy' | 'magic';
  tier: 'uncommon' | 'rare' | 'epic' | 'legendary';
  damage: [number, number];     // [vsLight, vsArmored]
  energyCost: number;           // Blue Energy consumed per shot (10 for full-charge railgun)
  magSize: number;
  reloadMs: number;
  fireIntervalMs: number;
  projKind: EnergyProjKind | 'rail_beam';
  projSpeed: number;            // px/s (0 = instant raycast)
  range: number;                // px
  projRadius: number;           // px hit radius (or beam half-width)
  spreadDeg: number;
  critChance: number;
  critMult: number;
  knockback: number;            // px impulse
  muzzleOffset: number;         // px from shoulder pivot
  kickPx: number;
  charge?: { minTapMult: number; minHoldMs: number; fullHoldMs: number; moveMult: number; fullStunMs: number };
  chain?: { maxHops: number; radius: number; dmgDecay: number; hitStunMs: number; hopStunMs: number };
  splash?: { radius: number; edgeRatio: number; splitCount: number; emberDmg: [number, number]; burnDps: number; burnMs: number };
  sfxFire: string;
  sfxHit: string;
}
```

| ID | Tier | Dmg `[L, A]` | Energy | Mag / Reload | ROF (`ms`) | Speed / Range | Crit | Special Mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `plasma_rifle` | Uncommon `#38bdf8` | `[18, 24]` | `2` | `24` / `1250ms` | `150` | `680` / `620` | `15% x1.8` | 2-substep swept bolt; crits apply `8 DPS` shock-burn `1.5s` |
| `railgun_piercer` | Epic `#a855f7` | `[62, 95]` | `6..10` | `6` / `1500ms` | `480` | Ray / `860` | `25%..50% x2.0` | Hold `100..650ms` charge (`0.78x` move); pierces up to `99` targets + `450ms` stun |
| `lightning_staff` | Rare `#60a5fa` | `[26, 36]` | `5` | `12` / `1350ms` | `360` | `460` / `560` | `18% x1.75` | Homing (`1.6 rad/s` in `55 deg` / `180px` cone); chains `3` hops (`150px`, `0.72x` decay) |
| `arcane_book` | Legendary `#fb923c` | `[44, 30]` | `7` | `10` / `1400ms` | `420` | `420` / `520` | `20% x1.8` | `58px` AoE splash (`0.6` edge) + `12 DPS` burn `2.5s` + `3` split embers (`[12,8]`) |

## 3. Authoritative Server Algorithms (30Hz, `dt = 1/30s`)
1. **Plasma Rifle (`plasma_rifle`)**:
   - Spawns `plasma_bolt` at `muzzlePos` with `angle + rng(-3.5, +3.5) deg`; deducts `2` energy & `1` mag.
   - Each tick advances `22.67px` using 2 swept capsule substeps (`d05` spatial hash) so bolts never tunnel through `r = 12..14px` mobs. On hit: apply Miragine affinity formula (`d33`), knockback `45px/s`, and emit `fx_plasma_spark`.
2. **Railgun Piercer (`railgun_piercer`)**:
   - Player holding fire enters `charging = true` (`moveSpeed *= 0.78`, max hold `0..650ms` stored on player state). Swapping, dashing, or stunned cancels charge with `0` energy spent.
   - On release: `q = clamp((holdMs - 100) / 550, 0, 1)`. Quick tap (`q === 0`) consumes `6` energy, deals `0.55x` damage, `pierce = 3`, `stunMs = 0`. Full charge (`q === 1`) consumes `10` energy, deals `1.0x` damage, `pierce = 99`, `+25%` crit, `stunMs = 450`, and triggers `30ms` hitstop on crit/multi-kill (`d21`).
   - Raycast `(muzzle -> muzzle + dir * 860)` against wall/cover AABBs (`d05`) to clamp `endDist`; query spatial grid segment capsule (`halfWidth = 10px`), sort hits by projection `t`, apply damage up to `pierce`, emit 1 delta FX event: `railBeam(x1, y1, x2, y2, Math.round(q * 255))`.
3. **Lightning Staff (`lightning_staff`)**:
   - `thunder_orb` steers each tick toward closest alive enemy with LOS inside `r <= 180px` and `dot(dir, toTarget) >= 0.57` (~`55 deg` half-cone), turning max `1.6 * dt` rad/tick.
   - On primary hit: deal `[26, 36]`, `stunMs = 280`, then run greedy chain loop (`hop = 1..3`): pick nearest unvisited enemy within `150px` of last node (with wall LOS check), apply `round(baseDmg * 0.72^hop)` + `120ms` stun (`d33` stun DR respected). Emit `chainArc([x0, y0, x1, y1, ...])` so client renders one connected arc sequence.
4. **Arcane Book Orb (`arcane_book`)**:
   - `arcane_fireball` travels at `420px/s`; on enemy or wall hit, evaluates `58px` AoE circle (`d05` LOS check per target) with linear radial falloff `lerp(1.0, 0.6, dist / 58)`, applies `burn` DOT (`12 DPS`, `2500ms`, `500ms` tick interval = `6` dmg/tick).
   - Emits `3` `arcane_ember` child bolts (`speed: 320`, `range: 95px`, `damage: [12, 8]`) fanned at `baseAngle + [-38, 0, +38] deg` (using reflected wall normal when impacting solid cover). Child embers do not re-split.

## 4. Netcode Delta FX & Quantization (`shared/src/bansung.ts`)
- Projectiles in `BansungFrame.p`: `[id, kindId, qx, qy, qAngle, flags]` where `kindId` maps `plasma_bolt: 10`, `thunder_orb: 11`, `arcane_fireball: 12`, `arcane_ember: 13`.
- One-shot delta FX tuples in `BansungFrame.fx`:
  - `FX_RAIL_BEAM`: `[type, x1, y1, x2, y2, chargeQ]` (12 bytes quantized `Int16`).
  - `FX_CHAIN_ARC`: `[type, count, x0, y0, x1, y1, ...]` (up to 4 nodes = 20 bytes).
  - `FX_ENERGY_BURST`: `[type, subKind(0=plasma,1=thunder,2=fire,3=stormCrit), x, y, radius]`.

## 5. Miragine FX Reuse & Weapon Rig Specs (`client/src/bansung/`)
Reuses verified assets from `database-miraginewar/mapping.json` (plus procedural Canvas 2D `'lighter'` glow):

| FX / Sprite | Source / Sheet Spec | Frame Timing & Draw Anchor | Visual Behavior |
| --- | --- | --- | --- |
| `thunder_orb` / sparks | `thunderball.png` (`128x128`, `16f`) | Flight: `f = 0..7` @ `24 FPS` (`0.34x`, `-64,-64`); Burst: `f = 8..15` once over `320ms` (`0.55x`; `0.28x` for plasma/rail sparks) | Additive `'lighter'` blend + `#e0f2fe` core dot |
| `arcane_fireball` / ember | `fireball.png` (`32x32`, `3f`) | Cycle `f = 0..2` @ `60ms/f` rotated by `atan2(vy, vx)`; primary `1.15x` (`37x37px`), ember `0.65x` (`21x21px`) | Dual trailing smoke/ember sparks; impact spawns `58px` radial burst (`380ms`) + scorch decal (`d42`) |
| `lightning` crit pillar | `storm.png` (`153x261`, `9f`, `offX:-8, offY:-4`) | Triggered on `lightning_staff` crit: `f = 0..8` over `360ms` at `0.42x`, foot anchor `(-76, -245)` | Brief vertical lightning strike above crit victim |
| `plasma_bolt` | Procedural Canvas 2D | `16x5px` rotated capsule (`#e7f5ff` core, `#22d3ee` halo) + `28px` fading tail ribbon | Cyan muzzle ring (`18px`, `90ms`) |
| `rail_beam` | Procedural Canvas 2D | `240ms` decay: 3-pass line (`14px` `#67e8f9` @ `0.35`, `6px` `#38bdf8`, `2.5px` `#ffffff`) + `28px` jitter nodes | While charging: `4..8` inward cyan particles converging on muzzle (`14px` ring at `q=1`) |
| `chain_arc` | Procedural Canvas 2D | `180ms` lifetime, 5-seg midpoint jitter (`±10px` perp, re-seeded at `20Hz`), `#7dd3fc` + `#ffffff` `2px` core | Connects hit node to each chained victim |
| Weapon held sheets | `database-ban-sung/sprites/weapons/*.png` | `plasma_rifle` (`32x16`, `2f`, pivot `(8,10)`, muzzle `(30,6)`); `railgun_piercer` (`38x16`, `3f` charge glow, pivot `(9,10)`, muzzle `(36,7)`); `lightning_staff` (`36x14`, `2f` crystal pulse, pivot `(10,7)`, muzzle `(34,7)`); `arcane_book` (`20x20`, `2f` page flutter, hover `offset 16px`, `±2.5px` `4Hz` bob, no kick) | Hotbar `48x48` icons with rarity frame + `-energy` badge (`d45`) |

## 6. Audio Hooks (`client/src/bansung/sound.ts`)
- `wpn_plasma_fire` (140Hz->60Hz zap + high-pass chirp), `wpn_rail_charge` (rising bandpass synth sweep synced to `0..650ms`), `wpn_rail_fire` (sub-bass thump + crisp crackle), `wpn_lightning_cast` & `fx_thunder_arc` (filtered noise snap + detuned square buzz), `wpn_arcane_cast` & `fx_fireball_boom` (whoosh + low-pass boom), all routed via `d43` spatial stereo panner (`max 8 voices`).
