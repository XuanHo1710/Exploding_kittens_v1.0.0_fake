export type CardType =
  | 'exploding'
  | 'defuse'
  | 'attack'
  | 'targeted_attack'
  | 'personal_attack'
  | 'skip'
  | 'super_skip'
  | 'reverse'
  | 'draw_bottom'
  | 'catomic_bomb'
  | 'swap_top_bottom'
  | 'bury'
  | 'garbage_collection'
  | 'shuffle'
  | 'see_future'
  | 'alter_future'
  | 'share_future'
  | 'dig_deeper'
  | 'favor'
  | 'mark'
  | 'grave_robber'
  | 'nope'
  | 'clone'
  | 'feral_cat'
  | 'cat_potato'
  | 'cat_melon'
  | 'cat_bladder'
  | 'cat_schrodinger'
  | 'cat_beard';

export interface Card {
  id: string;
  type: CardType;
}

export interface CardInfo {
  name: string;
  /** Mã nhóm ảnh chuẩn hóa trong thư mục database/ (vd: Atk, Cmb, Dfb) */
  code: string;
  /** Mô tả đầy đủ (bảng luật & xem chi tiết lá bài) */
  desc: string;
  /** Mô tả ngắn in trên mặt lá */
  short: string;
  emoji: string;
  color: string;
  isCat?: boolean;
}

/** short / desc: dịch sát chữ luật in trên lá (đã đối chiếu từng tranh trong database/) */
export const CARD_INFO: Record<CardType, CardInfo> = {
  exploding: {
    name: 'Mèo Nổ',
    code: 'Exp',
    short: 'Rút trúng phải ngửa ra ngay: có Gỡ Bom thì thoát, không thì nổ.',
    emoji: '💣',
    color: '#23201f',
    desc: 'Ngửa lá này ngay khi rút được. Nếu có Gỡ Bom thì dùng để thoát; nếu không có thì bạn nổ tung và bị loại.',
  },
  defuse: {
    name: 'Gỡ Bom',
    code: 'Def',
    short: 'Thay vì nổ, bí mật nhét Mèo Nổ lại vào chồng bài.',
    emoji: '🧯',
    color: '#2f8f3e',
    desc: 'Thay vì nổ tung, bí mật nhét lá Mèo Nổ bạn vừa rút trở lại chồng bài rút.',
  },
  attack: {
    name: 'Tấn Công',
    code: 'Atk',
    short: 'Hết lượt không rút bài, người kế tiếp chơi 2 lượt.',
    emoji: '⚔️',
    color: '#e8590c',
    desc: 'Kết thúc lượt của bạn mà không rút bài. Buộc người chơi kế tiếp chơi 2 lượt.',
  },
  targeted_attack: {
    name: 'Tấn Công Chỉ Định',
    code: 'Tat',
    short: 'Hết lượt không rút bài, người bạn chọn chơi 2 lượt.',
    emoji: '🎯',
    color: '#d9480f',
    desc: 'Kết thúc lượt của bạn mà không rút bài. Buộc người chơi bạn chọn chơi 2 lượt. Vòng chơi tiếp tục từ người đó.',
  },
  personal_attack: {
    name: 'Tự Tấn Công',
    code: 'Pat',
    short: 'Bạn chơi 3 lượt liên tiếp.',
    emoji: '💥',
    color: '#c92a2a',
    desc: 'Bạn chơi 3 lượt liên tiếp.',
  },
  skip: {
    name: 'Bỏ Lượt',
    code: 'Skp',
    short: 'Kết thúc lượt mà không rút bài.',
    emoji: '🏃',
    color: '#1c7ed6',
    desc: 'Kết thúc lượt của bạn mà không rút bài.',
  },
  super_skip: {
    name: 'Siêu Bỏ Lượt',
    code: 'Ssk',
    short: 'Kết thúc tất cả lượt đang phải chơi, không rút bài.',
    emoji: '🚀',
    color: '#1864ab',
    desc: 'Kết thúc lượt của bạn mà không rút bài. Nếu bạn đang phải chơi nhiều lượt thì kết thúc tất cả.',
  },
  reverse: {
    name: 'Đảo Chiều',
    code: 'Rev',
    short: 'Đảo chiều vòng chơi và hết lượt không rút bài.',
    emoji: '🔄',
    color: '#0b7285',
    desc: 'Đảo ngược chiều vòng chơi và kết thúc lượt của bạn mà không rút bài.',
  },
  draw_bottom: {
    name: 'Rút Đáy',
    code: 'Dfb',
    short: 'Kết thúc lượt bằng cách rút lá dưới đáy.',
    emoji: '⬇️',
    color: '#0ca678',
    desc: 'Kết thúc lượt của bạn bằng cách rút lá dưới đáy chồng bài rút.',
  },
  catomic_bomb: {
    name: 'Bom Nguyên Tử',
    code: 'Cmb',
    short: 'Gom hết Mèo Nổ lên trên cùng, xáo phần còn lại, hết lượt.',
    emoji: '☢️',
    color: '#e67700',
    desc: 'Lấy hết Mèo Nổ ra khỏi chồng bài rút. Xáo chồng bài. Úp tất cả Mèo Nổ đó lên trên cùng. Lượt của bạn kết thúc sau khi đánh lá này.',
  },
  swap_top_bottom: {
    name: 'Đảo Đầu Đuôi',
    code: 'Swp',
    short: 'Đổi chỗ lá trên cùng và lá dưới đáy.',
    emoji: '🔃',
    color: '#5f3dc4',
    desc: 'Đổi chỗ lá trên cùng và lá dưới đáy của chồng bài rút.',
  },
  bury: {
    name: 'Chôn Bài',
    code: 'Bry',
    short: 'Hết lượt: bí mật nhét lá vừa rút lại vào chồng bài.',
    emoji: '🕳️',
    color: '#6741d9',
    desc: 'Kết thúc lượt của bạn bằng cách bí mật đặt lá bạn rút được trở lại chồng bài rút, như thể bạn vừa Gỡ Bom nó.',
  },
  garbage_collection: {
    name: 'Thu Gom Rác',
    code: 'Gar',
    short: 'Mọi người tự chọn 1 lá xáo vào chồng rút.',
    emoji: '♻️',
    color: '#3b5bdb',
    desc: 'Mọi người chơi (kể cả người đánh lá này) phải tự chọn 1 lá trên tay để xáo vào chồng bài rút.',
  },
  shuffle: {
    name: 'Xáo Bài',
    code: 'Shf',
    short: 'Xáo chồng bài rút.',
    emoji: '🔀',
    color: '#7b5230',
    desc: 'Xáo chồng bài rút.',
  },
  see_future: {
    name: 'Xem Trước',
    code: 'See',
    short: 'Bí mật xem 3 lá trên cùng.',
    emoji: '🔮',
    color: '#d6336c',
    desc: 'Bí mật xem 3 lá trên cùng của chồng bài rút.',
  },
  alter_future: {
    name: 'Sửa Tương Lai',
    code: 'Alt',
    short: 'Bí mật xem và sắp xếp lại 3 lá trên cùng.',
    emoji: '🪄',
    color: '#ae3ec9',
    desc: 'Bí mật xem và sắp xếp lại 3 lá trên cùng của chồng bài rút.',
  },
  share_future: {
    name: 'Hé Lộ Tương Lai',
    code: 'Shr',
    short: 'Xem, sắp xếp 3 lá trên cùng rồi cho người kế tiếp xem.',
    emoji: '👀',
    color: '#9c36b5',
    desc: 'Xem và sắp xếp lại 3 lá trên cùng của chồng bài rút, rồi cho người chơi kế tiếp xem các lá đó.',
  },
  dig_deeper: {
    name: 'Đào Sâu',
    code: 'Dig',
    short: 'Rút 1 lá, xem: giữ hoặc úp lại và rút lá kế tiếp.',
    emoji: '⛏️',
    color: '#099268',
    desc: 'Rút 1 lá và xem nó, rồi hoặc giữ lá đó, hoặc rút lá kế tiếp (bắt buộc giữ) và úp lá đầu tiên lại lên trên chồng bài rút.',
  },
  favor: {
    name: 'Xin Bài',
    code: 'Fav',
    short: 'Một người phải đưa bạn 1 lá do họ chọn.',
    emoji: '🙏',
    color: '#495057',
    desc: 'Một người chơi phải đưa cho bạn 1 lá bài do họ chọn.',
  },
  mark: {
    name: 'Cướp Nhắm',
    code: 'Mrk',
    short: 'Cướp ngẫu nhiên 1 lá của người khác.',
    emoji: '🏷️',
    color: '#343a40',
    desc: 'Cướp ngẫu nhiên 1 lá bài trên tay một người chơi khác.',
  },
  grave_robber: {
    name: 'Trộm Mộ',
    code: 'Grv',
    short: 'Người đã chết còn bài phải xáo 1 lá vào chồng rút.',
    emoji: '🪦',
    color: '#495057',
    desc: 'Tất cả người chơi đã chết còn bài trên tay phải chọn 1 lá để xáo vào chồng bài rút.',
  },
  nope: {
    name: 'Nope',
    code: 'Nop',
    short: 'Chặn hành động của người khác. Đánh lúc nào cũng được.',
    emoji: '✋',
    color: '#d23b2f',
    desc: 'Chặn hành động của người chơi khác. Có thể đánh bất cứ lúc nào.',
  },
  clone: {
    name: 'Nhân Bản',
    code: 'Cln',
    short: 'Trở thành lá nằm ngay bên dưới nó.',
    emoji: '🧬',
    color: '#7048e8',
    desc: 'Khi đánh, lá này trở thành lá nằm ngay bên dưới nó (lá trên đỉnh chồng bài bỏ).',
  },
  feral_cat: {
    name: 'Mèo Hoang',
    code: 'Fer',
    isCat: true,
    short: 'Dùng như bất kỳ lá mèo thường nào.',
    emoji: '🐾',
    color: '#f08c00',
    desc: 'Dùng như bất kỳ lá mèo thường nào.',
  },
  cat_potato: {
    name: 'Mèo Khoai Tây Lông',
    code: 'Cat1',
    emoji: '🥔',
    color: '#a9744f',
    isCat: true,
    short: 'Đánh đôi cùng loại để cướp ngẫu nhiên 1 lá.',
    desc: 'Lá mèo thường, đánh lẻ không có tác dụng. Đánh 2 lá cùng loại thành đôi để cướp ngẫu nhiên 1 lá bài của người chơi khác.',
  },
  cat_melon: {
    name: 'Mèo Dưa Hấu',
    code: 'Cat2',
    emoji: '🍉',
    color: '#2b8a3e',
    isCat: true,
    short: 'Đánh đôi cùng loại để cướp ngẫu nhiên 1 lá.',
    desc: 'Lá mèo thường, đánh lẻ không có tác dụng. Đánh 2 lá cùng loại thành đôi để cướp ngẫu nhiên 1 lá bài của người chơi khác.',
  },
  cat_bladder: {
    name: 'Mèo Mót Tè',
    code: 'Cat3',
    emoji: '🚽',
    color: '#1971c2',
    isCat: true,
    short: 'Đánh đôi cùng loại để cướp ngẫu nhiên 1 lá.',
    desc: 'Lá mèo thường, đánh lẻ không có tác dụng. Đánh 2 lá cùng loại thành đôi để cướp ngẫu nhiên 1 lá bài của người chơi khác.',
  },
  cat_schrodinger: {
    name: 'Mèo Schrödinger',
    code: 'Cat4',
    emoji: '📦',
    color: '#5c4033',
    isCat: true,
    short: 'Đánh đôi cùng loại để cướp ngẫu nhiên 1 lá.',
    desc: 'Lá mèo thường, đánh lẻ không có tác dụng. Đánh 2 lá cùng loại thành đôi để cướp ngẫu nhiên 1 lá bài của người chơi khác.',
  },
  cat_beard: {
    name: 'Mèo Râu Dê',
    code: 'Cat5',
    emoji: '🧔',
    color: '#862e9c',
    isCat: true,
    short: 'Đánh đôi cùng loại để cướp ngẫu nhiên 1 lá.',
    desc: 'Lá mèo thường, đánh lẻ không có tác dụng. Đánh 2 lá cùng loại thành đôi để cướp ngẫu nhiên 1 lá bài của người chơi khác.',
  },
};

/** Bộ bài chuẩn tích hợp đầy đủ các lá đặc biệt có sẵn trong database/ (tổng bài thường < 300). */
export const DECK_COUNTS: Record<Exclude<CardType, 'exploding'>, number> = {
  defuse: 12,
  attack: 8,
  targeted_attack: 4,
  personal_attack: 2,
  skip: 8,
  super_skip: 2,
  reverse: 4,
  draw_bottom: 4,
  catomic_bomb: 2,
  swap_top_bottom: 2,
  bury: 2,
  garbage_collection: 2,
  shuffle: 8,
  see_future: 10,
  alter_future: 4,
  share_future: 2,
  dig_deeper: 3,
  favor: 8,
  mark: 4,
  grave_robber: 2,
  nope: 10,
  clone: 3,
  feral_cat: 4,
  cat_potato: 8,
  cat_melon: 8,
  cat_bladder: 8,
  cat_schrodinger: 8,
  cat_beard: 8,
};

/** Luật nhà: mỗi người đúng 1 Gỡ Bom trên tay, không nhét thêm Gỡ Bom vào chồng bài */
export const EXTRA_DEFUSES_IN_DECK = 0;
/** Luật nhà: mỗi người 1 Mèo Nổ xáo trong chồng bài */
export const bombCount = (players: number) => players;

export const HAND_SIZE = 7;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

/** Thời gian (ms) – dùng chung để client vẽ vòng đếm ngược */
export const NOPE_WINDOW_MS = 4_000;
export const TURN_MS = 90_000;
export const PROMPT_MS = 30_000;

