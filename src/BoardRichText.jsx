import React, { useMemo } from 'react';
import { parseMaterial, parseInline, highlightLines, renderBoardInlineMath } from '../shared/board-rich-text.mjs';
import 'katex/dist/katex.min.css';
import './material.css';

// Plato's material as React elements: block markdown by default, `inline` for a choice label or a short
// prompt. Text is never inserted as HTML; KaTeX's markup (trust off) is the one exception.
export default function BoardRichText({ text, inline = false }) {
  return useMemo(() => inline
    ? <span className="material is-inline">{spans(parseInline(text))}</span>
    : <div className="material">{blocks(parseMaterial(text))}</div>, [text, inline]);
}

const formula = (key, text, display, Tag = 'span') =>
  <Tag key={key} className={display ? 'formula is-display' : 'formula'} dangerouslySetInnerHTML={{ __html: renderBoardInlineMath(text, { display }) }} />;

function spans(nodes) {
  return nodes.map((node, key) => node.type === 'text' ? node.text
    : node.type === 'br' ? <br key={key} />
    : node.type === 'code' ? <code key={key}>{node.text}</code>
    : node.type === 'math' ? formula(key, node.text, node.display)
    : node.type === 'strong' ? <strong key={key}>{spans(node.children)}</strong>
    : <em key={key}>{spans(node.children)}</em>);
}

// A list item that is one paragraph is just its text.
function blocks(list, tight = false) {
  if (tight && list.length === 1 && list[0].type === 'p') return spans(list[0].children);
  return list.map((block, key) => {
    switch (block.type) {
      case 'p': return <p key={key}>{spans(block.children)}</p>;
      case 'h': { const Heading = `h${block.level + 2}`; return <Heading key={key}>{spans(block.children)}</Heading>; }
      // A line a block, so it wraps under itself (material.css) and point_to finds it; an empty one keeps a space.
      case 'code': return <pre key={key}><code>{highlightLines(block.text, block.lang).map((line, n) => <span key={n} className="code-line">
        {line.length ? line.map((t, i) => t.type ? <span key={i} className={`tok-${t.type}`}>{t.text}</span> : t.text) : ' '}</span>)}</code></pre>;
      case 'math': return formula(key, block.text, true, 'div');
      case 'list': { const List = block.ordered ? 'ol' : 'ul'; return <List key={key} start={block.start === 1 ? undefined : block.start}>{block.items.map((item, i) => <li key={i}>{blocks(item, true)}</li>)}</List>; }
      case 'table': return <div key={key} className="table"><table>
        <thead><tr>{block.head.map((cell, c) => <th key={c} style={{ textAlign: block.align[c] || undefined }}>{spans(cell)}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} style={{ textAlign: block.align[c] || undefined }}>{spans(cell)}</td>)}</tr>)}</tbody>
      </table></div>;
      case 'quote': return <blockquote key={key}>{blocks(block.blocks)}</blockquote>;
      default: return <hr key={key} />;
    }
  });
}
