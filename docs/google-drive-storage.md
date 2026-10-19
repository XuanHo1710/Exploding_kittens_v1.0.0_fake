# Lưu tài khoản bằng JSON trên Google Drive

Backend hỗ trợ `ACCOUNT_STORAGE=google-drive`: file JSON riêng tư trên Drive là nơi lưu chính của tài khoản đăng ký, PIN đã băm, token đăng nhập đã băm, xu và thống kê. Người chơi vẫn đăng nhập vào game bằng tên và PIN; chỉ chủ server cấp quyền Google một lần để backend đọc/ghi file. Không cần MCP khi game chạy.

Ảnh lá bài trong `database/`, cấu hình bộ bài trong `shared/` và avatar tải lên trong `server/uploads/avatars/` giữ nguyên cách lưu hiện tại. JSON chỉ lưu đường dẫn avatar. Khi chuyển máy chủ, cần chuyển cả thư mục avatar để các đường dẫn này vẫn hoạt động.

## 1. Chuẩn bị Google Cloud

1. Tạo hoặc chọn project trong [Google Cloud Console](https://console.cloud.google.com/).
2. Vào **APIs & Services → Library**, bật **Google Drive API**.
3. Thiết lập **Google Auth Platform**: thông tin ứng dụng, email liên hệ và audience. Với Gmail cá nhân, dùng **External**. Nếu ứng dụng ở trạng thái **Testing**, thêm tài khoản Google của chủ server vào **Test users**.
4. Tạo OAuth client có loại **Desktop app**. Lưu client ID và client secret riêng trên máy chủ. Script dùng callback `http://127.0.0.1:<cổng-ngẫu-nhiên>`, PKCE và `state`; không dùng cách sao chép authorization code qua chat. Xem [hướng dẫn OAuth cho desktop của Google](https://developers.google.com/identity/protocols/oauth2/native-app).
5. Quyền cần dùng là `https://www.googleapis.com/auth/drive.file`. Scope này cho phép app truy cập file do chính app tạo hoặc file được người dùng cấp riêng cho app. Dán ID của một file đã tự upload bằng trình duyệt chưa đủ để cấp quyền; nên tạo file bằng script bên dưới. Xem [phạm vi quyền Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Với **External + Testing**, refresh token cho quyền Drive hết hạn sau **7 ngày**. Khi dùng lâu dài, chuyển publishing status sang **In production** theo hướng dẫn trên Google Cloud, rồi chạy lại bước cấp quyền. Token vẫn có thể bị thu hồi; khi gặp `invalid_grant`, cấp quyền lại với cùng client và file ID. Xem [điều kiện hết hạn refresh token của Google](https://developers.google.com/identity/protocols/oauth2#expiration).

## 2. Cấp quyền và tạo file riêng tư

Chạy các lệnh dưới đây từ thư mục gốc project. Cài dependency nếu chưa có:

```powershell
npm --prefix server install
if (-not (Test-Path -LiteralPath server/.env)) { Copy-Item server/.env.example server/.env }
```

Lệnh trên giữ các cấu hình hiện có nếu `server/.env` đã tồn tại. Mở `server/.env` và điền hai giá trị trên máy của bạn:

```dotenv
GOOGLE_DRIVE_CLIENT_ID=your-desktop-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-desktop-client-secret
```

Sau đó:

```powershell
npm --prefix server run drive:setup -- --create-file
```

Mở link script in ra trong trình duyệt **trên cùng máy chạy lệnh**, chọn đúng tài khoản Drive và cấp quyền. Script chờ tối đa 5 phút. Nếu server chạy từ xa, thực hiện cấp quyền trên máy cá nhân rồi chuyển các giá trị cấu hình vào biến môi trường riêng của server.

Script lưu refresh token vào `server/.env`, giữ các cấu hình khác, tạo file `meono-accounts.json` mới tại My Drive và lưu:

```dotenv
ACCOUNT_STORAGE=google-drive
GOOGLE_DRIVE_DB_FILE_ID=generated-file-id
GOOGLE_DRIVE_CLIENT_ID=your-desktop-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-desktop-client-secret
GOOGLE_DRIVE_REFRESH_TOKEN=generated-refresh-token
```

File mới không được chia sẻ công khai và chỉ chứa:

```json
{ "version": 1, "accounts": {} }
```

**File mới chưa có tài khoản cũ.** `--create-file` không tự tải `server/data/db.json` lên. Nếu đã cấu hình `GOOGLE_DRIVE_DB_FILE_ID`, script chỉ kiểm tra quyền ghi và giữ nguyên file đó, kể cả khi có `--create-file`. Chạy lại `drive:setup` không có flag khi cần cấp quyền lại mà giữ file cũ.

`server/.env` và `server/data/` đã được Git bỏ qua. Không gửi client secret, refresh token, PIN hash hoặc dữ liệu tài khoản qua chat; khi deploy, đưa cấu hình vào phần secrets/environment của máy chủ. Không đặt các giá trị này trong frontend hoặc biến `VITE_*`. Trên hosting, biến môi trường có sẵn được ưu tiên hơn `.env`; cập nhật chúng khi đổi token.

## 3. Chuyển tài khoản hiện có

Trước khi bật backend ở chế độ Drive, **dừng tất cả tiến trình backend** và sao lưu `server/data/db.json` vào nơi riêng. Sau khi cấp quyền và tạo file mới ở bước 2, nhập tài khoản cũ:

```powershell
npm --prefix server run build
npm --prefix server run drive:import
```

Lệnh mặc định đọc `server/data/db.json`. Để dùng bản backup riêng:

```powershell
npm --prefix server run drive:import -- --source "C:\backup\meono-db.json"
```

Dùng đường dẫn tuyệt đối để tránh nhầm thư mục; với `npm --prefix server run`, đường dẫn tương đối được tính từ thư mục `server`. Lệnh kiểm tra cấu trúc tài khoản của cả nguồn và đích, từ chối file trên 5 MB, chỉ ghi khi file Drive có `accounts` rỗng và kiểm tra phiên bản đích trước khi ghi. File nguồn giữ nguyên; kết quả chỉ in số tài khoản, không in nội dung hoặc token.

**Chạy import trước lần `npm start` đầu tiên ở chế độ Drive.** Backend tải file Drive về và cập nhật bản sao `server/data/db.json`; nếu khởi động giữa bước tạo file rỗng và nhập tài khoản cũ, bản sao này có thể trở thành dữ liệu rỗng. Dùng bản backup riêng làm nguồn nếu đã khởi động nhầm. Nếu Drive đã có tài khoản, importer dừng để tránh ghi đè; không xóa chúng để ép chạy lại.

Không thay file ID bằng một file upload thủ công vì quyền `drive.file` không tự áp dụng cho file đó. Không chạy lệnh nhập cùng lúc với backend hoặc một chương trình khác đang sửa cùng file Drive.

Nếu bắt đầu hệ thống mới, không cần nhập dữ liệu; giữ file `{ "version": 1, "accounts": {} }`. Không bật backend cho người chơi đăng ký vào file mới trước khi hoàn tất việc nhập tài khoản cũ.

## 4. Chạy và hành vi lưu dữ liệu

```powershell
npm --prefix server run build
npm --prefix server start
```

Backend tải JSON từ Drive và kiểm tra cấu trúc trước khi phục vụ người chơi. Thiếu cấu hình, không có quyền, Drive lỗi hoặc JSON hỏng sẽ làm khởi động thất bại; backend không tự tạo tài khoản rỗng hay dùng file cache để thay thế Drive.

Các thay đổi tài khoản và xu được xếp tuần tự trong cùng tiến trình, ghi lên Drive rồi mới cập nhật trạng thái tài khoản trong RAM và trả thành công cho client. Khi lưu thất bại, thao tác trả lỗi. Nếu có xung đột hoặc chưa xác định được kết quả ghi, backend khóa cập nhật tài khoản; kiểm tra dữ liệu trên Drive rồi khởi động lại để tải bản hiện có. Mỗi lần ghi thay cả nội dung file JSON, theo [Drive API upload/update](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

`server/data/db.json` trong chế độ Drive là bản sao cục bộ phục vụ khôi phục thủ công; Drive vẫn là nguồn dữ liệu chính. File cache không thay cho backup và không được tự đẩy lên khi server khởi động. Khi một yêu cầu ghi bị mất kết nối giữa chừng, Drive có thể đã nhận dữ liệu dù client chưa nhận kết quả; kiểm tra lại dữ liệu trên Drive trước khi thao tác khôi phục hoặc nhập lại.

Chỉ chạy **một tiến trình backend** cho một file tài khoản: một instance, không dùng PM2 cluster hoặc nhiều replica. Hàng đợi trong RAM không khóa file giữa các server và không ngăn việc một chương trình khác ghi đè file. Dừng backend trước khi sửa hoặc khôi phục file thủ công.

`ACCOUNT_STORAGE=local` giữ chế độ file cục bộ cho phát triển. Chuyển về local không tự kéo dữ liệu mới nhất từ Drive; xuất bản sao mới nhất trước khi đổi nơi lưu để tránh dùng dữ liệu cũ.

## 5. Khi gặp lỗi

| Hiện tượng | Kiểm tra |
|---|---|
| `redirect_uri_mismatch` | OAuth client phải là Desktop app; cấp quyền trên cùng máy chạy script. |
| Không nhận callback | Mở link trong trình duyệt của máy chạy lệnh; kiểm tra tường lửa cho loopback; chạy lại nếu quá 5 phút. |
| `invalid_grant` / token hết hạn | Kiểm tra chế độ Testing và cấp quyền lại với cùng OAuth client; giữ nguyên file ID. |
| Drive trả 403 | Drive API đã bật chưa; đã cấp scope `drive.file` chưa; tài khoản còn quyền ghi file không. |
| Drive trả 404 | File ID đúng chưa; file có do app này tạo/cấp quyền không; có bị xóa không. File không có quyền cũng có thể trả 404. |
| Backend không khởi động | Kiểm tra cấu hình và JSON trên Drive; khôi phục từ bản sao riêng, giữ các trường PIN/token đã băm. |
| Đã tạo file nhưng script báo lỗi lưu `.env` | Script in file ID trước khi lưu; điền ID này bằng tay, không tạo lại ngay để tránh file trùng. |

Nếu không xác định được lần ghi trước đã thành công hay chưa, dừng backend, tải bản JSON hiện có từ Drive để kiểm tra và giữ bản sao trước khi khôi phục. Không ghi một cache cũ đè lên dữ liệu mới trên Drive.
