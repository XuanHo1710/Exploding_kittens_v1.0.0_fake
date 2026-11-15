#!/usr/bin/env node
/**
 * Zero-dependency Node 22 ESM fetcher & -1.0 dBFS WAV normalizer for weapon SFX (slice w08).
 *
 * Reads weapon SFX entries (`audio/sfx/weapons/*`) from `database-ban-sung/sources.json`,
 * fetches verified CC0-1.0 / MIT OSS audio assets (supporting direct WAV/OGG/MP3 and
 * zip-slip-safe ZIP extraction), normalizes PCM WAVs to 44.1 kHz mono 16-bit at
 * -1.0 dBFS peak ceiling / -16.0 dBFS target RMS, emits deterministic -1.0 dBFS WAV
 * fallbacks for compressed OGG/MP3 entries (or unreachable URLs), and writes
 * `database-ban-sung/audio/sfx/weapons/meta-guns.json`.
 *
 * Usage:
 *   node scripts/bansung/fetch-audio-guns.mjs           # fetch & normalize (reuse valid cache if unchanged)
 *   node scripts/bansung/fetch-audio-guns.mjs --force   # re-fetch & rebuild all files
 *   node scripts/bansung/fetch-audio-guns.mjs --offline # skip network, emit pure-Node -1 dBFS WAV fallbacks
 *   node scripts/bansung/fetch-audio-guns.mjs --check   # verify all files + meta-guns.json without downloading
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  WAV_CONSTANTS,
  assertMagicFormat,
  detectMagicFormat,
  downmixToMono,
  extractZipSafe,
  fetchBuffer,
  inspectMp3Info,
  inspectOggInfo,
  mulberry32,
  normalizeWav,
  parseWav,
  removeDcOffset,
  sha256Hex,
  trimWavSilence,
} from './lib-pack.mjs';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DB_ROOT = path.join(REPO_ROOT, 'database-ban-sung');
const SOURCES_PATH = path.join(DB_ROOT, 'sources.json');
const WEAPONS_DIR = path.join(DB_ROOT, 'audio', 'sfx', 'weapons');
const META_PATH = path.join(WEAPONS_DIR, 'meta-guns.json');

const ALLOWED_LICENSES = new Set(['CC0-1.0', 'MIT', 'GENERATED-SYNTH']);
const TARGET_SAMPLE_RATE = WAV_CONSTANTS.DEFAULT_SAMPLE_RATE;

// ---------------------------------------------------------------------------
// Utility & Pure-Node OGG/MP3 Duration Inspection
// ---------------------------------------------------------------------------

function hashStringSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isDurationSane(entry, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
  // Reject over-trimmed gunshot transients (except intentionally short dryfire click)
  if (durationMs < 80 && entry.id !== 'sfx_wpn_dryfire') return false;
  // Reject untrimmed multi-second preview recordings (e.g. 14s/41s freesound casing sheets)
  if (entry.capMs && durationMs > Math.max(5000, entry.capMs * 6)) return false;
  return true;
}

let cachedFfmpegAvailable = null;
async function hasFfmpeg() {
  if (cachedFfmpegAvailable !== null) return cachedFfmpegAvailable;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 });
    cachedFfmpegAvailable = true;
  } catch {
    cachedFfmpegAvailable = false;
  }
  return cachedFfmpegAvailable;
}

// ---------------------------------------------------------------------------
// Deterministic Pure-Node Weapon WAV Synthesizer (d16 §5 Recipes)
// ---------------------------------------------------------------------------

function addOscSweep(out, sr, type, f0, f1, durSec, gain, delaySec = 0, attackSec = 0.004) {
  const startIdx = Math.max(0, Math.round(delaySec * sr));
  const len = Math.max(1, Math.round(durSec * sr));
  const atkLen = Math.max(1, Math.round(attackSec * sr));
  let phase = 0;

  for (let i = 0; i < len && startIdx + i < out.length; i++) {
    const t = i / len;
    const freq = f0 * Math.pow(Math.max(20, f1) / Math.max(20, f0), t);
    phase = (phase + freq / sr) % 1;

    let wave = 0;
    if (type === 'sine') {
      wave = Math.sin(phase * Math.PI * 2);
    } else if (type === 'triangle') {
      wave = 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
    } else if (type === 'sawtooth') {
      wave = 2 * phase - 1;
    } else if (type === 'square') {
      wave = phase < 0.5 ? 1 : -1;
    }

    const atkEnv = i < atkLen ? i / atkLen : 1;
    const decEnv = Math.pow(Math.max(0.0001, 1 - t), 1.6);
    out[startIdx + i] += wave * gain * atkEnv * decEnv;
  }
}

function addFilteredNoise(out, sr, filterType, f0, f1, q, durSec, gain, rng, delaySec = 0, pow = 1.8) {
  const startIdx = Math.max(0, Math.round(delaySec * sr));
  const len = Math.max(1, Math.round(durSec * sr));
  const atkLen = Math.max(1, Math.round(0.002 * sr));

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;

  const updateCoeffs = (cutoff) => {
    const fc = Math.max(40, Math.min(sr * 0.45, cutoff));
    const w0 = (2 * Math.PI * fc) / sr;
    const cosW = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.25, q));
    const a0 = 1 + alpha;

    if (filterType === 'lowpass') {
      b0 = ((1 - cosW) / 2) / a0;
      b1 = (1 - cosW) / a0;
      b2 = b0;
    } else if (filterType === 'highpass') {
      b0 = ((1 + cosW) / 2) / a0;
      b1 = -(1 + cosW) / a0;
      b2 = b0;
    } else {
      // bandpass (constant skirt gain)
      b0 = alpha / a0;
      b1 = 0;
      b2 = -alpha / a0;
    }
    a1 = (-2 * cosW) / a0;
    a2 = (1 - alpha) / a0;
  };

  for (let i = 0; i < len && startIdx + i < out.length; i++) {
    const t = i / len;
    if ((i & 7) === 0) {
      const freq = f0 * Math.pow(Math.max(40, f1) / Math.max(40, f0), t);
      updateCoeffs(freq);
    }
    const x0 = (rng() * 2 - 1) * Math.pow(Math.max(0, 1 - t), pow);
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;

    const atkEnv = i < atkLen ? i / atkLen : 1;
    out[startIdx + i] += Math.max(-1.5, Math.min(1.5, y0)) * gain * atkEnv;
  }
}

function synthesizeWeaponWav(entry) {
  const sr = TARGET_SAMPLE_RATE;
  const seed = hashStringSeed(entry.id);
  const rng = mulberry32(seed);
  const pitchVar = 0.94 + rng() * 0.12;
  const maxDurSec = Math.min(0.95, Math.max(0.08, (entry.capMs ?? 350) / 1000));
  const kind = entry.synthFallback || 'gun_pistol';

  let durSec = 0.18;
  const buf = new Float32Array(Math.ceil(sr * Math.max(maxDurSec, 0.55)));

  switch (kind) {
    case 'gun_pistol': {
      durSec = Math.min(maxDurSec, 0.19);
      addFilteredNoise(buf, sr, 'bandpass', 1800 * pitchVar, 550 * pitchVar, 1.2, 0.12, 0.55, rng, 0, 1.9);
      addOscSweep(buf, sr, 'triangle', 270 * pitchVar, 68 * pitchVar, 0.09, 0.48, 0, 0.002);
      addFilteredNoise(buf, sr, 'highpass', 2400, 1200, 0.9, 0.03, 0.35, rng, 0, 2.5);
      break;
    }
    case 'gun_shotgun': {
      durSec = Math.min(maxDurSec, 0.32);
      addFilteredNoise(buf, sr, 'lowpass', 2500 * pitchVar, 260, 0.7, 0.28, 0.65, rng, 0, 1.5);
      addOscSweep(buf, sr, 'sine', 155 * pitchVar, 40, 0.22, 0.55, 0, 0.002);
      addFilteredNoise(buf, sr, 'bandpass', 1400, 420, 1.0, 0.14, 0.35, rng, 0.015, 2.0);
      break;
    }
    case 'gun_rifle': {
      durSec = Math.min(maxDurSec, 0.16);
      addFilteredNoise(buf, sr, 'bandpass', 2250 * pitchVar, 680 * pitchVar, 1.0, 0.12, 0.58, rng, 0, 2.0);
      addOscSweep(buf, sr, 'sawtooth', 230 * pitchVar, 62 * pitchVar, 0.085, 0.38, 0, 0.002);
      break;
    }
    case 'gun_smg': {
      durSec = Math.min(maxDurSec, 0.10);
      addFilteredNoise(buf, sr, 'highpass', 1400 * pitchVar, 2600 * pitchVar, 0.85, 0.07, 0.52, rng, 0, 2.2);
      addOscSweep(buf, sr, 'square', 330 * pitchVar, 110 * pitchVar, 0.055, 0.28, 0, 0.002);
      break;
    }
    case 'gun_plasma': {
      durSec = Math.min(maxDurSec, 0.18);
      addOscSweep(buf, sr, 'sawtooth', 920 * pitchVar, 190 * pitchVar, 0.15, 0.42, 0, 0.003);
      addOscSweep(buf, sr, 'sine', 1360 * pitchVar, 310 * pitchVar, 0.13, 0.30, 0.005, 0.003);
      addFilteredNoise(buf, sr, 'bandpass', 2600, 900, 2.2, 0.08, 0.18, rng, 0, 2.0);
      break;
    }
    case 'gun_railgun': {
      durSec = Math.min(maxDurSec, 0.34);
      addOscSweep(buf, sr, 'sawtooth', 1650 * pitchVar, 82, 0.28, 0.45, 0, 0.002);
      addFilteredNoise(buf, sr, 'highpass', 2200, 580, 0.9, 0.26, 0.48, rng, 0.004, 1.7);
      addOscSweep(buf, sr, 'sine', 240, 48, 0.24, 0.34, 0, 0.002);
      break;
    }
    case 'magic_lightning': {
      durSec = Math.min(maxDurSec, 0.22);
      addFilteredNoise(buf, sr, 'bandpass', 3200 * pitchVar, 920, 2.5, 0.18, 0.55, rng, 0, 1.8);
      addOscSweep(buf, sr, 'square', 660 * pitchVar, 200, 0.14, 0.28, 0, 0.002);
      addFilteredNoise(buf, sr, 'highpass', 3800, 1800, 1.5, 0.09, 0.30, rng, 0.04, 2.1);
      break;
    }
    case 'reload_start': {
      durSec = Math.min(maxDurSec, 0.16);
      addFilteredNoise(buf, sr, 'highpass', 2200 * pitchVar, 3200, 1.1, 0.055, 0.45, rng, 0, 2.2);
      addOscSweep(buf, sr, 'triangle', 440 * pitchVar, 250, 0.05, 0.35, 0.01, 0.002);
      addOscSweep(buf, sr, 'square', 680 * pitchVar, 480, 0.04, 0.22, 0.07, 0.002);
      break;
    }
    case 'reload_active': {
      durSec = Math.min(maxDurSec, 0.22);
      addOscSweep(buf, sr, 'triangle', 1046, 1568, 0.09, 0.40, 0, 0.003);
      addOscSweep(buf, sr, 'sine', 1568, 2093, 0.12, 0.38, 0.05, 0.003);
      addFilteredNoise(buf, sr, 'highpass', 2600, 3400, 1.2, 0.045, 0.22, rng, 0, 2.4);
      break;
    }
    case 'reload_done': {
      durSec = Math.min(maxDurSec, 0.24);
      addOscSweep(buf, sr, 'square', 520 * pitchVar, 780 * pitchVar, 0.045, 0.32, 0, 0.002);
      addOscSweep(buf, sr, 'triangle', 920 * pitchVar, 1180 * pitchVar, 0.08, 0.38, 0.05, 0.002);
      addFilteredNoise(buf, sr, 'bandpass', 2400, 1400, 1.4, 0.07, 0.28, rng, 0.045, 2.0);
      break;
    }
    case 'dry_fire': {
      durSec = Math.min(maxDurSec, 0.08);
      addOscSweep(buf, sr, 'square', 920 * pitchVar, 340, 0.028, 0.35, 0, 0.001);
      addFilteredNoise(buf, sr, 'highpass', 3000, 2800, 1.0, 0.025, 0.35, rng, 0, 2.5);
      break;
    }
    case 'shell_casing':
    default: {
      durSec = Math.min(maxDurSec, 0.18);
      addOscSweep(buf, sr, 'sine', 3450 * pitchVar, 2950 * pitchVar, 0.048, 0.42, 0, 0.001);
      addOscSweep(buf, sr, 'sine', 4650 * pitchVar, 4150 * pitchVar, 0.036, 0.32, 0.028, 0.001);
      addOscSweep(buf, sr, 'sine', 3700 * pitchVar, 3200 * pitchVar, 0.035, 0.22, 0.085, 0.001);
      break;
    }
  }

  const trimmedSlice = buf.slice(0, Math.max(Math.round(0.05 * sr), Math.round(durSec * sr)));
  return normalizeWav({ sampleRate: sr, channels: [trimmedSlice] }, {
    targetSampleRate: TARGET_SAMPLE_RATE,
    mono: true,
    removeDc: true,
    trimSilence: true,
    firstTransientOnly: false,
    maxDurationMs: entry.capMs ?? 500,
    targetRmsDb: WAV_CONSTANTS.SFX_TARGET_RMS_DB,
    peakCeilingDb: WAV_CONSTANTS.PEAK_CEILING_DB,
  });
}

// ---------------------------------------------------------------------------
// Smart OSS WAV Slicing & -1.0 dBFS Normalization
// ---------------------------------------------------------------------------

/**
 * Some master-track WAVs (e.g. `S_3.wav` at 26s) start with quiet handling rustles
 * long before the actual transient. If the first trimmed cap window misses the true
 * loud transient (`trimCapPeak < rawPeak * 0.45`), isolate the peak transient window
 * before calling `normalizeWav`.
 */
function prepareWavChannelsForNorm(parsed, entry) {
  const capMs = entry.capMs ?? 500;
  let channels = [downmixToMono(parsed.channels)];
  channels = removeDcOffset(channels);

  const mono = channels[0];
  let rawPeak = 0;
  let peakIdx = 0;
  for (let i = 0; i < mono.length; i++) {
    const a = Math.abs(mono[i]);
    if (a > rawPeak) {
      rawPeak = a;
      peakIdx = i;
    }
  }

  const trimmed = trimWavSilence(channels, parsed.sampleRate);
  const capSamples = Math.round((capMs / 1000) * parsed.sampleRate);
  const checkEnd = Math.min(trimmed.channels[0].length, capSamples);
  let trimCapPeak = 0;
  for (let i = 0; i < checkEnd; i++) {
    const a = Math.abs(trimmed.channels[0][i]);
    if (a > trimCapPeak) trimCapPeak = a;
  }

  const isLongMaster = parsed.durationMs > Math.max(2500, capMs * 4);
  if (isLongMaster && rawPeak > 0.05 && trimCapPeak < rawPeak * 0.45) {
    const lookback = Math.round(0.25 * parsed.sampleRate);
    const onsetThresh = Math.max(0.0126, rawPeak * 0.06);
    let onset = Math.max(0, peakIdx - lookback);
    for (let i = peakIdx; i >= onset; i--) {
      if (Math.abs(mono[i]) >= onsetThresh) {
        onset = i;
      } else if (peakIdx - i > Math.round(0.02 * parsed.sampleRate)) {
        break;
      }
    }
    const preRoll = Math.round(0.005 * parsed.sampleRate);
    const start = Math.max(0, onset - preRoll);
    const end = Math.min(mono.length, start + capSamples + Math.round(0.05 * parsed.sampleRate));
    return {
      ...parsed,
      channels: [mono.slice(start, end)],
      samplesPerChannel: end - start,
    };
  }

  return {
    ...parsed,
    channels,
  };
}

function normalizeOssWav(wavBuffer, entry) {
  const parsed = parseWav(wavBuffer);
  const prepared = prepareWavChannelsForNorm(parsed, entry);
  const useFirstTransient =
    entry.firstTransientOnly === true || entry.id === 'sfx_wpn_revolver';

  let normed = normalizeWav(prepared, {
    targetSampleRate: TARGET_SAMPLE_RATE,
    mono: true,
    removeDc: true,
    trimSilence: true,
    firstTransientOnly: useFirstTransient,
    maxDurationMs: entry.capMs ?? null,
    targetRmsDb: WAV_CONSTANTS.SFX_TARGET_RMS_DB,
    peakCeilingDb: WAV_CONSTANTS.PEAK_CEILING_DB,
  });

  // Safety guard: if sliceFirstTransient clipped to < 95 ms (rare early transient dip), re-normalize with full cap window
  if (normed.durationMs < 95) {
    normed = normalizeWav(prepared, {
      targetSampleRate: TARGET_SAMPLE_RATE,
      mono: true,
      removeDc: true,
      trimSilence: true,
      firstTransientOnly: false,
      maxDurationMs: entry.capMs ?? null,
      targetRmsDb: WAV_CONSTANTS.SFX_TARGET_RMS_DB,
      peakCeilingDb: WAV_CONSTANTS.PEAK_CEILING_DB,
    });
  }

  return { parsed, normed };
}

// ---------------------------------------------------------------------------
// Weapon SFX Policy & Metadata Builders
// ---------------------------------------------------------------------------

function resolvePlaybackSpec(entry) {
  const id = entry.id;
  if (id.startsWith('sfx_wpn_pistol') || id === 'sfx_wpn_revolver' || id === 'sfx_wpn_western_gun') {
    return { pitchJitter: 0.06, maxVoices: 3 };
  }
  if (id.startsWith('sfx_wpn_shotgun')) {
    return { pitchJitter: 0.05, maxVoices: 2 };
  }
  if (id.startsWith('sfx_wpn_rifle')) {
    return { pitchJitter: 0.07, maxVoices: 4 };
  }
  if (id.startsWith('sfx_wpn_smg')) {
    return { pitchJitter: 0.09, maxVoices: 4 };
  }
  if (id === 'sfx_wpn_railgun') {
    return { pitchJitter: 0.03, maxVoices: 2 };
  }
  if (id.startsWith('sfx_wpn_laser') || id === 'sfx_wpn_plasma') {
    return { pitchJitter: 0.06, maxVoices: 3 };
  }
  if (id === 'sfx_wpn_dryfire') {
    return { pitchJitter: 0.04, maxVoices: 1 };
  }
  if (id === 'sfx_wpn_rack_rifle') {
    return { pitchJitter: 0.0, maxVoices: 2 };
  }
  if (id.startsWith('sfx_wpn_reload') || id === 'sfx_wpn_cock_shotgun' || id === 'sfx_wpn_mag_insert') {
    return { pitchJitter: 0.03, maxVoices: 2 };
  }
  if (id.startsWith('sfx_wpn_casing') || id === 'sfx_wpn_shell_eject') {
    return { pitchJitter: 0.12, maxVoices: 3 };
  }
  return { pitchJitter: 0.05, maxVoices: 3 };
}

const VARIATION_GROUPS = Object.freeze({
  sfx_wpn_pistol: [
    'audio/sfx/weapons/sfx_wpn_pistol.wav',
    'audio/sfx/weapons/sfx_wpn_pistol_v2.wav',
    'audio/sfx/weapons/sfx_wpn_pistol_v3.wav',
    'audio/sfx/weapons/sfx_wpn_pistol_arcade.wav',
  ],
  sfx_wpn_shotgun: [
    'audio/sfx/weapons/sfx_wpn_shotgun.wav',
    'audio/sfx/weapons/sfx_wpn_shotgun_v2.wav',
    'audio/sfx/weapons/sfx_wpn_shotgun_v3.wav',
  ],
  sfx_wpn_rifle: [
    'audio/sfx/weapons/sfx_wpn_rifle.wav',
    'audio/sfx/weapons/sfx_wpn_rifle_v2.wav',
    'audio/sfx/weapons/sfx_wpn_rifle_v3.wav',
  ],
  sfx_wpn_smg: [
    'audio/sfx/weapons/sfx_wpn_smg.wav',
    'audio/sfx/weapons/sfx_wpn_smg_v2.wav',
  ],
  sfx_wpn_laser: [
    'audio/sfx/weapons/sfx_wpn_laser.ogg',
    'audio/sfx/weapons/sfx_wpn_laser_v2.ogg',
    'audio/sfx/weapons/sfx_wpn_laser_retro.ogg',
  ],
  sfx_wpn_casing: [
    'audio/sfx/weapons/sfx_wpn_casing.mp3',
    'audio/sfx/weapons/sfx_wpn_casing_v2.mp3',
    'audio/sfx/weapons/sfx_wpn_casing_v3.mp3',
    'audio/sfx/weapons/sfx_wpn_casing_spin.mp3',
    'audio/sfx/weapons/sfx_wpn_casing_shotgun.mp3',
    'audio/sfx/weapons/sfx_wpn_shell_eject.wav',
  ],
});

const WEAPON_ALIAS_MAP = Object.freeze({
  // shared/src/bansung/weapons.ts keys
  sfx_pistol_fire: 'sfx_wpn_pistol',
  sfx_rifle_fire: 'sfx_wpn_rifle',
  sfx_smg_fire: 'sfx_wpn_smg',
  sfx_shotgun_fire: 'sfx_wpn_shotgun',
  sfx_shotgun_pump: 'sfx_wpn_cock_shotgun',
  sfx_reload_kinetic: 'sfx_wpn_reload',
  wpn_plasma_fire: 'sfx_wpn_plasma',
  wpn_rail_fire: 'sfx_wpn_railgun',
  wpn_rail_charge: 'sfx_wpn_laser_retro',
  wpn_lightning_cast: 'sfx_wpn_laser_arc',
  // d16 & d43 keys
  gun_pistol: 'sfx_wpn_pistol',
  shot_pistol: 'sfx_wpn_pistol',
  gun_rifle: 'sfx_wpn_rifle',
  shot_rifle: 'sfx_wpn_rifle',
  gun_smg: 'sfx_wpn_smg',
  shot_smg: 'sfx_wpn_smg',
  gun_shotgun: 'sfx_wpn_shotgun',
  shot_shotgun: 'sfx_wpn_shotgun',
  gun_plasma: 'sfx_wpn_laser',
  shot_laser: 'sfx_wpn_laser',
  gun_railgun: 'sfx_wpn_railgun',
  shot_sniper: 'sfx_wpn_railgun',
  magic_lightning: 'sfx_wpn_laser_arc',
  reload_start: 'sfx_wpn_mag_insert',
  reload_active: 'sfx_wpn_rack_rifle',
  reload_active_hit: 'sfx_wpn_rack_rifle',
  reload_done: 'sfx_wpn_reload',
  dry_fire: 'sfx_wpn_dryfire',
  empty_click: 'sfx_wpn_dryfire',
  shell_casing: 'sfx_wpn_casing',
  weapon_swap: 'sfx_wpn_cock_shotgun',
});

// ---------------------------------------------------------------------------
// Pipeline Execution
// ---------------------------------------------------------------------------

async function fetchEntryRawBuffer(entry, zipCache, tmpRoot) {
  const urlsToTry = [entry.url];
  if (entry.fallbackUrl) urlsToTry.push(entry.fallbackUrl);

  let lastErr = null;
  for (const url of urlsToTry) {
    try {
      if (entry.archiveEntry && url === entry.url) {
        let extractedDir = zipCache.get(url);
        if (!extractedDir) {
          const zipRes = await fetchBuffer(url, { timeoutMs: 60000, retries: 2, expect: 'zip' });
          extractedDir = path.join(tmpRoot, `zip_${zipCache.size}`);
          await extractZipSafe(zipRes.buffer, extractedDir);
          zipCache.set(url, extractedDir);
        }
        const entryPath = path.resolve(extractedDir, entry.archiveEntry);
        if (!entryPath.startsWith(path.resolve(extractedDir) + path.sep)) {
          throw new Error(`Archive entry path traversal blocked: ${entry.archiveEntry}`);
        }
        const buf = await fs.readFile(entryPath);
        const format = assertMagicFormat(buf, entry.format, `${entry.id} (${entry.archiveEntry})`);
        return { buffer: buf, format, fetchedUrl: `${url}#${entry.archiveEntry}` };
      }

      const res = await fetchBuffer(url, {
        timeoutMs: 60000,
        retries: 2,
        expect: entry.format,
      });
      return { buffer: res.buffer, format: res.format, fetchedUrl: res.url || url };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(`Failed to fetch ${entry.id}`);
}

async function runCheckMode(gunEntries) {
  let meta;
  try {
    meta = JSON.parse(await fs.readFile(META_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`Missing or invalid ${META_PATH}: ${err.message}`);
  }

  const errors = [];
  for (const entry of gunEntries) {
    const m = meta.entries?.[entry.id];
    if (!m) {
      errors.push(`Missing meta entry: ${entry.id}`);
      continue;
    }
    if (!ALLOWED_LICENSES.has(m.license)) {
      errors.push(`Disallowed license on meta entry ${entry.id}: ${m.license}`);
    }
    if (m.wavFallback && !ALLOWED_LICENSES.has(m.wavFallback.license)) {
      errors.push(`Disallowed fallback license on meta entry ${entry.id}: ${m.wavFallback.license}`);
    }
    if (!(typeof m.durationMs === 'number' && m.durationMs > 0) || !(typeof m.gain === 'number' && m.gain > 0)) {
      errors.push(`Missing/invalid durationMs or gain on meta entry ${entry.id}`);
    } else if (!isDurationSane(entry, m.durationMs)) {
      errors.push(`Out-of-bounds durationMs=${m.durationMs}ms on meta entry ${entry.id} (capMs=${entry.capMs ?? 'none'})`);
    }
    const primaryAbs = path.join(DB_ROOT, m.path);
    const wavAbs = path.join(DB_ROOT, m.fallbackPath);
    const targets = [['primary', primaryAbs, m.format]];
    if (wavAbs !== primaryAbs) {
      targets.push(['wavFallback', wavAbs, 'wav']);
    }
    for (const [label, abs, expectedFmt] of targets) {
      try {
        const buf = await fs.readFile(abs);
        if (buf.length === 0) {
          errors.push(`Empty ${label} file for ${entry.id}: ${abs}`);
          continue;
        }
        assertMagicFormat(buf, expectedFmt, `${entry.id}:${label}`);
        if (expectedFmt === 'wav') {
          const parsed = parseWav(buf);
          if (parsed.sampleRate !== TARGET_SAMPLE_RATE || parsed.numChannels !== 1 || parsed.bitsPerSample !== 16) {
            errors.push(`WAV spec mismatch for ${entry.id}: sr=${parsed.sampleRate} ch=${parsed.numChannels} bits=${parsed.bitsPerSample}`);
          }
          const ch0 = parsed.channels[0];
          let peak = 0;
          let sumSq = 0;
          for (let i = 0; i < ch0.length; i++) {
            const s = ch0[i];
            const a = Math.abs(s);
            if (a > peak) peak = a;
            sumSq += s * s;
          }
          const rms = ch0.length > 0 ? Math.sqrt(sumSq / ch0.length) : 0;
          const peakDb = peak > 1e-8 ? 20 * Math.log10(peak) : -120;
          const rmsDb = rms > 1e-8 ? 20 * Math.log10(rms) : -120;
          const hitCeiling = peakDb <= WAV_CONSTANTS.PEAK_CEILING_DB + 0.05 && peakDb >= -3.6;
          const hitTargetRms =
            peakDb <= WAV_CONSTANTS.PEAK_CEILING_DB + 0.05 &&
            peakDb >= -10.0 &&
            Math.abs(rmsDb - WAV_CONSTANTS.SFX_TARGET_RMS_DB) <= 0.35;
          if (!hitCeiling && !hitTargetRms) {
            errors.push(
              `WAV normalization out of bounds for ${entry.id} (${label}): peak=${peakDb.toFixed(2)} dBFS, rms=${rmsDb.toFixed(2)} dBFS`,
            );
          }
        }
      } catch (err) {
        errors.push(`Check failed for ${entry.id} (${label}): ${err.message}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`[w08] --check FAILED (${errors.length} errors):`);
    for (const e of errors) console.error(' -', e);
    process.exitCode = 1;
    return;
  }
  console.log(`[w08] --check PASSED: ${gunEntries.length} weapon SFX entries verified (-1 dBFS ceiling / -16 dBFS RMS WAV + OSS primary).`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const isOffline = args.has('--offline');
  const isForce = args.has('--force');
  const isCheck = args.has('--check');

  const sources = JSON.parse(await fs.readFile(SOURCES_PATH, 'utf8'));
  const gunEntries = (sources.audioSfx || []).filter(
    (e) => typeof e.dest === 'string' && e.dest.startsWith('audio/sfx/weapons/'),
  );
  if (gunEntries.length === 0) {
    throw new Error('No audio/sfx/weapons/ entries found in sources.json');
  }

  for (const e of gunEntries) {
    if (!ALLOWED_LICENSES.has(e.license)) {
      throw new Error(`Disallowed license ${e.license} on ${e.id}`);
    }
  }

  if (isCheck) {
    await runCheckMode(gunEntries);
    return;
  }

  await fs.mkdir(WEAPONS_DIR, { recursive: true });

  let prevMeta = null;
  if (!isForce && !isOffline) {
    try {
      prevMeta = JSON.parse(await fs.readFile(META_PATH, 'utf8'));
    } catch {
      prevMeta = null;
    }
  }

  const ffmpegReady = await hasFfmpeg();
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bansung-w08-'));
  const zipCache = new Map();

  const entriesMeta = {};
  let ossWavCount = 0;
  let ossCompressedCount = 0;
  let synthFallbackCount = 0;

  try {
    for (const entry of gunEntries) {
      const wavRelPath = `audio/sfx/weapons/${entry.id}.wav`;
      const wavAbsPath = path.join(DB_ROOT, wavRelPath);
      const primaryRelPath = entry.dest;
      const primaryAbsPath = path.join(DB_ROOT, primaryRelPath);
      const playback = resolvePlaybackSpec(entry);
      const variations = VARIATION_GROUPS[entry.id];

      // Fast reuse when valid files from a prior OSS run exist and --force/--offline is unset
      if (prevMeta?.entries?.[entry.id] && !isForce && !isOffline) {
        const cached = prevMeta.entries[entry.id];
        try {
          const pBuf = await fs.readFile(path.join(DB_ROOT, cached.path));
          const wBuf = await fs.readFile(path.join(DB_ROOT, cached.fallbackPath));
          if (
            sha256Hex(pBuf) === cached.sha256 &&
            sha256Hex(wBuf) === (cached.wavFallback?.sha256 ?? cached.sha256) &&
            isDurationSane(entry, cached.durationMs)
          ) {
            entriesMeta[entry.id] = cached;
            if (cached.origin === 'oss_fetch') {
              if (cached.format === 'wav') ossWavCount++;
              else ossCompressedCount++;
            } else {
              synthFallbackCount++;
            }
            continue;
          }
        } catch {
          // Cache miss; re-process
        }
      }

      let fetched = null;
      if (!isOffline) {
        try {
          fetched = await fetchEntryRawBuffer(entry, zipCache, tmpRoot);
        } catch (err) {
          console.warn(`[w08] WARN fetch failed for ${entry.id} (${err.message}); using deterministic -1 dBFS WAV fallback.`);
          fetched = null;
        }
      }

      if (fetched && fetched.format === 'wav') {
        const { normed } = normalizeOssWav(fetched.buffer, entry);
        await fs.writeFile(wavAbsPath, normed.wavBuffer);
        const wavSha = sha256Hex(normed.wavBuffer);
        ossWavCount++;

        entriesMeta[entry.id] = {
          id: entry.id,
          category: 'weapon',
          kind: 'sfx',
          path: wavRelPath,
          fallbackPath: wavRelPath,
          files: { wav: wavRelPath },
          format: 'wav',
          origin: 'oss_fetch',
          sourceId: entry.sourceId,
          source: fetched.fetchedUrl,
          license: entry.license,
          durationMs: normed.durationMs,
          gain: entry.gain,
          playbackGain: entry.gain,
          minGapMs: entry.minGapMs ?? 60,
          pitchJitter: playback.pitchJitter,
          maxVoices: playback.maxVoices,
          loop: false,
          peakDb: normed.peakDb,
          rmsDb: normed.rmsDb,
          sampleRate: normed.sampleRate,
          channels: normed.numChannels,
          bytes: normed.wavBuffer.length,
          sha256: wavSha,
          synthFallback: entry.synthFallback,
          ...(variations ? { variations } : {}),
        };
      } else if (fetched && (fetched.format === 'ogg' || fetched.format === 'mp3')) {
        const encodedInfo = fetched.format === 'ogg' ? inspectOggInfo(fetched.buffer) : inspectMp3Info(fetched.buffer);
        let wavNormed = null;
        if (ffmpegReady) {
          await fs.writeFile(primaryAbsPath, fetched.buffer);
          try {
            const tmpWav = path.join(tmpRoot, `${entry.id}_dec.wav`);
            await execFileAsync('ffmpeg', ['-y', '-i', primaryAbsPath, '-ar', String(TARGET_SAMPLE_RATE), '-ac', '1', tmpWav], { timeout: 15000 });
            const rawDecoded = await fs.readFile(tmpWav);
            wavNormed = normalizeOssWav(rawDecoded, entry).normed;
          } catch {
            wavNormed = null;
          }
        }

        // Without ffmpeg, reject grossly untrimmed multi-second compressed previews (e.g., 14s/41s casing sheets)
        if (!ffmpegReady && !isDurationSane(entry, encodedInfo.durationMs)) {
          await fs.rm(primaryAbsPath, { force: true });
          const synth = synthesizeWeaponWav(entry);
          await fs.writeFile(wavAbsPath, synth.wavBuffer);
          const wavSha = sha256Hex(synth.wavBuffer);
          synthFallbackCount++;

          entriesMeta[entry.id] = {
            id: entry.id,
            category: 'weapon',
            kind: 'sfx',
            path: wavRelPath,
            fallbackPath: wavRelPath,
            files: { wav: wavRelPath },
            format: 'wav',
            origin: 'synth_wav',
            sourceId: 'generated_synth',
            source: 'scripts/bansung/fetch-audio-guns.mjs#synthesizeWeaponWav',
            license: 'GENERATED-SYNTH',
            durationMs: synth.durationMs,
            gain: entry.gain,
            playbackGain: entry.gain,
            minGapMs: entry.minGapMs ?? 60,
            pitchJitter: playback.pitchJitter,
            maxVoices: playback.maxVoices,
            loop: false,
            peakDb: synth.peakDb,
            rmsDb: synth.rmsDb,
            sampleRate: synth.sampleRate,
            channels: synth.numChannels,
            bytes: synth.wavBuffer.length,
            sha256: wavSha,
            synthFallback: entry.synthFallback,
            ...(variations ? { variations } : {}),
          };
          continue;
        }

        // Save valid CC0 OGG/MP3 natively + emit deterministic -1.0 dBFS WAV fallback
        await fs.writeFile(primaryAbsPath, fetched.buffer);
        const primarySha = sha256Hex(fetched.buffer);
        if (!wavNormed) {
          wavNormed = synthesizeWeaponWav(entry);
        }

        await fs.writeFile(wavAbsPath, wavNormed.wavBuffer);
        const wavSha = sha256Hex(wavNormed.wavBuffer);
        const durationMs = encodedInfo.durationMs ?? wavNormed.durationMs;
        ossCompressedCount++;

        entriesMeta[entry.id] = {
          id: entry.id,
          category: 'weapon',
          kind: 'sfx',
          path: primaryRelPath,
          fallbackPath: wavRelPath,
          files: {
            [fetched.format]: primaryRelPath,
            wav: wavRelPath,
          },
          format: fetched.format,
          origin: 'oss_fetch',
          sourceId: entry.sourceId,
          source: fetched.fetchedUrl,
          license: entry.license,
          durationMs,
          gain: entry.gain,
          playbackGain: entry.gain,
          minGapMs: entry.minGapMs ?? 60,
          pitchJitter: playback.pitchJitter,
          maxVoices: playback.maxVoices,
          loop: false,
          peakDb: wavNormed.peakDb,
          rmsDb: wavNormed.rmsDb,
          sampleRate: encodedInfo.sampleRate,
          channels: encodedInfo.channels,
          bytes: fetched.buffer.length,
          sha256: primarySha,
          synthFallback: entry.synthFallback,
          wavFallback: {
            path: wavRelPath,
            origin: ffmpegReady ? 'oss_transcoded' : 'synth_wav',
            sourceId: ffmpegReady ? entry.sourceId : 'generated_synth',
            license: ffmpegReady ? entry.license : 'GENERATED-SYNTH',
            durationMs: wavNormed.durationMs,
            peakDb: wavNormed.peakDb,
            rmsDb: wavNormed.rmsDb,
            sampleRate: wavNormed.sampleRate,
            channels: wavNormed.numChannels,
            bytes: wavNormed.wavBuffer.length,
            sha256: wavSha,
          },
          ...(variations ? { variations } : {}),
        };
      } else {
        // Offline or unreachable fallback: emit deterministic -1.0 dBFS WAV directly
        if (primaryAbsPath !== wavAbsPath) {
          await fs.rm(primaryAbsPath, { force: true });
        }
        const synth = synthesizeWeaponWav(entry);
        await fs.writeFile(wavAbsPath, synth.wavBuffer);
        const wavSha = sha256Hex(synth.wavBuffer);
        synthFallbackCount++;

        entriesMeta[entry.id] = {
          id: entry.id,
          category: 'weapon',
          kind: 'sfx',
          path: wavRelPath,
          fallbackPath: wavRelPath,
          files: { wav: wavRelPath },
          format: 'wav',
          origin: 'synth_wav',
          sourceId: 'generated_synth',
          source: 'scripts/bansung/fetch-audio-guns.mjs#synthesizeWeaponWav',
          license: 'GENERATED-SYNTH',
          durationMs: synth.durationMs,
          gain: entry.gain,
          playbackGain: entry.gain,
          minGapMs: entry.minGapMs ?? 60,
          pitchJitter: playback.pitchJitter,
          maxVoices: playback.maxVoices,
          loop: false,
          peakDb: synth.peakDb,
          rmsDb: synth.rmsDb,
          sampleRate: synth.sampleRate,
          channels: synth.numChannels,
          bytes: synth.wavBuffer.length,
          sha256: wavSha,
          synthFallback: entry.synthFallback,
          ...(variations ? { variations } : {}),
        };
      }
    }
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }

  // Reconcile variation paths against actual written primary files (e.g., .mp3 -> .wav synth fallback)
  for (const m of Object.values(entriesMeta)) {
    if (Array.isArray(m.variations)) {
      m.variations = m.variations.map((vPath) => {
        const vid = path.posix.parse(vPath).name;
        return entriesMeta[vid]?.path || vPath;
      });
    }
  }

  const metaDoc = {
    version: 1,
    slice: 'w08',
    category: 'weapon',
    generatedAt: new Date().toISOString(),
    mode: isOffline ? 'offline' : 'fetch',
    ffmpegUsed: ffmpegReady,
    normalization: {
      sampleRate: TARGET_SAMPLE_RATE,
      channels: 1,
      bitsPerSample: 16,
      peakCeilingDb: WAV_CONSTANTS.PEAK_CEILING_DB,
      targetRmsDb: WAV_CONSTANTS.SFX_TARGET_RMS_DB,
    },
    counts: {
      totalEntries: Object.keys(entriesMeta).length,
      ossWav: ossWavCount,
      ossCompressedWithWavFallback: ossCompressedCount,
      synthFallbackOnly: synthFallbackCount,
    },
    aliases: WEAPON_ALIAS_MAP,
    entries: entriesMeta,
  };

  await fs.writeFile(META_PATH, JSON.stringify(metaDoc, null, 2) + '\n', 'utf8');
  console.log(
    `[w08] Done: ${metaDoc.counts.totalEntries} weapon SFX (${ossWavCount} OSS WAV normalized -1dBFS, ${ossCompressedCount} OSS OGG/MP3 + WAV fallback, ${synthFallbackCount} synth-only) -> ${path.relative(REPO_ROOT, META_PATH)}`,
  );

  // Immediately run self-check after build
  await runCheckMode(gunEntries);
}

main().catch((err) => {
  console.error('[w08] Fatal error:', err);
  process.exitCode = 1;
});
