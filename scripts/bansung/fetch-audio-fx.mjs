#!/usr/bin/env node
/**
 * Wave-2B [w09] — CC0 FX & BGM Fetcher + Pure-Node -1.0 dBFS WAV Normalizer & Fallback Synthesizer.
 *
 * Reads curated CC0/MIT sources from `database-ban-sung/sources.json` (d11) plus
 * canonical d16/d43 FX/revive/pickup/boss/BGM events, fetches verified OSS files,
 * normalizes WAVs to 44.1 kHz (-1.0 dBFS peak ceiling, -16 dBFS SFX / -18 dBFS BGM RMS),
 * and generates deterministic pure-Node -1.0 dBFS WAV fallbacks for every entry.
 *
 * Outputs (exclusive w09 scope):
 *   - database-ban-sung/audio/sfx/fx/*
 *   - database-ban-sung/audio/bgm/*
 *   - database-ban-sung/audio/sfx/fx/meta-fx.json
 *
 * Flags:
 *   --offline   Skip network downloads and emit pure-Node synthesized WAVs only
 *   --force     Re-fetch and re-normalize all files even if already present
 *   --check     Validate existing files and meta-fx.json without re-downloading
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  WAV_CONSTANTS,
  detectMagicFormat,
  fetchBuffer,
  inspectMp3Info,
  inspectOggInfo,
  measurePcmStats,
  mulberry32,
  normalizeWav,
  parseWav,
  sha256Hex,
} from './lib-pack.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_ROOT = path.join(REPO_ROOT, 'database-ban-sung');
const SOURCES_PATH = path.join(DB_ROOT, 'sources.json');
const FX_DIR = path.join(DB_ROOT, 'audio', 'sfx', 'fx');
const BGM_DIR = path.join(DB_ROOT, 'audio', 'bgm');
const META_PATH = path.join(FX_DIR, 'meta-fx.json');

const SR = WAV_CONSTANTS.DEFAULT_SAMPLE_RATE; // 44100 Hz
const ALLOWED_LICENSES = new Set(['CC0-1.0', 'MIT', 'GENERATED-SYNTH']);

// ---------------------------------------------------------------------------
// Extra Verified CC0-1.0 FX Entries (closing d16 §5 & d43 §3 coverage gaps)
// All sourceIds already exist in database-ban-sung/LICENSES.md & sources.json.
// ---------------------------------------------------------------------------

const EXTRA_FX_ITEMS = [
  {
    id: 'bomb_throw',
    category: 'gadget',
    synthFallback: 'bomb_throw',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/Micro%20Pack%20-%20Organic%20Wooshes/Swish%202.wav',
    dest: 'audio/sfx/fx/bomb_throw.wav',
    format: 'wav',
    gain: 0.55,
    minGapMs: 90,
    pitchJitter: 0.06,
    maxVoices: 2,
    priority: 1,
    spatial: true,
  },
  {
    id: 'bomb_bounce',
    category: 'gadget',
    synthFallback: 'bomb_bounce',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactTin_medium_000.ogg',
    dest: 'audio/sfx/fx/bomb_bounce.ogg',
    format: 'ogg',
    gain: 0.48,
    minGapMs: 70,
    pitchJitter: 0.08,
    maxVoices: 2,
    priority: 1,
    spatial: true,
  },
  {
    id: 'turret_deploy',
    category: 'gadget',
    synthFallback: 'turret_deploy',
    sourceId: 'oss_calinou_kenney_ui',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/open_001.wav',
    dest: 'audio/sfx/fx/turret_deploy.wav',
    format: 'wav',
    gain: 0.70,
    minGapMs: 150,
    pitchJitter: 0.02,
    maxVoices: 2,
    priority: 2,
    spatial: true,
  },
  {
    id: 'turret_shot',
    category: 'gadget',
    synthFallback: 'turret_shot',
    sourceId: 'oss_kenney_scifi_gh',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/laser_small_002.ogg',
    dest: 'audio/sfx/fx/turret_shot.ogg',
    format: 'ogg',
    gain: 0.50,
    minGapMs: 45,
    pitchJitter: 0.08,
    maxVoices: 3,
    priority: 1,
    spatial: true,
  },
  {
    id: 'heal_pulse',
    category: 'gadget',
    synthFallback: 'heal_pulse',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/powerUp7.ogg',
    dest: 'audio/sfx/fx/heal_pulse.ogg',
    format: 'ogg',
    gain: 0.55,
    minGapMs: 250,
    pitchJitter: 0.02,
    maxVoices: 2,
    priority: 2,
    spatial: true,
  },
  {
    id: 'player_hurt',
    category: 'player',
    synthFallback: 'player_hurt',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/MMRetroArcadeSoundsPack1_0_5/Impact/ogg/Impact3.ogg',
    dest: 'audio/sfx/fx/player_hurt.ogg',
    format: 'ogg',
    gain: 0.78,
    minGapMs: 120,
    pitchJitter: 0.04,
    maxVoices: 2,
    priority: 2,
    spatial: true,
  },
  {
    id: 'player_down',
    category: 'player',
    synthFallback: 'player_down',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/lowDown.ogg',
    dest: 'audio/sfx/fx/player_down.ogg',
    format: 'ogg',
    gain: 0.85,
    minGapMs: 300,
    pitchJitter: 0.0,
    maxVoices: 1,
    priority: 3,
    spatial: true,
  },
  {
    id: 'revive_tick',
    category: 'player',
    synthFallback: 'revive_tick',
    sourceId: 'oss_calinou_kenney_ui',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/tick_001.wav',
    dest: 'audio/sfx/fx/revive_tick.wav',
    format: 'wav',
    gain: 0.45,
    minGapMs: 200,
    pitchJitter: 0.0,
    maxVoices: 1,
    priority: 2,
    spatial: true,
  },
  {
    id: 'revive_done',
    category: 'player',
    synthFallback: 'revive_done',
    sourceId: 'oss_calinou_kenney_ui',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/confirmation_002.wav',
    dest: 'audio/sfx/fx/revive_done.wav',
    format: 'wav',
    gain: 0.82,
    minGapMs: 250,
    pitchJitter: 0.0,
    maxVoices: 1,
    priority: 3,
    spatial: true,
  },
  {
    id: 'crate_break',
    category: 'pickup',
    synthFallback: 'crate_break',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactWood_heavy_000.ogg',
    dest: 'audio/sfx/fx/crate_break.ogg',
    format: 'ogg',
    gain: 0.65,
    minGapMs: 60,
    pitchJitter: 0.09,
    maxVoices: 3,
    priority: 1,
    spatial: true,
  },
  {
    id: 'pickup_orb',
    category: 'pickup',
    synthFallback: 'pickup_orb',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/pepSound1.ogg',
    dest: 'audio/sfx/fx/pickup_orb.ogg',
    format: 'ogg',
    gain: 0.42,
    minGapMs: 35,
    pitchJitter: 0.07,
    maxVoices: 3,
    priority: 1,
    spatial: true,
  },
  {
    id: 'pickup_hp',
    category: 'pickup',
    synthFallback: 'pickup_hp',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/powerUp1.ogg',
    dest: 'audio/sfx/fx/pickup_hp.ogg',
    format: 'ogg',
    gain: 0.65,
    minGapMs: 100,
    pitchJitter: 0.02,
    maxVoices: 2,
    priority: 1,
    spatial: true,
  },
  {
    id: 'pickup_weapon',
    category: 'pickup',
    synthFallback: 'pickup_weapon',
    sourceId: 'oss_calinou_kenney_ui',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/maximize_001.wav',
    dest: 'audio/sfx/fx/pickup_weapon.wav',
    format: 'wav',
    gain: 0.72,
    minGapMs: 120,
    pitchJitter: 0.0,
    maxVoices: 1,
    priority: 2,
    spatial: false,
  },
  {
    id: 'sniper_lock',
    category: 'mob',
    synthFallback: 'sniper_lock',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/twoTone1.ogg',
    dest: 'audio/sfx/fx/sniper_lock.ogg',
    format: 'ogg',
    gain: 0.68,
    minGapMs: 120,
    pitchJitter: 0.0,
    maxVoices: 2,
    priority: 2,
    spatial: true,
  },
  {
    id: 'mob_spawn',
    category: 'mob',
    synthFallback: 'mob_spawn',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/50-cc0-sci-fi-sfx/teleport_02.ogg',
    dest: 'audio/sfx/fx/mob_spawn.ogg',
    format: 'ogg',
    gain: 0.45,
    minGapMs: 80,
    pitchJitter: 0.06,
    maxVoices: 2,
    priority: 1,
    spatial: true,
  },
  {
    id: 'boss_slam',
    category: 'boss',
    synthFallback: 'boss_slam',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_impactsounds/Audio/impactMining_000.ogg',
    dest: 'audio/sfx/fx/boss_slam.ogg',
    format: 'ogg',
    gain: 0.95,
    minGapMs: 250,
    pitchJitter: 0.03,
    maxVoices: 1,
    priority: 3,
    spatial: true,
  },
  {
    id: 'boss_beam',
    category: 'boss',
    synthFallback: 'boss_beam',
    sourceId: 'oss_kenney_scifi_gh',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/Boyquotes/kenney-sci-fi-sounds-for-godot/main/addons/kenney%20sci-fi%20sounds/force_field_000.ogg',
    dest: 'audio/sfx/fx/boss_beam.ogg',
    format: 'ogg',
    gain: 0.82,
    minGapMs: 180,
    pitchJitter: 0.02,
    maxVoices: 1,
    priority: 3,
    spatial: true,
  },
  {
    id: 'wave_clear',
    category: 'ui',
    synthFallback: 'wave_clear',
    sourceId: 'oss_lavender_cc0_sounds',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/lavenderdotpet/CC0-Public-Domain-Sounds/main/kenney_digitalaudio/Audio/phaserUp1.ogg',
    dest: 'audio/sfx/fx/wave_clear.ogg',
    format: 'ogg',
    gain: 0.82,
    minGapMs: 400,
    pitchJitter: 0.0,
    maxVoices: 1,
    priority: 3,
    spatial: false,
  },
  {
    id: 'ping_coop',
    category: 'ui',
    synthFallback: 'ping_coop',
    sourceId: 'oss_calinou_kenney_ui',
    license: 'CC0-1.0',
    url: 'https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds/bong_001.wav',
    dest: 'audio/sfx/fx/ping_coop.wav',
    format: 'wav',
    gain: 0.65,
    minGapMs: 150,
    pitchJitter: 0.0,
    maxVoices: 2,
    priority: 2,
    spatial: true,
  },
];

// ---------------------------------------------------------------------------
// Pure-Node PCM DSP Primitives (Zero Dependencies)
// ---------------------------------------------------------------------------

function hashStringSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function oscSample(type, phase) {
  const p = phase - Math.floor(phase);
  if (type === 'sine') return Math.sin(p * Math.PI * 2);
  if (type === 'square') return p < 0.5 ? 1 : -1;
  if (type === 'sawtooth') return 2 * p - 1;
  if (type === 'triangle') return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
  return Math.sin(p * Math.PI * 2);
}

/** Generate oscillator envelope buffer with 4ms attack & exponential decay. */
function genOsc(type, f0, f1, durSec, gain, delaySec = 0) {
  const totalSec = delaySec + durSec;
  const n = Math.max(1, Math.round(totalSec * SR));
  const start = Math.round(delaySec * SR);
  const len = Math.max(1, n - start);
  const out = new Float32Array(n);
  const attackSamp = Math.max(1, Math.round(0.004 * SR));
  const safeF0 = Math.max(15, f0);
  const safeF1 = Math.max(15, f1);
  let phase = 0;

  for (let i = 0; i < len; i++) {
    const u = i / len;
    const freq = safeF0 * Math.pow(safeF1 / safeF0, u);
    phase += freq / SR;
    const att = i < attackSamp ? i / attackSamp : 1;
    const dec = Math.pow(0.0005, u);
    out[start + i] = oscSample(type, phase) * gain * att * dec;
  }
  return out;
}

/** RBJ Biquad filter with exponential frequency sweep. */
function filterSwept(input, filterType, f0, f1, q = 1.0, startSample = 0) {
  const out = new Float32Array(input.length);
  const len = Math.max(1, input.length - startSample);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;

  const updateCoeffs = (freq) => {
    const clamped = Math.max(30, Math.min(SR * 0.45, freq));
    const w0 = (2 * Math.PI * clamped) / SR;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Math.max(0.1, q));
    const a0 = 1 + alpha;
    if (filterType === 'lowpass') {
      b0 = ((1 - cosW0) / 2) / a0;
      b1 = (1 - cosW0) / a0;
      b2 = b0;
    } else if (filterType === 'highpass') {
      b0 = ((1 + cosW0) / 2) / a0;
      b1 = -(1 + cosW0) / a0;
      b2 = b0;
    } else {
      // bandpass (constant 0 dB peak gain)
      b0 = alpha / a0;
      b1 = 0;
      b2 = -alpha / a0;
    }
    a1 = (-2 * cosW0) / a0;
    a2 = (1 - alpha) / a0;
  };

  const safeF0 = Math.max(30, f0);
  const safeF1 = Math.max(30, f1);
  for (let i = startSample; i < input.length; i++) {
    if (((i - startSample) & 15) === 0) {
      const u = (i - startSample) / len;
      updateCoeffs(safeF0 * Math.pow(safeF1 / safeF0, u));
    }
    const x0 = input[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
    out[i] = y0;
  }
  return out;
}

/** Generate filtered shaped white noise matching d16 §4/§5 `nz(...)` spec. */
function genNoise(rng, durSec, filterType, f0, f1, q, gain, delaySec = 0, pow = 1.8) {
  const totalSec = delaySec + durSec;
  const n = Math.max(1, Math.round(totalSec * SR));
  const start = Math.round(delaySec * SR);
  const len = Math.max(1, n - start);
  const raw = new Float32Array(n);
  const att = Math.max(1, Math.round(0.002 * SR));

  for (let i = 0; i < len; i++) {
    const env = Math.pow(1 - i / len, pow) * (i < att ? i / att : 1);
    raw[start + i] = (rng() * 2 - 1) * env * gain;
  }
  return filterSwept(raw, filterType, f0, f1, q, start);
}

/** Generate stepped arpeggio sequence matching d16 §4 `arp(...)`. */
function genArp(freqs, stepSec, durSec, type, gain) {
  const layers = freqs.map((f, idx) => genOsc(type, f, f, durSec, gain, idx * stepSec));
  return mixBuffers(layers);
}

function mixBuffers(layers, drive = 1.0) {
  let maxLen = 0;
  for (const b of layers) if (b.length > maxLen) maxLen = b.length;
  const out = new Float32Array(maxLen);
  for (const b of layers) {
    for (let i = 0; i < b.length; i++) out[i] += b[i];
  }
  if (drive !== 1.0) {
    for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * drive);
  }
  return out;
}

function renderSynthSfx(synthKey, seed) {
  const rng = mulberry32(seed);
  switch (synthKey) {
    case 'explode_he':
      return mixBuffers([
        genNoise(rng, 0.65, 'lowpass', 1100, 110, 0.7, 0.65, 0, 1.6),
        genOsc('sine', 95, 28, 0.45, 0.55),
        genOsc('triangle', 140, 36, 0.22, 0.30),
      ], 1.4);
    case 'explode_mini':
      return mixBuffers([
        genNoise(rng, 0.30, 'lowpass', 1400, 180, 0.8, 0.55, 0, 1.8),
        genOsc('sine', 125, 38, 0.24, 0.45),
      ], 1.3);
    case 'stun_flash':
      return mixBuffers([
        genNoise(rng, 0.22, 'highpass', 2200, 800, 1.0, 0.52, 0, 1.6),
        genNoise(rng, 0.10, 'bandpass', 1800, 700, 1.2, 0.40, 0, 2.0),
        genOsc('sine', 3200, 2600, 0.52, 0.22, 0.01),
      ], 1.2);
    case 'boss_emp':
      return mixBuffers([
        genOsc('square', 920, 140, 0.35, 0.32),
        genNoise(rng, 0.30, 'highpass', 1800, 500, 1.2, 0.36, 0, 1.7),
      ]);
    case 'melee_shock':
      return mixBuffers([
        genNoise(rng, 0.15, 'bandpass', 2800, 1100, 2.2, 0.42, 0, 1.8),
        genOsc('square', 240, 120, 0.12, 0.24),
      ]);
    case 'hit_flesh':
      return mixBuffers([
        genNoise(rng, 0.065, 'lowpass', 1200, 300, 0.9, 0.38, 0, 1.8),
        genOsc('triangle', 180, 75, 0.065, 0.32),
      ]);
    case 'hit_armor':
      return mixBuffers([
        genOsc('square', 920, 520, 0.07, 0.28),
        genOsc('sine', 1840, 1200, 0.09, 0.22),
        genOsc('sine', 2470, 2210, 0.11, 0.14),
      ]);
    case 'melee_deflect':
      return mixBuffers([
        genOsc('sine', 1960, 1420, 0.14, 0.32),
        genOsc('triangle', 2940, 2100, 0.11, 0.24),
      ]);
    case 'crate_break':
      return mixBuffers([
        genNoise(rng, 0.15, 'bandpass', 1300, 350, 0.9, 0.44, 0, 1.7),
        genNoise(rng, 0.09, 'highpass', 2400, 900, 1.1, 0.26, 0.025, 2.0),
        genOsc('triangle', 165, 65, 0.11, 0.32),
      ]);
    case 'hit_crit':
      return mixBuffers([
        genOsc('triangle', 987, 1480, 0.10, 0.34),
        genOsc('sine', 1974, 2480, 0.12, 0.20, 0.01),
        genNoise(rng, 0.07, 'highpass', 2200, 900, 1.0, 0.34),
      ]);
    case 'player_hurt':
      return mixBuffers([
        genOsc('sawtooth', 210, 80, 0.16, 0.34),
        genNoise(rng, 0.14, 'lowpass', 900, 250, 1.0, 0.38),
      ]);
    case 'player_down':
      return mixBuffers([
        genArp([440, 349.23, 261.63], 0.11, 0.20, 'sawtooth', 0.26),
        genOsc('sine', 110, 45, 0.38, 0.36),
      ]);
    case 'enemy_die':
      return mixBuffers([
        genOsc('triangle', 280, 75, 0.12, 0.30),
        genNoise(rng, 0.11, 'lowpass', 1100, 240, 1.0, 0.34),
      ]);
    case 'boss_roar': {
      const base = mixBuffers([
        genOsc('sawtooth', 95, 48, 0.65, 0.36),
        genOsc('sawtooth', 142, 71, 0.60, 0.20),
        genNoise(rng, 0.70, 'bandpass', 480, 160, 1.4, 0.55, 0, 1.3),
      ]);
      for (let i = 0; i < base.length; i++) {
        const mod = 0.72 + 0.28 * Math.sin((2 * Math.PI * 24 * i) / SR);
        base[i] = Math.tanh(base[i] * mod * 1.4);
      }
      return base;
    }
    case 'boss_slam':
      return mixBuffers([
        genOsc('sine', 85, 26, 0.50, 0.56),
        genNoise(rng, 0.45, 'lowpass', 800, 120, 0.8, 0.52, 0, 1.5),
      ], 1.3);
    case 'boss_beam':
      return mixBuffers([
        genOsc('sawtooth', 220, 440, 0.40, 0.30),
        genNoise(rng, 0.40, 'bandpass', 1600, 900, 2.0, 0.38, 0, 1.4),
      ]);
    case 'sniper_lock':
      return mixBuffers([
        genOsc('sine', 1760, 1760, 0.055, 0.28, 0),
        genOsc('sine', 2349, 2349, 0.07, 0.30, 0.075),
      ]);
    case 'dash':
      return mixBuffers([
        genNoise(rng, 0.16, 'bandpass', 1200, 380, 1.3, 0.42, 0, 1.6),
        genOsc('sine', 260, 110, 0.12, 0.24),
      ]);
    case 'melee_slash':
      return mixBuffers([
        genNoise(rng, 0.13, 'bandpass', 1600, 450, 1.6, 0.44, 0, 1.8),
        genOsc('triangle', 380, 140, 0.10, 0.22),
      ]);
    case 'ui_click':
      return genOsc('triangle', 720, 960, 0.05, 0.35);
    case 'ui_deny':
      return mixBuffers([
        genOsc('square', 210, 145, 0.12, 0.28),
        genOsc('square', 155, 110, 0.12, 0.20, 0.05),
      ]);
    case 'revive_tick':
      return genOsc('sine', 660, 880, 0.09, 0.32);
    case 'revive_done':
      return genArp([523.25, 659.25, 783.99, 1046.5], 0.06, 0.18, 'triangle', 0.32);
    case 'ping_coop':
      return mixBuffers([
        genOsc('sine', 1046, 1568, 0.12, 0.30, 0),
        genOsc('sine', 1568, 1568, 0.14, 0.24, 0.09),
      ]);
    case 'pickup_coin':
      return mixBuffers([
        genOsc('sine', 988, 988, 0.06, 0.30, 0),
        genOsc('sine', 1319, 1319, 0.14, 0.30, 0.05),
      ]);
    case 'perk_pick':
      return genArp([523.25, 783.99, 1046.5, 1567.98], 0.06, 0.16, 'triangle', 0.32);
    case 'pickup_orb':
      return genOsc('sine', 780, 1240, 0.065, 0.32);
    case 'pickup_hp':
      return genArp([587.33, 880, 1174.66], 0.05, 0.12, 'sine', 0.30);
    case 'pickup_weapon':
      return genArp([440, 554.37, 659.25, 880], 0.05, 0.13, 'triangle', 0.32);
    case 'heal_pulse':
      return mixBuffers([
        genOsc('sine', 523, 784, 0.22, 0.28, 0),
        genOsc('triangle', 1046, 1318, 0.20, 0.18, 0.05),
      ]);
    case 'bomb_throw':
      return mixBuffers([
        genNoise(rng, 0.14, 'bandpass', 500, 1300, 1.4, 0.34, 0, 1.6),
        genOsc('sine', 220, 420, 0.11, 0.22),
      ]);
    case 'bomb_bounce':
      return mixBuffers([
        genOsc('triangle', 380, 190, 0.055, 0.34),
        genNoise(rng, 0.03, 'highpass', 1800, 1200, 1.2, 0.18),
      ]);
    case 'turret_deploy':
      return mixBuffers([
        genArp([330, 440, 660], 0.05, 0.09, 'square', 0.24),
        genNoise(rng, 0.07, 'lowpass', 900, 400, 1.0, 0.28),
      ]);
    case 'turret_shot':
      return mixBuffers([
        genNoise(rng, 0.048, 'bandpass', 2400, 900, 1.2, 0.36, 0, 1.9),
        genOsc('square', 360, 140, 0.045, 0.22),
      ]);
    case 'mob_spawn':
      return mixBuffers([
        genOsc('sine', 320, 960, 0.16, 0.24),
        genNoise(rng, 0.16, 'bandpass', 900, 2200, 1.6, 0.28),
      ]);
    case 'wave_start':
      return mixBuffers([
        genOsc('sawtooth', 196, 294, 0.35, 0.26, 0),
        genOsc('triangle', 392, 587, 0.40, 0.28, 0.10),
      ]);
    case 'wave_clear':
      return genArp([523.25, 659.25, 783.99, 1046.5], 0.08, 0.22, 'triangle', 0.32);
    case 'match_win':
      return genArp([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.10, 0.28, 'triangle', 0.34);
    case 'match_lose':
      return genArp([392, 349.23, 311.13, 261.63], 0.14, 0.32, 'triangle', 0.32);
    default:
      return mixBuffers([
        genOsc('triangle', 440, 220, 0.12, 0.30),
        genNoise(rng, 0.10, 'bandpass', 1200, 600, 1.2, 0.24),
      ]);
  }
}

/** Synthesize seamless 4-bar stereo 44.1 kHz BGM loop per role/biome. */
function renderSynthBgm(role, biome, seed) {
  const rng = mulberry32(seed);
  const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let bpm = 128;
  let roots = [45, 48, 50, 52]; // A minor / Dorian
  let scale = [0, 3, 5, 7, 10, 12, 15];
  let drive = 1.05;
  if (role === 'bgm_menu') {
    bpm = 112;
    roots = [48, 43, 45, 41]; // C - G - Am - F
    scale = [0, 4, 7, 11, 12, 16];
  } else if (role === 'bgm_boss') {
    bpm = 144;
    roots = [40, 41, 43, 46]; // Phrygian E - F - G - Bb
    scale = [0, 1, 4, 7, 8, 12, 13];
    drive = 1.2;
  } else if (role === 'bgm_victory') {
    bpm = 124;
    roots = [48, 53, 55, 48];
    scale = [0, 4, 7, 9, 12, 16];
  } else if (role === 'bgm_defeat') {
    bpm = 96;
    roots = [45, 41, 43, 40];
    scale = [0, 3, 7, 10, 12];
  } else if (biome === 'crypt') {
    bpm = 132;
    roots = [43, 46, 48, 42];
    scale = [0, 3, 6, 7, 10, 12];
  } else if (biome === 'cyber') {
    bpm = 138;
    roots = [47, 50, 52, 54];
    scale = [0, 3, 5, 7, 10, 12, 14];
  } else {
    // desert
    bpm = 128;
    roots = [45, 46, 48, 46]; // harmonic / Phrygian desert groove
    scale = [0, 1, 4, 5, 7, 8, 12];
  }

  const steps = 64; // 4 bars * 16 sixteenth notes
  const stepSec = 60 / bpm / 4;
  const totalSamples = Math.round(steps * stepSec * SR);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  const addStereoNote = (startStep, durSteps, wave, freq, amp, pan) => {
    const startIdx = Math.round(startStep * stepSec * SR);
    const len = Math.max(16, Math.round(durSteps * stepSec * SR));
    const gL = amp * Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = amp * Math.sin(((pan + 1) * Math.PI) / 4);
    const att = Math.min(len >> 2, Math.round(0.006 * SR));
    const rel = Math.min(len >> 1, Math.round(0.03 * SR));
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const idx = (startIdx + i) % totalSamples;
      phase += freq / SR;
      let env = 1;
      if (i < att) env = i / att;
      else if (i > len - rel) env = (len - i) / rel;
      const val = oscSample(wave, phase) * env;
      left[idx] += val * gL;
      right[idx] += val * gR;
    }
  };

  for (let s = 0; s < steps; s++) {
    const bar = Math.floor(s / 16);
    const root = roots[bar % roots.length];
    const stepInBar = s % 16;

    // Driving bassline
    if (role === 'bgm_boss' || stepInBar % 2 === 0) {
      const oct = stepInBar % 4 === 2 ? 12 : 0;
      addStereoNote(s, 1.4, 'sawtooth', midiToHz(root + oct), 0.18, -0.15);
    }

    // Chiptune arpeggio
    const arpInterval = scale[(s + bar * 2) % scale.length];
    addStereoNote(s, 0.9, 'triangle', midiToHz(root + 12 + arpInterval), 0.11, stepInBar % 2 === 0 ? -0.35 : 0.35);

    // Lead melody on accented steps
    if (stepInBar === 0 || stepInBar === 3 || stepInBar === 6 || stepInBar === 10 || stepInBar === 12) {
      const leadDegree = scale[(bar + Math.floor(stepInBar / 3)) % scale.length];
      addStereoNote(s, 2.2, role === 'bgm_menu' ? 'sine' : 'square', midiToHz(root + 24 + leadDegree), 0.10, 0.2);
    }

    // Kick on quarter beats
    if (stepInBar % 4 === 0 && role !== 'bgm_defeat') {
      const kStart = Math.round(s * stepSec * SR);
      const kLen = Math.round(0.09 * SR);
      let kp = 0;
      for (let i = 0; i < kLen; i++) {
        const idx = (kStart + i) % totalSamples;
        const u = i / kLen;
        kp += (115 * Math.pow(38 / 115, u)) / SR;
        const v = Math.sin(kp * Math.PI * 2) * Math.pow(1 - u, 2.4) * 0.30;
        left[idx] += v;
        right[idx] += v;
      }
    }

    // Crisp hi-hat on off-beats
    if (stepInBar % 2 === 1 && role !== 'bgm_menu') {
      const hStart = Math.round(s * stepSec * SR);
      const hLen = Math.round(0.03 * SR);
      for (let i = 0; i < hLen; i++) {
        const idx = (hStart + i) % totalSamples;
        const n = (rng() * 2 - 1) * Math.pow(1 - i / hLen, 2.5) * 0.08;
        left[idx] += n * 0.8;
        right[idx] += n * 1.1;
      }
    }
  }

  for (let i = 0; i < totalSamples; i++) {
    left[i] = Math.tanh(left[i] * drive);
    right[i] = Math.tanh(right[i] * drive);
  }
  return [left, right];
}

// ---------------------------------------------------------------------------
// Pipeline Helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  return {
    offline: argv.includes('--offline'),
    force: argv.includes('--force'),
    check: argv.includes('--check'),
  };
}

async function detectFfmpeg() {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function fileExists(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function inferSfxDefaults(item) {
  const id = item.id;
  let category = item.category || 'fx';
  if (!item.category) {
    if (id.startsWith('ui_')) category = 'ui';
    else if (id.startsWith('pickup_')) category = 'pickup';
    else if (id.startsWith('boss_')) category = 'boss';
    else if (id.startsWith('mob_')) category = 'mob';
    else if (id.startsWith('dash_')) category = 'player';
    else if (id.startsWith('stinger_')) category = 'ui';
  }
  const pitchJitter = item.pitchJitter ?? (
    category === 'ui' || id.startsWith('stinger_') ? 0 : 0.06
  );
  const maxVoices = item.maxVoices ?? (
    id.startsWith('stinger_') || id.startsWith('boss_roar') ? 1 : 3
  );
  const priority = item.priority ?? (
    id.startsWith('expl_') || id.startsWith('boss_') || id.startsWith('stinger_') || id.startsWith('ui_') ? 3 : 2
  );
  const spatial = item.spatial ?? !(category === 'ui' || id.startsWith('stinger_'));
  return { category, pitchJitter, maxVoices, priority, spatial };
}

async function transcodeWithFfmpeg(srcPath, dstWavPath, isBgm) {
  const args = [
    '-y',
    '-i', srcPath,
    '-ar', String(SR),
    '-ac', isBgm ? '2' : '1',
    '-sample_fmt', 's16',
    dstWavPath,
  ];
  await execFileAsync('ffmpeg', args, { timeout: 20000 });
  return fs.readFile(dstWavPath);
}

async function processAudioEntry(item, isBgm, opts) {
  const { offline, force, hasFfmpeg } = opts;
  const relPrimary = item.dest;
  const absPrimary = path.join(DB_ROOT, relPrimary);
  const parsedDest = path.posix.parse(relPrimary);
  const relWav = `${parsedDest.dir}/${parsedDest.name}.wav`;
  const absWav = path.join(DB_ROOT, relWav);
  const isNativeWav = parsedDest.ext.toLowerCase() === '.wav';

  let primaryBuf = null;
  let primaryFmt = null;
  let fetchedFromOss = false;

  // 1) Try cache or live download when not offline
  if (!offline) {
    if (!force && (await fileExists(absPrimary))) {
      const cached = await fs.readFile(absPrimary);
      const fmt = detectMagicFormat(cached);
      if (fmt === 'wav' || fmt === 'ogg' || fmt === 'mp3') {
        primaryBuf = cached;
        primaryFmt = fmt;
        fetchedFromOss = true;
      }
    }
    if (!primaryBuf) {
      try {
        const res = await fetchBuffer(item.url, {
          timeoutMs: 25000,
          retries: 2,
          expect: ['wav', 'ogg', 'mp3'],
        });
        primaryBuf = res.buffer;
        primaryFmt = res.format;
        fetchedFromOss = true;
      } catch (err) {
        console.warn(`[w09] Fetch failed for ${item.id} (${item.url}): ${err.message} -> using pure-Node WAV synth`);
      }
    }
  }

  // 2) Produce normalized -1.0 dBFS WAV (real decoded/transcoded OSS or pure-Node synth fallback)
  let wavResult = null;
  let usedFfmpegTranscode = false;
  const maxDurationMs = !isBgm && item.id.startsWith('ui_') ? 1200 : (!isBgm && item.id.startsWith('boss_') ? 4000 : null);

  if (fetchedFromOss && primaryFmt === 'wav') {
    try {
      wavResult = normalizeWav(primaryBuf, {
        targetSampleRate: SR,
        mono: !isBgm,
        isBgm,
        removeDc: true,
        trimSilence: !isBgm,
        maxDurationMs,
        targetRmsDb: isBgm ? WAV_CONSTANTS.BGM_TARGET_RMS_DB : WAV_CONSTANTS.SFX_TARGET_RMS_DB,
        peakCeilingDb: WAV_CONSTANTS.PEAK_CEILING_DB,
      });
      primaryBuf = wavResult.wavBuffer;
    } catch (err) {
      console.warn(`[w09] WAV decode failed for ${item.id}: ${err.message} -> synthesizing PCM fallback`);
      fetchedFromOss = false;
      primaryBuf = null;
    }
  } else if (fetchedFromOss && primaryBuf) {
    await fs.mkdir(path.dirname(absPrimary), { recursive: true });
    await fs.writeFile(absPrimary, primaryBuf);

    if (hasFfmpeg) {
      try {
        const transcoded = await transcodeWithFfmpeg(absPrimary, absWav, isBgm);
        wavResult = normalizeWav(transcoded, {
          targetSampleRate: SR,
          mono: !isBgm,
          isBgm,
          removeDc: true,
          trimSilence: !isBgm,
          maxDurationMs,
          targetRmsDb: isBgm ? WAV_CONSTANTS.BGM_TARGET_RMS_DB : WAV_CONSTANTS.SFX_TARGET_RMS_DB,
          peakCeilingDb: WAV_CONSTANTS.PEAK_CEILING_DB,
        });
        usedFfmpegTranscode = true;
      } catch {
        wavResult = null;
      }
    }
  }

  if (!wavResult) {
    const seed = hashStringSeed(item.id);
    const synthPcm = isBgm
      ? renderSynthBgm(item.role || 'bgm_combat', item.biome || 'desert', seed)
      : [renderSynthSfx(item.synthFallback || item.id, seed)];
    wavResult = normalizeWav(
      {
        sampleRate: SR,
        channels: synthPcm,
      },
      {
        targetSampleRate: SR,
        mono: !isBgm,
        isBgm,
        removeDc: true,
        trimSilence: !isBgm,
        maxDurationMs,
        targetRmsDb: isBgm ? WAV_CONSTANTS.BGM_TARGET_RMS_DB : WAV_CONSTANTS.SFX_TARGET_RMS_DB,
        peakCeilingDb: WAV_CONSTANTS.PEAK_CEILING_DB,
      },
    );
  }

  // Write normalized WAV fallback (or primary if WAV)
  await fs.mkdir(path.dirname(absWav), { recursive: true });
  await fs.writeFile(absWav, wavResult.wavBuffer);

  // If offline/fetch failed on a non-WAV target, point primary path to the WAV fallback
  const effectivePrimaryRel = fetchedFromOss ? relPrimary : relWav;
  const effectivePrimaryBuf = fetchedFromOss ? primaryBuf : wavResult.wavBuffer;
  const effectiveFormat = fetchedFromOss ? primaryFmt : 'wav';

  // Ensure primary file exists on disk if it's WAV
  if (isNativeWav || !fetchedFromOss) {
    await fs.writeFile(absWav, wavResult.wavBuffer);
  }

  // Verify WAV integrity & peak ceiling invariant
  const verifiedWav = parseWav(wavResult.wavBuffer);
  const stats = measurePcmStats(verifiedWav.channels);
  if (stats.peakDb > WAV_CONSTANTS.PEAK_CEILING_DB + 0.05) {
    throw new Error(`Normalized WAV peakDb=${stats.peakDb} exceeds -1.0 dBFS ceiling for ${item.id}`);
  }

  // Measure actual duration of the primary file on disk (.ogg / .mp3 / .wav)
  let primaryDurationMs = wavResult.durationMs;
  if (fetchedFromOss && effectiveFormat === 'ogg') {
    primaryDurationMs = inspectOggInfo(effectivePrimaryBuf).durationMs ?? wavResult.durationMs;
  } else if (fetchedFromOss && effectiveFormat === 'mp3') {
    primaryDurationMs = inspectMp3Info(effectivePrimaryBuf).durationMs ?? wavResult.durationMs;
  }

  const files = { wav: relWav };
  if (fetchedFromOss && effectiveFormat === 'ogg') files.ogg = relPrimary;
  if (fetchedFromOss && effectiveFormat === 'mp3') files.mp3 = relPrimary;

  const wavSha = sha256Hex(wavResult.wavBuffer);
  const usedSynthForWav = !fetchedFromOss || (effectiveFormat !== 'wav' && !usedFfmpegTranscode);
  const wavFallback =
    relWav !== effectivePrimaryRel
      ? {
          path: relWav,
          origin: usedSynthForWav ? 'synth_wav' : 'ffmpeg_transcode',
          sourceId: usedSynthForWav ? 'generated_synth' : item.sourceId,
          license: usedSynthForWav ? 'GENERATED-SYNTH' : item.license,
          durationMs: wavResult.durationMs,
          peakDb: stats.peakDb,
          rmsDb: stats.rmsDb,
          sampleRate: verifiedWav.sampleRate,
          channels: verifiedWav.numChannels,
          bytes: wavResult.wavBuffer.length,
          sha256: wavSha,
        }
      : undefined;

  const baseEntry = {
    id: item.id,
    kind: isBgm ? 'bgm' : 'sfx',
    path: effectivePrimaryRel,
    fallbackPath: relWav,
    files,
    format: effectiveFormat,
    durationMs: primaryDurationMs,
    wavDurationMs: wavResult.durationMs,
    sampleRate: verifiedWav.sampleRate,
    channels: verifiedWav.numChannels,
    bitsPerSample: verifiedWav.bitsPerSample,
    peakDb: stats.peakDb,
    rmsDb: stats.rmsDb,
    softClipped: wavResult.softClipped,
    primaryBytes: effectivePrimaryBuf.length,
    wavBytes: wavResult.wavBuffer.length,
    gain: item.gain ?? (isBgm ? 0.36 : 0.7),
    loop: Boolean(isBgm || item.id === 'stun_loop'),
    synthFallback: item.synthFallback || item.id,
    sourceId: fetchedFromOss ? item.sourceId : 'generated_synth',
    license: fetchedFromOss ? item.license : 'GENERATED-SYNTH',
    source: fetchedFromOss ? 'oss' : 'synth_wav',
    url: item.url || null,
    sha256: sha256Hex(effectivePrimaryBuf),
    wavSha256: wavSha,
    ...(wavFallback ? { wavFallback } : {}),
  };

  if (isBgm) {
    return {
      ...baseEntry,
      category: 'bgm',
      role: item.role || 'bgm_combat',
      biome: item.biome || null,
      author: fetchedFromOss ? (item.author || 'CC0 Contributor') : 'Ban Sung Synth',
    };
  }

  const sfxDefaults = inferSfxDefaults(item);
  return {
    ...baseEntry,
    category: sfxDefaults.category,
    minGapMs: item.minGapMs ?? 60,
    pitchJitter: sfxDefaults.pitchJitter,
    maxVoices: sfxDefaults.maxVoices,
    priority: sfxDefaults.priority,
    spatial: sfxDefaults.spatial,
  };
}

async function runCheck() {
  const raw = await fs.readFile(META_PATH, 'utf8');
  const meta = JSON.parse(raw);
  let checked = 0;
  for (const entry of [...Object.values(meta.sfx || {}), ...Object.values(meta.bgm || {})]) {
    if (!ALLOWED_LICENSES.has(entry.license)) {
      throw new Error(`Disallowed license (${entry.license}) on ${entry.id}`);
    }
    if (entry.wavFallback && !ALLOWED_LICENSES.has(entry.wavFallback.license)) {
      throw new Error(`Disallowed wavFallback license (${entry.wavFallback.license}) on ${entry.id}`);
    }
    const isBgm = entry.kind === 'bgm';
    const absPrimary = path.join(DB_ROOT, entry.path);
    const absWav = path.join(DB_ROOT, entry.fallbackPath);
    const pBuf = await fs.readFile(absPrimary);
    const pFmt = detectMagicFormat(pBuf);
    if (!['wav', 'ogg', 'mp3'].includes(pFmt) || (entry.format && pFmt !== entry.format)) {
      throw new Error(`Invalid magic format (${pFmt}, expected ${entry.format}) for ${entry.path}`);
    }
    if (entry.sha256 && sha256Hex(pBuf) !== entry.sha256) {
      throw new Error(`SHA-256 mismatch on ${entry.path}`);
    }
    const wBuf = await fs.readFile(absWav);
    const parsed = parseWav(wBuf);
    const stats = measurePcmStats(parsed.channels);
    if (entry.wavSha256 && sha256Hex(wBuf) !== entry.wavSha256) {
      throw new Error(`WAV SHA-256 mismatch on ${entry.fallbackPath}`);
    }
    if (parsed.bitsPerSample !== 16 || parsed.sampleRate !== SR) {
      throw new Error(`Invalid WAV format for ${entry.fallbackPath}: ${parsed.sampleRate}Hz ${parsed.bitsPerSample}-bit`);
    }
    if (!isBgm && parsed.numChannels !== 1) {
      throw new Error(`SFX WAV must be mono (${parsed.numChannels}ch) for ${entry.fallbackPath}`);
    }
    if (stats.peakDb > WAV_CONSTANTS.PEAK_CEILING_DB + 0.05) {
      throw new Error(`WAV peakDb ${stats.peakDb} exceeds -1.0 dBFS for ${entry.fallbackPath}`);
    }
    const targetRms = isBgm ? WAV_CONSTANTS.BGM_TARGET_RMS_DB : WAV_CONSTANTS.SFX_TARGET_RMS_DB;
    const hitCeiling = stats.peakDb <= WAV_CONSTANTS.PEAK_CEILING_DB + 0.05 && stats.peakDb >= -3.6;
    const hitTargetRms = Math.abs(stats.rmsDb - targetRms) <= 1.6;
    if (!hitCeiling && !hitTargetRms) {
      throw new Error(`WAV RMS ${stats.rmsDb} / peak ${stats.peakDb} out of bounds for ${entry.fallbackPath}`);
    }
    checked++;
  }
  console.log(`[w09 --check] Verified ${checked} audio entries (magic bytes, SHA-256, license, channels, 44.1kHz 16-bit WAV, <= -1.0 dBFS peak).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    await runCheck();
    return;
  }

  const sourcesRaw = await fs.readFile(SOURCES_PATH, 'utf8');
  const sources = JSON.parse(sourcesRaw);

  const fxFromSources = (sources.audioSfx || []).filter((x) => String(x.dest).startsWith('audio/sfx/fx/'));
  const seenIds = new Set(fxFromSources.map((x) => x.id));
  const fxItems = [...fxFromSources];
  for (const extra of EXTRA_FX_ITEMS) {
    if (!seenIds.has(extra.id)) {
      seenIds.add(extra.id);
      fxItems.push(extra);
    }
  }

  const bgmFromSources = [...(sources.audioBgm || [])];
  const bgmItems = [
    ...bgmFromSources,
    {
      id: 'bgm_defeat',
      role: 'bgm_defeat',
      biome: null,
      sourceId: 'generated_synth',
      author: 'Ban Sung Synth',
      license: 'GENERATED-SYNTH',
      url: null,
      dest: 'audio/bgm/bgm_defeat.wav',
      format: 'wav',
      gain: 0.34,
      loop: true,
      synthFallback: 'bgm_defeat',
    },
  ];

  for (const item of [...fxItems, ...bgmItems]) {
    if (!ALLOWED_LICENSES.has(item.license)) {
      throw new Error(`Disallowed source license "${item.license}" on ${item.id}`);
    }
  }

  const hasFfmpeg = await detectFfmpeg();
  console.log(`[w09] Processing ${fxItems.length} FX + ${bgmItems.length} BGM (offline=${args.offline}, ffmpeg=${hasFfmpeg})...`);

  await fs.mkdir(FX_DIR, { recursive: true });
  await fs.mkdir(BGM_DIR, { recursive: true });

  const sfxResults = await runPool(fxItems, 6, (item) =>
    processAudioEntry(item, false, { offline: args.offline, force: args.force, hasFfmpeg }),
  );
  const bgmResults = await runPool(bgmItems, 4, (item) =>
    processAudioEntry(
      { ...item, offlineOnly: !item.url },
      true,
      { offline: args.offline || !item.url, force: args.force, hasFfmpeg },
    ),
  );

  const sfxMap = {};
  for (const r of sfxResults) sfxMap[r.id] = r;
  const bgmMap = {};
  for (const r of bgmResults) bgmMap[r.id] = r;

  const sfxOssFetched = sfxResults.filter((r) => r.source === 'oss').length;
  const bgmOssFetched = bgmResults.filter((r) => r.source === 'oss').length;

  const meta = {
    version: 1,
    generatedBy: 'w09',
    script: 'scripts/bansung/fetch-audio-fx.mjs',
    generatedAt: new Date().toISOString(),
    normStandard: {
      sfxTargetSampleRate: SR,
      sfxChannels: 1,
      sfxTargetRmsDb: WAV_CONSTANTS.SFX_TARGET_RMS_DB,
      bgmTargetSampleRate: SR,
      bgmChannels: 2,
      bgmTargetRmsDb: WAV_CONSTANTS.BGM_TARGET_RMS_DB,
      peakCeilingDb: WAV_CONSTANTS.PEAK_CEILING_DB,
      hasFfmpeg,
    },
    stats: {
      sfxTotal: sfxResults.length,
      sfxOssFetched,
      sfxSynthFallbackOnly: sfxResults.length - sfxOssFetched,
      bgmTotal: bgmResults.length,
      bgmOssFetched,
      bgmSynthFallbackOnly: bgmResults.length - bgmOssFetched,
    },
    canonicalGroups: {
      explode_he: ['expl_grenade_1', 'expl_grenade_2', 'expl_bomb_1', 'expl_bomb_2', 'expl_heavy_wav', 'expl_chunky'],
      explode_mini: ['expl_scifi', 'expl_retro', 'expl_grenade_2'],
      explosion_lg: ['expl_heavy_wav', 'expl_bomb_2', 'expl_chunky', 'expl_grenade_1'],
      explosion_sm: ['expl_scifi', 'expl_retro', 'expl_grenade_2'],
      stun_flash: ['stun_bang_1', 'stun_bang_2', 'stun_emp_zap', 'stun_elec_arc'],
      hit_flesh: ['hit_flesh_1', 'hit_flesh_2', 'hit_arcade'],
      hit_armor: ['hit_armor', 'hit_plate'],
      hit_crit: ['crit_hit'],
      shield_break: ['shield_break'],
      boss_roar: ['boss_roar_deep', 'boss_roar_1', 'boss_roar_2', 'boss_roar_beast', 'boss_roar_retro'],
      boss_slam: ['boss_slam', 'boss_growl'],
      boss_beam: ['boss_beam'],
      boss_laser: ['boss_beam'],
      boss_emp: ['stun_emp_zap', 'stun_down'],
      dash: ['dash_whoosh', 'dash_swipe', 'dash_blink'],
      revive_tick: ['revive_tick'],
      revive_done: ['revive_done', 'ui_confirm'],
      pickup_coin: ['pickup_coin'],
      perk_pick: ['pickup_perk'],
      energy_orb: ['pickup_orb'],
      heal_orb: ['pickup_hp', 'heal_pulse'],
      enemy_die: ['mob_die'],
      wave_start: ['stinger_wave'],
      match_win: ['stinger_win'],
      win: ['stinger_win'],
      match_lose: ['stinger_lose'],
      lose: ['stinger_lose'],
      ping: ['ping_coop', 'ui_glitch'],
      ui_click: ['ui_click', 'ui_select', 'ui_back'],
      ui_deny: ['ui_deny'],
      bgm_menu: ['bgm_lobby', 'bgm_lobby_alt'],
      bgm_combat: ['bgm_desert', 'bgm_desert_chiptune', 'bgm_crypt', 'bgm_crypt_alt', 'bgm_cyber', 'bgm_cyber_nes'],
      bgm_boss: ['bgm_boss_chiptune', 'bgm_boss_epic', 'bgm_boss_rpg', 'bgm_boss_nes'],
      bgm_victory: ['bgm_victory'],
      bgm_defeat: ['bgm_defeat'],
    },
    miragineAudioRefs: (sources.miragineReuse?.audio || []).map((a) => ({
      id: a.id,
      url: `/database-miraginewar/${a.src}`,
      license: 'INTERNAL-MIRAGINE',
    })),
    sfx: sfxMap,
    bgm: bgmMap,
  };

  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  console.log(
    `[w09] Done! SFX=${sfxResults.length} (${sfxOssFetched} OSS + WAV fallbacks), ` +
    `BGM=${bgmResults.length} (${bgmOssFetched} OSS + WAV fallbacks) -> ${path.relative(REPO_ROOT, META_PATH)}`,
  );
}

main().catch((err) => {
  console.error('[w09] Fatal error:', err);
  process.exitCode = 1;
});
