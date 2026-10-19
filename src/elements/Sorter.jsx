import React, { useState } from 'react';
import BoardRichText from '../BoardRichText.jsx';
import './sorter.css';

// A sorter (shared/elements/sorter.mjs): the items still to sort, then a column per group. A press on an item picks it
// up and a press on a group puts it there; a press on a sorted item takes it back. From the keyboard: Enter or Space
// picks an item up, the arrows aim at a group, Enter puts it there. Asked to predict, a press on an item has the engine
// place it where it belongs, once the learner has said which group they think it is.
export default function Sorter({ state, spec, act, task, anchor }) {
  const s = state.spec, predict = spec.task?.mode === 'predict', asked = new Set(task.open()?.predict || []);
  const [picked, setPicked] = useState(null), [aim, setAim] = useState(0);
  const put = bin => { if (picked && act(`put ${picked} ${bin}`)) setPicked(null); };
  const chip = it => {
    const sorted = Boolean(state.placed[it.id]), held = task.blocked(`put ${it.id}`);
    const press = () => predict ? !sorted && act(`put ${it.id}`) : sorted ? act(`take ${it.id}`) : setPicked(p => p === it.id ? null : it.id);
    return <button key={it.id} type="button" data-anchor={anchor(`item-${it.id}`)} aria-pressed={picked === it.id}
      className={['sorter-item', picked === it.id && 'is-picked', held && 'is-held', asked.has(it.id) && 'is-asked'].filter(Boolean).join(' ')}
      aria-label={`${it.text}${sorted ? `, in ${s.bins.find(b => b.id === state.placed[it.id]).label}` : ''}${held ? ', waits for your prediction' : ''}`}
      onClick={e => { e.stopPropagation(); press(); }}
      onKeyDown={e => {
        if (picked !== it.id) return;
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (d) { e.preventDefault(); setAim(a => (a + d + s.bins.length) % s.bins.length); }
        else if (e.key === 'Enter') { e.preventDefault(); put(s.bins[aim].id); }
        else if (e.key === 'Escape') { e.preventDefault(); setPicked(null); }
      }}>
      <BoardRichText text={it.text} inline/>
    </button>;
  };
  const tray = s.items.filter(it => !state.placed[it.id]);
  return <div className={`element-sorter${picked ? ' is-picking' : ''}`}>
    {tray.length > 0 && <div className="sorter-tray">{tray.map(chip)}</div>}
    <div className="sorter-bins">{s.bins.map((b, i) => <section key={b.id} data-anchor={anchor(`bin-${b.id}`)} className={`sorter-bin${picked && aim === i ? ' is-aimed' : ''}`} onClick={() => put(b.id)}>
      <button type="button" className="sorter-label" disabled={!picked} aria-label={picked ? `Put it in ${b.label}` : b.label} onClick={e => { e.stopPropagation(); put(b.id); }}>{b.label}</button>
      <div className="sorter-items">{s.items.filter(it => state.placed[it.id] === b.id).map(chip)}</div>
    </section>)}</div>
  </div>;
}
