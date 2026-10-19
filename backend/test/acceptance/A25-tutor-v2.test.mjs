// A25 — Plato v2, tutor side (user request, 2026-10-05): questions the agent asks for are made in the background and
// offered when the moment allows; the tutor learns how the student wants to be taught (in their words); new material
// reaches a quiet session at once, named by its new topics. (v10: the planner's questions, its briefs and the brief's
// onboarding lines went with classic.)
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { setup } from './_session-helpers.mjs';
import { createTestBackend } from '../harness.mjs';
import { createHttpHandler } from '../../http/index.mjs';
import { newId } from '../../core/util.mjs';

const NOTATION = 'the transpose in q one transpose a two';
const S = h => h.app.services.session;

async function agentSession(h) {
  const { sessionId } = S(h).start(h.learner, h.exam.id, { topicId: h.ids.qr.topicId, transport: 'agent' });
  await h.app.drain();
  return sessionId;
}
const said = (h, sessionId, type, text, extra = {}) => { h.clock.advance(1000); return S(h).agentEvents(h.learner, sessionId, { events: [{ clientEventId: `a_${Math.random()}`, type, text, interrupted: false, occurredAt: h.clock.iso(), ...extra }] }); };
const reply = async (h, sessionId, text) => { h.clock.advance(1000); const r = await h.respond(sessionId, text); await h.app.drain(); return r; };
const sent = (h, sessionId, type) => h.events(sessionId).filter(e => e.type === type);
const reservation = (h, id) => h.app.db.get('question_reservations', id);

test('request_question with nothing specific offers a ready question at once; posing it delivers its own reservation', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const planned = S(h).requestQuestion(h.learner, sessionId, {}).question; // one held on the page, never posed (v10; the opening plan's before)
  const plannedReservation = h.session(sessionId).activeReservationId;
  assert.ok(planned && plannedReservation);

  const asked = S(h).requestQuestion(h.learner, sessionId, {});
  const ready = sent(h, sessionId, 'question.ready').at(-1).payload;
  const q = ready.question;
  assert.deepEqual(asked, { state: 'ready', question: q }, 'the reply carries it too, so the page holds it before the tool returns');
  assert.equal(ready.about, null);
  assert.notEqual(q.questionId, planned.questionId);
  assert.deepEqual(Object.keys(q).sort(), ['choices', 'inputKind', 'inputSpec', 'questionId', 'voiceForm']);
  assert.doesNotMatch(JSON.stringify(ready), /reservationId|expectedAnswer|expectedStructured/);
  const s = h.session(sessionId);
  assert.deepEqual([s.activeQuestionId, s.requestedQuestionId], [q.questionId, q.questionId]);
  assert.equal(reservation(h, plannedReservation).state, 'released', 'the unposed planned question goes back to the pool');

  // The agent poses it: the delivery is attributed to its reservation, not the older one's.
  assert.equal(said(h, sessionId, 'board_shown', q.voiceForm, { questionId: q.questionId }).receipts[0].status, 'accepted');
  await h.app.drain();
  assert.equal(reservation(h, s.activeReservationId).state, 'delivered');
  assert.equal(reservation(h, plannedReservation).state, 'released');
  assert.equal(h.app.services.questions.get(h.scope, q.questionId).state, 'asked');
  assert.equal((await reply(h, sessionId, 'It is the dot product.')).attributedQuestionId, q.questionId);
});

test('a requested question survives later turns until it is posed; the client sees it as pending, not being answered', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  S(h).requestQuestion(h.learner, sessionId, { difficulty: 'easier' });
  const q = sent(h, sessionId, 'question.ready').at(-1).payload.question;

  await reply(h, sessionId, 'Give me a second to finish this.');
  await reply(h, sessionId, 'Okay, done.');
  assert.equal(h.session(sessionId).activeQuestionId, q.questionId, 'turns without a question keep the requested one');
  const listening = sent(h, sessionId, 'turn.listening').at(-1).payload;
  assert.deepEqual([listening.activeQuestionId, listening.pendingQuestionId], [null, q.questionId]);

  said(h, sessionId, 'board_shown', q.voiceForm, { questionId: q.questionId });
  await reply(h, sessionId, 'Is it the projection coefficient?');
  const after = sent(h, sessionId, 'turn.listening').at(-1).payload;
  assert.deepEqual([after.activeQuestionId, after.pendingQuestionId], [q.questionId, null]);
});

test('request_question about a narrow idea is generated in the background and offered when ready', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  assert.deepEqual(S(h).requestQuestion(h.learner, sessionId, { about: ` ${NOTATION} `, difficulty: 'harder' }), { state: 'generating' });
  assert.equal(sent(h, sessionId, 'question.ready').length, 0, 'nothing until it is made');
  assert.equal(h.app.db.find('jobs', { type: 'generate_custom_question' }).at(-1).priority, 45, 'below plan_turn');
  await h.app.drain();
  const ready = sent(h, sessionId, 'question.ready');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].payload.about, NOTATION);
  const question = h.app.services.questions.get(h.scope, ready[0].payload.question.questionId);
  assert.deepEqual([question.origin, question.narrowTarget, question.intendedDifficulty, question.state], ['personalized_custom', NOTATION, 'transfer', 'reserved']);
  assert.equal(h.session(sessionId).activeQuestionId, question.id);
});

test('the agent hears that a question it asked for will not come; asked again, it is made again', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  h.controls.questionGenerator = { timeout: true };
  const ask = () => S(h).requestQuestion(h.learner, sessionId, { about: 'eigenvectors of a shear' });
  const asked = () => h.app.db.find('question_generation_requests', { origin: 'personalized_custom' }, { scope: h.scope }).filter(r => r.requestedBy === 'agent');
  ask(); ask();
  assert.equal(asked().length, 1, 'asked twice while it is being made: the same request');
  for (let i = 0; i < 6; i++) { h.clock.advance(60_000); await h.app.drain(); }
  assert.equal(h.app.db.find('question_generation_requests', { origin: 'personalized_custom', state: 'failed' }, { scope: h.scope }).length, 1);
  assert.deepEqual(sent(h, sessionId, 'question.failed').map(e => e.payload), [{ about: 'eigenvectors of a shear' }]);
  assert.equal(sent(h, sessionId, 'question.ready').length, 0);

  h.controls.questionGenerator = {};
  assert.deepEqual(ask(), { state: 'generating' });
  assert.equal(asked().length, 2, 'asked again in the same turn, a failed one is made again, not reported as still coming');
  await h.app.drain();
  assert.deepEqual(sent(h, sessionId, 'question.ready').map(e => e.payload.about), ['eigenvectors of a shear']);
});

test('a requested question never displaces a posed one that is still open', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const posed = S(h).requestQuestion(h.learner, sessionId, {}).question; // v10; the opening plan's before
  said(h, sessionId, 'board_shown', posed.voiceForm, { questionId: posed.questionId });
  assert.deepEqual(S(h).requestQuestion(h.learner, sessionId, { about: NOTATION }), { state: 'generating' }, 'one on a specific idea is made for later');
  assert.deepEqual(S(h).requestQuestion(h.learner, sessionId, {}), { state: 'busy' }, 'any other is neither reserved over it nor made');
  await h.app.drain();
  assert.equal(sent(h, sessionId, 'question.ready').length, 1, 'only the posed one was offered');
  assert.equal(h.session(sessionId).activeQuestionId, posed.questionId);
  const made = h.app.db.find('question_generation_requests', { origin: 'personalized_custom' }, { scope: h.scope });
  assert.deepEqual(made.map(r => [r.narrowTarget, r.state, h.app.services.questions.get(h.scope, r.questionId).state]), [[NOTATION, 'ready', 'ready']], 'it waits in the pool');

  assert.throws(() => S(h).requestQuestion(h.learner, sessionId, { difficulty: 'impossible' }), e => e.code === 'invalid_input');
});

test('preferences keep the slot they answer, course-specific ones and goals stay with the exam, "other" never overwrites', async () => {
  const t = createTestBackend();
  const exam = t.createExam({ title: 'CS 3410' });
  const L = t.app.services.learner;
  const say = (text, type, key, applicability = 'learner') => L.recordFeedback(exam.scope, { text, type, key, applicability });
  say('Quick reviews before the prelim, please', 'preference', 'help_wanted'); // "quick" would have meant pace
  say('No preference', 'preference', 'pace');
  say('No preference', 'preference', 'explanation_order'); // the same words answer another slot
  say('No.', 'preference', 'practice_style'); // a bare "no" to a slot is an answer, not an acknowledgment
  say('ok', 'preference'); // without a slot it still is one
  say('Get comfortable with pointers', 'goal', 'goal');
  say('Then ace the prelim', 'goal', 'goal');
  say('I am colorblind', 'preference', 'other', 'exam');
  say('Call me Sam', 'preference', 'other', 'exam');
  await t.app.drain();
  const active = L.profile(exam.scope).snapshot.facts.filter(f => f.status === 'active');
  const level = key => active.filter(f => f.key === key).map(f => [f.kind, f.applicability.level, f.value]);
  assert.deepEqual(level('help_wanted'), [['preference', 'exam', 'Quick reviews before the prelim, please']]);
  assert.deepEqual(level('pace'), [['preference', 'learner', 'No preference']]);
  assert.deepEqual(level('explanation_order'), [['preference', 'learner', 'No preference']]);
  assert.deepEqual(level('practice_style'), [['preference', 'learner', 'No.']]);
  assert.equal(active.some(f => f.value === 'ok'), false);
  assert.deepEqual(active.filter(f => f.kind === 'goal').map(f => [f.applicability.level, f.value]), [['exam', 'Get comfortable with pointers'], ['exam', 'Then ace the prelim']], 'goals add up, whatever key they came with');
  assert.equal(active.filter(f => ['I am colorblind', 'Call me Sam'].includes(f.value)).length, 2);
  assert.equal(active.some(f => f.key === 'other'), false);
});

test('over HTTP: the agent asks for a question, and feedback keeps its key', async t => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const handle = createHttpHandler(h.app);
  const server = createServer(async (req, res) => { if (!await handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { Authorization: `Bearer ${h.learner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const asked = await post(`/v1/sessions/${sessionId}/questions`, { difficulty: 'easier' });
  assert.deepEqual([asked.status, asked.body.state], [202, 'ready']);
  assert.equal((await post(`/v1/sessions/${sessionId}/questions`, { difficulty: 'hardest' })).status, 400);
  assert.equal((await post(`/v1/exams/${h.exam.id}/feedback`, { text: 'Examples first, then the rule', type: 'preference', key: 'explanation_order', applicability: 'learner' })).status, 202);
  await h.app.drain();
  assert.ok(h.app.services.learner.profile(h.scope).snapshot.facts.some(f => f.status === 'active' && f.key === 'explanation_order' && f.applicability.level === 'learner'));
});

/** K2 = K1 plus a new unit with a topic under it; existing topics keep their ids, as a rebuild with a new file does. */
function publishMore(h) {
  const { app, scope } = h, { db } = app, at = h.clock.iso();
  const exam = db.get('exams', h.exam.id), k1 = db.get('knowledge_manifests', exam.publishedKnowledgeManifestId);
  const unit = newId('top'), leaf = newId('top');
  const versions = [[unit, 'Singular values', null], [leaf, 'Geometry of the SVD', unit]].map(([topicId, title, parentTopicId]) => ({ id: newId('topv'), scope, createdAt: at, topicId, version: 1, title, description: title, parentTopicId, objectiveVersionIds: [], status: 'active' }));
  return db.tx(() => {
    for (const id of [unit, leaf]) db.insert('topics', { id, scope, createdAt: at, stableKey: id, retiredAt: null });
    for (const v of versions) db.insert('topic_versions', v);
    const k2 = { ...k1, id: newId('km'), version: k1.version + 1, parentManifestId: k1.id, topicVersionIds: [...k1.topicVersionIds, ...versions.map(v => v.id)], publishedAt: at };
    db.insert('knowledge_manifests', k2);
    db.update('exams', { ...exam, publishedKnowledgeManifestId: k2.id });
    const topicIds = [...db.find('topic_versions', { id: k1.topicVersionIds }, { scope }).map(v => v.topicId), unit, leaf];
    app.events.emit({ scope, eventType: 'knowledge.published', aggregateType: 'exam', aggregateId: exam.id, aggregateVersion: 2, payload: { examId: exam.id, oldManifestId: k1.id, newManifestId: k2.id, migrationIds: [], changedDependencyRefs: [], topicIds, objectiveVersionIds: k1.objectiveVersionIds, incompatibleTopicIds: [] } });
    return k2;
  });
}

test('new material reaches a quiet agent session at once, named by its new topics; personal explanations alone wait', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const k1 = h.session(sessionId).pinnedKnowledgeManifestId;

  h.app.events.emit({ scope: h.scope, eventType: 'personal.published', aggregateType: 'exam', aggregateId: h.exam.id, payload: { oldPersonalManifestId: null, newPersonalManifestId: 'syn_p2', knowledgeManifestId: k1, affectedTopicIds: [], changedRefs: [] } });
  await h.app.drain();
  assert.equal(sent(h, sessionId, 'adoption').length, 0, 'personal explanations wait for the next turn');
  await reply(h, sessionId, 'Okay.');
  assert.deepEqual(sent(h, sessionId, 'adoption').map(e => e.payload.newTopicTitles), [[]]);

  const k2 = publishMore(h);
  await h.app.drain(); // the student says nothing
  assert.equal(h.session(sessionId).pinnedKnowledgeManifestId, k2.id);
  assert.deepEqual(sent(h, sessionId, 'adoption').at(-1).payload.newTopicTitles, ['Singular values'], 'roots of the new subtrees only');
});

test('an adoption that fails stays pending, and the next turn adopts it', async () => {
  const h = await setup();
  const sessionId = await agentSession(h);
  const knowledge = h.app.services.knowledge, view = knowledge.view;
  const k2 = publishMore(h);
  knowledge.view = (scope, id) => { if (id === k2.id) throw new Error('not readable yet'); return view(scope, id); };
  await h.app.drain();
  assert.equal(h.session(sessionId).adoptionPending?.knowledgeManifestId, k2.id, 'still pending');
  knowledge.view = view;
  await reply(h, sessionId, 'Okay.');
  assert.equal(h.session(sessionId).pinnedKnowledgeManifestId, k2.id, 'the next turn adopts it');
});
