// Home = a dashboard and nothing else (Home redo, 2026-11-20): every work page at a glance, no chat, no bots, nobody to talk to.
// Per page: status, last activity (relative + clock time), agents running, bots (counts), last update, git branch, roadmap counts.
// Data: /api/dashboard (dashboard.mjs: counts and times only), /api/pageinfo (git + roadmap, as the settings panel), the HUD's own agent list for "Needs you".
// A page card opens that page. Bots and agents are opened on their own page, never here. index.html calls homeSync() after every relayout.
// Page logo as the rest of the app shows it (the tab logo, p.logo); a page without one gets a tinted initial. Falls back to the initial if the image fails.
window.homeLogoHtml = (p, esc) => {
  const label = String(p.label || '?').trim(), ch = esc((label.match(/[\p{L}\p{N}]/u) || ['?'])[0]), hue = [...label].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7);
  const mono = `<span class="hlogo hmono" style="--h:${hue}">${ch}</span>`;
  return p.logo ? `<img class="hlogo" src="${esc(p.logo)}" alt="" draggable="false" onerror="this.outerHTML=this.dataset.m" data-m="${esc(mono)}">` : mono;
};
(() => {
  const sec = document.getElementById('s-home'); if (!sec) return;
  const dash = document.createElement('div'); dash.className = 'hdash'; dash.id = 'hdash';
  dash.innerHTML = `<div class="hfull">
      <div class="hhero"><div class="hhi"><div class="hgreet">Home</div><div class="hday"></div></div><div class="hclock" aria-label="Current time"></div></div>
      <div class="hsum"></div>
      <div class="hneed hsec" hidden><div class="hsh">Needs you</div><div class="hlist"></div></div>
      <div class="hsec"><div class="hsh">Pages</div><div class="hpages"></div></div>
    </div>`;
  sec.append(dash);
  const $d = s => dash.querySelector(s);
  const KIND = { working: 'working', stalled: 'attn', attn: 'attn', test: 'test', complete: 'ok', fault: 'fault', idle: 'idle' };
  const dot = a => a.status === 'working' ? `<span class="hdot working">${typeof DSPIN === 'string' ? DSPIN : '<i></i>'}</span>` : `<span class="hdot ${typeof secWait === 'function' && secWait(a) ? 'fault' : KIND[agStatus(a)]}"><i></i></span>`;
  const act = a => { try { return deckAct(a); } catch { return a.task || ''; } };
  const pages = () => livePages().filter(p => p.g !== 'home');
  const logo = p => window.homeLogoHtml(p, esc);
  const short = f => { const s = String(f || ''), m = s.match(/^[a-z]:[\\/]+users[\\/]+[^\\/]+[\\/]+/i); return (m ? s.slice(m[0].length) : s).replace(/\\/g, ' / '); };
  const ago = t => { const s = (Date.now() - t) / 1000; if (!t || !isFinite(s)) return '';
    return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' d ago'; };
  const clock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const when = t => { if (!t) return 'No activity yet'; const d = new Date(t), today = d.toDateString() === new Date().toDateString();
    return `${ago(t)} · ${today ? clock(t) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + clock(t)}`; };
  const NEED = new Set(['attn', 'fault', 'stalled']);
  // open an agent on its page: go there, then put its pane on the desk
  const openAgent = (g, id) => { const p = AG_PAGES.find(x => x.g === g); if (!p) return; if (tab !== p.tab) show(p.tab); requestAnimationFrame(() => { try { deckWatch.byHand(id, true); } catch { deckSet(id, true); } }); };

  // ---- data ----
  let data = new Map(), dashAt = 0;
  const git = new Map(), roadmap = new Map(); let gitAt = 0;
  async function pull() {
    if (tab !== 'home' || document.hidden) return;
    if (Date.now() - dashAt > 4000) { dashAt = Date.now();
      try { const j = await (await fetch('/api/dashboard', { cache: 'no-store' })).json(); data = new Map((j.pages || []).map(p => [p.id, p])); } catch {}
      render(); }
    if (Date.now() - gitAt > 15000) { gitAt = Date.now();
      await Promise.all(pages().map(async p => { try { const j = await (await fetch('/api/pageinfo?g=' + encodeURIComponent(p.g), { cache: 'no-store' })).json(); git.set(p.g, j.git || null); roadmap.set(p.g, j.roadmap || null); } catch {} }));
      render(); }
  }

  // ---- pieces ----
  const WORD = { working: 'Working', attention: 'Needs you', ready: 'Ready', idle: 'Idle' };
  function needRows() {
    return workers().filter(a => a.side !== 'home' && !a.loose && NEED.has(agStatus(a)))
      .map(a => { const p = AG_PAGES.find(x => x.g === groupOf(a)); if (!p) return '';
        const why = a.asking ? String(a.asking).replace(/\s+/g, ' ') : act(a);
        return `<button type="button" class="hrow ${KIND[agStatus(a)]}" data-g="${esc(p.g)}" data-id="${esc(a.id)}" title="Open ${esc(a.name)} on ${esc(p.label)}">${dot(a)}<span class="hrn">${esc(a.name)}</span><span class="hrpg">${logo(p)}${esc(p.label)}</span><span class="hrw">${esc(statusWord(a))}</span><span class="hrt">${esc(why.slice(0, 160))}</span></button>`; }).join('');
  }
  const dur = t => { const s = Math.max(0, Math.floor((Date.now() - t) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's' : Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm'; };
  const actLine = d => { const a = d?.activity; if (!a) return '';
    return `<div class="hact${a.error ? ' err' : ''}${d.status === 'working' ? ' run' : ''}"><span class="hadot"></span><span class="hat"><b>${esc(a.who)}</b>${a.text ? ' · ' + esc(a.text) : ''}</span>${a.since ? `<time class="hatime" data-t="${a.since}">${a.error ? esc(ago(a.since)) : dur(a.since)}</time>` : ''}</div>`; };
  function card(p) {
    const d = data.get(p.g), gi = git.get(p.g), mt = gi?.trees?.[0], rm = roadmap.get(p.g), st = d?.status || 'idle', miss = typeof missingG !== 'undefined' && missingG.has(p.g);
    const stat = (n, l) => `<div class="hst"><b>${n}</b><span>${l}</span></div>`;
    const gitTxt = mt ? `<span class="hgit" title="${esc(gi.repo)}: ${esc(mt.branch)}${mt.changed ? ', ' + mt.changed + ' uncommitted' : ''}"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="5.5" r="1.6"/><path d="M4 5.1v5.8M12 7.1c0 3-8 1.4-8 3.8"/></svg>${esc(mt.branch)}${mt.changed ? ` <em>+${mt.changed}</em>` : ''}</span>` : '';
    const rmTxt = rm && (rm.todo || rm.doing || rm.test) ? `<span class="hrm" title="Roadmap">${[rm.todo && rm.todo + ' to do', rm.doing && rm.doing + ' doing', rm.test && rm.test + ' to test'].filter(Boolean).join(' · ')}</span>` : '';
    return `<div class="hcard st-${st}${miss ? ' missing' : ''}" role="button" tabindex="0" data-tab="${esc(p.tab)}" title="Open ${esc(p.label)}">
      <div class="hct">${logo(p)}<div class="hcn"><b>${esc(p.label)}</b><span>${miss ? (typeof folderWord === 'function' ? folderWord(p.g) : 'Folder missing') : esc(short(p.folder))}</span></div><span class="hstat"><i></i>${st === 'working' && d.agents.running ? d.agents.running + ' agent' + (d.agents.running > 1 ? 's' : '') + ' running' : d?.hasError ? 'Error' : esc(WORD[st])}</span></div>
      <div class="hsts">${stat(d ? `${d.agents.running}<small> / ${d.agents.total}</small>` : '–', 'agents running')}${stat(d ? d.bots.total : '–', d && d.bots.working ? `bots · ${d.bots.working} working` : 'bots')}${stat(d ? d.needsYou : '–', 'need you')}</div>
      ${actLine(d)}
      <div class="hln"><span>Last activity</span><b>${d && d.status === 'working' ? 'Now' : esc(when(d?.lastActivity))}</b></div>
      <div class="hln"><span>Last update</span><b>${d?.lastUpdate ? esc(d.lastUpdate.by) + ' · ' + esc(ago(d.lastUpdate.ts)) : 'None yet'}</b></div>
      ${gitTxt || rmTxt ? `<div class="hcf">${gitTxt}${rmTxt}</div>` : ''}</div>`;
  }
  const set = (el, html) => { if (el && el._h !== html) { el._h = html; el.innerHTML = html; } };
  function tickClock() {
    const c = $d('.hclock'), d = $d('.hday'), n = Date.now(); if (c) { const t = new Date(n).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }); if (c.textContent !== t) c.textContent = t; }
    const day = new Date(n).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); if (d && d.textContent !== day) d.textContent = day;
  }
  function tickTimes() { for (const t of dash.querySelectorAll('.hatime[data-t]')) { const v = t.closest('.hact')?.classList.contains('err') ? ago(+t.dataset.t) : dur(+t.dataset.t); if (t.textContent !== v) t.textContent = v; } }
  function render() {
    tickClock(); if (!dash.isConnected || tab !== 'home') return;
    const ps = pages(), ds = ps.map(p => data.get(p.g)).filter(Boolean);
    const run = ds.reduce((n, d) => n + d.agents.running, 0), need = ds.reduce((n, d) => n + d.needsYou, 0), bots = ds.reduce((n, d) => n + d.bots.total, 0);
    set($d('.hsum'), ps.length ? `<b>${ps.length}</b> page${ps.length > 1 ? 's' : ''} · <b>${run}</b> agent${run === 1 ? '' : 's'} running · ${bots} bot${bots === 1 ? '' : 's'} · ${need ? `<b class="w">${need}</b> need${need > 1 ? '' : 's'} you` : 'nothing needs you'}` : '');
    const nr = needRows(); $d('.hneed').hidden = !nr; set($d('.hneed .hlist'), nr);
    set($d('.hpages'), ps.map(card).join('') || `<div class="hempty">No pages yet. Add one with + in the top bar: a page is a work folder with its own agents and bots.</div>`);
  }
  window.homeSync = () => { dashAt = 0; pull(); render(); };
  dash.addEventListener('click', e => {
    const ag = e.target.closest('[data-id]'); if (ag) { e.stopPropagation(); return openAgent(ag.dataset.g, ag.dataset.id); }
    const pg = e.target.closest('[data-tab]'); if (pg) show(pg.dataset.tab);
  });
  dash.addEventListener('keydown', e => { const c = e.target.closest('.hcard'); if (c && (e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); show(c.dataset.tab); } });
  setInterval(() => { if (tab === 'home' && !document.hidden) { render(); pull(); tickTimes(); } else tickClock(); }, 1000);
  render(); pull();
})();
