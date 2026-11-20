/**
 * Boss-clear 1-of-3 Roguelite Pixel Relic Draft Modal (`MkRelicModal.tsx`).
 */
import {
  MK_RELICS,
  MK_STATIC_ROOT,
  type MkFighterView,
  type MkRelicId,
} from '../../../../shared/src';

export interface MkRelicModalProps {
  fighter?: MkFighterView;
  timeLeftMs: number;
  onPick: (relicId: MkRelicId) => void;
}

export function MkRelicModal({ fighter, timeLeftMs, onPick }: MkRelicModalProps) {
  const choices = fighter?.pendingRelicChoices;
  if (!fighter || !choices || choices.length === 0) return null;

  const sec = Math.max(0, Math.ceil(timeLeftMs / 1000));
  const stackMap = new Map(fighter.relics.map((r) => [r.id, r.stacks]));

  return (
    <div className="mk-modal-backdrop" role="dialog" aria-modal="true" aria-label="Chọn Thánh Vật">
      <div className="mk-pixel-modal mk-relic-modal">
        <div className="mk-modal-head">
          <div>
            <h3>✨ CHỌN 1 THÁNH VẬT ROGUELITE</h3>
            <p className="mk-sub">Tự động chọn sau {sec}s · Cộng dồn vĩnh viễn suốt trận</p>
          </div>
          <span className="mk-timer-pill">{sec}s</span>
        </div>
        <div className="mk-relic-grid">
          {choices.map((id) => {
            const spec = MK_RELICS[id];
            const stacks = stackMap.get(id) ?? 0;
            return (
              <button
                key={id}
                type="button"
                className="mk-relic-card"
                style={{ borderColor: spec.color }}
                onClick={() => onPick(id)}
              >
                <img
                  src={`${MK_STATIC_ROOT}/ui/${spec.icon}.png`}
                  alt={spec.nameVi}
                  className="mk-relic-icon mk-pixel"
                />
                <strong className="mk-relic-name" style={{ color: spec.color }}>
                  {spec.nameVi}
                </strong>
                <span className="mk-relic-stack">
                  {stacks > 0 ? `Tầng ${stacks} → ${stacks + 1}` : 'Mới · Tầng 1'}
                </span>
                <p className="mk-relic-desc">{spec.descVi}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
