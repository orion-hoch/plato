import { safe } from '../core/util.mjs';
import { words, overlap, expandTopics, unitOf } from '../core/match.mjs';
import { fail } from '../core/errors.mjs';
import { validate } from '../core/shape.mjs';
import { QUESTION_REQUEST } from './schemas.mjs';

// Questions on the page (v10 split): request_question, a card's question board, a requested question arriving, and a
// question withdrawn when its material changes.

// request_question's difficulty: the intended difficulty of a generated question, and the reservation purpose that prefers it.
const DIFFICULTY = { easier: 'basic_diagnostic', exam_style: 'application', harder: 'transfer', exam: 'application' };
const PURPOSE = { easier: 'probe', exam_style: 'independent_practice', harder: 'transfer', exam: 'independent_practice' };
/**
 * A question as the agent's page holds it until it is shown: wording and answer input, never the answer. An exam
 * problem comes whole (title, setup, parts with points and answer inputs); its voiceForm is only a spoken introduction.
 */
const pageQuestion = q => q.format === 'exam'
  ? { questionId: q.questionId, format: 'exam', title: q.title, setup: q.setup, parts: q.parts, totalPoints: q.totalPoints, estimatedMinutes: q.estimatedMinutes, voiceForm: q.voiceForm }
  : { questionId: q.questionId, voiceForm: q.voiceForm, choices: q.choices ?? null, inputKind: q.inputKind || 'speech', inputSpec: q.inputSpec || {} };

export function installQuestions(K) {
  const { db, events, knowledge, questions, consumer, fresh, loadSession, newTurn, saveSession, scopeOf, serverEvent, txn } = K;

  function safeBoundary(s) {
    if (!s.activeQuestionId) return true;
    if (!K.deliveredQuestionIds(s.id).has(s.activeQuestionId)) return true;
    return db.find('finalized_responses', { sessionId: s.id }).some(r => r.attributedQuestionId === s.activeQuestionId);
  }

  /**
   * The agent asks for a graded question (request_question) and keeps teaching. Without `about`, a ready hopper question
   * for the topic in play is offered at once; otherwise one is generated and offered when ready (requested_question consumer).
   * difficulty 'exam': a multi-part exam problem on a unit, the one `about` names (else the one in play), from the
   * unit's pool at once when there is no `about`, else made by the exam author (minutes).
   */
  function requestQuestion(principal, sessionId, body) {
    validate(QUESTION_REQUEST, body);
    const s0 = loadSession(principal, sessionId);
    if (s0.status !== 'active') fail('invalid_input', 'Questions are requested in a live session.');
    const scope = scopeOf(s0), about = body.about?.trim() || null, exam = body.difficulty === 'exam';
    const view = knowledge().view(scope, s0.pinnedKnowledgeManifestId);
    const examinable = id => expandTopics(view, [id]).some(x => view.topics.find(t => t.topicId === x)?.objectiveVersionIds.length);
    // The topic in play, or its first part with objectives to ask about; for an exam problem, its unit.
    const topicId = exam ? examUnit(view, s0.activeTopicId, about, examinable) : expandTopics(view, s0.activeTopicId ? [s0.activeTopicId] : []).find(id => view.topics.find(t => t.topicId === id)?.objectiveVersionIds.length);
    if (!topicId) fail('content_not_ready', 'No topic with practice material is in play yet.');
    return txn(() => {
      const s = fresh(s0.id);
      if (!about) {
        // One at a time: while a posed question is open there is nothing to offer, and nothing worth making.
        if (!safeBoundary(s)) return { state: 'busy' };
        try {
          const { reservation } = questions().reserve({ scope, sessionId: s.id, epoch: s.epoch, turnId: s.currentTurnId, compatibleKnowledgeManifestId: s.pinnedKnowledgeManifestId, topicId, purpose: PURPOSE[body.difficulty] || 'independent_practice', format: exam ? 'exam' : 'short' });
          return { state: 'ready', question: offer(s, reservation, null) }; // also in the reply, so the page holds it before the tool returns
        } catch (error) { if (error.code !== 'content_not_ready') throw error; } // none ready: make one
      }
      questions().requestCustom(scope, { topicId, narrowTarget: about, intendedDifficulty: DIFFICULTY[body.difficulty] || 'application', format: exam ? 'exam' : 'short', sessionId: s.id, turnId: s.currentTurnId, knowledgeManifestId: s.pinnedKnowledgeManifestId, requestedBy: 'agent' });
      return { state: 'generating' };
    });
  }

  /** The unit an exam problem is asked for: the one whose titles and objectives `about` names best, else the one in play. */
  function examUnit(view, activeTopicId, about, examinable) {
    const inPlay = activeTopicId ? unitOf(view, activeTopicId) : null, asked = words(about);
    const named = id => { const ids = expandTopics(view, [id]); return overlap(asked, [...view.topics.filter(t => ids.includes(t.topicId)).map(t => `${t.title} ${t.description || ''}`), ...view.objectives.filter(o => ids.includes(o.topicId)).map(o => o.statement)].join(' ')); };
    const [score, best] = view.topics.filter(t => !t.parentTopicId && examinable(t.topicId)).map(t => [named(t.topicId) + (t.topicId === inPlay ? 0.5 : 0), t.topicId]).sort((a, b) => b[0] - a[0])[0] || [0, null];
    return score >= 1 ? best : inPlay && examinable(inPlay) ? inPlay : null;
  }

  /** A reserved question becomes the session's question, held on the agent's page until it is posed. */
  function offer(s, reservation, about) {
    const scope = scopeOf(s);
    // The one it replaces was never posed: back to the pool.
    if (s.activeReservationId && s.activeReservationId !== reservation.id && !K.deliveredQuestionIds(s.id).has(s.activeQuestionId)) safe(() => questions().release(scope, s.activeReservationId, { sessionEpoch: s.epoch }));
    const next = saveSession({ ...fresh(s.id), activeQuestionId: reservation.questionId, activeReservationId: reservation.id, requestedQuestionId: reservation.questionId, pendingCustomRequestId: null });
    const question = pageQuestion(questions().speakingForm(scope, reservation.questionId));
    serverEvent(next, 'question.ready', { about, question });
    return question;
  }

  // A question the agent asked for (request_question) is offered when it is ready, if the session is still on its topic
  // and no posed question is open; otherwise it stays in the pool (§5.5). The agent hears when one it asked for will not come.
  events.subscribe('session.requested_question', ['question.ready', 'question.generation_failed'], consumer(ev => {
    const ready = ev.eventType === 'question.ready';
    const requestId = ready ? safe(() => questions().get(ev.scope, ev.payload.questionId).generationRequestId, null) : ev.payload.generationRequestId;
    const request = requestId ? safe(() => questions().customStatus(ev.scope, requestId), null) : null;
    const s = request?.sessionId ? fresh(request.sessionId) : null;
    if (!s || s.status !== 'active' || !(request.requestedBy === 'agent' || s.pendingCustomRequestId === requestId)) return;
    if (!s.activeTopicId) return;
    const view = knowledge().view(scopeOf(s), s.pinnedKnowledgeManifestId);
    // Still on its topic (or a parent of it); an exam problem's unit holds the topic in play.
    if (!expandTopics(view, [s.activeTopicId]).includes(request.topicId) && !(request.format === 'exam' && expandTopics(view, [request.topicId]).includes(s.activeTopicId))) return;
    if (!ready) { if (request.requestedBy === 'agent') serverEvent(s, 'question.failed', { about: request.narrowTarget }); return; }
    if (!safeBoundary(s)) return;
    const reserved = safe(() => questions().reserve({ scope: scopeOf(s), sessionId: s.id, epoch: s.epoch, turnId: s.currentTurnId, compatibleKnowledgeManifestId: s.pinnedKnowledgeManifestId, topicId: request.topicId, preferredQuestionId: ev.payload.questionId }), null);
    if (reserved?.question.id === ev.payload.questionId) offer(s, reserved.reservation, request.narrowTarget);
    else if (reserved) questions().release(scopeOf(s), reserved.reservation.id, { sessionEpoch: s.epoch }); // not the one asked for
  }));

  events.subscribe('session.question_invalidated', ['question.invalidated'], consumer(ev => {
    for (const s of db.find('sessions', { examId: ev.scope.examId, status: 'active' })) {
      if (s.activeQuestionId !== ev.payload.questionId) continue;
      saveSession({ ...s, withdrawnQuestionIds: [...(s.withdrawnQuestionIds || []), ev.payload.questionId] });
      const { session } = K.bumpEpoch(s.id, 'question_invalidated', { clearQuestion: true });
      serverEvent(session, 'question.withdrawn', { questionId: ev.payload.questionId });
      const turn = newTurn(session, { state: 'planning' });
      const next = saveSession({ ...fresh(s.id), currentTurnId: turn.id });
      K.enqueuePlan(next, turn);
    }
  }));

  // A card's question board: that bank or exam question reserved for the session and held on the page until posed
  // (question.ready, as request_question does); null when none can be offered now.
  const offerQuestion = (sessionId, questionId) => txn(() => {
    const cur = fresh(sessionId), scope = scopeOf(cur), q = questions().get(scope, questionId);
    if (!safeBoundary(cur) || q?.state !== 'ready') return null;
    const { reservation } = questions().reserve({ scope, sessionId: cur.id, epoch: cur.epoch, turnId: cur.currentTurnId, compatibleKnowledgeManifestId: cur.pinnedKnowledgeManifestId, topicId: q.topicId, preferredQuestionId: questionId, purpose: 'independent_practice', format: q.format === 'exam' ? 'exam' : 'short' });
    if (reservation.questionId !== questionId) { questions().release(scope, reservation.id, { sessionEpoch: cur.epoch }); return null; }
    return offer(cur, reservation, null);
  });

  Object.assign(K, { safeBoundary, requestQuestion, examUnit, offer, offerQuestion });
}
