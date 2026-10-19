import React from 'react';
import BoardRichText from '../BoardRichText.jsx';

// What the student's own notes say (show_from_notes), under Plato's material: each excerpt as their notes have it,
// and the file it comes from. `excerpts` is [{ text, source, anchorId }].
export default function Notes({ excerpts }) {
  return excerpts.map(e => <figure key={e.anchorId} className="page-notes">
    <blockquote><BoardRichText text={e.text}/></blockquote>
    <figcaption>— {e.source}</figcaption>
  </figure>);
}
