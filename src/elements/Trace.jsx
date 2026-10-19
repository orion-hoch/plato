import React, { useEffect, useMemo, useRef } from 'react';
import { highlightLines } from '../../shared/board-rich-text.mjs';
import { addresses } from '../../shared/elements/trace.mjs';
import Diagram from '../visuals/Diagram.jsx';

// A program stepped through (the stepper): the code with the line about to run marked (as a debugger marks it), the
// watched values (the ones that just changed in lapis) and memory as the course draws it. The learner steps it by
// pressing it or with the arrow keys. A line a checkpoint holds is outlined until they say what it will do; stepping
// waits for that. An element with no task (an older card or a thought) also steps each time Plato finishes speaking.
// ponytail: with no task, steps follow Plato's utterances, not what he says in them; one ending in the trace's first 3 s
// is taken for the one already under way when it arrived.
const SETTLING_MS = 3000;
export default function Trace({ state, spec, act, task, anchor, beat = 0 }) {
  const { steps: list, at } = state, code = useMemo(() => highlightLines(state.spec.code, state.spec.lang === 'riscv' ? 'asm' : 'c'), [state.spec]);
  const gutter = useMemo(() => state.spec.lang === 'riscv' ? addresses(state.spec.code) : code.map((_, i) => String(i + 1)), [state.spec, code]);
  const shown = useRef(null), mine = useRef(act);
  mine.current = act;
  useEffect(() => {
    if (spec.task) return;
    if (shown.current === null) shown.current = performance.now();
    else if (performance.now() - shown.current > SETTLING_MS) mine.current('next');
  }, [beat]);
  const step = list[at], held = task.blocked('next'), asked = new Set(task.open()?.predict || []);
  // Forward is always one step at a time, so no jump passes a line a checkpoint holds.
  const keys = { ArrowRight: () => act('next'), ArrowLeft: () => act('back'), Home: () => act('reset'), End: () => { for (let i = at; i < list.length - 1 && act('next'); i++); } };
  return <div className="material element-trace" tabIndex={0} role="group" aria-label={`Program trace, step ${at + 1} of ${list.length}${held ? ': say what the marked line will do before stepping' : ': press it, or use the arrow keys, to step'}`}
    onClick={() => { if (window.getSelection?.()?.isCollapsed !== false) act(at + 1 < list.length ? 'next' : 'reset'); }}
    onKeyDown={e => { if (keys[e.key]) { e.preventDefault(); keys[e.key](); } }}>
    <pre><code>{code.map((tokens, i) => <span key={i} data-anchor={anchor(`line-${i + 1}`)} className={`trace-line${step.line === i + 1 ? ' is-next' : ''}${held && step.line === i + 1 ? ' is-held' : ''}`}>
      <span className="trace-gutter" aria-hidden="true">{gutter[i] || ' '}</span>
      {tokens.map((t, k) => t.type ? <span key={k} className={`tok-${t.type}`}>{t.text}</span> : t.text)}
    </span>)}</code></pre>
    {step.vars.length > 0 && <p className="trace-vars">{step.vars.map(v => <span key={v.name} data-anchor={anchor(`var-${v.name}`)} className={[v.changed && 'is-changed', asked.has(v.name) && 'is-asked'].filter(Boolean).join(' ') || undefined}>{v.name} = {v.value}</span>)}</p>}
    {step.note && <p className="trace-note">{step.note}</p>}
    {step.memory.length > 0 && <Diagram diagram={{ type: 'memory', data: { cells: step.memory, pointers: step.pointers, anchors: step.memory.map(c => anchor(`mem-${c.address}`)) } }}/>}
    <p className="trace-step" data-anchor={anchor('step')} aria-live="polite">{at + 1} / {list.length}</p>
  </div>;
}
