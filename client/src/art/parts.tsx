/**
 * Bộ phận vẽ mèo dùng chung (hệ toạ độ 200×170, đầu mèo tâm (100,72) bán kính 38).
 * Phong cách: nét đen dày, màu phẳng.
 */
import type { ReactNode } from 'react';

export const INK = '#1d1b1a';
const SW = 3.5;

export type Eyes =
  | 'dot'
  | 'scared'
  | 'happy'
  | 'meh'
  | 'x'
  | 'goggles'
  | 'shades'
  | 'shiny'
  | 'wink'
  | 'side'
  | 'squeeze'
  | 'angry';
export type Mouth = 'smile' | 'o' | 'flat' | 'grin' | 'tongue' | 'smirk' | 'wavy' | 'cat';

function EyesSvg({ eyes, fur }: { eyes: Eyes; fur: string }) {
  switch (eyes) {
    case 'dot':
    case 'angry':
      return (
        <g>
          <circle cx="86" cy="70" r="6.5" fill={INK} />
          <circle cx="114" cy="70" r="6.5" fill={INK} />
          <circle cx="88.5" cy="67.5" r="2.2" fill="#fff" />
          <circle cx="116.5" cy="67.5" r="2.2" fill="#fff" />
          {eyes === 'angry' && (
            <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
              <path d="M76 56 L94 62" />
              <path d="M124 56 L106 62" />
            </g>
          )}
        </g>
      );
    case 'scared':
      return (
        <g>
          <circle cx="86" cy="70" r="10" fill="#fff" stroke={INK} strokeWidth="3" />
          <circle cx="114" cy="70" r="10" fill="#fff" stroke={INK} strokeWidth="3" />
          <circle cx="87" cy="72" r="3.5" fill={INK} />
          <circle cx="113" cy="72" r="3.5" fill={INK} />
          <g stroke={INK} strokeWidth="3" strokeLinecap="round">
            <path d="M75 57 L92 51" />
            <path d="M125 57 L108 51" />
          </g>
        </g>
      );
    case 'happy':
      return (
        <g stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round">
          <path d="M78 72 Q86 63 94 72" />
          <path d="M106 72 Q114 63 122 72" />
        </g>
      );
    case 'squeeze':
      return (
        <g stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M78 64 L92 70 L78 76" />
          <path d="M122 64 L108 70 L122 76" />
        </g>
      );
    case 'meh':
      return (
        <g>
          <ellipse cx="86" cy="70" rx="10" ry="8" fill="#ffd84d" stroke={INK} strokeWidth="3" />
          <ellipse cx="114" cy="70" rx="10" ry="8" fill="#ffd84d" stroke={INK} strokeWidth="3" />
          <ellipse cx="86" cy="72" rx="2" ry="4.5" fill={INK} />
          <ellipse cx="114" cy="72" rx="2" ry="4.5" fill={INK} />
          <path d="M76 70 A10 8 0 0 1 96 70 Z" fill={fur} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M104 70 A10 8 0 0 1 124 70 Z" fill={fur} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        </g>
      );
    case 'x':
      return (
        <g stroke={INK} strokeWidth="4" strokeLinecap="round">
          <path d="M80 64 L92 76" />
          <path d="M92 64 L80 76" />
          <path d="M108 64 L120 76" />
          <path d="M120 64 L108 76" />
        </g>
      );
    case 'goggles':
      return (
        <g>
          <path d="M63 64 L137 64" stroke="#3b3b3b" strokeWidth="6" />
          <circle cx="86" cy="66" r="13" fill="#bfe9ff" stroke={INK} strokeWidth="4" />
          <circle cx="114" cy="66" r="13" fill="#bfe9ff" stroke={INK} strokeWidth="4" />
          <circle cx="88" cy="68" r="4" fill={INK} />
          <circle cx="112" cy="68" r="4" fill={INK} />
          <g stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round">
            <path d="M79 60 Q82 57 86 57" />
            <path d="M107 60 Q110 57 114 57" />
          </g>
        </g>
      );
    case 'shades':
      return (
        <g>
          <path d="M70 62 H96 V69 Q96 80 84 80 Q70 80 70 69 Z" fill="#141414" />
          <path d="M104 62 H130 V69 Q130 80 116 80 Q104 80 104 69 Z" fill="#141414" />
          <path d="M96 65 L104 65" stroke="#141414" strokeWidth="3" />
          <g stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".7">
            <path d="M75 66 L81 66" />
            <path d="M109 66 L115 66" />
          </g>
        </g>
      );
    case 'shiny':
      return (
        <g>
          <circle cx="86" cy="70" r="11" fill={INK} />
          <circle cx="114" cy="70" r="11" fill={INK} />
          <circle cx="89" cy="66" r="4" fill="#fff" />
          <circle cx="117" cy="66" r="4" fill="#fff" />
          <circle cx="83" cy="75" r="2" fill="#fff" />
          <circle cx="111" cy="75" r="2" fill="#fff" />
        </g>
      );
    case 'wink':
      return (
        <g>
          <circle cx="86" cy="70" r="6.5" fill={INK} />
          <circle cx="88.5" cy="67.5" r="2.2" fill="#fff" />
          <path d="M106 71 Q114 64 122 71" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'side':
      return (
        <g>
          <ellipse cx="86" cy="70" rx="10" ry="8" fill="#fff" stroke={INK} strokeWidth="3" />
          <ellipse cx="114" cy="70" rx="10" ry="8" fill="#fff" stroke={INK} strokeWidth="3" />
          <circle cx="92" cy="71" r="3.5" fill={INK} />
          <circle cx="120" cy="71" r="3.5" fill={INK} />
        </g>
      );
  }
}

function MouthSvg({ mouth }: { mouth: Mouth }) {
  const line = { stroke: INK, strokeWidth: 3, fill: 'none', strokeLinecap: 'round' as const };
  switch (mouth) {
    case 'smile':
      return <path d="M92 93 Q100 100 108 93" {...line} />;
    case 'cat':
      return <path d="M91 92 Q95.5 97 100 92 Q104.5 97 109 92" {...line} />;
    case 'o':
      return <ellipse cx="100" cy="96" rx="5" ry="6" fill={INK} />;
    case 'flat':
      return <path d="M92 95 L108 95" {...line} />;
    case 'grin':
      return (
        <g>
          <path d="M88 92 Q100 108 112 92 Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <path d="M94 99 Q100 104 106 99 Q100 106 94 99 Z" fill="#ff8fa3" />
        </g>
      );
    case 'tongue':
      return (
        <g>
          <path d="M93 94 Q100 98 107 94" {...line} />
          <ellipse cx="106" cy="98" rx="4" ry="5" fill="#ff8fa3" stroke={INK} strokeWidth="2" />
        </g>
      );
    case 'smirk':
      return <path d="M91 95 Q101 99 110 90" {...line} />;
    case 'wavy':
      return <path d="M89 96 q5.5 -5 11 0 t11 0" {...line} />;
  }
}

interface HeadProps {
  fur: string;
  eyes?: Eyes;
  mouth?: Mouth;
  blush?: boolean;
  stripes?: string;
  innerEar?: string;
  children?: ReactNode;
}

/** Tai + đầu + mắt + mũi + râu + miệng */
export function Head({ fur, eyes = 'dot', mouth = 'cat', blush, stripes, innerEar = '#f4a6b8', children }: HeadProps) {
  return (
    <g>
      <path d="M70 54 L64 20 L96 38 Z" fill={fur} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M130 54 L136 20 L104 38 Z" fill={fur} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M73 46 L69 29 L87 39 Z" fill={innerEar} />
      <path d="M127 46 L131 29 L113 39 Z" fill={innerEar} />
      <circle cx="100" cy="72" r="38" fill={fur} stroke={INK} strokeWidth={SW} />
      {stripes && (
        <g stroke={stripes} strokeWidth="4" strokeLinecap="round">
          <path d="M92 38 L94 48" />
          <path d="M100 36 L100 47" />
          <path d="M108 38 L106 48" />
          <path d="M63 72 L71 74" />
          <path d="M137 72 L129 74" />
        </g>
      )}
      {blush && (
        <g fill="#ff9fb2" opacity=".75">
          <ellipse cx="76" cy="84" rx="6" ry="3.5" />
          <ellipse cx="124" cy="84" rx="6" ry="3.5" />
        </g>
      )}
      <EyesSvg eyes={eyes} fur={fur} />
      <path d="M95.5 81 L104.5 81 L100 86.5 Z" fill="#e8798f" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <g stroke={INK} strokeWidth="2" strokeLinecap="round">
        <path d="M60 82 L78 85" />
        <path d="M60 93 L78 90" />
        <path d="M140 82 L122 85" />
        <path d="M140 93 L122 90" />
      </g>
      <MouthSvg mouth={mouth} />
      {children}
    </g>
  );
}

export function Body({ fur, cx = 100, cy = 142, rx = 50, ry = 28 }: { fur: string; cx?: number; cy?: number; rx?: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fur} stroke={INK} strokeWidth={SW} />;
}

export function Paw({ fur, cx, cy, rx = 10, ry = 8 }: { fur: string; cx: number; cy: number; rx?: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fur} stroke={INK} strokeWidth="3" />;
}

/** Tay/đuôi: nét viền đen + lõi màu lông */
export function Limb({ d, fur, w = 11 }: { d: string; fur: string; w?: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke={INK} strokeWidth={w + 6} />
      <path d={d} stroke={fur} strokeWidth={w} />
    </g>
  );
}

export function Star({ x, y, r = 8, fill = '#ffd23f', stroke = '#e8590c' }: { x: number; y: number; r?: number; fill?: string; stroke?: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`;
  }).join(' ');
  return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />;
}

export function Bomb({ cx, cy, r, fuse = true, lit = true }: { cx: number; cy: number; r: number; fuse?: boolean; lit?: boolean }) {
  const capW = r * 0.62;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#2b2b2b" stroke={INK} strokeWidth={SW} />
      <ellipse cx={cx - r * 0.38} cy={cy - r * 0.38} rx={r * 0.24} ry={r * 0.15} fill="#fff" opacity=".45" />
      <rect x={cx - capW / 2} y={cy - r - 7} width={capW} height="9" rx="2" fill="#5a5a5a" stroke={INK} strokeWidth="2.5" />
      {fuse && (
        <path
          d={`M${cx} ${cy - r - 7} C${cx + 2} ${cy - r - 18} ${cx + 18} ${cy - r - 12} ${cx + 22} ${cy - r - 24}`}
          fill="none"
          stroke="#8b5a2b"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {fuse && lit && <Star x={cx + 23} y={cy - r - 27} r={9} />}
    </g>
  );
}

/** Tia sáng trang trí phía sau */
export function Rays({ cx = 100, cy = 80, n = 14, color = '#fff', opacity = 0.18 }: { cx?: number; cy?: number; n?: number; color?: string; opacity?: number }) {
  const R = 160;
  return (
    <g fill={color} opacity={opacity}>
      {Array.from({ length: n }, (_, i) => {
        const a1 = ((Math.PI * 2) / n) * i;
        const a2 = a1 + Math.PI / n;
        return (
          <path
            key={i}
            d={`M${cx} ${cy} L${(cx + Math.cos(a1) * R).toFixed(1)} ${(cy + Math.sin(a1) * R).toFixed(1)} L${(cx + Math.cos(a2) * R).toFixed(1)} ${(cy + Math.sin(a2) * R).toFixed(1)} Z`}
          />
        );
      })}
    </g>
  );
}

export function MiniCard({ x, y, rot = 0, color = '#fff', mark }: { x: number; y: number; rot?: number; color?: string; mark?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x="-13" y="-18" width="26" height="36" rx="4" fill={color} stroke={INK} strokeWidth="2.5" />
      <rect x="-8" y="-13" width="16" height="26" rx="2" fill="none" stroke={INK} strokeWidth="1.2" opacity=".35" />
      {mark}
    </g>
  );
}
