import type { ReactElement } from 'react';
import type { CardType } from '../../../shared/src';
import { Body, Bomb, Head, INK, Limb, MiniCard, Paw, Rays, Star } from './parts';

/** Tranh minh hoạ vector cho từng loại lá (viewBox 200×170, nền trong suốt) */
const SCENES: Record<CardType, () => ReactElement> = {
  exploding: () => {
    const fur = '#f2a65a';
    return (
      <>
        <Rays cx={100} cy={120} n={16} opacity={0.16} />
        <Limb d="M146 146 C178 144 184 108 162 100" fur={fur} w={7} />
        <Body fur={fur} cy={142} rx={52} />
        <Head fur={fur} eyes="scared" mouth="o">
          <path d="M144 46 C139 55 139 61 144 61 C149 61 149 55 144 46 Z" fill="#8fd3ff" stroke={INK} strokeWidth="2" />
        </Head>
        <Bomb cx={100} cy={143} r={25} />
        <Paw fur={fur} cx={75} cy={140} />
        <Paw fur={fur} cx={125} cy={140} />
      </>
    );
  },

  defuse: () => {
    const fur = '#f6e7c8';
    return (
      <>
        <Body fur={fur} cx={114} cy={142} rx={46} ry={27} />
        <g transform="translate(14 0)">
          <Head fur={fur} eyes="goggles" mouth="tongue" />
        </g>
        <Bomb cx={52} cy={143} r={23} fuse={false} />
        <g fill="none" strokeWidth="4" strokeLinecap="round">
          <path d="M48 113 C40 94 62 86 74 100" stroke="#e63946" />
          <path d="M56 113 C60 98 80 92 82 112" stroke="#3a86ff" />
        </g>
        <g strokeLinecap="round">
          <path d="M80 104 L72 96" stroke="#9a9a9a" strokeWidth="4" />
          <path d="M84 100 L74 94" stroke="#9a9a9a" strokeWidth="4" />
          <path d="M82 104 L106 124" stroke={INK} strokeWidth="9" />
          <path d="M82 104 L106 124" stroke="#e63946" strokeWidth="5" />
          <path d="M84 100 L110 118" stroke={INK} strokeWidth="9" />
          <path d="M84 100 L110 118" stroke="#e63946" strokeWidth="5" />
        </g>
        <circle cx="83" cy="102" r="3" fill="#555" stroke={INK} strokeWidth="1.5" />
        <Paw fur={fur} cx={111} cy={124} />
      </>
    );
  },

  attack: () => {
    const fur = '#9aa0a6';
    return (
      <>
        <Rays cx={100} cy={90} n={12} opacity={0.18} />
        <Body fur={fur} cy={144} rx={46} ry={26} />
        <Head fur={fur} eyes="angry" mouth="grin" stripes="#6c737a" />
        <Limb d="M64 130 L40 104" fur={fur} />
        <Limb d="M136 130 L160 104" fur={fur} />
        <Paw fur={fur} cx={38} cy={100} rx={12} ry={11} />
        <Paw fur={fur} cx={162} cy={100} rx={12} ry={11} />
        <g stroke={INK} strokeWidth="2.5" strokeLinecap="round">
          <path d="M30 92 L26 84" />
          <path d="M37 89 L36 80" />
          <path d="M44 91 L47 83" />
          <path d="M156 91 L153 83" />
          <path d="M163 89 L164 80" />
          <path d="M170 92 L174 84" />
        </g>
      </>
    );
  },

  skip: () => {
    const fur = '#f2a65a';
    return (
      <>
        <g stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".55">
          <path d="M8 60 L48 60" />
          <path d="M2 86 L40 86" />
          <path d="M14 112 L46 112" />
        </g>
        <g fill="#fff" stroke={INK} strokeWidth="2.5" opacity=".95">
          <circle cx="44" cy="150" r="12" />
          <circle cx="28" cy="156" r="9" />
          <circle cx="16" cy="148" r="6" />
        </g>
        <g transform="rotate(-8 110 120)">
          <Limb d="M72 140 C52 138 50 120 60 112" fur={fur} w={7} />
          <Limb d="M88 150 L66 162" fur={fur} w={10} />
          <Limb d="M130 152 L150 164" fur={fur} w={10} />
          <Body fur={fur} cx={110} cy={138} rx={44} ry={24} />
          <Limb d="M136 128 L158 116" fur={fur} w={10} />
          <g transform="translate(14 -4)">
            <Head fur={fur} eyes="side" mouth="grin" stripes="#c97a35" />
          </g>
        </g>
      </>
    );
  },

  favor: () => {
    const fur = '#f6f1ea';
    return (
      <>
        <g fill="#ff6b8b" stroke={INK} strokeWidth="2">
          <path d="M34 40 c-6 -8 -18 -2 -12 8 l12 12 l12 -12 c6 -10 -6 -16 -12 -8 Z" />
          <path d="M168 30 c-4 -6 -13 -1 -9 6 l9 9 l9 -9 c4 -7 -5 -12 -9 -6 Z" />
        </g>
        <Body fur={fur} cy={144} rx={46} ry={26} />
        <Head fur={fur} eyes="shiny" mouth="cat" blush innerEar="#ffb3c4" />
        <Limb d="M80 136 L84 118" fur={fur} />
        <Limb d="M120 136 L116 118" fur={fur} />
        <MiniCard
          x={100}
          y={120}
          color="#fff"
          mark={<path d="M0 -2 c-3 -5 -10 -1 -7 4 l7 7 l7 -7 c3 -5 -4 -9 -7 -4 Z" fill="#ff6b8b" />}
        />
        <Paw fur={fur} cx={86} cy={118} rx={8} ry={7} />
        <Paw fur={fur} cx={114} cy={118} rx={8} ry={7} />
      </>
    );
  },

  shuffle: () => {
    const fur = '#c98a5a';
    return (
      <>
        <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".6">
          <path d="M30 70 A75 55 0 0 1 170 70" />
          <path d="M170 70 l-2 -12 M170 70 l-12 -2" />
        </g>
        <Body fur={fur} cy={146} rx={46} ry={24} />
        <Head fur={fur} eyes="happy" mouth="grin" stripes="#9c6238" />
        <MiniCard x={38} y={112} rot={-22} color="#ffd23f" mark={<circle r="5" fill="#e8590c" />} />
        <MiniCard x={162} y={112} rot={18} color="#8fd3ff" mark={<rect x="-5" y="-5" width="10" height="10" fill="#1c7ed6" transform="rotate(45)" />} />
        <MiniCard x={100} y={22} rot={6} color="#b2f2bb" mark={<path d="M-5 4 L0 -6 L5 4 Z" fill="#2f8f3e" />} />
        <Limb d="M64 138 L46 120" fur={fur} />
        <Limb d="M136 138 L154 120" fur={fur} />
      </>
    );
  },

  see_future: () => {
    const fur = '#3a3633';
    return (
      <>
        <Star x={30} y={40} r={7} fill="#fff" stroke="#c5a3ff" />
        <Star x={172} y={56} r={6} fill="#fff" stroke="#c5a3ff" />
        <Star x={160} y={20} r={4} fill="#fff" stroke="#c5a3ff" />
        <Body fur={fur} cy={144} rx={48} ry={26} />
        <Head fur={fur} eyes="meh" mouth="smirk" innerEar="#b07a8e" />
        {/* mũ phù thuỷ */}
        <path d="M66 44 Q100 30 134 44 L112 -2 Q104 -10 98 0 Z" fill="#5f3dc4" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M60 46 Q100 30 140 46" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        <path d="M60 46 Q100 30 140 46" fill="none" stroke="#7950f2" strokeWidth="3" strokeLinecap="round" />
        <Star x={104} y={20} r={6} />
        {/* quả cầu */}
        <ellipse cx="100" cy="160" rx="28" ry="7" fill="#7b5230" stroke={INK} strokeWidth="3" />
        <circle cx="100" cy="134" r="24" fill="#a5d8ff" stroke={INK} strokeWidth="3.5" />
        <circle cx="100" cy="134" r="16" fill="#e5dbff" opacity=".8" />
        <ellipse cx="91" cy="125" rx="6" ry="4" fill="#fff" opacity=".8" />
        <Star x={106} y={138} r={5} fill="#fff" stroke="#7950f2" />
        <Paw fur={fur} cx={74} cy={140} />
        <Paw fur={fur} cx={126} cy={140} />
      </>
    );
  },

  nope: () => {
    const fur = '#efe9df';
    return (
      <>
        <Body fur={fur} cx={104} cy={142} rx={48} ry={27} />
        <g transform="translate(4 0)">
          <Head fur={fur} eyes="meh" mouth="flat" />
        </g>
        <Limb d="M80 130 L56 100" fur={fur} />
        <ellipse cx="52" cy="92" rx="17" ry="16" fill={fur} stroke={INK} strokeWidth="3.5" />
        <ellipse cx="52" cy="97" rx="7" ry="5.5" fill="#f4a6b8" />
        <g fill="#f4a6b8">
          <circle cx="41" cy="87" r="3.5" />
          <circle cx="48" cy="81" r="3.5" />
          <circle cx="57" cy="81" r="3.5" />
          <circle cx="63" cy="87" r="3.5" />
        </g>
        <rect x="140" y="8" width="54" height="26" rx="12" fill="#fff" stroke={INK} strokeWidth="3" />
        <path d="M150 33 L146 44 L160 33" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M151 32 L159 32" stroke="#fff" strokeWidth="4" />
        <text x="167" y="26.5" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="15" fill={INK}>
          NOPE.
        </text>
      </>
    );
  },

  cat_potato: () => {
    const fur = '#c8955f';
    return (
      <>
        <path
          d="M52 130 C46 96 70 60 100 62 C134 60 156 98 150 132 C146 158 122 166 100 165 C76 166 56 156 52 130 Z"
          fill={fur}
          stroke={INK}
          strokeWidth="3.5"
        />
        <g fill="#a87545">
          <circle cx="72" cy="140" r="3" />
          <circle cx="130" cy="146" r="2.5" />
          <circle cx="122" cy="126" r="2" />
          <circle cx="80" cy="120" r="2" />
        </g>
        <Head fur={fur} eyes="dot" mouth="smile" />
        <g stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M84 36 C82 24 88 18 86 8" />
          <path d="M96 34 C96 22 102 16 100 4" />
          <path d="M108 34 C110 24 116 20 116 10" />
          <path d="M56 110 C46 108 42 100 34 102" />
          <path d="M54 130 C44 132 40 140 32 140" />
          <path d="M146 110 C156 108 160 100 168 102" />
          <path d="M148 130 C158 132 162 140 170 140" />
        </g>
      </>
    );
  },

  cat_melon: () => {
    const fur = '#f2a65a';
    return (
      <>
        <Head fur={fur} eyes="happy" mouth="grin" blush stripes="#c97a35" />
        {/* nửa quả dưa làm "bát" */}
        <path d="M34 108 L166 108 C166 150 136 168 100 168 C64 168 34 150 34 108 Z" fill="#2f9e44" stroke={INK} strokeWidth="3.5" />
        <path d="M42 108 L158 108 C158 144 132 160 100 160 C68 160 42 144 42 108 Z" fill="#f1f3c8" />
        <path d="M48 108 L152 108 C152 140 128 154 100 154 C72 154 48 140 48 108 Z" fill="#ff6b6b" />
        <g fill={INK}>
          <ellipse cx="72" cy="124" rx="2.5" ry="4" />
          <ellipse cx="94" cy="134" rx="2.5" ry="4" />
          <ellipse cx="118" cy="128" rx="2.5" ry="4" />
          <ellipse cx="134" cy="118" rx="2.5" ry="4" />
          <ellipse cx="84" cy="146" rx="2.5" ry="4" />
          <ellipse cx="112" cy="146" rx="2.5" ry="4" />
        </g>
        <g stroke="#1b5e20" strokeWidth="3" fill="none" opacity=".6">
          <path d="M40 124 C46 140 54 150 66 158" />
          <path d="M160 124 C154 140 146 150 134 158" />
        </g>
        <Paw fur={fur} cx={70} cy={108} rx={9} ry={7} />
        <Paw fur={fur} cx={130} cy={108} rx={9} ry={7} />
      </>
    );
  },

  cat_bladder: () => {
    const fur = '#a5b4fc';
    return (
      <>
        {/* biển WC */}
        <rect x="140" y="12" width="44" height="30" rx="6" fill="#fff" stroke={INK} strokeWidth="3" />
        <text x="162" y="34" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="17" fill="#1971c2">
          WC
        </text>
        <path d="M162 42 L162 60" stroke={INK} strokeWidth="3" />
        <Limb d="M84 150 L112 166" fur={fur} w={10} />
        <Limb d="M116 150 L88 166" fur={fur} w={10} />
        <Body fur={fur} cy={140} rx={42} ry={26} />
        <Head fur={fur} eyes="squeeze" mouth="wavy">
          <path d="M146 44 C141 53 141 59 146 59 C151 59 151 53 146 44 Z" fill="#8fd3ff" stroke={INK} strokeWidth="2" />
          <path d="M56 50 C52 57 52 62 56 62 C60 62 60 57 56 50 Z" fill="#8fd3ff" stroke={INK} strokeWidth="2" />
        </Head>
        <Paw fur={fur} cx={92} cy={132} />
        <Paw fur={fur} cx={108} cy={134} />
        <g fill={INK} fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="22">
          <text x="22" y="40">!!</text>
        </g>
      </>
    );
  },

  cat_schrodinger: () => {
    const fur = '#3a3633';
    return (
      <>
        <g fill="#fff" fontFamily="'Baloo 2', sans-serif" fontWeight="800" opacity=".85">
          <text x="30" y="44" fontSize="28">?</text>
          <text x="156" y="34" fontSize="22">?</text>
          <text x="166" y="70" fontSize="16">?</text>
        </g>
        <g transform="translate(0 22)">
          <Head fur={fur} eyes="side" mouth="flat" innerEar="#b07a8e" />
        </g>
        {/* thùng các-tông */}
        <path d="M40 110 L160 110 L160 166 L40 166 Z" fill="#c08a52" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M40 110 L22 92 L76 92 L92 110" fill="#d9a066" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M160 110 L178 92 L124 92 L108 110" fill="#d9a066" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M70 130 L130 130" stroke="#8a5a2b" strokeWidth="5" strokeLinecap="round" opacity=".5" />
        <text x="100" y="156" textAnchor="middle" fontFamily="'Baloo 2', sans-serif" fontWeight="800" fontSize="13" fill="#6b4220">
          CẨN THẬN: MÈO?
        </text>
        <Paw fur={fur} cx={78} cy={110} rx={9} ry={6} />
        <Paw fur={fur} cx={122} cy={110} rx={9} ry={6} />
      </>
    );
  },

  cat_beard: () => {
    const fur = '#e0c3a0';
    return (
      <>
        <Body fur={fur} cy={146} rx={46} ry={24} />
        <Head fur={fur} eyes="meh" mouth="flat" />
        {/* râu dê to */}
        <path
          d="M70 90 C64 110 72 130 86 140 C90 152 100 162 100 162 C100 162 110 152 114 140 C128 130 136 110 130 90 C120 102 80 102 70 90 Z"
          fill="#f8f9fa"
          stroke={INK}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <g stroke="#ced4da" strokeWidth="2" fill="none" strokeLinecap="round">
          <path d="M86 108 C88 120 92 130 96 140" />
          <path d="M114 108 C112 120 108 130 104 140" />
          <path d="M100 104 L100 150" />
        </g>
        <path d="M84 96 Q92 90 100 96 Q108 90 116 96" fill="#f8f9fa" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        {/* mũ chóp */}
        <rect x="74" y="26" width="52" height="8" rx="3" fill="#212529" stroke={INK} strokeWidth="2.5" />
        <rect x="82" y="-2" width="36" height="30" rx="3" fill="#212529" stroke={INK} strokeWidth="2.5" />
        <rect x="82" y="18" width="36" height="6" fill="#862e9c" />
      </>
    );
  },
};

export default function CardArt({ type }: { type: CardType }) {
  const Scene = SCENES[type];
  return (
    <svg viewBox="0 0 200 170" className="card-art" aria-hidden="true" overflow="hidden">
      <Scene />
    </svg>
  );
}
