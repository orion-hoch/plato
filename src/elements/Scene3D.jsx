import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PALETTE } from '../../shared/elements/scene3d.mjs';

// A small 3D scene to turn and zoom, three.js in its own lazy chunk. A transparent canvas keeps the page white. It
// renders only when something changes (a turn, a zoom, a running animation), pauses off screen and in a hidden
// tab, and on leaving frees its WebGL context at once, so the sphere's context is never the one a browser drops.
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const COARSE = window.matchMedia?.('(pointer: coarse)').matches ?? false;
const FALLBACK = { arrow: 'ink', line: 'ink', label: 'ink' }, UP = new THREE.Vector3(0, 1, 0);

export default function Scene3D({ spec }) {
  const view = useRef(null), [broken, setBroken] = useState(false);
  useEffect(() => {
    const host = view.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: !COARSE, alpha: true, powerPreference: 'low-power' }); }
    catch { setBroken(true); return undefined; } // no WebGL here: the caption stays
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const labels = new CSS2DRenderer();
    labels.domElement.className = 'scene-labels';
    host.append(renderer.domElement, labels.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 4 / 3, 0.05, 500), nodes = new Map();
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(4, 9, 6);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e1d4, 2.2), sun);
    for (const o of spec.objects) { const node = build(o); scene.add(node); if (o.id) nodes.set(o.id, node); }
    // The view the spec sets, or one framing everything from above and in front.
    const round = new THREE.Box3().setFromObject(scene).getBoundingSphere(new THREE.Sphere()), radius = Math.max(round.radius, 1);
    const target = spec.camera ? new THREE.Vector3(...spec.camera.target) : round.center;
    camera.position.copy(spec.camera ? new THREE.Vector3(...spec.camera.position) : round.center.clone().addScaledVector(new THREE.Vector3(1, .75, 1.3).normalize(), radius / Math.sin(THREE.MathUtils.degToRad(20)) * 1.05));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enablePan = false;
    controls.minDistance = radius * .4;
    controls.maxDistance = Math.max(camera.position.distanceTo(target) * 2.5, radius * 4);
    controls.update();

    const moves = REDUCED ? [] : spec.animate.map(a => { const node = nodes.get(a.id); return { ...a, node, from: node.position.clone(), to: a.moveTo && new THREE.Vector3(...a.moveTo), turn: a.spin && node.rotation[a.spin] }; });
    const start = performance.now();
    let frame = 0, onScreen = true;
    const live = () => onScreen && !document.hidden;
    function tick(now) {
      frame = 0;
      const t = (now - start) / 1000;
      for (const m of moves) {
        const phase = t / m.seconds;
        if (m.spin) m.node.rotation[m.spin] = m.turn + 2 * Math.PI * (m.loop ? phase % 1 : Math.min(1, phase));
        if (m.to) { const k = m.loop ? 1 - Math.abs(1 - (phase % 2)) : Math.min(1, phase); m.node.position.lerpVectors(m.from, m.to, k * k * (3 - 2 * k)); }
      }
      renderer.render(scene, camera);
      labels.render(scene, camera);
      if (live() && moves.some(m => m.loop || t < m.seconds)) frame = requestAnimationFrame(tick);
    }
    const wake = () => { if (!frame && live()) frame = requestAnimationFrame(tick); };
    controls.addEventListener('change', wake);
    const fit = () => {
      const w = host.clientWidth || 1, h = Math.round(Math.min(420, w * .75));
      renderer.setSize(w, h); labels.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      wake();
    };
    const sized = new ResizeObserver(fit), seen = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; wake(); });
    sized.observe(host); seen.observe(host); fit();
    document.addEventListener('visibilitychange', wake);
    return () => {
      cancelAnimationFrame(frame); sized.disconnect(); seen.disconnect(); document.removeEventListener('visibilitychange', wake);
      controls.dispose();
      scene.traverse(node => { node.geometry?.dispose(); for (const m of [].concat(node.material ?? [])) m.dispose(); });
      renderer.dispose(); renderer.forceContextLoss();
      host.replaceChildren();
    };
  }, [spec]);
  return <figure className="element-scene">
    {!broken && <div ref={view} className="scene-view" role="img" aria-label={`A 3D view of ${spec.objects.map(o => o.label || o.type).join(', ')}; drag to turn it`}/>}
    {spec.caption && <figcaption>{spec.caption}</figcaption>}
  </figure>;
}

// One object of the spec as a group placed at its point; a label rides above it (an arrow's at its tip).
function build(o) {
  const group = new THREE.Group(), color = new THREE.Color(PALETTE[o.color || FALLBACK[o.type] || 'lapis']), opacity = o.opacity ?? (o.type === 'plane' ? .55 : 1);
  if (o.type !== 'line') group.position.set(...o.at);
  if (o.rotation) group.rotation.set(...o.rotation.map(THREE.MathUtils.degToRad));
  const solid = (geometry, edges = false) => {
    group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1, side: o.type === 'plane' ? THREE.DoubleSide : THREE.FrontSide })));
    if (edges) group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), new THREE.LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: .3 })));
  };
  const [w = 1, h = w, d = w] = o.size ?? [], r = o.radius ?? .5, height = o.height ?? 1;
  let mark = new THREE.Vector3(0, .5, 0);
  switch (o.type) {
    case 'box': solid(new THREE.BoxGeometry(w, h, d), true); mark.y = h / 2; break;
    case 'sphere': solid(new THREE.SphereGeometry(r, 32, 16)); mark.y = r; break;
    case 'cylinder': solid(new THREE.CylinderGeometry(r, r, height, 40), true); mark.y = height / 2; break;
    case 'cone': solid(new THREE.ConeGeometry(r, height, 40)); mark.y = height / 2; break;
    case 'plane': { const plane = new THREE.PlaneGeometry(o.size?.[0] ?? 4, o.size?.[1] ?? o.size?.[0] ?? 4); plane.rotateX(-Math.PI / 2); solid(plane, true); mark.y = .1; break; }
    case 'point': solid(new THREE.SphereGeometry(o.radius ?? .08, 16, 8)); mark.y = o.radius ?? .08; break;
    case 'arrow': { const tip = new THREE.Vector3(...o.to).sub(group.position); arrow(group, tip, color); mark = tip.clone().addScaledVector(tip.clone().normalize(), .25); break; }
    case 'line': group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(o.points.map(p => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }))); mark = new THREE.Vector3(...o.points.at(-1)); break;
    case 'grid': { const size = o.size?.[0] ?? 10; group.add(new THREE.GridHelper(size, Math.max(1, Math.round(size)), PALETTE.stone, 0xddd6c9)); mark.y = 0; break; }
    case 'axes': {
      const length = o.size?.[0] ?? 3;
      // Axes stay in stone, thinner, so the scene's own colours are the ones that stand out.
      for (const [name, axis] of [['x', [1, 0, 0]], ['y', [0, 1, 0]], ['z', [0, 0, 1]]]) {
        const v = new THREE.Vector3(...axis).multiplyScalar(length);
        arrow(group, v, new THREE.Color(PALETTE.stone), .6);
        tag(group, name, v.multiplyScalar(1.1));
      }
      break;
    }
    case 'label': mark.y = 0; break;
  }
  if (o.label) tag(group, o.label, o.type === 'box' || o.type === 'sphere' || o.type === 'cylinder' || o.type === 'cone' || o.type === 'point' ? mark.setY(mark.y + .3) : mark);
  return group;
}

// A vector as a shaft and a head, from the group's origin to v (`thin` scales its girth).
function arrow(group, v, color, thin = 1) {
  const length = v.length();
  if (length < 1e-6) return;
  const head = Math.min(.4, length * .3), r = Math.min(.05, Math.max(.02, length * .015)) * thin, material = new THREE.MeshLambertMaterial({ color });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length - head, 12), material), tip = new THREE.Mesh(new THREE.ConeGeometry(r * 3, head, 20), material);
  shaft.position.y = (length - head) / 2; tip.position.y = length - head / 2;
  const holder = new THREE.Group();
  holder.add(shaft, tip);
  holder.quaternion.setFromUnitVectors(UP, v.clone().normalize());
  group.add(holder);
}

// Words in the scene, as text (never markup), kept facing the student.
function tag(group, text, at) {
  const div = document.createElement('div');
  div.className = 'scene-label';
  div.textContent = text;
  const label = new CSS2DObject(div);
  label.position.copy(at);
  group.add(label);
}
