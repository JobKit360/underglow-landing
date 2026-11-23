// Settings panel: read-only facts for the agents page on screen, drawn in the deck zone's reserved bottom slot (.dkres).
// Same panel on every agents page (AG_PAGES: Home, Jarvis, '+' folders). Uses index.html's globals; per-page access (sides + memory) from GET /api/access,
// the page repo's worktrees + the plan pot from GET /api/pageinfo?g=<page>.
// Layout (2026-11-16): a row of square icon buttons — Git (opens the Git dock), Roadmap (opens the Roadmap board: roadmap.js), + Open items on the
// Foreman page — each with a small count badge; a separator, then the pot (big multiplier, $ lines, the water cup at the right; poker chips removed, 2026-11-16).
// Folder and Access rows were dropped (the user). No hover tooltips (the user).
// Nothing here changes anything: grants are Foreman-only (asked in its chat), layout is the AG_LAYOUT switch.
(() => {
  // Shared Roadmap/Map/Workflow popup box (popdock.js / .css): one size + position + animation for all three
  if (!document.getElementById('pdCss')) { const l = document.createElement('link'); l.id = 'pdCss'; l.rel = 'stylesheet'; l.href = 'popdock.css?v=1'; document.head.appendChild(l); const sc = document.createElement('script'); sc.src = 'popdock.js?v=1'; document.head.appendChild(sc); }
  // Git dock (gitgraph.js / .css): the Git row opens it over the left column instead of a click list
  if (!document.getElementById('ggCss')) { const l = document.createElement('link'); l.id = 'ggCss'; l.rel = 'stylesheet'; l.href = 'gitgraph.css?v=1'; document.head.appendChild(l);
    const sc = document.createElement('script'); sc.src = 'gitgraph.js?v=1'; sc.onload = () => { if (window.FmGit) FmGit.onChange = () => render(); }; document.head.appendChild(sc); }
  // Roadmap board (roadmap.js / .css): the Roadmap row opens it over the page
  if (!document.getElementById('rbCss')) { const l = document.createElement('link'); l.id = 'rbCss'; l.rel = 'stylesheet'; l.href = 'roadmap.css?v=4'; document.head.appendChild(l);
    const sc = document.createElement('script'); sc.src = 'roadmap.js?v=4'; sc.onload = () => { if (window.FmRoadmap) FmRoadmap.onChange = () => { loadInfo(); render(); }; }; document.head.appendChild(sc); }
  // Code Map panel (codemap.js / .css): the tree icon opens it over the page like the Git dock
  if (!document.getElementById('cmCss')) { const l = document.createElement('link'); l.id = 'cmCss'; l.rel = 'stylesheet'; l.href = 'codemap.css?v=2'; document.head.appendChild(l);
    const sc = document.createElement('script'); sc.src = 'codemap.js?v=2'; sc.onload = () => { if (window.FmMap) FmMap.onChange = () => render(); }; document.head.appendChild(sc); }
  // Workflow graph (workflowgraph.js / .css): the node-diagram icon opens it
  if (!document.getElementById('wfCss')) { const l = document.createElement('link'); l.id = 'wfCss'; l.rel = 'stylesheet'; l.href = 'workflowgraph.css?v=2'; document.head.appendChild(l);
    const sc = document.createElement('script'); sc.src = 'workflowgraph.js?v=2'; sc.onload = () => { if (window.FmWorkflow) FmWorkflow.onChange = () => render(); }; document.head.appendChild(sc); }
  let acc = null, popKind = null, popRow = null; const info = {};
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const short = p => String(p || '').replace(/^[a-z]:[\\/]users[\\/][^\\/]+/i, '~');
  const usd = n => '$' + Math.round(n).toLocaleString();
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const curPg = () => typeof agPageTab === 'function' ? agPageTab(tab) : null;
  const load = () => { loadAcc(); loadInfo(); };
  const loadAcc = () => fetch('/api/access', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j) { acc = j; render(); } }).catch(() => {});
  // Page facts (git rows) poll every 3s for the open page, one request per page at a time. Every page is fetched once up front and
  // every page's slot is kept drawn, so switching pages shows its panel at once (no '…' flash); the pot is the same on every page (pot0).
  const infoBusy = new Set(); let pot0 = null;
  const fetchInfo = g => { if (!g || infoBusy.has(g)) return; infoBusy.add(g);
    fetch('/api/pageinfo?g=' + encodeURIComponent(g), { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => { if (j) { info[g] = j; if (j.plan && j.today) pot0 = { plan: j.plan, today: j.today, out: j.out }; render(); } }).catch(() => {}).finally(() => infoBusy.delete(g)); };
  const loadInfo = () => fetchInfo(curPg()?.g);
  const allPages = () => typeof livePages === 'function' ? livePages() : typeof AG_PAGES !== 'undefined' ? AG_PAGES : [];
  const loadAll = () => allPages().forEach(p => fetchInfo(p.g));
  // This page's side only (server SIDES, enforced by sideAllows): its work folder(s) + the shared memory folder (read-only there).
  const folders = pg => { const sd = acc && (acc.sides?.[pg.g] || (pg.folder ? [pg.folder] : null)); return sd ? [...new Set([...sd, acc.memory].filter(Boolean))] : null; };
  // Open items = Foreman's own tracker (index.html FTK / ftkLoad / #ftk, from /api/foreman-tracker): count of not-done items
  const openN = () => { try { return typeof FTK === 'undefined' || FTK.last == null ? null : (JSON.parse(FTK.last).items || []).filter(i => i.status !== 'done').length; } catch { return null; } };
  // Option buttons (2026-11-16, the user: icons, not lines): square icon buttons in one row, each with a small count badge. Click = open its panel.
  // The row is .sp-ics; opening Git / Roadmap drops this row into the pot's place (gitgraph.css / roadmap.css) and the dock grows up out of it.
  const BI = {
    // the Git logo by Jason Long, CC BY 3.0 (git-scm.com/downloads/logos), path from Simple Icons; drawn in the panel's own colour
    git: '<path transform="translate(1.6 1.6) scale(.7)" fill="currentColor" stroke="none" d="M23.546 10.93L13.067.452c-.604-.603-1.582-.603-2.188 0L8.708 2.627l2.76 2.76c.645-.215 1.379-.07 1.889.441.516.515.658 1.258.438 1.9l2.658 2.66c.645-.223 1.387-.078 1.9.435.721.72.721 1.884 0 2.604-.719.719-1.881.719-2.6 0-.539-.541-.674-1.337-.404-1.996L12.86 8.955v6.525c.176.086.342.203.488.348.713.721.713 1.883 0 2.6-.719.721-1.889.721-2.609 0-.719-.719-.719-1.879 0-2.598.182-.18.387-.316.605-.406V8.835c-.217-.091-.424-.222-.6-.401-.545-.545-.676-1.342-.396-2.009L7.636 3.7.45 10.881c-.6.605-.6 1.584 0 2.189l10.48 10.477c.604.604 1.582.604 2.186 0l10.43-10.43c.605-.603.605-1.582 0-2.187"/>',
    roadmap: '<rect x="2.5" y="3.5" width="4" height="13" rx="1.2"/><rect x="8" y="3.5" width="4" height="9" rx="1.2"/><rect x="13.5" y="3.5" width="4" height="5.5" rx="1.2"/>',
    map: '<circle cx="10" cy="3.8" r="1.7" fill="currentColor" stroke="none"/><circle cx="4.5" cy="11" r="1.7" fill="currentColor" stroke="none"/><circle cx="15.5" cy="11" r="1.7" fill="currentColor" stroke="none"/><circle cx="10" cy="16.5" r="1.7" fill="currentColor" stroke="none"/><path d="M10 5.5v3M10 8.5c0 0-5.5-.3-5.5 1M10 8.5c0 0 5.5-.3 5.5 1M4.5 12.7c0 2.4 5.5 1.8 5.5 2.1"/>',
    workflow: '<circle cx="4.5" cy="4.5" r="1.8"/><circle cx="15.5" cy="4.5" r="1.8"/><circle cx="10" cy="15.5" r="1.8"/><path d="M5.8 5.8L9 13.8M14.2 5.8L11 13.8"/>',
    items: '<path d="M8 5.5h9M8 10h9M8 14.5h9"/><path d="M3 5.3l1 1 1.8-2M3 9.8l1 1 1.8-2"/><circle cx="4" cy="14.5" r="1.1"/>' };
  const ibtn = (k, label, badge, cls) => `<button type="button" class="sp-ib" data-pop="${k}" aria-label="${e(label)}${badge ? ` (${e(badge)})` : ''}"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BI[k]}</svg>`
    + (badge ? `<span class="sp-bd${cls ? ' ' + cls : ''}">${e(badge)}</span>` : '') + `</button>`;
  function html(pg) {
    const inf = info[pg.g], gt = inf?.git, rm = inf?.roadmap;
    const dirty = gt ? (gt.trees.length === 1 ? gt.trees[0].changed || 0 : gt.trees.filter(t => t.changed).length) : 0;
    const open = rm ? rm.todo + rm.doing + rm.test : 0, on = openN();
    const ics = (gt && pg.g !== 'home' ? ibtn('git', 'Git', dirty ? String(dirty) : '', 'sp-bw') : '')
      + ibtn('roadmap', 'Roadmap', open ? String(open) : '', rm?.doing ? 'sp-ba' : '')
      + (pg.g !== 'home' ? ibtn('map', 'Code map', '') : '')
      + (pg.g !== 'home' ? ibtn('workflow', 'Workflow', '') : '')
      + (pg.g === 'foreman' ? ibtn('items', 'Open items', on ? String(on) : '') : '');
    return `<div class="sp-ics">${ics}</div>` + (pot0 ? pot(pot0.plan, pot0.today, pot0.out, pg.g) : pot(inf?.plan, inf?.today, inf?.out, pg.g));
  }
  // Water (all pages): output tokens from every Claude transcript on this PC (server pageUsage) x Opus 5.5's estimated 15-30 mL of cooling water per 1,000 output tokens.
  // All lifetime, no per-day figures (2026-11-16). Counted like an odometer (2026-11-16): tears trickle up into drinking glasses,
  // gallons, water-cooler jugs, fish tanks, bathtubs, swimming pools, water towers, Loch Nesses, oceans (CONT). Each row shows its whole count and a meter
  // toward the next container; when the meter caps out it goes back to 0 and the next row goes up by 1. Bigger rows stay hidden until they reach 1.
  // The glass in the pot row = the drinking-glass meter (glasses toward a gallon); hover (or click/Enter) opens the card (waterPop).
  const ML = [15, 30];
  // [icon, one, many, how many of the previous container fill one]; litres follow from one tear (0.06 mL). Rounded so each step is a whole number:
  // 4,500 tears ≈ a 9 oz glass, 14 glasses ≈ a gallon, 5 gallons = a water-cooler jug, 4 jugs ≈ a 20-gallon fish tank, 2 tanks ≈ a bathtub (150 L),
  // 400 tubs ≈ a backyard pool (60,000 L), 70 pools ≈ a water tower (4.2M L), 1.75M towers ≈ Loch Ness (7.4 km³), 180M Loch Nesses ≈ the oceans (the last one keeps counting)
  const TEAR = .00006;
  const CONT = [['tear', 'tear', 'tears'], ['cup', 'drinking glass', 'drinking glasses', 4500], ['jug', 'gallon', 'gallons', 14],
    ['cooler', 'water cooler jug', 'water cooler jugs', 5], ['tank', 'fish tank', 'fish tanks', 4], ['tub', 'bathtub', 'bathtubs', 2],
    ['pool', 'swimming pool', 'swimming pools', 400], ['tower', 'water tower', 'water towers', 70], ['ness', 'Loch Ness', 'Loch Nesses', 1750000],
    ['sea', 'ocean', 'oceans', 180000000]].reduce((a, [k, one, many, cap]) => (a.push([k, a.length ? a.at(-1)[1] * cap : TEAR, one, many, cap]), a), []);
  // odometer: whole count per container (the last one just keeps counting) + how far each row's meter is toward the next container
  const odo = L => { let rest = Math.floor(L / CONT[0][1] + 1e-9); const part = L / CONT[0][1] - rest;
    return CONT.map((c, i) => { const cap = CONT[i + 1]?.[4], n = cap ? rest % cap : rest, r = { c, n, f: cap ? (n + (i ? 0 : part)) / cap : 0, last: !cap };
      rest = cap ? Math.floor(rest / cap) : 0; return r; }); };
  const litres = (tok, ml) => tok / 1000 * ml / 1000;
  const mid = tok => litres(tok, (ML[0] + ML[1]) / 2);
  const fmtL = l => l < 10 ? l.toFixed(1) + ' L' : Math.round(l).toLocaleString() + ' L';
  const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n);
  // The cup tracks usage live (the server recomputes on every 3s poll); the surface ripples faster and drops fall in while tokens are flowing
  // (output in the last 10 min, out.rate). One persistent cup per page, updated in place, so the level glides instead of jumping.
  const towers = {};
  function towerEl(g) {
    if (towers[g]) return towers[g];
    const cid = 'spCupC-' + String(g).replace(/[^\w-]/g, '_'); // clip id per page: a shared id resolved to a hidden page's clip
    const t = document.createElement('span'); t.className = 'sp-tower sp-cup'; t.dataset.pop = 'water'; t.setAttribute('role', 'button'); t.tabIndex = 0; t.setAttribute('aria-label', 'Water used');
    t.innerHTML = `<svg width="20" height="24" viewBox="0 0 20 24" aria-hidden="true">`
      + `<defs><clipPath id="${cid}"><path d="M3.6 4.5 H16.4 L14.9 21.2 a1.4 1.4 0 0 1 -1.4 1.3 H6.5 a1.4 1.4 0 0 1 -1.4 -1.3 Z"/></clipPath></defs>`
      + `<g clip-path="url(#${cid})"><g class="sp-lvl"><path class="sp-wave" d="M-16 22 q4 -1.5 8 0 t8 0 t8 0 t8 0 t8 0 t8 0 V30 H-16 Z"/></g><circle class="sp-drip" cx="10" cy="2" r="1"/></g>`
      + `<path class="sp-glass" d="M3 3.5 H17 L15.4 21.2 a2 2 0 0 1 -2 1.8 H6.6 a2 2 0 0 1 -2 -1.8 Z"/><path class="sp-shine" d="M5.6 6.5 L6.6 19"/></svg>`;
    return towers[g] = t;
  }
  function towerSet(t, o) {
    const L = o ? mid(o.all) : 0, fill = !o ? 0 : Math.max(.06, Math.min(.97, odo(L)[1].f)); // glasses toward a gallon
    t.style.setProperty('--lvl', (-17 * fill).toFixed(2) + 'px'); // 17px = empty to brim
    const r = o?.rate || 0, busy = r > 0, sp = busy ? Math.max(.7, 2.4 - Math.log10(1 + r / 1000) * 1.2) : 4.5; // ~1k tok/10min = a little faster, 50k+ = choppy
    const d = sp.toFixed(1) + 's'; if (t._sp !== d) { t._sp = d; t.style.setProperty('--wv', d); }
    t.classList.toggle('busy', busy);
  }
  const water = () => '<span class="sp-tow-at"></span>';
  // Water card (lifetime): big litres + range, then one row per container (tears always; the rest once reached),
  // smallest at the top (2026-11-16): its odometer count and a bar filling toward the next one. One quiet footer line.
  const IC = { // 20px line icons, stroke = currentColor
    drop: '<path d="M10 2.5C7 6.5 4.5 9.4 4.5 12.3a5.5 5.5 0 0 0 11 0C15.5 9.4 13 6.5 10 2.5z"/>',
    cup: '<path d="M5 3.5h10l-1.4 13.4a1.2 1.2 0 0 1-1.2 1.1H7.6a1.2 1.2 0 0 1-1.2-1.1z"/><path d="M5.7 9h8.6"/>',
    tub: '<path d="M2.5 10h15v2.5a4 4 0 0 1-4 4h-7a4 4 0 0 1-4-4z"/><path d="M5 10V5a2 2 0 0 1 3.6-1.2M6 16.5 5 18.5M14 16.5l1 2"/>',
    tear: '<path d="M2.5 7c2-2.7 4.5-4 7.5-4s5.5 1.3 7.5 4c-2 2.7-4.5 4-7.5 4s-5.5-1.3-7.5-4z"/><circle cx="10" cy="7" r="1.8"/><path d="M6.6 12.2c-1 1.5-1.8 2.6-1.8 3.6a1.8 1.8 0 0 0 3.6 0c0-1-.8-2.1-1.8-3.6z"/>',
    jug: '<path d="M7.5 2.5h3.5v2.2l3.6 3a2 2 0 0 1 .7 1.5v7.3a1 1 0 0 1-1 1H5.7a1 1 0 0 1-1-1V9.2a2 2 0 0 1 .7-1.5l2.1-1.8z"/><path d="M11.4 9.5h1.8v3.2h-1.8z"/>',
    cooler: '<path d="M7 2.5h6a1 1 0 0 1 1 1v4.3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V3.5a1 1 0 0 1 1-1z"/><path d="M5.5 11h9v7h-9z"/><path d="M8 13.5h1.2M10.8 13.5H12"/>',
    tank: '<rect x="2.5" y="5" width="15" height="11.5" rx="1"/><path d="M2.5 7.8h15"/><path d="M6.5 12.3c1.3-1.5 3.3-1.5 4.6 0-1.3 1.5-3.3 1.5-4.6 0zm4.6 0 1.8-1.3v2.6z"/><path d="M14.5 10.2v.01M13.8 14.6v.01"/>',
    tower: '<path d="M4.5 6.5h11v2.8a5.5 2 0 0 1-11 0z"/><path d="M4.5 6.5 10 3l5.5 3.5"/><path d="M7 11 5.8 18M13 11l1.2 7M6.6 14.6h6.8M5 18h10"/>',
    ness: '<path d="M2 16.5c1.3 0 1.3 1 2.7 1s1.3-1 2.6-1 1.3 1 2.7 1 1.3-1 2.6-1 1.4 1 2.7 1 1.3-1 2.7-1"/><path d="M4.2 15.2C4 10.5 4.6 7.2 6.3 5.6"/><path transform="rotate(12 8 5)" fill="currentColor" stroke="none" fill-rule="evenodd" d="M5.6 5a2.4 1.4 0 1 0 4.8 0a2.4 1.4 0 1 0-4.8 0zM7.8 4.6a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0z"/><path d="M9.4 15.2c0-3 4.2-3 4.2 0M14.6 15.2c0-2 2.8-2 2.8 0l1-1.4"/>', // Nessie: neck, head (eye cut out), two humps, tail
    sea: '<path d="M2 8.5c1.3 0 1.3-1 2.7-1s1.3 1 2.6 1 1.3-1 2.7-1 1.3 1 2.6 1 1.4-1 2.7-1 1.3 1 2.7 1M2 12.5c1.3 0 1.3-1 2.7-1s1.3 1 2.6 1 1.3-1 2.7-1 1.3 1 2.6 1 1.4-1 2.7-1 1.3 1 2.7 1M2 16.5c1.3 0 1.3-1 2.7-1s1.3 1 2.6 1 1.3-1 2.7-1 1.3 1 2.6 1 1.4-1 2.7-1 1.3 1 2.7 1"/>',
    pool: '<path d="M12.5 13V4.5a1.5 1.5 0 0 1 3 0M16.5 13V4.5M12.5 7.5h4M12.5 10.5h4"/><path d="M2 14.5c1.3 0 1.3 1 2.7 1s1.3-1 2.6-1 1.3 1 2.7 1 1.3-1 2.6-1 1.4 1 2.7 1 1.3-1 2.7-1M2 17.8c1.3 0 1.3 1 2.7 1s1.3-1 2.6-1 1.3 1 2.7 1 1.3-1 2.6-1 1.4 1 2.7 1 1.3-1 2.7-1"/>' };
  const ico = k => `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
  function waterPop(o) {
    if (!o) return '<div class="sp-wh">…</div>';
    const L = mid(o.all), lo = litres(o.all, ML[0]), hi = litres(o.all, ML[1]);
    const rows = odo(L).filter((r, i) => !i || L >= r.c[1]).map(({ c: [k, , one, many], n, f, last }) => // smallest first; tears always there
      `<div class="sp-wr">${ico(k)}<b>${n.toLocaleString()}</b><span>${n === 1 ? one : many}</span>${last ? '' : `<i style="--p:${(f * 100).toFixed(1)}%"></i>`}</div>`).join('');
    return `<div class="sp-wh">${ico('drop')}<b>${fmtL(L)}</b><span>${fmtL(lo).slice(0, -2)}–${fmtL(hi)}</span></div>`
      + `<div class="sp-wt">${rows}</div>`
      + `<div class="sp-wf">${fmtTok(o.all)} output tokens · ${ML[0]}–${ML[1]} mL per 1k</div>`;
  }
  // The pot (all pages): API-price value of this month's agent work vs the flat subscription. Big number = month value / price;
  // the month's value and today's value (with a "best day" flag when it is the month's best so far); the water glass on the right.
  function pot(p, td, o, g) {
    if (!p || !td) return `<div class="sp-pot"><b class="sp-x">…</b></div>`;
    const x = p.price ? p.month / p.price : 0, xs = x < 10 ? x.toFixed(1) : Math.round(x), best = td.usd > 0 && p.today >= p.best;
    return `<div class="sp-pot"><b class="sp-x ${x >= 1 ? 'sp-g' : 'sp-w'}">${xs}×</b><div class="sp-pt">`
      + `<div>${usd(p.month)} month</div>`
      + `<div><b${best ? ' class="sp-g"' : ''}>${usd(td.usd)}</b> today${best ? ' <span class="sp-g sp-best" title="Best day this month"><svg viewBox="0 0 20 20" width="11" height="11" fill="currentColor" aria-label="Best day this month"><path d="M10 1.8l2.5 5.3 5.8.7-4.3 4 1.1 5.7L10 14.7l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z"/></svg></span>' : ''}</div></div>${water(o, g)}</div>`; // best day = small star (text didn't fit the narrow column)
  }
  // Click lists (Access: every folder in full; Git: every worktree with its branch, agents and uncommitted files)
  function popHtml(pg, kind) {
    if (kind === 'water') return waterPop(pot0?.out || info[pg.g]?.out);
    if (kind === 'access') {
      const fl = folders(pg) || [];
      return `<div class="sp-ph">${e(pg.what)} agents can access</div>` + fl.map(f => `<div class="sp-pi"><span>${e(f)}</span>${f === acc.memory ? '<em>read-only</em>' : ''}</div>`).join('');
    }
    const gt = info[pg.g]?.git; if (!gt) return '';
    return `<div class="sp-ph">${e(gt.repo)} worktrees</div>` + gt.trees.map(t => `<div class="sp-pi sp-tree"><div><b>${e(t.branch)}</b>${t.main ? ' <em>main folder</em>' : ''}`
      + `<span class="${t.changed ? 'sp-w' : ''}">${t.changed == null ? '?' : t.changed ? t.changed + ' uncommitted' : 'clean'}</span></div>`
      + `<div class="sp-sub">${t.agents?.length ? e(t.agents.join(', ')) + ' · ' : ''}${e(short(t.path))}</div></div>`).join('');
  }
  // Glass popover; .on animates it in/out (CSS), content stays during the fade-out
  const pop = document.createElement('div'); pop.className = 'sp-pop'; pop.setAttribute('role', 'dialog'); document.body.appendChild(pop);
  function popDraw() {
    const pg = curPg(); if (!popKind || !pg || !popRow?.isConnected) return popClose();
    const ftk = document.getElementById('ftk');
    if (popKind === 'items') { if (ftk && ftk.parentNode !== pop) { pop._h = 'items'; pop.innerHTML = '<div class="sp-ph">Foreman open items</div>'; pop.append(ftk); } } // the live list moves in (kept up to date by ftkRender)
    else { if (ftk && ftk.parentNode === pop) document.getElementById('ftkHome')?.append(ftk); const h = popHtml(pg, popKind); if (pop._h !== h) { pop._h = h; pop.innerHTML = h; } }
    // Straight up out of the panel: exactly the panel's column (same left edge + width), sitting right on top of it
    const r = (popRow.closest('.dkres') || popRow).getBoundingClientRect();
    pop.style.left = r.left + 'px'; pop.style.width = r.width + 'px'; pop.style.bottom = (innerHeight - r.top + 8) + 'px';
  }
  function popClose() { if (!popKind) return; popKind = popRow = null; pop.classList.remove('on'); pop._h = ''; }
  window.FmSidePanel = { close: popClose }; // Settings opening closes the click list (settings.js)
  function popOpen(el) { const k = el.dataset.pop; const PN = { git: 'FmGit', roadmap: 'FmRoadmap', map: 'FmMap', workflow: 'FmWorkflow' }; if (PN[k] && window[PN[k]]) { popClose(); for (const o in PN) if (o !== k) window[PN[o]]?.show?.(false); window[PN[k]].toggle(); return render(); } if (popKind === k) return popClose(); popKind = k; if (k === 'items' && typeof ftkLoad === 'function') ftkLoad(); popRow = el; popDraw(); requestAnimationFrame(() => pop.classList.add('on')); }
  document.addEventListener('click', ev => { const el = ev.target.closest?.('.dkres.sp [data-pop]'); if (el) return popOpen(el); if (!ev.target.closest?.('.sp-pop')) popClose(); }, true);
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && popKind) popClose(); else if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest?.('.dkres.sp [data-pop]') && ev.target.tagName !== 'BUTTON') { ev.preventDefault(); popOpen(ev.target); } });
  addEventListener('resize', () => popKind && popDraw());
  // Water tower: hover opens its figures, leaving the tower (and not moving onto the card) closes them
  let hovT = 0;
  document.addEventListener('pointerover', ev => { const t = ev.target.closest?.('.dkres.sp .sp-tower'); if (t || ev.target.closest?.('.sp-pop')) clearTimeout(hovT); if (t && popKind !== 'water') popOpen(t); });
  document.addEventListener('pointerout', ev => { if (popKind !== 'water' || !ev.target.closest?.('.dkres.sp .sp-tower, .sp-pop')) return;
    const to = ev.relatedTarget; if (to?.closest?.('.dkres.sp .sp-tower, .sp-pop')) return; clearTimeout(hovT); hovT = setTimeout(() => popKind === 'water' && popClose(), 150); });
  // Draws every agents page's slot (hidden ones too, so a page switch never shows a blank or '…' panel);
  function render() {
    if (document.hidden) return;
    const cur = curPg();
    for (const pg of allPages()) {
      const slot = document.querySelector('#dzone-' + pg.g + ' > .dkres'); if (!slot) continue;
      if (!slot.classList.contains('sp')) { slot.classList.add('sp'); slot.removeAttribute('aria-hidden'); slot.setAttribute('aria-label', 'Page settings'); }
      const h = html(pg); if (slot._sp !== h) { slot._sp = h; slot.innerHTML = h; if (popKind && pg === cur) popRow = slot.querySelector(`[data-pop="${popKind}"]`); }
      const tw = towerEl(pg.g), ta = slot.querySelector('.sp-tow-at'); if (ta && tw.parentNode !== ta) ta.appendChild(tw); towerSet(tw, pot0?.out || info[pg.g]?.out);
      slot.querySelector('[data-pop="git"]')?.classList.toggle('sp-on', pg === cur && !!window.FmGit?.open); // Git dock open (gitgraph.js)
      slot.querySelector('[data-pop="map"]')?.classList.toggle('sp-on', pg === cur && !!window.FmMap?.open); // Code Map panel open (codemap.js)
      slot.querySelector('[data-pop="workflow"]')?.classList.toggle('sp-on', pg === cur && !!window.FmWorkflow?.open); // Workflow graph open (workflowgraph.js)
      slot.querySelector('[data-pop="roadmap"]')?.classList.toggle('sp-on', pg === cur && !!window.FmRoadmap?.open); // Roadmap board open (roadmap.js)
    }
    if (!cur) return popClose();
    if (popKind) popDraw();
  }
  let lastG = null; // switching pages closes an open list, redraws at once and refreshes that page's facts
  const tick = () => { const g = curPg()?.g; if (g !== lastG) { lastG = g; popClose(); loadInfo(); } allPages().forEach(p => { if (!info[p.g]) fetchInfo(p.g); }); render(); }; // pages added after start get fetched too
  new MutationObserver(tick).observe(document.body, { attributes: true, attributeFilter: ['data-tab'] }); // fires on every show()
  loadAcc(); loadAll(); setInterval(loadAcc, 30000); setInterval(() => { if (!document.hidden) loadInfo(); }, 3000); setInterval(tick, 1000); render();
  addEventListener('visibilitychange', () => { if (!document.hidden) { load(); render(); } });
})();
