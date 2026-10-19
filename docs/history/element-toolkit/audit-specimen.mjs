// Isolated specification check; never imports, starts or changes the Study app.
// Run from any directory: node /absolute/path/to/audit-specimen.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('./', import.meta.url);
const output = new URL('./evidence/', root);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const failures = [], browserErrors = [], checks = [];
const onlyCase = process.argv[2] === undefined ? null : Number(process.argv[2]);
assert(onlyCase === null || Number.isInteger(onlyCase) && onlyCase >= 1 && onlyCase <= 12, 'Optional argument is specimen number 1–12');
page.on('pageerror', e => browserErrors.push(e.message));
try {
  await page.goto(new URL('specimen.html', root).href);
  const names = await page.evaluate(() => window.specimens.map(s => s.name));
  const sizes = [[320,568],[390,844],[768,640],[1024,768],[1440,900]];
  for (const [width,height] of sizes) {
    await page.setViewportSize({width,height});
    for (const variant of ['default','text-spacing','text-200']) {
      await page.evaluate(variant => {
        document.getElementById('audit-style')?.remove();
        const style = document.createElement('style'); style.id = 'audit-style';
        if (variant === 'text-spacing') style.textContent = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';
        document.head.append(style);
      }, variant);
      for (let index = 0; index < names.length; index++) {
        if (onlyCase !== null && index + 1 !== onlyCase) continue;
        await page.evaluate(({index,variant}) => {
          document.getElementById('scene').style.removeProperty('font-size');
          window.showSpecimen(index);
          if (variant === 'text-200') {
            // Text resize stress, NOT browser-zoom emulation. Snapshot computed sizes before applying.
            const sizes = [...document.querySelectorAll('#scene, #scene *')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)]);
            for (const [el,size] of sizes) el.style.fontSize = `${size*2}px`;
          } else document.getElementById('scene').style.removeProperty('font-size');
        },{index,variant});
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const issues = await page.evaluate(() => {
          const found = [], rect = el => el.getBoundingClientRect();
          const visible = el => {const r=rect(el);return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';};
          const label = el => el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0,70);
          const overlaps = (a,b) => a.left < b.right-1 && b.left < a.right-1 && a.top < b.bottom-1 && b.top < a.bottom-1;
          if (document.documentElement.scrollWidth>innerWidth+1) found.push('page horizontal overflow');
          const blocks = [...document.querySelectorAll('[data-check="block"]')].filter(visible);
          for(let i=0;i<blocks.length;i++) for(let j=i+1;j<blocks.length;j++) {
            const a=blocks[i],b=blocks[j];
            if(!a.contains(b)&&!b.contains(a)&&overlaps(rect(a),rect(b))) found.push(`block overlap: ${label(a)} / ${label(b)}`);
          }
          for(const svg of document.querySelectorAll('svg')) {
            if(!visible(svg)) continue;
            const bounds=rect(svg), labels=[...svg.querySelectorAll('[data-check="label"]')].filter(visible);
            for(let i=0;i<labels.length;i++) {
              const r=rect(labels[i]);
              if(r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1) found.push(`SVG label outside view: ${label(labels[i])}`);
              if(parseFloat(getComputedStyle(labels[i]).fontSize)<14) found.push(`small SVG label: ${label(labels[i])}`);
              for(let j=i+1;j<labels.length;j++) if(overlaps(r,rect(labels[j]))) found.push(`SVG label overlap: ${label(labels[i])} / ${label(labels[j])}`);
            }
          }
          for(const el of document.querySelectorAll('#scene *')) {
            if(!visible(el)||el.closest('svg')||el.closest('.scroll')&& !el.classList.contains('scroll')) continue;
            const r=rect(el),bounds=rect(document.getElementById('scene'));
            if(r.left<bounds.left-1||r.right>bounds.right+1) found.push(`element outside scene: ${label(el)}`);
          }
          for(const el of document.querySelectorAll('.scroll')) if(visible(el)&&el.scrollWidth>el.clientWidth+1) {
            if(el.tabIndex<0||!el.getAttribute('aria-label')) found.push('unlabeled or unfocusable scroll region');
          }
          return [...new Set(found)];
        });
        checks.push({specimen:index+1,width,height,variant});
        if(issues.length) failures.push({name:names[index],width,height,variant,issues});
      }
    }
  }
  await page.evaluate(() => {document.getElementById('audit-style')?.remove();document.getElementById('scene').style.removeProperty('font-size');});
  await page.setViewportSize({width:1024,height:768});
  await page.evaluate(() => window.showSpecimen(0));
  await page.getByRole('button',{name:'Advance trace'}).click();
  assert.match(await page.locator('#trace-state').innerText(), /node points to B/);
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  assert.match(await page.locator('#trace-state').innerText(), /node points to A/);
  await page.evaluate(() => window.showSpecimen(1));
  await page.locator('#curve-x').focus();
  await page.keyboard.press('ArrowRight');
  assert.match(await page.locator('#curve-output').innerText(), /1\.1.*1\.21/);
  await page.evaluate(() => window.showSpecimen(4));
  await page.getByRole('button',{name:'Close switch'}).click();
  assert.equal(await page.locator('#circuit-toggle').getAttribute('aria-pressed'),'true');
  await page.locator('#answer').fill('Current is zero when open and 2 A when closed.');
  await page.setViewportSize({width:320,height:568});
  assert.equal(await page.locator('#answer').inputValue(),'Current is zero when open and 2 A when closed.');
  await page.getByRole('button',{name:'Keep response'}).click();
  assert.match(await page.locator('#response-status').innerText(), /No grading connected/);
  // Screenshots retained for human visual inspection, not pixel-perfect snapshots.
  for(const [index,width,height] of [[0,1440,900],[1,1024,768],[3,390,844],[9,320,568],[11,320,568]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(i=>window.showSpecimen(i),index);
    await page.screenshot({path:fileURLToPath(new URL(`scene-${index+1}-${width}.png`,output)),fullPage:true});
  }
  const contract = await readFile(new URL('agent-contract.md',root),'utf8');
  const examples = [...contract.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m=>JSON.parse(m[1]));
  const scene=examples.find(x=>x.elements);
  assert(scene);
  assert.equal(new Set(scene.elements.map(x=>x.id)).size,scene.elements.length);
  for(const element of scene.elements) if(element.kind==='response'&&element.data.target) {
    const target=scene.elements.find(x=>x.id===element.data.target);assert(target);
    for(const id of element.data.options||[]) assert(target.data.nodes.some(x=>x.id===id));
  }
  const stamp = new Date().toISOString().replaceAll(':','-');
  const report = {time:new Date().toISOString(),browser:await browser.version(),scope:'isolated specimen only; text-200 is text resize, not real browser zoom',selectedCase:onlyCase,examples:names,jsonExamplesParsed:examples.length,renderChecks:checks.length,interactionChecks:['trace advance/reset','keyboard range input','circuit toggle','draft preserved on resize','local form submit'],failures,browserErrors};
  await writeFile(new URL(`audit-${stamp}.json`,output),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({renderChecks:checks.length,failures,browserErrors,jsonExamplesParsed:examples.length,evidence:fileURLToPath(output)},null,2));
  if(failures.length||browserErrors.length) process.exitCode=1;
} finally { await browser.close(); }
