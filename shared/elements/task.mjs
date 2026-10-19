// The task layer (docs/system-spec.md §15b; interactive-learning.md §9): checkpoints with gated reveal, the learner's
// prediction against the engine's truth (diff), signatures, and the evidence events, for any registry kind. Pure: the
// page runs one under each element (src/elements/Element.jsx) and the stand-in runs them with no page (evals/stand-in.mjs).
import { REGISTRY, predictionFrom } from './registry.mjs';

/** Hedges in a learner's turn ("I think", "maybe", "um", a questioning rise), for calibration (§15 rule 7; §10). */
const HEDGE = /\b(i think|i guess|i believe|maybe|probably|perhaps|possibly|i'm not sure|not sure|might be|could be|kind of|sort of|um+|uh+|erm+|hmm+)\b/gi;
export const hedgesOf = text => {
  const t = String(text ?? '');
  return [...new Set([...t.toLowerCase().matchAll(HEDGE)].map(m => m[1])), ...(/\?\s*$/.test(t.trim()) ? ['rising'] : [])].slice(0, 12);
};
/** The engagement ladder: the level a learner actually reached is what the evidence counts at. */
export const LEVELS = ['viewing', 'responding', 'changing', 'constructing', 'presenting'];
const listed = values => Object.entries(values).map(([name, v]) => `${name} = ${v}`).join(', ');

/**
 * A task on one checked element (registry checkElementSpec). `emit(event)` sends evidence (only for an element a card
 * put up: `cardId`); `tell(line)` tells Plato what happened on the page; `signatures` are the card's page-state branches
 * ({ when: { checkpoint, equals } | { checkpoint, name: value | 'unchanged' }, wrongModel, reply }) besides the spec's own.
 * The learner predicts by what they say (hear), acts on the element (act; a gated action waits for the prediction),
 * hands a construction in (done), and the element retires (retire).
 */
export function createTask(spec, { id = 'el', cardId = null, emit = () => {}, tell = () => {}, now = () => Date.now(), signatures = [], persona = null } = {}) {
  const E = REGISTRY[spec.kind].engine, task = spec.task, since = now();
  let state = spec.revealed ? E.reveal(E.init(spec.state)) : E.init(spec.state), level = 0, attempts = 0, answered = false;
  const cps = (task?.checkpoints || []).map((c, i) => ({ ...c, i, prediction: null, revealed: null }));
  const marks = [...(spec.signatures || []), ...signatures].map(s => ({ ...s, when: s.when ?? s.pageState ?? {} }));
  const event = (type, fields = {}) => { if (cardId) emit({ type, cardId, element: id, kind: spec.kind, concepts: spec.concepts || [], at: new Date(now()).toISOString(), ...fields }); };
  const reach = n => { level = Math.max(level, n); };
  const passes = action => { try { return E.passes(state, action) || []; } catch { return []; } };
  // A kind with a position (a trace) holds a checkpoint at its gate: it opens once the learner gets there.
  const open = () => { const c = cps.find(c => !c.revealed); return !c ? null : E.next == null || passes(E.next).includes(c.at) ? c : null; };
  const seek = at => { for (let i = 0; i < 2000 && E.next != null; i++) { const keys = passes(E.next); if (!keys.length || keys.includes(at)) break; state = E.step(state, E.next); } };

  // A signature: the card's If-branch keyed on page state, matched against a prediction (at its checkpoint) or the state.
  function signed(values, before, checkpoint = null) {
    for (const s of marks) {
      const w = s.when, at = w.checkpoint ?? null, want = w.equals ?? Object.fromEntries(Object.entries(w).filter(([k]) => k !== 'checkpoint'));
      if (at !== null && at !== checkpoint) continue;
      if (!Object.keys(want).length || !Object.entries(want).every(([name, v]) => values[name] != null && E.diff({ [name]: values[name] }, { [name]: v === 'unchanged' ? before?.[name] : v }, [name])[0].match)) continue;
      event('signature', { wrongModel: s.wrongModel ?? null, how: 'state', ...(checkpoint !== null ? { checkpoint } : {}) });
      tell(`[Student's page] That matches the belief ${JSON.stringify(s.wrongModel || s.misconception || 'on the card')}${s.reply ? `: ${String(s.reply).replace(/[.!?]+$/, '')}` : ''}.`);
    }
  }
  function reveal(c, before) {
    const truth = E.values(state), actual = Object.fromEntries(c.predict.map(n => [n, truth[n] ?? null])), diff = E.diff(c.prediction.values, actual, c.predict), match = diff.every(r => r.match);
    c.revealed = { actual, diff, match };
    event('revealed', { checkpoint: c.i, actual, match, diff, by: c.prediction.by });
    const whose = c.prediction.by === 'persona' ? `${persona?.name || 'The classmate'}'s answer` : c.prediction.by === 'model' ? 'Their earlier answer' : 'Their prediction';
    tell(`[Student's page] ${c.at} done: ${listed(actual)}. ${whose} ${match ? 'matches' : `differs (${diff.filter(r => !r.match).map(r => `${r.name}: ${r.predicted ?? 'none'} vs ${r.actual}`).join('; ')})`}.`);
    signed(c.prediction.values, before, c.i);
  }

  // The engine's own move (a repair runs their answer; a classmate's attempt is shown as his): committed already.
  const given = task?.prediction ? 'model' : task?.attempt ? 'persona' : null;
  if (cps.length && (task?.mode === 'predict' || given)) seek(cps[0].at);
  if (given && cps[0]) cps[0].prediction = { values: task.prediction ?? task.attempt, words: null, hedges: [], by: given };
  event('shown', { level: spec.level ?? null });

  const live = {
    get state() { return state; },
    get checkpoints() { return cps; },
    get level() { return LEVELS[level]; },
    open,
    /** Whether `action` is held at a checkpoint still waiting for a prediction. */
    blocked: action => cps.some(c => !c.revealed && !c.prediction && passes(action).includes(c.at)),
    /** A learner's turn (what they said, typed or wrote) while a checkpoint waits: their prediction. True when taken.
     *  A task with no checkpoints (compare, explain, teach, a prediction asked in words) takes their first turn as their
     *  answer to its ask: responding (presenting when they teach), recorded as what they said, for the engine to judge. */
    hear(text) {
      const c = open();
      if (!cps.length && task && !answered && String(text ?? '').trim()) {
        answered = true;
        const words = String(text).trim().slice(0, 300);
        reach(task.mode === 'teach' ? 4 : 1);
        event(task.mode === 'predict' ? 'predicted' : 'explained', { checkpoint: null, words, hedges: hedgesOf(words), mode: task.mode });
        return false;
      }
      if (!c || c.prediction) return false;
      const { values, parsed } = predictionFrom(text, c.predict, E.parse && ((said, names) => E.parse(said, names, state))), words = String(text ?? '').trim().slice(0, 300);
      if (!parsed) return false; // no value in it (a greeting, a question, "not sure"): the checkpoint stays open, nothing is revealed
      c.prediction = { values, words, hedges: hedgesOf(words), by: 'learner' };
      reach(1);
      event('predicted', { checkpoint: c.i, value: values, words, hedges: c.prediction.hedges });
      tell(`[Student's page] Their prediction for ${c.at}: ${parsed ? listed(values) : `none heard in "${words.slice(0, 80)}"`}. Now they can see it.`);
      return true;
    },
    /** The learner acts on the element. False (nothing changes) when a checkpoint is still waiting for their prediction. */
    act(action) {
      const keys = passes(action), c = cps.find(c => !c.revealed && keys.includes(c.at));
      if (c && !c.prediction) return false;
      const before = E.values(state);
      let after;
      try { after = E.step(state, action); } catch { return false; }
      state = after;
      if (c) reveal(c, before);
      else {
        reach(2);
        const now = E.values(state), moved = Object.keys(now).filter(n => String(now[n]) !== String(before[n]));
        if (moved.length) event('changed', { control: action, from: Object.fromEntries(moved.map(n => [n, before[n] ?? null])), to: Object.fromEntries(moved.map(n => [n, now[n]])) });
      }
      return true;
    },
    /** The open checkpoint's gated action, done for the learner (a repair's run of their own model; the stand-in). */
    revealNow() { const c = cps.find(c => !c.revealed && c.prediction); if (!c) return false; seek(c.at); return live.act(E.next ?? E.actionFor(c.at)); },
    /** The learner says they're done (collect_page_work): a construction checked, the first failure only. Words for Plato, or ''. */
    done() {
      if (task?.mode !== 'construct') return '';
      attempts++; reach(3);
      const result = E.check(state, task.target ?? {});
      event('constructed', { artifact: E.brief(state), check: result, attempts });
      signed(E.values(state), null);
      return `${E.brief(state)}. ${result.pass ? 'It meets the target.' : `First problem: ${result.firstFailure}.`}`;
    },
    /** Their drawing from memory, as the drawing reader read it: evidence the engine scores against the rubric; then the
     *  reference shows (a canvas's 'reveal'). */
    drawn(reading) {
      reach(3);
      event('drawn', { reading: String(reading ?? '').slice(0, 2000), rubric: task?.rubric ?? null });
      try { state = E.step(state, 'reveal'); } catch { /* a kind with no reference */ }
    },
    brief: () => E.brief(state),
    /** The element leaves the page: the level actually reached, and the time it was up. */
    retire() { event('enacted_level', { level: LEVELS[level] }); event('time', { ms: now() - since, hints: 0 }); },
  };
  if (given === 'model') live.revealNow();
  return live;
}
