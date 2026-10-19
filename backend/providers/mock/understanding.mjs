import { AppError } from '../../core/errors.mjs';
import { ok, mockRun } from '../contracts.mjs';
import { STUDY_VERSIONS, VERIFY_VERSIONS } from '../prompts/understanding.mjs';
import { CORE_FAMILIES } from '../../understanding/adapters.mjs';

/**
 * Deterministic study writer: a small course model on the judged path (no task families, so tests never start a
 * process; one audit check runs on the RISC-V interpreter). controls.studyWriter: { fail: true | '<stage>' }.
 */
const board = { kind: 'markdown', title: 'The idea', content: 'The idea, drawn.', diagramType: null, diagramData: null };
const move = (kc = 'k1', extra = {}) => ({ kind: 'elicit', kc, why: 'They explain it before being told.', problemId: null, ask: 'Why does it hold?', representationId: null, readingId: null, caseId: null, read: null, expect: [{ when: 'the reason', wrongModelId: null, reply: 'Right: now apply it.' }], ...extra });
const step = { id: 's1', action: 'Write what is given.', decision: 'Which case is it?', cue: 'The sign of the change.', standard: 'Every given is written.', why: 'Nothing is lost.', after: [] };
const procedures = [{ id: 'pr1', kc: 'k2', title: 'Carry it out', familyId: null, subgoals: [{ label: 'Set up', steps: [step] }] }];
const detector = { type: 'rubric', rules: [], battery: [], fingerprint: [], violates: [], description: 'names the wrong cause', positives: ['because of the wrong cause'], negatives: ['because of the right cause'] };

export function createUnderstandingMocks({ clock, controls }) {
  const c = () => controls.studyWriter || {};
  const reply = (stage, value) => { if (c().fail === true || c().fail === stage) throw new AppError('provider_unavailable', `study ${stage} unavailable`); return ok(value, { providerRuns: [mockRun(`study_${stage}`, STUDY_VERSIONS[stage] ?? VERIFY_VERSIONS[stage] ?? stage, clock)] }); };
  return {
    studyWriter: {
      spine: r => reply('spine', {
        adapters: ['A3'], adapterWhy: 'mock', sources: r.sources.map(s => ({ id: s.id, role: 'notes' })),
        spine: [{ id: 's1', understanding: `What holds ${r.course.title || 'the course'} together, as a sentence that can be wrong.`, why: 'It organizes the course.', threshold: false, troublesome: 'It is abstract.', evidence: r.refs.slice(0, 2), topics: r.outline.slice(0, 1).map(t => t.topicId) }],
        models: [{ id: 'cm1', form: 'causal', name: 'The course model', state: ['the state'], rules: ['how it changes'], usedBy: [] }], methods: [], conventions: [], links: [],
        assessment: { forms: ['explain'], targets: [], confidence: 'low', why: 'No exams were given.' },
      }),
      results: r => reply('results', {
        matters: { why: 'Later topics rest on it.', examUse: 'An explanation with a trap.' }, interactivity: 'low', spine: r.course.spine.slice(0, 1).map(s => s.id),
        kcs: [{ id: 'k1', kind: 'principle', statement: `Why ${r.topic.title} works.`, prerequisites: [], conceptIds: r.module?.concepts.slice(0, 1).map(x => x.id) || [], refs: r.passages.slice(0, 1).flatMap(p => p.blocks.slice(0, 1).map(b => b.ref)) }, { id: 'k2', kind: 'procedure', statement: `How to carry out ${r.topic.title}.`, prerequisites: ['k1'], conceptIds: [], refs: [] }],
        enduring: [`${r.topic.title} works for a reason a memorizer can miss.`], essentialQuestions: [{ question: 'Why must it be so?', expectations: ['the reason'] }],
        threshold: { is: false, troublesome: [], liminalSigns: [] }, inventory: { notation: [], emphasis: [], warnings: [], exercises: [], workedExamples: [] },
      }),
      evidence: () => reply('evidence', {
        families: [], taskLadder: CORE_FAMILIES.map((_, i) => `p${i + 1}`),
        probes: CORE_FAMILIES.map((family, i) => ({ id: `p${i + 1}`, kc: i % 2 ? 'k2' : 'k1', adapter: 'A3', family, regime: 'R1', form: 'explain', level: 'core', familyId: null, prompt: `A ${family} question.`, answer: 'the reference', rubric: ['the point'], constraints: [], check: { by: 'judge', code: '', expect: 'the reference', compare: 'exact', tolerance: null }, element: null, key: { value: 'the reference', form: 'text', equivalents: [] } })),
      }),
      blind: r => reply('blind', { answers: r.questions.map(q => ({ id: q.id, answer: 'the reference' })) }),
      agree: r => reply('agree', { items: r.items.map(x => ({ id: x.id, agree: true, why: 'mock' })) }),
      wrongs: () => reply('wrongs', { wrongModels: ['w1', 'w2'].map((id, i) => ({ id, kc: 'k1', belief: `Wrong rule ${i + 1} that gives answers.`, errorKind: i ? 'F9' : 'F7', plausibleBecause: 'An earlier topic.', source: 'inferred', citation: null, prior: 0.2, detector, markers: [`cue${i + 1}`], probe: { prompt: `Separating question ${i + 1}.`, answer: `the wrong answer ${i + 1}`, correct: 'the right answer' }, repair: 'Run their model to a contradiction, then build the right one.', recheck: ['p1'] })) }),
      roleplay: r => reply('roleplay', { answers: r.items.map(x => ({ id: x.id, answer: `as ${x.id} would` })) }),
      classify: r => reply('classify', { items: r.items.map(x => ({ id: x.id, belief: x.id.endsWith(':correct') ? 'correct' : x.id.split(':')[0], why: 'mock' })) }),
      procedure: () => reply('procedure', { procedures }), merge: () => reply('merge', { procedures }), revise: () => reply('revise', { procedures }),
      execute: r => reply('execute', { results: r.instances.map(i => ({ id: i.id, steps: ['did the step'], answer: 'the reference', stuck: [] })) }),
      model: r => reply('model', {
        models: [{ id: 'mo1', form: 'causal', name: 'The runnable model', kcs: ['k1'], state: ['the state'], rules: ['when this, then that'], abstractsAway: [], board, notice: ['where the state changes'], courseModelId: null }],
        cases: [{ id: 'c1', kind: 'example', title: 'A case', text: 'A case that shows the idea.', refs: [], kcs: ['k1'], links: [] }],
        representations: [{ id: 'r1', kind: 'table', kcs: ['k1'], board, element: null, notice: ['the row that changes'], activeTask: 'Predict the next row.', bestFor: 'first', fadesTo: null, misleadsWhen: 'when read as a list', translations: [], reveals: ['w1'] }],
        audit: r.passages.length ? [{ where: r.passages[0].blocks[0].ref, materialsSay: 'five', check: { by: 'riscv', code: 'li a0, 5', expect: 'a0=5', compare: 'exact', tolerance: null }, verdict: null }] : [], simplifications: [],
      }),
      explain: r => reply('explain', {
        explanations: r.results.kcs.map(k => ({ kc: k.id, plain: 'The intuition.', precise: k.statement, mechanism: 'Why it holds: the cause, worked through a concrete case so that the reason is visible.', analogies: [], workedExamples: [] })),
        readings: [{ id: 'rd1', kcs: ['k1'], source: 'materials', refs: r.passages.slice(0, 1).flatMap(p => p.blocks.slice(0, 2).map(b => b.ref)), text: null, level: 'intro', purpose: 'Read to find out why it holds.', lookFor: 'the reason it holds', prequestions: ['Why does it hold?'], refutes: null, after: 'explain_back' },
          { id: 'rd2', kcs: ['k1'], source: 'explainer', refs: [], text: 'Many think the wrong rule holds. It does not. It seems right because of an earlier topic. The correct account is the reason. On this case the wrong rule fails.', level: 'core', purpose: 'Read to find out where the wrong rule fails.', lookFor: 'where the mistaken idea fails', prequestions: ['What would the wrong rule predict here?'], refutes: r.wrongModels[0]?.id ?? null, after: 'predict' }],
        gapsInNotes: [], links: [],
        route: { novice: [move()], prior: [move()], fluent: [move()], wrongModels: r.wrongModels.map(w => ({ wrongModelId: w.id, moves: [move('k1', { kind: 'repair' })] })), representationFails: r.representations.slice(0, 1).map(x => ({ representationId: x.id, moves: [move()] })) },
      }),
      review: () => reply('review', { unanswerable: [], stall: [] }),
      ground: () => reply('ground', { findings: [] }), // { path, kind, ref, materialsSay, problem, fix }
      probe: () => reply('probe', { probes: [{ id: 'q1', kind: 'knowledge', teachingType: null, question: 'A knowledge question.', answer: 'A', rubric: ['A'] }, { id: 'q2', kind: 'teaching', teachingType: 'diagnose', question: 'A teaching question.', answer: 'B', rubric: ['B'] }] }),
      answer: r => reply('answer', { answers: r.questions.map(q => ({ id: q.id, answer: ['model', 'both'].includes(r.context) ? 'the answer' : 'no idea' })) }),
      narrow: r => reply('narrow', { verdicts: r.items.map(x => ({ id: x.id, verdict: 'yes', confidence: 0.9 })) }),
      panel: r => reply('panel', { verdicts: r.items.map(x => ({ id: x.id, position: `As ${r.stance.name}: it depends on the facts.`, verdict: 'defensible', confidence: 0.8, why: 'mock' })) }),
      production: r => reply('production', { items: r.items.map(x => ({ id: x.id, language: 'the target language', targets: x.targets.map(target => ({ target, verdict: 'met', evidence: '' })), errors: [], task: 'done', confidence: 0.9 })) }),
      grade: r => reply('grade', { grades: r.items.map(x => ({ id: x.id, verdict: /:(model|both)$/.test(x.id) ? 'correct' : 'wrong', invented: false, why: 'mock' })) }),
    },
  };
}
