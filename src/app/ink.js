// The student's writing: what is theirs and what is notes on Plato's material, glances at it (a look, not a turn), what a
// drawing is made of, and handing it in.
import { drawn, written } from '../tutor-bridge.js';
import { diagramish } from '../inputs/ink.mjs';
import { liveTasks } from '../elements/Element.jsx';

// After this long without a stroke, Plato glances at what is written (a look, not a turn). Writing this recent
// means the student is still at it: Plato's page and their writing are left alone.
export const GLANCE_MS = 1500, WRITING_MS = 2000;

export function createInk({ ink, now, bridge, handed, glance, shapes, sending, inkActive, session, setInked, setErasing, answered, context }) {
  // Writing on Plato's material: the student's notes, which new material would take away. The rest (under what he
  // asked, or off the page) is their own work.
  const onMaterial = stroke => stroke.note || (stroke.on && !stroke.on.classList.contains('page-ask'));
  const ownWork = () => (ink.current?.strokes() || []).filter(stroke => !onMaterial(stroke));
  // Writing handed in: the backend reads it and records it, with any words typed or said alongside, as the student's
  // turn (under a posed question, as its answer). It stays on the page, as all writing does until it is undone or
  // cleared; once read it counts as handed in, so the next turn carries only what was written since. A drawing's
  // shapes go with it ("drew: …") when they are already read for this ink; otherwise they follow as context, never a wait.
  async function commit(strokes, text = '') {
    const ask = now.current.page?.ask, drew = handShapes(strokes);
    const words = written(await bridge.current.submitDrawing(ink.current.png(strokes), { text: [text, drew].filter(Boolean).join('\n') }));
    if (words) { for (const stroke of strokes) handed.current.add(stroke); if (ask?.graded) answered(ask); }
    // A drawing from memory on a canvas is its evidence (scored against its rubric by the engine); then the reference shows.
    for (const task of liveTasks) if (task.kind === 'canvas') task.drawn([words, drew].filter(Boolean).join('\n'));
    return [words, drew].filter(Boolean).join('\n');
  }
  const fresh = list => list.filter(stroke => !handed.current.has(stroke));
  // A pause in writing shows Plato the page as context, not as a turn: one look at a time, only when it changed.
  // The reading is kept for that version of the page, so collecting it later needs no wait.
  function inkChanged() {
    const any = Boolean(ink.current?.strokes().length);
    setInked(any);
    if (!any) setErasing(false);
    clearTimeout(glance.current.timer);
    glance.current.timer = setTimeout(look, GLANCE_MS);
  }
  async function look() {
    const seen = glance.current, strokes = ink.current?.strokes() || [], version = ink.current?.version();
    if (!strokes.length || version === seen.seen || !session.current?.ready) return;
    if (seen.busy || sending.current) { seen.timer = setTimeout(look, GLANCE_MS); return; }
    seen.busy = true; seen.seen = version; seen.words = '';
    glanceShapes();
    try {
      const words = seen.words = written(await bridge.current.submitDrawing(ink.current.png(strokes), { commit: false }));
      if (words) context(`[Student's page] ${words}`);
    } catch { /* a glance is best-effort */ } finally { seen.busy = false; }
  }
  // What a drawing is made of (its shapes, what joins what, cells in order) is read apart from its words and in the
  // background, only for ink that looks like a drawing, never plain writing (diagramish). While they work: one read of
  // the whole page at a time, told to Plato as context when it ends unless the page changed meanwhile. A hand-in never
  // waits for one: shapes already read for exactly that ink go with it; otherwise they follow as context once read.
  function readShapes(strokes, { handedIn = false, part = null } = {}) {
    try {
      const trace = strokes.length ? ink.current.trace(strokes) : null;
      if (!diagramish(trace) || !session.current?.ready || !bridge.current) return;
      const kept = shapes.current, version = ink.current.version(), whole = strokes.length === ink.current.strokes().length, read = { version, handedIn, part };
      if (whole) kept.busy = read;
      void bridge.current.readShapes(ink.current.png(strokes), trace).then(drawn, () => '').then(drew => {
        const current = ink.current?.version() === version;
        if (drew && whole && current) kept.done = { version, drew };
        if (drew && (read.handedIn || current)) context(`[Student's page] ${read.part ? `part ${read.part}, ` : ''}${drew}`);
      }).finally(() => {
        if (kept.busy !== read) return;
        kept.busy = null;
        if (kept.again && performance.now() - inkActive.current >= WRITING_MS) { kept.again = false; glanceShapes(); }
      });
    } catch { /* best-effort, as a glance */ }
  }
  // From a glance: the whole page, unless it is read or being read; one at a time (the next when this one ends).
  function glanceShapes() {
    const kept = shapes.current, version = ink.current?.version();
    if (kept.done?.version === version || kept.busy?.version === version) return;
    if (kept.busy) { kept.again = true; return; }
    readShapes(ink.current?.strokes() || []);
  }
  // The shapes of exactly this ink, if they are read.
  const readyShapes = strokes => strokes.length === ink.current?.strokes().length && shapes.current.done?.version === ink.current.version() ? shapes.current.done.drew : '';
  // At a hand-in: the shapes if they are read (they go with it), else '' and they follow as context: the read running
  // for this ink is told it was handed in, or one starts for what was handed in (`part`: an exam problem's part).
  function handShapes(strokes, part = null) {
    const ready = readyShapes(strokes), busy = shapes.current.busy;
    if (ready) return ready;
    if (busy && busy.version === ink.current?.version() && strokes.length === ink.current.strokes().length) busy.handedIn = true;
    else readShapes(strokes, { handedIn: true, part });
    return '';
  }
  return { ownWork, commit, fresh, inkChanged, readyShapes, handShapes };
}
