// Screenshots of generated elements (the lead's eyeball check): the page's own Element.jsx, served by Vite, in Chromium.
// Usage: node render-elements.mjs <fit.json> <render dir> [n]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
const [fit, dir, n = 10] = process.argv.slice(2), ROOT = path.resolve(import.meta.dirname, '../..');
const rows = JSON.parse(readFileSync(fit, 'utf8')).rows.filter(r => r.spec).slice(0, Number(n));
writeFileSync(path.join(dir, 'specs.json'), JSON.stringify(rows.map(r => ({ label: `${r.fx} · ${r.kind} · ${r.kc} · ${r.title ?? ''}${r.leak ? ' · LEAK' : ''}`, spec: r.spec }))));
const server = await createServer({ root: ROOT, configFile: false, plugins: [react()], logLevel: 'error', server: { port: 5690, strictPort: true } });
await server.listen();
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 820, height: 900 } });
page.on('pageerror', e => console.log('page error:', e.message));
await page.goto(`http://localhost:5690/${path.relative(ROOT, dir)}/index.html`); await page.waitForTimeout(4000);
for (let i = 0; i < rows.length; i++) { const el = await page.$(`#el${i}`); if (el) { await el.screenshot({ path: path.join(dir, `${String(i + 1).padStart(2, '0')}-${rows[i].fx}-${rows[i].kind}.png`) }); console.log('shot', i + 1, rows[i].fx, rows[i].kind); } }
await browser.close(); await server.close(); process.exit(0);
