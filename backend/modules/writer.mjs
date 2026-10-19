import { s } from '../core/shape.mjs';
import { newId } from '../core/util.mjs';
import { call, unwrap, workIdentity } from '../providers/contracts.mjs';
import { clip, conceptIdOf, refOf, RELATIONS } from './outline.mjs';

// Astra writes one unit per job (build_modules, heavy model at high effort): the unit's summary and exam goals,
// and for the unit and every topic and subtopic in it, its summary, concepts (cited, with search terms and typed links
// to other concepts or topics of the course), example, mistakes and exam goal. Up to 4 units of an exam at once, each
// claimed by its job; the current goal's unit first. A unit that fails is tried once more at the end; its outline stands.

const PARALLEL = 4; // half the heavy lane (server/runtime.mjs: limit 8) and half the 8 job workers; plan_turn has its own lane.
const CLAIM_MS = 20 * 60_000; // a claim older than this belongs to a job that died
const ANCHORS = s.array(s.string({ min: 1, max: 80 }), { max: 8 });
const CONCEPT = s.object({
  key: s.string({ min: 1, max: 24 }), statement: s.string({ min: 1, max: 420 }), anchorIds: ANCHORS, terms: s.array(s.string({ min: 1, max: 48 }), { max: 4 }),
  links: s.array(s.object({ to: s.string({ min: 1, max: 120 }), relation: s.enum(RELATIONS), why: s.string({ min: 1, max: 300 }) }), { max: 4 }),
});
export const MODULE_DRAFT = s.object({
  summary: s.string({ min: 1, max: 700 }), examGoals: s.array(s.string({ min: 1, max: 260 }), { min: 1, max: 6 }), concepts: s.array(CONCEPT, { max: 4 }),
  topics: s.array(s.object({
    moduleId: s.string({ min: 1, max: 80 }), summary: s.string({ min: 1, max: 500 }), concepts: s.array(CONCEPT, { max: 7 }),
    example: s.nullable(s.object({ title: s.string({ min: 1, max: 120 }), markdown: s.string({ min: 1, max: 2000 }), anchorIds: ANCHORS })),
    misconceptions: s.array(s.object({ text: s.string({ min: 1, max: 300 }), fix: s.string({ min: 1, max: 300 }) }), { max: 4 }),
    examGoal: s.string({ min: 1, max: 260 }),
  }), { max: 60 }),
});
const EXCERPT_CHARS = 40_000;

export function installModuleWriter(app, { anchorInfo, examDayOf }) {
  const { db, clock, jobs } = app;
  const nodesOf = scope => app.services.modules.ensure(scope);
  const free = (scope, units) => units.filter(u => u.source !== 'astra' && (u.astraFailures || 0) < 2 && !(u.claimedBy && clock.now() - Date.parse(u.claimedAt) < CLAIM_MS))
    .sort((a, b) => (a.astraFailures || 0) - (b.astraFailures || 0));

  /** Up to PARALLEL build_modules jobs for the exam, one per unit still to write (`except`: the job asking, about to end). */
  function start(scope, manifestId, except = null) {
    return db.tx(() => {
      const active = db.find('jobs', { examId: scope.examId, type: 'build_modules', state: ['queued', 'running', 'retry_wait'] }).filter(j => j.id !== except);
      const waiting = active.filter(j => j.state !== 'running').length, todo = free(scope, nodesOf(scope).filter(m => m.kind === 'unit')).length;
      // Jobs still waiting will each claim one of the free units.
      for (let i = 0; i < Math.min(PARALLEL - active.length, todo - waiting); i++) jobs.enqueue({ scope, type: 'build_modules', idempotencyKey: `build_modules:${manifestId}:${newId('w')}`, payload: { manifestId }, priority: 8 });
    });
  }

  /** What Astra reads for one unit: every node in it with objectives, claims and typed links, link targets, and the excerpts. */
  function inputFor(scope, view, unit, nodes, all) {
    const inside = nodes.filter(n => n.id !== unit.id);
    const linked = id => [...new Set(view.evidenceLinks.filter(l => l.topicId === id).map(l => l.sourceAnchorId))];
    const claimsOf = id => { const mine = new Set(linked(id)); return view.interpretations.flatMap(i => i.claims || []).filter(c => c.kind !== 'assumption' && c.evidence.some(e => mine.has(e.id))).slice(0, 14).map(c => ({ text: clip(c.text, 400), kind: c.kind, anchorIds: c.evidence.map(e => e.id) })); };
    const objectives = id => view.objectives.filter(o => o.topicId === id).map(o => ({ statement: o.statement, successCriteria: o.successCriteria }));
    const titleOf = id => all.find(m => m.id === id)?.title ?? id;
    const node = n => ({ moduleId: n.id, parentId: n.parentId, depth: n.depth, title: n.title, description: view.topics.find(t => t.topicId === n.topicId)?.description ?? null, objectives: objectives(n.topicId), claims: claimsOf(n.topicId), links: n.links.map(l => ({ to: l.to, toTitle: titleOf(l.to), relation: l.relation, direction: l.dir, explanation: l.why })) });
    const info = anchorInfo(scope, [...new Set(nodes.flatMap(n => linked(n.topicId)))]);
    let room = EXCERPT_CHARS;
    const excerpts = [...info].filter(([, x]) => x.excerpt).map(([anchorId, x]) => ({ anchorId, lecture: x.lecture, section: x.section, text: x.excerpt })).filter(e => (room -= e.text.length) >= 0);
    const outside = new Set(nodes.flatMap(n => n.links.map(l => l.to)).filter(id => !nodes.some(n => n.id === id)));
    return {
      course: { exam: db.get('exams', scope.examId, scope)?.title ?? null, examDate: examDayOf(scope), lectures: unit.lectures },
      unit: node(unit), topics: inside.map(node),
      targets: all.map(m => ({ id: m.id, title: m.title, unit: all.find(u => u.id === m.unitId)?.title })),
      nearbyConcepts: all.filter(m => outside.has(m.id)).flatMap(m => (m.concepts || []).map(c => ({ id: c.id, topic: m.title, statement: clip(c.statement, 200) }))).slice(0, 40),
      excerpts,
    };
  }

  /** The draft against what was given: known topics, cited anchors, link targets that exist. Problems feed one repair round. */
  function check(draft, input, info, examDay, all) {
    const issues = [], given = new Set(input.excerpts.map(e => e.anchorId)), topicIds = new Set(input.topics.map(t => t.moduleId));
    const nodeIds = new Set(all.map(m => m.id)), nearby = new Set(input.nearbyConcepts.map(c => c.id));
    const by = g => /^by\b/i.test(g) ? g : `By ${examDay || 'the exam'}: ${g}`;
    const topicOf = id => id === input.unit.moduleId ? input.unit : input.topics.find(t => t.moduleId === id);
    const groups = [[input.unit.moduleId, draft.concepts], ...draft.topics.filter(t => topicIds.has(t.moduleId)).map(t => [t.moduleId, t.concepts])];
    for (const t of draft.topics) if (!topicIds.has(t.moduleId)) issues.push(`topic ${t.moduleId} is not in this unit`);
    // Concepts first (keys resolve to ids), then their links.
    const keys = new Map(), made = new Map();
    for (const [moduleId, concepts] of groups) {
      const topicId = moduleId.slice(4), kept = [];
      for (const c of concepts) {
        const anchorIds = c.anchorIds.filter(a => given.has(a));
        if (!anchorIds.length) { issues.push(`${topicOf(moduleId)?.title}: "${clip(c.statement, 50)}" cites no given excerpt`); continue; }
        const concept = { id: conceptIdOf(topicId, c.statement), statement: c.statement, lecture: info.get(anchorIds[0])?.lecture ?? null, sourceRef: refOf(anchorIds[0]), anchorIds, terms: c.terms, links: c.links };
        if (!keys.has(c.key)) keys.set(c.key, concept.id);
        kept.push(concept);
      }
      made.set(moduleId, kept);
    }
    let dropped = 0;
    for (const kept of made.values()) for (const c of kept) {
      const resolved = c.links.map(l => ({ ...l, to: keys.get(l.to) || (nearby.has(l.to) || nodeIds.has(l.to) ? l.to : null) }));
      c.links = resolved.filter(l => l.to && l.to !== c.id);
      dropped += resolved.length - c.links.length;
    }
    if (dropped > 3) issues.push(`${dropped} links point to no concept key, given concept id or course topic id`);
    const missing = input.topics.filter(t => !made.get(t.moduleId)?.length).map(t => t.title);
    if (missing.length) issues.push(`no cited concepts for: ${missing.join(', ')}`);
    const topics = new Map(draft.topics.filter(t => topicIds.has(t.moduleId)).map(t => {
      const anchorIds = t.example?.anchorIds.filter(a => given.has(a)) || [];
      return [t.moduleId, { summary: t.summary, concepts: made.get(t.moduleId), misconceptions: t.misconceptions, examGoal: by(t.examGoal), example: anchorIds.length ? { title: t.example.title, markdown: t.example.markdown, lecture: info.get(anchorIds[0])?.lecture ?? null, sourceRef: refOf(anchorIds[0]), anchorIds } : null }];
    }));
    return { issues, value: { summary: draft.summary, examGoals: draft.examGoals.map(by), concepts: made.get(input.unit.moduleId), topics } };
  }

  jobs.register('build_modules', async (payload, ctx) => {
    const scope = ctx.job.scope, view = app.services.knowledge.published(scope);
    if (!view || view.manifest.id !== payload.manifestId) return { state: 'stale' };
    // Claim the next free unit, so parallel jobs never write the same one.
    const unit = db.tx(() => { const u = free(scope, nodesOf(scope).filter(m => m.kind === 'unit'))[0]; return u ? db.update('course_modules', { ...u, claimedBy: ctx.job.id, claimedAt: clock.iso() }) : null; });
    if (!unit) return { resultRefs: [] };
    const all = nodesOf(scope), nodes = all.filter(m => m.unitId === unit.id), examDay = examDayOf(scope);
    let input = null, info = null, written = null;
    const ask = extra => call(x => app.providers.moduleWriter.write(x), { work: workIdentity({ scope, idempotencyKey: `module:${ctx.job.id}:${extra ? 'repair' : 'first'}`, input, clock }), ...input, ...extra }, { valueSchema: MODULE_DRAFT, what: 'course module' });
    const startedAt = Date.now();
    try {
      input = inputFor(scope, view, unit, nodes, all); info = anchorInfo(scope, input.excerpts.map(e => e.anchorId));
      let result = check(unwrap(await ask()).value, input, info, examDay, all);
      if (result.issues.length) { // one repair round, then keep what holds
        const again = check(unwrap(await ask({ repair: { issues: result.issues.slice(0, 12) } })).value, input, info, examDay, all);
        if (again.issues.length <= result.issues.length) result = again;
      }
      written = result.value;
    } catch (error) { if (process.env.BACKEND_DEBUG) console.error('build_modules', unit.title, error.message); }
    const ms = Date.now() - startedAt;
    // Stored against the same inputs only; a rebuild meanwhile has its own jobs.
    ctx.commit(() => {
      const now = db.get('course_modules', unit.id, scope);
      if (!now || now.inputHash !== unit.inputHash || now.knowledgeManifestId !== view.manifest.id) return;
      if (!written) { db.update('course_modules', { ...now, claimedBy: null, astraFailures: (now.astraFailures || 0) + 1 }); return; }
      db.update('course_modules', { ...now, claimedBy: null, source: 'astra', summary: written.summary, concepts: written.concepts.length ? written.concepts : now.concepts, goals: { ...now.goals, exam: written.examGoals }, writtenMs: ms, writtenAt: clock.iso() });
      for (const n of nodes.filter(x => x.id !== unit.id)) {
        const w = written.topics.get(n.id), cur = db.get('course_modules', n.id, scope);
        if (!w || !cur) continue;
        db.update('course_modules', { ...cur, source: 'astra', summary: w.summary, concepts: w.concepts.length ? w.concepts : cur.concepts, example: w.example || cur.example, misconceptions: w.misconceptions.length ? w.misconceptions : cur.misconceptions, goals: { ...cur.goals, exam: [w.examGoal] } });
      }
    });
    start(scope, view.manifest.id, ctx.job.id); // the next unit
    return { resultRefs: [{ kind: 'course_module', id: unit.id }] };
  }, { maxAttempts: 1 });

  return { start };
}
