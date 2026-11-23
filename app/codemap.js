// Code Map panel (sidebar tree icon, settingspanel.js): a window into the host's code index. Everything here is a view: the data comes from the HOST
// (/api/codemap/*, codemap.mjs), so a client device shows exactly what the host knows and never keeps its own copy.
//   Not initialized: an "Initialize map" button with a size estimate. Initializing: an animated progress bar, then the graph animates in.
//   Graph: a floating, force-directed network drawn on a canvas (style "Circuit": ring nodes, right-angle links, dot grid). Files are linked by their imports (plus faint folder links), folders form clouds,
//   hub files are bigger, and it is squeezed into a tall narrow area. Semantic zoom: folder clouds -> files -> functions; big folders open as you zoom in. Only what is near the screen is drawn. Search jumps to + opens a result. Click a node for its connections.
//   Live agents (polled from the host's agent activity): blue = reading, yellow = editing, a pulse follows an agent from file to file, a collapsed folder glows
//   when something inside it is active, finished edits flash and leave a fading trail.
(() => {
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const curPg = () => typeof agPageTab === 'function' && typeof tab !== 'undefined' ? agPageTab(tab) : null;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const api = (p, o) => fetch('/api/codemap/' + p, { cache: 'no-store', ...o }).then(r => r.json()).catch(() => null);
  const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
  const fmtB = b => b >= 1073741824 ? (b / 1073741824).toFixed(1) + ' GB' : b >= 1048576 ? Math.round(b / 1048576) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const ago = t => { const s = (Date.now() - t) / 1000; return !t ? 'never' : s < 20 ? 'just now' : s < 3600 ? Math.max(1, Math.round(s / 60)) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  const TREE_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.5" r="2.2"/><circle cx="5.5" cy="13" r="2.2"/><circle cx="18.5" cy="13" r="2.2"/><circle cx="12" cy="20" r="2.2"/><path d="M12 6.7v4.2M12 10.9c0 0-6.5-.4-6.5 2.1M12 10.9c0 0 6.5-.4 6.5 2.1M5.5 15.2c0 2.6 4.5 2.4 4.5 4.6"/></svg>';

  const dock = document.createElement('aside'); dock.id = 'cmDock'; dock.className = 'cm pdock'; dock.setAttribute('aria-label', 'Code map'); dock.setAttribute('aria-hidden', 'true');
  dock.innerHTML = `<div class="cm-hd"><span class="cm-ic">${TREE_IC}</span><div class="cm-tt"><b>Code map</b><span class="cm-sub"></span></div>
      <button class="cm-au" type="button" aria-label="Audit now" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v5h-5"/></svg></button>
      <button class="cm-x" type="button" aria-label="Close (Esc)">×</button></div>
    <div class="cm-body"></div>`;
  document.body.appendChild(dock);
  const $ = s => dock.querySelector(s), body = $('.cm-body'), sub = $('.cm-sub'), auBtn = $('.cm-au');

  let open = false, g = null, st = null, nodes = null, pollT = 0, actT = 0, placeT = 0, closeT = 0, openT = 0, stamp = 0;
  const folderC = new Map(), fileC = new Map(), pendingF = new Set(); // folder path → files; file → {sy,im,ib,..} (fetched from the host on demand)
  let openSet = new Set(), closedSet = new Set(), sel = null, links = null, act = { active: [], done: [] }, searchEl = null, savedEl = null, savedShown = 0, firstReveal = false, layoutT = 0, actLocal = 0;
  let els = new Map(), world = null, vp = null; // `world` just means "the graph is showing" (the panel-state code sets it to null when the view changes)
  let cv = null, ctx = null, ro = null, W = 0, H = 0, dpr = 1, raf = 0, fam = 'system-ui', BL = '#4A8FE8', YL = '#E8B93C', view = { x: 0, y: 0, k: 1 }, goal = { ...view };

  // ---------- panel states ----------
  const setSub = t => { if (sub.textContent !== t) sub.textContent = t; };
  function statusText() {
    if (!st?.initialized) return st?.reason === 'no-folder' ? 'this page has no folder' : 'not initialized';
    return `${st.status === 'updating' || st.pending ? 'updating…' : 'up to date'} · ${(st.files || 0).toLocaleString()} files · updated ${ago(st.indexedAt)}`;
  }
  function showView(name) {
    if (body.dataset.v === name) return; body.dataset.v = name; clearInterval(placeT);
    body.classList.remove('cm-swap'); void body.offsetWidth; body.classList.add('cm-swap'); // fade the new view in
    auBtn.hidden = name !== 'graph'; els = new Map(); world = vp = null;
  }
  async function initView() {
    showView('init'); const est = await api('estimate?g=' + encodeURIComponent(g));
    body.innerHTML = `<div class="cm-init"><div class="cm-bigic">${TREE_IC}<i></i><i></i><i></i></div>
      <h3>Map this codebase</h3><p>Underglow reads your code once and keeps a private index of files, functions and how they connect, so its agents find things instead of searching. It stays on this computer and nothing is added to your project.</p>
      <button class="cm-go" type="button"><span>Initialize map</span></button>
      <div class="cm-est">${est?.files ? `${est.files.toLocaleString()} files · ${fmtB(est.bytes)} · about ${est.seconds < 60 ? est.seconds + ' seconds' : Math.round(est.seconds / 60) + ' minutes'}` : 'measuring…'}</div></div>`;
    body.querySelector('.cm-go').onclick = startInit;
  }
  async function startInit() {
    const b = body.querySelector('.cm-go'); if (b) b.disabled = true; await api('init?g=' + encodeURIComponent(g), { method: 'POST' }); firstReveal = true; poll(true);
  }
  function progressView() {
    if (body.dataset.v !== 'build') { showView('build'); body.innerHTML = `<div class="cm-prog"><div class="cm-bigic spin">${TREE_IC}<i></i><i></i><i></i></div><h3>Building the map</h3><div class="cm-bar"><b></b></div><div class="cm-pt">starting…</div></div>`; }
    const p = st.progress || { done: 0, total: 0 }, pc = p.total ? Math.min(100, p.done / p.total * 100) : 3;
    body.querySelector('.cm-bar b').style.width = pc + '%'; body.querySelector('.cm-pt').textContent = p.total ? `${p.done.toLocaleString()} of ${p.total.toLocaleString()} files` : 'finding files…';
  }

  // ---------- data ----------
  async function poll(now) {
    clearTimeout(pollT); if (!open) return;
    const gg = g, j = await api('state?g=' + encodeURIComponent(gg)); if (!open || gg !== g) return;
    st = j; setSub(statusText()); dock.classList.toggle('cm-busy', !!(st?.status === 'updating' || st?.pending));
    if (j?.initialized && (j.status === 'building')) progressView();
    else if (j?.initialized) {
      if (body.dataset.v === 'build') { const bar = body.querySelector('.cm-bar b'); if (bar) bar.style.width = '100%'; await new Promise(r => setTimeout(r, reduce() ? 0 : 450)); }
      if (body.dataset.v !== 'graph' || j.indexedAt !== stamp) await loadTree(j.indexedAt);
    } else if (body.dataset.v !== 'init' && !(body.dataset.v === 'build')) initView();
    else if (body.dataset.v === 'build' && !j?.initialized) { /* failed */ if (j?.error) { body.innerHTML = `<div class="cm-init"><h3>Could not build the map</h3><p>${e(j.error)}</p><button class="cm-go" type="button"><span>Try again</span></button></div>`; body.dataset.v = 'err'; body.querySelector('.cm-go').onclick = startInit; } }
    pollT = setTimeout(() => poll(), j?.status === 'building' ? 350 : 3000);
  }
  async function loadTree(ts) {
    const j = await api('tree?g=' + encodeURIComponent(g)); if (!j?.ok || !open) return; nodes = j.nodes; stamp = ts; folderC.clear(); fileC.clear();
    const fresh = body.dataset.v !== 'graph'; if (fresh) { buildGraph(); }
    layout(fresh && firstReveal ? 'reveal' : 'soft'); firstReveal = false;
  }
  async function ensureFolder(p) { if (folderC.has(p) || pendingF.has(p)) return; pendingF.add(p); const j = await api(`folder?g=${encodeURIComponent(g)}&p=${encodeURIComponent(p)}`); pendingF.delete(p); if (j?.ok && open) { folderC.set(p, j.files); schedule(); } }
  async function ensureFile(f) { if (fileC.has(f) || pendingF.has('f:' + f)) return; pendingF.add('f:' + f); const j = await api(`file?g=${encodeURIComponent(g)}&f=${encodeURIComponent(f)}`); pendingF.delete('f:' + f); if (j?.ok && open) { fileC.set(f, j); schedule(); } }
  const schedule = () => { clearTimeout(layoutT); layoutT = setTimeout(() => layout('soft'), 30); };

  // ---------- graph scaffold ----------
  let box = null, card = null; const rows = [], ghosts = [], G = new Map(), linksArr = [], adjM = new Map(), lkey = new Map(), kids = new Map();
  function buildGraph() {
    showView('graph');
    body.innerHTML = `<div class="cm-search"><input type="text" placeholder="Search functions, classes, files" spellcheck="false" autocomplete="off" aria-label="Search the map"><div class="cm-res" hidden></div></div>
      <div class="cm-vp"><canvas class="cm-cv" aria-label="Code map graph" role="img"></canvas></div>
      <div class="cm-zb"><button type="button" data-z="1" aria-label="Zoom in">+</button><button type="button" data-z="-1" aria-label="Zoom out">−</button><button type="button" data-z="0" aria-label="Fit everything">⤢</button></div>
      <div class="cm-card" role="region" aria-label="Selected"></div>
      <div class="cm-saved" aria-label="Estimated tokens saved"></div>`;
    box = body.querySelector('.cm-vp'); world = box; cv = body.querySelector('.cm-cv'); ctx = cv.getContext('2d'); card = body.querySelector('.cm-card'); searchEl = body.querySelector('.cm-search input'); savedEl = body.querySelector('.cm-saved'); savedShown = 0;
    rows.length = 0; ghosts.length = 0; G.clear(); linksArr.length = 0; adjM.clear(); lkey.clear(); kids.clear(); openSet.clear(); closedSet.clear(); autoSet.clear(); capOf.clear(); forcedSym.clear(); folderS.clear(); fetchQ.length = 0; inflight = 0;
    sel = null; links = null; hover = null; qset = null; pulses = []; rings = []; litMap = new Map(); litAnc = new Map(); trailMap = new Map(); focusSet = null; focusNode = null; focusAmt = 0; maxLn = 800; sScale = 1; sTarget = 1; qual = 1; budgetDone = false; needRelink = true; viewInit = false; autoFit = true; winOff();
    view = { x: 0, y: 0, k: 1 }; goal = { ...view };
    const cs = getComputedStyle(dock), hx = v => /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : null; fam = cs.fontFamily || 'system-ui, sans-serif'; BL = hx(cs.getPropertyValue('--accent')) || '#4A8FE8'; YL = hx(cs.getPropertyValue('--amber')) || '#E8B93C';
    ro?.disconnect(); ro = new ResizeObserver(fitCanvas); ro.observe(box); fitCanvas(); wire();
  }
  const winL = []; const onWin = (t, f) => { addEventListener(t, f); winL.push([t, f]); }; const winOff = () => { for (const [t, f] of winL) removeEventListener(t, f); winL.length = 0; };
  function teardown() { winOff(); cancelAnimationFrame(raf); raf = 0; ro?.disconnect(); ro = null; cv = ctx = box = null; }
  function fitCanvas() {
    if (!box || !cv) return; const oW = W, oH = H; W = box.clientWidth; H = box.clientHeight; dpr = Math.max(.75, Math.min(2, window.devicePixelRatio || 1) * qual); cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    halfW0 = Math.max(60, (W - 44) / 2); halfH0 = Math.max(110, (H - 116) / 2); cy0 = 50 + (H - 50 - 26) / 2;
    if (oW) { goal.x += (W - oW) / 2; view.x += (W - oW) / 2; goal.y += (H - oH) / 2; view.y += (H - oH) / 2; } else resetView(true); kick();
  }
  function resetView(instant, user) { if (user) autoFit = true; goal.k = Math.max(.3, 1 / sTarget); goal.x = W / 2; goal.y = cy0 + 4; if (instant) Object.assign(view, goal); kick(); }
  const drawSoon = () => kick(), draw = () => fitCanvas();

  // ---------- colours (style "Circuit": ring nodes, right-angle links, dot grid). Blue / yellow / red stay reserved for agents ----------
  const COL = { root: '#F3E9DC', fn: '#B79CF5', cl: '#9AD68B', ty: '#E8A27C', im: '#F5A3D2', ib: '#9BE3C9', more: '#9096A8', cols: ['#E58BB0', '#7FD1C3', '#B79CF5', '#9AD68B', '#E8A27C', '#EAA6CF', '#8FC9A8'] };
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgba = (h, a) => { const [r, g2, b] = rgb(h); return `rgba(${r},${g2},${b},${a})`; };
  const mix = (h, t) => { const [r, g2, b] = rgb(h); return `rgb(${Math.round(r + (255 - r) * t)},${Math.round(g2 + (255 - g2) * t)},${Math.round(b + (255 - b) * t)})`; };
  const sprites = new Map(), cores = new Map();
  function glowSprite(c) { let s = sprites.get(c); if (s) return s; s = document.createElement('canvas'); s.width = s.height = 128; const x = s.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, rgba(c, .85)); gr.addColorStop(.2, rgba(c, .35)); gr.addColorStop(.5, rgba(c, .09)); gr.addColorStop(1, rgba(c, 0)); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); sprites.set(c, s); return s; }
  function coreSprite(c) { let s = cores.get(c); if (s) return s; s = document.createElement('canvas'); s.width = s.height = 64; const x = s.getContext('2d'); x.fillStyle = rgba(c, .22); x.beginPath(); x.arc(32, 32, 28, 0, 7); x.fill(); x.strokeStyle = c; x.lineWidth = 6; x.beginPath(); x.arc(32, 32, 27, 0, 7); x.stroke(); x.fillStyle = mix(c, .6); x.beginPath(); x.arc(32, 32, 9, 0, 7); x.fill(); cores.set(c, s); return s; }
  const hashStr = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
  const colOf = n => n.t === 'r' ? COL.root : n.t === 'm' ? COL.more : n.t === 's' ? (n.k === 'function' || n.k === 'method' ? COL.fn : n.k === 'class' || n.k === 'struct' ? COL.cl : COL.ty) : COL.cols[n.ci];

  // ---------- data loading: host endpoints only, a few at a time ----------
  const folderS = new Map(); let fetchQ = [], inflight = 0, relinkT = 0, maxLn = 800;
  const capOf = new Map(), forcedSym = new Set(), autoSet = new Set();
  function wantFolder(p) { if (folderC.has(p) || pendingF.has(p)) return; pendingF.add(p); fetchQ.push(['d', p]); pump(); }
  function wantFile(f, front) { if (fileC.has(f) || pendingF.has('f:' + f)) return; pendingF.add('f:' + f); front ? fetchQ.unshift(['f', f]) : fetchQ.push(['f', f]); pump(); }
  function pump() {
    while (inflight < 6 && fetchQ.length) { const [k, v] = fetchQ.shift(), gg = g; inflight++;
      api(k === 'd' ? `folder?g=${encodeURIComponent(gg)}&p=${encodeURIComponent(v)}` : `file?g=${encodeURIComponent(gg)}&f=${encodeURIComponent(v)}`).then(j => {
        inflight--; pendingF.delete(k === 'd' ? v : 'f:' + v); if (!open || gg !== g || !cv) return;
        if (j?.ok) { if (k === 'd') { folderC.set(v, j.files); folderS.delete(v); for (const f of j.files) if (f.ln > maxLn) maxLn = Math.min(f.ln, 6000); clearTimeout(layoutT); layoutT = setTimeout(() => layout('soft'), 40); } else { fileC.set(v, j); needRelink = true; clearTimeout(relinkT); relinkT = setTimeout(() => { relink(); }, fetchQ.length ? 700 : 250); } }
        if (!fetchQ.length && !inflight) pumpDetails(); pump(); }); }
  }
  const sortedFiles = p => { let s = folderS.get(p); if (!s) { s = (folderC.get(p) || []).slice().sort((a, b) => (b.ib - a.ib) || ((b.ln || 0) - (a.ln || 0)) || a.f.localeCompare(b.f)); folderS.set(p, s); } return s; };
  const base = p => p.split('/').pop();
  const footprint = fc => Math.min(54, 14 + 5 * Math.sqrt(Math.min(fc, 100)));
  const FILE_CAP = 60, NODE_MAX = 900, FILE_MAX = 700;

  // ---------- model: which nodes exist right now (folder clouds / opened folders / files / symbols) ----------
  const isOpenF = p => p === '' || openSet.has(p) || (autoSet.has(p) && !closedSet.has(p));
  let budgetDone = false, needRelink = true, sScale = 1, sTarget = 1, halfW0 = 150, halfH0 = 250, cy0 = 0, simT = 0, alpha = 1;
  function budgetOpen() { // small repos open entirely; bigger ones open the smallest folders first until about 90 files are showing
    if (budgetDone || !nodes) return; budgetDone = true; let used = 0; const q = (nodes[''].ch || []).slice().sort((a, b) => nodes[a].fc - nodes[b].fc);
    const openAll = p => { openSet.add(p); for (const c of nodes[p].ch) openAll(c); };
    for (const p of q) { if (used + nodes[p].fc <= 90) { used += nodes[p].fc; openAll(p); } }
    if (nodes[''].fc <= 90) for (const p of q) openAll(p);
  }
  function wantSpecs() {
    const want = new Map(); let nFiles = 0;
    const visit = (p, parentId) => {
      for (const c of (nodes[p].ch || []).slice().sort()) { const cn = nodes[c], op = isOpenF(c); want.set('d:' + c, { id: 'd:' + c, t: op ? 'h' : 'c', path: c, name: base(c), fc: cn.fc, sz: cn.sz, par: parentId }); if (op) visit(c, 'd:' + c); }
      if (p === '' || isOpenF(p)) { const all = sortedFiles(p); wantFolder(p); const cap = capOf.get(p) || FILE_CAP;
        for (const f of all.slice(0, cap)) { want.set('f:' + f.f, { id: 'f:' + f.f, t: 'f', path: f.f, name: base(f.f), ln: f.ln || 1, ib: f.ib || 0, ni: f.ni || 0, ns: f.ns || 0, par: 'd:' + p }); nFiles++; }
        if (all.length > cap) want.set('m:' + p, { id: 'm:' + p, t: 'm', path: p, name: `+${all.length - cap} more`, more: all.length - cap, par: 'd:' + p }); }
    };
    want.set('d:', { id: 'd:', t: 'r', path: '', name: st?.root || 'project', fc: nodes[''].fc, sz: nodes[''].sz, par: null }); visit('', 'd:');
    return want;
  }
  const radiusOf = n => n.t === 'r' ? 9 : n.t === 'c' ? 7 + 9 * Math.min(1, Math.sqrt((n.fc || 1) / 150)) : n.t === 'h' ? 6.5 + 4.5 * Math.min(1, Math.sqrt((n.fc || 1) / 30)) : n.t === 'f' ? 3 + 3.2 * Math.sqrt(Math.min(1, (n.ln || 1) / maxLn)) + Math.min(5.5, (n.ib || 0) * .6) : n.t === 'm' ? 3.2 : 1.9;
  const chargeOf = n => n.t === 'r' ? 3.2 : n.t === 'c' ? 1.5 + Math.sqrt(n.fc || 1) * .12 : n.t === 'h' ? 1.4 + (n.nk || 0) * .1 : n.t === 'm' ? .9 : 1 + (n.ib || 0) * .14;
  let spawnBurst = false, burstN = 0, viewInit = false, autoFit = true, pendingFit = null;
  function layout(mode) {
    if (!cv || !nodes) return; if (!budgetDone) budgetOpen(); const want = wantSpecs(), n0 = now(); let changed = false;
    if (mode === 'reveal' || !viewInit) { spawnBurst = true; burstN = 0; }
    for (const [id, sp] of want) {
      let nd = G.get(id);
      if (!nd) { const par = sp.par ? G.get(sp.par) : null; nd = { id, x: 0, y: 0, vx: 0, vy: 0, ph: Math.random() * 6.28, ap: 0, dim: 1, hv: 0, show: 0, w: 0, t0: 0, fx: null, fy: null }; G.set(id, nd); rows.push(nd); changed = true;
        if (spawnBurst) { const a = Math.random() * 6.283, d = Math.random() * 6, sp2 = 3 + Math.random() * 9; nd.x = Math.cos(a) * d; nd.y = Math.sin(a) * d; nd.vx = Math.cos(a) * sp2; nd.vy = Math.sin(a) * sp2; nd.t0 = n0 + (sp.t === 'r' ? 0 : sp.t === 'c' || sp.t === 'h' ? 120 + burstN * 22 : 300 + burstN * 6); burstN++; }
        else if (par) { nd.x = par.x + (Math.random() - .5) * 8; nd.y = par.y + (Math.random() - .5) * 8; nd.vx = (Math.random() - .5) * 3; nd.vy = (Math.random() - .5) * 3; nd.t0 = n0 + Math.random() * 120; } }
      if (nd.t !== sp.t) changed = true; Object.assign(nd, sp, { dead: false }); nd.ci = hashStr(sp.t === 'f' || sp.t === 'm' ? (sp.t === 'm' ? sp.path : sp.path.includes('/') ? sp.path.slice(0, sp.path.lastIndexOf('/')) : '') : sp.path) % 7; if (sp.t === 'f' || sp.t === 'm') nd.ci = hashStr(sp.t === 'm' ? sp.path : sp.path.includes('/') ? sp.path.slice(0, sp.path.lastIndexOf('/')) : '') % 7; nd.r = radiusOf(nd); nd.rg = nd.r;
    }
    for (let i = rows.length - 1; i >= 0; i--) { const nd = rows[i]; if (nd.t === 's') continue; if (!want.has(nd.id)) { rows.splice(i, 1); G.delete(nd.id); nd.dead = true; ghosts.push(nd); changed = true; } }
    spawnBurst = false; sTarget = Math.min(3.6, Math.max(1, Math.sqrt(rows.reduce((a, n) => a + (n.t === 's' ? 0 : n.t === 'c' || n.t === 'h' ? 2.6 : 1), 0) / 70))); if (!viewInit) { viewInit = true; sScale = sTarget; resetView(true); } else if (autoFit && Math.abs(goal.k - 1 / sTarget) > .04) resetView();
    if (changed || needRelink) relink(); alpha = Math.max(alpha, changed ? .55 : .2); pumpDetails(); kick();
    if (pendingFit) { const h = G.get('d:' + pendingFit), ks = h && (kids.get(h.id) || []).filter(x => x.t !== 's'); if (ks && ks.length > 1) { const p = pendingFit; pendingFit = null; setTimeout(() => { const h2 = G.get('d:' + p); h2 && fitTo(h2); }, 650); setTimeout(() => { const h2 = G.get('d:' + p); h2 && fitTo(h2); }, 1500); } }
  }
  // the nearest node that is actually showing for a file path (the file itself, or the folder cloud / hub that contains it)
  const visFor = f => { const fn = G.get('f:' + f); if (fn) return fn; for (let p = f; p;) { p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; const d = G.get('d:' + p); if (d) return d; if (!p) break; } return G.get('d:') || null; };
  function relink() {
    needRelink = false; linksArr.length = 0; adjM.clear(); lkey.clear(); kids.clear(); const imp = new Map(); const add = (a, b, t, extra) => { const l = { a, b, t, h: (linksArr.length * 2654435761) >>> 0, w: 1, ...extra }; linksArr.push(l); (adjM.get(a.id) || adjM.set(a.id, []).get(a.id)).push(l); (adjM.get(b.id) || adjM.set(b.id, []).get(b.id)).push(l); lkey.set(a.id + '|' + b.id, l); if (!lkey.has(b.id + '|' + a.id)) lkey.set(b.id + '|' + a.id, l); return l; };
    for (const nd of rows) { nd.nk = 0; } for (const nd of rows) { if (nd.t === 's') { const f = G.get('f:' + nd.file); if (f) { nd.fnode = f; add(f, nd, 'sym'); (kids.get('sy:' + f.id) || kids.set('sy:' + f.id, []).get('sy:' + f.id)).push(nd); } continue; } if (!nd.par) continue; const p = G.get(nd.par); if (!p) continue; nd.pn = p; p.nk = (p.nk || 0) + 1; add(p, nd, nd.t === 'f' || nd.t === 'm' ? 'in' : 'sub'); (kids.get(p.id) || kids.set(p.id, []).get(p.id)).push(nd); }
    const topOf = nd => { let x = nd; while (x.pn && x.pn.t !== 'r') x = x.pn; return x; };
    const addImp = (f, t) => { const A = visFor(f), B = visFor(t); if (!A || !B || A === B) return; const key = A.id + '>' + B.id; let l = imp.get(key); if (l) { l.w++; return; } const rev = imp.get(B.id + '>' + A.id); l = add(A, B, 'imp', { cross: topOf(A) !== topOf(B) || A.t !== 'f' || B.t !== 'f', dir: 1, w: 1 }); imp.set(key, l); if (rev) { l.w += 0; } };
    for (const [f, d] of fileC) { for (const i of d.im || []) if (i.r) addImp(f, i.r); for (const x of d.ib || []) addImp(x, f); }
    for (const l of linksArr) if (l.t === 'imp') { const r = lkey.get(l.b.id + '|' + l.a.id); if (r && r !== l && r.t === 'imp') { l.dup = r.h < l.h; } }
    { const cnt = new Map(), isF = x => x.t === 'f' || x.t === 's' || x.t === 'm'; for (const l of linksArr.filter(x => x.t === 'imp' && !isF(x.a) && !isF(x.b)).sort((a, b) => b.w - a.w)) { const ca = cnt.get(l.a.id) || 0, cb = cnt.get(l.b.id) || 0; if (ca < 3 || cb < 3) { cnt.set(l.a.id, ca + 1); cnt.set(l.b.id, cb + 1); } else l.hide = true; } }
    for (const nd of rows) { nd.r = radiusOf(nd); } layoutHomes(); setFocus(); paintStates();
  }
  function layoutHomes() { // the top-level folders (and their stuff) get a place in a tall serpentine of columns; heavily linked neighbours sit next to each other
    const tops = rows.filter(n => n.pn && n.pn.t === 'r' && n.t !== 'f' && n.t !== 'm'); if (!tops.length) return; const wgt = new Map(), idx = new Map();
    const topOf = nd => { let x = nd; while (x.pn && x.pn.t !== 'r') x = x.pn; return x; }; const cnt = new Map(); for (const nd of rows) { if (nd.t === 's') continue; const t = topOf(nd); cnt.set(t.id, (cnt.get(t.id) || 0) + 1); }
    for (const l of linksArr) if (l.t === 'imp') { const a = topOf(l.a), b = topOf(l.b); if (a === b || a.t === 'r' || b.t === 'r') continue; const k = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id; wgt.set(k, (wgt.get(k) || 0) + 1); }
    const w2 = (a, b) => wgt.get(a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id) || 0; const left = new Set(tops), ord = []; let cur = tops.slice().sort((a, b) => (cnt.get(b.id) || 0) - (cnt.get(a.id) || 0))[0];
    while (cur) { ord.push(cur); left.delete(cur); let best = null, bw = -1; for (const c of left) { const w = w2(cur, c) + (cnt.get(c.id) || 0) * .01; if (w > bw) { bw = w; best = c; } } cur = best; }
    const C = ord.length <= 16 ? 2 : ord.length <= 40 ? 3 : 4, rowsN = Math.ceil(ord.length / C), sz = ord.map(n => Math.sqrt(cnt.get(n.id) || 1) + .9), rowH = []; for (let r = 0; r < rowsN; r++) { let m = 0; for (let c = 0; c < C; c++) { const i = r * C + c; if (i < ord.length) m = Math.max(m, sz[i]); } rowH.push(m); }
    const tot = rowH.reduce((a, b) => a + b, 0); let acc = 0; const rowY = rowH.map(h => { const y = (acc + h / 2) / tot - .5; acc += h; return y; });
    ord.forEach((n, i) => { const r = Math.floor(i / C); let c = i % C; if (r % 2) c = C - 1 - c; n.home = [C === 1 ? 0 : (c / (C - 1) - .5) * 2 * .52, rowY[r] * 2 * .88]; });
  }
  function pumpDetails() { // file details give the real import lines; fetch the visible files first, then a few probes per folder cloud so clouds link to each other
    const vis = rows.filter(n => n.t === 'f' && !fileC.has(n.path) && !pendingF.has('f:' + n.path)); const k = view.k;
    vis.sort((a, b) => Math.abs(a.y * k + view.y - H / 2) - Math.abs(b.y * k + view.y - H / 2)); for (const n of vis.slice(0, 80)) wantFile(n.path);
    for (const n of rows) if (n.t === 'c' && n.fc) { if (n.probed) continue; const cand = [n.path]; const ch = (nodes[n.path].ch || []).slice().sort((a, b) => nodes[b].fc - nodes[a].fc); cand.push(...ch.slice(0, 3)); let ready = true; for (const p of cand) { if (!folderC.has(p)) { wantFolder(p); ready = false; } } if (ready) { n.probed = true; for (const p of cand) for (const f of sortedFiles(p).slice(0, 3)) wantFile(f.f); } }
  }
  function syncSyms() { // functions / classes only exist around files that are on screen and zoomed in on, to keep the simulation small
    const kr = view.k * sScale, wantS = new Map(); let count = 0;
    if (kr > 2.1 || forcedSym.size || (sel && G.get('f:' + sel))) for (const nd of rows) { if (nd.t !== 'f') continue; const forced = forcedSym.has(nd.path) || sel === nd.path; if (!forced && kr <= 2.1) continue; const X = view.x + nd.x * view.k, Y = view.y + nd.y * view.k; if (!forced && (X < -60 || X > W + 60 || Y < -60 || Y > H + 60)) continue;
      const d = fileC.get(nd.path); if (!d) { wantFile(nd.path, true); continue; } for (const s of d.sy.slice(0, 14)) { if (++count > 420) break; wantS.set('s:' + nd.path + '#' + s.n + ':' + s.l, { id: 's:' + nd.path + '#' + s.n + ':' + s.l, t: 's', name: s.n, k: s.k, l: s.l, file: nd.path, ci: nd.ci, par: nd.id, nd }); } }
    let ch = false; for (const [id, sp] of wantS) { let nd = G.get(id); if (!nd) { const f = sp.nd; nd = { id, x: f.x + (Math.random() - .5) * 6, y: f.y + (Math.random() - .5) * 6, vx: 0, vy: 0, ph: Math.random() * 6.28, ap: 0, dim: 1, hv: 0, show: 0, w: 0, t0: now(), fx: null, fy: null, r: 1.9 }; G.set(id, nd); rows.push(nd); ch = true; } Object.assign(nd, sp, { dead: false }); delete nd.nd; }
    for (let i = rows.length - 1; i >= 0; i--) { const nd = rows[i]; if (nd.t === 's' && !wantS.has(nd.id)) { rows.splice(i, 1); G.delete(nd.id); nd.dead = true; ghosts.push(nd); ch = true; } }
    if (ch) { needRelink = true; clearTimeout(relinkT); relinkT = setTimeout(relink, 60); }
  }
  // zoom decides how much of the folder tree is open: a big cloud that grows large on screen opens into its sub-folders and files; small ones fold back
  function autoOpen() {
    if (!cv || !nodes) return; const k = view.k; let changed = false, nFile = 0; for (const n of rows) if (n.t === 'f') nFile++;
    for (const nd of rows) { if (nd.t !== 'c' || !nd.fc) continue; const X = view.x + nd.x * k, Y = view.y + nd.y * k; if (X < -20 || X > W + 20 || Y < 30 || Y > H + 20) continue;
      if (footprint(nd.fc) * k >= 72 && rows.length < NODE_MAX && nFile + Math.min(nd.fc, FILE_CAP) < FILE_MAX) { autoSet.add(nd.path); closedSet.delete(nd.path); nFile += Math.min(nd.fc, FILE_CAP); changed = true; break; } }
    for (const p of [...autoSet]) { const nd = G.get('d:' + p); if (!nd) { autoSet.delete(p); continue; } if (openSet.has(p)) continue; const X = view.x + nd.x * k, Y = view.y + nd.y * k; if (footprint(nodes[p].fc) * k < 36 && !(sel && sel.startsWith(p + '/'))) { autoSet.delete(p); changed = true; } }
    if (changed) layout('soft');
  }

  // ---------- physics ----------
  function homeOf(n) { let x = n; while (x && !x.home) x = x.pn; return x ? x.home : null; }
  function stepSim() {
    simT += 16; const a = alpha, P = [], SY = []; for (const n of rows) (n.t === 's' ? SY : P).push(n);
    const hw = halfW0 * sScale, hh = halfH0 * sScale, cell = 90, grid = new Map();
    for (const n of P) { const key = Math.floor(n.x / cell) * 4096 + Math.floor(n.y / cell); (grid.get(key) || grid.set(key, []).get(key)).push(n); }
    for (const A of P) { const cx = Math.floor(A.x / cell), cy = Math.floor(A.y / cell); for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) { const b = grid.get((cx + ox) * 4096 + cy + oy); if (!b) continue; for (const B of b) { if (B.id <= A.id) continue; let dx = B.x - A.x, dy = B.y - A.y; const d2 = dx * dx + dy * dy; if (d2 > 8100) continue; const d = Math.sqrt(d2) + .01, rr = A.r + B.r + 4, qa = chargeOf(A), qb = chargeOf(B);
      let f = 520 * qa * qb / (d2 + 120); if (d < rr) f += (rr - d) * .5; f *= a * .9 + .1; const ux = dx / d, uy = dy / d; A.vx -= ux * f * .5 / qa; A.vy -= uy * f * .5 / qa; B.vx += ux * f * .5 / qb; B.vy += uy * f * .5 / qb; } } }
    for (const l of linksArr) { const A = l.a, B = l.b; if (A.dead || B.dead || l.hide) continue; const dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) + .01; let rest, kk;
      if (l.t === 'in') { rest = 22 + (A.nk || 1) * .5 + Math.sqrt(Math.min(B.ln || 1, 3000)) * .3 - Math.min(14, (B.ib || 0) * 2.2) + A.r * .6; kk = .05; } else if (l.t === 'imp') { rest = l.cross ? 95 : 36; kk = (l.cross ? (A.t === 'f' && B.t === 'f' ? .0018 : .0004) : .014) * Math.min(3, 1 + Math.log2(l.w)); } else if (l.t === 'sym') { rest = 9 + A.r; kk = .22; } else { rest = A.t === 'r' ? 110 : 52 + (B.t === 'c' ? B.r : B.r * .5) + A.r * .5; kk = A.t === 'r' ? .002 : .025; }
      const f = (d - rest) * kk * (.4 + .6 * a), ux = dx / d, uy = dy / d; if (l.t === 'sym') { B.vx -= ux * f * 2; B.vy -= uy * f * 2; A.vx += ux * f * .05; A.vy += uy * f * .05; } else { A.vx += ux * f; A.vy += uy * f; B.vx -= ux * f; B.vy -= uy * f; } }
    for (const n of P) { if (n.t === 'r') { n.vx -= n.x * .02; n.vy -= n.y * .02; continue; } const h = n.pn && n.pn.t === 'r' ? n.home : null; if (h) { n.vx += (h[0] * hw - n.x) * .11 * (.6 + .4 * a); n.vy += (h[1] * hh - n.y) * .11 * (.6 + .4 * a); } else if (n.t === 'f') { const t = homeOf(n); if (t) { n.vx += (t[0] * hw - n.x) * .003; n.vy += (t[1] * hh - n.y) * .003; } } }
    for (const n of SY) { const f = n.fnode; if (!f) continue; for (const o of kids.get('sy:' + f.id) || []) { if (o === n) continue; const dx = n.x - o.x, dy = n.y - o.y, d2 = dx * dx + dy * dy + .1; if (d2 < 200) { const d = Math.sqrt(d2), p = (14 - d) * .05; n.vx += dx / d * p; n.vy += dy / d * p; } } const dx = n.x - f.x, dy = n.y - f.y, d2 = dx * dx + dy * dy; if (d2 < 36) { const d = Math.sqrt(d2) + .01; n.vx += dx / d * .3; n.vy += dy / d * .3; } }
    const t = simT; for (const n of rows) { n.vx += Math.sin(t * .0011 + n.ph) * .02 + Math.sin(t * .0023 + n.ph * 2.1) * .01; n.vy += Math.cos(t * .0009 + n.ph * 1.3) * .02 + Math.cos(t * .0021 + n.ph) * .01;
      const ex = n.x / hw, ey = n.y / hh, e = ex * ex + ey * ey; if (e > 1) { const m = Math.sqrt(e), p = (m - 1) * .35; n.vx -= n.x / hw * p * 6; n.vy -= n.y / hh * p * 6; }
      if (n.fx != null) { n.x += (n.fx - n.x) * .45; n.y += (n.fy - n.y) * .45; n.vx = n.vy = 0; continue; } n.vx *= .84; n.vy *= .84; const sp = Math.hypot(n.vx, n.vy); if (sp > 14) { n.vx *= 14 / sp; n.vy *= 14 / sp; } n.x += n.vx; n.y += n.vy; }
    for (const gn of ghosts) { const p = gn.pn; if (p) { gn.x += (p.x - gn.x) * .12; gn.y += (p.y - gn.y) * .12; } }
    alpha = Math.max(.12, alpha * .994);
  }

  // ---------- focus / selection ----------
  let hover = null, qset = null, focusSet = null, focusNode = null, focusAmt = 0, pulses = [], chain = [], rings = [], litMap = new Map(), litAnc = new Map(), trailMap = new Map(), drag = null;
  const nbrs = n => { const s = new Set([n]); if (n.t === 'f') { if (n.pn) s.add(n.pn); } if (n.t === 's' && n.fnode) s.add(n.fnode); for (const l of adjM.get(n.id) || []) { const o = l.a === n ? l.b : l.a; if (n.t === 'h' || n.t === 'c' || n.t === 'r') { if (l.t !== 'sym') s.add(o); } else if (l.t === 'imp' || l.t === 'sym') s.add(o); }
    if (n.t === 'f' && sel === n.path && links) for (const f of [...links.im, ...links.ib]) { const v = visFor(f); if (v) s.add(v); } return s; };
  function setFocus() { const fn = hover ? G.get(hover) : sel ? (G.get('f:' + sel) || G.get('d:' + sel)) : null; focusNode = fn || null; focusSet = fn ? nbrs(fn) : qset; }
  function setHover(n) { const id = n ? n.id : null; if (id === hover) return; hover = id; box && (box.style.cursor = n ? 'pointer' : ''); setFocus(); kick(); }
  async function select(f, relayout) {
    sel = f; links = null; linkT0 = now(); setFocus(); showCard(); paintStates(); if (!f) return;
    const j = await api(`links?g=${encodeURIComponent(g)}&f=${encodeURIComponent(f)}`); if (sel !== f || !j?.ok) return; links = j; linkT0 = now(); setFocus(); showCard(); paintStates();
  }
  let linkT0 = 0;
  function showCard() {
    if (!card) return; if (!sel) { card.classList.remove('on'); return; } const nd = G.get('f:' + sel) || G.get('d:' + sel), isF = !!G.get('f:' + sel) || !!fileC.get(sel);
    if (!isF) { const p = sel, n = nodes[p]; card.innerHTML = `<button class="x" aria-label="Close">×</button><b>${e(p || 'project')}</b><div class="st">${n ? n.fc.toLocaleString() + ' files' : ''}${n?.ch?.length ? ' · ' + n.ch.length + ' sub-folders' : ''}</div><div class="chips"><button data-fold="${e(p)}">${isOpenF(p) ? 'Collapse' : 'Open'}</button></div>`; card.classList.add('on'); return; }
    const d = fileC.get(sel), im = links?.im || [], ib = links?.ib || [], ni = links ? im.length : (nd?.ni || 0), nb = links ? ib.length : (nd?.ib || 0);
    const chips = [...im.map(f => [f, 'im']), ...ib.map(f => [f, 'ib'])].slice(0, 14);
    card.innerHTML = `<button class="x" aria-label="Close">×</button><b>${e(sel)}</b><div class="st">${(d?.ln ?? nd?.ln ?? '')} lines · ${d ? d.sy.length : (nd?.ns ?? 0)} symbols · imports ${ni} · imported by ${nb}</div><div class="chips">${chips.map(([f, k2]) => `<button data-f="${e(f)}" style="box-shadow:inset 0 0 0 1px ${k2 === 'im' ? rgba(COL.im, .6) : rgba(COL.ib, .6)}">${e(base(f))}</button>`).join('')}${im.length + ib.length > 14 ? `<span class="more">+${im.length + ib.length - 14}</span>` : ''}</div>`; card.classList.add('on');
  }
  function flyTo(n, k) { autoFit = false; goal.k = k; goal.x = W / 2 - n.x * k; goal.y = cy0 - n.y * k + 10; kick(); }
  function fitTo(h) { autoFit = false; const m = (kids.get(h.id) || []).filter(x => x.t !== 's'); if (!m.length) { flyTo(h, Math.max(goal.k, 1.6)); return; } let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const n of [h, ...m]) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); } const k = Math.min(3, Math.max(.5, Math.min((W - 60) / (x1 - x0 + 60), (H - 170) / (y1 - y0 + 60)))); goal.k = k; goal.x = W / 2 - (x0 + x1) / 2 * k; goal.y = cy0 - (y0 + y1) / 2 * k - 20; kick(); }

  // ---------- main loop ----------
  const now = () => performance.now();
  let lastT = 0, openT2 = 0, frameN = 0, qual = 1, avgDt = .016, slowN = 0; // qual: the canvas drops to a coarser pixel grid if a slow machine can't keep up
  const kick = () => { if (!raf && cv && open) { lastT = now(); raf = requestAnimationFrame(loop); } };
  function loop(ts) {
    raf = requestAnimationFrame(loop); if (!cv || !cv.isConnected || !open) { cancelAnimationFrame(raf); raf = 0; return; }
    const dt = Math.min(.05, Math.max(.001, (ts - lastT) / 1000)); lastT = ts; const rd = reduce(); frameN++; avgDt += (dt - avgDt) * .08; if (avgDt > .034 && qual > .5 && !drag) { if (++slowN > 40) { slowN = 0; qual = qual > .8 ? .75 : .55; avgDt = .02; fitCanvas(); } } else slowN = 0;
    if ((!rd || alpha > .13) && (rows.length < 260 || (frameN & 1))) { stepSim(); if (dt > .03) stepSim(); }
    sScale += (sTarget - sScale) * .03;
    const fz = rd ? 1 : 1 - Math.exp(-dt * 10); for (const kk of ['x', 'y', 'k']) { const d = goal[kk] - view[kk]; view[kk] = Math.abs(d) < (kk === 'k' ? .0005 : .05) ? goal[kk] : view[kk] + d * fz; }
    if (drag && drag.node) { drag.node.fx = (drag.px - view.x) / view.k; drag.node.fy = (drag.py - view.y) / view.k; }
    if (ts - openT2 > 260) { openT2 = ts; autoOpen(); syncSyms(); }
    render(now());
  }

  // ---------- drawing ----------
  const ss = (k, a, b) => { const t = Math.min(1, Math.max(0, (k - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const sx = n => view.x + n.x * view.k, sy = n => view.y + n.y * view.k, rS = n => n.r * Math.pow(view.k * Math.max(1, sScale * .6), .55);
  const ring = (x, y, r, c, a, w) => { ctx.strokeStyle = rgba(c, a); ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); };
  const glow = (c, x, y, R) => { if (R > 64) R = 64 + (R - 64) * .15; ctx.drawImage(glowSprite(c), x - R, y - R, R * 2, R * 2); };
  const ell = (t, max) => { if (max <= 8) return ''; if (ctx.measureText(t).width <= max) return t; let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ctx.measureText(t.slice(0, m) + '…').width <= max) lo = m; else hi = m - 1; } return lo ? t.slice(0, lo) + '…' : ''; };
  function poly(a, b, l) { const ax = sx(a), ay = sy(a), bx = sx(b), by = sy(b); if (l.t === 'imp' || l.t === 'sub') { const dx = bx - ax, dy = by - ay, ad = Math.min(Math.abs(dx), Math.abs(dy)), s1 = Math.sign(dx), s2 = Math.sign(dy); return (l.h & 2) ? [[ax, ay], [ax + s1 * ad, ay + s2 * ad], [bx, by]] : Math.abs(dx) >= Math.abs(dy) ? [[ax, ay], [ax + s1 * (Math.abs(dx) - ad), ay], [bx, by]] : [[ax, ay], [ax, ay + s2 * (Math.abs(dy) - ad)], [bx, by]]; } return [[ax, ay], [bx, by]]; }
  const plen = p => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; };
  function pAt(p, L, t) { let d = t * L; for (let i = 1; i < p.length; i++) { const s = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (d <= s || i === p.length - 1) { const u = s ? Math.min(1, d / s) : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * u, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * u]; } d -= s; } return p[p.length - 1]; }
  function strokePoly(p, L, t0, t1) { ctx.beginPath(); const s = pAt(p, L, t0); ctx.moveTo(s[0], s[1]); let d = t0 * L; for (let i = 1; i < p.length; i++) { const sg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (d + sg > t0 * L && d < t1 * L) ctx.lineTo(...(d + sg > t1 * L ? pAt(p, L, t1) : p[i])); d += sg; } ctx.stroke(); }
  const linkFor = (a, b) => lkey.get(a.id + '|' + b.id) || { t: 'imp', h: (a.id.length * 7 + b.id.length * 13) >>> 0, cross: true };
  const lbRects = []; const rectHit = (x, y, w, h) => { for (const r of lbRects) if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return true; return false; };
  // text is expensive on a canvas (shaping + outlining), so each label is drawn once into a small cached bitmap and then just stamped
  const wcache = new Map(), lcache = new Map();
  function textW(font, txt) { const k = font + '|' + txt; let w = wcache.get(k); if (w == null) { ctx.font = font; w = ctx.measureText(txt).width; wcache.set(k, w); if (wcache.size > 4000) wcache.clear(); } return w; }
  function labelBmp(txt, font, color, w) { const k = dpr + font + '|' + color + '|' + txt; let b = lcache.get(k); if (b) return b; const c = document.createElement('canvas'); c.width = Math.ceil((w + 8) * dpr); c.height = Math.ceil(20 * dpr); const x = c.getContext('2d'); x.scale(dpr, dpr); x.font = font; x.textBaseline = 'middle'; x.lineJoin = 'round'; x.lineWidth = 3; x.strokeStyle = 'rgba(13,13,17,.7)'; x.strokeText(txt, 4, 10); x.fillStyle = color.replace('A', '1'); x.fillText(txt, 4, 10); b = c; lcache.set(k, b); if (lcache.size > 900) { lcache.clear(); lcache.set(k, b); } return b; }
  function label(txt, x, y, font, color, center, al, force) { const w = textW(font, txt), lx = center ? x - w / 2 : x; if (lx < 3 || lx + w > W - 3) { if (!force) return 0; } if (!force && rectHit(lx - 2, y - 7, w + 4, 14)) return 0; lbRects.push([lx - 2, y - 7, w + 4, 14]); ctx.globalAlpha = al; ctx.drawImage(labelBmp(txt, font, color, w), lx - 4, y - 10, w + 8, 20); ctx.globalAlpha = 1; return w; }
  const visK = n => { const kr = view.k * sScale; return n.t === 's' ? Math.max(ss(kr, 2.1, 3), n.show) : n.t === 'f' || n.t === 'm' ? .38 + .62 * ss(kr, .9, 1.5) : 1; };

  function render(n) {
    const k = view.k, kr = k * sScale, FONT = fam; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); lbRects.length = 0;
    const blobA = 1 - .5 * ss(kr, 2, 4.2), L1 = ss(kr, 1.15, 1.6), L2 = ss(kr, 1.6, 2.1), L3 = ss(kr, 3.5, 4.2), lk = [190, 180, 190];
    focusAmt += ((focusSet ? 1 : 0) - focusAmt) * .14;
    const list = rows, all = ghosts.length ? list.concat(ghosts) : list;
    for (const nd of all) { nd.ap = nd.dead ? Math.max(0, nd.ap - .06) : n < nd.t0 ? 0 : Math.min(1, nd.ap + .045); const tgt = focusSet ? (focusSet.has(nd) ? 1 : (hover || sel ? .13 : .2)) : 1; nd.dim += (tgt - nd.dim) * .16; nd.hv += ((nd.id === hover ? 1 : 0) - nd.hv) * .2;
      if (nd.t === 's') { const f = nd.fnode, sw = f && ((sel === f.path) || hover === f.id || hover === nd.id || forcedSym.has(f.path)) ? 1 : 0; nd.show += (sw - nd.show) * .12; if (qset && qset.has(nd)) nd.show = Math.max(nd.show, .9); } }
    for (let i = ghosts.length - 1; i >= 0; i--) if (ghosts[i].ap <= 0) ghosts.splice(i, 1);
    // folder halos: a soft dashed cloud around each opened folder's contents, a glow when an agent is working inside
    for (const h of list) { if (h.t !== 'h' && h.t !== 'c') continue; const mem = h.t === 'h' ? (kids.get(h.id) || []).filter(x => x.t !== 's') : []; let X, Y, R, a;
      if (h.t === 'h') { if (!mem.length) continue; let mx = h.x, my = h.y, cnt = 1; for (const m of mem) { if (m.ap < .05) continue; mx += m.x; my += m.y; cnt++; } mx /= cnt; my /= cnt; let r = 16; for (const m of mem) r = Math.max(r, Math.hypot(m.x - mx, m.y - my) + m.r + 8); h.cx = mx; h.cy = my; h.cr = r; X = view.x + mx * k; Y = view.y + my * k; R = r * k; a = blobA * Math.min(1, h.ap * 1.2); }
      else { h.cx = h.x; h.cy = h.y; h.cr = h.r * 1.9; X = view.x + h.x * k; Y = view.y + h.y * k; R = rS(h) * 2.2; a = Math.min(1, h.ap) * (1 - .6 * ss(kr, 3, 5)); }
      if (X + R < -20 || X - R > W + 20 || Y + R < -20 || Y - R > H + 20) continue; const col = colOf(h), dm = h.dim; a *= dm; const L = litAnc.get(h.id);
      ctx.globalCompositeOperation = 'lighter'; if (R < 170) { ctx.globalAlpha = a * (h.t === 'c' ? .9 : .5); ctx.fillStyle = rgba(col, h.t === 'c' ? .09 : .06); ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.fill(); }
      if (R < 520) { ctx.globalAlpha = a * .8; if (R < 200) { ctx.setLineDash([3, 5]); ctx.lineDashOffset = -n / 90; } ring(X, Y, R, col, h.t === 'c' ? .5 : .34, 1); ctx.setLineDash([]); }
      if (L) { if (L.read) { ctx.globalAlpha = (.55 + .3 * Math.sin(n / 330)) * dm; glow(BL, X, Y, R * 2.1); } if (L.edit) { ctx.globalAlpha = (.6 + .3 * Math.sin(n / 140)) * dm; glow(YL, X, Y, R * 2.3); } }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    // links
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const fade = 1 - .82 * focusAmt;
    const batch = (types, alp, w, filter) => { ctx.strokeStyle = `rgba(${lk[0]},${lk[1]},${lk[2]},${alp * fade})`; ctx.lineWidth = w; ctx.beginPath(); let any = false;
      for (const l of linksArr) { if (!types.includes(l.t)) continue; const a = l.a, b = l.b; if (a.ap < .5 || b.ap < .5 || a.dead || b.dead) continue; if (l.t === 'sym' && Math.max(ss(kr, 2.1, 3), a.show) < .05) continue; if (filter && !filter(l)) continue;
        const ax = sx(a), ay = sy(a), bx = sx(b), by = sy(b); const onA = ax > -40 && ax < W + 40 && ay > -40 && ay < H + 40, onB = bx > -40 && bx < W + 40 && by > -40 && by < H + 40; if (!onA && !onB) continue; any = true; ctx.moveTo(ax, ay);
        if (l.t === 'imp' || l.t === 'sub') { const p = poly(a, b, l); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(bx, by); } else ctx.lineTo(bx, by); }
      if (any) ctx.stroke(); };
    batch(['sub'], .12, .9); batch(['in'], .08 + .05 * (1 - ss(kr, .9, 1.5)), .8); batch(['imp'], .17, 1, l => !l.cross && !l.dup && !l.hide); batch(['imp'], .2 * (1 - .55 * ss(kr, 1.8, 4)), 1.2, l => l.cross && !l.dup && !l.hide && l.w < 3); batch(['imp'], .26 * (1 - .4 * ss(kr, 1.8, 4)), 1.8, l => l.cross && !l.dup && !l.hide && l.w >= 3); if (kr > 2) { ctx.globalAlpha = ss(kr, 2.1, 3); batch(['sym'], .22, .7); ctx.globalAlpha = 1; }
    // everything touching the focused node lights up, drawn in, flowing the way the import goes
    const fn = focusNode; if (fn && fn.t !== 'r') { const rdm = reduce(); let i = 0; const extra = [];
      if (fn.t === 'f' && sel === fn.path && links) { for (const f of links.im) { const t = visFor(f); if (t && t !== fn) extra.push([fn, t, 'out']); } for (const f of links.ib) { const t = visFor(f); if (t && t !== fn) extra.push([t, fn, 'in']); } }
      const seen = new Set(); const draw1 = (a, b, l, mode) => { if (a.ap < .5 || b.ap < .5) return; const incoming = mode ? mode === 'in' : (l.t === 'imp' && b === fn), out = mode ? mode === 'out' : (l.t === 'imp' && a === fn), col = out ? COL.im : incoming ? COL.ib : null, prog = rdm || fn.id === hover ? 1 : ease((n - linkT0 - (i++) * 40) / 700); if (prog <= 0) return; const p = poly(a, b, l), L = plen(p);
        if (!col) { ctx.strokeStyle = `rgba(${lk[0]},${lk[1]},${lk[2]},${.55 * focusAmt})`; ctx.lineWidth = 1.2; strokePoly(p, L, 0, 1); return; }
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(col, .16 * prog * focusAmt); ctx.lineWidth = 6; strokePoly(p, L, 0, prog); ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = rgba(col, .95 * Math.min(1, focusAmt * 1.5)); ctx.lineWidth = 1.5; if (prog >= 1 && !rdm) { ctx.setLineDash([5, 6]); ctx.lineDashOffset = -(n / 38) % 11 * (incoming ? -1 : 1); } strokePoly(p, L, 0, prog); ctx.setLineDash([]); };
      for (const [a, b, m] of extra) { seen.add(a.id + b.id); draw1(a, b, linkFor(a, b), m); } for (const l of adjM.get(fn.id) || []) { if (l.t === 'sym' && ss(kr, 2.1, 3) < .05 && fn.show < .1) continue; if (seen.has(l.a.id + l.b.id) || seen.has(l.b.id + l.a.id)) continue; draw1(l.a, l.b, l, null); } }
    chain = chain.filter(c => n - c.t0 < 4200); for (const c of chain) { const l = linkFor(c.a, c.b), p = poly(c.a, c.b, l), L = plen(p), f = 1 - Math.max(0, (n - c.t0 - 1200) / 3000); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(BL, .22 * f); ctx.lineWidth = 6; strokePoly(p, L, 0, 1); ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = rgba(BL, .8 * f); ctx.lineWidth = 1.5; strokePoly(p, L, 0, 1); }
    pulses = pulses.filter(p => n - p.t0 < 1300); for (const p of pulses) { const l = linkFor(p.a, p.b), pl = poly(p.a, p.b, l), L = plen(pl), t = ease((n - p.t0) / 1000); ctx.globalCompositeOperation = 'lighter'; for (let j = 0; j < 7; j++) { const q = pAt(pl, L, Math.max(0, t - j * .022)); ctx.globalAlpha = (1 - j / 7) * .95 * (n - p.t0 < 1000 ? 1 : 0); glow(BL, q[0], q[1], 15 - j * 1.6); } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    // node glows (additive), then cores / rings, then labels
    ctx.globalCompositeOperation = 'lighter'; const drawn = [];
    for (const nd of all) { if (nd.ap < .02) continue; const v = visK(nd); if (v < .03) continue; const X = sx(nd), Y = sy(nd); if (X < -50 || X > W + 50 || Y < -50 || Y > H + 50) continue; drawn.push(nd); const R = rS(nd) * (.4 + .6 * ease(nd.ap)), col = colOf(nd), big = (nd.t === 'r' ? 7 : nd.t === 'c' ? 5 : nd.t === 'h' ? 6 : nd.t === 'f' ? 4.2 : 3) * .75, al = nd.ap * nd.dim * v, isSel = sel && (nd.id === 'f:' + sel || nd.id === 'd:' + sel);
      ctx.globalAlpha = Math.min(1, al * (.42 + nd.hv * .5 + (isSel ? .45 : 0) + (nd.t === 'f' ? Math.min(.35, (nd.ib || 0) * .04) : 0))); glow(col, X, Y, Math.min(R * big, nd.t === 's' ? 14 : nd.t === 'f' || nd.t === 'm' ? 30 : 80));
      const L = litMap.get(nd.id); if (L) { if (L.read) { ctx.globalAlpha = Math.min(1, nd.ap * (.8 + .2 * Math.sin(n / 290))); glow(BL, X, Y, R * 9 + 8); glow(BL, X, Y, R * 3.6); } if (L.edit) { ctx.globalAlpha = Math.min(1, nd.ap * (.8 + .2 * Math.sin(n / 125))); glow(YL, X, Y, R * 11 + 8); glow(YL, X, Y, R * 4.4); } }
      const T0 = trailMap.get(nd.id); if (T0 != null && !(L && L.edit)) { const age = n - T0; if (age < 12600) { ctx.globalAlpha = Math.min(1, nd.ap * (age < 650 ? 1 : .55 * (1 - (age - 650) / 11950))); glow(YL, X, Y, R * (age < 650 ? 10 : 7)); } } }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.textBaseline = 'middle';
    for (const nd of drawn) { const v = visK(nd), X = sx(nd), Y = sy(nd), R = Math.max(1.3, rS(nd) * (.4 + .6 * ease(nd.ap))), col = colOf(nd), al = nd.ap * nd.dim * v, isSel = sel && (nd.id === 'f:' + sel || nd.id === 'd:' + sel);
      ctx.globalAlpha = al; ctx.drawImage(coreSprite(col), X - R, Y - R, R * 2, R * 2); ctx.globalAlpha = 1;
      if (nd.t === 'h' || nd.t === 'r' || nd.t === 'c') ring(X, Y, R + 3 + nd.hv, col, .4 * al, 1);
      if (isSel) ring(X, Y, R + 4 + Math.sin(n / 400) * .8, '#FFFFFF', .95 * al, 1.6); else if (focusNode && focusSet && focusSet.has(nd) && nd !== focusNode && nd.t !== 's') ring(X, Y, R + 3, '#FFFFFF', .45 * al * focusAmt, 1.1);
      if (qset && qset.has(nd)) ring(X, Y, R + 4 + Math.sin(n / 260) * 1.2, '#FFFFFF', .9 * al, 1.5);
      const L = litMap.get(nd.id); if (L) { if (L.read) ring(X, Y, R + 4.5, BL, (.7 + .3 * Math.sin(n / 290)) * nd.ap, 1.7); if (L.edit) ring(X, Y, R + (L.read ? 8 : 4.5), YL, (.8 + .2 * Math.sin(n / 125)) * nd.ap, 2); }
      const T0 = trailMap.get(nd.id); if (T0 != null && !(L && L.edit)) { const age = n - T0; if (age < 12600) { if (age < 650) ring(X, Y, R + 4 + age / 650 * 16, YL, 1 - age / 650, 2.2); ring(X, Y, R + 4, YL, .75 * (1 - age / 12600), 1.5); } }
      for (const h of rings) if (h.id === nd.id) { const u = (n - h.t0) / 1300; if (u < 1) ring(X, Y, R + 4 + ease(u) * 22, '#FFFFFF', (1 - u) * .9 * al, 2); } }
    // labels, most important first, never overlapping: folders and clouds, then hub files, then other files, then functions
    ctx.textAlign = 'left'; const hubLA = 1 - .45 * ss(kr, 3, 5);
    for (const h of drawn.filter(x => x.t === 'h' || x.t === 'c' || x.t === 'r').sort((a, b) => (b.fc || 0) - (a.fc || 0))) { const al = Math.min(1, h.ap * 1.3) * h.dim * hubLA; if (al < .05) continue; const X = h.t === 'h' && h.cx != null ? view.x + h.cx * k : sx(h), Y0 = h.t === 'h' && h.cy != null ? view.y + h.cy * k - h.cr * k - 5 : sy(h) + rS(h) * 1.4 + 11; const Y = Math.min(H - 8, Math.max(62, Y0)); if (h.t === 'r' && kr > 1.5) continue;
      const cnt = (h.t === 'c' ? ` ${fmtN(h.fc)}` : ''); label((h.t === 'r' ? h.name : h.path.replace(/^.*\//, '') || h.name) + cnt, X, Y, `600 ${(11.5 + Math.min(2, kr * .5)).toFixed(1)}px ${FONT}`, 'rgba(243,233,220,A)', true, al, false); }
    if (L1 > .02) { const fl = drawn.filter(x => x.t === 'f' && x.ap > .5).sort((a, b) => (b.ib || 0) - (a.ib || 0)); for (const nd of fl) { const hubby = (nd.ib || 0) >= 3, q = hubby ? L1 : L2; if (q < .05) continue; const X = sx(nd), Y = sy(nd); if (Y < 8 || Y > H - 4) continue; const al = q * nd.dim * nd.ap; if (al < .05) continue; const w = label(nd.name, X + rS(nd) + 4, Y, `${hubby ? 600 : 450} 10.5px ${FONT}`, hubby ? 'rgba(236,238,246,A)' : 'rgba(184,190,206,A)', false, al, nd === focusNode || sel === nd.path);
        if (w && nd.ib && X + rS(nd) + 8 + w + 22 < W) { const bx = X + rS(nd) + 4 + w + 5, bw = String(nd.ib).length * 6 + 11, hot = focusSet && focusSet.has(nd); ctx.fillStyle = rgba(COL.ib, (hot ? .3 : .14) * al); ctx.beginPath(); ctx.roundRect(bx, Y - 6.5, bw, 13, 6.5); ctx.fill(); ctx.strokeStyle = rgba(COL.ib, (hot ? .8 : .4) * al); ctx.lineWidth = 1; ctx.stroke(); ctx.font = `600 9.5px ${FONT}`; ctx.fillStyle = rgba(COL.ib, al); ctx.textAlign = 'center'; ctx.fillText(String(nd.ib), bx + bw / 2, Y + .5); ctx.textAlign = 'left'; } } }
    for (const nd of drawn) if (nd.t === 'm') { const al = nd.ap * nd.dim; if (al > .1 && kr > .8) label(nd.name, sx(nd) + rS(nd) + 4, sy(nd), `450 10px ${FONT}`, 'rgba(150,156,172,A)', false, al * .9); }
    if (focusNode && focusNode.t === 'f' && L1 < .05) for (const nd of focusSet) if (nd.t === 'f') label(nd.name, sx(nd) + rS(nd) + 4, sy(nd), `500 10.5px ${FONT}`, 'rgba(236,238,246,A)', false, nd.dim * focusAmt, nd === focusNode);
    if (L3 > .02 || qset) for (const nd of drawn) { if (nd.t !== 's') continue; const v = Math.max(L3 * ss(kr, 2.1, 3), nd.show * (kr > 1.6 ? 1 : 0)); if (v < .05 || nd.ap < .5) continue; const Y = sy(nd); if (Y < 8 || Y > H - 4) continue; label(nd.name, sx(nd) + rS(nd) + 4, Y, `450 9.5px ${FONT}`, 'rgba(160,166,186,A)', false, Math.min(1, v) * nd.dim); }
    tip(); rings = rings.filter(h => n - h.t0 < 1400);
  }
  function tip() { // hover card: what it is, and the agent's name when one is working on it
    const hn = hover && G.get(hover); if (!hn || hn.ap < .6) return; const n = hn, X = sx(n), Y = sy(n), L = litMap.get(n.id) || litAnc.get(n.id), l1 = n.t === 's' || n.t === 'r' ? n.name : n.path || n.name, l2 = n.t === 'f' ? `${(n.ln || 0).toLocaleString()} lines${n.ib ? ' · imported by ' + n.ib : ''}${n.ni ? ' · imports ' + n.ni : ''}` : n.t === 's' ? `${n.k} · line ${n.l}` : n.t === 'm' ? 'click to show more' : `${(n.fc || 0).toLocaleString()} files${n.t === 'c' ? ' · click to open' : ''}`, l3 = L && !L.rolled ? [...L.names].join(', ') + (L.edit ? ' is editing' : ' is reading') : '';
    ctx.textBaseline = 'top'; ctx.font = `600 11px ${fam}`; const t1 = ell(l1.length > 38 ? '…' + l1.slice(-37) : l1, W - 40), w1 = ctx.measureText(t1).width; ctx.font = `400 10.5px ${fam}`; const w = Math.min(W - 12, Math.max(w1, ctx.measureText(l2).width, ctx.measureText(l3).width) + 20), h = 36 + (l3 ? 14 : 0), x = Math.min(W - w - 6, Math.max(6, X - w / 2)); let y = Y - rS(n) - h - 8; if (y < 50) y = Y + rS(n) + 10;
    ctx.fillStyle = 'rgba(24,24,30,.94)'; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ECECF1'; ctx.font = `600 11px ${fam}`; ctx.fillText(t1, x + 10, y + 7); ctx.font = `400 10.5px ${fam}`; ctx.fillStyle = '#8D92A3'; ctx.fillText(l2, x + 10, y + 22); if (l3) { ctx.fillStyle = L.edit ? YL : BL; ctx.fillText(l3, x + 10, y + 36); } ctx.textBaseline = 'middle';
  }

  // ---------- agents: highlights, roll-up into folders, trails ----------
  let lastAct = null;
  function paintStates() {
    if (!cv) return; if (act !== lastAct) { lastAct = act; actLocal = now(); }
    litMap = new Map(); litAnc = new Map(); trailMap = new Map();
    const add = (f, kind, who) => { const v = visFor(f); if (!v) return; let s = litMap.get(v.id); if (!s) litMap.set(v.id, s = { read: 0, edit: 0, names: new Set(), rolled: v.id !== 'f:' + f }); s[kind]++; s.names.add(who);
      for (let x = v.pn || (v.t === 'f' ? null : null); x; x = x.pn) { let c = litAnc.get(x.id); if (!c) litAnc.set(x.id, c = { read: 0, edit: 0, names: new Set(), rolled: true }); c[kind]++; c.names.add(who); } };
    for (const a of act.active || []) add(a.file, a.kind === 'edit' ? 'edit' : 'read', a.agent);
    for (const d of act.done || []) { const v = visFor(d.file); if (!v) continue; const t = actLocal - (act.now - d.at); if (now() - t < 12600) trailMap.set(v.id, Math.max(trailMap.get(v.id) ?? -1e12, t)); }
    kick();
  }
  const pulse = (from, to) => { const a = visFor(from), b = visFor(to); if (!a || !b || a === b || reduce()) return; pulses.push({ a, b, t0: now() }); chain.push({ a, b, t0: now() }); kick(); };

  // ---------- interaction ----------
  function hit(px, py) { let best = null, bd = 1e9; for (const nd of rows) { if (nd.ap < .5) continue; if (visK(nd) < .35) continue; const d = Math.hypot(sx(nd) - px, sy(nd) - py), rr = Math.max(7, rS(nd) + 4) + (nd.t === 'h' || nd.t === 'c' ? 6 : 0); if (d < rr && d - rr < bd) { bd = d - rr; best = nd; } } return best; }
  function wire() {
    const ptrs = new Map(); let pinch = null; const quiet = e2 => e2.target.closest('.cm-res, .cm-search, .cm-zb, .cm-card'), rel = ev => { const r = box.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    box.addEventListener('pointerdown', ev => { if (ev.button || quiet(ev)) return; ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: goal.k }; if (drag?.node) drag.node.fx = drag.node.fy = null; drag = null; return; }
      const [px, py] = rel(ev), nd = hit(px, py); drag = { x: ev.clientX, y: ev.clientY, vx: goal.x, vy: goal.y, moved: false, id: ev.pointerId, node: nd && nd.t !== 'r' ? nd : null, px, py, nd0: nd }; if (nd) box.setPointerCapture?.(ev.pointerId); });
    onWin('pointermove', ev => { if (!box) return; const pt = ptrs.get(ev.pointerId);
      if (!pt) { if (ev.pointerType === 'mouse') { if (box.contains(ev.target) && !quiet(ev)) { const [px, py] = rel(ev); setHover(hit(px, py)); } else if (hover) setHover(null); } return; }
      pt.x = ev.clientX; pt.y = ev.clientY; if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1; zoomAt(pinch.k * d / pinch.d / goal.k, (a.x + b.x) / 2, (a.y + b.y) / 2, true); return; }
      if (!drag || ev.pointerId !== drag.id) return; const [px, py] = rel(ev); drag.px = px; drag.py = py; const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) { drag.moved = true; if (drag.node) { alpha = Math.max(alpha, .7); setHover(drag.node); } else box.classList.add('cm-pan'); }
      if (!drag.node) { autoFit = false; goal.x = view.x = drag.vx + dx; goal.y = view.y = drag.vy + dy; kick(); } else alpha = Math.max(alpha, .45); });
    const up = ev => { if (!box || !ptrs.delete(ev.pointerId)) return; if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; } if (!drag || ev.pointerId !== drag.id) return; box.classList.remove('cm-pan'); const was = drag; drag = null; if (was.node) { was.node.fx = was.node.fy = null; alpha = Math.max(alpha, .5); }
      if (was.moved || ev.type === 'pointercancel') return; if (was.nd0) clickNode(was.nd0); else if (box.contains(ev.target) && !quiet(ev)) select(null); };
    onWin('pointerup', up); onWin('pointercancel', up); box.addEventListener('pointerleave', () => { if (!drag) setHover(null); });
    box.addEventListener('wheel', ev => { ev.preventDefault(); zoomAt(Math.exp(-ev.deltaY * (ev.ctrlKey ? .01 : .0016)), ev.clientX, ev.clientY); }, { passive: false });
    body.querySelector('.cm-zb').addEventListener('click', ev => { const b = ev.target.closest('[data-z]'); if (!b) return; if (+b.dataset.z === 0) { resetView(false, true); return; } const r = box.getBoundingClientRect(); zoomAt(+b.dataset.z > 0 ? 1.4 : 1 / 1.4, r.left + r.width / 2, r.top + r.height / 2); });
    card.addEventListener('click', ev => { if (ev.target.closest('.x')) { select(null); return; } const fb = ev.target.closest('[data-fold]'); if (fb) { const p = fb.dataset.fold; if (isOpenF(p)) { openSet.delete(p); autoSet.delete(p); closedSet.add(p); } else { closedSet.delete(p); openSet.add(p); } layout('soft'); select(null); return; } const b = ev.target.closest('[data-f]'); if (b) reveal(b.dataset.f, 0); });
    let sT = 0; searchEl.addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(doSearch, 160); }); searchEl.addEventListener('focus', () => searchEl.value && doSearch());
    searchEl.addEventListener('keydown', ev => { if (ev.key === 'Enter') body.querySelector('.cm-res [data-t]')?.click(); if (ev.key === 'Escape') { ev.stopPropagation(); searchEl.value = ''; body.querySelector('.cm-res').hidden = true; qset = null; setFocus(); } });
    body.querySelector('.cm-res').addEventListener('click', ev => { const b = ev.target.closest('[data-t]'); if (!b) return; body.querySelector('.cm-res').hidden = true; reveal(b.dataset.f, b.dataset.t === 's' ? +b.dataset.l : 0, b.dataset.n); });
  }
  function zoomAt(f, cx, cy, instant) { autoFit = false; const r = box.getBoundingClientRect(), px = cx - r.left, py = cy - r.top, ok = goal.k, nk = Math.max(.3, Math.min(7, ok * f)); if (nk === ok) return; goal.x = px - (px - goal.x) * nk / ok; goal.y = py - (py - goal.y) * nk / ok; goal.k = nk; if (instant) Object.assign(view, goal); kick(); }
  function clickNode(nd) {
    if (!nd || nd.t === 'r') return;
    if (nd.t === 'm') { capOf.set(nd.path, (capOf.get(nd.path) || FILE_CAP) + 60); layout('soft'); return; }
    if (nd.t === 'c') { closedSet.delete(nd.path); openSet.add(nd.path); pendingFit = nd.path; layout('soft'); return; }
    if (nd.t === 'h') { select(nd.path, false); fitTo(nd); return; }
    const f = nd.t === 's' ? nd.file : nd.path; if (sel === f && nd.t === 'f') { select(null); return; } select(f, false); forcedSym.add(f); wantFile(f, true);
    if (nd.t === 'f' && view.k * sScale < 1.3) { flyTo(nd, 1.35 / sScale); goal.y -= 70; }
  }
  async function doSearch() {
    const q = searchEl.value.trim(), res = body.querySelector('.cm-res'); if (!q) { res.hidden = true; qset = null; setFocus(); return; }
    const j = await api(`search?g=${encodeURIComponent(g)}&q=${encodeURIComponent(q)}`); if (!j?.ok || searchEl.value.trim() !== q) return;
    const items = [...j.symbols.map(s => `<button type="button" data-t="s" data-f="${e(s.file)}" data-l="${s.l}" data-n="${e(s.n)}"><b class="cm-k k-${e(s.k)}">${e(s.k[0])}</b><span>${e(s.n)}</span><i>${e(s.file)}:${s.l}</i></button>`), ...j.files.map(f => `<button type="button" data-t="f" data-f="${e(f)}"><b class="cm-k k-file">f</b><span>${e(base(f))}</span><i>${e(f)}</i></button>`)];
    res.innerHTML = items.join('') || '<div class="cm-none">No matches</div>'; res.hidden = false;
    const s = new Set(); for (const x of [...j.files, ...j.symbols.map(y => y.file)]) { const v = visFor(x); if (v) s.add(v); } qset = s.size ? s : null; setFocus(); kick();
  }
  function reveal(f, line, name) { // open every folder above it (and show its functions for a symbol), then glide to it and ring it
    const parts = f.split('/'); for (let i = 1; i < parts.length; i++) { const p = parts.slice(0, i).join('/'); openSet.add(p); closedSet.delete(p); }
    const dir = parts.slice(0, -1).join('/'); wantFolder(dir); wantFile(f, true); if (line) forcedSym.add(f); forcedSym.add(f);
    let tries = 0; const go = () => { const all = sortedFiles(dir), ix = all.findIndex(x => x.f === f); if (ix >= (capOf.get(dir) || FILE_CAP)) capOf.set(dir, ix + 10); layout('soft'); const nd = G.get('f:' + f);
      if (!nd && tries++ < 20) return void setTimeout(go, 150); if (!nd) return; const k2 = line ? 3.6 : 2.2; flyTo(nd, k2 / Math.max(1, sScale * .3)); rings.push({ id: nd.id, t0: now() }); select(f, false); qset = new Set([nd]); setFocus(); kick(); }; go();
  }

  // ---------- live activity ----------
  async function pollAct() {
    clearTimeout(actT); if (!open) return; const gg = g, j = await api('activity?g=' + encodeURIComponent(gg)); if (!open || gg !== g) return;
    if (j?.ok && world) {
      const had = new Set(act.active.map(a => a.id)); act = j; for (const a of j.active) if (!had.has(a.id) && a.prev) pulse(a.prev, a.file);
      paintStates(); showSaved(j.saved || 0); if (j.status) { st = { ...st, ...j.status, initialized: true }; setSub(statusText()); dock.classList.toggle('cm-busy', !!(j.status.status === 'updating' || j.status.pending)); }
    }
    actT = setTimeout(pollAct, j?.active?.length ? 700 : 1400);
  }
  function showSaved(n) {
    if (!savedEl) return; if (n === savedShown && savedEl.textContent) return; const from = savedShown; savedShown = n; if (!n) { savedEl.textContent = ''; return; }
    if (reduce() || !from) { savedEl.textContent = `≈ ${fmtN(n)} tokens saved`; return; }
    const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 700); savedEl.textContent = `≈ ${fmtN(Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3))))} tokens saved`; if (k < 1) requestAnimationFrame(f); })(t0);
  }

  // ---------- placing + open / close (same footprint as the Git dock: over the page's left column) ----------
  function place() { if (window.FmPopDock?.place(dock, curPg()) && vp) drawSoon(); } // shared size + position (popdock.js)
  function show(on) {
    const pg = curPg(); if (on && (!pg || pg.g === 'home')) on = false; if (on === open && (!on || pg.g === g)) return; clearTimeout(closeT);
    if (on) {
      const switching = open && pg.g !== g; open = true; g = pg.g; place(); dock.setAttribute('aria-hidden', 'false'); document.body.classList.add('cmopen');
      if (!switching || !dock.classList.contains('open')) { body.dataset.v = ''; body.innerHTML = ''; st = null; nodes = null; stamp = 0; world = vp = null; els = new Map(); act = { active: [], done: [] }; setSub('loading…'); }
      clearTimeout(openT); openT = setTimeout(() => open && dock.classList.add('open'), 20); poll(true); pollAct();
      clearInterval(placeT); placeT = setInterval(() => { if (curPg()?.g !== g) return curPg() && curPg().g !== 'home' ? show(true) : show(false); place(); }, 800);
    } else {
      open = false; clearTimeout(pollT); clearTimeout(actT); clearInterval(placeT); clearTimeout(openT); dock.classList.remove('open'); dock.setAttribute('aria-hidden', 'true');
      closeT = setTimeout(() => { if (!open) document.body.classList.remove('cmopen'); }, 300);
    }
    window.FmMap.onChange?.(open);
  }
  $('.cm-x').onclick = () => show(false);
  auBtn.onclick = async () => { auBtn.classList.add('spin'); await api('audit?g=' + encodeURIComponent(g), { method: 'POST' }); setTimeout(() => auBtn.classList.remove('spin'), 900); poll(); };
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && open) { ev.stopPropagation(); show(false); } }, true);
  addEventListener('resize', () => { if (open) { place(); if (rows.length) draw('soft'); } });
  window.FmMap = { toggle: () => show(!open), show, get open() { return open; }, onChange: null };
})();
