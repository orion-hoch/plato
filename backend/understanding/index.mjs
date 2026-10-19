import { hashOf, safe } from '../core/util.mjs';
import { looksLikeExam } from '../core/match.mjs';
import { AppError } from '../core/errors.mjs';
import { moduleIdOf, refOf } from '../modules/outline.mjs';
import { DIAGRAM_DATA } from '../session/agent.mjs';
import { attachSources, keyOf, makeCourseStudy, makeTopicStudy, STUDY_VERSIONS } from './study.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { STUDY_NARROW } from '../providers/prompts/understanding.mjs';
import { fileURLToPath } from 'node:url';
import { ADAPTERS, ADAPTER_IDS, FAMILIES, REGIMES, ERROR_KINDS, adapterOf, adapterSize } from './adapters.mjs';
import { VERIFIER_FAMILIES, judgeCriterion, sameAnswer, selfTestItem, verifyAttempt } from './verify.mjs';

// The course model (v11, docs/system-spec.md §7; backend/CONTRACTS.md "Understanding"): how Plato understands any course.
// First the course as a whole (study_course: adapter, spine, runnable models, methods, conventions, links, assessment),
// then each topic's slice (study_topic, study.mjs), in dependency order after knowledge.published: what a topic rests on
// first, so its slice is fed to the later ones; prefer() puts the sections the student is on and comes to next first.
// Table `studies`: one row per topic (std_<topicId>) and one for the course (std_course_<examId>).

const PARALLEL = 12; // topics at a time (a topic takes ~15–25 min); the student's next sections first
const PASSAGE_TOKENS = 9000, COURSE_TOKENS = 30_000;
const RANK = { defines: 0, explains: 1, assesses: 2, exemplifies: 3 };
const VERSION = hashOf(STUDY_VERSIONS).slice(-8); // a model built under other prompts is rebuilt

export function installUnderstanding(app) {
  const { db, clock, jobs } = app;
  const K = () => app.services.knowledge, M = () => app.services.modules;
  const wanted = new Map(); // examId → the topics the student is on and comes to next, in walk order (best effort, in memory)
  const idOf = topicId => `std_${topicId}`, courseIdOf = scope => `std_course_${scope.examId}`;
  const live = view => view.topics.filter(t => t.status !== 'retired');

  /**
   * The topics to study, in dependency order: every node of the course tree except a unit that has its own topics (they
   * carry it). A topic rests on its parent, on the source of a prerequisite or supports edge into it, and on what it is an
   * application_of. Ties and cycles break by course order.
   */
  function order(scope, view = K().published(scope)) {
    if (!view) return [];
    const nodes = M().ensure(scope).filter(n => n.kind !== 'unit' || !n.children.length), ids = nodes.map(n => n.topicId), studied = new Set(ids);
    const rests = new Map(ids.map(id => [id, new Set()])), add = (topic, on) => { if (studied.has(topic) && studied.has(on) && topic !== on) rests.get(topic).add(on); };
    for (const n of nodes) if (n.parentId) add(n.topicId, n.parentId.slice(4));
    for (const e of view.edges) {
      if (e.type === 'prerequisite' || e.type === 'supports') add(e.toTopicId, e.fromTopicId);
      if (e.type === 'application_of') add(e.fromTopicId, e.toTopicId);
    }
    const placed = [], done = new Set();
    while (placed.length < ids.length) {
      const next = ids.find(id => !done.has(id) && [...rests.get(id)].every(r => done.has(r))) ?? ids.find(id => !done.has(id)); // a cycle: course order
      placed.push({ topicId: next, title: nodes.find(n => n.topicId === next).title, restsOn: [...rests.get(next)] }); done.add(next);
    }
    return placed;
  }
  const restsOnOf = (scope, topicId) => order(scope).find(t => t.topicId === topicId)?.restsOn || [];

  /** An adapter as the stages read it: its record, its verifiers described. */
  const adapterView = id => { const a = adapterOf(id); return { ...a, verifiers: a.verifiers.map(v => ({ id: v, describe: VERIFIER_FAMILIES[v] })) }; };
  const blocksOf = passages => passages.map(p => ({ lecture: p.lecture, section: p.section, blocks: p.blocks.map(b => ({ ref: `src:${refOf(b.anchorId)}`, text: b.text })) }));

  /** What the course stage reads: the outline, the graph's links, each source's most defining passages, the adapters. */
  function courseInput(scope, view) {
    const topics = live(view), byId = new Map(topics.map(t => [t.topicId, t]));
    const anchors = [...new Set(view.evidenceLinks.sort((a, b) => (RANK[a.relation] ?? 9) - (RANK[b.relation] ?? 9)).map(l => l.sourceAnchorId))];
    const passages = blocksOf(K().passages(scope, view.manifest.id, anchors, { maxTokens: COURSE_TOKENS })), sources = new Map();
    for (const p of passages) (sources.get(p.lecture) || sources.set(p.lecture, { id: p.lecture, blocks: [] }).get(p.lecture)).blocks.push(...p.blocks.map(b => ({ ...b, section: p.section })));
    return {
      course: { title: db.get('exams', scope.examId, scope)?.title ?? null },
      adapters: Object.values(ADAPTERS).map(a => ({ id: a.id, name: a.name, covers: a.covers, verifiers: a.verifiers, epistemicProfile: a.epistemicProfile })),
      outline: topics.map(t => ({ topicId: t.topicId, title: t.title, description: t.description ?? null, parent: byId.get(t.parentTopicId)?.title ?? null, objectives: view.objectives.filter(o => o.topicId === t.topicId).map(o => o.statement) })),
      edges: view.edges.filter(e => byId.has(e.fromTopicId) && byId.has(e.toTopicId)).map(e => ({ from: e.fromTopicId, to: e.toTopicId, type: e.type, why: e.explanation })),
      sources: [...sources.values()], refs: passages.flatMap(p => p.blocks.map(b => b.ref)),
    };
  }

  /** What one topic's slice is made from: the course stage's record, the topic, its passages (its subtopics' too), its module, what it rests on, items. */
  function inputFor(scope, view, topicId, restsOn) {
    const topics = live(view), byId = new Map(topics.map(t => [t.topicId, t])), topic = byId.get(topicId);
    if (!topic) throw new AppError('stale_dependency', 'The topic is not in the published course.');
    const course = db.get('studies', courseIdOf(scope), scope)?.course;
    if (!course) throw new AppError('content_not_ready', 'The course stage has not run yet.', { retryable: true });
    const under = id => [id, ...topics.filter(t => t.parentTopicId === id).flatMap(t => under(t.topicId))], subtree = under(topicId);
    // The graph's evidence for the subtree, then the anchors its module's concepts cite (the notes as a reader gets them:
    // a summary section, such as a convention table, is often cited only there).
    const node = safe(() => M().get(scope, moduleIdOf(topicId)), null);
    const anchors = [...new Set([...view.evidenceLinks.filter(l => subtree.includes(l.topicId)).sort((a, b) => (a.topicId !== topicId) - (b.topicId !== topicId) || (RANK[a.relation] ?? 9) - (RANK[b.relation] ?? 9)).map(l => l.sourceAnchorId), ...(node?.concepts || []).flatMap(c => c.anchorIds || [])])];
    const passages = blocksOf(K().passages(scope, view.manifest.id, anchors, { maxTokens: PASSAGE_TOKENS }));
    const items = safe(() => M().items(scope), []).filter(i => subtree.some(id => i.moduleId === moduleIdOf(id))).map(i => {
      const file = safe(() => M().source(scope, i.sourceRef, { context: false })?.file, null);
      return { exam: looksLikeExam(`${file?.title || ''} ${file?.filename || ''} ${i.title}`), kind: i.kind, title: i.title, problem: i.markdown.slice(0, 3000), solution: i.solution?.slice(0, 2000) ?? null, source: `${file?.title || 'their files'} [src:${i.sourceRef}]` };
    });
    const prerequisites = restsOn.map(id => db.get('studies', idOf(id), scope)).filter(st => st?.kcs).map(st => ({
      topicId: st.topicId, topic: st.title, enduring: st.enduring, kcs: st.kcs.map(({ id, kind, statement }) => ({ id, kind, statement })), wrongModels: st.wrongModels.map(w => w.belief),
    }));
    const concepts = node?.concepts || [];
    return {
      request: {
        course: { title: db.get('exams', scope.examId, scope)?.title ?? null, adapters: (course.adapters || [course.adapter]).filter(Boolean).map(adapterView), spine: course.spine.map(({ id, understanding, threshold }) => ({ id, understanding, threshold })), models: course.models },
        topic: { topicId, title: topic.title, description: topic.description ?? null, parent: byId.get(topic.parentTopicId)?.title ?? null, subtopics: topics.filter(t => t.parentTopicId === topicId).map(t => t.title), objectives: view.objectives.filter(o => subtree.includes(o.topicId)).map(o => o.statement) },
        courseTopics: topics.map(t => ({ topicId: t.topicId, title: t.title })),
        module: node ? { summary: node.summary, concepts: concepts.map(c => ({ id: c.id, statement: c.statement })), mistakes: node.misconceptions } : null,
        passages, prerequisites, items: items.filter(i => !i.exam).map(({ exam, ...i }) => i), examProblems: items.filter(i => i.exam).map(({ exam, ...i }) => i),
        refs: passages.flatMap(p => p.blocks.map(b => b.ref)), knownIds: [...topics.map(t => t.topicId), ...concepts.map(c => c.id), ...course.spine.map(sp => sp.id)], diagramData: DIAGRAM_DATA,
      },
      inputHash: hashOf({ passages, course: course.spine, versions: STUDY_VERSIONS }),
    };
  }

  // ---------- storage and what is current ----------

  const courseRow = scope => db.get('studies', courseIdOf(scope), scope);
  // The course record is the spine stage alone: only its prompt (not a later stage's) makes it stale.
  const courseCurrent = (scope, view) => { const c = courseRow(scope); return c?.course && c.knowledgeManifestId === view.manifest.id && c.versions?.spine === STUDY_VERSIONS.spine ? c : null; };
  /** The topic's slice for this manifest: current when built from it (or from the same passages and spine) under the same prompts. */
  function current(scope, view, topicId) {
    const row = db.get('studies', idOf(topicId), scope);
    if (!row?.kcs || row.promptVersion !== VERSION) return null;
    if (row.knowledgeManifestId === view.manifest.id) return row;
    const same = safe(() => inputFor(scope, view, topicId, []).inputHash === row.inputHash, false);
    return same ? db.replace('studies', { ...row, knowledgeManifestId: view.manifest.id }) : null;
  }
  // A topic that failed twice under a manifest is skipped; one that failed only for want of a model (a server restart, an outage) after 5.
  const failed = (row, view) => row?.failedFor?.manifestId === view.manifest.id && row.failedFor.count >= (row.failedFor.transient ? 5 : 2);
  const active = (scope, type, except) => db.find('jobs', { examId: scope.examId, type, state: ['queued', 'running', 'retry_wait'] }).filter(j => j.id !== except);

  /** The next work: the course stage first; then up to PARALLEL topics: the preferred ones in their order (built without waiting for their bases), else the first in dependency order whose bases are built. */
  function kick(scope, except = null) {
    const view = K().published(scope);
    if (!view || db.get('exams', scope.examId)?.knowledgeSource === 'guide') return 0; // a guide-backed course has no course model

    return db.tx(() => {
      if (!courseCurrent(scope, view)) {
        if (active(scope, 'study_course', except).length || failed(courseRow(scope), view)) return 0;
        jobs.enqueue({ scope, type: 'study_course', idempotencyKey: `study_course:${view.manifest.id}:${clock.now()}`, payload: { manifestId: view.manifest.id }, priority: 7 });
        return 1;
      }
      const all = order(scope, view), running = active(scope, 'study_topic', except);
      const taken = new Set(running.map(j => j.payload.topicId)), settled = new Set();
      const todo = all.filter(t => { const row = db.get('studies', idOf(t.topicId), scope); if (current(scope, view, t.topicId) || failed(row, view)) { settled.add(t.topicId); return false; } return true; });
      // No session yet: the learner's lecture walk from where they are (the session's inOrder), so the start of the walk is ready first.
      // A course with no session yet waits behind the ones in use (all its topics at 5).
      const used = wanted.has(scope.examId) || !!db.prepare('SELECT 1 FROM sessions WHERE exam_id = ? LIMIT 1').get(scope.examId);
      const want = wanted.get(scope.examId) || safe(() => [...new Set(app.services.session.inOrder(scope, view).map(n => n.topicId))].slice(0, 8), []), at = id => { const i = want.indexOf(id); return i < 0 ? Infinity : i; };
      const ready = todo.filter(t => !taken.has(t.topicId) && (want.includes(t.topicId) || t.restsOn.every(r => settled.has(r))));
      ready.sort((a, b) => at(a.topicId) - at(b.topicId));
      // A dependency cycle (12 Oct: Masking and Hexadecimal literals each waited on the other): nothing ready and nothing running,
      // so the first left in course order goes without its bases.
      if (!ready.length && !running.length && todo.length) ready.push(todo.find(t => !taken.has(t.topicId)) ?? todo[0]);
      const picked = ready.slice(0, Math.max(0, PARALLEL - running.length));
      for (const t of picked) jobs.enqueue({ scope, type: 'study_topic', idempotencyKey: `study_topic:${view.manifest.id}:${t.topicId}:${clock.now()}`, payload: { topicId: t.topicId, manifestId: view.manifest.id, restsOn: t.restsOn }, priority: !used ? 5 : want.includes(t.topicId) ? 9 : 6 });
      return picked.length;
    });
  }

  const recordFailure = (scope, id, extra, view, error, commit) => safe(() => commit(() => {
    const prev = db.get('studies', id, scope);
    db.replace('studies', { ...(prev || { id, scope, createdAt: clock.iso(), rowVersion: 0, knowledgeManifestId: null, ...extra }), failedFor: { manifestId: view.manifest.id, count: prev?.failedFor?.manifestId === view.manifest.id ? prev.failedFor.count + 1 : 1, error: error.message, transient: /model was unavailable|timed? ?out/i.test(error.message) && prev?.failedFor?.transient !== false } });
  }));

  /** The course stage now (the job's work; evals and debugging call it directly). */
  async function buildCourse(scope, { commit = fn => db.tx(fn) } = {}) {
    const view = K().published(scope), startedAt = Date.now();
    if (!view) throw new AppError('content_not_ready', 'The course has no published notes yet.');
    try {
      const input = courseInput(scope, view), { course, log } = await makeCourseStudy(app, input);
      return commit(() => db.replace('studies', { id: courseIdOf(scope), scope, topicId: 'course', title: input.course.title, version: (courseRow(scope)?.version || 0) + 1, builtAt: clock.iso(), createdAt: courseRow(scope)?.createdAt || clock.iso(), rowVersion: 0, knowledgeManifestId: view.manifest.id, promptVersion: VERSION, versions: STUDY_VERSIONS, ms: Date.now() - startedAt, course, log }));
    } catch (error) { recordFailure(scope, courseIdOf(scope), { topicId: 'course' }, view, error, commit); throw error; }
  }

  /** Make and store one topic's slice now (the job's work; evals and debugging call it directly). `commit` guards the write. */
  async function build(scope, topicId, { restsOn = restsOnOf(scope, topicId), commit = fn => db.tx(fn), onStage } = {}) {
    const view = K().published(scope), startedAt = Date.now();
    if (!view) throw new AppError('content_not_ready', 'The course has no published notes yet.');
    try {
      const { request, inputHash } = inputFor(scope, view, topicId, restsOn);
      if (!request.passages.length) throw new AppError('quality_gate', 'The materials have no passages on this topic.', { retryable: false });
      const { study } = await makeTopicStudy(app, request, { onStage });
      return commit(() => {
        const prev = db.get('studies', idOf(topicId), scope);
        return db.replace('studies', {
          id: idOf(topicId), scope, topicId, title: request.topic.title, version: (prev?.version || 0) + 1, builtAt: clock.iso(), createdAt: prev?.createdAt || clock.iso(), rowVersion: 0,
          knowledgeManifestId: view.manifest.id, inputHash, promptVersion: VERSION, versions: STUDY_VERSIONS, sources: request.refs, restsOn, ms: Date.now() - startedAt, ...study,
        });
      });
    } catch (error) { recordFailure(scope, idOf(topicId), { topicId }, view, error, commit); throw error; }
  }

  jobs.register('study_course', async ({ manifestId }, ctx) => {
    const scope = ctx.job.scope;
    if (K().published(scope)?.manifest.id !== manifestId) return { state: 'stale' };
    try { const stored = await buildCourse(scope, { commit: ctx.commit }); return { resultRefs: [{ kind: 'study', id: stored.id, version: stored.version }] }; }
    finally { safe(() => kick(scope, ctx.job.id)); } // the topics
  }, { maxAttempts: 1 });

  jobs.register('study_topic', async ({ topicId, manifestId, restsOn }, ctx) => {
    const scope = ctx.job.scope;
    if (K().published(scope)?.manifest.id !== manifestId) return { state: 'stale' };
    // A restart can leave two jobs on one topic (the one cut off, resumed, and the retry it queued as it failed): the older one builds.
    if (active(scope, 'study_topic', ctx.job.id).some(j => j.payload.topicId === topicId && j.createdAt < ctx.job.createdAt)) return { state: 'stale' };
    try { const stored = await build(scope, topicId, { restsOn, commit: ctx.commit }); return { resultRefs: [{ kind: 'study', id: stored.id, version: stored.version }] }; }
    finally { safe(() => kick(scope, ctx.job.id)); } // the next topic
  }, { maxAttempts: 1 });

  // Live (the user, 2026-10-11): every published course is studied in the background, the course stage first, then its
  // topics; the director teaches a topic from its slice as soon as that is built (notes fallback until then).
  app.events.subscribe('understanding.course', 'knowledge.published', event => { kick({ tenantId: event.scope.tenantId, learnerId: event.scope.learnerId, examId: event.scope.examId }); });
  app.hooks.examDeleted.push(exam => db.prepare('DELETE FROM studies WHERE exam_id = ?').run(exam.id));
  // A server start is a fresh chance: failures only for want of a model (often the last shutdown cutting builds off) are forgotten.
  safe(() => db.prepare("UPDATE studies SET data = json_remove(data, '$.failedFor') WHERE json_extract(data, '$.failedFor.transient') = 1").run());

  // Slices built before audit checks that failed to run were told apart carry them as conflicts: dropped when read.
  const NOT_RUN = /^(the program failed|the program did not finish|the C check does not compile|the C check did not finish|could not run|a riscv check needs|Invalid trace)/i;
  const ranConflicts = st => st.conflicts?.some(c => NOT_RUN.test(String(c.truth))) ? { ...st, conflicts: st.conflicts.filter(c => !NOT_RUN.test(String(c.truth))) } : st;
  const out = ({ scope, rowVersion, inputHash, failedFor, promptVersion, ...study }) => ranConflicts(study);
  const topicRows = scope => new Map(db.find('studies', {}, { scope }).filter(r => r.kcs && r.topicId !== 'course').map(r => [r.topicId, ranConflicts(r)]));

  // ---------- interface A (v12 integration contract): the course model as the teaching engine reads it ----------

  let elements = null; // the stage's element registry (sentenceAnchors), loaded once; a broken registry never breaks the course model
  import('../../shared/elements/registry.mjs').then(m => { elements = m; }, () => {});

  // Ids are global in the course model: "<topicId>:<local id>" for every KC and item, so a KC carries its topic.
  const G = (t, id) => id == null ? id : `${t}:${id}`;
  function globalize(t, st) {
    const g = id => G(t, id), gs = ids => (ids || []).map(g), local = new Set((st.kcs || []).map(k => k.id));
    const detector = w => w.detector ? (w.detector.type === 'pattern' ? { ...w.detector, battery: gs(w.detector.battery) } : w.detector) : w.signature ? { type: w.signature.kind === 'executable' ? 'execute' : 'rubric', ...w.signature } : null;
    return {
      kcs: (st.kcs || []).map(k => ({ ...k, id: g(k.id), localId: k.id, topicId: t, prerequisites: (k.prerequisites || []).map(x => local.has(x) ? g(x) : x) })),
      models: (st.models || []).map(m => ({ ...m, id: g(m.id), topicId: t, kcs: gs(m.kcs) })),
      cases: (st.cases || []).map(c => ({ ...c, id: g(c.id), topicId: t, kcs: gs(c.kcs), links: (c.links || []).map(l => ({ ...l, to: g(l.to) })) })),
      procedures: (st.procedures || []).map(x => ({ ...x, id: g(x.id), topicId: t, kc: g(x.kc) })),
      wrongModels: (st.wrongModels || []).map(w => ({ ...w, id: g(w.id), topicId: t, kc: g(w.kc), separatingProbe: g(w.separatingProbe), recheck: gs(w.recheck), detector: detector(w) })),
      probes: (st.probes || []).map(x => ({ ...x, id: g(x.id), topicId: t, kc: g(x.kc) })),
      // A problem's ordered steps (for the help ladder): the model's worked example of it, when there is one.
      problems: (st.problems || []).map(x => ({ ...x, predictedWrongAnswers: Object.fromEntries((st.wrongModels || []).filter(w => w.detector?.type === 'pattern' && !x.familyId).flatMap(w => { const i = w.detector.battery.indexOf(x.id); return i >= 0 && w.detector.fingerprint[i] ? [[g(w.id), w.detector.fingerprint[i]]] : []; })), id: g(x.id), topicId: t, kc: g(x.kc), probeId: g(x.probeId), steps: (st.explanations || []).flatMap(e => e.workedExamples || []).find(w => w.problemId === x.id)?.steps ?? x.steps ?? null, element: x.element ?? null, wrongAnswers: Object.fromEntries(Object.entries(x.wrongAnswers || {}).map(([w, a]) => [g(w), a])) })),
      // A representation names its registry kind and carries that kind's engine state as `spec` (the stage's contract).
      representations: (st.representations || []).map(r => ({ ...r, id: g(r.id), topicId: t, kind: r.element?.kind ?? r.kind, spec: r.element?.spec ?? null, kcs: gs(r.kcs), translations: gs(r.translations), reveals: gs(r.reveals) })),
      explanations: (st.explanations || []).map(e => ({ ...e, kc: g(e.kc), topicId: t, analogies: e.analogies || (e.analogy ? [e.analogy] : []), workedExamples: (e.workedExamples || []).map(w => ({ ...w, problemId: g(w.problemId) })) })),
      readings: (st.readings || []).map(r => ({ ...r, id: g(r.id), topicId: t, kcs: gs(r.kcs), refutes: g(r.refutes) })),
      conflicts: (st.conflicts || []).map(c => ({ ...c, topicId: t })), simplifications: (st.simplifications || []).map(c => ({ ...c, topicId: t })),
      links: (st.links || []).map(l => ({ from: t, ...l })),
    };
  }

  /** The whole course model, memoized per exam and keyed by the studies rows' versions (the engine reads it every turn). */
  const memo = new Map();
  function courseModel(scope) {
    const key = JSON.stringify([db.prepare("SELECT id, json_extract(data, '$.version') v, json_extract(data, '$.builtAt') b FROM studies WHERE exam_id = ? ORDER BY id").all(scope.examId).map(r => [r.id, r.v, r.b]), K().published(scope)?.manifest.id ?? null]);
    const hit = memo.get(scope.examId);
    if (hit?.key === key) return hit.value;
    const value = buildCourseModel(scope);
    memo.set(scope.examId, { key, value });
    return value;
  }

  /** The whole course model in the §7 shape: the course record plus every built topic's slice, ids global. */
  function buildCourseModel(scope) {
    const c = courseRow(scope)?.course;
    if (!c) return null;
    const view = K().published(scope), rows = topicRows(scope), topics = order(scope).filter(t => rows.has(t.topicId)).map(t => rows.get(t.topicId));
    // Slices built before sources were attached get them now (the same matcher), so every KC carries the course's own words.
    const slices = topics.map(t => globalize(t.topicId, t.kcs?.every(k => k.sources) ? t : attachSources(t, passagesOf(scope, t.topicId)))), all = key => slices.flatMap(x => x[key]);
    return {
      examId: scope.examId, adapters: c.adapters || [c.adapter].filter(Boolean), sources: c.sources, assessment: c.assessment,
      spine: c.spine.map(sp => ({ ...sp, kcs: all('kcs').filter(k => topics.find(t => t.topicId === k.topicId)?.spine?.includes(sp.id)).map(k => k.id) })),
      methods: c.methods, conventions: c.conventions, links: [...c.links, ...all('links')],
      kcs: all('kcs'), models: [...c.models.map(m => ({ ...m, topicId: null, kcs: [] })), ...all('models')], cases: all('cases'), procedures: all('procedures'), wrongModels: all('wrongModels'),
      probes: all('probes'), problems: all('problems'), representations: all('representations'), explanations: all('explanations'), readings: all('readings'), conflicts: all('conflicts'), simplifications: all('simplifications'),
      quality: { topics: Object.fromEntries(topics.map(t => [t.topicId, { gate: t.quality?.gate?.pass ?? null, ablation: t.quality?.ablation ? { modelOnly: t.quality.ablation.modelOnly, withNotes: t.quality.ablation.withNotes, withStudy: t.quality.ablation.withStudy, withBoth: t.quality.ablation.withBoth ?? null } : null, current: !!view && t.knowledgeManifestId === view.manifest.id && t.promptVersion === VERSION }])) },
      topics: topics.map(t => ({ topicId: t.topicId, title: t.title, enduring: t.enduring, essentialQuestions: t.essentialQuestions, threshold: t.threshold, matters: t.matters, interactivity: t.interactivity, route: t.route, taskLadder: (t.taskLadder || []).map(id => G(t.topicId, id)), gapsInNotes: t.gapsInNotes })),
    };
  }

  /** One KC's slice: its probes, problems, wrong models, readings, representations, explanation, models, cases, procedures, links. */
  function forKc(scope, kcId) {
    const cm = courseModel(scope), kc = cm?.kcs.find(k => k.id === kcId);
    if (!kc) return null;
    const has = x => x.kc === kcId || (x.kcs || []).includes(kcId);
    return { kc, topic: cm.topics.find(t => t.topicId === kc.topicId) ?? null, probes: cm.probes.filter(has), problems: cm.problems.filter(has), wrongModels: cm.wrongModels.filter(has), readings: cm.readings.filter(has), representations: cm.representations.filter(has), explanation: cm.explanations.find(has) ?? null, models: cm.models.filter(has), cases: cm.cases.filter(has), procedures: cm.procedures.filter(has), links: cm.links.filter(l => l.from === kc.topicId || l.to === kc.topicId) };
  }

  // Judge calibration (evals owns the harness: evals/understanding/frozen/calibration/records/<criterion>.<judge>.json):
  // a criterion gives verdicts only when the runtime judge's record (the narrow judge, verify.mjs judgeCriterion) says
  // status 'verdict' AND was made with this exact prompt (its hash); a record certifies one judge only. Else discussion-only.
  const RECORDS = fileURLToPath(new URL('../../evals/understanding/frozen/calibration/records/', import.meta.url)), JUDGE_ID = 'narrow';
  const CRITERIA = fileURLToPath(new URL('../../evals/understanding/frozen/calibration/criteria.json', import.meta.url));
  function calibration() {
    const out = new Map();
    if (existsSync(RECORDS)) for (const f of readdirSync(RECORDS).filter(x => x.endsWith(`.${JUDGE_ID}.json`))) {
      const r = safe(() => JSON.parse(readFileSync(`${RECORDS}/${f}`, 'utf8')), null);
      const same = r?.judge?.prompt === createHash('sha256').update(STUDY_NARROW({ question: r?.question ?? '' })).digest('hex').slice(0, 12);
      if (r?.criterion && r.judge?.id === JUDGE_ID) out.set(r.criterion, { pass: r.status === 'verdict' && same, agreement: r.agreement ?? null, kappa: r.kappa ?? null, provisional: !!r.provisional, promptMatches: same });
    }
    return out;
  }
  const criteria = () => safe(() => JSON.parse(readFileSync(CRITERIA, 'utf8')).criteria, []);

  /** The passages a topic's slice was built on (for source grounding at verification time). */
  const passagesOf = (scope, topicId) => safe(() => inputFor(scope, K().published(scope), topicId, []).request.passages, []);

  /**
   * Check a learner's answer to an item through its verifier chain (spec §9); `channel` ('speech' | 'typed' | 'written', or
   * null: unknown) and `asrConfidence` say how far a transcript is the learner's own words (V10). → { verdict: 'correct' | 'valid_nonstandard'
   * | 'incorrect' | 'uncertain', trust, provenance, firstFailure, wrongModelHits: [{ id, p }] }. Below calibrated trust
   * (0.6) the verdict is 'uncertain': elicit, never guess.
   */
  async function verify(scope, { itemId, answer, steps = null, channel = null, asrConfidence = null }) {
    const cm = courseModel(scope), item = cm?.problems.find(p => p.id === itemId) || cm?.probes.find(p => p.id === itemId);
    if (!item) throw new AppError('invalid_input', `No item ${itemId} in the course model.`);
    const known = new Map(criteria().map(c => [c.id, c.question]));
    const wanted = ['answer.correct', ...(item.family === 'E5' ? ['answer.mechanism'] : []), 'answer.unsupported'].filter(id => known.has(id));
    const verified = item.verification?.ok === true;
    // A key: the item's own, else a family problem's computed answer (slices built before keys existed).
    const key = item.key ?? (item.verification?.by === 'family' ? { value: item.answer, form: 'text', equivalents: [] } : null);
    const base = { id: item.id, regime: item.regime || 'R1', answer: item.answer, key, wrongAnswers: item.wrongAnswers || {} };
    const selfTest = await selfTestItem(base); // always fresh: it is cheap and pure, and a stored one may predate a verifier fix
    const target = { ...base, prompt: item.prompt, answer: verified || item.regime === 'R4' ? item.answer : null, selfTest, computed: ['family', 'js', 'c', 'riscv'].includes(item.verification?.by), constraints: item.constraints || [], rubric: item.rubric || [], criteria: wanted.map(id => ({ id, question: known.get(id) })) };
    const adapter = item.adapter && ADAPTERS[item.adapter];
    const r = await verifyAttempt(target, answer, { providers: app.providers, calibration: calibration(), passages: passagesOf(scope, item.topicId), adapterVerifiers: adapter?.verifiers, panel: adapter?.panel, channel, asrConfidence });
    const exactFailed = r.chain.some(x => x.by === 'V1' && x.ok === false);
    const verdict = r.ok === null || r.trust < 0.6 ? 'uncertain' : r.ok ? (exactFailed && ['R2', 'R3'].includes(target.regime) ? 'valid_nonstandard' : 'correct') : 'incorrect';
    // Which wrong models the answer looks like: an executable answer exactly; a rubric belief only by its markers (a prefilter).
    const hits = [];
    if (r.ok !== true) {
      const named = r.chain.find(x => x.wrongModel)?.wrongModel;
      if (named) hits.push({ id: named, p: 0.95 });
      // A pattern's predicted answer on this battery item: evidence for that model, one item of its battery (not a diagnosis alone).
      for (const [w, a] of Object.entries(item.predictedWrongAnswers || {})) if (!hits.some(h => h.id === w) && sameAnswer(answer, a)) hits.push({ id: w, p: 0.5 });
      const text = String(answer).toLowerCase();
      for (const w of cm.wrongModels.filter(x => x.kc === item.kc && x.detector?.type === 'rubric' && !hits.some(h => h.id === x.id))) {
        const cues = (w.markers || []).filter(m => text.includes(String(m).toLowerCase()));
        if (cues.length) hits.push({ id: w.id, p: Math.min(0.5, 0.2 * cues.length) });
      }
    }
    const firstFailure = steps && r.ok === false ? { step: null, note: 'step-level checking comes with the problem step DAGs' } : null;
    return { verdict, trust: r.trust, provenance: { by: r.by, chain: r.chain, note: r.note, regime: target.regime, adapter: item.adapter ?? null, key: !!key, selfTest: selfTest.pass }, firstFailure, wrongModelHits: hits };
  }

  /** The probe with the highest expected information gain over the hypotheses (wrong model ids) plus "correct", for a KC. */
  function separatingProbe(scope, { kc, hypotheses = [] }) {
    const cm = courseModel(scope), hs = [...new Set([...hypotheses, 'correct'])];
    const norm = a => String(a ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    let best = null;
    for (const p of (cm?.problems || []).filter(x => x.kc === kc && x.verification?.ok !== false)) {
      const predictions = Object.fromEntries(hs.map(h => [h, h === 'correct' ? p.answer : p.wrongAnswers?.[h] ?? null]));
      const groups = new Map();
      for (const h of hs) { const key = predictions[h] == null ? '?' : norm(predictions[h]); groups.set(key, (groups.get(key) || 0) + 1); }
      // Uniform prior over the hypotheses; an unknown prediction separates nothing (it joins the '?' group).
      const gain = [...groups.values()].reduce((sum, n) => sum - (n / hs.length) * Math.log2(n / hs.length), 0);
      if (!best || gain > best.gain + 1e-9 || (Math.abs(gain - best.gain) < 1e-9 && p.familyId && !best.familyId)) best = { probeId: p.id, gain: Math.round(gain * 1000) / 1000, predictions, familyId: p.familyId ?? null };
    }
    return best;
  }

  /** A verified reading portion for a KC (spec §7 ReadingPortion, reading.md §8), the closest level first, materials before explainers. */
  function reading(scope, { kc, level = 'core', purpose = null }) {
    const cm = courseModel(scope), rank = { intro: 0, core: 1, advanced: 2 };
    const candidates = (cm?.readings || []).filter(r => r.kcs.includes(kc) && r.quality !== 'fail');
    if (!candidates.length) return null;
    const want = rank[level] ?? (level === 'novice' ? 0 : level === 'fluent' ? 2 : 1);
    const pick = candidates.sort((a, b) => Number(purpose === 'refute') * (Number(!!b.refutes) - Number(!!a.refutes)) || Math.abs((rank[a.level] ?? 1) - want) - Math.abs((rank[b.level] ?? 1) - want) || (a.source === 'materials' ? -1 : 1) - (b.source === 'materials' ? -1 : 1))[0];
    const sentences = (text, anchor) => elements?.sentenceAnchors ? elements.sentenceAnchors({ anchor, kind: 'para', text }) : String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"“(*`$])/).filter(Boolean).map((t, i) => ({ anchor: `${anchor}.s${i + 1}`, text: t }));
    // Paragraphs, keeping a fenced code block whole.
    const paragraphs = text => { const out = []; let fence = null; for (const part of String(text).split(/\n{2,}/)) { if (fence !== null) { fence += `\n\n${part}`; if ((part.match(/```/g) || []).length % 2) { out.push(fence); fence = null; } continue; } if ((part.match(/```/g) || []).length % 2) { fence = part; continue; } if (part.trim()) out.push(part); } if (fence) out.push(fence); return out; };
    // Blocks in the page's shape (the stage's ReadingPortion.body): { anchor, kind, text, sentences | items | lang }, every sentence anchored "<block>.sN"
    // by the registry's own splitter when it is loaded, so the page and the course model name sentences alike.
    const blockOf = (raw, anchor, extra = {}) => {
      const t = String(raw).trim(), code = /^```(\w*)\n([\s\S]*?)```$/.exec(t);
      if (code) return { anchor, kind: 'code', text: code[2], lang: code[1] || null, sentences: [], ...extra };
      if (/^#{1,6}\s/.test(t)) return { anchor, kind: 'heading', text: t.replace(/^#+\s*/, ''), sentences: [{ anchor: `${anchor}.s1`, text: t.replace(/^#+\s*/, '') }], ...extra };
      if (/^\$\$[\s\S]*\$\$$/.test(t)) return { anchor, kind: 'math', text: t, sentences: [], ...extra };
      if (/^\|.*\|/m.test(t)) return { anchor, kind: 'table', text: t, sentences: [], ...extra };
      if (/^(\s*[-*]|\s*\d+\.)\s/m.test(t) && t.split('\n').every(l => /^(\s*[-*]|\s*\d+\.)\s|^\s+\S/.test(l) || !l.trim())) { const items = t.split('\n').filter(l => l.trim()).map((l, i) => ({ anchor: `${anchor}.s${i + 1}`, text: l.replace(/^\s*([-*]|\d+\.)\s*/, '') })); return { anchor, kind: 'list', text: t, items, sentences: items, ...extra }; }
      if (/^>/.test(t)) return { anchor, kind: 'quote', text: t.replace(/^>\s?/gm, ''), sentences: sentences(t.replace(/^>\s?/gm, ''), anchor), ...extra };
      return { anchor, kind: 'para', text: t, sentences: sentences(t, anchor), ...extra };
    };
    const blocks = pick.source === 'materials'
      ? (pick.refs || []).flatMap(ref => { const src = safe(() => M().source(scope, ref.replace(/^src:/, ''), { context: false }), null), id = ref.replace(/^src:/, 'src_'); return src?.passage ? paragraphs(src.passage).map((para, i) => blockOf(para, i ? `${id}_b${i + 1}` : id, { locator: src.location, sourceId: src.file?.sourceFileId ?? null })) : []; })
      : paragraphs(pick.text || '').map((para, i) => blockOf(para, `${pick.id.replace(/:/g, '_')}_b${i + 1}`));
    if (!blocks.length) return null;
    const words = blocks.reduce((n, b) => n + b.text.split(/\s+/).length, 0), all = blocks.flatMap(b => b.sentences);
    const lookFor = new Set(String(pick.lookFor || '').toLowerCase().match(/[a-z]{5,}/g) || []);
    const keyAnchors = all.filter(x => [...lookFor].some(w => x.text.toLowerCase().includes(w))).slice(0, 4).map(x => x.anchor);
    const wm = pick.refutes && cm.wrongModels.find(w => w.id === pick.refutes);
    const meanSentenceWords = Math.round(words / Math.max(1, all.length));
    const AFTER = { explain_back: 'explain_back', predict: 'predict_new_case', consolidate: 'summary' };
    return {
      id: pick.id, kcs: pick.kcs.map(k => ({ kc: k, role: wm && wm.kc === k ? 'refutes' : 'teaches' })), spine: cm.topics.find(t => t.topicId === pick.topicId) ? undefined : undefined,
      kind: wm ? 'refutation' : 'exposition', origin: pick.source === 'materials' ? 'materials' : 'explainer',
      sources: pick.source === 'materials' ? blocks.map(b => ({ sourceId: b.sourceId, locator: b.locator || b.anchor, verbatim: true })) : (pick.refs || []).map(ref => ({ sourceId: null, locator: ref, verbatim: false })),
      purpose: pick.purpose, body: blocks.map(({ sourceId, locator, ...b }) => b), keyAnchors: keyAnchors.length ? keyAnchors : all.slice(0, 1).map(x => x.anchor),
      segments: [{ from: all[0].anchor, to: all.at(-1).anchor, words }], glosses: [],
      level: { cohesion: pick.level === 'intro' ? 'high' : 'terse', words, minutes: pick.minutes ?? Math.max(1, Math.round(words / 200)), density: /[=$`{}]/.test(blocks.map(b => b.text).join(' ')) ? 'mixed' : 'prose' },
      prequestions: (pick.prequestions || []).map(q => ({ prompt: q, kind: 'explain', answerAnchor: (keyAnchors[0] ?? all[0].anchor) })),
      after: AFTER[pick.after] ? [{ form: AFTER[pick.after], prompt: pick.after === 'predict' ? `Predict a new case: ${pick.purpose}` : pick.after === 'explain_back' ? 'Say the idea back in your own words.' : 'Sum it up in two sentences.', newSurface: pick.after === 'predict' }] : [],
      refutes: wm ? { wrongModel: wm.id, beliefAsLearnersSayIt: wm.belief, whyPlausible: wm.plausibleBecause, correction: wm.repair, mechanism: null, contrastCase: null, courseRef: (pick.refs || [])[0] ?? null } : undefined,
      verification: { claims: pick.source === 'explainer' ? all.map(x => ({ anchor: x.anchor, label: 'course', support: pick.refs || [] })) : [], executed: false, surface: { meanSentenceWords, rareWordRate: null }, gate: 'pass', reviewedBy: 'skeptical_ta' },
    };
  }

  app.services.understanding = {
    /** The topic's slice of the course model (the newest built; `current` false when it predates the published notes or prompts), or null. */
    get(scope, topicId) {
      const view = K().published(scope), row = db.get('studies', idOf(topicId), scope);
      if (!row?.kcs) return null;
      // The course's own words travel with the slice, verbatim: every block of the topic's passages (PASSAGE_TOKENS), in
      // course order, with its section, for what a course-specific question asks ("which example", "where does it say").
      const st = out(row), passages = passagesOf(scope, topicId);
      return { ...(st.kcs.every(k => k.sources) ? st : attachSources(st, passages)), sources: passages.flatMap(p => p.blocks.map(b => ({ ref: b.ref, where: `${p.lecture} › ${p.section}`, text: b.text }))), current: !!view && !!current(scope, view, topicId) };
    },
    courseModel, course: courseModel, forKc, verify, separatingProbe, reading,
    /**
     * The calibrated runtime judge on one shared criterion (evals' criteria.json), for any caller: null (discussion-only) unless
     * the criterion's narrow record says 'verdict' and was made with this prompt. items: [{ id, …the fields its gold set uses }].
     * → [{ id, ok, verdict, confidence }] (ok true: the criterion is met; for a fault criterion, the fault is absent).
     */
    async judge(criterionId, items) {
      const cal = calibration().get(criterionId), c = criteria().find(x => x.id === criterionId);
      if (!cal?.pass || !c) return null;
      const trust = Math.min(0.9, cal.agreement ?? 0.6); // a judged observation counts at its criterion's measured agreement, never 1
      return (await judgeCriterion({ id: c.id, question: c.question }, items, { providers: app.providers })).map(({ id, ok, verdict, confidence }) => ({ id, ok, verdict, confidence, trust }));
    },
    adapters: () => Object.fromEntries(ADAPTER_IDS.map(id => [id, { ...ADAPTERS[id], size: adapterSize(id) }])),
    /** Every built topic slice, in dependency order. */
    all(scope) { const rows = topicRows(scope); return order(scope).filter(t => rows.has(t.topicId)).map(t => out(rows.get(t.topicId))); },
    /** Where the building is: the course stage and each topic in dependency order, with its gate, ablation and regurgitation. */
    status(scope) {
      const view = K().published(scope);
      if (!view) return { course: null, total: 0, built: 0, topics: [] };
      const building = new Set(db.find('jobs', { examId: scope.examId, type: 'study_topic', state: ['queued', 'running', 'retry_wait'] }).map(j => j.payload.topicId));
      const c = courseRow(scope);
      const topics = order(scope, view).map(t => {
        const row = db.get('studies', idOf(t.topicId), scope), built = row?.kcs && row.knowledgeManifestId === view.manifest.id && row.promptVersion === VERSION;
        const state = building.has(t.topicId) ? 'building' : built ? 'built' : failed(row, view) ? 'failed' : row?.kcs ? 'stale' : 'waiting';
        return { topicId: t.topicId, title: t.title, restsOn: t.restsOn, state, gate: row?.quality?.gate?.pass ?? null, ablation: row?.quality?.ablation ? { modelOnly: row.quality.ablation.modelOnly, withNotes: row.quality.ablation.withNotes, withStudy: row.quality.ablation.withStudy } : null, regurgitation: row?.quality?.regurgitation?.share ?? null, builtAt: row?.builtAt ?? null, error: row?.failedFor?.error ?? null };
      });
      return { course: c?.course ? { adapter: c.course.adapter, spine: c.course.spine.length, builtAt: c.builtAt, current: !!courseCurrent(scope, view) } : { error: c?.failedFor?.error ?? null }, total: topics.length, built: topics.filter(t => t.state === 'built').length, topics };
    },
    /** The topic the student is on is built next. */
    prefer(scope, topicIds) { const ids = [].concat(topicIds || []).filter(Boolean); if (!ids.length) return; wanted.set(scope.examId, ids); setImmediate(() => safe(() => kick(scope))); }, // off the caller's path (the director issues cards in a transaction)
    order: scope => order(scope),
    kick, build, buildCourse,
    inputFor: (scope, topicId) => inputFor(scope, K().published(scope), topicId, restsOnOf(scope, topicId)).request,
  };
}
