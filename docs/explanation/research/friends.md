# Friends (kết bạn): prior art, Mons constraints and a proposed design

Research for the Mons friend system (2026-11-19). Scope from the user: friends can (1) **see where each other are on the
overview map**, (2) **tap another player to see a Trainer Card style profile**, (3) **trade** and (4) **challenge each
other to a battle (PvP)**. Whispers / direct messages are out of scope. This is research and a proposal only: no code,
no migration. Open questions are in §10; nothing here is decided until the user answers them.

**Status (2026-11-19):** the user accepted the recommended defaults ("ok"); F1 (list, requests, blocks, presence,
the player card, BẢN ĐỒ) is built as [decisions.md §27](../../agents/decisions.md); trade (S6) and PvP (S7) are next.

**Sources.** Primary: the Gen 3 decompilation `pret/pokeemerald` on GitHub (files named below). Near-primary / secondary:
Bulbapedia (the community encyclopedia, used only where no decompilation or official manual exists: the Gen 4 Pal Pad,
the Union Room wording, Union Circle, Pokémon HOME friend trade). Pokémon GO friend levels, gifts and trade costs could
**not** be fetched in this session (the pages were blocked or empty), so they are quoted from general knowledge and are
marked *unverified* below; nothing in the design depends on them. The repo itself is cited as `file:line`.

## 1. Prior art

### 1.1 Gen 3 Emerald: PokéNav Match Call (a list of trainers you "registered")
- Source: [`src/match_call.c`](https://github.com/pret/pokeemerald/blob/master/src/match_call.c),
  [`src/pokenav_match_call_list.c`](https://github.com/pret/pokeemerald/blob/master/src/pokenav_match_call_list.c).
- Registration is a **one-way, offline flag**: a trainer you beat and exchanged numbers with sets
  `TRAINER_REGISTERED_FLAGS_START + i` (`GetNumRegisteredTrainers`). The trainer never "accepts" anything.
- The app lists the registered trainers (name, class, location text) and lets you call one; a call is a short scripted message,
  not a chat.
- Calls also arrive by themselves: `InitMatchCallCounters` sets a minutes + step counter, `UpdateMatchCallStepCounter`
  fires every **10 steps** (plus a 10-minute clock gate), then `SelectMatchCallTrainer` picks a random registered
  trainer. A rematch is offered only if `TrainerIsEligibleForRematch` (`trainerRematches[id] > 0`).
- Take for Mons: the **list-of-people app inside the PokéNav** is the right Gen 3 home for a friend list (row = name, class
  / sprite, place). The "random call every 10 steps" is a notification model we can borrow for "NAM is online" toasts,
  but it is not needed for F1.

### 1.2 Gen 3 Emerald: Trainer Card (what a player profile contains)
- Source: [`include/trainer_card.h`](https://github.com/pret/pokeemerald/blob/master/include/trainer_card.h),
  [`src/trainer_card.c`](https://github.com/pret/pokeemerald/blob/master/src/trainer_card.c).
- `struct TrainerCard`: `gender`, `stars`, `hasPokedex`, `caughtMonsCount`, `trainerId` (shown as `IDNo`),
  `playTimeHours/Minutes`, `linkBattleWins/Losses`, `pokemonTrades`, `contestsWithFriends`, `money`,
  `easyChatProfile[4]` (a four-word profile phrase), `playerName`, `unionRoomClass`, badges (read from flags), and in FRLG
  six `monSpecies` icons. The card of **another player** is built in a link by `TrainerCard_GenerateCardForLinkPlayer`
  and shown with `ShowTrainerCardInLink`.
- `trainerId % NUM_UNION_ROOM_CLASSES` picks the Union Room class sprite (`unionRoomClass`): a deterministic avatar from the
  id (the same idea as a short code derived from the account id).
- Take for Mons: the profile card in the Mons style is exactly these fields (§4.2). Counters "link wins / losses / trades"
  become real once S6 / S7 exist.

### 1.3 Gen 3 Cable Club / Union Room (meeting people)
- Gen 3 has **no friend list**: you meet whoever is in the room. Union Room (FRLG / Emerald wireless adapter): players
  appear as trainer-class sprites, "Greetings" shows the other's Trainer Card as text (level, Pokédex count, play time,
  wins / losses, trades, profile phrase), plus chat, trade and battle (Bulbapedia, Union Room; the room size and activity
  table is in `src/union_room.c`, not read in detail here).
- Take for Mons: matches the user's scope: **tap a player, read a card, then invite to trade / battle**. Trade and
  battle in Gen 3 happen at a Pokémon Center counter (Cable Club, 2F). Mons does **not** copy the counter: the user decided that trade and PvP start anywhere (§5).

### 1.4 Gen 4 Pal Pad (friend codes, mutual registration)
- Source: Bulbapedia "Pal Pad" (no primary source). Each game has a Friend Code; to play online both players must register
  the **other's code in their own Pal Pad** (mutual). Up to **32 friends**. It also stores per-friend counters (trades,
  Wi-Fi wins / losses). Friends are auto-registered by trading in the Union Room.
- Take for Mons: **mutual consent** (request + accept) is the safe model; a short code is the fallback when the other is
  not on screen; a cap (32 is a Pokémon precedent) is cheap abuse control.

### 1.5 Modern friend lists (brief)
- **Pokémon HOME** (Bulbapedia): "Friend Trade" with friends registered in HOME; limit of **10 trades per day**.
  Take: a daily cap per friend pair is a known, accepted anti-abuse rule.
- **Scarlet / Violet Union Circle** (Bulbapedia): no persistent friend list; up to **4** players join through a Link Code,
  then trade, battle and explore together. Take: a **short-lived invite** (code or proximity) is enough for co-op
  activities, and it fits "invite, then both meet".
- **Pokémon GO** (*unverified in this session*): friend codes, a friend cap in the hundreds, friendship levels that grow
  with daily interaction, gifts, and trade costs in Stardust that drop with the friendship level. Take: levels and gifts are
  a retention mechanic; **not wanted here** (Gen 3 look, internal members, gifts blocked by the inbox problem, §2).

### 1.6 What fits a Gen 3 look
A **PokéNav-style list** (rows with a small sprite, name, place), a **Trainer Card** layout with the existing Mons UI
kit, a **Match Call style toast** for online / request events, and a **request / accept** flow for trade and battle (no counter, §5). Avoid
friendship levels, daily rewards and any feed.

## 2. Mons constraints (from the code)

| # | Fact | Where | Consequence |
|---|---|---|---|
| 1 | Trainer (display) names are **not unique** ("two players may both be NAM"). | [`server/migrations/002-display-name.sql`](../../../server/migrations/002-display-name.sql) | A friend cannot be added by trainer name. |
| 2 | The account name is unique and is the **login credential**. | [`001-init.sql`](../../../server/migrations/001-init.sql) `accounts.name_key UNIQUE`; `LIMITS.nameMin/Max` in [`protocol.ts`](../../../game/src/net/protocol.ts) | Never expose it (not in a profile, a request, a code). Only `display_name` (fallback to the account name, as `recentChat` does: `COALESCE(a.display_name, a.name)`, [`server/db.ts:74`](../../../server/db.ts)). Careful: the fallback itself shows the login name for accounts without a display name; the friend system should require a display name or show "Huấn luyện viên #code". |
| 3 | `PlayerView.id` and `ChatLine.from` carry the **account id**; the `online` message sends **names only, no ids**. | [`protocol.ts:116-126`](../../../game/src/net/protocol.ts), [`protocol.ts:166`](../../../game/src/net/protocol.ts), [`hub.ts:418-434`](../../../server/hub.ts) | Add-by-tap works today for players on the same map (presence) and for chat lines. The online list needs ids to be tappable (extend `online` with `{id, name}[]`, a protocol change; keep it erasable TypeScript, `protocol.ts:1-5`). |
| 4 | The hub keeps a `players` map; a dropped socket stays "present" for `LIMITS.leaveGraceMs` (8 s) via `leaveTimer`. | [`hub.ts:31-34`](../../../server/hub.ts), [`hub.ts:288`](../../../server/hub.ts), `LIMITS.leaveGraceMs` ([`protocol.ts:27`](../../../game/src/net/protocol.ts)) | "Online" = id in `players`; a reconnect inside the grace window must not flicker the friend's dot. |
| 5 | Offline state is only in `saves`: queryable copies `trainer, avatar, money, badges, map, x, y, party, dex_caught, play_seconds, updated_at`. | [`001-init.sql`](../../../server/migrations/001-init.sql) `saves`; filled by [`validate.ts:83`](../../../server/validate.ts) | Last place and profile numbers for an offline friend come from one indexed row, without parsing the 512 KB payload. They lag until the friend saves (LƯU / autosave). |
| 6 | The live place of an online player is `Player.map` and `PlayerView.x/y` in the hub. | [`hub.ts:31`](../../../server/hub.ts), `enter` / `pos` messages | Live location needs no save at all. |
| 7 | **A server edit of a save is undone by the open tab** (on a save conflict the client re-sends its own state). | [`decisions.md`](../../agents/decisions.md) §24, the `avatar_override` story | The server must never push a gift or a traded Pokémon into the save JSON. Anything delivered later (gifts, mail) needs a **client-claimed inbox**: a server table the client reads and acknowledges, applying the change to its own GAME. Trade and PvP avoid this by running **while both are online** and returning the result as a message (§6). |
| 8 | One live tab per account; a new login kicks the old one. | [`hub.ts:121-125`](../../../server/hub.ts), `kicked: "elsewhere"` | Friend state is per account, not per socket; invites must be dropped on `kicked` / `leave`. |
| 9 | Chat rate limit exists: one line per `LIMITS.chatGapMs`. | [`hub.ts:405-416`](../../../server/hub.ts) | Reuse the pattern (`Conn.lastChat`) for request rate limits. |
| 10 | `PokéNav` is a **single screen** (spawn list), opened from the start menu entry `POKÉNAV`; there are **no app tabs**. | [`PokeNav.ts:87`](../../../game/src/scenes/PokeNav.ts), [`World.ts:1769`](../../../game/src/scenes/World.ts) | A friend app means adding an app switcher to the PokéNav, or a separate start-menu entry. |
| 11 | The start menu is MONDEX, ĐỘI HÌNH, TÚI ĐỒ, THẺ, LƯU, CÀI ĐẶT, THOÁT (plus POKÉNAV). `THẺ` is a text dialog of the local player's own data. | [`World.ts:1755-1783`](../../../game/src/scenes/World.ts) | `THẺ` is the natural place to grow a real Trainer Card scene that other players' cards reuse. |
| 12 | There is **no overview-map screen** in the client. What exists: the round minimap (49 px, current map only, others as coloured dots from `otherPlayers()`), and the stitched world image `assets/maps/world.png` with `assets/maps/world.json` (`overview_px: 2`, `maps: slug -> [x, y]` offsets in cells, 30 maps) built for the map tooling. | [`minimap.ts:19-23`](../../../game/src/minimap.ts), [`minimap.ts:179`](../../../game/src/minimap.ts), [`assets/maps/world.json`](../../../assets/maps/world.json) | "See where friends are on the overview map" needs a **new overview screen** (§4.1); `world.json` already gives the cell offset of every outdoor map, so a marker is `offset + (x, y)`. Interiors and caves are not in the stitched image. |

Abuse surface (internal members, but open registration, `decisions.md` §24): friend spam, harassment through requests,
a stranger learning another player's position, and a client claiming a wrong id. Controls: ids are validated on the
server, block list, request rate limit, friend cap, pending cap.

## 3. Identity: how two players find each other

Options (the first is recommended as the main path, the second as the fallback):

1. **Tap a player on the map or a chat line.** Both already carry the account id (constraint 3). The client sends
   `friend.request {to: id}`. No typing, works with duplicate names.
2. **Friend code.** A short code derived from the account id, e.g. 6 characters of Crockford base32 of
   `HMAC(server_secret, id)` truncated, shown on the Trainer Card as `MÃ BẠN: K7QM2X`, looked up by the server in a
   table column (`accounts.friend_code`, indexed, unique) so it is not guessable from sequential ids and is not the login
   name. Used when the other player is not on screen (different map, offline). Mirrors the Pal Pad friend code (§1.4)
   and the id-derived Union Room class (§1.2).
3. (Add from the online list.) Needs the protocol change in constraint 3; low value over option 1, so optional.

Recommendation: 1 + 2. Do not add by name.

## 4. The four features

### 4.1 See friends on the overview map

**UI.** A new **overview screen** ("BẢN ĐỒ" in the start menu or a PokéNav app; the minimap stays local). It draws
`world.png` (scaled by integer, no smoothing, `game/AGENTS.md`), the Player's marker, and a small coloured dot or mini
sprite per friend. A dot is solid when the friend is online and hollow / grey when offline (last place from `saves.map`).
Tap a dot → the profile (§4.2). Friends in interiors or caves not in `world.json` are drawn at the nearest outdoor map
(their parent map / door) with a house or cave glyph, or listed under "Trong nhà / Trong hang". `build_assets.py` has to
export `world.png` and `world.json` into the game (they are generated assets; it is the only bridge, `game/AGENTS.md`).

**Data.** Two sources, by state:
- Online friend: live `(map, x, y)` from the hub, **pushed to the friend's friends only** (`friend.loc`), at a low rate
  (on `enter` and at most every 2-5 s while moving; the map screen does not need 10 Hz).
- Offline friend: `saves.map, x, y, updated_at` of the last save (constraint 5), sent once in the friend list.

**Privacy.** Location sharing is **opt-in per account** ("Cho bạn bè xem vị trí", default on or off: open question 2).
A blocked user never gets a location.

### 4.2 Tap a player to see their profile (Trainer Card)

**UI.** A card scene `THẺ` in the Mons UI kit (320×180 / 390×180), the same layout for the local player (replaces the text
dialog, constraint 11) and for others, opened by tapping a player sprite on the map, a chat name, a friend row or a map
dot. Buttons on someone else's card: KẾT BẠN / BẠN BÈ ✓, ĐỔI POKÉMON, THÁCH ĐẤU, CHẶN, ĐÓNG. (Without profile click for
strangers, open question 5.)

**Fields and safety** (all from `saves` copies unless noted; everything here is already visible to others in some form):

| Field | Source | Safe to show? |
|---|---|---|
| Trainer name | `accounts.display_name` | Yes. Never the account name (constraint 2). |
| Sprite | `saves.avatar` (or the admin `avatar_override`) | Yes. |
| Badges | `saves.badges` (count; names need the payload) | Yes. |
| Mondex caught | `saves.dex_caught` | Yes. |
| Play time | `saves.play_seconds` | Yes. |
| Current place | live hub `Player.map`, else `saves.map` | Only if location sharing allows (§4.1). Show the place **name**, not x / y. |
| Party preview (species + level, up to 6) | needs the payload (`party` column is only the count) | Yes, as a snapshot; to avoid parsing the 512 KB payload per view, add queryable columns `party_json` (species, level, shiny) at save time, or build the preview from a small `profile` JSON written by `validate.ts` (migration 004). Nicknames and moves are not shown. |
| Money | `saves.money` | **No** (Trainer Card shows it in Gen 3, but it is only useful for griefing / envy here; keep it private). |
| Exact x / y, last login, IP, audit | n/a | **No.** |
| Link record (wins / losses / trades) | new counters from S6 / S7 | Yes, once they exist. |
| Friend code | `accounts.friend_code` | Yes, on the **own** card; on others' cards only for friends. |
| Profile phrase (Emerald's `easyChatProfile`) | optional new `accounts.profile` (short, Vietnamese, moderated length) | Optional, F-later. |

A profile is fetched by id with `profile.get`; the server answers from the DB and never trusts a client number.

### 4.3 Trade

**What the spec says:** spec 11 §6.6 ([`11-battle-and-save-systems.md`](../spec/11-battle-and-save-systems.md)): A asks B, both
pick one Pokémon, both confirm, the server swaps `mons` rows in one transaction (both still own the uid, not the last
healthy party member, not in battle), logs `trades`, sends both new states, then the trade evolution check runs;
traded Pokémon keep `ot` and always obey. Where it starts is §5 (anywhere). Phase **S6** is "trade (+ trade
evolutions, drop the Lv 37 fallback)". `mons` / `bag` / `dex` rows of §6.3 **do not exist yet** (progress note in the spec):
today a save is the whole GAME JSON.

**Dependency.** Trade cannot ship before S6. Two ways, and the choice is a real design decision:
- *Rows (the spec):* new `mons` table with a stable `uid`, the save's party / box mirrored into it on every save, and the
  swap done in SQL. Risk: constraint 7 again (the open tab holds the authoritative party); the swap result must be
  **sent to the clients as a message that they apply** and then save, not written into the save JSON by the server.
- *Message-apply (smaller):* the server holds a trade session in memory; each client sends its offered Pokémon (the
  server validates it against the client's last accepted save copy), both confirm, the server sends each the other's
  Pokémon as `trade.done {give uid, get mon}`, the client removes / adds and saves, and the server logs it. If a client
  dies between the two messages the trade must be atomic from the server's view: it keeps the session result and replays
  `trade.done` on next hello until acknowledged (`trade.ack`). This is the same client-claimed inbox as for gifts,
  scoped to trades.

**Friends as the entry.** A friend's card has ĐỔI POKÉMON; the friend is the invite target; both must be online.

### 4.4 PvP challenge

**What the spec says:** spec 11 §6.6: both accept, the challenger picks the level rule ("Cấp thật" or "Cấp 50", both
directions, VGC-like), the server builds a `BattleState`, runs the pure core `battle/turn.ts` (`runTurn(state, actions,
rng)`), waits 60 s per turn (random legal move on timeout), sends the same event list to both clients, which only
animate. No EXP, no item loss, HP / PP restored (Gen 3 link battle); stored as `battles (seed, actions)` for replay.
Phase **S7**. The server imports `game/src/battle/*.ts` (erasable syntax only). Where it starts is §5 (anywhere).

**Dependency.** Needs the S7 server battle loop and a `BattleState` builder from the party snapshot (the last saved
party, `validate.ts` checked). It does **not** need S6 rows. It needs a client `Battle.ts` mode that is fed events
instead of rolling them (the spec says clients only animate). Friends are the entry: THÁCH ĐẤU on the card.

## 5. Where trade / PvP can start (decided by the user, 2026-11-19)

Trade and PvP start **anywhere**; there is no Pokémon Center 2F / Cable Club requirement and **nobody is warped**
(spec 11 §6.6 and decisions.md §24 carry the same decision).

- **Flow:** one player sends a request to an **online** player from the player card (tapped on the map, a chat line, the
  friend list or the overview map); the other accepts or declines; then the trade or the battle runs (§4.3, §4.4).
- **Both must be idle in the World** at request, at accept and at start: not in a battle, a menu, an evolution, a shop or a
  text box (the hub already has `away` for "in a battle / menu screen", `PlayerView.away`, `protocol.ts:119`; the client
  also refuses to open the invite when its own scene is not the bare World). A request to an away or offline player
  fails at once with `friend-offline` / `invite-busy`. If either side leaves the idle state, the session is cancelled and
  both are told.
- **Server checks:** the target is online (`Player` in the hub map, not only in the grace window), not blocked either way,
  has no pending trade / PvP session, and the sender is not rate limited. No map or distance check.
- **Consequence for the design:** no warp, no return state, no room rule. The friend overview map (§4.1) is then a
  convenience, not a meeting aid.
- **Strangers:** the same request works between non-friends if the user allows it (open question 6); the protocol is the
  same, only the friend check is a toggle.

## 6. Data model sketch (migration `004-friends.sql`; the next free number after `001-003`)

```sql
-- accounts: a short public code (not the login name, not guessable from the id)
ALTER TABLE accounts ADD COLUMN friend_code TEXT;                 -- NULL until first needed, then UNIQUE (partial index)
CREATE UNIQUE INDEX accounts_friend_code ON accounts(friend_code) WHERE friend_code IS NOT NULL;
ALTER TABLE accounts ADD COLUMN share_location INTEGER NOT NULL DEFAULT 1;

-- one row per direction of a PENDING request
CREATE TABLE friend_requests (
  from_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX friend_requests_to ON friend_requests(to_id);

-- accepted friendship stored once, with a < b (so there is no mirrored duplicate)
CREATE TABLE friends (
  a INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  b INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  since INTEGER NOT NULL,
  PRIMARY KEY (a, b), CHECK (a < b)
);
CREATE INDEX friends_b ON friends(b);

CREATE TABLE blocks (
  blocker INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  blocked INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
);
```

Rules (server enforced, not client): a request needs `from != to`, no block either way, not already friends, request
pending < cap, both sides under the friend cap; a request in the opposite direction **auto-accepts** (mutual intent);
`remove` deletes the `friends` row; `block` also removes the friendship and any pending requests in both directions;
`ON DELETE CASCADE` handles account deletion. Counts use the indexes, no payload parsing.

Later tables, with their phase: S6 `mons` / `trades` (spec 11 §6.3), S7 `battles (seed, actions)`; an `inbox` table only if gifts
are ever built (constraint 7). Trade and battle sessions themselves live in hub memory (they need both sockets).

## 7. Protocol sketch (`game/src/net/protocol.ts`, erasable TS only)

```ts
// client -> server
| { t: "friend.add"; to: number }               // from a tapped player / chat line
| { t: "friend.addCode"; code: string }
| { t: "friend.answer"; from: number; accept: boolean }
| { t: "friend.remove"; id: number }
| { t: "block"; id: number } | { t: "unblock"; id: number }
| { t: "friends.get" }                           // full list on login / open
| { t: "profile.get"; id: number }
| { t: "share"; location: boolean }
| { t: "trade.invite"; to: number } | { t: "trade.answer"; from: number; accept: boolean }
| { t: "trade.offer"; uid: string } | { t: "trade.confirm"; ok: boolean } | { t: "trade.cancel" } | { t: "trade.ack"; id: number }
| { t: "pvp.invite"; to: number; rule: "real" | "lv50" } | { t: "pvp.answer"; from: number; accept: boolean }
| { t: "pvp.action"; turn: number; action: BattleAction }   // S7

// server -> client
| { t: "friends"; list: FriendView[]; incoming: ReqView[]; outgoing: ReqView[]; blocked: ReqView[] }
| { t: "friend.state"; id: number; online: boolean; map?: string }         // map only if shared
| { t: "friend.loc"; id: number; map: string; x: number; y: number }       // throttled, friends only
| { t: "friend.request"; from: ReqView } | { t: "friend.added"; friend: FriendView } | { t: "friend.removed"; id: number }
| { t: "profile"; id: number; card: TrainerCard | null }
| { t: "trade.invite"; from: ReqView } | { t: "trade.update" ... } | { t: "trade.done"; ... }   // S6
| { t: "pvp.invite"; from: ReqView; rule: "real" | "lv50" } | { t: "pvp.start"; ... } | { t: "pvp.turn"; events: ... }   // S7
```

`FriendView = { id, name, sprite, online, place?: string, lastSeen?: number }`; `ReqView = { id, name, sprite }`;
`TrainerCard` = the safe fields of §4.2. New `ERR` codes (Vietnamese): `friend-self`, `friend-exists`, `friend-cap`,
`friend-pending`, `friend-blocked`, `friend-fast`, `friend-code` (not found), `friend-offline` (trade / PvP invite to
someone who is not online), `invite-busy`. The `online` message should become `{ id, name }[]` so it can be tapped.

**Presence.** On login the server sends `friends`; on a friend's join / leave (respecting `leaveGraceMs`, constraint 4)
it sends `friend.state` to the friend's friends. A missing response for an unknown id looks the same as a block (no
account enumeration). Request rate limit: e.g. 10 requests per 10 min per account (like `Conn.lastChat`); friend cap 50
(open question 4); pending incoming cap 20. A request never reveals whether the target blocked you.

## 8. Where it lives in the UI

| Option | For | Against |
|---|---|---|
| **PokéNav app** (list of friends, Match Call spirit) | Gen 3 fit; the PokéNav already exists; "the list of people" is its Gen 3 meaning | The PokéNav today is one screen, so it needs an app switcher first (constraint 10) |
| **Start-menu entry BẠN BÈ** | Simplest, one scene, no refactor | One more row in a menu that is already 8 rows |
| **Inside the Trainer Card (THẺ)** | Matches the Pal Pad: the card holds your code and your friends | A card is for one person; the list is a different screen |

**Recommendation:** a start-menu entry `BẠN BÈ` that opens a list scene (rows: sprite, name, online dot, place), with
tabs `BẠN | LỜI MỜI | CHẶN` and a `BẢN ĐỒ` button for the overview (§4.1); a row opens the profile card (§4.2). Plan the PokéNav
app switcher separately and move the list there later. A Match Call style toast reports "X đã vào" / a request / an
invite, with a setting in CÀI ĐẶT "Thông báo bạn bè" (default: requests and invites only).

**Vietnamese strings (proposal).** BẠN BÈ; KẾT BẠN; ĐÃ LÀ BẠN BÈ; HUỶ KẾT BẠN; LỜI MỜI; ĐÃ GỬI LỜI MỜI; CHẤP NHẬN; TỪ CHỐI;
CHẶN / BỎ CHẶN; MÃ BẠN; NHẬP MÃ BẠN; ONLINE / NGOẠI TUYẾN; "Đang ở <nơi>"; "Lần cuối: <thời gian>"; BẢN ĐỒ; ĐỔI POKÉMON;
THÁCH ĐẤU; "Người này đang bận."; "<Tên> muốn kết bạn với bạn."; "<Tên> mời bạn đổi Pokémon."; "<Tên> thách đấu bạn."; "Cho bạn bè xem vị trí".
Errors: "Danh sách bạn bè đã đầy.", "Bạn đã gửi lời mời rồi.", "Không tìm thấy mã này.", "Bạn gửi lời mời nhanh quá.", "Người này đang ngoại tuyến."

## 9. Phasing

- **F1: list + presence + profile + map.** Migration 004; `friends.get`, add (tap / code), answer, remove, block;
  `online` with ids; online state + place (hub) and last place (`saves`); the Trainer Card scene (own + others'); the
  overview map screen with friend dots (needs `world.png` / `world.json` exported by `build_assets.py`); notifications.
  Depends on nothing server-side that is missing today.
- **F2: trade invites (S6).** Trade sessions and the `trade.*` messages; depends on the S6 pieces of §4.3 (rows or
  message-apply with `trade.ack`); trade evolutions drop the Lv 37 fallback. Entry: player card → ĐỔI POKÉMON, anywhere
  (§5). Daily cap per pair (HOME precedent) optional.
- **F3: PvP invites (S7).** Server battle core + `BattleState` builder + client "events only" Battle mode;
  `pvp.*` messages; level rules; replay rows. Entry: friend card → THÁCH ĐẤU.
- **Deferred:** gifts and mail (need the client-claimed inbox, constraint 7), friendship levels, whispers / direct messages
  (out of scope), friend-only chat rooms.

F2 and F3 are independent of each other and both depend on F1 (ids, online state, blocks). If S6 or S7 is not scheduled,
F1 alone is a complete feature; the card still shows "đổi / thách đấu: sắp có".

## 10. Open questions for the user

1. **Add method:** tap a player / chat line + a short friend code (recommended), or only one of them? Is adding by trainer
   name wanted, knowing it is ambiguous?
2. **Location privacy:** may friends see each other's place and map position by default, with an opt-out, or opt-in? Do
   friends see an offline friend's **last** place?
3. **Overview map:** build a new "BẢN ĐỒ" screen from `world.png`, or only mark friends on the existing minimap when on the
   same map? How should interiors and caves be shown?
4. **Friend cap:** 50 (proposed; the Gen 4 Pal Pad had 32)? Pending request cap?
5. **Profile click for non-friends:** does tapping any player show a card (read-only, KẾT BẠN button), and which fields are
   public to strangers (suggested: name, sprite, badges, Mondex)?
6. **Strangers on the world map:** friends only (recommended), or every online player? **Trade / PvP:** friends only, or
   anyone who is online and idle?
7. **Trade scope:** one-for-one with the §6.6 checks, any additional limits (daily cap, no legendary / no shiny)? Rows
   (S6 as in spec 11) or the message-apply design?
8. **PvP rules:** are "Cấp thật" / "Cấp 50" both offered, and are item use and held items allowed (Gen 3 link battle: no
   item use)?
9. **UI home:** start-menu `BẠN BÈ` now and a PokéNav app later (recommended), or PokéNav only, or inside `THẺ`?
10. **Notifications:** toast for requests / invites only, or also "friend is online"? Sound?
11. **Profile extras:** a profile phrase and link counters (wins / losses / trades) on the card, or only the §4.2 basics?
12. **Display name requirement:** require a chosen trainer name before sending a request (stops the login name showing
    through the `COALESCE` fallback), or show an anonymous label until one is set?
