import { AppError } from '../../core/errors.mjs';
import { ok, mockRun } from '../contracts.mjs';
import { MODULE_VERSION } from '../prompts/modules.mjs';

/** Deterministic module writer: the request's own claims back as concepts, each topic's first linked to its parent. controls.moduleWriter: { fail, draft }. */
export function createModulesMocks({ clock, controls }) {
  return {
    moduleWriter: {
      async write(request) {
        const c = controls.moduleWriter || {};
        if (c.fail) throw new AppError('provider_unavailable', 'module writer down');
        const cut = (x, n) => String(x).slice(0, n), given = new Set(request.excerpts.map(e => e.anchorId));
        const goals = [...request.unit.objectives.map(o => o.statement), ...request.topics.map(t => t.objectives[0]?.statement).filter(Boolean)];
        let n = 0;
        const concepts = (t, max) => t.claims.filter(x => x.anchorIds.some(a => given.has(a))).slice(0, max).map((x, i) => ({ key: `c${++n}`, statement: cut(x.text, 420), anchorIds: x.anchorIds.slice(0, 8), terms: [], links: i === 0 && t.parentId ? [{ to: t.parentId, relation: 'supports', why: 'mock link' }] : [] }));
        const draft = c.draft ?? {
          summary: cut(request.unit.description || request.unit.title, 700), examGoals: (goals.length ? goals : [request.unit.title]).slice(0, 3).map(o => cut(`By the exam: ${o}`, 260)), concepts: concepts(request.unit, 2),
          topics: request.topics.map(t => ({ moduleId: t.moduleId, summary: cut(t.description || t.title, 500), concepts: concepts(t, 3), example: null, misconceptions: [], examGoal: cut(`By the exam: ${t.objectives[0]?.statement || t.title}`, 260) })),
        };
        return ok(draft, { providerRuns: [mockRun('moduleWriter', MODULE_VERSION, clock)] });
      },
    },
  };
}
