import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Domain public trỏ qua cloudflared tunnel; thêm domain khác qua ALLOWED_HOSTS=a.com,b.com
const DEFAULT_PUBLIC_HOSTS = [
  'dev.meo.no',
  'meo.no',
  'dev-ho.anai.io.vn',
  'dev.social-chat-xuanho.io.vn',
  'social-chat-xuanho.io.vn',
  '.trycloudflare.com',
];
const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const PIKACHU_DIR = fileURLToPath(new URL('../database-pikachu', import.meta.url));
const DIST_PIKACHU_DIR = fileURLToPath(new URL('./dist/database-pikachu', import.meta.url));
const MIRAGINE_DIR = fileURLToPath(new URL('../database-miraginewar', import.meta.url));
const DIST_MIRAGINE_DIR = fileURLToPath(new URL('./dist/database-miraginewar', import.meta.url));
const BANSUNG_DIR = fileURLToPath(new URL('../database-ban-sung', import.meta.url));
const DIST_BANSUNG_DIR = fileURLToPath(new URL('./dist/database-ban-sung', import.meta.url));

const STATIC_MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json; charset=utf-8',
};

interface StaticMountOptions {
  name: string;
  route: string;
  srcDir: string;
  distDir: string;
  allowedExts: ReadonlySet<string>;
  /** When true, rejects invalid/missing paths directly instead of falling through to SPA HTML. */
  failClosed?: boolean;
  isAllowedJson?: (relPath: string) => boolean;
}

type MiddlewareApp = {
  use: (route: string, fn: (req: any, res: any, next: () => void) => void) => void;
};

function databaseStaticPlugin(opts: StaticMountOptions): Plugin {
  const rootResolved = resolve(opts.srcDir);
  const rootPrefix = rootResolved.endsWith(sep) ? rootResolved : `${rootResolved}${sep}`;
  let cachedRealRoot: string | undefined;

  const resolveRealRoot = (): string => {
    if (!cachedRealRoot) cachedRealRoot = realpathSync(rootResolved);
    return cachedRealRoot;
  };

  const serveStatic = (middlewares: MiddlewareApp) => {
    middlewares.use(opts.route, (req, res, next) => {
      const reject = (status: number, msg: string) => {
        if (!opts.failClosed) return next();
        res.statusCode = status;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(msg);
      };

      const method = String(req.method ?? '').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        return reject(405, 'Method Not Allowed');
      }

      const rawUrl = String(req.originalUrl ?? req.url ?? '');
      if (!rawUrl || /[\x00-\x1f\x7f\\]|%00|%5c|%25/i.test(rawUrl)) {
        return reject(400, 'Bad Request');
      }

      const qIdx = rawUrl.indexOf('?');
      const rawPath = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
      const hasPrefix = rawPath === opts.route || rawPath.startsWith(`${opts.route}/`);
      if (req.originalUrl && !hasPrefix) {
        return reject(403, 'Forbidden');
      }
      const rawRel = hasPrefix
        ? (rawPath.length > opts.route.length ? rawPath.slice(opts.route.length + 1) : '')
        : rawPath.replace(/^\/+/, '');

      let relPath: string;
      try {
        relPath = decodeURIComponent(rawRel);
      } catch {
        return reject(400, 'Bad Request');
      }

      if (/[\x00-\x1f\x7f\\]/.test(relPath)) {
        return reject(400, 'Bad Request');
      }
      if (!relPath) {
        return reject(403, 'Forbidden');
      }

      const segments = relPath.split('/');
      for (const seg of segments) {
        if (
          !seg ||
          seg === '.' ||
          seg === '..' ||
          seg.startsWith('.') ||
          seg.includes(':') ||
          seg.endsWith('.') ||
          seg.endsWith(' ')
        ) {
          return reject(403, 'Forbidden');
        }
      }

      const ext = extname(relPath).toLowerCase();
      const mime = STATIC_MIME_BY_EXT[ext];
      if (!opts.allowedExts.has(ext) || !mime) {
        return reject(403, 'Forbidden');
      }
      if (ext === '.json' && opts.isAllowedJson && !opts.isAllowedJson(relPath)) {
        return reject(403, 'Forbidden');
      }

      const candidate = resolve(rootResolved, relPath);
      if (!candidate.startsWith(rootPrefix)) {
        return reject(403, 'Forbidden');
      }

      let realRoot: string;
      let realFile: string;
      try {
        realRoot = resolveRealRoot();
        realFile = realpathSync(candidate);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          return reject(404, 'Not Found');
        }
        return reject(403, 'Forbidden');
      }

      const realPrefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
      if (!realFile.startsWith(realPrefix) || !statSync(realFile).isFile()) {
        return reject(403, 'Forbidden');
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', opts.route === '/database-ban-sung' ? 'no-cache' : 'public, max-age=604800');
      if (method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(realFile).pipe(res);
    });
  };

  return {
    name: opts.name,
    configureServer(server) {
      serveStatic(server.middlewares);
    },
    configurePreviewServer(server) {
      serveStatic(server.middlewares);
    },
    closeBundle() {
      if (existsSync(opts.srcDir)) {
        cpSync(opts.srcDir, opts.distDir, { recursive: true });
      }
    },
  };
}

function databasePikachuPlugin(): Plugin {
  return databaseStaticPlugin({
    name: 'database-pikachu-static',
    route: '/database-pikachu',
    srcDir: PIKACHU_DIR,
    distDir: DIST_PIKACHU_DIR,
    allowedExts: new Set(['.png', '.json']),
  });
}

function databaseMiragineWarPlugin(): Plugin {
  return databaseStaticPlugin({
    name: 'database-miraginewar-static',
    route: '/database-miraginewar',
    srcDir: MIRAGINE_DIR,
    distDir: DIST_MIRAGINE_DIR,
    allowedExts: new Set(['.png', '.jpg', '.jpeg', '.mp3', '.json']),
  });
}

function databaseBanSungPlugin(): Plugin {
  return databaseStaticPlugin({
    name: 'database-ban-sung-static',
    route: '/database-ban-sung',
    srcDir: BANSUNG_DIR,
    distDir: DIST_BANSUNG_DIR,
    allowedExts: new Set(['.png', '.webp', '.jpg', '.jpeg', '.ogg', '.mp3', '.wav', '.json']),
    failClosed: true,
    isAllowedJson: (relPath) => relPath === 'manifest.json' || relPath.startsWith('normalized/'),
  });
}

export default defineConfig(({ mode }) => {
  // Đọc client/.env, client/.env.<mode> và biến môi trường hệ thống (không cần tiền tố VITE_)
  const env = { ...loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), ''), ...process.env };

  // Cổng giao diện (mặc định 8801)
  const PORT = Number(env.PORT) || 8801;
  // Backend mà proxy dev/preview chuyển tiếp /api, /avatars, /socket.io tới
  const BACKEND_URL = (env.BACKEND_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const PUBLIC_HOSTS = [...DEFAULT_PUBLIC_HOSTS, ...list(env.ALLOWED_HOSTS)];

  const proxy = {
    '/socket.io': { target: BACKEND_URL, ws: true, changeOrigin: true },
    '/api': { target: BACKEND_URL, changeOrigin: true },
    '/avatars': { target: BACKEND_URL, changeOrigin: true },
  };

  return {
    plugins: [react(), databasePikachuPlugin(), databaseMiragineWarPlugin(), databaseBanSungPlugin()],
    // Ảnh lá bài lấy thẳng từ thư mục database/ ở gốc project
    publicDir: fileURLToPath(new URL('../database', import.meta.url)),
    server: {
      host: true,
      port: PORT,
      strictPort: true,
      allowedHosts: PUBLIC_HOSTS,
      fs: { allow: ['..'] },
      proxy,
    },
    preview: {
      host: true,
      port: PORT,
      strictPort: true,
      allowedHosts: PUBLIC_HOSTS,
      proxy,
    },
  };
});
