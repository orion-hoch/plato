import { newId, hashOf } from '../core/util.mjs';

// Seeds a published knowledge manifest directly (spec record shapes), so learner/question/session
// scenarios can run without the ingestion pipeline. The knowledge module's own tests build real ones.
// Also the canonical example of the knowledge record shapes every module reads.

export const QR_COURSE = {
  topics: [
    { key: 'linear-algebra', title: 'Linear algebra', description: 'Course root.', parentKey: null, objectives: [] },
    { key: 'projections', title: 'Projections', description: 'Orthogonal projection onto a vector or subspace.', parentKey: 'linear-algebra',
      objectives: [{ statement: 'Compute and explain the orthogonal projection of a vector onto a unit vector.', capabilities: ['explanation', 'application'] }],
      excerpt: 'Page 12. The projection of a onto a unit vector q is (qᵀa)q. The scalar qᵀa is the coefficient of a along q.' },
    { key: 'qr', title: 'QR factorization', description: 'Writing A = QR with orthonormal Q and upper-triangular R.', parentKey: 'linear-algebra',
      objectives: [{ statement: 'Interpret the projection coefficient rᵢⱼ = qᵢᵀaⱼ and use it in a QR step.', capabilities: ['explanation', 'application', 'transfer'] }],
      excerpt: 'Slide 8. Gram-Schmidt gives A = QR. Each entry rᵢⱼ = qᵢᵀaⱼ is the projection coefficient of column aⱼ on qᵢ.' },
    { key: 'eigen', title: 'Eigenvalues', description: 'Scalars λ with Av = λv for nonzero v.', parentKey: 'linear-algebra',
      objectives: [{ statement: 'Find eigenvalues of a 2×2 matrix and explain what an eigenvector is.', capabilities: ['recall', 'application'] }],
      excerpt: 'An eigenvector v of A satisfies Av = λv with v ≠ 0; λ is its eigenvalue.' },
  ],
  edges: [{ from: 'projections', to: 'qr', type: 'prerequisite', explanation: 'QR entries are projection coefficients.' }],
};

/** Insert a published manifest for `exam`; returns ids by topic key. Emits knowledge.published. */
export function seedPublishedKnowledge(app, exam, course = QR_COURSE, { version = 1, previousManifestId = null } = {}) {
  const { db, clock, blobs } = app;
  const scope = { ...exam.scope };
  const at = clock.iso();
  const stored = extra => ({ id: newId(extra.prefix), scope, createdAt: at, ...extra.fields });
  return db.tx(() => {
    const sourceFile = { id: newId('srcf'), scope, createdAt: at, updatedAt: at, rowVersion: 0, filename: 'course-notes.md', declaredMime: 'text/markdown', detectedMime: 'text/markdown', currentSourceVersionId: null, status: 'ready' };
    const text = course.topics.filter(t => t.excerpt).map(t => t.excerpt).join('\n\n');
    const original = blobs.putText({ scope, text });
    const sourceVersion = { id: newId('srcv'), scope, createdAt: at, sourceFileId: sourceFile.id, version: 1, original, contentHash: original.sha256, replacesSourceVersionId: null, uploadFinalizedAt: at, capabilityProfileVersion: 'cap_v1' };
    sourceFile.currentSourceVersionId = sourceVersion.id;
    db.insert('source_files', sourceFile);
    db.insert('source_versions', sourceVersion);
    const extraction = { id: newId('ext'), scope, createdAt: at, sourceVersionId: sourceVersion.id, version: 1, supersedesId: null, status: 'valid', markdown: original, anchorIds: [], extractorConfigVersion: 'text_v1', regions: [], issues: [], dependencies: [], runs: [] };

    const ids = {};
    const topicVersionIds = [], objectiveVersionIds = [], edgeVersionIds = [], linkIds = [], anchorIds = [];
    let offset = 0;
    for (const t of course.topics) {
      const topic = { id: newId('top'), scope, createdAt: at, stableKey: t.key, retiredAt: null };
      db.insert('topics', topic);
      ids[t.key] = { topicId: topic.id, objectiveVersionIds: [] };
    }
    for (const t of course.topics) {
      const objectives = (t.objectives || []).map(o => ({
        id: newId('objv'), scope, createdAt: at, objectiveId: newId('obj'), version: 1, topicId: ids[t.key].topicId,
        statement: o.statement, capabilities: o.capabilities, successCriteria: o.successCriteria || [o.statement], sourceEvidence: [],
        scopeBasis: 'source_coverage', examWeight: null, meaningHash: hashOf(o.statement), supersedesId: null,
      }));
      if (t.excerpt) {
        const slice = blobs.putText({ scope, text: t.excerpt, mediaType: 'text/plain; charset=utf-8' });
        const anchor = { id: newId('anc'), scope, createdAt: at, sourceVersionId: sourceVersion.id, anchorKey: `p${anchorIds.length + 1}`, location: { page: null, slide: null, sheet: null, cells: null, sectionPath: [t.title], paragraph: anchorIds.length + 1, originalByteStart: null, originalByteEnd: null, extractedCharStart: offset, extractedCharEnd: offset + t.excerpt.length, bbox: null, timeStartMs: null, timeEndMs: null }, evidenceArtifact: slice, excerptHash: slice.sha256, extractionArtifactId: extraction.id };
        offset += t.excerpt.length + 2;
        db.insert('source_anchors', anchor);
        anchorIds.push(anchor.id);
        ids[t.key].anchorId = anchor.id;
        for (const o of objectives) o.sourceEvidence = [{ kind: 'source_anchor', id: anchor.id, detail: null }];
        const link = { id: newId('tel'), scope, createdAt: at, topicId: ids[t.key].topicId, objectiveVersionId: objectives[0]?.id || null, sourceAnchorId: anchor.id, interpretationId: null, relation: 'defines' };
        db.insert('topic_evidence_links', link);
        linkIds.push(link.id);
      }
      for (const o of objectives) { db.insert('objective_versions', o); objectiveVersionIds.push(o.id); ids[t.key].objectiveVersionIds.push(o.id); }
      const tv = { id: newId('topv'), scope, createdAt: at, topicId: ids[t.key].topicId, version, title: t.title, description: t.description, parentTopicId: t.parentKey ? ids[t.parentKey].topicId : null, objectiveVersionIds: objectives.map(o => o.id), status: 'active' };
      db.insert('topic_versions', tv);
      topicVersionIds.push(tv.id);
      ids[t.key].topicVersionId = tv.id;
    }
    extraction.anchorIds = anchorIds;
    db.insert('extraction_artifacts', extraction);

    const claims = course.topics.filter(t => t.excerpt).map(t => ({ claimId: newId('clm'), kind: 'source_statement', text: t.excerpt, evidence: [{ kind: 'source_anchor', id: ids[t.key].anchorId, detail: null }], support: 'direct', derivation: null, uncertainties: [] }));
    const explanation = blobs.putText({ scope, text: course.topics.filter(t => t.excerpt).map(t => `## ${t.title}\n${t.description} ${t.excerpt}`).join('\n\n') });
    const interpretation = {
      id: newId('interp'), scope, createdAt: at, sourceVersionId: sourceVersion.id, extractionArtifactId: extraction.id, version: 1, supersedesId: null,
      topicIds: course.topics.filter(t => t.excerpt).map(t => ids[t.key].topicId), sourceSegmentIds: [], explanation, claims, assumptions: [], examples: [],
      graphContextManifestId: null, status: 'validated', dependencies: [], validationReportIds: [], runs: [], kind: 'source',
      proposedPersonalExplanations: course.proposedPersonal || [],
    };
    db.insert('base_interpretations', interpretation);

    for (const e of course.edges || []) {
      const edge = { id: newId('edgv'), scope, createdAt: at, edgeId: newId('edg'), version: 1, fromTopicId: ids[e.from].topicId, toTopicId: ids[e.to].topicId, type: e.type, evidence: [], support: e.support || 'grounded', explanation: e.explanation, prerequisiteCycleIssueId: null };
      db.insert('graph_edges', edge);
      edgeVersionIds.push(edge.id);
    }

    const manifest = {
      id: newId('km'), scope, createdAt: at, version, parentManifestId: previousManifestId, buildId: newId('build'), status: 'published',
      sourceVersionIds: [sourceVersion.id], extractionArtifactIds: [extraction.id], interpretationIds: [interpretation.id],
      topicVersionIds, objectiveVersionIds, edgeVersionIds, topicEvidenceLinkIds: linkIds, validationReportIds: [], unresolvedIssues: [],
      contentHash: hashOf({ topicVersionIds, objectiveVersionIds, edgeVersionIds }),
      coverage: [{ sourceVersionId: sourceVersion.id, extractionArtifactId: extraction.id, allSegmentIds: [], interpretedSegmentIds: [], validatedSegmentIds: [], excluded: [], status: 'complete' }],
      coverageStatus: 'complete', synthesisPartitionIds: [], eligibleForTutoring: true, publishedAt: at,
    };
    db.insert('knowledge_manifests', manifest);
    const fresh = db.get('exams', exam.id);
    db.update('exams', { ...fresh, status: 'ready', publishedKnowledgeManifestId: manifest.id, updatedAt: at });
    app.events.emit({
      scope, eventType: 'knowledge.published', aggregateType: 'exam', aggregateId: exam.id, aggregateVersion: version,
      payload: { examId: exam.id, oldManifestId: previousManifestId, newManifestId: manifest.id, migrationIds: [], changedDependencyRefs: [], topicIds: Object.values(ids).map(x => x.topicId), objectiveVersionIds, incompatibleTopicIds: [] },
      idempotencyKey: `knowledge.published:${manifest.id}`,
    });
    return { manifest, ids, interpretation, sourceVersion };
  });
}
