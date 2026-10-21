/** Link mời vào phòng: ?roomid=ABCD (vẫn nhận ?room=ABCD kiểu cũ) */

const clean = (raw: string | null) => (raw ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

/** Mã phòng trên thanh địa chỉ (rỗng nếu không có / không hợp lệ) */
export function readRoomParam(): string {
  try {
    const qs = new URLSearchParams(window.location.search);
    const code = clean(qs.get('roomid') ?? qs.get('room'));
    return code.length === 4 ? code : '';
  } catch {
    return '';
  }
}

/** Ghi mã phòng lên thanh địa chỉ (không tải lại trang, không thêm lịch sử) để tải lại vẫn vào lại đúng phòng */
export function writeRoomParam(code: string | null) {
  try {
    const url = new URL(window.location.href);
    const current = url.searchParams.get('roomid');
    url.searchParams.delete('room');
    if (code) url.searchParams.set('roomid', code);
    else url.searchParams.delete('roomid');
    if (current === (code || null) && !new URLSearchParams(window.location.search).has('room')) return;
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* trình duyệt chặn thì thôi, không ảnh hưởng việc chơi */
  }
}

/** Link đầy đủ để gửi cho bạn bè */
export function roomInviteUrl(code: string): string {
  return `${window.location.origin}${window.location.pathname}?roomid=${code}`;
}
