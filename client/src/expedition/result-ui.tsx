/**
 * Màn kết quả sau trận: tiêu đề Chiến thắng / Thất bại, phần thưởng đếm tăng dần và thanh EXP của từng nhân vật
 * chạy từ mức trước trận lên mức sau trận. Mỗi lần thanh đầy là một lần lên cấp (nổ chữ "Lên cấp" + điểm được cộng).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EXPEDITION_HEROES_BY_ID,
  EXPEDITION_REALMS_BY_ID,
  EXPEDITION_SKILLS_BY_ID,
  EQUIP_SLOT_LABELS_VI,
  ITEM_RARITY_COLORS,
  ITEM_RARITY_LABELS_VI,
  formatStatValue,
  expToNextLevel,
  type CharmGain,
  type ItemInstance,
  type LevelUpReport,
  type RealmMapId,
} from './shared';
import { STAT_SHORT_VI, portraitUrl } from './menu-ui';
import { CharmIcon } from './progression-ui';
import { EquipmentName, isMythicWeapon, WeaponIcon } from './weapon-art';
import './reward-fx.css';
import { MaterialChip } from './enhance-panel';
import type { MaterialId } from './shared';

export interface HeroGain {
  heroId: string;
  fromLevel: number;
  fromExp: number;
  toLevel: number;
  toExp: number;
}

export interface BattleResultData {
  outcome: 'victory' | 'defeat';
  firstClear: boolean;
  sealReward: number;
  expReward: number;
  unlockedMapId?: RealmMapId;
  drops: ItemInstance[];
  charms: CharmGain[];
  materials?: Record<string, number>;
  levelUps: LevelUpReport[];
  gains: HeroGain[];
}

const FILL_MS = 1900;

function totalGain(g: HeroGain): number {
  if (g.toLevel === g.fromLevel) return Math.max(0, g.toExp - g.fromExp);
  let sum = expToNextLevel(g.fromLevel) - g.fromExp;
  for (let lv = g.fromLevel + 1; lv < g.toLevel; lv++) sum += expToNextLevel(lv);
  return sum + g.toExp;
}

/** Trạng thái hiển thị sau khi đã cộng `gained` EXP vào mức xuất phát. */
function stateAt(g: HeroGain, gained: number): { level: number; exp: number; need: number } {
  let level = g.fromLevel;
  let exp = g.fromExp + gained;
  while (level < g.toLevel && exp >= expToNextLevel(level)) {
    exp -= expToNextLevel(level);
    level += 1;
  }
  if (level === g.toLevel) exp = Math.min(exp, g.toExp);
  return { level, exp, need: expToNextLevel(level) };
}

export function BattleResultScreen({ result, onClose }: { result: BattleResultData; onClose: () => void }) {
  const [t, setT] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (!start.current) start.current = now + 650; // chờ tiêu đề hiện xong
      const k = Math.max(0, Math.min(1, (now - start.current) / FILL_MS));
      setT(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'e' || e.key === 'Escape') {
        e.preventDefault();
        if (t < 1) start.current = -1e9; // bấm lần đầu: tua nhanh tới cuối
        else onClose();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [t, onClose]);

  const eased = 1 - (1 - t) ** 3;
  const win = result.outcome === 'victory';
  const gains = useMemo(() => result.gains.map((g) => ({ g, total: totalGain(g) })), [result.gains]);

  return (
    <div className={`ui-result ${win ? 'win' : 'lose'}`} role="dialog" aria-label={win ? 'Chiến thắng' : 'Thất bại'}>
      <div className="ui-result-title">
        <i />
        <h1>{win ? 'Chiến thắng' : 'Thất bại'}</h1>
        <i />
      </div>
      {win ? (
        <div className="ui-result-rewards">
          <span><b>+{Math.round(result.expReward * eased)}</b><small>EXP</small></span>
          {result.sealReward > 0 && <span><b>+{Math.round(result.sealReward * eased)}</b><small>Ấn Tinh Tú ◈</small></span>}
          {result.firstClear && <span className="hl"><b>Lần đầu</b><small>hạ gục</small></span>}
          {result.unlockedMapId && <span className="hl"><b>{EXPEDITION_REALMS_BY_ID[result.unlockedMapId]?.nameVi}</b><small>vùng đất mới</small></span>}
        </div>
      ) : (
        <p className="ui-result-note">Đội hình đã gục ngã và được đưa về trạm nghỉ gần nhất. Cộng điểm, nâng kỹ năng hoặc đổi trang bị rồi thử lại.</p>
      )}

      <div className="ui-result-party">
        {gains.map(({ g, total }, i) => {
          const local = Math.max(0, Math.min(1, eased * 1.15 - i * 0.05));
          const now = stateAt(g, Math.round(total * local));
          const ups = now.level - g.fromLevel;
          const report = result.levelUps.find((l) => l.heroId === g.heroId);
          return (
            <div key={g.heroId} className={`ui-result-hero ${ups > 0 ? 'up' : ''}`} style={{ animationDelay: `${300 + i * 90}ms` }}>
              <img src={portraitUrl(g.heroId)} alt="" />
              <div>
                <b>{EXPEDITION_HEROES_BY_ID[g.heroId]?.nameVi}</b>
                <span className="lv">Cấp độ <em key={now.level}>{now.level}</em></span>
                <span className="ui-result-bar"><i style={{ width: `${(now.exp / now.need) * 100}%` }} /></span>
                <small>{Math.round(now.exp)} / {now.need} · +{Math.round(total * local)} EXP</small>
              </div>
              {ups > 0 && (
                <div className="ui-levelup" key={now.level}>
                  <strong>Lên cấp!</strong>
                  {report && <span>+{report.pointsGained} điểm chỉ số</span>}
                  {report?.unlockedSkillIds.length ? <span>Kỹ năng mới: {report.unlockedSkillIds.map((s) => EXPEDITION_SKILLS_BY_ID[s]?.nameVi).join(', ')}</span> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {win && Object.keys(result.materials ?? {}).length > 0 && (
        <section className={`ui-result-mats ${t >= 1 ? 'show' : ''}`} aria-label="Nguyên liệu">
          <h3>Nguyên liệu cường hoá</h3>
          <div>{(Object.entries(result.materials ?? {}) as [MaterialId, number][]).map(([id, n]) => <MaterialChip key={id} id={id} have={n} />)}</div>
        </section>
      )}
      {win && (result.drops.length > 0 || result.charms.length > 0) && (
        <section className={`ui-result-loot ${t >= 1 ? 'show' : ''}`} aria-label="Chiến lợi phẩm">
          <h3>Chiến lợi phẩm</h3>
          {result.charms.length >= 2 && (
            <p className="rx-lucky" style={{ animationDelay: `${(result.drops.length + result.charms.length) * 110 + 200}ms` }}>
              ✦ May mắn! ×{result.charms.length} bùa ✦
            </p>
          )}
          <div>
            {result.drops.map((d, i) => (
              <article key={d.uid} className={isMythicWeapon(d) ? 'ui-loot exp-foil-surface exp-foil-mythic' : 'ui-loot'}
                style={{ ['--r' as string]: ITEM_RARITY_COLORS[d.rarity], animationDelay: `${i * 110}ms` }}>
                <small>{ITEM_RARITY_LABELS_VI[d.rarity]} · {d.kind === 'elixir' ? 'Thuốc chỉ số' : `${EQUIP_SLOT_LABELS_VI[d.slot!]} · i${d.ilvl}`}</small>
                <b><WeaponIcon item={d} /><EquipmentName item={d} /></b>
                {d.main && <span>{STAT_SHORT_VI[d.main.stat]} +{formatStatValue(d.main.stat, d.main.value)}</span>}
                {d.elixir && <span>Vĩnh viễn {STAT_SHORT_VI[d.elixir.stat]} +{formatStatValue(d.elixir.stat, d.elixir.value)}</span>}
                {d.subs.length > 0 && <em>+{d.subs.length} chỉ số phụ</em>}
              </article>
            ))}
            {result.charms.map((c, i) => (
              <article key={`${c.charmId}-${i}`} className={`ui-loot charm rx-charm r-${c.rarity}`} style={{ animationDelay: `${(result.drops.length + i) * 110}ms` }}>
                <small>Bùa hộ mệnh</small>
                <b><CharmIcon id={c.charmId} />{c.nameVi}</b>
                <span>{c.convertedCrystal ? `Trùng tối đa → +${c.convertedCrystal} ⬢` : c.rankAfter > 1 ? `Lên bậc ${c.rankAfter}` : 'Mới!'}</span>
              </article>
            ))}
          </div>
        </section>
      )}

      <button type="button" className="ui-plate ui-result-next" onClick={() => (t < 1 ? (start.current = -1e9) : onClose())}>
        <span>{t < 1 ? 'Bỏ qua' : 'Tiếp tục'}</span><kbd>Enter</kbd>
      </button>
    </div>
  );
}
