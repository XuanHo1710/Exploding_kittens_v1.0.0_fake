/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms)
 * Đối thoại khiêu khích chiến trường (Battlefield Banter), Cẩm nang Lịch sử & Chiến thuật 4 Đại Chiến
 * (Pingyuan, Guandu, Changban, Chibi) và Khẩu lệnh Điều quân Tiếng Việt (Tactical Order Callouts).
 *
 * Sử dụng union literal types độc lập khớp 100% với 12 Võ Tướng của shared/src/tw.ts
 * để biên dịch an toàn cả khi độc lập lẫn khi kết hợp toàn dự án.
 */

export type TwBanterGeneralId =
  | 'cao_cao'
  | 'xiahou_dun'
  | 'liu_bei'
  | 'guan_yu'
  | 'zhang_fei'
  | 'zhao_yun'
  | 'zhuge_liang'
  | 'sun_jian'
  | 'zhou_yu'
  | 'lu_bu'
  | 'yuan_shao'
  | 'sima_xiangan';

export type TwBanterTrigger =
  | 'battle_start'
  | 'charge'
  | 'duel_start'
  | 'ambush'
  | 'enemy_routing'
  | 'skill_cast';

export type TwBattleMapId = 'pingyuan' | 'guandu' | 'changban' | 'chibi';

export type TwFactionCode = 'wei' | 'shu' | 'wu' | 'warlord';

export interface TwGeneralBanterProfile {
  readonly id: TwBanterGeneralId;
  readonly nameVi: string;
  readonly courtesyVi: string;
  readonly nameEn: string;
  readonly epithetVi: string;
  readonly faction: TwFactionCode;
}

export interface TwBanterDialogue {
  readonly leftLine: string;
  readonly rightLine: string;
}

export interface TwBanterPair {
  readonly id: string;
  readonly leftGeneral: TwBanterGeneralId;
  readonly rightGeneral: TwBanterGeneralId;
  /** Ngữ cảnh kích hoạt chính trên chiến trường */
  readonly trigger: TwBanterTrigger;
  /** Các ngữ cảnh phụ cũng phù hợp để kích hoạt cặp thoại này */
  readonly altTriggers?: readonly TwBanterTrigger[];
  /** Lời thoại của tướng bên trái (leftGeneral) */
  readonly leftLine: string;
  /** Lời đáp trả của tướng bên phải (rightGeneral) */
  readonly rightLine: string;
  /** Ghi chú điển tích Tam Quốc / Total War */
  readonly contextVi: string;
}

export interface TwBattleTacticalGuide {
  /** Mẹo ẩn giấu Thiết Kỵ phục kích trong Rừng Tùng (Pine Forest) */
  readonly pineForestAmbush: string;
  /** Mẹo chiếm lĩnh Sườn Đồi / Cao Điểm (High Ground) cho Cung Thủ & Máy Bắn Đá */
  readonly highGroundRanged: string;
  /** Mẹo lập Tường Thương (Spearwall) khắc chế Thiết Kỵ Xung Phong (Shock Cavalry) */
  readonly spearwallVsCavalry: string;
  /** Mẹo kích hoạt Đơn Đấu Võ Tướng (Romance General Duel) bẻ gãy sĩ khí địch */
  readonly romanceGeneralDuel: string;
}

export interface TwBattleLore {
  readonly id: TwBattleMapId;
  /** Tên trận đánh tiếng Việt (VD: "Đại Chiến Quan Độ") */
  readonly title: string;
  /** Phụ đề tiếng Anh chuẩn Total War (VD: "Battle of Guandu — 200 AD") */
  readonly subtitle: string;
  /** Niên đại lịch sử (VD: "200 SCN · Kiến An năm thứ 5") */
  readonly year: string;
  /** Địa danh chiến trường */
  readonly location: string;
  /** Hai thế lực đối đầu lịch sử & danh tướng tiêu biểu */
  readonly belligerents: {
    readonly leftSide: string;
    readonly rightSide: string;
    readonly featuredGenerals: readonly TwBanterGeneralId[];
  };
  /** Bản tóm tắt bối cảnh lịch sử hào hùng trước trận đánh */
  readonly summary: string;
  /** Câu nói lịch sử / diễn nghĩa bất hủ gắn liền với chiến trường */
  readonly historicalQuote: string;
  /** Danh sách 4 mẹo chiến thuật cốt lõi hiển thị trực tiếp trên giao diện Briefing */
  readonly tacticalTips: readonly string[];
  /** Cẩm nang chiến thuật phân rã theo 4 trụ cột địa hình & đội hình */
  readonly tacticalGuide: TwBattleTacticalGuide;
}

export type TwOrderCalloutKey =
  | 'select'
  | 'select_infantry'
  | 'select_spearmen'
  | 'select_archers'
  | 'select_cavalry'
  | 'select_artillery'
  | 'select_general'
  | 'move'
  | 'run'
  | 'attack'
  | 'attack_melee'
  | 'attack_ranged'
  | 'charge'
  | 'spearwall'
  | 'hold'
  | 'ambush_forest'
  | 'high_ground'
  | 'duel'
  | 'skill'
  | 'retreat'
  | 'rally'
  | 'routing';

export const TW_BANTER_GENERAL_IDS: readonly TwBanterGeneralId[] = [
  'cao_cao',
  'xiahou_dun',
  'liu_bei',
  'guan_yu',
  'zhang_fei',
  'zhao_yun',
  'zhuge_liang',
  'sun_jian',
  'zhou_yu',
  'lu_bu',
  'yuan_shao',
  'sima_xiangan',
] as const;

export const TW_BANTER_TRIGGERS: readonly TwBanterTrigger[] = [
  'battle_start',
  'charge',
  'duel_start',
  'ambush',
  'enemy_routing',
  'skill_cast',
] as const;

export const TW_GENERAL_PROFILES: Readonly<Record<TwBanterGeneralId, TwGeneralBanterProfile>> = {
  cao_cao: {
    id: 'cao_cao',
    nameVi: 'Tào Tháo',
    courtesyVi: 'Mạnh Đức',
    nameEn: 'Cao Cao',
    epithetVi: 'Ngụy Vũ Gian Hùng',
    faction: 'wei',
  },
  xiahou_dun: {
    id: 'xiahou_dun',
    nameVi: 'Hạ Hầu Đôn',
    courtesyVi: 'Nguyên Nhượng',
    nameEn: 'Xiahou Dun',
    epithetVi: 'Độc Nhãn Cương Liệt',
    faction: 'wei',
  },
  liu_bei: {
    id: 'liu_bei',
    nameVi: 'Lưu Bị',
    courtesyVi: 'Huyền Đức',
    nameEn: 'Liu Bei',
    epithetVi: 'Chiêu Liệt Hoàng Thúc',
    faction: 'shu',
  },
  guan_yu: {
    id: 'guan_yu',
    nameVi: 'Quan Vũ',
    courtesyVi: 'Vân Trường',
    nameEn: 'Guan Yu',
    epithetVi: 'Mỹ Nhiêm Công · Võ Thánh',
    faction: 'shu',
  },
  zhang_fei: {
    id: 'zhang_fei',
    nameVi: 'Trương Phi',
    courtesyVi: 'Dực Đức',
    nameEn: 'Zhang Fei',
    epithetVi: 'Vạn Nhân Địch',
    faction: 'shu',
  },
  zhao_yun: {
    id: 'zhao_yun',
    nameVi: 'Triệu Vân',
    courtesyVi: 'Tử Long',
    nameEn: 'Zhao Yun',
    epithetVi: 'Thường Sơn Long Đởm',
    faction: 'shu',
  },
  zhuge_liang: {
    id: 'zhuge_liang',
    nameVi: 'Gia Cát Lượng',
    courtesyVi: 'Khổng Minh',
    nameEn: 'Zhuge Liang',
    epithetVi: 'Ngọa Long Tiên Sinh',
    faction: 'shu',
  },
  sun_jian: {
    id: 'sun_jian',
    nameVi: 'Tôn Kiên',
    courtesyVi: 'Văn Đài',
    nameEn: 'Sun Jian',
    epithetVi: 'Giang Đông Mãnh Hổ',
    faction: 'wu',
  },
  zhou_yu: {
    id: 'zhou_yu',
    nameVi: 'Chu Du',
    courtesyVi: 'Công Cẩn',
    nameEn: 'Zhou Yu',
    epithetVi: 'Mỹ Chu Lang Đại Đô Đốc',
    faction: 'wu',
  },
  lu_bu: {
    id: 'lu_bu',
    nameVi: 'Lữ Bố',
    courtesyVi: 'Phụng Tiên',
    nameEn: 'Lu Bu',
    epithetVi: 'Phi Tướng Vô Song',
    faction: 'warlord',
  },
  yuan_shao: {
    id: 'yuan_shao',
    nameVi: 'Viên Thiệu',
    courtesyVi: 'Bản Sơ',
    nameEn: 'Yuan Shao',
    epithetVi: 'Minh Chủ Tứ Thế Tam Công',
    faction: 'warlord',
  },
  sima_xiangan: {
    id: 'sima_xiangan',
    nameVi: 'Tư Mã Tương An',
    courtesyVi: 'Tông Thất Tư Mã',
    nameEn: 'Sima Xiangan',
    epithetVi: 'Lang Cố Kỳ Tướng',
    faction: 'wei',
  },
};

/**
 * 30 cặp đối thoại khiêu khích (Battlefield Taunt / Banter Pairs) chuẩn Total War: Three Kingdoms,
 * bao gồm câu Easter Egg kinh điển giữa Tư Mã Tương An (sima_xiangan) và Viên Thiệu (yuan_shao)
 * cùng các màn đối đáp kinh điển giữa 12 danh tướng Tam Quốc trên cả 6 ngữ cảnh chiến sự.
 */
export const TW_BANTER_PAIRS: readonly TwBanterPair[] = [
  // 1. Iconic Total War: Three Kingdoms Screenshot Easter Egg (Sima Xiangan vs Yuan Shao)
  {
    id: 'sima_xiangan_vs_yuan_shao_dairy_farmer',
    leftGeneral: 'sima_xiangan',
    rightGeneral: 'yuan_shao',
    trigger: 'battle_start',
    altTriggers: ['duel_start', 'charge'],
    leftLine: 'Ngươi đánh trận chẳng khác nào gã chăn bò! (You fight like a dairy farmer!)',
    rightLine: 'Khéo lắm! Còn ngươi đánh hệt như một con bò! (How appropriate! You fight like a cow!)',
    contextVi: 'Màn khẩu chiến kinh điển chuẩn Total War: Three Kingdoms giữa Tư Mã Tương An và Viên Thiệu.',
  },
  // 2. Sima Xiangan vs Yuan Shao (Routing follow-up)
  {
    id: 'sima_xiangan_vs_yuan_shao_routing',
    leftGeneral: 'sima_xiangan',
    rightGeneral: 'yuan_shao',
    trigger: 'enemy_routing',
    altTriggers: ['ambush'],
    leftLine:
      'Tứ thế tam công mà quân vỡ như đàn bò lạc đồng sao, Viên Bản Sơ?! (Four generations of grandees, yet your host scatters like stray cattle?!)',
    rightLine:
      'Im ngay! Đợi đại quân Hà Bắc chấn chỉnh lại, bản minh chủ giẫm nát trại ngươi! (Silence! Once Hebei regroups, I shall trample your camp flat!)',
    contextVi: 'Tư Mã Tương An châm chọc đại quân hào môn họ Viên khi vỡ trận.',
  },
  // 3. Lu Bu vs Zhang Fei — Hổ Lao Quan (Exact iconicTam Quốc quote)
  {
    id: 'lu_bu_vs_zhang_fei_hulao',
    leftGeneral: 'lu_bu',
    rightGeneral: 'zhang_fei',
    trigger: 'duel_start',
    altTriggers: ['battle_start', 'charge'],
    leftLine: 'Trong thiên hạ ai dám cản Họa Kích của Lữ Phụng Tiên?!',
    rightLine: 'Giặc họ Lữ ba họ kia, Trương Dực Đức tới lấy đầu ngươi!',
    contextVi: 'Trương Phi vung Bát Xà Mâu mắng Lữ Bố "tam tính gia nô" trước cửa ải Hổ Lao.',
  },
  // 4. Lu Bu vs Guan Yu — Tam Anh Chiến Lữ Bố
  {
    id: 'lu_bu_vs_guan_yu_sky_piercer',
    leftGeneral: 'lu_bu',
    rightGeneral: 'guan_yu',
    trigger: 'duel_start',
    altTriggers: ['charge', 'battle_start'],
    leftLine:
      'Xích Thố tung vó, Phương Thiên Họa Kích đang khát máu anh hùng — Quan Vân Trường dám tiếp chiêu chăng?! (Red Hare surges — dare you meet my Sky Piercer?!)',
    rightLine:
      'Thanh Long Yển Nguyệt Đao nặng tám mươi hai cân, chuyên chém kẻ bất trung bất nghĩa! (My Green Dragon Crescent Blade cleaves the faithless!)',
    contextVi: 'Quan Vũ thúc ngựa vung Thanh Long Đao giao phong cùng Lữ Bố tại Hổ Lao Quan.',
  },
  // 5. Lu Bu vs Cao Cao — Bộc Dương truy kích
  {
    id: 'lu_bu_vs_cao_cao_puyang',
    leftGeneral: 'lu_bu',
    rightGeneral: 'cao_cao',
    trigger: 'charge',
    altTriggers: ['ambush', 'battle_start'],
    leftLine:
      'Tào A Man chớ chạy! Ở Bộc Dương ngươi lấy tay che mặt lừa ta, hôm nay nạp mạng đi! (Run no further, Cao Aman! At Puyang you hid your face — today your head is mine!)',
    rightLine:
      'Lữ Bố là con hổ dữ thiếu mưu — ba quân giăng lưới giáo vây chặt, quyết không để hắn sổng chuồng! (Lu Bu is a fierce tiger bereft of craft — cage him behind iron pikes!)',
    contextVi: 'Điển tích Bộc Dương khi Lữ Bố gõ Họa Kích vào mũ sắt hỏi Tào Tháo ở đâu.',
  },
  // 6. Cao Cao vs Lu Bu — Thủy công Hạ Phì
  {
    id: 'cao_cao_vs_lu_bu_xiapi',
    leftGeneral: 'cao_cao',
    rightGeneral: 'lu_bu',
    trigger: 'enemy_routing',
    altTriggers: ['skill_cast'],
    leftLine:
      'Nước sông Nghi, sông Tứ đã dâng ngập Hạ Phì! Phụng Tiên, thiên hạ không còn đất cho ngươi dung thân! (Floodwaters drown Xiapi! Nowhere under Heaven remains for you!)',
    rightLine:
      'Khốn kiếp! Còn Xích Thố và Họa Kích trong tay, vạn quân cũng không trói nổi Lữ Bố! (Curse you! So long as I hold Red Hare and my halberd, none can bind me!)',
    contextVi: 'Tào Tháo khơi sông dìm thành Hạ Phì vây khốn Lữ Bố.',
  },
  // 7. Zhuge Liang vs Cao Cao — Thiên mệnh Hán thất
  {
    id: 'zhuge_liang_vs_cao_cao_mandate',
    leftGeneral: 'zhuge_liang',
    rightGeneral: 'cao_cao',
    trigger: 'battle_start',
    altTriggers: ['skill_cast'],
    leftLine:
      'Tào Mạnh Đức cậy thế hiếp thiên tử, nay Lượng mượn gió đông thiêu rụi bá nghiệp gian hùng của ông! (Cao Mengde usurps Heaven — today the eastern gale burns your ambition to ash!)',
    rightLine:
      'Thôn phu Nam Dương khua môi múa mép! Để xem quạt lông của ngươi cản nổi thiết giáp Trung Nguyên chăng! (A Nanyang rustic wagging his tongue! Let your feather fan face northern steel!)',
    contextVi: 'Gia Cát Lượng đối đầu đại quân Tào Ngụy trên bàn cờ thiên hạ.',
  },
  // 8. Zhuge Liang vs Zhou Yu — Gió Đông Xích Bích
  {
    id: 'zhuge_liang_vs_zhou_yu_east_wind',
    leftGeneral: 'zhuge_liang',
    rightGeneral: 'zhou_yu',
    trigger: 'skill_cast',
    altTriggers: ['battle_start', 'ambush'],
    leftLine:
      'Muốn phá quân Bắc tất dùng hỏa công — vạn sự đã đủ, Lượng chỉ giúp Công Cẩn gọi thêm ngọn gió đông! (All is set for fire — I merely summon the southeastern wind for you, Gongjin!)',
    rightLine:
      'Quả nhiên thần cơ diệu toán... Trời đã sinh Chu Du này, cớ sao còn sinh Gia Cát Lượng?! (Unfathomable foresight... Since Heaven birthed Zhou Yu, why did it also birth Zhuge Liang?!)',
    contextVi: 'Màn đấu trí vừa liên minh vừa kiêng dè nhau giữa Khổng Minh và Chu Công Cẩn.',
  },
  // 9. Zhuge Liang vs Sima Xiangan — Bát Trận Đồ vs Tư Mã tộc
  {
    id: 'zhuge_liang_vs_sima_xiangan_eight_array',
    leftGeneral: 'zhuge_liang',
    rightGeneral: 'sima_xiangan',
    trigger: 'ambush',
    altTriggers: ['skill_cast', 'battle_start'],
    leftLine:
      'Bước chân vào Bát Trận Đồ của Khổng Minh, phong vân biến ảo — họ Tư Mã ngươi nhìn ra cửa Sinh chăng? (Within Kongming’s Eightfold Maze, can House Sima discern the Gate of Life?)',
    rightLine:
      'Kỳ môn độn giáp dù tinh diệu mấy, gặp kẻ bền gan đóng chặt dinh lũy không ra ắt cũng tự hao mòn! (Even mystic formations wear thin against unyielding patience behind earthworks!)',
    contextVi: 'Đấu trí kỳ môn trận pháp giữa Ngọa Long và dòng tộc Tư Mã.',
  },
  // 10. Guan Yu vs Yuan Shao — Bạch Mã trảm tướng
  {
    id: 'guan_yu_vs_yuan_shao_baima',
    leftGeneral: 'guan_yu',
    rightGeneral: 'yuan_shao',
    trigger: 'charge',
    altTriggers: ['duel_start', 'battle_start'],
    leftLine:
      'Quan mỗ nhìn hàng vạn binh hùng Hà Bắc của Viên Bản Sơ chẳng khác gà đất chó sành — lấy đầu tướng giặc dễ như lấy đồ trong túi! (Your Hebei host are clay chickens — I claim enemy heads with effortless ease!)',
    rightLine:
      'To gan! Tướng mặt đỏ râu dài kia là ai mà dám khinh thường đại quân bốn châu của bản minh chủ?! (Insolence! Who is this red-faced long-beard scorning my four-province host?!)',
    contextVi: 'Quan Vũ phi ngựa Xích Thố chém Nhan Lương, Văn Xú giữa vạn quân Viên Thiệu.',
  },
  // 11. Guan Yu vs Xiahou Dun — Quá Ngũ Quan Trảm Lục Tướng
  {
    id: 'guan_yu_vs_xiahou_dun_yellow_river',
    leftGeneral: 'guan_yu',
    rightGeneral: 'xiahou_dun',
    trigger: 'duel_start',
    altTriggers: ['battle_start', 'charge'],
    leftLine:
      'Hạ Hầu tướng quân xin nhường bước! Quan mỗ chỉ một lòng tìm đại huynh, không muốn làm sứt mẻ ân nghĩa với Tào thừa tướng! (Stand aside, General Xiahou! I seek only to rejoin my sworn brother!)',
    rightLine:
      'Chém sáu tướng giữ ải của ta mà đòi bỏ đi êm thấm ư?! Hạ Hầu Nguyên Nhượng quyết phân sinh tử với ngươi! (You slew six pass wardens and ask free passage?! Xiahou Yuanrang answers with steel!)',
    contextVi: 'Hạ Hầu Đôn đuổi theo chặn đường Quan Vũ bên bến đò Hoàng Hà.',
  },
  // 12. Zhao Yun vs Cao Cao — Đương Dương Trường Bản (Exact iconic Tam Quốc quote)
  {
    id: 'zhao_yun_vs_cao_cao_changban',
    leftGeneral: 'zhao_yun',
    rightGeneral: 'cao_cao',
    trigger: 'charge',
    altTriggers: ['battle_start', 'duel_start'],
    leftLine: 'Ta là Thường Sơn Triệu Tử Long! Vạn quân Tào chẳng qua như cỏ rác!',
    rightLine:
      'Chân chính là hổ tướng! Truyền lệnh cấm bắn tên lén — trẫm quyết bắt sống Triệu Tử Long! (A true tiger general! Forbid hidden arrows — capture Zhao Zilong alive!)',
    contextVi: 'Triệu Vân bảy lần vào bảy lần ra giữa vạn quân Tào tại Đương Dương Trường Bản.',
  },
  // 13. Sun Jian vs Yuan Shao — Ngọc Tỷ Truyền Quốc
  {
    id: 'sun_jian_vs_yuan_shao_imperial_seal',
    leftGeneral: 'sun_jian',
    rightGeneral: 'yuan_shao',
    trigger: 'battle_start',
    altTriggers: ['duel_start', 'charge'],
    leftLine:
      'Khi Tôn Văn Đài đổ máu phá giặc trước cửa ải, Viên minh chủ chỉ biết ngồi uống rượu ngấm ngầm dòm ngó Ngọc Tỷ thôi sao?! (While I bled vanguard blood, you sat scheming over the Imperial Seal?!)',
    rightLine:
      'Tôn Kiên to gan! Mãnh hổ Giang Đông dám tráo trở trước mặt minh chủ mười tám lộ chư hầu ư?! (Audacious Sun Jian! Does Jiangdong’s Tiger dare defy the Coalition Lord?!)',
    contextVi: 'Tôn Kiên và Viên Thiệu trở mặt vì Ngọc Tỷ Truyền Quốc ở Lạc Dương.',
  },
  // 14. Sun Jian vs Liu Bei — Cổ Đĩnh Đao vs Song Cổ Kiếm
  {
    id: 'sun_jian_vs_liu_bei_tiger_and_benevolence',
    leftGeneral: 'sun_jian',
    rightGeneral: 'liu_bei',
    trigger: 'battle_start',
    altTriggers: ['charge', 'duel_start'],
    leftLine:
      'Lưu Huyền Đức lấy nhân nghĩa thu phục lòng người, nhưng thời đại loạn này phải dùng Cổ Đĩnh Đao mới dẹp yên thiên hạ! (Benevolence wins hearts, Xuande, yet chaos bows only to the Guding Blade!)',
    rightLine:
      'Tôn tướng quân uy chấn Giang Đông, song thiếu đại nghĩa hưng Hán an dân thì mũi đao sắc mấy cũng khó giữ thiên thu! (Your valor shakes Jiangdong, yet blades without righteousness cannot endure!)',
    contextVi: 'Đạo bá vương dũng mãnh của Giang Đông đối thoại cùng lý tưởng nhân nghĩa Hán thất.',
  },
  // 15. Cao Cao vs Liu Bei — Uống rượu luận anh hùng
  {
    id: 'cao_cao_vs_liu_bei_plum_wine',
    leftGeneral: 'cao_cao',
    rightGeneral: 'liu_bei',
    trigger: 'battle_start',
    altTriggers: ['skill_cast'],
    leftLine:
      'Huyền Đức ơi, ngày trước uống rượu nấu mơ luận anh hùng, Tháo đã bảo thiên hạ chỉ có sứ quân và ta — nay cớ sao lại dàn trận đối đầu?! (Over plum wine I named only you and myself heroes — why cross banners today?!)',
    rightLine:
      'Mạnh Đức mang danh tướng Hán nhưng thực hiếp thiên tử! Lưu Bị dù muôn phần gian nguy cũng quyết khôi phục Hán thất! (You wear Han’s title yet subvert its throne — I will restore the Dynasty at any cost!)',
    contextVi: 'Tào Tháo và Lưu Bị tái ngộ trên chiến trường sau điển tích Thanh Mai Chử Tửu.',
  },
  // 16. Cao Cao vs Yuan Shao — Lửa cháy Ô Sào (Quan Độ)
  {
    id: 'cao_cao_vs_yuan_shao_guandu',
    leftGeneral: 'cao_cao',
    rightGeneral: 'yuan_shao',
    trigger: 'ambush',
    altTriggers: ['battle_start', 'skill_cast'],
    leftLine:
      'Bản Sơ binh đông lương nhiều nhưng đa nghi thiếu quyết đoán — một ngọn đuốc thiêu rụi Ô Sào là đủ lật nhào cơ đồ họ Viên! (Banshao commands vast hosts yet hesitates — one torch at Wuchao topples House Yuan!)',
    rightLine:
      'Tào A Man lương cạn quân mỏi mà còn dám ngông cuồng! Bảy mươi vạn tinh binh Hà Bắc sẽ san phẳng lũy Quan Độ! (Starving and outnumbered yet boasting still! Seven hundred thousand spears shall flatten Guandu!)',
    contextVi: 'Trận quyết chiến Quan Độ năm 200 SCN định đoạt vận mệnh phương Bắc.',
  },
  // 17. Zhang Fei vs Cao Cao — Cầu Trường Bản sấm rền
  {
    id: 'zhang_fei_vs_cao_cao_changban_bridge',
    leftGeneral: 'zhang_fei',
    rightGeneral: 'cao_cao',
    trigger: 'ambush',
    altTriggers: ['charge', 'skill_cast'],
    leftLine:
      'Yên Nhân Trương Dực Đức đứng đây! Kẻ nào gan to bằng trời thì bước lên cầu Trường Bản quyết một trận sống mái! (Zhang Yide of Yan holds Changban Bridge! Step forth and meet your doom!)',
    rightLine:
      'Trong rừng tùng bụi bay mù mịt ắt có phục binh! Quan Vân Trường từng dặn Trương Phi lấy đầu tướng giặc giữa vạn quân dễ như trở bàn tay — chớ tiến ẩu! (Dust billows in the pines — beware an ambush! Never underestimate Zhang Fei’s fury!)',
    contextVi: 'Trương Phi buộc cành cây sau đuôi ngựa tung bụi trong rừng tùng và hét vang cầu Trường Bản.',
  },
  // 18. Zhou Yu vs Cao Cao — Lửa đỏ Xích Bích
  {
    id: 'zhou_yu_vs_cao_cao_red_cliffs',
    leftGeneral: 'zhou_yu',
    rightGeneral: 'cao_cao',
    trigger: 'ambush',
    altTriggers: ['skill_cast', 'enemy_routing'],
    leftLine:
      'Gió đông nổi sóng, chiến thuyền tẩm dầu lưu huỳnh lao thẳng vào thủy trại — Tào tặc hãy ngắm bầu trời rực lửa Xích Bích đi! (Fire-ships ride the eastern gale — gaze upon Red Cliffs ablaze, traitor Cao!)',
    rightLine:
      'Chiến thuyền khóa xích cả rồi, mau chặt xích thoát thân! Ai ngờ Chu Công Cẩn tuổi trẻ mà dùng hỏa công hiểm độc đến thế! (Our ships are chained — sever the links! How ruthless is young Zhou Gongjin’s fire!)',
    contextVi: 'Chu Du phát động hỏa công thiêu cháy liên hoàn chiến thuyền Tào Ngụy ở Xích Bích.',
  },
  // 19. Xiahou Dun vs Lu Bu — Rút tên nuốt con ngươi
  {
    id: 'xiahou_dun_vs_lu_bu_one_eye',
    leftGeneral: 'xiahou_dun',
    rightGeneral: 'lu_bu',
    trigger: 'duel_start',
    altTriggers: ['skill_cast'],
    leftLine:
      'Tinh cha huyết mẹ há có thể vứt bỏ! Dù mất một con mắt, trường thương Hạ Hầu Đôn vẫn xiên thủng tim nghịch tặc họ Lữ! (Essence of father, blood of mother! Even one-eyed, my spear pierces traitors!)',
    rightLine:
      'Độc Nhãn tướng quân dũng khí gớm thật, nhưng đứng trước Lữ Phụng Tiên thì mười con mắt cũng chẳng kịp nhìn đường kích! (Fierce grit, One-Eyed General, yet ten eyes could not track my halberd’s arc!)',
    contextVi: 'Hạ Hầu Đôn trúng tên ở Bộc Dương, rút tên nuốt mắt rồi xông lên đâm chết Tào Tính.',
  },
  // 20. Zhao Yun vs Xiahou Dun — Bác Vọng Pha hỏa phục
  {
    id: 'zhao_yun_vs_xiahou_dun_bowangpo',
    leftGeneral: 'zhao_yun',
    rightGeneral: 'xiahou_dun',
    trigger: 'ambush',
    leftLine:
      'Hạ Hầu tướng quân đuổi sâu vào hẻm rừng tùng là trúng diệu kế của Khổng Minh quân sư rồi — phục binh bốn phía phóng hỏa! (Chasing into the pine gorge sealed your fate, General Xiahou — light the ambush fires!)',
    rightLine:
      'Lửa bốc ngút trời hai bên sườn núi rồi! Đừng tự dẫm đạp lên nhau, theo ta mở đường máu xông khỏi Bác Vọng Pha! (Flames engirdle both ridges! Hold ranks and cut out of Bowangpo!)',
    contextVi: 'Triệu Vân trá bại dụ Hạ Hầu Đôn vào ổ phục kích hỏa công đầu tay của Gia Cát Lượng.',
  },
  // 21. Guan Yu vs Cao Cao — Hẻm Hoa Dung nghĩa thích
  {
    id: 'guan_yu_vs_cao_cao_huarong',
    leftGeneral: 'guan_yu',
    rightGeneral: 'cao_cao',
    trigger: 'enemy_routing',
    leftLine:
      'Giữa hẻm Hoa Dung khói lửa mịt mù, Quan mỗ vâng quân lệnh của quân sư đứng đợi Thừa tướng đã lâu! (Amid the smoke of Huarong Trail, Guan Mou awaits you by decree, Prime Minister!)',
    rightLine:
      'Vân Trường nghĩa trọng thiên thu, lẽ nào quên ân tình ngày trước ở Hứa Đô khi vượt năm ải chém sáu tướng sao? (Yunchang embodies timeless honor — surely you recall old kindnesses at Xuchang?)',
    contextVi: 'Quan Vũ chặn tàn quân Tào Tháo tại hẻm Hoa Dung sau đại chiến Xích Bích.',
  },
  // 22. Zhao Yun vs Yuan Shao — Bàn Hà bạch mã ngân thương
  {
    id: 'zhao_yun_vs_yuan_shao_panhe',
    leftGeneral: 'zhao_yun',
    rightGeneral: 'yuan_shao',
    trigger: 'charge',
    leftLine:
      'Bạch mã ngân thương xé gió Bàn Hà! Kỵ binh Hà Bắc dù đông mấy vạn cũng phải rẽ làm đôi! (White steed and silver spear cleave the wind — part before me, Hebei horsemen!)',
    rightLine:
      'Thiếu niên tướng quân giáp bạc kia từ đâu nhảy ra mà đánh dạt cả tiền quân kỵ xạ tinh nhuệ của ta?! (Whence rode this silver-armored youth scattering my elite horse-archers?!)',
    contextVi: 'Trận ra mắt chấn động của Triệu Tử Long bên cầu Bàn Hà đẩy lui dũng tướng Văn Xú.',
  },
  // 23. Zhang Fei vs Xiahou Dun — Bát Xà Mâu đọ cương thương
  {
    id: 'zhang_fei_vs_xiahou_dun_clash',
    leftGeneral: 'zhang_fei',
    rightGeneral: 'xiahou_dun',
    trigger: 'duel_start',
    leftLine:
      'Hạ Hầu Đôn! Lại đây nếm thử Bát Xà Mâu vạn cân lực của Trương gia gia xem giáp Ngụy dày được mấy phân! (Xiahou Dun! Taste my Viper Spear and test how thick Wei armor truly is!)',
    rightLine:
      'Thất phu thô lỗ bớt gào thét đi! Hôm nay ta lấy đầu ngươi tế cờ tiên phong Đại Ngụy! (Cease your roaring, brute! Your head shall consecrate Great Wei’s banner!)',
    contextVi: 'Hai mãnh tướng nóng nảy bậc nhất của Thục và Ngụy lao vào đơn đấu trực diện.',
  },
  // 24. Liu Bei vs Zhou Yu — Tranh chấp Kinh Châu
  {
    id: 'liu_bei_vs_zhou_yu_jingzhou',
    leftGeneral: 'liu_bei',
    rightGeneral: 'zhou_yu',
    trigger: 'battle_start',
    leftLine:
      'Chu Đô Đốc tài trí tuyệt luân Giang Đông, song Tào tặc phương Bắc chưa dẹp, Tôn - Lưu tương tàn chỉ làm kẻ thù đắc lợi! (Grand Commandant Zhou, if Sun and Liu clash now, only Cao Cao profits!)',
    rightLine:
      'Lưu Hoàng Thúc nói lời nhân nghĩa nghe bùi tai lắm, nhưng đất Kinh Châu một tấc Đông Ngô cũng quyết không nhường! (Sweet words of benevolence, Imperial Uncle, yet Wu yields not an inch of Jingzhou!)',
    contextVi: 'Sóng ngầm ngoại giao và binh đao quanh địa bàn chiến lược Kinh Châu.',
  },
  // 25. Sun Jian vs Cao Cao — Tiên phong phạt Đổng
  {
    id: 'sun_jian_vs_cao_cao_vanguard',
    leftGeneral: 'sun_jian',
    rightGeneral: 'cao_cao',
    trigger: 'charge',
    leftLine:
      'Quân Giang Đông đã tuốt đao là chỉ tiến không lùi! Mạnh Đức hãy xem Mãnh Hổ công phá tiền đồn thế nào! (Once Jiangdong draws steel we never retreat — watch the Tiger smash their front!)',
    rightLine:
      'Văn Đài quả không hổ danh Mãnh Hổ Giang Đông — truyền kỵ binh bọc lót cánh sườn, quyết không thua kém nhuệ khí Đông Ngô! (Worthy of Jiangdong’s Tiger — wheel our cavalry onto the flank to match his ferocity!)',
    contextVi: 'Hai nhà quân sự duy nhất thực tâm tiến đánh Đổng Trác trong liên minh chư hầu nay so tài.',
  },
  // 26. Zhuge Liang vs Lu Bu — Bậc thầy mưu lược khắc chế dũng phu
  {
    id: 'zhuge_liang_vs_lu_bu_strategy_vs_might',
    leftGeneral: 'zhuge_liang',
    rightGeneral: 'lu_bu',
    trigger: 'skill_cast',
    leftLine:
      'Phụng Tiên cậy sức vạn phu mạc đương, nhưng lọt vào hỏa lực cung nỏ trên sườn đồi và rừng trường thương thì hổ dữ cũng gãy nanh! (Lone might falters before crossbows on high ridges and iron spearwalls, Fengxian!)',
    rightLine:
      'Mưu sĩ phe phẩy quạt lông biết gì võ đạo! Đợi Xích Thố vọt lên đỉnh đồi, một kích chém nát trướng chỉ huy của ngươi! (What do feather-fan scholars know of war?! Red Hare will crest your hill and cleave your tent!)',
    contextVi: 'Sự đối lập kinh điển giữa Trí mưu (Strategist) và Võ dũng (Vanguard) trong Total War.',
  },
  // 27. Zhao Yun vs Lu Bu — Long Đởm Ngân Thương đọ Họa Kích
  {
    id: 'zhao_yun_vs_lu_bu_spear_vs_halberd',
    leftGeneral: 'zhao_yun',
    rightGeneral: 'lu_bu',
    trigger: 'duel_start',
    leftLine:
      'Long Đởm Ngân Thương hộ chúa cứu dân, quyết không lùi nửa bước trước uy danh Phi Tướng! (Dragon-Gall Silver Spear guards lord and people — I yield not an inch to the Flying General!)',
    rightLine:
      'Thương pháp nhanh như chớp giật! Lâu lắm rồi Lữ Phụng Tiên mới gặp một tay thương đáng để dốc toàn lực! (Spearmanship swift as lightning! At last, a lance worthy of Lu Fengxian’s full strength!)',
    contextVi: 'Trận đơn đấu trong mơ giữa Bạch Mã Ngân Thương Triệu Tử Long và Phi Tướng Lữ Bố.',
  },
  // 28. Zhou Yu vs Yuan Shao — Hỏa tiễn Giang Đông khắc đại quân ô hợp
  {
    id: 'zhou_yu_vs_yuan_shao_fire_volley',
    leftGeneral: 'zhou_yu',
    rightGeneral: 'yuan_shao',
    trigger: 'skill_cast',
    leftLine:
      'Nhịp trống Giang Đông hòa cung đàn chiến trận — quân Viên đông mà ô hợp, trúng một loạt hỏa tiễn ắt tự giẫm đạp lên nhau! (One volley of Jiangdong fire arrows turns Yuan’s bloated rabble upon itself!)',
    rightLine:
      'Tiểu tử mặt trắng phương Nam chỉ quen bơi thuyền, lên bình nguyên phương Bắc còn dám khoác lác sao?! (A southern river-admiral dares boast upon open northern plains?!)',
    contextVi: 'Chu Du lấy tinh binh hỏa tiễn đối đầu biển người trọng giáp của Viên Thiệu.',
  },
  // 29. Sima Xiangan vs Cao Cao — Lang Cố Chi Tướng
  {
    id: 'sima_xiangan_vs_cao_cao_wolf_glance',
    leftGeneral: 'sima_xiangan',
    rightGeneral: 'cao_cao',
    trigger: 'skill_cast',
    leftLine:
      'Thừa tướng dựng nền móng thiên hạ bằng sấm sét, còn kẻ hậu học họ Tư Mã chỉ lặng lẽ thu gom tàn cuộc trên bàn cờ! (The Prime Minister forges the realm in thunder; House Sima quietly harvests the endgame!)',
    rightLine:
      'Tướng "lang cố" ngoái đầu như sói của nhà Tư Mã, trẫm há lại không đề phòng từng nước cờ hay sao?! (The wolfish backward glance of House Sima — think you I do not watch your every move?!)',
    contextVi: 'Điển tích "Lang cố chi tướng" (tướng sói ngoái đầu) mà Tào Tháo từng cảnh giác dòng họ Tư Mã.',
  },
  // 30. Guan Yu vs Sun Jian — Thanh Long Đao đọ Cổ Đĩnh Đao
  {
    id: 'guan_yu_vs_sun_jian_twin_blades',
    leftGeneral: 'guan_yu',
    rightGeneral: 'sun_jian',
    trigger: 'duel_start',
    leftLine:
      'Nghe danh Cổ Đĩnh Đao của Tôn Văn Đài chém sắt như bùn, nay Quan mỗ xin lĩnh giáo dưới bóng cờ đào nghĩa! (Famed is Sun Wentai’s Guding Blade — Guan Mou honors your steel!)',
    rightLine:
      'Hảo Vân Trường! Đao của Mãnh Hổ Giang Đông chạm Thanh Long Đao hôm nay ắt làm dậy sóng cả đôi bờ Trường Giang! (Well spoken, Yunchang! When Tiger meets Green Dragon, both banks of the Yangtze roar!)',
    contextVi: 'Cuộc đọ đao đỉnh cao giữa hai bậc kỳ tài Thục Hán và Đông Ngô.',
  },
];

/**
 * Kho đối thoại dự phòng chung (Generic Fallback Banters) phân loại theo cả 6 ngữ cảnh chiến sự,
 * đảm bảo bất kỳ 2 tướng nào chạm trán cũng có màn đối đáp hào sảng chuẩn Tam Quốc Toàn Chiến.
 */
export const TW_GENERIC_BANTER_BY_TRIGGER: Readonly<
  Record<TwBanterTrigger, readonly TwBanterDialogue[]>
> = {
  battle_start: [
    {
      leftLine:
        'Thiên hạ đại loạn, hôm nay trên chiến trường này chỉ một lá cờ được tung bay lúc hoàng hôn! (Chaos grips the realm — only one banner stands at dusk!)',
      rightLine:
        'Khẩu khí ngông cuồng! Hãy để tiếng trống trận và mũi giáo định đoạt thiên mệnh! (Bold words! Let war drums and cold steel decide Heaven’s Mandate!)',
    },
    {
      leftLine:
        'Ba quân đã bày thế trận — tướng đối diện mau xuống ngựa quy hàng kẻo uổng mạng tướng sĩ! (Our battle line stands arrayed — dismount and yield while you still breathe!)',
      rightLine:
        'Trượng phu đầu đội trời chân đạp đất, thà gãy kích nơi sa trường chứ quyết không quỳ gối! (A true warrior breaks his halberd in battle before bending the knee!)',
    },
    {
      leftLine:
        'Núi sông cẩm tú này chỉ xứng thuộc về bậc minh chúa biết trọng hiền tài! (These splendid rivers and hills belong only to a worthy lord!)',
      rightLine:
        'Muốn bàn chuyện giang sơn, trước hết hãy bước qua rừng đao biển giáo của ta đã! (Speak of empire only after crossing our forest of blades!)',
    },
    {
      leftLine:
        'Gió cuốn bụi mờ tiền tuyến, hôm nay bản soái sẽ ghi tên trận đại thắng này vào sử sách! (Dust rises over the front — today history records my triumph!)',
      rightLine:
        'Sử sách chỉ khắc tên kẻ chiến thắng — còn bại tướng như ngươi chỉ làm nền cho chiến công của ta! (History remembers victors; you shall merely adorn my chronicle!)',
    },
  ],
  charge: [
    {
      leftLine:
        'Thiết kỵ xung phong! Hạ thấp mũi thương, xé toạc trung quân của chúng cho bản tướng! (Shock cavalry, charge! Lower lances and shatter their center!)',
      rightLine:
        'Dựng tường trường thương! Để xem vó ngựa của ngươi cứng hay mũi giáo của ta sắc! (Form Spearwall! Let your horses meet our iron pikes!)',
    },
    {
      leftLine:
        'Toàn quân dốc sức tiến kích! Đánh tan hàng khiên chắn trước khi chúng kịp bắn loạt tên thứ hai! (All ranks surge forward! Crush their shields before a second volley!)',
      rightLine:
        'Giữ chặt khiên sắt, hàng sau giương cung yểm trợ — chớ lùi dù chỉ nửa bước! (Lock shields! Rear ranks loose arrows — yield not half a pace!)',
    },
    {
      leftLine:
        'Vó ngựa cuồn cuộn như thác đổ — kẻ nào cản đường ắt thịt nát xương tan! (Hooves thunder like an avalanche — all in our path perish!)',
      rightLine:
        'Cắm chặt cán thương xuống đất! Biến sườn đồi này thành mồ chôn kỵ binh của chúng! (Plant spear-butts deep! Turn this slope into their cavalry’s grave!)',
    },
    {
      leftLine:
        'Trống trận thúc liên hồi rồi — theo mũi đao của bản tướng lao thẳng vào cờ soái giặc! (War drums thunder — follow my blade straight for their command standard!)',
      rightLine:
        'Ngông cuồng! Thân binh hộ vệ lập trận tròn, băm nát mũi nhọn xung kích của địch! (Reckless fool! Bodyguards form ring — cut down their spearhead!)',
    },
  ],
  duel_start: [
    {
      leftLine:
        'Tướng giặc kia! Có dám thúc ngựa ra trước hai hàng quân phân cao thấp một mất một còn chăng?! (Enemy general! Dare you ride between the armies and duel to the death?!)',
      rightLine:
        'Cầu còn chẳng được! Ba quân lui ra nhường đất, để bản tướng lấy đầu hắn dưới chân cờ! (Gladly! Stand back, soldiers — I claim his head beneath our standard!)',
    },
    {
      leftLine:
        'Đừng bắt binh tốt vô tội uổng mạng nữa — thắng bại hôm nay định đoạt trên lưỡi đao của ta và ngươi! (Spare the rank and file — decide victory upon our two blades alone!)',
      rightLine:
        'Hảo khí phách! Hôm nay một người vang danh thiên hạ, một người vùi xác nơi đồng hoang! (Spoken like a warrior! One wins eternal renown, one feeds the crows!)',
    },
    {
      leftLine:
        'Nghe danh ngươi võ nghệ siêu quần, hãy tiếp nổi ba mươi hiệp thương pháp của bản tướng xem sao! (They call you peerless — survive thirty bouts against my lance!)',
      rightLine:
        'Cần chi ba mươi hiệp! Chỉ ba chiêu là đủ cho ngươi ngã ngựa tâm phục khẩu phục! (Why thirty bouts?! Three strokes suffice to unhorse you!)',
    },
    {
      leftLine:
        'Vòng vây binh sĩ đã rẽ ra — bước vào trường đấu này không thắng thì chết, tuyệt đối không bắn lén! (The ring opens — honor demands no outside arrows, only steel against steel!)',
      rightLine:
        'Nhất ngôn cửu đỉnh! Thúc ngựa lên đi, cho thiên hạ chiêm ngưỡng thế nào là chân võ tướng! (Agreed! Spur forth and show the realm true martial valor!)',
    },
  ],
  ambush: [
    {
      leftLine:
        'Phục binh tứ phía nổi trống! Từ rừng tùng lao ra đánh tạt sườn, một tên giặc cũng chớ để thoát! (Spring the trap! Pour from the pine forest onto their flanks — leave none unscathed!)',
      rightLine:
        'Trúng kế mai phục trong rừng rồi! Ba quân bình tĩnh quay lưng kết thuẫn thương chống trả! (An ambush from the pines! Stay calm — form defensive circle with shields and spears!)',
    },
    {
      leftLine:
        'Giấu cờ im hơi suốt canh giờ chỉ đợi khắc này — kỵ binh tập hậu đốt sạch máy bắn đá của chúng! (Hidden in silence for this very hour — cavalry, strike their rear and burn their trebuchets!)',
      rightLine:
        'Cánh hậu quân bị đánh úp! Điều ngay đội thương binh dự bị quay lại hộ vệ cung thủ! (Our rear is hit! Wheel reserve spearmen back to screen the archers!)',
    },
    {
      leftLine:
        'Binh bất yếm trá! Ngươi mải đuổi theo mồi nhử mà quên mất bóng râm rừng tùng hai bên sườn đồi ư?! (All warfare is deception! Blinded by bait, you ignored the dark pine woods on your flank!)',
      rightLine:
        'Khá khen cho mưu sâu kế hiểm! Nhưng muốn nuốt trọn đại quân của ta thì coi chừng gãy răng! (Clever snare! Yet swallowing my veteran host will shatter your teeth!)',
    },
    {
      leftLine:
        'Lửa hiệu đã bốc lên trên cao điểm — khóa chặt đường rút, đánh gãy sĩ khí toàn quân giặc! (Signal fires blaze atop the ridge — seal their retreat and break their spirit!)',
      rightLine:
        'Giữ vững tâm lý! Tập trung binh lực đâm thủng một góc vây mở đường máu thoát ra! (Steady your hearts! Mass our strength and punch through one corner!)',
    },
  ],
  enemy_routing: [
    {
      leftLine:
        'Quân địch đã vỡ mật quăng cờ tháo chạy! Khinh kỵ thừa thắng truy kích, quét sạch tàn binh! (Their ranks shatter and cast down banners! Light cavalry — press the pursuit!)',
      rightLine:
        'Đừng hoảng loạn dẫm đạp lên nhau! Nhìn theo cờ soái của ta, lui về sườn đồi lập lại hàng ngũ! (Stop panicking! Rally to my banner on the ridge and reform ranks!)',
    },
    {
      leftLine:
        'Trận tuyến của ngươi sụp đổ như đê vỡ rồi — buông vũ khí hàng phục còn giữ được mạng sống! (Your battle line crumbles like a broken dyke — lay down arms and live!)',
      rightLine:
        'Thắng thua là chuyện thường tình nhà binh! Còn núi xanh lo gì thiếu củi đốt — rút quân! (Defeat is passing in war! Preserve the core and withdraw in order!)',
    },
    {
      leftLine:
        'Một cánh tan rã kéo theo cả ba quân khiếp đảm — hôm nay đại cuộc đã ngã ngũ! (One broken wing panics their whole army — the day is ours!)',
      rightLine:
        'Thân binh đoạn hậu cản kỵ binh truy kích! Bằng mọi giá phải giữ an toàn cho đại kỳ rút lui! (Rearguard, hold off their horsemen! Escort the grand standard to safety!)',
    },
    {
      leftLine:
        'Nhìn tàn binh địch chạy tán loạn khắp cánh đồng kìa — thu chiến lợi phẩm và chiếm trọn chiến trường! (Behold them fleeing across the plain — secure the spoils and claim the field!)',
      rightLine:
        'Mối nhục bại trận hôm nay bản tướng khắc cốt ghi tâm — lần tái chiến tới ắt trả gấp mười! (This bitter sting I carve upon my bones — next we meet, I repay it tenfold!)',
    },
  ],
  skill_cast: [
    {
      leftLine:
        'Thiên thời địa lợi nhân hòa hội tụ — hãy chứng kiến tuyệt kỹ binh pháp của bản soái đây! (Heaven, Earth, and Man align — witness my supreme martial stratagem!)',
      rightLine:
        'Hư trương thanh thế! Tướng sĩ vững lòng, đừng để chiêu thức của hắn làm rối loạn hàng ngũ! (Mere theatrics! Stand firm and keep your formation tight!)',
    },
    {
      leftLine:
        'Hào khí xung thiên! Tiếng gầm của bản tướng tiếp thêm sức mạnh ngàn cân cho toàn quân! (Heroic spirit pierces the heavens — my war-cry empowers every blade!)',
      rightLine:
        'Khí thế địch đang bùng lên — lập tức giương khiên phòng ngự, tránh đối đầu mũi nhọn lúc này! (Their fervor surges — raise shields and weather the storm!)',
    },
    {
      leftLine:
        'Cung nỏ tẩm lửa, phát thạch rền vang — biến trận địa của chúng thành biển lửa ngập trời! (Flaming bolts and roaring trebuchets — turn their lines into a sea of fire!)',
      rightLine:
        'Giãn thưa cự ly đội hình ngay! Đừng tụ cụm lại làm mồi cho hỏa lực tầm xa của giặc! (Loosen spacing at once! Do not cluster beneath their fiery barrage!)',
    },
    {
      leftLine:
        'Nhất kỵ đương thiên! Nơi mũi đao bản tướng quét qua, thần cản sát thần, phật cản sát phật! (One rider against a thousand — nothing withstands the sweep of my blade!)',
      rightLine:
        'Tướng địch đang phát cuồng xung sát — tập trung cung nỏ và trường thương kìm chân hắn lại! (Their general rampages — focus crossbows and long spears to pin him down!)',
    },
  ],
};

function hashBanterSeed(text: string, seed: number): number {
  let h = 2166136261 ^ Math.trunc(seed);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function selectIndexDeterministically(length: number, key: string, seed?: number): number {
  if (length <= 1) {
    return 0;
  }
  if (seed === undefined || !Number.isFinite(seed)) {
    return Math.floor(Math.random() * length);
  }
  const normalizedSeed = Math.trunc(seed);
  const baseOffset = hashBanterSeed(key, 0) % length;
  return (((normalizedSeed + baseOffset) % length) + length) % length;
}

/**
 * Kiểm tra xem một chuỗi bất kỳ có phải ID hợp lệ của 12 Võ Tướng hay không.
 */
export function isTwBanterGeneralId(id: string): id is TwBanterGeneralId {
  return Object.prototype.hasOwnProperty.call(TW_GENERAL_PROFILES, id);
}

/**
 * Chọn cặp đối thoại khiêu khích (Left vs Right) khớp chính xác ngữ cảnh chiến sự và danh tính hai tướng.
 * - Nếu cặp tướng có thoại riêng theo đúng chiều `(genA, genB)` ở `trigger` (hoặc `altTriggers`), trả về nguyên bản.
 * - Nếu cặp tướng có thoại riêng theo chiều ngược `(genB, genA)`, tự động hoán đổi `leftLine` / `rightLine`
 *   để mỗi khung chân dung tướng luôn phát ngôn đúng lời thoại nhân vật của mình.
 * - Nếu chưa có thoại riêng cho cặp tướng/ngữ cảnh đó, chọn từ kho đối thoại dự phòng `TW_GENERIC_BANTER_BY_TRIGGER[trigger]`.
 */
export function pickBanterDialogue(
  genA: string,
  genB: string,
  trigger: 'battle_start' | 'charge' | 'duel_start' | 'ambush' | 'enemy_routing' | 'skill_cast',
  seed?: number,
): { leftLine: string; rightLine: string } {
  const normalizedA = genA.trim().toLowerCase();
  const normalizedB = genB.trim().toLowerCase();
  const key = `${normalizedA}|${normalizedB}|${trigger}`;

  // Ưu tiên 1: Khớp chính xác (genA -> genB) hoặc (genB -> genA) trên primary trigger
  const primaryCandidates: TwBanterDialogue[] = [];
  for (const pair of TW_BANTER_PAIRS) {
    if (pair.trigger !== trigger) {
      continue;
    }
    if (pair.leftGeneral === normalizedA && pair.rightGeneral === normalizedB) {
      primaryCandidates.push({ leftLine: pair.leftLine, rightLine: pair.rightLine });
    } else if (pair.leftGeneral === normalizedB && pair.rightGeneral === normalizedA) {
      primaryCandidates.push({ leftLine: pair.rightLine, rightLine: pair.leftLine });
    }
  }

  if (primaryCandidates.length > 0) {
    const idx = selectIndexDeterministically(primaryCandidates.length, key, seed);
    return primaryCandidates[idx];
  }

  // Ưu tiên 2: Khớp trên altTriggers của cặp tướng lịch sử
  const secondaryCandidates: TwBanterDialogue[] = [];
  for (const pair of TW_BANTER_PAIRS) {
    if (!pair.altTriggers || !pair.altTriggers.includes(trigger)) {
      continue;
    }
    if (pair.leftGeneral === normalizedA && pair.rightGeneral === normalizedB) {
      secondaryCandidates.push({ leftLine: pair.leftLine, rightLine: pair.rightLine });
    } else if (pair.leftGeneral === normalizedB && pair.rightGeneral === normalizedA) {
      secondaryCandidates.push({ leftLine: pair.rightLine, rightLine: pair.leftLine });
    }
  }

  if (secondaryCandidates.length > 0) {
    const idx = selectIndexDeterministically(secondaryCandidates.length, key, seed);
    return secondaryCandidates[idx];
  }

  // Ưu tiên 3: Đối thoại dự phòng chung theo đúng loại sự kiện chiến trường (trigger)
  const fallbackPool = TW_GENERIC_BANTER_BY_TRIGGER[trigger];
  const fallbackIdx = selectIndexDeterministically(fallbackPool.length, key, seed);
  const chosen = fallbackPool[fallbackIdx];
  return {
    leftLine: chosen.leftLine,
    rightLine: chosen.rightLine,
  };
}

/**
 * Cẩm nang Lịch sử & Chiến thuật cho 4 Chiến Trường Lịch Sử Tam Quốc:
 * - 'pingyuan': Chiến Dịch Bình Nguyên (191 SCN)
 * - 'guandu': Đại Chiến Quan Độ (200 SCN)
 * - 'changban': Huyết Chiến Đương Dương Trường Bản (208 SCN)
 * - 'chibi': Đại Chiến Xích Bích (208 SCN)
 */
export const TW_BATTLE_LORE: Readonly<Record<TwBattleMapId, TwBattleLore>> = {
  pingyuan: {
    id: 'pingyuan',
    title: 'Chiến Dịch Bình Nguyên',
    subtitle: 'Battle of Pingyuan — 191 AD',
    year: '191 SCN · Sơ Bình năm thứ 2',
    location: 'Đồng bằng Bình Nguyên, giáp ranh Thanh Châu – Ký Châu',
    belligerents: {
      leftSide: 'Nghĩa Quân Lưu Huyền Đức (Thục Hán Sơ Kỳ)',
      rightSide: 'Liên Quân Quần Hùng Hà Bắc (Viên Thiệu)',
      featuredGenerals: ['liu_bei', 'guan_yu', 'zhang_fei', 'yuan_shao', 'zhao_yun'],
    },
    summary:
      'Giữa buổi hoàng hôn Đông Hán quần hùng cát cứ, Lưu Bị làm Tướng quốc Bình Nguyên cùng hai nghĩa đệ Quan Vũ, Trương Phi bảo hộ bách tính trước làn sóng thiết kỵ Hà Bắc tràn xuống. Cánh đồng Bình Nguyên trải rộng lý tưởng cho đại quân dàn trận chính diện, nhưng những dải Rừng Tùng hai bên cánh và gò đất cao giữa đồng mới là chìa khóa xoay chuyển càn khôn.',
    historicalQuote:
      '"Trên báo đền nợ nước, dưới yên định muôn dân — ba anh em ta đồng tâm hiệp lực giữa đất Bình Nguyên!" — Lưu Bị',
    tacticalTips: [
      'Rừng Tùng Phục Kích (Pine Forest Ambush): Giấu Thiết Kỵ trong dải Rừng Tùng hai cánh để tàng hình hoàn toàn, chờ bộ binh địch tiến qua giữa đồng rồi bất ngờ tập hậu vào tuyến Cung Thủ.',
      'Cao Điểm Trung Tâm (High Ground Ridge): Đưa Cung Thủ và Máy Bắn Đá (Trebuchet) lên gò đồi Bình Nguyên sớm để cộng thêm tầm bắn xa, sát thương xuyên giáp và tầm nhìn bao quát.',
      'Tường Thương Khắc Thiết Kỵ (Spearwall vs Shock Cavalry): Đồng bằng trống trải rất dễ bị Xung Kỵ càn quét — hãy bật đội hình Tường Thương (Spearwall) đứng yên trước cú húc để phản sát thương cực mạnh.',
      'Đơn Đấu Tam Quốc (Romance General Duels): Cho Quan Vũ hoặc Trương Phi khiêu chiến Đơn Đấu (Duel) với tướng tiên phong địch nhằm chém tướng đoạt kỳ, làm tụt sụp sĩ khí toàn quân đối phương.',
    ],
    tacticalGuide: {
      pineForestAmbush:
        'Tận dụng cụm Rừng Tùng rậm rạp ở sườn Bắc và sườn Nam để ẩn nấp kỵ binh; đơn vị đứng yên trong rừng sẽ vô hình trước tầm mắt địch cho tới khi lao ra đánh tạt sườn.',
      highGroundRanged:
        'Chiếm gò đồi đá ở trung tâm bản đồ cho Cung Nỏ và Máy Bắn Đá để áp đảo hỏa lực tầm xa, ép đối phương phải hành quân lên dốc chịu thiệt thể lực.',
      spearwallVsCavalry:
        'Không bao giờ để Thương Binh chạy lộn xộn khi Thiết Kỵ Hà Bắc lao tới — hãy đứng vững kích hoạt Tường Thương (Spearwall) hướng thẳng về mũi xung phong.',
      romanceGeneralDuel:
        'Khi thế trận giằng co, kích hoạt Đơn Đấu Võ Tướng ở tiền tuyến giúp khóa chân chủ tướng địch và tạo cú sốc tâm lý dây chuyền khi đối thủ ngã ngựa.',
    },
  },
  guandu: {
    id: 'guandu',
    title: 'Đại Chiến Quan Độ',
    subtitle: 'Battle of Guandu — 200 AD',
    year: '200 SCN · Kiến An năm thứ 5',
    location: 'Bến Quan Độ & Kho lương Ô Sào, Nam bờ Hoàng Hà',
    belligerents: {
      leftSide: 'Tinh Binh Tào Mạnh Đức (Ngụy Quân)',
      rightSide: 'Đại Quân Bốn Châu Viên Bản Sơ (Hà Bắc)',
      featuredGenerals: ['cao_cao', 'xiahou_dun', 'yuan_shao', 'guan_yu', 'sima_xiangan'],
    },
    summary:
      'Lấy ít địch nhiều kinh điển nhất lịch sử Tam Quốc: Tào Tháo cố thủ lũy đất Quan Độ trước bảy mươi vạn đại quân Viên Thiệu, dựng "Phát Thạch Xa" (Xe Sấm Sét) trên sườn cao bắn nát chòi tiễn của địch, rồi đích thân dẫn khinh kỵ luồn qua đường rừng đêm tối đốt cháy kho lương Ô Sào, lật ngược toàn bộ vận mệnh Trung Nguyên.',
    historicalQuote:
      '"Viên Bản Sơ chí lớn mà mưu mọn, binh đông nhưng hiệu lệnh bất nhất — chỉ một mồi lửa ở Ô Sào là đại cục định đoạt!" — Tào Tháo',
    tacticalTips: [
      'Cao Điểm Phát Thạch Xa (High Ground Ridges): Bố trí Máy Bắn Đá (Trebuchets) và Nỏ Thủ trên sườn lũy cao Quan Độ để tối đa hóa tầm bắn và giội đá lửa nghiền nát đội hình dày đặc của địch.',
      'Đường Rừng Đánh Úp Ô Sào (Pine Forest Cavalry Raid): Cho Thiết Kỵ ẩn mình luồn qua dải Rừng Tùng hẻo lánh bên cánh để vòng ra sau lưng địch, tiêu diệt gọn Máy Bắn Đá và Cung Thủ không người bảo vệ.',
      'Tường Thương Trấn Cửa Lũy (Spearwall Anchor): Khoảng hẹp giữa hai sườn đồi là yết hầu sống còn — cắm chặt Thương Binh ở tư thế Tường Thương để chặn đứng mọi đợt Thiết Kỵ húc trực diện.',
      'Trảm Tướng Đoạt Khí (Romance General Duels): Học theo Quan Vũ trảm Nhan Lương, Văn Xú — dùng Võ Tướng mạnh mở Đơn Đấu kết liễu tướng địch ngay đầu trận để làm vỡ trận biển người.',
    ],
    tacticalGuide: {
      pineForestAmbush:
        'Dải Rừng Tùng dọc sườn Tây tái hiện đường tắt tới Ô Sào: giấu 1–2 đạo Xung Kỵ trong rừng chờ chủ lực địch dồn lên công lũy rồi bất ngờ phóng ra quét sạch hậu tuyến.',
      highGroundRanged:
        'Sườn đồi lũy đất Quan Độ cho phép Máy Bắn Đá ("Thần Sấm Xe") và Cung Thủ bắn vượt qua đầu hàng thương binh tiền tuyến mà không bị cản tầm đạn.',
      spearwallVsCavalry:
        'Đại quân Viên Thiệu sở hữu kỵ binh xung kích cực nặng; chỉ cần giữ vững hàng Tường Thương nối liền chân đồi, sức húc kỵ binh sẽ tự dội ngược thành thương vong thảm khốc.',
      romanceGeneralDuel:
        'Mưu sĩ và Tướng chỉ huy như Viên Thiệu tránh Đơn Đấu trực diện với mãnh tướng như Quan Vũ hay Hạ Hầu Đôn — hãy chọn đúng đối thủ trước khi nhận lời khiêu chiến.',
    },
  },
  changban: {
    id: 'changban',
    title: 'Huyết Chiến Đương Dương Trường Bản',
    subtitle: 'Battle of Changban — 208 AD',
    year: '208 SCN · Kiến An năm thứ 13 (Mùa Thu)',
    location: 'Đồi Cảnh Sơn & Cầu Trường Bản, Đương Dương (Kinh Châu)',
    belligerents: {
      leftSide: 'Quân Hộ Chúa Triệu Vân – Trương Phi (Thục Hán)',
      rightSide: 'Hổ Báo Thiết Kỵ Tào Tháo (Đại Ngụy)',
      featuredGenerals: ['zhao_yun', 'zhang_fei', 'liu_bei', 'cao_cao', 'xiahou_dun'],
    },
    summary:
      'Giữa cuộc di tản vạn dặm cùng hàng chục vạn bách tính Kinh Châu, Triệu Tử Long một thương một ngựa phá vây giữa Hổ Báo Kỵ của Tào Tháo cứu ấu chúa A Đẩu, trong khi Trương Dực Đức một mình ghìm Bát Xà Mâu trấn giữ cầu Trường Bản, cho kỵ binh quét cành cây tung bụi mù trong Rừng Tùng khiến Tào Tháo nghi có phục binh không dám tiến.',
    historicalQuote:
      '"Dù phải xông pha vạn trượng giáo mác, Tử Long quyết không phụ sự ủy thác của chúa công!" — Triệu Vân',
    tacticalTips: [
      'Nghi Binh Rừng Tùng Cầu Trường Bản (Pine Forest Ambush): Phía sau cầu và hai mạn sườn dày đặc Rừng Tùng — giấu kỵ binh và bộ binh đột kích trong rừng để kẹp nát quân địch vừa lọt qua điểm nghẽn.',
      'Đỉnh Cảnh Sơn Quan Sát (High Ground Ridge): Tào Tháo từng đứng trên Cảnh Sơn chỉ huy toàn cục; ai chiếm được cao điểm sườn đồi này cho Cung Thủ & Máy Bắn Đá sẽ khống chế toàn bộ đường qua cầu.',
      'Tường Thương Chặn Hổ Báo Kỵ (Spearwall Chokepoint): Lập Tường Thương ngay đầu dốc và lối hẹp Trường Bản để biến cú xung phong của Hổ Báo Thiết Kỵ thành bẫy tử thần.',
      'Bản Lĩnh Độc Chiến Anh Hùng (Romance General Duels): Dùng Triệu Vân hoặc Trương Phi mở Đơn Đấu và tung Tuyệt Kỹ Tướng ngay điểm nóng để cầm chân cả đạo quân địch và vực dậy sĩ khí quân nhà.',
    ],
    tacticalGuide: {
      pineForestAmbush:
        'Tái hiện mưu kế bụi mù rừng tùng của Trương Phi: cho một đạo bộ binh nhử địch tiến sâu qua cầu rồi tung Thiết Kỵ mai phục sẵn trong Rừng Tùng đánh thốc vào sườn.',
      highGroundRanged:
        'Đưa Cung Nỏ chiếm sườn cao Cảnh Sơn để bắn xối xả xuống đội hình địch đang ùn ứ tại điểm thắt cổ chai mà đối phương rất khó tiếp cận phản kích.',
      spearwallVsCavalry:
        'Hổ Báo Kỵ cực mạnh khi lao xuống dốc — tuyệt đối khóa chặt mặt cầu và chân dốc bằng 2 lớp Tường Thương (Spearwall) đan xen Đao Thuẫn giữ sườn.',
      romanceGeneralDuel:
        'Một chiến thắng Đơn Đấu của Triệu Tử Long hoặc Trương Phi ngay trước cầu Trường Bản sẽ cộng nhuệ khí cho quân đồng minh xung quanh và đẩy tiền quân địch vào trạng thái dao động.',
    },
  },
  chibi: {
    id: 'chibi',
    title: 'Đại Chiến Xích Bích',
    subtitle: 'Battle of Red Cliffs — 208 AD',
    year: '208 SCN · Đông Kiến An năm thứ 13',
    location: 'Vách đá đỏ Xích Bích & Hẻm Hoa Dung, bờ Trường Giang',
    belligerents: {
      leftSide: 'Liên Minh Tôn – Lưu (Chu Du & Gia Cát Lượng)',
      rightSide: 'Đại Quân Nam Chinh Tào Tháo (Ngụy Quân)',
      featuredGenerals: ['zhuge_liang', 'zhou_yu', 'sun_jian', 'liu_bei', 'cao_cao'],
    },
    summary:
      'Đêm đông năm Kiến An thứ 13, ngọn gió Đông Nam nổi lên giữa vách đá đỏ Trường Giang. Chu Công Cẩn và Gia Cát Khổng Minh phối hợp hỏa công thiêu cháy trại thủy lục liên hoàn của Tào Tháo, rồi tung phục binh mai phục suốt dọc rừng tùng Ô Lâm tới hẻm Hoa Dung, định hình thế chân vạc Tam Quốc phân tranh suốt gần một thế kỷ.',
    historicalQuote:
      '"Gió đông bừng lửa đỏ vách sông, vạn chiến thuyền Tào phút chốc hóa tro tàn!" — Chu Du & Gia Cát Lượng',
    tacticalTips: [
      'Cao Điểm Vách Đỏ Hỏa Tiễn (High Ground Ridges): Đưa Cung Thủ Hỏa Tiễn và Máy Bắn Đá lên các vách đá cao Xích Bích để trút mưa lửa tầm xa thiêu rụi sĩ khí lẫn đội hình giáp nặng phương Bắc.',
      'Phục Binh Rừng Tùng Hoa Dung (Pine Forest Ambush): Bố trí Thiết Kỵ và Bộ Binh tinh nhuệ ẩn nấp trong các vạt Rừng Tùng ven sông kiểu hẻm Hoa Dung để chặn đánh tàn quân hoặc tập kích cánh hở.',
      'Tường Thương Giữ Bến Đổ Bộ (Spearwall Beachhead): Dựng Tường Thương vững chắc dọc hành lang bến sông nhằm bẻ gãy các đợt Thiết Kỵ Bắc phương liều mạng mở đường máu.',
      'Đấu Tướng & Tuyệt Kỹ Liên Hoàn (Romance Duels & Skills): Kết hợp Tuyệt Kỹ hỏa mưu của Mưu Sĩ với màn Đơn Đấu Võ Tướng đúng thời điểm để kích hoạt hiệu ứng Vỡ Trận Dây Chuyền (Chain Rout).',
    ],
    tacticalGuide: {
      pineForestAmbush:
        'Những vạt Rừng Tùng mịt mù sương khói dọc lối rút Ô Lâm – Hoa Dung là địa điểm hoàn hảo để giấu kỵ binh phục kích khóa chặt đường lui của đối phương.',
      highGroundRanged:
        'Vách đồi cao hai bên bờ Xích Bích mang lại lợi thế độ cao lớn nhất trong 4 bản đồ — ưu tiên bảo vệ Máy Bắn Đá và Cung Thủ trên đỉnh đồi bằng mọi giá.',
      spearwallVsCavalry:
        'Khi địch dồn toàn bộ Xung Kỵ mở đường thoát khỏi vùng hỏa lực, hàng Tường Thương khóa ngang thung lũng sẽ nghiền nát ý chí chiến đấu cuối cùng của chúng.',
      romanceGeneralDuel:
        'Thắng Đơn Đấu Võ Tướng ngay lúc địch đang chịu mưa tên lửa từ cao điểm sẽ khiến thanh sĩ khí đối phương sụp đổ tức thì, tái hiện đại thắng Xích Bích lịch sử.',
    },
  },
};

/**
 * Khẩu lệnh điều quân ngắn gọn chuẩn chất Tam Quốc Toàn Chiến (TW_ORDER_CALLOUTS)
 * dùng cho phụ đề giọng nói (voice-line subtitles) khi chọn đơn vị và ban bố quân lệnh.
 */
export const TW_ORDER_CALLOUTS: Readonly<Record<TwOrderCalloutKey, readonly string[]>> = {
  select: [
    'Tướng sĩ nghe lệnh! (Soldiers, awaiting orders!)',
    'Binh mã sẵn sàng xuất kích! (Troops ready to march!)',
    'Cờ hiệu đã giương — xin chủ công hạ lệnh! (Standards raised — command us, my lord!)',
    'Toàn đội nghiêm chỉnh hàng ngũ! (Formation standing ready!)',
  ],
  select_infantry: [
    'Đao thuẫn bộ binh nghe lệnh! (Sabre and shield infantry, ready!)',
    'Khiên sắt đao sắc, quyết tử tiền tuyến! (Iron shields and keen blades at the front!)',
    'Giáp sĩ tiền phong chờ hiệu trống! (Armored vanguard awaiting the drum!)',
  ],
  select_spearmen: [
    'Trường thương như rừng, sẵn sàng nghênh địch! (Forest of long spears ready!)',
    'Thương kích chỉnh tề — đố kỵ binh nào dám bén mảng! (Spears arrayed — let no cavalry pass!)',
    'Kích binh giữ vững thế trận! (Halberds holding formation!)',
  ],
  select_archers: [
    'Cung tên lên dây, chờ lệnh vạn tiễn! (Bows strung, awaiting the volley signal!)',
    'Liên châu nỏ đã nạp tên đầy ống! (Crossbows primed with full quivers!)',
    'Xạ thủ sẵn sàng che kín bầu trời! (Archers ready to darken the sky!)',
  ],
  select_cavalry: [
    'Chiến mã tung bờm, khao khát xung phong! (Warhorses pawing for the charge!)',
    'Thiết kỵ đã nắm chặt cương thương! (Shock cavalry lances couched!)',
    'Kỵ binh cơ động chờ lệnh bọc sườn! (Cavalry poised to outflank!)',
  ],
  select_artillery: [
    'Phát thạch xa đã kéo căng dây tời! (Trebuchets winched and ready!)',
    'Đá lửa sẵn sàng giội sấm sét xuống đầu giặc! (Flaming boulders primed to thunder!)',
    'Công thành pháo đội chờ tọa độ mục tiêu! (Siege engines awaiting target range!)',
  ],
  select_general: [
    'Bản tướng thân chinh lĩnh mệnh! (Your general rides at the fore!)',
    'Cờ soái phất cao — ba quân nhìn theo mũi đao của ta! (Eyes upon my command blade!)',
    'Đại trượng phu lập công chính là lúc này! (Now is the hour for heroic deeds!)',
  ],
  move: [
    'Theo cờ hiệu tiến quân! Giữ đều đội hình! (Advance to the standard! Keep ranks!)',
    'Chỉnh đốn hàng ngũ, tiến chiếm vị trí! (Dress ranks and march to position!)',
    'Ba quân trật tự chuyển bước! (March forward in disciplined order!)',
  ],
  run: [
    'Hành quân cấp tốc! Chớ để lỡ quân cơ! (Double time! Seize the tactical moment!)',
    'Gấp rút chạy đều bước — nhanh chân lên! (Quickening pace — move swiftly!)',
    'Thần tốc chiếm lĩnh trận địa! (Rush to secure the ground!)',
  ],
  attack: [
    'Sát! Xông lên chém tan quân giặc! (Slay them! Break the enemy line!)',
    'Trống trận thúc vang — toàn quân công kích! (War drums roar — press the attack!)',
    'Không lùi nửa bước, đánh gục chúng tại trận! (Yield not an inch — strike them down!)',
  ],
  attack_melee: [
    'Tuốt đao giáp lá cà — quyết chiến sinh tử! (Draw steel and close for melee!)',
    'Áp sát hàng ngũ địch, chém gãy cờ hiệu của chúng! (Close in and cleave their standards!)',
    'Đao kiếm chạm nhau mới biết mặt anh hùng! (Blade to blade proves true valor!)',
  ],
  attack_ranged: [
    'Vạn tiễn tề phát! Nhắm thẳng đội hình giặc! (Loose all arrows into their ranks!)',
    'Giương cung... Phóng tên! Trút mưa lửa xuống đầu chúng! (Draw... Loose! Rain fire upon them!)',
    'Tập trung hỏa lực tầm xa, bắn không ngơi tay! (Focus ranged fire — volley after volley!)',
  ],
  charge: [
    'Thiết kỵ xung phong! Xé toạc trận tiền! (Shock cavalry — charge and shatter them!)',
    'Hạ thấp mũi thương, thúc ngựa giẫm nát quân thù! (Lower lances! Trample their line!)',
    'Xung sát! Mở đường máu xuyên thủng trung quân! (Charge! Carve straight through their center!)',
  ],
  spearwall: [
    'Dựng Tường Thương! Cắm chặt cán giáo khắc chế kỵ binh! (Form Spearwall! Brace against cavalry!)',
    'Rừng thương nhím sắt — đứng vững chờ giặc lao vào! (Iron pike wall — hold fast and brace!)',
    'Khóa chặt Mâu Trận, tuyệt đối không xê dịch hàng ngũ! (Lock Spearwall — do not break ranks!)',
  ],
  hold: [
    'Kết thuẫn cố thủ! Đứng vững như núi Thái Sơn! (Lock shields! Stand firm as Mount Tai!)',
    'Tử thủ trận địa, một tấc đất cũng không nhường! (Hold this ground to the last breath!)',
    'Giữ chặt vị trí chờ lệnh phản công! (Hold position and await the counter-stroke!)',
  ],
  ambush_forest: [
    'Ẩn mình trong Rừng Tùng — im cờ tắt trống chờ giặc lọt bẫy! (Hide in the pines — silent until the trap springs!)',
    'Nín thở mai phục dưới tán tùng, chuẩn bị đánh tạt sườn! (Concealed beneath the pines — ready to flank!)',
    'Phục binh sẵn sàng trong rừng rậm! (Ambushers concealed in deep woods!)',
  ],
  high_ground: [
    'Chiếm lĩnh Sườn Đồi! Từ cao điểm khống chế toàn chiến trường! (Seize the High Ground ridge!)',
    'Đưa cung nỏ và máy bắn đá lên đỉnh gò cao! (Deploy archers and trebuchets atop the crest!)',
    'Giữ vững cao điểm — lấy thế trên cao đè bẹp quân địch! (Command the heights and dominate below!)',
  ],
  duel: [
    'Tránh đường! Để bản tướng một mình trảm đầu tướng giặc! (Clear the circle! This duel is mine alone!)',
    'Trống Đơn Đấu rền vang — anh hùng phân cao thấp! (Duel drums thunder — warrior against warrior!)',
    'Một ngựa một đao quyết thắng bại trước ba quân! (One steed, one blade before both armies!)',
  ],
  skill: [
    'Tuyệt kỹ khai phát — uy chấn tam quân! (Ultimate stratagem unleashed — shake all three armies!)',
    'Nghe hiệu lệnh bản soái — bùng nổ hào khí xung thiên! (Heed my command — unleash heroic fury!)',
    'Thiên thời đã điểm, tung chiêu quyết định! (The hour strikes — unleash our decisive art!)',
  ],
  retreat: [
    'Thu quân có trật tự! Bảo toàn thực lực chờ thời! (Tactical withdrawal! Maintain formation!)',
    'Rút về tuyến sau chỉnh đốn khiên giáo! (Fall back to the rear line and regroup!)',
  ],
  rally: [
    'Tướng sĩ chớ hoảng! Chủ soái vẫn đứng vững nơi tiền tuyến! (Steady, warriors! Your commander stands unbroken!)',
    'Nhìn lên đại kỳ — chấn chỉnh sĩ khí, quay lại nghênh chiến! (Look to the banner — rally and fight on!)',
  ],
  routing: [
    'Sĩ khí sụp đổ rồi — đội hình đang vỡ trận tháo chạy! (Morale shattered — the unit is routing!)',
    'Không cản nổi nữa rồi, mau giữ mạng tháo lui! (The line breaks — flee for your lives!)',
  ],
};

const ORDER_CALLOUT_ALIASES: Readonly<Record<string, TwOrderCalloutKey>> = {
  select_unit: 'select',
  infantry: 'select_infantry',
  spearman: 'select_spearmen',
  spearmen: 'select_spearmen',
  halberd: 'select_spearmen',
  archer: 'select_archers',
  archers: 'select_archers',
  crossbow: 'select_archers',
  cavalry: 'select_cavalry',
  shock_cavalry: 'select_cavalry',
  trebuchet: 'select_artillery',
  artillery: 'select_artillery',
  general: 'select_general',
  march: 'move',
  double_time: 'run',
  sprint: 'run',
  melee: 'attack_melee',
  fire: 'attack_ranged',
  volley: 'attack_ranged',
  cavalry_charge: 'charge',
  spearwall_on: 'spearwall',
  brace: 'spearwall',
  defend: 'hold',
  shieldwall: 'hold',
  forest: 'ambush_forest',
  ambush: 'ambush_forest',
  ridge: 'high_ground',
  duel_start: 'duel',
  skill_cast: 'skill',
  withdraw: 'retreat',
  rout: 'routing',
  enemy_routing: 'routing',
};

/**
 * Chọn nhanh một câu khẩu lệnh phụ đề tiếng Việt chuẩn Tam Quốc theo hành động chọn quân / ra lệnh.
 */
export function pickOrderCallout(orderKey: TwOrderCalloutKey | string, seed?: number): string {
  const normalized = orderKey.trim().toLowerCase();
  const resolvedKey: TwOrderCalloutKey = Object.prototype.hasOwnProperty.call(
    TW_ORDER_CALLOUTS,
    normalized,
  )
    ? (normalized as TwOrderCalloutKey)
    : (ORDER_CALLOUT_ALIASES[normalized] ?? 'select');

  const lines = TW_ORDER_CALLOUTS[resolvedKey];
  const idx = selectIndexDeterministically(lines.length, `callout:${resolvedKey}`, seed);
  return lines[idx];
}
