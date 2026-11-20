# Balancing Simulation & Validation Results — Eldoria: Forgotten Wilds

**Trạng thái**: Thực thi thực tế trên dữ liệu chuẩn `game-data/*.json` (Design-Time Simulation)  
**Thời điểm chạy**: `2026-11-19T15:47:39Z`  
**Môi trường thực thi**: Node.js `v22.20.0` (chạy cục bộ)  
**Lệnh tái lập 100%**:
```bash
node tools/design-validation/validate-catalog.mjs
node tools/design-validation/run-simulations.mjs
```

> **CAM KẾT TRUNG THỰC (Constitution Principle VIII)**: Toàn bộ số liệu trong tài liệu này là **kết quả xuất thực tế** từ script kiểm chứng và mô phỏng có seed cố định (`Mulberry32`) chạy trực tiếp trên 12 tệp `game-data/*.json` và `docs/balancing/weapon-upgrade-costs.csv`. Mọi giả định về hành vi người chơi thực tế (như thời gian chơi/ngày, uptime né đòn `65%`, lưu lượng người chơi live) được tách bạch rõ là **giả định mô hình (`proposed / unverified`)**, KHÔNG phải số liệu vận hành live.

---

## 1. Kết quả Kiểm chứng Toàn vẹn Danh mục (`validate-catalog.mjs`)

- **Kết quả tổng thể**: **`PASS`** (`0 errors`, `0 warnings`).
- **Phạm vi kiểm chứng**: Cú pháp JSON, quy mô tối thiểu theo Mục 16 & Mục 28, tổng xác suất từng Banner Gacha bằng đúng `1.000000`, tính không chu trình (DAG) của chuỗi nhiệm vụ và 100% tham chiếu chéo giữa 12 tệp JSON + `weapon-upgrade-costs.csv`.

| Tệp Catalog (`game-data/`) | Tổng số bản ghi | Số lượng MVP | Kết quả Tham chiếu Chéo |
| :--- | :---: | :---: | :---: |
| `characters.json` | 12 nhân vật | 3 | PASS (12×5 skillIds & synergies hợp lệ) |
| `skills.json` | 60 kỹ năng | 15 | PASS (60/60 `characterId` hợp lệ) |
| `monsters.json` | 38 (30 thường + 8 Elite) | 9 (8 + 1) | PASS (38/38 `lootTableId` hợp lệ) |
| `bosses.json` | 5 Boss (16 phases) | 1 | PASS (5/5 `>=3` phases & `lootTableId` hợp lệ) |
| `items.json` | 157 (40 Wpn, 40 Eqp, 50 Mat, 12 Csm, 15 Seed) | 10 Wpn, 12 Eqp | PASS (100% ID & Equipment Sets hợp lệ) |
| `recipes.json` | 36 công thức | 22 | PASS (100% nguyên liệu, trạm & thành phẩm hợp lệ) |
| `crops.json` | 15 cây trồng | 5 | PASS (15/15 `seedItemId` & `harvestItemId` hợp lệ) |
| `animals.json` | 6 động vật | 2 | PASS (6/6 building, feed & produce hợp lệ) |
| `buildings.json` | 13 công trình (43 cấp) | 6 | PASS (100% vật liệu nâng cấp hợp lệ) |
| `quests.json` | 30 nhiệm vụ | 12 | PASS (DAG không vòng lặp, 100% thưởng hợp lệ) |
| `loot-tables.json` | 62 bảng rơi đồ | Đủ MVP | PASS (100% `itemId` tồn tại) |
| `gacha-banners.json` | 4 banner | 2 | PASS (4/4 tổng tỷ lệ `= 1.000000`, pool không rỗng) |

---

## 2. Mô phỏng Monte Carlo Gacha (100,000 lượt / Banner)

Chạy bằng bộ sinh số giả ngẫu nhiên có seed cố định mô phỏng đầy đủ: tỷ lệ cơ sở (`baseRates`), Soft Pity tăng tuyến tính, Hard Pity 100%, Epic 10-pull Pity, chia nội bộ `25% MYTHIC / 75% LEGENDARY`, cơ chế bảo đảm `50/50` trên Limited Banner và chuyển đổi trùng lặp sang `STAR_ESSENCE`.

### 2.1 So sánh Tỷ lệ Cơ sở (Base Rate) vs Tỷ lệ Thực tế Sau Pity (Empirical 100,000 Pulls)

| Banner ID (Seed) | Rarity | Base Rate (%) | Empirical Rate (%) | Ghi chú ảnh hưởng Pity |
| :--- | :--- | :---: | :---: | :--- |
| **`bnr_perm_heroes`** *(Seed: `20261119`, Hard Pity `80`, Soft `65`)* | `MYTHIC` | `0.4000%` | **`0.5440%`** | Tăng nhờ Soft/Hard Pity (`25%` split) |
| | `LEGENDARY` | `1.2000%` | **`1.8400%`** | Tăng nhờ Soft/Hard Pity (`75%` split) |
| | `EPIC` | `8.4000%` | **`13.2890%`** | Tăng nhờ bảo đảm `EPIC+` mỗi 10 lượt |
| | `RARE` / `UNCOMMON` / `COMMON` | `30 / 35 / 25%` | `28.238 / 32.577 / 23.512%` | Co tỷ lệ đều khi kích hoạt Pity |
| **`bnr_perm_arsenal`** *(Seed: `20261120`, Hard Pity `70`, Soft `55`)* | `MYTHIC` | `0.5000%` | **`0.7170%`** | Pity ngắn hơn giúp tốc độ nhận cao hơn |
| | `LEGENDARY` | `1.5000%` | **`2.1530%`** | Tổng nhóm trên đạt **`2.8700%`** |
| | `EPIC` | `9.0000%` | **`13.5360%`** | Bảo đảm `EPIC+` mỗi 10 lượt |
| | `RARE` / `UNCOMMON` / `COMMON` | `30 / 34 / 25%` | `28.133 / 31.917 / 23.544%` | Hợp lý, khớp phân phối mục tiêu |
| **`bnr_lim_storm_sovereign`** *(Seed: `20261121`, 50/50 Guarantee)* | `MYTHIC` + `LEGENDARY` | `1.6000%` | **`2.3760%`** | Tỷ lệ trúng Featured thực tế = **`67.80%`** (lý thuyết 66.67%) |

### 2.2 Phân tích Chi phí Kỳ vọng (Expected Cost — 100% Nội tệ `STARLIGHT_SHARD`)

| Banner | Tổng `MYTHIC+LEGENDARY` / 100k lượt | Số lượt TB / 1 Top-Tier | Chi phí TB (`STARLIGHT_SHARD`) | Trung vị P50 (lượt) | P90 (lượt) | Lượt tối đa quan sát | TB `STAR_ESSENCE` / 10 lượt |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `bnr_perm_heroes` | `2,384` | **`41.95`** | **`6,711`** | `44` | `70` | `75` (`<= 80`) | `234.77` *(dài hạn sau C6)* |
| `bnr_perm_arsenal` | `2,870` | **`34.84`** | **`5,575`** | `35` | `59` | `66` (`<= 70`) | `83.03` |
| `bnr_lim_storm_sovereign` | `2,376` | **`42.09`** | **`6,734`** | `45` | `70` | `77` (`<= 80`) | `235.16` |

- **Đánh giá**: Tỷ lệ hợp nhất thực tế (`2.38%` Character / `2.87%` Weapon) rất hào phóng so với chuẩn thị trường, Soft Pity phát huy hiệu quả rõ rệt (90% người chơi nhận Top-Tier ở lượt `<= 70` trên Character và `<= 59` trên Weapon, không ai bị vượt trần Hard Pity), và `STAR_ESSENCE` đủ cho phép người chơi mua trực tiếp nhân vật/vũ khí mục tiêu trong cửa hàng cố định.

---

## 3. Mô phỏng Cường hóa Vũ khí `+0 → +10` (`weapon-upgrade-costs.csv`)

- **Vũ khí mẫu kiểm chứng**: `wpn_iron_longsword` (Base ATK `26`) → đạt **`155 ATK`** ở `+10` (**gấp `5.96x` vũ khí thô**, tạo động lực farm rõ rệt).
- **Tổng Gold tiêu hao `+0 → +10`**: **`26,400 Gold`** (100% chắc chắn ở MVP, `0%` vỡ đồ/tụt cấp).
- **Thời gian ước tính theo 3 nhóm người chơi (`proposed` theo tốc độ farm chuẩn trong CSV)**:

| Nhóm Người chơi | Giờ chơi / ngày (Giả định) | Tổng giờ farm `+0 → +10` | Số ngày hoàn tất ước tính | Đánh giá nhịp chơi |
| :--- | :---: | :---: | :---: | :--- |
| **Casual** | `1.0 h/ngày` | `22.35 giờ` | **`22.4 ngày`** (~3 tuần) | Hợp lý — có mục tiêu gần mỗi 2–3 ngày |
| **Regular** | `2.5 h/ngày` | `13.84 giờ` | **`5.5 ngày`** (~1 tuần) | Đạt đúng mục tiêu Mục 4 (*1 tuần đạt +7 đến +10*) |
| **Hardcore** | `5.0 h/ngày` | `8.95 giờ` | **`1.8 ngày`** (~2 ngày) | Có thưởng xứng đáng công sức farm Boss sớm |

---

## 4. Mô phỏng Chiến đấu, Cân bằng Rarity & Phát hiện Cân chỉnh Boss TTK (Real Finding!)

### 4.1 Kiểm chứng Cân bằng giữa Các Độ hiếm (Anti-Pay-to-Win Parity)
Kiểm chứng toàn bộ 12 nhân vật với cùng trang bị tiêu chuẩn (`Lv 15` cầm vũ khí `+5` Base 32 + món ăn `+12% ATK`; `Lv 60` cầm vũ khí `+10` Base 110 + món ăn `+15% ATK`):

| Nhân vật | Rarity | Role | Lv 15 TotalATK | Lv 15 Sustained DPS | Lv 60 TotalATK | Lv 60 Sustained DPS |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `chr_mira_ironfist` | **`COMMON`** | `HYBRID` | `433` | `618` | `1,896` | `5,033` |
| `chr_rowan_tidewarden` | **`UNCOMMON`** | `TANK` | `318` | `375` | `1,371` | `2,966` |
| `chr_kael_vanguard` *(MVP)* | **`RARE`** | `MELEE_DPS` | `445` | `679` | `1,937` | `5,748` |
| `chr_lyra_windrunner` *(MVP)* | **`RARE`** | `RANGED_DPS` | `386` | `561` | `1,689` | `4,269` |
| `chr_seraphina_dawn` *(MVP)* | **`RARE`** | `SUPPORT` | `356` | `409` | `1,579` | `4,087` |
| `chr_bram_bastion` | `EPIC` | `TANK` | `337` | `388` | `1,433` | `3,198` |
| `chr_vex_nightblade` | `EPIC` | `MELEE_DPS` | `431` | `696` | `1,890` | `5,581` |
| `chr_freya_frostveil` | `EPIC` | `MAGIC_DPS` | `391` | `549` | `1,714` | `5,539` |
| `chr_orin_stormcaller` | `LEGENDARY` | `MAGIC_DPS` | `403` | `541` | `1,752` | `5,281` |
| `chr_torvald_rageborn` | `LEGENDARY` | `MELEE_DPS` | `481` | `596` | `2,064` | `4,923` |
| `chr_nyx_voidcaller` | **`MYTHIC`** | `MAGIC_DPS` | `411` | `482` | `1,782` | `4,612` |
| `chr_aurelia_starbow` | **`MYTHIC`** | `RANGED_DPS` | `407` | `564` | `1,760` | `4,309` |

- **Kết quả đạt chuẩn**:
  - **Không có exponential scaling**: Từ Lv 15 lên Lv 60 (gấp 4 lần cấp độ + nâng vũ khí lên `+10`), DPS tăng khoảng `~7.6x – 10.1x` theo đường cong đa thức tuyến tính kiểm soát hoàn toàn (không có lũy thừa mất kiểm soát).
  - **Không có Mythic power creep áp đảo**: `chr_mira_ironfist` (`COMMON`) và 3 nhân vật starter `RARE` MVP đạt sức chiến đấu ngang hàng (thậm chí nhỉnh nhẹ về sát thương đơn mục tiêu thuần túy so với các anh hùng `LEGENDARY`/`MYTHIC` thiên về tiện ích diện rộng/khống chế) — bảo đảm 100% nguyên tắc Anti-Pay-to-Win của Hiến pháp.

### 4.2 Phát hiện Cân bằng Quan trọng Từ Mô phỏng Boss TTK (`P1 Tuning Finding`)
Khi đưa `Sustained DPS` có giới hạn hồi năng lượng (MP regen) và `65%` combat uptime đối chiếu trực tiếp với `HP`/`DEF` của 5 Boss hiện tại trong `game-data/bosses.json`:

| Boss ID | Cấp | Boss HP hiện tại | Enrage (s) | Solo Sustained DPS (Kael) | Solo TTK thực đo (s) | Party 4P TTK thực đo (s) | Chẩn đoán Pacing (Mục tiêu `120–210s`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `boss_thornback_elder` *(MVP)* | 15 | `10,500` | `360s` | `412` | **`25s`** | **`28s`** | **`TOO_FAST` (Quá nhanh ~4.5x!)** |
| `boss_ignis_forgelord` | 30 | `36,000` | `420s` | `999` | **`36s`** | **`39s`** | **`TOO_FAST` (Quá nhanh ~3.5x)** |
| `boss_prism_leviathan` | 50 | `98,000` | `450s` | `2,136` | **`46s`** | **`50s`** | **`TOO_FAST` (Quá nhanh ~3.0x)** |
| `boss_boreas_frostking` | 75 | `235,000` | `480s` | `3,939` | **`60s`** | **`65s`** | **`TOO_FAST` (Quá nhanh ~2.2x)** |
| `boss_malakor_abyss` | 100 | `460,000` | `540s` | `5,958` | **`77s`** | **`84s`** | **`TOO_FAST` (Quá nhanh ~2.0x)** |

> **Hành động Khắc phục Đề xuất (Ghi nhận vào Risk Register & Technical Backlog — Mức `P1` trước Playtest M1)**:
> - **Nguyên nhân gốc**: Hệ số quy đổi điểm thuộc tính sang `TotalATK` trong `combat-formulas.md` (`2.4 * STR + 1.4 * DEX`) cộng thêm `~246 ATK` chỉ ở Lv 15, làm DPS thực tế cao gấp ~4 lần giả định ban đầu khi thiết kế `10,500 HP` cho `boss_thornback_elder`.
> - **Phương án cân chỉnh khuyến nghị (Chọn 1 trong 2 khi hiệu chỉnh cân bằng bản dựng M1)**:
>   1. *(Khuyến nghị ưu tiên)* Giảm trọng số điểm thuộc tính trong `StatCalculator` từ `2.4*STR + 1.4*DEX` (và `2.2*INT`) xuống **`0.85*STR + 0.45*DEX`** (và **`0.85*INT`**) kết hợp tăng `Boss.baseStats.hp` khoảng `1.5x` → đưa TTK toàn bộ 5 Boss về vùng lý tưởng **`130–195 giây`** (đủ trải nghiệm trọn vẹn cả 3–4 phase + Stagger + Food Buff), đồng thời khiến cường hóa vũ khí `+0 → +10` chiếm tỷ trọng giá trị cao hơn (~55% tổng ATK).
>   2. Hoặc giữ nguyên công thức ATK hiện tại và nhân hệ số `Boss HP`: `4.5x` (Lv15 → `47,250 HP`), `3.5x` (Lv30), `3.0x` (Lv50), `2.2x` (Lv75), `2.0x` (Lv100).

---

## 5. Mô phỏng Kinh tế 30 Ngày (Faucet vs Sink Audit)

Mô phỏng chuỗi thu/chi `GOLD` và `STARLIGHT_SHARD` liên tục 30 ngày (tính đủ nguồn quái, nông trại, nhiệm vụ, Boss và các hố rút hạt giống/thức ăn/sửa đồ/nâng cấp 7 công trình/cường hóa `+0 → +10`/respec):

| Nhóm Người chơi | Tổng Gold Vào (30 ngày) | Tổng Gold Rút (30 ngày) | Gold Dư Ngày 30 | Tỷ lệ Sink / Faucet | Tổng `STARLIGHT_SHARD` Miễn phí | Số lượt Gacha Free (30 ngày) | Mốc Vũ khí Đạt được | Công trình Đạt được |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Casual (1.0h/ngày)** | `31,780` | `31,000` | `780` | **`97.5%`** | `6,072` | **`30 lượt`** (+1,272 dư) | **`+8`** | `5/7` |
| **Regular (2.5h/ngày)** | `58,780` | `51,250` | `7,530` | **`87.2%`** | `6,072` | **`30 lượt`** (+1,272 dư) | **`+9`** | `6/7` |
| **Hardcore (5.0h/ngày)** | `84,280` | `78,250` | `6,030` | **`92.8%`** | `6,072` | **`30 lượt`** (+1,272 dư) | **`+9`** *(+6,030 gần đủ +10)* | `7/7` |

- **Kết luận Kinh tế**: Tỷ lệ **Sink / Faucet đạt `87.2% – 97.5%`** ở cả 3 nhóm người chơi trong 30 ngày đầu, chứng minh **KHÔNG xảy ra siêu lạm phát Gold** ngay cả khi cường hóa `+1..+10` có tỷ lệ thành công 100% không vỡ đồ. Về Gacha, người chơi hoàn toàn miễn phí thu được **~37.9 lượt quay** trong 30 ngày đầu (~90% chặng đường tới trung bình 1 nhân vật `LEGENDARY/MYTHIC` hoặc vượt ngưỡng trung bình 1 vũ khí `LEGENDARY/MYTHIC` trên `bnr_perm_arsenal`).
