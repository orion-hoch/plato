// The last look at a drawing once it is on the page (Diagram.jsx, Figure.jsx): each label measured as drawn; one that
// overlaps another moved the shortest way clear (the later one moves, a few fixed passes); one a line runs through
// given a halo in the colour under it, and lifted over the line when the line was drawn later; and the viewBox grown to
// hold every label. The diagrams lay their labels out already, so this catches what an estimate missed, and what a
// model drew. (16 Oct, the user: "prevent scrolling elements": no floor on shrinking any more, so nothing scrolls.)
const SHAPES = 'path,line,polyline,polygon,rect,circle,ellipse', GAP = 2;
const unused = el => el.closest('defs,marker,clipPath,mask,pattern,symbol');
const clear = colour => !colour || colour === 'none' || colour === 'transparent' || /rgba\(.*,\s*0\)$/.test(colour);
const round = v => Math.round(v * 10) / 10;
const shift = ([x0, y0, x1, y1], dx, dy) => [x0 + dx, y0 + dy, x1 + dx, y1 + dy];
// A label's ink: its box without the room a font keeps over its capitals (and the little under its descenders).
const ink = ([x0, y0, x1, y1]) => { const h = y1 - y0; return [x0, y0 + h * .2, x1, y1 - h * .05]; };
const hit = (a, b) => { a = ink(a); b = ink(b); return a[0] < b[2] + GAP && b[0] < a[2] + GAP && a[1] < b[3] && b[1] < a[3]; };
const before = (a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
// A shape's straight strokes as segments [x1, y1, x2, y2] in its own units, or null for a curve (a circle, an arc).
function segments(el) {
  const tag = el.tagName, num = name => el[name].baseVal.value;
  if (tag === 'line') return [[num('x1'), num('y1'), num('x2'), num('y2')]];
  if (tag === 'rect') { const x = num('x'), y = num('y'), r = x + num('width'), b = y + num('height'); return [[x, y, r, y], [r, y, r, b], [r, b, x, b], [x, b, x, y]]; }
  if (tag === 'polyline' || tag === 'polygon') {
    const p = Array.from({ length: el.points.numberOfItems }, (_, i) => { const q = el.points.getItem(i); return [q.x, q.y]; });
    return p.slice(tag === 'polygon' ? 0 : 1).map((q, i) => [...(tag === 'polygon' ? p.at(i - 1) : p[i]), ...q]);
  }
  if (tag !== 'path') return null;
  const out = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  for (const [, c, args] of (el.getAttribute('d') || '').matchAll(/([a-zA-Z])([^a-zA-Z]*)/g)) {
    const v = (args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number), up = c.toUpperCase(), rel = c !== up ? 1 : 0;
    if (!'MLHVZ'.includes(up)) return null;
    if (up === 'Z') { out.push([x, y, sx, sy]); x = sx; y = sy; }
    for (let i = 0; i < v.length;) {
      let nx = x, ny = y;
      if (up === 'H') nx = v[i++] + rel * x;
      else if (up === 'V') ny = v[i++] + rel * y;
      else { nx = v[i++] + rel * x; ny = v[i++] + rel * y; }
      if (up === 'M' && i <= 2) { sx = nx; sy = ny; } else out.push([x, y, nx, ny]); // more pairs after M draw lines
      x = nx; y = ny;
    }
  }
  return out;
}
// Whether a segment crosses a box: their extents meet, and the box's corners are not all on one side of it.
function cuts([ax, ay, bx, by], [x0, y0, x1, y1]) {
  if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(ay, by) < y0 || Math.min(ay, by) > y1) return false;
  const side = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)));
  return !side.every(v => v > 0) && !side.every(v => v < 0);
}

/** Settles the <svg> in `figure` (which carries --w, the drawn width). A drawing that can't be measured stays as drawn. */
export function settle(figure) {
  const svg = figure?.querySelector('svg'), view = svg?.viewBox?.baseVal, screen = svg?.getScreenCTM();
  if (!view?.width || !screen) return;
  try {
    const user = screen.inverse(), frame = el => user.multiply(el.getScreenCTM());
    const bounds = (el, m = frame(el)) => {
      const b = el.getBBox(), p = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
      return [Math.min(...p.map(q => q.x)), Math.min(...p.map(q => q.y)), Math.max(...p.map(q => q.x)), Math.max(...p.map(q => q.y))];
    };
    const labels = [...svg.querySelectorAll('text')].filter(t => t.textContent.trim() && !unused(t)).map(t => ({ t, b: bounds(t), dx: 0, dy: 0 }));
    if (!labels.length) return;

    // Overlaps: the later label takes the shortest of four moves clear (up, down, left, right), any that would land
    // it on a third label costing more.
    for (let pass = 0, moved = true; moved && pass < 4; pass++) {
      moved = false;
      labels.forEach((b, j) => labels.slice(0, j).forEach(a => {
        if (!hit(a.b, b.b)) return;
        const [ax0, ay0, ax1, ay1] = ink(a.b), [bx0, by0, bx1, by1] = ink(b.b);
        const moves = [[0, ay0 - by1 - 1], [0, ay1 - by0 + 1], [ax0 - GAP - 1 - bx1, 0], [ax1 + GAP + 1 - bx0, 0]].map(([dx, dy]) =>
          ({ dx, dy, cost: Math.abs(dx) + Math.abs(dy) + 99 * labels.filter(o => o !== b && o !== a && hit(o.b, shift(b.b, dx, dy))).length }));
        const { dx, dy } = moves.reduce((p, q) => q.cost < p.cost ? q : p);
        b.b = shift(b.b, dx, dy); b.dx += dx; b.dy += dy; moved = true;
      }));
    }
    // A move is a translate in the label's parent's own units, ahead of any transform it has.
    const apply = (l, dx, dy) => {
      const m = frame(l.t.parentNode).inverse(), old = l.t.getAttribute('transform');
      l.t.setAttribute('transform', `translate(${round(m.a * dx + m.c * dy)} ${round(m.b * dx + m.d * dy)})${old ? ` ${old}` : ''}`);
    };
    for (const l of labels) if (l.dx || l.dy) apply(l, l.dx, l.dy);

    // Lines through labels: a label slides a few px off the line when that clears it of every line and label; else
    // it gets a halo in the colour under it (the topmost solid fill drawn before it, else the page), lifted to the
    // top first if the line is drawn over it.
    // Straight strokes are tested as segments; curves by sampling the label's ink. A clipped shape is left out (what
    // it would cross may be clipped away).
    const shapes = [...svg.querySelectorAll(SHAPES)].filter(s => !unused(s)).map(s => {
      const css = getComputedStyle(s), m = frame(s), w = parseFloat(css.strokeWidth) || 0, stroked = !clear(css.stroke) && w > 0 && !s.closest('[clip-path]');
      const segs = stroked && segments(s)?.map(([ax, ay, bx, by]) => [m.a * ax + m.c * ay + m.e, m.b * ax + m.d * ay + m.f, m.a * bx + m.c * by + m.e, m.b * bx + m.d * by + m.f]);
      return { s, css, back: m.inverse(), b: bounds(s, m), w, stroked, segs };
    }).filter(sh => sh.stroked || !clear(sh.css.fill));
    const grid = ([x0, y0, x1, y1]) => { const p = []; for (let x = x0 + .5; x < x1; x += 1.2) for (let y = y0; y < y1 + .6; y += 1.2) p.push(new DOMPoint(x, Math.min(y, y1))); return p; };
    const through = b => {
      const [x0, y0, x1, y1] = ink(b);
      let points;
      return shapes.filter(({ stroked, b: [sx0, sy0, sx1, sy1], w, segs, s, back }) => stroked && sx0 - w < x1 && x0 < sx1 + w && sy0 - w < y1 && y0 < sy1 + w && (segs
        ? segs.some(seg => cuts(seg, [x0 - w / 2, y0 - w / 2, x1 + w / 2, y1 + w / 2]))
        : (points ||= grid(ink(b))).some(p => s.isPointInStroke(p.matrixTransform(back)))));
    };
    let page = '#fff';
    for (let el = figure; el; el = el.parentElement) { const c = getComputedStyle(el).backgroundColor; if (!clear(c)) { page = c; break; } }
    for (const l of labels) {
      const css = getComputedStyle(l.t);
      if (css.paintOrder.startsWith('stroke') && !clear(css.stroke)) continue; // haloed already
      const crossing = through(l.b);
      if (!crossing.length) continue;
      const slide = [4, 8, 12].flatMap(d => [[0, -d], [0, d], [-d, 0], [d, 0]]).find(([dx, dy]) => { const b = shift(l.b, dx, dy); return !labels.some(o => o !== l && hit(o.b, b)) && !through(b).length; });
      if (slide) { apply(l, ...slide); l.b = shift(l.b, ...slide); continue; }
      const [x0, y0, x1, y1] = ink(l.b), mid = new DOMPoint((x0 + x1) / 2, (y0 + y1) / 2), solid = sh => !clear(sh.css.fill) && +sh.css.fillOpacity > .9 && +sh.css.opacity > .9;
      const under = shapes.filter(sh => before(sh.s, l.t) && solid(sh) && sh.s.isPointInFill(mid.matrixTransform(sh.back))).at(-1);
      if (crossing.some(sh => before(l.t, sh.s))) {
        const m = frame(l.t);
        for (const p of ['fill', 'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing']) l.t.style.setProperty(p, css.getPropertyValue(p));
        l.t.setAttribute('transform', `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(round).join(' ')})`);
        svg.appendChild(l.t);
      }
      for (const el of [l.t, ...l.t.querySelectorAll('tspan')]) Object.assign(el.style, { stroke: under ? under.css.fill : page, strokeWidth: '4px', strokeLinejoin: 'round', paintOrder: 'stroke' });
    }

    // Room for every label.
    const x0 = Math.floor(Math.min(view.x, ...labels.map(l => l.b[0] - 2))), y0 = Math.floor(Math.min(view.y, ...labels.map(l => l.b[1] - 2)));
    const x1 = Math.ceil(Math.max(view.x + view.width, ...labels.map(l => l.b[2] + 2))), y1 = Math.ceil(Math.max(view.y + view.height, ...labels.map(l => l.b[3] + 2)));
    if (x0 < view.x || y0 < view.y || x1 > view.x + view.width || y1 > view.y + view.height) {
      svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
      svg.setAttribute('width', x1 - x0); svg.setAttribute('height', y1 - y0);
      figure.style.setProperty('--w', `${x1 - x0}px`);
    }
  } catch { /* stays as drawn */ }
}
