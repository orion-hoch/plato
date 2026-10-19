import React, { useEffect, useRef, useState } from 'react';
import { FACES } from '../backend/session/agent.mjs';

// How Plato is teaching (local-actor.js, plato:face): a round button in the left rail showing the face he is in (its colour
// and mark); pressed, the faces with what each is for, and picking one switches him to it (plato:face-pick). 16 Oct, the
// user: "I would rather the faces be a button on the left instead of a shoe horned layout".
const MARK = {
  lecture: <path d="M4 5.5c2.5-1 5-1 8 .8 3-1.8 5.5-1.8 8-.8v13c-2.5-1-5-1-8 .8-3-1.8-5.5-1.8-8-.8zM12 6.3v13"/>,
  coach: <><path d="M15.5 4.5 19.5 8.5 9 19H5v-4z"/><path d="m13.5 6.5 4 4"/></>,
  critic: <><path d="M5 12.5 9.5 17 19 7.5"/></>,
  exam: <><circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M10 3.5h4"/></>,
  review: <><path d="m12 4 8 4-8 4-8-4z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/></>,
};
const AUTO = <><circle cx="8" cy="9" r="2.2"/><circle cx="16" cy="9" r="2.2"/><path d="M7 15.5c1.4 1.4 3 2 5 2s3.6-.6 5-2"/></>;

export default function FaceButton() {
  const [face, setFace] = useState(null), [open, setOpen] = useState(false), box = useRef(null);
  useEffect(() => { const on = ({ detail }) => setFace(detail?.face ? detail : null); addEventListener('plato:face', on); return () => removeEventListener('plato:face', on); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const away = e => { if (!box.current?.contains(e.target)) setOpen(false); }, key = e => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', away); addEventListener('keydown', key);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', key); };
  }, [open]);
  const pick = id => { setOpen(false); if (id !== face?.face) dispatchEvent(new CustomEvent('plato:face-pick', { detail: { face: id } })); };
  const now = face && FACES[face.face];
  return <div ref={box} className={`faces${face ? ` face-${face.face}` : ''}`}>
    <button type="button" className={`round face-button${face ? ' is-set' : ''}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)}
      aria-label={now ? `Plato is in ${now.name}${face.topic ? ` on ${face.topic}` : ''}. Change how he teaches` : 'How Plato teaches'} title={now ? `${now.name}${face.topic ? `: ${face.topic}` : ''}` : 'How Plato teaches'}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{MARK[face?.face] || AUTO}</svg>
    </button>
    {open && <div className="face-menu" role="menu" aria-label="How Plato teaches">
      <p className="face-menu-head">{now ? <>Now: <b>{now.name}</b>{face.topic && <> on {face.topic}</>}{face.by === 'student' ? ' (your pick)' : ''}</> : 'Plato picks how to teach as you go.'}</p>
      {Object.entries(FACES).map(([id, f]) => <button key={id} type="button" role="menuitemradio" aria-checked={face?.face === id} className={`face-${id}`} onClick={() => pick(id)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{MARK[id]}</svg>
        <span><b>{f.name}</b><small>{f.blurb.replace(/^./, c => c.toUpperCase())}</small></span>
      </button>)}
    </div>}
  </div>;
}
