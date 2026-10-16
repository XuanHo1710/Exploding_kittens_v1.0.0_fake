import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Cổng giao diện (mặc định 8801) và domain public trỏ qua cloudflared tunnel
const PORT = Number(process.env.PORT) || 8801;
const PUBLIC_HOSTS = ['dev-ho.anai.io.vn'];

export default defineConfig({
  plugins: [react()],
  // Ảnh lá bài lấy thẳng từ thư mục database/ ở gốc project
  publicDir: fileURLToPath(new URL('../database', import.meta.url)),
  server: {
    host: true,
    port: PORT,
    strictPort: true,
    allowedHosts: PUBLIC_HOSTS,
    fs: { allow: ['..'] },
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': 'http://localhost:3001',
      '/avatars': 'http://localhost:3001',
    },
  },
  preview: {
    host: true,
    port: PORT,
    strictPort: true,
    allowedHosts: PUBLIC_HOSTS,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': 'http://localhost:3001',
      '/avatars': 'http://localhost:3001',
    },
  },
});
