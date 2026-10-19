// What reaches Plato, and how (docs/director-actor.md): the student's turns (toAgent; tellSoon when he must not be cut off)
// and context lines, information never a turn (context: coalesced, and never the same line twice in a row). later():
// what he asked for, his turn if he is waiting for it, else context.

// Context lines that come this close together reach Plato as one update.
const CONTEXT_MS = 1500;
import { liveTasks } from '../elements/Element.jsx';
import { liveReading } from '../elements/Reading.jsx';

// The SDK's echo of a message this page sent, matched however its spacing came back.
export const echo = text => String(text).replace(/\s+/g, ' ').trim();

export function createChannel({ heard, spokeAt, setLog, session, echoes, waiting, lastState, telling }) {
  // A line of the student's in the conversation: what they said, typed or answered on the page. An element waiting for
  // their prediction takes it as one; a reading notes a question asked while reading.
  function said(text) {
    heard.current++; spokeAt.current = Date.now();
    for (const task of liveTasks) task.hear(text);
    liveReading.current?.hear(text);
    setLog(list => [...list.slice(-199), { id: crypto.randomUUID(), who: 'me', text, final: true }]);
  }
  // Plato hears it as the student's turn; false when no conversation could take it.
  function toAgent(text) {
    const sent = session.current?.sendUserMessage(text);
    if (sent) echoes.current.add(echo(text));
    return Boolean(sent);
  }
  // A turn that must not cut Plato off, or that came with no conversation to hear it: said when he stops speaking,
  // or when a conversation starts.
  function tellSoon(text) { waiting.current.push(text); if (lastState.current === 'listening') flush(); }
  function flush() { if (waiting.current.length && toAgent(waiting.current.join('\n'))) waiting.current = []; }
  // Every context line (information for Plato, not a turn) goes through context(): lines that come within CONTEXT_MS of
  // the first go as one update, and a line just like the one before it is dropped. contextNow() sends what waits at once.
  function context(text) {
    const c = telling.current;
    if (typeof text !== 'string' || !text.trim() || text === c.last || c.lines.includes(text)) return;
    c.lines.push(c.last = text);
    c.timer ||= setTimeout(contextNow, CONTEXT_MS);
  }
  function contextNow() {
    const c = telling.current;
    clearTimeout(c.timer); c.timer = 0;
    if (c.lines.length) session.current?.sendContext(c.lines.join('\n\n'));
    c.lines = [];
  }
  // Something Plato asked for that came later (`asked`: when he asked): his turn if he is waiting for it and the
  // student has not spoken since (no dead air), else context.
  function later(asked, line) {
    if (heard.current === asked?.heard && lastState.current === 'listening') toAgent(line); else context(line);
  }
  return { said, toAgent, tellSoon, flush, context, contextNow, later };
}
