import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { AppError, structured } from '../core/errors.mjs';
import { newId, hashOf } from '../core/util.mjs';
import { sourceName } from '../lessons/build-course.mjs';

// HTTP contracts (spec §10): authenticated routes, Idempotency-Key, structured errors, SSE events,
// and authorized admin/debug routes. Services do the work; this layer only adapts.

const JSON_LIMIT = 1_000_000;

async function readBody(req, limit) {
  const parts = []; let size = 0;
  for await (const part of req) { size += part.length; if (size > limit) throw new AppError('payload_too_large', 'Request body is too large.'); parts.push(part); }
  return Buffer.concat(parts);
}
async function readJson(req, limit = JSON_LIMIT) {
  const body = await readBody(req, limit);
  if (!body.length) return {};
  try { return JSON.parse(body.toString('utf8')); } catch { throw new AppError('invalid_input', 'Send valid JSON.'); }
}
function send(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(value));
}

export function createHttpHandler(app, { localPrincipalFile } = {}) {
  const { services, auth, db, clock } = app;
  const routes = [];
  const route = (method, pattern, handler, { mutation = method !== 'GET', raw = false, admin = false, publicRoute = false, jsonLimit = JSON_LIMIT } = {}) =>
    routes.push({ method, regex: new RegExp(`^${pattern.replace(/\{(\w+)\}/g, '(?<$1>[^/]+)')}$`), pattern, handler, mutation, raw, admin, publicRoute, jsonLimit });

  // ---- Local single-user sign-in: loopback + same-origin only. Returns the local learner's token.
  route('POST', '/v1/local/principal', async ({ req }) => {
    if (!localPrincipalFile) throw new AppError('forbidden', 'Local sign-in is disabled.');
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) throw new AppError('forbidden', 'Local sign-in must come from this app.');
    let saved = existsSync(localPrincipalFile) ? JSON.parse(readFileSync(localPrincipalFile, 'utf8')) : null;
    if (!saved || !db.findOne('principals', { tokenHash: hashOf(saved.token) })) {
      const principal = auth.createPrincipal();
      saved = { token: principal.token, tenantId: principal.tenantId, learnerId: principal.learnerId };
      mkdirSync(path.dirname(localPrincipalFile), { recursive: true, mode: 0o700 });
      writeFileSync(localPrincipalFile, JSON.stringify(saved), { mode: 0o600 });
    }
    return { status: 200, body: { token: saved.token } };
  }, { mutation: false, publicRoute: true });

  // ---- Exams
  // A harness course's study guide build and what it checked (backend/lessons/build-course.mjs), for the course chooser.
  const guideOf = examId => {
    let st = null; try { st = app.config.studyDir ? JSON.parse(readFileSync(path.join(app.config.studyDir, examId, 'build.json'), 'utf8')) : null; } catch { /* no build */ }
    // Its practice exams (build-course.mjs PRACTICE), for the course page: name, title, questions and points.
    const practice = (st?.practice || []).map(name => { try { const t = readFileSync(path.join(app.config.studyDir, examId, 'practice', `${name}.md`), 'utf8'), qs = t.match(/^## .+$/gm) || []; return { name, title: t.match(/^# Practice exam: (.+)$/m)?.[1] || name, questions: qs.length, points: qs.reduce((n, q) => n + Number(q.match(/\((\d+) points?\)/)?.[1] || 0), 0) }; } catch { return null; } }).filter(Boolean);
    return st && { state: st.state, units: st.units?.length || 0, done: st.done?.length || 0, topics: st.topics ?? null, report: st.report ?? null, added: st.added || [], at: st.at, practice };
  };
  // Their material and where each file is on its way into the course (16 Oct, the user: "a better protocol for the user to be
  // able to drag in new material and be able to sync it up"): uploading, reading, being added to the study guide, in it.
  // A course without a harness guide (built by hand or by the knowledge build) has its files read and searchable: ready.
  route('GET', '/v1/exams/{examId}/material', ({ principal, params }) => {
    const exam = auth.requireExam(principal, params.examId), scope = auth.examScope(exam), dir = app.config.studyDir ? path.join(app.config.studyDir, exam.id) : null;
    const json = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
    const st = dir && json(path.join(dir, 'build.json')), seen = (dir && json(path.join(dir, 'sources', '.seen.json'))) || {}, harness = Boolean(st || exam.knowledgeSource === 'guide');
    const building = ['planning', 'updating', 'writing', 'practice', 'kits', 'checking'].includes(st?.state);
    // In the guide: written from it (the build's sources), or there before the guide's last step; being added: new to the
    // guide's update, or come since and waiting for it (the harness takes it in once the batch settles).
    const guideState = f => {
      const name = sourceName(f.filename), newer = Date.parse(f.updatedAt || f.createdAt) > Date.parse(st?.at || 0);
      if (!st?.sources) return building || newer || !st ? 'adding' : 'in_guide';
      if (st.sources.includes(name)) return 'in_guide';
      if (st.added?.includes(name)) return building ? 'adding' : 'in_guide';
      return newer ? 'adding' : 'in_guide';
    };
    const files = db.find('source_files', {}, { scope }).filter(f => f.status !== 'deleted').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(f => {
      const state = f.status === 'failed' ? 'failed' : ['uploading', 'queued'].includes(f.status) ? 'uploading' : f.status === 'processing' || !f.currentSourceVersionId ? 'reading'
        : !harness ? 'ready' : seen[f.id] !== f.currentSourceVersionId ? 'reading' : guideState(f);
      return { id: f.id, name: f.filename, state, at: f.updatedAt || f.createdAt, ...(f.status === 'failed' ? { problem: f.error?.message || null } : {}) };
    });
    return { body: { files, guide: guideOf(exam.id) } };
  });
  route('GET', '/v1/exams', ({ principal }) => ({ body: { exams: db.find('exams', {}, { scope: auth.learnerScope(principal) }).filter(e => e.status !== 'deleted' && e.status !== 'deleting' && !e.hidden).map(e => ({ examId: e.id, title: e.title, status: e.status, examDate: e.examDate, rowVersion: e.rowVersion, knowledgeReady: Boolean(e.publishedKnowledgeManifestId), guide: guideOf(e.id) })) } }));
  route('POST', '/v1/exams', ({ principal, body }) => { const exam = services.exams.create(principal, body); return { status: 201, body: { examId: exam.id, status: exam.status, rowVersion: exam.rowVersion } }; });
  route('PATCH', '/v1/exams/{examId}', ({ principal, params, body }) => { const exam = services.exams.patch(principal, params.examId, body); return { body: { examId: exam.id, title: exam.title, instructions: exam.instructions, examDate: exam.examDate, status: exam.status, rowVersion: exam.rowVersion } }; });
  route('DELETE', '/v1/exams/{examId}', ({ principal, params, body }) => ({ status: 202, body: services.exams.remove(principal, params.examId, { expectedRowVersion: body.expectedRowVersion }) }));
  route('GET', '/v1/exams/{examId}/status', ({ principal, params }) => ({ body: services.knowledge.status(principal, params.examId) }));
  route('GET', '/v1/exams/{examId}/topics', ({ principal, params, req }) => {
    const exam = auth.requireExam(principal, params.examId);
    const projection = services.session.topicProjection(auth.examScope(exam));
    const etag = `"${hashOf(projection).split(':').pop().slice(0, 32)}"`;
    if (req.headers['if-none-match'] === etag) return { status: 304, body: null, headers: { ETag: etag } };
    return { body: projection, headers: { ETag: etag } };
  });
  // Visible mastery and progression (user override of spec §1.3/§10).
  route('GET', '/v1/exams/{examId}/progress', ({ principal, params }) => ({ body: services.session.progress(auth.examScope(auth.requireExam(principal, params.examId))) }));
  route('GET', '/v1/exams/{examId}/map', ({ principal, params }) => ({ body: services.learner.map(auth.examScope(auth.requireExam(principal, params.examId))) })); // v12: the open learner model (spec §10)
  route('POST', '/v1/exams/{examId}/feedback', ({ principal, params, body }) => {
    const exam = auth.requireExam(principal, params.examId);
    return { status: 202, body: services.learner.recordFeedback(auth.examScope(exam), { sessionId: null, turnId: null, topicIds: body.topicIds || [], text: body.text, type: body.type || 'other', explicit: true, key: body.key, applicability: body.applicability || 'exam' }) };
  });

  // ---- Focus sections (student-created goals)
  route('GET', '/v1/exams/{examId}/focus', ({ principal, params }) => ({ body: services.session.focusList(principal, params.examId) }));
  route('POST', '/v1/exams/{examId}/focus', ({ principal, params, body }) => ({ status: 201, body: services.session.focusCreate(principal, params.examId, body) }));
  route('PATCH', '/v1/exams/{examId}/focus/{sectionId}', ({ principal, params, body }) => ({ body: services.session.focusPatch(principal, params.examId, params.sectionId, body) }));
  route('DELETE', '/v1/exams/{examId}/focus/{sectionId}', ({ principal, params }) => ({ body: services.session.focusDelete(principal, params.examId, params.sectionId) }));

  // ---- The director's routes (v9)
  route('POST', '/v1/sessions/{sessionId}/topic-change', ({ principal, params, body }) => ({ body: services.director.changeTopic(principal, params.sessionId, body) }), { jsonLimit: 2_048 }); // v9: the actor's change_topic
  route('POST', '/v1/sessions/{sessionId}/guide', async ({ principal, params, body }) => ({ body: await services.director.guide(principal, params.sessionId, body) }), { jsonLimit: 16_384 }); // guide mode: show a board, move on, practise, write (a worked example up to 4,000 characters)
  route('POST', '/v1/sessions/{sessionId}/think', ({ principal, params, body }) => ({ status: 202, body: services.director.think(principal, params.sessionId, body) }), { jsonLimit: 4_096 }); // v9: think
  route('POST', '/v1/sessions/{sessionId}/evidence', ({ principal, params, body }) => ({ status: 202, body: services.director.evidence(principal, params.sessionId, body) }), { jsonLimit: 262_144 }); // v12: element and reading events → learner observations and exposures

  // ---- Course modules (v7): the page's source view opens a [src:…] ref. DB only; it changes nothing.
  route('GET', '/v1/exams/{examId}/sources/{ref}', ({ principal, params }) => ({ body: services.modules.examSource(principal, params.examId, params.ref) }));


  // ---- Uploads
  route('POST', '/v1/exams/{examId}/uploads', ({ principal, params, body }) => ({ status: 201, body: { uploads: services.knowledge.createUploads(principal, params.examId, body.files || []) } }));
  route('PUT', '/v1/uploads/{token}', async ({ req, params }) => {
    const bytes = await readBody(req, 60_000_000);
    services.knowledge.putUploadBytes(params.token, bytes);
    return { body: { received: bytes.length } };
  }, { raw: true, publicRoute: true }); // the upload token is the capability; it is single-use and exam-bound
  route('POST', '/v1/exams/{examId}/uploads/{sourceFileId}/finalize', ({ principal, params, body }) => ({ body: services.knowledge.finalizeUpload(principal, params.examId, params.sourceFileId, body) }));
  route('POST', '/v1/exams/{examId}/sources/{sourceFileId}/accept', ({ principal, params }) => ({ status: 202, body: services.knowledge.acceptSource(principal, params.examId, params.sourceFileId) }));
  route('POST', '/v1/exams/{examId}/sources/{sourceFileId}/retry', ({ principal, params, body }) => ({ status: 202, body: services.knowledge.retrySource(principal, params.examId, params.sourceFileId, body) }));

  // ---- Sessions
  route('POST', '/v1/exams/{examId}/sessions', ({ principal, params, body }) => ({ status: 201, body: services.session.start(principal, params.examId, body) }));
  route('POST', '/v1/sessions/{sessionId}/responses', ({ principal, params, body }) => ({ status: 202, body: services.session.submitResponse(principal, params.sessionId, body) }));
  route('POST', '/v1/sessions/{sessionId}/feedback', ({ principal, params, body }) => ({ status: 202, body: services.session.feedback(principal, params.sessionId, body) }));
  route('POST', '/v1/sessions/{sessionId}/questions', ({ principal, params, body }) => ({ status: 202, body: services.session.requestQuestion(principal, params.sessionId, body) }));
  route('POST', '/v1/sessions/{sessionId}/resume', ({ principal, params, body }) => ({ body: services.session.resume(principal, params.sessionId, body) }));
  route('POST', '/v1/sessions/{sessionId}/end', ({ principal, params, body }) => ({ body: services.session.end(principal, params.sessionId, body) }));
  route('POST', '/v1/sessions/{sessionId}/elements', ({ principal, params, body }) => ({ body: services.elements.create(principal, params.sessionId, body) }), { jsonLimit: 16_384 });
  route('POST', '/v1/sessions/{sessionId}/notes', ({ principal, params, body }) => ({ body: services.elements.notes(principal, params.sessionId, body) }), { jsonLimit: 4_096, mutation: false }); // show_from_notes: searches their notes; changes nothing
  route('POST', '/v1/sessions/{sessionId}/run', ({ principal, params, body }) => ({ body: services.run.run(principal, params.sessionId, body) }), { jsonLimit: 32_768, mutation: false }); // runs the student's C; changes nothing
  route('POST', '/v1/sessions/{sessionId}/drawings', ({ principal, params, body }) => ({ status: 202, body: services.session.drawings(principal, params.sessionId, body) }), { jsonLimit: 6_000_000 });
  route('POST', '/v1/sessions/{sessionId}/shapes', ({ principal, params, body }) => ({ body: services.session.drawingShapes(principal, params.sessionId, body) }), { jsonLimit: 6_000_000, mutation: false }); // reads a drawing's shapes; changes nothing
  route('POST', '/v1/sessions/{sessionId}/agent-events', ({ principal, params, body }) => ({ body: services.session.agentEvents(principal, params.sessionId, body) }));
  route('GET', '/v1/sessions/{sessionId}/events', ({ principal, params, req, res, url }) => {
    const cursor = Number(url.searchParams.get('cursor') || req.headers['last-event-id'] || 0);
    services.session.get(principal, params.sessionId); // ownership check before streaming anything
    // Subscribe first so nothing written between the backlog read and the subscription is lost.
    let sent = cursor, buffered = [], live = false;
    const write = event => {
      if (typeof event.sequence === 'number') { if (event.sequence <= sent) return; sent = event.sequence; }
      res.write(`${typeof event.sequence === 'number' ? `id: ${event.sequence}\n` : ''}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const stop = services.session.subscribe(params.sessionId, event => live ? write(event) : buffered.push(event));
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    for (const event of services.session.events(principal, params.sessionId, cursor)) write(event);
    live = true; for (const event of buffered) write(event); buffered = [];
    const ping = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
    req.on('close', () => { clearInterval(ping); stop(); });
    return { streaming: true };
  });

  // ---- Admin / debug (explicit admin role)
  route('GET', '/v1/admin/exams/{examId}/build', ({ params, adminScope }) => ({ body: services.knowledge.buildStatus(adminScope(params.examId)) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/sources/{sourceFileId}/artifacts', ({ params, adminScope }) => ({ body: services.knowledge.artifacts(adminScope(params.examId), params.sourceFileId) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/anchors', ({ params, adminScope, url }) => ({ body: services.knowledge.anchors(adminScope(params.examId), (url.searchParams.get('ids') || '').split(',').filter(Boolean)) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/topics/{topicId}/history', ({ params, adminScope }) => ({ body: services.learner.history(adminScope(params.examId), params.topicId) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/topics/{topicId}/assessments', ({ params, adminScope }) => ({ body: services.learner.assessments(adminScope(params.examId), params.topicId) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/personal/decisions', ({ params, adminScope }) => ({ body: services.learner.decisions(adminScope(params.examId)) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/personal/changes', ({ params, adminScope }) => ({ body: services.learner.changes(adminScope(params.examId)) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/questions/supply', ({ params, adminScope }) => ({ body: services.questions.supply(adminScope(params.examId)) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/questions/exposures', ({ params, adminScope }) => ({ body: services.questions.exposures(adminScope(params.examId)) }), { admin: true });
  route('GET', '/v1/admin/sessions/{sessionId}/trace', ({ params, principal }) => ({ body: services.session.trace(principal, params.sessionId) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/studies', ({ params, adminScope }) => ({ body: services.understanding.status(adminScope(params.examId)) }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/course-model', ({ params, adminScope }) => ({ body: { courseModel: services.understanding.course(adminScope(params.examId)) } }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/studies/{topicId}', ({ params, adminScope }) => ({ body: { study: services.understanding.get(adminScope(params.examId), params.topicId) } }), { admin: true });
  route('GET', '/v1/admin/exams/{examId}/jobs', ({ params, adminScope }) => ({ body: db.find('jobs', {}, { scope: adminScope(params.examId) }).map(j => ({ id: j.id, type: j.type, state: j.state, attempt: j.attempt, lastError: j.lastError, updatedAt: j.updatedAt })) }), { admin: true });

  // Admins act within their tenant; an exam in another tenant is not found.
  const adminScopeFor = principal => examId => {
    const exam = db.get('exams', examId, { tenantId: principal.tenantId });
    if (!exam || exam.status === 'deleted') throw new AppError('ownership_denied', 'Exam not found.');
    return auth.examScope(exam);
  };

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/v1/')) return false;
    const requestId = newId('req');
    try {
      const candidates = routes.filter(r => r.regex.test(url.pathname));
      if (!candidates.length) throw new AppError('ownership_denied', 'Route not found.');
      const r = candidates.find(c => c.method === req.method);
      if (!r) { send(res, 405, { requestId, error: { code: 'invalid_input', retryable: false, message: 'Method not allowed.', retryAfterMs: null, issues: [] } }); return true; }
      const params = r.regex.exec(url.pathname).groups || {};
      const principal = r.publicRoute ? null : auth.authenticate(req.headers.authorization);
      if (r.admin) auth.requireAdmin(principal);
      const body = r.raw ? null : (req.method === 'GET' ? {} : await readJson(req, r.jsonLimit));

      // Idempotency-Key replays the stored response for the same input; different input conflicts.
      const key = r.mutation && principal ? req.headers['idempotency-key'] : null;
      let idem = null;
      if (key) {
        const routeKey = `${req.method} ${url.pathname}`, inputHash = hashOf(body ?? null);
        idem = db.findOne('idempotency', { key, route: routeKey }, { scope: { tenantId: principal.tenantId, learnerId: principal.learnerId } });
        if (idem) {
          if (idem.inputHash !== inputHash) throw new AppError('idempotency_conflict', 'This Idempotency-Key was used with a different request.');
          if (idem.status) { send(res, idem.status, { ...idem.response, requestId }); return true; }
        } else {
          idem = { id: newId('idem'), scope: { tenantId: principal.tenantId, learnerId: principal.learnerId }, key, route: routeKey, inputHash, status: null, response: null, createdAt: clock.iso() };
          db.insert('idempotency', idem);
        }
      }

      const result = await r.handler({ req, res, url, params, body, principal, adminScope: principal ? adminScopeFor(principal) : null });
      if (result?.body && typeof result.body.then === 'function') result.body = await result.body; // async services
      if (result?.streaming) return true;
      const status = result?.status || 200;
      if (status === 304) { res.writeHead(304, result.headers || {}); res.end(); return true; }
      const payload = { requestId, ...(result?.body ?? {}) };
      if (idem) db.replace('idempotency', { ...idem, status, response: payload });
      send(res, status, payload, result?.headers);
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (!(error instanceof AppError)) console.error(`[http] 500 ${req.method} ${url.pathname}: ${error?.message} ${String(error?.stack || '').split('\n').find(l => l.trim().startsWith('at '))?.trim() || ''}`); // logged here, never sent: the client gets internal_error
      if (!res.headersSent) send(res, status, { requestId, error: structured(error) }, error?.retryAfterMs ? { 'Retry-After': String(Math.ceil(error.retryAfterMs / 1000)) } : {});
      else res.end();
    }
    return true;
  };
}
