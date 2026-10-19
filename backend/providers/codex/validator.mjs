import { newId } from '../../core/util.mjs';
import { ok } from '../contracts.mjs';
import { VALIDATOR_VERDICT } from '../../knowledge/schemas.mjs';
import { VALIDATE, VALIDATE_COMMON, PROMPT_VERSIONS } from '../prompts/knowledge.mjs';

// Live Validator (spec §5.1): one model call per responsibility, assembled into a ValidationReport.
// Deterministic checks (anchor resolution, graph closure, cycles) run in the knowledge module, not here.

export function createValidatorCodex({ gateway, clock, timeoutMs = 300_000 }) {
  return {
    validator: {
      async validate(request) {
        const result = await gateway.structured({
          role: 'astra', effort: 'medium', timeoutMs, promptTemplateVersion: PROMPT_VERSIONS.validate, schema: VALIDATOR_VERDICT,
          instructions: `${VALIDATE_COMMON}\n\nYour responsibility: ${request.responsibility}. ${VALIDATE[request.responsibility] || ''}`,
          input: {
            candidate: request.candidatePayload,
            originalEvidence: request.originalEvidence.map(e => ({ anchorId: e.anchor.id, location: { page: e.anchor.location.page, slide: e.anchor.location.slide, section: e.anchor.location.sectionPath.join(' > ') }, text: e.excerpt })),
            objectives: request.objectiveVersions.map(o => ({ id: o.id, statement: o.statement })),
          },
        });
        if (result.outcome !== 'ok') return result;
        const v = result.value;
        const ev = ids => ids.map(id => ({ kind: 'source_anchor', id, detail: null }));
        const report = {
          id: newId('vrep'), scope: request.work.scope, createdAt: clock.iso(), candidateRef: request.candidate, responsibility: request.responsibility, disposition: v.disposition,
          checks: v.checks.map(c => ({ check: c.check, passed: c.passed, evidence: ev(c.evidenceAnchorIds), note: c.note })),
          issues: v.issues.map(i => ({ code: i.code, severity: i.severity, message: i.message, affected: [request.candidate], evidence: ev(i.evidenceAnchorIds), resolution: 'open' })),
          dependencies: request.work.dependencies, runs: result.providerRuns,
        };
        return ok({ report, repairInstructions: v.repairInstructions.map(r => ({ target: request.candidate, instruction: r.instruction, evidence: ev(r.evidenceAnchorIds) })) }, { providerRuns: result.providerRuns });
      },
    },
  };
}
