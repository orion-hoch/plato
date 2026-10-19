import { ATTACH_DRAFT } from '../../ingest/index.mjs';
import { ATTACH_WRITER, ATTACH_VERSION } from '../prompts/ingest.mjs';

// Live material attacher (backend/ingest): Astra on the heavy model at high effort, one call per part of a file.

const MS = 2_400_000; // a long file at high effort can take many minutes (11 Oct: the practice prelim passed 15 min three times)

export function createIngestCodex({ gateway, effort = 'high' }) {
  return {
    materialAttacher: {
      attach: ({ work, ...input }) => gateway.structured({ role: 'astra', instructions: ATTACH_WRITER, schema: ATTACH_DRAFT, promptTemplateVersion: ATTACH_VERSION, effort, timeoutMs: MS, input }),
    },
  };
}
