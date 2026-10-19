// Anatomy figures (14 Oct, the user: "research the anatomy skill and implement it into the agent toolset to explain topics"):
// an idea explained as a real, working machine, the anatomy skill's interactive isometric figure (github.com/wheresryan22/
// anatomy, MIT; cloned into tools/anatomy). The skill runs headless in the Claude Code CLI on the user's own Claude login, as
// Plato's brain does (claude-actor.mjs), with file tools and node only. It is slow on purpose (minutes): Plato teaches on while
// it is built, and the finished page goes on theirs in a sandboxed frame (server/index.mjs serves it at /figures/<id>.html).
import { agent as runAgent } from '../agents.mjs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tools/anatomy');
// ponytail: one fixed budget, about a quarter of the skill's hour for a Figure (light theme only, one capture, no audit sweep);
// raise it if figures come back thin.
export const BUDGET_MS = 20 * 60_000;

const BRIEF = `You build one anatomy figure for a student's tutor. You run headless: nobody will answer a question, so decide and build.

The anatomy skill is at ${SKILL}. Read ${SKILL}/SKILL.md first and follow its workflow and craft rules; open its references and the closest example as it says.

What to make: one Figure (one mechanism, 40-80 parts), SVG only (no WebGL, no 3D), light theme, a standalone page. Work in the current directory: write build.mjs here, importing the kit by absolute path (${SKILL}/kit/iso-kit.mjs, ${SKILL}/scripts/inline-kit.mjs), and have it write ./figure.html with pageHtml({ theme: "light", ... }). Skip publishing.

It teaches a student: every number, motion and caption must be true, in the terms their course uses. Time: about ${BUDGET_MS / 60_000 - 2} minutes in all. Have figure.html built and captured once (scripts/capture.mjs; read the PNG) within the first half, then fix what a critic would see first.

Your last message is a note for the tutor, who sees only the figure (never files), plain text, at most five short lines: the first line is the figure's title alone; then the object and what each moving part stands for; what to do with it; what the readout shows.`;

// The page as a frame on Plato's page: on his paper (no grey page, margin or dark canvas of its own), its height told to the
// frame, and the keys back to his page once the pointer leaves it (typing goes anywhere there).
const EMBED = '<style>html{color-scheme:light!important}body{background:transparent!important}.iso-page{margin:8px auto!important;width:calc(100% - 4px)!important}</style>'
  + '<script>new ResizeObserver(() => parent.postMessage({ anatomy: Math.ceil(document.body.getBoundingClientRect().bottom) + 8 }, "*")).observe(document.body);'
  + 'document.documentElement.addEventListener("pointerleave", () => parent.postMessage({ anatomy: "leave" }, "*"));</script>';

// The figures built so far, kept to be put up again at once (14 Oct, the user: "have some pre-prepared for hard topics that
// can be pulled out"): <figure dir>/library.json, [{ id, title, topic, idea, note }], newest last. Every finished build
// joins it; scripts/prepare-figures.mjs builds ahead for a course's hard topics.
export function libraryOf(dir) {
  try { const list = JSON.parse(readFileSync(path.join(dir, 'library.json'), 'utf8')); return Array.isArray(list) ? list : []; } catch { return []; }
}
export function addToLibrary(dir, entry) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'library.json'), JSON.stringify([...libraryOf(dir).filter(x => x.id !== entry.id), entry], null, 2));
}

/**
 * One figure for `idea` (with the true numbers), on the machine `object` when they named one, written to `out` (an .html
 * file): { title, note } with the builder's note for the tutor. onStage(text, fraction) at each real step of its work (see
 * stepOf). What it has built when the budget runs out still goes up; no page at all throws.
 */
export function buildFigure({ idea, object = '' }, { out, onStage = () => {}, model = process.env.LUNA_CLAUDE_MODEL || 'opus', timeoutMs = BUDGET_MS } = {}) {
  if (!existsSync(path.join(SKILL, 'SKILL.md'))) return Promise.reject(new Error(`the anatomy skill is missing: git clone https://github.com/wheresryan22/anatomy ${SKILL}`));
  const cwd = mkdtempSync(path.join(tmpdir(), 'plato-anatomy-')), page = path.join(cwd, 'figure.html'); // no project files, settings or memory of anyone's
  const step = stepper(page, onStage);
  step({ type: 'start' });
  // The skill's capture runs headless Chrome from node: Claude's sandbox lets the shell reach no network (Chrome's own loopback
  // aside), and writes stay in this folder.
  return runAgent(cwd, BRIEF, `Explain: ${idea}${object ? `\nThe machine they have in mind: ${object}` : ''}`, { model, timeoutMs, dirs: [SKILL], onStep: e => step({ type: 'tool', ...e }) })
    .catch(error => { if (!existsSync(page)) throw error; return ''; }) // what it built before it failed or ran out of time still goes up
    .then(said => {
      step({ type: 'result' });
      if (!existsSync(page)) throw new Error(`no figure came: ${String(said).trim().slice(0, 200)}`);
      mkdirSync(path.dirname(out), { recursive: true });
      const html = readFileSync(page, 'utf8'), end = html.toLowerCase().lastIndexOf('</body>'); // the last: the kit's inlined script has one too
      writeFileSync(out, end < 0 ? html + EMBED : html.slice(0, end) + EMBED + html.slice(end));
      // Its title: the first line, or the quoted title in it ('Title: "4-bit register" (the page is …)'); the page's own <title>
      // when that line is the builder talking about its work (15 Oct: "I built figure.html and the build checks pass…").
      const note = String(said || '').trim(), first = note.split('\n')[0].replace(/[*#_`]/g, ''), quoted = /["“]([^"”]+)["”]/.exec(first)?.[1];
      const named = (quoted || first.replace(/^title:\s*/i, '')).trim(), own = /<title>([^<]{2,120})<\/title>/i.exec(html)?.[1]?.trim();
      return { title: (!named || /^(I|The figure|Built|Done)\b/.test(named) || named.length > 80 ? own || named : named).slice(0, 120) || 'Figure', note: note.slice(0, 1200) };
    });
}

// Real progress (16 Oct, the user: "real progress indicators instead of dead air"): the builder's own steps, read from its stream
// (the tools it calls), each with how far along the skill's workflow it is: read the skill, study its references, draft
// build.mjs, build figure.html, capture and look, fix what the capture showed. The fraction only moves forward, and only on a
// real step; the page shows the step and the time since, so a stall shows as the last step and a growing clock.
export function stepper(page, onStage) {
  let at = 0, fixes = 0, built = false, captured = false, last = '';
  const size = () => { try { return ` (${Math.max(1, Math.round(statSync(page).size / 1024))} KB)`; } catch { return ''; } };
  const say = (text, f) => { at = Math.max(at, f); if (text !== last) onStage(last = text, Math.round(at * 100) / 100); };
  return e => {
    if (e.type === 'start') return say('Starting the figure builder', 0.03);
    if (e.type === 'result') return say('Writing its note for Plato', 0.97);
    const { name, input } = e, file = String(input.file_path || input.path || input.pattern || ''), command = String(input.command || '');
    if (name === 'Read' && /\.png$/i.test(file)) return say('Looking at the picture it took', Math.max(0.66, at));
    if (/capture|drive|lines\.mjs/.test(command)) { captured = true; return say('Taking a picture of the figure to check it', Math.max(0.6, at)); }
    if (name === 'Bash' && /build/.test(command)) { const again = built; built = true; return say(`${again ? 'Rebuilding' : 'Building'} figure.html${size()}`, again ? at : 0.45); }
    if (name === 'Write' || name === 'Edit') {
      if (captured) { fixes += 1; return say(`Fixing what the check showed (fix ${fixes})`, 0.7 + 0.22 * (1 - Math.exp(-fixes / 10))); } // a build makes 5 to 20 fixes: never full before its note
      return say(built ? 'Revising the figure' : 'Drafting the figure (build.mjs)', built ? Math.min(0.58, at + 0.02) : Math.min(0.4, Math.max(0.3, at + 0.02)));
    }
    if (/SKILL\.md$/.test(file)) return say('Reading the anatomy skill', 0.08);
    if (['Read', 'Glob', 'Grep'].includes(name) && !built) return say('Studying the skill\'s references and examples', Math.min(0.25, Math.max(0.12, at + 0.01)));
  };
}
