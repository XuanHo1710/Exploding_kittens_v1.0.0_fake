'use strict';

// Rời phòng giữa ván rồi vào phòng khác: không được nhận trạng thái / hiệu ứng của phòng cũ nữa.
require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Logger } = require('@nestjs/common');
const { RoomsService } = require('../dist/server/src/game/rooms.service.js');

Logger.overrideLogger(false);

function setup(t) {
  const events = [];
  const accounts = { get: () => undefined, info: () => null, chargeGame: async () => true, refundGame: async () => true, rewardWinner: async () => true, rewardPayouts: async () => true };
  const server = {
    to(room) { return { emit(event, value) { events.push({ room, event, value }); } }; },
    in() { return { fetchSockets: async () => [] }; },
  };
  const rooms = new RoomsService(accounts);
  rooms.bind(server);
  t.after(() => { for (const g of rooms.rooms.values()) g.dispose(); });
  return { rooms, events };
}

const A = 'player_leave_a', B = 'player_leave_b', C = 'player_leave_c', D = 'player_leave_d';

test('rời phòng đang chơi rồi vào phòng khác thì không bị kéo về phòng cũ', async (t) => {
  const { rooms, events } = setup(t);
  rooms.create(B, 'B', undefined, undefined, 'tien_len');
  const old = rooms.roomOf(B);
  rooms.join(old.code, A, 'A');
  rooms.join(old.code, C, 'C');
  rooms.setReady(A, true, old.rulesVersion);
  rooms.setReady(C, true, old.rulesVersion);
  await rooms.startGame(B);
  old.phase = 'playing';
  assert.equal(old.phase, 'playing');

  rooms.create(D, 'D');
  const next = rooms.roomOf(D);
  rooms.join(next.code, A, 'A'); // A bỏ ván đang chơi, sang phòng mới
  assert.equal(rooms.roomOf(A), next);
  const lastToA = () => events.filter((e) => e.room === `p:${A}` && e.event === 'state').at(-1)?.value;
  assert.equal(lastToA()?.code, next.code, 'A thấy phòng mới');

  events.length = 0;
  // phòng cũ tiếp tục có thay đổi (đổi người kết nối, biểu cảm, chat)
  old.setConnected(B, false);
  old.setConnected(B, true);
  rooms.emote(B, '😂');
  rooms.chat(B, 'alo');
  const toA = events.filter((e) => e.room === `p:${A}`);
  assert.deepEqual(toA.map((e) => e.event), [], 'A không nhận gì từ phòng cũ');
  assert.ok(events.some((e) => e.room === `p:${C}` && e.event === 'state'), 'người còn trong phòng cũ vẫn nhận');
});

test('vào phòng thất bại thì vẫn ở phòng cũ; người mới vào nhận ngay trạng thái phòng', (t) => {
  const { rooms, events } = setup(t);
  rooms.create(B, 'B');
  const room = rooms.roomOf(B);
  rooms.join(room.code, A, 'A');
  assert.equal(events.filter((e) => e.room === `p:${A}` && e.event === 'state').at(-1)?.value?.code, room.code);
  assert.throws(() => rooms.join('ZZZZ', A, 'A'));
  assert.equal(rooms.roomOf(A), room);
});
