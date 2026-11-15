# d30 — Active Gadgets: Bombs, Stun, Deployable Turret & Healing Drone

**Wave-2 Target Files:** `shared/src/bansung_gadgets.ts` (exported via `shared/src/bansung.ts`), `server/src/game/bansung/gadgets.ts`, `client/src/bansung/gadgets_fx.ts` (consumed by `render.ts` & `sprites.ts`), HUD/Input hooks in `d44`/`d45`.

## 1. Shared Schema & Gadget Catalog (`shared/src/bansung_gadgets.ts`)
Triggered via **Q** or **RightClick** (`BansungCommand` `{ t: 'gadget'; aimX: number; aimY: number }`). Bombs use `2` charges + shared Energy (`d31`); deployables allow `1` active (`2` with Perk `d32`) and replace the oldest when re-cast.

```ts
export type BansungGadgetId = 'stun_bomb' | 'cluster_he' | 'auto_turret' | 'heal_drone';
export const BANSUNG_GADGET_IDS: readonly BansungGadgetId[] = ['stun_bomb', 'cluster_he', 'auto_turret', 'heal_drone'];
export const GADGET_TICK_HZ = 30; // 33.33ms per server tick

export interface BansungGadgetDef {
  id: BansungGadgetId;
  idx: 0 | 1 | 2 | 3;
  kind: 'thrown' | 'deployable';
  energyCost: number;
  cooldownTicks: number; // per-charge recharge at 30Hz
  maxCharges: number;
  maxActive: number;
  minRange: number;
  maxRange: number;
  radius: number;
  damage: [light: number, armored: number]; // Miragine-style armor affinity (d33)
  stunTicks?: number;
  durationTicks?: number;
}

export const BANSUNG_GADGETS: Record<BansungGadgetId, BansungGadgetDef> = {
  stun_bomb:   { id: 'stun_bomb',   idx: 0, kind: 'thrown',     energyCost: 15, cooldownTicks: 240, maxCharges: 2, maxActive: 4, minRange: 48, maxRange: 340, radius: 135, damage: [22, 14], stunTicks: 66 },
  cluster_he:  { id: 'cluster_he',  idx: 1, kind: 'thrown',     energyCost: 25, cooldownTicks: 360, maxCharges: 2, maxActive: 6, minRange: 56, maxRange: 320, radius: 105, damage: [65, 95] },
  auto_turret: { id: 'auto_turret', idx: 2, kind: 'deployable', energyCost: 30, cooldownTicks: 480, maxCharges: 1, maxActive: 1, minRange: 24, maxRange: 72,  radius: 290, damage: [14, 18], durationTicks: 540 },
  heal_drone:  { id: 'heal_drone',  idx: 3, kind: 'deployable', energyCost: 25, cooldownTicks: 540, maxCharges: 1, maxActive: 1, minRange: 0,  maxRange: 48,  radius: 190, damage: [0, 0],   durationTicks: 420 },
};

// Quantized frame strides in BansungFrame:
// gProj (7 ints): [id, ownerIdx, type(0=stun,1=cluster,2=sub), x, y, z, fusePct(0..100)]
// gDep  (8 ints): [id, ownerIdx, type(0=turret,1=drone), x, y, hpPct, aimDeg, (activeBit<<8)|lifePct]
// Private HUD slice in BansungFrame.me.gadget:
export interface BansungGadgetHud {
  id: BansungGadgetId;
  charges: number;
  maxCharges: number;
  cdLeftMs: number;
  cdTotalMs: number;
  active: number;
}

// One-shot delta FX events emitted in BansungFrame.fx:
export type GadgetFxType = 'stun_blast' | 'cluster_blast' | 'turret_thunder' | 'drone_pulse';
```

## 2. Gadget Mechanics & Balance Constants

### A. Concussion Stun Bomb (`stun_bomb` — 8.0s CD, 15 Energy, 2 charges)
- **Trajectory:** Parabolic Z-arc (`flightTicks = clamp(round(dist / 420 * 30), 10, 24)`, `peakZ = 56px`); bounces once for `4` ticks (`0.13s`) before detonating, or explodes immediately (`fuse = 0`) on direct contact with Elite/Boss.
- **Crowd Control & Interrupt:** Within `135px` + wall LOS (`d05`), applies stun: `66` ticks (`2.2s`) on mobs, `42` ticks (`1.4s`) on Elites, `24` ticks (`0.8s`) interrupt on Bosses, governed by Stun Diminishing Returns (`100% -> 50% -> 25% -> 0%` within `8s`, `d33`). Cancels Sniper laser locks, Shaman casts, and resets Bomb Goblin fuses; leaves `45` ticks (`1.5s`) `-35%` enemy accuracy debuff.

### B. Cluster HE Bomb (`cluster_he` — 12.0s CD, 25 Energy, 2 charges)
- **Primary Blast:** `flightTicks = 12..26` (`peakZ = 64px`), `6`-tick (`0.20s`) ground pulse telegraph (`d24`). Detonates in `105px` (`65/95` Light/Armored dmg, `240 px/s` knockback, ignites barrels).
- **Cluster Split:** Spawns **5 sub-bomblets** at `theta0 + i * (2*PI/5) + rand(-0.22, 0.22)` flying `55..95px` over `11..15` ticks (`peakZ = 34px`, staggered `+0..4` ticks fuse). Each sub-bomblet hits `68px` (`[32, 45]` dmg, `130 px/s` knockback). Multi-hit clamp: `100%` first bomblet, `50%` subsequent, max `3` bomblet hits per target per cast.

### C. Deployable Miragine Auto-Turret (`auto_turret` — 16.0s CD, 30 Energy, 18.0s life)
- **Body & Aggro:** Placed `28px` ahead along aim (pushed out of AABB walls). `180 HP` (`armored`, `armor: 1`), `14px` collision radius. Soft decoy: enemies only aggro turret if no alive player is within `90px`.
- **Targeting & Overcharge:** Scans spatial hash every tick (`range = 290px`, wall raycast LOS). Applies `15%` distance hysteresis to current target to prevent jitter. Fires every `7` ticks (`4.28/s`, bullet `680 px/s`, spread `0.04 rad`, `[14, 18]` dmg). Every **6th shot** fires an overcharged **Thunderball** (`[28, 34]` dmg + `48px` splash + `14`-tick `0.45s` mini-stun). Explodes on expiry/death (`[25, 30]` dmg in `60px`).

### D. Co-op Healing Drone (`heal_drone` — 18.0s CD, 25 Energy, 14.0s life)
- **Follow Physics:** Hovers at `z = 26 + 3 * sin(t * 2*PI*2)` around owner (`desired = owner + (-cos(aim)*24, -sin(aim)*24)`), critically damped spring `pos += (desired - pos) * 0.18` per tick.
- **Co-op Support:** Every `10` ticks (`0.33s`), tethers lowest `hp/maxHp` ally (or turret at `50%` rate) within `190px` for **+4 HP & +2 Armor** (`12 HP/s`, `6 Armor/s`; `+15%` when `>= 2` players within `150px`).
- **Revive & Energy Synergy:** Tethered **Downed** ally (`d07`) bleeds out `50%` slower and revives `+25%` faster. Every `105` ticks (`3.5s`), emits a `150px` cyan-green pulse granting **+6 Energy** (`d31`) to teammates inside.

## 3. Authoritative Server Loop (`server/src/game/bansung/gadgets.ts`)
```ts
export interface PlayerGadgetSlot {
  id: BansungGadgetId;
  charges: number;
  cdTicksLeft: number; // ticks until +1 charge
}
export interface GadgetProjState {
  id: number; ownerIdx: number; kind: 0 | 1 | 2; clusterGroupId: number;
  sx: number; sy: number; tx: number; ty: number; x: number; y: number; z: number;
  tick: number; flightTicks: number; fuseTicks: number; peakZ: number;
}
export interface GadgetDeployableState {
  id: number; ownerIdx: number; kind: 0 | 1; // 0=turret, 1=drone
  x: number; y: number; z: number; hp: number; maxHp: number;
  lifeTicks: number; maxLifeTicks: number; aimRad: number;
  actionCdTicks: number; shotSeq: number; targetId: number; pulseTicks: number;
}

// Executed inside world.ts 30Hz step after player commands & before enemy AI:
// 1. Activate: reject if player.downed || player.stunTicks > 0 || slot.charges < 1 || player.energy < def.energyCost.
//    Deduct energy & 1 charge; start cdTicksLeft = round(def.cooldownTicks * perkCdMult) if not already ticking.
// 2. Aim clamp & wall pullback: clamp dist to [minRange, maxRange]; binary-step 4x from player -> target
//    to pull landing/deploy coords out of solid wall AABBs (d05).
// 3. Deploy replacement: if active count >= maxActive (1, or 2 with Perk d32), pop oldest owner deployable first.
// 4. Parabolic Z & Cluster: p.tick++; t = min(1, p.tick / p.flightTicks); p.z = round(4 * p.peakZ * t * (1 - t));
//    On t >= 1, count down fuseTicks; at 0, run spatial-hash AoE + raycastLOS; cluster_he spawns 5 kind=2 sub-bomblets
//    sharing clusterGroupId with Map<enemyId, hitCount> clamp (1st=100%, 2nd..3rd=50%, >=4 ignored).
// 5. Recharge: if (slot.charges < effMaxCharges) { slot.cdTicksLeft--; if (slot.cdTicksLeft <= 0) { slot.charges++; slot.cdTicksLeft = effCd; } }
```

## 4. Miragine-Style Frame Specs & Client VFX (`client/src/bansung/gadgets_fx.ts`)
Integrates with `database-miraginewar/mapping.json` (`shadow.png`, `fireball`, `thunderball`, `storm`, `A_crystal`/`A7`) and `database-ban-sung/sprites/gadgets/` (`d09`, `d14`, `d17` procedural fallback):

| Asset / Effect | Source / Strip Spec | Frames & Anchor (`offX, offY`) | Playback & Rendering Rule |
|---|---|---|---|
| Ground Shadow | `/database-miraginewar/structures/shadow.png` (`38x16`) | `1f`, `(-19, -8)` | Scale `max(0.35, 1 - z/120)`, alpha `0.35` at `y` |
| Stun / Cluster Bombs | `gadgets/bombs.png` (`32x32` cells) or `fireball` | `4f` spin (`0=stun, 1=he, 2=sub`), `(-16, -16)` | Draw at `(x, y - z)`; rotate `tick * 0.35 rad` |
| Stun Core Arc | `/database-miraginewar/projectiles/thunderball.png` (`128x128`) | `16f`, `(-64, -64)` (`0..5` burst) | Additive blend, `scale 0.55`, paired with `d23` ring |
| Cluster Blast | `/database-miraginewar/projectiles/fireball.png` (`32x32`) | `3f`, `(-16, -16)` + `d24` blast pool | Additive burst + scorch decal + `40ms` hitstop (`>=4` kills) |
| Miragine Auto-Turret | `A_crystal` (`96x144`, `scale 0.36`) + `A7_attack` (`41x56`, `6f`) / `gadgets/turret.png` (`48x48`) | Base `(-17, -52)` + barrel pivot `(-10, -28)` | `6f` recoil snap on shot; `6th` shot emits `thunderball` (`0.28x`) |
| Co-op Healing Drone | `gadgets/heal_drone.png` (`32x32`) + `storm` (`153x261`, `9f`) | Drone `4f` (`8 FPS`, `(-16, -16)`); aura `(-76, -240)` | Draw at `(x, y - z)`; dashed `#69db7c` tether; `storm` (`0.3x`) on pulse |

## 5. Audio & HUD Contracts (`d43`, `d44`, `d45`)
- **SFX Event IDs (`d11`, `d43`):** `gadget_throw`, `gadget_stun_pop`, `gadget_cluster_boom`, `gadget_turret_deploy`, `gadget_turret_shot`, `gadget_turret_thunder`, `gadget_drone_deploy`, `gadget_drone_pulse` (`8`-voice cap, stereo pan by screen X).
- **HUD (`d45`) & Controls (`d44`):** Dedicated Gadget slot (`Q` / `RMB` / mobile touch button) displays active icon, charge pips (`1..2`), radial cooldown sweep, and Energy cost badge (`15..30`).
