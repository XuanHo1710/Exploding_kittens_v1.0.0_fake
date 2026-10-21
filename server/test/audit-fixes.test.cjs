'use strict';

// Test cho các lỗi tìm được khi rà soát chéo (Xì Dách 21, Tiến Lên, phòng, xu).
require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { Logger } = require('@nestjs/common');
const { Game, GameError } = require('../dist/server/src/game/game.js');
const { DbService } = require('../dist/server/src/store/db.service.js');
const { AccountsService } = require('../dist/server/src/store/accounts.service.js');
const { PLAYING_CARD_BY_CODE, evaluateBlackjackHand } = require('../dist/shared/src/index.js');

Logger.overrideLogger(false);

const A = 'player_aaa1';
const B = 'player_bbb2';
const C = 'player_ccc3';
const pc = (code) => ({ ...PLAYING_CARD_BY_CODE[code], id: code });

function makeGame(t, mode, ids = [A, B, C]) {
  const removed = [];
  const game = new Game('AUDT', { changed() {}, removed(id) { removed.push(id); }, fx() {}, notify() {} }, { firstPlayer: 'host', turnSeconds: 30 }, mode);
  ids.forEach((id, i) => game.addPlayer(id, `P${i}`));
  t.after(() => game.dispose());
  return { game, removed };
}

function start(game, bet = 0) {
  for (const p of game.players) if (p.id !== game.hostId) game.setReady(p.id, true, game.rulesVersion);
  game.bet = bet;
  game.pot = bet * game.players.length;
  game.start(game.hostId);
}

// ---------- phòng ----------

test('người đã rời giữa ván không vào lại được ván đó; chơi lại thì xoá hẳn khỏi phòng', (t) => {
  const { game, removed } = makeGame(t, 'exploding_kittens');
  start(game);
  game.removePlayer(C);
  assert.throws(() => game.addPlayer(C, 'P2'), GameError);
  game.removePlayer(B);
  assert.equal(game.phase, 'ended');
  removed.length = 0;
  game.restart(A);
  assert.deepEqual(game.players.map((p) => p.id), [A]);
  assert.deepEqual(removed.sort(), [B, C].sort());
});

test('không kích được người chơi giữa ván; chế độ chơi không nhận khoá prototype', (t) => {
  const { game } = makeGame(t, 'exploding_kittens');
  assert.throws(() => game.setGameMode(A, 'constructor'), GameError);
  assert.throws(() => game.setGameMode(A, '__proto__'), GameError);
  start(game);
  assert.throws(() => game.kickPlayer(A, B), /phòng chờ/);
  assert.equal(game.phase, 'playing');
});

// ---------- Tiến Lên ----------

function tienLen(t) {
  const { game } = makeGame(t, 'tien_len');
  start(game);
  // Bài chia ngẫu nhiên có thể "tới trắng" ngay: đặt lại về trạng thái đang chơi
  game.phase = 'playing';
  game.winnerId = undefined;
  game.winnerIds = [];
  game.payouts = {};
  game.tlFinishOrder = [];
  game.turnDeadline = Date.now() + 30_000;
  // bày lại bài cho dễ kiểm soát
  const hands = { [A]: ['Spd-5', 'Spd-7', 'Spd-9'], [B]: ['Hrt-2', 'Clb-4'], [C]: ['Dia-6', 'Clb-8'] };
  for (const p of game.players) {
    game.tlHands.set(p.id, hands[p.id].map(pc));
    p.hand = hands[p.id].map((code) => ({ id: code, type: 'cat_taco' }));
  }
  game.tlFirstTurnOfMatch = false;
  game.tlLowestCardCode = undefined;
  game.tlTableCombo = undefined;
  game.tlLastActorId = undefined;
  game.tlPassedIds.clear();
  game.currentIdx = 0;
  return game;
}

test('Tiến Lên: người đang tới lượt rời bàn khi những người khác đã bỏ lượt → vòng mới, không ai bị khoá', (t) => {
  const game = tienLen(t);
  game.tienLenPlay(A, ['Spd-5']);
  game.tienLenPass(B);
  game.removePlayer(C); // C đang tới lượt
  const view = game.viewFor(A);
  assert.equal(view.currentPlayerId, A);
  assert.equal(view.tienLen.tableCombo, undefined); // A được đánh bộ mới, không phải tự chặn bài mình
  game.tienLenPlay(A, ['Spd-7']);
  assert.equal(game.viewFor(B).currentPlayerId, B); // B được quay lại vòng mới
  game.tienLenPlay(B, ['Hrt-2']);
});

test('Tiến Lên: lệnh rút bài / đánh lá của Mèo Nổ bị chặn', (t) => {
  const game = tienLen(t);
  assert.throws(() => game.draw(A), /Không phải ván Mèo Nổ/);
  assert.throws(() => game.play(A, { cardIds: ['Spd-5'] }), /Không phải ván Mèo Nổ/);
});

test('Tiến Lên: hết giờ tự đánh lá cuối thì về Nhất, những người còn lại đánh tiếp tới Bét', (t) => {
  const game = tienLen(t);
  game.tlHands.set(A, [pc('Spd-5')]);
  game.players[0].hand = [{ id: 'Spd-5', type: 'cat_taco' }];
  game.turnDeadline = 1;
  game.onTimer();
  assert.equal(game.phase, 'playing', 'chưa hết ván: còn 2 người có bài');
  assert.deepEqual(game.tlFinishOrder, [A]);
  assert.equal(game.current().id, B);
  assert.throws(() => game.tienLenPlay(A, ['Spd-7']), GameError, 'người đã về không đánh nữa');
  game.tienLenPlay(B, ['Hrt-2']);
  game.tienLenPass(C);
  assert.equal(game.current().id, B, 'cả bàn bỏ lượt: B mở vòng mới');
  game.tienLenPlay(B, ['Clb-4']);
  assert.equal(game.phase, 'ended');
  assert.deepEqual(game.tlFinishOrder, [A, B, C]);
  assert.equal(game.winner(), A);
  assert.equal(game.tlLastWinnerId, A, 'Nhất đi đầu ván sau');
});

test('Tiến Lên có cược: Nhất ăn Bét, chặt heo đỏ trả 1 cược, Bét thối heo đen trả ½ cược cho Nhất', (t) => {
  const game = tienLen(t);
  game.bet = 100;
  game.pot = 300;
  const hands = {
    [A]: ['Spd-5'],
    [B]: ['Hrt-2', 'Clb-4'],
    [C]: ['Spd-6', 'Clb-6', 'Spd-7', 'Clb-7', 'Spd-8', 'Clb-8', 'Dia-3', 'Spd-2'],
  };
  for (const p of game.players) {
    game.tlHands.set(p.id, hands[p.id].map(pc));
    p.hand = hands[p.id].map((code) => ({ id: code, type: 'cat_taco' }));
  }
  game.tienLenPlay(A, ['Spd-5']); // A hết bài: Nhất
  game.tienLenPlay(B, ['Hrt-2']);
  game.tienLenPlay(C, ['Spd-6', 'Clb-6', 'Spd-7', 'Clb-7', 'Spd-8', 'Clb-8']); // 3 đôi thông chặt heo đỏ
  game.tienLenPass(B);
  game.tienLenPlay(C, ['Dia-3']);
  game.tienLenPlay(B, ['Clb-4']); // B hết bài: Nhì → C Bét, còn heo đen trên tay
  assert.equal(game.phase, 'ended');
  assert.deepEqual(game.tlFinishOrder, [A, B, C]);
  assert.deepEqual(game.payouts, { [A]: 250, [B]: 0, [C]: 50 });
  assert.equal(Object.values(game.payouts).reduce((x, y) => x + y, 0), game.pot);
});

test('Tiến Lên: người giữ lá nhỏ nhất rời bàn trước nước mở đầu → người kế tiếp đánh tự do', (t) => {
  const game = tienLen(t);
  game.tlFirstTurnOfMatch = true;
  game.tlLowestCardCode = 'Spd-5';
  game.removePlayer(A);
  assert.equal(game.tlFirstTurnOfMatch, false);
  game.tienLenPlay(B, ['Clb-4']);
});

// ---------- Xì Dách 21 ----------

function blackjack(t, hands, bet = 100) {
  const { game } = makeGame(t, 'blackjack_21');
  start(game, bet);
  // Bài chia ngẫu nhiên có thể khiến ván kết thúc ngay (Nhà Cái được Xì Dách): đặt lại về trạng thái đang chơi
  game.phase = 'playing';
  game.bjOutcomes.clear();
  game.payouts = {};
  for (const [id, codes] of Object.entries(hands)) {
    game.bjHands.set(id, codes.map(pc));
    game.bjStatus.set(id, 'playing');
  }
  game.currentIdx = 1;
  game.turnDeadline = Date.now() + 30_000;
  return game;
}

test('Xì Dách: ăn thua 1:1 với Nhà Cái, Xì Bàng ×3, tổng xu bảo toàn', (t) => {
  const game = blackjack(t, { [A]: ['Spd-10', 'Hrt-9'], [B]: ['Spd-A', 'Hrt-A'], [C]: ['Spd-9', 'Hrt-7'] });
  game.finishBlackjack();
  const out = game.payouts;
  assert.equal(out[B], 100 + 300); // Xì Bàng: lấy lại cược + ×3
  assert.equal(out[C], 0); // 16 thua 19
  assert.equal(out[A], 100 + 100 - 300); // Nhà Cái: thắng C 100, thua B 300
  assert.equal(Object.values(out).reduce((s, v) => s + v, 0), game.pot);
  assert.deepEqual(game.winners(), [B]);
});

test('Xì Dách: Nhà Cái rời bàn giữa ván → huỷ ván, hoàn cược tất cả, không ai thắng', (t) => {
  const game = blackjack(t, { [A]: ['Spd-10', 'Hrt-K'], [B]: ['Spd-5', 'Hrt-7'], [C]: ['Spd-10', 'Hrt-3'] });
  game.removePlayer(A);
  assert.equal(game.phase, 'ended');
  assert.deepEqual(game.payouts, { [A]: 100, [B]: 100, [C]: 100 });
  assert.deepEqual(game.winners(), []);
});

test('Xì Dách: nhà con rời bàn tính thua; trạng thái quắc không lộ cho người khác', (t) => {
  const game = blackjack(t, { [A]: ['Spd-10', 'Hrt-9'], [B]: ['Spd-10', 'Hrt-6'], [C]: ['Spd-9', 'Hrt-8'] });
  game.bjDeck.unshift(pc('Dia-K'));
  game.currentIdx = 1;
  game.blackjackHit(B); // 26 → quắc
  assert.equal(game.viewFor(B).blackjack.players.find((p) => p.playerId === B).status, 'busted');
  assert.equal(game.viewFor(A).blackjack.players.find((p) => p.playerId === B).status, 'stood');
  const log = game.viewFor(A).log;
  assert.ok(log.some((l) => l.includes('P1 dừng lượt')));
  assert.ok(!log.some((l) => /quắc|💥/i.test(l)));
  game.removePlayer(C);
  game.blackjackStand(A);
  assert.equal(game.phase, 'ended');
  assert.equal(game.payouts[C], 0);
  assert.equal(Object.values(game.payouts).reduce((s, v) => s + v, 0), game.pot);
});

test('Xì Dách: Nhà Cái hết giờ khi chưa đủ 15 điểm thì tự rút tới khi đủ tuổi', (t) => {
  const game = blackjack(t, { [A]: ['Spd-2', 'Hrt-3'], [B]: ['Spd-10', 'Hrt-8'], [C]: ['Spd-10', 'Hrt-9'] });
  game.bjStatus.set(B, 'stood');
  game.bjStatus.set(C, 'stood');
  game.bjDeck.unshift(pc('Dia-2'), pc('Clb-3'), pc('Dia-4'), pc('Clb-K'));
  game.currentIdx = 0;
  game.turnDeadline = 1;
  game.onTimer();
  const ev = evaluateBlackjackHand(game.bjHands.get(A), true);
  assert.ok(ev.points >= 15 || ev.kind === 'bust' || game.bjHands.get(A).length === 5, `nhà cái dừng ở ${ev.points} điểm`);
});

// ---------- xu: thao tác không áp dụng 2 lần ----------

class MemoryStore {
  kind = 'local';
  content = '{"version":1,"accounts":{}}';
  version = '0';
  async read() { return { content: this.content, version: this.version }; }
  async write(content, version) {
    if (version !== this.version) throw Object.assign(new Error('conflict'), { code: 'CONFLICT' });
    this.content = content;
    this.version = String(Number(this.version) + 1);
    return this.version;
  }
}

async function accountsFixture() {
  const db = new DbService(new MemoryStore());
  await db.onModuleInit();
  const accounts = new AccountsService(db);
  for (const [id, name] of [[A, 'Một'], [B, 'Hai'], [C, 'Ba']]) await accounts.register(id, name, '1234');
  return { db, accounts };
}

const total = (db) => [A, B, C].reduce((s, id) => s + db.account(id).coins, 0);

test('xu: thu cược / trả thưởng cùng mã thao tác chỉ áp dụng một lần', async () => {
  const { db, accounts } = await accountsFixture();
  await accounts.chargeGame([A, B, C], 100, 'charge:r1');
  await accounts.chargeGame([A, B, C], 100, 'charge:r1');
  assert.equal(db.account(A).coins, 900);
  await accounts.rewardWinner(A, 300, 'payout:r1');
  await accounts.rewardWinner(A, 300, 'payout:r1');
  assert.equal(db.account(A).coins, 1200);
  assert.equal(total(db), 3000);
});

test('xu: hoàn cược chỉ khi khoản thu đã thật sự được ghi, và chỉ một lần', async () => {
  const { db, accounts } = await accountsFixture();
  assert.equal(await accounts.refundGame([A, B], 100, 'refund:r2', 'charge:r2'), false); // chưa thu → không hoàn
  assert.equal(db.account(A).coins, 1000);
  await accounts.chargeGame([A, B], 100, 'charge:r2');
  assert.equal(await accounts.refundGame([A, B], 100, 'refund:r2', 'charge:r2'), true);
  assert.equal(await accounts.refundGame([A, B], 100, 'refund:r2', 'charge:r2'), false);
  assert.equal(db.account(A).coins, 1000);
  assert.equal(db.account(B).coins, 1000);
});

test('xu: Nhà Cái Xì Dách không đủ xu trả thì cắt bớt phần lãi người thắng, tổng xu vẫn bảo toàn', async () => {
  const { db, accounts } = await accountsFixture();
  await accounts.chargeGame([A, B, C], 100, 'charge:r3');
  // Nhà Cái A chỉ còn 900; giả sử phải trả thêm 1000 (Xì Bàng lớn)
  await accounts.rewardPayouts({ [A]: -1000, [B]: 1000, [C]: 300 }, [B, C], 'payout:r3');
  assert.equal(db.account(A).coins, 0);
  assert.equal(total(db), 3000);
  await accounts.rewardPayouts({ [A]: -1000, [B]: 1000, [C]: 300 }, [B, C], 'payout:r3');
  assert.equal(total(db), 3000);
});

test('db: danh sách mã thao tác hỏng thì không nạp', async () => {
  const { parseDb } = require('../dist/server/src/store/db.service.js');
  assert.throws(() => parseDb('{"version":1,"accounts":{},"ops":{"bad id with spaces":1}}'));
  assert.doesNotThrow(() => parseDb('{"version":1,"accounts":{},"ops":{"payout:abc":1}}'));
});

test('cache tạm của test không đụng tới thư mục data thật', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meono-audit-'));
  rmSync(dir, { recursive: true, force: true });
});

// ---------- Mèo Nổ: các lá chức năng ----------

function kittens(t, hands, deck) {
  const notices = [];
  const game = new Game(
    'AUDK',
    { changed() {}, removed() {}, fx() {}, notify(id, n) { notices.push({ id, ...n }); } },
    { firstPlayer: 'host', turnSeconds: 30, nopeSeconds: 3 },
    'exploding_kittens',
  );
  [A, B, C].forEach((id, i) => game.addPlayer(id, `P${i}`));
  t.after(() => game.dispose());
  start(game);
  game.phase = 'playing';
  game.winnerId = undefined;
  game.pending = undefined;
  game.waiting = undefined;
  game.lastPlay = undefined;
  game.currentIdx = 0;
  game.turnsRemaining = 1;
  game.turnDeadline = Date.now() + 30_000;
  for (const p of game.players) {
    p.alive = true;
    p.hand = (hands[p.id] ?? []).map((type, i) => ({ id: `${p.id}-${type}-${i}`, type }));
  }
  game.deck = deck.map((type, i) => ({ id: `deck-${type}-${i}`, type }));
  game.discard = [];
  notices.length = 0;
  return { game, notices };
}
const resolve = (game) => {
  game.pending.deadline = 0;
  game.onTimer();
};
const handOf = (game, id) => game.player(id).hand;

test('Cướp Nhắm: bài đối phương úp & xáo vị trí, người cướp tự chọn đúng lá úp nào thì lấy lá đó', (t) => {
  const { game } = kittens(t, { [A]: ['mark'], [B]: ['skip', 'shuffle', 'defuse'] }, ['cat_taco', 'cat_melon']);
  game.play(A, { cardIds: [`${A}-mark-0`], targetId: B });
  resolve(game);
  assert.equal(game.waiting?.kind, 'steal_pick');
  // không ai (kể cả người cướp) thấy lá úp nào là lá nào
  for (const id of [A, B, C]) {
    const w = game.viewFor(id).waiting;
    assert.deepEqual(Object.keys(w).sort(), ['count', 'deadline', 'kind', 'playerId', 'targetId', 'via']);
    assert.equal(w.count, 3);
  }
  assert.throws(() => game.pickSteal(B, 0), GameError, 'người bị cướp không được chọn');
  assert.throws(() => game.pickSteal(A, 3), GameError);
  const expected = game.waiting.order[1];
  game.pickSteal(A, 1);
  assert.equal(game.waiting, undefined);
  assert.ok(handOf(game, A).some((c) => c.id === expected));
  assert.equal(handOf(game, B).length, 2);
  assert.equal(game.current().id, A, 'Cướp Nhắm không kết thúc lượt');
});

test('Đôi: cũng chọn lá úp; hết giờ thì bốc ngẫu nhiên; đối phương chỉ còn 1 lá thì lấy luôn', (t) => {
  const { game } = kittens(t, { [A]: ['cat_potato', 'cat_potato', 'cat_melon', 'cat_melon'], [B]: ['skip', 'shuffle'], [C]: ['defuse'] }, ['cat_beard', 'cat_potato']);
  game.play(A, { cardIds: [`${A}-cat_potato-0`, `${A}-cat_potato-1`], targetId: B });
  resolve(game);
  assert.equal(game.waiting?.kind, 'steal_pick');
  assert.equal(game.waiting.via, 'pair');
  game.waiting.deadline = 0;
  game.onTimer();
  assert.equal(game.waiting, undefined);
  assert.equal(handOf(game, A).length, 3);
  assert.equal(handOf(game, B).length, 1);
  game.play(A, { cardIds: [`${A}-cat_melon-2`, `${A}-cat_melon-3`], targetId: C });
  resolve(game);
  assert.equal(game.waiting, undefined);
  assert.ok(handOf(game, A).some((c) => c.type === 'defuse'));
});

test('người bị cướp rời bàn khi người cướp đang chọn lá úp → huỷ, lượt được gia hạn', (t) => {
  const { game } = kittens(t, { [A]: ['mark'], [B]: ['skip', 'shuffle'] }, ['cat_taco', 'cat_melon']);
  game.play(A, { cardIds: [`${A}-mark-0`], targetId: B });
  resolve(game);
  game.turnDeadline = Date.now() + 500;
  game.removePlayer(B);
  assert.equal(game.waiting, undefined);
  assert.equal(game.lastPlay.result, 'cancelled');
  assert.equal(handOf(game, A).length, 0);
  assert.ok(game.turnDeadline > Date.now() + 5_000);
});

test('Chôn Bài: xem riêng lá trên cùng, chôn vào giữa chồng (không nổ) rồi hết lượt', (t) => {
  for (let i = 0; i < 20; i++) {
    const { game, notices } = kittens(t, { [A]: ['bury'] }, ['exploding', 'cat_taco', 'cat_melon', 'skip']);
    game.play(A, { cardIds: [`${A}-bury-0`] });
    resolve(game);
    assert.equal(game.deck.length, 4);
    assert.notEqual(game.deck[0].type, 'exploding', 'lá bị chôn không nằm lại trên cùng');
    assert.ok(game.player(A).alive);
    assert.equal(game.current().id, B);
    const seen = notices.find((n) => n.id === A);
    assert.deepEqual(seen.cards, ['exploding']);
    assert.ok(!notices.some((n) => n.id !== A), 'chỉ người đánh mới thấy lá bị chôn');
  }
});

test('Đào Sâu: dòng nhật ký giống nhau dù có né lá trên cùng hay không', (t) => {
  const lines = [];
  for (const deck of [['exploding', 'cat_taco', 'skip'], ['cat_taco', 'skip', 'shuffle']]) {
    const { game } = kittens(t, { [A]: ['dig_deeper', 'defuse'] }, deck);
    game.play(A, { cardIds: [`${A}-dig_deeper-0`] });
    resolve(game);
    lines.push(game.log.find((l) => l.includes('Đào Sâu rút')));
  }
  assert.equal(lines[0], lines[1]);
});

test('Hé Lộ Tương Lai: được sắp xếp lại, người kế tiếp thấy đúng thứ tự mới; sai số lá thì báo lỗi', (t) => {
  const { game, notices } = kittens(t, { [A]: ['share_future'] }, ['exploding', 'cat_taco', 'skip', 'shuffle']);
  game.play(A, { cardIds: [`${A}-share_future-0`] });
  resolve(game);
  assert.equal(game.waiting?.kind, 'alter_future');
  const ids = game.waiting.cards.map((c) => c.id);
  assert.throws(() => game.alterFuture(A, ids.slice(1)), GameError);
  game.alterFuture(A, [...ids].reverse());
  assert.equal(game.waiting, undefined);
  assert.equal(game.deck[0].type, 'skip');
  const toB = notices.find((n) => n.id === B);
  assert.deepEqual(toB.cards, ['skip', 'cat_taco', 'exploding']);
});

test('Nhân Bản đánh lẻ: sao chép lá chức năng vừa có hiệu lực, chưa có thì báo lỗi', (t) => {
  const { game } = kittens(t, { [A]: ['clone', 'skip'], [B]: ['clone'] }, ['cat_taco', 'cat_melon', 'shuffle']);
  assert.throws(() => game.play(A, { cardIds: [`${A}-clone-0`] }), /Nhân Bản/);
  game.play(A, { cardIds: [`${A}-skip-1`] });
  resolve(game);
  assert.equal(game.current().id, B);
  game.play(B, { cardIds: [`${B}-clone-0`] });
  assert.equal(game.pending.kind, 'skip');
  resolve(game);
  assert.equal(game.current().id, C, 'Nhân Bản mang hiệu ứng Bỏ Lượt');
});

test('người bị Xin Bài rời bàn trước khi hết giờ Nope → hành động không còn tác dụng', (t) => {
  const { game } = kittens(t, { [A]: ['favor'], [B]: ['skip'] }, ['cat_taco', 'cat_melon', 'shuffle']);
  game.play(A, { cardIds: [`${A}-favor-0`], targetId: B });
  game.removePlayer(B);
  resolve(game);
  assert.equal(game.lastPlay.result, 'cancelled');
  assert.equal(game.waiting, undefined);
  assert.equal(handOf(game, A).length, 0);
});

test('người phải đưa bài rời bàn → lượt người xin được gia hạn, không bị tự rút ngay', (t) => {
  const { game } = kittens(t, { [A]: ['favor'], [B]: ['skip'] }, ['cat_taco', 'cat_melon', 'shuffle']);
  game.play(A, { cardIds: [`${A}-favor-0`], targetId: B });
  resolve(game);
  assert.equal(game.waiting?.kind, 'favor_give');
  game.turnDeadline = Date.now() + 500;
  game.removePlayer(B);
  assert.equal(game.waiting, undefined);
  assert.ok(game.turnDeadline > Date.now() + 5_000);
  assert.equal(game.current().id, A);
});

test('Xì Dách: phòng 10 người chia bài được, người thứ 11 không vào được', (t) => {
  const ids = Array.from({ length: 10 }, (_, i) => `player_bj${String(i).padStart(2, '0')}`);
  const { game } = makeGame(t, 'blackjack_21', ids);
  assert.equal(game.roomRules.maxPlayers, 10);
  assert.throws(() => game.addPlayer('player_bj10', 'P10'), GameError);
  start(game);
  assert.equal(game.phase === 'playing' || game.phase === 'ended', true);
  assert.equal(game.bjDeck.length, 52 - 20);
  for (const id of ids) assert.equal(game.bjHands.get(id).length, 2);
});
