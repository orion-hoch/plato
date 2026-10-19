import { hashOf } from '../core/util.mjs';
import { distinctTitles } from '../knowledge/build.mjs';

// Outline modules: deterministic and instant, from the published knowledge view. Every topic of the course tree is a
// node at its real depth (unit › topic › subtopic …); each node's key points from the notes are its concept nodes; the
// graph's typed edges stay on the topics they join. Astra rewrites the readable parts later (writer.mjs).

export const moduleIdOf = topicId => `mod_${topicId}`;
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
/** A concept's id is stable for its words: its topic plus a hash of its statement. */
export const conceptIdOf = (topicId, statement) => `con_${topicId}_${hashOf(norm(statement)).slice(-8)}`;
export const topicOfConcept = id => String(id).slice(4, -9);
/** A short source ref for an anchor: six characters of its id (anc_M7wMm0… → M7wMm0), resolved by prefix. */
export const refOf = anchorId => String(anchorId).replace(/^anc_/, '').slice(0, 6);
export const clip = (text, max) => { const t = String(text || '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
/** "08 Arrays and Pointers.md" → "Lecture 8: Arrays and Pointers". ponytail: a leading number means a lecture; other files keep their name. */
export const lectureOf = filename => { const name = String(filename || '').replace(/\.[a-z\d]{1,5}$/i, '').trim(); const m = /^(\d{1,3})[\s._-]+(.+)$/.exec(name); return m ? `Lecture ${Number(m[1])}: ${m[2]}` : name || 'their notes'; };
export const RELATIONS = ['prerequisite', 'application_of', 'supports', 'contrasts_with', 'related'];
const lower = s => s ? s[0].toLowerCase() + s.slice(1) : s;
const KEEP = new Set(['source_statement', 'derived_explanation', 'implication', 'connection']);

/** A concept from the notes: its statement, the lecture and source ref of its first anchor. */
export const conceptOf = (topicId, { statement, anchorIds, terms = [], links = [] }, info) =>
  ({ id: conceptIdOf(topicId, statement), statement, lecture: info.get(anchorIds[0])?.lecture ?? null, sourceRef: refOf(anchorIds[0]), anchorIds, terms, links });

/**
 * Every node for a view, in course order: `anchorInfo(ids)` → Map anchorId → { lecture, excerpt }; `examDay` like "Oct 15".
 * Returns nodes without live fields (questions, mastery, items); each carries its unit's `inputHash`, so Astra's text
 * survives a rebuild that left the unit alone.
 */
export function outlineModules({ view, anchorInfo, examDay = null }) {
  const live = view.topics.filter(t => t.status !== 'retired');
  const byId = new Map(live.map(t => [t.topicId, t]));
  const titles = distinctTitles(live.map(t => ({ key: t.topicId, title: t.title, parentKey: t.parentTopicId })));
  const title = id => titles.get(id) || byId.get(id)?.title || id;
  const parentOf = t => t.parentTopicId && byId.has(t.parentTopicId) ? t.parentTopicId : null;
  const kids = new Map(); for (const t of live) if (parentOf(t)) (kids.get(parentOf(t)) || kids.set(parentOf(t), []).get(parentOf(t))).push(t);
  // Course order is the tree, the way the notes run.
  const order = [], depth = new Map(), unitOf = new Map();
  const walk = (t, d, unit) => { order.push(t); depth.set(t.topicId, d); unitOf.set(t.topicId, unit); for (const c of kids.get(t.topicId) || []) walk(c, d + 1, unit); };
  for (const r of live.filter(t => !parentOf(t))) walk(r, 0, r.topicId);
  const subtree = id => [id, ...(kids.get(id) || []).flatMap(c => subtree(c.topicId))];
  const objectives = id => view.objectives.filter(o => o.topicId === id);
  const links = new Map(); for (const l of view.evidenceLinks) (links.get(l.topicId) || links.set(l.topicId, []).get(l.topicId)).push(l);
  const anchorsOf = id => [...new Set((links.get(id) || []).map(l => l.sourceAnchorId))];
  const claims = view.interpretations.flatMap(i => i.claims || []);
  const info = anchorInfo([...new Set(view.evidenceLinks.map(l => l.sourceAnchorId).concat(claims.flatMap(c => c.evidence.map(e => e.id))))]);
  const by = goal => goal && `By ${examDay || 'the exam'}: ${lower(goal)}`;

  /** Claims citing this topic's anchors, the most anchored first: the course's own statements as concepts. */
  function conceptsOf(id, max) {
    const mine = new Set(anchorsOf(id));
    const scored = claims.filter(c => KEEP.has(c.kind)).map(c => ({ c, hits: c.evidence.filter(e => mine.has(e.id)).length })).filter(x => x.hits)
      .sort((a, b) => b.hits - a.hits || Number(b.c.kind === 'source_statement') - Number(a.c.kind === 'source_statement'));
    const seen = new Set(), out = [];
    for (const { c } of scored) {
      const anchorIds = c.evidence.map(e => e.id).filter(a => info.has(a));
      if (seen.has(c.text) || out.length >= max || !anchorIds.length) continue;
      seen.add(c.text);
      out.push(conceptOf(id, { statement: clip(c.text, 400), anchorIds }, info));
    }
    if (out.length) return out;
    // No claims: the defining excerpts, as the notes say them.
    const rank = { defines: 0, explains: 1, assesses: 2, exemplifies: 3 };
    return (links.get(id) || []).sort((a, b) => (rank[a.relation] ?? 9) - (rank[b.relation] ?? 9)).map(l => l.sourceAnchorId).filter((a, i, all) => all.indexOf(a) === i && info.get(a)?.excerpt)
      .slice(0, 3).map(a => conceptOf(id, { statement: clip(info.get(a).excerpt.replace(/^#+\s.*\n/, ''), 300), anchorIds: [a] }, info));
  }

  /** The course's own worked example: an example claim on the topic, else an excerpt it exemplifies that holds code or numbers. */
  function exampleOf(id) {
    const mine = new Set(anchorsOf(id));
    const claim = claims.find(c => c.kind === 'example' && c.evidence.some(e => mine.has(e.id)));
    if (claim) { const anchorIds = claim.evidence.map(e => e.id).filter(a => info.has(a)); return { title: `${title(id)}, from the notes`, markdown: clip(claim.text, 900), lecture: info.get(anchorIds[0])?.lecture ?? null, sourceRef: refOf(anchorIds[0]), anchorIds }; }
    const a = (links.get(id) || []).filter(l => l.relation === 'exemplifies').map(l => l.sourceAnchorId).find(x => /`|\d/.test(info.get(x)?.excerpt || ''));
    return a ? { title: `${title(id)}, from the notes`, markdown: info.get(a).excerpt.slice(0, 900), lecture: info.get(a).lecture, sourceRef: refOf(a), anchorIds: [a] } : null;
  }

  // The graph's typed edges, kept on both topics with their relation and explanation: out from `from`, in at `to`.
  const typed = new Map();
  for (const e of view.edges) {
    if (!RELATIONS.includes(e.type) || !byId.has(e.fromTopicId) || !byId.has(e.toTopicId) || e.fromTopicId === e.toTopicId) continue;
    const link = (at, to, dir) => (typed.get(at) || typed.set(at, []).get(at)).push({ to: moduleIdOf(to), relation: e.type, dir, why: clip(e.explanation, 300), grounded: e.support === 'grounded' });
    link(e.fromTopicId, e.toTopicId, 'out'); link(e.toTopicId, e.fromTopicId, 'in');
  }
  // A contrast in the notes is the confusion to head off.
  const misconceptionsOf = id => view.edges.filter(e => e.type === 'contrasts_with' && (e.fromTopicId === id || e.toTopicId === id) && byId.has(e.fromTopicId) && byId.has(e.toTopicId))
    .slice(0, 2).map(e => ({ text: `Mixing up ${title(e.fromTopicId)} and ${title(e.toTopicId)}.`, fix: clip(e.explanation, 300) }));
  const lecturesOf = ids => [...new Set(ids.flatMap(anchorsOf).map(a => info.get(a)?.lecture).filter(Boolean))].sort((a, b) => (Number(/\d+/.exec(a)?.[0]) || 0) - (Number(/\d+/.exec(b)?.[0]) || 0));

  // What each unit is built from: Astra's text for it stands while this is unchanged.
  const hashes = new Map(live.filter(t => !parentOf(t)).map(u => { const ids = subtree(u.topicId); return [u.topicId, hashOf({ ids, topics: ids.map(id => [byId.get(id).title, byId.get(id).description, byId.get(id).parentTopicId]), objectives: ids.flatMap(objectives).map(o => o.statement), anchors: ids.flatMap(anchorsOf) })]; }));
  return order.map(t => {
    const id = t.topicId, d = depth.get(id), unit = unitOf.get(id), own = objectives(id);
    const goals = d === 0 ? [...own, ...(kids.get(id) || []).map(c => objectives(c.topicId)[0]).filter(Boolean)].slice(0, 4) : own.slice(0, 1);
    return {
      id: moduleIdOf(id), kind: d === 0 ? 'unit' : d === 1 ? 'topic' : 'subtopic', topicId: id, unitId: moduleIdOf(unit),
      parentId: parentOf(t) ? moduleIdOf(parentOf(t)) : null, children: (kids.get(id) || []).map(c => moduleIdOf(c.topicId)), depth: d,
      title: title(id), summary: clip(t.description || own[0]?.statement || '', 400),
      concepts: conceptsOf(id, d === 0 ? 3 : 5), example: d === 0 && kids.get(id)?.length ? null : exampleOf(id), misconceptions: misconceptionsOf(id),
      goals: { now: own.map(o => clip(o.statement, 240)), exam: goals.map(o => by(clip(o.statement, 220))) },
      links: typed.get(id) || [], lectures: lecturesOf(d === 0 ? subtree(id) : [id]), source: 'outline', inputHash: hashes.get(unit),
    };
  });
}
