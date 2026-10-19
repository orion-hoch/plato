// Session agenda: the session's goals, in order, built at start without a model call. It is the thread the tutor keeps:
// the director's cards teach the current goal's lesson and close it on evidence; change_topic moves it. v11: a goal is a
// topic plus an understanding target (doneWhen), chosen by need (session/goals.mjs); no days, minutes or time checks.

export const MODE_GLOSS = {
  teach: 'explain with one concrete example from their course; practice comes after',
  guide: 'no explanation first: a small problem to reason through, hints before answers',
  practice: 'graded questions, getting harder',
  exam: 'an exam problem',
  diagnose: 'one quick question per area, one sentence of feedback, move on',
  get_to_know: 'ask about them, one thing at a time',
};
export const INTRO_MODES = new Set(['get_to_know', 'diagnose']);
export const finished = g => g.state === 'done';
// A goal the session can turn to: unfinished, and not one asked about only in the background (get_to_know once yielded).
export const open = g => !finished(g) && !g.background;
export const currentGoal = agenda => agenda?.goals.find(g => g.id === agenda.currentGoalId) || null;
export const listed = items => items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0] || '';
const line = g => `"${g.title}" (${g.mode}: ${MODE_GLOSS[g.mode]}). Done when: ${g.doneWhen}${g.why ? ` Why now: ${g.why}.` : ''}`;

// How much to teach versus tutor, by approach and mastery rank (not assessed, emerging, developing, secure).
const MODES = { teach_first: ['teach', 'teach', 'teach', 'practice'], balanced: ['teach', 'teach', 'guide', 'practice'], tutor_first: ['guide', 'guide', 'guide', 'practice'] };
const RANK = { emerging: 1, developing: 2, secure: 3 };
export const rankOf = projection => projection?.estimate?.status === 'estimated' ? RANK[projection.estimate.ordinal] ?? 0 : 0;
export const modeFor = (approach, rank) => (MODES[approach] || MODES.balanced)[Math.min(3, rank)];
const clip = (text, max) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
/** The understanding target, from the topic's objective. */
export const doneWhenOf = statement => statement ? clip(`they can ${statement[0].toLowerCase()}${statement.slice(1).replace(/[.\s]+$/, '')}.`, 240) : 'they can explain it in their own words and use it on a quick question.';

/** Explain first, try first or a mix, from the student's words; null when they do not say. ponytail: keyword match. */
export function approachOf(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(try|attempt|work|figure|struggle)\w*( it| things| them| problems?)?( out)? (first|myself|on my own)|on my own|quiz me|(questions|problems) first/.test(t)) return 'tutor_first';
  if (/\b(explain|teach|show|walk)\w*( it| me| things)?( through)? first|teach me|explain (more|things|everything)|lecture|examples? first/.test(t)) return 'teach_first';
  if (/\b(both|mix|balance|depends|either)/.test(t)) return 'balanced';
  const teach = /\b(explain|teach|lecture|show me|walk me)/.test(t), tutor = /\b(try|attempt|quiz|practi[cs]e|myself)/.test(t);
  return teach === tutor ? (teach ? 'balanced' : null) : teach ? 'teach_first' : 'tutor_first';
}

/** A new agenda: finished goals stay finished, the rest start over, and the first open one is current. */
export function startAgenda({ intro, goals, now }) {
  const at = new Date(now).toISOString();
  const all = goals.map(g => finished(g) ? { note: null, ...g } : { ...g, state: 'pending', startedAt: null, doneAt: null, note: g.note ?? null });
  const first = all.find(open);
  if (first) Object.assign(first, { state: 'active', startedAt: at });
  return { intro, goals: all, currentGoalId: first?.id ?? null, startedAt: at };
}

/**
 * One step on the agenda: done (the given goal, else the current one), add (`goal`, always a new goal), focus (the given
 * goal, or `goal` added first). States only move forward: pending → active → done; a finished goal is never focused
 * again. An added or focused goal is current at once; a new one goes in at the current goal's place, so the goal it
 * interrupts stays active and comes back after it. In the intro, turning to the student's own request sends get_to_know
 * to the background (one still-unknown thing at a natural pause; never current or focused again). Returns { agenda, say,
 * changed (goals whose state moved), moved (anything changed), introDone (the last intro goal just finished) }.
 */
export function act(agenda, { action, goalId = null, goal = null, note = null }, now) {
  const at = new Date(now).toISOString();
  const goals = agenda.goals.map(g => ({ ...g }));
  const was = new Map(goals.map(g => [g.id, g.state]));
  const cur = goals.find(g => g.id === agenda.currentGoalId) || null;
  const none = say => ({ agenda, say, changed: [], moved: false, introDone: false });
  let target = action === 'add' ? null : goals.find(g => g.id === (goalId || (goal ? null : agenda.currentGoalId))) || null;
  if (!target && goal && (action === 'add' || action === 'focus')) {
    target = { ...goal, note: note || goal.note || null, state: 'pending', startedAt: null, doneAt: null };
    goals.splice(cur ? goals.indexOf(cur) : goals.length, 0, target);
  }
  if (!target) return none(action === 'done' ? 'Every goal on the agenda is finished.' : 'Nothing on the agenda or in their course matches that.');
  const still = cur ? ` Now on "${cur.title}".` : '';
  if (finished(target)) return none(`"${target.title}" is already ${target.state}; it stays ${target.state}.${still}`);
  // A yielded get_to_know is never focused back: it is asked about only at natural pauses (done and skip still apply).
  if (action === 'focus' && target.background) return none(`"${target.title}" goes on in the background: ask one thing still unknown only at a natural pause.${still}`);
  if (action === 'done') Object.assign(target, { state: 'done', doneAt: at, note: note || target.note || null });
  const jump = action === 'add' || action === 'focus';
  // In the intro the student's own request comes first: getting to know them goes on in the background.
  const yielded = jump && agenda.intro ? goals.filter(g => g.mode === 'get_to_know' && g !== target && open(g)) : [];
  for (const g of yielded) g.background = true;
  // The current goal: the one added or focused, else the one in play, else the next open one after it, else any open one.
  const next = jump ? target : cur && open(cur) ? cur : goals.slice(cur ? goals.indexOf(cur) + 1 : 0).find(open) || goals.find(open) || null;
  if (next && next !== cur) Object.assign(next, { state: 'active', startedAt: at });
  const ahead = next === cur && cur ? `Still on ${line(cur)}`
    : next ? `Next: ${line(next)}`
    : `That was the last goal${agenda.intro ? ' of the introduction' : ''}. Recap what they did in two or three sentences; what they need next follows.`;
  const say = action === 'done' ? `Goal ${goals.indexOf(target) + 1} of ${goals.length} done. ${ahead}`
    : `Now on ${line(target)}${yielded.length ? ' Getting to know them goes on in the background: ask one thing still unknown only at a natural pause, never as a list.' : ''}`;
  const changed = goals.filter(g => was.get(g.id) !== g.state);
  const moved = changed.length > 0 || yielded.length > 0 || (next?.id ?? null) !== agenda.currentGoalId;
  if (!moved) return none(say);
  return { agenda: { ...agenda, goals, currentGoalId: next?.id ?? null, changedAt: at }, say, changed, moved, introDone: !!agenda.intro && changed.some(g => INTRO_MODES.has(g.mode) && finished(g)) && goals.every(g => !INTRO_MODES.has(g.mode) || !open(g)) };
}
