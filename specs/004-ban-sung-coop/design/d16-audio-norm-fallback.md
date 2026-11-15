# [d16] Audio Normalization & Procedural WebAudio Fallback Spec

## 1. Wave-2 Target Files & Environment Constraint
- `scripts/bansung-audio-norm.mjs`: Zero-dependency Node 18+ PCM normalizer/trimmer + deterministic WAV fallback synthesizer (this host has `node.exe` without `ffmpeg`; uses pure-JS RIFF/WAV DSP by default, invoking `ffmpeg` only when present on `PATH` for `.ogg`/`.mp3` transcode).
- `database-ban-sung/audio/normalized/{sfx,bgm}/<id>.wav` (+ `.ogg`/`.mp3` when `ffmpeg` available).
- `database-ban-sung/manifest.json` (`audio.sfx` & `audio.bgm` maps).
- `client/src/bansung/sound.ts`: Buffer decoder + positional panner + procedural fallback (reuses `audioCtx()` and `isMuted()` from `client/src/sfx.ts`, following `client/src/thap/sound.ts` unlock/mute pattern).

## 2. Multi-Format Map & `manifest.json` Audio Schema
- Client format selection probe order via `HTMLAudioElement.canPlayType` / `decodeAudioData`: **`ogg` (Opus/Vorbis) -> `mp3` -> `wav`**; BGM streams via `<audio loop>` (`.mp3`/`.ogg`), SFX pre-decodes into `AudioBuffer` at room load, triggering WebAudio synth immediately if unloaded or decode fails.
```ts
export type BansungSfxId = /* 55 canonical SFX IDs in Section 5 */;
export type BansungBgmId = 'bgm_menu' | 'bgm_combat' | 'bgm_boss';
export interface AudioManifestEntry {
  id: BansungSfxId | BansungBgmId;
  category: 'weapon' | 'ammo' | 'gadget' | 'player' | 'pickup' | 'mob' | 'boss' | 'ui' | 'bgm';
  files: { ogg?: string; mp3?: string; wav: string }; // relative to /database-ban-sung/
  durationMs: number;
  peakDb: number;       // normalized target -1.0 dBFS (0.89125 linear)
  rmsDb: number;        // measured integrated RMS after normalization
  playbackGain: number; // default mix scalar (0.15..1.0)
  minGapMs: number;     // per-ID anti-spam gate
  pitchJitter: number;  // ±ratio (e.g. 0.06 = ±6%)
  maxVoices: number;    // concurrent cap per ID inside global 8-SFX cap
  source: 'oss' | 'miragine' | 'synth_wav';
}
```

## 3. Loudness, DC-Removal & Silence-Trim Pipeline
1. **Decode Input**: Parse raw `.wav` (8/16/24/32-bit PCM or float32) directly in Node; if raw OSS input is `.ogg`/`.mp3` and `ffmpeg` is missing, copy to `normalized/` with `peakDb` metadata + generate fallback `.wav` via Node synth so every entry always has a normalized `.wav`.
2. **Channel & Rate**: Downmix SFX to **mono `44100 Hz` 16-bit PCM** (required for `StereoPannerNode`); preserve **stereo `44100 Hz`** for `bgm_*`.
3. **DC Offset Removal**: Subtract channel mean `mu = sum(x) / N` from every sample.
4. **Silence Trim & Edge Fades**:
   - Head trim: find first index `i0` where `|x[i]| >= 0.00398` (`-48 dBFS`); keep `preRoll = 88` samples (`2 ms`) before `i0`.
   - Tail trim: find last index `i1` where `|x[i]| >= 0.00200` (`-54 dBFS`); keep `tailPad = 661` samples (`15 ms`) after `i1`.
   - Apply `3 ms` linear fade-in (only if `|x[start]| > 0.02`) and `12 ms` raised-cosine fade-out on SFX (`15 ms` loop crossfade tail->head on BGM).
5. **Two-Stage Loudness + `-1 dBFS` Peak Ceiling**:
   - Target RMS: **`-16.0 dBFS`** (`0.1585`) for SFX, **`-18.0 dBFS`** (`0.1259`) for BGM.
   - Compute gain `g = targetRms / max(rms, 1e-5)`. If `peak * g > 0.89125` (`-1.0 dBFS`), apply gentle soft-knee limiter `y = tanh(x * g / 0.89125) * 0.89125` when overshoot `<= +3 dB`, otherwise clamp `g = 0.89125 / peak` (prevents transient clipping on gunshots).
6. **Optional `ffmpeg` Transcode**: If `ffmpeg` exists, emit `-c:a libvorbis -q:a 5` (`.ogg`) and `-c:a libmp3lame -q:a 4` (`.mp3`); otherwise write `.wav` only.

## 4. Procedural WebAudio Fallback Architecture
- All fallback nodes route through one shared `DynamicsCompressorNode` (`threshold: -3`, `knee: 6`, `ratio: 12`, `attack: 0.002`, `release: 0.08`) -> `sfxMasterGain` (`0.89`) -> `ctx.destination`, matching the `-1 dBFS` hardware safety ceiling.
- Three reusable primitives (extending `client/src/thap/sound.ts`):
  - `osc(type, f0, f1, dur, gain, delay=0)`: oscillator with `5ms` attack and exponential ramp `f0 -> f1` + `gain -> 0.0001`.
  - `nz(dur, filter, f0, f1, q, gain, delay=0, pow=1.8)`: noise buffer with decay `(1 - i/N)^pow` through `BiquadFilterNode`.
  - `arp(freqs[], step, dur, type, gain)`: stepped UI/pickup notes.
- BGM fallback: if `<audio>` BGM fails/404s, fail silently without throwing (no endless synth loop spam).

## 5. Complete SFX & BGM Event Map + WebAudio Synth Recipes
| ID | MixGain | Gap/Voices | Jitter | WebAudio Synth Fallback Recipe (`dur` in sec) |
| :--- | :---: | :---: | :---: | :--- |
| `gun_pistol` | 0.70 | 60ms / 3 | 0.06 | `nz(0.09,'bandpass',1800,600,1.2,0.28)` + `osc('triangle',260,70,0.08,0.22)` |
| `gun_rifle` | 0.72 | 55ms / 4 | 0.07 | `nz(0.08,'bandpass',2200,700,1.0,0.30)` + `osc('sawtooth',220,65,0.07,0.18)` |
| `gun_smg` | 0.58 | 35ms / 4 | 0.09 | `nz(0.05,'highpass',1400,2600,0.8,0.22)` + `osc('square',320,110,0.045,0.12)` |
| `gun_shotgun` | 0.85 | 140ms / 2 | 0.05 | `nz(0.22,'lowpass',2400,280,0.7,0.38)` + `osc('sine',150,42,0.18,0.32)` |
| `gun_grenade` | 0.78 | 140ms / 2 | 0.05 | `osc('sine',170,55,0.16,0.28)` + `nz(0.12,'lowpass',700,220,1.0,0.24)` |
| `gun_concussion` | 0.75 | 140ms / 2 | 0.05 | `osc('triangle',420,90,0.15,0.24)` + `nz(0.10,'bandpass',1500,500,1.5,0.22)` |
| `gun_bazooka` | 0.85 | 160ms / 2 | 0.04 | `osc('sawtooth',130,55,0.26,0.22)` + `nz(0.28,'bandpass',900,320,1.2,0.30)` |
| `mine_arm` | 0.55 | 100ms / 2 | 0.02 | `osc('sine',980,980,0.06,0.14)` + `osc('sine',1480,1480,0.08,0.14,0.07)` |
| `gun_plasma` | 0.70 | 65ms / 3 | 0.06 | `osc('sawtooth',880,190,0.13,0.18)` + `osc('sine',1320,320,0.11,0.12)` |
| `gun_railgun` | 0.88 | 180ms / 2 | 0.03 | `osc('sawtooth',1600,85,0.24,0.24)` + `nz(0.22,'highpass',2000,600,0.9,0.28)` |
| `magic_lightning` | 0.72 | 80ms / 3 | 0.08 | `nz(0.16,'bandpass',3200,900,2.5,0.26)` + `osc('square',640,210,0.12,0.14)` |
| `magic_arcane` | 0.65 | 90ms / 3 | 0.05 | `osc('sine',660,990,0.14,0.16)` + `osc('triangle',1320,880,0.16,0.10,0.03)` |
| `melee_slash` | 0.70 | 80ms / 3 | 0.07 | `nz(0.13,'bandpass',1600,450,1.6,0.26)` + `osc('triangle',380,140,0.10,0.12)` |
| `melee_deflect` | 0.80 | 50ms / 3 | 0.08 | `osc('sine',1960,1420,0.14,0.20)` + `osc('triangle',2940,2100,0.10,0.14)` |
| `melee_shock` | 0.76 | 90ms / 2 | 0.06 | `nz(0.14,'bandpass',2800,1100,2.2,0.25)` + `osc('square',240,120,0.12,0.16)` |
| `reload_start` | 0.55 | 80ms / 2 | 0.03 | `nz(0.04,'highpass',2200,3200,1.0,0.16)` + `osc('triangle',420,260,0.04,0.12)` |
| `reload_active` | 0.75 | 80ms / 2 | 0.00 | `osc('triangle',1046,1568,0.09,0.18)` + `osc('sine',1568,2093,0.12,0.16,0.05)` |
| `reload_done` | 0.65 | 80ms / 2 | 0.02 | `osc('square',520,780,0.04,0.12)` + `osc('triangle',920,1180,0.07,0.15,0.04)` |
| `dry_fire` | 0.50 | 120ms / 1 | 0.04 | `osc('square',900,350,0.025,0.10)` + `nz(0.02,'highpass',3000,3000,1.0,0.10)` |
| `shell_casing` | 0.28 | 45ms / 3 | 0.12 | `osc('sine',3400,2900,0.04,0.08)` + `osc('sine',4600,4100,0.03,0.06,0.03)` |
| `bomb_throw` | 0.55 | 90ms / 2 | 0.06 | `nz(0.14,'bandpass',500,1300,1.4,0.18)` + `osc('sine',220,420,0.11,0.10)` |
| `bomb_bounce` | 0.48 | 70ms / 2 | 0.08 | `osc('triangle',380,190,0.05,0.16)` |
| `explode_he` | 0.95 | 90ms / 3 | 0.06 | `nz(0.65,'lowpass',1100,110,0.7,0.45)` + `osc('sine',95,28,0.45,0.38)` |
| `explode_mini` | 0.78 | 70ms / 3 | 0.08 | `nz(0.28,'lowpass',1400,180,0.8,0.34)` + `osc('sine',120,40,0.22,0.26)` |
| `stun_flash` | 0.90 | 150ms / 2 | 0.02 | `nz(0.20,'highpass',2200,800,1.0,0.36)` + `osc('sine',3200,2600,0.55,0.11)` |
| `turret_deploy` | 0.70 | 150ms / 2 | 0.02 | `arp([330,440,660],0.05,0.09,'square',0.14)` + `nz(0.06,'lowpass',900,400,1,0.15)` |
| `turret_shot` | 0.50 | 45ms / 3 | 0.08 | `nz(0.045,'bandpass',2400,900,1.2,0.18)` + `osc('square',360,140,0.04,0.10)` |
| `heal_pulse` | 0.55 | 250ms / 2 | 0.02 | `osc('sine',523,784,0.22,0.14)` + `osc('triangle',1046,1318,0.20,0.08,0.05)` |
| `dash` | 0.60 | 120ms / 2 | 0.06 | `nz(0.16,'bandpass',1200,380,1.3,0.24)` + `osc('sine',260,110,0.12,0.12)` |
| `hit_flesh` | 0.55 | 40ms / 4 | 0.10 | `nz(0.06,'lowpass',1200,300,0.9,0.22)` + `osc('triangle',180,75,0.06,0.16)` |
| `hit_armor` | 0.60 | 45ms / 3 | 0.08 | `osc('square',920,520,0.06,0.14)` + `osc('sine',1840,1200,0.07,0.10)` |
| `hit_crit` | 0.78 | 50ms / 3 | 0.05 | `osc('triangle',987,1480,0.09,0.20)` + `nz(0.07,'highpass',2200,900,1,0.22)` |
| `player_hurt` | 0.78 | 120ms / 2 | 0.04 | `osc('sawtooth',210,80,0.16,0.22)` + `nz(0.14,'lowpass',900,250,1,0.24)` |
| `player_down` | 0.85 | 300ms / 1 | 0.00 | `arp([440,349,262],0.11,0.20,'sawtooth',0.18)` + `osc('sine',110,45,0.35,0.22)` |
| `revive_tick` | 0.45 | 200ms / 1 | 0.00 | `osc('sine',660,880,0.08,0.12)` |
| `revive_done` | 0.82 | 250ms / 1 | 0.00 | `arp([523,659,784,1046],0.06,0.18,'triangle',0.18)` |
| `crate_break` | 0.65 | 60ms / 3 | 0.09 | `nz(0.15,'bandpass',1300,350,0.9,0.26)` + `osc('triangle',160,65,0.10,0.18)` |
| `pickup_orb` | 0.42 | 35ms / 3 | 0.07 | `osc('sine',780,1240,0.06,0.12)` |
| `pickup_hp` | 0.65 | 100ms / 2 | 0.02 | `arp([587,880,1175],0.05,0.12,'sine',0.16)` |
| `pickup_coin` | 0.55 | 40ms / 3 | 0.04 | `osc('sine',988,988,0.06,0.14)` + `osc('sine',1319,1319,0.14,0.14,0.05)` |
| `pickup_weapon` | 0.72 | 120ms / 1 | 0.00 | `arp([440,554,659,880],0.05,0.12,'triangle',0.16)` |
| `perk_pick` | 0.78 | 150ms / 1 | 0.00 | `arp([523,784,1046,1568],0.06,0.16,'triangle',0.18)` |
| `enemy_die` | 0.58 | 45ms / 4 | 0.10 | `osc('triangle',280,75,0.11,0.18)` + `nz(0.10,'lowpass',1100,240,1,0.20)` |
| `sniper_lock` | 0.68 | 120ms / 2 | 0.00 | `osc('sine',1760,1760,0.05,0.14)` + `osc('sine',2349,2349,0.06,0.14,0.07)` |
| `boss_roar` | 0.92 | 400ms / 1 | 0.03 | `osc('sawtooth',95,48,0.65,0.28)` + `nz(0.70,'bandpass',480,160,1.4,0.34)` |
| `boss_slam` | 0.95 | 250ms / 1 | 0.03 | `osc('sine',85,26,0.50,0.40)` + `nz(0.45,'lowpass',800,120,0.8,0.36)` |
| `boss_beam` | 0.82 | 180ms / 1 | 0.02 | `osc('sawtooth',220,440,0.40,0.18)` + `nz(0.40,'bandpass',1600,900,2.0,0.22)` |
| `boss_emp` | 0.85 | 250ms / 1 | 0.02 | `osc('square',920,140,0.35,0.20)` + `nz(0.30,'highpass',1800,500,1.2,0.24)` |
| `wave_start` | 0.80 | 400ms / 1 | 0.00 | `osc('sawtooth',196,294,0.35,0.16)` + `osc('triangle',392,587,0.40,0.16,0.10)` |
| `wave_clear` | 0.82 | 400ms / 1 | 0.00 | `arp([523,659,784,1046],0.08,0.22,'triangle',0.18)` |
| `ui_click` | 0.50 | 40ms / 2 | 0.03 | `osc('triangle',720,960,0.045,0.12)` |
| `ui_deny` | 0.55 | 90ms / 1 | 0.00 | `osc('square',210,145,0.12,0.12)` |
| `ping_coop` | 0.65 | 150ms / 2 | 0.00 | `osc('sine',1046,1568,0.12,0.16)` + `osc('sine',1568,1568,0.14,0.12,0.09)` |
| `match_win` | 0.88 | 500ms / 1 | 0.00 | `arp([523,659,784,1046,1318],0.10,0.30,'triangle',0.20)` |
| `match_lose` | 0.85 | 500ms / 1 | 0.00 | `arp([392,349,311,262],0.14,0.32,'triangle',0.18)` |
| `bgm_menu` | 0.36 | loop / 1 | 0.00 | Stream `.ogg`/`.mp3`/`.wav`; silent skip if missing (no synth loop) |
| `bgm_combat` | 0.34 | loop / 1 | 0.00 | Stream `.ogg`/`.mp3`/`.wav` (-18 LUFS / -1 dBFS); silent skip if missing |
| `bgm_boss` | 0.40 | loop / 1 | 0.00 | Stream `.ogg`/`.mp3`/`.wav` (-18 LUFS / -1 dBFS); silent skip if missing |
