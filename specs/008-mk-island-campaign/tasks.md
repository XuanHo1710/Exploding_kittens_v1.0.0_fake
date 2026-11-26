# Công việc Chiến dịch Quần đảo Chuông Gió

Nguồn [đặc tả](spec.md), [kế hoạch](plan.md), [mô hình](data-model.md) và [hợp đồng](contracts/campaign.md).

## Pha 1 · Pha thiết kế

- [x] T001 [US1] Dựng năm nền vào `database-mighty-knight-pixel/campaign/maps/` và lưu tọa độ lane trong `database-mighty-knight-pixel/campaign/campaign.json`.
- [x] T002 [US2] Dựng catalog wave, cửa spawn, Crest, tuyển và nâng cấp trong `database-mighty-knight-pixel/campaign/campaign.json`.
- [x] T003 [US3] Xuất 12 sprite strip cùng sáu dải hiệu ứng tại `database-mighty-knight-pixel/campaign/art/`.
- [x] T004 [US1] Hiển thị bản đồ và luồng xem ngoại tuyến trong `database-mighty-knight-pixel/campaign/index.html`.
- [x] T005 [US3] Kiểm diện giới hạn 10–15 frame, hình học sân, nhóm spawn, điều kiện boss và thưởng theo `database-mighty-knight-pixel/campaign/validate-design.py`.

## Pha 2 · Nền tảng tích hợp

- [x] T006 Chạy hồi quy config, phòng và chế độ cũ trong `server/test/mk-e2e-socket.test.cjs` và `server/test/mk-mechanics.test.cjs`.
- [x] T007 Thêm hợp đồng Chiến dịch dùng chung tại `shared/src/mk/campaign.ts` và lối vào solo tách khỏi phòng cược trong `client/src/App.tsx`.
- [x] T008 Ghi tiến trình nguyên tử theo tài khoản ở `server/src/store/db.service.ts` và `server/src/game/mk/campaign-progress.ts`. Kiểm thử cạnh tranh cùng revision ở `server/test/mk-campaign-socket.test.cjs`.

## Pha 3 · US1 Duyệt và vào sân

- [x] T009 [US1] Nối camera 640×360 và bounds tại `client/src/mk/campaign-render.ts` và `server/src/game/mk/campaign-battle.ts`.
- [x] T010 [US1] Preload nền và sprite theo catalog ở `client/src/mk/campaign-render.ts`. Kiểm định khung ảnh bằng `database-mighty-knight-pixel/campaign/validate-design.py`.

## Pha 4 · US2 Thắng, hồi phục và nâng cấp

- [x] T011 [US2] Kiểm tra năm wave, replay, thưởng trùng, mở khóa và cấp 99 trong `server/test/mk-campaign.test.cjs`.
- [x] T012 [US2] Xử lý nhóm spawn, pha boss, kết quả wave và replay trong `server/src/game/mk/campaign-battle.ts`.
- [x] T013 [US2] Nối load, deploy, switch, upgrade và phục hồi kết nối ở `server/src/game/game.gateway.ts` và `server/src/game/mk/campaign.service.ts`.
- [x] T014 [US2] Nối UI trại, đội, chỉ số, kỹ năng, thưởng và thử lại tại `client/src/components/MkCampaignBoard.tsx`.

## Pha 5 · US3 Chiến đấu và nghiệm thu

- [x] T015 [US3] Ánh xạ actor, combo, VFX và ba telegraph tại `server/src/game/mk/campaign-battle.ts` và `client/src/mk/campaign-render.ts`.
- [x] T016 [US3] Chạy trình duyệt từ lobby qua cả năm wave, nâng stat và rank, rồi tải lại tiến trình. Ghi kết quả ở `specs/008-mk-island-campaign/analysis.md`.
- [x] T017 Chạy build, kiểm thử tương thích, viewport desktop/mobile và phục hồi phiên theo `specs/008-mk-island-campaign/analysis.md`.
