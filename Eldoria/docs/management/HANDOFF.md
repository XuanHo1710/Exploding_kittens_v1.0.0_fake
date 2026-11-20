# Session Handoff & Runbook — Eldoria: Forgotten Wilds

**Last Updated**: 2026-11-20  
**Current Mode**: `IMPLEMENTATION_MODE` (Full Playable End-to-End Build Ready to Run!)  
**Active Constitution**: [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) (`v2.0.0` — 100% Local JSON Primary DB + Local Docker Redis & MinIO + Glitch-Free 2D Pipeline)

---

## 1. Cách Chạy Game Ngay Lập Tức (Không Cần Cài Database Ngoài)

### Cách A — Chạy Trực Tiếp Bằng Node.js 22 (Nhanh Nhất, Không Cần Bật Docker Desktop)
Server tự động phục vụ **React + Phaser Client đã build**, **REST/Socket.IO Game Server**, **JSON Primary DB (`data/db/`)**, và toàn bộ ảnh **`.png` Pixel Art (`assets/v1/`)** qua chế độ dự phòng an toàn (`RAM_FALLBACK` + `LOCAL_FS_FALLBACK`):

```powershell
# 1. Build (đã chạy sẵn; chỉ cần chạy lại nếu bạn sửa code)
npm run build

# 2. Chạy server sản phẩm (mở trình duyệt tại http://127.0.0.1:3001)
npm run start -w @eldoria/game-server
```

Hoặc chạy chế độ **Dev Hot-Reload** (2 terminal song song):
```powershell
# Terminal 1: Authoritative NestJS Server (port 3001)
npm run dev:server

# Terminal 2: Vite React + Phaser Client (port 5173, proxy -> 3001)
npm run dev:client
```
Mở trình duyệt tại **`http://127.0.0.1:5173`** (hoặc **`http://127.0.0.1:3001`** khi chạy bản build).

### Cách B — Chạy Full Local Docker Stack (Redis 7 + MinIO S3 + Game Server)
1. Bật **Docker Desktop** trên Windows.
2. Chạy một lệnh duy nhất:
```powershell
docker compose up -d --build
```
3. Kiểm tra tự động sức khỏe stack + thời gian khởi động (`< 60s`):
```powershell
npm run docker:verify
```
- Game Client & API: `http://127.0.0.1:3001`
- Health Check: `http://127.0.0.1:3001/api/v1/health`
- Local MinIO Console: `http://127.0.0.1:9001` (buckets `eldoria-assets` public-read, `eldoria-backups` private)

---

## 2. Bộ Lệnh Kiểm Chứng & Tái Sinh Tài Nguyên Pixel Art

```powershell
# Tái sinh toàn bộ .png pixel art (4 hướng, ra chiêu, VFX 16x16, Boss 128x128, tileset extrude) & kiểm chứng
npm run assets:generate
npm run assets:verify

# Chạy toàn bộ bộ kiểm thử tự động (Shared + Server WAL/Redis/MinIO/Live E2E + Client 1000-Transition Watchdog/IME)
npm run test

# Kiểm tra thiết kế, catalog 12 file game-data & rào chắn Hiến pháp (0 SQL/NoSQL/SaaS)
npm run validate:design
npm run docker:config
```

---

## 3. Ràng Buộc Kiến Trúc Đã Được Bảo Vệ Tự Động

- **Primary Database = 100% Local JSON (`data/db/**/*.json`)**: `JsonDatabaseEngine` với Multi-File WAL 2PC, idempotent Crash Roll-Forward Recovery, SHA-256 chống giả mạo, khóa thứ tự tránh deadlock, sổ cái tiền tệ theo từng nhân vật (`ledgers/currency-ledger-<charId>-<YYYY-MM>.json`), và sao lưu xoay vòng `.json.gz` + SHA-256 (`data/backups/`).
- **ZERO** PostgreSQL, MySQL, MongoDB, SQLite, TypeORM, Prisma, Firebase, Supabase, Auth0 hay Cloud SaaS (được `audit-workspace.mjs` kiểm tra tự động trên tất cả `package.json`).
- **Local Docker Redis & MinIO** chỉ hoạt động cục bộ (`127.0.0.1`) với cơ chế fallback không mất dữ liệu (`RAM_FALLBACK` & `LOCAL_FS_FALLBACK`).

---

## 4. Trạng Thái Cuối Cùng (`specs/013`: `37/38 [X]`, `specs/014`: `4/4 [X]`)

- **Đã kiểm chứng thực tế trên Google Chrome (`npm run test:e2e:browser`)**:
  - **`T020` (`SC-004`)**: PASS trên cả 4 cấu hình màn hình/DPI (`720p 100%`, `1080p 100%`, `1080p 125% DPI`, `1440p 150% DPI`), `0` console error, `0` failed asset, `640×360` `image-rendering: pixelated`.
  - **`T034` (`FR-014`)**: PASS `10/10` bước thực chiến trên trình duyệt thật (Đăng ký → Tạo Kael → Greenhaven Village → Đi bộ 4 hướng + Chat tiếng Việt → Nông trại → Chế tạo → Cường hóa `+0→+1` → Gacha x10 → Đấu trường Boss #1 `Thornback Elder` + vòng `#FF3B3B` → Đấu trường Boss #2 `Ignis Forgelord` → Cài đặt lưu JSON DB). Ảnh chụp bằng chứng thực nằm trong `docs/testing/evidence/`.
- **Mục duy nhất còn chờ thao tác trên máy chủ Windows**:
  - **`T036` (`docker compose up -d` đo thời gian `< 60s`)**: Cú pháp `docker-compose.yml` đã PASS (`npm run docker:config`); chỉ cần bạn mở app **Docker Desktop** trực tiếp trên Windows và chạy `docker compose up -d --build && npm run docker:verify`.
