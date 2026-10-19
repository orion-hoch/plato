import { AppError } from '../core/errors.mjs';
import { words } from '../core/match.mjs';
import { newId, safe } from '../core/util.mjs';
import { outlineModules, moduleIdOf, refOf, lectureOf, clip } from './outline.mjs';
import { installModuleWriter } from './writer.mjs';

// Course modules (v7, CONTRACTS.md "Course modules"): the course as a tree of nodes at its real depth (unit › topic ›
// subtopic), each holding its concepts from the notes, joined by the graph's typed links. The director reads its concepts
// for cards (get). Outline nodes are built at once from the published knowledge; Astra rewrites each
// unit's readable parts and concepts in the background (writer.mjs). Questions, mastery and items join live.

const ITEM_KINDS = ['problem', 'example', 'definition', 'note'];
const FORMAT = 2; // the node shape; rows of an older shape are rebuilt

export function installModules(app) {
  const { db, clock } = app;
  const knowledge = () => app.services.knowledge;

  // ---------- sources: anchors with their lecture, and short refs ----------

  const files = new Map(); // sourceVersionId → { sourceFileId, filename }
  function fileOf(sourceVersionId) {
    if (!files.has(sourceVersionId)) {
      const v = db.get('source_versions', sourceVersionId), f = v && db.get('source_files', v.sourceFileId);
      files.set(sourceVersionId, f ? { sourceFileId: f.id, filename: f.filename } : null);
    }
    return files.get(sourceVersionId);
  }
  /** anchorId → { lecture, excerpt, section, page, sourceFileId } for anchors with faithful text. */
  function anchorInfo(scope, ids) {
    const out = new Map();
    for (const { anchor, excerpt } of safe(() => knowledge().anchors(scope, ids), [])) {
      const file = fileOf(anchor.sourceVersionId);
      out.set(anchor.id, { lecture: lectureOf(file?.filename), excerpt, section: anchor.location?.sectionPath?.at(-1) || null, page: anchor.location?.page ?? null, sourceFileId: file?.sourceFileId ?? null });
    }
    return out;
  }
  const findRef = (scope, ref) => /^[\w-]{4,16}$/.test(ref || '') ? db.prepare('SELECT data FROM source_anchors WHERE exam_id = ? AND id >= ? AND id < ? LIMIT 2').all(scope.examId, `anc_${ref}`, `anc_${ref}\x7f`).map(r => JSON.parse(r.data)) : [];
  const locationOf = (anchor, file) => [lectureOf(file?.filename), anchor.location?.page ? `p. ${anchor.location.page}` : anchor.location?.slide ? `slide ${anchor.location.slide}` : anchor.location?.sectionPath?.at(-1)].filter(Boolean).join(', ');

  /** The cited passage with a little context: { ref, file, location, anchorId, page, passage, before, after }. DB only. */
  function source(scope, ref, { context = true } = {}) {
    const [anchor, other] = findRef(scope, ref);
    if (!anchor || other) throw new AppError('ownership_denied', 'Source not found.');
    const file = fileOf(anchor.sourceVersionId);
    const near = !context ? [anchor] : db.find('source_anchors', { sourceVersionId: anchor.sourceVersionId }, { scope }).sort((a, b) => (a.location?.extractedCharStart ?? 0) - (b.location?.extractedCharStart ?? 0));
    const at = near.findIndex(a => a.id === anchor.id), text = a => a ? safe(() => knowledge().anchors(scope, [a.id])[0]?.excerpt, null) : null;
    return { ref, file: { sourceFileId: file?.sourceFileId ?? null, title: lectureOf(file?.filename), filename: file?.filename ?? null }, location: locationOf(anchor, file), anchorId: anchor.id, page: anchor.location?.page ?? null, passage: text(anchor), before: text(near[at - 1]), after: text(near[at + 1]) };
  }

  // ---------- nodes: stored per exam for the published manifest ----------

  // Every row in today's shape whatever wrote it, so a renderer never meets a missing field.
  const shape = m => ({ concepts: [], links: [], children: [], misconceptions: [], lectures: [], example: null, ...m, goals: { now: [], exam: [], ...m.goals } });
  const stored = scope => db.find('course_modules', {}, { scope }).map(shape);
  const current = (rows, view) => rows.length > 0 && rows.every(m => m.knowledgeManifestId === view.manifest.id && m.format === FORMAT);
  const examDayOf = scope => { const d = db.get('exams', scope.examId, scope)?.examDate; return d && !Number.isNaN(Date.parse(d)) ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : null; };
  const ASTRA = ['summary', 'concepts', 'example', 'misconceptions', 'goals', 'source', 'writtenMs', 'writtenAt'];

  /**
   * The nodes of the published manifest, built at once when missing or stale. A unit Astra already wrote keeps its text
   * when what it is built from is unchanged; the other units are queued for Astra (build_modules).
   */
  function ensure(scope) {
    const view = knowledge().published(scope);
    if (!view || db.get('exams', scope.examId)?.knowledgeSource === 'guide') return []; // a guide-backed course's material is its sources/

    const have = stored(scope);
    if (current(have, view)) return have;
    const fresh = outlineModules({ view, anchorInfo: ids => anchorInfo(scope, ids), examDay: examDayOf(scope) });
    // Idempotent: under the write lock, a build another caller finished meanwhile stands, and a unit Astra just wrote is kept.
    const built = db.tx(() => {
      const now = stored(scope);
      if (current(now, view)) return null;
      const old = new Map(now.map(m => [m.id, m]));
      db.prepare('DELETE FROM course_modules WHERE exam_id = ?').run(scope.examId);
      return fresh.map(m => {
        const prev = old.get(m.id), keep = prev?.source === 'astra' && prev.format === FORMAT && prev.inputHash === m.inputHash;
        const record = { ...m, ...(keep ? Object.fromEntries(ASTRA.map(k => [k, prev[k]])) : {}), scope, format: FORMAT, knowledgeManifestId: view.manifest.id, version: view.manifest.version, createdAt: keep ? prev.createdAt : clock.iso(), rowVersion: 0 };
        db.insert('course_modules', record);
        return record;
      });
    });
    if (!built) return stored(scope);
    if (built.some(m => m.kind === 'unit' && m.source !== 'astra')) writer.start(scope, view.manifest.id);
    return built;
  }

  /** The nodes to read: built when needed; when a build cannot finish now (say the database is busy), what exists. */
  const readable = scope => { try { return ensure(scope); } catch (error) { console.error(`[modules] serving stored nodes, build failed: ${error.message}`); return stored(scope); } };

  /** The course's modules for classifiers, in course order: [{ moduleId, kind, title, summary, unitId, topicId, parentId, depth }]. */
  const index = scope => readable(scope).map(m => ({ moduleId: m.id, kind: m.kind, title: m.title, summary: m.summary, unitId: m.unitId, topicId: m.topicId, parentId: m.parentId, depth: m.depth }));

  /**
   * Items from the student's materials, attached to modules (a topic, or a unit for unplaced notes). Each carries a
   * sourceRef, or an anchorId the ref is made from. Deduped by module + sourceRef + kind (the same item may sit in two modules).
   */
  function attach(scope, items) {
    const modules = new Set(ensure(scope).map(m => m.id));
    return db.tx(() => (items || []).map(x => {
      if (!modules.has(x?.moduleId)) throw new AppError('invalid_input', `No module ${x?.moduleId}.`);
      if (!ITEM_KINDS.includes(x.kind)) throw new AppError('invalid_input', `Item kind must be one of ${ITEM_KINDS.join(', ')}.`);
      const sourceRef = x.sourceRef || (x.anchorId ? refOf(x.anchorId) : null);
      if (!sourceRef || typeof x.title !== 'string' || !x.title.trim() || typeof x.markdown !== 'string') throw new AppError('invalid_input', 'An item needs a title, markdown and a sourceRef or anchorId.');
      const existing = db.findOne('module_items', { moduleId: x.moduleId, sourceRef, kind: x.kind }, { scope });
      if (existing) return existing;
      const anchor = findRef(scope, sourceRef)[0];
      const item = { id: newId('item'), scope, moduleId: x.moduleId, kind: x.kind, title: clip(x.title, 200), markdown: String(x.markdown).slice(0, 20_000), solution: typeof x.solution === 'string' ? x.solution.slice(0, 20_000) : null, sourceRef, sourceFileId: x.sourceFileId || (anchor && fileOf(anchor.sourceVersionId)?.sourceFileId) || null, createdAt: clock.iso() };
      db.insert('module_items', item);
      return item;
    }));
  }
  const itemsOf = scope => db.find('module_items', {}, { scope, order: 'created_at' });

  // ---------- live joins and the reading context ----------

  /** Every node with its live fields: mastery (0–100 or null; a unit's is its assessed topics' mean), questions, items. */
  function withLive(scope, nodes = readable(scope)) {
    const mastery = new Map(safe(() => app.services.session.topicProjection(scope).topics, []).map(t => [t.id, t.mastery]));
    const ready = safe(() => app.services.questions.available(scope, {}), []).filter(q => q.dependencyCompatible);
    const items = itemsOf(scope);
    return nodes.map(n => {
      const ids = n.kind === 'unit' ? nodes.filter(x => x.unitId === n.id).map(x => x.topicId) : [n.topicId];
      const marks = ids.map(id => mastery.get(id)).filter(x => x?.status === 'estimated' && typeof x.displayIndex === 'number');
      const live = { mastery: marks.length ? Math.round(marks.reduce((s, x) => s + x.displayIndex, 0) / marks.length) : null, masteryLabel: mastery.get(n.topicId)?.label ?? 'Not assessed', items: items.filter(i => i.moduleId === n.id) };
      const mine = ready.filter(q => ids.includes(q.topicId));
      return { ...n, ...live, questions: n.kind === 'unit' ? { short: mine.filter(q => q.format !== 'exam').length, exam: mine.filter(q => q.format === 'exam').length } : mine.map(q => ({ id: q.questionId, format: q.format === 'exam' ? 'exam' : 'short', difficulty: q.intendedDifficulty })) };
    });
  }

  /** What the renderers read: nodes, concepts, incoming concept links, titles, a node's questions (each on its closest concept), passages. */
  function contextOf(scope, nodes = withLive(scope)) {
    const byId = new Map(nodes.map(n => [n.id, n])), concepts = new Map(), incoming = new Map();
    for (const n of nodes) for (const c of n.concepts || []) concepts.set(c.id, { concept: c, node: n });
    for (const { concept } of concepts.values()) for (const l of concept.links || []) (incoming.get(l.to) || incoming.set(l.to, []).get(l.to)).push({ from: concept.id, relation: l.relation, why: l.why });
    const titleOf = id => byId.get(id)?.title ?? (concepts.has(id) ? `${concepts.get(id).node.title}, "${clip(concepts.get(id).concept.statement, 50)}"` : id);
    const asked = new Map();
    const questionsFor = n => {
      if (!Array.isArray(n.questions)) return [];
      if (!asked.has(n.id)) asked.set(n.id, n.questions.map(q => {
        const prompt = safe(() => { const r = app.services.questions.get(scope, q.id); return r.format === 'exam' ? r.title : r.prompt || r.voiceForm; }, '');
        const w = words(prompt), [score, conceptId] = (n.concepts || []).map(c => [[...words(c.statement)].filter(x => w.has(x)).length, c.id]).sort((a, b) => b[0] - a[0])[0] || [0, null];
        return { ...q, prompt, conceptId: score >= 2 ? conceptId : null };
      }).filter(q => q.prompt));
      return asked.get(n.id);
    };
    const passageOf = ref => ref ? safe(() => source(scope, ref, { context: false }).passage, null) : null;
    return { nodes: byId, concepts, incoming, titleOf, questionsFor, passageOf };
  }

  /** A node or concept by id, with its live fields (a concept also carries its questionIds). */
  function get(scope, id) {
    const ctx = contextOf(scope), node = ctx.nodes.get(id), hit = ctx.concepts.get(id);
    if (node) return { ...node, concepts: (node.concepts || []).map(c => ({ ...c, questionIds: ctx.questionsFor(node).filter(q => q.conceptId === c.id).map(q => q.id) })) };
    return hit ? { ...hit.concept, kind: 'concept', moduleId: hit.node.id, questionIds: ctx.questionsFor(hit.node).filter(q => q.conceptId === hit.concept.id).map(q => q.id) } : null;
  }

  // ---------- the page's source view ----------

  // v8 (agent "ingest"): the page route adds pageImage, the rendered PDF page as a PNG data URL (null for other sources).
  const examSource = (principal, examId, ref) => { const scope = app.auth.examScope(app.auth.requireExam(principal, examId)), out = source(scope, ref), image = db.get('source_anchors', out.anchorId, scope)?.pageImage; return { ...out, pageImage: image ? `data:image/png;base64,${app.blobs.read(image, scope).toString('base64')}` : null }; };

  const writer = installModuleWriter(app, { anchorInfo, examDayOf });

  // A new manifest: the outline at once, Astra after. Exams published before modules existed build on first read.
  app.events.subscribe('modules.knowledge', 'knowledge.published', event => { try { ensure(event.scope); } catch (error) { if (process.env.BACKEND_DEBUG) console.error('modules', error); } });
  app.hooks.examDeleted.push(exam => { for (const t of ['course_modules', 'module_items']) db.prepare(`DELETE FROM ${t} WHERE exam_id = ?`).run(exam.id); });

  app.services.modules = {
    ensure, index, attach, items: itemsOf, get, all: withLive, examSource, source,
    sourceRef: refOf, moduleIdOf,
  };
}
