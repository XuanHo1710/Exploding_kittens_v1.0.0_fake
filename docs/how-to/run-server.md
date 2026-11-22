# Chạy máy chủ online và sao lưu dữ liệu

Máy chủ online (`server/`, decisions.md §24) phục vụ bản build của game và WebSocket `/ws` trên **một cổng** (8790), nên một link Cloudflare quick tunnel là đủ cho cả trang lẫn kết nối. Dữ liệu người chơi nằm trong SQLite `server/data/mons.db` (gitignore, không bao giờ commit).

## Chạy thử ở máy

```bash
npm ci                    # ở gốc repo: cài ws cho workspace server
npm run assets            # nếu asset game đổi
npm run server            # build client vào game/dist rồi chạy node server/main.ts (http://127.0.0.1:8790)
npm run server:only       # chỉ chạy máy chủ (client đã build)
npm run check:server      # kiểm tra tự động: hai client giả lập (đăng ký, đăng nhập, lưu / tải, thấy nhau, chat, đăng xuất, giới hạn)
node server/test/shots_online.ts [thư mục client]   # chụp màn hình hai trình duyệt thấy nhau → tmp/report/online/
node server/test/shots_rename.ts [thư mục client]   # đặt tên lần đầu + đổi tên trong CÀI ĐẶT, người kia thấy tên mới → tmp/report/rename/
```

Chơi online khi đang dev: chạy máy chủ (cổng 8790), rồi `npm run dev` và mở `http://localhost:5173/?online` (Vite chuyển `/ws` sang 8790). Không có `?online` thì bản dev chơi offline như trước (không lưu).

Biến môi trường: `MONS_PORT` (8790), `MONS_HOST` (127.0.0.1), `MONS_DATA_DIR` (`server/data`), `MONS_DIST` (`game/dist`; trỏ vào một bản build cố định để các agent khác build lại `game/dist` mà không ảnh hưởng người đang chơi).

## Chạy cho mọi người (tmux `mons-play` + tunnel)

Máy chủ chạy trong tmux session **`mons-play`** (không đụng session `mons` khác của người dùng):

| Cửa sổ | Lệnh | Ghi chú |
|---|---|---|
| `mons-play:server` (0) | `MONS_DIST=tmp/play-online node server/main.ts 2>&1 \| tee tmp/server.log` | thư mục làm việc = gốc repo |
| `mons-play:tunnel` (1) | `cloudflared tunnel --url http://127.0.0.1:8790 --no-autoupdate` | giữ nguyên để link không đổi |

Cập nhật bản đang chạy (link tunnel giữ nguyên), từ gốc repo:

```bash
npm run assets
cd game && npx vite build --outDir ../tmp/play-online --emptyOutDir && cd ..
tmux respawn-window -k -t mons-play:server -c "$PWD" 'MONS_DIST=tmp/play-online node server/main.ts 2>&1 | tee tmp/server.log'
curl -s https://<link-tunnel>/healthz      # "ok"
```

Nếu `python3` của shell không có Pillow (`npm run assets` báo `No module named 'PIL'`), chạy `assets` bằng Python đi kèm agy (`MONS_AGY_PY`, [commands.md](../reference/commands.md#biến-môi-trường)) và thư viện `tools/pokemon/.pydeps`:

```bash
mkdir -p tmp/shim && ln -sf "$MONS_AGY_PY" tmp/shim/python3     # MONS_AGY_PY = python của agy (xem commands.md)
PATH="$PWD/tmp/shim:$PATH" PYTHONPATH="$PWD/tools/pokemon/.pydeps" npm run assets
```

Người đang chơi bị ngắt vài giây; game tự kết nối lại, đăng nhập lại bằng phiên đã nhớ và gửi phần chưa lưu. Xem log: `tmux attach -t mons-play` (thoát: `Ctrl-b d`) hoặc `tmp/server.log`. Link tunnel nằm trong log của cửa sổ `tunnel`; gửi cho người dùng, không ghi vào repo.

## Bộ nhớ đệm trình duyệt (tải nhanh lần sau)

Lần đầu trình duyệt tải toàn bộ game (~17 MB, ~3000 file); từ lần sau game tải từ máy người chơi, gần như không dùng mạng:

- **Service worker** (`game/public/sw.js`, đăng ký trong `game/src/sw.ts`, chỉ ở bản build, không chạy với `npm run dev`): giữ trang và mọi file game trong Cache Storage. Lúc build, `game/vite.config.ts` ghi `asset-manifest.json` (mỗi file + hash nội dung) và mã build vào `sw.js`. Bản deploy mới = service worker mới: nó chỉ tải lại các file có hash đổi, nhận trang ngay, trang hiện "Có bản cập nhật, đang tải lại…" rồi tải lại. Không bao giờ đụng `/ws`, `/healthz`.
- **Máy chủ** (`server/static.ts`): ETag = hash nội dung (giống `asset-manifest.json`, nên build lại mà file không đổi thì ETag giữ nguyên), 304 cho `If-None-Match` (cả ETag yếu `W/` mà Cloudflare tạo) và `If-Modified-Since`; `assets/index-<hash>.js|css` cache 1 năm (`immutable`), còn lại `no-cache` (luôn hỏi lại bằng ETag, để không trộn hai bản build); JSON / JS / CSS / HTML nén brotli hoặc gzip một lần rồi giữ trong RAM, PNG / OGG gửi nguyên.

Kiểm tra nhanh: `curl -sI -H 'Accept-Encoding: br' http://127.0.0.1:8790/assets/mons/mons.json` (có `ETag`, `Content-Encoding: br`). Xoá cache trên một máy: DevTools → Application → Storage → Clear site data (iPhone: Cài đặt → Safari → Nâng cao → Dữ liệu trang web).

## Quản lý tài khoản

```bash
node server/main.ts --list                      # tài khoản (tên đăng nhập, display_name = tên nhân vật mọi người thấy) + lần lưu mới nhất
node server/main.ts --set-password <tên>        # mật khẩu mới, gõ ở dòng nhắc (không để trong lịch sử shell); đăng xuất mọi phiên cũ
node server/main.ts --ban <tên>                 # khoá; --unban <tên> để mở
MONS_DIST=tmp/play-online node server/main.ts --set-avatar <tên> <slug|none>   # cố định nhân vật (sprite) của một tài khoản
```

`--set-avatar` (decisions.md §24) sao lưu cơ sở dữ liệu vào `server/data/backups/` trước, kiểm tra slug có trong `players.json` của bản build (`MONS_DIST`, nên đặt cùng thư mục bản đang chạy), ghi vào `audit`. Máy chủ đang chạy đọc lại sau ≤ 3 giây: người chơi đang online thấy nhân vật mới ngay (không cần đăng nhập lại), người cùng map cũng thấy; mọi lần lưu sau đó đều bị ép về nhân vật này. `none` bỏ cố định (người chơi giữ nhân vật hiện tại, chọn lại được khi chơi mới).

Các lệnh này mở cùng file dữ liệu, chạy được khi máy chủ đang chạy (SQLite WAL). Tài khoản bị khoá đang chơi sẽ bị ngắt ở lần kết nối sau.

## Sao lưu và khôi phục

```bash
mkdir -p ~/mons-backups
node server/main.ts --backup ~/mons-backups/mons-$(date +%F-%H%M).db   # bản sao nhất quán, máy chủ vẫn chạy
```

Đừng chép thẳng `mons.db` khi máy chủ đang chạy (thiếu phần trong `mons.db-wal`). Khôi phục: dừng máy chủ (`Ctrl-C` trong `mons-play:server`), chép file sao lưu thành `server/data/mons.db`, xoá `mons.db-wal` / `mons.db-shm` cũ, chạy lại. Mỗi tài khoản còn giữ 5 bản lưu gần nhất trong bảng `saves`, nên một bản lưu hỏng có thể lấy lại bản trước bằng SQL.

## Bảo mật

- Mật khẩu chỉ lưu dạng băm scrypt; token phiên chỉ lưu sha256. Log không in mật khẩu hay token.
- Máy chủ chỉ nghe `127.0.0.1`; người ngoài vào qua tunnel (HTTPS / WSS). WebSocket từ trang khác bị từ chối (kiểm tra Origin).
- Giới hạn: 5 lần đăng nhập sai (theo IP và theo tên) khoá 5 phút; 20 lần đăng ký / 10 phút và 5 tài khoản mới / ngày mỗi IP; chat 1 dòng / giây, 120 ký tự.
