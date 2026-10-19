import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { renderDiagram } from './diagram.mjs';
import { settle } from './settle.js';
import Formula from './Formula.jsx';
import '../material.css';

/**
 * A course diagram as crisp SVG on the page (material.css sizes it), drawn for the page's width so a long row of
 * bits wraps on a phone instead of shrinking, then settled (settle.js) once its labels can be measured. Data that
 * cannot be drawn shows nothing: the tool call that put it here has already told the agent why. (`stone` is accepted
 * and ignored; the stone-laid drawing is gone.) A formula is live instead (Formula.jsx), and tells Plato through
 * onContext what the student set it to.
 */
export default function Diagram({ diagram, onContext }) {
  const type = diagram?.type ?? diagram?.diagram_type;
  return type === 'formula' ? <Formula data={diagram.data ?? diagram.diagram_data} onContext={onContext}/> : <Drawing diagram={diagram}/>;
}

function Drawing({ diagram }) {
  const figure = useRef(null), [width, setWidth] = useState();
  const drawn = useMemo(() => { try { return renderDiagram(diagram, { width }); } catch { return null; } }, [JSON.stringify(diagram), width]);
  useLayoutEffect(() => { // measured before paint, so the first frame is already drawn to fit
    const box = figure.current, measure = () => setWidth(box.clientWidth || undefined);
    if (!box) return;
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(box);
    return () => watch.disconnect();
  }, [!drawn]);
  useLayoutEffect(() => settle(figure.current), [drawn?.svg]);
  return drawn && <figure ref={figure} className="material is-diagram" style={{ '--w': `${drawn.width}px` }} dangerouslySetInnerHTML={{ __html: drawn.svg }} />;
}
