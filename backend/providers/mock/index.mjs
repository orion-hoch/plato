import { createKnowledgeMocks } from './knowledge.mjs';
import { createLearnerMocks } from './learner.mjs';
import { createQuestionsMocks } from './questions.mjs';
import { createSessionMocks } from './session.mjs';
import { createValidatorMock } from './validator.mjs';
import { createElementMakerMock } from './elements.mjs';
import { createDirectorMocks } from './director.mjs'; // the director (v9, cards mode)
import { createModulesMocks } from './modules.mjs'; // course modules (v7)
import { createIngestMocks } from './ingest.mjs'; // easy new material (v7)
import { createUnderstandingMocks } from './understanding.mjs'; // the Studies (v11)

/** All deterministic provider mocks. `controls` is shared so tests can steer any adapter. */
export function createMockProviders({ clock, controls = {} }) {
  return {
    ...createKnowledgeMocks({ clock, controls }),
    ...createLearnerMocks({ clock, controls }),
    ...createQuestionsMocks({ clock, controls }),
    ...createSessionMocks({ clock, controls }),
    ...createValidatorMock({ clock, controls }),
    ...createElementMakerMock({ clock, controls }),
    ...createDirectorMocks({ clock, controls }),
    ...createModulesMocks({ clock, controls }), // course modules (v7)
    ...createIngestMocks({ clock, controls }), // easy new material (v7)
    ...createUnderstandingMocks({ clock, controls }), // the Studies (v11)
  };
}
