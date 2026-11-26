# Spec 007 — Bắn Súng Co-op: **ĐÊM ZOMBIE** (Night Zombie Co-op Refactor)

> Trạng thái: **v1 đã triển khai** (lighting, chống wallhack, art anh hùng + zombie, Redis) · các mục ghi *[Thiết kế]* là kế hoạch cho phase tiếp theo.
> Kế thừa: `specs/004-ban-sung-coop/*` (d01–d50). Chuẩn art: `.agents/skills/expedition-sprite-generator`, `AGENTS.md §5–§8`.
> Ngôn ngữ: giải thích tiếng Việt, định danh code/asset tiếng Anh.

---

## 0. Tóm tắt thay đổi so với bản cũ

| Hạng mục | Trước | Sau (Đêm Zombie) |
|---|---|---|
| Ánh sáng | Map sáng toàn bộ | Đêm tối 94%, **đèn pin xoay theo chuột**, quầng sáng quanh người, ánh lửa đầu nòng/vụ nổ chiếu sáng tạm thời, tường đổ bóng (raycast) |
| Hiển thị quái | Thấy mọi quái trong viewport | **Quái trong bóng tối không được server gửi xuống** → không thể hack nhìn xuyên; trúng đạn thì lộ diện 1 nhịp |
| Quái | 29 quái fantasy/cyber (bọ, xương rồng, drone…) | 29 **zombie** thuộc 7 dạng cơ thể, mắt phát sáng theo nguyên tố |
| Anh hùng | Chibi đầu to 48×48 | **Tỷ lệ cơ thể thật** (không chibi), 6 dải nghiêng + **atlas 6×8 4 hướng** đúng chuẩn skill sprite-generator |
| Redis | Không dùng cho Bắn Súng | Session routing, checkpoint phòng, bảng xếp hạng ZSET, thống kê — **không nằm trên tick 30 Hz** |
| Lobby | — | Chủ phòng chọn **🌙 Đêm Zombie / ☀️ Ban ngày** |

---

## 1. Tầm nhìn & cảm xúc mục tiêu

**Pitch:** 1–10 người sống sót giữa đêm, mỗi người chỉ có một chiếc đèn pin gắn súng. Bóng tối là kẻ thù thứ hai: zombie có thể ở *ngay ngoài* vùng sáng. Đội phải **chia hướng soi** để bao quát 360°, giữ đội hình, cứu nhau khi bị gục.

Trụ cột trải nghiệm:
1. **Căng thẳng do thiếu thông tin** — chỉ thấy những gì mình soi; tiếng gầm/bước chân (âm thanh không gian sẵn có ở `sound.ts`) báo hướng nguy hiểm.
2. **Phối hợp co-op có ý nghĩa** — đèn của đồng đội cũng soi cho mình; người bị gục chỉ còn đèn yếu (45%) → đồng đội phải quay lại.
3. **Phản hồi bắn "đã tay"** — ánh chớp đầu nòng chiếu sáng xung quanh, vụ nổ thắp sáng cả khu, zombie trúng đạn loé lên.
4. **Công bằng** — server quyết định ai được thấy gì (anti-wallhack), client chỉ hiển thị.

---

## 2. Gameplay loop

```
Vào trận (đêm) → Soi & dọn zombie rải rác → nhặt XP/xu/đạn → Gacha nâng cấp (giữ nguyên hệ thống cũ)
   → Đợt tràn (horde) từ cổng → Siege/Boss → Tiến hoá súng Mk.II–IV → vòng mới khó hơn
```

- **5 phút đầu:** học soi đèn, bắn zombie đi lẻ, nhặt rương. Quái rải rác đứng yên/lang thang trong bóng tối (đi theo `flocking.ts` hiện có).
- **15–30 phút:** horde dồn dập, Tank/Bloater xuất hiện, boss đầu tiên.
- **Dài hạn:** bảng xếp hạng Redis theo `mode × difficulty`, mục tiêu phá kỷ lục đội.

Quy tắc mới do bóng tối:
| Quy tắc | Giá trị | Nơi chỉnh |
|---|---|---|
| Quầng sáng quanh người | 118 px | `shared/src/bansung/night.ts` `AMBIENT_RADIUS` |
| Tầm đèn pin | 540 px | `CONE_RANGE` |
| Nửa góc mở nón | 0.46 rad (~26°, tổng ~53°) | `CONE_HALF_ANGLE` |
| Viền gửi trước cho client fade-in | 72 px | `SERVER_REVEAL_PAD` |
| Đèn khi bị gục | ×0.45 | `DOWNED_RANGE_MULT` |
| Độ tối | 0.94, màu `rgb(3,6,16)` | `DARKNESS_ALPHA/RGB` |
| Boss | luôn thấy mờ (hào quang 150 px) | `render.ts drawNightLighting` + `NIGHT_ALWAYS_VISIBLE_KINDS` |
| Zombie vừa trúng đạn | lộ diện trong frame có cờ `HIT_FLASH` | `world.ts frameFor` |

---

## 3. Hệ thống ánh sáng (đã triển khai)

### 3.1 Client — `client/src/bansung/render.ts` (PASS 5b)
1. Canvas phụ đúng kích thước pixel màn hình, phủ màu đêm.
2. `globalCompositeOperation = 'destination-out'` khoét:
   - **Nón đèn pin**: đa giác visibility từ 56 tia (người chơi local) / 28 tia (đồng đội) bắn vào chướng ngại bằng `raycastObstacles()` → **tường/cột đổ bóng thật**.
   - **Quầng sáng** quanh mỗi người.
   - **Ánh sáng động**: tái sử dụng `glowQueue` (đầu nòng, đạn plasma, vụ nổ…) × `DYNAMIC_LIGHT_SCALE = 2.4`.
   - **Hào quang boss**.
3. Ghép lên màn hình, rồi cộng lớp **ánh vàng ấm** (`lighter`) trong nón của người chơi local.
4. Rung nhẹ đèn ±2.5% (không nhấp nháy mạnh — tuân thủ Art Bible).
5. Tâm ngắm vẽ **sau** lớp tối để luôn thấy.

Hiệu năng: **0 `createRadialGradient` mỗi frame** (2 stamp bake 1 lần), 1 canvas phụ tái sử dụng, tối đa ~10 đa giác + 96 stamp/frame.

### 3.2 Server — `server/src/game/bansung/world.ts → frameFor()`
- Sau khi lấy quái trong viewport, lọc bằng `isPointLitByAny(lights, x, y, SERVER_REVEAL_PAD)`; nguồn sáng = mọi người chơi còn đứng/bị gục (aim từ `aimRad`).
- Boss (`boss_*`) và quái đang `HIT_FLASH` luôn được gửi.
- Lợi ích kép: **chống wallhack** + **giảm băng thông** snapshot (ít tuple quái hơn → ít byte/tick).
- Radar/minimap tự động chỉ hiện quái đã được soi (vì dữ liệu không có).

### 3.3 Cấu hình
`BansungConfig.nightMode` (mặc định `true`), validate trong `normalizeBansungConfig`, chọn ở Lobby (`Lobby.tsx` → "Thời gian").

---

## 4. Art Direction — Pixel Art Bible bổ sung

- Khung nhân vật 48×48, **chân tại (24,44)** khớp rig súng; vẽ ở scale 1.5 trong game.
- **Tỷ lệ thật**: đầu ≈ 1/4.5 chiều cao, vai rộng 13 px → eo 10 px, vạt áo loe; **cấm chibi**.
- Alpha nhị phân 0/255, viền 1 px `#1b1726`, ánh sáng từ trên-trái, ramp 4 tông có hue-shift.
- Zombie: da xám-xanh/cháy/tái tuỳ nguyên tố, áo rách lộ da, vết máu `#6b0f1a/#a61e2d`, **mắt phát sáng** (đọc được trong bóng tối).
- Pipeline tái lập: `tools/bansung/night_art/build.py` (Pillow, procedural theo rig, không dùng asset Internet).
- Bản gốc trước khi thay: `backup/database-ban-sung-legacy-v1/` (manifest, LICENSES, PNG cũ).

### 4.1 Atlas di chuyển 6×8 (chuẩn skill `expedition-sprite-generator`)
`design/bansung-night/heroes/hero_<id>_move8.png` — 6 cột × 8 hàng: hàng 1–4 **idle** (down, left, right, up), hàng 5–8 **walk** (down, left, right, up).
Trong game được tách thành `hero_<id>_{idle,walk}_{down,left,right,up}.png` (6 frame). `anim.ts → resolveDirectionalHeroClip()` dùng hàng **down/up** khi ngắm gần thẳng đứng (|sin| > 0.72); trái/phải dùng dải nghiêng để rig súng 360° chính xác.

---

## 5. Nhân vật (Character Design Sheets)

Chỉ số gốc, skill và súng khởi đầu giữ nguyên trong `shared/src/bansung/heroes.ts` (đã cân bằng & có test); lần refactor này đổi **ngoại hình + vai trò trong đêm**.

| ID | Tên | Silhouette mới | Màu nhận diện | Súng đầu | Skill chủ động (giữ nguyên) | Vai trò trong đêm |
|---|---|---|---|---|---|---|
| `ranger` | Cyber Ranger — Trinh sát đêm | Mũ trùm, kính visor neon, áo khoác dài, khăn bay | `#26324a` / cyan `#22d3ee` | SMG | **Mưa Tiễn Ảnh** (phantom_volley, 9 s): quạt 7 mũi xuyên giáp, +35% tốc chạy 3 s | Mở đường, soi xa, kéo zombie |
| `knight` | Knight — Hiệp sĩ thép xanh | Giáp tấm cobalt, mũ sừng vàng, áo choàng đỏ, khiên đeo lưng | `#4263eb` / vàng `#fcc419` | Shotgun | **Chấn Động Khiên Thần** (aegis_slam, 11 s): miễn nhiễm 1.2 s, choáng 220 px, +12 khiên | Tank chặn horde, giữ cửa |
| `pyro` | Pyromancer — Giả kim hoả ngục | Mũ trùm nhọn đỏ, mặt nạ phòng độc mắt cam, bình nhiên liệu | `#c92a2a` / cam `#ff922b` | Plasma rifle | **Siêu Tân Tinh Lửa** (inferno_nova, 11 s): nổ vòng lửa 240 px + hồi khiên | Dọn bầy; vụ nổ **thắp sáng** cả khu |
| `laser` | Laser Engineer — Kỹ sư quang tử | Mũ tròn trắng, visor hồng, ăng-ten, pin lưng | `#dee2e6` / hồng `#e64980` | Laser cannon | **Đại Pháo Quang Năng** (prism_overcharge, 11.5 s): tia xuyên bản đồ, +35% sát thương | Diệt Tank/Boss, tia laze soi đường thẳng |
| `mascot` | Mascot — Thỏ trắng cảm tử | Mũ trùm tai thỏ, nơ đỏ, khăn cyan | `#f8f9fa` / đỏ `#e03131` | Rifle | **Tiếp Đạn Cuồng Nộ** (supply_overdrive, 10 s): nạp đầy đạn, +45% tốc bắn, +25% tốc chạy | DPS ổn định, hỗ trợ đạn |

Animation (dải nghiêng): `idle 4f · run 6f · shoot 3f (giật lùi) · dash 4f (cúi lao) · stunned 2f (lảo đảo) · dead 4f (ngã ngửa)`.

*[Thiết kế]* Passive mới cho đêm: Ranger "Mắt Cú" (+15% tầm đèn), Knight "Đèn Khiên" (khiên phản quang lóa zombie 0.3 s khi chặn), Pyro "Than Hồng" (vùng cháy phát sáng 3 s), Laser "Đèn Pha" (+10° góc nón), Mascot "Pháo Sáng" (cứ 20 s thả pháo sáng 4 s).

---

## 6. Zombie Bestiary (29 quái thường — đã reskin)

ID gameplay giữ nguyên (AI, chỉ số, hitbox không đổi). Tên tiếng Việt mới & dạng cơ thể:

| Dạng | Quái (ID → tên mới) | Đặc trưng hình | Gợi ý lối chơi |
|---|---|---|---|
| **Walker** | `mirror_knight` → Xác Hiệp Sĩ Gương | Lê bước, tay đưa trước, mũ sắt | Bia đỡ đạn, đi theo bầy |
| **Runner** | `skirmisher` Zombie Chạy · `venom_stalker` Kẻ Rình Độc · `volt_stalker` Kẻ Rình Điện · `void_reaper` Lưỡi Hái Hư Vô · `crimson_lancer` Xác Lính Giáo · `saw_berserker` Cuồng Cưa | Đổ người về trước, sải dài | Lao từ bóng tối — buộc phải xoay đèn nhanh |
| **Brute (Tank)** | `cactus_brute` Tank Thối Rữa · `magma_brute` Tank Nham Thạch · `plasma_golem` Tank Hư Không · `shield_warden` Xác Cảnh Sát Khiên | Vai u, tay khổng lồ vung đập, vết nứt phát sáng | Dồn sát thương, né cú đập |
| **Bloater** | `bomb_goblin` Túi Thịt Nổ · `blight_bomber` Bụng Trương Độc · `plague_bearer` Kẻ Mang Dịch | Bụng phình, mụn mủ phát sáng | Bắn từ xa trước khi nó áp sát/nổ |
| **Spitter** | `cactus_spitter` Kẻ Phun Axit · `pyro_shaman` Kẻ Phun Lửa · `thunder_mage` Kẻ Phun Sét · `frost_mage` Kẻ Phun Băng · `void_acolyte` Tín Đồ Hư Không · `healing_priest` Xác Linh Mục · `chrono_mage` Kẻ Phun Thời Gian · `solar_priest` Xác Mục Sư Mặt Trời · `laser_sniper` Xác Xạ Thủ Laze · `sniper_mech` Xác Xạ Thủ Giáp | Cổ họng sưng, miệng phát sáng khi phun | Đạn của chúng phát sáng → lộ vị trí kẻ bắn |
| **Crawler** | `scarab` Xác Bò Lê · `mortar_beetle` Xác Bò Pháo Cháy | Nửa thân bò bằng tay, vệt máu | Thấp, khó thấy — nguy hiểm trong bóng tối |
| **Crow** | `iron_drone` Quạ Xác Sắt · `shock_drone_mk2` Quạ Xác Điện · `magnet_drone` Quạ Xác Từ Trường | Quạ xác sống lộ xương sườn | Bay vòng, quấy rối |

Bảng tên có sẵn trong code: `tools/bansung/night_art/zombies.py → ZOMBIE_NAMES_VI` (*[Thiết kế]* đưa vào `shared/src/bansung/enemies.ts` làm `vnName` hiển thị HUD).

---

## 7. Boss (9 boss — cơ chế giữ nguyên, chủ đề mới)

Boss luôn **lộ mờ** trong đêm; telegraph đỏ vẫn vẽ trên lớp tối (PASS 1) và được khoét sáng nhờ hào quang.

| ID | Tên cũ | Chủ đề Đêm Zombie *[Thiết kế art]* | HP gốc | Cơ chế đã xác nhận trong code | Ghi chú đêm *[Thiết kế]* |
|---|---|---|---|---|---|
| `boss_beholder` | Sand Beholder | **Mẹ Ổ Nhãn Thịt** — khối thịt nhiều mắt | 6 400 | đạn danmaku (`danmaku.ts`), telegraph — chi tiết `boss-sand.ts` | Mắt phát sáng = điểm yếu |
| `boss_colossus` | Dread Colossus | **Tank Mẹ Thiết Giáp** | 10 500 | drone hộ vệ (che chắn), trạng thái quá nhiệt choáng (`OVERHEAT_STUN`) — `boss-colossus.ts` | Drone → quạ xác |
| `boss_overlord` | Overlord Gunship Core | **Lõi Dịch Bệnh Bay** | 14 500 | laser lanes, weak points, pylon EMP, `breach_stun` — `boss-overlord.ts` | Pylon tắt đèn pin 2 s |
| `boss_arsenal` | Arsenal Dread Gunner | **Xác Lính Pháo Binh** | 7 200 | xem `boss-arsenal.ts` | Ánh lửa nòng làm lộ vị trí |
| `boss_tempest` | Tempest Stormlord | **Xác Thầy Bão** | 24 000 | xem `boss-tempest.ts` | Sét chiếu sáng toàn map 0.2 s |
| `boss_destroyer` | Doomsday Destroyer | **Đại Đồ Tể** | 44 000 | xem `boss-destroyer.ts` | — |
| `boss_frost_empress` | Frost Empress | **Nữ Hoàng Xác Băng** | 32 000 | xem `boss-frost-empress.ts` | Sương băng giảm tầm đèn 30% |
| `boss_abyssal_leviathan` | Abyssal Leviathan Omega | **Thủy Quái Thối Rữa** | 58 000 | xem `boss-leviathan.ts` | — |
| `boss_storm_herald` | Twin-Volt Storm Herald | **Song Lôi Xác Sống** | 38 000 | xem `boss-storm-herald.ts` | — |

Mọi boss: có master-spark beam & telegraph render chung (`render.ts drawActiveBossMasterSparkBeams`, `drawStandardTelegraphs`) và cơ chế vỡ bộ phận (`boss-parts.ts`).

**B4b — skill mới cho 4 boss còn lại (`server/src/game/bansung/boss-zombie-skills.ts`).** Brood Eye, Iron Hulk, Plague Core dùng chung module "lớp phủ": skill chạy song song FSM gốc, chỉ bắt đầu khi boss đang di chuyển tự do và **sau 20 s giao tranh** (600 tick), hồi chiêu 12 s (pha 2: 9 s); khi skill chạy, boss giữ các đòn gốc; bị FSM kéo sang chiêu khác thì skill dừng. Nhờ đó các test hành vi cũ (đếm chính xác số đạn từng chiêu trong vài giây đầu) không đổi. Volt Twins thêm 2 trạng thái FSM mới vào vòng xoay chiêu (`thunder_lance_windup`, `volt_carousel`), giữ đúng luật test: 0 viên đạn, 0 quái hộ tống, chỉ telegraph vàng (5) / xanh (2), chỉ vũng `storm_yellow` / `storm_blue`. Tiêu đề boss bar của Volt Twins đổi sang tên tiếng Anh.

**B4c — skill boss tự chỉnh theo độ khó phòng** (`ZOMBIE_SKILL_DIFFICULTY` trong `boss-zombie-skills.ts`). Áp dụng cho skill mới của Brood Eye, Iron Hulk, Plague Core, Volt Twins.

| Hệ số | Thường | Khó | Địa Ngục | (Dễ — chưa có trong lobby) |
|---|---|---|---|---|
| Dùng skill mới lần đầu | 20 s | 15 s | 10 s | 30 s |
| Hồi chiêu (pha 1 / pha 2) | 12 / 9 s | 9.8 / 7.4 s | 8.2 / 6.1 s | 16.2 / 12.2 s |
| Độ dày đạn (cánh xoắn ốc, viên/vòng hoa, số tia sét) | ×1 | ×1.25 | ×1.5 | ×0.7 |
| Sát thương | ×1 (10–12/viên) | ×1.25 | ×1.5 | ×0.75 |
| Tốc độ đạn | ×1 | ×1.1 | ×1.2 | ×0.85 |
| Tốc độ xoay (curl, bước xoay, quét laze) | ×1 | ×1.15 | ×1.3 | ×0.8 |

Ví dụ: Brood Spiral pha 2 = 5 + 2 cánh (Thường) · 6 + 3 (Khó) · 8 + 3 (Địa Ngục); Furnace Beam quét 1.33 s → 1.17 s → 1.03 s; Volt Carousel 8 / 10 / 12 tia; telegraph Thunder Lance 0.67 s → 0.6 s → 0.57 s. Sát thương của Volt Twins đã nhân theo độ khó qua `ctx.dmgMult` (như 5 boss khác) nên không nhân thêm lần nữa; Brood Eye / Iron Hulk / Plague Core trước đây chỉ tăng máu theo độ khó, nay skill mới của chúng nhân sát thương theo đúng `BANSUNG_DIFFICULTY_SCALE.dmg`. Trần đạn (160 của Plague Core, 520 toàn cục) vẫn giữ nguyên ở mọi độ khó.



Quy tắc chung: 3 pha (66% / 33% HP), telegraph ≥ 600 ms trước đòn mạnh, ultimate người chơi không che telegraph (AGENTS §8).

---

## 8. Súng & cảm giác bắn

40 vũ khí (`shared/src/bansung/weapons.ts`), tiến hoá Mk.I–IV, súng xoay 360° tại vai (`anim.ts`). Trong đêm:
- Mỗi phát bắn đẩy 1 glow vào `glowQueue` → **chớp sáng** tầm 2.4× bán kính glow; súng tốc độ cao (minigun, SMG) tạo "đèn nhấp nháy" tự nhiên.
- Súng năng lượng (plasma, laser, tesla) có đạn phát sáng bay → soi đường đạn.
- Nổ (grenade, bazooka, cluster) thắp sáng cả vùng nổ.
- *[Thiết kế]* Phụ kiện "Đèn chiến thuật": +tầm đèn / +góc nón như một perk gacha.

---

## 9. Kiến trúc kỹ thuật

```
Browser (React + Canvas 60 FPS)                     Node (NestJS + Socket.IO)
┌──────────────────────────────┐   bansung:cmd    ┌──────────────────────────────────┐
│ input.ts (aim chuột/joystick)│ ───────────────▶ │ game.gateway → rate limit/validate│
│ store.ts (interp + predict)  │                  │ BansungWorld 30 Hz (RAM, authoritative)
│ render.ts PASS0..7 + 5b Đêm  │ ◀─────────────── │  frameFor(viewer): viewport AOI   │
└──────────────────────────────┘   bansung:frame  │   + lọc bóng tối (night.ts)       │
                                                   └──────────────┬───────────────────┘
                                                      fire&forget │ (không chặn tick)
                                                   ┌──────────────▼───────────────────┐
                                                   │ Redis 7 (bansung-redis.ts, RESP2)│
                                                   │ session · checkpoint · ZSET LB   │
                                                   └──────────────────────────────────┘
```

### 9.1 Vì sao Redis *không* làm game hết lag — và cái gì mới làm
- Lag trong game realtime đến từ: tick server quá tải, snapshot to, mạng jitter, client render chậm.
- Redis là bộ nhớ ngoài tiến trình qua mạng (~0.2–1 ms/lệnh). Đặt nó **trong** vòng tick 30 Hz sẽ *gây* lag. Vì vậy:
  - Tick, va chạm, AI, đạn **ở RAM** như cũ.
  - Giảm tải thực sự lần này: **lọc bóng tối giảm số quái/snapshot**, render đêm **0 gradient/frame**.
- Redis đảm nhiệm phần "ngoài vòng": vào lại phòng, checkpoint, bảng xếp hạng, thống kê, và là nền để **scale nhiều instance** (*[Thiết kế]* `@socket.io/redis-adapter` + sticky session theo `bansung:session:<playerId>`).

### 9.2 `server/src/game/bansung/bansung-redis.ts`
- Một kết nối TCP bền, pipeline, hàng đợi tối đa 512 lệnh (đầy → bỏ lệnh, không chặn game), timeout 1.5 s, reconnect backoff 0.5 → 15 s, AUTH/SELECT đúng thứ tự.
- Không có `BANSUNG_REDIS_URL` → chế độ bộ nhớ (bảng xếp hạng RAM 200 dòng), test chạy không cần Redis.
- Khoá dữ liệu:

| Key | Kiểu | TTL | Ghi khi |
|---|---|---|---|
| `bansung:session:<playerId>` | STRING (mã phòng) | 15' | bắt đầu trận; xoá khi kết thúc |
| `bansung:room:<code>` | STRING JSON | 15' | mỗi 2 s trong trận (throttle) |
| `bansung:lb:<mode>:<difficulty>` | ZSET (`ZADD GT`) | không | kết thúc trận (bỏ bot) |
| `bansung:lb:names` | HASH | không | kết thúc trận |
| `bansung:stats` | HASH (HINCRBY) | không | kết thúc trận |

- Chạy Redis: `docker compose -f docker-compose.bansung.yml up -d` → `BANSUNG_REDIS_URL=redis://127.0.0.1:6380` trong `server/.env`. Policy `volatile-lru` để không bao giờ đẩy mất bảng xếp hạng.

### 9.3 Ngân sách hiệu năng (mục tiêu)
| Mục | Ngân sách |
|---|---|
| Tick server | ≤ 8 ms @ 10 người + 200 zombie |
| Snapshot/viewer | ≤ 64 quái (cap cũ) — đêm thường 15–35 |
| Lighting client | ≤ 1.5 ms/frame (1080p, 10 người) |
| Redis | 0 lệnh trên đường tick đồng bộ; ~0.5 lệnh/s/phòng |

---

## 10. Bảo mật & chống gian lận
- Tầm nhìn quyết định ở **server** (`frameFor`), client sửa code cũng không thấy quái trong tối.
- `nightMode` đi qua `validateBansungConfig` (giới hạn key/byte cũ) → chỉ chủ phòng đổi được ở lobby.
- Redis chỉ bind `127.0.0.1` trong compose; không lưu PIN/token.

---

## 11. Kiểm thử
- `server/test/bansung-night.test.cjs`: quầng sáng, nón theo hướng, pad server, đèn khi gục + đồng đội, cấu hình mặc định, Redis chế độ bộ nhớ, parse URL.
- `server/test/bansung-physics.test.cjs`: cập nhật kỳ vọng `nightMode: true`.
- `server/test/bansung-assets.test.cjs`: audit asset — đã cập nhật `manifest.json` (+40 clip hướng), `LICENSES.md` (sha256 194 file, pack `generated_night_art`), `sources.json`.
- Chạy: `npm test --prefix server` (build TypeScript + toàn bộ test).

QA thủ công: (1) xoay chuột 360° — nón theo sát, tường đổ bóng; (2) zombie ngoài nón biến mất cả trên radar; (3) bắn vào bóng tối — chớp sáng làm lộ zombie; (4) bị gục — đèn yếu, đồng đội soi giúp; (5) boss luôn thấy mờ + telegraph; (6) tắt "Ban ngày" — mọi thứ như cũ; (7) tắt Redis giữa trận — không giật.

---

## 12. Lộ trình tiếp theo
1. Đưa `ZOMBIE_NAMES_VI` vào `enemies.ts` (`vnName`) + HUD.
2. Art boss zombie 128–256 px theo bảng §7 (hiện giữ sprite boss cũ).
3. Passive đêm của 5 anh hùng (§5) + perk "Đèn chiến thuật" (§8).
4. Map đêm: trăng tròn/mưa, đèn đường hỏng nhấp nháy, máy phát điện co-op mở đèn khu vực.
5. `@socket.io/redis-adapter` + sticky session cho nhiều instance; endpoint `GET /api/bansung/leaderboard`.
6. Sprite hướng chéo (8 hướng) khi có thời gian art.

---

# PHẦN B — v2 (25/11/2026): hoạt ảnh, máu, boss zombie, cân bằng súng, thời tiết

## B1. Hoạt ảnh anh hùng v2
| Clip | Frame | Ghi chú |
|---|---|---|
| idle / run / shoot / dash / stunned / dead | 6 / 8 / 4 / 6 / 4 / 6 | dải nghiêng 48×48, chân tại (24,44) |
| idle_{down,left,right,up} / walk_{…} | 6 / 8 | 4 hướng, atlas tham chiếu `design/bansung-night/heroes/hero_<id>_move8.png` (8×8) |

Sửa lỗi: vai rig đặt ở (4,−33) (rig cũ −17..−19 dành cho sprite chibi → súng lơ lửng ngang hông); tay cầm súng vẽ bằng code (`HERO_ARM_COLORS` trong `anim.ts`); hysteresis đổi hướng 0.8 / 0.55 (hết nháy qua lại giữa nhìn thẳng / sau lưng); bỏ co giãn khi chạy/bắn, giảm mạnh khi dash, bỏ lộn vòng; thẻ gacha xuống 2 dòng, không cắt tên.

## B2. Zombie v2 — frame & tên tiếng Anh ngắn
Frame mới: idle 6 · run 8 · attack 8 · dead 8 · lunge 6 · slam 8 · fuse_run 8 · spark 4. Chết: trúng đòn → loạng choạng → ngã, máu phun theo cung; Bloater phình rồi nổ; Crow rơi xoay vòng.

| ID | Tên | ID | Tên | ID | Tên |
|---|---|---|---|---|---|
| scarab | Crawler | skirmisher | Runner | bomb_goblin | Bloater |
| cactus_brute | Tank | cactus_spitter | Spitter | laser_sniper | Sniper |
| pyro_shaman | Burner | thunder_mage | Shocker | iron_drone | Crow |
| frost_mage | Frost | venom_stalker | Stalker | shield_warden | Riot |
| mortar_beetle | Mortar | void_acolyte | Acolyte | saw_berserker | Sawman |
| healing_priest | Priest | shock_drone_mk2 | Volt Crow | chrono_mage | Warper |
| plasma_golem | Void Tank | sniper_mech | Marksman | plague_bearer | Plaguer |
| crimson_lancer | Lancer | void_reaper | Reaper | mirror_knight | Knight |
| magnet_drone | Mag Crow | blight_bomber | Boomer | volt_stalker | Sparker |
| solar_priest | Sunburnt | magma_brute | Magma Tank | | |

Nguồn: `BANSUNG_ENEMIES[id].shortName`, `getBansungEnemyShortName(id)`; thanh máu boss dùng tên này.

## B3. Máu & gore (`client/src/bansung/gore.ts`)
Pool cố định (không cấp phát mỗi frame): giọt máu, mảnh thịt nảy, sương máu, tia động mạch phun theo nhịp tim, vũng/vệt máu bake sẵn theo nguyên tố, mờ dần sau 22 s; ichor phát sáng cho zombie độc/hư không/điện/băng/lửa. Kích hoạt: `FX_DEATH` → `spawnZombieDeathGore` (hướng từ người giết tới xác), `FX_IMPACT` FLESH/SLASH → `spawnBloodHit`. Vẽ: vũng máu PASS 1, giọt bay PASS 4, ichor PASS 5 — tất cả *trước* lớp đêm nên máu ngoài đèn bị bóng tối che.

## B4. Boss zombie v2 (34–47 frame/boss, ô 96×96)
| ID | Tên | Skill nổi bật (server) |
|---|---|---|
| boss_beholder | Brood Eye | tia mắt (có sẵn) + **Brood Spiral** xoắn ốc 3 cánh (P2: 5 cánh + 2 cánh ngược) + **Hatch Bolts** 3/5 tia sét chẻ nhánh |
| boss_colossus | Iron Hulk | đập đất, drone, quá nhiệt (có sẵn) + **Rivet Bloom** 3/4 vòng hoa đinh tán xoay ngược + **Furnace Beam** laser quét 1.7 rad (P2: xả sét chẻ nhánh cuối chiêu) |
| boss_overlord | Plague Core | lưới laser (có sẵn) + **Plague Galaxy** 4 cánh (P2: 6 + 3 cánh ngược, tôn trọng trần 160 đạn) + **Toxic Bloom** 2 vòng hoa độc làm chậm |
| boss_arsenal | Gunner | **Gatling Spiral** 2 cánh (pha 2, ring_fire) |
| boss_tempest | Storm Wraith | **Galaxy Spiral** 3–4 cánh + 2 cánh ngược (pha 2); **Forked Bolts** 3/5 tia sét chẻ nhánh bắn từ boss; laser xoay supercell |
| boss_destroyer | Butcher | **Blade Cyclone** xoắn ốc 4–5 cánh (pha 2 / doomsday); laser chữ thập |
| boss_frost_empress | Frost Queen | **Snowflake Spin** 2 vòng hoa làm chậm; tia cryo |
| boss_abyssal_leviathan | Drowned Maw | **Whirlpool Bloom** 2 vòng hoa xoay ngược có khe thoát; xúc tu laser |
| boss_storm_herald | Volt Twins | tia sét xoay (có sẵn) + **Thunder Lance** khoá 1–3 tia sét vào người chơi, sét nhảy chuỗi sang đồng đội, để lại vũng bão xanh + **Volt Carousel** (P2) 8 tia sét vàng/xanh xoay tăng tốc — vẫn 0 viên đạn |

VFX: `client/src/bansung/boss-fx.ts` — laser có xung năng lượng + tia lửa, sét zig-zag nhấp nháy có nhánh, vệt đuôi đạn xoắn ốc, vòng tụ lực, overlay telegraph. Ban đêm VFX boss vẽ **sau** lớp tối (PASS 5c) để luôn né được. Trần đạn boss toàn cục 520 viên. Clip chết của quái/boss giờ chạy từ frame 0 lúc chết; 5 boss có clip đi (`run`) được dùng khi di chuyển.

## B5. Thời tiết theo wave (`shared/src/bansung/night.ts`)
- Mức bão = max((wave−1)/9, (cycle·4+stage)/7).
- Mưa từ mức 0.08 (wave 2): cường độ 0.12 + 0.88·t^1.15; 3 lớp mưa parallax, gợn nước, mặt đất ướt, giọt mưa sáng trong nón đèn.
- Sét từ mức 0.6 (wave 7+): mỗi ô 2200 ms tối đa 1 cú, xác suất 16%→55%; 4 mẫu chớp ≤ 3 nhịp, < 420 ms; nhấc lớp tối tối đa 92%; chớp màn hình ≤ 0.455 (0.08 khi bật giảm chớp); sấm trễ 320–830 ms.
- Server dùng cùng công thức (seed + ms trận): khi chớp ≥ 0.35 thì tạm dừng lọc bóng tối → zombie trong tối hiện ra đúng lúc map sáng.

## B6. Ánh sáng & bối cảnh v2
Đèn pin: nón bake sẵn, falloff theo khoảng cách, viền mềm 0.12 rad, hotspot ở 30% tầm, lõi trắng ấm / viền lạnh, bụi lơ lửng trong luồng sáng, đất ướt lấp lánh; ánh sáng xuyên 14 px vào mặt tường. Hằng số mới: AMBIENT 112, CONE_RANGE 560, CONE_HALF_ANGLE 0.44, DARKNESS 0.93, 72/32 tia. Mặt đất: lớp chi tiết bake theo chunk (loang màu, nứt, vũng nước, sỏi/vỏ đạn/kính vỡ, cỏ/rêu/dầu, vết máu khô). Chướng ngại 2.5D bake 1 lần: AO, mặt trên nổi hạt, viền ánh trăng, gạch so le, rêu/gỉ theo biome, vệt ướt khi mưa.

## B7. Cân bằng 36 khẩu súng

DPS tính đúng công thức của `server/test/bansung-weapons.test.cjs` (T09.3): **effDps** = DPS có tính chí mạng, **sustain** = DPS tính cả thời gian thay đạn. Hệ số giáp: `Nhẹ/Giáp` nhân thêm khi bắn zombie thường / zombie giáp (Tank, Cảnh sát khiên…). Súng nổ lan, xuyên, giật chuỗi có DPS đơn mục tiêu thấp hơn vì sát thương thật nhân lên theo số quái trúng.

Khung DPS theo độ hiếm (effDps đơn mục tiêu): Thường 85–110 · Khá 130–160 · Hiếm 150–180 · Sử thi 175–235 · Huyền thoại 185–240 · Thiên giới 275–295 · Thần thoại 270–315.

| Độ hiếm | Súng | Vai trò | Điểm mạnh | Điểm yếu | DMG | effDps cũ → mới | Sustain | Nhẹ / Giáp | Tầm | Năng lượng |
|---|---|---|---|---|---|---|---|---|---|---|
| Thường | `crescent_blade` | Kiếm cận chiến | Không tốn gì, chém quạt 130° | Phải áp sát | 30 | 102 → **109** | 109 | ×1.25 / ×0.85 | 68 | 0 |
| Thường | `pistol` | Vũ khí phụ | Không tốn năng lượng, chính xác, thay đạn nhanh | Sát thương thấp, yếu với quái giáp | 16 | 64 → **87** | 58 | ×1.0 / ×0.7 | 700 | 0 |
| Khá | `rifle` | Đa năng | Ổn định mọi tầm trung, không lệch giáp | Không nổi trội ở mặt nào | 15 | 193 → **159** | 105 | ×1.0 / ×1.0 | 820 | 0 |
| Khá | `plasma_rifle` | Súng năng lượng cơ bản | Ổn định, x1.3 với giáp | Yếu hơn với quái nhẹ, tốn năng lượng | 22 | 134 → **148** | 100 | ×0.9 / ×1.3 | 620 | 2 |
| Khá | `grenade_launcher` | Nổ lan + mảnh | Nổ diện rộng kèm 6 mảnh đạn | Bắn vòng cầu, tầm 420, yếu với giáp | 60 | 129 → **134** | 81 | ×1.2 / ×0.8 | 420 | 4 |
| Khá | `smg` | Dọn quái nhẹ tầm gần | Loạt 3 viên, chí mạng cao, rất mạnh với zombie thường | Tầm ngắn, yếu hẳn với giáp | 12 | 120 → **132** | 94 | ×1.3 / ×0.7 | 560 | 0 |
| Hiếm | `shotgun` | Cận chiến bùng nổ | Một phát 6 viên cực đau ở sát mặt | Sát thương tụt mạnh sau 200px, thay đạn chậm | 16 | 156 → **176** | 115 | ×1.15 / ×0.75 | 360 | 0 |
| Hiếm | `dual_pistols` | Chạy và bắn | Bắn 2 viên/nhịp, chí mạng cao, cơ động | Yếu với giáp, DPS bị giới hạn | 12 | 165 → **165** | 114 | ×1.1 / ×0.8 | 640 | 0 |
| Hiếm | `twin_smg` | Vòi rồng tầm gần | Liên thanh cực nhanh, mạnh với quái nhẹ | Tầm 520, yếu với giáp, tốn chút năng lượng | 10 | 163 → **163** | 109 | ×1.25 / ×0.75 | 520 | 1 |
| Hiếm | `mine_gun` | Gài bẫy chặn đường | Mìn nổ to, choáng ngắn | Phải dụ quái vào, tầm ngắn | 80 | 140 → **156** | 90 | ×1.1 / ×1.2 | 400 | 5 |
| Hiếm | `electric_gun` | Giật chuỗi | Giật 4 mục tiêu + choáng | Sát thương mỗi phát thấp | 34 | 150 → **150** | 98 | ×1.15 / ×1.65 | 680 | 3 |
| Hiếm | `lightning_staff` | Sét lan | Đạn tự tìm mục tiêu và lan sét, rất mạnh với giáp | Tầm 600, DPS trực tiếp vừa | 38 | 144 → **144** | 99 | ×1.3 / ×1.8 | 600 | 4 |
| Hiếm | `shock_baton` | Dùi cui điện | Choáng 1.2s và lan sang quái gần | Tầm với ngắn nhất | 34 | 107 → **107** | 107 | ×0.95 / ×1.35 | 60 | 2 |
| Hiếm | `stun_launcher` | Khống chế | Choáng diện rộng 1.8s | Sát thương rất thấp | 40 | 85 → **77** | 48 | ×0.85 / ×1.0 | 400 | 4 |
| Sử thi | `railgun` | Tụ lực xuyên giáp | Giữ để nạp: xuyên nhiều mục tiêu, choáng | Phải nạp, chậm chân khi nạp, yếu với quái nhẹ | 88 | 268 → **236** | 120 | ×0.7 / ×1.35 | 860 | 10 |
| Sử thi | `sniper_rifle` | Diệt tinh anh/Tank | Phát xuyên 3 mục tiêu, nhân x1.5 với giáp, tầm 1300 | Bắn chậm, băng 5 viên, kém khi bị bầy vây | 135 | 223 → **219** | 116 | ×0.9 / ×1.5 | 1300 | 0 |
| Sử thi | `ion_beam` | Chùm ion chống giáp | Tức thời, x1.6 với giáp | Yếu với quái nhẹ, tốn 7 năng lượng | 74 | 213 → **208** | 129 | ×0.9 / ×1.6 | 840 | 7 |
| Sử thi | `plasma_shotgun` | Phá giáp tầm gần | 6 viên plasma đốt cháy, x1.4 với giáp, đẩy lùi mạnh | Tốn năng lượng, tầm 420 | 19 | 218 → **204** | 133 | ×1.0 / ×1.4 | 420 | 4 |
| Sử thi | `minigun` | Trấn áp bầy | Băng 100 viên, xả liên tục | Lệch tâm lớn, thay đạn 2.2s, yếu với giáp | 13 | 228 → **201** | 147 | ×1.05 / ×0.8 | 760 | 0 |
| Sử thi | `blizzard_carbine` | Súng trường băng | Bắn nhanh, làm chậm | Không có điểm bùng nổ | 24 | 238 → **200** | 140 | ×1.05 / ×1.2 | 660 | 2 |
| Sử thi | `flamethrower` | Phun lửa | Cực mạnh với bầy zombie nhẹ, gây cháy | Tầm chỉ 340, yếu với giáp | 18 | 210 → **193** | 139 | ×1.35 / ×0.7 | 340 | 1 |
| Sử thi | `bazooka` | Diệt Boss/Tank | 3 rocket liên tiếp, x1.5 với giáp | Đạn bay chậm, thay đạn 2s, tốn năng lượng | 60 | 164 → **177** | 87 | ×0.85 / ×1.5 | 820 | 8 |
| Sử thi | `saw_launcher` | Đĩa cưa xuyên | Đĩa nảy qua nhiều quái và gây chảy máu | DPS trực tiếp vừa phải, yếu với giáp | 50 | 156 → **175** | 106 | ×1.1 / ×0.85 | 1100 | 0 |
| Sử thi | `reaper_scythe` | Lưỡi hái hút máu | Chém 220°, hút máu, phá đạn địch | Vung chậm, tốn năng lượng | 76 | 139 → **155** | 155 | ×1.15 / ×1.1 | 112 | 2 |
| Huyền thoại | `ricochet_disc` | Kiểm soát tầm xa | Lưỡi nảy tầm 1350, chảy máu, chí mạng cao | Băng 12, kém ở cự ly sát | 58 | 223 → **239** | 141 | ×1.1 / ×0.9 | 1350 | 0 |
| Huyền thoại | `arcane_book` | Cầu lửa nổ lan | Nổ lan + tách tàn lửa + thiêu đốt | Đạn chậm, yếu với giáp, tầm 520 | 74 | 215 → **234** | 157 | ×1.15 / ×0.85 | 520 | 5 |
| Huyền thoại | `magma_spitter` | Phun dung nham | Đạn nóng chảy ổn định, hơi mạnh với giáp | Tầm 620, tốn năng lượng | 46 | 234 → **234** | 152 | ×1.0 / ×1.2 | 620 | 3 |
| Huyền thoại | `laser_cannon` | Tia laze xuyên bản đồ | Xuyên vô hạn toàn map, mỗi phát 230 | Bắn rất chậm (1.33s), băng 6 | 230 | 198 → **211** | 144 | ×1.1 / ×1.4 | 7800 | 7 |
| Huyền thoại | `cluster_rpg` | Nổ chùm | Nổ lớn rồi tách 4 bom con | Băng 5, tốn năng lượng | 108 | 189 → **208** | 120 | ×1.15 / ×1.2 | 860 | 7 |
| Huyền thoại | `tesla_coil` | Lan điện diện rộng | Giật 5 mục tiêu, x1.65 với giáp | Sát thương đơn mục tiêu thấp | 42 | 169 → **187** | 129 | ×1.2 / ×1.65 | 640 | 4 |
| Thiên giới | `phantom_bow` | Xạ thủ thượng hạng | Xuyên 45% giáp, chí mạng 40% x2.3 | Băng 8, cần ngắm chuẩn | 84 | 347 → **295** | 142 | ×1.0 / ×1.3 | 1000 | 2 |
| Thiên giới | `chronos_rifle` | Súng thời gian | Loạt 2 viên xuyên 45% giáp, chí mạng cao | Tốn năng lượng, cần giữ tâm | 38 | 323 → **292** | 172 | ×1.05 / ×1.35 | 780 | 3 |
| Thiên giới | `cryo_cannon` | Đóng băng | Làm chậm khi trúng, DPS cao | Tốn năng lượng, tầm 640 | 80 | 292 → **278** | 194 | ×1.1 / ×1.15 | 640 | 4 |
| Thần thoại | `orbital_cannon` | Pháo hủy diệt | Nổ bán kính 180, choáng, sát thương cao nhất | Băng 4, thay đạn 2s, tốn 10 năng lượng | 175 | 350 → **314** | 150 | ×1.1 / ×1.35 | 960 | 10 |
| Thần thoại | `void_cannon` | Hố đen | Sát thương cực lớn mỗi phát | Bắn chậm, băng 8, tốn 8 năng lượng | 140 | 323 → **305** | 178 | ×1.2 / ×1.35 | 800 | 8 |
| Thần thoại | `gravity_gun` | Hố hút | Kéo bầy quái lại một chỗ, sát thương lớn | Bắn chậm, băng 8, tốn năng lượng | 130 | 277 → **273** | 165 | ×1.1 / ×1.15 | 760 | 8 |

Ghi chú:
- Cận chiến (`crescent_blade`, `reaper_scythe`, `shock_baton`) không có băng đạn nên sustain = effDps.
- `railgun` chỉ đạt DPS trên bảng khi nạp đầy; bắn chạm nhanh chỉ còn một phần sát thương.
- `laser_cannon` giữ cooldown 40 tick (1.33 s) và xuyên toàn bản đồ; `sniper_rifle` vẫn xuyên tối đa 3 mục tiêu.
- Ràng buộc test giữ nguyên: twin_smg/dual_pistols effDps < 200; gravity/void/orbital/cryo/chronos/phantom ≥ 250; lightning_staff tốn ≤ 4 năng lượng và sustain ≥ 80; arcane_book sustain ≥ 120.

## B8. Kiểm thử v2
- `server/test/bansung-night.test.cjs`: thêm test mức bão, mưa, lịch sét xác định, hằng số đèn, tên ngắn không trùng.
- `server/test/bansung-weapons.test.cjs`: `boss_storm_herald_idle.sourceId` → `generated_night_art` (art mới).
- `manifest.json` / `LICENSES.md`: 237 dòng nguồn gốc ảnh cập nhật sha256 + 6 dòng mới; 656 sprite key.


---

## Part C — Skill súng (chuột giữa) + cân bằng sát thương + hiệu ứng súng (25/11/2026)

### C1. Khung chung (đã làm)
- **Phím**: Chuột giữa = skill của súng đang cầm (nút trên hotbar cũng bấm được). Ping chuyển sang **G** hoặc **Alt + chuột trái**.
- **Lệnh mạng**: `{ t: 'wskill', x?, y? }` — server kiểm tra trong `security.ts` (kẹp toạ độ trong bản đồ).
- **Dữ liệu dùng chung**: `shared/src/bansung/weapon-skills/{types,index,kinetic,explosive,energy,melee}.ts`.
  Mỗi súng: 1 skill chủ động (`kind` burst/buff/beam/zone/summon/dash/barrage, `targeting` self/aim/cursor, hồi chiêu, năng lượng, thời lượng, tầm, màu) + 1 nội tại.
  Súng chưa có dữ liệu → skill mặc định **Overdrive** (+40% tốc bắn, +20% sát thương, 4 s).
- **Theo cấp Mk**: sát thương skill ×(1 + 0.15·(Mk−1)) (Mk.X ×2.35), hồi chiêu ×(1 − 0.04·(Mk−1)) (tối thiểu ×0.64), thời lượng ×(1 + 0.05·(Mk−1)).
- **Server**: `server/src/game/bansung/weapon-skills/index.ts` — hồi chiêu **riêng từng khẩu** (đổi súng không reset), skill chạy theo tick (cast → step → end), tự huỷ khi đổi súng / gục ngã; buff tạm thời + nội tại nhân dồn vào chỉ số súng (có kẹp: sát thương ≤ ×4, tốc bắn ≤ ×3, đa đạn ≤ +6, xuyên ≤ +8…); nội tại có `onShot / onHit / onKill / onTick / mods`, chống đệ quy. Bot tự dùng skill khi có trùm/tinh anh hoặc ≥ 3 quái gần.
- **HUD**: `frame.me.wsk` (cdMs, maxMs, activeMs, energyCost, stacks) → ô "M3" trên hotbar.
- **Hiệu ứng**: FX_STATUS sub-kind 18 cast · 19 impact · 20 end · 21 passive, tuple `[5, playerIdx, kind, weaponIdx, x, y]` → `client/src/bansung/weapon-skill-fx.ts` (đã nối vào render.ts: mặt đất, thế giới, additive, sau lớp đêm).
- **Test**: `server/test/bansung-weapon-skills.test.cjs`.

### C2. Skill từng súng + cân bằng (5 nhóm song song — đang làm)
Bảng sẽ được điền khi các nhóm xong.
