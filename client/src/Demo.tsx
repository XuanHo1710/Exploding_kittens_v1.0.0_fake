/**
 * Màn giả lập để thử giao diện, chỉ có khi chạy dev: http://localhost:5173/?demo=play
 * Các cảnh: play | myturn | defuse | future | favor | ended | dead | reveal | shuffle | explode | emote
 */
import { useEffect, useState } from 'react';
import type { Card, CardType, ChatMessage, Emote, GameFx, PrivateNotice, RoomView } from '../../shared/src';
import GameBoard from './components/GameBoard';
import { CardPreviewLayer } from './components/CardPreview';
import { SettingsContext, useSettingsState } from './settings';

const NAMES = ['xuânho', 'dsa', 'aloalo', 'Minh', 'Lan Anh', 'Tuấn', 'Hùng', 'Thảo'];
const HAND: CardType[] = ['defuse', 'cat_melon', 'cat_melon', 'see_future', 'nope', 'skip', 'shuffle', 'favor', 'cat_beard'];

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
        ? [{ type: 'shuffle', playerId: 'p2' }]
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
    name,
    connected: i !== 4,
    alive: scene === 'dead' ? i !== 0 : i !== 3,
    handCount: i === 0 ? HAND.length : 4 + ((i * 3) % 5),
  }));
  const hand: Card[] = HAND.map((type, i) => ({ id: `h${i}`, type }));
  const myTurn = ['myturn', 'defuse', 'future', 'shuffle'].includes(scene);
  const view: RoomView = {
    code: 'DEMO',
    phase: scene === 'ended' ? 'ended' : 'playing',
    hostId: 'me',
    players,
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
          : undefined,
    winnerId: scene === 'ended' ? 'me' : undefined,
    logTotal: 5,
    log: ['Bắt đầu! 6 người, 5 Mèo Nổ trong chồng bài.', 'Tuấn đánh Xáo Bài.', '💥 Minh rút trúng Mèo Nổ và NỔ TUNG!', 'aloalo đánh đôi mèo, rút bài của xuânho.', 'dsa NOPE!'],
  };
  return (
    <SettingsContext.Provider value={settings}>
      <div className="app">
        <header className="topbar">
          <span className="logo">💣 Mèo Nổ</span>
          <span className="room-tag">Demo: {scene}</span>
        </header>
        <GameBoard view={view} meId="me" emit={(e, p) => {
            console.log('[demo emit]', e, p);
            if (e === 'room:emote') setEmote({ id: Date.now(), e: { from: 'me', ...(p as { emoji: string; to?: string }) } });
          }} notice={notice} onCloseNotice={() => setNotice(null)} reveal={reveal} onCloseReveal={() => setReveal(null)} fx={fx} emote={emote} chat={chat} />
        <CardPreviewLayer />
      </div>
    </SettingsContext.Provider>
  );
}
