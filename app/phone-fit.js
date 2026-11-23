// PHONE ONLY (max-width 900px): make lists FIT instead of scroll. Tiles resize to the count; long lists become pages with a ‹ 1 / 3 › bar.
// Every function bails out on desktop, so desktop layout is untouched. Styles: /phone-fit.css.
(() => {
  const PH = matchMedia('(max-width: 900px)');
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ro = new ResizeObserver(() => sched()), specs = [];
  let raf = 0, busy = false;
  function sched() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; run(); }); }
  function mkBar(after) {
    const b = document.createElement('div'); b.className = 'pgbar'; b.hidden = true; b.setAttribute('role', 'navigation'); b.setAttribute('aria-label', 'Pages');
    b.innerHTML = '<button type="button" data-d="-1" aria-label="Previous page">‹</button><span></span><button type="button" data-d="1" aria-label="Next page">›</button>';
    after.after(b); return b;
  }
  function paintBar(s) {
    const b = s.bar; b.hidden = s.pages < 2; if (b.hidden) return;
    b.querySelector('span').textContent = (s.page + 1) + ' / ' + s.pages;
    b.querySelector('[data-d="-1"]').disabled = s.page <= 0; b.querySelector('[data-d="1"]').disabled = s.page >= s.pages - 1;
  }
  // spec: {box(): element with a bounded height, items(box): elements to page, watch: element to observe for content changes}
  function add(spec) {
    const box = spec.box(); if (!box || spec.bar) return;
    spec.page = 0; spec.pages = 1; spec.bar = mkBar(spec.after ? spec.after(box) : box);
    spec.bar.addEventListener('click', e => { const d = +e.target.closest('button')?.dataset.d; if (!d) return; spec.page = Math.max(0, Math.min(spec.pages - 1, spec.page + d)); apply(spec); });
    const w = spec.watch ? spec.watch() : box; ro.observe(box);
    new MutationObserver(() => { if (!busy) sched(); }).observe(w, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open'] });
    specs.push(spec);
  }
  // pack items into pages by their real heights
  function fit(s) {
    const box = s.box(); if (!box) return;
    const items = s.items(box); items.forEach(i => i.removeAttribute('data-pgx'));
    s.bar.hidden = true; s.pages = 1; s.cuts = null;
    if (!items.length || !box.clientHeight || box.scrollHeight <= box.clientHeight + 1) return;
    s.bar.hidden = false;                                            // the pager takes its row; the box shrinks by it
    const H = box.clientHeight, top = box.getBoundingClientRect().top - box.scrollTop;
    const rects = items.map(i => i.getBoundingClientRect()).map(r => ({ t: r.top - top, b: r.bottom - top }));
    const head = rects[0].t, ext = rects.map((r, i) => (i + 1 < rects.length ? rects[i + 1].t : r.b) - r.t);
    const cuts = [0]; let used = head;
    ext.forEach((e, i) => { if (i && used + e > H) { cuts.push(i); used = 0; } used += e; });
    s.cuts = cuts; s.pages = cuts.length; s.page = Math.min(s.page, s.pages - 1);
    apply(s, items);
  }
  function apply(s, items) {
    const box = s.box(); if (!box) return; items = items || s.items(box);
    if (s.cuts) { const a = s.cuts[s.page], z = s.cuts[s.page + 1] ?? items.length; items.forEach((it, i) => { if (i < a || i >= z) it.setAttribute('data-pgx', ''); else it.removeAttribute('data-pgx'); }); }
    paintBar(s);
  }
  // ---- Agents tiles: pick columns + density so every tile fits; page only when even the compact size doesn't ----
  const LEVELS = [['full', 172], ['mid', 112], ['compact', 58]], GAP = 10, PAGER = 38;
  function fitTiles(box) {
    let s = box._pg; if (!s) { s = box._pg = { box: () => box, items: b => $$('.atile', b), page: 0, pages: 1 }; s.bar = mkBar(box); s.bar.addEventListener('click', e => { const d = +e.target.closest('button')?.dataset.d; if (!d) return; s.page = Math.max(0, Math.min(s.pages - 1, s.page + d)); layout(); }); ro.observe(box); new MutationObserver(() => { if (!busy) sched(); }).observe(box, { childList: true }); }
    const layout = () => {
      const tiles = $$('.atile', box), n = tiles.length; tiles.forEach(t => t.removeAttribute('data-pgx'));
      if (!n) { s.pages = 1; s.bar.hidden = true; box.removeAttribute('data-d'); return; }
      const cs = getComputedStyle(box), pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      let H = box.clientHeight - pad; if (H <= 0) return;
      const fits = (cols, min, h) => { const rows = Math.ceil(n / cols); return (h - GAP * (rows - 1)) / rows >= min; };
      const colsFor = n === 1 ? [1] : n === 2 ? [1, 2] : [2];
      let pick = null;
      for (const [d, min] of LEVELS) { for (const c of colsFor) if (fits(c, min, H)) { pick = { d, c, per: n }; break; } if (pick) break; }
      if (!pick) { // even compact rows overflow: page it, 2 columns
        H -= PAGER; const rpp = Math.max(1, Math.floor((H + GAP) / (LEVELS[2][1] + GAP)));
        pick = { d: 'compact', c: 2, per: rpp * 2 };
      }
      const pages = Math.ceil(n / pick.per); s.pages = pages; s.page = Math.min(s.page, pages - 1);
      const a = s.page * pick.per; tiles.forEach((t, i) => { if (i < a || i >= a + pick.per) t.setAttribute('data-pgx', ''); });
      const shown = Math.min(pick.per, n - a), rows = Math.ceil(shown / pick.c);
      box.dataset.d = pick.d; box.style.setProperty('--tc', pick.c); box.style.setProperty('--tr', pages > 1 ? Math.max(1, Math.floor((H + GAP) / (LEVELS[2][1] + GAP))) : rows);
      paintBar(s);
    };
    s.bar.hidden = true; s.pages = 1; // measure with the pager row not reserved, then reserve if paging
    layout(); if (s.pages > 1) { s.bar.hidden = false; layout(); }
  }
  function run() {
    if (!PH.matches) return;
    busy = true;
    try {
      for (const t of $$('.atiles')) fitTiles(t);
      initSpecs(); specs.forEach(fit);
    } finally { setTimeout(() => { busy = false; }, 0); }
  }
  let inited = false;
  function initSpecs() {
    if (inited) return; inited = true;
    const q = s => document.querySelector(s);
    add({ box: () => q('#ftk'), items: b => [...b.children], after: b => b });                                           // Open items drawer
  }
  PH.addEventListener('change', () => { if (!PH.matches) { $$('[data-pgx]').forEach(e => e.removeAttribute('data-pgx')); $$('.pgbar').forEach(b => { b.hidden = true; }); $$('.atiles').forEach(b => { b.removeAttribute('data-d'); b.style.removeProperty('--tc'); b.style.removeProperty('--tr'); }); } else sched(); });
  addEventListener('resize', sched); addEventListener('orientationchange', sched);
  document.addEventListener('click', () => setTimeout(sched, 50), true); // tab switches, drawers, folds
  const boot = () => { sched(); setInterval(() => { if (PH.matches && !document.hidden) sched(); }, 1500); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
  // the visible viewport (shrinks when the keyboard is up): a full-screen bot chat (mobile.css) ends at the keyboard, its message box stays in view
  const vv = window.visualViewport;
  if (vv) { const set = () => { const r = document.documentElement.style; r.setProperty('--vvh', vv.height + 'px'); r.setProperty('--vvt', vv.offsetTop + 'px'); };
    vv.addEventListener('resize', set); vv.addEventListener('scroll', set); set(); }
})();
