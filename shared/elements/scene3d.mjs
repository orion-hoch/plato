// A small 3D scene the student can turn and zoom (src/elements/Scene3D.jsx draws it with three.js). Data only:
// shapes from a fixed list, colours by name, bounded coordinates; text reaches the page as text.
import { checks, str, clip } from './check.mjs';

const { fail, num, arr, object } = checks('scene3d');
/** The page's marks: lapis, terracotta, gold and green (as in the course diagrams), ink and stone. */
export const PALETTE = { lapis: '#2f4f8a', terracotta: '#b5653e', gold: '#bfa035', green: '#2f8a5c', ink: '#1d1b18', stone: '#9a9183' };
const TYPES = ['box', 'sphere', 'cylinder', 'cone', 'plane', 'arrow', 'line', 'point', 'grid', 'axes', 'label'];
const AXES = ['x', 'y', 'z'], REACH = 20;
const point = (value, name, reach = REACH) => arr(value, name, 3, 3).map((c, i) => num(c, `${name}[${i}]`, -reach, reach));

export const purpose = 'a 3D scene the student can turn and zoom: boxes, spheres, cylinders, cones, planes, arrows (vectors), lines, points, a floor grid, axes and labels, optionally animated';

export const example = {
  objects: [
    { type: 'axes', size: [3] },
    { type: 'arrow', at: [0, 0, 0], to: [2, 1, 0], color: 'lapis', label: 'u' },
    { type: 'arrow', at: [0, 0, 0], to: [0, 1, 2], color: 'terracotta', label: 'v' },
    { id: 'cube', type: 'box', at: [2, 0.5, 2], size: [1, 1, 1], color: 'gold', opacity: 0.7 },
  ],
  animate: [{ id: 'cube', spin: 'y', seconds: 8, loop: true }],
  caption: 'u and v both start at the origin.',
};

export const rules = `spec: {"objects": [...], "camera": {"position": [x, y, z], "target": [x, y, z]}, "animate": [...], "caption": "..."}; y points up.
Each object (at most 40): {"type", "at": [x, y, z], "id", "color", "opacity", "label", "rotation", ...its own fields}:
- type and its fields: box ("size": [w, h, d]), sphere ("radius"), cylinder and cone ("radius", "height"), plane ("size": [w, d], flat on the floor unless rotated), arrow (from "at" to "to": [x, y, z]), line ("points": [[x, y, z], ...], 2 to 200), point, grid ("size": [w], a floor grid), axes ("size": [length], labelled x, y, z), label (just its text).
- at: its centre (an arrow's tail); every coordinate from -${REACH} to ${REACH}. rotation: degrees about x, y and z.
- color: lapis, terracotta, gold, green, ink or stone, nothing else. opacity: 0.1 to 1.
- label: up to 32 characters shown beside it. id: a name, needed only to animate it.
camera: optional; by default the view frames everything. The student can turn the view and zoom.
animate (at most 6): {"id", "spin": "x" | "y" | "z", "moveTo": [x, y, z], "seconds": 1 to 20, "loop": true | false}: spin turns it once per period; moveTo slides it there (and back again, when it loops).
caption: optional, one short sentence under the view.
Example: ${JSON.stringify(example)}`;

export function validate(input) {
  const raw = object(input), ids = new Set();
  const objects = arr(raw.objects, 'objects', 1, 40).map((o, i) => {
    const at = `objects[${i}]`;
    if (!o || typeof o !== 'object') fail(`${at} must be an object`);
    if (!TYPES.includes(o.type)) fail(`${at}.type must be one of ${TYPES.join(', ')}`);
    const out = { type: o.type, at: o.at == null ? [0, 0, 0] : point(o.at, `${at}.at`) };
    if (o.id != null) {
      out.id = str(o.id);
      if (!/^[A-Za-z]\w{0,23}$/.test(out.id) || ids.has(out.id)) fail(`${at}.id must be a unique name (a letter, then letters, digits or _)`);
      ids.add(out.id);
    }
    if (o.size != null) out.size = arr(o.size, `${at}.size`, 1, 3).map((v, k) => num(v, `${at}.size[${k}]`, 0.01, 2 * REACH));
    if (o.radius != null) out.radius = num(o.radius, `${at}.radius`, 0.01, REACH);
    if (o.height != null) out.height = num(o.height, `${at}.height`, 0.01, 2 * REACH);
    if (o.type === 'arrow') out.to = point(o.to, `${at}.to`);
    if (o.type === 'line') out.points = arr(o.points, `${at}.points`, 2, 200).map((p, k) => point(p, `${at}.points[${k}]`));
    if (o.rotation != null) out.rotation = point(o.rotation, `${at}.rotation`, 360);
    if (o.color != null) out.color = Object.hasOwn(PALETTE, o.color) ? o.color : fail(`${at}.color must be one of ${Object.keys(PALETTE).join(', ')}`);
    if (o.opacity != null) out.opacity = num(o.opacity, `${at}.opacity`, 0.1, 1);
    const label = clip(str(o.label).trim(), 32);
    if (label) out.label = label;
    else if (o.type === 'label') fail(`${at} is a label: put its text in "label"`);
    return out;
  });
  const animate = (raw.animate == null ? [] : arr(raw.animate, 'animate', 0, 6)).map((a, i) => {
    const at = `animate[${i}]`;
    if (!ids.has(a?.id)) fail(`${at}.id must be the id of one of the objects`);
    const out = { id: a.id, seconds: num(a.seconds ?? 4, `${at}.seconds`, 1, 20), loop: a.loop === true };
    if (a.spin != null) out.spin = AXES.includes(a.spin) ? a.spin : fail(`${at}.spin must be "x", "y" or "z"`);
    if (a.moveTo != null) out.moveTo = point(a.moveTo, `${at}.moveTo`);
    if (!out.spin && !out.moveTo) fail(`${at} needs spin or moveTo`);
    return out;
  });
  const spec = { objects, animate, caption: clip(str(raw.caption).trim(), 160) };
  if (raw.camera != null) {
    const { position, target } = spec.camera = { position: point(raw.camera.position, 'camera.position', 3 * REACH), target: raw.camera.target == null ? [0, 0, 0] : point(raw.camera.target, 'camera.target') };
    if (Math.hypot(...position.map((c, i) => c - target[i])) < .5) fail('camera.position must be at least 0.5 away from camera.target'); // the view orbits the target
  }
  return spec;
}
