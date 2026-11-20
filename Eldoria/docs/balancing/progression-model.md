# Character Progression & EXP Curve Model (Lv 1 – Lv 100)

**Trạng thái**: Design Baseline v1.0 (Khớp 100% `05-character-progression.md` & `tools/design-validation/run-simulations.mjs`)  
**Cập nhật lần cuối**: 2026-11-19

---

## 1. Công thức Đường cong Kinh nghiệm (EXP Curve Lv 1 → 100)

Để đảm bảo giai đoạn đầu (Lv 1–15) mượt mà, tạo cảm giác tiến bộ rõ ràng trong 30 phút – 1 ngày đầu, trong khi giai đoạn dài hạn (Lv 30–100) không phình to theo hàm mũ cực đoan, Eldoria áp dụng đường cong **Đa thức bậc 2.25 kết hợp đoạn tuyến tính mở đầu**:

$$\text{EXP}_{\text{toNext}}(L) = \left\lfloor 100 + 35\cdot L + 12\cdot L^{2.25} \right\rfloor, \quad L \in \{1..99\}$$

*(Ở $L = 100$, đạt trần dài hạn; trong MVP khóa trần tại $L = 30$ — kinh nghiệm dư sau Lv 30 ở MVP được chuyển đổi thành `Mastery EXP` hoặc dừng cộng cho tới M2).*

### Bảng Mốc Cấp độ Chuẩn (Tính chính xác bằng Node.js từ Công thức)
| Cấp độ ($L$) | EXP lên cấp tiếp | Tổng EXP tích lũy | Vùng tương ứng | Thời gian chơi ước tính (Regular 2.5h/ngày) | Điểm Thuộc tính tích lũy | Điểm Kỹ năng tích lũy |
| :---: | :---: | :---: | :--- | :---: | :---: | :---: |
| **1 → 2** | 147 | 0 | `reg_greenhaven_village` | 0 phút (Khởi đầu) | 0 | 1 |
| **5** | 723 | 1,232 | `reg_whispering_forest` (Rìa rừng) | ~25 phút | 20 | 6 |
| **10** | 2,583 | 8,011 | `reg_whispering_forest` (Sâu) | ~2.5 giờ | 45 | 12 |
| **15** | 5,938 | 27,003 | `dng_mossroot_hollow` (**MVP Boss**) | ~6 giờ (~2–3 ngày) | 70 | 18 |
| **20** | 10,950 | 66,028 | MVP Mid-Endgame + Ascension 1 | ~14 giờ (~6 ngày) | 95 | 24 |
| **25** | 17,745 | 133,633 | MVP Hardcore / +10 Ready | ~26 giờ (~10 ngày) | 120 | 30 |
| **30** | 26,425 | 238,946 | **Trần MVP** / `reg_ironpeak_mountains` | ~42 giờ (~17 ngày) | 145 | 36 |
| **45** | 64,612 | 879,265 | `reg_crystal_caverns` (M3) | ~1.5 tháng | 220 | 54 |
| **60** | 122,432 | 2,227,757 | `reg_forgotten_ruins` / `reg_frostbound_highlands` | ~2.5 tháng | 295 | 72 |
| **75** | 201,366 | 4,589,691 | `reg_ember_wasteland` (M4) | ~4 tháng | 370 | 90 |
| **90** | 302,632 | 8,290,569 | `reg_abyssal_kingdom` (M5) | ~6 tháng | 445 | 108 |
| **100** | — (Max) | 11,670,182 | Endgame Raid (`boss_malakor_abyss`) | ~7–8 tháng | 495 | 120 |

---

## 2. Cấu trúc Phân bổ Điểm, Đột phá (Ascension) & Combat Rating

1. **Attribute Points**: Mỗi cấp nhận **`+5` điểm tự do** phân bổ vào `STR`, `AGI`, `INT`, `VIT`, `DEX`, `LUK`. Cho phép tẩy điểm (Respec) tại `bld_training_ground` hoặc NPC Elder Rowan bằng một lượng Gold hợp lý (`250 * level` Gold — đóng vai trò Gold sink sạch).
2. **Skill Points**: Nhận **`+1` điểm mỗi cấp** + **`+1` điểm thưởng** tại các mốc chia hết cho 5 (Lv 5, 10, 15, ...). Đủ để nâng tối đa toàn bộ kỹ năng chủ lực của hero đang chơi.
3. **Character Ascension (5 Bậc Đột phá)**:
   - Bậc 1 (Lv 20): `+6%` Total ATK/HP/DEF, mở nhánh Talent cấp 2 (MVP hỗ trợ tối đa Bậc 1).
   - Bậc 2 (Lv 40), Bậc 3 (Lv 60), Bậc 4 (Lv 75), Bậc 5 (Lv 90): mỗi bậc `+6%` chỉ số tổng và cần nguyên liệu Boss từng vùng (tạo lý do quay lại săn Boss cùng người chơi mới).
4. **Công thức Combat Rating (`CR`)**:
   $$\text{CR} = \left\lfloor 0.25\cdot\text{MaxHP} + 0.40\cdot\text{MaxMP} + 3.2\cdot\text{TotalATK} + 2.4\cdot\text{TotalDEF} + 450\cdot\text{CritRate} + 180\cdot(\text{CritDamage}-1) + 400\cdot\text{CDR} + 15\cdot\sum\text{SkillRank} \right\rfloor$$

### Ngưỡng Combat Rating Đề xuất Theo Nội dung MVP (Tính khớp `05-character-progression.md`)
| Nội dung | Cấp đề xuất | Vũ khí kỳ vọng | Combat Rating Đề xuất |
| :--- | :---: | :---: | :---: |
| `reg_whispering_forest` (Ngoài) | Lv 1–7 | Vũ khí khởi đầu `+0..+2` | `950 – 1,800` |
| `mob_elite_alpha_direwolf` | Lv 10–13 | Vũ khí sắt `+3..+5` + Giáp thợ săn | `2,200 – 3,100` |
| `dng_mossroot_hollow` (`boss_thornback_elder` Solo/Party) | Lv 14–18 | Vũ khí `+5..+7` + Bộ `set_mossroot_guard` + Món ăn Buff | `3,200 – 4,400` |
| MVP Endgame Mastery (Speedrun / +10 Milestone) | Lv 25–30 | Vũ khí `+10` + Ascension 1 | `5,200 – 6,800` |

---

## 3. Phân tích Tác động Rarity Nhân vật lên Tiến trình (Anti-Pay-to-Win Guarantee)

Dựa trên số liệu chuẩn từ `game-data/characters.json`:
- Sự chênh lệch tổng ngân sách chỉ số gốc giữa `COMMON` (`chr_mira_ironfist`) và `MYTHIC` (`chr_nyx_voidcaller` / `chr_aurelia_starbow`) chỉ nằm trong biên độ **~8.5% – 10%** ở cả Lv 1 và Lv 100.
- Trong khi đó:
  - Cường hóa vũ khí từ `+0` lên `+10` (100% farm trong game) đóng góp **`+130%` Weapon ATK + 96 Flat ATK** (chiếm hơn **45%** tổng sức mạnh nhân vật!).
  - Món ăn nấu từ Nông trại (`csm_golden_roast`, `csm_ember_curry`) đóng góp **`+12% đến +18%` ATK/Crit/Stamina Regen**.
  - Kỹ năng né đòn (`Dodge i-frame`), `Perfect Parry` và cơ chế phá Poise đóng góp **> 35%** hiệu quả thực chiến Boss.
- **Kết luận**: Người chơi dùng 3 nhân vật miễn phí MVP (`chr_kael_vanguard`, `chr_lyra_windrunner`, `chr_seraphina_dawn`) hoặc nhân vật `COMMON`/`UNCOMMON` hoàn toàn chinh phục xuất sắc mọi nội dung và Boss Raid mà không bị ép buộc phụ thuộc vào may rủi Gacha.
