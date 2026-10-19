// Plato's replies (13 Oct: ElevenLabs credits ran out and the user asked for text with "a stronger reasoning model"), on the
// student's own subscription: the Claude Code CLI headless (`claude -p`), or ChatGPT through Codex (backend/agents.mjs); no API key. The same brief and tools
// as the voice agent; its text streams out as it is written (onText), its tool calls come after it.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { actorPrompt, faceLine, ACTOR_TOOLS, toolList } from './agent.mjs';
import { PROVIDER, ask, LIMIT, claudeEnv } from '../agents.mjs';

const MARK = '@@TOOLS', THINK = '@@PLAN', SAY = '@@SAY'; // "@@THINK … a Thinking box" was refused by Opus's safeguards (13 Oct); a plan note to the student is fine
const params = t => Object.entries(t.parameters?.properties || {}).map(([k, v]) => `${k}${(t.parameters.required || []).includes(k) ? '' : '?'}: ${v.enum ? v.enum.join('|') : v.type}`).join(', ');
const HARNESS = `\n\nTEXT CHAT (this time there is no voice: they read what you write, and type back). Write as a tutor writes in a chat: short paragraphs (in the Lesson face, as much as the lesson needs), markdown and $math$ welcome; the detail still goes on the page (write). Ignore anything in your brief about speaking aloud or pacing for voice.

HOW TO REPLY, in three parts, each starting on a line of its own:
${THINK}
a one- or two-sentence note to the student that starts with the problem they're on, by its numbers, then says what you'll do in this reply and why (for example: "Still on 6.0 × −1.5: your exponent field is one too small; I'll show where the +1 comes from, then you finish the encode."). It appears above your message while you write it.
${SAY}
your message to them (it appears as you write it).
${MARK}
a JSON array of the tools you call now, in order, each {"tool": "<name>", ...its parameters} (diagram_data as a JSON string), or [] for none. A tool marked [returns a result] sends its result back as a [Tool result] line and you go on with the same turn: what you wrote is already shown, so write only what is new ("" is fine). write, show, circuit, anatomy and animate come back only if they fail: say your piece before them, then the turn is theirs. After you ask a question, wait for their answer: never follow it with a nudge, a reminder or "take your time". Your tools:
${ACTOR_TOOLS.map(t => `- ${t.name}(${params(t)})`).join('\n')}

Their descriptions:
${toolList}`;

// The next turn's claude started ahead, waiting on stdin (17 Oct: its start-up and first connection cost about 1s of every reply's
// first word); one at a time, for the same brief, never older than 10 minutes.
let warm = null;
function claudeFor(args) {
  const start = () => ({ args: JSON.stringify(args), at: Date.now(), child: spawn('claude', [...args, '--input-format', 'stream-json'], { cwd: mkdtempSync(path.join(tmpdir(), 'plato-claude-')), env: claudeEnv(), stdio: ['pipe', 'pipe', 'pipe'] }) });
  const ready = warm?.args === JSON.stringify(args) && warm.child.exitCode === null && Date.now() - warm.at < 600_000 ? warm : (warm?.child.kill(), start());
  warm = start(); warm.child.unref();
  return ready.child;
}

/** Claude's reply streamed: onDelta(text) as it is written; resolves with the whole text. In an empty folder (claudeFor): no
 *  project files, settings or memory of anyone's. PLATO_CLAUDE_EFFORT (low|medium|high): how long it thinks before its first word
 *  (17 Oct: thinking is most of the wait; unset keeps the CLI's default). */
function claudeStream(system, input, { model, onDelta, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = claudeFor(['-p', '--no-session-persistence', '--model', model, '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--tools', '', ...(process.env.PLATO_CLAUDE_EFFORT ? ['--effort', process.env.PLATO_CLAUDE_EFFORT] : []), '--strict-mcp-config', '--setting-sources', '', '--system-prompt', system]);
    let buffer = '', result = null, err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Claude took too long.')); }, timeoutMs);
    child.stdout.on('data', chunk => {
      buffer += chunk;
      for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
        const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'stream_event' && e.event?.delta?.type === 'text_delta') onDelta(e.event.delta.text);
        else if (e.type === 'result') result = e;
      }
    });
    child.stderr.on('data', d => { err += d; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (!result || result.is_error || code !== 0) return reject(Object.assign(new Error(`Claude failed (${code}): ${String(result?.result || err).slice(0, 200)}`), { limit: LIMIT.test(result?.result || err) }));
      resolve(String(result.result || ''));
    });
    child.stdin.end(`${JSON.stringify({ type: 'user', message: { role: 'user', content: input } })}\n`);
  });
}

/** One turn: { say, think, lost, tools }, on the student's provider (backend/agents.mjs). onText(delta) gets the message as it is
 *  written, onThink(delta) the plan note. Throws when the model can't answer. */
export function claudeActor({ context = [], dialogue = [], brief = '', face = null }, { model = process.env.PLATO_CLAUDE_MODEL || 'opus', onText = () => {}, onThink = () => {}, timeoutMs = 300_000 } = {}) {
  // The reply's form last, where it is read last (14 Oct: after a long conversation it sometimes wrote none of its marks).
  const input = `CONTEXT UPDATES you have received (oldest first; they are information, not turns):\n\n${context.join('\n\n---\n\n')}\n\nTHE CONVERSATION (oldest first):\n${dialogue.join('\n')}\n\n${faceLine(face) ? `${faceLine(face)}\n` : ''}Your turn. Reply in your three parts: ${THINK}, ${SAY}, ${MARK}.`;
  const system = `${actorPrompt(brief)}${HARNESS}`;
  let full = '', shown = 0, thought = 0;
  // The text so far without a mark's first letters at its end ("@@TO" until the rest comes), split into its thinking and its message.
  const parts = (text, final = false) => {
    let end = text.length;
    if (!final) { const at = text.lastIndexOf('@'); if (at >= 0 && end - at < 8 && !/\s/.test(text.slice(at))) end = at - (text[at - 1] === '@' ? 1 : 0); }
    const t = text.slice(0, end), tools = t.indexOf(MARK), body = tools >= 0 ? t.slice(0, tools) : t, think = body.indexOf(THINK), say = body.indexOf(SAY);
    let r;
    if (say >= 0) r = { think: think >= 0 ? body.slice(think + THINK.length, say) : body.slice(0, say), say: body.slice(say + SAY.length) };
    else if (think >= 0) { // a message without its mark: the plan is its first paragraph (known at the end)
      const plan = body.slice(think + THINK.length), gap = final ? plan.trim().search(/\n\s*\n/) : -1;
      r = gap >= 0 ? { think: plan.trim().slice(0, gap), say: plan.trim().slice(gap) } : { think: plan, say: '' };
    } else r = { think: '', say: body }; // no marks: all of it is the message
    // Tools written without their mark, as a JSON array at the end, never show (14 Oct: one showed in the chat and never ran).
    const json = tools < 0 ? r.say.search(/\n\s*\[\s*(\{|\]|$)/) : -1;
    if (json >= 0) r.say = r.say.slice(0, json);
    return r;
  };
  const onDelta = d => {
    full += d;
    const now = parts(full), think = now.think.replace(/^\s+/, ''), say = now.say.replace(/^\s+/, '');
    if (think.length > thought) { onThink(think.slice(thought)); thought = think.length; }
    if (say.length > shown) { onText(say.slice(shown)); shown = say.length; }
  };
  const stream = PROVIDER === 'codex' ? ask(system, input, { lane: 'actor', onText: onDelta, timeoutMs }) : claudeStream(system, input, { model, onDelta, timeoutMs });
  return stream.then(whole => {
    const text = String(whole || full), at = text.indexOf(MARK), last = parts(text, true), say = last.say.trim(), think = last.think.trim();
    if (think.length > thought) onThink(think.slice(thought));
    if (say.length > shown) onText(say.slice(shown));
    let tools = [];
    const raw = (at >= 0 ? text.slice(at + MARK.length) : text.match(/\n\s*(\[\s*(?:\{[\s\S]*\}\s*)?\])\s*$/)?.[1] || '').replace(/^\s*```(?:json)?|```\s*$/g, '').trim();
    // A block that doesn't parse whole keeps its longest parsable prefix, and he hears what was lost (17 Oct, from the logs: a
    // stray "]]" dropped a whole board while he said it was up; tools written as prose in the message never ran).
    let lost = null;
    try { tools = JSON.parse(raw || '[]'); } catch {
      tools = [];
      for (let i = raw.lastIndexOf('}'); i > 0; i = raw.lastIndexOf('}', i - 1)) { try { tools = JSON.parse(`${raw.slice(0, i + 1).replace(/^[^[]*/, '')}]`); break; } catch { /* shorter */ } }
      lost = 'Your tools block did not parse as JSON';
    }
    if (/\[Tool \w+[:\s]/.test(say) && !tools.length) lost = 'You wrote tool calls as text in your message instead of in @@TOOLS';
    const names = new Set(ACTOR_TOOLS.map(t => t.name).concat('skip_turn'));
    return { say, think, lost, tools: (Array.isArray(tools) ? tools : []).filter(t => t && names.has(t.tool)).map(t => ({ ...t, ...(t.diagram_data && typeof t.diagram_data !== 'string' ? { diagram_data: JSON.stringify(t.diagram_data) } : {}) })) };
  });
}
