'use strict';

const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { createServer } = require('node:http');
const { existsSync, readFileSync, writeFileSync, renameSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');

const ENV_FILE = resolve(__dirname, '..', '.env');
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

class SetupError extends Error {}

function parseArgs(args) {
  if (args.some((arg) => !['--help', '-h', '--create-file'].includes(arg))) {
    throw new SetupError('Tham số không hợp lệ. Dùng --help để xem hướng dẫn.');
  }
  return { help: args.includes('--help') || args.includes('-h'), createFile: args.includes('--create-file') };
}

/** Preserve unrelated settings and replace the file atomically. Never print secrets. */
function updateEnv(file, values) {
  let content = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n]/.test(value)) {
      throw new SetupError('Giá trị cấu hình không hợp lệ; chưa ghi file .env.');
    }
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[^\\r\\n]*(\\r?)$`, 'gm');
    if (pattern.test(content)) content = content.replace(pattern, (_match, carriageReturn) => `${line}${carriageReturn}`);
    else content += `${content && !content.endsWith('\n') ? newline : ''}${line}${newline}`;
  }
  const temp = `${file}.setup-${process.pid}-${randomBytes(6).toString('hex')}.tmp`;
  try {
    writeFileSync(temp, content, { mode: 0o600, flag: 'wx' });
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
}

/** Local-only OAuth callback, protected with state and a short lifetime. */
async function createAuthorizationReceiver(state, timeoutMs = 5 * 60 * 1000) {
  let finish;
  let fail;
  let settled = false;
  let closed = false;
  let timer;
  let expectedHost;
  const waitForCode = new Promise((resolveCode, rejectCode) => {
    finish = resolveCode;
    fail = rejectCode;
  });
  const close = () => {
    clearTimeout(timer);
    if (!closed) {
      closed = true;
      server.close();
    }
  };
  const cancel = (error) => {
    if (!settled) {
      settled = true;
      fail(error);
    }
    close();
  };
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    let url;
    try {
      url = new URL(req.url || '/', 'http://127.0.0.1');
    } catch {
      res.writeHead(400).end('Invalid callback URL.');
      return;
    }
    if (req.method !== 'GET' || url.pathname !== '/' || req.headers.host !== expectedHost) {
      res.writeHead(404).end('Not found');
      return;
    }
    const returnedState = Buffer.from(url.searchParams.get('state') || '');
    const wantedState = Buffer.from(state);
    if (returnedState.length !== wantedState.length || !timingSafeEqual(returnedState, wantedState)) {
      res.writeHead(400).end('Invalid OAuth state. Return to the terminal and use the original authorization URL.');
      return;
    }
    if (settled) {
      res.writeHead(409).end('This authorization callback has already been used.');
      return;
    }
    if (url.searchParams.has('error')) {
      res.writeHead(400).end('Google authorization was not completed. You may close this tab.');
      cancel(new SetupError('Bạn chưa cấp quyền Google Drive. Chạy lại lệnh để thử lại.'));
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400).end('Missing authorization code.');
      return;
    }
    settled = true;
    res.end('Authorization received. You may close this tab and return to the terminal.');
    finish(code);
    close();
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 30;
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', rejectListen);
      resolveListen();
    });
  });
  server.on('error', () => cancel(new SetupError('Không nhận được callback OAuth trên máy này.')));
  expectedHost = `127.0.0.1:${server.address().port}`;
  timer = setTimeout(() => cancel(new SetupError('Hết 5 phút chờ cấp quyền. Chạy lại lệnh để thử lại.')), timeoutMs);
  return { redirectUri: `http://${expectedHost}`, waitForCode, close, cancel };
}

const DEFAULT_DRIVE_FOLDER = 'Meo_No';

async function ensureDriveFolder(client, folderName = DEFAULT_DRIVE_FOLDER) {
  const safeName = String(folderName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const listRes = await client.request({
    url: 'https://www.googleapis.com/drive/v3/files',
    method: 'GET',
    params: {
      q: `mimeType = 'application/vnd.google-apps.folder' and name = '${safeName}' and trashed = false`,
      fields: 'files(id,name)',
      pageSize: 1,
      supportsAllDrives: true,
    },
    timeout: 30_000,
    retry: false,
  });
  const existing = listRes.data?.files?.[0]?.id;
  if (typeof existing === 'string' && /^[A-Za-z0-9_-]+$/.test(existing)) {
    return existing;
  }
  const createRes = await client.request({
    url: 'https://www.googleapis.com/drive/v3/files?fields=id',
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    data: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    }),
    timeout: 30_000,
    retry: false,
  });
  const folderId = createRes.data?.id;
  if (typeof folderId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(folderId)) {
    throw new SetupError('Drive chưa tạo được thư mục Meo_No hợp lệ.');
  }
  return folderId;
}

async function moveFileToFolder(client, fileId, folderId) {
  const metaRes = await client.request({
    url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    method: 'GET',
    params: { fields: 'id,parents' },
    timeout: 30_000,
    retry: false,
  });
  const parents = Array.isArray(metaRes.data?.parents) ? metaRes.data.parents : [];
  if (parents.includes(folderId)) return false;
  const removeParents = parents.join(',');
  await client.request({
    url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    method: 'PATCH',
    params: {
      addParents: folderId,
      ...(removeParents ? { removeParents } : {}),
      fields: 'id,parents',
    },
    timeout: 30_000,
    retry: false,
  });
  return true;
}

async function createEmptyDb(client, folderId) {
  const boundary = `meono_${randomBytes(16).toString('hex')}`;
  const metadata = {
    name: 'meono-accounts.json',
    mimeType: 'application/json',
    ...(folderId ? { parents: [folderId] } : {}),
  };
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify({ version: 1, accounts: {} }, null, 2),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const response = await client.request({
    url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    data: body,
    timeout: 30_000,
    retry: false,
  });
  const id = response.data?.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new SetupError('Drive chưa trả về file ID hợp lệ. Kiểm tra Drive trước khi tạo lại để tránh file trùng.');
  }
  return id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log([
      'Cấp quyền Google Drive cho kho tài khoản JSON (chạy trên máy có trình duyệt).',
      '',
      '  npm --prefix server run drive:setup',
      '  npm --prefix server run drive:setup -- --create-file',
      '',
      'Điền GOOGLE_DRIVE_CLIENT_ID và GOOGLE_DRIVE_CLIENT_SECRET trong server/.env trước.',
      'Dùng OAuth client loại Desktop app. Script lưu refresh token vào server/.env, không in token.',
      '--create-file: tạo file riêng tư mới trong thư mục Meo_No/meono-accounts.json với accounts rỗng.',
      'Nếu đã có GOOGLE_DRIVE_DB_FILE_ID, script giữ nguyên file và tự sắp xếp vào thư mục Meo_No.',
      'Xem docs/google-drive-storage.md để chuyển dữ liệu hiện có và chạy backend.',
    ].join('\n'));
    return;
  }

  require('dotenv').config({ path: ENV_FILE, quiet: true });
  const { OAuth2Client } = require('google-auth-library');
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  let fileId = process.env.GOOGLE_DRIVE_DB_FILE_ID?.trim();
  if (!clientId || !clientSecret) {
    throw new SetupError('Thiếu GOOGLE_DRIVE_CLIENT_ID hoặc GOOGLE_DRIVE_CLIENT_SECRET trong server/.env.');
  }
  if (fileId && !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    throw new SetupError('GOOGLE_DRIVE_DB_FILE_ID cần là ID file, không phải link chia sẻ Google Drive.');
  }

  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(64).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const receiver = await createAuthorizationReceiver(state);
  const onCancel = () => receiver.cancel(new SetupError('Đã hủy cấp quyền Google Drive.'));
  process.once('SIGINT', onCancel);
  process.once('SIGTERM', onCancel);
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri: receiver.redirectUri });
  let code;
  try {
    const authorizationUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [DRIVE_SCOPE],
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    console.log('Mở link sau trong trình duyệt trên CÙNG MÁY chạy lệnh và cấp quyền trong 5 phút:');
    console.log(authorizationUrl);
    code = await receiver.waitForCode;
  } finally {
    receiver.close();
    process.removeListener('SIGINT', onCancel);
    process.removeListener('SIGTERM', onCancel);
  }

  const { tokens } = await client.getToken({ code, codeVerifier: verifier });
  if (!tokens.refresh_token) {
    throw new SetupError('Google chưa cấp refresh token. Cấp quyền lại bằng đúng OAuth client và đồng ý quyền Drive.');
  }
  if (tokens.scope && !tokens.scope.split(' ').includes(DRIVE_SCOPE)) {
    throw new SetupError('Chưa được cấp quyền drive.file. Chạy lại lệnh và đồng ý quyền Google Drive.');
  }
  client.setCredentials(tokens);
  updateEnv(ENV_FILE, {
    GOOGLE_DRIVE_CLIENT_ID: clientId,
    GOOGLE_DRIVE_CLIENT_SECRET: clientSecret,
    GOOGLE_DRIVE_REFRESH_TOKEN: tokens.refresh_token,
  });
  console.log('Đã lưu cấu hình OAuth vào server/.env. Không chia sẻ file này.');

  if (fileId) {
    const response = await client.request({
      url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      params: { fields: 'id,trashed,capabilities(canEdit)' },
      timeout: 30_000,
      retry: false,
    });
    if (response.data?.trashed || response.data?.capabilities?.canEdit !== true) {
      throw new SetupError('File đã cấu hình không tồn tại ở trạng thái có thể ghi. Kiểm tra quyền và thùng rác trên Drive.');
    }
    const folderId = await ensureDriveFolder(client, DEFAULT_DRIVE_FOLDER);
    await moveFileToFolder(client, fileId, folderId);
    console.log(`Giữ nguyên file đã cấu hình và đặt trong thư mục ${DEFAULT_DRIVE_FOLDER}/meono-accounts.json (Folder ID: ${folderId}).`);
  } else if (args.createFile) {
    const folderId = await ensureDriveFolder(client, DEFAULT_DRIVE_FOLDER);
    fileId = await createEmptyDb(client, folderId);
    console.log(`Đã tạo file ${DEFAULT_DRIVE_FOLDER}/meono-accounts.json riêng tư (Folder ID: ${folderId}), tài khoản ban đầu rỗng.`);
    // Print only the non-secret ID before saving so it remains recoverable on a local write error.
    console.log(`GOOGLE_DRIVE_DB_FILE_ID=${fileId}`);
  }

  if (fileId) {
    updateEnv(ENV_FILE, { GOOGLE_DRIVE_DB_FILE_ID: fileId, ACCOUNT_STORAGE: 'google-drive' });
    console.log('Đã cấu hình ACCOUNT_STORAGE=google-drive trong server/.env.');
    console.log('Nếu đã có tài khoản cũ, nhập dữ liệu theo docs/google-drive-storage.md TRƯỚC khi chạy backend.');
  } else {
    console.log('Chưa có file ID; chế độ lưu trữ giữ nguyên. Thêm --create-file để tạo file mới hoặc cấu hình file ID đã được app cấp quyền.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Google errors can carry HTTP request bodies, credentials and tokens. Never print the raw error.
    console.error(error instanceof SetupError
      ? error.message
      : 'Thiết lập Google Drive chưa hoàn tất. Kiểm tra mạng, quyền Drive, Desktop OAuth client và khả năng ghi server/.env; xem docs/google-drive-storage.md. Không có token nào được in ra.');
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, updateEnv, createAuthorizationReceiver, createEmptyDb, ensureDriveFolder, moveFileToFolder, SetupError };
