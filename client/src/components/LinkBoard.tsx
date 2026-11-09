/**
 * Màn chơi Nối Thú Đại Chiến (2–10 người realtime; 2 người là solo 1v1).
 * - Bấm 2 ô cùng con thú, nối được bằng đường gấp khúc ≤ 2 lần (được vòng ra ngoài mép).
 * - Màn 1: đua dọn bàn, combo nạp ⚡ Sấm để tung Đóng Băng / Mây Mù – mặc định vào người dẫn đầu,
 *   bấm vào bàn nhỏ của một đối thủ để nhắm người đó.
 * - Sau đó cả phòng đánh liên hoàn 3 Boss: Vua Sấm Sét → Nữ Hoàng Nhện → Bạo Chúa; kết liễu mỗi Boss +500.
 * - Đảo Bàn: chiêu tự đảo bàn mình, hồi chiêu 1 phút (phím R).
 * Bàn của mình vẽ trên canvas; điện thoại dọc thì bàn xoay thành 9 cột × 16 hàng (chỉ đổi cách vẽ).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Lightbulb, LogOut, MessageSquare, RotateCcw, Shuffle, Trophy, Zap } from 'lucide-react';
import {
  LINK_BOSSES,
  LINK_BOSS_SKILL_NAME,
  LINK_CELLS,
  LINK_FOG_MS,
  LINK_H,
  LINK_KO_BONUS,
  LINK_RAID_S,
  LINK_SHUFFLE_CD_S,
  LINK_W,
  type LinkFoe,
  type LinkLock,
  type LinkState,
  type LinkStatePlayer,
  type RoomView,
} from '../../../shared/src';
import { linkStore } from '../link/store';
import { tileCanvas } from '../link/tiles';
import { drawBoss, drawFx, drawLock, type FxLayout, type Rect } from '../link/fx';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import { roomPeople } from './Spectators';
import { fmtCoins } from './Dock';
import Modal from './Modal';
import '../link/link.css';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat: RoomChat;
  dock: ReactNode;
}

/** Bố cục cốt lõi để inline: phủ kín màn hình kể cả khi CSS tải chậm */
const FULL_SCREEN = { position: 'fixed', inset: 0, zIndex: 20, overflow: 'hidden', background: '#0b1630' } as const;

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Geo {
  tile: number;
  portrait: boolean;
  /** vị trí canvas bàn trong khung game (px CSS) */
  left: number;
  top: number;
}

export default function LinkBoard({ view, meId, emit, chat, dock }: Props) {
  const link = view.link!;
  const isHost = view.hostId === meId;
  const [, setTick] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<'chat' | 'log'>('chat');
  const [leaveAsk, setLeaveAsk] = useState(false);
  /** lúc thấy kết quả lần đầu: chờ hiệu ứng K.O. chạy xong rồi mới hiện bảng kết quả */
  const resultSeenAt = useRef<number | null>(null);
  const { typingNames, unread } = useChatState(chat, roomPeople(view), meId, chatOpen && chatTab === 'chat');

  const rootRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const bossRef = useRef<HTMLCanvasElement>(null);
  const foeRefs = useRef(new Map<string, HTMLCanvasElement>());
  const [targetId, setTargetId] = useState<string | undefined>();
  /** mục tiêu chiêu cho phím tắt (đọc trong listener) */
  const targetRef = useRef<string | undefined>(undefined);
  const selected = useRef<number | null>(null);
  const geo = useRef<Geo>({ tile: 40, portrait: false, left: 0, top: 0 });

  useEffect(() => {
    linkStore.reset(`${view.code}:${link.startedAt ?? 0}`);
  }, [view.code, link.startedAt]);

  // HUD vẽ lại khi có gói mới (tối đa ~8 lần/giây) + mỗi 250ms cho đồng hồ
  useEffect(() => {
    let last = 0;
    let pending: number | undefined;
    const bump = () => {
      const t = performance.now();
      if (t - last > 120) {
        last = t;
        setTick((x) => x + 1);
      } else if (pending === undefined) {
        pending = window.setTimeout(() => {
          pending = undefined;
          last = performance.now();
          setTick((x) => x + 1);
        }, 120);
      }
    };
    const unsub = linkStore.subscribe(bump);
    const iv = window.setInterval(bump, 250);
    return () => {
      unsub();
      clearInterval(iv);
      if (pending !== undefined) clearTimeout(pending);
    };
  }, []);

  const st: LinkState | undefined = linkStore.state;
  const spectating = !st?.me;
  const mainP: LinkStatePlayer | undefined = st?.players?.[0];
  const mainId = st?.me ? meId : mainP?.id;
  const send = (cmd: object) => emit('link:cmd', cmd);

  // ---------- vẽ (canvas) ----------
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const root = rootRef.current, main = mainRef.current, board = boardRef.current, fxc = fxRef.current;
      if (!root || !main || !board || !fxc) return;
      const now = performance.now();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const s = linkStore.state;
      const cells: number[] | undefined = s?.me?.cells ?? s?.players?.[0]?.cells;
      const iceList: [number, number, LinkLock][] = s?.me?.ice ?? (s?.players?.[0]?.ice ?? []).map((i) => [i, 1, 0] as [number, number, LinkLock]);
      const dark = (s?.me?.dark ?? 0) - (now - linkStore.at) > 0;
      const venom = (s?.me?.venom ?? 0) - (now - linkStore.at) > 0;

      // --- bàn chính ---
      // clientWidth tính cả padding (chỗ chừa cho cột đối thủ) nên phải trừ ra, không thì bàn chui dưới cột đối thủ
      const ms = getComputedStyle(main);
      const mw = main.clientWidth - parseFloat(ms.paddingLeft) - parseFloat(ms.paddingRight);
      const mh = main.clientHeight - parseFloat(ms.paddingTop) - parseFloat(ms.paddingBottom);
      const portrait = mh > mw * 1.05;
      const cols = portrait ? LINK_H : LINK_W, rows = portrait ? LINK_W : LINK_H;
      const tile = Math.max(16, Math.floor(Math.min(mw / (cols + 0.44), mh / (rows + 0.44))));
      const pad = tile * 0.22;
      const bw = Math.round(cols * tile + pad * 2), bh = Math.round(rows * tile + pad * 2);
      if (board.width !== Math.round(bw * dpr) || board.height !== Math.round(bh * dpr)) {
        board.width = Math.round(bw * dpr);
        board.height = Math.round(bh * dpr);
        board.style.width = `${bw}px`;
        board.style.height = `${bh}px`;
      }
      const rootRect = root.getBoundingClientRect();
      const bRect = board.getBoundingClientRect();
      geo.current = { tile, portrait, left: bRect.left - rootRect.left, top: bRect.top - rootRect.top };
      const ctx = board.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, bw, bh);
      // khay bàn tối màu sang trọng làm nổi bật các ô Pikachu nền kem sáng
      ctx.fillStyle = 'rgba(8, 20, 48, 0.65)';
      ctx.strokeStyle = 'rgba(116, 192, 252, 0.32)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(1, 1, bw - 2, bh - 2, tile * 0.24);
      ctx.fill();
      ctx.stroke();
      const disp = (i: number) => {
        const x = i % LINK_W, y = Math.floor(i / LINK_W);
        return portrait ? { dx: y, dy: x } : { dx: x, dy: y };
      };
      if (cells) {
        const hint = s?.me?.hint;
        const pulse = 0.5 + Math.sin(now / 160) * 0.5;
        for (let i = 0; i < LINK_CELLS; i++) {
          const k = cells[i];
          if (k < 0 || linkStore.pending.has(i)) continue;
          const { dx, dy } = disp(i);
          let px = pad + dx * tile, py = pad + dy * tile;
          const missUntil = linkStore.miss.get(i);
          if (missUntil && missUntil > now) px += Math.sin(now / 22) * tile * 0.08;
          const sel = selected.current === i;
          if (sel) py -= tile * 0.08;
          ctx.drawImage(tileCanvas(k, tile, dpr, dark), px, py, tile, tile);
          if (sel) {
            ctx.save();
            ctx.strokeStyle = '#ffd43b';
            ctx.shadowColor = '#ffd43b';
            ctx.shadowBlur = 12;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.roundRect(px + tile * 0.02, py + tile * 0.02, tile * 0.96, tile * 0.93, tile * 0.13);
            ctx.stroke();
            ctx.restore();
          }
          if (hint && (hint[0] === i || hint[1] === i)) {
            ctx.save();
            ctx.strokeStyle = `rgba(105, 219, 124, ${0.45 + pulse * 0.55})`;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.roundRect(px + tile * 0.02, py + tile * 0.02, tile * 0.96, tile * 0.93, tile * 0.13);
            ctx.stroke();
            ctx.restore();
          }
          if (missUntil && missUntil > now) {
            ctx.fillStyle = 'rgba(255, 107, 107, 0.35)';
            ctx.beginPath();
            ctx.roundRect(px + tile * 0.02, py + tile * 0.02, tile * 0.96, tile * 0.94, tile * 0.13);
            ctx.fill();
          }
        }
        // ô bị khoá: băng / tơ nhện / lửa / điện / ấn hư không
        for (const [i, msLeft, kind] of iceList) {
          if (cells[i] < 0) continue;
          const { dx, dy } = disp(i);
          const px = pad + dx * tile, py = pad + dy * tile;
          ctx.save();
          drawLock(ctx, px, py, tile, kind ?? 0, now + i * 97);
          if (s?.me) {
            const left = Math.max(0, msLeft - (now - linkStore.at));
            ctx.fillStyle = kind === 4 ? '#f3d9fa' : kind === 3 ? '#fff3bf' : kind === 2 ? '#fff4e6' : kind === 1 ? '#1e293b' : '#0b2545';
            ctx.shadowColor = kind === 1 || kind === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 3;
            ctx.font = `800 ${Math.round(tile * 0.28)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.ceil(left / 1000)}`, px + tile * 0.5, py + tile * 0.86);
          }
          ctx.restore();
        }
        if (dark) {
          ctx.fillStyle = 'rgba(5, 8, 18, 0.32)';
          ctx.fillRect(0, 0, bw, bh);
        }
        if (venom) {
          // Nọc Độc: viền xanh độc nhịp đập
          ctx.save();
          ctx.strokeStyle = `rgba(148, 216, 45, ${0.35 + Math.sin(now / 140) * 0.25})`;
          ctx.lineWidth = tile * 0.12;
          ctx.strokeRect(tile * 0.06, tile * 0.06, bw - tile * 0.12, bh - tile * 0.12);
          ctx.restore();
        }
      }

      // --- bàn mini của các đối thủ ---
      const foeList: LinkFoe[] = s?.foes ?? s?.players?.slice(1) ?? [];
      for (const foe of foeList) {
        const foeC = foeRefs.current.get(foe.id);
        if (!foeC) continue;
        const fw = foeC.clientWidth, fh = foeC.clientHeight;
        if (foeC.width !== Math.round(fw * dpr) || foeC.height !== Math.round(fh * dpr)) {
          foeC.width = Math.round(fw * dpr);
          foeC.height = Math.round(fh * dpr);
        }
        const f = foeC.getContext('2d')!;
        f.setTransform(dpr, 0, 0, dpr, 0, 0);
        f.clearRect(0, 0, fw, fh);
        const ct = Math.min(fw / LINK_W, fh / LINK_H);
        const ox = (fw - ct * LINK_W) / 2, oy = (fh - ct * LINK_H) / 2;
        const ice = new Set(foe.ice);
        for (let i = 0; i < LINK_CELLS; i++) {
          if (!foe.filled[i]) continue;
          const x = i % LINK_W, y = Math.floor(i / LINK_W);
          f.fillStyle = foe.out ? '#495057' : ice.has(i) ? '#a5d8ff' : '#74c0fc';
          f.fillRect(ox + x * ct + 0.5, oy + y * ct + 0.5, ct - 1, ct - 1);
        }
      }

      // --- Boss ---
      const bossC = bossRef.current;
      if (bossC && s?.boss) {
        const cw = bossC.clientWidth, ch = bossC.clientHeight;
        if (bossC.width !== Math.round(cw * dpr) || bossC.height !== Math.round(ch * dpr)) {
          bossC.width = Math.round(cw * dpr);
          bossC.height = Math.round(ch * dpr);
        }
        const b = bossC.getContext('2d')!;
        b.setTransform(dpr, 0, 0, dpr, 0, 0);
        b.clearRect(0, 0, cw, ch);
        drawBoss(b, s.boss.id ?? 'thunder', cw / 2, ch * 0.55, ch * 1.05, now, s.boss.phase, now - linkStore.bossHitAt, s.boss.hp <= 0, s.boss.shield > 0);
      }

      // --- lớp hiệu ứng phủ toàn màn ---
      const W = root.clientWidth, H = root.clientHeight;
      if (fxc.width !== Math.round(W * dpr) || fxc.height !== Math.round(H * dpr)) {
        fxc.width = Math.round(W * dpr);
        fxc.height = Math.round(H * dpr);
      }
      const fctx = fxc.getContext('2d')!;
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.clearRect(0, 0, W, H);
      const rel = (el: Element | null): Rect | undefined => {
        if (!el) return undefined;
        const r = el.getBoundingClientRect();
        return { x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height };
      };
      const G = geo.current;
      const point = (x: number, y: number) => {
        const dx = portrait ? y : x, dy = portrait ? x : y;
        return { x: G.left + pad + (dx + 0.5) * tile, y: G.top + pad + (dy + 0.5) * tile };
      };
      const L: FxLayout = {
        cell: (i) => point(i % LINK_W, Math.floor(i / LINK_W)),
        point,
        tile,
        board: { x: G.left, y: G.top, w: bw, h: bh },
        foeRect: (id) => rel(foeRefs.current.get(id) ?? null),
        boss: s?.boss ? rel(bossRef.current) : undefined,
        mainId: s?.me ? meId : s?.players?.[0]?.id,
        w: W,
        h: H,
      };
      // bỏ hiệu ứng quá cũ (tab bị ẩn lâu rồi mở lại)
      linkStore.fx = linkStore.fx.filter((x) => now - x.t0 < 3000);
      const out = drawFx(fctx, linkStore.fx, now, L);
      linkStore.fx = out.keep;
      if (shakeRef.current) {
        const k = out.shake;
        shakeRef.current.style.transform = k > 0.3 ? `translate(${(Math.random() - 0.5) * k * 2}px, ${(Math.random() - 0.5) * k * 2}px)` : '';
      }
      if (flashRef.current) flashRef.current.style.opacity = String(out.flash);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [meId]);

  // ---------- bấm ô ----------
  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = linkStore.state;
    if (!s?.me || (s.stage !== 'stage1' && s.stage !== 'stage2')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const { tile, portrait } = geo.current;
    const dx = Math.floor((e.clientX - r.left - tile * 0.22) / tile);
    const dy = Math.floor((e.clientY - r.top - tile * 0.22) / tile);
    const x = portrait ? dy : dx, y = portrait ? dx : dy;
    if (x < 0 || y < 0 || x >= LINK_W || y >= LINK_H) {
      selected.current = null;
      return;
    }
    const i = y * LINK_W + x;
    const cells = s.me.cells;
    if (cells[i] < 0 || linkStore.pending.has(i)) return;
    const sel = selected.current;
    if (sel === null) {
      selected.current = i;
    } else if (sel === i) {
      selected.current = null;
    } else if (cells[sel] !== cells[i]) {
      // khác loại: chọn ô mới luôn cho nhanh
      selected.current = i;
    } else {
      selected.current = null;
      linkStore.pending.add(sel);
      linkStore.pending.add(i);
      send({ t: 'match', a: sel, b: i });
      // nếu server từ chối (đường bị chặn) gói kế tiếp sẽ hiện lại 2 ô và rung đỏ
      window.setTimeout(() => {
        if (linkStore.pending.has(i)) {
          linkStore.pending.delete(i);
          linkStore.pending.delete(sel);
        }
      }, 1500);
    }
  };

  // phím tắt: H gợi ý, 1 / 2 chiêu, Space siêu đấm
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const s = linkStore.state;
      if (!s?.me || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'h') send({ t: 'hint' });
      else if (k === 'escape') selected.current = null;
      else if (k === 'r' && s.me.shuffleIn - (performance.now() - linkStore.at) <= 0) send({ t: 'shuffle' });
      else if (s.me.thunder >= 100 && s.stage === 'stage1' && (k === '1' || k === '2')) send({ t: 'skill', kind: k === '1' ? 'freeze' : 'fog', target: targetRef.current });
      else if (s.me.thunder >= 100 && s.stage === 'stage2' && k === ' ') {
        e.preventDefault();
        send({ t: 'super' });
      }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- HUD ----------
  const me = st?.me;
  const foes: LinkFoe[] = st?.foes ?? st?.players?.slice(1) ?? [];
  const meP = me
    ? { id: meId, name: view.players.find((p) => p.id === meId)?.name ?? 'Bạn', score1: me.score1, damage: me.damage, combo: me.combo, thunder: me.thunder, kos: me.kos ?? 0 }
    : mainP;
  const stage = st?.stage ?? link.stage ?? 'stage1';
  const left = linkStore.left();
  const boss = st?.boss;
  const ended = view.phase === 'ended' || stage === 'ended';
  const result = st?.result ?? link.result;
  const total = (p?: { score1: number; damage: number; kos?: number }) => (p ? p.score1 + p.damage + (p.kos ?? 0) * LINK_KO_BONUS : 0);
  const bossDef = boss ? (LINK_BOSSES.find((b) => b.id === boss.id) ?? LINK_BOSSES[0]) : undefined;
  const bossNo = boss?.no ?? 0;
  /** đang nghỉ giữa 2 Boss (Boss trước vừa gục) */
  const betweenBosses = stage === 'intermission' && !!boss && boss.hp <= 0;
  const nextBoss = betweenBosses ? LINK_BOSSES[bossNo + 1] : LINK_BOSSES[0];
  const shuffleIn = me ? Math.max(0, (me.shuffleIn ?? LINK_SHUFFLE_CD_S * 1000) - (performance.now() - linkStore.at)) : 0;
  const venomLeft = me ? Math.max(0, (me.venom ?? 0) - (performance.now() - linkStore.at)) : 0;
  const stunLeft = me ? Math.max(0, (me.stun ?? 0) - (performance.now() - linkStore.at)) : 0;
  const everyone = [...(meP ? [{ ...meP, id: mainId ?? '', bot: false, out: false }] : []), ...foes];
  const totalOf = (p: { id: string; score1: number; damage: number; kos?: number }) => (result ? (result.totals[p.id] ?? 0) : total(p));
  /** Màn 1 xếp theo điểm, từ Màn 2 theo tổng */
  const standing = (p: { id: string; score1: number; damage: number }) => (boss ? totalOf(p) : p.score1);
  const ranking = [...everyone].sort((a, b) => Number(a.out) - Number(b.out) || standing(b) - standing(a));
  const myRank = ranking.findIndex((p) => p.id === mainId) + 1;
  const activeFoes = foes.filter((f) => !f.out);
  const leader = [...activeFoes].sort((a, b) => standing(b) - standing(a))[0];
  const target = activeFoes.find((f) => f.id === targetId) ?? leader;
  const many = foes.length >= 3;
  /** 6–9 đối thủ: lưới 3 cột cho vừa màn hình */
  const crowd = foes.length >= 6;
  const ready = (me?.thunder ?? 0) >= 100;
  const hintIn = me ? Math.max(0, me.hintIn - (performance.now() - linkStore.at)) : 0;
  const othersDmg = foes.reduce((n, f) => n + f.damage, 0);
  const dmgShare = meP && meP.damage + othersDmg > 0 ? meP.damage / (meP.damage + othersDmg) : foes.length ? 1 / (foes.length + 1) : 0.5;
  const nameOf = (id?: string) => everyone.find((p) => p.id === id)?.name ?? '';
  targetRef.current = targetId && target?.id === targetId ? targetId : undefined;
  const skill = (kind: 'freeze' | 'fog') => send({ t: 'skill', kind, target: targetRef.current });
  const won = result?.winnerId === meId;
  if (result && resultSeenAt.current === null) resultSeenAt.current = performance.now();
  if (!result) resultSeenAt.current = null;
  const showEnd = !!result && performance.now() - (resultSeenAt.current ?? 0) > (result.ko ? 2400 : 600);

  return (
    <div ref={rootRef} className={`link-game${chatOpen ? ' chat-on' : ''}${boss ? ' has-boss' : ''}${many ? ' many-foes' : ''}${crowd ? ' crowd-foes' : ''}`} style={FULL_SCREEN}>
      <div ref={shakeRef} className="link-shake">
        {/* thanh trên */}
        <div className="link-top">
          <div className="link-side me">
            <span className="link-name">{spectating ? `👀 ${meP?.name ?? ''}` : meP?.name}</span>
            <span className="link-pill score" title="Điểm Màn 1"><b>{meP?.score1 ?? 0}</b> điểm</span>
            {boss && <span className="link-pill dmg" title="Sát thương lên Boss">⚔️ <b>{meP?.damage ?? 0}</b></span>}
            {everyone.length > 2 && myRank > 0 && <span className="link-pill rank" title="Hạng hiện tại">#{myRank}/{everyone.length}</span>}
            {(meP?.combo ?? 0) > 1 && <span className="link-combo">COMBO x{meP?.combo}</span>}
          </div>
          <div className="link-center">
            <span className="link-stage">
              {ended ? 'KẾT THÚC' : stage === 'stage2' && bossDef ? `BOSS ${bossNo + 1}/${LINK_BOSSES.length} · ${bossDef.name.toUpperCase()}` : stage === 'intermission' ? 'NGHỈ GIỮA MÀN' : 'MÀN 1 · ĐUA NỐI'}
            </span>
            <span className={`link-clock${left < 15000 && !ended ? ' hurry' : ''}`}>⏱ {fmtTime(left)}</span>
            {view.pot > 0 && <span className="link-pot" title={`Mỗi người cược ${view.bet} xu`}>🪙 {fmtCoins(view.pot)}</span>}
          </div>
          <div className="link-top-right">
            <button className={`link-icon${chatOpen ? ' on' : ''}`} onClick={() => setChatOpen((v) => !v)} title="Trò chuyện">
              <MessageSquare size={17} />
              {unread > 0 && !chatOpen && <span className="link-badge">{unread}</span>}
            </button>
            <div className="link-dock">{dock}</div>
            <button className="link-icon" onClick={() => (ended || spectating ? emit('room:leave') : setLeaveAsk(true))} title="Rời trận">
              <LogOut size={17} />
            </button>
          </div>
        </div>

        {/* Boss */}
        {boss && (
          <div className={`link-boss boss-${boss.id ?? 'thunder'}`}>
            <canvas ref={bossRef} className="link-boss-canvas" />
            <div className="link-boss-info">
              <div className="link-boss-name">
                <span className="link-boss-track" title={`Boss ${bossNo + 1}/${LINK_BOSSES.length}`}>
                  {LINK_BOSSES.map((b, i) => (
                    <i key={b.id} className={i < bossNo || (i === bossNo && boss.hp <= 0) ? 'down' : i === bossNo ? 'now' : ''}>{b.emoji}</i>
                  ))}
                </span>
                {bossDef?.coop && bossDef.partners ? (
                  <>
                    <span className="link-coop-badge">⚔️ CO-OP 2 BOSS</span>
                    <span className="link-coop-duo">
                      <span className="p-void">{bossDef.partners[0].emoji} {bossDef.partners[0].name}</span>
                      <span className="vs-x">×</span>
                      <span className="p-fire">{bossDef.partners[1].emoji} {bossDef.partners[1].name}</span>
                    </span>
                  </>
                ) : (
                  bossDef?.name.toUpperCase()
                )}
                <span className={`phase p${boss.phase}`}>Giai đoạn {boss.phase}</span>
                {stage === 'stage2' && <span className="muted small"> · đòn kế: {LINK_BOSS_SKILL_NAME[boss.nextSkill] ?? boss.nextSkill} sau {Math.ceil(Math.max(0, boss.nextSkillIn - (performance.now() - linkStore.at)) / 1000)}s</span>}
              </div>
              <div className="link-hp">
                <i className="trail" style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} />
                <i className={`fill p${boss.phase}`} style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} />
                <span>{boss.hp} / {boss.maxHp}</span>
              </div>
              {boss.shield > 0 && (
                <div className="link-shield" title="Khiên: hút sát thương trước khi trừ máu">
                  <i style={{ width: `${(boss.shield / Math.max(1, boss.maxShield)) * 100}%` }} />
                  <span>🛡️ {boss.id === 'twins' ? 'Khiên Hỗn Mang' : 'Khiên Đá'} {boss.shield}</span>
                </div>
              )}
              <div className="link-share" title="Tỉ lệ sát thương">
                <i style={{ width: `${dmgShare * 100}%` }} />
                <span className="l">{meP?.name}: {meP?.damage ?? 0}</span>
                <span className="r">{foes.length === 1 ? foes[0].name : `${foes.length} người khác`}: {othersDmg}</span>
              </div>
            </div>
          </div>
        )}

        {/* bàn chính */}
        <div ref={mainRef} className="link-main">
          <canvas ref={boardRef} className="link-board" onPointerDown={onPointer} />
        </div>

        {/* các đối thủ: bấm vào bàn nhỏ để chọn người bị tung chiêu */}
        {foes.length > 0 && (
          <div className={`link-foes${many ? ' many' : ''}${crowd ? ' crowd' : ''}`}>
            {foes.map((foe) => {
              const isTarget = !!me && !foe.out && target?.id === foe.id && stage === 'stage1';
              const rank = ranking.findIndex((p) => p.id === foe.id) + 1;
              return (
                <button
                  key={foe.id}
                  type="button"
                  className={`link-foe${isTarget ? ' target' : ''}${foe.out ? ' out' : ''}`}
                  disabled={!me || foe.out}
                  onClick={() => setTargetId((t) => (t === foe.id ? undefined : foe.id))}
                  title={foe.out ? 'Đã bỏ cuộc' : 'Bấm để nhắm chiêu vào người này (bấm lại để về người dẫn đầu)'}
                >
                  <div className="link-foe-head">
                    {everyone.length > 2 && <span className="link-rank">#{rank}</span>}
                    <span className="link-name">{foe.bot && !foe.name.startsWith('🤖') ? '🤖 ' : ''}{foe.name}</span>
                    {isTarget && <span title="Mục tiêu chiêu">🎯</span>}
                    <b>{boss ? totalOf(foe) : foe.score1}</b>
                    {foe.combo > 1 && <span className="link-combo small">x{foe.combo}</span>}
                  </div>
                  <canvas
                    ref={(el) => {
                      if (el) foeRefs.current.set(foe.id, el);
                      else foeRefs.current.delete(foe.id);
                    }}
                    className="link-foe-board"
                  />
                  {foe.out ? <span className="link-out">Đã bỏ cuộc</span> : <div className="link-mini-thunder"><i style={{ width: `${foe.thunder}%` }} /></div>}
                </button>
              );
            })}
          </div>
        )}

        {/* thanh dưới */}
        {me && (
          <div className="link-bottom">
            <div className={`link-thunder${ready ? ' full' : ''}`} title="Thanh Sấm: nối liên tiếp để nạp nhanh">
              <Zap size={16} />
              <div className="bar"><i style={{ width: `${me.thunder}%` }} /></div>
              <b>{Math.floor(me.thunder)}%</b>
            </div>
            <button className="link-btn hint" disabled={hintIn > 0 || stage === 'intermission' || ended} onClick={() => send({ t: 'hint' })} title="Gợi ý 1 cặp (-5 điểm) · phím H">
              <Lightbulb size={16} /> {hintIn > 0 ? `${Math.ceil(hintIn / 1000)}s` : 'Gợi ý'}
            </button>
            {stage === 'stage1' && (
              <>
                {foes.length > 1 && target && (
                  <span className="link-target" title="Bấm vào bàn nhỏ của đối thủ để đổi mục tiêu">
                    🎯 {targetId && target.id === targetId ? target.name : `Dẫn đầu: ${target.name}`}
                  </span>
                )}
                <button className="link-btn skill freeze" disabled={!ready} onClick={() => skill('freeze')} title="Đóng băng 6 ô của đối thủ trong 8 giây · phím 1">
                  ❄️ Đóng Băng
                </button>
                <button className="link-btn skill fog" disabled={!ready} onClick={() => skill('fog')} title={`Thả mây mù che bàn đối thủ ${LINK_FOG_MS / 1000} giây · phím 2`}>
                  🌫️ Mây Mù
                </button>
              </>
            )}
            {stunLeft > 0 && <span className="link-venom stun" title="Gầm Thét: chưa nối được">😵 Choáng {Math.ceil(stunLeft / 1000)}s</span>}
            {venomLeft > 0 && <span className="link-venom" title="Nọc Độc: sát thương giảm một nửa">☠️ Độc {Math.ceil(venomLeft / 1000)}s</span>}
            <button
              className={`link-btn shuffle${shuffleIn <= 0 ? ' ready' : ''}`}
              disabled={shuffleIn > 0 || stage === 'intermission' || ended}
              onClick={() => send({ t: 'shuffle' })}
              title={`Đảo Bàn: tự đảo bàn mình cho dễ nối, hồi chiêu ${LINK_SHUFFLE_CD_S} giây · phím R`}
            >
              <Shuffle size={16} /> {shuffleIn > 0 ? fmtTime(shuffleIn) : 'Đảo Bàn'}
            </button>
            {stage === 'stage2' && (
              <button className={`link-btn super${ready ? ' ready' : ''}`} disabled={!ready} onClick={() => send({ t: 'super' })} title="400 sát thương · phím Space">
                ⚡ SIÊU ĐẤM
              </button>
            )}
          </div>
        )}
      </div>

      <canvas ref={fxRef} className="link-fx" />
      <div ref={flashRef} className="link-flash" />

      {stage === 'intermission' && !ended && (
        <div className="link-overlay">
          <div className="link-card">
            <h2>{betweenBosses ? `💥 ĐÃ HẠ ${bossDef?.name.toUpperCase()}!` : '🏁 MÀN 1 KẾT THÚC'}</h2>
            {betweenBosses ? (
              <ol className="link-rank-list">
                {ranking.map((p) => (
                  <li key={p.id} className={p.id === mainId ? 'me' : ''}>
                    <span>{p.name}{p.out ? ' 🏳️' : ''}{'kos' in p && p.kos ? ` · ${'💀'.repeat(p.kos)}` : ''}</span>
                    <b>{totalOf(p)}</b>
                  </li>
                ))}
              </ol>
            ) : everyone.length === 2 ? (
              <div className="link-vs">
                <div><span>{everyone[0].name}</span><b>{everyone[0].score1}</b></div>
                <em>VS</em>
                <div><span>{everyone[1].name}</span><b>{everyone[1].score1}</b></div>
              </div>
            ) : (
              <ol className="link-rank-list">
                {ranking.map((p) => (
                  <li key={p.id} className={p.id === mainId ? 'me' : ''}>
                    <span>{p.name}{p.out ? ' 🏳️' : ''}</span>
                    <b>{p.score1}</b>
                  </li>
                ))}
              </ol>
            )}
            <p className="link-boss-coming">
              {nextBoss?.emoji} {nextBoss?.name.toUpperCase()} XUẤT HIỆN SAU <b>{Math.ceil(left / 1000)}</b>
            </p>
            <p className="muted small">
              {betweenBosses
                ? nextBoss?.raidS
                  ? `Boss ${bossNo + 2}/${LINK_BOSSES.length} (Co-op 2 Boss Siêu Khó) được cấp mới ${nextBoss.raidS / 60} phút (${fmtTime(boss?.raidLeft ?? nextBoss.raidS * 1000)})! Giữ nguyên Sấm, bàn mới cho mọi người.`
                  : `Boss ${bossNo + 2}/${LINK_BOSSES.length} · còn ${fmtTime(boss?.raidLeft ?? 0)} cho các Boss còn lại. Giữ nguyên Sấm, bàn mới cho mọi người.`
                : `3 Boss đầu dùng chung ${LINK_RAID_S / 60} phút, riêng Màn 4 (2 Boss Co-op) có thêm 6 phút. Người dẫn trước được 50% Sấm!`}
            </p>
          </div>
        </div>
      )}

      {ended && result && showEnd && (
        <div className="link-overlay end">
          <div className="link-card">
            <h2>
              <Trophy size={22} className="inline-icon" />{' '}
              {spectating ? (result.winnerId ? `${nameOf(result.winnerId)} thắng!` : 'Hòa!') : won ? 'BẠN THẮNG!' : result.winnerId ? `${nameOf(result.winnerId)} thắng!` : 'HÒA!'}
            </h2>
            <p className="muted">{result.reason}</p>
            <p className="link-bosses-down">
              {LINK_BOSSES.map((b, i) => (
                <span key={b.id} className={i < (result.bossesDown ?? 0) ? 'down' : ''} title={b.name}>{b.emoji}</span>
              ))}
              <b>Đã hạ {result.bossesDown ?? 0}/{LINK_BOSSES.length} Boss</b>
            </p>
            <table className="link-score-table">
              <thead><tr><th /><th>Màn 1</th><th>Boss</th><th>K.O.</th><th>Tổng</th></tr></thead>
              <tbody>
                {[...everyone].sort((a, b) => totalOf(b) - totalOf(a)).map((p) => (
                  <tr key={p.id} className={`${p.id === result.winnerId ? 'win' : ''}${p.id === mainId ? ' me' : ''}`}>
                    <td>{p.name}{p.out ? ' 🏳️' : ''}</td>
                    <td>{p.score1}</td>
                    <td>{p.damage}</td>
                    <td>{'kos' in p && p.kos ? `${p.kos}× (+${p.kos * LINK_KO_BONUS})` : '–'}</td>
                    <td><b>{totalOf(p)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {view.pot > 0 && (
              <p className="small">
                {won ? <span className="good-text">+{fmtCoins(view.pot - view.bet)} xu</span> : view.payouts?.[meId] !== undefined ? <span className="muted">Hoàn {fmtCoins(view.payouts[meId])} xu</span> : null}
              </p>
            )}
            <div className="link-end-actions">
              <button className="ghost" onClick={() => emit('room:leave')}><LogOut size={15} /> Rời phòng</button>
              {isHost ? (
                <button className="primary big" onClick={() => emit('game:restart')}><RotateCcw size={17} /> Về phòng chờ</button>
              ) : (
                <span className="muted small">Chờ chủ phòng mở ván mới…</span>
              )}
            </div>
          </div>
        </div>
      )}

      {chatOpen && (
        <div className="link-chat">
          <ChatPanel
            messages={chat.messages}
            meId={meId}
            typingNames={typingNames}
            onSend={chat.send}
            onTyping={chat.onTyping}
            tab={chatTab}
            onTab={setChatTab}
            unread={unread}
            onClose={() => setChatOpen(false)}
            log={view.log}
            logTotal={view.logTotal}
          />
        </div>
      )}

      {leaveAsk && (
        <Modal title={<span className="modal-title-icon"><LogOut size={19} /> Rời trận Nối Thú?</span>} width={420}>
          <p>
            Rời bây giờ là <b>bỏ cuộc</b>: đối thủ thắng ngay
            {view.pot > 0 && <> và bạn mất số xu đã cược</>}.
          </p>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setLeaveAsk(false)}>Ở lại</button>
            <button className="primary big danger" onClick={() => { setLeaveAsk(false); emit('room:leave'); }}>Bỏ cuộc & rời</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
