/**
 * Upgrade Modal: 4 Base Stats (Lv1..15), 4 Active Skills (Lv0..5 with explicit
 * Lv3 & Lv5 VFX Evolution milestones), 2 Passives (Lv0..5), and Owned Relics.
 */
import { X } from 'lucide-react';
import {
  MK_HEROES,
  MK_MAX_SKILL_LEVEL,
  MK_MAX_STAT_LEVEL,
  MK_RELICS,
  MK_STAT_KEYS,
  MK_STATIC_ROOT,
  getMkUpgradeCost,
  type MkFighterView,
  type MkUpgradeTarget,
} from '../../../../shared/src';

export function countAffordableMkUpgrades(fighter?: MkFighterView): number {
  if (!fighter) return 0;
  let count = 0;
  const targets: MkUpgradeTarget[] = ['atk', 'hp', 'def', 'spd', 's1', 's2', 's3', 's4', 'p1', 'p2'];
  for (const t of targets) {
    const lv = fighter.upgrades[t];
    const isStat = t === 'atk' || t === 'hp' || t === 'def' || t === 'spd';
    const maxLv = isStat ? MK_MAX_STAT_LEVEL : MK_MAX_SKILL_LEVEL;
    if (lv >= maxLv) continue;
    const cost = getMkUpgradeCost(fighter.heroId, t, lv);
    if ((!isStat && fighter.sp > 0) || fighter.gold >= cost) count++;
  }
  return count;
}

export interface MkUpgradeModalProps {
  open: boolean;
  fighter?: MkFighterView;
  onUpgrade: (target: MkUpgradeTarget) => void;
  onClose: () => void;
}

const STAT_META = {
  atk: { label: 'Sức Mạnh (ATK)', icon: 'stat_atk' },
  hp: { label: 'Sinh Lực (HP)', icon: 'stat_hp' },
  def: { label: 'Giáp Thủ (DEF)', icon: 'stat_def' },
  spd: { label: 'Tốc Độ (SPD)', icon: 'stat_spd' },
} as const;

export function MkUpgradeModal({ open, fighter, onUpgrade, onClose }: MkUpgradeModalProps) {
  if (!open || !fighter) return null;
  const spec = MK_HEROES[fighter.heroId];

  return (
    <div className="mk-modal-backdrop" role="dialog" aria-modal="true" aria-label="Nâng cấp anh hùng">
      <div className="mk-pixel-modal mk-upgrade-modal">
        <div className="mk-modal-head">
          <div className="mk-upgrade-title">
            <img
              src={`${MK_STATIC_ROOT}/portraits/${fighter.heroId}.png`}
              alt={spec.codeName}
              className="mk-party-portrait mk-pixel"
            />
            <div>
              <h3>
                {spec.codeName} · {spec.titleVi} (Lv.{fighter.level})
              </h3>
              <p className="mk-sub">
                💰 {fighter.gold} Vàng · ⭐ {fighter.sp} Điểm Kỹ Năng (SP nâng Skill/Nội tại miễn phí)
              </p>
            </div>
          </div>
          <button type="button" className="mk-hud-btn icon" onClick={onClose} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>

        <div className="mk-upgrade-section">
          <h4>Chỉ Số Cơ Bản</h4>
          <div className="mk-stat-grid">
            {MK_STAT_KEYS.map((key) => {
              const lv = fighter.upgrades[key];
              const maxed = lv >= MK_MAX_STAT_LEVEL;
              const cost = getMkUpgradeCost(fighter.heroId, key, lv);
              const canBuy = !maxed && fighter.gold >= cost;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!canBuy}
                  onClick={() => onUpgrade(key)}
                  className={`mk-up-btn${canBuy ? ' buyable' : ''}`}
                >
                  <img src={`${MK_STATIC_ROOT}/ui/${STAT_META[key].icon}.png`} alt={key} className="mk-pixel" />
                  <div className="mk-up-meta">
                    <strong>{STAT_META[key].label}</strong>
                    <span>
                      Lv.{lv}/{MK_MAX_STAT_LEVEL} · {maxed ? 'TỐI ĐA' : `${cost}G`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mk-upgrade-section">
          <h4>4 Kỹ Năng Chủ Động (Tiến Hóa Hiệu Ứng ở Lv.3 & Lv.5)</h4>
          <div className="mk-skill-up-grid">
            {spec.skills.map((sk) => {
              const target = `s${sk.slot}` as MkUpgradeTarget;
              const lv = fighter.upgrades[target];
              const maxed = lv >= MK_MAX_SKILL_LEVEL;
              const cost = getMkUpgradeCost(fighter.heroId, target, lv);
              const useSp = fighter.sp > 0;
              const canBuy = !maxed && (useSp || fighter.gold >= cost);

              return (
                <button
                  key={sk.id}
                  type="button"
                  disabled={!canBuy}
                  onClick={() => onUpgrade(target)}
                  className={`mk-skill-up-card${canBuy ? ' buyable' : ''}${lv === 0 ? ' locked' : ''}`}
                >
                  <div className="mk-skill-up-head">
                    <img src={`${MK_STATIC_ROOT}/ui/${sk.icon}.png`} alt={sk.nameVi} className="mk-pixel" />
                    <div>
                      <strong>
                        [S{sk.slot}] {sk.nameVi}
                      </strong>
                      <span className="mk-skill-lv-tag">
                        {lv === 0 ? 'KHÓA' : `Lv.${lv}/5`} ·{' '}
                        {maxed ? 'TỐI ĐA' : useSp ? '1 SP' : `${cost}G`}
                      </span>
                    </div>
                  </div>
                  <p className="mk-skill-up-desc">{sk.descVi}</p>
                  <div className="mk-evo-row">
                    <span className={lv >= 3 ? 'evo on' : 'evo'}>{sk.evoLv3Vi}</span>
                    <span className={lv >= 5 ? 'evo on' : 'evo'}>{sk.evoLv5Vi}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mk-upgrade-section">
          <h4>2 Nội Tại & Thánh Vật Đang Sở Hữu</h4>
          <div className="mk-passive-grid">
            {(['p1', 'p2'] as const).map((pk) => {
              const pSpec = spec[pk];
              const lv = fighter.upgrades[pk];
              const maxed = lv >= MK_MAX_SKILL_LEVEL;
              const cost = getMkUpgradeCost(fighter.heroId, pk, lv);
              const useSp = fighter.sp > 0;
              const canBuy = !maxed && (useSp || fighter.gold >= cost);
              return (
                <button
                  key={pk}
                  type="button"
                  disabled={!canBuy}
                  onClick={() => onUpgrade(pk)}
                  className={`mk-up-btn${canBuy ? ' buyable' : ''}`}
                >
                  <div className="mk-up-meta">
                    <strong>
                      {pSpec.nameVi} ({lv === 0 ? 'Chưa mở' : `Lv.${lv}/5`})
                    </strong>
                    <span className="mk-sub">{pSpec.descVi}</span>
                    <span className="mk-price">{maxed ? 'TỐI ĐA' : useSp ? '1 SP' : `${cost}G`}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {fighter.relics.length > 0 && (
            <div className="mk-owned-relics">
              {fighter.relics.map((r) => {
                const rs = MK_RELICS[r.id];
                return (
                  <div key={r.id} className="mk-owned-relic-chip" style={{ borderColor: rs.color }}>
                    <img src={`${MK_STATIC_ROOT}/ui/${rs.icon}.png`} alt={rs.nameVi} className="mk-pixel" />
                    <span>
                      {rs.nameVi} ×{r.stacks}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
