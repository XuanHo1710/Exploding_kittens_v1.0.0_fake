# Hang động theo vùng: sáu phương án D-I

Mục đích: mỗi District chưa có hang được thêm **một hang nhiều tầng**. Mỗi hang mang **một cơ chế chủ đạo** riêng lấy từ nghiên cứu Gen 3, để không hang nào giống hang nào. Tài liệu này nối tiếp [gen3-caves.md](research/gen3-caves.md): §4.2 của tài liệu đó là luật thiết kế, §5 là ba phương án A-C. Hai hang đã chọn làm:
- A: Hang Nguyệt Thạch, nối Route 6 (hẻm núi) với Route 7, dùng thang và hố;
- B: Động Đá Hoa, ở Route 12 (đầm lầy), dùng bóng tối và sàn nứt.

Cách xem:
- Bản vẽ và số liệu: `python3 tools/maps/cave_mock.py --variant d` (đổi chữ cho từng hang). Lệnh ghi `tmp/cave-mocks/variant-<chữ>.png`. Chạy không có `--variant` thì ghi thêm `overview.png` gồm đủ chín hang.
- Dữ liệu: `tools/maps/cave_variants.py`.
- Checker báo 0 lỗi cho mọi hang. Nó kiểm tra:
  - thang có đủ cặp;
  - mọi đồ, Trainer và NPC đều tới được;
  - lối ra tới được;
  - với câu đố: không giải thì không tới được lối ra.

Toạ độ trong tài liệu là ô Mons. Camera rộng 40 × 22 ô. Thời gian chơi ước theo cùng công thức với §5 của gen3-caves.md.

## 1. Đặt hang trên bản đồ thế giới

| Hang | District (theme) | Lối vào | Lối ra / đích | Kiểu |
|---|---|---|---|---|
| D Hầm Dung Nham | volcano | mép bắc Route 4 | mép đông Route 4b | xuyên, đường tắt vòng qua Cinder City; cuối game |
| E Mỏ Đá Bỏ Hoang | quarry | mép nam Route 5 | khu tây Flint City | xuyên, giữa game (trước gym đá) |
| F Động Băng Tinh Tú | mystic | mép nam Route 15 (đồi giữa Route 4b và Route 3) | Phòng Sao Rơi | cụt, giữa-cuối game |
| G Hang Triều Lam | lagoon | đảo đông Route 8 (phải Surf tới) | Hang Ngọc Trai | cụt, sau Surf |
| H Đường Hầm Điện Ngầm | powerplant | sân nhà máy điện, góc đông bắc Hub City | cống xả trên bờ Route 7 | xuyên, giữa game |
| I Hang Rễ Cổ Thụ | garden (giáp woods) | gốc cây cổ thụ phía bắc Bloom Town | bờ đông Route 2 | xuyên, đầu-giữa game |

Chọn chỗ theo `assets/maps/world.json`:
- Mỗi hang nằm trong khoảng trống giữa các Route của cùng District.
- D, E, F nằm ở các góc còn trống quanh vòng phía bắc.
- H lấy nhà máy điện của Hub City (theme `powerplant`).
- I lấy khoảng trống phía bắc Bloom Town, giữa Route 2 và Route 11.
- Lagoon không có đất liền trống, nên G là hang trên đảo, giống Shoal Cave.

## 2. Bảng tổng hợp

| | Tầng (ô) | Cơ chế chủ đạo | Vòng lặp | TR | Đồ | Thời gian |
|---|---|---|---|---|---|---|
| D | 1F, B1F 96×44; B2F 40×30 | đẩy đá Strength xuống dung nham, lấp thành lối | hai đường tới sảnh tây B1F | 9 | 10 | ~16 phút |
| E | 1F, B1F 88×48; B2F 36×26 | xe goòng một chiều nối các túi | xe A về sảnh; xe "về nhà" ở 1F | 7 | 10 | ~13 phút |
| F | 1F, B1F 80×44; B2F 36×26 | sàn băng trượt tới khi gặp tinh thể | gờ một chiều về 1F | 5 | 8 | ~15 phút |
| G | 1F, B1F 80×44; B2F 36×24 | thuỷ triều thấp / cao | hầm ngầm thứ hai (chỉ khi triều thấp) | 6 | 10 | ~13 phút |
| H | 1F 36×24; B1F, B2F 88×44 | cần gạt đảo cổng điện; B1F tối | thang 3 (bắt buộc sau lần gạt đầu) | 7 | 7 | ~20 phút |
| I | 1F, B1F 80×44; B2F 36×24 | mê cung gờ rễ một chiều bốn hướng | C → E → SE → sảnh | 5 | 10 | ~15 phút |

Mọi hang giữ luật §4.2:
- 3 tầng; hai tầng cùng cỡ thì thang trùng (x, y);
- tầng cuối nhỏ (1-1.4 màn) chứa phần thưởng hoặc cốt truyện;
- mỗi ngõ cụt có đồ;
- HM (Surf, Rock Smash, Cut) chỉ chặn nhánh phụ. Strength và cơ chế riêng của hang được phép chặn đường chính.

## 3. Từng hang

### D · Hầm Dung Nham (núi lửa)

- **Ý tưởng:** sông dung nham cắt ngang mọi hành lang. Đẩy một tảng đá Strength vào dung nham thì ô đó thành sàn và mở một lối qua. Đây là câu đố Victory Road của phương án C cũ, đổi công tắc thành dung nham.
- **Luồng:**
  - 1F: từ sảnh vào, có hai cách qua sông:
    - đẩy đá 1 lấp ô F1 rồi tới sảnh tây, xuống thang 1;
    - hoặc xuống thang 2 ở đông bắc, đi B1F về phía tây, đẩy đá 2 lấp ô F2.
  - Hai đường gặp nhau ở sảnh tây B1F. Đá 3 lấp ô F3 nằm trên **mọi** đường tới lối ra. Sau đó lên thang 3 vào túi tây bắc 1F và ra Route 4b.
- **Phần thưởng:**
  - B2F "Lõi núi": hồ dung nham có đảo vật phẩm. Đẩy đá 4 (tuỳ chọn) để bắc cầu ra đảo.
  - NPC Nhà địa chất cho Đá Lửa.
  - Nhánh 1F có đá Rock Smash, sau đó là vật phẩm.
- **Trang trí:** lỗ phun nhiệt phun theo nhịp. Ở bản mock nó không chặn đường.

### E · Mỏ Đá Bỏ Hoang (mỏ đá)

- **Ý tưởng:** B1F là tầng túi (§2.2 mẫu 4), 16% ô đi được. Ba túi chỉ nối với nhau bằng **xe goòng một chiều**: bước lên xe ở đầu ray, xe chạy tới cuối ray.
- **Luồng:**
  - Ở túi P1 có hai xe:
    - xe A tới túi P2: có vật phẩm và thang 3 về sảnh 1F (vòng lặp);
    - xe B tới túi P3: thang 2 lên túi lối ra 1F, ra Flint City.
  - Ở túi lối ra 1F có xe thứ ba chạy một chiều về sảnh vào (đường tắt về).
- **Phần thưởng:**
  - Rock Smash chắn hai nhánh có mạch quặng (vật phẩm ẩn).
  - B2F "Hầm quặng cũ": Thợ mỏ già cho TM.

### F · Động Băng Tinh Tú (huyền bí)

- **Ý tưởng:** sàn băng như Ice Room của Shoal Cave hay Ice Path: người chơi trượt tới khi gặp tinh thể hoặc vách đá. Đứng yên trên băng thì đổi được hướng.
- **Luồng:**
  - 1F có sân băng nhỏ 12×8 để dạy luật, lời giải ngắn nhất 5 lần trượt. Một NPC giải thích luật.
  - B1F có sân lớn 20×14 chắn lối xuống, lời giải ngắn nhất 9 lần trượt.
  - Sau sân lớn, một gờ một chiều nhảy sang phía đông. Ở đó có phần thưởng và thang 2 về 1F: vòng về một chiều.
- **Cách làm câu đố:** hai sân băng do tìm kiếm ngẫu nhiên đặt tinh thể. Lời giải dùng đúng luật trượt của `cave_mock.py`, nên checker vẽ lại được đường trượt.
- **Đích:** B2F "Phòng Sao Rơi" có Nhà thiên văn. Tinh thể gương chỉ để trang trí.

### G · Hang Triều Lam (đầm biển)

- **Ý tưởng:** thuỷ triều theo giờ của Shoal Cave (`UpdateShoalTideFlag`): triều cao lúc 00-02, 09-14 và 21-23 giờ. Mức triều chỉ đổi khi người chơi bước vào hang từ ngoài trời. Cùng một hình phòng có hai trạng thái:
  - **triều thấp:** bãi là cát đi bộ được; các hầm ngầm mở;
  - **triều cao:** bãi là nước (Surf); nước dâng tới các thềm đá, Surf lên được.
- **Luồng:** đường chính qua bãi lớn 1F, thang 1 xuống B1F rồi thang 2 xuống B2F. Đi được ở **cả hai** mức triều; checker kiểm tra cả hai.
- **Phần thưởng:**
  - 3 vật phẩm chỉ lấy được khi triều cao (trên thềm);
  - 2 vật phẩm chỉ lấy được khi triều thấp (sau hầm ngầm B1F).
  - Đó là lý do để quay lại vào giờ khác. Ngư dân ở sảnh cho biết lịch triều.
- **Vòng lặp:** hầm ngầm phía đông 1F (chỉ mở khi triều thấp) dẫn tới thang 3, đi đường thứ hai xuống B1F.
- **Đích:** B2F "Hang Ngọc Trai", có Cô gái lặn.

### H · Đường Hầm Điện Ngầm (nhà máy điện)

- **Ý tưởng:** mỗi cần gạt **đảo mọi cổng cùng số**: cổng này mở thì cổng kia đóng. Ý tưởng giống gym Sunyshore (Gen 4), dựng trên logic công tắc và rào của FR Victory Road.
  - B1F tối, chỉ sáng quanh đèn máy phát; có Flash thì dễ hơn.
  - Mọi cần gạt nằm ở B2F, là tầng sáng, để không có câu đố khó trên tầng tối (luật 6).
- **Lời giải (3 lần gạt):**
  1. Xuống thang 2, qua G0 (đang mở) vào sảnh máy phát. Gạt L0: G0 ở B1F mở; G0 ở B2F đóng sau lưng, nên phải đi thang 3. Đây là vòng lặp bắt buộc, dạy luật.
  2. Qua G0 ở B1F, xuống thang 4 sang phòng đông B2F. Gạt L0 lần nữa để mở G0 phía đông.
  3. Gạt L1: G1 ở B1F mở. Đi lối ra cống xả.
- **Phần thưởng:**
  - phòng phụ B1F sau đá Rock Smash;
  - đảo trong hồ nước ở B2F (Surf).

### I · Hang Rễ Cổ Thụ (vườn hoa)

- **Ý tưởng:** 1F là lưới 3 × 3 buồng rễ. Phần lớn hành lang có **gờ rễ một chiều**, nhảy theo hướng bắc, nam, đông hoặc tây. Đây là gờ nhảy của Mt. Moon B2F và Meteor Falls, mở rộng thành mê cung.
- **Luồng:**
  - Đọc mũi tên để tới thang 1 ở tây bắc: sảnh → C → E → NE → N → NW.
  - Nhảy sai từ N thì rơi về C, rồi vòng C → E → SE → sảnh.
  - B1F là vườn ngầm có hồ (Surf ra đảo lấy vật phẩm). Một gờ rễ một chiều về phía tây dẫn tới thang 2, lên buồng lối ra 1F và ra Route 2.
  - Đi từ Route 2 vào thì chỉ quay ra được, vì gờ chặn lối đi ngược.
- **Phần thưởng:**
  - dây leo (Cut) chắn túi phía tây nam 1F và lối xuống B2F "Rễ Mẹ" (3 vật phẩm);
  - nhiều vật phẩm ẩn.

## 4. Piece và tính năng engine cần thêm

Gộp theo hang, mỗi thứ chỉ ghi một lần. Cơ sở chung của mọi hang đã có trong gen3-caves.md §4.3-§4.4: `kind: cave`, spec nhiều tầng, thang, sàn và vách hang.

| Cần thêm | Loại | Hang |
|---|---|---|
| bộ sàn và vách theo theme: đá bazan nóng, vách mỏ có giằng gỗ, băng tinh thể, đá biển ướt, bê tông và ống dẫn, đất có rễ | piece (autotile) | D E F G H I |
| dung nham (autotile, `-anim`) + ô dung nham đã lấp đá | piece | D |
| lỗ phun nhiệt (Prop `-anim`) | piece | D |
| tảng đá Strength + đẩy đá | piece + engine | D (dùng chung với C) |
| ô "đá lấp dung nham": đá biến mất, ô đổi thành sàn, lưu cờ | engine | D |
| ray xe goòng (thẳng, góc) + xe goòng | piece | E |
| đi xe goòng: lên ở đầu ray, chạy theo đường ray tới cuối, một chiều | engine | E |
| mạch quặng (Prop) | piece | E |
| sàn băng (autotile) + khối tinh thể chặn đường + tinh thể gương | piece | F |
| trượt băng (MB_ICE: trượt tới khi gặp vật cản) | engine | F |
| bãi triều cát / nước, hầm ngầm, thềm đá | piece (hai bộ layout) | G |
| cờ thuỷ triều theo giờ + đổi layout khi bước vào (`setmaplayoutindex`); Surf lên thềm | engine | G |
| cổng điện (mở / đóng, `-anim`), cần gạt, đèn máy phát | piece | H |
| cần gạt đảo bit, cổng đọc bit (nhiều tầng dùng chung cờ) | engine | H |
| mặt nạ tối có nguồn sáng cố định (đèn) ngoài vòng Flash | engine | H (mở rộng mặt nạ tối của B) |
| gờ nhảy bốn hướng (`jump` N/E/W ngoài S) | piece + engine | F I |
| dây leo Cut (Prop chặn đường) | piece + engine | I |
| hoa và cây vườn ngầm | piece | I |

## 5. Slug, theme và cấp độ (đã chốt cho bản dựng)

Mỗi hang là một nhóm map `assets/maps/<tiền tố>-<tầng>/` (tầng `1f`, `b1f`, `b2f`), `kind: cave`, `cave.group` = tiền tố. Theme trong `tools/maps/themes.json` đã điền đủ role (sàn, vách, mặt vách, gờ bốn hướng, thang, nước, hố, lối ra, trang trí, miệng hang và mọi role cơ chế), cảnh chiến đấu là District `<style>-cave` trong `assets/battle-scenes/`. Bảng gặp Pokémon ở `data/world/pokemon-spawns.json` `map_spawns`, khoá theo slug tầng.

| Hang | Tiền tố slug | Theme | Hệ Trainer (`CAVE_TYPES`) | Cấp Trainer 1F (`CAVE_LEVEL`, +2 mỗi tầng xuống) | Pokémon hoang dã | Bảng thêm |
|---|---|---|---|---|---|---|
| I Hang Rễ Cổ Thụ | `root-cave-` | `garden-cave` | grass, bug, poison | 12 (sau gym 1) | 10-18 | `water` B1F |
| F Động Băng Tinh Tú | `frost-cave-` | `mystic-cave` | ice, psychic, water | 18 (sau gym 2) | 15-21 | — |
| H Đường Hầm Điện Ngầm | `power-tunnel-` | `powerplant-cave` | electric, poison | 21 (trước gym 3) | 19-26 | `smash` B1F, `water` B2F |
| E Mỏ Đá Bỏ Hoang | `old-mine-` | `quarry-cave` | rock, ground, fighting | 25 (trước gym 5) | 22-29 | `smash` 1F, B1F |
| G Hang Triều Lam | `tide-cave-` | `lagoon-cave` | water, ice | 30 (sau Surf, 4 huy hiệu) | 28-35 | `water` mọi tầng |
| D Hầm Dung Nham | `magma-cave-` | `volcano-cave` | fire, rock, ground | 40 (trước gym 8) | 35-44 | `smash` 1F |

Ghi chú cho người dựng:
- Đá Rock Smash: đặt `prop smash-rock` (hoặc op `smash_rock`); ảnh lấy từ role `@smash` của theme (`<style>-cave-smash-rock`). Bảng `smash` (`<slug>:smash`, tỉ lệ 20, 12 ô land) chỉ có ở các tầng ghi trên; tầng khác dùng bảng `cave`.
- Cut ở I: `prop cut-tree` hoặc op `cut_tree`; theme `garden-cave` vẽ bằng `garden-cave-vine`.
- G: op `tide` với `t: "@tidewater"` (`lagoon-cave-tide-water`); bãi triều thấp vẽ bằng `@tidesand`, thềm bằng `@shelf`. Bảng gặp Pokémon chưa tách theo triều: một bảng `cave` và một bảng `water` cho mỗi tầng.
- H: role `@gate` / `@lever` chỉ có một ảnh mỗi theme (`powerplant-cave-gate-0-*`, `-lever-0-*`); cổng bit 1 và cổng ngang (`gate-h-*`) dùng chung ảnh đó cho tới khi engine chọn ảnh theo bit.
- E: role `@rail` là connector `quarry-cave-rail`, đặt thành ô fence nên ray tự nối góc; `@cart` là `quarry-cave-cart` (xe ngang) cho mọi hướng.
- Chưa có ảnh `@switch` (công tắc Strength) cho theme nào: hang D-I không dùng công tắc; dùng thì sẽ hiện ô màu tạm.

## 6. Thứ tự làm đề xuất [SUY RA]

Mỗi bước thêm một tính năng engine, dựa trên những gì đã có:

1. **I** chỉ cần gờ bốn hướng và Cut. Gần như không đụng engine, hợp với hang sớm nhất.
2. **E**: xe goòng là một warp chạy theo ray, có hoạt ảnh.
3. **H**: cần gạt và cổng là cờ đổi metatile, cùng cơ chế với công tắc của C.
4. **D**: đá Strength và ô lấp. Làm sau C.
5. **F**: trượt băng.
6. **G**: thuỷ triều cần đồng hồ trong game và hai layout.
