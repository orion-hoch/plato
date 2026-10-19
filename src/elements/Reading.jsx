import React, { useEffect, useMemo, useRef, useState } from 'react';
import BoardRichText from '../BoardRichText.jsx';
import { REGISTRY } from '../../shared/elements/registry.mjs';
import './reading.css';

// A reading portion on the page (docs/system-spec.md §15; reading.md §7.3–7.5, §8): a clean document whose title is its
// purpose (the words Plato just said), every sentence an anchor for point_to, the key sentences highlighted. No timer and
// no check-in: the learner reads at their pace, marks it with the pen, asks, or asks to hear it (read_aloud). What the
// page can see of the reading (time on the text, how far they got, look-backs, questions, marks, audio, how much Plato
// said meanwhile) goes to the engine once, as a ReadingEvent, when the engine moves off it or the page is cleared.

/** The reading on the page now, for the page's hooks: hear(learner turn), platoSaid(line), audio(from), end(). */
export const liveReading = { current: null };
const QUESTION = /\?\s*$|^\s*(what|why|how|when|where|who|which|is|are|does|do|can|could|wait)\b/i;
const TERM = /\bwhat(?:'s| is| does)\s+(?:an?\s+|the\s+)?["“]?([\w-][\w\s-]{0,30}?)["”]?(?:\s+mean)?\s*\??\s*$/i;
const plain = text => String(text ?? '').replace(/[`*_]|\$\$?/g, '').replace(/\s+/g, ' ').trim();
const words = text => (String(text ?? '').match(/\S+/g) || []).length;

export default function Reading({ portion: given, highlight = [], cardId = null, onEvidence }) {
  const portion = useMemo(() => { try { return REGISTRY.reading.engine.validate(given); } catch { return null; } }, [given]);
  const keys = useMemo(() => new Set(highlight?.length ? highlight : portion?.keyAnchors || []), [highlight, portion]);
  const root = useRef(null), [reading, setReading] = useState(null), hooks = useRef(onEvidence);
  hooks.current = onEvidence;
  useEffect(() => {
    if (!portion || !root.current) return;
    const order = [...root.current.querySelectorAll('[data-anchor]')].map(el => el.dataset.anchor);
    const at = new Map(order.map((id, i) => [id, i]));
    const m = { since: Date.now(), visibleSince: document.hidden ? null : Date.now(), activeMs: 0, seen: new Set(), furthest: -1, back: null, lookBacks: [], questions: [], glosses: [], ink: new Set(),
      audioRequested: false, framing: '', learnerSpoke: false, tutorWordsDuring: 0, readAt: -1, ended: false };
    const pause = () => { if (m.visibleSince) { m.activeMs += Date.now() - m.visibleSince; m.visibleSince = null; } };
    const visibility = () => { if (document.hidden) pause(); else m.visibleSince ??= Date.now(); };
    document.addEventListener('visibilitychange', visibility);
    // How far they got, and looking back: the topmost sentence in view more than three behind the furthest one seen.
    const shown = new Set();
    const watch = new IntersectionObserver(entries => {
      for (const e of entries) { const i = at.get(e.target.dataset.anchor); if (e.isIntersecting) { shown.add(i); m.seen.add(i); m.furthest = Math.max(m.furthest, i); } else shown.delete(i); }
      const top = Math.min(...shown);
      if (Number.isFinite(top) && top < m.furthest - 3) m.back ??= { anchor: order[top], since: Date.now() };
      else if (m.back) { m.lookBacks.push({ anchor: m.back.anchor, ms: Date.now() - m.back.since }); m.back = null; }
    }, { root: root.current.closest('.page'), threshold: .6 });
    for (const el of root.current.querySelectorAll('[data-anchor]')) watch.observe(el);
    // The sentence nearest the middle of what is in view: where a question is "about".
    const here = () => order[[...shown].sort((a, b) => a - b)[Math.floor(shown.size / 2)] ?? Math.max(0, m.furthest)] ?? order[0];
    const blocks = portion.body;
    liveReading.current = {
      cardId, portionId: portion.id,
      hear(text) {
        m.learnerSpoke = true;
        const term = TERM.exec(text)?.[1]?.trim().toLowerCase(), gloss = term && portion.glosses?.find(g => String(g.term).toLowerCase() === term);
        if (gloss) m.glosses.push(gloss.anchor);
        else if (QUESTION.test(text)) m.questions.push({ anchor: here(), text: String(text).slice(0, 300) });
      },
      platoSaid(text) { if (m.learnerSpoke) m.tutorWordsDuring += words(text); else m.framing += ` ${text}`; },
      // Audio on request (the one exception to never reading the page aloud): the next paragraph, word for word.
      audio(from = '') {
        m.audioRequested = true;
        const start = from ? blocks.findIndex(b => b.anchor === from || (b.sentences || b.items || []).some(s => s.anchor === from)) : m.readAt + 1;
        const i = start < 0 ? m.readAt + 1 : start, b = blocks[i];
        if (!b) { setReading(null); return 'That is the end of the reading: say so, and wait for them.'; }
        m.readAt = i; setReading(b.anchor);
        root.current?.querySelector(`[data-anchor="${CSS.escape(b.anchor)}"]`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        return b.kind === 'code' || b.kind === 'table' || b.kind === 'math' ? `This paragraph is ${b.kind === 'code' ? 'code' : b.kind === 'table' ? 'a table' : 'a formula'}: point_to ${b.anchor} and say in a sentence what it shows, without reading it; then stop.`
          : `Read this aloud word for word, then stop: "${plain(b.text || (b.items || []).map(it => it.text).join('. '))}"`;
      },
      end() {
        if (m.ended) return;
        m.ended = true; pause(); setReading(null);
        if (m.back) m.lookBacks.push({ anchor: m.back.anchor, ms: Date.now() - m.back.since });
        const segments = portion.segments?.length ? portion.segments : [{ to: order.at(-1) }];
        const said = m.framing.toLowerCase(), purpose = portion.purpose.toLowerCase().replace(/[^\w\s]/g, '');
        hooks.current?.({ type: 'reading', cardId, portion: portion.id, at: new Date().toISOString(),
          framing: { purposeSaid: said.replace(/[^\w\s]/g, '').includes(purpose), minutesSaid: /\b(minutes?|min)\b/.test(said), expectancySaid: /\b(question|ask you|asking you)\b/.test(said), prequestions: (said.match(/\?/g) || []).length },
          reading: { activeMs: m.activeMs, expectedMs: Math.round((portion.level?.minutes ?? portion.body.reduce((n, b) => n + words(b.text), 0) / 200) * 60_000),
            segmentsReached: segments.filter(s => at.has(s.to) && m.furthest >= at.get(s.to)).length, lookBacks: m.lookBacks.slice(0, 40), questions: m.questions.slice(0, 20),
            glosses: m.glosses, ink: [...m.ink].slice(0, 60), audioRequested: m.audioRequested, tutorWordsDuring: m.tutorWordsDuring } });
      },
      mark: id => m.ink.add(id),
    };
    const mine = liveReading.current;
    return () => { mine.end(); watch.disconnect(); document.removeEventListener('visibilitychange', visibility); if (liveReading.current === mine) liveReading.current = null; };
  }, [portion]);

  // A mark with the pen over a sentence (the page's ink passes the pointer through): a signal, raised after the reading.
  const pen = useRef(null);
  const press = e => { if (e.button > 0 || e.target.closest('button, a')) return; pen.current = { x: e.clientX, y: e.clientY, over: new Set() }; touch(e); };
  const touch = e => { if (!pen.current) return; const id = e.target.closest?.('[data-anchor]')?.dataset.anchor; if (id) pen.current.over.add(id); };
  const lift = e => { const p = pen.current; pen.current = null; if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= 3) for (const id of p.over) liveReading.current?.mark(id); };

  if (!portion) return null;
  return <article ref={root} className="reading material" aria-label={`Reading: ${portion.purpose}`} onPointerDown={press} onPointerMove={touch} onPointerUp={lift} onPointerCancel={() => { pen.current = null; }}>
    <h2 className="reading-title">{portion.purpose}</h2>
    {portion.body.map(b => <Block key={b.anchor} block={b} keys={keys} reading={reading === b.anchor} card={portion.sourceCards?.find(c => c.anchor === b.anchor)}/>)}
  </article>;
}

function Block({ block: b, keys, reading, card }) {
  const sentence = s => <span key={s.anchor} data-anchor={s.anchor} className={keys.has(s.anchor) ? 'is-key' : undefined}><BoardRichText text={s.text} inline/>{' '}</span>;
  const cls = `reading-block${reading ? ' is-read' : ''}${keys.has(b.anchor) ? ' is-key' : ''}`;
  const source = card && <p className="reading-source">{[card.author, card.date, card.genre, card.audience && `for ${card.audience}`].filter(Boolean).join(', ')}</p>;
  switch (b.kind) {
    case 'heading': return <h3 data-anchor={b.anchor} className={cls}>{b.sentences.map(sentence)}</h3>;
    case 'para': return <>{source}<p data-anchor={b.anchor} className={cls}>{b.sentences.map(sentence)}</p></>;
    case 'quote': return <>{source}<blockquote data-anchor={b.anchor} className={cls}><p>{b.sentences.map(sentence)}</p></blockquote></>;
    case 'list': return <ul data-anchor={b.anchor} className={cls}>{b.items.map(it => <li key={it.anchor} data-anchor={it.anchor} className={keys.has(it.anchor) ? 'is-key' : undefined}><BoardRichText text={it.text} inline/></li>)}</ul>;
    case 'code': return <div data-anchor={b.anchor} className={cls}><BoardRichText text={`\`\`\`${b.lang || ''}\n${b.text}\n\`\`\``}/></div>;
    case 'math': return <div data-anchor={b.anchor} className={cls}><BoardRichText text={/^\s*\$\$/.test(b.text) ? b.text : `$$${b.text}$$`}/></div>;
    default: return <div data-anchor={b.anchor} className={cls}><BoardRichText text={b.text}/></div>; // table, figure
  }
}
