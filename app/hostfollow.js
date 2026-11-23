// "The host follows the client": the banner (host window AND client window show the same page) and the Settings row.
// Server side: server.mjs /api/host-update/*, logic in desktop/hostfollow.cjs. Plain words only; nothing here ever stops work, the server saves sessions first.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const H = { 'Content-Type': 'application/json', 'X-Foreman': '1' };
  const post = (p, b) => fetch('/api/host-update/' + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }).then(r => r.json());
  // The text for the banner from a status reply (seconds are recounted here every second so the countdown moves smoothly).
  function bannerText(st, nowMs) {
    if (!st || !st.ui) return null;
    if (st.phase === 'countdown' && st.endsAt) { const s = Math.max(0, Math.ceil((st.endsAt - (st.now + (nowMs - st._got))) / 1000)); return { ...st.ui, title: 'Updating to ' + st.target + ' in ' + s + ' s' }; }
    return ['checking', 'countdown', 'updating', 'failed'].includes(st.phase) ? st.ui : null;
  }
  const api = { bannerText, esc };
  if (typeof document === 'undefined') { if (typeof module !== 'undefined') module.exports = api; return; }
  window.FmHostFollow = api;
  let st = null, box = null, hideFailed = '', fast = 0;
  function draw() {
    const b = bannerText(st, Date.now());
    if (b && st.phase === 'failed' && hideFailed === st.target) return void (box && (box.style.display = 'none'));
    if (!box) { box = document.createElement('div'); box.id = 'hostFollowBar'; box.setAttribute('role', 'alert');
      box.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;max-width:min(640px,92vw);padding:12px 16px;border-radius:12px;background:rgba(24,26,32,.94);color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.18);font:13px/1.45 system-ui,sans-serif;gap:6px;display:none';
      document.body.append(box); }
    if (!b) { box.style.display = 'none'; return; }
    box.style.display = 'grid'; box.style.borderColor = b.kind === 'bad' ? '#e5484d' : b.kind === 'warn' ? '#f5a623' : 'rgba(255,255,255,.18)';
    const bar = st.phase === 'countdown' && st.endsAt ? '<div style="height:3px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden"><i style="display:block;height:100%;width:' + Math.max(0, Math.min(100, (st.endsAt - (st.now + (Date.now() - st._got))) / (st.total || 120000) * 100)) + '%;background:#f5a623"></i></div>' : st.phase === 'checking' || st.phase === 'updating' ? '<div style="height:3px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden"><i style="display:block;height:100%;width:35%;background:#5b8def;animation:hfslide 1.6s ease-in-out infinite"></i></div><style>@keyframes hfslide{0%{margin-left:-35%}100%{margin-left:100%}}</style>' : '';
    const btns = st.phase === 'countdown' ? '<button data-a="go">Update now</button><button data-a="postpone">Not now</button>' : st.phase === 'checking' ? '<button data-a="postpone">Not now</button>' : st.phase === 'failed' ? '<button data-a="hide">OK</button>' : '';
    box.innerHTML = '<b style="font-size:14px">' + esc(b.title) + '</b><span style="opacity:.85">' + esc(b.text) + '</span>' + bar + (btns ? '<div style="display:flex;gap:8px;margin-top:4px">' + btns + '</div>' : '');
    for (const x of box.querySelectorAll('button')) { x.style.cssText = 'padding:5px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;cursor:pointer'; x.onclick = () => { if (x.dataset.a === 'hide') { hideFailed = st.target; draw(); } else post(x.dataset.a).then(poll).catch(() => {}); }; }
  }
  let t0 = 0;
  async function poll() {
    try { const r = await fetch('/api/host-update/status', { cache: 'no-store' }); if (!r.ok) throw 0; const j = await r.json(); j._got = Date.now();
      if (j.phase === 'countdown' && j.endsAt && (!st || st.phase !== 'countdown' || st.target !== j.target)) t0 = j.endsAt - j.now; j.total = t0 || 120000; st = j; } catch { /* host restarting: keep what is shown */ }
    draw();
  }
  if (document.readyState !== 'loading') start(); else addEventListener('DOMContentLoaded', start);
  function start() { poll(); setInterval(() => { if (st && ['checking', 'countdown', 'updating'].includes(st.phase) || fast > 0) { fast--; poll(); } else if (Date.now() % 10000 < 1000) poll(); else draw(); }, 1000); }

  // ---- Settings → This device: automatic host updates + Update host now ----
  window.FmHostFollowSettings = function mount(el) {
    const row = document.createElement('div');
    row.innerHTML = '<label class="sg-row"><span><b>Update the host automatically</b><span class="sa-dim">When a linked computer is updated to a newer version, the host computer updates to the same version by itself, so they never run different versions. The host counts down first (longer if agents are working), saves every agent and bot session, and never starts anything by itself afterwards. If the update does not work it goes back to the version that was working. Off: you update the host yourself.</span></span><input type="checkbox" class="sg-sw" role="switch" checked></label>'
      + '<div class="sg-row"><span><b>Update host now</b><span class="sa-dim" id="hfNowMsg">Matches the host to the newest version a linked computer is on.</span></span><button class="sg-btn" id="hfNow" type="button">Update host now</button></div>';
    el.append(row); const cb = row.querySelector('input'), btn = row.querySelector('#hfNow'), msg = row.querySelector('#hfNowMsg');
    fetch('/api/host-update/settings').then(r => r.json()).then(j => { cb.checked = j.on !== false; }).catch(() => {});
    cb.onchange = () => post('settings', { on: cb.checked }).then(j => { cb.checked = j.on !== false; }).catch(() => { cb.checked = !cb.checked; });
    btn.onclick = () => { btn.disabled = true; post('now').then(j => { msg.textContent = j.ok ? 'Getting ' + j.target + ' ready. A countdown shows at the top.' : (j.error || 'Nothing to update.'); fast = 30; poll(); }).catch(() => { msg.textContent = 'Could not reach the host.'; }).finally(() => { btn.disabled = false; }); };
  };
})();
