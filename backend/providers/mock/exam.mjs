import { AppError } from '../../core/errors.mjs';
import { ok, mockRun } from '../contracts.mjs';

/**
 * Deterministic exam author (backend/questions/exam.mjs drives it): a small CS 3410 problem, whatever the course: trace a
 * RISC-V leaf function (checked on the interpreter), its calling convention, and a two's-complement encoding.
 * Steer with controls.examAuthor:
 *   fail: true (unavailable) · withC: true (part c carries a C check, which needs the C sandbox)
 *   wrongFirst: true (the first draft's part a is wrong, so the machine check sends it to repair)
 *   disagree: n (the first n solves get part b wrong: 1 is repaired, 2 is discarded)
 *   easy: n (the first n comparisons count one step per part: too easy, so 1 is repaired, 2 is discarded)
 * A comparison counts a part's steps as the clauses (";") of the solver's work.
 */
const CODE = 'f:\n  slli t0, a0, 1\n  add  t0, t0, a1\n  addi a0, t0, -4\n  ret';
const SAVES = 'None: f writes only t0, a caller-saved temporary, and a0, which carries the return value; neither is callee-saved, so f needs no prologue or epilogue.';
const BITS = '#include <stdio.h>\nint main(void) {\n  signed char x = -11;\n  for (int i = 7; i >= 0; i--) putchar(((unsigned char)x >> i) & 1 ? \'1\' : \'0\');\n  putchar(\'\\n\');\n  return 0;\n}\n';

export function createExamAuthorMock({ clock, controls }) {
  let made = 0;
  const c = () => controls.examAuthor || {};
  const run = step => ({ providerRuns: [mockRun(`exam_${step}`, 'exam_mock_v1', clock)] });
  const up = () => { if (c().fail) throw new AppError('provider_unavailable', 'Exam author unavailable.'); };
  return {
    examAuthor: {
      async plan(r) {
        up();
        const o = i => r.objectives[i % r.objectives.length].id;
        return ok({
          title: 'A leaf function under the calling convention', archetype: 'trace RISC-V and apply the calling convention', objectiveIds: [...new Set([o(0), o(1), o(2)])],
          scenario: 'A four-instruction RISC-V leaf function f called with a0 = 6 and a1 = 3, then the encoding of its result negated.',
          parts: [{ focus: 'the value f returns', objectiveId: o(0), answerKind: 'number' }, { focus: 'which registers f must save', objectiveId: o(1), answerKind: 'text' }, { focus: 'the encoding of the negated result', objectiveId: o(2), answerKind: 'text' }],
          estimatedMinutes: 12,
        }, run('plan'));
      },
      async author(r) {
        up();
        const a0 = c().wrongFirst && !r.repair ? '12' : '11';
        const anchors = r.sourceEvidence.map(e => e.anchor.id).slice(0, 2);
        const criterion = (i, text) => { const o = r.objectives[i % r.objectives.length]; return { objectiveVersionId: o.id, text, capability: o.capabilities.includes('application') ? 'application' : o.capabilities[0] || 'application', evidenceAnchorIds: anchors }; };
        const part = (id, prompt, points, answerKind, expectedAnswer, criteria, extra = {}) => ({ id, prompt, points, answerKind, language: null, starter: null, choices: null, expectedAnswer, acceptableAlternatives: [], criteria, check: null, ...extra });
        return ok({
          title: 'A leaf function under the calling convention',
          setup: `The leaf function \`f\` below is called with \`a0 = 6\` and \`a1 = 3\`.\n\n\`\`\`riscv\n${CODE}\n\`\`\``,
          parts: [
            part('a', 'What value does `f` return in `a0`?', 4, 'number', a0, [criterion(0, 'Doubles a0 with slli, adds a1, then subtracts 4, returning 11.')],
              { check: { kind: 'riscv', code: CODE, initRegisters: [{ name: 'a0', value: '6' }, { name: 'a1', value: '3' }], initMemory: [], expectRegisters: [{ name: 'a0', value: a0 }], stdin: '', expectOutput: '' } }),
            part('b', 'Which of the registers `f` writes must it save and restore under the RISC-V calling convention? Justify briefly.', 3, 'text', SAVES, [criterion(1, 'Says that no register needs saving.'), criterion(1, 'Justifies it: t0 is caller-saved and a0 carries the return value.')]),
            part('c', 'Write the 8-bit two\'s-complement encoding of the negation of the value `f` returns, in binary.', 3, 'text', '11110101', [criterion(2, 'Gives 11110101: inverts 00001011 and adds one.')],
              { acceptableAlternatives: ['0b11110101', '0xF5'], check: c().withC ? { kind: 'c', code: BITS, initRegisters: [], initMemory: [], expectRegisters: [], stdin: '', expectOutput: '11110101' } : null }),
          ],
          estimatedMinutes: 12,
          voiceForm: 'Here is an exam-style problem on a leaf function and the calling convention; it has three parts, so take your time.',
          hints: [{ text: 'Write down t0 after each instruction.', revealsAnswer: false }],
          misconceptionChecks: ['Saving caller-saved temporaries in a leaf function.', 'Forgetting to add one when negating.'],
          fingerprintText: `leaf function trace calling convention twos complement negation ${'i'.repeat(++made)}`,
          sourceAnchorIds: anchors,
        }, run('author'));
      },
      async solve() {
        const wrong = c().disagree > 0 && controls.examAuthor.disagree-- > 0;
        return ok({ answers: [
          { partId: 'a', work: '6 << 1 = 12; 12 + 3 = 15; 15 - 4 = 11.', answer: '11' },
          { partId: 'b', work: 'f writes t0 and a0; t0 is caller-saved and a0 is the return value, so nothing is callee-saved.', answer: wrong ? 'f must save t0 on the stack, since it overwrites it.' : SAVES },
          { partId: 'c', work: '11 = 00001011; inverted 11110100; plus one.', answer: '11110101' },
        ] }, run('solve'));
      },
      async compare(r) {
        const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const easy = c().easy > 0 && controls.examAuthor.easy-- > 0;
        return ok({ parts: r.parts.map(p => {
          const agree = [p.expectedAnswer, ...p.acceptableAlternatives].some(a => norm(a) === norm(p.solverAnswer));
          return { partId: p.partId, agree, problem: agree ? '' : `The solver answered ${JSON.stringify(p.solverAnswer)}, the reference ${JSON.stringify(p.expectedAnswer)}.`, steps: easy ? 1 : p.solverWork.split(';').length };
        }) }, run('compare'));
      },
    },
  };
}
