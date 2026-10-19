import test from 'node:test';
import assert from 'node:assert/strict';
import { chaptersFrom, materialTitle, outlineBriefing, chapterBriefing, refusal, formatOf, ACCEPT, MAX_CHAPTERS, BRIEFING_CHARS, BRIEFING_PARTS } from '../src/study-material.mjs';

const page = (text, lines) => ({ text, lines: lines || text.split('\n').map(line => ({ text: line, size: 11 })) });
const body = text => ({ text, size: 11 });

test('a PDF\'s own outline decides its chapters, and each one carries its pages\' text', () => {
  const pages = ['Cover', 'Light reactions happen in the thylakoid.', 'More on light.', 'The Calvin cycle fixes carbon.', 'Summary.'].map(text => page(text));
  const chapters = chaptersFrom({ pages, outline: [{ title: ' The Calvin   Cycle ', page: 4 }, { title: 'Light Reactions', page: 2 }, { title: 'Broken', page: 99 }, { title: '', page: 3 }] });
  assert.deepEqual(chapters.map(({ title, from, to, source }) => [title, from, to, source]), [['Light Reactions', 1, 3, 'outline'], ['The Calvin Cycle', 4, 5, 'outline']]);
  // Nothing is lost: whatever precedes the first chapter is read with it.
  assert.equal(chapters[0].text, 'Cover\n\nLight reactions happen in the thylakoid.\n\nMore on light.');
  assert.equal(chapters[1].text, 'The Calvin cycle fixes carbon.\n\nSummary.');
});

test('without an outline, lines set as headings mark the chapters; a lone title is not one', () => {
  const pages = [
    page('Cell Biology\nNotes for week one', [{ text: 'Cell Biology', size: 24 }, body('Notes for week one')]),
    page('Membranes\nA membrane is a bilayer.', [{ text: 'Membranes', size: 16 }, body('A membrane is a bilayer.')]),
    page('It is selectively permeable.'),
    page('Chapter 2 Organelles\nThe nucleus stores DNA.', [body('Chapter 2 Organelles'), body('The nucleus stores DNA.')]),
    page('12', [{ text: '12', size: 30 }]),
  ];
  const chapters = chaptersFrom({ pages });
  assert.deepEqual(chapters.map(({ title, from, to, source }) => [title, from, to, source]), [['Membranes', 1, 3, 'headings'], ['Chapter 2 Organelles', 4, 5, 'headings']]);
  assert.equal(materialTitle({ pages, name: 'bio_week-1.pdf' }), 'Cell Biology');
});

test('with nothing to go on, even runs of pages still give something to pick', () => {
  const pages = Array.from({ length: 20 }, (_, index) => page(`Plain text of page ${index + 1}.`));
  const chapters = chaptersFrom({ pages });
  assert.deepEqual(chapters.map(chapter => chapter.title), ['Pages 1–5', 'Pages 6–10', 'Pages 11–15', 'Pages 16–20']);
  assert.ok(chapters.every(chapter => chapter.source === 'pages'));
  assert.equal(chapters.reduce((sum, chapter) => sum + chapter.to - chapter.from + 1, 0), 20, 'every page belongs to exactly one chapter');
  assert.deepEqual(chaptersFrom({ pages: [page('Only one')] }).map(chapter => chapter.title), ['Page 1']);
  assert.deepEqual(chaptersFrom({ pages: [] }), []);
  // One stone per chapter has to fit round the rim.
  const long = chaptersFrom({ pages: Array.from({ length: 60 }, () => page('x')), outline: Array.from({ length: 40 }, (_, index) => ({ title: `Section ${index + 1}`, page: index + 1 })) });
  assert.equal(long.length, MAX_CHAPTERS);
  assert.equal(long.at(-1).to, 60, 'the last stone still reaches the end of the document');
});

test('the title is the document\'s own, else its biggest first line, else a tidied file name', () => {
  assert.equal(materialTitle({ metadata: '  Organic   Chemistry II ', name: 'x.pdf' }), 'Organic Chemistry II');
  for (const junk of ['Untitled', 'Microsoft Word - notes.docx', 'lecture.pdf', 'ab']) {
    assert.equal(materialTitle({ metadata: junk, pages: [page('small text only')], name: 'lecture_03-enzymes.pdf' }), 'lecture 03 enzymes', junk);
  }
  assert.equal(materialTitle({}), 'Untitled document');
});

test('Plato is first told only the chapter list, then the chosen chapter in bounded parts', () => {
  const material = { title: 'Cell Biology', pageCount: 5, chapters: [
    { title: 'Membranes', from: 1, to: 3, text: 'A membrane is a bilayer.' },
    { title: 'Organelles', from: 4, to: 4, text: '§'.repeat(BRIEFING_CHARS * BRIEFING_PARTS + 4321) },
    { title: 'Scans', from: 5, to: 5, text: '' },
  ] };
  const outline = outlineBriefing(material);
  assert.match(outline, /"Cell Biology", 5 pages/);
  assert.match(outline, /1\. Membranes \(pages 1–3\); 2\. Organelles \(page 4\); 3\. Scans \(page 5\)/);
  assert.equal(outline.includes('bilayer'), false, 'no chapter text before a chapter is chosen');

  const [only] = chapterBriefing(material, 0);
  assert.equal(chapterBriefing(material, 0).length, 1);
  assert.match(only, /chose chapter 1 of "Cell Biology": "Membranes" \(pages 1–3\)/);
  assert.ok(only.endsWith('A membrane is a bilayer.'));

  const parts = chapterBriefing(material, 1);
  assert.equal(parts.length, BRIEFING_PARTS);
  assert.ok(parts.every(part => part.length < BRIEFING_CHARS + 400), 'each message stays small enough to send');
  assert.match(parts[0], /only the first 15,000 of its 19,321 characters/, 'Plato is told plainly that it was cut short');
  assert.match(parts[2], /Part 3 of 3/);
  assert.equal(parts.join('').split('§').length - 1, BRIEFING_CHARS * BRIEFING_PARTS);

  assert.match(chapterBriefing(material, 2)[0], /no readable text/);
  assert.deepEqual(chapterBriefing(material, -1), []);
  assert.deepEqual(chapterBriefing(material, 9), []);
});

test('every format the backend reads is taken, by its extension and within its size; the MIME comes from the extension', () => {
  assert.equal(refusal({ name: 'notes.PDF', type: '', size: 1000 }), '');
  assert.equal(refusal({ name: 'big.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 }), '', 'the course takes it; only the in-browser outline is limited to 20 MB');
  for (const name of ['notes.md', 'slides.pptx', 'lab.docx', 'grades.csv', 'board.jpeg', 'scan.webp', 'todo.txt']) assert.equal(refusal({ name, type: '', size: 1000 }), '', name);
  assert.match(refusal({ name: 'archive.zip', type: 'application/zip', size: 1000 }), /can’t be read/);
  assert.match(refusal({ name: 'blob', type: 'application/pdf', size: 1000 }), /can’t be read/);
  assert.match(refusal({ name: 'huge.pdf', type: 'application/pdf', size: 51_000_000 }), /larger than 50 MB/);
  // Browsers say nothing for .md and the wrong thing for .csv on Windows; the server checks the MIME exactly.
  assert.equal(formatOf({ name: 'notes.md', type: '' }).mime, 'text/markdown');
  assert.equal(formatOf({ name: 'grades.csv', type: 'application/vnd.ms-excel' }).mime, 'text/csv');
  assert.ok(ACCEPT.includes('.pdf') && ACCEPT.includes('.md') && ACCEPT.includes('.webp'));
});
