import { s } from '../core/shape.mjs';
import { AppError } from '../core/errors.mjs';
import { call, unwrap } from '../providers/contracts.mjs';
import { DIAGRAM_TYPES } from '../../src/visuals/diagram.mjs';
import { checkBoard, fromDraft } from '../../shared/boards.mjs';
import { STUDY_VERSIONS } from '../providers/prompts/understanding.mjs';
import { ADAPTERS, ADAPTER_IDS, CORE_FAMILIES, ERROR_KINDS, FAMILIES, KC_KINDS, MODEL_FORMS, REGIMES } from './adapters.mjs';
import { VERIFIER_IDS, chainFor, runCheck, runFamilies, render, sameAnswer, selfTestItem } from './verify.mjs';
import { words } from '../core/match.mjs';

// How one topic's slice of the course model is made (docs/system-spec.md §7), backward design: desired results →
// evidence (task families and probes per performance family, each with its regime, its adapter and its checker, every
// checker executed) → wrong models (each with an error kind and a detector: executable rules run on every instance,
// patterns over a probe battery, violated constraints, or rubric signatures checked by role-play and diagnosis) →
// procedures (three drafts merged into a step DAG, then a literal executor on fresh instances, one revision) beside
// runnable models, cases, representations and the audit of the materials → explanations and readings last → the gate
// (skeptical review, one repair) → grounding → the ablation. Each stage is a provider call (app.providers.studyWriter)
// returning a structured record; code checks between. Nothing here branches on subject: adapters.mjs holds that.

const str = (max, min = 1) => s.string({ min, max });
// Caps are generous (the output schema cannot tell the model a count), so a long but valid answer is never thrown away.
const list = (item, max = 24, min = 0) => s.array(item, { min, max: Math.max(4 * max, 60) });
const IDS = list(str(80), 40);
const ENUM = o => s.enum(Object.keys(o));
const CHECK = s.object({ by: s.enum(VERIFIER_IDS), code: s.string({ max: 12_000 }), expect: s.string({ max: 2000 }), compare: s.enum(['exact', 'numeric']), tolerance: s.nullable(s.number()) });
const BOARD = s.object({ kind: s.enum(['markdown', 'diagram']), title: str(80), content: s.nullable(s.string({ max: 3000 })), diagramType: s.nullable(s.enum([...DIAGRAM_TYPES, 'formula'])), diagramData: s.nullable(s.string({ max: 6000 })) });
export const MOVE_KINDS = ['probe', 'elicit', 'present', 'repair', 'practice', 'read'];
const LEVELS = ['core', 'exam', 'beyond'];
const STEP = s.object({ id: str(12), action: str(600), decision: s.nullable(str(500)), cue: s.nullable(str(500)), standard: str(500), why: str(600), after: IDS });
const PROCEDURES = s.object({ procedures: list(s.object({ id: str(12), kc: str(12), title: str(160), familyId: s.nullable(str(12)), subgoals: list(s.object({ label: str(160), steps: list(STEP, 16, 1) }), 12, 1) }), 10) });
const MOVE = s.object({
  kind: s.enum(MOVE_KINDS), kc: str(12), why: str(600), problemId: s.nullable(str(40)), ask: s.nullable(str(900)), representationId: s.nullable(str(12)), readingId: s.nullable(str(12)), caseId: s.nullable(str(12)),
  read: s.nullable(s.object({ ref: str(12), lookFor: str(600) })), expect: list(s.object({ when: str(300), wrongModelId: s.nullable(str(12)), reply: str(500) }), 8),
});
const QUOTE = s.object({ quote: str(600), ref: str(12) });
const ANSWERS = s.object({ answers: list(s.object({ id: str(40), answer: str(1500) }), 40) });
const CONSTRAINT = s.object({ id: str(12), text: str(400), test: s.nullable(str(3000)) });

export const STUDY_SHAPES = {
  spine: s.object({
    adapters: list(s.enum(ADAPTER_IDS), 3, 1), adapterWhy: str(500),
    sources: list(s.object({ id: str(80), role: s.enum(['notes', 'slides', 'textbook', 'assignment', 'exam', 'solutions', 'reference', 'document', 'case']) }), 80),
    spine: list(s.object({ id: str(12), understanding: str(600), why: str(700), threshold: s.bool(), troublesome: str(600), evidence: IDS, topics: IDS }), 10, 1),
    models: list(s.object({ id: str(12), form: s.enum(MODEL_FORMS), name: str(160), state: list(str(300), 16), rules: list(str(400), 16), usedBy: IDS }), 8),
    methods: list(s.object({ id: str(12), name: str(160), subgoals: list(str(300), 12), when: str(400), evidence: IDS }), 8),
    conventions: list(s.object({ id: str(12), rule: str(400), arbitrary: s.bool(), why: str(500) }), 12),
    links: list(s.object({ from: str(80), to: str(80), relation: s.enum(['prerequisite', 'uses', 'refines', 'contrasts_with', 'same_idea_elsewhere']), why: str(500), evidence: IDS }), 20),
    assessment: s.object({ forms: list(str(200), 12), targets: list(s.object({ topicId: str(80), family: ENUM(FAMILIES), level: s.enum(['recall', 'apply', 'transfer']) }), 60), confidence: s.enum(['low', 'medium', 'high']), why: str(500) }),
  }),
  results: s.object({
    matters: s.object({ why: str(800), examUse: str(600) }), interactivity: s.enum(['low', 'mid', 'high']), spine: IDS,
    kcs: list(s.object({ id: str(12), kind: s.enum(KC_KINDS), statement: str(600), prerequisites: IDS, conceptIds: IDS, refs: IDS }), 12, 1),
    enduring: list(str(600), 4, 1), essentialQuestions: list(s.object({ question: str(400), expectations: list(str(300), 6) }), 6),
    threshold: s.object({ is: s.bool(), troublesome: list(s.enum(['alien', 'tacit', 'ritual', 'inert', 'conceptually_difficult', 'language']), 6), liminalSigns: list(str(400), 6) }),
    inventory: s.object({ notation: list(str(200), 20), emphasis: list(QUOTE, 12), warnings: list(QUOTE, 12), exercises: IDS, workedExamples: IDS }),
  }),
  evidence: s.object({
    families: list(s.object({ id: str(12), kc: str(12), adapter: s.enum(ADAPTER_IDS), regime: s.enum(['R1', 'R2']), title: str(200), prompt: str(1500), generate: str(6000), solve: str(6000) }), 8),
    probes: list(s.object({
      id: str(12), kc: str(12), adapter: s.enum(ADAPTER_IDS), family: ENUM(FAMILIES), regime: ENUM(REGIMES), form: str(120), level: s.enum(LEVELS), familyId: s.nullable(str(12)),
      prompt: s.string({ max: 2500 }), answer: s.string({ max: 1500 }), rubric: list(str(300), 6), constraints: list(CONSTRAINT, 6), check: s.nullable(CHECK),
      element: s.nullable(s.object({ kind: str(40), spec: s.nullable(str(8000)) })),
      key: s.nullable(s.object({ value: str(400), form: s.enum(['number', 'numbers', 'bits', 'text', 'choice', 'expression']), equivalents: list(str(200), 6) })),
    }), 20, 1),
    taskLadder: IDS,
  }),
  wrongs: s.object({ wrongModels: list(s.object({
    id: str(12), kc: str(12), belief: str(800), errorKind: ENUM(ERROR_KINDS), plausibleBecause: str(700),
    source: s.enum(['catalogued', 'course_warning', 'inferred']), citation: s.nullable(str(300)), prior: s.number({ min: 0, max: 1 }),
    detector: s.object({
      type: s.enum(['execute', 'pattern', 'constraint', 'rubric']),
      rules: list(s.object({ familyId: str(12), code: str(6000) }), 8), battery: IDS, fingerprint: list(str(600), 8), violates: IDS,
      description: s.string({ max: 2000 }), positives: list(str(800), 4), negatives: list(str(800), 4), // empty for a detector that is not a rubric
    }),
    markers: list(str(120), 8), probe: s.nullable(s.object({ prompt: str(1500), answer: str(600), correct: str(600) })), repair: str(1600), recheck: IDS,
  }), 10, 1) }),
  procedure: PROCEDURES, merge: PROCEDURES, revise: PROCEDURES,
  execute: s.object({ results: list(s.object({ id: str(40), steps: list(s.string({ max: 2000 }), 30), answer: s.string({ max: 3000 }), stuck: list(s.object({ step: str(300), missing: str(500) }), 10) }), 60) }), // an executor stuck before the end may give no answer
  model: s.object({
    models: list(s.object({ id: str(12), form: s.enum(MODEL_FORMS), name: str(160), kcs: IDS, state: list(str(300), 12), rules: list(str(500), 16), abstractsAway: list(str(300), 8), board: BOARD, notice: list(str(400), 6), courseModelId: s.nullable(str(12)) }), 4, 1),
    cases: list(s.object({ id: str(12), kind: str(60), title: str(200), text: s.nullable(str(1500)), refs: IDS, kcs: IDS, links: list(s.object({ to: str(12), relation: s.enum(['analogous', 'distinguishable', 'contrasting']), why: str(400) }), 6) }), 8),
    representations: list(s.object({ id: str(12), kind: str(60), kcs: IDS, board: s.nullable(BOARD), element: s.nullable(s.object({ kind: str(40), spec: str(8000) })), notice: list(str(400), 6), activeTask: str(600), bestFor: s.enum(['first', 'repair', 'transfer']), fadesTo: s.nullable(str(300)), misleadsWhen: str(500), translations: IDS, reveals: IDS }), 8),
    audit: list(s.object({ where: str(12), materialsSay: str(800), check: s.nullable(CHECK), verdict: s.nullable(str(800)) }), 20),
    simplifications: list(s.object({ where: str(12), simplification: str(600), fullStory: str(800), mattersWhen: str(500) }), 10),
  }),
  explain: s.object({
    explanations: list(s.object({ kc: str(12), plain: str(700), precise: str(1200), mechanism: str(2000), analogies: list(s.object({ mapping: str(800), breaksWhere: str(500) }), 3),
      workedExamples: list(s.object({ problemId: str(40), steps: list(s.object({ subgoal: str(160), step: str(600), why: str(500) }), 16, 1), answer: str(600), faded: list(str(600), 12) }), 3) }), 12, 1),
    readings: list(s.object({ id: str(12), kcs: IDS, source: s.enum(['materials', 'explainer']), refs: IDS, text: s.nullable(str(5000)), level: s.enum(['intro', 'core', 'advanced']), purpose: str(500), lookFor: str(600), prequestions: list(str(400), 2, 1), refutes: s.nullable(str(12)), after: s.enum(['consolidate', 'explain_back', 'predict', 'none']) }), 10),
    gapsInNotes: list(s.object({ where: str(12), missing: str(700), fill: str(900) }), 10),
    links: list(s.object({ to: str(80), relation: str(40), why: str(500), evidence: IDS }), 12),
    route: s.object({ novice: list(MOVE, 12, 1), prior: list(MOVE, 12, 1), fluent: list(MOVE, 8, 1), wrongModels: list(s.object({ wrongModelId: str(12), moves: list(MOVE, 6, 1) }), 10), representationFails: list(s.object({ representationId: str(12), moves: list(MOVE, 4, 1) }), 6) }),
  }),
  review: s.object({ unanswerable: list(s.object({ question: str(500), why: str(500) }), 6), stall: list(s.object({ where: str(80), step: str(400), why: str(500) }), 6) }),
  ground: s.object({ findings: list(s.object({ path: str(120), kind: s.enum(['error', 'correction']), ref: s.nullable(str(12)), materialsSay: s.nullable(str(800)), problem: str(700), fix: s.nullable(str(5000)) }), 60) }),
  probe: s.object({ probes: list(s.object({ id: str(12), kind: s.enum(['knowledge', 'teaching']), teachingType: s.nullable(s.enum(['diagnose', 'predict_misconception', 'separating_question', 'repair', 'choose_material', 'find_conflict'])), question: str(1500), answer: str(900), rubric: list(str(300), 6) }), 14, 1) }),
  answer: ANSWERS, blind: ANSWERS, roleplay: ANSWERS,
  grade: s.object({ grades: list(s.object({ id: str(60), verdict: s.enum(['correct', 'partial', 'wrong']), invented: s.bool(), why: str(400) }), 80) }),
  agree: s.object({ items: list(s.object({ id: str(60), agree: s.bool(), why: str(400) }), 60) }),
  classify: s.object({ items: list(s.object({ id: str(60), belief: str(24), why: str(400) }), 60) }),
  narrow: s.object({ verdicts: list(s.object({ id: str(80), verdict: s.enum(['yes', 'no']), confidence: s.number({ min: 0, max: 1 }) }), 60) }),
  panel: s.object({ verdicts: list(s.object({ id: str(80), position: str(800), verdict: s.enum(['agree', 'defensible', 'not_defensible', 'cannot_tell']), confidence: s.number({ min: 0, max: 1 }), why: str(500) }), 20) }),
  production: s.object({ items: list(s.object({
    id: str(80), language: str(60), targets: list(s.object({ target: str(600), verdict: s.enum(['met', 'missed', 'absent']), evidence: s.string({ max: 400 }) }), 16),
    errors: list(s.object({ span: str(400), kind: s.enum(['agreement', 'conjugation', 'tense_aspect', 'word_order', 'vocabulary', 'register', 'preposition_article', 'spelling', 'accent', 'other']), correction: str(400), audible: s.bool() }), 24),
    task: s.enum(['done', 'partly', 'not_done']), confidence: s.number({ min: 0, max: 1 }),
  }), 20) }),
};

// ---------- regurgitation: the share of the model's prose words inside 8-word runs copied from the materials ----------

const tokens = text => String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) || [];
// Not the model's own prose: ids, refs, code, diagram data, quotes it was asked for (inventory, readings' lookFor).
const SKIP = new Set(['id', 'kc', 'kcs', 'refs', 'ref', 'where', 'to', 'from', 'conceptIds', 'lookFor', 'check', 'code', 'generate', 'solve', 'rules', 'diagramData', 'sources', 'quality', 'versions', 'wrongModelId', 'problemId', 'representationId', 'readingId', 'caseId', 'topicId', 'familyId', 'inventory', 'quote', 'evidence', 'input', 'wrongAnswers', 'prompt', 'answer', 'expect', 'program', 'test', 'battery', 'fingerprint', 'verifierChain', 'markers']);
function prose(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => prose(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (!SKIP.has(k)) prose(v, out);
  return out;
}
/** { share, words, copied, runs }: how much of the model's own prose sits in n-word runs that also occur in the passages. */
export function regurgitation(study, passages, n = 8) {
  const grams = new Set();
  for (const p of passages) for (const b of p.blocks) { const t = tokens(b.text); for (let i = 0; i + n <= t.length; i++) grams.add(t.slice(i, i + n).join(' ')); }
  let words = 0, copied = 0;
  const runs = [];
  for (const text of prose(study)) {
    const t = tokens(text), hit = new Array(t.length).fill(false);
    for (let i = 0; i + n <= t.length; i++) if (grams.has(t.slice(i, i + n).join(' '))) { if (runs.length < 8 && !hit[i]) runs.push(t.slice(i, i + n).join(' ')); hit.fill(true, i, i + n); }
    words += t.length; copied += hit.filter(Boolean).length;
  }
  return { share: words ? Math.round(1000 * copied / words) / 1000 : 0, words, copied, runs };
}

// ---------- small helpers ----------

const norm = t => String(t ?? '').toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const pathGet = (o, path) => path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce((x, k) => x?.[k], o);
const boardOf = (b, where, issues) => { if (!b) return null; const c = checkBoard(fromDraft(b)); if (c.problem) issues.push(`${where} board: ${c.problem}`); return c.board; };
const count = (xs, f) => xs.filter(f).length;
const stepsOf = p => p.subgoals.flatMap(g => g.steps);
/** A procedure's steps form a DAG: every `after` names a step of it, and there is no cycle. */
function dagProblems(p) {
  const steps = stepsOf(p), ids = new Set(steps.map(x => x.id)), out = [];
  for (const x of steps) for (const a of x.after) if (!ids.has(a)) out.push(`${p.id} step ${x.id} comes after unknown step ${a}`);
  const state = new Map(), visit = id => { if (state.get(id) === 1) return true; if (state.get(id) === 2) return false; state.set(id, 1); const cyc = (steps.find(x => x.id === id)?.after || []).some(a => ids.has(a) && visit(a)); state.set(id, 2); return cyc; };
  if (steps.some(x => visit(x.id))) out.push(`${p.id}'s steps have a cycle`);
  return out;
}

/**
 * The course's own words for an item: the passage blocks it rests on, verbatim (anything about what the course says is
 * answered from these, never from a paraphrase). The item's own refs first, then the blocks that share the most content
 * words with its text. ponytail: word overlap, not embeddings; good enough to find a KC's defining paragraph.
 */
export function sourcesFor(text, passages, { refs = [], k = 2, max = 1500 } = {}) {
  const blocks = passages.flatMap(p => p.blocks.map(b => ({ ...b, lecture: p.lecture, section: p.section }))), want = words(text);
  const own = refs.map(r => blocks.find(b => b.ref === r)).filter(Boolean);
  const scored = blocks.filter(b => !own.includes(b)).map(b => ({ b, n: [...words(b.text)].filter(w => want.has(w)).length })).filter(x => x.n >= 3).sort((a, b) => b.n - a.n).map(x => x.b);
  return [...own, ...scored].slice(0, Math.max(k, own.length)).map(b => ({ ref: b.ref, where: `${b.lecture} › ${b.section}`, text: b.text.length > max ? `${b.text.slice(0, max - 1)}…` : b.text }));
}
/** Every KC, explanation and wrong model with its source passages attached (anchors and verbatim text). */
export function attachSources(st, passages) {
  const kcText = id => { const k = st.kcs.find(x => x.id === id), e = st.explanations?.find(x => x.kc === id); return `${k?.statement ?? ''} ${e?.precise ?? ''}`; };
  return {
    ...st,
    kcs: st.kcs.map(k => ({ ...k, sources: sourcesFor(kcText(k.id), passages, { refs: k.refs || [] }) })),
    explanations: (st.explanations || []).map(e => ({ ...e, sources: sourcesFor(`${e.precise} ${e.plain}`, passages, { refs: st.kcs.find(k => k.id === e.kc)?.refs || [], k: 2 }) })),
    wrongModels: (st.wrongModels || []).map(w => ({ ...w, sources: sourcesFor(`${w.belief} ${w.plausibleBecause}`, passages, { refs: (st.inventory?.warnings || []).filter(q => words(q.quote).size && [...words(q.quote)].some(x => words(w.belief).has(x))).map(q => q.ref), k: 1 }) })),
  };
}

/** An item's answer key, apart from its explanation: a run check's printed output (for RISC-V, the register values), else the key the evidence stage wrote. */
export const keyOf = p => {
  if (['R4', 'R5'].includes(p.regime)) return null;
  if (p.check && ['js', 'c'].includes(p.check.by) && p.verification?.ok) return { value: p.check.expect.trim(), form: 'text', equivalents: p.key?.value && p.key.value !== p.check.expect.trim() ? [p.key.value, ...(p.key.equivalents || [])] : (p.key?.equivalents || []), compare: p.check.compare, tolerance: p.check.tolerance };
  if (p.check?.by === 'riscv' && p.verification?.ok) return { value: [...p.check.expect.matchAll(/=\s*(-?(?:0x[\da-f]+|0b[01]+|\d+))/gi)].map(m => m[1]).join(', '), form: 'numbers', equivalents: p.key?.value ? [p.key.value] : [] };
  return p.key?.value ? { ...p.key } : null;
};

/** The model's prose claims, each with its path, for the grounding check. */
function claimsOf(study) {
  const out = [], walk = (v, path) => {
    if (typeof v === 'string') { if (v.length > 30) out.push({ path, text: v }); return; }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!SKIP.has(k) && !['steps', 'faded', 'board', 'route', 'detector'].includes(k)) walk(x, `${path}.${k}`);
  };
  for (const k of ['enduring', 'kcs', 'explanations', 'wrongModels', 'models', 'cases', 'representations', 'gapsInNotes', 'simplifications', 'readings']) walk(study[k], k);
  return out;
}
/** A grounding finding applied: the claim replaced by its fix, or (no fix) the list item holding it dropped. */
function applyFinding(study, { path, fix }) {
  const m = /^(.*)\.(\w+)$/.exec(path), parent = m && pathGet(study, m[1]);
  if (fix && parent && typeof parent[m[2]] === 'string') { parent[m[2]] = fix; return true; }
  const item = /^(\w+)\[(\d+)\]/.exec(path), xs = item && study[item[1]];
  if (Array.isArray(xs) && xs[item[2]]) { xs[item[2]] = null; return true; }
  return false;
}

/** The real-time context budget the ablation gives every condition (characters, about 5,000 tokens). */
export const ABLATION_BUDGET = 20_000;
const cut = (text, max) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
/** The materials as the "notes" condition reads them, within a budget: passages in course order. */
export const notesText = (passages, max = ABLATION_BUDGET) => cut(passages.map(p => `## ${p.lecture} › ${p.section}\n${p.blocks.map(b => b.text).join('\n\n')}`).join('\n\n'), max);

/**
 * The model as a tutor reads it in real time (the ablation's "model" condition), within a budget, most needed first:
 * the facts in the course's own terms, then the teaching knowledge (wrong models with their signatures, separating
 * questions and repairs; readings and representations with what they are for; conflicts), then the reasons, then the
 * chosen passages of the materials themselves as space allows. No code or bookkeeping.
 */
export function briefOf(st, { passages = [], max = ABLATION_BUDGET } = {}) {
  const sections = [], add = (title, lines) => { const body = lines.filter(Boolean).join('\n'); if (body) sections.push(`## ${title}\n${body}`); };
  const exp = k => st.explanations.find(x => x.kc === k.id);
  add(`${st.title || 'Topic'}: what to know`, [st.matters?.why && `Why it matters: ${st.matters.why} Assessments: ${st.matters.examUse}`, ...st.enduring.map(e => `- ${e}`),
    ...st.kcs.map(k => `- ${k.id} (${k.kind}): ${k.statement}${exp(k) ? ` Precisely: ${exp(k).precise}` : ''}${(k.sources || []).length ? ` (course: ${k.sources.map(x => x.ref).join(', ')})` : ''}`),
    st.inventory?.notation?.length ? `Notation: ${st.inventory.notation.join('; ')}` : null, ...(st.inventory?.emphasis || []).map(q => `The course stresses: "${q.quote}"`), ...(st.inventory?.warnings || []).map(q => `The course warns: "${q.quote}"`)]);
  add('Worked results', st.explanations.flatMap(e => e.workedExamples.map(w => `- ${w.steps.map(x => x.step).join(' → ')} ⇒ ${w.answer}`)).concat(st.problems.filter(y => y.verification?.ok && !y.id.startsWith('sep_')).slice(0, 8).map(x => `- ${cut(x.prompt, 240)} ⇒ ${cut(String(x.answer), 160)}`)));
  add('How learners go wrong, how to tell, how to repair', st.wrongModels.map(w => { const sep = st.problems.find(x => x.id === w.separatingProbe); return `- ${w.id} [${w.errorKind}, ${w.detector?.type}] ${w.belief} Seems right because ${w.plausibleBecause}${w.detector?.type === 'rubric' ? ` Shows as: ${w.detector.description}` : ''}${w.markers?.length ? ` Cues: ${w.markers.join(', ')}.` : ''}${sep ? ` Separating question: "${cut(sep.prompt, 220)}": this belief answers ${sep.wrongAnswers?.[w.id] ?? '?'}, correct ${sep.answer}${Object.entries(sep.wrongAnswers || {}).filter(([x]) => x !== w.id).map(([x, a]) => `, ${x} answers ${a}`).join('')}.` : ''} Repair: ${w.repair}`; }));
  add('What to give a learner', [...st.readings.map(r => `- Reading ${r.id} (${r.source}, ${r.level}, ${r.minutes ?? '?'} min${r.refutes ? `, refutes ${r.refutes}` : ''}): ${r.purpose}${r.source === 'explainer' ? ` Text: ${cut(r.text, 700)}` : ''}`),
    ...st.representations.map(r => `- Representation ${r.id} (${r.element?.kind ?? r.kind}, best for ${r.bestFor}${r.reveals?.length ? `, reveals ${r.reveals.join(', ')}` : ''}): notice ${r.notice.join('; ')}; misleads when ${r.misleadsWhen}`),
    ...st.cases.map(c => `- Case ${c.title}: ${cut(c.text ?? '', 300)}${c.links.length ? ` (${c.links.map(l => `${l.relation} to ${l.to}`).join('; ')})` : ''}`),
    ...(st.route?.novice || []).slice(0, 2).map(m => `- For a novice: ${m.kind}: ${m.why}`), ...(st.route?.fluent || []).slice(0, 1).map(m => `- For a fluent learner: ${m.kind}: ${m.why}`)]);
  add('Where the materials are wrong, terse or simplified (asked what the course says, give its statement, then the correction)', [...st.conflicts.map(c => `- ${c.where}: the course says ${c.materialsSay}; the correction: ${c.truth}`), ...st.simplifications.map(x => `- ${x.where}: ${x.simplification}; the full story: ${x.fullStory}`), ...st.gapsInNotes.map(g => `- ${g.where} skips: ${g.missing} Fill: ${g.fill}`)]);
  add('Why', st.kcs.map(k => exp(k) && `- ${k.id}: ${exp(k).mechanism}${exp(k).analogies?.length ? ` Analogy: ${exp(k).analogies.map(a => `${a.mapping} (breaks: ${a.breaksWhere})`).join(' / ')}` : ''}`).concat(st.models.map(m => `- Model ${m.name} (${m.form}): state ${m.state.join('; ')}; rules ${m.rules.join('; ')}`)));
  // The course's own words are primary for what the course says: its passages verbatim take 60% of the budget (the blocks
  // the KCs and readings rest on first, then the rest in course order); the model's own knowledge takes the other 40%.
  const head = cut(sections.join('\n\n'), Math.floor(max * 0.4)), room = max - head.length - 60;
  const first = new Set([...st.kcs.flatMap(k => (k.sources || []).map(x => x.ref)), ...st.readings.filter(r => r.source === 'materials').flatMap(r => r.refs)]);
  const blocks = passages.flatMap(p => p.blocks), ordered = [...blocks.filter(b => first.has(b.ref)), ...blocks.filter(b => !first.has(b.ref))];
  const verbatim = room > 400 ? ordered.map(b => b.text).join('\n\n') : '';
  return cut(verbatim ? `## The course's own words\n${cut(verbatim, room)}\n\n${head}` : head, max);
}

// ---------- the course stage ----------

/** The course as a whole: the adapters it binds, sources' roles, spine, runnable models, methods, conventions, links, assessment. */
export async function makeCourseStudy(app, input) {
  const value = unwrap(await call(x => app.providers.studyWriter.spine(x), input, { valueSchema: STUDY_SHAPES.spine, what: 'course spine' })).value;
  const refs = new Set(input.refs), topics = new Set(input.outline.map(t => t.topicId)), log = [];
  for (const sp of value.spine) { sp.evidence = sp.evidence.filter(r => refs.has(r)); sp.topics = sp.topics.filter(t => topics.has(t)); }
  for (const m of value.models) m.usedBy = m.usedBy.filter(t => topics.has(t));
  for (const m of value.methods) m.evidence = m.evidence.filter(r => refs.has(r));
  value.links = value.links.filter(l => (topics.has(l.from) && topics.has(l.to)) || !log.push(`a link between unknown topics ${l.from} → ${l.to}`)).map(l => ({ ...l, evidence: l.evidence.filter(r => refs.has(r)) }));
  const lectures = new Map(input.sources.flatMap(src => src.blocks.map(b => [b.ref, src.id])));
  value.spine = value.spine.map(sp => ({ ...sp, sourcesCited: new Set(sp.evidence.map(r => lectures.get(r))).size }));
  value.adapters = [...new Set(value.adapters)];
  return { course: value, log };
}

// ---------- verification helpers that need the models ----------

/** Judged items ({ id, prompt, answer, rubric }): solved blind by the light model, then compared. → Map id → { ok, note, blind }. */
async function judgeBlind(ask, items) {
  const out = new Map();
  if (!items.length) return out;
  const { answers } = await ask('blind', { questions: items.map(({ id, prompt }) => ({ id, question: prompt })) });
  const { items: verdicts } = await ask('agree', { items: items.map(x => ({ id: x.id, question: x.prompt, reference: x.answer, rubric: x.rubric || [], candidate: answers.find(a => a.id === x.id)?.answer ?? '(no answer)' })) });
  for (const x of items) { const v = verdicts.find(y => y.id === x.id); out.set(x.id, { ok: v ? v.agree : null, note: v?.why ?? 'not compared', blind: answers.find(a => a.id === x.id)?.answer ?? null }); }
  return out;
}

/**
 * Families run one at a time, with their rules (one that throws is found, not the whole batch lost: when a family's
 * program fails with its rules, the family runs alone and each rule is tried on its own). → { rows: Map familyId → rows
 * with answers, errors: Map familyId → why, ruleErrors: Map wrongModelId → why }.
 */
async function familyRows(families, rules = [], seeds) {
  const out = new Map(), errors = new Map(), ruleErrors = new Map();
  const usable = r => r.rows.filter(x => !x.error && x.answer !== undefined && x.answer !== '' && x.answer !== 'undefined');
  for (const f of families) {
    const mine = rules.filter(x => x.familyId === f.id);
    let r = await runFamilies([f], mine, seeds);
    if (r.error && mine.length) {
      r = await runFamilies([f], [], seeds);
      if (!r.error) for (const rule of mine) {
        const one = await runFamilies([f], [rule], seeds);
        if (one.error) { ruleErrors.set(rule.wrongModelId, String(one.error).slice(0, 300)); continue; }
        for (const row of r.rows) { const x = one.rows.find(y => y.seed === row.seed); if (x?.wrong) Object.assign(row.wrong, x.wrong); }
      }
    }
    const good = usable(r);
    if (r.error || good.length < Math.min(3, seeds.length)) errors.set(f.id, r.error || r.rows.find(x => x.error)?.error || 'it returned no answers');
    else out.set(f.id, good);
  }
  return { rows: out, errors, ruleErrors };
}

// ---------- 2. evidence ----------

async function checkEvidence(ask, draft, { adapters, refsText }) {
  const issues = [], stats = { checks: 0, passed: 0, failed: 0, unverified: 0, judgedAtUse: 0 };
  const bound = new Set(adapters);
  const { rows, errors } = await familyRows(draft.families, [], [1, 2, 3, 4, 5, 6]);
  for (const [id, e] of errors) issues.push(`family ${id} does not run: ${String(e).slice(0, 300)}`);
  for (const [id, rs] of rows) if (new Set(rs.map(r => JSON.stringify(r.input))).size < 3) issues.push(`family ${id} generates fewer than 3 different instances`);
  const families = draft.families.filter(f => rows.has(f.id));
  stats.checks += draft.families.length; stats.passed += families.length; stats.failed += errors.size;
  const kept = [], judged = [];
  for (const p of draft.probes) {
    const adapter = bound.has(p.adapter) ? p.adapter : adapters[0], chain = chainFor(p.regime, ADAPTERS[adapter]?.verifiers);
    const el = p.element?.spec ? await checkElement(p.element) : { element: p.element ? { kind: p.element.kind, spec: null } : null, ok: null };
    if (el.ok === false) issues.push(`probe ${p.id}'s ${p.element.kind} element spec does not run: ${el.problem}`);
    const base = { ...p, adapter, verifierChain: chain, element: el.element };
    if (p.familyId) { if (rows.has(p.familyId)) kept.push({ ...base, verification: { by: 'family', ok: true } }); else issues.push(`probe ${p.id} uses family ${p.familyId}, which does not run`); continue; }
    if (!p.prompt.trim() || !p.answer.trim()) { issues.push(`probe ${p.id} needs a prompt and an answer`); continue; }
    // Constraint tests are code too: each must accept the reference answer.
    for (const c of p.constraints.filter(x => x.test)) { const r = await runCheck({ by: 'js', code: `const answer = ${JSON.stringify(p.answer)};\nconsole.log((${c.test})(answer) ? 'PASS' : 'FAIL');`, expect: 'PASS', compare: 'exact', tolerance: null }); if (r.ok === false) issues.push(`probe ${p.id}: constraint ${c.id}'s test rejects the reference answer (${r.note})`); }
    if (['R4', 'R5'].includes(p.regime)) { // arguable answers: checked at use by sources, constraints and calibrated criteria
      stats.judgedAtUse++;
      const quotes = [...p.answer.matchAll(/["“]([^"”]{12,300})["”]/g)].map(m => norm(m[1])), off = quotes.filter(q => !refsText.includes(q));
      if (off.length) { issues.push(`probe ${p.id}'s reference quotes what the materials do not say: "${off[0].slice(0, 120)}"`); continue; }
      if (p.rubric.length < 2) { issues.push(`probe ${p.id} (${p.regime}) needs at least two rubric criteria`); continue; }
      kept.push({ ...base, verification: { by: 'rubric', ok: null } });
      continue;
    }
    if (!p.check || p.check.by === 'judge') { judged.push(base); continue; }
    stats.checks++;
    const c = await runCheck(p.check);
    if (c.ok === false) { stats.failed++; issues.push(`probe ${p.id}: its check disagrees with its answer: ${c.note}`); continue; }
    if (c.ok) stats.passed++; else stats.unverified++;
    kept.push({ ...base, verification: { by: p.check.by, ok: c.ok } });
  }
  const verdicts = await judgeBlind(ask, judged.map(p => ({ id: p.id, prompt: p.prompt, answer: p.answer, rubric: p.rubric })));
  for (const p of judged) {
    stats.checks++;
    const v = verdicts.get(p.id);
    if (v?.ok === false) { stats.failed++; issues.push(`probe ${p.id}: an independent solver answered "${String(v.blind).slice(0, 200)}", which disagrees with its answer (${v.note}): make the question unambiguous, fix the answer, or give it the regime R4 if several answers are defensible`); continue; }
    if (v?.ok) stats.passed++; else stats.unverified++;
    kept.push({ ...p, verification: { by: 'judge', ok: v?.ok ?? null } });
  }
  const covered = new Set(kept.map(p => p.family)), missing = CORE_FAMILIES.filter(f => !covered.has(f));
  if (missing.length) issues.push(`no kept probe for the performance families: ${missing.map(f => `${f} (${FAMILIES[f]})`).join(', ')}`);
  return { families, rows, probes: kept, taskLadder: draft.taskLadder.filter(id => kept.some(p => p.id === id)), issues, stats, missing };
}

// ---------- 3. wrong models: each detector must fire distinctly ----------

async function checkWrongs(ask, draft, families, problems, probes) {
  const issues = [], famIds = new Set(families.map(f => f.id)), probeIds = new Set(probes.map(p => p.id));
  const constraintIds = new Set(probes.flatMap(p => p.constraints.flatMap(c => [`${p.id}:${c.id}`, c.id])));
  const wrongs = draft.wrongModels.map(w => ({ ...w, detector: { ...w.detector, rules: w.detector.rules.filter(r => famIds.has(r.familyId)), battery: w.detector.battery.filter(id => probeIds.has(id)) } }));
  const rules = wrongs.filter(w => w.detector.type === 'execute').flatMap(w => w.detector.rules.map(r => ({ wrongModelId: w.id, familyId: r.familyId, code: r.code })));
  const seeds = Array.from({ length: 16 }, (_, i) => i + 1), { rows, ruleErrors } = await familyRows(families, rules, seeds);
  for (const [wid, e] of ruleErrors) issues.push(`${wid}'s rule does not run: ${e}`);
  const fired = new Map(); // id → { how, row? }
  // execute: an instance where this rule differs from the correct answer and from every other rule.
  for (const w of wrongs.filter(x => x.detector.type === 'execute' && x.detector.rules.length && !ruleErrors.has(x.id))) {
    let found = null, differs = 0, rival = null;
    for (const r of w.detector.rules) for (const row of rows.get(r.familyId) || []) {
      const mine = row.wrong[w.id];
      if (mine === undefined || /^ERROR: /.test(mine) || mine === row.answer) continue;
      differs++;
      const twin = Object.entries(row.wrong).find(([other, a]) => other !== w.id && a === mine);
      if (!twin && !found) found = row; else if (twin) rival = twin[0];
    }
    if (found) fired.set(w.id, { how: 'execute', row: found });
    else issues.push(differs ? `${w.id}'s rule never gives an answer that differs from every other wrong model's on the same instance${rival ? ` (it always matches ${rival}: merge them or sharpen one)` : ''}` : `${w.id}'s rule always gives the correct answer: it does not encode the belief`);
  }
  // pattern: a fingerprint over a battery that differs from the correct answers and from every other pattern.
  const correctOf = id => problems.find(p => p.probeId === id || p.id === id)?.answer;
  const patterns = wrongs.filter(w => w.detector.type === 'pattern');
  for (const w of patterns) {
    const { battery, fingerprint } = w.detector;
    if (battery.length < 2 || fingerprint.length !== battery.length) { issues.push(`${w.id}'s pattern needs a battery of at least two probe ids and one predicted answer for each`); continue; }
    const differsFromCorrect = battery.some((id, i) => correctOf(id) && !sameAnswer(fingerprint[i], correctOf(id)));
    const twin = patterns.find(o => o.id !== w.id && o.detector.battery.length === battery.length && battery.every((id, i) => o.detector.battery[i] === id && sameAnswer(o.detector.fingerprint[i], fingerprint[i])));
    if (!differsFromCorrect) issues.push(`${w.id}'s fingerprint matches the correct answers on its whole battery`);
    else if (twin) issues.push(`${w.id}'s fingerprint is the same as ${twin.id}'s: merge them or extend the battery`);
    else fired.set(w.id, { how: 'pattern' });
  }
  // constraint: the requirements this belief violates exist, and no other belief violates exactly the same set.
  const constraintWrongs = wrongs.filter(w => w.detector.type === 'constraint');
  for (const w of constraintWrongs) {
    const v = w.detector.violates.filter(id => constraintIds.has(id)), key = [...v].sort().join('|');
    if (!v.length) issues.push(`${w.id} names no constraint that a probe declares`);
    else if (constraintWrongs.some(o => o.id !== w.id && [...o.detector.violates].sort().join('|') === key)) issues.push(`${w.id} violates the same constraints as another wrong model`);
    else fired.set(w.id, { how: 'constraint' });
  }
  // rubric (and anything above that did not fire but has a separating question): role-played, then diagnosed.
  const rubric = wrongs.filter(w => !fired.has(w.id) && w.probe);
  for (const w of wrongs.filter(x => !fired.has(x.id) && !x.probe && x.detector.type === 'rubric')) issues.push(`${w.id} is a rubric detector with no separating question`);
  const played = new Map();
  if (rubric.length) {
    const { answers } = await ask('roleplay', { items: rubric.map(w => ({ id: w.id, belief: w.belief, question: w.probe.prompt })) });
    const candidates = [...wrongs.map(w => ({ id: w.id, belief: w.belief })), { id: 'correct', belief: 'the correct understanding' }];
    const items = rubric.flatMap(w => [{ id: `${w.id}:played`, question: w.probe.prompt, answer: answers.find(a => a.id === w.id)?.answer ?? w.probe.answer, candidates }, { id: `${w.id}:correct`, question: w.probe.prompt, answer: w.probe.correct, candidates }]);
    const { items: diagnosed } = await ask('classify', { items });
    for (const w of rubric) {
      const as = diagnosed.find(d => d.id === `${w.id}:played`)?.belief, right = diagnosed.find(d => d.id === `${w.id}:correct`)?.belief;
      played.set(w.id, { answer: answers.find(a => a.id === w.id)?.answer ?? null, diagnosedAs: as ?? null, correctDiagnosedAs: right ?? null });
      if (as === w.id && right === 'correct') fired.set(w.id, { how: 'rubric' });
      else issues.push(as !== w.id ? `${w.id}: a learner holding it answered its question "${String(played.get(w.id).answer).slice(0, 160)}", which reads as ${as || 'nothing'}, not ${w.id}: sharpen the question or the belief, or merge it with ${as}` : `${w.id}: the correct answer to its question reads as ${right}: the question does not separate`);
    }
  }
  const kept = wrongs.filter(w => fired.has(w.id)), dropped = wrongs.filter(w => !fired.has(w.id)).map(w => w.id), keptIds = new Set(kept.map(w => w.id));
  // Every family problem answered by every kept rule: the director's instant diagnosis.
  const wrongOf = row => Object.fromEntries(Object.entries(row.wrong).filter(([wid, a]) => keptIds.has(wid) && a !== row.answer && !/^ERROR: /.test(a)));
  const withWrong = problems.map(p => { if (!p.familyId) return p; const row = (rows.get(p.familyId) || []).find(r => r.seed === p.seed); return row ? { ...p, wrongAnswers: wrongOf(row) } : p; });
  const family = new Map(families.map(f => [f.id, f]));
  const separating = [...fired].filter(([, f]) => f.how === 'execute').map(([wid, { row }]) => ({
    id: `sep_${wid}`, probeId: null, kc: wrongs.find(w => w.id === wid).kc, adapter: family.get(row.familyId).adapter, family: 'E6', regime: family.get(row.familyId).regime, form: 'separating question', level: 'core', familyId: row.familyId, seed: row.seed, input: row.input,
    prompt: render(family.get(row.familyId).prompt, row.input), answer: row.answer, key: { value: row.answer, form: 'text', equivalents: [] }, rubric: [], constraints: [], verification: { by: 'family', ok: true }, verifierChain: chainFor(family.get(row.familyId).regime), wrongAnswers: wrongOf(row),
  }));
  const judgedSep = rubric.filter(w => fired.get(w.id)?.how === 'rubric').map(w => ({ id: `sep_${w.id}`, probeId: null, kc: w.kc, adapter: null, family: 'E6', regime: 'R1', form: 'separating question', level: 'core', familyId: null, prompt: w.probe.prompt, answer: w.probe.correct, rubric: [], constraints: [], verification: { by: 'judge', ok: true }, verifierChain: chainFor('R1'), wrongAnswers: { [w.id]: w.probe.answer } }));
  const detectorOf = w => {
    const t = fired.get(w.id).how === 'rubric' ? 'rubric' : w.detector.type, d = w.detector;
    return { execute: { type: 'execute', rules: d.rules }, pattern: { type: 'pattern', battery: d.battery, fingerprint: d.fingerprint }, constraint: { type: 'constraint', violates: d.violates }, rubric: { type: 'rubric', description: d.description, positives: d.positives, negatives: d.negatives, judge: null, played: played.get(w.id)?.answer ?? null } }[t];
  };
  const out = kept.map(w => ({
    id: w.id, kc: w.kc, belief: w.belief, errorKind: w.errorKind, plausibleBecause: w.plausibleBecause, source: w.source, citation: w.citation, prior: w.source === 'inferred' ? Math.min(w.prior, 0.3) : w.prior,
    detector: detectorOf(w), markers: w.markers, separatingProbe: ['execute', 'rubric'].includes(fired.get(w.id).how) ? `sep_${w.id}` : w.detector.battery?.[0] ?? null,
    repair: w.repair, recheck: w.recheck,
  }));
  return { wrongModels: out, dropped, problems: [...withWrong, ...separating, ...judgedSep], issues };
}

// ---------- 4. procedures: drafts merged, then the literal executor on fresh instances ----------

async function executeAll(ask, procedures, models, families, problems, seeds) {
  const famById = new Map(families.map(f => [f.id, f])), instances = [];
  const { rows } = await familyRows(families.filter(f => procedures.some(p => p.familyId === f.id) || models.some(m => m.kcs.includes(f.kc))), [], seeds);
  for (const p of procedures) {
    const rs = p.familyId && rows.get(p.familyId);
    if (rs) rs.forEach(r => instances.push({ id: `${p.id}#${r.seed}`, use: `procedure:${p.id}`, prompt: render(famById.get(p.familyId).prompt, r.input), expected: r.answer, computed: true }));
    else problems.filter(x => x.kc === p.kc && !x.familyId && x.verification?.ok).slice(0, 3).forEach(x => instances.push({ id: `${p.id}#${x.id}`, use: `procedure:${p.id}`, prompt: x.prompt, expected: x.answer, rubric: x.rubric, computed: false }));
  }
  for (const m of models) {
    const f = families.find(x => m.kcs.includes(x.kc) && rows.get(x.id)), r = f && rows.get(f.id)[0], x = !r && problems.find(p => m.kcs.includes(p.kc) && !p.familyId && p.verification?.ok);
    if (r) instances.push({ id: `${m.id}#sim`, use: `model:${m.id}`, prompt: render(f.prompt, r.input), expected: r.answer, computed: true });
    else if (x) instances.push({ id: `${m.id}#sim`, use: `model:${m.id}`, prompt: x.prompt, expected: x.answer, rubric: x.rubric, computed: false });
  }
  if (!instances.length) return { instances: [] };
  const { results } = await ask('execute', { procedures: procedures.map(({ id, title, subgoals }) => ({ id, title, subgoals })), models: models.map(({ id, name, state, rules }) => ({ id, name, state, rules })), instances: instances.map(({ id, use, prompt }) => ({ id, use, prompt })) });
  const got = id => results.find(r => r.id === id);
  // Computed answers compare by value; what that misses, and every judged one, the light model compares.
  const toJudge = instances.filter(i => got(i.id) && !(i.computed && sameAnswer(got(i.id).answer, i.expected)));
  const verdicts = toJudge.length ? (await ask('agree', { items: toJudge.map(i => ({ id: i.id, question: i.prompt, reference: i.expected, rubric: i.rubric || [], candidate: got(i.id).answer })) })).items : [];
  return { instances: instances.map(i => { const r = got(i.id); return { ...i, answer: r?.answer ?? null, stuck: r?.stuck ?? [{ step: '(all)', missing: 'no result' }], solved: !!r && (i.computed && sameAnswer(r.answer, i.expected) || verdicts.find(v => v.id === i.id)?.agree === true) }; }) };
}

// ---------- 5. runnable models, cases, representations, audit ----------

/** The element registry (shared/elements/registry.mjs, the stage's). Only kinds whose engine is live (they publish
 *  their spec rules) are offered; a registered stub refuses every spec. */
let registry, kindOf = k => k;
const elementKinds = async () => {
  registry ??= await import('../../shared/elements/registry.mjs').then(m => {
    kindOf = m.kindOf;
    return Object.fromEntries(Object.entries(m.REGISTRY).filter(([k]) => m.RULES[k]).map(([k, v]) => [k, { ...v, rules: m.RULES[k] }]));
  });
  return registry;
};
/** A ready-to-run element spec checked by its element's own engine: { element, ok, problem }. ok null when no engine exists for the kind yet. */
async function checkElement(element) {
  if (!element) return { element: null, ok: null, problem: null };
  let spec; try { spec = typeof element.spec === 'string' ? JSON.parse(element.spec) : element.spec; } catch (e) { return { element: null, ok: false, problem: `spec is not JSON: ${e.message}` }; }
  const kinds = await elementKinds(), name = kindOf(element.kind), kind = kinds[name], validate = kind?.engine?.validate || kind?.validate;
  if (!validate) return { element: { kind: name, spec }, ok: null, problem: null };
  try { return { element: { kind: name, spec: validate(spec) ?? spec }, ok: true, problem: null }; } catch (e) { return { element: { kind: name, spec }, ok: false, problem: String(e.message).slice(0, 300) }; }
}

async function checkModel(draft, refs, wrongIds) {
  const issues = [], conflicts = [], audit = [];
  const models = draft.models.map(m => ({ ...m, board: boardOf(m.board, `model ${m.id}`, issues) }));
  const representations = [];
  for (const r of draft.representations) {
    const e = await checkElement(r.element);
    if (e.ok === false) issues.push(`representation ${r.id}'s ${r.element.kind} spec does not run: ${e.problem}`);
    representations.push({ ...r, board: boardOf(r.board, `representation ${r.id}`, issues), element: e.element, elementVerified: e.ok, reveals: r.reveals.filter(w => wrongIds.has(w)) });
  }
  const caseIds = new Set(draft.cases.map(c => c.id));
  const cases = draft.cases.map(c => ({ ...c, refs: c.refs.filter(r => refs.has(r)), links: c.links.filter(l => caseIds.has(l.to)) }));
  for (const a of draft.audit) {
    if (!refs.has(a.where)) continue;
    if (a.check && a.check.by !== 'judge') {
      // A check that did not run (a syntax error, a timeout) proves nothing about the materials: unverified, never a conflict.
      const c = await runCheck(a.check);
      audit.push({ where: a.where, materialsSay: a.materialsSay, by: a.check.by, ok: c.ran === false ? null : c.ok });
      if (c.ok === false && c.ran !== false) conflicts.push({ where: a.where, materialsSay: a.materialsSay, truth: `${a.verdict ? `${a.verdict} ` : ''}Run as a check, the claim fails: ${c.note}`, verifiedBy: a.check.by });
    } else if (a.verdict) { audit.push({ where: a.where, materialsSay: a.materialsSay, by: 'model', ok: false }); conflicts.push({ where: a.where, materialsSay: a.materialsSay, truth: a.verdict, verifiedBy: 'model' }); }
  }
  return { models, cases, representations, conflicts, audit, simplifications: draft.simplifications.filter(x => refs.has(x.where)), issues };
}

// ---------- 6. explanations and readings ----------

/** Reading time in minutes: about 180 words a minute for study reading, at least one, in half minutes. ponytail: one rate for every text; the reading brief may tune it by level. */
const minutesOf = text => Math.max(1, Math.ceil((String(text).split(/\s+/).filter(Boolean).length / 180) * 2) / 2);

function checkExplain(draft, { kcs, problems, wrongModels, representations, cases, refs, known, blocks }) {
  const issues = [], kcIds = new Set(kcs.map(k => k.id)), byId = new Map(problems.map(p => [p.id, p])), wIds = new Set(wrongModels.map(w => w.id)), rIds = new Set(representations.map(r => r.id)), cIds = new Set(cases.map(c => c.id));
  for (const k of kcs) if (!draft.explanations.some(e => e.kc === k.id)) issues.push(`no explanation for ${k.id}`);
  for (const e of draft.explanations) for (const w of e.workedExamples) {
    const p = byId.get(w.problemId);
    if (!p) issues.push(`a worked example for ${e.kc} names unknown problem ${w.problemId}`);
    else if (p.verification?.ok === true && !sameAnswer(w.answer, p.answer) && !sameAnswer(p.answer, w.answer)) issues.push(`the worked example on ${w.problemId} ends with "${w.answer.slice(0, 120)}", but its verified answer is "${String(p.answer).slice(0, 120)}"`);
  }
  for (const w of wIds) if (!draft.route.wrongModels.some(x => x.wrongModelId === w)) issues.push(`the route has no repair moves for ${w}`);
  if (!draft.route.representationFails.length) issues.push('the route has no moves for when a representation does not land');
  const readings = draft.readings.map(r => ({ ...r, refs: r.refs.filter(x => refs.has(x)), refutes: wIds.has(r.refutes) ? r.refutes : null, kcs: r.kcs.filter(k => kcIds.has(k)) }));
  for (const r of readings) {
    if (r.source === 'materials' && !r.refs.length) issues.push(`reading ${r.id} is from the materials but names no given passage ref`);
    if (r.source === 'explainer' && !r.text?.trim()) issues.push(`reading ${r.id} is an explainer with no text`);
  }
  if (!readings.some(r => r.source === 'materials')) issues.push('no reading from the materials: choose the passages worth reading');
  const readingIds = new Set(readings.map(r => r.id));
  const moves = [...draft.route.novice, ...draft.route.prior, ...draft.route.fluent, ...draft.route.wrongModels.flatMap(x => x.moves), ...draft.route.representationFails.flatMap(x => x.moves)];
  for (const m of moves) {
    if (m.problemId && !byId.has(m.problemId)) issues.push(`a move names unknown problem ${m.problemId}`);
    if (m.read && !refs.has(m.read.ref)) issues.push(`a move reads unknown ref ${m.read.ref}`);
    if (m.representationId && !rIds.has(m.representationId)) issues.push(`a move names unknown representation ${m.representationId}`);
    if (m.readingId && !readingIds.has(m.readingId)) issues.push(`a move names unknown reading ${m.readingId}`);
  }
  const fix = m => ({ ...m, problemId: byId.has(m.problemId) ? m.problemId : null, representationId: rIds.has(m.representationId) ? m.representationId : null, readingId: readingIds.has(m.readingId) ? m.readingId : null, caseId: cIds.has(m.caseId) ? m.caseId : null, read: m.read && refs.has(m.read.ref) ? m.read : null, expect: m.expect.map(e => ({ ...e, wrongModelId: wIds.has(e.wrongModelId) ? e.wrongModelId : null })) });
  return {
    explain: {
      explanations: draft.explanations.filter(e => kcIds.has(e.kc)).map(e => ({ ...e, workedExamples: e.workedExamples.filter(w => byId.has(w.problemId)) })),
      readings: readings.filter(r => r.source === 'explainer' ? r.text?.trim() : r.refs.length).map(r => ({ ...r, ref: r.refs[0] ?? null, minutes: minutesOf(r.source === 'explainer' ? r.text : r.refs.map(x => blocks.get(x) || '').join(' ')) })),
      gapsInNotes: draft.gapsInNotes.filter(g => refs.has(g.where)),
      links: draft.links.filter(l => known.has(l.to)).map(l => ({ ...l, evidence: l.evidence.filter(r => refs.has(r)) })),
      route: { novice: draft.route.novice.map(fix), prior: draft.route.prior.map(fix), fluent: draft.route.fluent.map(fix), wrongModels: draft.route.wrongModels.filter(x => wIds.has(x.wrongModelId)).map(x => ({ ...x, moves: x.moves.map(fix) })), representationFails: draft.route.representationFails.filter(x => rIds.has(x.representationId)).map(x => ({ ...x, moves: x.moves.map(fix) })) },
    },
    issues,
  };
}

/**
 * The ablation (spec §7 stage 11): the light model alone, with the materials, with the model, and with half of each, every
 * condition at the same real-time budget. Knowledge probes: the model may not lose facts the materials hold (at most 2
 * points below them, nothing invented). Teaching probes: the model must beat the materials by at least 10 points.
 */
export async function ablate(ask, study, { title, passages }, ablationProbes) {
  const brief = briefOf(study, { passages }), half = Math.floor(ABLATION_BUDGET / 2);
  const material = { none: null, notes: notesText(passages), model: brief, both: `${briefOf(study, { passages: [], max: half })}\n\n# The materials\n${notesText(passages, half)}` };
  const answered = await Promise.all(Object.entries(material).map(async ([context, m]) => [context, (await ask('answer', { topic: title, context, material: m, questions: ablationProbes.map(({ id, question }) => ({ id, question })) })).answers]));
  const { grades } = await ask('grade', { flagged: (study.conflicts || []).map(c => ({ materialsSay: c.materialsSay, correction: c.truth })), items: answered.flatMap(([context, answers]) => ablationProbes.map(q => ({ id: `${q.id}:${context}`, question: q.question, reference: q.answer, rubric: q.rubric, answer: answers.find(a => a.id === q.id)?.answer ?? '(no answer)' }))) });
  const points = { correct: 1, partial: 0.5, wrong: 0 }, gradeOf = (q, c) => grades.find(g => g.id === `${q.id}:${c}`);
  const scoreOf = (context, kind) => { const qs = ablationProbes.filter(q => !kind || q.kind === kind); return qs.length ? Math.round(100 * qs.reduce((sum, q) => sum + (points[gradeOf(q, context)?.verdict] ?? 0), 0) / qs.length) / 100 : null; };
  const inventedOf = (context, kind) => count(ablationProbes.filter(q => !kind || q.kind === kind), q => gradeOf(q, context)?.invented);
  const block = kind => Object.fromEntries(Object.keys(material).map(c => [c, scoreOf(c, kind)]).concat([['invented', Object.fromEntries(Object.keys(material).map(c => [c, inventedOf(c, kind)]))], ['n', count(ablationProbes, q => q.kind === kind)]]));
  const ablation = { budgetChars: ABLATION_BUDGET, n: ablationProbes.length, knowledge: block('knowledge'), teaching: block('teaching'), modelOnly: scoreOf('none'), withNotes: scoreOf('notes'), withStudy: scoreOf('model'), withBoth: scoreOf('both'), briefChars: brief.length,
    probes: ablationProbes.map(q => ({ ...q, verdicts: Object.fromEntries(Object.keys(material).map(c => [c, gradeOf(q, c)?.verdict ?? null])), invented: Object.fromEntries(Object.keys(material).map(c => [c, !!gradeOf(q, c)?.invented])),
      answers: Object.fromEntries(answered.map(([c, answers]) => [c, answers.find(a => a.id === q.id)?.answer ?? null])), why: Object.fromEntries(Object.keys(material).map(c => [c, gradeOf(q, c)?.why ?? null])) })) };
  ablation.knowledgePass = ablation.knowledge.n > 0 && ablation.knowledge.model >= ablation.knowledge.notes - 0.02 && ablation.knowledge.invented.model === 0;
  ablation.teachingPass = ablation.teaching.n > 0 && ablation.teaching.model >= ablation.teaching.notes + 0.1;
  ablation.pass = ablation.knowledgePass && ablation.teachingPass;
  return ablation;
}

// ---------- the whole topic ----------

/**
 * One topic's slice of the course model. `input` (index.mjs inputFor): { course: { title, adapters (full records),
 * spine, models }, topic, passages (blocks with refs), module, prerequisites, items, examProblems, refs, knownIds,
 * diagramData }. Returns { study, log }: the slice in the §7 shape, with its gate report and ablation in `quality`.
 */
export async function makeTopicStudy(app, input, { onStage = () => {} } = {}) {
  const P = app.providers.studyWriter, log = [];
  if (!P) throw new AppError('provider_unavailable', 'No study writer is configured.', { retryable: false });
  const ask = async (name, request) => { onStage(name); return unwrap(await call(x => P[name](x), request, { valueSchema: STUDY_SHAPES[name], what: `course model ${name}` })).value; };
  const refs = new Set(input.refs), known = new Set(input.knownIds), adapters = input.course.adapters.map(a => a.id);
  const base = { course: { title: input.course.title, spine: input.course.spine, models: input.course.models }, adapters: input.course.adapters, topic: input.topic, passages: input.passages };
  const refsText = norm(input.passages.flatMap(p => p.blocks.map(b => b.text)).join(' '));

  // The ablation's probes come from the materials alone, written while the model is built and never seeing it.
  const probing = ask('probe', { topic: input.topic, passages: input.passages, examProblems: input.examProblems });
  probing.catch(() => {});

  // 1. Desired results. Quotes must be exact; ids and refs must exist.
  const results = await ask('results', { ...base, module: input.module, prerequisites: input.prerequisites, items: input.items, examProblems: input.examProblems });
  for (const k of ['emphasis', 'warnings']) results.inventory[k] = results.inventory[k].filter(q => (refs.has(q.ref) && refsText.includes(norm(q.quote))) || !log.push(`results: dropped an inexact ${k} quote "${q.quote.slice(0, 60)}"`));
  for (const k of ['exercises', 'workedExamples']) results.inventory[k] = results.inventory[k].filter(r => refs.has(r));
  for (const k of results.kcs) { k.conceptIds = k.conceptIds.filter(c => known.has(c)); k.prerequisites = k.prerequisites.filter(p => known.has(p) || results.kcs.some(x => x.id === p)); }
  results.spine = results.spine.filter(id => input.course.spine.some(sp => sp.id === id));
  const kcs = results.kcs;

  // 2. Evidence first: task families and probes per performance family, every checker executed; one repair round.
  const kinds = await elementKinds(), kindList = Object.entries(kinds).map(([kind, k]) => ({ kind, adapters: k.adapters ?? null, modes: k.modes ?? null, purpose: k.purpose ?? k.engine?.purpose ?? null, rules: String(k.rules ?? k.engine?.rules ?? '').slice(0, 3000) || null }));
  const evidenceInput = { ...base, results, items: input.items, examProblems: input.examProblems, elementKinds: kindList.map(({ rules, ...k }) => k) };
  const evidenceDraft = await ask('evidence', evidenceInput);
  let evidence = await checkEvidence(ask, evidenceDraft, { adapters, refsText });
  if (evidence.issues.length) {
    log.push(...evidence.issues.map(x => `evidence: ${x}`));
    const again = await checkEvidence(ask, await ask('evidence', { ...evidenceInput, repair: { draft: evidenceDraft, issues: evidence.issues.slice(0, 20) } }), { adapters, refsText });
    if (again.probes.length >= evidence.probes.length) evidence = again;
    log.push(...evidence.issues.map(x => `evidence after repair: ${x}`));
  }
  const famById = new Map(evidence.families.map(f => [f.id, f]));
  let problems = evidence.probes.flatMap(p => p.familyId
    ? evidence.rows.get(p.familyId).slice(0, 2).map(r => ({ key: { value: r.answer, form: 'text', equivalents: [] }, id: `${p.id}_${r.seed}`, probeId: p.id, kc: p.kc, adapter: p.adapter, family: p.family, regime: famById.get(p.familyId).regime, form: p.form, level: p.level, familyId: p.familyId, seed: r.seed, input: r.input, prompt: render(famById.get(p.familyId).prompt, r.input), answer: r.answer, rubric: [], constraints: [], element: p.element ? { kind: p.element.kind, spec: null } : null, verification: { by: 'family', ok: true }, verifierChain: chainFor(famById.get(p.familyId).regime, ADAPTERS[p.adapter]?.verifiers), wrongAnswers: {} }))
    : [{ id: p.id, probeId: p.id, kc: p.kc, adapter: p.adapter, family: p.family, regime: p.regime, form: p.form, level: p.level, familyId: null, prompt: p.prompt, answer: p.answer, rubric: p.rubric, constraints: p.constraints, element: p.element, verification: p.verification, verifierChain: p.verifierChain, wrongAnswers: {}, key: keyOf(p) }]);

  // 3. Wrong models, each detector checked to fire distinctly; one repair round; what still cannot be separated is dropped.
  const wrongsInput = { ...base, results, families: evidence.families, probes: evidence.probes.map(({ id, kc, family, regime, familyId, prompt, answer, constraints }) => ({ id, kc, family, regime, familyId, prompt, answer, constraints: constraints.map(({ id: cid, text }) => ({ id: cid, text })) })) };
  const wrongsDraft = await ask('wrongs', wrongsInput);
  let wrongs = await checkWrongs(ask, wrongsDraft, evidence.families, problems, evidence.probes);
  if (wrongs.issues.length) {
    log.push(...wrongs.issues.map(x => `wrong models: ${x}`));
    const again = await checkWrongs(ask, await ask('wrongs', { ...wrongsInput, repair: { draft: wrongsDraft, issues: wrongs.issues.slice(0, 16) } }), evidence.families, problems, evidence.probes);
    if (again.wrongModels.length >= wrongs.wrongModels.length) wrongs = again;
    log.push(...wrongs.issues.map(x => `wrong models after repair: ${x}`), ...(wrongs.dropped.length ? [`wrong models dropped (no distinct signature): ${wrongs.dropped.join(', ')}`] : []));
  }
  problems = wrongs.problems;

  // 4 and 5, side by side: procedures (three drafts merged into a step DAG) and runnable models, cases, representations, audit.
  const procInput = { ...base, results: { kcs, interactivity: results.interactivity }, families: evidence.families.map(({ id, kc, title, prompt }) => ({ id, kc, title, prompt })), probes: evidence.probes.map(({ id, kc, family, prompt }) => ({ id, kc, family, prompt })) };
  const modelInput = { ...base, results, probes: problems.map(({ id, kc, family, regime, prompt, answer }) => ({ id, kc, family, regime, prompt, answer })), wrongModels: wrongs.wrongModels.map(({ id, kc, belief, errorKind }) => ({ id, kc, belief, errorKind })), diagramData: input.diagramData, elementKinds: kindList };
  const needsProcedures = kcs.some(k => k.kind === 'procedure' || k.kind === 'strategy');
  const [samples, modelDraft] = await Promise.all([
    needsProcedures ? Promise.all([1, 2, 3].map(n => ask('procedure', { ...procInput, draft: n }))) : [],
    ask('model', modelInput),
  ]);
  let procedures = samples.length ? (await ask('merge', { ...procInput, samples: samples.map(x => x.procedures) })).procedures : [];
  const model = await checkModel(modelDraft, refs, new Set(wrongs.wrongModels.map(w => w.id)));
  log.push(...model.issues.map(x => `model: ${x}`));
  const dagIssues = procedures.flatMap(dagProblems);
  let run = await executeAll(ask, procedures, model.models, evidence.families, problems, [101, 102, 103, 104, 105, 106]);
  const firstRun = run;
  const findings = run.instances.filter(i => !i.solved || i.stuck.length).map(i => ({ instance: i.prompt, use: i.use, executorAnswer: i.answer, expected: i.expected, stuck: i.stuck }));
  if ((findings.length || dagIssues.length) && procedures.length) {
    procedures = (await ask('revise', { ...procInput, procedures, findings: findings.slice(0, 16), dagIssues })).procedures;
    run = await executeAll(ask, procedures, model.models, evidence.families, problems, [201, 202, 203, 204, 205, 206]);
  }
  const executorOf = id => { const xs = run.instances.filter(i => i.use === `procedure:${id}`); return { instances: xs.length, solved: count(xs, i => i.solved), stuck: xs.flatMap(i => i.stuck.map(st => ({ instance: i.id, ...st }))) }; };
  procedures = procedures.map(p => ({ ...p, executor: executorOf(p.id), dag: dagProblems(p) }));
  const models = model.models.map(m => { const sim = run.instances.find(i => i.use === `model:${m.id}`); return { ...m, simulation: sim ? { prompt: sim.prompt, expected: sim.expected, answer: sim.answer, matches: sim.solved, stuck: sim.stuck } : null }; });

  // 6. Explanations and readings last, from the verified record; then a skeptical review and one repair round.
  const explainInput = {
    ...base, results, problems: problems.map(({ id, kc, family, regime, level, prompt, answer, wrongAnswers }) => ({ id, kc, family, regime, level, prompt, answer, wrongAnswers })),
    wrongModels: wrongs.wrongModels.map(({ id, kc, belief, errorKind, plausibleBecause, repair, separatingProbe }) => ({ id, kc, belief, errorKind, plausibleBecause, repair, separatingProbe })),
    procedures, models: models.map(({ simulation, ...m }) => m), cases: model.cases, representations: model.representations, conflicts: model.conflicts, simplifications: model.simplifications, knownIds: input.knownIds,
  };
  const facts = { kcs, problems, wrongModels: wrongs.wrongModels, representations: model.representations, cases: model.cases, refs, known, blocks: new Map(input.passages.flatMap(p => p.blocks.map(b => [b.ref, b.text]))) };
  const explainDraft = await ask('explain', explainInput);
  let explained = checkExplain(explainDraft, facts);
  const draftModel = { results, problems, wrongModels: wrongs.wrongModels, procedures, models, cases: model.cases, representations: model.representations, explanations: explained.explain.explanations, readings: explained.explain.readings };
  const review = await ask('review', { topic: input.topic.title, model: draftModel });
  const reviewIssues = [...review.unanswerable.map(u => `a struggling student would ask "${u.question}" and the model cannot answer it (${u.why})`), ...review.stall.map(x => `a novice would stall at ${x.where}, "${x.step}": ${x.why}`)];
  if (explained.issues.length || reviewIssues.length) {
    log.push(...explained.issues.map(x => `explain: ${x}`), ...reviewIssues.map(x => `review: ${x}`));
    const again = checkExplain(await ask('explain', { ...explainInput, repair: { draft: explainDraft, issues: [...explained.issues, ...reviewIssues].slice(0, 20) } }), facts);
    if (again.issues.length <= explained.issues.length) explained = again;
    log.push(...explained.issues.map(x => `explain after repair: ${x}`));
  }

  // The slice of the course model (§7 field names), then grounding against the materials.
  let study = {
    title: input.topic.title, adapters, spine: results.spine, matters: results.matters, interactivity: results.interactivity, enduring: results.enduring, essentialQuestions: results.essentialQuestions, threshold: results.threshold, inventory: results.inventory,
    kcs, models, cases: model.cases, procedures, families: evidence.families, wrongModels: wrongs.wrongModels,
    probes: evidence.probes.map(({ id, kc, adapter, family, regime, form, level, familyId, verifierChain, prompt }) => ({ id, kc, adapter, family, regime, form, level, familyId, prompt, verifierChain })),
    problems, taskLadder: evidence.taskLadder, representations: model.representations, explanations: explained.explain.explanations, readings: explained.explain.readings,
    gapsInNotes: explained.explain.gapsInNotes, links: explained.explain.links, route: explained.explain.route, conflicts: model.conflicts, simplifications: model.simplifications,
  };
  const { findings: groundFindings } = await ask('ground', { passages: input.passages, claims: claimsOf(study) });
  study = JSON.parse(JSON.stringify(study));
  // Where the model is right and the materials are not, that is recorded as a conflict for the tutor to raise, never "fixed".
  for (const f of groundFindings.filter(x => x.kind === 'correction' && refs.has(x.ref))) study.conflicts.push({ where: f.ref, materialsSay: f.materialsSay ?? f.problem, truth: String(pathGet(study, f.path) ?? f.problem), verifiedBy: 'grounding' });
  const applied = groundFindings.filter(f => f.kind !== 'correction' && applyFinding(study, f));
  for (const k of ['enduring', 'kcs', 'explanations', 'wrongModels', 'models', 'cases', 'representations', 'gapsInNotes', 'simplifications', 'readings']) study[k] = study[k].filter(Boolean);

  // Every KC, explanation and wrong model keeps its source passages (anchors and verbatim text): the course's own wording is
  // primary for anything about what the course says.
  study = attachSources(study, input.passages);

  // The ablation (spec §7 stage 11).
  const ablation = await ablate(ask, study, { title: input.topic.title, passages: input.passages }, (await probing).probes);

  // Verifier self-tests: every keyed problem accepts its key in several phrasings and rejects each wrong model's answer by name.
  for (const p of study.problems) p.selfTest = await selfTestItem(p);
  const tested = study.problems.filter(p => p.selfTest?.pass !== null && p.selfTest?.pass !== undefined);

  // The gate (§7 stage 10): seven checks and the verifier self-tests, each with its numbers.
  const steps = procedures.flatMap(stepsOf), finalRun = run.instances.filter(i => i.use.startsWith('procedure:'));
  const familiesCovered = [...new Set(study.problems.map(p => p.family))];
  const verifiable = study.problems.filter(p => !['R4', 'R5'].includes(p.regime));
  const gate = {
    execution: { ...evidence.stats, problems: study.problems.length, verified: count(verifiable, p => p.verification?.ok === true), verifiable: verifiable.length, judgedAtUse: study.problems.length - verifiable.length, pass: verifiable.length > 0 && verifiable.every(p => p.verification?.ok !== false) && count(verifiable, p => p.verification?.ok === true) >= 0.8 * verifiable.length },
    novelInstances: { instances: finalRun.length, solved: count(finalRun, i => i.solved), firstRound: { instances: count(firstRun.instances, i => i.use.startsWith('procedure:')), solved: count(firstRun.instances, i => i.use.startsWith('procedure:') && i.solved) }, stuck: finalRun.flatMap(i => i.stuck.map(st => ({ instance: i.id, ...st }))), dag: procedures.flatMap(p => p.dag), modelSimulations: { run: count(models, m => m.simulation), matched: count(models, m => m.simulation?.matches) }, pass: !needsProcedures || (finalRun.length > 0 && count(finalRun, i => i.solved) >= 0.8 * finalRun.length && !procedures.some(p => p.dag.length)) },
    diagnosticity: { wrongModels: study.wrongModels.length, byDetector: Object.fromEntries(['execute', 'pattern', 'constraint', 'rubric'].map(t => [t, count(study.wrongModels, w => w.detector.type === t)])), rubricUncalibrated: count(study.wrongModels, w => w.detector.type === 'rubric' && !w.detector.judge), dropped: wrongs.dropped, byErrorKind: Object.fromEntries([...new Set(study.wrongModels.map(w => w.errorKind))].map(k => [k, count(study.wrongModels, w => w.errorKind === k)])), pass: study.wrongModels.length >= 2 },
    facetCoverage: { covered: familiesCovered.sort(), missing: CORE_FAMILIES.filter(f => !familiesCovered.includes(f)), regimes: Object.fromEntries(Object.keys(REGIMES).map(r => [r, count(study.problems, p => p.regime === r)])), adapters: Object.fromEntries(adapters.map(a => [a, count(study.problems, p => p.adapter === a)])), pass: CORE_FAMILIES.every(f => familiesCovered.includes(f)) },
    generative: { elements: count(study.representations, r => r.element), elementsVerified: count(study.representations, r => r.elementVerified === true), signatures: study.wrongModels.length, wrongAnswers: count(study.problems, p => Object.keys(p.wrongAnswers || {}).length), cues: count(steps, x => x.cue), notices: study.models.reduce((n, m) => n + m.notice.length, 0) + study.representations.reduce((n, r) => n + r.notice.length, 0), novelSolved: count(finalRun, i => i.solved), bridgeProbes: count(study.problems, p => p.family === 'E7'), mechanisms: count(study.explanations, e => e.mechanism.length > 80), cases: study.cases.length, readings: study.readings.length, explainers: count(study.readings, r => r.source === 'explainer'), refutations: count(study.readings, r => r.refutes) },
    review: { unanswerable: review.unanswerable.length, stall: review.stall.length, findings: [...review.unanswerable.map(u => u.question), ...review.stall.map(x => `${x.where}: ${x.step}`)], repaired: reviewIssues.length > 0, pass: true },
    fidelity: { audited: model.audit.length, executed: count(model.audit, a => a.by !== 'model'), conflicts: study.conflicts.length, simplifications: study.simplifications.length, pass: model.audit.length > 0 || study.simplifications.length > 0 },
    verifierSelfTest: { items: tested.length, passed: count(tested, p => p.selfTest.pass), failures: tested.filter(p => !p.selfTest.pass).map(p => ({ id: p.id, failures: p.selfTest.failures })), keyed: count(study.problems, p => p.key), pass: tested.every(p => p.selfTest.pass) },
  };
  gate.generative.pass = gate.generative.signatures > 0 && gate.generative.notices > 0 && gate.generative.bridgeProbes > 0 && gate.generative.mechanisms > 0 && gate.generative.readings > 0 && (!needsProcedures || (gate.generative.cues > 0 && gate.generative.novelSolved > 0));
  gate.pass = Object.values(gate).every(g => g.pass);
  study.quality = { gate, ablation, grounding: applied.map(({ path, problem, fix }) => ({ path, problem, fixed: !!fix })), regurgitation: regurgitation(study, input.passages), log };
  return { study, log };
}

export { STUDY_VERSIONS };
