# Tasks: Đế Chế Kiến — trụ tự bắn, tự ra quân, bản đồ sáng

**Input**: Kế hoạch đã thống nhất trong chat (dự án chưa cài speckit nên không có `spec.md` / `plan.md`).
**Stack**: TypeScript — `shared/` (định nghĩa chung), `server/` (NestJS + mô phỏng `AntWorld` 10 tick/s), `client/` (React + canvas 2D).
**Build/Test**: `cd server && npm run build && npm test` (node:test, các file `server/test/*.cjs` đọc `dist/`).

**Nguyên nhân đã xác minh**

- Trụ Phụ bắn tới 250+28 = 278 tính từ tâm. Kiến Bắn Tỉa đánh tới 260+8+28+2 = 298, nên nó phá trụ từ ngoài tầm bắn của trụ.
- Tầm bắn của trụ ngắn hơn tầm nhìn của trụ.
- Mô phỏng 10 kiến vây Trụ Phụ: trụ chỉ hạ 3 con trong 13 giây.
- Chỉ có 500 vàng đầu trận và 2 phút mới cấp vàng một lần.
- Hàng chờ tối đa 20 con.
- Con đắt nằm đầu hàng chờ sẽ chặn các con sau.
- Sương mù chiến tranh làm bản đồ tối.

**Ràng buộc chung**

- Không sửa `client/vite.config.ts` và `server/src/main.ts`; đây là thay đổi riêng của người dùng.
- Không đụng tới `server/data/db.json`.
- Khi thử trên trình duyệt, chỉ dùng server test cô lập với `ACCOUNT_STORAGE=local`.
- Muốn tắt tiến trình thì dùng `ps` rồi `kill <pid>`, không dùng `pkill -f`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: có thể làm song song (khác file, không phụ thuộc việc chưa xong)
- **[Story]**: US1 = trụ tự bắn, US2 = tự ra quân + chờ vàng, US3 = bản đồ sáng

---

## Phase 1: Setup

- [X] T001 Chạy `cd server && npm run build && npm test` để ghi nhận mốc ban đầu: 162/162 bài kiểm tra qua. Các bài được chạy nằm trong `server/test/`.

---

## Phase 2: Foundational (chặn mọi story)

- [X] T002 Trong `shared/src/ants.ts`, thêm vào `AntsCommand` biến thể `{ t: 'auto'; kind: AntUnitKind | null }`. Thêm vào `AntsPrivate` hai trường:
  - `auto: AntUnitKind | null`: loại kiến đang tự ra.
  - `hatched: number`: bộ đếm tăng 1 mỗi khi 1 con nở, để client hiện "+1".

---

## Phase 3: User Story 1 — Trụ tự bắn kiến địch xung quanh (P1) 🎯 MVP

**Goal**: Mọi kiến địch trong tầm nhìn của trụ đều bị trụ bắn. Không loại kiến nào đánh được trụ mà đứng ngoài tầm bắn của trụ. Vẫn giữ 1 viên hạ 1 con và hồi 5 giây.

**Independent Test**:
- Đặt 1 Kiến Bắn Tỉa ở khoảng cách đánh tối đa tới Trụ Phụ địch: trụ phải hạ nó trong vòng 6 giây.
- Đặt 10 kiến quanh trụ khi không có quân giữ nhà: cứ đúng 5 giây trụ hạ 1 con.

- [X] T003 [US1] Trong `shared/src/ants.ts`, đổi `ANT_TOWERS`:
  - `side.range` từ 250 → 320, bằng `side.sight`.
  - `main.range` từ 290 → 360, bằng `main.sight`.
  - Giữ nguyên `cd: 5`.
  - Thêm comment: tầm bắn của trụ phải lớn hơn `range + radius + 2` của mọi loại trong `ANT_UNITS` (lớn nhất là sniper, 270).
- [X] T004 [US1] Trong `server/src/game/ants/world.ts`, hàm `towerFire(t)`, đổi cách chọn mục tiêu:
  - Duyệt bằng `this.near(t.x, t.y, s.range + t.r, …)` như hiện tại.
  - Ưu tiên 1: con đang đánh chính trụ này. Đó là con có `u.engage === t.id`, hoặc có `u.order.type === 'attack' && u.order.target === t.id`.
  - Ưu tiên 2: con gần nhất.
  - Vẫn bỏ qua con đã có viên đạn khác đang bay tới (`this.bullets.some(b => b.target === o.id)`).
- [X] T005 [US1] Trong `server/test/ant-empire.test.cjs`, thêm test "trụ bắn được Kiến Bắn Tỉa đứng ở tầm đánh tối đa":
  - Dùng `w.addUnit(0, 'sniper', side.x + side.r + ANT_UNITS.sniper.range + ANT_UNITS.sniper.radius, side.y)`.
  - Đặt `side.cd = 0` và cho mọi trụ khác `cd = 999`.
  - Chạy `steps(w, 15)`, rồi assert con sniper đã chết.
  - Thêm assert vòng lặp: với mọi kind trong `ANT_UNITS`, `range + radius + 2 < ANT_TOWERS.side.range`.

**Checkpoint**: chạy `npm run build && npm test`; bài "trụ bắn 1 viên hạ gọn 1 kiến, nạp đạn 5 giây" vẫn phải qua.

---

## Phase 4: User Story 2 — Chọn ô kiến là tự ra quân từng con, hết vàng thì chờ rồi ra tiếp (P1)

**Goal**: Người chơi bấm 1 ô kiến thì trại lính tự nở loại đó liên tục, từng con một:
- Mỗi con trừ vàng lúc bắt đầu nở, và ô đó hiện "+1" mỗi khi 1 con nở.
- Hết vàng thì dừng chờ lần cấp vàng kế tiếp (mỗi 1 phút), có vàng là ra tiếp mà không cần bấm lại.
- Đủ 50 quân thì tạm dừng, có con chết thì nở tiếp.

**Independent Test**: Gửi `{t:'auto', kind:'soldier'}` khi có 500 vàng.
- Sau khoảng 20 giây đã nở đủ 10 con, vàng còn 0, `waiting === 'gold'`.
- Tới mốc 60 giây có vàng mới thì tự nở tiếp, không gửi thêm lệnh.

- [X] T006 [US2] Trong `shared/src/ants.ts`, đổi nhịp và lượng vàng:
  - `ANTS_INCOME_EVERY_S` từ 120 → 60.
  - `antsIncome` thành `(n) => 150 + 75 * n`, bằng một nửa lượng cũ để tổng vàng mỗi phút không đổi.
  - Sửa các comment "mỗi 2 phút" trong file thành "mỗi 1 phút".
- [X] T007 [US2] Trong `server/src/game/ants/world.ts`:
  - Thêm `auto: AntUnitKind | null` (mặc định `null`) và `hatched: number` (mặc định 0) vào interface `Empire` cùng hàm khởi tạo empire.
  - Trong `command()`, thêm `case 'auto'`:
    - `kind === null` thì tắt.
    - Nếu không, kiểm tra như `case 'train'`; loại không hợp lệ thì trả về `'Loại kiến không hợp lệ.'`.
    - Khi đặt `e.auto = kind`, xoá mọi mục **chưa trả tiền** (`!q.paid`) trong `e.queue`. Con đang nở dở vẫn giữ.
- [X] T008 [US2] Trong `server/src/game/ants/world.ts`, hàm `produce()`:
  - Ở đầu vòng lặp mỗi empire: nếu `e.queue.length === 0 && e.auto`, đẩy 1 mục `{ kind: e.auto, left: s.time, total: s.time, paid: false }`.
  - Sau `this.spawn(e, q.kind)`, tăng `e.hatched++`.
  - Logic chờ vàng / chờ chỗ quân (`ANTS_MAX_POP`) giữ nguyên, nhờ vậy hết vàng thì đứng chờ và có vàng thì chạy tiếp.
- [X] T009 [US2] Trong `server/src/game/ants/world.ts`, hàm `privateOf()`: trả thêm `auto: e.auto` và `hatched: e.hatched`.
- [X] T010 [US2] Trong `client/src/components/AntsBoard.tsx`, đổi hành vi ô kiến:
  - Bấm trái ô `k`:
    - Nếu `me.auto === k` thì gửi `{t:'auto', kind:null}` để dừng.
    - Nếu không thì gửi `{t:'auto', kind:k}`.
  - Chuột phải gửi `{t:'auto', kind:null}`.
  - Phím 1–9, 0 làm giống bấm trái. Bỏ Shift×5 và Alt-untrain.
  - Ô đang tự ra có class `on` (viền sáng) và nhãn "TỰ RA".
- [X] T011 [US2] Trong `client/src/components/AntsBoard.tsx`, sửa dòng trạng thái roster quanh dòng ~490:
  - Đang nở: "Đang nở {tên} · còn {left}s".
  - `waiting === 'gold'`: "Chờ vàng · còn m:ss", lấy từ `me.incomeIn`, kèm "(+{incomeAmount})".
  - `waiting === 'pop'`: "Đủ quân tối đa, chờ có chỗ".
  - Không chọn ô nào: "Bấm 1 ô kiến để tự ra quân".
- [X] T012 [US2] Thêm hiệu ứng "+1": trong `client/src/components/AntsBoard.tsx`, theo dõi `me.hatched` bằng `useRef`.
  - Mỗi lần giá trị tăng, thêm 1 phần tử `<i className="ants-plus">+1</i>` vào ô vừa nở, tự xoá sau 900ms.
  - Thêm CSS `.ants-plus` (bay lên, mờ dần, màu vàng) và `.ants-slot.on` vào `client/src/ants/ants.css`.
- [X] T013 [P] [US2] Trong `server/src/game/ants/bot.ts`: xác nhận bot vẫn dùng `{t:'train'}` và không bị ảnh hưởng bởi `auto`.
  - Xem lại `LEVEL.*.keepGold` / `wantQueue` với nhịp vàng 60 giây.
  - Không đổi logic nếu bài "máy tự chơi" vẫn qua.
- [X] T014 [US2] Trong `server/test/ant-empire.test.cjs`, sửa và thêm test:
  - Sửa bài "vàng được cấp mỗi 2 phút…" để dùng `ANTS_INCOME_EVERY_S` (giờ là 60) và đổi tên thành "mỗi 1 phút".
  - Thêm bài "tự ra quân". Đầu ván xoá 3 kiến khởi đầu để phép đếm chính xác.
    - Gửi `w.command(0,{t:'auto',kind:'soldier'})`, rồi chạy `steps(w, 230)`.
    - Assert: có 10 soldier mới, `e.gold === 0`, `w.frameFor(0).me.waiting === 'gold'`, `me.hatched === 10`.
    - Chạy tới mốc `ANTS_INCOME_EVERY_S*10 + 30` tick, rồi assert số soldier đã tăng.
    - Gửi `{t:'auto',kind:null}`, rồi assert queue không có mục chưa trả tiền.

**Checkpoint**: chạy `npm run build && npm test`; chơi thử thì bấm 1 ô và quân tự ra liên tục.

---

## Phase 5: User Story 3 — Bản đồ sáng toàn bộ (P2)

**Goal**: Không còn sương mù. Mọi người chơi thấy toàn bản đồ cùng mọi trụ và kiến của các đế chế. Vàng, hàng chờ và lệnh vẫn riêng từng người (`me`).

**Independent Test**: Ngay tick đầu, `w.frameFor(0)` chứa trụ của mọi đế chế và `frame.full === true`.

- [X] T015 [US3] Trong `server/src/game/ants/world.ts`, hàm `frameFor(idx)`:
  - Luôn dùng khung đầy đủ dùng chung (`this.fullCache ??= this.buildFrame(undefined)`), rồi gắn `me: this.privateOf(e)` vào một bản sao nông: `{ ...full, me }`.
  - Bỏ việc tính lưới tầm nhìn theo từng empire nếu không còn chỗ nào dùng. Giữ hàm `visible` nếu bot còn gọi.
- [X] T016 [P] [US3] Trong `client/src/ants/store.ts`:
  - Bỏ việc vẽ vào `explored` và bỏ trạng thái `ghost`. Trụ không còn trong frame thì xoá luôn.
  - Giữ `visionCircles()` nếu render còn dùng, còn không thì xoá.
- [X] T017 [P] [US3] Trong `client/src/ants/render.ts`:
  - Bỏ lớp phủ sương mù: khối `if (vision && st.explored)` quanh dòng 600–627 và biến `fogCanvas`.
  - Bỏ phần tô tối minimap: khối `if (!full && st.explored)` quanh dòng 659–663.
  - Bỏ `globalAlpha` cho ghost ở dòng 141 và 673.
- [X] T018 [US3] Trong `client/src/components/AntsBoard.tsx`, bảng chọn mục tiêu (dòng ~448): bỏ điều kiện `!t.ghost` khi đếm trụ địch.
- [X] T019 [US3] Trong `server/test/ant-empire.test.cjs`, thay bài "sương mù: …" bằng bài "bản đồ sáng: thấy trụ và kiến của mọi đế chế". Với `world(3)`:
  - Tập owner trong `f.b` là `{0,1,2}`.
  - `f.me.gold === ANTS_START_GOLD`.
  - `w.frameFor(1).me` khác `w.frameFor(0).me`.

**Checkpoint**: chạy `npm run build && npm test`; trên trình duyệt không còn vùng tối, minimap hiện đủ các căn cứ.

---

## Phase 6: Polish & Cross-Cutting

- [X] T020 [P] Trong `client/src/components/Lobby.tsx` dòng ~265, sửa luật "mỗi 2 phút" thành "mỗi 1 phút" và bỏ ý sương mù. Thêm ý: "Bấm 1 ô kiến là tự ra quân liên tục".
- [X] T021 [P] Trong `README.md`, mục Đế Chế Kiến, cập nhật:
  - nhịp vàng 1 phút;
  - cách tự ra quân theo ô;
  - tầm bắn trụ 320/360;
  - bỏ sương mù;
  - bỏ phím Shift/Alt.
- [X] T022 Chạy `cd server && npm run build && npm test` (toàn bộ phải qua), rồi build client bằng `cd client && npx tsc --noEmit`.
- [X] T023 Chơi thử bằng Chrome headless qua CDP, trên server test cô lập (`ACCOUNT_STORAGE=local`, cổng riêng), ở khung 1600×900 và 390×844. Kiểm tra:
  - (a) bấm ô Kiến Lính thì "+1" hiện từng con, tới lúc hết vàng thì báo "Chờ vàng · còn m:ss";
  - (b) qua mốc 1 phút thì tự ra tiếp;
  - (c) trụ bắn kiến địch tới gần;
  - (d) toàn bản đồ sáng;
  - (e) console không có lỗi.

  Xong thì tắt server bằng `ps` + `kill <pid>`.

---

## Dependencies & Execution Order

- T001 → T002 → các story.
- **US1** (T003–T005) chỉ cần T001; **không** phụ thuộc T002 và có thể làm song song với US2/US3.
- **US2** (T006–T014) cần T002. Thứ tự: T006 → T007 → T008 → T009 → T010 → T011 → T012. T013 [P] làm bất cứ lúc nào sau T006. T014 làm sau T009.
- **US3** (T015–T019) độc lập với US1/US2. T016 và T017 [P] làm song song (khác file).
- Polish (T020–T023) làm sau cùng. T020 và T021 [P] làm song song.

### Ví dụ chạy song song

```text
# Sau T002:
US1: T003 → T004 → T005                 (shared/ants.ts tầm trụ, world.ts towerFire)
US3: T016 (store.ts)  ‖  T017 (render.ts)
US2: T013 (bot.ts) song song với T010–T012 (client)
```

Lưu ý: T003 và T006 cùng sửa `shared/src/ants.ts`; T004, T007, T008, T015 cùng sửa `world.ts`. Cùng file thì làm lần lượt, không song song.

## Implementation Strategy

1. **MVP = US1 + US2** (đều P1): đây là 2 lỗi người chơi gặp trực tiếp, trụ không bắn và không ra được quân. Làm US1 trước vì chỉ sửa 2 chỗ, rồi tới US2.
2. Sau đó làm **US3** (bản đồ sáng), một thay đổi thuần hiển thị cộng với khung hình server.
3. Cuối cùng là Polish, kiểm thử toàn bộ và chơi thử trên trình duyệt.
4. Không commit trừ khi người dùng yêu cầu.
