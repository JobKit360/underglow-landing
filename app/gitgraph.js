// Git dock (level 1 = local git only): the Git row of the settings panel (bottom left, settingspanel.js) opens it over the page's left column
// (header + deck zone, down to just above that row). Data: GET /api/gitgraph?g=<page> (gitgraph.mjs), polled every 4 s while open.
//   Graph: main is the straight line on the left (lane 0), every other branch runs in its own lane to the right, curving off main where it
//   started and back in where it was merged. Newest at the top. Branch tips are big glowing circles with the branch name; a worktree with
//   uncommitted files gets a dashed "uncommitted" node above its tip.
//   Agents: while open, every agent pane on the page dims except the ones working in this repo (lit in their branch's colour); hovering a
//   branch, a commit or an agent chip narrows it to that branch / that commit's agent and fades the other lanes.
//   Click a commit: the inspector at the bottom shows its message, files (+/-) and who made it (agent, from gitgraph.mjs's attribution).
(() => {
  const ROW = 60, X0 = 15, R = 4.5, RT = 7; let LW = 13; // lane width: tighter when many branches run side by side (draw)
  const MAIN_C = '#4A8FE8', PAL = ['#3DD6B5', '#B48CFF', '#F2A54A', '#FF7AA8', '#7DD87D', '#5BC8F5', '#E8D55B', '#FF8F6B'];
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const curPg = () => typeof agPageTab === 'function' && typeof tab !== 'undefined' ? agPageTab(tab) : null;
  const ago = t => { const s = Date.now() / 1000 - t; if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; if (s < 86400 * 7) return Math.floor(s / 86400) + 'd';
    return new Date(t * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' }); };
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
  const liveStatus = a => (typeof agents !== 'undefined' && agents.get?.(a.id)?.status) || a.status;
  const busy = a => liveStatus(a) === 'working';

  const dock = document.createElement('aside'); dock.id = 'ggDock'; dock.className = 'gg'; dock.setAttribute('aria-label', 'Git'); dock.setAttribute('aria-hidden', 'true');
  dock.innerHTML = `<div class="gg-hd"><svg class="gg-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="8" r="2.2"/><path d="M6 7.2v9.6M18 10.2c0 4-6 3.5-11 7"/></svg>
      <div class="gg-tt"><b class="gg-repo"></b><span class="gg-sub"></span></div><button class="gg-x" type="button" title="Close (Esc)" aria-label="Close">×</button></div>
    <div class="gg-rmenu" role="menu" hidden></div>
    <div class="gg-sc"><div class="gg-cv"><svg class="gg-svg" aria-hidden="true"></svg><div class="gg-rows" role="list"></div></div><div class="gg-foot"></div></div>
    <div class="gg-insp" hidden></div>`;
  document.body.appendChild(dock);
  const $ = s => dock.querySelector(s), sc = $('.gg-sc'), svg = $('.gg-svg'), rowsEl = $('.gg-rows'), insp = $('.gg-insp'), rmenu = $('.gg-rmenu');
  const curRepo = () => { try { return localStorage.getItem('ggRepo:' + g) || ''; } catch { return ''; } };
  let openT = 0; const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let open = false, g = null, data = null, last = '', model = null, focus = null, sel = null, pollT = 0, placeT = 0, hotT = 0, introT = 0, closeT = 0;

  // ---------- layout model: lanes, colours, edges ----------
  const mergedName = s => { const m = /^Merge (?:pull request #\d+ from \S*?\/(\S+)|(?:remote-tracking )?branch '([^']+)'|([\w./-]+[/-][\w./-]+))/.exec(s || ''); return m ? (m[1] || m[2] || m[3]) : null; };
  function build(d) {
    const commits = d.commits || [], byH = new Map(commits.map((c, i) => [c.h, c]));
    const local = d.branches.filter(b => !b.remote).sort((a, b) => (b.name === d.main) - (a.name === d.main) || b.t - a.t);
    const remote = d.branches.filter(b => b.remote).sort((a, b) => b.t - a.t);
    const brs = [...local, ...remote].filter(b => byH.has(b.sha));
    // who owns each commit: main's first-parent chain first, then each branch back to where it meets one already drawn
    const own = new Map(), info = []; let pi = 0;
    for (const b of brs) {
      const bi = info.length, isMain = b.name === d.main; let claimed = 0;
      for (let h = b.sha; h && byH.has(h) && !own.has(h); h = byH.get(h).p[0]) { own.set(h, bi); claimed++; }
      const color = isMain ? MAIN_C : b.remote && local.some(l => l.upstream === b.name && l.sha === b.sha) ? null : PAL[pi++ % PAL.length];
      info.push({ ...b, bi, main: isMain, color: color || MAIN_C, claimed });
    }
    // remote copies that add nothing share their local branch's colour
    for (const b of info) if (b.remote && !b.claimed) { const l = info.find(x => !x.remote && x.upstream === b.name); if (l) b.color = l.color; }
    // branches that were merged and then deleted: no ref left, but the merge commit still brings them in. Each gets its own colour and the
    // name the merge message gives it ("Merge branch 'x'", "Merge pull request #n from user/x", "Merge feature/x (…)"), so the hover card can say what it was.
    for (const c of commits) {
      if (c.p.length < 2) continue;
      for (const p of c.p.slice(1)) {
        if (!byH.has(p) || own.has(p)) continue;
        const bi = info.length; let claimed = 0;
        for (let h = p; h && byH.has(h) && !own.has(h); h = byH.get(h).p[0]) { own.set(h, bi); claimed++; }
        info.push({ name: mergedName(c.s) || 'merged branch', bi, ghost: true, mergedBy: c.h, color: PAL[pi++ % PAL.length], claimed, t: c.t });
      }
    }
    const mainB = info.find(b => b.main), mainChain = new Set();
    if (mainB) for (let h = mainB.sha; h && byH.has(h); h = byH.get(h).p[0]) mainChain.add(h);
    // uncommitted work: one pseudo row per worktree with changes, sitting on top of its branch
    const wips = (d.trees || []).filter(t => t.changed > 0 && t.sha).map(t => { const b = info.find(x => !x.remote && x.name === t.branch);
      return { h: 'wip:' + t.path, p: [t.sha], wip: true, tree: t, b: b ? b.bi : own.get(t.sha) ?? 0, onMain: !!b?.main || (!b && mainChain.has(t.sha)) }; });
    const rows = [...wips, ...commits.map(c => ({ ...c, b: own.get(c.h) ?? -1 }))];
    const rowOf = new Map(rows.map((c, i) => [c.h, i]));
    // lanes: main pinned to lane 0; everyone else takes the first free lane to the right
    const lanes = [mainB && byH.has(mainB.sha) ? (wips.find(w => w.onMain)?.h || mainB.sha) : null]; let maxLane = 0;
    const free = () => { let i = 1; while (lanes[i] != null) i++; return i; };
    const top = () => { let i = lanes.length - 1; while (i >= 0 && lanes[i] == null) i--; return i; }; // rightmost lane with a line in it
    rows.forEach((c, r) => {
      const occIn = top();
      const isM = c.wip ? c.onMain : mainChain.has(c.h);
      const mine = []; lanes.forEach((h, i) => { if (h === c.h) mine.push(i); });
      let lane = isM ? 0 : mine.filter(i => i > 0).sort((a, b) => a - b)[0] ?? free();
      for (const i of mine) if (i !== lane) lanes[i] = null;
      c.lane = lane; c.r = r; maxLane = Math.max(maxLane, lane);
      const p0 = c.p[0];
      if (!p0) lanes[lane] = null;
      else if (lanes.some((h, i) => i !== lane && h === p0) && !mainChain.has(p0)) { lanes[lane] = null; c.join = true; } // joins a lane that already waits for that parent: bends over right away
      else lanes[lane] = p0; // keeps its lane down to the parent (forked off main: bends into lane 0 just above it), so no other branch is drawn over its line
      for (const p of c.p.slice(1)) if (!lanes.includes(p) && !mainChain.has(p)) lanes[free()] = p;
      if (c.b < 0) c.b = rows[rowOf.get(p0)]?.b ?? 0;
      c.occ = Math.max(occIn, lane, top()); // lanes with a line at this row: its text starts right after them, not after the widest point of the graph
    });
    // tips (branch labels) per row
    const tips = new Map();
    for (const b of info) { const r = rowOf.get(b.sha); if (r == null) continue; (tips.get(r) || tips.set(r, []).get(r)).push(b); }
    for (const w of wips) w.lane = rows[rowOf.get(w.p[0])]?.lane ?? w.lane;
    return { rows, rowOf, info, tips, maxLane: Math.min(maxLane, 9), wips };
  }
  const lx = l => X0 + Math.min(l, 9) * LW, ry = r => r * ROW + ROW / 2;

  // ---------- drawing ----------
  function draw(anim) {
    const m = model, d = data, W = sc.clientWidth || 260, H = m.rows.length * ROW + (d.more ? ROW : 8);
    LW = m.maxLane <= 4 ? 13 : Math.max(8, 13 - (m.maxLane - 4)); const tx = c => lx(c.occ ?? m.maxLane) + 14;
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); $('.gg-cv').style.height = H + 'px';
    const col = bi => m.info[bi]?.color || MAIN_C;
    let paths = '', dots = '';
    m.rows.forEach((c, r) => {
      const x1 = lx(c.lane), y1 = ry(r);
      c.p.forEach((p, k) => {
        const pr = m.rowOf.get(p);
        const cb = k === 0 ? c.b : (pr != null ? m.rows[pr].b : c.b), stroke = col(cb), dash = c.wip ? ' stroke-dasharray="3 4"' : '';
        let dd;
        if (pr == null) { if (k) return; dd = `M${x1} ${y1} L${x1} ${H}`; } // parent older than what is loaded: runs off the bottom
        else {
          const x2 = lx(m.rows[pr].lane), y2 = ry(pr);
          if (x1 === x2) dd = `M${x1} ${y1} L${x2} ${y2}`;
          else if (k === 0 && c.join) dd = `M${x1} ${y1} C${x1} ${y1 + ROW * .5} ${x2} ${y1 + ROW * .45} ${x2} ${Math.min(y2, y1 + ROW)} L${x2} ${y2}`; // joins a lane already heading to the same parent
          else if (k === 0) { const yb = Math.max(y1, y2 - ROW); dd = `M${x1} ${y1} L${x1} ${yb} C${x1} ${yb + ROW * .55} ${x2} ${y2 - ROW * .5} ${x2} ${y2}`; } // branch start: bends in just above its parent
          else { const ya = Math.min(y2, y1 + ROW); dd = `M${x1} ${y1} C${x1} ${y1 + ROW * .5} ${x2} ${ya - ROW * .55} ${x2} ${ya} L${x2} ${y2}`; } // merge: bends out right below the merge
        }
        paths += `<path class="gg-e" data-b="${cb}" data-r="${r}" d="${dd}" stroke="${stroke}"${dash}${pr == null ? ' mask="url(#ggFade)"' : ''}/>`;
      });
      const tipBs = m.tips.get(r) || [], color = col(c.b), working = c.wip ? (c.tree.agents || []).some(busy) : false;
      if (c.wip) dots += `<g class="gg-n gg-wipn${working ? ' live' : ''}" data-b="${c.b}" data-r="${r}"><circle class="gg-halo" cx="${x1}" cy="${y1}" r="10" fill="${color}"/><circle cx="${x1}" cy="${y1}" r="${RT - .5}" fill="var(--gg-bg)" stroke="${color}" stroke-width="1.6" stroke-dasharray="2.6 2.2"/></g>`;
      else if (tipBs.length) { const lit = m.info[c.b] && treeAgents(m.info[c.b]).some(busy);
        dots += `<g class="gg-n gg-tip${lit ? ' live' : ''}" data-b="${c.b}" data-r="${r}"><circle class="gg-halo" cx="${x1}" cy="${y1}" r="11" fill="${color}"/><circle cx="${x1}" cy="${y1}" r="${RT}" fill="${color}" stroke="var(--gg-bg)" stroke-width="2"/><circle cx="${x1}" cy="${y1}" r="2.2" fill="var(--gg-bg)"/></g>`; }
      else dots += `<g class="gg-n" data-b="${c.b}" data-r="${r}"><circle cx="${x1}" cy="${y1}" r="${c.p.length > 1 ? R - .5 : R}" fill="${c.p.length > 1 ? 'var(--gg-bg)' : color}" stroke="${c.p.length > 1 ? color : 'var(--gg-bg)'}" stroke-width="${c.p.length > 1 ? 1.8 : 2}"/></g>`;
    });
    svg.innerHTML = `<defs><linearGradient id="ggFadeG" x1="0" y1="0" x2="0" y2="1"><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="ggFade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#ggFadeG)"/></mask></defs><g class="gg-es">${paths}</g><g class="gg-ns">${dots}</g>`;
    // text rows
    rowsEl.innerHTML = m.rows.map((c, r) => {
      const tipBs = m.tips.get(r) || [];
      const pills = tipBs.map(b => `<span class="gg-pill${b.remote ? ' rem' : ''}${b.tree ? ' wt' : ''}" data-bi="${b.bi}" style="--bc:${b.color}">${e(b.name)}${b.ahead ? `<i>↑${b.ahead}</i>` : ''}${b.behind ? `<i>↓${b.behind}</i>` : ''}${b.gone ? '<i>gone</i>' : ''}</span>`).join('');
      if (c.wip) return `<div class="gg-r gg-wip" role="listitem" data-r="${r}" style="padding-left:${tx(c)}px"><div class="gg-l1"><span class="gg-wipt">${c.tree.changed} uncommitted</span></div>`
          + `<div class="gg-l2"><span class="gg-wipb">${e(c.tree.branch || 'detached')} · ${e(c.tree.path.split(/[\\/]/).pop())}</span></div></div>`;
      return `<div class="gg-r${sel === c.h ? ' sel' : ''}" role="listitem" tabindex="0" data-r="${r}" style="padding-left:${tx(c)}px"><div class="gg-l1">${pills}<span class="gg-s">${e(c.s)}</span></div>`
        + `<div class="gg-l2"><span class="gg-tm">${ago(c.t)}</span><span class="gg-au">${e(c.an)}</span><span class="gg-h">${c.h.slice(0, 7)}</span></div></div>`;
    }).join('');
    $('.gg-foot').textContent = d.more ? `Showing the latest ${d.commits.length} commits` : '';
    if (anim) { clearTimeout(introT); dock.classList.remove('intro'); void dock.offsetWidth; dock.classList.add('intro'); introT = setTimeout(() => dock.classList.remove('intro'), 1600); } // lines draw in once, on open
    for (const p of svg.querySelectorAll('.gg-e')) { const r = +p.dataset.r; if (r < 40) { p.style.setProperty('--len', Math.ceil(p.getTotalLength?.() || 200)); p.style.setProperty('--d', Math.min(r, 30) * 18 + 'ms'); } }
    for (const n of svg.querySelectorAll('.gg-n')) n.style.setProperty('--d', Math.min(+n.dataset.r, 30) * 18 + 'ms');
    for (const n of rowsEl.children) n.style.setProperty('--d', Math.min(+n.dataset.r, 30) * 18 + 'ms');
    applyFocus();
  }
  const treeAgents = b => (b.tree && data?.trees.find(t => t.path === b.tree)?.agents) || [];
  function chip(a) {
    const st = liveStatus(a), w = st === 'working';
    return `<span class="gg-ag${w ? ' live' : ''}${a.made ? ' made' : ''}" data-ag="${e(a.id)}" title="${e(a.name)}${a.made ? ' made this commit' : w ? ' is working here' : ' · ' + e(st || 'idle')}" style="--ah:${hue(a.name)}"><i>${e((a.name || '?')[0])}</i>${e(a.name)}</span>`;
  }

  // ---------- focus: fade other lanes, light the agents ----------
  function hotAgents() {
    if (!data) return { hot: new Map(), any: false };
    const hot = new Map(), m = model, colOf = path => { const t = data.trees.find(x => x.path === path), b = m?.info.find(x => !x.remote && x.name === t?.branch); return b?.color || MAIN_C; };
    const all = data.trees.flatMap(t => (t.agents || []).map(a => ({ ...a, c: colOf(t.path), tree: t.path })));
    if (focus?.agent) { const a = all.find(x => x.id === focus.agent) || { id: focus.agent, c: focus.c || MAIN_C }; hot.set(a.id, { c: a.c, strong: true }); }
    else if (focus?.b != null) { const b = m.info[focus.b]; for (const a of all) if (b && !b.remote && a.tree === b.tree) hot.set(a.id, { c: b.color, strong: busy(a) }); }
    else for (const a of all) if (busy(a)) hot.set(a.id, { c: a.c, strong: true });
    return { hot };
  }
  function lightAgents() {
    const pg = curPg(); if (!open || !pg) return clearAgents();
    const { hot } = hotAgents();
    document.body.classList.add('ggdim');
    for (const el of document.querySelectorAll(`#panes-${pg.g} .apane, #dzone-${pg.g} .dcard:not(.ocard), .atile`)) {
      const id = el.id?.startsWith('p-') ? el.id.slice(2) : el.dataset.id, h = hot.get(id);
      el.classList.toggle('gg-hot', !!h); el.classList.toggle('gg-strong', !!h?.strong); el.classList.toggle('gg-dim', !h);
      if (h) el.style.setProperty('--gg-c', h.c); else el.style.removeProperty('--gg-c');
    }
  }
  // hover in the tight stack goes by the pointer's height, not by what's on top: each card owns its slice (the last one its whole face), so
  // a card raised to the front never hides the slices below it from the pointer. The raised card slides out a little (.gg-up).
  let upEl = null;
  const setUp = c => { if (c === upEl) return; upEl?.classList.remove('gg-up'); upEl = c; c?.classList.add('gg-up'); if (c) setFocus({ agent: c.dataset.id }); else setFocus(sel ? selFocus() : null); };
  document.addEventListener('pointermove', ev => {
    if (!open || !stack.cs.length || ev.pointerType === 'touch') return setUp(null);
    const { cs, x0, x1, y0, ch } = stack, x = ev.clientX, y = ev.clientY;
    if (x < x0 || x > x1 + 14 || y < y0 || y > y0 + (cs.length - 1) * TIGHT + ch) return setUp(null);
    setUp(cs[Math.min(cs.length - 1, Math.floor((y - y0) / TIGHT))]);
  }, true);
  function clearAgents() {
    document.body.classList.remove('ggdim');
    for (const el of document.querySelectorAll('.gg-hot, .gg-dim')) { el.classList.remove('gg-hot', 'gg-dim', 'gg-strong'); el.style.removeProperty('--gg-c'); }
  }
  function applyFocus() {
    const fb = focus?.b, fa = focus?.agent, on = fb != null || !!fa;
    dock.classList.toggle('focus', on);
    const inB = el => fb != null ? +el.dataset.b === fb : true;
    for (const el of svg.querySelectorAll('[data-b]')) el.classList.toggle('on', fb != null && inB(el));
    rowsEl.querySelectorAll('.gg-r').forEach(el => { const c = model.rows[+el.dataset.r]; const hit = fa ? (c.ag?.id === fa || (c.wip && (c.tree.agents || []).some(a => a.id === fa))) : fb != null && c.b === fb; el.classList.toggle('on', on && hit); });
    if (fa) { const rs = new Set(model.rows.filter(c => c.ag?.id === fa || (c.wip && (c.tree.agents || []).some(a => a.id === fa))).map(c => c.r)); for (const el of svg.querySelectorAll('.gg-n')) el.classList.toggle('on', rs.has(+el.dataset.r)); }
    for (const el of rowsEl.querySelectorAll('.gg-ag')) el.classList.toggle('on', fa === el.dataset.ag);
    lightAgents();
  }
  const setFocus = f => { if (JSON.stringify(f) === JSON.stringify(focus)) return; focus = f; applyFocus(); };
  // ---------- hover card: what the branch was ----------
  // Beside the dock (over the desk), next to the row under the pointer: the branch the commit belongs to (live, remote, or merged and
  // deleted), how many commits it has here, where it came from and where it went; then the commit itself (whole message, author, date, hash).
  const pop = document.createElement('div'); pop.className = 'gg-pop'; pop.setAttribute('aria-hidden', 'true'); document.body.appendChild(pop);
  let popR = -1, popT = 0;
  const bName = bi => model.info[bi]?.name || 'main';
  const bPill = bi => { const b = model.info[bi]; return `<span class="gg-pp" style="--bc:${b?.color || MAIN_C}">${e(b?.name || '?')}</span>`; };
  const fullDate = t => new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  function branchFacts(bi) {
    const b = model.info[bi], rs = model.rows.filter(x => !x.wip && x.b === bi), hs = new Set(rs.map(x => x.h)), out = [];
    if (!b) return '';
    const oldest = rs.at(-1), pr = oldest && model.rowOf.get(oldest.p[0]), from = pr != null ? model.rows[pr] : null;
    const into = b.ghost ? model.rows[model.rowOf.get(b.mergedBy)] : model.rows.find(x => !x.wip && x.p.slice(1).some(p => hs.has(p)));
    out.push(`${rs.length}${model.data?.more && !from ? '+' : ''} commit${rs.length === 1 ? '' : 's'}`);
    if (from && from.b !== bi) out.push(`from ${bPill(from.b)} ${ago(from.t)} ago`);
    if (into && into.b !== bi) out.push(`merged into ${bPill(into.b)} ${ago(into.t)} ago`);
    return out.join(' · ');
  }
  function popHtml(c) {
    const b = model.info[c.b], kind = !b ? '' : b.ghost ? 'merged · deleted' : b.main ? 'main' : b.remote ? 'remote' : b.tree ? 'checked out' : 'branch';
    const track = b && !b.ghost ? [b.upstream ? `tracks ${e(b.upstream)}` : '', b.ahead ? `${b.ahead} to push` : '', b.behind ? `${b.behind} to pull` : '', b.gone ? 'remote deleted' : ''].filter(Boolean).join(' · ') : '';
    let h = `<div class="gg-pb"><span class="gg-pd" style="--bc:${b?.color || MAIN_C}"></span><b>${e(b?.name || 'main')}</b>${kind ? `<span class="gg-pk">${kind}</span>` : ''}</div>`
      + `<div class="gg-pf">${branchFacts(c.b)}</div>` + (track ? `<div class="gg-pf">${track}</div>` : '');
    if (c.wip) return h + `<div class="gg-ps">${c.tree.changed} uncommitted file${c.tree.changed === 1 ? '' : 's'}</div><div class="gg-pm">${c.tree.files.slice(0, 6).map(f => e(f.f)).join('<br>')}${c.tree.changed > 6 ? `<br>+${c.tree.changed - 6} more` : ''}</div>`;
    h += `<div class="gg-ps">${e(c.s)}</div><div class="gg-pm">${e(c.an)} · ${fullDate(c.t)} · <code>${c.h.slice(0, 10)}</code></div>`;
    if (c.p.length > 1) { const pr = model.rowOf.get(c.p[1]); if (pr != null) h += `<div class="gg-pg">Merges ${bPill(model.rows[pr].b)} into ${bPill(c.b)}</div>`; }
    return h;
  }
  function popAt(row) {
    const r = +row.dataset.r, c = model.rows[r]; if (!c) return popHide();
    if (popR !== r) { popR = r; pop.innerHTML = popHtml(c); }
    const dr = dock.getBoundingClientRect(), rr = row.getBoundingClientRect(), ph = pop.offsetHeight;
    pop.style.left = Math.round(dr.right + 10) + 'px';
    pop.style.top = Math.round(Math.max(8, Math.min(innerHeight - ph - 8, rr.top + rr.height / 2 - ph / 2))) + 'px';
    pop.classList.add('on');
  }
  function popHide() { clearTimeout(popT); popR = -1; pop.classList.remove('on'); }
  rowsEl.addEventListener('pointermove', ev => {
    const row = ev.target.closest('.gg-r'); if (!row || !model || ev.pointerType === 'touch') return;
    clearTimeout(popT); if (pop.classList.contains('on')) popAt(row); else popT = setTimeout(() => row.isConnected && popAt(row), 220);
  });
  rowsEl.addEventListener('pointerleave', popHide);
  sc.addEventListener('scroll', popHide, { passive: true });
  rowsEl.addEventListener('pointerover', ev => {
    const ag = ev.target.closest('.gg-ag'), pill = ev.target.closest('.gg-pill'), row = ev.target.closest('.gg-r');
    if (ag) return setFocus({ agent: ag.dataset.ag });
    if (pill) return setFocus({ b: +pill.dataset.bi });
    if (row) { const c = model.rows[+row.dataset.r]; return setFocus(c.ag && !c.wip ? { b: c.b, agent: c.ag.id } : { b: c.b }); }
  });
  svg.parentNode.addEventListener('pointerleave', () => setFocus(sel ? selFocus() : null));
  const selFocus = () => { const c = model?.rows.find(x => x.h === sel); return c ? (c.ag ? { b: c.b, agent: c.ag.id } : { b: c.b }) : null; };
  rowsEl.addEventListener('click', ev => {
    const ag = ev.target.closest('.gg-ag'); if (ag) { const p = document.getElementById('p-' + ag.dataset.ag); if (p) { p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); p.classList.remove('gg-ping'); void p.offsetWidth; p.classList.add('gg-ping'); } return; }
    const row = ev.target.closest('.gg-r'); if (!row) return; const c = model.rows[+row.dataset.r];
    if (c.wip) return inspectWip(c);
    if (sel === c.h) return closeInsp();
    sel = c.h; rowsEl.querySelectorAll('.gg-r.sel').forEach(x => x.classList.remove('sel')); row.classList.add('sel'); inspect(c);
  });
  rowsEl.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest('.gg-r')) { ev.preventDefault(); ev.target.click(); } });

  // ---------- inspector ----------
  function closeInsp() { sel = null; insp.classList.remove('on'); rowsEl.querySelectorAll('.gg-r.sel').forEach(x => x.classList.remove('sel')); setTimeout(() => { if (!sel) insp.hidden = true; }, 200); }
  function showInsp(html) { insp.innerHTML = `<button class="gg-ix" type="button" aria-label="Close">×</button>` + html; insp.hidden = false; requestAnimationFrame(() => insp.classList.add('on')); insp.querySelector('.gg-ix').onclick = closeInsp; }
  function filesHtml(fs) {
    const max = Math.max(1, ...fs.map(f => (f.add || 0) + (f.del || 0)));
    return `<div class="gg-fs">${fs.slice(0, 80).map(f => { const n = (f.add || 0) + (f.del || 0), w = Math.max(n ? 6 : 0, Math.round(n / max * 44));
      return `<div class="gg-f"><span class="gg-fn" title="${e(f.f)}">${e(f.f.split('/').pop())}<em>${e(f.f.includes('/') ? f.f.slice(0, f.f.lastIndexOf('/')) : '')}</em></span>`
        + (f.add == null ? '<span class="gg-fb">bin</span>' : `<span class="gg-fc"><b class="a">+${f.add}</b><b class="d">−${f.del}</b></span><span class="gg-bar" style="width:${w}px"><i style="flex:${f.add || 0}"></i><u style="flex:${f.del || 0}"></u></span>`) + '</div>'; }).join('')}${fs.length > 80 ? `<div class="gg-mut">+${fs.length - 80} more files</div>` : ''}</div>`;
  }
  async function inspect(c) {
    const b = model.info[c.b];
    showInsp(`<div class="gg-ih"><span class="gg-dot" style="--bc:${b?.color || MAIN_C}"></span><b>${e(c.s)}</b></div><div class="gg-mut">loading…</div>`);
    setFocus(selFocus());
    let d; try { d = await (await fetch(`/api/gitgraph/commit?g=${encodeURIComponent(g)}&h=${c.h}&repo=${encodeURIComponent(curRepo())}`)).json(); } catch { d = { error: 'could not load' }; }
    if (sel !== c.h) return;
    if (d.error) return showInsp(`<div class="gg-mut">${e(d.error)}</div>`);
    const body = d.body.split('\n').slice(1).join('\n').replace(/^\s*Co-Authored-By:.*$/gim, '').trim();
    const add = d.files.reduce((s, f) => s + (f.add || 0), 0), del = d.files.reduce((s, f) => s + (f.del || 0), 0);
    showInsp(`<div class="gg-ih"><span class="gg-dot" style="--bc:${b?.color || MAIN_C}"></span><b>${e(d.body.split('\n')[0])}</b></div>`
      + (body ? `<div class="gg-ib">${e(body)}</div>` : '')
      + `<div class="gg-im">${d.ag ? chip({ ...d.ag, made: true }) : `<span class="gg-au">${e(d.an)}</span>`}<span>${new Date(d.t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>`
      + `<button class="gg-sha" type="button" title="Copy the full hash">${d.h.slice(0, 10)}</button>${d.p.length > 1 ? '<span class="gg-mtag">merge</span>' : ''}</div>`
      + `<div class="gg-ist">${d.files.length} file${d.files.length === 1 ? '' : 's'} · <b class="a">+${add}</b> <b class="d">−${del}</b></div>` + filesHtml(d.files));
    insp.querySelector('.gg-sha').onclick = ev => { navigator.clipboard?.writeText(d.h); ev.target.textContent = 'copied'; setTimeout(() => { ev.target.textContent = d.h.slice(0, 10); }, 1200); };
  }
  function inspectWip(c) {
    sel = c.h; const t = c.tree, b = model.info[c.b];
    const ST = { M: 'changed', A: 'added', D: 'deleted', R: 'renamed', '??': 'new', '?': 'new', U: 'conflict' };
    showInsp(`<div class="gg-ih"><span class="gg-dot wip" style="--bc:${b?.color || MAIN_C}"></span><b>${t.changed} uncommitted on ${e(t.branch || 'detached')}</b></div>`
      + `<div class="gg-im">${(t.agents || []).map(chip).join('') || '<span class="gg-mut">no agent in this folder</span>'}<span class="gg-mut" title="${e(t.path)}">${e(t.path.split(/[\\/]/).pop())}</span></div>`
      + `<div class="gg-fs">${t.files.map(f => `<div class="gg-f"><span class="gg-fn" title="${e(f.f)}">${e(f.f.split('/').pop())}<em>${e(f.f.includes('/') ? f.f.slice(0, f.f.lastIndexOf('/')) : '')}</em></span><span class="gg-st s-${e(f.st[0] === '?' ? 'n' : f.st[0])}">${ST[f.st] || ST[f.st[0]] || e(f.st)}</span></div>`).join('')}`
      + `${t.changed > t.files.length ? `<div class="gg-mut">+${t.changed - t.files.length} more</div>` : ''}</div>`);
    setFocus({ b: c.b });
  }

  // ---------- data ----------
  function header(d) {
    // a page folder holding several repos (gitgraph.mjs repos()): the name is a switch, the choice is kept per page
    if (d.repos?.length > 1) { $('.gg-repo').innerHTML = `<button class="gg-rsel" type="button" aria-haspopup="menu" title="Switch repository">${e(d.repo)}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg></button>`;
      rmenu.innerHTML = d.repos.map(n => `<button type="button" role="menuitem" data-repo="${e(n)}"${n === d.repo ? ' class="on"' : ''}>${e(n)}</button>`).join(''); }
    else { $('.gg-repo').textContent = d.repo || 'Git'; rmenu.hidden = true; }
    const lb = d.branches.filter(b => !b.remote).length, ch = d.trees.reduce((s, t) => s + (t.changed || 0), 0), wt = d.trees.length;
    const head = d.trees[0]?.branch || 'detached', hb = d.branches.find(b => !b.remote && b.name === head);
    $('.gg-sub').innerHTML = `on <b>${e(head)}</b>${hb?.ahead ? ` · <span class="gg-up">${hb.ahead} to push</span>` : ''}${hb?.behind ? ` · <span class="gg-up">${hb.behind} to pull</span>` : ''} · ${lb} branch${lb === 1 ? '' : 'es'}${wt > 1 ? ` · ${wt} worktrees` : ''}${ch ? ` · <span class="gg-wc">${ch} uncommitted</span>` : ''}`;
  }
  async function load(anim) {
    const want = g; let d;
    try { const r = await fetch('/api/gitgraph?g=' + encodeURIComponent(want) + '&repo=' + encodeURIComponent(curRepo()), { cache: 'no-store' }); d = await r.json(); } catch { return; }
    if (!open || want !== g) return;
    if (d.error || !d.repo) { rowsEl.innerHTML = `<div class="gg-empty">${e(d.error || 'This folder is not a git repository.')}</div>`; svg.innerHTML = ''; $('.gg-repo').textContent = 'Git'; $('.gg-sub').textContent = ''; rmenu.hidden = true; return; }
    const s = JSON.stringify(d); if (s === last && !anim) return lightAgents(); last = s;
    data = d; model = build(d); model.data = d; popR = -1; header(d);
    const top = sc.scrollTop; draw(anim); if (!anim) sc.scrollTop = top;
    if (sel && !model.rows.some(c => c.h === sel)) closeInsp();
  }
  function poll() { clearTimeout(pollT); if (!open) return; pollT = setTimeout(() => { if (document.hidden) return poll(); load(false).finally(poll); }, 4000); }

  // ---------- the left column makes room (CSS in gitgraph.css, body.ggopen) ----------
  // Page chat card tints blue, the line under it slides out left, the folded cards slide up into a tight stack under it (each keeps a
  // hoverable slice; --gat), the money counter and the other rows slide off the bottom and the Git row drops into the counter's place
  // (--gg-gy). The dock then grows up out of the Git row and fills what is left in the middle.
  const TIGHT = 28, OSLICE = 36; // slice each card shows (name line whole); the page chat's a bit more (its name sits lower)
  let stack = { cs: [] };
  function stage(pg) {
    const z = document.getElementById('dzone-' + pg.g); if (!z) return null;
    const pile = document.getElementById('deck-' + pg.g), slot = z.querySelector(':scope > .dkres'), row = slot?.querySelector('.sp-ics'); // the icon row (settingspanel.js) holding the Git button
    const cs = pile ? [...pile.querySelectorAll('.dcard:not(.dgone)')].sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0)) : [];
    const ch = pile?._ch || 96, pr = pile?.getBoundingClientRect(), oc = z.querySelector('.odeck .dcard.ocard')?.getBoundingClientRect();
    // one stack: the page chat card is its bottom card (vertically the top one, everything else lies on it), each card above shows a TIGHT slice
    const TOP = pr && oc?.height ? Math.round(oc.top + OSLICE - pr.top) : 2, at = i => TOP + i * TIGHT;
    cs.forEach((c, i) => c.style.setProperty('--gat', at(i) + 'px'));
    if (pr) stack = { cs, x0: pr.left, x1: pr.left + (pile._cw || 214), y0: pr.top + TOP, ch };
    const stackBot = pr ? (cs.length ? pr.top + TOP + (cs.length - 1) * TIGHT + ch : oc?.height ? oc.bottom : pr.top) : null; // no folded cards: right under the page chat
    let rowTop = null;
    if (slot && row) { const sr = slot.getBoundingClientRect(), rr = row.getBoundingClientRect(), tf = getComputedStyle(row).transform, nat = rr.top - (tf && tf !== 'none' ? new DOMMatrix(tf).m42 : 0); // where the row sits untransformed
      const gy = Math.max(0, Math.round(sr.bottom - 2 - rr.height - nat)); slot.style.setProperty('--gg-gy', gy + 'px'); rowTop = nat + gy; }
    return { z, stackBot, rowTop };
  }
  function unstage() {
    stack = { cs: [] }; setUp(null);
    for (const c of document.querySelectorAll('.dkpile .dcard')) c.style.removeProperty('--gat');
    for (const s of document.querySelectorAll('.dkres')) s.style.removeProperty('--gg-gy');
  }
  function place() {
    const pg = curPg(); if (!pg) return;
    const phone = matchMedia('(max-width: 900px)').matches, st = !phone && stage(pg), z = st?.z;
    if (phone || !z) { Object.assign(dock.style, { left: '8px', top: '56px', width: (innerWidth - 16) + 'px', height: (innerHeight - 64) + 'px' }); return; }
    const panes = document.getElementById('panes-' + pg.g), zr = z.getBoundingClientRect(), pr = panes?.getBoundingClientRect();
    if (!zr.width) return;
    // left edge: out to the page's frame (the column's own inset is wasted room while the dock is open)
    const frame = z.closest('.agpage')?.parentElement?.getBoundingClientRect(), left = frame?.width ? Math.min(zr.left - 12, frame.left + 20) : zr.left - 12, right = zr.right + 3; // stops ~7px short of the column's groove (the table edge, zr.right + 9..12), the same gap the left side keeps to the frame
    const top = (st.stackBot != null ? st.stackBot + 12 : zr.top), bot = st.rowTop != null ? st.rowTop - 8 : zr.bottom;
    Object.assign(dock.style, { left: Math.round(left) + 'px', top: Math.round(top) + 'px', width: Math.round(right - left) + 'px', height: Math.max(120, Math.round(bot - top)) + 'px' });
  }

  // ---------- open / close ----------
  function show(on) {
    const pg = curPg();
    if (on && (!pg || pg.g === 'home')) on = false;
    if (on === open && (!on || pg.g === g)) return;
    clearTimeout(closeT);
    if (on) {
      const switching = open; open = true; g = pg.g; last = ''; focus = null; if (switching) closeInsp();
      clearTimeout(openT); document.body.classList.add('ggopen'); place(); dock.setAttribute('aria-hidden', 'false');
      if (switching) dock.classList.add('open'); else openT = setTimeout(() => open && dock.classList.add('open'), reduce() ? 0 : 300); // the column rearranges first, then the dock grows
      rmenu.hidden = true;
      if (!switching) { rowsEl.innerHTML = ''; svg.innerHTML = ''; $('.gg-repo').textContent = 'Git'; $('.gg-sub').textContent = 'loading…'; sc.scrollTop = 0; }
      load(!switching); poll();
      clearInterval(placeT); placeT = setInterval(() => { if (curPg()?.g !== g) return curPg() && curPg().g !== 'home' ? show(true) : show(false); place(); }, 800);
      clearInterval(hotT); hotT = setInterval(() => open && model && lightAgents(), 1500);
    } else {
      open = false; clearTimeout(pollT); clearInterval(placeT); clearInterval(hotT); focus = null; popHide();
      clearTimeout(openT); dock.classList.remove('open'); dock.setAttribute('aria-hidden', 'true'); clearAgents();
      closeT = setTimeout(() => { if (open) return; closeInsp(); document.body.classList.remove('ggopen'); setTimeout(() => open || unstage(), 600); }, reduce() ? 0 : 220); // dock folds away, then the column comes back
    }
    window.FmGit.onChange?.(open);
  }
  $('.gg-x').onclick = () => show(false);
  $('.gg-repo').addEventListener('click', ev => { if (ev.target.closest('.gg-rsel')) rmenu.hidden = !rmenu.hidden; });
  rmenu.addEventListener('click', ev => { const b = ev.target.closest('[data-repo]'); if (!b) return; rmenu.hidden = true;
    if (b.dataset.repo === data?.repo) return; localStorage.setItem('ggRepo:' + g, b.dataset.repo); closeInsp(); focus = null; last = ''; rowsEl.innerHTML = ''; svg.innerHTML = ''; $('.gg-sub').textContent = 'loading…'; sc.scrollTop = 0; load(true); });
  document.addEventListener('pointerdown', ev => { if (!rmenu.hidden && !ev.target.closest('.gg-rmenu, .gg-rsel')) rmenu.hidden = true; }, true);
  document.addEventListener('keydown', ev => { if (ev.key !== 'Escape' || !open) return; ev.stopPropagation(); if (!insp.hidden && insp.classList.contains('on')) closeInsp(); else show(false); }, true);
  addEventListener('resize', () => { if (open) { place(); if (model) draw(false); } });
  window.FmGit = { toggle: () => show(!open), show, get open() { return open; }, onChange: null };
})();
