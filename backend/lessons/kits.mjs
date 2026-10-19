// Kits (19 Oct, the user: "I shouldn't have to hard code the circuit element, the system should be able to understand that it
// is needed and then make one during the course set up … a fictional Ochem class should be able to factor elements to
// describe chemical structure faithfully without user input"). While a course's units are written, agents decide whether the
// course needs a figure of its own that Plato's built-in tools can't draw faithfully (a molecule, a staff of music, a
// free-body diagram), build each as a small renderer (kit.html: a spec in, an interactive figure out, on the shelf's
// libraries), and the server draws each one's examples from the course in headless Chrome for a second agent to look at and
// fix. A kit that still fails is left out. Plato then has kit(name, title, spec), told in his brief what each one is for and
// the exact spec to write. Files: <course>/kits/plan.json, kits/<name>/{kit.html, kit.json, check/}, kits/installed.json.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SHELF_DIR = path.join(ROOT, 'tools/shelf/lib');
const CAPTURE = path.join(ROOT, 'tools/anatomy/scripts/capture.mjs');
const shelf = () => { try { return JSON.parse(readFileSync(path.join(ROOT, 'tools/shelf/shelf.json'), 'utf8')); } catch { return []; } };
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const NAME = /^[a-z][a-z0-9-]{1,30}$/;

// What Plato can already draw (agent.mjs): a kit is for what these can't show faithfully.
const BUILT_IN = `write (markdown with LaTeX, tables, step-by-step worked examples; diagram types: plot of functions or densities, chart, bars, number_line, table, tree, graph (vertices and edges), state_machine, truth_table, kmap, waveform, bits, memory, array, pipeline), circuit (live logic gates, latches, flip-flops), animate (a Manim clip, a minute to make), anatomy (a custom isometric machine, several minutes to make), compute (run JavaScript to check numbers or simulate)`;
const SHELF_TEXT = () => shelf().map(s => `- /shelf/${s.file} (global ${s.global}, ${s.license}): ${s.for}${s.css ? `; with /shelf/${s.css}` : ''}`).join('\n');

const DECIDE = plan => `You decide whether a course needs kits, for an AI tutor (Plato) who teaches it one-on-one. You run headless: nobody will answer a question, so decide and do it.

A kit is a small figure renderer of the course's own: the tutor writes a short spec (a SMILES string, a chord, a set of forces) and the student gets a faithful, interactive figure at once. Plato can already draw: ${BUILT_IN}.

The course: ${plan.course}. Their goal: ${plan.goal}. Its units: ${plan.units.map(u => u.title).join('; ')}.

Read ./plan.json and ./brief.md, and look through ./sources/ for the figures the material relies on (structures, notation, diagrams it draws again and again). A kit is worth it only when the course keeps showing a kind of figure that the built-in tools can't draw faithfully, in the course's own conventions: organic chemistry's skeletal structures with wedges and charges, music notation, free-body or ray diagrams, Lewis structures, phylogenetic trees, a geometry construction to drag. Most courses need none: a probability or programming course is served by the built-ins. At most 3.

Libraries a kit may use (already on the server; nothing else can be loaded):
${SHELF_TEXT()}

Write ./kits/plan.json: {"kits": [{"name": "<lowercase-with-dashes>", "title": "<what it draws>", "why": "<the figures in their material it is for, with an example or two>", "library": "<a shelf file, or none>"}]}, or {"kits": []}.

Reply with one line: the kits, or none.`;

const BUILD = (kit, plan) => `You build one kit, "${kit.name}" (${kit.title}), for an AI tutor (Plato) teaching ${plan.course} one-on-one. You run headless: nobody will answer a question, so decide and build. Work only in ./kits/${kit.name}/. Never write the middle dot character anywhere in what the kit shows (titles, labels): use a comma, a colon or a dash.

What it is for: ${kit.why}

A kit is a renderer: the tutor writes a short spec and the student sees a faithful, interactive figure on their page at once. Make two files.

1. ./kits/${kit.name}/kit.html: one standalone page. Its input arrives as window.KIT_SPEC (a script before yours sets it; a JS object in the shape you define). Draw it, interactive where that helps the student (hover for names, drag to rotate, a toggle to show hydrogens or labels). Libraries only from the shelf, by <script src="/shelf/<file>"></script>; no other network, no web fonts, no localStorage:
${SHELF_TEXT()}
Light theme, transparent background, as wide as its frame (from 320 to 900 px), as tall as the figure needs. If the spec is wrong (does not parse, an unknown name, an impossible structure), draw nothing and call console.error("kit: <what is wrong, and the right shape>") once: the tutor reads exactly that and fixes the spec. When the figure is drawn, set document.body.dataset.kit = "ok".

2. ./kits/${kit.name}/kit.json: {"name": "${kit.name}", "title": "${kit.title}", "when": "<one line: when the tutor should use it>", "spec": "<the input's shape in one compact paragraph with one complete example, exactly as the tutor must write it as JSON>", "examples": [<4 to 6 of {"title": "...", "spec": {...}, "shows": "<what a correct drawing must show, precisely: atoms, bonds, stereo, charges, labels>"}>]}. Take the examples from the course's own material in ./sources/ (its real molecules, pieces, problems), including at least one hard case (stereocentres, rings, charges, whatever the course finds hard).

Faithful above all: the figure is a student's reference for an exam. Draw by the discipline's conventions as their material uses them, and keep the spec as small as the tutor can write right in one go (a SMILES string, not coordinates; names, not pixels). Check what you can in node (python3 or node in ./scratch/; the shelf's files are plain scripts at ${SHELF_DIR}). The server will then draw every example in a real browser and show you the pictures.

Reply with one line: what the kit draws and its spec's shape.`;

const CHECK = (kit, results) => `You check the kit "${kit.name}" in ./kits/${kit.name}/ (kit.html, kit.json). You run headless: nobody will answer a question, so decide and fix. The server drew each example of kit.json in headless Chrome; for each: the picture and what the browser reported.
${results.map((r, i) => `- Example ${i + 1}, "${r.title}": picture ./kits/${kit.name}/check/${i + 1}.png; it must show: ${r.shows}; browser: ${r.report}`).join('\n')}

Open every picture (Read the PNG) and judge it as the course's examiner would: is it drawn at all, is it the right structure (every atom, bond, ring, charge and stereo mark, or whatever the figure's facts are), readable at that size, nothing cut off or overlapping? Fix kit.html for anything wrong in the drawing, or the example's spec in kit.json if the spec itself was wrong (never weaken what "shows" asks for to make a picture pass). Then write ./kits/${kit.name}/check.json: {"ok": <true only if every example is now right as drawn, or you fixed it in a way you are sure of>, "fixed": ["..."], "left": ["<what is still wrong>"]}.

Reply with one line: ok or what is left.`;

/** A kit's page for one spec: its renderer with the spec before it, framed like an anatomy figure (its height told to the
 *  frame, the keys back on leaving), and its console errors passed to the page (and so to Plato). */
export function kitPage(html, spec, title = '') {
  const json = JSON.stringify(spec).replace(/</g, '\\u003c');
  const head = `<script>window.KIT_SPEC = ${json};
for (const k of ['localStorage', 'sessionStorage']) { try { window[k].length; } catch { const m = new Map(); Object.defineProperty(window, k, { value: { getItem: x => (m.has(x) ? m.get(x) : null), setItem: (x, v) => m.set(x, String(v)), removeItem: x => m.delete(x), clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } } }); } }
const kitError = console.error.bind(console); console.error = (...a) => { kitError(...a); parent.postMessage({ kit: 'error', title: ${JSON.stringify(String(title))}, text: a.map(String).join(' ').slice(0, 600) }, '*'); };
addEventListener('error', e => parent.postMessage({ kit: 'error', title: ${JSON.stringify(String(title))}, text: String(e.message).slice(0, 600) }, '*'));
</script>`;
  const tail = `<style>html{color-scheme:light}body{background:transparent!important;margin:0}</style><script>new ResizeObserver(() => parent.postMessage({ anatomy: Math.ceil(document.documentElement.scrollHeight) + 8 }, '*')).observe(document.documentElement);
document.documentElement.addEventListener('pointerleave', () => parent.postMessage({ anatomy: 'leave' }, '*'));</script>`;
  const withHead = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + head) : head + html;
  return /<\/body>/i.test(withHead) ? withHead.replace(/<\/body>/i, tail + '</body>') : withHead + tail;
}

/** The course's installed kits: [{ name, title, when, spec }]. */
export const kitsOf = dir => (readJson(path.join(dir, 'kits', 'installed.json')) || []).filter(k => NAME.test(k.name) && existsSync(path.join(dir, 'kits', k.name, 'kit.html')));
/** A kit's figure for Plato's kit tool, written to <figure dir>/<id>.html: { title } or { problem }. */
export function writeKit(dir, figureDir, id, name, specText, title) {
  const kit = kitsOf(dir).find(k => k.name === name);
  if (!kit) return { problem: `no kit "${name}" in this course${kitsOf(dir).length ? ` (it has: ${kitsOf(dir).map(k => k.name).join(', ')})` : ''}` };
  let spec; try { spec = typeof specText === 'string' ? JSON.parse(specText) : specText; } catch { return { problem: `the spec isn't JSON. Its shape: ${kit.spec}` }; }
  mkdirSync(figureDir, { recursive: true });
  writeFileSync(path.join(figureDir, `${id}.html`), kitPage(readFileSync(path.join(dir, 'kits', name, 'kit.html'), 'utf8'), spec, title));
  return { title: title || kit.title };
}
/** Plato's brief's lines on the course's kits (a block of its own in brief.md, rewritten when they change). */
export function briefKits(dir) {
  const file = path.join(dir, 'brief.md');
  if (!existsSync(file)) return;
  const kits = kitsOf(dir), brief = readFileSync(file, 'utf8').replace(/\n*<!-- kits -->[\s\S]*?<!-- \/kits -->\n*/, '\n\n');
  const block = kits.length ? `<!-- kits -->\nFigures made for this course (kit: name, title, spec as a JSON string; up at once, live, faithful to the course's conventions; use one whenever its figure explains better than words or write's diagrams):\n${kits.map(k => `- kit "${k.name}" (${k.title}): ${k.when} Spec: ${k.spec}`).join('\n')}\n<!-- /kits -->\n` : '';
  writeFileSync(file, `${brief.trimEnd()}\n${block ? `\n${block}` : ''}`);
}

function capture(url, out) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [CAPTURE, url, '--out', out, '--width', '900', '--height', '700', '--scale', '1', '--wait', '2500', '--select', 'body'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let text = ''; child.stdout.on('data', d => { text += d; }); child.stderr.on('data', d => { text += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.on('close', () => { clearTimeout(timer); resolve(text); });
  });
}
/** Draw every example of a kit in headless Chrome: [{ title, shows, report, ok }]. */
async function drawExamples(dir, kit, { figureDir, baseUrl }) {
  const meta = readJson(path.join(dir, 'kits', kit.name, 'kit.json')), html = readFileSync(path.join(dir, 'kits', kit.name, 'kit.html'), 'utf8');
  const out = path.join(dir, 'kits', kit.name, 'check'); rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  mkdirSync(figureDir, { recursive: true }); // a new install has made no figure yet (19 Oct: every kit failed there)
  const results = [];
  for (const [i, ex] of (meta?.examples || []).slice(0, 6).entries()) {
    const id = `kitprev_${path.basename(dir)}_${kit.name}_${i + 1}`;
    writeFileSync(path.join(figureDir, `${id}.html`), kitPage(html, ex.spec, ex.title));
    const text = await capture(`${baseUrl}/figures/${id}.html`, path.join(out, `${i + 1}.png`));
    rmSync(path.join(figureDir, `${id}.html`), { force: true });
    const problems = text.split('\n').filter(l => /^console\.(error|warning)|exception/i.test(l));
    results.push({ title: ex.title, shows: ex.shows, report: !existsSync(path.join(out, `${i + 1}.png`)) ? `no picture: ${text.trim().slice(-300)}` : problems.length ? problems.join(' | ').slice(0, 600) : 'no errors', ok: existsSync(path.join(out, `${i + 1}.png`)) && !problems.length });
  }
  return results;
}

/** Decide, build, draw and check the course's kits (alongside its units); installs those that pass. Returns the installed. */
export async function buildKits(dir, plan, { agent, figureDir, baseUrl, onStage = () => {} }) {
  if (!figureDir || !baseUrl || !existsSync(CAPTURE) || !shelf().length) return [];
  mkdirSync(path.join(dir, 'kits'), { recursive: true });
  if (!readJson(path.join(dir, 'kits', 'plan.json'))) { onStage('deciding'); await agent(dir, DECIDE(plan)); }
  const wanted = (readJson(path.join(dir, 'kits', 'plan.json'))?.kits || []).filter(k => NAME.test(k?.name || '')).slice(0, 3);
  const installed = [];
  await Promise.all(wanted.map(async kit => {
    try {
      onStage(`building ${kit.name}`);
      await agent(dir, BUILD(kit, plan));
      let results = [];
      for (let round = 1; round <= 2; round++) {
        results = await drawExamples(dir, kit, { figureDir, baseUrl });
        if (!results.length) break;
        onStage(`checking ${kit.name}`);
        await agent(dir, CHECK(kit, results));
        if (readJson(path.join(dir, 'kits', kit.name, 'check.json'))?.ok && results.every(r => r.ok)) break;
      }
      results = await drawExamples(dir, kit, { figureDir, baseUrl }); // as it is now, after the last fixes
      const meta = readJson(path.join(dir, 'kits', kit.name, 'kit.json')), check = readJson(path.join(dir, 'kits', kit.name, 'check.json'));
      if (meta?.spec && results.length && results.every(r => r.ok) && check?.ok) installed.push({ name: kit.name, title: meta.title || kit.title, when: meta.when || '', spec: meta.spec });
      else console.warn(`Kits: ${kit.name} left out: ${results.filter(r => !r.ok).map(r => `${r.title}: ${r.report}`).join('; ').slice(0, 300) || (check?.left || []).join('; ').slice(0, 300) || 'not checked'}`);
    } catch (error) { console.warn(`Kits: ${kit.name} failed: ${String(error.message).slice(0, 200)}`); }
  }));
  writeFileSync(path.join(dir, 'kits', 'installed.json'), JSON.stringify(installed, null, 2));
  briefKits(dir);
  return installed;
}
