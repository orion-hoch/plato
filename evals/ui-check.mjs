// A look at the harness's page pieces on the sandbox server (:5199): the course chooser, a new course, a proof space, the
// faces. Drives the system Chrome over the DevTools protocol (no Playwright). node evals/ui-check.mjs <screenshot dir>
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const out = process.argv[2], base = 'http://127.0.0.1:5199/?local-actor';
const profile = mkdtempSync(path.join(tmpdir(), 'ui-check-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let port; for (let i = 0; i < 50 && !port; i++) { await sleep(200); const f = path.join(profile, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; }
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let n = 0; const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') console.log('page error:', m.params.exceptionDetails?.exception?.description?.slice(0, 200)); });
const cdp = (method, params = {}) => new Promise(r => { const id = ++n; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async expr => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async name => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(path.join(out, name), Buffer.from(r.result.data, 'base64')); console.log('shot', name); };
const until = async (expr, ms = 240_000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(1000)) if (await js(expr)) return true; console.log('timed out waiting for', expr); return false; };
const click = text => js(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(text)})); b?.click(); return !!b; })()`);
// Typing as the page hears it: the native value setter, then input (React's onChange).
const type = (selector, text, k = 0) => js(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${k}]; if (!el) return false; el.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: base }); await sleep(5000);
await shot('1-chooser.png');
console.log('new course button:', await click('+ New course')); await sleep(500);
await shot('2-new-course.png');
console.log('picked 2800:', await click('CS 2800')); await sleep(9000);
await shot('3-opened.png');
await type('textarea.typer', 'Let me try proving that congruence mod 3 is an equivalence relation myself. Open a proof space for it.');
await js(`document.querySelector('textarea.typer').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
await until(`!!document.querySelector('.zone-proof')`);
await sleep(4000);
await shot('4-proof-space.png');
await type('textarea.proof-src', 'Let $a \\in \\mathbb{Z}$. Then $a - a = 0 = 3 \\times 0$, so $3 \\mid (a - a)$, hence $a \\equiv_3 a$.', 1);
await sleep(1500);
await shot('5-typed.png');
console.log('face chip:', await click('Lesson') || await click('Practice') || await click('Plato')); await sleep(500);
await shot('6-faces.png');
ws.close(); chrome.kill();
