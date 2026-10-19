import React, { useEffect, useMemo, useRef, useState } from 'react';
import { highlightLines } from '../../shared/board-rich-text.mjs';
import { run } from '../../shared/elements/trace.mjs';
import { useDraft } from '../checkpoint.js';

// The student's own code on the page: an editor in the page's code tint (a transparent textarea over the code,
// highlighted as Plato's is, so it reads the same) with a terminal pane under it. RISC-V runs here on the trace's
// interpreter (Run, Step, Reset); C goes to the server's sandbox through runC({ language, source }). Cmd/Ctrl+Enter
// runs; Tab indents (Escape, then Tab, leaves the editor). After every change, onWork({ label, value, brief, ran }):
// value is what it hands in (the code and what its last run gave), brief what Plato is shown of it.
const NAME = { c: 'C', riscv: 'RISC-V' };
const LIMITS = { maxSteps: 2000, maxCells: 64 };
const clip = (text, max) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const cell = m => `${m.address} = ${m.value}${m.label ? ` (${m.label})` : ''}`;

// Every step of the student's RISC-V as the trace computes it, or the one line that keeps it from running.
function simulate(code) {
  try { return { list: run({ lang: 'riscv', code, watch: [], init: { regs: {}, memory: [] } }, LIMITS) }; }
  catch (problem) { return { error: String(problem.message).replace(/^Invalid trace: /, '').split('; ')[0] }; }
}
// The machine at step `at`: its registers (marked where they differ from step `from`) and the memory touched.
function machine(list, at, from = at - 1) {
  const step = list[at], before = list[Math.max(0, from)];
  return { regs: step.vars.map(v => ({ ...v, changed: before.vars.find(p => p.name === v.name)?.value !== v.value })), memory: step.memory, sp: step.pointers[0]?.at ?? -1 };
}

export default function CodeZone({ language = 'c', starter = '', done = false, runC, onWork, draftKey = null }) {
  const riscv = language === 'riscv', name = NAME[riscv ? 'riscv' : 'c'];
  const [source, setSource] = useDraft(draftKey, String(starter || ''));
  // The terminal ({ status, regs, memory, sp, text, bad }), the last run in words, and RISC-V stepping ({ list, at }).
  const [out, setOut] = useState(null), [ran, setRan] = useState(''), [trace, setTrace] = useState(null);
  const lines = useMemo(() => highlightLines(source, riscv ? 'asm' : 'c'), [source, riscv]);
  const report = useRef(onWork), escaped = useRef(false), running = useRef(false);
  report.current = onWork;
  useEffect(() => {
    report.current?.({ label: `code (${name})`, ran, value: `\`\`\`${riscv ? 'riscv' : 'c'}\n${source}\n\`\`\`${ran ? `\nran: ${ran}` : ''}`, brief: `code (${name}): ${clip(source, 1200)}${ran ? ` | ran: ${ran}` : ''}` });
  }, [source, ran]);
  useEffect(() => () => report.current?.(null), []);

  async function go(how) {
    if (how === 'reset') { setTrace(null); setOut(null); return; }
    if (!riscv) return compile();
    const sim = how === 'step' && trace ? trace : simulate(source);
    if (sim.error) { setTrace(null); setOut({ bad: sim.error }); setRan(`error: ${sim.error}`); return; }
    const last = sim.list.length - 1, finished = `finished, ${last} instruction${last === 1 ? '' : 's'}`;
    if (how === 'run') {
      const end = machine(sim.list, last, 0);
      setTrace(null); setOut({ status: finished, ...end });
      const touched = end.memory.filter(m => m.value).map(cell).join(', ');
      setRan([`finished after ${last} instructions`, end.regs.map(r => `${r.name} = ${r.value}`).join(', '), touched && `memory: ${touched}`].filter(Boolean).join('; '));
      return;
    }
    const at = Math.min(last, (trace?.at ?? 0) + 1);
    setTrace({ ...sim, at }); setOut({ status: at === last ? finished : `step ${at} of ${last}`, ...machine(sim.list, at) });
  }

  async function compile() {
    if (running.current) return;
    running.current = true; setOut({ status: 'running…' });
    try {
      const r = await runC({ language: 'c', source }), failed = r.phase === 'compile' && !r.ok, printed = String(r.stdout || ''), errors = String(r.stderr || '').trim();
      setOut({ status: failed ? 'didn’t compile' : r.timedOut ? 'stopped: it ran too long' : `exit ${r.exitCode}`, text: printed, bad: errors });
      setRan(failed ? `compile errors: ${clip(errors, 800)}`
        : `${r.timedOut ? 'timed out' : `exit ${r.exitCode}`}, ${printed ? `printed: ${clip(printed, 800)}` : 'printed nothing'}${errors ? `; stderr: ${clip(errors, 400)}` : ''}`);
    } catch (problem) {
      setOut({ bad: problem?.status === 404 ? 'Running C isn’t available yet.' : problem?.message || 'Couldn’t run it.' });
    } finally { running.current = false; }
  }

  const keys = e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void go('run'); }
    else if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !escaped.current && !done) {
      e.preventDefault();
      // insertText keeps the editor's own undo; setRangeText where it is missing.
      const el = e.currentTarget;
      if (!document.execCommand('insertText', false, '  ')) { el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end'); setSource(el.value); }
    }
    escaped.current = e.key === 'Escape';
  };
  const next = trace?.list[trace.at]?.line;
  return <div className="zone zone-code">
    <div className="zone-stack">
      {/* An empty line keeps a space, to be as tall as the textarea's. */}
      <pre aria-hidden="true">{lines.map((line, i) => <span key={i} className={`zone-line${next === i + 1 ? ' is-next' : ''}`}>
        {line.length ? line.map((t, k) => t.type ? <span key={k} className={`tok-${t.type}`}>{t.text}</span> : t.text) : ' '}</span>)}</pre>
      <textarea value={source} readOnly={done} rows={1} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" maxLength={20_000}
        aria-label={`${name} code; Command or Control Enter runs it`} onChange={e => { setSource(e.target.value); setTrace(null); }} onKeyDown={keys}/>
    </div>
    <div className="zone-term">
      <div className="zone-bar">
        <span className="zone-status" aria-live="polite">{out?.status}</span>
        <button type="button" className="zone-key" onClick={() => go('run')}>Run</button>
        {riscv && <><button type="button" className="zone-key" onClick={() => go('step')}>Step</button><button type="button" className="zone-key" onClick={() => go('reset')}>Reset</button></>}
      </div>
      {out?.regs?.length > 0 && <p className="zone-regs">{out.regs.map(r => <span key={r.name} className={r.changed ? 'is-changed' : undefined}>{r.name} = {r.value}</span>)}</p>}
      {out?.memory?.length > 0 && <pre className="zone-out">{out.memory.map((m, i) => `${m.address}  ${m.value.padStart(6)}${m.label ? `  ${m.label}` : ''}${i === out.sp ? '  ← sp' : ''}`).join('\n')}</pre>}
      {out?.text && <pre className="zone-out">{out.text}</pre>}
      {out?.bad && <pre className="zone-out is-bad">{out.bad}</pre>}
    </div>
  </div>;
}
