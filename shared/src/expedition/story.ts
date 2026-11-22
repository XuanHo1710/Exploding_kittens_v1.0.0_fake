/**
 * Cốt truyện "Bản Hòa Ca Bảy Sắc" — từ Mở Đầu tới Hồi Kết (cảnh phim + hội thoại).
 *
 * Tóm tắt: bầu trời Quang Phổ là bức họa sống được Họa Sư Tinh Tú Seraphina tô lại mỗi bình minh.
 * Từ khi "Vĩnh Dạ" bắt đầu, màu sắc bị rút khỏi 7 vùng đất, các Hộ Vệ bị Mực Hư Vô nuốt chửng.
 * Đoàn Thám Hiểm rời Làng Bình Minh để thu hồi 7 Sắc Ấn — và dần phát hiện chính Seraphina
 * đang rút màu thế giới để vẽ lại "Bức Họa Thứ Tám", nơi em gái nàng đã biến mất.
 *
 * Mỗi cảnh có `trigger`: start | enter:<mapId> | pre_boss:<bossId> | post_boss:<bossId>.
 * Client phát cảnh khi trigger xảy ra lần đầu và gửi `exp:story_seen` để server ghi nhận.
 */

import type { RealmMapId } from './types';

export interface StorySpeaker {
  nameVi: string;
  /** chân dung: 'hero:<heroId>' | 'boss:<spriteKey>' | undefined (chỉ chữ) */
  portrait?: string;
  color: string;
}

export const STORY_SPEAKERS: Record<string, StorySpeaker> = {
  narrator: { nameVi: '', color: '#cbd5e1' },
  gustave_blade: { nameVi: 'Miran', portrait: 'hero:gustave_blade', color: '#34d399' },
  celine_prism: { nameVi: 'Karen', portrait: 'hero:celine_prism', color: '#fde047' },
  bastian_aegis: { nameVi: 'Park', portrait: 'hero:bastian_aegis', color: '#fb923c' },
  elder: { nameVi: 'Trưởng Làng Bình Minh', color: '#a3e635' },
  sylvan_warden: { nameVi: 'Sylvan Warden', portrait: 'boss:sylvan_warden', color: '#4ade80' },
  boreal_chevalier: { nameVi: 'Boreal Chevalier', portrait: 'boss:boreal_chevalier', color: '#7dd3fc' },
  chronos_khepri: { nameVi: 'Chronos Khepri', portrait: 'boss:chronos_khepri', color: '#facc15' },
  leviathan_sovereign: { nameVi: 'Leviathan Sovereign', portrait: 'boss:leviathan_sovereign', color: '#38bdf8' },
  vulcan_titan: { nameVi: 'Vulcan Titan', portrait: 'boss:vulcan_titan', color: '#f97316' },
  nocturne_weaver: { nameVi: 'Nocturne Weaver', portrait: 'boss:nocturne_weaver', color: '#c084fc' },
  seraphina: { nameVi: 'Seraphina', portrait: 'boss:astral_painter_seraphina', color: '#f0abfc' },
};

export type StoryTrigger =
  | { kind: 'start' }
  | { kind: 'enter'; mapId: RealmMapId }
  | { kind: 'pre_boss'; bossId: string }
  | { kind: 'post_boss'; bossId: string };

export interface StoryLine {
  speaker: keyof typeof STORY_SPEAKERS | string;
  text: string;
}

export interface StoryScene {
  sceneId: string;
  chapter: number;
  /** tiêu đề chương (thẻ tiêu đề hiện ở đầu cảnh) */
  titleVi: string;
  subtitleVi?: string;
  trigger: StoryTrigger;
  bgMapId: RealmMapId;
  mood: 'dawn' | 'day' | 'dusk' | 'night' | 'void' | 'aurora';
  lines: readonly StoryLine[];
  /** cảnh kết: hiện danh đề sau cùng */
  credits?: boolean;
}

const L = (speaker: string, text: string): StoryLine => ({ speaker, text });

export const EXPEDITION_STORY: readonly StoryScene[] = [
  // ------------------------------------------------------------ MỞ ĐẦU
  {
    sceneId: 'prologue',
    chapter: 0,
    titleVi: 'Mở Đầu — Bình Minh Cuối Cùng',
    subtitleVi: 'Làng Bình Minh, rìa Đồng Cỏ Khởi Nguyên',
    trigger: { kind: 'start' },
    bgMapId: '01-dawn-meadow',
    mood: 'void',
    lines: [
      L('narrator', 'Ngày xưa, bầu trời Quang Phổ là một bức họa sống. Mỗi bình minh, Họa Sư Tinh Tú Seraphina lại tô lên đó bảy sắc màu.'),
      L('narrator', 'Bảy sắc chảy xuống bảy vùng đất qua bảy Sắc Ấn, do bảy Hộ Vệ canh giữ. Cỏ xanh vì thế mà xanh, tuyết trắng vì thế mà trắng.'),
      L('narrator', 'Cho đến đêm mà người ta gọi là Vĩnh Dạ. Bình minh không tới nữa. Từng mảng thế giới bắt đầu Hóa Tro — xám, lạnh và câm lặng.'),
      L('elder', 'Ba mươi ngày rồi, mặt trời chỉ còn là một vệt mực loang. Đàn bò trên đồi đã hóa thành tượng tro…'),
      L('gustave_blade', 'Vì thế chúng tôi ở đây, trưởng làng. Đoàn Thám Hiểm Tinh Tú sẽ lên đường ngay sáng nay — nếu còn gọi được là sáng.'),
      L('celine_prism', 'Tôi từng học vẽ dưới tay Họa Sư Seraphina. Nét mực đang nuốt thế giới này… không phải của một kẻ lạ. Tôi nhận ra cách nàng đưa cọ.'),
      L('bastian_aegis', 'Dù là ai, khiên của ta vẫn chắn được. Miran, ngươi dẫn đường. Karen lo phần màu sắc. Ta lo phần đỡ đòn.'),
      L('elder', 'Hãy tìm Sylvan Warden ở cuối đồng cỏ. Nếu Sắc Ấn Lục còn, cỏ cây sẽ thở lại.'),
      L('narrator', 'HƯỚNG DẪN · Di chuyển bằng WASD. Chạm quái để vào trận. Ra đòn: bấm SPACE đúng lúc vòng sáng khép lại. Khi địch đánh: SPACE để Đỡ, D để Né — đỡ trọn mọi nhịp sẽ PHẢN KÍCH.'),
      L('narrator', 'Quái nhỏ dạo quanh bản đồ có thể rớt Bùa Hộ Mệnh. Mỗi anh hùng tích "Cộng Hưởng" riêng — hãy xả nó bằng kỹ năng bộc phát khi đầy.'),
    ],
  },

  // ------------------------------------------------------------ CHƯƠNG I
  {
    sceneId: 'enter:01-dawn-meadow',
    chapter: 1,
    titleVi: 'Chương I — Đồng Cỏ Khởi Nguyên',
    subtitleVi: 'Nơi gió sớm vẫn còn nhớ màu xanh',
    trigger: { kind: 'enter', mapId: '01-dawn-meadow' },
    bgMapId: '01-dawn-meadow',
    mood: 'dawn',
    lines: [
      L('gustave_blade', 'Nhìn kìa — cỏ ở đây còn xanh, nhưng từng vệt xám đang bò vào như mực thấm giấy.'),
      L('celine_prism', 'Đó là nét cọ khô. Ai đó đang "rút màu" khỏi thảo nguyên, từng nét một.'),
      L('bastian_aegis', 'Ba kẻ gác cổng chặn đường tới cổ thụ. Hạ chúng thì rào chắn sẽ mở.'),
      L('gustave_blade', 'Nhớ nhé: cỏ cây sợ lửa. Park, ngọn lửa của ngươi sẽ khắc chế đám này.'),
    ],
  },
  {
    sceneId: 'pre_boss:sylvan_warden',
    chapter: 1,
    titleVi: 'Ancient Forest Guardian',
    trigger: { kind: 'pre_boss', bossId: 'sylvan_warden' },
    bgMapId: '01-dawn-meadow',
    mood: 'day',
    lines: [
      L('sylvan_warden', 'Rễ ta… đau… Mực đen chảy trong thân ta như nhựa độc…'),
      L('celine_prism', 'Hộ Vệ! Sắc Ấn Lục đang bị nhuộm đen. Chúng tôi đến để giúp ngài!'),
      L('sylvan_warden', 'Giúp ư? Nàng cũng nói vậy… rồi rút đi màu xanh của ta. ĐI ĐI!'),
      L('gustave_blade', 'Không còn đường lui. Đội hình chuẩn bị — đỡ đòn dây leo, rồi phản kích!'),
    ],
  },
  {
    sceneId: 'post_boss:sylvan_warden',
    chapter: 1,
    titleVi: 'Sắc Ấn Lục',
    trigger: { kind: 'post_boss', bossId: 'sylvan_warden' },
    bgMapId: '01-dawn-meadow',
    mood: 'dawn',
    lines: [
      L('narrator', 'Mực đen rỉ khỏi vỏ cây. Một viên ấn màu lục rơi vào tay Karen, ấm như hơi thở.'),
      L('sylvan_warden', 'Cảm ơn… lữ khách. Nàng không ác… nàng đang tìm một màu đã mất. Một màu không có tên.'),
      L('celine_prism', '"Nàng"… là Seraphina, phải không?'),
      L('sylvan_warden', 'Hãy lên Đỉnh Tuyết. Kỵ Sĩ Boreal giữ lời thề với nàng lâu hơn bất kỳ ai.'),
      L('gustave_blade', 'Cổng phía đông đã mở. Đi thôi — trước khi tuyết cũng hóa tro.'),
    ],
  },

  // ------------------------------------------------------------ CHƯƠNG II
  {
    sceneId: 'enter:02-everfrost-peaks',
    chapter: 2,
    titleVi: 'Chương II — Đỉnh Tuyết Vĩnh Cửu',
    subtitleVi: 'Lời thề đông cứng trên đèo cao',
    trigger: { kind: 'enter', mapId: '02-everfrost-peaks' },
    bgMapId: '02-everfrost-peaks',
    mood: 'day',
    lines: [
      L('bastian_aegis', 'Lạnh tới mức lửa trong khiên ta cũng co lại.'),
      L('celine_prism', 'Tuyết ở đây không trắng — nó trong suốt. Màu trắng đã bị lấy mất.'),
      L('gustave_blade', 'Băng sợ lửa, nhưng cẩn thận Tê Cóng: dính đủ ba tầng là đóng băng mất lượt.'),
    ],
  },
  {
    sceneId: 'pre_boss:boreal_chevalier',
    chapter: 2,
    titleVi: 'Eternal Frost Knight',
    trigger: { kind: 'pre_boss', bossId: 'boreal_chevalier' },
    bgMapId: '02-everfrost-peaks',
    mood: 'dusk',
    lines: [
      L('boreal_chevalier', 'Dừng lại. Ta đã thề với Họa Sư: không kẻ nào qua đèo này cho tới khi bức họa của nàng hoàn thành.'),
      L('gustave_blade', 'Bức họa nào đáng giá bằng cả thế giới hóa tro?'),
      L('boreal_chevalier', 'Ngươi không hiểu. Không ai hiểu. Giáp băng của ta sẽ không vỡ — trừ khi các ngươi đủ sức Phá Thế!'),
    ],
  },
  {
    sceneId: 'post_boss:boreal_chevalier',
    chapter: 2,
    titleVi: 'Sắc Ấn Bạch',
    trigger: { kind: 'post_boss', bossId: 'boreal_chevalier' },
    bgMapId: '02-everfrost-peaks',
    mood: 'dawn',
    lines: [
      L('boreal_chevalier', 'Giáp ta… vỡ rồi. Vậy là lời thề cũng nên vỡ theo.'),
      L('boreal_chevalier', 'Họa Sư từng có một người em gái, Celesta — người pha màu cho mọi bình minh. Một ngày, cô bé bước vào bức họa thứ tám… và không trở ra.'),
      L('celine_prism', 'Bức họa thứ tám? Thầy chưa bao giờ nhắc tới…'),
      L('boreal_chevalier', 'Vì nó chưa từng được vẽ xong. Hãy tới Sa Mạc Lãng Quên — Pharaoh Khepri giữ những gì thời gian muốn chôn vùi.'),
    ],
  },

  // ------------------------------------------------------------ CHƯƠNG III
  {
    sceneId: 'enter:03-sunken-dunes',
    chapter: 3,
    titleVi: 'Chương III — Sa Mạc Lãng Quên',
    subtitleVi: 'Nơi cát chảy ngược và ký ức bị chôn',
    trigger: { kind: 'enter', mapId: '03-sunken-dunes' },
    bgMapId: '03-sunken-dunes',
    mood: 'day',
    lines: [
      L('gustave_blade', 'Đồng hồ cát khổng lồ… cát trong đó đang chảy ngược lên trời.'),
      L('bastian_aegis', 'Thời gian ở đây hỏng rồi. Đánh nhanh, đừng để bị Trì Hoãn.'),
      L('celine_prism', 'Hệ Nhật Quang của tôi bị sa mạc kháng lại. Ai có hệ Hàn Băng thì đây là lúc tỏa sáng.'),
    ],
  },
  {
    sceneId: 'pre_boss:chronos_khepri',
    chapter: 3,
    titleVi: 'Hourglass Pharaoh',
    trigger: { kind: 'pre_boss', bossId: 'chronos_khepri' },
    bgMapId: '03-sunken-dunes',
    mood: 'dusk',
    lines: [
      L('chronos_khepri', 'Các ngươi tới để lấy lại thời gian ư? Ta đã cho Họa Sư mượn nó. Mượn từng ngày bình minh của thế giới.'),
      L('celine_prism', 'Để làm gì?!'),
      L('chronos_khepri', 'Để vẽ lại một khoảnh khắc đã mất. Nếu muốn nghe tiếp, hãy sống sót qua cơn mưa thiên thạch của ta.'),
    ],
  },
  {
    sceneId: 'post_boss:chronos_khepri',
    chapter: 3,
    titleVi: 'Sắc Ấn Kim',
    trigger: { kind: 'post_boss', bossId: 'chronos_khepri' },
    bgMapId: '03-sunken-dunes',
    mood: 'dawn',
    lines: [
      L('chronos_khepri', 'Cát đã chảy xuôi lại… Được rồi, nghe đây: mỗi Sắc Ấn nàng rút đi là một nét trong Bức Họa Thứ Tám.'),
      L('chronos_khepri', 'Khi bảy nét đủ, nàng tin em gái sẽ bước ra. Nhưng cái giá… là bảy vùng đất mãi mãi Hóa Tro.'),
      L('gustave_blade', 'Một người đổi lấy cả thế giới. Nàng không thấy điều đó sai sao?'),
      L('celine_prism', 'Nỗi đau làm người ta mù màu, Miran. Tôi… hiểu thầy hơn tôi muốn.'),
    ],
  },

  // ------------------------------------------------------------ CHƯƠNG IV
  {
    sceneId: 'enter:04-abyssal-sanctum',
    chapter: 4,
    titleVi: 'Chương IV — Thủy Cung Thẳm Sâu',
    subtitleVi: 'Nơi ký ức chìm xuống đáy biển',
    trigger: { kind: 'enter', mapId: '04-abyssal-sanctum' },
    bgMapId: '04-abyssal-sanctum',
    mood: 'night',
    lines: [
      L('bastian_aegis', 'Nước nặng như chì. Lửa của ta bị dập — ở đây ta chỉ là một bức tường.'),
      L('celine_prism', 'Những bong bóng kia… mỗi cái chứa một ký ức. Tôi thấy mình hồi nhỏ, đang rửa cọ cho thầy.'),
      L('gustave_blade', 'Thủy sợ Phong Mộc. Kiếm của ta sẽ mở đường.'),
    ],
  },
  {
    sceneId: 'pre_boss:leviathan_sovereign',
    chapter: 4,
    titleVi: 'Chúa Tể Thủy Cung',
    trigger: { kind: 'pre_boss', bossId: 'leviathan_sovereign' },
    bgMapId: '04-abyssal-sanctum',
    mood: 'night',
    lines: [
      L('leviathan_sovereign', 'Ta nuốt những ký ức nàng không chịu nổi. Tiếng cười của em gái nàng. Ngày cuối cùng.'),
      L('leviathan_sovereign', 'Các ngươi muốn trả chúng lại cho nàng? Sẽ giết nàng mất. Ta sẽ nhấn chìm các ngươi trước.'),
      L('gustave_blade', 'Sóng thần sẽ rút AP nếu không đỡ — mọi người tập trung vào nhịp!'),
    ],
  },
  {
    sceneId: 'post_boss:leviathan_sovereign',
    chapter: 4,
    titleVi: 'Sắc Ấn Thủy',
    trigger: { kind: 'post_boss', bossId: 'leviathan_sovereign' },
    bgMapId: '04-abyssal-sanctum',
    mood: 'dawn',
    lines: [
      L('narrator', 'Hàng ngàn bong bóng ký ức vỡ ra cùng lúc. Trong một cái, Karen thấy Celesta đang dạy mình pha màu tím.'),
      L('celine_prism', 'Tôi… từng gặp cô ấy. Chị Celesta là người đầu tiên đặt cọ vào tay tôi.'),
      L('bastian_aegis', 'Vậy nàng Họa Sư mất cả em gái lẫn ký ức về em gái. Chẳng trách nét cọ thành mực đen.'),
      L('gustave_blade', 'Đi tiếp. Lò Rèn Bazan — nơi cây cọ của Seraphina được rèn ra.'),
    ],
  },

  // ------------------------------------------------------------ CHƯƠNG V
  {
    sceneId: 'enter:05-cinder-caldera',
    chapter: 5,
    titleVi: 'Chương V — Miệng Núi Lửa Rực Cháy',
    subtitleVi: 'Lò rèn nơi cây cọ đầu tiên ra đời',
    trigger: { kind: 'enter', mapId: '05-cinder-caldera' },
    bgMapId: '05-cinder-caldera',
    mood: 'dusk',
    lines: [
      L('bastian_aegis', 'Ta lớn lên ở đây. Cha ta là thợ phụ của Vulcan — chính tay ông ấy rèn cán cọ của Họa Sư.'),
      L('gustave_blade', 'Ngươi chưa từng kể.'),
      L('bastian_aegis', 'Vì ta xấu hổ. Cây cọ ấy giờ đang xóa thế giới. Lần này, ta sẽ sửa sai của lò rèn này.'),
      L('celine_prism', 'Cẩn thận Thiêu Đốt — nó cộng dồn từng tầng. Tôi sẽ thanh tẩy khi cần.'),
    ],
  },
  {
    sceneId: 'pre_boss:vulcan_titan',
    chapter: 5,
    titleVi: 'Đại Tướng Lò Rèn',
    trigger: { kind: 'pre_boss', bossId: 'vulcan_titan' },
    bgMapId: '05-cinder-caldera',
    mood: 'dusk',
    lines: [
      L('vulcan_titan', 'Con trai của thợ phụ. Ngươi mang khiên của cha ngươi tới để chống lại cái lò đã nuôi ngươi?'),
      L('bastian_aegis', 'Ta mang nó tới để dập lửa cho đúng chỗ, Vulcan.'),
      L('vulcan_titan', 'Vậy hãy chịu nổi búa của ta. Đập vỡ giáp ta bằng Phá Thế — nếu ngươi làm được!'),
    ],
  },
  {
    sceneId: 'post_boss:vulcan_titan',
    chapter: 5,
    titleVi: 'Sắc Ấn Hỏa',
    trigger: { kind: 'post_boss', bossId: 'vulcan_titan' },
    bgMapId: '05-cinder-caldera',
    mood: 'dawn',
    lines: [
      L('vulcan_titan', 'Lửa của ngươi… giống cha ngươi. Thứ lửa giữ ấm, không thiêu rụi.'),
      L('vulcan_titan', 'Cây cọ ấy ta rèn bằng một mảnh sao rơi. Nó vẽ được những gì người cầm nó tin là thật. Nàng tin em gái vẫn còn ở đâu đó.'),
      L('celine_prism', 'Nếu cây cọ vẽ được niềm tin… thì nó cũng vẽ được sự buông bỏ.'),
    ],
  },

  // ------------------------------------------------------------ CHƯƠNG VI
  {
    sceneId: 'enter:06-nocturne-veil',
    chapter: 6,
    titleVi: 'Chương VI — Vùng Ban Đêm Huyền Ảo',
    subtitleVi: 'Thung lũng của những giấc mơ dệt dở',
    trigger: { kind: 'enter', mapId: '06-nocturne-veil' },
    bgMapId: '06-nocturne-veil',
    mood: 'night',
    lines: [
      L('narrator', 'Một bóng người đứng giữa đồng hoa dạ quang. Mái tóc như dải ngân hà, tay cầm cây cọ dài như ngọn thương.'),
      L('seraphina', 'Karen. Con đã lớn. Con mang theo cả những Sắc Ấn của ta nữa.'),
      L('celine_prism', 'Thầy! Dừng lại đi. Chị Celesta sẽ không muốn thế giới này chết vì chị ấy!'),
      L('seraphina', 'Con không biết em ấy muốn gì. Ta cũng không còn nhớ. Đó là lý do ta phải vẽ em ấy trở lại.'),
      L('narrator', 'Bóng người tan vào màn đêm như một nét mực.'),
    ],
  },
  {
    sceneId: 'pre_boss:nocturne_weaver',
    chapter: 6,
    titleVi: 'Nữ Hoàng Nguyệt Ảnh',
    trigger: { kind: 'pre_boss', bossId: 'nocturne_weaver' },
    bgMapId: '06-nocturne-veil',
    mood: 'night',
    lines: [
      L('nocturne_weaver', 'Ta dệt giấc mơ cho Họa Sư mỗi đêm — giấc mơ em gái nàng mỉm cười. Các ngươi muốn xé tấm vải ấy sao?'),
      L('gustave_blade', 'Giấc mơ không phải là người thật.'),
      L('nocturne_weaver', 'Đôi khi giấc mơ là tất cả những gì còn lại. Cẩn thận nhịp nhử của ta — đòn thật luôn đến trễ!'),
    ],
  },
  {
    sceneId: 'post_boss:nocturne_weaver',
    chapter: 6,
    titleVi: 'Sắc Ấn Tử',
    trigger: { kind: 'post_boss', bossId: 'nocturne_weaver' },
    bgMapId: '06-nocturne-veil',
    mood: 'dawn',
    lines: [
      L('nocturne_weaver', 'Sợi cuối cùng đã đứt… Nàng đang đợi ở Đỉnh Cực Quang, nơi bầu trời gần mặt đất nhất.'),
      L('nocturne_weaver', 'Nàng có sáu Sắc Ấn trong tim — các ngươi có sáu trong tay. Bức Họa Thứ Tám sẽ được vẽ… bằng màu của ai, là do các ngươi.'),
      L('bastian_aegis', 'Lần đầu tiên ta thấy sợ. Không phải sợ thua — sợ thắng mà vẫn mất tất cả.'),
      L('gustave_blade', 'Chúng ta không đi để thắng. Chúng ta đi để đưa bình minh trở lại.'),
    ],
  },

  // ------------------------------------------------------------ CHƯƠNG VII
  {
    sceneId: 'enter:07-aurora-zenith',
    chapter: 7,
    titleVi: 'Chương VII — Đỉnh Cực Quang',
    subtitleVi: 'Nơi bức họa cuối cùng đang chờ nét chót',
    trigger: { kind: 'enter', mapId: '07-aurora-zenith' },
    bgMapId: '07-aurora-zenith',
    mood: 'aurora',
    lines: [
      L('celine_prism', 'Dải cực quang này… là những nét cọ. Cả bầu trời là một bức tranh dang dở.'),
      L('gustave_blade', 'Hai Thiên Sứ canh cổng. Sau họ là Seraphina.'),
      L('bastian_aegis', 'Ta sẽ đứng trước. Dù búa, dù kiếm, dù cọ — đỡ được hết.'),
    ],
  },
  {
    sceneId: 'pre_boss:astral_painter_seraphina',
    chapter: 7,
    titleVi: 'Vĩnh Dạ Quang Phổ Vương',
    trigger: { kind: 'pre_boss', bossId: 'astral_painter_seraphina' },
    bgMapId: '07-aurora-zenith',
    mood: 'aurora',
    lines: [
      L('seraphina', 'Chỉ còn một nét nữa. Đưa ta Sắc Ấn, Karen, rồi ta sẽ cho con thấy em ấy — bằng xương bằng thịt.'),
      L('celine_prism', 'Thầy dạy con: "Bức họa đẹp nhất là bức biết dừng đúng lúc." Con xin thầy, hãy dừng lại.'),
      L('seraphina', 'Vậy thì con hãy ngăn ta. Bằng tất cả những màu ta đã dạy con.'),
      L('gustave_blade', 'Ba giai đoạn, giáp Phá Thế, đòn năm nhịp quyết định. Mọi người — đây là trận cuối. ĐỘI HÌNH!'),
    ],
  },
  {
    sceneId: 'post_boss:astral_painter_seraphina',
    chapter: 8,
    titleVi: 'Hồi Kết — Sắc Thứ Tám',
    subtitleVi: 'Bình minh đầu tiên sau Vĩnh Dạ',
    trigger: { kind: 'post_boss', bossId: 'astral_painter_seraphina' },
    bgMapId: '07-aurora-zenith',
    mood: 'dawn',
    credits: true,
    lines: [
      L('narrator', 'Cây cọ rơi khỏi tay Seraphina. Mực đen tan thành bụi sao, bay ngược lên bầu trời.'),
      L('seraphina', 'Ta… vẫn không nhớ nổi gương mặt em ấy.'),
      L('celine_prism', 'Con nhớ. Chị ấy có nụ cười lệch về bên trái, và luôn dính màu tím trên ngón tay.'),
      L('narrator', 'Karen nhặt cây cọ. Cả đội đặt tay lên cán cọ — bảy Sắc Ấn sáng rực trong lòng bàn tay họ.'),
      L('gustave_blade', 'Bức họa thứ tám… chúng ta sẽ vẽ nó. Nhưng không phải để kéo ai trở về.'),
      L('bastian_aegis', 'Mà để nhớ. Như một lò sưởi, không phải một đám cháy.'),
      L('narrator', 'Nét cọ đầu tiên là ký ức. Màu sắc trào xuống bảy vùng đất. Cỏ thở, tuyết trắng lại, cát chảy xuôi, biển dâng ánh sáng.'),
      L('seraphina', 'Celesta… cảm ơn em. Và cảm ơn các con — vì đã cho ta được khóc.'),
      L('narrator', 'Mặt trời mọc. Lần đầu tiên sau ba mươi ngày, Quang Phổ có bình minh.'),
      L('narrator', 'HẬU TRUYỆN · Seraphina rời Đỉnh Cực Quang làm một họa sĩ lang thang. Các Hộ Vệ đã tỉnh lại, sẵn sàng tái đấu với những ai muốn thử sức. Đoàn Thám Hiểm vẫn còn những đàn quái lang thang, những Bùa Hộ Mệnh chưa nhặt, và những nhánh kỹ năng chưa mở…'),
    ],
  },
];

export const EXPEDITION_STORY_BY_ID: Readonly<Record<string, StoryScene>> = Object.fromEntries(
  EXPEDITION_STORY.map((s) => [s.sceneId, s]),
);

export function storySceneIdFor(t: StoryTrigger): string {
  switch (t.kind) {
    case 'start':
      return 'prologue';
    case 'enter':
      return `enter:${t.mapId}`;
    case 'pre_boss':
      return `pre_boss:${t.bossId}`;
    case 'post_boss':
      return `post_boss:${t.bossId}`;
  }
}

export function storySceneFor(t: StoryTrigger): StoryScene | undefined {
  return EXPEDITION_STORY_BY_ID[storySceneIdFor(t)];
}

export const STORY_CHAPTERS: readonly { chapter: number; titleVi: string }[] = [
  { chapter: 0, titleVi: 'Mở Đầu — Bình Minh Cuối Cùng' },
  { chapter: 1, titleVi: 'Chương I — Đồng Cỏ Khởi Nguyên' },
  { chapter: 2, titleVi: 'Chương II — Đỉnh Tuyết Vĩnh Cửu' },
  { chapter: 3, titleVi: 'Chương III — Sa Mạc Lãng Quên' },
  { chapter: 4, titleVi: 'Chương IV — Thủy Cung Thẳm Sâu' },
  { chapter: 5, titleVi: 'Chương V — Miệng Núi Lửa Rực Cháy' },
  { chapter: 6, titleVi: 'Chương VI — Vùng Ban Đêm Huyền Ảo' },
  { chapter: 7, titleVi: 'Chương VII — Đỉnh Cực Quang' },
  { chapter: 8, titleVi: 'Hồi Kết — Sắc Thứ Tám' },
];
