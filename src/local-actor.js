// Plato in the text chat, on the student's own model (server POST /actor: claudeActor on Claude or ChatGPT; ?local-actor=speak in
// development also speaks him on this Mac). It stands in for the ElevenLabs SDK's Conversation: text in (typed lines, the page's
// notes and turns), Plato's lines out as the SDK reports them, the page's client tools called as the agent calls them.
import { WAITS_FOR, FACES, WORK_FACES, faceLimit } from '../backend/session/agent.mjs';
import { asksIn, manyAsks } from '../shared/boards.mjs';
import { speaker, readAlong } from './local-voice.js';
import { startRecording, stopRecording } from './local-mic.js';
import { openCourse } from './tutor-bridge.js';
import { checkpoint, save } from './checkpoint.js';
import { authHeader } from './backend-client.js';

const post = async (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...await authHeader().catch(() => ({})) }, body: JSON.stringify(body) }).catch(() => null);

const PAGE_TOOLS = new Set(['write', 'show', 'circuit', 'kit', 'anatomy', 'animate']);
const JUDGES = /\b(correct|right|wrong|incorrect|not quite|exactly|mistake|error|marks?|grade|valid|invalid|works|perfect|close|almost|missing|careful|nice|good)\b/i; // a reply that may judge their work
// A line of theirs that asks to leave a lesson for work.
const ASKS_WORK = /\b(practi[cs]e|problems?|exercises?|quiz|drill|test me|try (?:one|it|a problem))\b/i;
const ROUNDS = 3, WPM = 150; // actor calls per turn at most (its reply, then after tool results); speech at about 150 wpm

// What each turn is sent: the topic card he is on (the newest; never an older topic's), the last few notes, and the recent
// conversation (13 Oct: everything since the session began went every turn, stale notes and old topics with it).
function recent(context, dialogue) {
  const card = [...context].reverse().find(x => /^(STUDY GUIDE TOPIC|CARD\b|SECTION GUIDE|PRACTICE SET)/.test(x));
  const notes = context.filter(x => x !== card && !/^(STUDY GUIDE TOPIC|CARD\b|SECTION GUIDE|PRACTICE SET)/.test(x)).slice(-12);
  return { course: openCourse, face: face.face ? face : null, context: card ? [card, ...notes] : notes, dialogue: dialogue.slice(-60) };
}

// The conversation so far: the page's one conversation, whichever connection is open (14 Oct: a new connection after they
// looked at another tab, or allowed the microphone, began from nothing and had forgotten the problem it had just set), and
// back after a reload or on coming back to the course, whichever session opens (the course's checkpoint, ./checkpoint.js).
// face: the face he is in ({ face, topic, note, by }: the face tool, or the student's pick on the chip), kept with the
// conversation and shown on the chip (plato:face).
const context = [], dialogue = [], face = { face: null };
const showFace = () => globalThis.dispatchEvent?.(new CustomEvent('plato:face', { detail: { ...face } }));
let recalled = false;
const sessionNow = () => globalThis.__plato?.bridge?.session || null;
function recall() {
  const session = sessionNow();
  if (recalled || !session) return;
  recalled = true;
  const kept = checkpoint(openCourse).chat;
  if (kept) { context.unshift(...(kept.context || [])); dialogue.unshift(...(kept.dialogue || [])); if (kept.face?.face && !face.face) Object.assign(face, kept.face); showFace(); }
}
function setFace({ face: id, topic = null, note = null, by }) {
  Object.assign(face, { face: id, topic: topic ? String(topic).slice(0, 200) : null, note: note ? String(note).slice(0, 600) : null, by });
  keep(); showFace();
}
function keep() {
  if (openCourse) save(openCourse, { chat: { context: context.slice(-30), dialogue: dialogue.slice(-150), face: { ...face } } });
}

// What Plato is doing, for the chat view (App listens): a turn starting, its thinking note, the answer beginning, each tool, the end.
const act = detail => globalThis.dispatchEvent?.(new CustomEvent('plato:activity', { detail }));
// A tool call in words, for the chat ("Looked up: practice prelim problem 6").
function toolLine(tool, p = {}) {
  const q = s => `“${String(s || '').slice(0, 80)}”`;
  switch (tool) {
    case 'look_up': return `Looked up ${q(p.about)} in your course material`;
    case 'read': return `Read ${q(p.source)}${p.part > 1 ? `, part ${p.part}` : ''}`;
    case 'compute': return 'Checked it by computing';
    case 'write': return p.question_kind ? `Put a ${p.question_kind.replace('_', '-')} question on the page: ${q(p.title || p.question)}` : p.code ? `Put code on the page: ${q(p.title)}` : `Put on the page: ${q(p.title)}${p.diagram_type ? ` (with a ${p.diagram_type.replace('_', ' ')} diagram)` : ''}`;
    case 'show': return 'Put one of the topic’s boards on the page';
    case 'move_on': return 'Moving on to the next topic';
    case 'change_topic': return `Switching to ${q(p.to)}`;
    case 'think': return `Working out a deeper answer: ${q(p.question)}`;
    case 'next_problem': case 'make_problem': return 'Getting you a problem';
    case 'circuit': return `Put a live circuit on the page: ${q(p.title)}`;
    case 'kit': return `Drew ${q(p.title || p.name)} on the page`;
    case 'animate': return `Animating: ${q(p.title || p.about)}`;
    case 'anatomy': return p.ready ? 'Put a figure on the page' : `Building a figure: ${q(p.object || p.idea)}`;
    case 'collect_page_work': return 'Reading what you wrote on the page';
    case 'remember_preference': return 'Noted how you like to learn';
    case 'face': return `${FACES[p.face]?.name || 'Changed how we work'}${p.topic ? `: ${q(p.topic)}` : ''}`;
    default: return null; // point_to, skip_turn, …: nothing to report
  }
}

export function localConversation({ speak = false } = {}) {
  return { startSession: async options => {
    let closed = false, speaking = false, offer = null; // offer: his offer to leave the lesson ({ face, at: where in the dialogue })
    // A line said: the SDK's message and its speaking/listening modes, for as long as it takes to say it. Spoken by the
    // browser's best English voice, without the page's markup ($, `, *) read out.
    const say = text => new Promise(done => {
      speaking = true; hush();
      options.onModeChange?.({ mode: 'speaking' });
      options.onMessage?.({ source: 'ai', role: 'agent', message: text });
      const end = () => { speaking = false; options.onModeChange?.({ mode: 'listening' }); done(); listen(); };
      if (speak && globalThis.speechSynthesis) void sayAloud(spoken(text)).then(end);
      else setTimeout(end, Math.max(800, (text.match(/\S+/g) || []).length * 60_000 / WPM));
    });
    // Listening (13 Oct: ElevenLabs credits ran out): the browser's speech recognition (Chrome, Safari), on while the talk
    // toggle is on and Plato isn't speaking (so it never hears him); each finished phrase is their line, as ElevenLabs'
    // transcript would be.
    const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    let rec = null, micOn = false, micId = null;
    function listen() {
      if (!Recognition || !micOn || speaking || closed || rec) return;
      const r = rec = new Recognition();
      r.lang = 'en-US'; r.continuous = true; r.interimResults = false;
      r.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i].isFinal ? e.results[i][0].transcript.trim() : '';
          if (text) { options.onMessage?.({ source: 'user', role: 'user', message: text }); take(text); }
        }
      };
      r.onerror = e => { if (['not-allowed', 'service-not-allowed'].includes(e.error)) { micOn = false; console.warn('local voice: microphone not allowed'); } };
      r.onend = () => { if (rec === r) rec = null; setTimeout(listen, 300); }; // it stops after a silence: started again while on
      try { r.start(); } catch { rec = null; }
    }
    function hush() { const r = rec; rec = null; try { r?.abort(); } catch { /* not started */ } }
    // Text (no voice): the reply streams in as it is written, whole words at a time, onto one line; nothing waits for a voice.
    async function streamed() {
      const id = crypto.randomUUID();
      act({ type: 'start', id });
      const response = await post('/actor?stream=1', recent(context, dialogue));
      if (!response?.ok || !response.body) { act({ type: 'end', id }); return { error: !response ? 'Plato’s server is not answering. Is it running?' : 'Plato couldn’t answer that turn. Try again.' }; }
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let raw = '', pending = '', said = '', done = null, started = false;
      const reading = readAlong(); // his words aloud, when the student has turned that on
      const flush = all => {
        const cut = all ? pending.length : Math.max(pending.lastIndexOf(' '), pending.lastIndexOf('\n'));
        if (cut <= 0) return; // no whole word yet: wait (13 Oct: "Tak e your time", "1 1.25" when a piece had no space in it)
        const piece = pending.slice(0, cut).replace(/^ +| +$/g, ''); // spaces trimmed (the line joins pieces with one), line breaks kept
        pending = pending.slice(cut);
        if (!piece.trim()) return;
        if (!started) { started = true; options.onModeChange?.({ mode: 'speaking' }); }
        said += (said ? ' ' : '') + piece;
        reading.add(piece);
        options.onMessage?.({ source: 'ai', role: 'agent', message: piece });
      };
      for (;;) {
        const { value, done: end } = await reader.read();
        if (value) raw += decoder.decode(value, { stream: true });
        for (let nl = raw.indexOf('\n'); nl >= 0; nl = raw.indexOf('\n')) {
          const line = raw.slice(0, nl); raw = raw.slice(nl + 1);
          let e; try { e = JSON.parse(line); } catch { continue; }
          if (e.t === 'think') act({ type: 'think', id, d: e.d });
          else if (e.t === 'text') { if (!started && !said) act({ type: 'answering', id }); pending += e.d; flush(false); }
          else if (e.t === 'done') done = e;
          else if (e.t === 'error') { act({ type: 'end', id }); return { error: e.error }; }
        }
        if (end || closed) break;
      }
      flush(true);
      reading.end();
      if (started) options.onModeChange?.({ mode: 'listening' });
      act({ type: 'end', id });
      return { say: said, tools: done?.tools || [], lost: done?.lost || null };
    }
    // A reply that judges their work is checked by a colleague in the background (server /check); a real misjudgment comes
    // back as a note for his next turn, never a turn of its own.
    function check() {
      const card = [...context].reverse().find(x => /^(STUDY GUIDE TOPIC|CARD\b|SECTION GUIDE|PRACTICE SET)/.test(x)) || '';
      void post('/check', { exchange: dialogue.slice(-10).join('\n'), course: card.slice(0, 8000) })
        .then(r => r?.ok ? r.json() : null).then(r => { if (r?.note && !closed) voice.sendContextualUpdate(r.note); }).catch(() => {});
    }
    async function turn(heard) {
      if (heard) dialogue.push(/^\[/.test(heard) ? heard : `Student: ${heard}`);
      let asks = 0, posed = false, slides = 0, lost = false; // this turn's questions (in the chat, on the page) and slides; tools that didn't parse
      for (let round = 1; round <= ROUNDS && !closed; round++) {
        let line, tools = [];
        lost = false;
        if (!speak) {
          const r = await streamed();
          if (r.error) { options.onMessage?.({ source: 'ai', role: 'agent', message: `(${r.error})` }); return; }
          ({ say: line, tools = [] } = r);
          if (line) { dialogue.push(`Plato: ${line}`); asks += asksIn(line); }
          // His tools that didn't come through: he hears it and has a round to put them up (they never ran).
          if (r.lost) { dialogue.push(`[Note to you, not shown to them] ${r.lost}: ${tools.length ? 'only the calls before the break ran' : 'none of them ran, so nothing you described is on the page'}. Put up what is missing now, without repeating what you said.`); lost = true; }
          if (round === 1 && heard && !/^\[/.test(heard) && line && JUDGES.test(line)) check();
        } else {
          const response = await post('/actor', recent(context, dialogue));
          if (!response?.ok) { await say('Plato couldn’t answer that turn. Try again.'); return; }
          ({ say: line, tools = [] } = await response.json());
          if (line) { dialogue.push(`Plato: ${line}`); await say(line); }
        }
        let more = false;
        for (const { tool, ...params } of tools) {
          const line = toolLine(tool, params);
          // What his face won't do (a lesson sets no work, one idea a reply: agent.mjs faceLimit); one question per turn (a page
          // question asking several things, or a second, doesn't go up: he asks one); and a lesson left for work only when they
          // take the offer, a button in the chat (16 Oct: "really rethink how to structure the faces").
          const many = tool === 'write' && params.question_kind ? manyAsks(params.question, posed) : null, limit = faceLimit(face.face, tool, params, slides);
          // Theirs to leave: asked for in their own line this turn ("can we practice"), or a yes after his offer; else an offer.
          const asked = heard && !/^\[/.test(heard) && ASKS_WORK.test(heard), took = tool === 'face' && offer?.face === params.face && dialogue.findLastIndex(x => x.startsWith('Student: ')) > offer.at;
          const offering = tool === 'face' && face.face === 'lecture' && WORK_FACES.has(params.face) && !asked && !took;
          if (line && !speak && !many && !limit && !offering) act({ type: 'tool', text: line, face: tool === 'face' && FACES[params.face] ? params.face : undefined });
          if (tool === 'write' && !many && !limit) { if (params.question_kind) posed = true; slides++; }
          if (offering) { offer = { face: params.face, at: dialogue.length }; act({ type: 'offer', face: params.face, text: `Start ${FACES[params.face].name}` }); }
          // A face is his, not the page's: kept until he or they change it, restated to him each turn.
          const result = limit || (many ? `Couldn't put that up: ${many}.` : offering ? `Offered: a "Start ${FACES[params.face].name}" button is in the chat. You stay in Lesson until they take it (they press it, or say yes: then call face again). Say nothing more about it.`
            : tool === 'face' ? (FACES[params.face] ? (setFace({ face: params.face, topic: params.topic, note: params.note, by: 'plato' }), `You are in ${FACES[params.face].name}. Go on in it now.`) : `No face "${params.face}".`)
            : options.clientTools?.[tool] ? await options.clientTools[tool](params) : `${tool} isn't on this page.`);
          // Whole, so he can read back what he put on the page (14 Oct: 200 characters kept a board's title and lost its question).
          dialogue.push(`[Tool ${tool} ${JSON.stringify(params).slice(0, 3000)}] → [Tool result] ${String(result ?? '').slice(0, 1500)}`);
          // What only puts something on the page (or changes his face or topic: its result is in the conversation for his next turn) ends his turn once he has said his piece, unless it failed (15 Oct, the user:
          // "stop the thing where the tutor agent constantly pings the chat waiting for a response … just let it chill").
          const placed = (PAGE_TOOLS.has(tool) || tool === 'face' || tool === 'change_topic') && line && !/\b(couldn'?t|could not|no such|nothing to|fix)\b/i.test(String(result ?? ''));
          if (WAITS_FOR.has(tool) && !placed && (tool !== 'think' || !line)) more = true;
        }
        if (!more && !lost) break;
      }
      // Several questions in the chat this turn (they can't be unsaid once shown): a quiet note for his next turn, never one of its own.
      if (asks > 1 && !closed) dialogue.push(`[Note to you, not shown to them] That turn asked them ${asks} questions at once. They will answer one: take that one, then ask one thing per turn.`);
    }
    // Their pick on the face button (Faces.jsx): his face from his next turn; no turn of its own (16 Oct, the user: "it should wait till you ask it something").
    const picked = ({ detail }) => { if (!FACES[detail?.face] || closed) return; setFace({ face: detail.face, topic: face.topic, by: 'student' }); act({ type: 'tool', text: `You chose ${FACES[detail.face].name}`, face: detail.face }); };
    addEventListener('plato:face-pick', picked);
    // They took his offer to leave the lesson for work (the button in the chat): that face, and his turn to begin it.
    const tookOffer = ({ detail }) => { const f = FACES[detail?.face]; if (!f || closed) return; offer = null; setFace({ face: detail.face, topic: face.topic, by: 'student' }); act({ type: 'offer-taken' }); act({ type: 'tool', text: `You started ${f.name}`, face: detail.face }); take(`[They took your offer: ${f.name}. Begin it.]`); };
    addEventListener('plato:offer-take', tookOffer);
    // One turn at a time on this page, and a line of theirs is answered once: a reconnect, or this file reloaded while he is mid-turn,
    // must not answer it again (16 Oct: one message got two lectures, and two proofs to fill in). Kept on the page, not the module.
    const take = heard => {
      const turns = globalThis.__platoTurns ||= { queue: Promise.resolve(), pending: new Set() };
      const theirs = heard && !/^\[/.test(heard) ? heard : null;
      if (theirs && turns.pending.has(theirs)) return; // already waiting or being answered (said again after a failed turn, it is answered)
      if (theirs) turns.pending.add(theirs);
      turns.queue = turns.queue.then(() => { if (closed) return; recall(); return turn(heard); }).catch(error => console.warn('local actor:', error)).finally(() => { turns.pending.delete(theirs); keep(); });
    };
    const voice = {
      sendUserMessage: text => { if (!/^\[/.test(String(text))) { stopSpeaking(); speaker.stop(); } take(String(text)); return true; }, // their typing cuts him off; the page's own notes ([Thought] …) never do
      // The talk toggle (Space, the mic button): with a voice, the browser's recognition; in the text chat, a recording heard on
      // this Mac when it goes off (tap to talk, tap again to send), shown in the chat as listening, then transcribing.
      setMicMuted: muted => {
        if (speak) { micOn = !muted; if (micOn) listen(); else hush(); return; }
        if (!muted && !micId) {
          micId = crypto.randomUUID(); speaker.stop(); act({ type: 'mic', id: micId, state: 'listening' });
          startRecording().catch(() => { act({ type: 'mic', id: micId, state: 'error', text: 'The microphone isn’t allowed: allow it for this page, or type.' }); micId = null; });
        } else if (muted && micId) {
          const id = micId; micId = null;
          act({ type: 'mic', id, state: 'transcribing' });
          void stopRecording().then(r => {
            if (r.text) { act({ type: 'mic', id, state: 'done' }); globalThis.dispatchEvent?.(new CustomEvent('plato:heard', { detail: { text: r.text } })); }
            else act({ type: 'mic', id, state: 'error', text: r.error || 'Didn’t catch anything: tap the mic and try again.' });
          });
        }
      },
      // The first notes (the card) arrive at connect, and Plato waits for them to speak first (16 Oct, the user: "stop the auto
      // thinking when switching between tests"). A card's arrival is marked in the conversation where it came (as the voice agent sees its
      // updates in order); a note told again on a reconnect moves to the end instead of coming twice.
      sendContextualUpdate: text => {
        recall(); text = String(text);
        const at = context.indexOf(text);
        if (at >= 0) context.splice(at, 1);
        context.push(text);
        if (/^CARD/.test(text) && at < 0) dialogue.push(`[New card: ${text.split('\n')[0]}]`);
        keep();
      },
      sendUserActivity() {}, getInputVolume: () => 0, getOutputVolume: () => 0,
      endSession: async () => { closed = true; hush(); stopSpeaking(); removeEventListener('plato:face-pick', picked); removeEventListener('plato:offer-take', tookOffer); },
    };
    options.onConversationCreated?.(voice);
    options.onConnect?.({ conversationId: `local-${Date.now()}` });
    return voice;
  } };
}

// What the voice says aloud: the page's markup left out ($x$, `code`, **bold**, \times), the words kept.
function spoken(text) {
  return String(text).replace(/(\w)_\{?(\d+)\}?/g, '$1 base $2').replace(/\^\{?(-?\w+)\}?/g, ' to the $1').replace(/\\times/g, ' times ').replace(/\\(?:frac|text|mathrm|texttt)\{([^}]*)\}(?:\{([^}]*)\})?/g, (_, a, b) => b ? `${a} over ${b}` : a)
    .replace(/[`*_$\\{}]/g, '').replace(/\s+/g, ' ').trim();
}
// The best English voice the system has: a premium or enhanced one first (macOS, Chrome), else a natural default.
function bestVoice() {
  const voices = globalThis.speechSynthesis?.getVoices?.() || [], en = voices.filter(v => /^en(-|_)/i.test(v.lang));
  return en.find(v => /premium|enhanced|neural|natural/i.test(v.name)) || en.find(v => /samantha|ava|allison|google us english|daniel/i.test(v.name)) || en.find(v => v.default) || en[0] || null;
}

// Said aloud a sentence at a time, each with a timer in case the browser never says it finished (Chrome can drop a long
// utterance's end event, which would stop the conversation). stopSpeaking() cuts the rest.
let speakingRun = 0;
function stopSpeaking() { speakingRun++; globalThis.speechSynthesis?.cancel(); }
async function sayAloud(text) {
  const run = ++speakingRun, voice = bestVoice();
  const sentences = String(text).split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  for (const sentence of sentences) {
    if (run !== speakingRun) return;
    await new Promise(done => {
      const line = new SpeechSynthesisUtterance(sentence);
      if (voice) line.voice = voice;
      line.rate = 1.05;
      const timer = setTimeout(done, 2500 + sentence.split(/\s+/).length * 450);
      line.onend = line.onerror = () => { clearTimeout(timer); done(); };
      speechSynthesis.speak(line);
    });
  }
}
