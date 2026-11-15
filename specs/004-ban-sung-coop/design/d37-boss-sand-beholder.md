# d37 — Boss 1: Sand Beholder / King Cactus (`boss_sand_beholder`)

## 1. Identity, Scaling & Combat Profile
Inspired directly by the Soul Knight desert cactus/beholder boss aesthetic and Miragine War's `30Hz` frame-stepped animation system. Serves as the **Wave 4 Desert Ruins Boss** (and Endless Wave `4 + 10k`).

- **ID / Name**: `boss_sand_beholder` (*Sand Beholder — King Cactus* / *Nhãn Ma Xương Rồng*)
- **Armor Affinity (Miragine-style)**: `armorType: 'armored'` (`armorTypeID: 1`), flat `armor: 2` per hit (min `1` dmg); takes bonus damage from Explosive/Rail/Energy weapons (`d33`).
- **Hitbox & Physics**: Circle `radius: 34px`, `mass: 999` (knockback-immune), spawn at `(arenaW * 0.5, arenaH * 0.35)` with `27 ticks` (`0.9s`) invulnerable intro roar.
- **Co-op HP Scaling**: `maxHp = Math.round(2400 * (1 + 0.65 * (playerCount - 1)) * diffMult)` (`diffMult`: Easy `0.8`, Normal `1.0`, Hard `1.35`, Insane `1.75`; e.g., 4-player Normal = `7080 HP`).
- **Stun DR / Stagger Gauge**: Immune to hard-stun lock. Player stun hits add stagger points (`max: 100`, decay `8/s`). Reaching `100` interrupts non-invuln windups for `45 ticks` (`1.5s`) **Staggered** (`+25%` damage taken, orbiting stars), followed by `300 ticks` (`10s`) stagger immunity.
- **Rewards**: Drops `8` Energy Orbs + `12` Coins + `1` Rare/Epic Weapon Pedestal (`d32`); `+1500` score.

## 2. Miragine-Style Sprite & Animation Spec
- **Sheet**: `/database-ban-sung/sprites/bosses/sand_beholder.png` (`96x96` integer cells, `offX: -48, offY: -86` foot anchor, 1px `#1b1412` outline, Desert LUT `#2f6b3c`/`#4d9b4d`/`#d9a441`/`#ff4d2e`).
- **Ground Shadow**: Reuses `/database-miraginewar/structures/shadow.png` (`38x16`) drawn at `2.4x` (`91x38`) beneath `(x, y)`; boss sprite elevates by `-zOffset` during leap slam.
- **Hit Flash**: `2 ticks` (`66ms`) cached offscreen white tint silhouette (`d17`).

| State | Frames | `frameTicks` (30Hz) | Loop | Visual & Gameplay Cue |
| :--- | :---: | :---: | :---: | :--- |
| `idle` | 4 | 5 | Yes | Pulsing cactus ribs, blinking magma central eye |
| `move` | 6 | 4 | Yes | Heavy root-stomp waddle; sand dust puff on f2, f5 |
| `volley_cast` | 5 | 3 | No | Crown thorns flare outward; spawns bullets on f3 |
| `slam_leap` | 6 | 4 | No | f0-1 coil, f2-3 hop (`z = 44*sin(pi*u)`), f4 impact, f5 recover |
| `beam_windup` | 4 | 5 | f2-3 | Eye dilates amber-magenta; sweeps f2-3 during `beam_sweep` |
| `enrage_roar` | 5 | 4 | No | Husk splits at 50% HP; crown ignites fiery orange |
| `stagger` | 3 | 6 | Yes | Slumped wobble + orbiting stun stars (`d23`) |
| `dead` | 6 | 5 | No | Stone-cactus shatter + persistent crater decal (`d42`) |

- **Procedural Fallback (`render.ts`)**: If sheet isn't loaded, draw ribbed cactus octo-body (`r=34`), 3-prong gold crown, radial spine spikes, and cyclops eye tracking `aimAngle` so gameplay never blocks.

## 3. Two-Phase 30Hz Authoritative FSM
```ts
export type BeholderState =
  | 'intro' | 'move' | 'volley_cast' | 'slam_leap'
  | 'beam_windup' | 'beam_sweep' | 'enrage_roar' | 'stagger' | 'dead';

export interface BossSandBeholderState {
  id: string; x: number; y: number; z: number; vx: number; vy: number;
  hp: number; maxHp: number; phase: 1 | 2; state: BeholderState;
  stateTick: number; aimAngle: number; sweepDir: 1 | -1;
  volleyCd: number; slamCd: number; beamCd: number; lastMove: string;
  slamStartX: number; slamStartY: number; slamTargetX: number; slamTargetY: number;
  slamBounceLeft: 0 | 1; stagger: number; staggerImmuneTicks: number;
  targetId: string | null; retargetTicks: number; summonIds: string[];
}

export const BOSS_BEHOLDER_CFG = {
  radius: 34, baseHp: 2400, armor: 2,
  p1MoveSpeed: 72, p2MoveSpeed: 96, // px/s
  p1RecoveryTicks: 27, p2RecoveryTicks: 17,
  volleyCdTicks: 108, slamCdTicks: 180, beamCdTicks: 225,
  beamRange: 640, beamHalfW: 12, slamRadiusP1: 155, slamRadiusP2: 170,
  maxAdds: 4, staggerMax: 100, staggerDecayPerSec: 8,
} as const;
```
- **Steering & Target Selection**: Retargets every `45 ticks` (or immediately if target downed/unseen `>90 ticks`) toward highest-threat alive hero. Moves using boids/LOS steering (`d05`/`d36`), maintaining `190-280px` preferred range; faces `Math.cos(aimAngle) < 0 ? 'left' : 'right'` (Miragine native-left flip).
- **Deck Rule**: On `move` recovery end (`stateTick <= 0`), picks off-cooldown attack prioritizing `slam_leap` if any alive hero `<220px`, else rotates `volley_cast` / `beam_windup` (never repeats `lastMove` back-to-back).
- **Stagger & Death Cancellation**: Entering `stagger` or `dead` immediately zeros `vx/vy/z` and clears active `boss_beam` / `telegraph_circle` telegraphs so no ghost hits occur.

### Phase 1 (`100% -> 50% HP`)
1. **Radial Thorn Volley (`volley_cast`, 28 ticks)**:
   - Windup `15 ticks` (`0.5s`, orange glow ring `r=48px`).
   - Tick 15 fires Ring A: `12` thorns (`30°` step, `speed: 240 px/s`, `r: 7px`, `dmg: 14`, `ttl: 84 ticks`).
   - Tick 26 (`+11 ticks`) fires Ring B: `12` thorns offset `+15°`. Solid ruins/pillars block thorns; breakable crates take damage.
2. **Seismic Slam Stun Shockwave (`slam_leap`, 26 ticks)**:
   - Picks nearest alive hero clamped to `220px` leap distance; clamps `(slamTargetX, slamTargetY)` inside arena bounds and outside solid cover AABBs (`d05`). Emits pulsing red telegraph ring (`r: 155px`) at landing point.
   - Lerps `(x, y)` from `slamStart` to `slamTarget` with `z = 44 * Math.sin(Math.PI * (tick / 26))`; boss stays hittable at ground `(x, y)` so player shots never whiff unfairly.
   - Impact (tick 26): AoE check (`r <= 155px`): `26` dmg (`r <= 85px`) / `16` dmg (`85 < r <= 155px`), knockback `260 px/s`, applies **`33 ticks` (`1.1s`) Stun** unless target is in dash i-frames (`d20`). Spawns `4` diagonal rock shards (`200 px/s`, `dmg: 10`) and shockwave ring VFX.
3. **Cyclops Eye-Beam Sweep (`beam_windup` 27 ticks -> `beam_sweep` 42 ticks)**:
   - Windup (`0.9s`): Boss roots (`vx=vy=0`), picks hero angle `theta0`, sets `sweepDir = Math.sign(cross(toTarget, targetVel)) || 1`, starts at `aimAngle = theta0 - sweepDir * 42°`. Client renders pulsing red laser sight (`len: 640px`).
   - Active Sweep (`1.4s`): Sweeps `84°` at `60°/s` (`2.0°/tick`). Every `3 ticks`, server clips `hitDist = raycastSolid(x, y, aimAngle, 640)` (`d05`) and tests alive heroes via `distPointToSegment(p.x, p.y, x, y, x + cos*hitDist, y + sin*hitDist) <= 12 + p.radius`. Hits deal `9` dmg (`90 DPS`) + `12 ticks` (`0.4s`) burn (`4 DPS`). Solid desert pillars block the beam behind `hitDist`.

### Phase 2 Transition & Enrage (`<= 50% HP`)
- **Transition (`enrage_roar`, `36 ticks`)**: Triggers once when `hp <= maxHp * 0.5`. Invulnerable roar, `140px` non-damaging pushback, sets `phase = 2`, sheds outer husk, and spawns **`2` Desert Scarabs + `1` Cactus Spitter** (`d34`/`d35`, pruning dead IDs from `summonIds` and capping at `4` active boss adds).
- **Permanent Buffs**: Move speed `96 px/s`, recovery `17 ticks`, all attack cooldowns `* 0.8`.
- **Upgraded Attacks**:
  - `volley_cast` (`34 ticks`): Fires `3` rapid spiral rings at ticks `14, 22, 30` (`14` thorns each, `+12°` twist per ring, `270 px/s`, `dmg: 16`).
  - `slam_leap`: **Double-Leap Slam** (`slamBounceLeft = 1`): Slam 1 (`24 ticks`, `r=170px`) -> `10 ticks` crouch -> Slam 2 (`24 ticks`) tracking nearest non-stunned hero (`36 ticks` / `1.2s` stun, emits `6` cactus spikes per slam).
  - `beam_sweep` (`42 ticks`): Sweeps `105°` at `75°/s` (`2.5°/tick`) + emits `6` slow sand-spark orbs (`130 px/s`, `dmg: 12`) perpendicular to `aimAngle` every `7 ticks`.

## 4. Network Sync, VFX & Audio Hooks
- **Quantized `BansungFrame` Entity**: `kind: 'boss_sand_beholder'`, `x, y, hp, maxHp, phase: 1|2, state, stateTick, aimAngleMrad` (`Math.round(aimAngle * 1000)`), `z` (for hop arc), `staggerPct`, `isBoss: true` (drives HUD boss bar in `d45`).
- **Delta FX / Telegraph Events**:
  - `telegraph_circle`: `{ x, y, r, ttlMs, color: '#ff3b30' }` (slam landing zone)
  - `boss_beam`: `{ bossId, x, y, angleMrad, len, width, active }` (`active=false` = 1.5px laser warning; `active=true` = 24px magma beam + white core, `len` already pillar-occluded by server)
  - `fx_shockwave`: `{ x, y, r, color: '#f59e0b' }` (slam impact + camera trauma `+0.6`)
- **Audio IDs (`d43` / `d11`)**: `boss_roar_cactus`, `boss_volley_fire`, `boss_slam_impact`, `boss_beam_charge`, `boss_beam_loop`, `boss_death_shatter`.

## 5. Wave-2 Target Files & Verification
- `shared/src/bansung.ts`: Add `'boss_sand_beholder'` kind, `BOSS_BEHOLDER_CFG`, `BossTelegraph` / `BossBeamFrame` types.
- `server/src/game/bansung/bosses/sandBeholder.ts`: Implement 2-phase 30Hz FSM, stagger gauge, spiral volley, double-leap slam stun, pillar-clipped beam raycast, Phase 2 add summons.
- `client/src/bansung/sprites.ts` & `client/src/bansung/render.ts`: Normalized `96x96` strip slicer, Z-hop over scaled Miragine shadow, laser-to-beam renderer, procedural fallback.
- `client/src/bansung/sound.ts`: Hook 6 boss SFX events + procedural WebAudio synth fallbacks.
- `server/test/bansung.test.cjs`: Test co-op HP scaling, 50% HP Phase 2 transition, dash i-frame dodging slam stun, and pillar LOS occlusion blocking `eye_beam_sweep`.
