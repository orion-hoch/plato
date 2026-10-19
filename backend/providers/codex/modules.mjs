import { MODULE_DRAFT } from '../../modules/writer.mjs';
import { MODULE_WRITER, MODULE_VERSION } from '../prompts/modules.mjs';

// Live module writer (backend/modules): Astra on the heavy model at high effort, one unit per call.

const MS = 900_000; // a large unit at high effort can take minutes

export function createModulesCodex({ gateway, effort = 'high' }) {
  return {
    moduleWriter: {
      write: ({ work, ...input }) => gateway.structured({ role: 'astra', instructions: MODULE_WRITER, schema: MODULE_DRAFT, promptTemplateVersion: MODULE_VERSION, effort, timeoutMs: MS, input }),
    },
  };
}
