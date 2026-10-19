import { s, validate } from '../core/shape.mjs';
import { words } from '../core/match.mjs';
import { AppError } from '../core/errors.mjs';
import { call } from '../providers/contracts.mjs';
import { ELEMENTS, validateElement } from '../../shared/elements/index.mjs';
import { GENERATABLE, accept, generateKey } from '../../shared/elements/generate.mjs';

// Tutor-made elements (shared/elements): one awaited call makes a visual for a live session, grounded in the
// course, checked by its kind's validator and repaired once if that fails. Nothing is stored: the page shows it
// and the agent hears its summary. Same shape as session drawings(), a live model call outside the job queue.
// ponytail: a visual in flight when the server restarts is lost (the page's timeout tells Plato); a durable job
// (priority 45, maxAttempts 1, its handler emitting the failure) is the upgrade if that ever matters.

const KINDS = Object.keys(ELEMENTS);
const CREATE = s.object({
  request: s.string({ min: 1, max: 600 }), kind: s.nullable(s.enum(KINDS)),
  recent: s.array(s.object({ speaker: s.string({ min: 1, max: 20 }), text: s.string({ max: 1000 }) }), { max: 8 }),
}, { optional: ['kind', 'recent'] });
export const elementSchema = kinds => s.object({ kind: s.enum(kinds), title: s.string({ max: 80 }), summary: s.string({ max: 300 }), spec: s.json() });
const NOTES = s.object({ query: s.string({ min: 1, max: 300 }) });
/** An element made on demand (shared/elements/generate.mjs), as the model returns it. */
export const GENERATED = s.object({
  title: s.string({ max: 80 }), summary: s.string({ max: 300 }), state: s.json(), ask: s.string({ max: 300 }),
  checkpoints: s.array(s.object({ at: s.string({ min: 1, max: 80 }), predict: s.array(s.string({ min: 1, max: 60 }), { min: 1, max: 6 }) }), { max: 3 }),
  target: s.nullable(s.json()), rubric: s.array(s.string({ max: 160 }), { max: 6 }), answerName: s.nullable(s.string({ max: 80 })),
  theirs: s.nullable(s.json()), difference: s.nullable(s.string({ max: 200 })),
});
const GENERATE = s.object({
  kind: s.enum(GENERATABLE), mode: s.enum(['predict', 'change', 'construct', 'compare', 'explain', 'teach', 'draw']),
  kc: s.object({ id: s.string({ max: 200 }), statement: s.string({ min: 1, max: 1000 }), kind: s.nullable(s.string({ max: 40 })) }, { optional: ['kind'] }),
  case: s.object({ id: s.nullable(s.string({ max: 200 })), prompt: s.string({ max: 4000 }), key: s.json() }, { optional: ['id', 'key'] }),
  wrongModel: s.nullable(s.object({ id: s.string({ max: 200 }), belief: s.string({ min: 1, max: 1000 }), answer: s.json() }, { optional: ['answer'] })),
  notes: s.array(s.string({ max: 4000 }), { max: 6 }),
}, { optional: ['case', 'wrongModel', 'notes'] });
// Words as knowledge retrieval matches them (backend/knowledge/read.mjs): three letters or more, a plural's s dropped;
// less the ones too common to say what a query is about.
// The part of an excerpt about the query: from the start of the sentence (or line) where one of its words first
// appears, about `max` characters, cut at a word.
function passage(text, want, max = 420) {
  const body = String(text).trim();
  if (body.length <= max) return body;
  const lower = body.toLowerCase(), hits = [...want].map(w => lower.indexOf(w)).filter(i => i >= 0), hit = hits.length ? Math.min(...hits) : 0;
  let start = 0;
  for (const m of body.slice(0, hit).matchAll(/[.!?]\s+|\n+/g)) start = m.index + m[0].length;
  const cut = start + max >= body.length ? body.length : body.lastIndexOf(' ', start + max);
  const end = cut > start ? cut : start + max;
  return `${start ? '… ' : ''}${body.slice(start, end).trim()}${end < body.length ? ' …' : ''}`;
}
// The page gives up at 60 s; a repair runs only with 15 s still left.
const BUDGET_MS = 55_000, FIRST_MS = 45_000, REPAIR_MS = 15_000;

export function installElements(app) {
  const { clock } = app;

  async function make(request) {
    const result = await call(app.providers.elementMaker.make, request, { valueSchema: elementSchema(request.kind ? [request.kind] : KINDS), what: 'element' });
    if (result.outcome === 'ok') return result.value;
    const e = result.error || {};
    throw new AppError(e.code || 'provider_unavailable', e.message || 'The visual could not be made.', { retryable: e.retryable });
  }
  const finished = made => {
    try { return { elementId: app.id('elm'), kind: made.kind, title: made.title, summary: made.summary, spec: validateElement(made.kind, made.spec) }; }
    catch (problem) { throw new AppError('quality_gate', problem.message); }
  };

  async function create(principal, sessionId, body) {
    validate(CREATE, body);
    const session = app.services.session.get(principal, sessionId);
    if (session.status === 'ended') throw new AppError('invalid_input', 'This session has ended.');
    return build(session, body);
  }
  /** One element for a session, grounded in its topic (v9: the director's cards build theirs this way, ahead of the answer). */
  async function build(session, body) {
    const scope = { ...session.scope }, knowledge = app.services.knowledge;
    const topic = session.activeTopicId ? knowledge.view(scope, session.pinnedKnowledgeManifestId).topics.find(t => t.topicId === session.activeTopicId) : null;
    let found = { excerpts: [], interpretations: [] };
    try { found = knowledge.retrieve(scope, session.pinnedKnowledgeManifestId, { topicIds: topic ? [topic.topicId] : [], objectiveVersionIds: [], anchorIds: [], query: body.request, relationTypes: [], reason: 'element', maxTokens: 2000 }); } catch { /* grounding is best-effort */ }
    const deadline = clock.now() + BUDGET_MS, input = {
      request: body.request, kind: body.kind ?? null, course: app.db.get('exams', scope.examId, scope)?.title ?? null, topic: topic?.title ?? null,
      recentDialogue: (body.recent || []).map(r => `${r.speaker}: ${r.text}`), grounding: [...found.excerpts.map(e => e.text), ...found.interpretations.map(i => i.text)],
      signal: AbortSignal.timeout(BUDGET_MS), // queueing for the lane counts too
    };
    // A spec its validator rejects, or output that missed the shape (a title too long), gets one repair.
    let made;
    try { return finished(made = await make({ ...input, timeoutMs: FIRST_MS })); } catch (problem) {
      const left = deadline - clock.now();
      if (problem.code !== 'quality_gate' || left < REPAIR_MS) throw problem;
      return finished(await make({ ...input, timeoutMs: left, repair: { rejectedSpec: made && String(made.spec).slice(0, 49_152), problem: problem.message } }));
    }
  }

  // What the student's own notes say about something (show_from_notes): the course excerpts that match the query best,
  // found lexically at once (no model call), at most two, each with the file it comes from. A weak match (one word of
  // a longer query) is no match.
  function notes(principal, sessionId, body) {
    validate(NOTES, body);
    const session = app.services.session.get(principal, sessionId), scope = { ...session.scope }, want = words(body.query);
    let found = { excerpts: [] };
    if (want.size) try { found = app.services.knowledge.retrieve(scope, session.pinnedKnowledgeManifestId, { topicIds: [], objectiveVersionIds: [], anchorIds: [], query: [...want].join(' '), relationTypes: [], reason: 'notes', maxTokens: 4000 }); } catch { /* no course knowledge yet */ }
    const strong = found.excerpts.filter(e => { const has = words(e.text); return [...want].filter(w => has.has(w)).length >= Math.min(2, want.size); });
    return { excerpts: strong.slice(0, 2).map(e => ({ text: passage(e.text, want), source: app.services.knowledge.sourceTitle(scope, e.sourceVersionId), anchorId: e.anchorId })) };
  }

  /**
   * An element made for a move (shared/elements/generate.mjs): { kind, mode, kc: { id, statement }, case?: { id?, prompt,
   * key? }, wrongModel?: { id, belief, answer? }, notes?: course excerpts } → { spec, title, summary, answerName,
   * attempts } or null. The spec validates, runs through its checkpoints, and computes the case's key where one is given;
   * with a wrong model it is the repair compare (their rule beside the truth). One repair, then null. Cached per course,
   * KC, case, kind, mode and wrong model (a failure too, so a move falls back at once next time); calls in flight are
   * shared. ponytail: an in-memory cache, emptied by a restart; persist it if regenerating after restarts costs too much.
   */
  const made = new Map(), rejected = new Map(); // key → its call; key → why each attempt was rejected
  function generate(scope, request) {
    validate(GENERATE, request);
    const key = generateKey(scope?.examId, request);
    if (!made.has(key)) made.set(key, attempt(request, rejected.set(key, []).get(key)).catch(() => null));
    return made.get(key);
  }
  /** Why the attempts at a request were rejected (the leak check, a key mismatch, …), for logs and evals. */
  const problems = (scope, request) => rejected.get(generateKey(scope?.examId, request)) || [];
  async function attempt(request, why) {
    const input = { kind: request.kind, mode: request.mode, kc: request.kc, case: request.case ?? null, wrongModel: request.wrongModel ?? null, notes: request.notes ?? [], repair: null };
    for (let attempts = 1; attempts <= 2; attempts++) {
      const result = await call(app.providers.elementMaker.generate, input, { valueSchema: GENERATED, what: 'generated element' });
      if (result.outcome !== 'ok') { why.push(result.error?.message || 'the output was malformed'); input.repair = { problem: why.at(-1) }; continue; }
      try { return { ...accept(result.value, request), attempts, rejected: [...why] }; }
      catch (problem) { why.push(problem.message); input.repair = { problem: problem.message, rejected: { state: String(result.value.state ?? '').slice(0, 16_000), checkpoints: result.value.checkpoints, answerName: result.value.answerName } }; }
    }
    return null;
  }

  app.services.elements = { create, notes, build, generate, problems };
}
