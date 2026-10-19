import { newId, safe } from '../core/util.mjs';
import { AppError } from '../core/errors.mjs';

// What was delivered (v10 split of the session coordinator): output units and their delivery events, playback, the
// dialogue as said, assistance and prompt ledgers, epochs, and the topic resume records.

const STAGE_RANK = { generated: 1, queued: 2, cancelled: 3, delivery_unknown: 3, playback_started: 4, played: 5 };
const AUDIBLE = new Set(['playback_started', 'played', 'delivery_unknown']);
const ASSIST_KIND = { hint: 'hint', worked_step: 'worked_step', answer: 'answer_reveal', explanation: 'scaffolding' };
const EXPOSURE_KIND = { hint: 'hint_played', worked_step: 'worked_example_delivered', answer: 'answer_delivered' };

export function installLedger(K) {
  const { db, clock, events, learner, questions, fresh, saveSession, scopeOf, serverEvent } = K;

  // ---------- delivery ledger ----------

  const unitsOf = (sessionId, filter = () => true) => db.find('output_units', { sessionId }).filter(filter);
  function appendDelivery(unit, stage, confirmedBy, { isPartial = false, textSpan = null, note = null } = {}) {
    const output = db.get('session_outputs', unit.outputId);
    const count = db.prepare('SELECT COUNT(*) AS n FROM delivery_events WHERE output_id = ?').get(unit.outputId).n;
    const event = {
      id: newId('dlv'), scope: unit.scope, createdAt: clock.iso(), sessionId: unit.sessionId, turnId: unit.turnId, epoch: unit.epoch, outputId: unit.outputId,
      sequence: count + 1, questionId: unit.questionId, reservationId: unit.questionId && unit.questionId === output?.questionId ? output.reservationId : null,
      semanticUnitId: unit.id, questionRenderingId: unit.questionRenderingId, kind: unit.kind, text: unit.text, textSpan,
      audioStartMs: unit.audioStartMs, audioEndMs: unit.audioEndMs, stage, confirmedBy, isPartial, occurredAt: clock.iso(), note,
    };
    db.insert('delivery_events', event);
    const current = db.get('output_units', unit.id);
    const cur = current.stage;
    // Actual playback facts always win (late acks reconcile); otherwise stages only move forward before playback.
    const advance = stage === 'played' || (stage === 'playback_started' && cur !== 'played')
      || (STAGE_RANK[cur] < STAGE_RANK.playback_started && STAGE_RANK[stage] > STAGE_RANK[cur]);
    if (advance) db.replace('output_units', { ...current, stage, isPartial: stage === 'played' ? false : stage === 'playback_started' ? isPartial : current.isPartial, textSpan: stage === 'played' ? { start: 0, end: current.text.length } : textSpan ?? current.textSpan ?? null });
    return event;
  }

  /** Questions whose prompt was audible (or possibly audible) in this session. */
  const deliveredQuestionIds = sessionId => new Set(unitsOf(sessionId, u => u.kind === 'prompt' && u.questionId && AUDIBLE.has(u.stage)).map(u => u.questionId));
  /** The session's question as the client should treat it: posed and being answered, or waiting to be shown. */
  function questionState(s) {
    const posed = !!s.activeQuestionId && deliveredQuestionIds(s.id).has(s.activeQuestionId);
    return { activeQuestionId: posed ? s.activeQuestionId : null, pendingQuestionId: posed ? null : s.activeQuestionId ?? null };
  }

  const playedText = unit => unit.stage === 'played' ? unit.text : unit.textSpan ? unit.text.slice(unit.textSpan.start, unit.textSpan.end) : '';

  /** What was actually said, in turn order: student responses and delivered tutor text, the page marked as such. */
  function dialogueOf(sessionId) {
    const byTurn = new Map();
    const add = (turnId, at, entry) => byTurn.set(turnId, [...(byTurn.get(turnId) || []), { at, entry }]);
    for (const r of db.find('finalized_responses', { sessionId })) add(r.turnId, r.createdAt, { turnId: r.turnId, speaker: 'student', text: r.drawing ? `[Written on the page] ${r.text}` : r.text, evidenceIds: r.result?.evidenceId ? [r.result.evidenceId] : [] });
    for (const u of unitsOf(sessionId, u => STAGE_RANK[u.stage] >= STAGE_RANK.queued && u.stage !== 'cancelled' && !u.late)) {
      const text = u.stage === 'queued' ? `${u.text} [delivery unconfirmed]` : u.stage === 'delivery_unknown' ? `${u.text} [delivery unknown]` : playedText(u) || u.text;
      add(u.turnId, u.createdAt, { turnId: u.turnId, speaker: 'tutor', text: u.surface === 'board' ? `[On the page] ${text}` : text, evidenceIds: [] });
    }
    return db.find('turns', { sessionId }, { order: 'sequence' }).flatMap(t => (byTurn.get(t.id) || []).sort((a, b) => a.at.localeCompare(b.at)).map(x => x.entry));
  }

  /** Actually delivered assistance for a question: played spans only (§7.3). */
  function assistanceFor(sessionId, questionId) {
    if (!questionId) return [];
    const ids = unitsOf(sessionId, u => u.questionId === questionId && ASSIST_KIND[u.kind] && u.kind !== 'explanation' && AUDIBLE.has(u.stage));
    return ids.map(u => {
      const deliveryEventIds = db.find('delivery_events', { sessionId, semanticUnitId: u.id }).filter(d => AUDIBLE.has(d.stage)).map(d => d.id);
      const extent = u.stage === 'played' ? 'complete' : u.stage === 'playback_started' && u.textSpan ? 'partial' : 'uncertain';
      return { questionId, semanticUnitId: u.id, kind: ASSIST_KIND[u.kind], text: extent === 'uncertain' ? u.text : playedText(u), deliveryEventIds, extent, recordedAt: clock.iso() };
    });
  }

  /** Reconstruct the actually delivered prompt and its status. */
  function promptLedger(sessionId, questionId) {
    const units = unitsOf(sessionId, u => u.questionId === questionId && u.kind === 'prompt' && AUDIBLE.has(u.stage));
    if (!units.length) return { snapshot: '', deliveryEventIds: [], status: 'incomplete_prompt', renderingId: null, compatibility: 'unknown' };
    const unit = units[units.length - 1];
    const deliveryEventIds = db.find('delivery_events', { sessionId, semanticUnitId: unit.id }).map(d => d.id);
    const drift = units.some(u => u.promptDrift);
    const status = drift ? 'prompt_drift' : unit.stage === 'played' ? 'eligible' : unit.stage === 'delivery_unknown' ? 'delivery_uncertain' : 'incomplete_prompt';
    const snapshot = unit.stage === 'played' ? unit.text : unit.stage === 'delivery_unknown' ? `${unit.text} [delivery unknown]` : `${playedText(unit)} [unplayed: ${unit.text.slice(unit.textSpan?.end ?? 0)}]`;
    return { snapshot, deliveryEventIds, status, renderingId: unit.questionRenderingId, compatibility: drift ? 'material_drift' : unit.stage === 'delivery_unknown' ? 'unknown' : 'approved' };
  }

  /** Playback acknowledgment: the only way a unit becomes played (§5.4). */
  function recordPlayback(s, { outputId, semanticUnitId, playedThroughMs, confirmedBy }) {
    const unit = db.get('output_units', semanticUnitId);
    if (!unit || unit.sessionId !== s.id || (outputId && unit.outputId !== outputId)) throw new AppError('invalid_input', 'That output does not belong to this session.');
    const scope = scopeOf(s);
    const duration = unit.audioEndMs != null && unit.audioStartMs != null ? unit.audioEndMs - unit.audioStartMs : null;
    const full = playedThroughMs == null || (duration != null && playedThroughMs >= duration);
    const stage = full ? 'played' : 'playback_started';
    const textSpan = full ? { start: 0, end: unit.text.length } : duration ? { start: 0, end: Math.floor(unit.text.length * Math.min(1, playedThroughMs / duration)) } : null;
    const delivery = appendDelivery(unit, stage, confirmedBy, { isPartial: !full, textSpan });
    events.emit({ scope, eventType: 'delivery.confirmed', aggregateType: 'session', aggregateId: s.id, payload: { deliveryEventId: delivery.id, outputId: unit.outputId, semanticUnitId: unit.id, extent: full ? 'complete' : 'partial', questionId: unit.questionId }, idempotencyKey: `delivery.confirmed:${delivery.id}` });
    if (unit.questionId) {
      const output = db.get('session_outputs', unit.outputId);
      if (unit.kind === 'prompt') {
        const already = db.find('delivery_events', { sessionId: s.id, questionId: unit.questionId }).some(d => d.kind === 'prompt' && AUDIBLE.has(d.stage) && d.id !== delivery.id && !/^prompt_drift/.test(d.note || '')); // a drifted rendering never counts as the approved prompt
        if (!already && output.reservationId) safe(() => questions().markDelivered(scope, { reservationId: output.reservationId, deliveryEventIds: [delivery.id], extent: full ? 'complete' : 'partial' }));
      } else if (EXPOSURE_KIND[unit.kind]) {
        safe(() => questions().recordExposure(scope, { questionId: unit.questionId, sessionId: s.id, turnId: unit.turnId, kind: EXPOSURE_KIND[unit.kind], deliveryEventIds: [delivery.id], evidenceId: null }));
      }
    }
    return delivery;
  }

  // ---------- epochs ----------

  /** Increment the epoch: cancel streaming outputs (drop queued units, keep played), release an unposed question. */
  function bumpEpoch(sessionId, reason, { releaseUndelivered = true, clearQuestion = false } = {}) {
    const s = fresh(sessionId);
    const cancelled = [];
    // Cancel generation, and drop every queued-but-unplayed unit (generation may already be complete).
    const pending = unitsOf(sessionId, u => STAGE_RANK[u.stage] < STAGE_RANK.cancelled);
    const outputIds = new Set([...db.find('session_outputs', { sessionId, state: 'streaming' }).map(o => o.id), ...pending.map(u => u.outputId)]);
    for (const outputId of outputIds) {
      const out = db.get('session_outputs', outputId);
      if (out.state === 'streaming') db.update('session_outputs', { ...out, state: 'cancelled', cancelledAt: clock.iso(), cancelReason: reason });
      for (const unit of pending.filter(u => u.outputId === outputId)) appendDelivery(unit, 'cancelled', 'none', { note: reason });
      cancelled.push({ outputId, epoch: out.epoch });
    }
    let { activeQuestionId, activeReservationId } = s;
    const delivered = activeQuestionId && deliveredQuestionIds(sessionId).has(activeQuestionId);
    if (activeReservationId && !delivered && releaseUndelivered) {
      try { questions().release(scopeOf(s), activeReservationId, { sessionEpoch: s.epoch }); } catch { /* reservation may already be expired */ }
      activeQuestionId = null; activeReservationId = null;
    }
    if (clearQuestion) { activeQuestionId = null; activeReservationId = null; }
    const next = saveSession({ ...s, epoch: s.epoch + 1, activeQuestionId, activeReservationId });
    events.emit({ scope: scopeOf(s), eventType: 'session.epoch_changed', aggregateType: 'session', aggregateId: s.id, aggregateVersion: next.epoch, payload: { sessionId: s.id, oldEpoch: s.epoch, newEpoch: next.epoch, reason, cancelledOutputIds: cancelled.map(c => c.outputId) }, idempotencyKey: `epoch:${s.id}:${next.epoch}` });
    serverEvent(next, 'epoch.changed', { oldEpoch: s.epoch, newEpoch: next.epoch, reason, cancelledOutputIds: cancelled.map(c => c.outputId) });
    return { session: next, cancelled };
  }

  // ---------- resume state ----------

  function latestResume(scope, topicId) {
    return db.find('topic_resume_states', { examId: scope.examId, topicId }, { scope, order: 'version DESC', limit: 1 })[0] || null;
  }
  function saveResume(s, topicId) {
    if (!topicId) return null;
    const scope = scopeOf(s);
    const qid = s.activeQuestionId && deliveredQuestionIds(s.id).has(s.activeQuestionId) ? s.activeQuestionId : null;
    const responses = db.find('finalized_responses', { sessionId: s.id }).filter(r => r.topicId === topicId);
    let diagnoses = [];
    try { diagnoses = (learner().topicStates(scope, [topicId])[0]?.diagnoses || []).filter(d => ['provisional', 'supported'].includes(d.status)); } catch { /* learner state optional */ }
    const prior = latestResume(scope, topicId);
    const resume = {
      id: newId('rsm'), scope, createdAt: clock.iso(), topicId, version: (prior?.version || 0) + 1, sessionId: s.id,
      knowledgeManifestId: s.pinnedKnowledgeManifestId, personalManifestId: s.pinnedPersonalManifestId,
      objectiveVersionIds: [], unfinishedQuestionId: qid, unfinishedProblem: qid ? promptLedger(s.id, qid).snapshot : null,
      learnerReasoning: responses.slice(-5).map(r => r.text), assistance: assistanceFor(s.id, qid),
      nextSuggestedStep: null,
      recentEvidenceIds: responses.map(r => r.result?.evidenceId).filter(Boolean).slice(-10),
      activeDiagnosisIds: diagnoses.map(d => d.diagnosisId), reservationId: qid ? s.activeReservationId : null,
    };
    db.insert('topic_resume_states', resume);
    return resume;
  }
  /** Revalidate a resume record against the pinned manifest before reuse. */
  function revalidateResume(s, resume) {
    if (!resume?.unfinishedQuestionId) return { resume, questionId: null, reservationId: null, note: null };
    let q = null;
    try { q = questions().get(scopeOf(s), resume.unfinishedQuestionId); } catch { q = null; }
    const compatible = q && ['asked', 'reserved'].includes(q.state) && q.knowledgeManifestId === s.pinnedKnowledgeManifestId;
    return compatible ? { resume, questionId: q.id, reservationId: resume.reservationId, note: null } : { resume, questionId: null, reservationId: null, note: 'question_no_longer_compatible' };
  }

  Object.assign(K, { unitsOf, appendDelivery, deliveredQuestionIds, questionState, playedText, dialogueOf, assistanceFor, promptLedger, recordPlayback, bumpEpoch, latestResume, saveResume, revalidateResume });
}
