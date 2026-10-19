import { AppError } from '../../core/errors.mjs';
import { ok, mockRun } from '../contracts.mjs';
import { ATTACH_VERSION } from '../prompts/ingest.mjs';

/** Deterministic material attacher: files nothing unless steered. controls.materialAttacher: { fail, items: [...] | request => [...] }. */
export function createIngestMocks({ clock, controls }) {
  return {
    materialAttacher: {
      async attach(request) {
        const c = controls.materialAttacher || {};
        if (c.fail) throw new AppError('provider_unavailable', 'material attacher down');
        const items = typeof c.items === 'function' ? c.items(request) : c.items || [];
        return ok({ items }, { providerRuns: [mockRun('materialAttacher', ATTACH_VERSION, clock)] });
      },
    },
  };
}
