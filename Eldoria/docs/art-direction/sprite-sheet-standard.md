# Sprite Sheet & Texture Atlas Standard — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0  
**Chế độ**: `DESIGN_AND_PLANNING_ONLY`  
**Cập nhật lần cuối**: 2026-11-19  
**Tài liệu liên kết**: [Art Bible](./art-bible.md), [Character Design Standard](./character-design-standard.md), [Animation Standard](./animation-standard.md), [Animation State Machine](./animation-state-machine.md), [Frontend Architecture](../architecture/frontend-architecture.md)

---

## 1. Quy chuẩn Đóng gói Texture Atlas & Export Tooling

Toàn bộ sprite sheet và texture atlas của **Eldoria: Forgotten Wilds** được xây dựng cục bộ trong pipeline phát triển và phục vụ trực tiếp từ máy chủ tĩnh nội bộ `assets/atlases/` (**KHÔNG** phụ thuộc dịch vụ lưu trữ đám mây hay bất kỳ dịch vụ bên thứ ba nào theo Nguyên tắc I Hiến pháp).

### 1.1 Quy tắc Export Cứng (TexturePacker CLI / `free-tex-packer-core`)
Mọi tệp atlas xuất cho Phaser 3 PHẢI thỏa mãn đồng thời 8 tham số kỹ thuật sau:

| Tham số Đóng gói | Giá trị Bắt buộc | Lý do Kỹ thuật |
| :--- | :---: | :--- |
| **Max Atlas Size** | **`<= 2048 × 2048 px`** | Bảo đảm tương thích 100% WebGL trên máy cấu hình tầm trung, iGPU cũ và lộ trình di động tương lai. |
| **Dimensions** | **Power-of-Two (POT)** (`256`, `512`, `1024`, `2048`) | Tối ưu cấp phát bộ nhớ texture GPU và tránh nội suy mip/UV sai lệch trên một số driver WebGL. |
| **`borderPadding` & `shapePadding`** | **`2 px`** | Tạo vùng đệm tối thiểu 2 pixel giữa mọi frame và mép ảnh để không lem màu từ frame kề cận. |
| **`extrude`** | **`1 px`** | Nhân bản 1 pixel viền ngoài của từng frame/tile (bắt buộc với tileset và mọi sprite sát cạnh) nhằm **triệt tiêu 100% lỗi texture bleeding / vệt hở 1 px** khi camera trượt hoặc ở chế độ `FILL_PIXELATED`. |
| **`allowRotation`** | **`false`** | Giữ nguyên định hướng pixel art, tránh lỗi xoay pixel trên các shader tùy chỉnh (hit-flash, enhancement glow). |
| **`trim` (Whitespace Crop)** | **`false`** cho Character/Mob/Animal/Boss Grid;<br>**`true`** cho VFX/Projectile/UI Icons | Giữ `trim: false` cho thực thể nhân vật/boss giúp pivot `(footX, footY)` đồng nhất tuyệt đối trên mọi frame và dễ kiểm tra bằng mắt; bật `trim: true` cho hạt VFX lớn nhiều nền rỗng giúp tiết kiệm 40–60% VRAM. |
| **Output Format** | **Phaser 3 JSON Hash (`phaser3`)** + Lossless 32-bit RGBA `.png` | Phaser 3 đọc trực tiếp qua `this.load.atlas(...)`; cấm nén lossy (`.jpg`, `.webp` lossy) làm hỏng bảng màu pixel. |
| **Frame Naming Pattern** | `<entityId>/<animSlug>/<dir>_<index2>` | Ví dụ: `chr_kael_vanguard/idle/down_00`, khớp hoàn toàn với `framePathPattern` trong `animation-standard.md`. |

### 1.2 Công thức Tọa độ Ô khi Có `padding: 2 px` & `extrude: 1 px`
Với mỗi frame kích thước gốc $W \times H$:
- Độ rộng chiếm dụng thực mỗi cột: $\Delta X = W + 2 \times \text{extrude} + \text{shapePadding} = W + 4\text{ px}$.
- Chiều cao chiếm dụng thực mỗi hàng: $\Delta Y = H + 2 \times \text{extrude} + \text{shapePadding} = H + 4\text{ px}$.
- Tọa độ góc trên-trái phần nội dung gốc của ô $(col, row)$ (đánh số từ `0`):
  $$x = (\text{borderPadding} + \text{extrude}) + col \times (W + 4) = 3 + col \times (W + 4)$$
  $$y = (\text{borderPadding} + \text{extrude}) + row \times (H + 4) = 3 + row \times (H + 4)$$
- Số cột/hàng tối đa trên trang kích thước $S_W \times S_H$:
  $$C_{\max} = \left\lfloor \frac{S_W - 2}{W + 4} \right\rfloor,\quad R_{\max} = \left\lfloor \frac{S_H - 2}{H + 4} \right\rfloor$$

### 1.3 Cấu hình Mẫu `free-tex-packer-core` (Chạy Cục bộ bằng Node.js)
```json
{
  "textureName": "atlas_chr_kael_vanguard",
  "width": 2048,
  "height": 1024,
  "fixedSize": true,
  "powerOfTwo": true,
  "padding": 2,
  "extrude": 1,
  "allowRotation": false,
  "allowTrim": false,
  "detectIdentical": true,
  "packer": "OptimalPacker",
  "exporter": "Phaser3",
  "removeFileExtension": true,
  "prependFolderName": true
}
```
*(Ghi chú: Có thể thay thế tương đương bằng lệnh `TexturePacker --format phaser --max-size 2048 --size-constraints POT --padding 2 --extrude 1 --disable-rotation --trim-mode None`.)*

---

## 2. Blueprint 1 — Sample Hero: `chr_kael_vanguard` (`48 × 64 px`)

- **Nguồn chuẩn**: `game-data/characters.json` (`chr_kael_vanguard`) & `game-data/skills.json` (5 kỹ năng của Kael).
- **Atlas Key**: `atlas_chr_kael_vanguard` (`assets/atlases/characters/atlas_chr_kael_vanguard.png` + `.json`).
- **Thông số Ô**: Frame `48×64 px`, Stride `52×68 px` (đã tính `padding: 2`, `extrude: 1`), Pivot `(24, 58)` → normalized `(0.5000, 0.90625)`, Footbox `20×14 px`, Hurtbox `24×34 px`.
- **Kích thước Trang POT**: **`2048 × 1024 px`** (`39 cột × 15 hàng = 585 ô`). Tổng sử dụng **`532` frame** (`90.9%` diện tích, dư `53` ô dự phòng cho emote/biến thể sự kiện) — gói gọn toàn bộ 25 trạng thái + 3 nhịp combo + 3 active skill + 1 ultimate của Kael vào **DUY NHẤT 1 WebGL Texture**!

### 2.1 Sơ đồ ASCII Layout (`2048 × 1024 px` — 39 Cột × 15 Hàng, Stride `52×68`)
```text
Atlas: atlas_chr_kael_vanguard.png (2048 x 1024 px | cell=48x64 | pad=2 | ext=1 | stride=52x68)
Origin frame (0,0) content = (x=3, y=3) ... frame (c,r) content = (3 + c*52, 3 + r*68)

Row   y_px   Cols 0..19                                      Cols 20..38
----+------+-----------------------------------------------+-----------------------------------------------
R00 |   3  | [0..3] idle_D  [4..7] idle_U  [8..11] idle_L  [12..15] idle_R | [16..21] walk_D [22..27] walk_U [28..33] walk_L [34..38] (5/6 walk_R)
R01 |  71  | [0] walk_R_05 | [1..6] run_D [7..12] run_U [13..18] run_L [19..24] run_R | [25..30] sprint_D [31..36] sprint_U [37..38] (2/6 sprint_L)
R02 | 139  | [0..3] sprint_L_02..05 [4..9] sprint_R | [10..14] atk1_D [15..19] atk1_U | [20..24] atk1_L [25..29] atk1_R | [30..34] atk2_D [35..38] (4/5 atk2_U)
R03 | 207  | [0] atk2_U_04 [1..5] atk2_L [6..10] atk2_R | [11..16] atk3_D [17..22] atk3_U | [23..28] atk3_L [29..34] atk3_R | [35..38] cast_D
R04 | 275  | [0..3] cast_U [4..7] cast_L [8..11] cast_R | [12..16] dodge_D [17..21] dodge_U | [22..26] dodge_L [27..31] dodge_R | [32..35] dash_D [36..38] (3/4 dash_U)
R05 | 343  | [0] dash_U_03 [1..4] dash_L [5..8] dash_R | [9..11] hit_D [12..14] hit_U [15..17] hit_L [18..20] hit_R | [21..24] kb_D [25..28] kb_U [29..32] kb_L [33..36] kb_R | [37..38] (2/4 stun_D)
R06 | 411  | [0..1] stun_D_02..03 [2..5] stun_U [6..9] stun_L [10..13] stun_R | [14..16] blk_D [17..19] blk_U [20..22] blk_L [23..25] blk_R | [26..31] death_L [32..37] death_R | [38] (1/6 respawn_D)
R07 | 479  | [0..4] respawn_D_01..05 | [5..10] skl1_lunge_D [11..16] skl1_lunge_U [17..22] skl1_lunge_L [23..28] skl1_lunge_R | [29..33] skl2_parry_D [34..38] skl2_parry_U
R08 | 547  | [0..4] skl2_parry_L [5..9] skl2_parry_R | [10..15] skl3_cleave_D [16..21] skl3_cleave_U [22..27] skl3_cleave_L [28..33] skl3_cleave_R | [34..38] (5/8 ult_crescent_D)
R09 | 615  | [0..2] ult_D_05..07 [3..10] ult_U [11..18] ult_L [19..26] ult_R | [27..31] mine_D [32..36] mine_U [37..38] (2/5 mine_L)
R10 | 683  | [0..2] mine_L_02..04 [3..7] mine_R | [8..12] wood_D [13..17] wood_U [18..22] wood_L [23..27] wood_R | [28..31] hoe_D [32..35] hoe_U [36..38] (3/4 hoe_L)
R11 | 751  | [0] hoe_L_03 [1..4] hoe_R | [5..8] water_D [9..12] water_U [13..16] water_L [17..20] water_R | [21..24] fcast_D [25..28] fcast_U [29..32] fcast_L [33..36] fcast_R | [37..38] fidle_D
R12 | 819  | [0..1] fidle_U [2..3] fidle_L [4..5] fidle_R | [6..9] freel_D [10..13] freel_U [14..17] freel_L [18..21] freel_R | [22..25] craft_U [26..29] craft_R | [30..33] build_D [34..37] build_U | [38] (1/4 build_R)
R13 | 887  | [0..2] build_R_01..03 | [3..5] int_D [6..8] int_U [9..11] int_L [12..14] int_R | [15..18] emo_wave_D [19..22] emo_cheer_D [23..24] emo_sit_D | [25..38] SPARE (14 cells)
R14 | 955  | [0..38] SPARE (39 cells reserved for future emotes, seasonal gestures, or 8-dir diagonal expansion)
```

### 2.2 Animation Matrix Đầy đủ cho `chr_kael_vanguard`
| `animationKey` (Khớp `characters.json` / `skills.json`) | State HFSM | Dirs | Frames / Dir | Tổng Cells | Timing (ms) | Loop | Hit / VFX / SFX Highlights |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| `kael_idle` | `IDLE` | 4 | 4 | 16 | `220×4` (880) | `LOOP` | Áo choàng đỏ lay nhẹ 1 px, ánh gân lửa kiếm thở dịu |
| `kael_walk` / `kael_run` / `kael_sprint` | `WALK`/`RUN`/`SPRINT` | 4 | 6 / 6 / 6 | 72 | `130×6` / `90×6` / `70×6` | `LOOP` | Bước chân F1/F4; Sprint nghiêng vai phải + vệt áo choàng |
| `kael_atk_combo_1` | `ATTACK` | 4 | 5 | 20 | `60,60,55,55,170` (400) | `ONCE` | Chém ngang phải; Hit F2 (`120 ms`), Cancel F4 (`230 ms`) |
| `kael_atk_combo_2` | `ATTACK_COMBO` | 4 | 5 | 20 | `55,55,55,55,180` (400) | `ONCE` | Chém ngược trái; Hit F2 (`110 ms`), Cancel F4 (`220 ms`) |
| `kael_atk_combo_3` | `ATTACK_COMBO` | 4 | 6 | 24 | `65,65,55,55,95,115` (450) | `ONCE` | Bổ lửa dọc; Hit F2–F3, tia lửa mặt đất + Poise 18 |
| `kael_cast` | `CAST` | 4 | 4 | 16 | `60×4` (240) | `LOOP` | Dựng kiếm ngang ngực tụ nhiệt (trước `Crimson Crescent`) |
| `kael_skill_blazing_lunge` | `SKILL` | 4 | 6 | 24 | `70,70,75,75,70,180` (540) | `ONCE` | Khớp `skills.json`: Start `140` / Act `220` / Rec `180`; VFX `vfx_kael_blazing_lunge_trail` |
| `kael_skill_cinder_parry` | `SKILL` | 4 | 5 | 20 | `60,180,185,185,180` (790) | `ONCE` | Khớp `skills.json`: Start `60` / Act `550` / Rec `180`; SFX `sfx_kael_cinder_parry_clang` |
| `kael_skill_sunder_cleave` | `SKILL` | 4 | 6 | 24 | `110,110,65,65,110,110` (570) | `ONCE` | Khớp `skills.json`: Start `220` / Act `130` / Rec `220`; VFX `vfx_kael_sunder_cleave_arc` |
| `kael_ult_crimson_crescent` | `ULTIMATE` | 4 | 8 | 32 | `85,85,90,120,150,165,165,260` (1120) | `ONCE` | Sau 240 ms `CAST`; Start `260` / Act `600` / Rec `260`; sóng lưỡi liềm F3 `vfx_kael_crimson_crescent_wave` |
| `kael_dodge` / `kael_dash` | `DODGE` / `DASH` | 4 | 5 / 4 | 36 | `400` / `250` | `ONCE` | Dodge lăn thấp né nhanh (i-frame 300 ms = F0..F3) |
| `kael_hit` / `kael_knockback` / `kael_stun` | `HIT`/`KNOCKBACK`/`STUN` | 4 | 3 / 4 / 4 | 44 | `200` / `400` / `560` | `ONCE`/`HOLD`/`LOOP` | Khựng vai, trượt chân hất văng, vòng sao choáng đầu |
| `kael_block` | `BLOCK` | 4 | 3 | 12 | `50,150,120` | `HOLD_LAST` | F0–F1 = 200 ms thế Perfect Parry dựng kiếm chéo |
| `kael_death` / `kael_respawn` | `DEATH` / `RESPAWN` | 2 / 1 | 6 / 6 | 18 | `700` / `600` | `HOLD`/`ONCE` | Quỵ gối ngã ngang (`LEFT`/`RIGHT`), hồi sinh đứng dậy (`DOWN`) |
| `kael_mining` / `kael_woodcut` | `MINING` / `WOODCUTTING` | 4 | 5 / 5 | 40 | `500` / `500` | `LOOP` | Tự ẩn kiếm, hiện cuốc chim / rìu gỗ ở Layer B; Impact F2 |
| `kael_farm_hoe` / `kael_farm_water` | `FARMING` | 4 | 4 / 4 | 32 | `400` / `400` | `ONCE` | Cuốc luống đất / tưới bình nước tại `front_tile` |
| `kael_fish_*` (`cast`/`idle`/`reel`) | `FISHING` | 4 | 4+2+4 | 40 | `360`/`800`/`360` | `ONCE`/`LOOP` | Quăng dây F2, giữ cần, giật cần kéo cá |
| `kael_craft` / `kael_build` / `kael_interact` | `CRAFT`/`BUILD`/`INTERACT` | 2 / 3 / 4 | 4 / 4 / 3 | 32 | `500`/`400`/`270` | `LOOP`/`ONCE` | Búa rèn đe (`LEFT` mirror từ `RIGHT`), gõ gỗ dựng nhà, cúi nhặt đồ |
| `kael_emote_*` (`wave`/`cheer`/`sit`) | `EMOTE` | 1 (`DOWN`) | 4+4+2 | 10 | `560`/`560`/`700` | `ONCE`/`LOOP` | Vẫy tay chào làng, giơ kiếm ăn mừng, ngồi nghỉ bên lửa trại |

### 2.3 Mẫu JSON Atlas Metadata (`atlas_chr_kael_vanguard.json` — Phaser 3 Format)
```json
{
  "textures": [
    {
      "image": "atlas_chr_kael_vanguard.png",
      "format": "RGBA8888",
      "size": { "w": 2048, "h": 1024 },
      "scale": 1,
      "frames": [
        {
          "filename": "chr_kael_vanguard/idle/down_00",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 48, "h": 64 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 48, "h": 64 },
          "frame": { "x": 3, "y": 3, "w": 48, "h": 64 },
          "anchor": { "x": 0.5, "y": 0.90625 }
        },
        {
          "filename": "chr_kael_vanguard/idle/down_01",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 48, "h": 64 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 48, "h": 64 },
          "frame": { "x": 55, "y": 3, "w": 48, "h": 64 },
          "anchor": { "x": 0.5, "y": 0.90625 }
        },
        {
          "filename": "chr_kael_vanguard/atk_combo_1/down_02",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 48, "h": 64 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 48, "h": 64 },
          "frame": { "x": 627, "y": 139, "w": 48, "h": 64 },
          "anchor": { "x": 0.5, "y": 0.90625 }
        }
      ]
    }
  ],
  "meta": {
    "app": "free-tex-packer-core",
    "version": "1.0.0",
    "padding": 2,
    "extrude": 1,
    "entityId": "chr_kael_vanguard",
    "sidecar": "anim_chr_kael_vanguard.json"
  }
}
```

---

## 3. Blueprint 2 — Sample Monster: `mob_timber_wolf`

> **ĐỐI CHIẾU SINGLE SOURCE OF TRUTH (Nguyên tắc III Hiến pháp)**:  
> Trong tệp dữ liệu chuẩn `game-data/monsters.json`, `mob_timber_wolf` được cố định `spriteSize: "64x64"`. Lý do kỹ thuật: phần thân đứng bình thường của Sói Gỗ nằm gọn trong **Active Standing Core Box `48 × 48 px`** (`x: 8..55, y: 8..55`), nhưng toàn bộ ô cell trên sprite sheet sử dụng **`64 × 64 px`** (tăng thêm `8 px` lề hành động ở mỗi cạnh) để chứa trọn sải chân nhảy lao `predator_pounce` và đuôi dài khi xoay ngang mà **không bị cắt cụt khung hình (frame clipping)**.

- **Thông số Không gian**: Atlas Cell **`64 × 64 px`** (Standing Core **`48 × 48 px`**), Stride `68 × 68 px` (`padding: 2`, `extrude: 1`), Pivot `(32, 56)` → normalized `(0.5000, 0.8750)`, Collision Footbox `28 × 16 px`, Server Hurtbox `36 × 28 px`.
- **Chiến lược Đóng gói**:
  - **Standalone Authoring Sheet**: **`1024 × 1024 px`** POT (`15 cột × 15 hàng = 225 ô`), sử dụng `111` ô cho 3 hướng vẽ tay (`DOWN`, `UP`, `RIGHT` + `allowHorizontalFlip: true` cho `LEFT` vì sói có hình thể đối xứng trái-phải).
  - **Runtime Regional Packing**: Khi đóng gói runtime cho vùng `reg_whispering_forest`, toàn bộ 8 quái vật MVP (`~880` frame) được gom chung vào 1 trang **`atlas_mobs_forest.png` (`2048 × 2048 px`, `900` ô)** để giảm tối đa số lần chuyển texture WebGL.

### 3.1 Sơ đồ ASCII Layout Standalone (`1024 × 1024 px` — 15 Cột × 15 Hàng, Stride `68×68`)
```text
Atlas: atlas_mob_timber_wolf.png (1024 x 1024 px | cell=64x64 [core 48x48] | pad=2 | ext=1 | stride=68x68)
Origin frame (0,0) content = (x=3, y=3) ... frame (c,r) content = (3 + c*68, 3 + r*68)

Row   y_px   Cols 0..14 (15 cols per row)
----+------+------------------------------------------------------------------------------------
R00 |   3  | [0..3] idle_D    | [4..7] idle_U    | [8..11] idle_R   | [12..14] (3/4 walk_D)
R01 |  71  | [0] walk_D_03    | [1..4] walk_U    | [5..8] walk_R    | [9..11] detect_D | [12..14] detect_U
R02 | 139  | [0..2] detect_R  | [3..8] chase_D   | [9..14] chase_U
R03 | 207  | [0..5] chase_R   | [6..10] bite_D   | [11..14] (4/5 bite_U)
R04 | 275  | [0] bite_U_04    | [1..5] bite_R    | [6..11] pounce_D | [12..14] (3/6 pounce_U)
R05 | 343  | [0..2] pounce_U  | [3..8] pounce_R  | [9..10] hit_D    | [11..12] hit_U   | [13..14] hit_R
R06 | 411  | [0..3] stun_D    | [4..7] stun_U    | [8..11] stun_R   | [12..14] (3/5 death_R)
R07 | 479  | [0..1] death_R   | [2..5] respawn_D | [6..14] SPARE (9 cells)
R08..R14   | Reserved for packed regional merge (`atlas_mobs_forest.png`) or Elite variant overlay
```

### 3.2 Animation Matrix Đầy đủ cho `mob_timber_wolf` (Khớp `game-data/monsters.json`)
| `animationKey` | AI State (`monsters.json`) | Dirs (Flip `LEFT`) | Frames | Timing (ms) | Loop | Đồng bộ Combat & Telegraph |
| :--- | :--- | :---: | :---: | :--- | :---: | :--- |
| `wolf_idle` | `IDLE` | 3 + flip | 4 | `200×4` (800) | `LOOP` | Thở nhẹ, tai vểnh, đuôi ve vẩy chậm |
| `wolf_walk` | `PATROL` / `RETURN` | 3 + flip | 4 | `130×4` (520) | `LOOP` | Bước kiệu tuần tra trong `patrolRadiusPx: 160` |
| `wolf_detect` | `DETECT` | 3 + flip | 3 | `90×3` (270) | `ONCE` | Hạ vai gầm gừ/hú khi phát hiện người chơi (`aggroRadiusPx: 224`) |
| `wolf_chase` | `CHASE` | 3 + flip | 6 | `75×6` (450) | `LOOP` | Phi nước đại sát đất (`moveSpeed: 148 px/s`) |
| `wolf_atk_fang_bite` | `ATTACK` (`fang_bite`) | 3 + flip | 5 | `[210, 210, 65, 75, 140]` (700) | `ONCE` | **F0–F1 = `420 ms` khớp chính xác `telegraphMs: 420`**; F2 cắn táp (`CONE`, `56 px`, tỉ lệ Bleed 25%) |
| `wolf_atk_predator_pounce` | `ATTACK` (`predator_pounce`) | 3 + flip | 6 | `[230, 230, 240, 80, 90, 180]` (1050) | `ONCE` | **F0–F2 = `700 ms` khớp chính xác `telegraphMs: 700`** (cúi rạp nén thân); F3–F4 vồ thẳng (`RECTANGLE`, `144 px`) |
| `wolf_hit` | `HIT` | 3 + flip | 2 | `60, 90` (150) | `ONCE` | Giật đầu ngược + hit flash `#FFF8E7` 50 ms |
| `wolf_stunned` | `STUNNED` | 3 + flip | 4 | `140×4` (560) | `LOOP` | Khuỵu hai chân trước, đầu lắc lư khi vỡ Poise (`poise: 55`) |
| `wolf_death` | `DEATH` | 1 (`RIGHT` + flip) | 5 | `90,90,100,110,160` (550) | `HOLD_LAST` | Ngã vật sang bên rồi mờ dần 500 ms rơi loot `ltb_mob_timber_wolf` |
| `wolf_respawn` | `RESPAWN` | 1 (`DOWN`) | 4 | `100×4` (400) | `ONCE` | Bước ra từ bụi mờ sau `respawnSeconds: 35` |

### 3.3 Mẫu JSON Atlas Metadata (`atlas_mob_timber_wolf.json`)
```json
{
  "textures": [
    {
      "image": "atlas_mob_timber_wolf.png",
      "format": "RGBA8888",
      "size": { "w": 1024, "h": 1024 },
      "scale": 1,
      "frames": [
        {
          "filename": "mob_timber_wolf/idle/down_00",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 64, "h": 64 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 64, "h": 64 },
          "frame": { "x": 3, "y": 3, "w": 64, "h": 64 },
          "anchor": { "x": 0.5, "y": 0.875 }
        },
        {
          "filename": "mob_timber_wolf/atk_predator_pounce/right_03",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 64, "h": 64 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 64, "h": 64 },
          "frame": { "x": 411, "y": 343, "w": 64, "h": 64 },
          "anchor": { "x": 0.5, "y": 0.875 }
        }
      ]
    }
  ],
  "meta": {
    "entityId": "mob_timber_wolf",
    "standingCorePx": { "w": 48, "h": 48 },
    "padding": 2,
    "extrude": 1,
    "allowHorizontalFlip": true
  }
}
```

---

## 4. Blueprint 3 — Sample Animal: `anm_meadow_chicken` (`32 × 32 px`)

- **Nguồn chuẩn**: `game-data/animals.json` (`anm_meadow_chicken`, `spriteKey: "spr_anm_meadow_chicken"`, giai đoạn `BABY` 6 giờ → `ADULT`, sản phẩm `mat_fresh_egg`).
- **Thông số Ô**: Frame **`32 × 32 px`**, Stride `36 × 36 px` (`padding: 2`, `extrude: 1`), Pivot `(16, 28)` → normalized `(0.5000, 0.8750)`, Collision Footbox `14 × 10 px` (không chặn cứng người chơi đi qua chuồng — dùng soft separation!).
- **Kích thước Trang POT**: **`512 × 256 px`** (`14 cột × 7 hàng = 98 ô`). Gói trọn **CẢ 2 giai đoạn `ADULT` (`45` frame) VÀ `BABY` (`30` frame)** = `75` frame (`76.5%` diện tích), còn dư `23` ô chứa luôn icon trứng tươi, bong bóng tim hạnh phúc và bóng elip nhỏ!

### 4.1 Sơ đồ ASCII Layout (`512 × 256 px` — 14 Cột × 7 Hàng, Stride `36×36`)
```text
Atlas: atlas_anm_meadow_chicken.png (512 x 256 px | cell=32x32 | pad=2 | ext=1 | stride=36x36)
Origin frame (0,0) content = (x=3, y=3) ... frame (c,r) content = (3 + c*36, 3 + r*36)

Row   y_px   Cols 0..13 (14 cols per row)
----+------+----------------------------------------------------------------------------------
R00 |   3  | [0..3] adult_idle_D  | [4..7] adult_idle_U  | [8..11] adult_idle_R | [12..13] (2/4 adult_walk_D)
R01 |  39  | [0..1] adult_walk_D  | [2..5] adult_walk_U  | [6..9] adult_walk_R  | [10..13] adult_eat_D
R02 |  75  | [0..3] adult_eat_U   | [4..7] adult_eat_R   | [8..9] adult_sleep_R | [10..13] adult_happy_D
R03 | 111  | [0..2] adult_egg_D   | [3..6] baby_idle_D   | [7..10] baby_idle_R  | [11..13] (3/4 baby_walk_D)
R04 | 147  | [0] baby_walk_D_03   | [1..4] baby_walk_R   | [5..8] baby_eat_D    | [9..12] baby_eat_R   | [13] (1/2 baby_sleep)
R05 | 183  | [0] baby_sleep_01    | [1..4] baby_happy_D  | [5..8] props (egg_normal, egg_silver, egg_gold, heart_vfx) | [9..13] SPARE
R06 | 219  | [0..13] SPARE (14 cells — dùng gom thêm biến thể lông nâu/trắng hoặc gà sự kiện)
```

### 4.2 Animation Matrix Đầy đủ cho `anm_meadow_chicken`
| `animationKey` | Growth Stage | Dirs (Flip `LEFT`) | Frames | Timing (ms) | Loop | Ghi chú Hành vi & Âm thanh |
| :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| `chicken_adult_idle` | `ADULT` | 3 + flip | 4 | `240×4` (960) | `LOOP` | Nhấp nhổm đầu nhẹ, cánh khép gọn |
| `chicken_adult_walk` | `ADULT` | 3 + flip | 4 | `135×4` (540) | `LOOP` | Bước lạch bạch quanh sân `bld_chicken_coop` |
| `chicken_adult_eat` | `ADULT` | 3 + flip | 4 | `160×4` (640) | `LOOP` | Mổ hạt `mat_sunwheat_grain`; F2 phát `sfx_chicken_peck` |
| `chicken_adult_sleep` | `ADULT` | 1 (`RIGHT`+flip) | 2 | `450×2` (900) | `LOOP` | Nằm ấp mắt nhắm vào ban đêm + icon `Zzz` |
| `chicken_adult_happy` | `ADULT` | 1 (`DOWN`) | 4 | `110×4` (440) | `ONCE` | Nhảy nhún vỗ cánh khi được vuốt ve (+10 Happiness); `sfx_chicken_cluck_happy` |
| `chicken_adult_produce` | `ADULT` | 1 (`DOWN`) | 3 | `150×3` (450) | `ONCE` | Ngồi ổ rũ lông tạo `mat_fresh_egg` mỗi `48` phút |
| `chicken_baby_*` (`idle`/`walk`/`eat`/`sleep`/`happy`) | `BABY` | 2 (`DOWN`/`RIGHT`+flip) | 4/4/4/2/4 | `220`/`120`/`150`/`450`/`100` | `LOOP`/`ONCE` | Gà con vàng tròn `14×14 px` trong ô `32×32`, lớn thành `ADULT` sau 6 giờ server |

### 4.3 Mẫu JSON Atlas Metadata (`atlas_anm_meadow_chicken.json`)
```json
{
  "textures": [
    {
      "image": "atlas_anm_meadow_chicken.png",
      "format": "RGBA8888",
      "size": { "w": 512, "h": 256 },
      "scale": 1,
      "frames": [
        {
          "filename": "anm_meadow_chicken/adult_idle/down_00",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 32, "h": 32 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
          "frame": { "x": 3, "y": 3, "w": 32, "h": 32 },
          "anchor": { "x": 0.5, "y": 0.875 }
        },
        {
          "filename": "anm_meadow_chicken/baby_idle/down_00",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 32, "h": 32 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
          "frame": { "x": 111, "y": 111, "w": 32, "h": 32 },
          "anchor": { "x": 0.5, "y": 0.875 }
        }
      ]
    }
  ],
  "meta": {
    "entityId": "anm_meadow_chicken",
    "spriteKey": "spr_anm_meadow_chicken",
    "padding": 2,
    "extrude": 1,
    "allowHorizontalFlip": true
  }
}
```

---

## 5. Blueprint 4 — Sample Boss: `boss_thornback_elder` (`128 × 128 px`)

- **Nguồn chuẩn**: `game-data/bosses.json` (`boss_thornback_elder`, `dng_mossroot_hollow`, 3 Phases, `staggerMechanic: 6000 ms`, `enrageMechanic`, 9 kỹ năng boss).
- **Thông số Ô**: Frame **`128 × 128 px`**, Stride `132 × 132 px` (`padding: 2`, `extrude: 1`), Pivot `(64, 114)` → normalized `(0.5000, 0.890625)`, Collision Footbox `56 × 32 px` (gốc rễ trung tâm), Server Hurtbox `72 × 92 px`.
- **Chiến lược Tiết kiệm 66% VRAM bằng Tách lớp Lõi Nhựa (`Heartwood Core Overlay`)**: Thay vì vẽ lại toàn bộ 138 frame Boss cho 3 giai đoạn (Phase 1 lõi xanh lục, Phase 2 lõi vàng hổ phách, Phase 3 lõi nứt đỏ cam), phần vỏ cây thân Boss vẽ 1 lần duy nhất; lớp **Lõi Ngực `32×32 px`** (3 màu × 4 frame thở) được đóng gói vào hàng cuối cùng của chính atlas này và gắn theo tọa độ `coreAnchorPx` mỗi frame!
- **Kích thước Trang POT**: **`2048 × 2048 px`** (`15 cột × 15 hàng = 225 ô`). Sử dụng **`138` ô Boss** + hàng phụ chứa **Lõi 3 Phase, Đạn Bào tử (`Spore Volley`), Trụ Gai Rễ (`Briar Spike`) và 4 Trạng thái Hư hại Trụ Đá (`pil_moss_*`)** → Toàn bộ trận đánh Boss `boss_thornback_elder` chạy trong **1 texture atlas duy nhất**!

### 5.1 Sơ đồ ASCII Layout (`2048 × 2048 px` — 15 Cột × 15 Hàng, Stride `132×132`)
```text
Atlas: atlas_boss_thornback_elder.png (2048 x 2048 px | cell=128x128 | pad=2 | ext=1 | stride=132x132)
Origin frame (0,0) content = (x=3, y=3) ... frame (c,r) content = (3 + c*132, 3 + r*132)

Row   y_px   Cols 0..14 (15 cols per row)
----+------+-----------------------------------------------------------------------------------------
R00 |    3 | [0..5] idle_D       | [6..11] idle_R       | [12..14] (3/6 idle_U)
R01 |  135 | [0..2] idle_U       | [3..8] move_D        | [9..14] move_R
R02 |  267 | [0..5] move_U       | [6..13] phase_roar_D | [14] (1/8 root_slam_D)
R03 |  399 | [0..6] root_slam_D  | [7..14] root_slam_R
R04 |  531 | [0..6] bramble_D    | [7..13] bramble_R    | [14] (1/6 spore_volley_D)
R05 |  663 | [0..4] spore_D      | [5..10] spore_R      | [11..14] (4/6 regrowth_sap_D)
R06 |  795 | [0..1] regrowth_D   | [2..7] charge_D      | [8..13] charge_R     | [14] (1/6 tempest_D)
R07 |  927 | [0..4] tempest_D    | [5..10] quake_D      | [11..14] staggered_kneel_D
R08 | 1059 | [0..5] enrage_roar_D| [6..14] death_collapse_D (9 frames)
R09 | 1191 | [0..2] hit_flinch_D | [3..14] Boss Props & Overlays packed sub-cells:
           |        - core_p1_green (4x 32x32), core_p2_amber (4x 32x32), core_p3_crimson (4x 32x32)
           |        - proj_spore_orb (4x 32x32), hazard_briar_spike (4x 32x32), hazard_sap_pool (4x 64x64)
           |        - arena_pillar_intact / cracked / shattered (3x 64x96)
R10..R14   | Reserved buffer (hoặc thu gọn thành 2 trang 2048x1024 nếu muốn giảm footprint RAM)
```

### 5.2 Animation Matrix Đầy đủ cho `boss_thornback_elder` (Khớp 100% `game-data/bosses.json`)
| `animationKey` | Boss Skill / State (`bosses.json`) | Phase | Dirs | Frames | Timing (ms) khớp `telegraphMs` | Loop | Ghi chú Đọc Chiêu & Counterplay |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| `thorn_idle` | `IDLE` | 1–3 | 3 (`D`/`U`/`R`+flip) | 6 | `180×6` (1080) | `LOOP` | Cành gai rung chậm, lõi ngực thở sáng |
| `thorn_move` | `MOVE` | 1–3 | 3 + flip | 6 | `160×6` (960) | `LOOP` | Rễ cây bò lổm ngổm (`moveSpeed: 95 px/s`) |
| `thorn_phase_roar` | `PHASE_TRANSITION` (65% & 30% HP) | 1→2, 2→3 | 1 (`DOWN`) | 8 | `150×8` (1200) | `ONCE` | Ngửa đầu gầm rung nhẹ (tắt được), đổi màu lõi ngực mượt |
| `thorn_root_slam` | `thorn_root_slam` (`CIRCLE`) | 1–3 | 2 (`D`/`R`+flip) | 8 | Windup F0–F3: `[225×4]` (**`900 ms`**) + Slam F4–F7: `[70,80,140,160]` | `ONCE` | Giơ cao hai tay rễ phát sáng vàng đất `900 ms`, đập đất F4 |
| `thorn_bramble_lash` | `thorn_bramble_lash` (`CONE 120°`) | 1–3 | 2 + flip | 7 | Windup F0–F2: `[280,285,285]` (**`850 ms`**) + Lash F3–F6: `[65,75,130,150]` | `ONCE` | Vặn thân tích lực sang 1 bên `850 ms` → quét quạt F3–F4 |
| `thorn_spore_volley` | `thorn_spore_volley` (`3x PROJECTILE`) | 1–3 | 2 + flip | 6 | Windup F0–F2: `[330,335,335]` (**`1000 ms`**) + Fire F3–F5: `[70,110,140]` | `ONCE` | Phồng tán gai lưng `1000 ms`, bắn 3 tia F3 (bị chặn bởi Trụ Đá!) |
| `thorn_regrowth_sap` | `thorn_regrowth_sap` (`RING` Channel) | 2–3 | 1 (`DOWN`) | 6 | Entry F0–F1 (`200`) + Loop F2–F5 (`150×4` lặp suốt **`2200 ms`**) | `LOOP` | Cắm 2 tay xuống sàn hút hạt nhựa xanh; dễ nhận diện để dồn Fire phá Poise! |
| `thorn_heartwood_charge` | `thorn_heartwood_charge` (`RECTANGLE`) | 3 | 2 + flip | 6 | Windup F0–F2: `[400×3]` (**`1200 ms`**) + Charge Loop F3–F5 (`80×3`) | `ONCE`/`LOOP` | Cúi vai dậm chân `1200 ms`, lao húc toàn sân (đâm Trụ Đá → tự Stun `2500 ms`) |
| `thorn_mossroot_quake` | `thorn_mossroot_quake` (`RING` 2 đợt) & `thorn_creeping_roots` / `thorn_canopy_rain` | 2–3 | 1 (`DOWN`) | 6 | Windup F0–F2 khớp **`1150 / 1300 / 1400 ms`** (scale thời lượng F0–F2) + Impact F3–F5 | `ONCE` | Đập rễ xuống sàn tạo sóng đồng tâm hoặc gọi gai từ trần; chia sẻ dáng đập giúp tối ưu VRAM |
| `thorn_sylvan_tempest` | `thorn_sylvan_tempest` (`CROSS_LINE` xoay 90°) | 3 | 1 (`DOWN`) | 6 | Windup F0–F2 (**`1600 ms`**) + Spin Loop F3–F5 (`120×3`) | `LOOP` | Giang ngang 2 tay xoay chậm 4 luồng gai chữ thập |
| `thorn_staggered` | `STAGGERED` (`Poise = 0`, `6000 ms`) | 1–3 | 1 (`DOWN`) | 4 | `220×4` (880/loop trong suốt `6000 ms`) | `LOOP` | Khuỵu gối gục đầu, lõi ngực lộ mở hoàn toàn (+40% damage taken) |
| `thorn_enrage_roar` | `ENRAGED` (`360s` Enrage Timer) | 3 | 1 (`DOWN`) | 6 | `160×6` (960) | `ONCE` | Tỏa khói đỏ trầm ổn định, mắt lõi sáng vàng (KHÔNG strobe) |
| `thorn_death` | `DEFEATED` | 3 | 1 (`DOWN`) | 9 | `140×7, 200, 220` (1400) | `HOLD_LAST` | Lõi nhựa vụn tắt, thân cổ thụ nứt rã thành gốc gỗ thanh tẩy mở đường tới rương thưởng |

### 5.3 Mẫu JSON Atlas Metadata (`atlas_boss_thornback_elder.json`)
```json
{
  "textures": [
    {
      "image": "atlas_boss_thornback_elder.png",
      "format": "RGBA8888",
      "size": { "w": 2048, "h": 2048 },
      "scale": 1,
      "frames": [
        {
          "filename": "boss_thornback_elder/idle/down_00",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 128, "h": 128 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
          "frame": { "x": 3, "y": 3, "w": 128, "h": 128 },
          "anchor": { "x": 0.5, "y": 0.890625 }
        },
        {
          "filename": "boss_thornback_elder/root_slam/down_04",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 128, "h": 128 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
          "frame": { "x": 399, "y": 399, "w": 128, "h": 128 },
          "anchor": { "x": 0.5, "y": 0.890625 }
        },
        {
          "filename": "boss_thornback_elder/core_p3_crimson/00",
          "rotated": false,
          "trimmed": false,
          "sourceSize": { "w": 32, "h": 32 },
          "spriteSourceSize": { "x": 0, "y": 0, "w": 32, "h": 32 },
          "frame": { "x": 663, "y": 1191, "w": 32, "h": 32 },
          "anchor": { "x": 0.5, "y": 0.5 }
        }
      ]
    }
  ],
  "meta": {
    "entityId": "boss_thornback_elder",
    "padding": 2,
    "extrude": 1,
    "allowHorizontalFlip": true,
    "coreOverlayAnchorsSupported": true
  }
}
```

---

## 6. Ước tính Ngân sách VRAM & Quy trình Tự động Kiểm chứng Atlas

> **LƯU Ý TRUNG THỰC KỸ THUẬT (Nguyên tắc VIII Hiến pháp)**: Các con số bộ nhớ GPU (VRAM) dưới đây là ước tính toán học lý thuyết (`width × height × 4 bytes` RGBA8888 chưa nén trong WebGL texture memory) và được gắn nhãn **`proposed / unverified`** cho đến khi đo thực tế bằng Chrome DevTools / Spector.js trong giai đoạn lập trình.

| Nhóm Atlas Nạp Đồng thời (Boss Raid 4 Người — Kịch bản Nặng nhất MVP) | Kích thước POT | Số lượng | VRAM Lý thuyết (`proposed/unverified`) |
| :--- | :---: | :---: | :---: |
| Core UI Panels + Icons (`32×32`, `24×24`) + Telegraphs | `1024×1024` | 3 | `12.0 MB` |
| Dungeon Tileset + Props (`dng_mossroot_hollow`) | `1024×1024` | 2 | `8.0 MB` |
| 4 Nhân vật Party (tối đa 4 atlas khác nhau) | `2048×1024` | 4 | `32.0 MB` |
| Boss `atlas_boss_thornback_elder` | `2048×2048` | 1 | `16.0 MB` |
| Combat VFX & Projectiles MVP | `1024×1024` | 2 | `8.0 MB` |
| **Tổng cộng Ước tính Boss Arena MVP** | — | **12 textures** | **`~76.0 MB`** *(dưới trần mục tiêu `128 MB`, `unverified`)* |

### Quy tắc Tự động Kiểm chứng Atlas (CI / Design Validation Gate)
Khi xây dựng pipeline đóng gói cục bộ trong `tools/`, script kiểm chứng atlas BẮT BUỘC tự động kiểm tra 6 luật:
1. `width` và `height` là lũy thừa của 2 (`256`, `512`, `1024`, `2048`) và `<= 2048`.
2. `meta.padding >= 2` và `meta.extrude >= 1`.
3. `rotated === false` cho toàn bộ frame.
4. Mọi `entityId` và `atlasKey` tồn tại chính xác trong `game-data/characters.json`, `monsters.json`, `animals.json` hoặc `bosses.json`.
5. Mọi `framePathPattern` khai báo trong sidecar `anim_<entityId>.json` đều khớp 100% với một `filename` thực tế trong tệp atlas `.json` (không có frame mồ côi hoặc thiếu hướng).
6. Tổng thời lượng frame wind-up của Boss/Monster khớp sai số `<= ±25 ms` với `telegraphMs` trong `game-data/bosses.json` & `monsters.json`.

---

## 7. Kiểm chứng 14 Tiêu chí Quality Gate (Sprite Sheet & Atlas Standard)

| # | Tiêu chí Quality Gate | Định nghĩa Cụ thể cho Sprite Sheet & Texture Atlas Standard |
| :---: | :--- | :--- |
| 1 | **Mục tiêu Gameplay** | Bảo đảm render mượt mà 60 FPS (`proposed/unverified`), không lem mép pixel khi di chuyển camera và đồng bộ hình ảnh chính xác cho mọi loại thực thể. |
| 2 | **User Stories** | (US-SPR-01) Họa sĩ pixel mở blueprint biết chính xác kích thước ô, đường chân `footY`, số frame và tên file cần vẽ cho từng hero, quái, động vật, boss. (US-SPR-02) Lập trình viên Phaser nạp 1 atlas duy nhất cho cả Boss `boss_thornback_elder` mà không tốn nhiều draw call. |
| 3 | **Functional Requirements** | Cung cấp blueprint tọa độ chi tiết + animation matrix + Phaser 3 JSON schema cho 4 mẫu tiêu biểu (`chr_kael_vanguard`, `mob_timber_wolf`, `anm_meadow_chicken`, `boss_thornback_elder`) và bộ thông số export POT/padding/extrude chuẩn. |
| 4 | **Business Rules** | Bắt buộc POT `<= 2048×2048`, `padding: 2 px`, `extrude: 1 px`, `allowRotation: false`, lossless PNG phục vụ cục bộ (không phụ thuộc dịch vụ bên thứ ba); tôn trọng Single Source of Truth `game-data/*.json` (bao gồm giải trình minh bạch cell `64×64` / core `48×48` của `mob_timber_wolf`). |
| 5 | **Input & Output** | Input: tệp `.aseprite` / frame `.png` rời trong `assets/source-aseprite/`. Output: bộ đôi `.png` + Phaser 3 `.json` tại `assets/atlases/` cùng `anim_<entityId>.json`. |
| 6 | **State Transitions** | Vòng đời đóng gói: `RAW_FRAMES_EXPORTED` → `PACKER_VALIDATED` → `ATLAS_EMITTED` → `CI_CROSSREF_VERIFIED` → `CLIENT_GPU_UPLOADED` → `UNLOADED_ON_REGION_EXIT`. |
| 7 | **Data Model (JSON)** | Tuân thủ chặt định dạng Phaser 3 Multi-Atlas JSON Hash kèm khối `meta` tùy chỉnh (`padding`, `extrude`, `entityId`, `sidecar`). |
| 8 | **Dependencies** | Phụ thuộc `game-data/characters.json`, `skills.json`, `monsters.json`, `animals.json`, `bosses.json`, `art-bible.md`, `animation-standard.md` và `frontend-architecture.md`. |
| 9 | **UI Interactions** | Khi chuyển vùng hoặc bước vào Dungeon, màn hình Loading Screen hiển thị tiến độ nạp atlas cục bộ (`BootScene` / `AssetPrefetcher`) và giải phóng atlas khu vực cũ tránh đầy RAM. |
| 10 | **Edge Cases** | Frame vượt dung lượng 1 trang `2048×2048` (tự tách multipack `_0.png`, `_1.png` trong cùng 1 JSON Phaser 3); hướng `LEFT` mirror có thể gây lệch `weapon_anchor` (khắc phục bằng công thức phản xạ `mirroredX = frameWidth - anchorX`). |
| 11 | **Failure Behavior** | Nếu quá trình đóng gói tràn quá `2048×2048` hoặc thiếu frame bắt buộc: script build trả mã lỗi non-zero chặn đóng gói phát hành; ở runtime nếu 1 frame bị lỗi tải thì hiển thị frame `idle/down_00` thay vì hình trắng hoặc crash WebGL. |
| 12 | **Security Requirements** | Tệp atlas JSON chỉ chứa siêu dữ liệu hiển thị hình học; server không bao giờ đọc atlas `.json` từ client làm nguồn thông số combat hay va chạm. |
| 13 | **Acceptance Criteria** | Cả 4 blueprint đều khớp 100% ID/kích thước/timing từ `game-data/*.json`; phép tính cột×hàng với `padding=2, extrude=1` vừa khít kích thước POT tương ứng; 0 lỗi texture bleeding khi thử nghiệm trên Phaser. |
| 14 | **Test Scenarios** | (TS-SPR-01) Chạy packer tự động với cấu hình `padding=2, extrude=1` kiểm chứng tọa độ `(3, 3)` và stride `(W+4, H+4)`. (TS-SPR-02) Di chuyển camera chéo tốc độ cao xác nhận 0 đường kẽ rách pixel trên tileset và sprite. (TS-SPR-03) Kiểm thử ghép `core_p1/p2/p3` lên `boss_thornback_elder` xuyên suốt 3 phase không lệch tâm. |
