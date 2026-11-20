# Contract: 2.5D Pixel Sprite Atlas (10–15 Frames/Character) & Modular VFX

Tài liệu này khóa hợp đồng dữ liệu hình ảnh giữa **Asset Pipeline (`scripts/mightyknight-pixel/*`)**, **Thư mục tĩnh (`database-mighty-knight-pixel/`)**, **Client Renderer (`client/src/mk/*`)**, và **Kiểm thử tự động (`server/test/mk-pixel-assets.test.cjs`)**.

---

## 1. Bất biến Cứng về Ngân sách Ảnh & Chất lượng Pixel

| Quy tắc | Giá trị bắt buộc | Cách kiểm định tự động |
|---|---|---|
| **Giới hạn số ảnh/nhân vật** | **`10 <= frameCount <= 15`** | Đọc `manifest.json` + chia `img.width / cellW` trên từng PNG nhân vật |
| **Gói gọn 1 nhân vật = 1 Master Strip** | Đúng `1` file PNG ngang cho mỗi Hero / Enemy / Boss | Kiểm tra `width === cellW * frameCount && height === cellH` |
| **Chuẩn Pixel Art không nhòe** | 8-bit RGBA (`colorType = 6`), **alpha nhị phân `0` hoặc `255`** cho sprite nhân vật | Quét từng pixel trong `mk-pixel-assets.test.cjs` |
| **Viền ngoài sắc nét** | Viền 1 px đậm (`#140c1c`) quanh hình khối, nền trong suốt sạch | Kiểm tra padding tối thiểu 1 px không cắt mất đầu/vũ khí |
| **Hợp lệ chỉ số Choreography** | Mọi `step.frame` trong `MK_CHOREO_TIMELINES` thỏa `0 <= frame < frameCount` | Duyệt toàn bộ timeline của 6 Hero + 8 Enemy + 4 Boss |
| **Rendering Zero-Blur** | `ctx.imageSmoothingEnabled = false`, `image-rendering: pixelated`, tọa độ vẽ nguyên `Math.round()` | Kiểm tra bằng code review + test render |

---

## 2. Bản đồ Chính xác 15 Frame cho Anh Hùng (Hero Master Atlas — `720 × 48` px)

Mỗi Anh Hùng (`knight`, `archer`, `rogue`, `barbarian`, `mage`, `lancer`) là **1 file duy nhất**:
`/database-mighty-knight-pixel/sprites/heroes/{heroId}.png` (`15` ô × `48×48` px, chân đặt đất `anchorX = 24, anchorY = 44`, hướng mặc định quay **PHẢI**).

```text
Index:  [ 0 ] [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ] [ 6 ] [ 7 ] [ 8 ] [ 9 ] [10 ] [11 ] [12 ] [13 ] [14 ]
Pose:   IDLE1 IDLE2 WALK1 WALK2 WALK3 WINDU STRK1 STRK2 STRK3 CAST  AIR   DASH  GUARD HIT   DOWN
        └─Thở──┘    └───Đi 4 nhịp───┘  └Cúi┘ └───3 đòn đánh───┘└Tụ─┘ └Nhảy┘└Lướt┘└Đỡ─┘ └Choáng┘└Ngã┘
```

| Frame | Mã Pose | Đặc tả hình khối Pixel (Silhouette-First) | Được tái sử dụng bởi các hoạt ảnh |
|---:|---|---|---|
| `0` | `IDLE_1` | Đứng sẵn sàng, trọng tâm cân, vũ khí cầm ngang tầm | `idle` (bước 1), hồi thế sau Combo/Skill |
| `1` | `IDLE_2` | Thở ra (-1px thân), áo choàng phất nhẹ, lóe sáng vũ khí | `idle` (bước 2), nhịp thở đứng chờ |
| `2` | `WALK_1` | Bước chân trái lên, thân nghiêng trước +1px | `walk` (`2 → 3 → 4 → 3`) |
| `3` | `WALK_2` | Pha chuyển tiếp hai chân sát trục, thân nâng +1px | `walk` (bước đệm) |
| `4` | `WALK_3` | Bước chân phải lên, tay vung ngược nhịp | `walk` |
| `5` | `WINDUP` | Hạ thấp gối, kéo vũ khí về sau tạo lực bật | Chuẩn bị cho Combo 1/3, Skill 1/2/3/4, nhảy bật |
| `6` | `STRIKE_1` | Chém ngang / bắn mũi đầu tiên, vươn vai trước | Combo Hit 1, Skill đánh ngang, Flurry (chẵn), Dash-Attack |
| `7` | `STRIKE_2` | Chém ngược hướng / đánh hất lên / kéo dây nhanh | Combo Hit 2, Flurry (`6↔7` xen kẽ), ném vũ khí, mưa tên |
| `8` | `STRIKE_3` | Bổ mạnh hai tay / phóng đòn cực đại đầy uy lực | Combo Hit 3 Finisher, đòn đập đất Skill 2/4, kết liễu Ultimate |
| `9` | `CAST_HOLD` | Giơ cao vũ khí/tay, áo choàng bay ngược, mắt phát sáng | Tụ lực Skill phép/Buff/Warcry, kênh năng lượng Ultimate |
| `10` | `AIR_SPIN` | Co gối bay trên không hoặc tư thế xoáy tròn | Nhảy đập (`z>0`), Lốc kiếm 360° (`10` + `flipX`), Nhào lộn lùi |
| `11` | `DASH_THRUST` | Nghiêng thân 35° lao ngang kiểu vệt tốc độ | Dash né đòn, Thương Long xung kích, Bóng Ma lướt chém, Thuấn Di |
| `12` | `GUARD_PARRY` | Giơ khiên / dựng chéo vũ khí trước ngực, tia lóe vàng | Guard (`E`), Perfect Parry, Long Lân Phản Chấn, Hộ Thuẫn Xung Kích |
| `13` | `HIT_STUN` | Ngả người ra sau, tay giật ngược khi trúng sát thương | Trúng đòn (`hit`) + chớp trắng 90 ms |
| `14` | `DOWN_DEAD` | Quỳ gục / nằm sấp trên đất (không cần xoay 90° làm nhòe pixel!) | Gục ngã chờ đồng đội hồi sinh Co-op / Thất bại |

**Tổng cộng: ĐÚNG 15 ảnh / Anh hùng** (`10 <= 15 <= 15` ✅).

---

## 3. Bản đồ Frame cho Quái Vật (11–12 Frame) & Đại Boss (15 Frame)

### 3.1 Quái Thường (11 Frame, `528 × 48` px) & Tinh Anh (12 Frame, `576 × 48` px)
Đường dẫn: `/database-mighty-knight-pixel/sprites/enemies/{enemyId}.png` (`anchorX = 24, anchorY = 44`).

| Frame | Mã Pose | Công dụng |
|---:|---|---|
| `0`, `1` | `IDLE_1`, `IDLE_2` | Đứng thở |
| `2`, `3`, `4` | `WALK_1`, `WALK_2`, `WALK_3` | Đi bộ 4 nhịp (`2→3→4→3`) |
| `5` | `WINDUP` | Giơ vũ khí cảnh báo (nhấp nháy mắt đỏ trước khi ra đòn) |
| `6`, `7` | `ATTACK_1`, `ATTACK_2` | Vung đánh chính & kéo đà |
| `8` | `HIT_STUN` | Giật lùi khi trúng đòn |
| `9`, `10` | `DEAD_1`, `DEAD_2` | Ngã xuống & tan biến |
| `11` *(chỉ Tinh Anh)* | `SPECIAL_CAST` | Hồi máu đồng minh / bắn cung băng / niệm bùa |

### 3.2 Đại Boss (15 Frame, `1200 × 80` px)
Đường dẫn: `/database-mighty-knight-pixel/sprites/bosses/{bossId}.png` (`anchorX = 40, anchorY = 74`).

| Frame | Mã Pose | Công dụng |
|---:|---|---|
| `0`, `1` | `IDLE_1`, `IDLE_2` | Đứng uy nghiêm |
| `2`, `3`, `4` | `WALK_1..3` | Bước đi rung đất |
| `5` | `TELEGRAPH_CHARGE` | Gồng cảnh báo đỏ trước đòn lớn (khớp vòng cảnh báo trên sàn!) |
| `6`, `7` | `ATTACK_1`, `ATTACK_2` | Đòn đánh chính liên hoàn |
| `8` | `SLAM_IMPACT` | Nện đất vỡ sàn |
| `9` | `SPECIAL_CAST` | Gọi thiên thạch / bão sét / triệu hồi quái |
| `10` | `DASH_CHARGE` | Húc xuyên chiến trường / phân thân lướt |
| `11` | `ENRAGE_ROAR` | Gầm chuyển Giai đoạn 2 (66% HP) & Giai đoạn 3 (33% HP) |
| `12` | `STAGGER_HIT` | Choáng phá giáp khi bị Perfect Parry hoặc kỹ năng choáng |
| `13`, `14` | `DEFEAT_1`, `DEFEAT_2` | Quỳ sụp & vỡ tan khi bị tiêu diệt |

---

## 4. Thư viện Pixel VFX Dùng Chung (`database-mighty-knight-pixel/vfx/`)

VFX tách hoàn toàn khỏi sprite nhân vật và hỗ trợ **nhuộm màu bảng màu pixel** (palette tinting cache theo LRU) để 1 bộ VFX sạch phục vụ đa dạng cho cả 30 kỹ năng:

| File VFX | Ô Pixel | Số Frame | Lớp mặc định | Dùng cho các kỹ năng |
|---|---|---:|---|---|
| `slash_crescent.png` | `64×48` | 4 | `front` | Combo 1–3, Kiếm Khí Xuyên Phá, Xích Hỏa |
| `slash_cross_x.png` | `64×64` | 5 | `front` | Liên Hoàn Song Đoản, Bóng Ma Ám Sát, Dạ Ảnh Trảm Không |
| `whirlwind_360.png` | `96×64` | 6 | `front` | Cuồng Phong Kiếm, Lốc Xoáy Lùi Bước |
| `holy_pillar.png` | `64×128` | 6 | `front` | Thánh Kiếm Trừng Phạt, Cự Kiếm Thánh Quang |
| `ground_fissure.png` | `96×48` | 5 | `ground` | Địa Chấn Cuồng Nộ, Thánh Kiếm đập đất, Boss Slam |
| `fire_meteor.png` | `48×64` | 6 | `front` | Thiên Thạch Rực Lửa, Nham Thần Hàng Thế, Boss Lava |
| `lightning_bolt.png` | `48×128` | 5 | `front` | Bão Sét Hỗn Nguyên, Bẫy Dây Leo Sét, Ấn Ký Lôi Thần |
| `frost_nova.png` | `96×64` | 5 | `ground` | Mưa Tên Băng Giá, Thuấn Di Phản Nổ, Thanh Long |
| `gravity_vortex.png` | `96×64` | 6 | `ground` | Hố Đen Hút Quái, Boss Abyss Lord |
| `dragon_spirit.png` | `96×48` | 6 | `front` | Thương Long Xuyên Giáp, Thanh Long Xuất Hải |
| `phoenix_flame.png` | `96×64` | 6 | `front` | Phượng Hoàng Tiễn (Ultimate Varrick) |
| `magic_rune_25d.png` | `80×40` | 4 | `ground` | Vòng ma pháp phối cảnh 2.5D dưới chân khi tụ Ultimate / Cast |
| `parry_ring.png` | `64×64` | 4 | `front` | Perfect Parry (vàng chói) & Khiên EVADE (xanh lục lam) |
| `aura_fury.png` | `48×56` | 4 | `behind` | Hú Chiến Cuồng Huyết, Hào Quang Dũng Sĩ, Đầy thanh Fury |
| `hit_spark.png` | `32×32` | 4 | `front` | Tia lửa trúng đòn (thường / chí mạng / nguyên tố) |
| `dust_puff.png` | `32×24` | 4 | `behind` | Khói bước chạy, đáp đất từ độ cao Z, lướt Dash |
| `projectiles_sheet.png` | `32×24` | 12 | `front` | Đạn pixel (tên, tên xuyên, tên băng, phi tiêu, rìu xoay, cầu phép, thương bay, đá lửa, bóng đêm) |
| `pickups_sheet.png` | `16×16` | 10 | `front` | Xu vàng xoay, ngọc EXP, bình máu đỏ, cầu Fury, rương Relic |

---

## 5. Quần xã Pixel 2.5D (4 Biomes × 5 Lớp Parallax)

Thư mục: `/database-mighty-knight-pixel/terrains/{grasslands,jungle,volcano,citadel}/`

| File Lớp | Kích thước gốc (px) | Tốc độ Parallax | Ghi chú |
|---|---:|---:|---|
| `bg_sky.png` | `640 × 168` | `0.18x` | Lặp ngang liền mạch, mây/trăng/sao pixel dithered |
| `bg_far.png` | `640 × 112` | `0.42x` | Dãy núi / tháp cổ / miệng núi lửa / pháo đài tinh tú |
| `bg_mid.png` | `640 × 96` | `0.72x` | Tán cây, tàn tích cột đá, đuốc cháy pixel |
| `ground_arena.png` | `1280 × 204` | `1.00x` | Mặt sàn chiến đấu 2.5D (`y = 156..360`), lát gạch/cỏ có chiều sâu |
| `fg_silhouette.png` | `640 × 44` | `1.22x` | Bụi cỏ tối / tia than bay sát mép đáy màn hình tạo chiều sâu 2.5D |

---

## 6. Cấu trúc `database-mighty-knight-pixel/manifest.json`

```json
{
  "version": 2,
  "style": "2.5d-pixel",
  "staticRoot": "/database-mighty-knight-pixel",
  "virtualResolution": { "w": 640, "h": 360 },
  "frameBudget": { "min": 10, "max": 15 },
  "characters": {
    "heroes": {
      "knight": {
        "path": "/database-mighty-knight-pixel/sprites/heroes/knight.png",
        "portrait": "/database-mighty-knight-pixel/portraits/knight.png",
        "frames": 15,
        "cellW": 48,
        "cellH": 48,
        "anchorX": 24,
        "anchorY": 44,
        "accentColor": "#3b82f6"
      }
    },
    "enemies": { "...": { "frames": 11, "cellW": 48, "cellH": 48 } },
    "bosses": { "...": { "frames": 15, "cellW": 80, "cellH": 80 } }
  },
  "vfx": { "...": { "path": "...", "frames": 6, "cellW": 64, "cellH": 64 } },
  "biomes": { "grasslands": { "...": "..." } },
  "ui": { "skillIcons": { "...": "..." }, "relicIcons": { "...": "..." } },
  "audio": { "bgm": { "...": "..." }, "sfx": { "...": "..." } }
}
```
