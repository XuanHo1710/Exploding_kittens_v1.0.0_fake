# `database-ban-sung/` Asset Provenance & License Ledger

This ledger tracks every external OSS pack, internal Miragine War reuse asset, and pipeline-generated fallback asset used by the `ban_sung` co-op pixel shooter mode.

## License Policy & Excluded Sources

- **Allowed licenses:** `CC0-1.0`, `MIT`, `CC-BY-4.0`, `CC-BY-3.0`, `INTERNAL-MIRAGINE`, `GENERATED-SYNTH`.
- **Default shipping build:** Strictly `CC0-1.0`, `MIT`, `INTERNAL-MIRAGINE`, and `GENERATED-SYNTH` (zero attribution-locked dependencies). Optional `CC-BY-3.0` / `CC-BY-4.0` pools remain disabled by default and require preserving the verbatim credit blocks under [Required Attributions](#required-attributions) if enabled.
- **Strictly excluded / forbidden:** `CC-BY-SA-*`, `GPL`-only, `CC-BY-NC`, `CC-BY-ND`, or unverified/scraped URLs without upstream provenance:
  - *Pixel Crawler* (Anokolisa) — redistribution prohibited in repository/template bundles.
  - *Jetrel / Elthen / Buch* sheets — excluded (`CC-BY-SA` / attribution-locked; covered by `CC0-1.0`).
  - *Dungeon Crawl Stone Soup* files listed in `TILES_UNDER_UNKNOWN_LICENSE.md` — excluded.
  - `Laser-Fire-sfx_ogg_1.7z` (`sci-fi-laser-fire-sfx`) — excluded (`CC-BY-SA 3.0`).
  - Direct `https://kenney.nl/download-link/*` signed redirects (HTTP 403 to automated clients) — replaced with verified `CC0-1.0` GitHub mirrors.

---

## Source Packs

| sourceId | Pack Name | Author | License | Upstream URL | Version / Commit | Attribution Note |
|---|---|---|---|---|---|---|
| `internal_miragine` | Miragine War Local Assets (`database-miraginewar/`) | Internal Repo Reuse | `INTERNAL-MIRAGINE` | `database-miraginewar/mapping.json` | local-repo | Reused read-only from existing project database; normalized to `nativeFacing=right`. |
| `generated_synth` | Ban Sung Procedural Pixel & PCM WAV Synthesizer | Project Pipeline (`scripts/bansung/`) | `GENERATED-SYNTH` | `scripts/bansung/lib-pack.mjs` | v1 | Deterministic 48-color pixel art & `-1.0 dBFS` PCM WAV fallback synthesizer. |
| `kenney_desert_shooter` | Kenney Desert Shooter Pack | Kenney (mirror: `shorepine/kenney`) | `CC0-1.0` | https://github.com/shorepine/kenney | `main` | Public Domain (CC0 1.0); no attribution required. |
| `kenney_topdown_shooter` | Kenney Topdown Shooter | Kenney (mirror: `shorepine/kenney`) | `CC0-1.0` | https://github.com/shorepine/kenney | `main` | Public Domain (CC0 1.0); no attribution required. |
| `kenney_tiny_dungeon` | Kenney Tiny Dungeon / Tiny Battle / Tiny Town | Kenney (mirror: `shorepine/kenney`) | `CC0-1.0` | https://github.com/shorepine/kenney | `main` | Public Domain (CC0 1.0); no attribution required. |
| `kenney_pixel_shmup` | Kenney Pixel Shmup | Kenney (mirror: `shorepine/kenney`) | `CC0-1.0` | https://github.com/shorepine/kenney | `main` | Public Domain (CC0 1.0); no attribution required. |
| `kenney_rts_scifi` | Kenney RTS Sci-fi | Kenney (mirror: `shorepine/kenney`) | `CC0-1.0` | https://github.com/shorepine/kenney | `main` | Public Domain (CC0 1.0); no attribution required. |
| `kenney_vfx_ui` | Kenney Particle, Smoke, Splat, Cursor & Mobile UI | Kenney (mirror: `shorepine/kenney`) | `CC0-1.0` | https://github.com/shorepine/kenney | `main` | Public Domain (CC0 1.0); no attribution required. |
| `superpowers_asset_packs` | Superpowers Asset Packs (Sprites) | Sparklin Labs | `CC0-1.0` | https://github.com/sparklinlabs/superpowers-asset-packs | `master` | Public Domain (CC0 1.0); no attribution required. |
| `spritecook_pack` | SpriteCook Free Game Assets | SpriteCook | `CC0-1.0` | https://github.com/SpriteCook/spritecook-free-game-assets | `master` | Public Domain (CC0 1.0); no attribution required. |
| `oga_pixel_weapons` | 10 Pixel Weapons | OpenGameArt Contributor | `CC0-1.0` | https://opengameart.org/content/10-pixel-weapons-0 | archive | Public Domain (CC0 1.0). |
| `oga_m484_bullets1` | Bullet Collection 1 (M484) | Master484 | `CC0-1.0` | https://opengameart.org/content/bullet-collection-1-m484 | rev1 | Public Domain (CC0 1.0). |
| `oga_m484_bullets2` | Bullet Collection 2 (M484 Games) | Master484 | `CC0-1.0` | https://opengameart.org/content/bullet-collection-2-m484-games | rev1 | Public Domain (CC0 1.0). |
| `oga_rocket_16dir` | 16 Direction Rocket Projectile | OpenGameArt Contributor | `CC0-1.0` | https://opengameart.org/content/16-direction-rocket-projectile | rev1 | Public Domain (CC0 1.0). |
| `oga_skeletons_rework` | Skeletons Rework | OpenGameArt Contributor | `CC0-1.0` | https://opengameart.org/content/skeletons-rework | v1.4 | Public Domain (CC0 1.0). |
| `oga_zombie_swarm` | Endless Midnight Zombie Swarm Assets | OpenGameArt Contributor | `CC0-1.0` | https://opengameart.org/content/endless-midnight-zombie-swarm-assets | rev1 | Public Domain (CC0 1.0). |
| `oga_16x16_explosion` | 16x16 Explosion | OpenGameArt Contributor | `CC0-1.0` | https://opengameart.org/content/16x16-explosion | v4 | Public Domain (CC0 1.0). |
| `oga_fireballs_fx` | Assorted Fireballs and Effects | OpenGameArt Contributor | `CC0-1.0` | https://opengameart.org/content/assorted-fireballs-and-effects | rev1 | Public Domain (CC0 1.0). |
| `oga_muzzle_flash` | 16 Toon Muzzle Flash | OpenGameArt Contributor | `CC0-1.0` | https://opengameart.org/content/16-toon-muzzle-flash | rev1 | Public Domain (CC0 1.0). |
| `oga_dungeon_tiles` | 16x16 Dungeon Tiles | OpenGameArt Contributor | `CC0-1.0` | https://opengameart.org/content/16x16-dungeon-tiles | rev1 | Public Domain (CC0 1.0). |
| `oga_scifi_tiles` | 2D Sci-Fi Platformer Tileset [16x16] | RottingPixels | `CC0-1.0` | https://opengameart.org/content/2d-sci-fi-platformer-tileset-16x16 | rev1 | Public Domain (CC0 1.0). |
| `spritepilot_effects` | SpritePilot Effects Pack | SpritePilot | `CC0-1.0` | https://spritepilot.com/free-assets/effects/spritepilot-effects-pack.zip | rev1 | Public Domain (CC0 1.0). |
| `spritepilot_combat` | SpritePilot Combat Pack | SpritePilot | `CC0-1.0` | https://spritepilot.com/free-assets/combat/spritepilot-combat-pack.zip | rev1 | Public Domain (CC0 1.0). |
| `spritepilot_pickups` | SpritePilot Pickups Pack | SpritePilot | `CC0-1.0` | https://spritepilot.com/free-assets/pickups/spritepilot-pickups-pack.zip | rev1 | Public Domain (CC0 1.0). |
| `crawl_tiles_cc0` | Dungeon Crawl Stone Soup Tiles (CC0 subset) | DCSS Contributors | `CC0-1.0` | https://github.com/crawl/tiles | `master` | Public Domain (CC0 1.0); unknown-license list excluded. |
| `unchained_tds_godot` | SimpleTopDownShooterTemplate2D | Unchained112 | `MIT` | https://github.com/Unchained112/SimpleTopDownShooterTemplate2D | `main` | MIT License (retain copyright notice if bundled). |
| `itch_0x72_dungeontileset_ii` | 16x16 DungeonTileset II (Tier-B optional) | 0x72 | `CC0-1.0` | https://0x72.itch.io/dungeontileset-ii | manual | Public Domain (CC0 1.0); optional manual pack. |
| `itch_o_lobster_dungeon_16x16` | Simple Dungeon Crawler 16x16 (Tier-B optional) | o_lobster | `CC0-1.0` | https://o-lobster.itch.io/simple-dungeon-crawler-16x16-pixel-pack | manual | Public Domain (CC0 1.0); optional manual pack. |
| `itch_pvfx_foundry` | PVFX Foundry / CC0 Explosion / 16x16 Guns (Tier-B optional) | nerijs / Skulitom / AystarGames | `CC0-1.0` | https://itch.io | manual | Public Domain (CC0 1.0); optional manual pack. |
| `oss_free_firearms` | FreeFirearmsSFXLibrary | buddingmonkey (Kickstarter CC0 mirror) | `CC0-1.0` | https://github.com/buddingmonkey/FreeFirearmsSFXLibrary | `main` | Public Domain (CC0 1.0); no attribution required. |
| `oss_superpowers_sfx` | Superpowers Asset Packs (Audio) | Sparklin Labs | `CC0-1.0` | https://github.com/sparklinlabs/superpowers-asset-packs | `master` | Public Domain (CC0 1.0); no attribution required. |
| `oss_kenney_scifi_gh` | Kenney Sci-Fi Sounds (Godot Mirror) | Kenney (mirror: Boyquotes) | `CC0-1.0` | https://github.com/Boyquotes/kenney-sci-fi-sounds-for-godot | `main` | Public Domain (CC0 1.0); no attribution required. |
| `oss_oga_gunshot_zip` | OGA Gunshot Sounds (`sounds.zip`) | Tabasco | `CC0-1.0` | https://opengameart.org/content/gunshot-sounds | rev1 | Public Domain (CC0 1.0). |
| `oss_oga_gunshots_kurt` | OGA Gunshots (`22 Magnum.wav`) | kurt | `CC0-1.0` | https://opengameart.org/content/gunshots | rev1 | Public Domain (CC0 1.0). |
| `oss_oga_gun_reloads` | OGA Gun Reloads & Shotgun Sounds | SpringySpringo / zer0_sol / StarNinjas / BMacZero | `CC0-1.0` | https://opengameart.org/sites/default/files/ | rev1 | Public Domain (CC0 1.0). |
| `oss_oga_space_shoot` | OGA Space Shoot Sounds | Robin Lamb | `CC0-1.0` | https://opengameart.org/content/space-shoot-sounds | rev1 | Public Domain (CC0 1.0). |
| `oss_freesound_casings` | Freesound CC0 Shell Casings Previews | NicJonesAudio / GrayJoy / GryffDavid / BlondPanda / Metrolynn | `CC0-1.0` | https://cdn.freesound.org/previews/ | rev1 | Public Domain (CC0 1.0). |
| `oss_lavender_cc0_sounds` | CC0 Public Domain Sounds Collection | lavenderdotpet (mirror of Kenney / CC0 SFX) | `CC0-1.0` | https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds | `main` | Public Domain (CC0 1.0). |
| `oss_calinou_kenney_ui` | Kenney Interface Sounds (Mirror) | Kenney (mirror: Calinou) | `CC0-1.0` | https://github.com/Calinou/kenney-interface-sounds | `master` | Public Domain (CC0 1.0). |
| `oss_beatscribe_vgm` | Homebrew VGM Stingers | Beatscribe | `CC0-1.0` | https://github.com/Beatscribe/homebrew_vgm | `master` | Public Domain (CC0 1.0). |
| `oss_oga_sfx_misc` | OGA Single-File CC0 Explosions & Boss Roars | TinyWorlds / Joth / trazzz123 / greg300 / AntumDeluge | `CC0-1.0` | https://opengameart.org/ | rev1 | Public Domain (CC0 1.0). |
| `oss_oga_bgm_cc0` | OGA CC0 Combat & Lobby BGM Loops | SubspaceAudio (Juhani Junkala) / yd / cynicmusic / Joth / SketchyLogic / CleytonKauffman | `CC0-1.0` | https://opengameart.org/ | rev1 | Public Domain (CC0 1.0). |
| `oss_oga_cc0_bundles` | OGA Bulk CC0 SFX & Chiptune Archives (Optional) | SubspaceAudio / artisticdude / Ogrebane / wobbleboxx / SketchyLogic | `CC0-1.0` | https://opengameart.org/ | rev1 | Public Domain (CC0 1.0). |
| `oss_oga_baradari_shots` | Chaingun, Pistol, Rifle, Shotgun Shots (Optional) | Michel Baradari / qubodup | `CC-BY-3.0` | https://opengameart.org/content/chaingun-pistol-rifle-shotgun-shots | optional | Optional pool; disabled by default. Requires CC-BY-3.0 credit if enabled. |
| `oss_oga_koenig_shotgun` | Shotgun Shoot + Reload (Optional) | Mike Koenig / qubodup | `CC-BY-3.0` | https://opengameart.org/content/shotgun-shoot-reload | optional | Optional pool; disabled by default. Requires CC-BY-3.0 credit if enabled. |
| `oss_oga_dklon_sfx` | Laser Fire & Boom Pack 1 (Optional) | dklon | `CC-BY-3.0` | https://opengameart.org/content/laser-fire | optional | Optional pool; disabled by default. Requires CC-BY-3.0 credit if enabled. |
| `oss_oga_lrsf_sfx` | Sci-Fi & 8-Bit Sound Libraries (Optional) | Little Robot Sound Factory | `CC-BY-3.0` | https://opengameart.org/ | optional | Optional pool; disabled by default. Requires CC-BY-3.0 credit if enabled. |
| `oss_oga_virix_ui` | UI Pack 1 (Optional) | ViRiX | `CC-BY-3.0` | https://opengameart.org/sites/default/files/UI%20pack%201.zip | optional | Optional pool; disabled by default. Requires CC-BY-3.0 credit if enabled. |
| `oss_meta_oculus_pack1` | Oculus Audio Pack 01 (Optional) | Oculus VR, LLC | `CC-BY-4.0` | https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/ | optional | Optional pool; disabled by default. Requires CC-BY-4.0 credit if enabled. |

---

## Asset Provenance

Generated by `scripts/bansung/pack-manifest.mjs` at `2026-11-15T13:29:13.212Z`.
- **Manifest index**: `611` sprite keys, `254` audio keys.
- **Tracked files on disk**: `573` canonical asset files under `normalized/**`, `audio/**`, and `sprites/miragine/`.

| Asset ID Pattern / Path | sourceId | Modifications Applied |
|---|---|---|
| `audio/bgm/bgm_boss_chiptune.ogg` | `oss_oga_bgm_cc0` | BGM track (71724ms) from https://opengameart.org/sites/default/files/Juhani%20Junkala%20%5BChiptune%20Adventures%5D%203.%20Boss%20Fight.ogg; sha256=1c5521a07cf5 |
| `audio/bgm/bgm_boss_chiptune.wav` | `generated_synth` | BGM track (6667ms) from synth_wav; sha256=88cfc7ef461d |
| `audio/bgm/bgm_boss_epic.ogg` | `oss_oga_bgm_cc0` | BGM track (123481ms) from https://opengameart.org/sites/default/files/audio_preview/Juhani%20Junkala%20-%20Epic%20Boss%20Battle%20Preview.mp3.ogg; sha256=8540e3afefea |
| `audio/bgm/bgm_boss_epic.wav` | `generated_synth` | BGM track (6667ms) from synth_wav; sha256=8b855b105bbb |
| `audio/bgm/bgm_boss_nes.ogg` | `oss_oga_bgm_cc0` | BGM track (66150ms) from https://opengameart.org/sites/default/files/Boss.ogg; sha256=30a94b4e119b |
| `audio/bgm/bgm_boss_nes.wav` | `generated_synth` | BGM track (6667ms) from synth_wav; sha256=954c8f5419f5 |
| `audio/bgm/bgm_boss_rpg.ogg` | `oss_oga_bgm_cc0` | BGM track (114338ms) from https://opengameart.org/sites/default/files/CleytonRX%20-%20Battle%20RPG%20Theme%20Var_0.ogg; sha256=9a63f74305f5 |
| `audio/bgm/bgm_boss_rpg.wav` | `generated_synth` | BGM track (6667ms) from synth_wav; sha256=72f37b460e2b |
| `audio/bgm/bgm_crypt_alt.ogg` | `oss_oga_bgm_cc0` | BGM track (56104ms) from https://opengameart.org/sites/default/files/Juhani%20Junkala%20%5BChiptune%20Adventures%5D%202.%20Stage%202.ogg; sha256=68ec252839e1 |
| `audio/bgm/bgm_crypt_alt.wav` | `generated_synth` | BGM track (7273ms) from synth_wav; sha256=cea3c1195f0d |
| `audio/bgm/bgm_crypt.mp3` | `oss_oga_bgm_cc0` | BGM track (95922ms) from https://opengameart.org/sites/default/files/battleThemeA.mp3; sha256=6042399782e5 |
| `audio/bgm/bgm_crypt.wav` | `generated_synth` | BGM track (7273ms) from synth_wav; sha256=51e116836dc8 |
| `audio/bgm/bgm_cyber_nes.ogg` | `oss_oga_bgm_cc0` | BGM track (46830ms) from https://opengameart.org/sites/default/files/Mars.ogg; sha256=4a7daa0e05ee |
| `audio/bgm/bgm_cyber_nes.wav` | `generated_synth` | BGM track (6957ms) from synth_wav; sha256=cbb0458677ca |
| `audio/bgm/bgm_cyber.mp3` | `oss_oga_bgm_cc0` | BGM track (116741ms) from https://opengameart.org/sites/default/files/Cyberpunk%20Moonlight%20Sonata%20v2.mp3; sha256=c195845dab8b |
| `audio/bgm/bgm_cyber.wav` | `generated_synth` | BGM track (6957ms) from synth_wav; sha256=a71c1d0dbb79 |
| `audio/bgm/bgm_defeat.wav` | `generated_synth` | BGM track (10000ms) from synth_wav; sha256=cacc9cf67606 |
| `audio/bgm/bgm_desert_chiptune.ogg` | `oss_oga_bgm_cc0` | BGM track (41143ms) from https://opengameart.org/sites/default/files/Juhani%20Junkala%20%5BChiptune%20Adventures%5D%201.%20Stage%201.ogg; sha256=cd35b9cf8929 |
| `audio/bgm/bgm_desert_chiptune.wav` | `generated_synth` | BGM track (7500ms) from synth_wav; sha256=6a0b77a3fc2e |
| `audio/bgm/bgm_desert.ogg` | `oss_oga_bgm_cc0` | BGM track (98400ms) from https://opengameart.org/sites/default/files/caravan.ogg.ogg; sha256=086f52dc18e1 |
| `audio/bgm/bgm_desert.wav` | `generated_synth` | BGM track (7500ms) from synth_wav; sha256=eaa9a204c915 |
| `audio/bgm/bgm_lobby_alt.mp3` | `oss_oga_bgm_cc0` | BGM track (14733ms) from https://opengameart.org/sites/default/files/title%20screen.mp3; sha256=1c42b554884e |
| `audio/bgm/bgm_lobby_alt.wav` | `generated_synth` | BGM track (8571ms) from synth_wav; sha256=8f34df131c4c |
| `audio/bgm/bgm_lobby.ogg` | `oss_oga_bgm_cc0` | BGM track (21333ms) from https://opengameart.org/sites/default/files/Juhani%20Junkala%20%5BChiptune%20Adventures%5D%204.%20Stage%20Select.ogg; sha256=8d5c04561070 |
| `audio/bgm/bgm_lobby.wav` | `generated_synth` | BGM track (8571ms) from synth_wav; sha256=8f34df131c4c |
| `audio/bgm/bgm_victory.mp3` | `oss_oga_bgm_cc0` | BGM track (55223ms) from https://opengameart.org/sites/default/files/ending.mp3; sha256=3109e273fc20 |
| `audio/bgm/bgm_victory.wav` | `generated_synth` | BGM track (7742ms) from synth_wav; sha256=299bbf20b661 |
| `audio/sfx/fx/bomb_bounce.ogg` | `oss_lavender_cc0_sounds` | SFX clip (159ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactTin_medium_000.ogg; sha256=f4bbee66ca19 |
| `audio/sfx/fx/bomb_bounce.wav` | `generated_synth` | SFX clip (50ms) from synth_wav; sha256=24117e08f729 |
| `audio/sfx/fx/bomb_throw.wav` | `oss_lavender_cc0_sounds` | SFX clip (514ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/Micro%20Pack%20-%20Organic%20Wooshes/Swish%202.wav; sha256=33028cd385b5 |
| `audio/sfx/fx/boss_alarm.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1979ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/30-cc0-sfx-loops/alarm_01.ogg; sha256=c610a2e85119 |
| `audio/sfx/fx/boss_alarm.wav` | `generated_synth` | SFX clip (136ms) from synth_wav; sha256=6e9b85e29adb |
| `audio/sfx/fx/boss_beam.ogg` | `oss_kenney_scifi_gh` | SFX clip (954ms) from https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/force_field_000.ogg; sha256=c2916f2a062c |
| `audio/sfx/fx/boss_beam.wav` | `generated_synth` | SFX clip (390ms) from synth_wav; sha256=3cf942aa2677 |
| `audio/sfx/fx/boss_growl.ogg` | `oss_lavender_cc0_sounds` | SFX clip (640ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/80-CC0-RPG-SFX/creature_roar_01.ogg; sha256=ca1b9198490f |
| `audio/sfx/fx/boss_growl.wav` | `generated_synth` | SFX clip (500ms) from synth_wav; sha256=f39f8936febc |
| `audio/sfx/fx/boss_roar_1.ogg` | `oss_lavender_cc0_sounds` | SFX clip (373ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/80-CC0-creature-SFX/roar_01.ogg; sha256=e9d44326860a |
| `audio/sfx/fx/boss_roar_1.wav` | `generated_synth` | SFX clip (665ms) from synth_wav; sha256=9b1a48fde114 |
| `audio/sfx/fx/boss_roar_2.ogg` | `oss_lavender_cc0_sounds` | SFX clip (903ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/80-CC0-creature-SFX/roar_02.ogg; sha256=ceb532ee0fe7 |
| `audio/sfx/fx/boss_roar_2.wav` | `generated_synth` | SFX clip (656ms) from synth_wav; sha256=d2f1d5920229 |
| `audio/sfx/fx/boss_roar_beast.ogg` | `oss_oga_sfx_misc` | SFX clip (1540ms) from https://opengameart.org/sites/default/files/gorilla_roar.ogg; sha256=b637e567f6df |
| `audio/sfx/fx/boss_roar_beast.wav` | `generated_synth` | SFX clip (658ms) from synth_wav; sha256=ca209337b07c |
| `audio/sfx/fx/boss_roar_deep.wav` | `oss_oga_sfx_misc` | SFX clip (4000ms) from https://opengameart.org/sites/default/files/monster_roar.wav; sha256=36bc04c096a4 |
| `audio/sfx/fx/boss_roar_retro.mp3` | `oss_oga_sfx_misc` | SFX clip (784ms) from https://opengameart.org/sites/default/files/Skeleton%20Roar.mp3; sha256=4186fe3281b4 |
| `audio/sfx/fx/boss_roar_retro.wav` | `generated_synth` | SFX clip (665ms) from synth_wav; sha256=907392d35389 |
| `audio/sfx/fx/boss_slam.ogg` | `oss_lavender_cc0_sounds` | SFX clip (937ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactMining_000.ogg; sha256=36b4ea107222 |
| `audio/sfx/fx/boss_slam.wav` | `generated_synth` | SFX clip (442ms) from synth_wav; sha256=b8a733f6f2b5 |
| `audio/sfx/fx/crate_break.ogg` | `oss_lavender_cc0_sounds` | SFX clip (313ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactWood_heavy_000.ogg; sha256=15ff82332f34 |
| `audio/sfx/fx/crate_break.wav` | `generated_synth` | SFX clip (149ms) from synth_wav; sha256=8dbdf2c716f2 |
| `audio/sfx/fx/crit_hit.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1480ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactBell_heavy_000.ogg; sha256=94b8bb5f2d43 |
| `audio/sfx/fx/crit_hit.wav` | `generated_synth` | SFX clip (101ms) from synth_wav; sha256=045dcf5a9a40 |
| `audio/sfx/fx/dash_blink.ogg` | `oss_lavender_cc0_sounds` | SFX clip (447ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/50-cc0-sci-fi-sfx/teleport_01.ogg; sha256=88d1d00c7d91 |
| `audio/sfx/fx/dash_blink.wav` | `generated_synth` | SFX clip (160ms) from synth_wav; sha256=11e3fe1e4cd7 |
| `audio/sfx/fx/dash_swipe.ogg` | `oss_lavender_cc0_sounds` | SFX clip (259ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Misc/ogg/Swipe1.ogg; sha256=a5efb775a107 |
| `audio/sfx/fx/dash_swipe.wav` | `generated_synth` | SFX clip (129ms) from synth_wav; sha256=e42329626b36 |
| `audio/sfx/fx/dash_whoosh.wav` | `oss_lavender_cc0_sounds` | SFX clip (356ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/Micro%20Pack%20-%20Organic%20Wooshes/Swish%201.wav; sha256=1949354003db |
| `audio/sfx/fx/expl_bomb_1.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1696ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Guns/ogg/Bomb1.ogg; sha256=5d79e962cfb3 |
| `audio/sfx/fx/expl_bomb_1.wav` | `generated_synth` | SFX clip (604ms) from synth_wav; sha256=920d3e020527 |
| `audio/sfx/fx/expl_bomb_2.ogg` | `oss_lavender_cc0_sounds` | SFX clip (2858ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Guns/ogg/Bomb2.ogg; sha256=431bf6a99569 |
| `audio/sfx/fx/expl_bomb_2.wav` | `generated_synth` | SFX clip (591ms) from synth_wav; sha256=7ce150cde6e1 |
| `audio/sfx/fx/expl_chunky.mp3` | `oss_oga_sfx_misc` | SFX clip (5616ms) from https://opengameart.org/sites/default/files/Chunky%20Explosion.mp3; sha256=4de53bffac18 |
| `audio/sfx/fx/expl_chunky.wav` | `generated_synth` | SFX clip (609ms) from synth_wav; sha256=e534a83f9aae |
| `audio/sfx/fx/expl_grenade_1.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1651ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Explosions/ogg/Explosion1.ogg; sha256=edc8271a3ae2 |
| `audio/sfx/fx/expl_grenade_1.wav` | `generated_synth` | SFX clip (650ms) from synth_wav; sha256=256346b61d49 |
| `audio/sfx/fx/expl_grenade_2.ogg` | `oss_lavender_cc0_sounds` | SFX clip (647ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Explosions/ogg/Explosion10.ogg; sha256=1dace8c09146 |
| `audio/sfx/fx/expl_grenade_2.wav` | `generated_synth` | SFX clip (600ms) from synth_wav; sha256=783be707dc61 |
| `audio/sfx/fx/expl_heavy.wav` | `oss_oga_sfx_misc` | SFX clip (984ms) from https://opengameart.org/sites/default/files/explosion.wav; sha256=1efccb6c2bab |
| `audio/sfx/fx/expl_retro.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1246ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/50-CC0-retro-synth-SFX/retro_explosion_01.ogg; sha256=629f8bd61745 |
| `audio/sfx/fx/expl_retro.wav` | `generated_synth` | SFX clip (287ms) from synth_wav; sha256=c76b32bd5b86 |
| `audio/sfx/fx/expl_scifi.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1840ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/50-cc0-sci-fi-sfx/explosion_01.ogg; sha256=2ba5012301d0 |
| `audio/sfx/fx/expl_scifi.wav` | `generated_synth` | SFX clip (300ms) from synth_wav; sha256=cb4028b2626e |
| `audio/sfx/fx/heal_pulse.ogg` | `oss_lavender_cc0_sounds` | SFX clip (522ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/powerUp7.ogg; sha256=9048d651b51f |
| `audio/sfx/fx/heal_pulse.wav` | `generated_synth` | SFX clip (190ms) from synth_wav; sha256=c4ab05a05583 |
| `audio/sfx/fx/hit_arcade.ogg` | `oss_lavender_cc0_sounds` | SFX clip (281ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Impact/ogg/Impact1.ogg; sha256=eeab12b7dc34 |
| `audio/sfx/fx/hit_arcade.wav` | `generated_synth` | SFX clip (65ms) from synth_wav; sha256=7de73edcb2a2 |
| `audio/sfx/fx/hit_armor.ogg` | `oss_lavender_cc0_sounds` | SFX clip (168ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactMetal_heavy_000.ogg; sha256=e07045693e4a |
| `audio/sfx/fx/hit_armor.wav` | `generated_synth` | SFX clip (82ms) from synth_wav; sha256=aaf94f119e41 |
| `audio/sfx/fx/hit_flesh_1.ogg` | `oss_lavender_cc0_sounds` | SFX clip (265ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/100-CC0-SFX/hit_01.ogg; sha256=fee785537678 |
| `audio/sfx/fx/hit_flesh_1.wav` | `generated_synth` | SFX clip (65ms) from synth_wav; sha256=8bd71fd763c1 |
| `audio/sfx/fx/hit_flesh_2.ogg` | `oss_lavender_cc0_sounds` | SFX clip (729ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/75-cc0-breaking-falling-hit-sfx/bfh1_hit_01.ogg; sha256=56c627582671 |
| `audio/sfx/fx/hit_flesh_2.wav` | `generated_synth` | SFX clip (65ms) from synth_wav; sha256=670c707082eb |
| `audio/sfx/fx/hit_plate.ogg` | `oss_lavender_cc0_sounds` | SFX clip (489ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactPlate_heavy_000.ogg; sha256=112d4f93ddcc |
| `audio/sfx/fx/hit_plate.wav` | `generated_synth` | SFX clip (110ms) from synth_wav; sha256=f923b20a0f8d |
| `audio/sfx/fx/mob_die.ogg` | `oss_lavender_cc0_sounds` | SFX clip (472ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/80-CC0-creature-sfx-2/die_01.ogg; sha256=d592dfbbe36a |
| `audio/sfx/fx/mob_die.wav` | `generated_synth` | SFX clip (114ms) from synth_wav; sha256=67627b9e6955 |
| `audio/sfx/fx/mob_hurt.ogg` | `oss_lavender_cc0_sounds` | SFX clip (495ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/80-CC0-creature-SFX/hurt_01.ogg; sha256=619f9f2b4bc6 |
| `audio/sfx/fx/mob_hurt.wav` | `generated_synth` | SFX clip (160ms) from synth_wav; sha256=25d31601734c |
| `audio/sfx/fx/mob_spawn.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1744ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/50-cc0-sci-fi-sfx/teleport_02.ogg; sha256=1776e7df75ba |
| `audio/sfx/fx/mob_spawn.wav` | `generated_synth` | SFX clip (159ms) from synth_wav; sha256=46da48eca3d0 |
| `audio/sfx/fx/pickup_coin.ogg` | `oss_lavender_cc0_sounds` | SFX clip (406ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/80-CC0-RPG-SFX/item_coins_01.ogg; sha256=4e701b281a4f |
| `audio/sfx/fx/pickup_coin.wav` | `generated_synth` | SFX clip (157ms) from synth_wav; sha256=86bcb2a8114a |
| `audio/sfx/fx/pickup_hp.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1202ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/powerUp1.ogg; sha256=8c361b624b56 |
| `audio/sfx/fx/pickup_hp.wav` | `generated_synth` | SFX clip (194ms) from synth_wav; sha256=692e1cddc4ec |
| `audio/sfx/fx/pickup_orb.ogg` | `oss_lavender_cc0_sounds` | SFX clip (522ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/pepSound1.ogg; sha256=f2f44effce08 |
| `audio/sfx/fx/pickup_orb.wav` | `generated_synth` | SFX clip (58ms) from synth_wav; sha256=8f7d7d0a9cae |
| `audio/sfx/fx/pickup_perk.ogg` | `oss_lavender_cc0_sounds` | SFX clip (501ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/50-CC0-retro-synth-SFX/power_up_01.ogg; sha256=b1645b0dfe0a |
| `audio/sfx/fx/pickup_perk.wav` | `generated_synth` | SFX clip (301ms) from synth_wav; sha256=cfcaebaf2424 |
| `audio/sfx/fx/pickup_weapon.wav` | `oss_calinou_kenney_ui` | SFX clip (260ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/maximize_001.wav; sha256=3c957fa032ca |
| `audio/sfx/fx/ping_coop.wav` | `oss_calinou_kenney_ui` | SFX clip (132ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/bong_001.wav; sha256=1499e9eb843a |
| `audio/sfx/fx/player_down.ogg` | `oss_lavender_cc0_sounds` | SFX clip (784ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/lowDown.ogg; sha256=e0215fcfd8b9 |
| `audio/sfx/fx/player_down.wav` | `generated_synth` | SFX clip (361ms) from synth_wav; sha256=d4df52faef4b |
| `audio/sfx/fx/player_hurt.ogg` | `oss_lavender_cc0_sounds` | SFX clip (221ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Impact/ogg/Impact3.ogg; sha256=5f72ff4977f2 |
| `audio/sfx/fx/player_hurt.wav` | `generated_synth` | SFX clip (133ms) from synth_wav; sha256=b9d1b613d51d |
| `audio/sfx/fx/revive_done.wav` | `oss_calinou_kenney_ui` | SFX clip (545ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/confirmation_002.wav; sha256=96c57e4e7a05 |
| `audio/sfx/fx/revive_tick.wav` | `oss_calinou_kenney_ui` | SFX clip (27ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/tick_001.wav; sha256=c94917dd67b8 |
| `audio/sfx/fx/shield_break.ogg` | `oss_lavender_cc0_sounds` | SFX clip (241ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactGlass_heavy_000.ogg; sha256=b44b39a940e8 |
| `audio/sfx/fx/shield_break.wav` | `generated_synth` | SFX clip (148ms) from synth_wav; sha256=61af3a94cbff |
| `audio/sfx/fx/sniper_lock.ogg` | `oss_lavender_cc0_sounds` | SFX clip (724ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/twoTone1.ogg; sha256=8732f14d6398 |
| `audio/sfx/fx/sniper_lock.wav` | `generated_synth` | SFX clip (136ms) from synth_wav; sha256=6e9b85e29adb |
| `audio/sfx/fx/stinger_bleedout.ogg` | `oss_beatscribe_vgm` | SFX clip (2500ms) from https://raw.githubusercontent.com/Beatscribe/homebrew_vgm/master/SEGA_GEN/fanfares/ogg/time_running_out.ogg; sha256=76f6499084c2 |
| `audio/sfx/fx/stinger_bleedout.wav` | `generated_synth` | SFX clip (361ms) from synth_wav; sha256=d4df52faef4b |
| `audio/sfx/fx/stinger_boss.ogg` | `oss_beatscribe_vgm` | SFX clip (4000ms) from https://raw.githubusercontent.com/Beatscribe/homebrew_vgm/master/SNES/ogg/boss_appears.ogg; sha256=ff19f3a9c55d |
| `audio/sfx/fx/stinger_boss.wav` | `generated_synth` | SFX clip (655ms) from synth_wav; sha256=19073743fc3c |
| `audio/sfx/fx/stinger_lose.ogg` | `oss_beatscribe_vgm` | SFX clip (3500ms) from https://raw.githubusercontent.com/Beatscribe/homebrew_vgm/master/SNES/ogg/game_over.ogg; sha256=3fcd812595ea |
| `audio/sfx/fx/stinger_lose.wav` | `generated_synth` | SFX clip (648ms) from synth_wav; sha256=0af3fa88557d |
| `audio/sfx/fx/stinger_wave.ogg` | `oss_beatscribe_vgm` | SFX clip (5000ms) from https://raw.githubusercontent.com/Beatscribe/homebrew_vgm/master/SNES/ogg/level_start.ogg; sha256=c903c106a332 |
| `audio/sfx/fx/stinger_wave.wav` | `generated_synth` | SFX clip (375ms) from synth_wav; sha256=b4fa69c29ea8 |
| `audio/sfx/fx/stinger_win.ogg` | `oss_beatscribe_vgm` | SFX clip (5000ms) from https://raw.githubusercontent.com/Beatscribe/homebrew_vgm/master/SNES/ogg/victory.ogg; sha256=22b07c077d50 |
| `audio/sfx/fx/stinger_win.wav` | `generated_synth` | SFX clip (604ms) from synth_wav; sha256=0481fc6b5c8c |
| `audio/sfx/fx/stun_bang_1.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1034ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/25-CC0-bang-sfx/bang_01.ogg; sha256=5f4c32527a74 |
| `audio/sfx/fx/stun_bang_1.wav` | `generated_synth` | SFX clip (359ms) from synth_wav; sha256=c902587dd9db |
| `audio/sfx/fx/stun_bang_2.ogg` | `oss_lavender_cc0_sounds` | SFX clip (895ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/25-CC0-bang-sfx/bang_02.ogg; sha256=0f0c960888e6 |
| `audio/sfx/fx/stun_bang_2.wav` | `generated_synth` | SFX clip (360ms) from synth_wav; sha256=6e1c0b733f51 |
| `audio/sfx/fx/stun_down.ogg` | `oss_lavender_cc0_sounds` | SFX clip (522ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/highDown.ogg; sha256=cdbea353b2e4 |
| `audio/sfx/fx/stun_down.wav` | `generated_synth` | SFX clip (303ms) from synth_wav; sha256=7daaa05ff8f0 |
| `audio/sfx/fx/stun_elec_arc.ogg` | `oss_lavender_cc0_sounds` | SFX clip (355ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Misc/ogg/Electric3.ogg; sha256=4eb9ed87fee5 |
| `audio/sfx/fx/stun_elec_arc.wav` | `generated_synth` | SFX clip (149ms) from synth_wav; sha256=4efe9a8eb472 |
| `audio/sfx/fx/stun_emp_zap.ogg` | `oss_lavender_cc0_sounds` | SFX clip (810ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Misc/ogg/Electric2.ogg; sha256=e229cdb18f1d |
| `audio/sfx/fx/stun_emp_zap.wav` | `generated_synth` | SFX clip (304ms) from synth_wav; sha256=2936b0eccd5c |
| `audio/sfx/fx/stun_loop.ogg` | `oss_lavender_cc0_sounds` | SFX clip (1364ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Misc/ogg/Electric1Loop.ogg; sha256=cd4a4056cb5f |
| `audio/sfx/fx/stun_loop.wav` | `generated_synth` | SFX clip (359ms) from synth_wav; sha256=253a96e11ed1 |
| `audio/sfx/fx/turret_deploy.wav` | `oss_calinou_kenney_ui` | SFX clip (148ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/open_001.wav; sha256=3a33b233990b |
| `audio/sfx/fx/turret_shot.ogg` | `oss_kenney_scifi_gh` | SFX clip (344ms) from https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_small_002.ogg; sha256=e70139466c3e |
| `audio/sfx/fx/turret_shot.wav` | `generated_synth` | SFX clip (48ms) from synth_wav; sha256=95255c00edb7 |
| `audio/sfx/fx/ui_back.wav` | `oss_calinou_kenney_ui` | SFX clip (68ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/back_001.wav; sha256=69f2f18c7042 |
| `audio/sfx/fx/ui_click.wav` | `oss_calinou_kenney_ui` | SFX clip (115ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/click_001.wav; sha256=71a911374508 |
| `audio/sfx/fx/ui_confirm.wav` | `oss_calinou_kenney_ui` | SFX clip (295ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/confirmation_001.wav; sha256=d5d55c9f1f49 |
| `audio/sfx/fx/ui_deny.wav` | `oss_calinou_kenney_ui` | SFX clip (173ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/error_001.wav; sha256=1e0c3962241b |
| `audio/sfx/fx/ui_glitch.wav` | `oss_calinou_kenney_ui` | SFX clip (25ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/glitch_001.wav; sha256=59c0c63cbdee |
| `audio/sfx/fx/ui_select.wav` | `oss_calinou_kenney_ui` | SFX clip (61ms) from https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/select_001.wav; sha256=b28202154fff |
| `audio/sfx/fx/wave_clear.ogg` | `oss_lavender_cc0_sounds` | SFX clip (496ms) from https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/phaserUp1.ogg; sha256=4423d459fc15 |
| `audio/sfx/fx/wave_clear.wav` | `generated_synth` | SFX clip (401ms) from synth_wav; sha256=4451cd2ea2a1 |
| `audio/sfx/weapons/sfx_wpn_casing_shotgun.mp3` | `oss_freesound_casings` | SFX clip (2325ms) from https://cdn.freesound.org/previews/620/620929_6493174-hq.mp3; sha256=b44f6210989b |
| `audio/sfx/weapons/sfx_wpn_casing_shotgun.wav` | `generated_synth` | SFX clip (133ms) from synth_wav; sha256=ef1d28df980d |
| `audio/sfx/weapons/sfx_wpn_casing_spin.mp3` | `oss_freesound_casings` | SFX clip (504ms) from https://cdn.freesound.org/previews/777/777922_8927049-hq.mp3; sha256=2b11bd3a88d5 |
| `audio/sfx/weapons/sfx_wpn_casing_spin.wav` | `generated_synth` | SFX clip (133ms) from synth_wav; sha256=8991835d6e0d |
| `audio/sfx/weapons/sfx_wpn_casing_v2.wav` | `generated_synth` | SFX clip (133ms) from scripts/bansung/fetch-audio-guns.mjs#synthesizeWeaponWav; sha256=0ee44bd07bdd |
| `audio/sfx/weapons/sfx_wpn_casing_v3.wav` | `generated_synth` | SFX clip (133ms) from scripts/bansung/fetch-audio-guns.mjs#synthesizeWeaponWav; sha256=b63daffbfccd |
| `audio/sfx/weapons/sfx_wpn_casing.mp3` | `oss_freesound_casings` | SFX clip (1933ms) from https://cdn.freesound.org/previews/347/347603_3511792-hq.mp3; sha256=6374f122af43 |
| `audio/sfx/weapons/sfx_wpn_casing.wav` | `generated_synth` | SFX clip (133ms) from synth_wav; sha256=01d5721da6af |
| `audio/sfx/weapons/sfx_wpn_cock_shotgun.wav` | `oss_oga_gun_reloads` | SFX clip (474ms) from https://opengameart.org/sites/default/files/shotguncock_0.wav; sha256=f48de69bd8cd |
| `audio/sfx/weapons/sfx_wpn_dryfire.wav` | `oss_superpowers_sfx` | SFX clip (118ms) from https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/top-down-shooter/sounds/no-ammo.wav; sha256=0619b71d57ef |
| `audio/sfx/weapons/sfx_wpn_laser_arc.wav` | `oss_superpowers_sfx` | SFX clip (350ms) from https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/space-shooter/sounds/laser.wav; sha256=821844387a47 |
| `audio/sfx/weapons/sfx_wpn_laser_retro.ogg` | `oss_kenney_scifi_gh` | SFX clip (235ms) from https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_retro_000.ogg; sha256=2a203a007d24 |
| `audio/sfx/weapons/sfx_wpn_laser_retro.wav` | `generated_synth` | SFX clip (159ms) from synth_wav; sha256=d3c6dcc22e9c |
| `audio/sfx/weapons/sfx_wpn_laser_v2.ogg` | `oss_kenney_scifi_gh` | SFX clip (247ms) from https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_small_001.ogg; sha256=ab87913aba97 |
| `audio/sfx/weapons/sfx_wpn_laser_v2.wav` | `generated_synth` | SFX clip (158ms) from synth_wav; sha256=ff7df9a61064 |
| `audio/sfx/weapons/sfx_wpn_laser.ogg` | `oss_kenney_scifi_gh` | SFX clip (239ms) from https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_small_000.ogg; sha256=72b589eadd41 |
| `audio/sfx/weapons/sfx_wpn_laser.wav` | `generated_synth` | SFX clip (160ms) from synth_wav; sha256=8ff50b69166c |
| `audio/sfx/weapons/sfx_wpn_mag_insert.wav` | `oss_oga_gun_reloads` | SFX clip (242ms) from https://opengameart.org/sites/default/files/clipload1.wav; sha256=42d7b2d0492f |
| `audio/sfx/weapons/sfx_wpn_pistol_arcade.wav` | `oss_superpowers_sfx` | SFX clip (350ms) from https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/top-down-shooter/sounds/shoot-1.wav; sha256=ed53ddebf3d4 |
| `audio/sfx/weapons/sfx_wpn_pistol_v2.wav` | `oss_free_firearms` | SFX clip (450ms) from https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/Walther%20PPQ/X_31P.wav; sha256=20088a4f7997 |
| `audio/sfx/weapons/sfx_wpn_pistol_v3.wav` | `oss_oga_gunshot_zip` | SFX clip (450ms) from https://opengameart.org/sites/default/files/sounds.zip#sounds/cz.wav; sha256=4d87dae81c36 |
| `audio/sfx/weapons/sfx_wpn_pistol.wav` | `oss_free_firearms` | SFX clip (450ms) from https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/1911/A_34P.wav; sha256=4a2f0b93c128 |
| `audio/sfx/weapons/sfx_wpn_plasma.wav` | `oss_oga_space_shoot` | SFX clip (400ms) from https://opengameart.org/sites/default/files/alienshoot1.wav; sha256=50f8e57265cf |
| `audio/sfx/weapons/sfx_wpn_rack_rifle.wav` | `oss_free_firearms` | SFX clip (570ms) from https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Master%20Tracks/AR-15/D_14.wav; sha256=dd7250e4e314 |
| `audio/sfx/weapons/sfx_wpn_railgun.ogg` | `oss_kenney_scifi_gh` | SFX clip (677ms) from https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_large_000.ogg; sha256=a56d95794cd7 |
| `audio/sfx/weapons/sfx_wpn_railgun.wav` | `generated_synth` | SFX clip (279ms) from synth_wav; sha256=769d67f3ff6b |
| `audio/sfx/weapons/sfx_wpn_reload_pistol.wav` | `oss_oga_gun_reloads` | SFX clip (900ms) from https://opengameart.org/sites/default/files/reload.wav; sha256=6eafab921cad |
| `audio/sfx/weapons/sfx_wpn_reload_rifle.wav` | `oss_oga_gun_reloads` | SFX clip (1200ms) from https://opengameart.org/sites/default/files/assaultriflereload1_0.wav; sha256=3030df97361a |
| `audio/sfx/weapons/sfx_wpn_reload_shotgun.mp3` | `oss_oga_gun_reloads` | SFX clip (4232ms) from https://opengameart.org/sites/default/files/shotgunsounds.zip#ShotgunSounds/First Shell.mp3; sha256=0e3a8da11bb9 |
| `audio/sfx/weapons/sfx_wpn_reload_shotgun.wav` | `generated_synth` | SFX clip (123ms) from synth_wav; sha256=d1f655c83502 |
| `audio/sfx/weapons/sfx_wpn_reload.wav` | `oss_oga_gun_reloads` | SFX clip (1100ms) from https://opengameart.org/sites/default/files/gunreload1.wav; sha256=c39b49ac8cfd |
| `audio/sfx/weapons/sfx_wpn_revolver.wav` | `oss_oga_gunshots_kurt` | SFX clip (248ms) from https://opengameart.org/sites/default/files/22%20Magnum.wav; sha256=e18724593621 |
| `audio/sfx/weapons/sfx_wpn_rifle_v2.wav` | `oss_free_firearms` | SFX clip (500ms) from https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/AR-15/D_24P.wav; sha256=e9425b4b11c2 |
| `audio/sfx/weapons/sfx_wpn_rifle_v3.wav` | `oss_oga_gunshot_zip` | SFX clip (500ms) from https://opengameart.org/sites/default/files/sounds.zip#sounds/sks.wav; sha256=a41b32108273 |
| `audio/sfx/weapons/sfx_wpn_rifle.wav` | `oss_free_firearms` | SFX clip (500ms) from https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/AK-47/C_27P.wav; sha256=4c1809770d3c |
| `audio/sfx/weapons/sfx_wpn_shell_eject.wav` | `oss_free_firearms` | SFX clip (138ms) from https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Master%20Tracks/Ruger%20Single%20Six/S_3.wav; sha256=7ff1b40d5bf7 |
| `audio/sfx/weapons/sfx_wpn_shotgun_v2.wav` | `oss_free_firearms` | SFX clip (650ms) from https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/Nova/O_17P.wav; sha256=410886e6a56f |
| `audio/sfx/weapons/sfx_wpn_shotgun_v3.wav` | `oss_oga_gunshot_zip` | SFX clip (650ms) from https://opengameart.org/sites/default/files/sounds.zip#sounds/shotty.wav; sha256=a59a711f6420 |
| `audio/sfx/weapons/sfx_wpn_shotgun.wav` | `oss_free_firearms` | SFX clip (650ms) from https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/Mossberg/N_26P.wav; sha256=80a5904ad9d2 |
| `audio/sfx/weapons/sfx_wpn_smg_v2.wav` | `oss_superpowers_sfx` | SFX clip (250ms) from https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/sounds/machinegun.wav; sha256=0ce4da638d45 |
| `audio/sfx/weapons/sfx_wpn_smg.wav` | `oss_free_firearms` | SFX clip (300ms) from https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/PPSh/P_16P.wav; sha256=6750faaf8ed4 |
| `audio/sfx/weapons/sfx_wpn_western_gun.ogg` | `oss_superpowers_sfx` | SFX clip (743ms) from https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/sounds/gun-1.ogg; sha256=8ba153a30ef2 |
| `audio/sfx/weapons/sfx_wpn_western_gun.wav` | `generated_synth` | SFX clip (120ms) from synth_wav; sha256=ce114863669c |
| `normalized/bosses/boss_abyssal_leviathan_attack.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_abyssal_leviathan_attack.png`; sha256=a0fba913f59f |
| `normalized/bosses/boss_abyssal_leviathan_dead.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_abyssal_leviathan_dead.png`; sha256=591c4b8cd8fe |
| `normalized/bosses/boss_abyssal_leviathan_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (3f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_abyssal_leviathan_idle.png`; sha256=8ccd78e3787b |
| `normalized/bosses/boss_abyssal_leviathan_run.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_abyssal_leviathan_run.png`; sha256=0a7d7efc095d |
| `normalized/bosses/boss_arsenal_attack.png` | `crawl_tiles_cc0` | CC0 Boss I Arsenal Dread Gunner attack strip (4f @ 96x96); sha256=b5262e404f6a |
| `normalized/bosses/boss_arsenal_dead.png` | `crawl_tiles_cc0` | CC0 Boss I Arsenal Dread Gunner dead strip (4f @ 96x96); sha256=cda94692dbaa |
| `normalized/bosses/boss_arsenal_idle.png` | `crawl_tiles_cc0` | CC0 Boss I Arsenal Dread Gunner idle strip (4f @ 96x96); sha256=04816f37c926 |
| `normalized/bosses/boss_arsenal_run.png` | `crawl_tiles_cc0` | CC0 Boss I Arsenal Dread Gunner run strip (4f @ 96x96); sha256=4f43b84f4172 |
| `normalized/bosses/boss_beholder_beam_windup.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_beholder_beam_windup.png`; sha256=ce6c7509957f |
| `normalized/bosses/boss_beholder_dead.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_beholder_dead.png`; sha256=d56ce02deab4 |
| `normalized/bosses/boss_beholder_enrage_roar.png` | `crawl_tiles_cc0` | Normalized horizontal strip (5f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_beholder_enrage_roar.png`; sha256=9a5a6b710162 |
| `normalized/bosses/boss_beholder_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_beholder_idle.png`; sha256=62a3d09b10a8 |
| `normalized/bosses/boss_beholder_move.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_beholder_move.png`; sha256=4e57f627518e |
| `normalized/bosses/boss_beholder_slam_leap.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_beholder_slam_leap.png`; sha256=a76547932ea0 |
| `normalized/bosses/boss_beholder_stagger.png` | `crawl_tiles_cc0` | Normalized horizontal strip (3f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_beholder_stagger.png`; sha256=cc4df9375c3f |
| `normalized/bosses/boss_beholder_volley_cast.png` | `crawl_tiles_cc0` | Normalized horizontal strip (5f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_beholder_volley_cast.png`; sha256=4a09096435dc |
| `normalized/bosses/boss_colossus_attack.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_colossus_attack.png`; sha256=9791efaefc5a |
| `normalized/bosses/boss_colossus_dead.png` | `crawl_tiles_cc0` | Normalized horizontal strip (3f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_colossus_dead.png`; sha256=7d7564bd063c |
| `normalized/bosses/boss_colossus_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (3f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_colossus_idle.png`; sha256=8fac0179b473 |
| `normalized/bosses/boss_colossus_overheat_stun.png` | `crawl_tiles_cc0` | Normalized horizontal strip (2f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_colossus_overheat_stun.png`; sha256=192d6a1f8610 |
| `normalized/bosses/boss_colossus_run.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_colossus_run.png`; sha256=3519457ac744 |
| `normalized/bosses/boss_destroyer_attack.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_destroyer_attack.png`; sha256=8745006998ec |
| `normalized/bosses/boss_destroyer_dead.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_destroyer_dead.png`; sha256=2783d21f6610 |
| `normalized/bosses/boss_destroyer_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (3f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_destroyer_idle.png`; sha256=ee0194bfd3f8 |
| `normalized/bosses/boss_destroyer_run.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_destroyer_run.png`; sha256=7e35013e05d4 |
| `normalized/bosses/boss_frost_empress_attack.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_frost_empress_attack.png`; sha256=00e407416761 |
| `normalized/bosses/boss_frost_empress_dead.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_frost_empress_dead.png`; sha256=64793d735719 |
| `normalized/bosses/boss_frost_empress_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (3f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_frost_empress_idle.png`; sha256=b5822b85a105 |
| `normalized/bosses/boss_frost_empress_run.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_frost_empress_run.png`; sha256=8b8e93737dc1 |
| `normalized/bosses/boss_overlord_charge.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_overlord_charge.png`; sha256=4fe565d80572 |
| `normalized/bosses/boss_overlord_dead.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_overlord_dead.png`; sha256=c2489033747b |
| `normalized/bosses/boss_overlord_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_overlord_idle.png`; sha256=f4a75917cfd3 |
| `normalized/bosses/boss_overlord_stun.png` | `crawl_tiles_cc0` | Normalized horizontal strip (2f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_overlord_stun.png`; sha256=73c492a94e81 |
| `normalized/bosses/boss_storm_herald_attack.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_storm_herald_attack.png`; sha256=0b880533f658 |
| `normalized/bosses/boss_storm_herald_dead.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_storm_herald_dead.png`; sha256=984f74b1e237 |
| `normalized/bosses/boss_storm_herald_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (3f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_storm_herald_idle.png`; sha256=7b9fb8c18ba3 |
| `normalized/bosses/boss_storm_herald_run.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_storm_herald_run.png`; sha256=575a585e0ea3 |
| `normalized/bosses/boss_tempest_attack.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_tempest_attack.png`; sha256=49ebdb6065ea |
| `normalized/bosses/boss_tempest_dead.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_tempest_dead.png`; sha256=02ff0e5d57a8 |
| `normalized/bosses/boss_tempest_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (3f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_tempest_idle.png`; sha256=f70be23429e0 |
| `normalized/bosses/boss_tempest_run.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 96x96, facing=right, off=[-48,-94]) from `sprites/bosses/boss_tempest_run.png`; sha256=1457ba60432f |
| `normalized/bosses/emp_pylon_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/bosses/emp_pylon_idle.png`; sha256=929032f967f8 |
| `normalized/bosses/miragine_a13_attack.png` | `internal_miragine` | Normalized horizontal strip (4f @ 112x96, facing=right, off=[-48,-96]) from `sprites/miragine/A13_attack.png`; sha256=380d3c0feb3b |
| `normalized/bosses/miragine_a13_dead.png` | `internal_miragine` | Normalized horizontal strip (3f @ 91x61, facing=right, off=[-35,-56]) from `sprites/miragine/A13_dead.png`; sha256=1d60ee39d556 |
| `normalized/bosses/miragine_a13_idle.png` | `internal_miragine` | Normalized horizontal strip (3f @ 81x63, facing=right, off=[-27,-62]) from `sprites/miragine/A13_idle.png`; sha256=5997ec71e355 |
| `normalized/bosses/miragine_a13_run.png` | `internal_miragine` | Normalized horizontal strip (6f @ 103x55, facing=right, off=[-38,-55]) from `sprites/miragine/A13_run.png`; sha256=5b9e551f6bc9 |
| `normalized/bosses/overlord_weakpoint_idle.png` | `crawl_tiles_cc0` | Normalized horizontal strip (3f @ 32x32, facing=right, off=[-16,-16]) from `sprites/bosses/overlord_weakpoint_idle.png`; sha256=359ba87668f1 |
| `normalized/enemies/blight_bomber_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/blight_bomber_attack.png`; sha256=651fa7cc13ce |
| `normalized/enemies/blight_bomber_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/blight_bomber_dead.png`; sha256=f41650963ea9 |
| `normalized/enemies/blight_bomber_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/blight_bomber_idle.png`; sha256=a51d80e57742 |
| `normalized/enemies/blight_bomber_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/blight_bomber_run.png`; sha256=8944ad95ffe6 |
| `normalized/enemies/bomb_goblin_dead.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/bomb_goblin_dead.png`; sha256=16738acf4915 |
| `normalized/enemies/bomb_goblin_fuse_run.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/bomb_goblin_fuse_run.png`; sha256=0ce6f22a48a4 |
| `normalized/enemies/bomb_goblin_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/bomb_goblin_idle.png`; sha256=030bcdbbba0f |
| `normalized/enemies/bomb_goblin_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/bomb_goblin_run.png`; sha256=5a9aa4e45d99 |
| `normalized/enemies/bomb_goblin_spark.png` | `generated_synth` | Normalized horizontal strip (2f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/bomb_goblin_spark.png`; sha256=cd9d7aacd81a |
| `normalized/enemies/cactus_brute_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 64x64, facing=right, off=[-32,-58]) from `sprites/mobs/cactus_brute_attack.png`; sha256=f1691b417b3b |
| `normalized/enemies/cactus_brute_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 64x64, facing=right, off=[-32,-58]) from `sprites/mobs/cactus_brute_dead.png`; sha256=fad633a84834 |
| `normalized/enemies/cactus_brute_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 64x64, facing=right, off=[-32,-58]) from `sprites/mobs/cactus_brute_idle.png`; sha256=a7053171f52f |
| `normalized/enemies/cactus_brute_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 64x64, facing=right, off=[-32,-58]) from `sprites/mobs/cactus_brute_run.png`; sha256=e7b3aff80f9f |
| `normalized/enemies/cactus_brute_slam.png` | `generated_synth` | Normalized horizontal strip (6f @ 64x64, facing=right, off=[-32,-58]) from `sprites/mobs/cactus_brute_slam.png`; sha256=44650b539bef |
| `normalized/enemies/cactus_spitter_attack.png` | `generated_synth` | Normalized horizontal strip (5f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/cactus_spitter_attack.png`; sha256=c5dfe0e28a60 |
| `normalized/enemies/cactus_spitter_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/cactus_spitter_dead.png`; sha256=5d29335f7eb7 |
| `normalized/enemies/cactus_spitter_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/cactus_spitter_idle.png`; sha256=2a8a93ebde51 |
| `normalized/enemies/cactus_spitter_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/cactus_spitter_run.png`; sha256=1eba9999ae79 |
| `normalized/enemies/chrono_mage_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/chrono_mage_attack.png`; sha256=b2e61d1557fd |
| `normalized/enemies/chrono_mage_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/chrono_mage_dead.png`; sha256=e35ab9ea3482 |
| `normalized/enemies/chrono_mage_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/chrono_mage_idle.png`; sha256=6f69d86b04bb |
| `normalized/enemies/chrono_mage_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/chrono_mage_run.png`; sha256=d6e4af54d54b |
| `normalized/enemies/crimson_lancer_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/crimson_lancer_attack.png`; sha256=23be55a5663f |
| `normalized/enemies/crimson_lancer_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/crimson_lancer_dead.png`; sha256=8e0fb9dff8e1 |
| `normalized/enemies/crimson_lancer_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/crimson_lancer_idle.png`; sha256=86e29f859e65 |
| `normalized/enemies/crimson_lancer_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/crimson_lancer_run.png`; sha256=c34909287157 |
| `normalized/enemies/frost_mage_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/frost_mage_attack.png`; sha256=13718d7a5dc1 |
| `normalized/enemies/frost_mage_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/frost_mage_dead.png`; sha256=fe6d09296d71 |
| `normalized/enemies/frost_mage_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/frost_mage_idle.png`; sha256=9dc11a380c9a |
| `normalized/enemies/frost_mage_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/frost_mage_run.png`; sha256=460ae3d39aad |
| `normalized/enemies/healing_priest_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/healing_priest_attack.png`; sha256=2c93fd949a22 |
| `normalized/enemies/healing_priest_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/healing_priest_dead.png`; sha256=5ae766636550 |
| `normalized/enemies/healing_priest_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/healing_priest_idle.png`; sha256=d87c7d08e6e6 |
| `normalized/enemies/healing_priest_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/healing_priest_run.png`; sha256=23d56f44346a |
| `normalized/enemies/iron_drone_attack.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/bosses/iron_drone_attack.png`; sha256=6734f725e38b |
| `normalized/enemies/iron_drone_dead.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/bosses/iron_drone_dead.png`; sha256=6b6c10339b71 |
| `normalized/enemies/iron_drone_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/bosses/iron_drone_idle.png`; sha256=7e8f43086221 |
| `normalized/enemies/iron_drone_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/bosses/iron_drone_run.png`; sha256=9884b8b89305 |
| `normalized/enemies/laser_sniper_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/laser_sniper_attack.png`; sha256=c6c9775e5704 |
| `normalized/enemies/laser_sniper_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/laser_sniper_dead.png`; sha256=d59ff3cf1fc4 |
| `normalized/enemies/laser_sniper_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/laser_sniper_idle.png`; sha256=84b8ef81aeb7 |
| `normalized/enemies/laser_sniper_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/laser_sniper_run.png`; sha256=e4e7bdacb5f3 |
| `normalized/enemies/magma_brute_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/magma_brute_attack.png`; sha256=01627be70ad0 |
| `normalized/enemies/magma_brute_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/magma_brute_dead.png`; sha256=fcb810efb839 |
| `normalized/enemies/magma_brute_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/magma_brute_idle.png`; sha256=54c5170e8698 |
| `normalized/enemies/magma_brute_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/magma_brute_run.png`; sha256=c09cad374ad0 |
| `normalized/enemies/magnet_drone_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/magnet_drone_attack.png`; sha256=6772eb98ad62 |
| `normalized/enemies/magnet_drone_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/magnet_drone_dead.png`; sha256=f60c0de3308b |
| `normalized/enemies/magnet_drone_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/magnet_drone_idle.png`; sha256=d0e631a54c8e |
| `normalized/enemies/magnet_drone_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/magnet_drone_run.png`; sha256=1cdb642974ba |
| `normalized/enemies/miragine_b3_attack.png` | `internal_miragine` | Normalized horizontal strip (4f @ 93x60, facing=right, off=[-26,-62]) from `sprites/miragine/B3_attack.png`; sha256=f9161810b7c8 |
| `normalized/enemies/miragine_b3_dead.png` | `internal_miragine` | Normalized horizontal strip (3f @ 86x66, facing=right, off=[-52,-57]) from `sprites/miragine/B3_dead.png`; sha256=ffb9e70e2b16 |
| `normalized/enemies/miragine_b3_idle.png` | `internal_miragine` | Normalized horizontal strip (3f @ 58x53, facing=right, off=[-27,-55]) from `sprites/miragine/B3_idle.png`; sha256=e16ca09918d7 |
| `normalized/enemies/miragine_b3_run.png` | `internal_miragine` | Normalized horizontal strip (6f @ 64x61, facing=right, off=[-28,-59]) from `sprites/miragine/B3_run.png`; sha256=00d9f60e1d4b |
| `normalized/enemies/miragine_b7_attack.png` | `internal_miragine` | Normalized horizontal strip (6f @ 41x56, facing=right, off=[-14,-56]) from `sprites/miragine/B7_attack.png`; sha256=e2f72be79987 |
| `normalized/enemies/miragine_b7_dead.png` | `internal_miragine` | Normalized horizontal strip (3f @ 71x61, facing=right, off=[-46,-52]) from `sprites/miragine/B7_dead.png`; sha256=f6f4e228cb75 |
| `normalized/enemies/miragine_b7_idle.png` | `internal_miragine` | Normalized horizontal strip (3f @ 29x56, facing=right, off=[-12,-55]) from `sprites/miragine/B7_idle.png`; sha256=cb9c3ab0d793 |
| `normalized/enemies/miragine_b7_run.png` | `internal_miragine` | Normalized horizontal strip (6f @ 52x52, facing=right, off=[-25,-52]) from `sprites/miragine/B7_run.png`; sha256=3102d843a130 |
| `normalized/enemies/mirror_knight_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/mirror_knight_attack.png`; sha256=facd5766f370 |
| `normalized/enemies/mirror_knight_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/mirror_knight_dead.png`; sha256=a578cd80d3d9 |
| `normalized/enemies/mirror_knight_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/mirror_knight_idle.png`; sha256=0af8aafb58ac |
| `normalized/enemies/mirror_knight_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/mirror_knight_run.png`; sha256=f9ed43fb5328 |
| `normalized/enemies/mortar_beetle_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/mortar_beetle_attack.png`; sha256=12b3007c5559 |
| `normalized/enemies/mortar_beetle_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/mortar_beetle_dead.png`; sha256=6a0922fb3574 |
| `normalized/enemies/mortar_beetle_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/mortar_beetle_idle.png`; sha256=121131e08531 |
| `normalized/enemies/mortar_beetle_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/mortar_beetle_run.png`; sha256=1540461096b0 |
| `normalized/enemies/plague_bearer_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/plague_bearer_attack.png`; sha256=3d863cbb0a5c |
| `normalized/enemies/plague_bearer_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/plague_bearer_dead.png`; sha256=5f3916d0a8eb |
| `normalized/enemies/plague_bearer_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/plague_bearer_idle.png`; sha256=73853ff21e9b |
| `normalized/enemies/plague_bearer_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/plague_bearer_run.png`; sha256=1b59b634207c |
| `normalized/enemies/plasma_golem_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 64x64, facing=right, off=[-32,-62]) from `sprites/mobs/plasma_golem_attack.png`; sha256=3906b2cdf136 |
| `normalized/enemies/plasma_golem_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 64x64, facing=right, off=[-32,-62]) from `sprites/mobs/plasma_golem_dead.png`; sha256=81d7e8635667 |
| `normalized/enemies/plasma_golem_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 64x64, facing=right, off=[-32,-62]) from `sprites/mobs/plasma_golem_idle.png`; sha256=ee5f1d97e649 |
| `normalized/enemies/plasma_golem_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 64x64, facing=right, off=[-32,-62]) from `sprites/mobs/plasma_golem_run.png`; sha256=593653c29dc6 |
| `normalized/enemies/pyro_shaman_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/pyro_shaman_attack.png`; sha256=81382db2e387 |
| `normalized/enemies/pyro_shaman_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/pyro_shaman_dead.png`; sha256=705dfb9facfd |
| `normalized/enemies/pyro_shaman_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/pyro_shaman_idle.png`; sha256=4099ce2ab5cf |
| `normalized/enemies/pyro_shaman_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/pyro_shaman_run.png`; sha256=06c027c1b35c |
| `normalized/enemies/saw_berserker_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/saw_berserker_attack.png`; sha256=d07792e4c6e6 |
| `normalized/enemies/saw_berserker_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/saw_berserker_dead.png`; sha256=0af17b905eb8 |
| `normalized/enemies/saw_berserker_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/saw_berserker_idle.png`; sha256=627be7a45066 |
| `normalized/enemies/saw_berserker_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/saw_berserker_run.png`; sha256=6a6c572b3d21 |
| `normalized/enemies/scarab_attack.png` | `kenney_desert_shooter` | Normalized horizontal strip (4f @ 32x32, facing=right, off=[-16,-28]) from `sprites/mobs/scarab_attack.png`; sha256=58c9c41f4211 |
| `normalized/enemies/scarab_dead.png` | `kenney_desert_shooter` | Normalized horizontal strip (3f @ 32x32, facing=right, off=[-16,-28]) from `sprites/mobs/scarab_dead.png`; sha256=7e7f39169b2c |
| `normalized/enemies/scarab_idle.png` | `kenney_desert_shooter` | Normalized horizontal strip (2f @ 32x32, facing=right, off=[-16,-28]) from `sprites/mobs/scarab_idle.png`; sha256=ca717cf289d1 |
| `normalized/enemies/scarab_run.png` | `kenney_desert_shooter` | Normalized horizontal strip (4f @ 32x32, facing=right, off=[-16,-28]) from `sprites/mobs/scarab_run.png`; sha256=297359cd7a50 |
| `normalized/enemies/shield_warden_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 64x64, facing=right, off=[-32,-62]) from `sprites/mobs/shield_warden_attack.png`; sha256=fbed27c9f909 |
| `normalized/enemies/shield_warden_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 64x64, facing=right, off=[-32,-62]) from `sprites/mobs/shield_warden_dead.png`; sha256=55e840da42af |
| `normalized/enemies/shield_warden_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 64x64, facing=right, off=[-32,-62]) from `sprites/mobs/shield_warden_idle.png`; sha256=0bab3f0996a4 |
| `normalized/enemies/shield_warden_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 64x64, facing=right, off=[-32,-62]) from `sprites/mobs/shield_warden_run.png`; sha256=47d0225d2957 |
| `normalized/enemies/shock_drone_mk2_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/shock_drone_mk2_attack.png`; sha256=339530f611b2 |
| `normalized/enemies/shock_drone_mk2_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/shock_drone_mk2_dead.png`; sha256=746df05b7743 |
| `normalized/enemies/shock_drone_mk2_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/shock_drone_mk2_idle.png`; sha256=fb3d4d9a80d6 |
| `normalized/enemies/shock_drone_mk2_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/shock_drone_mk2_run.png`; sha256=01373fda9eeb |
| `normalized/enemies/skirmisher_attack.png` | `oga_skeletons_rework` | Normalized horizontal strip (5f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/skirmisher_attack.png`; sha256=923d65c94ab4 |
| `normalized/enemies/skirmisher_dead.png` | `oga_skeletons_rework` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/skirmisher_dead.png`; sha256=de19483367c1 |
| `normalized/enemies/skirmisher_idle.png` | `oga_skeletons_rework` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/skirmisher_idle.png`; sha256=174199772f54 |
| `normalized/enemies/skirmisher_lunge.png` | `oga_skeletons_rework` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/skirmisher_lunge.png`; sha256=e559798877c0 |
| `normalized/enemies/skirmisher_run.png` | `oga_skeletons_rework` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/skirmisher_run.png`; sha256=b1790409d559 |
| `normalized/enemies/sniper_mech_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/sniper_mech_attack.png`; sha256=e8517d5d78bd |
| `normalized/enemies/sniper_mech_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/sniper_mech_dead.png`; sha256=99dd56c73161 |
| `normalized/enemies/sniper_mech_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/sniper_mech_idle.png`; sha256=2bb98f424908 |
| `normalized/enemies/sniper_mech_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/sniper_mech_run.png`; sha256=4118fd5de330 |
| `normalized/enemies/solar_priest_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/solar_priest_attack.png`; sha256=1de7f5974255 |
| `normalized/enemies/solar_priest_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/solar_priest_dead.png`; sha256=19a5fac3800a |
| `normalized/enemies/solar_priest_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/solar_priest_idle.png`; sha256=a7b600da85ad |
| `normalized/enemies/solar_priest_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/solar_priest_run.png`; sha256=741bfc236d68 |
| `normalized/enemies/thunder_mage_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/thunder_mage_attack.png`; sha256=96fcfb930dfb |
| `normalized/enemies/thunder_mage_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/thunder_mage_dead.png`; sha256=677dff4c0301 |
| `normalized/enemies/thunder_mage_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/thunder_mage_idle.png`; sha256=83d05476288c |
| `normalized/enemies/thunder_mage_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/thunder_mage_run.png`; sha256=e12fb86bcf48 |
| `normalized/enemies/venom_stalker_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/venom_stalker_attack.png`; sha256=cdb64e66de41 |
| `normalized/enemies/venom_stalker_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/venom_stalker_dead.png`; sha256=1400a12319cd |
| `normalized/enemies/venom_stalker_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/venom_stalker_idle.png`; sha256=9ff57f576d67 |
| `normalized/enemies/venom_stalker_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/venom_stalker_run.png`; sha256=078f3bd70feb |
| `normalized/enemies/void_acolyte_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/void_acolyte_attack.png`; sha256=4c16af5b3a11 |
| `normalized/enemies/void_acolyte_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/void_acolyte_dead.png`; sha256=cfff02bedef3 |
| `normalized/enemies/void_acolyte_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/void_acolyte_idle.png`; sha256=0eda1398f4b2 |
| `normalized/enemies/void_acolyte_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/void_acolyte_run.png`; sha256=e66a66c56fca |
| `normalized/enemies/void_reaper_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/void_reaper_attack.png`; sha256=8ff4f3053dc1 |
| `normalized/enemies/void_reaper_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/void_reaper_dead.png`; sha256=e04062a2afaa |
| `normalized/enemies/void_reaper_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/void_reaper_idle.png`; sha256=19e7bdf07455 |
| `normalized/enemies/void_reaper_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/void_reaper_run.png`; sha256=b19eadf0558b |
| `normalized/enemies/volt_stalker_attack.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/volt_stalker_attack.png`; sha256=cbc667129dc5 |
| `normalized/enemies/volt_stalker_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/volt_stalker_dead.png`; sha256=592a8dad6e95 |
| `normalized/enemies/volt_stalker_idle.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/volt_stalker_idle.png`; sha256=1a33d91078ca |
| `normalized/enemies/volt_stalker_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-46]) from `sprites/mobs/volt_stalker_run.png`; sha256=3cd23f9f5fdb |
| `normalized/heroes/hero_knight_dash.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/knight_dash.png`; sha256=0b37871f0473 |
| `normalized/heroes/hero_knight_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/knight_dead.png`; sha256=7c7ffbe1c340 |
| `normalized/heroes/hero_knight_idle.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/knight_idle.png`; sha256=5b3c806f7a1b |
| `normalized/heroes/hero_knight_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/knight_run.png`; sha256=6dcd7a582a6c |
| `normalized/heroes/hero_knight_shoot.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/knight_shoot.png`; sha256=e37e2e9e9721 |
| `normalized/heroes/hero_knight_stunned.png` | `generated_synth` | Normalized horizontal strip (2f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/knight_stunned.png`; sha256=164c6e4bc6ba |
| `normalized/heroes/hero_laser_dash.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/laser_dash.png`; sha256=d54d545f558c |
| `normalized/heroes/hero_laser_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/laser_dead.png`; sha256=be7f459c49c1 |
| `normalized/heroes/hero_laser_idle.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/laser_idle.png`; sha256=d771449cdb46 |
| `normalized/heroes/hero_laser_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/laser_run.png`; sha256=0b51b971b354 |
| `normalized/heroes/hero_laser_shoot.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/laser_shoot.png`; sha256=00be66326bf5 |
| `normalized/heroes/hero_laser_stunned.png` | `generated_synth` | Normalized horizontal strip (2f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/laser_stunned.png`; sha256=0ee5fe04f94f |
| `normalized/heroes/hero_mascot_dash.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/mascot_dash.png`; sha256=1028bf3bd17c |
| `normalized/heroes/hero_mascot_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/mascot_dead.png`; sha256=a9c973c17a99 |
| `normalized/heroes/hero_mascot_idle.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/mascot_idle.png`; sha256=6b1accb1a427 |
| `normalized/heroes/hero_mascot_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/mascot_run.png`; sha256=eab2873fa92b |
| `normalized/heroes/hero_mascot_shoot.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/mascot_shoot.png`; sha256=c7607ea93072 |
| `normalized/heroes/hero_mascot_stunned.png` | `generated_synth` | Normalized horizontal strip (2f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/mascot_stunned.png`; sha256=5bd4138320b8 |
| `normalized/heroes/hero_pyro_dash.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/pyro_dash.png`; sha256=8e8185bd8ac6 |
| `normalized/heroes/hero_pyro_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/pyro_dead.png`; sha256=90497959b91f |
| `normalized/heroes/hero_pyro_idle.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/pyro_idle.png`; sha256=a916af8fde52 |
| `normalized/heroes/hero_pyro_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/pyro_run.png`; sha256=eae60e88b6ff |
| `normalized/heroes/hero_pyro_shoot.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/pyro_shoot.png`; sha256=d00181d95113 |
| `normalized/heroes/hero_pyro_stunned.png` | `generated_synth` | Normalized horizontal strip (2f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/pyro_stunned.png`; sha256=063b441550f6 |
| `normalized/heroes/hero_ranger_dash.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/ranger_dash.png`; sha256=0378d6069f41 |
| `normalized/heroes/hero_ranger_dead.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/ranger_dead.png`; sha256=0a1af38e39d1 |
| `normalized/heroes/hero_ranger_idle.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/ranger_idle.png`; sha256=93a672dda5a7 |
| `normalized/heroes/hero_ranger_run.png` | `generated_synth` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/ranger_run.png`; sha256=84807c7dc459 |
| `normalized/heroes/hero_ranger_shoot.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/ranger_shoot.png`; sha256=2b0d32cb6039 |
| `normalized/heroes/hero_ranger_stunned.png` | `generated_synth` | Normalized horizontal strip (2f @ 48x48, facing=right, off=[-24,-44]) from `sprites/heroes/ranger_stunned.png`; sha256=18323bd046ee |
| `normalized/heroes/miragine_a0_attack.png` | `internal_miragine` | Normalized horizontal strip (5f @ 88x66, facing=right, off=[-25,-65]) from `sprites/miragine/A0_attack.png`; sha256=a53b1996bb43 |
| `normalized/heroes/miragine_a0_dead.png` | `internal_miragine` | Normalized horizontal strip (6f @ 99x74, facing=right, off=[-73,-60]) from `sprites/miragine/A0_dead.png`; sha256=dea64fe4ca3f |
| `normalized/heroes/miragine_a0_idle.png` | `internal_miragine` | Normalized horizontal strip (3f @ 62x53, facing=right, off=[-31,-53]) from `sprites/miragine/A0_idle.png`; sha256=1eeff89eedac |
| `normalized/heroes/miragine_a0_run.png` | `internal_miragine` | Normalized horizontal strip (6f @ 46x52, facing=right, off=[-20,-49]) from `sprites/miragine/A0_run.png`; sha256=5d1acc799e2d |
| `normalized/heroes/miragine_a11_attack.png` | `internal_miragine` | Normalized horizontal strip (6f @ 82x51, facing=right, off=[-26,-51]) from `sprites/miragine/A11_attack.png`; sha256=8c04d3c2a441 |
| `normalized/heroes/miragine_a11_dead.png` | `internal_miragine` | Normalized horizontal strip (4f @ 78x60, facing=right, off=[-52,-53]) from `sprites/miragine/A11_dead.png`; sha256=3ead194f50f1 |
| `normalized/heroes/miragine_a11_idle.png` | `internal_miragine` | Normalized horizontal strip (3f @ 62x51, facing=right, off=[-30,-51]) from `sprites/miragine/A11_idle.png`; sha256=a56cc51cfe69 |
| `normalized/heroes/miragine_a11_run.png` | `internal_miragine` | Normalized horizontal strip (3f @ 56x48, facing=right, off=[-22,-46]) from `sprites/miragine/A11_run.png`; sha256=824e2b49ad8c |
| `normalized/heroes/miragine_a5_attack.png` | `internal_miragine` | Normalized horizontal strip (5f @ 70x60, facing=right, off=[-17,-59]) from `sprites/miragine/A5_attack.png`; sha256=72bd395c957f |
| `normalized/heroes/miragine_a5_dead.png` | `internal_miragine` | Normalized horizontal strip (3f @ 93x53, facing=right, off=[-51,-51]) from `sprites/miragine/A5_dead.png`; sha256=5f705ac4bbcc |
| `normalized/heroes/miragine_a5_idle.png` | `internal_miragine` | Normalized horizontal strip (3f @ 57x49, facing=right, off=[-17,-48]) from `sprites/miragine/A5_idle.png`; sha256=57d1bf4c05b1 |
| `normalized/heroes/miragine_a5_run.png` | `internal_miragine` | Normalized horizontal strip (6f @ 49x58, facing=right, off=[-21,-56]) from `sprites/miragine/A5_run.png`; sha256=e7d6bfb3125a |
| `normalized/heroes/miragine_a8_attack.png` | `internal_miragine` | Normalized horizontal strip (6f @ 88x67, facing=right, off=[-32,-66]) from `sprites/miragine/A8_attack.png`; sha256=95477e459db5 |
| `normalized/heroes/miragine_a8_dead.png` | `internal_miragine` | Normalized horizontal strip (2f @ 73x64, facing=right, off=[-41,-64]) from `sprites/miragine/A8_dead.png`; sha256=0aeebefc29ae |
| `normalized/heroes/miragine_a8_idle.png` | `internal_miragine` | Normalized horizontal strip (3f @ 63x64, facing=right, off=[-31,-63]) from `sprites/miragine/A8_idle.png`; sha256=a39f073b4e4e |
| `normalized/heroes/miragine_a8_run.png` | `internal_miragine` | Normalized horizontal strip (6f @ 71x65, facing=right, off=[-34,-62]) from `sprites/miragine/A8_run.png`; sha256=d1cb935864db |
| `normalized/pets/pet_cat_fire.png` | `generated_synth` | Normalized horizontal strip (3f @ 32x32, facing=left, off=[-16,-28]) from `sprites/pet/pet_cat_fire.png`; sha256=72a87ed15ebb |
| `normalized/pets/pet_cat_idle.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=left, off=[-16,-28]) from `sprites/pet/pet_cat_idle.png`; sha256=78559f911511 |
| `normalized/pets/pet_cat_pounce.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=left, off=[-16,-28]) from `sprites/pet/pet_cat_pounce.png`; sha256=b1335392ade4 |
| `normalized/pets/pet_cat_trot.png` | `generated_synth` | Normalized horizontal strip (6f @ 32x32, facing=left, off=[-16,-28]) from `sprites/pet/pet_cat_trot.png`; sha256=9753ce66e8a5 |
| `normalized/pets/pet_tiger_fire.png` | `generated_synth` | Normalized horizontal strip (3f @ 32x32, facing=left, off=[-16,-28]) from `sprites/pet/pet_tiger_fire.png`; sha256=0c56a39fe085 |
| `normalized/pets/pet_tiger_idle.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=left, off=[-16,-28]) from `sprites/pet/pet_tiger_idle.png`; sha256=d2fef6355df1 |
| `normalized/pets/pet_tiger_pounce.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=left, off=[-16,-28]) from `sprites/pet/pet_tiger_pounce.png`; sha256=4e368ad392e7 |
| `normalized/pets/pet_tiger_trot.png` | `generated_synth` | Normalized horizontal strip (6f @ 32x32, facing=left, off=[-16,-28]) from `sprites/pet/pet_tiger_trot.png`; sha256=4af3fa810a8f |
| `normalized/projectiles/bullet_enemy_orb.png` | `generated_synth` | Normalized horizontal strip (4f @ 16x16, facing=right, off=[-8,-8]) from `sprites/fx/bullet_enemy_orb.png`; sha256=54cba0a1f756 |
| `normalized/projectiles/bullet_kinetic_md.png` | `generated_synth` | Normalized horizontal strip (2f @ 12x8, facing=right, off=[-6,-4]) from `sprites/fx/bullet_kinetic_md.png`; sha256=635bdd8256b3 |
| `normalized/projectiles/bullet_kinetic_sm.png` | `generated_synth` | Normalized horizontal strip (2f @ 12x8, facing=right, off=[-6,-4]) from `sprites/fx/bullet_kinetic_sm.png`; sha256=ff277b9e98e1 |
| `normalized/projectiles/bullet_shotgun_pellet.png` | `generated_synth` | Normalized horizontal strip (2f @ 12x8, facing=right, off=[-6,-4]) from `sprites/fx/bullet_shotgun_pellet.png`; sha256=0f4f69e1d2cc |
| `normalized/projectiles/cryo_shard.png` | `generated_synth` | Normalized horizontal strip (2f @ 20x12, facing=right, off=[-10,-6]) from `sprites/fx/cryo_shard.png`; sha256=2ebe37b06375 |
| `normalized/projectiles/danmaku_crescent.png` | `kenney_vfx_ui` | Normalized horizontal strip (4f @ 28x32, facing=right, off=[-14,-16]) from `sprites/fx/danmaku_crescent.png`; sha256=e662539e7b7a |
| `normalized/projectiles/danmaku_lance.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 32x16, facing=right, off=[-16,-8]) from `sprites/fx/danmaku_lance.png`; sha256=30c4b8630fb3 |
| `normalized/projectiles/danmaku_orb.png` | `crawl_tiles_cc0` | Normalized horizontal strip (4f @ 24x24, facing=right, off=[-12,-12]) from `sprites/fx/danmaku_orb.png`; sha256=3d72a595898e |
| `normalized/projectiles/danmaku_ring.png` | `kenney_vfx_ui` | Normalized horizontal strip (4f @ 24x24, facing=right, off=[-12,-12]) from `sprites/fx/danmaku_ring.png`; sha256=0c181b97d18c |
| `normalized/projectiles/danmaku_star.png` | `kenney_vfx_ui` | Normalized horizontal strip (6f @ 24x24, facing=right, off=[-12,-12]) from `sprites/fx/danmaku_star.png`; sha256=56c97ba74a10 |
| `normalized/projectiles/flame_stream_orb.png` | `generated_synth` | Normalized horizontal strip (4f @ 20x14, facing=right, off=[-10,-7]) from `sprites/fx/flame_stream_orb.png`; sha256=e3087a7b2aea |
| `normalized/projectiles/gadget_bombs.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=right, off=[-16,-16]) from `sprites/fx/gadget_bombs.png`; sha256=93ce6a021979 |
| `normalized/projectiles/gravity_orb.png` | `generated_synth` | Normalized horizontal strip (4f @ 22x22, facing=right, off=[-11,-11]) from `sprites/fx/gravity_orb.png`; sha256=dd2816b84272 |
| `normalized/projectiles/needle_orb.png` | `generated_synth` | Synthesized missing shared projectile strip (2f @ 16x16); sha256=eb3770818077 |
| `normalized/projectiles/p_frag_grenade.png` | `generated_synth` | Normalized horizontal strip (4f @ 16x16, facing=right, off=[-8,-8]) from `sprites/fx/p_frag_grenade.png`; sha256=0825ea4c00c2 |
| `normalized/projectiles/p_prox_mine.png` | `generated_synth` | Normalized horizontal strip (4f @ 16x16, facing=right, off=[-8,-8]) from `sprites/fx/p_prox_mine.png`; sha256=e7c7ed091559 |
| `normalized/projectiles/p_rocket.png` | `generated_synth` | Normalized horizontal strip (2f @ 24x16, facing=right, off=[-12,-8]) from `sprites/fx/p_rocket.png`; sha256=a719a21ae8ea |
| `normalized/projectiles/p_stun_canister.png` | `generated_synth` | Normalized horizontal strip (4f @ 16x16, facing=right, off=[-8,-8]) from `sprites/fx/p_stun_canister.png`; sha256=856c24a8e228 |
| `normalized/projectiles/plasma_bolt.png` | `generated_synth` | Normalized horizontal strip (4f @ 24x14, facing=right, off=[-12,-7]) from `sprites/fx/plasma_bolt.png`; sha256=87d2fb438d49 |
| `normalized/projectiles/proj_fireball.png` | `internal_miragine` | Normalized horizontal strip (3f @ 32x32, facing=center, off=[-16,-16]) from `sprites/miragine/fireball.png`; sha256=9410d719d39b |
| `normalized/projectiles/proj_thunderball.png` | `internal_miragine` | Normalized horizontal strip (16f @ 128x128, facing=center, off=[-64,-64]) from `sprites/miragine/thunderball.png`; sha256=e198abd9ed1a |
| `normalized/projectiles/rail_beam.png` | `generated_synth` | Synthesized missing shared projectile strip (2f @ 32x8); sha256=ff13f66af430 |
| `normalized/projectiles/saw_disc.png` | `generated_synth` | Normalized horizontal strip (4f @ 18x18, facing=right, off=[-9,-9]) from `sprites/fx/saw_disc.png`; sha256=7db0f03bfb07 |
| `normalized/projectiles/sniper_slug.png` | `generated_synth` | Synthesized missing shared projectile strip (2f @ 24x10); sha256=4ae140480555 |
| `normalized/props/crypt_brazier.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/crypt_brazier.png`; sha256=fcf334bbbdce |
| `normalized/props/decor_bone.png` | `generated_synth` | Normalized horizontal strip (1f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/decor_bone.png`; sha256=c833247c3930 |
| `normalized/props/decor_cable.png` | `generated_synth` | Normalized horizontal strip (1f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/decor_cable.png`; sha256=8159add0960f |
| `normalized/props/decor_candle.png` | `generated_synth` | Normalized horizontal strip (3f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/decor_candle.png`; sha256=29bba31c38bb |
| `normalized/props/decor_pebble.png` | `generated_synth` | Normalized horizontal strip (1f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/decor_pebble.png`; sha256=0b17208552f5 |
| `normalized/props/decor_scrub.png` | `generated_synth` | Normalized horizontal strip (1f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/decor_scrub.png`; sha256=7f10992881b0 |
| `normalized/props/decor_skull.png` | `generated_synth` | Normalized horizontal strip (1f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/decor_skull.png`; sha256=600353b225ea |
| `normalized/props/decor_vent.png` | `generated_synth` | Normalized horizontal strip (2f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/decor_vent.png`; sha256=a540683f1cc3 |
| `normalized/props/pk_armor_plate.png` | `spritepilot_pickups` | Normalized horizontal strip (8f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/pk_armor_plate.png`; sha256=51f63c417633 |
| `normalized/props/pk_coin.png` | `spritepilot_pickups` | Normalized horizontal strip (8f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/pk_coin.png`; sha256=7a18eda108b7 |
| `normalized/props/pk_energy_cell.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/pk_energy_cell.png`; sha256=c772105cafb4 |
| `normalized/props/pk_energy_orb.png` | `spritepilot_pickups` | Normalized horizontal strip (8f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/pk_energy_orb.png`; sha256=18b88f97430e |
| `normalized/props/pk_gem_coin.png` | `spritepilot_pickups` | Normalized horizontal strip (8f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/pk_gem_coin.png`; sha256=ad7a4a61c5cc |
| `normalized/props/pk_hp_orb.png` | `spritepilot_pickups` | Normalized horizontal strip (5f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/pk_hp_orb.png`; sha256=081008386e5c |
| `normalized/props/pk_hp_pack.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=right, off=[-16,-16]) from `sprites/tiles/pk_hp_pack.png`; sha256=9acc8abeed59 |
| `normalized/props/pk_xp_orb.png` | `generated_synth` | Normalized horizontal strip (4f @ 16x16, facing=right, off=[-8,-14]) from `sprites/tiles/pk_xp_orb.png`; sha256=5d05155a95e6 |
| `normalized/props/prop_barrel_emp.png` | `generated_synth` | Normalized horizontal strip (2f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_barrel_emp.png`; sha256=4cbc8a7f202f |
| `normalized/props/prop_barrel_red.png` | `superpowers_asset_packs` | Normalized horizontal strip (2f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_barrel_red.png`; sha256=183eabf56ba1 |
| `normalized/props/prop_cactus.png` | `superpowers_asset_packs` | Normalized horizontal strip (2f @ 48x64, facing=right, off=[-24,-62]) from `sprites/tiles/prop_cactus.png`; sha256=1e5b10dde2f4 |
| `normalized/props/prop_clay_pot.png` | `superpowers_asset_packs` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_clay_pot.png`; sha256=7eaa86928d0f |
| `normalized/props/prop_crystal_red.png` | `internal_miragine` | Normalized horizontal strip (1f @ 96x144, facing=center, off=[-48,-144]) from `sprites/miragine/A_crystal.png`; sha256=3918c5349c32 |
| `normalized/props/prop_iron_crate.png` | `generated_synth` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_iron_crate.png`; sha256=04a8e8db4a96 |
| `normalized/props/prop_pedestal.png` | `generated_synth` | Normalized horizontal strip (2f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_pedestal.png`; sha256=f7b4922f9693 |
| `normalized/props/prop_pillar.png` | `generated_synth` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_pillar.png`; sha256=14e98bcddd22 |
| `normalized/props/prop_rock.png` | `superpowers_asset_packs` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_rock.png`; sha256=df6c4e2df4e8 |
| `normalized/props/prop_server.png` | `kenney_rts_scifi` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_server.png`; sha256=475042959d82 |
| `normalized/props/prop_tomb.png` | `superpowers_asset_packs` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_tomb.png`; sha256=d46e6bb88115 |
| `normalized/props/prop_wood_crate.png` | `superpowers_asset_packs` | Normalized horizontal strip (3f @ 48x48, facing=right, off=[-24,-46]) from `sprites/tiles/prop_wood_crate.png`; sha256=433427a77165 |
| `normalized/tiles/tile_crypt_floor.png` | `generated_synth` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-24]) from `sprites/tiles/tile_crypt_floor.png`; sha256=6ed9798959e4 |
| `normalized/tiles/tile_crypt_trim.png` | `generated_synth` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-24]) from `sprites/tiles/tile_crypt_trim.png`; sha256=db6cc562f2f6 |
| `normalized/tiles/tile_crypt_wall.png` | `kenney_tiny_dungeon` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-24]) from `sprites/tiles/tile_crypt_wall.png`; sha256=0bb007e8b20c |
| `normalized/tiles/tile_cyber_floor.png` | `oga_scifi_tiles` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-24]) from `sprites/tiles/tile_cyber_floor.png`; sha256=e38de39ba254 |
| `normalized/tiles/tile_cyber_trim.png` | `generated_synth` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-24]) from `sprites/tiles/tile_cyber_trim.png`; sha256=6f00bffd7020 |
| `normalized/tiles/tile_cyber_wall.png` | `kenney_rts_scifi` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-24]) from `sprites/tiles/tile_cyber_wall.png`; sha256=fc27720cc440 |
| `normalized/tiles/tile_desert_floor.png` | `generated_synth` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-24]) from `sprites/tiles/tile_desert_floor.png`; sha256=a900264e28b2 |
| `normalized/tiles/tile_desert_trim.png` | `generated_synth` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-24]) from `sprites/tiles/tile_desert_trim.png`; sha256=f00a19fd6fcc |
| `normalized/tiles/tile_desert_wall.png` | `kenney_desert_shooter` | Normalized horizontal strip (1f @ 48x48, facing=right, off=[-24,-24]) from `sprites/tiles/tile_desert_wall.png`; sha256=7d10cb8f2cac |
| `normalized/ui/perk_bastion.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=a03f0b18eed7 |
| `normalized/ui/perk_blast.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=4e50a84ae717 |
| `normalized/ui/perk_coop_aura.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=339c19cee831 |
| `normalized/ui/perk_energy.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=aaaeda56182e |
| `normalized/ui/perk_magnet.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=fff1a1861f46 |
| `normalized/ui/perk_pierce.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=febca79e2cbc |
| `normalized/ui/perk_quick_hands.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=a447d3402de8 |
| `normalized/ui/perk_ricochet.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=9f861d045a7a |
| `normalized/ui/perk_static_shield.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=512a7fc5462c |
| `normalized/ui/perk_swift_boots.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=a7c785e0e2e4 |
| `normalized/ui/perk_vampiric.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=6eff352c58a3 |
| `normalized/ui/perk_vitality.png` | `generated_synth` | Synthesized 24x24 48-color perk icon badge with #181425 outline; sha256=f9adb11a5578 |
| `normalized/ui/ui_crosshair_dot.png` | `generated_synth` | Synthesized 16x16 48-color HUD icon with #181425 outline; sha256=8052ab272352 |
| `normalized/ui/ui_icon_coin.png` | `generated_synth` | Synthesized 16x16 48-color HUD icon with #181425 outline; sha256=7654923be279 |
| `normalized/ui/ui_icon_energy.png` | `generated_synth` | Synthesized 16x16 48-color HUD icon with #181425 outline; sha256=9c7ba56f3c19 |
| `normalized/ui/ui_icon_heart.png` | `generated_synth` | Synthesized 16x16 48-color HUD icon with #181425 outline; sha256=10a527aef19b |
| `normalized/ui/ui_icon_shield.png` | `generated_synth` | Synthesized 16x16 48-color HUD icon with #181425 outline; sha256=25adaa64da61 |
| `normalized/ui/ui_portrait_knight.png` | `generated_synth` | Cropped & framed 32x32 HUD portrait from `normalized/heroes/hero_knight_idle.png`; sha256=07f6775f8743 |
| `normalized/ui/ui_portrait_laser.png` | `generated_synth` | Cropped & framed 32x32 HUD portrait from `normalized/heroes/hero_laser_idle.png`; sha256=8c0a587e5d0c |
| `normalized/ui/ui_portrait_mascot.png` | `generated_synth` | Cropped & framed 32x32 HUD portrait from `normalized/heroes/hero_mascot_idle.png`; sha256=2086c94e08a9 |
| `normalized/ui/ui_portrait_pyro.png` | `generated_synth` | Cropped & framed 32x32 HUD portrait from `normalized/heroes/hero_pyro_idle.png`; sha256=983230888bc6 |
| `normalized/ui/ui_portrait_ranger.png` | `generated_synth` | Cropped & framed 32x32 HUD portrait from `normalized/heroes/hero_ranger_idle.png`; sha256=3bc554b795dd |
| `normalized/ui/ui_shadow_unit.png` | `internal_miragine` | Normalized horizontal strip (1f @ 38x16, facing=center, off=[-19,-8]) from `sprites/miragine/shadow.png`; sha256=a76070d2168f |
| `normalized/vfx/casing_brass.png` | `generated_synth` | Normalized horizontal strip (4f @ 8x8, facing=right, off=[-4,-4]) from `sprites/fx/casing_brass.png`; sha256=95e8a22383a7 |
| `normalized/vfx/casing_shell.png` | `generated_synth` | Normalized horizontal strip (4f @ 8x8, facing=right, off=[-4,-4]) from `sprites/fx/casing_shell.png`; sha256=bbcb96d81ff0 |
| `normalized/vfx/fx_boss_magic_sigil.png` | `kenney_vfx_ui` | Normalized horizontal strip (8f @ 96x96, facing=right, off=[-48,-48]) from `sprites/fx/fx_boss_magic_sigil.png`; sha256=7206b07edb53 |
| `normalized/vfx/fx_boss_void_vortex.png` | `kenney_vfx_ui` | Normalized horizontal strip (8f @ 80x80, facing=right, off=[-40,-40]) from `sprites/fx/fx_boss_void_vortex.png`; sha256=382eada65f12 |
| `normalized/vfx/fx_crater_decals.png` | `generated_synth` | Normalized horizontal strip (3f @ 64x40, facing=right, off=[-32,-20]) from `sprites/fx/fx_crater_decals.png`; sha256=ee5d867cc614 |
| `normalized/vfx/fx_dash_dust.png` | `generated_synth` | Normalized horizontal strip (7f @ 32x32, facing=right, off=[-16,-24]) from `sprites/fx/fx_dash_dust.png`; sha256=f6e5c9a1867f |
| `normalized/vfx/fx_emp_arc.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x24, facing=right, off=[-24,-12]) from `sprites/fx/fx_emp_arc.png`; sha256=caa6fa918c07 |
| `normalized/vfx/fx_explosion_he.png` | `generated_synth` | Normalized horizontal strip (8f @ 96x96, facing=right, off=[-48,-56]) from `sprites/fx/fx_explosion_he.png`; sha256=64446ce0f019 |
| `normalized/vfx/fx_explosion_small.png` | `generated_synth` | Normalized horizontal strip (5f @ 32x32, facing=right, off=[-16,-16]) from `sprites/fx/fx_explosion_small.png`; sha256=fc4ef27ddcb2 |
| `normalized/vfx/fx_explosion_stun.png` | `generated_synth` | Normalized horizontal strip (7f @ 96x96, facing=right, off=[-48,-52]) from `sprites/fx/fx_explosion_stun.png`; sha256=197ea901f8b6 |
| `normalized/vfx/fx_fire_orb.png` | `crawl_tiles_cc0` | Normalized horizontal strip (8f @ 36x36, facing=right, off=[-18,-18]) from `sprites/fx/fx_fire_orb.png`; sha256=72adac95938e |
| `normalized/vfx/fx_laser_muzzle.png` | `kenney_vfx_ui` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-24]) from `sprites/fx/fx_laser_muzzle.png`; sha256=13c809466b5e |
| `normalized/vfx/fx_light_slash.png` | `crawl_tiles_cc0` | Normalized horizontal strip (7f @ 64x64, facing=right, off=[-32,-32]) from `sprites/fx/fx_light_slash.png`; sha256=7bc4aa91c812 |
| `normalized/vfx/fx_light_sword.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 48x48, facing=right, off=[-24,-24]) from `sprites/fx/fx_light_sword.png`; sha256=c9db6ed72496 |
| `normalized/vfx/fx_lightning_bolt_blue.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 48x96, facing=right, off=[-24,-88]) from `sprites/fx/fx_lightning_bolt_blue.png`; sha256=6766827eb442 |
| `normalized/vfx/fx_lightning_bolt_yellow.png` | `crawl_tiles_cc0` | Normalized horizontal strip (6f @ 48x96, facing=right, off=[-24,-88]) from `sprites/fx/fx_lightning_bolt_yellow.png`; sha256=c531dd041f60 |
| `normalized/vfx/fx_lightning_orb.png` | `crawl_tiles_cc0` | Normalized horizontal strip (8f @ 36x36, facing=right, off=[-18,-18]) from `sprites/fx/fx_lightning_orb.png`; sha256=b2c7dc86de92 |
| `normalized/vfx/fx_muzzle_kinetic.png` | `generated_synth` | Normalized horizontal strip (3f @ 20x16, facing=right, off=[-2,-8]) from `sprites/fx/fx_muzzle_kinetic.png`; sha256=4685f8c8d600 |
| `normalized/vfx/fx_slash_crescent.png` | `generated_synth` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-48]) from `sprites/fx/fx_slash_crescent.png`; sha256=906a2a09fb24 |
| `normalized/vfx/fx_slash_scythe.png` | `generated_synth` | Normalized horizontal strip (6f @ 160x160, facing=right, off=[-80,-80]) from `sprites/fx/fx_slash_scythe.png`; sha256=ef7dbef3efae |
| `normalized/vfx/fx_slash_shock.png` | `generated_synth` | Normalized horizontal strip (4f @ 96x96, facing=right, off=[-48,-48]) from `sprites/fx/fx_slash_shock.png`; sha256=76eaf2ddc31c |
| `normalized/vfx/fx_smoke_puff.png` | `generated_synth` | Normalized horizontal strip (8f @ 32x32, facing=right, off=[-16,-16]) from `sprites/fx/fx_smoke_puff.png`; sha256=402a716ac487 |
| `normalized/vfx/fx_stun_ring.png` | `generated_synth` | Normalized horizontal strip (8f @ 64x48, facing=right, off=[-32,-24]) from `sprites/fx/fx_stun_ring.png`; sha256=c1159db9a344 |
| `normalized/vfx/fx_stun_star.png` | `generated_synth` | Normalized horizontal strip (2f @ 16x16, facing=right, off=[-8,-8]) from `sprites/fx/fx_stun_star.png`; sha256=c06b39411045 |
| `normalized/vfx/impact_spark.png` | `generated_synth` | Normalized horizontal strip (4f @ 24x24, facing=right, off=[-12,-12]) from `sprites/fx/impact_spark.png`; sha256=336bb50d3aa0 |
| `normalized/vfx/muzzle_flash.png` | `generated_synth` | Normalized horizontal strip (3f @ 32x24, facing=right, off=[-4,-12]) from `sprites/fx/muzzle_flash.png`; sha256=e9750531d0e0 |
| `normalized/vfx/muzzle_plasma.png` | `generated_synth` | Normalized horizontal strip (3f @ 32x24, facing=right, off=[-4,-12]) from `sprites/fx/muzzle_plasma.png`; sha256=080d08880db7 |
| `normalized/vfx/vfx_storm.png` | `internal_miragine` | Normalized horizontal strip (9f @ 153x261, facing=center, off=[-76,-240]) from `sprites/miragine/storm.png`; sha256=b4504215ec4e |
| `normalized/weapons/arcane_book.png` | `generated_synth` | Normalized horizontal strip (2f @ 20x20, facing=right, off=[-10,-10]) from `sprites/weapons/arcane_book.png`; sha256=3c869de41638 |
| `normalized/weapons/gadget_auto_turret.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-24,-44]) from `sprites/weapons/gadget_auto_turret.png`; sha256=20fb14522bea |
| `normalized/weapons/gadget_cluster_bomb.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=right, off=[-16,-16]) from `sprites/weapons/gadget_cluster_bomb.png`; sha256=04483f263e36 |
| `normalized/weapons/gadget_heal_drone.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=right, off=[-16,-16]) from `sprites/weapons/gadget_heal_drone.png`; sha256=e86f3398427e |
| `normalized/weapons/gadget_stun_bomb.png` | `generated_synth` | Normalized horizontal strip (4f @ 32x32, facing=right, off=[-16,-16]) from `sprites/weapons/gadget_stun_bomb.png`; sha256=80934cfd11ba |
| `normalized/weapons/gun_blizzard_carbine.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_blizzard_carbine.png`; sha256=ed5d135dbfbd |
| `normalized/weapons/gun_chronos_rifle.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_chronos_rifle.png`; sha256=3b804d6e1fb0 |
| `normalized/weapons/gun_cluster_rpg.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_cluster_rpg.png`; sha256=3bf3f4eb409e |
| `normalized/weapons/gun_cryo_cannon.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_cryo_cannon.png`; sha256=2c5edad8412b |
| `normalized/weapons/gun_dual_pistols.png` | `generated_synth` | Normalized horizontal strip (4f @ 34x18, facing=right, off=[-9,-9]) from `sprites/weapons/gun_dual_pistols.png`; sha256=7edc886deb6b |
| `normalized/weapons/gun_electric_gun.png` | `generated_synth` | Pre-normalized arc coil gun sprite strip (3f @ 38x18); sha256=032e8d8d5002 |
| `normalized/weapons/gun_flamethrower.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_flamethrower.png`; sha256=0ee06e762a42 |
| `normalized/weapons/gun_gravity_gun.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-9,-9]) from `sprites/weapons/gun_gravity_gun.png`; sha256=ab8fa510616e |
| `normalized/weapons/gun_ion_beam.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_ion_beam.png`; sha256=6cc1a43ae2bb |
| `normalized/weapons/gun_laser_cannon.png` | `generated_synth` | Pre-normalized prism laser cannon sprite strip (3f @ 44x18); sha256=407e34dfa1ac |
| `normalized/weapons/gun_magma_spitter.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_magma_spitter.png`; sha256=01b4ee9275df |
| `normalized/weapons/gun_minigun.png` | `generated_synth` | Normalized horizontal strip (4f @ 42x18, facing=right, off=[-11,-10]) from `sprites/weapons/gun_minigun.png`; sha256=1de22f7d29f5 |
| `normalized/weapons/gun_orbital_cannon.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_orbital_cannon.png`; sha256=835d0c661564 |
| `normalized/weapons/gun_phantom_bow.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_phantom_bow.png`; sha256=a48122ce9944 |
| `normalized/weapons/gun_pistol.png` | `generated_synth` | Normalized horizontal strip (3f @ 24x16, facing=right, off=[-6,-8]) from `sprites/weapons/gun_pistol.png`; sha256=f7dc8464a4ba |
| `normalized/weapons/gun_plasma_shotgun.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_plasma_shotgun.png`; sha256=218c8f77ba26 |
| `normalized/weapons/gun_ricochet_disc.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_ricochet_disc.png`; sha256=86840381c791 |
| `normalized/weapons/gun_rifle.png` | `generated_synth` | Normalized horizontal strip (3f @ 40x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_rifle.png`; sha256=f2820ff289e3 |
| `normalized/weapons/gun_saw_launcher.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-9,-9]) from `sprites/weapons/gun_saw_launcher.png`; sha256=48c4413d88d3 |
| `normalized/weapons/gun_shotgun.png` | `generated_synth` | Normalized horizontal strip (4f @ 42x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_shotgun.png`; sha256=a6b10bbf76cb |
| `normalized/weapons/gun_smg.png` | `generated_synth` | Normalized horizontal strip (3f @ 34x18, facing=right, off=[-9,-9]) from `sprites/weapons/gun_smg.png`; sha256=fa31f9e593bf |
| `normalized/weapons/gun_sniper_rifle.png` | `generated_synth` | Pre-normalized long-barrel sniper rifle sprite strip (3f @ 48x18); sha256=3cb1daedf074 |
| `normalized/weapons/gun_tesla_coil.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_tesla_coil.png`; sha256=72d41fd01ae4 |
| `normalized/weapons/gun_twin_smg.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-9,-9]) from `sprites/weapons/gun_twin_smg.png`; sha256=83a92f073e45 |
| `normalized/weapons/gun_void_cannon.png` | `generated_synth` | Normalized horizontal strip (4f @ 38x18, facing=right, off=[-10,-9]) from `sprites/weapons/gun_void_cannon.png`; sha256=f82ffa7062fb |
| `normalized/weapons/lightning_staff.png` | `generated_synth` | Normalized horizontal strip (2f @ 36x14, facing=right, off=[-10,-7]) from `sprites/weapons/lightning_staff.png`; sha256=0b74a2e4dc0d |
| `normalized/weapons/plasma_rifle.png` | `generated_synth` | Normalized horizontal strip (2f @ 32x16, facing=right, off=[-8,-10]) from `sprites/weapons/plasma_rifle.png`; sha256=5ed2dc4da05b |
| `normalized/weapons/railgun_piercer.png` | `generated_synth` | Normalized horizontal strip (3f @ 38x16, facing=right, off=[-9,-10]) from `sprites/weapons/railgun_piercer.png`; sha256=6335fda31e73 |
| `normalized/weapons/w_frag_launcher.png` | `generated_synth` | Normalized horizontal strip (2f @ 32x24, facing=right, off=[-8,-12]) from `sprites/weapons/w_frag_launcher.png`; sha256=c75a803c78b6 |
| `normalized/weapons/w_mine_gun.png` | `generated_synth` | Normalized horizontal strip (2f @ 32x24, facing=right, off=[-8,-12]) from `sprites/weapons/w_mine_gun.png`; sha256=58159db4b9b4 |
| `normalized/weapons/w_stun_launcher.png` | `generated_synth` | Normalized horizontal strip (2f @ 32x24, facing=right, off=[-8,-12]) from `sprites/weapons/w_stun_launcher.png`; sha256=d78207e700f5 |
| `normalized/weapons/w_triple_bazooka.png` | `generated_synth` | Normalized horizontal strip (2f @ 40x24, facing=right, off=[-12,-12]) from `sprites/weapons/w_triple_bazooka.png`; sha256=f0b9e7781370 |
| `normalized/weapons/wpn_crescent_blade.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-10,-24]) from `sprites/weapons/wpn_crescent_blade.png`; sha256=fb44833f727f |
| `normalized/weapons/wpn_reaper_scythe.png` | `generated_synth` | Normalized horizontal strip (4f @ 64x64, facing=right, off=[-14,-32]) from `sprites/weapons/wpn_reaper_scythe.png`; sha256=6109a35d2f9b |
| `normalized/weapons/wpn_shock_baton.png` | `generated_synth` | Normalized horizontal strip (4f @ 48x48, facing=right, off=[-10,-24]) from `sprites/weapons/wpn_shock_baton.png`; sha256=394be9cb7f2b |
| `sprites/miragine/SD_dead1.mp3` | `internal_miragine` | SFX clip (444ms) from database-miraginewar/audio/SD_dead1.mp3; sha256=5259d70c0862 |
| `sprites/miragine/SD_dead2.mp3` | `internal_miragine` | SFX clip (470ms) from database-miraginewar/audio/SD_dead2.mp3; sha256=9029a19ca2f3 |
| `sprites/miragine/SD_dead3.mp3` | `internal_miragine` | SFX clip (418ms) from database-miraginewar/audio/SD_dead3.mp3; sha256=a376a1618510 |
| `sprites/miragine/SD_dead4.mp3` | `internal_miragine` | SFX clip (366ms) from database-miraginewar/audio/SD_dead4.mp3; sha256=bfa2f56119a3 |
| `sprites/miragine/SD_dead5.mp3` | `internal_miragine` | SFX clip (418ms) from database-miraginewar/audio/SD_dead5.mp3; sha256=8df3afb2df3a |
| `sprites/miragine/SD_dead6.mp3` | `internal_miragine` | SFX clip (313ms) from database-miraginewar/audio/SD_dead6.mp3; sha256=7873c8267604 |
| `sprites/miragine/terrain.jpg` | `internal_miragine` | Copied JPEG arena backdrop (170x135) from `database-miraginewar/terrains/terrain.jpg`; sha256=5866c7482cda |
| `sprites/miragine/terrain2.jpg` | `internal_miragine` | Copied JPEG arena backdrop (680x800) from `database-miraginewar/terrains/terrain2.jpg`; sha256=12c6507dfb3b |

---
## Required Attributions

The default `ban_sung` asset build uses **only** `CC0-1.0`, `MIT`, `INTERNAL-MIRAGINE`, and `GENERATED-SYNTH` assets and carries zero mandatory third-party attribution requirements (other than retaining the MIT notice if `unchained_tds_godot` assets are bundled).

If optional `CC-BY-3.0` or `CC-BY-4.0` audio variation packs in `database-ban-sung/sources.json` are enabled, include the following verbatim credits in the game's Credits / About view:

- **Oculus Audio Pack 01 (`CC-BY-4.0`):**
  > "Oculus Audio Pack 01" by Oculus VR, LLC (https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/), CC BY 4.0.
- **Michel Baradari / qubodup (`CC-BY-3.0`):**
  > "Chaingun, Pistol, Rifle, Shotgun Shots" by Michel Baradari and qubodup (https://opengameart.org/content/chaingun-pistol-rifle-shotgun-shots), CC BY 3.0.
- **Mike Koenig / qubodup (`CC-BY-3.0`):**
  > "Shotgun Shoot + Reload" by Mike Koenig and qubodup (https://opengameart.org/content/shotgun-shoot-reload), CC BY 3.0.
- **dklon (`CC-BY-3.0`):**
  > "Laser Fire" and "Boom Pack 1" by dklon (https://opengameart.org/content/laser-fire), CC BY 3.0.
- **Little Robot Sound Factory (`CC-BY-3.0`):**
  > "Sci-Fi Sound Library" and "8-Bit Sound Library" by Little Robot Sound Factory (https://opengameart.org/), CC BY 3.0.
- **ViRiX (`CC-BY-3.0`):**
  > "UI pack 1" by ViRiX (https://opengameart.org/sites/default/files/UI%20pack%201.zip), CC BY 3.0.
