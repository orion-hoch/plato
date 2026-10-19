// The views of the registry's newer kinds (shared/elements/<kind>.mjs). Each draws its engine's state ({ state, spec,
// act, task, anchor }): it acts only through act(action), which a checkpoint holds until the learner has predicted
// (task.blocked(action) says so), and marks every part point_to can land on with data-anchor={anchor(id)}.
import Memory from './Memory.jsx';
import NumberLine from './NumberLine.jsx';
import Graph from './Graph.jsx';
import Order from './Order.jsx';
import TraceTable from './TraceTable.jsx';
import Sorter from './Sorter.jsx';
import ArgMap from './ArgMap.jsx';
import Curves from './Curves.jsx';
import Sim from './Sim.jsx';
import Pathway from './Pathway.jsx';
import Canvas from './Canvas.jsx';

export const KIND_VIEWS = { memory: Memory, numberline: NumberLine, graph: Graph, proofblocks: Order, timeline: Order, tracetable: TraceTable, sorter: Sorter, argmap: ArgMap, curves: Curves, sim: Sim, pathway: Pathway, canvas: Canvas };
