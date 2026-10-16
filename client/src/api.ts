import type { AccountInfo } from '../../shared/src';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message ?? 'Có lỗi, thử lại nhé');
  return json as T;
}

export type AuthResult = { token: string; account: AccountInfo };

export const registerAccount = (playerId: string, name: string, pin: string, avatar?: string) =>
  post<AuthResult>('/api/account/register', { playerId, name, pin, avatar });

export const loginAccount = (name: string, pin: string) => post<AuthResult>('/api/account/login', { name, pin });
