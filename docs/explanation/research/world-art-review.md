# Đánh giá mỹ thuật thế giới Mons: kế hoạch hợp nhất

Ngày: 2026-11-18. Nguồn: bài chấm của Critic A (gym và công trình, art direction) và Critic B (asset môi trường, vốn trang trí), cùng phần chấm chéo của hai bên. Dữ liệu của critic thứ ba không có trong bản tổng hợp gửi tới (bị cắt), nên ở bản đầu cột C để trống và điểm trung bình chỉ tính trên các điểm có thật.

(bổ sung critic C) Bản này đã thêm Critic C (quy mô và bố cục thế giới: đo `assets/maps/world.json` so với `pkmnmap-emerald.md` và `gen3-world-connections.md`, xem `world.png`, hub-city, city-a, city-b, port-city, route-5 và các thị trấn cinder/volt/flint/dune). Đã thêm: điểm của C vào bảng điểm (tính lại trung bình), chẩn đoán mới của C, phán quyết cho các chỗ C bất đồng với A/B hoặc với kế hoạch, và đề xuất C1–C12 trộn vào các đợt. Điểm chấm chéo của C cho A1–A10 được tính lại vào I/F/H. Không ai chấm chéo C1–C12 (vòng chấm chéo chỉ có A chấm B, B và C chấm A), nên các mục từ C ghi I/F/H "–". Mọi tọa độ world mới ở W2-9 và W3-6 đã được kiểm bằng script: không map nào chồng lên nhau, mọi cặp nối nhau chạm cạnh với nhau và chung ≥ 20 ô, không có cặp nào chạm nhau ngoài ý muốn.

Yêu cầu gốc của user: map rộng hơn; thiết kế thêm asset hợp với cả gym lẫn môi trường xung quanh, thêm đồ trang trí; hiện gym trông như bị "nhét vào background", lạc quẻ. Ràng buộc đã có từ trước: màu theme chỉ là điểm nhấn (accent), không phải lớp sơn phủ, và không có gì chói mắt.

Ràng buộc kỹ thuật vẫn giữ nguyên: Gen 3 (metatile 16 px, xuất ×2 = 32 px, BGR555, alpha 0/255, ≤ 15 màu mỗi tile 8×8), mọi tile đều là bản vẽ gốc, mọi PNG phải qua `check_gen3.py`.

---

## 1. Bảng điểm

Thang 1–10. Ba critic dùng bộ tiêu chí khác nhau; những tiêu chí cùng nghĩa được gộp vào một dòng.

| Tiêu chí | Critic A | Critic B | Critic C | TB |
|---|---|---|---|---|
| Hòa nhập gym vào đô thị (integration) | 3 | – | – | **3.0** |
| Hài hòa màu (palette harmony / harmony) | 5 | 3 | – | **4.0** |
| Chất lượng chuyển tiếp (transition) | 2 | – | – | **2.0** |
| Prop hỗ trợ / mật độ (prop support / density) | 4 | 4 | – | **4.0** |
| Dễ đọc (readability) | 7 | – | – | **7.0** |
| Đa dạng vốn asset (variety) | – | 5 | – | **5.0** |
| Bản sắc biome (biome identity / biome coherence) | – | 5 | 3 | **4.0** |
| Kể chuyện bằng trang trí (storytelling) | – | 3 | – | **3.0** |
| Quy mô thế giới (scale) (bổ sung critic C) | – | – | 3 | **3.0** |
| Cấu trúc vòng (loop structure) (bổ sung critic C) | – | – | 5 | **5.0** |
| Dùng khoảng trống (negative space use) (bổ sung critic C) | – | – | 2 | **2.0** |
| Mật độ landmark (landmark density) (bổ sung critic C) | – | – | 3 | **3.0** |
| **Trung bình chung** | 4.2 | 4.0 | 3.2 | **3.8** |

Trung bình chung (bổ sung critic C) là trung bình của cả 15 điểm có thật (trước đây 41/10 = 4.1, nay 57/15 = 3.8). "Biome coherence" của C gộp vào dòng biome vì cùng câu hỏi: theme của gym có lan ra môi trường quanh nó không. B chấm 5 vì vốn asset theo biome đã có; C chấm 3 vì vốn đó chỉ nằm trong mảng nền dưới gym.

Đọc nhanh: hình khối gym rất tốt (readability 7). Điểm yếu nằm ở mọi thứ *xung quanh* gym: chuyển tiếp (2), hòa nhập (3), kể chuyện (3). (bổ sung critic C) Ở tầm thế giới cũng vậy: khoảng trống đọc như hư không (2), thế giới nhỏ và route ngắn (3), route ít landmark (3). Chỉ cấu trúc vòng là khá (5).

---

## 2. Chẩn đoán chung: vì sao gym trông lạc quẻ

Hai critic đồng ý về các điểm sau, và chúng đã được đối chiếu với dữ liệu:

- **Gym đứng trên một "vết loang" tối màu.** Op `patch` vẽ một mảng nền theme có viền tối lượn sóng và lốm đốm (spec.md, op `patch`), sau đó nhảy thẳng sang lawn sáng qua 1–2 px dither. Nhựa đường và tro ở hub-city, đất nâu ở city-a, rêu tím ở city-b, cát ở port-city. Đây là nguyên nhân số 1 của cảm giác "sticker dán lên vết bẩn".
- **Fill dùng bậc tối nhất của ramp.** Mảng nền là vùng tối nhất (hoặc bão hòa nhất) trên cả map, nên nó hút mắt mạnh hơn cả tòa gym. Ở city-a, gym vườn lại đứng trên vùng xấu xí nhất map.
- **Viền map bị sơn theme.** Trong `themes.json`, `powerplant`, `mystic`, `garden` và `lagoon` đều đặt `<type>-tree-wall` trước `tree-wall` ở role `wall`/`border`. Ứng viên đầu tiên tồn tại sẽ thắng, nên hub-city có viền cây vàng kín bốn phía (bao luôn cả quận lửa), city-b viền tím. Đây là lỗi dữ liệu, trái với chính `_note` của file ("frame stays the meadow set").
- **Không có vùng đệm, không có bệ.** Không có curb, bậc thềm, hàng contact hay vòng lawn nhạt dần. Tòa gym không có plinth, mặt trước phẳng chạm thẳng xuống nền.
- **Prop ít, rải đều, không đối xứng.** Mỗi gym có 2–5 prop đặt ngẫu nhiên, bên ngoài mảng nền là prop chung (đá xám, hoa đỏ, đèn đường). Lawn rộng chỉ có prop đơn lẻ nên đọc như nhiễu. Gen 3 thì gom prop thành cụm có ý nghĩa.
- **Asset có sẵn bị bỏ phí.** Catalog đã có electric safety-rail, steel-plate, cable-spool, hazard-cone, drain, capacitor-bank, tesla-post, và fire basalt-path, charred-tree, ember-vent, magma-crack, nhưng chưa từng được đặt lên map.
- **Phần còn lại của thị trấn không biết mình có gym.** Nhà, Center, Mart không mang chút accent nào. Tên "thành phố nhà máy điện" không có cột điện, đường cáp hay bãi làm việc nào ngoài mảng nền.
- **Lỗi bố cục cụ thể làm hỏng mặt tiền.** Ở hub-city, lane tới gym lửa dừng thiếu khoảng 2 metatile trước cửa, contest hall đè lên mép tro, hồ lava vẽ ra là hình vuông cứng dù spec ghi ellipse. Ở port-city, gym nước nằm xa biển, mảng cát bị tree wall cắt, khoảng 40% map phía nam là biển trống. Một số prop (sign, lamp, beacon) có búi cỏ xanh vẽ sẵn ở chân, nên khi đứng trên nhựa đường trông như dán vào.

Critic C nhìn ở tầm thế giới và thêm các điểm mới sau (bổ sung critic C). Số liệu đã đối chiếu với `assets/maps/world.json` và kích thước trong từng `*.map.json`:

- **Gym không có vùng hậu phương (hinterland).** Mọi thành phố và route là cùng một đồng cỏ có viền cây. Người chơi tới gym lửa qua 60 hàng cỏ xanh, nên dù quận gym có đẹp, gym vẫn "rơi từ trên trời xuống". Theme chỉ bắt đầu ở mép mảng nền dưới gym, chưa bắt đầu từ route dẫn vào. A và B sửa phần trong thành phố; C chỉ ra nửa còn lại nằm trên route.
- **Hub-city chứa hai gym không liên quan.** Gym điện và gym lửa cùng đứng trên một bãi cỏ, trong khi cả thế giới không có route núi lửa nào. Đây là ca "lạc quẻ" rõ nhất, và không bố cục nào trong hub-city sửa được nó (xem D10).
- **Thế giới nhỏ, route ngắn, thị trấn chiếm nhiều đất.** 16 map, 31.200 ô trong hộp 288×340. Hoenn có 49 map, 122.580 ô trong hộp 800×383, nên Mons bằng khoảng 1/4 Hoenn về diện tích. Thị trấn và thành phố chiếm 38% diện tích (Hoenn khoảng 16%). route-1 24×40, route-2 24×60, route-7 72×20, trong khi cạnh dài trung vị của route Hoenn là 80.
- **Hai hố đen lớn.** Hố trong vòng chính (giữa route-3, route-5, route-6, route-7) khoảng 108×110 ô; hố phía nam (giữa route-2/route-1 và route-9a/9b/route-10) khoảng 108×160 ô. Không có landmark warp, hang, hồ hay khối núi nào, và `world.png` vẽ chúng màu đen. Cửa hang trên route-5 trỏ vào hố trong nhưng không dẫn đi đâu.
- **Route giống nhau và thiếu landmark.** route-1, 2, 3, 7 đều là một làn đất vàng uốn lượn, mảng cỏ cao và tree wall, 4–8 màn hình không có landmark. Các route biển 8/9a/9b/10 khoảng 95% là nước với 2–3 đảo oval giống hệt nhau; route biển Hoenn có 27% là đất (đá, bãi cát, bờ).
- **Route có theme nhưng không gym nào dùng.** route-5 (mỏ đá) và route-6 (hẻm núi) là hai route duy nhất có theme, nhưng không có thành phố gym đá hay gym đất nào trên đó. route-6 thực chất là một dải cát giữa route cỏ xanh.
- **Tám thị trấn theme nằm ngoài thế giới.** cinder, volt, flint, dune, fen, bloom, starfall, tide đều có kích thước 32×28 (32×30), không phải cỡ Gen 3 (town 24×20, city 48×40), và không có trong `world.json`. Vì vậy gym đá, đất và độc không có nhà trong thế giới. (`assets/maps/ember-route`, 24×48, theme volcano, cũng có sẵn nhưng chưa được đặt.)
- **Cấu trúc vòng thì ổn.** Có hai vòng thật (khoảng 1 vòng mỗi 8 map; Hoenn 1 mỗi 6). Thiếu: lối ra phía tây của hub (đã dành sẵn trong `gen3-world-connections.md` §4.3), nhánh phụ và khu tùy chọn. city-a và city-b chỉ là thành phố hành lang.

---

## 3. Bất đồng và phán quyết

| # | Vấn đề | Critic A | Critic B | Phán quyết |
|---|---|---|---|---|
| D1 | Vùng chuyển tiếp | Autotile 47 tile `<type>-lawn-edge` (A2) | Autotile fringe (B1); khi chấm chéo B đề xuất scatter decal giảm dần thay cho ring autotile | **Không làm autotile ring.** Sửa op `patch`: bỏ viền tối, thêm `fringe` giảm dần. Kèm 2–3 decal 1×1 mỗi theme, rải bằng `scatter` theo mật độ giảm dần. Rẻ hơn và không tạo viền thứ hai. |
| D2 | Kích thước court | Court 10×6 bao quanh gym (A1) | Chỉ một sân trước rộng bằng gym + 2, sâu 3–4 hàng (đúng Emerald) | **Theo B:** sân trước rộng `gym_w + 2`, sâu 3–4. Hai bên và phía sau chỉ có skirt 1 ô (plinth). Một court lớn ở mọi thị trấn sẽ biến 8 town thành cùng một quảng trường. |
| D3 | Rào quanh quận gym | Chữ U bao quanh (A3) | Chỉ rào hai góc trước và hai bên, không chạy dọc phố (B3, chấm chéo của A) | **Rào ngắn:** 2 đoạn 2–4 ô hai bên gatepost cộng tối đa 1 đoạn bên hông. Thêm rào base trung tính (low garden wall, picket) cho vườn nhà dân. |
| D4 | Tượng gym | "Dấu ấn Gen 3" (A4) | Trong RSE tượng đứng bên trong gym, bên ngoài chỉ có bảng | **Giữ tượng, ghi nhận đây là chi tiết gốc của Mons**, không phải bản chép Gen 3. Bệ bằng đá court trung tính, màu theme chỉ ở emblem. Có tượng thì không thêm cặp brazier hay beacon ở cửa. |
| D5 | Vẽ mới hay dùng lại | B nghiêng về thiếu asset | A: một nửa là do đặt prop và do dữ liệu | **Dùng lại trước (Wave 1), vẽ mới sau (Wave 2).** Đợt đầu chỉ 4–5 prop mới mỗi gym, không phải 6–8. |
| D6 | Phủ theme ra cả thị trấn | B6 đề xuất bench và bồn hoa theme cho cả 8 theme | A: đó lại là lớp sơn | **Quy tắc gradient:** trong quận gym 100% piece theme; phố tiếp giáp (≤ 6 ô) khoảng 30%; ngoài đó 0%; viền map luôn là meadow. |
| D7 | Rải prop | A5 ghi "1–3 mỗi block" | Vignette 2–4 prop có mục đích | **Vignette.** Mỗi cụm có một chủ đề rõ (lán máy phát, suối nóng, góc vườn). Cấm rải đều. |
| D8 | Mở rộng map | A9 mở rộng hub-city lên 88×64 | B: rộng mà không thêm quận thì chỉ thêm lawn trống | **Mở rộng chỉ khi phần đất mới chứa quận.** Mỗi map rộng ra phải có danh sách ô cho từng quận trước khi build. |
| D9 | Breakwater có foam animation (B11) | Ưu tiên thấp | Đề xuất | **Làm tide-pool ngay trong Wave 2; breakwater có animation dời sang Wave 3.** |

### Bất đồng với Critic C (bổ sung critic C)

| # | Vấn đề | A / B / kế hoạch hiện tại | Critic C | Phán quyết |
|---|---|---|---|---|
| D10 | Hub-city một hay hai gym | A9 / W2-4: hub-city 88×64 với hai quận, điện và lửa | C2 và chấm chéo A9: hai gym khác loại trong một thành phố đồng cỏ là chính vấn đề; giữ gym điện, chuyển gym lửa sang cinder-city | **Theo C.** Hub-city chỉ còn gym điện. Kích thước vẫn **88×64** như W2-4 (vị trí và độ dời +16 của nhánh đông đã chốt), nhưng nửa đông bắc trở thành quận nhà máy điện dân sự (corporation, trạm biến áp) thay cho quận lửa, đúng điều kiện D8. Gym lửa sang cinder-city, nên cinder-city và route-4 được kéo lên Wave 2 (W2-9) để gym lửa không bị mất nhà giữa hai đợt. |
| D11 | Kích thước thị trấn theme | A13 / W3-1: 8 thị trấn lên 40×32 | C11: 40×32 không phải cỡ Gen 3; bốn thị trấn có gym chưa có trong thế giới thành city 48×40, bốn còn lại thành town 24×20 | **Theo C, có sửa.** cinder, flint, dune, fen thành **city 48×40** (gym lửa, đá, đất, độc). bloom và starfall thành **town 24×20 không gym**, làm điểm dừng giữa vùng. tide gộp vào isle-town và volt gộp vào quận nhà máy của hub-city, vì đặt riêng thì sẽ thành hai thị trấn cách nhau dưới 40 ô trên cùng một chuỗi (thử tọa độ cho thấy tide phải nằm sát isle-town qua một eo biển 20 ô). Gym grass, psychic, water, electric đã có nhà ở city-a, city-b, port-city, hub-city. |
| D12 | Viền thành phố gần lối ra | W1-1 (A6, I/F/H 5/5/5): viền luôn là `tree-wall` meadow | C10: vòng cây viền cạnh lối ra hướng về route theme dùng cây theme | **Viền vẫn meadow, có một ngoại lệ ở mối nối.** Chỉ ≤ 6 ô viền mỗi bên lối ra dẫn tới một route có zone theme (W2-10) được dùng `twall`, để khớp với dải 7 ô mà Gen 3 hiển thị từ map bên cạnh. Số ô này tính vào lint `theme-area`. Mọi chỗ khác của viền giữ meadow. |
| D13 | Gradient theme trên route | D6 / W1-11: piece theme chỉ trong quận gym và ≤ 6 ô phố tiếp giáp, ngoài đó 0% | C1, C8: route quanh thành phố gym mang theme ở nửa hoặc 30 hàng gần thành phố | **Hai quy tắc ở hai tầng.** W1-11 áp dụng *trong map thành phố*. Trên route, theme chỉ được đặt trong `zone` đã khai báo (W2-10): zone ≥ 30 ô sát thành phố, đoạn giữa trung tính ≥ 20 ô, mật độ tăng dần 0% → 10% → 20% về phía thành phố (theo chấm chéo của C), không bao giờ quá 30% số ô của zone. Theme vẫn là accent, nhưng accent bắt đầu từ route. |
| D14 | Diện tích quận gym | W1-11: ô theme 10–20% diện tích map, cảnh báo trên 25% | C10: quận theme chiếm 20–30% thành phố | **Giữ 10–20% của W1-11** (đếm cả ground, prop, cây theme). Bbox của `gym_quarter` được phép tới khoảng 20% diện tích thành phố, vì bên trong bbox vẫn có lối đi và lawn. Lấy từ C10 phần nối quận ra đường chính và ra lối ra gần route theme (lint `quarter-link`, W1-4). |
| D15 | Mở rộng thế giới: dài route bao nhiêu | W2-4 chỉ dời nhánh đông +16 | C7: route-2 → 100, route-3 → 120, route-7 → 120 | **Theo C, có sửa** (W2-9). route-2 lên 24×100. route-3 chỉ lên **24×100**, vì 120 làm route-6 dài 140 và route-4b dài khoảng 130. route-7 **giữ 72×20**: hub rộng thêm đã dời nhánh đông +16, và nếu thêm +48 nữa thì route-10 phải dài khoảng 196 ô mới khép được vòng phía nam. Mục tiêu "thị trấn ≤ 25% diện tích" của C không đạt được cùng với các thành phố đã mở rộng của A (kết quả tính ra là 38–40%). Phán quyết: ưu tiên quận thật trong thành phố, hạ mục tiêu xuống ≤ 40% và bù bằng landmark trên route (W2-11). |
| D16 | Court theo màu theme hay trung tính | W1-3 (B2, A1): fill court dùng bậc trung của ramp gym | Chấm chéo A1 của C: một autotile court đá trung tính dùng chung, theme chỉ ở hàng inlay, medallion và bậc thềm | **Giữ W1-3 cho 5 fill đã có** (steel-plate, basalt-path, flagstone, marble đều là vật liệu đã trầm màu). **Theo C cho 3 fill còn thiếu:** thay vì vẽ 3 autotile court mới ở W2-1, vẽ một `court-stone` trung tính có hàng inlay theme cho ground, rock và poison. Ít art hơn và vẫn giữ được lint `court-value`. |
| D17 | Nguyên nhân gốc: cục bộ hay tầm thế giới | A, B: tích hợp gym ở cấp quận và vốn asset | C: nguyên nhân lớn hơn nằm ở tầm thế giới (không có hậu phương) | **Cả hai, theo thứ tự.** Wave 1 sửa cục bộ (rẻ, đo được). Wave 2 sửa kích thước thế giới và route dẫn vào. Wave 3 thêm các vùng biome mới. Tiêu chí ở mục 5 chấm cả hai tầng. |

---

## 4. Kế hoạch theo đợt

Ký hiệu điểm: **I/F/H** là impact / feasibility / harmony trung bình từ phần chấm chéo (thang 5). Mục nào chưa được chấm chéo ghi "–". (bổ sung critic C) Các I/F/H có nguồn từ A1–A10 đã được tính lại với điểm chấm chéo của C; số cũ ghi trong ngoặc.

### Wave 1: sửa dữ liệu và engine, dùng lại asset có sẵn (impact cao, effort S)

**W1-1. Viền map về meadow, giới hạn cây theme** (A6). I/F/H 5/5/5.
- `themes.json`: ở `powerplant`, `mystic`, `garden`, `lagoon` và các theme gym khác, đặt `wall: ["tree-wall"]` và `border: ["tree-wall"]`. Tạo role mới `twall: ["<type>-tree-wall"]` chỉ để dùng có chủ đích.
- Cây theme (`electric-tree`, `fire-tree`, …) chỉ được đặt trong bán kính 10 ô quanh court, tối đa 30% số cây ở đó.
- Hub-city: quận lửa không còn nằm trong viền vàng điện. (bổ sung critic C) Đây là bước tạm của Wave 1; ở W2-4/W2-9 gym lửa rời hub-city (D10).

**W1-2. Op `patch` bỏ viền tối, thêm fringe** (B1, B13, A2 đã sửa theo D1). I/F/H 4.0/3.8/4.5 (cũ 4.3/4.0/4.7; bổ sung critic C).
- Tham số mới `rim: "none" | "light"` (mặc định `none`; `light` = bậc ramp sáng hơn fill một bậc, không phải tối hơn).
- `fringe: 3` (số ô): vòng đốm theme giảm dần, khoảng 40% → 20% → 5% → 0% trên lawn, dùng seed của map.
- `tint` (tùy chọn): cơ chế "lawn ngả màu" dùng chung cho fringe quanh gym và dải lawn → cát trên route (B13).
- Mép trong của patch dùng hình chữ nhật bo góc Gen 3, `r` 0–1 cho court và 3 cho bãi hoang.

**W1-3. Fill court dùng bậc trung, dưới gym có bậc tối 1–2 ô** (B2, A1). I/F/H 4.3/4.3/4.0 (cũ 4.5/4.5/4.5; bổ sung critic C).
- Quy tắc: fill = bậc 2 hoặc 3 trong ramp 5 bậc của gym, không bao giờ dùng bậc tối nhất. Bậc tối chỉ cho 1–2 hàng ngay dưới chân gym (hiệu ứng plinth).
- Gán role `floor` theo bảng dưới. Phần lớn piece đã có; piece đánh dấu (mới) thì vẽ ở W2-1.

| Gym | Fill court (role `floor`) | Ý đồ màu |
|---|---|---|
| electric | `electric-steel-plate` | thép xám ấm, có vạch vàng hazard chỉ ở mép |
| fire | `fire-basalt-path` | đá bazan xám nâu, khe sáng cam rất thưa |
| grass | `grass-flagstone` | đá phiến xám lục, kẽ rêu |
| psychic | `psychic-marble-plaza` | cẩm thạch nhạt; `psychic-star-mosaic` chỉ dùng cho 1 medallion |
| water | `water-marble-plaza` | cẩm thạch trắng xanh |
| ground / rock / poison | (mới) `ground-adobe-court`, `rock-drystone-court`, `poison-boardwalk` | xem W2-1 |

**W1-4. Lint lane và chồng lấn** (A7, C10). I/F/H 3/5/4.5 (cũ 3/5/4; bổ sung critic C).
- `door-lane`: từ ô dưới cửa gym phải có đường liền mạch bằng ô `floor`/`path` ra tới đường chính. Lỗi nếu có khe.
- `structure-margin`: footprint của structure không được nằm trong patch/court của structure khác, và cách nhau ≥ 2 ô.
- `frame-margin`: không có structure hay court nào trong vòng 2 ô tính từ tree wall viền (bắt được lỗi port-city).
- `feature-shape`: cảnh báo khi `blob`/`rect` của một `feature` (lava, quicksand, toxic) có cạnh thẳng dài hơn 3 ô.
- `quarter-link` (bổ sung critic C, từ C10): bbox quận gym phải chạm một đường `path` chạy ra tới mép map, ưu tiên lối ra gần route mang theme của gym. Lỗi nếu quận là một ốc đảo giữa lawn.
- Sửa luôn hub-city: kéo lane lửa từ hàng 19 lên cửa ở hàng 15; dời contest hall sang trái ít nhất 2 ô tính từ court lửa; kiểm tra vì sao lava `shape: ellipse` lại ra hình vuông (nghi là bị một `rect` đè lên sau).

**W1-5. Chân prop trung tính** (A8). I/F/H 2.5/4.5/5 (cũ 3/5/5; bổ sung critic C).
- Vẽ lại chân của sign, lamp, street-lamp, mailbox, beacon, power-pole: bỏ búi cỏ xanh, thay bằng contact shade đục 1 px màu trung tính (xám nâu của ramp base).
- Biến thể tùy chọn `<slug>-lawn` có búi cỏ. Builder tự chọn `-lawn` khi ô dưới prop là `grass`.

**W1-6. Cặp tượng gym** (A4, B7). I/F/H 3.3/5/4.3 (cũ 3.5/5/4.5; bổ sung critic C).
- Asset `gym-<type>-statue`, Prop 1×2 metatile (32×64 px xuất ra). Bệ đá vuông trung tính theo màu court, thân trụ, đỉnh là emblem gốc: lửa = ngọn lửa, điện = tia sét, cỏ = lá, tâm linh = mắt-trăng, nước = giọt nước, đất = mesa, độc = nấm, đá = tinh thể. Màu theme chỉ ở emblem (≤ 3 màu theme). Contact shadow đục.
- Đặt đối xứng, cách bậc cửa 1 ô mỗi bên. Gỡ cặp brazier/beacon hiện ở cửa.
- B7 phần 2: `gym-<type>-monument` 2×2 ở điểm lane gặp đường thị trấn. Để sang Wave 2.

**W1-7. Dùng lại asset bị bỏ phí thành vignette** (B10, một phần A5). I/F/H 3/5/5.
- Hub-city, bãi điện (3–5 prop sau một đoạn `electric-safety-rail`): cable-spool, capacitor-bank, hazard-cone ×2, crate-stack (B10).
- Hub-city, bãi lửa: ember-vent, charred-tree ×2, đoạn basalt-path, magma-crack.
- Mỗi gym có 1–2 vignette nằm sát sân trước, không rải rác.

**W1-8. Đèn theme chỉ trên đường vào gym** (B4). I/F/H 3/5/4.
- Đã có: shell-lamp, mushroom-lamp, bud-lantern, star-lamp, cairn-lantern. Cần vẽ mới: `fire-ember-lantern`, `electric-arc-lamp`, `ground-clay-lantern` (Prop 1×2, cột trung tính, đầu đèn theme).
- 2–4 đèn mỗi gym trên đường vào; mọi chỗ khác giữ `street-lamp`.

**W1-9. Bench base và vignette công cộng** (B5). I/F/H 3/5/5.
- `bench` (Prop 2×1) làm từ `grass-bench` với gỗ trung tính.
- Vignette "bench + lamp + planter" trước Center, Mart và cạnh sân trước gym. Bench theme chỉ dùng trong quận gym.

**W1-10. Op `gym_quarter`** (ý tưởng mới của A, gom W1-3/4/6/8 lại). I/F/H –.
- Trường: `t` (gym slug), `door`, `court: [w_extra, depth]` (mặc định `[2, 3]`), `statues: true`, `lamps: 2`, `fence: "short"`, `fringe: 3`, `kit: [...]`.
- Op tự làm: (1) hàng plinth tối dưới chân gym; (2) sân trước theo D2; (3) tượng đối xứng; (4) lane liền tới đường chính, kết thúc bằng tile `threshold`; (5) 2 đèn theme; (6) rào ngắn theo D3; (7) fringe; (8) tự chạy lint W1-4 cho quận.
- Ghi nhận cả quận (bbox) để `dress`/`scatter` áp quy tắc gradient (W1-11).

**W1-11. Quy tắc gradient và lint tỉ lệ theme** (A6, ý tưởng mới của A). I/F/H 5/5/5 (theo A6).
- `themes.json` thêm `theme_falloff: {"quarter": 1.0, "street": 0.3, "beyond": 0.0, "street_cells": 6}`. `dress` và `scatter` với pool có t-role phải tuân theo khoảng cách tới bbox của `gym_quarter`.
- Lint `theme-area`: ô mang màu theme (ground, prop, tree) chiếm 10–20% diện tích map. Cảnh báo khi trên 25%, cảnh báo khi dưới 5%.
- (bổ sung critic C) Quy tắc này chỉ áp dụng trong map thành phố. Trên route, theme đi theo `zone` (W2-10, D13). Ngoại lệ ở mối nối viền theo D12.

**W1-12. `world.png` vẽ khoảng trống bằng border block của vùng** (C12, bổ sung critic C). I/F/H –. Effort S.
- Trong builder ảnh tổng quan, flood-fill từng vùng trống và tô bằng border block: `tree-wall` cho vùng garden/mystic, `mountain` cho quarry và khối núi, `fire-tree-wall` hoặc đá lava cho vùng núi lửa, nước biển cho lagoon. Trước khi có trường `region` (W2-12), mặc định là `tree-wall`.
- Chỉ thay đổi ảnh tổng quan, không đổi map nào. Mục đích: nhìn thế giới như một lục địa, và đánh giá ngay được vùng nào hợp theme. Đây cũng là ảnh "trước" để chấm lại tiêu chí negative space.

### Wave 2: asset mới và dựng lại các map chính (effort M–L)

**W2-1. Fill court còn thiếu và bậc thềm** (A1, D16). I/F/H 4/4/3.5 (cũ 4/4/4; bổ sung critic C).
- `ground-adobe-court`, `rock-drystone-court`, `poison-boardwalk`: terrain fill, autotile 47 tile, curb 2 px (1 hàng contact tối, 1 hàng mép sáng). Ramp lấy từ sheet gym tương ứng, ở bậc trung.
- (bổ sung critic C, D16) Ba fill trên được thay bằng một `court-stone` trung tính (autotile 47 tile, cùng curb 2 px) cộng một hàng inlay 1 ô theo theme (`ground-adobe-inlay`, `rock-slate-inlay`, `poison-moss-inlay`). Dòng trên chỉ còn là phương án dự phòng nếu `court-stone` không qua lint `court-value`.
- `gym-<type>-steps`: Structure apron 4×1 metatile, 2 bậc, contact shade đục, đặt dưới cửa. Dùng màu đá court.
- `threshold`: tile 1×2 ở chỗ lane gặp đường, đá court có viền base.

**W2-2. Rào theme ngắn và gatepost** (A3, B3). I/F/H 4/4/4.
- Connector Prop 4 chiều, cao 1 metatile: `fire-basalt-wall` (đỉnh đá có khe sáng cam), `grass-trellis-hedge` (giàn có vài bông), `psychic-balustrade` (lan can cẩm thạch, đầu trụ hình cầu tím), `water-quay-rail` (dây thừng và trụ; dùng chung `bollard` có sẵn), `ground-adobe-wall`, `poison-boardwalk-rail`, `rock-drystone-wall`. Electric dùng `electric-safety-rail` có sẵn.
- `<type>-gatepost`: Prop 1×2, đặt thành cặp ở miệng lane.
- Base trung tính: `garden-wall-low`, `picket-fence` cho vườn nhà dân.

**W2-3. Bộ prop quận gym, đợt đầu 4–5 món mỗi gym** (A5 đã sửa theo D5/D7). I/F/H 5/3/4.

| Gym | Slug (kích thước ô) | Ghi chú pixel |
|---|---|---|
| fire | `fire-hot-spring` (blob autotile, bờ đá), `fire-steam-vent` (1×1, anim 4 frame), `fire-basalt-bench` (2×1) | nước suối xanh xám, hơi nước trắng 2 bậc; màu cam chỉ ở khe đá |
| electric | `electric-solar-panel` (2×1), `electric-power-line` (row connector giữa 2 cột), `electric-generator-shed` (Structure 3×2), `electric-vending` (1×2) | khung xám, mặt pin xanh lam thẫm, vàng chỉ ở biển cảnh báo |
| grass | `grass-flowerbed` (có sẵn; thêm connector 2×1), `grass-cold-frame` (2×1), `grass-topiary` (có sẵn, đặt thành cặp), `grass-watering-can` (1×1) | thêm hoa trên nền lá, không phủ đất nâu |
| psychic | `psychic-obelisk` (1×2, cặp), `psychic-moon-garden` (2×2), `psychic-crystal-lamp` (1×2), medallion 3×3 dùng `psychic-star-mosaic` | đá nhạt, tím chỉ ở tinh thể và mosaic |
| water | `water-reflecting-pool` (blob autotile, bờ cẩm thạch), `water-buoy` (1×1, đỏ đã làm dịu), `water-rowboat` (2×1), `water-coral-planter` (1×1) | thay cho các ao hình chữ nhật |
| ground / rock / poison | `ground-water-trough`, `ground-clay-pots`; `rock-minecart`, `rock-ore-crate`; `poison-mushroom-cluster`, `poison-bog-reeds` | phần lớn là đặt lại piece có sẵn trong catalog |

Đặt prop thành vignette 2–4 món trong quận, cộng 1 vignette ở phố tiếp giáp (theo gradient).

**W2-4. Hub-city: quận điện và quận nhà máy, map rộng hơn** (A9, C2, đã sửa theo D10). I/F/H 4.5/3/3.5 (cũ 5/3/4; bổ sung critic C).
- Kích thước 72×60 → **88×64**. Vị trí world `[0,0]` giữ nguyên. Nhánh phía đông (route-7, port-city, route-6, route-8, route-9a/9b, isle-town) dịch x thêm +16. (bổ sung critic C) Bản trước ghi "route-2 giữ chỗ", nhưng hub cao thêm 4 hàng sẽ đè lên route-2 ở `[24,60]` (hub phủ y 0–64). Tọa độ đã sửa của route-2 và mọi map khác nằm ở bảng W2-9.
- Nửa bắc chia đôi bởi lane N: quận điện x 6–38, y 6–26 (một `gym_quarter`, court khoảng 12×7 tính cả sân phụ); (bổ sung critic C, D10) x 48–82, y 6–26 **không còn là quận lửa** mà là quận nhà máy dân sự: `corporation`, một bãi trạm biến áp (`electric-transformer`, `electric-power-pole`, `electric-cable-spool` sau `electric-safety-rail`) và bãi máy biến áp vốn là vignette riêng của volt-town (D11). Quận điện lát `electric-steel-plate` khoảng 16×14 nối ra đường chính. Rào mở về phía nam ra đại lộ hàng 29.
- (bổ sung critic C, C2) Mở lối ra thứ 4 ở cạnh tây, offset 20 (hàng 20–39), nối route-4. Đại lộ hàng 29 chạy thẳng ra lối này. Hub thành nút bậc 4 kiểu Mauville: ↑route-3, ↓route-2, →route-7, ←route-4.
- Bỏ 2 dải nước thẳng ở hàng 22–23: phía đông thay bằng đường `electric-power-line` chạy giữa các cột tới trạm biến áp; phía quận điện thay bằng bãi máy phát. Gỡ gym lửa, mảng tro và hồ lava vuông (gym lửa chuyển sang cinder-city ở W2-9); `fire-hot-spring` và rào bazan chuyển theo.
- Nửa nam là khu dân sự (Center, Mart, department store) trên piece meadow, chỉ có 2–3 prop accent ở phố giáp quận.
- Ý tưởng mới của A: nhà ở dãy phố điện có overlay prop `trim-solar` hoặc `trim-cable` trên mái.

**W2-5. Port-city: gym nước ra mặt biển** (A10, B8, B9, C10). I/F/H 4/4/5 (B8), 3/5/4 (B9), 4.5/3.5/4.5 (A10, chấm bởi B và C; bổ sung critic C).
- Kích thước giữ 72×40. Lấn đất thêm 4–6 hàng vào vùng biển trống phía nam.
- Asset `water-quay`: autotile cạnh 4 chiều, mép cẩm thạch nhạt có 1 hàng contact tối sát nước. `pier`: dùng lại code `bridge` (nước chạy bên dưới).
- Gym đặt trên court cầu tàu cẩm thạch giáp biển qua `water-quay`. Sân trước là `water-reflecting-pool` nối ra biển bằng một kênh. Thêm bollard, 2–3 thuyền, vài phao gần cầu tàu.
- Dời lighthouse và harbour building lên cùng tuyến quay. Gỡ ao chữ nhật rời và mảng cát bị tree wall cắt.
- Tide pool (B11, phần rẻ): `water-tide-pool` (1×1 / 2×1) trên dải đá ven bờ.
- (bổ sung critic C, C10) Nửa nam đang là biển trống thành bến: cầu tàu, đê chắn và thuyền. Đê và bãi cát kéo dài sang route-8 và route-9a để các route biển bắt đầu có đất (W2-11).
- Vị trí world mới `[160,10]` (dời +16 theo W2-4). Lối ra bắc sang route-6 ở offset 8, lối nam sang route-9a ở offset 12.

**W2-6. City-a: vườn chính quy** (A11, B2). I/F/H –.
- Kích thước 48×40 → **64×40**. Vị trí world `[12,120]` → `[4,120]`. Chiều cao giữ nguyên để không đè route-1 ở y = 160. (bổ sung critic C) Sau khi route-2 dài ra ở W2-9, vị trí là **`[4,164]`** và route-1 ở y = 204.
- (bổ sung critic C, C10) Quận vườn nối ra lối bắc (route-2), là phía route-2 bắt đầu zone garden. Thêm một dãy nhà kính nhỏ dọc lối đó.
- Bỏ mảng đất nâu. Court `grass-flagstone`, fringe cỏ ba lá và hoa nhỏ. Bồn hoa xếp đối xứng thành parterre hai bên lane lá. `grass-trellis-hedge` với cổng vòm hồng có sẵn làm gate. Dời ao từ góc tây bắc về cạnh gym thành ao súng. Cặp topiary đặt cạnh tượng.
- Gym vườn phải là chỗ xanh tươi nhất map.

**W2-7. City-b: quận cẩm thạch huyền bí** (A12). I/F/H –.
- Kích thước 48×40 → **64×40**, mở rộng về phía tây: vị trí world `[12,-120]` → `[-4,-120]` để không đè route-5 ở x = 60. (bổ sung critic C) Sau khi route-3 dài ra ở W2-9, vị trí là **`[-4,-140]`**. Dành sẵn lối ra tây ở offset 20 (hàng 20–39) cho route-15b ở Wave 3.
- Bỏ mảng rêu tím. Court `psychic-marble-plaza`, một medallion `psychic-star-mosaic` 3×3 ở đầu lane. Đại lộ obelisk (một cặp mỗi 3 ô) từ cửa xuống đường chính, mỗi bên một `psychic-moon-garden`, balustrade theo D3.
- Kéo observatory về cùng trục để thành landmark thứ hai của quận. Gỡ `rock-big` giữa quảng trường.

**W2-8. Monument ở đầu lane** (B7 phần 2). I/F/H 4/5/5.
- `gym-<type>-monument`: Prop 2×2, đá trung tính, emblem theme. Đặt tại chỗ lane quận gặp đường thị trấn, thay cho fountain lặp lại ở những thị trấn có gym.

**W2-9. Giãn thế giới, mở lối tây của hub, nhà cho gym lửa** (C7, C2, một phần C3 và C11; đã sửa theo D10, D15; bổ sung critic C). I/F/H –. Effort M–L.
- Mọi thay đổi vị trí của W2-4, W2-6, W2-7 và việc dài route gộp vào **một** lần ghi `world.json`, để không phải dời map hai lần.
- route-2 24×60 → 24×100 và route-3 24×80 → 24×100. route-1 giữ 24×40 (route mở đầu, như Route 101). route-7 giữ 72×20 (D15). route-9a và route-9b dài ra để khép vòng phía nam sau khi nhánh nam dời xuống +44.
- Mới: **route-4** 120×20, theme volcano. 30 cột phía đông thuộc powerplant (cột điện thưa dần), sau đó là `fire-ash-grass`, `fire-tall-grass`, `fire-charred-tree`, các bậc `fire-ledge` một chiều, và một landmark `fire-ember-vent` ở giữa route.
- Mới: **cinder-city** 48×40, gym lửa, dựng lại từ `assets/maps/cinder-town` (32×28) ở cỡ city Gen 3. Có hồ suối nóng (`fire-hot-spring`), phố `fire-basalt-path`. Viền là `tree-wall` meadow theo W1-1; `fire-tree-wall` chỉ ở ngoại lệ mối nối D12 cạnh lối ra phía bắc (route-4b ở Wave 3). route-4 vào ở cạnh phải, offset 10.

| Map | Kích thước | Vị trí world | Trước đây | Nối (cạnh, offset trong map này) |
|---|---|---|---|---|
| hub-city | 88×64 | `[0,0]` | 72×60 `[0,0]` | ↑route-3 +24, ↓route-2 +24, →route-7 +20, ←route-4 +20 (mới) |
| route-3 | 24×100 | `[24,-100]` | 24×80 `[24,-80]` | ↑city-b, ↓hub-city |
| city-b | 64×40 | `[-4,-140]` | 48×40 `[12,-120]` | ↓route-3 +28, →route-5 +10 |
| route-5 | 132×20 | `[60,-130]` | 120×20 `[60,-110]` | ←city-b, ↓route-6 +108 |
| route-6 | 24×120 | `[168,-110]` | 24×100 `[156,-90]` | ↑route-5, ↓port-city |
| route-7 | 72×20 | `[88,20]` | 72×20 `[72,20]` | ←hub-city, →port-city |
| port-city | 72×40 | `[160,10]` | 72×40 `[144,10]` | ←route-7 +10, ↑route-6 +8, →route-8 +0, ↓route-9a +12 |
| route-8 | 72×40 | `[232,10]` | 72×40 `[216,10]` | ←port-city |
| route-9a | 24×80 | `[172,50]` | 24×60 `[156,50]` | ↑port-city, ↓isle-town |
| isle-town | 24×20 | `[172,130]` | 24×20 `[156,110]` | ↑route-9a, ↓route-9b |
| route-9b | 24×94 | `[172,150]` | 24×70 `[156,130]` | ↑isle-town, ↓route-10 |
| route-10 | 148×20 | `[48,244]` | 132×20 `[48,200]` | ←start-town, ↑route-9b +124 |
| start-town | 24×20 | `[24,244]` | 24×20 `[24,200]` | ↑route-1, →route-10 |
| route-1 | 24×40 | `[24,204]` | 24×40 `[24,160]` | ↑city-a, ↓start-town |
| city-a | 64×40 | `[4,164]` | 48×40 `[12,120]` | ↑route-2 +20, ↓route-1 +20 |
| route-2 | 24×100 | `[24,64]` | 24×60 `[24,60]` | ↑hub-city, ↓city-a |
| route-4 (mới) | 120×20 | `[-120,20]` | – | ←cinder-city, →hub-city |
| cinder-city (mới) | 48×40 | `[-168,10]` | cinder-town 32×28, chưa đặt | →route-4 +10 |

Kết quả: 18 map, hộp 472×404, 41.648 ô (khoảng 1,3 lần hiện nay), thị trấn chiếm 40% diện tích (D15). Đã kiểm: không chồng lấn, 19 cặp nối đều chạm cạnh và chung ≥ 20 ô. Vòng mới không có thêm ở đợt này; lối tây chỉ dẫn tới cinder-city (cụt) cho tới Wave 3.

**W2-10. Op `zone`: dải biome trên route giữa hai theme** (C8, đã sửa theo D13; bổ sung critic C). I/F/H –. Effort M.
- `{"op": "zone", "rect": [x, y, w, h], "theme": "<theme>", "ramp": [0.0, 0.3]}`. Trong rect, các role (`ground`, `wall`, `grass`, `tree`, `deco`) lấy piece của theme đó; border block đổi ở mép zone. `ramp` là mật độ piece theme từ đầu xa tới đầu gần thành phố.
- Lint `route-zone`: route chạm một thành phố gym phải có zone theme của thành phố đó phủ ≥ 30 hàng/cột sát thành phố, và một đoạn giữa trung tính ≥ 20 ô. Mật độ trong zone ≤ 30%.
- Áp dụng ở Wave 2: route-2 (garden → powerplant), route-3 (powerplant → mystic), route-4 (powerplant → volcano), route-7 (powerplant → lagoon), route-6 (quarry → canyon). Ở Wave 3 thêm route-4b, route-15, route-11, route-12, route-14.
- Mục tiêu: đi về phía một thành phố gym thì cây, cỏ và prop đổi trước, gym tới sau cùng.

**W2-11. Mỗi 2 màn hình một landmark trên route** (C9, gộp phần landmark của W3-5; bổ sung critic C). I/F/H –. Effort M.
- Lint `landmark-window`: mọi cửa sổ 30×20 ô của một route chứa ≥ 1 prop vai trò landmark hoặc một blob feature.
- route-1: rừng berry-tree và một ao có `bridge`. route-2: phế tích vườn `grass-rose-arch` (nửa nam), hàng `electric-power-pole` (nửa bắc). route-3: sông có `bridge-v`, rồi vòng `psychic-standing-stone` và `psychic-moon-gate` gần city-b. route-5: hố mỏ với ray minecart, `rock-geode`, `rock-menhir`. route-6: bãi `ground-hoodoo`, chỗ đào hóa thạch, ốc đảo `ground-water-trough`. route-7: trạm biến áp rồi một vịnh cát có `water-tide-rock`.
- Route biển: rạn đá, bãi cát, xác tàu, đảo nhiều hình dạng thay cho một đảo oval lặp lại. Mục tiêu 25–30% là đất như Hoenn.
- Asset mới: `shipwreck` (Prop 3×2 metatile, ramp lagoon), `rock-reef` (blob autotile 47 tile). Dùng lại `bridge`, `bridge-v`, `stairs`, `berry-tree`, `mountain`, `palm-tree` đã có trong `assets/overworld/Base`.

**W2-12. Trường `region` trong `world.json`** (C1; bổ sung critic C). I/F/H –. Effort S.
- Mỗi map có `region`. mapgen dùng nó để chọn piece theme mặc định, để tô vùng trống trong `world.png` (W1-12) và để kiểm `route-zone`. Map nằm giữa hai vùng ghi vùng chính, phần còn lại là `zone`.

| Vùng | Gym | Map (đến hết Wave 3) |
|---|---|---|
| garden (tây nam) | grass, city-a | start-town, route-1, city-a, nửa nam route-2, bloom-town |
| powerplant (trung tâm) | electric, hub-city | hub-city, nửa bắc route-2, nửa tây route-7, 30 cột đông của route-4 |
| volcano (tây, mới) | fire, cinder-city | route-4, cinder-city, route-4b, route-15, mt-ember |
| mystic (bắc) | psychic, city-b | city-b, 40 hàng bắc của route-3, starfall-town, route-15b |
| quarry (đông bắc) | rock, flint-city | route-5, flint-city, nửa bắc route-6, quarry-cavern |
| canyon (đông) | ground, dune-city | nửa nam route-6, route-14, dune-city, route-16 |
| lagoon (đông nam) | water, port-city | port-city, nửa đông route-7, route-8, route-9a, isle-town, route-9b, route-10 |
| marsh (nam, mới) | poison, fen-city | route-11, fen-city, route-12 |

### Wave 3: nhân rộng và biome

**W3-1. Template cho các thị trấn theme** (A13, C11; đã sửa theo D11). I/F/H –.
- Bản trước: cinder, bloom, dune, fen, starfall, flint, tide, volt từ 32×28 (32×30) lên 40×32. (bổ sung critic C) Bỏ, vì 40×32 không phải cỡ Gen 3. Theo D11: cinder (đã làm ở W2-9), flint, dune, fen thành **city 48×40** có gym; bloom và starfall thành **town 24×20** không gym; tide gộp vào isle-town, volt gộp vào quận nhà máy của hub-city. Vị trí ở W3-6.
- Quận gym khoảng 14×10 (dùng `gym_quarter`). Center và Mart mỗi nơi có 1–2 prop accent ở cửa (đèn brazier ở cinder, `rock-ore-crate` ở flint). Lava, quicksand, hồ độc đều là blob có bờ, không có hình vuông.
- Mỗi thị trấn có một vignette riêng không lặp lại ở nơi khác (ví dụ fen có cầu ván qua đầm; bãi máy biến áp của volt chuyển sang hub-city).
- (bổ sung critic C) Nội dung từng city: **flint-city** là thị trấn mỏ (quảng trường `rock-slate-plaza`, ray `rock-minecart`, thùng quặng, viền `tree-wall` với `rock-tree-wall` chỉ ở mối nối D12). **dune-city** là thị trấn mesa. **fen-city** có phố `poison-boardwalk` trên `poison-bog`, `poison-cattails`, `poison-mushroom-lamp`, vòng cây chết quanh quận gym. **bloom-town** là điểm chuyển garden → marsh. **starfall-town** là điểm chuyển volcano → mystic.

**W3-2. Route-6: canyon thật** (B12). I/F/H 4/4/4.
- `mesa-face`: terrain mặt vách có 2–3 dải đỏ đất dịu, ramp suy ra từ `ground-border`. Thay các phiến núi xám đang có cây xanh trên đỉnh.
- Prop: `scrub` (1×1, dùng ramp lá dry-scrub có sẵn), `bleached-rock`, `dry-grass` (dùng `tint` của W1-2) chuyển từ lawn sang cát.
- (bổ sung critic C, C4) Nửa nam route-6 mặc toàn bộ là canyon: nền `ground-dry-earth`, landmark `ground-hoodoo`, `ground-saguaro`, `ground-fossil`, không còn lawn. Nửa bắc là quarry (zone của flint-city). Nhánh route-14 rẽ ra từ cạnh phải.

**W3-3. Breakwater và foam** (B11, phần đắt). I/F/H 2/3/4. Blob đá chắn sóng có foam anim 4 frame cho port-city và isle-town (bổ sung critic C: bản trước ghi tide-town; tide gộp vào isle-town theo D11).

**W3-4. Overlay trim trên nhà** (ý tưởng mới của A). I/F/H –. Hộp hoa dưới cửa sổ ở city-a, chóp lưỡi liềm ở city-b, phao treo ở port-city. Mỗi loại là một Prop overlay 1×1, không recolor tòa nhà.

**W3-5. Route storytelling** (B, storytelling). I/F/H –. Điểm câu cá, khu cắm trại, phế tích, ô trồng berry, chòi quan sát trainer: 1 vignette mỗi route. (bổ sung critic C) Phần landmark đã kéo lên W2-11; mục này chỉ còn vignette kể chuyện, áp cho cả các route mới ở W3-6.

**W3-6. Ba vùng biome mới và ba vòng mới** (C3, C4, C6, C11; đã sửa theo D11, D15; bổ sung critic C). I/F/H –. Effort L.

Bảng dưới là phần thêm vào (hoặc thay đổi) so với bảng W2-9. Map không có trong bảng giữ vị trí W2-9.

| Map | Kích thước | Vị trí world | Vùng | Nối (cạnh, offset trong map này) | Nội dung |
|---|---|---|---|---|---|
| route-5 (đổi) | 96×20 | `[60,-130]` | quarry | ←city-b, →flint-city | ngắn lại từ 132 để chèn flint-city |
| flint-city | 48×40 | `[156,-150]` | quarry | ←route-5 +20, ↓route-6 +12 | gym đá, từ `assets/maps/flint-town` |
| route-6 (giữ) | 24×120 | `[168,-110]` | quarry → canyon | ↑flint-city, ↓port-city, →route-14 +50 | xem W3-2 |
| route-14 | 120×20 | `[192,-60]` | canyon | ←route-6, →dune-city | sa mạc: hố cát lún, tumbleweed, landmark `ground-totem` |
| dune-city | 48×40 | `[312,-70]` | canyon | ←route-14 +10, ↓route-16 +12 | gym đất, thị trấn mesa từ `assets/maps/dune-town` |
| route-16 | 24×40 | `[324,-30]` | canyon → lagoon | ↑dune-city, ↓route-8 | dốc xuống biển |
| route-8 (đổi) | 120×40 | `[232,10]` | lagoon | ←port-city, ↑route-16 +92 | rộng ra từ 72×40; rạn đá, bãi cát theo W2-11 |
| route-4b | 24×110 | `[-156,-100]` | volcano | ↓cinder-city, ↑route-15 | sườn núi lửa: đá vụn, hồ lava (blob có bờ), cửa hang warp sang mt-ember. Bắt đầu từ `assets/maps/ember-route` (24×48) |
| route-15 | 80×20 | `[-156,-120]` | volcano | ↓route-4b +0, →starfall-town | nửa đầu volcano, nửa sau rừng mystic |
| starfall-town | 24×20 | `[-76,-120]` | mystic | ←route-15, →route-15b | town không gym, từ `assets/maps/starfall-town` |
| route-15b | 48×20 | `[-52,-120]` | mystic | ←starfall-town, →city-b | vòng `psychic-standing-stone` gần city-b |
| bloom-town | 24×20 | `[48,120]` | garden | ←route-2, →route-11 | town không gym, từ `assets/maps/bloom-town` |
| route-11 | 48×20 | `[72,120]` | garden → marsh | ←bloom-town, →fen-city | khởi đầu là vườn, chuyển dần sang đầm |
| fen-city | 48×40 | `[120,110]` | marsh | ←route-11 +10, ↓route-12 +12 | gym độc, từ `assets/maps/fen-town` |
| route-12 | 24×94 | `[132,150]` | marsh | ↑fen-city, ↓route-10 | hồ gương có lily pad (surf được), mảng `poison-toxic-pool`, đảo nhỏ có item ẩn |

Map cũ có lối ra mới: route-2 →bloom-town +56, city-b ←route-15b +20, cinder-city ↑route-4b +12, route-10 ↑route-12 +84.

Vòng mới: (1) tây: hub-city, route-4, cinder-city, route-4b, route-15, starfall-town, route-15b, city-b, route-3, hub-city. (2) đông: port-city, route-6, route-14, dune-city, route-16, route-8 (Surf), port-city. (3) nam: route-2, bloom-town, route-11, fen-city, route-12, route-10, start-town, route-1, city-a, route-2. Cộng với 2 vòng có sẵn là 5 vòng trên 30 map, khoảng 1 vòng mỗi 6 map như Hoenn. Vòng nam cho khu khởi đầu một lựa chọn đường đi, giống vòng đầu tiên của Hoenn.

Kết quả: 30 map, hộp 528×414, 61.344 ô (khoảng 2 lần hiện nay), thị trấn 38% diện tích (D15). Đã kiểm bằng script: không chồng lấn, 34 cặp nối đều chạm cạnh và chung ≥ 20 ô, không có cặp nào chạm nhau ngoài ý muốn. Tọa độ của C trong C3/C4/C6 được tính trên bố cục cũ và có hai chỗ hỏng (route-15 chỉ chạm route-4b ở góc; route-6 140 ô nếu route-3 dài 120), nên bảng này thay cho tọa độ gốc của C.

**W3-7. Khối núi trong các vùng trống và hai map warp** (C5; bổ sung critic C). I/F/H –. Effort M.
- **quarry-cavern** 60×60, hang, ramp rock/quarry, prop quặng và minecart. Nối cửa hang có sẵn trên route-5 bằng warp. Ghim trên town map ở vùng trống trong vòng chính (x 48–168, y −110–20).
- **mt-ember** 40×60, đỉnh núi lửa có hồ miệng núi. Vào bằng warp từ cửa hang trên route-4b. Ghim trên town map ở vùng trống phía tây (x −132–0, y −100–20).
- Hai map warp không có tọa độ trong `maps` của `world.json`, nên không thể chồng lên map nào. Thêm vào `world.json` một danh sách `voids` có border block: `massif` (mountain/cliff 2×2) cho vùng trong vòng chính, `volcano` cho vùng quanh cinder-city, `mesa` cho vùng giữa route-6 và dune-city, `marsh` (hồ và rừng) cho phần còn trống của vùng phía nam. W1-12 đọc danh sách này khi tô `world.png`, và border trong game cũng hiện núi thay cho màu đen.

---

## 5. Tiêu chí nghiệm thu

### Lint (tự động, trong `mapgen.py build` và `check_gen3.py`)

- [ ] `check_gen3.py --quiet assets/overworld assets/structures` không lỗi với mọi asset mới.
- [ ] `frame-theme`: 100% ô tree wall viền map của các map thành phố là `tree-wall` meadow.
- [ ] `theme-area`: 10–20% ở mọi map có gym. Không map nào trên 25%.
- [ ] `door-lane`: mọi cửa gym nối liền tới đường chính, lane kết thúc bằng `threshold` hoặc cặp gatepost.
- [ ] `structure-margin` ≥ 2 ô và `frame-margin` ≥ 2 ô: 0 lỗi (hub-city contest hall, port-city gym).
- [ ] `feature-shape`: không còn feature có cạnh thẳng dài hơn 3 ô.
- [ ] `court-value`: độ sáng trung bình của fill court ≥ độ sáng lawn trừ 20% (tính theo luma). Fill không được là vùng tối nhất map.
- [ ] `vignette`: dưới 30% số prop trang trí đứng đơn lẻ (không có prop nào khác trong vòng 2 ô), không tính cây.
- [ ] `theme-gradient`: không có prop hay ground theme nào cách bbox quận gym quá `street_cells` ô, trừ landmark đã khai báo.
- [ ] (bổ sung critic C) `world-layout`: không có hai map nào trong `world.json` chồng lên nhau; mọi cặp nối chạm cạnh với nhau và chung ≥ 20 ô; không có cặp nào chạm cạnh mà không khai báo nối.
- [ ] (bổ sung critic C) `quarter-link`: mọi quận gym nối bằng `path` ra mép map.
- [ ] (bổ sung critic C) `route-zone`: mọi route chạm thành phố gym có zone theme ≥ 30 ô sát thành phố, đoạn giữa trung tính ≥ 20 ô, mật độ theme trong zone ≤ 30%.
- [ ] (bổ sung critic C) `landmark-window`: mọi cửa sổ 30×20 của route có ≥ 1 landmark.
- [ ] (bổ sung critic C) Route biển: 25–30% số ô là đất (đá, rạn, bãi cát, đảo).

### Kiểm tra bằng mắt (mỗi map, ảnh trước và sau đặt cạnh nhau)

- **Squint / grayscale:** chuyển preview sang xám rồi thu nhỏ ×0.25. Tòa gym phải là khối rõ nhất. Mảng nền dưới gym không được nổi hơn chính tòa gym.
- **Bỏ gym ra:** che tòa gym đi, phần quận còn lại (sân, tượng, rào, vignette) vẫn phải cho đoán được theme.
- **Viền:** nhìn viền map không đoán được theme của gym.
- **Chuyển tiếp:** đi từ lawn tới cửa gym phải qua đủ thứ tự lawn → lawn có đốm → curb → sân trước → bậc → cửa, không có bước nhảy màu.
- **Đối xứng:** mặt tiền gym đối xứng (tượng, đèn, gatepost). Vignette hai bên được phép lệch nhau.
- **Mở rộng có nội dung:** trên mỗi map mới mở rộng, không có vùng lawn trống nào lớn hơn 8×8 ô mà không có vignette, lối đi hay cụm cây.
- (bổ sung critic C) **Thế giới:** trong `world.png` không còn mảng đen; mỗi vùng trống đọc ra được là núi, rừng, biển hay đầm.
- (bổ sung critic C) **Đi bộ tới gym:** chụp liền các màn hình từ đoạn giữa route tới cửa gym. Thứ tự phải là cây và cỏ đổi theme trước, rồi prop, rồi quận, rồi gym. Không có gym nào lộ ra sau một dải đồng cỏ thuần.
- (bổ sung critic C) **Một gym một vùng:** không thành phố nào chứa hai gym, và không gym nào đứng trong một vùng có theme khác.

### Chấm lại

- Hai critic chấm lại hub-city, city-a, city-b, port-city và 2 thị trấn theme bằng đúng bộ tiêu chí ở mục 1. (bổ sung critic C) Critic C chấm lại `world.png` và các route bằng 5 tiêu chí của C.
- Mục tiêu sau Wave 2: integration ≥ 7, transition ≥ 7, harmony ≥ 7, storytelling ≥ 6, readability vẫn ≥ 7. Trung bình chung ≥ 7.
- Mục tiêu sau Wave 1 (chưa vẽ asset mới, chỉ sửa dữ liệu và đặt lại prop): trung bình chung ≥ 5.5. Nếu không đạt thì phải xem lại chẩn đoán trước khi sang Wave 2. (bổ sung critic C) Mục tiêu này tính trên các tiêu chí của A và B, vì Wave 1 không đổi bố cục thế giới.
- (bổ sung critic C) Mục tiêu theo tiêu chí của C: sau Wave 2, scale ≥ 5, landmark density ≥ 6, biome coherence ≥ 5; sau Wave 3, scale ≥ 6, negative space ≥ 6, biome coherence ≥ 7, loop structure ≥ 7.
