import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { s, validate } from '../core/shape.mjs';
import { AppError } from '../core/errors.mjs';

// The student's C, run for the code zone (and an exam author's C, to check an answer that is a program's output):
// compiled in a fresh folder, then run under macOS's sandbox with no network, no writing to any file, no other
// program started, two seconds and 64 KB of output at most. Without the sandbox nothing runs.
// ponytail: one program at a time; a small pool if several students ever share a server.

const SANDBOX = '/usr/bin/sandbox-exec', COMPILE_MS = 10_000, RUN_MS = 2_000, CAP = 64 * 1024;
const RUN = s.object({ language: s.enum(['c']), source: s.string({ min: 1, max: 20_000 }), stdin: s.string({ max: 4_000 }) }, { optional: ['stdin'] });
// Nothing of the student's home folder is read (19 Oct audit: `#include "/Users/…/.ssh/id_rsa"` printed it in the compiler's
// errors), except node's own install when it lives there (nvm).
const HOME = realpathSync(homedir()), NODE = realpathSync(path.dirname(path.dirname(process.execPath)));
const fenced = `(deny network*)
(deny file-read* (subpath "${HOME}"))${NODE.startsWith(HOME) ? `\n(allow file-read* (subpath "${NODE}"))` : ''}`;
const profile = program => `(version 1)
(allow default)
${fenced}
(deny file-write* (require-not (literal "/dev/null")))
(deny process-fork)
(deny process-exec (require-not (literal "${program}")))`;
// The compiler: it writes only in its folder and the temporary folder (its intermediate files).
const compiling = dir => `(version 1)
(allow default)
${fenced}
(deny file-write* (require-all (require-not (subpath "/private/var/folders")) (require-not (subpath "/private/tmp")) (require-not (subpath "${dir}")) (require-not (literal "/dev/null"))))`;

// One process to its end, its time or its output limit: whichever comes first.
function exec(command, args, { cwd, input = '', ms }) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = { stdout: '', stderr: '' };
    let timedOut = false, over = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, ms);
    for (const name of ['stdout', 'stderr']) child[name].on('data', chunk => {
      if (out.stdout.length + out.stderr.length >= CAP) { over = true; child.kill('SIGKILL'); return; }
      out[name] += chunk.toString('utf8');
    });
    child.on('error', problem => { clearTimeout(timer); resolve({ ...out, stderr: problem.message, exitCode: null, timedOut }); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (over) out.stderr += '\n(output cut off at 64 KB)';
      resolve({ ...out, exitCode: code ?? (signal ? 128 : null), timedOut });
    });
    child.stdin.on('error', () => {}); // a program that exits without reading its input
    child.stdin.end(input);
  });
}

let line = Promise.resolve();
export function runC({ source, stdin = '' }) {
  const turn = line.then(() => compileAndRun(source, stdin));
  line = turn.catch(() => {});
  return turn;
}

/**
 * Model-written JavaScript (a Study's checks, task families and wrong-model rules, backend/understanding): a separate
 * `node` process under the same sandbox as C (no network, no file writes, no other program), `ms` and 64 KB of output
 * at most, a small heap. Node's vm module is not a boundary, so it is never used for this. → { ok, stdout, stderr, timedOut }.
 */
export async function runJs({ source, ms = 5_000 }) {
  if (!existsSync(SANDBOX)) throw new AppError('provider_unavailable', 'Running JavaScript needs macOS sandbox-exec, which is not here.');
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'luna-js-')));
  try {
    await writeFile(path.join(dir, 'prog.mjs'), source);
    const ran = await exec(SANDBOX, ['-p', profile(process.execPath), process.execPath, '--max-old-space-size=128', 'prog.mjs'], { cwd: dir, ms });
    return { ok: ran.exitCode === 0 && !ran.timedOut, stdout: ran.stdout, stderr: ran.stderr.replaceAll(`${dir}/`, ''), timedOut: ran.timedOut };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function compileAndRun(source, stdin) {
  if (!existsSync(SANDBOX)) throw new AppError('provider_unavailable', 'Running C needs macOS sandbox-exec, which is not here.');
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'luna-run-')));
  const tidy = text => text.replaceAll(`${dir}/`, '');
  try {
    await writeFile(path.join(dir, 'prog.c'), source);
    const built = await exec(SANDBOX, ['-p', compiling(dir), 'cc', '-std=c17', '-O0', '-Wall', '-o', 'prog', 'prog.c'], { cwd: dir, ms: COMPILE_MS });
    if (built.exitCode !== 0) return { ok: false, phase: 'compile', stdout: '', stderr: tidy(built.stderr || (built.timedOut ? 'Compiling took too long.' : '')), exitCode: built.exitCode, timedOut: built.timedOut };
    const program = path.join(dir, 'prog');
    const ran = await exec(SANDBOX, ['-p', profile(program), program], { cwd: dir, input: stdin, ms: RUN_MS });
    const warnings = tidy(built.stderr).trim();
    return { ok: ran.exitCode === 0 && !ran.timedOut, phase: 'run', stdout: ran.stdout, stderr: [warnings, ran.stderr].filter(Boolean).join('\n'), exitCode: ran.exitCode, timedOut: ran.timedOut };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function installRun(app) {
  app.services.run = {
    async run(principal, sessionId, body) {
      validate(RUN, body);
      const session = app.services.session.get(principal, sessionId);
      if (session.status === 'ended') throw new AppError('invalid_input', 'This session has ended.');
      return runC({ source: body.source, stdin: body.stdin || '' });
    },
  };
}
