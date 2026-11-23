// Roadmap board: the page's roadmap, one column per stage heading in its file (default To do · In progress · Waiting test · Complete). Opens from the settings panel's Roadmap row
// (settingspanel.js) and covers the page's left column (the Git dock's size, full height). Data: /api/roadmap?g=<page> (roadmap.mjs): one markdown file per page,
// kept by Underglow (optionally connected to a roadmap file in the page folder by the user, Connect / Disconnect in the header); agents read/add/move the same items with their roadmap_* tools.
// Drag a card between stages (mouse: drag; touch: press and hold). Drop it straight on one of the page's agents (its terminal pane or card) and that agent gets it as
// its next message; drop it on "New agent" (shown at the top of the board while dragging) and a new agent on this page starts on it. The card then follows that agent (working → In progress, finished → Waiting test / Complete). Click a card to edit it.
// Editing is per card (title, details, stage buttons); there is no raw-text mode (the user: people don't know how to use a code field). Polls every 4 s while open, so agents' changes show up live; an edit that lost a race reloads the fresh copy.
(() => {
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const curPg = () => typeof agPageTab === 'function' && typeof tab !== 'undefined' ? agPageTab(tab) : null;
  const ag = id => { try { return typeof agents !== 'undefined' ? agents.get(id) : null; } catch { return null; } };
  const dock = document.createElement('aside'); dock.id = 'rbDock'; dock.className = 'rb pdock'; dock.setAttribute('aria-label', 'Roadmap'); dock.setAttribute('aria-hidden', 'true');
  dock.innerHTML = `<div class="rb-hd"><svg class="rb-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="5" height="15" rx="1.5"/><rect x="9.5" y="4.5" width="5" height="10" rx="1.5"/><rect x="15.5" y="4.5" width="5" height="6" rx="1.5"/></svg>
      <div class="rb-tt"><b>Roadmap</b><span class="rb-sub"></span></div>
      <form class="rb-add"><input type="text" placeholder="Add to To do…" maxlength="500" aria-label="New roadmap item"><button type="submit" title="Add to To do">+</button></form>
      <button class="rb-x" type="button" title="Close (Esc)" aria-label="Close">×</button></div>
    <div class="rb-tabs" role="tablist" aria-label="Stages"></div><div class="rb-board"></div>
    <div class="rb-foot"></div>`;
  document.body.appendChild(dock);
  const $ = s => dock.querySelector(s), board = $('.rb-board'), tabs = $('.rb-tabs'), inp = $('.rb-add input'), foot = $('.rb-foot');
  let open = false, g = null, doc = null, busy = null, pollT = 0, placeT = 0, flashT = 0, editId = null, drag = null;

  const api = (method, path, body) => fetch(path, { method, cache: 'no-store', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: body && JSON.stringify(body) })
    .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok && r.status !== 409) throw new Error(d.error || 'HTTP ' + r.status); return { status: r.status, d }; });
  const q = () => '?g=' + encodeURIComponent(g);
  const flash = (t, warn) => { foot.textContent = t; foot.classList.add('on'); foot.classList.toggle('warn', !!warn); clearTimeout(flashT); flashT = setTimeout(() => foot.classList.remove('on'), 3200); };

  function load() {
    if (!open || busy || drag || editId) return Promise.resolve();
    const want = g;
    return api('GET', '/api/roadmap' + q()).then(({ d }) => { if (want !== g || !open || busy || drag || editId) return; if (!doc || d.rev !== doc.rev) { doc = d; paint(); } })
      .catch(err => { if (!doc) board.innerHTML = `<div class="rb-empty">Couldn't load the roadmap (${e(err.message)})</div>`; });
  }
  // one change at a time; the server answers with the whole fresh doc (409 = it changed underneath: that fresh copy is shown)
  function op(body, okMsg) {
    const want = g;
    busy = api('POST', '/api/roadmap/op' + q(), body).then(({ status, d }) => {
      if (want !== g) return d;
      if (d.cols) doc = d;
      if (status === 409) flash('Changed somewhere else: showing the latest', true); else if (okMsg) flash(typeof okMsg === 'function' ? okMsg(d) : okMsg);
      paint(); return d;
    }).catch(err => { flash(err.message, true); paint(); }).finally(() => { busy = null; });
    return busy;
  }
  function poll() { clearTimeout(pollT); if (!open) return; pollT = setTimeout(() => { if (document.hidden) return poll(); load().finally(poll); }, 4000); }

  // ---------- drawing ----------
  const inline = s => e(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  function paintHead() {
    if (!doc) return;
    $('.rb-sub').innerHTML = (doc.connected ? `<b>${e(doc.name)}</b> in the repo` : 'Roadmap, by Underglow') + ` · <a href="#" class="rb-conn" data-rbconn="${doc.connected ? 'off' : 'on'}">${doc.connected ? 'Disconnect' : 'Connect to another source'}</a>`;
    $('.rb-sub').title = doc.connected ? (doc.file || '') : 'Kept by Underglow on this computer';
    if (doc.lost) flash('The connected file ' + doc.lost + ' is missing: showing the Underglow roadmap', true);
  }
  // Connect / disconnect (explicit, never automatic): a small panel over the board
  function connectPanel() {
    let p = dock.querySelector('.rb-cp'); if (p) p.remove(); if (!doc || doc.connected) return;
    p = document.createElement('div'); p.className = 'rb-cp'; p.style.cssText = 'position:absolute;inset:48px 8px auto 8px;z-index:5;padding:12px;border-radius:10px;background:var(--surface-2,#222);border:1px solid var(--border,#444);font-size:12px;display:grid;gap:8px';
    const opts = (doc.candidates || []).map((c, i) => `<label><input type="radio" name="rbf" value="${e(c.file)}"${i ? '' : ' checked'}> ${e(c.name)}</label>`).join('');
    p.innerHTML = `<b>Connect the roadmap to another source</b><div>Use a roadmap file in this page's folder instead. Your Underglow roadmap is not deleted, and the file's own content is never overwritten.</div>${opts || '<div>No roadmap file found in the folder. Type a file name to use (it is created if missing).</div>'}<input type="text" class="rb-cf" placeholder="or a file in the folder, e.g. ROADMAP.md" maxlength="200">
      <label><input type="radio" name="rbm" value="import" checked> Add my Underglow items to that file</label><label><input type="radio" name="rbm" value="separate"> Keep them separate (they stay in Underglow)</label>
      <div class="rb-eb"><button type="button" class="pri" data-rbact="go">Connect</button><button type="button" data-rbact="no">Cancel</button></div>`;
    dock.appendChild(p);
  }
  function disconnectPanel() {
    let p = dock.querySelector('.rb-dp'); if (p) p.remove(); if (!doc || !doc.connected) return;
    p = document.createElement('div'); p.className = 'rb-dp'; p.style.cssText = 'position:absolute;inset:48px 8px auto 8px;z-index:5;padding:12px;border-radius:10px;background:var(--surface-2,#222);border:1px solid var(--border,#444);font-size:12px;display:grid;gap:8px';
    p.innerHTML = `<b>Disconnect from ${e(doc.name)}</b><div>You go back to the Underglow roadmap. The file itself is never changed or deleted.</div>
      <label><input type="radio" name="rbk" value="yes" checked> Disconnect and keep my items (copy them into the Underglow roadmap)</label><label><input type="radio" name="rbk" value="no"> Disconnect only</label>
      <div class="rb-eb"><button type="button" class="pri" data-rbact="dis">Disconnect</button><button type="button" data-rbact="dno">Cancel</button></div>`;
    dock.appendChild(p);
  }
  dock.addEventListener('click', ev => {
    const t = ev.target.closest('[data-rbconn],[data-rbact]'); if (!t) return; ev.preventDefault();
    if (t.dataset.rbconn === 'on') return connectPanel();
    if (t.dataset.rbconn === 'off') return disconnectPanel();
    if (t.dataset.rbact === 'dis') { const p = dock.querySelector('.rb-dp'), keep = p?.querySelector('input[name=rbk]:checked')?.value !== 'no'; p?.remove(); op({ op: 'disconnect', keep }, d => keep ? 'Back to the Underglow roadmap · kept ' + (d.kept || 0) + ' item(s)' : 'Back to the Underglow roadmap'); return; }
    if (t.dataset.rbact === 'dno') { dock.querySelector('.rb-dp')?.remove(); return; }
    const p = dock.querySelector('.rb-cp'); if (!p) return;
    if (t.dataset.rbact === 'no') return p.remove();
    const file = p.querySelector('.rb-cf').value.trim() || p.querySelector('input[name=rbf]:checked')?.value || '', mode = p.querySelector('input[name=rbm]:checked')?.value || 'separate';
    if (!file) return flash('Pick or type a file', true);
    p.remove(); op({ op: 'connect', file, mode }, d => d.imported ? 'Connected · added ' + d.imported + ' item(s) to the file' : 'Connected');
  });
  function paintFoot() {} // no standing readout at the bottom: the foot is only a short-lived toast (flash)
  function agentChip(id) {
    if (!id) return '';
    const a = ag(id); if (!a) return `<span class="rb-ag gone" title="That agent was closed">agent closed</span>`;
    const cls = typeof statusCls === 'function' ? statusCls(a) : '', word = typeof statusWord === 'function' ? statusWord(a) : a.status;
    return `<span class="rb-ag ${e(cls)}" title="${e(a.name)} · ${e(word)}"><i></i>${e(a.name)} · ${e(word)}</span>`;
  }
  function card(it, col) {
    if (editId === it.id) { // the card opens into a small form: plain labelled fields, and the stages as buttons to move it without dragging
      const stg = doc.cols.map(c => `<button type="button" class="rb-stg${c === col ? ' sel' : ''}" data-stg="${e(c.key)}" data-role="${e(c.role || '')}" aria-pressed="${c === col}"><i></i>${e(c.name)}</button>`).join('');
      return `<div class="rb-card edit" data-id="${e(it.id)}" data-col="${e(col.key)}">
        <label class="rb-lb"><span>Title</span><textarea class="rb-et" rows="2" maxlength="500">${e(it.text)}</textarea></label>
        <label class="rb-lb"><span>Details <small>optional</small></span><textarea class="rb-en" rows="4" placeholder="Anything that helps: steps, links, what done looks like">${e(it.note)}</textarea></label>
        <div class="rb-lb"><span>Stage</span><div class="rb-stgs">${stg}</div></div>
        <div class="rb-eb"><button type="button" class="pri" data-act="save">Save</button><button type="button" data-act="cancel">Cancel</button><button type="button" class="del" data-act="del">Delete</button></div></div>`;
    }
    // preview, not the full text: the title clamps to two lines, the details fold into one line (open the card to read / edit it all)
    const pv = preview(it.note), full = it.text + (it.note ? '\n\n' + it.note.trim() : '');
    return `<div class="rb-card${col.role === 'done' ? ' done' : ''}" data-id="${e(it.id)}" tabindex="0" role="listitem" title="${e(full.slice(0, 600))}"><span class="rb-dot"><i></i></span>
      <div class="rb-body"><div class="rb-t">${inline(it.text)}</div>${pv ? `<div class="rb-pv">${inline(pv)}</div>` : ''}${it.agent ? `<div class="rb-meta">${agentChip(it.agent)}</div>` : ''}</div>
      <button class="rb-del" type="button" title="Remove" aria-label="Remove">×</button></div>`;
  }
  const preview = note => String(note || '').split('\n').map(l => l.replace(/^\s*[-*+] (\[[ xX]\] ?)?/, '').replace(/^#+\s*/, '').trim()).filter(Boolean).join(' · ');
  // stage tabs (narrow dock / phone): one stage shown at a time, picked from the tab bar under the header. Remembered across opens.
  // While dragging a card, hovering a tab switches to it (so you can place the card); dropping on a tab puts the card at the end of that stage.
  const STAGE_KEY = 'fm.rb.stage';
  let stage = (() => { try { return localStorage.getItem(STAGE_KEY) || ''; } catch { return ''; } })();
  const tabbed = () => dock.classList.contains('narrow');
  const curCol = () => doc?.cols.find(c => c.key === stage) || doc?.cols[0];
  // Switching animates: a highlight slides from the old tile to the new one (.rb-ind), and the new stage's cards slide in from the side
  // the stage sits on (later stage: from the right, earlier: from the left), one after another.
  const ind = document.createElement('div'); ind.className = 'rb-ind'; ind.setAttribute('aria-hidden', 'true');
  let slideNext = false;
  function moveInd(animate) {
    const t = tabs.querySelector('.rb-tab.cur'); if (!t || !t.offsetWidth) { ind.style.opacity = '0'; return; }
    if (!animate) ind.classList.add('still');
    ind.style.setProperty('--c', getComputedStyle(t).getPropertyValue('--c'));
    Object.assign(ind.style, { opacity: '1', width: t.offsetWidth + 'px', height: t.offsetHeight + 'px', transform: `translate(${t.offsetLeft}px, ${t.offsetTop}px)` });
    if (!animate) { void ind.offsetWidth; ind.classList.remove('still'); }
  }
  new ResizeObserver(() => moveInd(false)).observe(tabs);
  function enter(dir) { // the shown stage's cards come in from the side
    const col = board.querySelector('.rb-col.cur'); if (!col || reduce()) return;
    col.style.setProperty('--dir', dir); [...col.querySelector('.rb-list').children].forEach((x, i) => x.style.setProperty('--i', Math.min(i, 8)));
    col.classList.remove('enter'); void col.offsetWidth; col.classList.add('enter');
  }
  function setStage(key, soft) { // soft: just flip classes (mid-drag, the board must not be rebuilt)
    const cols = doc?.cols || [], from = cols.indexOf(curCol());
    stage = key; try { localStorage.setItem(STAGE_KEY, key); } catch {}
    const to = cols.indexOf(curCol()), dir = to < from ? -1 : 1; if (to === from) return soft ? undefined : paint();
    if (!soft) { slideNext = true; paint(); slideNext = false; board.scrollTop = 0; return enter(dir); }
    tabs.querySelectorAll('.rb-tab').forEach(t => { const on = t.dataset.stage === key; t.classList.toggle('cur', on); t.setAttribute('aria-selected', on); });
    board.querySelectorAll('.rb-col').forEach(c => c.classList.toggle('cur', c.dataset.col === key)); board.scrollTop = 0; moveInd(true); enter(dir);
  }
  function paintTabs() {
    const cur = curCol();
    tabs.innerHTML = (doc?.cols || []).map(c => `<button class="rb-tab${c === cur ? ' cur' : ''}" type="button" role="tab" aria-selected="${c === cur}" data-stage="${e(c.key)}" data-role="${e(c.role || '')}"><i></i><span>${e(c.name)}</span>${c.items.length ? `<em>${c.items.length}</em>` : ''}</button>`).join('');
    tabs.prepend(ind); moveInd(slideNext);
  }
  // New agent: a drop target over the top of the board while a card is dragged. The page's agents themselves (panes, cards, tiles) are the other targets.
  const zone = document.createElement('div'); zone.className = 'rb-zone'; zone.setAttribute('aria-hidden', 'true');
  zone.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><b>New agent</b>';
  document.body.appendChild(zone);
  const pageAgentIds = () => { const pg = curPg(); if (!pg || typeof workers !== 'function') return new Set(); try { return new Set(workers().filter(a => (a.side || 'foreman') === pg.g && a.kind !== 'terminal').map(a => a.id)); } catch { return new Set(); } };
  const agentAt = el => { // the page agent under the pointer: its pane (#p-<id>), desk card or tile
    const t = el?.closest?.('.apane[id^="p-"], .dcard[data-id]:not(.ocard), .atile[data-id]'); if (!t) return null;
    const id = t.classList.contains('apane') ? t.id.slice(2) : t.dataset.id;
    return drag.ids.has(id) ? { id, el: t } : null;
  };
  let hot = null; const setHot = el => { if (hot === el) return; hot?.classList.remove('rb-drop'); hot = el; hot?.classList.add('rb-drop'); };
  function zoneOn(on) {
    if (on) { // covers the page's agents header ("<x> agents" + its add-agent +) down to the bottom of the roadmap's add box
      const dr = dock.getBoundingClientRect(), pg = curPg(), gh = pg && document.querySelector('#g-' + CSS.escape(pg.g) + ' .ghead'), hr = gh?.offsetParent ? gh.getBoundingClientRect() : null;
      const ga = gh?.querySelector('.gadd'), gr = ga?.offsetParent ? ga.getBoundingClientRect() : null, ir = inp.offsetParent ? inp.getBoundingClientRect() : null;
      const near = r => r && r.top > dr.top - 140 && r.top < dr.top + 80, top = near(gr) ? gr.top : near(hr) ? hr.top : dr.top + 8, bot = ir ? ir.bottom : dr.top + 50;
      const left = dr.left, right = dr.right; // the roadmap panel's own edges, so it reads as the panel's top
      Object.assign(zone.style, { left: Math.round(left) + 'px', top: Math.round(top) + 'px', width: Math.round(right - left) + 'px', height: Math.max(28, Math.round(bot - top)) + 'px' }); }
    zone.classList.toggle('on', on); if (!on) { zone.classList.remove('over'); setHot(null); }
  }
  const addCol = () => tabbed() ? curCol() : doc?.cols.find(c => c.role === 'todo') || doc?.cols[0]; // where the top box adds: the stage on show
  function paint() {
    paintHead(); if (!doc) return;
    paintTabs();
    const keepFocus = editId && document.activeElement?.closest?.('.rb-card.edit') ? document.activeElement.className : null;
    const ac = addCol(); inp.placeholder = `Add to ${ac?.name || 'To do'}…`; $('.rb-add button').title = inp.placeholder.slice(0, -1);
    const cur = curCol();
    board.innerHTML = doc.cols.map(c => `<section class="rb-col${c === cur ? ' cur' : ''}" data-col="${e(c.key)}" data-role="${e(c.role || '')}">
      <div class="rb-ch"><i></i><b>${e(c.name)}</b><span class="rb-n">${c.items.length || ''}</span></div>
      <div class="rb-list" role="list">${c.items.map(it => card(it, c)).join('') || `<div class="rb-none">Nothing in ${e(c.name)}</div>`}</div>
      ${c === ac ? '' : `<button class="rb-plus" type="button" data-col="${e(c.key)}">+ Add</button>`}</section>`).join('');
    if (editId) { const ed = board.querySelector('.rb-card.edit'); if (!ed) editId = null; else {
      ed.querySelectorAll('textarea').forEach(grow);
      const f = ed.querySelector(keepFocus ? '.' + keepFocus.split(' ')[0] : '.rb-et'); f?.focus(); if (f && !keepFocus) f.setSelectionRange(f.value.length, f.value.length); } }
    paintFoot();
  }
  const grow = t => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 260) + 'px'; }; // editor fields fit their text (no inner scrollbar)
  board.addEventListener('input', ev => { if (ev.target.matches?.('.rb-card.edit textarea')) grow(ev.target); });
  const findIt = id => { for (const c of doc?.cols || []) { const it = c.items.find(x => x.id === id); if (it) return { it, col: c }; } return {}; };

  tabs.addEventListener('click', ev => { const t = ev.target.closest('.rb-tab'); if (t && !drag) { editId = null; setStage(t.dataset.stage); } });
  tabs.addEventListener('keydown', ev => { // arrow keys move between stages
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight' || !doc) return; ev.preventDefault();
    const i = doc.cols.indexOf(curCol()), n = doc.cols.length, nx = doc.cols[(i + (ev.key === 'ArrowRight' ? 1 : n - 1)) % n];
    setStage(nx.key); tabs.querySelector(`.rb-tab[data-stage="${CSS.escape(nx.key)}"]`)?.focus();
  });

  // ---------- clicks: edit, delete, add per column ----------
  board.addEventListener('click', ev => {
    if (drag?.swallow) return;
    const plus = ev.target.closest('.rb-plus');
    if (plus) { // inline box in place of the button: Enter adds, Esc / leaving it cancels
      const col = plus.dataset.col, f = document.createElement('input'); f.className = 'rb-plusin'; f.maxLength = 500; f.placeholder = `Add to ${doc.cols.find(c => c.key === col)?.name}…`;
      plus.replaceWith(f); f.focus(); editId = 'add:' + col; let done = false;
      const end = t => { if (done) return; done = true; editId = null; if (t) op({ op: 'add', col, text: t }); else paint(); };
      f.addEventListener('keydown', k => { if (k.key === 'Enter') { k.preventDefault(); end(f.value.trim()); } else if (k.key === 'Escape') { k.stopPropagation(); end(''); } });
      f.addEventListener('blur', () => end(f.value.trim()));
      return; }
    const c = ev.target.closest('.rb-card'); if (!c) return;
    const id = c.dataset.id;
    if (ev.target.closest('.rb-del')) { const { it } = findIt(id); if (it && confirm(`Remove "${it.text.slice(0, 80)}" from the roadmap?`)) op({ op: 'remove', id }); return; }
    if (c.classList.contains('edit')) {
      const sb = ev.target.closest('.rb-stg');
      if (sb) { c.querySelectorAll('.rb-stg').forEach(b => { const on = b === sb; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on); }); return; }
      const act = ev.target.closest('[data-act]')?.dataset.act; if (!act) return;
      if (act === 'cancel') { editId = null; paint(); }
      else if (act === 'del') { const { it } = findIt(id); if (it && confirm(`Remove "${it.text.slice(0, 80)}" from the roadmap?`)) { editId = null; op({ op: 'remove', id }); } }
      else if (act === 'save') saveEdit(c);
      return;
    }
    if (ev.target.closest('.rb-ag')) return;
    editId = id; paint();
  });
  function saveEdit(c) {
    const text = c.querySelector('.rb-et').value.trim(), note = c.querySelector('.rb-en').value, id = c.dataset.id, { it, col } = findIt(id);
    const to = c.querySelector('.rb-stg.sel')?.dataset.stg || col?.key, toCol = doc.cols.find(x => x.key === to);
    editId = null; if (!it || !text) return paint();
    const changed = text !== it.text || note.trim() !== (it.note || '').trim(), moving = toCol && toCol !== col;
    const move = () => op({ op: 'move', id, col: to, index: toCol.items.filter(x => x.id !== id).length }, `Moved to ${toCol.name}`);
    if (changed) op({ op: 'edit', id, text, note }).then(d => { if (moving && d?.cols) move(); });
    else if (moving) move();
    else paint();
  }
  board.addEventListener('keydown', ev => {
    const c = ev.target.closest('.rb-card'); if (!c) return;
    if (c.classList.contains('edit')) {
      if (ev.key === 'Escape') { ev.stopPropagation(); editId = null; paint(); }
      else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey || (ev.target.classList.contains('rb-et') && !ev.shiftKey))) { ev.preventDefault(); saveEdit(c); }
    } else if (ev.key === 'Enter') { editId = c.dataset.id; paint(); }
    else if (ev.key === 'Delete') { const { it } = findIt(c.dataset.id); if (it && confirm(`Remove "${it.text.slice(0, 80)}" from the roadmap?`)) op({ op: 'remove', id: c.dataset.id }); }
  });
  $('.rb-add').addEventListener('submit', ev => {
    ev.preventDefault(); const t = inp.value.trim(); if (!t || !g) return; inp.value = '';
    const ac = addCol()?.key || 'todo'; op({ op: 'add', col: ac, text: t }).then(d => { if (!d?.cols) inp.value = t; else board.querySelector(`.rb-col[data-col="${CSS.escape(ac)}"] .rb-list`)?.lastElementChild?.scrollIntoView({ block: 'nearest' }); });
  });

  // ---------- drag and drop: between stages, or onto Start an agent ----------
  // Mouse: press and move 6px. Touch: press and hold 300 ms (a swipe still scrolls). One ghost follows the pointer; a gap opens where it would land.
  board.addEventListener('pointerdown', ev => {
    if (ev.button || drag || busy) return;
    const c = ev.target.closest('.rb-card'); if (!c || c.classList.contains('edit') || ev.target.closest('.rb-del,.rb-ag')) return;
    const touch = ev.pointerType !== 'mouse';
    drag = { id: c.dataset.id, el: c, pid: ev.pointerId, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, on: false, touch, from: c.closest('.rb-col').dataset.col };
    if (touch) drag.t = setTimeout(() => { if (drag && !drag.on) begin(); }, 300);
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel);
  });
  function begin() {
    const r = drag.el.getBoundingClientRect(); drag.on = true; drag.dx = drag.x - r.left; drag.dy = drag.y - r.top;
    const gh = drag.el.cloneNode(true); gh.classList.add('rb-ghost'); gh.style.width = r.width + 'px'; gh.style.setProperty('--c', getComputedStyle(drag.el).getPropertyValue('--c')); document.body.appendChild(gh); drag.gh = gh;
    drag.ph = document.createElement('div'); drag.ph.className = 'rb-ph'; drag.ph.style.height = r.height + 'px';
    drag.el.classList.add('rb-src'); dock.classList.add('dragging'); drag.ids = pageAgentIds(); zoneOn(true); place(); track();
    navigator.vibrate?.(8);
  }
  function move(ev) {
    if (!drag || ev.pointerId !== drag.pid) return; drag.x = ev.clientX; drag.y = ev.clientY;
    if (!drag.on) { const d = Math.hypot(drag.x - drag.x0, drag.y - drag.y0); if (drag.touch) { if (d > 10) cancel(); return; } if (d < 6) return; begin(); }
    ev.preventDefault(); place(); // the ghost follows at once; the drop-target lookup (layout reads) runs at most once per frame
    if (!drag.raf) drag.raf = requestAnimationFrame(() => { if (drag?.on) { drag.raf = 0; track(); } });
  }
  const place = () => { if (drag?.gh) drag.gh.style.transform = `translate(${drag.x - drag.dx}px, ${drag.y - drag.dy}px) rotate(-1.5deg)`; };
  function track() { // where would it land: the Start zone, or a column + index
    const el = document.elementsFromPoint(drag.x, drag.y).find(x => x !== drag.gh && !drag.gh.contains(x)), inZone = el?.closest?.('.rb-zone'), hit = !inZone && agentAt(el), col = !inZone && !hit && el?.closest?.('.rb-col');
    board.querySelectorAll('.rb-col.over').forEach(x => x !== col && x.classList.remove('over')); zone.classList.toggle('over', !!inZone); setHot(hit ? hit.el : null);
    const tb = !inZone && !hit && el?.closest?.('.rb-tab'); tabs.querySelectorAll('.rb-tab.over').forEach(x => x !== tb && x.classList.remove('over'));
    if (tb) { // over a stage tab: drop = end of that stage; hold 450 ms = switch to it to place the card exactly
      drag.ph.remove(); tb.classList.add('over'); const key = tb.dataset.stage, c = doc.cols.find(x => x.key === key);
      drag.to = key === drag.from ? null : { col: key, index: c ? c.items.length : 0 };
      if (drag.tabKey !== key) { clearTimeout(drag.tabT); drag.tabKey = key; if (key !== stage) drag.tabT = setTimeout(() => { if (drag?.on && drag.tabKey === key) setStage(key, true); }, 450); }
      return; }
    clearTimeout(drag.tabT); drag.tabKey = null;
    if (inZone) { drag.ph.remove(); drag.to = { zone: true }; return; }
    if (hit) { drag.ph.remove(); drag.to = { agent: hit.id }; return; }
    if (!col) { drag.ph.remove(); drag.to = null; return; }
    col.classList.add('over');
    const list = col.querySelector('.rb-list'), cards = [...list.querySelectorAll('.rb-card:not(.rb-src)')];
    let i = cards.findIndex(c => { const r = c.getBoundingClientRect(); return drag.y < r.top + r.height / 2; }); if (i < 0) i = cards.length;
    const nx = cards[i] || null; if (drag.ph.parentNode !== list || drag.ph.nextElementSibling !== nx) list.insertBefore(drag.ph, nx); // only touch the DOM when the gap moves
    drag.to = { col: col.dataset.col, index: i };
    // scroll the column list when near its edges
    const lr = list.getBoundingClientRect(); if (drag.y > lr.bottom - 30) list.scrollTop += 8; else if (drag.y < lr.top + 30) list.scrollTop -= 8;
    if (tabbed()) { const br = board.getBoundingClientRect(); if (drag.y > br.bottom - 40) board.scrollTop += 10; else if (drag.y < br.top + 40) board.scrollTop -= 10; } // one stage on show: the board scrolls
  }
  function stop() {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel);
    const d = drag; clearTimeout(d?.t); clearTimeout(d?.tabT); if (d?.raf) cancelAnimationFrame(d.raf); tabs.querySelectorAll('.rb-tab.over').forEach(x => x.classList.remove('over')); if (!d) return null;
    d.gh?.remove(); d.ph?.remove(); d.el.classList.remove('rb-src'); dock.classList.remove('dragging');
    board.querySelectorAll('.rb-col.over').forEach(x => x.classList.remove('over')); zoneOn(false);
    drag = d.on ? { swallow: true } : null; if (d.on) setTimeout(() => { if (drag?.swallow) drag = null; }, 50); // the drag's own click must not open the editor
    return d;
  }
  function cancel() { stop(); }
  function up(ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    const d = stop(); if (!d?.on || !d.to) return;
    const { it } = findIt(d.id); if (!it) return;
    if (d.to.zone) {
      op({ op: 'start', id: d.id }, r => r.started ? `Started ${r.started.name} on it` : 'Started');
      return;
    }
    if (d.to.agent) {
      const a = ag(d.to.agent), busyNow = a?.status === 'working';
      op({ op: 'assign', id: d.id, agent: d.to.agent }, r => r.assigned ? `Sent to ${r.assigned.name}${busyNow ? ' (queued after its current task)' : ''}` : 'Sent');
      return;
    }
    const fromCol = doc.cols.find(c => c.key === d.from), same = d.to.col === d.from, oldI = fromCol.items.findIndex(x => x.id === d.id);
    if (same && d.to.index === oldI) return; // dropped where it was (index counts the other cards)
    // optimistic: move it locally now, the server's copy follows
    fromCol.items.splice(oldI, 1); const toCol = doc.cols.find(c => c.key === d.to.col); toCol.items.splice(Math.min(d.to.index, toCol.items.length), 0, { ...it, done: toCol.role === 'done' }); paint();
    op({ op: 'move', id: d.id, col: d.to.col, index: d.to.index });
  }
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && drag?.on) { ev.stopPropagation(); cancel(); } }, true);

  // ---------- place: the Git dock's footprint (the page's left column), but full height: from the column's top down to the Roadmap row ----------
  // Opening (CSS in roadmap.css, body.rbopen): the other option rows and the money counter slide off the bottom and the Roadmap row drops into
  // the counter's place (--rb-gy); the dock grows up out of it and covers the agent cards (they stay where they are).
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let openT = 0, closeT = 0;
  function rowDrop(z) {
    const slot = z.querySelector(':scope > .dkres'), row = slot?.querySelector('.sp-ics'); // the icon row (settingspanel.js) holding the Roadmap button if (!slot || !row) return null;
    const sr = slot.getBoundingClientRect(), rr = row.getBoundingClientRect(), tf = getComputedStyle(row).transform, nat = rr.top - (tf && tf !== 'none' ? new DOMMatrix(tf).m42 : 0); // where the row sits untransformed
    const gy = Math.max(0, Math.round(sr.bottom - 2 - rr.height - nat)); slot.style.setProperty('--rb-gy', gy + 'px'); return nat + gy;
  }
  function placeDock() {
    const pg = curPg(); if (!pg) return;
    dock.classList.toggle('narrow', matchMedia('(max-width: 900px)').matches || !!document.getElementById('dzone-' + pg.g)); // phone: the same stacked stages as the desktop dock
    window.FmPopDock?.place(dock, pg); // shared size + position (popdock.js)
  }
  function show(on) {
    const pg = curPg(); if (on && !pg) on = false;
    if (on === open && (!on || pg.g === g)) return;
    if (on) {
      const switching = open; open = true; g = pg.g; doc = null; editId = null;
      clearTimeout(closeT); clearTimeout(openT); document.body.classList.add('rbopen'); placeDock(); dock.setAttribute('aria-hidden', 'false');
      if (switching || reduce()) dock.classList.add('open'); else openT = setTimeout(() => open && dock.classList.add('open'), 160); // the rows slide down first, then the dock grows
      board.innerHTML = '<div class="rb-empty">…</div>'; $('.rb-sub').textContent = ''; foot.textContent = '';
      load(); poll(); if (!switching && !matchMedia('(pointer: coarse)').matches) setTimeout(() => open && inp.focus(), 60);
      clearInterval(placeT); placeT = setInterval(() => { const c = curPg(); if (!c) return show(false); if (c.g !== g) return show(true); placeDock(); if (!drag && !editId && doc) board.querySelectorAll('.rb-card[data-id]').forEach(el => { const { it } = findIt(el.dataset.id); const ch = el.querySelector('.rb-ag'); if (it?.agent && ch) ch.outerHTML = agentChip(it.agent); }); }, 1000);
    } else {
      if (drag?.on) cancel();
      open = false; editId = null; clearTimeout(pollT); clearInterval(placeT);
      clearTimeout(openT); dock.classList.remove('open'); dock.setAttribute('aria-hidden', 'true');
      clearTimeout(closeT); closeT = setTimeout(() => { if (open) return; document.body.classList.remove('rbopen'); setTimeout(() => open || document.querySelectorAll('.dkres').forEach(s => s.style.removeProperty('--rb-gy')), 600); }, reduce() ? 0 : 220);
    }
    window.FmRoadmap.onChange?.(open);
  }
  $('.rb-x').onclick = () => show(false);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && open && !drag && !editId) { ev.stopPropagation(); show(false); } }, true);
  addEventListener('resize', () => open && placeDock());
  addEventListener('focus', () => open && load());
  window.FmRoadmap = { toggle: () => show(!open), show, get open() { return open; }, onChange: null };
})();
