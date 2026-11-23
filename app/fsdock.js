// Full-screen bot view -> the agents move into the dock (2026-11-21). NO new look: this only uses the folding the dock already has.
// While a bot is open full screen on a page (.agpage.hboton), every agent of that page that is open on the desk is folded onto the pile
// (the normal folded cards, same styling and size as always) so they stay visible in the dock. Leaving full screen puts them back as they were.
// Pure part (foldPlan) is exported for tests; the rest is the page wiring and runs only in the browser.
(() => {
  // which agents to fold: the page's open workers, in the order they sat on the desk; nothing for a phone or an empty page
  const foldPlan = (workers, g, isOpen, groupOf, skip) => skip ? [] : workers.filter(a => a && !a.orch && groupOf(a) === g && isOpen(a.id)).map(a => a.id);
  if (typeof module !== 'undefined' && module.exports) { module.exports = { foldPlan }; return; }
  if (typeof document === 'undefined') return;

  let cur = null; // { page, g, ids: [open ids in order], marks: Map(id -> deckOpen value), order: deskOrder snapshot }
  const gOf = page => { const id = page.id || ''; return id.startsWith('s-pg-') ? id.slice(5) : id === 's-fagents' ? 'foreman' : id.slice(2); };

  function enter(page) {
    if (cur?.page === page) return; leave();
    if (typeof DECK === 'undefined' || !DECK) return;
    const g = gOf(page), ids = foldPlan(workers(), g, deckIsOpen, groupOf, PH.matches);
    cur = { page, g, ids, marks: new Map(ids.map(id => [id, deckOpen.get(id)])), order: [...deskOrder] };
    if (!ids.length) return;
    for (const id of ids) deckSet(id, false, { defer: true });
    renderPanesLayout();
  }
  function leave() {
    if (!cur) return; const c = cur; cur = null;
    let any = false;
    for (const id of c.ids) {
      if (!agents.has(id) || deckIsOpen(id)) continue; // gone, or the user already opened it again
      deckOpen.set(id, c.marks.get(id) > 0 ? c.marks.get(id) : Date.now()); any = true;
    }
    if (!any) return;
    deskOrder = [...c.order.filter(id => deckIsOpen(id)), ...deskOrder.filter(id => deckIsOpen(id) && !c.order.includes(id))].filter((id, i, l) => l.indexOf(id) === i);
    deckSave(); renderPanesLayout();
  }
  const sync = () => { const p = document.querySelector('.agpage.hboton.on'); p ? enter(p) : leave(); };
  new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  window.FmFsDock = { active: () => !!cur, holds: g => !!cur && cur.g === g }; // deckSet asks this so the watcher does not pull an agent back out while the bot is open
})();
