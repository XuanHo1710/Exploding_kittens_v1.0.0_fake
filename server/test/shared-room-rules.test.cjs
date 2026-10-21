const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_ROOM_RULES, RULE_PRESETS, normalizeRoomRules, roomDeckSummary, detectPlayKind, describeCard,
} = require('../dist/shared/src/index.js');

test('all presets deal a valid game at every advertised player count', () => {
  for (const preset of RULE_PRESETS) {
    const rules = normalizeRoomRules(preset.rules);
    for (let n = 2; n <= rules.maxPlayers; n++) {
      const deck = roomDeckSummary(rules, n);
      assert.equal(deck.canStart, true, `${preset.id}: ${n} players: ${deck.errors}`);
      assert.equal(deck.dealtCards + deck.drawPileCards, deck.totalCards);
      assert.ok(deck.bombs >= n - 1);
    }
  }
});

test('partial rules and counts use isolated defaults without modifying other rooms/presets', () => {
  const a = normalizeRoomRules({ cardCounts: { skip: 1 }, handSize: 3 });
  const b = normalizeRoomRules();
  a.cardCounts.attack = 0;
  assert.equal(b.cardCounts.attack, DEFAULT_ROOM_RULES.cardCounts.attack);
  assert.equal(a.cardCounts.skip, 1);
  assert.equal(b.handSize, 7);
  assert.equal(DEFAULT_ROOM_RULES.cardCounts.skip, 8);
});

test('untrusted rule payloads cannot bypass numeric/type/deck limits', () => {
  for (const invalid of [
    null, [], false, 'rules', { unknown: true }, { handSize: '7' }, { handSize: 1.5 }, { turnSeconds: NaN },
    { futureCount: Infinity }, { maxPlayers: 11 }, { allowPair: 'false' }, { nopeChain: 0 },
    { bombMode: 'none' }, { cardCounts: [] }, { cardCounts: { exploding: 10 } },
    { cardCounts: { skip: -1 } }, { cardCounts: { attack: 41 } },
    { cardCounts: Object.fromEntries(Object.keys(DEFAULT_ROOM_RULES.cardCounts).map((type) => [type, 40])) },
  ]) assert.throws(() => normalizeRoomRules(invalid));
});

test('invalid deck capacity and too few fixed bombs prevent a start without silently changing rules', () => {
  const small = normalizeRoomRules({ handSize: 12, cardCounts: Object.fromEntries(Object.keys(DEFAULT_ROOM_RULES.cardCounts).map((type) => [type, 0])) });
  const insufficient = roomDeckSummary(small, 2);
  assert.equal(insufficient.canStart, false);
  assert.match(insufficient.errors.join(), /Thiếu 24/);
  const fixed = normalizeRoomRules({ bombMode: 'fixed', fixedBombs: 1 });
  assert.equal(roomDeckSummary(fixed, 2).canStart, true);
  assert.equal(roomDeckSummary(fixed, 3).canStart, false);
  assert.equal(fixed.fixedBombs, 1);
});

test('shared play detector respects disabled combos, scope and protected bombs', () => {
  const rules = normalizeRoomRules({ allowPair: false, allowTriple: true, allowFive: false, comboScope: 'any' });
  assert.equal(detectPlayKind(['skip', 'skip'], rules), null);
  assert.equal(detectPlayKind(['defuse', 'defuse', 'defuse'], rules), 'triple');
  assert.equal(detectPlayKind(['cat_beard', 'cat_beard', 'cat_beard'], rules), 'triple');
  assert.equal(detectPlayKind(['skip', 'favor', 'shuffle', 'nope', 'defuse'], rules), null);
  assert.equal(detectPlayKind(['exploding', 'exploding', 'exploding'], rules), null);
  assert.equal(detectPlayKind(['skip'], rules), 'skip');
  assert.equal(detectPlayKind(['nope'], rules), null);
});

test('card explanations follow customized effects and disabled combos', () => {
  const rules = normalizeRoomRules({ futureCount: 5, nopeChain: false, nopeSeconds: 2, bombPlacement: 'random', attackMode: 'replace', allowPair: false, allowTriple: false, allowFive: false });
  assert.match(describeCard('see_future', rules), /5 lá/);
  assert.match(describeCard('nope', rules), /2 giây/);
  assert.match(describeCard('nope', rules), /Không được Nope lại/);
  // Chữ in trên lá Tấn Công: người kế tiếp chơi 2 lượt; cộng dồn chỉ khi phòng bật
  assert.match(describeCard('attack', rules), /chơi 2 lượt\.$/);
  assert.doesNotMatch(describeCard('attack', rules), /cộng thêm/);
  assert.match(describeCard('attack', normalizeRoomRules({ attackMode: 'stack' })), /cộng thêm số lượt bạn đang nợ/);
  assert.match(describeCard('defuse', rules), /ngẫu nhiên/);
  assert.match(describeCard('cat_beard', rules), /tắt các combo/);
});
