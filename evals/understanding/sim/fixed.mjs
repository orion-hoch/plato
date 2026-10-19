// The ablation's floor (docs/research/personalization.md §6.4 C, "fixed"): a non-adaptive tutor that runs the same
// sequence for every student: explain each concept, show one worked example, then practice items with plain feedback
// (the right answer when they miss: untargeted, so it never repairs a belief). All in code, no model calls: the outcome
// is the simulated student's own, by the same response functions the live tutor is measured with.
export function runFixed({ lib, student, concepts, practiceRounds = 3 }) {
  const moves = [], skillOf = x => lib.skills.find(k => k.id === x.skill);
  for (const concept of concepts) {
    const items = (lib.practice || []).filter(x => skillOf(x)?.concept === concept);
    student.tick(); student.learn({ concept, kind: 'explain' }); moves.push({ concept, kind: 'explain' });
    if (items.length) { student.tick(); student.learn({ concept, kind: 'worked_example' }); moves.push({ concept, kind: 'worked_example' }); }
    for (let i = 0; i < practiceRounds && items.length; i++) {
      const x = items[(i + 1) % items.length], k = skillOf(x), right = k.solve(x.params);
      const applies = Object.entries(k.bugs).filter(([id, f]) => student.state.bugs[id] && f(x.params) !== null && String(f(x.params)) !== String(right)).map(([id]) => id);
      student.tick();
      const a = student.answer({ concept, difficulty: k.difficulty(x.params), applies });
      student.learn({ concept, kind: 'question' });
      if (a.kind !== 'correct') student.learn({ concept, kind: 'told' });
      moves.push({ concept, kind: 'practice', item: x.skill, answer: a.kind });
    }
  }
  return moves;
}
