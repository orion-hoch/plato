// The course page's outline, kept apart from the component so tests can load it: the course's units in the course's own
// order, each with its topics (and theirs) numbered under it, every node filled with its mastery.

/** A topic's own mastery as a fill from 0 to 1; not assessed counts as not yet there. */
export const fill = t => t?.mastery?.status === 'estimated' && typeof t.mastery.displayIndex === 'number' ? t.mastery.displayIndex / 100 : 0;

/** The goal being worked on: the agenda's current one, else its first still open; null once all are done. */
export function currentGoal(agenda) {
  const goals = agenda?.goals || [];
  return goals.find(g => g.id === agenda.currentGoalId) || goals.find(g => g.state === 'active') || goals.find(g => g.state !== 'done') || null;
}

/** A node's subtree ids (a unit includes its topics). */
export function subtree(topics, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const t of topics) if (t.parentId && out.has(t.parentId) && !out.has(t.id)) { out.add(t.id); grew = true; } }
  return out;
}

/**
 * The course as an outline, in the order the topics came: [{ ...topic, number: '1.2', depth, fill, assessed, children }].
 * A group fills with the average of its leaf topics, and counts as assessed once any is; `overall` is the course's.
 */
export function outline(topics) {
  const ids = new Set(topics.map(t => t.id)), kids = new Map();
  for (const t of topics) { const p = ids.has(t.parentId) ? t.parentId : 'root'; kids.set(p, [...(kids.get(p) || []), t]); }
  const leaves = [];
  const node = (t, number, depth) => {
    const children = (kids.get(t.id) || []).map((c, i) => node(c, `${number}.${i + 1}`, depth + 1));
    const own = children.length ? children.flatMap(c => c.leaves) : [t];
    if (!children.length) leaves.push(t);
    return { ...t, number, depth, children, leaves: own, fill: own.reduce((s, l) => s + fill(l), 0) / own.length, assessed: own.some(l => l.mastery?.status === 'estimated') };
  };
  const units = (kids.get('root') || []).map((t, i) => node(t, String(i + 1), 1));
  return { units, overall: leaves.length ? leaves.reduce((s, l) => s + fill(l), 0) / leaves.length : 0 };
}
