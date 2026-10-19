// Builds anatomy figures ahead of time for a course's hard topics, so Plato can put them up at once (anatomy, ready: id).
// node scripts/prepare-figures.mjs <wanted.json> [figure dir]
// wanted.json: [{ topic (a study-guide topic's title), idea (with its true numbers), object? }]. The figure dir defaults to
// $LUNA_DATA_DIR/figures or data/figures; each figure lands there and in its library.json (backend/session/anatomy.mjs).
// A topic that already has a figure there is skipped, so a run that broke off can simply be run again.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildFigure, libraryOf, addToLibrary } from '../backend/session/anatomy.mjs';
import { newId } from '../backend/core/util.mjs';

const [wantedFile, dirArg] = process.argv.slice(2);
if (!wantedFile) { console.error('Usage: node scripts/prepare-figures.mjs <wanted.json> [figure dir]'); process.exit(1); }
const dir = path.resolve(dirArg || path.join(process.env.LUNA_DATA_DIR || 'data', 'figures'));
const have = new Set(libraryOf(dir).map(f => f.topic));
const queue = JSON.parse(readFileSync(wantedFile, 'utf8')).filter(w => !have.has(w.topic));
const AT_ONCE = 3; // each build is a long Claude session on the user's plan; more at once overloads it

async function worker() {
  for (let w = queue.shift(); w; w = queue.shift()) {
    const id = newId('fig'), t0 = Date.now();
    console.log(`… ${w.topic}`);
    try {
      const f = await buildFigure(w, { out: path.join(dir, `${id}.html`) });
      addToLibrary(dir, { id, title: f.title, topic: w.topic, idea: w.idea, note: f.note });
      console.log(`✓ ${w.topic}: "${f.title}" (${Math.round((Date.now() - t0) / 1000)} s)`);
    } catch (error) { console.log(`✗ ${w.topic}: ${error.message}`); }
  }
}
await Promise.all(Array.from({ length: AT_ONCE }, worker));
