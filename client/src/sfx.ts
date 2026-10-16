/** Âm thanh tổng hợp bằng WebAudio, không cần file âm thanh */
export type Sfx = 'crack' | 'thud' | 'kiss' | 'pop' | 'splat' | 'shuffle' | 'tap' | 'select' | 'unselect' | 'play' | 'draw' | 'nope' | 'boom' | 'defuse' | 'turn' | 'win' | 'deny';

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; slide?: number; delay?: number } = {}) {
  const c = ac();
  const t = c.currentTime + (opts.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.3, lowpass = 900) {
  const c = ac();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

function vibrate(p: number | number[]) {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* trình duyệt không hỗ trợ */
  }
}

export function sfx(name: Sfx) {
  if (muted) return;
  try {
    switch (name) {
      case 'pop':
        tone(500, 0.12, { type: 'sine', gain: 0.09, slide: 2.2 });
        break;
      case 'crack':
        [0, 40, 75].forEach((d) => setTimeout(() => noise(0.04, 0.3, 6000), d));
        setTimeout(() => noise(0.2, 0.2, 900), 90);
        vibrate(40);
        break;
      case 'thud':
        tone(70, 0.35, { type: 'sine', gain: 0.35, slide: 0.5 });
        noise(0.18, 0.4, 400);
        setTimeout(() => noise(0.5, 0.12, 2500), 120);
        vibrate([90, 40, 60]);
        break;
      case 'kiss':
        tone(900, 0.12, { type: 'sine', gain: 0.08, slide: 1.6 });
        tone(1300, 0.15, { type: 'sine', gain: 0.06, delay: 0.1 });
        break;
      case 'splat':
        noise(0.25, 0.35, 700);
        tone(160, 0.2, { type: 'triangle', gain: 0.12, slide: 0.5 });
        vibrate(60);
        break;
      case 'shuffle':
        for (let i = 0; i < 9; i++) setTimeout(() => noise(0.05, 0.14, 4000), i * 110);
        break;
      case 'tap':
        tone(520, 0.05, { type: 'triangle', gain: 0.05 });
        break;
      case 'select':
        tone(660, 0.07, { type: 'triangle', gain: 0.08, slide: 1.5 });
        break;
      case 'unselect':
        tone(700, 0.07, { type: 'triangle', gain: 0.06, slide: 0.6 });
        break;
      case 'play':
        noise(0.18, 0.12, 2500);
        tone(380, 0.15, { type: 'sine', gain: 0.08, slide: 2 });
        break;
      case 'draw':
        noise(0.09, 0.1, 3500);
        tone(300, 0.08, { type: 'triangle', gain: 0.06, slide: 1.4 });
        break;
      case 'nope':
        tone(180, 0.25, { type: 'square', gain: 0.07, slide: 0.7 });
        tone(140, 0.25, { type: 'square', gain: 0.05, slide: 0.7, delay: 0.05 });
        vibrate(80);
        break;
      case 'boom':
        noise(0.9, 0.55, 600);
        tone(90, 0.7, { type: 'sine', gain: 0.25, slide: 0.4 });
        vibrate([120, 60, 200]);
        break;
      case 'defuse':
        [660, 880, 1100].forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.08, delay: i * 0.08 }));
        break;
      case 'turn':
        tone(880, 0.12, { type: 'sine', gain: 0.09 });
        tone(1320, 0.18, { type: 'sine', gain: 0.07, delay: 0.1 });
        vibrate(40);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.1, delay: i * 0.12 }));
        break;
      case 'deny':
        tone(240, 0.08, { type: 'square', gain: 0.04 });
        break;
    }
  } catch {
    /* AudioContext chưa sẵn sàng */
  }
}
