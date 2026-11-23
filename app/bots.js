// Bots, inside each work page (Home redo, 2026-11-20: Home is a dashboard only; a bot belongs to exactly one page and works in that page's folder). bots.mjs is the server side.
//   Left column: a "Bots" stack at the top of every work page's card column (always there, with "+ Add a bot"). Click a card = the bot opens in that page's main area.
//   Open bot: chat (streaming replies, tool chips, Allow/Deny and question cards) + a side panel: Browser (its own Chrome, live, take
//     over to sign in), Routines (schedules), Memory (MEMORY.md + today's log), Profile (job, character, model, access).
//   Narrow screens: the bot fills the area, Chat/Browser/... tabs.
//   Desk panes (2026-11-16/17): drag a bot card out of the stack onto the desk and it stays open there as a pane (several at once). The
//     carry, landing slot, resizing and drop are index.html deskCarry, the same code agents use (carryBot is the bot kit); bots and agents share
//     one desk order (deskOrder, bot keys "bot:<id>") and mix freely. Pick a bot pane up by its header like an agent pane.
//     side panel folded in (toggle in its header); ✕ puts it back. Kept per page in localStorage botDesk; index.html renderPanesLayout
//     lays them out with the agent panes (window.botPanes).
//   window.FmBots: open(id), close(), newBot({ page }), list() — used by the page "+" picker (newagent.js) and index.html.
(() => {
  const sec = document.getElementById('s-home'); if (!sec) return;
  const C = window.BotChar;
  const H = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tip = (t, m, p) => (window.toast ? toast(t, m, p || 'info') : alert(t + '\n' + (m || '')));
  const api = async (p, body) => { const r = await fetch('/api/bots' + p, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Failed (' + r.status + ')'); return j; };
  const STATUS = { idle: 'Idle', working: 'Working', needs_you: 'Needs you', paused: 'Paused', error: 'Hit a problem' };
  const MODELS = [['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']];
  const LEVELS = [['ask', 'Ask first', 'Every file change and command waits for your OK'], ['auto', 'Auto', 'Routine actions go ahead; a safety check stops risky ones'], ['full', 'Full access', 'No permission prompts']];
  const time = t => { const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const narrow = () => matchMedia('(max-width: 900px)').matches;
  const HOW = `<div class="bt-how"><b>How bots work</b>
    <p>An <b>agent</b> (the cards on a page) does one coding task in that page's folder and finishes. A <b>bot</b> is a teammate that stays.</p>
    <ul><li><b>A job.</b> You tell it what it's for; it follows those instructions every time you talk to it.</li>
    <li><b>Memory.</b> It keeps notes between conversations (Memory tab). Tell it something once.</li>
    <li><b>A schedule.</b> It can work on its own, e.g. every weekday at 8 (Routines tab, or just ask it).</li>
    <li><b>Its own browser.</b> It browses in its own Chrome. Watch it live, or click into it yourself to sign it in to a site (Browser tab).</li>
    <li><b>Where it works.</b> On the page you add it to, in that page's folder. Pages are separate: a bot never sees another page. It can start and follow up on coding agents on its page (the Dispatcher does just that).</li>
    <li><b>Safety.</b> Pick Ask first, Auto or Full access. It always asks before sending, posting, buying or deploying.</li></ul></div>`;

  let bots = new Map(), templates = [], pageList = [], sock, browserReady = true; const opening = new Set(); // bot browsers being opened right now (one request even with the bot in a pane and the popup)
  const logs = new Map(), streams = new Map();
  const pageName = id => pageList.find(p => p.id === id)?.name || id;

  const extra = document.createElement('div'); extra.innerHTML = '<div class="bt-modal" hidden></div><div class="bt-menu" hidden></div>'; document.body.append(...extra.children);
  const modal = document.querySelector('.bt-modal'), menu = document.querySelector('.bt-menu');

  // ---------- events (every open view of that bot follows along: the popup and any desk panes) ----------
  const views = new Set(); // the popup + every desk pane
  const showing = id => [...views].filter(v => v.id === id);
  function connect() {
    sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/bots/ws');
    sock.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } on(m); };
    sock.onclose = () => setTimeout(connect, 2000);
  }
  function on(m) {
    if (m.t === 'init') { bots = new Map(m.bots.map(b => [b.id, b])); loaded = true; if (m.pageList) pageList = m.pageList; for (const v of views) if (v.id && !bots.has(v.id)) v.gone(); everywhere(); deskSync();
      for (const v of views) if (v.id) { v.renderOpen(); loadLog(v.id, true); } return; }
    if (m.t === 'pages') { pageList = m.pageList || []; everywhere(); deskSync(); return; }
    if (m.t === 'bot') { const was = bots.get(m.bot.id), pinChg = !!was && !!was.pinned !== !!m.bot.pinned; bots.set(m.bot.id, m.bot); everywhere(); if (JSON.stringify(was?.pages) !== JSON.stringify(m.bot.pages)) deskSync(); if (pinChg && Object.keys(desk).some(g => deskOf(g).includes(m.bot.id))) relayout(); /* pinned on the host (any screen): its pane takes a column, glided */ showing(m.bot.id).forEach(v => v.onBot(m.bot, was)); return; }
    if (m.t === 'removed') { bots.delete(m.id); logs.delete(m.id); showing(m.id).forEach(v => v.gone()); everywhere(); deskSync(); return; }
    if (m.t === 'log') { const l = logs.get(m.id); if (l) l.push(m.entry); if (m.entry.role === 'bot') streams.delete(m.id); showing(m.id).forEach(v => v.onLog(m.entry)); return; }
    if (m.t === 'delta') { streams.set(m.id, (streams.get(m.id) || '') + m.text); showing(m.id).forEach(v => v.streamPaint()); return; }
    if (m.t === 'card') { const e = logs.get(m.id)?.find(x => x.card?.id === m.card.id); if (e) e.card = m.card; showing(m.id).forEach(v => v.onCard(m.card)); return; }
    if (m.t === 'browser') { const b = bots.get(m.id); if (b) { b.url = m.url; b.browserOpen = m.open; } showing(m.id).forEach(v => v.onUrl(m.url)); }
  }
  let loaded = false;
  async function loadLog(id, force) { if (logs.has(id) && !force) return; try { const j = await api('/' + id + '/log'); logs.set(id, j.log); showing(id).forEach(v => v.renderChat()); } catch {} }
  document.addEventListener('visibilitychange', () => views.forEach(v => v.markRead()));

  window.botsWorkingOn = g => [...bots.values()].filter(b => b.status === 'working' && !b.archived && (b.pages || []).includes(g)); // a page tab sweeps while a bot that works in its folder is working (2026-11-16)
  function everywhere() { decks(); try { window.renderTabs?.(); } catch {} }

  // ---------- the Bots stack on every page's left column ----------
  const order = list => list.sort((a, b) => (b.pinned - a.pinned) || ((a.order ?? 1e9) - (b.order ?? 1e9)) || (a.created || 0) - (b.created || 0)); // pinned first, then the order the user dragged them into (new bots at the end)
  const lineOf = b => b.status === 'working' ? '<em>working…</em>' : b.restorable ? '<em class="presumed">↻ restored · message me to continue</em>' : b.status === 'needs_you' ? '<em class="w">needs you</em>' : b.status === 'paused' ? '<em>paused</em>' : b.status === 'error' ? '<em class="e">hit a problem</em>' : H(b.lastLine || b.job || 'Say hi');
  // The Bots stack is the same pile as the agent pile (pile.js, shared): keyed cards that glide. A bot on this page's desk is off the
  // stack (the others close up, like an agent dragged onto the desk); ✕ on its pane deals the card back (the others open a slot) and the
  // pane flies into it (2026-11-16). out = its popup is open from this page: the card stays as a faded slot (like a standing agent's chat).
  const isOut = (id, z) => pop.id === id && pop.shown() && pop.host?.contains(z);
  const landing = new Set(); // g|id: a pane on its way back into its card (the card holds its slot, invisible, until it lands)
  const LIVE = '[data-bot]:not(.pgone)', KEEP = ['dnew', 'lifted', 'dthud'];
  function paintBot(c, b, out, land) {
    const cls = `bk-card st-${b.status}${out ? ' out' : ''}${land ? ' landing' : ''}` + KEEP.filter(k => c.classList.contains(k)).map(k => ' ' + k).join('');
    if (c.className !== cls) c.className = cls;
    const al = b.name + (b.job ? ': ' + b.job : ''); if (c.getAttribute('aria-label') !== al) c.setAttribute('aria-label', al);
    const h = `<span class="bk-av">${C.draw(b.look, b.status)}</span><span class="bk-t"><b>${H(b.name)}</b><span>${lineOf(b)}</span></span>${b.unread && !out ? `<i class="bk-badge">${b.unread}</i>` : ''}`;
    if (c._h !== h) { c._h = h; c.innerHTML = h; }
  }
  const newCard = () => { const c = document.createElement('button'); c.type = 'button'; c.className = 'bk-card dnew'; return c; };
  function decks() {
    if (drag?.on || carry) return; // mid-drag: the cards stay put
    if (pop.host && !pop.host.isConnected) pop.lost(); // its page was removed while a bot was open there
    document.querySelectorAll('.dkzone[data-g]').forEach(z => {
      const g = z.dataset.g; if (g === 'home') { z.querySelector(':scope > .bdeck')?.remove(); return; } // Home is a dashboard: no bots there
      const all = order([...bots.values()].filter(b => !b.archived && (b.pages || []).includes(g))), onDesk = deskOf(g);
      let d = z.querySelector(':scope > .bdeck');
      if (!d) { d = document.createElement('div'); d.className = 'bdeck'; d.dataset.g = g; d.innerHTML = '<div class="bk-h"></div><div class="bk-list"></div>'; z.prepend(d); }
      const hh = `<span>Bots here</span><button type="button" class="bk-add" aria-label="Add a bot to this page">+</button>`, hd = d.querySelector('.bk-h');
      if (hd._h !== hh) { hd._h = hh; hd.innerHTML = hh; }
      const l = d.querySelector('.bk-list'), list = all.filter(b => !onDesk.includes(b.id) || landing.has(g + '|' + b.id));
      let none = l.querySelector(':scope > .bk-slot'); if (!all.length && !none) { none = document.createElement('button'); none.type = 'button'; none.className = 'bk-slot'; none.innerHTML = '<span class="bk-sq">+</span><span class="bk-t"><b>Add a bot</b><span>A teammate that stays on this page</span></span>'; l.append(none); } else if (all.length) none?.remove();
      FmPile.sync(l, list, { attr: 'bot', key: b => b.id, make: newCard, paint: (c, b) => paintBot(c, b, isOut(b.id, z), landing.has(g + '|' + b.id)), quiet: b => landing.has(g + '|' + b.id) });
      stackPlace(l);
    });
  }
  // the pile: up to STK_N cards lie whole; more overlap inside the same height (only a slice of each shows, the last one whole). Spacing = pile.js step, like the agent pile
  const STK_CH = 46, STK_GAP = 4, STK_N = 3, STK_H = STK_N * STK_CH + (STK_N - 1) * STK_GAP;
  function stackPlace(l) {
    if (!l) return; const cs = [...l.querySelectorAll(':scope > ' + LIVE + ':not(.lifted)')], n = cs.length;
    l.classList.toggle('stk', !!l.querySelector(':scope > [data-bot]')); // a leaving card still fading keeps the pile layout
    const step = FmPile.step(n, { len: STK_CH, gap: STK_GAP, whole: STK_N, room: STK_H - STK_CH });
    l._step = step || 1; l.style.height = n ? Math.round((n - 1) * step + STK_CH) + 'px' : '';
    cs.forEach((c, i) => { c.style.setProperty('--at', Math.round(i * step) + 'px'); c.style.zIndex = i + 1; });
    l._placed = true; requestAnimationFrame(() => requestAnimationFrame(() => cs.forEach(c => c.classList.remove('dnew'))));
  }
  document.addEventListener('click', e => {
    const c = e.target.closest('.bdeck [data-bot]'); if (c) { e.preventDefault(); if (Date.now() - dragEnd > 250) { const id = c.dataset.bot, pg = c.closest('.agpage'), g = c.closest('.dkzone')?.dataset.g;
      if (g && deskOf(g).includes(id)) panes.get(g + '|' + id)?.focus(); // on this page's desk already: go to its pane
      else if (id === pop.id && pop.shown() && pop.host.contains(c)) pop.shut(); else pop.open(id, pg, c); } return; } // the click that ends a drag opens nothing
    const ad = e.target.closest('.bdeck .bk-add, .bdeck .bk-slot'); if (ad) newBot({ page: ad.closest('.bdeck').dataset.g });
  });
  document.addEventListener('contextmenu', e => { const c = e.target.closest('.bdeck [data-bot]'); if (!c) return; e.preventDefault(); botMenu(c.dataset.bot, e.clientX, e.clientY, false); });
  setInterval(() => { decks(); }, 1500); // page columns are built lazily by the deck code; times move on

  // ---------- drag to reorder: hold a card in a Bots stack or Home's Bots grid and drag it (2026-11-16). The order is the server's
  // (b.order, new bots at the end); pinned bots always stay on top. A stack that shows only some bots reorders those among themselves.
  let drag = null, dragEnd = 0;
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.pointerType === 'touch') return; // touch: the lists scroll; reorder with a mouse
    const c = e.target.closest('.bdeck .bk-list > ' + LIVE); if (c) drag = { c, box: c.parentElement, x: e.clientX, y: e.clientY, on: false, e };
  });
  addEventListener('pointermove', e => {
    const d = drag; if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      if (!d.c.isConnected) { drag = null; return; }
      const r = d.c.getBoundingClientRect(); d.on = true; d.dx = d.x - r.left; d.dy = d.y - r.top;
      d.gh = d.c.cloneNode(true); d.gh.classList.add('bk-ghost'); d.gh.style.width = r.width + 'px'; d.gh.style.height = r.height + 'px'; document.body.append(d.gh);
      d.c.classList.add('bk-src'); document.body.classList.add('bk-dragging');
    }
    e.preventDefault(); d.gh.style.transform = `translate(${e.clientX - d.dx}px, ${e.clientY - d.dy}px)`;
    const z = d.box.closest('.dkzone'); // a stack card carried out past the groove: from here on it is the same carry as an agent card (index.html deskCarry)
    if (z && !narrow() && e.clientX > z.getBoundingClientRect().right + 6) {
      drag = null; d.gh.remove(); d.c.classList.remove('bk-src'); document.body.classList.remove('bk-dragging');
      if (carryBot(d.e, z.dataset.g, d.c.dataset.bot, 'card', d.c)) d.c.classList.add('lifted'); else everywhere();
      return;
    }
    if (d.box.classList.contains('stk') && getComputedStyle(d.box).display === 'block') { // the overlapped pile: the slot under the pointer
      const cs = [...d.box.querySelectorAll(':scope > ' + LIVE)], st = d.box._step || 1, top = d.box.getBoundingClientRect().top;
      const i = Math.max(0, Math.min(cs.length - 1, Math.round((e.clientY - d.dy - top) / st))), cur = cs.indexOf(d.c);
      if (i !== cur) { const rest = cs.filter(x => x !== d.c); i >= rest.length ? d.box.append(d.c) : rest[i].before(d.c); stackPlace(d.box); }
      return;
    }
    const col = getComputedStyle(d.box).flexDirection === 'column'; // Bots stack (column) or Home's grid / a narrow screen's row
    let best = null, bd = Infinity;
    for (const x of d.box.querySelectorAll(':scope > ' + LIVE)) { if (x === d.c) continue; const r = x.getBoundingClientRect(), dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); if (dist < bd) { bd = dist; best = x; } }
    if (!best) return;
    const r = best.getBoundingClientRect(), after = col ? e.clientY > r.top + r.height / 2 : e.clientY > r.bottom || (e.clientY >= r.top && e.clientX > r.left + r.width / 2);
    if (after ? best.nextElementSibling !== d.c : best.previousElementSibling !== d.c) after ? best.after(d.c) : best.before(d.c); // the card moves there live
  });
  const dragStop = ok => {
    const d = drag; drag = null; if (!d?.on) return;
    d.gh.remove(); d.c.classList.remove('bk-src'); document.body.classList.remove('bk-dragging'); dragEnd = Date.now();
    const moved = [...d.box.querySelectorAll(':scope > ' + LIVE)].map(x => x.dataset.bot).filter(id => bots.has(id));
    const full = order([...bots.values()]).map(b => b.id);
    if (ok) { const slots = full.map((id, i) => moved.includes(id) ? i : -1).filter(i => i >= 0); slots.forEach((i, k) => { full[i] = moved[k]; }); // this list's bots take their new places among the rest
      full.forEach((id, i) => { bots.get(id).order = i; }); api('/order', { ids: full }).catch(err => tip('Could not save the order', err.message, 'high')); }
    everywhere();
  };
  addEventListener('pointerup', () => dragStop(true));
  addEventListener('pointercancel', () => dragStop(false));
  addEventListener('keydown', e => { if (e.key === 'Escape' && drag?.on) dragStop(false); });

  // ---------- a bot view: the popup (one, moves to the page it was opened from) or a desk pane (one per bot per page) ----------
  // Everything below runs per view: sel = the bot it shows, side = its side tab, its own browser stream.
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const lsObj = k => { try { const o = JSON.parse(localStorage.getItem(k) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } };
  const paneSide = new Map(Object.entries(lsObj('botPaneSide'))); // g|id -> side panel unfolded (folded in by default)
  const paneTab = new Map(Object.entries(lsObj('botPaneTab'))); // id -> side tab in panes
  const paneSideSave = () => { localStorage.setItem('botPaneSide', JSON.stringify(Object.fromEntries(paneSide))); localStorage.setItem('botPaneTab', JSON.stringify(Object.fromEntries(paneTab))); };
  function makeView(g) { // g = desk page id for a pane; none = the popup
    const PANE = !!g;
    let sel = '', side = localStorage.getItem('botSide') || 'browser', mview = 'chat', host = null, sopen = false;
    const sideFor = id => { sopen = !!paneSide.get(g + '|' + id); return paneTab.get(id) || 'browser'; };
    const view = document.createElement(PANE ? 'article' : 'div'); view.className = PANE ? 'apane bpane' : 'hbot';
    view.innerHTML = `<div class="bt" data-mview="chat"><main class="bt-main"></main><aside class="bt-side"><div class="bt-stabs"></div><div class="bt-sbody"></div></aside></div>`;
    if (!PANE) sec.append(view);
    else view.addEventListener('pointerdown', e => { if (e.target.closest('.bt-head') && !e.target.closest('button, a, input, select, textarea')) carryBot(e, g, sel, 'pane', view); }); // pick the pane up by its header, as an agent pane
    const $ = s => view.querySelector(s), root = $('.bt'), main = $('.bt-main'), sbody = $('.bt-sbody'), stabs = $('.bt-stabs');
    const shown = () => !!sel && (PANE ? !!view.isConnected && !!view.closest('.agpage.on') : !!host && host.classList.contains('on')); // on screen now
    let readT;
    function markRead() { const b = bots.get(sel); if (!b?.unread || document.hidden || !shown()) return; clearTimeout(readT); readT = setTimeout(() => api('/' + sel + '/read', {}).catch(() => {}), 400); }
    function showSide(s) { side = s; if (PANE) { sopen = true; paneSide.set(g + '|' + sel, true); paneSideSave(); const h = main.querySelector('.bt-head'); if (h) h._h = ''; header(); } else if (narrow()) mview = 'side'; renderOpen(); }
    // ---------- open / close ----------
    function open(id, at, from) { // popup: at = the page section to show it in (a Bots stack's own page); default Home
      if (!bots.has(id)) return;
      if (PANE) { sel = id; view.dataset.dkey = 'bot:' + id; side = sideFor(id); renderOpen(); loadLog(id); markRead(); return; }
      sel = id; mview = 'chat';
      const to = at || sec;
      if (host && host !== to) host.classList.remove('hboton');
      if (view.parentNode !== to) { viewOff(); to.append(view); }
      host = to;
      if (!to.classList.contains('on') && typeof show === 'function') show(to === sec ? 'home' : to.id.startsWith('s-pg-') ? 'pg:' + to.id.slice(5) : to.id.slice(2));
      const fr = from?.isConnected ? from.getBoundingClientRect() : null;
      to.classList.add('hboton'); renderOpen(); loadLog(id); markRead(); decks(); grow(fr);
      if (!narrow()) setTimeout(() => main.querySelector('.bt-in2')?.focus(), 30);
    }
    // like a standing agent's chat (2026-11-16): the bot grows out of its card (the card lifts out, a faded slot stays), and shrinks
    // back into it on close (click the card again, ✕ or Esc)
    const RM = matchMedia('(prefers-reduced-motion: reduce)');
    const toCard = (fr, vr) => `translate(${fr.left - vr.left}px,${fr.top - vr.top}px) scale(${fr.width / vr.width},${fr.height / vr.height})`;
    function grow(fr) {
      view._an?.cancel(); view._an = null; const vr = view.getBoundingClientRect();
      if (!fr?.width || !vr.width || RM.matches) return;
      view.style.transformOrigin = '0 0';
      view._an = view.animate([{ opacity: .25, transform: toCard(fr, vr) }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
      view._an.onfinish = () => { view._an = null; };
    }
    const slotOf = () => sel && host ? host.querySelector(`.bdeck [data-bot="${sel}"]`) : null;
    function shut() {
      if (PANE) return unpin(g, sel);
      if (!sel || view._closing) return; const c = slotOf(), fr = c?.getBoundingClientRect(), vr = view.getBoundingClientRect();
      if (!fr?.width || !vr.width || RM.matches || !shown()) return close();
      view._an?.cancel(); view._closing = true; view.style.transformOrigin = '0 0';
      const an = view._an = view.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: toCard(fr, vr) }], { duration: 240, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
      an.onfinish = () => { view._closing = false; view._an = null; close(); an.cancel(); };
    }
    function close() { if (PANE) return; sel = ''; host?.classList.remove('hboton'); viewOff(); main.innerHTML = ''; sbody.innerHTML = ''; stabs.innerHTML = ''; decks(); try { window.homeSync?.(); } catch {} }
    if (!PANE) addEventListener('keydown', e => { if (e.key === 'Escape' && shown() && modal.hidden && menu.hidden && !document.activeElement?.closest?.('.bt-comp, .bt-sbody, .bv-c')) shut(); });
    function renderOpen() { root.dataset.mview = mview; root.classList.toggle('bigview', !PANE && !!localStorage.getItem('botBig') && side === 'browser'); root.classList.toggle('sopen', !PANE || sopen); renderMain(); sideRender(); }

    // ---------- chat ----------
    function renderMain() {
      const b = bots.get(sel); if (!b) { main.innerHTML = ''; return; }
      main.innerHTML = `<div class="bt-head"></div><div class="bt-mtabs">${['chat', 'browser', 'routines', 'memory', 'profile'].map(t => `<button type="button" data-t="${t}" class="${(mview === 'chat' ? 'chat' : side) === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
        <div class="bt-log" tabindex="-1"></div>
        <form class="bt-comp" autocomplete="off"><textarea class="bt-in2" rows="1" placeholder="Message ${H(b.name)}…"></textarea><button class="bt-btn bt-primary bt-send" type="submit">Send</button></form>`;
      header(); renderChat();
      const ta = main.querySelector('.bt-in2'), fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; };
      ta.addEventListener('input', fit);
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); main.querySelector('.bt-comp').requestSubmit(); } });
      main.querySelector('.bt-comp').onsubmit = e => { e.preventDefault(); const t = ta.value.trim(); if (!t) return; ta.value = ''; fit(); api('/' + b.id + '/send', { text: t }).catch(x => tip('Not sent', x.message, 'high')); };
      main.querySelector('.bt-mtabs').onclick = e => { const t = e.target.closest('button')?.dataset.t; if (!t) return; if (t === 'chat') mview = 'chat'; else { mview = 'side'; side = t; localStorage.setItem('botSide', t); } renderOpen(); };
    }
    function header() {
      const b = bots.get(sel), el = main.querySelector('.bt-head'); if (!b || !el) return;
      const where = b.page ? 'Works in ' + pageName(b.page) : 'Not on a page';
      const pinB = !PANE ? '' : `<button class="pbtn ppin${b.pinned ? ' on' : ''}" title="${b.pinned ? 'Pinned: keeps a full column of the grid. Click to unpin' : 'Pin: give this bot a full column of the grid'}" aria-label="${b.pinned ? 'Unpin bot' : 'Pin bot'}" aria-pressed="${!!b.pinned}"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5.5 1.5h5l-.8 4.2 2.8 2.8v1H8.6V15l-.6.5-.6-.5V9.5H4.5v-1l2.8-2.8z" fill="currentColor"/></svg></button>`; // the same pin button the agent panes have (index.html); the pin itself lives on the host
      const h = `${pinB}<span class="bt-hav">${C.draw(b.look, b.status)}</span>
        <div class="bt-hn"><div class="bt-hname">${H(b.name)}${b.chief ? ' <span class="bt-tag">Lead</span>' : ''}</div><div class="bt-hjob">${H(b.job || 'No job yet: tell it what it is for')}</div><button type="button" class="bt-where" title="Change in Profile">${H(where)}</button></div>
        <span class="bt-st st-${b.status}"><i></i>${STATUS[b.status] || b.status}${b.queued ? ` · ${b.queued} queued` : ''}</span>
        <select class="bt-sel bt-model" title="Model">${MODELS.map(([v, l]) => `<option value="${v}"${b.model === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <select class="bt-sel bt-level" title="Access level">${LEVELS.map(([v, l, d]) => `<option value="${v}" title="${H(d)}"${b.level === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${b.status === 'working' ? '<button type="button" class="bt-btn bt-stop" title="Stop">Stop</button>' : ''}
        ${PANE ? `<button type="button" class="bt-btn bt-ptog${sopen ? ' on' : ''}" aria-label="${sopen ? 'Fold the side panel in' : 'Browser, routines, memory, profile'}"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M10 2.5v11"/></svg></button>` : ''}
        <button type="button" class="bt-btn bt-more" aria-label="More">⋯</button><button type="button" class="bt-btn bt-close" aria-label="${PANE ? 'Put back in the stack' : 'Close'}">✕</button>`;
      if (el._h === h) return; el._h = h; el.innerHTML = h;
      el.querySelector('.bt-model').onchange = e => api('/' + b.id + '/edit', { model: e.target.value }).catch(x => tip('Not saved', x.message, 'high'));
      el.querySelector('.bt-level').onchange = e => api('/' + b.id + '/edit', { level: e.target.value }).catch(x => tip('Not saved', x.message, 'high'));
      el.querySelector('.bt-stop')?.addEventListener('click', () => api('/' + b.id + '/stop', {}));
      el.querySelector('.ppin')?.addEventListener('click', e => { e.stopPropagation(); const snap = window.paneSnap?.(); api('/' + b.id + '/edit', { pinned: !bots.get(b.id)?.pinned }).then(() => { try { window.renderPanesLayout?.(snap); } catch {} }).catch(x => tip('Not saved', x.message, 'high')); });
      el.querySelector('.bt-where').onclick = () => showSide('profile');
      el.querySelector('.bt-more').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); botMenu(b.id, r.right, r.bottom + 4, true); };
      el.querySelector('.bt-close').onclick = shut;
      el.querySelector('.bt-ptog')?.addEventListener('click', () => { sopen = !sopen; paneSide.set(g + '|' + sel, sopen); paneSideSave(); el._h = ''; header(); renderOpen(); });
    }
    function md(t) {
      const parts = String(t || '').split(/```(?:\w+)?\n?([\s\S]*?)```/g);
      return parts.map((p, i) => i % 2 ? `<pre>${H(p.replace(/\n$/, ''))}</pre>` : H(p)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
        .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
        .replace(/^(?:- |\* )(.*)$/gm, '<span class="bt-li">$1</span>').replace(/(<\/span>)\n(?:\n(?=<span class="bt-li">))?/g, '$1').replace(/\n{3,}/g, '\n\n').replace(/\n/g, '<br>')).join('');
    }
    function cardHtml(c) {
      const done = c.state !== 'pending';
      if (c.kind === 'approve') return `<div class="bt-card approve ${c.state}" data-card="${c.id}"><div class="bt-ct">${done ? '' : '<span class="bt-ci">?</span>'}Okay to do this?</div><div class="bt-cq">${H(c.title)}</div>${c.detail ? `<pre class="bt-cd">${H(c.detail)}</pre>` : ''}
        ${done ? `<div class="bt-cs">${c.state === 'allowed' ? '✓ Allowed' : c.state === 'denied' ? '✕ Denied' : 'Expired'}</div>` : `<div class="bt-cb"><button type="button" class="bt-btn bt-primary" data-allow="1">Allow</button><button type="button" class="bt-btn" data-allow="0">Deny</button></div>`}</div>`;
      return `<div class="bt-card ask ${c.state}" data-card="${c.id}"><div class="bt-ct">${done ? '' : '<span class="bt-ci">?</span>'}Question</div><div class="bt-cq">${H(c.title)}</div>
        ${done ? `<div class="bt-cs">${c.state === 'answered' ? '↳ ' + H(c.answer) : 'Closed'}</div>` : `${c.options?.length ? `<div class="bt-cb">${c.options.map(o => `<button type="button" class="bt-btn" data-ans="${H(o)}">${H(o)}</button>`).join('')}</div>` : ''}<form class="bt-ca"><input placeholder="Or type an answer…"><button class="bt-btn" type="submit">Reply</button></form>`}</div>`;
    }
    const prevShown = (l, i) => { while (--i >= 0 && l[i].role === 'tool'); return l[i]; }; // the entry above, skipping hidden tool lines
    function entryHtml(e, prev) {
      const b = bots.get(sel);
      if (e.role === 'user') return `<div class="bt-m me"><div class="bt-b">${md(e.text)}</div></div>`;
      if (e.role === 'bot') return `<div class="bt-m bot${prev?.role === 'bot' ? ' cont' : ''}"><span class="bt-mav">${C.draw(b?.look, 'idle', { still: true })}</span><div class="bt-b">${md(e.text)}<span class="bt-mt">${time(e.ts)}</span></div></div>`;
      if (e.role === 'tool') return ''; // commands stay out of the chat; a typing bubble shows while the bot works (2026-11-16)
      if (e.role === 'card') return cardHtml(e.card);
      if (e.role === 'error') return `<div class="bt-ev err">${H(e.text)}</div>`;
      return `<div class="bt-ev">${H(e.text)}</div>`;
    }
    function renderChat() {
      const el = main.querySelector('.bt-log'); if (!el) return;
      const l = logs.get(sel), b = bots.get(sel);
      if (!l) { el.innerHTML = '<div class="bt-ev">Loading…</div>'; return; }
      const y = el.scrollTop;
      el.innerHTML = (l.some(e => e.role === 'user' || e.role === 'bot') ? '' : `<div class="bt-hello">${C.draw(b?.look, 'idle')}<b>Say hi to ${H(b?.name)}</b><span>${b?.job ? H(b.job) + '. ' : ''}Tell it what you need. It remembers, can work on a schedule, and has its own browser.</span></div>`)
        + l.map((e, i) => entryHtml(e, prevShown(l, i))).join('') + '<div class="bt-stream" hidden></div>';
      streamPaint(); ss(el).keep(y);
    }
    // same scroll rules as agent panes (index.html stickScroll): follow the latest until you scroll up, then a Show latest button (2026-11-16)
    function ss(el) { return window.stickScroll ? window.stickScroll(el) : { pin() { el.scrollTop = el.scrollHeight; }, keep() { el.scrollTop = el.scrollHeight; } }; }
    function appendEntry(e) {
      const el = main.querySelector('.bt-log'); if (!el) return; const l = logs.get(sel) || [];
      if (e.role === 'user' || e.role === 'bot') el.querySelector('.bt-hello')?.remove();
      el.querySelector('.bt-stream').insertAdjacentHTML('beforebegin', entryHtml(e, prevShown(l, l.length - 1)));
      streamPaint(); if (e.role === 'user') ss(el).pin(); else ss(el).keep();
    }
    function streamPaint() {
      const el = main.querySelector('.bt-stream'); if (!el) return;
      // iMessage style: typing dots the whole time the bot is working, from the moment you send (2026-11-16: dots only once the reply
      // started streaming meant no indicator before it answered); the whole message lands at once. Painted once so the dots don't restart per chunk.
      const show = bots.get(sel)?.status === 'working';
      el.hidden = !show; if (!show) { el.innerHTML = ''; return; }
      if (el.firstChild) return;
      el.innerHTML = `<div class="bt-m bot"><span class="bt-mav">${C.draw(bots.get(sel)?.look, 'working', { still: true })}</span><div class="bt-b"><span class="bt-typing" aria-label="typing"><i></i><i></i><i></i></span></div></div>`;
      ss(main.querySelector('.bt-log')).keep();
    }
    main.addEventListener('click', e => {
      const c = e.target.closest('[data-card]'); if (!c) return;
      const a = e.target.closest('[data-allow]'), o = e.target.closest('[data-ans]');
      if (a) api('/' + sel + '/card', { card: c.dataset.card, allow: a.dataset.allow === '1' }).catch(x => tip('Not sent', x.message));
      if (o) api('/' + sel + '/card', { card: c.dataset.card, answer: o.dataset.ans }).catch(x => tip('Not sent', x.message));
    });
    main.addEventListener('submit', e => { const f = e.target.closest('.bt-ca'); if (!f) return; e.preventDefault(); const v = f.querySelector('input').value.trim(); if (v) api('/' + sel + '/card', { card: f.closest('[data-card]').dataset.card, answer: v }).catch(x => tip('Not sent', x.message)); });

    // ---------- side panel ----------
    const SIDES0 = [['browser', 'Browser'], ['routines', 'Routines'], ['memory', 'Memory'], ['profile', 'Profile']];
    let SIDES = SIDES0; // + Desktop: its own Linux screen in the Workbox (workbox.js); shown even before the Workbox is installed, since that is where it is installed
    function sideRender(soft) {
      const b = bots.get(sel);
      SIDES = window.FmWorkbox?.available?.() ? [SIDES0[0], ['desktop', 'Desktop'], ...SIDES0.slice(1)] : SIDES0;
      const ofr = () => { if (side !== 'desktop' && b) window.FmWorkbox?.offer?.(sbody, b, () => { side = 'desktop'; if (PANE) { paneTab.set(sel, side); paneSideSave(); } else localStorage.setItem('botSide', side); sideRender(); }); }; // Workbox not installed: a short Install offer on top if (side === 'desktop' && SIDES === SIDES0) side = 'browser';
      stabs.innerHTML = b ? SIDES.map(([k, l]) => `<button type="button" data-s="${k}" class="${side === k ? 'on' : ''}">${l}</button>`).join('') : '';
      if (!b) { viewOff(); sbody.innerHTML = ''; return; }
      if (soft && sbody.dataset.k === side + sel && (side === 'memory' || side === 'profile')) return; // keep what the user is typing
      if (soft && side === 'browser' && sbody.dataset.k === side + sel) { browserBar(b); ofr(); return; }
      if (soft && side === 'desktop' && sbody.dataset.k === side + sel + (window.FmWorkbox?.deskKey?.(b) || '')) return; // keep the live screen
      sbody.dataset.k = side + sel + (side === 'desktop' ? window.FmWorkbox?.deskKey?.(b) || '' : '');
      if (side !== 'browser') { fsOff(true); viewOff(); }
      if (side === 'browser') browserPanel(b); else if (side === 'desktop') window.FmWorkbox.botPanel(sbody, b); else if (side === 'routines') routinesPanel(b); else if (side === 'memory') memoryPanel(b); else profilePanel(b);
      ofr();
    }
    stabs.onclick = e => { const s = e.target.closest('[data-s]')?.dataset.s; if (!s) return; side = s; if (PANE) { paneTab.set(sel, s); paneSideSave(); } else localStorage.setItem('botSide', s); root.classList.toggle('bigview', !PANE && !!localStorage.getItem('botBig') && s === 'browser'); sideRender(); };

    // Browser: live frames from the bot's own Chrome, framed like a browser window (back / reload / address bar on top). It opens by itself
    // whenever the Browser tab is on screen, and clicks / keys on the page always go to it: no Take over box (2026-11-16)
    let vws = null, vid = '', dims = { w: 1280, h: 720 }, autoDone = false;
    const shutByUser = new Set(); // bots whose browser the user closed here: no auto-open until they open it again
    const sideVisible = () => shown() && !document.hidden && (PANE ? sopen : !narrow() || mview === 'side');
    function viewOff() { if (vws) { try { vws.close(); } catch {} } vws = null; vid = ''; }
    const IC = { back: '<path d="M10 3 5 8l5 5"/>', fwd: '<path d="m6 3 5 5-5 5"/>', reload: '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.5v3h-3"/>', full: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>', big: '<path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9"/>', x: '<path d="m4 4 8 8M12 4l-8 8"/>' };
    const ic = (k, t, c) => `<button type="button" class="bv-nb ${c || ''}" data-nav="${k}" title="${t}" aria-label="${t}"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg></button>`;
    function browserPanel(b) {
      sbody.innerHTML = `<div class="bv"><div class="bv-win">
        <form class="bv-bar">${ic('back', 'Back')}${ic('fwd', 'Forward')}${ic('reload', 'Reload')}<input class="bv-url" placeholder="Search or type a web address" spellcheck="false" autocomplete="off"><span class="bv-drive" hidden></span>${ic('big', 'Bigger view (the chat gets narrower)', 'bv-big')}${ic('full', 'Full screen (F11, Esc to leave)', 'bv-full')}${ic('x', 'Close the browser (logins stay saved)', 'bv-close')}</form>
        <div class="bv-screen"><canvas class="bv-c" tabindex="0" width="1280" height="720"></canvas><div class="bv-off"></div></div></div></div>`;
      const f = sbody.querySelector('.bv-bar');
      f.onsubmit = e => { e.preventDefault(); const u = f.querySelector('input'); browserOpen(b, u.value.trim()); u.blur(); };
      f.onclick = e => { const n = e.target.closest('[data-nav]')?.dataset.nav; if (!n) return; const bb = bots.get(b.id) || b;
        if (n === 'big') { root.classList.toggle('bigview'); localStorage.setItem('botBig', root.classList.contains('bigview') ? '1' : ''); }
        else if (n === 'full') fsToggle(b);
        else if (n === 'x') { shutByUser.add(b.id); api('/' + b.id + '/browser', { action: 'close' }).catch(() => {}); }
        else if (bb.browserOpen) api('/' + b.id + '/browser', { action: n === 'fwd' ? 'forward' : n }).catch(x => tip('Browser', x.message)); };
      wireInput(bq('.bv-c'));
      autoDone = false; browserBar(b); viewOn(b); autoOpen();
    }
    function autoOpen() { // once each time the Browser tab comes on screen
      const b = bots.get(sel); if (autoDone || side !== 'browser' || !b || !sideVisible()) return; autoDone = true;
      if (!b.browserOpen && b.browser !== false && browserReady && !shutByUser.has(b.id) && !b.paused) browserOpen(b, '', true);
    }
    function browserOpen(b, u, auto) {
      shutByUser.delete(b.id);
      const off = bq('.bv-off'); if (off && !b.browserOpen) off.innerHTML = `<div class="bv-msg"><span class="bv-spin"></span>Opening ${H(b.name)}'s browser…</div>`;
      if (opening.has(b.id) && !u) return; opening.add(b.id);
      api('/' + b.id + '/browser', { action: 'open', url: u })
        .then(() => { const bb = bots.get(b.id); if (bb && !bb.browserOpen) { bb.browserOpen = true; if (sel === b.id && side === 'browser') browserBar(bb); } })
        .catch(x => { if (!auto) tip('Browser', x.message, 'high'); opening.delete(b.id); if (sel === b.id && side === 'browser') browserBar(bots.get(b.id) || b, x.message); })
        .finally(() => opening.delete(b.id));
    }
    function browserBar(b, err) {
      const off = bq('.bv-off'); if (!off) return;
      const u = bq('.bv-url'); if (u && document.activeElement !== u) u.value = b.url && b.url !== 'about:blank' ? b.url : '';
      off.hidden = !!b.browserOpen;
      if (!b.browserOpen) off.innerHTML = opening.has(b.id) ? `<div class="bv-msg"><span class="bv-spin"></span>Opening ${H(b.name)}'s browser…</div>` : b.browser === false ? `<div class="bv-msg">${H(b.name)} has no browser. Turn it on in Profile.</div>`
        : !browserReady ? '<div class="bv-msg">The browser tool isn\'t installed in this Foreman.</div>'
        : `<div class="bv-msg">${C.draw(b.look, 'paused', { still: true })}<b>Browser closed</b><span>${err ? 'It didn\'t open: ' + H(err) : `Your logins stay saved. ${H(b.name)} opens it when it needs it.`}</span><button type="button" class="bt-btn bt-primary bv-open">Open browser</button></div>`;
      off.querySelector('.bv-open')?.addEventListener('click', () => browserOpen(b, ''));
      const d = bq('.bv-drive'); d.hidden = !(b.browserOpen && b.status === 'working'); d.textContent = `${b.name} is driving`;
      (fsEl || sbody).querySelectorAll('[data-nav="back"],[data-nav="fwd"],[data-nav="reload"],.bv-close').forEach(x => { x.disabled = !b.browserOpen; });
      if (b.browserOpen && vid === b.id && (!vws || vws.readyState > 1)) viewOn(b, true);
    }
    // Full screen: the whole window (an in-app overlay: works in the app, the browser and the phone). F11 or the button toggles, Esc leaves.
    let fsEl = null, fsHold = null, fsTimer = 0, fsRO = null, fsDims = null, fsAnim = null;
    const bq = q => (fsEl || sbody).querySelector(q);
    const fsViewport = (w, h) => { const bb = bots.get(sel); if (bb?.browserOpen) api('/' + sel + '/browser', { action: 'viewport', w, h }).catch(() => {}); };
    const fsSize = () => { const sc = fsEl?.querySelector('.bv-screen'); if (!sc) return; const r = sc.getBoundingClientRect(), v = FmBrowserCoords.viewportFor(r.width, r.height); clearTimeout(fsTimer); fsTimer = setTimeout(() => { if (fsEl) fsViewport(v.w, v.h); }, 250); };
    function fsToggle(b) { fsEl ? fsOff() : fsOn(b); }
    function fsOn(b) {
      const win = sbody.querySelector('.bv-win'); if (!win || fsEl || !(bots.get(b.id) || b).browserOpen) return;
      const r0 = win.getBoundingClientRect(); fsDims = { ...dims };
      fsHold = document.createElement('div'); fsHold.style.height = r0.height + 'px'; win.replaceWith(fsHold);
      fsEl = win; win.classList.add('bv-fs'); document.body.append(win); document.body.classList.add('bv-fsing');
      fsAnim?.cancel(); fsAnim = win.animate([{ top: r0.top + 'px', left: r0.left + 'px', width: r0.width + 'px', height: r0.height + 'px', borderRadius: '10px' }, { top: '0px', left: '0px', width: '100vw', height: '100vh', borderRadius: '0px' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
      const sc = win.querySelector('.bv-screen'); sc.style.aspectRatio = 'auto'; win.querySelector('.bv-full').classList.add('on'); win.querySelector('.bv-c').focus();
      fsRO = new ResizeObserver(fsSize); fsRO.observe(sc); setTimeout(fsSize, 300);
    }
    function fsOff(instant) {
      const win = fsEl; if (!win) return; fsEl = null; clearTimeout(fsTimer); fsRO?.disconnect(); fsRO = null;
      const hold = fsHold, back = fsDims; fsHold = null; fsDims = null;
      const done = () => { win.classList.remove('bv-fs'); win.style.cssText = ''; win.querySelector('.bv-full')?.classList.remove('on'); const sc = win.querySelector('.bv-screen'); if (sc) sc.style.aspectRatio = dims.w + ' / ' + dims.h; document.body.classList.remove('bv-fsing');
        if (hold?.isConnected) hold.replaceWith(win); else win.remove(); if (sbody.querySelector('.bv-c')) sbody.querySelector('.bv-c').focus?.(); };
      if (back) fsViewport(back.w, back.h); // the page goes back to the size it had
      const r1 = hold?.isConnected ? hold.getBoundingClientRect() : null;
      if (instant || !r1) return done();
      fsAnim?.cancel(); win.style.cssText = 'top:0;left:0;width:100vw;height:100vh';
      fsAnim = win.animate([{ top: '0px', left: '0px', width: '100vw', height: '100vh', borderRadius: '0px' }, { top: r1.top + 'px', left: r1.left + 'px', width: r1.width + 'px', height: r1.height + 'px', borderRadius: '10px' }], { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)' });
      fsAnim.onfinish = done; fsAnim.oncancel = () => {};
    }
    const fsKeys = e => { if (!fsEl) return; if (e.key === 'Escape' || e.key === 'F11') { e.preventDefault(); e.stopPropagation(); if (e.type === 'keydown') fsOff(); } };
    addEventListener('keydown', fsKeys, true); addEventListener('keyup', fsKeys, true); const fsGone = () => { fsOff(true); removeEventListener('keydown', fsKeys, true); removeEventListener('keyup', fsKeys, true); };
    function viewOn(b, again) {
      if (vid === b.id && vws && vws.readyState <= 1 && !again) return; viewOff(); vid = b.id;
      const cv = bq('.bv-c'), ctx = cv.getContext('2d');
      const w = vws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/bots/view?id=' + encodeURIComponent(b.id));
      let busy = false, next = null;
      const paint = async d => { busy = true; try { const img = new Image(); img.src = 'data:image/jpeg;base64,' + d.data; await img.decode();
        dims = { w: d.metadata?.deviceWidth || img.width, h: d.metadata?.deviceHeight || img.height };
        if (cv.width !== img.width || cv.height !== img.height) { cv.width = img.width; cv.height = img.height; if (!fsEl) cv.parentElement.style.aspectRatio = img.width + ' / ' + img.height; } ctx.drawImage(img, 0, 0); } catch {}
        busy = false; if (next) { const n = next; next = null; paint(n); } };
      w.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'frame') { if (busy) next = m; else paint(m); const o = bq('.bv-off'); if (o && !o.hidden && vid === b.id) o.hidden = true; }
        else if (m.type === 'url' && m.url) { const u = bq('.bv-url'); if (u && document.activeElement !== u) u.value = m.url === 'about:blank' ? '' : m.url; }
        else if (m.type === 'closed') { const bb = bots.get(b.id); if (bb) { bb.browserOpen = false; if (sel === b.id && side === 'browser') browserBar(bb); } }
        else if (m.type === 'open') { const bb = bots.get(b.id); if (bb && !bb.browserOpen) { bb.browserOpen = true; browserBar(bb); } } };
      w.onclose = () => { if (vws === w) vws = null; };
    }
    function wireInput(cv) {
      const send = m => { if (vws?.readyState === 1) vws.send(JSON.stringify(m)); };
      const pos = e => FmBrowserCoords.toPage(e.clientX, e.clientY, cv.getBoundingClientRect(), dims); // the frame is letterboxed inside the canvas box: map through the drawn frame, not the box
      const mods = e => (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
      const btn = e => ['left', 'middle', 'right'][e.button] || 'left';
      let lastMove = 0, held = '';
      cv.addEventListener('mousedown', e => { cv.focus(); e.preventDefault(); held = btn(e); send({ type: 'input_mouse', eventType: 'mousePressed', ...pos(e), button: btn(e), clickCount: e.detail || 1, modifiers: mods(e) }); });
      const up = e => { if (!held) return; held = ''; send({ type: 'input_mouse', eventType: 'mouseReleased', ...pos(e), button: btn(e), clickCount: e.detail || 1, modifiers: mods(e) }); };
      cv.addEventListener('mouseup', up); addEventListener('mouseup', e => { if (held && e.target !== cv) up(e); }); // released outside the view: still ends the drag
      addEventListener('mousemove', e => { if (!held || e.target === cv || Date.now() - lastMove < 40) return; lastMove = Date.now(); send({ type: 'input_mouse', eventType: 'mouseMoved', ...pos(e), button: held, modifiers: mods(e) }); }); // a drag leaving the view
      cv.addEventListener('mousemove', e => { if (Date.now() - lastMove < 40) return; lastMove = Date.now(); send({ type: 'input_mouse', eventType: 'mouseMoved', ...pos(e), button: held || 'none', modifiers: mods(e) }); });
      cv.addEventListener('wheel', e => { e.preventDefault(); send({ type: 'input_mouse', eventType: 'mouseWheel', ...pos(e), deltaX: e.deltaX, deltaY: e.deltaY }); }, { passive: false });
      cv.addEventListener('contextmenu', e => e.preventDefault());
      const key = (e, t) => { if (e.key === 'F11') { e.preventDefault(); if (t === 'keyDown') fsToggle(bots.get(sel)); return; } e.preventDefault(); e.stopPropagation(); const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey;
        send({ type: 'input_keyboard', eventType: t, key: e.key, code: e.code, windowsVirtualKeyCode: e.keyCode, modifiers: mods(e), ...(t === 'keyDown' && printable ? { text: e.key } : t === 'keyDown' && e.key === 'Enter' ? { text: '\r' } : {}) }); };
      cv.addEventListener('keydown', e => key(e, 'keyDown')); cv.addEventListener('keyup', e => key(e, 'keyUp'));
      cv.addEventListener('paste', e => { const t = e.clipboardData?.getData('text'); if (t) for (const ch of t.slice(0, 2000)) send({ type: 'input_keyboard', eventType: 'keyDown', key: ch, text: ch }); });
    }

    // Routines
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const schedText = s => !s ? '' : s.type === 'every' ? (s.minutes % 60 ? `Every ${s.minutes} min` : s.minutes === 60 ? 'Every hour' : s.minutes % 1440 ? `Every ${s.minutes / 60} hours` : s.minutes === 1440 ? 'Every day' : `Every ${s.minutes / 1440} days`)
      : s.type === 'once' ? 'Once · ' + new Date(s.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : (s.days?.length && s.days.length < 7 ? (s.days.join() === '1,2,3,4,5' ? 'Weekdays' : s.days.map(d => DAYS[d]).join(', ')) : 'Every day') + ' at ' + new Date('2000-01-01T' + s.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    function routinesPanel(b) {
      const rs = b.routines || [];
      sbody.innerHTML = `<div class="br"><div class="bs-h"><b>Routines</b><button type="button" class="bt-btn bt-primary br-add">+ Add</button></div>
        <p class="bs-p">Things ${H(b.name)} does on its own, on a schedule. Or just ask it in chat ("check this every morning").</p>
        ${rs.length ? rs.map(r => `<div class="br-r${r.enabled ? '' : ' off'}" data-r="${r.id}"><label class="bt-sw" title="On / off"><input type="checkbox" ${r.enabled ? 'checked' : ''}><i></i></label>
          <div class="br-t"><b>${H(r.name)}</b><span>${H(schedText(r.schedule))}${r.check?.url ? ' · only when ' + H(r.check.url.replace(/^https?:\/\//, '').slice(0, 40)) + ' changes' : ''}</span>
          ${r.enabled && r.nextRun ? `<span class="br-n">Next: ${new Date(r.nextRun).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>` : ''}${r.lastResult ? `<span class="br-l">Last: ${H(r.lastResult)}</span>` : ''}</div>
          <div class="br-a"><button type="button" class="bt-btn" data-run>Run now</button><button type="button" class="bt-btn" data-edit>Edit</button></div></div>`).join('') : '<div class="bs-none">No routines yet.</div>'}
        <div class="br-form" hidden></div></div>`;
      const save = list => api('/' + b.id + '/routines', { routines: list }).catch(x => tip('Not saved', x.message, 'high'));
      sbody.querySelector('.br-add').onclick = () => routineForm(b, null, save);
      sbody.querySelectorAll('.br-r').forEach(el => { const r = rs.find(x => x.id === el.dataset.r);
        el.querySelector('input').onchange = e => save(rs.map(x => x.id === r.id ? { ...x, enabled: e.target.checked } : x));
        el.querySelector('[data-run]').onclick = () => api('/' + b.id + '/run', { rid: r.id }).then(() => tip('Running', `${b.name}: ${r.name}`)).catch(x => tip('Not run', x.message, 'high'));
        el.querySelector('[data-edit]').onclick = () => routineForm(b, r, save); });
    }
    function routineForm(b, r, save) {
      const f = sbody.querySelector('.br-form'), s = r?.schedule || { type: 'daily', time: '08:00', days: [1, 2, 3, 4, 5] };
      const ev = s.type === 'every' ? s.minutes : 60, unit = ev % 60 === 0 ? 'h' : 'm';
      f.hidden = false; f.innerHTML = `<div class="bs-h"><b>${r ? 'Edit routine' : 'New routine'}</b></div>
        <label>Name<input class="rf-name" maxlength="60" value="${H(r?.name || '')}" placeholder="e.g. Morning check"></label>
        <label>What to do<textarea class="rf-prompt" rows="3" placeholder="e.g. Check the site is up and the sign-up page works">${H(r?.prompt || '')}</textarea></label>
        <label>When<select class="rf-type"><option value="daily">At a time of day</option><option value="every">Every …</option><option value="once">Once</option></select></label>
        <div class="rf-daily"><input type="time" class="rf-time" value="${s.time || '08:00'}"><div class="rf-days">${DAYS.map((d, i) => `<label><input type="checkbox" value="${i}" ${!s.days?.length || s.days.includes(i) ? 'checked' : ''}>${d[0]}</label>`).join('')}</div></div>
        <div class="rf-every"><input type="number" class="rf-n" min="1" value="${unit === 'h' ? ev / 60 : ev}"><select class="rf-u"><option value="m"${unit === 'm' ? ' selected' : ''}>minutes</option><option value="h"${unit === 'h' ? ' selected' : ''}>hours</option></select></div>
        <div class="rf-once"><input type="datetime-local" class="rf-at" value="${s.type === 'once' ? new Date(s.at - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}"></div>
        <label>Only when this page changes <span class="rf-opt">(optional)</span><input class="rf-url" value="${H(r?.check?.url || '')}" placeholder="https://… (checked without waking ${H(b.name)})"></label>
        <div class="rf-acts">${r ? '<button type="button" class="bt-btn rf-del">Delete</button>' : ''}<span></span><button type="button" class="bt-btn rf-cancel">Cancel</button><button type="button" class="bt-btn bt-primary rf-save">Save</button></div>`;
      const q = c => f.querySelector(c), ty = q('.rf-type'); ty.value = s.type;
      const vis = () => { q('.rf-daily').hidden = ty.value !== 'daily'; q('.rf-every').hidden = ty.value !== 'every'; q('.rf-once').hidden = ty.value !== 'once'; }; ty.onchange = vis; vis();
      q('.rf-cancel').onclick = () => { f.hidden = true; f.innerHTML = ''; };
      if (q('.rf-del')) q('.rf-del').onclick = () => { ask(`Delete the routine "${r.name}"?`, '', 'Delete', true).then(ok => ok && save((b.routines || []).filter(x => x.id !== r.id))); };
      q('.rf-save').onclick = () => {
        const t = ty.value, sch = t === 'daily' ? { type: 'daily', time: q('.rf-time').value || '08:00', days: [...f.querySelectorAll('.rf-days input:checked')].map(x => +x.value) }
          : t === 'every' ? { type: 'every', minutes: Math.round(+q('.rf-n').value * (q('.rf-u').value === 'h' ? 60 : 1)) } : { type: 'once', at: Date.parse(q('.rf-at').value) };
        const nr = { ...(r || {}), name: q('.rf-name').value, prompt: q('.rf-prompt').value, schedule: sch, enabled: r ? r.enabled : true, check: q('.rf-url').value.trim() ? { url: q('.rf-url').value.trim() } : null };
        save(r ? (b.routines || []).map(x => x.id === r.id ? nr : x) : [...(b.routines || []), nr]);
      };
      f.scrollIntoView({ block: 'nearest' }); q('.rf-name').focus();
    }

    // Memory
    async function memoryPanel(b) {
      sbody.innerHTML = `<div class="bm"><div class="bs-h"><b>Memory</b><span class="bm-st"></span></div><p class="bs-p">What ${H(b.name)} remembers between conversations (loaded every time). Edit it freely.</p>
        <textarea class="bm-t" spellcheck="false"></textarea><div class="rf-acts"><span class="bm-path"></span><button type="button" class="bt-btn bt-primary bm-save">Save</button></div>
        <div class="bs-h"><b>Today</b><span class="bm-day"></span></div><pre class="bm-log"></pre></div>`;
      try { const j = await api('/' + b.id + '/memory'); if (sel !== b.id || side !== 'memory') return;
        sbody.querySelector('.bm-t').value = j.text; sbody.querySelector('.bm-path').textContent = j.path; sbody.querySelector('.bm-log').textContent = j.log || 'Nothing yet today.'; sbody.querySelector('.bm-day').textContent = j.day || '';
      } catch (x) { tip('Memory', x.message, 'high'); }
      sbody.querySelector('.bm-save').onclick = () => api('/' + b.id + '/memory', { text: sbody.querySelector('.bm-t').value }).then(() => { const s = sbody.querySelector('.bm-st'); if (s) { s.textContent = 'Saved'; setTimeout(() => { s.textContent = ''; }, 1500); } }).catch(x => tip('Not saved', x.message, 'high'));
    }

    function profilePanel(b) {
      sbody.innerHTML = ''; const f = profileForm(b, false); sbody.append(f);
      f.onsubmit = e => { e.preventDefault(); api('/' + b.id + '/edit', f.getData()).then(() => tip('Saved', b.name)).catch(x => tip('Not saved', x.message, 'high')); };
      const more = document.createElement('div'); more.className = 'bp-danger';
      more.innerHTML = `<button type="button" class="bt-btn" data-a="clear">New conversation</button><button type="button" class="bt-btn" data-a="pause">${b.paused ? 'Resume' : 'Pause'}</button><button type="button" class="bt-btn" data-a="dup">Duplicate</button><button type="button" class="bt-btn bt-danger" data-a="del">Delete</button>`;
      more.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a) act(b.id, a); };
      sbody.append(more);
    }
    if (!PANE) addEventListener('resize', () => { if (!narrow() && mview === 'side' && sel) { mview = 'chat'; renderOpen(); } });
    addEventListener('fm-workbox', () => { if (sel && bots.get(sel)) sideRender(true); }); // Workbox on/off or a screen opened: Desktop tab appears / redraws (workbox.js)
    // the browser view only streams while this view is on screen with its browser tab showing
    const tick = setInterval(() => { const on = side === 'browser' && sideVisible(); if (!on) { autoDone = false; fsOff(true); if (vws) viewOff(); return; } autoOpen(); const b = bots.get(sel); if (!vws && b?.browserOpen) viewOn(b); }, 1000);
    const v = {
      get id() { return sel; }, get host() { return host; }, el: view, shown, open, shut, close, renderOpen, renderChat, streamPaint, markRead, showSide, grow,
      gone() { if (PANE) unpin(g, sel, true); else close(); },
      lost() { host = null; sec.append(view); close(); },
      onBot(b, was) { header(); if (was?.status !== b.status) streamPaint(); if (was?.status !== b.status || was?.browserOpen !== b.browserOpen || JSON.stringify(was?.routines) !== JSON.stringify(b.routines)) sideRender(true); },
      onLog(e) { appendEntry(e); markRead(); },
      onCard(c) { const el = main.querySelector(`[data-card="${c.id}"]`); if (el) el.outerHTML = cardHtml(c); },
      onUrl(u) { if (side === 'browser') { const x = sbody.querySelector('.bv-url'); if (x && document.activeElement !== x) x.value = u && u !== 'about:blank' ? u : ''; } },
      focus() { view.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); view.classList.remove('bflash'); void view.offsetWidth; view.classList.add('bflash'); setTimeout(() => view.classList.remove('bflash'), 900); main.querySelector('.bt-in2')?.focus({ preventScroll: true }); },
      destroy() { fsGone(); clearInterval(tick); viewOff(); views.delete(v); view.remove(); },
    };
    views.add(v); return v;
  }
  const pop = makeView();

  // ---------- desk panes: botDesk = { page: [bot ids] } in the order they were put down ----------
  const desk = lsObj('botDesk');
  const deskSave = () => localStorage.setItem('botDesk', JSON.stringify(desk));
  const allowed = (g, id) => { const b = bots.get(id); return !!b && !b.archived && g !== 'home' && (b.pages || []).includes(g); };
  const deskOf = g => (Array.isArray(desk[g]) ? desk[g] : []).filter(id => !loaded || allowed(g, id));
  const panes = new Map(); // g|id -> view
  function paneFor(g, id) { const k = g + '|' + id; let v = panes.get(k); if (!v) { v = makeView(g); panes.set(k, v); v.open(id); } return v; }
  const relayout = () => { try { const b = window.paneSnap?.(); window.renderPanesLayout?.(b); } catch {} };
  // a bot card / pane carried by the shared desk carry (index.html deskCarry, same as agents: 2026-11-17). Its pane is made when the
  // card is pulled off the stack and rides along as the carried pane; let go on the desk it stays (desk[g]), over the stack it folds back.
  let carry = ''; // g|id whose pane is in the hand but not on a desk yet (deskSync leaves it alone)
  function carryBot(e, g, id, from, src) {
    const z = document.querySelector(`.dkzone[data-g="${g}"]`), box = z?.parentElement?.querySelector(':scope > .apanes'), list = z?.querySelector('.bdeck .bk-list'), k = g + '|' + id;
    if (!box || !bots.has(id) || !allowed(g, id) || narrow() || !window.deskCarry) return false;
    const cardOf = () => document.querySelector(`.dkzone[data-g="${g}"] .bdeck .bk-list > [data-bot="${id}"]:not(.pgone)`);
    return !!window.deskCarry(e, { key: 'bot:' + id, from, src, g, box, zone: z, deck: z.querySelector('.bdeck'), log: '.bt-log',
      p: from === 'pane' ? panes.get(k)?.el : null,
      pane: () => { carry = k; const v = paneFor(g, id); if (v.el.parentNode !== box) box.append(v.el); return v.el; },
      ghost: () => { const c = newCard(), r = src.matches('.bk-card') ? src.getBoundingClientRect() : null; paintBot(c, bots.get(id), false, false); c.classList.remove('dnew'); c.classList.add('bk-carry'); return { el: c, w: r?.width || list?.clientWidth || 200, h: r?.height || 46 }; },
      lift: card => { card.classList.add('lifted'); stackPlace(list); }, // the others close up
      over: D => { const c = D.card; if (!c || c.classList.contains('landing') === D.over) return; c.classList.toggle('landing', D.over); c.classList.toggle('lifted', !D.over); stackPlace(list); }, // back over the stack: its slot opens again
      toZone: D => {
        carry = '';
        if (D.card) { const v = panes.get(k); if (v && !deskOf(g).includes(id)) { panes.delete(k); v.destroy(); } relayout(); D.card.classList.remove('lifted'); D.card.classList.add('landing'); stackPlace(list);
          window.deskGhostLand(D.gh, D.card, D.cw, D.ch, () => { D.card.classList.remove('landing'); FmPile.thud(D.card); }); return; }
        desk[g] = deskOf(g).filter(x => x !== id); if (!desk[g].length) delete desk[g]; deskSave(); // a desk pane carried back: off the desk, its card is dealt back into its slot
        const v = panes.get(k); panes.delete(k); v?.destroy(); landing.add(k); decks(); relayout();
        window.deskGhostLand(D.gh, cardOf(), D.cw, D.ch, () => { landing.delete(k); decks(); FmPile.thud(cardOf()); });
      },
      toDesk: D => { carry = ''; if (!deskOf(g).includes(id)) { desk[g] = [...deskOf(g), id]; deskSave(); } D.card?.remove();
        if (pop.id === id && pop.host?.querySelector(`.dkzone[data-g="${g}"]`)) pop.close(); // its popup on this page becomes the pane
        decks(); const lg = panes.get(k)?.el.querySelector('.bt-log'); if (lg) window.stickScroll?.(lg).pin(); },
    });
  }
  window.botOnDesk = id => loaded ? Object.keys(desk).some(g => deskOf(g).includes(id)) : undefined; // index.html deckSave keeps 'bot:<id>' in the desk order while it is on a desk
  function unpin(g, id, quiet) { // ✕ on a pane: its card is dealt back first (the others open its slot), then the pane flies into it and the card lands
    desk[g] = deskOf(g).filter(x => x !== id); if (!desk[g].length) delete desk[g]; deskSave();
    const k = g + '|' + id, v = panes.get(k); if (!v) { decks(); return; }
    const done = () => { const b = window.paneSnap?.(); panes.delete(k); v.destroy(); try { window.renderPanesLayout?.(b); } catch {} decks(); };
    const vr = v.el.getBoundingClientRect();
    if (quiet || !vr.width || RM.matches) return done();
    landing.add(k); decks();
    const card = document.querySelector(`.dkzone[data-g="${g}"] .bdeck .bk-list > [data-bot="${id}"]:not(.pgone)`), fr = card?.getBoundingClientRect();
    const land = () => { landing.delete(k); done(); const c = document.querySelector(`.dkzone[data-g="${g}"] .bdeck .bk-list > [data-bot="${id}"]:not(.pgone)`); FmPile.thud(c); };
    if (!fr?.width) return land();
    v.el.style.transformOrigin = '0 0'; v.el.style.zIndex = 5; v.el.style.pointerEvents = 'none';
    const an = v.el.animate([{ opacity: 1, transform: 'none' }, { opacity: .2, transform: `translate(${fr.left - vr.left}px,${fr.top - vr.top}px) scale(${fr.width / vr.width},${fr.height / vr.height})` }], { duration: 300, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    an.onfinish = land;
  }
  const AGP = g => { try { return AG_PAGES.some(p => p.g === g); } catch { return true; } };
  function deskSync() { // bots removed / taken off a page / the page itself gone: their panes go; then the desk relays out
    if (!loaded) return; let ch = false;
    for (const g of Object.keys(desk)) { const keep = AGP(g) ? deskOf(g) : []; if (keep.length !== (desk[g] || []).length) { if (keep.length) desk[g] = keep; else delete desk[g]; ch = true; } }
    for (const [k, v] of panes) { const [g, id] = k.split('|'); if (k !== carry && !deskOf(g).includes(id)) { panes.delete(k); v.destroy(); ch = true; } }
    if (ch) deskSave();
    if (ch || Object.keys(desk).some(g => deskOf(g).some(id => !panes.has(g + '|' + id)))) relayout();
  }
  // index.html renderPanesLayout asks for each page's bot panes and lays them out with the agent panes (after them, in the order put down)
  window.botPinned = id => !!bots.get(id)?.pinned; // the pin is the host's (b.pinned); index.html asks for it when it lays the grid out
  window.botUndesk = (g, id) => { if (deskOf(g).includes(id)) unpin(g, id); }; // the grid is full: this bot goes back to the stack
  window.botPanes = g => loaded ? deskOf(g).map(id => paneFor(g, id).el) : [];

  // Profile (also the New bot form)
  function lookPicker(look) {
    const w = document.createElement('div'); w.className = 'bp-look';
    const paint = () => { w.innerHTML = `<div class="bp-big">${C.draw(look, 'idle')}</div><div class="bp-opts">
      <div class="bp-row">${C.BODIES.map(k => `<button type="button" class="bp-o${look.body === k ? ' on' : ''}" data-body="${k}" title="${k}">${C.draw({ ...look, body: k, acc: 'none' }, 'idle', { still: true })}</button>`).join('')}</div>
      <div class="bp-row">${C.COLORS.map(c => `<button type="button" class="bp-c${look.color === c ? ' on' : ''}" data-color="${c}" style="--c:${c}" title="${c}"></button>`).join('')}</div>
      <div class="bp-row">${C.ACCS.map(a => `<button type="button" class="bp-o${look.acc === a ? ' on' : ''}" data-acc="${a}" title="${a}">${a === 'none' ? '<span class="bp-none">none</span>' : C.draw({ ...look, acc: a }, 'idle', { still: true })}</button>`).join('')}</div>
      <button type="button" class="bt-btn bp-shuf">Shuffle</button></div>`; };
    w.onclick = e => { const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.body) look.body = t.dataset.body; else if (t.dataset.color) look.color = t.dataset.color; else if (t.dataset.acc) look.acc = t.dataset.acc; else if (t.classList.contains('bp-shuf')) Object.assign(look, C.random()); else return;
      paint(); };
    paint(); return w;
  }
  function profileForm(b, isNew) {
    const f = document.createElement('form'); f.className = 'bp'; f.autocomplete = 'off';
    const look = { ...(b.look || C.random()) };
    f.innerHTML = `<div class="bp-lk"></div>
      <label>Name<input name="name" maxlength="32" value="${H(b.name || '')}" placeholder="e.g. Scout" required></label>
      <label>Job <span class="rf-opt">one line</span><input name="job" maxlength="120" value="${H(b.job || '')}" placeholder="e.g. Watches our site and tells me when something breaks"></label>
      <label>Personality <span class="rf-opt">optional</span><input name="personality" maxlength="120" value="${H(b.personality || '')}" placeholder="e.g. cheerful and brief"></label>
      <label>Instructions <span class="rf-opt">how it should do the job</span><textarea name="instructions" rows="6" placeholder="What it does, what to watch, what good looks like, what never to do…">${H(b.instructions || '')}</textarea></label>
      <div class="bp-sec"><b>Where it works</b><p class="bs-p bp-where">${b.page && pageList.some(p => p.id === b.page) ? `On the page <b>${H(pageName(b.page))}</b>, in its folder (${H(pageList.find(p => p.id === b.page).folder || '')}). A bot belongs to the page it was made on.` : 'Not on a page yet.'}</p></div>
      <div class="bp-sec"><b>What it may do</b>
      <div class="bp-2"><label>Model<select name="model">${MODELS.map(([v, l]) => `<option value="${v}"${(b.model || 'sonnet') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Access<select name="level">${LEVELS.map(([v, l]) => `<option value="${v}"${(b.level || 'auto') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <p class="bs-p bp-lvl"></p>
      <label class="bp-ck"><input type="checkbox" name="browser" ${b.browser !== false ? 'checked' : ''}> Own browser (a real Chrome you can watch and use yourself)</label>
      <label class="bp-ck"><input type="checkbox" name="askSend" ${b.askSend !== false ? 'checked' : ''}> Ask me before sending, posting, buying or deploying anything</label>
      <label class="bp-ck"><input type="checkbox" name="chief" ${b.chief ? 'checked' : ''}> Team lead (hands work to the other bots and can add new ones)</label></div>
      <div class="bp-sec bp-op" hidden></div><div class="bp-sec bp-mail" hidden></div>
      <div class="rf-acts">${isNew ? '<button type="button" class="bt-btn bp-cancel">Cancel</button>' : ''}<span></span><button class="bt-btn bt-primary" type="submit">${isNew ? 'Create bot' : 'Save'}</button></div>`;
    f.querySelector('.bp-lk').append(lookPicker(look));
    const E = n => f.elements.namedItem(n); f.E = E; // (f.name is the form's own name, so fields go through elements)
    const lvl = () => { f.querySelector('.bp-lvl').textContent = LEVELS.find(l => l[0] === E('level').value)[2]; }; E('level').onchange = lvl; lvl();
    opVaults(f, b);
    f.getData = () => ({ name: E('name').value, job: E('job').value, personality: E('personality').value, instructions: E('instructions').value, model: E('model').value, level: E('level').value,
      browser: E('browser').checked, askSend: E('askSend').checked, chief: E('chief').checked, look,
      ...(f.querySelector('.bp-op:not([hidden])') ? { vaults: [...f.querySelectorAll('input[name=opv]:checked')].map(x => x.value) } : {}),
      ...(f.querySelector('.bp-mail:not([hidden])') ? { mailboxes: [...f.querySelectorAll('input[name=mbx]:checked')].map(x => x.value) } : {}) });
    return f;
  }
  // 1Password vaults this bot may use (Settings → Connectors → 1Password); the section only shows once 1Password is connected
  function opVaults(f, b) {
    const mine = new Set(b.vaults || []), myBoxes = new Set(b.mailboxes || []);
    fetch('/api/connectors', { cache: 'no-store' }).then(r => r.json()).then(j => {
      // Migadu mailboxes this bot may read and send from (Settings → Connectors → Migadu)
      const mbx = j.google?.providers?.find(p => p.id === 'migadu')?.mailboxes || [], mb = f.querySelector('.bp-mail');
      if (mb && mbx.length) { mb.innerHTML = `<b>Migadu mailboxes</b><p class="bs-p">Mailboxes it may read and send from. Emailing anyone but you still needs your approval.</p><div class="bp-pages">${mbx.map(m => `<label class="bp-ck"><input type="checkbox" name="mbx" value="${H(m.id)}" ${myBoxes.has(m.id) ? 'checked' : ''}> ${H(m.email)}</label>`).join('')}</div>`; mb.hidden = false; }
      const o = j.onepassword, box = f.querySelector('.bp-op'); if (!box || !o?.connected) return;
      o.vaults = o.vaults.filter(v => v.on !== false); // vaults switched off in Settings → Connectors → 1Password are not offered
      box.innerHTML = `<b>1Password</b><p class="bs-p">Vaults it may use to sign in to sites and run tools with API keys. It never sees the values.</p>`
        + (o.vaults.length ? `<div class="bp-pages">${o.vaults.map(v => `<label class="bp-ck"><input type="checkbox" name="opv" value="${H(v.id)}" ${mine.has(v.id) ? 'checked' : ''}> ${H(v.title)}</label>`).join('')}</div>` : '<p class="bs-p">No vaults allowed. Turn some on in Settings → Connectors → 1Password.</p>');
      box.hidden = false;
    }).catch(() => {});
  }
  function act(id, a) {
    const b = bots.get(id); if (!b) return;
    if (a === 'pin') api('/' + id + '/edit', { pinned: !b.pinned });
    else if (a === 'pause') api('/' + id + '/edit', { paused: !b.paused });
    else if (a === 'clear') ask(`Start a new conversation with ${b.name}?`, 'Its memory stays.', 'New conversation').then(ok => ok && api('/' + id + '/clear', {}));
    else if (a === 'dup') api('/' + id + '/duplicate', {}).then(j => pop.open(j.id, pageSec(j.pages?.[0] || b.pages?.[0]))).catch(x => tip('Not duplicated', x.message, 'high'));
    else if (a === 'del') ask(`Delete ${b.name}?`, 'Its chat, memory, routines and saved browser logins are removed.', 'Delete', true).then(ok => ok && api('/' + id + '/delete', {}).catch(x => tip('Not deleted', x.message, 'high')));
    else if (a === 'profile') { const v = [...panes.values()].find(x => x.id === id && x.shown()); if (v) v.showSide('profile'); else { pop.open(id); pop.showSide('profile'); } }
  }
  function botMenu(id, x, y, right) {
    const b = bots.get(id); if (!b) return; menu.classList.remove('bm-add');
    menu.innerHTML = [['pin', b.pinned ? 'Unpin' : 'Pin'], ['profile', 'Edit profile'], ['clear', 'New conversation'], ['pause', b.paused ? 'Resume' : 'Pause'], ['dup', 'Duplicate'], ['del', 'Delete…']].map(([a, l]) => `<button type="button" data-a="${a}"${a === 'del' ? ' class="bt-danger"' : ''}>${l}</button>`).join('');
    menu.hidden = false; const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, right ? x - r.width : x)) + 'px'; menu.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, y)) + 'px';
    menu.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; menu.hidden = true; if (a) act(id, a); };
  }
  addEventListener('mousedown', e => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape') { menu.hidden = true; if (!modal.hidden) closeModal(); } });

  // New bot: pick a template, then the profile form. opts.page (required) = the work page it is made on: the bot lives there and works in that page's folder.
  let asking = null; // the open in-app confirm's resolver (closing the modal any way = No)
  function closeModal() { modal.hidden = true; modal.innerHTML = ''; const r = asking; asking = null; r?.(false); }
  function ask(title, text, okLabel, danger) { // in-app confirm (no native Windows dialog; 2026-11-16)
    closeModal(); modal.hidden = false;
    modal.innerHTML = `<div class="bt-mb"></div><div class="bt-mp bt-ask"><div class="bs-h"><b>${H(title)}</b></div>${text ? `<p class="bs-p">${H(text)}</p>` : ''}
      <div class="bt-ask-b"><button type="button" class="bt-btn" data-no>Cancel</button><button type="button" class="bt-btn ${danger ? 'bt-dangerb' : 'bt-primary'}" data-yes>${H(okLabel || 'OK')}</button></div></div>`;
    return new Promise(res => { asking = res;
      const done = v => { asking = null; res(v); closeModal(); };
      modal.querySelector('.bt-mb').onclick = () => done(false); modal.querySelector('[data-no]').onclick = () => done(false); modal.querySelector('[data-yes]').onclick = () => done(true);
      setTimeout(() => modal.querySelector('[data-yes]')?.focus(), 30); });
  }
  const BLANK = { key: 'blank', name: '', job: '' }; // always offered, even when the template list did not load
  const tplCards = () => (templates.some(t => t.key === 'blank') ? templates : [...templates, BLANK]).map(t => `<button type="button" class="bt-tpl" data-tpl="${t.key}"><span class="bt-tav">${t.look ? C.draw(t.look, 'idle', { still: true }) : '<span class="bt-plus">+</span>'}</span><b>${H(t.name || 'Start from scratch')}</b><span>${H(t.job || 'Your own bot, your own job')}</span></button>`).join('');
  // The page section a new/duplicated bot opens in. pop.open(id) with no section falls back to Home: that sent the view to Home after creating a bot on a work page.
  const pageSec = g => document.getElementById('s-pg-' + g) || undefined;
  function newBot(opts = {}) {
    if (!opts.page || !pageList.some(p => p.id === opts.page)) return tip('Open a work page first', 'Bots live on a page: open the page and use + Add a bot.', 'high');
    modal.hidden = false;
    const where = ` It will work on ${H(pageName(opts.page))}, in that page's folder.`;
    const step2 = key => {
      const t = templates.find(x => x.key === key) || {};
      modal.innerHTML = `<div class="bt-mb"></div><div class="bt-mp"><div class="bs-h"><b>${t.name ? 'New ' + H(t.name) : 'New bot'}</b><button type="button" class="bt-x">✕</button></div></div>`;
      const f = profileForm({ name: t.name || '', job: t.job || '', personality: t.personality || '', look: t.look || C.random(), chief: false, page: opts.page }, true);
      if (key && key !== 'blank') { f.E('instructions').placeholder = 'Uses the ready-made instructions for this bot. Type here to replace them.'; f.E('chief').checked = key === 'chief'; }
      modal.querySelector('.bt-mp').append(f);
      modal.querySelector('.bt-x').onclick = closeModal; modal.querySelector('.bt-mb').onclick = closeModal; f.querySelector('.bp-cancel').onclick = closeModal;
      f.onsubmit = e => { e.preventDefault(); const d = f.getData(); if (!d.instructions.trim() && key && key !== 'blank') delete d.instructions;
        api('', { ...d, page: opts.page, template: key || 'blank' }).then(j => { closeModal(); pop.open(j.id, pageSec(opts.page)); }).catch(x => tip('Not created', x.message, 'high')); };
      setTimeout(() => f.E('name').focus(), 30);
    };
    modal.innerHTML = `<div class="bt-mb"></div><div class="bt-mp wide"><div class="bs-h"><b>New bot</b><button type="button" class="bt-x">✕</button></div>
      <details class="bt-howd"><summary>What is a bot?</summary>${HOW}</details>
      <p class="bs-p">Start from a ready-made teammate or from scratch. You can change everything later.${where}</p><div class="bt-tpls">${tplCards()}</div></div>`;
    // The first load can fail (signed out, offline, server still starting) and nothing retried it: the dialog then showed no templates and no way to add a bot. Load again now; always offer from scratch.
    const grid = modal.querySelector('.bt-tpls');
    if (!templates.length) {
      grid.innerHTML = tplCards() + '<p class="bs-p">Loading ready-made bots…</p>';
      loadBots().then(() => { if (grid.isConnected) grid.innerHTML = tplCards(); }).catch(x => { if (grid.isConnected) grid.innerHTML = tplCards() + `<p class="bs-p">Could not load the ready-made bots (${H(x.message)}). You can still start from scratch.</p>`; });
    }
    modal.querySelector('.bt-x').onclick = closeModal; modal.querySelector('.bt-mb').onclick = closeModal;
    grid.onclick = e => { const t = e.target.closest('[data-tpl]'); if (t) step2(t.dataset.tpl); };
  }


  // ---------- start ----------
  window.FmBots = { open: (id, at) => pop.open(id, at), close: () => pop.close(), newBot, list: () => [...bots.values()], pages: () => pageList,
    unpinAll: g => deskOf(g).forEach(id => unpin(g, id)), pinned: g => deskOf(g) };
  const loadBots = () => api('').then(j => { templates = j.templates; browserReady = j.browserReady; if (j.pageList) pageList = j.pageList; if (!bots.size) bots = new Map(j.bots.map(b => [b.id, b])); loaded = true; everywhere(); deskSync(); relayout(); });
  loadBots().catch(() => {});
  connect();
})();
