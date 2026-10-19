// Tutor-made elements: POST /v1/sessions/{id}/elements makes a visual in one awaited call, grounded in the course,
// checked by its kind's validator and repaired once; nothing is stored.
import test from 'node:test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { setup, startSession } from './acceptance/_session-helpers.mjs';
import { createHttpHandler } from '../http/index.mjs';

const create = (h, sessionId, body, principal = h.learner) => h.app.services.elements.create(principal, sessionId, body);
const rejects = (promise, code, pattern = /./) => assert.rejects(promise, error => error.code === code && pattern.test(error.message));

test('a visual is made from the request, the recent dialogue and the course, and comes back checked', async () => {
  const h = await setup(), { sessionId } = await startSession(h, 'qr'), seen = [];
  h.controls.elementMaker = { seen };
  const made = await create(h, sessionId, { request: 'a D flip-flop with its clock', kind: 'circuit', recent: [{ speaker: 'student', text: 'what does the clock do in QR?' }] });
  assert.match(made.elementId, /^elm_/);
  assert.equal(made.kind, 'circuit');
  assert.ok(made.title && made.summary);
  assert.equal(made.spec.parts.length, 5);
  assert.equal(seen[0].kind, 'circuit');
  assert.equal(seen[0].topic, 'QR factorization');
  assert.deepEqual(seen[0].recentDialogue, ['student: what does the clock do in QR?']);
  assert.ok(seen[0].grounding.some(text => text.includes('Gram-Schmidt')), 'grounded in the active topic');
  assert.equal(seen[0].repair, undefined);
});

test('a spec its validator rejects is repaired once with the reason; without time for that, the reason is the error', async () => {
  const h = await setup(), { sessionId } = await startSession(h), seen = [];
  h.controls.elementMaker = { seen, specs: [{ parts: [{ id: 'n', type: 'not', in: ['n'], col: 0, row: 0 }] }] };
  const made = await create(h, sessionId, { request: 'an inverter loop', kind: 'circuit' });
  assert.equal(made.spec.parts[0].id, 'R');
  assert.match(seen[1].repair.problem, /^Invalid circuit: it never settles/);
  assert.ok(seen[1].timeoutMs >= 15_000 && seen[1].timeoutMs <= 55_000);

  // Output that misses the shape (a title over 80 characters) gets the same one repair.
  const maker = h.app.providers.elementMaker, real = maker.make, asked = [];
  maker.make = async request => { asked.push(request); const result = await real(request); if (!request.repair) result.value.title = 'x'.repeat(81); return result; };
  h.controls.elementMaker = {};
  assert.equal((await create(h, sessionId, { request: 'an SR latch', kind: 'circuit' })).title, 'Example circuit');
  assert.match(asked[1].repair.problem, /title/);
  assert.equal(asked[1].repair.rejectedSpec, undefined);
  maker.make = real;

  h.controls.elementMaker = { delayMs: 45_000, specs: [{ lang: 'riscv', code: 'fmul.d f0, f1, f2' }] };
  await rejects(create(h, sessionId, { request: 'a float multiply', kind: 'trace' }), 'quality_gate', /fmul.d is not supported/);
});

test('the session must be the student\'s own, the body well formed, and a provider failure says so', async () => {
  const h = await setup(), { sessionId } = await startSession(h);
  await rejects(create(h, sessionId, { request: 'x' }, h.app.auth.createPrincipal()), 'ownership_denied');
  await rejects(create(h, sessionId, { request: '' }), 'invalid_input');
  await rejects(create(h, sessionId, { request: 'x', kind: 'video' }), 'invalid_input');
  await rejects(create(h, sessionId, { request: 'x', recent: Array(9).fill({ speaker: 'student', text: 'hi' }) }), 'invalid_input');
  h.controls.elementMaker = { fail: 1 };
  await rejects(create(h, sessionId, { request: 'a trace', kind: 'trace' }), 'provider_unavailable');
});

test('over HTTP: 200 with the element, 413 past 16 KB', async t => {
  const h = await setup(), { sessionId } = await startSession(h), handle = createHttpHandler(h.app);
  const server = createServer(async (req, res) => { if (!await handle(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/v1/sessions/${sessionId}/elements`, { method: 'POST', headers: { Authorization: `Bearer ${h.learner.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ok = await post({ request: 'step through sum', kind: 'trace' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.kind, 'trace');
  assert.equal(body.spec.lang, 'riscv');
  assert.equal((await post({ request: 'x', recent: [{ speaker: 'student', text: 'y'.repeat(17_000) }] })).status, 413);
});
