import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { cpSync, createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
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
const TOTAL_WAR_DIR = fileURLToPath(new URL('../database-total-war', import.meta.url));
const DIST_TOTAL_WAR_DIR = fileURLToPath(new URL('./dist/database-total-war', import.meta.url));
const MK_DIR = fileURLToPath(new URL('../database-mighty-knight-pixel', import.meta.url));
const DIST_MK_DIR = fileURLToPath(new URL('./dist/database-mighty-knight-pixel', import.meta.url));
const EXPEDITION_DIR = fileURLToPath(new URL('../database-astral-expedition', import.meta.url));
const DIST_EXPEDITION_DIR = fileURLToPath(new URL('./dist/database-astral-expedition', import.meta.url));

const STATIC_MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json; charset=utf-8',
  '.tmj': 'application/json; charset=utf-8',
  '.tsj': 'application/json; charset=utf-8',
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
      res.setHeader(
        'Cache-Control',
        opts.failClosed ? 'no-cache' : 'public, max-age=604800',
      );
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

/** Serve Miragine War runtime assets in dev/preview and copy runtime files (excluding raw frames/) on build. */
function databaseMiragineWarPlugin(): Plugin {
  const MIRAGINE_PREFIX = MIRAGINE_DIR.endsWith(sep) ? MIRAGINE_DIR : `${MIRAGINE_DIR}${sep}`;
  const FRAMES_DIR = join(MIRAGINE_DIR, 'frames');
  const FRAMES_PREFIX = `${FRAMES_DIR}${sep}`;
  const serveMiragine = (middlewares: { use: (route: string, fn: (req: any, res: any, next: () => void) => void) => void }) => {
    middlewares.use('/database-miraginewar', (req, res, next) => {
      let rel = '';
      try {
        rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
      } catch {
        res.statusCode = 400;
        res.end('Bad Request');
        return;
      }
      const file = resolve(MIRAGINE_DIR, rel);
      if ((file !== MIRAGINE_DIR && !file.startsWith(MIRAGINE_PREFIX)) || !existsSync(file) || !statSync(file).isFile()) {
        return next();
      }
      const lower = file.toLowerCase();
      if (lower.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
      else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
      else if (lower.endsWith('.mp3')) res.setHeader('Content-Type', 'audio/mpeg');
      else if (lower.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      const stream = createReadStream(file);
      stream.on('error', () => {
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
      stream.pipe(res);
    });
  };
  return {
    name: 'database-miraginewar-static',
    configureServer(server) {
      serveMiragine(server.middlewares);
    },
    configurePreviewServer(server) {
      serveMiragine(server.middlewares);
    },
    closeBundle() {
      if (existsSync(MIRAGINE_DIR)) {
        cpSync(MIRAGINE_DIR, DIST_MIRAGINE_DIR, {
          recursive: true,
          filter: (src) => src !== FRAMES_DIR && !src.startsWith(FRAMES_PREFIX),
        });
      }
    },
  };
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

function databaseMightyKnightPlugin(): Plugin {
  return databaseStaticPlugin({
    name: 'database-mighty-knight-static',
    route: '/database-mighty-knight-pixel',
    srcDir: MK_DIR,
    distDir: DIST_MK_DIR,
    allowedExts: new Set(['.png', '.webp', '.jpg', '.jpeg', '.ogg', '.mp3', '.wav', '.json']),
    failClosed: true,
    isAllowedJson: (relPath) => relPath === 'manifest.json',
  });
}

function databaseAstralExpeditionPlugin(): Plugin {
  return databaseStaticPlugin({
    name: 'database-astral-expedition-static',
    route: '/database-astral-expedition',
    srcDir: EXPEDITION_DIR,
    distDir: DIST_EXPEDITION_DIR,
    allowedExts: new Set(['.png', '.webp', '.json', '.tmj', '.tsj']),
    failClosed: true,
  });
}

function databaseTotalWarPlugin(): Plugin {
  const rootPrefix = TOTAL_WAR_DIR.endsWith(sep) ? TOTAL_WAR_DIR : TOTAL_WAR_DIR + sep;
  const serveTotalWar = (middlewares: { use: (route: string, fn: (req: any, res: any, next: () => void) => void) => void }) => {
    middlewares.use('/database-total-war', (req, res, next) => {
      let rel = '';
      try {
        rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
      } catch {
        return next();
      }
      const file = resolve(TOTAL_WAR_DIR, rel);
      if ((file !== TOTAL_WAR_DIR && !file.startsWith(rootPrefix)) || !existsSync(file) || !statSync(file).isFile()) {
        return next();
      }
      const lower = file.toLowerCase();
      if (lower.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
      else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
      else if (lower.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml');
      else if (lower.endsWith('.mp3')) res.setHeader('Content-Type', 'audio/mpeg');
      else if (lower.endsWith('.wav')) res.setHeader('Content-Type', 'audio/wav');
      else if (lower.endsWith('.ogg')) res.setHeader('Content-Type', 'audio/ogg');
      else if (lower.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      else if (lower.endsWith('.xml')) res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      else if (lower.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      else if (lower.endsWith('.md') || lower.endsWith('.txt')) res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      const stream = createReadStream(file);
      stream.on('error', () => {
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
      stream.pipe(res);
    });
  };
  return {
    name: 'database-total-war-static',
    configureServer(server) {
      serveTotalWar(server.middlewares);
    },
    configurePreviewServer(server) {
      serveTotalWar(server.middlewares);
    },
    closeBundle() {
      if (existsSync(TOTAL_WAR_DIR)) {
        cpSync(TOTAL_WAR_DIR, join(DIST_TOTAL_WAR_DIR), {
          recursive: true,
          filter: (src: string) => {
            const name = basename(src);
            return name !== '.git' && name !== 'opensource';
          },
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Đọc client/.env, client/.env.<mode> và biến môi trường hệ thống (không cần tiền tố VITE_)
  const env = { ...loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), ''), ...process.env };

  // Cổng giao diện (mặc định 8801)
  const PORT = Number(env.PORT) || 8801;
  // Backend mà proxy dev/preview chuyển tiếp /api, /avatars, /socket.io tới
  const BACKEND_URL = (env.BACKEND_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const PUBLIC_HOSTS = [...DEFAULT_PUBLIC_HOSTS, ...list(env.ALLOWED_HOSTS)];
  const expeditionManifest = join(EXPEDITION_DIR, 'manifest.json');
  const expeditionRevision = existsSync(expeditionManifest)
    ? createHash('sha256').update(readFileSync(expeditionManifest)).digest('hex').slice(0, 16)
    : '';

  const proxy = {
    '/socket.io': { target: BACKEND_URL, ws: true, changeOrigin: true },
    '/api': { target: BACKEND_URL, changeOrigin: true },
    '/avatars': { target: BACKEND_URL, changeOrigin: true },
  };

  return {
    define: {
      'import.meta.env.VITE_EXPEDITION_ASSET_REVISION': JSON.stringify(expeditionRevision),
    },
    plugins: [
      react(),
      databasePikachuPlugin(),
      databaseMiragineWarPlugin(),
      databaseBanSungPlugin(),
      databaseTotalWarPlugin(),
      databaseMightyKnightPlugin(),
      databaseAstralExpeditionPlugin(),
    ],
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
