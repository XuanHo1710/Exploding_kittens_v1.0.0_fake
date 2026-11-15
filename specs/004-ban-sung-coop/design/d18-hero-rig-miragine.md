# d18 — Hero Rig & Miragine-Style Sprite States (`ban_sung`)

## 1. Scope & Wave-2 Target Files
Defines the 4 playable co-op hero classes, Miragine-inspired frame-based state machine (`idle`, `run`, `shoot`, `dash`, `stunned`, `dead`), pixel grid/pivot rules, snappy run cadence, and fallback rendering.
- `shared/src/bansung.ts`: `HeroClassId`, `HeroVisualState`, `HERO_CLASSES` stats & rig metadata.
- `client/src/bansung/heroRig.ts`: `HERO_ANIM_SPECS`, `HERO_FRAME_MODS`, `resolveHeroAnim()`, `drawHeroRig()`, procedural pixel fallback.
- `client/src/bansung/render.ts`: Call `drawHeroRig()` in Y-sorted entity pass before `d19` shoulder-pivoted gun layer.
- `database-ban-sung/sprites/heroes/`: Normalized `48x48` horizontal strips (`<class>_<state>.png`) + `manifest.json` entries.

## 2. Playable Hero Classes (4 Classes)
All sprites share a dark `#1a1622` 1px pixel outline, expressive visor/eyes, and **armless front shoulder** so `d19` renders any equipped gun cleanly at `shoulderOffset`.

| `HeroClassId` | Display Name | Silhouette & Palette | HP | Armor | Energy | Speed (`px/s`) | Dash CD | Starter Weapon | Miragine Fallback |
|---|---|---|---:|---:|---:|---:|---:|---|---|
| `mascot_gunner` | Mascot Gunner | White hoodie + animal ears, sky-blue scarf (`#f8f9fa` / `#4dabf7`), screenshot hero | 6 | 5 | 180 | 195 | 1.10s | `assault_rifle` | `A0` |
| `cyber_ranger` | Cyber Ranger | Hooded recon cloak, neon-cyan visor (`#0f172a` / `#22d3ee`) | 5 | 4 | 200 | 220 | 0.85s | `burst_smg` | `A11` |
| `pyromancer` | Pyromancer | Crimson-gold alchemist hood, ember trim (`#c92a2a` / `#ff922b`) | 5 | 4 | 240 | 190 | 1.15s | `plasma_rifle` | `A5` |
| `knight` | Knight | Cobalt steel plate, gold horned helm & cape (`#3b5bdb` / `#fcc419`) | 7 | 7 | 160 | 178 | 1.25s | `pump_shotgun` | `A8` |

## 3. Normalized Sprite Grid, Anchors & Schema
Reuses the Miragine `AnimMeta` tuple (`[frames, cellW, cellH, offX, offY]` from `client/src/thap/sprites.ts`), normalized to a uniform `48x48` integer grid for all hero sheets:
- **Foot Pivot Anchor**: `(offX: -24, offY: -44)` leaves 4px bottom margin so boots sit centered on Miragine `shadow.png` (`38x16`, `offX: -19, offY: -8` in `database-miraginewar/mapping.json`).
- **Render Scale**: `HERO_PIXEL_SCALE = 1.5` (renders `48x48` cell as crisp `72x72` screen pixels with `ctx.imageSmoothingEnabled = false`).
- **Native Facing**: Custom normalized hero strips face **right** (`nativeFacing: 'right'`); `flipX = facingLeft ? -1 : 1`. Miragine fallback sheets (`A0/A1/A5/A8`) have `nativeFacing: 'left'`, so `flipX = (facingLeft !== (nativeFacing === 'left')) ? -1 : 1`.

```ts
export type HeroClassId = 'mascot_gunner' | 'cyber_ranger' | 'pyromancer' | 'knight';
export type HeroVisualState = 'idle' | 'run' | 'shoot' | 'dash' | 'stunned' | 'dead';

export interface HeroAnimSpec {
  frames: number;
  cellW: 48;
  cellH: 48;
  offX: -24;
  offY: -44;
  fps: number;
  loop: boolean;
  nativeFacing: 'right' | 'left';
}

export interface HeroRigProfile {
  id: HeroClassId;
  shoulderOffset: { x: number; y: number }; // relative to foot (x, y) in unflipped right-facing px
  headTopY: number;                         // anchor for d23 stun stars & d45 name/HP bar
  miragineFallbackId: 'A0' | 'A11' | 'A5' | 'A8';
  primaryHex: string;
  accentHex: string;
}

export const HERO_ANIM_SPECS: Record<HeroVisualState, HeroAnimSpec> = {
  idle:    { frames: 4, cellW: 48, cellH: 48, offX: -24, offY: -44, fps: 6,    loop: true,  nativeFacing: 'right' },
  run:     { frames: 6, cellW: 48, cellH: 48, offX: -24, offY: -44, fps: 14,   loop: true,  nativeFacing: 'right' },
  shoot:   { frames: 3, cellW: 48, cellH: 48, offX: -24, offY: -44, fps: 24,   loop: false, nativeFacing: 'right' },
  dash:    { frames: 4, cellW: 48, cellH: 48, offX: -24, offY: -44, fps: 14.3, loop: false, nativeFacing: 'right' },
  stunned: { frames: 2, cellW: 48, cellH: 48, offX: -24, offY: -44, fps: 10,   loop: true,  nativeFacing: 'right' },
  dead:    { frames: 4, cellW: 48, cellH: 48, offX: -24, offY: -44, fps: 10,   loop: false, nativeFacing: 'right' },
};

export const HERO_RIG_PROFILES: Record<HeroClassId, HeroRigProfile> = {
  mascot_gunner: { id: 'mascot_gunner', shoulderOffset: { x: 4, y: -17 }, headTopY: -40, miragineFallbackId: 'A0',  primaryHex: '#f8f9fa', accentHex: '#4dabf7' },
  cyber_ranger:  { id: 'cyber_ranger',  shoulderOffset: { x: 5, y: -18 }, headTopY: -41, miragineFallbackId: 'A11', primaryHex: '#1e293b', accentHex: '#22d3ee' },
  pyromancer:    { id: 'pyromancer',    shoulderOffset: { x: 4, y: -17 }, headTopY: -41, miragineFallbackId: 'A5',  primaryHex: '#c92a2a', accentHex: '#ff922b' },
  knight:        { id: 'knight',        shoulderOffset: { x: 5, y: -19 }, headTopY: -43, miragineFallbackId: 'A8',  primaryHex: '#3b5bdb', accentHex: '#fcc419' },
};
```

## 4. State Machine & Miragine-Style Frame Cadence
### State Resolution Priority
1. **`dead` (`hp <= 0`)**:
   - **Downed (Co-op Revivable, `d07`)**: Plays `dead` frames `0 -> 1 -> 2` over `300ms` and **holds frame `2`** (kneeling/slumped with faint alpha pulse `0.78 + 0.14 * sin(now/220)`) while revive timer > 0.
   - **Eliminated**: Advances to frame `3` (prone silhouette) and fades to `0.55` alpha corpse decal.
2. **`stunned` (`stunMs > 0`)**: Alternates `stunned` frames `0 <-> 1` every `100ms` (Miragine freeze-jitter: `dx = (Math.floor(now / 50) % 2 === 0 ? -2 : 2)` px, `sx = 0.96, sy = 1.04`). Syncs with `d23` overhead stars at `y + profile.headTopY - 6`.
3. **`dash` (`dashAgeMs < 280`)**: 4-frame burst over `DASH_DUR_MS = 280` (`d20`):
   - `f0` (`0..55ms`): Launch crouch (`sx: 1.15, sy: 0.85, dy: +2`)
   - `f1` (`55..155ms`): Horizontal lunge (`sx: 1.26, sy: 0.78, dy: -2`)
   - `f2` (`155..230ms`): Airborne roll/tuck (`sx: 0.94, sy: 1.06, dy: -3`)
   - `f3` (`230..280ms`): Landing brake (`sx: 1.08, sy: 0.92, dy: 0`, emit dust puff)
4. **`run` (`moveSpeed > 12 px/s`) — 6-Frame Snappy Miragine Cadence**:
   - Distance + time phase: `phase += movedPx * 0.07 + dt * 10.5`; resets `phase = 0` on `idle -> run` transition for instant contact step.
   - `frame = Math.floor(phase) % 6`. Per-frame squash/stretch & bob (`HERO_RUN_CADENCE`):
     - `f0` (Contact L): `dy: 0, sx: 1.04, sy: 0.96` — emit foot dust & soft step SFX
     - `f1` (Down/Push): `dy: +1, sx: 1.06, sy: 0.94`
     - `f2` (Pass High): `dy: -2, sx: 0.95, sy: 1.05`
     - `f3` (Contact R): `dy: 0, sx: 1.04, sy: 0.96` — emit foot dust & soft step SFX
     - `f4` (Down/Push): `dy: +1, sx: 1.06, sy: 0.94`
     - `f5` (Pass High): `dy: -2, sx: 0.95, sy: 1.05`
5. **`shoot` Kick Overlay (`shootAgeMs < 125`)**:
   - When **stationary**, switches base sheet to `shoot` (`f0: 0..35ms`, `f1: 35..80ms`, `f2: 80..125ms`).
   - When **moving**, keeps `run` legs so run-and-gun never freezes stride, and applies kick transform (`kick = 1 - shootAgeMs / 125`, `dx = -aimSign * 3 * kick`, `rot = -aimSign * 0.08 * kick`, `sx = 1 + 0.08 * kick`, `sy = 1 - 0.07 * kick`) shared with `d19` shoulder pivot.
6. **`idle` (default)**: 4-frame gentle breathing loop at `6 fps` (`Math.floor(now / 167 + heroId * 1.3) % 4`): `f0` neutral, `f1` subtle settle (`+1px` torso), `f2` visor blink / cape sway, `f3` inhale recover.

## 5. Rendering Order, Hit-Flash & Fallback Chain
1. **Ground Shadow**: Draw `shadow.png` (`w: 32, h: 13`, `alpha: 0.55`) + subtle team color ring under `(x, y)` before sprite.
2. **Afterimages (`d20`)**: While `dash`, draw 3-4 tinted ghosts using the active `dash` frame (`alpha: 0.45 -> 0.12`).
3. **Sprite Lookup Fallback Chain** (never renders blank):
   - **Tier 1**: `/database-ban-sung/sprites/heroes/<class>_<state>.png` (`HERO_ANIM_SPECS[state]`).
   - **Tier 2**: `/database-miraginewar/sheets/<miragineFallbackId>_<idle|run|attack|dead>.png` via `MIRAGINE_ANIMS` (`dash` maps to `run` + squash/stretch; `stunned` maps to `idle` + jitter; `shoot` clamps `attack` `f0..2`).
   - **Tier 3**: Procedural canvas pixel-hero fallback (1px `#1a1622` outline, class headgear ears/hood/horn, `primaryHex` torso, `accentHex` visor/scarf, 2px alternating feet on `run`).
4. **White Hit-Flash**: When `hitFlashMs > 0`, draw cached solid-white silhouette from `d17` offscreen tint cache at `globalAlpha = 0.85` over the exact resolved `(sheetKey, frameIdx)` transform.
