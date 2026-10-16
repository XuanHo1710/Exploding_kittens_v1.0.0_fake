/**
 * Giữ chuột (hoặc nhấn giữ trên điện thoại) vào lá bài → phóng to + giải thích luật bên cạnh.
 * CardView gắn trigger, App/Demo render <CardPreviewLayer /> đúng 1 lần.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react';
import { CARD_INFO, DECK_COUNTS, type CardType } from '../../../shared/src';
import CardView from './CardView';

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
  defuse: 'Không cần bấm đánh: game tự dùng khi bạn rút trúng Mèo Nổ, rồi cho bạn chọn chỗ nhét bom lại.',
  attack: 'Trong lượt của bạn: chọn lá này rồi bấm "Đánh ra". Bạn không phải rút bài.',
  skip: 'Trong lượt của bạn: chọn lá này rồi bấm "Đánh ra" để kết thúc lượt mà không rút. Hay dùng khi nghi lá trên cùng là bom.',
  favor: 'Trong lượt của bạn: chọn lá, bấm vào avatar người muốn xin rồi "Đánh ra". Người đó tự chọn lá đưa bạn.',
  shuffle: 'Trong lượt của bạn: chọn lá rồi "Đánh ra". Dùng khi biết bom nằm trên cùng để phá vị trí.',
  see_future: 'Trong lượt của bạn: chọn lá rồi "Đánh ra". Chỉ mình bạn thấy 3 lá trên cùng.',
  nope: 'Bất cứ lúc nào có người vừa đánh bài (kể cả ngoài lượt): bấm nút NOPE! đỏ giữa bàn trong 4 giây.',
  cat_potato: '',
  cat_melon: '',
  cat_bladder: '',
  cat_schrodinger: '',
  cat_beard: '',
};
const CAT_HOW = 'Chọn 2 lá giống nhau (đôi) để cướp ngẫu nhiên 1 lá, hoặc 3 lá giống nhau (bộ ba) để đòi đúng lá bạn muốn. Bấm vào avatar để chọn người.';

export function CardPreviewLayer() {
  const p = useSyncExternalStore(store.sub, store.get, store.get);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: string } | null>(null);

  useLayoutEffect(() => {
    if (!p || !boxRef.current) {
      setPos(null);
      return;
    }
    // offsetWidth/Height: kích thước thật, không bị animation scale làm lệch
    const w = boxRef.current.offsetWidth;
    const h = boxRef.current.offsetHeight;
    // clientWidth: không tính thanh cuộn
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const r = p.rect;
    const gap = 14;
    const clampX = (x: number) => Math.min(Math.max(8, x), vw - w - 8);
    const clampY = (y: number) => Math.min(Math.max(8, y), vh - h - 8);
    const midX = r.left + r.width / 2 - w / 2;
    const midY = r.top + r.height / 2 - h / 2;
    let next: { left: number; top: number; side: string };
    if (vw < 640) next = { left: clampX((vw - w) / 2), top: clampY(r.top > vh / 2 ? r.top - h - gap : r.bottom + gap), side: 'sheet' };
    else if (r.top + r.height / 2 > vh * 0.55 && r.top - h - gap > 8) next = { left: clampX(midX), top: r.top - h - gap, side: 'above' };
    else if (r.right + gap + w < vw - 8) next = { left: r.right + gap, top: clampY(midY), side: 'right' };
    else if (r.left - gap - w > 8) next = { left: r.left - gap - w, top: clampY(midY), side: 'left' };
    else next = { left: clampX(midX), top: clampY(r.bottom + gap), side: 'below' };
    setPos(next);
  }, [p]);

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
  const count =
    p.type === 'exploding' ? 'mỗi người 1 lá (trong chồng bài)' : p.type === 'defuse' ? 'mỗi người 1 lá' : `${DECK_COUNTS[p.type as keyof typeof DECK_COUNTS]} lá`;
  return (
    <div
      ref={boxRef}
      className={`card-preview side-${pos?.side ?? 'none'}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, ['--c' as string]: info.color }}
      role="tooltip"
    >
      <CardView type={p.type} seed={p.seed} size="xl" className="preview-card" preview={false} />
      <div className="preview-info">
        <div className="preview-name">
          <span>{info.emoji}</span> {info.name}
        </div>
        <div className="preview-section">
          <span className="preview-label">Tác dụng</span>
          <p>{info.desc}</p>
        </div>
        <div className="preview-section">
          <span className="preview-label">Cách đánh</span>
          <p>{info.isCat ? CAT_HOW : HOW[p.type]}</p>
        </div>
        <div className="preview-meta">
          <span>📦 Trong bộ: {count}</span>
          {info.isCat && <span>🐱 Mèo thường</span>}
        </div>
      </div>
    </div>
  );
}
