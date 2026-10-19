import { useEffect, useState } from 'react';

// What is being made in the background (a problem, a drawing, a think, a figure): what it is, its stage and outline as they
// come, and a bar (13 Oct, the user: a wait is fine when it's shown and explained). A build that reports how far along it
// really is (a figure: m.fraction, from its builder's own steps) fills by that, with the time so far, and says when its last
// step was long ago (16 Oct, the user: "real progress indicators instead of dead air"); the rest fill against the time
// they usually take.
const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export default function Making({ items }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!items.length) return undefined;
    const timer = setInterval(() => tick(n => n + 1), 500);
    return () => clearInterval(timer);
  }, [items.length]);
  if (!items.length) return null;
  return <div className="making" role="status">
    {items.map(m => {
      const gone = Date.now() - m.at, left = Math.round((m.etaMs - gone) / 1000), real = typeof m.fraction === 'number';
      const filled = real ? m.fraction : 1 - Math.exp(-1.6 * gone / m.etaMs); // a guess: about 80% at the estimate, never quite full until it's here
      const hint = left > 90 ? `about ${Math.round(left / 60)} min left` : left > 0 ? `about ${left} s left` : 'taking longer than usual';
      const quiet = real && m.stageAt && Date.now() - m.stageAt > 60_000 ? ` (still on this step, ${clock(Date.now() - m.stageAt)})` : '';
      return <div key={m.key} className="making-item">
        <div className="making-head">
          <span className="making-label">{m.title || m.label}</span>
          <span className="making-time" aria-hidden="true">{real ? `${Math.round(filled * 100)}%, ${clock(gone)}, ${hint}` : left > 90 ? `about ${Math.round(left / 60)} min` : left > 0 ? `about ${left} s` : 'almost there'}</span>
        </div>
        <div className="making-bar" aria-hidden="true"><span style={{ width: `${(filled * 100).toFixed(1)}%` }}/></div>
        {(m.stage || m.outline) && <p className="making-note">{m.stage}{quiet}{m.stage && m.outline ? ': ' : ''}{m.outline}</p>}
      </div>;
    })}
  </div>;
}
