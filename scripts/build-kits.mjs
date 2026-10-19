// A course's own figure kits (backend/lessons/kits.mjs) for a course already built, without rebuilding it:
//   node scripts/build-kits.mjs <data dir>/study-guides/<examId> [--port 5188]
// The server must be running on that port (each kit's examples are drawn through it). Redo: delete <course>/kits first.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { buildKits } from '../backend/lessons/kits.mjs';
import { courseAgent } from '../backend/lessons/build-course.mjs';
const [dir] = process.argv.slice(2), port = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : process.env.PORT || 5188;
if (!dir) { console.error('usage: node scripts/build-kits.mjs <course dir> [--port N]'); process.exit(1); }
const plan = JSON.parse(readFileSync(path.join(dir, 'plan.json'), 'utf8'));
const figureDir = path.resolve(dir, '../../figures');
const kits = await buildKits(path.resolve(dir), plan, { agent: courseAgent, figureDir, baseUrl: `http://127.0.0.1:${port}`, onStage: s => console.log(new Date().toLocaleTimeString(), s) });
console.log(kits.length ? `installed: ${kits.map(k => k.name).join(', ')}` : 'no kits installed');
