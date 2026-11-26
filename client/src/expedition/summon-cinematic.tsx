/**
 * Cinematic Triệu hồi: bầu trời đêm đầy sao → một sao chổi lao xuống, màu đuôi báo độ hiếm cao nhất
 * (xanh = R / Thường-Hiếm, tím = SR / Sử Thi, vàng = SSR / Huyền Thoại+) → loé sáng → lật từng thẻ kết quả.
 * Bấm chuột / Space / Enter để sang thẻ kế; "Bỏ qua" nhảy thẳng tới bảng tổng kết (onDone).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ITEM_RARITY_COLORS, ITEM_RARITY_LABELS_VI, type ItemInstance, type SummonResultItem } from './shared';
import { portraitUrl } from './menu-ui';
import { isMythicWeapon, weaponArtUrl } from './weapon-art';
import { playExpeditionSfx } from './sound';
import './reward-fx.css';

type Tier = 'blue' | 'purple' | 'gold' | 'red' | 'sss';
const TIER_COLOR: Record<Tier, string> = { blue: '#6fb6ff', purple: '#c07cff', gold: '#ffcf5a', red: '#ff3b3b', sss: '#ff9a2e' };
const ITEM_TIER: Record<ItemInstance['rarity'], Tier> = { common: 'blue', rare: 'blue', epic: 'purple', legendary: 'gold', mythic: 'red' };
const HERO_TIER: Record<SummonResultItem['rarity'], Tier> = { R: 'blue', SR: 'purple', SSR: 'gold', SSS: 'sss' };
const TIER_RANK: Record<Tier, number> = { blue: 0, purple: 1, gold: 2, red: 3, sss: 4 };

interface Card { key: string; tier: Tier; color: string; title: string; sub: string; badge?: string; img?: string; foil?: 'sss' | 'mythic' }

function cardsOf(res: { heroes?: SummonResultItem[]; items?: ItemInstance[] }): Card[] {
  const heroes = (res.heroes ?? []).map((h, i): Card => ({
    key: `h${i}`, tier: HERO_TIER[h.rarity], color: TIER_COLOR[HERO_TIER[h.rarity]], title: h.nameVi,
    foil: h.rarity === 'SSS' ? 'sss' : undefined,
    sub: h.rarity, badge: h.isNew ? 'MỚI!' : h.expGained ? `Mảnh dư → +${h.expGained} EXP` : `+${h.shardGained} mảnh · +${h.starlightGained}✦`, img: portraitUrl(h.heroId),
  }));
  const items = (res.items ?? []).map((it, i): Card => ({
    key: `i${i}`, tier: ITEM_TIER[it.rarity], color: ITEM_RARITY_COLORS[it.rarity], title: it.nameVi,
    foil: isMythicWeapon(it) ? 'mythic' : undefined,
    sub: ITEM_RARITY_LABELS_VI[it.rarity], img: weaponArtUrl(it),
    badge: it.duplicateYield ? (it.duplicateYield.shards ? `+${it.duplicateYield.shards} mảnh` : `+${it.duplicateYield.starlight}✦`)
      : it.signatureId ? 'Vũ khí trấn' : it.kind === 'elixir' ? 'Thuốc chỉ số' : `i${it.ilvl}`,
  }));
  // lật từ thấp lên cao: thẻ hiếm nhất để cuối
  return [...heroes, ...items].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
}

const reduced = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function SummonCinematic({ res, onDone, onClose }: {
  res: { heroes?: SummonResultItem[]; items?: ItemInstance[] }; onDone: () => void; onClose?: () => void;
}) {
  const [cards] = useState(() => cardsOf(res));
  const best: Tier = cards.reduce<Tier>((t, c) => (TIER_RANK[c.tier] > TIER_RANK[t] ? c.tier : t), 'blue');
  const still = useRef(reduced()).current;
  const [stage, setStage] = useState<'sky' | 'flash' | 'cards' | 'all'>(still ? 'cards' : 'sky');
  const [index, setIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // đóng hẳn (sau màn tổng kết 10 thẻ); không truyền onClose thì về bảng kết quả cũ
  const doneRef = useRef(onClose ?? onDone);
  doneRef.current = onClose ?? onDone;
  /** Bỏ qua: lật cả loạt thẻ cùng lúc kèm hiệu ứng (thay vì mở từng thẻ). */
  const showAll = useCallback(() => {
    setStage('all');
    playExpeditionSfx(cards.some((c) => TIER_RANK[c.tier] >= 2) ? 'ssr_fanfare' : 'confirm');
  }, [cards]);

  // sao chổi bay ~1,7 s → loé sáng 0,45 s → lật thẻ
  useEffect(() => {
    if (stage === 'sky') {
      const t = window.setTimeout(() => setStage('flash'), 1700);
      return () => window.clearTimeout(t);
    }
    if (stage === 'flash') {
      const t = window.setTimeout(() => setStage('cards'), 450);
      return () => window.clearTimeout(t);
    }
  }, [stage]);

  useEffect(() => {
    if (stage !== 'cards') return;

    const c = cards[index];
    if (c && TIER_RANK[c.tier] >= 2) playExpeditionSfx('ssr_fanfare');
    else if (c) playExpeditionSfx('confirm');
  }, [stage, index, cards]);

  const advance = useCallback(() => {
    if (stage === 'all') { doneRef.current(); return; }
    if (stage !== 'cards') { setStage('cards'); return; }
    if (index + 1 >= cards.length) { if (cards.length > 1) showAll(); else doneRef.current(); }
    else setIndex((i) => i + 1);
  }, [stage, index, cards.length, showAll]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); doneRef.current(); return; }
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); advance(); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [advance]);

  // bầu trời sao lấp lánh (canvas)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const stars = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, p: Math.random() * 6.28 }));
    let raf = 0;
    const fit = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    fit();
    const draw = (now: number) => {
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const a = still ? 0.7 : 0.35 + 0.65 * Math.abs(Math.sin(now / 900 + s.p));
        ctx.fillStyle = `rgba(230, 236, 255, ${a})`;
        ctx.fillRect(Math.round(s.x * w), Math.round(s.y * h), Math.ceil(s.r), Math.ceil(s.r));
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', fit);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }, [still]);

  const card = cards[index];
  return (
    <div className={`sc-root tier-${best} stage-${stage}`} style={{ ['--tier' as string]: TIER_COLOR[best] }}
      role="dialog" aria-modal="true" aria-label="Triệu hồi" onClick={advance}>
      <canvas ref={canvasRef} className="sc-sky" aria-hidden="true" />
      {stage === 'sky' && (
        <div className="sc-comet" aria-hidden="true"><i /><b /></div>
      )}
      {stage === 'flash' && <div className="sc-flash" aria-hidden="true" />}
      {stage === 'all' && (
        <div className={`sc-all n${Math.min(cards.length, 10)}`} aria-live="polite">
          {cards.map((c, i) => (
            <div key={c.key} className={`sc-mini tier-${c.tier}`} style={{ ['--c' as string]: c.color, ['--d' as string]: `${i * 90}ms` }}>
              {TIER_RANK[c.tier] >= 2 && !still && <i className="sc-mini-burst" aria-hidden="true" />}
              <div className={`sc-face${c.foil ? ` exp-foil-surface exp-foil-${c.foil}` : ''}`}>
                {c.img ? <img src={c.img} alt="" /> : <div className="sc-item-glyph" aria-hidden="true">✦</div>}
                <small>{c.sub}</small>
                <h3>{c.title}</h3>
                {c.badge && <em>{c.badge}</em>}
              </div>
            </div>
          ))}
          <p className="sc-count">Bấm để hoàn tất</p>
        </div>
      )}
      {stage === 'cards' && card && (
        <div className={`sc-card tier-${card.tier}`} key={card.key} style={{ ['--c' as string]: card.color }} aria-live="polite">
          <div className="sc-orb" aria-hidden="true" />
          {TIER_RANK[card.tier] >= 2 && !still && (
            <div className="sc-motes" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
          )}
          <div className={`sc-face${card.foil ? ` exp-foil-surface exp-foil-${card.foil}` : ''}`}>
            {card.img ? <img src={card.img} alt="" /> : <div className="sc-item-glyph" aria-hidden="true">✦</div>}
            <small>{card.sub}</small>
            <h3>{card.title}</h3>
            {card.badge && <em>{card.badge}</em>}
          </div>
          <p className="sc-count">{index + 1} / {cards.length} · bấm để tiếp tục</p>
        </div>
      )}
      <button type="button" className="sc-skip" onClick={(e) => { e.stopPropagation(); if (stage === 'all') doneRef.current(); else showAll(); }}>
        {stage === 'all' ? 'Xong ✓' : 'Bỏ qua ▸▸'}
      </button>
    </div>
  );
}
