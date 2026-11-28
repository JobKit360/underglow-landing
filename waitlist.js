(() => {
  const BASE = 'https://ncqgxouiekxpiqxnmdwo.supabase.co/rest/v1/';
  const KEY = 'sb_publishable_LCj5aMTnYa_i92t-gcL7cg_p8viWvyO';
  const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  const q = new URLSearchParams(location.search);
  const source = (q.get('utm_source') || q.get('ref') || document.referrer.split('/')[2] || 'direct').slice(0, 80);
  const variant = window.UG_VARIANT || '-';

  // One page view per visit (per tab session), to measure conversion by headline and source. No cookies, no personal data.
  try {
    if (!sessionStorage.getItem('ug_pv')) {
      sessionStorage.setItem('ug_pv', '1');
      fetch(BASE + 'page_views', { method: 'POST', keepalive: true, headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ variant, source, mobile: innerWidth < 760 }) }).catch(() => {});
    }
  } catch {}

  // Social proof: show the count only once it is worth showing.
  fetch(BASE + 'rpc/waitlist_count', { method: 'POST', headers: H, body: '{}' }).then((r) => r.json()).then((n) => {
    if (typeof n === 'number' && n >= 25) document.querySelectorAll('[data-wlcount]').forEach((el) => { el.textContent = 'Join ' + n.toLocaleString() + ' people already on the list.'; el.hidden = false; });
  }).catch(() => {});

  document.querySelectorAll('form[data-wl]').forEach((f) => {
    const msg = f.querySelector('.wlmsg') || f.querySelector('#wlmsg');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = new FormData(f);
      if (d.get('website')) return;
      const email = String(d.get('email') || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = 'Please enter a valid email.'; return; }
      const btn = f.querySelector('button'); btn.disabled = true; msg.textContent = 'Saving...';
      try {
        const r = await fetch(BASE + 'waitlist', { method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
          body: JSON.stringify({ email, would_pay: d.get('would_pay') || null, tool: (d.get('tool') || '').trim() || null, source: source + '|v' + variant }) });
        if (r.ok || r.status === 409) {
          document.querySelectorAll('form[data-wl]').forEach((x) => { x.innerHTML = '<p style="text-align:center;font-size:1.15em">You are on the list. We will email you when your spot opens.</p>'; });
        } else { msg.textContent = 'Something went wrong. Please try again.'; btn.disabled = false; }
      } catch { msg.textContent = 'Network problem. Please try again.'; btn.disabled = false; }
    });
  });
})();
