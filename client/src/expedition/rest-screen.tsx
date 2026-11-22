/**
 * Màn "Nghỉ ngơi" khi bấm E tại lửa trại: tối dần sang sắc ấm, lửa trại bập bùng với tàn lửa bay lên (canvas),
 * rồi lần lượt hiện các dòng kết quả nghỉ (hồi năng lượng, nạp vật phẩm trận, số nhóm quái hồi sinh).
 * Tự đóng sau ~2,6 giây hoặc khi bấm phím / chuột. Trong lúc hiện, mọi phím bị chặn (không di chuyển, không mở menu).
 */

import { useEffect, useRef, useState } from 'react';
import { BATTLE_SUPPLIES, type BattleSupply } from './shared';
import { getCachedImage } from './store';
import './reward-fx.css';

export interface RestInfo {
  anchorName: string;
  respawned: number;
  supplies: Partial<Record<BattleSupply, number>>;
}

const AUTO_CLOSE_MS = 2600;
const FADE_OUT_MS = 380;
const MIN_SHOW_MS = 420;

function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

type Ember = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; hue: number };

export function RestScreen({ info, onDone }: { info: RestInfo; onDone: () => void }) {
  const [closing, setClosing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shownAt = useRef(performance.now());
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const closingRef = useRef(false);

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => doneRef.current(), FADE_OUT_MS);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // tự đóng + chặn phím (capture) để không lọt xuống điều khiển bản đồ
  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current(), AUTO_CLOSE_MS);
    const swallow = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat && performance.now() - shownAt.current > MIN_SHOW_MS) closeRef.current();
    };
    window.addEventListener('keydown', swallow, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', swallow, true);
    };
  }, []);

  // lửa trại + tàn lửa
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = reducedMotion();
    const fire = getCachedImage('structures/rest-bonfire/rest-bonfire.png');
    const embers: Ember[] = [];
    let raf = 0;
    let last = performance.now();
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    fit();
    const spawn = (w: number, h: number) => {
      const cx = w / 2, base = h * 0.62;
      embers.push({
        x: cx + (Math.random() - 0.5) * w * 0.06,
        y: base - Math.random() * h * 0.04,
        vx: (Math.random() - 0.5) * w * 0.02,
        vy: -(h * (0.12 + Math.random() * 0.2)),
        life: 0,
        max: 1.4 + Math.random() * 1.6,
        size: Math.max(1.5, h * (0.003 + Math.random() * 0.004)),
        hue: 20 + Math.random() * 30,
      });
    };
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, base = h * 0.62;
      const flicker = still ? 1 : 0.88 + Math.sin(now / 90) * 0.05 + Math.sin(now / 37) * 0.04;
      const glowR = h * 0.5 * flicker;
      const g = ctx.createRadialGradient(cx, base, h * 0.02, cx, base, glowR);
      g.addColorStop(0, 'rgba(255, 176, 92, 0.42)');
      g.addColorStop(0.35, 'rgba(214, 96, 40, 0.18)');
      g.addColorStop(1, 'rgba(60, 20, 10, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // ánh sáng hắt lên mặt đất
      ctx.fillStyle = `rgba(255, 150, 70, ${0.14 * flicker})`;
      ctx.beginPath();
      ctx.ellipse(cx, base + h * 0.06, h * 0.26, h * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      if (fire?.complete && fire.naturalWidth) {
        const size = Math.round(h * 0.3);
        const f = still ? 0 : Math.floor(now / 120) % 8;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(fire, f * 128, 0, 128, 128, Math.round(cx - size / 2), Math.round(base - size * 0.78), size, size);
      }
      if (!still) {
        if (embers.length < 90 && Math.random() < 0.75) spawn(w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = embers.length - 1; i >= 0; i--) {
          const e = embers[i];
          e.life += dt;
          if (e.life >= e.max) { embers.splice(i, 1); continue; }
          e.x += (e.vx + Math.sin((now / 400) + i) * w * 0.012) * dt;
          e.y += e.vy * dt;
          const a = Math.sin((e.life / e.max) * Math.PI);
          ctx.fillStyle = `hsla(${e.hue}, 100%, ${60 + a * 15}%, ${a * 0.9})`;
          const s = Math.round(e.size);
          ctx.fillRect(Math.round(e.x), Math.round(e.y), s, s);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', fit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);

  const supplyText = (Object.keys(BATTLE_SUPPLIES) as BattleSupply[])
    .map((id) => `${BATTLE_SUPPLIES[id].nameVi} ×${info.supplies[id] ?? 0}`)
    .join(' · ');

  return (
    <div
      className={`rx-rest ${closing ? 'out' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Nghỉ ngơi"
      onClick={() => { if (performance.now() - shownAt.current > MIN_SHOW_MS) close(); }}
    >
      <canvas ref={canvasRef} className="rx-rest-canvas" aria-hidden="true" />
      <div className="rx-rest-text" aria-live="polite">
        <small>{info.anchorName}</small>
        <h2>Đang nghỉ ngơi bên lửa trại…</h2>
        <ul>
          <li style={{ animationDelay: '650ms' }}><i aria-hidden="true">✦</i>Năng lượng đã hồi phục</li>
          <li style={{ animationDelay: '950ms' }}><i aria-hidden="true">✦</i>Vật phẩm trận đã được nạp lại<em>{supplyText}</em></li>
          <li style={{ animationDelay: '1250ms' }}>
            <i aria-hidden="true">✦</i>
            {info.respawned > 0 ? `${info.respawned} nhóm quái đã hồi sinh` : 'Chưa có nhóm quái nào cần hồi sinh'}
            <em>Đại Trùm đã hạ không hồi sinh</em>
          </li>
        </ul>
        <p className="rx-rest-skip">Bấm phím bất kỳ để tiếp tục</p>
      </div>
    </div>
  );
}
