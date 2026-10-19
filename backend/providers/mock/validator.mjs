import { newId } from '../../core/util.mjs';
import { ok, failed, mockRun } from '../contracts.mjs';
import { AppError } from '../../core/errors.mjs';

/**
 * Deterministic Validator (spec §5.1). Passes unless:
 * - controls.validator[responsibility] is 'repair_required' | 'needs_review' | 'provisional_allowed' | 'fail' | 'timeout', or
 * - the candidate payload contains the marker "UNSUPPORTED" (source_fidelity/personalization_grounding/math report repair_required).
 * - controls.validator.edgeFinding is 'by_id' | 'by_title' (graph_integrity flags the first edge, naming it by edgeId or only as "from → to").
 * Agreement between validators never upgrades an unsupported claim; each report stands alone.
 */
export function createValidatorMock({ clock, controls }) {
  return {
    validator: {
      async validate(request) {
        const forced = controls.validator?.[request.responsibility];
        if (forced === 'fail') throw new AppError('provider_unavailable', 'validator down');
        if (forced === 'timeout') throw new AppError('provider_timeout', 'validator timeout');
        const text = JSON.stringify(request.candidatePayload ?? '');
        const flagged = /UNSUPPORTED/.test(text) && ['source_fidelity', 'personalization_grounding', 'math_and_reasoning', 'question_answerability'].includes(request.responsibility);
        const edge = controls.validator?.edgeFinding && request.responsibility === 'graph_integrity' ? request.candidatePayload?.edges?.[0] : null;
        const disposition = forced || (flagged || edge ? 'repair_required' : 'pass');
        const issues = edge ? [{ code: 'imprecise_edge_citation', severity: 'blocking', message: `${edge.fromTitle ?? edge.from} → ${edge.toTitle ?? edge.to} cites an excerpt that does not show this connection.`, affected: controls.validator.edgeFinding === 'by_id' ? [{ kind: 'graph_edge', id: edge.edgeId, version: null }] : [request.candidate], evidence: [], resolution: 'open' }]
          : disposition === 'pass' ? [] : [{ code: `${request.responsibility}_issue`, severity: disposition === 'provisional_allowed' ? 'warning' : 'blocking', message: flagged ? 'Contains an unsupported statement.' : `Forced ${disposition}.`, affected: [request.candidate], evidence: request.originalEvidence.slice(0, 1).map(e => ({ kind: 'source_anchor', id: e.anchor.id, detail: null })), resolution: 'open' }];
        const report = {
          id: newId('vrep'), scope: request.work.scope, createdAt: clock.iso(), candidateRef: request.candidate, responsibility: request.responsibility, disposition,
          checks: [{ check: request.responsibility, passed: disposition === 'pass' ? true : disposition === 'provisional_allowed' ? null : false, evidence: issues[0]?.evidence || [], note: disposition }],
          issues, dependencies: request.work.dependencies, runs: [mockRun('validator', 'validator_v1', clock)],
        };
        return ok({ report, repairInstructions: disposition === 'repair_required' ? [{ target: request.candidate, instruction: 'Remove or ground the unsupported statement.', evidence: report.checks[0].evidence }] : [] }, { providerRuns: report.runs });
      },
    },
  };
}
