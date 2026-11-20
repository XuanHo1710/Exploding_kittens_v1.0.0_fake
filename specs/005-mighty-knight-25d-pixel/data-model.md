# Phase 1 Data Model: Mighty Knight 2.5D Pixel

Toàn bộ kiểu dữ liệu và hằng số dùng chung đặt tại `shared/src/mk/` (export qua `shared/src/mightyknight.ts` và `shared/src/index.ts`). Các trường nội bộ mô phỏng chỉ có trên server được ghi chú `(server)`.

---

## 1. Hằng số Toàn cục & Ràng buộc Cứng (`shared/src/mk/types.ts`)

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `MK_MODE_ID` | `'mighty_knight'` | Định danh chế độ trong `GameMode` |
| `MK_STATIC_ROOT` | `'/database-mighty-knight-pixel'` | Gốc tài nguyên tĩnh phục vụ ảnh pixel & âm thanh |
| `MK_TICK_HZ` | `30` | Tần số mô phỏng quyết định trên server (`33.33 ms/tick`) |
| `MK_VIEW_W`, `MK_VIEW_H` | `640`, `360` | Độ phân giải logic 16:9 pixel ảo của camera |
| `MK_ARENA_W`, `MK_ARENA_H` | `1280`, `360` | Kích thước chiến trường 2.5D belt-scroller (gấp 2× camera) |
| `MK_LANE_TOP`, `MK_LANE_BOTTOM` | `156`, `326` | Giới hạn trục độ sâu `Y` đi lại được (170 virtual px) |
| `MK_PLAYABLE_MIN_X`, `MK_PLAYABLE_MAX_X` | `32`, `1248` | Giới hạn trục ngang `X` |
| `MK_MIN_CHAR_FRAMES` | `10` | **Bất biến cứng**: tối thiểu 10 ảnh/nhân vật |
| `MK_MAX_CHAR_FRAMES` | `15` | **Bất biến cứng**: tối đa 15 ảnh/nhân vật |
| `MK_HERO_CELL_PX` | `48` | Ô pixel gốc cho mỗi khung hình Hero (`48×48`, chân tại `(24, 44)`) |
| `MK_ENEMY_CELL_PX` | `48` | Ô pixel gốc cho quái thường/tinh anh (`48×48`, chân tại `(24, 44)`) |
| `MK_BOSS_CELL_PX` | `80` | Ô pixel gốc cho Đại Boss (`80×80`, chân tại `(40, 74)`) |
| `MK_MAX_PLAYERS` | `6` | Số người chơi tối đa trong 1 phòng Co-op |
| `MK_MAX_COM_BOTS` | `3` | Số đồng đội AI COM tối đa (1P mặc định `comBots = 2`) |
| `MK_MAX_PARTY_SIZE` | `6` | Tổng kích thước đội hình (Người + COM) |
| `MK_FURY_MAX` | `100` | Ngưỡng đầy thanh Nộ để kích hoạt Ultimate (`R`) |
| `MK_PARRY_WINDOW_MS` | `180` | Cửa sổ vàng Perfect Parry đầu khi nhấn Guard (`E`) |
| `MK_GUARD_DURATION_MS` | `450` | Tổng thời lượng tư thế đỡ đòn |
| `MK_COMBO_RESET_MS` | `900` | Thời gian chờ tối đa để nối Combo 1 → 2 → 3 |
| `MK_REVIVE_RADIUS_PX` | `44` | Bán kính đứng hồi sinh đồng đội gục ngã (virtual px) |
| `MK_REVIVE_DURATION_MS` | `2500` | Thời gian hồi sinh đồng đội Co-op |

---

## 2. Mô hình Master Atlas 10–15 Frame & Biên đạo Kỹ năng (`shared/src/mk/choreo.ts`)

### 2.1 `MkPixelAtlasSpec` (Định nghĩa 1 file ảnh duy nhất cho mỗi nhân vật)

| Trường | Kiểu | Luật kiểm định |
|---|---|---|
| `entityId` | `MkHeroId \| MkEnemyId \| MkBossId` | Duy nhất trong toàn game |
| `category` | `'hero' \| 'enemy' \| 'boss'` | Phân loại đường dẫn atlas |
| `atlasPath` | `string` | `${MK_STATIC_ROOT}/sprites/${category}s/${entityId}.png` |
| `cellW`, `cellH` | `48 \| 80` | Bội số nguyên; ảnh PNG phải có kích thước `cellW * frameCount × cellH` |
| `anchorX`, `anchorY` | `number` | Điểm đặt chân chạm đất (`24, 44` cho `48×48`; `40, 74` cho `80×80`) |
| `frameCount` | `number` | **Bắt buộc `10 <= frameCount <= 15`** (Hero=15, Boss=15, Regular=11, Elite=12) |
| `paletteAccent` | `string` | Mã màu hex chủ đạo dùng tạo bóng dư ảnh (afterimage) và rim-glow |
| `portraitRect` | `{ x, y, w, h }` | Vùng cắt chân dung `32×32` từ `portraits/${entityId}.png` |

### 2.2 `MkChoreoStep` & `MkChoreoTimeline` (Kịch bản hoạt ảnh ghép từ 15 tư thế gốc)

```ts
export type MkVfxLayer = 'behind' | 'front' | 'ground' | 'screen';

export interface MkVfxSpawnCue {
  vfxId: MkVfxId;            // Tham chiếu thư viện Pixel VFX dùng chung
  layer: MkVfxLayer;         // Lớp vẽ trước/sau nhân vật hoặc mặt đất 2.5D
  offsetX: number;           // Lệch X theo hướng nhìn (virtual px nguyên)
  offsetY: number;           // Lệch Y mặt đất (virtual px nguyên)
  offsetZ: number;           // Độ cao Z (virtual px nguyên)
  tint?: string;             // Mã màu nhuộm bảng màu pixel
  scale?: 1 | 1.5 | 2;       // Phóng đại theo bậc pixel sạch
  minSkillLevel?: 1 | 3 | 5; // Tiến hóa VFX: chỉ bật khi skill >= Lv3 hoặc Lv5!
}

export interface MkChoreoStep {
  frame: number;             // Chỉ số 0..(frameCount-1) trong Master Atlas
  durationMs: number;        // Thời lượng giữ frame (30..450 ms)
  dx?: number;               // Bước dịch chuyển X (root motion nguyên px)
  dz?: number;               // Độ cao nhảy Z tại bước này (0..72 virtual px)
  flipX?: boolean;           // Lật ngang tạm thời (tạo xoay 360° cực mượt từ 2 pose!)
  afterimage?: boolean;      // Đẻ bóng mờ pixel màu nguyên tố phía sau
  flashColor?: string;       // Nhuộm chớp trắng / vàng siêu giáp / tím Ultimate
  hitstopMs?: number;        // Đóng băng vi mô 35..85ms ở client khi đòn trúng đích
  hitboxTag?: string;        // Mốc server kích hoạt sát thương (vd: 'hit1', 'slam', 'wave')
  vfx?: MkVfxSpawnCue[];     // 0..N hiệu ứng Pixel VFX phát tại đúng bước này
  sfx?: string;              // Âm thanh retro phát tại đúng bước này
}

export interface MkChoreoTimeline {
  actionId: MkActionId;      // vd: 'combo1', 'combo2', 'combo3', 'skill1'..'skill4', 'ultimate', 'dash', 'guard'
  loop: boolean;
  cancelAfterMs?: number;    // Cho phép hủy animation (Animation Cancel) sang Dash/Skill/Combo kế tiếp
  superArmor?: boolean;      // Không bị gián đoạn khi trúng đòn thường
  invulnWindow?: [number, number]; // Khoảng [startMs, endMs] bất tử
  steps: MkChoreoStep[];
}
```

**Bất biến kiểm định**:
- Mọi `step.frame` phải thỏa `0 <= step.frame < atlas.frameCount` (không bao giờ trỏ ra ngoài giới hạn 10–15 ảnh).
- Tổng `durationMs` của `steps` xác định chính xác độ dài động tác trên cả server lẫn client (`totalTicks = Math.ceil(totalMs / 33.33)`).

---

## 3. Danh mục 6 Anh Hùng & 30 Kỹ Năng Chủ Động / Ultimate (`shared/src/mk/heroes.ts`)

Mỗi anh hùng dùng đúng **15 frame gốc (`0..14`)** nhưng có **3 đòn Combo + 4 Active Skill + 1 Ultimate + Dash + Guard/Parry + 2 Nội tại**:

### Bảng chỉ số gốc 6 Anh Hùng

| Hero ID | Tên / Danh hiệu | Hệ Nguyên Tố | HP | ATK | DEF | SPD (px/s) | Tầm đánh | Crit | Evade |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| `knight` | **Aragon** · Hiệp Sĩ Lam | Thánh Quang / Thép | 280 | 28 | 15 | 142 | 56 | 12% | 14% |
| `archer` | **Varrick** · Cung Thủ Rừng Xanh | Phong / Băng | 200 | 26 | 8 | 158 | 310 | 22% | 16% |
| `rogue` | **Ramza** · Sát Thủ Song Kiếm | Bóng Đêm / Lôi | 215 | 25 | 9 | 176 | 48 | 28% | 24% |
| `barbarian` | **Conan** · Cuồng Chiến Rìu Đỏ | Hỏa / Địa Chấn | 330 | 35 | 12 | 132 | 66 | 16% | 10% |
| `mage` | **Balthazar** · Pháp Sư Tử Tinh | Hư Không / Thiên Thạch | 190 | 31 | 7 | 142 | 270 | 18% | 15% |
| `lancer` | **Draco** · Thương Kỵ Rồng | Băng Long / Xuyên Giáp | 260 | 30 | 13 | 152 | 82 | 18% | 15% |

*(Ghi chú: Tốc độ & tầm đánh tính theo đơn vị virtual pixel `640×360` để chuẩn tỷ lệ 2.5D Pixel.)*

### Bảng 30 Kỹ Năng Chủ Động + Ultimate & Chuỗi Pose 15-Frame

| Hero | Slot | Tên Kỹ Năng | CD / Chi phí | Chuỗi Pose (`0..14`) | Hiệu ứng Pixel VFX & Tiến hóa Lv3 / Lv5 |
|---|---|---|---|---|---|
| **Aragon** (Knight) | `S1` | **Cuồng Phong Kiếm** | 5.0s · Mở sẵn | `5→10→6→7(flip)→6→7(flip)→0` | Vòng lốc kiếm 360° + bất tử 0.6s · *Lv3: +bán kính · Lv5: kèm tia sét xanh* |
| | `S2` | **Thánh Kiếm Trừng Phạt** | 8.0s · 90G | `5→10(z+52)→8(z=0)→8` | Nhảy bổ đập đất + Cột ánh sáng + Choáng 1.8s · *Lv3: +vết nứt đất · Lv5: nổ 2 đợt* |
| | `S3` | **Hộ Thuẫn Xung Kích** | 8.5s · 140G | `12→11→11→6→12` | Húc khiên đẩy hàng quái + Tạo giáp đội 15% HP · *Lv3: +vệt vàng · Lv5: phản 25% dmg* |
| | `S4` | **Kiếm Khí Xuyên Phá** | 10.0s · 200G | `5→8→6→0` | Phóng 3 vệt kiếm khí lưỡi liềm xuyên hàng · *Lv3: 4 kiếm khí · Lv5: 5 kiếm khí cháy sáng* |
| | `ULT` | **Thánh Quang Phán Quyết** | 100 Fury | `9→9→10(z+36)→8(z=0)` | Vòng rune dưới chân + Triệu hồi Cự Kiếm Thánh giáng từ trời + Hồi 25% HP cả đội |
| **Varrick** (Archer) | `S1` | **Mũi Tên Xuyên Thấu** | 4.8s · Mở sẵn | `5→9→8→0` | Tụ lực bắn tên vàng xuyên toàn màn hình (+45% crit) · *Lv3: +sóng gió · Lv5: 2 tia song song* |
| | `S2` | **Mưa Tên Băng Giá** | 7.8s · 90G | `5→9→7→9→0` | Bắn lên trời dội 18 mũi tên băng chậm 50% · *Lv3: đóng băng 1s · Lv5: thêm bão tuyết* |
| | `S3` | **Lốc Xoáy Lùi Bước** | 8.0s · 140G | `10(z+36,dx-)→6→11→0` | Nhào lộn lùi né bắn quạt 5 tên + để lại lốc xoáy · *Lv3: 7 tên · Lv5: lốc hút nhẹ* |
| | `S4` | **Bẫy Dây Leo Sét** | 10.0s · 200G | `5→7→0` | Gài cọc cổ thụ trói chân & giật sét 4 nhịp · *Lv3: 5 nhịp · Lv5: nổ lan cuối* |
| | `ULT` | **Phượng Hoàng Tiễn** | 100 Fury | `10(z+44)→9→8→0` | Bắn Phượng Hoàng Hỏa-Phong khổng lồ quét sạch đường thẳng, thiêu đốt + đẩy lùi |
| **Ramza** (Rogue) | `S1` | **Liên Hoàn Song Đoản** | 4.4s · Mở sẵn | `5→6→7→6→7→8→0` | 6 nhát chém tốc độ ánh sáng (+35% crit) · *Lv3: 8 nhát · Lv5: kèm tia sét tím* |
| | `S2` | **Bóng Ma Ám Sát** | 7.5s · 90G | `11→11(flip)→6→7→8` | Lướt zíc-zắc 4 bóng ma xuyên bầy quái, vô hình · *Lv3: 5 điểm nhảy · Lv5: nổ dấu ấn* |
| | `S3` | **Phi Tiêu Độc Tốc** | 7.5s · 140G | `10(z+24)→6→7→0` | Xoay người phóng 5 phi tiêu nảy giữa quái + Độc 4s · *Lv3: 7 phi tiêu · Lv5: nổ độc* |
| | `S4` | **Ảnh Phân Thân** | 9.5s · 200G | `12→11(dx-)→0` | Để lại phân thân khói khiêu khích 1.5s rồi nổ + Đòn sau 100% Crit · *Lv5: 2 phân thân* |
| | `ULT` | **Dạ Ảnh Trảm Không** | 100 Fury | `9→11→6→7→6→8` | Màn tối 0.4s, đan 8 đường kiếm tím cắt toàn bộ kẻ địch trong vùng lớn cùng lúc |
| **Conan** (Barbarian) | `S1` | **Ném Rìu Hủy Diệt** | 5.2s · Mở sẵn | `5→6→7→0` | Phóng rìu lửa boomerang xoay xuyên đi & quay về · *Lv3: rìu to hơn · Lv5: 2 rìu* |
| | `S2` | **Địa Chấn Cuồng Nộ** | 8.5s · 90G | `5→10(z+48)→8(z=0)→8` | Nhảy đập rìu tạo 3 vòng nứt dung nham + Choáng 2s · *Lv3: +thiêu đốt · Lv5: hất tung Z* |
| | `S3` | **Hú Chiến Cuồng Huyết** | 10.0s · 140G | `9→9→12→0` | Gầm lửa tăng +35% ATK, 12% hút máu & Siêu Giáp 6s · *Lv3: buff đồng đội · Lv5: +tốc đánh* |
| | `S4` | **Xích Hỏa Kéo Địch** | 9.5s · 200G | `6→5→8→0` | Quăng xích lửa kéo quái từ xa vào trước mặt rồi bổ sập · *Lv3: kéo rộng · Lv5: nổ lửa* |
| | `ULT` | **Nham Thần Hàng Thế** | 100 Fury | `9→8→10(z+56)→8(z=0)` | Đập đất 2 nhịp triệu hồi 5 cột dung nham phun trào khắp sàn hất tung toàn bộ quái |
| **Balthazar** (Mage) | `S1` | **Thiên Thạch Rực Lửa** | 5.5s · Mở sẵn | `9→9→8→0` | Gọi 3 thiên thạch pixel có vòng cảnh báo + Thiêu đốt 3s · *Lv3: 4 viên · Lv5: 5 viên + hồ lửa* |
| | `S2` | **Bão Sét Hỗn Nguyên** | 8.2s · 90G | `5→9→6→7→0` | Sét dây chuyền nhảy tới 8 quái + Choáng 1.4s · *Lv3: 10 mục tiêu · Lv5: giáng thêm cột sét* |
| | `S3` | **Hố Đen Hút Quái** | 9.5s · 140G | `9→7→0` | Tạo hố đen tím hút tụ toàn bộ quái về tâm 2.5s để cả đội combo · *Lv3: làm chậm · Lv5: nổ cuối* |
| | `S4` | **Thuấn Di Phản Nổ** | 8.5s · 200G | `11→10→9→0` | Dịch chuyển tức thời để lại vòng nổ Băng-Bí Thuật · *Lv3: hồi lá chắn · Lv5: nổ ở cả 2 đầu* |
| | `ULT` | **Cửu Tinh Hủy Diệt** | 100 Fury | `10(z+30)→9→9→8` | Bay lơ lửng vẽ Ngũ Mang Tinh trên sàn, giáng cột tia Tinh Tú quét ngang chiến trường |
| **Draco** (Lancer) | `S1` | **Thương Long Xuyên Giáp** | 4.8s · Mở sẵn | `5→11→11→6→0` | Lao mũi thương Đầu Rồng xanh xuyên tuyến bỏ qua 50% giáp · *Lv3: xa hơn · Lv5: để lại vệt băng* |
| | `S2` | **Tam Thương Bộc Phá** | 8.0s · 90G | `10(z+40)→7→8→0` | Nhảy ném 3 thương linh hồn cắm xuống đất nổ rồng liên hoàn · *Lv3: 4 thương · Lv5: 5 thương* |
| | `S3` | **Long Hồn Liên Kích** | 8.0s · 140G | `5→6→7→6→7→6→8` | Đâm 7 mũi tốc độ siêu thanh phá 30% giáp Boss 5s · *Lv3: 9 mũi · Lv5: kết liễu sóng rồng* |
| | `S4` | **Long Lân Phản Chấn** | 9.5s · 200G | `12→12→8` | Thủ thế 0.8s; nếu bị đánh tự động bật Long Quyền hất tung & bất tử · *Lv5: giảm CD 40% khi phản* |
| | `ULT` | **Thanh Long Xuất Hải** | 100 Fury | `9→10(z+32)→11→8` | Triệu hồi Thanh Long Pixel nhiều đốt thân uốn lượn quét từ trái sang phải đóng băng toàn bộ |

*(Mỗi Hero còn có 2 Nội tại riêng Lv1–5 thừa hưởng và tinh chỉnh từ hệ thống Mighty Knight: Aegis Guard, Valor Aura, Super Vision, Frost Tip, Pickpocket, Twin Swordplay, Brutality, Twist Blade, Mana Surge, Arcane Barrier, Dragon Scale, Pierce Mastery.)*

---

## 4. Quái Vật (8 loại) & Đại Boss 3 Giai Đoạn (4 loại) (`shared/src/mk/enemies.ts`)

**Mọi quái & Boss đều tuân thủ cứng `10 <= frameCount <= 15`**:

| ID | Tên Tiếng Việt | Loại | Frames | Cell | HP gốc | Vai trò & Hành vi nổi bật |
|---|---|---|---:|---:|---:|---|
| `skull_imp` | Tiểu Yêu Mặt Nạ Tím | Thường | **11** | 48×48 | 65 | Chạy nhanh, đánh cận chiến theo bầy |
| `goblin_raider` | Goblin Đột Kích | Thường | **11** | 48×48 | 105 | Đột kích lao chém có nhịp windup |
| `shield_orc` | Orc Khiên Sắt | Thường | **11** | 48×48 | 165 | Đỡ phía trước (giảm 40% dmg mặt trước, cần đánh sau lưng/xuyên giáp) |
| `bone_brute` | Khổng Lồ Xương Đá | Thường | **11** | 48×48 | 240 | Đập chùy chậm, sát thương cao, kháng đẩy lùi nhẹ |
| `tribal_shaman` | Pháp Sư Đầu Lâu Đỏ | Tinh anh | **12** | 48×48 | 95 | Bắn cầu nguyền từ xa & hồi máu cho quái đồng minh |
| `frost_archer` | Cung Thủ Xương Băng | Tinh anh | **12** | 48×48 | 90 | Bắn tên băng làm chậm từ rìa màn hình |
| `bomber_imp` | Quỷ Ôm Bom Lửa | Thường | **11** | 48×48 | 75 | Lao nhanh phát sáng nhấp nháy rồi phát nổ (dùng Parry phản nổ!) |
| `nether_ghost` | Hồn Ma Kho Báu | Đặc biệt | **11** | 48×48 | 85 | Chạy trốn rớt mưa Vàng + bình Hồi Máu + cầu Nộ khi bị hạ |
| `boss_elder_shaman` | **Đại Pháp Sư Đầu Lâu** | Boss W5 | **15** | 80×80 | 1500 | 3 Phase: Bắn cầu độc → Triệu hồi Totem & Imp → Bão Sét Đỏ có vòng telegraph |
| `boss_war_chieftain` | **Tù Trưởng Búa Chiến** | Boss W10 | **15** | 80×80 | 2200 | 3 Phase: Chém búa → Húc lao xuyên lane → Nhảy Địa Chấn 3 vòng lửa |
| `boss_lava_golem` | **Cự Thạch Dung Nham** | Boss W15 | **15** | 80×80 | 3000 | 3 Phase: Ném đá nóng → Mưa thiên thạch → Phun tia dung nham quét ngang |
| `boss_abyss_lord` | **Chúa Tể Hư Không** | Boss W20 | **15** | 80×80 | 4000 | 3 Phase: Kiếm bóng đêm → Phân thân chém chéo → Hố đen + Mưa sao băng tím |

---

## 5. Hệ thống Thánh Vật Roguelite — Relic Draft (`shared/src/mk/relics.ts`)

Sau mỗi Wave Boss (5, 10, 15… hoặc mỗi Boss trong Boss Rush), mỗi người chơi được chọn **1 trong 3 Thánh Vật** (tối đa 6 slot, trùng loại cộng dồn cấp):

| Relic ID | Tên | Hiệu ứng |
|---|---|---|
| `vampiric_fang` | Nanh Ma Cà Rồng | Hút 6% sát thương kỹ năng thành HP |
| `chrono_crystal` | Tinh Thể Thời Gian | Giảm 14% thời gian hồi mọi kỹ năng |
| `phantom_cloak` | Áo Choàng Dư Ảnh | Skill 1–4 tạo thêm 1 bóng dư ảnh gây 25% sát thương trễ 0.2s |
| `thunder_sigil` | Ấn Ký Lôi Thần | Đòn Combo thứ 3 giáng tia sét lan 2 quái gần nhất |
| `parry_emblem` | Huy Hiệu Phản Đòn | Mở rộng cửa sổ Perfect Parry +70 ms và nhân 2× sát thương phản |
| `fury_core` | Lõi Cuồng Nộ | Tăng +35% tốc độ nạp thanh Fury cho Ultimate |
| `giant_slayer` | Diệt Cự Nhân | +25% sát thương lên Mini-Boss và Đại Boss |
| `frost_brand` | Khắc Ấn Băng Giá | Đòn chí mạng làm chậm kẻ địch 35% trong 2 giây |
| `midas_coin` | Đồng Xu Midas | +30% Vàng nhặt được & mỗi 500 Vàng cộng +5% ATK |
| `phoenix_feather` | Lông Phượng Hoàng | Tự hồi sinh 1 lần với 60% HP + sóng đẩy lùi khi gục ngã |
| `aegis_rune` | Cổ Ngữ Hộ Mệnh | Đầu mỗi Wave tạo lớp giáp ảo bằng 20% Max HP |
| `combo_master` | Bậc Thầy Liên Kích | Mỗi 15 chuỗi Combo tăng +4% sát thương (tối đa +40%) |

---

## 6. Thực thể Mô phỏng Thời gian thực (`server/src/game/mk/`)

### 6.1 `MkFighterSim` (server) & `MkFighterView` (gửi client trong `mk:frame`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id`, `ownerId?`, `badge`, `name` | `string` | Định danh slot, chủ điều khiển (người hoặc `undefined` nếu COM), nhãn `P1..P6`/`COM` |
| `heroId` | `MkHeroId` | 1 trong 6 anh hùng |
| `x`, `y`, `z`, `vx`, `vy`, `vz` | `number` | Vị trí & vận tốc 2.5D trong `1280×360` |
| `dir` | `1 \| -1` | Hướng nhìn |
| `actionId` | `MkActionId` | Hành động đang chạy: `idle`, `walk`, `combo1..3`, `dash_atk`, `skill1..4`, `ultimate`, `dash`, `guard`, `parry_ok`, `hit`, `dead` |
| `actionTick` | `number` | Số tick từ lúc bắt đầu `actionId` (client tra trực tiếp vào `MkChoreoTimeline`!) |
| `comboStep`, `comboWindowMs` | `number` | Nhịp combo `0..3` và thời gian chờ nối đòn kế tiếp |
| `hp`, `maxHp`, `shieldHp` | `number` | Máu hiện tại, tối đa và lớp giáp ảo |
| `atk`, `def`, `spd` | `number` | Chỉ số đã cộng dồn nâng cấp + nội tại + Relic + buff đội |
| `fury` | `number` | `0..100` thanh Nộ kích hoạt Ultimate |
| `level`, `exp`, `expToNext`, `gold`, `sp` | `number` | Tiến trình cấp độ, kinh nghiệm, vàng và điểm kỹ năng |
| `cds` | `{ dash, guard, s1, s2, s3, s4 }` | Thời gian hồi chiêu còn lại (ms) + `maxCds` |
| `timers` | `{ invulnMs, guardMs, parryWindowMs, superArmorMs, furyBuffMs, evadeVisMs }` | Bộ đếm trạng thái phòng thủ/siêu giáp |
| `upgrades` | `{ atk, hp, def, spd, s1, s2, s3, s4, p1, p2 }` | Cấp nâng cấp (`s1` mở sẵn `1`, `s2..s4` bắt đầu `0` khóa hoặc `1` trong Boss Rush) |
| `relics` | `Array<{ id: MkRelicId; stacks: number }>` | Thánh vật đã chọn |
| `pendingRelicChoices?` | `MkRelicId[]` | 3 lựa chọn Thánh vật đang chờ người chơi chọn sau Boss |
| `downed`, `reviveProgress` | `boolean`, `number` | Trạng thái gục ngã & tiến độ hồi sinh `0..1` |

### 6.2 `MkZoneSim` (Vùng kỹ năng tồn tại theo thời gian: Hố đen, Mưa tên băng, Bẫy sét, Hồ dung nham)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | `number` | ID tăng dần |
| `kind` | `'arrow_rain' \| 'storm_snare' \| 'gravity_well' \| 'lava_pool' \| 'decoy_clone' \| 'boss_hazard'` | Loại vùng hiệu ứng |
| `ownerId` | `string` | Người tạo (để cộng điểm sát thương/hạ gục) |
| `x`, `y`, `radius` | `number` | Tâm và bán kính vùng 2.5D |
| `remainingMs`, `tickEveryMs` | `number` | Thời lượng tồn tại & nhịp gây hiệu ứng |
| `pullStrength?` | `number` | Lực hút vào tâm (Hố đen Balthazar) |

### 6.3 Vòng đời trận đấu `MkWorld` (State Machine)

```text
LOBBY (chọn Hero, độ khó, Endless/Boss Rush, số COM)
  │  [room:start]
  ▼
WAVE_INTRO (1.8s: hiển thị biển hiệu Wave & Biome)
  │
  ▼
COMBAT (30 Hz: sinh quái theo nhịp, chiến đấu 3-hit combo + 4 skill + Ult + Parry)
  ├──► (Mọi người chơi & COM đều gục ngã) ──────────────────────────► ENDED (Tổng kết, thưởng xu)
  ├──► (Sạch quái wave thường) ──► WAVE_CLEAR (1.5s, hồi 15% HP) ──► WAVE_INTRO (Wave + 1)
  └──► (Hạ Đại Boss wave 5, 10…) ──► RELIC_DRAFT (12s chọn 1/3 Thánh Vật; auto-pick nếu hết giờ)
                                            │
                                            ├──► (Endless: đổi Biome tiếp theo) ──► WAVE_INTRO
                                            └──► (Boss Rush xong Boss 4) ────────► VICTORY → ENDED
```

### 6.4 Quy tắc Kiểm định & Chống Gian Lận (Server Invariants)

1. **Giới hạn tốc độ lệnh**: Tối đa 24 lệnh/giây/người chơi (token bucket riêng cho `move` và hành động chiến đấu); vi phạm bỏ qua mượt mà hoặc trả lỗi có kiểm soát.
2. **Xác thực kỹ năng**: Không cho dùng `skill1..4` khi cấp `<= 0` (chưa mở khóa) hoặc `cd > 0`; không cho dùng `ultimate` khi `fury < 100`.
3. **Xác thực nâng cấp & Relic**: Chỉ trừ Vàng/SP và tăng cấp nếu `gold >= cost` và `level < maxLevel`; `pick_relic` chỉ nhận `relicId` nằm đúng trong `pendingRelicChoices` của chính người chơi đó.
4. **Hủy động tác hợp lệ (Cancel Guard)**: Chỉ cho phép Animation Cancel từ đòn combo sang Dash/Guard/Skill sau mốc `cancelAfterMs` của timeline.
5. **Tách biệt bản quyền & dữ liệu**: Không sửa `server/data/db.json` khi test; kết quả trả thưởng/hoàn cược đi qua cơ chế chuẩn của `Game` (`server/src/game/game.ts`).
