// Where the student's strokes lie on the screen. A stroke written on Plato's page keeps its points from the
// corner of the part of the page it was written on (`on`), so it scrolls and moves with that part and shows only
// within the page (`sheet`). A stroke off the page (`on` null) stays where it is. Writing never goes by itself:
// when its part of the page goes (new material, the page put away), it stays where it was last seen (`keep`);
// only an undo or a clear takes it away.

/** Still anchored to something shown: off the page, or on a part of the page that is still there. */
export const live = stroke => !stroke.on || stroke.on.isConnected;

/** The strokes in the coordinates of `box` (the ink's canvas), each with the page's band to clip to, if on it. */
export function onScreen(strokes, box) {
  return strokes.filter(live).map(stroke => {
    if (!stroke.on) return stroke;
    const part = stroke.on.getBoundingClientRect(), sheet = stroke.sheet.getBoundingClientRect(), dx = part.left - box.left, dy = part.top - box.top;
    // Where it was last drawn: if its part goes, that is where it stays.
    return stroke.seen = { points: stroke.points.map(({ x, y, p }) => ({ x: x + dx, y: y + dy, p })), clip: { top: sheet.top - box.top, height: sheet.height } };
  });
}

/** A stroke whose part of the page has gone stays where it was last seen; one written on Plato's material stays a note. */
export function keep(stroke) {
  if (live(stroke)) return stroke;
  return Object.assign(stroke, { note: !stroke.on.classList?.contains('page-ask'), on: null, sheet: null, points: stroke.seen?.points || [], clip: stroke.seen?.clip || null });
}

/** Whether a line drawn through `points` passes within `r` of (x, y): what the eraser, rubbed there, takes away. */
export function touches(points, x, y, r) {
  if (points.length === 1) return Math.hypot(points[0].x - x, points[0].y - y) <= r;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], dx = points[i].x - a.x, dy = points[i].y - a.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0;
    if (Math.hypot(a.x + t * dx - x, a.y + t * dy - y) <= r) return true;
  }
  return false;
}

/** What is left of a line drawn through `points` after the eraser rubs at (x, y) with radius `r`: the pieces outside
 *  it, cut exactly where the line crosses its edge (none, when it was all under the eraser). */
export function erase(points, x, y, r) {
  const pieces = [];
  let piece = [];
  const cut = () => { if (piece.length) pieces.push(piece); piece = []; };
  points.forEach((b, i) => {
    const a = points[i - 1];
    if (a) {
      // Where the segment from a to b enters (t1) and leaves (t2) the eraser's circle.
      const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - x, fy = a.y - y, A = dx * dx + dy * dy;
      const B = 2 * (fx * dx + fy * dy), disc = B * B - 4 * A * (fx * fx + fy * fy - r * r);
      if (A > 0 && disc > 0) {
        const t1 = (-B - Math.sqrt(disc)) / (2 * A), t2 = (-B + Math.sqrt(disc)) / (2 * A);
        const along = t => ({ x: a.x + t * dx, y: a.y + t * dy, p: a.p + t * (b.p - a.p) });
        if (t1 > 0 && t1 < 1) { piece.push(along(t1)); cut(); }
        if (t2 > 0 && t2 < 1) { cut(); piece.push(along(t2)); }
      }
    }
    if (Math.hypot(b.x - x, b.y - y) < r) cut(); else piece.push(b);
  });
  cut();
  // A sliver left at the eraser's edge is not writing; a dot that was never touched stays.
  return pieces.filter(p => points.length === 1 || p.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - p[i].x, q.y - p[i].y), 0) >= 1);
}

/** A line through `points` ([x, y]) with only the points it needs: none of those dropped lies further than `tolerance`
 *  from the line kept (Ramer–Douglas–Peucker). */
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const a = points[0], b = points.at(-1), length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let far = 0, at = 0;
  points.forEach((p, i) => {
    const d = length ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / length : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > far) { far = d; at = i; }
  });
  return far <= tolerance ? [a, b] : [...simplify(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplify(points.slice(at), tolerance)];
}

// ponytail: a size-and-shape test, free and instant; tune DRAWN on real pages, or learn it if it misjudges them.
const DRAWN = 3;
/** Whether ink (strokes with a box [x0, y0, x1, y1] and points [x, y, …]) is a drawing rather than writing, so its
 *  shapes are worth reading: a stroke DRAWN times the size of the middle-sized one that is not a flat line (a fraction
 *  bar, an underline) is drawn; ink with a closed one (a circle, a box) or two of them is a drawing. */
export function diagramish(ink) {
  const strokes = ink?.strokes ?? [], size = ({ box }) => Math.max(box[2] - box[0], box[3] - box[1]);
  if (strokes.length < 2 || strokes.length > 400) return false;
  const middle = Math.max(8, strokes.map(size).sort((a, b) => a - b)[strokes.length >> 1]);
  const drawn = strokes.filter(st => size(st) >= DRAWN * middle && st.box[3] - st.box[1] >= .15 * (st.box[2] - st.box[0]));
  return drawn.length >= 2 || drawn.some(({ pts, ...st }) => Math.hypot(pts[0] - pts.at(-2), pts[1] - pts.at(-1)) <= .25 * size(st));
}

const gap = (el, y) => { const r = el.getBoundingClientRect(); return Math.max(0, r.top - y, y - r.bottom); };
/** The part of the page nearest a height on the screen: what writing in the page's margin belongs to. Of parts
 *  equally near, the last: a part inside another (an exam problem's part) comes after it. */
export const nearest = (parts, y) => [...parts].reduce((best, part) => !best || gap(part, y) <= gap(best, y) ? part : best, null);
