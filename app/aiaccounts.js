// Settings page → AI accounts section (settings.js mounts it): which AI providers this host's agents can use and how each signs in (server: providers.mjs, /api/providers).
// Anthropic works now: Claude subscription (Claude Code's own sign-in, started on the host) or an Anthropic API key. Codex and Cursor sign in through their own CLIs. Each page also shows whether that CLI is installed (Installed vX / Not found) with copy-paste install steps.
// Sign-in on the host's own screen: Claude Code opens Anthropic's page in this computer's browser and finishes by itself.
// From another device (laptop client, phone): nothing opens on the host; the link opens Anthropic's page on this device and the code it shows is pasted back.
(() => {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'aiaccounts.css?v=6'; document.head.appendChild(css);
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const onHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname); // the HUD runs on the host itself
  let dlg = null, shown = false, sel = null; // dlg: the panel settings.js gives us (id aiDlg for the CSS); sel: the provider tile picked (only its card is drawn)
  let st = null, busy = false, msg = '', err = false, keyOpen = false, poll = null;

  const api = (action, extra) => fetch('/api/providers/' + (extra?._p || sel || 'anthropic'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify({ action, ...extra }) })
    .then(async r => { const j = await r.json().catch(() => ({})); if (j.providers) st = j; if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; });
  const load = () => fetch('/api/providers', { cache: 'no-store' }).then(r => r.json()).then(j => { st = j; draw(); }).catch(() => { msg = "Couldn't reach the server."; err = true; draw(); });
  async function act(action, extra, okMsg) {
    busy = true; msg = ''; err = false; draw();
    try { await api(action, extra); msg = okMsg || ''; } catch (x) { msg = x.message; err = true; }
    busy = false; draw();
  }

  // Provider marks (public/logos/providers/<id>.svg, from Simple Icons; unmodified, official colours or black/white) shown next to the name only, to say which account it is
  const logo = p => `<img class="ai-logo" src="logos/providers/${e(p.id)}.svg" alt="" width="20" height="20" onerror="this.remove()">`;
  const plan = p => p ? String(p).replace(/_/g, ' ').replace(/\b(max|pro)\b/i, m => m[0].toUpperCase() + m.slice(1)).replace(/(\d+)x/, '$1×') : '';
  // Avatar: the account's first letter on a colour from its email (no pictures: Anthropic gives none)
  const hue = t => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
  const avatar = a => `<span class="ai-av" style="--h:${hue(a.email || a.id)}">${e((a.email || '?')[0].toUpperCase())}</span>`;
  function signinBox(l) {
    if (!l) return '';
    if (l.state === 'failed') return `<div class="ai-note bad">${e(l.error || 'Sign-in did not finish.')}</div>`;
    if (l.state !== 'waiting' && l.state !== 'starting') return '';
    return `<div class="ai-step">${onHost ? 'Anthropic\'s sign-in page opened in your browser. Sign in with the account you want, and this updates by itself.' : 'Sign in on Anthropic\'s page, then paste the code it shows.'}
        ${l.url ? `<a class="ai-link" href="${e(l.url)}" target="_blank" rel="noopener">${onHost ? 'Page didn\'t open? Open it here' : 'Open Anthropic\'s sign-in page'}</a>` : '<span class="ai-dim">Starting…</span>'}
        <div class="ai-row"><input id="aiCode" placeholder="Or paste the code from Anthropic" autocomplete="off" spellcheck="false"><button class="ai-btn pri" id="aiCodeGo">Done</button></div>
        <button class="ai-lnk" id="aiCancel">Cancel sign-in</button></div>`;
  }
  function accRow(a, useKey, l) {
    const inUse = a.active && !useKey;
    const sub = a.checking ? 'Checking…' : a.loggedIn ? [plan(a.plan), /'s Organization$/.test(a.org || '') ? '' : a.org].filter(Boolean).map(e).join(' · ') || 'Signed in' : `<span class="ai-warn">Signed out</span>${a.error ? ' · ' + e(a.error) : ''}`;
    const acts = a.loggedIn
      ? (inUse ? '<span class="ai-use">In use</span>' : `<button class="ai-btn" data-use="${e(a.id)}">Use</button>`) + `<button class="ai-ghost" data-out="${e(a.id)}">Sign out</button>`
      : `<button class="ai-btn" data-in="${e(a.id)}">Sign in</button>`;
    return `<div class="ai-acc${inUse ? ' on' : ''}">${avatar(a)}<div class="ai-who"><b>${e(a.email || (a.first ? 'Claude Code account' : 'Claude account'))}</b><span>${sub}${a.first ? ' · <span class="ai-dim">Claude Code\'s own</span>' : ''}</span></div>
      <div class="ai-accts">${acts}${a.first ? '' : `<button class="ai-ghost" data-rm="${e(a.id)}" title="Remove this account from Foreman">Remove</button>`}</div></div>${l && l.account === a.id ? signinBox(l) : ''}`;
  }
  function anthropic(p) {
    const l = p.login, key = p.key, useKey = p.method === 'apikey', accounts = p.accounts || [];
    const keyBox = keyOpen ? `<div class="ai-step">Create a key at <a class="ai-link" href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">platform.claude.com</a>. Usage is billed to that Anthropic account.
        <div class="ai-row"><input id="aiKey" type="password" placeholder="sk-ant-…" autocomplete="off" spellcheck="false"><button class="ai-btn pri" id="aiKeyGo">Save</button></div>
        <button class="ai-lnk" id="aiKeyX">Cancel</button></div>` : '';
    const adding = l && l.account === 'new';
    return `<div class="ai-card${p.connected ? ' on' : ''}">
      <div class="ai-hd">${logo(p)}<b>${e(p.name)}</b><span class="ai-dim">${e(p.product)}</span><span class="ai-tag"><span class="ai-dot ${p.connected ? 'ok' : 'bad'}"></span>${p.connected ? 'Connected' : 'Not connected'}</span><button class="ai-ghost ai-ref" id="aiRef" title="Check again" aria-label="Check again">↻</button></div>
      ${engineStatus(p)}
      <label class="ai-opt"><input type="radio" name="aiM" value="subscription" ${!useKey ? 'checked' : ''}><span><b>Claude subscription</b> <span class="ai-dim">Pro or Max, through Claude Code's own sign-in</span></span></label>
      <div class="ai-sub"><div class="ai-list">${accounts.map(a => accRow(a, useKey, l)).join('')}
        ${adding ? `<div class="ai-acc ai-new">${avatar({ email: '+' })}<div class="ai-who"><b>Adding a Claude account</b><span>Waiting for Anthropic's sign-in…</span></div></div>${signinBox(l)}`
          : `<button class="ai-add" id="aiAdd"><span>+</span>Add another Claude account</button>`}</div>
        ${!adding && l?.account === 'new' && l.state === 'failed' ? signinBox(l) : ''}
        <div class="ai-dim small">Each account keeps its own plan and limits. New agent turns use the one marked In use; turns already running finish on theirs. The first account is Claude Code's own sign-in on this computer, so signing it out signs Claude Code out too.</div></div>
      <label class="ai-opt"><input type="radio" name="aiM" value="apikey" ${useKey ? 'checked' : ''} ${key ? '' : 'disabled'}><span><b>API key</b> <span class="ai-dim">pay per use, from the Anthropic Console</span></span></label>
      <div class="ai-sub">${key ? `<b>Key saved</b> <span class="ai-dim">ends in ${e(key.hint)}</span>` : '<span class="ai-dim">No key saved</span>'}
        <div class="ai-acts"><button class="ai-btn" id="aiKeyAdd">${key ? 'Replace key' : 'Add key'}</button>${key ? '<button class="ai-btn" id="aiKeyDel">Remove</button>' : ''}</div>${keyBox}</div>
    </div>`;
  }
  // Codex and Cursor: the vendor's own CLI signs in (cliproviders.mjs). The vendor's page/code is shown here; Foreman never sees a token.
  function cliLogin(p) {
    const l = p.login; if (!l) return '';
    if (l.state === 'failed') return `<div class="ai-note bad">${e(l.error || 'Sign-in did not finish.')}</div>`;
    if (l.state !== 'waiting' && l.state !== 'starting') return '';
    return `<div class="ai-step">${onHost ? `${e(p.name)}'s sign-in page opened in your browser. Sign in, and this updates by itself.` : `Open ${e(p.name)}'s sign-in page on this device and sign in${l.code ? ', entering the code below' : ''}.`}
      ${l.code ? `<div class="ai-code"><b>${e(l.code)}</b></div>` : ''}
      ${l.url ? `<a class="ai-link" href="${e(l.url)}" target="_blank" rel="noopener">${onHost ? 'Page did not open? Open it here' : `Open ${e(p.name)}'s sign-in page`}</a>` : '<span class="ai-dim">Starting…</span>'}
      <button class="ai-lnk" id="aiCancel">Cancel sign-in</button></div>`;
  }
  // CLI status + install help (server: providers-cli.mjs). Same strip on the Claude, Codex and Cursor pages.
  const copyBtn = c => `<button class="ai-btn" data-copy="${e(c)}">Copy</button>`;
  const cmdRow = c => `<div class="ai-cmd"><code>${e(c)}</code>${copyBtn(c)}</div>`;
  // The Claude page shows the pinned ENGINE (engine.mjs: one fixed Claude Code version downloaded on first run), not whatever `claude` is installed.
  const mbs = n => (n / 1048576).toFixed(n >= 1e8 ? 0 : 1);
  function engineStatus(p) {
    const g = p.engine; if (!g) return '';
    let line, extra = '';
    if (g.status === 'ready') line = `<span class="ai-dot ok"></span><b>Claude engine ready · v${e(g.version)}</b> <span class="ai-dim">${g.source === 'custom' ? '· your own claude' : g.source === 'download' ? '· Downloaded' : g.source === 'reused' ? '· reused from your previous install' : '· bundled'}</span>`;
    else if (g.status === 'downloading') line = `<span class="ai-dot"></span><b>Downloading the Claude engine… ${g.pct}%</b> <span class="ai-dim">${mbs(g.doneBytes)} of ${mbs(g.totalBytes)} MB${g.attempt > 1 ? ` · attempt ${g.attempt}` : ''}</span>`, extra = `<div class="ai-bar"><i style="width:${g.pct}%"></i></div>`;
    else if (g.status === 'verifying') line = '<span class="ai-dot"></span><b>Checking the download…</b>';
    else if (g.status === 'unpacking') line = '<span class="ai-dot"></span><b>Unpacking the Claude engine…</b>';
    else if (g.status === 'waiting') line = `<span class="ai-dot bad"></span><b>Download interrupted, retrying…</b> <span class="ai-dim">${e(g.error || '')}</span>`;
    else if (g.status === 'failed') line = `<span class="ai-dot bad"></span><b>Claude engine download failed</b>`, extra = `<div class="ai-note bad">${e(g.error || '')}</div>`;
    else line = '<span class="ai-dot"></span><b>Preparing the Claude engine…</b>';
    const btn = g.status === 'failed' ? '<button class="ai-btn pri" id="aiEngRetry">Retry</button>' : '';
    const own = `<details class="ai-dim small"><summary>Use my own claude (optional)</summary><div class="ai-row"><input id="aiEngPath" placeholder="C:\\path\\to\\claude.exe" value="${e(g.custom || '')}" spellcheck="false"><button class="ai-btn" id="aiEngSet">Use</button>${g.custom ? '<button class="ai-ghost" id="aiEngClr">Back to the built-in engine</button>' : ''}</div></details>`;
    return `<div class="ai-cli" data-engine="${e(g.status)}"><div class="ai-acc"><div class="ai-who"><span>${line}</span></div><div class="ai-accts">${btn}</div></div>${extra}
      <div class="ai-dim small">Foreman runs a fixed, tested version of Claude Code (v${e(g.version)}) that it downloads once (${mbs(g.totalBytes)} MB) and verifies. It does not depend on a Claude Code you installed yourself. Agents wait here until it is ready.</div>${own}</div>`;
  }
  const engApi = body => fetch('/api/engine', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify(body) }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; });
  function cliStatus(p, { optional } = {}) {
    const c = p.cliCheck || {}, h = c.help; if (!h) return '';
    const ok = c.installed;
    const line = ok ? `<span class="ai-dot ok"></span><b>Installed${c.version ? ' v' + e(c.version) : ''}</b>` : `<span class="ai-dot bad"></span><b>Not found</b>${optional ? ' <span class="ai-dim">(optional)</span>' : ''}`;
    const help = ok ? '' : `<div class="ai-step"><b>Install ${e(h.name)}</b>
        <div class="ai-dim">Open ${e(h.shell)}, paste this, press Enter:</div>${cmdRow(h.cmd)}
        ${h.alt ? `<div class="ai-dim">${e(h.alt.label)}:</div>${cmdRow(h.alt.cmd)}` : ''}
        <div class="ai-dim">Then come back here. <a class="ai-link" href="${e(h.url)}" target="_blank" rel="noopener">Official instructions</a></div></div>`;
    return `<div class="ai-cli" data-cli="${e(p.id)}"><div class="ai-acc"><div class="ai-who"><span>${line}${c.path ? ` <span class="ai-dim" title="${e(c.path)}">· ${e(c.source === 'path' ? 'on PATH' : 'found')}</span>` : ''}</span></div>
      <div class="ai-accts"><button class="ai-btn" id="aiCheck">Check again</button></div></div>${help}</div>`;
  }
  function cliCard(p) {
    const on = p.installed && p.connected; // a CLI that is gone cannot be connected
    const sub = !p.installed ? 'Install it first (step 1).' : on ? [p.email, p.method].filter(Boolean).map(e).join(' · ') || 'Signed in' : '<span class="ai-warn">Signed out</span>' + (p.error ? ' · ' + e(p.error) : '');
    const acts = !p.installed ? '' : on ? '<button class="ai-ghost" id="aiCliOut">Sign out</button>' : '<button class="ai-btn pri" id="aiCliIn">Sign in</button>';
    return `<div class="ai-card${on ? ' on' : ''}">
      <div class="ai-hd">${logo(p)}<b>${e(p.name)}</b><span class="ai-dim">${e(p.product)}</span><span class="ai-tag"><span class="ai-dot ${on ? 'ok' : 'bad'}"></span>${on ? 'Connected' : 'Not connected'}</span><button class="ai-ghost ai-ref" id="aiRef" title="Check again" aria-label="Check again">↻</button></div>
      ${cliStatus(p)}
      ${p.installed ? `<div class="ai-acc"><div class="ai-who"><span><b>Sign in</b> · ${sub}</span></div><div class="ai-accts">${acts}</div></div>` : ''}
      ${cliLogin(p)}
      ${p.id === 'cursor' && p.installed && !p.sandboxAvailable ? `<label class="ai-opt"><input type="checkbox" id="aiUnsb" ${p.unsandboxed ? 'checked' : ''}><span><b>Let Cursor agents edit files and run commands without a sandbox</b> <span class="ai-dim">off = read-only</span></span></label>` : ''}
      ${p.installed ? `<div class="ai-dim small">Sign-in is ${e(p.name)}'s own: Foreman starts the real ${p.id === 'codex' ? 'codex' : 'cursor-agent'} program and shows its sign-in page. It never reads or stores your login. Pick it for an agent from the agent's AI menu (the icon in its header).</div>` : ''}
      <div class="ai-note">${e(p.enforcement)}</div>
    </div>`;
  }
  function draw() {
    window.FmSettings?.dots?.();
    if (!dlg || !shown) return;
    if (!sel) { dlg.innerHTML = ''; return; }
    const ae = document.activeElement, ki = dlg.querySelector('#aiCode, #aiKey'), keep = ki && { id: ki.id, v: ki.value, f: ae === ki, s: ki.selectionStart };
    const ps = st?.providers || [];
    const an = ps.find(p => p.id === 'anthropic');
    dlg.innerHTML = `<div class="ai-box">
      ${!st ? '<p class="ai-dim">Loading…</p>' : sel === 'anthropic' && an ? anthropic(an) : ''}
      ${ps.filter(p => p.cli && p.id === sel).map(cliCard).join('')}
      ${msg ? `<div class="ai-note${err ? ' bad' : ''}">${e(msg)}</div>` : ''}
    </div>`;
    const $ = id => dlg.querySelector('#' + id), on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
    if (keep) { const i = $(keep.id); if (i) { i.value = keep.v; if (keep.f) { i.focus(); try { i.setSelectionRange(keep.s, keep.s); } catch {} } } }
    dlg.querySelectorAll('button').forEach(b => { if (busy) b.disabled = true; });
    const accName = id => st?.providers?.[0]?.accounts?.find(a => a.id === id)?.email || 'this account';
    on('aiAdd', async () => { await act('add', { openHere: onHost }); watch(); });
    dlg.querySelectorAll('[data-in]').forEach(b => b.onclick = async () => { await act('login', { account: b.dataset.in, openHere: onHost }); watch(); });
    dlg.querySelectorAll('[data-use]').forEach(b => b.onclick = () => act('use', { account: b.dataset.use }, `New agent turns now use ${accName(b.dataset.use)}.`));
    dlg.querySelectorAll('[data-out]').forEach(b => b.onclick = () => { const first = st?.providers?.[0]?.accounts?.find(a => a.id === b.dataset.out)?.first;
      if (confirm(`Sign out ${accName(b.dataset.out)}?${first ? ' This is Claude Code\'s own sign-in on this computer, so Claude Code is signed out too.' : ''} Agents using it stop until you sign in again or pick another account.`)) act('logout', { account: b.dataset.out }, 'Signed out.'); });
    dlg.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if (confirm(`Remove ${accName(b.dataset.rm)} from Foreman? It is signed out and its folder deleted; you can add it again later.`)) act('remove', { account: b.dataset.rm }, 'Account removed.'); });
    on('aiCliIn', async () => { await act('login', { openHere: onHost }); watch(); });
    on('aiCliOut', () => { if (confirm('Sign out? Agents on this provider stop until you sign in again.')) act('logout', null, 'Signed out.'); });
    const ub = $('aiUnsb'); if (ub) ub.onchange = () => { if (!ub.checked || confirm('Without a sandbox Foreman cannot keep a Cursor agent inside its folder: it can change any file and run any command your user can. Allow it?')) act('unsandboxed', { value: ub.checked }); else ub.checked = false; };
    on('aiCancel', () => act('cancel'));
    const eng = f => async () => { busy = true; msg = ''; err = false; draw(); try { await f(); } catch (x) { msg = x.message; err = true; } busy = false; await load(); watchEngine(); };
    on('aiEngRetry', eng(() => engApi({ action: 'retry' })));
    on('aiEngSet', eng(() => engApi({ action: 'custom', path: $('aiEngPath').value })));
    on('aiEngClr', eng(() => engApi({ action: 'custom', path: '' })));
    on('aiRef', () => act('refresh'));
    on('aiCheck', () => act('check', null, 'Checked.'));
    dlg.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { const t = b.dataset.copy;
      try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch {} a.remove(); }
      b.textContent = 'Copied'; setTimeout(() => { if (b.isConnected) b.textContent = 'Copy'; }, 1500); });
    on('aiCodeGo', () => act('code', { code: $('aiCode').value }).then(watch));
    const code = $('aiCode'); if (code) code.onkeydown = ev => { if (ev.key === 'Enter') $('aiCodeGo').click(); };
    on('aiKeyAdd', () => { keyOpen = true; msg = ''; draw(); $('aiKey')?.focus(); });
    on('aiKeyX', () => { keyOpen = false; draw(); });
    on('aiKeyGo', async () => { const k = $('aiKey').value; await act('key', { key: k }, 'Key saved. New agent turns use it.'); if (!err) keyOpen = false; draw(); });
    const key = $('aiKey'); if (key) key.onkeydown = ev => { if (ev.key === 'Enter') $('aiKeyGo').click(); };
    on('aiKeyDel', () => { if (confirm('Remove the saved API key? Agents go back to the Claude subscription.')) act('clearkey', null, 'Key removed.'); });
    dlg.querySelectorAll('input[name=aiM]').forEach(r => r.onchange = () => act('method', { method: r.value }, r.value === 'apikey' ? 'Agents now use the API key.' : 'Agents now use the Claude subscription.'));
  }
  // While a sign-in is open, check every 3 s until it finishes (Claude Code saves the login, then status shows Signed in).
  function watch() {
    clearInterval(poll);
    poll = setInterval(async () => {
      if (!shown) return clearInterval(poll);
      await load(); const l = st?.providers?.find(p => p.id === (sel || 'anthropic'))?.login;
      if (!l || l.state === 'done' || l.state === 'failed') { clearInterval(poll); if (l?.state === 'done') { msg = 'Signed in.'; err = false; draw(); } }
    }, 3000);
  }
  // Progress: while the engine is being prepared, refresh the page every second so the percent moves.
  let engPoll = null;
  function watchEngine() {
    clearInterval(engPoll);
    engPoll = setInterval(async () => {
      if (!shown) return clearInterval(engPoll);
      const s = st?.providers?.find(p => p.id === 'anthropic')?.engine?.status;
      if (s === 'ready' || s === 'failed') return clearInterval(engPoll);
      const d = dlg?.querySelector('details[open]'); if (d || busy) return; // do not redraw under someone typing a path
      await load();
    }, 1000);
  }
  function open(id) { sel = id || null; shown = true; msg = ''; err = false; keyOpen = false; draw(); load().then(() => { const l = st?.providers?.find(p => p.id === (sel || 'anthropic'))?.login; if (l && (l.state === 'waiting' || l.state === 'starting')) watch(); watchEngine(); }); }
  function close() { shown = false; clearInterval(poll); }
  window.FmAI = { mount: el => { dlg = el; el.id = 'aiDlg'; }, open, close, state: () => st };
})();
