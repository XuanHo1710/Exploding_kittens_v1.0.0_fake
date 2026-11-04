# Tasks: Nối Thú Đại Chiến (nối hình kiểu "Pikachu", solo 1v1 realtime, 2 màn + boss)

**Input**: `plan.md`, `research.md` (R1–R11), `data-model.md`, `contracts/socket.md`, `quickstart.md` trong `specs/002-noi-thu-dai-chien/`. Chưa có `spec.md`, nên các user story lấy từ phần Phases của plan.md.

**Tests**: Có. quickstart.md yêu cầu 14 kịch bản trong `server/test/link-duel.test.cjs`. Mỗi story viết test trước, rồi mới viết code.

**Build/Test**: `cd server && npm test` (tự build, chạy `node --test test/*.test.cjs` trên `dist/`) và `cd client && npx tsc --noEmit`.

**Khuôn mẫu**: làm theo đúng cách Đế Chế Kiến cắm vào hệ thống:
- `server/src/game/game.ts`: `antsConfig` dòng ~173, `setGameMode` ~203, `validateStart` ~255, `start` ~476, `restart` ~529, `viewFor` ~1295/~1337, `setAntsConfig`/`antsCommand`/`startAnts`/`syncAnts`/`sendAntsFrames`/`antsView` ~1345–1430, `dispose` ~1454, `eliminate` ~2014.
- `server/src/game/rooms.service.ts`: hook `antsFrame` ~34, `create()` ~345.
- `client/src/App.tsx`: ~114 và ~211.

**Ràng buộc chung**:
- Không sửa `client/vite.config.ts`, `server/src/main.ts`, `server/data/db.json`.
- Khi thử, chỉ dùng server test cô lập với `ACCOUNT_STORAGE=local`. Tắt tiến trình bằng `ps` rồi `kill <pid>`, không dùng `pkill -f`.
- Không dùng hình, tên hay nhân vật Pokémon (research R1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: làm song song được (khác file, không phụ thuộc việc chưa xong)
- **US1** = Màn 1 Đua Nối · **US2** = Màn 2 Đấm Boss · **US3** = Máy làm đối thủ · **US4** = Hiệu ứng "ngầu lòi"

---

## Phase 1: Setup

- [X] T001 Chạy `cd server && npm test` và `cd client && npx tsc --noEmit` để ghi nhận mốc ban đầu: toàn bộ test qua, ví dụ 164/164. Các bài được chạy nằm trong `server/test/`.

---

## Phase 2: Foundational (chặn mọi story)

- [X] T002 Tạo `shared/src/link.ts` gồm:
  - **Hằng số** (data-model.md): `LINK_W = 16`, `LINK_H = 9`, `LINK_KINDS = 36`, `LINK_MAX_TURNS = 2`, `LINK_STAGE1_S = 150`, `LINK_STAGE2_S = 180`, `LINK_INTERMISSION_S = 5`, `LINK_COMBO_WINDOW_S = 3`, `LINK_BOSS_HP = 4000`, `LINK_CMD_RATE = 8`, `LINK_HINT_CD_S = 15`, `LINK_HINT_COST = 5`, `LINK_KO_BONUS = 500`, `LINK_CLEAR_BONUS = 300`, `LINK_CLEAR_PER_S = 20`.
  - **Điểm Màn 1**: `linkPairPoints(combo) = 10 + 5 * Math.min(combo, 6)`, với combo tính từ 0 cho cặp đầu.
  - **Sát thương Màn 2**: `linkPairDamage(combo, long) = Math.round(25 * (1 + 0.15 * Math.min(combo, 6))) + (long ? 20 : 0)`. `LINK_SUPER_DMG = 400`.
  - **Sấm**: `LINK_THUNDER_PER_PAIR = 8`, cộng thêm `+2 × min(combo, 6)`, tối đa 100.
  - **Boss**: chu kỳ ra đòn `LINK_BOSS_SKILL_S = [12, 9, 6]` theo giai đoạn 1/2/3. Ngưỡng đổi giai đoạn là 66% và 33% máu.
  - **Chiêu**: `freeze` băng 6 ô trong 8 giây; `ice` của boss băng 4 ô trong 6 giây; `dark` che bàn 3 giây.
  - **Bộ thú**: `LINK_CRITTERS: { id: number; name: string; color: string }[]`, gồm 36 con thú tự đặt tên tiếng Việt (Chuột Điện, Mèo Lửa, Ếch Lá, Cá Nước, Cú Đêm, Rùa Đá, Bướm Gió, Gấu Băng …), **không dùng tên Pokémon**.
  - **Kiểu dữ liệu**:
    - `LinkStage = 'stage1' | 'intermission' | 'stage2' | 'ended'`;
    - `LinkConfig { botLevel: 'easy' | 'normal' | 'hard' }`, `DEFAULT_LINK_CONFIG = { botLevel: 'normal' }`, cùng `normalizeLinkConfig(raw)` (giá trị lạ thì về `'normal'`);
    - `LinkCommand`, `LinkState`, `LinkFx`, `LinkRoomView`, đúng y như trong `contracts/socket.md` và `data-model.md`.
  - **Tiện ích**: `linkIdx(x, y) = y * LINK_W + x`.
- [X] T003 Trong `shared/src/protocol.ts`:
  - Thêm `'link_duel'` vào `GameMode` (dòng 8).
  - Thêm mục vào `GAME_MODES`: `{ name: 'Nối Thú Đại Chiến', shortName: 'Nối Thú', emoji: '⚡', minPlayers: 1, maxPlayers: 2, desc: 'Nối hình solo 1v1 realtime: Màn 1 đua dọn bàn, Màn 2 cùng đấm Boss Vua Sấm Sét!' }`.
  - Thêm `link?: LinkRoomView` vào `RoomView`, cạnh `ants?` ở dòng ~230.
  - Trong `shared/src/index.ts`, thêm `export * from './link';`.
- [X] T004 Tạo `server/test/link-duel.test.cjs` với khung `require('../dist/server/src/game/link/board.js')`, `require('../dist/server/src/game/link/duel.js')`, `require('../dist/shared/src/index.js')`, cùng các helper:
  - `steps(d, ms)`: gọi `d.tick(ms)` theo bước 250 ms, dùng đồng hồ giả, không dùng `setInterval`.
  - `pairs(board)`: liệt kê mọi cặp nối được.

  Viết trước các test cho bàn (quickstart #1, #2, #3, #6). Các test này phải **FAIL** trước khi làm T005:
  - **#1** `findPath`: nối thẳng, chữ L, chữ Z, chữ U ra mép bàn đều được; trường hợp cần 3 lần rẽ thì trả về `null`.
  - **#2** 200 seed: mỗi bàn đủ 144 ô, mỗi loại đúng 4 ô, `hasMove()` luôn đúng.
  - **#3** cùng seed thì ra 2 bàn giống hệt.
  - **#6** dọn bàn đến khi chỉ còn các ô kẹt rồi gọi `ensureMove()`: bàn bị xáo và lại có nước đi.
- [X] T005 Tạo `server/src/game/link/board.ts` gồm:
  - **`class LinkBoard`**: có `cells: Int8Array(144)` (`-1` là ô trống), `ice: Map<number, number>` và `rng` có seed (mulberry32).
  - **`static generate(seed)`**: xếp ngược từng cặp, mỗi cặp vào 2 ô trống nối được với nhau. Kẹt thì làm lại, tối đa 50 lần; quá 50 lần thì xếp ngẫu nhiên rồi gọi `ensureMove`.
  - **`findPath(a, b, now)`**: chạy BFS 0-1 trên lưới có viền 18×11 với trạng thái (ô, hướng), chi phí là số lần rẽ và tối đa `LINK_MAX_TURNS`. Trả về danh sách điểm gấp khúc, mỗi điểm là chỉ số ô hoặc `-1-k` cho ô viền, hoặc `null` nếu không nối được.
    - Trả `null` khi: a hoặc b trống, khác loại, `a === b`, hoặc một trong hai ô còn băng (`ice.get(i) > now`).
    - Ô đang băng vẫn chặn đường đi.
  - **Các hàm khác**:
    - `remove(a, b)`
    - `hint(now)` trả về một cặp nối được hoặc `undefined`
    - `hasMove(now)`
    - `shuffle()` chỉ xáo các ô còn hình
    - `ensureMove(now)` xáo tối đa 30 lần đến khi có nước đi
    - `freeze(n, ms, now)` chọn ngẫu nhiên n ô còn hình
    - `filledBits()` trả về `number[144]` gồm 0/1
    - `isEmpty()`

**Checkpoint**: chạy `cd server && npm test`; các test #1, #2, #3, #6 qua.

---

## Phase 3: User Story 1 – Màn 1 Đua Nối (P1) 🎯 MVP

**Goal**: Hai người, mỗi người một bàn cùng seed, thi nhau nối nhanh:
- có combo, điểm và thanh Sấm;
- Sấm đầy thì tung Đóng Băng hoặc Bão Xáo sang bàn đối thủ;
- dọn sạch bàn hoặc hết 150 giây thì sang màn nghỉ.

**Independent Test**: Tạo `LinkDuel` cho 2 người và chạy bằng đồng hồ giả:
- nối 3 cặp trong 3 giây được 10 + 15 + 20 điểm;
- nối sai thì combo về 0;
- dùng `freeze` khi Sấm = 100 thì đối thủ có 6 ô băng;
- dọn sạch bàn thì `stage === 'intermission'`.

Trên trình duyệt, phòng 2 người chơi trọn Màn 1.

### Tests cho US1

- [X] T006 [US1] Trong `server/test/link-duel.test.cjs`, thêm các test:
  - **#4** `match` sai: khác loại, bị chặn hoặc ô băng. Phải trả lỗi `'Hai ô này không nối được.'`, combo về 0 và bàn không đổi.
  - **#5** combo: 3 cặp liên tiếp được tổng `10 + 15 + 20`; chờ quá 3 giây thì combo về 0.
  - **#7** `skill freeze`: thiếu Sấm thì báo `'Chưa đủ Sấm.'`. Có Sấm = 100 thì đối thủ có 6 ô băng, sau 8 giây tự hết, và Sấm về 0.
  - **#8** dọn sạch Màn 1: người dọn được `+300 + 20 × số giây còn lại`, trận chuyển `intermission`, rồi 5 giây sau chuyển `stage2`. Người thắng Màn 1 vào màn 2 với `thunder = 50`.
  - **#12** gửi 20 lệnh trong 1 giây: từ lệnh thứ 9 bị báo `'Thao tác nhanh quá.'`.
  - **#13** `stateFor(p0)` không chứa `cells` của p1, chỉ có `foe.filled` gồm 0/1.

### Implementation cho US1

- [X] T007 [US1] Tạo `server/src/game/link/duel.ts` với `class LinkDuel`:
  - **Khởi tạo**: `constructor(players: {id, name, bot}[2], cfg: LinkConfig, hooks: { changed(): void; state(): void }, now = Date.now)`.
  - **Mỗi người chơi** (`LinkPlayer` theo data-model.md): `board`, `score1`, `damage`, `ko`, `combo`, `lastMatchAt`, `thunder` (0..100), `hintReadyAt`, `cleared1`, `tokens`, `resigned`.
  - **Đồng hồ**:
    - `start()` chạy `setInterval(() => this.tick(250), 250)`;
    - `stop()` dừng nó;
    - `tick(ms)` tăng đồng hồ trận `this.t`, xử lý hết băng, hết combo, hết giờ màn và đổi màn. Test gọi thẳng `tick(ms)`, không cần timer thật.
  - **Màn 1**: bắt đầu bằng `stage1`, cả hai người dùng `LinkBoard.generate(seed1)`.
- [X] T008 [US1] Trong `server/src/game/link/duel.ts`, viết `command(playerId, cmd): string | undefined` theo `contracts/socket.md`:
  - **Kiểm tra chung**:
    - token bucket 8 lệnh/giây, báo `'Thao tác nhanh quá.'`;
    - `stage === 'intermission'` báo `'Chờ chút, màn mới sắp bắt đầu.'`; `stage === 'ended'` báo `'Trận chưa bắt đầu.'`;
    - `a`/`b` phải là số nguyên trong `0..143`, nếu không báo `'Lệnh không hợp lệ.'`.
  - **`match`**: gọi `findPath`.
    - Nối được: `remove`, cập nhật combo (nối trong `LINK_COMBO_WINDOW_S` thì tăng, không thì về 0), cộng `linkPairPoints` vào `score1`, cộng Sấm, đẩy `fx {k:'match', who, a, b, path, combo, pts}`, gọi `ensureMove`. Bàn trống thì dọn sạch và có thưởng.
    - Không nối được: combo về 0, trả `'Hai ô này không nối được.'`.
  - **`hint`**: còn hồi thì báo `'Gợi ý đang hồi.'`. Nếu không thì trừ 5 điểm, đặt `hintReadyAt`, rồi gửi `me.hint` trong state.
  - **`skill`**: chỉ dùng ở `stage1`, cần `thunder === 100`.
    - `freeze`: băng 6 ô trên bàn đối thủ trong 8 giây.
    - `storm`: `shuffle()` rồi `ensureMove()` bàn đối thủ.
    - Sau đó đẩy `fx skill`.
  - **`resign`**: kết thúc trận, người còn lại thắng.
  - Mỗi lần trạng thái đổi thì gọi `hooks.state()`.
- [X] T009 [US1] Trong `server/src/game/link/duel.ts`, viết chuyển màn:
  - Một người dọn sạch bàn hoặc hết `LINK_STAGE1_S` thì chuyển `intermission`, kéo dài `LINK_INTERMISSION_S`.
  - Người có `score1` cao hơn được `thunder = 50` khi vào `stage2`.
  - Viết `stateFor(playerId | undefined): LinkState` đúng contract:
    - người chơi nhận `me` đầy đủ, còn `foe` chỉ có `filled` 0/1;
    - người xem nhận `players[]`;
    - `fx` lấy ra rồi xoá sau mỗi lần dựng state cho mọi người, dùng một bộ đệm fx cho mỗi lần gửi.
  - Viết thêm `roomView(): LinkRoomView`.
- [X] T010 [US1] Nối vào `server/src/game/game.ts` theo khuôn ants:
  - Thêm `linkConfig: LinkConfig` và `private link?: LinkDuel`.
  - `setGameMode`: maxPlayers 2 cho `link_duel`.
  - `validateStart`: 1–2 người; 1 người thì sẽ thêm máy.
  - `start`: gọi `startLink()`; `restart`/`dispose`: gọi `link?.stop()`.
  - `viewFor`: thêm `link: this.gameMode === 'link_duel' ? this.link?.roomView() ?? { stage: 'lobby', config } : undefined`; `currentPlayerId` để `undefined`.
  - Thêm `setLinkConfig(byId, raw)`. Chỉ chủ phòng được chỉnh, và chỉ khi ở phòng chờ.
  - Thêm `linkCommand(playerId, cmd)`. Trận chưa chạy thì báo `'Trận chưa bắt đầu.'`; người xem thì báo `'Bạn đang xem trận này.'`.
  - Hook `state` → `sendLinkStates()` gửi qua `GameHooks.linkState(game, playerId | undefined, state)` cho từng người chơi và người xem.
  - Hook `changed` → `syncLink()`: khi trận `ended` thì trả cược. Người thắng nhận cả tiền cược; hòa thì chia đôi; máy thắng thì hoàn cược.
  - `eliminate` (~2014): gọi `link.command(id, {t:'resign'})`.
- [X] T011 [US1] Trong `server/src/game/rooms.service.ts`:
  - Thêm hook `linkState`, gom trong 50 ms rồi `this.server.to('p:'+id).emit('link:state', state)`. Người xem nhận bản `stateFor(undefined)`.
  - Thêm `setLinkConfig`.
  - Ở `create()` dòng ~345, nhận thêm `'link_duel'`.

  Trong `server/src/game/game.gateway.ts`, thêm `@SubscribeMessage('link:cmd')` (kiểm tra `typeof body?.t === 'string'`, rồi gọi `this.game(me).linkCommand`) và `@SubscribeMessage('link:config')`.
- [X] T012 [P] [US1] Tạo `client/src/link/tiles.ts`:
  - **`drawCritter(ctx, id, x, y, size)`** vẽ 36 con thú tự thiết kế. Mỗi con gồm thân tròn hoặc bầu dục màu `LINK_CRITTERS[id].color`, mắt, tai, sừng hoặc vây, khác nhau theo `id % 6` và `Math.floor(id / 6)`, nét viền đậm kiểu sprite.
  - **`tileCanvas(id, size, dpr)`** cache ô dựng sẵn: nền kem `#f6e7c8`, viền nâu, bóng nổi 3D giống ảnh mẫu, có con thú ở giữa.
  - Không chép bất kỳ nhân vật có bản quyền nào.
- [X] T013 [P] [US1] Tạo `client/src/link/store.ts`:
  - `linkStore.push(state)` giữ state mới nhất và nối `fx` vào hàng đợi hiệu ứng có thời điểm bắt đầu.
  - Có `subscribe()` và `reset(code, startedAt)`.
- [X] T014 [US1] Tạo `client/src/components/LinkBoard.tsx`, phủ toàn màn hình giống `AntsBoard.tsx`:
  - **Bàn của mình**: canvas 16×9 ô vẽ bằng `tileCanvas`.
  - **Bấm ô**:
    - lần 1 chọn ô (viền vàng phát sáng);
    - lần 2 gửi `link:cmd {t:'match', a, b}`;
    - bấm lại ô đang chọn thì bỏ chọn;
    - nối sai thì 2 ô rung đỏ 300 ms.
  - **Ô băng**: phủ xanh băng, có vạch đếm ngược.
  - **HUD**: điểm, combo (×n), thanh ⚡ Sấm, đồng hồ màn, nút 💡 Gợi ý (hiện thời gian hồi), và khi Sấm = 100 thì 2 nút **❄️ Đóng Băng** / **🌪️ Bão Xáo**.
  - **Bàn nhỏ đối thủ**: vẽ từ `foe.filled`, kèm tên, điểm, combo.
  - **Màn nghỉ**: chữ to "MÀN 1 KẾT THÚC → BOSS XUẤT HIỆN" đếm ngược 5 giây.
  - **Màn hình kết thúc**: bảng tổng điểm, nút chơi lại (chủ phòng), nút rời phòng.
  - Import `'../link/link.css'`.
- [X] T015 [P] [US1] Tạo `client/src/link/link.css`: khung toàn màn, HUD, thanh Sấm, các nút chiêu, bàn nhỏ, màn nghỉ, thẻ kết quả. Có `@media (max-width: 760px)`.
- [X] T016 [US1] Trong `client/src/App.tsx`:
  - Thêm `s.on('link:state', (st) => linkStore.push(st))` cạnh dòng ~114.
  - Hiện `<LinkBoard view meId emit chat dock/>` khi `view.gameMode === 'link_duel' && view.link && view.phase !== 'lobby'`, cạnh dòng ~211.

  Trong `client/src/components/Home.tsx` dòng ~32: `maxPlayers` = 2 cho `link_duel`.

**Checkpoint**:
- `npm test`: các test #4, #5, #7, #8, #12, #13 qua.
- Mở 2 trình duyệt với 2 tài khoản test, chơi được Màn 1, thấy bàn nhỏ của đối thủ cập nhật và dùng được chiêu.

---

## Phase 4: User Story 2 – Màn 2 Đấm Boss (P1)

**Goal**: Sau màn nghỉ, cả hai người có bàn mới và cùng đánh Vua Sấm Sét (4000 máu):
- mỗi cặp nối được gây sát thương, có combo và "Cú Đấm Xa";
- Sấm đầy thì tung Siêu Đấm 400;
- boss có 3 giai đoạn, tung Mưa Băng / Bóng Tối / Lốc Xáo lên bàn cả hai người;
- ai ra cú kết liễu được KO +500;
- tính tổng điểm và trả cược.

**Independent Test**: Chạy `LinkDuel` bằng đồng hồ giả, vào `stage2`:
- nối 1 cặp thì boss mất ≥ 25 máu;
- `super` trừ 400 máu;
- máu xuống dưới 66% thì có `fx boss rage` và chu kỳ ra đòn còn 9 giây;
- đánh boss về 0 máu thì trận `ended`, người ra đòn cuối có `ko`, người có `total` cao hơn thắng.

### Tests cho US2

- [X] T017 [US2] Trong `server/test/link-duel.test.cjs`, thêm các test:
  - **#9** sát thương: một cặp thường gây đúng `linkPairDamage(0, false)`; cặp có đường dài hơn 10 ô cộng thêm 20; `super` cần Sấm = 100 và gây 400.
  - **#10** giai đoạn và chu kỳ đòn:
    - từ 100% còn 65% máu thì `phase` = 2 và có fx `rage`;
    - các đòn đi lần lượt theo vòng `ice → dark → shuffle`;
    - khoảng cách giữa các đòn là 12 / 9 / 6 giây;
    - đòn `ice` băng 4 ô trên **cả 2 bàn**; đòn `dark` đặt `me.dark ≈ 3000`.
  - **#11** KO:
    - người ra đòn cuối có `ko = true`;
    - `result.totals[id] = score1 + damage + 500`, và người có tổng cao hơn là `winnerId`;
    - tổng bằng nhau thì không có `winnerId`;
    - hết 180 giây mà boss còn sống thì không ai được KO.
  - Thêm 1 test: dọn sạch bàn ở màn 2 thì nhận bàn mới.

### Implementation cho US2

- [X] T018 [US2] Trong `server/src/game/link/duel.ts`:
  - **Vào `stage2`**: tạo `boss = { hp: 4000, maxHp: 4000, phase: 1, nextSkillAt: t + 12000, skillIdx: 0, darkUntil: {} }`, phát bàn mới `LinkBoard.generate(seed2)` cho cả hai người, đẩy `fx boss rage phase 1` làm màn ra mắt boss.
  - **`match` trong `stage2`**: `dmg = linkPairDamage(combo, pathLength > 10)`, cộng vào `damage`, trừ máu boss, đẩy `fx hit {who, dmg, long, combo}`.
  - **`super`**: chỉ dùng ở `stage2`, cần Sấm = 100, gây 400 sát thương, đẩy `fx super`.
  - **Dọn sạch bàn ở `stage2`**: phát bàn mới (seed mới, giống nhau cho cả hai người) và đẩy `fx clear`.
- [X] T019 [US2] Trong `server/src/game/link/duel.ts`, phần boss trong `tick`:
  - **Đổi giai đoạn**: máu dưới 66% thì phase 2, dưới 33% thì phase 3. Mỗi lần đổi đẩy `fx boss rage`.
  - **Ra đòn**: khi `t ≥ nextSkillAt`, tung đòn `['ice', 'dark', 'shuffle'][skillIdx++ % 3]` lên bàn của **cả hai** người:
    - `ice`: `freeze(4, 6000)`;
    - `dark`: `darkUntil = t + 3000`;
    - `shuffle`: `shuffle()` rồi `ensureMove()`.
  - Sau đó đặt `nextSkillAt = t + LINK_BOSS_SKILL_S[phase - 1] * 1000` và đẩy `fx boss {kind, phase}`.
  - **Kết thúc**: boss về 0 máu thì người ra đòn cuối có `ko = true`, đẩy `fx ko`, trận `ended`. Hết `LINK_STAGE2_S` thì cũng `ended`.
  - **Kết quả**: `result = { winnerId?, totals, reason }`, với `totals = score1 + damage + (ko ? 500 : 0)`.
  - **Bảo mật bàn**: trong lúc `dark`, `stateFor` vẫn gửi `cells` để client vẽ úp ô. Chỉ client che, server không giấu.
- [X] T020 [US2] Trong `client/src/components/LinkBoard.tsx`, phần Màn 2:
  - **Dải boss phía trên**: canvas vẽ Vua Sấm Sét theo thiết kế riêng: thú khổng lồ có sừng tia chớp, mắt phát sáng, khác màu theo giai đoạn 1/2/3. Có thanh máu nhiều đoạn với phần máu vừa mất màu trắng tụt dần, tên boss, số giai đoạn, và "Đòn kế: Xs".
  - **Bảng sát thương**: sát thương của mình và của đối thủ, kèm vạch tỉ lệ ai đánh nhiều hơn.
  - **Khi đang `dark`**: bàn mình chỉ hiện mặt sau các ô, kèm chữ "BÓNG TỐI!".
  - **Nút ⚡ SIÊU ĐẤM** khi Sấm = 100.

**Checkpoint**: `npm test` (#9, #10, #11 qua); trên trình duyệt chơi qua Màn 2 tới lúc boss bị K.O. và thấy bảng kết quả.

---

## Phase 5: User Story 3 – Máy làm đối thủ (P2)

**Goal**: Phòng 1 người bấm Bắt đầu thì có máy vào đấu, với 3 mức Dễ / Thường / Khó theo research R9.

**Independent Test**: Chạy `LinkDuel` với 1 người và 1 máy Khó, giả lập 330 giây: máy tự nối nhiều cặp, trận `ended`, có `result`.

- [X] T021 [US3] Trong `server/test/link-duel.test.cjs`, thêm test **#14**:
  - Máy `'hard'` với người không làm gì, chạy `tick` tổng 340 giây.
  - Kỳ vọng: `score1` của máy > 0, `damage` của máy > 0, `stage === 'ended'`.
  - Máy không bao giờ nhận lỗi `'Hai ô này không nối được.'`; nếu có thì máy đang đọc sai bàn.
- [X] T022 [US3] Tạo `server/src/game/link/bot.ts` với `runLinkBot(duel, player, now)`. Hàm được gọi từ `LinkDuel.tick`.
  - **Khi đến `player.nextBotAt`**:
    - chọn một cặp từ `board.hint(now)`;
    - gửi `command(player.id, {t:'match', ...})`;
    - hẹn lần sau theo độ khó: easy 2,8–4,0 s, normal 1,6–2,6 s, hard 0,9–1,5 s;
    - có 20% / 10% / 5% khả năng "nghĩ lâu" ×2.
  - **Dùng chiêu khi Sấm = 100**:
    - easy: ngẫu nhiên giữa `freeze` và `storm`;
    - normal: dùng ngay `freeze`;
    - hard: dùng `storm` khi đối thủ có `combo ≥ 2`, không thì `freeze`;
    - ở `stage2` thì dùng `super`.
  - **Bỏ qua** lúc `intermission`, `ended`, hoặc khi bàn đang `dark`.
- [X] T023 [US3] Trong `server/src/game/game.ts`, hàm `startLink()`:
  - Phòng có 1 người thì thêm máy `{ id: 'bot:link', name: 'Máy ' + nhãn độ khó, bot: true }` vào `LinkDuel`.
  - `syncLink` hoàn cược khi máy thắng hoặc hòa, cùng cách `syncAnts` làm khi máy thắng.
- [X] T024 [P] [US3] Trong `client/src/components/Lobby.tsx`, thêm cấu hình cho `link_duel` theo khuôn chip `ants:config` (dòng ~231):
  - Chủ phòng chọn độ khó Dễ / Thường / Khó, gửi `emit('link:config', { config })`.
  - Thêm điều kiện `deckOk`: `online` từ 1 đến 2. Khi chỉ có 1 người, hiện dòng "Máy sẽ vào đấu với bạn".
  - Thêm danh sách tóm tắt luật: luật nối 2 lần gấp khúc, Màn 1 150 giây với Sấm/chiêu, Màn 2 boss 4000 máu, KO +500, cách tính tổng điểm.

**Checkpoint**: chạy `npm test` (#14 qua); vào phòng 1 người thì chơi được trọn trận với máy.

---

## Phase 6: User Story 4 – Hiệu ứng "ngầu lòi" (P2)

**Goal**: Mỗi cú nối và cú đấm có cảm giác mạnh:
- đường nối phát sáng;
- ô nổ tung thành hạt;
- tia sét bay từ cặp ô lên boss, boss giật lùi và chớp trắng;
- số sát thương bay lên, to dần theo combo;
- rung màn hình;
- Siêu Đấm lóe trắng toàn màn;
- boss nổi giận đổi màu và gầm;
- K.O. có chậm lại và chữ "K.O.!".

**Independent Test**: Chơi thử trên trình duyệt thấy đủ các hiệu ứng trên, giữ trên 50 hình/giây ở khung 1600×900, console không lỗi.

- [X] T025 [P] [US4] Tạo `client/src/link/fx.ts` với `drawFx(ctx, fxQueue, now, layout)`, vẽ theo từng loại fx:
  - **`match`**: polyline theo `path`, nét vàng-trắng có `shadowBlur` phát sáng trong 280 ms; 2 ô nổ thành khoảng 14 hạt màu thú; chữ "+pts" bay lên.
  - **`hit`**: tia sét zigzag ngẫu nhiên đi từ giữa cặp ô lên boss trong 220 ms; số sát thương bay lên ở boss, to dần theo combo, cộng chữ "ĐẤM XA!" khi có `long`; boss giật lùi 8 px và chớp trắng.
  - **`super`**: toàn màn trắng mờ 150 ms, rung màn 14 px trong 500 ms, 5 tia sét lớn đánh xuống boss, chữ "SIÊU ĐẤM!".
  - **`skill`**: quả cầu băng hoặc lốc xoáy bay sang bàn nhỏ đối thủ.
  - **`boss`**:
    - `rage`: boss phóng to 1,15 lần, viền đỏ, chữ "VUA SẤM SÉT NỔI GIẬN!";
    - `ice`: mảnh băng rơi xuống bàn;
    - `dark`: màn đen vụt xuống;
    - `shuffle`: các ô xoay vòng.
  - **`ko`**: chậm thời gian 0,3 lần trong 900 ms, boss nổ tung, chữ "K.O.!" to giữa màn.
  - **`clear`**: pháo hoa.

  Toàn bộ chỉ dùng canvas 2D, không thêm thư viện.
- [X] T026 [US4] Trong `client/src/components/LinkBoard.tsx`:
  - Gắn `drawFx` vào vòng `requestAnimationFrame`, vẽ trên một lớp canvas phủ cả bàn và dải boss.
  - Thêm biến `shake` cho rung màn hình.
  - Ánh xạ chỉ số ô và ô viền (`-1-k`) sang toạ độ màn hình, kể cả khi bàn đang xoay trên điện thoại.
  - Bỏ qua fx cũ hơn 3 giây khi tab bị ẩn rồi quay lại.

**Checkpoint**: chơi thử thấy đủ hiệu ứng và không tụt hình.

---

## Phase 7: Polish & Cross-Cutting

- [X] T027 Trong `client/src/components/LinkBoard.tsx` và `client/src/link/link.css`, làm bố cục điện thoại cho khung dưới 760 px và màn dọc (research R10):
  - Bàn vẽ xoay thành 9 cột × 16 hàng, chỉ đổi toạ độ ở client.
  - Ô tối thiểu 38 px.
  - Boss thu nhỏ thành dải cao 110 px; bàn nhỏ đối thủ thu về góc trên phải.
  - Không cuộn ngang.
- [X] T028 [P] Trong `README.md`, thêm mục **⚡ Nối Thú Đại Chiến**:
  - luật nối;
  - Màn 1 (Sấm, chiêu);
  - Màn 2 (boss, các giai đoạn, KO);
  - cách tính điểm;
  - máy làm đối thủ;
  - bảng "Muốn đổi → Sửa ở" (`shared/src/link.ts`, `server/src/game/link/*.ts`, `client/src/link/*`).
- [X] T029 Chạy `cd server && npm test`: toàn bộ phải qua, gồm 14+ test của `link-duel.test.cjs`. Chạy `cd client && npx tsc --noEmit`.
- [X] T030 Chơi thử bằng Chrome headless qua CDP trên server test cô lập: copy `server/dist`, build client bằng `vite build --outDir <nháp>/client/dist`, chạy `ACCOUNT_STORAGE=local PORT=<riêng>`, tạo tài khoản test qua `/api/account/register`.
  - Thực hiện tất cả các bước ở quickstart.md mục 2, ở cả khung 1600×900 và 390×844.
  - Chụp ảnh các cảnh: Màn 1, tung chiêu, màn nghỉ, boss, Siêu Đấm, K.O., kết quả.
  - Console không có lỗi.
  - Xong thì tắt server và Chrome bằng `ps` + `kill <pid>`.

---

## Dependencies & Execution Order

```text
T001 → T002 → T003 → T004 → T005   (nền tảng: chặn mọi story)
                         │
                         ├─► US1 (T006–T016) ─► US2 (T017–T020) ─┬─► US4 (T025–T026)
                         │                                       └─► Polish (T027–T030)
                         └─► US3 (T021–T024)  (cần T007–T011 của US1; độc lập với US2, trừ dòng `super` ở T022)
```

- **US1** là MVP: một trận chỉ có Màn 1 đã chơi được trọn vẹn.
- **US2** cần `LinkDuel` từ US1, sửa chung `duel.ts` và `LinkBoard.tsx`.
- **US3** cần `LinkDuel.command` của US1. Phần `super` của máy chỉ có tác dụng khi đã có US2.
- **US4** cần US1 và US2, vì phải có đủ các loại fx.
- **Trong cùng một file thì làm lần lượt**:
  - `duel.ts`: T007 → T008 → T009 → T018 → T019;
  - `LinkBoard.tsx`: T014 → T020 → T026 → T027;
  - `link-duel.test.cjs`: T004 → T006 → T017 → T021.

### Ví dụ chạy song song

```text
# Sau T005, trong US1:
T012 (client/src/link/tiles.ts)  ‖  T013 (client/src/link/store.ts)  ‖  T015 (client/src/link/link.css)
   …song song với chuỗi server T006 → T007 → T008 → T009 → T010 → T011

# Sau US1:
US3: T022 (bot.ts) + T024 (Lobby.tsx)  ‖  US2: T018 → T019 (duel.ts)
US4: T025 (fx.ts) làm song song với T020 (LinkBoard.tsx màn 2)

# Polish:
T028 (README.md)  ‖  T027 (bố cục điện thoại)
```

## Implementation Strategy

1. **MVP = Phase 1 + 2 + US1**: chơi đối kháng realtime Màn 1, có combo, Sấm và chiêu. Chạy test và chơi thử 2 tài khoản trước khi làm tiếp.
2. **Thêm US2 (Đấm Boss)**: hoàn thành "2 màn có đấm boss" như yêu cầu, có tính điểm chung cuộc và trả cược.
3. **Thêm US3 (máy)**: phòng 1 người cũng chơi được, tiện để tự thử.
4. **Thêm US4 (hiệu ứng)** để tạo độ "ngầu lòi", rồi làm Polish: bố cục điện thoại, README, chơi thử toàn bộ.
5. Không commit trừ khi người dùng yêu cầu.
