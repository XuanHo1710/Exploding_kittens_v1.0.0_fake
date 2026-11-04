/**
 * Máy làm đối thủ Nối Thú: chỉ dùng thông tin trên bàn của chính nó, gửi lệnh như người thật.
 * Độ khó = khoảng nghỉ giữa 2 lần nối + tỉ lệ "nghĩ lâu" + cách dùng chiêu.
 */
import type { LinkBotLevel } from '../../../../shared/src';
import type { LinkDuel, LinkPlayer } from './duel';

const LEVEL: Record<LinkBotLevel, { min: number; max: number; slow: number }> = {
  easy: { min: 2800, max: 4000, slow: 0.2 },
  normal: { min: 1600, max: 2600, slow: 0.1 },
  hard: { min: 900, max: 1500, slow: 0.05 },
};

export function runLinkBot(duel: LinkDuel, p: LinkPlayer) {
  if (duel.stage !== 'stage1' && duel.stage !== 'stage2') return;
  if (duel.t < p.nextBotAt) return;
  const lv = LEVEL[duel.cfg.botLevel] ?? LEVEL.normal;
  let wait = lv.min + Math.random() * (lv.max - lv.min);
  if (Math.random() < lv.slow) wait *= 2;
  p.nextBotAt = duel.t + wait;
  // bị Bóng Tối che bàn: chờ
  if (p.darkUntil > duel.t) return;

  if (p.thunder >= 100) {
    if (duel.stage === 'stage2') {
      duel.command(p.id, { t: 'super' });
      return;
    }
    // đánh người đang dẫn đầu (máy Khó: ai đang combo cao nhất thì Bão Xáo người đó)
    const others = duel.active().filter((x) => x !== p);
    const comboKing = [...others].sort((a, b) => b.chain - a.chain)[0];
    const hard = duel.cfg.botLevel === 'hard' && comboKing && comboKing.chain >= 2;
    const kind = duel.cfg.botLevel === 'easy' ? (Math.random() < 0.5 ? 'freeze' : 'storm') : hard ? 'storm' : 'freeze';
    duel.command(p.id, { t: 'skill', kind, target: hard ? comboKing.id : undefined });
    return;
  }
  const h = p.board.hint(duel.t);
  if (h) duel.command(p.id, { t: 'match', a: h[0], b: h[1] });
}
