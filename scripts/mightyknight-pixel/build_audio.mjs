#!/usr/bin/env node
/**
 * Mighty Knight 2.5D Pixel — Pure-Node 16-Bit Retro Chiptune/FM Audio Synthesizer.
 *
 * Generates deterministic 44.1 kHz 16-bit PCM WAV files normalized to -1.0 dBFS:
 * - 4 seamless loopable stereo BGM themes (lobby_theme, battle_grass, battle_volcano, boss_theme)
 * - 42 punchy mono combat, skill, parry, ultimate, boss & UI SFX clips
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const AUDIO_DIR = path.join(REPO_ROOT, 'database-mighty-knight-pixel', 'audio');
const SR = 44100;
const PEAK_CEIL = Math.pow(10, -1.0 / 20); // -1.0 dBFS (~0.891)

function writeWav(filePath, channels, sampleRate = SR) {
  const numCh = channels.length;
  const numSamples = channels[0].length;
  // Normalize peak cleanly
  let peak = 0;
  for (let c = 0; c < numCh; c++) {
    const arr = channels[c];
    for (let i = 0; i < numSamples; i++) {
      const a = Math.abs(arr[i]);
      if (a > peak) peak = a;
    }
  }
  const gain = peak > 1e-6 ? Math.min(PEAK_CEIL / peak, 1.0) : 1.0;

  const dataBytes = numSamples * numCh * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 4, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 4, 'ascii');
  buf.write('fmt ', 12, 4, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numCh, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numCh * 2, 28);
  buf.writeUInt16LE(numCh * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 4, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] * gain));
      buf.writeInt16LE(Math.round(s * 32767), off);
      off += 2;
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const square = (phase, duty = 0.5) => ((phase % 1) < duty ? 1 : -1);
const tri = (phase) => 1 - 4 * Math.abs((phase % 1) - 0.5);
const saw = (phase) => 2 * (phase % 1) - 1;
const lcg = (seed) => {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
};

function renderBgm(name, bpm, leadNotes, bassNotes, arpOffset, bright = 0.35) {
  const stepSec = 60 / bpm / 2; // eighth notes
  const totalSteps = leadNotes.length;
  const totalSamples = Math.floor(totalSteps * stepSec * SR);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);
  const rand = lcg(name.length * 9973);

  let leadPh = 0;
  let bassPh = 0;
  let arpPh = 0;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / SR;
    const stepIdx = Math.min(totalSteps - 1, Math.floor(t / stepSec));
    const localT = (t - stepIdx * stepSec) / stepSec;

    const lMidi = leadNotes[stepIdx];
    const bMidi = bassNotes[stepIdx % bassNotes.length];
    const aMidi = bMidi + arpOffset[Math.floor(localT * 3) % arpOffset.length];

    const lEnv = lMidi > 0 ? Math.min(1, localT * 24) * Math.exp(-localT * 2.2) : 0;
    const bEnv = Math.min(1, localT * 30) * Math.exp(-localT * 1.4);

    if (lMidi > 0) leadPh += midiFreq(lMidi) / SR;
    bassPh += midiFreq(bMidi) / SR;
    arpPh += midiFreq(aMidi) / SR;

    const leadSig = square(leadPh, 0.25) * 0.28 * lEnv;
    const bassSig = tri(bassPh) * 0.34 * bEnv;
    const arpSig = square(arpPh, 0.5) * 0.12 * bright;
    // Crisp retro kick/hi-hat on steps
    const drumEnv = Math.exp(-localT * 14);
    const drumSig = (stepIdx % 4 === 0 ? Math.sin(localT * 280 * Math.exp(-localT * 4)) * 0.24 : rand() * 0.08) * drumEnv;

    const fade = Math.min(1, i / 400, (totalSamples - 1 - i) / 400);
    left[i] = (leadSig * 0.9 + bassSig + arpSig * 1.1 + drumSig) * fade * 0.65;
    right[i] = (leadSig * 1.1 + bassSig + arpSig * 0.85 + drumSig) * fade * 0.65;
  }

  writeWav(path.join(AUDIO_DIR, 'bgm', `${name}.wav`), [left, right]);
}

function renderSfx(name, durSec, synthFn) {
  const n = Math.max(800, Math.floor(durSec * SR));
  const out = new Float32Array(n);
  const rand = lcg(name.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = i / n;
    const fade = Math.min(1, i / 40, (n - 1 - i) / 120);
    out[i] = synthFn(t, u, rand) * fade * 0.72;
  }
  writeWav(path.join(AUDIO_DIR, 'sfx', `${name}.wav`), [out]);
}

// 4 Seamless 16-bit BGM Themes
renderBgm(
  'lobby_theme',
  112,
  [64, 67, 71, 72, 71, 67, 64, 0, 62, 66, 69, 71, 69, 66, 64, 0],
  [40, 40, 47, 47, 45, 45, 43, 43],
  [12, 16, 19],
  0.28,
);
renderBgm(
  'battle_grass',
  142,
  [64, 64, 67, 71, 72, 71, 69, 67, 66, 69, 71, 74, 72, 71, 67, 64, 67, 71, 76, 74, 72, 71, 69, 67, 66, 67, 69, 71, 69, 67, 64, 0],
  [40, 47, 43, 47, 45, 52, 47, 50],
  [12, 15, 19],
  0.38,
);
renderBgm(
  'battle_volcano',
  152,
  [62, 65, 69, 68, 65, 62, 60, 62, 69, 70, 74, 73, 70, 69, 65, 64, 62, 69, 68, 69, 74, 73, 70, 69, 65, 64, 62, 60, 62, 0, 69, 0],
  [38, 38, 41, 43, 45, 44, 41, 40],
  [12, 15, 18],
  0.42,
);
renderBgm(
  'boss_theme',
  166,
  [64, 65, 67, 71, 70, 67, 65, 64, 76, 75, 76, 79, 76, 74, 71, 67, 64, 71, 70, 67, 65, 64, 62, 64, 76, 79, 81, 79, 76, 74, 71, 64],
  [40, 40, 41, 43, 40, 40, 46, 47],
  [12, 18, 19],
  0.5,
);

// 42 Crisp 16-Bit SFX Clips
const sfxDefs = [
  ['slash_knight', 0.16, (t, u, r) => (saw(t * (520 - u * 340)) * 0.4 + r() * 0.5) * Math.exp(-u * 6)],
  ['slash_archer', 0.14, (t, u, r) => (tri(t * (700 - u * 360)) * 0.5 + r() * 0.3) * Math.exp(-u * 7)],
  ['slash_rogue', 0.12, (t, u, r) => (square(t * (980 - u * 620), 0.2) * 0.45 + r() * 0.4) * Math.exp(-u * 8)],
  ['slash_barbarian', 0.22, (t, u, r) => (saw(t * (260 - u * 150)) * 0.6 + r() * 0.45) * Math.exp(-u * 5)],
  ['slash_mage', 0.18, (t, u) => (square(t * (480 + Math.sin(u * 18) * 140), 0.3) * 0.6) * Math.exp(-u * 5)],
  ['slash_lancer', 0.15, (t, u, r) => (square(t * (720 - u * 440), 0.25) * 0.5 + r() * 0.35) * Math.exp(-u * 6.5)],
  ['slash_heavy', 0.25, (t, u, r) => (saw(t * (380 - u * 270)) * 0.55 + r() * 0.55) * Math.exp(-u * 4.5)],
  ['bow_shoot', 0.14, (t, u, r) => (tri(t * (680 - u * 420)) * 0.5 + r() * 0.35) * Math.exp(-u * 8)],
  ['mage_cast', 0.20, (t, u) => square(t * (420 + u * 520), 0.35) * 0.55 * Math.exp(-u * 4.5)],
  ['dash_whoosh', 0.15, (_t, u, r) => r() * Math.sin(u * Math.PI) * 0.7],
  ['guard_up', 0.14, (t, u) => square(t * (540 + u * 220), 0.5) * Math.exp(-u * 7)],
  ['guard_block', 0.18, (t, u, r) => (square(t * 620, 0.25) * 0.6 + r() * 0.35) * Math.exp(-u * 8)],
  ['parry_clang', 0.38, (t, u) => (square(t * 1180, 0.2) * 0.5 + square(t * 1760, 0.5) * 0.4 + tri(t * 880) * 0.4) * Math.exp(-u * 4.5)],
  ['evade_pop', 0.18, (t, u) => tri(t * (580 + u * 540)) * Math.exp(-u * 6)],
  ['hero_hit', 0.18, (t, u, r) => (saw(t * (190 - u * 110)) * 0.6 + r() * 0.4) * Math.exp(-u * 6.5)],
  ['hero_down', 0.42, (t, u) => saw(t * (320 - u * 230)) * Math.exp(-u * 3.5)],
  ['revive_ok', 0.45, (t, u) => square(t * midiFreq([60, 64, 67, 72, 76][Math.min(4, Math.floor(u * 5))]), 0.3) * Math.exp(-u * 2.4)],
  ['skill_spin', 0.34, (t, u, r) => (saw(t * (320 + Math.sin(u * 26) * 180)) * 0.45 + r() * 0.4) * Math.exp(-u * 3.5)],
  ['skill_holy', 0.46, (t, u) => (square(t * (660 + u * 220), 0.25) * 0.5 + tri(t * 330) * 0.5) * Math.exp(-u * 3.2)],
  ['skill_charge', 0.28, (t, u, r) => (saw(t * (220 + u * 240)) * 0.55 + r() * 0.4) * Math.exp(-u * 4.2)],
  ['skill_snipe', 0.30, (t, u, r) => (square(t * (1120 - u * 780), 0.2) * 0.6 + r() * 0.4) * Math.exp(-u * 5)],
  ['skill_frost', 0.38, (t, u, r) => (square(t * (920 + Math.sin(u * 30) * 260), 0.25) * 0.4 + r() * 0.45) * Math.exp(-u * 3.6)],
  ['skill_thunder', 0.40, (t, u, r) => (square(t * (740 - u * 480), 0.15) * 0.5 + r() * 0.65) * Math.exp(-u * 4)],
  ['skill_flurry', 0.28, (t, u, r) => (square(t * (820 + (Math.floor(u * 8) % 2) * 280), 0.25) * 0.5 + r() * 0.3) * Math.exp(-u * 4.2)],
  ['skill_shadow', 0.30, (t, u, r) => (saw(t * (640 - u * 420)) * 0.45 + r() * 0.5) * Math.exp(-u * 4.5)],
  ['skill_axe', 0.26, (t, u, r) => (saw(t * (310 + Math.sin(u * 20) * 120)) * 0.6 + r() * 0.35) * Math.exp(-u * 4.5)],
  ['skill_slam', 0.42, (t, u, r) => (tri(t * (140 - u * 90)) * 0.7 + r() * 0.6) * Math.exp(-u * 4.2)],
  ['skill_warcry', 0.44, (t, u) => (saw(t * (180 + Math.sin(u * 14) * 55)) * 0.7) * Math.exp(-u * 2.8)],
  ['skill_meteor', 0.46, (t, u, r) => (saw(t * (260 - u * 180)) * 0.55 + r() * 0.65) * Math.exp(-u * 3.6)],
  ['skill_gravity', 0.42, (t, u) => (tri(t * (220 - u * 130 + Math.sin(u * 24) * 40)) * 0.7) * Math.exp(-u * 3)],
  ['skill_blink', 0.22, (t, u) => square(t * (540 + u * 820), 0.25) * Math.exp(-u * 6)],
  ['skill_lance', 0.28, (t, u, r) => (square(t * (680 + u * 320), 0.2) * 0.55 + r() * 0.35) * Math.exp(-u * 4.8)],
  ['ultimate_cast', 0.68, (t, u, r) => (square(t * midiFreq([60, 67, 72, 79, 84][Math.min(4, Math.floor(u * 5))]), 0.25) * 0.55 + saw(t * 220) * 0.35 + r() * 0.2) * Math.exp(-u * 1.9)],
  ['boss_roar', 0.58, (t, u, r) => (saw(t * (135 - u * 55 + Math.sin(u * 22) * 24)) * 0.65 + r() * 0.45) * Math.exp(-u * 2.4)],
  ['coin_pick', 0.14, (t, u) => square(t * (u < 0.4 ? 988 : 1318), 0.3) * Math.exp(-u * 7)],
  ['heal_pop', 0.24, (t, u) => tri(t * (523 + u * 440)) * Math.exp(-u * 4.8)],
  ['fury_up', 0.26, (t, u) => saw(t * (380 + u * 520)) * Math.exp(-u * 4.2)],
  ['level_up', 0.52, (t, u) => square(t * midiFreq([64, 68, 71, 76, 80][Math.min(4, Math.floor(u * 5))]), 0.3) * Math.exp(-u * 2.2)],
  ['upgrade_ok', 0.22, (t, u) => square(t * (u < 0.45 ? 660 : 990), 0.35) * Math.exp(-u * 5.5)],
  ['switch_hero', 0.16, (t, u) => tri(t * (440 + u * 420)) * Math.exp(-u * 6.5)],
  ['wave_clear', 0.48, (t, u) => square(t * midiFreq([60, 64, 67, 72][Math.min(3, Math.floor(u * 4))]), 0.35) * Math.exp(-u * 2.5)],
  ['ui_click', 0.08, (t, u) => square(t * 780, 0.25) * Math.exp(-u * 12)],
];

for (const [name, dur, fn] of sfxDefs) {
  renderSfx(name, dur, fn);
}

console.log(`[OK] Generated 4 16-bit BGM tracks & ${sfxDefs.length} SFX clips -> ${AUDIO_DIR}`);
