/** Thẻ "ai đang dùng": avatar + tên anh hùng gắn lên bùa / trang bị đang được trang bị (dễ phân biệt đồ dùng chung). */

import { EXPEDITION_HEROES_BY_ID } from './shared';
import { expeditionAssetUrl } from './store';

export function OwnerTag({ heroId, self = false }: { heroId?: string; self?: boolean }) {
  if (!heroId) return null;
  const name = EXPEDITION_HEROES_BY_ID[heroId]?.nameVi ?? heroId;
  return (
    <span className={`owner-tag ${self ? 'self' : ''}`} title={`Đang dùng: ${name}`}>
      <img src={expeditionAssetUrl(`units/heroes/${heroId}-portrait.png`)} alt="" />
      <b>{name}</b>
    </span>
  );
}
