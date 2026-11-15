# d49: Verification Suite Plan & 30-Agent QA Cross-Check Rubric (`ban_sung`)

## 1. Wave-2 Target Files & CLI Gate Pipeline
- **Owned Verification Files (Wave 2)**:
  - `server/test/bansung.test.cjs` — `node:test` + `node:assert/strict` suite (auto-discovered by `npm test --prefix server` via `node --test test/*.test.cjs`, matching `server/test/thap-hung.test.cjs` conventions).
  - `scripts/verify-bansung-assets.cjs` — standalone Node validator for `database-ban-sung/manifest.json`, binary PNG/audio headers, `32/48/96` pixel grid/pivots, and `LICENSES.md`.
- **Mandatory Pass Gate** (all 4 commands must exit `0`, zero skipped/relaxed assertions, run after the final Wave-2 edit):
  1. `npm run build --prefix server` (`tsc -p tsconfig.json` -> builds `server/dist/shared/` and `server/dist/server/`)
  2. `npm test --prefix server` (`npm run build && node --test test/*.test.cjs` -> passes `bansung.test.cjs` + zero regression in `thap-hung.test.cjs`, `security.test.cjs`, `room-rules-socket.test.cjs`)
  3. `npx --prefix client tsc --noEmit && npm run build --prefix client` (strict TS check + Vite bundle in `client/dist/`)
  4. `node scripts/verify-bansung-assets.cjs` (asset manifest, binary header, 55 SFX + 3 BGM & OSS license audit)

## 2. `server/test/bansung.test.cjs` Harness & 12 Deterministic Suites
Imports compiled artifacts (`../dist/server/src/game/bansung/world.js`, `../dist/server/src/game/game.js`, `../dist/shared/src/index.js`) with deterministic stepping at `TICK_HZ = 30`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { BansungWorld } = require('../dist/server/src/game/bansung/world.js');
const { Game } = require('../dist/server/src/game/game.js');
const S = require('../dist/shared/src/index.js');
const noHooks = { tick() {}, changed() {} };
const steps = (w, n) => { for (let i = 0; i < n; i++) w.step(); };
```

| ID | Suite | Concrete Assertions & Numerical Thresholds |
|----|-------|--------------------------------------------|
| `T01` | Mode & Config | `'bansung'` in `GAME_MODES`; `normalizeBansungConfig` clamps `biome` (`desert\|crypt\|lab`), `difficulty` (`normal\|hard\|insane`), `bots` (`0..3`), `reviveMode`, `bet >= 0`; invalid fields revert safely. |
| `T02` | Asset Manifest | `database-ban-sung/manifest.json` parses; every `sprites`/`audio.sfx` (55 IDs)/`audio.bgm` (3 IDs) file exists (`size > 0`); `cellW,cellH` in `{16,24,32,48,64,96,128}`; `offX,offY` valid; `LICENSES.md` covers all `sourceId`s. |
| `T03` | Spatial & Tunneling | Circle-vs-AABB slides smoothly inside `2112x1344` arena & cover without leaks; swept ray-step bullet (`>= 900 px/s`) hits 16px pillar without tunneling; AoE blast checks LOS cover occlusion. |
| `T04` | 30Hz Tick & Net Cap | `steps(w, 100)` with 4 heroes + 40 mobs completes in `< 500 ms` (`<= 5 ms/tick` avg); `frameFor(i)` culls entities beyond `192px` margin; `bansung:frame` stays `< 400 B/tick` (`< 12 KB/s` @ 30Hz). |
| `T05` | Weapons & Melee | Kinetic (Pistol/AR/SMG/Shotgun), Explosive (Frag/Stun/Bazooka/Mine), Energy/Magic, and Melee enforce energy cost, spread, clip/reload & active-reload sweet-spot; Melee arc destroys enemy bullets. |
| `T06` | Gadgets, Bombs & DR | Gadgets (`stun_bomb`, `cluster_he`, `turret`, `heal_drone`) enforce cooldowns; parabolic Z-arc bomb explodes at exact fuse tick; stun applies DR (`[1.0, 0.5, 0.25, 0]`) & blocks move/fire. |
| `T07` | Combat, Armor & Drops | Armor shield soaks damage before HP & regens after out-of-combat delay; Light/Armored affinity multiplier applies; crates drop pickups/pedestals; wave perks (waves 2/4/6/8) stack cleanly. |
| `T08` | Dash & Anti-Cheat | Dash grants `0.28s` (~8-9 ticks) i-frames (`iFrames > 0`) & blocks spam; server clamps/rejects `NaN` aim, `|move| > 1`, downed/stunned fire, and enforces token-bucket caps (`30` burst, `60/s`, `8/tick`, kick `@20/5s`). |
| `T09` | Co-op Revive & Bots | Lethal hit sets `downed` with bleedout while `>= 1` ally lives; teammate/bot inside revive circle fills `0 -> 100%` and revives; `bot.ts` kites, fires & prioritizes downed allies; full wipe ends match. |
| `T10` | Mobs & Flocking | 40+ mobs maintain boids separation (`dist >= 0.7 * (rA + rB)`, zero single-pixel stacking); Bomb Goblin triggers `42t` fuse rush & stun-defuse; Laser Sniper & casters enforce telegraph windup. |
| `T11` | Bosses & 10 Waves | Wave director clears Waves 1-10 (`W4` Mini-Boss, `W10` Boss); `Sand Beholder`, `Dread Colossus`, `Overlord Core` transition phases; victory yields MVP scoreboard + `70/30` win split or bet refund on loss via `Game` (`syncThap` pattern). |
| `T12` | Static Path Guard | Static `/database-ban-sung` handler rejects `..` / `%2e%2e`, symlinks & disallowed extensions (`403`/`404`) and never leaks files outside `database-ban-sung/`. |

## 3. Asset Manifest, Binary Header & License Verification (`verify-bansung-assets.cjs`)
Validates `database-ban-sung/manifest.json` + `LICENSES.md`:
```ts
interface AssetAuditReport {
  spritesChecked: number;
  audioChecked: number;
  missingFiles: string[];
  badPngHeaders: string[];     // PNG sig 89504E470D0A1A0A; IHDR w !== entry.cellW * entry.frames || h !== entry.cellH
  badAudioHeaders: string[];   // Magic bytes: RIFF..WAVE (WAV), OggS (OGG), or ID3 / 0xFFFB (MP3)
  unlicensedSources: string[]; // sourceId missing in LICENSES.md or license not CC0/MIT/CC-BY/MIRAGINE-REUSE
}
```
- **Hard-Fail Gates**:
  - Any non-empty failure array in `AssetAuditReport`, or `file.size === 0`.
  - Missing Miragine reused essentials (`shadow.png`, `terrain*.jpg`, `fireball.png`, `thunderball.png`, `storm.png`).
  - Missing sprite ID or audio ID (all 55 SFX + 3 BGM) referenced by `shared/src/bansung.ts` registries.
  - PNG `IHDR` `width`/`height` read directly from byte offsets `16..23` (big-endian `uint32`), zero native image deps required.

## 4. Client `tsc` / Vite Build & Runtime Contract Checks
- `npx --prefix client tsc --noEmit`: zero type errors across `shared/src/bansung.ts`, `client/src/bansung/{store,sprites,render,sound,recoil,fxPool}.ts`, `client/src/components/BansungBoard.tsx`, `Home.tsx`, `Lobby.tsx`, `App.tsx`.
- `npm run build --prefix client`: clean Vite bundle in `client/dist/`, `/database-ban-sung` proxy in `vite.config.ts`, zero `server/` imports in `client/`.
- Static/contract guards verify: `1024`-particle / `384`-decal / `128`-text fixed pools (no per-frame heap growth), `8`-voice SFX priority cap, `30 ms` visual hitstop, `16`-slot snapshot ring buffer, and `15 Hz` React HUD throttle.

## 5. 30-Agent QA Cross-Check Rubric (`c01..c30`)
Wave-3 cross-checkers (`c01..c30`) audit Wave-2 outputs slice-by-slice (`PASS` only when criteria + CLI gates succeed):

| Agent | Slice Scope | Binary PASS Gate |
|-------|-------------|------------------|
| `c01` | Mode Registration | `'bansung'` in `protocol.ts`, `Home`, `Lobby`, `App`; `/database-ban-sung` served in dev & Nest prod. |
| `c02` | Shared Protocol | `shared/src/bansung.ts` exports `BansungConfig/RoomView/Frame/Command`; binary frame `< 12 KB/s`. |
| `c03` | Lobby & Payout | Biome/difficulty/bots/revive/bet UI syncs to server; pot deducted on start & settled once. |
| `c04` | 30Hz Loop & Culling | `world.ts` runs `<= 5 ms/tick`, drains FIFO command queue, culls snapshots with `192px` margin. |
| `c05` | Spatial Hash | Circle-AABB sliding, fast-bullet ray-step (no tunneling), and AoE LOS cover occlusion pass `T03`. |
| `c06` | 3 Biomes & Props | `2112x1344` Desert Ruins, Crimson Crypt, Cyber Lab spawn valid cover & chain-exploding barrels. |
| `c07` | Co-op Revive & AI | Downed bleedout, revive circle UI+logic, and `bot.ts` kite/revive AI pass `T09`. |
| `c08` | Net Interp & Camera | `store.ts` 16-slot ring-buffer interpolates smoothly; local aim instant; spectator follows ally. |
| `c09` | Database & Licenses | `database-ban-sung/` matches schema, `manifest.json` valid, `LICENSES.md` complete (`T02`). |
| `c10` | Gunshot SFX | Pistol/shotgun/rifle/laser/reload/casing WAV/OGG/MP3 normalized `-1 dBFS` + WebAudio fallback. |
| `c11` | Bomb/UI SFX & BGM | Explosion/flashbang/hit/crit/roar/dash SFX + looping combat BGM trim cleanly without clipping. |
| `c12` | Sprite Normalization | `32/48/96` integer grid, feet `offY=-(tier-2)` over `shadow.png`, `#181425` 1px outline, 48-color LUT. |
| `c13` | Miragine Reuse | `shadow.png`, `terrain*.jpg`, `fireball/thunderball/storm` & snappy Miragine frame cadences integrated. |
| `c14` | Sprite Loader/Cache | `sprites.ts` slices by `offX/offY`, caches offscreen flipped/white hit-flash sheets, safe fallback. |
| `c15` | 4 Hero Classes | `mascot_gunner`, `cyber_ranger`, `pyromancer`, `knight` animate idle/run/shoot/dash/stun/dead (`48x48`). |
| `c16` | Aim & Gun Pivot | L/R hero flip + 360-deg shoulder-pivoted gun + exact muzzle offset aligns cleanly to cursor. |
| `c17` | Dash & Afterimages | `0.28s` dash grants i-frames, squash-stretch, 4 ghost trails, dust ring; cooldown enforced (`T08`). |
| `c18` | Recoil & Hitstop | `recoil.ts` kickback/muzzle-snap springs, camera impulse, `30ms` hitstop & dynamic crosshair bloom. |
| `c19` | Tracers & Casings | Tracer ribbons, pixel bullet strips, additive muzzle cones & Z-bounce brass casings (`96`/`256`). |
| `c20` | Stun & Bomb VFX | Expanding stun ring, overhead stars, freeze-jitter; Z-arc bomb over scaling shadow + danger ring + crater. |
| `c21` | Pet Companion | Tiger/Cat pet spring-follows owner, animates idle/trot/pounce, magnets pickups & fires mini shots. |
| `c22` | Kinetic/Explosive | Pistol/AR/SMG/Shotgun + Frag/Stun/Bazooka/Mine match fire-rate, spread, energy, blast radius & knockback. |
| `c23` | Energy/Magic/Melee | Plasma/Railgun/Lightning/Book + Blade/Scythe/Baton work; melee arc destroys enemy projectiles (`T05`). |
| `c24` | Gadgets, Energy & Crates | 4 gadgets, shared Energy + active reload sweet-spot, clay/wood/iron crates, drops & 12 perks pass `T06-T07`. |
| `c25` | Damage & Flocking | Armor soak, Light/Armored affinity, stun DR, and 40+ enemy boids separation pass `T07` & `T10`. |
| `c26` | Mobs & Telegraphs | Scarab/Skirmisher/Goblin/Brute + Spitter/Sniper/Shaman/Mage render, fire & show red-laser telegraphs. |
| `c27` | 3 Bosses & 10 Waves | Sand Beholder, Dread Colossus, Overlord Core multi-phase fights + 10-wave director + endless hook pass `T11`. |
| `c28` | 2.5D Renderer & Pools | `render.ts` Y-sorts shadows/decals/actors/glow/text; `fxPool.ts` (`1024/384/128`) avoids GC spikes. |
| `c29` | Spatial Audio, Controls & HUD | Stereo pan (`520px`, `8`-voice cap), WASD+Mouse + Mobile twin-sticks, `15Hz` HUD/hotbar/minimap/pings. |
| `c30` | Security & Full Suite | Token-bucket socket caps, finite/clamped input, traversal guard (`T08`,`T12`), and all 4 CLI gates pass. |
