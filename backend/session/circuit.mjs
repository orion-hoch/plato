// Live logic circuits (14 Oct, the user: "try to implement the circuit simulator"): Plato writes a netlist, and the student
// flips its inputs and watches the signals move, in the Logic Circuit Simulator (github.com/jppellet/Logic-Circuit-Simulator,
// MIT). Its bundle is built by hand into tools/logic-sim (gitignored), served at /logic-sim.js (server/index.mjs):
//   git clone https://github.com/jppellet/Logic-Circuit-Simulator tools/logic-sim
//   cd tools/logic-sim && npm install --ignore-scripts && node tools/bundle.js --dist
// The page goes on Plato's page framed like an anatomy figure (BoardStage.jsx AnatomyFrame).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUNDLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tools/logic-sim/simulator/lib/bundle.js');
import { toCircuit, circuitPage } from '../../shared/circuit.mjs';
export { NETLIST_HELP } from '../../shared/circuit.mjs';

export const circuitsReady = () => existsSync(BUNDLE);

/** A netlist's page written to <dir>/<id>.html (served at /figures/<id>.html): { inputs, outputs } or { problems }. */
export function writeCircuit(dir, id, net, title) {
  const c = toCircuit(net);
  if (c.problems) return c;
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${id}.html`), circuitPage(c, title));
  return { inputs: c.inputs, outputs: c.outputs };
}
