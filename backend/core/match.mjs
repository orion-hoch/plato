// Words and topics (v10, audit §4 D2): one tokenizer with one stop list, and finding the topic or goal a request names.
// Every "which of these does the text mean" in the backend goes through here (retrieval hits, the director, examUnit,
// change_topic, ingest, lessons, elements). ponytail: lexical overlap only; embeddings would plug in at overlap().

// Function words, request filler ("work through an essential course equation" names "Bitwise NOT through XOR") and the
// course's structural words. Plural forms are cut before the check, so 'clas' is "class".
export const STOP = new Set(`the and for are but not you your they them their there then than this that these those with from into onto
  what when where which who why how does did has have had was were will would should could can may might its also any all some each
  about over under after before between just only very much more most less such other our out off too one let
  exam problem question practice style through need work course clas essential want learn open show tell real help part
  module topic unit lecture`.split(/\s+/));

/** Content words: lowercase letters and digits, three or more, a plural's s cut, never a STOP word. */
export const words = text => new Set((String(text ?? '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) || [])
  .filter(w => w.length > 2).map(w => w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w).filter(w => !STOP.has(w)));

/** How many of `a`'s words `b` has (each a text or a word set). */
export function overlap(a, b) {
  const x = a instanceof Set ? a : words(a), y = b instanceof Set ? b : words(b);
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n;
}

/** A file or problem name from a past exam: a word starting prelim, midterm, practice, final, quiz or exam (never "example"). */
export const looksLikeExam = text => (String(text || '').toLowerCase().match(/[a-z]+/g) || []).some(w => /^(prelim|midterm|practice|final|quiz|exam(?!ple))/.test(w));

/** A unit includes its descendants. */
export function expandTopics(view, topicIds) {
  const out = new Set(topicIds), queue = [...topicIds];
  while (queue.length) { const id = queue.shift(); for (const t of view.topics) if (t.parentTopicId === id && !out.has(t.topicId)) { out.add(t.topicId); queue.push(t.topicId); } }
  return [...out];
}
/** The unit (top-level topic) a topic is in. */
export function unitOf(view, topicId) {
  const byId = new Map(view.topics.map(t => [t.topicId, t]));
  let t = byId.get(topicId);
  while (t?.parentTopicId && byId.has(t.parentTopicId)) t = byId.get(t.parentTopicId);
  return t?.topicId ?? null;
}
export const unitRoots = view => view.topics.filter(t => !t.parentTopicId || !view.topics.some(p => p.topicId === t.parentTopicId));

/** The topic `about` names best: title words count double, then description and objectives; the narrower topic wins a tie. */
export function matchTopic(view, about) {
  const asked = words(about), hits = text => overlap(asked, text);
  const scored = view.topics.filter(t => t.status !== 'retired').map(t => [2 * hits(t.title) + hits(`${t.description || ''} ${view.objectives.filter(o => o.topicId === t.topicId).map(o => o.statement).join(' ')}`), expandTopics(view, [t.topicId]).length, t]);
  const [score, , topic] = scored.sort((a, b) => b[0] - a[0] || a[1] - b[1])[0] || [0];
  return score >= 2 ? topic : null;
}

/** The goal `about` names best: words shared with its title (and its topics' titles), at least half of what was said. */
export function matchGoal(view, goals, about, { topics = true } = {}) {
  const asked = words(about), title = id => view.topics.find(t => t.topicId === id)?.title || '';
  const [score, goal] = goals.map(g => [overlap(asked, `${g.title} ${topics ? g.topicIds.map(title).join(' ') : ''}`), g]).sort((a, b) => b[0] - a[0])[0] || [0, null];
  return asked.size && score >= Math.max(1, Math.ceil(asked.size / 2)) ? goal : null;
}
