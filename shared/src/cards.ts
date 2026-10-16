export type CardType =
  | 'exploding'
  | 'defuse'
  | 'attack'
  | 'skip'
  | 'favor'
  | 'shuffle'
  | 'see_future'
  | 'nope'
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
  /** Mô tả đầy đủ (bảng luật) */
  desc: string;
  /** Mô tả ngắn in trên mặt lá */
  short: string;
  emoji: string;
  color: string;
  isCat?: boolean;
}

export const CARD_INFO: Record<CardType, CardInfo> = {
  exploding: { name: 'Mèo Nổ', short: 'Rút trúng mà không có Gỡ Bom là bị loại.', emoji: '💣', color: '#23201f', desc: 'Rút trúng mà không có Gỡ Bom thì bị loại.' },
  defuse: { name: 'Gỡ Bom', short: 'Cứu bạn khỏi Mèo Nổ. Chọn chỗ nhét bom lại.', emoji: '🧯', color: '#2f8f3e', desc: 'Tự động dùng khi rút trúng Mèo Nổ. Bạn chọn chỗ nhét Mèo Nổ lại vào chồng bài.' },
  attack: { name: 'Tấn Công', short: 'Kết thúc lượt, người sau phải chơi 2 lượt.', emoji: '⚔️', color: '#e8590c', desc: 'Kết thúc lượt không rút bài. Người kế tiếp phải chơi 2 lượt (cộng dồn nếu bạn đang bị tấn công).' },
  skip: { name: 'Bỏ Lượt', short: 'Kết thúc lượt mà không phải rút bài.', emoji: '🏃', color: '#1c7ed6', desc: 'Kết thúc 1 lượt mà không rút bài.' },
  favor: { name: 'Xin Bài', short: 'Bắt 1 người tự chọn 1 lá đưa cho bạn.', emoji: '🙏', color: '#495057', desc: 'Chọn 1 người, họ phải tự chọn 1 lá đưa cho bạn.' },
  shuffle: { name: 'Xáo Bài', short: 'Xáo lại toàn bộ chồng bài.', emoji: '🔀', color: '#7b5230', desc: 'Xáo lại chồng bài.' },
  see_future: { name: 'Xem Trước', short: 'Bí mật xem 3 lá trên cùng.', emoji: '🔮', color: '#d6336c', desc: 'Bí mật xem 3 lá trên cùng của chồng bài.' },
  nope: { name: 'Nope', short: 'Chặn 1 hành động. Đánh lúc nào cũng được.', emoji: '✋', color: '#d23b2f', desc: 'Chặn 1 hành động (trừ Mèo Nổ, Gỡ Bom). Đánh được cả ngoài lượt. Nope được Nope.' },
  cat_potato: { name: 'Mèo Khoai Tây Lông', emoji: '🥔', color: '#a9744f', isCat: true, short: 'Đôi: cướp ngẫu nhiên 1 lá. Ba: đòi đúng lá muốn.', desc: 'Mèo thường. Đôi: rút ngẫu nhiên 1 lá. Bộ ba: gọi tên lá muốn lấy.' },
  cat_melon: { name: 'Mèo Dưa Hấu', emoji: '🍉', color: '#2b8a3e', isCat: true, short: 'Đôi: cướp ngẫu nhiên 1 lá. Ba: đòi đúng lá muốn.', desc: 'Mèo thường. Đôi: rút ngẫu nhiên 1 lá. Bộ ba: gọi tên lá muốn lấy.' },
  cat_bladder: { name: 'Mèo Mót Tè', emoji: '🚽', color: '#1971c2', isCat: true, short: 'Đôi: cướp ngẫu nhiên 1 lá. Ba: đòi đúng lá muốn.', desc: 'Mèo thường. Đôi: rút ngẫu nhiên 1 lá. Bộ ba: gọi tên lá muốn lấy.' },
  cat_schrodinger: { name: 'Mèo Schrödinger', emoji: '📦', color: '#5c4033', isCat: true, short: 'Đôi: cướp ngẫu nhiên 1 lá. Ba: đòi đúng lá muốn.', desc: 'Mèo thường. Đôi: rút ngẫu nhiên 1 lá. Bộ ba: gọi tên lá muốn lấy.' },
  cat_beard: { name: 'Mèo Râu Dê', emoji: '🧔', color: '#862e9c', isCat: true, short: 'Đôi: cướp ngẫu nhiên 1 lá. Ba: đòi đúng lá muốn.', desc: 'Mèo thường. Đôi: rút ngẫu nhiên 1 lá. Bộ ba: gọi tên lá muốn lấy.' },
};

/** Bộ bài gốc nhân đôi để đủ cho 8–10 người. Gỡ Bom và Mèo Nổ chia theo số người (xem bên dưới). */
export const DECK_COUNTS: Record<Exclude<CardType, 'exploding'>, number> = {
  defuse: 12,
  attack: 8,
  skip: 8,
  favor: 8,
  shuffle: 8,
  see_future: 10,
  nope: 10,
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
