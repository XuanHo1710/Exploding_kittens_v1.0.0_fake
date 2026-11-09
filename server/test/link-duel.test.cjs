'use strict';

// Nối Thú Đại Chiến: bàn nối hình, luật trận 2 màn + boss, máy chơi. Chạy bằng đồng hồ giả (tick).
const test = require('node:test');
const assert = require('node:assert/strict');
const { LinkBoard } = require('../dist/server/src/game/link/board.js');
const { LinkDuel } = require('../dist/server/src/game/link/duel.js');
const S = require('../dist/shared/src/index.js');

const { LINK_W, LINK_H, LINK_CELLS, LINK_KINDS } = S;
const at = (x, y) => y * LINK_W + x;
/** Bàn trống với các ô chỉ định: { idx: kind } */
function boardOf(map) {
  const b = LinkBoard.generate(1);
  b.cells.fill(-1);
  b.ice.clear();
  for (const [i, k] of Object.entries(map)) b.cells[Number(i)] = k;
  return b;
}
/** Lấp mọi ô trống bằng loại 35 (vật cản) */
function fillRest(b) {
  for (let i = 0; i < LINK_CELLS; i++) if (b.cells[i] < 0) b.cells[i] = 35;
}
const turns = (path) => path.length - 2;

test('tìm đường: thẳng, chữ L, chữ Z, vòng ra mép bàn; 3 lần rẽ thì không nối được', () => {
  // thẳng hàng, ở giữa trống
  let b = boardOf({ [at(2, 4)]: 0, [at(9, 4)]: 0 });
  assert.equal(turns(b.findPath(at(2, 4), at(9, 4), 0)), 0);

  // chữ L: cần đúng 1 lần rẽ
  b = boardOf({ [at(2, 2)]: 1, [at(6, 5)]: 1 });
  const L = b.findPath(at(2, 2), at(6, 5), 0);
  assert.ok(L && turns(L) <= 1);

  // vòng ra mép trên: 2 ô ở hàng 0, giữa bị chặn
  b = boardOf({});
  fillRest(b);
  b.cells[at(3, 0)] = 2;
  b.cells[at(8, 0)] = 2;
  const U = b.findPath(at(3, 0), at(8, 0), 0);
  assert.ok(U, 'đi vòng qua viền trên');
  assert.equal(turns(U), 2);
  assert.ok(U.some(([, y]) => y === -1), 'đường đi qua viền');

  // khác loại thì không nối
  b = boardOf({ [at(2, 4)]: 0, [at(3, 4)]: 1 });
  assert.equal(b.findPath(at(2, 4), at(3, 4), 0), null);

  // bị bao kín: cần ≥ 3 lần rẽ hoặc không có đường
  b = boardOf({ [at(5, 4)]: 3, [at(10, 6)]: 3 });
  fillRest(b);
  b.cells[at(5, 4)] = 3;
  b.cells[at(10, 6)] = 3;
  assert.equal(b.findPath(at(5, 4), at(10, 6), 0), null);

  // cạnh nhau: luôn nối được
  b = boardOf({ [at(5, 4)]: 4, [at(6, 4)]: 4 });
  fillRest(b);
  b.cells[at(5, 4)] = 4;
  b.cells[at(6, 4)] = 4;
  assert.ok(b.findPath(at(5, 4), at(6, 4), 0));

  // hình chữ Z cần 3 lần rẽ: hai ô ở hai "hộp" khác nhau
  b = boardOf({});
  fillRest(b);
  // mở hành lang: (2,2) → xuống (2,6) → phải (8,6) → lên (8,3) → phải (12,3)   = 3 lần rẽ
  for (let y = 2; y <= 6; y++) b.cells[at(2, y)] = -1;
  for (let x = 2; x <= 8; x++) b.cells[at(x, 6)] = -1;
  for (let y = 3; y <= 6; y++) b.cells[at(8, y)] = -1;
  for (let x = 8; x <= 12; x++) b.cells[at(x, 3)] = -1;
  b.cells[at(2, 2)] = 5;
  b.cells[at(12, 3)] = 5;
  assert.equal(b.findPath(at(2, 2), at(12, 3), 0), null, '3 lần rẽ là không được');
});

test('sinh bàn (80 seed): đủ 144 ô, mỗi loại 4 ô, luôn có nước đi và giải được hết', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const b = LinkBoard.generate(seed);
    const count = new Map();
    for (const k of b.cells) count.set(k, (count.get(k) ?? 0) + 1);
    assert.equal(count.get(-1) ?? 0, 0);
    assert.equal(count.size, LINK_KINDS);
    for (const n of count.values()) assert.equal(n, 4);
    assert.ok(b.hasMove(0));
  }
  // giải trọn 20 bàn bằng gợi ý (+ tự xáo nếu kẹt)
  for (let seed = 1; seed <= 20; seed++) {
    const b = LinkBoard.generate(seed * 7919);
    let guard = 0;
    while (!b.isEmpty() && guard++ < 200) {
      const h = b.hint(0);
      assert.ok(h, `seed ${seed}: còn nước đi`);
      b.remove(h[0], h[1]);
      b.ensureMove(0);
    }
    assert.ok(b.isEmpty());
  }
});

test('cùng seed thì 2 bàn giống hệt', () => {
  const a = LinkBoard.generate(424242);
  const b = LinkBoard.generate(424242);
  assert.deepEqual([...a.cells], [...b.cells]);
  assert.notDeepEqual([...a.cells], [...LinkBoard.generate(424243).cells]);
});

test('hết nước đi thì tự xáo cho tới khi có nước', () => {
  // bàn kín, loại thú = (x + 4y) mod 36: mỗi loại 4 ô, không cặp nào nối được (đã kiểm chứng)
  const b = boardOf({});
  for (let y = 0; y < LINK_H; y++) for (let x = 0; x < LINK_W; x++) b.cells[at(x, y)] = (x + 4 * y) % 36;
  assert.equal(b.hint(0), undefined, 'bàn đang kẹt');
  const before = [...b.cells].sort((p, q) => p - q);
  assert.equal(b.ensureMove(0), true, 'đã phải xáo');
  assert.ok(b.hasMove(0), 'sau khi xáo có nước đi');
  assert.deepEqual([...b.cells].sort((p, q) => p - q), before, 'vẫn đúng các loại thú cũ');
  // bàn chỉ kẹt vì băng: không xáo, chờ băng tan
  const c = boardOf({ [at(3, 3)]: 6, [at(4, 3)]: 6 });
  c.ice.set(at(3, 3), 5000);
  assert.equal(c.hasMove(0), false);
  assert.equal(c.ensureMove(0), false);
  assert.equal(c.hasMove(6000), true);
});


// ---------------- trận đấu ----------------

function duel({ bot = false, level = 'normal', seed = 777, n = 2 } = {}) {
  const ev = { changed: 0, state: 0 };
  const names = ['An', bot ? 'Máy' : 'Bình', 'Chi', 'Dũng', 'Em', 'Giang', 'Hà', 'Khoa', 'Lan', 'Minh', 'Nam'];
  const d = new LinkDuel(
    names.slice(0, n).map((name, i) => ({ id: `p${i}`, name, bot: i === 1 && bot })),
    { botLevel: level },
    { changed: () => ev.changed++, state: () => ev.state++ },
    seed,
  );
  return { d, ev, p0: d.players[0], p1: d.players[1] };
}
const steps = (d, ms) => { for (let x = 0; x < ms; x += 250) d.tick(250); };
/** 2 ô khác loại */
function wrongPair(b) {
  const a = b.cells.findIndex((k) => k >= 0);
  const c = b.cells.findIndex((k) => k >= 0 && k !== b.cells[a]);
  return [a, c];
}
/** Nối cặp gợi ý, trả về lỗi (nếu có) */
const play = (d, p) => {
  const h = p.board.hint(d.t);
  return d.command(p.id, { t: 'match', a: h[0], b: h[1] });
};
function toStage2(d) {
  d['endStage1']();
  steps(d, S.LINK_INTERMISSION_S * 1000);
  assert.equal(d.stage, 'stage2');
}

test('cùng seed: 2 người cùng một đề bài', () => {
  const { p0, p1 } = duel();
  assert.deepEqual([...p0.board.cells], [...p1.board.cells]);
});

test('nối sai (khác loại / ô băng): báo lỗi, mất combo, bàn không đổi', () => {
  const { d, p0 } = duel();
  assert.equal(play(d, p0), undefined);
  assert.equal(p0.chain, 1);
  const before = [...p0.board.cells];
  const [a, b] = wrongPair(p0.board);
  assert.equal(d.command('p0', { t: 'match', a, b }), 'Hai ô này không nối được.');
  assert.equal(p0.chain, 0);
  assert.deepEqual([...p0.board.cells], before);
  const h = p0.board.hint(d.t);
  p0.board.ice.set(h[0], d.t + 5000);
  assert.equal(d.command('p0', { t: 'match', a: h[0], b: h[1] }), 'Hai ô này không nối được.');
  assert.equal(d.command('p0', { t: 'match', a: -1, b: 999 }), 'Lệnh không hợp lệ.');
  assert.equal(d.command('khach', { t: 'hint' }), 'Bạn đang xem trận này.');
});

test('combo: 3 cặp liên tiếp được 10 + 15 + 20 điểm, quá 3 giây thì mất combo', () => {
  const { d, p0 } = duel();
  for (let i = 0; i < 3; i++) {
    assert.equal(play(d, p0), undefined);
    steps(d, 500);
  }
  assert.equal(p0.score1, 10 + 15 + 20);
  assert.equal(p0.chain, 3);
  assert.ok(p0.thunder > 0);
  steps(d, 3250);
  assert.equal(p0.chain, 0);
  play(d, p0);
  assert.equal(p0.score1, 45 + 10, 'combo tính lại từ đầu');
});

test('chiêu Đóng Băng / Bão Xáo: cần đầy Sấm, băng 6 ô đối thủ trong 8 giây', () => {
  const { d, p0, p1 } = duel();
  assert.equal(d.command('p0', { t: 'skill', kind: 'freeze' }), 'Chưa đủ Sấm.');
  p0.thunder = 100;
  assert.equal(d.command('p0', { t: 'skill', kind: 'freeze' }), undefined);
  assert.equal(p0.thunder, 0);
  assert.equal(p1.board.ice.size, S.LINK_FREEZE.cells);
  assert.equal(p0.board.ice.size, 0, 'bàn mình không bị');
  steps(d, S.LINK_FREEZE.ms + 250);
  assert.equal(p1.board.ice.size, 0, 'băng tự tan');
  p0.thunder = 100;
  const before = [...p1.board.cells];
  assert.equal(d.command('p0', { t: 'skill', kind: 'fog' }), undefined);
  assert.deepEqual([...p1.board.cells], before, 'Mây Mù không đảo bàn');
  assert.equal(d.stateFor('p1', { fx: [], seq: 0 }).me.dark, S.LINK_FOG_MS, 'Mây Mù che bàn đối thủ');
  assert.equal(d.stateFor('p0', { fx: [], seq: 0 }).me.dark, 0);
  p0.thunder = 100;
  assert.equal(d.command('p0', { t: 'skill', kind: 'storm' }), 'Lệnh không hợp lệ.', 'Bão Xáo đã bỏ');
});

test('dọn sạch Màn 1: thưởng điểm, nghỉ 5 giây rồi sang Màn 2, người thắng Màn 1 được 50 Sấm', () => {
  const { d, ev, p0, p1 } = duel();
  let lastFx;
  while (!p0.board.isEmpty()) {
    steps(d, 250);
    const h = p0.board.hint(d.t);
    if (!h) continue; // chờ băng tan (không có băng ở đây)
    const t = d.t, sBefore = p0.score1;
    d.drainFx();
    assert.equal(d.command('p0', { t: 'match', a: h[0], b: h[1] }), undefined);
    lastFx = { t, sBefore, fx: d.drainFx().fx };
  }
  const pts = lastFx.fx.find((f) => f.k === 'match').pts;
  const bonus = S.LINK_CLEAR_BONUS + S.LINK_CLEAR_PER_S * Math.floor((S.LINK_STAGE1_S * 1000 - lastFx.t) / 1000);
  assert.equal(p0.score1, lastFx.sBefore + pts + bonus);
  assert.ok(lastFx.fx.some((f) => f.k === 'clear'));
  assert.equal(p0.cleared1, true);
  assert.equal(d.stage, 'intermission');
  assert.equal(d.command('p1', { t: 'hint' }), 'Chờ chút, màn mới sắp bắt đầu.');
  assert.ok(ev.changed >= 1);
  steps(d, S.LINK_INTERMISSION_S * 1000);
  assert.equal(d.stage, 'stage2');
  assert.equal(p0.thunder, 50);
  assert.equal(p1.thunder, 0);
  assert.equal(p0.board.remaining(), LINK_CELLS, 'bàn mới cho Màn 2');
  assert.deepEqual([...p0.board.cells], [...p1.board.cells]);
});

test('hết 150 giây Màn 1 thì cũng sang màn nghỉ', () => {
  const { d } = duel();
  steps(d, S.LINK_STAGE1_S * 1000);
  assert.equal(d.stage, 'intermission');
});

test('chống spam: quá 8 lệnh mỗi giây bị chặn', () => {
  const { d } = duel();
  const out = Array.from({ length: 20 }, () => d.command('p0', { t: 'match', a: -1, b: -1 }));
  assert.equal(out.filter((e) => e === 'Lệnh không hợp lệ.').length, S.LINK_CMD_RATE);
  assert.equal(out[S.LINK_CMD_RATE], 'Thao tác nhanh quá.');
  steps(d, 1000);
  assert.equal(d.command('p0', { t: 'match', a: -1, b: -1 }), 'Lệnh không hợp lệ.', 'hồi lại sau 1 giây');
});

test('trạng thái gửi cho người chơi không lộ loại thú trên bàn đối thủ', () => {
  const { d } = duel();
  const st = d.stateFor('p0', d.drainFx());
  assert.equal(st.me.cells.length, LINK_CELLS);
  assert.equal(st.foes.length, 1);
  assert.equal(st.foes[0].cells, undefined);
  assert.ok(st.foes[0].filled.every((v) => v === 0 || v === 1));
  assert.equal(st.players, undefined);
  const spec = d.stateFor(undefined, d.drainFx());
  assert.equal(spec.me, undefined);
  assert.equal(spec.players.length, 2);
});

test('gợi ý: hồi 15 giây, trừ 5 điểm', () => {
  const { d, p0 } = duel();
  p0.score1 = 20;
  assert.equal(d.command('p0', { t: 'hint' }), undefined);
  assert.equal(p0.score1, 15);
  assert.ok(d.stateFor('p0', d.drainFx()).me.hint);
  assert.equal(d.command('p0', { t: 'hint' }), 'Gợi ý đang hồi.');
  steps(d, S.LINK_HINT_CD_S * 1000);
  assert.equal(d.command('p0', { t: 'hint' }), undefined);
});

// ---------------- Màn 2: Boss ----------------

test('Màn 2: mỗi cặp đấm boss, Cú Đấm Xa +20, Siêu Đấm 400', () => {
  const { d, p0 } = duel();
  toStage2(d);
  const h = p0.board.hint(d.t);
  const long = LinkBoard.pathLength(p0.board.findPath(h[0], h[1], d.t)) > S.LINK_LONG_PATH;
  d.command('p0', { t: 'match', a: h[0], b: h[1] });
  assert.equal(p0.damage, S.linkPairDamage(0, long));
  assert.equal(d.boss.maxHp, S.linkBossMaxHp(0, 2));
  assert.equal(d.boss.hp, d.boss.maxHp - p0.damage);
  assert.equal(S.linkPairDamage(0, true) - S.linkPairDamage(0, false), 20);
  assert.equal(d.command('p0', { t: 'skill', kind: 'freeze' }), 'Chiêu này chỉ dùng ở Màn 1.');
  assert.equal(d.command('p0', { t: 'super' }), 'Chưa đủ Sấm.');
  p0.thunder = 100;
  const hp = d.boss.hp;
  assert.equal(d.command('p0', { t: 'super' }), undefined);
  assert.equal(d.boss.hp, hp - S.LINK_SUPER_DMG);
});

test('Vua Sấm Sét: 3 giai đoạn, nổi giận, Sét Đánh → Mưa Băng → Sét Lan → Bóng Tối theo nhịp 12/9/6 giây', () => {
  const { d, p0, p1 } = duel();
  toStage2(d);
  assert.equal(d.boss.phase, 1);
  // chưa tới 12 giây thì boss chưa ra đòn
  d.drainFx();
  steps(d, 11500);
  assert.equal(d.drainFx().fx.filter((f) => f.k === 'boss').length, 0);
  steps(d, 500);
  let fx = d.drainFx().fx;
  assert.ok(fx.some((f) => f.k === 'boss' && f.kind === 'bolt'), 'đòn đầu là Sét Đánh');
  for (const p of [p0, p1]) {
    assert.equal(p.board.ice.size, S.LINK_BOSS_BOLT.cells);
    assert.ok(p.board.iceList(d.t).every((x) => x[2] === 3), 'ô bị điện giật');
  }
  // đánh boss xuống dưới 66%: giai đoạn 2, nổi giận
  d.boss.hp = Math.floor(d.boss.maxHp * 0.66) + 5;
  steps(d, 250);
  play(d, p0);
  assert.equal(d.boss.phase, 2);
  assert.ok(d.drainFx().fx.some((f) => f.k === 'boss' && f.kind === 'rage' && f.phase === 2));
  // đòn kế: trong ≤ 9 giây là Mưa Băng
  const t0 = d.t;
  while (!d.drainFx().fx.some((f) => f.k === 'boss' && f.kind === 'ice')) steps(d, 250);
  assert.ok(d.t - t0 <= 9000);
  // Sét Lan: nhảy vào người gây sát thương nhiều nhất, mất combo
  p1.damage = p0.damage + 500;
  p1.chain = 3;
  p1.lastMatchAt = d.t;
  const t1 = d.t;
  const cellsBefore = [...p0.board.cells];
  let chain;
  while (!(chain = d.drainFx().fx.find((f) => f.k === 'boss' && f.kind === 'chain'))) steps(d, 250);
  assert.equal(d.t - t1, 9000);
  assert.equal(chain.to, 'p1');
  assert.equal(p1.chain, 0);
  assert.ok(p1.board.iceList(d.t).filter((x) => x[2] === 3).length >= S.LINK_BOSS_CHAIN.cells);
  while (!d.drainFx().fx.some((f) => f.k === 'boss' && f.kind === 'dark')) steps(d, 250);
  assert.equal(d.stateFor('p1', { fx: [], seq: 0 }).me.dark, S.LINK_BOSS_DARK_MS);
  assert.deepEqual([...p0.board.cells], cellsBefore, 'Boss không đảo bàn');
  // giai đoạn 3: nhịp 6 giây
  d.boss.hp = Math.floor(d.boss.maxHp * 0.33) + 5;
  steps(d, 250);
  play(d, p1);
  assert.equal(d.boss.phase, 3);
  d.drainFx();
  const t2 = d.boss.nextSkillAt;
  while (!d.drainFx().fx.some((f) => f.k === 'boss' && f.kind === 'bolt')) steps(d, 250);
  assert.equal(d.boss.nextSkillAt - d.t, 6000);
  assert.ok(d.t >= t2);
});

test('K.O. Boss 1 → nghỉ → Nữ Hoàng Nhện; mỗi Boss gục +500 cho người kết liễu', () => {
  const { d, ev, p0, p1 } = duel();
  p0.thunder = 0;
  toStage2(d);
  assert.equal(d.stageEndsAt - d.t, S.LINK_RAID_S * 1000, 'một đồng hồ chung cho cả 3 Boss');
  steps(d, 30_000);
  d.boss.hp = 5;
  p1.thunder = 40;
  const raidLeft = d.stageEndsAt - d.t;
  assert.equal(play(d, p1), undefined);
  assert.equal(d.stage, 'intermission');
  assert.equal(p1.kos, 1);
  assert.ok(d.drainFx().fx.some((f) => f.k === 'ko' && f.who === 'p1'));
  assert.equal(d.command('p0', { t: 'hint' }), 'Chờ chút, màn mới sắp bắt đầu.');
  steps(d, S.LINK_INTERMISSION_S * 1000);
  assert.equal(d.stage, 'stage2');
  assert.equal(d.boss.id, 'spider');
  assert.equal(d.boss.no, 1);
  assert.equal(d.boss.maxHp, S.linkBossMaxHp(1, 2));
  assert.equal(d.stageEndsAt - d.t, raidLeft, 'giờ còn lại chuyển sang Boss sau, lúc nghỉ không bị trừ');
  assert.ok(p1.thunder >= 40, 'giữ Sấm sang Boss mới');
  assert.equal(p0.board.remaining(), LINK_CELLS, 'bàn mới');
  assert.deepEqual([...p0.board.cells], [...p1.board.cells]);
  const st = d.stateFor('p0', d.drainFx());
  assert.equal(st.boss.id, 'spider');
  assert.equal(st.foes[0].kos, 1);
});

test('hạ hết các màn Boss (Co-op 2 Boss, Đại Ma Vương rồi Trùm Cuối Cự Thần): phá đảo, người kết liễu cuối là result.ko', () => {
  const { d, ev, p0, p1 } = duel();
  p0.score1 = 300;
  p1.score1 = 100;
  toStage2(d);
  const order = [];
  for (let i = 0; i < S.LINK_BOSSES.length; i++) {
    order.push(d.boss.id);
    d.boss.hp = 5;
    d.boss.shield = 0;
    assert.equal(play(d, p1), undefined);
    if (i < S.LINK_BOSSES.length - 1) steps(d, S.LINK_INTERMISSION_S * 1000);
  }
  assert.deepEqual(order, ['thunder', 'spider', 'tyrant', 'twins', 'overlord', 'titan']);
  const changed = ev.changed;
  assert.equal(d.stage, 'ended');
  assert.equal(p1.kos, 6);
  assert.equal(d.result.ko, 'p1');
  assert.equal(d.result.bossesDown, 6);
  assert.equal(d.result.totals.p1, 100 + 6 * 5 + 6 * S.LINK_KO_BONUS);
  assert.equal(d.result.totals.p0, 300);
  assert.equal(d.result.winnerId, 'p1');
  assert.ok(ev.changed >= changed);
  assert.equal(d.command('p0', { t: 'hint' }), 'Trận chưa bắt đầu.');
});

test('hết giờ đánh Boss: Boss thoát, trận kết thúc, bằng điểm thì hòa', () => {
  const { d } = duel();
  toStage2(d);
  steps(d, S.LINK_RAID_S * 1000);
  assert.equal(d.stage, 'ended');
  assert.equal(d.result.ko, undefined);
  assert.equal(d.result.bossesDown, 0);
  assert.match(d.result.reason, /Vua Sấm Sét/);
  assert.equal(d.result.winnerId, undefined);
});

test('dọn sạch bàn khi đánh Boss thì nhận bàn mới; bỏ cuộc thì thua', () => {
  const { d, p0 } = duel();
  toStage2(d);
  p0.board.cells.fill(-1);
  p0.board.cells[0] = 3;
  p0.board.cells[1] = 3;
  assert.equal(d.command('p0', { t: 'match', a: 0, b: 1 }), undefined);
  assert.equal(p0.board.remaining(), LINK_CELLS);
  assert.equal(d.command('p0', { t: 'resign' }), undefined);
  assert.equal(d.result.winnerId, 'p1');
});

// ---------------- Nữ Hoàng Nhện, Bạo Chúa ----------------

/** Đi thẳng tới Boss thứ `no` */
function toBoss(d, no) {
  toStage2(d);
  for (let i = 0; i < no; i++) {
    d.boss.hp = 1;
    d.boss.shield = 0;
    d['hitBoss'](d.players[0], 1);
    steps(d, S.LINK_INTERMISSION_S * 1000);
  }
  assert.equal(d.boss.no, no);
  for (const p of d.players) p.kos = 0;
}
/** Chạy tới khi Boss ra chiêu `kind`, trả fx của chiêu đó */
function untilSkill(d, kind) {
  for (let i = 0; i < 400; i++) {
    steps(d, 250);
    const f = d.drainFx().fx.find((x) => x.k === 'boss' && x.kind === kind);
    if (f) return f;
  }
  assert.fail(`Boss không ra ${kind}`);
}
const lockKinds = (p, d) => p.board.iceList(d.t).map((x) => x[2]);

test('Nữ Hoàng Nhện: Lưới Tơ → Nọc Độc → Kén Tơ → Hút Sinh Lực', () => {
  const { d, p0, p1 } = duel({ n: 3 });
  toBoss(d, 1);
  assert.deepEqual(S.LINK_BOSSES[1].skills, ['web', 'venom', 'cocoon', 'drain']);
  // Lưới Tơ: khoá ô loại tơ (1) trên bàn mọi người
  const web = untilSkill(d, 'web');
  assert.equal(web.boss, 'spider');
  for (const p of d.players) {
    assert.equal(p.board.ice.size, S.LINK_BOSS_WEB.cells);
    assert.ok(lockKinds(p, d).every((k) => k === 1));
  }
  // Nọc Độc: mất combo, sát thương còn một nửa
  p0.chain = 3;
  p0.lastMatchAt = d.t;
  untilSkill(d, 'venom');
  assert.equal(p0.chain, 0);
  assert.equal(d.stateFor('p0', { fx: [], seq: 0 }).me.venom, S.LINK_BOSS_VENOM_MS);
  const h = p0.board.hint(d.t);
  const long = LinkBoard.pathLength(p0.board.findPath(h[0], h[1], d.t)) > S.LINK_LONG_PATH;
  const dmg0 = p0.damage;
  d.command('p0', { t: 'match', a: h[0], b: h[1] });
  assert.equal(p0.damage - dmg0, Math.round(S.linkPairDamage(0, long) / 2));
  // Kén Tơ: nhắm người gây nhiều sát thương nhất
  steps(d, S.LINK_BOSS_WEB.ms);
  p1.damage = 9999;
  const before0 = p0.board.ice.size;
  const cocoon = untilSkill(d, 'cocoon');
  assert.equal(cocoon.to, 'p1');
  assert.ok(p1.board.ice.size >= S.LINK_BOSS_COCOON.cells);
  assert.ok(p0.board.ice.size <= before0, 'người khác không bị Kén Tơ');
  // Hút Sinh Lực: hồi 5% máu, không quá máu tối đa
  d.boss.hp = d.boss.maxHp - 10_000 > 0 ? d.boss.maxHp - 10_000 : Math.floor(d.boss.maxHp / 2);
  const hp = d.boss.hp;
  untilSkill(d, 'drain');
  assert.equal(d.boss.hp, Math.min(d.boss.maxHp, hp + Math.round(d.boss.maxHp * S.LINK_BOSS_DRAIN)));
  d.boss.hp = d.boss.maxHp - 1;
  untilSkill(d, 'drain');
  assert.equal(d.boss.hp, d.boss.maxHp);
});

test('Bạo Chúa: 8 chiêu (nhiều nhất), Khiên Đá hút sát thương, Động Đất mất combo + Sấm, Thiên Thạch thiêu ô, Gầm Thét gây choáng', () => {
  const { d, p0, p1 } = duel();
  toBoss(d, 2);
  assert.equal(d.boss.id, 'tyrant');
  assert.equal(d.boss.maxHp, S.linkBossMaxHp(2, 2));
  assert.ok(S.LINK_BOSSES[2].skills.length > S.LINK_BOSSES[1].skills.length);
  assert.ok(S.LINK_BOSSES[2].skills.length > S.LINK_BOSSES[0].skills.length);
  const seen = new Set();
  // Thiên Thạch: ô lửa (2)
  untilSkill(d, 'meteor');
  seen.add('meteor');
  assert.equal(p0.board.ice.size, S.LINK_BOSS_METEOR.cells);
  assert.ok(lockKinds(p0, d).every((k) => k === 2));
  // Động Đất
  p0.chain = 4;
  p0.lastMatchAt = d.t;
  p0.thunder = 60;
  p1.thunder = 10;
  untilSkill(d, 'quake');
  seen.add('quake');
  assert.equal(p0.chain, 0);
  assert.equal(p0.thunder, 60 - S.LINK_BOSS_QUAKE_THUNDER);
  assert.equal(p1.thunder, 0);
  // Khiên Đá: hút sát thương trước khi trừ máu
  untilSkill(d, 'shield');
  seen.add('shield');
  const shield = Math.round(d.boss.maxHp * S.LINK_BOSS_SHIELD);
  assert.equal(d.boss.shield, shield);
  assert.equal(d.stateFor('p0', { fx: [], seq: 0 }).boss.shield, shield);
  const hp = d.boss.hp;
  p0.thunder = 100;
  d.command('p0', { t: 'super' });
  assert.equal(d.boss.shield, 0);
  assert.equal(d.boss.hp, hp - (S.LINK_SUPER_DMG - shield));
  assert.equal(p0.damage >= S.LINK_SUPER_DMG, true, 'đánh vào khiên vẫn tính sát thương');
  untilSkill(d, 'ice');
  seen.add('ice');
  // Gầm Thét: choáng, chưa nối được
  untilSkill(d, 'roar');
  seen.add('roar');
  assert.equal(d.stateFor('p0', { fx: [], seq: 0 }).me.stun, S.LINK_BOSS_ROAR_MS);
  steps(d, 250);
  const h = p0.board.hint(d.t);
  assert.equal(d.command('p0', { t: 'match', a: h[0], b: h[1] }), 'Bạn đang bị choáng!');
  steps(d, S.LINK_BOSS_ROAR_MS);
  for (const k of ['dark', 'venom', 'meteor', 'quake', 'bolt']) {
    untilSkill(d, k);
    seen.add(k);
  }
  assert.equal(seen.size, 8);
});

test('Màn Boss 4 – 2 Boss Co-op Siêu Khó (Hắc Long Hư Không & Phượng Hoàng Hỗn Mang): tự xuất hiện sau khi hạ 3 Boss đầu, đủ 6 chiêu mới', () => {
  const { d, p0, p1 } = duel();
  const twinsDef = S.LINK_BOSSES[3];
  assert.equal(twinsDef.id, 'twins');
  assert.equal(twinsDef.coop, true);
  assert.equal(twinsDef.partners.length, 2);
  assert.deepEqual(
    twinsDef.skills,
    ['blackhole', 'hellfire', 'soul_chain', 'nirvana', 'eclipse', 'judgment'],
  );

  // Hạ tuần tự Màn 1 Boss → Màn 2 Boss → Màn 3 Boss để sang Màn 4 Co-op 2 Boss (được cấp mới trọn 6 phút = 360s)
  steps(d, 50_000);
  toBoss(d, 3);
  assert.equal(d.stage, 'stage2');
  assert.equal(d.boss.id, 'twins');
  assert.equal(d.boss.no, 3);
  assert.equal(d.boss.maxHp, S.linkBossMaxHp(3, 2));
  assert.equal(d.stageEndsAt - d.t, S.LINK_COOP_RAID_S * 1000, 'Màn Boss 4 được cấp mới trọn 6 phút (360 giây)');
  assert.equal(S.LINK_COOP_RAID_S, 360);
  p0.thunder = 50;

  // 1. blackhole: khoá 8 ô Ấn Hư Không (loại 4) + trừ 20 Sấm
  untilSkill(d, 'blackhole');
  assert.equal(p0.board.ice.size, S.LINK_BOSS_BLACKHOLE.cells);
  assert.ok(lockKinds(p0, d).every((k) => k === 4));
  assert.equal(p0.thunder, 50 - S.LINK_BOSS_BLACKHOLE.thunder);

  // 2. hellfire: thiêu đốt 9 ô lửa (loại 2) + mất combo
  p0.chain = 3;
  p0.lastMatchAt = d.t;
  untilSkill(d, 'hellfire');
  assert.equal(p0.chain, 0);
  assert.ok(lockKinds(p0, d).includes(2));

  // 3. soul_chain: nhắm người dẫn đầu sát thương, khoá LINK_BOSS_SOUL_CHAIN.cells ô Ấn Hư Không + choáng
  p1.damage = 9999;
  p1.chain = 4;
  p1.lastMatchAt = d.t;
  const sc = untilSkill(d, 'soul_chain');
  assert.equal(sc.to, 'p1');
  assert.equal(p1.chain, 0);
  assert.equal(d.stateFor('p1', { fx: [], seq: 0 }).me.stun, S.LINK_BOSS_SOUL_CHAIN.stunMs);

  // 4. nirvana: hồi LINK_BOSS_NIRVANA.heal máu + dựng Khiên Hỗn Mang LINK_BOSS_NIRVANA.shield
  d.boss.hp = Math.floor(d.boss.maxHp * 0.5);
  const hpBefore = d.boss.hp;
  untilSkill(d, 'nirvana');
  assert.equal(d.boss.hp, hpBefore + Math.round(d.boss.maxHp * S.LINK_BOSS_NIRVANA.heal));
  assert.equal(d.boss.shield, Math.round(d.boss.maxHp * S.LINK_BOSS_NIRVANA.shield));

  // 5. eclipse: Bóng Tối 5s + Độc Hư Không 7s
  untilSkill(d, 'eclipse');
  const st0 = d.stateFor('p0', { fx: [], seq: 0 }).me;
  assert.equal(st0.dark, S.LINK_BOSS_ECLIPSE.darkMs);
  assert.equal(st0.venom, S.LINK_BOSS_ECLIPSE.venomMs);

  // 6. judgment (Song Tuyệt Hủy Diệt): khoá ô Ấn Hư Không + ô Lửa + choáng + trừ Sấm (theo LINK_BOSS_JUDGMENT)
  p0.thunder = 80;
  untilSkill(d, 'judgment');
  assert.equal(p0.thunder, 80 - S.LINK_BOSS_JUDGMENT.thunder);
  assert.equal(d.stateFor('p0', { fx: [], seq: 0 }).me.stun, S.LINK_BOSS_JUDGMENT.stunMs);
});

test('Đại Ma Vương Hỗn Nguyên: ra sau Song Sát, 3 thanh máu, Lốc Xoáy đảo bàn, Ma Nhãn Laze choáng 3–5 thú', () => {
  const { d, p0, p1 } = duel();
  const def = S.LINK_BOSSES[4];
  assert.equal(def.id, 'overlord');
  assert.equal(def.bars, 3);
  assert.ok(def.skills.includes('apocalypse'));
  assert.ok(def.skills.includes('vortex') && def.skills.includes('eye_laser'));
  assert.ok(def.hpMul > Math.max(...S.LINK_BOSSES.slice(0, 4).map((b) => b.hpMul)), 'máu to nhất');

  toBoss(d, 4);
  assert.equal(d.stage, 'stage2');
  assert.equal(d.boss.id, 'overlord');
  assert.equal(d.stageEndsAt - d.t, S.LINK_FINAL_RAID_S * 1000, 'Đại Ma Vương có thời gian riêng');

  // Ma Nhãn Laze: giai đoạn 1 choáng 3 thú (khoá loại 5) trên bàn mỗi người, fx báo đúng ô
  const laser = untilSkill(d, 'eye_laser');
  assert.deepEqual(Object.keys(laser.hits).sort(), ['p0', 'p1']);
  assert.equal(laser.hits.p0.length, S.LINK_BOSS_LASER.cells[0]);
  for (const i of laser.hits.p0) assert.equal(p0.board.lockKind.get(i), 5);
  assert.ok(lockKinds(p0, d).includes(5));

  // Lốc Xoáy: đảo lộn bàn mọi người (vẫn đủ thú, còn nước đi), mất combo
  p1.chain = 4;
  p1.lastMatchAt = d.t;
  const before = [...p1.board.cells];
  untilSkill(d, 'vortex');
  assert.equal(p1.chain, 0);
  assert.notDeepEqual([...p1.board.cells], before);
  assert.deepEqual([...p1.board.cells].sort((a, b) => a - b), before.sort((a, b) => a - b));
  assert.ok(p1.board.hint(d.t, true));

  // vỡ thanh máu 1: lên giai đoạn 2 + dựng Giáp Hỗn Nguyên; laze giai đoạn 2 choáng 4 thú
  d.boss.shield = 0;
  d['hitBoss'](p0, d.boss.hp - Math.floor(d.boss.maxHp * 0.6));
  assert.equal(d.boss.phase, 2);
  assert.equal(d.boss.shield, Math.round(d.boss.maxHp * S.LINK_FINAL_BAR_SHIELD));
  p0.board.clearLocks();
  const laser2 = untilSkill(d, 'eye_laser');
  assert.equal(laser2.hits.p0.length, S.LINK_BOSS_LASER.cells[1]);

  // Tận Thế Tứ Linh: khoá đủ 4 loại (băng, tơ, lửa, điện), trừ Sấm
  p0.board.clearLocks();
  p0.thunder = 60;
  const apo = untilSkill(d, 'apocalypse');
  assert.equal(apo.hits.p0.length, 4 * S.LINK_BOSS_APOCALYPSE.perKind);
  assert.deepEqual([...new Set(lockKinds(p0, d))].sort(), [0, 1, 2, 3]);
  assert.ok(p0.thunder <= 60 - S.LINK_BOSS_APOCALYPSE.thunder, 'trừ Sấm (Lốc Xoáy ra trước cũng trừ)');

  // hạ Đại Ma Vương thì sang Trùm Cuối (chưa phá đảo)
  d.boss.hp = 1;
  d.boss.shield = 0;
  d['hitBoss'](p1, 1);
  assert.equal(d.stage, 'intermission');
});

test('Trùm Cuối – Cự Thần Thiên Hà: 2 bàn trái + phải, sát thương x2, 10 thanh máu x10 máu, Trọng Lực đổi bàn', () => {
  const { d, p0, p1 } = duel();
  const def = S.LINK_BOSSES[5];
  assert.equal(def.id, 'titan');
  assert.equal(def.final, true);
  assert.equal(def.dual, true);
  assert.equal(def.bars, 10);
  assert.equal(def.dmgMul, 2);
  assert.equal(S.LINK_BOSSES.at(-1).id, 'titan', 'Cự Thần là Boss cuối');
  toBoss(d, 5);
  assert.equal(d.boss.id, 'titan');
  assert.equal(d.boss.maxHp, S.linkBossHp(2) * 10, 'x10 máu gốc');
  assert.equal(d.stageEndsAt - d.t, S.LINK_TITAN_RAID_S * 1000);

  // mỗi người có 2 bàn, gửi xuống client đủ cả 2
  assert.ok(p0.board2 && p1.board2);
  const me = d.stateFor('p0', { fx: [], seq: 0 }).me;
  assert.equal(me.cells.length, LINK_CELLS);
  assert.equal(me.cells2.length, LINK_CELLS);

  // nối ở bàn phải (side 1): trúng Boss x2, fx dùng chỉ số toàn cục
  const h = p0.board2.hint(d.t);
  const hp = d.boss.hp;
  d.drainFx();
  assert.equal(d.command('p0', { t: 'match', a: h[0], b: h[1], side: 1 }), undefined);
  const fx = d.drainFx().fx;
  const m = fx.find((f) => f.k === 'match');
  assert.equal(m.side, 1);
  assert.equal(m.a, LINK_CELLS + h[0]);
  assert.equal(hp - d.boss.hp, S.linkPairDamage(0, m.pts > S.linkPairDamage(0, false) * 2) * 2);
  assert.equal(p0.board2.cells[h[0]], -1);

  // ô khoá chia lên cả 2 bàn
  p0.board.clearLocks();
  p0.board2.clearLocks();
  const tl = untilSkill(d, 'twin_laser');
  assert.equal(tl.hits.p0.length, S.LINK_BOSS_TWIN_LASER.cells[0] * 2);
  assert.ok(tl.hits.p0.some((g) => g < LINK_CELLS) && tl.hits.p0.some((g) => g >= LINK_CELLS));
  assert.equal(p0.board.ice.size, S.LINK_BOSS_TWIN_LASER.cells[0]);
  assert.equal(p0.board2.ice.size, S.LINK_BOSS_TWIN_LASER.cells[0]);

  // Trọng Lực Đảo Chiều: bàn trái và phải đổi chỗ
  const [left, right] = [p1.board, p1.board2];
  untilSkill(d, 'gravity');
  assert.equal(p1.board, right);
  assert.equal(p1.board2, left);

  // vỡ 1 thanh máu (10%): dựng khiên, báo fx 'bar' còn 9 thanh
  d.boss.shield = 0;
  d.boss.hp = d.boss.maxHp;
  d.boss.phase = 1;
  d.drainFx();
  d['hitBoss'](p0, Math.ceil(d.boss.maxHp * 0.1) + 1);
  const bar = d.drainFx().fx.find((f) => f.k === 'boss' && f.kind === 'bar');
  assert.equal(bar.left, 9);
  assert.equal(d.boss.shield, Math.round(d.boss.maxHp * def.barShield));

  // hạ Cự Thần là phá đảo
  d.boss.hp = 1;
  d.boss.shield = 0;
  d['hitBoss'](p1, 1);
  assert.equal(d.stage, 'ended');
  assert.equal(d.result.bossesDown, S.LINK_BOSSES.length);
});

test('không còn chiêu nào (Boss hay người) đảo bàn người khác', () => {
  for (const b of S.LINK_BOSSES) assert.ok(!b.skills.includes('shuffle'));
  const { d, p0, p1 } = duel();
  toBoss(d, 2);
  const cells = [...p1.board.cells];
  for (const k of S.LINK_BOSSES[2].skills) untilSkill(d, k);
  assert.deepEqual([...p1.board.cells], cells);
});

// ---------------- Đảo Bàn (chiêu người chơi, hồi 1 phút) ----------------

test('Đảo Bàn: chiêu tự đảo bàn mình, hồi 1 phút, nối được cặp không làm hồi lại', () => {
  const { d, p0, p1 } = duel();
  assert.equal(S.LINK_SHUFFLE_CD_S, 60);
  assert.equal(d.command('p0', { t: 'shuffle' }), 'Đảo Bàn đang hồi chiêu.');
  assert.equal(d.stateFor('p0', { fx: [], seq: 0 }).me.shuffleIn, S.LINK_SHUFFLE_CD_S * 1000);
  steps(d, 30_000);
  play(d, p0); // nối cặp: đồng hồ hồi chiêu vẫn chạy tiếp
  steps(d, (S.LINK_SHUFFLE_CD_S - 31) * 1000);
  assert.equal(d.stateFor('p0', { fx: [], seq: 0 }).me.shuffleIn, 1000);
  assert.ok(d.command('p0', { t: 'shuffle' }));
  steps(d, 1000);
  assert.equal(d.stateFor('p0', { fx: [], seq: 0 }).me.shuffleIn, 0);
  const before = [...p0.board.cells].sort();
  const p1Cells = [...p1.board.cells];
  d.drainFx();
  assert.equal(d.command('p0', { t: 'shuffle' }), undefined);
  assert.deepEqual([...p0.board.cells].sort(), before, 'chỉ đổi chỗ, không mất ô');
  assert.ok(p0.board.hasMove(d.t) || p0.board.ice.size > 0);
  assert.deepEqual([...p1.board.cells], p1Cells, 'không đụng bàn người khác');
  assert.ok(d.drainFx().fx.some((f) => f.k === 'shuffle' && f.who === 'p0'));
  assert.equal(d.stateFor('p0', { fx: [], seq: 0 }).me.shuffleIn, S.LINK_SHUFFLE_CD_S * 1000);
  assert.equal(d.command('p0', { t: 'shuffle' }), 'Đảo Bàn đang hồi chiêu.', 'dùng xong phải chờ lại 1 phút');
});

test('Đảo Bàn dùng được khi đánh Boss', () => {
  const { d, p0 } = duel();
  toStage2(d);
  steps(d, S.LINK_SHUFFLE_CD_S * 1000);
  assert.equal(d.command('p0', { t: 'shuffle' }), undefined);
});

// ---------------- Máy ----------------

test('máy (Khó) tự chơi trọn trận và không bao giờ nối sai', () => {
  const { d, p1 } = duel({ bot: true, level: 'hard' });
  const orig = d.command.bind(d);
  const botErrors = [];
  d.command = (id, cmd) => {
    const e = orig(id, cmd);
    if (id === 'p1' && e) botErrors.push(e);
    return e;
  };
  const all = S.LINK_STAGE1_S + S.LINK_RAID_S + S.LINK_COOP_RAID_S + 4 * S.LINK_INTERMISSION_S + 10;
  for (let x = 0; x < all * 1000 && d.stage !== 'ended'; x += 250) d.tick(250);
  assert.ok(p1.score1 > 0, 'máy có điểm Màn 1');
  assert.ok(p1.damage > 0, 'máy có đánh boss');
  assert.equal(d.stage, 'ended');
  assert.ok(d.result);
  assert.deepEqual(botErrors.filter((e) => e === 'Hai ô này không nối được.'), []);
});

test('cấu hình: độ khó lạ về Thường', () => {
  assert.deepEqual(S.normalizeLinkConfig({ botLevel: 'x' }, 2), { botLevel: 'normal', bots: 0 });
  assert.deepEqual(S.normalizeLinkConfig({ botLevel: 'hard', bots: 3 }, 2), { botLevel: 'hard', bots: 3 });
  assert.equal(S.normalizeLinkConfig({ bots: 0 }, 1).bots, 0, '1 người không thêm máy = chơi một mình');
  assert.equal(S.normalizeLinkConfig({}, 1).bots, 0);
  assert.equal(S.normalizeLinkConfig({ bots: 9 }, 4).bots, 6, 'tổng tối đa 10');
  assert.equal(S.normalizeLinkConfig({ bots: 9 }, 10).bots, 0);
  assert.equal(S.normalizeLinkConfig({ bots: 3 }, 12).bots, 0, 'phòng đông hơn 10 vẫn không thêm máy');
  assert.equal(S.LINK_MAX_PLAYERS, 10);
  assert.equal(S.linkBossHp(2), S.LINK_BOSS_HP);
  assert.equal(S.linkBossHp(6), 6600);
  assert.equal(S.linkBossHp(10), 10200);
  assert.equal(S.linkBossHp(15), 10200, 'máu Boss không vượt mức 10 người');
});

test('tích hợp phòng: 1 người + máy, gửi trạng thái riêng, bỏ cuộc thì máy thắng và hoàn cược', () => {
  const { Game, GameError } = require('../dist/server/src/game/game.js');
  const sent = [];
  const game = new Game('LINK', {
    changed() {}, removed() {}, fx() {}, notify() {}, antsFrame() {},
    linkState(_g, id, st) { sent.push([id, st]); },
  }, {}, 'link_duel');
  game.addPlayer('player_link1', 'An');
  assert.throws(() => game.linkCommand('player_link1', { t: 'hint' }), GameError);
  game.setLinkConfig('player_link1', { botLevel: 'easy', bots: 1 });
  assert.equal(game.viewFor('player_link1').link.config.botLevel, 'easy');
  game.bet = 100;
  game.pot = 100;
  game.start('player_link1');
  try {
    assert.equal(game.phase, 'playing');
    const view = game.viewFor('player_link1');
    assert.equal(view.link.stage, 'stage1');
    assert.equal(view.link.players.length, 2);
    assert.ok(view.link.players[1].bot);
    const st = sent.find(([id]) => id === 'player_link1')[1];
    assert.equal(st.me.cells.length, LINK_CELLS);
    assert.equal(st.foes[0].bot, true);
    assert.throws(() => game.linkCommand('player_link1', { t: 'match', a: -1, b: 3 }), /không hợp lệ/);
    // nối sai thì không ném lỗi (không bật thông báo), chỉ có fx miss
    const [x, y] = wrongPair({ cells: sent.at(-1)[1].me.cells });
    assert.doesNotThrow(() => game.linkCommand('player_link1', { t: 'match', a: x, b: y }));
    game.linkCommand('player_link1', { t: 'resign' });
    assert.equal(game.phase, 'ended');
    assert.equal(game.viewFor('player_link1').link.result.winnerId, 'bot:link0');
    assert.deepEqual(game.payouts, { player_link1: 100 }, 'máy thắng thì hoàn cược');
  } finally {
    game.dispose();
  }
});

// ---------------- 4–10 người ----------------

test('6 người: cùng một đề, mỗi người thấy 5 đối thủ, Boss theo máu 6 người', () => {
  const { d } = duel({ n: 6 });
  assert.equal(d.players.length, 6);
  for (const p of d.players) assert.deepEqual([...p.board.cells], [...d.players[0].board.cells]);
  const st = d.stateFor('p3', d.drainFx());
  assert.equal(st.foes.length, 5);
  assert.ok(!st.foes.some((f) => f.id === 'p3'));
  toStage2(d);
  assert.equal(d.boss.maxHp, S.linkBossMaxHp(0, 6));
  assert.equal(S.linkBossHp(6), 6600);
});

test('10 người: ai cũng thấy 9 đối thủ, người thứ 11 không vào trận, Boss theo máu 10 người', () => {
  const { d } = duel({ n: 11 });
  assert.equal(d.players.length, 10);
  for (const p of d.players) assert.deepEqual([...p.board.cells], [...d.players[0].board.cells]);
  const st = d.stateFor('p9', d.drainFx());
  assert.equal(st.foes.length, 9);
  toStage2(d);
  assert.equal(d.boss.maxHp, S.linkBossMaxHp(0, 10));
});

test('nhiều người: chiêu mặc định đánh người dẫn đầu, hoặc người được chọn', () => {
  const { d, p0 } = duel({ n: 4 });
  d.players[2].score1 = 300; // người dẫn đầu
  d.players[3].score1 = 100;
  p0.thunder = 100;
  assert.equal(d.command('p0', { t: 'skill', kind: 'freeze' }), undefined);
  assert.equal(d.players[2].board.ice.size, S.LINK_FREEZE.cells, 'người dẫn đầu bị băng');
  assert.equal(d.players[1].board.ice.size + d.players[3].board.ice.size, 0);
  p0.thunder = 100;
  assert.equal(d.command('p0', { t: 'skill', kind: 'freeze', target: 'p3' }), undefined);
  assert.equal(d.players[3].board.ice.size, S.LINK_FREEZE.cells, 'đánh đúng người được chọn');
  // chọn chính mình / người lạ thì vẫn về người dẫn đầu
  steps(d, S.LINK_FREEZE.ms + 250);
  p0.thunder = 100;
  d.command('p0', { t: 'skill', kind: 'freeze', target: 'p0' });
  assert.equal(p0.board.ice.size, 0);
  assert.equal(d.players[2].board.ice.size, S.LINK_FREEZE.cells);
});

test('nhiều người: 1 người bỏ cuộc thì trận vẫn tiếp, không được thắng; còn 1 người thì kết thúc', () => {
  const { d } = duel({ n: 3 });
  d.players[0].score1 = 999;
  assert.equal(d.command('p0', { t: 'resign' }), undefined);
  assert.equal(d.stage, 'stage1', 'còn 2 người thì chơi tiếp');
  assert.equal(d.command('p0', { t: 'hint' }), 'Bạn đã bỏ cuộc trận này.');
  assert.equal(d.stateFor('p1', d.drainFx()).foes.find((f) => f.id === 'p0').out, true);
  d.command('p1', { t: 'resign' });
  assert.equal(d.stage, 'ended');
  assert.equal(d.result.winnerId, 'p2', 'người cuối cùng còn lại thắng dù điểm thấp hơn người đã bỏ');
});

test('nhiều người: hết giờ thì người tổng điểm cao nhất thắng; ngang điểm đầu bảng thì hòa', () => {
  let { d } = duel({ n: 4 });
  d.players[1].score1 = 50;
  d.players[3].score1 = 80;
  toStage2(d);
  steps(d, S.LINK_RAID_S * 1000);
  assert.equal(d.result.winnerId, 'p3');
  ({ d } = duel({ n: 4 }));
  d.players[1].score1 = 80;
  d.players[3].score1 = 80;
  toStage2(d);
  steps(d, S.LINK_RAID_S * 1000);
  assert.equal(d.result.winnerId, undefined);
});

test('Boss ra đòn lên bàn của mọi người còn trong trận', () => {
  const { d } = duel({ n: 5 });
  d.command('p4', { t: 'resign' });
  toStage2(d);
  steps(d, 12000);
  for (const p of d.players.slice(0, 4)) assert.equal(p.board.ice.size, S.LINK_BOSS_BOLT.cells);
  assert.equal(d.players[4].board.ice.size, 0, 'người đã bỏ cuộc không bị đánh');
});

test('tích hợp phòng: 1 người + 3 máy (4 người), máy tự chơi', () => {
  const { Game } = require('../dist/server/src/game/game.js');
  const sent = [];
  const game = new Game('LNK4', { changed() {}, removed() {}, fx() {}, notify() {}, antsFrame() {}, linkState(_g, id, st) { sent.push([id, st]); } }, {}, 'link_duel');
  game.addPlayer('player_link4', 'An');
  game.setLinkConfig('player_link4', { botLevel: 'hard', bots: 3 });
  assert.equal(game.viewFor('player_link4').link.config.bots, 3);
  game.start('player_link4');
  try {
    const view = game.viewFor('player_link4');
    assert.equal(view.link.players.length, 4);
    assert.equal(view.link.players.filter((p) => p.bot).length, 3);
    assert.equal(new Set(view.link.players.map((p) => p.id)).size, 4);
    assert.equal(sent.at(-1)[1].foes.length, 3);
  } finally {
    game.dispose();
  }
});

test('phòng Nối Thú tạo từ bản cũ (luật lưu "tối đa 6") vẫn đủ 10 chỗ; Mèo Nổ vẫn theo luật phòng', () => {
  const { Game } = require('../dist/server/src/game/game.js');
  const hooks = { changed() {}, removed() {}, fx() {}, notify() {}, antsFrame() {}, linkState() {} };
  const game = new Game('LNK6', hooks, { maxPlayers: 6 }, 'link_duel');
  try {
    assert.equal(game.seatLimit(), 10);
    for (let i = 0; i < 10; i++) game.addPlayer(`player_seat${i}`, `Người ${i}`);
    assert.equal(game.players.length, 10);
    assert.throws(() => game.addPlayer('player_seat10', 'Người 10'), /đủ 10 người/);
  } finally {
    game.dispose();
  }
  const ek = new Game('EKS6', hooks, { maxPlayers: 6 }, 'exploding_kittens');
  try {
    assert.equal(ek.seatLimit(), 6);
  } finally {
    ek.dispose?.();
  }
});

test('chơi một mình: 1 người, 0 máy vẫn bắt đầu được, không có đối thủ, bỏ cuộc thì hoàn cược', () => {
  const { Game } = require('../dist/server/src/game/game.js');
  const sent = [];
  const game = new Game('SOLO', {
    changed() {}, removed() {}, fx() {}, notify() {}, antsFrame() {},
    linkState(_g, id, st) { sent.push([id, st]); },
  }, {}, 'link_duel');
  game.addPlayer('player_solo', 'An');
  game.setLinkConfig('player_solo', { bots: 0 });
  assert.equal(game.viewFor('player_solo').link.config.bots, 0);
  game.bet = 100;
  game.pot = 100;
  game.start('player_solo');
  try {
    assert.equal(game.phase, 'playing');
    const view = game.viewFor('player_solo');
    assert.equal(view.link.players.length, 1);
    const st = sent.find(([id]) => id === 'player_solo')[1];
    assert.equal(st.foes.length, 0);
    game.linkCommand('player_solo', { t: 'resign' });
    assert.equal(game.phase, 'ended');
    assert.deepEqual(game.payouts, { player_solo: 100 }, 'chơi một mình không mất tiền cược');
  } finally {
    game.dispose();
  }
});
