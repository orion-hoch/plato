import { CARD_DRAFT, CHECKED, CLASSIFIED, PROBLEM_DRAFT, QUOTED, THOUGHT, VERIFIED } from '../../director/cards.mjs';
import { CARD, CARD_VERSION, CHECK, CHECK_VERSION, CLASSIFY, CLASSIFY_VERSION, PROBLEM, PROBLEM_VERSION, QUOTE, QUOTE_VERSION, THINK, THINK_VERSION, VERIFY, VERIFY_VERSION } from '../prompts/director.mjs';

// Live director (backend/director). On the reply path, in lanes of their own (server/runtime.mjs), so they never queue
// behind background work: the card for an unmatched answer and think, both streamed (`onText`), in `director` at the
// director setting's effort (default low); answer classification and the correct answer's check in `replyLight`. In the
// background (`deep`): cards prepared ahead, on the shared heavy lane at high effort.
export function createDirectorCodex({ gateway, deepEffort = 'high' }) {
  return {
    directorWriter: {
      card: ({ work, deep = false, onText, ...input }) => gateway.structured({ role: deep ? 'astra' : 'director', instructions: CARD, schema: CARD_DRAFT, promptTemplateVersion: CARD_VERSION, effort: deep ? deepEffort : undefined, timeoutMs: deep ? 600_000 : 120_000, onText, input }),
      classify: ({ work, ...input }) => gateway.structured({ role: 'replyLight', instructions: CLASSIFY, schema: CLASSIFIED, promptTemplateVersion: CLASSIFY_VERSION, effort: 'low', timeoutMs: 20_000, input }),
      verify: ({ work, ...input }) => gateway.structured({ role: 'replyLight', instructions: VERIFY, schema: VERIFIED, promptTemplateVersion: VERIFY_VERSION, effort: 'low', timeoutMs: 10_000, input }),
      quote: ({ work, ...input }) => gateway.structured({ role: 'luna', instructions: QUOTE, schema: QUOTED, promptTemplateVersion: QUOTE_VERSION, effort: 'low', timeoutMs: 60_000, input }), // background: a paired case's sentence, for a later move
      think: ({ work, onText, ...input }) => gateway.structured({ role: 'director', instructions: THINK, schema: THOUGHT, promptTemplateVersion: THINK_VERSION, timeoutMs: 60_000, onText, input }),
      problem: ({ work, ...input }) => gateway.structured({ role: 'director', instructions: PROBLEM, schema: PROBLEM_DRAFT, promptTemplateVersion: PROBLEM_VERSION, effort: 'low', timeoutMs: 45_000, input }), // guide mode: a problem made on request
      check: ({ work, ...input }) => gateway.structured({ role: 'reply', instructions: CHECK, schema: CHECKED, promptTemplateVersion: CHECK_VERSION, effort: 'low', timeoutMs: 20_000, input }), // guide mode: a practice answer against its worked answer, on the live lane
    },
  };
}
