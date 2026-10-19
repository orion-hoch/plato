import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { markup } from '../../shared/elements/figure.mjs';
import { settle } from '../visuals/settle.js';

// An explanation figure the tutor had drawn: its SVG, already checked against the whitelist and written back by
// validate() (Element.jsx checked it again here), drawn on the sheet like a course diagram, coloured by the classes
// elements.css maps to the page's palette. Each gets its own id prefix, so two figures' arrowheads never mix. A
// model's layout can't be trusted, so once drawn it is settled (settle.js): labels apart, clear of lines, in view.
let drawn = 0;

export default function Figure({ spec }) {
  const { svg, width } = useMemo(() => markup(spec, `fig${++drawn}-`), [spec]), view = useRef(null);
  useLayoutEffect(() => settle(view.current), [svg]);
  return <figure ref={view} className="element-figure" style={{ '--w': `${width}px` }}>
    <div className="figure-view" dangerouslySetInnerHTML={{ __html: svg }}/>
    {spec.caption && <figcaption>{spec.caption}</figcaption>}
  </figure>;
}
