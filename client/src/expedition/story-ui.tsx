/**
 * Cảnh phim cốt truyện (letterbox, thẻ tiêu đề chương, chữ chạy, chân dung người nói, danh đề kết)
 * và sổ "Hành Trình" để xem lại các chương đã mở.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EXPEDITION_BOSSES_BY_ID,
  EXPEDITION_STORY,
  STORY_CHAPTERS,
  STORY_SPEAKERS,
  type ExpeditionProfile,
  type StoryScene,
} from '../../../shared/src';
import { expeditionAssetUrl } from './store';
import { playExpeditionSfx } from './sound';

function Portrait({ portrait }: { portrait?: string }) {
  if (!portrait) return null;
  const [kind, id] = portrait.split(':');
  if (kind === 'hero') {
    return <img className="exp-story-portrait" src={expeditionAssetUrl(`units/heroes/${id}-portrait.png`)} alt="" />;
  }
  const key = EXPEDITION_BOSSES_BY_ID[id]?.spriteKey ?? id;
  return (
    <div
      className="exp-story-portrait boss"
      style={{
        backgroundImage: `url(${expeditionAssetUrl(`units/bosses/${key}-battle.png`)})`,
      }}
    />
  );
}

const MOOD_GRADIENT: Record<StoryScene['mood'], string> = {
  dawn: 'linear-gradient(180deg, #f59e0b33 0%, #0000 45%, #1e1b4bcc 100%)',
  day: 'linear-gradient(180deg, #0000 0%, #0f172acc 100%)',
  dusk: 'linear-gradient(180deg, #7c2d1255 0%, #1e1b4bdd 100%)',
  night: 'linear-gradient(180deg, #020617aa 0%, #0f172aee 100%)',
  void: 'linear-gradient(180deg, #000000ee 0%, #111827dd 100%)',
  aurora: 'linear-gradient(180deg, #a855f744 0%, #22d3ee22 40%, #0f172add 100%)',
};

export function StoryPlayer({ scene, onDone }: { scene: StoryScene; onDone: () => void }) {
  const [phase, setPhase] = useState<'card' | 'lines' | 'credits' | 'out'>('card');
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const doneRef = useRef(false);
  const line = scene.lines[idx];
  const full = line?.text ?? '';
  const speaker = STORY_SPEAKERS[line?.speaker ?? 'narrator'] ?? STORY_SPEAKERS.narrator;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('out');
    window.setTimeout(onDone, 520);
  }, [onDone]);

  useEffect(() => {
    playExpeditionSfx('confirm');
    const t = window.setTimeout(() => setPhase((p) => (p === 'card' ? 'lines' : p)), 2100);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== 'lines') return;
    setTyped(0);
    const id = window.setInterval(() => setTyped((n) => (n >= full.length ? n : n + 2)), 22);
    return () => window.clearInterval(id);
  }, [phase, idx, full]);

  const advance = useCallback(() => {
    if (phase === 'card') return setPhase('lines');
    if (phase === 'credits') return finish();
    if (phase !== 'lines') return;
    if (typed < full.length) return setTyped(full.length);
    if (idx + 1 < scene.lines.length) {
      setIdx(idx + 1);
      return;
    }
    if (scene.credits) setPhase('credits');
    else finish();
  }, [phase, typed, full.length, idx, scene.lines.length, scene.credits, finish]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 'e') {
        e.preventDefault();
        e.stopPropagation();
        advance();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [advance, finish]);

  return (
    <div className={`exp-story phase-${phase}`} onClick={advance}>
      <div className="exp-story-bg" style={{ backgroundImage: `url(${expeditionAssetUrl(`battle-scenes/${scene.bgMapId}/backdrop.png`)})` }} />
      <div className="exp-story-mood" style={{ background: MOOD_GRADIENT[scene.mood] }} />
      <div className="exp-story-bar top" />
      <div className="exp-story-bar bottom" />
      {phase === 'card' && (
        <div className="exp-story-card">
          <small>{scene.chapter === 0 ? 'MỞ ĐẦU' : scene.chapter >= 8 ? 'HỒI KẾT' : `CHƯƠNG ${scene.chapter}`}</small>
          <h1>{scene.titleVi}</h1>
          {scene.subtitleVi && <p>{scene.subtitleVi}</p>}
        </div>
      )}
      {phase === 'lines' && line && (
        <div className={`exp-story-dialog ${speaker.nameVi ? '' : 'narration'}`} key={idx}>
          <Portrait portrait={speaker.portrait} />
          <div className="exp-story-text">
            {speaker.nameVi && (
              <b className="exp-story-name" style={{ color: speaker.color }}>
                {speaker.nameVi}
              </b>
            )}
            <p>{full.slice(0, typed)}</p>
            <span className="exp-story-next">{typed >= full.length ? (idx + 1 < scene.lines.length || scene.credits ? '▼' : '■') : ''}</span>
          </div>
        </div>
      )}
      {phase === 'credits' && (
        <div className="exp-story-credits">
          <h1>ASTRAL EXPEDITION</h1>
          <h2>Bản Hòa Ca Bảy Sắc</h2>
          <p>Cảm ơn bạn đã đồng hành cùng Đoàn Thám Hiểm Tinh Tú.</p>
          <p>Các Đại Trùm có thể tái đấu · Đàn quái vẫn lang thang · Bùa Hộ Mệnh còn chờ bạn thu thập.</p>
          <small>Nhấn để tiếp tục hành trình</small>
        </div>
      )}
      <div className="exp-story-ui">
        <span>
          {phase === 'lines' ? `${idx + 1}/${scene.lines.length}` : ''} · <kbd>SPACE</kbd> tiếp
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            finish();
          }}
        >
          Bỏ qua ⏭
        </button>
      </div>
    </div>
  );
}

/** Màn chuyển cảnh ngắn (vào trận / qua vùng). */
export function SceneTransition({ kind, label }: { kind: 'battle' | 'warp' | 'boss'; label?: string }) {
  return (
    <div className={`exp-transition ${kind}`}>
      {label && <div className="exp-transition-label">{label}</div>}
    </div>
  );
}

export function JournalView({ profile, onReplay }: { profile: ExpeditionProfile; onReplay: (s: StoryScene) => void }) {
  const seen = new Set(profile.storySeen ?? []);
  const reached = Math.max(0, ...EXPEDITION_STORY.filter((s) => seen.has(s.sceneId)).map((s) => s.chapter));
  return (
    <div className="exp-journal">
      <section className="exp-card">
        <h3>
          Hành Trình · Bản Hòa Ca Bảy Sắc <small>— {seen.size}/{EXPEDITION_STORY.length} cảnh đã xem</small>
        </h3>
        <div className="exp-journal-progress">
          {STORY_CHAPTERS.map((c) => (
            <span key={c.chapter} className={c.chapter <= reached ? 'on' : ''} title={c.titleVi}>
              {c.chapter === 0 ? '◆' : c.chapter >= 8 ? '★' : c.chapter}
            </span>
          ))}
        </div>
      </section>
      {STORY_CHAPTERS.map((c) => {
        const scenes = EXPEDITION_STORY.filter((s) => s.chapter === c.chapter);
        const any = scenes.some((s) => seen.has(s.sceneId));
        return (
          <section key={c.chapter} className={`exp-card exp-journal-ch ${any ? '' : 'locked'}`}>
            <h3>{any ? c.titleVi : `${c.chapter === 0 ? 'Mở Đầu' : c.chapter >= 8 ? 'Hồi Kết' : `Chương ${c.chapter}`} — ???`}</h3>
            <div className="exp-journal-scenes">
              {scenes.map((s) =>
                seen.has(s.sceneId) ? (
                  <button key={s.sceneId} onClick={() => onReplay(s)}>
                    ▶ {s.titleVi}
                  </button>
                ) : (
                  <span key={s.sceneId} className="locked">
                    🔒 {s.trigger.kind === 'pre_boss' ? 'Trước trận Trùm' : s.trigger.kind === 'post_boss' ? 'Sau trận Trùm' : 'Chưa khám phá'}
                  </span>
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
