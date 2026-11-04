# Data Model: Nối Thú Đại Chiến

Các định nghĩa dùng chung đặt ở `shared/src/link.ts`; phần chỉ server dùng ghi chú "(server)".

## Hằng số (shared)

| Tên | Giá trị | Ghi chú |
|---|---|---|
| `LINK_W`, `LINK_H` | 16, 9 | bàn 144 ô |
| `LINK_KINDS` | 36 | loại thú; mỗi loại 4 ô |
| `LINK_MAX_TURNS` | 2 | số lần gấp khúc tối đa |
| `LINK_STAGE1_S` | 150 | |
| `LINK_STAGE2_S` | 180 | |
| `LINK_INTERMISSION_S` | 5 | màn chuyển cảnh "BOSS XUẤT HIỆN" |
| `LINK_COMBO_WINDOW_S` | 3 | |
| `LINK_BOSS_HP` | 4000 | |
| `LINK_CMD_RATE` | 8/s | xô token |
| `LINK_HINT_CD_S` | 15 | gợi ý trừ 5 điểm |

`LINK_CRITTERS: { id, name, color }[36]` là danh sách thú tự thiết kế. Client dùng `id` để chọn hàm vẽ.

## Entities

### Board (server; bản sao gửi client)

| Field | Type | Rule |
|---|---|---|
| `cells` | `Int8Array(144)` | `-1` = trống, `0..35` = loại thú |
| `ice` | `Map<number, number>` | ô → thời điểm hết băng (ms trận). Ô đang băng không chọn và không nối được, nhưng vẫn chặn đường. |
| `seed` | `number` | Cả hai người cùng seed cho mỗi màn |

**Validation**:
- `a ≠ b`.
- Cả hai ô khác `-1` và cùng loại.
- Không ô nào đang băng.
- `findPath(a, b)` trả về đường có số lần rẽ ≤ 2.

**Bất biến**:
- Mỗi loại luôn còn một số chẵn ô.
- Sau mỗi lần nối, xáo bàn hay hết băng, bàn phải còn ít nhất 1 cặp nối được, nếu không thì tự xáo.

### LinkPlayer (server)

| Field | Type | Ghi chú |
|---|---|---|
| `id`, `name`, `bot` | string, string, boolean | |
| `board` | Board | |
| `score1` | number | điểm Màn 1 |
| `damage` | number | sát thương lên boss (Màn 2) |
| `ko` | boolean | ra đòn kết liễu |
| `combo` | number | số cặp liên tiếp; về 0 khi quá 3 giây không nối hoặc nối sai |
| `lastMatchAt` | number | ms trận |
| `thunder` | number 0..100 | thanh Sấm |
| `hintReadyAt` | number | |
| `cleared1` | boolean | đã dọn sạch Màn 1 |
| `tokens` | number | chống spam |
| `resigned` | boolean | |

`total` (tính ra) = `score1 + damage + (ko ? 500 : 0)`.

### Boss (server)

| Field | Type | Ghi chú |
|---|---|---|
| `hp`, `maxHp` | number | 4000 |
| `phase` | 1 \| 2 \| 3 | đổi ở 66% và 33% máu |
| `nextSkillAt` | number | chu kỳ 12 / 9 / 6 giây theo giai đoạn |
| `skillIdx` | number | lần lượt theo vòng: `ice` → `dark` → `shuffle` |
| `darkUntil` | `Record<playerId, number>` | |

### LinkDuel (server) – vòng đời trận

```text
stage1 ──(1 người dọn sạch | hết 150s)──► intermission (5s) ──► stage2 ──(boss hết máu | hết 180s)──► ended
   │                                                                │
   └──────────── 1 người bỏ cuộc / rời phòng ───────────────────────┴──► ended (người còn lại thắng)
```

| Field | Type |
|---|---|
| `stage` | `'stage1' \| 'intermission' \| 'stage2' \| 'ended'` |
| `startedAt`, `stageEndsAt` | number |
| `players` | `[LinkPlayer, LinkPlayer]` |
| `boss` | Boss (chỉ có từ màn 2) |
| `fx` | `LinkFx[]` (xoá sau mỗi lần gửi) |
| `result?` | `{ winnerId?: string; totals: Record<id, number>; reason: string }` |

### LinkFx (shared) – hiệu ứng để client vẽ

| `k` | Dữ liệu | Hiệu ứng |
|---|---|---|
| `match` | `who, a, b, path: number[], combo, pts` | đường nối phát sáng, 2 ô nổ tung, "+pts" |
| `hit` | `who, dmg, long?, combo` | tia sét từ cặp ô bay lên boss, số sát thương, boss giật lùi |
| `super` | `who, dmg` | toàn màn trắng lóe, rung mạnh, sét lớn |
| `skill` | `from, to, kind: 'freeze' \| 'storm'` | chiêu Màn 1 bay sang bàn đối thủ |
| `boss` | `kind: 'ice' \| 'dark' \| 'shuffle' \| 'rage', phase` | boss gầm, đổi giai đoạn, đòn đánh xuống bàn |
| `clear` | `who` | dọn sạch bàn |
| `ko` | `who` | màn kết liễu boss (slow-motion + "K.O.!") |

### LinkConfig (shared)

`{ botLevel: 'easy' | 'normal' | 'hard' }` – mặc định `'normal'`. Chuẩn hoá bằng `normalizeLinkConfig`.

## Quan hệ với hệ thống có sẵn

- `Game` (`server/src/game/game.ts`) giữ `private link?: LinkDuel` và `linkConfig`, giống `ants`/`antsConfig`.
- `RoomView.link?: LinkRoomView` (shared) chứa thông tin công khai: `stage`, tên người chơi và `result`. Trạng thái realtime đi qua `link:state` (xem contracts/socket.md).
- Kết quả trận đi vào luồng payout/hoàn cược sẵn có của `Game`.
