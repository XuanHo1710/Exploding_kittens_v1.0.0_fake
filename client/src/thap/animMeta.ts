/**
 * Điểm truy cập metadata tài nguyên đồ họa & âm thanh Miragine War phía client.
 * Tái xuất toàn bộ bảng metadata gốc từ `shared/src` kèm các helper dựng khóa/đường dẫn sheet.
 */

import { animKey } from '../../../shared/src';

export {
  MIRAGINE_ANIMS,
  MIRAGINE_AUDIO_ASSETS,
  MIRAGINE_PROJECTILES,
  MIRAGINE_STRUCTURES,
  MIRAGINE_TERRAINS,
  MIRAGINE_UI_ASSETS,
  animKey,
  portraitUrl,
  type AnimMeta,
  type ProjectileMeta,
  type StructureMeta,
} from '../../../shared/src';

/** 4 trạng thái hoạt ảnh chuẩn của mỗi binh chủng trong `database-miraginewar/sheets/`. */
export type MiragineAct = 'idle' | 'run' | 'attack' | 'dead';

/** Quy đổi chỉ số phe (`0` = Phe Đỏ `'A'`, `1` = Phe Xanh `'B'`). */
export function miragineSidePrefix(owner: number): 'A' | 'B' {
  return owner === 1 ? 'B' : 'A';
}

/** Tạo khóa tra cứu `MIRAGINE_ANIMS` theo phe (`owner`), chỉ số sprite `ss` (`0..15`) và hành động. */
export function miragineAnimKey(owner: number, ss: number, act: MiragineAct): string {
  return animKey(miragineSidePrefix(owner), ss, act);
}

/** Trả về đường dẫn PNG của sprite sheet theo khóa (ví dụ `A0_idle` -> `/database-miraginewar/sheets/A0_idle.png`). */
export function miragineSheetUrl(key: string): string {
  return `/database-miraginewar/sheets/${key}.png`;
}
