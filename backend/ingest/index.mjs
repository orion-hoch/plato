import { AppError } from '../core/errors.mjs';
import { words } from '../core/match.mjs';
import { s } from '../core/shape.mjs';
import { call, workIdentity } from '../providers/contracts.mjs';
import { lectureOf, clip } from '../modules/outline.mjs';
import { queueCourseProblem } from '../questions/exam.mjs';

// Easy new material (v7, CONTRACTS.md "Easy new material"). A file added to a course whose knowledge is already published
// (a pset, a new lecture, the student's notes) is useful within minutes: once it is interpreted, Astra splits it into items
// (problems, definitions, examples, notes) filed under the course's modules, its problems become exam practice, live
// sessions hear one line of where things went, and only then does the full rebuild start (knowledge maybeAdvance).

const KINDS = ['problem', 'definition', 'example', 'note'];
const BATCH_CHARS = 60_000; // excerpt text per Astra call: a pset is one call, a long lecture a few
const PRACTICE_PER_FILE = 8;
const ID = s.string({ max: 80 });

export const ATTACH_DRAFT = s.object({
  items: s.array(s.object({
    kind: s.enum(KINDS), title: s.string({ min: 1, max: 200 }), markdown: s.string({ min: 1, max: 20_000 }), solution: s.nullable(s.string({ max: 20_000 })),
    anchorIds: s.array(ID, { max: 60 }), moduleIds: s.array(ID, { max: 3 }), unitModuleId: s.nullable(ID),
  }), { max: 150 }),
});

/** The entry of `list` whose text shares the most words with `text`; the first on a tie. */
function closest(text, list, textOf) {
  const want = words(text);
  let best = list[0], top = -1;
  for (const x of list) { let n = 0; for (const w of words(textOf(x))) if (want.has(w)) n++; if (n > top) [best, top] = [x, n]; }
  return best;
}

/** "[New material ready] Pset 3: 6 problems → Two's Complement (2), Overflow (2), Pointers (2); 1 definition → Sign Extension." */
function newsLine(fileTitle, items, byId) {
  const parts = KINDS.map(kind => {
    const mine = items.filter(i => i.kind === kind), where = new Map();
    for (const i of mine) { const title = byId.get(i.moduleIds[0])?.title || 'the course'; where.set(title, { n: (where.get(title)?.n || 0) + 1, unplaced: i.unplaced }); }
    const list = [...where].slice(0, 6).map(([title, w]) => mine.length > 1 || w.unplaced ? `${title} (${[mine.length > 1 && w.n, w.unplaced && 'unplaced'].filter(Boolean).join(', ')})` : title);
    return mine.length && `${mine.length} ${kind}${mine.length > 1 ? 's' : ''} → ${list.join(', ')}${where.size > 6 ? ', …' : ''}`;
  }).filter(Boolean);
  return `[New material ready] ${fileTitle}: ${parts.join('; ')}.`;
}

export function installIngest(app) {
  const { db, clock, jobs, events } = app;
  const knowledge = () => app.services.knowledge, modules = () => app.services.modules;
  const unitsOf = index => { const units = index.filter(m => m.kind === 'unit'); return { units, unitText: u => [u.title, u.summary, ...index.filter(m => m.unitId === u.moduleId && m.kind === 'topic').map(m => m.title)].join(' ') }; };

  /**
   * Astra's items → what is stored. Anchors must be this file's (else the passage most like the item); modules must exist
   * (else the item goes to the closest unit as an unplaced note); one item per sourceRef + kind (a repeat is merged in).
   * Nothing is dropped silently: each repair is listed in `issues`.
   */
  function place(drafts, { order, text, index }) {
    const byId = new Map(index.map(m => [m.moduleId, m])), { units, unitText } = unitsOf(index), issues = [], out = new Map();
    const passages = [...text.keys()].sort((a, b) => order.get(a) - order.get(b));
    for (const d of drafts) {
      let anchors = d.anchorIds.filter(id => text.has(id)).sort((a, b) => order.get(a) - order.get(b));
      if (!anchors.length) { anchors = [closest(d.markdown, passages, id => text.get(id))]; issues.push(`"${clip(d.title, 60)}" cited no passage of the file: filed at the passage most like it.`); }
      const topics = [...new Set(d.moduleIds)].filter(id => byId.get(id)?.kind === 'topic');
      if (d.moduleIds.some(id => !byId.has(id))) issues.push(`"${clip(d.title, 60)}" named an unknown module: dropped that one.`);
      const unit = topics.length ? null : [d.unitModuleId, byId.get(d.moduleIds.find(id => byId.has(id)))?.unitId].find(id => byId.get(id)?.kind === 'unit') ?? closest(`${d.title} ${d.markdown}`, units, unitText).moduleId;
      const kind = topics.length ? d.kind : 'note', sourceRef = modules().sourceRef(anchors[0]), key = `${sourceRef}\n${kind}`, same = out.get(key);
      if (same) {
        if (!same.markdown.includes(d.markdown)) same.markdown += `\n\n${d.markdown}`;
        same.moduleIds = [...new Set([...same.moduleIds, ...(topics.length ? topics : [unit])])];
        issues.push(`"${clip(d.title, 60)}" shares its passage with "${clip(same.title, 60)}": merged into it.`);
        continue;
      }
      out.set(key, { kind, title: d.title, markdown: d.markdown, solution: d.solution ?? null, sourceRef, anchorId: anchors[0], moduleIds: topics.length ? topics : [unit], unplaced: !topics.length });
    }
    return { items: [...out.values()], issues };
  }

  async function attachFile(scope, sourceVersionId, ctx) {
    const sv = db.must('source_versions', sourceVersionId, scope), file = db.must('source_files', sv.sourceFileId, scope), exam = db.get('exams', scope.examId);
    if (file.currentSourceVersionId !== sv.id || !exam?.publishedKnowledgeManifestId) return { state: 'stale' };
    const interp = db.find('base_interpretations', { sourceVersionId, kind: 'source' }, { scope, order: 'version DESC', limit: 1 })[0];
    const artifact = interp && db.get('extraction_artifacts', interp.extractionArtifactId, scope);
    const index = modules().index(scope), byId = new Map(index.map(m => [m.moduleId, m]));
    if (!artifact || !app.providers.materialAttacher || !index.some(m => m.kind === 'unit')) return { resultRefs: [] };

    // The file's text segment by segment, in order (overlap anchors belong to the segment before), a few segments per call.
    const text = new Map(knowledge().anchors(scope, artifact.anchorIds).filter(a => a.excerpt?.trim()).map(a => [a.anchor.id, a.excerpt]));
    const order = new Map(artifact.anchorIds.map((id, i) => [id, i]));
    const segments = db.find('source_segments', { extractionArtifactId: artifact.id }, { scope, order: 'segment_index' });
    const size = list => list.reduce((n, e) => n + e.text.length, 0), batches = [];
    for (const seg of segments.length ? segments : [{ anchorIds: artifact.anchorIds }]) {
      const part = seg.anchorIds.filter(id => text.has(id)).map(anchorId => ({ anchorId, text: text.get(anchorId) }));
      if (!batches.length || size(batches.at(-1)) + size(part) > BATCH_CHARS) batches.push([]);
      batches.at(-1).push(...part);
    }
    const catalog = index.map(m => ({ moduleId: m.moduleId, kind: m.kind, title: m.title, unit: m.kind === 'topic' ? byId.get(m.unitId)?.title ?? null : null, summary: clip(m.summary, 160) }));
    const fileTitle = lectureOf(file.filename);
    const results = await Promise.all(batches.filter(b => b.length).map((excerpts, part) => call(input => app.providers.materialAttacher.attach(input), {
      work: workIdentity({ scope, idempotencyKey: `attach:${sv.id}:${part}`, input: { sourceVersionId, part }, clock }),
      course: { title: exam.title }, file: { title: fileTitle, filename: file.filename }, excerpts, modules: catalog,
    }, { valueSchema: ATTACH_DRAFT, what: 'material attachment' })));
    const failed = results.find(r => r.outcome !== 'ok');
    if (failed) { const e = failed.error || {}; throw new AppError(e.code || 'provider_unavailable', e.message || 'Attaching the material failed.', { retryable: e.retryable ?? true }); }
    const { items, issues } = place(results.flatMap(r => r.value.items), { order, text, index });
    if (!items.length) return { resultRefs: [] };

    return ctx.commit(() => {
      const saved = items.map(it => modules().attach(scope, it.moduleIds.map(moduleId => ({ moduleId, kind: it.kind, title: it.title, markdown: it.markdown, solution: it.solution, sourceRef: it.sourceRef, sourceFileId: file.id }))));
      // Pset problems become exam practice in the unit of their first topic (questions/exam.mjs, from the course).
      const practice = items.map((it, i) => [it, saved[i][0]]).filter(([it]) => it.kind === 'problem').slice(0, PRACTICE_PER_FILE).map(([it, item]) => {
        const unit = byId.get(byId.get(item.moduleId)?.unitId);
        return unit && queueCourseProblem(app, scope, { topicId: unit.topicId, knowledgeManifestId: exam.publishedKnowledgeManifestId, problem: { itemId: item.id, title: it.title, markdown: it.markdown, solution: it.solution, sourceRef: it.sourceRef, file: fileTitle, page: db.get('source_anchors', it.anchorId, scope)?.location?.page ?? null } });
      }).filter(Boolean);
      events.emit({ scope, eventType: 'material.attached', aggregateType: 'source_file', aggregateId: file.id, aggregateVersion: sv.version, payload: { sourceFileId: file.id, sourceVersionId, line: newsLine(fileTitle, items, byId), itemIds: saved.flat().map(x => x.id), practiceRequestIds: practice.map(r => r.id), issues }, idempotencyKey: `material.attached:${sv.id}` });
      return { resultRefs: saved.flat().map(x => ({ kind: 'module_item', id: x.id, version: null })) };
    });
  }

  jobs.register('attach_material', async ({ sourceVersionId }, ctx) => {
    let last = true;
    try { return await attachFile(ctx.job.scope, sourceVersionId, ctx); }
    catch (error) { last = !(error instanceof AppError && error.retryable) || ctx.job.attempt >= ctx.job.maxAttempts; throw error; }
    // The full rebuild waits for the exam's attachments: the last one to finish starts it, also when it gives up.
    finally { if (last) { try { knowledge().maybeAdvance(ctx.job.scope.examId, ctx.job.id); } catch { /* the reconciler below tries again */ } } }
  });

  // Safety net for that hand-off: two attachments that finish in the same tick could each see the other still running.
  app.reconcilers.push(() => { for (const b of db.find('revision_builds', { kind: 'knowledge', state: 'queued' })) { try { knowledge().maybeAdvance(b.scope.examId); } catch { /* next round */ } } });

  // Attached items outlive a publication: a module id is mod_<topicId> and a topic keeps its id while its stable key lives,
  // so only a module that went away (its topic retired, merged or split) hands its items on: to the topic it became, else
  // to its unit as notes, else to the closest unit. ponytail: the old rows stay, unseen; a topic that comes back shows them again.
  events.subscribe('ingest.knowledge', 'knowledge.published', event => {
    const scope = { tenantId: event.scope.tenantId, learnerId: event.scope.learnerId, examId: event.scope.examId };
    const all = modules().items(scope);
    if (!all.length) return;
    const index = modules().index(scope), byId = new Map(index.map(m => [m.moduleId, m])), lost = all.filter(i => !byId.has(i.moduleId));
    const { units, unitText } = unitsOf(index), moduleOf = modules().moduleIdOf, migrations = db.find('topic_migrations', {}, { scope }).reverse();
    if (!lost.length || !units.length) return;
    const home = item => {
      const topicId = item.moduleId.replace(/^mod_/, '');
      for (const m of migrations) if (m.fromTopicIds.includes(topicId)) { const to = m.toTopicIds.map(moduleOf).find(id => byId.has(id)); if (to) return { moduleId: to, kind: byId.get(to).kind === 'topic' ? item.kind : 'note' }; }
      let root = topicId;
      for (let i = 0, p; i < 12 && (p = db.find('topic_versions', { topicId: root }, { scope, order: 'version DESC', limit: 1 })[0]?.parentTopicId); i++) root = p;
      return { moduleId: byId.get(moduleOf(root))?.kind === 'unit' ? moduleOf(root) : closest(`${item.title} ${item.markdown}`, units, unitText).moduleId, kind: 'note' };
    };
    modules().attach(scope, lost.map(item => ({ ...home(item), title: item.title, markdown: item.markdown, solution: item.solution, sourceRef: item.sourceRef, sourceFileId: item.sourceFileId })));
  });
}
