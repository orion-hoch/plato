import { ok, mockRun } from '../contracts.mjs';
import { AppError } from '../../core/errors.mjs';

// Deterministic knowledge providers (spec §5.1). Steer them with `controls`:
//   controls.extractor   = { unavailable, failFormula, readings: { [anchorKey|filename]: text } }
//   controls.interpreter = { fail: true | n (fail the first n calls), timeout, malformed, unsupportedClaim, calls }
//   controls.graph       = { hierarchyCycle, prerequisiteCycle, crosslinkCycle, unsupportedEdge, split: { fromKey, toKeys }, fail,
//                            objectiveStatements: { [key]: statement }, sameIdeas: [[canonicalKey, ...otherKeys]] }

export const slug = text => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'topic';
const firstSentence = text => (String(text).replace(/^#+\s*/gm, '').replace(/\s+/g, ' ').trim().match(/^.{1,240}?[.!?](\s|$)/)?.[0] || String(text).replace(/\s+/g, ' ').trim().slice(0, 240)).trim();

function maybeFail(control) {
  if (!control) return;
  if (control.timeout) throw new AppError('provider_timeout', 'mock timeout');
  if (control.fail === true) throw new AppError('provider_unavailable', 'mock unavailable');
  if (typeof control.fail === 'number' && control.fail > 0) { control.fail--; throw new AppError('provider_unavailable', 'mock transient failure'); }
}

export function createKnowledgeMocks({ clock, controls }) {
  const extractor = {
    async extract(request) {
      const c = controls.extractor || {};
      if (c.unavailable) throw new AppError('provider_unavailable', 'No model-assisted extractor available.');
      const regions = request.regionsToRead.map(r => {
        const reading = c.readings?.[r.anchorKey] ?? c.readings?.[request.filename];
        if (reading && !c.failFormula) return { anchorKey: r.anchorKey, kind: /[=∑∫√]/.test(reading) ? 'formula' : 'text', disposition: 'faithful', extractedText: reading, confidence: 0.9, uncertaintyReason: null };
        return { anchorKey: r.anchorKey, kind: c.failFormula ? 'formula' : r.kind || 'diagram', disposition: 'uncertain', extractedText: null, confidence: null, uncertaintyReason: c.failFormula ? 'Formula could not be read with confidence.' : 'No legible content found.' };
      });
      const unresolved = regions.filter(r => r.disposition !== 'faithful').map(r => r.anchorKey);
      return ok({ regions, escalation: unresolved.length ? [{ anchorKeys: unresolved, requiredCapability: c.failFormula ? 'formula_ocr' : 'vision_ocr', reason: 'Region remains unreadable by the available extractor.' }] : [] }, { providerRuns: [mockRun('extractor', 'extract_v1', clock)] });
    },
  };

  const interpreter = {
    async interpret(request) {
      const c = controls.interpreter || {};
      c.calls = (c.calls || 0) + 1;
      maybeFail(c);
      const run = mockRun('interpreter', 'interpret_v1', clock);
      if (c.malformed) return ok({ explanation: 'x' }, { providerRuns: [run] });
      if (request.mode === 'source_merge') {
        const merged = merge(request.segmentInterpretations);
        // A repair request removes claims the checkers flagged (marked UNSUPPORTED in mock content).
        if (request.repairInstructions?.length && !c.ignoreRepair) {
          const keep = merged.claims.map((cl, i) => [cl, i]).filter(([cl]) => !/UNSUPPORTED/.test(cl.text));
          const remap = new Map(keep.map(([, i], n) => [i, n]));
          merged.claims = keep.map(([cl]) => cl);
          merged.concepts = merged.concepts.map(cn => ({ ...cn, claimIndexes: cn.claimIndexes.filter(i => remap.has(i)).map(i => remap.get(i)) }));
        }
        return ok(merged, { providerRuns: [run] });
      }
      if (request.mode === 'graph_refinement') return ok(refine(request), { providerRuns: [run] });
      return ok(segment(request, c), { providerRuns: [run] });
    },
  };

  function segment(request, c) {
    const byConcept = new Map();
    for (const { anchor, excerpt } of request.sourceEvidence) {
      const path = anchor.location.sectionPath.length ? anchor.location.sectionPath : [request.sourceName || 'Overview'];
      const name = path.at(-1).replace(/^Slide \d+$/, m => m);
      if (!byConcept.has(name)) byConcept.set(name, { name, parentName: path.length > 1 ? path.at(-2) : null, anchors: [] });
      byConcept.get(name).anchors.push({ anchor, excerpt });
    }
    const claims = [], examples = [], assumptions = [], concepts = [], connections = [], unresolved = [], personal = [];
    const names = [...byConcept.keys()];
    const prefersExamples = (request.selectedProfileFacts || []).some(f => f.status === 'active' && /example/i.test(`${f.key} ${JSON.stringify(f.value)}`));
    for (const concept of byConcept.values()) {
      const indexes = [];
      const readable = concept.anchors.filter(a => a.excerpt && !a.excerpt.startsWith('[UNCERTAIN'));
      for (const { anchor, excerpt } of concept.anchors) {
        if (!excerpt || excerpt.startsWith('[UNCERTAIN')) { unresolved.push(`Region ${anchor.anchorKey} in "${concept.name}" could not be read.`); continue; }
        const sentence = firstSentence(excerpt);
        indexes.push(claims.length);
        claims.push({ kind: 'source_statement', text: sentence, evidenceAnchorIds: [anchor.id], support: 'direct', derivation: null, uncertainties: [] });
        if (/\bexample\b/i.test(excerpt)) examples.push({ kind: 'example', text: firstSentence(excerpt.slice(excerpt.search(/example/i))), evidenceAnchorIds: [anchor.id], support: 'direct', derivation: null, uncertainties: [] });
        for (const m of excerpt.matchAll(/\b(?:assume|assuming|provided that)\b[^.]*\./gi)) assumptions.push(m[0].trim());
        for (const other of names) if (other !== concept.name && other.length > 3 && excerpt.toLowerCase().includes(other.toLowerCase())) connections.push({ fromConcept: concept.name, toConcept: other, evidenceAnchorIds: [anchor.id], support: 'grounded', reason: `The text for ${concept.name} refers to ${other}.` });
      }
      if (readable.length) {
        indexes.push(claims.length);
        claims.push({ kind: 'derived_explanation', text: `${concept.name}: ${firstSentence(readable[0].excerpt)} In plain terms, this is what the rest of the section builds on.`, evidenceAnchorIds: readable.map(a => a.anchor.id).slice(0, 3), support: 'derived', derivation: 'Restates the section opening as the central idea.', uncertainties: [] });
        if (prefersExamples) personal.push({ conceptName: concept.name, text: `Start ${concept.name} from a worked example, then state the rule: ${firstSentence(readable[0].excerpt)}`, reasons: ['Learner profile prefers examples first.'], exampleAnchorIds: [readable[0].anchor.id] });
      }
      concepts.push({ name: concept.name, parentName: concept.parentName, summary: readable.length ? firstSentence(readable[0].excerpt) : 'Content could not be read.', claimIndexes: indexes, anchorIds: concept.anchors.map(a => a.anchor.id) });
    }
    if (c.unsupportedText && request.sourceEvidence[0]) claims.push({ kind: 'derived_explanation', text: 'UNSUPPORTED: projections are always onto the x-axis.', evidenceAnchorIds: [request.sourceEvidence[0].anchor.id], support: 'derived', derivation: 'Overgeneralized.', uncertainties: [] });
    if (c.unsupportedClaim) claims.push({ kind: 'source_statement', text: 'UNSUPPORTED: the course states every matrix is invertible.', evidenceAnchorIds: ['anc_fabricated'], support: 'direct', derivation: null, uncertainties: [] });
    const explanation = concepts.map(c2 => `## ${c2.name}\n\n${c2.summary}`).join('\n\n') || 'No readable content.';
    return { explanation, claims, assumptions, examples, concepts, proposedPersonalExplanations: personal, proposedConnections: connections, unresolvedQuestions: unresolved };
  }

  function merge(parts) {
    const claims = [], seen = new Map(), concepts = new Map();
    const out = { explanation: '', claims, assumptions: [], examples: [], concepts: [], proposedPersonalExplanations: [], proposedConnections: [], unresolvedQuestions: [] };
    for (const p of parts) {
      const remap = new Map();
      (p.claims || []).forEach((cl, i) => {
        const key = `${cl.kind}:${cl.text}`;
        if (!seen.has(key)) { seen.set(key, claims.length); claims.push({ kind: cl.kind, text: cl.text, evidenceAnchorIds: cl.evidence ? cl.evidence.map(e => e.id) : cl.evidenceAnchorIds, support: cl.support, derivation: cl.derivation, uncertainties: (cl.uncertainties || []).map(u => ({ reason: u.reason, alternatives: u.alternatives })) }); }
        remap.set(i, seen.get(key));
      });
      for (const concept of p.concepts || []) {
        const prior = concepts.get(concept.name);
        const own = concept.claimIndexes ?? (concept.claimIds || []).map(id => (p.claims || []).findIndex(cl => cl.claimId === id));
        const indexes = own.map(i => remap.get(i)).filter(i => i !== undefined);
        if (prior) { prior.claimIndexes = [...new Set([...prior.claimIndexes, ...indexes])]; prior.anchorIds = [...new Set([...prior.anchorIds, ...concept.anchorIds])]; }
        else concepts.set(concept.name, { name: concept.name, parentName: concept.parentName ?? null, summary: concept.summary, anchorIds: concept.anchorIds, claimIndexes: indexes });
      }
      out.assumptions.push(...(p.assumptions || []).filter(a => !out.assumptions.includes(a)));
      out.examples.push(...(p.examples || []).map(e => ({ kind: e.kind, text: e.text, evidenceAnchorIds: e.evidence ? e.evidence.map(x => x.id) : e.evidenceAnchorIds, support: e.support, derivation: e.derivation, uncertainties: [] })));
      out.proposedPersonalExplanations.push(...(p.proposedPersonalExplanations || []).map(x => ({ conceptName: x.conceptName, text: x.text, reasons: x.reasons, exampleAnchorIds: x.exampleAnchorIds })));
      out.proposedConnections.push(...(p.proposedConnections || []));
      out.unresolvedQuestions.push(...(p.unresolvedQuestions || []));
    }
    out.concepts = [...concepts.values()];
    out.explanation = out.concepts.map(c => `## ${c.name}\n\n${c.summary}`).join('\n\n') || 'No readable content.';
    return out;
  }

  function refine(request) {
    const prior = request.priorInterpretation;
    const base = merge([prior]);
    const titles = new Map(request.graphContext.topics.map(t => [t.topicId, t.title]));
    const conceptNames = new Set(base.concepts.map(c => c.name.toLowerCase()));
    for (const edge of request.graphContext.edges) {
      const from = titles.get(edge.fromTopicId), to = titles.get(edge.toTopicId);
      if (!from || !to || !conceptNames.has(from.toLowerCase())) continue;
      const text = `${from} connects to ${to}: ${edge.explanation}`;
      if (base.claims.some(c => c.kind === 'connection' && c.text === text)) continue;
      const anchors = base.concepts.find(c => c.name.toLowerCase() === from.toLowerCase())?.anchorIds.slice(0, 2) || [];
      const concept = base.concepts.find(c => c.name.toLowerCase() === from.toLowerCase());
      concept.claimIndexes.push(base.claims.length);
      base.claims.push({ kind: 'connection', text, evidenceAnchorIds: anchors, support: edge.support === 'grounded' && anchors.length ? 'derived' : 'provisional', derivation: `Graph edge ${edge.type} between ${from} and ${to}.`, uncertainties: [] });
    }
    return base;
  }

  const graphBuilder = {
    async buildOrPatch(request) {
      const c = controls.graph || {};
      maybeFail(c);
      const run = mockRun('graph', 'graph_v1', clock);
      // The same idea under different keys: whichever step first sees two keys of a group merges them.
      const sameIdeas = keys => (c.sameIdeas || []).map(group => group.filter(k => keys.has(k))).filter(group => group.length > 1);
      if (request.mode === 'partition') {
        const out = { topics: [], objectives: [], edges: [], evidenceLinks: [], migrations: [], affectedInterpretationIds: [], reasons: [], noChangeReason: null };
        for (const interp of request.interpretations) for (const concept of interp.concepts || []) {
          const key = slug(concept.name);
          if (!out.topics.some(t => t.stableKey === key)) {
            out.topics.push({ stableKey: key, title: concept.name, description: concept.summary, parentStableKey: concept.parentName ? slug(concept.parentName) : null });
            out.objectives.push({ topicKey: key, statement: c.objectiveStatements?.[key] || `Explain ${concept.name} in your own words and apply it to a standard problem.`, capabilities: ['explanation', 'application'], successCriteria: [`States what ${concept.name} means`, `Uses ${concept.name} correctly on a problem`], evidenceAnchorIds: concept.anchorIds.slice(0, 1), scopeBasis: 'source_coverage', examWeight: null, examWeightEvidence: [] });
          }
          concept.anchorIds.forEach((anchorId, i) => out.evidenceLinks.push({ topicKey: key, anchorId, relation: i === 0 ? 'defines' : 'explains', interpretationId: interp.id }));
        }
        for (const interp of request.interpretations) for (const conn of interp.proposedConnections || []) out.edges.push({ fromKey: slug(conn.fromConcept), toKey: slug(conn.toConcept), type: /requires|builds on|uses/i.test(conn.reason) ? 'prerequisite' : 'related', explanation: conn.reason, evidenceAnchorIds: conn.evidence ? conn.evidence.map(e => e.id) : conn.evidenceAnchorIds || [], support: conn.support === 'grounded' ? 'grounded' : 'inferred_provisional' });
        return ok(out, { providerRuns: [run] });
      }
      if (request.mode === 'merge_partitions') {
        const all = request.partitionContents.flatMap(p => p.topics);
        const topics = sameIdeas(new Set(all.map(t => t.stableKey))).map(([key, ...mergedKeys]) => ({ key, mergedKeys, title: null, description: null, parentKey: all.find(t => t.stableKey === key).parentStableKey }));
        return ok({ topics, edges: [], reasons: topics.map(t => `${t.mergedKeys.join(', ')} is ${t.key}.`) }, { providerRuns: [run] });
      }
      // finalize_graph: an outline over the merged content (a course root over its top-level topics).
      const merged = request.partitionContents.at(-1);
      const keys = new Set(merged.topics.map(t => t.stableKey));
      const groups = sameIdeas(keys), absorbed = new Set(groups.flatMap(g => g.slice(1)));
      const topics = [{ key: 'course', mergedKeys: [], title: 'Course', description: 'All exam material.', parentKey: null },
        ...merged.topics.filter(t => !absorbed.has(t.stableKey)).map(t => ({ key: t.stableKey, mergedKeys: groups.find(g => g[0] === t.stableKey)?.slice(1) || [], title: null, description: null, parentKey: t.parentStableKey && keys.has(t.parentStableKey) && t.parentStableKey !== t.stableKey ? t.parentStableKey : 'course' }))];
      const instructions = String(request.examInstructions || '');
      const objectiveEdits = merged.topics.filter(t => instructions.toLowerCase().includes(t.title.toLowerCase())).map(t => {
        const weight = new RegExp(`${t.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\((\\d{1,3})%\\)`, 'i').exec(instructions);
        return { topicKey: t.stableKey, objectiveIndex: null, scopeBasis: 'explicit_exam', examWeight: weight ? Math.min(1, Number(weight[1]) / 100) : null, examWeightEvidence: weight ? [{ kind: 'explicit_exam_instruction', id: 'exam_instructions' }] : [] };
      });
      const edges = [];
      const [a, b] = topics.slice(1).map(t => t.key);
      if (c.hierarchyCycle && a && b) { topics.find(t => t.key === a).parentKey = b; topics.find(t => t.key === b).parentKey = a; }
      if (c.prerequisiteCycle && a && b) edges.push({ fromKey: a, toKey: b, type: 'prerequisite', explanation: `${a} before ${b}`, evidenceAnchorIds: [], support: 'inferred_provisional' }, { fromKey: b, toKey: a, type: 'prerequisite', explanation: `${b} before ${a}`, evidenceAnchorIds: [], support: 'inferred_provisional' });
      if (c.crosslinkCycle && a && b) edges.push({ fromKey: a, toKey: b, type: 'related', explanation: 'related', evidenceAnchorIds: [], support: 'inferred_provisional' }, { fromKey: b, toKey: a, type: 'related', explanation: 'related back', evidenceAnchorIds: [], support: 'inferred_provisional' });
      if (c.unsupportedEdge && a && b) edges.push({ fromKey: a, toKey: b, type: 'supports', explanation: 'UNSUPPORTED: invented relationship', evidenceAnchorIds: [], support: 'grounded' });
      const existingKeys = new Set((request.existingTopicKeys || []));
      const migrations = [...existingKeys].filter(k => k !== 'course' && !keys.has(k)).map(k => ({ kind: 'retire', fromKeys: [k], toKeys: [], reason: 'No longer supported by any source.' }));
      if (c.split) migrations.push({ kind: 'split', fromKeys: [c.split.fromKey], toKeys: c.split.toKeys, reason: 'Material now separates these ideas.' });
      const touched = new Set([...merged.edges, ...edges].flatMap(e => [e.fromKey, e.toKey]));
      const affected = request.interpretations.filter(i => (i.concepts || []).some(cn => touched.has(slug(cn.name)))).map(i => i.id);
      return ok({ topics, edges, objectiveEdits, migrations, affectedInterpretationIds: affected, reasons: ['Topics follow section structure; edges follow cross-references.'], noChangeReason: null }, { providerRuns: [run] });
    },
  };

  return { extractor, interpreter, graphBuilder };
}
