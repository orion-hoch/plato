// The client tools Plato calls (ACTOR_TOOLS in backend/session/agent.mjs; skip_turn is ElevenLabs' own).
import { api } from '../backend-client.js';
import { pointTo } from '../visuals/point.js'; // point_to's mark on the page
import { liveTasks } from '../elements/Element.jsx';
import { liveReading } from '../elements/Reading.jsx';
import { WRITING_MS } from './ink.js';

// A thought (think) that has not come by then is not coming.
const THINK_WAIT_MS = 30_000;

export function createTools({ startMaking, guide, showGuideBoard, bridge, heard, thinking, now, ink, sending, glance, inkActive, thought, later, toAgent, openDraft, answerAsk, fresh, ownWork, commit, readyShapes, examWork, submitExam, handIn, freshWork, handWork, markHanded }) {
  // Tools the voice agent calls (ACTOR_TOOLS in backend/session/agent.mjs; skip_turn is ElevenLabs' own). Each answers
  // at once; they touch only refs and state setters, since the conversation keeps the set it started with.
  // A problem being made in the background is waited for like a think: its words and board come as thought.ready.
  const pending = (thinkId, reply = {}) => {
    const asked = { heard: heard.current, id: thinkId };
    startMaking?.(asked, { ...reply.making, etaMs: reply.etaMs, waitMs: reply.waitMs }); // on the page: what, its stage, about how long
    asked.timer = setTimeout(() => { if (thought(asked)) later(asked, "[Couldn't make it] offer one from the set and go on."); }, reply.waitMs || THINK_WAIT_MS);
    thinking.current.push(asked);
  };
  const tools = {
    // The student asked for another topic or kind of problem; the director moves the session there (a database step).
    // Plato says what comes back; the new topic's card follows as card.issued.
    change_topic: async ({ to = '' } = {}) => {
      const sessionId = bridge.current?.session, want = String(to || '').trim().slice(0, 300);
      if (!want) return 'Say which topic, in their words.';
      const reply = sessionId ? await api.changeTopic(sessionId, want).catch(() => null) : null;
      return reply ? String(reply.say || 'Moving there now: follow the next card.') : "Couldn't change the topic right now: say you'll get to it, and go on with the card.";
    },
    // Guide mode (docs/teaching-guide-spec.md): the voice puts one of the section guide's boards on the page (an id like
    // 'b3', else words of its label), and the backend hears it (a question board becomes the active question).
    show: async ({ board = '' } = {}) => {
      const boards = guide.current?.boards || [], want = String(board || '').trim();
      const b = boardFor(boards, want);
      if (!b) return boards.length ? `No such board. You can show: ${boards.map(x => `${x.id} (${x.label})`).join('; ')}` : 'There is no guide to show from right now.';
      showGuideBoard(b);
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'show', board: b.id }).catch(() => null) : null;
      return String(reply?.say || `On the page: ${b.label}.`);
    },
    // The section is covered (or they want to go on): the next section's guide card follows as card.issued.
    // Their own course material, searched on the server at once (practice prelim, quizzes, labs, assignments, notes).
    read: async ({ source = '', part = 1 } = {}) => {
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'read', source: String(source || '').slice(0, 200), part: Math.max(1, Math.min(500, Math.round(Number(part) || 1))) }).catch(() => null) : null;
      return reply?.say || "Couldn't open their material right now.";
    },
    compute: async ({ code = '' } = {}) => {
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'compute', code: String(code || '').slice(0, 4000) }).catch(error => ({ say: `Couldn't run it: ${error?.message || 'error'}.` })) : null;
      return reply?.say || "Couldn't run it right now.";
    },
    look_up: async ({ about = '' } = {}) => {
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'look_up', about: String(about || '').slice(0, 200) }).catch(() => null) : null;
      return reply?.say || "Couldn't search their material right now.";
    },
    // The tutor writes on the page itself: a worked example, a table, steps; it stacks with the section's other boards.
    write: async ({ title = '', markdown = '', code = '', language = 'c', proof = null, points = null, diagram_type = '', diagram_data = '', question_kind = '', question = '', options = null, items = null, left = null, right = null, answers = null, explain = '' } = {}) => {
      const sessionId = bridge.current?.session;
      const body = { action: 'write', title: String(title || '').slice(0, 120), markdown: String(markdown || '').slice(0, 4000), ...(code ? { code: String(code).slice(0, 4000), language: language === 'riscv' ? 'riscv' : 'c' } : {}),
        ...(Array.isArray(proof) && proof.length ? { proof: proof.map(x => String(x).slice(0, 80)).slice(0, 12) } : {}),
        ...(Array.isArray(points) && points.length ? { points: points.map(x => String(x).slice(0, 400)).slice(0, 8) } : {}),
        ...(diagram_type ? { diagram_type: String(diagram_type).slice(0, 40), diagram_data: typeof diagram_data === 'string' ? diagram_data.slice(0, 8000) : JSON.stringify(diagram_data ?? {}).slice(0, 8000) } : {}),
        ...(question_kind ? { question_kind, question: String(question || '').slice(0, 1500), ...(explain ? { explain: String(explain).slice(0, 600) } : {}), ...Object.fromEntries(Object.entries({ options, items, left, right, answers }).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => [k, v.map(x => String(x).slice(0, 300)).slice(0, 8)])) } : {}) };
      const reply = sessionId ? await api.guide(sessionId, body).catch(error => ({ say: `Couldn't put that up: ${error?.message || 'error'}.` })) : null;
      if (reply?.before) showGuideBoard?.(reply.before); // a slide written with its question, code or proof space: the slide first
      if (reply?.board) showGuideBoard?.(reply.board);
      return reply?.say || "Couldn't write that right now: say it briefly instead.";
    },
    // Practice: the next problem, chosen by the director and put on the page; its words come back to be asked as they are.
    next_problem: async ({ about = '' } = {}) => {
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'next', about: String(about || '').slice(0, 200) }).catch(() => null) : null;
      if (reply?.thinkId) pending(reply.thinkId, reply); // made in the background: comes as thought.ready
      if (reply?.board) showGuideBoard?.(reply.board);
      return reply?.say || "Couldn't get the next problem right now.";
    },
    // A problem of the kind they asked for, made and checked by the director, put on the page (guide mode).
    make_problem: async ({ about = '' } = {}) => {
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'make', about: String(about || '').slice(0, 200) }).catch(() => null) : null;
      if (reply?.thinkId) pending(reply.thinkId, reply); // made in the background: comes as thought.ready
      if (reply?.board) showGuideBoard?.(reply.board);
      return reply?.say || "Couldn't make that problem right now: offer one from the set.";
    },
    // The idea built as a working machine by the anatomy skill, in the background (minutes): its board and note come as thought.ready.
    // A ready one (ready: its id) goes up at once.
    anatomy: async ({ idea = '', object = '', ready = '' } = {}) => {
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'figure', idea: String(idea || '').slice(0, 2000), object: String(object || '').slice(0, 300), ready: String(ready || '').slice(0, 80) }).catch(() => null) : null;
      if (reply?.thinkId) pending(reply.thinkId, reply);
      if (reply?.board) showGuideBoard?.(reply.board);
      return reply?.say || "Couldn't start the figure right now: show it another way.";
    },
    // A Manim clip of `about` (backend/session/animate.mjs), in the background like a figure; a cached one goes up at once.
    animate: async ({ about = '', title = '' } = {}) => {
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'animate', idea: String(about || '').slice(0, 2000), title: String(title || '').slice(0, 120) }).catch(() => null) : null;
      if (reply?.thinkId) pending(reply.thinkId, reply);
      if (reply?.board) showGuideBoard?.(reply.board);
      return reply?.say || "Couldn't start the animation right now: show it another way.";
    },
    // One of the course's own figure kits (backend/lessons/kits.mjs) from Plato's spec, up at once.
    kit: async ({ name = '', title = '', spec = '' } = {}) => {
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'kit', name: String(name || '').slice(0, 40), title: String(title || '').slice(0, 120), spec: String(typeof spec === 'string' ? spec : JSON.stringify(spec)).slice(0, 8000) }).catch(() => null) : null;
      if (reply?.board) showGuideBoard?.(reply.board);
      return reply?.say || "Couldn't draw that figure right now: show it with write instead.";
    },
    // A live logic circuit from Plato's netlist (backend/session/circuit.mjs), up at once.
    circuit: async ({ title = '', netlist = '' } = {}) => {
      const sessionId = bridge.current?.session;
      const reply = sessionId ? await api.guide(sessionId, { action: 'circuit', title: String(title || '').slice(0, 120), netlist: String(typeof netlist === 'string' ? netlist : JSON.stringify(netlist)).slice(0, 8000) }).catch(() => null) : null;
      if (reply?.board) showGuideBoard?.(reply.board);
      return reply?.say || "Couldn't draw the circuit right now: draw it with write instead.";
    },
    move_on: ({ why = '' } = {}) => guideStep({ action: 'move_on', why: String(why || '').trim().slice(0, 300) }, 'Moving on: follow the next card.'),
    // Practice or exam problems on this section (or `about`): the arc engine's cards follow.
    practice: ({ about = '' } = {}) => guideStep({ action: 'practice', about: String(about || '').trim().slice(0, 300) }, 'Practice is coming: follow the next card.'),
    // Something off the card goes to the director, who answers from the course in a few seconds (thought.ready, see
    // thoughtReady()). Returns at once; a think that fails or never comes is said so, the same way.
    think: ({ question = '' } = {}) => {
      const sessionId = bridge.current?.session, want = String(question || '').trim().slice(0, 1000);
      if (!want) return 'Say what to think about.';
      if (!sessionId) return "Can't think it through right now: say you'll come back to it, and go on with the card.";
      const asked = { heard: heard.current, id: null };
      const failed = () => { if (thought(asked)) later(asked, "[Couldn't think it through] say you'll come back to it, and go on with the card."); };
      asked.timer = setTimeout(failed, THINK_WAIT_MS);
      thinking.current.push(asked);
      const drawing = /^\s*draw\b/i.test(want);
      startMaking?.(asked, { kind: drawing ? 'drawing' : 'think', label: drawing ? `Drawing: ${want.replace(/^\s*draw:?\s*/i, '').slice(0, 70)}` : 'Thinking it through', etaMs: drawing ? 20_000 : 9_000 });
      api.think(sessionId, want).then(reply => { asked.id = reply?.thinkId ?? null; if (asked.making && reply?.etaMs) asked.making.etaMs = reply.etaMs; }, failed);
      return drawing ? 'Drawing it: a progress bar with what is being drawn is on their page. Say in one line what you are drawing and that it takes several seconds; meanwhile explain the part you already know. It comes as [Thought] …'
        : 'Thinking: meanwhile say the part you already know, in one sentence (never "let me check" or "I will get that straight"); the rest comes as [Thought] …';
    },
    // A soft mark on part of the page for a few seconds: an anchor id from the card, else a few words of the page.
    point_to: (given = {}) => pointTo(given),
    // Audio on request for the reading on the page: its next paragraph, for Plato to read word for word.
    read_aloud: ({ from = '' } = {}) => liveReading.current ? liveReading.current.audio(String(from || '').trim()) : 'There is no reading on the page.',
    // How the student wants to be taught, a goal, their exam: kept for every session from now on (before any course
    // exists, until their first file creates it).
    remember_preference: ({ statement = '', about = 'other', applies_to = null, date = null } = {}) => {
      void bridge.current?.remember({ statement, about, appliesTo: applies_to, date });
      return 'Noted.';
    },
    // The student is done: what is on the page becomes their turn. A choice still to hand in (a selection, an order,
    // pairs) goes at once, and so does new work in a zone; writing Plato has already glanced at goes at once with that
    // reading, committed behind; writing he hasn't read yet is read now and comes back as their turn, as does writing
    // already being handed in. Under an open question it is the writing for it, unless the student only wrote on his
    // material; under an exam problem, every part's answer. Never a model call while he waits.
    // A construction on an element (circuit, proof blocks, a sorter, …) is checked by its engine and goes first: the
    // first failure only.
    collect_page_work: () => {
      const built = [...liveTasks].map(t => t.done()).filter(Boolean).map(text => `[Built on the page] ${text}`).join('\n'), rest = collect();
      if (built) void bridge.current?.userSaid(built);
      return !built ? rest : /^Nothing/.test(rest) ? built : `${built}\n${rest}`;
    },
    // Only when the student asked for it, and never while they are writing.
    clear_page_writing: () => {
      if (performance.now() - inkActive.current < WRITING_MS) return 'Left it: they are still writing.';
      if (!ink.current?.strokes().length) return 'Nothing is written on the page.';
      ink.current.clear();
      return 'Their writing is cleared.';
    },
  };
  async function guideStep(body, done) {
    const sessionId = bridge.current?.session;
    const reply = sessionId ? await api.guide(sessionId, body).catch(() => null) : null;
    return reply ? String(reply.say || done) : "Couldn't do that right now: go on with this section.";
  }
  // What is on the page as their turn (see collect_page_work).
  function collect() {
    const pending = openDraft(), ask = now.current.page?.ask, open = ask && !ask.answered;
    if (open && ask.parts) {
      if (sending.current) { sending.current = 'awaited'; return 'Reading their page now.'; }
      const { value, inked } = examWork(ask);
      if (!inked.size) return `[Answered on the board] ${submitExam(ask, value, true)}`;
      void handIn(ask);
      return 'Reading their page now.';
    }
    if (pending) { answerAsk(ask, pending.structured, pending.text, { quiet: true }); return `[Answered on the board] ${pending.text}`; }
    const zones = freshWork(), every = ink.current?.strokes() || [], all = fresh(every), own = open ? fresh(ownWork()) : [], strokes = own.length ? own : all;
    if (!all.length) {
      if (zones) { handWork(zones, open ? ask : null, true); return zones; }
      return every.length ? 'Nothing new is written since they last handed it in.' : 'Nothing is written on the page.';
    }
    if (sending.current) { sending.current = 'awaited'; return 'Reading their page now.'; }
    const seen = glance.current, known = strokes.length === every.length && seen.seen === ink.current.version() && seen.words;
    sending.current = true;
    if (zones) markHanded();
    void commit(strokes, zones).catch(() => '').then(words => { if (!known || sending.current === 'awaited') toAgent(`[Written on the page] ${words || '(unreadable)'}`); }).finally(() => { sending.current = false; });
    return [zones, known ? `[Written on the page] ${[known, readyShapes(strokes)].filter(Boolean).join('\n')}` : 'Reading their page now.'].filter(Boolean).join('\n');
  }
  return { tools };
}

// A guide board by its id, else the one whose label shares the most words with `want` (null when none does).
export function boardFor(boards, want) {
  const id = want.toLowerCase(), byId = boards.find(b => String(b.id).toLowerCase() === id);
  if (byId || !id) return byId || null;
  const words = new Set(id.match(/[a-z0-9]{3,}/g) || []);
  let best = null, most = 0;
  for (const b of boards) {
    const n = (String(b.label || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(w => words.has(w)).length;
    if (n > most) { best = b; most = n; }
  }
  return best;
}
