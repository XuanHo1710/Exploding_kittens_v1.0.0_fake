/**
 * Giữ chuột (hoặc nhấn giữ trên điện thoại) vào lá bài → phóng to + giải thích luật bên cạnh.
 * CardView gắn trigger, App/Demo render <CardPreviewLayer /> đúng 1 lần.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react';
import { Cat, Package } from 'lucide-react';
import { CARD_INFO, describeCard, roomDeckSummary, type CardType, type DeckCardType, type RoomRules } from '../../../shared/src';
import { useRoomPlayerCount, useRoomRules } from '../roomRulesContext';
import CardView from './CardView';
import { CardIcon } from './icons';

interface Preview {
  type: CardType;
  seed?: string | number;
  rect: DOMRect;
  owner: object;
}

let current: Preview | null = null;
const subs = new Set<() => void>();
const store = {
  get: () => current,
  set(p: Preview | null) {
    current = p;
    subs.forEach((f) => f());
  },
  sub(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
};

/** Tắt bảng xem trước (khi mở hộp thoại, bấm chuột…) */
export const hidePreview = () => store.set(null);

const HOVER_MS = 350;
const PRESS_MS = 420;

/** Gắn vào phần tử lá bài */
export function usePreviewTrigger(type: CardType, seed: string | number | undefined, enabled: boolean) {
  const owner = useRef({}).current;
  const timer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);

  // lá trong hộp thoại thì không phóng to (tránh che nút); lá đã biến mất thì không hiện nữa
  const show = (el: Element) => {
    if (!el.isConnected || el.closest('.modal, .reveal, .throw-menu')) return;
    store.set({ type, seed, rect: el.getBoundingClientRect(), owner });
  };
  const hide = () => {
    clearTimeout(timer.current);
    if (store.get()?.owner === owner) store.set(null);
  };
  // lá bị gỡ khỏi màn hình (đánh ra, bị lấy…) trong lúc đang xem → tắt bảng, không để kẹt
  useEffect(() => hide, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return {};
  return {
    onPointerEnter: (e: RPointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.currentTarget;
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => show(el), HOVER_MS);
    },
    onPointerLeave: hide,
    onPointerDown: (e: RPointerEvent) => {
      if (e.pointerType === 'mouse') return;
      const el = e.currentTarget;
      longPressed.current = false;
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        longPressed.current = true;
        show(el);
      }, PRESS_MS);
    },
    onPointerUp: (e: RPointerEvent) => {
      if (e.pointerType !== 'mouse') hide();
    },
    onPointerCancel: hide,
    // nhấn giữ để xem thì không tính là bấm chọn lá
    onClickCapture: (e: RMouseEvent) => {
      if (longPressed.current) {
        e.preventDefault();
        e.stopPropagation();
        longPressed.current = false;
      }
    },
    onContextMenu: (e: RMouseEvent) => {
      if (longPressed.current) e.preventDefault();
    },
  };
}

/** Hướng dẫn cách dùng từng lá */
const HOW: Record<CardType, string> = {
  exploding: 'Không đánh được. Rút trúng là phải dùng Gỡ Bom ngay, không có thì bị loại.',
  defuse: '', // Filled from the room's bomb placement setting below.
  attack: 'Trong lượt của bạn: bấm lá này để kết thúc lượt ngay mà không cần rút bài, ép người kế tiếp chơi 2 lượt.',
  targeted_attack: 'Trong lượt của bạn: bấm lá này rồi chọn 1 người bất kỳ trên bàn để ép người đó phải chơi 2 lượt.',
  personal_attack: 'Trong lượt của bạn: bấm lá này để tự nhận 3 lượt liên tiếp (dùng khi muốn rút nhiều bài an toàn hoặc gánh thay).',
  skip: 'Trong lượt của bạn: bấm lá này để kết thúc 1 lượt ngay mà không phải rút bài. Hay dùng khi nghi lá trên cùng là bom.',
  super_skip: 'Trong lượt của bạn: bấm lá này để kết thúc TOÀN BỘ số lượt bạn đang phải đi (kể cả khi bị Tấn Công cộng dồn) mà không rút bài.',
  reverse: 'Trong lượt của bạn: bấm lá này để đảo ngược chiều vòng chơi và kết thúc 1 lượt của bạn mà không cần rút bài.',
  draw_bottom: 'Trong lượt của bạn: bấm lá này để rút 1 lá dưới ĐÁY chồng bài thay vì lá trên cùng, rồi kết thúc 1 lượt ngay.',
  catomic_bomb: 'Trong lượt của bạn: bấm lá này để gom TẤT CẢ Mèo Nổ trong chồng rút đặt ngửa lên ĐẦU chồng bài, xáo phần còn lại và kết thúc 1 lượt không cần rút!',
  swap_top_bottom: 'Trong lượt của bạn: bấm lá này để tráo đổi vị trí lá trên cùng và lá dưới đáy chồng bài (chưa kết thúc lượt, cực hợp khi đi kèm Rút Đáy).',
  bury: 'Trong lượt của bạn: bấm lá này để bí mật xem lá trên cùng rồi chôn nó vào giữa chồng rút (không kích nổ), kết thúc 1 lượt.',
  garbage_collection: 'Trong lượt của bạn: bấm lá này để buộc mọi người còn sống bỏ 1 lá trên tay vào lại chồng bài rồi xáo đều.',
  shuffle: 'Trong lượt của bạn: bấm lá này rồi chọn kiểu xáo bài để đảo ngẫu nhiên vị trí Mèo Nổ trong chồng rút.',
  see_future: '', // Filled from the room's preview count below.
  alter_future: '', // Filled from the room's preview count below.
  share_future: '', // Filled from the room's preview count below.
  dig_deeper: 'Trong lượt của bạn: bấm lá này để đào sâu né Mèo Nổ nếu lá đầu là bom và rút bài kết thúc 1 lượt.',
  favor: 'Trong lượt của bạn: bấm lá này rồi chọn 1 người chơi có bài. Người đó tự chọn 1 lá trên tay đưa cho bạn.',
  mark: 'Trong lượt của bạn: bấm lá này rồi chọn 1 người chơi rồi tự bốc 1 lá trong bài úp (đã xáo vị trí) của họ về tay bạn.',
  grave_robber: 'Trong lượt của bạn: bấm lá này rồi chọn 1 lá bài bất kỳ đang nằm trong chồng bài bỏ để lấy về tay.',
  nope: '', // Filled from the room's Nope window and chaining setting below.
  clone: 'Đánh lẻ để sao chép hiệu ứng lá chức năng vừa có hiệu lực; hoặc dùng kèm các lá mèo để ghép thành Đôi (2 lá) / Bộ ba (3 lá) cướp bài đối thủ.',
  feral_cat: 'Mèo Hoang đa năng: ghép chung với bất kỳ lá mèo nào khác để tạo thành Đôi (2 lá) hoặc Bộ ba (3 lá) cướp bài.',
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
  if (type === 'alter_future') text = `Trong lượt của bạn: bấm lá để xem và sắp xếp tối đa ${rules.futureCount} lá trên cùng (tự động đẩy Mèo Nổ xuống dưới cho bạn).`;
  if (type === 'share_future') text = `Trong lượt của bạn: bấm lá để xem và sắp xếp tối đa ${rules.futureCount} lá trên cùng rồi chia sẻ cho người chơi kế tiếp cùng biết.`;
  if (type === 'nope') text = `Khi có người đánh bài, bấm lá này hoặc nút NOPE! trong ${rules.nopeSeconds} giây, kể cả ngoài lượt. ${rules.nopeChain ? 'Bạn có thể Nope lại một lá Nope.' : 'Mỗi hành động chỉ được Nope một lần.'}`;
  const canMatch = CARD_INFO[type].isCat || (rules.comboScope === 'any' && type !== 'exploding');
  const combos: string[] = [];
  if (canMatch && rules.allowPair) combos.push('2 lá cùng loại (hoặc ghép với Mèo Hoang / Sao Chép) để bốc 1 lá úp của đối thủ');
  if (canMatch && rules.allowTriple) combos.push('3 lá cùng loại (hoặc ghép với Mèo Hoang / Sao Chép) để đòi đúng lá muốn');
  if (type !== 'exploding' && rules.allowFive) combos.push('5 lá khác loại để lấy 1 lá trong chồng bài bỏ');
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
