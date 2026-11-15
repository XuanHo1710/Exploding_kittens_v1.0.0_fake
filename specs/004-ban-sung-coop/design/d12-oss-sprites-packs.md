# d12 — Verified CC0/MIT OSS Top-Down Pixel Shooter Sprite Packs

## 1. Licensing & Fetch Policy
- **Allowed licenses:** `CC0-1.0` (Public Domain) and `MIT` only. Zero attribution-locked (`CC-BY-SA`, `GPL`) or custom anti-redistribution packs.
- **Explicitly excluded:** *Pixel Crawler* (Anokolisa — forbids repo/template redistribution), *Jetrel / Elthen / Buch* CC-BY/SA sheets (unnecessary given full CC0 coverage), and `crawl/tiles` entries listed in `TILES_UNDER_UNKNOWN_LICENSE.md`.
- **Fetch tiers:**
  - **Tier A (Automated CI / Node script):** GitHub raw/sparse-checkout, OpenGameArt `/sites/default/files/*`, SpritePilot `/free-assets/*` (all HTTP 200 verified).
  - **Tier B (Manual / `butler` optional):** Itch.io CC0 packs (session-gated direct ZIPs; keep offline fallback or manual mirror instructions in `database-ban-sung/README.md`).

## 2. Tier A — Verified Direct-Download CC0/MIT Packs

| Pack ID | Source & Direct Download URL | License | Grid | Primary Contents |
| :--- | :--- | :--- | :--- | :--- |
| `kenney-desert-shooter` | `shorepine/kenney` (`2d/Desert Shooter Pack`) — `https://raw.githubusercontent.com/shorepine/kenney/main/2d/Desert%20Shooter%20Pack/...` | CC0-1.0 | 16px / 24px | 16 player tiles, 16 enemy tiles, 40 guns (`24x24`), 234 desert tiles & 198 UI (`16x16`) |
| `kenney-topdown-shooter` | `shorepine/kenney` (`2d/Topdown Shooter`) | CC0-1.0 | ~48px / 64px | Hitmen, soldiers, survivors, robots, zombies (`stand/hold/gun/machine/reload`), 524 tiles |
| `kenney-tiny-dungeon` | `shorepine/kenney` (`2d/Tiny Dungeon` + `2d/Tiny Battle` + `2d/Tiny Town`) | CC0-1.0 | 16x16 | 462 tiles: crypt walls/floors, knights, mages, skeletons, crates, barrels, chests, coins |
| `kenney-pixel-shmup` | `shorepine/kenney` (`2d/Pixel Shmup`) | CC0-1.0 | 16px / 32px | 24 drones/gunships (`32x32`), 120 bullets/lasers/missiles/explosions (`16x16`) |
| `kenney-rts-scifi` | `shorepine/kenney` (`2d/RTS Sci-fi`) | CC0-1.0 | 64px / 128px | Cyber Lab metal floors, tech props, turrets, mech/drone units |
| `kenney-vfx-ui` | `shorepine/kenney` (`2d/Particle Pack`, `2d/Smoke Particles`, `ui/Cursor Pixel Pack`, `ui/Mobile Controls`) | CC0-1.0 | 16px–512px | Transparent muzzles/sparks/traces, smoke/explosion puffs, pixel crosshairs, touch sticks |
| `superpowers-tds` | `https://github.com/sparklinlabs/superpowers-asset-packs/archive/refs/heads/master.zip` (`top-down-shooter/`) | CC0-1.0 | 16px / 32px | Modular hero bodies/heads/legs, 12 guns + `attach-to-body` + `shoot`, robot, turret, tank, medikit/ammo/barrel |
| `superpowers-western` | `sparklinlabs/superpowers-asset-packs` (`western-fps-2d/`) | CC0-1.0 | 32x32 | Desert tileset, `cactus-1..3`, `explosive-barrel`, crates, chests, bones, explosion & smoke |
| `superpowers-fantasy` | `sparklinlabs/superpowers-asset-packs` (`medieval-fantasy/`, `ninja-adventure/`, `space-shooter/`) | CC0-1.0 | 16px / 32px | Monsters (`cyclop`, `goblin`, `skeleton`, `king skeleton`, `slim`, `bat`, `snake`), 31 FX, shields, HUD bars |
| `spritecook-pack` | `https://github.com/SpriteCook/spritecook-free-game-assets/archive/refs/heads/master.zip` | CC0-1.0 | 32px+ | Breakable `barrel`, `crate_intact/damaged`, `pot`, `urn`, `chest_closed/open`, `skeleton`, `slime`, `bat` |
| `oga-pixel-weapons` | `https://opengameart.org/content/10-pixel-weapons-0` -> `https://opengameart.org/sites/default/files/PixelWeapons_0.zip` | CC0-1.0 | ~32x16 | 10 side-view pixel firearms (AK47, SMG, shotgun, rifle) ideal for weapon-pivot & hotbar icons |
| `oga-m484-bullets1` | `https://opengameart.org/content/bullet-collection-1-m484` -> `.../files/M484BulletCollection1.png` | CC0-1.0 | 8px–24px | Sheet of pixel bullets, shotgun pellets, tracers, energy orbs |
| `oga-m484-bullets2` | `https://opengameart.org/content/bullet-collection-2-m484-games` -> `.../files/M484BulletCollection2.png` | CC0-1.0 | 8px–32px | Lasers, plasma rings, enemy radial-volley orbs, fire shots |
| `oga-rocket-16dir` | `https://opengameart.org/content/16-direction-rocket-projectile` -> `.../files/projectile_rocket_16x16.png` | CC0-1.0 | 16x16 | 16-angle pixel rocket strip (`22.5°` steps) for RPG/Overlord missiles |
| `oga-skeletons-rework` | `https://opengameart.org/content/skeletons-rework` -> `.../files/skeleton-1.4.zip` | CC0-1.0 | 24x32 / 48x64 | Animated standard, red-eye, warrior, and demon skeletons (4-dir walk/idle) |
| `oga-zombie-swarm` | `https://opengameart.org/content/endless-midnight-zombie-swarm-assets` -> `.../files/Images.zip` | CC0-1.0 | 32px–64px | Top-down shooter player, swarm zombies, guns with muzzle flares |
| `oga-16x16-explosion` | `https://opengameart.org/content/16x16-explosion` -> `.../files/explosion_4.zip` | CC0-1.0 | 16x16 | 5-frame Pico-8 palette pixel explosion strip |
| `oga-fireballs-fx` | `https://opengameart.org/content/assorted-fireballs-and-effects` -> `.../files/Projectiles_frames.zip` | CC0-1.0 | 32px–64px | Fireballs, sparks, hit flashes, burst frames |
| `oga-muzzle-flash` | `https://opengameart.org/content/16-toon-muzzle-flash` -> `.../files/muzzle_flashs.zip` | CC0-1.0 | 64px+ | 16 directional muzzle flash strips (downscale nearest-neighbor to 24x24) |
| `oga-dungeon-scifi` | `https://opengameart.org/content/16x16-dungeon-tiles` (`.../files/tileset.zip`) & `.../2d-sci-fi-platformer-tileset-16x16` (`.../Sci-Fi%20Platformer%20Tileset%20%5B16x16%5D%5BFREE%5D%20-%20RottingPixels.zip`) | CC0-1.0 | 16x16 | Crypt walls/doors/lava + RottingPixels sci-fi floor/wall panels |
| `spritepilot-packs` | `https://spritepilot.com/free-assets/{effects/spritepilot-effects-pack.zip,combat/spritepilot-combat-pack.zip,pickups/spritepilot-pickups-pack.zip}` | CC0-1.0 | 16px / 32px | Explosions, smoke puffs, dust, hit sparks, shockwaves, lasers, slams, coins, hearts, chests, shields |
| `crawl-tiles-cc0` | `https://github.com/crawl/tiles` (exclude `TILES_UNDER_UNKNOWN_LICENSE.md`) | CC0-1.0 | 32x32 | Huge monster/eye/beholder/undead/artifact library for elite & boss kitbashing |
| `unchained-tds-godot` | `https://github.com/Unchained112/SimpleTopDownShooterTemplate2D` | MIT | 32px | Reference top-down shooter trail/hit assets & Godot shaders |

## 3. Tier B — Verified Itch.io CC0 Supplements (Optional / Manual)

| Pack | Creator & URL | License | Grid | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| *16x16 DungeonTileset II* | 0x72 — `https://0x72.itch.io/dungeontileset-ii` | CC0-1.0 | 16x16 | High-polish animated heroes, goblins, slimes, demons, crypt tiles |
| *Simple Dungeon Crawler 16x16* | o_lobster — `https://o-lobster.itch.io/simple-dungeon-crawler-16x16-pixel-pack` | CC0-1.0 | 16x16 | Clean top-down hero/enemy idle+run loops, coins, potions |
| *PVFX Foundry / Explosion / Guns* | nerijs (*PVFX Foundry*), Skulitom (*CC0 Explosion*), AystarGames (*16x16 Guns*) on `itch.io` | CC0-1.0 | 16px–64px | Extra animated gun reloads, 32-frame 64x64 explosion, 101 hit VFX |

## 4. `ban_sung` Asset-Slot Mapping (All 6 Categories)
- **Heroes (Knight, Ranger, Mage, Engineer + Turret/Drone):** `superpowers-tds` (`characters/body|head|leg-animation`, `robot`, `turret`) + `kenney-desert-shooter` (`Players/Tiles` 16 sprites) + `kenney-tiny-dungeon` (knight/mage variants).
- **Guns & Muzzle Flashes (Pistol, SMG, Shotgun, AR, Sniper, Laser, RPG):** `kenney-desert-shooter` (`Weapons/Tiles` 40 guns) + `superpowers-tds` (`weapons/1..12`, `shoot/1..12`) + `oga-pixel-weapons` + `oga-muzzle-flash` + `kenney-vfx-ui` (`Particle Pack/muzzle_*`).
- **Bullets & Projectiles:** `oga-m484-bullets1` + `oga-m484-bullets2` + `oga-rocket-16dir` + `kenney-pixel-shmup` (`Tiles/`).
- **Monsters & 3 Bosses:**
  - *Mobs (Scarab, Bone Skirmisher, Bomb Goblin, Cactus Brute, Spitter, Sniper, Shaman, Mage):* `kenney-desert-shooter` (`Enemies/Tiles`), `oga-skeletons-rework`, `superpowers-fantasy` (`goblin`, `skeleton`, `slim`, `bat`, `snake`), `kenney-tiny-dungeon`, `oga-zombie-swarm`.
  - *Bosses (Sand Beholder, Dread Colossus, Overlord Core):* `superpowers-fantasy` (`cyclop` + `dragon`), `crawl-tiles-cc0` (floating eye/beholder + iron golem), `kenney-pixel-shmup` (`Ships` gunship core), `kenney-rts-scifi` (mech/turrets) + Miragine War reuse (`d13`).
- **Explosions, Impacts & Decals:** `spritepilot-packs` (`effects` + `combat`), `oga-16x16-explosion`, `oga-fireballs-fx`, `superpowers-western` (`fx/explosion`, `smoke-1..2`), `kenney-vfx-ui` (`Smoke Particles`, `Splat Pack` crater/scorch bases).
- **3 Biomes Tiles, Props & Pickups:**
  - *Desert Ruins:* `kenney-desert-shooter` (`Tiles/Tiles`) + `superpowers-western` (`0-tileset-32x32`, `cactus-1..3`, `explosive-barrel`, `crate-1..2`, `bone`).
  - *Crimson Crypt:* `kenney-tiny-dungeon` + `oga-dungeon-scifi` (`tileset.zip`) + `spritecook-pack` (`barrel`, `urn`, `pot`, `torch`, `chest_*`).
  - *Cyber Lab:* `kenney-rts-scifi` + `oga-dungeon-scifi` (`RottingPixels` sci-fi) + `superpowers-tds` (`background/tileset.png`).
  - *Pickups & HUD:* `spritepilot-packs` (`pickups`), `superpowers-tds` (`item/*`, `hud/*`), `kenney-vfx-ui` (`Cursor Pixel Pack`, `Mobile Controls`).

## 5. Source Registry Schema & Concrete Entries (for `d15-asset-pipeline-scripts`)

```ts
export interface SpriteSourceSpec {
  id: string;                 // e.g. "kenney-desert-shooter"
  license: 'CC0-1.0' | 'MIT';
  fetchType: 'git-sparse' | 'http-zip' | 'http-png' | 'manual-itch';
  url: string;                // repo or direct archive/PNG URL
  subpaths?: string[];        // sparse-checkout or zip extract globs
  nativeCellPx: number;       // 16 | 24 | 32 | 48 | 64
  targetCategory: 'heroes' | 'weapons' | 'projectiles' | 'mobs' | 'bosses' | 'vfx' | 'tiles' | 'ui';
}

export const BANSUNG_SPRITE_SOURCES: SpriteSourceSpec[] = [
  {
    id: 'kenney-sparse',
    license: 'CC0-1.0',
    fetchType: 'git-sparse',
    url: 'https://github.com/shorepine/kenney.git',
    subpaths: [
      '2d/Desert Shooter Pack', '2d/Tiny Dungeon', '2d/Tiny Battle', '2d/Tiny Town',
      '2d/Topdown Shooter', '2d/Pixel Shmup', '2d/RTS Sci-fi',
      '2d/Particle Pack', '2d/Smoke Particles', '2d/Splat Pack',
      'ui/Cursor Pixel Pack', 'ui/Mobile Controls',
    ],
    nativeCellPx: 16,
    targetCategory: 'tiles',
  },
  {
    id: 'superpowers-packs',
    license: 'CC0-1.0',
    fetchType: 'http-zip',
    url: 'https://github.com/sparklinlabs/superpowers-asset-packs/archive/refs/heads/master.zip',
    subpaths: ['top-down-shooter/**', 'western-fps-2d/**', 'medieval-fantasy/**', 'ninja-adventure/**', 'space-shooter/**'],
    nativeCellPx: 32,
    targetCategory: 'heroes',
  },
  {
    id: 'oga-m484-bullets1',
    license: 'CC0-1.0',
    fetchType: 'http-png',
    url: 'https://opengameart.org/sites/default/files/M484BulletCollection1.png',
    nativeCellPx: 16,
    targetCategory: 'projectiles',
  },
  {
    id: 'spritepilot-effects',
    license: 'CC0-1.0',
    fetchType: 'http-zip',
    url: 'https://spritepilot.com/free-assets/effects/spritepilot-effects-pack.zip',
    nativeCellPx: 32,
    targetCategory: 'vfx',
  },
];
```

## 6. Wave-2 Target Files
- `scripts/bansung-sources.json` — concrete `SpriteSourceSpec[]` array locking pinned commit SHAs / SHA-256 hashes of Tier A packs above.
- `scripts/fetch-bansung-sprites.mjs` — downloads Tier A archives/sparse Kenney & Superpowers trees into `database-ban-sung/_raw/`, verifies SHA-256, and hands off to normalization (`d14`/`d15`).
- `database-ban-sung/LICENSES.md` — auto-generated provenance ledger citing each pack's URL, author, and `CC0-1.0`/`MIT` text.
- `database-ban-sung/manifest.json` — runtime asset index consumed by `client/src/bansung/sprites.ts` (`d09`).
