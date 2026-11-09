/**
 * Kho trạng thái Nối Thú phía client: giữ gói `link:state` mới nhất và hàng đợi hiệu ứng (có thời điểm bắt đầu).
 */
import type { LinkFx, LinkState } from '../../../shared/src';
import { playLinkSounds } from './sound';

export interface FxItem {
  fx: LinkFx;
  t0: number;
}

type Listener = () => void;

class LinkStore {
  state?: LinkState;
  /** performance.now() lúc nhận gói mới nhất (để đếm giờ mượt) */
  at = 0;
  fx: FxItem[] = [];
  /** ô vừa gửi lệnh nối, ẩn tạm cho tới gói kế tiếp (cảm giác tức thì) */
  pending = new Set<number>();
  /** ô nối sai: rung đỏ tới thời điểm này */
  miss = new Map<number, number>();
  /** boss bị đánh lần cuối (để giật lùi) */
  bossHitAt = 0;
  private key = '';
  private listeners = new Set<Listener>();

  reset(key: string) {
    if (this.key === key) return;
    this.key = key;
    this.state = undefined;
    this.fx = [];
    this.pending.clear();
    this.miss.clear();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  push(st: LinkState) {
    if (this.state && st.seq <= this.state.seq) return;
    const now = performance.now();
    this.state = st;
    this.at = now;
    this.pending.clear();
    for (const fx of st.fx) {
      this.fx.push({ fx, t0: now });
      if (fx.k === 'miss') {
        this.miss.set(fx.a, now + 380);
        this.miss.set(fx.b, now + 380);
      }
      if (fx.k === 'hit' || fx.k === 'super') this.bossHitAt = now;
    }
    if (this.fx.length > 120) this.fx = this.fx.slice(-120);
    playLinkSounds(st);
    this.listeners.forEach((l) => l());
  }

  /** ms còn lại của màn, đếm lùi mượt theo đồng hồ máy */
  left(now = performance.now()) {
    const st = this.state;
    if (!st) return 0;
    return Math.max(0, st.left - (st.stage === 'ended' ? 0 : now - this.at));
  }
}

export const linkStore = new LinkStore();
