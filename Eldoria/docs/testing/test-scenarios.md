# Master Test Scenarios Catalog — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (`NOT EXECUTED — DESIGN_AND_PLANNING_ONLY`)  
**Cập nhật lần cuối**: 2026-11-19

---

## 1. Quy ước Trạng thái

Mọi kịch bản dưới đây mang trạng thái `DESIGNED / NOT_RUN` cho đến khi triển khai mã nguồn production. Mỗi kịch bản gắn mã `TS-<DOMAIN>-###` để truy vết 1-1 với `requirements-traceability.md`.

---

## 2. Danh mục Kịch bản Kiểm thử Trọng yếu Theo Hệ thống

### 2.1 JSON Database Engine & Recovery (`TS-DB`)
| ID | Nhóm | Kịch bản | Điều kiện đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| `TS-DB-001` | Happy Path | Ghi nguyên tử đơn tệp + checksum | Cập nhật `characters/<id>.json` | Ghi `.tmp`, `fsync`, rename thành công; `revision` tăng +1; `checksumSha256` khớp nội dung |
| `TS-DB-002` | Failure Recovery | Crash giữa giao dịch WAL đa tệp | Ngắt tiến trình sau khi ghi WAL `PREPARED`, trước khi rename đủ 4 tệp đích | Khi khởi động lại, `CrashRecoveryService` replay WAL hoàn tất đủ 4 tệp, dọn tệp `.tmp` mồ côi, số dư khớp `CurrencyLedger` |
| `TS-DB-003` | Concurrency | Deadlock Prevention khi 2 lệnh khóa chéo | Lệnh A cần `[inventory:1, character:1]`, Lệnh B cần `[character:1, inventory:1]` | `AsyncLockManager` tự sắp xếp khóa theo từ điển; cả 2 hoàn tất sạch không timeout deadlock |
| `TS-DB-004` | Edge Case | Phát hiện tệp JSON bị sửa tay trái phép | Chỉnh sửa trực tiếp số `gold` trong file JSON mà không cập nhật checksum | Engine từ chối nạp, phát cảnh báo `CRITICAL`, ghi `security-audit`, hướng dẫn phục hồi từ backup |
| `TS-DB-005` | Backup/Restore | Tạo backup định kỳ và phục hồi | Tạo snapshot vào `data/backups/`, xóa thử bản sao test, khôi phục lại | Toàn bộ nhân vật, kho đồ và chỉ mục `indexes/*.json` khớp 100% |

### 2.2 Authentication & Character (`TS-AUTH`)
| ID | Nhóm | Kịch bản | Điều kiện đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| `TS-AUTH-001` | Happy Path | Đăng ký tài khoản & tạo nhân vật MVP | Username/email hợp lệ, mật khẩu >= 10 ký tự, chọn `chr_kael_vanguard` | Tạo `accounts/<id>.json`, `characters/<id>.json`, `inventories/<id>.json`, `houses/<id>.json` và cập nhật `indexes/*.json` qua 1 WAL commit |
| `TS-AUTH-002` | Security | Phát hiện dùng lại Refresh Token | Replay refresh token cũ sau khi đã xoay vòng | Trả `401 ERR_TOKEN_REUSED`, thu hồi toàn bộ phiên của tài khoản trong `sessions/*.json`, ghi audit |
| `TS-AUTH-003` | Edge Case | Khóa tạm brute-force | Gửi sai mật khẩu 8 lần liên tiếp | Lần 9 trả `423 ERR_ACCOUNT_LOCKED` trong 15 phút |
| `TS-AUTH-004` | AuthZ | Truy cập nhân vật của tài khoản khác | User B gọi `GET /characters/<charOfA>/inventory` | Trả `403 ERR_FORBIDDEN_OWNERSHIP` |

### 2.3 World, Movement & Realtime Sync (`TS-WLD`)
| ID | Nhóm | Kịch bản | Điều kiện đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| `TS-WLD-001` | Happy Path | Di chuyển mượt có prediction & reconciliation | Giữ phím D trong 2s tại `zon_greenhaven_square` (ping 80ms) | Client dự đoán mượt 60 FPS; server ack `seq` liên tục; sai lệch < 6 px không giật hình |
| `TS-WLD-002` | Anti-Cheat | Chặn đi xuyên tường & tăng tốc | Gửi `MOVE_INPUT` tần suất 100 gói/giây hoặc ép đi xuyên tường đá | Server giới hạn tốc độ theo `dt` server, chặn collision, kéo lùi (reconcile) và tăng `suspicionScore` |
| `TS-WLD-003` | Interest Mgmt | Spatial Grid lọc thực thể ngoài tầm | Người chơi A ở `(100,100)`, người chơi B ở `(2500,2500)` cùng Zone | Snapshot của A không chứa B; khi B đi vào bán kính `5x5` ô, B xuất hiện trong `entered[]` |
| `TS-WLD-004` | Recovery | Reconnect trong 120s giữ nguyên trạng thái | Rút mạng 15s khi đang ở `reg_whispering_forest` rồi kết nối lại | `SESSION_RESUME` khôi phục đúng vị trí, HP/MP, Party không mất đồ |

### 2.4 Combat & 60-Skill System (`TS-CMB`)
| ID | Nhóm | Kịch bản | Điều kiện đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| `TS-CMB-001` | Happy Path | Combo đánh thường + Kỹ năng + Phản ứng nguyên tố | Kael (`FIRE`) dùng `Crimson Crescent` lên `boss_thornback_elder` (`EARTH`) | Áp dụng hệ số khắc hệ `x1.25`, trừ MP/Cooldown tại server, trừ HP & Poise Boss, phát `COMBAT_DAMAGE_EVENT` |
| `TS-CMB-002` | Edge Case | Dodge i-frame & Perfect Parry | Bấm Dodge trước đòn Boss 150 ms; bật Block trước đòn 120 ms | Dodge né 100% sát thương trong 300 ms i-frame; Perfect Parry giảm 100% sát thương & phản 25% Poise damage |
| `TS-CMB-003` | Anti-Cheat | Client tự gửi hit giả / spam cooldown | Gửi `SKILL_CAST_REQ` liên tiếp khi còn 4s cooldown | Server từ chối với `ERR_SKILL_ON_COOLDOWN`; animation client không bao giờ gây sát thương |
| `TS-CMB-004` | Readability | Ultimate không che Boss Telegraph | 4 người chơi bật Ultimate cùng lúc khi Boss đang gồng đòn đỏ | Lớp Telegraph Layer 100–199 vẫn rõ ràng, alpha VFX Ultimate bị kẹp ngưỡng `<= 0.65` |

### 2.5 Inventory, Crafting & Weapon Enhancement `+1..+10` (`TS-ENH`)
| ID | Nhóm | Kịch bản | Điều kiện đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| `TS-ENH-001` | Happy Path | Cường hóa chắc chắn từ `+0` đến `+10` | Có đủ Gold, nguyên liệu chuẩn và `bld_blacksmith` Lv 1→4 | Mỗi bậc tăng chính xác chỉ số theo bảng `weapon-upgrade-costs.csv`, tỷ lệ thành công 100%, không vỡ/tụt cấp, ghi đủ 10 dòng `UpgradeHistory` và `CurrencyLedger` |
| `TS-ENH-002` | Edge Case | Thử cường hóa vượt trần `+10` | Vũ khí đang ở `+10`, gọi `POST /enhancement/upgrade` | Server từ chối `409 ERR_MAX_ENHANCEMENT_REACHED`, không trừ tiền/nguyên liệu |
| `TS-ENH-003` | Business Rule | Thiếu cấp Lò Rèn cho mốc `+4` | `bld_blacksmith` đang Lv 1, cố cường hóa vũ khí `+3 → +4` | Server từ chối `409 ERR_BLACKSMITH_LEVEL_REQUIRED` |
| `TS-ENH-004` | Concurrency | Gửi 10 request nâng cấp song song cùng vũ khí | 10 HTTP POST đồng thời (cùng hoặc khác `idempotencyKey`) | Không nhân bản vật phẩm, không trừ sai tiền, tối đa đúng cấp khả dụng được thực hiện tuần tự |

### 2.6 Fair Gacha & Collection (`TS-GAC`)
| ID | Nhóm | Kịch bản | Điều kiện đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| `TS-GAC-001` | Happy Path | Quay 10x bằng `STARLIGHT_SHARD` kiếm từ game | Có 1.600 `STARLIGHT_SHARD`, quay `bnr_perm_heroes` | Trừ đúng 1.600 shard, bảo đảm ít nhất 1 `EPIC+`, cập nhật `pityCounter`, lưu `GachaHistory` và `CurrencyLedger` trong 1 WAL commit |
| `TS-GAC-002` | Edge Case | Chạm Hard Pity lần thứ 80 (Hero) / 70 (Weapon) | `pityCounter = 79`, thực hiện 1-pull | Lần thứ 80 bắt buộc ra `LEGENDARY` hoặc `MYTHIC` và reset `pityCounter = 0` |
| `TS-GAC-003` | Business Rule | Chuyển đổi nhân vật trùng lặp | Quay ra `chr_kael_vanguard` đã sở hữu | Tăng `heroConstellations["chr_kael_vanguard"]` (+1, tối đa 6) và cộng `STAR_ESSENCE` tương ứng rarity |
| `TS-GAC-004` | Concurrency | Spam 20 request 10x khi chỉ đủ tiền quay 1 lần | Số dư `1.600 STARLIGHT_SHARD`, bắn 20 POST song song | Đúng 1 request thành công (`200`), 19 request còn lại nhận `409 ERR_INSUFFICIENT_FUNDS`, số dư cuối = `0` (không âm) |

### 2.7 Farming, Animal Husbandry & Housing (`TS-FRM`)
| ID | Nhóm | Kịch bản | Điều kiện đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| `TS-FRM-001` | Happy Path | Trồng → Tưới → Chờ tăng trưởng → Thu hoạch | Trồng `sed_sunwheat` đúng mùa `SPRING`, tưới nước | Qua 4 giai đoạn sinh trưởng đúng server time, thu hoạch nhận `mat_sunwheat_grain` với chất lượng `NORMAL/SILVER/GOLD` |
| `TS-FRM-002` | Anti-Cheat | Chỉnh đồng hồ hệ thống client tiến trước 10 tiếng | Đổi giờ Windows trên máy client rồi tải lại game | Tiến trình cây trồng & sản phẩm bò/gà không đổi vì tính 100% theo `Date.now()` của server |
| `TS-FRM-003` | Edge Case | Giới hạn Offline 24 giờ | Người chơi rời game 72 giờ rồi đăng nhập lại | Sản lượng động vật tích tối đa tương ứng 24h (`<= 3` lượt), động vật không chết vĩnh viễn |
| `TS-FRM-004` | Security | Đặt công trình đè lên lối đi / spawn point | Gửi `BUILDING_PLACE_REQ` tại tọa độ cổng làng hoặc chồng lên `bld_player_house` | Server từ chối `409 ERR_PLACEMENT_COLLISION`, không trừ nguyên liệu |

### 2.8 Multiplayer, Party & Multi-Phase Boss Raid (`TS-BOS`)
| ID | Nhóm | Kịch bản | Điều kiện đầu vào | Kết quả mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| `TS-BOS-001` | Happy Path | Co-op 4 người hạ `boss_thornback_elder` đủ 3 phase | Party 4 người vào `dng_mossroot_hollow` | Máu & Poise Boss scale theo 4 người; chuyển đúng Phase 1→2 (65%) → 3 (30%); Stagger `6.0s / x1.40` khi Poise = 0; cả 4 người nhận `PERSONAL_INSTANCED` loot công bằng |
| `TS-BOS-002` | Anti-Exploit | Kéo Boss ra khỏi sàn đấu hoặc đứng góc lag | 1 thành viên chạy lùi về cửa khóa hoặc thoát vùng chiến đấu | Cửa đấu trường khóa khi chiến đấu; Boss miễn nhiễm hoặc reset nếu không có mục tiêu hợp lệ trong arena |
| `TS-BOS-003` | Disconnect | 1 thành viên mất mạng giữa Phase 2 | Rút mạng thành viên C 30s rồi kết nối lại | Nhân vật C giữ 5s combat grace, giữ suất Party 120s; kết nối lại vào lại đúng phụ bản đang diễn ra |
