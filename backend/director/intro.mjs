// The intro as v2 cards (spec §10 cold start): a short intake, one question at a time, then about ten first-step probes
// chosen by the learner model for maximum information, spine first (learner.coldStart). Without a course model, one basic
// question per unit from the question bank. The engine tracks what was asked and moves the agenda; these only build cards.

/** What get_to_know asks, one key at a time (the session's INTRO_ASKS keys, recorded with remember_preference). */
export const KNOW_ASKS = {
  goal: 'What are you aiming for: which exam, and when is it?',
  lectures: 'Where are you in the lectures so far?',
  teaching_balance: 'Do you like an explanation first, or to try a problem first?',
  background: 'What have you already done with this material?',
  help_wanted: 'What do you find hardest in this course so far?',
};

const base = (goal, intention, why) => ({
  helpLevel: 0, target: { kc: null, topicId: null, statement: goal.title }, intention, verdict: null, show: null, persona: null, withheld: {}, item: null,
  why, source: 'intro', goalId: goal.id, goalTitle: goal.title, arcAfter: null,
});
const thanks = (when, reply) => ({ kind: 'other', when, reply });

/** get_to_know: one thing still unknown, asked plainly; whatever they say is theirs to record. */
export const knowCard = (goal, key, { first = false } = {}) => ({
  ...base(goal, `Get to know them: ${key.replace(/_/g, ' ')} (record what they say with remember_preference, about ${key})`, 'Intake (spec §10): their goals and background before any probing.'),
  move: 'affect', act: 'get_to_know', wait: 'recall', intro: { kind: 'get_to_know', key },
  say: first ? "Hi! Press the talk button or Space when you want to talk, or just type. Two quick questions, then we'll get going." : '', ask: KNOW_ASKS[key], neutral: 'Thanks.', handBack: KNOW_ASKS[key],
  expect: [thanks('they answer, or would rather not say', 'Thank them in a few words, and never ask this question again: the next one comes on its own card.')],
});

/** A cold-start probe: the engine's diagnostic item card, with every reply a neutral thanks (no right or wrong yet), and its evidence kept. */
export function diagnosticCard(goal, card, { item, why, at }) {
  return {
    ...card, ...base(goal, `Cold start ${at}: a first-step probe chosen for maximum information`, `Cold start (spec §10): ${why}.`), target: card.target, item: card.item, show: card.show, withheld: card.withheld,
    move: 'probe', act: 'diagnostic', intro: { kind: 'diagnose', itemId: item.id },
    say: at === 1 ? 'Now a few quick questions, so I can see where you stand. No pressure; a guess is fine.' : '', neutral: 'Thanks, noted.',
    expect: [thanks('they answer it, or say they don\'t know', 'Thank them in a line, no right or wrong yet.'), thanks('they want to skip the questions', 'Fine, no more questions.')],
  };
}

/** No course model: one unit's quick check, a ready basic question on the page when there is one, else how sure they feel. */
export const unitCard = (goal, unit, question, { at, of }) => ({
  ...base(goal, `Quick check ${at} of ${of}, on ${unit.title}: one question, a line back, move on`, 'Cold start without a course model: one basic question per unit (knowledge graph fallback).'),
  move: 'probe', act: 'diagnostic', wait: 'reasoning', intro: { kind: 'diagnose', unitId: unit.id },
  say: at === 1 ? 'Now a few quick questions, one per part of the course, so I can see where you stand.' : '',
  ask: question?.voiceForm || `How sure do you feel about ${unit.title}, and what's one thing you remember from it?`, neutral: 'Thanks, noted.', handBack: 'What would you say?',
  show: question ? { kind: 'question', questionId: question.questionId } : null,
  expect: [thanks("they answer it, or say they don't know", 'Thank them in a line, no right or wrong yet, and go on.'), thanks('they want to skip the check or stop the questions', 'Fine, no more questions.')],
});
