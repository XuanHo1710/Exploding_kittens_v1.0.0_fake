import type { AccountInfo } from '../../shared/src';

import { serverUrl } from './serverUrl';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(serverUrl(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message ?? 'Có lỗi, thử lại nhé');
  return json as T;
}

export type AuthResult = { token: string; account: AccountInfo };

export const registerAccount = (playerId: string, name: string, pin: string, avatar?: string) =>
  post<AuthResult>('/api/account/register', { playerId, name, pin, avatar });

export const loginAccount = (name: string, pin: string) => post<AuthResult>('/api/account/login', { name, pin });

/** Huỷ token trên server (lỗi mạng thì bỏ qua: trình duyệt vẫn xoá thông tin đăng nhập) */
export const logoutAccount = (playerId: string, token: string) =>
  post<{ ok: true }>('/api/account/logout', { playerId, token }).catch(() => undefined);
