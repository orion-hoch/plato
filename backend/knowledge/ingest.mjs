import { randomBytes } from 'node:crypto';
import { newId, hashOf, sha256Bytes } from '../core/util.mjs';
import { AppError, structured, issue } from '../core/errors.mjs';
import { s, validate } from '../core/shape.mjs';
import { call, workIdentity } from '../providers/contracts.mjs';
import { capabilityFor, detectMime, parseRegions, withTimeout } from './formats.mjs';
import { EXTRACT_READING } from './schemas.mjs';
import { transcribePdf } from './pages.mjs'; // v8: PDFs read page by page into markdown

// L0 uploads and L1 extraction (spec §4.1, §6). Originals are immutable blobs; each extraction
// attempt is a new ExtractionArtifact with its own immutable anchors.

const FILES = s.array(s.object({
  filename: s.string({ min: 1, max: 300 }), size: s.int({ min: 0 }), declaredMime: s.string({ min: 1, max: 200 }),
  replacingSourceFileId: s.nullable(s.string({ max: 200 })),
}, { optional: ['replacingSourceFileId'] }), { min: 1, max: 100 });
const FINALIZE = s.object({ uploadToken: s.string({ min: 1, max: 200 }), checksum: s.string({ min: 1, max: 200 }), uploadedByteLength: s.int({ min: 0 }) });

const TEXT_MIMES = new Set(['text/plain', 'text/markdown', 'text/csv']);

export function createIngest(app, build) {
  const { db, clock, blobs, jobs, events, config } = app;

  const failedFile = (file, error) => db.update('source_files', { ...file, status: 'failed', error: structured(error), updatedAt: clock.iso() });

  function createUploads(principal, examId, files) {
    validate(FILES, files, { what: 'upload list' });
    const exam = app.auth.requireExam(principal, examId);
    const scope = app.auth.examScope(exam);
    return db.tx(() => {
      const active = db.find('source_files', {}, { scope }).filter(f => f.status !== 'deleted' && f.status !== 'failed').length;
      return files.map((file, i) => {
        const format = capabilityFor(config, file);
        let sourceFile = file.replacingSourceFileId ? db.get('source_files', file.replacingSourceFileId, scope) : null;
        if (file.replacingSourceFileId && !sourceFile) throw new AppError('ownership_denied', 'Source file to replace not found.');
        if (!sourceFile) {
          sourceFile = { id: newId('srcf'), scope, createdAt: clock.iso(), updatedAt: clock.iso(), rowVersion: 0, filename: file.filename, declaredMime: file.declaredMime, detectedMime: null, currentSourceVersionId: null, status: 'uploading', error: null, size: file.size };
          db.insert('source_files', sourceFile);
        }
        const reject = error => { const failed = failedFile(sourceFile, error); return { sourceFileId: failed.id, uploadToken: null, uploadUrl: null, status: 'failed', error: failed.error }; };
        if (!format) return reject(new AppError('unsupported_format', `${file.filename}: ${file.declaredMime} is not a supported format.`, { retryable: false }));
        if (file.size > format.maxBytes) return reject(new AppError('invalid_input', `${file.filename} is larger than the ${format.maxBytes}-byte limit for this format.`, { retryable: false }));
        if (!file.replacingSourceFileId && active + i >= config.uploads.maxFiles) return reject(new AppError('invalid_input', `An exam can hold at most ${config.uploads.maxFiles} files.`, { retryable: false }));
        const token = randomBytes(24).toString('base64url');
        db.insert('upload_tokens', { id: newId('upt'), scope, createdAt: clock.iso(), sourceFileId: sourceFile.id, tokenHash: hashOf(token), state: 'pending', expectedSize: file.size, declaredMime: file.declaredMime, filename: file.filename, extractor: format.extractor, blob: null, replacing: Boolean(file.replacingSourceFileId), sourceVersionId: null });
        if (file.replacingSourceFileId) db.update('source_files', { ...sourceFile, status: sourceFile.status === 'failed' ? 'uploading' : sourceFile.status, updatedAt: clock.iso() });
        return { sourceFileId: sourceFile.id, uploadToken: token, uploadUrl: `/v1/uploads/${token}`, status: 'uploading', error: null };
      });
    });
  }

  const tokenRecord = token => {
    const record = db.findOne('upload_tokens', { tokenHash: hashOf(String(token || '')) });
    if (!record) throw new AppError('ownership_denied', 'Upload not found.');
    const exam = db.get('exams', record.scope.examId);
    if (!exam || exam.status === 'deleting' || exam.status === 'deleted') throw new AppError('deleted', 'This exam was deleted.');
    return record;
  };

  /** Store the uploaded bytes as the immutable L0 original. The token is the credential. */
  function putUploadBytes(token, bytes) {
    const record = tokenRecord(token);
    if (record.state === 'finalized') throw new AppError('version_conflict', 'This upload is already finalized.');
    const format = config.uploads.capabilities.formats.find(f => f.mime === record.declaredMime);
    if (bytes.length > format.maxBytes) throw new AppError('payload_too_large', 'The upload exceeds the size limit for this format.');
    const ref = blobs.put({ scope: record.scope, bytes, mediaType: record.declaredMime });
    db.replace('upload_tokens', { ...record, state: 'uploaded', blob: ref });
    return { checksum: ref.sha256, byteLength: ref.byteLength };
  }

  function finalizeUpload(principal, examId, sourceFileId, body) {
    validate(FINALIZE, body);
    const exam = app.auth.requireExam(principal, examId);
    const scope = app.auth.examScope(exam);
    const record = tokenRecord(body.uploadToken);
    if (record.scope.examId !== exam.id || record.sourceFileId !== sourceFileId) throw new AppError('ownership_denied', 'Upload not found.');
    if (record.state === 'finalized') {
      const file = db.must('source_files', sourceFileId, scope);
      return { sourceVersionId: record.sourceVersionId, buildGeneration: record.buildGeneration, status: file.status === 'failed' ? 'failed' : file.status === 'needs_review' ? 'needs-review' : 'accepted' };
    }
    if (record.state !== 'uploaded') throw new AppError('invalid_input', 'Upload the file bytes before finalizing.');
    const checksum = body.checksum.includes(':') ? body.checksum : `c1:sha256:${body.checksum}`;
    if (checksum !== record.blob.sha256 || body.uploadedByteLength !== record.blob.byteLength) throw new AppError('invalid_input', 'Checksum or length does not match the uploaded bytes.');
    const bytes = blobs.read(record.blob, scope);
    if (sha256Bytes(bytes) !== record.blob.sha256) throw new AppError('quality_gate', 'Stored bytes failed verification.');
    const detected = detectMime(bytes, record.declaredMime);
    const compatible = detected === record.declaredMime || (TEXT_MIMES.has(record.declaredMime) && TEXT_MIMES.has(detected));
    return db.tx(() => {
      let file = db.must('source_files', sourceFileId, scope);
      if (!compatible) {
        file = failedFile({ ...file, detectedMime: detected }, new AppError('unsupported_format', `${file.filename} contains ${detected}, not the declared ${record.declaredMime}.`, { retryable: false }));
        db.replace('upload_tokens', { ...record, state: 'finalized', sourceVersionId: null, buildGeneration: null });
        return { sourceVersionId: null, buildGeneration: null, status: 'failed' };
      }
      const prior = file.currentSourceVersionId ? db.get('source_versions', file.currentSourceVersionId, scope) : null;
      const version = { id: newId('srcv'), scope, createdAt: clock.iso(), sourceFileId, version: (prior?.version || 0) + 1, original: record.blob, contentHash: record.blob.sha256, replacesSourceVersionId: prior?.id || null, uploadFinalizedAt: clock.iso(), capabilityProfileVersion: config.uploads.capabilities.version };
      db.insert('source_versions', version);
      file = db.update('source_files', { ...file, detectedMime: detected, currentSourceVersionId: version.id, status: 'processing', error: null, filename: record.filename, updatedAt: clock.iso() });
      const b = build.newBuild(exam.id, `source ${prior ? 'replaced' : 'added'}: ${file.filename}`, prior ? [{ kind: 'source_version', id: prior.id, version: prior.version }] : []);
      db.replace('upload_tokens', { ...record, state: 'finalized', sourceVersionId: version.id, buildGeneration: b.generation });
      events.emit({ scope, eventType: 'source.finalized', aggregateType: 'source_file', aggregateId: sourceFileId, aggregateVersion: version.version, payload: { sourceVersionId: version.id, buildGeneration: b.generation, capabilityProfileVersion: version.capabilityProfileVersion }, idempotencyKey: `source.finalized:${version.id}` });
      jobs.enqueue({ scope, type: 'extract_source', idempotencyKey: `extract:${version.id}:initial`, payload: { sourceVersionId: version.id, strategy: 'deterministic', attemptKey: 'initial' }, priority: 10 });
      if (prior) jobs.enqueue({ scope, type: 'invalidate_dependencies', idempotencyKey: `invalidate:${prior.id}`, payload: { replacedSourceVersionId: prior.id, newSourceVersionId: version.id, buildId: b.id }, priority: 20 });
      return { sourceVersionId: version.id, buildGeneration: b.generation, status: 'accepted' };
    });
  }

  function retrySource(principal, examId, sourceFileId, { expectedSourceVersionId, strategy = 'deterministic' } = {}) {
    if (!['deterministic', 'ocr', 'model_assisted'].includes(strategy)) throw new AppError('invalid_input', 'Unknown extraction strategy.');
    const exam = app.auth.requireExam(principal, examId);
    const scope = app.auth.examScope(exam);
    return db.tx(() => {
      const file = db.must('source_files', sourceFileId, scope, 'Source file');
      if (!file.currentSourceVersionId) throw new AppError('invalid_input', 'This file has no finalized version to retry.');
      if (expectedSourceVersionId !== file.currentSourceVersionId) throw new AppError('version_conflict', 'The source changed; reload and retry.');
      const attempts = db.find('extraction_artifacts', { sourceVersionId: file.currentSourceVersionId }, { scope }).length;
      const attemptKey = `retry-${attempts + 1}`;
      db.update('source_files', { ...file, status: 'processing', error: null, updatedAt: clock.iso() });
      const b = build.newBuild(exam.id, `retry ${file.filename}`, []);
      const job = jobs.enqueue({ scope, type: 'extract_source', idempotencyKey: `extract:${file.currentSourceVersionId}:${attemptKey}`, payload: { sourceVersionId: file.currentSourceVersionId, strategy, attemptKey }, priority: 10 });
      return { jobId: job.id, status: 'queued', buildGeneration: b.generation };
    });
  }

  // ---------- extract_source ----------

  jobs.register('extract_source', async ({ sourceVersionId, strategy, attemptKey }, ctx) => {
    const scope = ctx.job.scope;
    const sv = db.must('source_versions', sourceVersionId, scope);
    const file = db.must('source_files', sv.sourceFileId, scope);
    const existing = db.find('extraction_artifacts', { sourceVersionId }, { scope }).find(a => a.attemptKey === attemptKey);
    if (existing) { ctx.commit(() => afterExtraction(scope, sv, existing)); return { resultRefs: [{ kind: 'extraction_artifact', id: existing.id, version: existing.version }] }; }
    const format = config.uploads.capabilities.formats.find(f => f.mime === file.declaredMime);
    const bytes = blobs.read(sv.original, scope);
    let regions, parseError = null, pages = { runs: [], issues: [] };
    // v8: with a page reader configured, a PDF is rendered and transcribed page by page into markdown (pages.mjs).
    const paged = format.extractor === 'pdf' && Boolean(app.providers.extractor?.transcribe);
    try { if (paged) ({ regions, ...pages } = await transcribePdf(app, { scope, sv, file, bytes, format, ctx })); else regions = await withTimeout(parseRegions(format, bytes), config.uploads.capabilities.parserTimeoutMs); }
    catch (error) { if (!(error instanceof AppError)) error = new AppError('quality_gate', 'The file could not be parsed.', { retryable: false }); if (error.retryable) throw error; parseError = error; regions = []; }

    // Escalate uncertain regions to the model-assisted extractor (vision/formula), never inventing content.
    const runs = [...pages.runs], escalation = [];
    const keyed = regions.map((r, i) => ({ ...r, anchorKey: anchorKey(r, i), origin: r.origin || 'parser' }));
    const unresolved = keyed.filter(r => r.disposition !== 'faithful');
    if (unresolved.length && app.providers.extractor) {
      const request = {
        work: workIdentity({ scope, idempotencyKey: `extract:${sourceVersionId}:${attemptKey}:model`, input: { sourceVersionId, keys: unresolved.map(r => r.anchorKey) }, clock }),
        sourceVersion: sv, originalAccess: sv.original, capabilityProfileVersion: sv.capabilityProfileVersion, strategy: 'model_assisted',
        unresolvedAnchorIds: unresolved.map(r => r.anchorKey), priorExtractionId: null,
        filename: file.filename, regionsToRead: unresolved.map(r => ({ anchorKey: r.anchorKey, kind: r.kind, reason: r.uncertaintyReason, location: r.location })),
        images: unresolved.filter(r => r.raster).map(r => ({ anchorKey: r.anchorKey, dataUrl: `data:image/png;base64,${Buffer.from(r.raster).toString('base64')}` })),
      };
      const result = await call(input => app.providers.extractor.extract(input), request, { valueSchema: EXTRACT_READING, what: 'extraction' });
      runs.push(...result.providerRuns);
      if (result.outcome === 'ok') {
        for (const reading of result.value.regions) {
          const region = keyed.find(r => r.anchorKey === reading.anchorKey);
          if (!region) continue;
          region.kind = reading.kind;
          if (reading.disposition === 'faithful' && reading.extractedText?.trim()) Object.assign(region, { disposition: 'faithful', text: reading.extractedText.trim(), confidence: reading.confidence, origin: 'model', uncertaintyReason: null });
          else Object.assign(region, { disposition: reading.disposition === 'unreadable' ? 'unreadable' : 'uncertain', uncertaintyReason: reading.uncertaintyReason || region.uncertaintyReason });
        }
        escalation.push(...result.value.escalation);
      } else if (result.error?.retryable && ctx.job.attempt < ctx.job.maxAttempts) {
        throw new AppError(result.error.code, result.error.message, { retryable: true });
      } else escalation.push({ anchorKeys: unresolved.map(r => r.anchorKey), requiredCapability: 'model_assisted_extraction', reason: result.error?.message || 'Model-assisted extraction unavailable.' });
    } else if (unresolved.length) escalation.push({ anchorKeys: unresolved.map(r => r.anchorKey), requiredCapability: 'model_assisted_extraction', reason: 'No model-assisted extractor configured.' });

    // Build L1 markdown with explicit UNCERTAIN markers, then immutable anchors with evidence slices.
    let markdown = '';
    const anchors = [], artifactId = newId('ext');
    for (const r of keyed) {
      const body = r.disposition === 'faithful' ? r.text : `[UNCERTAIN: ${r.uncertaintyReason || 'unreadable region'}; anchor=${r.anchorKey}]`;
      const start = markdown.length + (markdown ? 2 : 0);
      markdown += (markdown ? '\n\n' : '') + (r.origin === 'model' ? `${body}\n<!-- model-derived: ${r.anchorKey} -->` : body);
      const evidence = r.disposition === 'faithful' ? blobs.putText({ scope, text: r.text, mediaType: 'text/plain; charset=utf-8' }) : r.raster ? blobs.put({ scope, bytes: Buffer.from(r.raster), mediaType: 'image/png' }) : sv.original;
      anchors.push({ id: newId('anc'), scope, createdAt: clock.iso(), sourceVersionId, anchorKey: r.anchorKey, location: { ...r.location, extractedCharStart: start, extractedCharEnd: start + body.length }, evidenceArtifact: evidence, excerptHash: evidence.sha256, extractionArtifactId: artifactId, disposition: r.disposition, kind: r.kind, origin: r.origin, pageImage: r.pageImage ?? null }); // pageImage: the rendered PDF page (v8)
    }
    const markdownRef = blobs.putText({ scope, text: markdown });
    const prior = db.find('extraction_artifacts', { sourceVersionId }, { scope }).at(-1);
    const uncertainCount = keyed.filter(r => r.disposition !== 'faithful').length;
    const status = parseError ? 'failed' : !keyed.length ? 'needs_review' : uncertainCount === keyed.length ? 'needs_review' : uncertainCount ? 'partial' : 'valid';
    const artifact = {
      id: artifactId, scope, createdAt: clock.iso(), sourceVersionId, version: (prior?.version || 0) + 1, supersedesId: prior?.id || null, status,
      markdown: markdownRef, anchorIds: anchors.map(a => a.id), extractorConfigVersion: `${format.extractor}_${paged ? 'v2_pages' : 'v1'}+${strategy}`,
      regions: anchors.map((a, i) => ({ anchorId: a.id, kind: keyed[i].kind, disposition: keyed[i].disposition, extractedText: keyed[i].disposition === 'faithful' ? keyed[i].text : null, confidence: keyed[i].confidence ?? (keyed[i].origin === 'parser' && keyed[i].disposition === 'faithful' ? 1 : null), uncertaintyReason: keyed[i].uncertaintyReason || null, originalEvidence: a.evidenceArtifact, pageImage: a.pageImage })),
      issues: [
        ...(parseError ? [issue(parseError.code, parseError.message, { severity: 'blocking', resolution: 'needs_review' })] : []),
        ...pages.issues.map(m => issue('page_transcription', m, { severity: 'warning', resolution: 'accepted_provisional' })),
        ...escalation.map(e => issue('unresolved_region', `${e.reason} (${e.requiredCapability})`, { severity: 'warning', affected: e.anchorKeys.map(k => ({ kind: 'source_anchor', id: anchors.find(a => a.anchorKey === k)?.id || k, version: null })), resolution: 'needs_review' })),
      ],
      dependencies: [{ ref: { kind: 'source_version', id: sourceVersionId, version: sv.version }, hash: sv.contentHash, relation: 'derived_from' }],
      runs, attemptKey, escalation, error: parseError ? structured(parseError) : null,
    };
    ctx.commit(() => {
      db.insert('extraction_artifacts', artifact);
      for (const a of anchors) db.insert('source_anchors', a);
      db.prepare('INSERT OR IGNORE INTO dependency_index(ref_kind, ref_id, dependent_kind, dependent_id, exam_id) VALUES(?,?,?,?,?)').run('source_version', sourceVersionId, 'extraction_artifact', artifactId, scope.examId);
      afterExtraction(scope, sv, artifact);
    });
    return { resultRefs: [{ kind: 'extraction_artifact', id: artifact.id, version: artifact.version }] };
  });

  function anchorKey(region, i) {
    const l = region.location;
    const where = l.page ? `p${l.page}` : l.slide ? `s${l.slide}` : l.sheet ? `t${l.cells}` : 'b';
    return `${where}-${i + 1}`;
  }

  /** Inside a tx: record the outcome, then interpret or settle the source. Idempotent. */
  function afterExtraction(scope, sv, artifact) {
    events.emit({ scope, eventType: 'source.extraction_completed', aggregateType: 'source_version', aggregateId: sv.id, aggregateVersion: artifact.version, payload: { extractionArtifactId: artifact.id, anchorIds: artifact.anchorIds, disposition: artifact.status }, idempotencyKey: `source.extraction_completed:${artifact.id}` });
    const file = db.get('source_files', sv.sourceFileId, scope);
    if (file.currentSourceVersionId !== sv.id) return; // replaced meanwhile; its own version continues
    if (artifact.status === 'failed' || artifact.status === 'needs_review' && !artifact.regions.some(r => r.disposition === 'faithful')) {
      db.update('source_files', { ...file, status: artifact.status === 'failed' ? 'failed' : 'needs_review', error: artifact.error || { code: 'quality_gate', retryable: false, message: 'No readable content could be extracted.', retryAfterMs: null, issues: artifact.issues }, updatedAt: clock.iso() });
      build.maybeAdvance(scope.examId);
      return;
    }
    jobs.enqueue({ scope, type: 'interpret_source', idempotencyKey: `interpret:${artifact.id}`, payload: { sourceVersionId: sv.id, extractionArtifactId: artifact.id }, priority: 8 });
  }

  return { createUploads, putUploadBytes, finalizeUpload, retrySource };
}
