import { ELEMENTS } from '../../../shared/elements/index.mjs';
import { elementSchema } from '../../elements/index.mjs';
import { ELEMENTS_PROMPT_VERSION, elementInstructions } from '../prompts/elements.mjs';
import { GENERATE_VERSION, generateInstructions } from '../../../shared/elements/generate.mjs';
import { GENERATED } from '../../elements/index.mjs';

// Makes a tutor-requested visual (backend/elements) on its own lane, the heavy model at low effort by default
// (server/runtime.mjs), so it never queues behind a knowledge build or turn planning. The spec comes back as a
// JSON string for its kind's validator.
export function createElementMakerCodex({ gateway }) {
  return {
    elementMaker: {
      make(request) {
        const kinds = request.kind ? [request.kind] : Object.keys(ELEMENTS);
        return gateway.structured({
          role: 'elements', instructions: elementInstructions(kinds), schema: elementSchema(kinds), promptTemplateVersion: ELEMENTS_PROMPT_VERSION,
          timeoutMs: request.timeoutMs ?? 45_000, signal: request.signal,
          input: { request: request.request, course: request.course, topic: request.topic, recentDialogue: request.recentDialogue, courseExcerpts: request.grounding, repair: request.repair ?? null },
        });
      },
      // An element for a move (backend/elements generate): one kind's spec for a KC, a case and a mode, on the same lane.
      generate(request) {
        return gateway.structured({
          role: 'elements', instructions: generateInstructions(request.kind), schema: GENERATED, promptTemplateVersion: GENERATE_VERSION, timeoutMs: request.timeoutMs ?? 90_000,
          input: { kind: request.kind, mode: request.mode, idea: request.kc, case: request.case, wrongModel: request.wrongModel, courseNotes: request.notes, repair: request.repair },
        });
      },
    },
  };
}
