// Animations (16 Oct, the user: an `animate` tool on Manim Community Edition, for what moves: a mapping, a process over time,
// a state machine running). Built like an anatomy figure (anatomy.mjs): a headless Claude Code session on the user's own login
// writes one Manim CE scene, renders it at 480p15 with tools/manim/render.sh (the venv's manim, TinyTeX, ffmpeg), looks at
// its frames and fixes what it sees. Plato teaches on meanwhile; the MP4 goes on the page as a video (served at
// /animations/<id>.mp4). Cached by its `about`: the same request is the same clip, up at once.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RENDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tools/manim/render.sh');
export const BUDGET_MS = 10 * 60_000; // ponytail: one fixed budget (first test builds: see TOOK.animation in the director); raise if clips come back unchecked
export const ready = () => existsSync(path.join(path.dirname(RENDER), '.venv/bin/manim'));

const BRIEF = `You make one short teaching animation for a student's tutor, with Manim Community Edition (v0.22, \`from manim import *\`; NOT manimgl / 3b1b's manim). You run headless: nobody will answer a question, so decide and build.

Work in the current directory. Steps:
1. Write ./scene.py: exactly one Scene subclass. 5-30 seconds in all.
2. Render: run \`${RENDER} scene.py\` (renders 480p15 to ./out.mp4 and writes ./frame-1.png .. ./frame-4.png at 15/40/65/95% of the clip). On an error, read it, fix scene.py, run it again.
3. Look at all four frames (Read each PNG). Check: labels overlapping each other or a shape, anything cut off at the frame's edge, text too small to read at 480p, wrong math or wrong numbers, the motion not showing what it should. Fix and re-render: at most 2 fix rounds, then stop.

Style (the app's paper and ink): first line of construct: self.camera.background_color = "#fbf9f4". Ink "#1d1b18" for text and lines (pass color= to every Text, MathTex, Tex, Line, Arrow, Dot, Circle, axes: the default is WHITE and vanishes on paper); muted "#6f6b64"; accent blue "#2f4f8a"; warm "#b5653e"; good green "#2f8a5c"; gold "#b08a3e". Few words, large (font_size 28-48), a title at the top only if it helps. Show it the way a great lecturer would at the board, true in every number.

Manim CE cheat-sheet:
- Frame: x in [-7.1, 7.1], y in [-4, 4] (config.frame_width 14.2, config.frame_height 8). Keep everything inside x in [-6.6, 6.6], y in [-3.6, 3.6]: check with .get_left()/.get_right() if unsure; shrink a group with .scale_to_fit_width(12).
- Animations: self.play(Create(m)), Write(tex), FadeIn(m, shift=UP), FadeOut(m), Transform(a, b), ReplacementTransform(a, b), TransformMatchingTex(a, b), Indicate(m), Circumscribe(m), m.animate.shift(RIGHT).set_color(...), MoveAlongPath(dot, path), LaggedStart(*anims, lag_ratio=0.2), AnimationGroup(...); self.wait(1). run_time=... on play.
- Mobjects: Text("plain", font_size=36, color=...), MathTex(r"\\mathbb{N} \\to \\mathbb{Z}") (math mode), Tex(r"text with $x$"), Dot, Circle, Square, Rectangle, RoundedRectangle(corner_radius=0.2), Line, Arrow(start, end, buff=0.1), CurvedArrow, DashedLine, Brace(m, DOWN) with .get_text("..."), SurroundingRectangle(m, color=..., buff=0.1), NumberLine(x_range=[-5,5,1], include_numbers=True), NumberPlane(), Axes(x_range=[0,5,1], y_range=[0,10,2]) with ax.plot(lambda x: x**2, color=...), ax.c2p(x, y), ax.get_axis_labels(), DecimalNumber, Integer, Table / MathTable.
- Layout: VGroup(a, b, c).arrange(RIGHT, buff=0.5) (or DOWN; arrange_in_grid(rows, cols)), m.next_to(other, DOWN, buff=0.3), m.to_edge(UP), m.to_corner(UL), m.move_to(point), m.shift(2*LEFT), m.align_to(other, LEFT). Directions UP DOWN LEFT RIGHT UL UR DL DR ORIGIN; points are np.array([x, y, 0]).
- Graphs: Graph(vertices, edges, layout="circular" | "spring" | "tree" (root_vertex=...) | "partite" | a dict {v: [x, y, 0]}, labels=True, vertex_config={...}, edge_config={...}); DiGraph(...) for arrows. A state machine: lay its states out by hand (a dict layout), Circle + Text per state, a double circle for accepting, CurvedArrow/Arrow with a Text label per transition, a self-loop as an ArcBetweenPoints or CurvedArrow(p, p + small offset, angle=-TAU*0.8); light the current state with .animate.set_fill(color, opacity=0.4).
- Updaters: t = ValueTracker(0); d = always_redraw(lambda: Dot(ax.c2p(t.get_value(), f(t.get_value())))); self.play(t.animate.set_value(5), run_time=3); m.add_updater(lambda m: m.next_to(d, UP)).
- CE vs GL pitfalls: no ShowCreation (use Create), no TexMobject/TextMobject (MathTex/Tex), no self.embed(), no InteractiveScene, no CONFIG dicts, no .get_graph (use ax.plot), no ApplyMethod when .animate works, no GraphScene (use Axes). MathTex is math mode already: never wrap it in $; split it into parts (MathTex("a", "=", "b")) to color or transform pieces. Text uses no LaTeX: "≤", "→" go in it as Unicode. Raw strings for every LaTeX string. Graph's vertices must be hashable and its labels=True draws MathTex of each name: use simple names.

Your last message is a note for the tutor, who sees only the clip (never files), plain text, at most four short lines: the first line is the clip's title alone; then what it shows, in order, so the tutor can talk over it. If it could not be rendered, say why in one line.`;

/** Its id: a hash of what it shows (whitespace and case aside), so the same request is the same clip. */
export const animationId = about => `anim-${createHash('sha1').update(String(about).trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 12)}`;
/** A clip built before: { id, title, about, note } from <dir>/<id>.json, when its MP4 is there too. */
export function cachedAnimation(dir, id) {
  try { return existsSync(path.join(dir, `${id}.mp4`)) ? JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8')) : null; } catch { return null; }
}

/**
 * One clip for `about` written to <dir>/<id>.mp4 with its <id>.json: { id, title, about, note }. onStage(text, fraction) at
 * each real step (stepper). No clip at all throws, with the builder's own words why.
 */
export function buildAnimation({ about, title = '' }, { dir, onStage = () => {}, model = process.env.LUNA_CLAUDE_MODEL || 'opus', timeoutMs = BUDGET_MS } = {}) {
  if (!ready()) return Promise.reject(new Error('Manim is not installed: tools/manim/.venv (uv venv --python 3.12; uv pip install manim)'));
  const id = animationId(about), cwd = mkdtempSync(path.join(tmpdir(), 'plato-manim-')), clip = path.join(cwd, 'out.mp4'); // no project files, settings or memory of anyone's
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', model, '--output-format', 'stream-json', '--verbose',
      '--tools', 'Read,Write,Edit,Bash', '--allowedTools', `Read,Write,Edit,Bash(${RENDER} *),Bash(ls *)`, '--permission-mode', 'dontAsk',
      '--strict-mcp-config', '--setting-sources', '', '--append-system-prompt', BRIEF], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', result = null, err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs), stop = () => child.kill('SIGTERM');
    process.once('exit', stop);
    child.on('close', () => process.off('exit', stop));
    const step = stepper(onStage);
    step({ type: 'start' });
    child.stdout.on('data', chunk => {
      buffer += chunk;
      for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
        const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.type === 'result') { result = e; step({ type: 'result' }); }
        if (e.type !== 'assistant') continue;
        for (const c of e.message?.content || []) if (c.type === 'tool_use') step({ type: 'tool', name: c.name, input: c.input || {} });
      }
    });
    child.stderr.on('data', d => { err += d; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      const note = String(result?.result || '').trim();
      if (!existsSync(clip)) return reject(new Error(`no clip came (${code}): ${(note || err).slice(0, 200)}`));
      mkdirSync(dir, { recursive: true });
      copyFileSync(clip, path.join(dir, `${id}.mp4`));
      const said = note.split('\n')[0].replace(/[*#_`"“”]/g, '').replace(/^title:\s*/i, '').trim();
      const made = { id, title: (title || (said.length <= 80 && said) || 'Animation').slice(0, 120), about, note: note.slice(0, 1200) };
      writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(made, null, 2));
      resolve(made);
    });
    child.stdin.end(`Animate: ${about}${title ? `\nIts title: ${title}` : ''}`);
  });
}

// Real progress (as anatomy's stepper): the builder's own steps from its stream. Write the scene, render, look at the frames,
// fix (2 rounds at most), its note. The fraction only moves forward, and only on a real step.
export function stepper(onStage) {
  let at = 0, renders = 0, looked = false, last = '';
  const say = (text, f) => { at = Math.max(at, f); if (text !== last) onStage(last = text, Math.round(at * 100) / 100); };
  return e => {
    if (e.type === 'start') return say('Starting the animation builder', 0.03);
    if (e.type === 'result') return say('Done: writing its note for Plato', 0.97);
    const { name, input } = e, file = String(input.file_path || ''), command = String(input.command || '');
    if (name === 'Bash' && command.includes('render.sh')) { renders += 1; looked = false; return say(renders === 1 ? 'Rendering the clip (480p)' : `Re-rendering (fix ${renders - 1})`, renders === 1 ? 0.35 : 0.6 + 0.12 * (renders - 1)); }
    if (name === 'Read' && /\.png$/i.test(file)) { looked = true; return say('Checking its frames', renders > 1 ? at : 0.5); }
    if (name === 'Write' || name === 'Edit') return say(renders ? (looked ? `Fixing what the frames showed (round ${renders})` : 'Fixing the render error') : 'Writing the scene', renders ? at + 0.02 : 0.12);
  };
}
