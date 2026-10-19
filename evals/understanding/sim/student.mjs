// Level 3's simulated student, loaded by evals/stand-in.mjs (--student) in its process. Its knowledge, misconceptions,
// confidence, help-seeking, reading and frustration are a state machine in code (sim/core.mjs) over the fixture's belief
// library (fixtures/<f>/beliefs.mjs). Each turn:
//   1. perceive (the deep setting at medium effort, the judge's setting, with the hidden beliefs in view): what the
//      tutor's newest turn asks, the moves it makes, its verdict on the last answer, any reading it sends the student to,
//      and which hidden beliefs it refuted in a TARGETED way;
//   2. code updates the state (learning by the world's response functions, refutations pending until a correct
//      re-derivation, time on text) and decides the CONTENT of the reply (right, a belief's wrong answer, a slip,
//      "I don't know", an explanation from the right model or from the belief, a confidence, a request);
//   3. the light setting phrases it, and a check confirms the phrasing kept the content (in code for computed values,
//      by the light setting for conceptual beliefs), else a template line is used.
// Config: UNDERSTANDING_STUDENT=<json> { fixture, persona, world, seed, concepts, out, hold }. Every turn is logged to
// `out` with its perception, content and the state, so a stalled run keeps what it saw.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, clip, S, setRuntime, statedIn, writeJson } from '../lib.mjs';
import { createStudent } from './core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(await readFile(process.env.UNDERSTANDING_STUDENT, 'utf8'));
const lib = await import(path.join(HERE, '..', 'fixtures', cfg.fixture, 'beliefs.mjs'));
const student = createStudent({ lib, persona: cfg.persona, world: cfg.world, seed: cfg.seed, theta: cfg.theta ?? null, bugs: cfg.bugs ?? null, focus: cfg.concepts ?? null });
const focus = cfg.concepts?.length ? cfg.concepts : lib.concepts.map(c => c.id);
const log = [];
let last = null, holdDone = !cfg.hold, pending = null, checkedBack = false, undo = null; // pending: the perception a "give me a second" put on hold
const save = extra => writeJson(cfg.out, { config: cfg, state: student.state, log, ...extra });

import { PERCEIVE, PERCEIVE_VERSION, PERCEPTION } from './perceive.mjs';
export { PERCEIVE_VERSION };

export const PHRASE_VERSION = 'sim_phrase_v2'; // v2: only the decided content, never a second answer or a derivation
// v3 (the lead, 2026-10-09, a correction made after a result): an "I don't know why" line no longer replaces the truth of the
// answer before it, so a verdict is checked against the answer it refers to (both arms).
export const STUDENT_VERSION = 'sim_student_v3';
const PHRASE = `You write one message from a student in a tutoring chat. Its content is already decided; you only phrase it.
Rules: keep the content exactly (the same value, the same claim, or not knowing). Never add a fact, a reason, a calculation, a step or a second answer the content does not contain: if the tutor asked several things, answer only what the content answers, and say nothing about the rest (or that you haven't got to it yet). hedge when confidence is low ("i think", "maybe", "not sure but"), sound sure when it is high; the persona sets the voice. When cues.filler is true, start with a filler ("um", "uh", "so"); when cues.trailing is true, end with a trailing clause that leaves the turn open ("…or something", "…i think, but"). One or two short lines, typed the way a student types (lowercase is fine). No labels, quotes or stage directions.`;
const JUDGE_ATTEMPT = `A student answered a tutor's question. Is the student's answer correct? correct: true or false. Judge only correctness, not style.`;
const CHECK = `A student's chat message was written to carry a given content and nothing more. kept is true only when both hold: (1) the message states that content (the same answer, the same claim or belief, or not knowing); (2) it adds nothing beyond it: no other answer, value, calculation, derivation or reason that the content does not contain.`;

const content = (act, extra = {}) => ({ act, ...extra });
const PRIORITY = ['worked_example', 'try_first', 'refutation', 'diagram', 'explain', 'read', 'analogy', 'hint', 'question', 'feedback', 'told', 'other'];
const LEVEL = { basic: -1, course: 0, advanced: 1 };
const conceptOf = id => (id && lib.concepts.find(c => c.id === id)) ? id : focus[0];

/** The reply's content, decided in code from the perception and the state. */
function decide(p) {
  // "Explain" about an item the student has not answered yet: a student gives the value first (the explanation comes when
  // asked about that answer). Decided in code, so a perception that reads "what do you get, and why?" as "explain" can't
  // make the student skip the computation.
  const unanswered = p.asks.type === 'explain' && p.asks.skill && p.asks.params && last?.skill !== p.asks.skill; // the last answer was to another skill, or none yet
  const type = unanswered ? 'item' : p.asks.type, concept = conceptOf(p.asks.concept);
  // The hold check: once, on the first question to work out, the student asks for a moment first.
  if (!holdDone && ['item', 'predict'].includes(type) && student.state.turn >= 2) { holdDone = true; pending = p; return content('hold'); }
  if (type === 'item' || type === 'predict') {
    const skill = lib.skills.find(k => k.id === p.asks.skill);
    let params = null;
    try { params = p.asks.params ? JSON.parse(p.asks.params) : {}; } catch { params = null; }
    // Several parts of one skill (v4): each part decided in code as below, the answers given in order.
    if (skill && Array.isArray(params) && params.length > 1 && params.every(x => x && skill.valid(x))) {
      if (student.seeksHelp()) return content('help');
      const parts = params.map(x => { const right = skill.solve(x), wrongs = Object.entries(skill.bugs).map(([id, f]) => [id, f(x)]).filter(([id, w]) => student.state.bugs[id] && w !== null && String(w) !== String(right));
        const a = student.answer({ concept: skill.concept, difficulty: skill.difficulty(x), applies: wrongs.map(([id]) => id) });
        const value = a.kind === 'correct' ? right : a.kind === 'bug' ? wrongs.find(([id]) => id === a.bugId)[1] : wrongValue(right) ?? right;
        return { right, value, kind: a.kind, bugId: a.bugId, confidence: a.confidence }; });
      const value = parts.map(x => x.value).join(', '), isRight = parts.every(x => String(x.value) === String(x.right)), bug = parts.find(x => x.kind === 'bug');
      const kind = isRight ? 'correct' : bug ? 'bug' : 'slip';
      last = { skill: skill.id, params, right: parts.map(x => x.right).join(', '), value, kind, isRight, bugId: bug?.bugId ?? null };
      student.feel(isRight ? 'success' : 'fail');
      return content('answer', { value, confidence: Math.min(...parts.map(x => x.confidence ?? 0.5)), belief: bug ? lib.bugs.find(b => b.id === bug.bugId).belief : null, isRight, kind, skill: skill.id, params });
    }
    if (Array.isArray(params) && params.length === 1) params = params[0];
    if (skill && params && skill.valid(params)) {
      if (student.seeksHelp()) return content('help');
      const right = skill.solve(params), wrongs = Object.entries(skill.bugs).map(([id, f]) => [id, f(params)]).filter(([id, w]) => student.state.bugs[id] && w !== null && String(w) !== String(right));
      const a = student.answer({ concept: skill.concept, difficulty: skill.difficulty(params), applies: wrongs.map(([id]) => id) });
      // A slip or a guess is always a different value from the right one; when none exists (a conceptual item), it is "I don't know".
      let value = a.kind === 'correct' ? right : a.kind === 'bug' ? wrongs.find(([id]) => id === a.bugId)[1] : a.kind === 'slip' || a.kind === 'guess' ? wrongValue(right) : null;
      const kind = (a.kind === 'slip' || a.kind === 'guess') && value === null ? 'idk' : a.kind;
      last = { skill: skill.id, params, right, value, kind, isRight: kind === 'correct', bugId: a.bugId };
      student.feel(kind === 'correct' ? 'success' : 'fail');
      return content(kind === 'idk' ? 'idk' : 'answer', { value, confidence: a.confidence, belief: a.bugId ? lib.bugs.find(b => b.id === a.bugId).belief : null, isRight: kind === 'correct', kind, skill: skill.id, params });
    }
    // A question no skill in the library covers: whether the answer is right is still decided in code (θ and the
    // concept's active beliefs); the light setting writes that answer and a check confirms it is right (or wrong) as decided.
    if (student.seeksHelp()) return content('help');
    const beliefs = Object.keys(student.state.bugs).filter(id => student.state.bugs[id].status !== 'repaired' && lib.bugs.find(b => b.id === id)?.concept === concept);
    const a = student.answer({ concept, difficulty: 0, applies: beliefs });
    last = { open: true, concept, kind: a.kind, isRight: a.kind === 'correct', bugId: a.bugId };
    student.feel(a.kind === 'correct' ? 'success' : 'fail');
    return a.kind === 'idk' ? content('idk') : content('attempt', { correct: a.kind === 'correct', belief: a.bugId ? lib.bugs.find(b => b.id === a.bugId).belief : null, confidence: a.confidence, isRight: a.kind === 'correct', kind: a.kind });
  }
  if (type === 'explain') return explainContent(concept, p.asks.skill ?? null);
  if (type === 'confidence') return content('confidence', { value: student.confidence(concept) });
  // A check of their own idea ("So you're saying …?", perception v7; either arm, the same rule): a faithful restatement
  // of a belief they hold is confirmed, hedged at the persona's rate (its confidence in a belief, 0.75 + bias + noise,
  // below 0.5); one they don't hold (repaired, or never theirs) gets unsure or no; a distorted one gets "no, I mean…".
  // cfg.hedgeChecks (a smoke's forced case): always unsure.
  if (type === 'restate') {
    const r = p.restates ?? { bugId: null, faithful: true }, b = r.bugId && student.state.bugs[r.bugId], said = [...log].reverse().find(l => !l.dropped && ['answer', 'explain', 'attempt'].includes(l.content?.act))?.line;
    if (cfg.hedgeChecks) return content('unsure', { revoice: 'hedged' });
    if (!r.faithful && said) return content('correct_me', { value: said, revoice: 'corrected' });
    if (b && b.status !== 'repaired') return Math.max(0, Math.min(1, 0.75 + (student.persona.traits.bias ?? 0) + 0.1 * student.rng.normal())) < 0.5 ? content('unsure', { revoice: 'hedged' }) : content('confirm', { revoice: 'confirmed' });
    return student.rng.next() < 0.5 ? content('deny', { revoice: 'denied' }) : content('unsure', { revoice: 'hedged' });
  }
  if (type === 'check' || p.genericCheck) return content(!cfg.hedgeChecks && student.saysGotIt() ? 'got_it' : 'unsure');
  if (type === 'choice') return content('choice', { value: student.state.concepts[concept].theta > 1 ? 'something harder' : student.persona.traits.help > 0.4 ? 'just show me' : 'one more like that' });
  // Nothing asked: the persona speaks for itself.
  if (student.state.frustration > 1) return content('frustrated');
  if (student.seeksHelp()) return content('help');
  if (student.persona.traits.statedPref && student.state.turn <= 2) return content('preference', { value: student.persona.traits.statedPref });
  if (student.state.concepts[concept]?.theta > 1.2) return content('bored');
  return content('ack');
}
function explainContent(concept, skillId = null) {
  // "Walk me through it" after an answer is about THAT answer: the belief that produced it, or the right reasoning when it
  // was right; with no answer just given, any active belief of the concept may surface (core.mjs explain).
  const recent = last?.skill && !last.explained ? last : null;
  // With no answer just given: an explanation about a question one skill covers draws on a belief that skill's rules carry
  // (the belief this student would bring to it), else the concept's (core.mjs explain).
  // (A belief fires by its status, as everywhere: active 0.9, pending after a targeted refutation 0.35; core.mjs explain.)
  const about = !recent && skillId ? lib.skills.find(k => k.id === skillId) : null;
  // A guess has no reasoning behind it ("I'm not sure"); a slip had the right method.
  const e = recent?.kind === 'bug' && recent.bugId && student.state.bugs[recent.bugId]?.status !== 'repaired' ? { kind: 'belief', bugId: recent.bugId } : recent?.isRight || recent?.kind === 'slip' ? { kind: 'mechanism' } : recent?.kind === 'guess' || recent?.kind === 'idk' ? { kind: 'unsure' } : student.explain(about?.concept ?? concept), c = lib.concepts.find(x => x.id === concept);
  if (recent) recent.explained = true;
  // sim_student_v3: "I don't know why" (unsure) keeps the answer before it as the one a verdict refers to.
  if (e.kind !== 'unsure') last = { concept, kind: e.kind, isRight: e.kind === 'mechanism', bugId: e.bugId ?? null };
  return e.kind === 'mechanism' ? content('explain', { value: c.idea, confidence: 0.7 }) : e.kind === 'belief' ? content('explain', { value: lib.bugs.find(b => b.id === e.bugId).belief, belief: e.bugId, confidence: 0.75 }) : content('unsure_why');
}
/** A wrong value next to the right one: a number off by one or with its sign flipped, a hex digit or a bit changed, yes/no
 *  swapped; null for an answer with no near miss (a conceptual one). Never the right value. */
function wrongValue(v) {
  if (typeof v === 'number') return v !== 0 && student.rng.next() < 0.5 ? -v : v + (student.rng.next() < 0.5 ? 1 : -1);
  const s = String(v);
  if (/^0x[0-9a-f]+$/i.test(s)) { const d = parseInt(s.at(-1), 16); return s.slice(0, -1) + ((d + 1) % 16).toString(16); }
  if (/^[01]+$/.test(s)) { const i = student.rng.int(0, s.length - 1); return s.slice(0, i) + (s[i] === '0' ? '1' : '0') + s.slice(i + 1); }
  if (s === 'yes' || s === 'no') return s === 'yes' ? 'no' : 'yes';
  return null;
}
const TEMPLATE = { confirm: "yes, that's what i mean", deny: "no, i don't think that's it", check_back: 'is that right?', hold: 'give me a second, working on it', help: 'can you give me a hint? or just show me', idk: "i don't know", unsure_why: "honestly i don't know why, i just did it", got_it: 'yeah ok i get it', unsure: 'kind of? not totally sure', frustrated: "ugh i'm lost", bored: 'yeah i know this, can we do something harder', ack: 'ok', read: 'ok, read it' };
const template = c => c.act === 'correct_me' ? `no, i mean ${String(c.value ?? '').replace(/^(i think|i'm pretty sure)\s+/i, '')}` : c.act === 'answer' ? `i think it's ${c.value}` : c.act === 'explain' ? `i think ${c.value}` : c.act === 'attempt' ? "i'm not sure" : c.act === 'confidence' ? `${c.value} out of 5` : c.act === 'choice' ? c.value : c.act === 'preference' ? c.value : TEMPLATE[c.act] ?? 'ok';

/** The student's line for decided content: the light setting phrases it, and the phrasing must keep the content. */
async function phrase(c, dialogue) {
  if (['hold', 'ack', 'check_back', 'confirm', 'deny'].includes(c.act)) return { line: template(c), kept: true, by: 'template' };
  const desc = c.act === 'answer' ? `gives the answer ${JSON.stringify(c.value)}${c.belief ? ` (because they believe ${c.belief})` : ''}` : c.act === 'explain' ? `explains it as: ${c.value}` :
    c.act === 'attempt' ? (c.correct ? 'answers the tutor\'s question correctly (work out the right answer; state it plainly)' : c.belief ? `answers the tutor's question wrongly, the way someone who believes that ${c.belief} would` : 'answers the tutor\'s question wrongly, with one plausible mistake') : c.act === 'confidence' ? `says they are ${c.value} out of 5 sure` : c.act === 'idk' ? 'says they don\'t know' : c.act === 'correct_me' ? `says no, that is not what they meant, and says again what they did mean: ${c.value}` : c.act === 'read' ? `says they read it${c.value ? `, and ${c.value}` : ''}` : `says something like "${template(c)}"`;
  try {
    const { line } = await ask({ role: 'light', instructions: PHRASE, schema: S.obj({ line: S.str }), timeoutMs: 60_000,
      input: { persona: `${student.persona.name}${cfg.voice ? `; ${cfg.voice}` : ''}`, content: desc, confidence: c.confidence ?? null, cues: c.cues ?? { filler: false, trailing: false }, lastTutorTurn: clip(dialogue.split('\n\n').at(-1), 600) } });
    const text = String(line || '').split('\n').map(x => x.trim()).filter(Boolean).join(' ').slice(0, 400);
    // The check: a computed value must appear in the line (code); a conceptual claim is checked by the light setting.
    let kept = !!text;
    if (kept && c.act === 'answer' && typeof c.value !== 'undefined' && lib.kind !== 'beliefs') kept = statedIn(String(c.value), text) || text.toLowerCase().includes(String(c.value).toLowerCase());
    // Nothing beyond the content, for every substantive act (a phrasing that solves the tutor's other question leaks knowledge the state doesn't have).
    if (kept && ['answer', 'explain', 'read'].includes(c.act)) kept = (await ask({ role: 'light', instructions: CHECK, schema: S.obj({ kept: S.bool }), input: { content: desc, message: text } })).kept;
    else if (kept && c.act === 'attempt') kept = (await ask({ role: 'light', instructions: JUDGE_ATTEMPT, schema: S.obj({ correct: S.bool }), input: { question: clip(dialogue.split('\n\n').at(-1), 1500), answer: text } })).correct === c.correct;
    return kept ? { line: text, kept: true, by: c.act === 'attempt' ? 'open' : 'phrased' } : { line: template(c), kept: false, by: 'template' };
  } catch { return { line: template(c), kept: false, by: 'template' }; }
}

/** Perceive the newest tutor turn, update the state from it, and log it; returns the perception (or null). */
async function perceive(dialogue) {
  const blocks = dialogue.split('\n\n'), lastStudent = blocks.findLastIndex(b => b.startsWith('Student:')), newest = blocks.slice(lastStudent + 1).join('\n\n');
  if (!newest.trim()) return null;
  const active = Object.entries(student.state.bugs).filter(([, b]) => b.status !== 'repaired').map(([id]) => ({ id, belief: lib.bugs.find(b => b.id === id)?.belief }));
  const p = await ask({ role: 'heavy', effort: 'medium', instructions: PERCEIVE, schema: PERCEPTION, timeoutMs: 240_000,
    input: { course: cfg.course ?? null, concepts: lib.concepts.map(({ id, title }) => ({ id, title })), skills: lib.skills.map(({ id, concept, describe, params }) => ({ id, concept, asks: describe, params })), activeBeliefs: active, conversation: clip(dialogue, 12_000), newestTutorTurn: newest } }).catch(error => ({ error: error.message }));
  if (p.error) { log.push({ turn: student.state.turn, tutor: clip(newest, 600), error: p.error }); return null; }
  student.tick();
  // One learning event per concept per turn (its strongest move: a turn of four moves is still one turn of teaching);
  // a reading move always costs its time on text.
  const effects = [], byConcept = new Map();
  for (const m of p.moves) { const c = conceptOf(m.concept); byConcept.set(c, [...(byConcept.get(c) || []), m]); }
  for (const [concept, ms] of byConcept) {
    const top = [...ms].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];
    for (const m of ms.filter(x => x.kind === 'read')) { const r = student.read({ concept, words: m.words ?? 300, level: LEVEL[m.level] ?? 0, learn: m === top, purpose: !!m.purpose }); effects.push({ read: { ...r, concept, words: m.words, purpose: m.purpose, level: m.level } }); }
    if (top.kind !== 'read') effects.push({ learn: { concept, kind: top.kind, rep: top.rep, gain: +student.learn({ concept, kind: top.kind, rep: top.rep }).toFixed(3) } });
  }
  for (const r of p.refutes) if (r.targeted && student.refute(r.bugId)) effects.push({ refuted: r.bugId });
  // The tutor's verdict on the last answer, against the truth (O5: over-validation, over-rejection).
  const verdict = last && p.verdict !== 'none' ? { tutor: p.verdict, truth: last.isRight ? 'right' : 'wrong', overValidation: p.verdict === 'right' && !last.isRight, overRejection: p.verdict === 'wrong' && last.isRight } : null;
  return { p, newest, effects, verdict };
}

export async function next({ runtime, dialogue }) {
  setRuntime(runtime); // the stand-in's runtime: no second app-server
  const seen = await perceive(dialogue);
  // What deciding this reply changes (an answer can repair a pending belief; frustration, the last answer, the hold), kept
  // so that a reply the stand-in drops unsaid can be taken back; the perception's learning stays (the tutor did say it).
  undo = { state: structuredClone(student.state), last, holdDone, pending, checkedBack, row: log.length };
  // After "give me a second", the student comes back with the answer, whether or not the tutor said anything meanwhile.
  // An answer met with silence: a real student asks whether it was right, once (cfg.checkBack), rather than "ok" (which an actor reads as filler).
  let c = seen && !pending ? decide(seen.p) : pending ? (() => { const p = pending; pending = null; return decide(p); })()
    : cfg.checkBack && last && !checkedBack && ['answer', 'attempt', 'explain'].includes(log.at(-1)?.content?.act) ? (checkedBack = true, content('check_back')) : content('ack');
  if (seen) checkedBack = false;
  if (seen?.p.asks.type === 'read' || seen?.p.moves.some(m => m.kind === 'read')) { if (c.act === 'ack') Object.assign(c, { act: 'read', value: student.state.concepts[conceptOf(seen.p.asks.concept)]?.theta > 0.5 ? 'it made sense' : 'parts of it were confusing' }); }
  // Cues for the stage's process checks: fillers and trailing clauses when unsure (rates per config.cues, else 0.3 and 0.2).
  const unsure = (c.confidence ?? 0.6) < 0.5, cueRates = cfg.cues ?? { filler: 0.3, trailing: 0.2 };
  c.cues = { filler: unsure && student.rng.next() < cueRates.filler, trailing: unsure && student.rng.next() < cueRates.trailing };
  let said = await phrase(c, dialogue);
  // An open attempt that couldn't be written as decided falls back to "i'm not sure": nothing was answered, so what deciding
  // it changed (a correct attempt repairs a pending belief) is taken back, and the reply is what it was, "don't know".
  if (!said.kept && c.act === 'attempt' && undo) { Object.assign(student.state, structuredClone(undo.state)); ({ last, holdDone, pending, checkedBack } = undo); c = content('idk', { cues: c.cues }); said = { line: said.line, kept: true, by: 'template' }; }
  log.push({ turn: student.state.turn, tutor: clip(seen?.newest ?? '', 600), perception: seen?.p ?? null, effects: seen?.effects ?? [], verdict: seen?.verdict ?? null, content: c, line: said.line, kept: said.kept, by: said.by,
    state: { theta: Object.fromEntries(Object.entries(student.state.concepts).map(([id, x]) => [id, +x.theta.toFixed(3)])), bugs: Object.fromEntries(Object.entries(student.state.bugs).map(([id, b]) => [id, b.status])), frustration: +student.state.frustration.toFixed(2) } });
  // Silent work: thinking before typing, longer when unsure (the stand-in then types the line at its own speed).
  const silentWorkMs = c.act === 'answer' || c.act === 'explain' ? Math.round(1000 + 4000 * (1 - (c.confidence ?? 0.5))) : 0;
  const meta = { act: c.act, confidence: c.confidence ?? null, hedge: /\b(i think|maybe|not sure|probably|i guess)\b/i.test(said.line), filler: /^(um+|uh+|so|hmm+)\b/i.test(said.line), trailing: /(or something|i think, but|…|\.\.\.)\s*$/i.test(said.line), silentWorkMs };
  log.at(-1).meta = meta;
  await save();
  if (silentWorkMs) await new Promise(r => setTimeout(r, silentWorkMs));
  return { line: said.line, meta };
}

/** The stand-in dropped the newest reply unsaid (a late card came while the student was typing): its decision never happened. */
export function dropped() {
  if (!undo) return;
  Object.assign(student.state, structuredClone(undo.state));
  ({ last, holdDone, pending, checkedBack } = undo);
  if (log[undo.row]) log[undo.row].dropped = true;
  undo = null;
}

/** At the end: the tutor's last turn is perceived too (it may still teach), then the final state is written. */
export async function finish({ runtime, dialogue } = {}) {
  if (runtime) setRuntime(runtime);
  if (dialogue) { const seen = await perceive(dialogue).catch(() => null); if (seen) log.push({ turn: student.state.turn, tutor: clip(seen.newest, 600), perception: seen.p, effects: seen.effects, verdict: seen.verdict, final: true }); }
  await save({ final: true });
}
