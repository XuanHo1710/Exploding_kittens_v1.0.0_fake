import { config } from 'dotenv';
import { join } from 'path';

// File build ở server/dist/server/src: luôn đọc server/.env dù chạy từ thư mục nào.
// Biến môi trường từ hosting luôn được ưu tiên hơn nội dung file.
config({ path: join(__dirname, '..', '..', '..', '.env'), quiet: true });
