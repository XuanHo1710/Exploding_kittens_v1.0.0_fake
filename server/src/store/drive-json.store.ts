import { createHash } from 'node:crypto';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const MAX_BYTES = 5_000_000;
const METADATA_FIELDS = 'version,size,mimeType,trashed,capabilities(canEdit),md5Checksum';

type TokenProvider = {
  getAccessToken(): Promise<string | null | undefined | { token?: string | null }>;
};

export interface DriveJsonStoreOptions {
  fileId?: string;
  auth?: TokenProvider;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

/** Safe to log: messages never include credentials, response bodies or user data. */
export class DriveStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly uncertain = false,
    public readonly retryable = false,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'DriveStoreError';
  }
}

interface FileMetadata {
  version: string;
  size: number;
  checksum: string;
}

/**
 * A private, existing Drive blob is the source of truth. Intended for ONE writer.
 * Drive v3 has no documented atomic version precondition for files.update.
 * The version check detects prior edits, but cannot lock out another writer
 * between that check and PATCH. Do not share this file with another running server.
 */
export class DriveJsonStore {
  private readonly fileId: string;
  private readonly auth: TokenProvider;
  private readonly transport: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private lastCommittedChecksum: string | null = null;

  constructor(options: DriveJsonStoreOptions = {}) {
    this.fileId = options.fileId ?? process.env.GOOGLE_DRIVE_DB_FILE_ID ?? '';
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(this.fileId)) {
      throw new DriveStoreError('CONFIG', 'GOOGLE_DRIVE_DB_FILE_ID must be a Drive file ID, not a URL.');
    }
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retries = options.retries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120_000
      || !Number.isInteger(this.retries) || this.retries < 0 || this.retries > 5
      || !Number.isInteger(this.retryDelayMs) || this.retryDelayMs < 0 || this.retryDelayMs > 10_000) {
      throw new DriveStoreError('CONFIG', 'Invalid Google Drive timeout or retry configuration.');
    }
    this.transport = options.fetch ?? globalThis.fetch;
    if (typeof this.transport !== 'function') {
      throw new DriveStoreError('CONFIG', 'Google Drive storage requires Node.js with fetch support.');
    }
    this.auth = options.auth ?? this.createAuth();
  }

  async read(): Promise<{ content: string; version: string }> {
    for (let attempt = 0; ; attempt += 1) {
      const before = await this.metadata();
      const content = await this.request(this.url(false, { alt: 'media' }), 'GET');
      this.validateJson(content);
      const after = await this.metadata();
      if (this.checksum(content) !== after.checksum || Buffer.byteLength(content, 'utf8') !== after.size) {
        throw new DriveStoreError('CONFLICT', 'Google Drive data changed while it was being read. Restart after resolving the conflict.');
      }
      if (before.version !== after.version) {
        if (attempt < this.retries && before.checksum === after.checksum) {
          await this.backoff(attempt);
          continue;
        }
        throw new DriveStoreError('CONFLICT', 'Google Drive data changed while it was being read. Restart after resolving the conflict.');
      }
      this.lastCommittedChecksum = after.checksum;
      return { content, version: after.version };
    }
  }

  async write(content: string, expectedVersion: string): Promise<string> {
    this.validateJson(content);
    if (!/^[0-9]+$/.test(expectedVersion)) {
      throw new DriveStoreError('CONFIG', 'A valid Google Drive file version is required for writing.');
    }
    const checksum = this.checksum(content);
    for (let attempt = 0; ; attempt += 1) {
      const before = await this.metadata();
      if (before.version !== expectedVersion && before.checksum !== this.lastCommittedChecksum) {
        if (before.checksum === checksum) {
          this.lastCommittedChecksum = checksum;
          return before.version;
        }
        throw new DriveStoreError('CONFLICT', 'Google Drive data was modified elsewhere. Restart after resolving the conflict.');
      }
      try {
        const result = await this.request(
          this.url(true, { uploadType: 'media', fields: 'version,md5Checksum' }),
          'PATCH', content, 0,
        );
        let updated: { version?: unknown; md5Checksum?: unknown };
        try {
          updated = JSON.parse(result);
        } catch {
          throw new DriveStoreError('WRITE_UNCERTAIN', 'Google Drive returned an invalid upload confirmation.', true);
        }
        if (typeof updated.version !== 'string' || !/^[0-9]+$/.test(updated.version)
          || updated.md5Checksum !== checksum) {
          throw new DriveStoreError('WRITE_UNCERTAIN', 'Google Drive upload could not be verified.', true);
        }
        this.lastCommittedChecksum = checksum;
        return updated.version;
      } catch (error) {
        if (!(error instanceof DriveStoreError)) {
          throw new DriveStoreError('WRITE_UNCERTAIN', 'Google Drive upload outcome is unknown. Restart to reload persisted data.', true);
        }
        if (error.status === 429) {
          if (attempt < this.retries) {
            await this.backoff(attempt);
            continue;
          }
          throw error;
        }
        if (!error.uncertain && !error.retryable) throw error;
        let current: FileMetadata;
        try {
          current = await this.metadata();
        } catch {
          throw new DriveStoreError('WRITE_UNCERTAIN', 'Google Drive upload outcome is unknown. Restart to reload persisted data.', true);
        }
        if (current.checksum === checksum) {
          this.lastCommittedChecksum = checksum;
          return current.version;
        }
        if (current.version !== expectedVersion && current.checksum !== this.lastCommittedChecksum) {
          throw new DriveStoreError('CONFLICT', 'Google Drive data changed during upload. Restart after resolving the conflict.', true);
        }
        if (attempt < this.retries) {
          await this.backoff(attempt);
          continue;
        }
        throw new DriveStoreError('WRITE_UNCERTAIN', 'Google Drive upload outcome is unknown. Restart to reload persisted data.', true);
      }
    }
  }

  private createAuth(): TokenProvider {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    const credentialFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const hasOAuth = Boolean(clientId?.trim() || clientSecret?.trim() || refreshToken?.trim());
    if (hasOAuth) {
      if (!clientId?.trim() || !clientSecret?.trim() || !refreshToken?.trim() || credentialFile?.trim()) {
        throw new DriveStoreError('CONFIG', 'Configure all three Google Drive OAuth values, or a credentials file, but not both.');
      }
      const client = new OAuth2Client(clientId, clientSecret);
      client.setCredentials({ refresh_token: refreshToken });
      return client;
    }
    if (!credentialFile?.trim()) {
      throw new DriveStoreError('CONFIG', 'Google Drive storage requires OAuth credentials or GOOGLE_APPLICATION_CREDENTIALS.');
    }
    return new GoogleAuth({ keyFilename: credentialFile, scopes: [DRIVE_SCOPE] });
  }

  private url(upload: boolean, query: Record<string, string>): string {
    const base = upload ? 'https://www.googleapis.com/upload/drive/v3/files/' : 'https://www.googleapis.com/drive/v3/files/';
    return `${base}${this.fileId}?${new URLSearchParams({ supportsAllDrives: 'true', ...query })}`;
  }

  private async metadata(): Promise<FileMetadata> {
    const result = await this.request(this.url(false, { fields: METADATA_FIELDS }), 'GET');
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(result);
      if (data === null || typeof data !== 'object') throw new Error();
    } catch {
      throw new DriveStoreError('INVALID_DATA', 'Google Drive returned invalid file metadata.');
    }
    if (typeof data.version !== 'string' || !/^[0-9]+$/.test(data.version)
      || typeof data.size !== 'string' || !/^[0-9]+$/.test(data.size)
      || typeof data.md5Checksum !== 'string' || !/^[a-f0-9]{32}$/i.test(data.md5Checksum)
      || typeof data.mimeType !== 'string' || data.mimeType.startsWith('application/vnd.google-apps.')
      || data.trashed !== false) {
      throw new DriveStoreError('INVALID_DATA', 'The Drive database must be an existing, non-trashed JSON file.');
    }
    if ((data.capabilities as { canEdit?: unknown } | undefined)?.canEdit !== true) {
      throw new DriveStoreError('PERMISSION', 'Google Drive credentials require edit access to the database file.');
    }
    const size = Number(data.size);
    if (!Number.isSafeInteger(size) || size > MAX_BYTES) {
      throw new DriveStoreError('TOO_LARGE', 'Google Drive JSON database exceeds the 5 MB storage limit.');
    }
    return { version: data.version, size, checksum: data.md5Checksum.toLowerCase() };
  }

  private async request(url: string, method: 'GET' | 'PATCH', body?: string, retries = this.retries): Promise<string> {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new DriveStoreError('UNAVAILABLE', 'Google Drive request timed out.', method === 'PATCH', true));
          }, this.timeoutMs);
        });
        const operation = async (): Promise<string> => {
          let token: string | null | undefined | { token?: string | null };
          try {
            token = await this.auth.getAccessToken();
          } catch {
            throw new DriveStoreError('AUTH', 'Google Drive authentication failed. Check server credentials.');
          }
          const accessToken = typeof token === 'string' ? token : token?.token;
          if (!accessToken) throw new DriveStoreError('AUTH', 'Google Drive authentication did not provide an access token.');
          // The auth promise can finish after the deadline; never start a late upload.
          if (controller.signal.aborted) throw new DriveStoreError('UNAVAILABLE', 'Google Drive request timed out.', false, true);
          const response = await this.transport(url, {
            method,
            redirect: 'error',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
            },
            body,
            signal: controller.signal,
          });
          if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            const transient = response.status === 429 || response.status >= 500;
            const code = response.status === 409 || response.status === 412 ? 'CONFLICT'
              : response.status === 401 ? 'AUTH'
                : response.status === 403 ? 'PERMISSION'
                  : response.status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE';
            throw new DriveStoreError(code, `Google Drive request failed (HTTP ${response.status}).`, method === 'PATCH' && response.status >= 500, transient, response.status);
          }
          const declaredSize = response.headers.get('content-length');
          if (declaredSize !== null && (!/^[0-9]+$/.test(declaredSize) || Number(declaredSize) > MAX_BYTES)) {
            await response.body?.cancel().catch(() => undefined);
            throw new DriveStoreError('TOO_LARGE', 'Google Drive response exceeds the 5 MB storage limit.', method === 'PATCH');
          }
          if (!response.body) throw new DriveStoreError('INVALID_DATA', 'Google Drive returned an empty response.', method === 'PATCH');
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > MAX_BYTES) {
                await reader.cancel().catch(() => undefined);
                throw new DriveStoreError('TOO_LARGE', 'Google Drive response exceeds the 5 MB storage limit.', method === 'PATCH');
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          return Buffer.concat(chunks).toString('utf8');
        };
        return await Promise.race([operation(), deadline]);
      } catch (error) {
        const safeError = error instanceof DriveStoreError ? error
          : new DriveStoreError('UNAVAILABLE', 'Google Drive could not be reached.', method === 'PATCH', true);
        if (!safeError.retryable || attempt >= retries) throw safeError;
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
      await this.backoff(attempt);
    }
  }

  private validateJson(content: string): void {
    if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
      throw new DriveStoreError('TOO_LARGE', 'Google Drive JSON database exceeds the 5 MB storage limit.');
    }
    try {
      JSON.parse(content);
    } catch {
      throw new DriveStoreError('INVALID_DATA', 'Google Drive database is not valid JSON.');
    }
  }

  private checksum(content: string): string {
    return createHash('md5').update(content, 'utf8').digest('hex');
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = Math.min(this.retryDelayMs * 2 ** attempt, 10_000);
    if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}
