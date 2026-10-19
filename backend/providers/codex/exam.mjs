import { EXAM_DRAFT } from '../../questions/records.mjs';
import { EXAM_PLAN, EXAM_SOLUTION, EXAM_VERDICT } from '../../questions/exam.mjs';
import { EXAM_PLANNER, EXAM_WRITER, EXAM_SOLVER, EXAM_COMPARER, EXAM_PROMPT_VERSION } from '../prompts/exam.mjs';

// Live exam author (backend/questions/exam.mjs drives it): every step on the heavy model in the runtime's exam lane,
// at high effort (its lane's). The solver gets only the problem as the student sees it.

const MS = 900_000; // one high-effort step can take minutes

/** The unit the problem is grounded in, as the plan and the writer read it. */
function course(r) {
  const title = id => r.subtopics.find(t => t.topicId === id)?.title ?? r.topic.title;
  return {
    exam: r.exam, unit: { title: r.topic.title, description: r.topic.description },
    subtopics: r.subtopics.map(t => ({ title: t.title, description: t.description })),
    objectives: r.objectives.map(o => ({ id: o.id, topic: title(o.topicId), statement: o.statement, capabilities: o.capabilities, successCriteria: o.successCriteria })),
    sourceExcerpts: r.sourceEvidence.map(e => ({ anchorId: e.anchor.id, text: e.excerpt })),
    courseClaims: r.interpretations.flatMap(i => i.claims.map(c => c.text)).slice(0, 40),
    narrowTarget: r.narrowTarget, existingProblems: r.existingProblems, exposureNotes: r.exposureNotes, pastExamProblems: r.exemplars || [],
    learnerPreferences: r.selectedProfileFacts.map(f => ({ key: f.key, value: f.value })),
  };
}

export function createExamAuthorCodex({ gateway }) {
  const ask = (instructions, schema, input) => gateway.structured({ role: 'exam', instructions, schema, input, promptTemplateVersion: EXAM_PROMPT_VERSION, timeoutMs: MS });
  return {
    examAuthor: {
      plan: r => ask(EXAM_PLANNER, EXAM_PLAN, course(r)),
      author: r => ask(EXAM_WRITER, EXAM_DRAFT, { ...course(r), plan: r.plan, courseProblem: r.courseProblem ?? null, repair: r.repair }), // courseProblem: from the course (v7)
      solve: r => ask(EXAM_SOLVER, EXAM_SOLUTION, r.problem),
      compare: r => ask(EXAM_COMPARER, EXAM_VERDICT, { problem: r.problem, parts: r.parts }),
    },
  };
}
