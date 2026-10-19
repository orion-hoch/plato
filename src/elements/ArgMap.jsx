import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { standing } from '../../shared/elements/argmap.mjs';
import './argmap.css';

// An argument map (shared/elements/argmap.mjs): sources on the left, claims on the right (one column on a phone), joined
// by connectors: lapis for supports, terracotta dashed for undermines. A source that is off fades; a claim that falls is
// struck through. In a construct task the learner links: a source or claim, then a claim (again: the other kind, then
// unlinked); otherwise pressing a source switches it on or off, which a checkpoint holds until they predict.
export default function ArgMap({ state, spec, act, task, anchor, hidden = new Set() }) {
  const box = useRef(null), [geom, setGeom] = useState(null), [pick, setPick] = useState(null), marker = useId().replace(/:/g, '');
  const s = state.spec, stands = standing(state), building = spec.task?.mode === 'construct', asked = new Set(task.open()?.predict || []);
  // Where each card sits in the map, measured after layout (and again on any resize), for the connectors.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const o = el.getBoundingClientRect(), at = {};
      for (const n of el.querySelectorAll('[data-node]')) { const r = n.getBoundingClientRect(); at[n.dataset.node] = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; }
      setGeom(g => JSON.stringify(g) === JSON.stringify(at) ? g : at);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [state]);
  const live = from => (s.sources.some(x => x.id === from) && !state.off.includes(from)) || stands.has(from);
  const path = l => {
    const a = geom?.[l.from], b = geom?.[l.to];
    if (!a || !b) return null;
    if (b.x > a.x + a.w / 2) { const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x - 6, y2 = b.y + b.h / 2, k = (x2 - x1) / 2; return `M${x1} ${y1}C${x1 + k} ${y1} ${x2 - k} ${y2} ${x2} ${y2}`; }
    // One column (a claim to a claim, or everything on a phone): out into the right-hand gutter and back, past no card.
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x + b.w + 6, y2 = b.y + b.h / 2, out = Math.max(x1, x2) + 22;
    return `M${x1} ${y1}C${out} ${y1} ${out} ${y2} ${x2} ${y2}`;
  };
  const press = id => {
    if (!building) { if (s.sources.some(x => x.id === id)) act(`toggle ${id}`); return; }
    if (!pick || pick === id) { setPick(pick === id ? null : id); return; }
    if (!s.claims.some(c => c.id === id)) { setPick(id); return; }
    const have = state.links.find(l => l.from === pick && l.to === id);
    act(!have ? `link ${pick} ${id} supports` : have.kind === 'supports' ? `link ${pick} ${id} undermines` : `unlink ${pick} ${id}`);
  };
  const node = (n, isSource) => {
    // A claim whose verdict is being predicted shows neither standing nor fallen until revealed.
    const veiled = !isSource && hidden.has(n.id), off = isSource && state.off.includes(n.id), fallen = !veiled && !isSource && !stands.has(n.id), held = isSource && task.blocked(`toggle ${n.id}`);
    const pressable = building || isSource, label = `${isSource ? 'Source' : 'Claim'}: ${n.text}${n.author ? `, ${n.author}` : ''}${n.date ? `, ${n.date}` : ''}, ${isSource ? (off ? 'off' : 'on') : veiled ? 'to predict' : fallen ? 'falls' : 'stands'}${held ? ', waits for your prediction' : ''}${pick === n.id ? ', chosen to link from' : ''}`;
    const cls = ['argmap-node', isSource ? 'is-source' : 'is-claim', off && 'is-off', fallen && 'is-fallen', held && 'is-held', pick === n.id && 'is-picked', asked.has(n.id) && 'is-asked'].filter(Boolean).join(' ');
    const body = <>
      <span className="argmap-text">{n.text}</span>
      {isSource && (n.author || n.date) && <span className="argmap-meta">{[n.author, n.date].filter(Boolean).join(', ')}</span>}
    </>;
    return pressable
      ? <button key={n.id} type="button" data-node={n.id} data-anchor={anchor(`${isSource ? 'source' : 'claim'}-${n.id}`)} className={cls} aria-label={label} aria-pressed={isSource && !building ? !off : pick === n.id} onClick={() => press(n.id)}>{body}</button>
      : <div key={n.id} data-node={n.id} data-anchor={anchor(`claim-${n.id}`)} className={cls} role="note" aria-label={label}>{body}</div>;
  };
  return <figure ref={box} className="element-argmap" onKeyDown={e => { if (e.key === 'Escape') setPick(null); }}>
    <svg className="argmap-links" aria-hidden="true">
      <defs>{['supports', 'undermines'].map(k => <marker key={k} id={`${marker}-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" className={`argmap-head is-${k}`}/></marker>)}</defs>
      {state.links.map(l => { const d = path(l); return d && <path key={`${l.from}-${l.to}`} d={d} data-anchor={anchor(`link-${l.from}-${l.to}`)} markerEnd={`url(#${marker}-${l.kind})`} className={`argmap-link is-${l.kind}${live(l.from) ? '' : ' is-idle'}`}/>; })}
    </svg>
    <div className="argmap-cols">
      {s.sources.length > 0 && <div className="argmap-col">{s.sources.map(n => node(n, true))}</div>}
      <div className="argmap-col is-claims">{s.claims.map(n => node(n, false))}</div>
    </div>
  </figure>;
}
