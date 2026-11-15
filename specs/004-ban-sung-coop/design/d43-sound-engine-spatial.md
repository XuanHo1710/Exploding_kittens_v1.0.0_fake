# d43 — Spatial Sound Engine (`client/src/bansung/sound.ts`)

## 1. Scope & Wave-2 File Ownership
- **Creates / Owns:** `client/src/bansung/sound.ts`
- **Reuses:** `audioCtx`, `isMuted`, `setMuted` from `client/src/sfx.ts` (shared `AudioContext` + global mute toggle, matching `client/src/thap/sound.ts` pattern).
- **Consumer Integration Points:**
  - `client/src/bansung/BansungBoard.tsx`: call `initBansungAudio()` on mount, `syncBansungMute()` on mute toggle, `disposeBansungAudio()` on unmount.
  - `client/src/bansung/store.ts` / `render.ts`: call `setListenerPos(camTargetX, camTargetY)` each frame, `consumeFrameAudioEvents(fxList, localPlayerId)` on snapshot arrival, `setBansungBgm(track)` on wave/boss/end transitions.
  - `database-ban-sung/audio/{sfx,bgm}/` + `manifest.json`: optional OSS audio files; engine runs 100% standalone via procedural WebAudio fallback if assets are absent or 404.

## 2. WebAudio Signal Graph & Constants
```text
[BufferSource / Synth] -> [StereoPannerNode] -> [voiceGain] --\
                                                                +--> [sfxBus] -> [DynamicsCompressor] --\
[DeckA <audio>] -> MediaElementSource -> [bgmGainA] --\         |                                        +--> [masterGain] -> ctx.destination
[DeckB <audio>] -> MediaElementSource -> [bgmGainB] --+--> [bgmMasterGain] -----------------------------/
```
- **Limiter (`DynamicsCompressorNode` on `sfxBus`):** `threshold = -8`, `knee = 12`, `ratio = 6`, `attack = 0.003`, `release = 0.15` (prevents clipping during multi-player gunfire + explosions).
- **Constants:**
  - `MAX_SFX_VOICES = 8` (hard simultaneous SFX cap)
  - `STEAL_FADE_SEC = 0.012` (click-free voice-steal fadeout)
  - `PAN_RANGE_PX = 520` (world X delta for full stereo deflection, clamped to `[-0.92, +0.92]`)
  - `FULL_VOL_RADIUS_PX = 140` | `HEAR_RADIUS_PX = 1100` (beyond 1100px = culled before voice alloc)
  - `CROSSFADE_SEC = 1.2` (standard BGM) | `BOSS_CROSSFADE_SEC = 0.45` (urgent boss transition)
  - `PREF_KEY = 'bansung.audio.v1'` (`{ master: 0.85, sfx: 0.85, bgm: 0.42 }`)

## 3. Schemas & Public API
```ts
export type BansungBgmId = 'menu' | 'combat' | 'boss' | 'victory' | 'defeat';

export type BansungSfxId =
  | 'shot_pistol' | 'shot_smg' | 'shot_shotgun' | 'shot_rifle' | 'shot_sniper'
  | 'shot_laser' | 'shot_rocket' | 'shot_flame' | 'melee_swing' | 'turret_shot'
  | 'reload_start' | 'reload_active_hit' | 'reload_done' | 'empty_click' | 'shell_casing' | 'weapon_swap'
  | 'hit_flesh' | 'hit_armor' | 'hit_crit' | 'shield_break' | 'stun_flash' | 'explosion_sm' | 'explosion_lg'
  | 'dash' | 'heal_orb' | 'energy_orb' | 'pickup_weapon' | 'perk_pick'
  | 'player_down' | 'revive_tick' | 'revive_done'
  | 'mob_spawn' | 'mob_die' | 'sniper_lock' | 'boss_roar' | 'boss_slam' | 'boss_laser'
  | 'ui_click' | 'ui_deny' | 'wave_start' | 'wave_clear' | 'win' | 'lose' | 'ping';

export interface SfxPlayOpts {
  x?: number; y?: number;      // world coords; omit for non-spatial UI/global sounds
  local?: boolean;             // true for local player's own shots/dash -> center pan, full gain
  vol?: number;                // caller multiplier (default 1.0)
  pitch?: number;              // explicit rate multiplier override
  sourceId?: string;           // emitter entity/player id for echo suppression
}

export interface SfxSpec {
  urls: string[];              // relative to /database-ban-sung/audio/sfx/; randomly picks 1 loaded buffer
  baseVol: number;             // 0..1
  pitchMin: number;            // e.g. 0.93
  pitchMax: number;            // e.g. 1.07
  volJitter: number;           // +/- fraction, e.g. 0.08
  minGapMs: number;            // per-id debounce (35ms rapid fire .. 250ms alert)
  priority: 0 | 1 | 2 | 3;     // 0=ambient/casing, 1=mob/pickup, 2=player/stun/revive, 3=boom/boss/ui
  spatial: boolean;            // false for UI/wave/win/lose
  fallbackDur: number;         // expected synth duration (sec) for voice lifetime tracking
}
```
Exports: `initBansungAudio()`, `disposeBansungAudio()`, `setListenerPos(x, y)`, `playBansungSfx(id, opts?)`, `consumeFrameAudioEvents(events, localPlayerId)`, `setBansungBgm(track, fadeSec?)`, `duckBansungBgm(factor?, holdMs?)`, `syncBansungMute()`, `getAudioPrefs()`, `setAudioPrefs(partial)`.

## 4. Spatial Math, Randomization & 8-Voice Stealing Algorithm
1. **Spatial Pan & Attenuation (when `spec.spatial && !opts.local && x != null && y != null`):**
   - `dx = x - listenerX`, `dy = y - listenerY`, `dist = Math.hypot(dx, dy)`.
   - If `dist >= HEAR_RADIUS_PX` -> return immediately (zero nodes allocated).
   - `pan = clamp(dx / PAN_RANGE_PX, -0.92, 0.92)`.
   - `t = clamp((dist - FULL_VOL_RADIUS_PX) / (HEAR_RADIUS_PX - FULL_VOL_RADIUS_PX), 0, 1)`.
   - `distGain = (1 - t) * (1 - t)` (smooth quadratic falloff).
   - Non-spatial or `opts.local`: `pan = 0`, `distGain = 1`.
2. **Throttle & Randomization:**
   - Per-ID `lastPlayedMs.get(id)`: if `now - prev < spec.minGapMs`, drop.
   - `rate = opts.pitch ?? (spec.pitchMin + Math.random() * (spec.pitchMax - spec.pitchMin))`.
   - `gain = clamp(spec.baseVol * distGain * (opts.vol ?? 1) * (1 + (Math.random() * 2 - 1) * spec.volJitter), 0, 1)`.
   - If `gain < 0.015`, drop.
3. **8-Voice Polyphony Cap (`activeVoices: ActiveVoice[]`):**
   - Prune any entry where `now >= v.endMs`.
   - If `activeVoices.length >= 8`:
     - Pick victim = `min` by `(v.priority, v.gainScore, v.startMs)`.
     - If `spec.priority < victim.priority || (spec.priority === victim.priority && gain < victim.gainScore * 0.7)` -> drop incoming sound.
     - Else fade victim `voiceGain` to `0.0001` over `STEAL_FADE_SEC`, stop source at `+0.015s`, splice out.
   - Push `{ id, priority: spec.priority, gainScore: gain, startMs: now, endMs: now + durMs, kill }` and clean on `onended`.

## 5. Buffer Cache, Local-Prediction Dedupe & BGM Crossfade
- **Zero-Spam Asset Cache:** `loadBuffer(url)` deduplicates in-flight `fetch` (concurrency cap = 4), decodes via `ctx.decodeAudioData`, caches `AudioBuffer`, and records 404/decode failures in `failedUrls: Set<string>` so missing files never re-fetch and immediately route to procedural WebAudio.
- **Echo Suppression (`consumeFrameAudioEvents`):** Local client triggers immediate `playBansungSfx('shot_*', { local: true })` on click/fire; server snapshot events tagged with `sourceId === localPlayerId` and `shot_*`/`dash`/`reload_*` are skipped when echoed back in the next tick (keeps remote teammates' gunfire & server-only hits/explosions positional).
- **Dual-Deck BGM Crossfade:**
  - Two persistent `<audio loop>` elements (`deckA`, `deckB`, `crossOrigin = 'anonymous'`) wired once via `ctx.createMediaElementSource()` -> `bgmGainA` / `bgmGainB` (guarded against double-wiring).
  - Track paths: `/database-ban-sung/audio/bgm/{menu,combat,boss,victory,defeat}.{ogg,mp3}` (fallback probe: `.ogg` then `.mp3`; if both fail, run lightweight WebAudio `setInterval` pulse/bass loop on the inactive deck gain node).
  - On `setBansungBgm(next, fadeSec)`: if already active deck on `next`, ensure playing & return; else load `next` on inactive deck, `play()` (retrying on one-shot `pointerdown`/`keydown` if autoplay-blocked), then ramp `activeGain -> 0` and `nextGain -> 1` over `fadeSec` (`linearRampToValueAtTime`), pausing old deck after `fadeSec * 1000 + 80` ms.
  - `duckBansungBgm(0.45, 700)` ramps `bgmMasterGain` down over 60ms on `boss_roar` / `wave_clear` and restores over 450ms.

## 6. Procedural WebAudio Fallback Specs (Shared Noise Buffer)
Allocate ONE 1.0s white-noise `AudioBuffer` per `AudioContext` (`getNoiseBuffer(ctx)`) to avoid per-shot GC allocations (`sfx.ts` allocated new buffers every call). Route every synth node into the same `StereoPannerNode -> voiceGain -> sfxBus` so fallback audio respects spatial pan, pitch jitter (`freq * rate`), and the 8-voice cap:

| Category | IDs | Procedural Recipe (`freq * rate`) | `priority` / `minGapMs` |
|---|---|---|---|
| Light Guns | `shot_pistol`, `shot_smg`, `turret_shot` | Bandpass noise (`1800Hz`, 45ms) + tri pop (`240->75Hz`, 55ms) | `2` / `35ms` (`1` / `60ms` turret) |
| Heavy Guns | `shot_shotgun`, `shot_rifle`, `shot_sniper` | Lowpass noise punch (`1200->260Hz`, 95ms) + saw body (`150->45Hz`) | `2` / `45ms` |
| Energy/Heavy | `shot_laser`, `shot_rocket`, `shot_flame` | Laser: saw sweep `1400->320Hz`; Rocket: whoosh noise; Flame: warm BP noise | `2` / `50ms` |
| Reload/Clip | `reload_start`, `reload_active_hit`, `reload_done`, `empty_click`, `shell_casing`, `weapon_swap` | Crisp metallic click (`2200Hz` short BP) / active-reload chime (`880->1320Hz` sine) | `2` (`0` casing) / `45ms` |
| Impacts/Stun | `hit_flesh`, `hit_armor`, `hit_crit`, `shield_break`, `stun_flash` | Armor: metallic FM clang (`620+930Hz`); Crit: crisp `1100Hz` ping; Stun: `2800->1800Hz` ear-ring + burst | `0..2` / `45ms` |
| Explosions | `explosion_sm`, `explosion_lg` | Sub sine drop (`95->26Hz`, 0.45/0.85s) + swept LP noise (`900->110Hz`) | `3` / `80ms` |
| Co-op/Pickups | `dash`, `heal_orb`, `energy_orb`, `pickup_weapon`, `perk_pick`, `player_down`, `revive_tick`, `revive_done` | Dash: HP whoosh; Orbs: rising sine blip; Revive: warm 3-note triad `[523,659,784]` | `1..3` / `60ms` |
| Mobs/Boss/UI | `mob_spawn`, `mob_die`, `sniper_lock`, `boss_roar`, `boss_slam`, `boss_laser`, `ui_click`, `ui_deny`, `wave_start`, `wave_clear`, `win`, `lose`, `ping` | Boss roar: detuned saw growl `78/82Hz`; Sniper lock: 2x `1760Hz` pip; UI/Win/Lose: `thap/sound.ts` chords | `1..3` / `50..250ms` |

## 7. Verification Plan
- Unit/headless check: mock `AudioContext` + `StereoPannerNode`, assert `pan` bounds (`[-0.92, 0.92]`), `dist >= 1100` cull, `activeVoices.length <= 8` under 30-call burst with priority-3 explosion beating priority-0 shell casings, and 404 URLs falling back cleanly without unhandled rejections.
- Browser check: verify no console errors before first click (autoplay unlock), BGM crossfade smoothly transitions `combat -> boss` without clipping, and `setMuted(true)` silences both `sfxBus` and `bgmMasterGain` immediately.
