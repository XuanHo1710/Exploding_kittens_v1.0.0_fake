const STORAGE_ACCESS = 'eldoria_access_token';
const STORAGE_REFRESH = 'eldoria_refresh_token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: any,
  ) {
    super(message);
  }
}

class ApiClientImpl {
  private accessToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_ACCESS) : null;
  private refreshToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_REFRESH) : null;

  public setTokens(access: string | null, refresh: string | null): void {
    this.accessToken = access;
    this.refreshToken = refresh;
    if (typeof localStorage !== 'undefined') {
      if (access) localStorage.setItem(STORAGE_ACCESS, access);
      else localStorage.removeItem(STORAGE_ACCESS);
      if (refresh) localStorage.setItem(STORAGE_REFRESH, refresh);
      else localStorage.removeItem(STORAGE_REFRESH);
    }
  }

  public getAccessToken(): string | null {
    return this.accessToken;
  }

  private makeIdempotencyKey(): string {
    return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  public async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
    options?: { idempotent?: boolean; skipAuth?: boolean; retryOn401?: boolean },
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!options?.skipAuth && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    if (options?.idempotent) {
      headers['X-Idempotency-Key'] = this.makeIdempotencyKey();
    }

    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && !options?.skipAuth && options?.retryOn401 !== false && this.refreshToken) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(method, path, body, { ...options, retryOn401: false });
      }
    }

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { message: text };
    }

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      if (json?.message) {
        msg = Array.isArray(json.message) ? json.message.join(', ') : String(json.message);
      } else if (json?.fieldErrors || json?.formErrors) {
        const parts: string[] = [];
        if (Array.isArray(json.formErrors)) {
          parts.push(...json.formErrors.map(String));
        }
        if (json.fieldErrors && typeof json.fieldErrors === 'object') {
          for (const [field, errs] of Object.entries(json.fieldErrors)) {
            if (Array.isArray(errs) && errs.length > 0) {
              parts.push(`${field}: ${errs.join(', ')}`);
            }
          }
        }
        if (parts.length > 0) msg = parts.join(' • ');
      }
      throw new ApiError(res.status, msg, json);
    }
    return json as T;
  }

  private async tryRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const data = await this.request<{ accessToken: string; refreshToken: string }>(
        'POST',
        '/api/v1/auth/refresh',
        { refreshToken: this.refreshToken },
        { skipAuth: true, retryOn401: false },
      );
      this.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      this.setTokens(null, null);
      return false;
    }
  }
}

export const apiClient = new ApiClientImpl();
