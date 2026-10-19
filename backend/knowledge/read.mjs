import { AppError } from '../core/errors.mjs';
import { words } from '../core/match.mjs';
import { estimateTokens } from '../core/util.mjs';

// Read side of the knowledge layer: published/pinned manifest views and budgeted retrieval
// (spec §5.3 "Context construction resolves anchors and graph neighbors under the pinned manifest").


export function createKnowledgeReader(app) {
  const { db, blobs } = app;
  const cache = new Map(); // manifestId → view (manifests are immutable once published)

  function view(scope, manifestId) {
    if (!manifestId) return null;
    const key = `${scope.examId}:${manifestId}`;
    if (cache.has(key)) return cache.get(key);
    const manifest = db.get('knowledge_manifests', manifestId, scope);
    if (!manifest) throw new AppError('ownership_denied', 'Knowledge manifest not found.');
    const byIds = (table, ids) => db.find(table, { id: ids }, { scope });
    const interpretations = byIds('base_interpretations', manifest.interpretationIds);
    const result = {
      manifest,
      topics: byIds('topic_versions', manifest.topicVersionIds),
      objectives: byIds('objective_versions', manifest.objectiveVersionIds),
      edges: byIds('graph_edges', manifest.edgeVersionIds),
      evidenceLinks: byIds('topic_evidence_links', manifest.topicEvidenceLinkIds),
      interpretations,
      proposedPersonal: interpretations.flatMap(i => (i.proposedPersonalExplanations || []).map(p => ({ ...p, baseInterpretationIds: [i.id] }))),
    };
    if (manifest.status === 'published') cache.set(key, result);
    return result;
  }

  function published(scope) {
    const exam = db.get('exams', scope.examId, scope);
    return exam?.publishedKnowledgeManifestId ? view(scope, exam.publishedKnowledgeManifestId) : null;
  }

  // Only faithfully extracted anchors are text evidence; uncertain ones point at rasters/originals.
  function excerptOf(anchor, scope) {
    if (anchor.disposition && anchor.disposition !== 'faithful') return null;
    try { return blobs.readText(anchor.evidenceArtifact, scope); } catch { return null; }
  }

  function anchors(scope, anchorIds) {
    return db.find('source_anchors', { id: anchorIds }, { scope }).map(anchor => ({ anchor, excerpt: excerptOf(anchor, scope) }));
  }

  function interpretationText(interpretation, scope) {
    try { return blobs.readText(interpretation.explanation, scope); } catch { return interpretation.claims?.map(c => c.text).join('\n') || ''; }
  }

  /** Budgeted retrieval under one manifest. Priority: explicit anchors, topic evidence, interpretations, query hits, neighbors. */
  function retrieve(scope, manifestId, need) {
    const v = view(scope, manifestId);
    const budget = Math.max(0, need.maxTokens ?? 4000);
    let used = 0;
    const take = text => { const t = estimateTokens(text); if (used + t > budget) return false; used += t; return true; };
    const topicSet = new Set(need.topicIds || []);
    const objectiveTopics = v.objectives.filter(o => (need.objectiveVersionIds || []).includes(o.id)).map(o => o.topicId);
    for (const t of objectiveTopics) topicSet.add(t);
    const allowedSources = new Set(v.manifest.sourceVersionIds);
    const excerpts = [], seen = new Set();
    const addAnchor = (anchorId, reason) => {
      if (seen.has(anchorId)) return;
      const [entry] = anchors(scope, [anchorId]);
      if (!entry || !allowedSources.has(entry.anchor.sourceVersionId) || entry.excerpt === null) return;
      if (!take(entry.excerpt)) return;
      seen.add(anchorId);
      excerpts.push({ anchorId, text: entry.excerpt, sourceVersionId: entry.anchor.sourceVersionId, relevanceReason: reason });
    };
    for (const id of need.anchorIds || []) addAnchor(id, 'requested anchor');
    const relationRank = { defines: 0, explains: 1, assesses: 2, exemplifies: 3 };
    const links = v.evidenceLinks.filter(l => topicSet.has(l.topicId)).sort((a, b) => (relationRank[a.relation] ?? 9) - (relationRank[b.relation] ?? 9));
    for (const link of links) addAnchor(link.sourceAnchorId, `${link.relation} topic`);

    const interpretations = [];
    for (const i of v.interpretations.filter(i => i.topicIds.some(t => topicSet.has(t)))) {
      const text = interpretationText(i, scope);
      if (take(text)) interpretations.push({ interpretationId: i.id, text, topicIds: i.topicIds });
    }

    if (need.query) {
      const q = words(need.query);
      const candidates = db.find('source_anchors', { sourceVersionId: [...allowedSources] }, { scope })
        .map(anchor => { const text = excerptOf(anchor, scope) || ''; const w = words(text); let hits = 0; for (const x of q) if (w.has(x)) hits++; return { anchor, hits }; })
        .filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 8);
      for (const c of candidates) addAnchor(c.anchor.id, 'lexical match');
    }

    const relationTypes = new Set(need.relationTypes?.length ? need.relationTypes : ['prerequisite', 'related', 'application_of', 'contrasts_with', 'supports']);
    const nearby = [];
    for (const edge of v.edges) {
      if (!relationTypes.has(edge.type)) continue;
      const other = topicSet.has(edge.fromTopicId) ? edge.toTopicId : topicSet.has(edge.toTopicId) ? edge.fromTopicId : null;
      if (!other || topicSet.has(other)) continue;
      const explanation = edge.explanation;
      if (!take(explanation)) break;
      nearby.push({ topicId: other, edgeIds: [edge.edgeId], explanation, provisional: edge.support !== 'grounded' });
    }
    return { excerpts, interpretations, nearby, usedTokens: used };
  }

  /** A source file's name as a lecture title: no extension, words apart (as show_from_notes names it). */
  function sourceTitle(scope, sourceVersionId) {
    const version = db.get('source_versions', sourceVersionId, scope), file = version && db.get('source_files', version.sourceFileId, scope);
    const name = String(file?.filename || 'their notes').replace(/\.[a-z\d]{1,5}$/i, '');
    return (/\s/.test(name) ? name : name.replace(/[-_]+/g, ' ')).trim();
  }

  /**
   * The course's own text around anchors (v7 lessons): an anchor is one paragraph, so each one brings its section (same
   * extraction, same heading path) in reading order, as blocks, nearest blocks first when the section is over budget.
   * Sections come in the order of `anchorIds`, within maxTokens: [{ sourceVersionId, lecture, section, blocks: [{ anchorId, text }] }].
   */
  function passages(scope, manifestId, anchorIds, { maxTokens = 6000 } = {}) {
    const v = view(scope, manifestId), allowed = new Set(v.manifest.sourceVersionIds), byId = new Map(anchors(scope, anchorIds).map(e => [e.anchor.id, e.anchor]));
    const out = [], done = new Set(), extraction = new Map();
    let left = maxTokens;
    for (const id of anchorIds) {
      const a = byId.get(id), key = a && `${a.extractionArtifactId}|${a.location.sectionPath.join('>')}`;
      if (!a || !allowed.has(a.sourceVersionId) || done.has(key) || left <= 0) continue;
      done.add(key);
      if (!extraction.has(a.extractionArtifactId)) extraction.set(a.extractionArtifactId, db.find('source_anchors', { extractionArtifactId: a.extractionArtifactId }, { scope }));
      const section = extraction.get(a.extractionArtifactId).filter(x => x.location.sectionPath.join('>') === a.location.sectionPath.join('>'))
        .sort((x, y) => (x.location.paragraph ?? 0) - (y.location.paragraph ?? 0)).map(x => ({ anchorId: x.id, text: excerptOf(x, scope) })).filter(b => b.text?.trim());
      // Outward from the anchor while the budget lasts, then back in reading order.
      const at = Math.max(0, section.findIndex(b => b.anchorId === id)), picked = new Set();
      for (let d = 0; d < section.length * 2 && left > 0; d++) {
        const i = d % 2 ? at - (d + 1) / 2 : at + d / 2, b = section[i];
        if (!b || picked.has(i)) continue;
        const cost = estimateTokens(b.text);
        if (cost > left) { if (i === at) left = 0; continue; }
        picked.add(i); left -= cost;
      }
      const blocks = section.filter((_, i) => picked.has(i));
      if (blocks.length) out.push({ sourceVersionId: a.sourceVersionId, lecture: sourceTitle(scope, a.sourceVersionId), section: a.location.sectionPath.join(' > '), blocks, at: extraction.get(a.extractionArtifactId).find(x => x.id === blocks[0].anchorId)?.location.paragraph ?? 0 });
    }
    // Budgeted by relevance, read in course order: by lecture, then by place in it.
    return out.sort((x, y) => x.lecture.localeCompare(y.lecture, undefined, { numeric: true }) || x.at - y.at).map(({ at, ...p }) => p);
  }

  return { view, published, anchors, retrieve, interpretationText, passages, sourceTitle };
}
