# d13: Miragine Asset Audit & Reuse Plan (`database-miraginewar` -> `ban_sung`)

## 1. Audit Summary (`database-miraginewar/mapping.json`)
- **Inventory verified on disk (0 missing paths)**:
  - `engine`: `fps: 30`, `nativeFacingDirection: "left"`, `moveSpeedMultiplier: 1.3`, `rangeMultiplier: 60`, `weaponSpeedMultiplier: 20`.
  - `structures` (4 PNGs), `terrains` (2 JPGs), `projectiles` (3 horizontal strips), `units` (16 units `id: 0..15`, `ss: 0..15`), `animations` (131 entries = 128 `{A|B}{0..15}_{idle|run|attack|dead}` + 3 projectiles), `sheets/` (128 PNG strips), `frames/` (590 PNGs), `portraits/` (32 PNGs).
  - `ui`: 10 mapped in `mapping.json` + **2 unmapped on disk**: `bar_frame.png` (`285x18`, already used in `thap/render.ts`) and `cursor_p1.png` (`39x38`).
  - `audio`: 13 mapped in `mapping.json` + **1 unmapped on disk**: `sound_34.mp3` (`2085 B`, same size as `SD_btns.mp3`).
- **Licensing & Deduplication Rule**: `mapping.json` originates from Flash SWF (`mws_10.swf`) and is already served statically at `/database-miraginewar/*`. **Do NOT copy Flash binaries into `database-ban-sung/sprites/`** (keep `database-ban-sung/` & `LICENSES.md` 100% clean OSS CC0/MIT). Instead, **alias reusable assets by `/database-miraginewar/...` URL** in `database-ban-sung/manifest.json` (`origin: "repo-miraginewar"`).

---

## 2. Asset Reuse Matrix (Tiered)

| Category | Asset Path (`/database-miraginewar/...`) | Size / Sheet Spec | Reuse Tier | `ban_sung` Role & Pivot / Render Notes |
|---|---|---|---|---|
| Structure | `structures/shadow.png` | `38x16` (`offX:-19, offY:-8`) | **Tier 1 (Direct)** | Universal ground shadow under players, bots, mobs, turrets, crates, bosses (`globalAlpha: 0.55`, scaled by `radius * 2.2`). |
| Projectile | `projectiles/fireball.png` | `96x32` (`3f`, `32x32`) | **Tier 1 (Direct)** | Pyro Shaman firebolts, Fire Staff/Wand shots, Boss radial orbs. **Override `mapping.json` `0,0` -> center `(-16, -16)`**, `60 ms/f` (~16.7 fps), rotate by flight `atan2(dy,dx)`. |
| Projectile | `projectiles/thunderball.png` | `2048x128` (`16f`, `128x128`) | **Tier 1 (Direct)** | Thunder Mage orb, Tesla/Rail impact, Boss 3 EMP pulse. **Override `0,0` -> center `(-64, -64)`**, scale `0.35..0.60` in-flight / `0.80` on burst (`imageSmoothingEnabled=false` for pixel cohesion). |
| Projectile | `projectiles/storm.png` | `1377x261` (`9f`, `153x261`) | **Tier 1 (Direct)** | Thunder Mage AoE strike, Tesla skill, Boss 3 lightning lane. **Override `mapping.json` `(-8,-4)` -> ground-center `(-76, -240)`**, scale `0.55..0.75`. |
| Structure | `structures/A_crystal.png`, `B_crystal.png` | `96x144` (`offX:-48, offY:-144`) | **Tier 2 (Optional)** | Energy Shrine / Boss 3 EMP Pylon / Auto-Turret core (`bob = sin(now/480)*3.5`). |
| Structure | `structures/door.png` | `150x296` (`offX:-75, offY:-220`) | **Tier 2 (Optional)** | Crypt/Ruins enemy wave spawn gate or dungeon exit portal. |
| Terrain | `terrains/terrain2.jpg` | `680x800` JPG | **Tier 2 (Fallback)** | Soft painted grass (`createPattern('repeat')`). Use CC0 pixel tiles (`d12`) as primary; optionally bake offscreen hue/multiply tint (`#d4a96a` desert / `#5a262c` crypt) as subtle ground texture under pixel decals. |
| Terrain | `terrains/terrain.jpg` | `170x135` JPG | **Skip** | Low-res odd-dimension JPEG tile; superseded by CC0 pixel tilemaps. |
| UI | `ui/bar_frame.png`, `ui/cursor_p1.png`, `win.png`, `lose.png` | `285x18`, `39x38`, `114x161` | **Tier 2 (Optional)** | `bar_frame.png` usable as Boss HP bar frame; `cursor_p1.png` as fallback crosshair. Skip `logo_*`, `title_bg.jpg`, `tutorial_bg.jpg`, `icon_*`. |
| Audio | `audio/SD_dead1..6.mp3`, `SD_dao.mp3`, `SD_cha.mp3`, `SD_Timer.mp3`, `SD_btns.mp3`, `SD_cheer.mp3` | `2.1-84.6 KB` MP3 | **Tier 2 (Fallback)** | Death grunt variety (`dead1..6`), melee slash (`dao`), turret deploy (`cha`), countdown/UI (`Timer`/`btns`). **Skip** `gameLoop.mp3` & `mainLoop.mp3` (RTS medieval BGM; use `d11` arcade combat loops). |

---

## 3. Unit Timing, Frame Counts & Pivot Normalization Rules

All 16 Miragine sheets use **horizontal strip PNGs**, **foot-bottom-center `(x, footY)`**, and **`nativeFacingDirection: "left"`** (unlike standard top-down shooter packs that face right `0 rad`).

| Animation State | Frame Count across `ss=0..15` | Miragine / `thap` Timing Formula | `ban_sung` Normalized Timing & Notes |
|---|---|---|---|
| `idle` | Always **3 frames** (`cellW` 29-81, `cellH` 45-64) | `Math.floor(now / 210 + id * 1.3) % 3` | **`210 ms/frame`** (~4.76 fps), phase-jittered by `entityId`. |
| `run` | **6 frames** (14 units); **3 frames** (`ss=10` Vampire, `ss=11` Ninja) | `Math.floor(phase * 1.55) % frames` | **Stride-coupled** (`Math.floor(distPx * 0.11) % frames`) so feet never skate on speed buffs. |
| `attack` | **4f** (`ss=3,13`); **5f** (`ss=0,1,5,9,10,15`); **6f** (`ss=2,4,6,7,8,11,12`); **7f** (`ss=14`) | `420 ms` swing (`floor((1 - swing) * frames)`); SWF `delayAttack`: `0` (newbie/vet), `5` (casters), `10` (melee) | Map windup `delayAttack / 30s` (`0ms` / `167ms` / `333ms`) and clamp attack anim to `min(420ms, cooldownMs)`. |
| `dead` | **2f** (`ss=8`); **4f** (`ss=11`); **5f** (`ss=1`); **6f** (`ss=0,10`); **3f** (all other 11 units) | Plays over `p * 1.35` (`~450 ms`), holds last frame, fades last `30%` | Play once (`450 ms`), hold corpse `1.5s` or stamp crater/corpse decal, fade out over `300 ms`. |

### Critical `mapping.json` vs `sprites.ts` Gotchas
1. **A/B Team Offset Mismatches**: `mapping.json` has 4 slight pivot diffs between `A*` (Red) and `B*` (Blue):
   - `zombie` (`ss=6`) `dead`: `A offY=-41` vs `B offY=-43`
   - `vampire` (`ss=10`) `run`: `A offY=-69` vs `B offY=-68`
   - `cavalry` (`ss=8`) `idle`: `A offX=-32` vs `B offX=-35`
   - `ironknight` (`ss=3`) `run`: `A offY=-55` vs `B offY=-59`
   - **Rule**: Always look up `[frames, cellW, cellH, offX, offY]` per exact sheet key (`A13_attack`, `B3_run`), never share one offset tuple across `A` and `B`.
2. **Projectile Pivot Override**: `mapping.json` lists `offX: 0, offY: 0` for `fireball`/`thunderball` and `(-8, -4)` for `storm`; always use the centered/grounded pivots `[-16, -16]`, `[-64, -64]`, `[-76, -240]` from `thap/sprites.ts`.
3. **Recommended Miragine Homage Units for `ban_sung`** (optional fallback/homage sheets alongside CC0 shooter rosters):
   - **Boss 2 Dread Colossus (`d38`)**: `A13`/`B13` **Dread Lord** (scaled `1.5x-2.0x`) & `B3` **Iron Knight** drones.
   - **Caster Elites (`d35`)**: `ss=4` **Mage** (`wss:"fb"`), `ss=7` **Novice** (`wss:"tb"`), `ss=10` **Vampire** (`wss:"storm"`).
   - **Auto-Turret / Melee Swarm (`d30`/`d34`)**: `ss=6` **Zombie** (`armored`), `ss=5` **Newbie** / `ss=15` **Veteran**.

### Complete 16-Unit `A*` Sheet Tuple Audit (`[frames, cellW, cellH, offX, offY]`)
| `ss` | Unit (`delayAtk` / `spd`) | `idle` | `run` | `attack` | `dead` | `ban_sung` Fit |
|---|---|---|---|---|---|---|
| `0` | Sword Man (`10f` / `2.25`) | `[3,62,53,-31,-53]` | `[6,46,52,-26,-49]` | `[5,88,66,-63,-65]` | `[6,99,74,-26,-60]` | Melee knight ref |
| `1` | Heavy Sword (`10f` / `2.5`) | `[3,63,53,-31,-55]` | `[6,44,52,-26,-52]` | `[5,91,61,-62,-62]` | `[5,100,72,-27,-60]` | Elite tank ref |
| `2` | High Lord (`10f` / `2.81`) | `[3,58,51,-32,-51]` | `[6,64,60,-37,-57]` | `[6,120,61,-92,-60]` | `[3,86,61,-32,-50]` | Dash boss/mini-boss |
| `3` | Iron Knight (`10f` / `2.95`) | `[3,58,53,-31,-55]` | `[6,64,61,-36,-55]`* | `[4,93,60,-67,-62]` | `[3,86,66,-34,-57]` | Boss 2 shield drone |
| `4` | Mage (`5f` / `2.25`, `fb`) | `[3,42,58,-26,-60]` | `[6,63,56,-33,-57]` | `[6,65,59,-45,-61]` | `[3,92,55,-29,-56]` | Pyro Shaman homage |
| `5` | Newbie (`0f` / `2.25`) | `[3,57,49,-40,-48]` | `[6,49,58,-28,-56]` | `[5,70,60,-53,-59]` | `[3,93,53,-42,-51]` | Pyro/rookie rig ref |
| `6` | Zombie (`10f` / `2.25`) | `[3,40,52,-26,-52]` | `[6,47,49,-25,-49]` | `[6,72,52,-56,-51]` | `[3,58,43,-30,-41]`* | Armored skirmisher |
| `7` | Novice (`5f` / `2.25`, `tb`) | `[3,29,56,-17,-55]` | `[6,52,52,-27,-52]` | `[6,41,56,-27,-56]` | `[3,71,61,-25,-52]` | Thunder caster homage |
| `8` | Cavalry (`10f` / `4.0`) | `[3,63,64,-32,-63]`* | `[6,71,65,-37,-62]` | `[6,88,67,-56,-66]` | `[2,73,64,-32,-64]` | Knight dash mount ref |
| `9` | Immortal (`10f` / `2.25`) | `[3,63,59,-37,-60]` | `[6,63,63,-33,-61]` | `[5,84,70,-61,-67]` | `[3,77,69,-30,-58]` | Heavy bruiser ref |
| `10` | Vampire (`5f` / `2.25`, `storm`) | `[3,45,60,-27,-60]` | `[3,60,65,-32,-69]`* | `[5,74,60,-42,-58]` | `[6,71,63,-27,-57]` | Storm caster homage |
| `11` | Ninja (`10f` / `3.2`) | `[3,62,51,-32,-51]` | `[3,56,48,-34,-46]` | `[6,82,51,-56,-51]` | `[4,78,60,-26,-53]` | Cyber Ranger speed ref |
| `12` | Samurai (`10f` / `2.25`) | `[3,54,45,-32,-46]` | `[6,53,46,-34,-46]` | `[6,78,71,-52,-72]` | `[3,87,47,-40,-47]` | Melee slash ref |
| `13` | Dread Lord (`10f` / `2.25`) | `[3,81,63,-54,-62]` | `[6,103,55,-65,-55]` | `[4,112,96,-64,-96]` | `[3,91,61,-56,-56]` | **Boss 2 Dread Colossus** |
| `14` | Monk (`10f` / `2.69`) | `[3,41,49,-26,-50]` | `[6,44,51,-26,-50]` | `[7,76,57,-46,-57]` | `[3,66,52,-24,-51]` | 7f rapid combo ref |
| `15` | Veteran (`0f` / `2.25`) | `[3,57,49,-39,-47]` | `[6,49,58,-26,-56]` | `[5,70,60,-51,-59]` | `[3,95,51,-42,-50]` | Turret crew / NPC ref |

*\*Asterisk entries (`ss=3,6,8,10`) differ slightly on `B*` sheets as listed above.*

---

## 4. Schema & Constants for Wave-2 Integration

```ts
// Concrete alias schema inside database-ban-sung/manifest.json & client/src/bansung/sprites.ts
export interface MiragineReuseMeta {
  url: `/database-miraginewar/${string}`;
  frames: number;
  cellW: number;
  cellH: number;
  offX: number;
  offY: number;
  nativeFacing: 'left' | 'center';
  frameMs?: number; // 210 idle, 60 fireball, 0 = stride/duration driven
  origin: 'repo-miraginewar';
}

export const MIRAGINE_REUSE_REFS: Record<string, MiragineReuseMeta> = {
  'fx/shadow':      { url: '/database-miraginewar/structures/shadow.png',      frames: 1,  cellW: 38,  cellH: 16,  offX: -19, offY: -8,   nativeFacing: 'center', origin: 'repo-miraginewar' },
  'fx/fireball':    { url: '/database-miraginewar/projectiles/fireball.png',    frames: 3,  cellW: 32,  cellH: 32,  offX: -16, offY: -16,  nativeFacing: 'center', frameMs: 60, origin: 'repo-miraginewar' },
  'fx/thunderball': { url: '/database-miraginewar/projectiles/thunderball.png', frames: 16, cellW: 128, cellH: 128, offX: -64, offY: -64,  nativeFacing: 'center', origin: 'repo-miraginewar' },
  'fx/storm':       { url: '/database-miraginewar/projectiles/storm.png',       frames: 9,  cellW: 153, cellH: 261, offX: -76, offY: -240, nativeFacing: 'center', origin: 'repo-miraginewar' },
  'prop/crystal_a': { url: '/database-miraginewar/structures/A_crystal.png',   frames: 1,  cellW: 96,  cellH: 144, offX: -48, offY: -144, nativeFacing: 'center', origin: 'repo-miraginewar' },
  'prop/crystal_b': { url: '/database-miraginewar/structures/B_crystal.png',   frames: 1,  cellW: 96,  cellH: 144, offX: -48, offY: -144, nativeFacing: 'center', origin: 'repo-miraginewar' },
};
```

### Exact Wave-2 Target Files
1. `database-ban-sung/manifest.json` — include `externalRefs` (`MIRAGINE_REUSE_REFS` + optional `A13_*`/`B13_*`/`SD_dead1..6.mp3`) pointing to `/database-miraginewar/*` without copying binaries into `database-ban-sung/`.
2. `client/src/bansung/sprites.ts` — support dual-root image loading (`/database-ban-sung/*` + `/database-miraginewar/*`), normalize flip sign via `nativeFacing === 'left' ? (facingRight ? -1 : 1) : (facingRight ? 1 : -1)`.
3. `client/src/bansung/render.ts` — draw `fx/shadow` ground ellipses, `fx/fireball` / `fx/thunderball` / `fx/storm` animated sheets, and optional DreadLord/IronKnight boss-homage frames.
4. `client/src/bansung/sound.ts` — register `SD_dead1..6.mp3`, `SD_dao.mp3`, `SD_Timer.mp3`, `SD_btns.mp3` as low-weight fallback cues alongside CC0 shooter SFX (`d10`, `d11`).
