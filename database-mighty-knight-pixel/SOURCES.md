# Asset Sources — `database-mighty-knight-pixel/`

Static mount root: `/database-mighty-knight-pixel`  
Shared contract: `shared/src/mk/types.ts`, `shared/src/mk/choreo.ts`, `shared/src/mk/heroes.ts`, `shared/src/mk/enemies.ts`, `shared/src/mk/relics.ts`

## Deterministic 2.5D Pixel Art Pipelines (10–15 Frames/Character Gate)

1. **Character Master Strips & Portraits (`scripts/mightyknight-pixel/build_pixel_sprites.py`)**
   - Pure 1:1 native pixel rasterization using a curated 32-color dark-fantasy palette (`palette.py`), 1px `#140c1c` outlines, strict binary alpha (`0` or `255`), zero Lanczos/anti-aliasing.
   - Outputs 1 horizontal master strip PNG per character (strictly `10 <= frames <= 15`):
     - `sprites/heroes/{heroId}.png`: 6 Heroes × **15 frames** (`720×48`, cell `48×48`, anchor `24,44`)
     - `sprites/enemies/{enemyId}.png`: 6 Regular Enemies × **11 frames** (`528×48`) + 2 Elite Enemies × **12 frames** (`576×48`, cell `48×48`, anchor `24,44`)
     - `sprites/bosses/{bossId}.png`: 4 Bosses × **15 frames** (`1200×80`, cell `80×80`, anchor `40,74`)
     - `portraits/{heroId}.png`: 6 Hero Pixel Portraits (`32×32`)

2. **Modular Pixel VFX, 4 Biomes × 5 Parallax Layers & UI Icons (`scripts/mightyknight-pixel/build_pixel_vfx_ui.py`)**
   - `vfx/*.png`: 18 reusable crisp pixel VFX strips
   - `terrains/{grasslands,jungle,volcano,citadel}/{bg_sky,bg_far,bg_mid,ground_arena,fg_silhouette}.png`: 20 seamless parallax pixel layers
   - `ui/*.png`: Pixel skill icons (30), relic icons (12), stat/action HUD icons

3. **16-Bit Retro Chiptune/FM Audio (`scripts/mightyknight-pixel/build_audio.mjs`)**
   - Pure Node.js deterministic 44.1 kHz 16-bit PCM WAV synthesis normalized to `-1.0 dBFS` peak ceiling:
     - `audio/bgm/*.wav`: 4 seamless loopable BGM tracks (`lobby_theme`, `battle_grass`, `battle_volcano`, `boss_theme`)
     - `audio/sfx/*.wav`: 42 combat, skill, parry, ultimate, boss & UI SFX clips

4. **Manifest & Strict Frame-Budget Validator (`scripts/mightyknight-pixel/build_manifest.mjs`)**
   - Verifies PNG/WAV headers, enforces `10 <= frames <= 15` on every character strip, and emits `manifest.json`.
