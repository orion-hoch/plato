import { newId, safe } from '../core/util.mjs';
import { expandTopics } from '../core/match.mjs';
import { fail } from '../core/errors.mjs';
import { validate } from '../core/shape.mjs';
import { currentGoal, finished } from './agenda.mjs';
import { FOCUS_CREATE, FOCUS_PATCH } from './schemas.mjs';

// What the student sees of their standing (v10 split): the topic projection, progress with history, and focus sections.

const LABELS = { emerging: 'Emerging', developing: 'Developing', secure: 'Secure' };

export function installProgress(K) {
  const { app, db, clock, knowledge, learner, txn } = K;

  // ---------- views ----------

  function projectionsOf(scope) {
    let p;
    try { p = learner().projections(scope); } catch { p = null; }
    if (!p) return new Map();
    return p instanceof Map ? p : new Map(Object.entries(p));
  }
  function personalViewFor(scope, kmId) {
    try { return learner().personalView(scope, kmId) || { manifest: null, explanations: [], edges: [], emphasis: [], pending: true }; }
    catch { return { manifest: null, explanations: [], edges: [], emphasis: [], pending: true }; }
  }
  function profileSnapshotId(scope) {
    try { return learner().profile(scope)?.snapshot?.id || db.get('exams', scope.examId).currentProfileSnapshotId; }
    catch { return db.get('exams', scope.examId).currentProfileSnapshotId; }
  }

  /** Minimal student projection (§10): hierarchy plus current mastery, nothing internal. */
  function topicProjection(scope) {
    const view = knowledge().published(scope);
    if (!view) return { examId: scope.examId, knowledgeVersion: null, personalVersion: null, topics: [] };
    const projections = projectionsOf(scope);
    const pv = personalViewFor(scope, view.manifest.id);
    return {
      examId: scope.examId, knowledgeVersion: view.manifest.version, personalVersion: pv.manifest?.version ?? null,
      topics: view.topics.map(t => {
        const e = projections.get(t.topicId)?.estimate;
        const estimated = e?.status === 'estimated';
        return { id: t.topicId, parentId: t.parentTopicId, title: t.title, mastery: { status: estimated ? 'estimated' : 'unknown', displayIndex: estimated ? e.displayIndex ?? null : null, label: estimated ? LABELS[e.ordinal] || 'Not assessed' : 'Not assessed', updatedAt: estimated ? projections.get(t.topicId)?.lastEvidenceAt ?? null : null } };
      }),
    };
  }

  /** Student-visible progress (user override of §1.3/§10): mastery per topic with its history. No internals. */
  function progress(scope) {
    const projection = topicProjection(scope);
    const view = knowledge().published(scope);
    const projections = projectionsOf(scope);
    const label = e => e?.status === 'estimated' ? LABELS[e.ordinal] || 'Not assessed' : 'Not assessed';
    const titles = new Map(projection.topics.map(t => [t.id, t.title]));
    const recent = [];
    const topics = projection.topics.map(t => {
      const points = safe(() => learner().history(scope, t.id), []);
      const history = points.map(p => ({ at: p.effectiveEvidenceAt, displayIndex: p.estimate?.status === 'estimated' ? p.estimate.displayIndex ?? null : null, label: label(p.estimate), kind: p.kind, segment: p.comparabilitySegmentId }));
      history.forEach((h, i) => {
        const prev = i ? history[i - 1] : null;
        const comparable = prev && prev.segment === h.segment;
        const direction = !comparable || prev.displayIndex === null || h.displayIndex === null ? 'same' : h.displayIndex > prev.displayIndex ? 'up' : h.displayIndex < prev.displayIndex ? 'down' : 'same';
        recent.push({ at: h.at, topicId: t.id, topicTitle: t.title, from: prev ? prev.label : null, to: h.label, direction });
      });
      return {
        id: t.id, parentId: t.parentId, title: t.title, mastery: t.mastery, history,
        capabilities: (projections.get(t.id)?.capabilities || []).map(c => ({ capability: c.capability, label: label(c.estimate) })),
        objectives: (view?.objectives || []).filter(o => o.topicId === t.id).map(o => ({ statement: o.statement, capabilities: o.capabilities })),
      };
    });
    const assessed = topics.filter(t => t.mastery.status === 'estimated');
    const indexed = assessed.filter(t => typeof t.mastery.displayIndex === 'number');
    const rank = ['Emerging', 'Developing', 'Secure'], ranks = assessed.map(t => rank.indexOf(t.mastery.label)).filter(i => i >= 0).sort((a, b) => a - b);
    return {
      examId: scope.examId, knowledgeVersion: projection.knowledgeVersion,
      overall: {
        label: ranks.length ? rank[ranks[Math.floor((ranks.length - 1) / 2)]] : 'Not assessed',
        displayIndex: indexed.length ? Math.round(indexed.reduce((sum, t) => sum + t.mastery.displayIndex, 0) / indexed.length) : null,
        assessedTopics: assessed.length, totalTopics: topics.length,
      },
      topics,
      focus: (() => { const a = activeSection(scope); return a ? sectionView(scope, a) : null; })(),
      recent: recent.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12).map(r => ({ ...r, topicTitle: titles.get(r.topicId) })),
    };
  }

  // ---------- focus sections (student-created goals; user override) ----------

  const RANK = { 'Not assessed': 0, Emerging: 1, Developing: 2, Secure: 3 };

  function sectionView(scope, section, projection = topicProjection(scope), view = knowledge().published(scope)) {
    const expanded = view ? expandTopics(view, section.topicIds) : section.topicIds;
    const assessable = view ? expanded.filter(id => view.topics.find(t => t.topicId === id)?.objectiveVersionIds.length) : expanded;
    const topics = (assessable.length ? assessable : expanded).map(topicId => {
      const t = projection.topics.find(x => x.id === topicId);
      const label = t?.mastery.label || 'Not assessed';
      return { topicId, title: t?.title || topicId, label, atGoal: RANK[label] >= RANK[section.goal] };
    });
    return { id: section.id, name: section.name, topicIds: section.topicIds, goal: section.goal, active: section.active, rowVersion: section.rowVersion, createdAt: section.createdAt, progress: { atGoal: topics.filter(t => t.atGoal).length, total: topics.length, topics } };
  }

  function activeSection(scope) { return db.findOne('focus_sections', { active: true }, { scope }); }

  /** Active focus for other modules: expanded topic ids plus progress. */
  function activeFocus(scope) {
    const section = activeSection(scope);
    if (!section) return null;
    const v = sectionView(scope, section);
    const view = knowledge().published(scope);
    return { sectionId: section.id, name: section.name, goal: section.goal, topicIds: view ? expandTopics(view, section.topicIds) : section.topicIds, progress: v.progress };
  }

  function checkTopics(scope, topicIds) {
    const view = knowledge().published(scope);
    if (!view) fail('content_not_ready', 'Topics appear once your material is processed.');
    const known = new Set(view.topics.map(t => t.topicId));
    if (topicIds.some(id => !known.has(id))) fail('invalid_input', 'A chosen topic is not in this exam.');
    return [...new Set(topicIds)];
  }

  /** Activation is explicit intent: it becomes a learner goal fact and a learner change. */
  function announceFocus(scope, section) {
    safe(() => learner().setFocus(scope, section ? { sectionId: section.id, name: section.name, topicIds: section.topicIds, goal: section.goal } : null), null);
  }

  function focusList(principal, examId) {
    const scope = app.auth.examScope(app.auth.requireExam(principal, examId));
    const projection = topicProjection(scope), view = knowledge().published(scope);
    const sections = db.find('focus_sections', {}, { scope, order: 'rowid' }).map(x => sectionView(scope, x, projection, view));
    return { sections, activeSectionId: sections.find(x => x.active)?.id ?? null };
  }

  function focusCreate(principal, examId, body) {
    validate(FOCUS_CREATE, body);
    const scope = app.auth.examScope(app.auth.requireExam(principal, examId));
    const topicIds = checkTopics(scope, body.topicIds);
    const section = db.tx(() => {
      if (body.activate) for (const other of db.find('focus_sections', { active: true }, { scope })) db.update('focus_sections', { ...other, active: false, updatedAt: clock.iso() });
      const created = { id: newId('focus'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, name: body.name.trim(), topicIds, goal: body.goal, active: !!body.activate };
      db.insert('focus_sections', created);
      if (created.active) announceFocus(scope, created);
      return created;
    });
    if (section.active) safe(() => txn(() => focusAgendas(scope, section)));
    return sectionView(scope, section);
  }

  /**
   * v7: a focus section turned on leads each live session's agenda, as a pressed topic does: its (first) topic becomes
   * the current goal, an open goal already on it or a new one. No note: the page tells Plato "[Focus changed] ...".
   */
  function focusAgendas(scope, section) {
    for (const s of db.find('sessions', { examId: scope.examId, status: 'active' }, { scope })) {
      const view = s.agenda && knowledge().view(scope, s.pinnedKnowledgeManifestId), topic = view?.topics.find(t => t.topicId === section.topicIds[0]);
      if (!topic) continue;
      const ids = new Set(expandTopics(view, [topic.topicId])), on = g => !!g && !finished(g) && g.topicIds.length > 0 && g.topicIds.every(id => ids.has(id));
      if (on(currentGoal(s.agenda))) continue;
      const have = s.agenda.goals.find(on);
      K.moveAgenda(s, { action: 'focus', goalId: have?.id ?? null, goal: have ? null : K.topicGoal(scope, view, topic, { why: 'their focus' }) });
    }
  }

  function focusPatch(principal, examId, sectionId, body) {
    validate(FOCUS_PATCH, body);
    const scope = app.auth.examScope(app.auth.requireExam(principal, examId));
    const updated = db.tx(() => {
      const current = db.must('focus_sections', sectionId, scope, 'Focus section');
      if (current.rowVersion !== body.expectedRowVersion) fail('version_conflict', 'This focus changed; reload it.');
      const next = { ...current, updatedAt: clock.iso() };
      if (body.name !== undefined) next.name = body.name.trim();
      if (body.topicIds !== undefined) next.topicIds = checkTopics(scope, body.topicIds);
      if (body.goal !== undefined) next.goal = body.goal;
      if (body.active !== undefined) next.active = body.active;
      if (next.active && !current.active) for (const other of db.find('focus_sections', { active: true }, { scope })) if (other.id !== sectionId) db.update('focus_sections', { ...other, active: false, updatedAt: clock.iso() });
      const saved = db.update('focus_sections', next, { expectedRowVersion: body.expectedRowVersion });
      const changed = saved.active !== current.active || (saved.active && (saved.goal !== current.goal || saved.topicIds.join() !== current.topicIds.join() || saved.name !== current.name));
      if (changed) announceFocus(scope, saved.active ? saved : null);
      return saved;
    });
    if (updated.active) safe(() => txn(() => focusAgendas(scope, updated)));
    return sectionView(scope, updated);
  }

  function focusDelete(principal, examId, sectionId) {
    const scope = app.auth.examScope(app.auth.requireExam(principal, examId));
    db.tx(() => {
      const current = db.must('focus_sections', sectionId, scope, 'Focus section');
      db.prepare('DELETE FROM focus_sections WHERE id = ?').run(current.id);
      if (current.active) announceFocus(scope, null);
    });
    return { deleted: true };
  }

  /** With no topic chosen, start on the focus topic furthest from its goal. */
  function focusStartTopic(scope) {
    const section = activeSection(scope);
    if (!section) return null;
    const topics = sectionView(scope, section).progress.topics;
    return [...topics].sort((a, b) => RANK[a.label] - RANK[b.label])[0]?.topicId ?? null;
  }

  Object.assign(K, { projectionsOf, personalViewFor, profileSnapshotId, topicProjection, progress, RANK, sectionView, activeSection, activeFocus, checkTopics, announceFocus, focusList, focusCreate, focusAgendas, focusPatch, focusDelete, focusStartTopic });
}
