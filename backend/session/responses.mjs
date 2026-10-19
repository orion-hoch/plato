import { newId, hashOf, safe } from '../core/util.mjs';
import { words, overlap } from '../core/match.mjs';
import { fail } from '../core/errors.mjs';
import { validate } from '../core/shape.mjs';
import { AGENT_EVENTS, SUBMIT_RESPONSE } from './schemas.mjs';

// What the student and the actor say (v10 split): responses committed with their evidence, and the actor's utterances
// recorded with their delivery.

export function installResponses(K) {
  const { db, clock, events, learner, questions, fresh, loadSession, newTurn, saveSession, scopeOf, serverEvent, setTurn, txn } = K;

  // ---------- responses ----------

  async function submitResponse(principal, sessionId, body, options = {}) {
    validate(SUBMIT_RESPONSE, body);
    if (body.structuredAnswer) checkStructured(body.structuredAnswer);
    const s0 = loadSession(principal, sessionId);
    return commitResponse(s0, body, options);
  }

  function checkStructured({ kind, value }) {
    const str = x => typeof x === 'string' && x.length > 0 && x.length <= 200;
    const ok = kind === 'choice' ? str(value)
      : kind === 'multi_select' || kind === 'order' ? Array.isArray(value) && value.length <= 50 && value.every(str)
      : kind === 'match' ? Array.isArray(value) && value.length <= 50 && value.every(p => Array.isArray(p) && p.length === 2 && p.every(str))
      : kind === 'number' ? typeof value === 'number' && Number.isFinite(value)
      : kind === 'exam' ? !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 8 && Object.entries(value).every(([part, text]) => /^[a-z]{1,2}$/.test(part) && typeof text === 'string' && text.length <= 8000)
      : typeof value === 'string' && value.length <= 8000;
    if (!ok) fail('invalid_input', `structuredAnswer.value does not fit kind ${kind}.`);
  }

  async function commitResponse(s0, body, { viaAsr = false, drawing = null } = {}) {
    if (s0.status === 'ended') fail('invalid_input', 'This session has ended.');
    // Every response path routes here: ASR on silence or noise ("...", "…") is not a turn, so no evidence and no plan.
    if (!/[\p{L}\p{N}]/u.test(body.text)) fail('invalid_input', 'The response has no words.');
    const inputHash = hashOf(body);
    const prior = db.findOne('finalized_responses', { sessionId: s0.id, clientResponseId: body.clientResponseId });
    if (prior) {
      if (prior.inputHash !== inputHash) fail('idempotency_conflict', 'That response ID was already used with different content.');
      return prior.result;
    }
    const cited = db.get('turns', body.turnId, scopeOf(s0));
    if (!cited || cited.sessionId !== s0.id) fail('invalid_input', 'Unknown turn for this session.');
    if (body.captureEpoch > s0.epoch) fail('invalid_input', 'Capture epoch is ahead of the session.');

    return txn(() => {
      const again = db.findOne('finalized_responses', { sessionId: s0.id, clientResponseId: body.clientResponseId });
      if (again) { if (again.inputHash !== inputHash) fail('idempotency_conflict', 'That response ID was already used with different content.'); return again.result; }
      let s = fresh(s0.id);
      const scope = scopeOf(s);
      const delivered = K.deliveredQuestionIds(s.id);
      let questionId = null, hold = null;
      if (body.replyToQuestionId) { if (delivered.has(body.replyToQuestionId)) questionId = body.replyToQuestionId; else hold = 'reply_to_question_not_delivered'; }
      else if (s.activeQuestionId && delivered.has(s.activeQuestionId)) questionId = s.activeQuestionId;

      let supersededEvidenceId = null, transcriptVersion = body.transcriptVersion;
      if (body.supersedesResponseId) {
        const old = db.get('finalized_responses', body.supersedesResponseId, scope);
        if (!old || old.sessionId !== s.id) fail('invalid_input', 'The corrected response is not part of this session.');
        supersededEvidenceId = old.result?.evidenceId || null;
        if (!body.replyToQuestionId && old.attributedQuestionId) questionId = old.attributedQuestionId;
        if (transcriptVersion <= old.transcriptVersion) fail('invalid_input', 'A correction needs a higher transcript version.');
      }

      // The response's turn: the listening turn it cites, or a fresh turn when it interrupts or arrives late.
      let turn = cited.state === 'listening' && cited.id === s.currentTurnId ? cited : newTurn(s, { state: 'response_committed', topicId: s.activeTopicId });
      if (cited.state === 'speaking' || cited.state === 'planning') setTurn(cited, { state: 'interrupted' });

      const ambiguous = (body.confidence !== null && body.confidence < 0.6) || body.ambiguousSpans.length > 0;
      const ledger = questionId ? K.promptLedger(s.id, questionId) : null;
      const assistance = K.assistanceFor(s.id, questionId);
      const withdrawn = questionId && (s.withdrawnQuestionIds || []).includes(questionId);
      const evidenceStatus = withdrawn ? 'withdrawn'
        : ledger?.status === 'prompt_drift' ? 'prompt_drift'
        : ambiguous || hold ? 'ambiguous'
        : ledger && ledger.status !== 'eligible' ? ledger.status
        : assistance.some(a => a.extent === 'uncertain') ? 'delivery_uncertain' : 'eligible';
      let question = null;
      if (questionId) { try { question = questions().get(scope, questionId); } catch { question = null; } }

      const response = {
        id: newId('rsp'), scope, createdAt: clock.iso(), sessionId: s.id, turnId: turn.id, epoch: body.captureEpoch, clientResponseId: body.clientResponseId,
        replyToQuestionId: body.replyToQuestionId, attributedQuestionId: questionId, topicId: s.activeTopicId, text: body.text, audio: null,
        transcriptVersion, supersedesResponseId: body.supersedesResponseId, confidence: body.confidence, ambiguousSpans: body.ambiguousSpans,
        committedAt: clock.iso(), inputHash, viaAsr,
        answerArtifact: drawing?.artifact ?? null, drawing: drawing ? { inputHash: drawing.inputHash, reading: drawing.reading } : null,
        structuredAnswer: body.structuredAnswer ?? null,
        latencyMs: body.latencyMs ?? null, hedges: body.hedges ?? [], // v12: the director passes them to the learner model
      };
      const fields = {
        sessionId: s.id, turnId: turn.id, responseId: response.id, questionId, questionVersion: question?.version ?? null,
        promptSnapshot: ledger?.snapshot ?? '', promptDeliveryEventIds: ledger?.deliveryEventIds ?? [],
        finalizedAnswer: body.text, answerArtifact: drawing?.artifact ?? null,
        asr: viaAsr || body.confidence !== null || body.ambiguousSpans.length ? { finalized: true, confidence: body.confidence, ambiguousSpans: body.ambiguousSpans } : null,
        assistance, evidenceStatus, promptRenderingId: ledger?.renderingId ?? null, promptCompatibility: ledger ? ledger.compatibility : 'unknown',
        objectiveVersionIds: question ? (question.objectiveTargets || []).filter(t => t.role === 'assessed').map(t => t.objectiveVersionId) : [],
        rubricVersionId: question?.rubricVersionId ?? null,
        knowledgeManifestId: question?.knowledgeManifestId ?? s.pinnedKnowledgeManifestId, personalManifestId: s.pinnedPersonalManifestId,
        profileSnapshotId: K.profileSnapshotId(scope), responseAt: body.captureEpoch === s.epoch ? clock.iso() : response.committedAt,
        observedFacts: [...(hold ? [hold] : []), ...(ambiguous ? [drawing ? 'drawing_uncertain' : 'transcript_ambiguous'] : []), ...(drawing ? ['written_answer'] : [])], supersedesEvidenceId: supersededEvidenceId,
        topicIds: [question?.topicId ?? s.activeTopicId].filter(Boolean),
        structuredAnswer: questionId ? body.structuredAnswer ?? null : null,
      };
      const evidence = supersededEvidenceId ? learner().supersedeInteraction(scope, supersededEvidenceId, fields) : learner().commitInteraction(scope, fields);

      turn = setTurn(turn, { state: 'response_committed', finalizedResponseId: response.id, questionId });
      s = saveSession({ ...s, currentTurnId: turn.id });
      events.emit({ scope, eventType: 'response.finalized', aggregateType: 'session', aggregateId: s.id, aggregateVersion: s.epoch, payload: { responseId: response.id, turnId: turn.id, questionId, evidenceId: evidence.id }, idempotencyKey: `response.finalized:${response.id}` });
      const sse = serverEvent(s, 'response.committed', { responseId: response.id, turnId: turn.id, attributedQuestionId: questionId, evidenceStatus, clarification: evidenceStatus === 'ambiguous' });
      const result = { responseId: response.id, turnId: turn.id, attributedQuestionId: questionId, evidenceId: evidence.id, evidenceStatus, held: !!hold, serverSequence: sse.sequence, assessment: questionId && evidenceStatus === 'eligible' ? 'queued' : 'not_scored', planning: 'queued' };
      db.insert('finalized_responses', { ...response, result, evidence });
      K.enqueuePlan(s, turn);
      return result;
    });
  }

  // ---------- what the actor said (the realtime voice agent the page talks to) ----------

  /**
   * Record what the realtime agent actually said (reported by the client that played it). Each utterance
   * becomes an output unit with delivery events: played when the client heard it to the end, delivery
   * unknown when it was interrupted (conservative for assistance and question exposure, §5.4).
   */
  function agentEvents(principal, sessionId, body) {
    validate(AGENT_EVENTS, body);
    const s0 = loadSession(principal, sessionId);
    const receipts = [];
    for (const ev of body.events) {
      receipts.push(txn(() => {
        const inputHash = hashOf(ev);
        const prior = db.prepare('SELECT input_hash FROM voice_event_receipts WHERE session_id = ? AND client_event_id = ?').get(sessionId, ev.clientEventId);
        if (prior) return { clientEventId: ev.clientEventId, status: prior.input_hash === inputHash ? 'duplicate' : 'conflict' };
        db.prepare('INSERT INTO voice_event_receipts(session_id, client_event_id, input_hash, client_sequence, received_at) VALUES(?,?,?,?,?)').run(sessionId, ev.clientEventId, inputHash, 0, clock.iso());
        const s = fresh(sessionId), scope = scopeOf(s);
        let kind = 'explanation', questionId = null, renderingId = null, note = null;
        const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        if (ev.type === 'board_shown') {
          // A question projected on the board: exact approved wording only, else drift.
          if (!ev.questionId || ev.questionId !== s.activeQuestionId) return { clientEventId: ev.clientEventId, status: 'rejected', reason: 'not_the_active_question' };
          const form = safe(() => questions().speakingForm(scope, ev.questionId), null);
          const check = safe(() => questions().checkRendering(scope, ev.questionId, ev.text), { compatible: false, reason: 'rendering check unavailable' });
          kind = 'prompt'; questionId = ev.questionId;
          if (form && (norm(ev.text) === norm(form.voiceForm) || check.compatible)) renderingId = check.renderingId ?? form.renderingId ?? null;
          else note = `prompt_drift: ${check.reason || 'board text differs from the approved wording'}`;
        } else if (ev.type === 'board_content') {
          kind = 'explanation';
        } else if (s.activeQuestionId) {
          const form = safe(() => questions().speakingForm(scope, s.activeQuestionId), null);
          // An exam problem is delivered by showing it (board_shown): nothing said aloud is its prompt.
          // Asked: its wording said whole, or most of its words (three, or all of a shorter one's).
          const want = form ? words(form.voiceForm) : new Set(), whole = !!form && norm(ev.text).includes(norm(form.voiceForm));
          const asked = !!form && form.format !== 'exam' && (whole || overlap(want, ev.text) >= Math.max(Math.min(3, want.size), want.size * 0.6));
          // Check only the span where the agent asks the question; the words around it are its own.
          const sentences = ev.text.split(/(?<=[.?!])\s+/);
          const span = !form ? ev.text : whole ? form.voiceForm : sentences.filter(x => { const n = overlap(x, want); return n > 0 && n >= words(x).size * 0.5; }).join(' ') || ev.text;
          const check = safe(() => questions().checkRendering(scope, s.activeQuestionId, span), { compatible: false, reason: 'rendering check unavailable' });
          if (check.compatible && asked) { kind = 'prompt'; questionId = s.activeQuestionId; renderingId = check.renderingId ?? null; }
          else if (asked) { kind = 'prompt'; questionId = s.activeQuestionId; note = `prompt_drift: ${check.reason}`; }
        }
        // questionId is always the session's active question, so its reservation is the session's.
        const output = { id: newId('out'), scope, createdAt: clock.iso(), sessionId: s.id, epoch: s.epoch, turnId: s.currentTurnId, planId: null, packetId: null, state: 'complete', rowVersion: 0, microturn: false, source: 'agent', questionId, reservationId: questionId ? s.activeReservationId : null, completedAt: clock.iso() };
        db.insert('session_outputs', output);
        const unit = { id: newId('su'), scope, createdAt: clock.iso(), sessionId: s.id, outputId: output.id, epoch: s.epoch, turnId: s.currentTurnId, kind, text: ev.text, surface: ev.type === 'agent_response' ? 'voice' : 'board', questionId, hintId: null, questionRenderingId: renderingId, stage: 'generated', audioStartMs: null, audioEndMs: null, promptDrift: note ? { reason: note } : null };
        db.replace('output_units', unit);
        K.appendDelivery(unit, 'generated', 'none', { note });
        if (note) {
          // Material drift: keep what was said, never grade it under the original rubric (§4.5).
          K.appendDelivery(db.get('output_units', unit.id), 'delivery_unknown', 'none', { note });
        } else if (ev.interrupted) {
          K.appendDelivery(db.get('output_units', unit.id), 'delivery_unknown', 'client_playback_ack', { isPartial: true, note: 'interrupted; extent unknown' });
        } else {
          K.recordPlayback(s, { outputId: output.id, semanticUnitId: unit.id, playedThroughMs: null, confirmedBy: 'client_playback_ack' });
        }
        serverEvent(s, 'agent.recorded', { outputId: output.id, semanticUnitId: unit.id, kind, questionId, surface: unit.surface });
        return { clientEventId: ev.clientEventId, status: 'accepted', kind, questionId };
      }));
    }
    return { receipts };
  }

  Object.assign(K, { submitResponse, checkStructured, commitResponse, agentEvents });
}
