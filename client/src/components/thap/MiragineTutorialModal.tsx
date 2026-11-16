/**
 * Hộp thoại Hướng dẫn 4:3 (nền `tutorial_bg.jpg`) và Bách khoa toàn thư 16 binh chủng
 * nguyên bản Miragine War kèm bảng khắc chế từ `MIRAGINE_AI_COUNTERS`.
 */
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Swords, X } from 'lucide-react';
import {
  MIRAGINE_AI_COUNTERS,
  THAP_ARENA_W,
  THAP_BASE,
  THAP_FIRST_ROUND_S,
  THAP_INCOME_LIMIT,
  THAP_MAX_POP,
  THAP_ROUND_S,
  THAP_SPLASH_FACTOR,
  THAP_START_GOLD,
  THAP_START_ROUND_INCOME,
  THAP_UNITS,
  THAP_UNIT_KINDS,
  type ThapUnitKind,
} from '../../../../shared/src';
import { playThap } from '../../thap/sound';
import { getPortraitUrl, MIRAGINE_UI_ASSETS } from '../../thap/sprites';
import { fmtCoins } from '../Dock';
import type { MiragineTutorialModalProps } from './miragineTypes';

const KIND_BY_ID: ReadonlyMap<number, ThapUnitKind> = new Map(
  THAP_UNIT_KINDS.map((kind) => [THAP_UNITS[kind].id, kind]),
);

function getCounterRelations(kind: ThapUnitKind): {
  strongAgainst: ThapUnitKind[];
  weakAgainst: ThapUnitKind[];
} {
  const unitId = THAP_UNITS[kind].id;
  const weakAgainst = (MIRAGINE_AI_COUNTERS[unitId] ?? [])
    .map((id) => KIND_BY_ID.get(id))
    .filter((k): k is ThapUnitKind => Boolean(k));

  const strongAgainst = THAP_UNIT_KINDS.filter((targetKind) => {
    const targetId = THAP_UNITS[targetKind].id;
    return (MIRAGINE_AI_COUNTERS[targetId] ?? []).includes(unitId);
  });

  return { strongAgainst, weakAgainst };
}

interface CounterListProps {
  label: string;
  units: readonly ThapUnitKind[];
  tone: 'good' | 'bad';
  onInspect: (kind: ThapUnitKind) => void;
}

function CounterList({ label, units, tone, onInspect }: CounterListProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '5px' }}>
      <span
        className={tone === 'good' ? 'good-text' : 'bad-text'}
        style={{ fontSize: '11.5px', fontWeight: 800, marginRight: '2px' }}
      >
        {label}:
      </span>
      {units.length === 0 ? (
        <span className="muted" style={{ fontSize: '11.5px' }}>
          Không có
        </span>
      ) : (
        units.map((k) => {
          const u = THAP_UNITS[k];
          return (
            <button
              key={k}
              type="button"
              className="thap-tag"
              style={{
                cursor: 'pointer',
                border:
                  tone === 'good'
                    ? '1px solid rgba(140, 233, 154, 0.4)'
                    : '1px solid rgba(255, 135, 135, 0.4)',
                background:
                  tone === 'good' ? 'rgba(47, 158, 68, 0.16)' : 'rgba(224, 49, 49, 0.16)',
              }}
              title={`Xem thông số ${u.vnName} (${u.name})`}
              onClick={() => {
                playThap('click');
                onInspect(k);
              }}
            >
              <img
                src={getPortraitUrl(k, 0)}
                alt={u.vnName}
                style={{ width: 16, height: 16, objectFit: 'contain', display: 'block' }}
                draggable={false}
              />
              <span>{u.vnName}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

/**
 * Hộp thoại Hướng dẫn & Bách khoa 16 binh chủng Miragine War.
 * Hỗ trợ đóng bằng phím `Escape` hoặc nhấp ra ngoài nền tối.
 */
export default function MiragineTutorialModal({
  open,
  initialTab = 'guide',
  initialUnit,
  onClose,
}: MiragineTutorialModalProps) {
  const [tab, setTab] = useState<'guide' | 'almanac'>(initialTab);
  const [activeUnit, setActiveUnit] = useState<ThapUnitKind>(initialUnit ?? THAP_UNIT_KINDS[0]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    if (initialUnit) setActiveUnit(initialUnit);
  }, [open, initialTab, initialUnit]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  const spec = THAP_UNITS[activeUnit] ?? THAP_UNITS[THAP_UNIT_KINDS[0]];
  const counters = useMemo(() => getCounterRelations(activeUnit), [activeUnit]);

  if (!open) return null;

  return (
    <div
      className="thap-tutorial-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="miragine-tutorial-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          playThap('click');
          onClose();
        }
      }}
    >
      <div className="thap-tutorial-modal">
        <div className="thap-tutorial-head">
          <h2 id="miragine-tutorial-title">
            <BookOpen size={17} className="inline-icon" aria-hidden="true" /> Cẩm Nang Miragine War
          </h2>

          <div className="thap-tutorial-tabs" role="tablist" aria-label="Chế độ xem hướng dẫn">
            <div className="thap-diff-row">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'guide'}
                className={`thap-diff-pill${tab === 'guide' ? ' on' : ''}`}
                onClick={() => {
                  playThap('click');
                  setTab('guide');
                }}
              >
                Cách chơi
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'almanac'}
                className={`thap-diff-pill${tab === 'almanac' ? ' on' : ''}`}
                onClick={() => {
                  playThap('click');
                  setTab('almanac');
                }}
              >
                Bách khoa 16 Quân
              </button>
            </div>

            <button
              type="button"
              className="thap-icon"
              aria-label="Đóng hướng dẫn"
              title="Đóng (Esc)"
              onClick={() => {
                playThap('click');
                onClose();
              }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {tab === 'guide' ? (
          <div className="thap-tutorial-board">
            <img
              src={MIRAGINE_UI_ASSETS.tutorial_bg}
              alt="Bảng hướng dẫn Miragine War"
              className="thap-tutorial-bg"
              draggable={false}
            />

            <div className="thap-tutorial-cols">
              <section className="thap-tutorial-col left" aria-label="Luồng trận đấu">
                <div className="thap-tutorial-col-head">Luồng Trận Đấu</div>
                <div className="thap-tutorial-col-body">
                  <ul>
                    <li>
                      Khởi đầu <b>{THAP_START_GOLD} vàng</b>. Đợt 1 sau{' '}
                      <b>{THAP_FIRST_ROUND_S}s</b> nhận{' '}
                      <b>+{fmtCoins(THAP_START_ROUND_INCOME)} vàng</b>; mỗi đợt sau cách{' '}
                      <b>{THAP_ROUND_S}s</b>.
                    </li>
                    <li>
                      Quân <b>tự xuất qua Cổng Triệu Hồi</b> theo ô binh chủng đang chọn khi đủ vàng
                      &amp; dân số.
                    </li>
                    <li>
                      Mỗi lính triệu hồi cộng thêm <b>+Thu nhập/đợt</b> (trần{' '}
                      <b>{fmtCoins(THAP_INCOME_LIMIT)}</b>, dân số tối đa <b>{THAP_MAX_POP}</b>).
                    </li>
                    <li>
                      Giữ cân bằng <b>Giáp Nhẹ</b> vs <b>Giáp Nặng</b>: sát thương tính theo{' '}
                      <code>Công[giáp] - Giáp</code> (tối thiểu 1).
                    </li>
                    <li>
                      Phá vỡ <b>Pha Lê Chính</b> địch ({fmtCoins(THAP_BASE.hp)} HP, bắn phép{' '}
                      {THAP_BASE.atk} ST) để thắng!
                    </li>
                  </ul>
                </div>
              </section>

              <section className="thap-tutorial-col right" aria-label="Điều khiển">
                <div className="thap-tutorial-col-head">Điều Khiển</div>
                <div className="thap-tutorial-col-body">
                  <ul>
                    <li>
                      Bấm <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> hoặc{' '}
                      <b>Phím Mũi Tên</b> để di chuyển khung chọn vàng{' '}
                      <img
                        src={MIRAGINE_UI_ASSETS.cursor_p1}
                        alt="Khung chọn vàng"
                        style={{
                          width: 15,
                          height: 15,
                          verticalAlign: 'text-bottom',
                          display: 'inline-block',
                        }}
                        draggable={false}
                      />
                      .
                    </li>
                    <li>
                      Phím tắt nhanh <kbd>1</kbd>..<kbd>9</kbd>, <kbd>0</kbd>, <kbd>Q</kbd>,{' '}
                      <kbd>E</kbd>, <kbd>F</kbd>, <kbd>G</kbd>, <kbd>V</kbd>, <kbd>B</kbd> hoặc{' '}
                      <b>nhấp chuột</b> trực tiếp vào ô quân.
                    </li>
                    <li>
                      <b>Kéo chuột</b> trên chiến trường, bấm <kbd>[</kbd> <kbd>]</kbd>, <b>lăn chuột</b>{' '}
                      (hoặc <kbd>+</kbd> <kbd>-</kbd>) hay kéo <b>thanh bản đồ ngang</b> để di chuyển
                      góc nhìn toàn làn {fmtCoins(THAP_ARENA_W)}px.
                    </li>
                    <li>
                      Nhấn <kbd>Space</kbd> / <kbd>Home</kbd> để đưa camera về Pha Lê nhà tức thì.
                    </li>
                  </ul>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="thap-almanac">
            <div className="thap-almanac-head">
              <span>
                <Swords size={15} className="inline-icon" aria-hidden="true" />{' '}
                <b>16 Binh Chủng Nguyên Bản</b>
              </span>
              <span className="muted" style={{ fontSize: '12px' }}>
                Nhấp vào từng quân để soi chỉ số &amp; bảng khắc chế chuẩn
              </span>
            </div>

            <div className="thap-almanac-detail">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <img
                  src={getPortraitUrl(activeUnit, 0)}
                  alt={`${spec.vnName} (Phe Đỏ)`}
                  style={{
                    width: 44,
                    height: 44,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: 'rgba(224, 49, 49, 0.16)',
                    border: '1px solid rgba(255, 107, 107, 0.45)',
                    padding: 2,
                  }}
                  draggable={false}
                />
                <img
                  src={getPortraitUrl(activeUnit, 1)}
                  alt={`${spec.vnName} (Phe Xanh)`}
                  style={{
                    width: 44,
                    height: 44,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: 'rgba(28, 126, 214, 0.16)',
                    border: '1px solid rgba(77, 171, 247, 0.45)',
                    padding: 2,
                  }}
                  draggable={false}
                />
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 220,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <b style={{ fontSize: '14.5px', color: '#ffe066' }}>{spec.vnName}</b>
                  <span className="muted">({spec.name})</span>
                  <kbd>{spec.hotkey}</kbd>
                  <span className="muted" style={{ fontSize: '11.5px' }}>
                    {spec.desc}
                  </span>
                </div>

                <div className="thap-inspect-stats">
                  <span className="thap-tag cost">Giá: {fmtCoins(spec.cost)} vàng</span>
                  <span className="thap-tag pop">Dân số: {spec.pop}</span>
                  <span className="thap-tag inc">+{fmtCoins(spec.incomeBonus)} thu nhập/đợt</span>
                  <span className="thap-tag hp">HP: {fmtCoins(spec.hp)}</span>
                  <span className={`thap-tag armor ${spec.armorType}`}>
                    Giáp {spec.armorType === 'light' ? 'Nhẹ' : 'Nặng'} ({spec.armor})
                  </span>
                  <span className="thap-tag dmg">
                    Công: [{spec.damage[0]} vs Nhẹ / {spec.damage[1]} vs Nặng]
                  </span>
                  <span className="thap-tag stat">
                    DelayAttack: {spec.delayAttack}f (Nhịp {spec.cd.toFixed(2)}s / {spec.weaponFrames}f)
                  </span>
                  <span className="thap-tag rng">
                    Tầm: {spec.rawRange} ({spec.range}px)
                  </span>
                  <span className="thap-tag spd">
                    Tốc chạy: {spec.moveSpeed} ({spec.speed} px/s)
                  </span>
                  {spec.splash !== undefined && spec.splash > 0 && (
                    <span className="thap-tag dmg">
                      Nổ lan: {spec.splash}px ({Math.round(THAP_SPLASH_FACTOR * 100)}% ST)
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <CounterList
                    label="Khắc chế tốt"
                    units={counters.strongAgainst}
                    tone="good"
                    onInspect={setActiveUnit}
                  />
                  <CounterList
                    label="Bị khắc chế bởi"
                    units={counters.weakAgainst}
                    tone="bad"
                    onInspect={setActiveUnit}
                  />
                </div>
              </div>
            </div>

            <div className="thap-almanac-grid" role="listbox" aria-label="Danh sách 16 binh chủng">
              {THAP_UNIT_KINDS.map((kind) => {
                const u = THAP_UNITS[kind];
                const isSelected = kind === activeUnit;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`thap-almanac-item${isSelected ? ' on' : ''}`}
                    onClick={() => {
                      playThap('click');
                      setActiveUnit(kind);
                    }}
                  >
                    <div className="thap-almanac-sprites">
                      <img src={getPortraitUrl(kind, 0)} alt={u.vnName} draggable={false} />
                    </div>
                    <div className="thap-almanac-name">
                      <kbd>{u.hotkey}</kbd> {u.vnName}
                    </div>
                    <div className="thap-almanac-meta">
                      {fmtCoins(u.cost)} vàng · +{u.incomeBonus} TN
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
