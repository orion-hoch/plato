import { createKnowledgeReader } from './read.mjs';
import { createBuild } from './build.mjs';
import { createIngest } from './ingest.mjs';

// Knowledge module: uploads → L0/L1 extraction → L2 interpretation → L3 graph → refinement → publication.
// See docs/implementation-spec.md §2.1, §4.1–4.2, §5.1, §6 and backend/CONTRACTS.md.

const TABLES = ['upload_tokens', 'source_files', 'source_versions', 'extraction_artifacts', 'source_anchors', 'source_segments', 'base_interpretations', 'synthesis_partitions', 'topics', 'topic_versions', 'objective_versions', 'graph_edges', 'topic_evidence_links', 'validation_reports', 'knowledge_manifests', 'topic_migrations', 'revision_builds', 'dependency_index'];

export function installKnowledge(app) {
  const { db } = app;
  const reader = createKnowledgeReader(app);
  const build = createBuild(app);
  const ingest = createIngest(app, build);

  function status(principal, examId) {
    const exam = app.auth.requireExam(principal, examId);
    const scope = app.auth.examScope(exam);
    const files = db.find('source_files', {}, { scope }).filter(f => f.status !== 'deleted');
    const manifest = exam.publishedKnowledgeManifestId ? db.get('knowledge_manifests', exam.publishedKnowledgeManifestId, scope) : null;
    const current = db.findOne('revision_builds', { examId: exam.id, kind: 'knowledge', generation: exam.desiredBuildGeneration });
    const pendingBuild = Boolean(current && !['published', 'stale', 'failed', 'needs_review'].includes(current.state));
    return {
      examId: exam.id, status: exam.status,
      files: files.map(f => ({ sourceFileId: f.id, filename: f.filename, status: f.status, error: f.error ? { code: f.error.code, message: f.error.message, retryable: f.error.retryable } : null })),
      knowledgeVersion: manifest?.version ?? null, pendingBuild,
      coverage: manifest?.coverageStatus ?? null,
      partiallyProcessed: Boolean(manifest && manifest.coverageStatus === 'partial'),
    };
  }

  /** Admin: build history with rounds, issues and budget use. */
  function buildStatus(scope) {
    return db.find('revision_builds', { examId: scope.examId, kind: 'knowledge' }, { scope, order: 'generation' })
      .map(b => ({ id: b.id, generation: b.generation, state: b.state, reason: b.reason, round: b.round, refinement: b.refinement, consumedCalls: b.consumedCalls, issues: b.issues, targetManifestId: b.targetManifestId, sourceVersionIds: b.sourceVersionIds, changedRefs: b.changedRefs }));
  }

  /** Admin: every artifact for one source file, versions included. */
  function artifacts(scope, sourceFileId) {
    const file = db.must('source_files', sourceFileId, scope, 'Source file');
    const versions = db.find('source_versions', { sourceFileId }, { scope, order: 'version' });
    return {
      file, versions: versions.map(v => ({
        version: v,
        extractions: db.find('extraction_artifacts', { sourceVersionId: v.id }, { scope, order: 'version' }),
        anchors: db.find('source_anchors', { sourceVersionId: v.id }, { scope }),
        segments: db.find('source_segments', { sourceVersionId: v.id }, { scope, order: 'segment_index' }),
        interpretations: db.find('base_interpretations', { sourceVersionId: v.id }, { scope, order: 'version' }),
      })),
    };
  }

  // Changed exam instructions change scope evidence: rebuild the graph from existing interpretations.
  app.hooks.examPatched.push((before, after) => {
    if (before.instructions !== after.instructions && db.find('source_files', { examId: after.id }).some(f => f.currentSourceVersionId)) build.newBuild(after.id, 'exam instructions changed', [{ kind: 'exam_instructions', id: after.id, version: after.rowVersion }]);
  });
  app.hooks.examDeleted.push(exam => { for (const table of TABLES) db.prepare(`DELETE FROM ${table} WHERE exam_id = ?`).run(exam.id); });

  app.services.knowledge = { ...reader, ...ingest, status, buildStatus, artifacts, newBuild: build.newBuild, maybeAdvance: build.maybeAdvance, acceptSource: build.acceptSource }; // maybeAdvance: backend/ingest starts the deferred rebuild
}
