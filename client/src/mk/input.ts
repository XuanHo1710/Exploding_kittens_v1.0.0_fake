/**
 * Mighty Knight 2.5D Pixel — Unified Keyboard + Touch Input Controller.
 *
 * Keybinds:
 * - Move: WASD / Arrow Keys / Mobile Virtual Joystick
 * - 3-Hit Basic Combo: J / Z (tap or hold)
 * - 4 Active Skills: K / L / I / O (or 1 / 2 / 3 / 4)
 * - Awakening Ultimate: R
 * - Dash: Space / Shift
 * - Guard / Perfect Parry: E / H
 * - Switch COM Hero: Q / Tab
 * - Upgrade Panel: U
 */
import type { MkCommand } from '../../../shared/src';

export interface MkInputCallbacks {
  sendCmd: (cmd: MkCommand) => void;
  onToggleUpgrade: () => void;
  onVectorChange?: (mx: number, my: number) => void;
  onAttackHoldChange?: (holding: boolean) => void;
  isBlocked: () => boolean;
}

class MkInputManager {
  private keys = new Set<string>();
  private touchMx = 0;
  private touchMy = 0;
  private touchAtk = false;
  private lastSentMx = 0;
  private lastSentMy = 0;
  private lastSentAtk = false;
  private lastMoveAt = 0;
  private cbs: MkInputCallbacks | null = null;
  private active = false;

  attach(callbacks: MkInputCallbacks): () => void {
    this.cbs = callbacks;
    this.active = true;
    this.keys.clear();
    this.touchMx = 0;
    this.touchMy = 0;
    this.touchAtk = false;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.active || !this.cbs) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const code = e.code;
      if (code === 'KeyU' && !e.repeat) {
        e.preventDefault();
        this.cbs.onToggleUpgrade();
        return;
      }
      if (this.cbs.isBlocked()) return;

      const isMoveKey =
        code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD' ||
        code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight';
      if (isMoveKey) {
        e.preventDefault();
        this.keys.add(code);
        this.flushMove(true);
        return;
      }

      if (code === 'KeyJ' || code === 'KeyZ') {
        e.preventDefault();
        this.keys.add(code);
        this.cbs.onAttackHoldChange?.(true);
        if (!e.repeat) {
          const { mx, my } = this.computeMove();
          this.cbs.sendCmd({ t: 'attack', hold: true, mx, my });
        }
        return;
      }

      if (e.repeat) return;

      if (code === 'KeyK' || code === 'Digit1') {
        e.preventDefault();
        this.cbs.sendCmd({ t: 'skill', slot: 1 });
      } else if (code === 'KeyL' || code === 'Digit2') {
        e.preventDefault();
        this.cbs.sendCmd({ t: 'skill', slot: 2 });
      } else if (code === 'KeyI' || code === 'Digit3') {
        e.preventDefault();
        this.cbs.sendCmd({ t: 'skill', slot: 3 });
      } else if (code === 'KeyO' || code === 'Digit4') {
        e.preventDefault();
        this.cbs.sendCmd({ t: 'skill', slot: 4 });
      } else if (code === 'KeyR') {
        e.preventDefault();
        this.cbs.sendCmd({ t: 'ultimate' });
      } else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
        e.preventDefault();
        const { mx, my } = this.computeMove();
        this.cbs.sendCmd({ t: 'dash', mx, my });
      } else if (code === 'KeyE' || code === 'KeyH') {
        e.preventDefault();
        this.cbs.sendCmd({ t: 'guard' });
      } else if (code === 'KeyQ' || code === 'Tab') {
        e.preventDefault();
        this.cbs.sendCmd({ t: 'switch_com' });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (this.keys.delete(code)) {
        if (code === 'KeyJ' || code === 'KeyZ') {
          const stillAtk = this.keys.has('KeyJ') || this.keys.has('KeyZ') || this.touchAtk;
          this.cbs?.onAttackHoldChange?.(stillAtk);
        }
        this.flushMove(true);
      }
    };

    const onBlur = () => {
      this.keys.clear();
      this.touchMx = 0;
      this.touchMy = 0;
      this.touchAtk = false;
      this.cbs?.onAttackHoldChange?.(false);
      this.flushMove(true);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      this.active = false;
      this.cbs = null;
      this.keys.clear();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }

  setTouchVector(mx: number, my: number): void {
    this.touchMx = Math.max(-1, Math.min(1, mx));
    this.touchMy = Math.max(-1, Math.min(1, my));
    this.flushMove(false);
  }

  setTouchAttack(holding: boolean): void {
    const changed = this.touchAtk !== holding;
    this.touchAtk = holding;
    this.cbs?.onAttackHoldChange?.(holding || this.keys.has('KeyJ') || this.keys.has('KeyZ'));
    if (holding && changed && this.cbs && !this.cbs.isBlocked()) {
      const { mx, my } = this.computeMove();
      this.cbs.sendCmd({ t: 'attack', hold: true, mx, my });
    }
    this.flushMove(true);
  }

  private computeMove(): { mx: number; my: number; atk: boolean } {
    let mx = this.touchMx;
    let my = this.touchMy;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my += 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const atk = this.touchAtk || this.keys.has('KeyJ') || this.keys.has('KeyZ');
    return { mx: Math.round(mx * 100) / 100, my: Math.round(my * 100) / 100, atk };
  }

  private flushMove(force: boolean): void {
    if (!this.cbs || this.cbs.isBlocked()) return;
    const now = performance.now();
    const { mx, my, atk } = this.computeMove();
    this.cbs.onVectorChange?.(mx, my);
    const diff =
      Math.abs(mx - this.lastSentMx) > 0.08 ||
      Math.abs(my - this.lastSentMy) > 0.08 ||
      atk !== this.lastSentAtk;
    if (!force && !diff) return;
    if (!force && now - this.lastMoveAt < 35) return;
    this.lastMoveAt = now;
    this.lastSentMx = mx;
    this.lastSentMy = my;
    this.lastSentAtk = atk;
    this.cbs.sendCmd({ t: 'move', mx, my, atk });
  }
}

export const mkInput = new MkInputManager();
