import React from 'react';
import Diagram from '../visuals/Diagram.jsx';
import './canvas.css';

// Draw from memory (shared/elements/canvas.mjs): a quiet frame (blank, axes, or labelled boxes as a partial drawing) that
// the learner draws on with the page's own pen. It is part of the page, so their strokes belong to it. Once revealed,
// the reference stands beside it (below on a phone). The rubric is never shown.
export default function Canvas({ state, anchor }) {
  const s = state.spec, reference = state.revealed && s.reference?.kind === 'diagram' ? s.reference : null;
  return <div className="element-canvas">
    <div className={`canvas-frame is-${s.frame}`} data-anchor={anchor('frame')} role="img" aria-label={`A ${s.frame === 'blank' ? 'blank frame' : s.frame === 'axes' ? 'pair of axes' : `frame with ${s.boxes.length} boxes`} to draw on${s.boxes.some(b => b.label) ? `: ${s.boxes.map(b => b.label).filter(Boolean).join(', ')}` : ''}`}>
      {s.boxes.map((b, i) => <div key={i} className="canvas-box" data-anchor={anchor(`box-${i + 1}`)} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
        {b.label && <span className="canvas-box-label">{b.label}</span>}
      </div>)}
    </div>
    {reference && <div className="canvas-reference" data-anchor={anchor('reference')}><Diagram diagram={{ type: reference.type, data: reference.data }}/></div>}
  </div>;
}
