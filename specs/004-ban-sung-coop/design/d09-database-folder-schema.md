# d09 — `database-ban-sung/` Folder Structure, `manifest.json` Schema, `LICENSES.md` & Asset IDs

## 1. Static Serving & Ownership
- **Root directory**: `database-ban-sung/` at repo root (alongside `database-miraginewar/` and `database-pikachu/`).
- **HTTP route**: `/database-ban-sung/*`
  - **Dev/Preview/Build**: `databaseBanSungPlugin()` in `client/vite.config.ts` serves `../database-ban-sung` and copies into `client/dist/database-ban-sung`.
  - **Production Backend**: Static middleware in `server/src/app.module.ts` with `resolve()` prefix check + extension allowlist (`.png`, `.jpg`, `.webp`, `.ogg`, `.wav`, `.mp3`, `.json`, `.md`) blocking path traversal (`..`).
- **Wave-2 Target Files**:
  - `database-ban-sung/manifest.json` (runtime asset index)
  - `database-ban-sung/LICENSES.md` (provenance & attribution ledger)
  - `database-ban-sung/audio/{sfx,bgm}/*`
  - `database-ban-sung/sprites/{heroes,weapons,enemies,bosses,pets,projectiles,vfx,props,tiles,ui}/*`
  - `database-ban-sung/normalized/{heroes,weapons,enemies,bosses,pets,projectiles,vfx,props,tiles,ui}/*`
  - Consumed by `client/src/bansung/sprites.ts`, `client/src/bansung/sound.ts`; validated by `server/test/bansung-assets.test.cjs` (or `d49` QA script).

## 2. Directory Layout
```text
database-ban-sung/
├── manifest.json                 # Single source of truth loaded by client at boot
├── LICENSES.md                   # Source URLs, licenses, authors, hashes
├── audio/
│   ├── sfx/                      # Normalized SFX (.ogg primary, optional .wav fallback; -1.0 dBFS peak)
│   └── bgm/                      # Seamless loopable combat/lobby tracks (.ogg / .mp3; -14 LUFS)
├── sprites/                      # Raw/curated source extracts (OSS packs + Miragine copies) before normalization
│   ├── heroes/                   # Class source sheets (gunner, ranger, pyro, knight)
│   ├── weapons/                  # Gun/melee/gadget sprites + muzzle overlays
│   ├── enemies/                  # Melee, bomber, ranged, caster sheets
│   ├── bosses/                   # Sand Beholder, Dread Colossus, Overlord Core
│   ├── pets/                     # Companion pet sheets (tiger_cat)
│   ├── projectiles/              # Bullets, rockets, bombs, fireball, thunderball
│   ├── vfx/                      # Explosions, stun rings/stars, flashes, casings, storm
│   ├── props/                    # Crates, pots, TNT barrels, cacti, pickups, pedestals
│   ├── tiles/                    # Biome tiles & floor/wall props (desert, crypt, cyber)
│   └── ui/                       # Portraits, shadows, crosshairs, HUD icons
└── normalized/                   # Runtime-ready uniform pixel strips (generated/verified by d15 pipeline)
    ├── heroes/                   # Horizontal strip: frames * cellW x cellH, nativeFacing=right
    ├── weapons/                  # Right-pointing 0-deg gun strips + shoulder/muzzle anchors
    ├── enemies/
    ├── bosses/
    ├── pets/
    ├── projectiles/
    ├── vfx/
    ├── props/
    ├── tiles/                    # 32x32 tile sheets + seamless biome floor/backdrop textures
    └── ui/
```
- **Runtime rule**: Client runtime (`sprites.ts`, `sound.ts`) ONLY fetches paths listed in `manifest.json` (`normalized/...` and `audio/...`). `sprites/` holds pre-normalized input sheets so pipeline scripts (`d15`) remain idempotent without mutating raw inputs.

## 3. Asset ID Naming Convention
- **Format**: lowercase `snake_case`, regex `^[a-z][a-z0-9_]{2,63}$`. Filename (without extension) MUST match its manifest key (`<asset_id>.png` or `<asset_id>.ogg`).
- **Prefixes**:
  - `hero_<class>_<state>`: `class` ∈ `{gunner, ranger, pyro, knight}`; `state` ∈ `{idle, run, shoot, dash, stunned, dead}` (e.g., `hero_gunner_run`).
  - `wpn_<category>_<slug>`: `category` ∈ `{pistol, rifle, smg, shotgun, launcher, energy, melee, gadget}` (e.g., `wpn_rifle_assault`, `wpn_melee_crescent`, `wpn_gadget_stun_bomb`).
  - `pet_<species>_<state>`: e.g., `pet_tiger_idle`, `pet_tiger_run`, `pet_tiger_pounce`.
  - `mob_<archetype>_<state>`: `state` ∈ `{idle, run, attack, dead}` (e.g., `mob_scarab_run`, `mob_goblin_bomber_attack`).
  - `boss_<slug>_<state>`: e.g., `boss_sand_beholder_idle`, `boss_dread_colossus_charge`, `boss_overlord_core_laser`.
  - `proj_<slug>`: e.g., `proj_bullet_kinetic`, `proj_rocket_he`, `proj_grenade_stun`, `proj_fireball`, `proj_thunderball`.
  - `vfx_<slug>`: e.g., `vfx_muzzle_kinetic`, `vfx_explosion_he`, `vfx_stun_ring`, `vfx_stun_stars`, `vfx_dash_dust`, `vfx_storm`.
  - `prop_<slug>`: e.g., `prop_crate_wood`, `prop_barrel_tnt`, `prop_cactus_tall`, `prop_pickup_energy`.
  - `tile_<biome>_<part>`: `biome` ∈ `{desert, crypt, cyber}`; `part` ∈ `{floor, wall, trim, decal}` (e.g., `tile_desert_floor`).
  - `ui_<slug>`: e.g., `ui_shadow_unit`, `ui_portrait_gunner`, `ui_crosshair_dot`, `ui_icon_shield`.
  - `sfx_<domain>_<action>`: `domain` ∈ `{wpn, fx, hit, mob, boss, ui}` (e.g., `sfx_wpn_rifle`, `sfx_wpn_reload`, `sfx_fx_explosion`, `sfx_fx_stun_flash`, `sfx_ui_revive`).
  - `bgm_<context>`: e.g., `bgm_lobby`, `bgm_desert`, `bgm_crypt`, `bgm_cyber`, `bgm_boss`.

## 4. `manifest.json` Schema (TypeScript Contract)
```ts
export type AssetCategory =
  | 'hero' | 'weapon' | 'pet' | 'enemy' | 'boss'
  | 'projectile' | 'vfx' | 'prop' | 'tile' | 'ui';

export interface SpriteManifestEntry {
  path: string;                // e.g. "normalized/heroes/hero_gunner_run.png"
  category: AssetCategory;
  frames: number;              // >= 1; sheet width MUST equal frames * cellW
  cellW: number;               // Integer pixel width (e.g. 32, 48, 64, 96, 128)
  cellH: number;               // Integer pixel height (sheet height MUST equal cellH)
  offX: number;                // Draw X offset from entity foot/origin (Miragine convention)
  offY: number;                // Draw Y offset from entity foot/origin (e.g. -cellH + 4)
  fps: number;                 // Animation playback Hz (0 = static frame)
  loop: boolean;               // true for idle/run/looping FX; false for dead/bursts
  pivot?: {                    // Optional anchor (used by d19 weapon rotation & muzzle FX)
    anchorX: number;           // Shoulder/grip X inside cell
    anchorY: number;           // Shoulder/grip Y inside cell
    muzzleX?: number;          // Barrel tip X inside cell
    muzzleY?: number;          // Barrel tip Y inside cell
  };
  fallback: {                  // Guaranteed procedural render spec if PNG fails/offline
    shape: 'rect' | 'circle' | 'capsule' | 'cone';
    color: string;             // Hex "#rrggbb"
    accent?: string;
  };
  sourceId: string;            // Foreign key into LICENSES.md Source Registry
}

export interface AudioManifestEntry {
  path: string;                // e.g. "audio/sfx/sfx_wpn_rifle.ogg"
  fallbackPath?: string;       // Optional ".wav" / ".mp3" fallback
  variations?: string[];       // Optional round-robin variant paths
  kind: 'sfx' | 'bgm';
  durationMs: number;          // > 0
  gain: number;                // Base volume multiplier [0.05..1.0]
  loop: boolean;               // true for bgm, false for one-shot sfx
  synthFallback: string;       // Key in WebAudio procedural fallback table (d16/d43)
  sourceId: string;            // Foreign key into LICENSES.md Source Registry
}

export interface BansungManifest {
  version: 1;
  generatedAt: string;         // ISO-8601 UTC timestamp
  defaults: {
    baseTilePx: 32;
    nativeFacing: 'right';     // Normalized characters/weapons face +X (Miragine assets flipped at build)
    simTickHz: 30;
  };
  sprites: Record<string, SpriteManifestEntry>;
  audio: Record<string, AudioManifestEntry>;
}
```
- **Invariant**: Every entry in `sprites` and `audio` MUST resolve to an existing file inside `database-ban-sung/`, satisfy `frames * cellW === pngWidth` and `cellH === pngHeight`, and reference a valid `sourceId` in `LICENSES.md`.

## 5. `LICENSES.md` Schema
- **Allowed licenses**: `CC0-1.0`, `MIT`, `CC-BY-4.0`, `CC-BY-3.0`, `INTERNAL-MIRAGINE` (repo reuse from `database-miraginewar/`), `GENERATED-SYNTH` (pipeline-generated fallback assets).
- **Forbidden**: `NC` (non-commercial), `ND`, `GPL`-only assets, or unverified/scraped assets without source URL.
- **Required sections**:
  1. `## Source Packs`: Markdown table with columns `sourceId | Pack Name | Author | License | Upstream URL | Version / Commit | Attribution Note`.
  2. `## Asset Provenance`: Markdown table with columns `Asset ID Pattern / Path | sourceId | Modifications Applied` (e.g., `normalized/vfx/vfx_fireball.png | internal_miragine | Copied & aligned to nativeFacing=right`).
  3. `## Required Attributions`: Verbatim credit block for any `CC-BY-*` packs (rendered in game credits/README).
