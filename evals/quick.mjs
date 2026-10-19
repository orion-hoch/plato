// Quick, parallel checks: short scenarios through the stand-in at once (each its own sandbox and port), each judged by the
// tutor judge the moment it ends, one line per scenario as results come in. For fast fix-and-retry loops.
// node evals/quick.mjs [scenario ...] [--turns 6] [--port 5210]     (default: every evals/scenarios/q-*.json)
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { HERE } from './common.mjs';

const ROOT = path.resolve(HERE, '..'), args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const turns = Number(opt('--turns', 6)), base = Number(opt('--port', 5210));
const named = args.filter((a, i) => !a.startsWith('--') && !['--turns', '--port'].includes(args[i - 1]));
const scenarios = named.length ? named : (await readdir(path.join(HERE, 'scenarios'))).filter(f => /^q-.*\.json$/.test(f)).map(f => f.replace(/\.json$/, ''));

const run = (cmd, argv) => new Promise(resolve => {
  const child = spawn(cmd, argv, { cwd: ROOT, env: process.env });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.on('close', code => resolve({ code, out }));
});

const t0 = Date.now();
console.log(`${scenarios.length} scenarios, ${turns} turns each, in parallel`);
await Promise.all(scenarios.map(async (name, i) => {
  const r = await run('node', ['--no-warnings', '--env-file-if-exists=.env', 'evals/stand-in.mjs', name, '--turns', String(turns), '--no-judge', '--port', String(base + i)]);
  const dir = r.out.match(/evals\/runs\/[^\s]+-cards/)?.[0];
  if (!dir) { console.log(`✗ ${name}: no run (${r.out.split('\n').filter(l => /error|Error|incident/.test(l)).slice(-1)[0] || `exit ${r.code}`})`); return; }
  await run('node', ['--no-warnings', '--env-file-if-exists=.env', 'evals/tutor-judge.mjs', dir]);
  const j = JSON.parse(await readFile(path.join(ROOT, dir, 'judge.json'), 'utf8').catch(() => 'null'));
  if (!j) { console.log(`? ${name}: judge failed (${dir})`); return; }
  const scores = (j.principles || []).map(p => `${p.score ?? '?'}${p.occasion === false ? '*' : ''}`).join(' ');
  const worst = (j.worst || []).map(w => `${w.at} "${w.quote}": ${w.why}`).slice(0, 2).join(' | ');
  console.log(`${j.pass ? '✓' : '✗'} ${name.padEnd(16)} ${String(j.total ?? '?').padStart(2)}/${(j.principles || []).length * 2}  [${scores}]  ${Math.round((Date.now() - t0) / 1000)}s  ${dir}\n    worst: ${String(worst).slice(0, 400)}`);
}));
