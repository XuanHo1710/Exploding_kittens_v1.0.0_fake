'use strict';

// Lá sáng trong Tiến Lên phải đúng bằng tập lá nằm trong một bộ đánh hợp lệ (đối chiếu thử mọi tổ hợp).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStandard52Deck, detectTienLenCombo, canBeatTienLenCombo, tienLenPlayableIds } = require('../dist/shared/src/index.js');

function rand(seed) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

test('tienLenPlayableIds khớp với thử mọi tổ hợp lá (bàn trống, có bài trên bàn, lượt mở màn)', () => {
  const rnd = rand(42);
  for (let trial = 0; trial < 300; trial++) {
    const deck = createStandard52Deck().sort(() => rnd() - 0.5);
    const hand = deck.slice(0, 9);
    let table;
    if (trial % 3) {
      for (let k = 0; k < 30 && !table; k++) {
        const size = 1 + Math.floor(rnd() * 4);
        const start = 9 + Math.floor(rnd() * 30);
        table = detectTienLenCombo(deck.slice(start, start + size)) ?? undefined;
      }
    }
    const mustInclude = trial % 7 === 0 ? hand[Math.floor(rnd() * hand.length)].code : undefined;
    const expected = new Set();
    for (let mask = 1; mask < 1 << hand.length; mask++) {
      const cards = hand.filter((_, i) => mask & (1 << i));
      if (mustInclude && !cards.some((c) => c.code === mustInclude)) continue;
      const combo = detectTienLenCombo(cards);
      if (combo && canBeatTienLenCombo(table, combo).ok) cards.forEach((c) => expected.add(c.id));
    }
    const got = tienLenPlayableIds(hand, table, mustInclude);
    assert.deepEqual([...got].sort(), [...expected].sort(), `bàn: ${table?.labelVi ?? 'trống'}; tay: ${hand.map((c) => c.code).join(' ')}`);
  }
});
