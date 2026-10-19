import React, { useEffect, useRef, useState } from 'react';
import { mosaicCircleCenter } from '../mosaic-transition.mjs';
import { createLens } from './sphere-math.mjs';
import { createSphereField, RADIUS, PITCH } from './sphere-field.mjs';
import { createSphereMotion, BANDS, FRAME_DEPTH, FRAME_FROM } from './sphere-motion.mjs';
import { createSphereRenderer } from './sphere-renderer.mjs';

// The sphere's outline on the page: the flat medallion's radius, in CSS pixels.
const APPARENT = 142;
// Half the side of the square it is drawn in, with room for a tile lifted off the limb.
const HALF = 180;
// The one fixed camera stands this many sphere radii from the centre.
const CAMERA = 6.5;
// A pointer this far from the sphere's centre turns it fully, for this long after it last moved.
const GAZE_RANGE = 320;
const GAZE_HOLD = 2600;
// Sixty frames a second is enough for stone; a faster display does not get more.
const FRAME = 12;
// ponytail: settled round the page, the frame's only motion is a stone turning over now and then, which about thirty
// frames a second show well enough; the whole page is still drawn every time. A flag from the motion when anything moved would end that.
const SETTLED = 28;
// A graphics context that has not come back after this long is given up for the flat medallion.
const CONTEXT_PATIENCE = 4000;
// A document this far from the sphere's centre has only just been noticed; at the outline it is as near as it gets.
const NOTICED = 570;
// The shell opens where the document faces the sphere, but never further round from the viewer than this (radians),
// so that the opening is always seen into and never edge-on.
const FACING = .74;
// A document's sheet is held this far in front of the sphere's centre, and this far from the pointer on the
// sphere's side of it, so that it is not hidden under whatever the pointer is carrying.
const SHEET_Z = RADIUS + 26, AHEAD = 38;
// While a document is about, the canvas covers the page; it is given at most this many pixels.
const MOST_PIXELS = 9e6;
// The lens reaches this far in front of the sphere, so a document's sheet held or falling before it is never clipped,
// nor the stones of the frame round the page on their way to it (while --frame / FRAME_DEPTH is at most 12px).
const LENS_REACH = 260;

let cut = null;

// Plato's mosaic as a sphere of rigid tiles; where WebGL2 is unavailable, one plain line instead.
export default function SphereCanvas(props) {
  const { state, levelRef, audioRef, dragging = false, dragPositionRef, intake = null, onIntakeDone, reading = false, boardOpen = false, boardInstant = false } = props;
  const canvasRef = useRef(null), stateRef = useRef(state), redraw = useRef(null), study = useRef({});
  const [flat, setFlat] = useState(false), [context, setContext] = useState(0);
  stateRef.current = state;
  study.current = { dragging, intake, onIntakeDone, reading, boardOpen, boardInstant };

  useEffect(() => {
    if (flat) return undefined;
    const canvas = canvasRef.current, surface = canvas.parentElement.parentElement;
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const field = cut ||= createSphereField();
    let renderer;
    try { renderer = createSphereRenderer(canvas, field); } catch (problem) { console.warn('The sphere could not be drawn here; showing the flat mosaic.', problem); setFlat(true); return undefined; }
    const motion = createSphereMotion(field), heard = new Float32Array(BANDS), spoken = new Float32Array(BANDS);
    const lens = createLens({ radius: RADIUS, distance: RADIUS * CAMERA, apparent: APPARENT, half: HALF, reach: LENS_REACH });
    const pointer = { x: 0, y: 0, movedAt: -Infinity }, gaze = { x: 0, y: 0 };
    let frame = 0, last = -Infinity, centre = { x: 0, y: 0 }, density = null, giveUp = 0, done = null, whole = false, band = null;
    const view = { zoomX: 1, zoomY: 1, nudgeX: 0, nudgeY: 0 }, sheetAt = new Float64Array(3), facing = new Float64Array(3);
    // A document somewhere on the page, as the motion wants it: where its sheet is held, where on the sphere
    // it faces (both as the camera sees them), and how near it is.
    function about(at) {
      const dx = at.x - centre.x, dy = at.y - centre.y, far = Math.hypot(dx, dy);
      // The sheet keeps to the sphere's side of the pointer.
      const ahead = far > 1 ? Math.min(AHEAD, far) / far : 0;
      lens.place(dx - dx * ahead, -(dy - dy * ahead), SHEET_Z, sheetAt);
      const round = Math.min(FACING, Math.asin(Math.min(1, far / APPARENT))), sine = far > 1 ? Math.sin(round) / far : 0;
      facing[0] = dx * sine; facing[1] = -dy * sine; facing[2] = Math.cos(round);
      return { at: sheetAt, aim: facing, near: 1 - (far - APPARENT) / (NOTICED - APPARENT) };
    }
    // The frame round Plato's page: a band FRAME_DEPTH stones deep laid outside the page's box (whole stones, so none
    // lies under its text), each stone --frame / FRAME_DEPTH pixels, on a slab at the depth where a stone is that size.
    // It is laid again whenever the screen (fit) or the page's own box changes, say a line of goals arriving above it.
    const reframe = new ResizeObserver(() => { band = null; });
    let framed = null;
    function measure() {
      const page = surface.querySelector('.page'), thick = page ? parseFloat(getComputedStyle(page).getPropertyValue('--frame')) : 0;
      if (page !== framed) { reframe.disconnect(); if (page) reframe.observe(page, { box: 'border-box' }); framed = page; }
      if (!(thick > 0)) return null;
      const { offsetLeft: x, offsetTop: y, offsetWidth: width, offsetHeight: height } = page;
      let size = thick / FRAME_DEPTH, cols, rows;
      const cells = () => { cols = Math.ceil(width / size) + 2 * FRAME_DEPTH; rows = Math.ceil(height / size) + 2 * FRAME_DEPTH; return cols * rows - (cols - 2 * FRAME_DEPTH) * (rows - 2 * FRAME_DEPTH); };
      // A page too large for the shell's pieces (all but the pole's wedges) to go round is framed in larger stones.
      // ponytail: larger stones make the band thicker than --frame, so it runs off the top of the screen, and past 12px a
      // stone on its way passes the lens's near plane and is clipped (LENS_REACH). Only a page over about 5000px tall
      // gets here; raise LENS_REACH, or cap the size and leave the band short, if one ever does.
      const pieces = field.sockets.course.reduce((sum, k) => sum + (k >= FRAME_FROM), 0);
      while (cells() > pieces) size *= 1.05;
      const z = lens.distance - lens.focal * PITCH / size, middle = lens.place(x + width / 2 - centre.x, -(y + height / 2 - centre.y), z);
      // The light must see the whole frame to shade it: its farthest corner from the sphere's centre, and the travel in front.
      view.boardReach = Math.hypot(Math.abs(middle[0]) + cols * PITCH / 2, Math.abs(middle[1]) + rows * PITCH / 2, Math.abs(z) + 60) + 40;
      return { open: true, cols, rows, centre: Array.from(middle) };
    }

    function draw(time) {
      if (document.hidden || renderer.lost()) return;
      const reduced = still.matches;
      if (!reduced && time - last < (motion.board()?.settled ? SETTLED : FRAME)) { frame = requestAnimationFrame(draw); return; }
      last = time;
      const sounding = Boolean(audioRef?.current?.(heard, spoken));
      // A pointer that moved a moment ago draws the sphere's face a little towards it.
      const watching = time - pointer.movedAt < GAZE_HOLD;
      gaze.x = (pointer.x - centre.x) / GAZE_RANGE; gaze.y = (pointer.y - centre.y) / GAZE_RANGE;
      // A document held over the page opens the sphere towards it; dropped, it is swallowed from where it fell.
      const now = study.current, held = now.dragging ? dragPositionRef?.current : null;
      // While one is about, its sheet may be anywhere on the page, so the canvas covers the page; so too while the stones frame Plato's page.
      if (Boolean(held || now.intake || now.boardOpen || motion.board()) !== whole) { whole = !whole; fit(); }
      const file = held ? about(held) : null;
      const taking = now.intake ? { id: now.intake.id, ...(file || about(now.intake)) } : null;
      motion.step({ state: stateRef.current, level: levelRef?.current || 0, input: sounding ? heard : null, output: sounding ? spoken : null, time, reduced, gaze: watching && !held ? gaze : null, file, intake: taking, reading: now.reading, slab: now.boardOpen ? (band ||= measure()) : (band = null), instant: now.boardInstant });
      if (taking && motion.taken() === taking.id && done !== taking.id) { done = taking.id; now.onIntakeDone?.(); }
      view.lightReach = motion.board() ? view.boardReach : 0;
      renderer.draw(motion.tiles, motion.sway, motion.dial, motion.shell, lens, view);
      // Reduced motion draws one still frame per change and then waits.
      if (!reduced) frame = requestAnimationFrame(draw);
    }
    function restart() { cancelAnimationFrame(frame); last = -Infinity; if (!document.hidden) frame = requestAnimationFrame(draw); }
    // The canvas is the square round the sphere, or the whole page while a document or the frame is about. Either
    // way it sits on whole pixels, and the camera is placed in it so the sphere stays exactly where it was; the
    // frame is measured again from there.
    function fit() {
      const bounds = surface.getBoundingClientRect();
      centre = mosaicCircleCenter(bounds.width, bounds.height);
      const left = whole ? 0 : Math.round(centre.x - HALF), top = whole ? 0 : Math.round(centre.y - HALF);
      const width = whole ? Math.max(1, Math.round(bounds.width)) : HALF * 2, height = whole ? Math.max(1, Math.round(bounds.height)) : HALF * 2;
      const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(MOST_PIXELS / (width * height)));
      canvas.style.left = `${left}px`; canvas.style.top = `${top}px`; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      view.zoomX = lens.focal * 2 / width; view.zoomY = lens.focal * 2 / height;
      view.nudgeX = (centre.x - left) * 2 / width - 1; view.nudgeY = 1 - (centre.y - top) * 2 / height;
      renderer.resize(Math.round(width * ratio), Math.round(height * ratio));
      band = null;
    }
    function resize() { fit(); restart(); }
    // Moving to a screen of another density changes no layout, so it is watched for by itself.
    function refit() {
      density?.removeEventListener('change', refit);
      density = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
      density.addEventListener('change', refit);
      resize();
    }
    function pointerMove(event) {
      const bounds = surface.getBoundingClientRect();
      pointer.x = event.clientX - bounds.left; pointer.y = event.clientY - bounds.top; pointer.movedAt = performance.now();
    }
    const pointerLeave = () => { pointer.movedAt = -Infinity; };
    const lost = event => { event.preventDefault(); cancelAnimationFrame(frame); giveUp = setTimeout(() => setFlat(true), CONTEXT_PATIENCE); };
    const restored = () => { clearTimeout(giveUp); setContext(value => value + 1); };
    redraw.current = restart;
    const observer = new ResizeObserver(resize); observer.observe(surface); refit();
    canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
    surface.addEventListener('pointermove', pointerMove, { passive: true }); surface.addEventListener('pointerleave', pointerLeave);
    document.addEventListener('visibilitychange', restart); still.addEventListener('change', restart);
    return () => {
      redraw.current = null; cancelAnimationFrame(frame); clearTimeout(giveUp); observer.disconnect(); reframe.disconnect();
      density?.removeEventListener('change', refit);
      surface.removeEventListener('pointermove', pointerMove); surface.removeEventListener('pointerleave', pointerLeave);
      canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
      document.removeEventListener('visibilitychange', restart); still.removeEventListener('change', restart);
      renderer.dispose();
    };
  }, [flat, context, levelRef, audioRef, dragPositionRef]);
  // Reduced motion needs one fresh still frame when the state or the document changes.
  useEffect(() => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) redraw.current?.(); }, [state, intake, boardOpen]);


  // Plato's stones need WebGL2 (every current browser has it): without it, one plain line instead.
  if (flat) return <p className="no-webgl" role="status">Plato draws his stones with WebGL2, which this browser doesn't have. Try a current Chrome, Safari, Firefox or Edge.</p>;
  return <div className="voice-visual mosaic-surface" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', maxWidth: 'none', pointerEvents: 'none', zIndex: 3 }}>
    <canvas ref={canvasRef} className="voice-canvas sphere-canvas" style={{ position: 'absolute', width: HALF * 2, height: HALF * 2, maxWidth: 'none', pointerEvents: 'none' }}/>
  </div>;
}
