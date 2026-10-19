import { STUDY_SHAPES } from '../../understanding/study.mjs';
import * as P from '../prompts/understanding.mjs';

// Live study writer (backend/understanding): the building stages on the heavy lane (the deep setting, high effort);
// the literal executor, the blind solver, the answer comparer, role-play, diagnosis, grounding and the ablation's
// answers and grades on the light lane (the light setting). Closed-book answers get medium effort, as page
// transcription does, so a slip is not read as a gap.

const MS = 2_400_000; // a high-effort stage can take many minutes on a loaded machine (11 Oct: three CS 3410 topics kept passing 15 min)
const PROMPTS = {
  spine: P.STUDY_SPINE, results: P.STUDY_RESULTS, evidence: P.STUDY_EVIDENCE, wrongs: P.STUDY_WRONGS, procedure: P.STUDY_PROCEDURE, merge: P.STUDY_MERGE,
  execute: P.STUDY_EXECUTE, revise: P.STUDY_REVISE, model: P.STUDY_MODEL, explain: P.STUDY_EXPLAIN, review: P.STUDY_REVIEW, ground: P.STUDY_GROUND,
  probe: P.STUDY_PROBE, answer: P.STUDY_ANSWER, grade: P.STUDY_GRADE, blind: P.STUDY_BLIND, agree: P.STUDY_AGREE, roleplay: P.STUDY_ROLEPLAY, classify: P.STUDY_CLASSIFY,
};
const LIGHT = new Set(['execute', 'ground', 'answer', 'grade', 'blind', 'agree', 'roleplay', 'classify']);
const EFFORT = { answer: 'medium', blind: 'medium' };

export function createUnderstandingCodex({ gateway }) {
  // The runtime judge: one yes/no criterion per call, on the setting it was calibrated on (the deep setting at medium).
  const narrow = ({ work, criterion, items }) => gateway.structured({ role: 'astra', instructions: P.STUDY_NARROW(criterion), schema: STUDY_SHAPES.narrow, promptTemplateVersion: 'narrow', timeoutMs: 120_000, effort: 'medium', input: { items } });
  // The runtime panel (V9: one call per stance, so no panelist sees another) and production check (V10), on the same setting.
  const panel = ({ work, stance, items }) => gateway.structured({ role: 'astra', instructions: P.STUDY_PANEL(stance), schema: STUDY_SHAPES.panel, promptTemplateVersion: P.VERIFY_VERSIONS.panel, timeoutMs: 120_000, effort: 'medium', input: { items } });
  const production = ({ work, items }) => gateway.structured({ role: 'astra', instructions: P.STUDY_PRODUCTION, schema: STUDY_SHAPES.production, promptTemplateVersion: P.VERIFY_VERSIONS.production, timeoutMs: 120_000, effort: 'medium', input: { items } });
  const stage = name => ({ work, ...input }) => gateway.structured({ role: LIGHT.has(name) ? 'luna' : 'astra', instructions: PROMPTS[name], schema: STUDY_SHAPES[name], promptTemplateVersion: P.STUDY_VERSIONS[name], timeoutMs: MS, effort: EFFORT[name], input });
  return { studyWriter: { ...Object.fromEntries(Object.keys(PROMPTS).map(name => [name, stage(name)])), narrow, panel, production } };
}
