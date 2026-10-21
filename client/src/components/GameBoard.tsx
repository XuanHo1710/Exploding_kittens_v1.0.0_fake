import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Bomb,
  BookOpen,
  Cat,
  Check,
  CircleDot,
  Coins,
  Crosshair,
  Crown,
  Droplets,
  Eye,
  GripVertical,
  HandHeart,
  Hourglass,
  Layers,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  MousePointerClick,
  OctagonX,
  Play,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Shuffle,
  Skull,
  Sparkles,
  TrendingDown,
  Trophy,
  UserX,
  Wand2,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import {
  CARD_INFO,
  EMOTES,
  SINGLE_ACTION_CARDS,
  NOPE_CARD_TYPES,
  WILDCARD_CAT_TYPES,
  canMatchComboCards,
  cloneCopyKind,
  canComboWith,
  comboGroupFor,
  detectPlayKind,
  QUICK_EMOTES,
  THROWABLES,
  type ActionKind,
  type Card,
  type CardType,
  type Emote,
  type GameFx,
  type PrivateNotice,
  type PublicPlayer,
  type RoomView,
  type ShuffleStyle,
  SHUFFLE_STYLES,
} from '../../../shared/src';
import { CardBack } from '../art/CatAvatar';
import PlayerAvatar from '../art/PlayerAvatar';
import CardView from './CardView';
import { ShuffleIcon } from './icons';
import Modal from './Modal';
import { sfx } from '../sfx';
import { flyCard, flyClone, flyEmoji, flyTransferCard, seatEl } from '../fx';
import PlayWizard, { type WizardResult } from './PlayWizard';
import ChatPanel, { useChatState, type ChatTab, type RoomChat } from './ChatPanel';
import { SpectatorArea, SpectatorChip, isSpectating, roomPeople } from './Spectators';
import { DeadHandFan, DeadHandModal } from './DeadHand';
import { Brand, fmtCoins } from './Dock';
import Rules from './Rules';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  notice: PrivateNotice | null;
  onCloseNotice: () => void;
  /** Lá vừa lấy được / bị mất */
  reveal?: (PrivateNotice & { key: number }) | null;
  onCloseReveal?: () => void;
  /** Sự kiện hiệu ứng từ server */
  fx?: { id: number; fx: GameFx } | null;
  /** Biểu cảm / ném đồ */
  emote?: { id: number; e: Emote } | null;
  /** Chat real-time của phòng */
  chat?: RoomChat;
  /** Thanh điều khiển (thay header) – đặt ở góc phải trên bàn */
  dock?: ReactNode;
}

const NO_CHAT: RoomChat = { messages: [], typing: {}, send: () => {}, onTyping: () => {} };
const CHAT_OPEN_KEY = 'meono.chatOpen';
function loadChatOpen() {
  try {
    const v = localStorage.getItem(CHAT_OPEN_KEY);
    return v === null ? window.innerWidth >= 1280 : v === '1';
  } catch {
    return window.innerWidth >= 1280;
  }
}

const SINGLE: readonly CardType[] = SINGLE_ACTION_CARDS;

/** Thứ tự xếp bài "theo loại": lá cứu mạng → lá chặn → lá chức năng → mèo (cùng loại đứng cạnh nhau) */
const SORT_ORDER: CardType[] = [
  'defuse',
  'nope',
  'super_nope',
  'super_skip',
  'skip',
  'reverse',
  'draw_bottom',
  'dig_deeper',
  'bury',
  'targeted_attack',
  'attack',
  'personal_attack',
  'catomic_bomb',
  'swap_top_bottom',
  'garbage_collection',
  'favor',
  'mark',
  'grave_robber',
  'shuffle',
  'alter_future',
  'see_future',
  'share_future',
  'feral_cat',
  'clone',
  'cat_potato',
  'cat_melon',
  'cat_bladder',
  'cat_schrodinger',
  'cat_beard',
  'exploding',
];
const sortIds = (cards: Card[]) =>
  cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => SORT_ORDER.indexOf(a.c.type) - SORT_ORDER.indexOf(b.c.type) || a.i - b.i)
    .map((x) => x.c.id);

/** Xáo bài kiểu thật: chia đôi → 2 nửa tách ra → rơi xen kẽ vào giữa → vuốt gọn (2 lượt) */
function riffle(container: HTMLElement | null) {
  if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = [...container.children] as HTMLElement[];
  const n = cards.length;
  const half = n / 2;
  const R = 760; // 1 lượt xáo
  const rounds = 2;
  const D = R * rounds;
  cards.forEach((el, i) => {
    const left = i < half;
    const side = left ? -1 : 1;
    const k = left ? i : i - half;
    const order = left ? 2 * k : 2 * k + 1; // thứ tự rơi xen kẽ trái/phải
    const frames: Keyframe[] = [];
    for (let r = 0; r < rounds; r++) {
      const t0 = r * R;
      const stack = `translate(0px, ${-order * 1.2}px) rotate(0deg)`;
      const out = `translate(${side * 62}%, ${-6 - k * 2}px) rotate(${side * 12}deg)`;
      const drop = t0 + (0.42 + order * 0.035) * R;
      frames.push({ offset: t0 / D, transform: r === 0 ? `translate(0px, ${-i * 1.2}px)` : stack });
      frames.push({ offset: (t0 + 0.24 * R) / D, transform: out });
      frames.push({ offset: drop / D, transform: out });
      frames.push({ offset: Math.min((drop + 0.1 * R) / D, (t0 + R) / D), transform: stack });
    }
    frames.push({ offset: 1, transform: `translate(0px, ${-i * 1.2}px)` });
    frames.sort((a, b) => (a.offset as number) - (b.offset as number));
    el.animate(frames, { duration: D, easing: 'ease-in-out', fill: 'both' });
  });
}

/** Xáo tay (overhand): bốc từng tập nhỏ từ dưới đưa lên trên, 4 lượt */
function overhand(container: HTMLElement | null) {
  if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = [...container.children] as HTMLElement[];
  const n = cards.length;
  const R = 380;
  const rounds = 4;
  const D = R * rounds;
  // mỗi lượt chọn 1 tập liền nhau ngẫu nhiên
  const chunks = Array.from({ length: rounds }, () => {
    const size = 3 + Math.floor(Math.random() * 3);
    const start = Math.floor(Math.random() * (n - size));
    return [start, start + size] as const;
  });
  cards.forEach((el, i) => {
    const frames: Keyframe[] = [{ offset: 0, transform: `translate(0, ${-i * 1.2}px)` }];
    chunks.forEach(([a, b], r) => {
      const t0 = (r * R) / D;
      const t1 = ((r + 1) * R) / D;
      if (i >= a && i < b) {
        frames.push({ offset: t0 + 0.02, transform: `translate(0, ${-i * 1.2}px) rotate(0deg)` });
        frames.push({ offset: t0 + (0.4 * R) / D, transform: `translate(${(r % 2 ? -1 : 1) * 46}%, -60%) rotate(${r % 2 ? -10 : 10}deg)` });
        frames.push({ offset: t1 - 0.01, transform: `translate(0, ${-(n + i) * 1.2}px) rotate(0deg)` });
      }
    });
    frames.push({ offset: 1, transform: `translate(0, ${-i * 1.2}px)` });
    el.animate(frames, { duration: D, easing: 'ease-in-out', fill: 'both' });
  });
}

/** Chia đống (pile): chia từng lá ra 4 đống rồi gom lại */
function pileShuffle(container: HTMLElement | null) {
  if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = [...container.children] as HTMLElement[];
  const piles = [-120, -40, 40, 120];
  const D = 1600;
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  cards.forEach((el, i) => {
    const pile = i % 4;
    const deal = (0.05 + i * 0.045) * D;
    const gather = (0.7 + order.indexOf(pile) * 0.06) * D;
    const at = `translate(${piles[pile]}%, ${-Math.floor(i / 4) * 3}px) rotate(${(pile - 1.5) * 4}deg)`;
    el.animate(
      [
        { offset: 0, transform: `translate(0, ${-i * 1.2}px)` },
        { offset: deal / D, transform: `translate(0, ${-i * 1.2}px)` },
        { offset: Math.min(deal / D + 0.08, gather / D - 0.01), transform: at },
        { offset: gather / D, transform: at },
        { offset: Math.min(gather / D + 0.12, 1), transform: `translate(0, ${-i * 1.2}px)` },
        { offset: 1, transform: `translate(0, ${-i * 1.2}px)` },
      ],
      { duration: D, easing: 'ease-in-out', fill: 'both' },
    );
  });
}

const SHUFFLE_ANIM: Record<ShuffleStyle, (c: HTMLElement | null) => void> = { riffle, overhand, pile: pileShuffle };

const KIND_LABEL: Record<ActionKind, string> = {
  attack: 'Tấn Công',
  targeted_attack: 'Tấn Công Chỉ Định',
  personal_attack: 'Tự Tấn Công (3x)',
  skip: 'Bỏ Lượt',
  super_skip: 'Siêu Bỏ Lượt',
  reverse: 'Đảo Chiều',
  draw_bottom: 'Rút Đáy',
  catomic_bomb: 'Bom Nguyên Tử',
  swap_top_bottom: 'Đổi Đầu Đuôi',
  bury: 'Chôn Bài',
  garbage_collection: 'Thu Gom Rác',
  favor: 'Xin Bài',
  mark: 'Đánh Dấu',
  grave_robber: 'Trộm Mộ',
  shuffle: 'Xáo Bài',
  see_future: 'Xem Trước',
  alter_future: 'Sửa Tương Lai',
  share_future: 'Chia Sẻ Tương Lai',
  dig_deeper: 'Đào Sâu',
  clone: 'Nhân Bản',
  pair: 'Đôi mèo',
  triple: 'Bộ ba mèo',
  five: '5 lá khác nhau',
};

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Thông báo lớn giữa màn hình khi có người nổ / gỡ bom / thắng */
/** Các dòng nhật ký mới kể từ lần trước (dựa vào logTotal vì server chỉ giữ 40 dòng gần nhất) */
function freshLines(log: string[], total: number, seen: { current: number }) {
  const added = total - seen.current;
  seen.current = total;
  return added > 0 ? log.slice(-Math.min(added, log.length)) : [];
}

function useAnnouncement(log: string[], total: number) {
  const [msg, setMsg] = useState<{ text: string; tone: string; at: number } | null>(null);
  const seen = useRef(total);
  useEffect(() => {
    const fresh = freshLines(log, total, seen);
    const hit = [...fresh].reverse().find((l) => /NỔ TUNG|GỠ BOM|🏆|ăn hũ/.test(l));
    if (!hit) return;
    const tone = hit.includes('NỔ TUNG') ? 'boom' : /🏆|ăn hũ/.test(hit) ? 'win' : 'defuse';
    sfx(tone);
    setMsg({ text: hit.replace(/^[^\p{L}]+/u, ''), tone, at: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);
  // Tự ẩn sau 2.6s. Hẹn giờ theo chính thông báo (không theo nhật ký), để dòng nhật ký mới đến ngay sau không huỷ mất hẹn giờ.
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return msg;
}

/** Bình luận nổi trên bàn: vài dòng diễn biến mới nhất, tự mờ sau vài giây */
function useFeed(log: string[], total: number) {
  const [feed, setFeed] = useState<{ id: number; text: string; tone: string }[]>([]);
  const seen = useRef(total);
  const seq = useRef(0);
  useEffect(() => {
    const items = freshLines(log, total, seen)
      .slice(-4)
      .map((text) => ({ id: ++seq.current, text, tone: /NỔ TUNG/.test(text) ? 'boom' : /GỠ BOM|thắng/.test(text) ? 'good' : '' }));
    if (!items.length) return;
    setFeed((f) => [...f, ...items].slice(-4));
    items.forEach((it) => window.setTimeout(() => setFeed((f) => f.filter((x) => x.id !== it.id)), 7000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);
  return feed;
}

type FloatKind = 'emote' | 'hit' | 'blast' | 'shard' | 'impact' | 'splat' | 'yolk' | 'drop' | 'shell' | 'crack' | 'bounce' | 'dizzy' | 'heart';

function HitArt({ kind }: { kind: FloatKind; v?: string }) {
  if (kind === 'splat') {
    return <Droplets size={38} strokeWidth={2.2} aria-hidden="true" />;
  }
  if (kind === 'yolk') {
    return <CircleDot size={38} strokeWidth={2.2} aria-hidden="true" />;
  }
  if (kind === 'crack') {
    return <Zap size={38} strokeWidth={2.2} aria-hidden="true" />;
  }
  return null;
}

/** Emoji bay lên trên avatar (nhiều cái cùng lúc) + combo đếm số lần */
function Floaters({
  list,
  combo,
}: {
  list?: { id: number; emoji: string; kind: FloatKind; dx: number; dy?: number; rot: number; dur: number; v?: string; delay?: number }[];
  combo?: { emoji: string; count: number; at: number };
}) {
  return (
    <>
      {list?.map((f) => (
        <span
          key={f.id}
          className={`emote-pop ${f.kind}${f.v ? ` v-${f.v}` : ''}`}
          style={
            {
              ['--dx' as string]: `${f.dx}px`,
              ['--dy' as string]: `${f.dy ?? 0}px`,
              ['--rot' as string]: `${f.rot}deg`,
              animationDuration: `${f.dur}ms`,
              animationDelay: f.delay ? `${f.delay}ms` : undefined,
            } as CSSProperties
          }
        >
          {f.kind === 'splat' || f.kind === 'yolk' || f.kind === 'crack' ? <HitArt kind={f.kind} v={f.v} /> : f.emoji}
        </span>
      ))}
      {combo && combo.count > 1 && (
        <span key={`${combo.emoji}${combo.count}`} className="emote-combo">
          {combo.emoji} ×{combo.count}
        </span>
      )}
    </>
  );
}

/** Vòng đếm ngược quanh avatar */
function Ring({ progress, children, active, urgent, tone = 'turn' }: { progress: number; children: ReactNode; active: boolean; urgent?: boolean; tone?: string }) {
  return (
    <div className={`ring${active ? ' active' : ''}${urgent ? ' urgent' : ''} tone-${tone}`} style={{ ['--p' as string]: Math.max(0, Math.min(1, progress)) } as CSSProperties}>
      {children}
    </div>
  );
}

export default function GameBoard({ view, meId, emit, notice, onCloseNotice, reveal, onCloseReveal, fx, emote, chat = NO_CHAT, dock }: Props) {
  const { rules } = view;
  const kindLabel = (kind: ActionKind) => kind === 'pair' ? `Đôi${rules.comboScope === 'cats' ? ' mèo' : ''}` : kind === 'triple' ? `Bộ ba${rules.comboScope === 'cats' ? ' mèo' : ''}` : KIND_LABEL[kind];
  const now = useNow();
  const announce = useAnnouncement(view.log, view.logTotal);
  const feed = useFeed(view.log, view.logTotal);
  const [chatOpen, setChatOpenState] = useState(loadChatOpen);
  const [chatTab, setChatTab] = useState<ChatTab>('chat');
  const setChatOpen = (open: boolean, tab?: ChatTab) => {
    setChatOpenState(open);
    if (tab) setChatTab(tab);
    try {
      localStorage.setItem(CHAT_OPEN_KEY, open ? '1' : '0');
    } catch {
      /* tuỳ chọn hiển thị */
    }
  };
  const { typingNames, unread } = useChatState(chat, roomPeople(view), meId, chatOpen && chatTab === 'chat');
  // Tin chat mới: hiện bong bóng ngay trên avatar người gửi vài giây
  const [chatPops, setChatPops] = useState<Record<string, { id: number; text: string }>>({});
  const lastChatId = useRef(chat.messages.at(-1)?.id ?? 0);
  const newestChatId = chat.messages.at(-1)?.id ?? 0;
  useEffect(() => {
    const fresh = chat.messages.filter((m) => m.id > lastChatId.current);
    lastChatId.current = chat.messages.at(-1)?.id ?? lastChatId.current;
    fresh.forEach((m) => {
      const text = m.text.length > 70 ? m.text.slice(0, 68) + '…' : m.text;
      setChatPops((p) => ({ ...p, [m.from]: { id: m.id, text } }));
      if (m.from !== meId) sfx('pop');
      window.setTimeout(
        () =>
          setChatPops((p) => {
            if (p[m.from]?.id !== m.id) return p;
            const next = { ...p };
            delete next[m.from];
            return next;
          }),
        4500,
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestChatId]);
  // Biểu cảm: emoji nảy trên avatar, ném đồ vào người khác
  // Mỗi lần thả là 1 emoji bay lên riêng (bấm nhiều thì hiện liên tục, chồng nhiều cái như livestream)
  type Floater = { id: number; emoji: string; kind: FloatKind; dx: number; dy?: number; rot: number; dur: number; v?: string; delay?: number };
  const [pops, setPops] = useState<Record<string, Floater[]>>({});
  // Bấm liên tục cùng 1 emoji → hiện combo "😂 ×7"
  const [combos, setCombos] = useState<Record<string, { emoji: string; count: number; at: number }>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Menu ném đồ đang mở trên avatar của người này */
  const [throwMenu, setThrowMenu] = useState<string | null>(null);
  const [shaking, setShaking] = useState<Record<string, number>>({});
  /** Đánh Xáo Bài: chọn kiểu xáo */
  const [shufflePick, setShufflePick] = useState<string[] | null>(null);
  const [leaveAsk, setLeaveAsk] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const avatarEl = (pid: string) => document.querySelector(`[data-avatar="${CSS.escape(pid)}"]`) ?? seatEl(pid);
  useEffect(() => {
    if (!emote) return;
    const { e, id } = emote;
    let seq = 0;
    const add = (pid: string, f: Omit<Floater, 'id'>) => {
      const fid = id * 100 + seq++;
      setPops((p) => ({ ...p, [pid]: [...(p[pid] ?? []), { ...f, id: fid }].slice(-60) }));
      window.setTimeout(() => setPops((p) => ({ ...p, [pid]: (p[pid] ?? []).filter((x) => x.id !== fid) })), f.dur + (f.delay ?? 0));
    };
    /** Trúng đòn: món đồ dính mặt + nổ 💥 + mảnh văng + avatar rung */
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    /** Giọt văng có trọng lực: bắn ra rồi rơi xuống */
    const drops = (pid: string, n: number, v: string, spread = 46) => {
      for (let k = 0; k < n; k++) {
        const ang = rnd(-Math.PI, 0) + rnd(-0.4, 0.4);
        add(pid, { emoji: '', kind: 'drop', v, dx: Math.round(Math.cos(ang) * rnd(spread * 0.5, spread)), dy: Math.round(rnd(30, 70)), rot: Math.round(rnd(4, 9)), dur: 900, delay: 60 });
      }
    };
    const shake = (pid: string, ms = 600) => {
      setShaking((h) => ({ ...h, [pid]: (h[pid] ?? 0) + 1 }));
      window.setTimeout(() => setShaking((h) => ({ ...h, [pid]: Math.max(0, (h[pid] ?? 1) - 1) })), ms);
    };
    /** Trúng đòn: mỗi món một kiểu vỡ / văng cho sinh động */
    const hitFx = (pid: string) => {
      const em = e.emoji;
      switch (em) {
        case '💣': {
          sfx('boom');
          add(pid, { emoji: '💥', kind: 'blast', dx: 0, rot: 0, dur: 900 });
          ['🔥', '💥', '✨', '💨', '🔥', '✨'].forEach((x, k) => {
            const ang = (Math.PI * 2 * k) / 6 + rnd(0, 0.6);
            const dist = rnd(60, 90);
            add(pid, { emoji: x, kind: 'shard', dx: Math.round(Math.cos(ang) * dist), dy: Math.round(Math.sin(ang) * dist), rot: Math.round(rnd(-150, 150)), dur: 800 });
          });
          shake(pid);
          return;
        }
        case '🍅':
        case '💩': {
          const v = em === '🍅' ? 'tomato' : 'poop';
          sfx('splat');
          add(pid, { emoji: em, kind: 'impact', dx: 0, rot: 0, dur: 220 });
          add(pid, { emoji: '', kind: 'splat', v, dx: 0, rot: Math.round(rnd(0, 360)), dur: 2600, delay: 120 });
          drops(pid, 8, v);
          if (em === '💩') ['🪰', '🪰'].forEach((x, k) => add(pid, { emoji: x, kind: 'dizzy', dx: k ? 18 : -18, rot: 0, dur: 2200, delay: 300 + k * 200 }));
          shake(pid, 400);
          return;
        }
        case '🥚': {
          sfx('crack');
          add(pid, { emoji: '🥚', kind: 'impact', dx: 0, rot: 0, dur: 200 });
          add(pid, { emoji: '🥚', kind: 'shell', v: 'l', dx: -34, dy: 26, rot: -70, dur: 700, delay: 120 });
          add(pid, { emoji: '🥚', kind: 'shell', v: 'r', dx: 34, dy: 30, rot: 80, dur: 700, delay: 120 });
          add(pid, { emoji: '', kind: 'yolk', dx: 0, rot: Math.round(rnd(0, 360)), dur: 3000, delay: 140 });
          drops(pid, 5, 'egg', 34);
          shake(pid, 350);
          return;
        }
        case '🧱': {
          sfx('thud');
          add(pid, { emoji: '🧱', kind: 'bounce', dx: Math.round(rnd(-40, 40)), rot: Math.round(rnd(-200, 200)), dur: 1100 });
          add(pid, { emoji: '', kind: 'crack', dx: 0, rot: Math.round(rnd(0, 360)), dur: 2200, delay: 60 });
          ['💨', '💨', '💨'].forEach((x, k) => add(pid, { emoji: x, kind: 'shard', dx: (k - 1) * 46, dy: Math.round(rnd(10, 30)), rot: 0, dur: 900, delay: 80 }));
          ['💫', '⭐', '💫'].forEach((x, k) => add(pid, { emoji: x, kind: 'dizzy', dx: 0, rot: k * 120, dur: 1800, delay: 250 }));
          shake(pid, 800);
          return;
        }
        case '🌹':
        case '💋': {
          sfx('kiss');
          add(pid, { emoji: em, kind: 'hit', dx: 0, rot: 0, dur: 1600 });
          ['💕', '💖', '💗', '💞', '💓'].forEach((x, k) => add(pid, { emoji: x, kind: 'heart', dx: Math.round(rnd(-40, 40)), rot: Math.round(rnd(-25, 25)), dur: 1600, delay: k * 90 }));
          return;
        }
        default: {
          sfx('splat');
          add(pid, { emoji: em, kind: 'hit', dx: 0, rot: 0, dur: 2000 });
          [em, em, em].forEach((x, k) => {
            const ang = (Math.PI * 2 * k) / 3 + rnd(0, 0.6);
            add(pid, { emoji: x, kind: 'shard', dx: Math.round(Math.cos(ang) * 40), dy: Math.round(Math.sin(ang) * 40), rot: Math.round(rnd(-150, 150)), dur: 800 });
          });
          shake(pid);
        }
      }
    };
    const show = (pid: string, kind: 'emote' | 'hit') => {
      if (kind === 'hit') {
        hitFx(pid);
        return;
      }
      add(pid, { emoji: e.emoji, kind, dx: Math.round((Math.random() - 0.5) * 70), rot: Math.round((Math.random() - 0.5) * 40), dur: 1700 + Math.round(Math.random() * 600) });
      {
        const now = Date.now();
        setCombos((c) => {
          const prev = c[pid];
          const count = prev && prev.emoji === e.emoji && now - prev.at < 1500 ? prev.count + 1 : 1;
          return { ...c, [pid]: { emoji: e.emoji, count, at: now } };
        });
        window.setTimeout(() => setCombos((c) => (c[pid] && Date.now() - c[pid].at >= 1500 ? (({ [pid]: _, ...rest }) => rest)(c) : c)), 1600);
      }
    };
    if (e.to) {
      const to = e.to;
      flyEmoji(avatarEl(e.from), avatarEl(to), e.emoji, () => show(to, 'hit'));
    } else {
      sfx('pop');
      show(e.from, 'emote');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emote?.id]);
  useEffect(() => {
    if (!pickerOpen) return;
    const close = (ev: PointerEvent) => {
      if (!(ev.target as Element | null)?.closest?.('.emote-picker, .emote-btn')) setPickerOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pickerOpen]);
  const sendEmote = (emoji: string) => {
    emit('room:emote', { emoji });
    setPickerOpen(false);
  };
  const throwAt = (to: string, emoji: string) => emit('room:emote', { emoji, to });
  // Rê chuột vào avatar là hiện menu ném; rời khỏi ghế (avatar + menu) một chút thì tự đóng
  const closeTimer = useRef<number | undefined>(undefined);
  const hoverOpen = (pid: string) => (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer.current);
    setThrowMenu(pid);
  };
  const hoverStay = () => clearTimeout(closeTimer.current);
  const hoverLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setThrowMenu(null), 280);
  };
  useEffect(() => {
    if (!throwMenu) return;
    const close = (ev: PointerEvent) => {
      if (!(ev.target as Element | null)?.closest?.('.throw-ring, .avatar-wrap')) setThrowMenu(null);
    };
    const esc = (ev: KeyboardEvent) => ev.key === 'Escape' && setThrowMenu(null);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [throwMenu]);
  const riffleRef = useRef<HTMLSpanElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [targetId, setTargetId] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  /** Chế độ chọn nhiều lá (combo 5 lá khác nhau); mặc định bấm lá là đánh luôn như UNO */
  const [comboMode, setComboMode] = useState(false);
  const playZoneRef = useRef<HTMLDivElement>(null);
  const [giveId, setGiveId] = useState<string | null>(null);
  /** Lá úp đang chọn khi cướp bài (vị trí trong hàng lá úp) */
  const [stealIdx, setStealIdx] = useState<number | null>(null);
  /** Thu Gom Rác / Trộm Mộ: lá đang chọn để xáo vào chồng rút */
  const [returnId, setReturnId] = useState<string | null>(null);
  const [bombPos, setBombPos] = useState(0);
  const [shuffling, setShuffling] = useState<string | null>(null);
  const [transferBanner, setTransferBanner] = useState<string | null>(null);
  const [kickAsk, setKickAsk] = useState<PublicPlayer | null>(null);
  /** Đang xem bài lật ngửa của người đã nổ */
  const [deadViewId, setDeadViewId] = useState<string | null>(null);
  const [alterOrder, setAlterOrder] = useState<Card[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  /** Sửa Tương Lai: lá đang được chọn để đổi chỗ (bấm lá thứ hai là đổi) – dùng được cả trên điện thoại */
  const [pickIdx, setPickIdx] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [bubbles, setBubbles] = useState<Record<string, string>>({});
  const deckRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const [handBox, setHandBox] = useState({ w: 0, cw: 120 });
  useEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const measure = () => {
      const card = el.querySelector<HTMLElement>('.card');
      setHandBox((b) => {
        const w = el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight);
        const cw = card?.offsetWidth || b.cw;
        return b.w === w && b.cw === cw ? b : { w, cw };
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const first = el.querySelector('.card');
    if (first) ro.observe(first);
    return () => ro.disconnect();
  }, [view.hand.length]);
  const handW = handBox.w;

  const secs = (deadline?: number) => (deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0);
  const left = (deadline: number | undefined, total: number) => (deadline ? (deadline - now) / total : 0);
  const avatarOf = (id?: string) => view.players.find((p) => p.id === id)?.avatar;
  const nameOf = (id?: string) => (id === meId ? 'Bạn' : (view.players.find((p) => p.id === id)?.name ?? '?'));

  const me = view.players.find((p) => p.id === meId);
  const spectating = isSpectating(view, meId);
  const alive = !!me?.alive;
  const myTurn = view.currentPlayerId === meId;
  const { pending, waiting, lastPlay } = view;
  const giving = waiting?.kind === 'favor_give' && waiting.playerId === meId;
  const placing = waiting?.kind === 'defuse_place' && waiting.playerId === meId;
  const digging = waiting?.kind === 'dig_choice' && waiting.playerId === meId;
  const returning = waiting?.kind === 'return_card' && waiting.pendingIds.includes(meId);
  const altering = waiting?.kind === 'alter_future' && waiting.playerId === meId && !!waiting.cards?.length;
  const stealing = waiting?.kind === 'steal_pick' && waiting.playerId === meId;
  const canDraw = alive && myTurn && !pending && !waiting && view.phase === 'playing';

  const alterKey = waiting?.kind === 'alter_future' && waiting.cards ? waiting.cards.map((c) => c.id).join(',') : '';
  useEffect(() => {
    if (waiting?.kind === 'alter_future' && waiting.cards) {
      setAlterOrder(waiting.cards);
      setDragIdx(null);
      setOverIdx(null);
      setPickIdx(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alterKey]);

  const moveAlterCard = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setAlterOrder((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    sfx('tap');
  };
  const swapAlterCards = (a: number, b: number) => {
    setAlterOrder((prev) => {
      if (a === b || !prev[a] || !prev[b]) return prev;
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
    sfx('tap');
  };
  const tapAlterCard = (idx: number) => {
    if (pickIdx === null) {
      setPickIdx(idx);
      sfx('select');
    } else {
      if (pickIdx !== idx) swapAlterCards(pickIdx, idx);
      else sfx('unselect');
      setPickIdx(null);
    }
  };

  const handIds = new Set(view.hand.map((c) => c.id));
  // Xếp bài trên tay: giữ thứ tự hiện tại, lá mới nằm cuối; bấm "Xếp bài" thì trượt về đúng loại
  const [order, setOrder] = useState<string[]>(() => sortIds(view.hand));
  const byId = new Map(view.hand.map((c) => [c.id, c]));
  const hand = [...order.filter((id) => byId.has(id)), ...view.hand.filter((c) => !order.includes(c.id)).map((c) => c.id)].map((id) => byId.get(id)!);
  const flipFrom = useRef<Map<string, DOMRect> | null>(null);
  const sortHand = () => {
    const next = sortIds(hand);
    if (next.join() === hand.map((c) => c.id).join()) {
      sfx('deny');
      return;
    }
    applyOrder(next);
  };
  /** Trộn ngẫu nhiên thứ tự bài trên tay (chỉ ở máy mình) */
  const shuffleHand = () => {
    const ids = hand.map((c) => c.id);
    let next = ids;
    for (let tries = 0; tries < 5 && next.join() === ids.join(); tries++) {
      next = [...ids];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
    }
    applyOrder(next);
  };
  const applyOrder = (next: string[]) => {
    const before = new Map<string, DOMRect>();
    handRef.current?.querySelectorAll<HTMLElement>('[data-cid]').forEach((el) => before.set(el.dataset.cid!, el.getBoundingClientRect()));
    flipFrom.current = before;
    sfx('shuffle');
    setOrder(next);
  };
  useLayoutEffect(() => {
    const before = flipFrom.current;
    if (!before || !handRef.current) return;
    flipFrom.current = null;
    handRef.current.querySelectorAll<HTMLElement>('[data-cid]').forEach((el, idx) => {
      const a = before.get(el.dataset.cid!);
      if (!a) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [{ translate: `${dx}px ${dy}px` }, { translate: `${dx / 2}px ${dy / 2 - 46}px`, offset: 0.5 }, { translate: '0px 0px' }],
        { duration: 520, delay: idx * 30, easing: 'cubic-bezier(0.3, 0.8, 0.3, 1)', fill: 'backwards' },
      );
    });
  }, [order]);
  // Lá mới vào tay: gắn nhãn "MỚI" vài giây để không lạc sau khi tự xếp
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = view.hand.map((c) => c.id);
    if (knownIds.current) {
      const added = ids.filter((id) => !knownIds.current!.has(id));
      if (added.length) {
        setFresh((f) => new Set([...f, ...added]));
        window.setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !added.includes(id)))), 3500);
      }
    }
    knownIds.current = new Set(ids);
  }, [view.hand]);
  const sel = selected.filter((id) => handIds.has(id));
  const selCards = view.hand.filter((c) => sel.includes(c.id));
  // Nhân Bản trở thành lá nằm ngay bên dưới nó: lá trên đỉnh chồng bài bỏ (server kiểm tra lại)
  const cloneKind: ActionKind =
    cloneCopyKind(view.discardTop ? { id: view.discardTopId, type: view.discardTop } : undefined, view.lastPlay) ?? 'clone';
  const rawKind = detectPlayKind(selCards.map((c) => c.type), rules);
  const kind = rawKind === 'clone' ? cloneKind : rawKind;
  const needsTarget = kind === 'favor' || kind === 'targeted_attack' || kind === 'mark' || kind === 'pair' || kind === 'triple';
  const needsDiscard = kind === 'five';
  const aliveOpponents = view.players.filter((p) => p.alive && p.id !== meId);
  const handTargets = aliveOpponents.filter((p) => p.handCount > 0);
  const targets = kind === 'targeted_attack' ? aliveOpponents : handTargets;
  const needsWizard = needsTarget || needsDiscard;
  const matchingComboIds = (t: CardType) => comboGroupFor(view.hand, t, rules).map((c) => c.id);
  const myActionTime = alive && myTurn && !pending && !waiting && view.phase === 'playing';
  const combosEnabled = rules.allowPair || rules.allowTriple || rules.allowFive;
  const comboHint = [
    rules.allowPair ? `2 ${rules.comboScope === 'cats' ? 'lá mèo' : 'lá'} cùng loại` : '',
    rules.allowTriple ? `3 ${rules.comboScope === 'cats' ? 'lá mèo' : 'lá'} cùng loại` : '',
    rules.allowFive ? '5 lá khác tên nhau' : '',
  ].filter(Boolean).join(' / ');
  const canNopePending =
    !!pending &&
    (!pending.nopeCount || rules.nopeChain) &&
    (pending.nopeCount % 2 === 0 ? pending.actorId !== meId : lastPlay?.nopers.at(-1) !== meId);
  /** Đôi/ba cần có người còn bài để lấy, và đủ lá cùng loại (luật chung với server) */
  const canComboType = (t: CardType) => handTargets.length > 0 && canComboWith(view.hand, t, rules);
  /** Lá chức năng đánh lẻ có đủ điều kiện (có người để nhắm, có lá trong chồng bỏ…) như server kiểm tra */
  const singleUsable = (k: ActionKind) => {
    if (k === 'favor' || k === 'mark') return handTargets.length > 0;
    if (k === 'targeted_attack') return aliveOpponents.length > 0;
    // Trộm Mộ: "You cannot play this card if there are no Dead players."
    if (k === 'grave_robber') return view.players.some((p) => !p.alive);
    return true;
  };
  /** Lá sáng = bấm là đánh được ngay */
  const isPlayable = (c: Card) => {
    if (!alive || view.phase !== 'playing' || waiting) return false;
    if (pending) return NOPE_CARD_TYPES.includes(c.type) && canNopePending;
    if (!myActionTime) return false;
    if (SINGLE.includes(c.type)) {
      // Nhân Bản: sáng khi lá trên đỉnh chồng bỏ là lá chức năng dùng được lúc này
      if (c.type === 'clone') return (cloneKind !== 'clone' && singleUsable(cloneKind)) || canComboType(c.type);
      return singleUsable(c.type as ActionKind);
    }
    return canComboType(c.type);
  };
  const nopeCard = canNopePending ? view.hand.find((c) => c.type === 'nope') : undefined;
  const superNopeCard = canNopePending ? view.hand.find((c) => c.type === 'super_nope') : undefined;
  const canPlay = myActionTime && !!kind && (!needsTarget || targets.length > 0);
  /** Combo 5 lá khác nhau: lục chồng bài bỏ (gồm cả 5 lá vừa đánh) */
  const fiveDiscardTypes = [...new Set([...view.discardTypes, ...selCards.map((c) => c.type)])].filter((t) => t !== 'exploding');
  const canFive = rules.allowFive && new Set(view.hand.filter((c) => c.type !== 'exploding').map((c) => c.type)).size >= 5;

  useEffect(() => {
    if (myActionTime) return;
    setComboMode(false);
    setSelected([]);
    setWizardOpen(false);
  }, [myActionTime]);

  useEffect(() => {
    if (placing && waiting?.kind === 'defuse_place') setBombPos((p) => Math.min(p, waiting.deckCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placing]);

  // Âm thanh: tới lượt mình, có người đánh bài, có người Nope, bị xin bài
  useEffect(() => {
    if (!stealing) setStealIdx(null);
  }, [stealing]);
  const prev = useRef({ myTurn, playId: lastPlay?.id, nopes: lastPlay?.nopers.length ?? 0, giving, deck: view.deckCount });
  useEffect(() => {
    const p = prev.current;
    if (myTurn && !p.myTurn && view.phase === 'playing') sfx('turn');
    else if (giving && !p.giving) sfx('turn');
    if (lastPlay && lastPlay.id !== p.playId) sfx('play');
    else if (lastPlay && lastPlay.nopers.length > p.nopes) sfx('nope');
    else if (view.deckCount < p.deck) sfx('draw');
    prev.current = { myTurn, playId: lastPlay?.id, nopes: lastPlay?.nopers.length ?? 0, giving, deck: view.deckCount };
  }, [myTurn, giving, lastPlay, view.deckCount, view.phase]);

  // Hiệu ứng từ server: lá bay, xáo bài, rung bàn…
  const showBubble = (pid: string, text: string, ms = 2400) => {
    setBubbles((b) => ({ ...b, [pid]: text }));
    window.setTimeout(() => setBubbles((b) => ({ ...b, [pid]: b[pid] === text ? '' : b[pid] })), ms);
  };
  useEffect(() => {
    if (!fx) return;
    const f = fx.fx;
    const deck = deckRef.current;
    switch (f.type) {
      case 'draw':
        flyCard(deck, seatEl(f.playerId));
        break;
      case 'shuffle': {
        const st = typeof f.style === 'string' && Object.hasOwn(SHUFFLE_STYLES, f.style) ? f.style : 'riffle';
        sfx('shuffle');
        setShuffling(`${nameOf(f.playerId)} xáo bài kiểu ${SHUFFLE_STYLES[st].name}!`);
        window.requestAnimationFrame(() => SHUFFLE_ANIM[st](riffleRef.current));
        window.setTimeout(() => setShuffling(null), 1700);
        break;
      }
      case 'future':
        if (f.playerId !== meId) showBubble(f.playerId, 'Đang xem trước');
        break;
      case 'transfer': {
        const from = f.from === 'discard' ? discardRef.current : seatEl(f.from);
        const fromLabel = f.from === 'discard' ? 'Bài bỏ' : nameOf(f.from);
        const toLabel = nameOf(f.to);
        flyTransferCard(from, seatEl(f.to), { fromName: fromLabel, toName: toLabel, via: f.via });
        if (f.from !== 'discard') {
          showBubble(f.from, `−1 lá (bị ${toLabel} lấy)`, 2600);
          setShaking((h) => ({ ...h, [f.from]: (h[f.from] ?? 0) + 1 }));
          window.setTimeout(() => setShaking((h) => ({ ...h, [f.from]: Math.max(0, (h[f.from] ?? 1) - 1) })), 500);
        }
        showBubble(f.to, f.from === 'discard' ? '+1 lá từ bài bỏ' : `+1 lá (lấy từ ${fromLabel})`, 2600);
        setTransferBanner(
          f.from === 'discard'
            ? `🎴 ${toLabel} lấy 1 lá từ chồng bài bỏ!`
            : `🎴 ${toLabel} vừa lấy 1 lá bài từ ${fromLabel}!`,
        );
        window.setTimeout(() => setTransferBanner(null), 2800);
        break;
      }
      case 'insert':
        flyCard(seatEl(f.playerId), deck);
        if (f.playerId !== meId) showBubble(f.playerId, 'Đã xếp bài vào chồng rút');
        break;
      case 'explode':
        setShake(true);
        window.setTimeout(() => setShake(false), 700);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx?.id]);

  const lastPlayId = useRef(lastPlay?.id);
  useEffect(() => {
    if (!lastPlay || lastPlay.id === lastPlayId.current) return;
    lastPlayId.current = lastPlay.id;
    if (lastPlay.actorId !== meId) {
      lastPlay.cards.forEach((_, i) => flyCard(seatEl(lastPlay.actorId), playZoneRef.current, { delay: i * 90 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPlay?.id]);
  const nopeCount = lastPlay?.nopers.length ?? 0;
  const lastNopes = useRef(nopeCount);
  useEffect(() => {
    if (nopeCount > lastNopes.current && lastPlay) {
      const who = lastPlay.nopers[nopeCount - 1];
      if (who !== meId) flyCard(seatEl(who), playZoneRef.current);
    }
    lastNopes.current = nopeCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nopeCount]);

  // Lá vừa lấy được / bị mất: tự ẩn sau vài giây
  useEffect(() => {
    if (!reveal) return;
    sfx(reveal.kind === 'lost' ? 'nope' : 'defuse');
    const t = window.setTimeout(() => onCloseReveal?.(), 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.key]);

  // Đối thủ xếp theo chiều kim đồng hồ bắt đầu từ người ngồi sau mình
  // Khán giả không có ghế: mọi người chơi đều ngồi quanh bàn
  const myIdx = view.players.findIndex((p) => p.id === meId);
  const opponents = myIdx < 0 ? view.players : [...view.players.slice(myIdx + 1), ...view.players.slice(0, myIdx)];
  const span = Math.min(200, 60 + opponents.length * 24);
  const crowded = opponents.length > 5;

  /** Bay các lá của mình ra giữa bàn rồi gửi lên server */
  const flyOut = (ids: string[]) =>
    ids.forEach((id, i) => flyClone(handRef.current?.querySelector(`[data-cid="${id}"]`) ?? null, playZoneRef.current, i * 70));

  const clickCard = (card: Card) => {
    if (!comboMode) {
      if (!isPlayable(card)) {
        sfx('deny');
        return;
      }
      if (NOPE_CARD_TYPES.includes(card.type)) {
        flyOut([card.id]);
        sfx('nope');
        emit('game:play', { cardIds: [card.id] });
        return;
      }
      if (CARD_INFO[card.type].isCat || !SINGLE.includes(card.type)) {
        // bài ghép cặp (mèo, mèo đa năng hoặc bài khác khi comboScope='any'): bấm để nhấc lên / hạ xuống
        const on = sel.includes(card.id);
        sfx(on ? 'unselect' : 'select');
        setSelected((s) => {
          if (on) return s.filter((id) => id !== card.id);
          const curTypes = s.map((id) => byId.get(id)?.type).filter((x): x is CardType => !!x);
          const compatible = canMatchComboCards([...curTypes, card.type], rules) ? s : [];
          return [...compatible, card.id].slice(rules.allowTriple ? -3 : -2);
        });
        return;
      }
      setSelected([]);
      const effective = card.type === 'clone' ? cloneKind : card.type;
      if (effective === 'shuffle') {
        setShufflePick([card.id]);
        return;
      }
      setSelected([card.id]);
      if (effective === 'favor' || effective === 'targeted_attack' || effective === 'mark') {
        setWizardOpen(true);
        return;
      }
      flyOut([card.id]);
      sfx('play');
      emit('game:play', { cardIds: [card.id] });
      setSelected([]);
      return;
    }
    const on = sel.includes(card.id);
    sfx(on ? 'unselect' : 'select');
    setSelected((s) => (on ? s.filter((id) => id !== card.id) : [...s.filter((id) => handIds.has(id)), card.id]));
  };

  const send = (r: WizardResult = {}) => {
    sfx('play');
    flyOut(sel);
    emit('game:play', { cardIds: sel, ...r });
    setComboMode(false);
    setSelected([]);
    setWizardOpen(false);
    setTargetId('');
  };
  // Lá cần chọn người / chọn lá thì mở hộp thoại, Xáo Bài chọn kiểu xáo, còn lại đánh luôn
  const play = () => (needsWizard ? setWizardOpen(true) : kind === 'shuffle' ? setShufflePick(sel) : send());
  const playShuffle = (style: ShuffleStyle) => {
    if (!shufflePick) return;
    flyOut(shufflePick);
    sfx('play');
    emit('game:play', { cardIds: shufflePick, shuffleStyle: style });
    setShufflePick(null);
    setSelected([]);
    setComboMode(false);
  };

  const leave = () => (view.phase === 'ended' || !alive ? emit('room:leave') : setLeaveAsk(true));

  // ---------- dòng trạng thái của mình ----------
  let status: ReactNode;
  let statusTone = '';
  if (view.phase === 'ended') {
    status = (
      <span className="status-row">
        <Trophy size={16} className="inline-icon" /> {view.winnerId === meId ? 'Bạn thắng!' : `${nameOf(view.winnerId)} thắng!`}
      </span>
    );
  } else if (!alive) {
    status = (
      <span className="status-row">
        <Skull size={16} className="inline-icon" /> Bạn đã nổ. {view.hand.length ? 'Bài của bạn đang lật ngửa cho cả bàn xem 👀' : 'Ngồi xem tiếp nhé!'}
      </span>
    );
  } else if (giving && waiting?.kind === 'favor_give') {
    status = (
      <span className="status-row">
        <HandHeart size={16} className="inline-icon" /> {nameOf(waiting.toId)} xin bài: bấm 1 lá để đưa ({secs(waiting.deadline)}s)
      </span>
    );
    statusTone = 'warn';
  } else if (stealing && waiting?.kind === 'steal_pick') {
    status = (
      <span className="status-row">
        <Crosshair size={16} className="inline-icon" /> Chọn 1 lá úp trên tay {nameOf(waiting.targetId)} để cướp ({secs(waiting.deadline)}s)
      </span>
    );
    statusTone = 'go';
  } else if (altering && waiting?.kind === 'alter_future') {
    status = (
      <span className="status-row">
        <Wand2 size={16} className="inline-icon" /> Sửa Tương Lai: kéo thả sắp xếp {waiting.count} lá trên cùng ({secs(waiting.deadline)}s)
      </span>
    );
    statusTone = 'go';
  } else if (waiting) {
    status =
      waiting.kind === 'defuse_place' ? (
        <span className="status-row">
          <ShieldCheck size={16} className="inline-icon" />{' '}
          {waiting.bury ? `${nameOf(waiting.playerId)} đang bí mật chôn lá vừa rút vào chồng bài…` : `${nameOf(waiting.playerId)} đang lén nhét Mèo Nổ lại…`}
        </span>
      ) : waiting.kind === 'dig_choice' ? (
        <span className="status-row">
          <Layers size={16} className="inline-icon" /> {nameOf(waiting.playerId)} đang Đào Sâu: xem lá vừa rút…
        </span>
      ) : waiting.kind === 'return_card' ? (
        <span className="status-row">
          <Layers size={16} className="inline-icon" />{' '}
          {returning ? 'Chọn 1 lá trên tay để xáo vào chồng rút' : `Đợi ${waiting.pendingIds.map(nameOf).join(', ')} chọn 1 lá xáo vào chồng rút…`}
        </span>
      ) : waiting.kind === 'alter_future' ? (
        <span className="status-row">
          <Wand2 size={16} className="inline-icon" /> {nameOf(waiting.playerId)} đang sắp xếp {waiting.count} lá trên cùng…
        </span>
      ) : waiting.kind === 'steal_pick' ? (
        <span className="status-row">
          <Crosshair size={16} className="inline-icon" />{' '}
          {waiting.targetId === meId ? `${nameOf(waiting.playerId)} đang bốc 1 lá úp trên tay bạn…` : `${nameOf(waiting.playerId)} đang bốc 1 lá úp của ${nameOf(waiting.targetId)}…`}
        </span>
      ) : (
        <span className="status-row">
          <HandHeart size={16} className="inline-icon" /> Đợi {nameOf(waiting.playerId)} chọn bài đưa cho {nameOf(waiting.toId)}…
        </span>
      );
  } else if (pending) {
    status = nopeCard ? 'Có người vừa đánh bài: muốn chặn thì bấm NOPE!' : 'Đang chờ xem có ai Nope không…';
  } else if (myTurn) {
    status = (
      <>
        <b>Lượt của bạn</b>
        {view.turnsRemaining > 1 && <> (còn {view.turnsRemaining} lượt)</>}: đánh bài hoặc rút để kết thúc lượt
      </>
    );
    statusTone = 'go';
  } else {
    status = (
      <>
        Đang tới lượt <b>{nameOf(view.currentPlayerId)}</b>
      </>
    );
  }

  const seatProgress = (p: PublicPlayer) => {
    if (waiting?.playerId === p.id) {
      const rem = waiting.deadline ? waiting.deadline - now : 99999;
      return { active: true, progress: left(waiting.deadline, rules.promptSeconds * 1000), urgent: rem > 0 && rem <= 5000, tone: 'wait' };
    }
    if (p.id === view.currentPlayerId && !pending && !waiting) {
      const rem = view.turnDeadline ? view.turnDeadline - now : 99999;
      return { active: true, progress: left(view.turnDeadline, rules.turnSeconds * 1000), urgent: rem > 0 && rem <= 5000, tone: 'turn' };
    }
    if (p.id === view.currentPlayerId) return { active: true, progress: 1, urgent: false, tone: 'turn' };
    return { active: false, progress: 0, urgent: false, tone: 'turn' };
  };

  // Bài trên tay: đủ chỗ thì tách nhau, chật thì xếp chồng vừa khung
  const n = view.hand.length;
  const cardW = handBox.cw;
  const overlap = n > 1 && handW ? Math.min(cardW * 0.72, Math.max(-12, (n * cardW - (handW - 24)) / (n - 1))) : -12;

  return (
    <div className={`game${chatOpen ? ' with-chat' : ''}`}>
      {/* ================= BÀN CHƠI ================= */}
      <div className={`arena${shake ? ' shake' : ''}`}>
        <div className="felt" />

        <div className={`seats${crowded ? ' crowded' : ''}`}>
          {opponents.map((p, i) => {
            const a = ((270 - span / 2 + (span * (i + 0.5)) / opponents.length) * Math.PI) / 180;
            const ring = seatProgress(p);
            const isTurn = view.phase === 'playing' && p.id === view.currentPlayerId;
            const isTarget = needsTarget && targetId === p.id;
            const pickable = needsTarget && canPlay && targets.some((t) => t.id === p.id);
            const isStealing =
              (pending && pending.actorId === p.id && !!pending.targetId && ['favor', 'mark', 'pair', 'triple'].includes(pending.kind)) ||
              (waiting?.kind === 'favor_give' && waiting.toId === p.id) ||
              (waiting?.kind === 'steal_pick' && waiting.playerId === p.id);
            const isVictim =
              (pending && pending.targetId === p.id && ['favor', 'mark', 'pair', 'triple'].includes(pending.kind)) ||
              (waiting?.kind === 'favor_give' && waiting.playerId === p.id) ||
              (waiting?.kind === 'steal_pick' && waiting.targetId === p.id);
            return (
              <div
                key={p.id}
                className={[
                  'seat',
                  isTurn && 'turn',
                  throwMenu === p.id && 'menu-on',
                  Math.cos(a) > 0.25 ? 'bubble-left' : 'bubble-right',
                  !p.alive && 'dead',
                  !p.connected && 'offline',
                  isTarget && 'targeted',
                  pickable && 'pickable',
                  isStealing && 'stealing',
                  isVictim && 'being-stolen',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ ['--x' as string]: (Math.cos(a) * 44).toFixed(2), ['--y' as string]: (Math.sin(a) * 40).toFixed(2) } as CSSProperties}
                data-pid={p.id}
                onPointerEnter={pickable ? undefined : hoverStay}
                onPointerLeave={pickable ? undefined : hoverLeave}
                onClick={
                  pickable
                    ? () => {
                        setTargetId(p.id);
                        setWizardOpen(true);
                      }
                    : undefined
                }
              >
                {view.hostId === meId && !p.left && view.phase === 'lobby' && (
                  <button
                    type="button"
                    className="seat-kick-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setKickAsk(p);
                    }}
                    title={`Kích ${p.name} khỏi trận`}
                    aria-label={`Kích ${p.name} khỏi trận`}
                  >
                    <UserX size={13} />
                  </button>
                )}
                {isTurn && (
                  <span className="turn-badge">
                    <Zap size={12} className="inline-icon" /> ĐANG ĐÁNH{view.turnsRemaining > 1 ? ` ×${view.turnsRemaining}` : ''}
                  </span>
                )}
                <span
                  className={`avatar-wrap${pickable ? '' : ' throwable'}${throwMenu === p.id ? ' menu-open' : ''}${shaking[p.id] ? ' got-hit' : ''}`}
                  data-avatar={p.id}
                  onPointerEnter={pickable ? undefined : hoverOpen(p.id)}
                  onClick={pickable ? undefined : () => setThrowMenu((m) => (m === p.id ? null : p.id))}
                >
                  {!pickable && (
                    <span className="throw-hover">
                      <Crosshair size={13} />
                    </span>
                  )}
                  <Ring {...ring}>
                    <PlayerAvatar id={p.id} avatar={p.avatar} size={isTurn ? 76 : 58} dead={!p.alive} />
                  </Ring>
                  <Floaters list={pops[p.id]} combo={combos[p.id]} />
                  {chatPops[p.id] && (
                    <span key={`c${chatPops[p.id].id}`} className="chat-pop">
                      {chatPops[p.id].text}
                    </span>
                  )}
                  {throwMenu === p.id && (
                    <span className="throw-ring" role="menu" aria-label={`Ném vào ${p.name}`} onClick={(e) => e.stopPropagation()}>
                      {THROWABLES.map((t, k) => {
                        const ang = (-90 + (360 / THROWABLES.length) * k) * (Math.PI / 180);
                        return (
                          <button
                            key={t}
                            className={t === '💣' ? 'bomb' : ''}
                            style={{ ['--tx' as string]: Math.cos(ang).toFixed(3), ['--ty' as string]: Math.sin(ang).toFixed(3), ['--k' as string]: k } as CSSProperties}
                            onClick={() => throwAt(p.id, t)}
                            aria-label={t === '💣' ? 'Ném bom' : `Ném ${t}`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </span>
                  )}
                </span>
                <div className="seat-name">
                  {p.id === view.hostId && (
                    <span title="Chủ phòng" className="seat-icon">
                      <Crown size={12} />
                    </span>
                  )}
                  {p.name}
                  {!p.connected && (
                    <span title="Mất kết nối" className="seat-icon offline-icon">
                      <WifiOff size={11} />
                    </span>
                  )}
                </div>
                <div className="seat-cards">
                  {p.alive ? (
                    <>
                      <span className="mini-backs">
                        {Array.from({ length: Math.min(p.handCount, 5) }, (_, k) => (
                          <span key={k} className="mini-back" style={{ ['--k' as string]: k } as CSSProperties} />
                        ))}
                      </span>
                      <span className="seat-count">{p.handCount}</span>
                    </>
                  ) : (
                    <>
                      <span className="seat-dead">{p.left ? 'đã rời' : 'đã nổ'}</span>
                      <DeadHandFan player={p} onOpen={() => setDeadViewId(p.id)} />
                    </>
                  )}
                </div>
                {isTarget && (
                  <span className="target-tag">
                    <Crosshair size={11} className="inline-icon" /> mục tiêu
                  </span>
                )}
                {isVictim && (
                  <span className="steal-tag victim">
                    {waiting?.kind === 'favor_give' ? '🤲 Đang chọn bài đưa' : '🎯 Đang bị lấy bài'}
                  </span>
                )}
                {isStealing && (
                  <span className="steal-tag thief">
                    🤏 Đang lấy bài của {nameOf(pending?.targetId ?? (waiting?.kind === 'favor_give' ? waiting.playerId : waiting?.kind === 'steal_pick' ? waiting.targetId : undefined))}
                  </span>
                )}
                {lastPlay?.nopers.at(-1) === p.id && pending && <span className="nope-bubble">NOPE!</span>}
                {bubbles[p.id] && <span className="seat-bubble">{bubbles[p.id]}</span>}
              </div>
            );
          })}
        </div>

        <div className="table-center">
          {/* chồng bài */}
          <button
            ref={deckRef}
            className={`deck${canDraw ? ' can-draw' : ''}${shuffling ? ' shuffling' : ''}`}
            disabled={!canDraw}
            onClick={() => emit('game:draw')}
            title="Rút bài"
          >
            <span className="riffle" aria-hidden="true" ref={riffleRef}>
              {Array.from({ length: 12 }, (_, k) => (
                <span key={k} />
              ))}
            </span>
            {view.deckCount > 1 && <span className="deck-stack" />}
            {view.deckCount > 3 && <span className="deck-stack s2" />}
            <CardBack count={view.deckCount} />
            {canDraw && <span className="deck-label">RÚT BÀI</span>}
          </button>

          {/* bài vừa đánh */}
          <div className="play-zone" ref={playZoneRef}>
            {lastPlay ? (
              <div className="last-play" key={lastPlay.id}>
                <div className="lp-head">
                  <PlayerAvatar id={lastPlay.actorId} avatar={avatarOf(lastPlay.actorId)} size={26} />
                  <span>
                    <b>{nameOf(lastPlay.actorId)}</b> đánh {kindLabel(lastPlay.kind)}
                    {lastPlay.targetId && <> → {nameOf(lastPlay.targetId)}</>}
                  </span>
                </div>
                <div className={`lp-cards n${Math.min(lastPlay.cards.length, 5)}`}>
                  {lastPlay.cards.map((t, i) => (
                    <CardView key={i} type={t} seed={lastPlay.cardIds?.[i] ?? `${lastPlay.id}-${i}`} size="md" style={{ ['--i' as string]: i - (lastPlay.cards.length - 1) / 2 } as CSSProperties} />
                  ))}
                  {lastPlay.nopers.map((id, i) => (
                    <div key={`n${i}`} className="lp-nope" style={{ ['--n' as string]: i } as CSSProperties}>
                      <CardView type={lastPlay.nopeCardTypes?.[i] ?? 'nope'} seed={lastPlay.nopeCardIds?.[i] ?? `nope-${lastPlay.id}-${i}`} size="sm" />
                      <span className="lp-noper">{nameOf(id)}</span>
                    </div>
                  ))}
                </div>
                {pending ? (
                  <div className="lp-pending">
                    <div className="nope-timer">
                      <span style={{ width: `${Math.max(0, Math.min(1, left(pending.deadline, rules.nopeSeconds * 1000))) * 100}%` }} />
                    </div>
                    <span className={pending.nopeCount % 2 ? 'tag bad' : 'tag'}>
                      {pending.nopeCount % 2 ? (
                        <>
                          <Ban size={12} className="inline-icon" /> Đang bị Nope
                        </>
                      ) : pending.nopeCount ? (
                        <>
                          <RotateCcw size={12} className="inline-icon" /> Nope bị Nope lại
                        </>
                      ) : (
                        <>
                          <Hourglass size={12} className="inline-icon" /> Chờ Nope
                        </>
                      )}{' '}
                      · {secs(pending.deadline)}s
                    </span>
                    {alive && nopeCard && (
                      <button
                        className="nope-btn"
                        onClick={() => {
                          flyOut([nopeCard.id]);
                          sfx('nope');
                          emit('game:play', { cardIds: [nopeCard.id] });
                        }}
                      >
                        <Ban size={18} /> NOPE!
                      </button>
                    )}
                    {alive && superNopeCard && (
                      <button
                        className="nope-btn super"
                        title="Siêu Nope: không ai Nope lại được"
                        onClick={() => {
                          flyOut([superNopeCard.id]);
                          sfx('nope');
                          emit('game:play', { cardIds: [superNopeCard.id] });
                        }}
                      >
                        <OctagonX size={18} /> SIÊU NOPE!
                      </button>
                    )}
                  </div>
                ) : (
                  <span className={`tag ${lastPlay.result === 'noped' || lastPlay.result === 'cancelled' ? 'bad' : 'good'}`}>
                    {lastPlay.result === 'noped' ? (
                      <>
                        <Ban size={12} className="inline-icon" /> Đã bị Nope
                      </>
                    ) : lastPlay.result === 'cancelled' ? (
                      <>
                        <Ban size={12} className="inline-icon" /> Không còn tác dụng
                      </>
                    ) : (
                      <>
                        <Check size={12} className="inline-icon" /> Đã có hiệu lực
                      </>
                    )}
                  </span>
                )}
              </div>
            ) : (
              <div className="play-empty">Chưa ai đánh lá nào</div>
            )}
          </div>

          {/* chồng bài bỏ */}
          <div className="discard" ref={discardRef}>
            {view.discardTop ? <CardView type={view.discardTop} seed={view.discardTopId} size="md" /> : <div className="empty-slot">bài bỏ</div>}
            <span className="pile-label">Bài bỏ</span>
          </div>
        </div>

        {/* bình luận nổi trên bàn */}
        <div className="feed" aria-live="polite">
          {feed.map((f) => (
            <div key={f.id} className={`feed-item ${f.tone}`}>
              {f.text}
            </div>
          ))}
        </div>
        <div className="arena-tools">
          <Brand code={view.code} />
          <button className="icon-btn" onClick={() => setRulesOpen(true)} title="Xem luật phòng">
            <BookOpen size={15} /> <span>Luật phòng</span>
          </button>
          <button className="icon-btn exit-btn" onClick={leave} title="Thoát trận">
            <LogOut size={15} /> <span className="hide-sm">{spectating ? 'Rời phòng' : 'Thoát trận'}</span>
          </button>
          <SpectatorChip view={view} />
          {view.pot > 0 && view.phase === 'playing' && (
            <span className="pot-chip">
              <Coins size={14} className="inline-icon" /> Hũ {fmtCoins(view.pot)} xu
            </span>
          )}
          {!chatOpen && (
            <>
              <button className="icon-btn" onClick={() => setChatOpen(true, 'chat')} title="Mở chat">
                <MessageSquare size={15} /> <span className="hide-sm">Chat</span>
                {unread > 0 && <span className="badge">{unread}</span>}
              </button>
              <button className="icon-btn" onClick={() => setChatOpen(true, 'log')} title="Xem toàn bộ diễn biến">
                <ScrollText size={15} /> <span className="hide-sm">Diễn biến</span>
              </button>
            </>
          )}
        </div>
        <div className="arena-dock">{dock}</div>

        {announce && <div className={`announce ${announce.tone}`}>{announce.text}</div>}
        {shuffling && <div className="announce shuffle">{shuffling}</div>}
        {transferBanner && <div className="announce transfer">{transferBanner}</div>}

        {view.phase === 'ended' && (
          <div className="ended">
            <PlayerAvatar id={view.winnerId ?? 'none'} avatar={avatarOf(view.winnerId)} size={120} />
            <h2>
              <Trophy size={28} className="inline-icon" /> {view.winnerId === meId ? 'Bạn thắng!' : `${nameOf(view.winnerId)} thắng!`}
            </h2>
            {view.pot > 0 && (
              <div className="prize">
                +{fmtCoins(view.pot)} xu <Coins size={22} className="inline-icon" />
              </div>
            )}
            <div className="ended-actions">
              <button className="secondary" onClick={() => setRulesOpen(true)}>
                <BookOpen size={15} /> Luật phòng
              </button>
              {view.hostId === meId && (
                <button className="primary big" onClick={() => emit('game:restart')}>
                  <RotateCcw size={17} /> Chơi lại
                </button>
              )}
              <button className="ghost" onClick={() => emit('room:leave')}>
                <LogOut size={15} /> Rời phòng
              </button>
            </div>
            {view.hostId !== meId && <p className="muted">Đợi chủ phòng mở ván mới…</p>}
          </div>
        )}
      </div>

      {/* ================= KHU CỦA MÌNH ================= */}
      {spectating ? (
        <SpectatorArea view={view} emit={emit} />
      ) : (
        <div className={`my-area${myTurn ? ' my-turn' : ''}`} data-pid={meId}>
          <div className="quick-emotes" role="toolbar" aria-label="Biểu cảm nhanh">
            {QUICK_EMOTES.map((e) => (
              <button key={e} onClick={() => sendEmote(e)} title={`Thả ${e}`}>
                {e}
              </button>
            ))}
            <button
              className={`emote-btn more${pickerOpen ? ' on' : ''}`}
              onClick={() => setPickerOpen((o) => !o)}
              title="Thêm biểu cảm / ném đồ"
              aria-label="Thêm biểu cảm"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="my-bar">
            <span className={`avatar-wrap${myTurn && view.phase === 'playing' ? ' my-turn-avatar' : ''}${shaking[meId] ? ' got-hit' : ''}`} data-avatar={meId}>
              <Ring {...(me ? seatProgress(me) : { active: false, progress: 0 })}>
                <PlayerAvatar id={meId} avatar={me?.avatar} size={myTurn && view.phase === 'playing' ? 68 : 52} dead={!alive} />
              </Ring>
              {myTurn && view.phase === 'playing' && (
                <span className="my-turn-badge">
                  <Zap size={11} className="inline-icon" /> LƯỢT BẠN
                </span>
              )}
              <Floaters list={pops[meId]} combo={combos[meId]} />
              {chatPops[meId] && (
                <span key={`c${chatPops[meId].id}`} className="chat-pop mine">
                  {chatPops[meId].text}
                </span>
              )}
            </span>
            <div className={`my-status ${statusTone}`}>
              <div>{status}</div>
              {myTurn && !pending && !waiting && <div className="muted small">Còn {secs(view.turnDeadline)}s</div>}
            </div>
  
            <div className="my-actions">
              {!comboMode && myActionTime && (kind === 'pair' || kind === 'triple') && (
                <button className="primary big play-combo" onClick={() => setWizardOpen(true)}>
                  <Play size={16} /> {kind === 'pair' ? 'Đánh đôi' : 'Đánh bộ ba'} ({sel.length} lá)
                </button>
              )}
              {!comboMode && myActionTime && !kind && sel.length > 0 && (
                <span className="hint-chip">
                  <Cat size={14} className="inline-icon" /> Chọn thêm {Math.max(0, (rules.allowPair ? 2 : 3) - sel.length)} lá {rules.comboScope === 'cats' ? 'mèo ' : ''}cùng loại để đánh {rules.allowPair ? 'đôi' : 'bộ ba'}
                </span>
              )}
              {!comboMode && myActionTime && !sel.length && (
                <span className="hint-chip">
                  <MousePointerClick size={14} className="inline-icon" /> Bấm lá sáng để đánh · bấm chồng bài để rút
                  {canFive && <> · có 5 lá khác nhau: bấm “Chọn nhiều lá” để đánh combo 5</>}
                </span>
              )}
              {!comboMode && pending && alive && nopeCard && (
                <span className="hint-chip nope">
                  <Ban size={14} className="inline-icon" /> Bấm lá Nope để chặn!
                </span>
              )}
              {comboMode && (
                <>
                  <span className="kind-chip">{kind ? kindLabel(kind) : `Đã chọn ${sel.length} lá`}</span>
                  {!kind && comboHint && <span className="muted small">Chọn {comboHint}</span>}
                  <button className="primary" disabled={!canPlay} onClick={play}>
                    {needsTarget ? 'Chọn người' : needsDiscard ? 'Chọn lá' : 'Đánh ra'}
                  </button>
                </>
              )}
              {myActionTime && combosEnabled && (
                <button
                  className={comboMode ? 'secondary on' : 'secondary'}
                  onClick={() => {
                    setComboMode((m) => !m);
                    setSelected([]);
                  }}
                  title="Chọn nhiều lá để đánh combo"
                >
                  {comboMode ? (
                    <>
                      <X size={15} /> Thôi chọn nhiều
                    </>
                  ) : (
                    <>
                      <Layers size={15} /> Chọn nhiều lá
                    </>
                  )}
                </button>
              )}
              {sel.length > 0 && (
                <button className="ghost" onClick={() => setSelected([])}>
                  Bỏ chọn
                </button>
              )}
              {canDraw && (
                <button className="secondary" onClick={() => emit('game:draw')}>
                  <Layers size={15} /> Rút bài
                </button>
              )}
              {view.hand.length > 1 && (
                <button className="secondary" onClick={sortHand} title="Xếp bài theo loại: lá cùng loại đứng cạnh nhau">
                  <ArrowUpDown size={15} /> Xếp bài
                </button>
              )}
              {view.hand.length > 1 && (
                <button className="secondary" onClick={shuffleHand} title="Trộn ngẫu nhiên thứ tự bài trên tay">
                  <Shuffle size={15} /> Trộn bài
                </button>
              )}
            </div>
          </div>
  
          {pickerOpen && (
            <div className="emote-picker" role="dialog" aria-label="Biểu cảm">
              <div className="emote-title">Thả biểu cảm</div>
              <div className="emote-grid">
                {EMOTES.map((e) => (
                  <button key={e} onClick={() => sendEmote(e)}>
                    {e}
                  </button>
                ))}
              </div>
              <div className="emote-tip">Muốn ném đồ? Bấm vào avatar người đó.</div>
            </div>
          )}
          <div ref={handRef} className={`hand${!alive && !view.hand.length ? ' hand-empty-dead' : ''}`} style={{ ['--overlap' as string]: `${overlap}px` } as CSSProperties}>
            {hand.map((c, i) => (
              <CardView
                key={c.id}
                cid={c.id}
                type={c.type}
                seed={c.id}
                size="lg"
                className={`${comboMode || !(myActionTime || pending) ? '' : isPlayable(c) ? 'playable' : 'dim'}${fresh.has(c.id) ? ' fresh' : ''}`}
                selected={sel.includes(c.id)}
                onClick={alive && ((comboMode && myActionTime && c.type !== 'exploding') || isPlayable(c)) ? () => clickCard(c) : undefined}
                style={{ ['--i' as string]: i - (hand.length - 1) / 2 } as CSSProperties}
              />
            ))}
            {!view.hand.length && <span className="muted">Không còn lá nào trên tay.</span>}
          </div>
        </div>
      )}

      {chatOpen && (
        <div className="chat-col">
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

      {/* ================= HỘP THOẠI ================= */}
      {rulesOpen && (
        <Modal title={<span className="modal-title-icon"><BookOpen size={19} /> Luật phòng</span>} width={840} onClose={() => setRulesOpen(false)}>
          <Rules rules={rules} playerCount={view.players.length} />
          <div className="modal-actions">
            <button className="primary" onClick={() => setRulesOpen(false)}>
              Đã hiểu
            </button>
          </div>
        </Modal>
      )}
      {leaveAsk && (
        <Modal title={<span className="modal-title-icon"><LogOut size={19} /> Thoát trận?</span>} width={420}>
          <p>
            Ván đang diễn ra, thoát bây giờ sẽ bị tính là <b>thua</b>
            {view.pot > 0 && <> và mất số xu đã cược</>}.
          </p>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setLeaveAsk(false)}>
              Ở lại chơi
            </button>
            <button
              className="primary big danger"
              onClick={() => {
                setLeaveAsk(false);
                emit('room:leave');
              }}
            >
              Thoát trận
            </button>
          </div>
        </Modal>
      )}

      {shufflePick && (
        <Modal title={<span className="modal-title-icon"><Shuffle size={19} /> Xáo bài kiểu nào?</span>} width={640}>
          <p className="muted">Kiểu nào cũng xáo ngẫu nhiên hoàn toàn, chỉ khác cách cả bàn nhìn thấy bạn xáo.</p>
          <div className="shuffle-options">
            {(Object.keys(SHUFFLE_STYLES) as ShuffleStyle[]).map((st) => (
              <button key={st} className={`shuffle-opt so-${st}`} onClick={() => playShuffle(st)}>
                <span className="so-anim" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <b>
                  <ShuffleIcon style={st} size={15} className="inline-icon" /> {SHUFFLE_STYLES[st].name}
                </b>
                <span className="muted small">{SHUFFLE_STYLES[st].desc}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setShufflePick(null)}>
              Huỷ
            </button>
          </div>
        </Modal>
      )}

      {placing && waiting?.kind === 'defuse_place' && (
        <Modal title={<span className="modal-title-icon"><ShieldCheck size={19} /> {waiting.bury ? 'Chôn Bài' : 'Gỡ bom thành công!'}</span>} width={480}>
          <p>
            {waiting.bury ? 'Bí mật nhét lá bạn vừa rút lại vào chồng bài' : 'Bí mật nhét Mèo Nổ lại vào chồng bài'}. Còn <b>{secs(waiting.deadline)}s</b>, hết giờ sẽ nhét ngẫu nhiên.
          </p>
          <div className="bomb-track">
            {Array.from({ length: Math.min(waiting.deckCount, 24) + 1 }, (_, i) => {
              const pos = waiting.deckCount <= 24 ? i : Math.round((i / 24) * waiting.deckCount);
              return (
                <button
                  key={i}
                  className={pos === bombPos ? 'slot on' : 'slot'}
                  onClick={() => {
                    sfx('tap');
                    setBombPos(pos);
                  }}
                  title={`Vị trí ${pos + 1}`}
                >
                  {pos === bombPos ? <Bomb size={13} /> : ''}
                </button>
              );
            })}
          </div>
          <input
            type="range"
            min={0}
            max={waiting.deckCount}
            value={bombPos}
            aria-label="Vị trí đặt lại Mèo Nổ trong chồng bài"
            onChange={(e) => setBombPos(Number(e.target.value))}
          />
          <p className="center bomb-pos">
            {bombPos === 0 ? (
              <>
                <ArrowUp size={14} className="inline-icon" /> Trên cùng: người kế tiếp rút trúng lá này ngay!
              </>
            ) : bombPos === waiting.deckCount ? (
              <>
                <ArrowDown size={14} className="inline-icon" /> Dưới cùng
              </>
            ) : (
              `Lá thứ ${bombPos + 1} từ trên xuống`
            )}
          </p>
          <div className="seg">
            <button className={bombPos === 0 ? 'on' : ''} onClick={() => setBombPos(0)}>
              Trên cùng
            </button>
            <button onClick={() => setBombPos(Math.floor(Math.random() * (waiting.deckCount + 1)))}>Ngẫu nhiên</button>
            <button className={bombPos === waiting.deckCount ? 'on' : ''} onClick={() => setBombPos(waiting.deckCount)}>
              Dưới cùng
            </button>
          </div>
          <div className="modal-actions">
            <button className="primary big" onClick={() => emit('game:place', { position: bombPos })}>
              <Bomb size={17} /> Nhét vào
            </button>
          </div>
        </Modal>
      )}

      {wizardOpen && kind && canPlay && (
        <PlayWizard
          kind={kind}
          cards={selCards}
          targets={targets}
          discardTypes={fiveDiscardTypes}
          initialTarget={targetId}
          rules={rules}
          comboSwitch={
            !comboMode && rules.allowPair && rules.allowTriple && (kind === 'pair' || kind === 'triple') && selCards[0] && matchingComboIds(selCards[0].type).length >= 3
              ? (to) => {
                  const same = matchingComboIds(selCards[0].type);
                  setSelected(same.slice(0, to === 'triple' ? 3 : 2));
                }
              : undefined
          }
          onCancel={() => {
            setWizardOpen(false);
            setTargetId('');
            if (!comboMode) setSelected([]);
          }}
          onConfirm={send}
        />
      )}

      {giving && waiting?.kind === 'favor_give' && (
        <Modal title={<span className="modal-title-icon"><HandHeart size={19} /> {nameOf(waiting.toId)} xin bài bạn</span>} width={760}>
          <p>
            Chọn <b>1 lá</b> để đưa cho {nameOf(waiting.toId)}. Còn <b>{secs(waiting.deadline)}s</b>, hết giờ sẽ đưa ngẫu nhiên.
          </p>
          <div className="give-grid">
            {hand.map((c) => (
              <button key={c.id} className={`wiz-card${giveId === c.id ? ' on' : ''}`} onClick={() => setGiveId(c.id)}>
                <CardView type={c.type} seed={c.id} size="md" preview={false} />
                <span>{CARD_INFO[c.type].name}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="primary big"
              disabled={!giveId || !view.hand.some((c) => c.id === giveId)}
              onClick={() => {
                emit('game:give', { cardId: giveId });
                setGiveId(null);
              }}
            >
              Đưa lá này
            </button>
          </div>
        </Modal>
      )}

      {stealing && waiting?.kind === 'steal_pick' && (
        <Modal title={<span className="modal-title-icon"><Crosshair size={19} /> Cướp bài của {nameOf(waiting.targetId)}</span>} width={760}>
          <p>
            Bài của {nameOf(waiting.targetId)} đã được <b>úp xuống và xáo vị trí</b>: chọn <b>1 lá</b>, trúng lá ngon là của bạn! Còn{' '}
            <b>{secs(waiting.deadline)}s</b>, hết giờ sẽ bốc ngẫu nhiên.
          </p>
          <div className="give-grid steal-grid">
            {Array.from({ length: waiting.count }, (_, i) => (
              <button key={i} className={`wiz-card steal-card${stealIdx === i ? ' on' : ''}`} onClick={() => setStealIdx(i)} aria-label={`Lá úp số ${i + 1}`}>
                <CardBack />
                <span>Lá {i + 1}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="primary big"
              disabled={stealIdx === null || stealIdx >= waiting.count}
              onClick={() => {
                sfx('play');
                emit('game:steal', { index: stealIdx });
                setStealIdx(null);
              }}
            >
              <Crosshair size={16} /> Cướp lá này
            </button>
          </div>
        </Modal>
      )}

      {digging && waiting?.kind === 'dig_choice' && (
        <Modal title={<span className="modal-title-icon"><Layers size={19} /> Đào Sâu</span>} width={460}>
          <p>
            Bạn vừa rút lá này. Giữ nó, hoặc úp nó lại lên trên chồng bài và rút lá kế tiếp (<b>bắt buộc giữ</b> lá kế tiếp). Còn{' '}
            <b>{secs(waiting.deadline)}s</b>, hết giờ sẽ giữ lá này.
          </p>
          {waiting.card && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
              <CardView type={waiting.card.type} seed={waiting.card.id} size="lg" preview={false} />
            </div>
          )}
          <div className="modal-actions">
            <button className="secondary big" disabled={!waiting.canDig} onClick={() => emit('game:dig', { keep: false })}>
              Úp lại &amp; rút lá kế tiếp
            </button>
            <button className="primary big" onClick={() => emit('game:dig', { keep: true })}>
              Giữ lá này
            </button>
          </div>
        </Modal>
      )}

      {returning && waiting?.kind === 'return_card' && (
        <Modal
          title={<span className="modal-title-icon"><Layers size={19} /> {waiting.source === 'grave' ? 'Trộm Mộ' : 'Thu Gom Rác'}</span>}
          width={760}
        >
          <p>
            Chọn <b>1 lá</b> trên tay để xáo vào chồng bài rút. Còn <b>{secs(waiting.deadline)}s</b>, hết giờ sẽ chọn ngẫu nhiên.
          </p>
          <div className="give-grid">
            {view.hand.map((c) => (
              <button key={c.id} className={`wiz-card${returnId === c.id ? ' on' : ''}`} onClick={() => setReturnId(c.id)}>
                <CardView type={c.type} seed={c.id} size="md" preview={false} />
                <span>{CARD_INFO[c.type].name}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button
              className="primary big"
              disabled={!returnId || !view.hand.some((c) => c.id === returnId)}
              onClick={() => {
                emit('game:return', { cardId: returnId });
                setReturnId(null);
              }}
            >
              Xáo lá này vào chồng rút
            </button>
          </div>
        </Modal>
      )}

      {deadViewId && view.players.some((p) => p.id === deadViewId && p.revealed) && (
        <DeadHandModal player={view.players.find((p) => p.id === deadViewId)!} onClose={() => setDeadViewId(null)} />
      )}

      {kickAsk && (
        <Modal title={<span className="modal-title-icon"><UserX size={19} /> Kích {kickAsk.name} khỏi trận?</span>} width={420} onClose={() => setKickAsk(null)}>
          <p>
            Người chơi <b>{kickAsk.name}</b> sẽ bị loại khỏi ván hiện tại và buộc rời phòng ngay lập tức.
          </p>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setKickAsk(null)}>
              Huỷ
            </button>
            <button
              className="primary big danger"
              onClick={() => {
                emit('room:kick', { targetId: kickAsk.id });
                setKickAsk(null);
              }}
            >
              <UserX size={16} /> Kích ngay
            </button>
          </div>
        </Modal>
      )}

      {altering && waiting?.kind === 'alter_future' && (
        <Modal
          title={
            <span className="modal-title-icon">
              <Sparkles size={19} /> Sửa Tương Lai — Sắp xếp bài
            </span>
          }
          width={680}
        >
          <p>
            <b>Bấm 2 lá</b> để đổi chỗ cho nhau (hoặc kéo thả, bấm <b>◀ ▶</b>). Lá số <b>1</b> sẽ nằm <b>trên cùng</b> chồng bài rút. Còn{' '}
            <b>{secs(waiting.deadline)}s</b>, hết giờ sẽ giữ nguyên thứ tự.
          </p>
          <div className="alter-grid">
            {alterOrder.map((c, idx) => (
              <div
                key={c.id}
                className={`alter-item${dragIdx === idx ? ' dragging' : ''}${overIdx === idx && dragIdx !== idx ? ' drag-over' : ''}${pickIdx === idx ? ' picked' : ''}`}
                draggable
                role="button"
                tabIndex={0}
                aria-pressed={pickIdx === idx}
                onClick={() => tapAlterCard(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    tapAlterCard(idx);
                  }
                }}
                onDragStart={(e) => {
                  setDragIdx(idx);
                  setPickIdx(null);
                  e.dataTransfer.effectAllowed = 'move';
                  try {
                    e.dataTransfer.setData('text/plain', String(idx));
                  } catch {}
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (overIdx !== idx) setOverIdx(idx);
                }}
                onDragLeave={() => {
                  if (overIdx === idx) setOverIdx(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragIdx ?? Number(e.dataTransfer.getData('text/plain'));
                  if (!Number.isNaN(from) && from !== idx) {
                    moveAlterCard(from, idx);
                  }
                  setDragIdx(null);
                  setOverIdx(null);
                }}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
              >
                <div className="alter-pos-badge">
                  #{idx + 1} {idx === 0 ? '• Trên cùng' : idx === alterOrder.length - 1 ? '• Dưới cùng' : ''}
                </div>
                <div className="alter-card-wrap">
                  <CardView type={c.type} seed={c.id} size="xl" preview={false} />
                </div>
                <div className="alter-card-name">{CARD_INFO[c.type].name}</div>
                <div className="alter-move-btns" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="secondary small"
                    disabled={idx === 0}
                    onClick={() => {
                      setPickIdx(null);
                      moveAlterCard(idx, idx - 1);
                    }}
                    title="Đẩy lên trước"
                    aria-label="Đẩy lên trước"
                  >
                    ◀<span className="alter-btn-text"> Lên</span>
                  </button>
                  <button
                    type="button"
                    className="secondary small"
                    disabled={idx === alterOrder.length - 1}
                    onClick={() => {
                      setPickIdx(null);
                      moveAlterCard(idx, idx + 1);
                    }}
                    title="Đẩy ra sau"
                    aria-label="Đẩy ra sau"
                  >
                    <span className="alter-btn-text">Xuống </span>▶
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="modal-actions alter-actions">
            <button
              className="primary big"
              onClick={() => {
                sfx('play');
                setPickIdx(null);
                emit('game:alter', { cardIds: alterOrder.map((c) => c.id) });
              }}
            >
              <Sparkles size={17} /> Xác nhận thứ tự
            </button>
          </div>
        </Modal>
      )}

      {reveal && (
        <div className={`reveal ${reveal.kind}`} key={reveal.key} onClick={onCloseReveal}>
          <div className="reveal-box">
            <div className="reveal-title">
              {reveal.kind === 'lost' ? (
                <>
                  <TrendingDown size={22} className="inline-icon" /> Bạn bị lấy mất
                </>
              ) : (
                <>
                  <Sparkles size={22} className="inline-icon" /> Bạn nhận được
                </>
              )}
            </div>
            <div className="reveal-cards">
              {reveal.cards.map((t, i) => (
                <CardView key={i} type={t} seed={reveal.cardIds?.[i]} size="xl" preview={false} />
              ))}
            </div>
            <div className="reveal-text">{reveal.text}</div>
            <span className="muted small">Bấm để đóng</span>
          </div>
        </div>
      )}

      {notice && (
        <Modal title={<span className="modal-title-icon"><Eye size={19} /> Tương lai của chồng bài</span>} width={620} onClose={onCloseNotice}>
          <p className="muted">{notice.text}</p>
          <div className="future">
            {notice.cards.length ? (
              notice.cards.map((t, i) => (
                <div key={i} className="future-item" style={{ animationDelay: `${i * 0.12}s` }}>
                  <span className="future-pos">{i + 1}</span>
                  <CardView type={t} seed={notice.cardIds?.[i] ?? i} size="xl" />
                </div>
              ))
            ) : (
              <p>Chồng bài trống.</p>
            )}
          </div>
          <div className="modal-actions">
            <button className="primary big" onClick={onCloseNotice}>
              Đã xem
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
