import { newId, safe } from '../core/util.mjs';
import { topicOfConcept } from '../modules/outline.mjs';

// The learner model (v10, docs/history/teacher-architecture.md §6.1): an ability θ with uncertainty σ per concept and per topic,
// on the logit scale where an item of level ℓ has difficulty D[ℓ], so P(success) = 1 / (1 + e^−(θ − D[ℓ])). Evidence is an
// append-only stream (learner_observations): the director's classified answers (no model call) and the rubric grading of
// posed graded questions. θ/σ are a fold over it; a topic combines its own evidence with its concepts'; untested concepts
// and topics borrow from their knowledge-tree links with a wider σ. Mastery bars (mastery_projections and their history)
// are projected from it after each observation; an interpolated value is never shown as mastery.
// v2 (system-spec §10, learner/v2.mjs) adds rows `{ v: 2, kind: 'observe' | 'expose', kcs, … }` on the course model's KCs:
// the same update with a guessing floor, credit weighted by evidence rank and enacted level, and σ that grows after
// teaching. A KC's evidence also counts toward its topic's bar.

export const D = { recall: -1, explain: -0.4, apply: 0.3, transfer: 1, exam: 1.6, core: 0.3, beyond: 2.2 };
export const PRIOR = 2.25; const DRIFT = 0.02; // σ² of what was never seen; σ² growth per day away
const SPREAD = 1; // ω²: how far a concept's ability may sit from its topic's
const LINK = { prerequisite: 1, supports: 1, application_of: 1, related: 2 }; // λ² per relation; contrasts_with carries none
const OUTCOME = { correct: 1, partial: 0.5, misconception: 0, stuck: 0 };
const ASSIST = { independent: 0, uncertain: 0.5, assisted: 0.5, revealed: 1 };
const LEVEL_OF = { basic_diagnostic: 'recall', application: 'apply', transfer: 'transfer' };
const CAPABILITY = { recall: 'recall', explain: 'explanation', apply: 'application', transfer: 'transfer' };
// v2 credit for a success (a failure is never discounted): by evidence rank (spec §3: a familiar item's success may be
// the answer remembered; rank 4's help is in its assistance; rank 5 is self-report and moves nothing) and by the engagement
// level actually enacted on an element (spec §15b). θ is current strength: delayed evidence outranks immediate through the
// half-life, mastery's later-day success and the what-works residuals (v2.mjs), not by deflating immediate successes.
const RANK_W = { 1: 1, 2: 1, 3: 0.5, 4: 1, 5: 0 };
const ENACTED = { viewing: 0, responding: 0.4, changing: 0.7, constructing: 1, presenting: 1 };
const Q = 0.2, Q_SIGNAL = 0.05; // σ² added by a teaching move (they may have learned), and per question, gloss or look-back while reading
// No evidence is dropped (spec §10): a verdict's `trust` (executed or exact 1, a judge its calibrated agreement, uncertain
// ≈ .3) weights it both ways; a correct attempt with `reasoningShown: false` counts REASONING, raised toward 1 by the
// explanation that follows it (`explainedBy`).
const REASONING = 0.6;
export const DAY = 86_400_000;
export const logistic = x => 1 / (1 + Math.exp(-x));
/** A key's topic: a concept's, a namespaced KC's ("<topicId>:k1"), else the key itself. */
export const topicOf = key => key.startsWith('con_') ? topicOfConcept(key) : key.split(':')[0];
export const days = (from, to) => from && to ? Math.max(0, (Date.parse(to) - Date.parse(from)) / DAY) : 0;
/** A prior combined with measurements [{ theta, v }], each weighted by its precision 1/v. */
export const combine = (prior, ms) => { const pi = 1 / prior.v + ms.reduce((a, m) => a + 1 / m.v, 0); return { theta: (prior.theta / prior.v + ms.reduce((a, m) => a + m.theta / m.v, 0)) / pi, v: 1 / pi }; };

/**
 * What one estimate shows: the chance of an apply-level success as a 0–100 index, its band and how sure it is. A v2
 * topic's estimate carries `factor` (P that no open wrong model of its KCs fires) and `cap` (69, below secure, while one is
 * confirmed and unresolved): the effective chance, so bars and goals by need never call a misconception secure.
 */
export function shown({ theta, v, factor = 1, cap = 100 }) {
  const sigma = Math.sqrt(v), at = level => Math.min(cap, Math.round(100 * factor * logistic(theta - D[level]))), displayIndex = at('apply');
  return { displayIndex, ordinal: displayIndex < 40 ? 'emerging' : displayIndex < 70 ? 'developing' : 'secure', sigma: Math.round(sigma * 100) / 100, uncertainty: sigma < 0.6 ? 'low' : sigma < 1 ? 'medium' : 'high', at };
}

/**
 * One event applied to a key's state (doc §6.1, with s² = 1/I and k₀ = 1/I for the item's information: the logistic
 * model's own update), generalized to P = g + (1 − g)·σ(θ − d) for a closed item's guessing floor g. Credit for a success
 * is weighted by `wS` (help, rank, enacted level), a failure by `wF`; σ shrinks with evidence and grows with time away
 * and with teaching (`q`), never past the prior. An event with no outcome (an exposure) moves only σ.
 */
function update(st, e, at) {
  const v0 = Math.min(PRIOR, st.v + DRIFT * days(st.at, at) + (e.q || 0));
  if (e.o == null) return { ...st, v: v0, at };
  // v2 predicts over θ's uncertainty (MacKay: σ(κ·(θ − d)), κ = 1/√(1 + πσ²/8)), which keeps σ honest on binary evidence.
  const k = e.v1 ? 1 : 1 / Math.sqrt(1 + Math.PI * v0 / 8);
  const s = logistic(k * (st.theta - e.d)), g = e.g || 0, p = g + (1 - g) * s, w = e.o >= p ? e.wS : e.wF;
  if (!w && !e.v1) return { ...st, v: v0, at }; // nothing produced (viewing, self-report); v1 still counted the answer
  // dP/dθ over P(1 − P): 1 without a guessing floor or correction, so the v1 update is unchanged.
  const pq = Math.max(1e-12, p * (1 - p)), ratio = k * (g ? (1 - g) * s * (1 - s) / pq : 1);
  const v = v0 / (1 + v0 * Math.max(0.05 * (1 - g) ** 2 * k * k, ratio * ratio * pq) * w);
  const next = { ...st, theta: st.theta + v * w * (e.o - p) * ratio, v, at, n: st.n + 1, answers: st.answers + 1 };
  const o = e.v1;
  if (o?.outcome === 1) { next.correct += 1; if (!next.level || D[o.level] > D[next.level]) next.level = o.level; }
  if (o?.misconception && !next.seen.includes(o.misconception)) next.seen = [...next.seen, o.misconception];
  if (o?.outcome === 1 && o.repairs && next.seen.includes(o.repairs)) { next.seen = next.seen.filter(x => x !== o.repairs); next.cleared = [...new Set([...next.cleared, o.repairs])]; }
  if (!o && e.o >= 0.8) next.correct += 1;
  return next;
}

/** The events one stored row makes, per key: v1 rows on concept and topic keys; v2 rows on KCs and checked step subgoals. */
function eventsOf(o, explained) {
  if (o.v !== 2) return o.keys.map(key => ({ key, topicId: topicOf(key), d: D[o.level], g: 0, o: o.outcome, wS: 1 - o.assistance, wF: 1, v1: o }));
  const kc = key => ({ key, topicId: o.topics?.[key] ?? topicOf(key), kc: true });
  if (o.kind === 'expose') return o.kcs.map(key => ({ ...kc(key), q: Q + Q_SIGNAL * Math.min(6, o.signals || 0), o: null }));
  const none = o.rank === 5 || o.family === 'E10'; // self-report and confidence checks: calibration only
  // A failure a wrong model explains is evidence about that model (v2.mjs), mostly not about the correct one's strength.
  const byModel = 1 - 0.8 * Math.max(0, ...(o.wrongModelHits || []).map(h => h.p)), trust = o.trust ?? 1;
  const reasoned = o.reasoningShown === false ? REASONING + (1 - REASONING) * restored(explained, o) : 1;
  const base = { d: o.d, g: o.g, wS: none ? 0 : RANK_W[o.rank] * (1 - o.assistance) * (ENACTED[o.enacted] ?? 1) * trust * reasoned, wF: none || o.enacted === 'viewing' ? 0 : byModel * trust };
  return [
    ...o.kcs.map(key => ({ ...kc(key), ...base, q: o.taughtBy ? Q : 0, o: o.outcome })),
    ...(o.steps || []).filter(x => x.kc && !o.kcs.includes(x.kc)).map(x => ({ ...kc(x.kc), ...base, o: x.outcome })),
  ];
}

/**
 * How far an explanation restores an attempt made without reasoning: its trust × (2·outcome − 1), by attempt (observation
 * or response id). The explanation names it in `explains`, else it is the next E5 on the same item in the same session.
 */
export function explainedBy(rows) {
  const out = new Map(), open = new Map();
  for (const o of rows) {
    if (o.v !== 2 || o.kind !== 'observe') continue;
    const key = o.itemId ? `${o.sessionId}|${o.itemId}` : null, id = o.explains ?? (o.family === 'E5' && key ? open.get(key) : null);
    if (id && o.outcome > 0.5) out.set(id, Math.max(out.get(id) ?? 0, (o.trust ?? 1) * (2 * o.outcome - 1)));
    if (key && o.reasoningShown === false && o.outcome >= 0.8) open.set(key, o.id);
  }
  return out;
}
export const restored = (explained, o) => explained.get(o.id) ?? (o.responseId && explained.get(o.responseId)) ?? 0;

const fresh = () => ({ theta: 0, v: PRIOR, at: null, n: 0, answers: 0, correct: 0, level: null, seen: [], cleared: [] });

/**
 * Per key (a concept, topic or KC id), θ/σ and what was seen, folded in order. The rubric's grade of an answer replaces
 * the director's reading of it; a corrected transcript replaces the original; evidence from before a topic's meaning
 * changed (`since`) no longer counts. With `now`, σ also grows for the time since each key's last evidence. `start(event)`
 * gives a new key its prior (default θ 0, σ² PRIOR); `visit(row, events, keys)` sees each row before it is applied.
 */
export function fold(rows, since, now = null, { start, visit } = {}) {
  const graded = new Set(rows.filter(o => o.source === 'grader').map(o => o.responseId).filter(Boolean));
  const superseded = new Set(rows.map(o => o.supersedes).filter(Boolean));
  const explained = explainedBy(rows), keys = new Map();
  for (const o of rows) {
    if ((o.source === 'director' && graded.has(o.responseId)) || (o.evidenceId && superseded.has(o.evidenceId))) continue;
    const events = eventsOf(o, explained).filter(e => !(since.get(e.topicId) > o.createdAt));
    visit?.(o, events, keys);
    for (const e of events) keys.set(e.key, update(keys.get(e.key) || { ...fresh(), ...start?.(e), topicId: e.topicId, kc: !!e.kc }, e, o.createdAt));
  }
  if (now) for (const st of keys.values()) st.v = Math.min(PRIOR, st.v + DRIFT * days(st.at, now));
  return keys;
}

export function createLearnerModel(app, { ensureTopic, question }) {
  const { db, clock } = app;

  /** A graded answer's findings as observations: per topic, the share of its criteria met, at the question's level. */
  function graded(local, q, evidence) {
    const byTopic = new Map();
    for (const f of local.findings) if (f.outcome !== 'insufficient') (byTopic.get(f.topicId) || byTopic.set(f.topicId, []).get(f.topicId)).push(f);
    const level = q.format === 'exam' ? 'exam' : LEVEL_OF[q.intendedDifficulty] || 'apply';
    return [...byTopic].map(([topicId, fs]) => ({
      source: 'grader', how: local.runs?.[0]?.adapter === 'deterministic' ? 'exact' : 'rubric', keys: [topicId], level,
      outcome: fs.filter(f => f.outcome === 'supported').length / fs.length, assistance: Math.max(...fs.map(f => ASSIST[f.assistanceLevel] ?? 0)),
      responseId: evidence.responseId, evidenceId: evidence.id, supersedes: evidence.supersedesEvidenceId ?? null, sessionId: evidence.sessionId,
    }));
  }

  /** An exam graded before this model: its rubric-graded answers become its first observations, once, in their order. */
  function backfill(scope) {
    if (db.findOne('learner_observations', {}, { scope })) return;
    const latest = new Map();
    for (const l of db.find('local_answer_assessments', {}, { scope, order: 'created_at' })) latest.set(l.interactionEvidenceId, l);
    db.tx(() => {
      for (const l of latest.values()) {
        const e = db.get('interaction_evidence', l.interactionEvidenceId, scope), q = e && safe(() => question(scope, l.questionId), null);
        if (q) for (const o of graded(l, q, e)) db.insert('learner_observations', { id: newId('obs'), scope, createdAt: e.responseAt || l.createdAt, assistance: 0, misconception: null, repairs: null, ...o });
      }
    });
  }

  const rowsOf = scope => db.find('learner_observations', {}, { scope, order: 'created_at, rowid' });
  const sinceOf = scope => new Map(db.find('mastery_projections', {}, { scope }).filter(p => p.segmentStartedAt).map(p => [p.topicId, p.segmentStartedAt]));

  /** v2's per-topic { factor, cap } (v2.mjs sets `api.effective`), else none. */
  const effectiveOf = scope => safe(() => api.effective?.(scope), null) || new Map();

  /** Observed topics: each topic's own evidence as its prior, its observed concepts and KCs as measurements (ω² apart). */
  function observedTopics(view, keys, effective = new Map()) {
    const byTopic = new Map();
    for (const [key, st] of keys) if ((key.startsWith('con_') || st.kc) && key !== st.topicId && st.answers) (byTopic.get(st.topicId) || byTopic.set(st.topicId, []).get(st.topicId)).push(st);
    const out = new Map();
    for (const t of view.topics) {
      const own = keys.get(t.topicId), mine = byTopic.get(t.topicId) || [];
      if (!own && !mine.length) continue;
      out.set(t.topicId, { ...combine(own || { theta: 0, v: PRIOR }, mine.map(c => ({ theta: c.theta, v: c.v + SPREAD }))), source: 'observed', n: (own?.n || 0) + mine.reduce((a, c) => a + c.n, 0), ...effective.get(t.topicId) });
    }
    return out;
  }

  /**
   * Every topic of the published manifest and every concept of its modules: observed, interpolated (a precision-weighted
   * mean of observed neighbours, each a link's λ² wider, shrunk toward the prior) or the prior. σ grows to now.
   */
  function estimates(scope) {
    const km = db.get('exams', scope.examId, scope)?.publishedKnowledgeManifestId;
    if (!km) return { topics: new Map(), concepts: new Map() };
    backfill(scope);
    const view = app.services.knowledge.view(scope, km), keys = fold(rowsOf(scope), sinceOf(scope), clock.iso());
    const topics = observedTopics(view, keys, effectiveOf(scope)), concepts = new Map();
    for (const [key, st] of keys) if (key.startsWith('con_')) concepts.set(key, { ...st, source: 'observed' });
    // Neighbours share evidence (a topic holds its concepts'), so an inference is never surer than its surest source, nor less sure than the prior.
    const borrow = ms => { if (!ms.length) return { theta: 0, v: PRIOR, source: 'prior', n: 0 }; const c = combine({ theta: 0, v: PRIOR }, ms); return { theta: c.theta, v: Math.min(PRIOR, Math.max(c.v, Math.min(...ms.map(m => m.v)))), source: 'interpolated', n: 0 }; };
    const near = (id, relation) => { const e = topics.get(id); return e?.source === 'observed' && LINK[relation] ? [{ theta: e.theta, v: e.v + LINK[relation] }] : []; };
    // Topics: the graph's typed edges, both ways, and parent and children as related.
    const edges = new Map();
    const link = (a, b, relation) => (edges.get(a) || edges.set(a, []).get(a)).push([b, relation]);
    for (const e of view.edges) { link(e.fromTopicId, e.toTopicId, e.type); link(e.toTopicId, e.fromTopicId, e.type); }
    for (const t of view.topics) if (t.parentTopicId) { link(t.topicId, t.parentTopicId, 'related'); link(t.parentTopicId, t.topicId, 'related'); }
    for (const t of view.topics) if (!topics.has(t.topicId)) topics.set(t.topicId, borrow((edges.get(t.topicId) || []).flatMap(([id, rel]) => near(id, rel))));
    // Concepts: their topic (ω² apart), their own links and the links observed concepts make to them.
    const nodes = safe(() => app.services.modules.ensure(scope), []), incoming = new Map();
    for (const n of nodes) for (const c of n.concepts || []) for (const l of c.links || []) (incoming.get(l.to) || incoming.set(l.to, []).get(l.to)).push({ to: c.id, relation: l.relation });
    for (const n of nodes) for (const c of n.concepts || []) {
      if (concepts.has(c.id)) continue;
      const home = topics.get(n.topicId), ms = home?.source === 'observed' ? [{ theta: home.theta, v: home.v + SPREAD }] : [];
      for (const l of [...(c.links || []), ...(incoming.get(c.id) || [])]) {
        const other = concepts.get(l.to)?.source === 'observed' ? concepts.get(l.to) : null;
        if (other && LINK[l.relation]) ms.push({ theta: other.theta, v: other.v + LINK[l.relation] });
        else if (l.to.startsWith('mod_')) ms.push(...near(l.to.slice(4), l.relation));
      }
      concepts.set(c.id, borrow(ms));
    }
    const out = m => new Map([...m].map(([id, e]) => [id, { ...e, ...shown(e) }]));
    return { topics: out(topics), concepts: out(concepts) };
  }

  /** The concepts' states as the director reads them: mastery and how sure, the highest level answered right, misconceptions seen and cleared. */
  function conceptStates(scope, ids) {
    const { concepts } = estimates(scope);
    return Object.fromEntries(ids.filter(id => concepts.has(id)).map(id => { const c = concepts.get(id); return [id, { mastery: c.displayIndex, sigma: c.sigma, source: c.source, level: c.level ?? null, answers: c.answers ?? 0, correct: c.correct ?? 0, seen: c.seen ?? [], cleared: c.cleared ?? [] }]; }));
  }

  /** The observed topics' mastery as the page and the planners read it: a projection row and a history point per change. */
  function project(scope, trigger) {
    const km = db.get('exams', scope.examId, scope)?.publishedKnowledgeManifestId;
    if (!km) return;
    const topics = observedTopics(app.services.knowledge.view(scope, km), fold(rowsOf(scope), sinceOf(scope)), effectiveOf(scope));
    for (const [topicId, e] of topics) {
      const p = ensureTopic(scope, topicId), s = shown(e);
      const estimate = { status: 'estimated', displayIndex: s.displayIndex, ordinal: s.ordinal, distribution: null, uncertainty: s.uncertainty, basis: `θ ${e.theta.toFixed(2)} ± ${s.sigma.toFixed(2)} from ${e.n} observation${e.n === 1 ? '' : 's'}${e.factor < 1 ? `, × ${e.factor.toFixed(2)} for open wrong models` : ''}` };
      if (JSON.stringify(p.estimate) === JSON.stringify(estimate)) continue;
      const capabilities = Object.entries(CAPABILITY).map(([level, capability]) => { const i = s.at(level); return { capability, estimate: { ...estimate, displayIndex: i, ordinal: i < 40 ? 'emerging' : i < 70 ? 'developing' : 'secure', basis: `P(${level}) from θ` }, evidenceIds: [] }; });
      const next = db.update('mastery_projections', { ...p, projectionVersion: p.projectionVersion + 1, currentAssessmentId: null, estimate, capabilities, lastEvidenceAt: trigger.createdAt, updatedAt: clock.iso() });
      // A corrected transcript's point names the point it corrects.
      const corrects = trigger.supersedes ? db.find('mastery_history_points', { topicId }, { scope, order: 'sequence DESC' }).find(x => x.evidenceId === trigger.supersedes) : null;
      const last = db.prepare('SELECT MAX(sequence) AS s FROM mastery_history_points WHERE exam_id = ? AND topic_id = ?').get(scope.examId, topicId);
      db.insert('mastery_history_points', { id: newId('mhp'), scope, createdAt: clock.iso(), topicId, sequence: (last?.s ?? 0) + 1, assessmentId: null, evidenceId: trigger.evidenceId ?? trigger.responseId ?? null, projectionVersion: next.projectionVersion, estimate, capabilities, effectiveEvidenceAt: trigger.createdAt, recordedAt: clock.iso(), kind: trigger.supersedes ? 'correction' : 'assessment', comparabilitySegmentId: next.comparabilitySegmentId, supersedesHistoryPointId: corrects?.id ?? null });
    }
  }

  /**
   * One observation { source: director|grader, how, keys: concept or topic ids, level, outcome 0–1 | kind, assistance 0–1,
   * misconception?, repairs?, responseId?, evidenceId?, supersedes?, sessionId? }, stored and projected. null when it names nothing.
   */
  function observe(scope, o) {
    const outcome = o.outcome ?? OUTCOME[o.kind];
    if (!o.keys?.length || !(o.level in D) || !(outcome >= 0 && outcome <= 1)) return null;
    return db.tx(() => {
      backfill(scope);
      const row = { id: newId('obs'), scope, createdAt: clock.iso(), source: o.source, how: o.how ?? null, kind: o.kind ?? null, keys: [...new Set(o.keys)], level: o.level, outcome, assistance: o.assistance ?? 0, misconception: o.misconception ?? null, repairs: o.repairs ?? null, responseId: o.responseId ?? null, evidenceId: o.evidenceId ?? null, supersedes: o.supersedes ?? null, sessionId: o.sessionId ?? null };
      db.insert('learner_observations', row);
      project(scope, row);
      return row;
    });
  }

  /** A v2 row (learner/v2.mjs), appended; an observation also moves its KCs' topic bars. */
  function record(scope, row) {
    return db.tx(() => {
      backfill(scope);
      db.insert('learner_observations', row);
      if (row.kind === 'observe') project(scope, row);
      return row;
    });
  }

  const api = { observe, record, graded, estimates, conceptStates, rows: rowsOf, since: sinceOf, effective: null };
  return api;
}
