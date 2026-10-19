// 16 Oct, the user: "prevent scrolling elements because they are really annoying". What can't wrap (a display
// equation, a table whose words won't fit its columns, a worked step, the live formula) is zoomed down to fit its
// column instead of scrolling inside the page or the chat. Watches the whole document once (main.jsx): an element is
// refitted when it, or what holds it, changes, and all of them when the window resizes or a font arrives.
// ponytail: past FLOOR the element scrolls as before (an equation over twice the column is rare); pinch-zoom reads it.
const WIDE = '.formula.is-display,.material .table,.latex-out,.formula-tex', FLOOR = .5;

function fit(els) {
  els = els.filter(el => el.isConnected);
  for (const el of els) el.style.zoom = '';
  const sizes = els.map(el => [el.clientWidth, el.scrollWidth]);
  els.forEach((el, i) => { const [room, need] = sizes[i]; if (room && need > room + 1) el.style.zoom = Math.max(FLOOR, (room - 2) / need).toFixed(3); });
}

export function startFit(root = document.body) {
  let dirty = new Set(), frame = 0;
  const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const els = [...dirty]; dirty = new Set(); fit(els); }); };
  const all = () => { root.querySelectorAll(WIDE).forEach(el => dirty.add(el)); later(); };
  new MutationObserver(records => {
    for (const r of records) {
      const el = r.target.nodeType === 1 ? r.target : r.target.parentElement, host = el?.closest(WIDE);
      if (host) dirty.add(host); else el?.querySelectorAll(WIDE).forEach(e => dirty.add(e));
    }
    if (dirty.size) later();
  }).observe(root, { childList: true, subtree: true, characterData: true });
  addEventListener('resize', all);
  document.fonts?.addEventListener?.('loadingdone', all);
  all();
}
