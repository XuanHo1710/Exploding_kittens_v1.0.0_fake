# Quickstart Validation Guide: Fair In-Game Gacha, Pity & Hero/Weapon Collection System

**Feature**: `009-gacha-collection`  
**Mode Note**: Đây là hướng dẫn kiểm chứng dành cho giai đoạn triển khai (`IMPLEMENTATION MODE`), không chạy trên mã nguồn production chưa tồn tại.

---

## 1. Prerequisites
- Các feature nền tảng đã sẵn sàng: `001-foundation-game-engine` (`JsonDatabaseEngine`, `GameCatalogLoader`), `002-auth-character`, `005-inventory-loot`.
- Tệp catalog chuẩn [`game-data/gacha-banners.json`](../../game-data/gacha-banners.json) với `realMoneyPurchaseEnabledInMvp: false`, `cashOutAllowed: false`, tổng `baseRates === 1.000000` trên cả 4 banner và 16 ưu đãi `starEssenceShop`.

---

## 2. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **Kiểm chứng Công khai Xác suất & Fail-Fast Boot**:
   - Gọi `GET /api/v1/gacha/banners?characterId=<id>` → xác nhận trả về `realMoneyPurchaseEnabledInMvp: false`, đủ 6 bậc `baseRates` cộng đúng `1.000000`, `pityCounter / hardPity`, `duplicateConversionRules` và `starEssenceShop`.
   - Thử tiêm bản sao `gacha-banners.json` lệch tổng `baseRates = 1.01` hoặc `realMoneyPurchaseEnabledInMvp = true` → xác nhận server từ chối boot ngay lập tức.
2. **Quay 10x Bằng `STARLIGHT_SHARD` & Bảo đảm `EPIC+` (`TS-GAC-001`)**:
   - Cấp `1,600 STARLIGHT_SHARD` (từ thưởng nhiệm vụ/boss test), gọi `POST /api/v1/characters/:charId/gacha/pull` với `{ bannerId: "bnr_perm_heroes", count: 10 }` kèm `X-Idempotency-Key`.
   - Xác nhận trừ đúng `1,600`, có ít nhất `1` nhân vật `EPIC+`, tạo bản ghi trong `data/db/history/gacha-history-<charId>.json` và bút toán `GACHA_PULL` trong `data/db/ledgers/currency-ledger-<YYYY-MM>.json`.
   - Gửi lặp lại đúng cùng `X-Idempotency-Key` → xác nhận trả đúng `historyRecord` cũ mà không trừ thêm shard.
3. **Hard Pity (`80` / `70`), Soft Pity (`65` / `55`) & Mô phỏng 100,000 Lượt (`TS-GAC-002`)**:
   - Đặt `pityCounter = 79` trên `bnr_perm_heroes` (và `69` trên `bnr_perm_arsenal`), quay 1 lượt → xác nhận ra `LEGENDARY` hoặc `MYTHIC` và reset `pityCounter = 0`.
   - Chạy unit simulation `100,000` lượt bằng `GachaProbabilityEngine` → xác nhận phân phối hội tụ về lý thuyết trong biên `<= 0.25%`.
4. **Chuyển đổi Trùng lặp (`C0..C6`, Tràn `C6`, Vũ khí Trùng) & Đổi `STAR_ESSENCE` (`TS-GAC-003`)**:
   - Quay trùng `chr_kael_vanguard` ở `C2 → C3` (+`12 STAR_ESSENCE`), rồi ở `C6` (+`24 STAR_ESSENCE` + `2 mat_starlight_dust`).
   - Quay trùng vũ khí `wpn_iron_longsword` → xác nhận thêm `ItemInstance` mới trong túi đồ + `3 STAR_ESSENCE` + `2 CRAFTING_TOKEN`.
   - Gọi `POST /gacha/exchange` cho `shop_ess_elderwood_cleaver` (200 `STAR_ESSENCE`), sau đó gọi lần 2 trong cùng tháng → lần 1 thành công, lần 2 nhận `409 ERR_EXCHANGE_MONTHLY_LIMIT_REACHED`.
5. **Chống Concurrent Pull 20 Request Song song & WAL Crash Recovery (`TS-GAC-004`)**:
   - Đặt `starlightShard = 1600`, bắn đồng thời `20` request `POST /gacha/pull` (`count: 10`, khác `idempotencyKey`).
   - Kỳ vọng: Đúng `1` request trả `201`, `19` request trả `409 ERR_INSUFFICIENT_FUNDS`, số dư cuối `= 0`, lịch sử thêm đúng `1` giao dịch (`10` kết quả), `0` hỏng JSON sau giả lập crash WAL `PREPARED`.

---

## 3. Tham chiếu
- Kiến trúc & Chính sách công bằng: [`ADR-005`](../../docs/architecture/architecture-decisions/ADR-005-deterministic-enhancement-and-fair-gacha.md), [`game-data/gacha-banners.json`](../../game-data/gacha-banners.json)
- Lược đồ dữ liệu & ràng buộc trường: [`data-model.md`](./data-model.md)
- Hợp đồng API: [`contracts/gacha-collection-contract.md`](./contracts/gacha-collection-contract.md)
