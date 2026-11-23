// Settings page (gear, top right): a full page under the top bar. Left: three sections (2026-11-15); right: the open one.
// 1. Accounts: centered rows of logo tiles, AI providers on top (aiaccounts.js draws the picked provider's card), Connectors under it
//    (connectors.js: GitHub). Clicking a tile opens its settings in a popup over the page (2026-11-15); ×, Esc or a click outside closes it.
// 2. Agent rules: how agent panes behave. 3. Updates, always last (index.html's #setMenu version / Check for updates block; the update pill opens it).
// index.html's setOpen(v, section) opens/closes it (section: 'accounts' | 'agents' | 'general', or a tile id like 'github'); Esc or ← closes.
// Folder access was removed (2026-11-15). The open section is remembered; the popup only opens on a click (or setOpen with a tile id).
(() => {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'settings.css?v=8'; document.head.appendChild(css);
  const img = src => `<img src="${src}" alt="" width="34" height="34" onerror="this.style.visibility='hidden'">`;
  const ROWS = [
    { id: 'acct', name: 'Your account', mod: 'FmAccount', items: [{ id: 'underglow', name: 'UnderGlow', icon: img('logo.svg') }] },
    { id: 'prov', name: 'AI providers', mod: 'FmAI', items: [
      { id: 'anthropic', name: 'Claude', icon: img('logos/providers/anthropic.svg') },
      { id: 'codex', name: 'Codex', icon: img('logos/providers/openai.svg') },
      { id: 'cursor', name: 'Cursor', icon: img('logos/providers/cursor.svg') }] },
    { id: 'conn', name: 'Connectors', mod: 'FmConnectors', items: [
      { id: 'github', name: 'GitHub', icon: img('logos/connectors/github.svg') },
      ...[['gmail', 'Google', 'gmail'], ['zoho', 'Zoho Mail', 'zoho'], ['outlook', 'Outlook', 'microsoftoutlook'], ['yahoo', 'Yahoo', 'yahoo'], ['icloud', 'iCloud', 'icloud'], ['aol', 'AOL', 'aol'], ['migadu', 'Migadu', 'migadu']].map(([id, name, f]) => ({ id: 'mail-' + id, name, icon: img('logos/connectors/' + f + '.svg') })),
      { id: 'cal', name: 'Calendar', icon: img('logos/connectors/calendar.svg') },
      { id: 'onepassword', name: '1Password', icon: img('logos/connectors/1password.svg') },
      { id: 'supabase', name: 'Supabase', icon: img('logos/connectors/supabase.svg') },
      { id: 'render', name: 'Render', icon: img('logos/connectors/render.svg') },
      { id: 'resend', name: 'Resend', icon: img('logos/connectors/resend.svg') },
      { id: 'stripe', name: 'Stripe', icon: img('logos/connectors/stripe.svg') },
      { id: 'twitch', name: 'Twitch', icon: img('logos/connectors/twitch.svg') },
      { id: 'youtube', name: 'YouTube', icon: img('logos/connectors/youtube.svg') }] },
  ].filter(r => window[r.mod]);
  const TILES = ROWS.flatMap(r => r.items.map(t => ({ ...t, key: r.id + ':' + t.id, row: r }))); // key is unique per row
  const tileKey = id => TILES.find(x => x.key === id)?.key || TILES.find(x => x.id === id)?.key || null; // setOpen('github') etc. still work
  const SECTIONS = [
    { id: 'accounts', name: 'Accounts', sub: 'AI providers and connectors' },
    { id: 'agents', name: 'Agent rules', sub: 'How agents behave' },
    { id: 'devices', name: 'This device', sub: 'Host or client' },
    ...(window.FmWorkbox ? [{ id: 'addons', name: 'Add-ons', sub: 'Workbox and Android emulator' }] : []), // workbox.js mountAddons: optional, nothing installed until picked // devicerole.js: switch this computer between host and client
    { id: 'general', name: 'Updates', sub: 'Version and updates' }, // keep last
  ];
  const page = document.createElement('div'); page.id = 'setPage'; page.hidden = true; page.setAttribute('role', 'dialog'); page.setAttribute('aria-label', 'Settings');
  page.innerHTML = `<aside class="sp-nav"><div class="sp-top"><button class="sp-back" id="spBack" title="Close settings (Esc)" aria-label="Close settings">←</button><b>Settings</b></div>
    ${SECTIONS.map(s => `<button class="sp-item" data-s="${s.id}"><b>${s.name}</b><span>${s.sub}</span></button>`).join('')}</aside>
    <main class="sp-main">${SECTIONS.map(s => `<section class="sp-sec" data-s="${s.id}" hidden><h1>${s.name}</h1><div class="sp-body"></div></section>`).join('')}</main>`;
  document.body.append(page);
  const body = id => page.querySelector(`.sp-sec[data-s="${id}"] .sp-body`);
  // Accounts: tile rows; the popup (.sx-pop) holds one panel per row that the module draws into
  body('accounts').innerHTML = ROWS.map(r => `<div class="sx-row" data-r="${r.id}"><h2>${r.name}</h2>
    <div class="sx-tiles">${r.items.map(t => `<button class="sx-tile" data-t="${r.id}:${t.id}" aria-haspopup="dialog"><span class="sx-ic">${t.icon}<i class="sx-dot" hidden></i></span><span class="sx-nm">${t.name}</span></button>`).join('')}</div></div>`).join('');
  const pop = document.createElement('div'); pop.className = 'sx-pop'; pop.hidden = true;
  pop.innerHTML = `<div class="sx-dlg" role="dialog" aria-modal="true"><div class="sx-dh"><span class="sx-dic"></span><b></b><button class="sx-x" title="Close (Esc)" aria-label="Close">×</button></div>
    ${ROWS.map(r => `<div class="sx-panel" data-r="${r.id}" hidden></div>`).join('')}</div>`;
  page.append(pop);
  const panel = r => pop.querySelector(`.sx-panel[data-r="${r}"]`);
  if (window.FmAI) window.FmAI.mount(panel('prov'));
  if (window.FmConnectors) window.FmConnectors.mount(panel('conn'));
  if (window.FmAccount) window.FmAccount.mount(panel('acct'));
  if (window.FmDeviceRole) window.FmDeviceRole.mount(body('devices'));
  if (window.FmHostFollowSettings) window.FmHostFollowSettings(body('devices'));
  const wbx = window.FmWorkbox && body('addons') ? window.FmWorkbox.mountAddons(body('addons')) : null; // Add-ons (workbox.js): Android card + Workbox panel, polls only while open // host follows client: toggle + Update host now
  const menu = document.getElementById('setMenu'); if (menu) body('general').append(menu); // setDraw keeps drawing into it
  // Agent rules: "Dock agents automatically" (localStorage agAutoDock, read by deckwatch.js; shared by every HUD through the server). On: working agents fold onto the pile.
  { const el = body('agents'), on = () => localStorage.getItem('agAutoDock') !== '0';
    el.innerHTML = `<label class="sg-row"><span><b>Dock agents automatically</b><span class="sa-dim">When an agent starts working it folds onto the pile by itself. Off: agents stay on the desk until you drag them onto the pile. Agents come back out when they stop working or need you.</span></span><input type="checkbox" class="sg-sw" role="switch"></label>`;
    const cb = el.querySelector('input'); cb.checked = on();
    addEventListener('fm-autodock', () => { cb.checked = on(); }); // changed on another HUD (index.html autoDockSet)
    cb.onchange = () => { try { localStorage.setItem('agAutoDock', cb.checked ? '1' : '0'); } catch {} if (typeof send === 'function') send({ t: 'autodock', on: cb.checked }); // shared: every HUD (server.mjs)
      if (typeof renderPanesLayout === 'function') renderPanesLayout(); }; }

  // Agent rules: "Save sessions for restore" (server.mjs /api/autoresume, host only: a client controls the host's setting). Default on.
  { const el = body('agents'), row = document.createElement('div');
    row.innerHTML = `<label class="sg-row"><span><b>Save agent and bot sessions for restore</b><span class="sa-dim">Keeps each agent and bot session (its Claude session, folder, page, state and last task) as it changes, so nothing is lost if the app quits or crashes. After a restart they show as restored, but nothing is started by itself: open one and send a message and it continues where it left off, after re-checking its files. Off: a session that was working when the app stopped is just left idle.</span></span><input type="checkbox" class="sg-sw" role="switch" checked></label>`;
    el.append(row); const cb = row.querySelector('input');
    fetch('/api/autoresume').then(r => r.json()).then(j => { cb.checked = j.on !== false; }).catch(() => {});
    cb.onchange = () => fetch('/api/autoresume', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify({ on: cb.checked }) }).then(r => r.json()).then(j => { cb.checked = j.on !== false; }).catch(() => { cb.checked = !cb.checked; }); }

  // Green dot on a tile = connected (from the modules' last loaded state; they call dots() after every draw)
  function dots() {
    const ai = window.FmAI?.state?.(), cn = window.FmConnectors?.state?.();
    const ok = {
      'acct:underglow': !!window.FmAccount?.state?.()?.signedIn,
      'prov:anthropic': !!ai?.providers?.find(p => p.id === 'anthropic')?.connected,
      'prov:codex': !!ai?.providers?.find(p => p.id === 'codex')?.connected,
      'prov:cursor': !!ai?.providers?.find(p => p.id === 'cursor')?.connected,
      'conn:github': !!cn?.github?.accounts?.some(a => a.active && a.ok),
      ...Object.fromEntries((cn?.google?.providers || []).map(x => ['conn:mail-' + x.id, !!x.email])),
      'conn:cal': !!cn?.google?.calendar,
      'conn:onepassword': !!cn?.onepassword?.connected,
      'conn:supabase': !!cn?.supabase?.connected && !cn.supabase.error,
      'conn:render': !!cn?.render?.connected && !cn.render.error,
      'conn:twitch': !!cn?.twitch?.connected && !cn.twitch.error,
    };
    page.querySelectorAll('.sx-tile').forEach(b => { b.querySelector('.sx-dot').hidden = !ok[b.dataset.t]; });
  }
  const mem = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };
  let cur = localStorage.getItem('setSection'); if (!SECTIONS.some(s => s.id === cur)) cur = SECTIONS[0].id;
  let tile = null;
  function pickTile(id) { // id null = popup closed (the modules still load, for the dots)
    tile = tileKey(id);
    const t = TILES.find(x => x.key === tile), live = !page.hidden && cur === 'accounts';
    page.querySelectorAll('.sx-tile').forEach(b => b.classList.toggle('on', b.dataset.t === tile));
    ROWS.forEach(r => { panel(r.id).hidden = t?.row.id !== r.id; });
    pop.hidden = !t;
    if (t) { pop.querySelector('.sx-dic').innerHTML = t.icon; pop.querySelector('.sx-dh b').textContent = t.name; pop.querySelector('.sx-dlg').setAttribute('aria-label', t.name); pop.querySelector('.sx-x').focus({ preventScroll: true }); }
    if (live) { window.FmAI?.open(t?.row.id === 'prov' ? t.id : null); window.FmConnectors?.open(t?.row.id === 'conn' ? t.id : null); window.FmAccount?.open(t?.row.id === 'acct' ? t.id : null); }
  }
  function pick(id) {
    if (id === 'workbox' || id === 'android') id = 'addons'; // old / shortcut names
    let t = null; if (tileKey(id)) { t = tileKey(id); id = 'accounts'; } // a tile id opens Accounts with that tile's popup
    tile = t;
    cur = id; mem('setSection', id);
    page.querySelectorAll('.sp-item').forEach(b => b.classList.toggle('on', b.dataset.s === id));
    page.querySelectorAll('.sp-sec').forEach(s => { s.hidden = s.dataset.s !== id; });
    page.classList.add('picked'); // phone: show the section instead of the list
    id === 'devices' ? window.FmDeviceRole?.open() : window.FmDeviceRole?.close();
    id === 'addons' || id === 'workbox' ? wbx?.open() : wbx?.close();
    if (id === 'accounts') pickTile(tile); else { window.FmAI?.close(); window.FmConnectors?.close(); window.FmAccount?.close(); }
  }
  // Sits right under the top bar so the tabs and gear stay usable.
  // The nav column lines up with the agent deck column (2026-11-16): same left edge, its border on the deck's divider, so opening Settings looks seamless.
  let navW = 0, navL = 0;
  const place = () => { const h = document.querySelector('header'); page.style.top = Math.round(h ? h.getBoundingClientRect().bottom : 0) + 'px';
    const z = [...document.querySelectorAll('.dkzone')].map(x => x.getBoundingClientRect()).find(r => r.width > 0 && r.height > 0);
    if (z && !matchMedia('(max-width: 900px)').matches) { navL = Math.round(z.left); navW = Math.round(z.right + 11); } // the divider (deck.css .dkzone::after) sits 11-12px right of the column
    const nav = page.querySelector('.sp-nav');
    if (navW && !matchMedia('(max-width: 720px)').matches) { nav.style.width = navW + 'px'; nav.style.paddingLeft = navL + 'px'; } else { nav.style.width = nav.style.paddingLeft = ''; } };
  function show(v, section) {
    page.hidden = !v;
    if (!v) { wbx?.close(); window.FmDeviceRole?.close(); window.FmAI?.close(); window.FmConnectors?.close(); window.FmAccount?.close(); return; }
    window.FmGit?.open && window.FmGit.show(false); window.FmRoadmap?.open && window.FmRoadmap.show(false); window.FmWorkflow?.open && window.FmWorkflow.show(false); // side panels (Git dock, Roadmap board) close
    window.FmSidePanel?.close(); // and the deck panel's click list (Open items, water card)
    place(); pick(section || cur);
    if (!section && matchMedia('(max-width: 720px)').matches) page.classList.remove('picked'); // phone: open on the list
  }
  page.querySelectorAll('.sp-item').forEach(b => b.onclick = () => pick(b.dataset.s));
  page.querySelectorAll('.sx-tile').forEach(b => b.onclick = () => pickTile(b.dataset.t));
  pop.querySelector('.sx-x').onclick = () => pickTile(null);
  pop.addEventListener('mousedown', e => { if (e.target === pop) pickTile(null); }); // click outside the box
  // Esc closes the popup first (capture, before index.html's Esc closes all of Settings)
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !page.hidden && !pop.hidden) { e.stopPropagation(); e.preventDefault(); pickTile(null); } }, true);
  page.querySelector('#spBack').onclick = () => {
    if (page.classList.contains('picked') && matchMedia('(max-width: 720px)').matches) return page.classList.remove('picked'); // phone: back to the list first
    window.setOpen(false);
  };
  addEventListener('resize', () => { if (!page.hidden) place(); });
  // Picking a page tab (or the nav button) leaves Settings, like any other page.
  document.addEventListener('click', e => { if (!page.hidden && e.target.closest?.('#tabs, #navBtn')) window.setOpen(false); }, true);
  window.FmSettings = { show, pick, dots };
})();
