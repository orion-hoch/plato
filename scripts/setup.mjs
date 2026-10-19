// npm run setup [-- --provider claude|codex] [--animations]: everything Plato needs on this machine, once. It picks the model
// provider (the Claude or ChatGPT subscription whose CLI is signed in here) into .env, installs the app, and fetches and builds
// the optional extras: the logic simulator (circuits), the anatomy skill (figures, and the browser check kits use), the shelf
// (libraries kits draw with). Manim (animations) only with --animations. Safe to run again: done steps are skipped.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flag = name => args.includes(`--${name}`), option = name => args[args.indexOf(`--${name}`) + 1];
// The tools are pinned to the commits Plato was tested with.
const CLONES = [
  { dir: 'tools/logic-sim', repo: 'https://github.com/jppellet/Logic-Circuit-Simulator', commit: '14790278b10971a6d0311d03efd2414659d8ee8f', what: 'circuits', done: 'simulator/lib/bundle.js', build: [['npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund']], ['node', ['tools/bundle.js', '--dist']]] },
  { dir: 'tools/anatomy', repo: 'https://github.com/wheresryan22/anatomy', commit: 'e6600ffc4e8e6620eeb45bf49bcdbd5e4b84163f', what: 'figures and kit checks', done: 'SKILL.md', build: [] },
];

const say = text => console.log(text), ok = text => say(`  ✓ ${text}`), warn = text => say(`  ! ${text}`);
const run = (cmd, argv, cwd = ROOT) => spawnSync(cmd, argv, { cwd, stdio: 'inherit' }).status === 0;
const quiet = (cmd, argv) => { const r = spawnSync(cmd, argv, { encoding: 'utf8' }); return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` }; };

say('Plato setup\n');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) { say(`Plato needs Node 22.13 or newer (this is ${process.versions.node}).`); process.exit(1); }
ok(`Node ${process.versions.node}`);

// 1. The provider: whichever subscription is signed in here; asked when both are.
const claude = quiet('claude', ['auth', 'status']), codex = quiet('codex', ['login', 'status']);
const signed = { claude: claude.ok && /"loggedIn": true/.test(claude.out), codex: codex.ok && /logged in/i.test(codex.out) };
let provider = option('provider');
if (!['claude', 'codex'].includes(provider)) {
  const both = signed.claude && signed.codex;
  provider = both ? null : signed.claude ? 'claude' : signed.codex ? 'codex' : null;
  if (both && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    provider = /^(2|c[oh])/i.test(await rl.question('  Both Claude and ChatGPT are signed in. Use 1) Claude or 2) ChatGPT? [1] ')) ? 'codex' : 'claude';
    rl.close();
  } else if (both) provider = 'claude';
}
if (!provider || !signed[provider]) {
  say(`
  Plato runs on your own Claude or ChatGPT subscription, through its command-line tool. Sign in to one, then run setup again:
    Claude:  npm install -g @anthropic-ai/claude-code   then   claude   (and log in)
    ChatGPT: npm install -g @openai/codex               then   codex login`);
  process.exit(1);
}
ok(`Models: ${provider === 'claude' ? 'Claude (claude CLI)' : 'ChatGPT (codex CLI)'}`);
const envFile = path.join(ROOT, '.env');
if (!existsSync(envFile)) copyFileSync(path.join(ROOT, '.env.example'), envFile);
const env = readFileSync(envFile, 'utf8');
writeFileSync(envFile, /^PLATO_PROVIDER=.*$/m.test(env) ? env.replace(/^PLATO_PROVIDER=.*$/m, `PLATO_PROVIDER=${provider}`) : `PLATO_PROVIDER=${provider}\n${env}`);

// 2. The app.
if (!existsSync(path.join(ROOT, 'node_modules/vite')) && !run('npm', ['install', '--no-audit', '--no-fund'])) { say('npm install failed.'); process.exit(1); }
ok('App installed');

// 3. Extras: each is optional; Plato says so and draws another way when one is missing.
for (const c of CLONES) {
  const dir = path.join(ROOT, c.dir);
  if (existsSync(path.join(dir, c.done))) { ok(`${c.dir} (${c.what})`); continue; }
  if (!existsSync(dir) && !(run('git', ['clone', '--quiet', c.repo, dir]) && run('git', ['checkout', '--quiet', c.commit], dir))) { warn(`couldn't fetch ${c.repo}: no ${c.what}`); continue; }
  if (c.build.every(([cmd, argv]) => run(cmd, argv, dir)) && existsSync(path.join(dir, c.done))) ok(`${c.dir} (${c.what})`); else warn(`${c.dir} didn't build: no ${c.what}`);
}
const shelf = path.join(ROOT, 'tools/shelf');
if (existsSync(path.join(shelf, 'lib/d3.js'))) ok('Kit libraries (tools/shelf)');
else if (run('npm', ['ci', '--no-audit', '--no-fund'], shelf) && run('node', ['build.mjs'], shelf)) ok('Kit libraries (tools/shelf)');
else warn('the kit libraries did not install: courses get no kits');
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', process.env.CHROME_PATH].some(p => p && existsSync(p));
if (chrome) ok('Chrome (figures and kits are checked in it)'); else warn('no Chrome found: figures and kits are built without being looked at (install Google Chrome, or set CHROME_PATH)');
if (process.platform !== 'darwin') warn('the C code runner needs macOS (its sandbox): code runs are off here');

// Animations (Manim, LaTeX, ffmpeg): large, so only when asked.
const manim = path.join(ROOT, 'tools/manim/.venv/bin/manim');
if (existsSync(manim)) ok('Animations (Manim)');
else if (flag('animations')) {
  const venv = path.join(ROOT, 'tools/manim/.venv');
  if (run('uv', ['venv', '--python', '3.12', venv]) && run('uv', ['pip', 'install', '--python', path.join(venv, 'bin/python'), 'manim'])) ok('Animations (Manim; it also needs ffmpeg and a LaTeX such as TinyTeX)');
  else warn('Manim did not install (it needs uv: https://docs.astral.sh/uv)');
} else say('  - Animations are off (run setup with --animations to add Manim)');

// 4. The page.
if (!run('npm', ['run', 'build', '--silent'])) { say('The page did not build.'); process.exit(1); }
ok('Page built');
say(`\nDone. Start Plato with  npm start  and open http://127.0.0.1:${(/^PORT=(\d+)/m.exec(readFileSync(envFile, 'utf8')) || [])[1] || 5188}`);
