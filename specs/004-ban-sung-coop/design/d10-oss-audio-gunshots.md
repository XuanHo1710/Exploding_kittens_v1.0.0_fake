# d10 — OSS Firearm, Laser, Reload & Shell Casing SFX Sources

## 1. Scope & Wave-2 Targets
- **Categories**: Gunshots (pistol/generic), Shotgun, Rifle/SMG, Laser/Plasma/Railgun, Reload/Dry-Fire, Shell Casings.
- **License policy (aligned with `d09`)**: Primary sources are strictly **CC0-1.0** (zero attribution burden, safe automated fetch). Optional **CC-BY-3.0** packs are segregated in §4 with required verbatim credits; **CC-BY-SA / NC / ND / GPL-only** packs are excluded.
- **Wave-2 target files**:
  - `database-ban-sung/audio/sfx/sfx_wpn_*.ogg` (normalized mono 44.1 kHz, `-1.0 dBFS` peak; `.wav` optional fallback)
  - `database-ban-sung/manifest.json` (`audio` map per `AudioManifestEntry`)
  - `database-ban-sung/LICENSES.md` (`Source Packs` + `Asset Provenance` + `Required Attributions`)
  - Fetch/normalize script (owned by `d15` / `d16`), consumed by `client/src/bansung/sound.ts` (`d43`).

## 2. Verified Primary Source Packs (`CC0-1.0`)

| `sourceId` | Pack / Repo | License | Verified Direct Base / Archive URL | Fetch Notes |
|---|---|---|---|---|
| `oss_free_firearms` | `buddingmonkey/FreeFirearmsSFXLibrary` (Kickstarter mirror) | `CC0-1.0` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/` | 833 WAVs (`Prepared SFX/` + `Master Tracks/`), indexed by `Master Sheet.xlsx` |
| `oss_superpowers_sfx` | `sparklinlabs/superpowers-asset-packs` | `CC0-1.0` | `https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/` | Direct raw WAV/OGG or `https://opengameart.org/sites/default/files/superpowers-asset-packs-soundeffects_2.zip` (13.4 MB) |
| `oss_kenney_scifi_gh` | `Boyquotes/kenney-sci-fi-sounds-for-godot` (Kenney Sci-Fi Sounds mirror) | `CC0-1.0` | `https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/` | Canonical `https://kenney.nl/assets/sci-fi-sounds` signed `/download-link/` returns HTTP 403 to headless `curl`; use this verified CC0 GitHub mirror |
| `oss_oga_gunshot_zip` | OGA Gunshot Sounds (Tabasco) | `CC0-1.0` | `https://opengameart.org/sites/default/files/sounds.zip` | Page `https://opengameart.org/content/gunshot-sounds`; 5.5 MB zip (`cz.wav`, `mosin.wav`, `shotty.wav`, `sks.wav`) |
| `oss_oga_gunshots_kurt` | OGA Gunshots (kurt) | `CC0-1.0` | `https://opengameart.org/sites/default/files/` | Page `https://opengameart.org/content/gunshots` (`22%20Pistol.wav`, `22%20Magnum.wav`) |
| `oss_oga_gun_reloads` | OGA Reloads (SpringySpringo / zer0_sol / StarNinjas / BMacZero) | `CC0-1.0` | `https://opengameart.org/sites/default/files/` | Direct WAVs + `shotgunsounds.zip` (324 KB) + `gun_reload_-_starninjas.zip` (35 KB) |
| `oss_oga_space_shoot` | OGA Space Shoot Sounds (Robin Lamb) | `CC0-1.0` | `https://opengameart.org/sites/default/files/` | Page `https://opengameart.org/content/space-shoot-sounds` (`alienshoot1..3.{wav,ogg}`) |
| `oss_freesound_casings` | Freesound CC0 Shell Casings (`NicJonesAudio`, `GryffDavid`, `BlondPanda`, `GrayJoy`, `Metrolynn`) | `CC0-1.0` | `https://cdn.freesound.org/previews/` | Direct HTTP 200 `-hq.mp3` previews (no OAuth required); trim to individual clinks |

## 3. Asset Mapping Table (`sfx_wpn_*` -> Verified URLs)

### 3.1 Gunshots (Pistol, Revolver, Generic)
| Target ID (`database-ban-sung/audio/sfx/`) | `sourceId` | Verified Download URL (HTTP 200) | Gain / Cap |
|---|---|---|---|
| `sfx_wpn_pistol.ogg` (`_v1`) | `oss_free_firearms` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/1911/A_34P.wav` | `0.65` / 450ms |
| `sfx_wpn_pistol_v2.ogg` | `oss_free_firearms` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/Walther%20PPQ/X_31P.wav` | `0.65` / 450ms |
| `sfx_wpn_pistol_v3.ogg` | `oss_oga_gunshot_zip` | `https://opengameart.org/sites/default/files/sounds.zip` -> `sounds/cz.wav` | `0.65` / 450ms |
| `sfx_wpn_pistol_arcade.ogg` | `oss_superpowers_sfx` | `https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/top-down-shooter/sounds/shoot-1.wav` | `0.60` / 350ms |
| `sfx_wpn_revolver.ogg` | `oss_oga_gunshots_kurt` | `https://opengameart.org/sites/default/files/22%20Magnum.wav` | `0.72` / 550ms |
| `sfx_wpn_western_gun.ogg` | `oss_superpowers_sfx` | `https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/sounds/gun-1.ogg` | `0.65` / 450ms |

### 3.2 Shotgun (Pump, Scatter)
| Target ID | `sourceId` | Verified Download URL (HTTP 200) | Gain / Cap |
|---|---|---|---|
| `sfx_wpn_shotgun.ogg` (`_v1`) | `oss_free_firearms` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/Mossberg/N_26P.wav` | `0.80` / 650ms |
| `sfx_wpn_shotgun_v2.ogg` | `oss_free_firearms` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/Nova/O_17P.wav` | `0.80` / 650ms |
| `sfx_wpn_shotgun_v3.ogg` | `oss_oga_gunshot_zip` | `https://opengameart.org/sites/default/files/sounds.zip` -> `sounds/shotty.wav` | `0.80` / 650ms |

### 3.3 Rifle, SMG & Sniper
| Target ID | `sourceId` | Verified Download URL (HTTP 200) | Gain / Cap |
|---|---|---|---|
| `sfx_wpn_rifle.ogg` (`_v1`) | `oss_free_firearms` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/AK-47/C_27P.wav` | `0.68` / 500ms |
| `sfx_wpn_rifle_v2.ogg` | `oss_free_firearms` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/AR-15/D_24P.wav` | `0.68` / 500ms |
| `sfx_wpn_rifle_v3.ogg` | `oss_oga_gunshot_zip` | `https://opengameart.org/sites/default/files/sounds.zip` -> `sounds/sks.wav` | `0.68` / 500ms |
| `sfx_wpn_smg.ogg` | `oss_free_firearms` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/PPSh/P_16P.wav` | `0.58` / 300ms |
| `sfx_wpn_smg_v2.ogg` | `oss_superpowers_sfx` | `https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/western-fps-2d/sounds/machinegun.wav` | `0.55` / 250ms |

### 3.4 Laser, Plasma & Railgun
| Target ID | `sourceId` | Verified Download URL (HTTP 200) | Gain / Cap |
|---|---|---|---|
| `sfx_wpn_laser.ogg` (`_v1`) | `oss_kenney_scifi_gh` | `https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_small_000.ogg` | `0.60` / 350ms |
| `sfx_wpn_laser_v2.ogg` | `oss_kenney_scifi_gh` | `https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_small_001.ogg` | `0.60` / 350ms |
| `sfx_wpn_laser_retro.ogg` | `oss_kenney_scifi_gh` | `https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_retro_000.ogg` | `0.58` / 350ms |
| `sfx_wpn_railgun.ogg` | `oss_kenney_scifi_gh` | `https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_large_000.ogg` | `0.78` / 650ms |
| `sfx_wpn_plasma.ogg` | `oss_oga_space_shoot` | `https://opengameart.org/sites/default/files/alienshoot1.wav` | `0.62` / 400ms |
| `sfx_wpn_laser_arc.ogg` | `oss_superpowers_sfx` | `https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/space-shooter/sounds/laser.wav` | `0.60` / 350ms |

### 3.5 Reload, Cocking, Mag Insert & Dry-Fire
| Target ID | `sourceId` | Verified Download URL (HTTP 200) | Role / Cap |
|---|---|---|---|
| `sfx_wpn_reload.ogg` | `oss_oga_gun_reloads` | `https://opengameart.org/sites/default/files/gunreload1.wav` | Generic clip reload / 1100ms |
| `sfx_wpn_reload_pistol.ogg` | `oss_oga_gun_reloads` | `https://opengameart.org/sites/default/files/reload.wav` | Handgun mag swap / 900ms |
| `sfx_wpn_reload_rifle.ogg` | `oss_oga_gun_reloads` | `https://opengameart.org/sites/default/files/assaultriflereload1_0.wav` | Assault rifle reload / 1200ms |
| `sfx_wpn_reload_shotgun.ogg` | `oss_oga_gun_reloads` | `https://opengameart.org/sites/default/files/shotgunsounds.zip` -> `ShotgunSounds/First Shell.mp3` & `Rack.mp3` | Shell insert + pump / 1000ms |
| `sfx_wpn_cock_shotgun.ogg` | `oss_oga_gun_reloads` | `https://opengameart.org/sites/default/files/shotguncock_0.wav` | Pump rack accent / 500ms |
| `sfx_wpn_mag_insert.ogg` | `oss_oga_gun_reloads` | `https://opengameart.org/sites/default/files/clipload1.wav` | Mag click (`singlebullet1.wav` for single round) |
| `sfx_wpn_dryfire.ogg` | `oss_superpowers_sfx` | `https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master/top-down-shooter/sounds/no-ammo.wav` | Empty click (fallback: `Master Tracks/1911/A_19.wav`) |
| `sfx_wpn_rack_rifle.ogg` | `oss_free_firearms` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Master%20Tracks/AR-15/D_14.wav` | Active-reload sweet-spot rack / 700ms |

### 3.6 Shell Casings, Brass Bounce & Extraction
| Target ID | `sourceId` | Verified Download URL (HTTP 200) | Role / Cap |
|---|---|---|---|
| `sfx_wpn_casing.ogg` (`_v1`) | `oss_freesound_casings` | `https://cdn.freesound.org/previews/347/347603_3511792-hq.mp3` (`NicJonesAudio/347603`) | Crisp brass shell ping / 350ms |
| `sfx_wpn_casing_v2.ogg` | `oss_freesound_casings` | `https://cdn.freesound.org/previews/210/210102_3278936-hq.mp3` (`GrayJoy/210102`) | Slice 1st bounce on stone/sand / 400ms |
| `sfx_wpn_casing_v3.ogg` | `oss_freesound_casings` | `https://cdn.freesound.org/previews/318/318964_5421667-hq.mp3` (`GryffDavid/318964`) | Slice multi-size casing drop / 400ms |
| `sfx_wpn_casing_spin.ogg` | `oss_freesound_casings` | `https://cdn.freesound.org/previews/777/777922_8927049-hq.mp3` (`BlondPanda/777922`) | Metal shell spin tail / 450ms |
| `sfx_wpn_casing_shotgun.ogg` | `oss_freesound_casings` | `https://cdn.freesound.org/previews/620/620929_6493174-hq.mp3` (`Metrolynn/620929`) | Hollow 12ga shell bounce / 450ms |
| `sfx_wpn_shell_eject.ogg` | `oss_free_firearms` | `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Master%20Tracks/Ruger%20Single%20Six/S_3.wav` | Revolver casing extract / 500ms |

## 4. Optional `CC-BY-3.0` Alternatives (Require Attribution)
Use only if extra variation is desired; requires adding verbatim credit to `database-ban-sung/LICENSES.md`:
- `https://opengameart.org/sites/default/files/shots.7z` (`https://opengameart.org/content/chaingun-pistol-rifle-shotgun-shots`, **CC-BY 3.0**, credit: *Michel Baradari / qubodup*).
- `https://opengameart.org/sites/default/files/mike_koenig-shotgun.7z` (`https://opengameart.org/content/shotgun-shoot-reload`, **CC-BY 3.0**, credit: *Mike Koenig / qubodup*).
- `https://opengameart.org/sites/default/files/laser1.wav` .. `laser13.wav` (`https://opengameart.org/content/laser-fire`, **CC-BY 3.0**, credit: *dklon*).
- **Do NOT fetch** `Laser-Fire-sfx_ogg_1.7z` (`sci-fi-laser-fire-sfx`) because it carries `CC-BY-SA 3.0`.

## 5. Integration Notes for `d15`, `d16` & `d43`
- **Format & pure-Node compatibility (`d15`/`d16`)**: Primary kinetic/reload/plasma sources (`FreeFirearmsSFXLibrary`, OGA WAVs, `superpowers` `.wav`s) are uncompressed `.wav`, allowing pure-Node PCM peak/trim normalization (`-1.0 dBFS` per `d16`) with zero external binaries; `.ogg`/`.mp3` sources (`Boyquotes` Kenney lasers, Freesound casing previews, `shotgunsounds.zip`) copy verbatim as browser-native `.ogg`/`.mp3` (or transcode via `ffmpeg` when available) with `fallbackPath`/`.wav` synth fallback.
- **Slicing multi-take files (`d15`)**: `GrayJoy/210102`, `GryffDavid/318964`, `Metrolynn/620929`, and `C_27P.wav`/`P_16P.wav` contain short bursts or multi-takes; slice the first clean transient (`silencedetect` at `-38 dBFS`, trim trailing fade) so each clip is one tight transient (`<= cap`).
- **Rate-limiting & pitch jitter (`d43`)**: Follow `client/src/thap/sound.ts` `lastPlayed` debounce (`minGapMs`: `55ms` for `sfx_wpn_smg`/`sfx_wpn_rifle`, `110ms` for `sfx_wpn_casing`, `90ms` for `sfx_wpn_shotgun`) plus `±6%` playbackRate pitch jitter and round-robin across `_v1.._v3`.
- **Synth fallback keys (`d16`)**: Map `synthFallback` on every `sfx_wpn_*` entry (`"wpn_pistol"`, `"wpn_shotgun"`, `"wpn_rifle"`, `"wpn_laser"`, `"wpn_railgun"`, `"wpn_reload"`, `"wpn_dryfire"`, `"wpn_casing"`) so offline/blocked environments still produce crisp filtered-noise + pitched-transient audio.
