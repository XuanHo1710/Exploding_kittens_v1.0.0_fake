/**
 * Bàn nối hình 16×9: sinh bàn luôn giải được, tìm đường nối gấp khúc ≤ 2 lần (được vòng ra ngoài mép),
 * gợi ý, xáo bàn và đóng băng ô.
 */
import { LINK_CELLS, LINK_H, LINK_KINDS, LINK_MAX_TURNS, LINK_W } from '../../../../shared/src';

/** Lưới có viền 1 ô quanh bàn để đường nối đi vòng ngoài mép */
const PW = LINK_W + 2;
const PH = LINK_H + 2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export type Rng = () => number;

/** mulberry32: cùng seed thì cùng chuỗi số */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toP = (i: number) => (Math.floor(i / LINK_W) + 1) * PW + (i % LINK_W) + 1;
const fromP = (p: number): [number, number] => [(p % PW) - 1, Math.floor(p / PW) - 1];
const pIdx = (p: number) => {
  const [x, y] = fromP(p);
  return x < 0 || y < 0 || x >= LINK_W || y >= LINK_H ? -1 : y * LINK_W + x;
};

export class LinkBoard {
  cells = new Int8Array(LINK_CELLS).fill(-1);
  /** ô → thời điểm (ms trận) hết băng */
  ice = new Map<number, number>();

  constructor(private rng: Rng) {}

  /**
   * Bàn mới: xếp ngẫu nhiên (theo seed) rồi tự giải thử, lấy bàn đầu tiên giải trọn được không cần xáo.
   * Khoảng 1/3 số bàn ngẫu nhiên đạt nên thường chỉ mất vài lần thử (~10 ms mỗi lần).
   */
  static generate(seed: number): LinkBoard {
    const b = new LinkBoard(makeRng(seed));
    const kinds: number[] = [];
    for (let k = 0; k < LINK_KINDS; k++) kinds.push(k, k, k, k);
    for (let attempt = 0; attempt < 60; attempt++) {
      b.shuffled(kinds).forEach((k, i) => (b.cells[i] = k));
      if (b.solvable()) return b;
    }
    // rất hiếm: dùng bàn cuối, trong trận sẽ tự xáo khi kẹt
    b.ensureMove(0);
    return b;
  }

  /** Giải thử trên bản sao bằng gợi ý: dọn sạch được là bàn giải được */
  private solvable(): boolean {
    const c = new LinkBoard(this.rng);
    c.cells.set(this.cells);
    for (let guard = 0; guard < LINK_CELLS; guard++) {
      if (c.isEmpty()) return true;
      const h = c.hint(0);
      if (!h) return false;
      c.remove(h[0], h[1]);
    }
    return c.isEmpty();
  }

  /** Đặt lần lượt từng cặp vào 2 ô trống nối được với nhau (bàn lúc đó) – đi ngược lại là một lời giải */
  private placePairs(pairKinds: number[]): boolean {
    // Lấp từ giữa ra ngoài (có xáo trộn): các ô trống còn lại về cuối nằm sát mép nên vẫn nối được vòng qua viền
    const depth = (i: number) => {
      const x = i % LINK_W, y = Math.floor(i / LINK_W);
      return Math.min(x, y, LINK_W - 1 - x, LINK_H - 1 - y);
    };
    const rank = (i: number) => depth(i) + this.rng() * 2.2;
    for (const k of pairKinds) {
      const empties = this.emptyCells()
        .map((i) => [i, rank(i)] as const)
        .sort((p, q) => q[1] - p[1])
        .map(([i]) => i);
      let placed = false;
      for (let t = 0; t < empties.length && t < 24 && !placed; t++) {
        const c1 = empties[t];
        const targets = this.reachable(c1)
          .filter((c) => c !== c1)
          .map((i) => [i, rank(i)] as const)
          .sort((p, q) => q[1] - p[1]);
        if (!targets.length) continue;
        // chọn trong vài ô "sâu" nhất để bàn vẫn đa dạng
        const c2 = targets[Math.floor(this.rng() * Math.min(4, targets.length))][0];
        this.cells[c1] = k;
        this.cells[c2] = k;
        placed = true;
      }
      if (!placed) return false;
    }
    return true;
  }

  private emptyCells() {
    const out: number[] = [];
    for (let i = 0; i < LINK_CELLS; i++) if (this.cells[i] < 0) out.push(i);
    return out;
  }

  private shuffled<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private passable(p: number) {
    const i = pIdx(p);
    return i < 0 || this.cells[i] < 0;
  }

  /**
   * BFS theo số đoạn thẳng: từ ô xuất phát đi thẳng 4 hướng qua ô trống; mỗi lần đổi hướng là thêm 1 đoạn.
   * Trả về số đoạn ít nhất tới từng ô (lưới có viền) và ô bắt đầu đoạn cuối (để dựng lại đường).
   */
  private bfs(start: number, target?: number) {
    const segs = new Int8Array(PW * PH).fill(127);
    const from = new Int32Array(PW * PH).fill(-1);
    segs[start] = 0;
    let frontier = [start];
    for (let s = 1; s <= LINK_MAX_TURNS + 1 && frontier.length; s++) {
      const next: number[] = [];
      for (const p of frontier) {
        const px = p % PW, py = Math.floor(p / PW);
        for (const [dx, dy] of DIRS) {
          let x = px + dx, y = py + dy;
          while (x >= 0 && y >= 0 && x < PW && y < PH) {
            const q = y * PW + x;
            if (q === target) {
              if (segs[q] > s) { segs[q] = s; from[q] = p; }
              break;
            }
            if (!this.passable(q)) break;
            if (segs[q] > s) {
              segs[q] = s;
              from[q] = p;
              next.push(q);
            }
            x += dx;
            y += dy;
          }
        }
      }
      frontier = next;
    }
    return { segs, from };
  }

  /** Các ô trống nối được từ ô c (dùng khi sinh bàn) */
  private reachable(c: number): number[] {
    const { segs } = this.bfs(toP(c));
    const out: number[] = [];
    for (let p = 0; p < segs.length; p++) {
      if (segs[p] > LINK_MAX_TURNS + 1) continue;
      const i = pIdx(p);
      if (i >= 0 && this.cells[i] < 0) out.push(i);
    }
    return out;
  }

  frozen(i: number, now: number) {
    const t = this.ice.get(i);
    return t !== undefined && t > now;
  }

  /** Đường nối a → b (các điểm gấp khúc [x, y], viền là -1 hoặc W/H) hoặc null */
  findPath(a: number, b: number, now: number): [number, number][] | null {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return null;
    if (a < 0 || b < 0 || a >= LINK_CELLS || b >= LINK_CELLS) return null;
    const k = this.cells[a];
    if (k < 0 || this.cells[b] !== k) return null;
    if (this.frozen(a, now) || this.frozen(b, now)) return null;
    const pa = toP(a), pb = toP(b);
    const { segs, from } = this.bfs(pa, pb);
    if (segs[pb] > LINK_MAX_TURNS + 1) return null;
    const pts: [number, number][] = [fromP(pb)];
    let p = pb;
    while (p !== pa) {
      p = from[p];
      pts.push(fromP(p));
    }
    return pts.reverse();
  }

  static pathLength(path: [number, number][]) {
    let n = 0;
    for (let i = 1; i < path.length; i++) n += Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]);
    return n;
  }

  remove(a: number, b: number) {
    this.cells[a] = -1;
    this.cells[b] = -1;
    this.ice.delete(a);
    this.ice.delete(b);
  }

  /** Một cặp nối được ngay bây giờ (bỏ qua ô băng) */
  hint(now: number, ignoreIce = false): [number, number] | undefined {
    const byKind = new Map<number, number[]>();
    for (let i = 0; i < LINK_CELLS; i++) {
      const k = this.cells[i];
      if (k < 0 || (!ignoreIce && this.frozen(i, now))) continue;
      let a = byKind.get(k);
      if (!a) byKind.set(k, (a = []));
      a.push(i);
    }
    // bỏ qua băng: coi như đã tan hết (thời điểm vô cùng xa)
    const t = ignoreIce ? Infinity : now;
    for (const list of byKind.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) if (this.findPath(list[i], list[j], t)) return [list[i], list[j]];
      }
    }
    return undefined;
  }

  hasMove(now: number) {
    return !!this.hint(now);
  }

  remaining() {
    let n = 0;
    for (let i = 0; i < LINK_CELLS; i++) if (this.cells[i] >= 0) n++;
    return n;
  }

  isEmpty() {
    return this.remaining() === 0;
  }

  /** Xáo loại thú giữa các ô còn hình (vị trí giữ nguyên) */
  shuffle() {
    const pos: number[] = [];
    for (let i = 0; i < LINK_CELLS; i++) if (this.cells[i] >= 0) pos.push(i);
    const kinds = this.shuffled(pos.map((i) => this.cells[i]));
    pos.forEach((i, n) => (this.cells[i] = kinds[n]));
  }

  /**
   * Bảo đảm còn nước đi. Nếu chỉ vì ô băng mà kẹt thì chờ băng tan (không xáo).
   * Trả về true nếu đã phải xáo.
   */
  ensureMove(now: number): boolean {
    if (this.isEmpty() || this.hint(now, true)) return false;
    for (let i = 0; i < 30; i++) {
      this.shuffle();
      if (this.hint(now, true)) return true;
    }
    // vẫn kẹt (rất hiếm, khi còn ít ô): dồn các ô còn lại về chỗ mới bằng cách xếp ngược
    const kinds: number[] = [];
    for (let i = 0; i < LINK_CELLS; i++) if (this.cells[i] >= 0) kinds.push(this.cells[i]);
    kinds.sort((x, y) => x - y);
    const pairKinds: number[] = [];
    for (let i = 0; i < kinds.length; i += 2) pairKinds.push(kinds[i]);
    for (let attempt = 0; attempt < 50; attempt++) {
      this.cells.fill(-1);
      this.ice.clear();
      if (this.placePairs(this.shuffled(pairKinds))) return true;
    }
    return true;
  }

  /** Đóng băng n ô còn hình (chưa băng) trong ms */
  freeze(n: number, ms: number, now: number): number[] {
    const cand: number[] = [];
    for (let i = 0; i < LINK_CELLS; i++) if (this.cells[i] >= 0 && !this.frozen(i, now)) cand.push(i);
    const pick = this.shuffled(cand).slice(0, n);
    for (const i of pick) this.ice.set(i, now + ms);
    return pick;
  }

  /** Xoá băng đã tan */
  thaw(now: number) {
    for (const [i, t] of this.ice) if (t <= now) this.ice.delete(i);
  }

  filledBits(): number[] {
    return Array.from(this.cells, (k) => (k >= 0 ? 1 : 0));
  }

  iceList(now: number): [number, number][] {
    const out: [number, number][] = [];
    for (const [i, t] of this.ice) if (t > now) out.push([i, t - now]);
    return out;
  }
}
