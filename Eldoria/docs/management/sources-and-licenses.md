# Sources, Design References & Licensing Policy

**Trạng thái**: Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19

---

## 1. Chính sách Bản quyền & Tài sản Trí tuệ (IP & Asset Policy)

Tuân thủ Nguyên tắc V và VIII của [Constitution](../../.specify/memory/constitution.md):

1. **Tự tạo 100% nội dung nguyên bản**: Toàn bộ cốt truyện, địa danh, tên nhân vật, kỹ năng, quái vật, boss, vật phẩm, lời thoại và bản thiết kế của *Eldoria: Forgotten Wilds* là tài sản nguyên bản được sáng tạo mới cho dự án này.
2. **Không tải asset chưa xác minh giấy phép từ Internet**: Không lấy sprite, tileset, âm thanh, nhạc nền hay font thương mại từ các nguồn bên thứ ba chưa được xác nhận giấy phép thương mại (CC0, MIT, SIL OFL, hoặc hợp đồng sở hữu riêng).
3. **Không sử dụng dịch vụ bên thứ ba (Zero Third-Party Services)**: Không nhúng Google Fonts CDN, FontAwesome CDN, S3, Firebase hay thư viện yêu cầu API key trả phí vào mockup hay ứng dụng. Toàn bộ mockup thiết kế đều tự chứa (self-contained HTML/CSS/SVG/Canvas) và sử dụng font hệ thống monospace/pixel fallback cục bộ.
4. **Concept Art minh họa thiết kế**: Các hình ảnh concept pixel art được tạo nội bộ qua công cụ tạo ảnh cục bộ của phiên làm việc chỉ dùng làm **visual reference / Art Bible concept** trong giai đoạn thiết kế; tài sản sprite production phải được họa sĩ pixel art vẽ/chỉnh tay theo đúng lưới pixel chuẩn (`32x32`, `48x64`, `128x128`) hoặc mua/ký hợp đồng bản quyền hợp lệ.

---

## 2. Nguồn Tham khảo Triết lý Thiết kế (Non-IP Inspiration Only)

| Danh mục | Nguồn tham khảo | Mục đích tham khảo | Ranh giới pháp lý |
| :--- | :--- | :--- | :--- |
| Farming & Life-Sim Loop | *Stardew Valley* (ConcernedApe) | Nhịp tưới tiêu, mùa vụ, hạnh phúc động vật, cảm giác sở hữu trang trại | Chỉ tham khảo cơ chế gameplay; không sao chép tên cây, NPC hay đồ họa |
| Sandbox Progression & Exploration | *Terraria*, *Core Keeper*, *Minecraft* | Chuỗi khai thác → luyện kim → hạ boss mở vùng mới, xây dựng căn cứ | Tự thiết kế hoàn toàn hệ sinh thái, nguyên liệu và cấu trúc công trình |
| Action Combat Feel | *Hades* (Supergiant Games) | Anticipation, impact frame, hit-stop, dodge i-frame, telegraph rõ ràng | Tự thiết kế toàn bộ 60 kỹ năng, hitbox và cơ chế phá giáp |
| Multiplayer RPG & Class Identity | *Ragnarok Online*, *MapleStory*, *Albion Online* | Bản sắc class, cộng đồng làng trung tâm, liên kết kinh tế nghề nghiệp | Tự thiết kế 8 class, 12 nhân vật và nền kinh tế tự cung |
| Elemental & Collection System | *Genshin Impact* | Phản ứng nguyên tố và cấu trúc banner/pity minh bạch | Tự thiết kế bảng 9 nguyên tố và Gacha 100% tiền tệ trong game |

---

## 3. Giấy phép Công nghệ Mã nguồn Mở Dự kiến cho Giai đoạn Triển khai

Tất cả công nghệ đề xuất đều là phần mềm mã nguồn mở có giấy phép thân thiện thương mại và chạy **100% tự chủ (self-hosted, không dịch vụ bên thứ 3)**:

| Thành phần | Công nghệ | Giấy phép | Vai trò |
| :--- | :--- | :---: | :--- |
| Frontend UI | React, Vite, TypeScript, Zustand, Tailwind CSS | MIT / Apache-2.0 | Giao diện HUD, màn hình menu, quản lý trạng thái UI |
| Game Engine 2D | Phaser 3 | MIT | Render pixel-perfect, Y-sorting, sprite animation, camera |
| Map Editor Format | Tiled Map Editor (`.tmj` / `.json`) | GPL/BSD (định dạng JSON mở) | Thiết kế bản đồ tile, collision, spawn marker |
| Backend & Game Server | Node.js, NestJS, TypeScript, Socket.IO / `ws` | MIT | Modular monolith, vòng lặp 20 Hz, `JsonDatabaseEngine` |
| Validation & Schema | Zod hoặc Ajv (JSON Schema) | MIT | Xác thực schema `game-data/*.json`, DB JSON và payload mạng |
| Password Hashing | Node.js built-in `crypto.scrypt` hoặc `argon2` | MIT | Băm mật khẩu cục bộ không cần dịch vụ auth bên thứ 3 |
| Testing | Vitest, Jest, Playwright | MIT / Apache-2.0 | Kiểm thử đơn vị, tích hợp, E2E và visual regression |
| Font đề xuất cho Production | *Press Start 2P*, *Silkscreen* hoặc *VT323* (tải file `.woff2` đặt cục bộ, KHÔNG dùng CDN) | SIL OFL 1.1 | Hiển thị chữ pixel tiếng Anh/số; ghép kèm font pixel hỗ trợ đầy đủ tiếng Việt (`Fusion Pixel` / `Cubic 11` / `Pixelify Sans` SIL OFL lưu cục bộ) |

---

## 4. Nguồn Dữ liệu Kiểm chứng Thực tế Trong Workspace

- **Môi trường kiểm chứng**: Node.js `v22.20.0` (chạy cục bộ trong workspace).
- **Script kiểm chứng & mô phỏng**: `tools/design-validation/` (tạo riêng cho giai đoạn thiết kế, hoàn toàn độc lập với mã nguồn production).
- **Công cụ Spec Kit**: Spec Kit `v1.4.2` (`.specify/` và `.agents/skills/speckit-*`).
