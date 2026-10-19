import { useState, type CSSProperties } from 'react';
import { Skull } from 'lucide-react';
import CatAvatar from './CatAvatar';

interface Props {
  /** playerId – dùng làm seed khi chưa chọn avatar */
  id: string;
  /** "cat:<seed>" hoặc "/avatars/<file>" */
  avatar?: string;
  size?: number;
  dead?: boolean;
}

/** Avatar người chơi: ảnh đã tải lên, hoặc avatar mèo theo seed */
export default function PlayerAvatar({ id, avatar, size = 56, dead }: Props) {
  const [broken, setBroken] = useState(false);
  if (avatar?.startsWith('/avatars/') && !broken) {
    return (
      <span
        className={`avatar avatar-photo${dead ? ' dead' : ''}`}
        style={{ ['--av-size' as string]: `${size}px` } as CSSProperties}
      >
        <img src={avatar} alt="" width={size} height={size} draggable={false} onError={() => setBroken(true)} />
        {dead && (
          <span className="avatar-x">
            <Skull className="cat-avatar-main-svg" strokeWidth={2.2} />
          </span>
        )}
      </span>
    );
  }
  const seed = avatar?.startsWith('cat:') ? avatar.slice(4) : id;
  return <CatAvatar seed={seed} size={size} dead={dead} />;
}
