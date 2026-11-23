// One card pile, shared by the agent pile (index.html deckRender / deckPlace) and the Bots stack (bots.js decks / stackPlace).
// 2026-11-16: bots dock and undock like agents (the other cards slide out of the way); the containers behave the same,
// only what is on a card differs. So the parts that make a pile feel like a pile live here once:
//   sync   keyed cards: a card element is kept for as long as its item stays on the pile (never rebuilt from innerHTML), so a
//          card that leaves or arrives makes the others glide to their new spots (CSS transition on their --at offset)
//   leave  a card going off the pile fades out, then goes; the rest close up at once
//   arrive a card dealt onto a pile already on screen slides in from the left
//   order  puts the kept cards in the given order in the DOM (moving only those out of place)
//   step   how far apart the cards lie: up to `whole` lie whole, more overlap more, never past `room`
//   thud   a card that just landed (a pane flew back into it): a small bounce
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const glide = (el, kf, o) => (!el || RM.matches || !el.animate) ? null : el.animate(kf, { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)', ...o });
  const spring = () => getComputedStyle(document.documentElement).getPropertyValue('--spring').trim() || 'cubic-bezier(.34,1.3,.5,1)'; // index.html's damped spring (--spring)
  function leave(c, o = {}) {
    c.classList.add(o.gone || 'pgone');
    const an = glide(c, [{ opacity: o.from ?? (c.classList.contains('lifted') || c.classList.contains('landing') ? 0 : 1) }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
    an ? (an.onfinish = () => c.remove()) : c.remove();
  }
  function arrive(c) { return glide(c, [{ opacity: 0, translate: '-40px 0' }, { opacity: 1, translate: '0 0' }], { duration: 460, easing: spring() }); }
  // box: the pile; items: what lies on it, in order; o.key(item) -> id; o.attr: the card's data attribute holding the id ('id' | 'bot');
  // o.make(item) -> a new card element; o.paint(card, item) brings a kept card up to date; o.gone: class for a leaving card;
  // o.onLeave(card) runs just before a card leaves (e.g. remember where it lay); o.quiet(item): no slide-in for this new card.
  function sync(box, items, o) {
    const live = `[data-${o.attr}]:not(.${o.gone || 'pgone'})`, want = new Map(items.map(it => [String(o.key(it)), it]));
    const have = new Map([...box.querySelectorAll(':scope > ' + live)].map(c => [c.dataset[o.attr], c]));
    for (const [id, c] of have) if (!want.has(id)) { o.onLeave?.(c); leave(c, o); have.delete(id); }
    const cards = [];
    for (const [id, it] of want) {
      let c = have.get(id), fresh = false;
      if (!c) { c = o.make(it); c.dataset[o.attr] = id; box.appendChild(c); fresh = true; }
      o.paint?.(c, it, fresh);
      if (fresh && box._placed && !o.quiet?.(it)) arrive(c);
      cards.push(c);
    }
    order(box, cards);
    return cards;
  }
  function order(box, cards) {
    let prev = null;
    for (const c of cards) { const nx = prev ? prev.nextSibling : box.firstChild; if (nx !== c) box.insertBefore(c, nx); prev = c; }
  }
  function step(m, { len, gap = 10, whole = 4, room = Infinity, min = 1.5 }) {
    if (m < 2) return 0;
    const ideal = m <= whole ? len + gap : Math.max(min, (len + gap) * Math.pow(whole / m, 1.15));
    return Math.max(min, Math.min(ideal, room / (m - 1)));
  }
  function thud(c) { if (!c || RM.matches) return; c.classList.remove('dthud'); void c.offsetWidth; c.classList.add('dthud'); setTimeout(() => c.classList.remove('dthud'), 520); }
  window.FmPile = { sync, leave, arrive, order, step, thud, glide };
})();
