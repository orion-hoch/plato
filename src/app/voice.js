// The voice session (ElevenLabs, through LiveVoiceSession): connecting, what a new conversation is told first, Plato's
// lines and states, what the student says, and reconnecting, resting or waiting when it closes.
import { LiveVoiceSession } from '../eleven-voice.js';
import { afterVoiceClose } from '../voice-presence.mjs';
import { outlineBriefing, chapterBriefing } from '../study-material.mjs';
import { isSpeech } from '../tutor-bridge.js';
import { echo } from './channel.js';
import { liveReading } from '../elements/Reading.jsx';

// Plato is a text chat on the student's own model (src/local-actor.js, server /actor), in every build. ?local-actor=speak (development,
// on a Mac) also speaks his lines; the ElevenLabs voice agent only when the build sets VITE_VOICE=eleven (or ?local-actor=off).
const LOCAL = (() => {
  const asked = globalThis.location ? new URLSearchParams(location.search).get('local-actor') : null;
  const chosen = asked ?? (import.meta.env.VITE_VOICE === 'eleven' ? 'off' : 'text');
  return chosen === 'off' ? null : chosen === 'speak' && !import.meta.env.DEV ? 'text' : chosen;
})();
export const VOICE = LOCAL !== null
  ? { agentId: 'local', mediaDevices: null, workletPath: '', textOnly: LOCAL !== 'speak', loadConversation: () => import('../local-actor.js').then(m => m.localConversation({ speak: LOCAL === 'speak' })) }
  : { agentId: import.meta.env.VITE_ELEVENLABS_AGENT_ID || '', workletPath: `${import.meta.env.BASE_URL}eleven-raw-audio.js` };
const ENDED = 'The voice connection ended. Click the mosaic to reconnect.';
const GAVE_UP = 'Plato can’t connect right now. Click the mosaic to try again.';


export function createVoice({ talking, bridge, session, lastState, level, away, study, now, echoes, sending, telling, nextBoard, heard, platoHeard, platoEndAt, waitingCard, setState, setBeat, setLog, setError, clear, said, toAgent, flush, context, contextNow, boardNow, cardNudge, cardSpoken, fresh, ownWork, commit, tools }) {
  // Plato knows only what the session is told here: the course (or the chapter list, then the chosen chapter's
  // text), then anything the student did while no conversation was there to hear it. A new conversation has heard
  // nothing: lines held for the old one go, and the brief goes at once.
  function brief() {
    const known = bridge.current?.contextForConversation() || [];
    clearTimeout(telling.current.timer); telling.current = { lines: [], last: '', timer: 0 };
    if (known.length) for (const text of known) context(text);
    else if (study.current.material) {
      const { material: held, chapter: chosen } = study.current;
      context(outlineBriefing(held));
      for (const part of chapterBriefing(held, chosen)) context(part);
    }
    contextNow();
    flush();
    // A resumed session: one line on where they were, then the card. Else a card that came while no conversation could
    // hear it goes now.
    if (!resumeVoice()) cardNudge();
  }
  // Plato picks a resumed session up (the turn that says so is also the card's nudge): when the conversation starts, or
  // when the resume comes back if it started first. False when there is nothing to resume or no conversation yet.
  function resumeVoice() {
    // Nothing is said for it (16 Oct, the user: no thinking on opening a course): the page is back as it was, and their next
    // line carries the card.
    if (!bridge.current?.resumed || !session.current) return false;
    bridge.current.resumed = null; waitingCard.current = null;
    return true;
  }

  // Plato is live whenever this page is in view. Nothing here stops the session. `voice` is for checks by hand.
  function connect(voice = VOICE) {
    if (session.current) return;
    clearTimeout(away.current.timer);
    away.current.timer = null;
    // A tab opened in the background waits for its first look before using the microphone.
    if (document.hidden) { away.current.mode = 'resting'; return; }
    away.current.mode = null;
    // A key or a tap retries too (touch): the very Enter that raised the student's problem comes here.
    clear();
    const live = new LiveVoiceSession({
      onState: value => {
        if (session.current !== live) return;
        const stopped = lastState.current === 'speaking' && value === 'listening';
        lastState.current = value;
        setState(value);
        // Plato finished speaking: the next worked step comes up, and what waited for him to stop is said. (A new
        // conversation says it in brief(), after the course.) A card's board that waited goes up.
        if (stopped) { setBeat(b => b + 1); flush(); boardNow(); }
      },
      onLevel: value => { if (session.current === live) level.current = value; },
      // Plato's line as it is heard; once it is done, what he said is reported as delivered (played or cut off).
      onLine: line => {
        if (session.current !== live) return;
        const entry = { id: line.id, who: 'plato', text: line.text, final: line.final };
        setLog(list => {
          const next = list.some(e => e.id === entry.id) ? list.map(e => e.id === entry.id ? entry : e) : [...list.slice(-199), entry];
          return entry.final && !entry.text ? next.filter(e => e.id !== entry.id) : next;
        });
        // A finished line: did it perform the waiting card? If not, the card waits for the floor (cards.js).
        if (line.final) { platoHeard.current = heard.current; platoEndAt.current = Date.now(); cardSpoken(line.text); cardNudge(); }
        if (line.spoken) { void bridge.current?.agentSaid(line.spoken, { interrupted: line.interrupted }); liveReading.current?.platoSaid(line.spoken); }
        // His line shows a sentence at a time, as he starts it: a change means he is between sentences.
        if (nextBoard.current) boardNow();
        // Plato talking means the voice works again; without a microphone the reason stays up.
        if (line.text && !live.textOnly) clear();
      },
      onError: message => { if (session.current !== live) return; if (message) setError(message); else clear(); },
      onClose: ended => {
        if (session.current !== live) return;
        session.current = null;
        level.current = 0;
        setState('idle');
        const next = afterVoiceClose({ ...ended, failures: away.current.failures });
        away.current.failures = next.failures;
        if (next.action === 'reconnect') {
          away.current.mode = 'retrying';
          away.current.timer = setTimeout(connect, next.delayMs);
          // Nothing for the person to do yet, so do not ask them to click.
        } else if (next.action === 'rest') {
          away.current.mode = 'resting';
        } else if (next.action === 'wait') {
          away.current.mode = 'waiting';
          // Having given up, it says so plainly, over the line about the microphone a text-only conversation leaves up.
          setError(message => next.gaveUp ? GAVE_UP : message || ENDED);
        }
      },
      onEvent: event => {
        if (event.type === 'voice.started' && session.current === live) brief();
        // What the student said (noise heard as "..." is not speech, and is neither shown nor sent on). Under an
        // open question it hands in their writing for it (not their notes on Plato's material) with it; otherwise, or
        // under an exam problem (handed in only when they're done), their writing stays, and Plato's glances cover it. The words are already his turn, so the reading follows as
        // context, unless he asked for it meanwhile (collect_page_work): then it is the turn he is waiting for.
        if (event.type === 'voice.transcript' && event.role === 'user' && session.current === live && event.text?.trim()) {
          const text = event.text.trim(), ask = now.current.page?.ask, strokes = fresh(ownWork());
          if (echoes.current.delete(echo(text)) || !isSpeech(text)) return;
          said(text);
          if (ask && !ask.answered && !ask.parts && strokes.length && !sending.current) {
            sending.current = true;
            void commit(strokes, text).then(words => `[Written on the page] ${words || '(unreadable)'}`, () => { void bridge.current?.userSaid(text); return "[Written on the page] (it couldn't be read)"; })
              .then(line => sending.current === 'awaited' ? toAgent(line) : context(line)).finally(() => { sending.current = false; });
          } else void bridge.current?.userSaid(text);
        }
      },
      clientTools: tools,
    }, voice);
    session.current = live;
    live.setListening(talking?.current ?? false); // the talk button's state carries over to a new conversation
    void live.start();
  }

  // Pressing the mosaic starts Plato; while he can only read what is typed (no microphone), it asks for the microphone
  // again, inside the press, so the browser's prompt can appear. So does the microphone being allowed at last.
  function again() {
    const old = session.current;
    if (old?.textOnly && !VOICE.textOnly) { session.current = null; void old.close(); } // a chosen text chat is never restarted (its mic is the page's own)
    connect();
  }

  // Being there: a touch retries at once, coming back ends a rest, and a microphone allowed at last is used. Listening
  // until the returned function stops it.
  function listen() {
    const touch = () => { if (session.current) session.current.enableAudio(); else connect(); };
    const present = () => { if (!session.current && away.current.mode === 'resting') connect(); };
    let permission = null;
    // The microphone allowed at last: a conversation without one gives way to one with a voice.
    const granted = () => { if (permission?.state === 'granted') again(); };
    navigator.permissions?.query({ name: 'microphone' })
      .then(status => { permission = status; status.addEventListener('change', granted); }).catch(() => {});
    document.addEventListener('pointerdown', touch);
    document.addEventListener('keydown', touch);
    document.addEventListener('pointermove', present, { passive: true });
    document.addEventListener('visibilitychange', present);
    window.addEventListener('focus', present);
    return () => {
      permission?.removeEventListener('change', granted);
      document.removeEventListener('pointerdown', touch);
      document.removeEventListener('keydown', touch);
      document.removeEventListener('pointermove', present);
      document.removeEventListener('visibilitychange', present);
      window.removeEventListener('focus', present);
    };
  }
  return { connect, again, listenPresence: listen, resumeVoice };
}
