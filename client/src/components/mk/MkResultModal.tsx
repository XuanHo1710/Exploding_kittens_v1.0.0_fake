/**
 * End-of-Run Summary Modal showing Victory / Wave Reached, MVP badge, Damage,
 * Kills, Perfect Parries, and collected Roguelite Relics.
 */
import { Crown, RotateCcw, Shield, Trophy } from 'lucide-react';
import {
  MK_HEROES,
  MK_RELICS,
  MK_STATIC_ROOT,
  type MkResultSummary,
} from '../../../../shared/src';

export interface MkResultModalProps {
  result: MkResultSummary;
  isHost: boolean;
  onRestart: () => void;
  onClose: () => void;
}

export function MkResultModal({ result, isHost, onRestart, onClose }: MkResultModalProps) {
  const mins = Math.floor(result.elapsedMs / 60000);
  const secs = Math.floor((result.elapsedMs % 60000) / 1000);

  return (
    <div className="mk-modal-backdrop" role="dialog" aria-modal="true" aria-label="Kết quả trận đấu">
      <div className="mk-pixel-modal mk-result-modal">
        <div className="mk-result-header">
          <Trophy size={26} color={result.victory ? '#fde047' : '#f87171'} />
          <div>
            <h2>{result.victory ? 'CHIẾN THẮNG HUYỀN THOẠI!' : 'KẾT THÚC HÀNH TRÌNH'}</h2>
            <p className="mk-sub">
              {result.playMode === 'boss_rush' ? `Boss Rush ${result.waveReached}/4` : `Đạt Wave ${result.waveReached}`} ·
              Điểm {result.partyScore} · Hạ {result.totalKills} quái · {mins}:{String(secs).padStart(2, '0')}
            </p>
          </div>
        </div>

        <div className="mk-result-list">
          {result.players.map((p) => {
            const hero = MK_HEROES[p.heroId];
            const isMvp = p.id === result.mvpId;
            return (
              <div key={p.id} className={`mk-result-row${isMvp ? ' mvp' : ''}`}>
                <img
                  src={`${MK_STATIC_ROOT}/portraits/${p.heroId}.png`}
                  alt={hero.codeName}
                  className="mk-party-portrait mk-pixel"
                />
                <div className="mk-result-info">
                  <div className="mk-result-name">
                    <strong>{p.name}</strong>
                    <span className="mk-party-badge">{p.badge}</span>
                    {isMvp && (
                      <span className="mk-mvp-tag">
                        <Crown size={12} /> MVP
                      </span>
                    )}
                  </div>
                  <div className="mk-result-stats">
                    <span>Lv.{p.level}</span>
                    <span>⚔️ {p.damageDealt.toLocaleString()} DMG</span>
                    <span>💀 {p.kills} Hạ</span>
                    <span>
                      <Shield size={11} /> {p.parries} Parry
                    </span>
                    {p.coinDelta !== undefined && p.coinDelta !== 0 && (
                      <span className={p.coinDelta > 0 ? 'pos' : 'neg'}>
                        {p.coinDelta > 0 ? `+${p.coinDelta}` : p.coinDelta} xu
                      </span>
                    )}
                  </div>
                  {p.relics.length > 0 && (
                    <div className="mk-result-relics">
                      {p.relics.map((r) => (
                        <span key={r.id} className="mk-mini-relic" title={MK_RELICS[r.id]?.nameVi}>
                          <img
                            src={`${MK_STATIC_ROOT}/ui/${MK_RELICS[r.id]?.icon}.png`}
                            alt={MK_RELICS[r.id]?.nameVi}
                            className="mk-pixel"
                          />
                          {r.stacks > 1 && <em>×{r.stacks}</em>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mk-modal-footer">
          {isHost && (
            <button type="button" className="primary" onClick={onRestart}>
              <RotateCcw size={15} /> Chơi lại
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
