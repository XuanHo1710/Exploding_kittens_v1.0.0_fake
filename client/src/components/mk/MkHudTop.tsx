/**
 * Top HUD Bar: Biome badge, Wave / Boss Rush counter, 3-Phase Boss HP Bar (66% & 33% markers),
 * Combo streak, Party Gold & Score, Quick Upgrade / Guide / Audio / Chat / Leave buttons.
 */
import { BookOpen, Coins, Flame, LogOut, MessageSquare, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { MK_BIOME_LABELS } from '../../../../shared/src';
import type { MkHudSnapshot } from '../../mk/store';

export interface MkHudTopProps {
  hud: MkHudSnapshot;
  affordableCount: number;
  muted: boolean;
  unreadChat: number;
  spectating: boolean;
  onToggleUpgrade: () => void;
  onToggleMute: () => void;
  onToggleChat: () => void;
  onOpenGuide: () => void;
  onOpenLeave: () => void;
}

export function MkHudTop({
  hud,
  affordableCount,
  muted,
  unreadChat,
  spectating,
  onToggleUpgrade,
  onToggleMute,
  onToggleChat,
  onOpenGuide,
  onOpenLeave,
}: MkHudTopProps) {
  const me = hud.meFighter;
  const boss = hud.boss;
  const bossPct = boss ? Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.maxHp)) * 100)) : 0;

  return (
    <header className="mk-hud-top">
      <div className="mk-hud-cluster">
        <div className="mk-badge-wave">
          <span className="mk-badge-mode">{hud.playMode === 'boss_rush' ? 'BOSS RUSH' : 'WAVE'}</span>
          <strong>{hud.playMode === 'boss_rush' ? `${hud.wave}/4` : hud.wave}</strong>
        </div>
        <div className="mk-biome-pill">{MK_BIOME_LABELS[hud.biome]}</div>
        <div className="mk-stat-pill">
          <Coins size={14} />
          <span>{me ? me.gold : hud.partyGold}G</span>
        </div>
        {me && me.combo >= 2 && (
          <div className="mk-combo-pill">
            <Flame size={14} />
            <strong>{me.combo} HIT</strong>
          </div>
        )}
      </div>

      {boss && (
        <div className={`mk-boss-bar${boss.enraged ? ' enraged' : ''}`}>
          <div className="mk-boss-bar-head">
            <span>🔥 {boss.nameVi}</span>
            <span>
              PHA {boss.phase}/3 · {boss.hp}/{boss.maxHp}
            </span>
          </div>
          <div className="mk-boss-track">
            <div className="mk-boss-fill" style={{ width: `${bossPct}%` }} />
            <span className="mk-boss-notch" style={{ left: '33%' }} />
            <span className="mk-boss-notch" style={{ left: '66%' }} />
          </div>
        </div>
      )}

      <div className="mk-hud-actions">
        {!spectating && (
          <button
            type="button"
            className={`mk-hud-btn mk-upgrade-btn${affordableCount > 0 ? ' ready' : ''}`}
            onClick={onToggleUpgrade}
            title="Nâng cấp (U)"
          >
            <Sparkles size={15} />
            <span>Nâng cấp [U]</span>
            {affordableCount > 0 && <em className="mk-dot">{affordableCount}</em>}
          </button>
        )}
        <button type="button" className="mk-hud-btn icon" onClick={onToggleMute} title="Âm thanh">
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <button type="button" className="mk-hud-btn icon" onClick={onToggleChat} title="Trò chuyện">
          <MessageSquare size={15} />
          {unreadChat > 0 && <em className="mk-dot">{unreadChat}</em>}
        </button>
        <button type="button" className="mk-hud-btn icon" onClick={onOpenGuide} title="Hướng dẫn phím">
          <BookOpen size={15} />
        </button>
        <button type="button" className="mk-hud-btn icon danger" onClick={onOpenLeave} title="Rời phòng">
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
}
