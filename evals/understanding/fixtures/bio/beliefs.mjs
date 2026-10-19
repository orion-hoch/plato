// The bio fixture's belief library for simulated students (evals/understanding/sim). A conceptual domain: answers do not
// compute, so a misconception is a STRUCTURED belief, and each item's answers (right, and per belief) are templates; an
// LLM only phrases them, and a checker confirms the phrasing kept the belief (sim/student.mjs). Same interface as the
// computable libraries: an item is a skill with no parameters. Written independently of any Study. Provenance: C? =
// reported in the diffusion-and-osmosis misconception literature (e.g. Odom & Barrow 1995, the DOT; verify before
// quoting), I = inferred.

const item = (id, concept, describe, answer, bugs, difficulty = 0) => ({ id, concept, describe, params: {}, valid: () => true, solve: () => answer, difficulty: () => difficulty, bugs: Object.fromEntries(Object.entries(bugs).map(([b, text]) => [b, () => text])) });

export const kind = 'beliefs';
export const concepts = [
  { id: 'osmosis', topicId: 'top_d-E_3UrEoE9b2GIK', title: 'Osmosis', idea: 'Water moves across a membrane from where free water is more concentrated (less solute) to where it is less concentrated (more solute); the solute that cannot cross stays put.', interactivity: 'low' },
  { id: 'passive', topicId: 'top_bHF4CJNoSzgnfRoD', title: 'Passive transport', idea: 'Diffusion, simple or through a channel or carrier, moves a substance down its concentration gradient and costs the cell no energy; a protein only provides the path.', interactivity: 'low' },
  { id: 'active', topicId: 'top_J49MO2Gm3LBc7Vi8', title: 'Active transport', idea: 'Active transport moves a substance against its gradient, which takes energy: the sodium-potassium pump uses ATP to move 3 Na+ out and 2 K+ in per cycle.', interactivity: 'low' },
  { id: 'bilayer', topicId: 'top_kEp0R3vxPkaDmYJh', title: 'The lipid bilayer', idea: "The bilayer's hydrophobic core lets small nonpolar molecules through and blocks ions and large polar molecules, which need proteins.", interactivity: 'low' },
];

export const bugs = [
  { id: 'water_follows_low_solute', concept: 'osmosis', errorKind: 'F7', belief: 'water moves toward the side with less solute', provenance: 'C?', detector: { type: 'pattern' } },
  { id: 'solute_moves_instead', concept: 'osmosis', errorKind: 'F7', belief: 'in osmosis the solute crosses the membrane to even things out', provenance: 'C?', detector: { type: 'pattern' } },
  { id: 'movement_needs_energy', concept: 'passive', errorKind: 'F8', belief: 'moving molecules across a membrane always takes the cell energy', provenance: 'C?', detector: { type: 'pattern' } },
  { id: 'proteins_use_atp', concept: 'active', errorKind: 'F5', belief: 'any transport through a membrane protein uses ATP', provenance: 'I', detector: { type: 'pattern' } },
  { id: 'pump_equalizes', concept: 'active', errorKind: 'F7', belief: 'pumps move ions so that both sides end up equal', provenance: 'I', detector: { type: 'pattern' } },
  { id: 'small_passes', concept: 'bilayer', errorKind: 'F5', belief: 'anything small passes through the bilayer, ions included', provenance: 'I', detector: { type: 'pattern' } },
];

export const skills = [
  item('osm_hypertonic', 'osmosis', 'a red blood cell in a solution with more solute than its cytoplasm: which way water moves and what happens to the cell', 'water moves out of the cell, toward the solution with less free water, and the cell shrinks',
    { water_follows_low_solute: 'water moves into the cell, toward the side with less solute, and the cell swells', solute_moves_instead: 'the salt moves into the cell until both sides are the same, so the cell stays about the same size' }, 0.2),
  item('osm_hypotonic', 'osmosis', 'a red blood cell placed in pure water: which way water moves and what happens to the cell', 'water moves into the cell, which swells and can burst',
    { water_follows_low_solute: 'water moves out of the cell into the pure water, so the cell shrinks' }, 0),
  item('diffusion_energy', 'passive', 'whether simple diffusion of oxygen across a membrane uses ATP, and why', 'no: oxygen moves down its concentration gradient, which needs no energy from the cell',
    { movement_needs_energy: 'yes: moving the molecules across the membrane takes energy' }, -0.3),
  item('channel_energy', 'passive', 'whether facilitated diffusion of glucose through a carrier or channel protein uses ATP', 'no: it still goes down the gradient; the protein only gives it a path',
    { proteins_use_atp: 'yes: going through a protein uses ATP', movement_needs_energy: 'yes: moving glucose across takes energy' }, 0.2),
  item('pump_energy', 'active', 'why the sodium-potassium pump needs ATP', 'because it moves sodium and potassium against their concentration gradients, which takes energy',
    { proteins_use_atp: 'because every membrane protein needs ATP to work', pump_equalizes: 'because it has to spread the ions out evenly on both sides' }, 0.2),
  item('pump_direction', 'active', 'which way the sodium-potassium pump moves sodium and potassium, and how many of each per cycle', '3 sodium ions out of the cell and 2 potassium ions in',
    { pump_equalizes: 'it moves them so the amounts even out on both sides' }, 0.4),
  item('bilayer_ions', 'bilayer', 'whether sodium ions can cross the lipid bilayer on their own, without a protein, and why', 'no: they are charged, and the hydrophobic core of the bilayer blocks charged particles',
    { small_passes: 'yes: sodium ions are tiny, and small things slip through the membrane' }, 0.1),
  item('bilayer_o2', 'bilayer', 'whether oxygen can cross the lipid bilayer on its own, and why', 'yes: it is small and nonpolar, so it dissolves through the hydrophobic core', {}, -0.5),
];

export const tests = skills.map(s => ({ skill: s.id, params: {} }));
// A pattern detector (domain-generality.md §7.4): the belief is identified by its answers across a battery, never by one.
for (const b of bugs) { const battery = skills.filter(k => k.bugs[b.id]).map(k => k.id); b.detector = { type: 'pattern', battery, fingerprint: battery.map(id => skills.find(k => k.id === id).bugs[b.id]()) }; }

/** Practice items for a tutor that needs them (the fixed sequence of the ablation): never the tests. */
const practiceItems = [
  item('osm_plant', 'osmosis', 'a plant cell placed in very salty water: which way water moves and what happens to the cell', 'water moves out of the cell and the cell membrane pulls away from the wall',
    { water_follows_low_solute: 'water moves into the cell because the salt side has more solute', solute_moves_instead: 'the salt moves in until both sides match' }, 0.3),
  item('diffusion_co2', 'passive', 'whether carbon dioxide leaving a cell by diffusion costs the cell energy', 'no: it moves down its concentration gradient',
    { movement_needs_energy: 'yes: pushing it out of the cell takes energy' }, -0.2),
  item('pump_k', 'active', 'why potassium can build up inside a cell to a higher concentration than outside', 'because the pump uses ATP to move potassium in against its gradient',
    { pump_equalizes: 'it can\'t: the pump keeps both sides equal', proteins_use_atp: 'because the potassium channel uses ATP' }, 0.3),
];
skills.push(...practiceItems);
export const practice = practiceItems.map(s => ({ skill: s.id, params: {} }));
