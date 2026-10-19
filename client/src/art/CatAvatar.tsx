import type { CSSProperties } from 'react';
import {
  Cat,
  Crown,
  Headphones,
  Sparkles,
  Flame,
  Star,
  Skull,
  Bomb,
  Shield,
  Zap,
} from 'lucide-react';

const PALETTES = [
  { bg: '#fff4e6', fg: '#d9480f', ring: '#ffd8a8' },
  { bg: '#ebfbee', fg: '#2b8a3e', ring: '#b2f2bb' },
  { bg: '#e7f5ff', fg: '#1971c2', ring: '#a5d8ff' },
  { bg: '#f3f0ff', fg: '#5f3dc4', ring: '#d0bfff' },
  { bg: '#fff9db', fg: '#b45309', ring: '#ffec99' },
  { bg: '#fff0f6', fg: '#c2255c', ring: '#fcc2d7' },
  { bg: '#e3fafc', fg: '#0c8599', ring: '#99e9f2' },
  { bg: '#f8f9fa', fg: '#343a40', ring: '#dee2e6' },
];

const BADGES = [null, Crown, Headphones, Sparkles, Flame, Star, Shield, Zap] as const;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Avatar người chơi dùng React icon chuẩn từ lucide-react thay vì hình vẽ tự chế */
export default function CatAvatar({ seed, size = 56, dead }: { seed: string; size?: number; dead?: boolean }) {
  const h = hash(seed);
  const pal = PALETTES[h % PALETTES.length];
  const BadgeIcon = BADGES[(h >>> 6) % BADGES.length];

  return (
    <span
      className={`avatar cat-icon-avatar${dead ? ' dead' : ''}`}
      style={
        {
          ['--av-size' as string]: `${size}px`,
          background: dead ? '#e9ecef' : pal.bg,
          color: dead ? '#495057' : pal.fg,
          boxShadow: `inset 0 0 0 2px ${dead ? '#adb5bd' : pal.ring}`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {dead ? <Skull className="cat-avatar-main-svg" strokeWidth={2} /> : <Cat className="cat-avatar-main-svg" strokeWidth={2} />}
      {!dead && BadgeIcon && (
        <span className="cat-avatar-badge" style={{ color: pal.fg }}>
          <BadgeIcon className="cat-avatar-badge-svg" strokeWidth={2.2} />
        </span>
      )}
    </span>
  );
}

/** Mặt sau lá bài (tỉ lệ 3:4) gọn gàng với icon React */
export function CardBack({ count }: { count?: number }) {
  return (
    <div className="card-back-box" aria-hidden="true">
      <div className="card-back-inner">
        <div className="card-back-emblem">
          <Bomb size={26} strokeWidth={2.2} />
        </div>
        <span className="card-back-title">MÈO NỔ</span>
        {count !== undefined && <span className="card-back-count">còn {count} lá</span>}
      </div>
    </div>
  );
}
