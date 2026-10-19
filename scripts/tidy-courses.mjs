// One-off (16 Oct): keep the old test courses out of the course list (hidden, not deleted), and show CS 2800 from its own
// study guide (its chapters in order) instead of the knowledge build's topics. The files already uploaded count as seen, so
// only new uploads go into its sources. node scripts/tidy-courses.mjs <data dir>  (with the server stopped)
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2] || 'data'), db = new DatabaseSync(path.join(dir, 'backend.db'));
const HIDE = ['exam_eO4bbhxfYGyVu4Ng', 'exam_IKXnDPZGoQtBBo8_'], GUIDE = 'exam_9brmxohvc0CEQDkt';
for (const id of HIDE) db.prepare(`UPDATE exams SET data = json_set(data, '$.hidden', json('true')) WHERE id = ?`).run(id);
db.prepare(`UPDATE exams SET data = json_set(data, '$.knowledgeSource', 'guide') WHERE id = ?`).run(GUIDE);
const seen = Object.fromEntries(db.prepare(`SELECT id, current_source_version_id v FROM source_files WHERE exam_id = ?`).all(GUIDE).filter(r => r.v).map(r => [r.id, r.v]));
const seenFile = path.join(dir, 'study-guides', GUIDE, 'sources', '.seen.json');
if (!existsSync(seenFile)) writeFileSync(seenFile, JSON.stringify(seen));
console.log(db.prepare(`SELECT id, json_extract(data,'$.title') t, json_extract(data,'$.hidden') h, json_extract(data,'$.knowledgeSource') k FROM exams`).all(), Object.keys(seen).length, 'files seen');
