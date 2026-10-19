import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import BoardStage from './BoardStage.jsx';
import BoardRichText from './BoardRichText.jsx';
import { checkpoint, save } from './checkpoint.js';
import './notebook.css';

// The notebook (19 Oct, the user: "a good example or explanation is lost after a board wipe … a really smooth and fluid way"),
// two things kept apart ("for checkpoints and saving it should be for whole boards, but … the user saving certain sections
// for later should be in sections, the two shouldn't be tied together"):
// - Boards: every whole board, filed by itself when the page moves on from it, as it was, with what the student did on it
//   (answers, marks, drafts); one with a question they got wrong is marked missed. Put back whole.
// - Saved: the sections (an explanation, a worked example, a question, a work zone) the student starred, each on its own.
// Both are in the course's checkpoint (./checkpoint.js), so on the server too. Their writing on the page is in neither.
const MAX_BOARDS = 200;
/** A page's sections: [{ part: 'material' | 'ask' | 'work', value }], earliest first. */
export const sectionsOf = p => p ? [...(p.past || []), ...['material', 'ask', 'work'].filter(k => p[k]).map(k => ({ part: k, value: p[k] }))].filter(x => x.value?.id) : [];
/** A board's key: its first section's id, the same while its thread goes on and when it is put back. */
export const boardKey = p => sectionsOf(p)[0]?.value.id || null;
const bare = v => JSON.parse(JSON.stringify(v, (k, x) => k === 'restored' ? undefined : x));
const plain = s => String(s || '').replace(/\$+|\\[a-z]+|[*_`#>{}]/gi, '').replace(/\s+/g, ' ').trim();
const titleOf = v => plain(v.title || v.prompt || v.label || String(v.content || v.task || '').split('\n').find(l => l.trim())).slice(0, 100) || (v.element || v.frame ? 'A live figure' : v.video ? 'A clip' : 'A section');
const wrong = v => Boolean(v.verdict && !v.verdict.right);
const changed = () => dispatchEvent(new Event('plato:notebook'));
const boards = exam => checkpoint(exam).boards || [], saved = exam => checkpoint(exam).saved || [];
/** What an entry puts on the page: a board whole, a saved section on its own. */
export const pageOf = e => e.page || { [e.part]: e.value };
/** The page with an entry added at its foot (19 Oct, the user: "instead of erasing the current board … just append it"):
 *  what is up stays, above it; the entry's sections come in under it, the last one live (a question in it can be answered
 *  again). A section already on the page is not added twice. */
export function appended(page, entry) {
  const on = new Set(sectionsOf(page).map(x => x.value.id));
  const fresh = sectionsOf(pageOf(entry)).filter(x => !on.has(x.value.id)).map(x => x.part === 'material' ? { ...x, value: { ...x.value, restored: true } } : x);
  if (!fresh.length) return page;
  const last = fresh.at(-1);
  return { thread: page?.thread ?? null, past: [...sectionsOf(page), ...fresh.slice(0, -1)], material: null, ask: null, work: null, [last.part]: last.value };
}
/** Whether all of an entry is on the page now. */
export const isUp = (page, entry) => { const on = new Set(sectionsOf(page).map(x => x.value.id)); return sectionsOf(pageOf(entry)).every(x => on.has(x.value.id)); };
// A card's few lines: the section's own words under its title (a worked example's steps, a question's prompt).
const snippetOf = v => String(v.content || (v.steps || []).join('\n') || (v.title && v.prompt) || v.task || '').slice(0, 260);
const KIND = { material: 'Notes', ask: 'Question', work: 'Your work' };

/** File a board the page has moved on from (or bring its entry up to date: the same board put back and moved on from again). */
export function fileBoard(exam, page, { topic = '' } = {}) {
  const key = boardKey(page), sections = sectionsOf(page);
  if (!exam || !key) return;
  const was = boards(exam).find(e => e.id === key);
  const entry = { id: key, at: was?.at || Date.now(), topic: was?.topic || topic, title: titleOf(sections[0].value), size: sections.length, page: bare(page), missed: sections.some(x => wrong(x.value)) };
  save(exam, { boards: [entry, ...boards(exam).filter(e => e.id !== key)].slice(0, MAX_BOARDS) });
  changed();
}
/** A saved section on the page now: its copy follows what they do on it (an answer, a mark). */
export function refreshSaved(exam, page) {
  const mine = saved(exam), on = new Map(sectionsOf(page).map(x => [x.value.id, x.value]));
  if (!mine.some(e => on.has(e.id) && JSON.stringify(bare(on.get(e.id))) !== JSON.stringify(e.value))) return;
  save(exam, { saved: mine.map(e => on.has(e.id) ? { ...e, value: bare(on.get(e.id)), missed: wrong(on.get(e.id)) } : e) });
  changed();
}
function toggleSaved(exam, part, value, topic) {
  const mine = saved(exam), was = mine.some(e => e.id === value.id);
  save(exam, { saved: was ? mine.filter(e => e.id !== value.id) : [{ id: value.id, part, at: Date.now(), topic, title: titleOf(value), value: bare(value), missed: wrong(value) }, ...mine] });
  changed();
}
const useNotebook = () => { const [, tick] = useState(0); useEffect(() => { const on = () => tick(n => n + 1); addEventListener('plato:notebook', on); return () => removeEventListener('plato:notebook', on); }, []); };

const STAR = <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>;
const Star = ({ on, size = 16 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">{STAR}</svg>;
/** The star in a section's margin: save this section for later, or take it out again. */
export function KeepButton({ exam, part, value, topic }) {
  useNotebook();
  const on = saved(exam).some(e => e.id === value.id);
  return <button type="button" className={`page-keep${on ? ' is-kept' : ''}`} aria-pressed={on} onClick={() => toggleSaved(exam, part, value, topic)}
    aria-label={on ? 'Saved in your notebook. Press to remove' : 'Save this for later'} title={on ? 'Saved in your notebook' : 'Save for later'}><Star on={on}/></button>;
}

const day = at => { const d = new Date(at), n = new Date(), y = new Date(n - 864e5); return d.toDateString() === n.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }); };
const time = at => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const EMPTY = {
  saved: <>Nothing saved yet. Point at anything on the board and press the <Star on size={13}/> in its margin to save it here.</>,
  boards: 'Every board Plato puts up lands here when he moves on, as it was, with your answers on it.',
  missed: 'No missed questions on past boards.', found: 'Nothing matches that.',
};

/** The rail button. */
export function NotebookButton({ open, onToggle }) {
  return <button type="button" className={`round notebook-button${open ? ' is-on' : ''}`} aria-expanded={open} onClick={onToggle} aria-label={open ? 'Close your notebook' : 'Open your notebook: saved sections and past boards'} title="Notebook">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6zM6 3.5v17M9.5 8h5.5M9.5 11h5.5"/></svg>
  </button>;
}

/** The notebook, in the conversation's column beside the board (the board stays in view, so what is added is seen landing on
 *  it): what they saved, by topic, and past boards, by day, each a card with its first lines. A card adds itself to the foot
 *  of the board (onAdd); the panel stays open to add more. */
export default function Notebook({ exam, page, open, onClose, onAdd }) {
  useNotebook();
  const [tab, setTab] = useState(null), [missedOnly, setMissedOnly] = useState(false), [query, setQuery] = useState(''), [printing, setPrinting] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const key = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [open]);
  // Printing: the list as shown laid out one under another for the browser's print (Save as PDF), then gone.
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(null), frame = requestAnimationFrame(() => setTimeout(() => print(), 300));
    addEventListener('afterprint', done);
    return () => { cancelAnimationFrame(frame); removeEventListener('afterprint', done); };
  }, [printing]);
  if (!open && !printing) return null;
  const mine = saved(exam), past = boards(exam), shown = tab || (mine.length ? 'saved' : 'boards');
  const q = query.trim().toLowerCase(), hit = e => !q || [e.title, e.topic, snippetOf(e.value || sectionsOf(e.page)[0]?.value || {})].join(' ').toLowerCase().includes(q);
  const list = (shown === 'saved' ? mine : past.filter(e => !missedOnly || e.missed)).filter(hit);
  const groups = Map.groupBy(list, e => shown === 'saved' ? e.topic || 'Other' : day(e.at));
  const card = e => {
    const v = e.value || sectionsOf(e.page)[0]?.value || {}, up = isUp(page, e), snippet = snippetOf(v);
    const add = () => { if (!up) onAdd(e); };
    return <div key={e.id} className={`nb-card${up ? ' is-up' : ''}`} role="button" tabIndex={0} onClick={add} onKeyDown={k => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); add(); } }}
      aria-label={`${e.title}. ${up ? 'On your board' : 'Add to your board'}`}>
      <span className="nb-meta">{shown === 'saved' ? KIND[e.part] : e.topic || 'Board'}{e.size > 1 ? `, ${e.size} parts` : ''}<span>{shown === 'saved' ? day(e.at) : time(e.at)}</span></span>
      <b className="nb-title"><BoardRichText text={e.title} inline /></b>
      {snippet && !plain(snippet).startsWith(e.title) && <div className="nb-snippet"><BoardRichText text={snippet} /></div>}
      <span className="nb-foot">{e.missed && <span className="nb-missed">Missed</span>}<span className="nb-add">{up ? 'On your board' : '+ Add to board'}</span></span>
      {shown === 'saved' && <button type="button" className="nb-unsave" onClick={x => { x.stopPropagation(); toggleSaved(exam, e.part, e.value, e.topic); }} aria-label="Remove from saved" title="Remove from saved"><Star on/></button>}
    </div>;
  };
  return <>
    {open && <aside className={`notebook-panel${page ? ' beside-board' : ''}`} aria-label="Your notebook">
      <header className="nb-head">
        <h2>Notebook</h2>
        <button type="button" className="close" onClick={onClose} aria-label="Close your notebook">×</button>
      </header>
      <div className="nb-tabs" role="tablist">
        {[['saved', 'Saved', mine.length], ['boards', 'Past boards', past.length]].map(([id, name, n]) => <button key={id} type="button" role="tab" aria-selected={shown === id} onClick={() => setTab(id)}>{name}{n ? <small>{n}</small> : null}</button>)}
      </div>
      <div className="nb-tools">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={shown === 'saved' ? 'Search what you saved' : 'Search past boards'} aria-label="Search the notebook"/>
        {shown === 'boards' && past.some(e => e.missed) && <button type="button" className={`nb-chip${missedOnly ? ' is-on' : ''}`} aria-pressed={missedOnly} onClick={() => setMissedOnly(m => !m)}>Missed only</button>}
      </div>
      <div className="nb-list">
        {list.length ? [...groups].map(([name, items]) => <section key={name}><h3>{name}</h3>{items.map(card)}</section>)
          : <p className="nb-empty">{q ? EMPTY.found : shown === 'saved' ? EMPTY.saved : missedOnly ? EMPTY.missed : EMPTY.boards}</p>}
      </div>
      {list.length > 0 && <footer className="nb-foot-bar"><button type="button" onClick={() => setPrinting(list)}>Print {shown === 'saved' ? 'these notes' : list.length === 1 ? 'this board' : 'these boards'}</button><span>or save as PDF</span></footer>}
    </aside>}
    {printing && createPortal(<div className="notebook-print">
      {printing.map(e => { const p = pageOf(e); return <div key={e.id} className="notebook-sheet">
        {e.topic && <p className="notebook-sheet-topic">{e.topic}</p>}
        <BoardStage page={{ ...p, restored: true, material: p.material && { ...p.material, restored: true } }} />
      </div>; })}
    </div>, document.body)}
  </>;
}
