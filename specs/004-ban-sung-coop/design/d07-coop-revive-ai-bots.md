# d07 — Co-op Downed/Revive Circle & AI Companion Bot (`ban_sung`)

## 1. Wave-2 Target Files
- `shared/src/bansung.ts`: `BansungLifeState`, `BansungReviveRule`, `BansungBotLevel`, revive constants, `revives` stat field.
- `server/src/game/bansung/bot.ts`: Co-op companion AI (`BotBrain`, `createBotBrain`, `runBansungBot`).
- `server/src/game/bansung/world.ts`: Tick integration (`stepDownedAndRevive`, wave-clear respawn, party-wipe check, bot step).
- `server/src/game/game.ts`: Spawning `bot:bs<idx>` allies in `startBansung()` (mirrors `startThap()`).
- `client/src/bansung/render.ts` & `client/src/bansung/sound.ts`: Downed crawl/slump frames, revive ring, off-screen pointer, SFX.

---

## 2. Shared Types & Constants (`shared/src/bansung.ts`)

```ts
export type BansungLifeState = 'alive' | 'downed' | 'dead';
export type BansungReviveRule = 'circle' | 'wave_only' | 'hardcore';
export type BansungBotLevel = 'easy' | 'normal' | 'hard';

export const BANSUNG_TICK_HZ = 30;
export const BANSUNG_REVIVE_RADIUS = 72;      // px center-to-center circle radius
export const BANSUNG_CRAWL_MULT = 0.28;       // downed movement speed multiplier
export const BANSUNG_REVIVE_DECAY_S = 0.45;   // progress loss/s when ring has 0 rescuers
export const BANSUNG_REVIVE_INVULN_S = 2.0;   // post-revive i-frames
export const BANSUNG_REVIVE_PUSH_R = 110;     // AoE knockback radius on revive completion
export const BANSUNG_DOWN_PENALTY_S = 3;      // -3s max bleedout per repeat down in same wave
export const BANSUNG_MIN_BLEEDOUT_S = 8;

export const BANSUNG_REVIVE_PRESETS: Record<BansungReviveRule, {
  bleedoutS: number; reviveTimeS: number; waveRespawnHpPct: number;
}> = {
  circle:    { bleedoutS: 18, reviveTimeS: 2.6, waveRespawnHpPct: 0.5 },
  wave_only: { bleedoutS: 24, reviveTimeS: 1.8, waveRespawnHpPct: 1.0 },
  hardcore:  { bleedoutS: 12, reviveTimeS: 3.2, waveRespawnHpPct: 0 }, // 0 = no wave respawn
};
```

Quantized frame fields per player (`BansungFrame.p`): append `life: 0 | 1 | 2` (`alive|downed|dead`), `bleedPct: 0..100`, `revPct: 0..100`, and `rescuers: 0..3` so client renders arcs with zero guesswork.

---

## 3. Downed, Bleedout & Revive Circle Algorithm (`world.ts`)

1. **Entering Downed State** (instead of instant death when `hp <= 0` from `life === 'alive'`):
   - Set `life = 'downed'`, `hp = 0`, `armor = 0`, `downCountWave++`, `reviveProg = 0`.
   - `bleedMax = max(BANSUNG_MIN_BLEEDOUT_S, preset.bleedoutS - BANSUNG_DOWN_PENALTY_S * (downCountWave - 1))`; `bleedLeft = bleedMax`.
   - Cancel active reload/dash/charge; mobs immediately drop aggro on `downed` players if any `alive` player exists.
   - Downed player may crawl (`speed * 0.28`) toward cover/allies; cannot shoot, dash, or use skills.
2. **Per-Tick Revive & Bleedout (`dt = 1 / 30`)**:
   - Count `rescuers` = alive teammates (human or bot) with `dist(ally, target) <= BANSUNG_REVIVE_RADIUS` (auto-channel: no button lock so rescuers can still aim/shoot while dodging inside the ring; dashing out ends channel).
   - If `rescuers.length > 0`:
     - **Bleedout pauses** (`bleedLeft` frozen so 98% revives never fail unfairly).
     - Speed multiplier: `mult = min(2.0, 1 + 0.45 * (rescuers.length - 1))`.
     - `reviveProg += (dt / preset.reviveTimeS) * mult`; track per-rescuer contribution ticks.
     - If `reviveProg >= 1`: set `life = 'alive'`, `hp = ceil(maxHp * 0.45)`, `armor = ceil(maxArmor * 0.5)`, `invulnTimer = 2.0`, `reviveProg = 0`; push non-boss enemies within `110px` outward; credit `stats.revives += 1` to top contributor; emit delta FX `revive`.
   - Else (`rescuers.length === 0`):
     - `reviveProg = max(0, reviveProg - BANSUNG_REVIVE_DECAY_S * dt)`.
     - `bleedLeft -= dt`; if `bleedLeft <= 0`, transition `life = 'dead'`, `reviveProg = 0`, emit delta FX `player_dead` (client camera switches to spectator follow).
3. **Wave Clear & Party Wipe**:
   - **Party Wipe**: If `players.every(p => p.life !== 'alive')`, match ends in Defeat (everyone downed simultaneously cannot self-revive).
   - **Wave Clear**: Reset `downCountWave = 0` for all players; if `preset.waveRespawnHpPct > 0`, revive any `'downed' | 'dead'` player at base/host position with `hp = ceil(maxHp * waveRespawnHpPct)`, `armor = maxArmor`, `invulnTimer = 2.0`.

---

## 4. Miragine-Style Frame & Client Visual Specs (`render.ts` & `sound.ts`)

- **Downed Sprite Pose**: Drawn in Y-sorted entity pass above `shadow.png` (`scale 0.85`): uses 2-frame `downed` sprite state (`4 fps` when crawling, static frame `0` when idle) or fallback `0.55x` Y-squashed hurt frame with dark-red outline pulse.
- **Revive Circle**: Ground-layer ring (`r = 72px`) below units:
  - Waiting: pulsing dashed amber/red border + inner bleedout pie arc (`bleedPct`) + `"CỨU! {s}s"`.
  - Channeling: solid `#51cf66` glow border + clockwise progress arc (`revPct`, `lineWidth = 4px`) + `"x2"` badge when `rescuers >= 2`.
- **Off-Screen Indicator & SFX**: Edge directional arrow + timer badge when a `downed` ally is off-camera; `sound.ts` plays `sfx_downed` alert, subtle `sfx_revive_tick` hum, and `sfx_revive_done` chime.

---

## 5. Co-op AI Companion Bot (`server/src/game/bansung/bot.ts`)

### Bot Identity & Difficulty Profiles
- Spawned as `bot:bs0..N` in `startBansung()` with distinct hero class/color (`THAP_COLORS`/`BANSUNG_COLORS`) to fill squad up to configured co-op size (`1..4`).
- `BotBrain` holds `{ level, state, strafeDir, strafeFlipAt, nextThinkTick, stuckPos, stuckAt, unstuckUntil, unstuckAngle, targetId }`.

| `botLevel` | Think Interval | Aim Jitter | Velocity Lead | Dash Reflex | Revive Priority |
|---|---|---|---|---|---|
| `easy` | `6` ticks (200ms) | `±10.0°` | `0.0` | `0.4` (late) | `0.6` (fights first if mob close) |
| `normal` | `3` ticks (100ms) | `±4.5°` | `0.65` | `0.8` | `1.0` (prioritizes rescue safely) |
| `hard` | `2` ticks (66ms) | `±1.5°` | `1.0` | `1.0` | `1.4` (immediate triage & cover) |

### Decision Loop (`runBansungBot(world, bot, dt)`)
Output is fed into the exact same `applyPlayerInput()` validation path as human `BansungCommand`s:
1. **Emergency Dash (`dash`)**: If inside an active boss/caster telegraph circle/beam or projectile within `75px` moving toward bot (and `dashCd <= 0`), dash perpendicular to threat vector using 5-ray obstacle clearance (`64px`) so bot never dashes into walls.
2. **Revive Priority (`rescue`)**: Score every `downed` ally: `(human ? 1.35 : 1.0) * level.revivePriority / max(2, bleedLeft)`. Enter `rescue` if any valid target exists and (`botHpPct > 0.22 || bleedLeft < 6`).
   - Steer to `dist <= 52px` of downed ally (buffer inside `72px` ring).
   - **Fight-Inside-Ring**: Once inside `72px`, orbit gently within `40..62px` to dodge projectiles **without breaking channel**, continuously aiming & firing at nearest threat (`<= 420px`). Temporarily step out to kite only if `armor === 0 && hp < 30%` and `bleedLeft > 5s`.
3. **Kiting & Cover (`kite`)**:
   - Sum inverse-square repulsion from mobs inside weapon `minSafeDist` (`140px` melee, `220px` Bomb Goblin/Boss) + 5-ray AABB wall-avoidance (`0°, ±35°, ±70°`) + tangential strafe `perp(dir) * strafeDir` (flips every `1.2–2.2s` or on wall clip).
   - When targeted by Red-Laser Sniper telegraph or `armor === 0`, bias steering behind nearest solid rock/pillar LOS cover.
4. **Loot & Regroup (`loot` / `combat`)**:
   - Grab `hp`/`energy`/`armor` drops within `280px` when no melee mob is within `110px`.
   - Maintain weapon ideal range (`shotgun: 150px`, `rifle: 280px`, `sniper: 400px`); if `> 420px` from closest alive human and idle, regroup to `200px`.
5. **Targeting, Aiming & Resources**:
   - Score targets (`bomber/sniper: 1.6`, `caster: 1.3`, `melee: 1.0`, `boss: 1.15`, `barrel: 1.5 if >=2 mobs within 120px and 0 allies`) `/ max(60, dist)` with `+35%` bonus for clear LOS and `+30%` if threatening a downed ally.
   - Lead target (`pos + vel * (dist / projSpeed) * lead`), add Gaussian jitter; swap to `0`-energy slot 0 if `energy < 20%`, reload when `clip <= 20%` and safe, trigger skill (`Q`) when `>= 3` mobs cluster or ally `< 55%` HP.
   - **Anti-Stuck**: If `moved < 10px` over `0.8s` while moving, pick widest open ray among 8 directions and steer `0.5s` (or `dash` free).
