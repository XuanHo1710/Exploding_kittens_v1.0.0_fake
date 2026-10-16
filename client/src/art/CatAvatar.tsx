import { Head, INK, Star, type Eyes, type Mouth } from './parts';

const FURS = ['#f2a65a', '#9aa0a6', '#3a3633', '#f6f1ea', '#c98a5a', '#e0c3a0', '#a5b4fc', '#ffb4a2', '#8ce99a', '#ffd43b'];
const STRIPES: Record<string, string> = { '#f2a65a': '#c97a35', '#9aa0a6': '#6c737a', '#c98a5a': '#9c6238', '#ffd43b': '#e8a400' };
const BGS = ['#ffe8cc', '#d3f9d8', '#d0ebff', '#f3d9fa', '#fff3bf', '#ffe3e3', '#e5dbff', '#c5f6fa'];
const EYES: Eyes[] = ['dot', 'happy', 'wink', 'side', 'shiny', 'shades', 'meh', 'dot'];
const MOUTHS: Mouth[] = ['cat', 'smile', 'smirk', 'tongue', 'cat'];
type Acc = 'none' | 'bow' | 'party' | 'crown' | 'flower' | 'headphones';
const ACCS: Acc[] = ['none', 'bow', 'party', 'crown', 'flower', 'headphones', 'none'];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function Accessory({ acc }: { acc: Acc }) {
  switch (acc) {
    case 'bow':
      return (
        <g transform="translate(124 34) rotate(20)">
          <path d="M0 0 L-14 -9 L-14 9 Z M0 0 L14 -9 L14 9 Z" fill="#ff6b8b" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <circle r="4" fill="#ff6b8b" stroke={INK} strokeWidth="2.5" />
        </g>
      );
    case 'party':
      return (
        <g>
          <path d="M84 36 L100 0 L116 36 Z" fill="#4dabf7" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M90 24 L110 24 M94 14 L106 14" stroke="#ffd43b" strokeWidth="3" />
          <circle cx="100" cy="0" r="5" fill="#ff6b8b" stroke={INK} strokeWidth="2.5" />
        </g>
      );
    case 'crown':
      return (
        <path d="M78 38 L80 14 L92 26 L100 8 L108 26 L120 14 L122 38 Z" fill="#ffd43b" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      );
    case 'flower':
      return (
        <g transform="translate(70 40)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-7" rx="5" ry="7" fill="#fff" stroke={INK} strokeWidth="2" transform={`rotate(${a})`} />
          ))}
          <circle r="4.5" fill="#ffd43b" stroke={INK} strokeWidth="2" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M58 76 C56 30 144 30 142 76" fill="none" stroke={INK} strokeWidth="7" />
          <path d="M58 76 C56 30 144 30 142 76" fill="none" stroke="#e64980" strokeWidth="3.5" />
          <rect x="52" y="64" width="14" height="24" rx="6" fill="#e64980" stroke={INK} strokeWidth="3" />
          <rect x="134" y="64" width="14" height="24" rx="6" fill="#e64980" stroke={INK} strokeWidth="3" />
        </g>
      );
    default:
      return null;
  }
}

/** Avatar mèo sinh ngẫu nhiên nhưng cố định theo playerId */
export default function CatAvatar({ seed, size = 56, dead }: { seed: string; size?: number; dead?: boolean }) {
  const h = hash(seed);
  const fur = FURS[h % FURS.length];
  const bg = BGS[(h >>> 4) % BGS.length];
  const eyes = dead ? 'x' : EYES[(h >>> 8) % EYES.length];
  const mouth = dead ? 'wavy' : MOUTHS[(h >>> 12) % MOUTHS.length];
  const acc = ACCS[(h >>> 16) % ACCS.length];
  const stripes = (h >>> 20) % 2 ? STRIPES[fur] : undefined;
  return (
    <svg width={size} height={size} viewBox="40 0 120 120" className="avatar" aria-hidden="true">
      <circle cx="100" cy="60" r="60" fill={bg} />
      <g transform="translate(0 10)">
        <Head fur={fur} eyes={eyes} mouth={mouth} stripes={stripes} blush={eyes === 'happy' || eyes === 'shiny'} innerEar={fur === '#3a3633' ? '#b07a8e' : undefined}>
          <Accessory acc={acc} />
        </Head>
      </g>
      {dead && <Star x={140} y={18} r={9} fill="#fff" stroke={INK} />}
    </svg>
  );
}

/** Mặt sau lá bài (tỉ lệ 3:4) */
export function CardBack({ count }: { count?: number }) {
  return (
    <svg viewBox="0 0 105 140" className="card-back-svg" aria-hidden="true">
      <defs>
        <pattern id="cb-dots" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="1.4" fill="#fff" opacity=".12" />
        </pattern>
        <radialGradient id="cb-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#4b3f74" />
          <stop offset="1" stopColor="#231d36" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="105" height="140" rx="9" fill="url(#cb-glow)" />
      <rect x="0" y="0" width="105" height="140" rx="9" fill="url(#cb-dots)" />
      <rect x="6" y="6" width="93" height="128" rx="6" fill="none" stroke="#ffd23f" strokeWidth="1.5" strokeDasharray="4 3" opacity=".7" />
      <g transform="translate(20.5 30) scale(.32)">
        <path d="M100 34 C100 20 116 16 120 6" fill="none" stroke="#c08a52" strokeWidth="5" strokeLinecap="round" />
        <Star x={122} y={2} r={11} />
        <Head fur="#f2a65a" eyes="dot" mouth="cat" stripes="#c97a35" />
      </g>
      <text x="52.5" y="98" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="15" fill="#ffd23f">
        MÈO NỔ
      </text>
      {count !== undefined && (
        <text x="52.5" y="118" textAnchor="middle" fontFamily="'Be Vietnam Pro', sans-serif" fontWeight="700" fontSize="11" fill="#fff" opacity=".85">
          còn {count} lá
        </text>
      )}
    </svg>
  );
}
