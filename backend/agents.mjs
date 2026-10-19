// Every model call Plato makes that isn't a light lane (server/runtime.mjs): his turns, the course build and its kits, figures,
// animations, a colleague's checks. All of it runs on the student's own subscription through its CLI, never an API key
// (19 Oct, the owner: "an open source harness that they just connect their claude or openai subscription into"):
// PLATO_PROVIDER=claude (Claude Code, `claude -p`) or codex (ChatGPT, `codex exec` and `codex app-server`).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, modelSettings } from '../server/runtime.mjs';
import { cliEnvironment } from '../server/codex.mjs';

export const PROVIDER = process.env.PLATO_PROVIDER === 'codex' ? 'codex' : 'claude';

// The callers name Claude's tiers; on ChatGPT each is the nearest model (LUNA_DEEP / LUNA_LIGHT, server/runtime.mjs).
const codexModel = name => { const { deep, light } = modelSettings(); return name === 'haiku' ? light.model : name === 'opus' || name === 'sonnet' ? deep.model : name; };

// Agents with files run in the OS sandbox, fenced to their folder: they write only there, read nothing else of the student's
// home folder (only the system, this app's tools and the folders a caller names) and reach no network, so uploaded material
// steering them (a poisoned PDF) can't read or touch the rest of the machine. Any command runs inside the fence (19 Oct: a list
// of allowed programs stopped "python3 x.py | tee out" and added nothing, since python3 and node were on it).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readable = (cwd, dirs) => [cwd, ...dirs, path.join(ROOT, 'tools'), path.dirname(path.dirname(process.execPath)), // node, wherever it is installed
  ...['Library/TinyTeX', '.local/share/uv'].map(d => path.join(homedir(), d))].filter(d => existsSync(d));
// Claude: its shell under the sandbox's read and write fences; its Read, Glob and Grep reach only the working folders (cwd and
// --add-dir), since dontAsk refuses everything not allowed here; Write and Edit only inside cwd.
const claudeSettings = (cwd, dirs) => JSON.stringify({ sandbox: { enabled: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false, filesystem: { denyRead: [homedir()], allowRead: readable(cwd, dirs) } } });
// Codex: a permission profile with the same fences.
const codexFence = (cwd, dirs) => ['-c', 'default_permissions="plato"', '-c', `permissions.plato.filesystem={${[['":root"', 'read'], ['"~"', 'deny'], ...readable(cwd, dirs).map(d => [JSON.stringify(d), 'read'])].map(([k, v]) => `${k}="${v}"`).join(', ')}, ":workspace_roots"={"."="write"}}`, '-c', 'permissions.plato.network.enabled=false'];

const kill = child => () => child.kill('SIGTERM');
function lines(stream, each) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    buffer += chunk;
    for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
      const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      each(e);
    }
  });
}

/**
 * One headless agent working in `cwd` with file tools: `brief` is its standing instructions, `task` its first message.
 * dirs: other folders it reads (a skill). onStep({ name: 'Read'|'Write'|'Edit'|'Bash'|…, input: { file_path, command } }) for
 * each tool call, as it happens. Resolves with its last message; rejects when it fails or runs past `timeoutMs`.
 */
export function agent(cwd, brief, task = 'Begin.', { model = process.env.LUNA_CLAUDE_MODEL || 'opus', effort = 'high', timeoutMs = 40 * 60_000, dirs = [], onStep = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = PROVIDER === 'codex'
      ? spawn(process.env.CODEX_BIN?.trim() || 'codex', ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--cd', cwd,
        '-m', codexModel(model), ...codexFence(cwd, dirs), '-c', 'web_search="disabled"',
        '-c', 'approval_policy="never"', '-c', `model_reasoning_effort=${JSON.stringify(effort)}`, '-c', 'project_doc_max_bytes=0',
        '-c', `developer_instructions=${JSON.stringify(brief)}`, ...dirs.flatMap(d => ['--add-dir', d]), '-'], { cwd, env: cliEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn('claude', ['-p', '--model', model, '--output-format', 'stream-json', '--verbose',
        '--tools', 'Read,Write,Edit,Glob,Grep,Bash', '--allowedTools', `Bash,Edit(/${cwd}/**)`,
        '--permission-mode', 'dontAsk', ...dirs.flatMap(d => ['--add-dir', d]), '--strict-mcp-config', '--setting-sources', '', '--settings', claudeSettings(cwd, dirs),
        '--append-system-prompt', brief], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let last = '', failed = null, err = '';
    const timer = setTimeout(kill(child), timeoutMs), stop = kill(child); // never left running on the plan after the server goes
    process.once('exit', stop);
    const step = (name, input) => { try { onStep({ name, input }); } catch { /* progress must not break the agent */ } };
    lines(child.stdout, e => {
      if (PROVIDER === 'codex') {
        const item = e.item || {};
        if (e.type === 'item.started' && item.type === 'command_execution') step('Bash', { command: item.command });
        else if (e.type === 'item.completed' && item.type === 'file_change') for (const c of item.changes || []) step(c.kind === 'add' ? 'Write' : 'Edit', { file_path: c.path });
        else if (e.type === 'item.completed' && item.type === 'agent_message') last = item.text || last;
        else if (e.type === 'turn.failed' || e.type === 'error') failed = e.error?.message || e.message || 'failed';
      } else if (e.type === 'assistant') { for (const c of e.message?.content || []) if (c.type === 'tool_use') step(c.name, c.input || {}); }
      else if (e.type === 'result') { last = String(e.result || ''); if (e.is_error) failed = last || 'failed'; }
    });
    child.stderr.on('data', d => { err = (err + d).slice(-2000); });
    child.on('error', error => { clearTimeout(timer); process.off('exit', stop); reject(error); });
    child.on('close', code => {
      clearTimeout(timer); process.off('exit', stop);
      if (code === 0 && !failed) resolve(last.trim()); else reject(Object.assign(new Error(`agent failed (${code}): ${String(failed || err).slice(0, 300)}`), { limit: /limit|quota|usage/i.test(failed || err) }));
    });
    child.stdin.end(task);
  });
}

// ChatGPT: one `codex app-server` for every tool-less call of this process, so a call pays for no start-up and its text streams.
let codexRuntime = null;

/**
 * One tool-less reply to `input` under `system`: its text. onText(delta) as it is written. lane: which Codex lane (its model
 * and effort, server/runtime.mjs runtimeRoles) a ChatGPT call takes; Claude takes `model`.
 */
export function ask(system, input, { model = 'opus', lane = 'heavy', effort, timeoutMs = 600_000, onText } = {}) {
  if (PROVIDER === 'codex') return (codexRuntime ??= createRuntime()).ask({ role: lane, instructions: system, input, onText, effort, timeoutMs }).then(r => r.text);
  const cwd = mkdtempSync(path.join(tmpdir(), 'plato-ask-')); // empty: no project files, settings or memory of anyone's
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', model, '--output-format', 'stream-json', '--verbose', ...(onText ? ['--include-partial-messages'] : []),
      ...(effort ? ['--effort', effort] : []), '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--system-prompt', system], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let result = null, err = '';
    const timer = setTimeout(kill(child), timeoutMs);
    lines(child.stdout, e => {
      if (e.type === 'stream_event' && e.event?.delta?.type === 'text_delta') { try { onText?.(e.event.delta.text); } catch { /* a UI callback must not break the call */ } }
      else if (e.type === 'result') result = e;
    });
    child.stderr.on('data', d => { err = (err + d).slice(-2000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0 && result && !result.is_error) resolve(String(result.result || '').trim());
      else reject(Object.assign(new Error(`${String(result?.result || err).slice(0, 300) || `claude exited ${code}`}`), { limit: /limit|quota|usage/i.test(result?.result || err) }));
    });
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

/** Is this machine's CLI for the provider installed and signed in? { ok, provider, detail }. For setup and the first-run screen. */
export function signedIn(provider = PROVIDER) {
  const [cmd, args] = provider === 'codex' ? ['codex', ['login', 'status']] : ['claude', ['auth', 'status']];
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
    child.on('error', () => resolve({ ok: false, provider, detail: `${cmd} is not installed` }));
    child.on('close', code => resolve({ ok: code === 0 && !/not logged in|logged out|no credentials|"loggedIn": false/i.test(out), provider, detail: provider === 'claude' ? (/"loggedIn": true/.test(out) ? 'Signed in to Claude' : 'Not signed in to Claude') : out.trim().split('\n')[0]?.slice(0, 200) || '' }));
  });
}
