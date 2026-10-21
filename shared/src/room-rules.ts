import { CARD_INFO, DECK_COUNTS, MAX_PLAYERS, MIN_PLAYERS, type CardType } from './cards';
import type { ActionKind } from './protocol';

export type DeckCardType = Exclude<CardType, 'exploding' | 'defuse'>;
export const DECK_CARD_TYPES = (Object.keys(CARD_INFO) as CardType[]).filter(
  (type): type is DeckCardType => type !== 'exploding' && type !== 'defuse',
);

/** Cấu hình luật nhà: toàn bộ máy trong phòng dùng cùng bản do server xác nhận. */
export interface RoomRules {
  maxPlayers: number;
  handSize: number;
  defusesPerPlayer: number;
  extraDefuses: number;
  bombMode: 'players_minus_one' | 'players' | 'fixed';
  fixedBombs: number;
  cardCounts: Record<DeckCardType, number>;
  allowPair: boolean;
  allowTriple: boolean;
  allowFive: boolean;
  comboScope: 'cats' | 'any';
  attackMode: 'stack' | 'replace';
  nopeChain: boolean;
  futureCount: number;
  bombPlacement: 'choose' | 'random';
  firstPlayer: 'random' | 'host';
  turnSeconds: number;
  nopeSeconds: number;
  promptSeconds: number;
}

const baseCounts = Object.fromEntries(DECK_CARD_TYPES.map((type) => [type, DECK_COUNTS[type]])) as Record<DeckCardType, number>;
const zeroCounts = Object.fromEntries(DECK_CARD_TYPES.map((type) => [type, 0])) as Record<DeckCardType, number>;

export const DEFAULT_ROOM_RULES: RoomRules = Object.freeze({
  maxPlayers: MAX_PLAYERS,
  handSize: 7,
  defusesPerPlayer: 1,
  extraDefuses: 2,
  bombMode: 'players_minus_one',
  fixedBombs: 4,
  cardCounts: Object.freeze({ ...baseCounts }),
  allowPair: true,
  allowTriple: true,
  allowFive: true,
  comboScope: 'cats',
  // Chữ in trên lá Tấn Công: "buộc người kế tiếp chơi 2 lượt" (không cộng dồn). Cộng dồn là tuỳ chọn của phòng.
  attackMode: 'replace',
  nopeChain: true,
  futureCount: 3,
  bombPlacement: 'choose',
  firstPlayer: 'random',
  turnSeconds: 90,
  nopeSeconds: 4,
  promptSeconds: 30,
});

export const RULE_PRESETS: ReadonlyArray<{ id: string; name: string; description: string; rules: RoomRules }> = [
  { id: 'balanced', name: 'Đầy đủ mở rộng', description: 'Tích hợp toàn bộ các lá đặc biệt (Bom Nguyên Tử, Rút Đáy, Đảo Chiều, Sửa Tương Lai, Mèo Hoang...).', rules: DEFAULT_ROOM_RULES },
  {
    id: 'quick', name: 'Ván nhanh', description: 'Tay bài nhỏ, bộ bài gọn và lượt 30 giây. Vẫn đủ bài cho 10 người.',
    rules: { ...DEFAULT_ROOM_RULES, handSize: 4, extraDefuses: 0, allowFive: false, turnSeconds: 30, promptSeconds: 15,
      cardCounts: { ...zeroCounts, attack: 3, targeted_attack: 2, skip: 3, reverse: 2, draw_bottom: 2, catomic_bomb: 1, favor: 3, shuffle: 3, see_future: 4, alter_future: 2, nope: 4, feral_cat: 2, cat_potato: 4, cat_melon: 4, cat_bladder: 4, cat_schrodinger: 4, cat_beard: 4 } },
  },
  {
    id: 'chaos', name: 'Căng thẳng', description: 'Nhiều Tấn Công & Bom Nguyên Tử, mỗi người 1 bom trong chồng rút; đôi và ba dùng mọi loại bài.',
    rules: { ...DEFAULT_ROOM_RULES, extraDefuses: 0, bombMode: 'players', comboScope: 'any', turnSeconds: 45,
      cardCounts: { ...baseCounts, attack: 14, targeted_attack: 6, catomic_bomb: 4, skip: 10, nope: 12 } },
  },
  { id: 'legacy', name: 'Cổ điển', description: 'Chỉ dùng bộ bài cơ bản truyền thống, mỗi người 1 Gỡ Bom, số bom bằng số người.',
    rules: { ...DEFAULT_ROOM_RULES, extraDefuses: 0, bombMode: 'players', cardCounts: { ...zeroCounts, attack: 8, skip: 8, favor: 8, shuffle: 8, see_future: 10, nope: 10, cat_potato: 8, cat_melon: 8, cat_bladder: 8, cat_schrodinger: 8, cat_beard: 8 } } },
];

export const RULE_LIMITS = {
  maxPlayers: [MIN_PLAYERS, MAX_PLAYERS], handSize: [1, 12], defusesPerPlayer: [0, 3], extraDefuses: [0, 20],
  fixedBombs: [1, 30], futureCount: [1, 5], turnSeconds: [15, 180], nopeSeconds: [1, 10], promptSeconds: [10, 90],
  cardCount: [0, 40], totalNormalCards: 300,
} as const;

/** Không ép kiểu string/boolean; socket lạ không được bỏ qua lỗi cấu hình. */
export function normalizeRoomRules(raw?: unknown): RoomRules {
  if (raw === undefined) return structuredClone(DEFAULT_ROOM_RULES);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Luật phòng phải là một đối tượng hợp lệ.');
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(DEFAULT_ROOM_RULES, key)) throw new Error(`Tùy chọn luật không hợp lệ: ${key}.`);
  }
  const rules = structuredClone(DEFAULT_ROOM_RULES);
  const labels = {
    maxPlayers: 'Số người tối đa', handSize: 'Bài thường mỗi người', defusesPerPlayer: 'Gỡ Bom mỗi người',
    extraDefuses: 'Gỡ Bom thêm vào chồng rút', fixedBombs: 'Số Mèo Nổ cố định', futureCount: 'Số lá Xem Trước',
    turnSeconds: 'Thời gian lượt', nopeSeconds: 'Thời gian chờ Nope', promptSeconds: 'Thời gian chọn bài hoặc nhét bom',
  };
  for (const key of ['maxPlayers', 'handSize', 'defusesPerPlayer', 'extraDefuses', 'fixedBombs', 'futureCount', 'turnSeconds', 'nopeSeconds', 'promptSeconds'] as const) {
    const value = input[key] === undefined ? rules[key] : input[key];
    const [min, max] = RULE_LIMITS[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${labels[key]} phải là số nguyên từ ${min} đến ${max}.`);
    }
    rules[key] = value;
  }
  for (const key of ['allowPair', 'allowTriple', 'allowFive', 'nopeChain'] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') throw new Error(`${key} phải là bật hoặc tắt.`);
      rules[key] = input[key];
    }
  }
  const choices = {
    bombMode: ['players_minus_one', 'players', 'fixed'], comboScope: ['cats', 'any'], attackMode: ['stack', 'replace'],
    bombPlacement: ['choose', 'random'], firstPlayer: ['random', 'host'],
  } as const;
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !(choices[key] as readonly string[]).includes(value)) throw new Error(`Giá trị ${key} không hợp lệ.`);
    Object.assign(rules, { [key]: value });
  }
  if (input.cardCounts !== undefined) {
    if (!input.cardCounts || typeof input.cardCounts !== 'object' || Array.isArray(input.cardCounts)) throw new Error('Số lượng bài không hợp lệ.');
    for (const [key, count] of Object.entries(input.cardCounts)) {
      if (!DECK_CARD_TYPES.includes(key as DeckCardType)) throw new Error(`Loại bài không hợp lệ: ${key}.`);
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > RULE_LIMITS.cardCount[1]) {
        throw new Error('Mỗi loại bài cần từ 0 đến 40 lá.');
      }
      rules.cardCounts[key as DeckCardType] = count;
    }
  }
  if (Object.values(rules.cardCounts).reduce((sum, count) => sum + count, 0) > RULE_LIMITS.totalNormalCards) {
    throw new Error('Bộ bài thường tối đa 300 lá.');
  }
  return rules;
}

export function roomBombCount(rules: RoomRules, players: number): number {
  return rules.bombMode === 'fixed' ? rules.fixedBombs : rules.bombMode === 'players' ? players : Math.max(1, players - 1);
}

export function roomDeckSummary(rules: RoomRules, playerCount: number) {
  const normalCards = Object.values(rules.cardCounts).reduce((sum, count) => sum + count, 0);
  const bombs = roomBombCount(rules, playerCount);
  const defuses = playerCount * rules.defusesPerPlayer + rules.extraDefuses;
  const dealtCards = playerCount * (rules.handSize + rules.defusesPerPlayer);
  const errors: string[] = [];
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS) errors.push(`Cần ít nhất ${MIN_PLAYERS} người đang kết nối.`);
  if (playerCount > rules.maxPlayers) errors.push(`Phòng chỉ cho tối đa ${rules.maxPlayers} người.`);
  if (normalCards < playerCount * rules.handSize) errors.push(`Thiếu ${playerCount * rules.handSize - normalCards} lá thường để chia cho ${playerCount} người. Tăng bài hoặc giảm bài trên tay.`);
  if (bombs < playerCount - 1) errors.push(`Cần ít nhất ${playerCount - 1} Mèo Nổ để ván có thể kết thúc với ${playerCount} người.`);
  return { normalCards, dealtCards, drawPileCards: Math.max(0, normalCards - playerCount * rules.handSize + rules.extraDefuses + bombs),
    bombs, defuses, totalCards: normalCards + bombs + defuses, canStart: errors.length === 0, errors };
}

export const SINGLE_ACTION_CARDS: readonly CardType[] = [
  'attack',
  'targeted_attack',
  'personal_attack',
  'skip',
  'super_skip',
  'reverse',
  'draw_bottom',
  'catomic_bomb',
  'swap_top_bottom',
  'bury',
  'garbage_collection',
  'shuffle',
  'see_future',
  'alter_future',
  'share_future',
  'dig_deeper',
  'favor',
  'mark',
  'grave_robber',
  'clone',
];


/** Nhân Bản đánh lẻ sao chép được các lá chức năng đánh lẻ (trừ chính Nhân Bản) */
export const CLONEABLE_KINDS: readonly ActionKind[] = SINGLE_ACTION_CARDS.filter((t) => t !== 'clone') as ActionKind[];

/** Lá đại diện cho mèo thường. Chỉ Mèo Hoang ("Use as any cat card"); Nhân Bản không ghi điều này. */
export const WILDCARD_CAT_TYPES: readonly CardType[] = ['feral_cat'];

/**
 * Nhân Bản: "When you play this card, it becomes whatever card is beneath it" — lá trên đỉnh chồng bài bỏ.
 * Nếu lá bên dưới là một Nhân Bản khác thì nó đã trở thành lá mà Nhân Bản đó sao chép.
 * Trả về undefined khi lá bên dưới không phải lá chức năng đánh lẻ được.
 */
export function cloneCopyKind(
  top: { id?: string; type: CardType } | undefined,
  lastPlay?: { kind: ActionKind; cardIds: string[] },
): ActionKind | undefined {
  if (!top) return undefined;
  if (top.type === 'clone') {
    return lastPlay && top.id && lastPlay.cardIds.includes(top.id) && CLONEABLE_KINDS.includes(lastPlay.kind) ? lastPlay.kind : undefined;
  }
  return CLONEABLE_KINDS.includes(top.type as ActionKind) ? (top.type as ActionKind) : undefined;
}

/** Kiểm tra một bộ lá bài có ghép cùng loại hợp lệ (hỗ trợ Mèo Hoang đại diện) */
export function canMatchComboCards(types: CardType[], rules: RoomRules): boolean {
  if (types.length < 2 || types.some((t) => t === 'exploding' || !CARD_INFO[t])) return false;
  const allExactSame = types.every((t) => t === types[0]);
  if (allExactSame) {
    return rules.comboScope === 'any' || !!CARD_INFO[types[0]].isCat || WILDCARD_CAT_TYPES.includes(types[0]);
  }
  // Cho phép ghép Mèo Hoang với 1 loại Mèo thường (hoặc loại bất kỳ khi comboScope === 'any')
  const nonWild = types.filter((t) => !WILDCARD_CAT_TYPES.includes(t));
  if (nonWild.length === 0) return true;
  const baseType = nonWild[0];
  if (!nonWild.every((t) => t === baseType)) return false;
  return rules.comboScope === 'any' || !!CARD_INFO[baseType].isCat;
}

/** Loại lá này có được làm "lá chính" của đôi/ba không (phòng chỉ cho mèo thường thì chỉ mèo) */
function comboBaseAllowed(type: CardType, rules: RoomRules) {
  return type !== 'exploding' && !WILDCARD_CAT_TYPES.includes(type) && (rules.comboScope === 'any' || !!CARD_INFO[type]?.isCat);
}

/**
 * Nhóm lá lớn nhất trên tay ghép được đôi/ba cùng lá loại `type` (gồm cả Mèo Hoang đại diện).
 * Trả về [] nếu loại này không ghép được. Khớp đúng luật canMatchComboCards ở server.
 */
export function comboGroupFor<C extends { id: string; type: CardType }>(hand: readonly C[], type: CardType, rules: RoomRules): C[] {
  const wilds = hand.filter((c) => WILDCARD_CAT_TYPES.includes(c.type));
  if (WILDCARD_CAT_TYPES.includes(type)) {
    let best = wilds;
    for (const base of new Set(hand.map((c) => c.type))) {
      if (!comboBaseAllowed(base, rules)) continue;
      const group = [...hand.filter((c) => c.type === base), ...wilds];
      if (group.length > best.length) best = group;
    }
    return best;
  }
  if (!comboBaseAllowed(type, rules)) return [];
  return [...hand.filter((c) => c.type === type), ...wilds];
}

/** Lá loại `type` có đang ghép được đôi (hoặc ba nếu phòng tắt đôi) không */
export function canComboWith(hand: readonly { id: string; type: CardType }[], type: CardType, rules: RoomRules): boolean {
  const n = comboGroupFor(hand, type, rules).length;
  return (rules.allowPair && n >= 2) || (rules.allowTriple && n >= 3);
}

/** Dùng chung cho server và giao diện để không khác luật về combo. */
export function detectPlayKind(types: CardType[], rules: RoomRules): ActionKind | null {
  if (!types.length || types.some((type) => !Object.hasOwn(CARD_INFO, type) || type === 'exploding')) return null;
  if (types.length === 1 && SINGLE_ACTION_CARDS.includes(types[0])) return types[0] as ActionKind;
  const matching = canMatchComboCards(types, rules);
  if (matching && types.length === 2 && rules.allowPair) return 'pair';
  if (matching && types.length === 3 && rules.allowTriple) return 'triple';
  if (types.length === 5 && new Set(types).size === 5 && rules.allowFive) return 'five';
  return null;
}

export function ruleSummary(rules: RoomRules): string[] {
  const bombRule = rules.bombMode === 'fixed' ? `${rules.fixedBombs} Mèo Nổ cố định` : rules.bombMode === 'players' ? 'Số Mèo Nổ = số người' : 'Số Mèo Nổ = số người − 1';
  const combos = [rules.allowPair && 'đôi', rules.allowTriple && 'ba', rules.allowFive && '5 lá khác nhau'].filter(Boolean).join(', ');
  return [
    `Tối đa ${rules.maxPlayers} người · mỗi người ${rules.handSize} lá thường + ${rules.defusesPerPlayer} Gỡ Bom`,
    `${bombRule} · thêm ${rules.extraDefuses} Gỡ Bom vào chồng rút`,
    combos ? `Combo: ${combos}. Đôi/ba ${rules.comboScope === 'cats' ? 'chỉ dùng mèo thường (& Mèo Hoang)' : 'dùng mọi loại bài giống nhau'}.` : 'Tắt tất cả combo.',
    `Tấn Công ${rules.attackMode === 'stack' ? 'cộng số lượt còn nợ' : 'đặt lại thành 2 lượt'} · ${rules.nopeChain ? 'được Nope lại Nope' : 'không được Nope lại Nope'}`,
    `Xem trước ${rules.futureCount} lá · nhét bom ${rules.bombPlacement === 'choose' ? 'tự chọn vị trí' : 'ngẫu nhiên'}`,
    `Lượt ${rules.turnSeconds}s · chờ Nope ${rules.nopeSeconds}s · chọn bài/nhét bom ${rules.promptSeconds}s`,
    `${rules.firstPlayer === 'host' ? 'Chủ phòng' : 'Người ngẫu nhiên'} đi trước. Luật khóa khi bắt đầu ván.`,
  ];
}

export function describeCard(type: CardType, rules: RoomRules): string {
  if (type === 'defuse') return `Tự động dùng khi rút Mèo Nổ. Bom được nhét lại ${rules.bombPlacement === 'choose' ? 'ở vị trí bạn chọn' : 'ngẫu nhiên'}.`;
  if (type === 'attack') return `${CARD_INFO.attack.desc}${rules.attackMode === 'stack' ? ' Luật phòng: cộng thêm số lượt bạn đang nợ.' : ''}`;
  if (type === 'targeted_attack') return `${CARD_INFO.targeted_attack.desc}${rules.attackMode === 'stack' ? ' Luật phòng: cộng thêm số lượt bạn đang nợ.' : ''}`;
  if (type === 'see_future') return `Bí mật xem ${rules.futureCount} lá trên cùng của chồng bài.`;
  if (type === 'nope') return `Chặn hành động trong ${rules.nopeSeconds} giây, cả ngoài lượt. Không chặn Mèo Nổ/Gỡ Bom. ${rules.nopeChain ? 'Có thể Nope lại Nope.' : 'Không được Nope lại Nope.'}`;
  if (type === 'alter_future') return `Bí mật xem và sắp xếp lại ${rules.futureCount} lá trên cùng của chồng bài rút.`;
  if (type === 'share_future') return `Xem và sắp xếp lại ${rules.futureCount} lá trên cùng của chồng bài rút, rồi cho người chơi kế tiếp xem các lá đó.`;
  if (CARD_INFO[type].isCat) {
    const prefix = type === 'feral_cat' ? 'Dùng như bất kỳ lá mèo thường nào. ' : 'Đánh lẻ không có tác dụng. ';
    const effects = [rules.allowPair && 'Đôi: cướp ngẫu nhiên 1 lá của người khác', rules.allowTriple && 'Ba: gọi tên lá muốn lấy', rules.allowFive && 'Dùng trong combo 5 lá khác nhau'].filter(Boolean);
    return effects.length ? `${prefix}${effects.join('. ')}.` : 'Mèo thường; phòng này đã tắt các combo nên lá này không có hiệu ứng.';
  }
  return CARD_INFO[type].desc;
}

