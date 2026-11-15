# d50 Master Work Plan — `ban_sung` Wave-2 & QA Partition

## 1. Zero-Collision Ownership Rules & Execution Waves
- **Disjoint Write Sets**: `files(w_i) ∩ files(w_j) = ∅` for all `i ≠ j`. Every shared integration file (`protocol.ts`, `index.ts`, `app.module.ts`, `game.ts`, `game.gateway.ts`, `rooms.service.ts`, `App.tsx`, `Home.tsx`, `Lobby.tsx`, `vite.config.ts`) has **exactly one** owning worker.
- **Wave Sequence**:
  1. **Wave 2A (Parallel)**: `w01..w05` (shared sub-modules) + `w07` (asset pack lib/licenses).
  2. **Wave 2B (Parallel, after `w01..w05`/`w07`)**: `w06` (shared barrel & `protocol.ts`), `w08..w13` (disjoint audio/sprite fetch & builders).
  3. **Wave 2C (Parallel, after `w06` & `w08..w13`)**: `w14` (manifest/normalized pack), `w15..w28` (server `bansung/*` modules), `w31..w43` (client `bansung/*` & UI components).
  4. **Wave 2D (Integration & Tests, after 2C)**: `w29..w30` (server app/gateway wiring), `w44..w45` (client app/lobby wiring), `w46..w50` (tests & asset verifier).
  5. **Wave 3 (Cross-Check `c01..c30`, after 2D)**: Read-only code/asset audit; writes **only** `specs/004-ban-sung-coop/qa/cXX.md`. Defects route back to the owning `wXX`.

## 2. Working Agents (`w01..w50`) — Exact Exclusive File Ownership

| ID | Wave | Exclusive Target File(s) | Design Refs | Deps |
| --- | --- | --- | --- | --- |
| `w01` | 2A | `shared/src/bansung/types.ts` | d02, d08 | — |
| `w02` | 2A | `shared/src/bansung/weapons.ts` | d26–d31 | — |
| `w03` | 2A | `shared/src/bansung/heroes.ts` | d18, d25 | — |
| `w04` | 2A | `shared/src/bansung/enemies.ts` | d32, d34–d40 | — |
| `w05` | 2A | `shared/src/bansung/maps.ts` | d06 | — |
| `w06` | 2B | `shared/src/bansung.ts`, `shared/src/index.ts`, `shared/src/protocol.ts` | d01, d02 | w01–w05 |
| `w07` | 2A | `scripts/bansung/lib-pack.mjs`, `database-ban-sung/LICENSES.md`, `database-ban-sung/sources.json` | d09, d14, d15 | — |
| `w08` | 2B | `scripts/bansung/fetch-audio-guns.mjs`, `database-ban-sung/audio/sfx/weapons/**` | d10, d16 | w07 |
| `w09` | 2B | `scripts/bansung/fetch-audio-fx.mjs`, `database-ban-sung/audio/sfx/fx/**`, `database-ban-sung/audio/bgm/**` | d11, d16 | w07 |
| `w10` | 2B | `scripts/bansung/reuse-miragine.mjs`, `database-ban-sung/sprites/miragine/**` | d13 | w07 |
| `w11` | 2B | `scripts/bansung/build-hero-sprites.mjs`, `database-ban-sung/sprites/heroes/**`, `database-ban-sung/sprites/pet/**` | d12, d14, d18, d25 | w07 |
| `w12` | 2B | `scripts/bansung/build-fx-sprites.mjs`, `database-ban-sung/sprites/weapons/**`, `database-ban-sung/sprites/fx/**` | d12, d14, d22–d24 | w07 |
| `w13` | 2B | `scripts/bansung/build-mob-sprites.mjs`, `database-ban-sung/sprites/mobs/**`, `database-ban-sung/sprites/bosses/**`, `database-ban-sung/sprites/tiles/**` | d06, d12, d14, d34–d39 | w07 |
| `w14` | 2C | `scripts/bansung/pack-manifest.mjs`, `database-ban-sung/manifest.json`, `database-ban-sung/normalized/**` | d09, d14, d15 | w08–w13 |
| `w15` | 2C | `server/src/game/bansung/spatial.ts` | d05 | w06 |
| `w16` | 2C | `server/src/game/bansung/map.ts` | d06 | w06, w15 |
| `w17` | 2C | `server/src/game/bansung/damage.ts` | d33 | w06 |
| `w18` | 2C | `server/src/game/bansung/weapons.ts` | d26–d29, d31 | w06, w15, w17 |
| `w19` | 2C | `server/src/game/bansung/gadgets.ts` | d20, d30 | w06, w15, w17 |
| `w20` | 2C | `server/src/game/bansung/pickups.ts` | d32 | w06, w15 |
| `w21` | 2C | `server/src/game/bansung/flocking.ts` | d36 | w06, w15 |
| `w22` | 2C | `server/src/game/bansung/mobs.ts` | d34, d35 | w06, w17, w21 |
| `w23` | 2C | `server/src/game/bansung/boss-sand.ts` | d37 | w06, w17 |
| `w24` | 2C | `server/src/game/bansung/boss-colossus.ts` | d38 | w06, w17 |
| `w25` | 2C | `server/src/game/bansung/boss-overlord.ts` | d39 | w06, w17 |
| `w26` | 2C | `server/src/game/bansung/director.ts` | d40 | w06, w16 |
| `w27` | 2C | `server/src/game/bansung/bot.ts` | d07, d25 | w06, w15 |
| `w28` | 2C | `server/src/game/bansung/security.ts`, `server/src/game/bansung/world.ts` | d04, d46–d48 | w15–w27 |
| `w29` | 2D | `server/src/app.module.ts`, `server/src/game/rooms.service.ts` | d01, d03, d48 | w06, w14 |
| `w30` | 2D | `server/src/game/game.ts`, `server/src/game/game.gateway.ts` | d01, d03, d04, d46 | w28, w29 |
| `w31` | 2C | `client/src/bansung/sprites.ts` | d17 | w06, w14 |
| `w32` | 2C | `client/src/bansung/sound.ts` | d16, d43 | w06, w14 |
| `w33` | 2C | `client/src/bansung/store.ts` | d08 | w06 |
| `w34` | 2C | `client/src/bansung/anim.ts` | d18, d19 | w06, w31 |
| `w35` | 2C | `client/src/bansung/motion.ts` | d20, d21 | w06 |
| `w36` | 2C | `client/src/bansung/particles.ts` | d22, d42 | w06 |
| `w37` | 2C | `client/src/bansung/vfx.ts` | d22–d25 | w06, w31, w36 |
| `w38` | 2C | `client/src/bansung/render.ts` | d41, d47 | w31, w34–w37 |
| `w39` | 2C | `client/src/bansung/input.ts` | d44 | w06, w33 |
| `w40` | 2C | `client/src/components/bansung/HudBars.tsx` | d45 | w06, w33 |
| `w41` | 2C | `client/src/components/bansung/HotbarShop.tsx` | d31, d32, d45 | w06, w31, w33 |
| `w42` | 2C | `client/src/components/bansung/PostGameModal.tsx` | d03, d46 | w06, w33 |
| `w43` | 2C | `client/src/components/BansungBoard.tsx`, `client/src/bansung/bansung.css` | d44, d45 | w32–w42 |
| `w44` | 2D | `client/vite.config.ts`, `client/src/App.tsx`, `client/src/components/Home.tsx`, `client/src/components/Rules.tsx` | d01 | w06, w43 |
| `w45` | 2D | `client/src/components/Lobby.tsx`, `client/src/components/RoomSettings.tsx` | d01, d03 | w06, w43 |
| `w46` | 2D | `server/test/bansung-physics.test.cjs` | d05, d06, d33, d49 | w15–w17 |
| `w47` | 2D | `server/test/bansung-weapons.test.cjs` | d26–d32, d49 | w18–w20 |
| `w48` | 2D | `server/test/bansung-ai-waves.test.cjs` | d07, d34–d40, d49 | w21–w27 |
| `w49` | 2D | `server/test/bansung-net-security.test.cjs` | d03, d04, d46–d49 | w28–w30 |
| `w50` | 2D | `scripts/bansung/verify-assets.mjs`, `server/test/bansung-assets.test.cjs` | d09, d14–d16, d49 | w14, w44 |

## 3. Cross-Check Agents (`c01..c30`) — Read-Only Audit + Exclusive QA Reports

| ID | Exclusive Report | Audits Workers | Spec Refs & Pass Gate |
| --- | --- | --- | --- |
| `c01` | `specs/004-ban-sung-coop/qa/c01.md` | `w01, w06` | d01, d02: `GameMode 'bansung'`, quantized frame schema, exports |
| `c02` | `specs/004-ban-sung-coop/qa/c02.md` | `w02, w03` | d18, d25–d31: all 16 weapons/gadgets, 4 heroes, pet stats match specs |
| `c03` | `specs/004-ban-sung-coop/qa/c03.md` | `w04, w05` | d06, d32, d34–d40: 3 biomes, 8 mobs, 3 bosses, 10 waves, perks |
| `c04` | `specs/004-ban-sung-coop/qa/c04.md` | `w07, w14` | d09, d14, d15: valid `manifest.json`, CC0/MIT `LICENSES.md`, pivots |
| `c05` | `specs/004-ban-sung-coop/qa/c05.md` | `w08, w09` | d10, d11, d16: -1dB WAV/OGG/MP3 coverage for every SFX & BGM ID |
| `c06` | `specs/004-ban-sung-coop/qa/c06.md` | `w10, w11` | d13, d14, d18, d25: Miragine shadow/FX reuse, 48x48 hero & pet strips |
| `c07` | `specs/004-ban-sung-coop/qa/c07.md` | `w12, w13` | d12, d14, d22–d24: 1px dark outline, shared palette LUT, mob/boss sheets |
| `c08` | `specs/004-ban-sung-coop/qa/c08.md` | `w15, w16` | d05, d06: zero bullet tunneling, sliding AABB, AoE LOS, arena bounds |
| `c09` | `specs/004-ban-sung-coop/qa/c09.md` | `w17` | d33: Armor-before-HP soak, Light/Armored multiplier, crit & stun DR |
| `c10` | `specs/004-ban-sung-coop/qa/c10.md` | `w18` | d26–d29, d31: active reload sweet-spot, shared energy, melee deflect |
| `c11` | `specs/004-ban-sung-coop/qa/c11.md` | `w19, w20` | d20, d30, d32: 0.28s dash i-frames, turret/drone, breakable crate drops |
| `c12` | `specs/004-ban-sung-coop/qa/c12.md` | `w21, w22` | d34–d36: boids separation (40+ mobs no stack), sniper laser telegraph |
| `c13` | `specs/004-ban-sung-coop/qa/c13.md` | `w23` | d37: Boss 1 Sand Beholder 2 phases, radial volley, slam stun shockwave |
| `c14` | `specs/004-ban-sung-coop/qa/c14.md` | `w24` | d38: Boss 2 Dread Colossus charge, mortar, shield drones, overheat stun |
| `c15` | `specs/004-ban-sung-coop/qa/c15.md` | `w25` | d39: Boss 3 Overlord spirals, EMP pylons, lane laser grid, weak-point |
| `c16` | `specs/004-ban-sung-coop/qa/c16.md` | `w26, w27` | d07, d40: 10-wave cadence, bleedout/revive ring, co-op bot kiting/revive |
| `c17` | `specs/004-ban-sung-coop/qa/c17.md` | `w28` | d04, d47: 30Hz tick < 5ms, viewport culling, payload < 12KB/s |
| `c18` | `specs/004-ban-sung-coop/qa/c18.md` | `w28, w29` | d48: command rate-limit, cooldown check, `/database-ban-sung` traversal guard |
| `c19` | `specs/004-ban-sung-coop/qa/c19.md` | `w29, w30` | d01, d03, d46: lobby config sync, coin bet/pot payout, MVP scoreboard |
| `c20` | `specs/004-ban-sung-coop/qa/c20.md` | `w31` | d17: manifest slice by `offX/offY`, white hit-flash cache, fallback draw |
| `c21` | `specs/004-ban-sung-coop/qa/c21.md` | `w32` | d16, d43: stereo panner, 8-voice SFX cap, BGM crossfade, WebAudio synth |
| `c22` | `specs/004-ban-sung-coop/qa/c22.md` | `w33` | d08: snapshot ring-buffer lerp, zero aim lag, spectator follow target |
| `c23` | `specs/004-ban-sung-coop/qa/c23.md` | `w34, w35` | d18–d21: L/R flip + 360° gun pivot, 4 ghost afterimages, recoil & hitstop |
| `c24` | `specs/004-ban-sung-coop/qa/c24.md` | `w36, w37` | d22–d25, d42: zero-GC fixed pool, stun stars, Z-arc bomb shadow, pet spring |
| `c25` | `specs/004-ban-sung-coop/qa/c25.md` | `w38` | d41, d47: 2.5D Y-sort order, additive glow, outlined damage numbers, 60 FPS |
| `c26` | `specs/004-ban-sung-coop/qa/c26.md` | `w39, w40, w43` | d44, d45: PC WASD+Mouse + mobile twin-stick, HP/Shield/Boss HUD, minimap |
| `c27` | `specs/004-ban-sung-coop/qa/c27.md` | `w41, w42, w44, w45` | d01, d03, d32, d45, d46: 5-slot hotbar, perks, postgame, Home/Lobby/Vite |
| `c28` | `specs/004-ban-sung-coop/qa/c28.md` | `w46–w48` | d49: deterministic physics/weapons/AI tests with zero skipped assertions |
| `c29` | `specs/004-ban-sung-coop/qa/c29.md` | `w49, w50` | d48, d49: net/anti-cheat/path-traversal tests + asset license/hash check |
| `c30` | `specs/004-ban-sung-coop/qa/c30.md` | `w01–w50` | d49: final release gate run (`build` + `bansung-*.test.cjs` + `verify-assets`) |

## 4. Final Verification Gate Commands (Executed by `c30`)
```powershell
node scripts/bansung/verify-assets.mjs
node --test server/test/bansung-*.test.cjs
npm run build
```
