// UnderGlow account (server: accounts.mjs). Settings → Accounts → UnderGlow, and in the Windows installer build a full-window sign-in on launch
// (window.UG_ACCOUNT_REQUIRED; add ?login=1 to the address to try that screen anywhere). Passwords go to this computer's server only.
(() => {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'account.css?v=2'; document.head.appendChild(css);
  // A password reset link lands here with one-time tokens in the address; index.html moves them out of it first.
  const h = new URLSearchParams(window.UG_AUTH_HASH || ''); delete window.UG_AUTH_HASH; let rec = h.get('type') === 'recovery' && h.get('access_token') ? { access_token: h.get('access_token'), refresh_token: h.get('refresh_token') } : null;
  // Chromium can put the original address back while the page finishes loading, so check again for a few seconds.
  const clean = () => { if (/(^#|&)(access_token|error_description)=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); };
  addEventListener('hashchange', clean); addEventListener('load', clean); for (const t of [0, 500, 1500, 3000, 6000]) setTimeout(clean, t);
  const linkErr = h.get('error_description') ? 'That reset link has expired. Ask for a new one.' : '';
  const gate = !!window.UG_ACCOUNT_REQUIRED || new URLSearchParams(location.search).has('login') || !!rec || !!linkErr;
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let st = null, mode = rec ? 'newpass' : linkErr ? 'forgot' : 'signin', busy = false, msg = linkErr, bad = !!linkErr, mail = '', panel = null, shown = false, over = null, bill = null, bmsg = '', bbad = false, bbusy = false, poll = null, gpoll = null, lastGate = '', wasBlocked = false;
  const TXT = {
    signin: ['Sign in to UnderGlow', 'Use your UnderGlow account.', 'Sign in'], signup: ['Create your account', 'One account for UnderGlow on all your computers.', 'Sign up'],
    forgot: ['Reset your password', "We'll email you a link to choose a new one.", 'Send link'], newpass: ['Choose a new password', 'At least 10 characters.', 'Save password'],
    confirm: ['Check your email', 'Open the link we sent you to finish creating your account, then sign in here.', 'Resend email'],
  };
  const load = () => fetch('/api/account', { cache: 'no-store' }).then(r => r.json()).then(j => { st = j; render(); }).catch(() => { if (!st) { msg = "Couldn't reach the server."; bad = true; render(); } });
  // Billing (Settings → UnderGlow): plan/status from /api/account/billing; Checkout and the Customer Portal open on Stripe's own pages in the browser.
  const loadBill = fresh => fetch('/api/account/billing' + (fresh ? '?fresh=1' : ''), { cache: 'no-store' }).then(r => r.json()).then(j => { bill = j; render(); }).catch(() => {});
  const day = d => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const money = p => (p.amount / 100).toLocaleString(undefined, { style: 'currency', currency: String(p.currency || 'usd').toUpperCase(), minimumFractionDigits: p.amount % 100 ? 2 : 0 }) + '/' + (p.interval === 'year' ? 'yr' : 'mo');
  const STAT = { none: 'Not subscribed', comped: 'Complimentary', active: 'Active', past_due: 'Payment failed, retrying', canceled: 'Canceled', unpaid: 'Unpaid', incomplete: 'Waiting for payment', incomplete_expired: 'Expired', paused: 'Paused' };
  function billHtml() {
    if (!bill) return '<p class="ug-dim">Loading billing…</p>';
    if (!bill.available) return `<p class="ug-dim">Billing isn't available yet${bill.error ? ': ' + e(bill.error) : ''}.</p>`;
    const on = bill.entitled, pastDue = bill.status === 'past_due', line = [on ? '' : '', on && bill.status === 'comped' ? 'Complimentary access, no charge.' : '', on && bill.periodEnd && bill.status !== 'comped' ? (bill.cancelAtPeriodEnd ? 'Ends ' : 'Renews ') + day(bill.periodEnd) : ''].filter(Boolean).join(' · ');
    const choose = !on && bill.plans.length ? `<div class="ug-plans">${bill.plans.map(p => `<button class="ug-go" data-plan="${e(p.key)}" ${bbusy ? 'disabled' : ''}>${e(p.name)} · ${money(p)}</button>`).join('')}</div>` : !on ? '<p class="ug-dim">No plans are on sale yet.</p>' : '';
    const prompt = !on ? '<p class="ug-dim">Subscribe to use UnderGlow Pro.</p>' : '';
    return `<div class="ug-bill"><div class="ug-brow"><span>Plan</span><b>${e(bill.plan ? bill.plan.replace(/_/g, ' ') : '—')}</b></div><div class="ug-brow"><span>Status</span><b class="ug-st ${on ? 'on' : ''}">${e(STAT[bill.status] || bill.status)}</b></div>${line ? `<p class="ug-dim">${e(line)}</p>` : ''}${prompt}${choose}${bill.hasCustomer ? `<button class="ug-go ug-manage" ${bbusy ? 'disabled' : ''}>${pastDue ? 'Update payment method (Manage billing)' : 'Manage billing'}</button>` : ''}${bmsg ? `<p class="ug-msg${bbad ? ' bad' : ''}">${e(bmsg)}</p>` : ''}<p class="ug-dim ug-test">Test mode: no real charges. Use card 4242 4242 4242 4242.</p></div>`;
  }
  async function billGo(act, body) {
    if (bbusy) return; bbusy = true; bmsg = ''; bbad = false; render(true);
    try {
      const r = await fetch('/api/account/' + act, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify(body || {}) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
      if (!window.open(j.url, '_blank', 'noopener')) { bmsg = 'Your browser blocked the page. Allow pop-ups and try again.'; bbad = true; } else { bmsg = 'Finish in the browser window that opened. This updates here when you are done.'; clearInterval(poll); let n = 0; poll = setInterval(() => { if (++n > 60 || !shown) return clearInterval(poll); loadBill(true); }, 5000); }
    } catch (x) { bmsg = x.message; bbad = true; } finally { bbusy = false; render(true); }
  }
  // Paywall (server.mjs refuses everything for an account without an active/comped plan; this is the matching full-screen gate).
  // blocked = paywall on, signed in, and billing says not entitled (or can't verify yet). Nothing is shown behind it that works anyway: sockets and APIs answer 402.
  const blocked = () => gate && !!st?.paywall && !!st?.signedIn && !(bill && bill.entitled);
  function gateHtml() {
    if (!bill) return '<h2>One moment</h2><p class="ug-dim">Checking your subscription…</p>';
    const out = `<button class="ug-link ug-out" ${busy ? 'disabled' : ''}>Sign out</button>`, who = st?.email ? `<p class="ug-dim">Signed in as ${e(st.email)}</p>` : '', note = bmsg ? `<p class="ug-msg${bbad ? ' bad' : ''}">${e(bmsg)}</p>` : '';
    if (!bill.available) return `<h2>Can't check your subscription</h2><p class="ug-dim">${e(bill.error || 'Check your connection and try again.')}</p><button class="ug-go ug-retry">Try again</button>${who}${out}`;
    const pastDue = bill.status === 'past_due', manage = bill.hasCustomer ? `<button class="ug-go ug-manage" ${bbusy ? 'disabled' : ''}>Manage billing</button>` : '';
    const plans = [...(bill.plans || [])].sort((a, b) => (a.interval === 'month' ? 0 : 1) - (b.interval === 'month' ? 0 : 1));
    const buy = pastDue ? '' : plans.length ? `<div class="ug-plans">${plans.map(p => `<button class="ug-go" data-plan="${e(p.key)}" ${bbusy ? 'disabled' : ''}>${p.interval === 'year' ? 'Yearly' : 'Monthly'} · ${money(p)}</button>`).join('')}</div>` : '<p class="ug-dim">No plans are on sale yet.</p>';
    const why = pastDue ? "Payment failed. We'll retry automatically and UnderGlow unlocks as soon as a payment goes through. Update your card (Manage billing) to restore access now." : bill.status === 'canceled' || bill.status === 'unpaid' ? 'Your subscription ended because the payment attempts failed. Subscribe again to keep using UnderGlow.' : 'UnderGlow needs an active subscription. There is no free plan.';
    return `<h2>Subscribe to use UnderGlow</h2><p class="ug-dim">${why}</p>${buy}${manage}${note}<p class="ug-dim">This screen unlocks by itself once your payment goes through.</p>${who}${out}`;
  }
  // While blocked: re-check every 5 s and whenever the window comes back (e.g. returning from Stripe Checkout). Unblocked → reload so sockets reconnect cleanly.
  const gateTick = () => { if (!gate) return; if (!st?.signedIn) return load(); loadBill(true); };
  addEventListener('focus', () => { if (blocked()) gateTick(); }); document.addEventListener('visibilitychange', () => { if (!document.hidden && blocked()) gateTick(); });
  function form() {
    const [h, sub, go] = TXT[mode], pass = mode !== 'forgot' && mode !== 'confirm', link = (m, t) => `<button type="button" class="ug-link" data-m="${m}">${t}</button>`;
    return `<h2>${h}</h2><p class="ug-dim">${sub}</p><form class="ug-form" novalidate>
      ${mode === 'newpass' ? '' : `<label>Email<input name="email" type="email" autocomplete="email" value="${e(mail)}"></label>`}
      ${pass ? `<label>${mode === 'newpass' ? 'New password' : 'Password'}<input name="password" type="password" autocomplete="${mode === 'signin' ? 'current-password' : 'new-password'}"></label>` : ''}
      <button class="ug-go" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'One moment…' : go}</button></form>
      ${msg ? `<p class="ug-msg${bad ? ' bad' : ''}" role="status">${e(msg)}</p>` : ''}
      <div class="ug-links">${mode === 'newpass' ? '' : mode === 'signin' ? link('signup', 'Create an account') + link('forgot', 'Forgot password?') : link('signin', 'Back to sign in')}</div>`;
  }
  function bind(box) {
    box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mail = box.querySelector('[name=email]')?.value.trim() || mail; mode = b.dataset.m; msg = ''; render(true); });
    const f = box.querySelector('.ug-form'); if (f) f.onsubmit = ev => { ev.preventDefault(); submit(new FormData(f)); };
    const o = box.querySelector('.ug-out'); if (o) o.onclick = () => { bill = null; wasBlocked = false; lastGate = ''; post('signout', {}); };
    const rt = box.querySelector('.ug-retry'); if (rt) rt.onclick = () => { bill = null; render(true); loadBill(true); };
    box.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => billGo('checkout', { plan: b.dataset.plan }));
    const mg = box.querySelector('.ug-manage'); if (mg) mg.onclick = () => billGo('portal');
  }
  async function post(act, body, then) {
    busy = true; msg = ''; bad = false; render();
    try {
      const r = await fetch('/api/account/' + act, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Foreman': '1' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again.'), { code: j.code });
      st = j; then?.(j);
    } catch (x) { msg = x.message; bad = true; if (x.code === 'email_not_confirmed') mode = 'confirm'; } finally { busy = false; render(true); }
  }
  function submit(d) {
    if (busy) return; const v = k => String(d.get(k) || ''); mail = v('email').trim();
    if (mode === 'confirm') return post('resend', { email: mail }, () => { msg = 'If that account still needs confirming, a new link is on its way.'; });
    if (mode === 'forgot') return post('reset', { email: mail }, () => { msg = 'If that email has an account, a reset link is on its way.'; });
    if (mode === 'newpass') return post('recover', { ...rec, password: v('password') }, () => { rec = null; done(); });
    post(mode, { email: mail, password: v('password') }, j => { if (j.confirm) { mode = 'confirm'; msg = 'We sent a confirmation link to ' + mail + '.'; } else done(); });
  }
  function done() { mode = 'signin'; msg = ''; if (gate) claude(); }
  async function claude() { // first sign-in: if no Claude account is connected yet, go straight to that card
    try { const j = await (await fetch('/api/providers', { cache: 'no-store' })).json(); if (!j.providers?.find(p => p.id === 'anthropic')?.connected) window.setOpen?.(true, 'prov:anthropic'); } catch {}
  }
  function render(focus) {
    window.FmSettings?.dots?.();
    const signed = !!st?.signedIn;
    if (gate) {
      if (!over) { over = document.createElement('div'); over.id = 'ugAuth'; over.setAttribute('role', 'dialog'); over.setAttribute('aria-modal', 'true'); over.setAttribute('aria-label', 'Sign in to UnderGlow'); document.body.append(over); }
      const block = blocked() && mode !== 'newpass';
      if (signed && st?.paywall && !bill && !gpoll) loadBill(true); // first look at the plan right after sign-in
      if (block && bill) wasBlocked = true; else if (wasBlocked && signed && bill?.entitled) { wasBlocked = false; location.reload(); return; }
      if (block && !gpoll) gpoll = setInterval(gateTick, 5000); else if (!block && gpoll) { clearInterval(gpoll); gpoll = null; }
      over.hidden = !!st && signed && mode !== 'newpass' && !block;
      if (block) { const html = gateHtml(); if (html !== lastGate || focus) { lastGate = html; over.setAttribute('aria-label', 'Subscribe to use UnderGlow'); over.innerHTML = `<div class="ug-card"><img src="logo.svg" alt="" width="58" height="58">${html}</div>`; bind(over); } }
      else if (!over.hidden && !over.contains(document.activeElement) || focus) { lastGate = ''; over.innerHTML = `<div class="ug-card"><img src="logo.svg" alt="" width="58" height="58">${st || mode === 'newpass' ? form() : '<p class="ug-dim">Checking your account…</p>'}</div>`; bind(over); if (!over.hidden) (over.querySelector('input:not([readonly])'))?.focus(); }
      else if (!over.hidden && st) { const m = over.querySelector('.ug-go'); if (m) m.disabled = busy; }
    }
    if (panel && shown) {
      if (panel.contains(document.activeElement) && !focus && !signed) return;
      panel.innerHTML = `<div class="ug-panel">${!st ? '<p class="ug-dim">Loading…</p>' : signed ? `<p class="ug-dim">Signed in${st.offline ? ' (offline right now)' : ''} as</p><b class="ug-who">${e(st.email)}</b><h2>Billing</h2>${billHtml()}<button class="ug-go ug-out" ${busy ? 'disabled' : ''}>Sign out</button>${msg ? `<p class="ug-msg bad">${e(msg)}</p>` : ''}` : form()}</div>`; bind(panel);
    }
  }
  window.FmAccount = { mount: x => { panel = x; }, open: id => { shown = !!id; if (shown) { msg = ''; render(true); load(); loadBill(true); } }, close: () => { shown = false; }, state: () => st };
  if (gate) render(); load(); setInterval(load, 600000);
  setInterval(() => { if (gate && st?.paywall && st.signedIn && bill?.entitled && !document.hidden) loadBill(true); }, 60000); // paid users: notice a cancellation or failed payment within a minute (the server already refuses requests)
})();
