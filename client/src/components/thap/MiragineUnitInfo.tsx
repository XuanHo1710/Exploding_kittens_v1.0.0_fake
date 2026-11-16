/**
 * Khung soi thông số binh chủng Miragine War cổ điển:
 * luôn hiển thị đầy đủ trên cả desktop lẫn mobile (`thap-unit-inspect`).
 */
import { THAP_UNITS, type ThapUnitStats } from '../../../../shared/src';
import { getPortraitUrl } from '../../thap/sprites';
import type { MiragineUnitInfoProps } from './miragineTypes';

/** Props mở rộng cho `MiragineUnitInfo`, hỗ trợ thêm `owner` để khớp chân dung phe Đỏ/Xanh. */
export interface MiragineUnitInfoComponentProps extends MiragineUnitInfoProps {
  /** Phe hiển thị ảnh chân dung (`0` = Đỏ / A, `1` = Xanh / B), mặc định `0`. */
  owner?: number;
}

function getArmorLabel(stats: ThapUnitStats): string {
  return stats.armorTypeID === 0 ? 'Giáp Nhẹ' : 'Giáp Nặng';
}

function getDamageSummary(stats: ThapUnitStats): string {
  const splashNote = stats.splash ? ` · Nổ lan ${stats.splash}px` : '';
  return `${stats.damage[0]} / ${stats.damage[1]}${splashNote}`;
}

/**
 * Hiển thị chân dung theo phe, tên Anh/Việt, phím tắt, trạng thái đợt tới,
 * toàn bộ chỉ số chiến đấu gốc và mô tả tiếng Việt ngắn gọn của binh chủng đang soi.
 */
export function MiragineUnitInfo({
  unitKind,
  selectedUnit,
  gold,
  pop,
  popCap,
  owner = 0,
}: MiragineUnitInfoComponentProps) {
  const stats = THAP_UNITS[unitKind] ?? THAP_UNITS.newbie;
  const isSelectedWave = unitKind === selectedUnit;
  const hasGold = gold !== undefined && Number.isFinite(gold);
  const canAfford = !hasGold || gold >= stats.cost;
  const goldDeficit = hasGold && !canAfford ? Math.ceil(stats.cost - gold) : 0;
  const hasPopInfo =
    pop !== undefined && popCap !== undefined && Number.isFinite(pop) && Number.isFinite(popCap);
  const overPopCap = hasPopInfo && pop + stats.pop > popCap;
  const armorLabel = getArmorLabel(stats);
  const damageSummary = getDamageSummary(stats);

  return (
    <div
      className="thap-unit-inspect"
      role="region"
      aria-label={`Thông tin binh chủng ${stats.vnName} (${stats.name})`}
    >
      <img
        className="thap-inspect-ico"
        src={getPortraitUrl(unitKind, owner)}
        alt={`${stats.vnName} (${stats.name})`}
        draggable={false}
      />

      <div className="thap-inspect-meta">
        <div className="thap-inspect-title">
          <kbd title={`Phím tắt ${stats.hotkey}`}>{stats.hotkey}</kbd>
          <span className="thap-inspect-name">{stats.vnName}</span>
          <span className="muted">({stats.name})</span>
          {isSelectedWave && (
            <span className="thap-status-tag ready">Đang chọn cho đợt tới</span>
          )}
          {overPopCap && (
            <span className="thap-status-tag popcap">
              Đầy dân số ({pop}/{popCap})
            </span>
          )}
          {hasGold && !canAfford && (
            <span className="thap-status-tag saving">Thiếu {goldDeficit} vàng</span>
          )}
        </div>

        <div className="thap-inspect-stats">
          <span
            className="thap-tag cost"
            title={
              hasGold
                ? canAfford
                  ? `Chi phí ${stats.cost} vàng (Đủ vàng triệu hồi)`
                  : `Chi phí ${stats.cost} vàng (Thiếu ${goldDeficit} vàng)`
                : `Chi phí ${stats.cost} vàng`
            }
          >
            Giá {stats.cost}
            {hasGold && (
              <span className={canAfford ? 'good-text' : 'bad-text'}>
                {canAfford ? ' (Đủ)' : ` (-${goldDeficit})`}
              </span>
            )}
          </span>
          <span className="thap-tag inc" title="Thu nhập cộng thêm mỗi đợt khi triệu hồi">
            +{stats.incomeBonus} thu nhập
          </span>
          <span className="thap-tag pop" title="Dân số chiếm dụng">
            Dân số {stats.pop}
          </span>
          <span className="thap-tag hp" title="Máu tối đa">
            Máu {stats.hp}
          </span>
          <span
            className={`thap-tag armor ${stats.armorTypeID === 0 ? 'light' : 'armored'}`}
            title={`Giáp ${stats.armor} (${armorLabel})`}
          >
            Giáp {stats.armor} ({armorLabel})
          </span>
          <span
            className="thap-tag dmg"
            title={`Sát thương lên Giáp Nhẹ / Giáp Nặng: ${damageSummary}`}
          >
            Công {damageSummary}
          </span>
          <span className="thap-tag rng" title={`Tầm đánh gốc ${stats.rawRange} (${stats.range}px)`}>
            Tầm {stats.rawRange}
          </span>
          <span className="thap-tag spd" title={`Tốc độ di chuyển gốc ${stats.moveSpeed}`}>
            Tốc {stats.moveSpeed}
          </span>
        </div>

        <div className="thap-inspect-desc" title={stats.desc}>
          {stats.desc}
        </div>
      </div>
    </div>
  );
}

export default MiragineUnitInfo;
