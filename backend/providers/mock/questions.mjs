import { ok, mockRun } from '../contracts.mjs';
import { AppError } from '../../core/errors.mjs';
import { buildQuestionOutput, familyOf } from '../../questions/records.mjs';
import { createExamAuthorMock } from './exam.mjs';

/**
 * Deterministic QuestionGenerator (spec §5.5). Steer with controls.questionGenerator:
 *   fail: true | number (fail that many calls) · timeout: true · invalidAnswer: true (validators reject)
 *   delayMs: advance the test clock before answering (past the work deadline → timeout)
 *   reuseFamily: fingerprint text forced onto the next question (same semantic family).
 */
export function createQuestionsMocks({ clock, controls }) {
  const variants = new Map();
  return {
    ...createExamAuthorMock({ clock, controls }),
    questionGenerator: {
      async generate(request) {
        const c = controls.questionGenerator || {};
        if (c.delayMs) clock.advance(c.delayMs);
        if (c.timeout || clock.now() > Date.parse(request.work.deadlineAt)) throw new AppError('provider_timeout', 'Question generation timed out.');
        if (c.fail) { if (typeof c.fail === 'number') c.fail--; throw new AppError('provider_unavailable', 'Question generator unavailable.'); }
        const objective = request.objectives[0];
        const anchorIds = request.sourceEvidence.map(e => e.anchor.id).slice(0, 3);
        const key = `${request.topic.topicId}:${request.intendedDifficulty}:${request.narrowTarget || ''}`;
        let variant = variants.get(key) || 0;
        // Avoid families already exposed, like a real generator told about them.
        const familyFor = v => request.narrowTarget ? `transpose dot product coefficient form ${'i'.repeat(v + 1)}` : `${request.topic.title} ${request.intendedDifficulty} variant ${'x'.repeat(v + 1)}`;
        while (!c.reuseFamily && request.exposureFamilies.includes(familyOf(familyFor(variant)).semanticFamilyId)) variant++;
        variants.set(key, variant + 1);
        const notation = /transpose|qᵢᵀ|q one/i.test(request.narrowTarget || '');
        const values = [[1, 0, 3, 4], [0, 1, 2, 5], [1, 0, 7, 2]][variant % 3];
        const draft = notation ? {
          prompt: `With q₁ = (${values[0]}, ${values[1]}) and a₂ = (${values[2]}, ${values[3]}), what is q₁ᵀa₂, and what does that number represent?`,
          voiceForm: `With q one equal to (${values[0]}, ${values[1]}) and a two equal to (${values[2]}, ${values[3]}), what is q one transpose a two, and what does that number represent?`,
          choices: null,
          expectedAnswer: c.invalidAnswer ? 'UNSUPPORTED claim' : `${values[0] * values[2] + values[1] * values[3]}, the coefficient (component) of a₂ along q₁.`,
          acceptableAlternatives: [`${values[0] * values[2] + values[1] * values[3]}; the amount of a two along q one`],
          fingerprintText: c.reuseFamily || familyFor(variant),
        } : {
          prompt: request.intendedDifficulty === 'basic_diagnostic' ? `In your own words: ${objective.statement}` : `Apply it: ${objective.statement} Use a new example of your own.`,
          voiceForm: request.intendedDifficulty === 'basic_diagnostic' ? `In your own words, ${objective.statement}` : `Try applying it. ${objective.statement} Use a new example of your own.`,
          choices: null,
          expectedAnswer: c.invalidAnswer ? 'UNSUPPORTED claim' : `An answer consistent with: ${request.sourceEvidence[0]?.excerpt || objective.statement}`,
          acceptableAlternatives: [],
          fingerprintText: c.reuseFamily || familyFor(variant),
        };
        if (c.reuseFamily) delete c.reuseFamily;
        // controls.questionGenerator.inputKind forces an answer input (exact kinds carry a structured answer).
        const kind = c.inputKind || 'speech';
        const opts = [{ id: 'a', text: 'A scalar coefficient' }, { id: 'b', text: 'A vector' }, { id: 'c', text: 'A matrix' }];
        const input = {
          speech: {}, text: {}, draw: {},
          choice: { inputSpec: { options: opts }, expectedStructured: 'a' },
          multi_select: { inputSpec: { options: opts }, expectedStructured: ['a', 'c'] },
          number: { inputSpec: { unit: null, tolerance: 0.01 }, expectedStructured: values[0] * values[2] + values[1] * values[3] },
          order: { inputSpec: { items: [{ id: 'p1', text: 'Normalize a₁ to get q₁' }, { id: 'p2', text: 'Subtract the projection of a₂ on q₁' }, { id: 'p3', text: 'Normalize the remainder to get q₂' }] }, expectedStructured: ['p1', 'p2', 'p3'] },
          match: { inputSpec: { left: [{ id: 'l1', text: 'q₁ᵀa₂' }, { id: 'l2', text: '‖a₁‖' }], right: [{ id: 'r1', text: 'r₁₁' }, { id: 'r2', text: 'r₁₂' }] }, expectedStructured: [['l1', 'r2'], ['l2', 'r1']] },
        }[kind];
        Object.assign(draft, { inputKind: kind, ...input, ...(c.badStructured ? { expectedStructured: 'zzz' } : {}) });
        const output = buildQuestionOutput(request, {
          ...draft,
          objectiveTargets: request.objectives.map((o, i) => ({ objectiveVersionId: o.id, role: i === 0 ? 'assessed' : 'context_only', capabilities: o.capabilities.length ? [o.capabilities.includes('application') && request.intendedDifficulty !== 'basic_diagnostic' ? 'application' : o.capabilities[0]] : ['explanation'] })),
          criteria: [{ objectiveVersionId: objective.id, text: `States the correct result and what it means for: ${objective.statement}`, capability: objective.capabilities.includes('application') && request.intendedDifficulty !== 'basic_diagnostic' ? 'application' : (objective.capabilities[0] || 'explanation'), evidenceAnchorIds: anchorIds }],
          misconceptionChecks: notation ? ['Treats qᵀa as a vector instead of a scalar.'] : [],
          assistanceInterpretation: 'A delivered hint makes a correct answer assisted; a revealed answer is not evidence of capability.',
          hints: notation ? [{ text: 'Transpose turns that column into a row so their product is a dot product.', revealsAnswer: false }, { text: 'Multiply matching entries and add them.', revealsAnswer: false }] : [{ text: 'Start from the definition in your notes.', revealsAnswer: false }],
          difficultyNote: `Intended ${request.intendedDifficulty}; not calibrated.`,
          sourceAnchorIds: anchorIds,
        }, clock);
        return ok(output, { providerRuns: [mockRun('questionGenerator', 'question_gen_v1', clock)] });
      },
    },
  };
}
