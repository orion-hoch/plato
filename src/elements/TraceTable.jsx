import React from 'react';
import './tracetable.css';

// A trace table (shared/elements/tracetable.mjs): a booktabs table, one row per step, computed by the stepper. Rows
// shown hold their values (a value that just changed in lapis, one the learner predicted wrong underlined in
// terracotta); the next row waits, '?' in each cell they are asked to predict, outlined while it waits for them; the
// rows after it are empty. A press, or the right arrow, shows the next row; Home starts again.
export default function TraceTable({ state, act, task, anchor }) {
  const { spec, table, at } = state, held = task.blocked('next'), asked = new Set(task.open()?.predict || []);
  const misses = new Map(task.checkpoints.filter(c => c.revealed).map(c => [c.at, new Set(c.revealed.diff.filter(d => !d.match).map(d => d.name))]));
  const keys = { ArrowRight: () => act('next'), Home: () => act('reset') };
  return <div className="material element-tracetable" tabIndex={0} role="group"
    aria-label={`Trace table, row ${at} of ${spec.rows}${held ? ': say what the next row holds before it is shown' : ': press it, or use the right arrow, for the next row'}`}
    onClick={() => { if (window.getSelection?.()?.isCollapsed !== false) act(at < spec.rows ? 'next' : 'reset'); }}
    onKeyDown={e => { if (keys[e.key]) { e.preventDefault(); keys[e.key](); } }}>
    <div className="table"><table>
      <thead><tr><th scope="col" className="tt-n"><span className="sr-only">Row</span></th>{spec.columns.map(c => <th key={c} scope="col" data-anchor={anchor(`col-${c}`)}>{c}</th>)}</tr></thead>
      <tbody>{table.map((row, n) => {
        const shown = n <= at, waiting = n === at + 1, wrong = misses.get(`row ${n}`);
        return <tr key={n} data-anchor={anchor(`row-${n}`)} className={shown ? undefined : waiting ? `tt-next${held ? ' is-held' : ''}` : 'tt-later'}>
          <th scope="row" className="tt-n">{n}</th>
          {spec.columns.map(c => <td key={c} data-anchor={anchor(`cell-${n}-${c}`)}
            className={[shown && n > 0 && row[c] !== table[n - 1][c] && 'is-changed', shown && wrong?.has(c) && 'is-wrong', waiting && asked.has(c) && 'is-asked'].filter(Boolean).join(' ') || undefined}>
            {shown ? row[c] : waiting && asked.has(c) ? '?' : ''}</td>)}
        </tr>;
      })}</tbody>
    </table></div>
  </div>;
}
