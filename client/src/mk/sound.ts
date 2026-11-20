/**
 * Mighty Knight 2.5D Pixel — 16-Bit Chiptune/FM Audio Manager.
 *
 * Manages 4 seamless BGM tracks (`lobby_theme`, `battle_grass`, `battle_volcano`, `boss_theme`)
 * and 42 combat SFX with 45 ms per-SFX anti-spam throttling, priority channels for
 * Parry / Ultimate / Level Up, mute sync, and zero-dependency WebAudio synth fallback.
 */
import { MK_STATIC_ROOT, type MkBiome } from '../../../shared/src';
import { isMuted } from '../sfx';
import type { MkRenderView } from './store';

export type MkBgmTrack = 'menu' | 'lobby_theme' | 'battle_grass' | 'battle_volcano' | 'boss_theme';

const HIGH_PRIORITY_SFX = new Set(['parry_clang', 'ultimate_cast', 'level_up', 'boss_roar', 'revive_ok']);

let muted = false;
let initialized = false;
let audioCtx: AudioContext | null = null;
let currentBgm: MkBgmTrack | null = null;
let bgmEl: HTMLAudioElement | null = null;
const sfxPool = new Map<string, HTMLAudioElement[]>();
const lastPlayedAt = new Map<string, number>();
let lastConsumedTick = -1;

function ensureAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export async function initMkAudio(): Promise<void> {
  if (initialized) return;
  initialized = true;
  ensureAudioCtx();
}

export function syncMkMute(override?: boolean): void {
  muted = override !== undefined ? Boolean(override) : isMuted();
  if (bgmEl) {
    bgmEl.muted = muted;
    if (muted) bgmEl.pause();
    else if (currentBgm) bgmEl.play().catch(() => {});
  }
}

export function setMkBgm(rawTrack: MkBgmTrack): void {
  if (typeof Audio === 'undefined') return;
  const track = rawTrack === 'menu' ? 'lobby_theme' : rawTrack;
  if (currentBgm === track && bgmEl) {
    if (!muted && bgmEl.paused) bgmEl.play().catch(() => {});
    return;
  }
  stopMkBgm();
  currentBgm = track;
  const url = `${MK_STATIC_ROOT}/audio/bgm/${track}.wav`;
  const el = new Audio(url);
  el.loop = true;
  el.volume = 0.28;
  el.muted = muted;
  bgmEl = el;
  if (!muted) el.play().catch(() => {});
}

export function setMkBgmForState(biome: MkBiome, hasBoss: boolean): void {
  if (hasBoss) setMkBgm('boss_theme');
  else if (biome === 'volcano' || biome === 'citadel') setMkBgm('battle_volcano');
  else setMkBgm('battle_grass');
}

export function stopMkBgm(): void {
  if (bgmEl) {
    try {
      bgmEl.pause();
      bgmEl.currentTime = 0;
    } catch {
      // ignore
    }
    bgmEl = null;
  }
  currentBgm = null;
}

export function disposeMkAudio(): void {
  stopMkBgm();
  sfxPool.clear();
  lastPlayedAt.clear();
  lastConsumedTick = -1;
}

function playFallbackBeep(name: string): void {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = HIGH_PRIORITY_SFX.has(name) ? 'square' : 'triangle';
  const freq = name === 'parry_clang' ? 1180 : name === 'ultimate_cast' ? 880 : name === 'coin_pick' ? 1046 : 360;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.13);
}

export function playMkSfx(name: string): void {
  if (muted || typeof Audio === 'undefined' || !name) return;
  const now = performance.now();
  const prev = lastPlayedAt.get(name) ?? 0;
  const throttle = HIGH_PRIORITY_SFX.has(name) ? 20 : 45;
  if (now - prev < throttle) return;
  lastPlayedAt.set(name, now);

  const url = `${MK_STATIC_ROOT}/audio/sfx/${name}.wav`;
  let pool = sfxPool.get(name);
  if (!pool) {
    pool = [];
    sfxPool.set(name, pool);
  }
  let el = pool.find((a) => a.paused || a.ended);
  if (!el && pool.length < 3) {
    el = new Audio(url);
    el.volume = HIGH_PRIORITY_SFX.has(name) ? 0.56 : 0.4;
    pool.push(el);
  }
  if (!el) return;
  try {
    el.currentTime = 0;
    el.play().catch(() => playFallbackBeep(name));
  } catch {
    playFallbackBeep(name);
  }
}

export function consumeMkFrameAudio(view: MkRenderView): void {
  if (view.tick <= lastConsumedTick) return;
  lastConsumedTick = view.tick;
  setMkBgmForState(view.biome, Boolean(view.boss));
  for (let i = 0; i < view.sfx.length; i++) {
    playMkSfx(view.sfx[i]);
  }
}
