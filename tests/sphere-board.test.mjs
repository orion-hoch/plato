import test from 'node:test';
import assert from 'node:assert/strict';
import { createSphereField, PITCH, RADIUS } from '../src/sphere/sphere-field.mjs';
import { createSphereMotion, BANDS, PAGE, WARM, GREEN, STRIDE, PLACE, TURN, CELL_STRIDE, BOARD_TRAVEL, FRAME_DEPTH, FRAME_FROM } from '../src/sphere/sphere-motion.mjs';
import { quatRotate } from '../src/sphere/sphere-math.mjs';

const field = createSphereField();
const FRAME = 1000 / 60;
const silence = new Float32Array(BANDS);
const voice = level => new Float32Array(BANDS).map((_, band) => Math.max(0, level * (1 - band * .035)));
const speech = level => time => voice(time % 260 < 170 ? level : level * .45);
const quiet = { state: 'listening', input: silence, output: silence };
const slab = { open: true, cols: 80, rows: 40, centre: [0, 0, 40] };
// The one camera stands this far in front of the sphere's centre (SphereCanvas).
const CAMERA = RADIUS * 6.5;

function machine() {
  const motion = createSphereMotion(field);
  let time = 0;
  const run = (ms, input) => { for (const end = time + ms; time < end; time += FRAME) motion.step({ time, ...(typeof input === 'function' ? input(time) : input) }); };
  run(900, { state: 'thinking' }); run(3200, quiet);
  return { motion, run };
}
// Where a stone is and which way its face points, as the camera sees them.
function seen(motion, index) {
  const at = index * STRIDE, m = motion.sway, x = motion.tiles[at + PLACE], y = motion.tiles[at + PLACE + 1], z = motion.tiles[at + PLACE + 2];
  const q = Array.from(motion.tiles.subarray(at + TURN, at + TURN + 4));
  const [fx, fy, fz] = quatRotate(q, [0, 0, 1]);
  return { x: m[0] * x + m[3] * y + m[6] * z, y: m[1] * x + m[4] * y + m[7] * z, z: m[2] * x + m[5] * y + m[8] * z, face: m[2] * fx + m[5] * fy + m[8] * fz };
}

test('opened, the shell lies flat as a frame three stones deep round the slab, in the page\'s stone, and nothing is seen in the hole', () => {
  const { motion, run } = machine();
  run(9000, { ...quiet, slab });
  // The hole, and a stone as the camera sees it, carried onto the slab's own plane: the back layer looks a little nearer the middle.
  const hole = { x: (slab.cols / 2 - FRAME_DEPTH) * PITCH, y: (slab.rows / 2 - FRAME_DEPTH) * PITCH };
  const onSlab = s => (CAMERA - slab.centre[2]) / (CAMERA - s.z);
  // How far a piece's cell of mortar, laid flat, falls short of a square cell at its pole-ward edge: the pole's own rings are wedges.
  const short = socket => PITCH - RADIUS * Math.sin(field.courseEdge[field.sockets.course[socket]] / RADIUS) * (field.sockets.round[socket * 2 + 1] - field.sockets.round[socket * 2]);
  let front = 0, top = { x: Infinity, course: -1 };
  for (let index = 0; index < field.count; index++) {
    const s = seen(motion, index), scale = onSlab(s);
    assert.ok(Math.abs(s.face) > .97, `stone ${index} lies flat to the viewer`);
    assert.equal(motion.shown[index], PAGE);
    // Every stone, in front or behind, is seen clear of the hole by most of half a stone.
    assert.ok(Math.abs(s.x * scale) > hole.x + PITCH * .4 || Math.abs(s.y * scale) > hole.y + PITCH * .4, `stone ${index} is seen in the hole`);
    if (Math.abs(s.z - slab.centre[2]) > 1) continue;
    front++;
    const col = s.x / PITCH + (slab.cols - 1) / 2, row = (slab.rows - 1) / 2 - s.y / PITCH;
    assert.ok(Math.abs(col - Math.round(col)) < .35 && Math.abs(row - Math.round(row)) < .35, 'on the grid');
    assert.ok(Math.min(col, row, slab.cols - 1 - col, slab.rows - 1 - row) < FRAME_DEPTH - .5, 'in the band');
    // No wedge in the band, to notch its edge: every piece in it is as square as its cell, within a sixth of a stone.
    assert.ok(short(field.socket[index]) < PITCH / 6, `a wedge of ring ${field.course[index]} in the band`);
    if (Math.round(row) === 0 && Math.abs(s.x) < top.x) top = { x: Math.abs(s.x), course: field.course[index] };
  }
  // The band is full (but for the stones lost from their sockets); the face's rings begin at its top centre, with the
  // pole's wedges behind them there, out of sight.
  const band = slab.cols * slab.rows - (slab.cols - 2 * FRAME_DEPTH) * (slab.rows - 2 * FRAME_DEPTH);
  assert.ok(front > band * .85, `${front} of ${band}`);
  assert.equal(top.course, FRAME_FROM);
  const pole = seen(motion, field.course.indexOf(0));
  assert.ok(Math.abs(pole.x) < PITCH && pole.y > hole.y && pole.z < slab.centre[2] - 1);
  // What the shell had swallowed is not left lying in the open hollow.
  for (let stone = 0; stone < field.sheet.count; stone++) assert.ok(seen(motion, field.count + stone).z < -CAMERA * 4);
  assert.ok(motion.board().open && motion.board().settled);
});

test('on the frame both voices show: Plato\'s colour from the top centre, the student\'s from the foot, so far and no further, then back to the page', () => {
  const { motion, run } = machine();
  run(9000, { ...quiet, slab });
  let most = 0, first = -1;
  for (let at = 0; at < 2600; at += 100) {
    run(100, time => ({ state: 'speaking', input: silence, output: speech(.9)(time), slab }));
    const warm = [];
    for (let index = 0; index < field.count; index++) if (motion.shown[index] === WARM) warm.push(seen(motion, index));
    // Counted where it shows: in the band, not behind it.
    const shows = warm.filter(s => Math.abs(s.z - slab.centre[2]) < 1).length;
    most = Math.max(most, shows);
    if (shows && first < 0) first = at;
    assert.ok(warm.every(s => s.y > 0), 'only in the top half');
  }
  assert.ok(most > 60 && most < 300, `${most} stones at most`);
  // It shows as soon as a stone can turn: the front does not first climb through the rings hidden behind the band.
  assert.ok(first <= 400, `first seen ${first}ms in`);
  // The student's voice colours it too, from the foot (their terraces are the sphere's outer rings), and moves no stone.
  run(2600, time => ({ state: 'listening', input: speech(.9)(time), output: silence, slab }));
  let mine = 0;
  for (let at = 0; at < 1200; at += 100) {
    run(100, time => ({ state: 'listening', input: speech(.9)(time), output: silence, slab }));
    const green = [];
    for (let index = 0; index < field.count; index++) if (motion.shown[index] === GREEN) green.push(seen(motion, index));
    const shows = green.filter(s => Math.abs(s.z - slab.centre[2]) < 1);
    mine = Math.max(mine, shows.length);
    assert.ok(shows.every(s => s.y < 0), 'only in the bottom half');
  }
  assert.ok(mine > 20, `${mine} stones show the student's voice`);
  assert.ok(motion.height.every(up => up === 0));
  // Quiet again: back to the page.
  run(3000, { ...quiet, slab });
  assert.ok(motion.shown.every(face => face === PAGE));
  assert.ok(motion.board().settled);
});

test('the board opens ring by ring from the pole, and nothing is scaled or bent on the way', () => {
  const { motion, run } = machine();
  const outermost = field.course.reduce((most, k, index) => field.course[index] > field.course[most] ? index : most, 0);
  const innermost = field.course.indexOf(FRAME_FROM);
  // Landed, then turned over to the page: travel, then a turn.
  run((BOARD_TRAVEL + 6) * 1000 / 12, { ...quiet, slab });
  // The band's first ring has arrived while the outer rings have not yet left.
  assert.ok(Math.abs(seen(motion, innermost).face) > .97 && Math.abs(seen(motion, innermost).z - slab.centre[2]) < 1);
  assert.ok(Math.abs(seen(motion, outermost).z - slab.centre[2]) > 30, 'the outer rings are still on the sphere');
  // Every piece is carried by a rigid turn (a unit quaternion) and a shift: no scale anywhere.
  for (let socket = 0; socket < field.sockets.count; socket++) {
    const at = socket * CELL_STRIDE, q = motion.shell.carried.subarray(at, at + 4);
    assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-5);
  }
  // What goes behind the band follows close on its heels: two seconds in, nothing is still crossing the page.
  run(1000, { ...quiet, slab });
  assert.ok(motion.board().settled);
});

test('closed again, the sphere is whole: every piece home and the shell carried nowhere', () => {
  const { motion, run } = machine();
  run(9000, { ...quiet, slab });
  // Closing, the frame starts home at once from its outer rings: it does not wait on the pieces behind it.
  const framed = Array.from({ length: field.count }, (_, index) => index).filter(index => Math.abs(seen(motion, index).z - slab.centre[2]) < 1);
  run(600, { ...quiet, slab: { ...slab, open: false } });
  assert.ok(framed.filter(index => Math.abs(seen(motion, index).z - slab.centre[2]) > 4).length > 20);
  run(8400, { ...quiet, slab: { ...slab, open: false } });
  assert.equal(motion.board(), null);
  for (let socket = 0; socket < field.sockets.count; socket++) {
    const at = socket * CELL_STRIDE;
    assert.deepEqual([...motion.shell.carried.subarray(at, at + CELL_STRIDE)], [0, 0, 0, 1, 0, 0, 0, 0]);
  }
  assert.ok(motion.shown.every(face => face !== PAGE));
});

test('reduced motion lays the board at once', () => {
  const motion = createSphereMotion(field);
  motion.step({ time: 0, state: 'listening', reduced: true, slab });
  assert.equal(motion.shown[0], PAGE);
  const s = seen(motion, 0);
  assert.ok(Math.abs(s.face) > .97);
});
