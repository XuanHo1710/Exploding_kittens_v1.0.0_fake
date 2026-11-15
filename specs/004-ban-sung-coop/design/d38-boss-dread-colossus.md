# d38 — Boss 2: Dread Colossus (`dread_colossus`)

## 1. Concept & Miragine War Homage
- **Role**: Wave 7 Siege Boss (and Endless boss rotation) for `ban_sung` co-op mode (`30 Hz` authoritative server tick, `33.33 ms/tick`).
- **Homage**: Fuses Miragine War's **Dread Lord** (`id: 14`, `ss: 13`, `A13_*` crimson dark-knight juggernaut, `88 px/s` base speed) with **Iron Knight** (`id: 13`, `ss: 3`, `B3_*` armored escorts) as orbiting **Iron Aegis Shield Drones**.
- **Core Loop**: Relentless armored boss (`armor: 4`) that alternates **Heavy Dash Charges**, **Mortar Bomb Barrages**, and **Dread Cleaves**. Every heavy action builds **Heat (`0..100`)**; baiting dashes into arena walls or shattering its **Shield Drone Phalanx** spikes Heat to `100`, forcing an **Overheat Stun Window** (`0` armor, `1.5x` damage taken, guaranteed weak-point crits).

## 2. Shared Schema & Constants (`shared/src/bansung.ts`)
```ts
export type ColossusState =
  | 0  // march
  | 1  // cleave_windup
  | 2  // cleave_hit
  | 3  // dash_windup
  | 4  // dash_charge
  | 5  // dash_recover
  | 6  // mortar_windup
  | 7  // mortar_barrage
  | 8  // drone_summon
  | 9  // overheat_stun
  | 10; // dead

export interface BansungBossView {
  id: number;
  kind: 'sand_beholder' | 'dread_colossus' | 'overlord_core';
  x: number; y: number;
  vx: number; vy: number;
  facingLeft: boolean;
  hp: number; maxHp: number;
  shieldHp: number;      // total remaining HP of active shield drones (0 = unshielded)
  heat: number;          // 0..100 quantized gauge
  state: number;         // ColossusState (uint8)
  stateTick: number;     // ticks elapsed in current state for deterministic frame sync
  aimDeg?: number;       // locked dash/cleave angle (int16 deg)
}

export const DREAD_COLOSSUS_CFG = {
  baseHp: 3600,          // scaled: baseHp * (1 + 0.65 * (players - 1)) * diffMult
  radius: 34,
  walkSpeed: 86,         // px/s (matches Miragine moveSpeed 2.25 * 1.3 * 30 ≈ 88)
  shieldWalkSpeed: 55,
  armorNormal: 4,
  armorStunned: 0,
  stunDmgMult: 1.5,
  shieldDr: 0.85,        // 85% DR while >= 1 shield drone alive
  cleaveRange: 105,
  cleaveArcDeg: 120,
  cleaveDmg: 34,
  dashSpeed: 680,        // px/s
  dashMaxTicks: 18,      // 0.60s -> max ~408px
  dashWindupTicks: 24,   // 0.80s (tracks first 8t, locks last 16t)
  dashDmg: 42,
  dashHeat: 25,
  wallCrashHeat: 35,
  mortarRadius: 72,
  mortarFlightTicks: 42, // 1.40s airtime
  mortarDmg: 36,
  mortarHeat: 30,
  dronePhaseHps: [0.55, 0.25] as const,
  droneOrbitRadius: 95,
  droneOrbitRadPerS: 1.6,
  droneBaseHp: 320,      // scaled: 320 * (1 + 0.45 * (players - 1)) * diffMult
  droneTimeoutTicks: 660, // 22s anti-softlock failsafe
  stunTicksP1: 120,      // 4.0s
  stunTicksP2: 90,       // 3.0s (<25% HP)
  stunTicksShatter: 135, // 4.5s on full drone phalanx shatter
} as const;
```

## 3. State Machine & Combat Algorithms (`30 Hz` Authoritative)
1. **Priority Selector (when in `march`)**:
   - Check HP threshold triggers (`<= 55%` first time, `<= 25%` second time) -> enter `drone_summon` (`20 ticks`, pushes players back to `140 px`, spawns `3` drones at `55%` or `4` drones at `25%`).
   - If `heat >= 100` -> enter `overheat_stun`.
   - If `mortarCd <= 0` (CD `225t / 7.5s` in P1; `165t / 5.5s` in P2) -> enter `mortar_windup`.
   - If `dashCd <= 0` (CD `150t / 5.0s` in P1; `120t / 4.0s` in P2) and any alive player in `120..560 px` -> enter `dash_windup`.
   - If nearest alive player `dist <= 95 px` and `cleaveCd <= 0` (`54t / 1.8s`) -> enter `cleave_windup` (`12t` windup -> `12t` swing, hits once in `120°` cone at frame `2`, `+10` Heat).
   - Else steer toward nearest alive player using `d05` sliding AABB collision.

2. **Heavy Dash Charge (`dash_windup` -> `dash_charge` -> `dash_recover`)**:
   - **Aim & Lock**: Targets farthest alive player in `120..560 px`. Re-aims during ticks `0..7`, locks `aimDeg` on tick `8` through `23` (`0.53 s` pure dodge window) while broadcasting a lane telegraph (`width: 68 px, len: 480 px`).
   - **Charge Sweep**: Moves `dashSpeed / 30` (`22.67 px/tick`) using `d05` swept circle-vs-AABB check. Tracks `hitPlayerIds` Set so each player takes `42` damage + `140 px` knockback at most once per dash.
   - **Wall-Crash Mechanic**: If swept move hits a solid wall/pillar (`blocked === true`), cancels remaining dash, triggers `75 px` debris shockwave (`20` dmg), adds **`+35` Heat** (vs `+25` normal), and jumps to `dash_recover` (`15t`).
   - **Phase 2 Double Charge**: Below `55%` HP, if dash 1 finished without wall-crash and `heat < 100`, chains a second `dash_windup` (short `14t` lock) toward current target before `dash_recover`.

3. **Mortar Bomb Barrage (`mortar_windup` -> `mortar_barrage`)**:
   - **Salvo Count**: `4` shells in P1, `6` shells in P2 (`18t` windup, shells launch `4t` apart).
   - **Predictive + Zoning Placement**: First `min(alivePlayers, 3)` shells aim at `player.pos + player.vel * 0.45`, clamped inside arena walkable bounds. Extra shells scatter `110..260 px` radially around players/boss.
   - **Resolution**: Server queues `MortarHazard { x, y, ticksLeft: 42, radius: 72 }`. On `ticksLeft === 0`, applies `d33` AoE explosive check (`1.0x` dmg `<= 36 px`, `0.6x` dmg `36..72 px`, `90 px` knockback) and adds `+30` Heat (`+30` once per barrage).

4. **Shield Drone Phase (`iron_drone` Escorts)**:
   - Drones spawn as regular entities in `BansungFrame.enemies` (`kind: 'iron_drone'`, `armorType: 'armored'`, `armor: 2`) orbiting at `(boss.x + cos(θ)*95, boss.y + sin(θ)*95)`, evenly spaced `2π / count`.
   - While `activeDrones > 0`: boss `shieldDr = 0.85` (blocks crits), boss walks slowly (`55 px/s`) and fires single `thunderball` bolts every `54t` (`18 dmg`, `340 px/s`). Every `72t`, one drone pauses `12t` and fires a 3-bolt fan (`14 dmg`).
   - **Shatter**: When last drone dies, `boss.hp -= 180`, `heat = 100`, immediate transition to `overheat_stun` (`135t / 4.5s`). If `droneTimeoutTicks` expires, remaining drones self-destruct and boss enters brief `60t / 2.0s` stun.

5. **Overheat Stun Window (`overheat_stun`)**:
   - Enters whenever `heat >= 100` (outside `drone_summon`/`dead`). Boss stops moving/attacking for `stunTicks`, drops `armor: 4 -> 0`, sets `damageTakenMult = 1.5`, and enables weak-point crits on every hit.
   - On exit: `heat = 0`, emits `110 px` radial steam vent (`10` dmg, `60 px` pushback) preceded by `15t` steam ring telegraph.

## 4. Miragine-Style Frame & Rendering Specs
All Miragine sheets use native **LEFT** facing (`scaleX = +scale`; flip right with `ctx.scale(-scale, scale)` around foot `(x, y)` per `client/src/thap/sprites.ts`):
- **Boss (`A13_*` Dread Lord sheets at `scale = 2.0`, `shadow.png` at `2.2x`)**:
  - `idle`: `/database-miraginewar/sheets/A13_idle.png` (`3f, 81x63, offX: -54, offY: -62`, `5t/f`).
  - `march`: `/database-miraginewar/sheets/A13_run.png` (`6f, 103x55, offX: -65, offY: -55`, `3t/f`).
  - `dash_charge`: alternates `A13_run` frames `[2, 3]` (`2t/f`) + 3 fading crimson afterimage trails.
  - `cleave` / `mortar`: `/database-miraginewar/sheets/A13_attack.png` (`4f, 112x96, offX: -64, offY: -96`; windup holds `f0..f1`, impact `f2`, recover `f3`).
  - `overheat_stun`: holds `/database-miraginewar/frames/A13_dead_0.png` (`91x61, offX: -56, offY: -56`) with `±1px` jitter, additive orange core glow, and spinning overheat stars.
  - `dead`: `A13_dead.png` (`3f, 91x61`) + staggered explosion sprites.
- **Shield Drones (`B3_*` Iron Knight sheets at `scale = 0.85`, hover `y - 10px`)**:
  - `B3_idle.png` (`3f, 58x53`), `B3_run.png` (`6f, 64x61`), `B3_attack.png` (`4f, 93x60`), `B3_dead.png` (`3f, 86x66`), plus cyan energy tether line to boss center & rotating hex barrier around boss while active.
- **Projectiles**: Mortar shell uses `/database-miraginewar/projectiles/fireball.png` (`3f, 32x32` at `1.3x` scale, `arcZ = 4 * 140 * t * (1 - t)`) over growing red target circle (`r: 0 -> 72 px`). Drone/boss barrier bolt uses `/database-miraginewar/projectiles/thunderball.png` (`16f, 128x128` at `0.38x`).

## 5. Exact Wave-2 Target Files
- `shared/src/bansung.ts`: Add `'dread_colossus'`, `ColossusState`, `BansungBossView`, `DREAD_COLOSSUS_CFG`, telegraph struct.
- `server/src/game/bansung/bosses/dreadColossus.ts`: Implement 30Hz FSM, dash wall-crash, mortar queue, drone orbit/tether & overheat stun.
- `server/src/game/bansung/world.ts`: Spawn/tick Dread Colossus on Wave 7, handle `iron_drone` death hook & mortar AoE damage.
- `client/src/bansung/sprites.ts`: Register `A13_*` / `B3_*` `AnimMeta` & preload entries for boss + drones.
- `client/src/bansung/render.ts`: Draw dash lane telegraph, afterimages, parabolic mortar shells/rings, drone tethers, hex shield & overheat visuals.
- `client/src/bansung/sound.ts`: Add cues (`boss_charge_horn`, `boss_wall_crash`, `mortar_launch`, `mortar_explode`, `shield_up`, `shield_shatter`, `boss_overheat_hiss`).
- `client/src/components/BansungBoard.tsx`: Render secondary Heat (`0..100%`) bar and Shield Drone counter under Boss HP HUD bar.
