/**
 * Metadata sprite sheet, công trình, đạn phép, địa hình, UI và âm thanh nguyên bản Miragine War
 * trích xuất 1:1 từ `database-miraginewar/mapping.json` và `database-miraginewar/*`.
 */

export type AnimMeta = readonly [frames: number, cellW: number, cellH: number, offX: number, offY: number];

export interface StructureMeta {
  readonly file: string;
  readonly w: number;
  readonly h: number;
  readonly offX: number;
  readonly offY: number;
}

export interface ProjectileMeta {
  readonly key: 'fireball' | 'thunderball' | 'storm';
  readonly file: string;
  readonly frames: number;
  readonly cellW: number;
  readonly cellH: number;
  readonly mappingOffX: number;
  readonly mappingOffY: number;
  readonly centerOffX: number;
  readonly centerOffY: number;
}

/** Toàn bộ 128 sheet lính (`A0_idle`..`B15_dead`) đúng 1:1 với `mapping.json` kèm tuple đạn kế thừa. */
export const MIRAGINE_ANIMS: Record<string, AnimMeta> = {
  A0_idle: [3, 62, 53, -31, -53],
  A0_run: [6, 46, 52, -26, -49],
  A0_attack: [5, 88, 66, -63, -65],
  A0_dead: [6, 99, 74, -26, -60],
  A1_idle: [3, 63, 53, -31, -55],
  A1_run: [6, 44, 52, -26, -52],
  A1_attack: [5, 91, 61, -62, -62],
  A1_dead: [5, 100, 72, -27, -60],
  A2_idle: [3, 58, 51, -32, -51],
  A2_run: [6, 64, 60, -37, -57],
  A2_attack: [6, 120, 61, -92, -60],
  A2_dead: [3, 86, 61, -32, -50],
  A3_idle: [3, 58, 53, -31, -55],
  A3_run: [6, 64, 61, -36, -55],
  A3_attack: [4, 93, 60, -67, -62],
  A3_dead: [3, 86, 66, -34, -57],
  A4_idle: [3, 42, 58, -26, -60],
  A4_run: [6, 63, 56, -33, -57],
  A4_attack: [6, 65, 59, -45, -61],
  A4_dead: [3, 92, 55, -29, -56],
  A5_idle: [3, 57, 49, -40, -48],
  A5_run: [6, 49, 58, -28, -56],
  A5_attack: [5, 70, 60, -53, -59],
  A5_dead: [3, 93, 53, -42, -51],
  A6_idle: [3, 40, 52, -26, -52],
  A6_run: [6, 47, 49, -25, -49],
  A6_attack: [6, 72, 52, -56, -51],
  A6_dead: [3, 58, 43, -30, -41],
  A7_idle: [3, 29, 56, -17, -55],
  A7_run: [6, 52, 52, -27, -52],
  A7_attack: [6, 41, 56, -27, -56],
  A7_dead: [3, 71, 61, -25, -52],
  A8_idle: [3, 63, 64, -32, -63],
  A8_run: [6, 71, 65, -37, -62],
  A8_attack: [6, 88, 67, -56, -66],
  A8_dead: [2, 73, 64, -32, -64],
  A9_idle: [3, 63, 59, -37, -60],
  A9_run: [6, 63, 63, -33, -61],
  A9_attack: [5, 84, 70, -61, -67],
  A9_dead: [3, 77, 69, -30, -58],
  A10_idle: [3, 45, 60, -27, -60],
  A10_run: [3, 60, 65, -32, -69],
  A10_attack: [5, 74, 60, -42, -58],
  A10_dead: [6, 71, 63, -27, -57],
  A11_idle: [3, 62, 51, -32, -51],
  A11_run: [3, 56, 48, -34, -46],
  A11_attack: [6, 82, 51, -56, -51],
  A11_dead: [4, 78, 60, -26, -53],
  A12_idle: [3, 54, 45, -32, -46],
  A12_run: [6, 53, 46, -34, -46],
  A12_attack: [6, 78, 71, -52, -72],
  A12_dead: [3, 87, 47, -40, -47],
  A13_idle: [3, 81, 63, -54, -62],
  A13_run: [6, 103, 55, -65, -55],
  A13_attack: [4, 112, 96, -64, -96],
  A13_dead: [3, 91, 61, -56, -56],
  A14_idle: [3, 41, 49, -26, -50],
  A14_run: [6, 44, 51, -26, -50],
  A14_attack: [7, 76, 57, -46, -57],
  A14_dead: [3, 66, 52, -24, -51],
  A15_idle: [3, 57, 49, -39, -47],
  A15_run: [6, 49, 58, -26, -56],
  A15_attack: [5, 70, 60, -51, -59],
  A15_dead: [3, 95, 51, -42, -50],
  B0_idle: [3, 62, 53, -31, -53],
  B0_run: [6, 46, 52, -26, -49],
  B0_attack: [5, 88, 66, -63, -65],
  B0_dead: [6, 99, 74, -26, -60],
  B1_idle: [3, 63, 53, -31, -55],
  B1_run: [6, 44, 52, -26, -52],
  B1_attack: [5, 91, 61, -62, -62],
  B1_dead: [5, 100, 72, -27, -60],
  B2_idle: [3, 58, 51, -32, -51],
  B2_run: [6, 64, 60, -37, -57],
  B2_attack: [6, 120, 61, -92, -60],
  B2_dead: [3, 86, 61, -32, -50],
  B3_idle: [3, 58, 53, -31, -55],
  B3_run: [6, 64, 61, -36, -59],
  B3_attack: [4, 93, 60, -67, -62],
  B3_dead: [3, 86, 66, -34, -57],
  B4_idle: [3, 42, 58, -26, -60],
  B4_run: [6, 63, 56, -33, -57],
  B4_attack: [6, 65, 59, -45, -61],
  B4_dead: [3, 92, 55, -29, -56],
  B5_idle: [3, 57, 49, -40, -48],
  B5_run: [6, 49, 58, -28, -56],
  B5_attack: [5, 70, 60, -53, -59],
  B5_dead: [3, 93, 53, -42, -51],
  B6_idle: [3, 40, 52, -26, -52],
  B6_run: [6, 47, 49, -25, -49],
  B6_attack: [6, 72, 52, -56, -51],
  B6_dead: [3, 58, 43, -30, -43],
  B7_idle: [3, 29, 56, -17, -55],
  B7_run: [6, 52, 52, -27, -52],
  B7_attack: [6, 41, 56, -27, -56],
  B7_dead: [3, 71, 61, -25, -52],
  B8_idle: [3, 63, 64, -35, -63],
  B8_run: [6, 71, 65, -37, -62],
  B8_attack: [6, 88, 67, -56, -66],
  B8_dead: [2, 73, 64, -32, -64],
  B9_idle: [3, 63, 59, -37, -60],
  B9_run: [6, 63, 63, -33, -61],
  B9_attack: [5, 84, 70, -61, -67],
  B9_dead: [3, 77, 69, -30, -58],
  B10_idle: [3, 45, 60, -27, -60],
  B10_run: [3, 60, 65, -32, -68],
  B10_attack: [5, 74, 60, -42, -58],
  B10_dead: [6, 71, 63, -27, -57],
  B11_idle: [3, 62, 51, -32, -51],
  B11_run: [3, 56, 48, -34, -46],
  B11_attack: [6, 82, 51, -56, -51],
  B11_dead: [4, 78, 60, -26, -53],
  B12_idle: [3, 54, 45, -32, -46],
  B12_run: [6, 53, 46, -34, -46],
  B12_attack: [6, 78, 71, -52, -72],
  B12_dead: [3, 87, 47, -40, -47],
  B13_idle: [3, 81, 63, -54, -62],
  B13_run: [6, 103, 55, -65, -55],
  B13_attack: [4, 112, 96, -64, -96],
  B13_dead: [3, 91, 61, -56, -56],
  B14_idle: [3, 41, 49, -26, -50],
  B14_run: [6, 44, 51, -26, -50],
  B14_attack: [7, 76, 57, -46, -57],
  B14_dead: [3, 66, 52, -24, -51],
  B15_idle: [3, 57, 49, -39, -47],
  B15_run: [6, 49, 58, -26, -56],
  B15_attack: [5, 70, 60, -51, -59],
  B15_dead: [3, 95, 51, -42, -50],
  fireball: [3, 32, 32, -16, -16],
  thunderball: [16, 128, 128, -64, -64],
  storm: [9, 153, 261, -76, -130],
};

/** Thông số đạn phép gốc kèm offset tâm và offset gốc từ `mapping.json`. */
export const MIRAGINE_PROJECTILES: Record<'fb' | 'tb' | 'storm', ProjectileMeta> = {
  fb: {
    key: 'fireball',
    file: '/database-miraginewar/projectiles/fireball.png',
    frames: 3,
    cellW: 32,
    cellH: 32,
    mappingOffX: 0,
    mappingOffY: 0,
    centerOffX: -16,
    centerOffY: -16,
  },
  tb: {
    key: 'thunderball',
    file: '/database-miraginewar/projectiles/thunderball.png',
    frames: 16,
    cellW: 128,
    cellH: 128,
    mappingOffX: 0,
    mappingOffY: 0,
    centerOffX: -64,
    centerOffY: -64,
  },
  storm: {
    key: 'storm',
    file: '/database-miraginewar/projectiles/storm.png',
    frames: 9,
    cellW: 153,
    cellH: 261,
    mappingOffX: -8,
    mappingOffY: -4,
    centerOffX: -76,
    centerOffY: -130,
  },
};

/** Thông số hình ảnh công trình & bóng đổ từ `mapping.json`. */
export const MIRAGINE_STRUCTURES: Record<'A_crystal' | 'B_crystal' | 'door' | 'shadow', StructureMeta> = {
  A_crystal: {
    file: '/database-miraginewar/structures/A_crystal.png',
    w: 96,
    h: 144,
    offX: -48,
    offY: -144,
  },
  B_crystal: {
    file: '/database-miraginewar/structures/B_crystal.png',
    w: 96,
    h: 144,
    offX: -48,
    offY: -144,
  },
  door: {
    file: '/database-miraginewar/structures/door.png',
    w: 150,
    h: 296,
    offX: -75,
    offY: -220,
  },
  shadow: {
    file: '/database-miraginewar/structures/shadow.png',
    w: 38,
    h: 16,
    offX: -19,
    offY: -8,
  },
};

export const MIRAGINE_TERRAINS = {
  terrain: '/database-miraginewar/terrains/terrain.jpg',
  terrain2: '/database-miraginewar/terrains/terrain2.jpg',
} as const;

export const MIRAGINE_UI_ASSETS = {
  bar_frame: '/database-miraginewar/ui/bar_frame.png',
  cursor_p1: '/database-miraginewar/ui/cursor_p1.png',
  timebg: '/database-miraginewar/ui/timebg.png',
  icon_money: '/database-miraginewar/ui/icon_money.png',
  icon_income: '/database-miraginewar/ui/icon_income.png',
  icon_renli: '/database-miraginewar/ui/icon_renli.png',
  logo_miragine: '/database-miraginewar/ui/logo_miragine.png',
  logo_unit: '/database-miraginewar/ui/logo_unit.png',
  win: '/database-miraginewar/ui/win.png',
  lose: '/database-miraginewar/ui/lose.png',
  title_bg: '/database-miraginewar/ui/title_bg.jpg',
  tutorial_bg: '/database-miraginewar/ui/tutorial_bg.jpg',
} as const;

export const MIRAGINE_AUDIO_ASSETS = {
  dead1: '/database-miraginewar/audio/SD_dead1.mp3',
  dead2: '/database-miraginewar/audio/SD_dead2.mp3',
  dead3: '/database-miraginewar/audio/SD_dead3.mp3',
  dead4: '/database-miraginewar/audio/SD_dead4.mp3',
  dead5: '/database-miraginewar/audio/SD_dead5.mp3',
  dead6: '/database-miraginewar/audio/SD_dead6.mp3',
  dao: '/database-miraginewar/audio/SD_dao.mp3',
  cha: '/database-miraginewar/audio/SD_cha.mp3',
  timer: '/database-miraginewar/audio/SD_Timer.mp3',
  btns: '/database-miraginewar/audio/SD_btns.mp3',
  cheer: '/database-miraginewar/audio/SD_cheer.mp3',
  gameLoop: '/database-miraginewar/audio/gameLoop.mp3',
  mainLoop: '/database-miraginewar/audio/mainLoop.mp3',
} as const;

/** Tạo khóa tra cứu `MIRAGINE_ANIMS` cho phe (`A`/`B`), chỉ số sheet `ss` (0..15) và hành động. */
export function animKey(side: 'A' | 'B', ss: number, act: 'idle' | 'run' | 'attack' | 'dead'): string {
  return `${side}${ss}_${act}`;
}

/** Trả về đường dẫn ảnh chân dung (`a0..a15` hoặc `b0..b15`) theo id lính (0..15) và phe. */
export function portraitUrl(unitId: number, side: 'a' | 'b' = 'a'): string {
  return `/database-miraginewar/portraits/${side}${unitId}.png`;
}
