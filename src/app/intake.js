// Material: files dropped, pasted or picked (the course takes them in), and a PDF's outline before the course is published.
// The mosaic's chapter stones are gone (16 Oct, the user: "it doesnt add anything"): topics are chosen on the course page.
import { mosaicCircleCenter } from '../mosaic-transition.mjs';
import { outlineBriefing, refusal } from '../study-material.mjs';

const PUT_AWAY = 'The person has put the document away. Do not refer to it again unless they hand you one.';
// Two presses on the mosaic this close together, in time and in place, ask for a document.
const TWICE = 400, TWICE_APART = 30, MOSAIC_REACH = 150;
// How long a document's or a chapter's name stays up after it is taken in or chosen.
const NAMED = 3200;

export function createIntake({ bridge, session, study, now, ink, screen, typer, picker, held, naming, pressed, setNamed, setReading, setIntake, setMaterial, setChapter, setDragging, setTyped, complain, context, tellSoon }) {

  function name(number, title) {
    clearTimeout(naming.current);
    setNamed({ number, title });
    naming.current = setTimeout(() => setNamed(null), NAMED);
  }

  // Where on the mosaic's surface something happened.
  function point(event) {
    const bounds = screen.current.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  // Dropped, picked or pasted files: all of them go to the course at once (the first drop creates it), the stones
  // take them in and show them being read, and Plato is told, as the student's turn, once he isn't speaking. Until the
  // course is first published, a PDF is also read here for its chapters, so Plato can start on it straight away.
  function take(files, at) {
    const good = files.filter(file => !refusal(file)), refused = files.filter(file => refusal(file)).map(file => `Couldn't read ${file.name}: ${refusal(file)}`);
    tellSoon(['[New material]', good.length && `${good.map(file => file.name).join(', ')} — reading them now.`, ...refused].filter(Boolean).join(' '));
    if (!good.length) { if (!session.current?.ready) complain(refused[0]); return; }
    setReading(true);
    setIntake({ id: crypto.randomUUID(), x: at.x, y: at.y, count: Math.min(12, 4 * good.length) });
    const pdf = !bridge.current?.ready && good.find(file => /\.pdf$/i.test(file.name));
    const outline = pdf ? import('../study-material-pdf.js').then(({ readPdfMaterial }) => readPdfMaterial(pdf)) : null;
    dispatchEvent(new Event('plato:material')); // the sync line wakes (Material.jsx)
    bridge.current?.addDocuments(good, outline?.then(held => held.title))
      .then(() => dispatchEvent(new Event('plato:material')), problem => { setReading(false); complain(problem?.message || 'Couldn’t upload that.'); });
    outline?.then(held => {
      study.current = { material: held, chapter: -1 };
      setMaterial(held);
      setChapter(-1);
      name(0, held.title);
      context(outlineBriefing(held));
    }, () => { /* the outline is a head start; the course reads the file either way */ });
  }

  function putAway() {
    if (!study.current.material) return;
    study.current = { material: null, chapter: -1 };
    setMaterial(null);
    setChapter(-1);
    clearTimeout(naming.current);
    setNamed(null);
    context(PUT_AWAY);
  }
  // Files dropped or pasted anywhere, and presses on the mosaic: listening until the returned function stops it.
  function listen() {
    // A file can be dropped anywhere on the page.
    const carriesFile = event => [...(event.dataTransfer?.types || [])].includes('Files');
    // The mosaic opens towards wherever the file is being held.
    const over = event => { if (carriesFile(event)) { event.preventDefault(); held.current = point(event); setDragging(true); } };
    const left = event => { if (!event.relatedTarget) { held.current = null; setDragging(false); } };
    // Every file dropped is taken; the page and the student's writing on it stay.
    const drop = event => {
      // A drop something on the page already took (the new-course form, the course's material) is theirs (19 Oct: one dropped
      // on the new-course form also made a second course here, named after the file).
      if (!carriesFile(event) || event.defaultPrevented) return;
      event.preventDefault();
      held.current = null;
      setDragging(false);
      const files = [...event.dataTransfer.files];
      if (files.length) take(files, point(event));
    };
    // Pasting files and images is dropping: they become sources. Text is typing, line breaks and all, onto the typed line
    // wherever it was pasted (there is no box to paste into first); only text too long to type becomes a source (14 Oct:
    // code pasted for Plato became a course file he couldn't read, and set the course rebuilding).
    const paste = event => {
      const files = [...(event.clipboardData?.files || [])], text = event.clipboardData?.getData('text/plain') || '';
      if (event.target?.closest?.('input, select, [contenteditable="true"], .zone') || (!files.length && !text.trim())) return;
      if (!files.length && text.length <= 2000) {
        if (event.target !== typer.current) { event.preventDefault(); setTyped(t => (t + text).slice(0, 2000)); typer.current?.focus(); }
        return;
      }
      event.preventDefault();
      take(files.length ? files : [new File([text], `Pasted note ${new Date().toLocaleDateString('en-CA')}.md`, { type: 'text/markdown' })], { x: screen.current.clientWidth / 2, y: screen.current.clientHeight });
    };
    const press = event => {
      // The mosaic takes presses only when it is whole in the middle, and a stroke of writing is no press.
      if (now.current.page || event.timeStamp - (ink.current?.inkedAt() ?? -Infinity) < 250) return;
      if (event.target.closest?.('.tree-button, .course-tree, .study-keys, .conversation, .ink-tools')) return;
      const at = point(event), last = pressed.current;
      // Pressing the mosaic twice opens the file picker: the way in where nothing can be dragged.
      const bounds = screen.current.getBoundingClientRect(), centre = mosaicCircleCenter(bounds.width, bounds.height);
      const onMosaic = Math.hypot(at.x - centre.x, at.y - centre.y) < MOSAIC_REACH, time = performance.now();
      if (onMosaic && time - last.at < TWICE && Math.hypot(at.x - last.x, at.y - last.y) < TWICE_APART) {
        pressed.current = { at: -Infinity, x: 0, y: 0 };
        picker.current?.click();
      } else pressed.current = { at: onMosaic ? time : -Infinity, x: at.x, y: at.y };
    };
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', left);
    document.addEventListener('drop', drop);
    document.addEventListener('paste', paste);
    document.addEventListener('click', press);
    return () => {
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', left);
      document.removeEventListener('drop', drop);
      document.removeEventListener('paste', paste);
      document.removeEventListener('click', press);
    };
  }
  return { take, putAway, listenFiles: listen };
}
