'use strict';

// Lá sáng (ghép được) ở giao diện phải khớp đúng luật server chấp nhận.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_ROOM_RULES, canComboWith, comboGroupFor, detectPlayKind, canMatchComboCards } = require('../dist/shared/src/index.js');

const CATS = ['cat_potato', 'cat_melon', 'cat_bladder', 'cat_schrodinger', 'cat_beard'];
const OTHERS = ['feral_cat', 'clone', 'skip', 'nope', 'defuse', 'attack'];
const POOL = [...CATS, ...OTHERS];

function subsetsWith(hand, idx, size) {
  const rest = hand.filter((_, i) => i !== idx);
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === size - 1) return out.push([hand[idx], ...acc]);
    for (let i = start; i < rest.length; i++) pick(i + 1, [...acc, rest[i]]);
  };
  pick(0, []);
  return out;
}

function rand(seed) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

test('hai mèo thường khác loại không ghép đôi; cùng loại hoặc có Mèo Hoang thì được', () => {
  const r = DEFAULT_ROOM_RULES;
  assert.equal(detectPlayKind(['cat_potato', 'cat_melon'], r), null);
  assert.equal(detectPlayKind(['cat_potato', 'cat_potato'], r), 'pair');
  assert.equal(detectPlayKind(['cat_potato', 'feral_cat'], r), 'pair');
  assert.equal(detectPlayKind(['cat_potato', 'cat_melon', 'feral_cat'], r), null);
  const hand = [{ id: 'a', type: 'cat_potato' }, { id: 'b', type: 'cat_melon' }];
  assert.equal(canComboWith(hand, 'cat_potato', r), false, 'mèo lẻ phải mờ');
});

for (const scope of ['cats', 'any']) {
  for (const [allowPair, allowTriple] of [[true, true], [false, true], [true, false]]) {
    test(`lá sáng khớp luật server (comboScope=${scope}, đôi=${allowPair}, ba=${allowTriple})`, () => {
      const rules = { ...DEFAULT_ROOM_RULES, comboScope: scope, allowPair, allowTriple };
      const rnd = rand(scope.length * 7 + (allowPair ? 3 : 0) + (allowTriple ? 5 : 0));
      for (let n = 0; n < 400; n++) {
        const size = 2 + Math.floor(rnd() * 6);
        const hand = Array.from({ length: size }, (_, i) => ({ id: `c${i}`, type: POOL[Math.floor(rnd() * POOL.length)] }));
        hand.forEach((card, idx) => {
          const sizes = [allowPair && 2, allowTriple && 3].filter(Boolean);
          const serverOk = sizes.some((k) => subsetsWith(hand, idx, k).some((set) => {
            const kind = detectPlayKind(set.map((c) => c.type), rules);
            return kind === 'pair' || kind === 'triple';
          }));
          assert.equal(canComboWith(hand, card.type, rules), serverOk, `${card.type} trong [${hand.map((c) => c.type)}]`);
          if (serverOk) {
            const group = comboGroupFor(hand, card.type, rules);
            const k = allowPair && group.length >= 2 ? 2 : 3;
            const pick = [card, ...group.filter((c) => c.id !== card.id)].slice(0, k);
            assert.ok(canMatchComboCards(pick.map((c) => c.type), rules), `nhóm gợi ý hợp lệ cho ${card.type}`);
          }
        });
      }
    });
  }
}
