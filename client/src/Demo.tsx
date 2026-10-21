/**
 * Màn giả lập để thử giao diện, chỉ có khi chạy dev: http://localhost:5173/?demo=play
 * Các cảnh: play | myturn | defuse | future | favor | ended | dead | reveal | shuffle | explode | emote | watch
 * Phòng khác: lobby | lobby-watch | tl | tl-watch | bj | bj-watch (đuôi -watch = xem dưới góc nhìn khán giả)
 */
import { useEffect, useState } from 'react';
import {
  DEFAULT_ROOM_RULES, createStandard52Deck, detectTienLenCombo, evaluateBlackjackHand, sortTienLenHand,
  type Card, type CardType, type ChatMessage, type Emote, type GameFx, type PrivateNotice, type RoomView,
} from '../../shared/src';
import { RoomPlayerCountContext, RoomRulesContext } from './roomRulesContext';
import GameBoard from './components/GameBoard';
import Lobby from './components/Lobby';
import TienLenBoard from './components/TienLenBoard';
import BlackjackBoard from './components/BlackjackBoard';
import { CardPreviewLayer } from './components/CardPreview';
import { SettingsContext, useSettingsState } from './settings';

const NAMES = ['xuânho', 'dsa', 'aloalo', 'Minh', 'Lan Anh', 'Tuấn', 'Hùng', 'Thảo'];
const HAND: CardType[] = ['defuse', 'cat_melon', 'cat_melon', 'see_future', 'nope', 'skip', 'draw_bottom', 'shuffle', 'favor', 'cat_beard'];

export default function Demo() {
  const [saved] = useSettingsState();
  const qs = new URLSearchParams(location.search);
  const scene = qs.get('demo') || 'play';
  const n = Number(qs.get('n')) || 6;
  // ?theme=dark&style=vector để xem nhanh các kiểu
  const settings = {
    ...saved,
    theme: (qs.get('theme') as typeof saved.theme) ?? saved.theme,
    cardStyle: (qs.get('style') as typeof saved.cardStyle) ?? saved.cardStyle,
  };
  document.documentElement.dataset.theme = settings.theme;
  const [notice, setNotice] = useState<PrivateNotice | null>(
    scene === 'future' ? { kind: 'future', cards: ['exploding', 'nope', 'cat_potato'], text: '3 lá trên cùng (trái = trên cùng)' } : null,
  );
  const [reveal, setReveal] = useState<(PrivateNotice & { key: number }) | null>(
    scene === 'reveal' ? { kind: 'received', cards: ['defuse'], cardIds: ['r1'], text: 'Bạn lấy được Gỡ Bom từ dsa', key: 1 } : null,
  );
  const [fx, setFx] = useState<{ id: number; fx: GameFx } | null>(null);
  const [emote, setEmote] = useState<{ id: number; e: Emote } | null>(null);
  const t0 = Date.now() - 300_000;
  const [messages, setMessages] = useState<ChatMessage[]>(
    scene === 'nochat'
      ? []
      : [
          { id: 1, from: 'p1', name: 'dsa', text: 'Chào cả nhà 👋', at: t0 },
          { id: 2, from: 'p2', name: 'aloalo', text: 'ván này ai cầm Nope thì khai ra 😤', at: t0 + 20_000 },
          { id: 3, from: 'p2', name: 'aloalo', text: '🤡🤡', at: t0 + 30_000 },
          { id: 4, from: 'me', name: 'xuânho', text: 'không có đâu nha 🤫', at: t0 + 60_000 },
          { id: 5, from: 'p5', name: 'Tuấn', text: 'sắp nổ rồi kìa 😱', at: t0 + 90_000 },
        ],
  );
  const [typing, setTyping] = useState<Record<string, number>>({});
  const chat = {
    messages,
    typing,
    send: (text: string) => {
      setMessages((m) => [...m, { id: Date.now(), from: 'me', name: 'xuânho', text, at: Date.now() }]);
      setTimeout(() => setTyping({ p1: Date.now() + 3000 }), 400);
      setTimeout(() => {
        setTyping({});
        setMessages((m) => [...m, { id: Date.now(), from: 'p1', name: 'dsa', text: 'nói xạo 😏', at: Date.now() }]);
      }, 1800);
    },
    onTyping: () => {},
  };
  // ?chat=flood: người khác chat liên tục (thử tự cuộn); ?chat=flood-up: đang kéo lên xem tin cũ thì không bị giật xuống
  useEffect(() => {
    const mode = qs.get('chat');
    if (!mode?.startsWith('flood')) return;
    const lines = ['ai cầm Nope?', 'sắp nổ rồi 😱', '🔥🔥🔥', 'đánh nhanh lên nào', 'tui còn 1 Gỡ Bom thôi', 'GG', 'ván này căng quá', '😂', 'xáo bài đi', 'Nope nè!'];
    const timers: number[] = [];
    if (mode === 'flood-up') timers.push(window.setTimeout(() => { const el = document.querySelector('.chat-list'); if (el) el.scrollTop = 0; }, 2600));
    lines.forEach((text, i) => timers.push(window.setTimeout(() => {
      setMessages((m) => [...m, { id: 1000 + i, from: i % 2 ? 'p1' : 'p2', name: i % 2 ? 'dsa' : 'aloalo', text, at: Date.now() }]);
    }, 1200 + i * 250)));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (scene !== 'emote') return;
    const seq: Emote[] = [
      { from: 'p1', emoji: '😂' },
      { from: 'p2', emoji: '🍅', to: 'me' },
      { from: 'p5', emoji: '🤡' },
    ];
    seq.forEach((e, i) => setTimeout(() => setEmote({ id: 100 + i, e }), 500 + i * 300));
  }, [scene]);
  useEffect(() => {
    const seq: GameFx[] =
      scene === 'shuffle'
        ? [{ type: 'shuffle', playerId: 'p2', style: (qs.get('sh') as 'riffle' | 'overhand' | 'pile') || 'riffle' }]
        : scene === 'explode'
          ? [{ type: 'draw', playerId: 'p2' }, { type: 'explode', playerId: 'p2' }]
          : scene === 'reveal'
            ? [{ type: 'transfer', from: 'p1', to: 'me', via: 'pair' }]
            : [];
    seq.forEach((f, i) => setTimeout(() => setFx({ id: i + 1, fx: f }), 600 + i * 500));
  }, [scene]);
  const now = Date.now();
  const players = NAMES.slice(0, n).map((name, i) => ({
    id: i === 0 ? 'me' : `p${i}`,
    avatar: i === 0 ? qs.get('av') || undefined : undefined,
    name,
    connected: i !== 4,
    alive: scene === 'dead' ? i !== 0 : i !== 3,
    handCount: i === 0 ? HAND.length : 4 + ((i * 3) % 5),
    // người đã nổ: bài lật ngửa cho cả bàn xem
    revealed: (scene === 'dead' ? i === 0 : i === 3) ? HAND.slice(0, 7).map((type, k) => ({ id: `rv${i}-${k}`, type })) : undefined,
  }));
  const hand: Card[] = HAND.map((type, i) => ({ id: `h${i}`, type }));
  const myTurn = ['myturn', 'defuse', 'future', 'shuffle'].includes(scene);
  const view: RoomView = {
    code: 'DEMO',
    gameMode: 'exploding_kittens',
    rules: DEFAULT_ROOM_RULES,
    rulesVersion: 1,
    phase: scene === 'ended' ? 'ended' : 'playing',
    hostId: 'me',
    players,
    spectators:
      scene === 'watch'
        ? [{ id: 'w0', name: 'Khán giả Lan', connected: true }, { id: 'w1', name: 'Bảo', connected: true }, { id: 'w2', name: 'Khoa', connected: false }]
        : [],
    hand: scene === 'dead' ? [] : hand,
    currentPlayerId: myTurn ? 'me' : 'p2',
    turnsRemaining: 1,
    turnDeadline: now + 63_000,
    deckCount: 31,
    discardTop: 'shuffle',
    discardTypes: ['shuffle', 'nope', 'skip'],
    pending: scene === 'play' ? { kind: 'pair', actorId: 'p2', targetId: 'me', cards: ['cat_bladder', 'cat_bladder'], nopeCount: 1, deadline: now + 2800 } : undefined,
    lastPlay:
      scene === 'myturn' || scene === 'defuse'
        ? { id: 2, kind: 'shuffle', actorId: 'p5', cards: ['shuffle'], cardIds: ['d9'], nopers: [], nopeCardIds: [], result: 'done' }
        : { id: 1, kind: 'pair', actorId: 'p2', targetId: 'me', cards: ['cat_bladder', 'cat_bladder'], cardIds: ['d1', 'd2'], nopers: ['p1'], nopeCardIds: ['d3'], result: scene === 'play' ? undefined : 'noped' },
    waiting:
      scene === 'defuse'
        ? { kind: 'defuse_place', playerId: 'me', deckCount: 31, deadline: now + 24_000 }
        : scene === 'favor'
          ? { kind: 'favor_give', playerId: 'me', toId: 'p1', deadline: now + 21_000 }
          : scene === 'dig'
            ? { kind: 'dig_choice', playerId: 'me', card: { id: 'dg1', type: 'exploding' }, canDig: true, deadline: now + 21_000 }
          : scene === 'return'
            ? { kind: 'return_card', playerId: 'p1', source: 'garbage', pendingIds: ['me', 'p2'], deadline: now + 21_000 }
          : scene === 'bury'
            ? { kind: 'defuse_place', playerId: 'me', deckCount: 31, deadline: now + 21_000, bury: true }
          : scene === 'steal'
            ? { kind: 'steal_pick', playerId: 'me', targetId: 'p1', via: 'mark', count: 7, deadline: now + 21_000 }
          : scene === 'alter'
            ? { kind: 'alter_future', playerId: 'me', count: 3, cards: [{ id: 'af1', type: 'exploding' }, { id: 'af2', type: 'nope' }, { id: 'af3', type: 'cat_potato' }], deadline: now + 21_000 }
            : undefined,
    winnerId: scene === 'ended' ? 'me' : undefined,
    logTotal: 5,
    bet: 100,
    pot: 600,
    log: ['Bắt đầu! 6 người, 5 Mèo Nổ trong chồng bài.', 'Tuấn đánh Xáo Bài.', '💥 Minh rút trúng Mèo Nổ và NỔ TUNG!', 'aloalo đánh đôi mèo, rút bài của xuânho.', 'dsa NOPE!'],
  };
  // ---------- phòng chờ / Tiến Lên / Xì Dách ----------
  const watch = scene.endsWith('-watch');
  const meId = watch || scene === 'watch' ? 'w0' : 'me';
  const spectators = watch || scene === 'watch'
    ? [{ id: 'w0', name: 'Khán giả Lan', connected: true }, { id: 'w1', name: 'Bảo', connected: true }, { id: 'w2', name: 'Khoa', connected: false }]
    : [{ id: 'w1', name: 'Bảo', connected: true }];
  const base = scene.replace(/-watch$/, '');
  let other: RoomView | null = null;
  if (base === 'lobby' || base === 'tl' || base === 'bj') {
    const count = base === 'tl' ? 4 : base === 'lobby' ? 4 : 5;
    const ps = NAMES.slice(0, count).map((name, i) => ({ id: i === 0 ? 'me' : `p${i}`, name, connected: true, alive: true, ready: i % 2 === 0, handCount: 0, coins: 1200 }));
    const deck = createStandard52Deck();
    other = { ...view, spectators, players: ps, hand: [], pending: undefined, lastPlay: undefined, waiting: undefined, winnerId: undefined };
    if (base === 'lobby') other = { ...other, phase: 'lobby', currentPlayerId: undefined };
    if (base === 'tl') {
      const hands = ps.map((_, i) => sortTienLenHand(deck.slice(i * 13, i * 13 + 13)));
      const table = detectTienLenCombo(hands[2].slice(0, 1));
      other = {
        ...other, gameMode: 'tien_len', currentPlayerId: watch ? 'p1' : 'me',
        players: ps.map((p, i) => ({ ...p, handCount: i === 2 ? 12 : 13 })),
        tienLen: { hand: watch ? [] : hands[0], tableCombo: table ?? undefined, lastActorId: 'p2', passedIds: [], firstTurnOfMatch: false, finishOrder: [] },
      };
    }
    if (base === 'bj') {
      const hands = ps.map((_, i) => deck.slice(i * 3, i * 3 + 2));
      other = {
        ...other, gameMode: 'blackjack_21', currentPlayerId: watch ? 'p1' : 'me',
        players: ps.map((p) => ({ ...p, handCount: 2 })),
        blackjack: {
          dealerId: 'p4', deckCount: 40, hand: watch ? [] : hands[0], myEval: evaluateBlackjackHand(watch ? [] : hands[0]),
          players: ps.map((p, i) => ({ playerId: p.id, isDealer: p.id === 'p4', status: 'playing', handCount: 2, betAmount: 100, cards: !watch && i === 0 ? hands[0] : undefined })),
        },
      };
    }
  }
  const emitDemo = (e: string, p?: unknown) => console.log('[demo emit]', e, p);
  if (other) {
    return (
      <SettingsContext.Provider value={settings}>
        <RoomRulesContext.Provider value={other.rules}>
        <RoomPlayerCountContext.Provider value={other.players.length}>
        <div className="app">
          {base === 'lobby' ? <Lobby view={other} meId={meId} emit={emitDemo} chat={chat} />
            : base === 'tl' ? <TienLenBoard view={other} meId={meId} emit={emitDemo} emote={emote} chat={chat} dock={null} />
            : <BlackjackBoard view={other} meId={meId} emit={emitDemo} emote={emote} chat={chat} dock={null} />}
          <CardPreviewLayer />
        </div>
        </RoomPlayerCountContext.Provider>
        </RoomRulesContext.Provider>
      </SettingsContext.Provider>
    );
  }

  return (
    <SettingsContext.Provider value={settings}>
      <RoomRulesContext.Provider value={view.rules}>
      <RoomPlayerCountContext.Provider value={view.players.length}>
      <div className="app">
        <GameBoard view={view} meId={meId} emit={(e, p) => {
            console.log('[demo emit]', e, p);
            if (e === 'room:emote') setEmote({ id: Date.now(), e: { from: 'me', ...(p as { emoji: string; to?: string }) } });
          }} notice={notice} onCloseNotice={() => setNotice(null)} reveal={reveal} onCloseReveal={() => setReveal(null)} fx={fx} emote={emote} chat={chat} />
        <CardPreviewLayer />
      </div>
      </RoomPlayerCountContext.Provider>
      </RoomRulesContext.Provider>
    </SettingsContext.Provider>
  );
}
