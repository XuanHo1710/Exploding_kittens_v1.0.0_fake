/**
 * Kho trạng thái của bảng xem trước lá bài + hook gắn vào lá bài.
 * Tách riêng khỏi CardPreview.tsx để sửa nội dung bảng (Fast Refresh) không tạo ra kho mới,
 * khiến các lá đang hiện trên màn hình vẫn gửi vào kho cũ và hover không hiện gì nữa.
 */
import { useEffect, useRef, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent } from 'react';
import type { CardType } from '../../../shared/src';

export interface Preview {
  type: CardType;
  seed?: string | number;
  rect: DOMRect;
  owner: object;
}

let current: Preview | null = null;
const subs = new Set<() => void>();
export const store = {
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
