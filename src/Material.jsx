import React, { useEffect, useRef, useState } from 'react';
import { api, authHeader } from './backend-client.js';
import { ACCEPT } from './study-material.mjs';

// Their material on its way into the course (16 Oct, the user: "a better protocol for the user to be able to drag in new
// material and be able to sync it up"). Files dropped on the study page or the course page, or chosen, go up at once; each
// shows where it is (uploading, reading, being added to the study guide, in it) and the guide's own step while it takes them
// in. A drop anywhere sends `plato:material`, which wakes these to look closely until all is in.

const STATE = { uploading: 'Uploading', reading: 'Reading', adding: 'Adding to the study guide', in_guide: 'In the study guide', ready: 'Ready', failed: 'Couldn’t read' };
const settled = m => m && m.files.every(f => ['in_guide', 'ready', 'failed'].includes(f.state)) && !['planning', 'updating', 'writing', 'checking'].includes(m.guide?.state);
/** What the study guide is doing with new material, in words. */
export function guideStep(g) {
  if (!g) return '';
  if (g.state === 'planning') return 'Planning the study guide';
  if (g.state === 'updating') return `Reading ${g.added?.length > 1 ? `${g.added.length} new files` : 'the new file'} into the study guide`;
  if (g.state === 'writing') return `Writing the study guide: ${g.done} of ${g.units} units`;
  if (g.state === 'checking') return 'Testing lessons on the new topics';
  return '';
}

/** The course's material, looked at every few seconds while something is on its way in (else every half minute). */
function useMaterial(examId) {
  const [m, setM] = useState(null), busy = useRef(false);
  useEffect(() => {
    if (!examId) return undefined;
    let timer = 0, gone = false;
    const look = async () => {
      clearTimeout(timer);
      const next = await api.material(examId).catch(() => null);
      if (gone) return;
      if (next) setM(next);
      busy.current = next ? !settled(next) : busy.current;
      timer = setTimeout(look, busy.current ? 4000 : 30_000);
    };
    const wake = () => { busy.current = true; void look(); };
    void look(); addEventListener('plato:material', wake);
    return () => { gone = true; clearTimeout(timer); removeEventListener('plato:material', wake); };
  }, [examId]);
  return m;
}

/** On the study page: one quiet line while material is on its way in, and what came in once it has (pressed: the course). */
export function SyncStatus({ examId, onOpen }) {
  const m = useMaterial(examId), [done, setDone] = useState(null), was = useRef(null);
  const moving = m && !settled(m), files = m?.files.filter(f => !['in_guide', 'ready', 'failed'].includes(f.state)) || [];
  useEffect(() => {
    if (moving) { was.current = { names: files.map(f => f.name) }; setDone(null); return undefined; }
    if (!was.current || !m) return undefined;
    const names = was.current.names; was.current = null;
    setDone(`${names.length > 1 ? `${names.length} files` : names[0] || 'Your material'} added to the course`);
    const t = setTimeout(() => setDone(null), 8000);
    return () => clearTimeout(t);
  }, [moving]);
  if (!moving && !done) return null;
  const step = guideStep(m?.guide), lead = files[0];
  return <button type="button" className={`sync-status${moving ? ' is-moving' : ' is-done'}`} onClick={onOpen} role="status">
    {moving ? <span className="chat-spinner" aria-hidden="true"/> : <span className="sync-tick" aria-hidden="true">✓</span>}
    <span>{moving ? <>{lead ? <><b>{files.length > 1 ? `${files.length} files` : lead.name}</b>: {STATE[lead.state].toLowerCase()}</> : <b>Your material</b>}{step && lead?.state !== 'uploading' && lead?.state !== 'reading' ? `. ${step}` : ''}</> : done}</span>
  </button>;
}

/** On the course page: their files with where each is, and a place to drop or choose more. */
export function MaterialPanel({ examId }) {
  const m = useMaterial(examId), [open, setOpen] = useState(false), [over, setOver] = useState(false), [problem, setProblem] = useState(''), picker = useRef(null), box = useRef(null);
  // Files chosen, waiting for a word on what they are (19 Oct, the user: a recent exam "supposed to be similar", and how to
  // "let the system know that it's important"): the note goes to Plato's brief and the course's build (server/index.mjs).
  const [waiting, setWaiting] = useState(null), [note, setNote] = useState(''), [model, setModel] = useState(false);
  useEffect(() => { // the file list is a popup (16 Oct, the user: "make the your material a scrolling popup"): a press away or Escape closes it
    if (!open) return undefined;
    const away = e => { if (!box.current?.contains(e.target)) setOpen(false); }, key = e => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', away); addEventListener('keydown', key);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', key); };
  }, [open]);
  function chosen(list) {
    const files = [...(list || [])];
    if (files.length && examId) { setWaiting(files); setNote(''); setModel(false); setProblem(''); }
  }
  async function add(files) {
    setWaiting(null);
    if (note.trim() || model) for (const f of files) void authHeader().then(auth => fetch(`/material-note/${examId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ filename: f.name, note: note.trim(), model }) })).catch(() => {});
    setProblem(''); setOpen(true);
    dispatchEvent(new Event('plato:material'));
    try { await api.upload(examId, files); } catch (error) { setProblem(error?.message || 'Couldn’t upload that.'); }
    dispatchEvent(new Event('plato:material'));
  }
  useEffect(() => { // a drop anywhere on the course page
    const page = document.querySelector('.course-tree');
    if (!page) return undefined;
    const enter = e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setOver(true); } };
    const leave = e => { if (!e.relatedTarget || !page.contains(e.relatedTarget)) setOver(false); };
    const drop = e => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); setOver(false); chosen(e.dataTransfer.files); };
    page.addEventListener('dragover', enter); page.addEventListener('dragleave', leave); page.addEventListener('drop', drop);
    return () => { page.removeEventListener('dragover', enter); page.removeEventListener('dragleave', leave); page.removeEventListener('drop', drop); };
  }, [examId]);
  const files = m?.files || [], moving = files.filter(f => !['in_guide', 'ready', 'failed'].includes(f.state)), step = guideStep(m?.guide);
  return <section ref={box} className={`material-box${over ? ' is-over' : ''}`} aria-label="Your material">
    <div className="material-head">
      <button type="button" className="material-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <b>Your material</b> {files.length} file{files.length === 1 ? '' : 's'}
        <span className="material-sum">{moving.length ? <><span className="chat-spinner" aria-hidden="true"/>{moving.length} on the way in{step ? `. ${step}` : ''}</> : step ? <><span className="chat-spinner" aria-hidden="true"/>{step}</> : files.length ? 'all in' : ''}</span>
      </button>
      <button type="button" className="material-add" onClick={() => picker.current?.click()}>+ Add files</button>
      <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={e => { chosen(e.target.files); e.target.value = ''; }}/>
    </div>
    {over && <p className="material-drop">Drop to add to this course</p>}
    {waiting && <form className="material-note" onSubmit={e => { e.preventDefault(); void add(waiting); }} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setWaiting(null); } }}>
      <span className="material-name">{waiting.length > 1 ? `${waiting.length} files` : waiting[0].name}</span>
      <input autoFocus value={note} onChange={e => setNote(e.target.value)} maxLength={600} aria-label="What is this?"
        placeholder="What is this? e.g. last year's prelim, very close to ours (optional)"/>
      <label className="material-model"><input type="checkbox" checked={model} onChange={e => setModel(e.target.checked)}/> Closest to my exam</label>
      <span className="material-note-actions"><button type="button" onClick={() => setWaiting(null)}>Cancel</button><button type="submit" className="material-add">Add</button></span>
    </form>}
    {problem && <p className="material-problem" role="alert">{problem}</p>}
    {open && <ul className="material-files">{files.map(f => <li key={f.id} className={`is-${f.state}`}>
      <span className="material-name">{f.name}</span>
      <span className="material-state">{!['in_guide', 'ready', 'failed'].includes(f.state) && <span className="chat-spinner" aria-hidden="true"/>}{STATE[f.state]}{f.problem ? `: ${f.problem}` : ''}</span>
    </li>)}</ul>}
  </section>;
}
