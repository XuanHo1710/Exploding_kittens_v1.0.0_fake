'use strict';

// Lô Tô Cân Đồ: sinh cặp tờ đủ 90 số, máy gọi số, KINH theo hàng ngang, chia hũ, cược theo số tờ.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../dist/shared/src/index.js');
const { Game } = require('../dist/server/src/game/game.js');

const { LOTO_ROWS, LOTO_COLS, LOTO_PER_ROW, LOTO_MAX, generateLotoPair, lotoColOf } = S;

const hooks = () => ({ changed() {}, removed() {}, fx() {}, notify() {}, antsFrame() {}, linkState() {} });

function lotoGame(n = 2) {
  const g = new Game('LOTO', hooks(), {}, 'loto');
  for (let i = 0; i < n; i++) g.addPlayer(`p${i}`, `Người ${i}`);
  for (let i = 1; i < n; i++) g.setReady(`p${i}`, true, g.rulesVersion);
  return g;
}

test('cặp tờ: đủ 1–90 mỗi số 1 lần, mỗi hàng 5 số, đúng cột theo chục, mỗi tờ 45 số, cột trong khối tăng dần', () => {
  for (let k = 0; k < 300; k++) {
    const pair = generateLotoPair();
    const all = [];
    for (const sheet of pair) {
      assert.equal(sheet.length, LOTO_ROWS);
      let count = 0;
      for (const row of sheet) {
        assert.equal(row.length, LOTO_COLS);
        assert.equal(row.filter((x) => x > 0).length, LOTO_PER_ROW);
        row.forEach((x, c) => {
          if (x > 0) assert.equal(lotoColOf(x), c, `số ${x} phải nằm cột ${lotoColOf(x)}`);
        });
        count += 5;
        all.push(...row.filter((x) => x > 0));
      }
      assert.equal(count, 45);
      for (let b = 0; b < LOTO_ROWS; b += 3) {
        for (let c = 0; c < LOTO_COLS; c++) {
          const vals = [b, b + 1, b + 2].map((r) => sheet[r][c]).filter((x) => x > 0);
          assert.deepEqual(vals, [...vals].sort((x, y) => x - y));
        }
      }
    }
    assert.deepEqual(all.sort((x, y) => x - y), Array.from({ length: LOTO_MAX }, (_, i) => i + 1));
  }
});

test('phòng chờ: mỗi người tự chọn 1 hoặc 2 tờ, cược 50 xu/tờ', () => {
  const g = lotoGame(2);
  assert.equal(g.stakeOf('p0'), 50);
  g.setLotoPick('p1', 2);
  assert.equal(g.stakeOf('p1'), 100);
  assert.equal(g.viewFor('p0').loto.picks.p1, 2);
  g.setLotoPick('p1', 7);
  assert.equal(g.stakeOf('p1'), 50, 'số lạ thì về 1 tờ');
  g.dispose();
});

test('ván Lô Tô: phát đúng số tờ, mỗi người chỉ thấy tờ của mình; gọi số cho tới khi có người KINH theo hàng ngang', () => {
  const g = lotoGame(3);
  g.setLotoPick('p0', 2);
  g.pot = 200;
  g.start('p0');
  try {
    assert.equal(g.phase, 'playing');
    const v0 = g.viewFor('p0').loto;
    assert.equal(v0.mine.length, 2);
    assert.equal(g.viewFor('p1').loto.mine.length, 1);
    assert.notEqual(v0.mine[0].color, v0.mine[1].color, '2 tờ khác màu');
    // 2 tờ của p0 chứa đủ 90 số
    assert.equal(new Set(v0.mine.flatMap((s) => s.rows.flat()).filter((x) => x > 0)).size, 90);
    let guard = 0;
    while (g.phase === 'playing' && guard++ < 100) g.lotoCall();
    assert.equal(g.phase, 'ended');
    const view = g.viewFor('p1').loto;
    assert.ok(view.wins.length >= 1);
    const called = new Set(view.called);
    const last = view.called.at(-1);
    for (const w of view.wins) {
      assert.equal(w.numbers.length, 5);
      assert.ok(w.numbers.every((x) => called.has(x)), 'hàng thắng đủ 5 số đã gọi');
      assert.ok(w.numbers.includes(last), 'KINH đúng ở số vừa gọi');
    }
    // trước số cuối chưa ai có hàng đủ 5
    const before = new Set(view.called.slice(0, -1));
    for (const p of ['p0', 'p1', 'p2']) {
      for (const sheet of g.viewFor(p).loto.mine) for (const row of sheet.rows) assert.ok(S.lotoRowHits(row, before) < 5);
    }
    const winners = [...new Set(view.wins.map((w) => w.playerId))];
    assert.deepEqual(g.winners().sort(), winners.sort());
    if (winners.length > 1) assert.equal(Object.values(g.payouts).reduce((a, b) => a + b, 0), 200, 'chia đủ hũ');
  } finally {
    g.dispose();
  }
});

test('người đã rời ván không được tính KINH', () => {
  const g = lotoGame(2);
  g.start('p0');
  try {
    g.players.find((p) => p.id === 'p1').left = true;
    let guard = 0;
    while (g.phase === 'playing' && guard++ < 100) g.lotoCall();
    assert.ok(g.viewFor('p0').loto.wins.every((w) => w.playerId === 'p0'));
  } finally {
    g.dispose();
  }
});
