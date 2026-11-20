/**
 * Zero-Dependency 16-Bit Chiptune WebAudio Synthesizer
 * Provides crisp retro RPG audio feedback without external audio URLs or third-party assets.
 */
class RetroSfxSynthImpl {
  private ctx: AudioContext | null = null;
  private volume = 0.8;

  public setVolumePct(pct: number): void {
    this.volume = Math.max(0, Math.min(1, pct / 100));
  }

  private getCtx(): AudioContext | null {
    if (this.volume <= 0 || typeof window === 'undefined') return null;
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private tone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType = 'square',
    gainPeak = 0.14,
    delaySec = 0,
  ): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
    gain.gain.setValueAtTime(gainPeak * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public play(kind: 'slash' | 'skill' | 'ultimate' | 'hit' | 'crit' | 'parry' | 'loot' | 'bossTelegraph' | 'enhance' | 'gacha'): void {
    switch (kind) {
      case 'slash':
        this.tone(420, 140, 0.09, 'sawtooth', 0.11);
        break;
      case 'skill':
        this.tone(330, 660, 0.14, 'triangle', 0.14);
        this.tone(520, 880, 0.16, 'square', 0.09, 0.06);
        break;
      case 'ultimate':
        this.tone(220, 880, 0.28, 'sawtooth', 0.15);
        this.tone(440, 1174, 0.26, 'square', 0.12, 0.08);
        break;
      case 'hit':
        this.tone(180, 70, 0.08, 'square', 0.12);
        break;
      case 'crit':
        this.tone(587, 1174, 0.11, 'square', 0.14);
        this.tone(880, 1568, 0.14, 'triangle', 0.12, 0.05);
        break;
      case 'parry':
        this.tone(1046, 1568, 0.15, 'triangle', 0.16);
        break;
      case 'loot':
        this.tone(523, 659, 0.08, 'square', 0.11);
        this.tone(659, 1046, 0.12, 'square', 0.11, 0.07);
        break;
      case 'bossTelegraph':
        this.tone(150, 110, 0.25, 'sawtooth', 0.14);
        break;
      case 'enhance':
        this.tone(440, 554, 0.09, 'triangle', 0.13);
        this.tone(554, 659, 0.09, 'triangle', 0.13, 0.09);
        this.tone(659, 880, 0.18, 'square', 0.14, 0.18);
        break;
      case 'gacha':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f * 1.05, 0.11, 'triangle', 0.12, i * 0.07));
        break;
    }
  }
}

export const retroSfxSynth = new RetroSfxSynthImpl();
