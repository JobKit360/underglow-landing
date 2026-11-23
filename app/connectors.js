// Settings page → Connectors section (settings.js mounts it): outside services the agents work with that are not AI providers (server: connectors.mjs).
// GitHub: the GitHub CLI's own sign-in (device code). Foreman shows the code big, copies it and opens github.com/login/device; gh finishes
// on its own once GitHub confirms, and the token stays in Windows' credential store (Foreman never sees it). Several accounts: one is active
// (what git push and gh use), switch with Use. Polls every 2 s while a sign-in is waiting.
(() => {
  { const s = document.createElement('script'); s.src = 'youtube.js?v=1'; s.onload = () => draw(); document.head.appendChild(s); } // YouTube card
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'connectors.css?v=4'; document.head.appendChild(css);
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let keep = {}, helpFor = null, el = null, sel = null, shown = false, st = null, busy = false, msg = '', err = false, poll = null, copied = false;
  const api = (action, extra, svc = 'github') => fetch('/api/connectors/' + svc, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify({ action, ...extra }) })
    .then(async r => { const j = await r.json().catch(() => ({})); if (j.github) st = j; if (!r.ok) throw new Error(j.error || 'Something went wrong.'); return j; });
  const load = () => fetch('/api/connectors', { cache: 'no-store' }).then(r => r.json()).then(j => { st = j; draw(); }).catch(() => { msg = "Couldn't reach the server."; err = true; draw(); });
  async function act(action, extra, okMsg, svc) {
    busy = true; msg = svc === 'onepassword' && extra?.mode === 'desktop' ? 'Approve Foreman in the 1Password app (it may be behind this window)…' : ''; err = false; draw();
    try { await api(action, extra, svc); msg = okMsg || ''; helpFor = null; if (action === 'connect' && extra?.provider) delete keep[extra.provider]; } catch (x) { msg = x.message; err = true; if (action === 'connect') { helpFor = extra.provider; keep[extra.provider] = extra.email; } }
    busy = false; draw(); watch();
  }
  const GH_LOGO = '<img class="cn-logo" src="logos/connectors/github.svg" alt="" width="22" height="22">';
  // The device-code card: GitHub's code as big letter tiles, Copy + Open buttons, a live "waiting" line
  function deviceCard(l) {
    if (l.state === 'failed') return `<div class="cn-note bad">${e(l.error || 'Sign-in did not finish.')}</div>`;
    if (l.state === 'done') return '';
    const code = l.code || '';
    return `<div class="cn-dev">
      <div class="cn-step"><span class="cn-n">1</span>Copy this one-time code</div>
      <div class="cn-code" aria-label="One-time code ${e(code)}">${code ? [...code].map(c => c === '-' ? '<i class="cn-dash"></i>' : `<span>${e(c)}</span>`).join('') : '<em>Getting a code from GitHub…</em>'}</div>
      <div class="cn-step"><span class="cn-n">2</span>Enter it on GitHub and approve</div>
      <div class="cn-acts"><button class="cn-btn" id="cnCopy" ${code ? '' : 'disabled'}>${copied ? 'Copied ✓' : 'Copy code'}</button><a class="cn-btn pri" id="cnOpen" href="${e(l.url)}" target="_blank" rel="noopener">Open github.com/login/device ↗</a></div>
      <div class="cn-wait"><span class="cn-spin"></span>Waiting for GitHub… this finishes by itself. <button class="cn-lnk" id="cnCancel">Cancel</button></div>
    </div>`;
  }
  function github(g) {
    if (!g.installed) return `<div class="cn-card">${head(false)}<div class="cn-body"><p>The GitHub CLI isn't installed on this computer. Install it from <a class="cn-link" href="https://cli.github.com" target="_blank" rel="noopener">cli.github.com</a>, then check again.</p></div></div>`;
    const acc = g.accounts || [], on = acc.some(a => a.active && a.ok), l = g.login, waiting = l && (l.state === 'waiting' || l.state === 'starting');
    const rows = acc.map(a => `<div class="cn-acc${a.active ? ' on' : ''}">
        <span class="cn-av">${e(a.login[0].toUpperCase())}<img src="https://github.com/${encodeURIComponent(a.login)}.png?size=64" alt="" width="30" height="30" loading="lazy" onerror="this.remove()"></span>
        <div class="cn-who"><b>${e(a.login)}</b><span>${a.ok ? (a.active ? 'Used by git push and gh' : 'Signed in') : '<span class="cn-warn">Needs signing in again</span>'}</span></div>
        <div class="cn-accts">${!a.ok ? '<button class="cn-btn" data-again>Sign in again</button>' : a.active ? '<span class="cn-use">Active</span>' : `<button class="cn-btn" data-use="${e(a.login)}">Use</button>`}
          <button class="cn-ghost" data-out="${e(a.login)}">Sign out</button></div></div>`).join('');
    return `<div class="cn-card${on ? ' on' : ''}">${head(on)}
      <div class="cn-body"><p class="cn-dim">Lets agents push branches, open pull requests and read issues as you. Signs in with GitHub's own CLI; the token stays in Windows' credential store.</p>
        <div class="cn-list">${rows}${waiting ? '' : `<button class="cn-add" id="cnAdd"><span>+</span>${acc.length ? 'Add another GitHub account' : 'Sign in with GitHub'}</button>`}</div>
        ${l ? deviceCard(l) : ''}
        ${acc.length ? `<div class="cn-git">${g.gitUsesGh ? '<span class="cn-ok">✓</span> git on this computer signs in to GitHub with the active account' : '<span class="cn-warn">git doesn\'t use these accounts yet</span> <button class="cn-btn" id="cnGit">Use for git</button>'}</div>` : ''}
      </div></div>`;
  }
  const head = on => `<div class="cn-hd">${GH_LOGO}<b>GitHub</b><span class="cn-dim">Repos, pull requests, issues</span><span class="cn-tag"><span class="cn-dot ${on ? 'ok' : ''}"></span>${on ? 'Connected' : 'Not connected'}</span><button class="cn-ghost" id="cnRef" title="Check again" aria-label="Check again">↻</button></div>`;
  // One card per mail provider (own logo, address + password only) and one for a calendar link. Providers with two-factor want an app password in
  // the same password field: after a refused sign-in the card says so and links to where that password is made.
  const MAILLOGO = { gmail: 'gmail', zoho: 'zoho', outlook: 'microsoftoutlook', yahoo: 'yahoo', icloud: 'icloud', aol: 'aol', migadu: 'migadu' };
  const inp = 'style="width:100%;box-sizing:border-box;margin:4px 0 10px;padding:7px 9px;border-radius:8px;border:1px solid var(--block-stroke);background:var(--surface-2);color:var(--text-primary);font:inherit"';
  function mailCard(id) {
    const p0 = st?.google?.providers?.find(x => x.id === id); if (!p0) return ''; const p = { ...p0, help: helpFor === id ? p0.appHelp : '' };
    const on = !!p.email, logo = `<img class="cn-logo" src="logos/connectors/${MAILLOGO[id]}.svg" alt="" width="22" height="22">`;
    if (p.multi) return `<div class="cn-card${on ? ' on' : ''}"><div class="cn-hd">${logo}<b>${e(p.name)}</b><span class="cn-dim">Mailboxes for bots</span><span class="cn-tag"><span class="cn-dot ${on ? 'ok' : ''}"></span>${on ? 'Connected' : 'Not connected'}</span></div><div class="cn-body">
      <p class="cn-dim">Add each mailbox with its full address and its own password. Passwords are stored encrypted on this computer and never shown to bots. A bot can only use the mailboxes you tick in its Profile.</p>
      ${on ? `<div class="cn-list">${p.mailboxes.map(m => `<div class="cn-acc on"><div class="cn-who"><b>${e(m.email)}</b><span>Read and send</span><input data-mbxname="${e(m.id)}" placeholder="Sender name (optional)" value="${e(m.name || '')}" title="Shown as the From name; press Enter to save" ${inp}></div><div class="cn-accts"><button class="cn-ghost" data-mbx="${e(m.id)}" data-mbxn="${e(m.email)}">Remove</button></div></div>`).join('')}</div><p><b>Add another mailbox</b></p>` : ''}
      <label class="cn-dim">Email address<input id="gEm" type="email" autocomplete="off" value="${e(keep[id] || '')}" ${inp}></label>
      <label class="cn-dim">Mailbox password<input id="gPw" type="password" autocomplete="new-password" ${inp}></label>
      ${p.help ? `<div class="cn-note bad">${e(p.help)} <a class="cn-link" href="${e(p.appUrl)}" target="_blank" rel="noopener">Open Migadu admin ↗</a></div>` : ''}
      <div class="cn-acts"><button class="cn-btn pri" id="gSave">Add mailbox</button></div></div></div>`;
    return `<div class="cn-card${on ? ' on' : ''}"><div class="cn-hd">${logo}<b>${e(p.name)}</b><span class="cn-dim">Mail for bots</span><span class="cn-tag"><span class="cn-dot ${on ? 'ok' : ''}"></span>${on ? 'Connected' : 'Not connected'}</span></div><div class="cn-body">
      <p class="cn-dim">Lets bots search and read this mailbox and send you a daily brief. Your password is stored encrypted on this computer and never shown to the bots.</p>
      ${on ? `<div class="cn-list"><div class="cn-acc on"><div class="cn-who"><b>${e(p.email)}</b><span>Read and send</span></div><div class="cn-accts"><button class="cn-ghost" id="gDis">Disconnect</button></div></div></div><p><b>Sign in again</b></p>` : ''}
      <label class="cn-dim">Email address<input id="gEm" type="email" autocomplete="username" value="${e(p.email || keep[id] || '')}" ${inp}></label>
      <label class="cn-dim">Password<input id="gPw" type="password" autocomplete="current-password" ${inp}></label>
      ${p.help ? `<div class="cn-note bad">${e(p.help)} <a class="cn-link" href="${e(p.appUrl)}" target="_blank" rel="noopener">Open the app password page ↗</a></div>` : ''}
      <div class="cn-acts"><button class="cn-btn pri" id="gSave">${on ? 'Save' : 'Sign in'}</button></div></div></div>`;
  }
  function calCard() {
    const on = !!st?.google?.calendar;
    return `<div class="cn-card${on ? ' on' : ''}"><div class="cn-hd"><svg class="cn-logo" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><b>Calendar</b><span class="cn-dim">Read-only, for bots</span><span class="cn-tag"><span class="cn-dot ${on ? 'ok' : ''}"></span>${on ? 'Connected' : 'Not connected'}</span></div><div class="cn-body">
      <p class="cn-dim">Paste your calendar's private iCal link (Google Calendar: Settings → your calendar → "Secret address in iCal format". Zoho Calendar: calendar menu → Share → Private link). Calendars have no password sign-in, only this link.</p>
      ${on ? '<div class="cn-list"><div class="cn-acc on"><div class="cn-who"><b>Calendar linked</b><span>Bots can read upcoming events</span></div><div class="cn-accts"><button class="cn-ghost" id="gCalOff">Remove</button></div></div></div>' : ''}
      <label class="cn-dim">iCal link<input id="gCal" type="password" autocomplete="off" placeholder="https://… .ics" ${inp}></label>
      <div class="cn-acts"><button class="cn-btn pri" id="gCalSave">${on ? 'Replace' : 'Connect'}</button></div></div></div>`;
  }
  // 1Password (server: onepassword.mjs): the customer's own 1Password, approved in their 1Password app or with a service account token.
  // Here the user switches whole vaults off and/or picks exactly which items Foreman may use; bots then get vaults ticked in their Profile
  // (only switched-on ones) and never see the values.
  let opMode = 'desktop', opOpen = null, opQ = '', opItems = {}, opLoad = null;
  async function opAccess(vault, patch) {
    try { const j = await api('access', { vault, ...patch }, 'onepassword'); st = j; msg = ''; err = false; }
    catch (x) { msg = x.message; err = true; }
    draw();
  }
  async function opFetch(vid, fresh) {
    opLoad = vid; draw();
    try { const j = await api('items', { vault: vid, fresh: !!fresh }, 'onepassword'); st = j; opItems[vid] = j.vaultItems?.items || []; }
    catch (x) { msg = x.message; err = true; }
    opLoad = null; draw();
  }
  const CAT = { Login: 'Login', Password: 'Password', ApiCredentials: 'API key', SecureNote: 'Note', CreditCard: 'Card', Server: 'Server', Database: 'Database', SshKey: 'SSH key', Identity: 'Identity', Email: 'Email account', Router: 'Wi-Fi' };
  function opVaultRow(v) {
    const open = opOpen === v.id, its = opItems[v.id], n = v.items;
    const what = !v.on ? '<span class="cn-warn">Blocked: no bot can use it</span>' : v.picked == null ? `All ${n == null ? '' : n + ' '}item${n === 1 ? '' : 's'} · new items included` : `${v.picked}${n == null ? '' : ' of ' + n} item${(n ?? v.picked) === 1 ? '' : 's'} · new items stay blocked`;
    let body = '';
    if (open && v.on) {
      if (opLoad === v.id && !its) body = '<p class="cn-dim op-pad">Loading items…</p>';
      else if (its) {
        const ok = its.filter(i => i.ok).length;
        body = `<div class="op-items">
          <div class="op-tools"><input id="opQ" type="search" placeholder="Filter items" value="${e(opQ)}" autocomplete="off"><button class="cn-btn" data-opall="${e(v.id)}">All</button><button class="cn-btn" data-opnone="${e(v.id)}">None</button><button class="cn-ghost" data-opfresh="${e(v.id)}" title="Reload items">↻</button></div>
          <div class="op-count cn-dim">${ok} of ${its.length} allowed${ok === its.length ? ' · items added to this vault later are allowed too' : ' · items added later stay blocked until you tick them'}</div>
          <div class="op-list">${its.map(i => `<label class="op-it${i.ok ? '' : ' off'}" data-q="${e((i.title + ' ' + i.site).toLowerCase())}"><input type="checkbox" data-opi="${e(i.id)}" data-vault="${e(v.id)}" ${i.ok ? 'checked' : ''}><span class="op-t">${e(i.title)}</span><span class="op-m">${e(CAT[i.category] || i.category || '')}${i.site ? ' · ' + e(i.site.replace(/^https?:\/\//, '').replace(/\/$/, '')) : ''}</span></label>`).join('') || '<p class="cn-dim op-pad">This vault is empty.</p>'}</div></div>`;
      }
    }
    return `<div class="op-v${v.on ? ' on' : ''}${open ? ' open' : ''}"><div class="cn-acc">
      <label class="op-sw" title="${v.on ? 'Block this vault' : 'Allow this vault'}"><input type="checkbox" data-opv="${e(v.id)}" ${v.on ? 'checked' : ''}><i></i></label>
      <div class="cn-who"><b>${e(v.title)}</b><span>${what}</span></div>
      ${v.on ? `<div class="cn-accts"><button class="cn-btn" data-opx="${e(v.id)}">${open ? 'Done' : 'Choose items'}</button></div>` : ''}</div>${body}</div>`;
  }
  function opCard() {
    const o = st?.onepassword; if (!o) return '';
    const logo = '<img class="cn-logo" src="logos/connectors/1password.svg" alt="" width="22" height="22">';
    const hd = `<div class="cn-hd">${logo}<b>1Password</b><span class="cn-dim">Logins and keys for bots</span><span class="cn-tag"><span class="cn-dot ${o.connected ? 'ok' : ''}"></span>${o.connected ? 'Connected' : 'Not connected'}</span></div>`;
    if (o.connected) return `<div class="cn-card on">${hd}<div class="cn-body">
      <p class="cn-dim">Bots can sign in to sites and use API keys from these vaults without ever seeing the values. Switch a vault off to block it, or use Choose items to allow only the logins you tick. Then pick which of the allowed vaults each bot may use in its Profile.</p>
      <div class="cn-list"><div class="cn-acc on"><div class="cn-who"><b>${e(o.mode === 'desktop' ? o.account : 'Service account')}</b><span>${o.mode === 'desktop' ? 'Through the 1Password app (it must be unlocked when a bot uses it)' : 'Service account token, works unattended'}</span></div><div class="cn-accts"><button class="cn-btn" id="opRef">Refresh</button><button class="cn-ghost" id="opDis">Disconnect</button></div></div>
      ${(o.vaults || []).map(opVaultRow).join('') || '<p class="cn-dim">No vaults visible. Give the service account access to a vault, then Refresh.</p>'}</div>
      ${o.error ? `<div class="cn-note bad">${e(o.error)}</div>` : ''}</div></div>`;
    const tab = (m, t) => `<button class="cn-btn${opMode === m ? ' pri' : ''}" data-opm="${m}">${t}</button>`;
    return `<div class="cn-card">${hd}<div class="cn-body">
      <p class="cn-dim">Lets bots sign in to sites (passwords and one-time codes) and use API keys from your 1Password, without ever seeing them. Tip: make a vault just for Foreman and keep in it only what bots should use.</p>
      <div class="cn-acts">${tab('desktop', '1Password app')}${tab('token', 'Service account')}</div>
      ${opMode === 'desktop' ? `<p class="cn-dim">In the 1Password app on this computer, turn on <b>Settings → Developer → Integrate with 1Password SDKs</b>. Then enter your account name (shown at the top of the app's sidebar, or your sign-in email) and approve the prompt 1Password shows. Bots can only use it while the app is unlocked.</p>
      <label class="cn-dim">Account name<input id="opAcc" autocomplete="off" placeholder="e.g. My Family or you@example.com" ${inp}></label>
      <div class="cn-acts"><button class="cn-btn pri" id="opGo">Connect</button></div>`
      : `<p class="cn-dim">For bots that work while you're away. On 1Password.com go to <b>Developer → Service accounts</b>, create one with read access to the vault(s) bots may use, and paste its token here. It is stored encrypted on this computer. <a class="cn-link" href="https://developer.1password.com/docs/service-accounts/get-started/" target="_blank" rel="noopener">How to make one ↗</a></p>
      <label class="cn-dim">Service account token<input id="opTok" type="password" autocomplete="off" placeholder="ops_…" ${inp}></label>
      <div class="cn-acts"><button class="cn-btn pri" id="opGo">Connect</button></div>`}
      </div></div>`;
  }
  // Supabase + Render (server: services.mjs): a pasted key, then agents manage that account through supabase_api / render_api.
  const SVC = {
    youtube: { name: 'YouTube' }, // card: youtube.js
    supabase: { name: 'Supabase', what: 'Databases and sign-in', make: 'Make an access token on Supabase', link: 'https://supabase.com/dashboard/account/tokens', linkText: 'Open Supabase access tokens ↗', ph: 'sbp_…', empty: 'No projects yet.' },
    render: { name: 'Render', what: 'Websites and hosting', make: 'Make an API key on Render', link: 'https://dashboard.render.com/u/settings?add-api-key', linkText: 'Open Render API keys ↗', ph: 'rnd_…', empty: 'No services yet.' },
    stripe: { name: 'Stripe', what: 'Subscriptions and payments (UnderGlow, test mode)', make: 'Make a restricted TEST key on Stripe (Developers → API keys, turn on test mode; allow write on Products, Prices, Customers, Checkout Sessions, Customer portal, Webhook Endpoints, Subscriptions). Live keys are refused', link: 'https://dashboard.stripe.com/test/apikeys', linkText: 'Open Stripe test API keys ↗', ph: 'rk_test_…', empty: 'No products yet.' },
    resend: { name: 'Resend', what: 'Sending email (UnderGlow)', make: 'Make a Full access API key on Resend (a dedicated account for UnderGlow)', link: 'https://resend.com/api-keys', linkText: 'Open Resend API keys ↗', ph: 're_…', empty: 'No domains yet.' },
  };
  function svcCard(id) {
    const s = st?.[id], c = SVC[id]; if (!s) return '';
    const on = s.connected && !s.error;
    const hd = `<div class="cn-hd"><img class="cn-logo" src="logos/connectors/${id}.svg" alt="" width="22" height="22"><b>${c.name}</b><span class="cn-dim">${c.what}</span><span class="cn-tag"><span class="cn-dot ${on ? 'ok' : ''}"></span>${on ? 'Connected' : s.connected ? 'Needs attention' : 'Not connected'}</span></div>`;
    const rules = sel === 'stripe' ? `Test mode only, no real money. Agents can make products, prices and webhooks. They can't delete anything, refund, or move money.` : sel === 'resend' ? `Agents can manage domains, make API keys and send email from this account. They can't delete a domain or an API key.` : `Agents can fully manage this account. They can't delete a whole project, service or database, or start anything paid.`;
    if (s.connected) return `<div class="cn-card${on ? ' on' : ''}">${hd}<div class="cn-body"><p class="cn-dim">${rules}</p>
      ${s.error ? `<div class="cn-note bad">${e(s.error)}</div>` : ''}
      <div class="cn-list"><div class="cn-acc on"><div class="cn-who"><b>${e(s.account || c.name)}</b><span>Connected account</span></div><div class="cn-accts"><button class="cn-btn" id="svRef">Refresh</button><button class="cn-ghost" id="svDis">Disconnect</button></div></div>
      ${s.items.map(i => `<div class="cn-acc"><div class="cn-who"><b>${e(i.name)}</b><span>${e(i.sub)}</span></div></div>`).join('') || `<p class="cn-dim">${c.empty}</p>`}</div></div></div>`;
    return `<div class="cn-card">${hd}<div class="cn-body"><p class="cn-dim">${rules} The key stays encrypted on this computer.</p>
      <div class="cn-dev"><div class="cn-step"><span class="cn-n">1</span>${c.make}, signed in to the account agents should manage</div>
      <div class="cn-acts"><a class="cn-btn" href="${c.link}" target="_blank" rel="noopener">${c.linkText}</a></div>
      <div class="cn-step"><span class="cn-n">2</span>Paste it here</div>
      <form class="cn-acts" id="svForm"><input class="cn-in" id="svTok" type="password" autocomplete="off" spellcheck="false" placeholder="${c.ph}" aria-label="${c.name} key"><button class="cn-btn pri" type="submit">Connect</button></form></div></div></div>`;
  }
  function draw() {
    window.FmSettings?.dots?.();
    if (!el || !shown) return;
    if (!sel) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="cn-box">${!st ? '<p class="cn-dim">Loading…</p>' : sel === 'github' ? github(st.github) : sel === 'cal' ? calCard() : sel === 'onepassword' ? opCard() : sel === 'twitch' ? twitchCard() : sel === 'youtube' ? (window.FmYouTube ? FmYouTube.card(st.youtube || {}, e) : '') : SVC[sel] ? svcCard(sel) : sel && sel.startsWith('mail-') ? mailCard(sel.slice(5)) : ''}
      ${msg ? `<div class="cn-note${err ? ' bad' : ''}">${e(msg)}</div>` : ''}</div>`;
    const $ = id => el.querySelector('#' + id), on = (id, f) => { const b = $(id); if (b) b.onclick = f; };
    if (busy) el.querySelectorAll('button').forEach(b => { b.disabled = true; });
    const gv = id => $(id)?.value || '', mid = sel?.startsWith('mail-') ? sel.slice(5) : null;
    on('gSave', () => act('connect', { provider: mid, email: gv('gEm'), password: gv('gPw') }, 'Signed in.', 'google'));
    on('gDis', () => { if (confirm('Disconnect this mailbox? Bots lose access to it.')) act('disconnect', { provider: mid }, 'Disconnected.', 'google'); });
    el.querySelectorAll('[data-mbx]').forEach(b => b.onclick = () => { if (confirm(`Remove ${b.dataset.mbxn}? Bots lose access to it.`)) act('disconnect', { provider: mid, mailbox: b.dataset.mbx }, 'Mailbox removed.', 'google'); });
    el.querySelectorAll('[data-mbxname]').forEach(i => { const go = () => { if (i.value !== i.defaultValue) act('name', { provider: mid, mailbox: i.dataset.mbxname, name: i.value }, 'Sender name saved.', 'google'); }; i.onkeydown = ev => { if (ev.key === 'Enter') go(); }; i.onchange = go; });
    on('gCalSave', () => act('calendar', { url: gv('gCal') }, 'Calendar connected.', 'google'));
    const tf = $('twForm'); if (tf) tf.onsubmit = ev => { ev.preventDefault(); if (!busy) act('connect', { clientId: gv('twId'), clientSecret: gv('twSec') }, 'Twitch connected.', 'twitch'); };
    on('twAuth', () => { const w = window.open('', '_blank'); api('authorize', { writes: !!$('twW')?.checked }, 'twitch').then(j => { if (w) w.location = j.url; else location.href = j.url; msg = 'Approve on Twitch, then come back and press Refresh.'; err = false; draw(); }).catch(x => { w?.close(); msg = x.message; err = true; draw(); }); });
    const sf = $('svForm'); if (sf) sf.onsubmit = ev => { ev.preventDefault(); if (!busy) act('connect', { token: gv('svTok') }, SVC[sel].name + ' connected.', sel); };
    if (sel === 'youtube') window.FmYouTube?.wire(el, act);
    on('svRef', () => act('refresh', null, 'Refreshed.', sel));
    on('svDis', () => { if (confirm(`Disconnect ${(SVC[sel] || { name: 'Twitch' }).name}? Agents lose access and this computer forgets the key.`)) act('disconnect', null, 'Disconnected.', sel); });
    on('opGo', () => act('connect', opMode === 'desktop' ? { mode: 'desktop', account: gv('opAcc') } : { mode: 'token', token: gv('opTok') }, '1Password connected.', 'onepassword'));
    on('opRef', () => act('refresh', null, 'Vaults refreshed.', 'onepassword'));
    on('opDis', () => { if (confirm('Disconnect 1Password? Bots lose access to every vault.')) act('disconnect', null, 'Disconnected.', 'onepassword'); });
    el.querySelectorAll('[data-opm]').forEach(b => b.onclick = () => { opMode = b.dataset.opm; msg = ''; draw(); });
    // vault switches and the item picker (each change saves at once)
    el.querySelectorAll('[data-opv]').forEach(c => c.onchange = () => { if (!c.checked && opOpen === c.dataset.opv) opOpen = null; opAccess(c.dataset.opv, { on: c.checked }); });
    el.querySelectorAll('[data-opx]').forEach(b => b.onclick = () => { const id = b.dataset.opx; if (opOpen === id) { opOpen = null; draw(); return; } opOpen = id; opQ = ''; if (opItems[id]) draw(); else opFetch(id); });
    el.querySelectorAll('[data-opfresh]').forEach(b => b.onclick = () => { delete opItems[b.dataset.opfresh]; opFetch(b.dataset.opfresh, true); });
    const setItems = (vid, okIds) => { const its = opItems[vid] || []; its.forEach(i => { i.ok = okIds.has(i.id); }); opAccess(vid, { only: okIds.size === its.length ? null : [...okIds] }); };
    el.querySelectorAll('[data-opi]').forEach(c => c.onchange = () => { const vid = c.dataset.vault, ids = new Set((opItems[vid] || []).filter(i => i.ok).map(i => i.id)); c.checked ? ids.add(c.dataset.opi) : ids.delete(c.dataset.opi); setItems(vid, ids); });
    const shownIds = vid => [...el.querySelectorAll(`[data-opi][data-vault="${CSS.escape(vid)}"]`)].filter(c => !c.closest('.op-it').hidden).map(c => c.dataset.opi);
    el.querySelectorAll('[data-opall]').forEach(b => b.onclick = () => { const vid = b.dataset.opall, ids = new Set((opItems[vid] || []).filter(i => i.ok).map(i => i.id)); shownIds(vid).forEach(x => ids.add(x)); setItems(vid, ids); });
    el.querySelectorAll('[data-opnone]').forEach(b => b.onclick = () => { const vid = b.dataset.opnone, ids = new Set((opItems[vid] || []).filter(i => i.ok).map(i => i.id)); shownIds(vid).forEach(x => ids.delete(x)); setItems(vid, ids); });
    const q = $('opQ'); if (q) { const f = () => { opQ = q.value; const t = opQ.toLowerCase().trim(); el.querySelectorAll('.op-it').forEach(r => { r.hidden = !!t && !r.dataset.q.includes(t); }); }; q.oninput = f; f(); if (opQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
    on('gCalOff', () => act('calendar-off', null, 'Calendar removed.', 'google'));
    on('cnAdd', () => { copied = false; act('login'); });
    el.querySelectorAll('[data-again]').forEach(b => b.onclick = () => { copied = false; act('login'); });
    on('cnCancel', () => act('cancel'));
    on('cnRef', () => act('refresh'));
    on('cnGit', () => act('setupgit', null, 'git now signs in with your GitHub account.'));
    on('cnCopy', () => copy());
    const o = $('cnOpen'); if (o) o.addEventListener('click', () => copy()); // copying on Open saves a step: paste on GitHub's page
    el.querySelectorAll('[data-use]').forEach(b => b.onclick = () => act('switch', { user: b.dataset.use }, `git and gh now use ${b.dataset.use}.`));
    el.querySelectorAll('[data-out]').forEach(b => b.onclick = () => { if (confirm(`Sign ${b.dataset.out} out of GitHub on this computer? git and gh stop using it.`)) act('logout', { user: b.dataset.out }, 'Signed out.'); });
  }
  function copy() { const c = st?.github?.login?.code; if (!c) return; navigator.clipboard?.writeText(c).then(() => { copied = true; draw(); }, () => {}); }
  function watch() {
    clearInterval(poll); const l = st?.github?.login;
    if (!shown || !l || (l.state !== 'waiting' && l.state !== 'starting')) return;
    poll = setInterval(async () => {
      if (!shown) return clearInterval(poll);
      await load(); const n = st?.github?.login;
      if (!n || (n.state !== 'waiting' && n.state !== 'starting')) { clearInterval(poll); if (n?.state === 'done') { msg = 'Signed in to GitHub.'; err = false; draw(); } }
    }, 2000);
  }
  function open(id) { sel = id || null; shown = true; msg = ''; err = false; draw(); load().then(watch); }
  function close() { shown = false; clearInterval(poll); }
  window.FmConnectors = { mount: x => { el = x; x.id = 'cnSec'; }, open, close, state: () => st };
})();
