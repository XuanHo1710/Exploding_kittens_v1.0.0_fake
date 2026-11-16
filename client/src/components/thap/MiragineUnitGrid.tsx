/**
 * Bảng lưới chọn 16 binh chủng 2 hàng × 8 cột chuẩn Miragine War cổ điển:
 * - Không nâng cấp (Z/X/C), không nút tư thế, không hàng đợi huấn luyện.
 * - Chân dung luôn sắc nét (không dùng `.off` làm mờ khi thiếu vàng).
 * - Ô đang chọn hiển thị khung con trỏ vàng `cursor_p1.png` (`.thap-cursor-p1`).
 */
import { forwardRef } from 'react';
import {
  MIRAGINE_UI_ASSETS,
  THAP_UNITS,
  THAP_UNIT_KINDS,
  type ThapUnitKind,
  type ThapUnitStats,
} from '../../../../shared/src';
import { playThap } from '../../thap/sound';
import { getPortraitUrl } from '../../thap/sprites';
import type { MiragineUnitGridProps } from './miragineTypes';

/** Props mở rộng cho `MiragineUnitGrid`, hỗ trợ thêm `owner` và `className`. */
export interface MiragineUnitGridComponentProps extends MiragineUnitGridProps {
  /** Phe hiển thị chân dung 16 binh chủng (`0` = Đỏ / A, `1` = Xanh / B), mặc định `0`. */
  owner?: number;
  /** Lớp CSS bổ sung gắn kèm `.thap-slots`. */
  className?: string;
}

function buildSlotTooltip(
  stats: ThapUnitStats,
  gold?: number,
  pop?: number,
  popCap?: number,
): string {
  const armorLabel = stats.armorTypeID === 0 ? 'Giáp Nhẹ' : 'Giáp Nặng';
  const splashNote = stats.splash ? ` (Nổ lan ${stats.splash}px)` : '';
  const lines = [
    `${stats.vnName} (${stats.name}) [${stats.hotkey}]`,
    `Giá ${stats.cost} vàng · +${stats.incomeBonus} thu nhập · Dân số ${stats.pop}`,
    `Máu ${stats.hp} · Giáp ${stats.armor} (${armorLabel}) · Công ${stats.damage[0]}/${stats.damage[1]}${splashNote}`,
    `Tầm ${stats.rawRange} · Tốc ${stats.moveSpeed}`,
    stats.desc,
  ];
  if (gold !== undefined && Number.isFinite(gold) && gold < stats.cost) {
    lines.push(`Thiếu ${Math.ceil(stats.cost - gold)} vàng (vẫn chọn trước được cho đợt tới)`);
  }
  if (
    pop !== undefined &&
    popCap !== undefined &&
    Number.isFinite(pop) &&
    Number.isFinite(popCap) &&
    pop + stats.pop > popCap
  ) {
    lines.push(`Cảnh báo dân số: ${pop + stats.pop}/${popCap}`);
  }
  return lines.join('\n');
}

/**
 * Hiển thị lưới 2×8 toàn bộ 16 binh chủng Miragine War nguyên bản theo thứ tự `THAP_UNIT_KINDS`.
 */
export const MiragineUnitGrid = forwardRef<HTMLDivElement, MiragineUnitGridComponentProps>(
  function MiragineUnitGrid(
    {
      selectedUnit,
      inspectedUnit,
      gold,
      pop,
      popCap,
      disabled = false,
      owner = 0,
      className,
      onSelectUnit,
      onInspectUnit,
    },
    ref,
  ) {
    const hasGold = gold !== undefined && Number.isFinite(gold);

    const handleSelect = (kind: ThapUnitKind) => {
      if (disabled) return;
      playThap('click');
      onSelectUnit(kind);
    };

    return (
      <div
        ref={ref}
        className={className ? `thap-slots ${className}` : 'thap-slots'}
        role="group"
        aria-label="Lưới 16 binh chủng Miragine War"
      >
        {THAP_UNIT_KINDS.map((kind) => {
          const stats = THAP_UNITS[kind];
          const isSelected = selectedUnit === kind;
          const isInspected = inspectedUnit === kind;
          const isPoor = hasGold && gold < stats.cost;

          return (
            <div
              key={kind}
              className={`thap-slot-wrap${isSelected ? ' selected' : ''}`}
            >
              <button
                type="button"
                className={`thap-slot${isSelected ? ' selected' : ''}${isInspected ? ' hovered' : ''}`}
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={`${stats.vnName} (${stats.name}), phím ${stats.hotkey}, giá ${stats.cost} vàng, thu nhập +${stats.incomeBonus}`}
                title={buildSlotTooltip(stats, gold, pop, popCap)}
                onClick={() => handleSelect(kind)}
                onMouseEnter={() => onInspectUnit?.(kind)}
                onFocus={() => onInspectUnit?.(kind)}
              >
                <kbd className="thap-slot-key">{stats.hotkey}</kbd>

                <img
                  className="thap-slot-ico"
                  src={getPortraitUrl(kind, owner)}
                  alt={stats.vnName}
                  draggable={false}
                />

                <span className="thap-slot-name">{stats.vnName}</span>

                <span className="thap-slot-foot">
                  <span className="thap-slot-inc">+{stats.incomeBonus}</span>
                  <span className={`thap-slot-cost${isPoor ? ' poor' : ''}`}>{stats.cost}</span>
                </span>

                {isSelected && (
                  <img
                    className="thap-cursor-p1"
                    src={MIRAGINE_UI_ASSETS.cursor_p1}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    );
  },
);

export default MiragineUnitGrid;
