# d15 — Asset Pipeline Scripts (`scripts/bansung-assets/`)

## Scope & Verified Host Runtime Constraints
- **Host check**: Node `v22.20.0` is installed; `python` and `ffmpeg` are **NOT** installed on this Windows host.
- **Core rule**: All pipeline stages **MUST run 100% in zero-dependency Node 22 ESM** (`node:fs`, `node:path`, `node:zlib`, `node:crypto`, `node:child_process`) so `node scripts/bansung-assets/run.mjs` succeeds with zero `npm install`, Python, or `ffmpeg`.
- **Optional accelerators**: `py_normalize.py` (Pillow) and `ffmpeg` are probed via `execFileSync` and auto-skipped when absent.
- **Outputs**: Populates `database-ban-sung/` (served at `/database-ban-sung` in `client/vite.config.ts` and `server/src/app.module.ts`); never modifies `database-miraginewar/`.

---

## 1. Exact Wave-2 Target Files
| File | Responsibility |
|---|---|
| `scripts/bansung-assets/run.mjs` | CLI orchestrator (`--fetch`, `--offline`, `--force`, `--check`) |
| `scripts/bansung-assets/sources.json` | Verified CC0/MIT OSS URLs, Miragine reuse map, license & SHA-256 registry |
| `scripts/bansung-assets/fetch-oss.mjs` | HTTPS downloader (`fetch`), zip-slip-safe extractor, Miragine asset copier |
| `scripts/bansung-assets/png-codec.mjs` | Pure Node RGBA PNG decoder/encoder (`zlib`), nearest-neighbor scale, outline, packer |
| `scripts/bansung-assets/build-sprites.mjs` | OSS normalizer + repaletter + guaranteed pixel-art sprite strip synthesizer |
| `scripts/bansung-assets/wav-synth.mjs` | Pure Node 16-bit PCM WAV parser/writer, `-1 dBFS` normalizer, deterministic SFX/BGM synth |
| `scripts/bansung-assets/build-audio.mjs` | Audio collector/normalizer + guaranteed WAV fallback emitter for all SFX/BGM IDs |
| `scripts/bansung-assets/build-manifest.mjs` | Emits `database-ban-sung/manifest.json` & `LICENSES.md`; enforces `--check` gates |
| `scripts/bansung-assets/py_normalize.py` | Optional Python 3 + Pillow batch quantizer (invoked only if `python3 -c "import PIL"` exits 0) |

### CLI Execution Modes
- `node scripts/bansung-assets/run.mjs --offline`: Zero network; copies `database-miraginewar/` reusable files + synthesizes all missing sprites/WAVs + writes `manifest.json` & `LICENSES.md`.
- `node scripts/bansung-assets/run.mjs --fetch`: Attempts OSS downloads into `database-ban-sung/_cache/` (`15s` timeout, `2` retries); on HTTP/extract error, logs warning and falls back to synth so Wave-2 builds stay deterministic.
- `node scripts/bansung-assets/run.mjs --check`: CI/QA integrity gate (non-zero exit on any missing/corrupt asset or license violation).

---

## 2. `sources.json` Schema & Reuse Mapping
```jsonc
{
  "packs": [
    {
      "id": "kenney_topdown_shooter",
      "kind": "sprite",
      "license": "CC0-1.0",
      "url": "https://kenney.nl/media/pages/assets/top-down-shooter/downloads/kenney_top-down-shooter.zip",
      "attribution": "Kenney.nl (CC0 1.0)",
      "maxBytes": 52428800,
      "map": { "Spritesheet/spritesheet_characters.png": "raw/kenney_chars.png" }
    }
  ],
  "miragineReuse": [
    { "src": "structures/shadow.png", "dest": "sprites/fx/shadow.png", "meta": [1, 38, 16, -19, -8] },
    { "src": "terrains/terrain.jpg", "dest": "sprites/tiles/terrain_desert.jpg" },
    { "src": "terrains/terrain2.jpg", "dest": "sprites/tiles/terrain_ruin.jpg" },
    { "src": "projectiles/fireball.png", "dest": "sprites/fx/fireball.png", "meta": [3, 32, 32, -16, -16] },
    { "src": "projectiles/thunderball.png", "dest": "sprites/fx/thunderball.png", "meta": [16, 128, 128, -64, -64] },
    { "src": "projectiles/storm.png", "dest": "sprites/fx/storm.png", "meta": [9, 153, 261, -76, -240] }
  ]
}
```
- **Security rules (`fetch-oss.mjs`)**: Allow `https:` URLs only; abort if `Content-Length > 52428800` (50 MB); unzip via PowerShell `Expand-Archive -Force` (win32) or `unzip -oq` (posix) into `_cache/<id>/`; verify `path.resolve(dest, entry).startsWith(path.resolve(dest))` (zip-slip block); keep `_cache/` ephemeral.

---

## 3. Zero-Dependency PNG Codec & Strip Normalizer (`png-codec.mjs` + `build-sprites.mjs`)
- **Pure Node PNG Decode (`decodePng(buf)`)**:
  - Verify 8-byte PNG signature (`89 50 4E 47 0D 0A 1A 0A`). Parse chunks (`IHDR`, `PLTE`, `tRNS`, `IDAT`, `IEND`).
  - Support `bitDepth = 8` for `colorType = 2` (RGB), `3` (Indexed via `PLTE` + optional `tRNS`), `6` (RGBA).
  - Concatenate `IDAT` payloads -> `zlib.inflateSync()` -> unfilter scanlines (`stride = w * bpp`):
    - `0`: None (`x`)
    - `1`: Sub (`x + a`)
    - `2`: Up (`x + b`)
    - `3`: Average (`x + ((a + b) >> 1)`)
    - `4`: Paeth (`x + paeth(a, b, c)`, where `p = a + b - c`, nearest of `|p-a|, |p-b|, |p-c|`)
- **Pure Node PNG Encode (`encodePng(w, h, rgba)`)**:
  - Write `IHDR` (`w, h, 8, 6, 0, 0, 0`), prepend filter byte `0x00` to each row, compress with `zlib.deflateSync(raw, { level: 9 })` into `IDAT`, append `IEND`, compute `CRC32` (polynomial `0xEDB88320`) per chunk.
- **Normalization Pipeline (Miragine `[frames, cellW, cellH, offX, offY]` convention)**:
  1. **Slice & Union-Trim**: Slice input sheet into candidate cells; compute union non-transparent bbox across all frames in an action so feet never bob/jitter horizontally or vertically.
  2. **Integer Scale & Crisp Alpha**: Scale strictly by integer `k ∈ {1, 2}` (nearest-neighbor); snap alpha `a >= 128 ? 255 : 0`.
  3. **Feet Pivot Alignment**: Center bottom-edge of character sprite at `(cellW / 2, cellH - 4)` so `offX = -cellW / 2`, `offY = -(cellH - 4)` aligns above `shadow.png`. Center projectiles/FX at `offX = -cellW / 2`, `offY = -cellH / 2`.
  4. **48-Color LUT + 1px Outline**: Snap opaque pixels to shared Soul-Knight/Miragine palette via weighted RGB distance `2*dR^2 + 4*dG^2 + 3*dB^2` (preserving `#FFFFFF` hit highlights); paint `#141013FF` on transparent 4-neighbors of opaque pixels if no dark outline exists.
  5. **Strip Pack**: Blit frames `0..frames-1` left-to-right into single horizontal PNG (`width = frames * cellW`, `height = cellH`) matching `client/src/thap/sprites.ts`.

---

## 4. Guaranteed Pixel-Art Fallback Synthesizer (`build-sprites.mjs`)
Every required sprite ID has a deterministic `2x`-upscaled pixel generator (`#141013` 1px outline, seeded palettes, Miragine-cadence frame transforms):
- **4 Hero Classes** (`hero_gunner`, `hero_ranger`, `hero_pyro`, `hero_knight`): `idle` `[4,32,32,-16,-28]`, `run` `[6,32,32,-16,-28]` (Miragine 6f stride), `dash` `[3,32,32,-16,-28]`, `stun` `[2,32,32,-16,-28]`, `dead` `[4,32,32,-16,-28]`.
- **Weapons** (`32x16`, grip `offX: -9, offY: -9`, plus `muzzleX, muzzleY` in manifest): `pistol`, `rifle`, `smg`, `shotgun`, `grenade`, `stun_launcher`, `bazooka`, `plasma`, `railgun`, `staff`, `blade`, `scythe`.
- **Mobs & Bosses**: 8 mobs (`scarab`, `skirmisher`, `bomb_goblin`, `cactus_brute`, `cactus_spitter`, `sniper`, `pyro_shaman`, `thunder_mage` at `32x32` or `48x48`), 3 bosses (`boss_beholder`, `boss_colossus`, `boss_overlord` at `96x96`, `offX: -48, offY: -88`), `pet_tiger` (`32x32`), desert props (`cactus`, `ruin_pillar`, `crate`, `tnt_barrel`), pickups (`hp`, `energy`, `armor`, `coin`, `chest`), and FX (`explosion_6f`, `stun_stars_4f`, `muzzle_3f`, `shell_casing`, `crater_decal`).

---

## 5. Zero-Dependency WAV Normalizer & Synth (`wav-synth.mjs` + `build-audio.mjs`)
- **Target Format**: Uncompressed RIFF/WAVE PCM (`AudioFormat=1`, `NumChannels=1` mono, `SampleRate=22050`, `BitsPerSample=16`, 44-byte header + `Int16Array` LE payload; `10-45 KB` per SFX).
- **Normalization**:
  - If fetched audio is `.ogg`/`.mp3` and `ffmpeg` exists: `ffmpeg -y -i in -ar 22050 -ac 1 -sample_fmt s16 out.wav`. Else accept native `.wav`/`.mp3`/`.ogg` or synthesize `.wav` fallback.
  - WAV trim & ceiling: strip leading/trailing samples with `|s| < 130` (`-48 dBFS`), apply `110`-sample (`5ms`) linear fade-in/out, multiply by `29204 / maxAbs` (`-1.0 dBFS` peak).
- **Deterministic PRNG (`mulberry32`) + DSP Primitives**: `osc(sine|square|saw|tri)`, `whiteNoise()`, `pinkNoise()`, `onePoleLP(cutoff)`, `adsr()`, `tanhSoftClip(x * drive)`:
  - **Gunshots**: `gun_pistol` (90ms), `gun_rifle` (85ms), `gun_smg` (60ms), `gun_shotgun` (170ms), `gun_laser` (110ms `1100->220Hz` FM), `gun_railgun` (240ms crack + tail), `gun_melee` (110ms swoosh).
  - **Reload/Shell/UI/Hit**: `reload_start` (35ms), `reload_done` (65ms latch), `shell_clink` (45ms `3200Hz` ping), `hit_flesh`, `hit_armor`, `crit_ding`, `dash_whoosh`, `pickup_orb`, `revive_ok`, `ui_click`.
  - **Bombs/Stun/Boss**: `boom_frag`/`boom_barrel` (480ms `95->22Hz` + LP noise), `stun_flash` (320ms `2400Hz` ring + `65Hz` AM zap), `boss_roar` (650ms FM `110->55Hz`).
  - **Seamless BGM Loops**: `bgm_desert`, `bgm_crypt`, `bgm_cyber`, `bgm_boss` (`16-bar` synthesized chiptune WAV at exact `128/140 BPM` sample count, zero-crossing loop edges).

---

## 6. `manifest.json`, `LICENSES.md` & Verification (`build-manifest.mjs`)
```jsonc
{
  "version": 1,
  "sprites": {
    "hero_gunner_idle": { "file": "/database-ban-sung/sprites/heroes/gunner_idle.png", "frames": 4, "cellW": 32, "cellH": 32, "offX": -16, "offY": -28, "fps": 6, "license": "CC0-1.0" },
    "wpn_rifle": { "file": "/database-ban-sung/sprites/weapons/rifle.png", "frames": 2, "cellW": 32, "cellH": 16, "offX": -9, "offY": -9, "muzzleX": 18, "muzzleY": -1, "fps": 12, "license": "CC0-1.0" }
  },
  "audio": {
    "gun_rifle": { "file": "/database-ban-sung/audio/sfx/gun_rifle.wav", "durationMs": 85, "peakDb": -1.0, "loop": false, "license": "CC0-1.0" }
  },
  "terrains": {
    "desert": { "file": "/database-ban-sung/sprites/tiles/terrain_desert.jpg", "license": "MIRAGINE_LOCAL" }
  }
}
```
- **`LICENSES.md`**: Generated table mapping every asset ID -> relative path -> origin (`oss_fetch`, `miragine_reuse`, `synth_pixel`, `synth_wav`) -> license (`CC0-1.0`, `MIT`, `CC-BY-4.0`, `MIRAGINE_LOCAL`) -> attribution URL.
- **`--check` Gate** (exits `1` on any failure): (1) every required sprite/SFX/BGM/terrain ID exists in `manifest.json` & on disk, (2) PNG `IHDR` `width === frames * cellW` & `height === cellH`, (3) WAV `RIFF`/`WAVE` chunk sizes valid & `bitsPerSample === 16`, (4) `license` matches approved allowlist.
