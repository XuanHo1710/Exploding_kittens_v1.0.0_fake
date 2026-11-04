# Contract: sự kiện socket của Nối Thú Đại Chiến

Dùng chung kết nối socket.io và cơ chế xác thực sẵn có. Mọi lệnh đi qua `GameGateway.handle()`, nên phản hồi (ack) theo dạng chuẩn `{ ok: true }` hoặc `{ ok: false, error: string }`.

## Client → Server

### `room:create` (có sẵn)

`{ gameMode: 'link_duel', rules? }` – phòng tối đa 2 người. Có 1 người thì máy vào làm đối thủ khi bắt đầu.

### `link:config` (chủ phòng, khi còn ở phòng chờ)

```ts
{ config: { botLevel: 'easy' | 'normal' | 'hard' } }
```

Lỗi trả về:
- `'Chỉ chủ phòng mới chỉnh được.'`
- `'Ván đã bắt đầu rồi.'`

### `link:cmd` (người chơi trong trận)

```ts
type LinkCommand =
  | { t: 'match'; a: number; b: number }      // chỉ số ô 0..143, a ≠ b
  | { t: 'hint' }                             // hồi 15s, -5 điểm
  | { t: 'skill'; kind: 'freeze' | 'storm' }  // màn 1, cần thunder = 100
  | { t: 'super' }                            // màn 2, cần thunder = 100
  | { t: 'resign' };
```

Lỗi thường gặp:
- `'Trận chưa bắt đầu.'`
- `'Bạn đang xem trận này.'`
- `'Thao tác nhanh quá.'` (vượt 8 lệnh/giây)
- `'Hai ô này không nối được.'`: ack vẫn là `ok: false`, server gửi `fx` rỗng và combo về 0.
- `'Chưa đủ Sấm.'`
- `'Gợi ý đang hồi.'`

Khi `match` thành công, ack có dạng `{ ok: true }`. Kết quả hiển thị đến qua `link:state`.

## Server → Client

### `link:state` (riêng cho từng người, gửi khi có thay đổi, gom trong 50 ms)

```ts
interface LinkState {
  stage: 'stage1' | 'intermission' | 'stage2' | 'ended';
  /** ms còn lại của màn hiện tại */
  left: number;
  me?: {                     // không có nếu là người xem
    cells: number[];         // 144 số, -1 = trống
    ice: [cell: number, msLeft: number][];
    dark: number;            // ms còn bị che bàn
    score1: number; damage: number; combo: number; thunder: number;
    hintIn: number;          // ms tới khi dùng được gợi ý
    hint?: [number, number]; // cặp gợi ý (vừa xin)
  };
  /** đối thủ (người xem nhận cả 2 trong players) */
  foe: { name: string; bot: boolean; filled: number[]; /* 144 bit 0/1: ô còn hay trống */ score1: number; damage: number; combo: number; thunder: number };
  players?: LinkStatePlayer[]; // chỉ gửi cho người xem
  boss?: { hp: number; maxHp: number; phase: 1 | 2 | 3; nextSkillIn: number };
  fx: LinkFx[];              // xem data-model.md
  result?: { winnerId?: string; totals: Record<string, number>; reason: string };
}
```

Đảm bảo:
- Client **không bao giờ** nhận được bàn đầy đủ của đối thủ, chỉ nhận ô nào còn ô nào trống. Nhờ vậy không thể xem đối thủ đang tìm cặp nào.
- `fx` chỉ chứa hiệu ứng mới kể từ lần gửi trước.

### `room:view` (có sẵn)

`RoomView.link` gồm `{ stage, players: {id, name, bot}[], result? }` để hiện phòng chờ, danh sách và bảng kết quả.

## Bất biến server

1. Mọi `match` được kiểm tra lại bằng `findPath` trên bàn của chính người gửi.
2. Chỉ số ô ngoài khoảng `0..143`, hoặc không phải số nguyên, thì báo `'Lệnh không hợp lệ.'`.
3. Lệnh gửi sau khi `stage === 'ended'` hoặc trong lúc `intermission` thì báo `'Chờ chút, màn mới sắp bắt đầu.'`.
