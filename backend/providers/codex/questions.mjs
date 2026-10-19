import { ok, failed } from '../contracts.mjs';
import { AppError } from '../../core/errors.mjs';
import { buildQuestionOutput, DRAFT_SCHEMA } from '../../questions/records.mjs';
import { QUESTION_GENERATOR, PROMPT_VERSION } from '../prompts/questions.mjs';
import { createExamAuthorCodex } from './exam.mjs';

// Live QuestionGenerator (spec §5.5) on the strong reasoner through the Codex gateway, and the exam author.
export function createQuestionsCodex({ gateway, clock }) {
  return {
    ...createExamAuthorCodex({ gateway }),
    questionGenerator: {
      async generate(request) {
        const result = await gateway.structured({
          role: 'astra', instructions: QUESTION_GENERATOR, schema: DRAFT_SCHEMA, promptTemplateVersion: PROMPT_VERSION,
          input: {
            topic: { title: request.topic.title, description: request.topic.description },
            objectives: request.objectives.map(o => ({ id: o.id, statement: o.statement, capabilities: o.capabilities, successCriteria: o.successCriteria })),
            intendedDifficulty: request.intendedDifficulty, narrowTarget: request.narrowTarget,
            sourceExcerpts: request.sourceEvidence.map(e => ({ anchorId: e.anchor.id, text: e.excerpt })),
            interpretationClaims: request.interpretations.flatMap(i => i.claims.map(c => c.text)).slice(0, 30),
            personalExplanations: request.personalExplanations.map(p => p.summary || p.reasons?.join(' ') || '').filter(Boolean),
            learnerPreferences: request.selectedProfileFacts.map(f => ({ key: f.key, value: f.value })),
            exposureNotes: request.exposureNotes,
          },
        });
        if (result.outcome !== 'ok') return result;
        const draft = result.value;
        const objectiveIds = new Set(request.objectives.map(o => o.id)), anchorIds = new Set(request.sourceEvidence.map(e => e.anchor.id));
        if (draft.objectiveTargets.some(t => !objectiveIds.has(t.objectiveVersionId)) || draft.criteria.some(c => !objectiveIds.has(c.objectiveVersionId))) {
          return failed(new AppError('quality_gate', 'Generator referenced an objective it was not given.', { retryable: true }), { providerRuns: result.providerRuns });
        }
        draft.sourceAnchorIds = draft.sourceAnchorIds.filter(id => anchorIds.has(id));
        draft.criteria = draft.criteria.map(c => ({ ...c, evidenceAnchorIds: c.evidenceAnchorIds.filter(id => anchorIds.has(id)) }));
        return ok(buildQuestionOutput(request, draft, clock), { providerRuns: result.providerRuns });
      },
    },
  };
}
