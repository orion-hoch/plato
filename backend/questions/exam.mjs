import { AppError, issue } from '../core/errors.mjs';
import { words, looksLikeExam } from '../core/match.mjs';
import { newId } from '../core/util.mjs';
import { s } from '../core/shape.mjs';
import { call, ok } from '../providers/contracts.mjs';
import { validate as traceSpec, steps as traceSteps } from '../../shared/elements/trace.mjs';
import { ANSWER_KINDS, EXAM_DRAFT, buildExamOutput, numberIn, sameExact } from './records.mjs';

// The exam author (v4 contract, "Exam-level questions"): plan → author → an independent solve that never sees the
// reference → compare. Where it is cheap an answer is computed instead of trusted: RISC-V checks run on the page's own
// interpreter (shared/elements/trace.mjs), C checks in the sandbox (backend/run). The bar is a real prelim: the course's
// own past exam problems are the exemplars when it has them, and a problem the solver finishes in a step or two per part
// is too easy. Disagreement or a too-easy problem gets one repair round; one that still fails is discarded, never
// shipped. The question service then runs the usual validators.

export const EXAM_PLAN = s.object({
  title: s.string({ min: 1, max: 160 }), archetype: s.string({ min: 1, max: 300 }),
  objectiveIds: s.array(s.string(), { min: 1, max: 4 }), scenario: s.string({ min: 1, max: 3000 }),
  parts: s.array(s.object({ focus: s.string({ min: 1, max: 600 }), objectiveId: s.string(), answerKind: s.enum(ANSWER_KINDS) }), { min: 2, max: 6 }),
  estimatedMinutes: s.int({ min: 5, max: 45 }),
});
export const EXAM_SOLUTION = s.object({ answers: s.array(s.object({ partId: s.string({ min: 1, max: 2 }), work: s.string({ max: 8000 }), answer: s.string({ max: 8000 }) }), { max: 6 }) });
// steps: how many distinct reasoning steps the solver's work on a part took (the difficulty check).
export const EXAM_VERDICT = s.object({ parts: s.array(s.object({ partId: s.string({ min: 1, max: 2 }), agree: s.bool(), problem: s.string({ max: 1200 }), steps: s.int({ min: 0, max: 10_000 }) }), { max: 6 }) });

const PART_IDS = 'abcdefgh';
// A file or problem from a past exam: looksLikeExam by its name or title, or an exam named in its text.
const EXAM_TEXT = /\b(prelim|midterm|exam)s?\b/i;
const quote = (text, max = 300) => { const t = String(text ?? ''); return JSON.stringify(t.length > max ? `${t.slice(0, max - 1)}…` : t); };
const lines = text => String(text).replace(/\r/g, '').split('\n').map(l => l.trimEnd()).join('\n').trim();
const INT = /^([+-]?)(0x[\da-f]+|0b[01]+|\d+)$/i;
const int64 = text => { const m = INT.exec(String(text ?? '').trim().replace(/_/g, '')); return m ? BigInt.asUintN(64, (m[1] === '-' ? -1n : 1n) * BigInt(m[2])) : null; };
let runC = null;

/** One exam problem → CallResult<{ question, rubric }>. Throws AppError; the question service records the outcome. */
export async function authorExam(app, input) {
  const author = app.providers.examAuthor;
  if (!author) throw new AppError('provider_unavailable', 'No exam author is configured.', { retryable: false });
  const runs = [];
  const step = async (fn, request, valueSchema, what) => {
    const result = await call(fn, request, { valueSchema, what });
    runs.push(...(result.providerRuns || []));
    if (result.outcome !== 'ok') { const e = result.error || {}; throw new AppError(e.code || 'provider_unavailable', e.message || `The ${what} failed.`, { retryable: e.retryable ?? true }); }
    return result.value;
  };
  // From the course (queueCourseProblem): the problem is given, so there is nothing to plan and no bar to raise.
  const courseProblem = app.db.get('question_generation_requests', input.generationRequestId)?.fromCourse ?? null;
  const exemplars = courseProblem ? [] : exemplarsOf(app, input);
  const plan = courseProblem ? null : await step(author.plan, { ...input, exemplars }, EXAM_PLAN, 'exam plan');
  let draft = grounded(await step(author.author, { ...input, exemplars, plan, courseProblem, repair: null }, EXAM_DRAFT, 'exam draft'), input);
  let issues = await review(author, input, draft, step, { gate: !courseProblem });
  if (issues.length) {
    draft = grounded(await step(author.author, { ...input, exemplars, plan, courseProblem, repair: { draft, issues: issues.map(({ partId, problem }) => ({ partId, problem })) } }, EXAM_DRAFT, 'exam repair'), input);
    // After the repair only what is wrong or too easy discards it; a part still short of the bar does not.
    issues = (await review(author, input, draft, step, { gate: !courseProblem })).filter(i => i.blocking !== false);
    if (issues.length) throw new AppError('quality_gate', `Exam problem discarded after its repair round (${said(issues[0])})`, { retryable: false, issues: issues.map(i => issue(i.code || 'exam_disagreement', said(i), { severity: 'blocking' })) });
  }
  if (!courseProblem) return ok(buildExamOutput(input, draft, app.clock), { providerRuns: runs });
  // The source is linked under the setup (a [src:…] ref resolves to the passage) and on the record.
  const p = courseProblem, out = buildExamOutput(input, { ...draft, setup: `${draft.setup}\n\n_Source: ${p.file}${p.page ? `, p. ${p.page}` : ''} [src:${p.sourceRef}]_` }, app.clock);
  out.question.fromCourse = { itemId: p.itemId, sourceRef: p.sourceRef, title: p.title, file: p.file };
  return ok(out, { providerRuns: runs });
}

// ---------- From the course (v7, backend/ingest) ----------
// A problem from the student's own materials (a pset) becomes an exam problem in the unit's pool: its own text is the
// setup and parts, the reference answer is written from the given solution when there is one, and the independent solve
// and compare check it like any other. Below the unit pools (5): practice from new material is never urgent.
const COURSE_PRIORITY = 2;

/** Queue one course problem { itemId, title, markdown, solution, sourceRef, file } under the unit `topicId`. Once per item. */
export function queueCourseProblem(app, scope, { topicId, knowledgeManifestId, problem }) {
  const { db, clock, jobs } = app;
  return db.tx(() => {
    const prior = db.find('question_generation_requests', { origin: 'generic_hopper', topicId }, { scope }).find(r => r.fromCourse?.itemId === problem.itemId);
    if (prior) return prior;
    const request = {
      id: newId('qgen'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, origin: 'generic_hopper', state: 'queued', format: 'exam',
      topicId, slot: null, objectiveVersionIds: null, narrowTarget: problem.title, intendedDifficulty: 'application', knowledgeManifestId,
      sessionId: null, turnId: null, questionId: null, error: null, attempts: 0, fromCourse: problem,
    };
    db.insert('question_generation_requests', request);
    jobs.enqueue({ scope, type: 'author_exam_question', idempotencyKey: `gen:${request.id}`, payload: { generationRequestId: request.id }, priority: COURSE_PRIORITY });
    return request;
  });
}

const said = i => i.partId ? `part ${i.partId}: ${i.problem}` : i.problem;

/**
 * Up to 3 problems from the course's own past exams to calibrate on: the unit's own first (those nearest narrowTarget,
 * spread over files), then, when the unit has fewer than two, other units' for the bar alone. [] when there are none.
 */
function exemplarsOf(app, input) {
  const modules = app.services.modules, scope = input.work.scope;
  if (!modules) return [];
  try {
    const mine = new Set(input.subtopics.map(t => modules.moduleIdOf(t.topicId))), units = new Map(modules.index(scope).map(m => [m.moduleId, m]));
    const target = words(input.narrowTarget), seen = new Set(), found = [];
    for (const item of modules.items(scope).filter(i => i.kind === 'problem').sort((a, b) => mine.has(b.moduleId) - mine.has(a.moduleId))) {
      if (seen.has(item.sourceRef)) continue; // one item may sit in two modules: this unit's copy counts
      const file = (() => { try { return modules.source(scope, item.sourceRef, { context: false }).file; } catch { return null; } })();
      if (!looksLikeExam(`${file?.filename || ''} ${file?.title || ''} ${item.title}`) && !EXAM_TEXT.test(item.markdown)) continue;
      seen.add(item.sourceRef);
      const near = [...words(`${item.title} ${item.markdown}`)].filter(w => target.has(w)).length;
      found.push({ item, file: file?.title || file?.filename || 'a past exam', own: mine.has(item.moduleId), near, unit: units.get(units.get(item.moduleId)?.unitId)?.title ?? null });
    }
    const pick = list => {
      const ranked = list.sort((a, b) => b.near - a.near), out = [], files = new Set();
      for (const x of ranked) if (!files.has(x.file) && out.length < 3) { out.push(x); files.add(x.file); } // one per file first
      for (const x of ranked) if (!out.includes(x) && out.length < 3) out.push(x);
      return out;
    };
    const own = pick(found.filter(x => x.own)), chosen = own.length >= 2 ? own : [...own, ...pick(found.filter(x => !x.own)).slice(0, 2 - own.length)];
    return chosen.map(x => ({ source: x.file, unit: x.own ? 'this unit' : `${x.unit || 'another unit'} (for the bar only, not the topic)`, title: x.item.title, problem: x.item.markdown.slice(0, 4000), solution: x.item.solution?.slice(0, 2500) ?? null }));
  } catch { return []; }
}

/** Anchors the author was not given are dropped (the question service rejects foreign evidence). */
function grounded(draft, input) {
  const given = new Set(input.sourceEvidence.map(e => e.anchor.id)), keep = ids => ids.filter(id => given.has(id));
  return { ...draft, sourceAnchorIds: keep(draft.sourceAnchorIds), parts: draft.parts.map(p => ({ ...p, criteria: p.criteria.map(c => ({ ...c, evidenceAnchorIds: keep(c.evidenceAnchorIds) })) })) };
}

/**
 * What is wrong with a draft, as [{ partId | null, problem, blocking? }]: its shape first, then machine checks, an
 * independent solve and the comparison, which also counts the solver's steps per part (`gate`: the prelim bar).
 */
async function review(author, input, draft, step, { gate = true } = {}) {
  const shape = shapeProblems(draft, input);
  if (shape.length) return shape;
  const checks = await machineChecks(draft);
  // The solver gets the problem as the student sees it: never the reference, the criteria or the checks.
  const problem = { title: draft.title, setup: draft.setup, parts: draft.parts.map(p => ({ id: p.id, prompt: p.prompt, points: p.points, answer: { kind: p.answerKind, language: p.language, choices: p.choices } })) };
  const solved = await step(author.solve, { work: input.work, problem }, EXAM_SOLUTION, 'independent solve');
  const issues = [], parts = [];
  for (const p of draft.parts) {
    const check = checks.get(p.id), theirs = solved.answers.find(a => a.partId === p.id);
    const same = sameExact(p.answerKind, theirs?.answer, p.expectedAnswer, (p.choices || []).map(c => c.id));
    if (check?.ok === false) issues.push({ partId: p.id, problem: `Machine check: ${check.note}.` });
    if (same === false) issues.push({ partId: p.id, problem: `The independent solve answered ${quote(theirs.answer)} where the reference says ${quote(p.expectedAnswer)}${check?.ok ? ' (the machine check agrees with the reference: make the setup state exactly what the check runs, or the prompt unambiguous)' : ''}.` });
    // settled: an exact comparison or a failed check already decided agreement; the comparer still counts the steps.
    parts.push({ partId: p.id, expectedAnswer: p.expectedAnswer, acceptableAlternatives: p.acceptableAlternatives, criteria: p.criteria.map(c => c.text), solverAnswer: theirs?.answer ?? '', solverWork: theirs?.work ?? '', machineCheck: check?.note ?? null, settled: same !== null || check?.ok === false });
  }
  if (!gate && parts.every(p => p.settled)) return issues;
  const verdict = await step(author.compare, { work: input.work, problem, parts }, EXAM_VERDICT, 'exam comparison');
  const of = id => verdict.parts.find(x => x.partId === id);
  for (const p of parts.filter(p => !p.settled)) if (!of(p.partId)?.agree) issues.push({ partId: p.partId, problem: of(p.partId)?.problem || 'The comparison gave no verdict for this part.' });
  if (!gate) return issues;
  const steps = draft.parts.map(p => [p.id, of(p.id)?.steps ?? null]).filter(([, n]) => n !== null);
  if (steps.length === draft.parts.length && steps.every(([, n]) => n <= 2)) issues.push({ partId: null, code: 'exam_too_easy', problem: `Too easy for a prelim: the independent solver finished every part in one or two steps (${steps.map(([id, n]) => `${id}: ${n}`).join(', ')}). Make the parts multi-step: a trace over several instructions or loop iterations, a derivation or code to write, two concepts combined and a trap students fall into, keeping each answer determined by the setup.` });
  else for (const [id, n] of steps) if (n <= 1) issues.push({ partId: id, code: 'exam_warm_up', blocking: false, problem: 'Answerable in one step, a warm-up: make it a step of real work (trace, derive, compute through a trap) or fold it into another part.' });
  return issues;
}

function shapeProblems(draft, input) {
  const out = [], given = new Set(input.objectives.map(o => o.id));
  draft.parts.forEach((p, i) => {
    const say = problem => out.push({ partId: p.id, problem });
    if (p.id !== PART_IDS[i]) say(`label the parts ${[...PART_IDS.slice(0, draft.parts.length)].join(', ')} in order`);
    if (p.criteria.some(c => !given.has(c.objectiveVersionId))) say('a criterion names an objective id that was not given');
    if (p.answerKind === 'number' && numberIn(p.expectedAnswer) === null) say('a number part needs a plain decimal number as its expectedAnswer');
    if (p.answerKind === 'choice' && !(p.choices?.length >= 2 && new Set(p.choices.map(c => c.id)).size === p.choices.length && p.choices.some(c => c.id === p.expectedAnswer.trim()))) say('a choice part needs two or more choices with distinct ids, and its expectedAnswer must be the id of the right one');
    if (p.answerKind === 'code' && !p.language) say('a code part needs its language (c or riscv)');
    if (p.check?.kind === 'riscv' && !p.check.expectRegisters.length) say('a riscv check needs the expected final registers');
    if (p.check?.kind === 'c' && !p.check.expectOutput.trim()) say('a c check needs the exact output it prints');
  });
  return out;
}

/** Each part's check, run: Map partId → { ok: true | false | null (it cannot run here), note }. */
async function machineChecks(draft) {
  const out = new Map();
  for (const p of draft.parts.filter(p => p.check)) out.set(p.id, await runCheck(p.check));
  return out;
}

/** One check (records.mjs CHECK), run: { ok: true | false | null (it cannot run here), note }. Also the Studies' (backend/understanding). */
export async function runCheck(c) {
  try {
    if (c.kind === 'riscv') {
      const spec = traceSpec({ lang: 'riscv', code: c.code, watch: c.expectRegisters.map(r => r.name), init: { regs: Object.fromEntries(c.initRegisters.map(r => [r.name, r.value])), memory: c.initMemory } });
      const end = traceSteps(spec).at(-1).vars, got = r => end.find(v => v.name === r.name)?.value;
      const wrong = c.expectRegisters.filter(r => int64(got(r)) === null || int64(got(r)) !== int64(r.value));
      return { ok: !wrong.length, note: wrong.length ? `running the RISC-V check ends with ${wrong.map(r => `${r.name} = ${got(r)}`).join(', ')}, not ${wrong.map(r => `${r.name} = ${r.value}`).join(', ')}` : `the RISC-V check ends with ${c.expectRegisters.map(r => `${r.name} = ${got(r)}`).join(', ')}, as the reference says` };
    }
    const ran = await sandboxed({ source: c.code, stdin: c.stdin });
    if (!ran) return { ok: null, note: null };
    const same = ran.phase === 'run' && !ran.timedOut && lines(ran.stdout) === lines(c.expectOutput);
    return { ok: same, note: ran.phase === 'compile' ? `the C check does not compile: ${quote(ran.stderr, 600)}` : ran.timedOut ? 'the C check did not finish within 2 seconds' : same ? 'the C check prints exactly the expected output' : `the C check prints ${quote(ran.stdout)}, not ${quote(c.expectOutput)}` };
  } catch (error) { return { ok: false, note: String(error.message).slice(0, 600) }; } // "Invalid trace: …" says what to fix
}

/** The C sandbox, or null when it cannot run here (no sandbox-exec): that check is skipped, never faked. */
async function sandboxed(job) {
  try { runC ??= (await import('../run/index.mjs')).runC; return await runC(job); } catch { return null; }
}
