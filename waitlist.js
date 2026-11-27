(() => {
  const URL_ = 'https://ncqgxouiekxpiqxnmdwo.supabase.co/rest/v1/waitlist';
  const KEY = 'sb_publishable_LCj5aMTnYa_i92t-gcL7cg_p8viWvyO';
  const f = document.getElementById('wl'); if (!f) return;
  const msg = document.getElementById('wlmsg');
  const q = new URLSearchParams(location.search);
  const source = (q.get('utm_source') || q.get('ref') || document.referrer.split('/')[2] || 'direct').slice(0, 100);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    if (d.get('website')) return;
    const email = String(d.get('email') || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = 'Please enter a valid email.'; return; }
    const btn = f.querySelector('button'); btn.disabled = true; msg.textContent = 'Saving...';
    try {
      const r = await fetch(URL_, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ email, would_pay: d.get('would_pay') || null, tool: (d.get('tool') || '').trim() || null, source }) });
      if (r.ok || r.status === 409) { f.innerHTML = '<p style="text-align:center;font-size:1.2em">You are on the list. We will email you when your spot opens.</p>'; }
      else { msg.textContent = 'Something went wrong. Please try again.'; btn.disabled = false; }
    } catch { msg.textContent = 'Network problem. Please try again.'; btn.disabled = false; }
  });
})();
