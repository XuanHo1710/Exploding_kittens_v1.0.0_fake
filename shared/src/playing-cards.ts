export type PlayingSuit = 'spades' | 'clubs' | 'diamonds' | 'hearts';
export type PlayingRank = '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A' | '2';

export interface PlayingCard {
  /** Mã duy nhất trong ván, ví dụ "Spd-A#1" hoặc "Spd-A" */
  id: string;
  /** Mã chuẩn trong database/playing-cards, ví dụ "Spd-A", "Hrt-2" */
  code: string;
  suit: PlayingSuit;
  suitSymbol: '♠' | '♣' | '♦' | '♥';
  suitNameVi: string;
  rank: PlayingRank;
  rankNameVi: string;
  nameVi: string;
  color: 'black' | 'red';
  blackjackValues: number[];
  /** Thứ tự Tiến Lên: 3=0, 4=1, ..., A=11, 2=12 */
  tienLenRankOrder: number;
  /** Thứ tự chất Tiến Lên: ♠=0, ♣=1, ♦=2, ♥=3 */
  tienLenSuitOrder: number;
  /** Sức mạnh tuyệt đối trong Tiến Lên: 0 (3♠) -> 51 (2♥) */
  tienLenPower: number;
  /** Đường dẫn ảnh SVG trong database/playing-cards */
  image: string;
}

export const PLAYING_SUITS: ReadonlyArray<{
  id: PlayingSuit;
  prefix: 'Spd' | 'Clb' | 'Dia' | 'Hrt';
  symbol: '♠' | '♣' | '♦' | '♥';
  nameVi: string;
  color: 'black' | 'red';
  tlSuitOrder: number;
}> = [
  { id: 'spades', prefix: 'Spd', symbol: '♠', nameVi: 'Bích', color: 'black', tlSuitOrder: 0 },
  { id: 'clubs', prefix: 'Clb', symbol: '♣', nameVi: 'Chuồn', color: 'black', tlSuitOrder: 1 },
  { id: 'diamonds', prefix: 'Dia', symbol: '♦', nameVi: 'Rô', color: 'red', tlSuitOrder: 2 },
  { id: 'hearts', prefix: 'Hrt', symbol: '♥', nameVi: 'Cơ', color: 'red', tlSuitOrder: 3 },
];

export const PLAYING_RANKS: ReadonlyArray<{
  rank: PlayingRank;
  nameVi: string;
  bjValues: number[];
  tlRankOrder: number;
}> = [
  { rank: '3', nameVi: 'Ba', bjValues: [3], tlRankOrder: 0 },
  { rank: '4', nameVi: 'Bốn', bjValues: [4], tlRankOrder: 1 },
  { rank: '5', nameVi: 'Năm', bjValues: [5], tlRankOrder: 2 },
  { rank: '6', nameVi: 'Sáu', bjValues: [6], tlRankOrder: 3 },
  { rank: '7', nameVi: 'Bảy', bjValues: [7], tlRankOrder: 4 },
  { rank: '8', nameVi: 'Tám', bjValues: [8], tlRankOrder: 5 },
  { rank: '9', nameVi: 'Chín', bjValues: [9], tlRankOrder: 6 },
  { rank: '10', nameVi: 'Mười', bjValues: [10], tlRankOrder: 7 },
  { rank: 'J', nameVi: 'Bồi', bjValues: [10], tlRankOrder: 8 },
  { rank: 'Q', nameVi: 'Đầm', bjValues: [10], tlRankOrder: 9 },
  { rank: 'K', nameVi: 'Già', bjValues: [10], tlRankOrder: 10 },
  { rank: 'A', nameVi: 'Át', bjValues: [1, 10, 11], tlRankOrder: 11 },
  { rank: '2', nameVi: 'Heo', bjValues: [2], tlRankOrder: 12 },
];

/** Cơ sở dữ liệu 52 lá Bài Tây chuẩn */
export const PLAYING_CARDS_DB: ReadonlyArray<PlayingCard> = PLAYING_RANKS.flatMap((r) =>
  PLAYING_SUITS.map((s) => {
    const code = `${s.prefix}-${r.rank}`;
    return {
      id: code,
      code,
      suit: s.id,
      suitSymbol: s.symbol,
      suitNameVi: s.nameVi,
      rank: r.rank,
      rankNameVi: r.nameVi,
      nameVi: `${r.nameVi} ${s.nameVi}`,
      color: s.color,
      blackjackValues: r.bjValues,
      tienLenRankOrder: r.tlRankOrder,
      tienLenSuitOrder: s.tlSuitOrder,
      tienLenPower: r.tlRankOrder * 4 + s.tlSuitOrder,
      image: `/playing-cards/${code}.svg`,
    };
  }),
);

export const PLAYING_CARD_BY_CODE: Readonly<Record<string, PlayingCard>> = Object.fromEntries(
  PLAYING_CARDS_DB.map((c) => [c.code, c]),
);

/** Tạo bộ bài 52 lá chuẩn (mỗi lá có id riêng cho ván chơi) */
export function createStandard52Deck(): PlayingCard[] {
  return PLAYING_CARDS_DB.map((c) => ({ ...c, id: c.code }));
}

export function sortTienLenHand(cards: readonly PlayingCard[]): PlayingCard[] {
  return [...cards].sort((a, b) => a.tienLenPower - b.tienLenPower);
}

// ============================================================================
// 1. LUẬT RÚT BÀI 21 (XÌ DÁCH / BLACKJACK 21)
// ============================================================================

export type BlackjackHandKind = 'xi_bang' | 'xi_dach' | 'ngu_linh' | 'normal' | 'under' | 'bust';

export interface BlackjackEval {
  kind: BlackjackHandKind;
  points: number;
  cardCount: number;
  labelVi: string;
  canHit: boolean;
  canStand: boolean;
  /** Xếp hạng độ mạnh tuyệt đối để so bài */
  rankScore: number;
}

/**
 * Tính điểm Xì Dách chuẩn Việt Nam:
 * - 2 lá A = Xì Bàng (mạnh nhất)
 * - 2 lá gồm 1 A + (10/J/Q/K) = Xì Dách
 * - Khi có 2 lá: A tính là 11 hoặc 10
 * - Khi có 3..5 lá: A tính linh hoạt là 11, 10 hoặc 1 sao cho tổng <= 21 lớn nhất
 * - 5 lá mà tổng <= 21 = Ngũ Linh (nhỏ điểm hơn ăn lớn điểm hơn hoặc tính theo điểm chuẩn)
 * - Đủ tuổi: Nhà con >= 16 điểm, Nhà cái >= 15 điểm
 */
export function evaluateBlackjackHand(cards: readonly PlayingCard[], isDealer = false): BlackjackEval {
  const n = cards.length;
  const minValid = isDealer ? 15 : 16;

  if (n === 0) {
    return { kind: 'under', points: 0, cardCount: 0, labelVi: '0 điểm', canHit: true, canStand: false, rankScore: 0 };
  }

  if (n === 2) {
    const aces = cards.filter((c) => c.rank === 'A').length;
    const tens = cards.filter((c) => ['10', 'J', 'Q', 'K'].includes(c.rank)).length;
    if (aces === 2) {
      return {
        kind: 'xi_bang',
        points: 21,
        cardCount: 2,
        labelVi: '🔥 XÌ BÀNG',
        canHit: false,
        canStand: true,
        rankScore: 500,
      };
    }
    if (aces === 1 && tens === 1) {
      return {
        kind: 'xi_dach',
        points: 21,
        cardCount: 2,
        labelVi: '⚡ XÌ DÁCH',
        canHit: false,
        canStand: true,
        rankScore: 400,
      };
    }
  }

  // Tính tất cả tổng điểm có thể với lá A
  let totals = [0];
  for (const c of cards) {
    const vals = c.rank === 'A' ? (n === 2 ? [11, 10, 1] : [11, 10, 1]) : c.blackjackValues;
    const next = new Set<number>();
    for (const t of totals) {
      for (const v of vals) next.add(t + v);
    }
    totals = [...next];
  }

  const validTotals = totals.filter((t) => t <= 21).sort((a, b) => b - a);
  const minOver = totals.filter((t) => t > 21).sort((a, b) => a - b)[0] ?? 22;
  const bestPoints = validTotals[0] ?? minOver;

  if (bestPoints > 21) {
    return {
      kind: 'bust',
      points: bestPoints,
      cardCount: n,
      labelVi: `💥 Quắc (${bestPoints}đ)`,
      canHit: false,
      canStand: true,
      rankScore: -bestPoints,
    };
  }

  if (n >= 5) {
    // Ngũ linh: 5 lá <= 21 điểm (tổng càng nhỏ càng quý trong Ngũ Linh, hoặc đều ăn 21 thường)
    return {
      kind: 'ngu_linh',
      points: bestPoints,
      cardCount: n,
      labelVi: `🌟 NGŨ LINH (${bestPoints}đ)`,
      canHit: false,
      canStand: true,
      rankScore: 300 + (21 - bestPoints),
    };
  }

  if (bestPoints < minValid) {
    return {
      kind: 'under',
      points: bestPoints,
      cardCount: n,
      labelVi: `${bestPoints} điểm (Non <${minValid})`,
      canHit: true,
      canStand: false,
      rankScore: 10 + bestPoints,
    };
  }

  return {
    kind: 'normal',
    points: bestPoints,
    cardCount: n,
    labelVi: `${bestPoints} điểm`,
    canHit: bestPoints < 21 && n < 5,
    canStand: true,
    rankScore: 100 + bestPoints,
  };
}

/** So bài giữa Nhà Cái và Nhà Con */
export function compareBlackjackHands(
  dealer: BlackjackEval,
  player: BlackjackEval,
): { outcome: 'dealer' | 'player' | 'push'; reason: string } {
  const dBad = dealer.kind === 'bust' || dealer.kind === 'under';
  const pBad = player.kind === 'bust' || player.kind === 'under';

  // Nếu cả hai cùng Quắc hoặc Non -> Hoà (chạy làng)
  if (dBad && pBad) {
    return { outcome: 'push', reason: 'Cả hai cùng Quắc/Non — Hoà' };
  }
  if (pBad) {
    return { outcome: 'dealer', reason: player.kind === 'bust' ? 'Nhà con Quắc' : 'Nhà con chưa đủ tuổi (Non)' };
  }
  if (dBad) {
    return { outcome: 'player', reason: dealer.kind === 'bust' ? 'Nhà cái Quắc' : 'Nhà cái chưa đủ tuổi' };
  }

  if (player.rankScore > dealer.rankScore) {
    return { outcome: 'player', reason: `${player.labelVi} thắng ${dealer.labelVi}` };
  }
  if (dealer.rankScore > player.rankScore) {
    return { outcome: 'dealer', reason: `${dealer.labelVi} thắng ${player.labelVi}` };
  }
  return { outcome: 'push', reason: `Hoà (${player.labelVi})` };
}

// ============================================================================
// 2. LUẬT TIẾN LÊN MIỀN NAM (2–4 NGƯỜI, CHUẨN 4 NGƯỜI 13 LÁ)
// ============================================================================

export type TienLenComboKind =
  | 'single'
  | 'pair'
  | 'triple'
  | 'straight'
  | 'four_of_a_kind'
  | 'three_pairs'
  | 'four_pairs';

export interface TienLenCombo {
  kind: TienLenComboKind;
  cards: PlayingCard[];
  length: number;
  /** Sức mạnh lá cao nhất trong bộ để đọ cùng loại */
  highestPower: number;
  /** Có phải đánh Heo (2) hoặc đôi Heo không */
  hasTwo: boolean;
  labelVi: string;
}

/** Nhận diện bộ bài đánh ra trong Tiến Lên Miền Nam */
export function detectTienLenCombo(rawCards: readonly PlayingCard[]): TienLenCombo | null {
  if (!rawCards.length) return null;
  const cards = sortTienLenHand(rawCards);
  const n = cards.length;
  const highest = cards[n - 1];
  const hasTwo = cards.some((c) => c.rank === '2');

  // 1. Rác (1 lá)
  if (n === 1) {
    return {
      kind: 'single',
      cards,
      length: 1,
      highestPower: highest.tienLenPower,
      hasTwo,
      labelVi: `Lẻ ${highest.nameVi}`,
    };
  }

  // Kiểm tra tất cả cùng số (Đôi, Sám cô, Tứ quý)
  const allSameRank = cards.every((c) => c.tienLenRankOrder === cards[0].tienLenRankOrder);
  if (allSameRank) {
    if (n === 2) {
      return {
        kind: 'pair',
        cards,
        length: 2,
        highestPower: highest.tienLenPower,
        hasTwo,
        labelVi: `Đôi ${highest.rankNameVi}`,
      };
    }
    if (n === 3) {
      return {
        kind: 'triple',
        cards,
        length: 3,
        highestPower: highest.tienLenPower,
        hasTwo,
        labelVi: `Sám cô ${highest.rankNameVi}`,
      };
    }
    if (n === 4) {
      return {
        kind: 'four_of_a_kind',
        cards,
        length: 4,
        highestPower: highest.tienLenPower,
        hasTwo,
        labelVi: `🔥 Tứ Quý ${highest.rankNameVi}`,
      };
    }
    return null;
  }

  // Sảnh và Đôi thông tuyệt đối KHÔNG được chứa Heo (2)
  if (hasTwo) return null;

  // 2. Sảnh (>= 3 lá liên tiếp khác số)
  const isStraight = cards.every((c, i) => i === 0 || c.tienLenRankOrder === cards[i - 1].tienLenRankOrder + 1);
  if (n >= 3 && isStraight) {
    return {
      kind: 'straight',
      cards,
      length: n,
      highestPower: highest.tienLenPower,
      hasTwo: false,
      labelVi: `Sảnh ${n} lá (${cards[0].rank}→${highest.rank}${highest.suitSymbol})`,
    };
  }

  // 3. Đôi thông (3 đôi thông = 6 lá, 4 đôi thông = 8 lá)
  if ((n === 6 || n === 8) && n % 2 === 0) {
    const pairCount = n / 2;
    let validPairs = true;
    for (let i = 0; i < pairCount; i++) {
      const c1 = cards[i * 2];
      const c2 = cards[i * 2 + 1];
      if (c1.tienLenRankOrder !== c2.tienLenRankOrder) {
        validPairs = false;
        break;
      }
      if (i > 0) {
        const prevPairRank = cards[(i - 1) * 2].tienLenRankOrder;
        if (c1.tienLenRankOrder !== prevPairRank + 1) {
          validPairs = false;
          break;
        }
      }
    }
    if (validPairs) {
      return {
        kind: pairCount === 3 ? 'three_pairs' : 'four_pairs',
        cards,
        length: n,
        highestPower: highest.tienLenPower,
        hasTwo: false,
        labelVi: pairCount === 3 ? `⚡ 3 Đôi Thông (${cards[0].rank}→${highest.rank})` : `💥 4 Đôi Thông (${cards[0].rank}→${highest.rank})`,
      };
    }
  }

  return null;
}

/**
 * Kiểm tra bộ `next` có chặt/đè được bộ `prev` trên bàn không.
 * Hỗ trợ đầy đủ luật Chặt Heo / Đôi Heo / Đôi thông / Tứ quý.
 */
export function canBeatTienLenCombo(
  prev: TienLenCombo | undefined,
  next: TienLenCombo,
): { ok: boolean; isChop?: boolean; chopLabel?: string; reason?: string } {
  if (!prev) return { ok: true };

  // 1. Luật Chặt Heo đơn (1 lá 2)
  if (prev.kind === 'single' && prev.hasTwo) {
    if (next.kind === 'three_pairs' || next.kind === 'four_of_a_kind' || next.kind === 'four_pairs') {
      return { ok: true, isChop: true, chopLabel: `${next.labelVi} CHẶT HEO ${prev.cards[0].nameVi}!` };
    }
  }

  // 2. Luật Chặt Đôi Heo (2 lá 2)
  if (prev.kind === 'pair' && prev.hasTwo) {
    if (next.kind === 'four_of_a_kind' || next.kind === 'four_pairs') {
      return { ok: true, isChop: true, chopLabel: `${next.labelVi} CHẶT ĐÔI HEO!` };
    }
  }

  // 3. Luật Chặt 3 Đôi Thông
  if (prev.kind === 'three_pairs') {
    if (next.kind === 'four_of_a_kind' || next.kind === 'four_pairs') {
      return { ok: true, isChop: true, chopLabel: `${next.labelVi} CHẶT 3 ĐÔI THÔNG!` };
    }
    if (next.kind === 'three_pairs' && next.highestPower > prev.highestPower) {
      return { ok: true, isChop: true, chopLabel: `${next.labelVi} đè 3 Đôi Thông!` };
    }
  }

  // 4. Luật Chặt Tứ Quý
  if (prev.kind === 'four_of_a_kind') {
    if (next.kind === 'four_pairs') {
      return { ok: true, isChop: true, chopLabel: `${next.labelVi} CHẶT TỨ QUÝ!` };
    }
    if (next.kind === 'four_of_a_kind' && next.highestPower > prev.highestPower) {
      return { ok: true, isChop: true, chopLabel: `${next.labelVi} CHẶT TỨ QUÝ nhỏ hơn!` };
    }
  }

  // 5. Luật Chặt 4 Đôi Thông
  if (prev.kind === 'four_pairs' && next.kind === 'four_pairs' && next.highestPower > prev.highestPower) {
    return { ok: true, isChop: true, chopLabel: `${next.labelVi} CHẶT 4 ĐÔI THÔNG!` };
  }

  // 6. Đè bài thông thường: cùng loại, cùng độ dài (với Sảnh), và lá cao nhất mạnh hơn
  if (prev.kind !== next.kind) {
    return { ok: false, reason: 'Phải đánh cùng bộ bài (hoặc dùng Hàng để chặt Heo).' };
  }
  if (prev.length !== next.length) {
    return { ok: false, reason: `Sảnh đánh đè phải có đúng ${prev.length} lá.` };
  }
  if (next.highestPower <= prev.highestPower) {
    return { ok: false, reason: 'Bộ bài của bạn nhỏ hơn bài trên bàn.' };
  }
  return { ok: true };
}

/** Kiểm tra Tới Trắng khi vừa chia 13 lá */
export function checkTienLenInstantWin(rawCards: readonly PlayingCard[]): { kind: string; labelVi: string } | null {
  if (rawCards.length < 13) return null;
  const cards = sortTienLenHand(rawCards);
  const rankCounts = new Map<number, number>();
  for (const c of cards) {
    rankCounts.set(c.tienLenRankOrder, (rankCounts.get(c.tienLenRankOrder) ?? 0) + 1);
  }

  // 1. Tứ quý Heo (4 lá 2)
  if ((rankCounts.get(12) ?? 0) === 4) {
    return { kind: 'four_twos', labelVi: '👑 TỚI TRẮNG: TỨ QUÝ HEO!' };
  }

  // 2. Sảnh Rồng (đủ 12 số từ 3 đến A)
  let dragon = true;
  for (let r = 0; r <= 11; r++) {
    if (!rankCounts.has(r)) {
      dragon = false;
      break;
    }
  }
  if (dragon) {
    return { kind: 'dragon_straight', labelVi: '🐉 TỚI TRẮNG: SẢNH RỒNG 3→A!' };
  }

  // 3. 6 Đôi (hoặc 5 đôi thông)
  let pairs = 0;
  for (const count of rankCounts.values()) {
    pairs += Math.floor(count / 2);
  }
  if (pairs >= 6) {
    return { kind: 'six_pairs', labelVi: '✨ TỚI TRẮNG: 6 ĐÔI!' };
  }

  // 4. 5 Đôi thông (từ 3..A)
  let consecPairs = 0;
  for (let r = 0; r <= 11; r++) {
    if ((rankCounts.get(r) ?? 0) >= 2) {
      consecPairs++;
      if (consecPairs >= 5) {
        return { kind: 'five_consec_pairs', labelVi: '⚡ TỚI TRẮNG: 5 ĐÔI THÔNG!' };
      }
    } else {
      consecPairs = 0;
    }
  }

  return null;
}

/**
 * Tiến Lên: id các lá nằm trong ít nhất 1 bộ đánh hợp lệ lúc này (để làm sáng lá đánh được).
 * table = bộ trên bàn (không có = đánh tự do); mustInclude = mã lá bắt buộc có (lượt mở màn ván đầu).
 */
export function tienLenPlayableIds(
  rawHand: readonly PlayingCard[],
  table: TienLenCombo | undefined,
  mustInclude?: string,
): Set<string> {
  const hand = sortTienLenHand(rawHand);
  const out = new Set<string>();
  if (mustInclude) {
    // Lượt mở màn: thử mọi bộ có chứa lá bắt buộc (tối đa 2^12 bộ, chỉ xảy ra 1 lần mỗi ván)
    const must = hand.find((c) => c.code === mustInclude);
    if (!must) return out;
    const rest = hand.filter((c) => c !== must);
    for (let mask = 0; mask < 1 << rest.length; mask++) {
      const cards = [must, ...rest.filter((_, i) => mask & (1 << i))];
      const combo = detectTienLenCombo(cards);
      if (combo && canBeatTienLenCombo(table, combo).ok) cards.forEach((c) => out.add(c.id));
    }
    return out;
  }
  const tryCombo = (cards: PlayingCard[], extra: PlayingCard[] = []) => {
    const combo = detectTienLenCombo(cards);
    if (!combo || !canBeatTienLenCombo(table, combo).ok) return;
    cards.forEach((c) => out.add(c.id));
    extra.forEach((c) => out.add(c.id));
  };
  const byRank = new Map<number, PlayingCard[]>();
  for (const c of hand) {
    const g = byRank.get(c.tienLenRankOrder) ?? [];
    g.push(c);
    byRank.set(c.tienLenRankOrder, g);
  }
  const subsets = (g: PlayingCard[], k: number): PlayingCard[][] =>
    k === 0 ? [[]] : g.flatMap((c, i) => subsets(g.slice(i + 1), k - 1).map((rest) => [c, ...rest]));
  // Rác, Đôi, Sám cô, Tứ quý
  for (const g of byRank.values()) for (let k = 1; k <= g.length; k++) for (const s of subsets(g, k)) tryCombo(s);
  const ranks = [...byRank.keys()].filter((r) => r < 12).sort((a, b) => a - b);
  const runs = (minLen: number, needPairs: boolean) => {
    for (let i = 0; i < ranks.length; i++) {
      for (let j = i; j < ranks.length && ranks[j] - ranks[i] === j - i; j++) {
        const len = j - i + 1;
        if (len < minLen) continue;
        const lower = ranks.slice(i, j);
        const top = byRank.get(ranks[j])!;
        if (!needPairs) {
          // Sảnh: lá cao nhất quyết định thắng/thua; các số dưới chọn chất nào cũng được
          for (const t of top) tryCombo([...lower.map((r) => byRank.get(r)![0]), t], lower.flatMap((r) => byRank.get(r)!));
        } else if (len === 3 || len === 4) {
          if (![...lower, ranks[j]].every((r) => byRank.get(r)!.length >= 2)) continue;
          for (const tp of subsets(top, 2)) {
            tryCombo([...lower.flatMap((r) => byRank.get(r)!.slice(0, 2)), ...tp], lower.flatMap((r) => byRank.get(r)!));
          }
        }
      }
    }
  };
  runs(3, false);
  runs(3, true);
  return out;
}
