import React, { useEffect, useRef, useState } from 'react';
import Mosaic from '../sphere/SphereCanvas.jsx'; // the mosaic, a sphere of stone
import ConversationLog from '../ConversationLog.jsx';
import { TutorBridge, chosenCourse, takeTree } from '../tutor-bridge.js';
import { checkpoint, recall, save } from '../checkpoint.js';
import { watchConnection } from '../backend-client.js';
import BoardStage, { Ink, InkTools } from '../BoardStage.jsx';
import { Guard } from '../elements/Element.jsx';
import CourseTree, { TreeButton, Courses } from '../CourseTree.jsx';
import Making from '../Making.jsx';
import FaceButton from '../Faces.jsx';
import { SyncStatus } from '../Material.jsx';
import { speaker } from '../local-voice.js';
import AgendaStrip, { topicLabel } from '../AgendaStrip.jsx';
import Notebook, { NotebookButton, KeepButton, fileBoard, refreshSaved, sectionsOf, appended } from '../Notebook.jsx';
import { ACCEPT } from '../study-material.mjs';
import { createChannel } from './channel.js';
import { createPage } from './page.js';
import { createCards } from './cards.js';
import { createInk } from './ink.js';
import { createWork } from './work.js';
import { createTools } from './tools.js';
import { createVoice, VOICE } from './voice.js';
import { createKeys } from './keys.js';
import { createIntake } from './intake.js';

// A phone is touched, not pointed at.
const TOUCH = window.matchMedia?.('(pointer: coarse)').matches ?? false;
// The voice session's messages are written for a desk; a phone is tapped, and keeps its permissions elsewhere.
const say = text => !TOUCH ? text : text.replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap')
  .replace('System Settings > Privacy & Security > Microphone', 'this browser’s settings on your phone');
// While the study server can't be reached (a restart, the Mac waking), nothing the learner does is lost: it is sent again.
const OFFLINE = 'Reconnecting to the study server. Your work is kept and will be sent.';
// The log panel's open or closed, remembered in this browser (a convenience; it opens if storage is unavailable).
const remembered = () => { try { return localStorage.getItem('plato.log') !== 'closed'; } catch { return true; } };
const remember = open => { try { localStorage.setItem('plato.log', open ? 'open' : 'closed'); } catch { /* not kept */ } };
// What the page shows (Plato's page, the conversation) is kept in the course's checkpoint (../checkpoint.js), so a reload or
// coming back to the course is instant and Plato isn't asked to make it all again (16 Oct, the user: "the loading is really
// bad"). It comes back whichever session opens (19 Oct: a session that couldn't be resumed took the whiteboard with it).
// A page back from storage: everything on it shown at once, its frame laid without the stones' flight.
const restoredPage = page => page && { ...page, restored: true, material: page.material && { ...page.material, restored: true } };
// What this course showed last, read before anything loads (16 Oct, the user: "a more smooth experience" on refresh).
const lastView = () => { const c = checkpoint(chosenCourse()); return c.view ? { ...c.view, savedAt: c.savedAt } : null; };
const keepView = (exam, session, page, log) => save(exam, { session, view: { page, log: log.filter(e => !e.live && e.final).slice(-200) } });

/** The study page: its state, the parts that run it (made once, in ./), and what it shows. */
export default function App() {
  const first = useRef(undefined);
  if (first.current === undefined) first.current = lastView();
  const [state, setState] = useState('idle');
  // One problem at a time at the foot of the conversation. One with something the student did (a file, their
  // writing, a topic) stays until something replaces it; any other goes once Plato speaks again.
  const [error, setError] = useState(''), theirs = useRef('');
  const complain = message => setError(theirs.current = message);
  // What clears the foot of the log (a new connection, Plato speaking, the microphone allowed) never clears theirs.
  const clear = () => setError(shown => shown === theirs.current ? shown : '');
  // The conversation, both voices: [{ id, who: 'plato'|'me', text, final }], newest last; whether its panel is open, and
  // whether the server can be reached.
  const [log, setLog] = useState(() => first.current?.log || []), [logOpen, setLogOpen] = useState(remembered), [offline, setOffline] = useState(false);
  // First run: the model CLI this install uses isn't signed in (server /setup), so Plato can't answer: say how, in the chat.
  const [unready, setUnready] = useState('');
  useEffect(() => { void fetch('/setup').then(r => r.json()).then(st => { if (!st.ok) setUnready(st.provider === 'codex' ? 'Plato isn’t connected to ChatGPT yet: run `codex login` in a terminal, then restart Plato.' : 'Plato isn’t connected to Claude yet: run `claude` in a terminal and log in, then restart Plato.'); }).catch(() => {}); }, []);
  // A document Plato has been handed: its title and chapters, and the chapter being studied.
  const [material, setMaterial] = useState(null);
  const [chapter, setChapter] = useState(-1);
  // Files are being taken in or read (the mosaic shows it).
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [intake, setIntake] = useState(null);
  // A name appears for a moment where Plato's words go: the document's when it has been read.
  const [named, setNamed] = useState(null);
  // The tutor backend: the exam's topics (with mastery) replace the PDF's own chapters once published,
  // and the student's chosen focus among them.
  const [topics, setTopics] = useState(null), [focus, setFocus] = useState(null);
  // The session's goals (the bridge's agenda): the strip at the top left.
  const [agenda, setAgenda] = useState(null);
  const bridge = useRef(null), lastState = useRef('idle');
  // Plato's page: { material, ask } (an explanation, example or diagram; what Plato asked below it), or null.
  // One beat per finished turn of Plato's speech reveals the next worked step.
  const [page, setPage] = useState(() => restoredPage(first.current?.page) || null), [beat, setBeat] = useState(0), [treeOpen, setTreeOpen] = useState(takeTree);
  // The line being typed (the textarea is unseen; the log shows it), and whether it has the keys.
  const [typed, setTyped] = useState(''), [typing, setTyping] = useState(false);
  // Whether there is writing on the screen (its eraser and clear show then), and whether the eraser is on.
  const [inked, setInked] = useState(() => checkpoint(chosenCourse()).ink?.length > 0), [erasing, setErasing] = useState(false);
  // The marker on (dragging writes) or off (dragging selects the page's text, to copy it); remembered on this browser.
  const [marking, setMarking] = useState(() => { try { return localStorage.getItem('plato.marker') !== 'off'; } catch { return true; } });
  const toggleMarker = () => { const on = !marking; setMarking(on); if (!on) setErasing(false); try { localStorage.setItem('plato.marker', on ? 'on' : 'off'); } catch { /* not kept */ } };
  // Messages this page sent as the student come back as transcripts; an echo is not the student speaking again.
  const echoes = useRef(new Set());
  // The student's ink, a hand-in in flight ('awaited' once Plato asked for it), the glances Plato takes at it (the last
  // one's reading kept), and when they last wrote. draft: a selection, order or pairs on the page, waiting for Enter or
  // for Plato to collect it. shapes: reading what a drawing is made of (the read running, the last one done for a
  // version of the page, and whether to read again when it ends).
  const ink = useRef(null), sending = useRef(false), glance = useRef({ timer: 0, busy: false, seen: 0, words: '' }), inkActive = useRef(-Infinity), draft = useRef(null), handed = useRef(new WeakSet());
  const shapes = useRef({ busy: null, done: null, again: false });
  // The work zones on the page by key (an exam part's is "<ask id>:<part id>"), each { part?, label, value, brief, ran? }
  // as it last reported; what Plato was last shown of each, and what each held when last handed in.
  const work = useRef(new Map()), workShown = useRef(new Map()), workHanded = useRef(new Map()), workTimer = useRef(0);
  // Times the student has said something; user messages waiting for Plato to stop speaking or for a conversation.
  // platoHeard: times the student had spoken when Plato last finished a line; waitingCard: a card still to be voiced.
  // platoEndAt, spokeAt: when Plato last finished a line, and when the student last spoke (the floor, for a waiting card).
  const heard = useRef(0), waiting = useRef([]), platoHeard = useRef(0), waitingCard = useRef(null), platoEndAt = useRef(0), spokeAt = useRef(0);
  // Context lines waiting to go as one update, and the last line taken (context()).
  const telling = useRef({ lines: [], last: '', timer: 0 });
  // A card's (or a thought's) board waiting for Plato to finish his sentence, and the thinks not yet answered, each
  // { id (once the server gives it), heard (times the student had spoken when Plato asked), timer }.
  const nextBoard = useRef(null), thinking = useRef([]);
  // Streamed thinks whose words came (a partial thought.ready) and whose board is still to come (thought.updated).
  const thoughtBoards = useRef(new Set());
  // What is being made in the background, shown with its progress (src/Making.jsx).
  const [making, setMaking] = useState([]);
  const [courses, setCourses] = useState(null); // their courses, while they choose one
  // The text chat's activity (src/local-actor.js): Plato thinking (his note streaming in), the answer starting, each tool he
  // uses, in the conversation in order (13 Oct, the user: "a thinking symbol… have what the tutor is thinking on screen").
  useEffect(() => {
    const on = ({ detail: a }) => setLog(list => {
      if (a.type === 'start') return [...list.slice(-199), { id: a.id, who: 'activity', kind: 'thinking', text: '', live: true, at: Date.now(), final: true }];
      if (a.type === 'offer') return [...list.slice(-199), { id: crypto.randomUUID(), who: 'activity', kind: 'offer', face: a.face, text: a.text, final: true }];
      if (a.type === 'offer-taken') return list.map(e => e.kind === 'offer' ? { ...e, taken: true } : e);
      if (a.type === 'tool') return [...list.slice(-199), { id: crypto.randomUUID(), who: 'activity', kind: a.face ? 'face' : 'tool', face: a.face, text: a.text, final: true }];
      if (a.type === 'mic') {
        if (a.state === 'listening') return [...list.slice(-199), { id: a.id, who: 'activity', kind: 'mic', text: 'Listening', live: true, at: Date.now(), final: true }];
        if (a.state === 'done') return list.filter(e => e.id !== a.id); // their words take its place
        return list.map(e => e.id !== a.id ? e : a.state === 'transcribing' ? { ...e, text: 'Transcribing', at: Date.now() } : { ...e, live: false, text: a.text });
      }
      return list.map(e => e.id !== a.id ? e : a.type === 'think' ? { ...e, text: e.text + a.d }
        : (a.type === 'answering' || a.type === 'end') && e.live ? { ...e, live: false, took: Math.max(1, Math.round((Date.now() - e.at) / 1000)) } : e);
    });
    addEventListener('plato:activity', on);
    return () => removeEventListener('plato:activity', on);
  }, []);
  // A line said for them by a button they pressed (a starter, "Take it with Plato"): their turn, as if typed (17 Oct).
  useEffect(() => { const on = ({ detail }) => detail?.text && made.current?.tell(String(detail.text)); addEventListener('plato:say', on); return () => removeEventListener('plato:say', on); }, []);
  // Where the cursor (or selection) is in the hidden typer, so the line shown under the conversation draws it there (13 Oct:
  // the arrow keys moved the real cursor while the drawn one stayed at the end).
  const [caret, setCaret] = useState(null);
  // The latest page, typing and log, for listeners and tools registered once.
  const now = useRef({});
  now.current = { page, typed, log, agenda, topics };
  // What the first render showed (from the checkpoint): not saved again as if new, and replaced by a newer copy from the server.
  const opened = useRef({ page, log });
  // The notebook (../Notebook.jsx): a whole board the page has moved on from (none of its sections on it now) is filed there,
  // as it was last; a section they saved follows what they do on it while it is up.
  const examNow = () => bridge.current?.exam?.examId || chosenCourse(), topicNow = () => topicLabel(now.current.agenda, now.current.topics || []);
  const before = useRef(page);
  useEffect(() => {
    const was = before.current, ids = new Set(sectionsOf(page).map(x => x.value.id));
    before.current = page;
    if (sectionsOf(was).length && !sectionsOf(was).some(x => ids.has(x.value.id))) fileBoard(examNow(), was, { topic: topicNow() });
    if (page) refreshSaved(examNow(), page);
  }, [page]);
  // A past board or a saved section from the notebook: added at the foot of the page as it was (what is up stays above it),
  // and Plato told, to go on from it.
  const [notebookOpen, setNotebookOpen] = useState(false);
  const reopen = entry => {
    setPage(p => appended(p, entry));
    context(`[They added ${entry.page ? 'a past board' : 'a section they saved'} from their notebook to the foot of their page: "${entry.title}"${entry.topic ? ` (${entry.topic})` : ''}, as it was, with what they did on it. Go on from it with them if they ask; don't put it up again.]`);
  };
  useEffect(() => { const b = bridge.current; if (b?.exam && (page || log.length) && !(page === opened.current.page && log === opened.current.log)) keepView(b.exam.examId, b.session, page, log); }, [page, log]);
  // Talking: off until they turn it on (the button, or Space with nothing typed); the microphone is muted meanwhile.
  const [talkOn, setTalkOn] = useState(false), talking = useRef(false);
  // In the text chat the same button (and Space) turns reading his replies aloud on and off instead (src/local-voice.js).
  const textChat = Boolean(VOICE.textOnly), [readAloud, setReadAloud] = useState(speaker.on);
  useEffect(() => speaker.subscribe(setReadAloud), []);
  const toggleTalk = () => { talking.current = !talking.current; setTalkOn(talking.current); session.current?.setListening?.(talking.current); };
  const typer = useRef(null), screen = useRef(null), session = useRef(null), picker = useRef(null), held = useRef(null);
  const naming = useRef(null), pressed = useRef({ at: -Infinity, x: 0, y: 0 });
  const level = useRef(0);
  // Without a session the page is retrying on a timer, resting until someone
  // is back, or waiting for a person to fix something.
  const away = useRef({ mode: null, timer: null, failures: 0 });
  const audio = useRef((heard, spoken) => session.current?.readSpectrum(heard, spoken) ?? false);
  // Every conversation starts knowing nothing, so a new one is told again.
  const study = useRef({ material: null, chapter: -1 });

  // The parts that run the page, made once and in this order (each takes what the ones before it made). Their functions
  // are the ones the listeners, the tools and the voice session keep, so they touch only refs and state setters.
  const toggleTalkRef = useRef(toggleTalk); toggleTalkRef.current = toggleTalk;
  const made = useRef(null);
  if (!made.current) {
    const app = { talking, toggleTalk: () => toggleTalkRef.current(), bridge, lastState, echoes, ink, sending, glance, inkActive, draft, handed, shapes, work, workShown, workHanded, workTimer, heard, platoHeard, waitingCard, platoEndAt, spokeAt,
      waiting, telling, nextBoard, thinking, thoughtBoards, now, typer, screen, session, picker, held, naming, pressed, level, away, study,
      setState, setError, setLog, setMaterial, setChapter, setReading, setDragging, setIntake, setNamed, setPage, setBeat, setTyped, setInked,
      setErasing, setMaking, complain, clear };
    for (const create of [createChannel, createPage, createCards, createInk, createWork, createTools, createVoice, createKeys, createIntake]) Object.assign(app, create(app));
    made.current = app;
  }
  const { context, toAgent, tell, answerAsk, cardIssued, thoughtReady, thoughtUpdated, thoughtProgress, inkChanged, workChanged, handIn, runC, tools, connect, again,
    listenPresence, send, listenKeys, take, putAway, listenFiles } = made.current;
  // Their words heard in the text chat (src/local-mic.js): their turn, shown and sent as if typed.
  useEffect(() => { const on = ({ detail }) => { if (detail?.text) tell(detail.text); }; addEventListener('plato:heard', on); return () => removeEventListener('plato:heard', on); }, []);

  useEffect(() => {
    const tutor = new TutorBridge({
      onTopics: list => setTopics(list.length ? [...list] : null),
      onReady: () => setTopics(list => (list ? [...list] : list)),
      // A change Plato didn't make (an agenda note) goes straight into the live conversation.
      onContext: context, onSpeak: text => (platoHeard.current === heard.current ? context(text) : toAgent(text)), // a [Checked] verdict on their latest line: his turn now, unless he has already answered that line (13 Oct: "Right" said twice)
      onError: message => setError(message),
      onChoose: setCourses, // several courses and none chosen: they choose
      onFocus: section => setFocus(section),
      // New topics published, or a file that couldn't be read: Plato mentions it at his next natural turn.
      onNews: context,
      onReading: busy => setReading(busy),
      onAgenda: setAgenda,
      // The director's move cards, and its answers to think.
      onCard: cardIssued, onThought: (thought, more) => more === 'progress' ? thoughtProgress(thought) : more ? thoughtUpdated(thought) : thoughtReady(thought),
      // A page load picks the open session back up: Plato's lines so far go back in the log.
      // With the page kept in this tab, it comes back as it was and Plato waits for them; else he says where they were.
      resume: true, onResumed: ({ spoken }) => {
        const view = checkpoint(tutor.exam?.examId).view, shown = first.current;
        first.current = null;
        if (shown) { /* already on screen from the first render */ }
        else if (view) { setLog(view.log || []); setPage(restoredPage(view.page)); }
        else { setPage(null); setLog(spoken.filter(line => line.text?.trim()).map(line => ({ id: crypto.randomUUID(), who: 'plato', text: line.text, final: true }))); }
        made.current.resumeVoice();
      },
    });
    bridge.current = tutor;
    (globalThis.__plato ??= {}).bridge = tutor; // the text chat finds the session through it (local-actor.js); the rest is development only
    // A handle for checking page states by hand (and in browser tests); nothing reaches the network through it.
    // fake() swaps the voice for one that is only this page: a check plays Plato's side through __plato.sdk
    // (onMessage, onAudioAlignment, onModeChange, …) and reads what Plato was sent in __plato.sent. `devices` stands in
    // for the browser's (say, a microphone that fails, for the text-only conversation).
    if (import.meta.env.DEV) {
      const dev = window.__plato = { ...window.__plato,
        tools, setPage, setError, tell, ink, bridge: tutor, sent: [],
        setSubtitle: text => setLog(list => [...list, { id: crypto.randomUUID(), who: 'plato', text, final: true }]),
        fake: (devices = {}) => {
          const old = session.current; session.current = null; void old?.close();
          const voice = { sendUserMessage: text => dev.sent.push(['user', text]), sendContextualUpdate: text => dev.sent.push(['context', text]), sendUserActivity() {}, endSession: async () => {}, getInputVolume: () => 0, getOutputVolume: () => 0 };
          connect({ ...VOICE, agentId: 'dev', mediaDevices: null, loadConversation: async () => ({ startSession: async options => { dev.sdk = options; options.onConversationCreated(voice); options.onConnect({ conversationId: 'dev' }); return voice; } }), ...devices });
        },
      };
    }
    watchConnection(ok => setOffline(!ok));
    // A new session on a page load (the last one couldn't be resumed): what was shown stays, and Plato remembers it.
    void tutor.init().then(() => { first.current = null; });
    // The server's copy, when newer than this browser's (storage cleared, another browser): shown unless they've begun.
    const at = first.current?.savedAt || 0;
    void recall(chosenCourse()).then(c => {
      if (c.ink?.length) setInked(true);
      if (c.view && c.savedAt > at && now.current.page === opened.current.page && now.current.log === opened.current.log) { setLog(c.view.log || []); setPage(restoredPage(c.view.page)); }
    });
    connect();
    const stop = [listenKeys(), listenPresence(), listenFiles()];
    return () => {
      for (const listening of stop) listening();
      clearTimeout(away.current.timer);
      clearTimeout(naming.current);
      clearTimeout(glance.current.timer);
      clearTimeout(workTimer.current);
      clearTimeout(telling.current.timer);
      const live = session.current;
      session.current = null;
      void live?.close();
      tutor.close();
    };
  }, []);

  // (A conversation turns text-only only on its way to listening, so this is current whenever `state` is.)
  const live = state === 'listening' || state === 'speaking', textOnly = live && Boolean(session.current?.textOnly);
  const label = textOnly ? 'Talk to Plato: try the microphone again' : state === 'speaking' ? 'Plato is speaking' : state === 'listening' ? 'Plato is listening'
    : state === 'connecting' ? 'Connecting to Plato' : 'Start voice session';
  // Files chosen from the picker come up from the foot of the page, as dropped ones come from where they were let go.
  const picked = event => {
    const files = [...(event.target.files || [])], bounds = screen.current.getBoundingClientRect();
    event.target.value = '';
    if (files.length) take(files, { x: bounds.width / 2, y: bounds.height });
  };
  // The student changed focus: Plato is told at once, and the tutor's plans follow it.
  function focusChanged(section) {
    setFocus(section);
    const titles = section ? (section.progress?.topics || []).map(t => t.title).join(', ') : '';
    tell(section ? `[Focus changed] Now focusing on ${section.name}: ${titles}; goal ${section.goal}.` : '[Focus changed] No focus section now; the whole course is open.');
    void bridge.current?.refreshFocus();
  }
  // With the page up, Plato's stones frame it. It stays up while files are dropped, and so does the writing on it.
  const pageUp = Boolean(page);
  const shown = named;
  // A number question shows its unit after the typed line that answers it.
  const unit = page?.ask && !page.ask.answered && page.ask.input?.kind === 'number' ? page.ask.input.spec?.unit || '' : '';
  return <div className="app">
    <main ref={screen} className={`study-screen${pageUp ? ' has-page' : ''}${inked ? ' has-ink' : ''}${erasing ? ' is-erasing' : ''}`} aria-label="Study with Plato">
      <Mosaic state={state === 'paused' ? 'idle' : state === 'connecting' ? 'thinking' : state} levelRef={level} audioRef={audio}
        dragging={dragging} dragPositionRef={held} intake={intake} onIntakeDone={() => setIntake(null)}
        reading={Boolean(reading)}
        boardOpen={pageUp} boardInstant={Boolean(page?.restored)}/>
      {pageUp && <Guard reset={page}><BoardStage page={page} beat={beat} onAnswer={answerAsk} onDraft={(ask, structured, text) => { draft.current = { ask: ask.id, structured, text }; }}
        onContext={context} onEvidence={event => bridge.current?.evidence(event)} onWork={workChanged} runC={runC} onClose={() => setPage(null)} keep={(part, value) => <KeepButton exam={examNow()} part={part} value={value} topic={topicNow()}/>}
        onHandIn={() => { const ask = now.current.page?.ask; if (ask?.parts && !ask.answered) void handIn(ask); }}/></Guard>}
      <div className="voice-stage">
        {/* Only a mosaic without Plato's voice can be pressed, and pressing it can only start it (again()). */}
        {(live || state === 'connecting') && !textOnly
          ? <div className="orb-button is-live" role="img" aria-label={label}/>
          : <button className="orb-button" onClick={again} aria-label={label}/>}
        {shown && !error && !pageUp && <p className="study-name" role="status">
          {shown.number > 0 && <span className="study-number">{shown.number}</span>}{shown.title}
        </p>}
      </div>
      {/* What is being said: Plato's reply in the middle (on a wide screen with the page up, his replies in the column
          beside it), and at the foot the line being typed, never what the student sent (an empty line only on a phone,
          where tapping opened its keyboard). A tap on it opens typing (on a phone, its keyboard: focus has to come inside
          the tap). A stone's name shows in Plato's place for a moment. */}
      <ConversationLog entries={log} chat={Boolean(VOICE.textOnly)} typed={typed} caret={caret} typing={typing && TOUCH} unit={unit} error={say(error) || unready || (offline ? OFFLINE : '')} quiet={Boolean(shown) && !error && !pageUp && !typed && !typing}
        open={logOpen} onOpen={() => { setLogOpen(true); remember(true); }} onClose={() => { setLogOpen(false); remember(false); }}
        onTap={() => { if (!getSelection()?.toString()) typer.current?.focus(); }}/>
      <Ink api={ink} page={pageUp ? page : null} erasing={erasing} marking={marking} onChange={inkChanged}
        saved={checkpoint(chosenCourse()).ink} onSave={list => save(bridge.current?.exam?.examId || chosenCourse(), { ink: list })} onActivity={() => { inkActive.current = performance.now(); session.current?.sendUserActivity(); }}/>
      <textarea ref={typer} className="typer" aria-label="Type a message to Plato" aria-describedby="typer-keys" value={typed} rows={1} maxLength={2000}
        enterKeyHint="send" autoCapitalize="sentences" onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
        onSelect={e => setCaret([e.target.selectionStart, e.target.selectionEnd])} onKeyUp={e => setCaret([e.target.selectionStart, e.target.selectionEnd])}
        onChange={e => { setTyped(e.target.value); setCaret([e.target.selectionStart, e.target.selectionEnd]); }} // line breaks kept: pasted code stays code (Enter still sends)
        onKeyDown={e => { if (e.key === ' ' && !typed) { e.preventDefault(); toggleTalk(); } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } else if (e.key === 'Escape') setTyped(''); }}/>
      <p id="typer-keys" className="sr-only">Enter sends. Escape clears what you typed. With nothing typed, Command or Control Z takes back your last stroke of writing, and Enter hands in your writing or your selection.</p>
      {/* The current topic, in a word or two; pressed, the course tree opens. */}
      <Making items={making}/>
      <SyncStatus examId={bridge.current?.exam?.examId} onOpen={() => setTreeOpen(true)}/>
      {courses && <Courses choosing list={courses}/>}
      <AgendaStrip agenda={agenda} topics={topics} onOpen={() => setTreeOpen(true)}/>
      {textChat && <button className={`round speak-toggle${readAloud ? ' is-on' : ''}`} onClick={() => speaker.toggle()} aria-pressed={readAloud}
        aria-label={readAloud ? 'Stop reading replies aloud' : 'Read replies aloud'} title={readAloud ? 'Reading replies aloud: press to stop' : 'Read replies aloud'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/>{readAloud ? <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"/> : <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>}</svg>
      </button>}
      <button className={`round talk${talkOn ? ' is-on' : ''}`} onClick={toggleTalk} aria-pressed={talkOn}
        aria-label={talkOn ? 'Stop talking (Space)' : 'Talk to Plato (Space)'} title={talkOn ? 'Listening: press to stop (Space)' : 'Press to talk (Space)'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" fill="currentColor"/>{!talkOn && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>}</svg>
      </button>
      <Notebook exam={examNow()} page={pageUp ? page : null} open={notebookOpen} onClose={() => setNotebookOpen(false)} onAdd={reopen}/>
      <div className="rail">
        {textChat && <FaceButton/>}
        <InkTools shown={inked} erasing={erasing} marking={marking} onMark={toggleMarker} onErase={() => setErasing(on => !on)} onClear={() => { ink.current?.clear(); setErasing(false); }}/>
        <NotebookButton open={notebookOpen} onToggle={() => setNotebookOpen(o => !o)}/>
        <TreeButton onOpen={() => setTreeOpen(true)}/>
      </div>
      <CourseTree examId={bridge.current?.exam?.examId || chosenCourse()} title={bridge.current?.exam?.title} open={treeOpen} onClose={() => setTreeOpen(false)}
        onFocus={(section, node) => {
          focusChanged(section);
          // A topic (not a whole unit) is studied straight away.
          const topic = node && (bridge.current?.topics || []).find(t => t.id === node.id);
          if (topic && node.leaf) void bridge.current.studyTopic(topic);
        }}/>
      {/* Nothing is shown here. A keyboard or a screen reader still needs something to land on, and it shows only while a key has it. */}
      <section className="study-keys" aria-label="Study material">
        <button onClick={() => picker.current?.click()}>Add notes, slides or other files to study with Plato</button>
        {material && <button onClick={putAway}>Put away {material.title}</button>}
        <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={picked}/>
      </section>
    </main>
  </div>;
}
