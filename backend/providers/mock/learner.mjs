import { hashOf } from '../../core/util.mjs';
import { AppError } from '../../core/errors.mjs';
import { ok, mockRun } from '../contracts.mjs';

// Deterministic learner-side providers. Steer with controls:
//   controls.localAssessor   = { outcome?, fail?: 'unavailable'|'timeout'|'malformed', requests?: [] }
//   controls.learnerAssessor = { fail?, delta?, beforeReturn?(req), diagnoses?, profileChanges?, eligible?, requests?: [] }
//   controls.personalReviser = { mode?: 'revise'|'noop'|'needs_review'|'unsupported'|'fail'|'timeout'|'malformed', during?(req), requests?: [] }

const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9ᵀᵢⱼ\s]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'what', 'its', 'are', 'for', 'along', 'their']);
const tokens = t => norm(t).split(' ').filter(w => w.length > 2 && !STOP.has(w));

function matches(answer, expected, alternatives = []) {
  if (alternatives.some(a => a && norm(answer).includes(norm(a)))) return true;
  const want = tokens(expected);
  if (!want.length) return false;
  const have = new Set(tokens(answer));
  return want.filter(w => have.has(w)).length / want.length >= 0.6;
}

function failWith(mode) {
  if (mode === 'unavailable' || mode === 'fail') throw new AppError('provider_unavailable', 'mock unavailable');
  if (mode === 'timeout') throw new AppError('provider_timeout', 'mock timeout');
}
const malformed = () => ({ outcome: 'ok', value: { nonsense: true }, reason: null, uncertainties: [], issues: [], providerRuns: [], error: null });
const ordinal = i => i < 40 ? 'emerging' : i < 70 ? 'developing' : 'secure';
const NOTATION = /(little t|transpose|q with|notation|what .* means)/;

export function createLearnerMocks({ clock, controls }) {
  const runs = name => [mockRun(name, `${name}_v1`, clock)];
  return {
    localAssessor: {
      async assessAnswer(req) {
        const c = controls.localAssessor || {};
        c.requests?.push(req);
        failWith(c.fail);
        if (c.fail === 'malformed') return malformed();
        const answer = req.interaction.finalizedAnswer || '';
        const findings = [];
        for (const target of req.question.objectiveTargets.filter(t => t.role === 'assessed')) {
          for (const criterionId of target.criterionIds) {
            const criterion = req.rubric.criteria.find(x => x.criterionId === criterionId);
            if (!criterion) continue;
            const outcome = c.outcome || (matches(answer, req.rubric.expectedAnswer, req.rubric.acceptableAlternatives) ? 'supported' : /don.?t know|no idea|not sure|what .* means/.test(norm(answer)) ? 'insufficient' : 'contradicted');
            findings.push({ objectiveVersionId: target.objectiveVersionId, topicId: target.topicId, criterionId, capability: criterion.capability, outcome, observed: answer.slice(0, 200), answerSpan: null, assistanceLevel: 'independent', evidence: [{ kind: 'interaction', id: req.interaction.id, detail: null }] });
          }
        }
        const disposition = findings.length && findings.every(f => f.outcome === 'insufficient') ? 'insufficient_evidence' : 'assessed';
        return ok({ assessment: { disposition, findings, uncertainty: [] } }, { providerRuns: runs('local_assessor') });
      },
    },

    learnerAssessor: {
      async assess(req) {
        const c = controls.learnerAssessor || {};
        c.requests?.push(req);
        failWith(c.fail);
        if (c.fail === 'malformed') return malformed();
        c.beforeReturn?.(req);
        const findings = req.localAssessments.flatMap(l => l.findings);
        const prior = req.priorProjection.estimate;
        let delta = 0;
        for (const f of findings) delta += f.outcome === 'contradicted' ? -12 : f.outcome !== 'supported' ? 0 : { independent: 16, uncertain: 4, assisted: 6, revealed: 0 }[f.assistanceLevel];
        if (c.delta !== undefined) delta = c.delta;
        const index = Math.max(0, Math.min(100, (prior.displayIndex ?? 35) + delta));
        const applied = findings.some(f => f.outcome !== 'insufficient');
        const evidenceCount = req.relevantPriorEvidence.length + req.relevantInteractions.length;
        const estimate = applied ? { status: 'estimated', displayIndex: index, ordinal: ordinal(index), distribution: null, uncertainty: evidenceCount < 3 ? 'high' : 'medium', basis: `${findings.length} finding(s): ${findings.map(f => `${f.outcome}/${f.assistanceLevel}`).join(', ')}` } : prior;
        const caps = [...new Set(findings.map(f => f.capability))].map(capability => ({ capability, estimate, evidenceIds: req.relevantInteractions.map(i => i.id) }));
        const said = norm(req.relevantInteractions.map(i => i.finalizedAnswer || '').join(' '));
        const diagnoses = c.diagnoses || (NOTATION.test(said) && /projection/.test(said) ? [{
          diagnosisId: `dx_${hashOf('notation:' + req.topicId).slice(-12)}`, statement: 'Unclear on the transpose/dot-product notation qᵢᵀaⱼ.', status: 'provisional',
          evidence: req.relevantInteractions.map(i => ({ kind: 'interaction', id: i.id, detail: null })), alternativeExplanations: ['Projection understanding has not been demonstrated yet; it is only self-reported.'], confidence: 0.5, supersedesDiagnosisId: null,
        }] : []);
        const profileChanges = c.profileChanges || { upsert: [], retractFactIds: c.retractFactIds || [], reason: '' };
        const eligible = c.eligible ?? (applied || diagnoses.length > 0);
        return ok({
          assessment: { disposition: applied ? 'applied' : 'insufficient_evidence', estimate, capabilities: applied ? caps : [], diagnoses, uncertainty: [] },
          profileChanges, topicDiagnosisChanges: [],
          semanticChange: { eligible, reason: eligible ? 'New diagnostic evidence about this topic.' : 'Nothing new.', kinds: ['meaningful_answer'], affectedTopicIds: [] },
          nextDiagnosticSuggestion: diagnoses.length ? 'Ask what qᵢᵀaⱼ computes for a small numeric example.' : null,
        }, { providerRuns: runs('learner_assessor') });
      },
    },

    personalReviser: {
      async reconsider(req) {
        const c = controls.personalReviser || {};
        c.requests?.push(req);
        failWith(c.fail || (['fail', 'timeout'].includes(c.mode) ? (c.mode === 'fail' ? 'unavailable' : 'timeout') : undefined));
        if (c.mode === 'malformed') return malformed();
        await c.during?.(req);
        const evidence = req.changes.flatMap(ch => ch.evidence);
        const said = norm(req.triggeringEvidence.map(e => e.finalizedAnswer || e.text || '').join(' '));
        const inspected = req.nearbyTopics.map(t => ({ topicId: t.topicId, needsChange: false, note: 'Inspected; no change needed.' }));
        const notation = NOTATION.test(said) && /projection/.test(said);
        const mode = c.mode || (notation ? 'revise' : 'noop');
        const base = { explanations: [], mapEdges: [], removedExplanationIds: [], removedPersonalEdgeIds: [], emphasis: [] };
        if (mode === 'noop') return ok({ decision: { disposition: 'noop', reason: `The present personal material already fits this evidence (${req.changes.map(x => x.kind).join(', ')}).`, evidence, inspected }, ...base }, { providerRuns: runs('personal_reviser') });
        if (mode === 'needs_review') return ok({ decision: { disposition: 'needs_review', reason: 'Conflicting evidence; a human should look.', evidence, inspected }, ...base }, { providerRuns: runs('personal_reviser') });

        const qr = req.nearbyTopics.find(t => /qr/i.test(t.title)) || req.nearbyTopics[0];
        const proj = req.nearbyTopics.find(t => /projection/i.test(t.title));
        const anchor = req.originalEvidence.find(e => /qᵢᵀaⱼ|QR/.test(e.excerpt)) || req.originalEvidence[0];
        const prior = req.priorExplanations.find(e => e.topicIds.includes(qr.topicId));
        const text = notation
          ? `Start with the notation. qᵢᵀaⱼ is the dot product of qᵢ and aⱼ: the transpose turns qᵢ into a row, so the product is one number. That number is the projection coefficient you already compute, the amount of aⱼ along qᵢ, and it becomes the entry rᵢⱼ of R.${mode === 'unsupported' ? ' UNSUPPORTED: QR only works for square matrices.' : ''}`
          : `Adjusted to the learner's stated preferences for ${qr.title}.${mode === 'unsupported' ? ' UNSUPPORTED claim.' : ''}`;
        const out = {
          decision: { disposition: 'revise', reason: notation ? 'Student says projection is understood but the qᵀa notation is unclear: explain notation first and connect it to projection; drop the projection-from-scratch remediation.' : 'Revised to match learner preference.', evidence, inspected: inspected.map(i => i.topicId === qr.topicId ? { ...i, needsChange: true, note: 'Explanation assumed the wrong gap.' } : i) },
          explanations: [{
            topicIds: [qr.topicId], text, reasons: [notation ? 'notation confusion, projection self-reported as understood' : 'preference change'],
            selectedExamples: anchor ? [{ claimId: `clm_${hashOf(anchor.anchor.id).slice(-8)}`, kind: 'example', text: anchor.excerpt, evidence: [{ kind: 'source_anchor', id: anchor.anchor.id, detail: null }], support: 'direct', derivation: null, uncertainties: [] }] : [],
            baseInterpretationIds: req.affectedBaseInterpretations.filter(i => i.topicIds.includes(qr.topicId)).map(i => i.id), supersedesId: prior?.id || null,
          }],
          mapEdges: notation && proj ? [{ fromTopicId: qr.topicId, toTopicId: proj.topicId, type: 'helpful_connection', explanation: 'qᵢᵀaⱼ in QR is the projection coefficient the student already computes.', evidence, provisional: false, supersedesId: null }] : [],
          removedExplanationIds: req.priorExplanations.filter(e => e.id !== prior?.id && /from scratch|remedial/i.test(e.text || '')).map(e => e.id),
          removedPersonalEdgeIds: [],
          emphasis: notation && proj ? [{ topicId: proj.topicId, purpose: 'avoid an unneeded remedial detour', priority: 'deemphasized', reason: 'Student reports projection is understood; confirm with a quick check rather than reteaching.', evidence }] : [],
        };
        return ok(out, { providerRuns: runs('personal_reviser') });
      },
    },
  };
}
