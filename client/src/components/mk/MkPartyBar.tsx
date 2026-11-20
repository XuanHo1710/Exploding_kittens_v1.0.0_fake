/**
 * Party Status Strip: Crisp 32x32 Pixel Portraits, HP + Shield + Fury Gauges,
 * Downed indicator, and 1-Click COM Switch (`Q` / `Tab`).
 */
import {
  MK_FURY_MAX,
  MK_HEROES,
  MK_STATIC_ROOT,
  type MkFighterView,
} from '../../../../shared/src';

export interface MkPartyBarProps {
  fighters: MkFighterView[];
  meFighterId?: string;
  allowSwitchCom: boolean;
  spectating: boolean;
  onSwitchCom: (targetId: string) => void;
}

export function MkPartyBar({
  fighters,
  meFighterId,
  allowSwitchCom,
  spectating,
  onSwitchCom,
}: MkPartyBarProps) {
  return (
    <div className="mk-party-bar">
      {fighters.map((f) => {
        const isMe = f.id === meFighterId;
        const canSwap = !spectating && allowSwitchCom && f.isCom && !isMe;
        const hpPct = Math.max(0, Math.min(100, (f.hp / Math.max(1, f.maxHp)) * 100));
        const shPct = Math.max(0, Math.min(100, (f.shieldHp / Math.max(1, f.maxHp)) * 100));
        const furyPct = Math.max(0, Math.min(100, (f.fury / MK_FURY_MAX) * 100));
        const spec = MK_HEROES[f.heroId];

        return (
          <button
            key={f.id}
            type="button"
            disabled={!canSwap}
            onClick={() => canSwap && onSwitchCom(f.id)}
            className={`mk-party-card${isMe ? ' me' : ''}${f.downed ? ' downed' : ''}${canSwap ? ' swappable' : ''}`}
            style={{ borderColor: isMe ? '#fde047' : spec.accentColor }}
            title={canSwap ? `Bấm hoặc nhấn [Q] đổi sang ${f.name}` : f.name}
          >
            <img
              src={`${MK_STATIC_ROOT}/portraits/${f.heroId}.png`}
              alt={spec.codeName}
              className="mk-party-portrait mk-pixel"
            />
            <div className="mk-party-meta">
              <div className="mk-party-row">
                <span className="mk-party-badge">{f.badge}</span>
                <span className="mk-party-lv">Lv.{f.level}</span>
                {canSwap && <span className="mk-swap-hint">ĐỔI [Q]</span>}
              </div>
              <div className="mk-bar hp">
                <div className="mk-bar-fill" style={{ width: `${hpPct}%` }} />
                {shPct > 0 && <div className="mk-bar-shield" style={{ width: `${shPct}%` }} />}
              </div>
              <div className="mk-bar fury">
                <div className={`mk-bar-fill${furyPct >= 100 ? ' full' : ''}`} style={{ width: `${furyPct}%` }} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
