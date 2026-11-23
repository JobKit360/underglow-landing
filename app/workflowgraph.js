// Workflow Graph panel (Feature 2), plain-language "Layout A": Team on top (each bot its own node, ALL agents as one grouped node with a working count),
// the stages below it top to bottom, forks to destinations, a red "Your OK" gate with check/X, suggested changes as small cards with check/X.
// Opens from the node-diagram icon in the page's bottom-left icon row (settingspanel.js). All data comes from the HOST: GET /api/workflow?g=<page> every 1.5 s
// while open (workflowgraph.mjs); this file keeps no copy. The picture is drawn from `data.simple` (workflowgraph-simple.mjs): few stages, plain words only.
// Technical detail never shows in the main view; it sits behind a small "Details" tap in the stage sheet, written in plain words.
// Packets are small glowing comets that only move when the host says a step completed; they are not clickable. Colours: blue = reading/thinking,
// yellow = working, red = needs you / stopped / failed, dim = idle. Vertical only; the graph is laid out for whatever width the panel has (sidebar or phone).
(() => {
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const curPg = () => typeof agPageTab === 'function' && typeof tab !== 'undefined' ? agPageTab(tab) : null;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ago = t => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : Math.floor(s / 86400) + 'd ago'; };
  const NS = 'http://www.w3.org/2000/svg', ENTRY = 'agents', YEL = '#E3B341', RED = '#E5534B', BLU = '#4A8FE8';
  const ICON = '<svg class="wf-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7.5l5 4.5M17 7.5L12 12M12 12v5"/><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/></svg>';
  const IC = {
    agents: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z',
    bot: 'M7 8h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2zM12 8V5M9.5 13h.01M14.5 13h.01',
    build: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5', check: 'M12 21a9 9 0 100-18 9 9 0 000 18zM8 12.5l2.7 2.7L16 9.5',
    gate: 'M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1z',
    testers: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 19c0-3 2.7-5 6-5s6 2 6 5M16 6a3 3 0 010 5.6M18 14c2 .6 3 2.3 3 5',
    everyone: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z',
    review: 'M12 5c-5 0-9 7-9 7s4 7 9 7 9-7 9-7-4-7-9-7zM12 15a3 3 0 100-6 3 3 0 000 6z', merge: 'M6 4v8a4 4 0 004 4h4M6 6a2 2 0 100-.01M16 16l3 0M18 14l2 2-2 2',
    laptop: 'M5 6h14v9H5zM3 19h18', cloud: 'M7 18a4 4 0 010-8 5 5 0 019.6-1A4.5 4.5 0 0117 18z',
    step: 'M12 8a4 4 0 100 8 4 4 0 000-8z', shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', plus: 'M12 5v14M5 12h14',
  };
  const chiefOf = d => ((d.team || {}).bots || []).find(b => b.chief) || null;
  // Bots, top-down: the Chief of Staff alone on the top row, ABOVE everything; the other bots in rows under it (2 or 3 a row); the agents below them all.
  const botRows = (d, per) => { const all = (d.team || {}).bots || [], c = chiefOf(d), rest = all.filter(b => b !== c), rows = c ? [[c]] : []; for (let i = 0; i < rest.length; i += per) rows.push(rest.slice(i, i + per)); return rows; };
  const ico = k => `<svg viewBox="0 0 24 24"><path d="${IC[k] || IC.step}"/></svg>`;
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', CROSS = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  const dock = document.createElement('aside'); dock.id = 'wfDock'; dock.className = 'wf pdock'; dock.setAttribute('aria-label', 'Workflow'); dock.setAttribute('aria-hidden', 'true');
  dock.innerHTML = `<div class="wf-hd">${ICON}<div class="wf-tt"><b>Workflow</b><span class="wf-sub"></span></div>
    <button class="wf-re" type="button" title="Check again" aria-label="Check again"><svg viewBox="0 0 20 20"><path d="M16 10a6 6 0 11-2-4.5M16 3v3.5h-3.5"/></svg></button>
    <button class="wf-x" type="button" title="Close (Esc)" aria-label="Close">×</button></div>
    <div class="wf-sum" hidden><span class="wf-pill"><i></i><b style="font-weight:500"></b></span><div class="wf-now"></div></div>
    <div class="wf-sc"><div class="wf-body"></div></div>
    <div class="wf-legend" hidden><span style="--c:var(--wf-blue)"><i></i>Reading / thinking</span><span style="--c:var(--wf-yellow)"><i></i>Working</span><span style="--c:var(--wf-red)"><i></i>Needs you</span><span style="--c:var(--wf-idle)"><i></i>Idle</span></div>
    <div class="wf-insp" hidden></div>`;
  document.body.appendChild(dock);
  const $ = s => dock.querySelector(s), body = $('.wf-body'), insp = $('.wf-insp'), sub = $('.wf-sub'), sum = $('.wf-sum'), pill = $('.wf-pill'), nowEl = $('.wf-now'), legend = $('.wf-legend');
  let open = false, g = null, data = null, sig = '', pollT = 0, placeT = 0, openT = 0, closeT = 0, sel = null, nowTxt = '', detOpen = false, scanning = false;
  const seenPk = new Map(), doneAnim = new Set(); // packet id → last node (for animating moves) · arrived packets already celebrated
  let G = null; // the drawn graph: { el, W, H, rect: Map(id→{cx,cy,w,h}), nodes: Map(id→el), edges: Map(id→{p,f}), pk: svg, simple }

  // ---------- data ----------
  const api = (p, o) => fetch('/api/workflow' + p + (p.includes('?') ? '&' : '?') + 'g=' + encodeURIComponent(g), o).then(r => r.json().catch(() => ({})));
  const post = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const op = b => post('/op', b).then(() => load());
  function load() { if (!open) return Promise.resolve(); const gg = g; return api('').then(j => { if (!open || gg !== g || !j || j.error) return; data = j; paint(); }).catch(() => { sub.textContent = 'cannot reach the host'; }); }
  const poll = () => { clearTimeout(pollT); if (open) pollT = setTimeout(() => load().finally(poll), 1500); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- painting ----------
  function structSig(d) { const s = d.simple || {}; return JSON.stringify([d.state, scanning, dock.clientWidth, (s.nodes || []).map(n => [n.id, n.name, n.status, n.kind, n.icon]), s.edges, (s.proposals || []).map(p => [p.id, p.text]), (d.team.bots || []).map(b => [b.id, b.name, !!b.chief]), d.fastLane && d.fastLane.enabled]); }
  function paint() {
    const d = data;
    sub.textContent = d.state === 'ready' ? (d.scannedAt ? 'checked ' + ago(d.scannedAt) : '') : d.state === 'scanning' ? 'scanning…' : d.state === 'empty' ? 'not enough context yet' : 'not set up yet';
    $('.wf-re').classList.toggle('spin', d.state === 'scanning'); $('.wf-re').hidden = d.state === 'uninit';
    const ready = d.state === 'ready'; sum.hidden = !ready && d.state !== 'empty' && d.state !== 'uninit' && d.state !== 'scanning'; legend.hidden = !ready;
    const s = structSig(d);
    if (s !== sig) { sig = s; build(d); } else if (d.state === 'scanning') scanLive(d);
    if (ready && G) live(d);
    summary(d);
  }
  function now(t) { if (t === nowTxt) return; nowTxt = t; nowEl.style.opacity = 0; setTimeout(() => { nowEl.textContent = t; nowEl.style.opacity = 1; }, 160); }
  function setPill(cls, t) { pill.className = 'wf-pill' + (cls ? ' p-' + cls : ''); pill.querySelector('b').textContent = t; }

  function hero(d) {
    const scanningNow = d.state === 'scanning', uninit = d.state === 'uninit';
    const title = uninit ? 'See how work moves in this project' : scanningNow ? 'Finding how work moves' : 'Not enough context yet';
    const text = scanningNow || uninit ? 'I will read your project notes and how changes went out, then draw the path. Nothing is written to your project.' : d.noFolder ? 'This page has no project folder to read.' : 'I can’t tell how work moves through this project yet, and I won’t guess. Here’s what would help me draw it:';
    body.className = 'wf-body st-' + d.state; body.style.height = '';
    body.innerHTML = `<div class="wf-hero"><div class="wf-ghosts"><svg viewBox="0 0 200 150"><path d="M100 30V60M100 90C100 105 40 100 40 118M100 90C100 105 160 100 160 118"/></svg><div class="g1"></div><div class="g2"></div><div class="g3"></div><div class="g4"></div></div>
      <h3>${title}</h3><p>${text}</p>
      ${d.state === 'empty' && !d.noFolder ? `<div class="wf-help"><div><svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5"/></svg>A short note on how you release (a README is perfect)</div><div><svg viewBox="0 0 24 24"><path d="${IC.agents}"/></svg>Let your agents finish and ship a few changes</div><div><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Tell any agent “this is how we ship”, it can suggest the stages</div></div>` : ''}
      <button class="wf-btn" type="button"><i class="bar"></i><span>${scanningNow ? 'Scanning…' : d.state === 'empty' ? 'Scan again' : 'Scan workflow'}</span></button><div class="wf-scanmsg"></div></div>`;
    body.querySelector('.wf-btn').onclick = startScan; if (scanningNow) scanLive(d);
  }
  const STEPS = ['Reading your project notes…', 'Looking at how changes went out…', 'Listening to what agents did…', 'Putting the picture together…'];
  function scanLive(d) { const s = d.scan || {}, bar = body.querySelector('.wf-btn .bar'), m = body.querySelector('.wf-scanmsg'), t = body.querySelector('.wf-btn span'); if (!bar) return; bar.style.width = Math.round(Math.max(.05, s.pct || 0) * 100) + '%'; if (t) t.textContent = 'Scanning…'; if (m) m.textContent = STEPS[Math.min(STEPS.length - 1, Math.floor((s.pct || 0) * STEPS.length))]; }
  function startScan() {
    scanning = true; data = { ...(data || {}), state: 'scanning', scan: { running: true, pct: 0.05, label: '' }, simple: { nodes: [], edges: [], proposals: [] }, team: data?.team || { bots: [], agents: {}, links: [] }, fastLane: {}, packets: [] }; paint();
    post('/scan', {}).then(() => { scanning = false; load(); });
  }
  $('.wf-re').onclick = () => { const i = $('.wf-re svg'); try { i.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 700, easing: 'ease' }); } catch {} startScan(); };

  // ---------- layout (top to bottom) ----------
  const M = 22;
  function layout(d, W) {
    const S = d.simple, I = W - 2 * M, R = new Map(), per = W < 420 ? 2 : 3; let y = 6;
    const sec = (t, top) => ({ t, top });
    const secs = [], C = W / 2; // top-down: the Chief of Staff on its own top row, the other bots under it, then the agents (nothing beside or on top of anything else), then the steps
    botRows(d, per).forEach((row, ri) => { const lead = row.length === 1 && row[0].chief, w = lead ? 150 : Math.min(130, Math.floor((I - (row.length - 1) * 10) / row.length)); row.forEach((b, k) => R.set('bot:' + b.id, { cx: M + I * (2 * k + 1) / (2 * row.length), cy: y + 31, w, h: 62 })); y += 62 + 40; });
    R.set(ENTRY, { cx: C, cy: y + 31, w: 150, h: 62 }); y += 62 + 44;
    // depth = longest path from the agents; cycles are cut
    const nodes = S.nodes, inc = id => S.edges.filter(x => x.to === id && !x.lane), depth = new Map([[ENTRY, 0]]);
    const dep = (id, seen = new Set()) => { if (depth.has(id)) return depth.get(id); if (seen.has(id)) return 1; seen.add(id); const ins = inc(id); const v = ins.length ? 1 + Math.max(...ins.map(x => dep(x.from, seen))) : 1; depth.set(id, v); return v; };
    nodes.forEach(n => dep(n.id));
    const rows = []; nodes.forEach(n => (rows[depth.get(n.id)] ||= []).push(n));
    rows.filter(Boolean).forEach(r => { for (let i = 0; i < r.length; i += per) {
      const row = r.slice(i, i + per), n = row.length, gap = 10, w = Math.min(n === 1 ? 176 : 180, Math.floor((I - (n - 1) * gap) / n)), h = row.some(x => x.status === 'proposed' && x.kind !== 'gate') ? 34 : 48;
      row.forEach((x, k) => R.set(x.id, { cx: M + I * (2 * k + 1) / (2 * n), cy: y + h / 2, w: x.status === 'proposed' && x.kind !== 'gate' ? Math.min(w, 190) : w, h: x.status === 'proposed' && x.kind !== 'gate' ? 34 : 50 }));
      y += h + (row.some(x => x.kind === 'gate') ? 88 : 56); } });
    if (S.proposals.length) { y -= 8; secs.push(sec('Suggestions', y)); y += 30; S.proposals.forEach((p, i) => { R.set('prop:' + p.id, { cx: C, cy: y + 15, w: Math.min(I, 250), h: 30 }); y += 40; }); }
    return { R, secs, H: y + 14 };
  }
  function edgePath(A, B, lane, W) {
    if (lane) { const x = W - 11, ax = A.cx + A.w / 2, bx = B.cx + B.w / 2; return `M${ax} ${A.cy} H${x - 12} Q${x} ${A.cy} ${x} ${A.cy + 12} V${B.cy - 12} Q${x} ${B.cy} ${x - 12} ${B.cy} H${bx + 3}`; }
    if (Math.abs(A.cy - B.cy) < 24) { const x1 = A.cx < B.cx ? A.cx + A.w / 2 : A.cx - A.w / 2, x2 = A.cx < B.cx ? B.cx - B.w / 2 : B.cx + B.w / 2; return `M${x1} ${A.cy} L${x2} ${B.cy}`; }
    const down = A.cy < B.cy, y1 = down ? A.cy + A.h / 2 : A.cy - A.h / 2, y2 = down ? B.cy - B.h / 2 : B.cy + B.h / 2, dy = (y2 - y1) / 2;
    return `M${A.cx} ${y1} C${A.cx} ${y1 + dy} ${B.cx} ${y2 - dy} ${B.cx} ${y2}`;
  }
  const sv = (t, a = {}) => { const x = document.createElementNS(NS, t); for (const k in a) x.setAttribute(k, a[k]); return x; };

  function build(d) {
    G = null;
    if (d.state !== 'ready') { hero(d); return; }
    const W = Math.max(260, body.clientWidth || dock.clientWidth - 2), { R, secs, H } = layout(d, W), S = d.simple;
    body.className = 'wf-body st-ready'; body.innerHTML = '';
    const el = document.createElement('div'); el.className = 'wf-graph'; el.style.width = W + 'px'; el.style.height = H + 'px'; body.appendChild(el);
    const lines = sv('svg', { class: 'wf-lines' }), pk = sv('svg', { class: 'wf-pk' }); el.append(lines);
    secs.forEach(s => { const x = document.createElement('div'); x.className = 'wf-sec'; x.style.top = s.t + 'px'; x.textContent = s.t; x.style.top = s.top + 'px'; el.append(x); });
    const edges = new Map(), bots = d.team.bots || [], ids = new Set(R.keys());
    const addEdge = (id, a, b, cls, lane) => { const A = R.get(a), B = R.get(b); if (!A || !B) return; const dd = edgePath(A, B, lane, W), p = sv('path', { class: 'wf-e ' + cls, d: dd }), f = sv('path', { class: 'wf-ef ' + cls, d: dd }); lines.append(p, f); edges.set(id, { p, f, lane }); };
    const rowsB = botRows(d, W < 420 ? 2 : 3); rowsB.forEach((row, ri) => row.forEach((b, k) => { if (ri) { const up = rowsB[ri - 1][Math.min(k, rowsB[ri - 1].length - 1)]; addEdge('bot:' + up.id + '>bot:' + b.id, 'bot:' + up.id, 'bot:' + b.id, 'bot'); } if (ri === rowsB.length - 1) addEdge('bot:' + b.id + '>' + ENTRY, 'bot:' + b.id, ENTRY, 'bot'); }));
    for (const x of S.edges) addEdge(x.id, x.from, x.to, x.proposed ? 'dash' : '', x.lane);
    const fl = [...S.edges].find(x => x.lane); if (fl && R.get(fl.from) && R.get(fl.to)) { const t = sv('text', { class: 'wf-fastl' }), tp = sv('textPath', { href: '#wffast', startOffset: '50%', 'text-anchor': 'middle' }); tp.textContent = 'FAST LANE'; t.append(tp); const ep = edges.get(fl.id); if (ep) { ep.p.setAttribute('id', 'wffast'); ep.p.setAttribute('class', 'wf-fast'); ep.f.remove(); lines.append(t); } }
    const nodes = new Map(); let i = 0;
    const mk = (id, cls, html) => { const r = R.get(id), n = document.createElement('div'); n.className = 'wf-n s-idle ' + cls; n.dataset.id = id; n.style.setProperty('--i', i++); Object.assign(n.style, { left: r.cx - r.w / 2 + 'px', top: r.cy - r.h / 2 + 'px', width: r.w + 'px', height: r.h + 'px' }); n.innerHTML = html; el.append(n); nodes.set(id, n); return n; };
    const ag = d.team.agents || {};
    mk(ENTRY, 'k-agents', `<div class="wf-ic2">${ico('agents')}<span class="wf-orbit"></span><span class="wf-badge">${ag.working || 0}</span></div><div class="wf-tx"><b>Agents</b><i class="st">All resting</i></div>`).onclick = ev => { if (!ev.target.closest('button')) openSheet(ENTRY); };
    bots.forEach(b => { if (!R.has('bot:' + b.id)) return; mk('bot:' + b.id, 'k-bot', `<div class="wf-ic2">${ico('bot')}</div><div class="wf-tx"><b>${e(b.name)}</b><i class="st">${b.chief ? 'Leads the team' : 'Standing by'}</i></div>`).onclick = () => openSheet('bot:' + b.id); });
    for (const n of S.nodes) {
      const prop = n.status === 'proposed' && n.kind !== 'gate';
      const nd = prop ? mk(n.id, 'k-prop', `<div class="wf-ic2">${ico(n.icon)}</div><div class="wf-tx"><b>＋ ${e(n.name)}</b></div><div class="wf-pr"><button class="ok" title="Add this step" aria-label="Add ${e(n.name)}">${CHECK}</button><button class="no" title="Not this one" aria-label="Dismiss ${e(n.name)}">${CROSS}</button></div>`)
        : mk(n.id, 'k-' + n.kind, `<div class="wf-ic2">${ico(n.icon)}</div><div class="wf-tx"><b>${e(n.name)}</b><i class="st"></i></div><div class="wf-act"><button class="ok" title="Approve" aria-label="Approve">${CHECK}</button><button class="no" title="Hold back" aria-label="Hold back">${CROSS}</button></div><div class="wf-ask"></div>`);
      nd.onclick = ev => { if (!ev.target.closest('button')) openSheet(n.id); };
      if (prop) { nd.querySelector('.ok').onclick = ev => { ev.stopPropagation(); Promise.all(n.members.map(m => post('/op', { op: 'approve', id: m }))).then(load); now('Added “' + n.name + '” to your workflow.'); }; nd.querySelector('.no').onclick = ev => { ev.stopPropagation(); nd.classList.add('gone'); Promise.all(n.members.map(m => post('/op', { op: 'dismiss', id: m }))).then(load); now('Dismissed. I won’t suggest it again for a while.'); }; }
    }
    S.proposals.forEach(p => { const nd = mk('prop:' + p.id, 'k-prop', `<div class="wf-ic2">${ico('shield')}</div><div class="wf-tx"><b title="${e(p.by)}: ${e(p.reason)}">${e(p.text)}</b></div><div class="wf-pr"><button class="ok" title="Yes, make this change" aria-label="Approve">${CHECK}</button><button class="no" title="No thanks" aria-label="Dismiss">${CROSS}</button></div>`);
      nd.querySelector('.ok').onclick = ev => { ev.stopPropagation(); nd.classList.add('gone'); op({ op: 'approve', id: p.id }); now('Done. The workflow was updated.'); }; nd.querySelector('.no').onclick = ev => { ev.stopPropagation(); nd.classList.add('gone'); op({ op: 'dismiss', id: p.id }); now('Dismissed. I won’t suggest it again for a while.'); };
      nd.onclick = ev => { if (!ev.target.closest('button')) openSheet('prop:' + p.id); }; });
    el.append(pk); G = { el, W, H, rect: R, nodes, edges, pk, simple: S, ids };
    first = true; live(d, true); first = false;
  }
  let first = true;
  body.addEventListener('click', ev => { if (!ev.target.closest('.wf-n') && !ev.target.closest('.wf-insp')) closeInsp(); });

  // ---------- live: colours, counts, last shipped, comets ----------
  function nodeOfPacket(S, p) { if (p.state === 'gate' && p.gate && p.gate.edges) { const gid = S.gateFor[p.gate.edges[0]]; if (gid) return gid; } return p.at === ENTRY ? ENTRY : S.where[p.at]; }
  function live(d, initial) {
    const S = d.simple, t = d.team.agents || {}, st = {}; // node id → { color, text, wait }
    const pks = d.packets || [];
    for (const p of pks) { const nid = nodeOfPacket(S, p); if (!nid || nid === ENTRY) continue; const o = st[nid] ||= {};
      if (p.state === 'gate' || p.state === 'stopped') { o.color = 'red'; o.wait = p; } else if (p.state !== 'arrived' && o.color !== 'red') o.color = d.colors[p.at] || 'yellow'; }
    // agents
    const an = G.nodes.get(ENTRY); if (an) { const c = t.working ? (t.color === 'blue' ? 'blue' : 'yellow') : 'idle'; setColor(an, c); an.querySelector('.st').textContent = t.working ? t.working + ' working' : 'All resting';
      const b = an.querySelector('.wf-badge'); if (b.textContent !== String(t.working || 0)) { b.textContent = t.working || 0; b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } }
    d.team.bots.forEach(b => { const n = G.nodes.get('bot:' + b.id); if (n) { setColor(n, b.working ? 'yellow' : 'idle'); n.querySelector('.st').textContent = b.working ? 'Working' : b.chief ? 'Leads the team' : 'Standing by'; } });
    for (const n of S.nodes) {
      const el = G.nodes.get(n.id); if (!el || el.classList.contains('k-prop')) continue; const o = st[n.id] || {}, c = o.color || 'idle';
      setColor(el, c); el.classList.toggle('wait', !!o.wait);
      el.querySelector('.st').textContent = c === 'red' ? 'Needs you' : c === 'blue' ? 'Reading…' : c === 'yellow' ? (n.kind === 'dest' ? 'Receiving…' : 'Working…') : n.kind === 'gate' ? 'All clear' : n.lastShipped ? 'Shipped ' + ago(n.lastShipped) : n.caption || (n.kind === 'dest' ? 'Nothing yet' : 'Ready');
      const ask = el.querySelector('.wf-ask'); if (ask) ask.textContent = o.wait ? (o.wait.gate?.kind === 'skip' ? 'Asked to skip ahead' : 'Waiting for you') : '';
      const gp = o.wait; if (gp && el._k !== gp.id + gp.state) { el._k = gp.id + gp.state; const skip = gp.gate?.kind === 'skip';
        el.querySelector('.ok').onclick = ev => { ev.stopPropagation(); op(skip ? { op: 'allow', id: gp.id } : { op: 'promote', id: gp.id }); now(skip ? 'Allowed for this change only.' : 'You approved. Sending it on…'); };
        el.querySelector('.no').onclick = ev => { ev.stopPropagation(); op({ op: 'discard', id: gp.id }); now('Held back. Nothing went on.'); }; } else if (!gp) el._k = '';
    }
    packets(d, initial);
    if (sel && !insp.hidden) fillInsp(sel);
  }
  function setColor(el, c) { for (const k of ['s-idle', 's-blue', 's-yellow', 's-red']) el.classList.remove(k); el.classList.add('s-' + c); }
  function shine(id) { const n = G.nodes.get(id); if (!n) return; n.classList.remove('shine'); void n.offsetWidth; n.classList.add('shine'); setTimeout(() => n.classList.remove('shine'), 950); }
  function mkPacket(color) { const gg = sv('g'); gg.style.opacity = 0; gg.style.transition = 'opacity .25s'; const els = []; for (let i = 0; i < 7; i++) { const c = sv('circle', { r: i ? Math.max(1.5, 5 - i * .6) : 5.5, fill: color }); c.style.opacity = i ? Math.max(.05, .5 - i * .07) : 1; if (!i) c.setAttribute('filter', 'drop-shadow(0 0 5px ' + color + ')'); gg.append(c); els.push(c); } G.pk.append(gg); return { g: gg, els }; }
  function place(p, path, u) { const L = path.getTotalLength(); p.els.forEach((c, i) => { const q = path.getPointAtLength(Math.max(0, u - i * .028) * L); c.setAttribute('cx', q.x); c.setAttribute('cy', q.y); }); }
  function moveAlong(p, edgeId, dur = 620, hc = YEL) { return new Promise(res => { const ed = G.edges.get(edgeId); if (!ed) return res(false); const path = ed.p; if (reduce()) { place(p, path, 1); p.g.style.opacity = 1; return res(true); }
    path.style.setProperty('--hc', hc); path.classList.add('hot'); place(p, path, 0); p.g.style.opacity = 1; const t0 = performance.now();
    (function f(now2) { const u = Math.min(1, (now2 - t0) / dur), k = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; place(p, path, k); if (u < 1) requestAnimationFrame(f); else { setTimeout(() => path.classList.remove('hot'), 350); res(true); } })(t0); }); }
  function burst(p) { const c = p.els[0], ring = sv('circle', { cx: c.getAttribute('cx'), cy: c.getAttribute('cy'), r: 5, fill: 'none', stroke: '#fff', 'stroke-width': 2 }); G.pk.append(ring); try { ring.animate([{ r: '5px', opacity: .9 }, { r: '34px', opacity: 0 }], { duration: 800, easing: 'ease-out' }).onfinish = () => ring.remove(); } catch { ring.remove(); } }
  const vanish = p => { p.g.style.opacity = 0; setTimeout(() => p.g.remove(), 400); };
  function packets(d, initial) {
    const S = d.simple, here = new Set(), g0 = G; const stray = new Map();
    for (const p of d.packets || []) {
      const nid = nodeOfPacket(S, p); if (!nid) continue; here.add(p.id); const prev = seenPk.get(p.id);
      if (!initial && !first && g0 === G) {
        let from = prev; if (!from && p.forkOf) from = seenPk.get(p.forkOf); if (!from && nid !== ENTRY) from = ENTRY; // a new change starts at the agents
        if (from && from !== nid) runPacket(from, nid, p);
        else if (p.state === 'arrived' && !doneAnim.has(p.id)) { doneAnim.add(p.id); arrive(nid); }
      } else if (p.state === 'arrived') doneAnim.add(p.id);
      seenPk.set(p.id, nid);
    }
    for (const id of [...seenPk.keys()]) if (!here.has(id)) seenPk.delete(id);
  }
  async function runPacket(from, to, p) {
    const gg = G, edgeId = from + '>' + to, red = p.state === 'gate' || p.state === 'stopped', pk = mkPacket(YEL);
    const ok = await moveAlong(pk, edgeId); if (G !== gg) return;
    if (!ok) { vanish(pk); shine(to); return; }
    if (red) { pk.els.forEach((c, i) => { c.setAttribute('fill', RED); if (!i) c.setAttribute('filter', 'drop-shadow(0 0 6px ' + RED + ')'); }); setTimeout(() => { if (G === gg) vanish(pk); }, 3000); }
    else if (p.state === 'arrived' && !doneAnim.has(p.id)) { doneAnim.add(p.id); burst(pk); setTimeout(() => vanish(pk), 350); arrive(to, true); }
    else { setTimeout(() => vanish(pk), 250); shine(to); }
  }
  function arrive(nid, skipBurst) { shine(nid); const n = G.nodes.get(nid); if (n) { const s = n.querySelector('.st'); if (s) s.textContent = 'Shipped just now'; } }

  // ---------- summary line ----------
  function summary(d) {
    if (d.state !== 'ready') { setPill(d.state === 'scanning' ? 'blue' : '', d.state === 'scanning' ? 'Scanning…' : 'Not set up yet'); now(d.state === 'scanning' ? 'Reading your project…' : d.state === 'empty' ? 'I need a bit more to go on.' : 'Scan to draw how work moves here.'); return; }
    const S = d.simple, red = [...G.nodes.values()].filter(n => n.classList.contains('s-red')).length, busy = [...G.nodes.values()].filter(n => /s-(blue|yellow)/.test(n.className));
    const sug = S.proposals.length + S.nodes.filter(n => n.status === 'proposed' && n.kind !== 'gate').length, nm = id => (S.nodes.find(n => n.id === id) || {}).name || 'the next step';
    if (red) { setPill('red', red + ' needs you'); const w = (d.packets || []).find(p => p.state === 'gate' || p.state === 'stopped'); now(w ? 'Waiting on you at “' + nm(nodeOfPacket(S, w)) + '”.' : 'Something is waiting on you.'); }
    else if (busy.length) { setPill('yellow', 'Work in motion'); const t = d.team.agents || {}; now(t.working ? `${t.working} agent${t.working === 1 ? ' is' : 's are'} working…` : 'Work is moving along…'); }
    else { setPill('', sug ? 'All quiet · ' + sug + ' suggestion' + (sug === 1 ? '' : 's') : 'All quiet'); const last = Math.max(0, ...S.nodes.map(n => n.lastShipped || 0)); now('Everything is resting.' + (last ? ' Last shipped ' + ago(last) + '.' : '')); }
  }

  // ---------- stage tap: short plain description; "Details" opens how I know, what moves work along, how sure I am ----------
  function describeNode(id) {
    const d = data, S = d.simple;
    if (id === ENTRY) { const w = (d.team.agents || {}).working || 0; return { name: 'Agents', icon: 'agents', color: w ? 'yellow' : 'idle', label: w ? 'Working' : 'Idle', desc: 'All your AI agents as one group. The number shows how many are busy right now.', who: 'They don’t need approval to start work', last: w ? 'Working now' : 'Resting', details: [['How I know', 'I see it directly: Underglow runs your agents.'], ['What moves work along', 'When an agent says it’s done, its work moves to the first step.']] }; }
    if (id.startsWith('bot:')) { const b = d.team.bots.find(x => 'bot:' + x.id === id); if (!b) return null; return { name: b.name, icon: 'bot', color: b.working ? 'yellow' : 'idle', label: b.working ? 'Working' : 'Idle', desc: b.chief ? 'Your lead bot (Chief of Staff). It runs the team, hands work to the others and keeps the day on track.' : 'A helper bot on your team. It talks with the chief and the agents and helps work along.', who: 'Doesn’t approve; only helps', last: b.working ? 'Working now' : 'Standing by', details: [['How I know', 'You set this bot up in Underglow as the team lead.'], ['Who it talks to', 'The agents (the dotted line above them).']] }; }
    if (id.startsWith('prop:')) { const p = S.proposals.find(x => 'prop:' + x.id === id); if (!p) return null; return { name: 'Suggestion', icon: 'shield', color: 'blue', label: 'Suggested', desc: p.text + '. Nothing changes unless you approve.', who: 'You (tap ✓ to add it, ✕ to dismiss)', last: 'Waiting for you', details: [['Suggested by', p.by], ['Why it was suggested', p.reason || 'No reason given.'], ['How sure I am', 'A suggestion only']] }; }
    const n = S.nodes.find(x => x.id === id); if (!n) return null; const el = G && G.nodes.get(id), c = ['red', 'yellow', 'blue'].find(k => el && el.classList.contains('s-' + k)) || 'idle';
    return { name: n.name, icon: n.icon, color: c, label: { idle: 'Idle', blue: 'Reading', yellow: 'Working', red: 'Needs you' }[c], desc: n.desc, who: n.who, last: n.lastShipped ? ago(n.lastShipped) : 'Nothing yet', details: n.details, proposed: n.status === 'proposed' };
  }
  function openSheet(id) { sel = id; insp._k = ''; fillInsp(id); insp.hidden = false; requestAnimationFrame(() => insp.classList.add('on')); }
  function fillInsp(id) {
    const x = describeNode(id); if (!x) return closeInsp(); const stamp = JSON.stringify(x); if (insp._k === stamp) return; insp._k = stamp;
    const col = { idle: '--wf-idle', blue: '--wf-blue', yellow: '--wf-yellow', red: '--wf-red' }[x.color];
    insp.innerHTML = `<button class="wf-sx" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="wf-sh2" style="--c:var(${col})"><div class="wf-ic2" style="--c:${x.color === 'idle' && id.startsWith('prop:') ? 'var(--wf-blue)' : 'var(--wf-idle)'}">${ico(x.icon)}</div><h3>${e(x.name)}</h3><span class="wf-pill" style="--c:var(${col})"><i></i>${e(x.label)}</span></div>
      <p class="d">${e(x.desc)}</p>
      <div class="wf-rows"><div><span>Who approves</span><em>${e(x.who)}</em></div><div><span>Last went through</span><em>${e(x.last)}</em></div></div>
      <button class="wf-more${detOpen ? ' open' : ''}" type="button"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>Details</button>
      <div class="wf-det${detOpen ? ' open' : ''}"><div><div class="in">${x.details.map(m => `<div><b>${e(m[0])}</b>${e(m[1])}</div>`).join('')}</div></div></div>`;
    insp.querySelector('.wf-sx').onclick = closeInsp;
    insp.querySelector('.wf-more').onclick = ev => { detOpen = !detOpen; ev.currentTarget.classList.toggle('open', detOpen); insp.querySelector('.wf-det').classList.toggle('open', detOpen); insp._k = ''; };
  }
  function closeInsp() { sel = null; insp._k = ''; insp.classList.remove('on'); setTimeout(() => { if (!sel) insp.hidden = true; }, 380); }

  // ---------- open / close ----------
  function place2() { window.FmPopDock?.place(dock, curPg()); } // shared size + position (popdock.js)
  function show(on) {
    const pg = curPg(); if (on && (!pg || pg.g === 'home')) on = false;
    if (on === open && (!on || pg.g === g)) return;
    clearTimeout(closeT);
    if (on) {
      open = true; g = pg.g; sig = ''; data = null; G = null; seenPk.clear(); body.innerHTML = ''; place2(); dock.setAttribute('aria-hidden', 'false'); document.body.classList.add('wfopen');
      clearTimeout(openT); openT = setTimeout(() => open && dock.classList.add('open'), reduce() ? 0 : 60);
      load(); poll();
      clearInterval(placeT); placeT = setInterval(() => { if (curPg()?.g !== g) return curPg() && curPg().g !== 'home' ? show(true) : show(false); place2(); }, 800);
    } else {
      open = false; clearTimeout(pollT); clearInterval(placeT); clearTimeout(openT); dock.classList.remove('open'); dock.setAttribute('aria-hidden', 'true'); closeInsp();
      closeT = setTimeout(() => { if (!open) document.body.classList.remove('wfopen'); }, 300);
    }
    window.FmWorkflow.onChange?.(open);
  }
  $('.wf-x').onclick = () => show(false);
  document.addEventListener('keydown', ev => { if (ev.key !== 'Escape' || !open) return; ev.stopPropagation(); if (!insp.hidden && insp.classList.contains('on')) closeInsp(); else show(false); }, true);
  addEventListener('resize', () => { if (open) { place2(); sig = ''; if (data) paint(); } });
  window.FmWorkflow = { toggle: () => show(!open), show, get open() { return open; }, onChange: null };
})();
