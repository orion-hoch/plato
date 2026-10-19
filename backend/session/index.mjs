import { newId } from '../core/util.mjs';
import { AppError } from '../core/errors.mjs';
import { workIdentity } from '../providers/contracts.mjs';
import { installLedger } from './ledger.mjs';
import { installProgress } from './progress.mjs';
import { installGoals } from './goals.mjs';
import { installQuestions } from './questions.mjs';
import { installTurns } from './turns.mjs';
import { installResponses } from './responses.mjs';
import { installDrawings } from './drawings.mjs';

// Live session coordinator (spec §4.6, §7). The coordinator is the sole authority for active topic, epoch, question,
// agenda and delivery attribution. Provider calls run outside DB transactions; their results come back through
// epoch/turn freshness checks (CAS). v10: cards only: the director (backend/director) takes each turn, the actor (the
// ElevenLabs agent the page talks to) speaks.
//
// The parts (v10 split) share one kernel `K`: this file's plumbing, then each part's functions. A part calls another's
// as K.name(…), bound when called, so the order they install in does not matter.

export function installSession(app) {
  const { db, clock, events } = app;
  const listeners = new Map();
  let pendingLive = [];

  // ---------- events: sequenced, persisted, pushed live after their transaction commits ----------

  const scopeOf = session => ({ ...session.scope });
  function flushLive() {
    const batch = pendingLive; pendingLive = [];
    for (const ev of batch) for (const fn of listeners.get(ev.sessionId) || []) { try { fn(ev); } catch { /* listeners never block */ } }
  }
  function txn(fn) {
    try { const result = db.tx(fn); flushLive(); return result; } catch (error) { pendingLive = []; throw error; }
  }
  /** Sequenced, persisted session event (control/state/output text). */
  function serverEvent(session, type, payload) {
    const last = db.prepare('SELECT MAX(sequence) AS s FROM session_server_events WHERE session_id = ?').get(session.id);
    const ev = { id: newId('sse'), scope: scopeOf(session), createdAt: clock.iso(), sessionId: session.id, sequence: (last?.s || 0) + 1, type, epoch: db.get('sessions', session.id)?.epoch ?? session.epoch, payload };
    db.insert('session_server_events', ev);
    pendingLive.push(ev);
    return ev;
  }
  /** Event consumers run inside the outbox transaction: their live events go out after it commits, never after a rollback. */
  const consumer = handle => ev => {
    const mark = pendingLive.length;
    try { handle(ev); } catch (error) { pendingLive.length = mark; throw error; }
    queueMicrotask(flushLive);
  };

  function eventsAfter(principal, sessionId, cursor = 0) {
    const s = loadSession(principal, sessionId);
    return db.find('session_server_events', { sessionId: s.id }, { order: 'sequence' }).filter(e => e.sequence > Number(cursor || 0)).map(e => ({ sequence: e.sequence, type: e.type, epoch: e.epoch, payload: e.payload, createdAt: e.createdAt }));
  }
  function subscribe(sessionId, fn) {
    if (!listeners.has(sessionId)) listeners.set(sessionId, new Set());
    listeners.get(sessionId).add(fn);
    return () => listeners.get(sessionId)?.delete(fn);
  }
  function trace(principal, sessionId) {
    app.auth.requireAdmin(principal);
    const s = db.get('sessions', sessionId, { tenantId: principal.tenantId });
    if (!s) throw new AppError('ownership_denied', 'Session not found.');
    const by = table => db.find(table, { sessionId }, { order: 'rowid' });
    return { session: s, turns: by('turns'), responses: by('finalized_responses'), outputs: by('session_outputs'), units: by('output_units'), deliveryLedger: by('delivery_events') };
  }

  // ---------- sessions and turns ----------

  const fresh = id => db.get('sessions', id);
  function saveSession(next) { return db.update('sessions', { ...next, updatedAt: clock.iso() }); }
  function loadSession(principal, sessionId) {
    const session = db.get('sessions', sessionId, app.auth.learnerScope(principal));
    if (!session) throw new AppError('ownership_denied', 'Session not found.');
    app.auth.requireExam(principal, session.scope.examId);
    return session;
  }
  const work = (scope, key, input, budget) => workIdentity({ scope, idempotencyKey: key, input, clock, budget });
  function newTurn(session, { state, topicId = session.activeTopicId, extra = {} }) {
    const last = db.prepare('SELECT MAX(sequence) AS s FROM turns WHERE session_id = ?').get(session.id);
    const turn = { id: newId('turn'), scope: scopeOf(session), createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, sessionId: session.id, sequence: (last?.s || 0) + 1, epoch: session.epoch, topicId, state, questionId: null, planId: null, contextPacketId: null, finalizedResponseId: null, ...extra };
    db.insert('turns', turn);
    return turn;
  }
  const setTurn = (turn, patch) => db.update('turns', { ...db.get('turns', turn.id), ...patch, updatedAt: clock.iso() });

  const K = {
    app, db, clock, config: app.config, events, jobs: app.jobs, listeners,
    knowledge: () => app.services.knowledge, learner: () => app.services.learner, questions: () => app.services.questions,
    scopeOf, flushLive, txn, serverEvent, consumer, fresh, saveSession, loadSession, work, newTurn, setTurn, eventsAfter, subscribe, trace,
  };
  for (const install of [installLedger, installProgress, installGoals, installQuestions, installTurns, installResponses, installDrawings]) install(K);

  app.services.session = {
    start: K.start, submitResponse: K.submitResponse, feedback: K.feedback, resume: K.resume, end: K.end, agentEvents: K.agentEvents, requestQuestion: K.requestQuestion,
    focusList: K.focusList, focusCreate: K.focusCreate, focusPatch: K.focusPatch, focusDelete: K.focusDelete, activeFocus: K.activeFocus,
    drawings: K.drawings, drawingShapes: K.drawingShapes, progress: K.progress,
    events: eventsAfter, subscribe, topicProjection: K.topicProjection, trace, tick: K.tick,
    get: (principal, sessionId) => loadSession(principal, sessionId),
    // Internals for the director (never routed): its events, a goal met on evidence, the session as it is, what was said,
    // the intro (what is unknown, a unit's basic question), the next goal by need, change_topic and a card's question board.
    emit: (sessionId, type, payload) => txn(() => serverEvent(fresh(sessionId), type, payload)),
    advance: K.advance, peek: fresh, dialogue: K.dialogueOf,
    unknown: K.unknown, basicQuestion: K.basicQuestion, nextByNeed: K.nextByNeed, inOrder: K.inOrder, neighbours: K.neighbours, setLectureFrom: K.setLectureFrom, student: K.student, changeTopic: K.changeTopic, offerQuestion: K.offerQuestion,
  };
}
