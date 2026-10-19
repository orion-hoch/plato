import { newId, safe } from '../core/util.mjs';
import { expandTopics, unitOf, unitRoots, matchTopic, matchGoal } from '../core/match.mjs';
import { startAgenda, act, currentGoal, finished, listed, INTRO_MODES, rankOf, modeFor, doneWhenOf, approachOf } from './agenda.mjs';
import { shown } from '../learner/model.mjs';

// The session's goals: the agenda built at start (the intro until it is done), its moves and notes, and the agenda
// internals the teaching engine uses. Goals are chosen by need (spec §11), never by a schedule: with a course model, a goal
// is one KC (the spine and threshold ideas first, ranked by the learner model's priority formula) with the reason stated
// to the learner; without one, a topic of the knowledge graph.

// What the intro's first goal learns about the student, in plain words, in the order asked.
// The intro asks two things, then teaching starts (the user, 10 Oct: four asks and a diagnostic block were too slow): what they
// aim for (the exam and its date) and where they are in the lectures. How they like to learn, their background and what they
// find hard are asked later, in the background, at a natural pause (LATER_ASKS), never as a gate.
const INTRO_ASKS = { goal: 'what they are aiming for (the exam and its date)', lectures: 'where they are in the lectures' };
const LATER_ASKS = { teaching_balance: 'how they like to learn (explanations first or trying first)', background: 'their background', help_wanted: 'what they find hard' };
// The reason a target is chosen, said to the learner in one clause (the biggest term of the priority formula, spec §11).
const WALK_WHY = 'it comes next in your lectures';
const REASONS = { gap: 'your answers so far suggest it is still shaky', sigma: "I don't know yet where you stand on it", due: "it's due for a check, so it sticks", wrongModel: 'a couple of your answers suggest a mix-up here', ready: 'you have what it builds on' };

export function installGoals(K) {
  const { app, db, clock, config, knowledge, learner, questions, fresh, saveSession, scopeOf, serverEvent, txn } = K;

  let ticker = null;

  /** A new session starts each goal afresh (a goal carried over keeps no per-session state). */
  const afresh = agenda => agenda && { ...agenda, goals: agenda.goals.map(({ step, lessonId, ...g }) => g) };

  // ---------- the student: what they said, and whether the intro is done ----------

  const saidFacts = scope => (safe(() => learner().profile(scope).snapshot?.facts, []) || []).filter(f => f.status === 'active' && f.origin === 'explicit_user');
  const saidOf = (facts, key) => facts.find(f => key === 'goal' ? f.kind === 'goal' && f.key !== 'focus_section' : f.key === key);
  /** How they like to learn and what they said about themselves: { approach, said: [{ about, words }] }. */
  function student(scope) {
    const facts = saidFacts(scope), text = key => { const v = saidOf(facts, key)?.value; return typeof v === 'string' ? v : null; };
    return {
      approach: approachOf(text('teaching_balance')) ?? approachOf(text('help_wanted')) ?? 'balanced',
      said: facts.filter(f => ['preference', 'goal'].includes(f.kind) && typeof f.value === 'string').map(f => ({ about: f.kind === 'goal' ? 'goal' : f.key, words: f.value })),
    };
  }
  // The intro is done once per exam: on the exam record, written without a row version bump (the page's exam edits CAS on it).
  // Done, and they said where they are in the lectures (else the walk has no start: the intro asks that once more).
  const introDone = scope => { const e = db.get('exams', scope.examId); return !!e?.introDoneAt && !!(e.lectureFrom || e.walkAt); };
  const markIntroDone = scope => db.prepare("UPDATE exams SET data = json_set(data, '$.introDoneAt', ?) WHERE id = ? AND json_extract(data, '$.introDoneAt') IS NULL").run(clock.iso(), scope.examId);

  // ---------- the course model, when one is built (interface A) ----------

  const courseModel = scope => globalThis.process?.env?.PLATO_COURSE_MODEL === 'off' ? null : safe(() => app.services.understanding?.courseModel?.(scope) ?? null, null); // off: evals' ablation
  /** Each KC with its leverage (spec §11: 1 + threshold + spine weight + 0.1·dependents), for the learner's priority formula. */
  function candidates(cm) {
    const dependents = new Map(), spineOf = new Map(), threshold = new Set();
    for (const k of cm.kcs) for (const p of k.prerequisites || []) dependents.set(p, (dependents.get(p) || 0) + 1);
    for (const sp of cm.spine || []) for (const id of sp.kcs || []) { spineOf.set(id, sp.id); if (sp.threshold) threshold.add(id); }
    for (const t of cm.topics || []) if (t.threshold?.is) for (const k of cm.kcs.filter(x => x.topicId === t.topicId)) threshold.add(k.id);
    return cm.kcs.map(k => ({ kc: k.id, topicId: k.topicId, kind: k.kind, prerequisites: k.prerequisites || [], threshold: threshold.has(k.id), spine: spineOf.get(k.id) ?? null,
      leverage: 1 + (threshold.has(k.id) ? 1 : 0) + (spineOf.has(k.id) ? 1 : 0) + 0.1 * (dependents.get(k.id) || 0) }));
  }
  /** One clause saying why a target was chosen: what rests on it, then what the learner's evidence says. */
  function reasonOf(c) {
    const why = REASONS[c.reason] ?? (c.parts && REASONS[Object.entries(c.parts).filter(([k]) => REASONS[k]).sort((a, b) => b[1] - a[1])[0]?.[0]]) ?? null;
    const rests = c.threshold ? 'a lot of the course rests on it' : c.spine ? 'it is one of the big ideas of the course' : null;
    return [rests, why].filter(Boolean).join(', and ') || 'it is the next thing to understand';
  }

  // ---------- the session agenda: the intro, then goals by need ----------

  /** What get_to_know still has to learn (INTRO_ASKS keys): how they learn, their background, what they find hard, their goal. */
  function introUnknown(scope) {
    const facts = saidFacts(scope);
    return Object.keys(INTRO_ASKS).filter(k => k === 'lectures' ? !db.get('exams', scope.examId)?.lectureFrom : !saidOf(facts, k));
  }
  /** Where they said they are in the lectures (the intro), as the course section the agenda starts from. */
  const setLectureFrom = (sessionId, topicId) => { const scope = scopeOf(fresh(sessionId)); db.prepare("UPDATE exams SET data = json_remove(json_set(data, '$.lectureFrom', ?), '$.walkAt') WHERE id = ?").run(topicId ?? 'start', scope.examId); }; // what they say restarts the walk there

  const readyBasics = (scope, manifestId) => safe(() => questions().available(scope, { knowledgeManifestId: manifestId }), []).filter(q => q.format !== 'exam' && q.intendedDifficulty === 'basic_diagnostic' && !q.exposed && q.dependencyCompatible);

  /** Without a course model, the intro's quick check: up to 5 units spread over the course; per stretch, the biggest not yet assessed with a ready basic question. */
  function diagnoseUnits(scope, view) {
    const ready = readyBasics(scope, view.manifest.id), ranks = K.projectionsOf(scope);
    const pool = unitRoots(view).map(u => ({ u, ids: expandTopics(view, [u.topicId]) })).filter(x => ready.some(q => x.ids.includes(q.topicId)));
    const k = Math.min(5, pool.length);
    return Array.from({ length: k }, (_, i) => pool.slice(Math.round(i * pool.length / k), Math.round((i + 1) * pool.length / k))
      .map(x => [x.ids.length - (x.ids.some(id => rankOf(ranks.get(id))) ? 100 : 0), x.u]).sort((a, b) => b[0] - a[0])[0][1]);
  }

  /**
   * The intro: a greeting and at most two questions (their aim, where they are in the lectures), then teaching. No separate
   * diagnostic block: each section opens with one quick check that doubles as diagnosis. What else is worth knowing goes on in
   * the background, asked at a natural pause.
   */
  function introGoals(scope, view, prior) {
    const unknown = introUnknown(scope), later = Object.keys(LATER_ASKS).filter(k => !saidOf(saidFacts(scope), k));
    // A finished intro carries over only when nothing it asks is still unknown (12 Oct: one finished before "where are you in the
    // lectures" existed carried over, and the session skipped the intro and started at lecture 1).
    const goal = (mode, title, doneWhen, topicIds = []) => (!unknown.length && prior?.goals.find(g => g.mode === mode && finished(g) && !g.background)) || { id: newId('goal'), title, topicIds, objectiveVersionIds: [], mode, doneWhen, state: 'pending' };
    const know = goal('get_to_know', 'Get to know you', `you know ${listed((unknown.length ? unknown : ['goal']).map(k => INTRO_ASKS[k]))}.`);
    return [
      unknown.length || finished(know) ? know : { ...know, state: 'done', doneAt: clock.iso(), note: 'Known already.' },
      ...(later.length ? [{ id: newId('goal'), title: 'How you like to learn', topicIds: [], objectiveVersionIds: [], mode: 'get_to_know', doneWhen: `you know ${listed(later.map(k => LATER_ASKS[k]))}.`, state: 'pending', background: true }] : []),
    ];
  }
  /** A goal on a topic: its assessable subtopics, mode from their weakest mastery and how they like to learn; `why` it is chosen. */
  function topicGoal(scope, view, topic, { title = topic.title, why = null } = {}) {
    const ids = expandTopics(view, [topic.topicId]).filter(id => view.topics.find(t => t.topicId === id)?.objectiveVersionIds.length);
    const ranks = K.projectionsOf(scope), rank = ids.length ? Math.min(...ids.map(id => rankOf(ranks.get(id)))) : 0;
    return {
      id: newId('goal'), title: title.slice(0, 60), topicIds: ids.length ? ids : [topic.topicId], objectiveVersionIds: view.objectives.filter(o => ids.includes(o.topicId)).map(o => o.id),
      mode: modeFor(student(scope).approach, rank), doneWhen: doneWhenOf(view.objectives.find(o => ids.includes(o.topicId))?.statement), why, state: 'pending',
    };
  }
  /** A goal on one KC (spec §11–12): its statement is the understanding target, tested unaided at the end of the arc. */
  function kcGoal(scope, view, cm, entry) {
    const kc = cm.kcs.find(k => k.id === entry.kcId), topic = view.topics.find(t => t.topicId === kc.topicId);
    const first = String(kc.statement || '').split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, ''), title = first.length <= 60 ? first : `${first.slice(0, first.lastIndexOf(' ', 58))}…`;
    return {
      id: newId('goal'), title: title || topic?.title || 'The next idea', topicIds: [kc.topicId], kcIds: [kc.id], objectiveVersionIds: view.objectives.filter(o => o.topicId === kc.topicId).map(o => o.id),
      mode: modeFor(student(scope).approach, 0), doneWhen: `they can show it unaided, on a case they haven't seen: ${first}.`, why: entry.why, spine: entry.spine ?? null, state: 'pending',
    };
  }

  /**
   * The course's topic graph for choosing by need without a course model: the assessable topics (`leaves`), each one's
   * prerequisites from the graph's prerequisite edges, carried down to the assessable subtopics, and the dependency order
   * (prerequisites first, ties in course order; a cycle breaks in course order). ponytail: O(n²), fine for ~100 topics.
   */
  function graphOf(scope, view) {
    const leaves = new Set(view.topics.filter(t => t.status !== 'retired' && t.objectiveVersionIds.length).map(t => t.topicId));
    const down = id => expandTopics(view, [id]).filter(x => leaves.has(x)), pre = new Map();
    const add = (from, to) => { for (const b of down(to)) for (const a of down(from)) if (a !== b) (pre.get(b) || pre.set(b, new Set()).get(b)).add(a); };
    for (const e of view.edges || []) if (e.type === 'prerequisite') add(e.fromTopicId, e.toTopicId);
    const course = [], walk = t => { course.push(t.topicId); for (const c of view.topics) if (c.parentTopicId === t.topicId) walk(c); };
    view.topics.filter(t => !t.parentTopicId || !view.topics.some(p => p.topicId === t.parentTopicId)).forEach(walk);
    const left = new Set(course.filter(id => leaves.has(id))), order = [];
    while (left.size) {
      const id = [...left].find(x => ![...(pre.get(x) || [])].some(p => left.has(p))) ?? left.values().next().value;
      order.push(id); left.delete(id);
    }
    return { leaves, pre, order, course };
  }
  /**
   * The course in lecture and section order (the course tree's walk; the user, 10 Oct): from where they said they are in the
   * lectures, else the first section not yet shown known; the earlier sections after the last (prerequisites come in sooner only
   * when a check shows them missing, as a detour). With a course model, each section's KCs in the model's order; a mastered one
   * or one covered (`except`) is passed. Gives [{ topicId, kcId?, why, prereq: false }], like `needs`.
   */
  function inOrder(scope, view, except = new Set()) {
    const cm = courseModel(scope), { leaves, course } = graphOf(scope, view), exam = db.get('exams', scope.examId), at = exam?.walkAt ?? exam?.lectureFrom ?? null;
    // Where they are may be a unit with no objectives of its own (not a section): its first section, the next one in course order.
    const sections = course.filter(id => leaves.has(id) || cm?.kcs?.some(k => k.topicId === id)), from = course.indexOf(at), i = Math.max(0, sections.findIndex(id => course.indexOf(id) >= from)), walk = [...sections.slice(i), ...sections.slice(0, i)];
    const est = safe(() => learner().estimates(scope).topics, new Map()) || new Map(), understood = id => { const e = est.get(id); return e?.source === 'observed' && shown(e).ordinal === 'secure'; };
    const met = cm?.kcs?.length ? safe(() => learner().mastered(scope, cm.kcs.map(k => k.id)), new Set()) : new Set(), mastered = id => met.has(id);
    // One entry per section (guide mode, 12 Oct: a section is taught from its guide, the tutor choosing how), the section alone,
    // never its subtree: a unit's own introduction comes first, then its sections. A section is passed when it was covered
    // (`except`) or every idea of it is mastered (with no course model yet: shown secure).
    return walk.filter(t => {
      if (except.has(t) || except.has(`kc:${t}`)) return false;
      const kcs = cm?.kcs?.filter(k => k.topicId === t) || [];
      return kcs.length ? !kcs.every(k => mastered(k.id)) : leaves.has(t) && !understood(t);
    }).map(t => ({ topicId: t, prereq: false, why: WALK_WHY, section: true }));
  }
  /** A goal on the lecture walk is done: the walk resumes there next session (a KC's section, for its other KCs), or after a notes section. */
  function walked(scope, view, goal) {
    if (goal?.why !== WALK_WHY || !goal.topicIds?.length) return;
    const { leaves, course } = graphOf(scope, view), cm = courseModel(scope), last = goal.topicIds.at(-1);
    const sections = course.filter(id => leaves.has(id) || cm?.kcs?.some(k => k.topicId === id)), next = goal.kcIds?.length ? last : sections[sections.indexOf(last) + 1] ?? sections[0];
    if (next) db.prepare("UPDATE exams SET data = json_set(data, '$.walkAt', ?) WHERE id = ?").run(next, scope.examId);
  }
  /** The sections before and after a section in the lecture walk: { prev, next } as { topicId, title } | null. */
  function neighbours(scope, view, topicId) {
    const { leaves, course } = graphOf(scope, view), cm = courseModel(scope), sections = course.filter(id => leaves.has(id) || cm?.kcs?.some(k => k.topicId === id)), i = sections.indexOf(topicId);
    const of = id => { const t = id && view.topics.find(x => x.topicId === id); return t ? { topicId: t.topicId, title: t.title } : null; };
    return { prev: i > 0 ? of(sections[i - 1]) : null, next: i >= 0 ? of(sections[i + 1]) : null };
  }
  /**
   * What they need, most needed first (spec §11). `toward`: topic ids they are working toward; `except`: KC or topic ids
   * on the agenda or just worked on. With a course model, KCs: those of what they are working toward and their
   * prerequisites first, every other KC after, each list ranked by learner.priorities (leverage · gap · ready + σ + due +
   * open wrong models − recency); a KC already mastered is left out. Without one, topics by the graph: the weakest
   * unmet prerequisite of what they are working toward, then those topics, then the rest in dependency order.
   * Gives [{ topicId, kcId?, why, prereq }].
   */
  function needs(scope, view, toward = [], except = new Set()) {
    const cm = courseModel(scope);
    if (cm?.kcs?.length) {
      const all = candidates(cm).filter(c => !except.has(c.kc) && !except.has(`kc:${c.topicId}`)), want = new Set(expandTopics(view, toward));
      const below = new Set(), stack = all.filter(c => want.has(c.topicId)).map(c => c.kc);
      while (stack.length) for (const p of all.find(c => c.kc === stack.pop())?.prerequisites || []) if (!below.has(p)) { below.add(p); stack.push(p); }
      const rank = list => { const ranked = list.length ? safe(() => learner().priorities(scope, list), null) : []; return Array.isArray(ranked) ? ranked.map(r => ({ ...list.find(c => c.kc === (r.kc ?? r.kcId ?? r)), ...r })) : [...list].sort((a, b) => b.leverage - a.leverage); };
      const met = safe(() => learner().mastered(scope, all.map(c => c.kc)), new Set()), mastered = c => met.has(c.kc);
      const first = rank(all.filter(c => want.has(c.topicId) || below.has(c.kc))), rest = rank(all.filter(c => !want.has(c.topicId) && !below.has(c.kc)));
      // A KC whose wrong model was left open (suspected or confirmed) is the first target: the repair a session couldn't finish.
      const open = c => safe(() => (learner().state(scope, c.kc)?.operative || []).some(o => ['suspected', 'confirmed'].includes(o.status) && o.p >= 0.3), false);
      const ranked = [...first, ...rest].filter(c => c.kc && !mastered(c)), lead = ranked.slice(0, 30).filter(open); // open models among the likeliest only: state() per KC is ~20 ms
      return [...lead.map(c => ({ ...c, reason: 'wrongModel' })), ...ranked.filter(c => !lead.includes(c))].map(c => ({ topicId: c.topicId, kcId: c.kc, spine: c.spine, prereq: below.has(c.kc), why: reasonOf(c) }));
    }
    const { leaves, pre, order } = graphOf(scope, view), est = safe(() => learner().estimates(scope).topics, new Map()) || new Map();
    const theta = id => est.get(id)?.theta ?? 0, understood = id => { const e = est.get(id); return e?.source === 'observed' && shown(e).ordinal === 'secure'; };
    const want = new Set(expandTopics(view, toward).filter(id => leaves.has(id))), below = new Set(), stack = [...want];
    while (stack.length) for (const p of pre.get(stack.pop()) || []) if (!below.has(p) && !want.has(p)) { below.add(p); stack.push(p); }
    const need = id => !except.has(id) && !understood(id), name = id => view.topics.find(t => t.topicId === id)?.title;
    const aim = listed([...new Set(toward.map(name).filter(Boolean))].slice(0, 3));
    return [
      ...order.filter(id => below.has(id) && need(id)).sort((a, b) => theta(a) - theta(b)).map(id => ({ topicId: id, prereq: true, why: `it is what ${aim} builds on, and you haven't shown it yet` })),
      ...order.filter(id => want.has(id) && need(id)).map(id => ({ topicId: id, prereq: false, why: "it is what you are working toward, and you haven't shown it yet" })),
      ...order.filter(id => !below.has(id) && !want.has(id) && need(id)).map(id => ({ topicId: id, prereq: false, why: "it comes next in the course, and you haven't shown it yet" })),
    ];
  }
  /** A goal on one section of the walk, the section alone (never its subtree: its sections are goals of their own). */
  function sectionGoal(scope, view, n) {
    const topic = view.topics.find(t => t.topicId === n.topicId);
    return { id: newId('goal'), title: (topic?.title || 'The next section').slice(0, 60), topicIds: [n.topicId], objectiveVersionIds: view.objectives.filter(o => o.topicId === n.topicId).map(o => o.id),
      mode: 'teach', doneWhen: doneWhenOf(view.objectives.find(o => o.topicId === n.topicId)?.statement), why: n.why, state: 'pending' };
  }
  const needGoal = (scope, view, n) => { if (n.section) return sectionGoal(scope, view, n); const cm = n.kcId && courseModel(scope); return cm ? kcGoal(scope, view, cm, n) : topicGoal(scope, view, view.topics.find(t => t.topicId === n.topicId), { why: n.why }); };
  /** What a goal covers, for `except`: its KCs, else its topics. */
  const covered = g => g.kcIds?.length ? g.kcIds : g.topicIds;
  /** What they said they are aiming for or find hard, when it names a topic: what they are working toward. */
  const statedTopics = (scope, view) => { const facts = saidFacts(scope); return [...new Set(['goal', 'help_wanted'].map(k => saidOf(facts, k)?.value).filter(v => typeof v === 'string').map(v => matchTopic(view, v)?.topicId).filter(Boolean))]; };

  /**
   * The session's agenda, built without a model call: the intro until it is done; otherwise one goal with the next ready,
   * chosen by need: the topic they pressed (or their active focus) first (the learner's request always wins); else a goal
   * left unfinished last time and still needed, after the weakest prerequisite of it; else what they need (`needs`).
   * What was finished last time waits.
   */
  function buildAgenda(scope, view, topicId = null) {
    // "Last time" is the newest session they spoke in: the page starts one on every load and topic press.
    const last = JSON.parse(db.prepare('SELECT data FROM sessions WHERE exam_id = ? AND id IN (SELECT session_id FROM finalized_responses WHERE exam_id = ?) ORDER BY rowid DESC LIMIT 1').get(scope.examId, scope.examId)?.data || 'null')?.agenda;
    const topic = topicId && view.topics.find(t => t.topicId === topicId), pressed = topic ? topicGoal(scope, view, topic, { why: 'you chose it' }) : null;
    const beside = g => !(pressed && g.topicIds.length && g.topicIds.every(id => pressed.topicIds.includes(id))); // not already the pressed topic
    // Their topic is real work, so the intro yields: get_to_know goes on in the background (asked at natural pauses).
    const yields = g => pressed && g.mode === 'get_to_know' && !finished(g) ? { ...g, background: true } : g;
    if (!introDone(scope)) return startAgenda({ intro: true, goals: [...(pressed ? [pressed] : []), ...introGoals(scope, view, last?.intro ? last : null).filter(beside).map(yields)], now: clock.now() });
    const unfinished = (last?.goals || []).find(g => !finished(g) && !INTRO_MODES.has(g.mode) && beside(g));
    const except = new Set([...(last?.goals || []).filter(finished).flatMap(covered), ...(pressed?.topicIds || []).map(id => `kc:${id}`), ...(pressed?.topicIds || [])]);
    let list = pressed ? needs(scope, view, pressed.topicIds, except) : inOrder(scope, view, except);
    // A goal left over stays while it is still needed (one in their own words, with no topics, always is).
    const still = g => !g.topicIds.length || list.some(n => (g.kcIds?.length ? g.kcIds.includes(n.kcId) : g.topicIds.includes(n.topicId)));
    const carried = unfinished && still(unfinished) ? unfinished : null;

    const weak = list.find(n => n.prereq), goals = pressed ? [pressed] : carried ? (weak ? [needGoal(scope, view, weak), carried] : [carried]) : [];
    for (const n of list) { if (goals.length >= 2) break; if (!goals.some(g => n.kcId ? g.kcIds?.includes(n.kcId) : g.topicIds.includes(n.topicId))) goals.push(needGoal(scope, view, n)); }
    return goals.length ? startAgenda({ intro: false, goals, now: clock.now() }) : null;
  }

  /**
   * The topics of a series request, or null: several topics named ("pointers and arrays"), or equations, formulas,
   * everything or an overview over a unit it names, else the course. At most six, in course order, one per unit for a
   * course-wide one. ponytail: equations are found by their objectives' words (calculate, convert, …).
   */
  function seriesTopics(view, about) {
    const named = [...new Set(about.split(/,|&|\+|\/|\band\b/i).map(part => matchTopic(view, part)?.topicId).filter(Boolean))];
    if (named.length > 1) return named.slice(0, 6);
    const kind = /\b(equation|formula)s?\b/i.test(about) ? 'math' : /\b(everything|overview)\b/i.test(about) ? 'all' : null;
    if (!kind) return null;
    const unit = named[0] && !/\b(prelim|exam|course|class|test|midterm|final)\b/i.test(about) ? named[0] : null;
    const text = t => `${t.title} ${t.description || ''} ${view.objectives.filter(o => o.topicId === t.topicId).map(o => o.statement).join(' ')}`;
    const MATH = /\b(calculat\w*|compute[sd]?|computing|evaluat\w*|convert\w*|formulas?|equations?|arithmetic)\b/i;
    let pool = (unit ? expandTopics(view, [unit]) : view.topics.map(t => t.topicId)).map(id => view.topics.find(t => t.topicId === id))
      .filter(t => t && t.status !== 'retired' && t.objectiveVersionIds.length && (kind === 'all' || MATH.test(text(t))));
    const units = new Set();
    if (!unit) pool = kind === 'all' ? unitRoots(view) : pool.filter(t => { const u = unitOf(view, t.topicId); return !units.has(u) && !!units.add(u); });
    return pool.length > 1 ? pool.slice(0, 6).map(t => t.topicId) : null;
  }

  /** A goal for `about` (they asked for it): the topics of a series, else the topic it names (mode from mastery), else their own words. */
  function newGoal(s, view, about) {
    const scope = scopeOf(s);
    const series = seriesTopics(view, about), name = id => view.topics.find(t => t.topicId === id)?.title;
    if (series) return { id: newId('goal'), title: `${about[0].toUpperCase()}${about.slice(1)}`.slice(0, 60), topicIds: series, objectiveVersionIds: view.objectives.filter(o => series.includes(o.topicId)).map(o => o.id), mode: 'teach', doneWhen: `they have worked through ${listed(series.map(name))}, one at a time.`, why: 'you asked for it', state: 'pending' };
    const topic = matchTopic(view, about), title = `${about[0].toUpperCase()}${about.slice(1)}`;
    return topic ? topicGoal(scope, view, topic, { why: 'you asked for it' }) // the section's own title, never their sentence
      : { id: newId('goal'), title: title.slice(0, 60), topicIds: [], objectiveVersionIds: [], mode: modeFor(student(scope).approach, 0), doneWhen: `they feel sure about ${about}.`, why: 'you asked for it', state: 'pending' };
  }

  /** One agenda step: the intro is done once its last goal is, and the client hears. `tag` marks a change Plato did not make. */
  function moveAgenda(s, body, tag = null) {
    const scope = scopeOf(s), step = act(s.agenda, body, clock.now());
    if (!step.moved) return step;
    const next = saveSession({ ...s, agenda: step.agenda });
    if (step.introDone) markIntroDone(scope);
    agendaUpdated(next, tag && `${tag} ${step.say}`);
    return step;
  }

  // At most one agenda note per 10 s. One that comes sooner is held, merged with any after it, and sent by the ticker.
  const NOTE_GAP_MS = 10_000;
  /** agenda.updated, with `note` (a change Plato did not make) when one is due; returns the session. */
  function agendaUpdated(s, note = null) {
    const held = (note?.startsWith('[Goal met]') ? note : [s.heldNote, note].filter(Boolean).join(' ')) || null, due = !!held && clock.now() - (s.noteSentAt ?? 0) >= NOTE_GAP_MS;
    const next = held ? saveSession({ ...s, heldNote: due ? null : held, noteSentAt: due ? clock.now() : s.noteSentAt ?? null }) : s;
    serverEvent(next, 'agenda.updated', due ? { agenda: next.agenda, note: held } : { agenda: next.agenda });
    return next;
  }

  // ---------- the ticker: held notes ----------

  async function tick() {
    for (const s of db.find('sessions', { status: 'active' })) if (s.heldNote && clock.now() - (s.noteSentAt ?? 0) >= NOTE_GAP_MS) safe(() => txn(() => agendaUpdated(fresh(s.id))));
  }
  function ensureTicker() {
    if (ticker || !(config.sessionTickMs > 0)) return;
    ticker = setInterval(() => { void tick().catch(() => {}); }, config.sessionTickMs);
    ticker.unref?.();
  }

  // ---------- the engine's agenda internals (never routed) ----------

  /** A goal met on evidence (the engine): done, with a "[Goal met]" note; null unless it was the current goal. */
  const advance = (sessionId, goalId, note) => txn(() => {
    const cur = fresh(sessionId), goal = currentGoal(cur.agenda), step = goal?.id === goalId ? moveAgenda(cur, { action: 'done', goalId, note }, '[Goal met]') : null;
    if (step?.moved) safe(() => walked(scopeOf(cur), knowledge().view(scopeOf(cur), cur.pinnedKnowledgeManifestId), goal));
    return step?.moved ? step : null;
  });
  // The actor's change_topic: an open agenda goal its words name becomes current (focus), else a new goal for them (add).
  // Only a real place in the course moves the session (12 Oct: "bring me what to read" and "start from the beginning" became goals
  // of their own words, which matched the arrays lecture and XNOR). "From the beginning" restarts the walk at the first section.
  const BEGINNING = /\b(the )?(very )?(beginning|start over|from scratch|first lecture|lecture (1|one)|square one)\b/i;
  const changeTopic = (sessionId, to) => txn(() => {
    const cur = fresh(sessionId), scope = scopeOf(cur), view = knowledge().view(scope, cur.pinnedKnowledgeManifestId);
    if (BEGINNING.test(to)) {
      setLectureFrom(sessionId, 'start');
      const [first] = inOrder(scope, view, new Set());
      if (!first) return { say: 'Nothing left to teach in their course.', moved: false };
      const step = moveAgenda(fresh(sessionId), { action: 'add', goal: needGoal(scope, view, first) });
      return { say: step.say, moved: !!step.moved };
    }
    // "Lecture 6": the walk restarts at the unit that lecture begins (the outline's lectures), as the intro does.
    const n = Number(/\b(?:lecture|lec)\s*(\d{1,3})\b/i.exec(to)?.[1]);
    if (n) {
      const num = l => Number(/\d+/.exec(l)?.[0]), units = safe(() => app.services.modules.ensure(scope).filter(m => m.kind === 'unit' && m.lectures?.length), []);
      const unit = units.find(m => num(m.lectures[0]) === n) ?? units.find(m => num(m.lectures[0]) > n);
      if (unit) {
        setLectureFrom(sessionId, unit.topicId);
        const [first] = inOrder(scope, view, new Set());
        if (first) { const step = moveAgenda(fresh(sessionId), { action: 'add', goal: needGoal(scope, view, first) }); return { say: step.say, moved: !!step.moved }; }
      }
    }
    const goalId = matchGoal(view, cur.agenda.goals.filter(g => !finished(g) && !INTRO_MODES.has(g.mode)), to)?.id; // never an intro goal
    // The section they're already on, named again ("a harder two's complement problem"): nothing moves.
    const named = matchTopic(view, to), on = currentGoal(cur.agenda);
    if (named && !goalId && on?.topicIds?.includes(named.topicId)) return { say: `Already on "${on.title}".`, moved: false };
    if (!goalId && !seriesTopics(view, to) && !matchTopic(view, to)) return { say: `"${to}" isn't a section of their course, so you stay where you are. If it's about how to teach (more reading, slower, examples first), just do that.`, moved: false };
    const step = moveAgenda(cur, goalId ? { action: 'focus', goalId } : { action: 'add', goal: newGoal(cur, view, to) });
    return { say: step.say, moved: !!step.moved };
  });
  // The intro as cards: what get_to_know still has to ask; a unit's ready basic question for the quick check (no course model).
  const unknown = sessionId => introUnknown(scopeOf(fresh(sessionId)));
  function basicQuestion(sessionId, unitId) {
    const s = fresh(sessionId), scope = scopeOf(s), ids = expandTopics(knowledge().view(scope, s.pinnedKnowledgeManifestId), [unitId]);
    const q = readyBasics(scope, s.pinnedKnowledgeManifestId).find(x => ids.includes(x.topicId));
    return q ? { questionId: q.questionId, voiceForm: questions().get(scope, q.questionId).voiceForm } : null;
  }
  /**
   * No goal open (the intro over, or every goal met): what they need next is current at once, with the one after it
   * ready. They are working toward the last goal they worked on (else what they said they aim for or find hard). False
   * when nothing is left to understand.
   */
  const nextByNeed = (sessionId, { byNeed = false } = {}) => txn(() => {
    const cur = fresh(sessionId), scope = scopeOf(cur), view = knowledge().view(scope, cur.pinnedKnowledgeManifestId), on = cur.agenda?.goals || [];
    if (cur.agenda?.intro) markIntroDone(scope);
    const toward = on.findLast(g => !INTRO_MODES.has(g.mode) && g.topicIds.length)?.topicIds ?? statedTopics(scope, view);
    // The next section in lecture order; by need (spec §11) only in review and exam practice.
    const [first, then] = byNeed ? needs(scope, view, toward, new Set(on.flatMap(covered))) : inOrder(scope, view, new Set(on.flatMap(covered)));
    if (!first || !cur.agenda) return false;
    const step = moveAgenda(saveSession({ ...cur, agenda: { ...cur.agenda, intro: false } }), { action: 'add', goal: needGoal(scope, view, first) });
    if (step.moved && then) {
      const s = fresh(sessionId), next = { ...needGoal(scope, view, then), startedAt: null, doneAt: null, note: null };
      agendaUpdated(saveSession({ ...s, agenda: { ...s.agenda, goals: [...s.agenda.goals, next] } }));
    }
    return !!step.moved;
  });

  Object.assign(K, { setLectureFrom, inOrder, neighbours, sectionGoal, afresh, student, introDone, introUnknown, readyBasics, diagnoseUnits, introGoals, topicGoal, kcGoal, needs, buildAgenda, seriesTopics, newGoal, moveAgenda, NOTE_GAP_MS, agendaUpdated, tick, ensureTicker, advance, changeTopic, unknown, basicQuestion, nextByNeed });
}
