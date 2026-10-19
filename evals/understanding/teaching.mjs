// Teaching probes (docs/system-spec.md §7 stage 11 and §17; the lead's ruling of 2026-10-08): knowing the subject is not
// the course model's value (the notes alone reach 98% on knowledge probes), teaching is. The course model must beat the
// materials by ≥ 10 points here, answered under the SAME token budget the director has in real time. Generated in code
// from the fixture's independent belief library, so the ground truth comes from the executable detectors where they
// exist (the wrong answer a planted rule produces, which question separates the hypotheses), else from a rubric:
//   T1 diagnose a given wrong answer: name the wrong model and its error kind (F1–F12);
//   T2 predict the answer a named misconception gives on a new item;
//   T3 choose the separating question among candidates;
//   T4 design a repair matching the error kind;
//   T5 choose the reading or element (and its task mode) for a stated learner state.
// (T6, the materials' conflicts, joins when a fixture's audit has verified errata.)
import { rng } from './sim/core.mjs';

export const TEACHING_VERSION = 'teaching_v2';
export const BUDGET_CHARS = 20_000; // the director's real-time context for one topic, the same bound the Study's own ablation uses
// The repair family per error kind (docs/research/domain-generality.md §6.3).
export const REPAIR = {
  F1: 'locate the slip and let the learner fix it', F2: 'vary the surface; discrimination practice; interleave', F3: 'model the strategy and prompt for monitoring ("what are you doing? why?")',
  F4: 'a detour to the missing piece, a first-step check, then return', F5: 'refutation: name the belief, show where it fails, give the correct one, have them use it',
  F6: 'contrast the buggy step with the correct one on a case, then a worked example of that step', F7: 'run the learner\'s model to a checkable contradiction, build the replacement, compare',
  F8: 'teach the right frame (e.g. emergent process, not a directed force), then re-apply it to this case and two more', F9: 'a counter-case, multiple analogies, criss-crossed cases',
  F10: '"show me where it says that"; re-read with a focus', F11: "make the discipline's standard of evidence explicit; ask for the source's author and purpose, or for the counterargument", F12: 'a generative check, and the calibration record',
};
const STATES = [
  { id: 'first_contact', state: 'meets this idea for the first time; has the prerequisites; the course notes have a clear passage on it', reference: 'a short reading of that passage with a purpose (a question to hold or a thing to look for), or a prediction on the KC\'s runnable element before any telling; then a check that the learner produced', keyPoints: ['a reading with a stated purpose, or a predict task', 'the learner produces something after it'] },
  { id: 'compute_not_why', state: 'can compute answers by following the procedure but cannot explain why it works', reference: 'an explain or predict task on the element that makes the mechanism visible (change one thing and predict), not another computation, not a lecture', keyPoints: ['predict or explain mode on an element showing the mechanism', 'not another routine computation'] },
  { id: 'frustrated', state: 'is frustrated after two failed attempts and says "just explain it"', reference: 'a short explanation or worked example with the element shown (show, not a reading assignment or another question), then one small step for the learner', keyPoints: ['explain or show now, no reading assignment', 'then one small step handed back'] },
  { id: 'asks_to_see', state: 'asks to see what is going on, because they cannot picture it', reference: "the KC's visual element, with what to notice pointed out, then a question answered from the picture (predict or explain mode)", keyPoints: ['a visual element with what to notice', 'a question answered from the picture'] },
];
const describe = (skill, params) => Object.keys(params).length ? `${skill.describe}, for ${JSON.stringify(params)}` : skill.describe;

/** The fixture's teaching probes, from its library (deterministic for a seed). */
export function buildTeaching(lib, { seed = 7, perConcept = 2 } = {}) {
  const r = rng(seed), probes = [], items = [...(lib.practice || []), ...(lib.tests || [])];
  const skillOf = x => lib.skills.find(k => k.id === x.skill);
  const answersOf = x => { const k = skillOf(x); return { right: k.solve(x.params), wrong: Object.fromEntries(Object.entries(k.bugs).map(([id, f]) => [id, f(x.params)]).filter(([, w]) => w !== null)) }; };
  for (const c of lib.concepts) {
    const bugs = lib.bugs.filter(b => b.concept === c.id), mine = items.filter(x => skillOf(x)?.concept === c.id);
    const firing = b => mine.filter(x => { const a = answersOf(x); return a.wrong[b.id] !== undefined && String(a.wrong[b.id]) !== String(a.right); });
    // T1 shows a wrong answer that carries the belief's signature: not a bare yes/no, and no other belief gives the same answer.
    const telling = (b, x) => { const a = answersOf(x), w = String(a.wrong[b.id]); return !/^(yes|no|true|false)$/i.test(w.trim()) && !Object.entries(a.wrong).some(([id, v]) => id !== b.id && String(v) === w); };
    for (const b of bugs.slice(0, perConcept)) {
      const fx = firing(b), shown = fx.find(x => telling(b, x));
      if (shown) { const x = shown, a = answersOf(x); probes.push({ id: `T1-${b.id}`, kind: 'T1', concept: c.id, prompt: `A student was asked: ${describe(skillOf(x), x.params)}. They answered: ${a.wrong[b.id]}. Name the wrong mental model behind this answer and its error kind (one of F1–F12), and say what in the answer gives it away.`, answer: `${b.belief} (error kind ${b.errorKind})`, keyPoints: [`the belief: ${b.belief}`, `error kind ${b.errorKind}`], errorKind: b.errorKind, checked: 'detector' }); }
      const other = fx.find(x => x !== shown) ?? fx[0];
      if (other) { const x = other, a = answersOf(x); probes.push({ id: `T2-${b.id}`, kind: 'T2', concept: c.id, prompt: `A student holds this belief: "${b.belief}". Asked: ${describe(skillOf(x), x.params)}, what answer will they give? Give the answer on the first line, then one line on why.`, answer: String(a.wrong[b.id]), keyPoints: [`the answer ${a.wrong[b.id]}`], value: a.wrong[b.id], checked: lib.kind === 'beliefs' ? 'rubric' : 'run' }); }
      probes.push({ id: `T4-${b.id}`, kind: 'T4', concept: c.id, prompt: `A student shows this wrong model: "${b.belief}". Design the tutor's next move to repair it: what the tutor puts on the page or asks, and why that works for this kind of error.`, answer: `An ${b.errorKind} repair: ${REPAIR[b.errorKind]}. It makes this belief fail on a case where it gives a visibly wrong result, then gives the work back to the student.`, keyPoints: [`the ${b.errorKind} repair family: ${REPAIR[b.errorKind]}`, 'the belief is made to fail on a case', 'the student does the next step'], checked: 'rubric' });
    }
    // T3: two hypotheses (or one and "understands it"), three candidate questions. How well a question separates them is
    // computed: the number of distinct answers the hypotheses and the correct model give to it. One candidate separates
    // strictly best; the other two separate less (the answers the library's detectors give decide, not a judge).
    for (const hyp of [bugs.slice(0, 2), bugs.slice(2, 4)].filter(h => h.length)) {
      const distinct = x => { const a = answersOf(x); return new Set([String(a.right), ...hyp.map(h => String(a.wrong[h.id] ?? a.right))]).size; };
      const scored = mine.map(x => ({ x, d: distinct(x) })), best = Math.max(0, ...scored.map(y => y.d));
      const top = scored.filter(y => y.d === best), weaker = scored.filter(y => y.d < best);
      if (best < 2 || weaker.length < 2) continue;
      const pickOne = xs => xs[Math.floor(r.next() * xs.length)], w1 = pickOne(weaker), w2 = pickOne(weaker.filter(y => y !== w1));
      const candidates = [pickOne(top), w1, w2].sort(() => r.next() - 0.5), letter = 'ABC'[candidates.findIndex(y => y.d === best)];
      probes.push({ id: `T3-${c.id}-${hyp.map(h => h.id).join('-')}`, kind: 'T3', concept: c.id, prompt: `A student's answers so far fit several explanations: ${hyp.map((h, i) => `(${i + 1}) they believe ${h.belief}`).join('; ')}; (${hyp.length + 1}) they understand it correctly. Which ONE of these questions best tells these apart? ${candidates.map((y, i) => `${'ABC'[i]}) ${describe(skillOf(y.x), y.x.params)}`).join(' ')} Answer with the letter on the first line, then why.`, answer: letter, keyPoints: [`question ${letter}`], letter, checked: 'detector' });
    }
    // T5: two learner states per concept, rotating so every state appears across the course.
    const k = lib.concepts.indexOf(c);
    for (const st of [STATES[(2 * k) % STATES.length], STATES[(2 * k + 1) % STATES.length]]) probes.push({ id: `T5-${c.id}-${st.id}`, kind: 'T5', concept: c.id, prompt: `A learner working on "${c.title}" ${st.state}. Choose the tutor's next move: a reading (and what to look for in it) or an element (which kind) with its task mode (predict, change, construct, compare, explain, teach, draw), and say why.`, answer: st.reference, keyPoints: st.keyPoints, checked: 'rubric' });
  }
  return probes;
}

/** Code grading where the ground truth is computed (T2 values, T3 letters, T1's error kind); null where the judge grades. */
export function gradeInCode(p, answer, { sameValue, statedIn }) {
  const first = String(answer ?? '').split('\n').map(s => s.trim()).find(Boolean) ?? '';
  if (p.kind === 'T3' || p.kind === 'TC1') return first.toUpperCase().replace(/[^A-D]/g, '').startsWith(p.letter) ? 1 : 0;
  if (p.kind === 'TC2' && p.checked === 'run' && /\d/.test(String(p.value))) return sameValue(first, String(p.value)) || statedIn(String(p.value), first) ? 1 : 0;
  // Code grades a computed value (one with a digit); a word answer ("none", "a line") goes to the judge, which knows synonyms.
  if (p.kind === 'T2' && p.checked === 'run' && /\d/.test(String(p.value))) return sameValue(first, String(p.value)) || statedIn(String(p.value), first) ? 1 : 0;
  return null;
}
// The error kinds' groups (domain-generality §6.3): the group sets the broad repair, the kind the exact one.
const GROUP = k => { const n = Number(String(k).slice(1)); return n <= 3 ? 'performance' : n <= 8 ? 'content' : n <= 11 ? 'reasoning' : 'self'; };
/** T1's error kind, read from the answer: the share of the score the judge doesn't give. */
/** T1's error kind, the FIRST one named (listing several earns nothing): 1 for the kind, 0.5 for its group, else 0. */
export const errorKindNamed = (p, answer) => { if (p.kind !== 'T1') return null; const k = (String(answer).match(/\bF\d{1,2}\b/) || [])[0]; return !k ? 0 : k === p.errorKind ? 1 : GROUP(k) === GROUP(p.errorKind) ? 0.5 : 0; };

// ---------- course-specific teaching probes (the lead's gate (c), 2026-10-08) ----------
// Frontier models know catalogued misconceptions unaided, so the course model must show teaching knowledge only this
// course's materials hold: the wrong models the frozen probe sets mined from the notes' own warnings and worked examples
// (provenance 'course'; the wrong answer each produces checked by running code where computable). Per wrong model:
//   TC1 diagnose: the student's answer to the course's question, four candidate beliefs (the true one, the topic's other
//       wrong models, and a slip); the letter is known by construction;
//   TC2 predict: the belief named, the answer it gives to the course's question (code-graded when it was run).
export const COURSE_TEACHING_VERSION = 'teaching_course_v1';
export function buildCourseTeaching(files, { seed = 11 } = {}) {
  const r = rng(seed), probes = [];
  for (const f of files) {
    const wms = (f.wrongModels || []).filter(w => w.produces?.question && w.produces?.wrongAnswer && w.verified !== 'mismatch');
    for (const w of wms.filter(x => x.provenance === 'course')) {
      const others = wms.filter(x => x !== w).map(x => x.belief).sort(() => r.next() - 0.5).slice(0, 2);
      if (others.length < 2) continue;
      const options = [{ text: w.belief, right: true }, ...others.map(text => ({ text, right: false })), { text: 'They have the right idea and made a careless slip.', right: false }].sort(() => r.next() - 0.5);
      const letter = 'ABCD'[options.findIndex(o => o.right)], ran = w.verified === 'run';
      probes.push({ id: `TC1-${f.topicId}-${w.id}`, kind: 'TC1', topicId: f.topicId, prompt: `In this course, a student was asked: ${w.produces.question}\nThey answered: ${w.produces.wrongAnswer}\nWhich explains their answer best? ${options.map((o, i) => `${'ABCD'[i]}) ${o.text}`).join(' ')} Answer with the letter on the first line, then why.`, answer: letter, letter, keyPoints: [`option ${letter}`], checked: ran ? 'run' : 'model' });
      probes.push({ id: `TC2-${f.topicId}-${w.id}`, kind: 'TC2', topicId: f.topicId, prompt: `In this course, a student believes: "${w.belief}"\nThey are asked: ${w.produces.question}\nWhat do they answer? The answer on the first line, then one line on why.`, answer: String(w.produces.wrongAnswer), value: w.produces.wrongAnswer, keyPoints: [`the answer ${w.produces.wrongAnswer}`], checked: ran ? 'run' : 'model' });
    }
  }
  return probes;
}
