/**
 * Lô Tô Cân Đồ (tối đa 10 người): máy gọi 1 số (1–90) mỗi 5 giây, ai có đủ 5 số trên 1 hàng ngang trước là KINH – ăn cả hũ.
 * Mỗi tờ 9 hàng × 9 cột (3 khối × 3 hàng), mỗi hàng đúng 5 số; cột theo chục: cột 0 = 1–9, cột 1 = 10–19 … cột 8 = 80–90.
 * Mua 2 tờ thì 2 tờ ghép lại chứa đủ 90 số, mỗi số đúng 1 lần, rải đều giữa 2 tờ.
 * File dùng chung cho server (luật) và client (vẽ).
 */

export const LOTO_ROWS = 9;
export const LOTO_COLS = 9;
export const LOTO_PER_ROW = 5;
export const LOTO_MAX = 90;
/** Giá 1 tờ (xu); mua 2 tờ = 100 xu */
export const LOTO_SHEET_PRICE = 50;
export const LOTO_MAX_SHEETS = 2;
/** Máy gọi số mới mỗi 5 giây */
export const LOTO_CALL_MS = 5000;
/** Chờ chút cho mọi người xem tờ trước khi gọi số đầu tiên */
export const LOTO_FIRST_CALL_MS = 3000;

export type LotoColor = 'blue' | 'red' | 'purple' | 'green' | 'orange' | 'yellow' | 'pink';
export const LOTO_COLORS: Record<LotoColor, { name: string; main: string; soft: string; deep: string }> = {
  blue: { name: 'Xanh', main: '#1c7ed6', soft: '#a5d8ff', deep: '#0b3d91' },
  red: { name: 'Đỏ', main: '#e03131', soft: '#ffa8a8', deep: '#7d0a0a' },
  purple: { name: 'Tím', main: '#7048e8', soft: '#d0bfff', deep: '#3b1f8f' },
  green: { name: 'Xanh lá', main: '#2f9e44', soft: '#b2f2bb', deep: '#14532d' },
  orange: { name: 'Cam', main: '#f76707', soft: '#ffd8a8', deep: '#7c2d12' },
  yellow: { name: 'Vàng', main: '#f2b705', soft: '#ffec99', deep: '#6b4e00' },
  pink: { name: 'Hồng', main: '#e64980', soft: '#fcc2d7', deep: '#7a1c3f' },
};
/** thứ tự hiện ở bảng chọn màu; 3 màu đầu là màu mặc định */
export const LOTO_COLOR_ORDER: LotoColor[] = ['blue', 'red', 'purple', 'green', 'orange', 'yellow', 'pink'];

/** Màu mặc định cho người thứ i (2 tờ khác màu nhau) */
export const lotoDefaultColors = (i: number): LotoColor[] => [LOTO_COLOR_ORDER[i % 3], LOTO_COLOR_ORDER[(i + 1) % 3]];

/** Chuẩn hoá màu người chơi chọn cho từng tờ (được trùng màu); màu lạ thì dùng màu mặc định */
export function normalizeLotoColors(raw: unknown, fallback: LotoColor[]): LotoColor[] {
  const arr = Array.isArray(raw) ? raw : [];
  return [0, 1].map((k) => (typeof arr[k] === 'string' && Object.hasOwn(LOTO_COLORS, arr[k]) ? (arr[k] as LotoColor) : fallback[k]));
}

export interface LotoSheet {
  color: LotoColor;
  /** 9 hàng × 9 cột, 0 = ô trống */
  rows: number[][];
}

/** Cột của một số: 1–9 → 0, 10–19 → 1 … 80–90 → 8 */
export const lotoColOf = (n: number) => (n >= 80 ? 8 : Math.floor(n / 10));
const colRange = (c: number): [number, number] => (c === 0 ? [1, 9] : c === 8 ? [80, 90] : [c * 10, c * 10 + 9]);

type Rng = () => number;

function shuffled<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Xếp ô có số cho 1 tờ: mỗi hàng đúng 5 ô, cột c có đúng targets[c] ô.
 * Đi từng hàng: cột còn thiếu bằng số hàng còn lại thì bắt buộc chọn, còn lại bốc ngẫu nhiên theo độ thiếu
 * (luôn giải được vì tổng còn thiếu = 5 × số hàng còn lại và không cột nào thiếu quá số hàng còn lại).
 */
function layoutSheet(targets: number[], rng: Rng): boolean[][] {
  const need = [...targets];
  const grid: boolean[][] = [];
  for (let r = 0; r < LOTO_ROWS; r++) {
    const left = LOTO_ROWS - r;
    const chosen = new Set<number>();
    for (let c = 0; c < LOTO_COLS; c++) if (need[c] >= left && need[c] > 0) chosen.add(c);
    while (chosen.size < LOTO_PER_ROW) {
      const cand = [];
      for (let c = 0; c < LOTO_COLS; c++) if (need[c] > 0 && !chosen.has(c)) cand.push(c);
      const total = cand.reduce((s, c) => s + need[c], 0);
      let x = rng() * total;
      let pick = cand[cand.length - 1];
      for (const c of cand) {
        x -= need[c];
        if (x < 0) {
          pick = c;
          break;
        }
      }
      chosen.add(pick);
    }
    for (const c of chosen) need[c]--;
    grid.push(Array.from({ length: LOTO_COLS }, (_, c) => chosen.has(c)));
  }
  return grid;
}

/**
 * Sinh 1 cặp tờ chứa đủ 1–90 (mỗi số đúng 1 lần), mỗi tờ 45 số rải đều:
 * cột giữa mỗi tờ 5 số; cột 1–9 (9 số) và cột 80–90 (11 số) chia 4/5 – 6/5 sao cho mỗi tờ đủ 45.
 * Trong mỗi khối 3 hàng, số trong cùng một cột xếp tăng dần từ trên xuống (như tờ lô tô thật).
 */
export function generateLotoPair(rng: Rng = Math.random): [number[][], number[][]] {
  const a0 = rng() < 0.5 ? 4 : 5;
  const a8 = 10 - a0;
  const targetsA = [a0, 5, 5, 5, 5, 5, 5, 5, a8];
  const targetsB = [9 - a0, 5, 5, 5, 5, 5, 5, 5, 11 - a8];
  const layouts = [layoutSheet(targetsA, rng), layoutSheet(targetsB, rng)];
  const sheets = layouts.map(() => Array.from({ length: LOTO_ROWS }, () => Array<number>(LOTO_COLS).fill(0)));
  for (let c = 0; c < LOTO_COLS; c++) {
    const [lo, hi] = colRange(c);
    const nums = shuffled(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), rng);
    let k = 0;
    layouts.forEach((grid, s) => {
      for (let r = 0; r < LOTO_ROWS; r++) if (grid[r][c]) sheets[s][r][c] = nums[k++];
    });
  }
  // xếp tăng dần trong từng cột của từng khối 3 hàng
  for (const sheet of sheets) {
    for (let b = 0; b < LOTO_ROWS; b += 3) {
      for (let c = 0; c < LOTO_COLS; c++) {
        const rowsWith = [b, b + 1, b + 2].filter((r) => sheet[r][c] > 0);
        const vals = rowsWith.map((r) => sheet[r][c]).sort((x, y) => x - y);
        rowsWith.forEach((r, i) => (sheet[r][c] = vals[i]));
      }
    }
  }
  return [sheets[0], sheets[1]];
}

/** Số ô đã được gọi trên 1 hàng */
export const lotoRowHits = (row: number[], called: Set<number>) => row.reduce((n, x) => n + (x > 0 && called.has(x) ? 1 : 0), 0);
/** Hàng đã cân: đủ 5 số được gọi */
export const lotoRowDone = (row: number[], called: Set<number>) => lotoRowHits(row, called) >= LOTO_PER_ROW;

export interface LotoWin {
  playerId: string;
  /** tờ thứ mấy (0, 1) và hàng thứ mấy (0–8) */
  sheet: number;
  row: number;
  numbers: number[];
  color: LotoColor;
}

export interface LotoPlayerView {
  id: string;
  name: string;
  sheets: number;
  /** số ô đã gọi nhiều nhất trên 1 hàng (4 = đang chờ) */
  best: number;
  /** số hàng đang chờ (đủ 4/5) */
  waiting: number;
}

export interface LotoRoomView {
  /** số tờ mỗi người mua (phòng chờ chọn; mặc định 1) */
  picks: Record<string, number>;
  /** màu từng tờ mỗi người chọn (2 phần tử; được trùng màu) */
  colors: Record<string, LotoColor[]>;
  /** tờ của chính mình (khán giả không có) */
  mine?: LotoSheet[];
  /** các số đã gọi, theo thứ tự */
  called: number[];
  /** ms tới lần gọi số kế tiếp, tính tại lúc server gửi */
  nextIn?: number;
  players?: LotoPlayerView[];
  wins?: LotoWin[];
}

export const normalizeLotoPick = (n: unknown) => (Number(n) === 2 ? 2 : 1);
