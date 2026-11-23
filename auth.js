// Account page: sign up, sign in, password reset and sign out, straight against Supabase Auth. The key below is Supabase's public (publishable) key.
(() => {
  const URL_ = 'https://ncqgxouiekxpiqxnmdwo.supabase.co/auth/v1', KEY = 'sb_publishable_LCj5aMTnYa_i92t-gcL7cg_p8viWvyO', STORE = 'ug-session';
  const $ = id => document.getElementById(id);
  const words = { invalid_credentials: 'Wrong email or password.', email_address_invalid: 'Check the email address.', email_not_confirmed: 'Confirm your email first: open the link we sent you.', user_already_exists: 'That email already has an account. Sign in instead.', email_exists: 'That email already has an account. Sign in instead.', weak_password: 'Choose a longer password (at least 10 characters).', validation_failed: 'Check the email and password.', over_email_send_rate_limit: 'An email was just sent. Wait a minute and try again.', over_request_rate_limit: 'Too many tries. Wait a moment and try again.', email_address_not_authorized: "Password reset email isn't available for this address yet.", same_password: 'Choose a password different from the current one.' };
  async function api(path, { method = 'POST', body, token } = {}) {
    let r;
    try { r = await fetch(URL_ + path, { method, headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new Error("Couldn't reach the sign-in service. Check your connection."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(words[j.error_code || j.code] || j.msg || j.error_description || 'Something went wrong. Try again.'), { code: j.error_code || j.code });
    return j;
  }
  const read = () => { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } };
  const keep = s => { localStorage.setItem(STORE, JSON.stringify({ access: s.access_token, refresh: s.refresh_token, exp: Date.now() + s.expires_in * 1000, email: s.user?.email })); };
  const forget = () => localStorage.removeItem(STORE);
  async function session() {
    const s = read(); if (!s) return null;
    if (s.exp - Date.now() > 60000) return s;
    try { keep(await api('/token?grant_type=refresh_token', { body: { refresh_token: s.refresh } })); return read(); } catch { forget(); return null; }
  }
  const say = (t, bad) => { $('msg').textContent = t || ''; $('msg').className = bad ? 'bad' : t ? 'good' : ''; };
  const MODES = {
    signin: { title: 'Sign in', sub: 'Use your UnderGlow account.', go: 'Sign in', pass: 'current-password', links: [['signup', 'Create an account'], ['forgot', 'Forgot password?']] },
    signup: { title: 'Create your account', sub: 'One account for the website and the UnderGlow app.', go: 'Create my account', perks: true, pass: 'new-password', links: [['signin', 'Already have an account? Sign in']] },
    forgot: { title: 'Reset your password', sub: "We'll email you a link.", go: 'Send reset link', noPass: true, links: [['signin', 'Back to sign in']] },
    confirm: { title: 'Check your email', sub: 'Open the link we sent you to finish creating your account.', go: 'Resend email', noPass: true, links: [['signin', 'Back to sign in']] },
    recovery: { title: 'Choose a new password', sub: 'At least 10 characters.', go: 'Save password', pass: 'new-password', noEmail: true, links: [] },
  };
  let mode = 'signin';
  function show(m) {
    mode = m; const c = MODES[m]; say('');
    $('form').hidden = false; $('out').hidden = true; $('perks').hidden = !c.perks; $('next').hidden = true; $('title').textContent = c.title; $('sub').textContent = c.sub; $('go').textContent = c.go;
    $('emailRow').hidden = !!c.noEmail; $('passRow').hidden = !!c.noPass; $('password').value = ''; if (c.pass) $('password').autocomplete = c.pass;
    $('links').replaceChildren(...c.links.map(([to, text]) => { const a = document.createElement('a'); a.href = '?mode=' + to; a.textContent = text; a.onclick = e => { e.preventDefault(); history.replaceState(null, '', '?mode=' + to); show(to); }; return a; }));
    (c.noEmail ? $('password') : $('email')).focus();
  }
  function signedIn(s) {
    say(''); $('form').hidden = true; $('out').hidden = false; $('links').replaceChildren();
    $('perks').hidden = true; $('next').hidden = false; $('title').textContent = "You're in. Welcome!"; $('sub').textContent = s.email || '';
  }
  $('form').onsubmit = async e => {
    e.preventDefault(); const email = $('email').value.trim(), password = $('password').value, c = MODES[mode];
    if (!c.noEmail && !/^\S+@\S+\.\S+$/.test(email)) return say('Enter your email address.', true);
    if (!c.noPass && password.length < 10) return say('Passwords are at least 10 characters.', true);
    $('go').disabled = true; say('');
    try {
      if (mode === 'signin') { keep(await api('/token?grant_type=password', { body: { email, password } })); signedIn(read()); }
      else if (mode === 'signup') {
        const j = await api('/signup', { body: { email, password } });
        if (j.access_token) { keep(j); signedIn(read()); } else { show('confirm'); say('We sent a confirmation link to ' + email + '.'); }
      } else if (mode === 'confirm') {
        await api('/resend', { body: { type: 'signup', email } }); say('If that account still needs confirming, a new link is on its way.');
      } else if (mode === 'forgot') {
        await api('/recover', { body: { email } });
        say('If that email has an account, a reset link is on its way.');
      } else {
        const s = read(); await api('/user', { method: 'PUT', token: s.access, body: { password } });
        signedIn(s); say('Your password was changed.');
      }
    } catch (x) { if (x.code === 'email_not_confirmed') show('confirm'); say(x.message, true); } finally { $('go').disabled = false; }
  };
  $('out').onclick = async () => { const s = read(); forget(); if (s) await api('/logout', { token: s.access }).catch(() => {}); history.replaceState(null, '', '?mode=signin'); show('signin'); };
  (async () => {
    // Links in our emails: account.html?token_hash=...&type=signup|recovery. Verified here (POST), so mail scanners opening the link can't use it up.
    const q = new URLSearchParams(location.search), th = q.get('token_hash'), ty = q.get('type');
    if (th && (ty === 'signup' || ty === 'recovery')) {
      history.replaceState(null, '', location.pathname);
      try {
        keep(await api('/verify', { body: { type: ty === 'signup' ? 'email' : 'recovery', token_hash: th } }));
        if (ty === 'recovery') return show('recovery');
        signedIn(read()); return say('Your email is confirmed. You can now sign in to the UnderGlow app.');
      } catch { show(ty === 'recovery' ? 'forgot' : 'confirm'); return say(ty === 'recovery' ? 'That link has expired. Send a new one.' : 'That link has expired or was already used. Try signing in, or enter your email for a new link.', true); }
    }
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('type') === 'recovery' && h.get('access_token')) { // the link in a password reset email
      keep({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: +h.get('expires_in') || 3600, user: {} });
      history.replaceState(null, '', location.pathname); return show('recovery');
    }
    if (h.get('error_description')) { history.replaceState(null, '', location.pathname); show('forgot'); return say('That link has expired. Send a new one.', true); }
    const s = await session(); if (s) return signedIn(s);
    const m = new URLSearchParams(location.search).get('mode'); show(['signin', 'signup', 'forgot'].includes(m) ? m : 'signin');
  })();
})();
