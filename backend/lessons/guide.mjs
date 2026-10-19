// A section's guide (docs/teaching-guide-spec.md): what the tutor teaches a lecture section from. A resource, not a script:
// ideas in order with their plain words, boards it can put on the page, optional questions (answers withheld), the usual
// confusions. Pure, no model call: built from the topic's course model row (local ids), or from its notes when none is built.
import { checkShow, occurs } from '../../shared/cards.mjs';
import { REGISTRY } from '../../shared/elements/registry.mjs';
import { elementFor, clip, atWord, sentencesOf, firstSentences, literalOf } from '../director/cards.mjs';

const MAX_MD = 1400, TEXT_BUDGET = 5500; // room for each idea's mechanism and example: the voice explains from them
/** Plain words for the voice: no code fences, markdown marks or TeX delimiters, one line. */
const plain = t => String(t ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/^#+\s*/gm, '').replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '').replace(/\*\*|__|`/g, '').replace(/(^|[\s(])\*([A-Za-z][^*\n]*[A-Za-z])\*(?=[\s.,;:!?)]|$)/g, '$1$2').replace(/\$\$?([^$]*)\$\$?/g, '$1').replace(/\\[()[\]]/g, '').replace(/\s+/g, ' ').trim();
const norm = t => plain(t).toLowerCase().replace(/[−–]/g, '-').replace(/[’‘]/g, "'");
const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;
const end = t => t && !/[.!?…]$/.test(t) ? `${t}.` : t;
/** Page text clipped at a paragraph (then a word), never past one board's limit. */
function page(text, max = MAX_MD) {
  const t = String(text ?? '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  if (t.length <= max) return t;
  const cut = t.lastIndexOf('\n\n', max - 1);
  return cut > max / 2 ? t.slice(0, cut) : `${atWord(t, max - 1)}…`;
}
const solution = steps => (steps || []).map((x, i) => `${i + 1}. ${x.subgoal ? `**${x.subgoal}.** ` : ''}${x.step}${x.why ? ` (${x.why})` : ''}`).join('\n');

/** A short title for an idea, never the raw KC statement: a single-idea reading's "why …", the statement's head clause, a procedure's name. */
function titleOf(kc, slice, used) {
  const free = (t, min = 12) => t && t.length >= min && t.length <= 60 && !used.has(t.toLowerCase()) && t, math = t => /[\^=()]/.test(t);
  const why = (slice.readings || []).filter(r => r.kcs?.length === 1 && r.kcs[0] === kc.id && r.level !== 'advanced').map(r => cap(purposeOf(r)));
  // The statement's main clause, its lead-in ("For the taught mnemonics, …", "Before decoding, …") dropped.
  const LEAD = /^(?:when|if|although|because|after|before|while|once|whenever|unless|except|at|in|on|with|given|for|to|during|within|without)\b/i;
  const clauses = plain(kc.statement).split(/[,;:]\s+/), main = clauses.length > 1 && LEAD.test(clauses[0]) && !/^to\b/i.test(clauses[0]) ? clauses[1] : clauses[0];
  const head = cap(main.split(/\s(?:by|because|so that|so|which|whereas|rather than|while|since|when|if|unless|and thus|thus)\s/)[0].replace(/^(?:to|for)\s+/i, '').replace(/[.!?]$/, '').trim());
  const named = [...(slice.procedures || []).filter(p => p.kc === kc.id).map(p => p.title), ...(slice.cases || []).filter(c => c.kcs?.[0] === kc.id).map(c => c.title)].map(plain);
  const loose = LEAD.test(head), topic = /^for\s/i.test(clauses[0]) && clauses.length > 1 ? cap(clauses[0].replace(/^for\s+(?:the\s+)?/i, '')) : null;
  return [...why.map(t => free(t)), !math(head) && !loose && free(head, 16), topic && !math(topic) && free(topic, 16), ...named.map(t => free(t)), free(head, 16)].find(Boolean) || atWord(head, 58);
}
/** A reading's purpose as a phrase: "Read to find out why …" → "why …". */
const purposeOf = r => plain(r.purpose).replace(/^read (?:this )?to (?:find out|see|learn|understand)\s+/i, '').replace(/[.!?]$/, '');
/** Whether an answer shows in a text: a short one as a whole token (a lone digit never counts), a long one anywhere. */
const shows = (text, answer) => { const a = norm(answer); return a.length <= 24 ? occurs(text, a) : norm(text).includes(a); };

/** An element show for a representation or a problem, by the first mode its kind supports, checked; else null. */
function elementShow(src, { modes, ask, kc }) {
  const entry = src?.kind && REGISTRY[src.kind];
  for (const mode of modes.filter(m => entry?.modes.includes(m))) {
    let el = null;
    try { el = elementFor(src, { registry: REGISTRY, mode, ask, moment: 'explain', kc, level: 'responding' }); } catch { el = null; }
    const { show } = el ? checkShow(el.spec) : { show: null };
    if (show) return show;
  }
  return null;
}

/**
 * The guide for one section (docs/teaching-guide-spec.md). `readingOf(readingId, reading)` (the director's) turns a slice
 * reading into a page show or null. → Guide.
 */
export function buildGuide({ topic, slice = null, passages = [], prev = null, next = null, readingOf = () => null, crunch = false, practice = false }) {
  const topicId = topic.topicId, title = topic.title || slice?.title || 'This section', lecture = topic.lecture ?? null;
  const boards = [], ideas = [], questions = [];
  const addBoard = (show, { label, use, ideaId = null, questionId = null }) => {
    const { show: ok } = checkShow(show);
    if (!ok) return null;
    const b = { id: `b${boards.length + 1}`, label: atWord(plain(label), 60), use, show: ok, ideaId, questionId };
    boards.push(b);
    return b.id;
  };
  const story = {
    before: prev?.title ? `It comes right after "${prev.title}".` : topic.parentTitle ? `It is part of "${topic.parentTitle}".` : null,
    about: '',
    next: next?.title ? `Next comes "${next.title}".` : null,
  };

  // ---------- no course model yet: the notes' sections, quoted ----------
  if (!slice?.kcs?.length) {
    const sections = [];
    for (const p of passages || []) {
      const key = p.section || p.lecture || title, s = sections.find(x => x.key === key && x.lecture === p.lecture);
      if (s) s.text.push(p.text); else sections.push({ key, lecture: p.lecture ?? lecture, text: [p.text] });
    }
    // Course logistics (an overview, the syllabus, setup) aren't material: left out when the section has material of its own
    // (12 Oct: "the reading from the beginning" opened on the course overview).
    const LOGISTICS = /\b(course overview|overview|syllabus|setup|set-up|logistics|announcements?|course info|office hours|grading)\b/i;
    const material = sections.filter(x => !LOGISTICS.test(String(x.key).split(/\s*>\s*/).at(-1)));
    if (material.length) sections.splice(0, sections.length, ...material);
    for (const s of sections) {
      const id = `i${ideas.length + 1}`, name = String(s.key).split(/\s*>\s*/).at(-1), body = s.text.join('\n\n').trim();
      const idea = { id, kc: null, title: atWord(plain(name), 60) || title, plain: firstSentences(plain(body.replace(/^#+.*$/gm, '')), 2), mechanism: null, example: null, boardIds: [] };
      // The whole section as one reading (the page's reading view, every sentence anchored, read_aloud works), never fragments
      // (12 Oct: three 1,400-character pieces read as "the reading is cut off").
      const blocks = body.split(/\n{2,}/).map(t => t.trim()).filter(Boolean).map((t, k) => ({ anchor: `${id}r${k + 1}`, text: t.replace(/^#+\s*/, ''),
        kind: /^#{1,6}\s/.test(t) ? 'heading' : /^```/.test(t) ? 'code' : /^\$\$/.test(t) ? 'math' : /^\|.*\|/m.test(t) ? 'table' : t.split('\n').every(l => /^\s*([-*]|\d+\.)\s/.test(l)) ? 'list' : 'para' }))
        .map(b => b.kind === 'code' ? { ...b, text: b.text.replace(/^```\w*\n?|```$/g, '') } : b);
      const rid = blocks.length ? addBoard({ kind: 'reading', portion: { id: `notes:${topicId}:${id}`, purpose: `Read: ${name}${s.lecture ? ` (${s.lecture})` : ''}`, body: blocks.slice(0, 120), keyAnchors: [] }, highlight: [] }, { label: `Reading: ${name}`, use: 'reading', ideaId: id }) : null;
      if (rid) idea.boardIds.push(rid);
      ideas.push(idea);
    }
    story.about = `This section is ${title}${lecture ? `, in ${lecture}` : ''}; it is taught from the notes.`;
    return { id: `guide:${topicId}`, topicId, title, lecture, source: 'notes', story, ideas, boards, questions, confusions: [], takeaway: ideas[0]?.plain || '' };
  }

  // ---------- from the course model ----------
  const route = slice.route?.novice || [], kcById = new Map(slice.kcs.map(k => [k.id, k])), wms = slice.wrongModels || [];
  const order = [...new Set([...route.map(s => s.kc).filter(k => kcById.has(k)), ...slice.kcs.map(k => k.id)])];
  const problems = (slice.problems || []).filter(p => p.prompt && p.answer && p.verification?.ok !== false);
  const problem = id => problems.find(p => p.id === id);
  const taken = new Set(), titles = new Set(), shownPrompts = new Set();
  // Which idea a shared thing belongs to: the idea whose route step names it, else the first idea it covers (an advanced reading: the last).
  const ownerOf = (x, key, late = false) => order.find(kc => route.some(s => s.kc === kc && s[key] === x.id)) ?? (late ? [...order].reverse() : order).find(kc => (x.kcs || []).includes(kc));
  const mine = (list, key, kcId, late) => (list || []).filter(x => !taken.has(`${key}:${x.id}`) && ownerOf(x, key, late?.(x)) === kcId && taken.add(`${key}:${x.id}`));

  order.forEach((kcId, i) => {
    const kc = kcById.get(kcId), e = (slice.explanations || []).find(x => x.kc === kcId) || {}, ideaId = `i${i + 1}`;
    const ttl = titleOf(kc, slice, titles); titles.add(ttl.toLowerCase());
    const step = route.find(s => s.kc === kcId && s.caseId), cs = (slice.cases || []).find(c => c.id === step?.caseId && !taken.has(`case:${c.id}`)) || (slice.cases || []).find(c => c.kcs?.includes(kcId) && !taken.has(`case:${c.id}`));
    if (cs) taken.add(`case:${cs.id}`);
    const example = cs ? firstSentences(plain(cs.text), 2) : e.analogies?.[0]?.mapping ? plain(e.analogies[0].mapping) : null;
    const idea = { id: ideaId, kc: kcId, title: ttl, plain: firstSentences(plain(e.plain || kc.statement), 2), mechanism: e.mechanism ? firstSentences(plain(e.mechanism), 2) : null, example, boardIds: [] };
    const add = (show, meta) => { const id = addBoard(show, { ...meta, ideaId }); if (id) idea.boardIds.push(id); return id; };

    // What explains it: the models' and representations' ready boards, then the representations' live elements.
    for (const m of mine(slice.models?.filter(m => m.board), 'modelId', kcId)) add(m.board, { label: m.board.title || m.name, use: 'explain' });
    const reps = mine(slice.representations, 'representationId', kcId);
    for (const r of reps) if (r.board) add(r.board, { label: r.board.title || r.kind, use: 'explain' });
    for (const r of reps.filter(r => r.element?.spec && r.elementVerified !== false)) {
      const show = elementShow(r.element, { modes: ['sorter', 'proofblocks'].includes(r.element.kind) ? ['construct', 'change'] : ['predict', 'change', 'construct'], ask: r.activeTask ? clip(r.activeTask, 300) : null, kc: kcId });
      if (show) add({ ...show, title: show.title || r.board?.title || null }, { label: `Try it: ${r.board?.title || r.kind}`, use: 'visual' });
    }
    // A worked example (its problem is then never asked).
    const we = (e.workedExamples || []).find(w => problem(w.problemId) && w.steps?.length);
    if (we) {
      const p = problem(we.problemId); shownPrompts.add(norm(p.prompt));
      if (we.steps?.length) add({ kind: 'markdown', title: 'Worked example', content: page(`**${p.prompt}**\n\n${solution(we.steps)}${we.answer ? `\n\nAnswer: ${we.answer}` : ''}`) }, { label: 'Worked example', use: 'example' }); // never a problem labelled as worked
    }
    // Readings, made into page shows by the director.
    for (const r of mine(slice.readings, 'readingId', kcId, r => r.level === 'advanced')) {
      let show = null;
      try { show = readingOf(r.id, r); } catch { show = null; }
      if (show) add(show, { label: `Reading: ${purposeOf(r)}`, use: 'reading' });
    }
    ideas.push(idea);
  });

  story.about = firstSentences(plain(slice.matters?.why), 1) || `This section is ${title}.`;
  const takeaway = plain((slice.enduring || [])[0] || '') || ideas[0]?.plain || '';
  const confusions = wms.filter(w => kcById.has(w.kc)).map(w => ({ wrongModel: w.id, kc: w.kc, belief: firstSentences(plain(w.belief), 2), fix: w.repair || '' }));

  // ---------- questions: optional, verified first, at most two an idea (one in crunch, exam-like first) ----------
  // An answer never shows anywhere the page or the voice sees: not in the guide's text, nor on another question's board.
  const seen = [title, lecture, story.before, story.about, story.next, takeaway, ...confusions.flatMap(c => [c.belief, c.fix]), ...ideas.flatMap(x => [x.plain, x.mechanism, x.example]), ...boards.map(b => JSON.stringify(b.show))];
  const asked = new Set(shownPrompts), mapIds = new Map();
  for (const idea of ideas) {
    const routed = new Set(route.filter(s => s.kc === idea.kc && s.problemId).map(s => s.problemId)), near = `${idea.plain} ${idea.mechanism || ''} ${idea.example || ''}`;
    const rank = p => (p.verification?.ok === true ? 0 : 4) + (routed.has(p.id) ? 0 : 1) + (literalOf(p.answer) && occurs(near, literalOf(p.answer)) ? 3 : 0) + (p.familyId ? 0.5 : 0) + (crunch && p.level !== 'exam' ? 1 : 0) + Math.min(1, p.prompt.length / 1500);
    const pool = problems.filter(p => p.kc === idea.kc && !asked.has(norm(p.prompt))).sort((a, b) => rank(a) - rank(b));
    // Practice (they asked for problems): up to four an idea, exam-like and harder first, each tagged with its level.
    const want = practice ? [p => ['exam', 'beyond'].includes(p.level), p => p.level === 'core', () => true] : crunch ? [() => true] : [p => p.level === 'core', p => p.level !== 'core', () => true];
    const cap = practice ? 4 : crunch ? 1 : 2;
    for (let pass = 0; pass < (practice ? 4 : 1); pass++) for (const ok of want) {
      if (questions.filter(q => q.ideaId === idea.id).length >= cap) break;
      const mistakesOf = p => [...Object.keys(p.wrongAnswers || {}), ...wms.filter(w => w.kc === idea.kc).map(w => w.id)].filter((w, i, a) => a.indexOf(w) === i).map(w => wms.find(x => x.id === w)).filter(Boolean).slice(0, 3).map(w => ({ wrongModel: w.id, belief: plain(w.belief) }));
      const p = pool.find(p => ok(p) && !asked.has(norm(p.prompt)) && !shows(seen.join(' '), p.answer) && !questions.some(q => shows(p.prompt, q.answer)) && !mistakesOf(p).some(m => shows(m.belief, p.answer)));
      if (!p) continue;
      asked.add(norm(p.prompt));
      const qid = `q${questions.length + 1}`, show = p.element?.spec ? elementShow(p.element, { modes: ['predict'], ask: clip(p.prompt, 300), kc: idea.kc }) : null;
      const boardId = addBoard(show || { kind: 'markdown', title: 'Question', content: page(p.prompt) }, { label: `Question on: ${idea.title}`, use: 'question', ideaId: idea.id, questionId: qid });
      if (!boardId) continue;
      idea.boardIds.push(boardId);
      seen.push(JSON.stringify(boards.at(-1).show));
      questions.push({ id: qid, ideaId: idea.id, kc: idea.kc, itemId: p.id, spoken: spokenOf(p.prompt, p.answer), boardId, answer: p.answer, mistakes: mistakesOf(p), kind: p.level === 'core' ? 'check' : 'practice', level: p.level || 'core' });
      mapIds.set(p.id, qid);
    }
  }

  // Course-model ids in its prose ("use p9", "c4's solutions") become the guide's own, or the sentence goes.
  const local = t => sentencesOf(plain(t)).map(x => x.replace(/\b(sep_w\d+|p\d+(?:_\d+)?|rd\d+|r\d+|c\d+|w\d+|k\d+|mo\d+)\b/g, id => mapIds.get(id) ?? `\u0000${id}`)).filter(x => !x.includes('\u0000')).join(' ');
  for (const idea of ideas) { idea.mechanism = idea.mechanism && (local(idea.mechanism) || null); idea.example = idea.example && (local(idea.example) || null); idea.plain = local(idea.plain) || idea.plain; }
  for (const c of confusions) c.fix = firstSentences(local(c.fix), 2) || firstSentences(ideas.find(x => x.kc === c.kc)?.plain, 1);
  return { id: `guide:${topicId}${practice ? ':practice' : ''}`, topicId, title, lecture, source: 'course_model', mode: practice ? 'practice' : 'teach', story, ideas, boards, questions, confusions, takeaway };
}

/** A question as the voice says it (≤ 170 characters, no answer): the prompt when short, else its setting and its ask, else its ask. */
function spokenOf(prompt, answer) {
  const s = sentencesOf(plain(prompt)), fits = x => !!x && x.length <= 170, lit = literalOf(answer);
  const ask = x => /\?$/.test(x) || /^(give|find|what|which|how|why|explain|state|name|compute|predict|decide|return|encode|decode|convert|write|complete|identify|construct|show|say|list|determine|trace|describe|compare|interpret|choose|build)\b/i.test(x);
  const last = [...s].reverse().find(ask);
  const said = [plain(prompt), last && s[0] !== last ? `${s[0]} ${last}` : null, last, s.find(x => /\?$/.test(x)), `${s[0]} The question is on the page.`].find(x => fits(x) && !(lit && occurs(x, lit)) && !norm(x).includes(norm(answer)));
  return said || 'Have a go at the question on the page.';
}

/** The voice's brief for the section: a compact outline, no answers, ≤ ~3,000 characters. */
export function guideText(guide, { shown = [], said = [] } = {}) {
  const on = new Set(shown), g = guide, theirs = (said || []).map(plain).filter(Boolean).slice(-3), mark = id => on.has(id) ? ', on the page' : '';
  const span = ids => ids.length > 2 && ids.every((id, i) => !i || +id.slice(1) === +ids[i - 1].slice(1) + 1) ? `${ids[0]}–${ids.at(-1)}` : ids.join(', ');
  // An idea's boards on one line: a live version beside its picture, worked examples and readings by kind.
  const boardLine = (x, clipAt, why) => {
    const own = g.boards.filter(b => b.ideaId === x.id && !b.questionId), live = new Set();
    const out = [];
    for (const b of own) {
      if (live.has(b.id)) continue;
      const twin = b.use === 'explain' && own.find(v => { const base = v.use === 'visual' && v.label.replace(/^Try it:\s*/, ''); return base && !live.has(v.id) && (b.label.startsWith(base) || base.startsWith(b.label)); });
      if (twin) live.add(twin.id);
      const label = b.use === 'example' ? 'worked example' : b.use === 'visual' ? atWord(b.label, clipAt) : b.use === 'reading' ? (why ? `reading: ${b.label.replace(/^Reading:\s*/, '')}` : 'reading') : atWord(b.label, clipAt);
      out.push(`${b.id} ${label}${on.has(b.id) ? ' (on the page)' : ''}${twin ? ` (${twin.id}: try it${mark(twin.id)})` : ''}`);
    }
    return out.join('; ');
  };
  const render = ({ full, mech, ex, confN, confClip, qClip, q2Short, labelClip, why }) => {
    const lines = [`Section: ${g.title}${g.lecture ? ` (${g.lecture})` : ''}${g.source === 'notes' ? ' — from the notes only; no verified questions' : ''}`];
    lines.push(`Where this sits: ${[g.story.before, g.story.about, g.story.next].filter(Boolean).join(' ')}`);
    lines.push('Ideas (in order):');
    g.ideas.forEach((x, i) => {
      const own = x.boardIds.filter(id => !g.boards.find(b => b.id === id)?.questionId);
      lines.push(`${i + 1}. ${x.title}${own.length ? ` (${span(own)})` : ''}: ${full.has(i) ? x.plain : atWord(firstSentences(x.plain, 1), 200)}${mech.has(i) && x.mechanism ? ` How: ${firstSentences(x.mechanism, 1)}` : ''}${ex.has(i) && x.example ? ` Example: ${firstSentences(x.example, 1)}` : ''}`);
    });
    const grouped = g.ideas.map((x, i) => [i + 1, boardLine(x, labelClip, why)]).filter(([, l]) => l);
    if (grouped.length) { lines.push('Boards you can show (by idea):'); for (const [n, l] of grouped) lines.push(`${n}: ${l}`); }
    if (g.questions.length) {
      lines.push(g.mode === 'practice' ? 'Practice problems (they asked for these; one at a time, show its board; harder ones are tagged exam/beyond; answers are checked for you):' : 'Questions you may ask (optional; showing its board puts it up; answers are checked for you):');
      for (const q of g.questions) lines.push(`${q.id} (${q.ideaId ? `idea ${q.ideaId.slice(1)}` : 'exam bank'}, ${q.boardId}${mark(q.boardId)}${g.mode === 'practice' ? `, ${q.level || 'core'}` : q.kind === 'practice' ? ', practice' : ''})${g.questions.find(y => y.ideaId === q.ideaId) === q || !q2Short ? `: ${atWord(q.spoken, qClip)}` : ' (on its board)'}`);
    }
    if (g.confusions.length && confN) { lines.push('Common confusions:'); for (const c of g.confusions.slice(0, confN)) lines.push(`- ${atWord(firstSentences(c.belief, 1), confClip)} → ${atWord(firstSentences(c.fix, 1), confClip)}`); }
    if (g.takeaway) lines.push(`Takeaway: ${atWord(firstSentences(g.takeaway, 1), 220)}`);
    if (theirs.length) lines.push(`How they say they learn: ${theirs.map(x => `"${atWord(x, 160)}"`).join(' ')}`);
    return lines.join('\n');
  };
  // The outline at its base, cut down while it is too long (a second question by its board alone, one confusion, shorter labels), then
  // enriched while it fits: what each reading is for, more confusions, the ideas' full plain words, how each works, examples.
  // Past the leanest, the boards' lines go from the end (the ideas keep their board ids).
  const o = { full: new Set(), mech: new Set(), ex: new Set(), confN: 2, confClip: 140, qClip: 170, q2Short: false, labelClip: 60, why: false }, ids = g.ideas.map((_, i) => i);
  for (const d of [{ q2Short: true }, { confClip: 100 }, { confN: 1 }, { labelClip: 44 }, { qClip: 120 }]) { if (render(o).length <= TEXT_BUDGET) break; Object.assign(o, d); }
  let text = render(o);
  const upgrades = [{ why: true }, { confN: 3 }, ...ids.map(i => ({ full: i })), { confN: 4 }, { confN: 5 }, { confClip: 300 }, ...ids.map(i => ({ mech: i })), ...ids.map(i => ({ ex: i }))];
  if (text.length <= TEXT_BUDGET) for (const u of upgrades) {
    const [k, v] = Object.entries(u)[0], set = o[k] instanceof Set, before = set ? null : o[k];
    if (set) o[k].add(v); else o[k] = v;
    const t = render(o);
    if (t.length <= TEXT_BUDGET) text = t; else if (set) o[k].delete(v); else o[k] = before;
  }
  const lines = text.split('\n');
  while (lines.join('\n').length > TEXT_BUDGET) { const i = lines.findLastIndex(l => /^\d+: b\d/.test(l)); if (i < 0) break; lines.splice(i, 1); }
  return lines.join('\n').slice(0, TEXT_BUDGET);
}

/** What the page receives: the guide without its answers. */
export const publicGuide = guide => {
  const g = structuredClone(guide);
  for (const q of g.questions) delete q.answer;
  return g;
};
