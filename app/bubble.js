// Foreman bubble: drag anywhere (mouse + touch), position remembered, popup anchored to it.
// Agents pages (every AG_PAGES entry has its own page chat: own chat, chosen by chatId() in index.html) hide the bubble: in the deck layout fbOver(workArea, card) floats the popup ON TOP of the work
// area (grows out of the page chat card; no grid slot), in the grid layout fbAnchor(launcher) anchors the popup to that fixed button instead.
// Every open/close fires a 'fbset' event (detail = open) so the page chat card can leave / come back.
(() => {
  const LOGO = 'logo.svg'; // bubble face (app icon)
  const b = document.getElementById('fbBubble'), p = document.getElementById('fbPanel'), badge = document.getElementById('fbBadge');
  document.getElementById('fbLogo').src = LOGO;
  document.body.appendChild(p); document.body.appendChild(b); // above every page layer
  const M = 8, GAP = 10; let pos = null, open = false, anchor = null, over = null, from = null;
  try { pos = JSON.parse(localStorage.getItem('fbPos')); } catch {}
  const vw = () => window.visualViewport?.width || innerWidth, vh = () => window.visualViewport?.height || innerHeight;
  const bs = () => b.offsetWidth || 58;
  const clamp = () => {
    const s = bs();
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) pos = { x: vw() - s - 20, y: vh() - s - 24 };
    pos.x = Math.min(Math.max(M, pos.x), Math.max(M, vw() - s - M)); pos.y = Math.min(Math.max(M, pos.y), Math.max(M, vh() - s - M));
  };
  const shown = el => el && el.isConnected && el.getClientRects().length ? el.getBoundingClientRect() : null;
  // whole CSS px only (rects / visualViewport give fractions): crisp edges and text
  const pin = (W, H, x, y) => { x = Math.round(x); y = Math.round(y); const st = { width: Math.floor(W) + 'px', height: Math.floor(H) + 'px', left: x + 'px', top: y + 'px' }; Object.assign(p.style, st); };
  const origin = o => { p.style.transformOrigin = o; };
  function placeOver(r) { // over the work area: pinned to its top-left, fills its height (glass popup width), grows out of the card
    const i = matchMedia('(max-width: 900px)').matches ? 0 : 12; // phone: exactly over the work area (an inset left the open pane's frame showing around it)
    const L = Math.max(M, r.left + i), T = Math.max(M, r.top + i), R = Math.min(vw() - M, r.right - i), B = Math.min(vh() - M, r.bottom - i);
    const W = Math.max(Math.min(480, R - L), Math.min(320, vw() - 2 * M)), H = Math.max(Math.min(760, B - T), Math.min(300, vh() - 2 * M));
    const x = Math.min(L, vw() - W - M), y = Math.min(T, vh() - H - M), fr = shown(from);
    pin(W, H, x, y);
    origin(fr ? (fr.left + fr.width / 2 - x) + 'px ' + (fr.top + fr.height / 2 - y) + 'px' : '0 0');
  }
  function place() {
    clamp(); const s = bs(); b.style.left = pos.x + 'px'; b.style.top = pos.y + 'px';
    const or = shown(over); if (or) return placeOver(or);
    const ar = anchor && anchor.isConnected && anchor.getClientRects().length ? anchor.getBoundingClientRect() : null;
    const bx = ar ? ar.left : pos.x, by = ar ? ar.top : pos.y, bw = ar ? ar.width : s, bh = ar ? ar.height : s;
    const W = Math.min(440, vw() - 2 * M), cx = bx + bw / 2, cy = by + bh / 2;
    const below = vh() - (by + bh) - GAP - M, above = by - GAP - M;
    const down = cy < vh() / 2 ? below >= Math.min(300, above) : above < Math.min(300, below);
    const H = Math.max(160, Math.min(660, down ? below : above));
    let x = cx > vw() / 2 ? bx + bw - W : bx; x = Math.min(Math.max(M, x), vw() - W - M);
    const y = Math.max(M, down ? by + bh + GAP : by - GAP - H);
    pin(W, H, x, y);
    origin((cx - x) + 'px ' + (cy - y) + 'px');
  }
  function set(v) {
    open = !!v; place(); p.classList.toggle('open', open); b.classList.toggle('open', open); document.body.classList.toggle('fbopen', open);
    p.setAttribute('aria-hidden', String(!open)); anchor?.classList.toggle('open', open);
    p.classList.toggle('over', !!over); dispatchEvent(new CustomEvent('fbset', { detail: open }));
    if (open) { badge.hidden = true; document.querySelectorAll('.olbadge').forEach(x => { x.hidden = true; }); if (!matchMedia('(pointer:coarse)').matches) setTimeout(() => document.getElementById('jIn')?.focus(), 250); }
  }
  window.fbSet = set; window.fbOpen = () => open;
  window.fbOver = (el, card) => { over = el || null; from = card || null; p.classList.toggle('over', !!over); if (over) place(); };
  window.fbAnchor = el => { if (anchor && anchor !== el) anchor.classList.remove('open'); anchor = el || null; if (anchor) place(); };
  let d = null;
  b.addEventListener('pointerdown', e => { if (e.button) return; d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false }; b.setPointerCapture(e.pointerId); });
  b.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return; const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 6) return; d.moved = true; b.classList.add('drag'); pos.x = d.ox + dx; pos.y = d.oy + dy; place();
  });
  const end = e => {
    if (!d || e.pointerId !== d.id) return; const m = d.moved; d = null; b.classList.remove('drag');
    if (m) { try { localStorage.setItem('fbPos', JSON.stringify(pos)); } catch {} } else if (e.type === 'pointerup') set(!open);
  };
  b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(!open); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && open && !e.isComposing && !e.defaultPrevented) set(false); }); // not when that Esc just stopped Foreman
  addEventListener('resize', place); window.visualViewport?.addEventListener('resize', place);
  // unread dot + working ring
  let seenCid = null; // the chat shows the current page's page chat: a re-render for a page switch is not an unread message
  new MutationObserver(() => { const c = document.getElementById('chat').dataset.cid; if (c !== seenCid) { seenCid = c; return; } if (!open) { badge.hidden = false; document.querySelectorAll('.olbadge').forEach(x => { x.hidden = false; }); } }).observe(document.getElementById('chat'), { childList: true });
  setInterval(() => { try { const w = agents.get('dobby')?.status === 'working'; b.classList.toggle('working', w); document.querySelectorAll('.orchlaunch').forEach(x => x.classList.toggle('working', agents.get(orchId(x.dataset.g))?.status === 'working')); } catch {} }, 500); // each launcher: its own page's page chat
  place();
})();
