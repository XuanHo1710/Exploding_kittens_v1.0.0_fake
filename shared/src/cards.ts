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

export const CARD_INFO: Record<CardType, CardInfo> = {
  exploding: {
    name: 'Mèo Nổ',
    code: 'Exp',
    short: 'Rút trúng mà không có Gỡ Bom là nổ tung.',
    emoji: '💣',
    color: '#23201f',
    desc: 'Rút trúng lá này phải dùng Gỡ Bom ngay lập tức; nếu không có Gỡ Bom sẽ nổ tung và bị loại khỏi ván chơi.',
  },
  defuse: {
    name: 'Gỡ Bom',
    code: 'Def',
    short: 'Cứu bạn khỏi Mèo Nổ. Chọn chỗ nhét bom lại.',
    emoji: '🧯',
    color: '#2f8f3e',
    desc: 'Tự động dùng khi rút trúng Mèo Nổ để thoát chết. Bạn được bí mật chọn vị trí nhét Mèo Nổ lại vào chồng bài rút.',
  },
  attack: {
    name: 'Tấn Công',
    code: 'Atk',
    short: 'Kết thúc lượt, người kế tiếp phải chơi 2 lượt.',
    emoji: '⚔️',
    color: '#e8590c',
    desc: 'Kết thúc lượt không cần rút bài. Người kế tiếp theo chiều vòng chơi phải đi 2 lượt (cộng dồn nếu bạn đang bị tấn công).',
  },
  targeted_attack: {
    name: 'Tấn Công Chỉ Định',
    code: 'Tat',
    short: 'Kết thúc lượt, chọn 1 người bất kỳ phải đi 2 lượt.',
    emoji: '🎯',
    color: '#d9480f',
    desc: 'Kết thúc lượt không cần rút bài và tự chọn bất kỳ 1 người chơi nào trên bàn phải gánh 2 lượt liên tiếp (cộng dồn nếu bạn đang nợ lượt).',
  },
  personal_attack: {
    name: 'Tự Tấn Công',
    code: 'Pat',
    short: 'Tự buộc chính mình đi 3 lượt liên tiếp.',
    emoji: '💥',
    color: '#c92a2a',
    desc: 'Đánh ra để tự buộc chính bạn phải đi 3 lượt liên tiếp (dùng khi muốn tiếp tục cầm lượt để xả bài hoặc phối hợp combo).',
  },
  skip: {
    name: 'Bỏ Lượt',
    code: 'Skp',
    short: 'Kết thúc 1 lượt mà không phải rút bài.',
    emoji: '🏃',
    color: '#1c7ed6',
    desc: 'Kết thúc ngay 1 lượt hiện tại của bạn mà không phải rút bài (nếu đang bị Tấn Công nợ 2 lượt thì giảm còn 1 lượt).',
  },
  super_skip: {
    name: 'Siêu Bỏ Lượt',
    code: 'Ssk',
    short: 'Kết thúc toàn bộ mọi lượt đang nợ mà không rút bài.',
    emoji: '🚀',
    color: '#1864ab',
    desc: 'Kết thúc toàn bộ tất cả các lượt bạn đang phải đi (kể cả khi bị Tấn Công cộng dồn nhiều lượt) mà không cần rút lá nào.',
  },
  reverse: {
    name: 'Đảo Chiều',
    code: 'Rev',
    short: 'Đảo ngược chiều vòng chơi và kết thúc 1 lượt.',
    emoji: '🔄',
    color: '#0b7285',
    desc: 'Đảo ngược chiều đánh của bàn chơi và kết thúc 1 lượt hiện tại của bạn mà không cần rút bài.',
  },
  draw_bottom: {
    name: 'Rút Đáy',
    code: 'Dfb',
    short: 'Kết thúc lượt bằng việc rút lá dưới đáy chồng bài.',
    emoji: '⬇️',
    color: '#0ca678',
    desc: 'Kết thúc 1 lượt bằng cách rút 1 lá ở dưới đáy chồng bài rút thay vì lá trên cùng (dùng để né Mèo Nổ đang nằm trên đỉnh).',
  },
  catomic_bomb: {
    name: 'Bom Nguyên Tử',
    code: 'Cmb',
    short: 'Gom hết Mèo Nổ lên đầu chồng bài & kết thúc lượt.',
    emoji: '☢️',
    color: '#e67700',
    desc: 'Rút toàn bộ Mèo Nổ ra khỏi chồng bài, xáo phần chồng bài còn lại, rồi đặt úp tất cả Mèo Nổ lên trên cùng chồng bài và kết thúc lượt của bạn không rút bài!',
  },
  swap_top_bottom: {
    name: 'Đảo Đầu Đuôi',
    code: 'Swp',
    short: 'Đổi chỗ lá trên cùng và lá dưới đáy chồng bài.',
    emoji: '🔃',
    color: '#5f3dc4',
    desc: 'Hoán đổi vị trí lá bài đầu tiên trên đỉnh và lá bài cuối cùng dưới đáy của chồng bài rút mà không xem bài.',
  },
  bury: {
    name: 'Chôn Bài',
    code: 'Bry',
    short: 'Rút lá đầu, giấu lại vào chồng bài & kết thúc lượt.',
    emoji: '🕳️',
    color: '#6741d9',
    desc: 'Kết thúc 1 lượt bằng cách bí mật xem lá bài trên cùng của chồng bài rút rồi chôn (nhét) nó lại vào giữa chồng bài mà không kích nổ.',
  },
  garbage_collection: {
    name: 'Thu Gom Rác',
    code: 'Gar',
    short: 'Mỗi người trả 1 lá vào chồng bài rồi xáo tung lại.',
    emoji: '♻️',
    color: '#3b5bdb',
    desc: 'Mỗi người chơi còn sống có bài trên tay bị thu 1 lá bài ngẫu nhiên trả vào chồng bài rút, sau đó xáo tung toàn bộ chồng bài.',
  },
  shuffle: {
    name: 'Xáo Bài',
    code: 'Shf',
    short: 'Xáo lại toàn bộ chồng bài rút.',
    emoji: '🔀',
    color: '#7b5230',
    desc: 'Xáo trộn ngẫu nhiên toàn bộ chồng bài rút để phá vỡ thứ tự các lá bài.',
  },
  see_future: {
    name: 'Xem Trước',
    code: 'See',
    short: 'Bí mật xem các lá trên cùng của chồng bài.',
    emoji: '🔮',
    color: '#d6336c',
    desc: 'Bí mật xem các lá bài trên cùng của chồng bài rút (mặc định 3 lá) rồi đặt lại nguyên thứ tự cũ.',
  },
  alter_future: {
    name: 'Sửa Tương Lai',
    code: 'Alt',
    short: 'Xem các lá đầu và đẩy Mèo Nổ xuống dưới.',
    emoji: '🪄',
    color: '#ae3ec9',
    desc: 'Bí mật xem các lá trên cùng của chồng bài rút và sắp xếp lại thứ tự để đẩy các lá Mèo Nổ xuống dưới các lá an toàn.',
  },
  share_future: {
    name: 'Hé Lộ Tương Lai',
    code: 'Shr',
    short: 'Xem các lá đầu và cho người kế tiếp cùng thấy.',
    emoji: '👀',
    color: '#9c36b5',
    desc: 'Xem và sắp xếp các lá bài trên cùng của chồng bài rút, sau đó cho người chơi kế tiếp cùng nhìn thấy những lá đó.',
  },
  dig_deeper: {
    name: 'Đào Sâu',
    code: 'Dig',
    short: 'Bỏ qua lá đầu nguy hiểm, rút lá kế tiếp & kết thúc lượt.',
    emoji: '⛏️',
    color: '#099268',
    desc: 'Kết thúc 1 lượt bằng cách đào qua lá trên cùng (nếu nguy hiểm) để rút lá bài an toàn bên dưới trong chồng bài rút.',
  },
  favor: {
    name: 'Xin Bài',
    code: 'Fav',
    short: 'Bắt 1 người tự chọn 1 lá đưa cho bạn.',
    emoji: '🙏',
    color: '#495057',
    desc: 'Chọn 1 người chơi khác, họ buộc phải tự chọn 1 lá bài trên tay để đưa cho bạn.',
  },
  mark: {
    name: 'Cướp Nhắm',
    code: 'Mrk',
    short: 'Bốc 1 lá úp từ tay 1 người chơi.',
    emoji: '🏷️',
    color: '#343a40',
    desc: 'Chọn 1 người chơi khác: bài của họ được úp xuống và xáo vị trí, bạn tự bốc 1 lá về tay (hên xui trúng lá ngon).',
  },
  grave_robber: {
    name: 'Trộm Mộ',
    code: 'Grv',
    short: 'Lấy lại 1 lá bài tự chọn từ chồng bài bỏ.',
    emoji: '🪦',
    color: '#495057',
    desc: 'Chọn và lấy lại 1 lá bài từ chồng bài bỏ về tay bạn (trừ Mèo Nổ).',
  },
  nope: {
    name: 'Nope',
    code: 'Nop',
    short: 'Chặn 1 hành động. Đánh lúc nào cũng được.',
    emoji: '✋',
    color: '#d23b2f',
    desc: 'Chặn 1 hành động vừa đánh (trừ Mèo Nổ, Gỡ Bom). Đánh được cả ngoài lượt. Đánh Nope chồng lên Nope sẽ tạo thành Yup! khôi phục hành động.',
  },
  clone: {
    name: 'Nhân Bản',
    code: 'Cln',
    short: 'Sao chép lá vừa đánh hoặc dùng ghép Đôi/Bộ ba.',
    emoji: '🧬',
    color: '#7048e8',
    desc: 'Khi đánh lẻ sẽ sao chép hiệu ứng của lá chức năng nằm trên đỉnh chồng bài bỏ; hoặc dùng làm lá đại diện ghép Đôi / Bộ ba với mọi loại mèo.',
  },
  feral_cat: {
    name: 'Mèo Hoang',
    code: 'Fer',
    isCat: true,
    short: 'Mèo đại diện: ghép Đôi / Bộ ba với mọi loại Mèo.',
    emoji: '🐾',
    color: '#f08c00',
    desc: 'Lá Mèo Hoang vạn năng: có thể ghép Đôi hoặc Bộ ba thay thế cho bất kỳ loại Mèo thường nào để cướp bài đối phương.',
  },
  cat_potato: {
    name: 'Mèo Khoai Tây Lông',
    code: 'Cat1',
    emoji: '🥔',
    color: '#a9744f',
    isCat: true,
    short: 'Đôi: bốc 1 lá úp. Ba: đòi đúng lá muốn.',
    desc: 'Mèo thường. Đánh Đôi (cùng loại hoặc ghép với Mèo Hoang/Nhân Bản): bốc 1 lá úp của đối thủ. Bộ ba: gọi tên lá muốn lấy.',
  },
  cat_melon: {
    name: 'Mèo Dưa Hấu',
    code: 'Cat2',
    emoji: '🍉',
    color: '#2b8a3e',
    isCat: true,
    short: 'Đôi: bốc 1 lá úp. Ba: đòi đúng lá muốn.',
    desc: 'Mèo thường. Đánh Đôi (cùng loại hoặc ghép với Mèo Hoang/Nhân Bản): bốc 1 lá úp của đối thủ. Bộ ba: gọi tên lá muốn lấy.',
  },
  cat_bladder: {
    name: 'Mèo Mót Tè',
    code: 'Cat3',
    emoji: '🚽',
    color: '#1971c2',
    isCat: true,
    short: 'Đôi: bốc 1 lá úp. Ba: đòi đúng lá muốn.',
    desc: 'Mèo thường. Đánh Đôi (cùng loại hoặc ghép với Mèo Hoang/Nhân Bản): bốc 1 lá úp của đối thủ. Bộ ba: gọi tên lá muốn lấy.',
  },
  cat_schrodinger: {
    name: 'Mèo Schrödinger',
    code: 'Cat4',
    emoji: '📦',
    color: '#5c4033',
    isCat: true,
    short: 'Đôi: bốc 1 lá úp. Ba: đòi đúng lá muốn.',
    desc: 'Mèo thường. Đánh Đôi (cùng loại hoặc ghép với Mèo Hoang/Nhân Bản): bốc 1 lá úp của đối thủ. Bộ ba: gọi tên lá muốn lấy.',
  },
  cat_beard: {
    name: 'Mèo Râu Dê',
    code: 'Cat5',
    emoji: '🧔',
    color: '#862e9c',
    isCat: true,
    short: 'Đôi: bốc 1 lá úp. Ba: đòi đúng lá muốn.',
    desc: 'Mèo thường. Đánh Đôi (cùng loại hoặc ghép với Mèo Hoang/Nhân Bản): bốc 1 lá úp của đối thủ. Bộ ba: gọi tên lá muốn lấy.',
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

