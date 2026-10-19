// A23 — Focus sections, no student-facing plan notes, and typed answer inputs (user overrides; see CONTRACTS.md).
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { setup, startSession } from './_session-helpers.mjs';

const S = h => h.app.services.session;

test('focus sections: CRUD, CAS, one active, units expand, a new session and progress see them', async () => {
  const h = await setup();
  const unit = S(h).focusCreate(h.learner, h.exam.id, { name: 'All of it', topicIds: [h.ids['linear-algebra'].topicId], goal: 'Developing', activate: true });
  assert.equal(unit.active, true);
  assert.equal(unit.progress.total, 3, 'a unit expands to its assessable children');
  assert.equal(unit.progress.atGoal, 0);
  assert.ok(unit.progress.topics.every(t => t.label === 'Not assessed' && t.atGoal === false));

  const qr = S(h).focusCreate(h.learner, h.exam.id, { name: 'QR', topicIds: [h.ids.qr.topicId], goal: 'Secure', activate: true });
  const listed = S(h).focusList(h.learner, h.exam.id);
  assert.equal(listed.activeSectionId, qr.id);
  assert.equal(listed.sections.filter(x => x.active).length, 1, 'activating one deactivates the others');

  assert.throws(() => S(h).focusPatch(h.learner, h.exam.id, qr.id, { expectedRowVersion: qr.rowVersion + 5, name: 'x' }), e => e.code === 'version_conflict');
  assert.throws(() => S(h).focusCreate(h.learner, h.exam.id, { name: 'bad', topicIds: ['top_nope'], goal: 'Secure' }), e => e.code === 'invalid_input');
  const other = h.app.auth.createPrincipal();
  assert.throws(() => S(h).focusList(other, h.exam.id), e => e.code === 'ownership_denied');

  // Explicit intent reaches the learner record and personalization.
  const goal = h.app.services.learner.profile(h.scope).snapshot.facts.find(f => f.status === 'active' && f.key === 'focus_section');
  assert.equal(goal.value.sectionId, qr.id);
  assert.equal(goal.origin, 'explicit_user');
  assert.ok(h.app.services.learner.changes(h.scope).some(c => c.kind === 'explicit_feedback' && /QR/.test(c.reason)));

  // A session without a topic starts on the focus topic.
  const started = S(h).start(h.learner, h.exam.id, {});
  await h.app.drain();
  assert.equal(h.session(started.sessionId).activeTopicId, h.ids.qr.topicId);
  assert.equal(S(h).progress(h.scope).focus.id, qr.id);

  // Deactivate, then delete.
  const fresh = S(h).focusList(h.learner, h.exam.id).sections.find(x => x.id === qr.id);
  const off = S(h).focusPatch(h.learner, h.exam.id, qr.id, { expectedRowVersion: fresh.rowVersion, active: false });
  assert.equal(off.active, false);
  assert.equal(S(h).focusList(h.learner, h.exam.id).activeSectionId, null);
  assert.equal(h.app.services.learner.profile(h.scope).snapshot.facts.some(f => f.status === 'active' && f.key === 'focus_section'), false);
  assert.deepEqual(S(h).focusDelete(h.learner, h.exam.id, qr.id), { deleted: true });
  assert.equal(S(h).focusList(h.learner, h.exam.id).sections.length, 1);
  assert.equal(S(h).progress(h.scope).focus, null);
});

test('typed inputs: kind and spec reach the board, order is shuffled, answers never leak', async () => {
  const h = await setup({ controls: { questionGenerator: { inputKind: 'order' } } });
  const { sessionId } = h.app.services.session.start(h.learner, h.exam.id, { topicId: h.ids.qr.topicId, transport: 'agent' });
  await h.app.drain();
  const q = await h.notationQuestion(sessionId);
  assert.equal(q.inputKind, 'order');
  const form = h.app.services.questions.speakingForm(h.scope, q.id);
  assert.equal(form.inputKind, 'order');
  assert.notDeepEqual(form.inputSpec.items.map(i => i.id), ['p1', 'p2', 'p3'], 'never shown in answer order');
  assert.deepEqual([...form.inputSpec.items.map(i => i.id)].sort(), ['p1', 'p2', 'p3']);
  assert.doesNotMatch(JSON.stringify(form), /expectedStructured|expectedAnswer/);

  assert.ok(S(h).offerQuestion(sessionId, q.id)); // a card's question board (v10)
  const ready = h.events(sessionId).filter(e => e.type === 'question.ready').at(-1);
  assert.equal(ready.payload.question.inputKind, 'order');
  assert.deepEqual(ready.payload.question.inputSpec, form.inputSpec);
  const rubric = h.app.services.questions.rubric(h.scope, q.rubricVersionId);
  assert.doesNotMatch(JSON.stringify(ready.payload), new RegExp(JSON.stringify(rubric.expectedStructured).replace(/[[\]]/g, '\\$&')));
});

test('an inconsistent input spec never becomes a ready question', async () => {
  const h = await setup({ controls: { questionGenerator: { inputKind: 'choice', badStructured: true } } });
  const { sessionId } = await startSession(h);
  await assert.rejects(() => h.notationQuestion(sessionId), /not ready/);
});

async function answerStructured(kind, structuredAnswer, extra = {}) {
  const h = await setup({ controls: { questionGenerator: { inputKind: kind } } });
  const { sessionId } = await startSession(h);
  const q = await h.notationQuestion(sessionId);
  // A card's question board offers it and the page shows it: it is posed (v10).
  S(h).offerQuestion(sessionId, q.id);
  S(h).agentEvents(h.learner, sessionId, { events: [{ clientEventId: 'shown', type: 'board_shown', questionId: q.id, text: q.voiceForm, interrupted: false, occurredAt: h.clock.iso() }] });
  const result = await h.respond(sessionId, 'my answer', { replyToQuestionId: q.id, structuredAnswer, ...extra });
  await h.app.drain();
  const local = h.app.db.find('local_answer_assessments', {}, { scope: h.scope }).find(l => l.questionId === q.id);
  return { h, q, result, local, sessionId };
}

test('structured answers are graded deterministically and committed idempotently', async () => {
  const right = await answerStructured('choice', { kind: 'choice', value: 'a' });
  assert.equal(right.result.attributedQuestionId, right.q.id);
  assert.equal(right.local.runs[0].adapter, 'deterministic');
  assert.ok(right.local.findings.length && right.local.findings.every(f => f.outcome === 'supported'));
  const evidence = right.h.app.db.get('interaction_evidence', right.result.evidenceId);
  assert.deepEqual(evidence.structuredAnswer, { kind: 'choice', value: 'a' });

  const wrong = await answerStructured('choice', { kind: 'choice', value: 'b' });
  assert.ok(wrong.local.findings.every(f => f.outcome === 'contradicted'));

  const near = await answerStructured('number', { kind: 'number', value: 3.02 }); // expected 3, tolerance 1%
  assert.ok(near.local.findings.every(f => f.outcome === 'supported'));
  const far = await answerStructured('number', { kind: 'number', value: 3.5 });
  assert.ok(far.local.findings.every(f => f.outcome === 'contradicted'));

  const multi = await answerStructured('multi_select', { kind: 'multi_select', value: ['c', 'a'] });
  assert.ok(multi.local.findings.every(f => f.outcome === 'supported'));
  const match = await answerStructured('match', { kind: 'match', value: [['l2', 'r1'], ['l1', 'r2']] });
  assert.ok(match.local.findings.every(f => f.outcome === 'supported'));

  // Idempotent replay; same id with a different answer conflicts; a malformed value is rejected.
  const { h, result, sessionId } = right;
  const s = h.session(sessionId);
  const body = { clientResponseId: 'struct_1', captureEpoch: s.epoch, turnId: s.currentTurnId, replyToQuestionId: null, text: 'again', finalized: true, transcriptVersion: 1, confidence: null, ambiguousSpans: [], audioArtifactId: null, supersedesResponseId: null, structuredAnswer: { kind: 'choice', value: 'a' } };
  const first = await S(h).submitResponse(h.learner, sessionId, body);
  assert.deepEqual(await S(h).submitResponse(h.learner, sessionId, body), first);
  await assert.rejects(() => S(h).submitResponse(h.learner, sessionId, { ...body, structuredAnswer: { kind: 'choice', value: 'b' } }), e => e.code === 'idempotency_conflict');
  await assert.rejects(() => S(h).submitResponse(h.learner, sessionId, { ...body, clientResponseId: 'struct_2', structuredAnswer: { kind: 'number', value: 'three' } }), e => e.code === 'invalid_input');
  assert.notEqual(result.responseId, first.responseId);
});
