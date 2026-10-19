import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorBridge, isSpeech, written } from '../src/tutor-bridge.js';

// The backend, as fetch sees it: every request recorded, every answer a small JSON body.
async function withServer(run) {
  const calls = [], fetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => { calls.push({ url, body: init.body ? JSON.parse(init.body) : null }); return { ok: true, status: 200, json: async () => ({ token: 't', turnId: 't2', transcription: '42' }) }; };
  try { await run(calls); } finally { globalThis.fetch = fetch; }
}
const live = () => Object.assign(new TutorBridge(), { session: 's1', state: { epoch: 2, turnId: 't1', activeQuestionId: null } });

test('noise heard as "..." is not speech and never reaches the backend', async () => {
  for (const noise of ['...', ' … ', '?!', '', '  ']) assert.equal(isSpeech(noise), false, noise);
  for (const words of ['Yes.', '42', 'é', 'uh, repeat that?']) assert.equal(isSpeech(words), true, words);
  await withServer(async calls => {
    const bridge = live();
    await bridge.userSaid('...');
    assert.equal(calls.length, 0);
    await bridge.userSaid('Yes.');
    assert.equal(calls.at(-1).url, '/v1/sessions/s1/responses');
    assert.equal(calls.at(-1).body.text, 'Yes.');
  });
});

test('a glance at the page only reads it; a send commits it, answering the posed question', async () => {
  await withServer(async calls => {
    const bridge = live();
    bridge.state.activeQuestionId = 'q1';
    await bridge.submitDrawing('iVBORw0KGgo=', { commit: false });
    await bridge.submitDrawing('iVBORw0KGgo=');
    const [glance, send] = calls.filter(c => c.url.endsWith('/drawings')).map(c => c.body);
    assert.equal(glance.commit, false);
    assert.equal('commit' in send, false, 'the default (commit) is left to the backend');
    assert.equal(send.replyToQuestionId, 'q1');
  });
});

// The backend by route ("METHOD /path" as a regular expression): every request recorded, answers as given.
async function withBackend(routes, run) {
  const calls = [], fetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET', body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    const answer = Object.entries(routes).find(([route]) => new RegExp(`^${route}$`).test(`${method} ${url}`))?.[1] ?? { token: 't' };
    const value = typeof answer === 'function' ? answer(body) : answer, status = value?.httpStatus ?? 200;
    return { ok: status < 400, status, json: async () => value };
  };
  try { await run(calls); } finally { globalThis.fetch = fetch; }
}

test('new material after the first publish is followed: new topics and unreadable files are news, once', async () => {
  const news = [], reading = [];
  let status = { knowledgeVersion: 1, pendingBuild: false, files: [{ sourceFileId: 'f0', filename: 'old.pdf', status: 'failed', error: { message: 'old' } }] };
  let topics = [{ id: 'a', parentId: null, title: 'Logic' }];
  await withBackend({ 'GET /v1/exams/e1/status': () => status, 'GET /v1/exams/e1/topics': () => ({ topics }), 'GET /v1/exams/e1/focus': { sections: [], activeSectionId: null } }, async () => {
    const bridge = Object.assign(new TutorBridge({ onNews: text => news.push(text), onReading: on => reading.push(on) }), { exam: { examId: 'e1', title: 'CS 3410' }, session: 's1' });
    await bridge.refresh();
    assert.deepEqual(news, [], 'what was there when the page opened is not news');
    assert.equal(bridge.pollTimer, undefined, 'nothing is being read, so nothing is polled');
    // A second drop, long after the first publish: its files are read, then published.
    status = { ...status, pendingBuild: true, files: [...status.files, { sourceFileId: 'f1', filename: 'lec9.pdf', status: 'processing' }, { sourceFileId: 'f2', filename: 'board.png', status: 'uploading' }] };
    await bridge.refresh();
    assert.equal(reading.at(-1), true);
    assert.ok(bridge.pollTimer, 'it keeps polling while files are read');
    status = { knowledgeVersion: 2, pendingBuild: false, files: [status.files[0], { ...status.files[1], status: 'ready' }, { ...status.files[2], status: 'failed', error: { message: 'No readable content could be extracted.' } }] };
    topics = [...topics, { id: 'b', parentId: null, title: 'Caches' }, { id: 'c', parentId: 'b', title: 'Direct-mapped caches' }];
    await bridge.refresh();
    assert.deepEqual(news, ['[New material ready] new topics: Caches.', "[Couldn't read] board.png: No readable content could be extracted."]);
    assert.equal(reading.at(-1), false);
    // The session adopting it says so too: still news only once.
    bridge.receive({ type: 'adoption', payload: { newTopicTitles: ['Caches'] } });
    assert.equal(news.length, 2);
    bridge.close();
  });
});

test('the first drops make one course, with what the student already said; later words go to their profile or exam', async () => {
  await withBackend({
    'POST /v1/exams': { examId: 'e9', status: 'setup', rowVersion: 0 },
    'POST /v1/exams/e9/uploads': body => ({ uploads: body.files.map((f, i) => ({ sourceFileId: `${f.filename}-${i}`, uploadToken: 'u', uploadUrl: '/v1/uploads/u', status: 'uploading' })) }),
    'GET /v1/exams': { exams: [{ examId: 'e9', rowVersion: 4 }] },
    'PATCH /v1/exams/e9': body => ({ examId: 'e9', examDate: body.examDate, rowVersion: 5 }),
  }, async calls => {
    const bridge = new TutorBridge();
    await bridge.remember({ statement: 'Examples first, please.', about: 'explanation_order' });
    await bridge.remember({ statement: 'I want to pass Prelim 1.', about: 'goal' });
    await bridge.remember({ statement: 'It is on October 20.', about: 'exam_date', date: '2026-10-20' });
    assert.equal(calls.length, 0, 'no course yet: it waits');
    const file = name => new File([`notes ${name}`], name);
    await Promise.all([bridge.addDocuments([file('a.md'), file('b.csv')], Promise.resolve('CS 3410 Prelim 1')), bridge.addDocuments([file('c.txt')])]);
    const created = calls.filter(c => c.method === 'POST' && c.url === '/v1/exams');
    assert.equal(created.length, 1, 'two quick drops, one course');
    assert.deepEqual(created[0].body, { title: 'CS 3410 Prelim 1', goals: ['I want to pass Prelim 1.'], preferences: [{ key: 'explanation_order', value: 'Examples first, please.', applicability: 'learner' }], examDate: '2026-10-20' });
    const reserved = calls.filter(c => c.url === '/v1/exams/e9/uploads').map(c => c.body.files.map(f => `${f.filename} ${f.declaredMime}`)).sort();
    assert.deepEqual(reserved, [['a.md text/markdown', 'b.csv text/csv'], ['c.txt text/plain']], 'one reservation per drop, typed by extension');
    assert.equal(calls.filter(c => c.url.endsWith('/finalize')).length, 3);
    // With a course, the date goes on the exam (at its current row version) and the rest into the profile.
    await bridge.remember({ statement: 'It moved to the 22nd.', about: 'exam_date', date: '2026-10-22' });
    assert.deepEqual(calls.at(-1), { method: 'PATCH', url: '/v1/exams/e9', body: { examDate: '2026-10-22', expectedRowVersion: 4 } });
    await bridge.remember({ statement: 'Quiz me hard, in this class.', about: 'practice_style', appliesTo: 'this_course' });
    assert.deepEqual(calls.at(-1).body, { text: 'Quiz me hard, in this class.', type: 'preference', key: 'practice_style', topicIds: [], applicability: 'exam' });
    await bridge.remember({ statement: 'Get a B or better.', about: 'goal' });
    assert.deepEqual(calls.at(-1).body, { text: 'Get a B or better.', type: 'goal', topicIds: [], applicability: 'exam' }, 'goals key themselves: a second never replaces the first');
    bridge.close();
  });
});

test('a drop or a preference while the page is still finding its course waits for it: no second course', async () => {
  await withBackend({
    'GET /v1/exams': { exams: [{ examId: 'e1', title: 'CS 3410 Prelim 1', rowVersion: 3 }] },
    'GET /v1/exams/e1/status': { knowledgeVersion: null, pendingBuild: true, files: [] },
    'GET /v1/exams/e1/topics': { topics: [] },
    'POST /v1/exams/e1/uploads': body => ({ uploads: body.files.map((f, i) => ({ sourceFileId: `f${i}`, uploadToken: 'u', uploadUrl: '/v1/uploads/u' })) }),
  }, async calls => {
    const bridge = new TutorBridge(), opening = bridge.init();
    try {
      await Promise.all([opening, bridge.addDocuments([new File(['# Caches'], 'lec9.md')]), bridge.remember({ statement: 'Examples first.', about: 'explanation_order' })]);
      assert.equal(calls.filter(c => c.method === 'POST' && c.url === '/v1/exams').length, 0);
      assert.equal(calls.filter(c => c.url.endsWith('/finalize')).length, 1);
      assert.deepEqual(calls.find(c => c.url === '/v1/exams/e1/feedback').body, { text: 'Examples first.', type: 'preference', key: 'explanation_order', topicIds: [], applicability: 'learner' });
    } finally { bridge.close(); }
  });
});

test('reading stays on while this page uploads; a file whose upload broke off holds nothing up, nor its siblings', async () => {
  const reading = [];
  let open, status = { knowledgeVersion: 1, pendingBuild: false, files: [] };
  const gate = new Promise(done => { open = done; });
  await withBackend({
    'GET /v1/exams/e1/status': () => status, 'GET /v1/exams/e1/topics': { topics: [] }, 'GET /v1/exams/e1/focus': { sections: [], activeSectionId: null },
    'POST /v1/exams/e1/uploads': body => gate.then(() => ({ uploads: body.files.map((f, i) => ({ sourceFileId: `f${i}`, uploadToken: 'u', uploadUrl: `/v1/uploads/${f.filename}` })) })),
    'PUT /v1/uploads/bad.md': { httpStatus: 500, error: { message: 'The upload broke off.' } },
  }, async calls => {
    const bridge = Object.assign(new TutorBridge({ onReading: on => reading.push(on) }), { exam: { examId: 'e1', title: 'CS 3410' }, session: 's1' });
    try {
      const upload = bridge.addDocuments([new File(['a'], 'good.md'), new File(['b'], 'bad.md'), new File(['c'], 'also.md')]);
      await new Promise(done => setTimeout(done, 0));
      await bridge.refresh();
      assert.equal(reading.at(-1), true, 'a poll mid-upload leaves reading on');
      open();
      await assert.rejects(upload, /broke off/);
      assert.deepEqual(calls.filter(c => c.url.endsWith('/finalize')).map(c => c.url), ['/v1/exams/e1/uploads/f0/finalize', '/v1/exams/e1/uploads/f2/finalize'], 'the others are finalized');
      status = { ...status, files: [{ sourceFileId: 'f1', filename: 'bad.md', status: 'uploading' }] };
      await bridge.refresh();
      assert.equal(reading.at(-1), false, 'never finalized, it is not being read');
    } finally { open(); bridge.close(); }
  });
});

test('a reading becomes words for Plato, with its math; an unreadable one is nothing', () => {
  assert.equal(written({ transcription: ' 42 ', mathLatex: null, confidence: 'clear' }), '42');
  assert.equal(written({ transcription: 'x squared', mathLatex: 'x^2', confidence: 'partial' }), 'x squared (as math: x^2)');
  assert.equal(written({ transcription: 'scribble', mathLatex: null, confidence: 'unreadable' }), '');
  assert.equal(written(undefined), '');
});
