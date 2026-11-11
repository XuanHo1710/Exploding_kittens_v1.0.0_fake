/**
 * Âm thanh & Nhạc nền Miragine War – phát trực tiếp các file MP3 gốc trích xuất trong `/database-miraginewar/audio/`:
 * - Nhạc nền trận đấu: `gameLoop.mp3` (vòng lặp vô hạn)
 * - Nhạc nền menu: `mainLoop.mp3` (vòng lặp vô hạn)
 * - Hiệu ứng: `SD_btns.mp3`, `SD_Timer.mp3`, `SD_cheer.mp3`, `SD_dao.mp3`, `SD_cha.mp3`, `SD_dead1..6.mp3`,
 * kết hợp tổng hợp WebAudio dự phòng, dùng chung trạng thái tắt tiếng `isMuted()` với `sfx.ts`.
 */
import { audioCtx, isMuted } from '../sfx';

let bgmAudio: HTMLAudioElement | null = null;
let bgmTrack: 'menu' | 'game' | null = null;
let unlockRegistered = false;

function tryPlayBgm() {
  if (!bgmAudio || isMuted()) return;
  void bgmAudio.play().catch(() => {
    if (unlockRegistered || typeof window === 'undefined') return;
    unlockRegistered = true;
    const unlock = () => {
      unlockRegistered = false;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (bgmAudio && !isMuted()) void bgmAudio.play().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  });
}

/** Phát nhạc nền vòng lặp vô hạn chuẩn Miragine War (`gameLoop.mp3` khi đánh trận, `mainLoop.mp3` ở menu) */
export function startMiragineBgm(track: 'menu' | 'game' = 'game') {
  if (typeof Audio === 'undefined') return;
  const src = track === 'game' ? '/database-miraginewar/audio/gameLoop.mp3' : '/database-miraginewar/audio/mainLoop.mp3';
  if (bgmAudio && bgmTrack === track) {
    bgmAudio.muted = isMuted();
    if (bgmAudio.paused && !isMuted()) tryPlayBgm();
    return;
  }
  stopMiragineBgm();
  try {
    const a = new Audio(src);
    a.loop = true;
    a.volume = track === 'game' ? 0.38 : 0.42;
    a.muted = isMuted();
    bgmAudio = a;
    bgmTrack = track;
    tryPlayBgm();
  } catch {
    /* ignore */
  }
}

export function stopMiragineBgm() {
  if (!bgmAudio) return;
  try {
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
  } catch {
    /* ignore */
  }
  bgmAudio = null;
  bgmTrack = null;
}

export function syncMiragineBgmMute() {
  if (!bgmAudio) return;
  bgmAudio.muted = isMuted();
  if (!isMuted() && bgmAudio.paused) tryPlayBgm();
}

function tone(freq: number, dur: number, o: { type?: OscillatorType; gain?: number; slide?: number; delay?: number } = {}) {
  const c = audioCtx();
  const t = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * o.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.08, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, o: { gain?: number; freq?: number; sweep?: number; delay?: number; type?: BiquadFilterType } = {}) {
  const c = audioCtx();
  const t = c.currentTime + (o.delay ?? 0);
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.5;
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(o.freq ?? 900, t);
  if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(30, (o.freq ?? 900) * o.sweep), t + dur);
  g.gain.value = o.gain ?? 0.2;
  src.buffer = buf;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

const lastPlayed = new Map<string, number>();

function playMp3(file: string, volume = 0.45, minGapMs = 70): boolean {
  if (isMuted() || typeof Audio === 'undefined') return false;
  const now = performance.now();
  const prev = lastPlayed.get(file) ?? 0;
  if (now - prev < minGapMs) return true;
  lastPlayed.set(file, now);
  try {
    const a = new Audio(`/database-miraginewar/audio/${file}`);
    a.volume = Math.max(0, Math.min(1, volume));
    void a.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

const safe = (fn: () => void) => {
  if (isMuted()) return;
  try {
    fn();
  } catch {
    /* AudioContext chưa sẵn sàng */
  }
};

export type ThapSound =
  | 'click'
  | 'buy'
  | 'deny'
  | 'horn'
  | 'alarm'
  | 'fall'
  | 'win'
  | 'lose'
  | 'upgrade'
  | 'timer'
  | 'dead'
  | 'hit';

export function playThap(s: ThapSound) {
  safe(() => {
    switch (s) {
      case 'click':
        if (!playMp3('SD_btns.mp3', 0.4, 50)) {
          tone(660, 0.06, { type: 'triangle', gain: 0.05 });
        }
        break;
      case 'buy':
        if (!playMp3('SD_btns.mp3', 0.5, 45)) {
          tone(880, 0.07, { type: 'triangle', gain: 0.05 });
          tone(1320, 0.09, { type: 'sine', gain: 0.04, delay: 0.05 });
        }
        break;
      case 'timer':
        if (!playMp3('SD_Timer.mp3', 0.5, 250)) {
          tone(1046, 0.14, { type: 'triangle', gain: 0.06 });
        }
        break;
      case 'dead': {
        const idx = 1 + Math.floor(Math.random() * 6);
        playMp3(`SD_dead${idx}.mp3`, 0.34, 180);
        break;
      }
      case 'hit': {
        const file = Math.random() < 0.5 ? 'SD_dao.mp3' : 'SD_cha.mp3';
        playMp3(file, 0.25, 220);
        break;
      }
      case 'deny':
        tone(200, 0.15, { type: 'square', gain: 0.03, slide: 0.7 });
        break;
      case 'upgrade':
        playMp3('SD_Timer.mp3', 0.45, 100);
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.05, delay: i * 0.06 }));
        break;
      case 'horn':
        if (!playMp3('SD_cheer.mp3', 0.42, 350)) {
          tone(196, 0.5, { type: 'sawtooth', gain: 0.05, slide: 1.02 });
          tone(294, 0.45, { type: 'sawtooth', gain: 0.03, delay: 0.08 });
        }
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) tone(880, 0.12, { type: 'square', gain: 0.035, delay: i * 0.18, slide: 0.8 });
        break;
      case 'fall':
        playMp3('SD_dead6.mp3', 0.55, 150);
        noise(1.2, { freq: 900, sweep: 0.12, gain: 0.32 });
        tone(70, 1.0, { type: 'sine', gain: 0.18, slide: 0.45 });
        break;
      case 'win':
        playMp3('SD_cheer.mp3', 0.65, 100);
        [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.07, delay: i * 0.11 }));
        break;
      case 'lose':
        [392, 349, 311, 262].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.06, delay: i * 0.16 }));
        break;
    }
  });
}
