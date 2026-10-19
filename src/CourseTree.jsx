import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './backend-client.js';
import { chooseCourse } from './tutor-bridge.js';
import { ACCEPT } from './study-material.mjs';
import { outline, subtree } from './course-tree.mjs';
import { MaterialPanel } from './Material.jsx';
import './course-tree.css';

// The course page (16 Oct, the user: "this just looks bad and needs a complete reformat"): a bar with their courses and a
// new one, the course with its overall mastery, then its units in the course's own order as numbered cards, each topic a
// row that fills from the left with its mastery (continuous, never a 1-2-3 label). Pressing a topic puts Plato's focus on it
// and studies it; pressing a unit's head focuses the unit; pressing what is in focus again lets go. Beside it (below it on
// a phone) is the open learner model (system-spec §10): the ideas being untangled, calibration, what comes back when.

export { subtree };

export function TreeButton({ onOpen }) {
  return <button className="round tree-button" onClick={onOpen} aria-label="Show your course">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3v6M12 9l-6 6M12 9l6 6M12 9v6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <circle cx="12" cy="4" r="2.2" fill="currentColor"/><circle cx="6" cy="17" r="2.2" fill="currentColor"/><circle cx="12" cy="17" r="2.2" fill="currentColor"/><circle cx="18" cy="17" r="2.2" fill="currentColor"/></svg>
  </button>;
}

const pct = f => Math.round(f * 100);
// An exam date: a bare "2026-10-22" is that day here, not midnight UTC (17 Oct: the 22nd showed as Oct 21 in New York).
const dayOf = d => { const t = d && new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00` : d); return t && !isNaN(t) ? t : null; };
const dateOf = d => dayOf(d)?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) || '';
/** "in 5 days", "tomorrow", "today", "was Oct 15": when their exam is, from today. */
function examWhen(d) {
  const t = dayOf(d); if (!t) return '';
  const days = Math.round((new Date(t).setHours(12, 0, 0, 0) - new Date().setHours(12, 0, 0, 0)) / 864e5);
  return days < 0 ? `was ${dateOf(d)}` : `${dateOf(d)}, ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}`;
}
// A practice exam taken with Plato: said as their own line, so his next turn sets it (the course page closes).
const takePractice = (p, close) => { dispatchEvent(new CustomEvent('plato:say', { detail: { text: `Let's do ${p.title} under exam conditions: one question at a time, solutions after I answer.` } })); close?.(); };

// Their courses. In the course page, tabs in its bar (the open one marked); `choosing`: the whole page as cards, when there
// are several and none is chosen yet. Pressing another opens the page on it (its session picks up where it was).
export function Courses({ current = null, choosing = false, list = null }) {
  const [own, setExams] = useState(null), [adding, setAdding] = useState(false), exams = list || own;
  useEffect(() => { if (!list) api.listExams().then(r => setExams(r.exams)).catch(() => {}); }, [list]);
  if (!exams) return null;
  // On document.body: inside the course bar (its backdrop blur) a fixed dialog was held to the bar's 64px (16 Oct: "basically unusable").
  const form = adding && createPortal(<NewCourse onClose={() => setAdding(false)}/>, document.body);
  if (!choosing) return <nav className="course-tabs" aria-label="Your courses">
    {exams.map(e => <button key={e.examId} aria-current={e.examId === current ? 'page' : undefined} onClick={() => e.examId !== current && chooseCourse(e.examId, { tree: true })}>{e.title}</button>)}
    <button className="course-tab-new" onClick={() => setAdding(true)}>+ New course</button>
    {form}
  </nav>;
  return <div className="course-choice">
    <div className="course-choice-inner">
      <h1>Your courses</h1>
      <div className="course-cards">
        {exams.map(e => <button key={e.examId} className="course-card" onClick={() => chooseCourse(e.examId)} title={checks(e.guide) || undefined}>
          <span className="course-card-title">{e.title}</span>
          <span className="course-card-note">{e.examDate && <b className="course-card-exam">Exam {examWhen(e.examDate)}</b>}{readiness(e.guide) || (e.knowledgeReady ? 'Ready to study' : 'Reading your material…')}</span>
        </button>)}
        <button className="course-card course-card-new" onClick={() => setAdding(true)}>
          <span className="course-card-plus" aria-hidden="true">+</span>
          <span className="course-card-title">New course</span>
          <span className="course-card-note">From your notes, slides, past exams or a textbook</span>
        </button>
      </div>
    </div>
    {form}
  </div>;
}

// Where a harness course's study guide stands, and once built what the harness checked: units audited against the material,
// test lessons judged, what the material lacks (in the tooltip). Saying what was checked is the harness's "trust me".
function readiness(g) {
  if (!g) return '';
  if (g.state === 'planning') return 'Planning its study guide…';
  if (g.state === 'writing') return `Writing its study guide: ${g.done} of ${g.units} units`;
  if (g.state === 'practice') return 'Writing practice exams in the shape of your real ones…';
  if (g.state === 'kits') return 'Making figures for this subject (drawing and checking them)…';
  if (g.state === 'checking') return 'Testing lessons on its hardest topics…';
  if (g.state === 'updating') return 'Adding your new material to its study guide…';
  if (g.state === 'failed') return 'Its study guide couldn’t be built yet; it will try again';
  if (g.state === 'paused') return 'Paused: your plan’s usage limit was reached. It picks up where it stopped in about half an hour';
  // What they get (17 Oct: the card read like a build log); what was checked, and what the material lacks, in its tooltip.
  return [g.topics && `${g.topics} topics in ${g.units} units`, g.practice?.length && `${g.practice.length} practice exam${g.practice.length > 1 ? 's' : ''}`].filter(Boolean).join(', ');
}
function checks(g) {
  const r = g?.report || {}, lessons = (r.lessons || []).filter(l => l.scores);
  return [r.audited && `${r.audited} units checked against your material`, lessons.length && `${lessons.length} test lesson${lessons.length > 1 ? 's' : ''} (accuracy ${lessons.map(l => l.scores.accuracy).join(', ')} of 10)`,
    g?.practice?.length && 'practice exams re-solved and simulated by a second checker', ...(r.gaps?.length ? ['', 'What your material lacks:', ...r.gaps.map(x => `- ${x}`)] : [])].filter(x => x !== 0 && x != null && x !== false).join('\n');
}

// A new course from their files (15 Oct: the harness): a dialog with its name, what it is for (their exam, its date and
// scope: the study guide is built toward it) and its files, dropped or chosen and listed before anything is made. Create
// makes it, sends the files, and opens the page on it; the harness reads them and builds its study guide (server/index.mjs).
function NewCourse({ onClose }) {
  const [name, setName] = useState(''), [goal, setGoal] = useState(''), [files, setFiles] = useState([]), [busy, setBusy] = useState(''), [over, setOver] = useState(false);
  const picker = useRef(null);
  const addFiles = list => setFiles(had => [...had, ...[...list].filter(f => !had.some(h => h.name === f.name && h.size === f.size))]);
  useEffect(() => { const key = e => { if (e.key === 'Escape' && !busy) onClose(); }; addEventListener('keydown', key); return () => removeEventListener('keydown', key); }, [busy]);
  async function create(e) {
    e.preventDefault();
    if (!files.length) return picker.current?.click();
    setBusy('Creating the course and sending your files…');
    try {
      const created = await api.createExam({ title: (name.trim() || files[0].name.replace(/\.[^.]+$/, '')).slice(0, 200), ...(goal.trim() ? { instructions: goal.trim().slice(0, 4000) } : {}) });
      await api.upload(created.examId, files);
      chooseCourse(created.examId);
    } catch (error) { setBusy(`Couldn’t create it: ${error?.message || 'something went wrong'}. Try again.`); }
  }
  const size = n => n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
  return <div className="new-course-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <form className="new-course" role="dialog" aria-modal="true" aria-labelledby="new-course-title" onSubmit={create}>
      <h2 id="new-course-title">New course</h2>
      <p className="new-course-lede">Plato reads your material, writes a study guide checked against it, and teaches from it. It’s ready to start in a few minutes and fills in while you study.</p>
      <label>Course name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Organic Chemistry I" maxLength={200}/></label>
      <label>What are you studying for? <span className="optional">optional</span>
        <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2} maxLength={4000} placeholder="Prelim 2 on Nov 12, chapters 9 to 16, proofs graded strictly"/></label>
      <div className={`new-course-drop${over ? ' is-over' : ''}`} onClick={() => picker.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
        <span><b>Drop files here</b> or <span className="new-course-link">choose them</span></span>
        <small>Lecture notes, slides, textbook chapters, past exams and their solutions, problem sets</small>
      </div>
      {files.length > 0 && <ul className="new-course-files">{files.map((f, i) => <li key={`${f.name}-${i}`}>
        <span>{f.name}</span><small>{size(f.size)}</small>
        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(list => list.filter((_, k) => k !== i))}>×</button>
      </li>)}</ul>}
      <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }}/>
      {busy && <p className={`new-course-status${busy.startsWith('Couldn') ? ' is-error' : ''}`} role="status">{busy}</p>}
      <div className="new-course-actions">
        <button type="button" className="new-course-cancel" onClick={onClose} disabled={Boolean(busy) && !busy.startsWith('Couldn')}>Cancel</button>
        <button type="submit" className="new-course-create" disabled={Boolean(busy) && !busy.startsWith('Couldn')}>{files.length ? `Create course with ${files.length} file${files.length > 1 ? 's' : ''}` : 'Choose files'}</button>
      </div>
    </form>
  </div>;
}

export default function CourseTree({ examId, title, open, onClose, onFocus }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(false), [map, setMap] = useState(null), [exams, setExams] = useState(null), [naming, setNaming] = useState(false);
  useEffect(() => { if (open) api.listExams().then(r => setExams(r.exams)).catch(() => {}); }, [open]);
  const exam = exams?.find(e => e.examId === examId), name = exam?.title || title;
  // Renaming the course (16 Oct, the user: "add a way to edit course name"): its title is an input until Enter or a click away.
  async function rename(next) {
    setNaming(false);
    next = next.trim();
    if (!exam || !next || next === exam.title) return;
    try { const r = await api.patchExam(examId, { title: next, expectedRowVersion: exam.rowVersion }); setExams(list => list.map(e => e.examId === examId ? { ...e, title: r.title, rowVersion: r.rowVersion } : e)); }
    catch { api.listExams().then(r => setExams(r.exams)).catch(() => {}); }
  }
  const closeRef = useRef(null), sheet = useRef(null), scrolled = useRef(false);
  async function load() {
    if (!examId) return;
    // The map is the learner model's (GET …/map); a server without it yet shows the outline alone.
    const [progress, mine] = await Promise.all([api.progress(examId).catch(() => null), api.map(examId).catch(() => null)]);
    setData(d => progress || d || { topics: [], focus: null, failed: true });
    setMap(mine);
  }
  useEffect(() => {
    if (!open) return;
    scrolled.current = false; void load(); closeRef.current?.focus({ focusVisible: false });
    const timer = setInterval(load, 15000), key = e => { if (e.key === 'Escape' && !document.querySelector('.new-course, .material-files')) onClose(); };
    addEventListener('keydown', key);
    return () => { clearInterval(timer); removeEventListener('keydown', key); };
  }, [open, examId]);

  const topics = data?.topics || [];
  const { units, overall } = useMemo(() => outline(topics), [data]);
  const focusIds = useMemo(() => { const s = new Set(); for (const id of data?.focus?.topicIds || []) for (const x of subtree(topics, id)) s.add(x); return s; }, [data]);
  // The first view after opening brings the focus into view.
  useEffect(() => { if (data && open && !scrolled.current) { scrolled.current = true; sheet.current?.querySelector('.in-focus')?.scrollIntoView({ block: 'center' }); } }, [data, open]);
  if (!open) return null;

  async function press(node) {
    if (busy || !examId) return;
    setBusy(true);
    try {
      const current = data?.focus;
      const same = current && current.topicIds.length === 1 && current.topicIds[0] === node.id;
      if (node.root || same) {
        if (current) await api.updateFocus(examId, current.id, { expectedRowVersion: current.rowVersion, active: false });
        onFocus?.(null, null);
      } else {
        const sections = (await api.focus(examId)).sections || [];
        const existing = sections.find(s => s.topicIds.length === 1 && s.topicIds[0] === node.id);
        const section = existing
          ? await api.updateFocus(examId, existing.id, { expectedRowVersion: existing.rowVersion, active: true })
          : await api.createFocus(examId, { name: node.title, topicIds: [node.id], goal: 'Secure', activate: true });
        onFocus?.(section, { ...node, leaf: !node.children.length });
      }
      await load();
    } catch { await load(); } finally { setBusy(false); }
  }

  const label = n => `${n.number} ${n.title}, ${n.assessed ? `${pct(n.fill)} percent` : 'not assessed yet'}${focusIds.has(n.id) ? ', in focus' : ''}`;
  const rows = (list, depth) => <ol className={`tree-topics depth-${depth}`}>{list.map(t => <li key={t.id}>
    <button data-id={t.id} className={`tree-topic${focusIds.has(t.id) ? ' in-focus' : ''}${t.assessed && t.fill < .35 ? ' low' : ''}`} onClick={() => press(t)} aria-label={label(t)}>
      <span className="tree-num">{t.number}</span><span className="tree-title">{t.title}</span>
      {t.assessed && <span className="tree-meter" aria-hidden="true"><i style={{ width: `${pct(t.fill)}%` }}/></span>}
    </button>
    {t.children.length > 0 && rows(t.children, depth + 1)}
  </li>)}</ol>;
  const shown = learnerMap(map, data?.focus ? focusIds : null), focusName = data?.focus?.name;
  // No course yet (a new install): the new-course form is the page (19 Oct: it showed an empty course's placeholders for good).
  if (exams && !exams.some(e => !['deleted', 'deleting'].includes(e.status))) return <NewCourse onClose={onClose}/>;
  return <div className={`course-tree${shown ? ' has-map' : ''}`} role="dialog" aria-label="Your course">
    <header className="tree-bar">
      <Courses current={examId} list={exams}/>
      <button ref={closeRef} className="round close course-tree-close" onClick={onClose} aria-label="Close">×</button>
    </header>
    <div ref={sheet} className="tree-page">
      <div className="tree-head">
        <div className="tree-head-main">
          {naming
            ? <input className="tree-name" autoFocus defaultValue={name} aria-label="Course name" maxLength={200} onBlur={e => rename(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.value = name; e.currentTarget.blur(); } }}/>
            : <h1><button className="tree-name-edit" onClick={() => setNaming(true)} disabled={!exam} title="Rename this course">{name || 'Your course'}
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button></h1>}
          <div className="tree-overall"><span className="tree-meter big" aria-hidden="true"><i style={{ width: `${pct(overall)}%` }}/></span>
            <span>{pct(overall)}% overall{units.length ? `, ${units.length} units, ${topics.length - units.length} topics` : ''}</span></div>
          {exam?.examDate && <p className="tree-exam">Exam {examWhen(exam.examDate)}</p>}
          {focusName && <p className="tree-focus">Focused on <b>{focusName}</b></p>}
        </div>
        <MaterialPanel examId={examId}/>
      </div>
      {exam?.guide?.practice?.length > 0 && <section className="tree-practice" aria-label="Practice exams">
        <h2>Practice exams</h2>
        <div className="tree-practice-cards">{exam.guide.practice.map(p => <div key={p.name} className="tree-practice-card">
          <span><b>{p.title}</b><small>{p.questions} questions{p.points ? `, ${p.points} points` : ''}, with checked solutions</small></span>
          <button onClick={() => takePractice(p, onClose)}>Take it with Plato</button>
        </div>)}</div>
      </section>}
      {!data && <div className="tree-units is-loading" aria-hidden="true">{[0, 1, 2, 3].map(i => <div key={i} className="tree-unit skeleton"><i/><i/><i/><i/></div>)}</div>}
      {data && !topics.length && <p className="tree-state" role="status">{data.failed ? 'Your course can’t be reached right now. It will show here once it can.' : 'Your course’s topics appear here once its files are read.'}</p>}
      {units.length > 0 && <div className="tree-units">{units.map(u => <section key={u.id} className={`tree-unit${focusIds.has(u.id) ? ' in-focus' : ''}`}>
        <button data-id={u.id} className="tree-unit-head" onClick={() => press(u)} aria-label={label(u)}>
          <span className="tree-unit-num">{u.number}</span><span className="tree-unit-title">{u.title}</span>
          <span className="tree-unit-pct">{u.assessed ? `${pct(u.fill)}%` : ''}</span>
        </button>
        {u.children.length > 0 && rows(u.children, 2)}
      </section>)}</div>}
    </div>
    {shown && <LearnerMap map={shown}/>}
  </div>;
}

// The learner's map, for the topics in focus (or all): what they can do, the beliefs being worked on, calibration, due.
function learnerMap(map, focus) {
  if (!map) return null;
  const here = x => !focus || !x.topicId || focus.has(x.topicId);
  const shown = { canDo: (map.canDo || []).filter(here), wrongModels: (map.wrongModels || []).filter(here), due: (map.due || []).filter(here), line: map.calibration?.line || '' };
  return shown.wrongModels.length || shown.due.length || shown.line ? shown : null;
}
const BELIEF = { confirmed: 'working on it', addressed: 'worked on; checked again later', resolved: 'settled' };
function when(at) {
  const days = Math.round((new Date(at) - Date.now()) / 86_400_000);
  return !Number.isFinite(days) ? '' : days <= 0 ? 'now' : days === 1 ? 'tomorrow' : `in ${days} days`;
}
function LearnerMap({ map }) {
  return <aside className="tree-map" aria-label="Your map">
    {map.line && <p className="map-line">{map.line}</p>}
    {map.wrongModels.length > 0 && <section><h3 className="map-head">Ideas being untangled</h3><ul className="map-list">
      {map.wrongModels.map(w => <li key={w.id} className={`map-belief is-${w.status}`}><q>{w.belief}</q> <span className="map-note">{BELIEF[w.status] || w.status}</span></li>)}
    </ul></section>}
    {map.due.length > 0 && <section><h3 className="map-head">Coming back</h3><ul className="map-list">
      {map.due.slice(0, 20).map(d => <li key={d.kcId}>{d.statement} <span className="map-note">{when(d.dueAt)}</span></li>)}
    </ul></section>}
  </aside>;
}
