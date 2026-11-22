# Contract 2: Socket.IO Protocol, Static Guard & Local Docker Redis/JSON Storage (`contracts/socket-and-storage.md`)

**Feature**: `006-astral-expedition-pixel` · **Date**: 2026-11-21

---

## 1. Đăng ký Chế độ Chơi & Bảo mật Tài nguyên Tĩnh

- **`GameMode` mới trong `shared/src/`**: `'astral_expedition'`.
- **Đường dẫn phục vụ tài nguyên tĩnh**: `/database-astral-expedition/*` → thư mục gốc `database-astral-expedition/`.
- **Middleware bảo mật `AstralExpeditionStaticGuard` (`server/src/app.module.ts`)**:
  - Tái sử dụng `guardSafeStaticRequest`: chỉ cho phép `GET` / `HEAD`, chặn tuyệt đối `..`, `%2e%2e`, `%25`, backslash `\`, dotfiles, symlink thoát ra ngoài gốc; chỉ cho phép đuôi `.png`, `.webp`, `.jpg`, `.ogg`, `.mp3`, `.wav`, `.tmj`, `.tsj`, `.json` (trong đó `.json`/`.tmj`/`.tsj` chỉ cho phép `manifest.json` và các thư mục con hợp lệ `maps/`, `units/`, `vfx/`, `ui/`, `battle-scenes/`).

---

## 2. Giao thức Sự kiện Socket.IO (`exp:*`)

Tất cả sự kiện đều yêu cầu người chơi đã xác thực phiên qua kết nối Socket hiện có của nền tảng (`playerId`, `token`) và đính kèm `reqId` để chống gửi trùng (idempotency):

| Sự kiện Client → Server | Payload Chính | Sự kiện Phản hồi (`exp:res` / push) | Quy tắc Xác thực tại Server |
|-------------------------|---------------|-------------------------------------|-----------------------------|
| `exp:load_profile` | `{}` | `{ profile: ExpeditionProfile, activeBattle?: BattleResumeView }` | Khởi tạo hồ sơ mặc định với **3 Anh Hùng khởi đầu** (`gustave_blade`, `celine_prism`, `bastian_aegis`) tại `01-dawn-meadow` nếu vào lần đầu; đọc ưu tiên từ Local Redis cache rồi fallback sang JSON store. |
| `exp:reach_anchor` | `{ mapId, anchorId, pos }` | `{ ok: true, profilePatch }` | Kiểm tra `mapId` đã mở khóa và toàn bộ Quái Gác Cổng chặn trước `anchorId` đã nằm trong `clearedGatekeepers[]`; lưu điểm hồi sinh an toàn và hồi đầy HP đội hình. |
| `exp:warp_realm` | `{ fromMapId, toMapId }` | `{ ok: true, currentMapId, spawnPos }` | Bắt buộc Trùm Khu Vực của `fromMapId` đã bị hạ gục (`clearedBosses.includes(bossId)`) nếu tiến lên vùng mới (`FR-014`); cho phép quay lại tự do mọi vùng đã mở (`FR-004`). |
| `exp:battle_start` | `{ encounterKind: 'gatekeeper' \| 'boss', targetId, mapId }` | `{ battleId, battleSeed, enemySnapshot, initialTimeline }` | Kiểm tra `mapId` hợp lệ, tạo `BattleSessionState` lưu vào Local Redis (`exp:battle:<playerId>`) với `battleSeed` ngẫu nhiên mật mã. |
| `exp:battle_commit` | `{ battleId, reqId, actionLog: TurnActionRecord[] }` | `{ outcome: 'victory' \| 'defeat', rewards?, unlockedMapId?, profilePatch }` | Chạy lại `ExpeditionBattleEngine.replayAndVerify(battleSeed, partySnapshot, enemySnapshot, actionLog)`: bác bỏ nếu sai thứ tự lượt, tiêu AP âm, hoặc cửa sổ `Timed Hit`/`Parry` vượt giới hạn vật lý. Nếu thắng: ghi nguyên tử thưởng + mở chốt gác/cổng vùng mới. |
| `exp:summon` | `{ bannerId, count: 1 \| 10, reqId }` | `{ pulls: SummonResultItem[], pityAfter: PityLedger, currencies }` | Khóa nguyên tử `exp:lock:<playerId>:<reqId>`; kiểm tra đủ `160` hoặc `1600` `astralSeal`; quay ngẫu nhiên mật mã `crypto.randomInt`, áp dụng bảo hiểm `SR+` mỗi 10 lượt & **Hard Pity `SSR` ở lượt 80**; quy đổi mảnh trùng lặp (`A1..A6` / `starlightToken`) và ghi đĩa nguyên tử trước khi trả kết quả. |
| `exp:update_party` | `{ activeHeroIds: [string, string?, string?] }` | `{ ok: true, activeParty }` | Kiểm tra `1..3` mã Anh Hùng không trùng nhau, đều thuộc sở hữu của người chơi và không đang ở giữa trận đấu. |
| `exp:upgrade_hero` | `{ heroId, kind: 'level' \| 'awaken' \| 'skill', skillId? }` | `{ ok: true, hero: HeroInstance, currencies }` | Trừ nguyên liệu/mảnh thức tỉnh nguyên tử và tăng cấp tương ứng theo bảng công thức trong `shared/src/expedition/`. |

---

## 3. Hạ Tầng Docker Cục Bộ Miễn Phí (`docker-compose.expedition.yml`) & Không Gian Khóa Redis

```yaml
services:
  expedition-redis:
    image: redis:7-alpine
    container_name: astral-expedition-redis
    ports:
      - "127.0.0.1:6379:6379"
    command: ["redis-server", "--appendonly", "no", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru"]
    restart: unless-stopped
```

- **Chỉ buộc cổng `127.0.0.1:6379`** (an toàn cục bộ, `0` chi phí đám mây, kéo trực tiếp bằng Docker miễn phí).
- **Không gian khóa Redis**:
  - `exp:profile:<playerId>` (JSON cache hồ sơ, TTL `1800s`, write-through cùng tệp JSON bền vững).
  - `exp:battle:<playerId>` (trạng thái trận đấu đang mở, TTL `7200s`).
  - `exp:lock:<playerId>:<reqId>` (khóa chống nhân bản Gacha/nhận thưởng, TTL `10s`).
  - `exp:rl:<playerId>` (bộ đếm giới hạn tốc độ gói tin).
- **Lưu trữ bền vững trên đĩa (`server/data/expedition/<playerId>.json`)**:
  - Ghi nguyên tử `writeFile(<playerId>.json.tmp) → fsync → rename(<playerId>.json)`.
  - Nếu container Redis dừng hoặc chưa bật, `ExpeditionRedisService` tự chuyển sang `InMemoryCacheFallback` mà không mất bất kỳ dữ liệu bền vững nào (`Edge Cases`, `SC-005`, `SC-008`).
