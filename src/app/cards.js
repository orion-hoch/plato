// The engine's cards and its answers to think, as Plato hears them and as the page shows them. A card v2
// (shared/cards.mjs) reaches Plato as actorCard's text (the bridge makes it) and its show goes on the page: a reading, an
// element with its task, or a board. Each goes up as soon as Plato isn't mid-sentence, through one renderer (putUp).
import { api } from '../backend-client.js';
import { BOARD_KINDS, checkBoard } from '../../shared/boards.mjs';
import { liveReading } from '../elements/Reading.jsx';
import { cardWords, carries } from '../../backend/session/agent.mjs';
import { WRITING_MS } from './ink.js';
import { pointTo } from '../visuals/point.js'; // a cue's mark on the page
import { normalizeSpec } from '../inputs/answer.mjs';
import { VOICE } from './voice.js';

// A card's pointing cue waits this long for its board to be drawn.
const POINT_MS = 400;

// A card the engine sends after Plato has already answered (he said the neutral line while it verified) waits for the
// floor: the learner keeps it for the wait time after his question (stage directions 12–14: about 3 s after a recall
// question, 8–10 s after a reasoning one, long while they work) and while they type or write; then it goes as his turn.
// It goes at once when he answered them with silence, and never when they speak again: his reply to their newest line
// carries it (ACTOR_PROMPT v2: it comes first). It counts as done only when a line of his says what it says.
const NEXT_CARD = '[Next card] The newest card answers them: do it now.';
const HOLD_MS = { recall: 3000, reasoning: 9000, work: 20000, reading: 3000 }, GRACE_MS = 1000;

export function createCards({ setMaking, bridge, lastState, nextBoard, thinking, thoughtBoards, heard, platoHeard, platoEndAt, spokeAt, waitingCard, inkActive, now, toAgent, context, contextNow, later, show, showElement, quote }) {
  let performing = 'recall', nudgeTimer = 0, performedFor = -1, platoAsked = false; // performedFor: the line of theirs a card of his last answered; platoAsked: his last line ended in a question // the wait of the card Plato was performing (whose question the hold protects)
  // A move card reaches Plato at once, as one context update (with whatever was waiting to go); more of it
  // (`more`: card.updated, only what changed) goes like any other line. Its board goes up as soon as he isn't
  // mid-sentence, with its first pointing cue; an equation it keeps is saved quietly.
  // The current guide card's guide (guide mode, docs/teaching-guide-spec.md): the boards the voice may show (tools.js
  // show). Nothing of it goes up by itself; any other new card ends it.
  const guide = { current: null };
  function cardIssued(card, text, more = false, respondsTo = null) {
    context(text); if (!more) contextNow();
    if (!more && card.id) guide.current = card.guide || null;
    // A new move: a thought's board still to come belongs to what came before.
    if (!more) thoughtBoards.current.clear();
    if ('show' in card || (card.wait && card.move)) {
      // A resumed session's card is picked up by the resume itself (voice.js resumeVoice), never nudged on its own.
      if (!more) { waitingCard.current = { heard: heard.current, respondsTo, hold: HOLD_MS[performing] ?? HOLD_MS.recall, words: cardWords(card) }; performing = card.wait; if (!bridge.current?.resumed) cardNudge(); }
      return showCard(card, more);
    }
    const cue = card.point?.[0], at = typeof cue === 'string' ? cue.split(/\s+when\s+/i)[0] : cue?.target;
    if (card.board || at) boardSoon(card.board, at);
  }
  // The waiting card goes as Plato's turn once the floor is his. Called when a card comes, when a line of his is done, and
  // on its own timer while the learner holds the floor.
  function cardNudge() {
    const w = waitingCard.current;
    clearTimeout(nudgeTimer);
    if (!w) return;
    if (!heard.current) return; // nothing said yet on this page: Plato waits for them to start (16 Oct, the user: no thinking on opening a course)
    if (VOICE.agentId === 'local') return; // the local actor (Claude) reads a new card in his next turn's notes; it never starts one (16 Oct: a card after his change_topic set off a third slide unasked)
    // A newer line of theirs (heard, or committed after the response the card answers): his reply to it carries the card.
    if (heard.current !== w.heard || (w.respondsTo && bridge.current?.lastResponseId && w.respondsTo !== bridge.current.lastResponseId)) { waitingCard.current = null; return; }
    if (lastState.current !== 'listening') return; // again when his line is done
    // Theirs until the hold after his last line ends (a short grace after theirs, when he hasn't spoken since it), and
    // while they type or write.
    const at = Date.now(), busy = Boolean(now.current.typed?.trim()) || performance.now() - inkActive.current < WRITING_MS;
    // The hold protects a question he asked (a card he did, or a line ending in one); after his holding line only, a grace.
    const hold = performedFor === heard.current || platoAsked ? w.hold : GRACE_MS;
    const due = platoHeard.current === heard.current ? platoEndAt.current + hold : spokeAt.current + GRACE_MS;
    if (busy || at < due) { nudgeTimer = setTimeout(cardNudge, busy ? 1000 : due - at); return; }
    if (toAgent(NEXT_CARD)) waitingCard.current = null;
  }
  // A finished line of his: the waiting card is done if the line says what it says (a neutral line said before it came doesn't).
  function cardSpoken(text) { const w = waitingCard.current; platoAsked = /\?["”’')\s]*$/.test(String(text ?? '')); if (w && carries(text, w.words)) { waitingCard.current = null; performedFor = heard.current; clearTimeout(nudgeTimer); } }
  // A v2 card's show. The engine moving off a reading ends it (its ReadingEvent goes), whether or not the text stays up.
  function showCard(card, more) {
    const show = card.show, reading = liveReading.current;
    if (reading && !more && !(show?.kind === 'reading' && show.portion?.id === reading.portionId)) reading.end();
    if (!show) return;
    const thread = card.thread ?? card.item?.id ?? card.target?.kc ?? card.goalId ?? null; // the page keeps everything on one problem or idea (page.js)
    if (show.kind === 'reading') boardSoon({ reading: { portion: show.portion, highlight: show.highlight }, cardId: card.id, thread });
    else if (BOARD_KINDS.includes(show.kind) || ['anatomy', 'animation'].includes(show.kind)) boardSoon({ ...show, thread }); // a ready figure or a cached clip (tools.js)
    // An element's task: the card's page-state branches are its signatures; a persona's attempt is shown as his.
    else boardSoon({ element: show, cardId: card.id, thread, persona: card.persona || null,
      branches: (card.expect || []).filter(b => b.pageState).map(b => ({ when: b.pageState, wrongModel: b.wrongModel, reply: b.reply })) });
  }
  // A guide board the voice chose (tools.js show): up as a card's show, on the section's page (thread = topicId), so the
  // section's boards stay above one another. A question board is the one to pose.
  // No guide yet (a course still being built, the opening before a topic: 19 Oct, his boards never went up): the board's own.
  function showGuideBoard(board) {
    const g = guide.current || { id: board.id, topicId: null }, show = board.show;
    if (show?.kind === 'question' && bridge.current) {
      const q = g.questions?.find(x => x.id === (show.questionId ?? board.questionId));
      const question = show.question?.voiceForm ? show.question : q && { questionId: q.id, voiceForm: q.spoken };
      if (question) bridge.current.question = question;
    }
    showCard({ id: g.id, show, thread: g.topicId });
  }
  // The director's answer to think (its own, or one whose id hasn't come back yet): its board as a card's, its words
  // through later().
  // Something being made in the background, on the page (src/Making.jsx) from its start to its result: a problem, a drawing
  // (whose words come first and whose board comes after, thought.updated), a think. Gone a minute past its estimate at most.
  let made = [], madeN = 0;
  const redraw = () => setMaking?.([...made]);
  function startMaking(asked, { kind = 'think', label = 'Working on it', etaMs = 15_000, waitMs = 0 } = {}) {
    const m = { key: `m${++madeN}`, asked, kind, label, etaMs, at: Date.now(), stage: null, outline: null, title: null };
    m.expire = setTimeout(() => stopMaking(m), Math.max(60_000, etaMs * 3, waitMs)); // a figure's bar stays as long as its build can run
    asked.making = m; made.push(m); redraw();
  }
  function stopMaking(m) {
    if (!m || !made.includes(m)) return;
    clearTimeout(m.expire); made = made.filter(x => x !== m); redraw();
  }
  // Its stage ("Checking its answer") or, for a drawing, its plan, as they come (thought.progress); a long build (a figure)
  // also says how far along it really is (fraction), and when its last step came (stageAt) so a stall shows as one.
  function thoughtProgress({ thinkId, stage, title, outline, fraction } = {}) {
    const m = made.find(x => x.asked.id === thinkId);
    if (!m) return;
    Object.assign(m, stage ? { stage, stageAt: Date.now() } : {}, title ? { title: `Drawing: ${title}` } : {}, outline ? { outline } : {}, typeof fraction === 'number' ? { fraction } : {}); redraw();
  }
  function thoughtReady({ thinkId, say, board, lecture, partial } = {}) {
    const asked = thinking.current.find(a => a.id === thinkId) || thinking.current.find(a => !a.id);
    if (asked) thought(asked, { keep: partial && asked.making?.kind === 'drawing' }); // a drawing's words came: its board is still being made
    if (partial && thinkId) thoughtBoards.current.add(thinkId);
    if (board) boardSoon(board);
    // The lecture it rests on goes with it ("From: …"), unless its words already name it.
    if (say) later(asked, `[Thought] ${say}${lecture && !say.includes(lecture) ? ` (From: ${lecture})` : ''}`);
  }
  // A streamed think's board (thought.updated), for the think whose words came: up as a card's board, and one short note
  // so Plato can talk about it (his words already went). Any other is dropped.
  function thoughtUpdated({ thinkId, board, boardWhy } = {}) {
    stopMaking(made.find(x => x.asked.id === thinkId));
    if (!thoughtBoards.current.delete(thinkId) || !board) return;
    boardSoon(board);
    const title = board.title || board.element?.title || 'a board';
    context(`[On the page now] "${String(title).slice(0, 80)}"${boardWhy ? `: ${String(boardWhy).replace(/\s+/g, ' ').slice(0, 140)}` : ''}`);
  }
  // A think answered, failed or timed out: no longer waited for. False if it already was.
  function thought(asked, { keep = false } = {}) {
    const at = thinking.current.indexOf(asked);
    clearTimeout(asked.timer);
    if (!keep) stopMaking(asked.making);
    if (at >= 0) thinking.current.splice(at, 1);
    return at >= 0;
  }
  // A board (or a cue alone) still waiting for his sentence to end stays, unless a newer one replaces it.
  function boardSoon(board, cue = null) {
    const waiting = nextBoard.current;
    nextBoard.current = { board: board || waiting?.board || null, cue: cue || waiting?.cue || null };
    if (lastState.current !== 'speaking') boardNow();
  }
  // A card's or a thought's board, then its first cue pointed at once the page has drawn it.
  function boardNow() {
    const { board, cue } = nextBoard.current || {};
    nextBoard.current = null;
    if (board) putUp(board);
    // ponytail: a fixed wait for the page to draw; wait on the render itself if cues land before their board.
    if (cue) setTimeout(() => pointTo(cue), POINT_MS);
  }
  // A board on the page, each reported to the session as shown: Plato's material (markdown, a diagram drawn from data, a
  // live element, a quote from their notes), what he asks under it (a quick check, a posed question) or a work zone. Each
  // is checked as the backend checks it (shared/boards.mjs): one that doesn't pass (an unknown kind, a diagram that
  // doesn't draw) is left out.
  function putUp(given) {
    if (given.reading) {
      show('material', { title: '', reading: given.reading, cardId: given.cardId, thread: given.thread });
      void bridge.current?.boardEvent('board_content', `Reading: ${given.reading.portion.purpose}`);
      return;
    }
    if (given.element && !given.kind) {
      show('material', { title: String(given.element.title || '').slice(0, 120), element: given.element, cardId: given.cardId, branches: given.branches, persona: given.persona, thread: given.thread });
      void bridge.current?.boardEvent('board_content', [given.element.title, `a ${given.element.kind}${given.element.task ? ` (${given.element.task.mode})` : ''}`].filter(Boolean).join('\n'));
      return;
    }
    // An anatomy figure (backend/session/anatomy.mjs): its own page, framed on this one (BoardStage.jsx), on the topic's page,
    // so the boards Plato writes next go under it (14 Oct: one that came after a reload, on no page, was wiped by the next).
    if (given.kind === 'anatomy') {
      if (!/^\/figures\/[\w-]+\.html$/.test(given.src || '')) return;
      const title = String(given.title || '').slice(0, 120);
      show('material', { title, frame: given.src, thread: given.thread ?? guide.current?.topicId });
      void bridge.current?.boardEvent('board_content', `${title}\n(an interactive figure)`);
      return;
    }
    // A Manim clip (backend/session/animate.mjs): a video on the topic's page, as a figure is.
    if (given.kind === 'animation') {
      if (!/^\/animations\/anim-[0-9a-f]{12}\.mp4$/.test(given.src || '')) return;
      const title = String(given.title || '').slice(0, 120);
      show('material', { title, video: given.src, thread: given.thread ?? guide.current?.topicId });
      void bridge.current?.boardEvent('board_content', `${title}\n(an animation; it plays once, with a replay button)`);
      return;
    }
    const b = checkBoard(given).board;
    if (!b) return;
    const title = String(b.title || '').slice(0, 120), thread = given.thread;
    if (b.kind === 'markdown' || b.kind === 'diagram') {
      const content = b.content || '';
      show('material', { title, content, diagram: b.diagram || null, steps: b.steps || [], thread });
      void bridge.current?.boardEvent('board_content', [title, content, ...(b.steps || [])].filter(Boolean).join('\n'));
    } else if (b.kind === 'element') showElement(b.element);
    else if (b.kind === 'notes') void quoteNotes(b);
    // A quick check in any input kind, ungraded: its answer comes back as "[Answered on the board] …".
    // With an answer key (a choice or select-all), the page marks it itself: the key as option ids, and his explain.
    else if (b.kind === 'check') {
      const spec = normalizeSpec(b.check.kind, b.check), same = x => String(x).trim().toLowerCase();
      const ids = (b.check.answers || []).map(a => spec.options?.find(o => same(o.text) === same(a))?.id).filter(Boolean);
      show('ask', { label: 'Quick check', prompt: String(b.check.prompt).slice(0, 1000), input: { kind: b.check.kind, spec }, graded: false, thread, key: ids.length ? { ids, explain: b.check.explain || '' } : null });
    }
    else if (b.kind === 'question') pose(bridge.current?.takeQuestion(b.questionId), thread);
    // A place for their own work under Plato's material: code with a terminal (C, or RISC-V run in the page), LaTeX
    // steps, or a proof in sections. Plato sees it in "[Student's page] …" lines.
    else if (b.kind === 'zone') {
      const z = b.zone, task = String(z.task || '').slice(0, 4000);
      const lines = ((z.lines || []).join('\n') || (z.kind === 'latex' ? String(z.starter || '') : '')).split('\n').map(line => line.trim()).filter(Boolean).slice(0, 40);
      show('work', { kind: z.kind, language: z.language === 'riscv' ? 'riscv' : 'c', title, task, starter: String(z.starter || '').slice(0, 20_000), lines, sections: z.sections || [], thread });
      void bridge.current?.boardEvent('board_content', [title, task].filter(Boolean).join('\n'));
    }
  }
  // A posed question (graded): an exam problem whole, each part with its place to answer it, or one question with its
  // input. Shown, it is marked asked.
  function pose(question, thread = undefined) {
    if (!question) return;
    if (question.format === 'exam' && question.parts?.length) {
      show('work', null);
      show('ask', { label: String(question.title || ''), prompt: String(question.setup || ''), questionId: question.questionId, parts: question.parts, graded: true, thread });
    } else {
      const kind = question.inputKind || (question.choices?.length ? 'choice' : 'speech');
      const spec = normalizeSpec(kind, question.inputSpec && Object.keys(question.inputSpec).length ? question.inputSpec : { options: question.choices || [] });
      show('ask', { label: 'Question', prompt: question.voiceForm, questionId: question.questionId, input: { kind, spec }, graded: true, thread });
    }
    void bridge.current?.boardEvent('board_shown', question.voiceForm, question.questionId);
  }
  // A quote: their notes searched for `query`, or the passage behind a source `ref`, with its file and place.
  async function quoteNotes({ ref, query }) {
    const sessionId = bridge.current?.session, examId = bridge.current?.exam?.examId, id = String(ref || '').trim().replace(/^\[|\]$/g, '').replace(/^src:/i, '');
    if (query) {
      const found = sessionId ? await api.notes(sessionId, { query: String(query).trim().slice(0, 300) }).catch(() => null) : null;
      if (found?.excerpts?.length) { quote(found.excerpts.slice(0, 2)); context(`[On the page now] From their notes (${found.excerpts[0].source}): ${String(found.excerpts[0].text).slice(0, 300)}`); }
      return;
    }
    const read = examId && id ? await api.examSource(examId, id).catch(() => null) : null;
    if (read?.passage) { quote([{ anchorId: read.ref || id, text: String(read.passage), source: [read.file, read.location].filter(Boolean).join(', ') }]); context(`[On the page now] From their notes (${[read.file, read.location].filter(Boolean).join(', ')}): ${String(read.passage).slice(0, 300)}`); }
  }
  return { cardIssued, thoughtReady, thoughtUpdated, thoughtProgress, startMaking, thought, boardNow, cardNudge, cardSpoken, guide, showGuideBoard };
}
