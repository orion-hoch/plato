import React, { useLayoutEffect, useRef } from 'react';
import Diagram from '../visuals/Diagram.jsx';
import { opText } from '../../shared/elements/memory.mjs';
import './memory.css';

// A memory diagram stepped through its operations (shared/elements/memory.mjs): the cells and pointers as the course
// draws them, and the operations under it as lines of code, the next one marked. Pressing it (or the arrow keys)
// applies the next one; an operation a checkpoint holds is outlined and waits for the learner's prediction. The drawing
// is SVG text from the course diagrams, so its pointers' names and the cells being asked about are marked in it here.
export default function Memory({ state, act, task, anchor }) {
  const { spec, at } = state, box = useRef(null), held = task.blocked('next'), asked = task.open()?.predict || [];
  const rows = spec.cells.map(c => c.address);
  const data = {
    cells: spec.cells.map(c => ({ ...c, value: state.cells[c.address] })), caption: spec.caption,
    pointers: Object.entries(state.ptrs).filter(([, a]) => rows.includes(a)).map(([label, a]) => ({ at: rows.indexOf(a), label })),
    anchors: spec.cells.map(c => anchor(`mem-${c.address}`)),
  };
  // A name being predicted, as the cell it is about ("mem 0x7ff0", or a cell's label).
  const askedCells = new Set(asked.map(name => spec.cells.find(c => `mem ${c.address}` === name || c.label === name)?.address).filter(Boolean).map(a => anchor(`mem-${a}`)));
  const marks = useRef(null);
  marks.current = () => {
    const svg = box.current?.querySelector('svg');
    if (!svg) return;
    for (const rect of svg.querySelectorAll('rect[data-anchor]')) rect.classList.toggle('is-asked', askedCells.has(rect.getAttribute('data-anchor')));
    // The course diagram writes a row's pointers as one bold label ("p, q"): the first names it; another gets a box over it.
    for (const t of svg.querySelectorAll('text[font-weight="600"]')) {
      const names = t.textContent.split(', ');
      if (!names.every(n => n in state.ptrs)) continue;
      t.setAttribute('data-anchor', anchor(`ptr-${names[0]}`));
      for (const name of names.slice(1)) {
        if (svg.querySelector(`[data-anchor="${CSS.escape(anchor(`ptr-${name}`))}"]`)) continue;
        const b = t.getBBox(), r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        Object.entries({ x: b.x, y: b.y, width: b.width, height: b.height, fill: 'none', 'data-anchor': anchor(`ptr-${name}`) }).forEach(([k, v]) => r.setAttribute(k, v));
        t.after(r);
      }
    }
  };
  useLayoutEffect(() => marks.current());
  // The drawing redraws itself when it is measured or settled: mark it again whenever its SVG is replaced.
  useLayoutEffect(() => {
    const watch = new MutationObserver(() => marks.current());
    watch.observe(box.current, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, []);
  const keys = { ArrowRight: () => act('next'), ArrowLeft: () => act('back'), Home: () => act('reset'), End: () => { for (let i = at; i < spec.ops.length && act('next'); i++); } };
  return <div ref={box} className="material element-memory" data-toggle="memory" tabIndex={0} role="group"
    aria-label={`Memory diagram, ${at} of ${spec.ops.length} operations done${held ? ': say what the marked operation will do before it runs' : spec.ops.length ? ': press it, or use the arrow keys, to apply the next' : ''}`}
    onClick={() => { if (spec.ops.length && window.getSelection?.()?.isCollapsed !== false) act(at < spec.ops.length ? 'next' : 'reset'); }}
    onKeyDown={e => { if (keys[e.key]) { e.preventDefault(); keys[e.key](); } }}>
    <Diagram diagram={{ type: 'memory', data }}/>
    {spec.ops.length > 0 && <ol className="memory-ops">{spec.ops.map((o, i) => <li key={i} data-anchor={anchor(`op-${i + 1}`)}
      className={i < at ? 'is-done' : i === at ? `is-next${held ? ' is-held' : ''}` : undefined}>{opText(o)}</li>)}</ol>}
  </div>;
}
