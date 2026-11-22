/**
 * WebAudio synthesized 16-bit & Clair-Obscur-inspired arpeggio audio engine
 * for Astral Expedition Pixel (`006-astral-expedition-pixel`).
 * Zero external paid audio assets required; respects global Dock mute state.
 */

export type ExpeditionSfxKind =
  | 'cursor'
  | 'confirm'
  | 'timed_perfect'
  | 'timed_good'
  | 'timed_miss'
  | 'parry_clang'
  | 'parry_riposte'
  | 'dodge_whoosh'
  | 'hit_impact'
  | 'break_shatter'
  | 'boss_phase'
  | 'anchor_rest'
  | 'chest_open'
  | 'orb_spin'
  | 'ssr_fanfare'
  | 'victory'
  | 'defeat'
  | 'charm_drop'
  | 'charm_lucky'
  | 'comet_streak'
  | 'summon_burst'
  | 'card_reveal';

export type ExpeditionBgmMood = 'none' | 'overworld' | 'battle' | 'boss' | 'aurora_final';

let audioCtx: AudioContext | null = null;
let muted = false;
let expeditionMuted = false;

export function setExpeditionMuted(value: boolean): void {
  expeditionMuted = value;
  if (value) stopExpeditionBgm();
}
let currentMood: ExpeditionBgmMood = 'none';
let bgmTimer: number | null = null;
let bgmStep = 0;

function readGlobalMuted(): boolean {
  if (expeditionMuted) return true;
  try {
    const raw = JSON.parse(localStorage.getItem('meono.settings.v2') ?? '{}');
    if (typeof raw.sound === 'boolean') return !raw.sound;
  } catch {
    /* ignore */
  }
  return false;
}

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (!audioCtx && typeof window !== 'undefined') {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  freq: number,
  durSec: number,
  type: OscillatorType = 'triangle',
  gainPeak = 0.08,
  delaySec = 0,
  slideToFreq?: number,
): void {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideToFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideToFreq), t0 + durSec);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durSec + 0.02);
}

export function playExpeditionSfx(kind: ExpeditionSfxKind): void {
  muted = readGlobalMuted();
  if (muted) return;

  switch (kind) {
    case 'cursor':
      playTone(587.33, 0.055, 'triangle', 0.05);
      break;
    case 'confirm':
      playTone(523.25, 0.08, 'triangle', 0.07);
      playTone(783.99, 0.12, 'triangle', 0.07, 0.05);
      break;
    case 'timed_perfect':
      playTone(659.25, 0.1, 'sine', 0.1);
      playTone(987.77, 0.14, 'triangle', 0.11, 0.05);
      playTone(1318.5, 0.24, 'sine', 0.1, 0.1);
      break;
    case 'timed_good':
      playTone(587.33, 0.1, 'triangle', 0.08);
      playTone(880, 0.16, 'triangle', 0.08, 0.06);
      break;
    case 'timed_miss':
      playTone(220, 0.16, 'sawtooth', 0.06, 0, 140);
      break;
    case 'parry_clang':
      playTone(1480, 0.09, 'square', 0.09, 0, 920);
      playTone(2217, 0.18, 'sine', 0.1, 0.02);
      break;
    case 'parry_riposte':
      playTone(440, 0.09, 'sawtooth', 0.1, 0, 880);
      playTone(880, 0.15, 'square', 0.09, 0.07);
      playTone(1174.66, 0.26, 'triangle', 0.11, 0.14);
      break;
    case 'dodge_whoosh':
      playTone(420, 0.14, 'sine', 0.07, 0, 190);
      break;
    case 'hit_impact':
      playTone(150, 0.14, 'sawtooth', 0.1, 0, 62);
      break;
    case 'break_shatter':
      playTone(980, 0.08, 'square', 0.1, 0, 320);
      playTone(620, 0.14, 'sawtooth', 0.1, 0.05, 160);
      playTone(1240, 0.24, 'triangle', 0.09, 0.08);
      break;
    case 'boss_phase':
      playTone(146.83, 0.45, 'sawtooth', 0.11, 0, 110);
      playTone(220, 0.45, 'triangle', 0.09, 0.08);
      playTone(440, 0.5, 'sine', 0.09, 0.18);
      break;
    case 'anchor_rest':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(f, 0.22, 'sine', 0.07, i * 0.08));
      break;
    case 'chest_open':
      [587.33, 739.99, 880, 1174.66].forEach((f, i) => playTone(f, 0.18, 'triangle', 0.08, i * 0.07));
      break;
    case 'orb_spin':
      playTone(392, 0.12, 'sine', 0.06, 0, 587.33);
      break;
    case 'ssr_fanfare':
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) =>
        playTone(f, 0.28, i % 2 === 0 ? 'triangle' : 'sine', 0.09, i * 0.075),
      );
      break;
    case 'victory':
      [440, 554.37, 659.25, 880].forEach((f, i) => playTone(f, 0.28, 'triangle', 0.08, i * 0.09));
      break;
    case 'defeat':
      [392, 349.23, 311.13, 261.63].forEach((f, i) => playTone(f, 0.3, 'sine', 0.07, i * 0.12));
      break;
    case 'charm_drop':
      playTone(1046.5, 0.09, 'triangle', 0.06);
      playTone(1567.98, 0.22, 'sine', 0.06, 0.05);
      break;
    case 'charm_lucky':
      [783.99, 987.77, 1174.66, 1567.98, 1975.53].forEach((f, i) => playTone(f, 0.2, 'sine', 0.06, i * 0.06));
      break;
    case 'comet_streak':
      playTone(1760, 1.1, 'sine', 0.035, 0, 440);
      playTone(880, 1.2, 'triangle', 0.03, 0.08, 220);
      break;
    case 'summon_burst':
      playTone(196, 0.5, 'sawtooth', 0.05, 0, 98);
      playTone(784, 0.4, 'sine', 0.07, 0.02, 1568);
      playTone(1174.66, 0.5, 'triangle', 0.05, 0.08);
      break;
    case 'card_reveal':
      playTone(659.25, 0.07, 'triangle', 0.05);
      playTone(987.77, 0.14, 'sine', 0.05, 0.04);
      break;
  }
}

const BGM_PATTERNS: Record<Exclude<ExpeditionBgmMood, 'none'>, readonly number[]> = {
  overworld: [293.66, 349.23, 440, 523.25, 440, 349.23, 329.63, 392],
  battle: [220, 261.63, 329.63, 440, 392, 329.63, 293.66, 246.94],
  boss: [196, 233.08, 293.66, 392, 370, 293.66, 261.63, 220],
  aurora_final: [261.63, 311.13, 392, 523.25, 622.25, 523.25, 466.16, 392],
};

export function setExpeditionBgm(mood: ExpeditionBgmMood): void {
  muted = readGlobalMuted();
  if (currentMood === mood && bgmTimer !== null) return;
  stopExpeditionBgm();
  currentMood = mood;
  if (mood === 'none' || muted || typeof window === 'undefined') return;

  bgmStep = 0;
  const intervalMs = mood === 'overworld' ? 420 : mood === 'battle' ? 280 : 230;
  bgmTimer = window.setInterval(() => {
    if (muted || currentMood === 'none') return;
    const notes = BGM_PATTERNS[currentMood];
    const note = notes[bgmStep % notes.length];
    bgmStep += 1;
    playTone(note, intervalMs / 1000 * 0.85, currentMood === 'overworld' ? 'sine' : 'triangle', 0.026);
  }, intervalMs);
}

export function stopExpeditionBgm(): void {
  if (bgmTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
  currentMood = 'none';
}

export function syncExpeditionMute(): void {
  const nextMuted = readGlobalMuted();
  const wasMuted = muted;
  muted = nextMuted;
  if (muted && bgmTimer !== null) {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  } else if (!muted && wasMuted && currentMood !== 'none') {
    const resumeMood = currentMood;
    currentMood = 'none';
    setExpeditionBgm(resumeMood);
  }
}
