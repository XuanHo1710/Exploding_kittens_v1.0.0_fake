# Đối chiếu thiết kế Quần đảo Chuông Gió

**Ngày kiểm tra** 2026-11-25 · **Phạm vi** Bản duyệt, catalog và tích hợp chương Đồng cỏ.

## Kiểm định triển khai

| Kịch bản | Kết quả thực tế |
| --- | --- |
| `npm run build --prefix client` và `npm run build --prefix server` | Đều thành công. Vite có cảnh báo kích thước bundle và ảnh CSS Miragine có đường dẫn runtime. |
| Bộ kiểm thử Mighty Knight `server/test/mk-*.test.cjs` | 19/19 đạt. Có kiểm thử Socket.IO bằng tài khoản cô lập, wave 1 thật, hai lệnh nâng cùng revision, kết nối lại, combat legacy và các file ảnh. |
| Simulation đủ năm wave | Qua năm wave, boss chuyển đúng ba pha, tuyển đủ sáu tướng. Replay cấp XP thấp hơn. Bài kiểm thử chạy tới cấp 99 và hạng 5 rồi xác nhận trần. |
| Chrome headless 1280×900 | Từ Hub tạo phòng Mighty Knight, vào Chiến dịch từ lobby, điều khiển qua phím và thắng cả năm wave. Đã cộng Sinh lực, nâng kỹ năng Arden lên hạng 2, tải lại trang và vào từ Hub để kiểm tra checkpoint. Không có lỗi JavaScript trong lượt kiểm thử. |
| Chrome 390×844 | Không tràn ngang khi mở lại trại sau khi thắng đảo. |

Tài khoản trong các lượt tự động nằm trong kho fixture của tiến trình kiểm thử. Độ khó và thời lượng mục tiêu vẫn cần playtest bằng người chơi.

## Đối chiếu buổi thiết kế

| Yêu cầu | Tác vụ và bằng chứng |
| --- | --- |
| FR-001 · Năm sân | T001, T004, T009, T010. Năm nền load từ file, tọa độ cửa và dải chân đúng biên, đã đối chiếu bằng mắt ở cả năm ảnh. |
| FR-002 · Năm wave | T002, T005, T011, T012. Đạt thứ tự wave, nhóm spawn, maxAlive, quái mới và gate trùm. |
| FR-003 · Roster | T002, T013, T014. Chrome mô phỏng đủ năm mốc mở tướng và giới hạn ba người. |
| FR-004 · Nâng cấp | T002, T008, T014. Chrome xác nhận trừ 20 Crest sau clear đầu và nhánh bị khóa khi Crest còn 5. |
| FR-005 · Hình và telegraph | T003, T005, T015, T016. 12 strip, sáu strip VFX 8 frame, alpha 0/255, từng frame có vùng trống viền. Trang duyệt chọn được ba mẫu telegraph. |
| FR-006 · Giao dịch và phục hồi | T008, T011, T012, T013. Hợp đồng đã mô tả idempotency và reconnect. Chờ kiểm thử runtime. |
| FR-007 · Tương thích mode | T006, T007, T017. Kế hoạch ưu tiên test regression của hai mode hiện tại trước khi nối lobby. |
| FR-008 · Bản duyệt | T004, T005. Trang mở bằng file, đã chạy luồng đạt ở 1100×950 và kiểm ngang tại 390×844. |

`validate-design.py` xác nhận 5 bản đồ, 5 wave, 6 tướng, 5 quái thường/tinh anh, 1 trùm, 12 sprite strip, 6 VFX và 235 Crest. Sau khi sửa giới hạn viền và tách pose trùng, các frame đều đạt. Bản duyệt ngoại tuyến có test Chrome riêng và ảnh chụp từ phiên trình duyệt.

Trong phạm vi thiết kế ban đầu, 8/8 yêu cầu có đường truy vết và 0 xung đột nghiêm trọng. Checklist yêu cầu đã duyệt 6/6 mục của đặc tả. Checklist tùy chỉnh có 7 mục dành cho người duyệt. Người dùng yêu cầu chuyển sang triển khai trong lượt tiếp theo.

Áp dụng các bước Spec Kit trực tiếp từ SKILL.md và chạy resolver, prerequisite, setup-plan và setup-tasks với `SPECIFY_FEATURE_DIRECTORY=specs/008-mk-island-campaign` và `SPECIFY_FEATURE_NO_PERSIST=1`. Bước constitution đối chiếu phạm vi Astral Expedition với các yêu cầu chung áp dụng xuyên monorepo cho Mighty Knight.
