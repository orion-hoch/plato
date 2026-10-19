// The replay: the guide-mode scenarios through the stand-in (no ElevenLabs), one after another, each on its own sandbox
// (stand-in.mjs makes it and deletes it), then the tutor judge on each run. Writes evals/runs/replay-<time>/summary.md.
// node evals/replay.mjs [scenario ...] [--turns N] [--port N]
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRuntime } from '../server/runtime.mjs';
import { HERE } from './common.mjs';
import { judgeRun, PRINCIPLES } from './tutor-judge.mjs';

const SCENARIOS = ['fresh-know-nothing', 'frustrated-lost', 'wants-practice', 'steady-learner'];
const argv = process.argv.slice(2), option = flag => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null;
const named = argv.filter((a, i) => !a.startsWith('--') && !['--turns', '--port'].includes(argv[i - 1]));
const scenarios = named.length ? named : SCENARIOS, turns = option('--turns') || '12', port = option('--port');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), out = path.join(HERE, 'runs', `replay-${stamp}`);
const runsDir = path.join(HERE, 'runs');

const standIn = name => new Promise(resolve => {
  const child = spawn(process.execPath, ['--no-warnings', '--env-file-if-exists=.env', 'evals/stand-in.mjs', name, '--no-judge', '--turns', turns, ...(port ? ['--port', port] : [])], { cwd: path.resolve(HERE, '..'), stdio: 'inherit' });
  child.on('exit', resolve);
});
// The run the stand-in just wrote: the newest evals/runs/<time>-<slug>-cards made since it started.
async function newestRun(slug, since) {
  const dirs = (await readdir(runsDir)).filter(d => d.endsWith(`-${slug}-cards`));
  const made = await Promise.all(dirs.map(async d => ({ d, t: (await stat(path.join(runsDir, d))).mtimeMs })));
  return made.filter(x => x.t >= since).sort((a, b) => b.t - a.t)[0]?.d ?? null;
}

const results = [];
for (const name of scenarios) {
  console.log(`\n=== ${name} ===`);
  const since = Date.now(), code = await standIn(name), dir = await newestRun(name, since);
  results.push({ name, dir, code });
  if (!dir) console.error(`${name}: no run written (exit ${code})`);
}

const runtime = createRuntime();
try {
  for (const r of results.filter(r => r.dir)) {
    console.log(`judging ${r.dir}…`);
    r.judge = await judgeRun(runtime, JSON.parse(await readFile(path.join(runsDir, r.dir, 'run.json'), 'utf8'))).catch(error => ({ error: error.message }));
    if (!r.judge.error) await writeFile(path.join(runsDir, r.dir, 'judge.json'), JSON.stringify(r.judge, null, 2));
  }
} finally { await runtime.close(); }

const s = x => x == null ? '-' : (x / 1000).toFixed(1);
const head = `| scenario | ${PRINCIPLES.map((_, i) => `P${i + 1}`).join(' | ')} | total | pass | first reply p50/p95 s | next card p50/p95 s | run |`;
const rows = results.map(({ name, dir, judge: j }) => !j || j.error
  ? `| ${name} | ${PRINCIPLES.map(() => '-').join(' | ')} | - | ${j?.error ? `judge failed: ${j.error.slice(0, 80)}` : 'no run'} | - | - | ${dir ?? '-'} |`
  : `| ${name} | ${j.principles.map(p => `${p.score}${p.occasion ? '' : '*'}`).join(' | ')} | ${j.total}/16 | ${j.pass ? 'PASS' : 'FAIL'} | ${s(j.latency.firstReply.p50)} / ${s(j.latency.firstReply.p95)} | ${s(j.latency.nextCard.p50)} / ${s(j.latency.nextCard.p95)} (${j.latency.nextCard.n}) | ${dir} |`);
const details = results.filter(r => r.judge && !r.judge.error).map(({ name, judge: j }) =>
  `## ${name}\n\n${j.summary}\n\n${j.principles.map(p => `- P${p.id} (${p.score}): ${p.reason}`).join('\n')}\n\nWorst moments:\n${j.worst.map(w => `- ${w.at} "${w.quote}": ${w.why}`).join('\n')}`).join('\n\n');
const md = `# Replay ${stamp}\n\n${results[0]?.judge?.version ?? ''} · ${turns} turns · \`*\` = no occasion to test\n\n${PRINCIPLES.map((p, i) => `P${i + 1}. ${p}`).join('\n')}\n\n${head}\n|${'---|'.repeat(PRINCIPLES.length + 6)}\n${rows.join('\n')}\n\n${details}\n`;
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'summary.md'), md);
console.log(`\n${md}\nwritten: ${path.relative(process.cwd(), path.join(out, 'summary.md'))}`);
