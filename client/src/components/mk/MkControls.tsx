/**
 * Ergonomic PC & Mobile Landscape (844×390) Combat Controls:
 * - Left: 8-Way Pixel Touch Joystick
 * - Right: 3-Hit Combo Attack + 4 Active Skill Buttons (pixel icons, padlock, CD overlay, Lv badge)
 *   + Awakening Ultimate (glows at 100% Fury) + Dash + Guard / Perfect Parry!
 */
import { useRef, useState } from 'react';
import {
  MK_FURY_MAX,
  MK_HEROES,
  MK_STATIC_ROOT,
  type MkCommand,
  type MkFighterView,
} from '../../../../shared/src';
import { mkInput } from '../../mk/input';

export interface MkControlsProps {
  fighter?: MkFighterView;
  disabled: boolean;
  kbVec: { mx: number; my: number };
  kbAtk: boolean;
  onCmd: (cmd: MkCommand) => void;
}

const SKILL_KEYS = ['K', 'L', 'I', 'O'] as const;

export function MkControls({ fighter, disabled, kbVec, kbAtk, onCmd }: MkControlsProps) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  if (!fighter) return null;
  const spec = MK_HEROES[fighter.heroId];
  const furyReady = fighter.fury >= MK_FURY_MAX && !fighter.downed;
  const furyPct = Math.min(100, Math.round((fighter.fury / MK_FURY_MAX) * 100));

  const updateStick = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.max(24, rect.width * 0.36);
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(maxR, dist);
    const nx = dist > 2 ? (dx / dist) * (clamped / maxR) : 0;
    const ny = dist > 2 ? (dy / dist) * (clamped / maxR) : 0;
    setKnob({ x: nx * maxR, y: ny * maxR });
    mkInput.setTouchVector(nx, ny);
  };

  const releaseStick = () => {
    pointerIdRef.current = null;
    setKnob({ x: 0, y: 0 });
    mkInput.setTouchVector(0, 0);
  };

  const displayKnobX = pointerIdRef.current !== null ? knob.x : kbVec.mx * 26;
  const displayKnobY = pointerIdRef.current !== null ? knob.y : kbVec.my * 26;

  return (
    <div className="mk-controls-overlay" aria-label="Bảng điều khiển chiến đấu">
      {/* Left 8-Way Pixel Joystick */}
      <div
        ref={padRef}
        className="mk-joystick"
        onPointerDown={(e) => {
          if (disabled) return;
          pointerIdRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pointerIdRef.current === e.pointerId) updateStick(e.clientX, e.clientY);
        }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
      >
        <div
          className="mk-joystick-knob"
          style={{ transform: `translate(${Math.round(displayKnobX)}px, ${Math.round(displayKnobY)}px)` }}
        />
        <span className="mk-joystick-hint">WASD</span>
      </div>

      {/* Right Combat Cluster: 4 Active Skills + Ultimate + Guard/Parry + Dash + Combo Attack */}
      <div className="mk-action-cluster">
        <div className="mk-skill-row">
          {spec.skills.map((sk) => {
            const slot = sk.slot;
            const lv = fighter.upgrades[`s${slot}` as const];
            const cd = fighter.cds[`s${slot}` as const];
            const maxCd = fighter.cds[`s${slot}Max` as const];
            const locked = lv <= 0;
            const cooling = cd > 0;
            const pct = cooling ? Math.min(100, (cd / Math.max(1, maxCd)) * 100) : 0;
            return (
              <button
                key={sk.id}
                type="button"
                disabled={disabled || locked || fighter.downed}
                className={`mk-act-btn skill${locked ? ' locked' : ''}${cooling ? ' cooling' : ''}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!disabled && !locked && !cooling) onCmd({ t: 'skill', slot });
                }}
                title={`${sk.nameVi} [${SKILL_KEYS[slot - 1]}]`}
              >
                <img src={`${MK_STATIC_ROOT}/ui/${sk.icon}.png`} alt={sk.nameVi} className="mk-pixel" />
                {locked && (
                  <img src={`${MK_STATIC_ROOT}/ui/icon_padlock.png`} alt="Khóa" className="mk-padlock mk-pixel" />
                )}
                {!locked && cooling && (
                  <div className="mk-cd-mask" style={{ height: `${pct}%` }}>
                    <span>{(cd / 1000).toFixed(1)}</span>
                  </div>
                )}
                <em className="mk-key-badge">{SKILL_KEYS[slot - 1]}</em>
                {!locked && <b className="mk-lv-badge">{lv}</b>}
              </button>
            );
          })}

          {/* Awakening Ultimate Button */}
          <button
            type="button"
            disabled={disabled || !furyReady}
            className={`mk-act-btn ult${furyReady ? ' ready' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled && furyReady) onCmd({ t: 'ultimate' });
            }}
            title={`${spec.ultimate.nameVi} [R] (${furyPct}% Fury)`}
          >
            <img src={`${MK_STATIC_ROOT}/ui/${spec.ultimate.icon}.png`} alt={spec.ultimate.nameVi} className="mk-pixel" />
            {!furyReady && (
              <div className="mk-cd-mask" style={{ height: `${100 - furyPct}%` }}>
                <span>{furyPct}%</span>
              </div>
            )}
            <em className="mk-key-badge">R</em>
          </button>
        </div>

        <div className="mk-primary-row">
          {/* Guard / Perfect Parry */}
          <button
            type="button"
            disabled={disabled || fighter.downed || fighter.cds.guard > 0}
            className={`mk-act-btn util guard${fighter.cds.guard > 0 ? ' cooling' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled) onCmd({ t: 'guard' });
            }}
            title="Đỡ đòn / Perfect Parry [E]"
          >
            <img src={`${MK_STATIC_ROOT}/ui/btn_guard.png`} alt="Parry" className="mk-pixel" />
            {fighter.cds.guard > 0 && (
              <div className="mk-cd-mask" style={{ height: `${(fighter.cds.guard / Math.max(1, fighter.cds.guardMax)) * 100}%` }}>
                <span>{(fighter.cds.guard / 1000).toFixed(1)}</span>
              </div>
            )}
            <em className="mk-key-badge">E</em>
          </button>

          {/* Dash */}
          <button
            type="button"
            disabled={disabled || fighter.downed || fighter.cds.dash > 0}
            className={`mk-act-btn util dash${fighter.cds.dash > 0 ? ' cooling' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled) onCmd({ t: 'dash' });
            }}
            title="Lướt né đòn [Space]"
          >
            <img src={`${MK_STATIC_ROOT}/ui/btn_dash.png`} alt="Dash" className="mk-pixel" />
            {fighter.cds.dash > 0 && (
              <div className="mk-cd-mask" style={{ height: `${(fighter.cds.dash / Math.max(1, fighter.cds.dashMax)) * 100}%` }}>
                <span>{(fighter.cds.dash / 1000).toFixed(1)}</span>
              </div>
            )}
            <em className="mk-key-badge">SPC</em>
          </button>

          {/* Primary 3-Hit Combo Attack */}
          <button
            type="button"
            disabled={disabled || fighter.downed}
            className={`mk-act-btn attack${kbAtk ? ' active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled) mkInput.setTouchAttack(true);
            }}
            onPointerUp={() => mkInput.setTouchAttack(false)}
            onPointerLeave={() => mkInput.setTouchAttack(false)}
            onPointerCancel={() => mkInput.setTouchAttack(false)}
            title="Combo 3 nhịp [J / Z]"
          >
            <img src={`${MK_STATIC_ROOT}/ui/btn_attack.png`} alt="Đánh" className="mk-pixel" />
            <em className="mk-key-badge">J</em>
            {fighter.comboStep > 0 && <b className="mk-combo-step">C{fighter.comboStep}</b>}
          </button>
        </div>
      </div>
    </div>
  );
}
