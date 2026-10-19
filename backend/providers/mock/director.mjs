import { AppError } from '../../core/errors.mjs';
import { ok, mockRun } from '../contracts.mjs';
import { CARD_VERSION, CLASSIFY_VERSION, QUOTE_VERSION, THINK_VERSION, VERIFY_VERSION } from '../prompts/director.mjs';

// A reply that streams: its JSON in a few pieces through onText, a tick apart, so the engine's pipeline runs as it would live.
const stream = async (value, onText) => { if (!onText) return; const text = JSON.stringify(value), n = 6; for (let i = 0; i < n; i++) { onText(text.slice(Math.floor(i * text.length / n), Math.floor((i + 1) * text.length / n))); await new Promise(r => setImmediate(r)); } };

/**
 * Deterministic director: a card v2 draft that asks for the next step, a line read as an answer that fits no branch, and
 * a thought quoting the first passage found. controls.directorWriter: { fail, card, classify, branchId, think, verify, quote }.
 */
export function createDirectorMocks({ clock, controls }) {
  const c = () => controls.directorWriter || {};
  const run = v => ({ providerRuns: [mockRun('directorWriter', v, clock)] });
  return {
    directorWriter: {
      async card(input) {
        if (c().fail) throw new AppError('provider_unavailable', 'director down');
        const value = c().card ?? { move: 'probe', act: 'request_attempt', helpLevel: 0, intention: 'Next move', wait: 'reasoning', say: '', ask: 'What is the next step?', neutral: 'Walk me through how you got that.', handBack: 'What is the next step?', element: null,
          expect: [{ when: '42', literal: '42', kind: 'correct', reply: 'Right.', thenAsk: null }, { when: 'stuck', literal: null, kind: 'stuck', reply: 'Start from the first step.', thenAsk: null }],
          withheldAnswer: '42', board: null, boardWhy: '', point: [] };
        await stream(value, input.onText);
        return ok(value, run(CARD_VERSION));
      },
      async classify() { return ok(c().classify ?? { topicRequest: c().topicRequest ?? null, kind: 'answer', request: null, sessionKind: null, reasoning: false, branchId: c().branchId ?? null, confident: false, agrees: !!c().agrees, wrongModelId: c().wrongModelId ?? null, beliefSure: !!(c().wrongModelId || c().claim), contradicts: !!c().claim, claim: c().claim ?? null }, run(CLASSIFY_VERSION)); },
      async quote(input) { return ok(c().quote !== undefined ? { quote: c().quote } : { quote: String(input.case ?? '').split(/(?<=[.!?])\s+/).find(x => x.split(/\s+/).length >= 5) ?? null }, run(QUOTE_VERSION)); }, // the case's first full sentence, verbatim
      async verify() { return ok(c().verify ?? { answer: '', agrees: 'yes', c: null }, run(VERIFY_VERSION)); },
      async check() { return ok(c().check ?? { verdict: 'right', wrong: '' }, run('director_check_v1')); },
      async problem() { return ok(c().problem ?? { prompt: 'What is 0101 + 0011 in four-bit binary?', answer: '1000', solution: '5 + 3 = 8 = 1000.' }, run('director_problem_v1')); },
      async think(input) {
        if (c().fail) throw new AppError('provider_unavailable', 'director down');
        const p = input.material[0];
        const value = c().think ?? { topicRequest: null, say: p ? `Your ${p.lecture} notes say: ${p.text.replace(/\s+/g, ' ').slice(0, 300)}` : 'That is not in your notes.', board: null, boardWhy: '', lecture: p?.lecture ?? null };
        await stream(value, input.onText);
        return ok(value, run(THINK_VERSION));
      },
    },
  };
}
