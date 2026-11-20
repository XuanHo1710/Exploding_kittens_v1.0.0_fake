# Phase 0 Research: Fair In-Game Gacha, Pity & Hero/Weapon Collection System

**Feature**: `009-gacha-collection`  
**Date**: 2026-11-19

---

## 1. Bộ Sinh Số Ngẫu nhiên An toàn Mật mã (`crypto.randomInt`) & Toán học Soft/Hard Pity Chính xác Số nguyên

- **Decision**: Thực hiện mọi phép quay trên server bằng Node.js built-in **`crypto.randomInt(0, 1_000_000)`** (độ phân giải `10^-6`, không dùng `Math.random()` vì PRNG non-cryptographic dễ suy đoán trạng thái nội bộ). Cho mỗi lượt quay `i` trong gói `1` hoặc `10`:
  1. Tăng tạm `nextPity = pityCounter + 1`, `nextEpicPity = epicPityCounter + 1`.
  2. Tính `topTierRate`:
     - Nếu `nextPity >= hardPity`: `topTierRate = 1.0`.
     - Else nếu `nextPity >= softPityStart`: `topTierRate = Math.min(1.0, baseTopTier + (nextPity - softPityStart + 1) * softPitySlope)`.
     - Else: `topTierRate = baseTopTier` (`MYTHIC + LEGENDARY`).
  3. Phân bổ `MYTHIC = topTierRate * 0.25`, `LEGENDARY = topTierRate * 0.75`. Nếu `topTierRate < 1.0`, các bậc dưới (`EPIC`, `RARE`, `UNCOMMON`, `COMMON`) nhân với hệ số co `remainingScale = (1 - topTierRate) / (1 - baseTopTier)`.
  4. Áp dụng `epicPity`: nếu `nextEpicPity >= 10` và kết quả rút theo xác suất rơi vào `RARE | UNCOMMON | COMMON`, nâng cưỡng bức lên `EPIC` (giữ nguyên nếu kết quả đã trúng `EPIC | LEGENDARY | MYTHIC`).
  5. Chuyển đổi toàn bộ xác suất sang ngưỡng tích lũy số nguyên trong `[0, 1_000_000)` để tránh sai số dấu phẩy động IEEE-754.
  6. Sinh `rngAuditSeedHash = sha256(pullTxId + ":" + serverTs + ":" + crypto.randomBytes(16).toString('hex'))` ghi vào `GachaHistoryRecord` để truy vết kiểm toán.
- **Rationale**: Bảo đảm tính không thể dự đoán (cryptographic unpredictability), tổng xác suất chính xác tuyệt đối `1,000,000 / 1,000,000`, khớp 100% với mô phỏng Monte Carlo 100,000 lượt của dự án và zero phụ thuộc thư viện ngoài.
- **Alternatives considered**: Dùng `Math.random()` (bị từ chối vì không an toàn mật mã); gọi dịch vụ VRF/RNG bên thứ ba (bị cấm tuyệt đối theo Hiến pháp Nguyên tắc I).

## 2. Chống Concurrent Pull & Giao dịch Đa Tệp Nguyên tử Trên `JsonDatabaseEngine`

- **Decision**: Mọi yêu cầu `POST /api/v1/characters/:charId/gacha/pull` chạy qua chuỗi bảo vệ 4 tầng:
  1. `IdempotencyStore` kiểm tra `<accountId>:GACHA_PULL:<idempotencyKey>` trong 24h (chặn replay và trả về `responseSnapshot` cũ nếu mạng gửi lại).
  2. `AsyncLockManager.acquireLocks(["character:<charId>", "inventory:<charId>", "ledger:<YYYY-MM>"])` (luôn sắp xếp bảng chữ cái, timeout `3000 ms`).
  3. Bên trong khóa: đọc `Character` & `Inventory`, xác nhận `banner.active === true` (và trong `startAt..endAt` nếu Limited), xác nhận `currencies.starlightShard >= cost`, xác nhận sức chứa túi đồ đủ cho toàn bộ vật phẩm phát sinh (vũ khí mới + tối đa 1 ô stack `mat_starlight_dust` nếu có nhân vật tràn `C6`).
  4. Chạy vòng lặp `count` (`1 | 10`) lượt `crypto.randomInt`, xây dựng ảnh đích cho **4 tệp JSON** (`characters/<id>.json`, `inventories/<id>.json`, `history/gacha-history-<id>.json`, `ledgers/currency-ledger-<YYYY-MM>.json`) rồi commit trong **1 giao dịch WAL hai pha duy nhất**.
- **Rationale**: Loại bỏ toán học kịch bản `TS-GAC-004` (20 POST đồng thời với 1,600 shard) và bảo đảm crash sau pha `PREPARED` không bao giờ tạo trạng thái trừ shard mà mất nhân vật hoặc sai bộ đếm pity.
- **Alternatives considered**: Dùng Redis distributed lock hoặc PostgreSQL `SELECT ... FOR UPDATE` (bị cấm tuyệt đối theo Hiến pháp Nguyên tắc I).

## 3. Phân trang Tệp Lịch sử `data/db/history/gacha-history-<characterId>.json`

- **Decision**: Lưu danh sách giao dịch quay theo mảng `records[]` trong `data/db/history/gacha-history-<characterId>.json` sắp xếp mới nhất ở cuối (append O(1) khi thêm) và đọc đảo chiều phân trang (`page`, `limit <= 50`) trên bộ nhớ. Nếu lịch sử một nhân vật vượt quá `1,000` giao dịch (`~10,000` lượt quay trong nhiều năm), tự động xoay vòng phần cũ hơn sang tệp lưu trữ cục bộ `data/db/history/archive/gacha-history-<characterId>-<year>.json` nhằm giữ kích thước tệp nóng `< 500 KB` (`proposed`).
- **Rationale**: Bảo vệ thời gian đọc/ghi `fsync` ổn định trên hệ thống tệp JSON cục bộ theo thời gian dài mà không xóa mất dữ liệu kiểm toán.
- **Alternatives considered**: Lưu toàn bộ lịch sử của mọi người chơi vào 1 tệp JSON chung duy nhất (bị từ chối vì tranh chấp khóa giữa mọi người chơi).

## 4. Kiến trúc `STAR_ESSENCE` Shop & Hạn mức Tháng Theo Đồng hồ UTC Server

- **Decision**: Lưu bộ đếm mua theo tháng trong `Character.collectionProgress.starEssenceMonthlyPurchases` dạng map `{ "<YYYY-MM>": { "<offerId>": count } }` (chỉ giữ khóa tháng hiện tại và 1 tháng gần nhất để JSON gọn). Mọi lệnh `POST /gacha/exchange` tính `monthKey = new Date(serverNow).toISOString().slice(0, 7)` hoàn toàn từ đồng hồ server, kiểm tra `purchased < offer.limitPerMonth` và commit WAL cập nhật đồng thời `characters/<id>.json`, `inventories/<id>.json` và `ledgers/currency-ledger-<YYYY-MM>.json` (`STAR_ESSENCE_EXCHANGE`).
- **Rationale**: Minh bạch, chống mua vượt hạn mức qua đổi giờ máy khách và không cần cron job quét toàn bộ tài khoản mỗi đầu tháng.
- **Alternatives considered**: Cron job chạy 00:00 ngày mùng 1 quét toàn bộ thư mục `characters/*.json` để reset số đếm (bị từ chối vì lãng phí I/O và rủi ro sót bản ghi khi server đang tắt).
