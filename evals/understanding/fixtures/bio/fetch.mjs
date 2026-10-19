// Fetches the bio fixture's course material: OpenStax Biology 2e, chapter 5 (Structure and Function of Plasma
// Membranes), sections 5.1–5.4, as Markdown into ./source. OpenStax content is CC BY 4.0: the attribution is kept at the
// top of every file. Run once: node evals/understanding/fixtures/bio/fetch.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), BOOK = 'https://openstax.org/books/biology-2e/pages';
const SECTIONS = ['5-1-components-and-structure', '5-2-passive-transport', '5-3-active-transport', '5-4-bulk-transport'];
const ATTRIBUTION = page => `> Source: OpenStax, *Biology 2e* (Clark, Douglas and Choi), ${BOOK}/${page}. © Rice University, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Text extracted for an evaluation fixture; figures omitted.\n\n`;

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', deg: '°', times: '×', minus: '−' };
const decode = s => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : entities[e] ?? m);
const inline = s => decode(s.replace(/<\/?(em|i)>/g, '*').replace(/<\/?(strong|b)>/g, '**').replace(/<sup>(.*?)<\/sup>/g, '^$1').replace(/<sub>(.*?)<\/sub>/g, '_$1').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** The page's main content as Markdown: headings, paragraphs, list items and figure captions, in order. */
function toMarkdown(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? html;
  const body = main.replace(/<(script|style|nav|button|svg)[\s\S]*?<\/\1>/g, '');
  const out = [];
  for (const m of body.matchAll(/<(h[1-4]|p|li|figcaption|caption)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = inline(m[2]);
    if (!text) continue;
    if (/^h/.test(m[1])) out.push(`${'#'.repeat(Math.max(1, Number(m[1][1]) - 0))} ${text}`);
    else if (m[1] === 'li') out.push(`- ${text}`);
    else if (m[1] === 'figcaption' || m[1] === 'caption') out.push(`[Figure: ${text}]`);
    else out.push(text);
  }
  return out.filter((line, i) => line !== out[i - 1]).join('\n\n');
}

await mkdir(path.join(HERE, 'source'), { recursive: true });
for (const page of SECTIONS) {
  const res = await fetch(`${BOOK}/${page}`, { headers: { 'User-Agent': 'Mozilla/5.0 (evaluation fixture fetch)' } });
  if (!res.ok) throw Error(`${page}: HTTP ${res.status}`);
  const md = toMarkdown(await res.text());
  await writeFile(path.join(HERE, 'source', `${page}.md`), ATTRIBUTION(page) + md + '\n');
  console.log(`${page}.md: ${md.length} chars`);
}
