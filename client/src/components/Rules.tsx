import { Cat, Layers, MousePointerClick, Repeat, Target } from 'lucide-react';
import { CARD_INFO, describeCard, roomDeckSummary, type CardType, type DeckCardType, type RoomRules } from '../../../shared/src';
import { RoomPlayerCountContext, RoomRulesContext, useRoomPlayerCount, useRoomRules } from '../roomRulesContext';
import CardView from './CardView';

interface Props {
  rules?: RoomRules;
  playerCount?: number;
}

export default function Rules({ rules: suppliedRules, playerCount: suppliedPlayerCount }: Props) {
  const contextRules = useRoomRules();
  const contextPlayerCount = useRoomPlayerCount();
  const rules = suppliedRules ?? contextRules;
  const playerCount = suppliedPlayerCount ?? contextPlayerCount;
  const deck = playerCount === undefined ? undefined : roomDeckSummary(rules, playerCount);
  const cardCount = (type: CardType) => {
    if (type === 'exploding') {
      if (deck) return `${deck.bombs} lá trong chồng rút`;
      return rules.bombMode === 'fixed' ? `${rules.fixedBombs} lá` : rules.bombMode === 'players' ? 'bằng số người chơi' : 'ít hơn số người chơi 1 lá';
    }
    if (type === 'defuse') return deck ? `${deck.defuses} lá tổng cộng` : `${rules.defusesPerPlayer} lá/người + ${rules.extraDefuses} lá trong chồng rút`;
    return `${rules.cardCounts[type as DeckCardType]} lá`;
  };
  const actionTypes = (Object.keys(CARD_INFO) as CardType[]).filter((type) =>
    !CARD_INFO[type].isCat && (type === 'exploding' || (type === 'defuse' ? rules.defusesPerPlayer + rules.extraDefuses > 0 : rules.cardCounts[type as DeckCardType] > 0)),
  );
  const extraSpecialTypes = (Object.keys(CARD_INFO) as CardType[]).filter((type) =>
    !CARD_INFO[type].isCat && !actionTypes.includes(type),
  );
  const catTypes = (Object.keys(CARD_INFO) as CardType[]).filter((type) => CARD_INFO[type].isCat);
  const matching = rules.comboScope === 'cats' ? 'lá mèo cùng loại (hoặc ghép với Mèo Hoang)' : 'lá cùng loại (kể cả lá chức năng và Gỡ Bom)';

  return (
    <RoomRulesContext.Provider value={rules}>
      <RoomPlayerCountContext.Provider value={playerCount}>
        <div className="rules">
          <section>
            <h3 className="rules-sec-title">
              <Target size={18} /> Luật của phòng
            </h3>
            <p>Là người cuối cùng không bị nổ. Mỗi người bắt đầu với <b>{rules.handSize} lá thường + {rules.defusesPerPlayer} Gỡ Bom</b>. Chồng rút có thêm {rules.extraDefuses} Gỡ Bom.</p>
            <p>Phòng tối đa {rules.maxPlayers} người. {rules.firstPlayer === 'host' ? 'Chủ phòng đi trước.' : 'Người đi trước được chọn ngẫu nhiên.'} Mèo Nổ: {cardCount('exploding')}.</p>
            {deck && <p className="muted">Bộ bài: {deck.totalCards} lá · chia {deck.dealtCards} lá · còn {deck.drawPileCards} lá trong chồng rút khi bắt đầu.</p>}
            <p className="muted">Luật được cả phòng xác nhận trước khi bắt đầu và giữ nguyên suốt ván.</p>
          </section>
          <section>
            <h3 className="rules-sec-title">
              <Repeat size={18} /> Một lượt chơi
            </h3>
            <ol>
              <li>Đánh bao nhiêu lá tuỳ thích (hoặc không đánh lá nào).</li>
              <li>Kết thúc lượt bằng cách <b>rút 1 lá</b> từ chồng bài, hoặc dùng lá kết thúc lượt (Bỏ Lượt, Siêu Bỏ Lượt, Đảo Chiều, Tấn Công, Rút Đáy, Bom Nguyên Tử, Chôn Bài, Đào Sâu).</li>
              <li>Rút trúng Mèo Nổ: có Gỡ Bom thì được cứu; {rules.bombPlacement === 'choose' ? 'bạn bí mật chọn vị trí nhét bom lại' : 'bom được nhét lại ở vị trí ngẫu nhiên'}. Không có Gỡ Bom thì bị loại.</li>
            </ol>
            <p className="muted">
              Mỗi lần có người đánh bài, mọi người có {rules.nopeSeconds} giây để đánh <b>Nope</b>. {rules.nopeChain ? 'Có thể Nope lại một lá Nope.' : 'Mỗi hành động chỉ được Nope một lần.'} Hết {rules.turnSeconds} giây của lượt sẽ tự động rút bài. Khi cần chọn bài đưa{rules.bombPlacement === 'choose' ? ' hoặc vị trí bom' : ''}, bạn có {rules.promptSeconds} giây; hết giờ game chọn ngẫu nhiên.
            </p>
          </section>
          <section>
            <h3 className="rules-sec-title">
              <MousePointerClick size={18} /> Cách thao tác
            </h3>
            <ul>
              <li>Tới lượt bạn, lá nào <b>sáng viền vàng</b> là dùng được. Bấm lá chức năng để đánh; lá cần chọn người / bài bỏ sẽ mở hộp thoại.</li>
              {(rules.allowPair || rules.allowTriple) && <li>Combo: chọn đủ {matching}, rồi bấm đánh đôi hoặc bộ ba. Dùng “Chọn nhiều lá” để ghép lá đa năng hoặc lá chức năng khi phòng cho phép.</li>}
              {rules.allowFive && <li>Combo 5 lá: bấm “Chọn nhiều lá”, chọn 5 lá có tên khác nhau rồi bấm “Chọn lá”.</li>}
              <li>Khi có thể chặn, lá Nope trên tay và nút NOPE! giữa bàn sáng lên.</li>
              <li>Luật nhà: <b>Siêu Bỏ Lượt</b> không bị Nope, đánh ra là có hiệu lực ngay.</li>
              <li>Rê chuột (hoặc nhấn giữ trên điện thoại) vào lá bất kỳ để xem ảnh gốc phóng to và giải thích chi tiết theo luật phòng.</li>
            </ul>
          </section>
          <section>
            <h3 className="rules-sec-title">
              <Layers size={18} /> Lá chức năng đang bật trong phòng
            </h3>
            <div className="rules-grid">
              {actionTypes.map((type, i) => (
                <div key={type} className="rule-item">
                  <CardView type={type} seed={i} size="sm" />
                  <div>
                    <b>{CARD_INFO[type].name}</b><span className="muted"> · {cardCount(type)}</span>
                    <p>{describeCard(type, rules)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          {extraSpecialTypes.length > 0 && (
            <section>
              <h3 className="rules-sec-title">
                <Layers size={18} /> Các lá đặc biệt mở rộng (bật thêm trong Cài đặt phòng)
              </h3>
              <div className="rules-grid">
                {extraSpecialTypes.map((type, i) => (
                  <div key={type} className="rule-item">
                    <CardView type={type} seed={i} size="sm" />
                    <div>
                      <b>{CARD_INFO[type].name}</b><span className="muted"> · {cardCount(type)}</span>
                      <p>{describeCard(type, rules)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section>
            <h3 className="rules-sec-title">
              <Cat size={18} /> Mèo thường, Mèo đa năng &amp; combo
            </h3>
            <div className="cat-row">
              {catTypes.map((type, i) => <div key={type}><CardView type={type} seed={i} size="xs" /><span className="muted small"> × {rules.cardCounts[type as DeckCardType]}</span></div>)}
            </div>
            <ul>
              <li><b>Mèo Hoang:</b> Dùng như bất kỳ lá mèo thường nào khi ghép Đôi (2 lá) hoặc Bộ ba (3 lá).</li>
              <li><b>Đôi:</b> {rules.allowPair ? `2 ${matching}: chọn 1 người, rút ngẫu nhiên 1 lá của họ.` : 'Đã tắt trong phòng này.'}</li>
              <li><b>Bộ ba:</b> {rules.allowTriple ? `3 ${matching}: chọn 1 người và gọi tên lá muốn lấy. Họ có thì phải đưa.` : 'Đã tắt trong phòng này.'}</li>
              <li><b>5 lá khác nhau:</b> {rules.allowFive ? 'Đánh 5 lá có tên khác nhau (lá nào cũng được, trừ Mèo Nổ) để lục chồng bài bỏ và lấy 1 lá bất kỳ về tay.' : 'Đã tắt trong phòng này.'}</li>
            </ul>
          </section>
          <section>
            <h3 className="rules-sec-title">
              🃏 Luật Rút Bài 21 (Xì Dách — Bài Tây 52 lá)
            </h3>
            <ul>
              <li><b>Bộ bài:</b> 52 lá Bài Tây chuẩn (lưu tại <code>database/playing-cards/playing_cards_db.json</code>). Chủ phòng làm <b>Nhà Cái</b>, các người chơi còn lại là <b>Nhà Con</b>.</li>
              <li><b>Cách tính điểm:</b> Lá 2–10 tính điểm tương ứng; J, Q, K tính 10 điểm; Lá Át (A) tính linh hoạt <b>1, 10 hoặc 11 điểm</b> sao cho có lợi nhất và không bị Quắc.</li>
              <li><b>Bộ đặc biệt:</b> <b>Xì Bàng</b> (2 lá Át, hệ số ×3) &gt; <b>Xì Dách</b> (1 Át + 1 lá 10/J/Q/K, hệ số ×2) &gt; <b>Ngũ Linh</b> (rút đủ 5 lá mà tổng ≤ 21 điểm, hệ số ×2).</li>
              <li><b>Đủ tuổi:</b> Nhà Con phải đạt ít nhất <b>16 điểm</b> mới được Dừng bài; Nhà Cái cần ít nhất <b>15 điểm</b> và có quyền bấm <b>Xét bài</b> từng người hoặc Mở bài toàn bàn.</li>
            </ul>
          </section>
          <section>
            <h3 className="rules-sec-title">
              🎴 Luật Tiến Lên Miền Nam (2–4 Người — 13 lá/người)
            </h3>
            <ul>
              <li><b>Thứ tự bài:</b> Độ lớn số: <b>3 &lt; 4 &lt; 5 &lt; 6 &lt; 7 &lt; 8 &lt; 9 &lt; 10 &lt; J &lt; Q &lt; K &lt; A &lt; 2 (Heo)</b>. Độ lớn chất: <b>♠ Bích &lt; ♣ Chuồn &lt; ♦ Rô &lt; ♥ Cơ</b>.</li>
              <li><b>Các bộ hợp lệ:</b> Rác (1 lá), Đôi (2 lá cùng số), Sám cô (3 lá cùng số), Sảnh (≥ 3 lá liên tiếp, không chứa 2), Tứ Quý (4 lá cùng số), 3 Đôi Thông, 4 Đôi Thông.</li>
              <li><b>Luật Chặt Heo / Hàng:</b> 3 Đôi Thông chặt 1 Heo hoặc 3 Đôi Thông nhỏ hơn; Tứ Quý chặt 1 Heo, Đôi Heo, 3 Đôi Thông hoặc Tứ Quý nhỏ hơn; 4 Đôi Thông chặt 1 Heo, Đôi Heo, 3 Đôi Thông, Tứ Quý, 4 Đôi Thông nhỏ hơn (không cần tới vòng).</li>
              <li><b>Tới Trắng:</b> Thắng ngay khi chia bài nếu có Tứ Quý Heo, Sảnh Rồng (3→A), 6 Đôi, hoặc 5 Đôi Thông.</li>
              <li><b>Xếp hạng:</b> Người hết bài đầu tiên về Nhất, những người còn lại đánh tiếp để xếp Nhì, Ba; người cuối cùng còn bài là Bét. Người rời bàn giữa ván tính Bét.</li>
              <li><b>Xu (khi có cược):</b> Nhất ăn cược của Bét, Nhì/Ba hoà vốn. Bị chặt Heo phải trả người chặt; Bét còn Heo trên tay (thối Heo) phải trả người Nhất. Heo đen (♠ ♣) = ½ mức cược, Heo đỏ (♦ ♥) = 1 mức cược. Tới Trắng ăn cả hũ.</li>
            </ul>
          </section>
        </div>
      </RoomPlayerCountContext.Provider>
    </RoomRulesContext.Provider>
  );
}
