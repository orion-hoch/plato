// Elements the tutor has made in the background (backend/elements) and the page shows (src/elements): one module
// per kind, each { purpose, rules, example, validate } plus what its renderer shares with the server. Specs are
// data, checked by validate() on the server before they are sent and again in the page before they are drawn.
import * as circuit from './circuit.mjs';
import * as trace from './trace.mjs';
import * as scene3d from './scene3d.mjs';
import * as figure from './figure.mjs';

export const ELEMENTS = { circuit, trace, scene3d, figure };

/** The normalized spec of an element of `kind`; throws "Invalid <kind>: …" with a message a model can act on. */
export function validateElement(kind, spec) {
  if (!Object.hasOwn(ELEMENTS, kind)) throw new Error(`Invalid element: unknown kind ${JSON.stringify(kind)}; use one of ${Object.keys(ELEMENTS).join(', ')}`);
  return ELEMENTS[kind].validate(spec);
}
