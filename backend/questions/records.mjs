import { newId, hashOf } from '../core/util.mjs';
import { s } from '../core/shape.mjs';

// Turns a generator draft into the spec's GenerateQuestionOutput { question, rubric } (§4.5, §5.5).
// Shared by the mock and Codex adapters so both return identical shapes. The question service
// still re-validates everything and re-derives ownership/state server-side.

export const RUBRIC_POLICY_VERSION = 'rubric_policy_v1';
export const DIFFICULTIES = ['basic_diagnostic', 'application', 'transfer'];
const CAPABILITIES = ['recall', 'explanation', 'application', 'transfer', 'delayed_retention'];

export const INPUT_KINDS = ['speech', 'choice', 'multi_select', 'text', 'number', 'draw', 'order', 'match'];
const OPTIONS = s.nullable(s.array(s.object({ id: s.string({ min: 1, max: 10 }), text: s.string({ min: 1, max: 500 }) }), { max: 10 }));

/** Normalized input kind/spec (choices reused for choice kinds) and parsed structured expected answer. */
export function inputOf(draft) {
  const kind = INPUT_KINDS.includes(draft.inputKind) ? draft.inputKind : draft.choices?.length ? 'choice' : 'speech';
  const spec = draft.inputSpec || {};
  let expected = draft.expectedStructured ?? null;
  if (typeof expected === 'string') { try { expected = JSON.parse(expected); } catch { /* a plain string stays as is */ } }
  const options = spec.options?.length ? spec.options : draft.choices || null;
  const inputSpec = kind === 'choice' || kind === 'multi_select' ? { options }
    : kind === 'order' ? { items: spec.items || [] }
    : kind === 'match' ? { left: spec.left || [], right: spec.right || [] }
    : kind === 'number' ? { unit: spec.unit ?? null, tolerance: spec.tolerance ?? null } : {};
  return { inputKind: kind, inputSpec, expectedStructured: ['speech', 'text', 'draw'].includes(kind) ? null : expected, choices: kind === 'choice' || kind === 'multi_select' ? options : draft.choices };
}

/** Problems with an exact question's spec ↔ expected answer; empty when consistent. */
export function inputProblems({ inputKind, inputSpec, expectedStructured: e }) {
  const ids = list => new Set((list || []).map(x => x.id));
  const out = [];
  if (inputKind === 'choice') { if ((inputSpec.options || []).length < 2) out.push('choice needs at least two options'); if (!ids(inputSpec.options).has(e)) out.push('expected choice is not an option'); }
  if (inputKind === 'multi_select') { if ((inputSpec.options || []).length < 2) out.push('multi_select needs options'); if (!Array.isArray(e) || !e.length || e.some(x => !ids(inputSpec.options).has(x))) out.push('expected selection must be option ids'); }
  if (inputKind === 'order') { const all = ids(inputSpec.items); if (all.size < 2) out.push('order needs at least two items'); if (!Array.isArray(e) || e.length !== all.size || new Set(e).size !== all.size || e.some(x => !all.has(x))) out.push('expected order must be a permutation of the items'); }
  if (inputKind === 'match') { const l = ids(inputSpec.left), r = ids(inputSpec.right); if (l.size < 2 || r.size < 2) out.push('match needs two sides'); if (!Array.isArray(e) || e.length !== l.size || new Set(e.map(p => p?.[0])).size !== l.size || e.some(p => !Array.isArray(p) || !l.has(p[0]) || !r.has(p[1]))) out.push('expected pairs must cover every left item with a right item'); }
  if (inputKind === 'number' && (typeof e !== 'number' || !Number.isFinite(e))) out.push('expected number missing');
  return out;
}

const CRITERION = s.object({ objectiveVersionId: s.string(), text: s.string({ min: 1, max: 1000 }), capability: s.enum(CAPABILITIES), evidenceAnchorIds: s.array(s.string()) });
const HINT = s.object({ text: s.string({ min: 1, max: 1000 }), revealsAnswer: s.bool() });

export const DRAFT_SCHEMA = s.object({
  prompt: s.string({ min: 1, max: 2000 }),
  voiceForm: s.string({ min: 1, max: 2000 }),
  choices: s.nullable(s.array(s.object({ id: s.string({ min: 1, max: 10 }), text: s.string({ min: 1, max: 500 }) }), { max: 8 })),
  expectedAnswer: s.string({ max: 2000 }),
  acceptableAlternatives: s.array(s.string({ max: 1000 }), { max: 10 }),
  objectiveTargets: s.array(s.object({ objectiveVersionId: s.string(), role: s.enum(['assessed', 'context_only']), capabilities: s.array(s.enum(CAPABILITIES)) }), { min: 1, max: 6 }),
  criteria: s.array(CRITERION, { max: 12 }),
  misconceptionChecks: s.array(s.string({ max: 500 }), { max: 8 }),
  assistanceInterpretation: s.string({ max: 1000 }),
  hints: s.array(HINT, { max: 5 }),
  fingerprintText: s.string({ min: 1, max: 1000 }),
  difficultyNote: s.string({ max: 500 }),
  sourceAnchorIds: s.array(s.string(), { max: 20 }),
  // How the student answers. Exact kinds carry their expected answer in structured form.
  inputKind: s.enum(INPUT_KINDS),
  inputSpec: s.object({ options: OPTIONS, items: OPTIONS, left: OPTIONS, right: OPTIONS, unit: s.nullable(s.string({ max: 40 })), tolerance: s.nullable(s.number({ min: 0, max: 1 })) }, { optional: ['options', 'items', 'left', 'right', 'unit', 'tolerance'] }),
  expectedStructured: s.nullable(s.json()),
}, { optional: ['inputKind', 'inputSpec', 'expectedStructured'] });

export const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** Numbers and names normalized away: same structure with new numbers/names is the same family. */
export function familyOf(fingerprintText) {
  const norm = String(fingerprintText).toLowerCase()
    .replace(new RegExp(`\\b(${NUMBER_WORDS.join('|')})\\b`, 'g'), '#')
    .replace(/-?\d+(\.\d+)?/g, '#')
    .replace(/[^a-z#ᵀ]+/g, ' ').trim();
  const fingerprint = hashOf(norm);
  return { semanticFingerprint: fingerprint, semanticFamilyId: `fam_${fingerprint.split(':').pop().slice(0, 20)}` };
}

export function buildQuestionOutput(request, draft, clock) {
  const at = clock.iso();
  const scope = request.work.scope;
  const rubricId = newId('rub');
  const criteria = draft.criteria.map(c => ({
    criterionId: newId('crit'), objectiveVersionId: c.objectiveVersionId, text: c.text, capability: c.capability,
    evidence: c.evidenceAnchorIds.map(id => ({ kind: 'source_anchor', id, detail: null })),
  }));
  const dependencies = [
    { ref: { kind: 'knowledge_manifest', id: request.knowledgeManifest.id, version: request.knowledgeManifest.version }, hash: request.knowledgeManifest.contentHash, relation: 'derived_from' },
    ...request.objectives.map(o => ({ ref: { kind: 'objective_version', id: o.id, version: o.version }, hash: o.meaningHash, relation: 'derived_from' })),
    ...(request.personalManifest ? [{ ref: { kind: 'personal_manifest', id: request.personalManifest.id, version: request.personalManifest.version }, hash: request.personalManifest.contentHash || hashOf(request.personalManifest.id), relation: 'personalized_for' }] : []),
    ...(request.learnerContext ? [{ ref: { kind: 'profile_snapshot', id: request.learnerContext.profileSnapshotId, version: request.learnerContext.profileVersion }, hash: hashOf(request.learnerContext), relation: 'personalized_for' }] : []),
    ...request.selectedProfileFacts.map(f => ({ ref: { kind: 'profile_fact', id: f.factId, version: null }, hash: hashOf(f), relation: 'personalized_for' })),
  ];
  const input = inputOf(draft);
  const rubric = {
    id: newId('rubv'), scope, createdAt: at, rubricId, version: 1,
    objectiveVersionIds: [...new Set(draft.objectiveTargets.filter(t => t.role === 'assessed').map(t => t.objectiveVersionId))],
    expectedAnswer: draft.expectedAnswer, expectedStructured: input.expectedStructured, acceptableAlternatives: draft.acceptableAlternatives, criteria,
    misconceptionChecks: draft.misconceptionChecks, assistanceInterpretation: draft.assistanceInterpretation,
    dependencies, policyVersion: request.rubricPolicyVersion,
    meaningHash: hashOf({ prompt: draft.prompt, expectedAnswer: draft.expectedAnswer, criteria: draft.criteria.map(c => [c.objectiveVersionId, c.text, c.capability]) }),
  };
  const family = familyOf(draft.fingerprintText);
  const question = {
    id: newId('q'), scope, createdAt: at, updatedAt: at, rowVersion: 0, version: 1, format: 'short',
    origin: request.origin, topicId: request.topic.topicId,
    objectiveVersionIds: [...new Set(draft.objectiveTargets.map(t => t.objectiveVersionId))],
    narrowTarget: request.narrowTarget,
    objectiveTargets: draft.objectiveTargets.map(t => ({
      objectiveVersionId: t.objectiveVersionId, topicId: request.objectives.find(o => o.id === t.objectiveVersionId)?.topicId || request.topic.topicId, role: t.role,
      criterionIds: t.role === 'assessed' ? criteria.filter(c => c.objectiveVersionId === t.objectiveVersionId).map(c => c.criterionId) : [],
      capabilities: t.capabilities,
    })),
    knowledgeManifestId: request.knowledgeManifest.id, personalManifestId: request.personalManifest?.id || null,
    learnerContext: request.learnerContext, ...family,
    intendedDifficulty: request.intendedDifficulty, difficultyNote: draft.difficultyNote,
    prompt: draft.prompt, voiceForm: draft.voiceForm, approvedRenderingIds: [], choices: input.choices,
    inputKind: input.inputKind, inputSpec: input.inputSpec,
    expectedAnswer: draft.expectedAnswer, rubricVersionId: rubric.id,
    hints: draft.hints.map((h, i) => ({ hintId: newId('hint'), order: i + 1, text: h.text, revealsAnswer: h.revealsAnswer })),
    sourceEvidence: draft.sourceAnchorIds.map(id => ({ kind: 'source_anchor', id, detail: null })),
    dependencies, validationReportIds: [], state: 'validating',
    generationRequestId: request.generationRequestId, failure: null,
  };
  return { question, rubric };
}

// ---------- Exam problems (format 'exam'; every other record is 'short') ----------
// A multi-part problem shown whole on the page. The question record carries what the student sees (title, setup, parts
// with points and answer inputs); the rubric carries each part's reference answer, criteria and machine check.

export const ANSWER_KINDS = ['code', 'latex', 'text', 'number', 'choice', 'draw'];
const PAIR = s.object({ name: s.string({ min: 1, max: 8 }), value: s.string({ min: 1, max: 40 }) });
// A computation that verifies a part's answer: a RISC-V program for the trace simulator, or a C program and its output.
export const CHECK = s.nullable(s.object({
  kind: s.enum(['riscv', 'c']), code: s.string({ min: 1, max: 20_000 }),
  initRegisters: s.array(PAIR, { max: 8 }),
  initMemory: s.array(s.object({ address: s.string({ min: 1, max: 40 }), value: s.string({ min: 1, max: 40 }), label: s.string({ max: 24 }) }), { max: 16 }),
  expectRegisters: s.array(PAIR, { max: 8 }),
  stdin: s.string({ max: 4000 }), expectOutput: s.string({ max: 8000 }),
}));

export const EXAM_DRAFT = s.object({
  title: s.string({ min: 1, max: 160 }),
  setup: s.string({ min: 1, max: 12_000 }),
  parts: s.array(s.object({
    id: s.string({ min: 1, max: 2 }), prompt: s.string({ min: 1, max: 3000 }), points: s.int({ min: 1, max: 50 }),
    answerKind: s.enum(ANSWER_KINDS), language: s.nullable(s.enum(['c', 'riscv'])), starter: s.nullable(s.string({ max: 4000 })), choices: OPTIONS,
    expectedAnswer: s.string({ min: 1, max: 6000 }), acceptableAlternatives: s.array(s.string({ max: 1000 }), { max: 6 }),
    criteria: s.array(CRITERION, { min: 1, max: 6 }), check: CHECK,
  }), { min: 1, max: 8 }), // a course's own problem may have one part, or more than six (11 Oct: CS 3410's practice prelim was rejected); a generated one is planned at 2–6 (exam.mjs)
  estimatedMinutes: s.int({ min: 2, max: 60 }),
  voiceForm: s.string({ min: 1, max: 300 }),
  hints: s.array(HINT, { max: 4 }),
  misconceptionChecks: s.array(s.string({ max: 500 }), { max: 8 }),
  fingerprintText: s.string({ min: 1, max: 1000 }),
  sourceAnchorIds: s.array(s.string(), { max: 20 }),
});

/** The whole problem as markdown: the question's prompt, which validators and the grader read. */
export const examText = d => [`# ${d.title}`, d.setup, ...d.parts.map(p => `**(${p.id})** [${p.points} ${p.points === 1 ? 'point' : 'points'}] ${p.prompt}${p.choices?.length ? `\n${p.choices.map(c => `- (${c.id}) ${c.text}`).join('\n')}` : ''}`)].join('\n\n');
/** A part's answer input as the page gets it: its kind, plus language, starter code or choices when it has them. */
const answerOf = p => ({ kind: p.answerKind, ...(p.language ? { language: p.language } : {}), ...(p.starter ? { starter: p.starter } : {}), ...(p.choices?.length ? { choices: p.choices } : {}) });
/** A plain number written as text, else null. */
export const numberIn = text => /\S/.test(String(text)) && Number.isFinite(Number(String(text).trim())) ? Number(String(text).trim()) : null;
/** true/false when an answer to a number or choice part compares exactly with the expected one; null when it needs judgment. */
export function sameExact(kind, answer, expected, choiceIds = []) {
  if (answer == null || expected == null) return null;
  if (kind === 'number') { const a = numberIn(answer), e = typeof expected === 'number' ? expected : numberIn(expected); return a === null || e === null ? null : Math.abs(a - e) <= Math.max(1e-9, Math.abs(e) * 1e-6); }
  const a = String(answer).trim().toLowerCase();
  return kind === 'choice' && choiceIds.some(id => id.toLowerCase() === a) ? a === String(expected).trim().toLowerCase() : null;
}
/** A part's exact answer when it has one (a number, a choice id); free answers are judged by the grader. */
const exactOf = p => p.answerKind === 'number' ? numberIn(p.expectedAnswer) : p.answerKind === 'choice' && p.choices?.some(c => c.id === p.expectedAnswer.trim()) ? p.expectedAnswer.trim() : null;

/** An exam draft → { question, rubric }: the short builder's records (ids, dependencies, family, targets) plus the parts. */
export function buildExamOutput(request, draft, clock) {
  const flat = draft.parts.flatMap(p => p.criteria.map(c => ({ ...c, partId: p.id })));
  const assessed = [...new Set(flat.map(c => c.objectiveVersionId))];
  const output = buildQuestionOutput(request, {
    prompt: examText(draft), voiceForm: draft.voiceForm, choices: null,
    expectedAnswer: draft.parts.map(p => `Part ${p.id}: ${p.expectedAnswer}`).join('\n'), acceptableAlternatives: [],
    objectiveTargets: assessed.map(id => ({ objectiveVersionId: id, role: 'assessed', capabilities: [...new Set(flat.filter(c => c.objectiveVersionId === id).map(c => c.capability))] })),
    criteria: flat, misconceptionChecks: draft.misconceptionChecks,
    assistanceInterpretation: 'Each part is graded on its own criteria. A delivered hint makes the answer assisted; a revealed answer is not evidence of capability.',
    hints: draft.hints, fingerprintText: draft.fingerprintText, sourceAnchorIds: draft.sourceAnchorIds,
    difficultyNote: `Exam style: ${draft.parts.length} parts, about ${draft.estimatedMinutes} minutes; not calibrated.`,
  }, clock);
  const { question, rubric } = output;
  rubric.criteria = rubric.criteria.map((c, i) => ({ ...c, partId: flat[i].partId }));
  const criterionIds = p => rubric.criteria.filter(c => c.partId === p.id).map(c => c.criterionId);
  Object.assign(question, {
    format: 'exam', inputKind: 'exam', inputSpec: {}, title: draft.title, setup: draft.setup,
    parts: draft.parts.map(p => ({ id: p.id, prompt: p.prompt, points: p.points, answer: answerOf(p), criterionIds: criterionIds(p) })),
    totalPoints: draft.parts.reduce((sum, p) => sum + p.points, 0), estimatedMinutes: draft.estimatedMinutes,
  });
  Object.assign(rubric, {
    format: 'exam',
    parts: draft.parts.map(p => ({ partId: p.id, points: p.points, kind: p.answerKind, expectedAnswer: p.expectedAnswer, acceptableAlternatives: p.acceptableAlternatives, expectedStructured: exactOf(p), criterionIds: criterionIds(p), check: p.check })),
  });
  return output;
}
