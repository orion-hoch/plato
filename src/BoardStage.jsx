import React, { useEffect, useRef, useState } from 'react';
import BoardRichText from './BoardRichText.jsx';
import AnswerInput from './inputs/AnswerInput.jsx';
import Diagram from './visuals/Diagram.jsx';
import Notes from './visuals/Notes.jsx'; // board tools: notes quoted under the material, and their styles
import './visuals/board-tools.css';
import Element from './elements/Element.jsx';
import Reading from './elements/Reading.jsx';
import CodeZone from './elements/CodeZone.jsx';
import LatexZone from './elements/LatexZone.jsx';
import ProofZone from './elements/ProofZone.jsx';
import { normalizeSpec } from './inputs/answer.mjs';
import { erase, keep, live, nearest, onScreen, simplify, touches } from './inputs/ink.mjs';
import { useDraft } from './checkpoint.js';
import 'katex/dist/katex.min.css';
import './material.css';
import './board-stage.css';

// The page: a clean sheet where Plato's material appears, below it whatever Plato has asked, and below that a work
// zone he opened (code or LaTeX). Worked steps come up one at a time (one each time Plato finishes speaking, or on
// Next). It scrolls inside itself; the student can write on it, type, or talk at any time. A live visual tells Plato
// what the student does with it through onContext ("[Student's page] …") and the engine through onEvidence (a card's
// element or reading); a zone, or an exam part's answer, reports its content through onWork(key, content | null). runC
// runs C for a code zone; onHandIn hands an exam problem in.
export default function BoardStage({ page, beat = 0, onAnswer, onDraft, onContext, onEvidence, onWork, onHandIn, runC, onClose, keep = null }) {
  const { material, ask, work } = page;
  const steps = material?.steps || [];
  const [shown, setShown] = useState(() => material?.restored ? steps.length || 1 : 1); // a page back from a reload shows what it had
  const startBeat = useRef(beat), asked = useRef(null), worked = useRef(null), taught = useRef(null);
  // An ask with nothing to press (say it, type it, or write it) keeps blank page below it to write on, unless a zone is the place for that.
  const open = ask && !work && (!ask.input || ['speech', 'draw', 'text', 'number'].includes(ask.input.kind));
  useEffect(() => { setShown(material?.restored ? steps.length || 1 : 1); startBeat.current = beat; }, [material?.id]);
  useEffect(() => { if (steps.length) setShown(s => Math.max(s, Math.min(steps.length, 1 + beat - startBeat.current))); }, [beat]);
  // Something asked, or a zone opened, below long material comes into view.
  useEffect(() => { asked.current?.scrollIntoView?.({ block: open ? 'start' : 'nearest', behavior: 'smooth' }); }, [ask?.id]);
  useEffect(() => { worked.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [work?.id]);
  // New material under earlier parts of the same problem comes into view (the earlier parts stay above it).
  useEffect(() => { if (page.past?.length) taught.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); }, [material?.id]);
  // Earlier parts of the same problem or idea stay above, to scroll back to (page.js `past`). One list, keyed by each part's
  // id, so a part moving up into the past is the same component: its answers, zone and ink are kept.
  // keep(part, value): the star in a section's margin that keeps it in their notebook (Notebook.jsx).
  const material_ = (m, live) => <article ref={live ? taught : undefined} className="page-part" key={m.id}>
      {keep?.('material', m)}
      {m.title && <h2 className="page-label"><BoardRichText text={m.title} inline /></h2>}
      {m.content && <BoardRichText text={m.content} />}
      {m.diagram && <Diagram diagram={m.diagram} stone={false} onContext={onContext} />}
      {m.reading && <Reading portion={m.reading.portion} highlight={m.reading.highlight} cardId={m.cardId} onEvidence={onEvidence} />}
      {m.element && <Element element={m.element} cardId={m.cardId} branches={m.branches} persona={m.persona} beat={beat} onContext={onContext} onEvidence={onEvidence} />}
      {m.frame && <AnatomyFrame src={m.frame} title={m.title} onContext={live && !m.restored ? onContext : undefined} />}
      {m.video && <Clip src={m.video} title={m.title} autoPlay={live && !m.restored} />}
      {(m.steps || []).length > 0 && <ol className="page-steps">{m.steps.slice(0, live ? shown : m.steps.length).map((step, index) => <li key={index}><BoardRichText text={step} /></li>)}</ol>}
      {live && shown < steps.length && <button className="page-next" onClick={() => setShown(s => s + 1)}>Next</button>}
      {m.notes && <Notes excerpts={m.notes} />}
    </article>;
  const ask_ = (a, live) => <div ref={live ? asked : undefined} className={`page-part page-ask${live && open ? ' is-open' : ''}${a.answered ? ' is-answered' : ''}`} key={a.id}>
      {keep?.('ask', a)}
      {a.label && <h2 className="page-label"><BoardRichText text={a.label} inline /></h2>}
      {a.prompt && <BoardRichText text={a.prompt} />}
      {a.parts ? <Exam ask={a} onWork={onWork} onHandIn={onHandIn} runC={runC} />
        : a.input && <AnswerInput kind={a.input.kind} spec={a.input.spec} done={Boolean(a.answered)} onSubmit={(structured, text) => onAnswer?.(a, structured, text)} onDraft={(structured, text) => onDraft?.(a, structured, text)} />}
      {a.verdict && <div className={`page-verdict is-${a.verdict.right ? 'right' : 'wrong'}`} role="status">
        <b>{a.verdict.right ? 'Right.' : 'Not quite.'}</b>{!a.verdict.right && <> The answer: <BoardRichText text={a.verdict.answer} inline /></>}
        {a.key?.explain && <BoardRichText text={a.key.explain} />}
      </div>}
    </div>;
  const work_ = (w, live) => <div ref={live ? worked : undefined} className="page-part page-ask page-work" key={w.id}>
      {keep?.('work', w)}
      {w.title && <h2 className="page-label"><BoardRichText text={w.title} inline /></h2>}
      {w.task && <BoardRichText text={w.task} />}
      {w.kind === 'latex' ? <LatexZone lines={w.lines} draftKey={w.id} onWork={content => onWork?.(w.id, content)} />
        : w.kind === 'proof' ? <ProofZone sections={w.sections} draftKey={w.id} onWork={content => onWork?.(w.id, content)} />
        : <CodeZone language={w.language} starter={w.starter} runC={runC} draftKey={w.id} onWork={content => onWork?.(w.id, content)} />}
    </div>;
  const render = { material: material_, ask: ask_, work: work_ };
  const parts = [...(page.past || []).map(x => [x.part, x.value, false]), ...[['material', material], ['ask', ask], ['work', work]].filter(([, v]) => v).map(([k, v]) => [k, v, true])];
  return <section className="page" aria-label="Plato’s page">
    <button className="close page-close" onClick={onClose} aria-label="Clear Plato’s page">×</button>
    {parts.map(([part, value, live]) => render[part](value, live))}
  </section>;
}

// An anatomy figure (backend/session/anatomy.mjs): its own page in a sandboxed frame (its scripts run, with nothing of this
// page's), as tall as it says it is; when the pointer leaves it, the keys come back here (typing goes anywhere on this page).
// A course kit's figure (backend/lessons/kits.mjs) that can't draw its spec says why; Plato hears it once, to fix the spec.
function AnatomyFrame({ src, title, onContext }) {
  const frame = useRef(null), [height, setHeight] = useState(520), said = useRef(false), tell = useRef(onContext);
  tell.current = onContext;
  useEffect(() => {
    const told = e => {
      if (e.source !== frame.current?.contentWindow) return;
      if (e.data?.kit === 'error' && !said.current && !String(src).includes('kitprev_')) { said.current = true; tell.current?.(`[The figure "${e.data.title || title}" could not be drawn: ${String(e.data.text || '').slice(0, 400)}] Fix its spec and call kit again, or show it with write.`); return; }
      if (e.data?.anatomy === 'leave') { if (document.activeElement === frame.current) frame.current.blur(); }
      else if (Number.isFinite(e.data?.anatomy)) setHeight(Math.min(3000, Math.max(160, e.data.anatomy)));
    };
    addEventListener('message', told);
    return () => removeEventListener('message', told);
  }, []);
  return <iframe ref={frame} className="page-anatomy" src={src} title={title || 'An interactive figure'} sandbox="allow-scripts" style={{ height }} />;
}

// A Manim clip (backend/session/animate.mjs): plays once, muted (so the browser lets it start on its own; a page back from a
// reload waits), then Replay. As wide as the page, never wider.
function Clip({ src, title, autoPlay }) {
  const video = useRef(null);
  const replay = () => { const v = video.current; if (v) { v.currentTime = 0; void v.play().catch(() => {}); } };
  return <figure className="page-clip">
    <video ref={video} src={src} title={title || 'An animation'} controls playsInline muted autoPlay={autoPlay} preload="auto" />
    <button className="page-next" onClick={replay}>Replay</button>
  </figure>;
}

// An exam problem's parts, one under another: each its letter, prompt and points, then where it is answered (a code
// or LaTeX zone, choices, or room to type and write in; writing on a part belongs to it). The part in focus (the
// first at first, then whichever was last pressed or typed in) takes what is typed on the page; Enter in a part's
// typing goes on to the next part, and on the last hands the problem in.
function Exam({ ask, onWork, onHandIn, runC }) {
  const [focused, setFocused] = useState(ask.parts[0]?.id), done = Boolean(ask.answered);
  return ask.parts.map((part, i) => {
    const { kind, language, starter, choices } = part.answer || {}, key = `${ask.id}:${part.id}`, report = content => onWork?.(key, content && { ...content, part: part.id });
    return <section key={part.id} className={`page-part page-ask exam-part${focused === part.id ? ' is-focused' : ''}`} data-part={part.id}
      onPointerDown={e => { setFocused(part.id); if (!e.currentTarget.contains(document.activeElement)) document.activeElement?.blur?.(); }} onFocus={() => setFocused(part.id)}>
      <div className="exam-head">
        <span className="exam-id">{part.id}</span><BoardRichText text={part.prompt || ''} />
        {part.points != null && <span className="exam-points">{part.points}<span className="sr-only"> points</span></span>}
      </div>
      {kind === 'code' ? <CodeZone language={language} starter={starter} done={done} runC={runC} draftKey={key} onWork={report} />
        : kind === 'latex' ? <LatexZone lines={Array.isArray(starter) ? starter : String(starter || '').split('\n').filter(Boolean)} done={done} draftKey={key} onWork={report} />
        : kind === 'proof' ? <ProofZone sections={part.answer.sections || []} done={done} draftKey={key} onWork={report} />
        : kind === 'choice' ? <Choice choices={choices} done={done} onWork={report} />
        : <Room draw={kind === 'draw'} done={done} last={i === ask.parts.length - 1} draftKey={key} onWork={report} onHandIn={onHandIn} />}
    </section>;
  });
}

// An exam part answered by pressing a choice: nothing is chosen until one is.
function Choice({ choices, done, onWork }) {
  const report = useRef(onWork);
  report.current = onWork;
  useEffect(() => { report.current?.({ label: 'choice', value: '', brief: 'chose nothing yet' }); return () => report.current?.(null); }, []);
  return <AnswerInput kind="choice" spec={normalizeSpec('choice', { options: choices || [] })} done={done} onSubmit={({ value }, text) => report.current?.({ label: 'choice', value, brief: `chose ${text}` })} />;
}

// An exam part answered in words or on paper: what is typed shows as plain text at its top, and the room under it is
// page to write on.
function Room({ draw, done, last, onWork, onHandIn, draftKey = null }) {
  const [text, setText] = useDraft(draftKey, ''), report = useRef(onWork);
  report.current = onWork;
  useEffect(() => { report.current?.({ label: 'typed', value: text.trim(), brief: `typed: ${text.trim()}` }); }, [text]);
  useEffect(() => () => report.current?.(null), []);
  return <div className={`exam-room${draw ? ' is-draw' : ''}`}>
    <textarea className="zone exam-typed" rows={text.split('\n').length} value={text} readOnly={done} aria-label="Your answer to this part"
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        if (last) onHandIn?.(); else e.currentTarget.closest('.exam-part')?.nextElementSibling?.querySelector('textarea, input, button')?.focus();
      }}/>
  </div>;
}

// The student's ink, always on, over the whole workspace whether or not the page is up, with no tools of its own:
// Cmd/Ctrl+Z takes back a stroke, Enter or speaking under an open question hands it in, Plato glances at it.
// A press on a control (or the conversation, or a live visual) belongs to it; anywhere else a mouse or a pen writes. A finger writes too, except once
// a pen has been used (a resting palm) and where the page has more to scroll, so a finger always scrolls it.
// Writing on the page belongs to the part of it written on (Plato's material, or what Plato asked; in a margin,
// the nearest): it scrolls and moves with that part and goes when it goes (inputs/ink.mjs). Writing off the page stays put.
// ponytail: a part's writing keeps its place from the part's corner, so text that reflows (a narrower window)
// can slide under it; anchor to the nearest line if students annotate on resizing screens.
const INK = '#2f4f8a', READ_INK = '#1d1b18';
// How near the eraser has to pass to a stroke to take it, in pixels.
const ERASER = 14;
const NOT_INK = 'button:not(.orb-button), a, input, textarea, select, label, [draggable="true"], .course-tree, .conversation, [data-toggle], .element-scene canvas, .element-trace, .zone';
const at = (e, r) => ({ x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || .5 });

function line(g, points, from = 1) {
  if (points.length === 1) { g.beginPath(); g.arc(points[0].x, points[0].y, 1.8, 0, Math.PI * 2); g.fill(); return; }
  for (let i = Math.max(1, from); i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    g.lineWidth = 1.4 + 2.6 * b.p;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
}
function bounds(strokes) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const { points } of strokes) for (const { x, y } of points) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  return { left, top, width: right - left, height: bottom - top };
}

// Where the reading's picture of the writing lies: cropped to it with a margin, at up to twice its size, 2400 px at most.
function crop(strokes) {
  const box = bounds(strokes), pad = 16, scale = Math.min(2, 2400 / Math.max(box.width + pad * 2, box.height + pad * 2));
  return { box, pad, scale, width: Math.ceil((box.width + pad * 2) * scale), height: Math.ceil((box.height + pad * 2) * scale) };
}

/** What was written, cropped to itself, dark on white (as on paper) for reading; base64 PNG. */
function inkPng(strokes) {
  const { box, pad, scale, width, height } = crop(strokes), canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.setTransform(scale, 0, 0, scale, (pad - box.left) * scale, (pad - box.top) * scale);
  g.lineCap = g.lineJoin = 'round'; g.strokeStyle = g.fillStyle = READ_INK;
  for (const stroke of strokes) line(g, stroke.points);
  return canvas.toDataURL('image/png').split(',')[1];
}

/** The same writing as numbered strokes, for reading a drawing's shapes: { width, height, strokes: [{ id, box, pts }] },
 *  each stroke's box and its points simplified (x, y, x, y, …, at most 251 of them) in the PNG's pixels. A stroke left
 *  with no points (its part of the page went before it was seen) is not numbered. */
function inkTrace(strokes) {
  const { box, pad, scale, width, height } = crop(strokes);
  const at = ({ x, y }) => [Math.round((x - box.left + pad) * scale), Math.round((y - box.top + pad) * scale)];
  return { width, height, strokes: strokes.filter(({ points }) => points.length).map(({ points }, id) => {
    const all = points.map(at), kept = simplify(all, 3), step = Math.ceil(kept.length / 250), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    return { id, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], pts: kept.filter((_, i) => i % step === 0 || i === kept.length - 1).flat() };
  }) };
}

/** `api` is filled with { strokes(), version(), inkedAt(), png(list), trace(list), undo(), clear() } for the workspace
 *  that sends the ink. `page` is Plato's page, or null while it is not up: when it changes, writing on a part that has
 *  gone stays where it was (only an undo or a clear takes writing away). */
export function Ink({ api, page = null, erasing = false, marking = true, saved = null, onChange, onSave, onActivity }) {
  const canvas = useRef(null), strokes = useRef([]), version = useRef(0), inkedAt = useRef(-Infinity), hooks = useRef(null);
  hooks.current = { onChange, onSave, onActivity, erasing, marking };
  // The writing from the course's checkpoint (src/checkpoint.js), put back once Plato's page is up again: a stroke on a part
  // of the page goes back on that part (by its place among the parts), one off the page where it was.
  const waiting = useRef(saved?.length ? saved : null);
  const parts = () => [...(canvas.current?.parentElement.querySelectorAll('.page-part') || [])];
  const stored = () => { const all = parts(); return strokes.current.map(keep).map(({ type, points, note, clip, on }) => on ? { type, points, part: all.indexOf(on) } : { type, points, note, clip }); };
  function pen2d() {
    const el = canvas.current, g = el.getContext('2d'), ratio = el.width / Math.max(1, el.clientWidth);
    g.setTransform(ratio, 0, 0, ratio, 0, 0); g.lineCap = g.lineJoin = 'round'; g.strokeStyle = g.fillStyle = INK;
    return g;
  }
  // Strokes where they are now; writing on the page shows only within it (scrolled past it, out of sight).
  function draw(g, list, box, from) {
    for (const { points, clip } of onScreen(list, box)) {
      g.save();
      if (clip) { g.beginPath(); g.rect(0, clip.top, box.width, clip.height); g.clip(); }
      line(g, points, from);
      g.restore();
    }
  }
  function paint() {
    if (!canvas.current) return; // a resize can arrive after the workspace is gone
    strokes.current.forEach(keep);
    const g = pen2d(), box = canvas.current.getBoundingClientRect();
    g.clearRect(0, 0, box.width, box.height);
    draw(g, strokes.current, box);
  }
  // `quiet`: the page changed under the writing, which is not the student writing anything.
  function changed(quiet = false) { version.current++; paint(); hooks.current.onSave?.(stored()); if (!quiet) hooks.current.onChange?.(); }
  api.current = {
    strokes: () => strokes.current.map(keep), version: () => version.current, inkedAt: () => inkedAt.current,
    png: list => inkPng(onScreen(list, canvas.current.getBoundingClientRect())),
    trace: list => inkTrace(onScreen(list, canvas.current.getBoundingClientRect())),
    undo: () => { strokes.current = strokes.current.map(keep).slice(0, -1); changed(); },
    clear: () => { strokes.current = []; changed(); },
  };

  // Plato's page changed: writing on a part of it that has gone stays where it was, and the rest follows its part
  // wherever the page's layout moves it (a step revealed above, new material over what was asked).
  // The server's copy arriving after the first render (this browser had none): its writing, if nothing is written yet.
  useEffect(() => { if (saved?.length && !strokes.current.length && !waiting.current) waiting.current = saved; }, [saved]);
  useEffect(() => {
    const all = parts();
    if (waiting.current && (all.length || !waiting.current.some(s => s.part >= 0))) {
      const sheet = all[0]?.closest('.page') || null;
      strokes.current = waiting.current.map(s => s.part >= 0 && all[s.part] ? { type: s.type, points: s.points, on: all[s.part], sheet } : { type: s.type, points: s.points, note: s.note ?? true, clip: s.clip || null, on: null, sheet: null }).concat(strokes.current);
      waiting.current = null; version.current++; paint();
    }
    if (strokes.current.some(stroke => !live(stroke))) { strokes.current.forEach(keep); changed(true); }
    const observer = new ResizeObserver(() => paint());
    for (const part of canvas.current.parentElement.querySelectorAll('.page-part')) observer.observe(part);
    return () => observer.disconnect();
  }, [page]);

  useEffect(() => {
    const el = canvas.current, host = el.parentElement;
    let stroke = null, pen = false, rubbing = null;
    // The eraser takes away the writing under it, where that writing can be seen, cutting any stroke it crosses; a
    // fast rub covers the whole way between two pointer events.
    let rubbedAt = null;
    const rubAt = (box, x, y) => {
      let rubbed = false;
      strokes.current = strokes.current.flatMap(stroke => {
        const seen = onScreen([stroke], box)[0];
        if (!seen?.points.length || (seen.clip && (y < seen.clip.top || y > seen.clip.top + seen.clip.height)) || !touches(seen.points, x, y, ERASER)) return [stroke];
        rubbed = true;
        // The stroke's own points are the seen ones less the shift to where its part of the page is now.
        const dx = seen.points[0].x - stroke.points[0].x, dy = seen.points[0].y - stroke.points[0].y;
        return erase(stroke.points, x - dx, y - dy, ERASER).map(points => ({ ...stroke, points }));
      });
      return rubbed;
    };
    const rub = e => {
      const box = el.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top, from = rubbedAt || { x, y };
      const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (ERASER / 2)));
      rubbedAt = { x, y };
      let rubbed = false;
      for (let i = 1; i <= steps; i++) rubbed = rubAt(box, from.x + (x - from.x) * i / steps, from.y + (y - from.y) * i / steps) || rubbed;
      if (rubbed) changed();
    };
    const fit = () => { const r = el.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2); el.width = Math.max(1, Math.round(r.width * ratio)); el.height = Math.max(1, Math.round(r.height * ratio)); paint(); };
    const down = e => {
      if (stroke || e.button > 0 || !e.isPrimary || e.target.closest?.(NOT_INK)) return;
      if (!hooks.current.marking && !hooks.current.erasing) return; // the marker off: the page's text selects and copies as usual
      const page = e.target.closest?.('.page');
      if (e.target === page && e.offsetX > page.clientWidth) return; // its scrollbar
      if (e.pointerType === 'pen') pen = true;
      else if (e.pointerType === 'touch' && (pen || (page && page.scrollHeight > page.clientHeight + 1))) return;
      if (e.pointerType !== 'touch') e.preventDefault(); // no text selection while writing
      if (hooks.current.erasing) {
        rubbing = e.pointerId; rubbedAt = null; rub(e);
        addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
        return;
      }
      const on = page && (e.target.closest('.page-part') || nearest(page.querySelectorAll('.page-part'), e.clientY));
      stroke = { pointer: e.pointerId, type: e.pointerType, on, sheet: on && page, points: [at(e, (on || el).getBoundingClientRect())] };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
      hooks.current.onActivity?.();
    };
    const move = e => {
      if (e.pointerId === rubbing) { for (const c of e.getCoalescedEvents?.() || [e]) rub(c); return; }
      if (e.pointerId !== stroke?.pointer) return;
      // A mouse let go outside the window sends no pointerup; the stroke ended where it left.
      if (e.pointerType === 'mouse' && !e.buttons) { up({ type: 'pointerup', pointerId: e.pointerId, timeStamp: e.timeStamp }); return; }
      const from = stroke.points.length, box = el.getBoundingClientRect(), r = stroke.on ? stroke.on.getBoundingClientRect() : box;
      for (const c of e.getCoalescedEvents?.() || [e]) stroke.points.push(at(c, r));
      draw(pen2d(), [stroke], box, from);
      hooks.current.onActivity?.();
    };
    const up = e => {
      if (e.pointerId === rubbing) { rubbing = null; removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); return; }
      if (e.pointerId !== stroke?.pointer) return;
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      const done = stroke, box = bounds([done]);
      stroke = null;
      // A press that hardly moved is a press, not writing; a pen's tap is a dot. A cancelled stroke was a scroll,
      // and a stroke on a part of the page that went while it was being written stays where it was written.
      if (e.type === 'pointerup' && (done.type === 'pen' || Math.hypot(box.width, box.height) >= 3)) { strokes.current.push(keep(done)); inkedAt.current = e.timeStamp; changed(); }
      else paint();
    };
    // A pen writing on a page that scrolls must not scroll it; the page scrolling carries its writing with it.
    const hold = e => { if (stroke || rubbing !== null) e.preventDefault(); };
    const scrolled = e => { if (e.target.classList?.contains('page')) paint(); };
    const observer = new ResizeObserver(fit); observer.observe(el); fit();
    host.addEventListener('pointerdown', down); host.addEventListener('touchmove', hold, { passive: false }); host.addEventListener('scroll', scrolled, true);
    return () => {
      observer.disconnect(); host.removeEventListener('pointerdown', down); host.removeEventListener('touchmove', hold); host.removeEventListener('scroll', scrolled, true);
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    };
  }, []);

  return <canvas ref={canvas} className="ink" aria-hidden="true" />;
}

/** The student's tools for their writing: the marker on or off (off, dragging selects the page's text to copy), and
 *  while there is writing, an eraser to switch on and off and a clear that takes all of it away. */
export function InkTools({ shown, erasing, marking = true, onMark, onErase, onClear }) {
  return <div className="ink-tools">
    <button type="button" className="round ink-tool" aria-pressed={marking} aria-label={marking ? 'Marker on: switch it off to select and copy text' : 'Marker off: switch it on to write on the page'} title={marking ? 'Marker on (off to select and copy text)' : 'Marker off: selecting text (on to write)'} onClick={onMark}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15.5 4.5 19.5 8.5 9 19H5v-4z"/><path d="m13.5 6.5 4 4"/></svg>
    </button>
    {(shown || erasing) && <>
    <button type="button" className="round ink-tool" aria-pressed={erasing} aria-label={erasing ? 'Stop erasing' : 'Erase writing'} title={erasing ? 'Stop erasing' : 'Eraser'} onClick={onErase}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 15.5 13 7a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11.5 18.5H7.5z"/><path d="m8.8 11.2 4.5 4.5"/><path d="M11.5 18.5h8"/></svg>
    </button>
    <button type="button" className="round ink-tool" aria-label="Clear all writing" title="Clear writing" onClick={onClear}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7h14"/><path d="M10 7V5h4v2"/><path d="m7 7 1 12h8l1-12"/><path d="M10.5 10.5v5.5M13.5 10.5v5.5"/></svg>
    </button>
    </>}
  </div>;
}
