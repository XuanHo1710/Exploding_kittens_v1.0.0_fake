# Implementation Plan: Nối Thú Đại Chiến (nối hình kiểu "Pikachu", solo 1v1 realtime, 2 màn + boss)

**Branch**: `main` (chưa tạo nhánh; dự án chưa cài speckit) | **Date**: 2026-11-04 | **Spec**: chưa có `spec.md` — yêu cầu lấy từ người dùng (bên dưới)
**Input**: "làm thêm 1 game về pikachu … solo đi solo real time ở 2 màn có đấm boss ngầu lòi luôn. Pikachu kiểu dạng này" + ảnh bàn nối hình 16×9 ô.

## Summary

Thêm chế độ chơi mới **Nối Thú Đại Chiến** (`gameMode: 'link_duel'`). Lối chơi giống trò nối hình "Pikachu": chọn 2 ô cùng hình, nối được bằng đường gấp khúc tối đa 2 lần, đường đi được vòng qua mép bàn.

Hai người đấu **1 chọi 1 realtime**. Mỗi người có bàn riêng, xếp giống hệt nhau. Phòng chỉ có 1 người thì máy vào làm đối thủ.

- **Màn 1 – Đua Nối**: thi ai dọn bàn nhanh hơn. Nối liên tiếp (combo) sẽ nạp **Sấm**; đầy Sấm thì tung chiêu phá bàn đối thủ (đóng băng hoặc xáo ô).
- **Màn 2 – Đấm Boss**: cả hai cùng đánh **một boss chung** tên Vua Sấm Sét, thanh máu lớn.
  - Mỗi cặp nối được là một cú đấm có tia sét bay lên boss, kèm số sát thương, rung màn hình và combo nhân sát thương.
  - Boss có 3 giai đoạn, mỗi giai đoạn tung chiêu riêng lên bàn cả hai người.
- **Thắng chung cuộc**: tổng điểm của Màn 1, sát thương gây lên boss và thưởng cú kết liễu (KO).

Kỹ thuật:
- Server là nơi quyết định duy nhất. Client chỉ gửi "nối ô a với ô b"; server kiểm tra đường nối, cộng điểm, trừ máu boss.
- Server gửi trạng thái riêng cho từng người qua socket, cùng cách Đế Chế Kiến gửi `ants:frame`.
- Hình là bộ **36 con thú tự vẽ** bằng canvas/SVG, có nền ô màu kem giống ảnh mẫu. **Không dùng hình hay tên Pokémon** (xem research.md, mục R1).

## Technical Context

**Language/Version**: TypeScript 5 (shared + server + client), Node 20+
**Primary Dependencies**: NestJS 11 + socket.io (server), React 18 + Vite (client), lucide-react (icon). Không thêm thư viện mới.
**Storage**: Không cần lưu trận. Xu cược và kết quả đi qua cơ chế cược/payout sẵn có của `Game`/`RoomsService`.
**Testing**: `node:test` (`server/test/link-duel.test.cjs`, đọc `dist/`), cộng thêm chơi thử bằng Chrome headless qua CDP trên server test cô lập.
**Target Platform**: Trình duyệt máy tính và điện thoại (màn dọc 390×844 trở lên).
**Project Type**: Web app gồm `shared/`, `server/` và `client/` (monorepo hiện có).
**Performance Goals**:
- Thao tác nối được phản hồi dưới 100 ms trên mạng LAN.
- Kiểm tra đường nối dưới 1 ms cho bàn 18×11 (16×9 cộng viền).
- Boss chạy theo nhịp 4 lần/giây, không cần mô phỏng 10 lần/giây như Đế Chế Kiến.
**Constraints**:
- Kết quả không bị ăn gian được: server tự kiểm tra mọi nước nối và giới hạn tốc độ lệnh.
- Hiệu ứng "ngầu" chỉ vẽ ở client và không làm chậm server.
- Không sửa `client/vite.config.ts`, `server/src/main.ts` hay `server/data/db.json`.
**Scale/Scope**: 1 chế độ mới. Mỗi phòng đúng 2 người chơi (người hoặc máy), có thể có người xem. Khoảng 6 file mới và 6 file sửa.

## Constitution Check

Dự án **không có** `.specify/memory/constitution.md`, nên không có cổng nguyên tắc nào để chặn. Thay vào đó, kế hoạch tuân theo các quy ước đã dùng trong repo:

| Quy ước dự án | Kế hoạch tuân thủ |
|---|---|
| Luật game do server quyết định (như Mèo Nổ, Tiến Lên, Đế Chế Kiến) | ✅ Server kiểm tra đường nối và tính điểm/sát thương |
| Định nghĩa dùng chung đặt trong `shared/src/*.ts` | ✅ `shared/src/link.ts` |
| Có bài test `node:test` trong `server/test/` | ✅ `link-duel.test.cjs` |
| Không đụng dữ liệu tài khoản thật khi thử | ✅ Server test cô lập, `ACCOUNT_STORAGE=local` |
| Không tái tạo game có bản quyền (tên, nhân vật, hình) | ✅ Thú tự vẽ, tên chế độ riêng; chỉ giữ thể loại nối hình |

**Kết quả cổng**: PASS (trước và sau thiết kế).

## Project Structure

### Documentation (this feature)

```text
specs/002-noi-thu-dai-chien/
├── plan.md              # File này
├── research.md          # Phase 0: các quyết định thiết kế
├── data-model.md        # Phase 1: thực thể, trạng thái, luật
├── quickstart.md        # Phase 1: cách kiểm chứng
└── contracts/
    └── socket.md        # Phase 1: sự kiện socket link:*
```

### Source Code (repository root)

```text
shared/src/
├── link.ts              # MỚI – kích thước bàn, 36 loại thú, điểm/sát thương, boss, kiểu lệnh & trạng thái
├── protocol.ts          # SỬA – GameMode thêm 'link_duel', GAME_MODES, RoomView.link?
└── index.ts             # SỬA – export * from './link'

server/src/game/
├── link/
│   ├── board.ts         # MỚI – sinh bàn (luôn giải được), tìm đường ≤2 khúc, gợi ý, xáo bàn
│   ├── duel.ts          # MỚI – class LinkDuel: màn 1 → nghỉ → màn 2 boss → kết thúc; chiêu Sấm; boss AI
│   └── bot.ts           # MỚI – máy chơi (Dễ/Thường/Khó: tốc độ nối, tỉ lệ sai)
├── game.ts              # SỬA – setGameMode/validateStart/start/restart/dispose/viewFor cho link_duel
├── rooms.service.ts     # SỬA – hook linkState → emit 'link:state' tới từng người; setLinkConfig
└── game.gateway.ts      # SỬA – @SubscribeMessage('link:cmd') và ('link:config')

server/test/
└── link-duel.test.cjs   # MỚI

client/src/
├── link/
│   ├── tiles.ts         # MỚI – vẽ 36 con thú tự thiết kế lên canvas (cache theo kích thước)
│   ├── fx.ts            # MỚI – hiệu ứng: đường nối phát sáng, tia sét lên boss, số sát thương, rung, nổ
│   └── link.css         # MỚI
├── components/
│   ├── LinkBoard.tsx    # MỚI – màn chơi: bàn của mình, bàn nhỏ đối thủ, boss, HUD
│   ├── Lobby.tsx        # SỬA – cấu hình độ khó máy + tóm tắt luật
│   └── Home.tsx         # SỬA – maxPlayers 2 cho link_duel
└── App.tsx              # SỬA – nghe 'link:state', hiện <LinkBoard> khi gameMode === 'link_duel'

README.md                # SỬA – thêm mục Nối Thú Đại Chiến
```

**Structure Decision**: Làm giống hệt khuôn Đế Chế Kiến, để chế độ mới cắm vào hệ thống phòng, cược, chat và xem trận sẵn có:
- định nghĩa chung ở `shared/src/link.ts`;
- engine ở `server/src/game/link/`;
- giao diện ở `client/src/link/` và `client/src/components/LinkBoard.tsx`.

## Phases (tóm tắt triển khai)

1. **Nền tảng**: viết `shared/src/link.ts`, thêm mode vào `protocol.ts`, rồi viết `board.ts` gồm sinh bàn, tìm đường và xáo bàn. Có test riêng cho phần này.
2. **US1 – Màn 1 Đua Nối (P1)**: class `LinkDuel` với lệnh `match` và `hint`, combo, thanh Sấm và 2 chiêu phá bàn đối thủ. Nối vào `Game`, `Rooms` và `Gateway`. Viết `LinkBoard` để hiện bàn của mình, bàn nhỏ đối thủ và HUD.
3. **US2 – Màn 2 Đấm Boss (P1)**: boss dùng chung có máu, 3 giai đoạn và các chiêu. Nối ô thì gây sát thương, có thưởng KO, rồi tính kết quả chung cuộc và trả cược.
4. **US3 – Máy làm đối thủ (P2)**: viết `bot.ts` để phòng 1 người vẫn chơi được. Phòng chờ cho chọn độ khó.
5. **Hiệu ứng "ngầu lòi" (P2)**: tia sét, rung màn hình, số sát thương bay lên, boss bị đánh thì giật lùi, boss nổi giận khi đổi giai đoạn, màn KO.
6. **Hoàn thiện**: bố cục điện thoại, README, luật trong phòng chờ, chơi thử trên Chrome.

## Complexity Tracking

Không có vi phạm nguyên tắc nào cần biện minh. Chỗ phức tạp nhất là thuật toán tìm đường nối tối đa 2 lần gấp khúc. Hướng làm là BFS theo hướng đi trên lưới có viền 1 ô, đã chọn ở research.md mục R3.
