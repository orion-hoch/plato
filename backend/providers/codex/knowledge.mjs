import { EXTRACT_READING, PAGE_TRANSCRIPT, INTERPRETATION, GRAPH_CANDIDATE, MERGE_DECISIONS, GRAPH_OUTLINE } from '../../knowledge/schemas.mjs';
import { EXTRACT, TRANSCRIBE, SEGMENT, MERGE, REFINE, PARTITION, MERGE_PARTITIONS, FINALIZE, PROMPT_VERSIONS } from '../prompts/knowledge.mjs';

// Live knowledge providers over the Codex app-server gateway. Luna reads images; Astra interprets and builds the graph.
// Inputs are compacted to what the prompt needs; outputs are schema-checked by the gateway.

const evidence = items => items.map(({ anchor, excerpt }) => ({ anchorId: anchor.id, anchorKey: anchor.anchorKey, page: anchor.location.page, slide: anchor.location.slide, section: anchor.location.sectionPath.join(' > '), text: excerpt }));
const learner = r => ({ emptyProfile: r.learnerContext?.emptyProfile ?? true, facts: (r.selectedProfileFacts || []).filter(f => f.status === 'active').map(f => ({ kind: f.kind, key: f.key, value: f.value, origin: f.origin })) });
const interpretationBrief = i => ({ id: i.id, claims: i.claims.map(c => ({ kind: c.kind, text: c.text, evidenceAnchorIds: c.evidence ? c.evidence.map(e => e.id) : c.evidenceAnchorIds, support: c.support })), concepts: (i.concepts || []).map(c => ({ name: c.name, parentName: c.parentName, summary: c.summary, anchorIds: c.anchorIds })), assumptions: i.assumptions, examples: (i.examples || []).map(e => ({ text: e.text, evidenceAnchorIds: e.evidence ? e.evidence.map(x => x.id) : e.evidenceAnchorIds })), proposedConnections: i.proposedConnections || [], unresolvedQuestions: i.unresolvedQuestions || [] });
// Synthesis content as merge/finalize see it: per topic its wording, parent, objective statements (in the order
// objectiveEdits index) and up to 3 anchors to cite (definitions first); edges as one line. Never every evidence link.
const contentBrief = c => ({
  topics: c.topics.map(t => ({
    key: t.stableKey, title: t.title, description: t.description, parentKey: t.parentStableKey,
    objectives: c.objectives.filter(o => o.topicKey === t.stableKey).map(o => o.statement.slice(0, 200)),
    anchorIds: [...new Set(c.evidenceLinks.filter(l => l.topicKey === t.stableKey).sort((a, b) => (b.relation === 'defines') - (a.relation === 'defines')).map(l => l.anchorId))].slice(0, 3),
  })),
  edges: c.edges.map(e => `${e.fromKey} ${e.type} ${e.toKey}`),
});

export function createKnowledgeCodex({ gateway, timeoutMs = 600_000 }) {
  const extractor = {
    extract: request => gateway.structured({
      role: 'luna', instructions: EXTRACT, promptTemplateVersion: PROMPT_VERSIONS.extract, schema: EXTRACT_READING, timeoutMs, effort: 'medium',
      input: { filename: request.filename, regions: request.regionsToRead.map(r => ({ anchorKey: r.anchorKey, kind: r.kind, location: { page: r.location.page, slide: r.location.slide }, reason: r.reason, imageIndex: request.images.findIndex(i => i.anchorKey === r.anchorKey) })) },
      images: request.images.map(i => i.dataUrl),
    }),
    // v8: one PDF page from its image as markdown (knowledge/pages.mjs): the same reader and effort as extract.
    transcribe: request => gateway.structured({
      role: 'luna', instructions: TRANSCRIBE, promptTemplateVersion: PROMPT_VERSIONS.transcribe, schema: PAGE_TRANSCRIPT, timeoutMs, effort: 'medium',
      input: { filename: request.filename, page: request.page, pageCount: request.pageCount, textLayer: request.textLayer }, images: [request.image],
    }),
  };

  const interpreter = {
    interpret(request) {
      const common = { graph: { topics: request.graphContext.topics.map(t => ({ topicId: t.topicId, title: t.title, description: t.description })), edges: request.graphContext.edges.map(e => ({ from: e.fromTopicId, to: e.toTopicId, type: e.type, explanation: e.explanation, support: e.support })), objectives: request.graphContext.objectives.map(o => ({ topicId: o.topicId, statement: o.statement })) }, learner: learner(request) };
      if (request.mode === 'source_merge') return gateway.structured({ role: 'astra', instructions: request.repairInstructions?.length ? `${MERGE}\n\nIndependent checkers found defects. Apply these repair instructions: remove or correct the affected claims; never add unsupported content.` : MERGE, promptTemplateVersion: PROMPT_VERSIONS.merge, schema: INTERPRETATION, timeoutMs, input: { source: request.sourceName, segmentInterpretations: request.segmentInterpretations.map(interpretationBrief), repairInstructions: request.repairInstructions || [], learner: common.learner } });
      if (request.mode === 'graph_refinement') return gateway.structured({ role: 'astra', instructions: REFINE, promptTemplateVersion: PROMPT_VERSIONS.refine, schema: INTERPRETATION, timeoutMs, input: { prior: interpretationBrief(request.priorInterpretation), excerpts: evidence(request.sourceEvidence), ...common } });
      return gateway.structured({ role: 'astra', instructions: SEGMENT, promptTemplateVersion: PROMPT_VERSIONS.segment, schema: INTERPRETATION, timeoutMs, input: { source: request.sourceName, excerpts: evidence(request.sourceEvidence), previousSegment: request.relatedSegmentSummaries.map(s => s.text), ...common } });
    },
  };

  const graphBuilder = {
    buildOrPatch(request) {
      // existingTopicKeys is parallel to existingTopics (build.mjs), so each existing topic shows its key.
      const existing = { topics: request.existingTopics.map((t, i) => ({ key: request.existingTopicKeys?.[i] ?? null, title: t.title, description: t.description })), objectives: request.existingObjectives.map(o => ({ statement: o.statement })) };
      if (request.mode === 'partition') return gateway.structured({ role: 'astra', instructions: PARTITION, promptTemplateVersion: PROMPT_VERSIONS.partition, schema: GRAPH_CANDIDATE, timeoutMs, input: { interpretations: request.interpretations.map(interpretationBrief), examInstructions: request.examInstructions, existing } });
      if (request.mode === 'merge_partitions') return gateway.structured({ role: 'astra', instructions: MERGE_PARTITIONS, promptTemplateVersion: PROMPT_VERSIONS.mergePartitions, schema: MERGE_DECISIONS, timeoutMs, input: { partitions: request.partitionContents.map(contentBrief), existing } });
      return gateway.structured({ role: 'astra', instructions: FINALIZE, promptTemplateVersion: PROMPT_VERSIONS.finalize, schema: GRAPH_OUTLINE, timeoutMs, input: { merged: contentBrief(request.partitionContents.at(-1)), interpretations: request.interpretations.map(i => ({ id: i.id, concepts: (i.concepts || []).map(c => c.name), connections: (i.claims || []).filter(c => c.kind === 'connection').map(c => c.text) })), examInstructions: request.examInstructions, existing, learner: learner(request) } });
    },
  };

  return { extractor, interpreter, graphBuilder };
}
