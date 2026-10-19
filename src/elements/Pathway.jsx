import React from 'react';
import './pathway.css';

// A pathway (shared/elements/pathway.mjs): its pools with their amounts across the top, then the steps in the order
// they run, each with what it takes and what it gives. Pressing a step blocks it (inhibits) or lets it run again;
// pressing the flow itself, Enter or the right arrow runs a round, which a checkpoint holds until the learner predicts.
export default function Pathway({ state, act, task, anchor }) {
  const s = state.spec, label = id => s.pools.find(p => p.id === id)?.label ?? id, asked = new Set(task.open()?.predict || []);
  const flow = io => Object.entries(io).map(([id, n]) => `${n === 1 ? '' : `${n} `}${label(id)}`).join(' + ') || '—';
  const held = task.blocked('run'), run = () => act('run');
  return <div className={`element-pathway${held ? ' is-held' : ''}`} tabIndex={0} role="group"
    aria-label={`Pathway, ${state.rounds ? `after round ${state.rounds}` : 'before the first round'}${held ? ': say what the next round will do before running it' : ': press it, or the right arrow, to run a round'}`}
    onClick={e => { if (!e.target.closest('button') && window.getSelection?.()?.isCollapsed !== false) run(); }}
    onKeyDown={e => { if (e.target.closest('button')) return; if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); run(); } }}>
    <div className="pathway-pools">{s.pools.map(p => <span key={p.id} data-anchor={anchor(`pool-${p.id}`)} className={`pathway-pool${asked.has(p.id) ? ' is-asked' : ''}`}>
      <span className="pathway-pool-label">{p.label}</span><span className="pathway-amount">{state.amounts[p.id]}</span>
    </span>)}</div>
    <ol className="pathway-steps">{s.steps.map(st => {
      const off = state.inhibited.includes(st.id), stop = !off && task.blocked(`inhibit ${st.id}`), fired = state.fired[st.id];
      return <li key={st.id}>
        <button type="button" data-anchor={anchor(`step-${st.id}`)} className={`pathway-step${off ? ' is-off' : ''}${stop ? ' is-held' : ''}${asked.has(`fired ${st.id}`) ? ' is-asked' : ''}`}
          aria-pressed={off} aria-label={`${st.label}${st.by ? `, by ${st.by}` : ''}: ${flow(st.from)} to ${flow(st.to)}, fired ${fired} time${fired === 1 ? '' : 's'}${off ? ', blocked' : ''}${stop ? ', waits for your prediction' : ''}`}
          onClick={() => act(`${off ? 'release' : 'inhibit'} ${st.id}`)}>
          <span className="pathway-io">{flow(st.from)}<svg viewBox="0 0 24 10" width="24" height="10" aria-hidden="true"><path d="M1 5H21M17 1L21 5L17 9"/></svg>{flow(st.to)}</span>
          <span className="pathway-name">{st.label}{st.by && <span className="pathway-by">, {st.by}</span>}</span>
          {fired > 0 && <span className="pathway-fired">×{fired}</span>}
          {off && <svg className="pathway-x" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2L10 10M10 2L2 10"/></svg>}
        </button>
      </li>;
    })}</ol>
    <p className="pathway-round" aria-live="polite">round {state.rounds}</p>
  </div>;
}
