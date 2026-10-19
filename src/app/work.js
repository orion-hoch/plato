// The student's work zones (code and LaTeX) and exam problems: what Plato is shown as they work, and what is handed in.
import { api } from '../backend-client.js';
import { written } from '../tutor-bridge.js';

// After this long without a keystroke in a work zone, Plato is shown what changed there (a run shows at once).
const WORK_MS = 3000;

export function createWork({ work, workShown, workHanded, workTimer, session, bridge, ink, handed, sending, now, context, toAgent, answered, tell, fresh, ownWork, handShapes }) {
  // A work zone (or an exam part's answer) changed, or went (null). What it opened with (a starter, Plato's own lines)
  // is neither news to Plato nor the student's work; the rest he is shown once they pause, or at once when they ran it.
  function workChanged(key, content) {
    const before = work.current.get(key);
    if (!content) { work.current.delete(key); return; }
    work.current.set(key, content);
    if (!before) { workShown.current.set(key, content.brief); workHanded.current.set(key, content.value); return; }
    clearTimeout(workTimer.current);
    workTimer.current = setTimeout(showWork, content.ran !== before.ran ? 0 : WORK_MS);
  }
  function showWork() {
    if (!session.current?.ready) return;
    const lines = [];
    for (const [key, c] of work.current) if (workShown.current.get(key) !== c.brief) { workShown.current.set(key, c.brief); lines.push(`[Student's page] ${c.part ? `part ${c.part}, ` : ''}${c.brief}`); }
    if (lines.length) context(lines.join('\n'));
  }
  // What the student has done in the zones (not an exam's parts) since they last handed it in, as Plato reads it.
  const freshWork = () => [...work.current].filter(([key, c]) => !c.part && workHanded.current.get(key) !== c.value).map(([, c]) => `[Written on the page] ${c.label}:\n${c.value}`).join('\n');
  const markHanded = () => { for (const [key, c] of work.current) if (!c.part) workHanded.current.set(key, c.value); };
  // Work from the zones as the student's turn (`ask`: the open question it answers). `quiet` as for tell().
  function handWork(turn, ask = null, quiet = false) {
    markHanded();
    if (ask) answered(ask);
    void (ask?.graded ? bridge.current?.answer(turn.slice(0, 8000), null) : bridge.current?.userSaid(turn.slice(0, 8000)));
    if (!quiet) toAgent(turn);
  }
  // An exam problem's answers: each part's from its zone, typing or choice, and the writing on each part not yet handed in.
  function examWork(ask) {
    const value = Object.fromEntries(ask.parts.map(p => [p.id, work.current.get(`${ask.id}:${p.id}`)?.value || '']));
    const inked = Map.groupBy(fresh(ownWork()).filter(stroke => stroke.on?.closest?.('.exam-part')), stroke => stroke.on.closest('.exam-part').dataset.part);
    return { value, inked };
  }
  // The problem handed in as { kind: 'exam', value: { [part id]: text } }, readable as "Part a: …"; returns that text.
  function submitExam(ask, value, quiet = false) {
    for (const id in value) value[id] = value[id].slice(0, 4000);
    const text = ask.parts.map(p => `Part ${p.id}: ${value[p.id] || '(blank)'}`).join('\n').slice(0, 7900);
    answered(ask);
    tell(`[Answered on the board] ${text}`, { kind: 'exam', value }, true, quiet);
    return text;
  }
  // An exam problem handed in (Enter on its last part, or Plato collecting the page): the writing on each part is read
  // first, without a turn, and its words go with that part's answer. Plato hears it as the student's turn.
  async function handIn(ask) {
    if (sending.current) return;
    const { value, inked } = examWork(ask);
    if (inked.size) {
      sending.current = true;
      try {
        await Promise.all([...inked].map(async ([id, strokes]) => {
          const drew = handShapes(strokes, id), words = written(await bridge.current.submitDrawing(ink.current.png(strokes), { commit: false }).catch(() => null));
          if (words || drew) value[id] = [value[id], words, drew].filter(Boolean).join('\n');
          if (words) for (const stroke of strokes) handed.current.add(stroke);
        }));
      } finally { sending.current = false; }
      if (now.current.page?.ask?.id !== ask.id || now.current.page.ask.answered) return; // the page moved on meanwhile
    }
    submitExam(ask, value);
  }
  // A code zone's C, run in the server's sandbox (once there is a session to run it in).
  const runC = fields => bridge.current?.session ? api.runCode(bridge.current.session, fields) : Promise.reject(Object.assign(Error('no session yet'), { status: 404 }));
  return { workChanged, freshWork, markHanded, handWork, examWork, submitExam, handIn, runC };
}
