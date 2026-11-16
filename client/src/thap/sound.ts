/**
 * Âm thanh & Nhạc nền Miragine War – bộ nạp WebAudio `AudioBuffer` không cấp phát trong giao tranh:
 * - Nhạc nền vòng lặp: `mainLoop.mp3` (`menu`, 0.28) và `gameLoop.mp3` (`game`, 0.16).
 * - Nạp trước & giải mã toàn bộ 11 file SFX `/database-miraginewar/audio/` thành `AudioBuffer`
 *   khi người chơi tương tác lần đầu (`pointerdown`/`keydown`) hoặc qua `preloadMiragineSfx()`,
 *   có pool `HTMLAudioElement` giới hạn dự phòng nếu chưa giải mã xong (không cấp phát `new Audio()` mỗi hit/death).
 * - Đa âm & tiết lưu chuẩn trận 60 quân: `hit` (`minGapMs: 110`, tối đa 4), `die`/`dead` (`minGapMs: 140`, tối đa 3),
 *   lọc âm thanh ngoài khung hình (`volumeScale <= 0.02`), đồng bộ hoàn toàn với `isMuted()` của `../sfx`.
 */
import { audioCtx, isMuted, onMuteChange } from '../sfx';

const AUDIO_BASE = '/database-miraginewar/audio';

/** Âm lượng nhạc nền: menu rõ nét (0.28), trong trận êm dịu (0.16) */
const BGM_VOLUME = { menu: 0.28, game: 0.16 } as const;
/** Hệ số âm lượng chung cho mọi hiệu ứng chiến trường & giao diện */
const SFX_SCALE = 0.45;
/** Ngưỡng nhỏ nhất để phát âm thanh không gian (<= 0.02 coi như ngoài màn hình) */
const MIN_AUDIBLE_SCALE = 0.02;
const MAX_COMBAT_POLYPHONY = 4;
const MAX_DEATH_POLYPHONY = 3;
const FALLBACK_POOL_CAP = 2;

const DEATH_FILES = [
  'SD_dead1.mp3',
  'SD_dead2.mp3',
  'SD_dead3.mp3',
  'SD_dead4.mp3',
  'SD_dead5.mp3',
  'SD_dead6.mp3',
] as const;

const SFX_FILES = [
  'SD_btns.mp3',
  'SD_Timer.mp3',
  'SD_cheer.mp3',
  'SD_dao.mp3',
  'SD_cha.mp3',
  ...DEATH_FILES,
] as const;

type SfxFile = (typeof SFX_FILES)[number];
type PolyphonyGroup = 'none' | 'combat' | 'death';
type ThrottleChannel =
  | 'click'
  | 'buy'
  | 'timer'
  | 'hit'
  | 'die'
  | 'boom'
  | 'win'
  | 'lose'
  | 'horn'
  | 'alarm'
  | 'deny';

export type ThapSound =
  | 'click'
  | 'buy'
  | 'deny'
  | 'horn'
  | 'alarm'
  | 'fall'
  | 'boom'
  | 'win'
  | 'lose'
  | 'timer'
  | 'dead'
  | 'die'
  | 'hit';

let bgmAudio: HTMLAudioElement | null = null;
let bgmTrack: 'menu' | 'game' | null = null;
let bgmUnlockAttached = false;
let sfxUnlockAttached = false;
let userUnlocked = false;

let sfxMasterCtx: AudioContext | null = null;
let sfxMasterGain: GainNode | null = null;

const decodedBuffers: Partial<Record<SfxFile, AudioBuffer>> = {};
const rawBuffers: Partial<Record<SfxFile, ArrayBuffer>> = {};
const inFlightFetches: Partial<Record<SfxFile, Promise<void>>> = {};
let activePreload: Promise<void> | null = null;

const fallbackPools: Partial<Record<SfxFile, HTMLAudioElement[]>> = {};
const combatVoiceUntil = new Float64Array(MAX_COMBAT_POLYPHONY);
const deathVoiceUntil = new Float64Array(MAX_DEATH_POLYPHONY);

const lastPlayedAt: Record<ThrottleChannel, number> = {
  click: -Infinity,
  buy: -Infinity,
  timer: -Infinity,
  hit: -Infinity,
  die: -Infinity,
  boom: -Infinity,
  win: -Infinity,
  lose: -Infinity,
  horn: -Infinity,
  alarm: -Infinity,
  deny: -Infinity,
};

function allSfxDecoded(): boolean {
  for (let i = 0; i < SFX_FILES.length; i++) {
    if (!decodedBuffers[SFX_FILES[i]]) return false;
  }
  return true;
}

function getMasterGain(ctx: AudioContext): GainNode {
  if (!sfxMasterGain || sfxMasterCtx !== ctx) {
    sfxMasterCtx = ctx;
    sfxMasterGain = ctx.createGain();
    sfxMasterGain.gain.setValueAtTime(isMuted() ? 0 : 1, ctx.currentTime);
    sfxMasterGain.connect(ctx.destination);
  }
  return sfxMasterGain;
}

async function decodeRawBuffer(file: SfxFile): Promise<void> {
  const raw = rawBuffers[file];
  if (!raw || decodedBuffers[file]) return;
  try {
    const ctx = audioCtx();
    // Copy slice because decodeAudioData detaches the passed ArrayBuffer.
    const buf = await ctx.decodeAudioData(raw.slice(0));
    decodedBuffers[file] = buf;
    delete rawBuffers[file];
  } catch {
    /* Retain rawBuffers[file] so decode can retry after user interaction unlocks AudioContext. */
  }
}

function ensureSfxFile(file: SfxFile): Promise<void> {
  if (decodedBuffers[file]) return Promise.resolve();
  if (rawBuffers[file]) return decodeRawBuffer(file);
  const existing = inFlightFetches[file];
  if (existing) return existing;

  const task = fetch(`${AUDIO_BASE}/${file}`)
    .then(async (res) => {
      if (!res.ok) return;
      rawBuffers[file] = await res.arrayBuffer();
      await decodeRawBuffer(file);
    })
    .catch(() => {
      /* Ignore transient network errors; fallback pool handles playback. */
    })
    .finally(() => {
      delete inFlightFetches[file];
    });

  inFlightFetches[file] = task;
  return task;
}

/**
 * Nạp trước & giải mã toàn bộ 11 file âm thanh Miragine War vào WebAudio `AudioBuffer`.
 * An toàn khi gọi nhiều lần (idempotent) và tự giải mã lại sau khi trình duyệt mở khóa audio.
 */
export function preloadMiragineSfx(): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve();
  }
  if (allSfxDecoded()) return Promise.resolve();
  if (activePreload) return activePreload;

  activePreload = Promise.all(SFX_FILES.map((file) => ensureSfxFile(file)))
    .then(() => undefined)
    .finally(() => {
      activePreload = null;
    });
  return activePreload;
}

function handleFirstUserUnlock(): void {
  userUnlocked = true;
  if (sfxUnlockAttached && typeof window !== 'undefined') {
    sfxUnlockAttached = false;
    window.removeEventListener('pointerdown', handleFirstUserUnlock, true);
    window.removeEventListener('keydown', handleFirstUserUnlock, true);
  }
  try {
    const ctx = audioCtx();
    getMasterGain(ctx);
  } catch {
    /* AudioContext unavailable */
  }
  void preloadMiragineSfx();
  if (bgmAudio && bgmAudio.paused && !isMuted()) {
    tryPlayBgm();
  }
}

function ensureInitialUnlockListener(): void {
  if (userUnlocked || sfxUnlockAttached || typeof window === 'undefined') return;
  sfxUnlockAttached = true;
  window.addEventListener('pointerdown', handleFirstUserUnlock, { capture: true, passive: true });
  window.addEventListener('keydown', handleFirstUserUnlock, { capture: true, passive: true });
}

ensureInitialUnlockListener();

function attachBgmUnlock(): void {
  if (bgmUnlockAttached || typeof window === 'undefined') return;
  bgmUnlockAttached = true;
  const retry = () => {
    bgmUnlockAttached = false;
    window.removeEventListener('pointerdown', retry, true);
    window.removeEventListener('keydown', retry, true);
    if (bgmAudio && bgmAudio.paused && !isMuted()) {
      tryPlayBgm();
    }
  };
  window.addEventListener('pointerdown', retry, { capture: true, passive: true });
  window.addEventListener('keydown', retry, { capture: true, passive: true });
}

function tryPlayBgm(): void {
  if (!bgmAudio || isMuted()) return;
  void bgmAudio.play().catch(() => {
    attachBgmUnlock();
  });
}

/** Phát nhạc nền vòng lặp vô hạn chuẩn Miragine War (`mainLoop.mp3` ở menu, `gameLoop.mp3` khi đánh trận) */
export function startMiragineBgm(mode: 'menu' | 'game' = 'game'): void {
  if (mode === 'game') void preloadMiragineSfx();
  if (typeof Audio === 'undefined') return;
  const src = mode === 'game' ? `${AUDIO_BASE}/gameLoop.mp3` : `${AUDIO_BASE}/mainLoop.mp3`;
  if (bgmAudio && bgmTrack === mode) {
    bgmAudio.volume = BGM_VOLUME[mode];
    bgmAudio.muted = isMuted();
    if (bgmAudio.paused && !isMuted()) tryPlayBgm();
    return;
  }
  stopMiragineBgm();
  try {
    const a = new Audio(src);
    a.loop = true;
    a.preload = 'auto';
    a.volume = BGM_VOLUME[mode];
    a.muted = isMuted();
    bgmAudio = a;
    bgmTrack = mode;
    tryPlayBgm();
  } catch {
    /* HTMLAudioElement unavailable */
  }
}

/** Dừng hoàn toàn nhạc nền Miragine War hiện tại */
export function stopMiragineBgm(): void {
  if (!bgmAudio) return;
  try {
    bgmAudio.pause();
    if (bgmAudio.readyState > 0) bgmAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
  bgmAudio = null;
  bgmTrack = null;
}

/** Đồng bộ trạng thái tắt tiếng chung từ `../sfx` tới BGM, WebAudio master gain và pool fallback */
export function syncMiragineBgmMute(): void {
  const muted = isMuted();
  if (sfxMasterGain && sfxMasterCtx) {
    sfxMasterGain.gain.setValueAtTime(muted ? 0 : 1, sfxMasterCtx.currentTime);
  }
  for (let i = 0; i < SFX_FILES.length; i++) {
    const pool = fallbackPools[SFX_FILES[i]];
    if (!pool) continue;
    for (let j = 0; j < pool.length; j++) {
      const el = pool[j];
      el.muted = muted;
      if (muted && !el.paused) {
        try {
          el.pause();
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (!bgmAudio) return;
  bgmAudio.muted = muted;
  if (muted) bgmAudio.pause();
  else if (bgmAudio.paused) tryPlayBgm();
}

onMuteChange(() => syncMiragineBgmMute());

function clampScale(volumeScale?: number): number {
  if (volumeScale === undefined) return 1;
  if (!Number.isFinite(volumeScale)) return 1;
  return Math.max(0, Math.min(1, volumeScale));
}

function tryClaimChannel(channel: ThrottleChannel, minGapMs: number): boolean {
  const now = performance.now();
  if (now - lastPlayedAt[channel] < minGapMs) return false;
  lastPlayedAt[channel] = now;
  return true;
}

function getPolyphonySlots(group: PolyphonyGroup): Float64Array | null {
  if (group === 'combat') return combatVoiceUntil;
  if (group === 'death') return deathVoiceUntil;
  return null;
}

function findFreeVoiceSlot(group: PolyphonyGroup, now: number): number {
  const slots = getPolyphonySlots(group);
  if (!slots) return 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] <= now) return i;
  }
  return -1;
}

function markVoiceSlot(group: PolyphonyGroup, slotIdx: number, now: number, durationMs: number): void {
  const slots = getPolyphonySlots(group);
  if (!slots || slotIdx < 0) return;
  slots[slotIdx] = now + durationMs;
}

function playDecodedBuffer(buf: AudioBuffer, gainLevel: number): number | null {
  try {
    const ctx = audioCtx();
    const master = getMasterGain(ctx);
    master.gain.setValueAtTime(isMuted() ? 0 : 1, ctx.currentTime);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    g.gain.setValueAtTime(gainLevel, ctx.currentTime);
    src.connect(g);
    g.connect(master);
    src.start(ctx.currentTime);
    return Math.max(40, buf.duration * 1000);
  } catch {
    return null;
  }
}

function acquirePooledAudio(file: SfxFile, allowSteal: boolean): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  let pool = fallbackPools[file];
  if (!pool) {
    pool = [];
    fallbackPools[file] = pool;
  }
  for (let i = 0; i < pool.length; i++) {
    const el = pool[i];
    if (el.paused || el.ended) return el;
  }
  if (pool.length < FALLBACK_POOL_CAP) {
    try {
      const el = new Audio(`${AUDIO_BASE}/${file}`);
      el.preload = 'auto';
      pool.push(el);
      return el;
    } catch {
      return null;
    }
  }
  return allowSteal ? pool[0] : null;
}

function playPooledAudio(file: SfxFile, gainLevel: number, allowSteal: boolean): number | null {
  const el = acquirePooledAudio(file, allowSteal);
  if (!el) return null;
  try {
    if (el.readyState > 0) el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, gainLevel));
    el.muted = isMuted();
    void el.play().catch(() => {});
    return Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 450;
  } catch {
    return null;
  }
}

function playSampleRaw(file: SfxFile, volume: number, scale: number, allowSteal = true): number | null {
  const gainLevel = Math.max(0, Math.min(1, volume * SFX_SCALE * scale));
  const buf = decodedBuffers[file];
  if (buf) {
    const durationMs = playDecodedBuffer(buf, gainLevel);
    if (durationMs !== null) return durationMs;
  } else {
    void preloadMiragineSfx();
  }
  return playPooledAudio(file, gainLevel, allowSteal);
}

interface SfxPlayOptions {
  volume: number;
  scale: number;
  channel: ThrottleChannel;
  minGapMs: number;
  group?: PolyphonyGroup;
}

/**
 * Phát 1 mẫu âm thanh đã preload (hoặc fallback pool), áp dụng tiết lưu và giới hạn đa âm.
 * Trả về `true` nếu âm thanh được phát hoặc bị tiết lưu/giới hạn đa âm có chủ đích.
 */
function playSfxSample(file: SfxFile, opts: SfxPlayOptions): boolean {
  const group = opts.group ?? 'none';
  const now = performance.now();
  if (now - lastPlayedAt[opts.channel] < opts.minGapMs) return true;
  const slot = findFreeVoiceSlot(group, now);
  if (slot < 0) return true;

  const durationMs = playSampleRaw(file, opts.volume, opts.scale, group === 'none');
  if (durationMs === null) return false;

  lastPlayedAt[opts.channel] = now;
  markVoiceSlot(group, slot, now, durationMs);
  return true;
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: 'sine' | 'triangle'; gain?: number; slide?: number; delay?: number } = {},
): boolean {
  try {
    const ctx = audioCtx();
    const master = getMasterGain(ctx);
    master.gain.setValueAtTime(isMuted() ? 0 : 1, ctx.currentTime);
    const t = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (opts.slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    }
    const peak = Math.max(0.0002, (opts.gain ?? 0.06) * SFX_SCALE);
    const attackEnd = t + Math.min(0.01, dur * 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, attackEnd);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.04);
    return true;
  } catch {
    return false;
  }
}

function playLowThud(scale: number): void {
  tone(84, 0.45, { type: 'sine', gain: 0.14 * scale, slide: 0.42 });
  tone(56, 0.55, { type: 'triangle', gain: 0.07 * scale, slide: 0.5 });
}

function playDefeatChord(scale: number): void {
  tone(196.0, 0.22, { type: 'triangle', gain: 0.06 * scale });
  tone(155.56, 0.28, { type: 'triangle', gain: 0.06 * scale, delay: 0.08 });
  tone(130.81, 0.45, { type: 'triangle', gain: 0.07 * scale, delay: 0.16 });
  tone(98.0, 0.48, { type: 'sine', gain: 0.085 * scale, delay: 0.16, slide: 0.67 });
}

function playCommandChime(scale: number): void {
  const ok = tone(164.81, 0.16, { type: 'triangle', gain: 0.055 * scale, slide: 0.72 });
  tone(329.63, 0.14, { type: 'sine', gain: 0.032 * scale, delay: 0.025 });
  if (!ok) playSampleRaw('SD_btns.mp3', 0.4, scale);
}

/**
 * Phát hiệu ứng Miragine War chuẩn xác, hỗ trợ tỷ lệ âm lượng không gian `volumeScale` (0..1).
 * Tự bỏ qua ngay khi tắt tiếng hoặc `volumeScale <= 0.02` mà không làm trôi nhịp tiết lưu.
 */
export function playThap(kind: ThapSound, volumeScale = 1): void {
  if (isMuted()) return;
  const scale = clampScale(volumeScale);
  if (scale <= MIN_AUDIBLE_SCALE) return;

  try {
    switch (kind) {
      case 'click':
        if (!playSfxSample('SD_btns.mp3', { volume: 0.42, scale, channel: 'click', minGapMs: 40 })) {
          tone(660, 0.055, { type: 'triangle', gain: 0.045 * scale });
        }
        break;
      case 'buy':
        if (!playSfxSample('SD_btns.mp3', { volume: 0.48, scale, channel: 'buy', minGapMs: 40 })) {
          tone(880, 0.065, { type: 'triangle', gain: 0.045 * scale });
        }
        break;
      case 'timer':
        if (!playSfxSample('SD_Timer.mp3', { volume: 0.5, scale, channel: 'timer', minGapMs: 250 })) {
          tone(1046, 0.14, { type: 'triangle', gain: 0.055 * scale });
        }
        break;
      case 'hit': {
        const file = Math.random() < 0.5 ? 'SD_dao.mp3' : 'SD_cha.mp3';
        playSfxSample(file, {
          volume: 0.28,
          scale,
          channel: 'hit',
          minGapMs: 110,
          group: 'combat',
        });
        break;
      }
      case 'die':
      case 'dead': {
        const file = DEATH_FILES[Math.floor(Math.random() * DEATH_FILES.length)];
        playSfxSample(file, {
          volume: 0.34,
          scale,
          channel: 'die',
          minGapMs: 140,
          group: 'death',
        });
        break;
      }
      case 'boom':
      case 'fall':
        if (!tryClaimChannel('boom', 150)) return;
        playSampleRaw('SD_dead6.mp3', 0.55, scale);
        playLowThud(scale);
        break;
      case 'win':
        playSfxSample('SD_cheer.mp3', { volume: 0.65, scale, channel: 'win', minGapMs: 300 });
        break;
      case 'lose':
        if (!tryClaimChannel('lose', 400)) return;
        stopMiragineBgm();
        playDefeatChord(scale);
        break;
      case 'horn':
        if (!tryClaimChannel('horn', 160)) return;
        playCommandChime(scale);
        break;
      case 'deny':
        if (!tryClaimChannel('deny', 120)) return;
        tone(190, 0.13, { type: 'triangle', gain: 0.045 * scale, slide: 0.72 });
        break;
      case 'alarm':
        if (!tryClaimChannel('alarm', 600)) return;
        tone(660, 0.12, { type: 'triangle', gain: 0.045 * scale, slide: 0.82 });
        tone(660, 0.12, { type: 'triangle', gain: 0.045 * scale, delay: 0.16, slide: 0.82 });
        break;
    }
  } catch {
    /* AudioContext unavailable */
  }
}
