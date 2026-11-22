# Mở PR và đưa thay đổi vào `main`

Quy tắc đầy đủ (nhánh, commit, Definition of Done): [`CONTRIBUTING.md`](../../CONTRIBUTING.md). Tóm tắt:

1. Tạo nhánh từ `main`: `git switch -c feat/<việc>` (`fix/`, `chore/`, `docs/`).
2. Commit nhỏ, tiêu đề tiếng Anh thì hiện tại. Trước khi commit: `git status` không có nháp hay file sinh ra ngoài ý muốn.
3. Chạy kiểm tra ở máy:
   ```bash
   npm run lint && npm run typecheck     # nhanh
   npm run check                         # đầy đủ (Gen 3 + world + typecheck), trước PR lớn
   ```
4. `git push -u origin <nhánh>`, rồi `gh pr create`. Mô tả theo mẫu `.github/PULL_REQUEST_TEMPLATE.md`: Summary, Evidence (ảnh trước và sau, kết quả lệnh), Merge Danger, checklist DoD.
5. CI (`.github/workflows/check.yml`) phải xanh. Merge vào `main` sau khi được review.

Chưa có quy trình phát hành phiên bản riêng. Phiên bản game ghi trong `game/package.json` và `game/README.md` ("What vX has"): khi thêm tính năng lớn thì tăng `version` và thêm một mục vào README trong cùng PR.
