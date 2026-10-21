/**
 * Giữ chuột (hoặc nhấn giữ trên điện thoại) vào lá bài → phóng to + giải thích luật bên cạnh.
 * CardView gắn trigger, App/Demo render <CardPreviewLayer /> đúng 1 lần.
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Cat, Package } from 'lucide-react';
import { CARD_INFO, describeCard, roomDeckSummary, type CardType, type DeckCardType, type RoomRules } from '../../../shared/src';
import { useRoomPlayerCount, useRoomRules } from '../roomRulesContext';
import CardView from './CardView';
import { CardIcon } from './icons';
import { store } from './cardPreviewStore';

/** Hướng dẫn cách dùng từng lá */
const HOW: Record<CardType, string> = {
  exploding: 'Không đánh được. Rút trúng là phải dùng Gỡ Bom ngay, không có thì bị loại.',
  defuse: '', // Filled from the room's bomb placement setting below.
  attack: 'Trong lượt của bạn: bấm lá này để kết thúc lượt mà không rút bài, buộc người chơi kế tiếp chơi 2 lượt.',
  targeted_attack: 'Trong lượt của bạn: bấm lá này rồi chọn 1 người chơi. Bạn kết thúc lượt không rút bài, người đó phải chơi 2 lượt và vòng chơi tiếp tục từ họ.',
  personal_attack: 'Trong lượt của bạn: bấm lá này để chơi 3 lượt liên tiếp.',
  skip: 'Trong lượt của bạn: bấm lá này để kết thúc lượt mà không rút bài.',
  super_skip: 'Trong lượt của bạn: bấm lá này để kết thúc lượt mà không rút bài; nếu đang phải chơi nhiều lượt thì kết thúc tất cả. Có hiệu lực ngay, không ai Nope được (luật nhà).',
  reverse: 'Trong lượt của bạn: bấm lá này để đảo ngược chiều vòng chơi và kết thúc lượt mà không rút bài.',
  draw_bottom: 'Trong lượt của bạn: bấm lá này để kết thúc lượt bằng cách rút lá dưới đáy chồng bài rút.',
  catomic_bomb: 'Trong lượt của bạn: bấm lá này để lấy hết Mèo Nổ ra, xáo chồng bài rồi úp tất cả Mèo Nổ lên trên cùng. Lượt của bạn kết thúc.',
  swap_top_bottom: 'Trong lượt của bạn: bấm lá này để đổi chỗ lá trên cùng và lá dưới đáy chồng bài rút.',
  bury: 'Trong lượt của bạn: bấm lá này để rút 1 lá rồi bí mật nhét nó lại vào chồng bài (như khi Gỡ Bom, không bị nổ). Lượt của bạn kết thúc.',
  garbage_collection: 'Trong lượt của bạn: bấm lá này, mọi người (kể cả bạn) tự chọn 1 lá trên tay để xáo vào chồng bài rút.',
  shuffle: 'Trong lượt của bạn: bấm lá này rồi chọn kiểu xáo để xáo chồng bài rút.',
  see_future: '', // Filled from the room's preview count below.
  alter_future: '', // Filled from the room's preview count below.
  share_future: '', // Filled from the room's preview count below.
  dig_deeper: 'Trong lượt của bạn: bấm lá này để rút 1 lá và xem; chọn giữ lá đó, hoặc úp nó lại lên trên và rút lá kế tiếp (bắt buộc giữ).',
  favor: 'Trong lượt của bạn: bấm lá này rồi chọn 1 người chơi có bài. Người đó tự chọn 1 lá trên tay đưa cho bạn.',
  mark: 'Trong lượt của bạn: bấm lá này rồi chọn 1 người chơi để cướp ngẫu nhiên 1 lá của họ (bạn bốc 1 lá trong bài úp đã xáo vị trí).',
  grave_robber: 'Trong lượt của bạn: bấm lá này, mọi người chơi đã chết còn bài trên tay phải chọn 1 lá để xáo vào chồng bài rút.',
  nope: '', // Filled from the room's Nope window and chaining setting below.
  clone: 'Trong lượt của bạn: bấm lá này để nó trở thành lá nằm trên đỉnh chồng bài bỏ (chỉ đánh được khi lá đó là lá chức năng).',
  feral_cat: 'Dùng như bất kỳ lá mèo thường nào: ghép với mèo khác thành Đôi (hoặc Bộ ba nếu phòng cho phép).',
  cat_potato: '',
  cat_melon: '',
  cat_bladder: '',
  cat_schrodinger: '',
  cat_beard: '',
};
function howToPlay(type: CardType, rules: RoomRules) {
  let text = HOW[type];
  if (type === 'defuse') text = `Game tự dùng khi bạn rút trúng Mèo Nổ, sau đó ${rules.bombPlacement === 'choose' ? 'bạn chọn vị trí nhét bom lại' : 'bom được nhét lại ở vị trí ngẫu nhiên'}.`;
  if (type === 'see_future') text = `Trong lượt của bạn: bấm lá để bí mật xem tối đa ${rules.futureCount} lá trên cùng.`;
  if (type === 'alter_future') text = `Trong lượt của bạn: bấm lá để bí mật xem và sắp xếp lại tối đa ${rules.futureCount} lá trên cùng.`;
  if (type === 'share_future') text = `Trong lượt của bạn: bấm lá để xem và sắp xếp tối đa ${rules.futureCount} lá trên cùng rồi cho người chơi kế tiếp xem các lá đó.`;
  if (type === 'nope') text = `Khi có người đánh bài, bấm lá này hoặc nút NOPE! trong ${rules.nopeSeconds} giây, kể cả ngoài lượt. ${rules.nopeChain ? 'Bạn có thể Nope lại một lá Nope.' : 'Mỗi hành động chỉ được Nope một lần.'}`;
  const canMatch = CARD_INFO[type].isCat || (rules.comboScope === 'any' && type !== 'exploding');
  const combos: string[] = [];
  if (canMatch && rules.allowPair) combos.push('2 lá cùng loại (hoặc ghép với Mèo Hoang) để cướp ngẫu nhiên 1 lá của đối thủ');
  if (canMatch && rules.allowTriple) combos.push('3 lá cùng loại (hoặc ghép với Mèo Hoang) để đòi đúng lá muốn');
  if (type !== 'exploding' && rules.allowFive) combos.push('5 lá khác tên nhau để lấy 1 lá bất kỳ trong chồng bài bỏ');
  if (combos.length) text += `${text ? ' ' : ''}Combo được phép: ${combos.join('; ')}. Dùng “Chọn nhiều lá” để chọn combo.`;
  if (!text) text = 'Phòng này đã tắt các combo dùng được với lá này. Bạn vẫn có thể đưa lá khi bị Xin Bài.';
  return text;
}

export function CardPreviewLayer() {
  const rules = useRoomRules();
  const playerCount = useRoomPlayerCount();
  const p = useSyncExternalStore(store.sub, store.get, store.get);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: string } | null>(null);

  useLayoutEffect(() => {
    if (!p || !boxRef.current) {
      setPos(null);
      return;
    }
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (vw < 640) {
      boxRef.current.classList.add('side-sheet');
    }
    const w = boxRef.current.offsetWidth;
    const h = boxRef.current.offsetHeight;
    const r = p.rect;
    const gap = 14;
    const clampX = (x: number) => Math.min(Math.max(8, x), Math.max(8, vw - w - 8));
    const clampY = (y: number) => Math.min(Math.max(8, y), Math.max(8, vh - h - 8));
    const midX = r.left + r.width / 2 - w / 2;
    const midY = r.top + r.height / 2 - h / 2;
    let next: { left: number; top: number; side: string };
    if (vw < 640) next = { left: clampX((vw - w) / 2), top: clampY(r.top > vh / 2 ? r.top - h - gap : r.bottom + gap), side: 'sheet' };
    else if (r.top + r.height / 2 > vh * 0.55 && r.top - h - gap > 8) next = { left: clampX(midX), top: r.top - h - gap, side: 'above' };
    else if (r.right + gap + w < vw - 8) next = { left: r.right + gap, top: clampY(midY), side: 'right' };
    else if (r.left - gap - w > 8) next = { left: r.left - gap - w, top: clampY(midY), side: 'left' };
    else next = { left: clampX(midX), top: clampY(r.bottom + gap), side: 'below' };
    setPos(next);
  }, [p, rules, playerCount]);

  useLayoutEffect(() => {
    if (!p) return;
    const close = () => store.set(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('blur', close);
    };
  }, [p]);

  if (!p) return null;
  const info = CARD_INFO[p.type];
  const deck = playerCount === undefined ? undefined : roomDeckSummary(rules, playerCount);
  const count = p.type === 'exploding'
    ? deck ? `${deck.bombs} lá` : rules.bombMode === 'fixed' ? `${rules.fixedBombs} lá` : rules.bombMode === 'players' ? 'bằng số người chơi' : 'ít hơn số người chơi 1 lá'
    : p.type === 'defuse'
      ? deck ? `${deck.defuses} lá (${rules.defusesPerPlayer}/người + ${rules.extraDefuses} trong chồng rút)` : `${rules.defusesPerPlayer}/người + ${rules.extraDefuses} trong chồng rút`
      : `${rules.cardCounts[p.type as DeckCardType]} lá`;
  const isMobile = typeof document !== 'undefined' && document.documentElement.clientWidth < 640;
  return (
    <div
      ref={boxRef}
      className={`card-preview side-${pos?.side ?? (isMobile ? 'sheet' : 'none')}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, ['--c' as string]: info.color }}
      role="tooltip"
    >
      <CardView type={p.type} seed={p.seed} size="xl" className="preview-card" preview={false} />
      <div className="preview-info">
        <div className="preview-name">
          <CardIcon type={p.type} size={20} /> {info.name}
        </div>
        <div className="preview-section">
          <span className="preview-label">Tác dụng</span>
          <p>{describeCard(p.type, rules)}</p>
        </div>
        <div className="preview-section">
          <span className="preview-label">Cách đánh</span>
          <p>{howToPlay(p.type, rules)}</p>
        </div>
        <div className="preview-meta">
          <span>
            <Package size={13} className="inline-icon" /> Trong bộ: {count}
          </span>
          {info.isCat && (
            <span>
              <Cat size={13} className="inline-icon" /> Mèo thường
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
