// The stand-in: Plato's voice agent played locally, so the tutor can be tested end to end WITHOUT ElevenLabs. The backend
// is a sandbox server on a snapshot of data/ (common.mjs). The page's own bridge (src/tutor-bridge.js, run in Node) keeps
// the session and decides which lines reach the agent, as on the page. The actor is a fast model through the Codex runtime
// (localActor in backend/session/agent.mjs: the light role at low effort, the nearest stand-in for gpt-6.1-sol). It gets
// what the voice agent gets: ACTOR_PROMPT v2, each card v2 as actorCard reads it, and notes. Each turn it returns
// { say, tools }. Tools with a backend effect run against the backend; page-only tools get the page's usual results,
// point_to resolved against the anchors of what is on the stand-in page. A card's show goes up on that page: a reading
// (its window recorded, its ReadingEvent sent to /evidence) or an element whose task runs headless (shared/elements/
// task.mjs: the student's line is their prediction, then the reveal, as if they stepped). A simulated student answers.
// See evals/README.md.
// node evals/stand-in.mjs <scenario> [--turns N] [--intro] [--no-judge] [--student <module>] [--data <dir>] [--topic <topicId>] [--port N] [--keep]
// The sandbox the run creates is deleted once the record is written, unless --keep (the disk contract).
import path from 'node:path';
import { rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createRuntime } from '../server/runtime.mjs';
import { ACTOR_PROMPT as prompt, ACTOR_TOOLS as toolDefs, WAITS_FOR as waits, localActor, cardWords, carries } from '../backend/session/agent.mjs';
import { REGISTRY, checkElementSpec, sentenceAnchors } from '../shared/elements/registry.mjs';
import { createTask } from '../shared/elements/task.mjs';
import { apiAt, checks, courseFacts, judge, loadScenario, short, sleep, startSandbox, stopSandbox, studentLine, timeline, writeRun } from './common.mjs';

const argv = process.argv.slice(2), has = flag => argv.includes(flag), option = flag => has(flag) ? argv[argv.indexOf(flag) + 1] : null;
const VALUED = ['--turns', '--student', '--data', '--topic', '--port'];
const name = argv.find((a, i) => !a.startsWith('--') && !VALUED.includes(argv[i - 1]));
// --student <module>: a student of the caller's own (evals/understanding/student.mjs) instead of the persona's, with
// next({ runtime, dialogue }) → line and finish({ runtime, dialogue }). --data <dir>: snapshot that sandbox, not data/.
// --topic <topicId>: the session starts on that topic, as a pressed topic does. --port: the sandbox server's port.
const custom = option('--student') ? await import(path.resolve(option('--student'))) : null;
const turnsWanted = Math.min(12, Number(option('--turns')) || 10);
if (!name) { console.error('usage: node evals/stand-in.mjs <scenario> [--turns N] [--intro] [--no-judge] [--student <module>] [--data <dir>] [--topic <topicId>] [--port N]'); process.exit(2); }
const scenario = await loadScenario(name);
const intro = has('--intro') || scenario.intro === true; // a scenario that replays a first session sets "intro": true
const ROUNDS = 3; // actor calls per turn at most: its reply, then up to two more after tool results it waits for
// A voice turn takes time: Plato's reply is heard at about SPEECH_CPS characters a second, then the student types at
// TYPE_CPS. The director works in that time, so the stand-in keeps it.
// ponytail: calibration knobs, by ear from the ElevenLabs runs; a stand-in that answers instantly starves the director.
const SPEECH_CPS = 14, TYPE_CPS = 6;
const THINK_WAIT_MS = 30_000; // as the page waits for a thought (src/main.jsx)
// Estimated TTS word timings for the stage's process checks (docs/research/voice-and-multimedia.md §10): with no
// ElevenLabs, each spoken word gets an estimated start and end at about 150 words a minute from when the line was said.
// ponytail: a flat rate; real timings come from the voice provider when there is one.
const WPM = 150, wordTimings = (text, at) => (String(text).match(/\S+/g) || []).map((w, i) => ({ w, start: Math.round(at + i * 60_000 / WPM), end: Math.round(at + (i + 1) * 60_000 / WPM) }));

const t0 = Date.now(), events = [], turns = [], problems = [], dialogue = [];
const rec = (kind, data) => events.push({ at: Date.now(), kind, ...data });
const copy = value => JSON.parse(JSON.stringify(value ?? null));
let sandboxed = null, bridge = null, api = null, runtime = null, incident = null, calls = 0;

// What the actor has been sent (context updates), in order; and the stand-in page: Plato's material and what he asked.
const sent = [], page = { material: null, ask: null };
// A card's arrival is marked in the conversation too, where it came: the voice agent sees its context updates in order
// with the turns, so it knows which card came since it last spoke (ACTOR_PROMPT v2: that card comes first).
const context = text => { if (typeof text === 'string' && text.trim() && text !== sent.at(-1)) { sent.push(text); rec('sent', { type: 'contextual_update', text }); if (/^CARD/.test(text)) dialogue.push(`[New card: ${text.split('\n')[0]}]`); } };
const show = (part, value) => {
  page[part] = value;
  const parts = [page.material, page.ask].filter(Boolean);
  rec('board', { titles: parts.map(p => p.title).filter(Boolean), text: parts.map(p => [p.title, p.text].filter(Boolean).join(' ')).join(' ').slice(0, 4000) });
};

// ---------- the stand-in page's v2 shows: a reading or an element with its task (anchors for point_to) ----------
const words = text => (String(text ?? '').match(/\S+/g) || []).length;
page.anchors = new Set(); page.tasks = []; page.reading = null;
function readingEnd() {
  const r = page.reading;
  if (!r) return;
  page.reading = null;
  const said = r.framing.toLowerCase(), purpose = r.portion.purpose.toLowerCase().replace(/[^\w\s]/g, '');
  const event = { type: 'reading', cardId: r.cardId, portion: r.portion.id, at: new Date().toISOString(),
    framing: { purposeSaid: said.replace(/[^\w\s]/g, '').includes(purpose), minutesSaid: /\b(minutes?|min)\b/.test(said), expectancySaid: /\b(question|ask you|asking you)\b/.test(said), prequestions: (said.match(/\?/g) || []).length },
    reading: { activeMs: Date.now() - r.since, expectedMs: Math.round((r.portion.level?.minutes ?? 2) * 60_000), segmentsReached: r.portion.segments?.length || 1, lookBacks: [], questions: r.questions, glosses: [], ink: [], audioRequested: r.audio, tutorWordsDuring: r.tutorWords } };
  rec('reading', { phase: 'end', cardId: r.cardId, portion: r.portion.id, event: copy(event) });
  bridge?.evidence(event);
}
function showV2(card) {
  const s = card.show;
  if (page.reading && !(s?.kind === 'reading' && s.portion?.id === page.reading.portion.id)) readingEnd();
  if (!s) return;
  for (const t of page.tasks) t.retire();
  page.tasks = [];
  if (s.kind === 'reading') {
    const sentences = (s.portion.body || []).flatMap(b => b.kind === 'list' ? (b.items || []) : sentenceAnchors(b));
    page.anchors = new Set([...(s.portion.body || []).map(b => b.anchor), ...sentences.map(x => x.anchor)]);
    page.reading = { cardId: card.id, portion: s.portion, blocks: s.portion.body || [], readAt: -1, since: Date.now(), framing: '', heard: false, questions: [], audio: false, tutorWords: 0 };
    show('material', { title: s.portion.purpose, text: sentences.map(x => x.text).join(' ').slice(0, 4000) });
    rec('reading', { phase: 'start', cardId: card.id, portion: s.portion.id, wait: card.wait });
    rec('render', { what: 'reading', cardId: card.id, anchors: page.anchors.size, highlight: s.highlight || [] });
    return;
  }
  if (!['markdown', 'diagram', 'zone', 'question', 'check', 'notes'].includes(s.kind)) {
    let spec = null;
    try { spec = checkElementSpec(s); } catch (error) { problems.push(`card ${card.n}: its ${s.kind} doesn't pass: ${error.message}`); }
    if (spec) {
      // One task per element, a compare as a whole (as the page runs it): the typed line answers its ask when it has no checkpoint.
      page.anchors = new Set(spec.anchors);
      page.tasks = [createTask(spec, { id: card.id, cardId: card.id, emit: event => { rec('evidence', { event: copy(event) }); bridge?.evidence(event); }, tell: context, persona: card.persona,
        signatures: (card.expect || []).filter(b => b.pageState).map(b => ({ when: b.pageState, wrongModel: b.wrongModel, reply: b.reply })) })];
      const parts = spec.kind === 'compare' ? spec.state.pair.map(side => REGISTRY[side.kind].engine.brief(REGISTRY[side.kind].engine.init(side.state))) : page.tasks.map(t => t.brief());
      show('material', { title: spec.title || '', text: `[${spec.kind}${spec.task ? `, ${spec.task.mode}` : ''}] ${parts.join(' / ')}` });
      rec('render', { what: spec.kind, cardId: card.id, anchors: page.anchors.size, highlight: [] });
      return;
    }
  }
  page.anchors = new Set();
  rec('render', { what: s.kind, cardId: card.id, anchors: 0, highlight: [] });
  showBoard(s);
}

function showBoard(board) {
  if (!board) return;
  if (board.kind === 'zone') show('ask', { title: board.title || 'Work zone', text: board.zone?.task || '', kind: 'zone' });
  else if (board.kind === 'check') show('ask', { title: 'Quick check', text: [board.check?.prompt, ...(board.check?.options || board.check?.items || []).map((x, i) => `${String.fromCharCode(65 + i)}. ${x}`), ...(board.check?.left || []).map((x, i) => `${x}  ↔  ${board.check.right?.[i] ?? ''}`)].filter(Boolean).join('\n'), kind: board.check?.kind || 'text' }); // an interactive question as the student sees it
  else if (board.kind === 'question') show('ask', { title: board.question?.title || 'Question', text: [board.question?.setup || board.question?.voiceForm || '', ...(board.question?.parts || []).map(p => `(${p.id}) ${p.prompt}`)].filter(Boolean).join('\n'), kind: 'speech', graded: true }); // as the page's exam board: setup and every part
  // A slide as the student sees it: its text, its points, and the diagram's data (what the drawing shows).
  else show('material', { title: board.title || board.element?.title || '', text: [board.content, ...(board.steps || []).map(x => `- ${x}`), board.diagram ? `[${board.diagram.type} diagram: ${JSON.stringify(board.diagram.data).slice(0, 900)}]` : null, !board.content && !board.steps?.length && !board.diagram && board.element ? `[${board.element.kind}] ${board.element.summary || ''}` : null].filter(Boolean).join('\n') });
}

// ---------- the actor (localActor: ACTOR_PROMPT v2 on the light model, as the dev-only local mode runs it) ----------
/** One turn of the actor, after `heard` (the student's line, or "[Thought] …"): rounds of { say, tools } until it waits for nothing. */
// A card that comes after the actor's last call is voiced at once when the student hasn't spoken since (as the page does
// it: src/app/cards.js cardNudge); otherwise the actor's reply to the student carries it (ACTOR_PROMPT v2).
// As on the page (src/app/cards.js): a late card waits while the student keeps the floor, for the wait time after
// Plato's question (HOLD_MS by the wait of the card he was performing); it goes at once when he answered them with
// silence; and it is done only when a line of his says what it says (carries).
const NEXT_CARD = '[Next card] The newest card answers them: do it now.', INSTANT_MS = 1500;
const HOLD_MS = { recall: 3000, reasoning: 9000, work: 20000, reading: 3000 }, GRACE_MS = 1000; // as on the page
let cardWaiting = null, cardFor = null, performedFor = -1, platoAsked = false; // the card still to be voiced; the response the newest card answers; his last line ended in a question
// As on the page (cardNudge): the full hold after a card he did or a line of his that asked something; the grace after one that asked nothing.
const graceNow = () => !(performedFor === studentLines || platoAsked);
let performingWait = 'recall', platoAfter = -1; // the wait of the card he was performing; the student line he last spoke after
async function actorTurn(heard) {
  dialogue.push(/^\[(Thought|Couldn't|Next card)/.test(heard) ? heard : `Student: ${heard}`);
  for (let round = 1; round <= ROUNDS; round++) {
    const started = Date.now();
    const { say, tools } = await localActor(runtime, { context: sent, dialogue });
    rec('actor', { ms: Date.now() - started, round });
    if (process.env.UNDERSTANDING_ACTOR_LOG) console.log(`   [actor ${Date.now() - started} ms]`); // evals/understanding: the run's tail back-off reads it
    if (say) {
      const at = Date.now(); platoHeard = studentLines; rec('plato', { text: say, words: wordTimings(say, at) }); dialogue.push(`Plato: ${say}`); void bridge.agentSaid(say);
      platoAfter = studentLines; platoAsked = /\?["”’')\s]*$/.test(say);
      if (cardWaiting && carries(say, cardWaiting.words)) { cardWaiting = null; performedFor = studentLines; } // he performed it
      if (page.reading) { if (page.reading.heard) page.reading.tutorWords += words(say); else page.reading.framing += ` ${say}`; }
    }
    let more = false;
    for (const { tool: name, ...given } of tools) {
      const params = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== null));
      const id = ++calls;
      rec('tool', { id, name, params: copy(params) });
      const result = await runTool(name, params).catch(error => `Failed: ${error.message}`);
      rec('tool-done', { id, name, result: copy(result) });
      dialogue.push(`[Tool ${name} ${short(JSON.stringify(params), 2000)}] → [Tool result] ${short(result, 1500)}`); // the call whole, as the live agent's history keeps it (13 Oct: a table it wrote was cut, and it "couldn't see" it)
      // A tool with a result gets another round; think's comes later as [Thought], so after it he only holds (one line).
      if (waits.has(name) && (name !== 'think' || !say)) more = true;
    }
    if (!more) return;
  }
}

// ---------- the tools: as the page answers them (src/main.jsx), against the backend where they have an effect ----------
const pendingThinks = new Map(), partials = new Set();
let studentLines = 0, platoHeard = -1; // platoHeard: student lines heard when Plato last spoke (as the page's)
async function runTool(name, a) {
  const sessionId = bridge.session;
  switch (name) {
    // Resolved as the page resolves it: an anchor of what is on the stand-in page, else a phrase of its text.
    case 'point_to': {
      const anchor = String(a.anchor || '').trim(), phrase = String(a.phrase || a.target || '').trim();
      const bound = anchor && page.anchors.has(anchor), text = [page.material?.text, page.material?.title, page.ask?.text].join(' ').toLowerCase();
      const said = !bound && phrase.length > 1 && text.includes(phrase.toLowerCase());
      rec('point', { anchor: anchor || null, phrase: phrase || null, resolved: Boolean(bound || said), granularity: bound ? (/[-.]/.test(anchor) ? 'element' : 'item') : said ? 'phrase' : 'none' });
      return bound ? 'Pointed.' : said ? (anchor ? `No anchor ${anchor}; pointed at the words instead.` : 'Pointed.') : 'Nothing there to point at: name it fully instead.';
    }
    // Audio on request for a reading: its next paragraph, word for word.
    case 'read_aloud': {
      const r = page.reading;
      if (!r) return 'There is no reading on the page.';
      r.audio = true;
      const from = String(a.from || '').trim(), start = from ? r.blocks.findIndex(b => b.anchor === from || (b.sentences || []).some(x => x.anchor === from)) : -1, i = start >= 0 ? start : r.readAt + 1, b = r.blocks[i];
      if (!b) return 'That is the end of the reading: say so, and wait for them.';
      r.readAt = i;
      return `Read this aloud word for word, then stop: "${String(b.text || (b.items || []).map(it => it.text).join('. ')).replace(/[\`*_$]/g, '')}"`;
    }
    case 'remember_preference': void bridge.remember({ statement: a.statement || '', about: a.about || 'other', appliesTo: a.applies_to || null, date: a.date || null }); return 'Noted.';
    case 'collect_page_work': { // the stand-in student types and never writes; a construction is checked as the page checks it
      const built = page.tasks.map(t => t.done()).filter(Boolean).map(text => `[Built on the page] ${text}`).join('\n');
      return built || 'Nothing is written on the page.';
    }
    case 'clear_page_writing': return 'Nothing is written on the page.';
    // The student asked for another topic; the director moves there and issues its card 1 (card.issued).
    case 'change_topic': {
      const want = String(a.to || '').trim().slice(0, 300);
      if (!want) return 'Say which topic, in their words.';
      const reply = await api.changeTopic(sessionId, want).catch(() => null);
      return reply ? String(reply.say || 'Moving there now: follow the next card.') : "Couldn't change the topic right now: say you'll get to it, and go on with the card.";
    }
    // A question for the director; its answer comes as thought.ready (see onThought).
    case 'think': {
      const question = String(a.question || '').trim().slice(0, 600);
      if (!question) return 'Say what to think about.';
      const { thinkId } = await api.think(sessionId, question);
      pendingThinks.set(thinkId, { at: Date.now(), heard: studentLines });
      return 'Thinking: meanwhile say the part you already know, in one sentence (never "let me check" or "I will get that straight"); the rest comes as [Thought] …';
    }
    // Guide mode (docs/teaching-guide-spec.md): a board of the current guide card, by id, else the label sharing most
    // words with what he asked for; it goes up on the stand-in page and the backend hears it.
    case 'show': {
      const boards = bridge.card?.guide?.boards || [], want = String(a.board || '').trim();
      const tokens = want.toLowerCase().match(/[a-z0-9']+/g) || [], score = b => tokens.filter(w => String(b.label).toLowerCase().includes(w)).length;
      const board = boards.find(b => b.id.toLowerCase() === want.toLowerCase()) || boards.map(b => ({ b, n: score(b) })).filter(x => x.n).sort((x, y) => y.n - x.n)[0]?.b;
      if (!board) return boards.length ? `No such board; available: ${boards.map(b => `${b.id} ${b.label}`).join('; ')}.` : 'No such board; this section has no boards.';
      showV2({ id: bridge.card.id, n: bridge.card.n, show: board.show, expect: [] });
      const reply = await guideCall(sessionId, { action: 'show', board: board.id });
      return String(reply?.say || `On the page: ${board.label}.`);
    }
    case 'look_up': { const reply = await guideCall(sessionId, { action: 'look_up', about: String(a.about || '').slice(0, 200) }); return String(reply?.say || "Couldn't search right now."); }
    case 'write': { const reply = await guideCall(sessionId, { action: 'write', title: String(a.title || '').slice(0, 120), markdown: String(a.markdown || '').slice(0, 4000), ...(a.code ? { code: String(a.code).slice(0, 4000), language: a.language === 'riscv' ? 'riscv' : 'c' } : {}), ...(Array.isArray(a.points) && a.points.length ? { points: a.points.map(x => String(x).slice(0, 400)).slice(0, 8) } : {}), ...(a.diagram_type ? { diagram_type: String(a.diagram_type), diagram_data: typeof a.diagram_data === 'string' ? a.diagram_data : JSON.stringify(a.diagram_data ?? {}) } : {}), ...(a.question_kind ? { question_kind: a.question_kind, question: String(a.question || ''), ...Object.fromEntries(['options', 'items', 'left', 'right'].filter(k => Array.isArray(a[k]) && a[k].length).map(k => [k, a[k].map(String)])) } : {}) }); if (reply?.board) showV2({ id: bridge.card?.id, n: bridge.card?.n, show: reply.board.show, expect: [] }); return String(reply?.say || "Couldn't write that right now."); }
    case 'next_problem': { const reply = await guideCall(sessionId, { action: 'next', about: String(a.about || '').slice(0, 200) }); if (reply?.thinkId) pendingThinks.set(reply.thinkId, { at: Date.now(), heard: studentLines }); if (reply?.board) showV2({ id: bridge.card?.id, n: bridge.card?.n, show: reply.board.show, expect: [] }); return String(reply?.say || "Couldn't get the next problem right now."); }
    case 'make_problem': { const reply = await guideCall(sessionId, { action: 'make', about: String(a.about || '').slice(0, 200) }); if (reply?.thinkId) pendingThinks.set(reply.thinkId, { at: Date.now(), heard: studentLines }); if (reply?.board) showV2({ id: bridge.card?.id, n: bridge.card?.n, show: reply.board.show, expect: [] }); return String(reply?.say || "Couldn't make that problem right now."); }
    case 'move_on': { const reply = await guideCall(sessionId, { action: 'move_on', why: String(a.why || '').slice(0, 300) }); return reply ? String(reply.say || 'Moving on: follow the next card.') : "Couldn't move on right now: go on with this section."; }
    case 'practice': { const reply = await guideCall(sessionId, { action: 'practice', about: String(a.about || '').slice(0, 300) }); return reply ? String(reply.say || 'Practice next: follow the next card.') : "Couldn't start practice right now: go on with this section."; }
    default: return `${name} isn't on this page.`;
  }
}

// POST /v1/sessions/{id}/guide (show, move_on, practice): its { say, boardId?, card? }, or null when it failed.
const guideCall = (sessionId, body) => apiAt(sandboxed.base)('POST', `/v1/sessions/${sessionId}/guide`, body).catch(error => { problems.push(`guide ${body.action}: ${error.message}`); return null; });

// ---------- what the director made of each answer (director_state, read from the sandbox copy) ----------
let stateDb = null, lastMatch = '';
async function directorState() {
  if (!sandboxed || !bridge?.session) return null;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    stateDb ??= new DatabaseSync(path.join(sandboxed.dir, 'backend.db'), { readOnly: true });
    const row = stateDb.prepare('SELECT data FROM director_state WHERE id = ?').get(bridge.session);
    return row ? JSON.parse(row.data) : null;
  } catch { return null; }
}
// Each answer's match ({ cardId, answer, branchId, kind, how, ms }) is kept only until the next: noted as it changes.
async function noteMatch() { const last = (await directorState())?.last; if (last && JSON.stringify(last) !== lastMatch) { lastMatch = JSON.stringify(last); rec('director', { match: copy(last) }); } }
async function wait(ms) { for (const end = Date.now() + ms; Date.now() < end; await sleep(Math.min(1000, Math.max(0, end - Date.now())))) await noteMatch(); }

// ---------- the run ----------
async function main() {
  try {
    sandboxed = await startSandbox({ examId: scenario.examId, intro, source: option('--data'), ...(option('--port') ? { port: Number(option('--port')) } : {}) });
    // The page's client code fetches relative paths (/v1/…): here they go to the sandbox.
    const fetchReal = globalThis.fetch;
    globalThis.fetch = (input, init) => fetchReal(typeof input === 'string' && input.startsWith('/') ? sandboxed.base + input : input, init);
    ({ api } = await import('../src/backend-client.js'));
    const { TutorBridge } = await import('../src/tutor-bridge.js');
    runtime = createRuntime();
    const thoughts = [];
    bridge = new TutorBridge({
      onContext: context, onNews: context, onError: message => problems.push(`bridge: ${message}`), onAgenda: agenda => rec('agenda', { agenda: copy(agenda) }),
      // As the page does it: the card's text goes to the actor in one update, and its board goes up.
      // A v2 card's text is actorCard's (the bridge makes it); its show goes up on the stand-in page.
      onCard: (card, line, more, respondsTo) => { context(line); if ('show' in card || (card.wait && card.move)) { if (card.move) { rec('card', { cardId: card.id, n: card.n, move: card.move, act: card.act ?? null, wait: card.wait, respondsTo: respondsTo ?? null }); cardWaiting = { heard: studentLines, hold: HOLD_MS[performingWait] ?? HOLD_MS.recall, words: cardWords(card) /* the grace instead, when due after a line that asked nothing (graceNow) */ }; performingWait = card.wait; cardFor = respondsTo ?? null; } showV2(card); } else showBoard(card.board); },
      // A thought's words come as thought.ready; a streamed think's board after them as thought.updated (a board and a note).
      onThought: (thought, more) => {
        if (!more) { thoughts.push(thought); return; }
        if (!partials.delete(thought.thinkId) || !thought.board) return;
        showBoard(thought.board);
        context(`[On the page now] "${String(thought.board.title || thought.board.element?.title || 'a board').slice(0, 80)}"${thought.boardWhy ? `: ${short(thought.boardWhy, 140)}` : ''}`);
      },
    });
    // The server events and what the start result carried, recorded as the page harness records them.
    const receive = bridge.receive.bind(bridge);
    // A background note (tutor.note) is context for the actor, never a turn, as the page passes it on (toAgent).
    bridge.receive = event => { rec('server', { type: event?.type, payload: copy(event?.payload) }); if (event?.type === 'tutor.note' && event.payload?.text) { if (event.payload.speak) thoughts.push({ note: true, say: String(event.payload.text), heard: studentLines }); else context(String(event.payload.text)); } return receive(event); };
    // A sandbox may hold several courses (a copy of the Study pipeline's): the bridge opens the newest, so it is shown only the scenario's.
    const listExams = api.listExams;
    api.listExams = async () => { const r = await listExams(); return scenario.examId ? { ...r, exams: (r.exams || []).filter(e => e.examId === scenario.examId) } : r; };
    const start = api.startSession;
    api.startSession = async (examId, fields = {}) => { const started = await start(examId, option('--topic') ? { ...fields, topicId: option('--topic') } : fields); if (started.lesson) rec('lesson', { lesson: copy(started.lesson) }); if (started.card) rec('server', { type: 'card.issued', payload: { card: copy(started.card) } }); return started; };
    await bridge.init();
    if (!bridge.session) throw Error(`No session started: ${problems.at(-1) || 'the course is not ready'}`);
    if (bridge.exam?.examId !== scenario.examId) throw Error(`The bridge opened exam ${bridge.exam?.examId}, not ${scenario.examId}: it always opens the newest course.`);
    // Ready once the first card has reached the actor.
    for (const end = Date.now() + 45_000; Date.now() < end && !sent.length; ) await sleep(300);
    await sleep(1500);

    // A thought is Plato's turn when nobody has spoken since he asked for it and it is still waited for; else context.
    const deliverThoughts = async () => {
      while (thoughts.length && !incident) {
        const thought = thoughts.shift(), asked = pendingThinks.get(thought.thinkId);
        pendingThinks.delete(thought.thinkId);
        if (thought.partial && thought.thinkId) partials.add(thought.thinkId);
        showBoard(thought.board);
        if (!thought.say) continue;
        const line = thought.note ? thought.say : `[Thought] ${thought.say}${thought.lecture && !thought.say.includes(thought.lecture) ? ` (From: ${thought.lecture})` : ''}`;
        if (thought.note ? thought.heard === studentLines && platoHeard !== studentLines : asked && asked.heard === studentLines) await actorTurn(line).catch(error => { incident = `The actor failed: ${error.message}`; });
        else context(line);
      }
    };
    let heardBy = Date.now(); // when the student has heard Plato's last reply
    // A card voiced as Plato's own turn: what he says is the reply to the last turn (turns[] and the console show it), and
    // the student hears it before answering.
    const nudge = async () => {
      rec('nudge', { text: NEXT_CARD });
      const from = Date.now();
      await actorTurn(NEXT_CARD).catch(error => { incident = `The actor failed: ${error.message}`; });
      const said = events.filter(e => e.kind === 'plato' && e.at >= from);
      turns.at(-1)?.replies.push(...said.map(({ at, text }) => ({ at, text, card: true })));
      if (said.length) console.log(`   plato (the card): ${said.map(r => r.text).join(' / ').slice(0, 300)}`);
      heardBy = (said.at(-1)?.at ?? Date.now()) + said.reduce((sum, r) => sum + r.text.length, 0) * 1000 / SPEECH_CPS;
    };
    for (let n = 1; n <= turnsWanted && !incident; n++) {
      await deliverThoughts(); // what came while the student listened
      // A card that came after the student's last line, which Plato answered with silence: voiced now (no dead air).
      if (n > 1 && cardWaiting?.heard === studentLines && platoAfter !== studentLines) await nudge();
      // The grace, in real time as on the page: a card for their last line, when his only reply since was a holding line,
      // goes GRACE_MS after that line while they are still deciding what to say (that line is then unsaid). Once per card.
      const graced = () => n > 1 && cardWaiting?.heard === studentLines && graceNow() && !cardWaiting.graced;
      if (graced()) { await wait(Math.max(0, heardBy + GRACE_MS - Date.now())); if (cardWaiting) cardWaiting.graced = true; await nudge(); n--; continue; }
      // A custom student may return { line, meta } (its hedges, fillers, latency and silent work, for the stage's process checks).
      const pending = n === 1 ? scenario.lines[0] : (custom ? custom.next({ runtime, dialogue: timeline(events, t0, { student: true }) }) : studentLine(runtime, scenario.persona, timeline(events, t0, { student: true }))).catch(error => { problems.push(`simulated student: ${error.message}`); return null; });
      let got, nudged = false;
      for (let tick; !(tick = await Promise.race([Promise.resolve(pending).then(v => ({ v })), sleep(250)])); )
        if (graced() && Date.now() >= heardBy + GRACE_MS) { cardWaiting.graced = true; nudged = true; await nudge(); }
      got = await pending;
      const line = typeof got === 'string' || got === null ? got : got.line, meta = got && typeof got === 'object' ? got.meta : null;
      if (!line) break;
      // They listen, then answer. A card that came meanwhile waits while they hold the floor (the hold after Plato's line);
      // past it, it is voiced as his turn, and the student answers what they heard instead, a fresh line.
      for (const end = heardBy + line.length * 1000 / TYPE_CPS; Date.now() < end && !nudged; ) {
        await wait(Math.min(1000, Math.max(0, end - Date.now())));
        if (n > 1 && cardWaiting?.heard === studentLines && Date.now() >= heardBy + (graceNow() ? GRACE_MS : cardWaiting.hold)) { nudged = true; await nudge(); }
      }
      // The unsaid line never happened: a custom student takes back what deciding it changed (evals/understanding/sim).
      if (nudged) { custom?.dropped?.(); n--; continue; }
      // Typed under an open quick check (text or number), the line is its answer, as on the page.
      const ask = page.ask, answers = ask && !ask.answered && !ask.graded && ['text', 'number'].includes(ask.kind) && !line.endsWith('?');
      const heard = answers ? `[Answered on the board] ${line}` : line;
      if (answers) ask.answered = true;
      const at = Date.now();
      rec('student', { text: line, ...(meta ? { meta } : {}) });
      const sentLine = events.at(-1); // given the server's response id once committed (evals: which attempts became observations)
      // As on the page: an element waiting for a prediction takes the line as one, and the student then steps to see;
      // a reading notes a question asked while reading.
      for (const t of page.tasks) if (t.hear(line)) t.revealNow();
      if (page.reading) { page.reading.heard = true; if (/\?\s*$/.test(line)) page.reading.questions.push({ anchor: null, text: line.slice(0, 300) }); }
      const committed = bridge.userSaid(heard);
      studentLines++;
      // The voice agent answers a turn about INSTANT_MS after it ends (end of turn, then its model): a card the engine
      // prepared for this answer (a literal match takes about 0.4 s) is in its context by then; a later one is nudged.
      await committed;
      sentLine.responseId = bridge.lastResponseId ?? null;
      for (const end = Date.now() + INSTANT_MS; Date.now() < end && !(cardFor && cardFor === bridge.lastResponseId); ) await sleep(100);
      await actorTurn(heard).catch(error => { incident = `The actor failed: ${error.message}`; });
      // Silent on an answer to a problem (skip_turn): the verdict note comes as his turn within seconds, as on the page.
      if (!events.some(e => e.kind === 'plato' && e.at >= at)) { for (const end = Date.now() + 10_000; Date.now() < end && !thoughts.some(t => t.note && t.heard === studentLines); ) await sleep(200); await deliverThoughts(); }
      // The thinks of this turn are waited for (THINK_WAIT_MS, as the page does); what comes is delivered.
      const mine = () => [...pendingThinks.values()].some(a => a.heard === studentLines);
      for (const end = Date.now() + THINK_WAIT_MS; Date.now() < end && mine(); ) { await sleep(300); await deliverThoughts(); }
      if (mine()) { for (const [id, a] of pendingThinks) if (a.heard === studentLines) pendingThinks.delete(id); await actorTurn("[Couldn't think it through] say you'll come back to it, and go on with the card.").catch(error => { incident = `The actor failed: ${error.message}`; }); }
      const replies = events.filter(e => e.kind === 'plato' && e.at >= at);
      heardBy = (replies.at(-1)?.at ?? Date.now()) + replies.reduce((n, r) => n + r.text.length, 0) * 1000 / SPEECH_CPS;
      turns.push({ n, student: line, at, replies: replies.map(({ at, text }) => ({ at, text })), firstReplyMs: replies[0] ? replies[0].at - at : null, timedOut: false });
      console.log(`${n}. student: ${line}\n   plato:   ${replies.map(r => r.text).join(' / ').slice(0, 300) || '(silent)'}`);
    }
    await wait(3000); // the last agenda, planner and director events
  } catch (error) {
    incident = error.message;
  } finally {
    await finish();
  }
}

async function finish() {
  let lesson = null, course = { lectures: [], topics: [] };
  const sessionId = bridge?.session ?? null;
  // What is still on the stand-in page leaves it: a reading's event, each element's level and time (sent in a second).
  if (page.reading || page.tasks.length) { readingEnd(); for (const t of page.tasks) t.retire(); page.tasks = []; await sleep(1500); }
  try { ({ course, lesson } = await courseFacts(apiAt(sandboxed.base), scenario.examId, sessionId)); } catch (error) { problems.push(`course facts: ${error.message}`); }
  bridge?.stopEvents?.();
  for (let tries = 0; sessionId && tries < 3; tries++) {
    try { await api.end(sessionId, { expectedEpoch: bridge.state.epoch || 1 }); break; }
    catch (error) { if (tries === 2 || error.code !== 'version_conflict') problems.push(`ending the session: ${error.message}`); await sleep(1000); }
  }
  clearTimeout(bridge?.pollTimer); clearTimeout(bridge?.topicTimer);
  if (sandboxed) await stopSandbox(sandboxed.server);
  const record = { harness: 'stand-in', mode: 'cards', label: 'cards', scenario, t0, startedAt: new Date(t0).toISOString(), endedAt: new Date().toISOString(), incident, sandbox: sandboxed && { dir: sandboxed.dir, introReset: intro },
    actor: { role: runtime?.roles?.voice ? 'voice' : 'light', model: (runtime?.roles?.voice ?? runtime?.roles?.light)?.model, effort: (runtime?.roles?.voice ?? runtime?.roles?.light)?.effort, promptChars: prompt.length, tools: toolDefs.map(t => t.name) },
    examId: scenario.examId, sessionId, course, lesson, turns, problems, events };
  // The director's student model at the end (its misconceptions caught and repaired).
  const st = await directorState(); record.director = { model: st?.model ?? null, n: st?.n ?? null };
  stateDb?.close();
  record.checks = checks({ events, turns, t0, lesson, course, director: record.director });
  record.checks.actorMs = { median: [...events.filter(e => e.kind === 'actor').map(e => e.ms)].sort((a, b) => a - b)[events.filter(e => e.kind === 'actor').length >> 1] ?? null, calls: events.filter(e => e.kind === 'actor').length };
  if (!has('--no-judge') && turns.length && runtime) record.checks.judge = await judge(runtime, { events, t0, course, lesson, goalsAtStart: record.checks.agenda.start }).catch(error => ({ error: error.message }));
  if (custom?.finish) await custom.finish({ runtime, dialogue: timeline(events, t0, { student: true }) }).catch(error => problems.push(`simulated student: ${error.message}`));
  await runtime?.close();
  await writeRun(record, { heading: `stand-in actor (${record.actor.model}, ${record.actor.effort}) · simulated student` });
  // The disk contract: the sandbox this run created goes once its record is written (--keep keeps it; level 3 keeps it to read the learner model, then deletes it).
  if (sandboxed?.dir && !has('--keep')) await rm(sandboxed.dir, { recursive: true, force: true }).catch(() => {});
  process.exit(0); // the bridge's timers and the sandbox's sockets would otherwise keep Node alive
}

// Killed mid-run (a level-3 runner stopped): stop the sandbox server too, so it isn't left holding the port.
process.once('SIGTERM', () => { try { sandboxed?.server?.kill('SIGTERM'); if (sandboxed?.dir && !has('--keep')) rmSync(sandboxed.dir, { recursive: true, force: true }); } finally { process.exit(143); } });
await main();
