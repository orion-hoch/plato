// Plato's scratch computation (15 Oct, the user: "false info is bad"): a short JavaScript program he writes to check a claim
// before he states it (brute-force a relation's properties, count, test a set identity on examples, do the arithmetic). It runs
// in a separate node process, in a fresh vm context (no require, process, files or network), with a time and memory limit.
// vm is not a security boundary (one line reaches `process`), so the process itself runs under Node's permission model
// (--permission): no files read or written, no child processes, no workers or addons; uploaded material is untrusted and could
// talk Plato into running anything. ponytail: the network is still open (Node 24 has no --allow-net); a WASM sandbox
// (QuickJS, Pyodide for Python) if that matters.
import { spawn } from 'node:child_process';

const RUNNER = `const vm = require('node:vm'); let code = ''; process.stdin.on('data', d => code += d).on('end', () => {
  const out = []; const say = (...a) => out.push(a.map(x => typeof x === 'string' ? x : (() => { try { return JSON.stringify(x, (k, v) => typeof v === 'bigint' ? v + 'n' : Object.prototype.toString.call(v) === '[object Set]' ? [...v] : Object.prototype.toString.call(v) === '[object Map]' ? Object.fromEntries(v) : v); } catch { return String(x); } })()).join(' '));
  try { const v = vm.runInNewContext(code, { console: { log: say, error: say } }, { timeout: 4000 }); if (v !== undefined) say(v); process.stdout.write(out.join('\\n')); }
  catch (e) { process.stdout.write(out.join('\\n') + (out.length ? '\\n' : '') + 'Error: ' + (e && e.message || e)); }
});`;

/** Runs `code` (JavaScript; console.log and the last expression's value are its output) → the output, clipped. */
export function compute(code, { timeoutMs = 6000 } = {}) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--permission', '--max-old-space-size=256', '-e', RUNNER], { stdio: ['pipe', 'pipe', 'pipe'], env: {} });
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(`${out}\nStopped: it ran past ${timeoutMs / 1000} s.`.trim()); }, timeoutMs);
    child.stdout.on('data', d => { out += d; if (out.length > 20_000) child.kill('SIGKILL'); });
    child.on('close', () => { clearTimeout(timer); resolve(out.length > 4000 ? `${out.slice(0, 4000)}\n… (cut at 4,000 characters)` : out || '(no output: console.log what you want to see)'); });
    child.stdin.end(String(code));
  });
}
