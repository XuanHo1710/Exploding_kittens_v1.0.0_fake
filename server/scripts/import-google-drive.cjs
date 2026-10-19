'use strict';

const { existsSync, readFileSync, statSync } = require('node:fs');
const { resolve } = require('node:path');

const DEFAULT_SOURCE = resolve(__dirname, '..', 'data', 'db.json');
const MAX_BYTES = 5_000_000;

class ImportError extends Error {}

function parseArgs(args) {
  const result = { help: false, source: DEFAULT_SOURCE };
  let hasSource = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--source' && !hasSource && args[index + 1] && !args[index + 1].startsWith('-')) {
      result.source = resolve(args[++index]);
      hasSource = true;
    } else throw new ImportError('Tham số không hợp lệ. Dùng --help để xem hướng dẫn.');
  }
  return result;
}

/** The backend must be stopped. Never modify the local source or replace populated Drive data. */
async function importAccounts(source, store, parseDb) {
  let content;
  let local;
  try {
    const stat = statSync(source);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error();
    content = readFileSync(source, 'utf8');
    if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) throw new Error();
    local = parseDb(content);
  } catch {
    throw new ImportError('File nguồn không tồn tại, không phải JSON tài khoản hợp lệ hoặc vượt quá 5 MB. Không thay đổi Drive.');
  }
  const remote = await store.read();
  let target;
  try {
    target = parseDb(remote.content);
  } catch {
    throw new ImportError('JSON trên Drive không hợp lệ. Không ghi đè file đích.');
  }
  if (Object.keys(target.accounts).length !== 0) {
    throw new ImportError('File Drive đã có tài khoản. Lệnh nhập chỉ ghi vào file có accounts rỗng; không ghi đè dữ liệu hiện có.');
  }
  const count = Object.keys(local.accounts).length;
  if (count === 0) return 0;
  await store.write(content, remote.version);
  return count;
}

function errorMessage(error) {
  return error instanceof ImportError ? error.message
    : 'Chưa xác nhận nhập dữ liệu thành công. Không đổi file nguồn. Kiểm tra cấu hình, mạng và dữ liệu hiện có trên Drive trước khi thử lại; xem docs/google-drive-storage.md.';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log([
      'Nhập tài khoản JSON cũ vào file Google Drive còn rỗng. Backend PHẢI DỪNG trước khi chạy.',
      '',
      '  npm --prefix server run build',
      '  npm --prefix server run drive:import',
      '  npm --prefix server run drive:import -- --source "C:\\backup\\db.json"',
      '',
      'Nguồn mặc định: server/data/db.json. Đường dẫn --source tương đối tính từ thư mục chạy script.',
      'Chỉ ghi vào file Drive accounts rỗng, không sửa file nguồn và không in dữ liệu người dùng.',
      'Chạy import TRƯỚC npm start; giữ một bản backup riêng trước khi chuyển nơi lưu.',
    ].join('\n'));
    return;
  }
  require('dotenv').config({ path: resolve(__dirname, '..', '.env'), quiet: true });
  if (process.env.ACCOUNT_STORAGE !== 'google-drive') {
    throw new ImportError('Cần ACCOUNT_STORAGE=google-drive trong server/.env trước khi nhập dữ liệu.');
  }
  const compiledDir = resolve(__dirname, '..', 'dist', 'server', 'src', 'store');
  if (!existsSync(resolve(compiledDir, 'db.service.js')) || !existsSync(resolve(compiledDir, 'drive-json.store.js'))) {
    throw new ImportError('Chạy npm --prefix server run build trước khi nhập dữ liệu.');
  }
  const { parseDb } = require(resolve(compiledDir, 'db.service.js'));
  const { DriveJsonStore } = require(resolve(compiledDir, 'drive-json.store.js'));
  console.log('Lệnh nhập yêu cầu backend đã dừng; chỉ ghi khi file Drive chưa có tài khoản.');
  const count = await importAccounts(args.source, new DriveJsonStore(), parseDb);
  console.log(count === 0 ? 'File nguồn không có tài khoản; không ghi lên Drive.'
    : `Đã nhập ${count} tài khoản lên Google Drive. File nguồn giữ nguyên.`);
}

if (require.main === module) {
  main().catch((error) => {
    // Raw JSON and Google errors may contain account data, PIN hashes or tokens.
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, importAccounts, errorMessage, ImportError, DEFAULT_SOURCE };
