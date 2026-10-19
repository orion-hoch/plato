import React from 'react';
import BoardRichText from '../BoardRichText.jsx';
import './order.css';

// Arranging, for proof blocks and timelines (shared/elements/proofblocks.mjs, timeline.mjs): the arrangement, numbered,
// and the rest still to place, side by side when there is room, stacked on a phone. A press (or Enter, Space) on a tile
// still to place puts it at the end; on a placed one, takes it back; Alt with an arrow moves a placed tile. On a
// timeline asked to predict, a press shows that event's date instead, once the learner has said when it was.
export default function Order({ state, spec, act, task, anchor }) {
  const s = state.spec, items = new Map((s.blocks || s.events).map(it => [it.id, it])), kind = s.blocks ? 'block' : 'event';
  const predict = spec.task?.mode === 'predict', asked = new Set(task.open()?.predict || []), shown = new Set(state.revealed || []);
  const tile = (id, at) => {
    const it = items.get(id), placed = at >= 0, action = predict ? `reveal ${id}` : placed ? `remove ${id}` : `add ${id}`, held = task.blocked(action);
    const words = it.text ?? it.label, move = d => act(`move ${id} ${at + 1 + d}`);
    return <li key={id}>
      <button type="button" data-anchor={anchor(`${kind}-${id}`)} style={it.indent ? { '--indent': it.indent } : undefined}
        className={['order-tile', held && 'is-held', asked.has(`year ${id}`) && 'is-asked'].filter(Boolean).join(' ')}
        aria-label={`${placed ? `${at + 1}: ` : ''}${words}${shown.has(id) ? `, ${it.date}` : ''}${held ? ', waits for your prediction' : ''}`}
        onClick={() => act(action)}
        onKeyDown={e => { if (placed && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(e.key === 'ArrowUp' ? -1 : 1); } }}>
        {placed && <span className="order-n" aria-hidden="true">{at + 1}</span>}
        <span className="order-words"><BoardRichText text={words} inline/></span>
        {shown.has(id) && <span className="order-date">{it.date}</span>}
      </button>
    </li>;
  };
  return <div className={`element-order is-${kind}`}>
    <ol className="order-placed" aria-label={kind === 'block' ? 'The proof so far' : 'In order'}>{state.order.map((id, i) => tile(id, i))}</ol>
    {state.pool.length > 0 && <ul className="order-pool" aria-label="Still to place">{state.pool.map(id => tile(id, -1))}</ul>}
  </div>;
}
