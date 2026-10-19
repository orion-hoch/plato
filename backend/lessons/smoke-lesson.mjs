// A lesson check: real Plato (Opus, the course's brief, the Lesson face's tools) teaches a simulated student one topic over a few
// turns; an Opus judge audits the whole lesson (chat + page) against the course's own material for false claims, omissions
// and missed student errors. evals/lesson/run.mjs runs it by hand; the course builder runs it on each new course's riskiest
// topics (15 Oct, docs/harness-generalization.md: "every course tests itself").
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { claudeActor } from '../session/claude-actor.mjs';
import { loadStudy, studyText, loadSources, searchSources, readSource, realProblemsText } from './study.mjs';
import { compute } from '../session/compute.mjs';
import { kitsOf } from './kits.mjs';
import { claude, reviewBoard, reviewNote } from '../session/review.mjs';
import { FACES, faceLimit } from '../session/agent.mjs';
import { checkBoard, manyAsks } from '../../shared/boards.mjs';

const courseName = dir => { try { return JSON.parse(readFileSync(path.join(dir, 'plan.json'), 'utf8')).course; } catch { return null; } };
const NEEDS = new Set(['look_up', 'read', 'compute', 'collect_page_work', 'think', 'move_on', 'change_topic']);

/**
 * Teach topic `n` of the course in `dir` for `turns` student turns and judge it. `groundTruth`: the judge's reference text
 * (default: the course material most relevant to the topic). `course`/`known`: the student's course and what they know.
 * → { topic, flagged, faces, transcript, page, verdict }
 */
export async function lessonCheck(dir, n, { turns = 6, opening = null, groundTruth = null, review = true, course = courseName(dir) || 'this course', known = 'the course\'s earlier topics, roughly' } = {}) {
  const topics = loadStudy(dir), t = topics[n];
  if (!t) throw new Error(`no topic ${n}`);
  const sections = loadSources(dir), brief = (() => { try { return readFileSync(path.join(dir, 'brief.md'), 'utf8'); } catch { return ''; } })();
  const material = sections.filter(x => !x.source.startsWith('study guide')), lectures = material.filter(x => x.source.startsWith('lecture'));
  const about = `${t.title} ${(t.blocks.Idea || '').slice(0, 200)}`;
  const notes = searchSources(lectures.length ? lectures : material, about, { max: 3, chars: 2200 });
  const real = realProblemsText(dir, t, { sections });
  const context = [`STUDY GUIDE TOPIC ${n + 1} of ${topics.length}: ${t.title}\n\n${studyText(topics, n)}${real ? `\n\n${real}` : ''}\n\nFROM THEIR LECTURE NOTES (the course's own explanations of this topic; teach in these terms):\n\n${notes.map(x => `[${x.source}]\n${x.text}`).join('\n\n---\n\n')}`];
  groundTruth ??= searchSources(material, about, { max: 8, chars: 3500 }).map(x => `=== ${x.source}\n${x.text}`).join('\n\n');

  const dialogue = [], page = [], transcript = [], reviews = [], flagged = [];
  let face = null, slides = 0; // slides: this reply's, for the lesson's limit
  async function runTool({ tool, ...p }) {
    if (tool === 'face') { if (!FACES[p.face]) return `No face "${p.face}".`; face = { face: p.face, topic: p.topic, note: p.note, by: 'plato' }; return `You are in ${FACES[p.face].name}. Go on in it now.`; }
    if (tool === 'write' && (p.question_kind || p.proof?.length) && (p.points?.length || p.diagram_type || (p.question_kind && p.markdown))) { // as the director: the slide first, then its question or proof space
      const { question_kind, question, options, proof, ...slide } = p, r1 = await runTool({ tool, ...(question_kind ? slide : { ...slide, markdown: '' }) });
      const r2 = await runTool({ tool, ...p, points: undefined, diagram_type: undefined, ...(question_kind ? { markdown: undefined } : {}) });
      return `${r1}\n${r2}`;
    }
    if (tool === 'write') {
      const limit = faceLimit(face?.face, tool, p, slides++);
      if (limit) return limit;
      if (p.proof) { page.push({ title: p.title, markdown: p.markdown, proof: p.proof }); return `On the page: a proof space with sections ${p.proof.join(', ')}.`; }
      if (['choice', 'multi_select'].includes(p.question_kind) && (!p.answers?.length || !String(p.explain || '').trim())) return `Couldn't put that up: a ${p.question_kind} question needs answers (copied exactly from options) and explain. Write it again with them.`; // as the director
      if (p.question_kind) { const many = manyAsks(p.question); if (many) return `Couldn't put that up: ${many}.`; page.push({ title: p.title, question: p.question, kind: p.question_kind, options: p.options }); return `On the page, as an interactive ${p.question_kind} question.`; }
      const { board, problem } = checkBoard({ kind: 'markdown', title: p.title, content: p.markdown || '', steps: p.points || [], diagram: p.diagram_type ? { type: p.diagram_type, data: p.diagram_data } : null });
      if (!board) return `Couldn't put that up: ${problem}. Fix it and write again.`;
      page.push({ title: p.title, points: p.points, markdown: p.markdown, diagram: p.diagram_type ? { type: p.diagram_type, data: p.diagram_data } : undefined });
      // As the director: a colleague checks the board in the background; an error comes back as a quiet note.
      if (review) { const text = [p.markdown, ...(p.points || []).map(x => `- ${x}`), p.diagram_type ? `[${p.diagram_type}] ${p.diagram_data}` : ''].filter(Boolean).join('\n'); reviews.push(reviewBoard({ title: p.title, text, course: studyText(topics, n) }).then(e => { if (e) { context.push(reviewNote(p.title, e)); flagged.push({ title: p.title, errors: e }); } })); }
      return 'On the page.';
    }
    if (tool === 'look_up') { const f = searchSources(sections, String(p.about || '')); return f.length ? f.map(x => `[${x.source}]\n${x.text}`).join('\n\n---\n\n').slice(0, 6000) : 'Nothing matches.'; }
    if (tool === 'read') { const r = readSource(dir, String(p.source || ''), p.part || 1); return r.text ? `[${r.source}, part ${r.part} of ${r.parts}]\n${r.text}` : `No source fits. Their material: ${r.names.join('; ').slice(0, 2000)}`; }
    if (tool === 'compute') return compute(String(p.code || ''));
    if (tool === 'show') return 'This topic has no ready boards: use write.';
    if (tool === 'kit') { const k = kitsOf(dir).find(x => x.name === p.name); let ok = Boolean(k); try { JSON.parse(String(p.spec)); } catch { ok = false; } page.push({ title: `[kit ${p.name}] ${p.title || ''}: ${String(p.spec || '').slice(0, 400)}` }); return ok ? `On the page: "${p.title || p.name}" (the ${p.name} kit).` : `Not drawn: ${k ? 'the spec is not JSON' : `no kit "${p.name}"`}.`; }
    if (['animate', 'anatomy', 'circuit'].includes(tool)) { page.push({ title: `[${tool}] ${p.title || p.about || p.idea || ''}`.slice(0, 300) }); return tool === 'circuit' ? 'The circuit is on the page.' : 'Building it in the background (about a minute); it goes on the page when ready. Teach on.'; }
    if (tool === 'collect_page_work') return 'Nothing written on the page yet.';
    return `${tool} is not available right now.`;
  }

  async function platoTurn(line) {
    await Promise.all(reviews.splice(0)); // the notes that came while they read
    dialogue.push(line.startsWith('[') ? line : `Student: ${line}`);
    transcript.push({ who: 'student', text: line });
    slides = 0;
    for (let round = 1; round <= 3; round++) {
      const r = await claudeActor({ context, dialogue: dialogue.slice(-60), brief, face });
      if (r.say) { dialogue.push(`Plato: ${r.say}`); transcript.push({ who: 'plato', text: r.say, think: r.think }); }
      let more = false;
      for (const call of r.tools) {
        const result = await runTool(call);
        transcript.push({ who: 'tool', call, result: result.slice(0, 600) });
        dialogue.push(`[Tool ${call.tool} ${JSON.stringify(call).slice(0, 3000)}] → [Tool result] ${result.slice(0, 1500)}`);
        if (NEEDS.has(call.tool) || /Couldn't/.test(result)) more = true;
        if (['write', 'show', 'face'].includes(call.tool) && !r.say) more = true; // as the page: a board with nothing said goes back to him
      }
      if (!more) break;
    }
  }
  const pageText = () => page.map((b, i) => `[Page ${i + 1}] ${b.title || ''}\n${(b.points || []).map(x => `- ${x}`).join('\n')}\n${b.markdown || ''}${b.question ? `Q (${b.kind}): ${b.question} ${(b.options || []).join(' | ')}` : ''}${b.proof ? `[proof space: ${b.proof.join(', ')}]` : ''}${b.diagram ? `\n[${b.diagram.type} diagram] ${typeof b.diagram.data === 'string' ? b.diagram.data : JSON.stringify(b.diagram.data)}` : ''}`).join('\n\n');
  const STUDENT = `You are role-playing a student taking ${course}, in a text chat with an AI tutor. You have NOT learned "${t.title}" yet (you know ${known}). You are bright but new to it: you follow some things, get confused by notation and details, sometimes give a WRONG answer to the tutor's questions (a typical novice mistake, about a third of the time), sometimes ask "why?" or for another example, and occasionally say "ok I think I get it" when you only half do. Reply ONLY with your next chat message (1-4 sentences, casual, as a student types). If the tutor asked you something, attempt it honestly as this student would.`;
  const studentTurn = () => {
    const convo = transcript.filter(x => x.who !== 'tool').map(x => `${x.who === 'plato' ? 'Tutor' : 'You'}: ${x.text}`).join('\n\n');
    return claude(STUDENT, `THE TUTOR'S PAGE (what they have written on the whiteboard):\n${pageText()}\n\nTHE CHAT SO FAR:\n${convo}\n\nYour next message:`, { model: 'sonnet' });
  };

  await platoTurn(opening || `I don't really get ${t.title.toLowerCase()} at all. Can you teach it to me properly, from scratch?`);
  for (let k = 1; k < turns; k++) await platoTurn(await studentTurn());

  const JUDGE = `You are a meticulous professor of ${course}, auditing an AI tutor's lesson for a student. You have the course's own material (the ground truth; extracted text, so math may be mangled), the tutor's study-guide topic, and the full lesson: chat messages and everything written on the whiteboard. Audit with extreme care; check every claim, value and step yourself. Return ONLY JSON:
{"false_or_misleading":[{"quote":"exact words","where":"chat|page|guide","why":"what is wrong","severity":"critical|major|minor"}],
 "omissions":[{"what":"an important definition/condition/theorem/trap/technique the material or guide treats as central to this topic that the lesson never conveyed","importance":"critical|major|minor","note":"(say if it could reasonably come later in a longer lesson)"}],
 "student_errors_missed":[{"student_said":"…","issue":"the error the tutor failed to catch or wrongly accepted"}],
 "definitions_faithful":"yes|partly|no with explanation (are definitions stated as the material does, incl. its conventions?)",
 "guide_problems":[{"what":"an error or gap in the STUDY GUIDE TOPIC itself (not the lesson)","fix":"the correct version"}],
 "pedagogy":{"key_ideas_on_page":"…","built_vs_listed":"…","checked_understanding":"…","verbosity":"too little|right|too much, why"},
 "tools":{"used":"which page tools the tutor used (slides, diagrams/plots, interactive questions, animations, live circuits or machines, proof spaces, computation) and whether each helped","missed":[{"moment":"where in the lesson","tool":"a tool that would have taught this moment clearly better (an animation of a process or mapping, a plot of a density, an interactive question, a simulation…)","why":"…"}],"overused":"any tool used where plain words would have been better"},
 "scores":{"accuracy":0-10,"completeness_so_far":0-10,"teaching":0-10},
 "summary":"3-5 sentences"}`;
  const judgeIn = `THE COURSE'S MATERIAL:\n${groundTruth}\n\nSTUDY GUIDE TOPIC:\n${studyText(topics, n)}\n\nTHE LESSON (chat):\n${transcript.filter(x => x.who !== 'tool').map(x => `${x.who === 'plato' ? 'TUTOR' : 'STUDENT'}: ${x.text}`).join('\n\n')}\n\nTHE WHITEBOARD:\n${pageText()}`;
  const raw = await claude(JUDGE, judgeIn);
  let verdict; try { verdict = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim().replace(/^[^{]*/, '').replace(/[^}]*$/, '')); } catch { verdict = { raw }; }
  return { topic: t.title, flagged, faces: transcript.filter(x => x.who === 'tool' && x.call.tool === 'face').map(x => x.call.face), transcript, page, verdict };
}
