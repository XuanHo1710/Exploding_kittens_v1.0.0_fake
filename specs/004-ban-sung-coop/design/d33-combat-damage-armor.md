# d33: Combat Damage, Armor Shield, Crits, Stun DR & DOTs

## 1. Wave-2 Target Files
- `shared/src/bansung.ts` — Combat enums/types (`BansungArmorType`, `BansungDamageKind`, `BansungDotKind`, `BansungDmgFlags`), `BANSUNG_AFFINITY`, `BANSUNG_SHIELD`, `BANSUNG_STUN_DR`, `BANSUNG_DOTS`, and pure `calcBansungDamage()` helper.
- `server/src/game/bansung/combat.ts` — Authoritative 30Hz combat resolver: `applyBansungDamage()`, `tickHeroShield()`, `applyStunWithDR()`, `applyDot()`, `tickStatuses()`, and quantized `BansungDmgEvent` emission.
- `server/src/game/bansung/world.ts` — Tick integration hooks calling `tickHeroShield()` & `tickStatuses()` per 33ms step and routing projectile/melee/explosion hits through `applyBansungDamage()`.

## 2. Shared Schemas & Constants (`shared/src/bansung.ts`)
Adapts Miragine War (`shared/src/thap.ts`) `light`/`armored` affinity & `flatArmor` (`0..4`) onto Soul Knight's two-layer HP + regenerating Shield soak at integer scale (Heroes `60-90 HP / 40-70 Shield`, Mobs `40-350 HP`, Bosses `1800-4500 HP`, Guns `8-85 dmg`).

```ts
export type BansungArmorType = 'light' | 'armored'; // 0 = light, 1 = armored
export type BansungDamageKind = 'kinetic' | 'pierce' | 'explosive' | 'energy' | 'fire' | 'melee' | 'true';
export type BansungDotKind = 'burn' | 'poison' | 'shock' | 'bleed';
export type BansungEntityTier = 'hero' | 'mob' | 'elite' | 'boss';

export const BANSUNG_ARMOR_ID: Record<BansungArmorType, 0 | 1> = { light: 0, armored: 1 };

/** [vsLight, vsArmored] multipliers inspired by Miragine War counter matrix */
export const BANSUNG_AFFINITY: Record<BansungDamageKind, readonly [number, number]> = {
  kinetic:   [1.00, 0.85], // balanced; crits ignore +2 flatArmor
  pierce:    [0.90, 1.25], // anti-armor; ignores 100% flatArmor
  explosive: [1.00, 1.30], // crushes armored + 1.25x shield dmg
  energy:    [1.10, 1.15], // 1.25x bonus vs Shield before HP spill
  fire:      [1.25, 0.80], // shreds light swarms, weak vs heavy plating
  melee:     [1.15, 0.95], // strong cleave vs unarmored mobs
  true:      [1.00, 1.00], // bypasses flatArmor
};

export const BANSUNG_SHIELD = {
  REGEN_DELAY_MS: 3200,      // reset on any hit (2200ms with Fast Shield perk)
  REGEN_INTERVAL_MS: 750,    // +10 shield per tick while timer == 0 & alive
  REGEN_AMOUNT: 10,
  HERO_HP_IFRAMES_MS: 250,   // prevents multi-pellet/swarm 1-tick deletion on HP loss
  DASH_IFRAMES_MS: 280,      // full dodge invulnerability (d20)
  HIT_FLASH_MS: 90,          // ~3 frames at 30Hz white offscreen tint
} as const;

export const BANSUNG_BASE_CRIT_MULT = 1.5;

export const BANSUNG_STUN_DR = {
  MULTS: [1.0, 0.5, 0.25, 0] as const, // stage 0..2 scale, stage 3 = immune
  RESET_MS: 10_000,                    // boss reset = 12_000ms
  IMMUNE_MS: 4000,                     // stage 3 lockout; hero post-stun = 2500ms
  TIER_MULT: { hero: 0.70, mob: 1.00, elite: 0.65, boss: 0.35 } as const,
  TIER_MAX_MS: { hero: 1000, mob: 3000, elite: 1200, boss: 900 } as const,
} as const;

export const BANSUNG_DOTS: Record<BansungDotKind, {
  durMs: number; tickMs: number; baseDmg: number; stackStep: number; maxStacks: number; kind: BansungDamageKind;
}> = {
  burn:   { durMs: 3000, tickMs: 500, baseDmg: 6, stackStep: 2, maxStacks: 3, kind: 'fire' },
  poison: { durMs: 4000, tickMs: 500, baseDmg: 5, stackStep: 2, maxStacks: 3, kind: 'true' },   // also +15% vulnMult
  shock:  { durMs: 2500, tickMs: 500, baseDmg: 4, stackStep: 1, maxStacks: 2, kind: 'energy' }, // chains 50% dmg <=96px
  bleed:  { durMs: 3000, tickMs: 500, baseDmg: 5, stackStep: 2, maxStacks: 3, kind: 'true' },   // +50% if moving
};

export const BANSUNG_DMG_FLAG_CRIT = 1;
export const BANSUNG_DMG_FLAG_SHIELD = 2;
export const BANSUNG_DMG_FLAG_BREAK = 4;
export const BANSUNG_DMG_FLAG_IMMUNE = 8;
export const BANSUNG_DMG_FLAG_DOT = 16;

export interface BansungDamageHit {
  baseDmg: number;
  dmgKind: BansungDamageKind;
  affinity?: readonly [number, number]; // optional weapon override [vsLight, vsArmored]
  armorPen?: number;
  critChance?: number;
  critMult?: number;
  isDot?: boolean;
  bypassShield?: boolean;
  attackerId?: string;
}

export function calcBansungDamage(
  baseDmg: number, dmgKind: BansungDamageKind, targetArmorType: BansungArmorType,
  flatArmor: number, opts?: { affinity?: readonly [number, number]; armorPen?: number; critMult?: number; vulnMult?: number },
): number;
```

## 3. Damage, Crit, Shield Soak & Regen Algorithm
1. **Invulnerability Gate**: If target is `dead` / `downed` or (`!hit.isDot && (dashIframesMs > 0 || hitIframesMs > 0)`), return `{ hpDmg: 0, shieldDmg: 0, blocked: true }`.
2. **Crit Roll** (non-DOT hits): `effCrit = clamp((hit.critChance ?? 0) + atkCritBonus, 0, 0.85)`. Roll `isCrit = rng() < effCrit`. `cMult = isCrit ? (hit.critMult ?? BANSUNG_BASE_CRIT_MULT) + atkCritDmgBonus : 1.0`.
3. **Affinity & Flat Armor** (matching `miragineDamage` in `shared/src/thap.ts`):
   - `aff = (hit.affinity ?? BANSUNG_AFFINITY[hit.dmgKind])[BANSUNG_ARMOR_ID[target.armorType]]`.
   - `vuln = target.dots.poison ? 1.15 : 1.0`.
   - `pen = (hit.armorPen ?? 0) + (isCrit && hit.dmgKind === 'kinetic' ? 2 : 0)`.
   - `effArmor = (hit.dmgKind === 'pierce' || hit.dmgKind === 'true') ? 0 : Math.max(0, target.flatArmor - pen)`.
   - `raw = Math.max(1, Math.round(hit.baseDmg * aff * cMult * vuln - effArmor))`.
4. **Soul Knight Shield Soak**:
   - If `target.tier === 'hero'`, reset `target.shieldDelayMs = target.regenDelayMs` (`3200ms`, or `2200ms` with Fast Shield perk) on any hit.
   - If `target.shield > 0 && !hit.bypassShield`:
     - `shieldMult = (hit.dmgKind === 'energy' || hit.dmgKind === 'explosive') ? 1.25 : 1.0`.
     - `effAgainstShield = Math.max(1, Math.round(raw * shieldMult))`.
     - `shieldDmg = Math.min(target.shield, effAgainstShield)`.
     - `target.shield -= shieldDmg`; `brokeShield = target.shield === 0`.
     - Overflow to HP: `rem = brokeShield ? Math.max(0, Math.round(raw * (1 - shieldDmg / effAgainstShield))) : 0`.
     - **Strong Shield Guard (Soul Knight Blue Shield perk)**: if `brokeShield && target.strongShield`, clamp `rem = 0` (absorbs 100% of breaking burst!).
   - Else `shieldDmg = 0; rem = raw`.
5. **HP Application & I-Frames**:
   - `hpDmg = Math.min(target.hp, rem)`; `target.hp -= hpDmg`.
   - If `target.tier === 'hero' && hpDmg > 0 && !hit.isDot`, grant `target.hitIframesMs = BANSUNG_SHIELD.HERO_HP_IFRAMES_MS` (`250ms`).
   - Set `target.hitFlashMs = BANSUNG_SHIELD.HIT_FLASH_MS` (`90ms`).
   - Emit quantized popup `[targetId, hpDmg || shieldDmg, flags, dmgKindIdx]` (cap 16/frame in `BansungFrame.fx`).
6. **Hero Shield Regen (`tickHeroShield(hero, dtMs)`)**:
   - Skip if `!hero.alive || hero.downed || hero.shield >= hero.maxShield`.
   - Decrement `hero.shieldDelayMs = Math.max(0, hero.shieldDelayMs - dtMs)`; when `0`, accumulate `hero.shieldRegenAccMs += dtMs` and add `BANSUNG_SHIELD.REGEN_AMOUNT` (`10`) every `750ms` up to `hero.maxShield`.

## 4. Stun Diminishing Returns (DR) & DOT Tick Rules
**Stun (`applyStunWithDR(target, rawMs)`)**:
- Ignore if `target.ccImmune` (boss dash/phase transition) or `target.stunImmuneMs > 0` (emit `BANSUNG_DMG_FLAG_IMMUNE` popup).
- `stage = target.stunDrStage`; `mult = BANSUNG_STUN_DR.MULTS[stage]`.
- `scaled = Math.min(BANSUNG_STUN_DR.TIER_MAX_MS[target.tier], Math.round(rawMs * mult * BANSUNG_STUN_DR.TIER_MULT[target.tier]))`.
- If `stage >= 3 || scaled < 150`: trigger `target.stunImmuneMs = BANSUNG_STUN_DR.IMMUNE_MS`, return `0`.
- Apply `target.stunMs = Math.max(target.stunMs, scaled)`, `target.stunDrStage = Math.min(3, stage + 1)`, `target.stunDrResetMs = target.tier === 'boss' ? 12_000 : BANSUNG_STUN_DR.RESET_MS`.
- On hero stun expiry (`stunMs` reaches `0`), auto-grant `target.stunImmuneMs = 2500` to prevent stunlock deaths.

**DOTs (`tickStatuses(entity, dtMs)`)**:
- Each entity holds `dots: Partial<Record<BansungDotKind, { stacks: number; leftMs: number; accMs: number; attackerId?: string }>>`.
- `applyDot(target, kind, attackerId)`: check perk ward (`fire_ward` blocks `burn`, `toxin_ward` blocks `poison`); else refresh `leftMs = cfg.durMs`, `stacks = Math.min(cfg.maxStacks, prev + 1)`.
- Per 33ms tick: decrement `leftMs -= dtMs`; accumulate `accMs += dtMs`; when `accMs >= cfg.tickMs`:
  - `accMs -= cfg.tickMs`; compute `dmg = cfg.baseDmg + (stacks - 1) * cfg.stackStep` (`* 1.5` for `bleed` if `entity.speed > 20`).
  - Route through `applyBansungDamage(target, { baseDmg: dmg, dmgKind: cfg.kind, isDot: true, bypassShield: target.tier !== 'hero', attackerId })`.
  - If `kind === 'shock'`, arc `Math.round(dmg * 0.5)` energy damage to 1 nearest foe within `96px` (no recursive chain).

## 5. Miragine-Style Frame & Client FX Cues
- **Hit Flash**: `90ms` (`3` ticks @ 30Hz) solid `#ffffff` silhouette tint in `d17` offscreen cache.
- **Stun Freeze-Jitter (`BANSUNG_FLAG_STUN`)**: Miragine-style horizontal pixel jitter `dx = ((tick >> 1) & 1 ? -1.5 : 1.5)` px + 3 orbiting 8x8 pixel stars above sprite head (`y - spriteH - 4`, `600ms` orbit).
- **Damage Popup Palette (`d41` outline pixel font)**: White `#fff` (normal), Gold-Orange `#ffa94d` + 1.25x scale (crit), Cyan `#4dabf7` (shield soak/break), Lime `#74b816` (poison), Ember `#ff6b6b` (burn), Gray `#adb5bd` (`IMMUNE` / resisted).
