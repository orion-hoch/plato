import { newId, safe } from '../core/util.mjs';
import { AppError, fail } from '../core/errors.mjs';
import { validate } from '../core/shape.mjs';
import { currentGoal, finished } from './agenda.mjs';
import { START, RESUME, END, FEEDBACK } from './schemas.mjs';

// A session's life (v10 split): start, the turn job (the director takes each turn), new material adopted at turn
// boundaries, resume, end and feedback.

export function installTurns(K) {
  const { app, db, clock, events, jobs, knowledge, learner, consumer, flushLive, fresh, loadSession, newTurn, saveSession, scopeOf, serverEvent, setTurn, txn } = K;

  // ---------- start ----------

  function startResult(s) {
    const scope = scopeOf(s);
    const view = knowledge().view(scope, s.pinnedKnowledgeManifestId);
    const topic = s.activeTopicId ? view.topics.find(t => t.topicId === s.activeTopicId) : null;
    const mastery = topic ? K.topicProjection(scope).topics.find(t => t.id === topic.topicId)?.mastery : null;
    const resume = s.activeTopicId ? K.latestResume(scope, s.activeTopicId) : null;
    return {
      sessionId: s.id, epoch: s.epoch, status: s.status, pinnedKnowledgeManifestId: s.pinnedKnowledgeManifestId, pinnedPersonalManifestId: s.pinnedPersonalManifestId,
      currentTurnId: s.currentTurnId, currentTopic: topic ? { topicId: topic.topicId, title: topic.title, mastery } : null,
      resume: resume ? { unfinishedProblem: resume.unfinishedProblem, nextSuggestedStep: resume.nextSuggestedStep } : null,
      voiceTransport: { mode: 'agent', eventsPath: `/v1/sessions/${s.id}/events` },
      agenda: s.agenda ?? null,
      mode: 'cards', card: safe(() => app.services.director.current(s), null), // the current card (v2, shared/cards.mjs)
    };
  }

  // A refresh never restarts anything: `resume: true` returns the learner's open session for the exam (the page's remembered id,
  // else the newest) when it was active within RESUME_MS, with its current card, the event sequence to subscribe from and what
  // Plato last said; else a new session as usual (`resumed: false`).
  // 19 Oct: a day, not 3 hours (coming back after dinner is still the same sitting); and the page's own session comes back
  // even if something ended it, unless a newer one on this exam has begun since (a code reload had ended theirs mid-lesson).
  const RESUME_MS = 24 * 3600_000;
  function resumable(scope, examId, sessionId) {
    const recent = x => x && x.scope?.examId === examId && clock.now() - Date.parse(x.updatedAt || x.createdAt) < RESUME_MS;
    const live = x => recent(x) && x.status === 'active';
    const ours = db.find('sessions', {}, { scope }).filter(x => x.scope?.examId === examId);
    const mine = sessionId ? safe(() => db.get('sessions', sessionId, scope), null) : null;
    if (live(mine)) return mine;
    if (recent(mine) && mine.status === 'ended' && !ours.some(x => x.id !== mine.id && String(x.createdAt) > String(mine.createdAt))) {
      const { endedAt, ...open } = mine;
      return saveSession({ ...open, status: 'active' });
    }
    const newest = ours.filter(live).sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0]; // this learner's, this exam's
    return newest ?? null;
  }
  function resumed(s) {
    const sequence = db.prepare('SELECT MAX(sequence) AS s FROM session_server_events WHERE session_id = ?').get(s.id)?.s || 0;
    const units = db.find('output_units', { sessionId: s.id }).filter(u => u.surface === 'voice').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(-60);
    const spoken = units.map(u => ({ text: u.text, at: u.createdAt, interrupted: (db.get('session_outputs', u.outputId)?.state ?? 'complete') !== 'complete' }));
    return { ...startResult(s), resumed: true, sequence, spoken };
  }

  function start(principal, examId, body = {}) {
    validate(START, body);
    const exam = app.auth.requireExam(principal, examId);
    const scope = app.auth.examScope(exam);
    if (body.resume) { const open = resumable(scope, exam.id, body.sessionId ?? null); if (open) return resumed(open); }
    if (body.clientSessionRequestId) {
      const existing = db.findOne('sessions', { examId: exam.id, clientSessionRequestId: body.clientSessionRequestId }, { scope });
      if (existing) return startResult(existing);
    }
    const view = knowledge().published(scope);
    if (!view || !view.manifest.eligibleForTutoring) {
      const status = safe(() => knowledge().status(principal, examId), { examId, status: exam.status, files: [], knowledgeVersion: null });
      throw new AppError('content_not_ready', 'This exam has no published study material yet.', { details: status, issues: [{ code: 'content_not_ready', severity: 'blocking', message: `Exam status: ${status.status}`, affected: [], evidence: [], resolution: 'open' }] });
    }
    if (body.topicId && !view.topics.some(t => t.topicId === body.topicId)) fail('invalid_input', 'That topic is not in this exam.');
    K.ensureTicker();
    const pv = K.personalViewFor(scope, view.manifest.id);
    const pinnedPersonal = pv.manifest && pv.manifest.knowledgeManifestId === view.manifest.id ? pv.manifest.id : null;
    return txn(() => {
      // The agenda first (a pressed topic leads it). A normal session with no topic chosen starts on its first goal's topic.
      // An active focus section leads like a pressed topic (v7), so the agenda and the director follow the same thread.
      const agenda = K.afresh(K.buildAgenda(scope, view, body.topicId ?? K.activeSection(scope)?.topicIds[0] ?? null)), goal = currentGoal(agenda);
      const goalTopic = agenda && !agenda.intro ? goal?.topicIds.find(id => view.topics.some(t => t.topicId === id)) : null;
      let s = {
        id: newId('ses'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, clientSessionRequestId: body.clientSessionRequestId ?? null,
        status: 'active', epoch: 1, activeTopicId: body.topicId ?? K.focusStartTopic(scope) ?? goalTopic ?? null, currentTurnId: null, activeQuestionId: null, activeReservationId: null,
        pinnedKnowledgeManifestId: view.manifest.id, pinnedPersonalManifestId: pinnedPersonal, personalizationPending: !pinnedPersonal,
        nextTurnSequence: 1, lastClientEventSequence: 0, lastAcknowledgedServerEventSequence: 0,
        adoptionPending: null, withdrawnQuestionIds: [], resumes: {}, transport: 'agent', agenda, // v10: the actor speaks, the director decides
      };
      db.insert('sessions', s);
      let resumeStateId = null;
      if (s.activeTopicId) {
        const r = K.revalidateResume(s, K.latestResume(scope, s.activeTopicId));
        if (r.resume) { resumeStateId = r.resume.id; s = saveSession({ ...s, activeQuestionId: r.questionId, activeReservationId: r.reservationId }); }
      }
      const turn = newTurn(s, { state: 'planning', extra: { resumeStateId } });
      s = saveSession({ ...s, currentTurnId: turn.id, nextTurnSequence: turn.sequence + 1 });
      serverEvent(s, 'session.started', { epoch: s.epoch, pinnedKnowledgeManifestId: s.pinnedKnowledgeManifestId, pinnedPersonalManifestId: s.pinnedPersonalManifestId, turnId: turn.id, agenda: s.agenda });
      enqueuePlan(s, turn);
      app.services.director.start(fresh(s.id)); // card 1 from the current goal's lesson, at once
      return { ...startResult(fresh(s.id)), resumed: false };
    });
  }

  function enqueuePlan(s, turn) {
    jobs.enqueue({ scope: scopeOf(s), type: 'plan_turn', idempotencyKey: `plan_turn:${turn.id}:${s.epoch}`, payload: { sessionId: s.id, turnId: turn.id, epoch: s.epoch }, priority: 50 });
  }

  /** Adopt a pending knowledge/personal pair at a safe boundary (§6). New material is named by its new top-level topics. */
  function adoptIfReady(sessionId) {
    const s = fresh(sessionId);
    if (!s.adoptionPending || !K.safeBoundary(s)) return s;
    const scope = scopeOf(s);
    const km = s.adoptionPending.knowledgeManifestId;
    const pv = K.personalViewFor(scope, km);
    const pm = pv.manifest && pv.manifest.knowledgeManifestId === km ? pv.manifest.id : null;
    // Everything that can fail is read before the first write (callers may swallow a failure inside their transaction).
    const view = knowledge().view(scope, km);
    const before = new Set(knowledge().view(scope, s.pinnedKnowledgeManifestId).topics.map(t => t.topicId));
    const added = new Set(view.topics.filter(t => !before.has(t.topicId)).map(t => t.topicId));
    // A topic retired in the new manifest is saved for resumption; the agenda leads on.
    const kept = s.activeTopicId && view.topics.some(t => t.topicId === s.activeTopicId);
    if (s.activeTopicId && !kept) K.saveResume(s, s.activeTopicId);
    saveSession({ ...s, pinnedKnowledgeManifestId: km, pinnedPersonalManifestId: pm, personalizationPending: !pm, adoptionPending: null, activeTopicId: kept ? s.activeTopicId : null });
    const { session } = K.bumpEpoch(s.id, 'content_adoption', { clearQuestion: true });
    serverEvent(session, 'adoption', { knowledgeManifestId: km, personalManifestId: pm, personalizationPending: !pm, newTopicTitles: view.topics.filter(t => added.has(t.topicId) && !added.has(t.parentTopicId)).map(t => t.title) });
    return fresh(s.id);
  }

  /**
   * New material reaches a live session between turns, so a quiet student hears of it; never mid-turn (the turn's own job
   * adopts it first). Personal explanations alone wait for the next turn. A failure leaves it pending for the next turn.
   */
  function adoptNewMaterial(sessionId) {
    const s = fresh(sessionId);
    if (s.status !== 'active' || !s.adoptionPending || s.adoptionPending.knowledgeManifestId === s.pinnedKnowledgeManifestId) return;
    if (db.get('turns', s.currentTurnId)?.state === 'listening') safe(() => adoptIfReady(s.id));
  }

  /**
   * The plan_turn job (the name kept, so turns queued before v10 still run): new material is adopted at the turn's boundary,
   * then the director takes the turn (classifies the answer, issues the next card) and the turn completes.
   */
  async function planTurn({ sessionId, turnId, epoch }, ctx) {
    let s = fresh(sessionId);
    const turn = db.get('turns', turnId);
    if (!s || !turn || s.status !== 'active' || s.epoch !== epoch || s.currentTurnId !== turnId || !['planning', 'response_committed'].includes(turn.state)) return { state: 'stale' };
    s = ctx.commit(() => adoptIfReady(sessionId)); flushLive();
    const response = turn.finalizedResponseId ? db.get('finalized_responses', turn.finalizedResponseId) : null;
    await app.services.director.turn(s, response);
    txn(() => {
      const t = db.get('turns', turn.id);
      if (t && ['planning', 'response_committed'].includes(t.state)) { setTurn(t, { state: 'speaking' }); finishTurn(fresh(s.id), { turnId: turn.id }); }
      // The intro's get_to_know, sent to the background by their own request, closes quietly once nothing is unknown.
      const cur = fresh(s.id), bg = cur.agenda?.goals.find(g => g.mode === 'get_to_know' && g.background && !finished(g));
      if (bg && !K.introUnknown(scopeOf(cur)).length) K.moveAgenda(cur, { action: 'done', goalId: bg.id, note: 'Nothing left to ask.' });
    });
    return { resultRefs: [] };
  }

  function finishTurn(s, output) {
    const turn = db.get('turns', output.turnId);
    if (!turn || turn.id !== s.currentTurnId || turn.state !== 'speaking') return;
    setTurn(turn, { state: 'complete' });
    const next = newTurn(s, { state: 'listening' });
    const saved = saveSession({ ...fresh(s.id), currentTurnId: next.id, nextTurnSequence: next.sequence + 1 });
    serverEvent(saved, 'turn.listening', { turnId: next.id, ...K.questionState(saved) });
    adoptNewMaterial(saved.id); // material that landed while this turn's plan was made
  }

  // ---------- resume, end, feedback ----------

  async function resume(principal, sessionId, body) {
    validate(RESUME, body);
    const s = loadSession(principal, sessionId);
    if (s.resumes?.[body.clientResumeId]) return s.resumes[body.clientResumeId];
    if (s.status === 'ended') fail('invalid_input', 'This session has ended.');
    const out = txn(() => {
      const cur = fresh(s.id);
      const { session } = K.bumpEpoch(cur.id, 'reconnect');
      const listening = newTurn(session, { state: 'listening' });
      const lastAck = Math.max(cur.lastAcknowledgedServerEventSequence || 0, body.lastAcknowledgedServerSequence);
      let next = saveSession({ ...fresh(cur.id), status: 'active', currentTurnId: listening.id, lastAcknowledgedServerEventSequence: lastAck });
      serverEvent(next, 'session.resumed', { epoch: next.epoch, turnId: listening.id });
      // Missed control/state events only: tutoring output is never replayed as if delivered.
      const missed = db.find('session_server_events', { sessionId: cur.id }, { order: 'sequence' }).filter(e => e.sequence > body.lastAcknowledgedServerSequence && e.type !== 'output.unit').map(e => ({ sequence: e.sequence, type: e.type, epoch: e.epoch, payload: e.payload, createdAt: e.createdAt }));
      const resumeRecord = next.activeTopicId ? K.latestResume(scopeOf(next), next.activeTopicId) : null;
      const result = {
        epoch: next.epoch, status: 'active', currentTurnId: listening.id, activeTopicId: next.activeTopicId, activeQuestionId: next.activeQuestionId,
        pinnedKnowledgeManifestId: next.pinnedKnowledgeManifestId, pinnedPersonalManifestId: next.pinnedPersonalManifestId,
        missedEvents: missed, audioReplayed: false,
        resume: resumeRecord ? { unfinishedProblem: resumeRecord.unfinishedProblem, nextSuggestedStep: resumeRecord.nextSuggestedStep } : null,
      };
      next = saveSession({ ...next, resumes: { ...(next.resumes || {}), [body.clientResumeId]: result } });
      return result;
    });
    return out;
  }

  async function end(principal, sessionId, body) {
    validate(END, body);
    const s = loadSession(principal, sessionId);
    if (s.status === 'ended') return { status: 'ended', epoch: s.epoch };
    if (body.expectedEpoch !== s.epoch) fail('version_conflict', 'The session moved on; refresh its state.');
    const out = txn(() => {
      const resumeRecord = K.saveResume(s, s.activeTopicId);
      const { session } = K.bumpEpoch(s.id, 'end');
      saveSession({ ...session, status: 'ended', endedAt: clock.iso() });
      return { resumeStateId: resumeRecord?.id ?? null, epoch: session.epoch };
    });
    return { status: 'ended', epoch: out.epoch, resumeStateId: out.resumeStateId };
  }

  function feedback(principal, sessionId, body) {
    validate(FEEDBACK, body);
    const s = loadSession(principal, sessionId);
    if (body.expectedEpoch !== s.epoch) fail('version_conflict', 'The session moved on; refresh its state.');
    return learner().recordFeedback(scopeOf(s), { sessionId: s.id, turnId: s.currentTurnId, topicIds: body.topicIds, text: body.text, type: body.type, explicit: true, applicability: body.applicability || 'exam', correctionOfResponseId: body.correctionOfResponseId ?? null });
  }

  jobs.register('plan_turn', planTurn, { maxAttempts: 1 });

  events.subscribe('session.adoption', ['knowledge.published', 'personal.published'], consumer(ev => {
    for (const s of db.find('sessions', { examId: ev.scope.examId, status: ['active', 'disconnected'] })) {
      const km = ev.eventType === 'knowledge.published' ? ev.payload.newManifestId : ev.payload.knowledgeManifestId;
      const pm = ev.eventType === 'personal.published' ? ev.payload.newPersonalManifestId : null;
      if (km === s.pinnedKnowledgeManifestId && (!pm || pm === s.pinnedPersonalManifestId)) continue;
      if (ev.eventType === 'personal.published' && km !== s.pinnedKnowledgeManifestId && km !== s.adoptionPending?.knowledgeManifestId) continue;
      saveSession({ ...s, adoptionPending: { knowledgeManifestId: km, personalManifestId: pm, eventId: ev.id } });
      adoptNewMaterial(s.id);
    }
  }));

  // v7 ingest: a new file's items were filed under the modules: live sessions get one "[New material ready] …" line (backend/ingest).
  events.subscribe('session.material', 'material.attached', consumer(ev => {
    for (const s of db.find('sessions', { examId: ev.scope.examId, status: ['active', 'disconnected'] })) serverEvent(s, 'material.attached', { line: ev.payload.line, sourceFileId: ev.payload.sourceFileId });
  }));

  Object.assign(K, { startResult, start, enqueuePlan, adoptIfReady, adoptNewMaterial, planTurn, finishTurn, resume, end, feedback });
}
