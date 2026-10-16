import { useState } from 'react';
import CatAvatar from './CatAvatar';

interface Props {
  /** playerId – dùng làm seed khi chưa chọn avatar */
  id: string;
  /** "cat:<seed>" hoặc "/avatars/<file>" */
  avatar?: string;
  size?: number;
  dead?: boolean;
}

/** Avatar người chơi: ảnh đã tải lên, hoặc mèo vẽ theo seed */
export default function PlayerAvatar({ id, avatar, size = 56, dead }: Props) {
  const [broken, setBroken] = useState(false);
  if (avatar?.startsWith('/avatars/') && !broken) {
    return (
      <span className={`avatar avatar-photo${dead ? ' dead' : ''}`} style={{ width: size, height: size }}>
        <img src={avatar} alt="" width={size} height={size} draggable={false} onError={() => setBroken(true)} />
        {dead && <span className="avatar-x">✕</span>}
      </span>
    );
  }
  const seed = avatar?.startsWith('cat:') ? avatar.slice(4) : id;
  return <CatAvatar seed={seed} size={size} dead={dead} />;
}
