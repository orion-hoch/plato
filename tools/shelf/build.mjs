// The shelf (backend/lessons/kits.mjs): browser libraries a course's kits may use, copied from node_modules into lib/ and
// served at /shelf/<file> (server/index.mjs). Rebuild after `npm install`: node tools/shelf/build.mjs
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), nm = path.join(here, 'node_modules'), lib = path.join(here, 'lib');
export const SHELF = [
  { file: 'smiles-drawer.js', from: 'smiles-drawer/dist/smiles-drawer.min.js', global: 'SmilesDrawer', version: '2.4.1', license: 'MIT', for: 'chemical structures in 2D from SMILES (skeletal formulas, stereo wedges, rings, charges); SmilesDrawer.parse + SvgDrawer/SmiDrawer' },
  { file: '3dmol.js', from: '3dmol/build/3Dmol-min.js', global: '$3Dmol', version: '2.5.5', license: 'BSD-3-Clause', for: 'molecules and proteins in 3D (ball-and-stick, orbitals as surfaces), rotatable; $3Dmol.createViewer, addModel from xyz/sdf/pdb text' },
  { file: 'jsxgraph.js', from: 'jsxgraph/distrib/jsxgraphcore.js', global: 'JXG', version: '1.14.0', license: 'MIT or LGPL-3.0', for: 'interactive geometry and function graphs with draggable points and sliders (constructions, vectors, slope fields); JXG.JSXGraph.initBoard', css: 'jsxgraph.css' },
  { file: 'jsxgraph.css', from: 'jsxgraph/distrib/jsxgraph.css' },
  { file: 'vexflow.js', from: 'vexflow/build/cjs/vexflow.js', global: 'VexFlow', version: '5.0.0', license: 'MIT', for: 'music notation (staves, notes, chords, key and time signatures)' },
  { file: 'cytoscape.js', from: 'cytoscape/dist/cytoscape.min.js', global: 'cytoscape', version: '3.34.4', license: 'MIT', for: 'networks and graphs laid out automatically (pathways, state machines, dependency graphs)' },
  { file: 'd3.js', from: 'd3/dist/d3.min.js', global: 'd3', version: '7.9.0', license: 'ISC', for: 'any custom data figure: scales, axes, shapes, force layouts, trees, maps from GeoJSON given inline' },
  { file: 'matter.js', from: 'matter-js/build/matter.min.js', global: 'Matter', version: '0.20.0', license: 'MIT', for: '2D rigid-body physics you can run and drag (collisions, springs, pendulums, inclines)' },
  { file: 'function-plot.js', from: 'function-plot/dist/function-plot.js', global: 'functionPlot', version: '1.26.0', license: 'MIT', for: 'function graphs with zoom and pan (y = f(x), parametric, implicit, derivatives shown)' },
];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(lib, { recursive: true });
  for (const s of SHELF) copyFileSync(path.join(nm, s.from), path.join(lib, s.file));
  writeFileSync(path.join(here, 'shelf.json'), JSON.stringify(SHELF.filter(s => s.global).map(({ from, ...s }) => s), null, 2));
  console.log(`shelf: ${SHELF.length} files in ${lib}`);
}
