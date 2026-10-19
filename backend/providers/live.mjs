import { createModelGateway } from './contracts.mjs';
import { createKnowledgeCodex } from './codex/knowledge.mjs';
import { createValidatorCodex } from './codex/validator.mjs';
import { createLearnerCodexProviders } from './codex/learner.mjs';
import { createQuestionsCodex } from './codex/questions.mjs';
import { createDrawingReaderCodex } from './codex/drawing.mjs';
import { createElementMakerCodex } from './codex/elements.mjs';
import { createDirectorCodex } from './codex/director.mjs'; // the director (v9)
import { createModulesCodex } from './codex/modules.mjs'; // course modules (v7)
import { createIngestCodex } from './codex/ingest.mjs'; // easy new material (v7)
import { createUnderstandingCodex } from './codex/understanding.mjs'; // the Studies (v11)

/**
 * Production providers over the Codex app-server runtime (ChatGPT sign-in); the voice is the ElevenLabs agent the page talks
 * to (the actor), never a provider here. Same contracts as the mocks. Models and efforts come from the four settings and the
 * lanes in server/runtime.mjs; a job whose effort differs from its setting's keeps it in its adapter.
 */
export function createLiveProviders({ runtime, clock }) {
  const gateway = createModelGateway({ runtime, clock });
  return {
    ...createKnowledgeCodex({ gateway }),
    ...createValidatorCodex({ gateway, clock }),
    ...createLearnerCodexProviders({ gateway }),
    ...createQuestionsCodex({ gateway, clock }),
    ...createDrawingReaderCodex({ gateway }),
    ...createElementMakerCodex({ gateway }),
    ...createDirectorCodex({ gateway }), // the director setting on the reply path, high ahead of it
    ...createModulesCodex({ gateway }), // high effort
    ...createIngestCodex({ gateway }), // high effort
    ...createUnderstandingCodex({ gateway }), // heavy lane for building, light for the self-exam's answers, grades and grounding
    gateway,
  };
}
