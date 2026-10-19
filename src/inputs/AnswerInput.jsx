import React, { useEffect, useRef, useState } from 'react';
import BoardRichText from '../BoardRichText.jsx';
import { answerReady, readable, move } from './answer.mjs';
import './answer-input.css';

// Something to press for the kinds that need it, on the page. `spec` is already normalized (ids + text).
// onSubmit({ kind, value }, readableText). A choice is answered by pressing it. A selection, an order or pairs
// have no button: onDraft(answer or null, readableText) keeps the page told, and Enter, or Plato collecting
// the page when the student says they're done, hands it in. A spoken, typed or written answer needs nothing
// here: the student talks, types (the typed line answers a text or number question) or writes as always.

const Tile = ({ id, text, picked, onClick, disabled }) =>
  <button type="button" className={`pb-choice ${picked ? 'is-picked' : ''}`} disabled={disabled} onClick={onClick} aria-pressed={picked || undefined}>
    {id && <span className="pb-choice-id">{id}</span>}<span className="pb-choice-text"><BoardRichText text={text} inline /></span>
  </button>;

export default function AnswerInput({ kind, spec = {}, onSubmit, onDraft, done = false }) {
  const [value, setValue] = useState(() => kind === 'order' ? (spec.items || []).map(i => i.id) : kind === 'multi_select' || kind === 'match' ? [] : null);
  const [left, setLeft] = useState(null), [dragged, setDragged] = useState(null);
  // An order is an answer only once the student has moved something: as shown, it is just the question.
  const moved = useRef(false), reorder = change => { moved.current = true; setValue(change); };
  useEffect(() => { if (kind === 'order') setValue((spec.items || []).map(i => i.id)); }, [kind, spec.items]);
  useEffect(() => { if (kind !== 'choice' && Array.isArray(value)) onDraft?.(answerReady(kind, value, spec) && (kind !== 'order' || moved.current) ? { kind, value } : null, readable(kind, value, spec)); }, [value]);
  const submit = v => { if (!done && answerReady(kind, v, spec)) onSubmit({ kind, value: v }, readable(kind, v, spec)); };

  if (!['choice', 'multi_select', 'order', 'match'].includes(kind)) return null;

  if (kind === 'choice') return <div className="pb-choices" role="group" aria-label="Choices">
    {spec.options.map(o => <Tile key={o.id} {...o} picked={value === o.id} disabled={done} onClick={() => { setValue(o.id); submit(o.id); }} />)}
  </div>;

  if (kind === 'multi_select') return <div className="pb-choices" role="group" aria-label="Choose all that apply">
    {spec.options.map(o => <Tile key={o.id} {...o} picked={value.includes(o.id)} disabled={done} onClick={() => setValue(v => v.includes(o.id) ? v.filter(x => x !== o.id) : [...v, o.id])} />)}
  </div>;

  if (kind === 'order') {
    const text = new Map(spec.items.map(i => [i.id, i.text]));
    return <ol className="ai-order" aria-label="Arrange in order">
      {value.map((id, i) => <li key={id} draggable={!done} className={dragged === id ? 'is-dragged' : ''}
        onDragStart={() => setDragged(id)} onDragEnd={() => setDragged(null)}
        onDragOver={e => { e.preventDefault(); if (dragged && dragged !== id) reorder(v => { const from = v.indexOf(dragged), next = v.filter(x => x !== dragged); next.splice(v.indexOf(id) > from ? next.indexOf(id) + 1 : next.indexOf(id), 0, dragged); return next; }); }}>
        <span className="ai-order-n">{i + 1}</span><span className="ai-order-text"><BoardRichText text={text.get(id)} inline /></span>
        <span className="ai-order-moves">
          <button type="button" aria-label={`Move ${text.get(id)} up`} disabled={done || i === 0} onClick={() => reorder(v => move(v, i, -1))}>↑</button>
          <button type="button" aria-label={`Move ${text.get(id)} down`} disabled={done || i === value.length - 1} onClick={() => reorder(v => move(v, i, 1))}>↓</button>
        </span>
      </li>)}
    </ol>;
  }

  if (kind === 'match') {
    const paired = new Map(value.map(([l, r]) => [l, r])), used = new Set(value.map(([, r]) => r));
    const rText = new Map(spec.right.map(r => [r.id, r.text]));
    return <div className="ai-block">
      <p className="ai-hint">Press one on the left, then its match on the right. Press a pair to undo it.</p>
      <div className="ai-match">
        <div role="group" aria-label="Left">
          {spec.left.map(l => paired.has(l.id)
            ? <Tile key={l.id} text={`${l.text} → ${rText.get(paired.get(l.id))}`} picked disabled={done} onClick={() => setValue(v => v.filter(([a]) => a !== l.id))} />
            : <Tile key={l.id} text={l.text} picked={left === l.id} disabled={done} onClick={() => setLeft(l.id)} />)}
        </div>
        <div role="group" aria-label="Right">
          {spec.right.map(r => <Tile key={r.id} text={r.text} disabled={done || used.has(r.id) || !left} onClick={() => { setValue(v => [...v, [left, r.id]]); setLeft(null); }} />)}
        </div>
      </div>
    </div>;
  }
}
