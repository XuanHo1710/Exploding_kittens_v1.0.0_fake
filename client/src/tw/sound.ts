/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) – Bộ Âm Thanh Chiến Trường & Nhạc Nền Cổ Phong
 * - Nhạc nền vòng lặp: `/database-total-war/audio/battle_bgm.wav` (`game`) và `menu_bgm.wav` (`menu`)
 *   ở mức âm lượng dễ chịu (`BGM_VOLUME = { game: 0.14, menu: 0.28 }`), tự mở khóa autoplay trên
 *   `pointerdown`/`keydown` và đồng bộ tức thì với nút tắt tiếng qua `onMuteChange` của `../sfx`.
 * - Hiệu ứng chiến trường (`war_horn.wav`, `war_drums.wav`, `cavalry_charge.wav`, `arrow_volley.wav`,
 *   `melee_clash.wav`, `trebuchet_boom.wav`, `duel_gong.wav`, `unit_rout.wav`, `victory_cheer.wav`,
 *   `ui_drum_click.wav`) có tiết lưu `minGapMs`, nhân hệ số `SFX_SCALE = 0.45` và dự phòng WebAudio êm dịu.
 */
import type { TwSfxEvent } from '../../../shared/src/tw';
import { audioCtx, isMuted, onMuteChange } from '../sfx';

const AUDIO_BASE = '/database-total-war/audio';

/** Âm lượng nhạc nền: trong trận để nhỏ trầm hùng không át tiếng điều quân, ở sảnh menu rõ nét hơn */
export const BGM_VOLUME = { game: 0.14, menu: 0.28 } as const;

/** Hệ số âm lượng chung cho mọi hiệu ứng chiến trường & nút điều quân */
export const SFX_SCALE = 0.45;

export type TwSoundEvent = TwSfxEvent | 'click' | 'order';

let bgmAudio: HTMLAudioElement | null = null;
let bgmTrack: 'menu' | 'game' | null = null;
let unlockRegistered = false;

function tryPlayBgm(): void {
  if (!bgmAudio || isMuted()) return;
  void bgmAudio.play().catch(() => {
    if (unlockRegistered || typeof window === 'undefined') return;
    unlockRegistered = true;
    const unlock = () => {
      unlockRegistered = false;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (bgmAudio && !isMuted()) {
        void bgmAudio.play().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  });
}

/** Phát nhạc nền vòng lặp Tam Quốc Toàn Chiến (`battle_bgm.wav` khi giao chiến, `menu_bgm.wav` ở sảnh chờ) */
export function startTwBgm(track: 'menu' | 'game' = 'game'): void {
  if (typeof Audio === 'undefined') return;
  const src = track === 'game' ? `${AUDIO_BASE}/battle_bgm.wav` : `${AUDIO_BASE}/menu_bgm.wav`;
  if (bgmAudio && bgmTrack === track) {
    bgmAudio.volume = BGM_VOLUME[track];
    bgmAudio.muted = isMuted();
    if (bgmAudio.paused && !isMuted()) tryPlayBgm();
    return;
  }
  stopTwBgm();
  try {
    const a = new Audio(src);
    a.loop = true;
    a.preload = 'auto';
    a.volume = BGM_VOLUME[track];
    a.muted = isMuted();
    bgmAudio = a;
    bgmTrack = track;
    tryPlayBgm();
  } catch {
    /* trình duyệt không hỗ trợ HTMLAudioElement */
  }
}

/** Dừng hoàn toàn nhạc nền Tam Quốc Toàn Chiến khi rời phòng / chuyển trò chơi */
export function stopTwBgm(): void {
  if (!bgmAudio) return;
  try {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
  } catch {
    /* bỏ qua lỗi dừng audio */
  }
  bgmAudio = null;
  bgmTrack = null;
}

/** Đồng bộ trạng thái tắt/bật tiếng từ thanh công cụ chung sang nhạc nền Tam Quốc */
export function syncTwBgmMute(): void {
  if (!bgmAudio) return;
  bgmAudio.muted = isMuted();
  if (isMuted()) {
    bgmAudio.pause();
  } else if (bgmAudio.paused) {
    tryPlayBgm();
  }
}

// Đồng bộ ngay lập tức khi người chơi bật/tắt nút loa ở bất kỳ màn hình nào
onMuteChange(() => syncTwBgmMute());

// ============================================================================
// TỔNG HỢP WEBAUDIO DỰ PHÒNG ÊM DỊU (GENTLE WEBAUDIO FALLBACK)
// ============================================================================

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; slide?: number; delay?: number } = {},
): void {
  if (isMuted()) return;
  try {
    const c = audioCtx();
    const t = c.currentTime + (opts.delay ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slide) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq * opts.slide), t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (opts.gain ?? 0.07) * SFX_SCALE), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.04);
  } catch {
    /* AudioContext chưa sẵn sàng */
  }
}

function noise(
  dur: number,
  opts: { gain?: number; freq?: number; sweep?: number; delay?: number; type?: BiquadFilterType } = {},
): void {
  if (isMuted()) return;
  try {
    const c = audioCtx();
    const t = c.currentTime + (opts.delay ?? 0);
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.6;
    }
    const src = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const g = c.createGain();
    filter.type = opts.type ?? 'lowpass';
    const f0 = opts.freq ?? 900;
    filter.frequency.setValueAtTime(f0, t);
    if (opts.sweep) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, f0 * opts.sweep), t + dur);
    }
    g.gain.value = (opts.gain ?? 0.16) * SFX_SCALE;
    src.buffer = buf;
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t);
  } catch {
    /* AudioContext chưa sẵn sàng */
  }
}

function playFallbackSfx(ev: TwSoundEvent): void {
  switch (ev) {
    case 'click':
      tone(580, 0.055, { type: 'triangle', gain: 0.055, slide: 0.78 });
      break;
    case 'order':
      tone(135, 0.14, { type: 'sine', gain: 0.1, slide: 0.65 });
      tone(165, 0.12, { type: 'triangle', gain: 0.06, delay: 0.07, slide: 0.72 });
      break;
    case 'horn':
      tone(146.8, 0.55, { type: 'sawtooth', gain: 0.055, slide: 1.02 });
      tone(220, 0.48, { type: 'triangle', gain: 0.045, delay: 0.08 });
      break;
    case 'drums':
      [0, 0.14, 0.28].forEach((d, idx) => {
        tone(idx === 2 ? 110 : 92, 0.18, { type: 'sine', gain: 0.11, delay: d, slide: 0.58 });
      });
      break;
    case 'charge':
      noise(0.32, { freq: 520, sweep: 1.4, gain: 0.14 });
      tone(196, 0.35, { type: 'sawtooth', gain: 0.05, slide: 1.18 });
      break;
    case 'volley':
      noise(0.22, { type: 'bandpass', freq: 2400, sweep: 0.55, gain: 0.12 });
      break;
    case 'clash':
      noise(0.14, { type: 'highpass', freq: 2200, gain: 0.1 });
      tone(920, 0.07, { type: 'triangle', gain: 0.04, slide: 0.75 });
      break;
    case 'boulder':
      noise(0.55, { freq: 480, sweep: 0.25, gain: 0.22 });
      tone(68, 0.48, { type: 'sine', gain: 0.15, slide: 0.45 });
      break;
    case 'duel_gong':
      tone(196, 0.75, { type: 'sine', gain: 0.09, slide: 0.98 });
      tone(311, 0.65, { type: 'triangle', gain: 0.05, delay: 0.01 });
      tone(587, 0.45, { type: 'sine', gain: 0.035, delay: 0.02 });
      break;
    case 'rout':
      [293.7, 246.9, 196].forEach((f, idx) => {
        tone(f, 0.22, { type: 'triangle', gain: 0.055, delay: idx * 0.11, slide: 0.9 });
      });
      break;
    case 'cheer':
      [293.7, 369.99, 440, 587.33].forEach((f, idx) => {
        tone(f, 0.28, { type: 'triangle', gain: 0.065, delay: idx * 0.09 });
      });
      break;
    case 'fire':
      noise(0.42, { type: 'bandpass', freq: 1150, sweep: 0.48, gain: 0.16 });
      tone(145, 0.34, { type: 'sawtooth', gain: 0.045, slide: 0.72 });
      break;
  }
}

// ============================================================================
// BẢNG ÁNH XẠ FILE WAV CHIẾN TRƯỜNG & BỘ TIẾT LƯU (THROTTLE)
// ============================================================================

interface TwWavSpec {
  file: string;
  volume: number;
  minGapMs: number;
}

const TW_SFX_SPECS: Record<TwSoundEvent, TwWavSpec> = {
  horn: { file: 'war_horn.wav', volume: 0.56, minGapMs: 650 },
  drums: { file: 'war_drums.wav', volume: 0.50, minGapMs: 480 },
  charge: { file: 'cavalry_charge.wav', volume: 0.52, minGapMs: 520 },
  volley: { file: 'arrow_volley.wav', volume: 0.42, minGapMs: 280 },
  clash: { file: 'melee_clash.wav', volume: 0.35, minGapMs: 260 },
  boulder: { file: 'trebuchet_boom.wav', volume: 0.58, minGapMs: 360 },
  duel_gong: { file: 'duel_gong.wav', volume: 0.62, minGapMs: 700 },
  rout: { file: 'unit_rout.wav', volume: 0.46, minGapMs: 650 },
  cheer: { file: 'victory_cheer.wav', volume: 0.65, minGapMs: 800 },
  fire: { file: 'trebuchet_boom.wav', volume: 0.38, minGapMs: 520 },
  click: { file: 'ui_drum_click.wav', volume: 0.42, minGapMs: 55 },
  order: { file: 'war_drums.wav', volume: 0.36, minGapMs: 260 },
};

const lastPlayedAt = new Map<TwSoundEvent, number>();

/**
 * Phát hiệu ứng âm thanh chiến trường Tam Quốc Toàn Chiến theo sự kiện `ev`.
 * Tự động kiểm tra `isMuted()`, tiết lưu theo `minGapMs`, nhân hệ số `SFX_SCALE = 0.45`
 * và chuyển sang tổng hợp WebAudio êm dịu nếu trình duyệt chưa nạp kịp file `.wav`.
 */
export function playTwSfx(ev: TwSoundEvent): void {
  if (isMuted()) return;
  const spec = TW_SFX_SPECS[ev];
  if (!spec) return;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const prev = lastPlayedAt.get(ev) ?? -Infinity;
  if (now - prev < spec.minGapMs) return;
  lastPlayedAt.set(ev, now);

  if (typeof Audio === 'undefined') {
    playFallbackSfx(ev);
    return;
  }

  try {
    const a = new Audio(`${AUDIO_BASE}/${spec.file}`);
    a.volume = Math.max(0, Math.min(1, spec.volume * SFX_SCALE));
    void a.play().catch((err: unknown) => {
      // Nếu lỗi do không tải được file âm thanh (NotSupportedError), dùng WebAudio dự phòng
      const errName = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
      if (errName !== 'NotAllowedError') {
        playFallbackSfx(ev);
      }
    });
  } catch {
    playFallbackSfx(ev);
  }
}
