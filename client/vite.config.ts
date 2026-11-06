import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Cổng giao diện (mặc định 8801) và domain public trỏ qua cloudflared tunnel
const PORT = Number(process.env.PORT) || 8801;
const PUBLIC_HOSTS = [
  'dev.meo.no',
  'meo.no',
  'dev-ho.anai.io.vn',
  'dev.social-chat-xuanho.io.vn',
  'social-chat-xuanho.io.vn',
  '.trycloudflare.com',
];

const PIKACHU_DIR = fileURLToPath(new URL('../database-pikachu', import.meta.url));
const DIST_PIKACHU_DIR = fileURLToPath(new URL('./dist/database-pikachu', import.meta.url));

function databasePikachuPlugin(): Plugin {
  const servePikachu = (middlewares: { use: (route: string, fn: (req: any, res: any, next: () => void) => void) => void }) => {
    middlewares.use('/database-pikachu', (req, res, next) => {
      const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
      const file = resolve(PIKACHU_DIR, rel);
      if (!file.startsWith(PIKACHU_DIR) || !existsSync(file) || !statSync(file).isFile()) return next();
      if (file.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
      else if (file.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      createReadStream(file).pipe(res);
    });
  };
  return {
    name: 'database-pikachu-static',
    configureServer(server) {
      servePikachu(server.middlewares);
    },
    configurePreviewServer(server) {
      servePikachu(server.middlewares);
    },
    closeBundle() {
      if (existsSync(PIKACHU_DIR)) {
        cpSync(PIKACHU_DIR, join(DIST_PIKACHU_DIR), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), databasePikachuPlugin()],
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
