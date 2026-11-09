/**
 * Âm thanh Nối Thú Đại Chiến: tiếng kêu "pi-ka" của thú khi nối, tiếng chiêu của từng Boss.
 * Tổng hợp bằng WebAudio (không có file âm thanh), dùng chung AudioContext và nút tắt tiếng với sfx.ts.
 */
import type { LinkBossId, LinkBossSkill, LinkFx, LinkState } from '../../../shared/src';
import { audioCtx, isMuted } from '../sfx';

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  gain?: number;
  /** tần số cuối = freq * slide */
  slide?: number;
  delay?: number;
  /** rung tần số (Hz) và độ sâu (Hz) */
  vib?: [number, number];
  /** lọc thấp (Hz) – làm tiếng tròn, trầm hơn */
  lowpass?: number;
  attack?: number;
}

const out = () => {
  const c = audioCtx();
  return { c, dest: c.destination };
};

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const { c, dest } = out();
  const t = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * o.slide), t + dur);
  if (o.vib) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = o.vib[0];
    lg.gain.value = o.vib[1];
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.1, t + (o.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = osc;
  if (o.lowpass) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    node = node.connect(f);
  }
  node.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, o: { gain?: number; type?: BiquadFilterType; freq?: number; sweep?: number; delay?: number; q?: number } = {}) {
  const { c, dest } = out();
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
  if (o.q) f.Q.value = o.q;
  g.gain.value = o.gain ?? 0.2;
  src.buffer = buf;
  src.connect(f).connect(g).connect(dest);
  src.start(t);
}

function vibrate(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* trình duyệt không hỗ trợ */
  }
}

// ---------------- tiếng thú (pi-ka / pi-ka-chu) ----------------

/** "pi": tiếng chíp cao, ngắn */
function pi(at: number, pitch: number, gain = 0.07) {
  noise(0.015, { type: 'highpass', freq: 5000, gain: gain * 1.2, delay: at });
  tone(1500 * pitch, 0.07, { type: 'triangle', gain, slide: 1.25, delay: at, vib: [38, 40] });
  tone(3000 * pitch, 0.05, { type: 'sine', gain: gain * 0.3, slide: 1.2, delay: at });
}
/** "ka": phụ âm bật + nguyên âm sáng, hơi đi xuống */
function ka(at: number, pitch: number, gain = 0.08, len = 0.13) {
  noise(0.02, { type: 'bandpass', freq: 2600, q: 2, gain: gain * 2, delay: at });
  tone(1250 * pitch, len, { type: 'triangle', gain, slide: 1.2, delay: at + 0.012, vib: [30, 30] });
  tone(2500 * pitch, len * 0.8, { type: 'sine', gain: gain * 0.35, slide: 1.1, delay: at + 0.012 });
}
/** "chu": tiếng xì + nguyên âm tròn kéo dài, lên rồi xuống */
function chu(at: number, pitch: number, gain = 0.08, len = 0.32) {
  noise(0.07, { type: 'highpass', freq: 3200, gain: gain * 1.6, delay: at });
  tone(950 * pitch, len, { type: 'triangle', gain, slide: 1.45, delay: at + 0.05, vib: [7, 22], attack: 0.04 });
  tone(1900 * pitch, len * 0.9, { type: 'sine', gain: gain * 0.25, slide: 1.3, delay: at + 0.05, vib: [7, 30] });
}

/** Thang ngũ cung (Đô Rê Mi Son La) – nghe êm tai, combo nào cũng hợp âm với nhau */
const PENTA = [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637, 3136];

/** "chíu": nốt sine tròn, trượt lên nhẹ như tiếng chim nhỏ – không gắt */
function chiu(at: number, freq: number, gain = 0.05) {
  tone(freq * 0.84, 0.12, { type: 'sine', gain, slide: 1.28, delay: at, attack: 0.012 });
  tone(freq * 1.68, 0.08, { type: 'sine', gain: gain * 0.15, slide: 1.2, delay: at + 0.006, attack: 0.012 });
}

/** Tiếng nối được 1 cặp: "chíu chíu" êm tai, combo càng cao nốt càng lên cao */
function critterCry(combo: number, kind: number) {
  const step = Math.min(PENTA.length - 2, Math.max(0, combo - 1));
  const f = PENTA[step] * (1 + ((kind % 3) - 1) * 0.008);
  if (combo >= 5 && combo % 5 === 0) {
    // mốc combo: chuỗi chíu chíu đi lên rồi "pi-ka-chu" nhỏ nhẹ
    [0, 1, 2, 3].forEach((i) => chiu(i * 0.07, PENTA[Math.min(PENTA.length - 1, step + i)], 0.042));
    pi(0.32, 1.05, 0.035);
    ka(0.4, 1.05, 0.04);
    chu(0.53, 1.1, 0.045, 0.36);
  } else {
    chiu(0, f);
    chiu(0.085, PENTA[Math.min(PENTA.length - 1, step + 1)], 0.042);
  }
}

/** Siêu Đấm: gồng "pi-ka-a..." rồi phóng điện "CHUUU!" */
function superCry() {
  pi(0, 1.05, 0.09);
  ka(0.1, 1.05, 0.09, 0.28);
  tone(1100, 0.28, { type: 'sawtooth', gain: 0.03, slide: 1.8, delay: 0.12, lowpass: 3000 });
  chu(0.42, 1.12, 0.11, 0.55);
  zap(0.5, 0.14);
  thunderClap(0.52, 0.32, 1.6);
  vibrate([40, 30, 120]);
}

// ---------------- hiệu ứng chung ----------------

function zap(at = 0, gain = 0.12) {
  for (let i = 0; i < 5; i++) {
    noise(0.03, { type: 'highpass', freq: 3500, gain, delay: at + i * 0.035 + Math.random() * 0.02 });
    tone(180 + Math.random() * 600, 0.04, { type: 'square', gain: gain * 0.4, slide: 2, delay: at + i * 0.035 });
  }
}

/**
 * Tiếng sấm sét thật: "rắc" (tia sét xé không khí) → "ĐÙNG" (nổ trầm) → "ầm ầm" (rền cuộn nhiều đợt nhỏ dần)
 */
function thunderClap(at = 0, gain = 0.3, len = 1.8) {
  noise(0.05, { type: 'highpass', freq: 3000, gain: gain * 1.5, delay: at });
  noise(0.09, { type: 'bandpass', freq: 1600, q: 0.7, gain: gain * 1.2, delay: at + 0.015 });
  for (let i = 0; i < 3; i++) noise(0.025, { type: 'highpass', freq: 2200, gain: gain, delay: at + 0.05 + i * 0.03 + Math.random() * 0.02 });
  noise(0.55, { type: 'lowpass', freq: 700, sweep: 0.25, gain: gain * 1.4, delay: at + 0.05 });
  tone(52, 0.7, { type: 'sine', gain: gain * 0.9, slide: 0.6, delay: at + 0.05 });
  for (let i = 0; i < 7; i++) {
    noise(0.3 + Math.random() * 0.35, {
      type: 'lowpass',
      freq: 140 + Math.random() * 240,
      gain: gain * Math.max(0.15, 1 - i * 0.13),
      delay: at + 0.3 + (i * len) / 8 + Math.random() * 0.1,
    });
  }
  vibrate([60, 30, 140]);
}

/** Vỡ thanh máu: tiếng kính vỡ + nổ */
function barBreak() {
  for (let i = 0; i < 10; i++) tone(2400 + Math.random() * 2600, 0.12, { type: 'triangle', gain: 0.035, delay: Math.random() * 0.18, slide: 0.8 });
  noise(0.25, { type: 'highpass', freq: 4000, gain: 0.15 });
  boom(0.05, 0.25);
  vibrate([50, 30, 90]);
}

function hitThud(dmg: number, long: boolean) {
  const g = Math.min(0.22, 0.08 + dmg / 400);
  tone(140, 0.14, { type: 'sine', gain: g, slide: 0.45 });
  noise(0.08, { type: 'lowpass', freq: 1400, gain: g });
  if (long) zap(0.03, 0.06);
}

function boom(at = 0, gain = 0.3) {
  noise(0.9, { type: 'lowpass', freq: 1200, sweep: 0.15, gain, delay: at });
  tone(80, 0.8, { type: 'sine', gain: gain * 0.9, slide: 0.4, delay: at });
}

function rumble(dur: number, at = 0, gain = 0.25) {
  noise(dur, { type: 'lowpass', freq: 220, gain, delay: at });
  tone(42, dur, { type: 'sawtooth', gain: gain * 0.35, delay: at, lowpass: 160, vib: [9, 6] });
}

function shimmer(up: boolean, at = 0, gain = 0.06) {
  const notes = up ? [660, 880, 1046, 1318, 1568] : [1568, 1318, 1046, 880, 660];
  notes.forEach((f, i) => tone(f, 0.22, { type: 'sine', gain, delay: at + i * 0.06 }));
}

function clang(at = 0, gain = 0.1) {
  [523, 1244, 1868, 2793].forEach((f, i) => tone(f, 0.7, { type: 'sine', gain: gain / (i + 1), delay: at, slide: 0.995 }));
  noise(0.04, { type: 'highpass', freq: 4000, gain: gain * 1.5, delay: at });
}

function growl(dur: number, base: number, at = 0, gain = 0.14) {
  tone(base, dur, { type: 'sawtooth', gain, slide: 0.7, delay: at, lowpass: 700, vib: [23, base * 0.25], attack: 0.06 });
  tone(base * 1.5, dur * 0.9, { type: 'square', gain: gain * 0.35, slide: 0.65, delay: at, lowpass: 500, vib: [17, base * 0.2], attack: 0.08 });
  noise(dur, { type: 'bandpass', freq: 400, q: 0.8, gain: gain * 1.2, delay: at });
}

function screech(dur: number, at = 0, gain = 0.07) {
  tone(1800, dur, { type: 'sawtooth', gain, slide: 0.55, delay: at, lowpass: 4500, vib: [31, 160], attack: 0.03 });
  noise(dur, { type: 'bandpass', freq: 3000, q: 3, gain: gain * 1.5, delay: at });
}

function whoosh(dur: number, at = 0, gain = 0.18) {
  noise(dur, { type: 'bandpass', freq: 400, sweep: 8, q: 1.2, gain, delay: at });
}

function chains(at = 0, n = 6, gain = 0.06) {
  for (let i = 0; i < n; i++) {
    const d = at + i * 0.07 + Math.random() * 0.03;
    tone(2200 + Math.random() * 1400, 0.09, { type: 'triangle', gain, delay: d });
    noise(0.02, { type: 'highpass', freq: 5000, gain: gain * 1.2, delay: d });
  }
}

function bubbles(at = 0, n = 7, gain = 0.07) {
  for (let i = 0; i < n; i++) tone(300 + Math.random() * 500, 0.07, { type: 'sine', gain, slide: 2.4, delay: at + i * 0.06 + Math.random() * 0.03 });
}

// ---------------- Boss ----------------

/** Tiếng gầm riêng của từng Boss (xuất hiện / nổi giận) */
function bossVoice(boss: LinkBossId, phase: number) {
  const angry = 1 + (phase - 1) * 0.12;
  switch (boss) {
    case 'thunder':
      growl(0.6, 120 * angry);
      thunderClap(0.05, 0.3, 1.8);
      break;
    case 'spider':
      screech(0.45 * angry, 0, 0.06);
      for (let i = 0; i < 8; i++) noise(0.02, { type: 'highpass', freq: 2500, gain: 0.08, delay: 0.3 + i * 0.05 });
      break;
    case 'tyrant':
      growl(0.9, 85 * angry, 0, 0.18);
      rumble(0.9, 0.1, 0.25);
      break;
    case 'twins':
      // Hắc Long gầm trầm + Phượng Hoàng rít cao cùng lúc
      growl(1.0, 70 * angry, 0, 0.17);
      screech(0.8, 0.15, 0.06);
      tone(196, 1.1, { type: 'sine', gain: 0.06, slide: 0.5, delay: 0.2, vib: [5, 8] });
      thunderClap(0.1, 0.3, 2);
      break;
    case 'overlord':
      // Trùm Cuối: tiếng gầm 4 lớp của 4 Boss hợp thể + sét + đất rung + hợp âm nghịch tai
      growl(1.4, 55 * angry, 0, 0.2);
      growl(1.1, 110 * angry, 0.1, 0.1);
      screech(0.9, 0.2, 0.05);
      thunderClap(0.25, 0.32, 2.2);
      [98, 104, 147].forEach((f, i) => tone(f * angry, 1.6, { type: 'sawtooth', gain: 0.04, lowpass: 900, delay: 0.4 + i * 0.05, attack: 0.3 }));
      if (phase > 1) boom(0.1, 0.3);
      break;
    case 'titan':
      // Cự Thần: dàn hợp xướng trầm của vũ trụ + gầm + sấm rền + chuông thiên hà
      [55, 82.4, 110, 164.8].forEach((f, i) => tone(f * angry, 2.4, { type: i % 2 ? 'sawtooth' : 'triangle', gain: 0.05, lowpass: 1100, attack: 0.4, delay: i * 0.08, vib: [4, 2] }));
      growl(1.6, 46 * angry, 0.1, 0.2);
      thunderClap(0, 0.34, 2.4);
      clang(0.7, 0.08);
      shimmer(false, 1.1, 0.04);
      break;
  }
  vibrate(phase > 1 ? [80, 40, 160] : [60, 30, 90]);
}

function bossSkill(kind: LinkBossSkill) {
  switch (kind) {
    case 'ice':
      [2093, 2637, 3136, 2349].forEach((f, i) => tone(f, 0.35, { type: 'sine', gain: 0.05, delay: i * 0.05 }));
      noise(0.4, { type: 'highpass', freq: 6000, gain: 0.08 });
      break;
    case 'dark':
      tone(220, 1.0, { type: 'sawtooth', gain: 0.07, slide: 0.4, lowpass: 600, attack: 0.15 });
      tone(233, 1.0, { type: 'sawtooth', gain: 0.05, slide: 0.4, lowpass: 600, attack: 0.15 });
      break;
    case 'bolt':
      zap(0, 0.12);
      thunderClap(0.04, 0.28, 1.5);
      break;
    case 'chain':
      zap(0, 0.12);
      zap(0.18, 0.1);
      zap(0.36, 0.08);
      thunderClap(0.1, 0.24, 1.4);
      break;
    case 'web':
      for (let i = 0; i < 6; i++) tone(500 + i * 90, 0.12, { type: 'triangle', gain: 0.05, slide: 0.6, delay: i * 0.05 });
      noise(0.3, { type: 'bandpass', freq: 1200, q: 4, gain: 0.08 });
      break;
    case 'venom':
      bubbles(0, 8);
      tone(160, 0.5, { type: 'sawtooth', gain: 0.05, slide: 0.7, lowpass: 400, vib: [12, 20] });
      break;
    case 'cocoon':
      whoosh(0.5, 0, 0.12);
      for (let i = 0; i < 5; i++) tone(400 - i * 40, 0.15, { type: 'triangle', gain: 0.06, slide: 0.7, delay: 0.2 + i * 0.08 });
      break;
    case 'drain':
      tone(300, 0.8, { type: 'sine', gain: 0.07, slide: 2.2, vib: [6, 15], attack: 0.1 });
      shimmer(true, 0.3, 0.04);
      break;
    case 'meteor':
      whoosh(0.6, 0, 0.2);
      tone(1200, 0.6, { type: 'sawtooth', gain: 0.03, slide: 0.2, lowpass: 2000 });
      boom(0.55, 0.3);
      vibrate([60, 30, 120]);
      break;
    case 'quake':
      rumble(1.2, 0, 0.32);
      vibrate([150, 50, 150]);
      break;
    case 'shield':
      clang(0, 0.12);
      break;
    case 'roar':
      growl(1.0, 95, 0, 0.2);
      vibrate(200);
      break;
    case 'blackhole':
      tone(900, 1.1, { type: 'sine', gain: 0.08, slide: 0.06, attack: 0.05 });
      noise(1.1, { type: 'lowpass', freq: 3000, sweep: 0.05, gain: 0.2 });
      tone(55, 1.2, { type: 'sawtooth', gain: 0.07, lowpass: 200, delay: 0.3, vib: [4, 5] });
      vibrate([60, 40, 160]);
      break;
    case 'hellfire':
      noise(1.0, { type: 'bandpass', freq: 800, sweep: 0.5, q: 0.7, gain: 0.25 });
      for (let i = 0; i < 7; i++) noise(0.03, { type: 'highpass', freq: 2000, gain: 0.1, delay: 0.1 + Math.random() * 0.8 });
      screech(0.4, 0.05, 0.04);
      break;
    case 'soul_chain':
      chains(0, 7, 0.06);
      tone(140, 0.9, { type: 'sawtooth', gain: 0.07, slide: 0.6, lowpass: 500, delay: 0.4, vib: [5, 10] });
      break;
    case 'nirvana':
      screech(0.35, 0, 0.04);
      shimmer(true, 0.15, 0.06);
      clang(0.5, 0.08);
      break;
    case 'eclipse':
      tone(330, 1.2, { type: 'sine', gain: 0.07, slide: 0.35, attack: 0.2, vib: [3, 10] });
      tone(311, 1.2, { type: 'sine', gain: 0.06, slide: 0.35, attack: 0.2 });
      bubbles(0.5, 5, 0.05);
      break;
    case 'vortex':
      // Lốc Xoáy: gió hú xoáy lên xuống + mảnh vụn va lách cách
      noise(1.6, { type: 'bandpass', freq: 300, sweep: 6, q: 2, gain: 0.3 });
      noise(1.6, { type: 'bandpass', freq: 1800, sweep: 0.3, q: 3, gain: 0.12, delay: 0.2 });
      tone(180, 1.4, { type: 'sine', gain: 0.06, slide: 3, vib: [6, 40], attack: 0.2 });
      for (let i = 0; i < 8; i++) noise(0.03, { type: 'highpass', freq: 3000, gain: 0.1, delay: 0.3 + Math.random() * 1.1 });
      vibrate([60, 40, 60, 40, 120]);
      break;
    case 'eye_laser':
      // Ma Nhãn Laze: nạp năng lượng rít lên rồi bắn "piuu" + xèo cháy
      tone(300, 0.26, { type: 'sawtooth', gain: 0.05, slide: 6, lowpass: 5000, attack: 0.2 });
      tone(2400, 0.5, { type: 'square', gain: 0.05, slide: 0.35, delay: 0.26, lowpass: 6000, vib: [45, 120] });
      tone(1200, 0.45, { type: 'sawtooth', gain: 0.04, slide: 0.5, delay: 0.27, lowpass: 3000 });
      noise(0.5, { type: 'highpass', freq: 4500, gain: 0.12, delay: 0.3 });
      vibrate([30, 20, 80]);
      break;
    case 'apocalypse':
      // Tận Thế Tứ Linh: 4 linh hồn ùa tới (băng leng keng, tơ, lửa, sét) rồi sấm nổ
      [2093, 2637, 3136].forEach((f, i) => tone(f, 0.3, { type: 'sine', gain: 0.04, delay: i * 0.05 }));
      noise(0.4, { type: 'bandpass', freq: 1200, q: 4, gain: 0.08, delay: 0.1 });
      noise(0.7, { type: 'bandpass', freq: 800, sweep: 0.5, q: 0.7, gain: 0.2, delay: 0.2 });
      zap(0.3, 0.12);
      thunderClap(0.45, 0.32, 2);
      break;
    case 'twin_laser':
      // Song Nhãn: 2 tia laze lệch nhịp, 1 cao 1 trầm
      for (const [d, f] of [[0, 2600], [0.12, 1700]] as const) {
        tone(300, 0.24, { type: 'sawtooth', gain: 0.045, slide: 6, lowpass: 5000, attack: 0.18, delay: d });
        tone(f, 0.5, { type: 'square', gain: 0.045, slide: 0.35, delay: d + 0.24, lowpass: 6000, vib: [45, 120] });
      }
      noise(0.6, { type: 'highpass', freq: 4500, gain: 0.12, delay: 0.3 });
      vibrate([30, 20, 80, 20, 80]);
      break;
    case 'meteor_rain':
      for (let i = 0; i < 6; i++) {
        const d = i * 0.11 + Math.random() * 0.05;
        whoosh(0.35, d, 0.12);
        boom(d + 0.3, 0.14);
      }
      vibrate([40, 30, 40, 30, 120]);
      break;
    case 'gravity':
      // Trọng Lực Đảo Chiều: âm thanh bị bẻ cong, trầm xuống rồi bật ngược lên
      tone(400, 0.6, { type: 'sine', gain: 0.08, slide: 0.25, vib: [8, 30] });
      tone(100, 0.6, { type: 'sine', gain: 0.08, slide: 4, delay: 0.55, vib: [8, 20] });
      whoosh(0.8, 0.2, 0.18);
      rumble(0.8, 0.3, 0.2);
      vibrate([80, 40, 80]);
      break;
    case 'board_spin':
      // Xoay Chuyển Càn Khôn: tiếng quay vù vù tăng tốc + gió cuốn + chuông vàng
      tone(120, 0.9, { type: 'sawtooth', gain: 0.05, slide: 5, lowpass: 2500, vib: [14, 40], attack: 0.1 });
      whoosh(0.9, 0, 0.2);
      for (let i = 0; i < 8; i++) noise(0.04, { type: 'bandpass', freq: 900 + i * 250, q: 3, gain: 0.08, delay: i * 0.09 });
      clang(0.85, 0.09);
      vibrate([40, 30, 40, 30, 120]);
      break;
    case 'eye_storm':
      // Bão Sét Thiên Nhãn: sét giật liên hồi + 3 tiếng sấm nổ nối nhau
      for (let i = 0; i < 4; i++) zap(i * 0.2, 0.11);
      thunderClap(0, 0.3, 1.4);
      thunderClap(0.35, 0.26, 1.4);
      thunderClap(0.75, 0.3, 2);
      break;
    case 'arm_cannon':
      // Song Thủ Pháo: 2 hành tinh nạp năng lượng rít lên, rồi 2 tia pháo gầm quét ngang + nổ
      tone(200, 0.4, { type: 'sawtooth', gain: 0.05, slide: 5, lowpass: 4000, attack: 0.3 });
      tone(260, 0.4, { type: 'sawtooth', gain: 0.04, slide: 5, lowpass: 4000, attack: 0.3, delay: 0.02 });
      tone(90, 0.9, { type: 'sawtooth', gain: 0.09, slide: 0.6, lowpass: 900, delay: 0.38, vib: [30, 10] });
      noise(0.9, { type: 'bandpass', freq: 600, sweep: 3, q: 0.8, gain: 0.28, delay: 0.38 });
      boom(0.45, 0.3);
      boom(0.8, 0.22);
      vibrate([30, 20, 200]);
      break;
    case 'supernova':
      // Siêu Tân Tinh: rít lên chói tai rồi nổ trắng + ngân vang
      tone(200, 0.6, { type: 'sawtooth', gain: 0.05, slide: 12, lowpass: 8000, attack: 0.4 });
      boom(0.6, 0.38);
      thunderClap(0.62, 0.25, 1.6);
      shimmer(true, 0.8, 0.05);
      break;
    case 'judgment':
      growl(0.8, 75, 0, 0.16);
      screech(0.6, 0.1, 0.05);
      boom(0.5, 0.32);
      clang(0.6, 0.07);
      vibrate([100, 50, 220]);
      break;
  }
}

/** Boss gục: nổ to + nhạc thắng nhỏ */
function bossDown() {
  boom(0, 0.35);
  boom(0.25, 0.25);
  [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.08, delay: 0.5 + i * 0.1 }));
  pi(1.05, 1.1);
  ka(1.14, 1.1);
  chu(1.29, 1.15, 0.09, 0.45);
  vibrate([120, 60, 200]);
}

// ---------------- điều phối ----------------

let lastCry = 0;
let lastFoeHit = 0;

function play(fx: LinkFx, mine: (id: string) => boolean) {
  switch (fx.k) {
    case 'match':
      if (!mine(fx.who)) return;
      // nhiều cặp trong một gói: chỉ kêu 1 lần cho đỡ ồn
      if (performance.now() - lastCry < 70) return;
      lastCry = performance.now();
      critterCry(fx.combo, fx.kind);
      return;
    case 'hit':
      if (mine(fx.who)) hitThud(fx.dmg, fx.long);
      else if (performance.now() - lastFoeHit > 250) {
        lastFoeHit = performance.now();
        tone(160, 0.08, { type: 'sine', gain: 0.03, slide: 0.5 });
      }
      return;
    case 'super':
      if (mine(fx.who)) superCry();
      else zap(0, 0.06);
      return;
    case 'skill':
      if (mine(fx.from)) zap(0, 0.08);
      else if (mine(fx.to)) bossSkill(fx.kind === 'freeze' ? 'ice' : 'dark');
      return;
    case 'boss':
      if (fx.kind === 'rage') bossVoice(fx.boss, fx.phase);
      else if (fx.kind === 'bar') barBreak();
      else {
        bossSkill(fx.kind);
        // Song Sát: mỗi chiêu kèm sấm rền 2 Boss cho uy lực
        if (fx.boss === 'twins') thunderClap(0, 0.22, 1.4);
      }
      return;
    case 'ko':
      bossDown();
      return;
    case 'shuffle':
      if (!mine(fx.who)) return;
      for (let i = 0; i < 7; i++) noise(0.04, { type: 'highpass', freq: 3500, gain: 0.1, delay: i * 0.07 });
      return;
    case 'miss':
      if (!mine(fx.who)) return;
      tone(220, 0.12, { type: 'square', gain: 0.04, slide: 0.7, lowpass: 1200 });
      return;
    default:
      return;
  }
}

/** Phát âm thanh cho các hiệu ứng mới trong một gói `link:state` */
export function playLinkSounds(st: LinkState) {
  if (isMuted() || !st.fx.length) return;
  const foeIds = new Set((st.foes ?? []).map((f) => f.id));
  // id nào không phải đối thủ là của mình; người xem (không có `me`) chỉ nghe tiếng Boss
  const mine = (id: string) => !!st.me && !foeIds.has(id);
  try {
    for (const fx of st.fx) play(fx, mine);
  } catch {
    /* AudioContext chưa sẵn sàng (chưa có thao tác người dùng) */
  }
}
