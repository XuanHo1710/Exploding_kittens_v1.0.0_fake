/**
 * Địa chỉ backend mà trình duyệt gọi tới (REST, socket.io, ảnh avatar).
 * - Để trống (mặc định): gọi cùng origin với trang. Dùng khi server phục vụ luôn giao diện
 *   hoặc khi chạy qua proxy của Vite (dev/preview, xem BACKEND_URL trong client/.env).
 * - Đặt VITE_SERVER_URL=https://api.example.com lúc build khi frontend deploy tách khỏi backend.
 */
export const SERVER_URL = ((import.meta.env.VITE_SERVER_URL as string | undefined) ?? '').trim().replace(/\/+$/, '');

/** Ghép đường dẫn tuyệt đối của server ("/api/...", "/avatars/...") với SERVER_URL */
export const serverUrl = (path: string) => `${SERVER_URL}${path}`;
