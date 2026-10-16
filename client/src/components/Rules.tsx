import { CARD_INFO, DECK_COUNTS, type CardType } from '../../../shared/src';
import CardView from './CardView';

const ACTION_TYPES = (Object.keys(CARD_INFO) as CardType[]).filter(
  (t) => !CARD_INFO[t].isCat && (t === 'exploding' || DECK_COUNTS[t as keyof typeof DECK_COUNTS] > 0),
);
const CAT_TYPES = (Object.keys(CARD_INFO) as CardType[]).filter((t) => CARD_INFO[t].isCat);

export default function Rules() {
  return (
    <div className="rules">
      <section>
        <h3>🎯 Mục tiêu</h3>
        <p>Là người cuối cùng không bị nổ. Mỗi người được chia 1 Gỡ Bom; trong chồng bài có số Mèo Nổ bằng số người chơi.</p>
      </section>
      <section>
        <h3>🔁 Một lượt chơi</h3>
        <ol>
          <li>Đánh bao nhiêu lá tuỳ thích (hoặc không đánh lá nào).</li>
          <li>
            Kết thúc lượt bằng cách <b>rút 1 lá</b> từ chồng bài.
          </li>
          <li>Rút trúng Mèo Nổ: có Gỡ Bom thì được cứu và bí mật nhét bom lại, không có thì bị loại.</li>
        </ol>
        <p className="muted">
          Mỗi lần có người đánh bài, mọi người có 4 giây để đánh <b>Nope</b>. Hết lượt sau 90 giây sẽ tự động rút bài.
        </p>
      </section>
      <section>
        <h3>👆 Cách thao tác</h3>
        <ul>
          <li>Tới lượt bạn, lá nào <b>sáng viền vàng</b> là bấm vào đánh luôn được. Lá mờ là lúc này chưa đánh được.</li>
          <li>Xin Bài / đôi / ba mèo: bấm lá → hộp thoại hiện ra để chọn người (và chọn lá muốn đòi).</li>
          <li>Có người vừa đánh bài: lá Nope trên tay sáng lên, bấm vào (hoặc nút NOPE! giữa bàn) để chặn.</li>
          <li>Combo 5 lá khác loại: bấm "Chọn nhiều lá", chọn đủ 5 lá rồi bấm "Chọn lá →".</li>
          <li>Rê chuột (hoặc nhấn giữ trên điện thoại) vào lá bất kỳ để xem phóng to và giải thích.</li>
        </ul>
      </section>
      <section>
        <h3>🃏 Lá chức năng</h3>
        <div className="rules-grid">
          {ACTION_TYPES.map((t, i) => (
            <div key={t} className="rule-item">
              <CardView type={t} seed={i} size="sm" />
              <div>
                <b>{CARD_INFO[t].name}</b>
                <span className="muted">
                  {t === 'exploding' ? ' · mỗi người 1 lá trong chồng bài' : t === 'defuse' ? ' · mỗi người 1 lá' : ` × ${DECK_COUNTS[t as keyof typeof DECK_COUNTS]}`}
                </span>
                <p>{CARD_INFO[t].desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>🐱 Mèo thường &amp; combo</h3>
        <div className="cat-row">
          {CAT_TYPES.map((t, i) => (
            <CardView key={t} type={t} seed={i} size="xs" />
          ))}
        </div>
        <ul>
          <li>
            <b>Đôi</b> (2 lá mèo giống nhau): chọn 1 người, rút ngẫu nhiên 1 lá của họ.
          </li>
          <li>
            <b>Bộ ba</b> (3 lá giống nhau): chọn 1 người và gọi tên lá muốn lấy. Họ có thì phải đưa.
          </li>
          <li>
            <b>5 lá khác tên nhau</b> (lá gì cũng được): lấy 1 lá bất kỳ trong chồng bài đã đánh (trừ Mèo Nổ).
          </li>
        </ul>
      </section>
    </div>
  );
}
