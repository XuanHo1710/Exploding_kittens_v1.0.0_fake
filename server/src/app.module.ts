import { Injectable, Logger, MiddlewareConsumer, Module, NestMiddleware, NestModule, OnModuleInit } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { existsSync, promises, realpathSync } from 'fs';
import { extname, join, resolve, sep } from 'path';
import { GameGateway } from './game/game.gateway';
import { RoomsService } from './game/rooms.service';
import { AVATAR_DIR, AvatarController } from './avatar/avatar.controller';
import { DB_FILE, DbService } from './store/db.service';
import { ACCOUNT_STORE, createAccountStore } from './store/json.store';
import { AccountsService } from './store/accounts.service';
import { AccountController } from './store/account.controller';

export const BAN_SUNG_STATIC_PREFIX = '/database-ban-sung';
export const BAN_SUNG_ROOT = resolve(__dirname, '..', '..', '..', '..', 'database-ban-sung');
export const ALLOWED_BANSUNG_STATIC_EXT = new Set(['.png', '.webp', '.jpg', '.jpeg', '.ogg', '.mp3', '.wav', '.json']);

let cachedBanSungRealRoot: string | undefined;

function resolveRealRoot(rootDir: string): string {
  if (rootDir === BAN_SUNG_ROOT) {
    if (!cachedBanSungRealRoot) {
      cachedBanSungRealRoot = realpathSync(BAN_SUNG_ROOT);
    }
    return cachedBanSungRealRoot;
  }
  return realpathSync(rootDir);
}

export interface StaticGuardRequest {
  method?: string;
  originalUrl?: string;
  url?: string;
}

export interface StaticGuardResponse {
  status(code: number): StaticGuardResponse;
  json(body: unknown): unknown;
}

/**
 * Fail-closed static path guard for `/database-ban-sung`:
 * blocks non-GET/HEAD methods, raw/double-encoded traversal, dotfiles,
 * non-whitelisted extensions/JSON metadata, and symlink escapes.
 */
export async function guardBanSungStaticRequest(
  req: StaticGuardRequest,
  res: StaticGuardResponse,
  next: (err?: unknown) => void,
  rootDir = BAN_SUNG_ROOT,
): Promise<void> {
  const method = (req.method ?? '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.status(405).json({ statusCode: 405, message: 'Method Not Allowed' });
    return;
  }

  const rawUrl = String(req.originalUrl ?? req.url ?? '');
  if (!rawUrl || /[\x00-\x1f\x7f\\]|%00|%5c|%25/i.test(rawUrl)) {
    res.status(400).json({ statusCode: 400, message: 'Bad Request' });
    return;
  }

  const qIdx = rawUrl.indexOf('?');
  const rawPath = qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl;
  if (rawPath !== BAN_SUNG_STATIC_PREFIX && !rawPath.startsWith(`${BAN_SUNG_STATIC_PREFIX}/`)) {
    res.status(403).json({ statusCode: 403, message: 'Forbidden' });
    return;
  }

  const rawRel = rawPath.length > BAN_SUNG_STATIC_PREFIX.length ? rawPath.slice(BAN_SUNG_STATIC_PREFIX.length + 1) : '';
  let relPath: string;
  try {
    relPath = decodeURIComponent(rawRel);
  } catch {
    res.status(400).json({ statusCode: 400, message: 'Bad Request' });
    return;
  }

  if (/[\x00-\x1f\x7f\\]/.test(relPath)) {
    res.status(400).json({ statusCode: 400, message: 'Bad Request' });
    return;
  }

  if (!relPath) {
    res.status(403).json({ statusCode: 403, message: 'Forbidden' });
    return;
  }

  const segments = relPath.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..' || seg.startsWith('.') || seg.includes(':') || seg.endsWith('.') || seg.endsWith(' ')) {
      res.status(403).json({ statusCode: 403, message: 'Forbidden' });
      return;
    }
  }

  const ext = extname(relPath).toLowerCase();
  if (!ALLOWED_BANSUNG_STATIC_EXT.has(ext)) {
    res.status(403).json({ statusCode: 403, message: 'Forbidden' });
    return;
  }
  if (ext === '.json' && relPath !== 'manifest.json' && !relPath.startsWith('normalized/')) {
    res.status(403).json({ statusCode: 403, message: 'Forbidden' });
    return;
  }

  const rootResolved = resolve(rootDir);
  const rootPrefix = rootResolved.endsWith(sep) ? rootResolved : `${rootResolved}${sep}`;
  const candidate = resolve(rootResolved, relPath);
  if (!candidate.startsWith(rootPrefix)) {
    res.status(403).json({ statusCode: 403, message: 'Forbidden' });
    return;
  }

  let realRoot: string;
  try {
    realRoot = resolveRealRoot(rootResolved);
  } catch {
    res.status(404).json({ statusCode: 404, message: 'Not Found' });
    return;
  }

  let realCandidate: string;
  try {
    realCandidate = await promises.realpath(candidate);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      res.status(404).json({ statusCode: 404, message: 'Not Found' });
      return;
    }
    res.status(403).json({ statusCode: 403, message: 'Forbidden' });
    return;
  }

  const realRootPrefix = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  if (!realCandidate.startsWith(realRootPrefix)) {
    res.status(403).json({ statusCode: 403, message: 'Forbidden' });
    return;
  }

  try {
    const stat = await promises.stat(realCandidate);
    if (!stat.isFile()) {
      res.status(403).json({ statusCode: 403, message: 'Forbidden' });
      return;
    }
  } catch {
    res.status(404).json({ statusCode: 404, message: 'Not Found' });
    return;
  }

  next();
}

@Injectable()
export class BanSungStaticGuard implements NestMiddleware {
  async use(req: StaticGuardRequest, res: StaticGuardResponse, next: (err?: unknown) => void): Promise<void> {
    await guardBanSungStaticRequest(req, res, next);
  }
}
const REPO_UP_CANDIDATES: readonly string[][] = [
  ['..', '..', '..', '..'],
  ['..', '..', '..'],
  ['..', '..'],
];

/** Resolve a repository-root path across dev (ts-node/watch) and compiled dist/ layouts. */
function resolveRepoPath(...segments: string[]): string {
  for (const up of REPO_UP_CANDIDATES) {
    const candidate = resolve(__dirname, ...up, ...segments);
    if (existsSync(candidate)) return candidate;
  }
  for (const base of [process.cwd(), resolve(process.cwd(), '..')]) {
    const candidate = resolve(base, ...segments);
    if (existsSync(candidate)) return candidate;
  }
  const fallbackRoot = REPO_UP_CANDIDATES
    .map((up) => resolve(__dirname, ...up))
    .find((root) => existsSync(join(root, 'server', 'package.json')))
    ?? resolve(__dirname, '..', '..', '..', '..');
  return join(fallbackRoot, ...segments);
}

const miragineDir = resolveRepoPath('database-miraginewar');

@Module({
  imports: [
    ServeStaticModule.forRoot(
      // Ảnh avatar người chơi đã tải lên
      { rootPath: AVATAR_DIR, serveRoot: '/avatars', serveStaticOptions: { maxAge: '7d', fallthrough: false } },
      // Ảnh Pikachu 1-1 từ thư mục database-pikachu/ ở gốc project
      { rootPath: resolveRepoPath('database-pikachu'), serveRoot: '/database-pikachu', serveStaticOptions: { maxAge: '7d', fallthrough: false } },
      // Tài nguyên nhân vật, hoạt ảnh, âm thanh Miragine War 100% từ thư mục database-miraginewar/ ở gốc project
      { rootPath: miragineDir, serveRoot: '/database-miraginewar', serveStaticOptions: { maxAge: '7d', fallthrough: false } },
      // Tài nguyên bản đồ, tướng lĩnh, quân đoàn, âm thanh Tam Quốc Toàn Chiến từ thư mục database-total-war/ ở gốc project
      { rootPath: resolveRepoPath('database-total-war'), serveRoot: '/database-total-war', serveStaticOptions: { maxAge: '7d', fallthrough: false } },
      // Tài nguyên nhân vật, vũ khí, hiệu ứng, âm thanh Bắn Súng Co-op từ thư mục database-ban-sung/ ở gốc project
      {
        rootPath: BAN_SUNG_ROOT,
        serveRoot: BAN_SUNG_STATIC_PREFIX,
        serveStaticOptions: { maxAge: 0, fallthrough: false, dotfiles: 'deny', index: false, redirect: false },
      },
      // Bản build của client (client/dist) được server phục vụ luôn, chỉ cần chạy 1 tiến trình
      {
        rootPath: resolveRepoPath('client', 'dist'),
        exclude: [
          '/api/{*path}',
          '/avatars/{*path}',
          '/database-pikachu/{*path}',
          '/database-miraginewar/{*path}',
          '/database-total-war/{*path}',
          '/database-ban-sung/{*path}',
          '/uploads/{*path}',
        ],
      },
    ),
  ],
  controllers: [AvatarController, AccountController],
  providers: [
    { provide: ACCOUNT_STORE, useFactory: () => createAccountStore(DB_FILE) },
    DbService, AccountsService, RoomsService, GameGateway, BanSungStaticGuard,
  ],
})
export class AppModule implements NestModule, OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(BanSungStaticGuard).forRoutes(BAN_SUNG_STATIC_PREFIX, `${BAN_SUNG_STATIC_PREFIX}/{*path}`);
  }

  /** Warn visibly at startup if Miragine War runtime assets are missing. */
  onModuleInit(): void {
    const mappingPath = join(miragineDir, 'mapping.json');
    if (!existsSync(mappingPath)) {
      this.logger.warn(`Miragine War assets missing: ${mappingPath} not found`);
    }
  }
}
