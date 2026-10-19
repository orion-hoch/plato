// The linalg fixture's belief library for simulated students (evals/understanding/sim): skills solved in code and
// misconceptions as executable buggy rules. Written independently of any Study. Provenance: N = the course's notes warn
// against it (la-notes: "A common mistake is to think the span of two vectors in R^3 is always a plane"), I = inferred.
// A rule returns null where its belief changes nothing.

const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const zero = u => u.every(x => x === 0), vec = (u, n) => Array.isArray(u) && u.length === n && u.every(Number.isFinite);
const rank2 = (u, v) => zero(u) && zero(v) ? 0 : zero(cross([...u, 0].slice(0, 3), [...v, 0].slice(0, 3))) ? 1 : 2;

export const concepts = [
  { id: 'span', topicId: 'top_8jk-rnhdNidhiK0L', title: 'Span', idea: 'the span is everything you can build from combinations of the vectors, and two vectors only give a plane when neither is a multiple of the other', interactivity: 'low' },
  { id: 'systems', topicId: 'top_MWC2SJZwonZZbof_', title: 'Consistency and solutions', idea: 'a row of zeros with a nonzero last entry says zero equals something nonzero, so there is no solution, and a consistent system has one solution only when every variable has a pivot', interactivity: 'low' },
  { id: 'ortho', topicId: 'top_Wgy9xlJI4ZOWmMr3', title: 'Orthogonality', idea: 'two vectors are orthogonal when their dot product is zero, because the dot product is the lengths times the cosine of the angle', interactivity: 'low' },
];

export const bugs = [
  { id: 'two_vectors_plane', concept: 'span', errorKind: 'F5', belief: 'two vectors in R^3 always span a plane', provenance: 'N (la-notes warns against it)', detector: { type: 'execute' } },
  { id: 'span_is_everything', concept: 'span', errorKind: 'F5', belief: 'two nonzero vectors in R^2 can make any vector in R^2', provenance: 'I', detector: { type: 'execute' } },
  { id: 'zero_row_free_variable', concept: 'systems', errorKind: 'F6', belief: 'a row of zeros on the left means a free variable, so infinitely many solutions, whatever the last entry', provenance: 'I', detector: { type: 'execute' } },
  { id: 'free_means_none', concept: 'systems', errorKind: 'F5', belief: 'a free variable means the system has no solution', provenance: 'I', detector: { type: 'execute' } },
  { id: 'orthogonal_dot_one', concept: 'ortho', errorKind: 'F5', belief: 'orthogonal vectors have a dot product of 1', provenance: 'I', detector: { type: 'execute' } },
];

export const skills = [
  { id: 'span_shape', concept: 'span', describe: 'whether the span of two given vectors in R^3 is a point, a line or a plane', params: { u: 'the first vector, 3 numbers', v: 'the second vector, 3 numbers' },
    valid: p => vec(p.u, 3) && vec(p.v, 3), solve: p => ['a point', 'a line', 'a plane'][rank2(p.u, p.v)], difficulty: p => rank2(p.u, p.v) === 1 ? 0.4 : -0.3,
    bugs: { two_vectors_plane: p => !zero(p.u) && !zero(p.v) && rank2(p.u, p.v) === 1 ? 'a plane' : null } },
  { id: 'in_span2', concept: 'span', describe: 'whether a vector b in R^2 is a linear combination of two given vectors u and v in R^2 (yes or no)', params: { u: '2 numbers', v: '2 numbers', b: '2 numbers' },
    valid: p => vec(p.u, 2) && vec(p.v, 2) && vec(p.b, 2), solve: p => (rank2(p.u, p.v) === 2 || (rank2(p.u, p.v) === 1 && rank2(zero(p.u) ? p.v : p.u, p.b) <= 1) || zero(p.b)) ? 'yes' : 'no', difficulty: () => 0.2,
    bugs: { span_is_everything: p => !zero(p.u) && !zero(p.v) && rank2(p.u, p.v) < 2 ? 'yes' : null } },
  { id: 'echelon_row', concept: 'systems', describe: 'what a row [0 … 0 | c] of an echelon form says about the linear system: "no solution" or "the row says nothing (0 = 0)"', params: { c: 'the last entry c' },
    valid: p => Number.isFinite(p.c), solve: p => p.c !== 0 ? 'no solution' : 'the row says nothing (0 = 0)', difficulty: () => 0,
    bugs: { zero_row_free_variable: p => 'infinitely many solutions' } },
  { id: 'solution_count', concept: 'systems', describe: 'how many solutions a CONSISTENT linear system has, given its number of variables and the number of pivot columns: "one" or "infinitely many"', params: { variables: 'number of variables', pivots: 'number of pivot columns' },
    valid: p => Number.isInteger(p.variables) && Number.isInteger(p.pivots) && p.pivots <= p.variables && p.pivots >= 0, solve: p => p.pivots === p.variables ? 'one' : 'infinitely many', difficulty: () => 0,
    bugs: { free_means_none: p => p.pivots < p.variables ? 'none' : null } },
  { id: 'orthogonal', concept: 'ortho', describe: 'whether two given vectors are orthogonal (yes or no)', params: { u: 'a vector', v: 'a vector of the same length' },
    valid: p => Array.isArray(p.u) && vec(p.v, p.u.length), solve: p => dot(p.u, p.v) === 0 ? 'yes' : 'no', difficulty: () => -0.2,
    bugs: { orthogonal_dot_one: p => (dot(p.u, p.v) === 1 ? 'yes' : 'no') === (dot(p.u, p.v) === 0 ? 'yes' : 'no') ? null : dot(p.u, p.v) === 1 ? 'yes' : 'no' } },
];

export const tests = [
  { skill: 'span_shape', params: { u: [1, 2, 3], v: [2, 4, 6] } }, { skill: 'span_shape', params: { u: [1, 0, 1], v: [0, 1, 1] } }, { skill: 'span_shape', params: { u: [-1, 2, 0], v: [3, -6, 0] } },
  { skill: 'in_span2', params: { u: [1, 2], v: [2, 4], b: [3, 1] } }, { skill: 'in_span2', params: { u: [1, 1], v: [1, -1], b: [5, 2] } }, { skill: 'in_span2', params: { u: [2, 0], v: [3, 0], b: [0, 1] } },
  { skill: 'echelon_row', params: { c: 5 } }, { skill: 'echelon_row', params: { c: 0 } },
  { skill: 'solution_count', params: { variables: 3, pivots: 3 } }, { skill: 'solution_count', params: { variables: 4, pivots: 2 } }, { skill: 'solution_count', params: { variables: 2, pivots: 1 } },
  { skill: 'orthogonal', params: { u: [1, 2], v: [2, -1] } }, { skill: 'orthogonal', params: { u: [1, 0, 1], v: [0, 1, 1] } }, { skill: 'orthogonal', params: { u: [3, 1], v: [1, -3] } },
];

/** Practice items for a tutor that needs them (the fixed sequence of the ablation): never the tests. */
export const practice = [
  { skill: 'span_shape', params: { u: [2, 1, 0], v: [4, 2, 0] } }, { skill: 'span_shape', params: { u: [1, 1, 0], v: [0, 0, 1] } }, { skill: 'in_span2', params: { u: [1, 3], v: [2, 6], b: [1, 1] } },
  { skill: 'echelon_row', params: { c: -2 } }, { skill: 'solution_count', params: { variables: 3, pivots: 2 } }, { skill: 'solution_count', params: { variables: 2, pivots: 2 } },
  { skill: 'orthogonal', params: { u: [2, 3], v: [3, -2] } }, { skill: 'orthogonal', params: { u: [1, 1], v: [1, 0] } },
];
