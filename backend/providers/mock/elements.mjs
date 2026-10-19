import { ok, mockRun } from '../contracts.mjs';
import { AppError } from '../../core/errors.mjs';
import { ELEMENTS } from '../../../shared/elements/index.mjs';
import { ELEMENTS_PROMPT_VERSION } from '../prompts/elements.mjs';
import { REGISTRY } from '../../../shared/elements/registry.mjs';
import { GENERATE_VERSION } from '../../../shared/elements/generate.mjs';

/**
 * Deterministic ElementMaker: each kind's own example (a circuit when no kind is asked for). Steer with
 * controls.elementMaker: fail: true | number (fail that many calls) · specs: [spec…] answered first, one per call
 * (an invalid one exercises the repair) · delayMs: advance the test clock first · seen: requests are pushed here.
 */
export function createElementMakerMock({ clock, controls }) {
  return {
    elementMaker: {
      async make(request) {
        const c = controls.elementMaker || {};
        c.seen?.push(request);
        if (c.delayMs) clock.advance(c.delayMs);
        if (c.fail) { if (typeof c.fail === 'number') c.fail--; throw new AppError('provider_unavailable', 'Element maker unavailable.'); }
        const kind = request.kind || 'circuit', spec = c.specs?.length ? c.specs.shift() : ELEMENTS[kind].example;
        return ok({ kind, title: `Example ${kind}`, summary: `The example ${kind} is on the page.`, spec: JSON.stringify(spec) }, { providerRuns: [mockRun('elementMaker', ELEMENTS_PROMPT_VERSION, clock)] });
      },
      // An element for a move: the kind's example with no checkpoint (controls.elementMaker.generated: outputs answered first).
      async generate(request) {
        const c = controls.elementMaker || {};
        c.seen?.push(request);
        const out = c.generated?.length ? c.generated.shift() : { title: `Example ${request.kind}`, summary: `The example ${request.kind}.`, state: JSON.stringify(REGISTRY[request.kind].example), ask: 'What do you notice?', checkpoints: [], target: null, rubric: [], answerName: null, theirs: null, difference: null };
        return ok(out, { providerRuns: [mockRun('elementMaker', GENERATE_VERSION, clock)] });
      },
    },
  };
}
