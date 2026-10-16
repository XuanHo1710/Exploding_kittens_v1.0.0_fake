import { isValidAvatar, type Identity } from '../../shared/src';

/** Thông tin người chơi lưu trên trình duyệt: id, tên, đường dẫn avatar */
const KEY = 'meono.identity';

/** crypto.randomUUID chỉ có trên https/localhost, mở qua IP LAN thì phải tự sinh */
function genId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('-');
}

export function loadIdentity(): Identity | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw?.playerId && raw?.name) {
      return {
        playerId: raw.playerId,
        name: raw.name,
        avatar: isValidAvatar(raw.avatar) ? raw.avatar : undefined,
        token: typeof raw.token === 'string' ? raw.token : undefined,
      };
    }
  } catch {
    /* localStorage hỏng hoặc bị chặn */
  }
  return null;
}

function persist(identity: Identity) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...identity, updatedAt: Date.now() }));
  } catch {
    /* vẫn chơi được, chỉ là tải lại trang sẽ phải nhập lại */
  }
  return identity;
}

export function saveIdentity(name: string, prev?: Identity | null): Identity {
  return persist({ playerId: prev?.playerId ?? genId(), name: name.trim().slice(0, 20), avatar: prev?.avatar });
}

/** Đổi tên / avatar, giữ nguyên playerId */
export function updateIdentity(prev: Identity, patch: Partial<Pick<Identity, 'name' | 'avatar'>>): Identity {
  return persist({
    ...prev,
    ...patch,
    name: (patch.name ?? prev.name).trim().slice(0, 20) || prev.name,
  });
}

/** Lưu sau khi tạo tài khoản / đăng nhập bằng PIN */
export function saveAccountIdentity(acc: { playerId: string; name: string; avatar?: string }, token: string): Identity {
  return persist({ playerId: acc.playerId, name: acc.name, avatar: acc.avatar, token });
}

/** Đăng xuất: xoá thông tin trên trình duyệt này */
export function clearIdentity() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
}

export { genId };
