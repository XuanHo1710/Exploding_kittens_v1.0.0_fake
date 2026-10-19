/** Hiệu ứng lá bài bay giữa các vị trí trên bàn (chồng bài, ghế, tay mình) */

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function flyCard(from: Element | null, to: Element | null, opts: { delay?: number; label?: string } = {}) {
  if (!from || !to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = center(from);
  const b = center(to);
  const el = document.createElement('div');
  el.className = 'fly-card';
  if (opts.label) el.dataset.label = opts.label;
  document.body.appendChild(el);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const anim = el.animate(
    [
      { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) scale(0.9) rotate(0deg)`, opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { transform: `translate(${a.x + dx * 0.5}px, ${a.y + dy * 0.5 - 60}px) translate(-50%, -50%) scale(1.15) rotate(${dx > 0 ? 10 : -10}deg)`, offset: 0.5 },
      { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) scale(0.7) rotate(0deg)`, opacity: 0.9 },
    ],
    { duration: 720, delay: opts.delay ?? 0, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'both' },
  );
  anim.onfinish = () => el.remove();
  anim.oncancel = () => el.remove();
}

/** Hiệu ứng đặc biệt khi lấy/cướp lá bài từ người này sang người kia: lá bài lớn + nhãn tên rõ ràng */
export function flyTransferCard(
  from: Element | null,
  to: Element | null,
  opts: { fromName: string; toName: string; via?: string } = { fromName: '', toName: '' },
) {
  if (!from || !to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = center(from);
  const b = center(to);
  const el = document.createElement('div');
  el.className = 'fly-card fly-transfer-card';
  const badge = document.createElement('span');
  badge.className = 'fly-transfer-badge';
  badge.textContent = `🎴 ${opts.fromName} ➔ ${opts.toName}`;
  el.appendChild(badge);
  document.body.appendChild(el);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tilt = dx >= 0 ? 14 : -14;
  const anim = el.animate(
    [
      { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) scale(0.75) rotate(0deg)`, opacity: 0 },
      { transform: `translate(${a.x}px, ${a.y - 28}px) translate(-50%, -50%) scale(1.22) rotate(${-tilt * 0.6}deg)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${a.x + dx * 0.5}px, ${a.y + dy * 0.5 - 88}px) translate(-50%, -50%) scale(1.36) rotate(${tilt}deg)`, opacity: 1, offset: 0.58 },
      { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) scale(0.92) rotate(0deg)`, opacity: 0.95, offset: 0.92 },
      { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) scale(0.6) rotate(0deg)`, opacity: 0 },
    ],
    { duration: 1350, easing: 'cubic-bezier(0.22, 0.8, 0.26, 1)', fill: 'both' },
  );
  anim.onfinish = () => el.remove();
  anim.oncancel = () => el.remove();
}

/** Tìm phần tử đại diện cho 1 người chơi (ghế đối thủ hoặc khu của mình) */
export function seatEl(playerId: string) {
  return document.querySelector(`[data-pid="${CSS.escape(playerId)}"]`);
}

/** Bay đúng lá bài (bản sao của phần tử) từ tay ra giữa bàn – kiểu UNO */
export function flyClone(el: Element | null, to: Element | null, delay = 0) {
  if (!el || !to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  const b = center(to);
  const clone = el.cloneNode(true) as HTMLElement;
  clone.classList.remove('selected', 'playable', 'dim');
  Object.assign(clone.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, margin: '0', zIndex: '80', pointerEvents: 'none', transform: 'none' });
  document.body.appendChild(clone);
  const dx = b.x - (r.left + r.width / 2);
  const dy = b.y - (r.top + r.height / 2);
  const anim = clone.animate(
    [
      { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) rotate(${dx > 0 ? 8 : -8}deg) scale(1.08)`, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(0.85)`, opacity: 0.2 },
    ],
    { duration: 520, delay, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'both' },
  );
  anim.onfinish = () => clone.remove();
  anim.oncancel = () => clone.remove();
}

/** Ném 1 emoji từ ghế này sang ghế kia (xoay vòng, bay vòng cung) rồi gọi onLand */
export function flyEmoji(from: Element | null, to: Element | null, emoji: string, onLand?: () => void) {
  if (!from || !to) {
    onLand?.();
    return;
  }
  const a = center(from);
  const b = center(to);
  const el = document.createElement('div');
  el.className = 'fly-emoji';
  el.textContent = emoji;
  document.body.appendChild(el);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const anim = el.animate(
    [
      { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) scale(0.6) rotate(0deg)` },
      { transform: `translate(${a.x + dx * 0.5}px, ${a.y + dy * 0.5 - 120}px) translate(-50%, -50%) scale(1.4) rotate(360deg)`, offset: 0.5 },
      { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) scale(1.1) rotate(720deg)` },
    ],
    { duration: 650, easing: 'cubic-bezier(0.4, 0.2, 0.4, 1)', fill: 'both' },
  );
  anim.onfinish = () => {
    el.remove();
    onLand?.();
  };
}
