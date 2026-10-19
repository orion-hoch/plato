// Fetches the history fixture's course material: The American Yawp, chapter 15 (Reconstruction), and primary sources
// from The American Yawp Reader, as Markdown into ./source. Both are CC BY-SA 4.0: the attribution is kept at the top
// of every file, and anything made from them stays under the same license. Run once:
// node evals/understanding/fixtures/history/fetch.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHAPTER = 'https://www.americanyawp.com/text/15-reconstruction/';
const DOCUMENTS = [
  'https://www.americanyawp.com/reader/reconstruction/jourdon-anderson-writes-his-former-master-1865/',
  'https://www.americanyawp.com/reader/reconstruction/mississippi-black-code-1865/',
  'https://www.americanyawp.com/reader/reconstruction/freedmen-discuss-post-emancipation-life-with-general-sherman-1865/',
  'https://www.americanyawp.com/reader/reconstruction/general-reynolds-describes-lawlessness-in-texas-1868/',
  'https://www.americanyawp.com/reader/reconstruction/charlotte-forten-teaches-freed-children-in-south-carolina-1864/',
  'https://www.americanyawp.com/reader/reconstruction/frederick-douglass-on-remembering-the-civil-war-1877/',
];
const ATTRIBUTION = (url, what) => `> Source: ${what}, ${url}. The American Yawp (Joseph L. Locke and Ben Wright, eds.), licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Text extracted for an evaluation fixture; images omitted; shared under the same license.\n\n`;

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
const decode = s => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : entities[e] ?? m);
const inline = s => decode(s.replace(/<\/?(em|i)>/g, '*').replace(/<\/?(strong|b)>/g, '**').replace(/<sup[^>]*>.*?<\/sup>/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** The page's entry content as Markdown, in order, stopping at the chapter's own source list and references. */
function toMarkdown(html) {
  const body = (html.match(/<div class="entry-content">([\s\S]*?)<div class="(?:sharedaddy|entry-footer|post-navigation)/) ?? html.match(/<article[\s\S]*?<\/article>/) ?? [html, html]).at(-1)
    .replace(/<(script|style|nav|button|svg|figure)[\s\S]*?<\/\1>/g, '');
  const out = [];
  for (const m of body.matchAll(/<(h[1-4]|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = inline(m[2]);
    if (!text) continue;
    if (/^h/.test(m[1])) { if (/^(IX|X)\.\s*(Primary Sources|Reference Material)/i.test(text)) break; out.push(`## ${text}`); }
    else if (m[1] === 'li') out.push(`- ${text}`);
    else if (m[1] === 'blockquote') out.push(`> ${text}`);
    else out.push(text);
  }
  return out.filter((line, i) => line !== out[i - 1]).join('\n\n');
}
const get = async url => { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (evaluation fixture fetch)' } }); if (!r.ok) throw Error(`${url}: HTTP ${r.status}`); return r.text(); };

await mkdir(path.join(HERE, 'source'), { recursive: true });
// The chapter, one file per section (sections I–VIII), so each section is its own source.
const chapter = toMarkdown(await get(CHAPTER)), sections = chapter.split(/\n\n(?=## )/).filter(s => /^## [IVX]+\./.test(s));
for (const [i, s] of sections.entries()) {
  const name = `15-${String(i + 1).padStart(2, '0')}-${s.match(/^## [IVX]+\.\s*(.*)/)[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}.md`;
  await writeFile(path.join(HERE, 'source', name), ATTRIBUTION(CHAPTER, 'The American Yawp, chapter 15, "Reconstruction"') + s + '\n');
  console.log(`${name}: ${s.length} chars`);
}
for (const url of DOCUMENTS) {
  const md = toMarkdown(await get(url)), slug = url.replace(/\/$/, '').split('/').at(-1);
  await writeFile(path.join(HERE, 'source', `reader-${slug}.md`), ATTRIBUTION(url, 'The American Yawp Reader, a primary source') + md + '\n');
  console.log(`reader-${slug}.md: ${md.length} chars`);
}
